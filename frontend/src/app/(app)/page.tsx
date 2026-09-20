import { Suspense } from "react";

import { SearchBuilder } from "@/features/search/ui/search-builder";

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm text-slate-600">Loading search builder…</p>
        </div>
      }
    >
      <SearchBuilder />
    </Suspense>
  );
}
