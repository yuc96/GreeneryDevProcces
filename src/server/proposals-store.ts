import { randomUUID } from "crypto";
import {
  accountingCodeForSaleType,
  type ClientRequirementLineEntity,
  type ClientEntity,
  type PurchaseOrderEntity,
  type ProposalEntity,
  type ProposalItemEntity,
  type ProposalLaborLineEntity,
  type ProposalRotationEntity,
  type SaleType,
} from "./domain";
import type { ClientsStore } from "./clients-store";
import { getClientsStore } from "./clients-store";
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
  getCachedPricingConfig,
  loadPricingConfig,
} from "./pricing/pricing-config-store";
import type { ProposalListSummaryRow, PurchaseOrderPrintData } from "@/lib/types";

export type { ProposalListSummaryRow };

export interface CreateProposalInput {
  clientId: string;
  locationId: string;
  saleType: SaleType;
}

export interface ProposalItemInput {
  /** When updating lines, pass server id so photos & rotations stay linked. */
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
  /** Plants only; data URLs from browser uploads. */
  photos?: string[];
  sizeInches?: number | null;
  environment?: "indoor" | "outdoor";
  plantingWithoutPot?: boolean;
  guaranteed?: boolean;
  relatedPlantItemId?: string;
  stagingImageUrl?: string;
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
  maintenanceTier?: "tier_1" | "tier_2" | "tier_3";
  requirementLines?: ClientRequirementLineEntity[];
  laborLines?: ProposalLaborLineEntity[];
  commissionPct?: number;
  commissionBeneficiaries?: number;
  commissionBeneficiaryIds?: string[];
  /** `null` = clear catalog link. */
  commissionBeneficiaryId?: string | null;
  commissionBeneficiaryName?: string;
  commissionBeneficiaryPhone?: string;
  commissionBeneficiaryEmail?: string;
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
  if (p.commissionBeneficiaryName === undefined) p.commissionBeneficiaryName = "";
  if (p.commissionBeneficiaryPhone === undefined) p.commissionBeneficiaryPhone = "";
  if (p.commissionBeneficiaryEmail === undefined) p.commissionBeneficiaryEmail = "";
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
      environment:
        line.environment === "outdoor" ? "outdoor" : "indoor",
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

function plantAllowsRotationByKeyword(plantName: string): boolean {
  const name = plantName.trim().toLowerCase();
  if (!name) return false;
  return (
    name.includes("orchid") ||
    name.includes("annual") ||
    name.includes("mum")
  );
}

export class ProposalsStore {
  private proposals = new Map<string, ProposalEntity>();
  private purchaseOrders = new Map<string, PurchaseOrderEntity[]>();
  private seq = 1;

  constructor(private readonly clients: ClientsStore) {}

  private nextNumber(): string {
    const y = new Date().getFullYear();
    const n = String(this.seq++).padStart(3, "0");
    return `PRO-${y}-${n}`;
  }

  create(dto: CreateProposalInput): ProposalEntity {
    let client: ClientEntity;
    try {
      client = this.clients.findOne(dto.clientId);
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) {
        throw new HttpError(
          400,
          "Unknown clientId — reload the page and pick a client again (in-memory data resets when the dev server restarts).",
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
    const entity: ProposalEntity = {
      id,
      number: this.nextNumber(),
      clientId: dto.clientId,
      locationId: dto.locationId,
      saleType: dto.saleType,
      accountingCode: accountingCodeForSaleType(dto.saleType),
      status: "draft",
      contactName: client.contactName,
      submittedBy: "Cindy",
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
    this.proposals.set(id, entity);
    return entity;
  }

  findOne(id: string): ProposalEntity {
    const p = this.proposals.get(id);
    if (!p) throw new HttpError(404, `Proposal ${id} not found`);
    ensureProposalShape(p);
    return p;
  }

  /** Lightweight rows for dashboard table (newest first). */
  listProposalSummaries(): ProposalListSummaryRow[] {
    const rows: ProposalListSummaryRow[] = [];
    for (const p of this.proposals.values()) {
      ensureProposalShape(p);
      let clientName = "—";
      let locationName = "—";
      try {
        const c = this.clients.findOne(p.clientId);
        clientName = c.companyName;
        const loc = c.locations.find((l) => l.id === p.locationId);
        locationName = loc?.name ?? "—";
      } catch {
        /* client missing after reset */
      }
      rows.push({
        id: p.id,
        number: p.number,
        status: p.status,
        clientName,
        locationName,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      });
    }
    rows.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return rows;
  }

  private assertEditable(p: ProposalEntity): void {
    if (p.status === "approved") {
      throw new HttpError(
        409,
        "Approved proposals are read-only. Create a new proposal or reject to edit.",
      );
    }
  }

  patchGeneral(id: string, dto: PatchProposalGeneralInput): ProposalEntity {
    const p = this.findOne(id);
    this.assertEditable(p);
    if (dto.contactName !== undefined) p.contactName = dto.contactName;
    if (dto.submittedBy !== undefined) p.submittedBy = dto.submittedBy;
    if (dto.maintenanceTier !== undefined) p.maintenanceTier = dto.maintenanceTier;
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
        ? raw
            .map((x) => String(x).trim())
            .filter(Boolean)
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
    if (dto.commissionBeneficiaryIds === undefined && dto.commissionBeneficiaryId !== undefined) {
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
      p.commissionBeneficiaryIds = p.commissionBeneficiaryIds.slice(0, maxByCount);
      syncLegacyCommissionBeneficiaryFields(p);
    }
    const cfg = getCachedPricingConfig();
    const eng = computeProposal(cfg, {
      items: p.items,
      rotations: p.rotations.map(rotationLineFromEntity),
      laborLines: p.laborLines,
      commissionPct: p.commissionPct,
      commissionBeneficiaries: p.commissionBeneficiaries,
    });
    p.laborCost = eng.laborCost;
    p.updatedAt = new Date().toISOString();
    return p;
  }

  replaceItems(id: string, items: ProposalItemInput[]): ProposalEntity {
    const p = this.findOne(id);
    this.assertEditable(p);
    const prevById = new Map(p.items.map((x) => [x.id, x] as const));
    p.items = items.map((row) => {
      const keepId =
        row.id && prevById.has(row.id) ? row.id : randomUUID();
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
      };
    });
    this.syncRotationsFromPlants(p);
    const cfg = getCachedPricingConfig();
    const eng = computeProposal(cfg, {
      items: p.items,
      rotations: p.rotations.map(rotationLineFromEntity),
      laborLines: p.laborLines,
      commissionPct: p.commissionPct,
      commissionBeneficiaries: p.commissionBeneficiaries,
    });
    p.laborCost = eng.laborCost;
    p.updatedAt = new Date().toISOString();
    return p;
  }

  private syncRotationsFromPlants(p: ProposalEntity) {
    const cfg = getCachedPricingConfig();
    const totalPlantUnits = p.items
      .filter((i) => i.category === "plant")
      .reduce((sum, i) => sum + Math.max(0, Number(i.qty) || 0), 0);
    const fromPlants = p.items.filter(
      (i) =>
        i.category === "plant" &&
        i.requiresRotation &&
        plantAllowsRotationByKeyword(i.name),
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

  replaceRotations(id: string, rotations: ProposalRotationInput[]): ProposalEntity {
    const p = this.findOne(id);
    this.assertEditable(p);
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
    const eng = computeProposal(cfg, {
      items: p.items,
      rotations: p.rotations.map(rotationLineFromEntity),
      laborLines: p.laborLines,
      commissionPct: p.commissionPct,
      commissionBeneficiaries: p.commissionBeneficiaries,
    });
    p.laborCost = eng.laborCost;
    p.updatedAt = new Date().toISOString();
    return p;
  }

  computeSummary(p: ProposalEntity) {
    ensureProposalShape(p);
    const cfg = getCachedPricingConfig();
    const eng = computeProposal(cfg, {
      items: p.items,
      rotations: p.rotations.map(rotationLineFromEntity),
      laborLines: p.laborLines,
      commissionPct: p.commissionPct,
      commissionBeneficiaries: p.commissionBeneficiaries,
    });
    return {
      totals: eng.totals,
      laborCost: eng.laborCost,
      laborByLine: eng.laborByLine,
      maintenanceMonthly: eng.maintenanceMonthly,
      guaranteedPlantsMonthly: eng.guaranteedPlantsMonthly,
      annualReplacementBudget: eng.annualReplacementBudget,
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

  getSummary(id: string) {
    const p = this.findOne(id);
    const calc = this.computeSummary(p);
    const purchaseOrders = this.purchaseOrders.get(id) ?? [];
    const client = this.clients.findOne(p.clientId);
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
        email: client.email,
        phone: client.phone,
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

  markAsSent(id: string): ProposalEntity {
    const p = this.findOne(id);
    if (p.status === "draft") {
      p.status = "pending_approval";
      p.sentAt = new Date().toISOString();
      p.updatedAt = p.sentAt;
    }
    return p;
  }

  approveAndGenerateOrders(
    id: string,
  ): { proposal: ProposalEntity; purchaseOrders: PurchaseOrderEntity[] } {
    const p = this.findOne(id);
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
    this.purchaseOrders.set(id, orders);
    return { proposal: p, purchaseOrders: orders };
  }

  /** Printable internal PO (no photo payloads). */
  getPurchaseOrderPrint(
    proposalId: string,
    purchaseOrderId: string,
  ): PurchaseOrderPrintData {
    const p = this.findOne(proposalId);
    const list = this.purchaseOrders.get(proposalId);
    const po = list?.find((o) => o.id === purchaseOrderId);
    if (!po) {
      throw new HttpError(404, "Purchase order not found");
    }
    const client = this.clients.findOne(p.clientId);
    const loc = client.locations.find((l) => l.id === p.locationId);
    const items: PurchaseOrderPrintData["purchaseOrder"]["items"] =
      po.items.map((it) => ({
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
        vendorAddress: it.vendorAddress?.trim() || "—",
      }));
    return {
      proposalId: p.id,
      proposalNumber: p.number,
      clientName: client.companyName,
      jobSite: loc
        ? { name: loc.name, address: loc.address }
        : null,
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
}

function rotationLineFromEntity(r: ProposalRotationEntity): RotationLineState {
  return {
    qty: r.qty,
    frequencyWeeks: r.frequencyWeeks,
    rotationUnitPrice: r.rotationUnitPrice,
    truckFee: r.truckFee,
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

const globalForStores = globalThis as unknown as {
  __m01_proposalsStore?: ProposalsStore;
};

export function getProposalsStore(): ProposalsStore {
  if (!globalForStores.__m01_proposalsStore) {
    globalForStores.__m01_proposalsStore = new ProposalsStore(getClientsStore());
    void loadPricingConfig().catch(() => {
      /* missing file → defaults */
    });
  }
  return globalForStores.__m01_proposalsStore;
}
