import { HttpError } from "./http-error";
import type {
  ClientRequirementLineEntity,
  ProposalLaborLineEntity,
  SaleType,
} from "./domain";
import { PROPOSAL_LABOR_KEYS } from "./domain";
import type {
  PatchProposalGeneralInput,
  ProposalItemInput,
  ProposalRotationInput,
} from "./proposals-store";

const SALE: SaleType[] = ["new_installation", "replacement", "new_sale"];
const CAT = ["plant", "pot", "staging"] as const;
const TIER = ["tier_1", "tier_2", "tier_3"] as const;

function parsePlantPhotos(
  r: Record<string, unknown>,
  index: number,
): string[] | undefined {
  if (r.photos === undefined) return undefined;
  if (r.photos === null) return [];
  if (!Array.isArray(r.photos)) {
    throw new HttpError(400, `items[${index}].photos must be an array`);
  }
  if (r.photos.length > 12) {
    throw new HttpError(400, `items[${index}].photos: at most 12 images`);
  }
  const out: string[] = [];
  for (let j = 0; j < r.photos.length; j++) {
    const s = r.photos[j];
    if (typeof s !== "string") {
      throw new HttpError(400, `items[${index}].photos[${j}] must be a string`);
    }
    if (s.length < 32 || s.length > 1_500_000) {
      throw new HttpError(400, `items[${index}].photos[${j}] invalid size`);
    }
    if (!/^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(s)) {
      throw new HttpError(
        400,
        `items[${index}].photos[${j}] must be a base64 data URL (image/*)`,
      );
    }
    out.push(s);
  }
  return out;
}

function isSaleType(x: unknown): x is SaleType {
  return typeof x === "string" && (SALE as string[]).includes(x);
}

export function parseCreateProposal(body: unknown): {
  clientId: string;
  locationId: string;
  saleType: SaleType;
} {
  if (!body || typeof body !== "object") {
    throw new HttpError(400, "Invalid JSON");
  }
  const b = body as Record<string, unknown>;
  const clientId = String(b.clientId ?? "").trim();
  const locationId = String(b.locationId ?? "").trim();
  if (!clientId) throw new HttpError(400, "clientId is required");
  if (!locationId) throw new HttpError(400, "locationId is required");
  if (!isSaleType(b.saleType)) throw new HttpError(400, "saleType is invalid");
  return { clientId, locationId, saleType: b.saleType };
}

function parseLaborLine(row: unknown, index: number): ProposalLaborLineEntity {
  if (!row || typeof row !== "object") {
    throw new HttpError(400, `laborLines[${index}] must be an object`);
  }
  const r = row as Record<string, unknown>;
  const key = r.key;
  if (typeof key !== "string" || !(PROPOSAL_LABOR_KEYS as readonly string[]).includes(key)) {
    throw new HttpError(400, `laborLines[${index}].key is invalid`);
  }
  const people = Number(r.people);
  const hours = Number(r.hours);
  if (!Number.isFinite(people) || people < 0) {
    throw new HttpError(400, `laborLines[${index}].people is invalid`);
  }
  if (!Number.isFinite(hours) || hours < 0) {
    throw new HttpError(400, `laborLines[${index}].hours is invalid`);
  }
  return {
    key: key as ProposalLaborLineEntity["key"],
    people,
    hours,
  };
}

function parseRequirementLine(
  row: unknown,
  index: number,
): ClientRequirementLineEntity {
  if (!row || typeof row !== "object") {
    throw new HttpError(400, `requirementLines[${index}] must be an object`);
  }
  const r = row as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id.trim() : "";
  if (!id) {
    throw new HttpError(400, `requirementLines[${index}].id is required`);
  }
  const plantCatalogId =
    typeof r.plantCatalogId === "string" ? r.plantCatalogId.trim() : "";
  const area = typeof r.area === "string" ? r.area.trim() : "";
  const qty = Math.max(1, Math.floor(Number(r.qty) || 1));
  const potType = typeof r.potType === "string" ? r.potType.trim() : "";
  const notes = typeof r.notes === "string" ? r.notes.trim().slice(0, 2000) : "";
  return { id, plantCatalogId, area, qty, potType, notes };
}

export function parsePatchGeneral(body: unknown): PatchProposalGeneralInput {
  if (!body || typeof body !== "object") {
    throw new HttpError(400, "Invalid JSON");
  }
  const b = body as Record<string, unknown>;
  const out: PatchProposalGeneralInput = {};
  if (b.contactName !== undefined) {
    if (b.contactName !== null && typeof b.contactName !== "string") {
      throw new HttpError(400, "contactName must be a string");
    }
    out.contactName =
      b.contactName === null ? undefined : String(b.contactName);
  }
  if (b.submittedBy !== undefined) {
    if (b.submittedBy !== null && typeof b.submittedBy !== "string") {
      throw new HttpError(400, "submittedBy must be a string");
    }
    out.submittedBy =
      b.submittedBy === null ? undefined : String(b.submittedBy);
  }
  if (b.maintenanceTier !== undefined) {
    if (typeof b.maintenanceTier !== "string") {
      throw new HttpError(400, "maintenanceTier is invalid");
    }
    if (!(TIER as readonly string[]).includes(b.maintenanceTier)) {
      throw new HttpError(400, "maintenanceTier is invalid");
    }
    out.maintenanceTier = b.maintenanceTier as PatchProposalGeneralInput["maintenanceTier"];
  }
  if (b.laborLines !== undefined) {
    if (!Array.isArray(b.laborLines)) {
      throw new HttpError(400, "laborLines must be an array");
    }
    out.laborLines = b.laborLines.map((row, i) => parseLaborLine(row, i));
  }
  if (b.requirementLines !== undefined) {
    if (!Array.isArray(b.requirementLines)) {
      throw new HttpError(400, "requirementLines must be an array");
    }
    if (b.requirementLines.length > 200) {
      throw new HttpError(400, "requirementLines: at most 200 rows");
    }
    out.requirementLines = b.requirementLines.map((row, i) =>
      parseRequirementLine(row, i),
    );
  }
  if (b.commissionPct !== undefined) {
    const v = Number(b.commissionPct);
    if (!Number.isFinite(v) || v < 0) {
      throw new HttpError(400, "commissionPct must be greater than or equal to 0");
    }
    out.commissionPct = v;
  }
  if (b.commissionBeneficiaries !== undefined) {
    const v = Number(b.commissionBeneficiaries);
    if (!Number.isFinite(v) || v < 0 || !Number.isInteger(v)) {
      throw new HttpError(400, "commissionBeneficiaries must be a non-negative integer");
    }
    out.commissionBeneficiaries = v;
  }
  if (b.commissionBeneficiaryIds !== undefined) {
    if (!Array.isArray(b.commissionBeneficiaryIds)) {
      throw new HttpError(400, "commissionBeneficiaryIds must be an array");
    }
    if (b.commissionBeneficiaryIds.length > 50) {
      throw new HttpError(400, "commissionBeneficiaryIds: at most 50 entries");
    }
    const seen = new Set<string>();
    const parsed: string[] = [];
    for (let i = 0; i < b.commissionBeneficiaryIds.length; i++) {
      const x = b.commissionBeneficiaryIds[i];
      if (typeof x !== "string") {
        throw new HttpError(
          400,
          `commissionBeneficiaryIds[${i}] must be a string`,
        );
      }
      const t = x.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      parsed.push(t);
    }
    out.commissionBeneficiaryIds = parsed;
  }
  if ("commissionBeneficiaryId" in b) {
    if (b.commissionBeneficiaryId === null) {
      out.commissionBeneficiaryId = null;
    } else if (typeof b.commissionBeneficiaryId !== "string") {
      throw new HttpError(400, "commissionBeneficiaryId must be a string or null");
    } else {
      const t = b.commissionBeneficiaryId.trim();
      out.commissionBeneficiaryId = t.length === 0 ? null : t;
    }
  }
  if (b.commissionBeneficiaryName !== undefined) {
    if (b.commissionBeneficiaryName !== null && typeof b.commissionBeneficiaryName !== "string") {
      throw new HttpError(400, "commissionBeneficiaryName must be a string");
    }
    out.commissionBeneficiaryName =
      b.commissionBeneficiaryName === null ? undefined : String(b.commissionBeneficiaryName);
  }
  if (b.commissionBeneficiaryPhone !== undefined) {
    if (b.commissionBeneficiaryPhone !== null && typeof b.commissionBeneficiaryPhone !== "string") {
      throw new HttpError(400, "commissionBeneficiaryPhone must be a string");
    }
    out.commissionBeneficiaryPhone =
      b.commissionBeneficiaryPhone === null ? undefined : String(b.commissionBeneficiaryPhone);
  }
  if (b.commissionBeneficiaryEmail !== undefined) {
    if (b.commissionBeneficiaryEmail !== null && typeof b.commissionBeneficiaryEmail !== "string") {
      throw new HttpError(400, "commissionBeneficiaryEmail must be a string");
    }
    out.commissionBeneficiaryEmail =
      b.commissionBeneficiaryEmail === null ? undefined : String(b.commissionBeneficiaryEmail);
  }
  return out;
}

export function parseWorkflowAction(
  body: unknown,
): "send_to_client" | "simulate_approval" {
  if (!body || typeof body !== "object") {
    throw new HttpError(400, "Invalid JSON");
  }
  const action = (body as Record<string, unknown>).action;
  if (action === "send_to_client" || action === "simulate_approval") {
    return action;
  }
  throw new HttpError(
    400,
    "action must be send_to_client or simulate_approval",
  );
}

function parseItem(row: unknown, index: number): ProposalItemInput {
  if (!row || typeof row !== "object") {
    throw new HttpError(400, `items[${index}] must be an object`);
  }
  const r = row as Record<string, unknown>;
  const category = r.category;
  if (typeof category !== "string" || !(CAT as readonly string[]).includes(category)) {
    throw new HttpError(400, `items[${index}].category is invalid`);
  }
  const qty = Number(r.qty);
  const wholesaleCost = Number(r.wholesaleCost);
  const markup = Number(r.markup);
  const freightRate = Number(r.freightRate);
  if (!Number.isFinite(qty) || qty < 1) {
    throw new HttpError(400, `items[${index}].qty is invalid`);
  }
  if (!Number.isFinite(wholesaleCost) || wholesaleCost < 0) {
    throw new HttpError(400, `items[${index}].wholesaleCost is invalid`);
  }
  if (!Number.isFinite(markup) || markup < 0) {
    throw new HttpError(400, `items[${index}].markup is invalid`);
  }
  if (!Number.isFinite(freightRate) || freightRate < 0) {
    throw new HttpError(400, `items[${index}].freightRate is invalid`);
  }
  if (typeof r.requiresRotation !== "boolean") {
    throw new HttpError(400, `items[${index}].requiresRotation must be boolean`);
  }
  if (category !== "plant" && r.photos !== undefined) {
    throw new HttpError(400, `items[${index}].photos is only allowed for plants`);
  }
  const id =
    typeof r.id === "string" && r.id.trim() ? String(r.id).trim() : undefined;
  const photos =
    category === "plant" ? parsePlantPhotos(r, index) : undefined;
  const sizeInches =
    r.sizeInches === undefined || r.sizeInches === null
      ? undefined
      : Number(r.sizeInches);
  if (sizeInches !== undefined && (!Number.isFinite(sizeInches) || sizeInches < 0)) {
    throw new HttpError(400, `items[${index}].sizeInches is invalid`);
  }
  const accessDifficulty =
    r.accessDifficulty === undefined
      ? undefined
      : r.accessDifficulty === "easy" || r.accessDifficulty === "difficult"
        ? (r.accessDifficulty as "easy" | "difficult")
        : null;
  if (accessDifficulty === null) {
    throw new HttpError(400, `items[${index}].accessDifficulty is invalid`);
  }
  const stairsFloors =
    r.stairsFloors === undefined ? undefined : Number(r.stairsFloors);
  if (
    stairsFloors !== undefined &&
    (!Number.isFinite(stairsFloors) || stairsFloors < 0)
  ) {
    throw new HttpError(400, `items[${index}].stairsFloors is invalid`);
  }
  const extraDistanceMeters =
    r.extraDistanceMeters === undefined
      ? undefined
      : Number(r.extraDistanceMeters);
  if (
    extraDistanceMeters !== undefined &&
    (!Number.isFinite(extraDistanceMeters) || extraDistanceMeters < 0)
  ) {
    throw new HttpError(400, `items[${index}].extraDistanceMeters is invalid`);
  }
  const fragile =
    r.fragile === undefined ? undefined : Boolean(r.fragile);
  const environment =
    r.environment === undefined
      ? undefined
      : r.environment === "indoor" || r.environment === "outdoor"
        ? (r.environment as "indoor" | "outdoor")
        : null;
  if (environment === null) {
    throw new HttpError(400, `items[${index}].environment is invalid`);
  }
  let relatedPlantItemId: string | undefined;
  let stagingImageUrl: string | undefined;
  if (category === "staging") {
    if (r.relatedPlantItemId !== undefined && r.relatedPlantItemId !== null) {
      if (typeof r.relatedPlantItemId !== "string") {
        throw new HttpError(400, `items[${index}].relatedPlantItemId must be a string`);
      }
      const t = r.relatedPlantItemId.trim();
      relatedPlantItemId = t.length ? t : undefined;
    }
    if (r.stagingImageUrl !== undefined && r.stagingImageUrl !== null) {
      if (typeof r.stagingImageUrl !== "string") {
        throw new HttpError(400, `items[${index}].stagingImageUrl must be a string`);
      }
      const u = r.stagingImageUrl.trim();
      if (u.length > 2048) {
        throw new HttpError(400, `items[${index}].stagingImageUrl is too long`);
      }
      stagingImageUrl = u.length ? u : undefined;
    }
  } else {
    if (r.relatedPlantItemId !== undefined) {
      throw new HttpError(400, `items[${index}].relatedPlantItemId is only allowed for staging`);
    }
    if (r.stagingImageUrl !== undefined) {
      throw new HttpError(400, `items[${index}].stagingImageUrl is only allowed for staging`);
    }
  }
  return {
    ...(id ? { id } : {}),
    category: category as ProposalItemInput["category"],
    catalogId: String(r.catalogId ?? ""),
    name: String(r.name ?? ""),
    area: r.area != null ? String(r.area) : undefined,
    qty,
    wholesaleCost,
    markup,
    freightRate,
    clientOwnsPot:
      r.clientOwnsPot === undefined ? undefined : Boolean(r.clientOwnsPot),
    requiresRotation: r.requiresRotation as boolean,
    vendorName: String(r.vendorName ?? ""),
    vendorAddress: String(r.vendorAddress ?? ""),
    ...(photos !== undefined ? { photos } : {}),
    ...(sizeInches !== undefined ? { sizeInches } : {}),
    ...(accessDifficulty !== undefined ? { accessDifficulty } : {}),
    ...(stairsFloors !== undefined ? { stairsFloors } : {}),
    ...(extraDistanceMeters !== undefined ? { extraDistanceMeters } : {}),
    ...(fragile !== undefined ? { fragile } : {}),
    ...(environment !== undefined ? { environment } : {}),
    ...(relatedPlantItemId !== undefined ? { relatedPlantItemId } : {}),
    ...(stagingImageUrl !== undefined ? { stagingImageUrl } : {}),
  };
}

export function parseReplaceItems(body: unknown): ProposalItemInput[] {
  if (!body || typeof body !== "object") {
    throw new HttpError(400, "Invalid JSON");
  }
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.items)) {
    throw new HttpError(400, "items must be an array");
  }
  return b.items.map((row, i) => parseItem(row, i));
}

const FREQ_W = [4, 6, 8] as const;
const TRUCK = [25, 50] as const;

function parseRotation(row: unknown, index: number): ProposalRotationInput {
  if (!row || typeof row !== "object") {
    throw new HttpError(400, `rotations[${index}] must be an object`);
  }
  const r = row as Record<string, unknown>;
  const qty = Number(r.qty);
  const frequencyWeeks = Number(r.frequencyWeeks);
  const rotationUnitPrice = Number(r.rotationUnitPrice);
  const truckFee = Number(r.truckFee);
  if (!Number.isFinite(qty) || qty < 1) {
    throw new HttpError(400, `rotations[${index}].qty is invalid`);
  }
  if (!Number.isInteger(frequencyWeeks) || !(FREQ_W as readonly number[]).includes(frequencyWeeks)) {
    throw new HttpError(400, `rotations[${index}].frequencyWeeks must be 4, 6, or 8`);
  }
  if (!Number.isFinite(rotationUnitPrice) || rotationUnitPrice < 0) {
    throw new HttpError(400, `rotations[${index}].rotationUnitPrice is invalid`);
  }
  if (!Number.isInteger(truckFee) || !(TRUCK as readonly number[]).includes(truckFee)) {
    throw new HttpError(400, `rotations[${index}].truckFee must be 25 or 50`);
  }
  const id =
    typeof r.id === "string" && r.id.trim() ? String(r.id).trim() : undefined;
  return {
    ...(id ? { id } : {}),
    itemId: String(r.itemId ?? ""),
    plantName: String(r.plantName ?? ""),
    qty,
    frequencyName: String(r.frequencyName ?? ""),
    frequencyWeeks: frequencyWeeks as 4 | 6 | 8,
    rotationUnitPrice,
    truckFee: truckFee as 25 | 50,
  };
}

export function parseReplaceRotations(body: unknown): ProposalRotationInput[] {
  if (!body || typeof body !== "object") {
    throw new HttpError(400, "Invalid JSON");
  }
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.rotations)) {
    throw new HttpError(400, "rotations must be an array");
  }
  return b.rotations.map((row, i) => parseRotation(row, i));
}
