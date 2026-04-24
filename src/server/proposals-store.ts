import { randomUUID } from "crypto";
import {
  accountingCodeForSaleType,
  type ClientRequirementLineEntity,
  type PurchaseOrderEntity,
  type ProposalEntity,
  type ProposalItemEntity,
  type ProposalLaborLineEntity,
  type ProposalRotationEntity,
  type SaleType,
} from "./domain";
import * as clientsStore from "./clients-store";
import { HttpError } from "./http-error";
import {
  computeProposal,
  defaultLaborLines,
  normalizeLaborLines,
  pickDefaultRotationCatalogPrice,
  truckFeeForPlantCount,
  type RotationLineState,
} from "./pricing/compute-proposal";
import {
  getCachedLaborEngineConfig,
  loadLaborEngineConfig,
} from "./pricing/labor-config-store";
import {
  getCachedPricingConfig,
  loadPricingConfig,
} from "./pricing/pricing-config-store";
import type {
  ProposalListSummaryRow,
  PurchaseOrderPrintData,
} from "@/lib/types";
import { vendorPickupAddressForPo } from "@/lib/purchase-order-vendor-address";
import { COL } from "@/infrastructure/mongo/collections";
import { getMongoDb } from "@/infrastructure/mongo/mongo-client";
import {
  asDocCollection,
  filterById,
} from "@/infrastructure/mongo/mongo-string-id";

export type { ProposalListSummaryRow };

export interface CreateProposalInput {
  clientId: string;
  locationId: string;
  saleType: SaleType;
}

export interface ProposalItemInput {
  id?: string;
  category: ProposalItemEntity["category"];
  catalogId: string;
  name: string;
  area?: string;
  qty: number;
  wholesaleCost: number;
  markup: number;
  freightRate: number;
  clientOwnsPot?: boolean;
  requiresRotation: boolean;
  vendorName: string;
  vendorAddress: string;
  photos?: string[];
  sizeInches?: number | null;
  environment?: "indoor" | "outdoor";
  plantingWithoutPot?: boolean;
  guaranteed?: boolean;
  relatedPlantItemId?: string;
  stagingImageUrl?: string;
  sourceRequirementLineId?: string;
  fromRequirementsPot?: boolean;
  /** Plants only: user opted out of auto-embedded catalog suggested photo. */
  plantPhotoSuggestedDismissed?: boolean;
}

export interface ProposalRotationInput {
  id?: string;
  itemId: string;
  plantName: string;
  qty: number;
  frequencyName: string;
  frequencyWeeks: 4 | 6 | 8;
  rotationUnitPrice: number;
  truckFee: number;
}

export interface PatchProposalGeneralInput {
  contactName?: string;
  submittedBy?: string;
  /** Must belong to the proposal's client. */
  locationId?: string;
  maintenanceTier?: "tier_1" | "tier_2" | "tier_3";
  requirementLines?: ClientRequirementLineEntity[];
  laborLines?: ProposalLaborLineEntity[];
  commissionPct?: number;
  commissionBeneficiaries?: number;
  commissionBeneficiaryIds?: string[];
  commissionBeneficiaryId?: string | null;
  commissionBeneficiaryName?: string;
  commissionBeneficiaryPhone?: string;
  commissionBeneficiaryEmail?: string;
}

type ProposalMongoDoc = ProposalEntity & {
  purchaseOrders: PurchaseOrderEntity[];
};

async function ensurePricingAndLaborLoaded(): Promise<void> {
  await Promise.all([loadPricingConfig(), loadLaborEngineConfig()]);
}

function ensureProposalShape(p: ProposalEntity): void {
  if (!p.laborLines?.length) {
    p.laborLines = defaultLaborLines();
  } else {
    p.laborLines = normalizeLaborLines(p.laborLines);
  }
  if (p.commissionPct === undefined || p.commissionPct === null) {
    p.commissionPct = 0;
  }
  if (
    p.commissionBeneficiaries === undefined ||
    p.commissionBeneficiaries === null
  ) {
    p.commissionBeneficiaries = 0;
  }
  if (p.commissionBeneficiaryName === undefined)
    p.commissionBeneficiaryName = "";
  if (p.commissionBeneficiaryPhone === undefined)
    p.commissionBeneficiaryPhone = "";
  if (p.commissionBeneficiaryEmail === undefined)
    p.commissionBeneficiaryEmail = "";
  if (!Array.isArray(p.commissionBeneficiaryIds)) {
    p.commissionBeneficiaryIds = p.commissionBeneficiaryId
      ? [p.commissionBeneficiaryId]
      : [];
  }
  p.commissionBeneficiaryIds = [
    ...new Set(
      p.commissionBeneficiaryIds.filter(
        (x) => typeof x === "string" && x.trim(),
      ),
    ),
  ];
  syncLegacyCommissionBeneficiaryFields(p);
  if (!Array.isArray(p.requirementLines)) {
    p.requirementLines = [];
  } else {
    p.requirementLines = p.requirementLines.map((line) => ({
      ...line,
      environment: line.environment === "outdoor" ? "outdoor" : "indoor",
      clientHasPot: Boolean(line.clientHasPot),
      plantingWithoutPot: Boolean(line.plantingWithoutPot),
      guaranteed: Boolean(line.guaranteed),
    }));
  }
}

function syncLegacyCommissionBeneficiaryFields(p: ProposalEntity): void {
  const ids = p.commissionBeneficiaryIds ?? [];
  if (ids.length > 0) {
    p.commissionBeneficiaryId = ids[0];
  } else {
    p.commissionBeneficiaryId = undefined;
  }
}

function rotationLineFromEntity(r: ProposalRotationEntity): RotationLineState {
  return {
    qty: r.qty,
    frequencyWeeks: r.frequencyWeeks,
    rotationUnitPrice: r.rotationUnitPrice,
    truckFee: r.truckFee,
    plantName: r.plantName,
  };
}

function buildPurchaseOrder(input: {
  proposalId: string;
  sequence: 1 | 2;
  kind: "plants" | "pots_staging";
  createdAt: string;
  items: ProposalItemEntity[];
}): PurchaseOrderEntity {
  const totals = input.items.reduce(
    (acc, it) => {
      const wholesale = it.wholesaleCost * it.qty;
      const retail = wholesale * it.markup;
      const freight = wholesale * it.freightRate;
      return {
        wholesale: acc.wholesale + wholesale,
        retail: acc.retail + retail,
        freight: acc.freight + freight,
      };
    },
    { wholesale: 0, retail: 0, freight: 0 },
  );
  return {
    id: randomUUID(),
    proposalId: input.proposalId,
    sequence: input.sequence,
    kind: input.kind,
    status: "draft",
    createdAt: input.createdAt,
    items: input.items,
    totals,
  };
}

async function readProposalBundle(id: string): Promise<{
  proposal: ProposalEntity;
  purchaseOrders: PurchaseOrderEntity[];
}> {
  const db = await getMongoDb();
  const doc = await asDocCollection(db, COL.proposals).findOne(filterById(id));
  if (!doc) throw new HttpError(404, `Proposal ${id} not found`);
  const d = doc as unknown as ProposalMongoDoc & { _id: string };
  const purchaseOrders = Array.isArray(d.purchaseOrders)
    ? d.purchaseOrders
    : [];
  const rest = { ...d } as Record<string, unknown>;
  delete rest.purchaseOrders;
  const pid = String(rest._id);
  delete rest._id;
  delete rest.id;
  const proposal = { ...rest, id: pid } as ProposalEntity;
  ensureProposalShape(proposal);
  return { proposal, purchaseOrders };
}

async function writeProposalBundle(
  proposal: ProposalEntity,
  purchaseOrders: PurchaseOrderEntity[],
): Promise<void> {
  const db = await getMongoDb();
  const doc: Record<string, unknown> = {
    _id: proposal.id,
    ...proposal,
    id: proposal.id,
    purchaseOrders,
  };
  await asDocCollection(db, COL.proposals).replaceOne(
    filterById(proposal.id),
    doc,
    { upsert: true },
  );
}

async function nextProposalNumber(): Promise<string> {
  const db = await getMongoDb();
  const y = new Date().getFullYear();
  // NOTE: Do NOT include `seq` in $setOnInsert while also using $inc on it —
  // MongoDB rejects that with ConflictingUpdateOperators (code 40).
  // On upsert, $inc on a non-existent field starts from 0, so the new
  // document will have seq: 1 after this operation.
  const result = await asDocCollection(
    db,
    COL.proposalCounters,
  ).findOneAndUpdate(
    filterById("global"),
    { $inc: { seq: 1 } } as Record<string, unknown>,
    { upsert: true, returnDocument: "after" },
  );
  // The Node MongoDB driver v6 returns the updated document directly (or null),
  // whereas older versions wrapped it in `{ value }`. Support both shapes.
  const doc =
    (result as { value?: { seq?: number } } | null)?.value ??
    (result as { seq?: number } | null) ??
    null;
  const seq =
    typeof doc?.seq === "number" && Number.isFinite(doc.seq) ? doc.seq : 1;
  return `PRO-${y}-${String(seq).padStart(3, "0")}`;
}

function assertEditable(p: ProposalEntity): void {
  if (p.status === "approved") {
    throw new HttpError(
      409,
      "Approved proposals are read-only. Create a new proposal or reject to edit.",
    );
  }
}

function syncRotationsFromPlants(p: ProposalEntity) {
  const cfg = getCachedPricingConfig();
  const totalPlantUnits = p.items
    .filter((i) => i.category === "plant")
    .reduce((sum, i) => sum + Math.max(0, Number(i.qty) || 0), 0);
  const fromPlants = p.items.filter(
    (i) => i.category === "plant" && i.requiresRotation,
  );
  const existingByItem = new Map(
    p.rotations.map((r) => [r.itemId, r] as const),
  );
  const next: ProposalRotationEntity[] = [];
  for (const plant of fromPlants) {
    const prev = existingByItem.get(plant.id);
    const defaultWeeks = cfg.defaultRotationFrequencyWeeks;
    const defaultTruck = truckFeeForPlantCount(totalPlantUnits, cfg);
    const defaultPrice = pickDefaultRotationCatalogPrice(plant.name, cfg);
    next.push({
      id: prev?.id ?? `rot-${plant.id}`,
      itemId: plant.id,
      plantName: plant.name,
      qty: plant.qty,
      frequencyName: prev?.frequencyName ?? `Every ${defaultWeeks} weeks`,
      frequencyWeeks: prev?.frequencyWeeks ?? defaultWeeks,
      rotationUnitPrice: prev?.rotationUnitPrice ?? defaultPrice,
      truckFee: prev?.truckFee ?? defaultTruck,
    });
  }
  p.rotations = next;
}

function computeSummary(p: ProposalEntity) {
  ensureProposalShape(p);
  const cfg = getCachedPricingConfig();
  const eng = computeProposal(
    cfg,
    {
      items: p.items,
      rotations: p.rotations.map(rotationLineFromEntity),
      laborLines: p.laborLines,
      commissionPct: p.commissionPct,
      commissionBeneficiaries: p.commissionBeneficiaries,
    },
    { laborEngineConfig: getCachedLaborEngineConfig() },
  );
  return {
    totals: eng.totals,
    laborCost: eng.laborCost,
    laborByLine: eng.laborByLine,
    maintenanceMonthly: eng.maintenanceMonthly,
    maintenanceBreakdown: eng.maintenanceBreakdown,
    rotationsAnnual: eng.rotationsAnnual,
    rotationLines: eng.rotationLines,
    commissionGross: eng.commissionGross,
    commissionPerBeneficiary: eng.commissionPerBeneficiary,
    costBaseTotal: eng.costBaseTotal,
    priceToClientInitial: eng.priceToClientInitial,
    priceToClientAnnual: eng.priceToClientAnnual,
    grossMargin: eng.grossMargin,
    marginPct: eng.marginPct,
  };
}

export async function listProposalSummaries(): Promise<
  ProposalListSummaryRow[]
> {
  await ensurePricingAndLaborLoaded();
  const db = await getMongoDb();
  const proposals = await asDocCollection(db, COL.proposals)
    .find({})
    .sort({ updatedAt: -1 })
    .toArray();
  const clients = await clientsStore.listClients();
  const clientById = new Map(clients.map((c) => [c.id, c] as const));
  const rows: ProposalListSummaryRow[] = [];
  for (const raw of proposals) {
    const p = raw as unknown as ProposalMongoDoc & { _id: string };
    const pid = p.id ?? String(p._id);
    const shaped = { ...p, id: pid } as ProposalEntity;
    ensureProposalShape(shaped);
    let clientName = "—";
    let locationName = "—";
    const c = clientById.get(shaped.clientId);
    if (c) {
      clientName = c.companyName;
      const loc = c.locations.find((l) => l.id === shaped.locationId);
      locationName = loc?.name ?? "—";
    }
    rows.push({
      id: pid,
      number: shaped.number,
      status: shaped.status,
      clientName,
      locationName,
      createdAt: shaped.createdAt,
      updatedAt: shaped.updatedAt,
    });
  }
  return rows;
}

export async function createProposal(
  dto: CreateProposalInput,
): Promise<ProposalEntity> {
  await ensurePricingAndLaborLoaded();
  let client;
  try {
    client = await clientsStore.findClient(dto.clientId);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) {
      throw new HttpError(
        400,
        "Unknown clientId — pick a client from the list (data is stored in MongoDB).",
      );
    }
    throw e;
  }
  const loc = client.locations.find((l) => l.id === dto.locationId);
  if (!loc) {
    throw new HttpError(400, "locationId does not belong to client");
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  const number = await nextProposalNumber();
  const entity: ProposalEntity = {
    id,
    number,
    clientId: dto.clientId,
    locationId: dto.locationId,
    saleType: dto.saleType,
    accountingCode: accountingCodeForSaleType(dto.saleType),
    status: "draft",
    contactName: client.contactName,
    submittedBy: "Cindi Deyoung",
    maintenanceTier: "tier_2",
    requirementLines: [],
    items: [],
    rotations: [],
    laborCost: 0,
    laborLines: defaultLaborLines(),
    commissionPct: 0,
    commissionBeneficiaries: 0,
    commissionBeneficiaryIds: [],
    commissionBeneficiaryId: undefined,
    commissionBeneficiaryName: "",
    commissionBeneficiaryPhone: "",
    commissionBeneficiaryEmail: "",
    sentAt: undefined,
    approvedAt: undefined,
    createdAt: now,
    updatedAt: now,
  };
  ensureProposalShape(entity);
  await writeProposalBundle(entity, []);
  return entity;
}

export async function findProposal(id: string): Promise<ProposalEntity> {
  await ensurePricingAndLaborLoaded();
  const { proposal } = await readProposalBundle(id);
  return proposal;
}

export async function patchGeneralProposal(
  id: string,
  dto: PatchProposalGeneralInput,
): Promise<ProposalEntity> {
  await ensurePricingAndLaborLoaded();
  const { proposal: p, purchaseOrders } = await readProposalBundle(id);
  assertEditable(p);
  if (dto.contactName !== undefined) p.contactName = dto.contactName;
  if (dto.submittedBy !== undefined) p.submittedBy = dto.submittedBy;
  if (dto.locationId !== undefined) {
    const client = await clientsStore.findClient(p.clientId);
    const ok = client.locations.some((l) => l.id === dto.locationId);
    if (!ok) {
      throw new HttpError(
        400,
        "locationId does not belong to this proposal's client",
      );
    }
    p.locationId = dto.locationId;
  }
  if (dto.maintenanceTier !== undefined)
    p.maintenanceTier = dto.maintenanceTier;
  if (dto.requirementLines !== undefined) {
    p.requirementLines = dto.requirementLines;
  }
  if (dto.laborLines !== undefined) {
    p.laborLines = normalizeLaborLines(dto.laborLines);
  }
  if (dto.commissionPct !== undefined) {
    p.commissionPct = Math.max(0, dto.commissionPct);
  }
  if (dto.commissionBeneficiaries !== undefined) {
    p.commissionBeneficiaries = Math.max(
      0,
      Math.floor(dto.commissionBeneficiaries),
    );
  }
  if (dto.commissionBeneficiaryIds !== undefined) {
    const raw = dto.commissionBeneficiaryIds;
    const list = Array.isArray(raw)
      ? raw.map((x) => String(x).trim()).filter(Boolean)
      : [];
    p.commissionBeneficiaryIds = [...new Set(list)].slice(0, 50);
    syncLegacyCommissionBeneficiaryFields(p);
  }
  if (dto.commissionBeneficiaryId !== undefined) {
    if (dto.commissionBeneficiaryId === null) {
      p.commissionBeneficiaryId = undefined;
    } else {
      const raw = dto.commissionBeneficiaryId.trim();
      p.commissionBeneficiaryId = raw.length > 0 ? raw : undefined;
    }
  }
  if (
    dto.commissionBeneficiaryIds === undefined &&
    dto.commissionBeneficiaryId !== undefined
  ) {
    if (dto.commissionBeneficiaryId === null) {
      p.commissionBeneficiaryIds = [];
    } else {
      const raw = dto.commissionBeneficiaryId.trim();
      p.commissionBeneficiaryIds = raw ? [raw] : [];
    }
    syncLegacyCommissionBeneficiaryFields(p);
  }
  if (dto.commissionBeneficiaryName !== undefined) {
    p.commissionBeneficiaryName = String(dto.commissionBeneficiaryName ?? "");
  }
  if (dto.commissionBeneficiaryPhone !== undefined) {
    p.commissionBeneficiaryPhone = String(dto.commissionBeneficiaryPhone ?? "");
  }
  if (dto.commissionBeneficiaryEmail !== undefined) {
    p.commissionBeneficiaryEmail = String(dto.commissionBeneficiaryEmail ?? "");
  }
  const maxByCount = Math.max(0, Math.floor(p.commissionBeneficiaries ?? 0));
  if (Array.isArray(p.commissionBeneficiaryIds)) {
    p.commissionBeneficiaryIds = p.commissionBeneficiaryIds.slice(
      0,
      maxByCount,
    );
    syncLegacyCommissionBeneficiaryFields(p);
  }
  const cfg = getCachedPricingConfig();
  const eng = computeProposal(
    cfg,
    {
      items: p.items,
      rotations: p.rotations.map(rotationLineFromEntity),
      laborLines: p.laborLines,
      commissionPct: p.commissionPct,
      commissionBeneficiaries: p.commissionBeneficiaries,
    },
    { laborEngineConfig: getCachedLaborEngineConfig() },
  );
  p.laborCost = eng.laborCost;
  p.updatedAt = new Date().toISOString();
  await writeProposalBundle(p, purchaseOrders);
  return p;
}

export async function replaceItemsProposal(
  id: string,
  items: ProposalItemInput[],
): Promise<ProposalEntity> {
  await ensurePricingAndLaborLoaded();
  const { proposal: p, purchaseOrders } = await readProposalBundle(id);
  assertEditable(p);
  const prevById = new Map(p.items.map((x) => [x.id, x] as const));
  p.items = items.map((row) => {
    const keepId = row.id && prevById.has(row.id) ? row.id : randomUUID();
    const prev = prevById.get(keepId);
    let photos: string[] | undefined;
    if (row.category === "plant") {
      photos =
        row.photos !== undefined
          ? row.photos
          : prev?.photos?.length
            ? [...(prev.photos ?? [])]
            : [];
    }
    const plantPhotoDismissPatch =
      row.category === "plant"
        ? row.plantPhotoSuggestedDismissed === true
          ? ({ plantPhotoSuggestedDismissed: true } as const)
          : row.plantPhotoSuggestedDismissed === false
            ? ({} as Record<string, never>)
            : prev?.plantPhotoSuggestedDismissed === true
              ? ({ plantPhotoSuggestedDismissed: true } as const)
              : ({} as Record<string, never>)
        : ({} as Record<string, never>);
    return {
      id: keepId,
      category: row.category,
      catalogId: row.catalogId,
      name: row.name,
      area: row.area,
      qty: row.qty,
      wholesaleCost: row.wholesaleCost,
      markup: row.markup,
      freightRate: row.freightRate,
      clientOwnsPot: row.clientOwnsPot ?? false,
      requiresRotation: row.requiresRotation,
      vendorName: row.vendorName,
      vendorAddress: row.vendorAddress,
      photos,
      sizeInches: row.sizeInches ?? prev?.sizeInches ?? null,
      environment: row.environment ?? prev?.environment ?? "indoor",
      plantingWithoutPot:
        row.plantingWithoutPot !== undefined
          ? row.plantingWithoutPot
          : (prev?.plantingWithoutPot ?? false),
      guaranteed:
        row.guaranteed !== undefined
          ? row.guaranteed
          : (prev?.guaranteed ?? false),
      relatedPlantItemId:
        row.category === "staging"
          ? (row.relatedPlantItemId ?? prev?.relatedPlantItemId)
          : undefined,
      stagingImageUrl:
        row.category === "staging"
          ? (row.stagingImageUrl ?? prev?.stagingImageUrl)
          : undefined,
      sourceRequirementLineId:
        row.category === "plant"
          ? (row.sourceRequirementLineId ?? prev?.sourceRequirementLineId)
          : undefined,
      fromRequirementsPot:
        row.category === "pot"
          ? Boolean(row.fromRequirementsPot ?? prev?.fromRequirementsPot)
          : undefined,
      ...plantPhotoDismissPatch,
    };
  });
  syncRotationsFromPlants(p);
  const cfg = getCachedPricingConfig();
  const eng = computeProposal(
    cfg,
    {
      items: p.items,
      rotations: p.rotations.map(rotationLineFromEntity),
      laborLines: p.laborLines,
      commissionPct: p.commissionPct,
      commissionBeneficiaries: p.commissionBeneficiaries,
    },
    { laborEngineConfig: getCachedLaborEngineConfig() },
  );
  p.laborCost = eng.laborCost;
  p.updatedAt = new Date().toISOString();
  await writeProposalBundle(p, purchaseOrders);
  return p;
}

export async function replaceRotationsProposal(
  id: string,
  rotations: ProposalRotationInput[],
): Promise<ProposalEntity> {
  await ensurePricingAndLaborLoaded();
  const { proposal: p, purchaseOrders } = await readProposalBundle(id);
  assertEditable(p);
  p.rotations = rotations.map((r) => ({
    id: r.id && r.id.trim() ? r.id.trim() : randomUUID(),
    itemId: r.itemId,
    plantName: r.plantName,
    qty: r.qty,
    frequencyName: r.frequencyName,
    frequencyWeeks: r.frequencyWeeks,
    rotationUnitPrice: r.rotationUnitPrice,
    truckFee: r.truckFee,
  }));
  const cfg = getCachedPricingConfig();
  const eng = computeProposal(
    cfg,
    {
      items: p.items,
      rotations: p.rotations.map(rotationLineFromEntity),
      laborLines: p.laborLines,
      commissionPct: p.commissionPct,
      commissionBeneficiaries: p.commissionBeneficiaries,
    },
    { laborEngineConfig: getCachedLaborEngineConfig() },
  );
  p.laborCost = eng.laborCost;
  p.updatedAt = new Date().toISOString();
  await writeProposalBundle(p, purchaseOrders);
  return p;
}

export async function getProposalSummary(id: string) {
  await ensurePricingAndLaborLoaded();
  const { proposal: p, purchaseOrders } = await readProposalBundle(id);
  const calc = computeSummary(p);
  const client = await clientsStore.findClient(p.clientId);
  const loc = client.locations.find((l) => l.id === p.locationId);
  const rotationsWithEngine = p.rotations.map((r, i) => ({
    ...r,
    monthlyBilled: calc.rotationLines[i]?.monthly ?? 0,
    annualBilled: calc.rotationLines[i]?.annual ?? 0,
  }));
  return {
    requirementLines: p.requirementLines ?? [],
    proposal: {
      id: p.id,
      number: p.number,
      status: p.status,
      saleType: p.saleType,
      accountingCode: p.accountingCode,
      contactName: p.contactName,
      submittedBy: p.submittedBy,
      maintenanceTier: p.maintenanceTier,
      sentAt: p.sentAt,
      approvedAt: p.approvedAt,
    },
    client: {
      name: client.companyName,
      contactName: client.contactName,
      email: client.email,
      phone: client.phone,
      companyPhone: client.companyPhone,
      companyContact: client.companyContact,
    },
    location: loc ? { name: loc.name, address: loc.address } : null,
    calculations: calc,
    items: p.items,
    rotations: rotationsWithEngine,
    laborLines: p.laborLines,
    commissionPct: p.commissionPct,
    commissionBeneficiaries: p.commissionBeneficiaries,
    commissionBeneficiaryIds: p.commissionBeneficiaryIds ?? [],
    workflow: { purchaseOrders },
  };
}

export async function markProposalSent(id: string): Promise<ProposalEntity> {
  await ensurePricingAndLaborLoaded();
  const { proposal: p, purchaseOrders } = await readProposalBundle(id);
  if (p.status === "draft") {
    p.status = "pending_approval";
    p.sentAt = new Date().toISOString();
    p.updatedAt = p.sentAt;
  }
  await writeProposalBundle(p, purchaseOrders);
  return p;
}

export async function approveAndGenerateOrdersProposal(id: string): Promise<{
  proposal: ProposalEntity;
  purchaseOrders: PurchaseOrderEntity[];
}> {
  await ensurePricingAndLaborLoaded();
  const { proposal: p } = await readProposalBundle(id);
  if (p.status === "draft") {
    p.status = "pending_approval";
    p.sentAt = new Date().toISOString();
  }
  const now = new Date().toISOString();
  p.status = "approved";
  p.approvedAt = now;
  p.updatedAt = now;

  const orders: PurchaseOrderEntity[] = [
    buildPurchaseOrder({
      proposalId: p.id,
      sequence: 1,
      kind: "plants",
      createdAt: now,
      items: p.items.filter((i) => i.category === "plant"),
    }),
    buildPurchaseOrder({
      proposalId: p.id,
      sequence: 2,
      kind: "pots_staging",
      createdAt: now,
      items: p.items.filter(
        (i) => i.category === "pot" || i.category === "staging",
      ),
    }),
  ];
  await writeProposalBundle(p, orders);
  return { proposal: p, purchaseOrders: orders };
}

export async function getPurchaseOrderPrint(
  proposalId: string,
  purchaseOrderId: string,
): Promise<PurchaseOrderPrintData> {
  await ensurePricingAndLaborLoaded();
  const { proposal: p, purchaseOrders } = await readProposalBundle(proposalId);
  const po = purchaseOrders.find((o) => o.id === purchaseOrderId);
  if (!po) {
    throw new HttpError(404, "Purchase order not found");
  }
  const client = await clientsStore.findClient(p.clientId);
  const loc = client.locations.find((l) => l.id === p.locationId);
  const items: PurchaseOrderPrintData["purchaseOrder"]["items"] = po.items.map(
    (it) => ({
      id: it.id,
      category: it.category,
      catalogId: it.catalogId,
      name: it.name,
      area: it.area,
      qty: it.qty,
      wholesaleCost: it.wholesaleCost,
      markup: it.markup,
      freightRate: it.freightRate,
      clientOwnsPot: it.clientOwnsPot,
      plantingWithoutPot: it.plantingWithoutPot ?? false,
      requiresRotation: it.requiresRotation,
      vendorName: it.vendorName?.trim() || "—",
      vendorAddress: vendorPickupAddressForPo(
        it.vendorName?.trim() || "",
        it.vendorAddress?.trim() || "",
      ),
    }),
  );
  return {
    proposalId: p.id,
    proposalNumber: p.number,
    clientName: client.companyName,
    jobSite: loc ? { name: loc.name, address: loc.address } : null,
    purchaseOrder: {
      id: po.id,
      sequence: po.sequence,
      kind: po.kind,
      createdAt: po.createdAt,
      items,
      totals: po.totals,
    },
  };
}
