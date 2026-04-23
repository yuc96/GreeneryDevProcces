import { NextResponse } from "next/server";
import { readStagingLibraryItems } from "@/infrastructure/mongo/catalog-read";
import { getMongoDb } from "@/infrastructure/mongo/mongo-client";
import { handleRouteError } from "@/server/route-utils";
import {
  getCachedPricingConfig,
  loadPricingConfig,
} from "@/server/pricing/pricing-config-store";
import { snapMarkupToPricingLadder } from "@/lib/markup-select";

export async function GET() {
  try {
    await loadPricingConfig();
    const cfg = getCachedPricingConfig();
    const db = await getMongoDb();
    const rows = await readStagingLibraryItems(db, cfg.defaultMarkup);
    const snapped = rows.map((row) => ({
      ...row,
      markup: snapMarkupToPricingLadder(row.markup ?? cfg.defaultMarkup, cfg),
    }));
    return NextResponse.json(snapped);
  } catch (e) {
    return handleRouteError(e);
  }
}
