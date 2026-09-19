export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-16 lg:px-10">
      <section className="max-w-2xl space-y-5">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
          Network traffic analysis
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          Investigation workspace
        </h1>
        <p className="max-w-xl text-lg leading-8 text-slate-600">
          The application foundation is ready. Secure sign-in and the analyst
          search workflow are the next implementation milestones.
        </p>
      </section>
    </main>
  );
}
