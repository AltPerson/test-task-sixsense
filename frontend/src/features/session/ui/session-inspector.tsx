"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";

import {
  fetchSearchMetadata,
  searchPollRetryDelay,
  shouldRetrySearchPoll,
} from "@/features/search/api/search-api";
import {
  createHostPivotDefinition,
  decodeSearchDefinition,
  encodeSearchDefinition,
  type SearchDefinition,
} from "@/features/search/model/search-definition";
import {
  fetchProtocolSchema,
  fetchSessionDetail,
  protocolSchemaQueryKey,
  sessionGetRetryDelay,
  sessionDetailQueryKey,
  SessionApiError,
  shouldRetrySessionGet,
} from "@/features/session/api/session-api";
import {
  createSessionSearchDefinition,
  detailValueState,
  endpointIp,
  findUndeclaredFields,
  formatDetailValue,
  formatEndpoint,
  isRedacted,
  isSessionId,
  valueAtPath,
  type ProtocolField,
  type ProtocolSchema,
  type SessionDetail,
} from "@/features/session/model/session-detail";
import { isRecord } from "@/lib/validation";

function searchUrl(definition: SearchDefinition): string {
  return `/?${new URLSearchParams({ q: encodeSearchDefinition(definition) })}`;
}

function formatTimestamp(value: unknown): string {
  if (typeof value !== "string") return formatDetailValue(value);
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : new Date(timestamp).toLocaleString();
}

function DetailValue({
  formatter,
  value,
}: {
  formatter?: (value: unknown) => string;
  value: unknown;
}) {
  const state = detailValueState(value);
  return (
    <span
      className={
        state === "redacted"
          ? "font-semibold text-amber-800"
          : state === "missing"
            ? "italic text-slate-500"
            : "text-slate-900"
      }
    >
      {state === "present" && formatter
        ? formatter(value)
        : formatDetailValue(value)}
    </span>
  );
}

function SummaryItem({
  label,
  formatter,
  value,
}: {
  label: string;
  formatter?: (value: unknown) => string;
  value: unknown;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm">
        <DetailValue formatter={formatter} value={value} />
      </dd>
    </div>
  );
}

function DirectionalValue({ value }: { value: unknown }) {
  if (isRedacted(value)) return <DetailValue value={value} />;
  if (!isRecord(value)) return <DetailValue value={value} />;
  const up = value.up;
  const down = value.down;
  return (
    <span>
      Up <DetailValue value={up} /> · Down <DetailValue value={down} />
    </span>
  );
}

function DeclaredFields({ fields, session }: { fields: ProtocolField[]; session: SessionDetail }) {
  return (
    <dl className="grid gap-3 md:grid-cols-2">
      {fields.map((field) => {
        const value = valueAtPath(session.decoded, field.path);
        return (
          <div className="rounded-lg border border-slate-200 p-3" key={field.path}>
            <dt className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {field.title}
              {field.unit ? <span className="normal-case">({field.unit})</span> : null}
              {field.sensitive ? (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 normal-case text-amber-900">
                  Sensitive
                </span>
              ) : null}
            </dt>
            <dd className="mt-1 break-words text-sm">
              <DetailValue value={value} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function DnsDetails({ schema, session }: { schema: ProtocolSchema; session: SessionDetail }) {
  const queryFields = schema.fields.filter((field) => /(^|\.)(query|question)/i.test(field.path));
  const answerFields = schema.fields.filter((field) => /(^|\.)(answer|answers)/i.test(field.path));
  const used = new Set([...queryFields, ...answerFields].map((field) => field.path));
  const otherFields = schema.fields.filter((field) => !used.has(field.path));

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-slate-950">DNS transaction</h3>
        <p className="mt-1 text-sm text-slate-600">
          Decoder {formatDetailValue(session.decoder)} · legacy and canonical values are shown without coercion.
        </p>
      </div>
      {queryFields.length > 0 ? (
        <section aria-labelledby="dns-query-title">
          <h4 className="mb-2 text-sm font-semibold text-slate-800" id="dns-query-title">Query</h4>
          <DeclaredFields fields={queryFields} session={session} />
        </section>
      ) : null}
      {answerFields.length > 0 ? (
        <section aria-labelledby="dns-answer-title">
          <h4 className="mb-2 text-sm font-semibold text-slate-800" id="dns-answer-title">Answers</h4>
          <DeclaredFields fields={answerFields} session={session} />
        </section>
      ) : null}
      {otherFields.length > 0 ? <DeclaredFields fields={otherFields} session={session} /> : null}
    </div>
  );
}

function DecodedDetails({
  schema,
  session,
}: {
  schema: ProtocolSchema;
  session: SessionDetail;
}) {
  const undeclared = findUndeclaredFields(
    session.decoded,
    schema.fields.map((field) => field.path),
  );

  if (isRedacted(session.decoded)) {
    return <p className="rounded-lg bg-amber-50 p-4 text-sm font-semibold text-amber-900">Decoded protocol data is redacted.</p>;
  }

  return (
    <div className="space-y-6">
      {session.protocol.toLowerCase() === "dns" ? (
        <DnsDetails schema={schema} session={session} />
      ) : (
        <div>
          <h3 className="text-base font-semibold text-slate-950">
            {session.protocol.toUpperCase()} decoded fields
          </h3>
          <div className="mt-3">
            <DeclaredFields fields={schema.fields} session={session} />
          </div>
        </div>
      )}

      {undeclared.length > 0 ? (
        <section aria-labelledby="undeclared-title">
          <h3 className="text-base font-semibold text-slate-950" id="undeclared-title">Undeclared fields</h3>
          <p className="mt-1 text-sm text-slate-600">
            These decoder values are not described by the current protocol schema.
          </p>
          <dl className="mt-3 grid gap-3 md:grid-cols-2">
            {undeclared.map((field) => (
              <div className="rounded-lg border border-dashed border-slate-300 p-3" key={field.path}>
                <dt className="font-mono text-xs text-slate-500">{field.path}</dt>
                <dd className="mt-1 break-words text-sm"><DetailValue value={field.value} /></dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}

function DetectionList({ value }: { value: unknown }) {
  if (!Array.isArray(value)) return <DetailValue value={value} />;
  if (value.length === 0) return <p className="text-sm text-slate-600">No detections reported.</p>;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {value.map((detection, index) => (
        <article className="rounded-xl border border-rose-200 bg-rose-50 p-4" key={isRecord(detection) && typeof detection.rule_id === "string" ? detection.rule_id : index}>
          {isRecord(detection) && !isRedacted(detection) ? (
            <>
              <p className="font-semibold text-rose-950">{formatDetailValue(detection.rule)}</p>
              <p className="mt-1 text-sm text-rose-900">Severity: {formatDetailValue(detection.severity)}</p>
              <p className="mt-1 text-sm text-rose-900">MITRE: {formatDetailValue(detection.mitre)}</p>
            </>
          ) : <DetailValue value={detection} />}
        </article>
      ))}
    </div>
  );
}

function FileList({ value }: { value: unknown }) {
  if (!Array.isArray(value)) return <DetailValue value={value} />;
  if (value.length === 0) return <p className="text-sm text-slate-600">No carved files reported.</p>;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {value.map((file, index) => (
        <article className="rounded-xl border border-slate-200 p-4" key={isRecord(file) && typeof file.id === "string" ? file.id : index}>
          {isRecord(file) && !isRedacted(file) ? (
            <dl className="space-y-1 text-sm">
              <div><dt className="inline font-semibold">Name: </dt><dd className="inline break-all"><DetailValue value={file.name} /></dd></div>
              <div><dt className="inline font-semibold">Type: </dt><dd className="inline"><DetailValue value={file.mime} /></dd></div>
              <div><dt className="inline font-semibold">Size: </dt><dd className="inline"><DetailValue value={file.size} /></dd></div>
              <div><dt className="inline font-semibold">SHA-256: </dt><dd className="inline break-all font-mono"><DetailValue value={file.sha256} /></dd></div>
              <div><dt className="inline font-semibold">Source: </dt><dd className="inline"><DetailValue value={file.source} /></dd></div>
              <div><dt className="inline font-semibold">Purged: </dt><dd className="inline"><DetailValue value={file.purged} /></dd></div>
            </dl>
          ) : <DetailValue value={file} />}
        </article>
      ))}
    </div>
  );
}

function SessionError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const apiError = error instanceof SessionApiError
    ? error
    : new SessionApiError(0, "unexpected_error", "Session details could not be loaded.");
  const guidance = {
    401: "Your application session ended. Sign in again to inspect this session.",
    403: "This account is not allowed to read the sensor that owns this session.",
    404: "The session ID is malformed, unavailable, or outside retained metadata.",
    410: "This session is no longer retained. Return to the preserved search definition and run it again if applicable.",
  }[apiError.status];

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-950" role="alert">
      <h1 className="text-xl font-semibold">Session unavailable</h1>
      <p className="mt-2">{apiError.message}</p>
      {guidance ? <p className="mt-2 text-sm">{guidance}</p> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        {apiError.status === 401 ? (
          <Link className="rounded-lg bg-rose-800 px-3 py-2 text-sm font-semibold text-white" href="/login">Sign in</Link>
        ) : (
          <button className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold" onClick={onRetry} type="button">Retry</button>
        )}
        <Link className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold" href="/">Back to traffic search</Link>
      </div>
    </div>
  );
}

export function SessionInspector({
  contextQuery,
  sessionId,
}: {
  contextQuery: string | null;
  sessionId: string;
}) {
  const validId = isSessionId(sessionId);
  const sessionQuery = useQuery({
    queryKey: sessionDetailQueryKey(sessionId),
    queryFn: ({ signal }) => fetchSessionDetail(sessionId, { signal }),
    enabled: validId,
    retry: shouldRetrySessionGet,
    retryDelay: sessionGetRetryDelay,
  });
  const protocol = sessionQuery.data?.protocol ?? "";
  const schemaQuery = useQuery({
    queryKey: protocolSchemaQueryKey(protocol),
    queryFn: ({ signal }) => fetchProtocolSchema(protocol, { signal }),
    enabled: Boolean(protocol),
    retry: shouldRetrySessionGet,
    retryDelay: sessionGetRetryDelay,
  });
  const metadataQuery = useQuery({
    queryKey: ["search-metadata"],
    queryFn: ({ signal }) => fetchSearchMetadata({ signal }),
    enabled: Boolean(sessionQuery.data),
    retry: shouldRetrySearchPoll,
    retryDelay: searchPollRetryDelay,
  });
  const contextDefinition = useMemo(() => {
    if (!contextQuery) return null;
    const decoded = decodeSearchDefinition(contextQuery);
    return decoded.ok ? decoded.value : null;
  }, [contextQuery]);

  if (!validId) {
    return <SessionError error={new SessionApiError(404, "session_not_found", "Session was not found.")} onRetry={() => undefined} />;
  }
  if (sessionQuery.isPending) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm" role="status">Loading session details…</div>;
  }
  if (sessionQuery.error || !sessionQuery.data) {
    return <SessionError error={sessionQuery.error} onRetry={() => void sessionQuery.refetch()} />;
  }

  const session = sessionQuery.data;
  const baseDefinition = contextDefinition ?? createSessionSearchDefinition(session);
  const returnHref = contextDefinition ? searchUrl(contextDefinition) : "/";
  const metadata = metadataQuery.data;
  const sourcePivot = baseDefinition && metadata
    ? createHostPivotDefinition(baseDefinition, metadata, "src", endpointIp(session.src) ?? "")
    : null;
  const destinationPivot = baseDefinition && metadata
    ? createHostPivotDefinition(baseDefinition, metadata, "dst", endpointIp(session.dst) ?? "")
    : null;
  const pcap = isRecord(session.pcap) ? session.pcap : null;

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Session navigation">
        <Link className="text-sm font-semibold text-sky-700 hover:underline" href={returnHref}>← Back to search definition</Link>
        <p className="font-mono text-xs text-slate-500">Session {session.id}</p>
      </nav>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="session-title">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Session evidence</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950" id="session-title">{formatEndpoint(session.src)} → {formatEndpoint(session.dst)}</h1>
        <p className="mt-2 break-words text-sm text-slate-600"><DetailValue value={session.summary} /></p>

        <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryItem label="Protocol / transport" value={[session.protocol, session.transport]} />
          <SummaryItem formatter={formatTimestamp} label="Start" value={session.start} />
          <SummaryItem formatter={formatTimestamp} label="End" value={session.end} />
          <SummaryItem label="Duration" value={typeof session.duration_ms === "number" || typeof session.duration_ms === "string" ? `${session.duration_ms} ms` : session.duration_ms} />
          <SummaryItem label="Sensor" value={session.sensor_id} />
          <SummaryItem label="Decoder" value={session.decoder} />
          <SummaryItem label="Risk" value={session.risk} />
          <SummaryItem label="Threat intelligence" value={session.intel} />
        </dl>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bytes</p><p className="mt-1 text-sm"><DirectionalValue value={session.bytes} /></p></div>
          <div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Packets</p><p className="mt-1 text-sm"><DirectionalValue value={session.packets} /></p></div>
        </div>

        {sourcePivot || destinationPivot ? (
          <div className="mt-5 flex flex-wrap gap-3">
            {sourcePivot ? <Link className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white" href={searchUrl(sourcePivot)}>Search around source IP</Link> : null}
            {destinationPivot ? <Link className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white" href={searchUrl(destinationPivot)}>Search around destination IP</Link> : null}
          </div>
        ) : null}
        <p className="mt-4 text-xs text-slate-500">Search job IDs are not stored in this evidence URL. Returning restores a definition, not an expired or released job, and never starts a search automatically.</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="protocol-title">
        <h2 className="text-xl font-semibold text-slate-950" id="protocol-title">Protocol details</h2>
        {schemaQuery.isPending ? <p className="mt-4 text-sm text-slate-600" role="status">Loading protocol schema…</p> : schemaQuery.error || !schemaQuery.data ? (
          <div className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-950" role="alert">
            <p className="font-semibold">Protocol schema unavailable.</p>
            <p className="mt-1">Decoded data is not rendered without its server-provided field contract.</p>
            <button className="mt-3 rounded-lg border border-amber-400 px-3 py-2 font-semibold" onClick={() => void schemaQuery.refetch()} type="button">Retry schema</button>
          </div>
        ) : <div className="mt-4"><DecodedDetails schema={schemaQuery.data} session={session} /></div>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="detections-title">
        <h2 className="text-xl font-semibold text-slate-950" id="detections-title">Detections</h2>
        <div className="mt-4"><DetectionList value={session.detections} /></div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="files-title">
        <h2 className="text-xl font-semibold text-slate-950" id="files-title">Carved files</h2>
        <div className="mt-4"><FileList value={session.files} /></div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="pcap-title">
        <h2 className="text-xl font-semibold text-slate-950" id="pcap-title">PCAP retention</h2>
        {pcap && !isRedacted(pcap) ? (
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <SummaryItem label="Available" value={pcap.available} />
            <SummaryItem label="Unavailable reason" value={pcap.reason} />
            <SummaryItem formatter={formatTimestamp} label="Expires / expired" value={pcap.expired_at} />
          </dl>
        ) : <div className="mt-4"><DetailValue value={session.pcap} /></div>}
      </section>
    </div>
  );
}
