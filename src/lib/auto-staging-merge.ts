import type { ProposalItemInput } from "@/lib/types";
import type { StagingLibraryItem } from "@/lib/staging-catalog";
import type { PricingEngineConfig } from "@/server/pricing/engine-schema";
import {
  computeAutoStagingForPlant,
  type StagingMaterialRef,
} from "@/server/pricing/auto-staging";
import { parseSizeInchesFromText } from "@/server/pricing/cpp-model";

function freightRateStaging(cfg: PricingEngineConfig): number {
  return cfg.materialFreightPct;
}

/** Stable key segment used in `staging-auto-<key>-<materialId>` catalogIds. */
export function plantKeyForStaging(
  plant: ProposalItemInput,
  plantOrderIndex: number,
): string {
  return plant.id ?? `idx-${plantOrderIndex}`;
}

export function serializeAutoStagingSlice(items: ProposalItemInput[]): string {
  return JSON.stringify(
    items
      .filter(
        (it) =>
          it.category === "staging" &&
          it.catalogId.startsWith("staging-auto-"),
      )
      .map((it) => [
        it.catalogId,
        it.qty,
        it.wholesaleCost,
        it.name,
        it.relatedPlantItemId ?? "",
        it.stagingImageUrl ?? "",
      ]),
  );
}

/**
 * Replaces all `staging-auto-*` lines with a fresh set from the current plant
 * lines; keeps manual staging (`staging-lib-*`, etc.).
 */
export function mergeAutoStagingIntoDraft(
  prev: ProposalItemInput[],
  engineConfig: PricingEngineConfig,
  stagingLibrary: StagingLibraryItem[],
): ProposalItemInput[] {
  const materialsRef = new Map<number, StagingMaterialRef>();
  for (const lib of stagingLibrary) {
    if (typeof lib.sourceId !== "number") continue;
    const cheapest =
      lib.providers && lib.providers.length > 0
        ? lib.providers.reduce((a, b) => (a.price <= b.price ? a : b))
        : null;
    materialsRef.set(lib.sourceId, {
      sourceId: lib.sourceId,
      name: lib.label.split(" — ")[0] ?? lib.label,
      unitWholesale: cheapest?.price ?? lib.wholesaleCost,
      vendorName: cheapest?.name ?? "Staging supplier",
      description: lib.description,
      imageUrl: lib.imageUrl,
    });
  }

  const kept = prev.filter(
    (it) =>
      it.category !== "staging" || !it.catalogId.startsWith("staging-auto-"),
  );
  const generated: ProposalItemInput[] = [];
  let plantIdx = 0;
  for (const it of prev) {
    if (it.category !== "plant") continue;
    const env = it.environment ?? "indoor";
    const pk = plantKeyForStaging(it, plantIdx);
    const result = computeAutoStagingForPlant(
      {
        plantLineId: pk,
        plantName: it.name,
        qty: Number(it.qty) || 0,
        potSizeInches:
          typeof it.sizeInches === "number"
            ? it.sizeInches
            : parseSizeInchesFromText(it.name ?? ""),
        environment: env,
        plantingWithoutPot: Boolean(it.plantingWithoutPot),
      },
      engineConfig,
      materialsRef,
    );
    for (const c of result.components) {
      const mat = materialsRef.get(c.materialSourceId);
      generated.push({
        category: "staging",
        catalogId: `staging-auto-${pk}-${c.materialSourceId}`,
        name: `${c.materialName} — ${it.name} (${result.bandLabel} · ${env === "indoor" ? "Indoor" : "Outdoor"})`,
        area: it.area,
        qty: c.units,
        wholesaleCost: c.unitWholesale,
        markup: engineConfig.defaultMarkup,
        freightRate: freightRateStaging(engineConfig),
        clientOwnsPot: false,
        requiresRotation: false,
        vendorName: c.vendorName,
        vendorAddress: "",
        relatedPlantItemId: pk,
        stagingImageUrl: mat?.imageUrl,
      });
    }
    plantIdx += 1;
  }
  return [...kept, ...generated];
}

export function autoStagingPlantSignature(prev: ProposalItemInput[]): string {
  return prev
    .filter((it) => it.category === "plant")
    .map((it) =>
      [
        it.id ?? "",
        it.qty,
        it.sizeInches ?? "",
        it.environment ?? "",
        it.plantingWithoutPot ? "1" : "0",
        it.name,
        it.area ?? "",
      ].join("\u001f"),
    )
    .join("|");
}

export interface StagingDraftGroup {
  key: string;
  title: string;
  plantPhoto?: string;
  rows: Array<{ it: ProposalItemInput; i: number }>;
}

/** Groups staging lines under each plant (auto) plus a bucket for manual lines. */
export function stagingGroupKeyFromLine(it: ProposalItemInput): string {
  if (it.category !== "staging") return "";
  const rid = it.relatedPlantItemId?.trim();
  if (rid) return rid;
  const m = /^staging-auto-(.+)-(\d+)$/.exec(it.catalogId);
  if (m?.[1]) return m[1];
  return "__manual__";
}

export function stagingSectionBanner(
  key: string,
  draftItems: ProposalItemInput[],
): { title: string; photo?: string } {
  if (key === "__manual__") return { title: "Other / manual catalog" };
  const plants = draftItems.filter((x) => x.category === "plant");
  let idx = 0;
  for (const p of plants) {
    const pk = plantKeyForStaging(p, idx);
    if (pk === key) return { title: p.name, photo: p.photos?.[0] };
    idx += 1;
  }
  return { title: "Plants" };
}

export function buildStagingDisplayGroups(
  draftItems: ProposalItemInput[],
): StagingDraftGroup[] {
  const plantRows = draftItems
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => it.category === "plant");
  const stagingRows = draftItems
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => it.category === "staging");

  const groupsMap = new Map<string, StagingDraftGroup>();
  const plantOrder: string[] = [];
  plantRows.forEach(({ it }, plantIdx) => {
    const pk = plantKeyForStaging(it, plantIdx);
    plantOrder.push(pk);
    groupsMap.set(pk, {
      key: pk,
      title: it.name,
      plantPhoto: it.photos?.[0],
      rows: [],
    });
  });

  const manual: StagingDraftGroup = {
    key: "__manual__",
    title: "Other / manual catalog",
    plantPhoto: undefined,
    rows: [],
  };

  for (const row of stagingRows) {
    const { it, i } = row;
    const rid = it.relatedPlantItemId?.trim();
    const parsed = /^staging-auto-(.+)-(\d+)$/.exec(it.catalogId);
    const pkCandidate = rid || parsed?.[1] || null;
    const g =
      pkCandidate && groupsMap.has(pkCandidate)
        ? groupsMap.get(pkCandidate)!
        : null;
    if (g) g.rows.push({ it, i });
    else manual.rows.push({ it, i });
  }

  const out: StagingDraftGroup[] = [];
  for (const k of plantOrder) {
    const g = groupsMap.get(k);
    if (g && g.rows.length > 0) out.push(g);
  }
  if (manual.rows.length > 0) out.push(manual);
  return out;
}
