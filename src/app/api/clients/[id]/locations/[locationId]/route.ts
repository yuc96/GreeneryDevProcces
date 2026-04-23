import { NextResponse } from "next/server";
import { updateClientLocation } from "@/server/clients-store";
import { handleRouteError } from "@/server/route-utils";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; locationId: string }> },
) {
  try {
    const { id, locationId } = await ctx.params;
    const body = (await req.json()) as unknown;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;
    const dto: { name?: string; address?: string } = {};
    if (b.name !== undefined) dto.name = String(b.name);
    if (b.address !== undefined) dto.address = String(b.address);
    const result = await updateClientLocation(id, locationId, dto);
    return NextResponse.json(result);
  } catch (e) {
    return handleRouteError(e);
  }
}
