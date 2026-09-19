# Master prompt for the coding agent

Use this when starting the agent in the repository after copying the harness files to repo root.

---

You are implementing the supplied network-traffic analysis frontend test task.

First read `AGENTS.md`, then `docs/STATE.md`, then the active task in `docs/TASKS.md`. Follow the source-of-truth and context-budget rules exactly.

Work on **one task at a time**. For the active task:
1. inspect only the relevant repository files;
2. implement the smallest coherent solution that satisfies every acceptance criterion;
3. run the narrow relevant checks, then lint/typecheck/tests and milestone build as required;
4. review your diff for backend edits, token leakage, unsafe retries, accidental hardcoding, broken deep links, and unnecessary abstractions;
5. update `docs/STATE.md`, `docs/TASKS.md`, and milestone `docs/CHANGELOG.md` only after verification;
6. produce a concise completion report with files changed, checks/results, assumptions/blockers, manual checks still needed, and one suggested commit message;
7. stop after the task unless I explicitly tell you to continue autonomously.

Important constraints you must not weaken:
- backend is read-only;
- do not inspect backend world/incident/generator implementation or incident-encoding tests/fixtures to solve or infer the forensic puzzle;
- during T8, do not inspect any backend source/tests at all — investigate through the running UI and its normal data only;
- backend access/refresh tokens never reach the browser;
- refresh is single-flight per app session;
- create-search retries reuse an Idempotency-Key;
- progressive results must handle `next_cursor=null && complete=false` and dedupe repeated tail rows;
- session IDs remain strings;
- search fields/columns/protocol schemas are driven from backend metadata;
- search definitions required for investigation are reproducible through URL state and do not depend solely on expiring backend job ids;
- stable session routes and lightweight host pivots are part of core investigation UX;
- optional realtime/download/saved-query features stay blocked until core is complete.
- Git history/remotes are human-owned: do not `git add`, commit, push, pull, rebase, reset, switch branches, or change remotes unless I explicitly request that exact action. Read-only `git status/diff/log/show` is allowed.
- do not add dependencies, broad refactors, formatting sweeps, or unrelated cleanup outside the active task without a concrete requirement.

Respect the human review gates in `AGENTS.md`, especially after T1, T4, T7, during T8, and after T9. Do not cross a gate just because earlier tasks passed automatically.

The final README must honestly state AI usage, what was manually reviewed/fixed, at least one meaningful test, implemented/omitted scope, any factual API observations, and the UI-derived forensic finding with reproducible search/session links plus at least one false lead that was ruled out.

If the repository contradicts a harness assumption, verify the contract in `README.md`/`backend/openapi.json`, update the relevant harness doc with the verified fact, and proceed with the least-complex correct design.

Start with the task named under `## Active task` in `docs/STATE.md`.
