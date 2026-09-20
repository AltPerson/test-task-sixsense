# Harness changelog

Milestone-level entries only. Newest first.

## Cross-cutting hardening and deep-link verification
- Added bounded, `Retry-After`-aware GET recovery and request timeouts for metadata, results, session details, and protocol schemas, including deterministic truncated-response coverage.
- Preserved protected deep links through sign-in with validated internal return targets, while keeping the server layout authoritative for session validity.
- Tightened form/table accessibility, audited client/server boundaries and browser-visible auth data, and verified copied search links, stable session links, progressive loading, completed-search sorting, explicit cleanup, and observer sensor authorization against the supplied backend.
- Restricted return targets to supported search/session pages, rejected login loops and encoded path bypasses, and preserved evidence links after stale opaque cookies without weakening SessionStore validation.
- Organized feature modules into cohesive API, model, hook, and UI folders while keeping tests beside their implementation and preserving Next.js route/server boundaries.

## Session detail and protocol rendering
- Added authenticated session-detail and protocol-schema BFF routes with opaque decimal-string ID validation, public-field whitelisting, and recursive redaction sanitization.
- Added stable session evidence URLs, readable flow/risk/detection/file/PCAP summaries, a DNS-focused renderer, and schema-driven generic protocol fields with undeclared-value visibility.
- Added reproducible return/host pivots without job IDs or automatic searches, plus deterministic error/race/account-isolation coverage and real-backend deep-link verification after job release.

## Progressive search results and host pivots
- Added an authenticated results BFF route plus a pure bounded accumulator for cursor progression, caught-up tail polling, string-ID deduplication, and stale-job isolation.
- Added a metadata-driven TanStack Table with virtualized rows, column selection, progressive/empty/error states, and safe fallback rendering for unexpected values.
- Added completion-gated backend sorting, preserved string session IDs behind a non-interactive pre-T6 placeholder, and source/destination IP pivots that prepare reproducible search definitions without starting jobs.
- Added a fresh bounded terminal-tail budget, explicit manual recovery for unconfirmed result endings, redacted-pivot suppression, and deterministic coverage for continuation, deduplication, completion, sorting conflicts, races, malformed/redacted rows, and pivot serialization, plus real-backend browser verification.

## Asynchronous search lifecycle
- Added authenticated create, progress, and delete BFF routes without exposing backend credentials.
- Added stable per-submission idempotency keys retained across bounded automatic and explicit manual recovery attempts, request timeouts, and bounded polling with Retry-After support.
- Added queued/running/done/failed/cancelled progress UI, capture warnings, expiry and slot-limit guidance, and explicit retained-search cleanup.
- Added race coverage for overlapping creates, unresolved-submission replacement, late responses, rejected best-effort navigation cleanup, reactive token refresh, and terminal polling.

## Metadata-driven search builder
- Added authenticated BFF routes for profile, sensor, field, column, and enum metadata without exposing backend tokens.
- Added a metadata-driven AND filter builder with readable-sensor enforcement and operator-specific value controls.
- Added deterministic versioned search URLs, safe hydration and validation, copy support, and fresh-tab reconstruction coverage.
- Added bounded Retry-After enum recovery, account-scoped query-cache cleanup, capture-aware default ranges, and Back/Forward URL synchronization.

## Secure sign-in and authenticated shell
- Added an accessible sign-in screen with explicit analyst and observer demo-account fill actions.
- Added pending, invalid-credential, backend-unavailable, and rate-limit countdown states.
- Added server-side route protection, current-user/role presentation, and logout navigation.
- Separated client auth transport from form rendering, preserved active cooldowns, and made rejected logout requests retryable without false navigation.

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
