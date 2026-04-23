import { NextResponse } from "next/server";
import { replaceRotationsProposal } from "@/server/proposals-store";
import { handleRouteError } from "@/server/route-utils";
import { parseReplaceRotations } from "@/server/validate-proposal";

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const rotations = parseReplaceRotations(body);
    return NextResponse.json(await replaceRotationsProposal(id, rotations));
  } catch (e) {
    return handleRouteError(e);
  }
}
