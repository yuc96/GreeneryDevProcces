import { notFound } from "next/navigation";
import { PrintBar } from "@/components/PrintBar";
import { HttpError } from "@/server/http-error";
import { getProposalsStore } from "@/server/proposals-store";
import type { SummaryResponse } from "@/lib/types";
import { ClientProposalBody } from "./ClientProposalBody";

export const dynamic = "force-dynamic";

function loadSummary(id: string): SummaryResponse {
  try {
    return getProposalsStore().getSummary(id) as SummaryResponse;
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
}

export default async function ClientProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = loadSummary(id);

  return (
    <>
      <div className="no-print flex flex-wrap items-center justify-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 text-center text-gray-800">
        <p className="max-w-xl text-xs text-gray-600">
          Standalone link: use Print → Save as PDF; enable background graphics.
        </p>
        <PrintBar />
      </div>

      <ClientProposalBody data={data} />
    </>
  );
}
