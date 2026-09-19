# Architecture

## Shape

```text
repo/
├─ backend/                     # supplied, read-only
├─ frontend/
│  ├─ src/
│  │  ├─ app/
│  │  │  ├─ (auth)/login/
│  │  │  ├─ (app)/search/
│  │  │  ├─ (app)/sessions/[sessionId]/
│  │  │  └─ api/               # explicit BFF route handlers
│  │  ├─ features/
│  │  │  ├─ auth/
│  │  │  ├─ search/
│  │  │  └─ session/
│  │  ├─ components/
│  │  ├─ lib/
│  │  │  ├─ api/generated.ts   # generated from backend/openapi.json
│  │  │  ├─ errors/
│  │  │  └─ format/
│  │  └─ server/
│  │     ├─ backend-client/
│  │     └─ session/
│  └─ tests/
├─ AGENTS.md
└─ docs/
```

The exact folders may move if the implementation proves another shape clearer. Preserve the boundaries: browser feature code, BFF/server code, generated API contract, and pure helpers.

## Request flow

```text
Browser
  │ opaque sid cookie only
  ▼
Next.js route handler / BFF
  │ resolve sid in server SessionStore
  │ attach backend Bearer access token
  │ refresh single-flight when needed
  ▼
Capture API :8700
```

Do not expose a generic unrestricted reverse proxy. Prefer explicit route handlers or an allowlisted proxy helper so future backend endpoints are not accidentally browser-accessible.

## Session store

Define an interface so the test-task implementation is explicit about its tradeoff:

```ts
interface SessionStore {
  create(tokensAndProfile): Promise<string>; // returns random sid
  get(sid: string): Promise<SessionRecord | null>;
  update(sid: string, record: SessionRecord): Promise<void>;
  delete(sid: string): Promise<void>;
  withRefreshLock<T>(sid: string, fn: () => Promise<T>): Promise<T>;
}
```

For a one-day local test task, an in-memory implementation is acceptable if README states that it is single-process/local-dev storage and would be replaced by Redis/database-backed sessions in a horizontally scaled deployment.

Do not put access/refresh tokens in cookies, localStorage, sessionStorage, React state, TanStack Query data, URL params, or browser responses.

## Backend client

One server-only backend client owns:
- base URL;
- Authorization header;
- response parsing;
- 401 refresh flow;
- retry-after parsing;
- typed domain error conversion;
- bounded retry policy.

Do not duplicate refresh logic across route handlers.

## Search state model

Separate these concerns:

1. **Search definition** — sensors, window, filter, requested sort.
2. **Search job state** — id, queued/running/done/failed, progress, warnings.
3. **Progressive result accumulator** — rows keyed by string session id, ordered list, current paging cursor, caught-up request cursor, complete flag.
4. **Table view state** — visibility, server sort, virtual scroll.

### Progressive paging algorithm

Maintain:
- `rowsById` / ordered IDs to dedupe;
- `requestCursor`: cursor used for the current request;
- `nextCursor` returned by API;
- `caughtUpCursor`: cursor that produced `next_cursor=null, complete=false`.

Algorithm:
1. Start with `requestCursor = null`.
2. Fetch page.
3. Merge rows by string id, preserving server order.
4. If `next_cursor` exists, set `requestCursor = next_cursor` and fetch the next page.
5. If `next_cursor` is null and `complete=false`, save the cursor used for this request as `caughtUpCursor`; after a short interval, fetch again using that same cursor.
6. The repeat may contain rows already seen. Dedupe them.
7. If the repeated tail now returns a `next_cursor`, continue normal pagination from it.
8. Stop result polling only when `complete=true` or job state is terminal and final tail has been fetched.

This deserves a pure state-machine/helper and a unit test.

## Sorting

Backend default scan order is `-ts`. While queued/running, only this order is valid.
After `done`, a sortable column can request a backend sort (`ts`, `-ts`, `bytes`, `-bytes`, `risk`, `-risk`). Changing server sort resets result pages/accumulator and fetches from the beginning.

Do not fake client-side sorting of only loaded rows and present it as global sorting.

## Search builder

Build field/operator/value controls from `/v1/meta/fields`.
A pragmatic core implementation may support a flat AND list rather than an arbitrary nested boolean editor, provided it uses the server field metadata and emits a valid `{ all: [...] }` filter.

Value editor derives from field type and operator:
- `exists`: no value control;
- `between`: two values;
- enum/country/sensor: select/combobox from server-published values;
- numeric/port/bytes/duration: numeric input with appropriate parsing;
- ip/cidr/string/ja3: text input with metadata example/pattern hints.

Sensors come from `/v1/sensors`; readability comes from `/v1/me.sensor_ids`. Show unreadable sensors as locked, not hidden.

Estimate is a useful enhancement after core builder works. Debounce to remain below 4 requests/sec.

## Results table

Use server `/v1/meta/columns` for initial order, visibility, sortability, and width hints.
Unknown column `type` values render as text.

Use TanStack Table + TanStack Virtual so DOM row count remains bounded even after thousands of accumulated results.
Recommended UX:
- sticky header;
- compact fixed-ish row height;
- summary column gets the flexible width;
- source/destination remain scannable;
- visible search progress above the table;
- distinguish "caught up, search still running" from "search complete";
- preserve selected/visited row identity by string id.

## Session detail

Top-level summary should make the flow understandable without reading JSON:
- source -> destination;
- protocol/transport;
- start/end/duration;
- bytes/packets;
- risk and reasons;
- sensor/decoder;
- detections/files/pcap availability if present.

Dedicated renderer: DNS by default.
Generic renderer:
1. fetch protocol schema;
2. read declared dotted paths from `decoded`;
3. render declared values with schema title/type/unit/sensitive metadata;
4. recursively discover decoded paths not declared by schema;
5. show those under an "Undeclared fields" subsection;
6. render redacted sentinel clearly;
7. tolerate legacy v1 stringified numbers/collapsed structures.

## URL strategy

Investigation state is a core product requirement, not an optional enhancement.

Stable evidence:
- session detail uses `/sessions/{string-id}` and is suitable for direct README evidence links;
- search URLs encode the reproducible search definition rather than an ephemeral backend search job id.

At minimum, serialize when present:
- time range;
- selected readable sensors;
- filter conditions/operators/values;
- supported requested sort.

The exact representation can be readable query params or a single versioned encoded `q` parameter. Whichever is chosen must be deterministic, validated on decode, safe to copy into a fresh tab, and must never contain credentials or tokens.

Hydrating a search URL reconstructs the search form/query definition. Executing it creates a fresh backend job, so a README hunt link remains useful after the original backend job's idle expiry.

Do not make the forensic README link depend only on an ephemeral search job id that expires after ten minutes.

## Investigation pivots

The required forensic exercise should be possible through the UI without manually rebuilding every query. Keep pivots narrow and high-value rather than building a full SIEM.

Core pivots:
- source IP -> search definition focused on that host;
- destination IP -> search definition focused on that host;
- session detail -> relevant host/time/protocol search where the metadata contract makes it straightforward;
- current search -> copy/share reproducible URL;
- result row -> stable session URL.

Pivot construction should use the same metadata-aware search model and URL encoder as the main builder. Do not invent hidden filter syntax. Preserve enough chronological context to inspect what happened immediately before/after a suspicious session.
