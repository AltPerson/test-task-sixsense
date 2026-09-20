"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { signIn, type SignInError } from "@/features/auth/auth-api";

const DEMO_ACCOUNTS = {
  analyst: {
    email: "ana@quillmere.example",
    password: "demo-analyst",
  },
  observer: {
    email: "oli@quillmere.example",
    password: "demo-observer",
  },
} as const;

export function SignInForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<SignInError | null>(null);
  const retryAfterSeconds = error?.retryAfterSeconds;

  useEffect(() => {
    if (retryAfterSeconds === undefined || retryAfterSeconds <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setError((current) =>
        current?.retryAfterSeconds === undefined
          ? current
          : {
              ...current,
              retryAfterSeconds: Math.max(
                0,
                current.retryAfterSeconds - 1,
              ),
            },
      );
    }, 1_000);

    return () => window.clearTimeout(timer);
  }, [retryAfterSeconds]);

  function fillDemoAccount(account: keyof typeof DEMO_ACCOUNTS) {
    setEmail(DEMO_ACCOUNTS[account].email);
    setPassword(DEMO_ACCOUNTS[account].password);
    setError((current) =>
      current?.retryAfterSeconds && current.retryAfterSeconds > 0
        ? current
        : null,
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await signIn({ email, password });

    if (result.ok) {
      // A successful login may replace another account in the same tab. Never
      // let account-scoped metadata survive that authentication boundary.
      queryClient.clear();
      router.replace("/");
      router.refresh();
    } else {
      setError(result.error);
    }

    setPending(false);
  }

  const retryBlocked =
    retryAfterSeconds !== undefined && retryAfterSeconds > 0;

  return (
    <div>
      <div>
        <p className="text-sm font-semibold text-sky-700">Secure workspace</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          Sign in
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Your backend credentials are exchanged server-side. Only an opaque
          application session is stored in the browser.
        </p>
      </div>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
        <div>
          <label
            className="block text-sm font-medium text-slate-800"
            htmlFor="email"
          >
            Email
          </label>
          <input
            autoComplete="username"
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-3 focus:ring-sky-100"
            id="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            required
            type="email"
            value={email}
          />
        </div>

        <div>
          <label
            className="block text-sm font-medium text-slate-800"
            htmlFor="password"
          >
            Password
          </label>
          <input
            autoComplete="current-password"
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-3 focus:ring-sky-100"
            id="password"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </div>

        {error ? (
          <div
            aria-live="polite"
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
            role="alert"
          >
            <p>{error.message}</p>
            {retryBlocked ? (
              <p className="mt-1 font-medium">
                Try again in {retryAfterSeconds} seconds.
              </p>
            ) : null}
          </div>
        ) : null}

        <button
          className="flex w-full items-center justify-center rounded-lg bg-sky-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          disabled={pending || retryBlocked}
          type="submit"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="mt-8 border-t border-slate-200 pt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Demo accounts
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:border-sky-400 hover:text-sky-800"
            onClick={() => fillDemoAccount("analyst")}
            type="button"
          >
            Use analyst
          </button>
          <button
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:border-sky-400 hover:text-sky-800"
            onClick={() => fillDemoAccount("observer")}
            type="button"
          >
            Use observer
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Selecting an account only fills the form. Review it before signing
          in.
        </p>
      </div>
    </div>
  );
}
