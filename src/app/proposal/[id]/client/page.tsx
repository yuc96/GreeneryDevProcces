import { PrintBar } from "@/components/PrintBar";
import { ClientProposalLoader } from "./ClientProposalLoader";

export const dynamic = "force-dynamic";

export default async function ClientProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <div className="no-print flex flex-wrap items-center justify-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 text-center text-gray-800">
        <p className="max-w-xl text-xs text-gray-600">
          Standalone link: use Print → Save as PDF; enable background graphics.
        </p>
        <PrintBar />
      </div>

      <ClientProposalLoader proposalId={id} />
    </>
  );
}
