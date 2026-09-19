# Harness changelog

Milestone-level entries only. Newest first.

## Server-side authentication foundation
- Added an in-memory opaque-session store with per-session single-flight token refresh.
- Added an explicit backend auth client and login, logout, and profile BFF routes with secure cookie handling.
- Added normalized domain, validation, network, and Retry-After errors plus concurrency and cleanup tests.

## Frontend baseline and scaffold
- Added a Next.js App Router, TypeScript, and Tailwind frontend foundation with a TanStack Query provider.
- Added reproducible OpenAPI TypeScript generation plus lint, typecheck, Vitest, and production build commands.
- Added a server-only backend URL example, frontend artifact ignores, and a tested application shell.

## Human-control and review-gate update
- Made Git history/remotes explicitly human-owned; agent may inspect Git but must not stage/commit/push/change remotes without an exact user request.
- Added strict one-task completion reports, dependency/refactor scope guardrails, and no-silent-suppression rules.
- Added mandatory human review gates after auth, search orchestration, pre-investigation hardening, the forensic conclusion, and final submission.
- Added `docs/HUMAN_WORKFLOW.md` with the concrete task-by-task operating loop for the repository owner.

## Investigation-ready harness update
- Promoted URL-serialized search state from optional backlog to a core requirement so README evidence is reproducible after backend jobs expire.
- Added investigation-friendly source/destination pivots and stable session evidence links to core acceptance criteria.
- Added a strict UI-only forensic phase with an anti-spoiler backend boundary and evidence/false-lead requirements.
- Added final README checklist covering run instructions, scope, tests, forensic links, honest AI disclosure, tradeoffs, and factual API observations.

## Harness bootstrap
- Added task-specific agent rules and context discipline.
- Captured BFF auth, single-flight refresh, idempotent search creation, progressive cursor semantics, and schema-driven session rendering as hard constraints.
- Added staged implementation plan, architecture decisions, and concise state handoff.
