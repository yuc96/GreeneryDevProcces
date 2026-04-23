import { NextResponse } from "next/server";
import {
  addClientLocation,
  locationsForClient,
} from "@/server/clients-store";
import { handleRouteError } from "@/server/route-utils";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    return NextResponse.json(await locationsForClient(id));
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(
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
    const result = await addClientLocation(id, {
      name: String(b.name ?? ""),
      address: String(b.address ?? ""),
    });
    return NextResponse.json(result);
  } catch (e) {
    return handleRouteError(e);
  }
}
