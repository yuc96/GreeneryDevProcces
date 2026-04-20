import { NextResponse } from "next/server";
import {
  deleteCommissionBeneficiary,
  updateCommissionBeneficiary,
} from "@/server/commission-beneficiaries-store";
import { handleRouteError } from "@/server/route-utils";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as unknown;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;
    const updated = await updateCommissionBeneficiary(id, {
      name: b.name !== undefined ? String(b.name) : undefined,
      email: b.email !== undefined ? String(b.email) : undefined,
      phone:
        b.phone === null
          ? null
          : b.phone !== undefined
            ? String(b.phone)
            : undefined,
    });
    return NextResponse.json(updated);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    await deleteCommissionBeneficiary(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
