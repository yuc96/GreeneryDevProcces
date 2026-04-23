import { NextResponse } from "next/server";
import * as clientsStore from "@/server/clients-store";
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
    const updated = await clientsStore.updateClient(id, {
      companyName: String(b.companyName ?? ""),
      contactName: String(b.contactName ?? ""),
      email: String(b.email ?? ""),
      phone: b.phone != null ? String(b.phone) : undefined,
      companyPhone: String(b.companyPhone ?? ""),
      companyContact: String(b.companyContact ?? ""),
      isExistingCustomer:
        typeof b.isExistingCustomer === "boolean"
          ? b.isExistingCustomer
          : undefined,
    });
    return NextResponse.json(updated);
  } catch (e) {
    return handleRouteError(e);
  }
}
