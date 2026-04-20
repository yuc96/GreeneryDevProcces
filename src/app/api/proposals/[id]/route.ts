import { NextResponse } from "next/server";
import { getProposalsStore } from "@/server/proposals-store";
import { handleRouteError } from "@/server/route-utils";
import { parsePatchGeneral } from "@/server/validate-proposal";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    return NextResponse.json(getProposalsStore().findOne(id));
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const dto = parsePatchGeneral(body);
    return NextResponse.json(getProposalsStore().patchGeneral(id, dto));
  } catch (e) {
    return handleRouteError(e);
  }
}
