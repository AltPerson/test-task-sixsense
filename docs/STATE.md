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
- Investigation UX: stable session links plus lightweight source/destination pivots.
- Dedicated protocol view: DNS unless explicitly changed.

## Human-control rules
- Git staging/commits/push/remotes are human-owned; the agent leaves verified work uncommitted and suggests a commit message.
- Mandatory human review gates apply after T1, T4, T7, during T8, and after T9.

## Forensic boundary
- Do not use backend world/incident/generator/tests to discover the answer.
- During T8, all backend source/tests are off-limits; investigate through the application only.

## Active task
Real-backend integration milestone complete after approved T3 — awaiting human review before T4.

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
- tests: 31 passing, including enum retry timing, bounded failure, account-switch cache isolation, URL navigation, and capture-aware defaults
- build: passing
- Direct supplied-backend smoke: health, login, profile, sensors, fields, columns, enum, logout, and post-logout rejection passed; observed 200, 204, 401, 404, 422, and recoverable 503 with `Retry-After`.
- Real-backend refresh: two consecutive access expiries under `CAP_ACCESS_TTL_S=15` each produced exactly one successful refresh; parallel authenticated requests then succeeded, confirming single-flight refresh and rotated refresh-token persistence.
- Real browser auth: anonymous route protection, analyst and observer login, role/profile display, logout invalidation, and account-switch cache isolation passed against the supplied backend.
- Real browser authorization: observer sees two readable sensors and one visible disabled/locked sensor; analyst sees all three readable sensors.
- Real browser search builder: 29 fields, 14 columns, capture-aware defaults, country enum 503/retry/200, local sensor validation, permalink fresh-tab reconstruction, Back/Forward, and malformed `q` recovery passed without creating a search job.
- Browser network inspection: client traffic used same-origin `/api/...` BFF routes; login response exposed only the user profile, the browser held only an opaque `sid`, and no backend access or refresh token appeared in inspected responses or browser storage.
- Mock-only deterministic coverage remains for invalid credentials, HTTP-date 429 countdown, rare error shapes, and refresh concurrency. Real 403 and 429 responses were not deliberately provoked.
- forensic investigation: blocked until T1–T7

## Next action
Human reviews this real-backend integration milestone. After explicit approval, execute T4 only; no T4 work or search jobs have started.
