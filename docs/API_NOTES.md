# API notes — distilled contract

This is a working note, not a replacement for `backend/openapi.json`.
Update it only after verifying the API/OpenAPI/tests.

## Global
- API base: `http://localhost:8700` by default.
- CORS is intentionally disabled; browser calls must go through the frontend server/BFF.
- Optional response fields can be absent rather than `null`.
- Times are ISO-8601 UTC with milliseconds.
- Session IDs are uint64 decimal **strings**, often larger than `2**53`.
- Domain errors use `{ detail: string, code: string, ...extra }`.
- FastAPI request-validation 422 uses `{ detail: ValidationIssue[] }`.
- Some documented 422 endpoints can return either shape.

## Auth
Accounts:
- analyst: `ana@quillmere.example` / `demo-analyst`
- observer: `oli@quillmere.example` / `demo-observer`

`POST /v1/auth/login`
- returns access + refresh + profile;
- access token default TTL 90s;
- after repeated bad attempts returns 429 `login_rate_limited`;
- login `Retry-After` is an HTTP-date.

`POST /v1/auth/refresh`
- refresh token is single-use;
- zero grace;
- reusing a consumed refresh token revokes the whole session (`refresh_reused`);
- therefore BFF refresh MUST be single-flight per app session.

`POST /v1/auth/logout`
- idempotent for the authenticated token family;
- revoke local app session too.

`GET /v1/me`
- profile includes `permissions` and readable `sensor_ids`.

## Sensors
`GET /v1/sensors`
- returns every sensor, including unreadable sensors;
- use `/v1/me.sensor_ids` to mark readable vs locked;
- do not hide locked sensors;
- `last_packet_at` is canonical timestamp;
- `last_packet_local` is legacy display text; do not parse it as canonical time.

## Metadata
`GET /v1/meta/fields`
- source of truth for filter UI;
- field has type, allowed operators, optional enum, optional enum_name, pattern, example.

`GET /v1/meta/columns`
- source of truth for result-table initial columns;
- at least one column intentionally has an undocumented type (`geo_hint`);
- unknown types must render as text;
- some columns default hidden.

`GET /v1/meta/enums/{name}`
- do not guess route name from field name; use `enum_name` when present;
- first `country` enum call for a token family can return 503 `catalog_warming`, `Retry-After: 2`.

`GET /v1/meta/schema/{protocol}`
- declared decoded fields for both decoder generations;
- decoder may emit undeclared fields (e.g. API docs mention `tls.ja4`);
- generic UI must still show undeclared fields.

Protocols: `dns`, `http`, `tls`, `smtp`, `smb2`, `ssh`, `ntp`, `tcp`.

## Search create
`POST /v1/searches`
- returns 202 and Search; replay can return 200 + `Idempotent-Replayed: true`;
- send `Idempotency-Key`;
- 503 may happen before commit OR after commit;
- retry the same logical submission with the same idempotency key;
- max three active searches per user;
- a done search still consumes a slot until DELETE/expiry;
- `DELETE /v1/searches/{id}` frees the slot and is idempotent.

Search states: `queued`, `running`, `done`, `failed`, `cancelled`.
Warnings: `capture_gap`, `sensor_lagging`.

Search validation examples:
- unreadable sensor -> 403 `forbidden_sensor`;
- unknown sensor -> 422 `unknown_sensor` with location context;
- unknown field / invalid operator -> 422 domain error;
- inverted/invalid window -> 400 `bad_range`.

## Search polling
`GET /v1/searches/{id}`
- poll for progress;
- reading resets 10-minute idle timer;
- expired idle search -> 410 `search_expired`.

Progress provides scanned sessions, estimated total, matched count, estimate flag, percent.

## Search results
`GET /v1/searches/{id}/results`
- default limit 200, max/effective 500;
- result order while scanning is newest first (`-ts`);
- opaque cursors are bound to search and ordering;
- invalid/tampered cursor -> 400;
- alternative sorting while search is not done -> 409 `search_running`;
- global alternate sort must be done by the backend after state `done`.

Crucial meanings:
- `next_cursor != null`: page forward now;
- `next_cursor == null && complete == false`: caught up, ask again later;
- `complete == true`: final end.

When caught up, querying the same tail cursor later may repeat existing tail rows and add new rows. Merge by string session id.

## Session detail
`GET /v1/sessions/{session_id}`
- full row + decoded payload + detections + files + pcap state;
- `decoded` shape depends on sensor decoder;
- harbor branch uses legacy v1 shape: numbers may be strings, single-item arrays may collapse, omitted `false` booleans;
- other sensors use canonical v2 shape;
- observer can receive `{ "redacted": true }` in place of sensitive values;
- malformed session id intentionally returns 404, not validation 422.
- session retrieval is independent of a temporary search job; a real-backend session deep link remained readable after the originating job was explicitly released.

## Resilience / chaos
The simulator can produce:
- bounded latency;
- 503 with Retry-After;
- dropped/truncated responses;
- failed search scans;
- expiring access tokens.

The UI should fail visibly and recoverably instead of spinning forever.
