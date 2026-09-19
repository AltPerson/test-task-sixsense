# AGENTS.md — Network Traffic Analysis Test Task

## Mission
Build the frontend requested by the repository README as a production-minded, reviewable one-day test task.
Optimize for correctness, operability, and clear tradeoffs before optional features.

The supplied backend is read-only unless the human explicitly says otherwise.
The finished product must also be usable to perform the repository's traffic-investigation challenge through the UI itself.

## Read order at the start of every task
1. `AGENTS.md`
2. `docs/STATE.md`
3. The active section in `docs/TASKS.md`
4. Only the task-specific supporting doc(s) linked from that task

Do not reread the entire repository or the whole OpenAPI file on every turn.

## Sources of truth
- Product requirements: repository `README.md`
- Backend contract: `backend/openapi.json`
- Distilled API behavior/traps: `docs/API_NOTES.md`
- Architecture decisions: `docs/ARCHITECTURE.md` and `docs/DECISIONS.md`
- Investigation process: `docs/INVESTIGATION.md`
- Final submission checklist: `docs/README_CHECKLIST.md`
- Human operating loop / review checkpoints: `docs/HUMAN_WORKFLOW.md`
- Execution state: `docs/STATE.md`
- Work queue / acceptance criteria: `docs/TASKS.md`

When harness docs disagree with `README.md` or `backend/openapi.json`, the repository sources win. Verify the mismatch, then update the harness docs.

## Hard constraints
- Do not modify backend code.
- Do not solve or infer the forensic challenge by reading backend implementation, world generation, incident fixtures, or tests that encode the incident.
- The forensic finding must be produced through the finished frontend/API workflow as required by the task.
- The browser must never receive the backend access token or refresh token.
- The browser may receive only an opaque application session identifier.
- All authenticated backend traffic from the browser goes through the Next.js BFF/server.
- Session IDs from the API are decimal strings and must never be converted to JavaScript numbers.
- Search metadata (`fields`, `columns`, protocol schema) is server-driven. Do not hardcode copies as the primary source.
- A backend 422 has two valid shapes; preserve and render both.
- Unknown metadata/column/schema types must degrade to readable text rather than crash.
- Search/investigation state needed to reproduce evidence must be deep-linkable; do not leave URL serialization as an optional afterthought.
- Do not start optional SSE/WebSocket/download/saved-query work before every core acceptance criterion is green.
- Do not introduce a database, Redis, state library, design system, or abstraction layer unless the active task proves it is needed.

## Forensic anti-spoiler boundary
During normal implementation, prefer `README.md`, `backend/openapi.json`, and only narrowly targeted API-facing tests when a contract cannot otherwise be clarified.

Never inspect the following to discover, infer, confirm, or hint at the compromised host or attack chain:
- `backend/src/capture_api/world/**`
- `backend/tests/world_core/**`
- `backend/tests/integration/test_incident_is_reachable.py`
- generated fixture/sample output that could reveal the answer
- any file discovered by searching for terms such as `incident`, `compromised`, `malware`, or the suspected host during the investigation

When task T8 starts, treat **all backend source and backend tests as off-limits**. Allowed evidence sources for T8 are the running application UI, its normal browser-visible/BFF API data, the repository README, and already-established public API contract notes. Do not use code search to validate the answer.

## Preferred implementation
- `frontend/` — Next.js App Router + TypeScript
- TanStack Query for server state
- TanStack Table for table state
- TanStack Virtual for large result sets
- Tailwind CSS
- Radix primitives / small shadcn components only where they reduce implementation time
- OpenAPI-generated TypeScript types from `backend/openapi.json`
- Vitest + Testing Library for focused tests

Do not turn this into a monorepo migration. The supplied backend remains where it is.

## Architecture invariant: BFF auth
Use a server-side session store behind a random opaque cookie, for example:

`browser cookie sid -> server SessionStore -> { accessToken, refreshToken, expiries, profile }`

Cookie requirements: `HttpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/`.

The token pair must exist only in `server-only` code.

Access tokens are short-lived. Refresh tokens are single-use with zero grace. Concurrent requests MUST share one in-flight refresh per application session. Never let two requests rotate the same refresh token.

If refresh fails with an authentication/session error, destroy the local application session and return an application-level 401.

## Architecture invariant: search creation
`POST /v1/searches` can fail with 503 after the backend has already committed the search.
Every create-search attempt MUST use an `Idempotency-Key`, and retries of the same logical submission MUST reuse that key.
Never blindly retry this POST under a new key.

## Architecture invariant: progressive results
Search results are available while the job is still running.

Important state:
- `next_cursor != null`: continue paging with it.
- `next_cursor == null && complete == false`: caught up for now, not finished.
- `complete == true`: final end of results.

When caught up, poll again using the cursor that produced the caught-up page (or no cursor if it was the first page), merge new rows by string `id`, and continue if a new `next_cursor` appears.
Do not assume TanStack Infinite Query's default "no next cursor = done" semantics are sufficient.

Only default scan order (`-ts`) is available while running. Disable alternate server sorting until the search state is `done`.

## Architecture invariant: reproducible investigation URLs
A reviewer must be able to follow README evidence back into the application.

Required linkability:
- `/sessions/{sessionId}` is a stable direct evidence link;
- the search route serializes the reproducible search definition into URL parameters (at minimum relevant time range, selected readable sensors, conditions/filters, and supported sort when applicable);
- opening a serialized search URL reconstructs the form/query state without depending on an expired backend search job id;
- ephemeral job ids may exist in runtime state, but are not the only way to reproduce a hunt.

Prefer a compact, deterministic URL representation. If a filter structure becomes too complex for readable params, use one versioned encoded `q` parameter with deterministic serialization and validation. Never serialize credentials/tokens.

## Error/retry rules
- 401 backend access expiry: refresh once through the single-flight refresh path, then retry the original request once.
- 401 refresh/session invalid: clear local session; do not loop.
- 403/404/422: surface; do not auto-retry.
- 429/503: respect `Retry-After` when retrying.
- Login `Retry-After` can be an HTTP-date, not only integer seconds.
- GET retries may be bounded and conservative.
- Search creation retry requires the same idempotency key.
- Truncated/network-failed responses must produce a recoverable UI error, not a permanent spinner.

## UI priorities
1. Sign in
2. Search builder + URL-reproducible query state + progress + progressive results table
3. Session detail with one protocol-specific renderer and generic schema-driven fallback
4. Robust empty/error/loading/permission states
5. Investigation-friendly pivots and evidence links
6. Only then optional features

Desktop analyst workflow is primary. Make narrow layouts usable, but do not burn time on mobile-first polish.

## Investigation-friendly UX
The core UI should make it possible to investigate behavior rather than merely display rows.

Prefer cheap, high-value pivots such as:
- source IP / destination IP links that prefill a new search condition;
- protocol and time-window pivots where useful;
- preserving/reconstructing current search definition in the URL;
- a clearly copyable/openable session URL;
- timestamps and flow direction that make chronology obvious.

Do not build a full SIEM. Add only pivots that materially help the required investigation and remain within core scope.

## Session detail rules
Implement a dedicated DNS renderer unless the human chooses another protocol.
The renderer must tolerate decoder v1 and v2 differences.

For every other protocol:
- fetch `/v1/meta/schema/{protocol}`;
- render declared fields in schema order;
- flatten/render arrays/objects safely;
- detect `{ "redacted": true }` and show a redacted state;
- surface decoded fields not declared by the schema in a separate "Undeclared fields" section;
- offer raw JSON only as a secondary/debug view, never as the only view.

## Change-scope guardrails
- Do not add or upgrade dependencies unless the active task needs them. Before adding a dependency, check whether the existing stack or a small local helper is sufficient.
- Do not perform unrelated cleanup, renames, formatting sweeps, or architecture rewrites while implementing a scoped task.
- Do not replace working code merely to match personal preference. Prefer a targeted patch that preserves verified behavior.
- If a discovered issue is outside the active task, record it briefly under `Known blockers`/`Next action` in `docs/STATE.md` or mention it in the completion report; do not silently expand scope.
- If a harness assumption is wrong, update the smallest relevant harness doc rather than compensating with hidden code complexity.
- Never suppress lint/type errors broadly (`eslint-disable`, `@ts-ignore`, unsafe casts) to force a green check without documenting a narrow, justified reason.

## Human review gates
The following milestones require a human review before the next task begins, even if the agent was asked to continue broadly:
- after T1: inspect auth/session/token boundaries and refresh concurrency;
- after T4: inspect search creation retries/idempotency and job lifecycle;
- after T7: inspect the full app, run manual security/deep-link checks, and decide whether T8 may begin;
- T8: the investigation conclusion is human-owned; the agent may assist with organizing UI-observed evidence but must not fabricate or independently source the answer;
- after T9: human performs the final README, diff, commit-history, and submission review.

## Coding rules
- Prefer small feature-local modules over generic frameworks.
- No `any` in authored app code unless justified inline; generated OpenAPI files are exempt.
- Keep API wire types separate from UI view models when normalization is required.
- Preserve API field names at the boundary; convert only in explicit mappers.
- Use semantic names and pure helpers for formatting/normalization.
- Avoid hidden global mutable state except the documented server SessionStore and its refresh lock.
- Never log credentials or token values.
- Do not log full decoded payloads by default.


## Git ownership
Git history and remote operations are human-controlled.

The agent MUST NOT run any of the following unless the human explicitly asks for that exact action:
- `git init`
- `git add`
- `git commit`
- `git push` / `git pull`
- `git merge` / `git rebase`
- `git reset` / `git revert`
- branch-changing `git checkout` / `git switch`
- `git remote add/remove/set-url`
- GitHub/GitLab repository creation or destructive remote operations

The agent MAY use read-only Git commands for inspection, such as:
- `git status`
- `git diff` / `git diff --stat`
- `git log`
- `git show`

After finishing a task, the agent must leave the working tree uncommitted, summarize the diff, suggest one concise commit message, and stop. The human decides whether to accept, edit, revert, stage, commit, or push the work.

## Agent execution loop
For one task at a time:
1. Inspect only the files needed for the task.
2. Restate the task's acceptance criteria internally.
3. Make the smallest coherent implementation.
4. Run the narrowest relevant verification first.
5. Run `lint`, `typecheck`, relevant tests; run `build` at milestone boundaries.
6. Review the diff for token leaks, accidental backend edits, dead code, and over-abstraction.
7. Update `docs/STATE.md` with only durable current state.
8. Check off the task in `docs/TASKS.md` only when every acceptance criterion passes.
9. Add one concise entry to `docs/CHANGELOG.md` for completed milestones, not every file edit.
10. Produce a concise completion report: files changed, verification run/results, assumptions/blockers, risks/manual checks still needed, and suggested commit message.
11. Stop. Do not stage, commit, push, or silently start the next task unless the human explicitly asks.

For T8 specifically, follow `docs/INVESTIGATION.md`; record observations from the UI without inspecting forbidden backend files. Do not fabricate or prematurely conclude the compromised host.

## Context/token discipline
- Use targeted search (`rg`, exact file paths, OpenAPI operation IDs) instead of dumping whole files.
- Prefer opening <= 250 relevant lines at a time.
- Do not reread unchanged generated files.
- Do not paste generated OpenAPI types into reasoning/context unless a specific type is needed.
- Record durable discoveries in `docs/API_NOTES.md` or `docs/DECISIONS.md`; do not repeatedly rediscover them.
- `docs/STATE.md` must stay short enough to read every turn (target < 120 lines).
- `docs/CHANGELOG.md` is not a scratchpad.
- Investigation notes belong in `docs/INVESTIGATION.md` only and must contain evidence observed through the UI.

## Verification gate before calling the task complete
From `frontend/` all available project commands must pass:
- format/check if configured
- lint
- typecheck
- tests
- production build

Manual checks:
- browser HAR contains no backend access/refresh token;
- analyst can sign in, search, see rows before completion, page through results, and open a session;
- observer cannot use locked sensor data and the UI explains why;
- alternate sorting is unavailable while a search runs and works after completion;
- refresh under concurrent API calls does not revoke the session;
- caught-up progressive paging eventually receives newly available rows without duplicate visible rows;
- session generic renderer survives legacy values, arrays, redaction, and undeclared fields;
- opening a copied search URL reconstructs the intended investigation query without relying on a live/expired search job;
- session evidence URL opens the intended session directly;
- empty, failed, expired, rate-limited, and temporarily unavailable states have actionable UI.

## README / submission integrity
The repository's existing `README.md` is the product specification and eventual submission README. Do not replace it with a harness README.

At T9, extend it carefully with:
- exact run instructions;
- what is implemented;
- what is intentionally not implemented and why;
- at least one meaningful test and how to run it;
- concise architecture/security tradeoffs;
- the UI-derived forensic finding with reproducible search/session links;
- a short false lead / ruled-out explanation;
- honest AI usage: where AI helped and what the human reviewed, corrected, or handled manually;
- factual API observations/ambiguities encountered and how the client handled them.

Do not claim manual verification that was not actually performed. Do not claim an API bug where behavior is merely unusual; distinguish confirmed contract, ambiguity, and implementation choice.

## Git hygiene
Prefer milestone commits that tell the implementation story. Suggested sequence is in `docs/TASKS.md`.
Do not rewrite repository history or commit generated noise unless requested.
