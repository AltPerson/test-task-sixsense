import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { LogoutButton } from "@/features/auth/logout-button";
import { getCurrentUser } from "@/server/auth/current-user";

type AuthenticatedLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default async function AuthenticatedLayout({
  children,
}: AuthenticatedLayoutProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-slate-950 text-white">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-6 px-6 py-4 lg:px-10">
          <div>
            <p className="text-sm font-semibold tracking-wide">
              Network Traffic Analysis
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              Investigation workspace
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{user.display_name}</p>
              <p className="text-xs text-slate-400">{user.email}</p>
            </div>
            <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-sky-200">
              {user.role}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-10">
        {children}
      </main>
    </div>
  );
}
