"use client";

import { useEffect, useState } from "react";
import type { SummaryResponse } from "@/lib/types";
import { ClientProposalBody } from "./ClientProposalBody";

/**
 * Loads proposal summary in the browser so large `items[].photos` data URLs
 * are not passed through the React Server Components payload (which can drop
 * or truncate very large props).
 */
export function ClientProposalLoader({ proposalId }: { proposalId: string }) {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<"not_found" | "failed" | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setData(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/proposals/${encodeURIComponent(proposalId)}/summary`,
          { cache: "no-store" },
        );
        if (res.status === 404) {
          if (!cancelled) setError("not_found");
          return;
        }
        if (!res.ok) {
          if (!cancelled) setError("failed");
          return;
        }
        const json = (await res.json()) as SummaryResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [proposalId]);

  if (error === "not_found") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-gray-600 dark:text-gray-400">
        This proposal was not found.
      </div>
    );
  }
  if (error === "failed") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-red-700 dark:text-red-300">
        Could not load this proposal. Try again later.
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-gray-500 dark:text-gray-400">
        Loading proposal…
      </div>
    );
  }
  return <ClientProposalBody data={data} />;
}
