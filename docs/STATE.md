# Current state

Keep this file short. Replace stale facts instead of appending a diary.

## Repository baseline
- Supplied backend exists under `backend/` and is considered read-only.
- No frontend implementation was present in the submitted archive at harness creation time.
- Product asks for three core screens: Sign in, Search, Session.
- Backend CORS is intentionally disabled, requiring a BFF/proxy.
- Final submission must use the built UI to identify the compromised machine and link README evidence back into the interface.

## Chosen architecture
- Frontend target: Next.js App Router + TypeScript in `frontend/`.
- Browser authentication: opaque app-session cookie only.
- Backend tokens: process-global in-memory SessionStore only; multi-instance deployments require a shared store.
- Search UI: metadata-driven filter builder, URL-reproducible search definition, progressive paging, virtualized table.
- Investigation UX: stable string-ID session links plus lightweight source/destination pivots with reproducible search context.
- Dedicated protocol view: DNS unless explicitly changed.

## Human-control rules
- Git staging/commits/push/remotes are human-owned; the agent leaves verified work uncommitted and suggests a commit message.
- Mandatory human review gates apply after T1, T4, T7, during T8, and after T9.

## Forensic boundary
- Do not use backend world/incident/generator/tests to discover the answer.
- During T8, all backend source/tests are off-limits; investigate through the application only.

## Active task
T9 implementation complete - final README and release verification awaiting the mandatory human submission review.

## Known blockers
- Docker startup is not currently usable because the Docker Desktop engine is unavailable. Independently, `backend/Dockerfile` and the backend package metadata reference the missing supplied `backend/README.md`, so both the image build and a normal project install remain defective without changing supplied backend files.
- The supplied backend is runnable unchanged with the verified local workaround below. Multi-instance production auth would still require a shared session store such as Redis.

## Verified local real-backend workflow
- Environment: Python 3.13.5, uv 0.11.28, Node.js 24.4.1, npm 11.4.2, Docker CLI 29.4.1, Docker Compose 5.1.3.
- Backend setup from `backend/`: `python -m uv sync --locked --no-dev --no-install-project`.
- Backend start from `backend/`: set `$env:PYTHONPATH=(Resolve-Path 'src').Path`, then run `.\.venv\Scripts\python.exe -m capture_api serve`.
- Frontend start from `frontend/`: set `$env:BACKEND_BASE_URL='http://127.0.0.1:8700'`, then run `npm run dev -- --hostname 127.0.0.1 --port 3000`.
- The workaround skips installing the backend project package and imports it from `src`; it does not modify supplied backend files.

## Verification status
- API type generation: reproducible from `backend/openapi.json`
- dev server: HTTP 200 with application shell
- lint: passing
- typecheck: passing
- tests: 131 passing, including bounded GET retry/recovery, strict post-login return-target validation, missing/stale-cookie deep-link preservation, session BFF validation, large string IDs, DNS legacy/canonical rendering, generic schema fields, stale-detail isolation, progressive results, idempotency recovery, lifecycle races, and URL navigation
- build: passing
- Direct supplied-backend smoke: health, login, profile, sensors, fields, columns, enum, logout, and post-logout rejection passed; observed 200, 204, 401, 404, 422, and recoverable 503 with `Retry-After`.
- Real-backend refresh: two consecutive access expiries under `CAP_ACCESS_TTL_S=15` each produced exactly one successful refresh; parallel authenticated requests then succeeded, confirming single-flight refresh and rotated refresh-token persistence.
- Real browser auth: anonymous route protection, analyst and observer login, role/profile display, logout invalidation, and account-switch cache isolation passed against the supplied backend.
- Real browser authorization: observer sees two readable sensors and one visible disabled/locked sensor; analyst sees all three readable sensors.
- Real browser search builder: 29 fields, 14 columns, capture-aware defaults, country enum 503/retry/200, local sensor validation, permalink fresh-tab reconstruction, Back/Forward, and malformed `q` recovery passed without creating a search job.
- Browser network inspection: client traffic used same-origin `/api/...` BFF routes; login response exposed only the user profile, the browser held only an opaque `sid`, and no backend access or refresh token appeared in inspected responses or browser storage.
- Mock-only deterministic coverage remains for invalid credentials, HTTP-date login throttling, rare error shapes, and refresh concurrency. Real search 403 and expired-search 410 responses were not deliberately provoked.
- T4 mock verification: post-commit 503, network ambiguity, create timeout, stable key/exact-body reuse across automatic and manual recovery, unresolved-submission replacement guards, non-retry 403/422/429 creation errors, bounded 429/503 polling, cleanup retry, overlapping create suppression, late-response cleanup, rejected best-effort unmount cleanup, failed state, and 410 rerun guidance passed.
- T4 real browser verification: one search moved from queued through running to done, polling stopped at done, `sensor_lagging` rendered, the retained slot was released with DELETE, and rerunning the same deep link created a fresh job without exposing a job id in the URL.
- T4 real API verification: repeating one idempotency key returned 200 with `Idempotent-Replayed: true` and the same search id; three retained searches filled the documented limit, a fourth returned 429, and all three were explicitly deleted.
- Unresolved submissions are retained only in the mounted browser workspace. A retry uses the original key and exact serialized body; abandoning one permits a genuinely new submission and key. Reload, navigation away, tab closure, network failure, or process termination can lose an unresolved key or prevent best-effort DELETE, so slot cleanup is not guaranteed without a returned job id.
- T5 mock verification: cursor progression, caught-up tail rechecking, a fresh bounded tail budget after transition to `done`, explicit incomplete-results recovery, manual continuation/deduplication, final completion, 64-bit string-ID deduplication, 409 sort recovery, stale responses across jobs, malformed/redacted/legacy value rendering, redacted-pivot suppression, host-pivot serialization, and result-query cancellation passed. Accumulation stops at a documented 25,000-row client safety limit.
- T5 real browser verification: a review smoke search loaded 3,252 rows through progressive cursor pages, reached `done`, showed the non-interactive session-detail placeholder with string IDs, and rendered only a virtualized subset of rows. Source-IP pivot URLs retained the search context, the retained job was explicitly deleted with a 204 response, and the browser session was signed out. Deterministic mocks cover terminal timing and redaction because those cases were not deliberately induced against the supplied backend.
- T6 mock verification: large and malformed string IDs, authenticated session/schema BFF validation, public-field whitelisting, recursive redaction sanitization, loading and 401/403/404/410 states, DNS v1/v2-shaped values, generic/undeclared fields, missing and unexpected values, stale responses, navigation context, account cache clearing, and schema recovery passed.
- T6 real browser verification: an analyst opened a string-ID session from 3,316 completed results, inspected an SSH summary plus server-declared and undeclared fields, returned to the still-active results tab, and explicitly released the job. The direct session URL still loaded after job release and page reload; it preserved the validated search definition without a job ID or automatic rerun. Same-origin session/schema BFF calls returned 200, the session ID remained a string, and the inspected session response contained no access or refresh token. DNS legacy/canonical, redaction, authorization, expiry, and race paths remain mock-only.
- T7 hardening: metadata, results, session, and schema GETs use bounded retries for transient failures, respect `Retry-After`, and abort stalled requests. Accessible labels/status regions and keyboard focus were tightened without changing the search/session contracts. Static audit found no accidental client logs, unsafe HTML rendering, unjustified authored `any`, or client imports from server-only modules.
- T7 deterministic verification: retry classification/delay, truncated-response recovery, login-loop/external/encoded return-target rejection, search/session permalink acceptance, missing/stale-cookie session-link preservation, and post-login deep-link return passed. Rare network timing and error cases remain mock-only.
- T7 real browser verification: a clean pre-auth session evidence link returned to the same string-ID session after login; a copied search URL hydrated all sensors and times, launched a fresh job, progressively loaded 3,406/3,406 results, and supported oldest-first server sorting after completion. The job was explicitly released. Observer sensor locking also passed.
- T7 review smoke: a deliberately stale `sid` preserved the requested string-ID evidence URL through authoritative layout rejection and analyst login. After feature-folder organization, login, session details, a 3,406-row search result flow, explicit job release, and logout passed against the supplied backend.
- Feature code is grouped under `auth/{api,model,ui}`, `search/{api,hooks,model,ui}`, and `session/{api,model,ui}`. Route handlers remain in `src/app/api`, server auth remains in `src/server`, and tests stay beside their components, hooks, transport, or model modules.
- T7 browser security inspection: all observed application requests stayed on same-origin `/api/...`; `/api/me` returned only the public profile, browser storage held only an opaque `sid`, and no backend access/refresh token appeared in inspected traffic or storage.
- T8 UI-only investigation identified `ws-hb-009.quillmere.example` (`10.20.40.18`) as the compromised host. The earliest defensible chain begins with a look-alike-domain spearphishing attachment at 2025-10-25 05:00:58 Europe/Kyiv, followed by rare-domain DNS from the host at 06:11:38 and periodic high-risk TLS from 06:26:56.
- The serialized host search and stable phishing/DNS/TLS session links were reopened in a fresh browser tab and returned the intended evidence without a job ID. Reachable retained jobs were explicitly released; two jobs orphaned by a full-page browser restart were allowed to expire because stable URLs intentionally cannot recover their temporary IDs.
- T8 evidence came only from the running frontend and its browser-visible BFF data. No backend source, tests, fixtures, generators, direct backend requests, or forensic spoiler sources were inspected.
- T9 release verification: locked backend runtime dependency sync and frontend `npm ci` passed; backend health and frontend shell returned HTTP 200; lint, typecheck, all 131 tests, and the production build passed.
- T9 real-browser smoke: analyst login, final search-permalink hydration, completed results containing the documented DNS/TLS evidence, stable DNS and phishing session links, and explicit search-slot release passed against the supplied backend.
- The root README now preserves the assignment text and adds verified PowerShell setup, architecture/security notes, implemented and omitted scope, test guidance, UI-derived forensic reproduction, API observations, limitations, and an AI-use disclosure.

## Next action
Human performs the final submission gate: follow the README from a clean checkout, inspect the complete diff and browser-visible token boundary, review the AI disclosure and forensic wording, confirm commit history, then decide whether to commit and submit.
