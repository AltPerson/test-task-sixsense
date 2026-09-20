import { redirect } from "next/navigation";

import { SignInForm } from "@/features/auth/ui/sign-in-form";
import { safeReturnTo } from "@/features/auth/model/return-to";
import { getCurrentUser } from "@/server/auth/current-user";

type LoginPageProps = {
  searchParams: Promise<{ returnTo?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const parameters = await searchParams;
  const returnTo = safeReturnTo(parameters.returnTo);
  const user = await getCurrentUser();

  if (user) {
    redirect(returnTo);
  }

  return (
    <main className="grid min-h-screen bg-slate-950 lg:grid-cols-[minmax(0,1.05fr)_minmax(28rem,0.95fr)]">
      <section className="relative hidden overflow-hidden p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.2),_transparent_42%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.12),_transparent_38%)]" />
        <div className="relative">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-300">
            Quillmere Capture Grid
          </p>
          <h1 className="mt-6 max-w-xl text-5xl font-semibold leading-tight tracking-tight text-white">
            Follow the traffic. Find the story.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-slate-300">
            Search captured sessions, inspect decoded protocols, and preserve a
            reproducible evidence trail.
          </p>
        </div>
        <p className="relative text-sm text-slate-500">
          Authorized access only
        </p>
      </section>

      <section className="flex items-center justify-center bg-slate-50 px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              Network Traffic Analysis
            </p>
          </div>
          <SignInForm returnTo={returnTo} />
        </div>
      </section>
    </main>
  );
}
