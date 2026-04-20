export type SaleType = "new_installation" | "replacement" | "new_sale";

export type ItemCategory = "plant" | "pot" | "staging";

export const PROPOSAL_LABOR_KEYS = [
  "load",
  "driveToJob",
  "unload",
  "install",
  "cleanUp",
  "driveFromJob",
] as const;

export type ProposalLaborLineKey = (typeof PROPOSAL_LABOR_KEYS)[number];

export interface ProposalLaborLineEntity {
  key: ProposalLaborLineKey;
  people: number;
  hours: number;
}

export interface ClientEntity {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  billingAddress?: string;
  /** When true (e.g. synced from QuickBooks with purchase history), sale type is limited. */
  isExistingCustomer?: boolean;
  /** Optional manual drive time (one-way, in minutes) from Greenery HQ to this client. */
  driveTimeMinutes?: number;
  locations: LocationEntity[];
  createdAt: string;
}

export interface LocationEntity {
  id: string;
  clientId: string;
  name: string;
  address?: string;
  /** Optional per-location drive time override (one-way, in minutes). */
  driveTimeMinutes?: number;
}

/** Access & handling metadata used by the detailed auto-labor engine. */
export type AccessDifficulty = "easy" | "difficult";

/** Plant placement — drives staging recipe selection. */
export type PlantEnvironment = "indoor" | "outdoor";

export interface ProposalItemEntity {
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
  requiresRotation: boolean;
  vendorName: string;
  vendorAddress: string;
  /** Data URLs (image/*;base64,...) for client PDF; plants only. */
  photos?: string[];
  /** Plant pot size in inches (snapshotted for labor calculations). */
  sizeInches?: number | null;
  /** "easy" (default) | "difficult" (stairs, narrow path, small elevator). */
  accessDifficulty?: AccessDifficulty;
  /** Floors above ground level that must be climbed. */
  stairsFloors?: number;
  /** Extra distance from unload point to final point, in meters. */
  extraDistanceMeters?: number;
  /** Fragile/wet plant that needs careful handling. */
  fragile?: boolean;
  /** Indoor (decorative) vs outdoor (planted) — drives staging recipes. */
  environment?: PlantEnvironment;
  /** Staging: links auto lines to a plant slot key. */
  relatedPlantItemId?: string;
  /** Staging: material thumbnail URL. */
  stagingImageUrl?: string;
}

/** Reusable record for commission beneficiaries (persistent catalog). */
export interface CommissionBeneficiaryEntity {
  id: string;
  name: string;
  phone?: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalRotationEntity {
  id: string;
  itemId: string;
  plantName: string;
  qty: number;
  frequencyName: string;
  /** Weeks between rotations (doc: 4, 6, or 8). */
  frequencyWeeks: 4 | 6 | 8;
  /** Fixed catalog unit price for rotation plant (P1). */
  rotationUnitPrice: number;
  /** Truck fee for P3 ($25 or $50). */
  truckFee: 25 | 50;
}

/** Wizard requirements grid (persisted on the proposal). */
export interface ClientRequirementLineEntity {
  id: string;
  plantCatalogId: string;
  area: string;
  qty: number;
  potType: string;
  notes: string;
}

export interface ProposalEntity {
  id: string;
  number: string;
  clientId: string;
  locationId: string;
  saleType: SaleType;
  accountingCode: string;
  status: "draft" | "pending_approval" | "approved" | "rejected";
  contactName?: string;
  submittedBy?: string;
  clientRequirementsNote?: string;
  maintenanceTier: "tier_1" | "tier_2" | "tier_3";
  /** Client requirements from the first wizard step (optional for legacy rows). */
  requirementLines: ClientRequirementLineEntity[];
  items: ProposalItemEntity[];
  rotations: ProposalRotationEntity[];
  /** @deprecated Kept for API compatibility; use laborLines + engine laborCost. */
  laborCost: number;
  laborLines: ProposalLaborLineEntity[];
  commissionPct: number;
  commissionBeneficiaries: number;
  /** Distinct catalog ids for commission payees (order preserved). */
  commissionBeneficiaryIds?: string[];
  /** Record id in `data/commission-beneficiaries.json`, if applicable. */
  commissionBeneficiaryId?: string;
  /** Denormalized from first id (legacy / display). */
  commissionBeneficiaryName?: string;
  commissionBeneficiaryPhone?: string;
  commissionBeneficiaryEmail?: string;
  sentAt?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderEntity {
  id: string;
  proposalId: string;
  sequence: 1 | 2;
  kind: "plants" | "pots_staging";
  status: "draft";
  createdAt: string;
  items: ProposalItemEntity[];
  totals: {
    wholesale: number;
    retail: number;
    freight: number;
  };
}

export function accountingCodeForSaleType(saleType: SaleType): string {
  if (saleType === "replacement") return "701";
  return "702";
}
