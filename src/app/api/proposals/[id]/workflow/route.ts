import { NextResponse } from "next/server";
import { getProposalsStore } from "@/server/proposals-store";
import { handleRouteError } from "@/server/route-utils";
import { parseWorkflowAction } from "@/server/validate-proposal";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const action = parseWorkflowAction(body);
    const store = getProposalsStore();
    if (action === "send_to_client") {
      const proposal = store.markAsSent(id);
      return NextResponse.json({ proposal, purchaseOrders: [] });
    }
    const result = store.approveAndGenerateOrders(id);
    return NextResponse.json(result);
  } catch (e) {
    return handleRouteError(e);
  }
}
