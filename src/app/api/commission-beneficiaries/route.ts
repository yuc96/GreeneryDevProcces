import { NextResponse } from "next/server";
import {
  createCommissionBeneficiary,
  listCommissionBeneficiaries,
} from "@/server/commission-beneficiaries-store";
import { handleRouteError } from "@/server/route-utils";

export async function GET() {
  try {
    const rows = await listCommissionBeneficiaries();
    return NextResponse.json(rows);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as unknown;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;
    const created = await createCommissionBeneficiary({
      name: String(b.name ?? ""),
      email: String(b.email ?? ""),
      phone: b.phone != null ? String(b.phone) : undefined,
    });
    return NextResponse.json(created);
  } catch (e) {
    return handleRouteError(e);
  }
}
