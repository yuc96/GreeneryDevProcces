import { NextResponse } from "next/server";
import * as clientsStore from "@/server/clients-store";
import { handleRouteError } from "@/server/route-utils";

export async function GET() {
  try {
    return NextResponse.json(await clientsStore.listClients());
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
    const created = await clientsStore.createClient({
      companyName: String(b.companyName ?? ""),
      contactName: String(b.contactName ?? ""),
      email: String(b.email ?? ""),
      phone: b.phone != null ? String(b.phone) : undefined,
      companyPhone: String(b.companyPhone ?? ""),
      companyContact: String(b.companyContact ?? ""),
      billingAddress:
        b.billingAddress != null ? String(b.billingAddress) : undefined,
      driveTimeMinutes:
        typeof b.driveTimeMinutes === "number"
          ? b.driveTimeMinutes
          : undefined,
      locations: Array.isArray(b.locations)
        ? (
            b.locations as {
              name?: string;
              address?: string;
              driveTimeMinutes?: number;
            }[]
          ).map((l) => ({
            name: String(l.name ?? ""),
            address: l.address != null ? String(l.address) : undefined,
            driveTimeMinutes:
              typeof l.driveTimeMinutes === "number"
                ? l.driveTimeMinutes
                : undefined,
          }))
        : [],
    });
    return NextResponse.json(created);
  } catch (e) {
    return handleRouteError(e);
  }
}
