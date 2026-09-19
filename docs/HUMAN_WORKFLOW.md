# Human workflow

This file is for the repository owner, not a replacement for `AGENTS.md`.

## Start
1. Keep the company-provided `README.md` unchanged until the implementation/final documentation tasks require additions.
2. Make the initial repository commit yourself.
3. Start the coding agent at repository root with: `Read ./MASTER_PROMPT.md and execute it.`
4. Let it complete only the current task in `docs/STATE.md`.

## After every agent task
1. Read the agent completion report.
2. Run `git status` and `git diff` yourself.
3. Check that no backend/source-of-truth files were changed accidentally and no unrelated refactor/dependency appeared.
4. Re-run important commands yourself when the task is security- or state-sensitive.
5. If the diff is acceptable, stage and commit it yourself using the suggested message or a clearer one.
6. Then tell the agent: `Continue with the next task from AGENTS.md / docs/STATE.md. Implement only that task and stop.`

## Mandatory manual checkpoints
### After T1 — auth/BFF
Verify in the browser/devtools that backend access/refresh tokens are absent from response bodies, client storage, JS state, and cookie values. Review single-flight refresh code before continuing.

### After T4 — search orchestration
Review how Idempotency-Key is created and reused across a retry of the same logical submission. Verify a reopened deep link creates a fresh backend job rather than depending on an expired job id.

### After T7 — pre-investigation
Run the full app manually. Verify login, search, progressive rows, session details, fresh-tab deep links, permission states, and error recovery. Inspect HAR for token leakage. Only then begin T8.

### T8 — forensic investigation
Do the investigation through the UI. Do not inspect backend implementation/tests/fixtures for the answer. Keep brief notes in `docs/INVESTIGATION.md`: candidates, chronology, decisive evidence, one false lead and why it was ruled out, search permalink, session permalink.

### After T9 — submission
From a clean install, follow the README exactly. Check the final diff and commit history. Ensure the README truthfully says what AI did and what you reviewed/fixed manually. Remove unfinished/half-working optional UI rather than advertising it.

## Normal agent prompt between tasks
```text
Continue using AGENTS.md.
Read docs/STATE.md and the next active task in docs/TASKS.md.
Implement only that task.
Do not stage, commit, push, or modify git remotes.
Run the required verification, update harness state docs, produce the completion report, and stop.
```

## When something goes wrong
If the agent gets blocked or finds an apparent API issue, ask it to document the exact request/response/contract mismatch and stop instead of inventing a workaround. Decide the tradeoff manually, then record the decision in `docs/DECISIONS.md` when it is durable.
