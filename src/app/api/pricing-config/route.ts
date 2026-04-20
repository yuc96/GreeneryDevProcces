import { NextResponse } from "next/server";
import {
  loadPricingConfig,
  savePricingConfig,
} from "@/server/pricing/pricing-config-store";
import { handleRouteError } from "@/server/route-utils";

export async function GET() {
  try {
    const config = await loadPricingConfig();
    return NextResponse.json(config);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const saved = await savePricingConfig(body);
    return NextResponse.json(saved);
  } catch (e) {
    if (e instanceof Error) {
      return NextResponse.json({ message: e.message }, { status: 400 });
    }
    return handleRouteError(e);
  }
}
