import { NextResponse } from "next/server";
import {
  loadLaborEngineConfig,
  saveLaborEngineConfig,
} from "@/server/pricing/labor-config-store";
import { handleRouteError } from "@/server/route-utils";

export async function GET() {
  try {
    const config = await loadLaborEngineConfig();
    return NextResponse.json(config);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const saved = await saveLaborEngineConfig(body);
    return NextResponse.json(saved);
  } catch (e) {
    if (e instanceof Error) {
      return NextResponse.json({ message: e.message }, { status: 400 });
    }
    return handleRouteError(e);
  }
}
