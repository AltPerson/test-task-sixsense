# Implementation plan

Work top to bottom. Complete one task at a time. Optional tasks stay blocked until core is green.

## T0 — Baseline and scaffold
Status: DONE

Goal: create the smallest frontend foundation without touching backend code.

Work:
- create `frontend/` Next.js App Router + TypeScript + Tailwind;
- add TanStack Query/Table/Virtual and Radix components only as needed;
- add Vitest + Testing Library;
- add OpenAPI type generation from `../backend/openapi.json`;
- create env example with server-only backend base URL;
- create provider/layout shell;
- ensure `.gitignore` covers frontend artifacts (`node_modules`, `.next`, coverage, build output);
- copy this harness into repository root if it is not already there.

Acceptance:
- frontend dev server starts;
- generated API types are reproducible by command;
- lint/typecheck/test/build commands exist;
- no backend files changed.

Suggested commit: `chore: scaffold frontend and api types`

---

## T1 — BFF session/auth foundation
Status: DONE

Read: `docs/ARCHITECTURE.md` (Session store, Backend client), `docs/API_NOTES.md` (Auth)

Work:
- server-only SessionStore with random opaque `sid`;
- secure HttpOnly cookie helpers;
- server backend client;
- single-flight refresh per app session;
- login/logout/me BFF routes;
- normalize backend/domain/validation/network errors;
- parse Retry-After as either integer seconds or HTTP-date.

Acceptance:
- successful login stores tokens only server-side and browser gets only opaque sid cookie;
- `/api/me` works after login;
- concurrent backend calls near access expiry share one refresh;
- auth failure clears local session;
- backend tokens do not appear in browser response payloads or cookie value;
- unit test covers refresh single-flight OR BFF token non-leak behavior.

Human review gate: inspect auth/session implementation, browser-visible responses/cookies, and refresh concurrency before T2.

Suggested commit: `feat: add server-side session bff`

---

## T2 — Sign-in screen and authenticated shell
Status: TODO

Work:
- sign-in form with email/password;
- pending, invalid credentials, rate-limited states;
- optional demo-account affordance without auto-submitting secrets;
- authenticated shell with current user/role and logout;
- route protection via server/session boundary.

Acceptance:
- analyst and observer can sign in;
- failed login is understandable;
- login 429 displays wait/retry timing derived from HTTP-date Retry-After;
- logout revokes backend family where possible and always clears local session;
- no backend token is visible in client-side state/network responses.

Suggested commit: `feat: implement secure sign in flow`

---

## T3 — Metadata-driven, deep-linkable search builder
Status: TODO

Read: `docs/API_NOTES.md` (Sensors, Metadata, Search create), `docs/ARCHITECTURE.md` (Search builder, URL strategy)

Work:
- fetch profile, sensors, fields, columns;
- show all sensors and lock unreadable ones;
- time-window controls;
- flat AND condition builder driven by FieldDef metadata;
- operator-specific value controls;
- safe conversion to SearchCreate filter;
- define a deterministic, versionable URL serialization for the reproducible search definition;
- hydrate the form/query state from the URL on load;
- update/copy a shareable search URL without including backend search job id, credentials, or tokens;
- optionally add debounced estimate only after form is reliable.

Minimum URL state to preserve when present:
- time range;
- selected readable sensors;
- filter conditions and their operators/values;
- requested supported sort when applicable.

Acceptance:
- no client hardcoded field catalogue is required to build filters;
- changing field changes available operators from metadata;
- `exists` sends no value; `between` sends exactly two values;
- enum controls use server values; enum labels use `enum_name` route where useful;
- locked observer sensor is visible and cannot be selected;
- invalid local input blocks submit with a useful message;
- a copied search URL reopened in a fresh tab reconstructs the intended search definition;
- serialization is deterministic and rejects malformed/unsupported URL state safely;
- no ephemeral job id is required to reconstruct the hunt.

Suggested commit: `feat: add metadata driven search builder`

---

## T4 — Search job orchestration and resilience
Status: TODO

Read: `AGENTS.md` search invariants, `docs/API_NOTES.md` Search create/polling/results

Work:
- create search through BFF with stable Idempotency-Key per logical submission;
- safe 503 retry using same key;
- poll Search progress while non-terminal;
- show queued/running/done/failed/cancelled;
- show `capture_gap` / `sensor_lagging` warnings;
- DELETE/cancel affordance to free backend search slot;
- handle 429 max-active-search state;
- ensure submitting a hydrated search URL creates a fresh backend search from the serialized definition rather than assuming a previous job still exists.

Acceptance:
- a post-commit 503 cannot create a duplicate logical search;
- progress is visible while running;
- failed search terminates spinner and explains failure;
- cancel/new-search workflow frees slots intentionally;
- 410 expired search offers a clear path to rerun;
- a shared/reopened hunt URL can be rerun even after the original backend job expired.

Human review gate: inspect Idempotency-Key lifetime/reuse, retry behavior, cancellation, and fresh-job recreation from a deep link before T5.

Suggested commit: `feat: orchestrate asynchronous searches`

---

## T5 — Progressive paged results + virtualized table + investigation pivots
Status: TODO

Read: `docs/ARCHITECTURE.md` Search state model / Results table / Investigation pivots

Work:
- implement pure progressive-result accumulator/state machine;
- page immediately while search is running;
- handle caught-up (`null + incomplete`) by polling same tail cursor;
- dedupe repeated tail rows by string session id;
- consume metadata column order/visibility/width/sortability;
- fallback unknown column types to text;
- TanStack Table + Virtual;
- sticky header and usable dense row layout;
- alternate server sorting only after job is `done`;
- make row/session navigation preserve a stable `/sessions/{id}` destination;
- add cheap analyst pivots from useful row values (at least source IP and destination IP) into a new/reconstructed search URL when metadata supports those fields.

Acceptance:
- rows appear before search completion;
- new rows continue to appear after a caught-up response;
- no duplicate visible rows from repeated tail fetches;
- thousands of loaded rows do not create thousands of DOM rows;
- unknown column type does not break render;
- clicking sortable columns while running does not send invalid backend sort;
- after done, server sort resets paging and returns globally sorted rows;
- unit test explicitly covers caught-up tail + duplicate merge + later continuation;
- a reviewer can pivot from a source/destination value into a reproducible host-focused search without manually rebuilding every condition;
- row/session links never coerce a session id to number.

Suggested commit: `feat: stream paged search results into virtual table`

---

## T6 — Session detail and protocol rendering
Status: TODO

Read: `docs/ARCHITECTURE.md` Session detail, `docs/API_NOTES.md` Session detail

Work:
- route `/sessions/[sessionId]`;
- top-level flow summary;
- detections/risk/files/pcap state sections where data exists;
- dedicated DNS renderer tolerant of decoder v1/v2;
- generic schema-driven renderer for every other protocol;
- undeclared-field detection;
- redacted-value presentation;
- optional raw JSON disclosure as secondary view;
- expose obvious investigation pivots back to host/time/protocol searches where they can be generated from displayed evidence.

Acceptance:
- session id stays a string end-to-end;
- DNS legacy and canonical shapes are both readable;
- unknown/undeclared decoded fields remain visible;
- redacted values are not rendered as `[object Object]`;
- generic renderer works without protocol-specific hardcoding for remaining protocols;
- 403/404 states are explicit;
- copying `/sessions/{id}` gives a stable README-worthy evidence link;
- a user can return/pivot from a session to a reproducible search without depending on browser history alone.

Suggested commit: `feat: add schema driven session inspector`

---

## T7 — Cross-cutting hardening + tests
Status: TODO

Work:
- audit loading/empty/error states;
- bounded GET retries with Retry-After;
- recovery for dropped/truncated requests;
- keyboard/focus/label pass on forms/dialogs;
- remove accidental logs;
- run analyzer for client/server import leaks;
- verify copied search URLs hydrate correctly after a fresh page load;
- add at least one more meaningful test if coverage is too narrow.

High-value tests, in priority order:
1. progressive result accumulator caught-up semantics;
2. refresh single-flight prevents refresh-token reuse;
3. BFF login never serializes backend tokens to browser;
4. search URL encode/decode round-trip and malformed-state rejection;
5. generic protocol renderer handles redaction + undeclared fields.

Acceptance:
- lint, typecheck, tests and production build pass;
- manual HAR inspection shows no backend access/refresh token;
- no indefinite spinner on terminal/network failure;
- no authored `any` without justification;
- copied search link works in a clean/fresh browser tab and can launch a fresh job;
- stable session links work directly.

Human review gate: run the app manually, inspect HAR/token safety, verify deep links in a fresh tab, and explicitly approve starting T8.

Suggested commit: `test: cover search and auth edge cases`

---

## T8 — Manual forensic investigation through the UI
Status: BLOCKED until T1–T7 are complete

Read: `docs/INVESTIGATION.md`

Hard rule: once T8 begins, do not inspect backend source, backend tests, fixtures, samples, world state, generators, or incident-related code to discover/confirm the answer.

Goal: use the product as an analyst and produce a reproducible, defensible finding rather than guessing from one suspicious-looking row.

Work:
- run the actual frontend and investigate through it;
- start broad enough to understand normal traffic, then narrow by host/protocol/time;
- use chronology and cross-protocol correlation rather than a single "weird" event;
- record hypotheses, evidence, and false leads in the investigation log template;
- pivot around candidate source/destination hosts using the UI/deep links;
- identify the compromised machine and the earliest defensible suspicious point/sequence visible through the interface;
- open at least one representative/decisive session;
- save a reproducible search URL and stable `/sessions/{id}` evidence URL;
- explicitly record at least one suspicious-but-benign lead that was ruled out and why.

Acceptance:
- the finding was derived from UI/API-visible evidence only;
- notes identify the compromised host;
- notes identify an approximate first suspicious timestamp or earliest evidence point that can be defended from the UI;
- evidence includes a reproducible search deep link that does not depend on an unexpired job id;
- evidence includes at least one stable session link;
- reasoning uses correlation/sequence, not merely "this looked weird";
- at least one plausible false lead is documented and ruled out with a concrete reason;
- no forbidden backend files were inspected during T8;
- the human can explain the investigation path without relying on AI-generated hidden knowledge.

Human review gate: the human owns the forensic conclusion and must be able to explain the evidence path before T9.

Suggested commit: `docs: document forensic finding`

---

## T9 — README and final review
Status: TODO

Read: `docs/README_CHECKLIST.md`, `docs/INVESTIGATION.md`

Work:
- extend the supplied repository `README.md` rather than replacing it;
- exact run instructions for backend + frontend;
- implemented scope;
- deliberately omitted scope and why;
- architecture/security notes;
- tests and commands, including at least one meaningful test the reviewer can point at;
- forensic finding from T8 with reproducible hunt link and stable session link;
- concise explanation of how the finding was reached and what plausible false lead was ruled out;
- honest AI-use disclosure: where AI helped and what was reviewed/fixed/decided manually;
- API observations section distinguishing unusual-but-supported behavior from genuine ambiguity/problem;
- note in-memory session-store tradeoff if used;
- final diff and commit-history review.

Acceptance:
- a reviewer can clone, run, sign in and test without guessing;
- README makes tradeoffs explicit rather than apologetic;
- forensic links are reproducible in the locally running app;
- AI disclosure is specific and honest, not generic "AI was used" boilerplate;
- API observations state evidence/impact/client handling and do not overclaim bugs;
- optional unfinished features are not half-present in the UI;
- all quality gates pass from a clean install;
- commit history tells a coherent implementation story.

Human review gate: final clean-install/run check, README review, `git diff`, and commit-history review before submission.

Suggested commit: `docs: finalize test task`

---

# Optional backlog — only after core is complete
- SSE live detections
- WebSocket live tap
- PCAP/file downloads respecting permissions
- saved hunts/queries
- richer nested boolean query builder

URL-serialized search definitions are **not optional**; they are core because the README requires a link back to the investigation spot.
