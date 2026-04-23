export type SaleType = "new_installation" | "replacement" | "new_sale";

export type ItemCategory = "plant" | "pot" | "staging";

export interface ClientLocation {
  id: string;
  clientId?: string;
  name: string;
  address?: string;
  /** Optional per-location drive time override (one-way, in minutes). */
  driveTimeMinutes?: number;
  /** Optional straight-line distance in km from Greenery HQ. */
  driveDistanceKm?: number;
}

export interface Client {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  /** Contact direct / mobile. */
  phone?: string;
  /** Main company / office line. */
  companyPhone?: string;
  /** Company-side contact (reception, office, department). */
  companyContact?: string;
  /** From QuickBooks / CRM: repeat buyer — only Additional sale & Replacement. */
  isExistingCustomer?: boolean;
  /** Optional manual drive time (one-way, in minutes) from Greenery HQ to this client. */
  driveTimeMinutes?: number;
  /** Optional straight-line distance in km from Greenery HQ. */
  driveDistanceKm?: number;
  locations: ClientLocation[];
}

export interface GrowerOption {
  id: string;
  name: string;
  price: number;
  address: string;
}

export interface PlantCatalogEntry {
  id: string;
  name: string;
  /** Common/popular name used for search & display. */
  commonName?: string;
  scientificName?: string;
  size: string;
  sizeInches?: number | null;
  /** Concatenated searchable string (commonName + scientific + legacy code). */
  searchKey?: string;
  imagePublicPath?: string | null;
  catalogCode?: string;
  requiresRotation: boolean;
  growers: GrowerOption[];
}

/**
 * Pot catalog: canonical entry derived from the JSC WH2 pricelist.
 * Legacy `suppliers` field is kept so existing wizard code (sort by price, pick supplier)
 * keeps working — the JSC JSON is served as a single virtual supplier per row.
 */
export interface PotCatalogEntry {
  id: string;
  name: string;
  suppliers: GrowerOption[];
  sku?: string;
  family?: string;
  kind?: string;
  baseName?: string;
  exteriorSize?: string | null;
  interiorOpening?: string | null;
  sizeInches?: number | null;
  mapPrice?: number | null;
  wholesalePrice?: number;
  searchKey?: string;
}

export type PlantEnvironment = "indoor" | "outdoor";

export interface ProposalItemInput {
  /** Server line id — send back on updates so photos & rotations stay linked. */
  id?: string;
  category: ItemCategory;
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
  /** Plant reference images (data URLs) for the client PDF. */
  photos?: string[];
  /** Plant pot size in inches (snapshotted for labor calculations). */
  sizeInches?: number | null;
  /** Indoor (decorative double-pot) vs outdoor (planted substrate) — drives staging recipes. */
  environment?: PlantEnvironment;
  /** Planting is done without purchasing a pot line for this plant. */
  plantingWithoutPot?: boolean;
  /** Plant is covered by guarantee rules. */
  guaranteed?: boolean;
  /**
   * Staging only: slot key of the plant this material belongs to (`id` or `idx-n`),
   * same segment as in `staging-auto-<key>-<materialSourceId>`.
   */
  relatedPlantItemId?: string;
  /** Staging only: material preview image (URL). */
  stagingImageUrl?: string;
  /** Plants auto-built from a client requirement row (removed with that row). */
  sourceRequirementLineId?: string;
  /** Pots auto-built from requirement pot types (rebuilt when requirements change). */
  fromRequirementsPot?: boolean;
  /**
   * Plants only: user dismissed the catalog suggested thumbnail on the Photos step.
   * When true, we do not auto-embed the suggested image on save.
   */
  plantPhotoSuggestedDismissed?: boolean;
}

export type ProposalLaborLineKey =
  | "load"
  | "driveToJob"
  | "unload"
  | "install"
  | "cleanUp"
  | "driveFromJob";

export interface ProposalLaborLine {
  key: ProposalLaborLineKey;
  people: number;
  hours: number;
}

export interface ProposalRotation {
  id: string;
  itemId: string;
  plantName: string;
  qty: number;
  frequencyName: string;
  frequencyWeeks: 4 | 6 | 8;
  rotationUnitPrice: number;
  truckFee: number;
  /** Present on summary API only. */
  monthlyBilled?: number;
  annualBilled?: number;
}

/** Commission beneficiary catalog (persisted on server). */
export interface CommissionBeneficiary {
  id: string;
  name: string;
  phone?: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

/** Wizard requirements grid (same shape as server `ClientRequirementLineEntity`). */
export interface ClientRequirementLine {
  id: string;
  plantCatalogId: string;
  area: string;
  qty: number;
  environment: PlantEnvironment;
  /** Existing client pot is reused; no pot sourcing required. */
  clientHasPot: boolean;
  /** Planting is performed without pot sourcing; applies planting surcharge. */
  plantingWithoutPot: boolean;
  /** Plant/group participates in guarantee pricing. */
  guaranteed: boolean;
  potType: string;
  notes: string;
}

/** Dashboard table row from `GET /api/proposals`. */
export interface ProposalListSummaryRow {
  id: string;
  number: string;
  status: string;
  clientName: string;
  locationName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalsListResponse {
  proposals: ProposalListSummaryRow[];
}

export interface Proposal {
  id: string;
  number: string;
  clientId: string;
  locationId: string;
  saleType: SaleType;
  accountingCode: string;
  status: string;
  contactName?: string;
  submittedBy?: string;
  maintenanceTier: "tier_1" | "tier_2" | "tier_3";
  requirementLines?: ClientRequirementLine[];
  items: Array<
    ProposalItemInput & { id: string; clientOwnsPot: boolean; photos?: string[] }
  >;
  rotations: ProposalRotation[];
  laborCost: number;
  laborLines: ProposalLaborLine[];
  commissionPct: number;
  commissionBeneficiaries: number;
  commissionBeneficiaryIds?: string[];
  commissionBeneficiaryId?: string;
  commissionBeneficiaryName?: string;
  commissionBeneficiaryPhone?: string;
  commissionBeneficiaryEmail?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SummaryResponse {
  requirementLines?: ClientRequirementLine[];
  proposal: {
    id: string;
    number: string;
    status: string;
    saleType: SaleType;
    accountingCode: string;
    contactName?: string;
    submittedBy?: string;
    maintenanceTier: "tier_1" | "tier_2" | "tier_3";
    sentAt?: string;
    approvedAt?: string;
  };
  client: {
    name: string;
    /** Primary contact person from the client catalog (not edited per proposal). */
    contactName: string;
    email: string;
    phone?: string;
    companyPhone?: string;
    companyContact?: string;
  };
  location: { name: string; address?: string } | null;
  calculations: {
    totals: {
      plants: { wholesale: number; retail: number; freight: number };
      pots: { wholesale: number; retail: number; freight: number };
      materials: { wholesale: number; retail: number; freight: number };
    };
    laborCost: number;
    laborByLine: Partial<Record<ProposalLaborLineKey, number>>;
    maintenanceMonthly: number;
    guaranteedPlantsMonthly: number;
    annualReplacementBudget: number;
    maintenanceBreakdown: {
      wholesalePlantsTotal: number;
      totalInstallMinutes: number;
      installationHours: number;
      costPerMonthHours: number;
      costPerMonthPlants: number;
      tierEvaluationSum: number;
      overheadFactor: number;
      overhead: number;
      guaranteedMonthlyMaintenance: number;
    };
    rotationsAnnual: number;
    rotationLines: Array<{
      qty: number;
      frequencyWeeks: number;
      rotationUnitPrice: number;
      truckFee: number;
      p1: number;
      p2: number;
      p3: number;
      monthly: number;
      annual: number;
    }>;
    commissionGross: number;
    commissionPerBeneficiary: number;
    costBaseTotal: number;
    priceToClientInitial: number;
    priceToClientAnnual: number;
    grossMargin: number;
    marginPct: number;
  };
  items: Proposal["items"];
  rotations: ProposalRotation[];
  laborLines: ProposalLaborLine[];
  commissionPct: number;
  commissionBeneficiaries: number;
  commissionBeneficiaryIds?: string[];
  workflow?: {
    purchaseOrders: Array<{
      id: string;
      proposalId: string;
      sequence: 1 | 2;
      kind: "plants" | "pots_staging";
      status: "draft";
      createdAt: string;
      items: Proposal["items"];
      totals: { wholesale: number; retail: number; freight: number };
    }>;
  };
}

/** Internal PO printable view (no plant photo data URLs). */
export interface PurchaseOrderPrintRow {
  id: string;
  category: ItemCategory;
  catalogId: string;
  name: string;
  area?: string;
  qty: number;
  wholesaleCost: number;
  markup: number;
  freightRate: number;
  clientOwnsPot: boolean;
  plantingWithoutPot?: boolean;
  requiresRotation: boolean;
  vendorName: string;
  vendorAddress: string;
}

export interface PurchaseOrderPrintData {
  proposalId: string;
  proposalNumber: string;
  clientName: string;
  jobSite: { name: string; address?: string } | null;
  purchaseOrder: {
    id: string;
    sequence: 1 | 2;
    kind: "plants" | "pots_staging";
    createdAt: string;
    items: PurchaseOrderPrintRow[];
    totals: { wholesale: number; retail: number; freight: number };
  };
}
