import { notFound } from "next/navigation";
import { PrintBar } from "@/components/PrintBar";
import type { PurchaseOrderPrintData } from "@/lib/types";
import { HttpError } from "@/server/http-error";
import * as proposalsStore from "@/server/proposals-store";
import { PurchaseOrderPrintBody } from "./PurchaseOrderPrintBody";

export const dynamic = "force-dynamic";

export default async function PurchaseOrderPrintPage({
  params,
}: {
  params: Promise<{ id: string; poId: string }>;
}) {
  const { id, poId } = await params;
  let data: PurchaseOrderPrintData;
  try {
    data = await proposalsStore.getPurchaseOrderPrint(id, poId);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }

  return (
    <>
      <div className="no-print flex flex-wrap items-center justify-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 text-center text-gray-800">
        <p className="max-w-xl text-xs text-gray-600">
          Internal purchase order — use Print → Save as PDF; enable background
          graphics if totals look faint.
        </p>
        <PrintBar />
      </div>
      <PurchaseOrderPrintBody data={data} />
    </>
  );
}
