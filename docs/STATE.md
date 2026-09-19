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
Human review gate after T1 — BFF session/auth foundation.

## Known blockers
- The supplied backend Docker build currently fails because `backend/Dockerfile` copies a missing `backend/README.md`; real-backend auth smoke testing remains pending.

## Verification status
- API type generation: reproducible from `backend/openapi.json`
- dev server: HTTP 200 with application shell
- lint: passing
- typecheck: passing
- tests: 6 passing, including proactive single-flight refresh, reactive 401 refresh/retry, and refresh-auth cleanup
- build: passing
- BFF auth smoke test: login, `/api/me`, and logout passing against a contract-shaped mock backend
- browser-visible token check: mock backend tokens absent from login and `/api/me` responses; cookie is opaque, HttpOnly, SameSite=Lax, Path=/
- manual browser HAR token check against the supplied backend: not run
- search permalink round-trip: not implemented
- forensic investigation: blocked until T1–T7

## Next action
Human reviews the T1 session/token boundary, cookie behavior, and refresh concurrency. After explicit approval, execute T2 only.
