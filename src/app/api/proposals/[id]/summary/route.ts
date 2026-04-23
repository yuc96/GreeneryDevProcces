import { NextResponse } from "next/server";
import { getProposalSummary } from "@/server/proposals-store";
import { handleRouteError } from "@/server/route-utils";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    return NextResponse.json(await getProposalSummary(id));
  } catch (e) {
    return handleRouteError(e);
  }
}
