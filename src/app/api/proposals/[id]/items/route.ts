import { NextResponse } from "next/server";
import { replaceItemsProposal } from "@/server/proposals-store";
import { handleRouteError } from "@/server/route-utils";
import { parseReplaceItems } from "@/server/validate-proposal";

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const items = parseReplaceItems(body);
    return NextResponse.json(await replaceItemsProposal(id, items));
  } catch (e) {
    return handleRouteError(e);
  }
}
