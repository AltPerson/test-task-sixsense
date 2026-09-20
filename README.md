# Test task: a web interface for network traffic analysis

`backend/` is a working API. It serves captured network traffic from a fictional company: three
capture points, about a hundred thousand sessions over three days, decoded protocols, carved files,
PCAP. You do not need to touch the backend — it works and it has tests.

Your job is to build the web interface for it.

## Why we ask for this

Two things, and both count.

How you build an interface someone can actually work in: what you put on screen and what you leave
out, how the layout holds up when there are thousands of rows, what the user sees while a search is
running, when something is empty, when it fails. It does not have to be beautiful, but it has to be
thought through.

And how you work against a real API: a long search that runs on the server, paged results, data
that arrives in more than one shape, errors and timeouts. All of that is in the task because that
is how our product works.

## Running the backend

You need Python 3.13 and [uv](https://docs.astral.sh/uv/).

```bash
cd backend
uv sync
uv run capture-api serve
```

The API comes up on `http://localhost:8700`. Also there:

- `http://localhost:8700/docs` — the full endpoint reference; you can fire requests straight from
  the browser;
- `backend/openapi.json` — the same schema as a file, if you want to generate a typed client.

If you would rather not install uv, `docker compose up -d --build` from the repository root gives
you the same API on the same port.

CORS is off on purpose. The browser cannot call this API: your own server has to proxy the requests
(a route handler, a BFF — whatever suits you).

Accounts:

| email | password | role |
|---|---|---|
| `ana@quillmere.example` | `demo-analyst` | analyst, sees everything |
| `oli@quillmere.example` | `demo-observer` | read-only, some data hidden |

## What to build

Three screens.

**Sign in.** Email and password. The backend token must not reach the browser — keep it on your
side and hand out only a session. A HAR capture of your app should not contain the token.

**Search.** The main screen. The user picks capture points and a time window, builds a condition
from the fields the server publishes (`/v1/meta/fields`), and starts a search. The search is a job
on the server: you create it, follow its progress, and read the results page by page while it is
still running. The result is a table of sessions that is comfortable to scan — there are a lot of
rows.

**Session.** One session in full: the decoded protocol transaction, laid out so it can actually be
read. Write a proper view for one protocol of your choice, and a generic view for the rest that
builds itself from the schema at `/v1/meta/schema/{protocol}`.

Everything else is optional and only if time is left: the live event feed over SSE, WebSocket,
downloading PCAP and files, saved queries. One finished thing beats five started ones.

What you call the project, how you lay out the files, which routing you use — entirely up to you.

Plan on about a day of work. If you did not get to something, say so and say why.

## Stack

We use Next.js, TypeScript, TanStack Query and Table, Tailwind and Radix — that is what we will
find easiest to read. It is a preference, not a requirement: use whatever you are fastest in.

## Something is wrong in that traffic

One of the machines on the network is compromised, and no ready-made rule names it. Once your
interface works, use it to find where it started, and write the answer in your README, with a link
to that spot in your interface and a couple of words on how you found it and what you ruled out
along the way. The traffic contains things that look suspicious and are harmless.

Find it with the interface, not by reading the backend code.

## What to send

A repository with its commit history and a README saying how to run it, what is done, what is not
and why. At least one test you can point at. If you used AI, say where and what you fixed by hand.
That is fine with us, we want the honest picture.

Ask questions. If something in the API looks broken, say so — that is part of the job too.

---

# Submission

## Overview

The completed application is a Next.js analyst workspace for the supplied Capture API. It keeps backend credentials behind a server-side BFF, builds searches from backend-published metadata, displays results while asynchronous searches are still running, and provides stable session evidence pages with protocol-aware rendering.

Implemented workflows include:

- analyst and observer sign-in, protected application routes, logout, and role-aware sensor access;
- metadata-driven flat-AND search conditions, sensor and time-window selection, and deterministic search-definition permalinks;
- idempotent asynchronous search creation, progress and warning states, bounded polling, expiry handling, and explicit slot release;
- progressive cursor paging with tail rechecks, string-ID deduplication, bounded client accumulation, server sorting after completion, selectable columns, and virtualized rows;
- source and destination IP pivots that preserve the investigation definition without automatically starting a job;
- stable `/sessions/{stringId}` pages with flow, risk, detection, carved-file, and PCAP summaries;
- a dedicated DNS renderer plus schema-driven fallback rendering for other protocols, including legacy, missing, undeclared, unexpected, and redacted values;
- actionable loading, empty, permission, expiry, rate-limit, transient-failure, and retry states.

## Technology and architecture

- Next.js 16 App Router, React 19, and TypeScript
- TanStack Query, Table, and Virtual
- Tailwind CSS 4
- Vitest and Testing Library
- OpenAPI-generated TypeScript wire types

Authenticated browser requests use this boundary:

```text
browser + opaque HttpOnly sid
  -> explicit same-origin Next.js BFF route
  -> process-global server SessionStore
  -> backend Bearer token
  -> Capture API on port 8700
```

Backend access and refresh tokens remain server-side. Refresh is single-flight per application session because backend refresh tokens are single-use with zero grace. The browser receives only the public user profile and an opaque `sid` cookie.

Search definitions and temporary search jobs are separate. URLs serialize the reproducible definition; opening one reconstructs the form and requires the user to start a fresh job. Temporary backend job IDs are never used as the stable investigation permalink.

## Prerequisites

The following versions were used for final verification on Windows PowerShell:

- Python 3.13.5
- uv 0.11.28
- Node.js 24.4.1 and npm 11.4.2

The backend package declares Python `>=3.12`. The installed Next.js version requires Node.js `>=20.9.0`.

## Run locally

The supplied backend package metadata and Dockerfile reference `backend/README.md`, but that file is absent from the supplied repository. Consequently, the documented plain `uv sync` and Docker build do not currently complete unchanged. Both workflows below install dependencies without installing the backend project package, then import it directly from `src`.

### Windows PowerShell (verified)

These commands were executed and verified in the current Windows environment.

#### 1. Start the supplied backend

```powershell
cd backend
python -m uv sync --locked --no-dev --no-install-project
$env:PYTHONPATH=(Resolve-Path 'src').Path
.\.venv\Scripts\python.exe -m capture_api serve
```

The API starts at `http://127.0.0.1:8700`; its public documentation is available at `http://127.0.0.1:8700/docs`.

`backend/.env.example` documents optional simulator settings. No backend environment file is required for the default local workflow.

#### 2. Install and start the frontend

In a second PowerShell terminal:

```powershell
cd frontend
npm ci
$env:BACKEND_BASE_URL='http://127.0.0.1:8700'
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000`.

`BACKEND_BASE_URL` is server-only and selects the Capture API used by the BFF. It defaults to `http://localhost:8700`; it must use HTTP or HTTPS. It is not a `NEXT_PUBLIC_` variable and is never exposed as browser configuration. The same value can be stored in `frontend/.env.local` by copying `frontend/.env.example`.

For a production build:

```powershell
cd frontend
$env:BACKEND_BASE_URL='http://127.0.0.1:8700'
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

### macOS/Linux bash or zsh (reviewed, not executed)

These commands were reviewed against the repository paths, declared dependencies, and package scripts. They were not executed on macOS or Linux, so cross-platform compatibility is not claimed or guaranteed.

#### 1. Start the supplied backend

```bash
cd backend
uv sync --locked --no-dev --no-install-project
export PYTHONPATH="$(pwd)/src"
.venv/bin/python -m capture_api serve
```

#### 2. Install and start the frontend

In a second bash or zsh terminal:

```bash
cd frontend
npm ci
export BACKEND_BASE_URL='http://127.0.0.1:8700'
npm run dev -- --hostname 127.0.0.1 --port 3000
```

For a production build:

```bash
cd frontend
export BACKEND_BASE_URL='http://127.0.0.1:8700'
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

### Sign in

These are fictional demo accounts published by the assignment:

| Role | Email | Password |
|---|---|---|
| Analyst | `ana@quillmere.example` | `demo-analyst` |
| Observer | `oli@quillmere.example` | `demo-observer` |

The login-page account buttons only fill the form; they do not submit credentials automatically. Use the analyst account for the complete investigation because the observer intentionally cannot read every sensor or sensitive field.

## Main workflows

1. Choose readable sensors and a time range on the search page.
2. Add metadata-driven conditions and copy the reproducible definition link when needed.
3. Run the search, monitor queued/running/done state, and inspect rows as progressive pages arrive.
4. After completion, use sortable headers for backend-wide ordering or pivot from an endpoint into a prepared search definition.
5. Open a row's stable session page to inspect protocol data, risk reasons, detections, files, and retention state.
6. Return to the results and explicitly release the completed search slot.

## Verification and tests

Run all frontend quality gates from `frontend/`:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Regenerate the API wire types after an intentional OpenAPI contract update:

```powershell
npm run generate:api
```

Meaningful focused tests include:

- `src/server/auth/backend-client.test.ts`: concurrent protected requests share one refresh, and reactive 401 recovery retries the request exactly once with the rotated token;
- `src/features/search/hooks/use-search-lifecycle.test.tsx`: ambiguous create failures retain the same idempotency key and exact body across automatic and manual recovery;
- `src/features/search/hooks/use-progressive-search-results.test.tsx`: temporary caught-up tails, terminal rechecks, manual continuation, deduplication, and stale-job isolation;
- `src/features/search/model/search-definition.test.ts`: deterministic permalink round trips and malformed-state rejection;
- `src/features/session/model/session-detail.test.ts`: large string IDs plus missing, legacy, unexpected, undeclared, and redacted values.

For example:

```powershell
npm test -- src/features/search/hooks/use-progressive-search-results.test.tsx
```

The full suite uses deterministic mocks for rare timing, ambiguity, redaction, authorization, expiry, and concurrency paths. Normal authentication, search, progressive results, sorting, pivots, session details, permalink restoration, and cleanup were also exercised against the real supplied backend through the application UI.

## Traffic investigation

The investigation was performed through the completed UI without inspecting backend incident generators, fixtures, hidden tests, raw captures, or backend implementation for the answer.

The evidence supports `ws-hb-009.quillmere.example` (`10.20.40.18`, `harbor-branch`) as the compromised host.

- The earliest suspicious event in the related timeline is an SMTP message at **2025-10-25 05:00:58 Europe/Kyiv** (`02:00:58Z`). It came from the look-alike domain `quillrnere-freight.example`, carried the macro-enabled attachment `Zollbescheid_Nachzahlung.xlsm`, and was identified as MITRE T1566.001 spearphishing attachment activity.
- The earliest suspicious activity directly emitted by the host is a DNS lookup at **06:11:38 Europe/Kyiv** for the rare domain `telemetry.static-assets-cdn.test`, resolving to `203.0.113.201` and followed by two related NXDOMAIN queries.
- Beginning at **06:26:56 Europe/Kyiv**, the host made TLS connections to `203.0.113.201:443` approximately every five to six minutes. The sessions combined a rare domain, self-signed certificate, CN/SNI mismatch, and a later explicit `Periodic TLS beacon` detection.

The phishing message is the earliest plausible initial vector in the correlated timeline. The UI does not provide endpoint execution telemetry or an asset-to-user directory, so execution of that attachment on this specific workstation is not presented as proven.

### Reproduce the finding

1. Start both services and sign in as the analyst.
2. Open the [reproducible host-search permalink](http://127.0.0.1:3000/?q=%7B%22version%22%3A1%2C%22from%22%3A%222025-10-25T01%3A50%3A00.000Z%22%2C%22to%22%3A%222025-10-25T04%3A10%3A00.000Z%22%2C%22sensorIds%22%3A%5B%22dc-east%22%2C%22harbor-branch%22%2C%22hq-core%22%5D%2C%22conditions%22%3A%5B%7B%22field%22%3A%22src.ip%22%2C%22operator%22%3A%22eq%22%2C%22values%22%3A%5B%2210.20.40.18%22%5D%7D%5D%2C%22sort%22%3A%22-ts%22%7D). Here, `127.0.0.1:3000` means the reviewer's locally running frontend.
3. Select **Run search**, wait for completion, and select the **Start** column for oldest-first ordering.
4. Confirm DNS session [`216172823837671425`](http://127.0.0.1:3000/sessions/216172823837671425?q=%7B%22version%22%3A1%2C%22from%22%3A%222025-10-25T01%3A50%3A00.000Z%22%2C%22to%22%3A%222025-10-25T04%3A10%3A00.000Z%22%2C%22sensorIds%22%3A%5B%22dc-east%22%2C%22harbor-branch%22%2C%22hq-core%22%5D%2C%22conditions%22%3A%5B%7B%22field%22%3A%22src.ip%22%2C%22operator%22%3A%22eq%22%2C%22values%22%3A%5B%2210.20.40.18%22%5D%7D%5D%2C%22sort%22%3A%22-ts%22%7D) at 06:11:38 and the repeated TLS sequence beginning with session [`216172823853400065`](http://127.0.0.1:3000/sessions/216172823853400065?q=%7B%22version%22%3A1%2C%22from%22%3A%222025-10-25T01%3A50%3A00.000Z%22%2C%22to%22%3A%222025-10-25T04%3A10%3A00.000Z%22%2C%22sensorIds%22%3A%5B%22dc-east%22%2C%22harbor-branch%22%2C%22hq-core%22%5D%2C%22conditions%22%3A%5B%7B%22field%22%3A%22src.ip%22%2C%22operator%22%3A%22eq%22%2C%22values%22%3A%5B%2210.20.40.18%22%5D%7D%5D%2C%22sort%22%3A%22-ts%22%7D) at 06:26:56.
5. Open phishing session [`72057635687366660`](http://127.0.0.1:3000/sessions/72057635687366660?q=%7B%22version%22%3A1%2C%22from%22%3A%222025-10-24T16%3A00%3A00.000Z%22%2C%22to%22%3A%222025-10-27T17%3A04%3A00.000Z%22%2C%22sensorIds%22%3A%5B%22dc-east%22%2C%22harbor-branch%22%2C%22hq-core%22%5D%2C%22conditions%22%3A%5B%7B%22field%22%3A%22protocol%22%2C%22operator%22%3A%22eq%22%2C%22values%22%3A%5B%22smtp%22%5D%7D%5D%2C%22sort%22%3A%22-ts%22%7D) for the earlier delivery evidence.
6. Return to the active search and release its retained slot.

A plausible false lead was an ordinary `portauthority.example.org` message carrying `rates-q3.xlsx`. It superficially resembled attachment delivery but scored 10/low, had no detections or suspicious risk reasons, and was not connected by the inspected UI evidence to the candidate host's rare-domain and periodic TLS sequence.

## API observations

- **Observed behavior:** Search creation may fail with 503 after the backend has committed the job.
  **Impact:** Retrying with a new idempotency key could create a duplicate and consume another limited search slot.
  **Client handling:** One logical submission retains its key and exact body across bounded automatic retries and explicit manual recovery.
  **Production recommendation:** Persist unresolved submissions in shared storage if recovery must survive navigation or process loss.

- **Observed behavior:** `next_cursor: null` with `complete: false` means temporarily caught up, not end-of-results. Tail retries may repeat rows.
  **Impact:** A conventional infinite-query stop condition can miss later rows or display duplicates.
  **Client handling:** The accumulator rechecks the same tail cursor, deduplicates by opaque string session ID, resumes advancing cursors, and claims completion only after `complete: true`.

- **Observed behavior:** Refresh tokens are single-use with zero grace.
  **Impact:** Concurrent refresh attempts can revoke the token family.
  **Client handling:** The BFF shares one in-flight refresh per application session and retries a protected request once.

- **Observed behavior:** Metadata and decoded payloads can include unknown column types, legacy values, redaction sentinels, and fields omitted from the current protocol schema.
  **Impact:** Strict rendering assumptions would hide evidence or crash the inspector.
  **Client handling:** Unknown values degrade to readable text, redaction is preserved, and undeclared decoded fields remain visible separately.

- **Observed behavior:** `Retry-After` may be seconds or an HTTP date, and transient metadata/result responses may be unavailable or truncated.
  **Impact:** Immediate or unbounded retries produce poor recovery behavior.
  **Client handling:** Requests use bounded, abortable recovery and honor both header forms where applicable.

- **Observed supplied-environment issue:** `backend/README.md` is missing although backend package metadata and the Dockerfile reference it.
  **Impact:** Normal project installation and Docker image construction fail before the API starts.
  **Verified workaround:** Install locked runtime dependencies with `--no-install-project` and run the package from `src` through `PYTHONPATH`, as documented above. The supplied backend was not modified.

## Deliberate limitations and trade-offs

- The process-global in-memory SessionStore is appropriate for this local, single-Node-process task. Horizontal or restart-resilient deployment requires a shared store such as Redis, including distributed refresh locking.
- Unresolved ambiguous search submissions are retained only while the browser workspace remains mounted. Navigation, reload, tab closure, or process loss can discard the key before the backend outcome is reconciled.
- Explicit DELETE is the primary search-slot cleanup mechanism. Navigation cleanup is best effort and cannot guarantee release after network failure, tab/process termination, or lost job context; idle backend expiry remains the fallback.
- Progressive result accumulation is capped at 25,000 rows to prevent unbounded browser memory growth.
- The filter builder intentionally supports a reliable metadata-driven flat AND list rather than arbitrary nested boolean groups.
- Optional SSE, WebSocket live tap, PCAP/file downloads, and saved queries were not implemented so the complete auth/search/results/session workflow could be finished and tested.
- Historical PCAP had expired for the sessions used in the final investigation; decoded session evidence remained available.

## AI usage

The AI coding agent substantially assisted with repository analysis and planning, frontend and BFF implementation, test creation, refactoring, UI-based forensic investigation, and documentation. The agent also executed the automated quality checks and real-browser UI smoke tests reported in this submission. The investigation used the completed application UI rather than hidden backend implementation, fixtures, or tests.

The human owner directed the workflow, set task and review constraints, supplied targeted findings, reviewed agent reports and code/documentation changes, made milestone approval decisions, and controlled the normal commit and push process. This attribution does not imply that the human personally executed agent-reported browser checks, independently reproduced every forensic observation, or manually authored AI-generated code.

## Further documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - architecture and state-model details
- [`docs/API_NOTES.md`](docs/API_NOTES.md) - distilled public API semantics and verified edge cases
- [`docs/DECISIONS.md`](docs/DECISIONS.md) - durable architecture decisions
- [`docs/INVESTIGATION.md`](docs/INVESTIGATION.md) - detailed UI-derived investigation record and limitations
