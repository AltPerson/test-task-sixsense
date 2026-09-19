# Final README / submission checklist

The repository already contains the company's README. Extend it; do not replace the original task text unless the human explicitly chooses a different presentation.

## Required operational information
- prerequisites;
- exact backend start command;
- exact frontend install/start command;
- required environment variables and example values that are safe to publish;
- local frontend URL;
- demo credentials if the original README permits/publishes them;
- test/lint/typecheck/build commands.

A reviewer should not need to infer working directories or ports.

## Implemented scope
State what is actually complete, especially:
- authentication/BFF/session handling;
- metadata-driven search builder;
- deep-linkable search state;
- async search progress and resilient creation;
- progressive/cursor result loading;
- virtualized metadata-driven table;
- session detail + schema-driven rendering;
- error/permission/legacy-data handling;
- tests.

Do not claim features that were not manually or automatically verified.

## Not implemented / deliberate tradeoffs
Keep this short and specific. Examples if applicable:
- optional realtime SSE/WebSocket omitted to prioritize core correctness;
- in-memory server session store is local/single-process and would need shared storage for horizontal deployment;
- complex nested boolean filter editor deferred in favor of reliable flat-AND metadata-driven filters.

Explain why, without apologizing.

## Tests
Name at least one meaningful test and what failure it protects against.
Strong examples:
- progressive tail paging: `next_cursor=null && complete=false`, dedupe, later continuation;
- single-flight refresh avoiding refresh-token reuse;
- BFF token non-leak;
- search URL serialization round-trip;
- schema renderer handling redacted/undeclared values.

Give the exact command to run it.

## Traffic investigation
Use only the result produced under `docs/INVESTIGATION.md`.
Include:
- compromised host;
- earliest defensible suspicious point;
- reproducible hunt/search link;
- stable session link;
- concise correlation explanation;
- one plausible false lead ruled out and why.

The hunt link must encode the search definition, not merely an expiring backend job id.

## AI usage disclosure
Be concrete and honest. Cover both AI assistance and human ownership.

Suggested structure — adapt to what actually happened:

```md
### AI usage
AI-assisted coding was used for repository analysis, implementation planning,
scaffolding/repetitive code, and test suggestions. I used repository-level
agent instructions to constrain architecture, API contracts, verification, and scope.

I manually reviewed the generated changes and owned/fixed the security-sensitive
session/refresh flow, async search/cursor behavior, UX decisions, and final integration
as applicable. The compromised-host investigation itself was performed through the
application interface rather than by reading the backend implementation.
```

Only name items as manually fixed/reviewed if that is true. Update this section from actual work completed; do not paste boilerplate blindly.

## API observations
The company explicitly invites questions when the API looks broken. Use a factual structure:

```md
### API observations
- **Observed behavior:** ...
  **Impact:** ...
  **Client handling:** ...
  **Question / production recommendation:** ...
```

Good candidates *if encountered/verified in the implementation* include:
- `next_cursor=null` while `complete=false` means temporarily caught up, not EOF;
- create-search can fail ambiguously after commit, making stable idempotency keys essential;
- single-use zero-grace refresh requires refresh serialization under concurrent requests;
- a metadata type can be unknown to the frontend and must fall back safely;
- schema metadata may omit decoded fields that still need display;
- `Retry-After` may be HTTP-date.

Do not label documented unusual behavior as "broken" automatically. Distinguish:
- documented/confirmed contract;
- ambiguous or surprising behavior;
- actual defect, if one is reproducibly observed.

## Final review
Before submission:
- clean install succeeds;
- lint/typecheck/tests/build pass;
- no backend token appears in browser-visible data/HAR;
- search deep links work in a fresh tab;
- session evidence links work;
- README links point at the local frontend route reviewers can reproduce;
- no secrets or local `.env` committed;
- no forbidden forensic answer was obtained from backend source;
- commit history is readable and milestone-oriented;
- `git status` is clean.
