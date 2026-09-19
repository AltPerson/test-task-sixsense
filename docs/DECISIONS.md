# Architecture decision log

Keep decisions short and durable. Do not use this as a progress log.

## D001 — Separate `frontend/` instead of repository restructuring
Decision: add a dedicated Next.js frontend beside the supplied backend.
Reason: minimizes risk, keeps backend untouched, and makes reviewer setup obvious.

## D002 — Server-side opaque application session
Decision: browser receives only a random session id; backend token pair stays in server memory/store.
Reason: explicitly satisfies the task's "backend token must not reach the browser" constraint and keeps HAR free of backend tokens.

## D003 — SessionStore interface with local in-memory implementation
Decision: use an abstraction with an in-memory implementation for the one-day local task unless deployment requirements change.
Reason: Redis/database would be disproportionate. README must disclose single-process limitation and production replacement path.

## D004 — Single-flight token refresh
Decision: serialize refresh per application session.
Reason: backend refresh tokens are single-use with zero grace; concurrent refresh calls can otherwise revoke the whole session.

## D005 — OpenAPI-generated wire types
Decision: generate TypeScript types from `backend/openapi.json` and wrap them with small server/client helpers.
Reason: reduces contract drift without adopting an oversized generated SDK.

## D006 — Progressive result accumulator instead of naive infinite query
Decision: own the caught-up/tail polling state explicitly and use TanStack Query for scheduling/cache integration rather than relying only on default `getNextPageParam` behavior.
Reason: API uses `next_cursor=null, complete=false` as temporary caught-up state and may repeat tail rows later.

## D007 — DNS dedicated renderer + schema-driven generic fallback
Decision: make DNS the polished protocol-specific view unless implementation evidence suggests another choice.
Reason: intuitive transaction structure and documented legacy/canonical decoder differences make it a useful demonstration of robust rendering.

## D008 — Core scope over optional realtime/download features
Decision: defer SSE, WebSocket, downloads and saved queries until all core acceptance criteria pass.
Reason: repository explicitly says one finished thing beats five started ones.

## D009 — Reproducible search definition lives in the URL
Decision: serialize the investigation-relevant search definition into a deterministic URL representation and hydrate UI state from it.
Reason: the task requires linking to the investigation spot; backend search job ids expire and therefore cannot be the sole permalink mechanism.

## D010 — Stable session routes are primary evidence links
Decision: keep session evidence addressable as `/sessions/{string-id}` and never coerce ids to JavaScript numbers.
Reason: gives reviewers a durable, direct evidence route and avoids uint64 precision loss.

## D011 — Manual UI-only forensic phase
Decision: T8 forbids backend source/tests/fixtures as evidence and requires the compromised-host finding to come from the application workflow.
Reason: directly follows the repository instruction and preserves the candidate's ability to explain the investigation honestly.

## D012 — Investigation pivots are core, not optional analytics
Decision: include cheap source/destination host pivots and chronology-friendly navigation within core scope.
Reason: the interface must be genuinely usable to perform the required traffic investigation, not merely render API rows.
