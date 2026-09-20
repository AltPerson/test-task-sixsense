"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { requestLogout } from "@/features/auth/auth-api";

export function LogoutButton() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    setPending(true);
    setError(null);

    try {
      await requestLogout();
      queryClient.clear();
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Sign out could not be confirmed. Check your connection and retry.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        aria-describedby={error ? "logout-error" : undefined}
        className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:cursor-wait disabled:opacity-60"
        disabled={pending}
        onClick={logout}
        type="button"
      >
        {pending ? "Signing out…" : error ? "Retry sign out" : "Sign out"}
      </button>
      {error ? (
        <p
          className="max-w-64 text-right text-xs leading-4 text-rose-300"
          id="logout-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
