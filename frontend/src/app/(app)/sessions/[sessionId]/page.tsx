import { SessionInspector } from "@/features/session/ui/session-inspector";

type SessionPageProps = {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
};

export default async function SessionPage({ params, searchParams }: SessionPageProps) {
  const [{ sessionId }, query] = await Promise.all([params, searchParams]);
  return (
    <SessionInspector
      contextQuery={typeof query.q === "string" ? query.q : null}
      sessionId={sessionId}
    />
  );
}
