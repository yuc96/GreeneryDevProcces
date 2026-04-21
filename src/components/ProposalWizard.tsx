"use client";

import {
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardCheck,
  ClipboardList,
  Eye,
  FileText,
  ImageIcon,
  Layers,
  Leaf,
  MapPin,
  Moon,
  Package,
  Plus,
  Search,
  Send,
  Sparkles,
  Star,
  Store,
  Sun,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { ClientProposalBody } from "@/app/proposal/[id]/client/ClientProposalBody";
import { CommissionBeneficiaryFormModal } from "@/components/CommissionBeneficiaryFormModal";
import { PrintBar } from "@/components/PrintBar";
import {
  markupOptionsForSelect,
  snapMarkupToPricingLadder,
} from "@/lib/markup-select";
import {
  buildStagingLibraryFromJson,
  type StagingLibraryItem,
} from "@/lib/staging-catalog";
import {
  autoStagingPlantSignature,
  buildStagingDisplayGroups,
  mergeAutoStagingIntoDraft,
  plantKeyForStaging,
  serializeAutoStagingSlice,
  stagingGroupKeyFromLine,
  stagingSectionBanner,
} from "@/lib/auto-staging-merge";
import plantReferenceCatalog from "@/data/plant-reference-images.json";
import { catalogEntriesForPhotoPicker } from "@/lib/plant-reference-images";
import { apiGet, apiJson } from "@/lib/api";
import { rethrowAsError, toErrorMessage } from "@/lib/to-error-message";
import type {
  Client,
  ClientRequirementLine,
  CommissionBeneficiary,
  GrowerOption,
  ItemCategory,
  PlantCatalogEntry,
  PotCatalogEntry,
  Proposal,
  ProposalItemInput,
  ProposalLaborLine,
  ProposalRotation,
  SaleType,
  SummaryResponse,
} from "@/lib/types";
import {
  computeRotationMonthly,
  defaultLaborLines,
  truckFeeForPlantCount,
} from "@/server/pricing/compute-proposal";
import {
  computeAutoLaborLines,
  computeSimplifiedLabor,
  simulateDriveMinutes,
} from "@/server/pricing/auto-labor";
import { parseSizeInchesFromText } from "@/server/pricing/cpp-model";
import {
  DEFAULT_LABOR_ENGINE_CONFIG,
  type LaborEngineConfig,
} from "@/server/pricing/labor-engine-schema";
import {
  DEFAULT_PRICING_ENGINE_CONFIG,
  type PricingEngineConfig,
} from "@/server/pricing/engine-schema";
import { PlantPicker } from "@/components/PlantPicker";
import { PotPicker } from "@/components/PotPicker";
import { matchPotsForPlantSize } from "@/lib/pot-matching";

const STEPS = [
  { key: "requirements", label: "Requirements", Icon: ClipboardCheck },
  { key: "general", label: "General", Icon: ClipboardList },
  { key: "products", label: "Products", Icon: Leaf },
  { key: "rotations", label: "Rotations", Icon: CalendarDays },
  { key: "photos", label: "Photos", Icon: ImageIcon },
  { key: "proposal", label: "Proposal", Icon: FileText },
  { key: "send", label: "Send", Icon: Send },
] as const;

type MarkupPricingMode = "open" | "sale_type";
function resolveMarkupForSale(
  cfg: PricingEngineConfig,
  saleType: SaleType,
  mode: MarkupPricingMode,
): number {
  if (mode === "open") return cfg.defaultMarkup;
  if (saleType === "new_installation") return 3;
  return 2.5;
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const PRIMARY = "#2b7041";
const PRIMARY_CLASS = "bg-[#2b7041] hover:bg-[#235a37]";
const MINT_DONE = "bg-emerald-50 text-emerald-900 border border-emerald-100";

function commissionSlotsFromProposal(
  p: Pick<
    Proposal,
    | "commissionBeneficiaries"
    | "commissionBeneficiaryIds"
    | "commissionBeneficiaryId"
  >,
): string[] {
  const n = Math.max(0, p.commissionBeneficiaries ?? 0);
  const raw = p.commissionBeneficiaryIds?.length
    ? [...p.commissionBeneficiaryIds]
    : p.commissionBeneficiaryId
      ? [p.commissionBeneficiaryId]
      : [];
  return Array.from({ length: n }, (_, i) => raw[i] ?? "");
}

function lineRetail(qty: number, wholesale: number, markup: number) {
  return qty * wholesale * markup;
}

function WizardPhotoThumb({ src }: { src: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="h-full w-full object-cover" />;
}

function defaultFreight(cat: ItemCategory, cfg: PricingEngineConfig): number {
  if (cat === "plant") return cfg.plantFreightPct;
  if (cat === "pot") return cfg.potFreightPct;
  return cfg.materialFreightPct;
}

function plantItemFromCatalog(
  plant: PlantCatalogEntry,
  grower: PlantCatalogEntry["growers"][0],
  cfg: PricingEngineConfig,
  markup?: number,
): ProposalItemInput {
  return {
    category: "plant",
    catalogId: plant.id,
    name: `${plant.name} (${plant.size})`,
    area: "",
    qty: 1,
    wholesaleCost: grower.price,
    markup: markup ?? cfg.defaultMarkup,
    freightRate: defaultFreight("plant", cfg),
    clientOwnsPot: false,
    requiresRotation: plant.requiresRotation,
    vendorName: grower.name,
    vendorAddress: grower.address,
  };
}

const ROT_PRESETS = [
  {
    label: "Every 4 weeks",
    frequencyName: "Every 4 weeks",
    frequencyWeeks: 4 as const,
  },
  {
    label: "Every 6 weeks",
    frequencyName: "Every 6 weeks",
    frequencyWeeks: 6 as const,
  },
  {
    label: "Every 8 weeks",
    frequencyName: "Every 8 weeks",
    frequencyWeeks: 8 as const,
  },
] as const;

const LABOR_LABELS: Record<ProposalLaborLine["key"], string> = {
  load: "Load",
  driveToJob: "Drive time to job",
  unload: "Unload",
  install: "Install",
  cleanUp: "Clean up",
  driveFromJob: "Drive time from job",
};

function laborPeopleRuleShortLabel(rule: string): string {
  switch (rule) {
    case "plants_17_or_larger":
      return '17"+ plants present';
    case "total_14_over_threshold":
      return "14\" plant count over threshold";
    case "total_10_over_threshold":
      return "10\" plant count over threshold";
    case "total_6_8_over_threshold":
      return "6\"+8\" plant count over threshold";
    default:
      return "Default (1 installer)";
  }
}

function newRequirementId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyRequirementLine(): ClientRequirementLine {
  return {
    id: newRequirementId(),
    plantCatalogId: "",
    area: "",
    qty: 1,
    environment: "indoor",
    clientHasPot: false,
    plantingWithoutPot: false,
    guaranteed: false,
    potType: "",
    notes: "",
  };
}

function requirementNeedsPotSelection(line: ClientRequirementLine): boolean {
  return !line.clientHasPot && !line.plantingWithoutPot;
}

function proposalEntityItemsToDraft(
  items: Proposal["items"],
): ProposalItemInput[] {
  return items.map((it) => ({
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
    requiresRotation: it.requiresRotation,
    vendorName: it.vendorName,
    vendorAddress: it.vendorAddress,
    photos: it.category === "plant" ? [...(it.photos ?? [])] : undefined,
    sizeInches: it.sizeInches ?? undefined,
    environment: it.environment,
    plantingWithoutPot: it.plantingWithoutPot,
    guaranteed: it.guaranteed,
    relatedPlantItemId: it.relatedPlantItemId,
    stagingImageUrl: it.stagingImageUrl,
  }));
}

/** Import rows from CSV (Excel can save as CSV using the template). */
function parseRequirementsCsv(
  text: string,
  plants: PlantCatalogEntry[],
): ClientRequirementLine[] {
  const lines = text.trim().split(/\r?\n/u);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const iArea = idx("area");
  const iQty = idx("qty");
  const iPot = idx("pot_type");
  const iEnv = idx("environment");
  const iClientHasPot = idx("client_has_pot");
  const iPlantingWithoutPot = idx("planting_without_pot");
  const iGuaranteed = idx("guaranteed");
  const iPotMode = idx("pot_mode");
  const iNotes = idx("notes");
  const iPlant = idx("plant_keyword");
  const iPlantId = idx("plant_catalog_id");
  if (
    iArea < 0 &&
    iQty < 0 &&
    iPot < 0 &&
    iNotes < 0 &&
    iPlant < 0 &&
    iPlantId < 0
  ) {
    return [];
  }
  const out: ClientRequirementLine[] = [];
  for (let r = 1; r < lines.length; r++) {
    const raw = lines[r];
    if (!raw.trim()) continue;
    const cells = raw.split(",").map((c) => c.trim().replace(/^"|"$/gu, ""));
    const area = iArea >= 0 ? (cells[iArea] ?? "") : "";
    const qty = Math.max(1, Number(cells[iQty >= 0 ? iQty : 0]) || 1);
    const potType = iPot >= 0 ? (cells[iPot] ?? "") : "";
    const envRaw = iEnv >= 0 ? (cells[iEnv] ?? "") : "";
    const environment =
      envRaw.toLowerCase() === "outdoor" ? "outdoor" : "indoor";
    const yesNo = (v: string) =>
      ["1", "true", "yes", "y"].includes(v.trim().toLowerCase());
    const potMode =
      iPotMode >= 0 ? (cells[iPotMode] ?? "").trim().toLowerCase() : "";
    let clientHasPot =
      iClientHasPot >= 0 ? yesNo(cells[iClientHasPot] ?? "") : false;
    let plantingWithoutPot =
      iPlantingWithoutPot >= 0
        ? yesNo(cells[iPlantingWithoutPot] ?? "")
        : false;
    if (potMode === "client_has_pot") {
      clientHasPot = true;
      plantingWithoutPot = false;
    } else if (potMode === "planting_without_pot") {
      clientHasPot = false;
      plantingWithoutPot = true;
    } else if (potMode === "needs_pot") {
      clientHasPot = false;
      plantingWithoutPot = false;
    }
    if (clientHasPot && plantingWithoutPot) {
      plantingWithoutPot = false;
    }
    const notes = iNotes >= 0 ? (cells[iNotes] ?? "") : "";
    const guaranteed =
      iGuaranteed >= 0 ? yesNo(cells[iGuaranteed] ?? "") : false;
    let plantCatalogId = "";
    if (
      iPlantId >= 0 &&
      cells[iPlantId] &&
      plants.some((p) => p.id === cells[iPlantId])
    ) {
      plantCatalogId = cells[iPlantId];
    } else if (iPlant >= 0 && cells[iPlant]) {
      const kw = cells[iPlant].toLowerCase();
      const hit = plants.find(
        (p) =>
          p.name.toLowerCase().includes(kw) ||
          `${p.name} ${p.size}`.toLowerCase().includes(kw),
      );
      if (hit) plantCatalogId = hit.id;
    }
    out.push({
      id: newRequirementId(),
      plantCatalogId,
      area,
      qty,
      environment,
      clientHasPot,
      plantingWithoutPot,
      guaranteed,
      potType,
      notes,
    });
  }
  return out.length ? out : [];
}

function potItemFromCatalog(
  pot: PotCatalogEntry,
  supplier: GrowerOption,
  cfg: PricingEngineConfig,
  markup?: number,
): ProposalItemInput {
  return {
    category: "pot",
    catalogId: pot.id,
    name: pot.name,
    area: "",
    qty: 1,
    wholesaleCost: supplier.price,
    markup: markup ?? cfg.defaultMarkup,
    freightRate: defaultFreight("pot", cfg),
    clientOwnsPot: false,
    requiresRotation: false,
    vendorName: supplier.name,
    vendorAddress: supplier.address,
  };
}

function findPotCatalogMatch(
  potType: string,
  pots: PotCatalogEntry[],
): PotCatalogEntry | undefined {
  const t = potType.trim().toLowerCase();
  if (!t) return undefined;
  const exact = pots.find((p) => p.name.toLowerCase() === t);
  if (exact) return exact;
  return pots.find(
    (p) =>
      p.name.toLowerCase().includes(t) ||
      t.includes(p.name.toLowerCase().slice(0, 12)),
  );
}

function potItemFromRequirementLine(
  line: ClientRequirementLine,
  pots: PotCatalogEntry[],
  cfg: PricingEngineConfig,
  markup?: number,
): ProposalItemInput | null {
  if (!requirementNeedsPotSelection(line)) return null;
  const pt = line.potType.trim();
  if (!pt) return null;
  const match = findPotCatalogMatch(pt, pots);
  if (match?.suppliers.length) {
    const sorted = [...match.suppliers].sort((a, b) => a.price - b.price);
    const best = sorted[0];
    const row = potItemFromCatalog(match, best, cfg, markup);
    row.qty = Math.max(1, line.qty);
    row.area = line.area.trim() || undefined;
    return row;
  }
  return {
    category: "pot",
    catalogId: `req-pot-${line.id}`,
    name: pt,
    area: line.area.trim() || undefined,
    qty: Math.max(1, line.qty),
    wholesaleCost: 28,
    markup: markup ?? 1.25,
    freightRate: defaultFreight("pot", cfg),
    clientOwnsPot: false,
    requiresRotation: false,
    vendorName: "Vendor TBD",
    vendorAddress: "",
  };
}

function autoSourcePotItemsFromRequirements(
  requirementLines: ClientRequirementLine[],
  pots: PotCatalogEntry[],
  cfg: PricingEngineConfig,
  markup?: number,
): ProposalItemInput[] {
  const grouped = new Map<
    string,
    { qty: number; areas: Set<string>; firstLineId: string; potType: string }
  >();

  for (const line of requirementLines) {
    if (!requirementNeedsPotSelection(line)) continue;
    const pt = line.potType.trim();
    if (!pt) continue;
    const key = pt.toLowerCase();
    const area = line.area.trim();
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.qty += Math.max(1, line.qty);
      if (area) bucket.areas.add(area);
      continue;
    }
    grouped.set(key, {
      qty: Math.max(1, line.qty),
      areas: area ? new Set([area]) : new Set<string>(),
      firstLineId: line.id,
      potType: pt,
    });
  }

  const out: ProposalItemInput[] = [];
  for (const entry of grouped.values()) {
    const areaValues = [...entry.areas];
    const groupedLine: ClientRequirementLine = {
      id: entry.firstLineId,
      plantCatalogId: "",
      area: areaValues.length <= 1 ? (areaValues[0] ?? "") : "Multiple areas",
      qty: entry.qty,
      environment: "indoor",
      clientHasPot: false,
      plantingWithoutPot: false,
      guaranteed: false,
      potType: entry.potType,
      notes: "",
    };
    const pot = potItemFromRequirementLine(groupedLine, pots, cfg, markup);
    if (pot) out.push(pot);
  }
  return out;
}

/** v2: seed from `src/data/staggings-list.json` (images + provider prices). */
const STAGING_LIBRARY_STORAGE_KEY = "greenery.stagingLibrary.v2";

/** Map proposal line catalogId back to a staging library row id. */
function stagingLibraryIdFromCatalogId(catalogId: string): string | null {
  if (catalogId.startsWith("staging-lib-")) {
    return catalogId.slice("staging-lib-".length);
  }
  const m = /^staging-json-(\d+)$/.exec(catalogId);
  if (m) return `staging-cat-${m[1]}`;
  return null;
}

/** Parse `staging-auto-<plantKey>-<materialSourceId>` (plantKey may contain `-`). */
function parseAutoStagingCatalogId(catalogId: string): {
  plantKey: string;
  sourceId: number;
} | null {
  if (!catalogId.startsWith("staging-auto-")) return null;
  const rest = catalogId.slice("staging-auto-".length);
  const last = rest.lastIndexOf("-");
  if (last <= 0) return null;
  const sourcePart = rest.slice(last + 1);
  const plantKey = rest.slice(0, last);
  const sourceId = Number(sourcePart);
  if (!Number.isFinite(sourceId)) return null;
  return { plantKey, sourceId };
}

function stagingPresetUsedOnPlant(
  items: ProposalItemInput[],
  plantKey: string,
  preset: StagingLibraryItem,
): boolean {
  for (const row of items) {
    if (row.category !== "staging") continue;
    if (stagingGroupKeyFromLine(row) !== plantKey) continue;
    const libId = stagingLibraryIdFromCatalogId(row.catalogId);
    if (libId === preset.id) return true;
    const auto = parseAutoStagingCatalogId(row.catalogId);
    if (
      auto &&
      auto.plantKey === plantKey &&
      typeof preset.sourceId === "number" &&
      auto.sourceId === preset.sourceId
    ) {
      return true;
    }
  }
  return false;
}

function stagingPresetsAvailableForPlant(
  items: ProposalItemInput[],
  library: StagingLibraryItem[],
  plantKey: string,
): StagingLibraryItem[] {
  return library.filter(
    (preset) => !stagingPresetUsedOnPlant(items, plantKey, preset),
  );
}

function newStagingLibraryId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `st-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Pot size token from trailing "(14\\")" style suffix on catalog names. */
function potSizeFromPlantName(name: string): string {
  const m = name.match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : "—";
}

export function ProposalWizard({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlProposalId = searchParams.get("proposalId")?.trim() ?? "";
  const urlWizardStepRaw = searchParams.get("wizardStep");

  const [dark, setDark] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [clients, setClients] = useState<Client[]>([]);
  const [catalog, setCatalog] = useState<PlantCatalogEntry[]>([]);
  const [potCatalog, setPotCatalog] = useState<PotCatalogEntry[]>([]);
  const [growerCatalogModalOpen, setGrowerCatalogModalOpen] = useState(false);
  const [growerCatalogSearch, setGrowerCatalogSearch] = useState("");
  const [growerResupplyDraftIndex, setGrowerResupplyDraftIndex] = useState<
    number | null
  >(null);
  const [potCatalogModalOpen, setPotCatalogModalOpen] = useState(false);
  const [potCatalogSearch, setPotCatalogSearch] = useState("");
  const [potResupplyDraftIndex, setPotResupplyDraftIndex] = useState<
    number | null
  >(null);
  const [stagingLibrary, setStagingLibrary] = useState<StagingLibraryItem[]>(
    [],
  );
  const [stagingLibraryReady, setStagingLibraryReady] = useState(false);
  const [stagingLibraryModalOpen, setStagingLibraryModalOpen] = useState(false);
  const [stagingCatalogModalOpen, setStagingCatalogModalOpen] = useState(false);
  /** Plant key (`plantKeyForStaging`) when picking a catalog preset to add under that plant. */
  const [stagingPickPlantKey, setStagingPickPlantKey] = useState<string | null>(
    null,
  );
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const clientSelectRef = useRef<HTMLDivElement | null>(null);

  const [clientId, setClientId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [saleType, setSaleType] = useState<SaleType>("new_installation");
  const [requirementLines, setRequirementLines] = useState<
    ClientRequirementLine[]
  >(() => [emptyRequirementLine()]);
  const [markupMode, setMarkupMode] = useState<MarkupPricingMode>("open");
  const [commissionDetailsEnabled, setCommissionDetailsEnabled] =
    useState(false);
  const [commissionBeneficiarySlots, setCommissionBeneficiarySlots] = useState<
    string[]
  >([]);
  const [beneficiaryReduceModal, setBeneficiaryReduceModal] = useState<{
    targetCount: number;
  } | null>(null);
  const [beneficiaryRemovePicks, setBeneficiaryRemovePicks] = useState<
    string[]
  >([]);
  const [commissionBeneficiaryCatalog, setCommissionBeneficiaryCatalog] =
    useState<CommissionBeneficiary[]>([]);
  const [commissionBeneficiaryModalOpen, setCommissionBeneficiaryModalOpen] =
    useState(false);
  const autoSourceDoneRef = useRef(false);

  const [proposalId, setProposalId] = useState<string | null>(null);
  const [proposalStatus, setProposalStatus] =
    useState<Proposal["status"]>("draft");

  const [engineConfig, setEngineConfig] = useState<PricingEngineConfig>(
    DEFAULT_PRICING_ENGINE_CONFIG,
  );
  const [laborEngineConfig, setLaborEngineConfig] = useState<LaborEngineConfig>(
    DEFAULT_LABOR_ENGINE_CONFIG,
  );
  const [apiDriveLegs, setApiDriveLegs] = useState<{
    toJobHours: number;
    fromJobHours: number;
    mapsApiFallbackUsed: boolean;
  } | null>(null);
  const [laborLines, setLaborLines] = useState<ProposalLaborLine[]>(() =>
    defaultLaborLines().map((l) => ({ ...l })),
  );
  const laborAutoMode = true;
  const [driveMinutesOverride] = useState<string>("");
  const [commissionPct, setCommissionPct] = useState(0);
  const [commissionBeneficiaries, setCommissionBeneficiaries] = useState(0);

  const [productTab, setProductTab] = useState<ItemCategory>("plant");
  const [draftItems, setDraftItems] = useState<ProposalItemInput[]>([]);
  const plantPhotoInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  const [rotations, setRotations] = useState<ProposalRotation[]>([]);

  const [contactName, setContactName] = useState("");
  const [submittedBy, setSubmittedBy] = useState("Marilyn Wetzel");
  const [maintenanceTier, setMaintenanceTier] = useState<
    "tier_1" | "tier_2" | "tier_3"
  >("tier_2");

  const [proposalPreview, setProposalPreview] = useState<"client" | "guts">(
    "client",
  );

  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [sendEmail, setSendEmail] = useState("");
  const [sendSubject, setSendSubject] = useState(
    "Interior Plant Proposal — Greenery Productions",
  );
  const [workflowNotice, setWorkflowNotice] = useState<string | null>(null);
  const [stagingImagePreview, setStagingImagePreview] = useState<string | null>(
    null,
  );
  const [hiddenSuggestedKeys, setHiddenSuggestedKeys] = useState<
    Record<string, true>
  >({});

  const isProposalLocked = proposalStatus === "approved";

  function isProposalNotFoundError(e: unknown): boolean {
    if (typeof e === "object" && e !== null) {
      const maybeStatus = (e as { status?: unknown; statusCode?: unknown })
        .status;
      const maybeStatusCode = (e as { status?: unknown; statusCode?: unknown })
        .statusCode;
      if (maybeStatus === 404 || maybeStatusCode === 404) return true;
    }
    return toErrorMessage(e).toLowerCase().includes("not found");
  }

  async function openPricingSettings() {
    setError(null);
    try {
      const id = await ensureProposalCreated();
      await patchProposalGeneral(id, { quiet: true });
      const q = new URLSearchParams();
      q.set("wizardStep", "1");
      q.set("proposalId", id);
      const returnTo = `/maintenance/proposals/new?${q.toString()}`;
      router.push(`/admin/pricing?returnTo=${encodeURIComponent(returnTo)}`);
    } catch (e) {
      setError(toErrorMessage(e));
    }
  }

  const hydrateProposalFromServer = useCallback(async (id: string) => {
    setError(null);
    setBusy(true);
    try {
      const p = await apiGet<Proposal>(`/proposals/${id}`);
      setProposalId(p.id);
      setProposalStatus(p.status);
      setClientId(p.clientId);
      setLocationId(p.locationId);
      setSaleType(
        p.saleType === "replacement" ||
          p.saleType === "new_sale" ||
          p.saleType === "new_installation"
          ? p.saleType
          : "new_installation",
      );
      setContactName(p.contactName ?? "");
      setSubmittedBy(p.submittedBy ?? "");
      setMaintenanceTier(p.maintenanceTier);
      setRotations(p.rotations ?? []);
      setLaborLines(
        p.laborLines?.length
          ? p.laborLines.map((l) => ({ ...l }))
          : defaultLaborLines().map((l) => ({ ...l })),
      );
      setCommissionPct(p.commissionPct ?? 0);
      setCommissionBeneficiaries(p.commissionBeneficiaries ?? 0);
      setCommissionBeneficiarySlots(commissionSlotsFromProposal(p));
      setCommissionDetailsEnabled(
        (p.commissionPct ?? 0) > 0 || (p.commissionBeneficiaries ?? 0) > 0,
      );
      setDraftItems(proposalEntityItemsToDraft(p.items));
      if (p.requirementLines?.length) {
        setRequirementLines(
          p.requirementLines.map((r) => ({
            ...r,
            environment: r.environment === "outdoor" ? "outdoor" : "indoor",
            clientHasPot: Boolean(r.clientHasPot),
            plantingWithoutPot: Boolean(r.plantingWithoutPot),
            guaranteed: Boolean(r.guaranteed),
          })),
        );
      } else {
        setRequirementLines([emptyRequirementLine()]);
      }
      return p;
    } catch (e) {
      setError(toErrorMessage(e));
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId),
    [clients, clientId],
  );

  /** Derived from CRM flag — no separate "client type" control. */
  const clientKind = useMemo((): "new" | "old" | null => {
    if (!clientId || !selectedClient) return null;
    return selectedClient.isExistingCustomer ? "old" : "new";
  }, [clientId, selectedClient]);

  const uniqueSelectedBeneficiaryIds = useMemo(
    () => [
      ...new Set(
        commissionBeneficiarySlots.map((s) => s.trim()).filter(Boolean),
      ),
    ],
    [commissionBeneficiarySlots],
  );
  const reduceRequiredCount = beneficiaryReduceModal
    ? Math.max(
        0,
        uniqueSelectedBeneficiaryIds.length -
          beneficiaryReduceModal.targetCount,
      )
    : 0;

  useEffect(() => {
    if (embedded) return;
    document.documentElement.classList.toggle("dark", dark);
  }, [dark, embedded]);

  useEffect(() => {
    if (!embedded) return;
    setDark(document.documentElement.classList.contains("dark"));
  }, [embedded]);

  useEffect(() => {
    apiGet<PricingEngineConfig>("/pricing-config")
      .then((cfg) => {
        setEngineConfig(cfg);
      })
      .catch(() => {
        /* keep defaults */
      });
    apiGet<LaborEngineConfig>("/labor-engine-config")
      .then((cfg) => {
        setLaborEngineConfig(cfg);
      })
      .catch(() => {
        /* keep defaults */
      });
  }, []);

  const loadBootstrap = useCallback(async () => {
    setError(null);
    const [cList, plants, pots, beneficiaries] = await Promise.all([
      apiGet<Client[]>("/clients"),
      apiGet<PlantCatalogEntry[]>("/catalog/plants"),
      apiGet<PotCatalogEntry[]>("/catalog/pots"),
      apiGet<CommissionBeneficiary[]>("/commission-beneficiaries"),
    ]);
    setClients(cList);
    setCatalog(plants);
    setPotCatalog(pots);
    setCommissionBeneficiaryCatalog(beneficiaries);
    if (cList.length) {
      setClientId((prev) => prev || cList[0].id);
      const loc0 = cList[0].locations[0];
      if (loc0) setLocationId((prev) => prev || loc0.id);
    }
  }, []);

  useEffect(() => {
    loadBootstrap().catch((e: unknown) => setError(toErrorMessage(e)));
  }, [loadBootstrap]);

  useEffect(() => {
    if (!urlProposalId) return;
    let cancelled = false;
    const stepRaw = urlWizardStepRaw;
    const stepNum =
      stepRaw != null && stepRaw !== "" && Number.isFinite(Number(stepRaw))
        ? Math.max(0, Math.min(STEPS.length - 1, Math.floor(Number(stepRaw))))
        : null;
    void hydrateProposalFromServer(urlProposalId)
      .then((p) => {
        if (cancelled) return;
        if (p.status === "approved") {
          setStep(5);
          return;
        }
        if (stepNum !== null) {
          setStep(stepNum);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (isProposalNotFoundError(e)) {
          setProposalId(null);
          setProposalStatus("draft");
          setError(
            "This proposal was not found. It may have been removed or the server restarted. Continue from General to create a new one.",
          );
          router.replace("/maintenance/proposals/new?wizardStep=1");
          setStep(1);
          return;
        }
        setError(toErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [urlProposalId, urlWizardStepRaw, hydrateProposalFromServer, router]);

  useEffect(() => {
    if (!selectedClient?.locations.length) return;
    const ok = selectedClient.locations.some((l) => l.id === locationId);
    if (!ok) setLocationId(selectedClient.locations[0].id);
  }, [selectedClient, locationId]);

  useEffect(() => {
    if (selectedClient?.email) {
      setSendEmail((prev) => prev || selectedClient.email);
    }
  }, [selectedClient]);

  useEffect(() => {
    const catalog = buildStagingLibraryFromJson();
    const snap = (rows: StagingLibraryItem[]) =>
      rows.map((row) => ({
        ...row,
        markup: snapMarkupToPricingLadder(
          row.markup ?? DEFAULT_PRICING_ENGINE_CONFIG.defaultMarkup,
          DEFAULT_PRICING_ENGINE_CONFIG,
        ),
      }));
    try {
      const raw = localStorage.getItem(STAGING_LIBRARY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StagingLibraryItem[];
        if (Array.isArray(parsed) && parsed.length) {
          setStagingLibrary(snap(parsed));
        } else {
          setStagingLibrary(catalog);
        }
      } else {
        setStagingLibrary(catalog);
      }
    } catch {
      setStagingLibrary(catalog);
    }
    setStagingLibraryReady(true);
  }, []);

  useEffect(() => {
    if (!stagingLibraryReady || typeof window === "undefined") return;
    try {
      localStorage.setItem(
        STAGING_LIBRARY_STORAGE_KEY,
        JSON.stringify(stagingLibrary),
      );
    } catch {
      /* ignore quota */
    }
  }, [stagingLibrary, stagingLibraryReady]);

  async function ensureProposalCreated() {
    if (proposalId) return proposalId;
    setBusy(true);
    setError(null);
    try {
      const p = await apiJson<Proposal>("/proposals", {
        method: "POST",
        body: JSON.stringify({ clientId, locationId, saleType }),
      });
      setProposalId(p.id);
      setProposalStatus(p.status);
      if (p.contactName) setContactName(p.contactName);
      if (p.submittedBy) setSubmittedBy(p.submittedBy);
      setMaintenanceTier(p.maintenanceTier);
      setRotations(p.rotations ?? []);
      setLaborLines(
        p.laborLines?.length
          ? p.laborLines.map((l) => ({ ...l }))
          : defaultLaborLines().map((l) => ({ ...l })),
      );
      setCommissionPct(p.commissionPct ?? 0);
      setCommissionBeneficiaries(p.commissionBeneficiaries ?? 0);
      setCommissionBeneficiarySlots(commissionSlotsFromProposal(p));
      setCommissionDetailsEnabled(
        (p.commissionPct ?? 0) > 0 || (p.commissionBeneficiaries ?? 0) > 0,
      );
      return p.id;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : toErrorMessage(e) === "Something went wrong"
            ? "Could not create draft proposal"
            : toErrorMessage(e),
      );
      rethrowAsError(e);
    } finally {
      setBusy(false);
    }
  }

  async function patchProposalGeneral(
    explicitId?: string,
    opts?: { quiet?: boolean },
  ) {
    const id = explicitId ?? proposalId;
    if (!id) return;
    if (!opts?.quiet) {
      setBusy(true);
    }
    setError(null);
    try {
      const rawIds = commissionDetailsEnabled
        ? [
            ...new Set(
              commissionBeneficiarySlots.map((s) => s.trim()).filter(Boolean),
            ),
          ]
        : [];
      const firstRow = rawIds.length
        ? commissionBeneficiaryCatalog.find((b) => b.id === rawIds[0])
        : undefined;
      await apiJson<Proposal>(`/proposals/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          contactName: contactName.trim() || undefined,
          submittedBy: submittedBy.trim() || undefined,
          maintenanceTier,
          requirementLines: requirementLines.map((r) => ({ ...r })),
          laborLines,
          commissionPct: commissionDetailsEnabled ? commissionPct : 0,
          commissionBeneficiaries: commissionDetailsEnabled
            ? commissionBeneficiaries
            : 0,
          commissionBeneficiaryIds: commissionDetailsEnabled ? rawIds : [],
          commissionBeneficiaryId: commissionDetailsEnabled
            ? (rawIds[0] ?? null)
            : null,
          commissionBeneficiaryName: commissionDetailsEnabled
            ? firstRow?.name.trim() || undefined
            : "",
          commissionBeneficiaryPhone: commissionDetailsEnabled
            ? firstRow?.phone?.trim() || undefined
            : "",
          commissionBeneficiaryEmail: commissionDetailsEnabled
            ? firstRow?.email.trim() || undefined
            : "",
        }),
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : toErrorMessage(e) === "Something went wrong"
            ? "Could not save details"
            : toErrorMessage(e),
      );
      rethrowAsError(e);
    } finally {
      if (!opts?.quiet) {
        setBusy(false);
      }
    }
  }

  async function saveItemsAndSyncRotations() {
    const id = await ensureProposalCreated();
    setBusy(true);
    setError(null);
    try {
      const fresh = await apiJson<Proposal>(`/proposals/${id}/items`, {
        method: "PUT",
        body: JSON.stringify({ items: draftItems }),
      });
      setRotations(fresh.rotations);
      setDraftItems(
        fresh.items.map((it) => ({
          ...it,
          photos: it.category === "plant" ? (it.photos ?? []) : undefined,
        })),
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : toErrorMessage(e) === "Something went wrong"
            ? "Could not save products"
            : toErrorMessage(e),
      );
      rethrowAsError(e);
    } finally {
      setBusy(false);
    }
  }

  async function saveRotations() {
    if (!proposalId) return;
    setBusy(true);
    setError(null);
    try {
      const payload = rotations.map((r) => ({
        id: r.id,
        itemId: r.itemId,
        plantName: r.plantName,
        qty: r.qty,
        frequencyName: r.frequencyName,
        frequencyWeeks: r.frequencyWeeks,
        rotationUnitPrice: r.rotationUnitPrice,
        truckFee: r.truckFee,
      }));
      await apiJson<Proposal>(`/proposals/${proposalId}/rotations`, {
        method: "PUT",
        body: JSON.stringify({ rotations: payload }),
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : toErrorMessage(e) === "Something went wrong"
            ? "Could not save rotations"
            : toErrorMessage(e),
      );
      rethrowAsError(e);
    } finally {
      setBusy(false);
    }
  }

  async function loadSummary() {
    if (!proposalId) return;
    setBusy(true);
    setError(null);
    try {
      const s = await apiGet<SummaryResponse>(
        `/proposals/${proposalId}/summary`,
      );
      setSummary(s);
      setProposalStatus(s.proposal.status);
      setSendEmail((prev) => prev || s.client.email);
      if (s.requirementLines !== undefined) {
        setRequirementLines(
          s.requirementLines.length
            ? s.requirementLines.map((r) => ({
                ...r,
                guaranteed: Boolean(r.guaranteed),
              }))
            : [emptyRequirementLine()],
        );
      }
      if (s.laborLines?.length) {
        setLaborLines(s.laborLines.map((l) => ({ ...l })));
      }
      if (s.commissionPct !== undefined) setCommissionPct(s.commissionPct);
      if (s.commissionBeneficiaries !== undefined) {
        setCommissionBeneficiaries(s.commissionBeneficiaries);
      }
      if (
        s.commissionBeneficiaries !== undefined ||
        s.commissionBeneficiaryIds !== undefined
      ) {
        setCommissionBeneficiarySlots(
          commissionSlotsFromProposal({
            commissionBeneficiaries: s.commissionBeneficiaries ?? 0,
            commissionBeneficiaryIds: s.commissionBeneficiaryIds,
            commissionBeneficiaryId: undefined,
          }),
        );
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : toErrorMessage(e) === "Something went wrong"
            ? "Could not load summary"
            : toErrorMessage(e),
      );
      rethrowAsError(e);
    } finally {
      setBusy(false);
    }
  }

  async function runWorkflowAction(
    action: "send_to_client" | "simulate_approval",
  ) {
    if (!proposalId) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/proposals/${proposalId}/workflow`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      await loadSummary();
      setWorkflowNotice(
        action === "send_to_client"
          ? "Proposal sent to client. Waiting for approval."
          : "Client approval simulated. Two internal purchase orders were generated.",
      );
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function goNext() {
    if (isProposalLocked) return;
    setError(null);
    try {
      if (step === 0) {
        if (proposalId) {
          await patchProposalGeneral(proposalId, { quiet: true });
        }
        setStep((s) => Math.min(s + 1, STEPS.length - 1));
        return;
      }
      if (step === 1) {
        const id = await ensureProposalCreated();
        await patchProposalGeneral(id);
      }
      if (step === 2) {
        await saveItemsAndSyncRotations();
      }
      if (step === 3) {
        await saveRotations();
      }
      if (step === 4) {
        await saveItemsAndSyncRotations();
        await patchProposalGeneral();
        await loadSummary();
      }
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    } catch (e) {
      setError(toErrorMessage(e));
    }
  }

  function goBack() {
    if (isProposalLocked) return;
    if (step === 1 && proposalId) {
      void patchProposalGeneral(proposalId, { quiet: true }).catch(() => {});
    }
    setStep((s) => Math.max(s - 1, 0));
  }

  function addPlant(
    plant: PlantCatalogEntry,
    growerIndex: number,
    opts?: { qty?: number; area?: string },
  ) {
    const grower = plant.growers[growerIndex];
    if (!grower) return;
    const mk = resolveMarkupForSale(engineConfig, saleType, markupMode);
    const row = plantItemFromCatalog(plant, grower, engineConfig, mk);
    if (growerResupplyDraftIndex !== null) {
      setDraftItems((prev) =>
        prev.map((r, idx) =>
          idx === growerResupplyDraftIndex
            ? {
                ...r,
                catalogId: plant.id,
                name: row.name,
                wholesaleCost: grower.price,
                markup: row.markup,
                freightRate: row.freightRate,
                vendorName: grower.name,
                vendorAddress: grower.address,
                requiresRotation: row.requiresRotation,
              }
            : r,
        ),
      );
      setGrowerResupplyDraftIndex(null);
    } else {
      if (opts?.qty != null) row.qty = Math.max(1, opts.qty);
      if (opts?.area != null && opts.area !== "") row.area = opts.area;
      setDraftItems((prev) => [...prev, row]);
    }
    setGrowerCatalogModalOpen(false);
    setGrowerCatalogSearch("");
  }

  function addPotFromCatalog(
    pot: PotCatalogEntry,
    supplierIdx: number,
    opts?: { qty?: number; area?: string },
  ) {
    const supplier = pot.suppliers[supplierIdx];
    if (!supplier) return;
    const mk = resolveMarkupForSale(engineConfig, saleType, markupMode);
    const row = potItemFromCatalog(pot, supplier, engineConfig, mk);
    if (potResupplyDraftIndex !== null) {
      setDraftItems((prev) =>
        prev.map((r, idx) =>
          idx === potResupplyDraftIndex
            ? {
                ...r,
                catalogId: pot.id,
                name: pot.name,
                wholesaleCost: supplier.price,
                markup: row.markup,
                freightRate: row.freightRate,
                vendorName: supplier.name,
                vendorAddress: supplier.address,
                clientOwnsPot: false,
                qty: opts?.qty != null ? Math.max(1, opts.qty) : r.qty,
                area: opts?.area !== undefined ? opts.area : r.area,
              }
            : r,
        ),
      );
      setPotResupplyDraftIndex(null);
    } else {
      if (opts?.qty != null) row.qty = Math.max(1, opts.qty);
      if (opts?.area != null && opts.area !== "") row.area = opts.area;
      setDraftItems((prev) => [...prev, row]);
    }
    setPotCatalogModalOpen(false);
    setPotCatalogSearch("");
  }

  function neededQtyForPot(potId: string): number {
    const n = requirementLines
      .filter((l) => {
        if (!requirementNeedsPotSelection(l)) return false;
        const m = findPotCatalogMatch(l.potType, potCatalog);
        return m?.id === potId;
      })
      .reduce((s, l) => s + l.qty, 0);
    return n > 0 ? n : 1;
  }

  function firstRequirementAreaForPot(potId: string): string | undefined {
    const line = requirementLines.find((l) => {
      if (!requirementNeedsPotSelection(l)) return false;
      const m = findPotCatalogMatch(l.potType, potCatalog);
      return m?.id === potId;
    });
    const a = line?.area?.trim();
    return a || undefined;
  }

  function setCommissionSlot(index: number, id: string) {
    setCommissionBeneficiarySlots((prev) => {
      const next = [...prev];
      if (index < 0 || index >= next.length) return prev;
      next[index] = id.trim();
      return next;
    });
  }

  function clearCommissionSlot(index: number) {
    setCommissionSlot(index, "");
  }

  function onCommissionBeneficiariesCountInput(nextCount: number) {
    const safe = Math.max(0, Math.floor(nextCount));
    const filledIds = commissionBeneficiarySlots.filter((s) => s.trim());
    const uniqueCount = new Set(filledIds).size;
    if (safe < uniqueCount) {
      setBeneficiaryRemovePicks([]);
      setBeneficiaryReduceModal({ targetCount: safe });
      return;
    }
    setCommissionBeneficiaries(safe);
    setCommissionBeneficiarySlots((prev) => {
      if (safe > prev.length) {
        return [...prev, ...Array(safe - prev.length).fill("")];
      }
      if (safe < prev.length) {
        return prev.slice(0, safe);
      }
      return prev;
    });
  }

  function confirmBeneficiaryReduction(removeIds: Set<string>) {
    if (!beneficiaryReduceModal) return;
    const { targetCount } = beneficiaryReduceModal;
    const remaining = commissionBeneficiarySlots
      .map((id) => id.trim())
      .filter((id) => id && !removeIds.has(id));
    const nextSlots = Array.from(
      { length: targetCount },
      (_, i) => remaining[i] ?? "",
    );
    setCommissionBeneficiaries(targetCount);
    setCommissionBeneficiarySlots(nextSlots);
    setBeneficiaryRemovePicks([]);
    setBeneficiaryReduceModal(null);
  }

  function toggleBeneficiaryRemovePick(id: string) {
    setBeneficiaryRemovePicks((prev) => {
      const has = prev.includes(id);
      if (has) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }

  /** Force an immediate recalculation (auto staging already syncs when plants change). */
  function refreshAutoStagingNow() {
    setDraftItems((prev) =>
      mergeAutoStagingIntoDraft(prev, engineConfig, stagingLibrary),
    );
    setProductTab("staging");
  }

  function appendStagingLineFromLibrary(
    preset: StagingLibraryItem,
    targetPlant: {
      key: string;
      name: string;
      qty: number;
      area?: string;
    },
  ) {
    const cheapest =
      preset.providers && preset.providers.length > 0
        ? preset.providers.reduce((a, b) => (a.price <= b.price ? a : b))
        : null;
    const wholesale = cheapest?.price ?? preset.wholesaleCost;
    const vendorName = cheapest?.name ?? "Staging supplier";
    const vendorAddress = cheapest?.address ?? "Orlando, FL";
    const catalogId = `staging-lib-${preset.id}`;
    setDraftItems((prev) => [
      ...prev,
      {
        category: "staging",
        catalogId,
        name: preset.label,
        area: targetPlant.area,
        qty: Math.max(1, targetPlant.qty),
        wholesaleCost: wholesale,
        markup: snapMarkupToPricingLadder(preset.markup, engineConfig),
        freightRate: defaultFreight("staging", engineConfig),
        clientOwnsPot: false,
        requiresRotation: false,
        relatedPlantItemId: targetPlant.key,
        vendorName,
        vendorAddress,
        stagingImageUrl: preset.imageUrl,
      },
    ]);
  }

  function addStagingPresetForPlant(
    preset: StagingLibraryItem,
    plantKey: string,
  ) {
    if (stagingPresetUsedOnPlant(draftItems, plantKey, preset)) return;
    const targetPlant = allowedStagingTargets.find((t) => t.key === plantKey);
    if (!targetPlant) return;
    appendStagingLineFromLibrary(preset, targetPlant);
    setStagingPickPlantKey(null);
  }

  function neededQtyForPlant(plantId: string): number {
    const n = requirementLines
      .filter((l) => l.plantCatalogId === plantId)
      .reduce((s, l) => s + l.qty, 0);
    return n > 0 ? n : 1;
  }

  function firstRequirementAreaForPlant(plantId: string): string | undefined {
    const line = requirementLines.find((l) => l.plantCatalogId === plantId);
    const a = line?.area?.trim();
    return a || undefined;
  }

  function updateRequirementLine(
    id: string,
    patch: Partial<Omit<ClientRequirementLine, "id">>,
  ) {
    setRequirementLines((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }

  function removeRequirementLine(id: string) {
    setRequirementLines((rows) => {
      const next = rows.filter((r) => r.id !== id);
      return next.length ? next : [emptyRequirementLine()];
    });
  }

  function addRequirementLine() {
    setRequirementLines((rows) => [...rows, emptyRequirementLine()]);
  }

  function autoSourceAllFromRequirements() {
    const hasPlant = requirementLines.some((l) => l.plantCatalogId);
    if (!hasPlant) {
      setError(
        "Add at least one plant line in Requirements to build products.",
      );
      return;
    }
    setError(null);
    const mk = resolveMarkupForSale(engineConfig, saleType, markupMode);
    setDraftItems((prev) => {
      const next = prev.filter((row) => row.category === "staging");
      const existingPhotosByPlantKey = new Map<string, string[]>();
      for (const row of prev) {
        if (row.category !== "plant") continue;
        if (!row.catalogId || (row.photos?.length ?? 0) === 0) continue;
        const area = (row.area ?? "").trim().toLowerCase();
        existingPhotosByPlantKey.set(`${row.catalogId}::${area}`, [
          ...(row.photos ?? []),
        ]);
      }
      const addedPlants: ProposalItemInput[] = [];
      for (const line of requirementLines) {
        if (!line.plantCatalogId) continue;
        const plant = catalog.find((p) => p.id === line.plantCatalogId);
        if (!plant?.growers.length) continue;
        let bestIdx = 0;
        plant.growers.forEach((g, i) => {
          if (g.price < plant.growers[bestIdx].price) bestIdx = i;
        });
        const grower = plant.growers[bestIdx];
        const base = plantItemFromCatalog(plant, grower, engineConfig, mk);
        base.qty = Math.max(1, line.qty);
        base.area = line.area.trim();
        base.environment = line.environment;
        base.plantingWithoutPot = line.plantingWithoutPot;
        base.guaranteed = line.guaranteed;
        if (line.clientHasPot || line.plantingWithoutPot) {
          base.clientOwnsPot = true;
        }
        const extras: string[] = [];
        if (line.clientHasPot) {
          extras.push("Client already has pot");
        } else if (line.plantingWithoutPot) {
          extras.push("Planting without pot");
        } else if (line.potType.trim()) {
          extras.push(`Pot: ${line.potType.trim()}`);
        }
        if (line.notes.trim()) extras.push(line.notes.trim());
        if (extras.length) {
          base.name = `${base.name} (${extras.join("; ")})`;
        }
        const keepPhotos = existingPhotosByPlantKey.get(
          `${line.plantCatalogId}::${line.area.trim().toLowerCase()}`,
        );
        if (keepPhotos?.length) {
          base.photos = keepPhotos;
        }
        next.push(base);
        addedPlants.push(base);
      }
      const potRows = autoSourcePotItemsFromRequirements(
        requirementLines,
        potCatalog,
        engineConfig,
        mk,
      );
      next.push(...potRows);
      return next;
    });
  }

  const modalOverlayOpen =
    growerCatalogModalOpen ||
    potCatalogModalOpen ||
    stagingCatalogModalOpen ||
    Boolean(stagingPickPlantKey) ||
    stagingLibraryModalOpen ||
    commissionBeneficiaryModalOpen ||
    Boolean(beneficiaryReduceModal) ||
    Boolean(stagingImagePreview);

  useEffect(() => {
    if (!modalOverlayOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [modalOverlayOpen]);

  useEffect(() => {
    if (!modalOverlayOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setGrowerCatalogModalOpen(false);
        setPotCatalogModalOpen(false);
        setStagingLibraryModalOpen(false);
        setStagingCatalogModalOpen(false);
        setStagingPickPlantKey(null);
        setCommissionBeneficiaryModalOpen(false);
        setBeneficiaryReduceModal(null);
        setStagingImagePreview(null);
        setGrowerResupplyDraftIndex(null);
        setPotResupplyDraftIndex(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOverlayOpen]);

  const growerCatalogFiltered = useMemo(() => {
    const q = growerCatalogSearch.trim().toLowerCase();
    let list = catalog;
    if (growerResupplyDraftIndex !== null) {
      const row = draftItems[growerResupplyDraftIndex];
      if (row?.category === "plant") {
        list = catalog.filter((p) => p.id === row.catalogId);
      }
    }
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.size.toLowerCase().includes(q),
    );
  }, [catalog, growerCatalogSearch, growerResupplyDraftIndex, draftItems]);

  const potCatalogFiltered = useMemo(() => {
    const q = potCatalogSearch.trim().toLowerCase();
    let list = potCatalog;
    if (potResupplyDraftIndex !== null) {
      const row = draftItems[potResupplyDraftIndex];
      if (row?.category === "pot") {
        const selectedPot = potCatalog.find((p) => p.id === row.catalogId);
        if (selectedPot) {
          if ((selectedPot.suppliers?.length ?? 0) <= 1) {
            const similar = matchPotsForPlantSize(
              potCatalog,
              selectedPot.sizeInches ?? null,
            );
            list = [
              selectedPot,
              ...similar.filter((p) => p.id !== selectedPot.id),
            ];
          } else {
            list = potCatalog.filter((p) => p.id === row.catalogId);
          }
        }
      }
    }
    if (!q) return list;
    return list.filter((p) =>
      `${p.name} ${p.family ?? ""} ${p.kind ?? ""}`.toLowerCase().includes(q),
    );
  }, [potCatalog, potCatalogSearch, potResupplyDraftIndex, draftItems]);

  const potResupplySingleSupplierContext = useMemo(() => {
    if (potResupplyDraftIndex === null) return null;
    const row = draftItems[potResupplyDraftIndex];
    if (row?.category !== "pot") return null;
    const selectedPot = potCatalog.find((p) => p.id === row.catalogId);
    if (!selectedPot) return null;
    return (selectedPot.suppliers?.length ?? 0) <= 1
      ? {
          selectedPotName: selectedPot.name,
          sizeInches: selectedPot.sizeInches,
        }
      : null;
  }, [potResupplyDraftIndex, draftItems, potCatalog]);

  function removeDraftItem(globalIndex: number) {
    setDraftItems((prev) => prev.filter((_, i) => i !== globalIndex));
  }

  function updateDraftItem(
    globalIndex: number,
    patch: Partial<ProposalItemInput>,
  ) {
    setDraftItems((prev) =>
      prev.map((row, i) => (i === globalIndex ? { ...row, ...patch } : row)),
    );
  }

  function removePlantPhoto(globalIndex: number, photoIndex: number) {
    setDraftItems((prev) =>
      prev.map((row, i) => {
        if (i !== globalIndex || row.category !== "plant") return row;
        const next = [...(row.photos ?? [])];
        next.splice(photoIndex, 1);
        return { ...row, photos: next };
      }),
    );
  }

  async function appendPlantPhotosFromFiles(
    globalIndex: number,
    files: FileList | null,
  ) {
    if (!files?.length) return;
    const fileArr = [...files].filter((f) => f.type.startsWith("image/"));
    if (!fileArr.length) {
      setError("Choose image files (PNG, JPEG, WebP, or GIF).");
      return;
    }
    setError(null);
    const reads: string[] = [];
    for (const f of fileArr.slice(0, 12)) {
      if (f.size > 1_200_000) {
        setError(`"${f.name}" is too large (max ~1.2 MB per image).`);
        return;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("read"));
        r.readAsDataURL(f);
      });
      reads.push(dataUrl);
    }
    setDraftItems((prev) =>
      prev.map((row, i) => {
        if (i !== globalIndex || row.category !== "plant") return row;
        const merged = [...(row.photos ?? []), ...reads];
        return { ...row, photos: merged.slice(0, 12) };
      }),
    );
  }

  async function appendCatalogPhotoToPlant(
    globalIndex: number,
    imagePublicPath: string,
  ) {
    setError(null);
    try {
      const url =
        typeof window !== "undefined"
          ? new URL(imagePublicPath, window.location.origin).href
          : imagePublicPath;
      const res = await fetch(url);
      if (!res.ok) {
        setError(`Could not load catalog image (HTTP ${res.status}).`);
        return;
      }
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) {
        setError("Catalog asset is not an image.");
        return;
      }
      if (blob.size > 1_200_000) {
        setError("Catalog image is too large to embed (max ~1.2 MB).");
        return;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("read"));
        r.readAsDataURL(blob);
      });
      setDraftItems((prev) =>
        prev.map((row, i) => {
          if (i !== globalIndex || row.category !== "plant") return row;
          const merged = [...(row.photos ?? []), dataUrl];
          return { ...row, photos: merged.slice(0, 12) };
        }),
      );
    } catch {
      setError("Could not load catalog image.");
    }
  }

  async function replacePlantPhotosWithCatalog(
    globalIndex: number,
    imagePublicPath: string,
  ) {
    setError(null);
    try {
      const url =
        typeof window !== "undefined"
          ? new URL(imagePublicPath, window.location.origin).href
          : imagePublicPath;
      const res = await fetch(url);
      if (!res.ok) {
        setError(`Could not load catalog image (HTTP ${res.status}).`);
        return;
      }
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) {
        setError("Catalog asset is not an image.");
        return;
      }
      if (blob.size > 1_200_000) {
        setError("Catalog image is too large to embed (max ~1.2 MB).");
        return;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("read"));
        r.readAsDataURL(blob);
      });
      setDraftItems((prev) =>
        prev.map((row, i) => {
          if (i !== globalIndex || row.category !== "plant") return row;
          return { ...row, photos: [dataUrl] };
        }),
      );
    } catch {
      setError("Could not load catalog image.");
    }
  }

  function onImportRequirementsFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const rows = parseRequirementsCsv(text, catalog);
      if (rows.length) {
        setRequirementLines(rows);
        setError(null);
      } else {
        setError(
          "Could not import rows. Use the template header row and save as CSV.",
        );
      }
    };
    reader.readAsText(f);
  }

  async function applyCatalogPhotosToAllPlants() {
    setError(null);
    for (let i = 0; i < draftItems.length; i++) {
      const row = draftItems[i];
      if (row.category !== "plant") continue;
      if (
        selectedRequirementPlantIds.size > 0 &&
        !selectedRequirementPlantIds.has(row.catalogId)
      ) {
        continue;
      }
      if ((row.photos?.length ?? 0) > 0) continue;
      const picks = catalogEntriesForPhotoPicker(
        row.name,
        "",
        plantReferenceCatalog.plants,
      );
      const first = picks.find((p) => p.imagePublicPath);
      if (first?.imagePublicPath) {
        await appendCatalogPhotoToPlant(i, first.imagePublicPath);
      }
    }
  }

  const driveMinutesResolved = useMemo<number | null>(() => {
    const overrideNum =
      driveMinutesOverride.trim() === "" ? NaN : Number(driveMinutesOverride);
    if (Number.isFinite(overrideNum) && overrideNum >= 0) return overrideNum;
    const loc = selectedClient?.locations.find((l) => l.id === locationId);
    if (typeof loc?.driveTimeMinutes === "number") return loc.driveTimeMinutes;
    if (typeof selectedClient?.driveTimeMinutes === "number") {
      return selectedClient.driveTimeMinutes;
    }
    if (selectedClient?.id) {
      return simulateDriveMinutes(
        selectedClient.id,
        engineConfig.simulatedMaxDriveMinutes,
      );
    }
    return null;
  }, [
    driveMinutesOverride,
    locationId,
    selectedClient,
    engineConfig.simulatedMaxDriveMinutes,
  ]);

  const driveDistanceResolved = useMemo<number | null>(() => {
    const loc = selectedClient?.locations.find((l) => l.id === locationId);
    if (typeof loc?.driveDistanceKm === "number") return loc.driveDistanceKm;
    if (typeof selectedClient?.driveDistanceKm === "number") {
      return selectedClient.driveDistanceKm;
    }
    return null;
  }, [locationId, selectedClient]);

  const selectedLocation = useMemo(
    () => selectedClient?.locations.find((l) => l.id === locationId),
    [selectedClient, locationId],
  );

  /** CRM / data one-way minutes (excludes simulated hash fallback). */
  const crmDriveOneWayMinutes = useMemo<number | null>(() => {
    if (typeof selectedLocation?.driveTimeMinutes === "number") {
      return selectedLocation.driveTimeMinutes;
    }
    if (typeof selectedClient?.driveTimeMinutes === "number") {
      return selectedClient.driveTimeMinutes;
    }
    return null;
  }, [selectedClient, selectedLocation]);

  const vendorAddressTrimmed = useMemo(
    () => engineConfig.vendorHomeAddress?.trim() ?? "",
    [engineConfig.vendorHomeAddress],
  );

  const jobSiteAddressTrimmed = useMemo(
    () => selectedLocation?.address?.trim() ?? "",
    [selectedLocation],
  );

  const mapsDriveEligible = useMemo(
    () =>
      crmDriveOneWayMinutes == null &&
      vendorAddressTrimmed.length > 0 &&
      jobSiteAddressTrimmed.length > 0,
    [crmDriveOneWayMinutes, vendorAddressTrimmed, jobSiteAddressTrimmed],
  );

  useEffect(() => {
    let cancelled = false;
    if (!mapsDriveEligible) {
      setApiDriveLegs(null);
      return () => {
        cancelled = true;
      };
    }
    void apiJson<{
      toJobHours: number;
      fromJobHours: number;
      fallbackUsed: boolean;
    }>("/labor-drive", {
      method: "POST",
      body: JSON.stringify({
        originAddress: vendorAddressTrimmed,
        destinationAddress: jobSiteAddressTrimmed,
      }),
    })
      .then((r) => {
        if (cancelled) return;
        setApiDriveLegs({
          toJobHours: r.toJobHours,
          fromJobHours: r.fromJobHours,
          mapsApiFallbackUsed: r.fallbackUsed,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setApiDriveLegs(null);
      });
    return () => {
      cancelled = true;
    };
  }, [mapsDriveEligible, vendorAddressTrimmed, jobSiteAddressTrimmed]);

  const autoLaborPreview = useMemo(
    () =>
      computeAutoLaborLines({
        plantItems: draftItems
          .filter((it) => it.category === "plant")
          .map((it) => ({
            qty: Number(it.qty) || 0,
            sizeInches:
              typeof it.sizeInches === "number"
                ? it.sizeInches
                : parseSizeInchesFromText(it.name ?? ""),
            name: it.name,
          })),
        potItems: draftItems
          .filter((it) => it.category === "pot")
          .map((it) => ({
            qty: Number(it.qty) || 0,
            sizeInches:
              typeof it.sizeInches === "number"
                ? it.sizeInches
                : parseSizeInchesFromText(it.name ?? ""),
            name: it.name,
          })),
        stagingItems: draftItems
          .filter((it) => it.category === "staging")
          .map((it) => ({
            catalogId: it.catalogId,
            qty: Number(it.qty) || 0,
          })),
        driveMinutesOneWay: driveMinutesResolved,
        driveLegs:
          mapsDriveEligible && apiDriveLegs ? apiDriveLegs : null,
        config: engineConfig,
        laborConfig: laborEngineConfig,
      }),
    [
      draftItems,
      driveMinutesResolved,
      engineConfig,
      laborEngineConfig,
      mapsDriveEligible,
      apiDriveLegs,
    ],
  );

  const requirementPlantLinesForLabor = useMemo(
    () =>
      requirementLines
        .filter((l) => l.plantCatalogId.trim())
        .map((l) => {
          const plant = catalog.find((p) => p.id === l.plantCatalogId.trim());
          const sizeInches =
            plant && typeof plant.sizeInches === "number"
              ? plant.sizeInches
              : plant
                ? parseSizeInchesFromText(plant.name ?? "")
                : null;
          return {
            qty: Math.max(0, Number(l.qty) || 0),
            sizeInches,
            name: plant?.name ?? undefined,
          };
        })
        .filter((row) => row.qty > 0),
    [requirementLines, catalog],
  );

  /**
   * Fallback estimation for the Requirements step when Products are not filled yet.
   */
  const simplifiedLaborPreview = useMemo(() => {
    const totalQty = requirementLines.reduce(
      (s, l) => s + Math.max(1, Number(l.qty) || 1),
      0,
    );
    if (totalQty <= 0) return null;
    const plantLines =
      requirementPlantLinesForLabor.length > 0
        ? requirementPlantLinesForLabor
        : undefined;
    return computeSimplifiedLabor({
      plantCount: plantLines?.length ? 0 : totalQty,
      plantLines,
      driveMinutesOneWay: driveMinutesResolved,
      driveLegs:
        mapsDriveEligible && apiDriveLegs ? apiDriveLegs : null,
      config: engineConfig,
      laborConfig: laborEngineConfig,
    });
  }, [
    requirementLines,
    requirementPlantLinesForLabor,
    driveMinutesResolved,
    engineConfig,
    laborEngineConfig,
    mapsDriveEligible,
    apiDriveLegs,
  ]);

  const hasPlantProductsForLabor = useMemo(
    () =>
      draftItems.some(
        (it) => it.category === "plant" && (Number(it.qty) || 0) > 0,
      ),
    [draftItems],
  );

  const resolvedLaborLinesSource = useMemo(() => {
    if (hasPlantProductsForLabor) return autoLaborPreview.lines;
    if (simplifiedLaborPreview) return simplifiedLaborPreview.lines;
    return autoLaborPreview.lines;
  }, [hasPlantProductsForLabor, autoLaborPreview, simplifiedLaborPreview]);

  const displayLaborPreview = useMemo(() => {
    if (hasPlantProductsForLabor) {
      return {
        source: "products" as const,
        peakPeople: autoLaborPreview.peakPeople,
        clockMinutesPerPerson: autoLaborPreview.clockMinutesPerPerson,
        targetClockMinutesPerPerson:
          autoLaborPreview.targetClockMinutesPerPerson,
        totalInstallMinutes: autoLaborPreview.totalInstallMinutes,
        driveMinutesOneWay: autoLaborPreview.driveMinutesOneWay,
        bands: autoLaborPreview.bands,
        fallbackDiameterCount: autoLaborPreview.fallbackDiameterCount,
        pwuLoadUnload: autoLaborPreview.pwuLoadUnload,
        pwuInstall: autoLaborPreview.pwuInstall,
        peopleAssignmentRuleMatched:
          autoLaborPreview.peopleAssignmentRuleMatched,
        mapsApiFallbackUsed: autoLaborPreview.mapsApiFallbackUsed,
      };
    }
    if (simplifiedLaborPreview) {
      const s = simplifiedLaborPreview;
      return {
        source: "requirements" as const,
        peakPeople: s.peakPeople,
        clockMinutesPerPerson: s.clockMinutesPerPerson,
        targetClockMinutesPerPerson:
          engineConfig.laborAuto.targetClockMinutesPerPerson,
        totalInstallMinutes: s.totalInstallHours * 60,
        driveMinutesOneWay: s.driveMinutesOneWay,
        bands: [],
        fallbackDiameterCount: s.fallbackDiameterCount,
        pwuLoadUnload: s.pwuLoadUnload,
        pwuInstall: s.pwuInstall,
        peopleAssignmentRuleMatched: s.peopleAssignmentRuleMatched,
        mapsApiFallbackUsed: s.mapsApiFallbackUsed,
      };
    }
    return {
      source: "none" as const,
      peakPeople: autoLaborPreview.peakPeople,
      clockMinutesPerPerson: autoLaborPreview.clockMinutesPerPerson,
      targetClockMinutesPerPerson: autoLaborPreview.targetClockMinutesPerPerson,
      totalInstallMinutes: autoLaborPreview.totalInstallMinutes,
      driveMinutesOneWay: autoLaborPreview.driveMinutesOneWay,
      bands: autoLaborPreview.bands,
      fallbackDiameterCount: autoLaborPreview.fallbackDiameterCount,
      pwuLoadUnload: autoLaborPreview.pwuLoadUnload,
      pwuInstall: autoLaborPreview.pwuInstall,
      peopleAssignmentRuleMatched: autoLaborPreview.peopleAssignmentRuleMatched,
      mapsApiFallbackUsed: autoLaborPreview.mapsApiFallbackUsed,
    };
  }, [
    hasPlantProductsForLabor,
    autoLaborPreview,
    simplifiedLaborPreview,
    engineConfig.laborAuto.targetClockMinutesPerPerson,
  ]);

  useEffect(() => {
    if (!laborAutoMode) return;
    setLaborLines((prev) => {
      const next = resolvedLaborLinesSource;
      const changed =
        prev.length !== next.length ||
        prev.some((p, i) => {
          const n = next[i];
          return (
            !n ||
            p.key !== n.key ||
            p.people !== n.people ||
            p.hours !== n.hours
          );
        });
      return changed ? next.map((l) => ({ ...l })) : prev;
    });
  }, [laborAutoMode, resolvedLaborLinesSource]);

  const laborCostRows = useMemo(
    () =>
      laborLines.map((line) => ({
        ...line,
        lineCost: line.people * line.hours * engineConfig.hourlyRate,
      })),
    [laborLines, engineConfig.hourlyRate],
  );
  const laborCostTotal = useMemo(
    () => laborCostRows.reduce((sum, row) => sum + row.lineCost, 0),
    [laborCostRows],
  );

  function updateRotation(
    index: number,
    patch: Partial<
      Pick<
        ProposalRotation,
        "frequencyName" | "frequencyWeeks" | "rotationUnitPrice" | "truckFee"
      >
    >,
  ) {
    setRotations((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  }

  const plantRows = useMemo(
    () =>
      draftItems
        .map((it, i) => ({ it, i }))
        .filter(({ it }) => it.category === "plant"),
    [draftItems],
  );
  const potRows = useMemo(
    () =>
      draftItems
        .map((it, i) => ({ it, i }))
        .filter(({ it }) => it.category === "pot"),
    [draftItems],
  );
  const stagingRows = useMemo(
    () =>
      draftItems
        .map((it, i) => ({ it, i }))
        .filter(({ it }) => it.category === "staging"),
    [draftItems],
  );

  const stagingPicksForStrip = useMemo(() => {
    return stagingRows
      .map(({ it, i }) => {
        const lid = stagingLibraryIdFromCatalogId(it.catalogId);
        const lib = lid ? stagingLibrary.find((x) => x.id === lid) : undefined;
        const imageUrl = it.stagingImageUrl ?? lib?.imageUrl;
        return {
          key: `${it.catalogId}-${i}`,
          draftIndex: i,
          label: it.name,
          imageUrl,
        };
      })
      .filter((x) => Boolean(x.imageUrl));
  }, [stagingRows, stagingLibrary]);

  /** Staging lines ordered by plant section (auto + manual bucket). */
  const stagingRowsOrdered = useMemo(
    () => buildStagingDisplayGroups(draftItems).flatMap((g) => g.rows),
    [draftItems],
  );

  const autoStagingPlantSig = useMemo(
    () => autoStagingPlantSignature(draftItems),
    [draftItems],
  );

  const engineAutoStagingKey = useMemo(
    () =>
      JSON.stringify({
        recipes: engineConfig.stagingRecipes,
        bands: engineConfig.laborAuto.complexityBands,
        env: engineConfig.defaultPlantEnvironment,
        freight: engineConfig.materialFreightPct,
      }),
    [
      engineConfig.stagingRecipes,
      engineConfig.laborAuto.complexityBands,
      engineConfig.defaultPlantEnvironment,
      engineConfig.materialFreightPct,
    ],
  );

  useEffect(() => {
    if (!stagingLibraryReady) return;
    setDraftItems((prev) => {
      const next = mergeAutoStagingIntoDraft(
        prev,
        engineConfig,
        stagingLibrary,
      );
      if (serializeAutoStagingSlice(prev) === serializeAutoStagingSlice(next)) {
        return prev;
      }
      return next;
    });
  }, [
    autoStagingPlantSig,
    engineAutoStagingKey,
    stagingLibraryReady,
    stagingLibrary,
    engineConfig,
  ]);

  const tabRows =
    productTab === "plant"
      ? plantRows
      : productTab === "pot"
        ? potRows
        : stagingRows;

  const productTabRows = useMemo(() => {
    if (productTab === "staging") return stagingRowsOrdered;
    return tabRows;
  }, [productTab, stagingRowsOrdered, tabRows]);

  const rotationsAnnualTotal = useMemo(
    () =>
      rotations.reduce((acc, r) => {
        const { monthly } = computeRotationMonthly(
          {
            qty: r.qty,
            frequencyWeeks: r.frequencyWeeks,
            rotationUnitPrice: r.rotationUnitPrice,
            truckFee: r.truckFee,
          },
          engineConfig,
        );
        return acc + monthly * 12;
      }, 0),
    [rotations, engineConfig],
  );

  const selectedRequirementPlantIds = useMemo(
    () =>
      new Set(
        requirementLines.map((l) => l.plantCatalogId.trim()).filter(Boolean),
      ),
    [requirementLines],
  );

  useEffect(() => {
    const guaranteedKeys = new Set(
      requirementLines
        .filter((l) => l.plantCatalogId && l.guaranteed)
        .map(
          (l) => `${l.plantCatalogId.trim()}::${l.area.trim().toLowerCase()}`,
        ),
    );
    setDraftItems((prev) => {
      let changed = false;
      const next = prev.map((it) => {
        if (it.category !== "plant") return it;
        const key = `${it.catalogId.trim()}::${(it.area ?? "").trim().toLowerCase()}`;
        const guaranteed = guaranteedKeys.has(key);
        if ((it.guaranteed ?? false) === guaranteed) return it;
        changed = true;
        return { ...it, guaranteed };
      });
      return changed ? next : prev;
    });
  }, [requirementLines]);

  const allowedStagingTargets = useMemo(() => {
    const seen = new Set<string>();
    return plantRows
      .map(({ it, i }) => {
        const key = plantKeyForStaging(it, i);
        if (seen.has(key)) return null;
        seen.add(key);
        return {
          key,
          name: it.name,
          area: it.area?.trim() || "",
          qty: Math.max(1, it.qty || 1),
          source: selectedRequirementPlantIds.has(it.catalogId)
            ? "requirements"
            : "manual",
        } as const;
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
  }, [plantRows, selectedRequirementPlantIds]);

  const stagingPickOptions = useMemo(() => {
    if (!stagingPickPlantKey) return [];
    return stagingPresetsAvailableForPlant(
      draftItems,
      stagingLibrary,
      stagingPickPlantKey,
    );
  }, [stagingPickPlantKey, draftItems, stagingLibrary]);

  const photoTargets = useMemo(
    () =>
      plantRows
        .filter(
          ({ it }) =>
            selectedRequirementPlantIds.size === 0 ||
            selectedRequirementPlantIds.has(it.catalogId),
        )
        .map(({ it, i }) => ({
          key: it.id ?? `draft-${i}`,
          globalIndex: i,
          name: it.name,
          qty: it.qty,
        })),
    [plantRows, selectedRequirementPlantIds],
  );

  const photoTargetsWithSuggested = useMemo(
    () =>
      photoTargets.map((row) => {
        const catalogPickerRows = catalogEntriesForPhotoPicker(
          row.name || "plant",
          "",
          plantReferenceCatalog.plants,
        );
        const suggested = catalogPickerRows[0] ?? null;
        const urls =
          draftItems[row.globalIndex]?.category === "plant"
            ? (draftItems[row.globalIndex].photos ?? [])
            : [];
        return { row, urls, suggested };
      }),
    [photoTargets, draftItems],
  );

  const visiblePhotoTargets = useMemo(
    () =>
      photoTargetsWithSuggested.filter(
        ({ urls, suggested }) =>
          urls.length > 0 || Boolean(suggested?.imagePublicPath),
      ),
    [photoTargetsWithSuggested],
  );

  const missingImagePhotoTargets = useMemo(
    () =>
      photoTargetsWithSuggested.filter(
        ({ urls, suggested }) =>
          urls.length === 0 && !suggested?.imagePublicPath,
      ),
    [photoTargetsWithSuggested],
  );

  useEffect(() => {
    const allowed = new Set(visiblePhotoTargets.map(({ row }) => row.key));
    setHiddenSuggestedKeys((prev) => {
      const next: Record<string, true> = {};
      for (const key of Object.keys(prev)) {
        if (allowed.has(key)) next[key] = true;
      }
      return next;
    });
  }, [visiblePhotoTargets]);

  const totalPhotos = useMemo(
    () =>
      draftItems.reduce(
        (n, row) =>
          n + (row.category === "plant" ? (row.photos?.length ?? 0) : 0),
        0,
      ),
    [draftItems],
  );

  const summaryPhotoCount = useMemo(() => {
    if (!summary) return totalPhotos;
    return summary.items.reduce(
      (n, it) => n + (it.category === "plant" ? (it.photos?.length ?? 0) : 0),
      0,
    );
  }, [summary, totalPhotos]);

  const requirementsStepOk = useMemo(
    () => requirementLines.some((l) => Boolean(l.plantCatalogId)),
    [requirementLines],
  );

  const totalPlantUnitsFromRequirements = useMemo(
    () =>
      requirementLines
        .filter((l) => l.plantCatalogId)
        .reduce((s, l) => s + l.qty, 0),
    [requirementLines],
  );

  const totalPlantUnitsForTruckFee = useMemo(() => {
    const fromProducts = draftItems
      .filter((it) => it.category === "plant")
      .reduce((sum, it) => sum + Math.max(0, Number(it.qty) || 0), 0);
    return fromProducts > 0 ? fromProducts : totalPlantUnitsFromRequirements;
  }, [draftItems, totalPlantUnitsFromRequirements]);

  const computedTruckFee = useMemo(
    () => truckFeeForPlantCount(totalPlantUnitsForTruckFee, engineConfig),
    [totalPlantUnitsForTruckFee, engineConfig],
  );

  useEffect(() => {
    setRotations((prev) =>
      prev.map((r) =>
        r.truckFee === computedTruckFee
          ? r
          : { ...r, truckFee: computedTruckFee },
      ),
    );
  }, [computedTruckFee]);

  useEffect(() => {
    if (!clientKind) return;
    setSaleType((st) => {
      if (clientKind === "old" && st === "new_installation") {
        return "new_sale";
      }
      if (clientKind === "new" && st === "new_sale") {
        return "new_installation";
      }
      return st;
    });
  }, [clientKind]);

  useEffect(() => {
    if (!clientPickerOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = clientSelectRef.current;
      if (el && !el.contains(e.target as Node)) setClientPickerOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [clientPickerOpen]);

  useEffect(() => {
    if (step !== 2) return;
    if (autoSourceDoneRef.current) return;
    if (draftItems.length > 0) return;
    const can = requirementLines.some((l) => l.plantCatalogId);
    if (!can) return;
    autoSourceDoneRef.current = true;
    autoSourceAllFromRequirements();
    // Run once when entering Products; avoid re-running when requirements or draft change.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [step]);

  const saleCards: {
    value: SaleType;
    title: string;
    subtitle: string;
  }[] = [
    {
      value: "new_installation",
      title: "New Installation",
      subtitle: "QB: 702",
    },
    { value: "new_sale", title: "Additional Sale", subtitle: "QB: 702" },
    { value: "replacement", title: "Replacement", subtitle: "QB: 701" },
  ];

  const visibleSaleCards =
    clientKind === "old"
      ? saleCards.filter((c) => c.value !== "new_installation")
      : clientKind === "new"
        ? saleCards.filter((c) => c.value !== "new_sale")
        : saleCards;

  const nextDisabled =
    busy ||
    isProposalLocked ||
    (step === 0 && !requirementsStepOk) ||
    (step === 1 && (!clientId || !locationId || !clientKind)) ||
    (step === 5 && !summary) ||
    (step === 2 && draftItems.length === 0);

  return (
    <div
      className={`flex flex-col overflow-hidden bg-[#f6f7f6] text-gray-900 dark:bg-gray-950 dark:text-gray-100 ${
        embedded ? "h-full min-h-0" : "h-screen"
      }`}
    >
      {/* Top bar */}
      <header className="no-print shrink-0 border-b border-gray-200/80 bg-white dark:border-gray-800 dark:bg-gray-900">
        {embedded ? null : (
          <div className="mx-auto flex max-w-5xl items-center justify-end px-4 py-3 md:px-6">
            <button
              type="button"
              onClick={() => setDark((d) => !d)}
              className="rounded-full border border-gray-200 p-2 text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              aria-label="Toggle dark mode"
            >
              {dark ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
          </div>
        )}

        {/* Stepper */}
        <div
          className={`bg-white px-2 py-3 dark:bg-gray-900 md:px-4 ${
            embedded ? "" : "border-t border-gray-100 dark:border-gray-800"
          }`}
        >
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-1 md:gap-0">
            {STEPS.map(({ key, label, Icon }, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <div key={key} className="flex items-center">
                  <button
                    type="button"
                    disabled={isProposalLocked ? i !== step : i > step}
                    onClick={() => !isProposalLocked && i <= step && setStep(i)}
                    className={`flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition md:text-sm ${
                      active
                        ? `${PRIMARY_CLASS} text-white shadow-sm`
                        : done
                          ? `${MINT_DONE}`
                          : "text-gray-400 dark:text-gray-500"
                    }`}
                  >
                    {done ? (
                      <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                    ) : (
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                    )}
                    <span className="whitespace-nowrap">{label}</span>
                  </button>
                  {i < STEPS.length - 1 ? (
                    <ChevronRight className="mx-0.5 hidden h-4 w-4 shrink-0 text-gray-300 sm:block md:mx-1" />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </header>

      <main className="no-scrollbar mx-auto min-h-0 w-full max-w-5xl flex-1 overflow-y-auto px-4 py-8 pb-28 print:px-0 print:py-0 md:px-6">
        {error ? (
          <div
            className="no-print mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            role="alert"
          >
            {error}
          </div>
        ) : null}
        {isProposalLocked ? (
          <div className="no-print mb-6 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200">
            This proposal is accepted, so it is in view-only mode.
          </div>
        ) : null}

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm print:border-0 print:bg-transparent print:p-0 print:shadow-none dark:border-gray-800 dark:bg-gray-900 md:p-8">
          {/* —— Step 0 Requirements —— */}
          {step === 0 ? (
            <div className="space-y-6">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
                  <ClipboardCheck
                    className="h-6 w-6"
                    style={{ color: PRIMARY }}
                    strokeWidth={1.75}
                  />
                  Client requirements
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  One row per plant line / area. Feeds auto-sourcing on
                  Products. Import CSV (Excel → Save as CSV) using the template
                  columns.
                </p>
                {clientKind === "new" ? (
                  <p className="mt-2 inline-flex rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200">
                    New requirement active: current rows are preserved and not
                    replaced.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href="/templates/client-requirements-template.csv"
                  download
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm ${PRIMARY_CLASS}`}
                >
                  <FileText className="h-4 w-4" />
                  Download CSV template
                </a>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200">
                  <UploadCloud className="h-4 w-4" />
                  Import CSV
                  <input
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    className="sr-only"
                    onChange={onImportRequirementsFile}
                  />
                </label>
              </div>
              <div className="space-y-4">
                {requirementLines.map((line) => (
                  <div
                    key={line.id}
                    className="rounded-xl border border-gray-200 bg-white/90 p-3 shadow-sm dark:border-gray-700 dark:bg-gray-950/80"
                  >
                    <div className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-14 md:items-end">
                        <div className="md:col-span-4">
                          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">
                            Plant
                          </label>
                          <PlantPicker
                            plants={catalog}
                            value={line.plantCatalogId}
                            onChange={(id) =>
                              updateRequirementLine(line.id, {
                                plantCatalogId: id,
                              })
                            }
                            placeholder="Search plant by name…"
                          />
                        </div>
                        <div className="md:col-span-4">
                          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">
                            Pot type
                          </label>
                          {requirementNeedsPotSelection(line) ? (
                            <PotPicker
                              pots={potCatalog}
                              value={line.potType}
                              plantSizeInches={
                                catalog.find(
                                  (p) => p.id === line.plantCatalogId,
                                )?.sizeInches ?? null
                              }
                              placeholder="Search pot by name/family…"
                              onChange={(potName) =>
                                updateRequirementLine(line.id, {
                                  potType: potName,
                                })
                              }
                            />
                          ) : (
                            <input
                              className="w-full rounded-lg border border-gray-200 bg-gray-100 px-2 py-2 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
                              value="Blocked by selected pot mode"
                              readOnly
                            />
                          )}
                        </div>
                        <div className="md:col-span-2">
                          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">
                            Location / area
                          </label>
                          <input
                            className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                            placeholder="e.g. Lobby"
                            value={line.area}
                            onChange={(e) =>
                              updateRequirementLine(line.id, {
                                area: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="md:col-span-1">
                          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">
                            Qty
                          </label>
                          <input
                            type="number"
                            min={1}
                            className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                            value={line.qty}
                            onChange={(e) =>
                              updateRequirementLine(line.id, {
                                qty: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">
                            Environment <span className="text-red-500">*</span>
                          </label>
                          <select
                            className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                            value={line.environment}
                            onChange={(e) =>
                              updateRequirementLine(line.id, {
                                environment:
                                  e.target.value === "outdoor"
                                    ? "outdoor"
                                    : "indoor",
                              })
                            }
                          >
                            <option value="indoor">Indoor</option>
                            <option value="outdoor">Outdoor</option>
                          </select>
                        </div>
                        <div className="md:col-span-2">
                          <p className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">
                            Guaranteed
                          </p>
                          <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-200">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300"
                              checked={line.guaranteed}
                              onChange={(e) =>
                                updateRequirementLine(line.id, {
                                  guaranteed: e.target.checked,
                                })
                              }
                            />
                            Guaranteed plant
                          </label>
                        </div>
                        <div className="flex justify-end md:col-span-1">
                          <button
                            type="button"
                            onClick={() => removeRequirementLine(line.id)}
                            className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                            aria-label="Remove line"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-12 md:items-end">
                        <div className="md:col-span-8">
                          <p className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">
                            Pot mode <span className="text-red-500">*</span>
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-200">
                              <input
                                type="checkbox"
                                className="rounded border-gray-300"
                                checked={line.clientHasPot}
                                onChange={(e) =>
                                  updateRequirementLine(line.id, {
                                    clientHasPot: e.target.checked,
                                    plantingWithoutPot: e.target.checked
                                      ? false
                                      : line.plantingWithoutPot,
                                    potType: e.target.checked
                                      ? ""
                                      : line.potType,
                                  })
                                }
                              />
                              Client already has this pot
                            </label>
                            <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-200">
                              <input
                                type="checkbox"
                                className="rounded border-gray-300"
                                checked={line.plantingWithoutPot}
                                onChange={(e) =>
                                  updateRequirementLine(line.id, {
                                    clientHasPot: e.target.checked
                                      ? false
                                      : line.clientHasPot,
                                    plantingWithoutPot: e.target.checked,
                                    potType: e.target.checked
                                      ? ""
                                      : line.potType,
                                  })
                                }
                              />
                              Planting without pot
                            </label>
                          </div>
                        </div>
                        <div className="md:col-span-4">
                          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">
                            Notes
                          </label>
                          <input
                            className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                            value={line.notes}
                            onChange={(e) =>
                              updateRequirementLine(line.id, {
                                notes: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addRequirementLine}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-100/80 py-3 text-sm font-semibold text-gray-700 transition hover:border-[#2b7041]/40 hover:bg-emerald-50/50 dark:border-gray-600 dark:bg-gray-800/60 dark:text-gray-200"
              >
                <Plus className="h-4 w-4" />
                Add Item
              </button>
            </div>
          ) : step === 1 ? (
            <div className="space-y-6">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
                  <Building2
                    className="h-6 w-6"
                    style={{ color: PRIMARY }}
                    strokeWidth={1.75}
                  />
                  General Information
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Client, location, sale type, and labor.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-xl border border-emerald-200/90 bg-emerald-50/50 px-4 py-3 dark:border-emerald-900/60 dark:bg-emerald-950/25 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    Proposal pricing &amp; calculation defaults
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-gray-600 dark:text-gray-400">
                    Opens in this same view with sections grouped by topic. Use{" "}
                    <strong>Save and return to General</strong> when done, or{" "}
                    <strong>Back to General</strong> to leave without saving.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void openPricingSettings()}
                  disabled={busy}
                  className={`inline-flex shrink-0 items-center justify-center rounded-lg px-3 py-2 text-center text-xs font-semibold text-white shadow-sm sm:text-sm ${PRIMARY_CLASS}`}
                >
                  Open pricing settings
                </button>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Client <span className="text-red-500">*</span>
                  </label>
                  <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                    Open the list to see each account:{" "}
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      New client
                    </span>{" "}
                    (green) vs{" "}
                    <span className="font-semibold text-gray-600 dark:text-gray-400">
                      Existing
                    </span>
                    . Sale-type rules follow automatically.
                  </p>
                  <div ref={clientSelectRef} className="relative">
                    <button
                      type="button"
                      aria-expanded={clientPickerOpen}
                      aria-haspopup="listbox"
                      onClick={() => setClientPickerOpen((o) => !o)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left text-sm outline-none ring-[#2b7041]/30 focus:ring-2 dark:border-gray-700 dark:bg-gray-950"
                    >
                      <span className="min-w-0 truncate font-medium text-gray-900 dark:text-white">
                        {selectedClient?.companyName ?? "Select client…"}
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
                    </button>
                    {clientPickerOpen ? (
                      <ul
                        className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
                        role="listbox"
                      >
                        {clients.map((c) => {
                          const isNewClient = !c.isExistingCustomer;
                          return (
                            <li key={c.id} role="none">
                              <button
                                type="button"
                                role="option"
                                aria-selected={c.id === clientId}
                                onClick={() => {
                                  setClientId(c.id);
                                  setClientPickerOpen(false);
                                }}
                                className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-emerald-50/80 dark:hover:bg-emerald-950/30 ${
                                  c.id === clientId
                                    ? "bg-emerald-50/90 dark:bg-emerald-950/40"
                                    : ""
                                }`}
                              >
                                <span className="min-w-0 truncate font-medium text-gray-900 dark:text-white">
                                  {c.companyName}
                                </span>
                                {isNewClient ? (
                                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200">
                                    New client
                                  </span>
                                ) : (
                                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                    Existing
                                  </span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <MapPin className="h-3.5 w-3.5 text-gray-400" />
                    Job Location
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#2b7041]/30 dark:border-gray-700 dark:bg-gray-950"
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                  >
                    <option value="">Select location…</option>
                    {(selectedClient?.locations ?? []).map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Contact Name
                  </label>
                  <input
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950"
                    placeholder="e.g. Travis Leon"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Submitted By
                  </label>
                  <input
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950"
                    value={submittedBy}
                    onChange={(e) => setSubmittedBy(e.target.value)}
                  />
                </div>
              </div>

              {clientId && clientKind ? (
                <div className="rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                  {clientKind === "old"
                    ? "Existing customer (QuickBooks / history): only Additional sale and Replacement apply."
                    : "New client: only New Installation and Replacement apply."}
                </div>
              ) : null}

              {clientKind === "old" ? (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 text-sm dark:border-indigo-900/50 dark:bg-indigo-950/30">
                  <p className="font-semibold text-indigo-900 dark:text-indigo-200">
                    Purchase history
                  </p>
                  {selectedClient?.isExistingCustomer ? (
                    <ul className="mt-2 space-y-1 text-xs text-indigo-900/90 dark:text-indigo-200/90">
                      <li>Client marked as existing (QuickBooks / history).</li>
                      <li>
                        Registered locations:{" "}
                        <strong>{selectedClient.locations.length}</strong>.
                      </li>
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-indigo-900/90 dark:text-indigo-200/90">
                      No purchase history available for this client.
                    </p>
                  )}
                </div>
              ) : null}

              <div>
                <p className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                  Sale type
                </p>
                <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                  Select after the client. New Installation uses markup ×3;
                  Additional sale &amp; Replacement use ×2.5 when matching sale
                  type (see below).
                </p>
                <div className="grid gap-3 md:grid-cols-3">
                  {visibleSaleCards.map((card) => {
                    const selected = saleType === card.value;
                    return (
                      <button
                        key={card.value}
                        type="button"
                        onClick={() => setSaleType(card.value)}
                        className={`relative flex flex-col items-start rounded-xl border-2 p-4 text-left transition hover:border-[#2b7041]/40 ${
                          selected
                            ? "border-[#2b7041] bg-emerald-50/50 shadow-sm dark:bg-emerald-950/20"
                            : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950"
                        }`}
                      >
                        <span className="flex w-full items-start justify-between gap-2">
                          <span className="font-semibold text-gray-900 dark:text-white">
                            {card.title}
                          </span>
                          {selected ? (
                            <span
                              className="flex h-6 w-6 items-center justify-center rounded-full text-white"
                              style={{ backgroundColor: PRIMARY }}
                            >
                              <Check className="h-3.5 w-3.5" strokeWidth={3} />
                            </span>
                          ) : (
                            <Circle className="h-5 w-5 text-gray-300" />
                          )}
                        </span>
                        <span className="mt-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                          {card.subtitle}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-gray-950/40">
                <p className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                  Default markup for catalog lines
                </p>
                <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                  Default: <strong>Open pricing</strong> (uses admin default
                  markup). Optional: match multipliers to sale type (New
                  Installation ×3; Additional / Replacement ×2.5).
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setMarkupMode("open")}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                      markupMode === "open"
                        ? `${PRIMARY_CLASS} text-white`
                        : "border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
                    }`}
                  >
                    Open pricing
                  </button>
                  <button
                    type="button"
                    onClick={() => setMarkupMode("sale_type")}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                      markupMode === "sale_type"
                        ? `${PRIMARY_CLASS} text-white`
                        : "border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
                    }`}
                  >
                    Match sale type (×3 / ×2.5)
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-950/50">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                      Labor, delivery &amp; install costs (auto-calculated)
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Origin: <strong>{engineConfig.vendorHomeAddress}</strong>
                      {" → "}client site. Plant count from requirements:{" "}
                      <strong>{totalPlantUnitsFromRequirements}</strong> units.
                    </p>
                  </div>
                  <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
                    PWU labor engine. Crew rules and install minutes are edited
                    under Admin → Delivery &amp; install labor.
                  </span>
                </div>
                <div className="mb-3 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <div>
                    Crew:{" "}
                    <strong>{displayLaborPreview.peakPeople} person(s)</strong>
                    {" · Handling (load+unload+install+clean) "}
                    <strong>
                      {displayLaborPreview.clockMinutesPerPerson.toFixed(0)} min
                    </strong>
                    {" total wall time (sequential sum)"}
                    {" · Install workload "}
                    <strong>
                      {displayLaborPreview.totalInstallMinutes.toFixed(0)} min
                    </strong>
                    {" (1-person minutes)"}
                    {" · Avg drive "}
                    <strong>
                      {displayLaborPreview.driveMinutesOneWay.toFixed(0)} min
                    </strong>
                    {" one-way"}
                    {driveDistanceResolved != null ? (
                      <>
                        {" · Distance "}
                        <strong>{driveDistanceResolved.toFixed(1)} km</strong>
                      </>
                    ) : null}
                  </div>
                  <div className="mt-2 border-t border-emerald-200/80 pt-2 text-[11px] text-emerald-800 dark:border-emerald-800 dark:text-emerald-200">
                    PWU load/unload{" "}
                    <strong>{displayLaborPreview.pwuLoadUnload.toFixed(1)}</strong>
                    {" · PWU install "}
                    <strong>{displayLaborPreview.pwuInstall.toFixed(1)}</strong>
                    {" · Staffing: "}
                    <strong>
                      {laborPeopleRuleShortLabel(
                        displayLaborPreview.peopleAssignmentRuleMatched,
                      )}
                    </strong>
                  </div>
                  {displayLaborPreview.source === "requirements" ? (
                    <p className="mt-2 border-t border-emerald-200/80 pt-2 text-[11px] text-emerald-800 dark:border-emerald-800 dark:text-emerald-200">
                      Requirements preview uses catalog pot sizes when a plant
                      is selected; otherwise the configured fallback pot size (
                      {laborEngineConfig.simplifiedFallbackPlantSize}) for labor
                      PWU until product lines are filled.
                    </p>
                  ) : null}
                </div>
                {displayLaborPreview.mapsApiFallbackUsed ? (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
                    Drive times used the configured Maps fallback (both legs)
                    because Google Directions was unavailable or returned no
                    route.
                  </div>
                ) : null}
                {displayLaborPreview.fallbackDiameterCount > 0 ? (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
                    {displayLaborPreview.fallbackDiameterCount} plant unit(s)
                    use fallback pot size{" "}
                    <strong>{laborEngineConfig.simplifiedFallbackPlantSize}</strong>{" "}
                    because diameter was not available.
                  </div>
                ) : null}
                {displayLaborPreview.source === "requirements" &&
                simplifiedLaborPreview ? (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
                    <strong>
                      {simplifiedLaborPreview.totalInstallHours.toFixed(2)} h
                    </strong>
                    {" total install wall time (requirements estimate)."}
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  {laborCostRows.map((line) => (
                    <div
                      key={line.key}
                      className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 dark:border-gray-800 dark:bg-gray-900/40"
                    >
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {LABOR_LABELS[line.key]}
                      </span>
                      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>
                          {line.people} people × {line.hours.toFixed(2)} h
                        </span>
                        <span className="text-sm font-bold text-gray-900 dark:text-white">
                          {money.format(line.lineCost)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex justify-end">
                  <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
                    Labor total: {money.format(laborCostTotal)}
                  </span>
                </div>
                <div className="mt-4 space-y-3 border-t border-gray-100 pt-4 dark:border-gray-800">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-[#2b7041] focus:ring-[#2b7041]"
                      checked={commissionDetailsEnabled}
                      onChange={(e) =>
                        setCommissionDetailsEnabled(e.target.checked)
                      }
                    />
                    Enable commission
                  </label>
                  {commissionDetailsEnabled ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                            Commission % (0-100)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                            value={Number((commissionPct * 100).toFixed(2))}
                            onChange={(e) =>
                              setCommissionPct(
                                Math.max(0, Number(e.target.value) || 0) / 100,
                              )
                            }
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                            # Beneficiaries
                          </label>
                          <input
                            type="number"
                            min={0}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                            value={commissionBeneficiaries}
                            onChange={(e) =>
                              onCommissionBeneficiariesCountInput(
                                Number(e.target.value) || 0,
                              )
                            }
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                            Commission beneficiaries
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setCommissionBeneficiaryModalOpen(true)
                            }
                            title="Add a new beneficiary to the catalog"
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#2b7041] bg-emerald-50 px-3 py-2 text-sm font-semibold text-[#2b7041] shadow-sm hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/50"
                          >
                            <Plus className="h-4 w-4" aria-hidden />
                            <span className="hidden sm:inline">New</span>
                          </button>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          One catalog entry per slot (up to the # of
                          beneficiaries). Each dropdown hides people already
                          picked in another slot.
                        </p>
                        <div className="space-y-3">
                          {commissionBeneficiarySlots.map((slotId, slotIdx) => {
                            const options = commissionBeneficiaryCatalog.filter(
                              (b) =>
                                b.id === slotId.trim() ||
                                !commissionBeneficiarySlots.some(
                                  (s, j) => j !== slotIdx && s.trim() === b.id,
                                ),
                            );
                            const row = slotId.trim()
                              ? commissionBeneficiaryCatalog.find(
                                  (b) => b.id === slotId.trim(),
                                )
                              : undefined;
                            return (
                              <div
                                key={`commission-slot-${slotIdx}`}
                                className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-950/50"
                              >
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                                    Beneficiary {slotIdx + 1}
                                  </span>
                                  {slotId.trim() ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        clearCommissionSlot(slotIdx)
                                      }
                                      className="text-[11px] font-semibold text-red-600 hover:underline dark:text-red-400"
                                    >
                                      Remove
                                    </button>
                                  ) : null}
                                </div>
                                <select
                                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                                  value={slotId.trim()}
                                  onChange={(e) =>
                                    setCommissionSlot(slotIdx, e.target.value)
                                  }
                                >
                                  <option value="">Select beneficiary…</option>
                                  {options.map((b) => (
                                    <option key={b.id} value={b.id}>
                                      {b.name}
                                    </option>
                                  ))}
                                </select>
                                {row ? (
                                  <div className="mt-2 space-y-0.5 text-xs text-gray-600 dark:text-gray-400">
                                    <p>
                                      <span className="font-semibold">
                                        Phone:
                                      </span>{" "}
                                      {row.phone?.trim() || "—"}
                                    </p>
                                    <p>
                                      <span className="font-semibold">
                                        Email:
                                      </span>{" "}
                                      {row.email || "—"}
                                    </p>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          <button
                            type="button"
                            className="font-semibold text-[#2b7041] underline dark:text-emerald-400"
                            onClick={() =>
                              void apiGet<CommissionBeneficiary[]>(
                                "/commission-beneficiaries",
                              )
                                .then(setCommissionBeneficiaryCatalog)
                                .catch((e: unknown) =>
                                  setError(toErrorMessage(e)),
                                )
                            }
                          >
                            Refresh list
                          </button>
                          {" · "}
                          <Link
                            href="/admin/commission-beneficiaries"
                            className="font-semibold text-[#2b7041] underline dark:text-emerald-400"
                          >
                            Manage catalog (delete)
                          </Link>
                        </p>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Commission is off; nothing is added for commission in
                      totals.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-950/40">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  Internal purchasing workflow
                </p>
                <p className="mt-1 text-xs leading-snug text-gray-500 dark:text-gray-400">
                  The generated proposal is client-facing. After the client
                  approves it, operations can generate two internal purchase
                  orders: one for plants and a second one for pots and staging
                  materials.
                </p>
              </div>
            </div>
          ) : null}

          {/* —— Step 1 Products —— */}
          {step === 2 ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <div>
                  <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
                    <Leaf
                      className="h-6 w-6"
                      style={{ color: PRIMARY }}
                      strokeWidth={1.75}
                    />
                    Product Configuration
                  </h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Lines are built from Requirements (auto-source). Staging /
                    material cost standardization vs pot size is still being
                    defined with operations.
                  </p>
                </div>
                <div className="flex min-w-0 flex-nowrap justify-end gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {productTab === "plant" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setGrowerResupplyDraftIndex(null);
                          setGrowerCatalogSearch("");
                          setGrowerCatalogModalOpen(true);
                        }}
                        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900"
                      >
                        <Store className="h-4 w-4" />
                        Growers
                      </button>
                      <button
                        type="button"
                        onClick={() => autoSourceAllFromRequirements()}
                        disabled={
                          !requirementLines.some((l) => l.plantCatalogId) ||
                          busy
                        }
                        title="Rebuild plant lines from Requirements (best vendor per line)"
                        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm font-semibold text-emerald-900 shadow-sm hover:bg-emerald-100/90 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/70"
                      >
                        <Sparkles className="h-4 w-4" />
                        Sync from requirements
                      </button>
                    </>
                  ) : productTab === "pot" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setPotResupplyDraftIndex(null);
                          setPotCatalogSearch("");
                          setPotCatalogModalOpen(true);
                        }}
                        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900"
                      >
                        <Store className="h-4 w-4" />
                        Suppliers
                      </button>
                      <button
                        type="button"
                        onClick={() => autoSourceAllFromRequirements()}
                        disabled={
                          !requirementLines.some((l) => l.plantCatalogId) ||
                          busy
                        }
                        title="Rebuild plant lines from Requirements"
                        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm font-semibold text-emerald-900 shadow-sm hover:bg-emerald-100/90 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/70"
                      >
                        <Sparkles className="h-4 w-4" />
                        Sync from requirements
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => refreshAutoStagingNow()}
                        title="Staging already recalculates when plants change; this button forces a refresh and opens the tab."
                        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                      >
                        <Sparkles className="h-4 w-4" />
                        Refresh staging
                      </button>
                      <button
                        type="button"
                        onClick={() => setStagingCatalogModalOpen(true)}
                        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2 text-sm font-semibold text-violet-900 shadow-sm hover:bg-violet-100/90 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-100 dark:hover:bg-violet-950/70"
                      >
                        <Layers className="h-4 w-4" />
                        Browse catalog
                      </button>
                      <button
                        type="button"
                        onClick={() => setStagingLibraryModalOpen(true)}
                        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2 text-sm font-semibold text-violet-900 shadow-sm hover:bg-violet-100/90 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-100 dark:hover:bg-violet-950/70"
                      >
                        <Layers className="h-4 w-4" />
                        Staging library
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="border-b border-gray-200 dark:border-gray-700">
                <div className="flex gap-6">
                  {(
                    [
                      {
                        id: "plant" as const,
                        label: "Plants (20% Freight)",
                        count: plantRows.length,
                      },
                      {
                        id: "pot" as const,
                        label: "Pots (25%)",
                        count: potRows.length,
                      },
                      {
                        id: "staging" as const,
                        label: "Staging (25%)",
                        count: stagingRows.length,
                      },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setProductTab(tab.id)}
                      className={`relative pb-3 text-sm font-semibold transition ${
                        productTab === tab.id
                          ? "text-[#2b7041] dark:text-emerald-400"
                          : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        {tab.id === "plant" ? (
                          <Leaf
                            className="h-4 w-4 shrink-0"
                            strokeWidth={2}
                            aria-hidden
                          />
                        ) : tab.id === "pot" ? (
                          <Package
                            className="h-4 w-4 shrink-0"
                            strokeWidth={2}
                            aria-hidden
                          />
                        ) : (
                          <Layers
                            className="h-4 w-4 shrink-0"
                            strokeWidth={2}
                            aria-hidden
                          />
                        )}
                        {tab.label}
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                          {tab.count}
                        </span>
                      </span>
                      {productTab === tab.id ? (
                        <span
                          className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                          style={{ backgroundColor: PRIMARY }}
                        />
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>

              {productTab === "staging" && stagingLibraryReady ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/50 px-3 py-2 text-xs text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
                    <strong>Staging per plant (automatic):</strong> it
                    recalculates when you add or change plants, quantities,
                    inches, or Indoor/Outdoor. Use <strong>Add staging</strong>{" "}
                    on each plant to attach catalog materials (only items not
                    already on that plant).
                    <strong> Browse catalog</strong> shows the full library for
                    reference only.
                  </div>
                  {stagingPicksForStrip.length > 0 ? (
                    <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/25">
                      <p className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
                        In this proposal
                      </p>
                      <p className="mb-3 text-xs text-gray-600 dark:text-gray-400">
                        Selected items leave the catalog below. Click a
                        thumbnail to enlarge; use the line editor to remove
                        (returns item to catalog).
                      </p>
                      <div className="flex flex-wrap gap-3">
                        {stagingPicksForStrip.map((pick) => (
                          <div
                            key={pick.key}
                            className="relative w-20 shrink-0"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setStagingImagePreview(pick.imageUrl!)
                              }
                              className="relative block h-20 w-full overflow-hidden rounded-lg border-2 border-white shadow-md ring-1 ring-gray-200 transition hover:ring-[#2b7041]/50 dark:border-gray-800 dark:ring-gray-700"
                              title={pick.label}
                            >
                              <Image
                                src={pick.imageUrl!}
                                alt=""
                                fill
                                className="object-contain p-1"
                                sizes="80px"
                                unoptimized
                              />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-dashed border-violet-300/80 bg-violet-50/30 p-4 text-xs text-violet-900 dark:border-violet-800/60 dark:bg-violet-950/20 dark:text-violet-200">
                    Use <strong>Add staging</strong> under each plant block to
                    pick materials. <strong>Browse catalog</strong> opens a
                    read-only view of every staging item.
                  </div>
                </div>
              ) : null}

              {productTabRows.length === 0 ? (
                <p className="py-12 text-center text-sm text-gray-500">
                  No items in this category.
                </p>
              ) : (
                <div className="space-y-4">
                  {productTabRows.map(({ it, i }, rowIdx) => {
                    const potClientOwned =
                      it.category === "pot" && (it.clientOwnsPot ?? false);
                    const stagingLibId =
                      it.category === "staging"
                        ? stagingLibraryIdFromCatalogId(it.catalogId)
                        : null;
                    const stagingLibRow = stagingLibId
                      ? stagingLibrary.find((x) => x.id === stagingLibId)
                      : undefined;
                    const stagingThumb =
                      it.category === "staging"
                        ? (it.stagingImageUrl ?? stagingLibRow?.imageUrl)
                        : undefined;
                    const showStagingPlantHeader =
                      productTab === "staging" &&
                      (rowIdx === 0 ||
                        stagingGroupKeyFromLine(it) !==
                          stagingGroupKeyFromLine(
                            productTabRows[rowIdx - 1]!.it,
                          ));
                    const stagingBanner = showStagingPlantHeader
                      ? stagingSectionBanner(
                          stagingGroupKeyFromLine(it),
                          draftItems,
                        )
                      : null;
                    return (
                      <Fragment key={`${it.catalogId}-${i}`}>
                        {showStagingPlantHeader && stagingBanner ? (
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-200/70 pb-2 pt-1 dark:border-emerald-900/40">
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-emerald-200/80 bg-white dark:border-emerald-900/50 dark:bg-gray-900">
                                {stagingBanner.photo ? (
                                  stagingBanner.photo.startsWith("data:") ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={stagingBanner.photo}
                                      alt=""
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <Image
                                      src={stagingBanner.photo}
                                      alt=""
                                      fill
                                      className="object-cover"
                                      sizes="44px"
                                      unoptimized
                                    />
                                  )
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-emerald-700/50 dark:text-emerald-400/40">
                                    <Leaf className="h-5 w-5" aria-hidden />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                                  Staging for plant
                                </p>
                                <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                                  {stagingBanner.title}
                                </p>
                              </div>
                            </div>
                            {stagingGroupKeyFromLine(it) !== "__manual__" ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setStagingPickPlantKey(
                                    stagingGroupKeyFromLine(it),
                                  )
                                }
                                className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900 shadow-sm hover:bg-violet-100/90 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-100 dark:hover:bg-violet-950/70"
                              >
                                <Plus className="h-4 w-4 shrink-0" />
                                Add staging
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="relative rounded-xl border border-gray-200 bg-gray-50/30 p-4 dark:border-gray-700 dark:bg-gray-950/40">
                          <div
                            className={`mb-3 flex items-start gap-3 ${it.category === "staging" ? "justify-between" : "justify-end"}`}
                          >
                            {it.category === "staging" ? (
                              <div className="flex min-w-0 flex-1 items-start gap-3">
                                {stagingThumb ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setStagingImagePreview(stagingThumb)
                                    }
                                    className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm ring-1 ring-gray-200/80 transition hover:ring-[#2b7041]/40 dark:border-gray-700 dark:bg-gray-900 dark:ring-gray-700"
                                    title="Ampliar imagen"
                                  >
                                    <Image
                                      src={stagingThumb}
                                      alt=""
                                      fill
                                      className="object-contain p-1"
                                      sizes="64px"
                                      unoptimized
                                    />
                                  </button>
                                ) : (
                                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-100 text-gray-400 dark:border-gray-700 dark:bg-gray-900">
                                    <Layers className="h-6 w-6" aria-hidden />
                                  </div>
                                )}
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-200/80 px-2.5 py-0.5 text-[11px] font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                                    {it.vendorName}
                                  </span>
                                  {it.catalogId.startsWith("staging-auto-") ? (
                                    <span className="rounded-full bg-emerald-100/90 px-2 py-0.5 text-[10px] font-semibold text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
                                      Auto
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                            {it.category !== "staging" ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (it.category === "plant") {
                                    setGrowerResupplyDraftIndex(i);
                                    setGrowerCatalogSearch("");
                                    setGrowerCatalogModalOpen(true);
                                  } else {
                                    setPotResupplyDraftIndex(i);
                                    setPotCatalogSearch("");
                                    setPotCatalogModalOpen(true);
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-medium text-sky-900 transition hover:bg-sky-200/80 dark:bg-sky-950 dark:text-sky-200 dark:hover:bg-sky-900"
                              >
                                <Store className="h-3 w-3 shrink-0" />
                                {it.vendorName}
                                <span className="text-sky-600"> (Change)</span>
                              </button>
                            ) : null}
                          </div>
                          <div className="grid gap-3 sm:grid-cols-12 sm:items-end">
                            <div className="sm:col-span-4">
                              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">
                                Description
                              </label>
                              <input
                                className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                                value={it.name}
                                disabled={potClientOwned}
                                onChange={(e) =>
                                  updateDraftItem(i, { name: e.target.value })
                                }
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">
                                Area
                              </label>
                              <input
                                className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                                placeholder="e.g. Boardroom"
                                value={it.area ?? ""}
                                onChange={(e) =>
                                  updateDraftItem(i, { area: e.target.value })
                                }
                              />
                            </div>
                            <div className="sm:col-span-1">
                              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">
                                Qty
                              </label>
                              <input
                                type="number"
                                min={1}
                                className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                                value={it.qty}
                                onChange={(e) =>
                                  updateDraftItem(i, {
                                    qty: Math.max(
                                      1,
                                      Number(e.target.value) || 1,
                                    ),
                                  })
                                }
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">
                                Cost $
                              </label>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                disabled={potClientOwned}
                                className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950"
                                value={it.wholesaleCost}
                                onChange={(e) =>
                                  updateDraftItem(i, {
                                    wholesaleCost: Number(e.target.value) || 0,
                                  })
                                }
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">
                                Markup
                              </label>
                              <select
                                disabled={potClientOwned}
                                className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950"
                                value={it.markup}
                                onChange={(e) =>
                                  updateDraftItem(i, {
                                    markup: Number(e.target.value),
                                  })
                                }
                              >
                                {markupOptionsForSelect(
                                  engineConfig,
                                  it.markup,
                                ).map((m) => (
                                  <option key={m} value={m}>
                                    ×{m}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="sm:col-span-1">
                              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">
                                Retail
                              </label>
                              <p className="py-2 text-sm font-bold tabular-nums text-[#2b7041] dark:text-emerald-400">
                                {money.format(
                                  potClientOwned
                                    ? 0
                                    : lineRetail(
                                        it.qty,
                                        it.wholesaleCost,
                                        it.markup,
                                      ),
                                )}
                              </p>
                            </div>
                            {it.category === "plant" ? (
                              <div className="sm:col-span-12 rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200">
                                Environment from client requirements:{" "}
                                <strong>
                                  {(it.environment ?? "indoor") === "outdoor"
                                    ? "Outdoor"
                                    : "Indoor"}
                                </strong>
                                {it.plantingWithoutPot
                                  ? " · Planting without pot active."
                                  : it.clientOwnsPot
                                    ? " · Client already has pot."
                                    : ""}
                                {it.guaranteed
                                  ? " · Guaranteed plant active."
                                  : ""}
                              </div>
                            ) : null}
                            <div className="flex justify-end sm:col-span-12">
                              <button
                                type="button"
                                onClick={() => removeDraftItem(i)}
                                className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                                aria-label="Remove line"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {/* —— Step 2 Rotations —— */}
          {step === 3 ? (
            <div className="space-y-6">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
                  <CalendarDays
                    className="h-6 w-6"
                    style={{ color: PRIMARY }}
                    strokeWidth={1.75}
                  />
                  Seasonal Rotations
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Plants requiring periodic replacement were auto-detected.
                </p>
                <p className="mt-2 rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                  Truck fee is auto-calculated from configured plant-count
                  ranges. Current total plants:{" "}
                  <strong>{totalPlantUnitsForTruckFee}</strong> · fee:{" "}
                  <strong>${computedTruckFee.toFixed(2)}</strong>.
                </p>
              </div>

              {rotations.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  No rotations in this proposal.
                </p>
              ) : (
                <>
                  <div className="space-y-4">
                    {rotations.map((r, idx) => {
                      const { monthly } = computeRotationMonthly(
                        {
                          qty: r.qty,
                          frequencyWeeks: r.frequencyWeeks,
                          rotationUnitPrice: r.rotationUnitPrice,
                          truckFee: r.truckFee,
                        },
                        engineConfig,
                      );
                      const annual = monthly * 12;
                      return (
                        <div
                          key={r.id}
                          className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-950/50"
                        >
                          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                            <div>
                              <p className="text-lg font-bold text-[#2b7041] dark:text-emerald-400">
                                {r.plantName}
                              </p>
                              <p className="mt-1 text-xs text-gray-500">
                                Catalog price{" "}
                                {money.format(r.rotationUnitPrice)} · truck $
                                {r.truckFee}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                                Annual cost
                              </p>
                              <p className="text-2xl font-bold tabular-nums text-[#2b7041] dark:text-emerald-400">
                                {money.format(annual)}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">
                                Rotation unit price
                              </label>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                                value={r.rotationUnitPrice}
                                onChange={(e) =>
                                  updateRotation(idx, {
                                    rotationUnitPrice: Math.max(
                                      0,
                                      Number(e.target.value) || 0,
                                    ),
                                  })
                                }
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">
                                Truck fee (P3)
                              </label>
                              <input
                                type="text"
                                readOnly
                                value={`$${r.truckFee.toFixed(2)} (auto by plant ranges)`}
                                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                              />
                            </div>
                          </div>

                          <div className="mt-5 space-y-3">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                              Frequency (weeks)
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {ROT_PRESETS.map((p) => (
                                <button
                                  key={p.label}
                                  type="button"
                                  onClick={() =>
                                    updateRotation(idx, {
                                      frequencyName: p.frequencyName,
                                      frequencyWeeks: p.frequencyWeeks,
                                    })
                                  }
                                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                    r.frequencyWeeks === p.frequencyWeeks
                                      ? `${PRIMARY_CLASS} text-white`
                                      : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                                  }`}
                                >
                                  {p.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/30">
                    <span className="text-sm font-bold text-[#2b7041] dark:text-emerald-400">
                      Total
                    </span>
                    <span className="text-lg font-bold tabular-nums text-[#2b7041] dark:text-emerald-400">
                      {money.format(rotationsAnnualTotal)}
                    </span>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {/* —— Step 3 Photos —— */}
          {step === 4 ? (
            <div className="space-y-6">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
                  <ImageIcon
                    className="h-6 w-6"
                    style={{ color: PRIMARY }}
                    strokeWidth={1.75}
                  />
                  Plant Photos
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Upload reference photos for each plant. These will appear in
                  the proposal document sent to the client. They are saved when
                  you click <span className="font-medium">Next</span>.
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-950/40">
                <p className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                  Plant photo source
                </p>
                <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                  The flow now uses the internal catalog by default. You can
                  still upload and mix your own photos per plant below.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void applyCatalogPhotosToAllPlants()}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold dark:border-gray-700 dark:bg-gray-900"
                  >
                    Use catalog suggestions
                  </button>
                </div>
                {visiblePhotoTargets.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => void applyCatalogPhotosToAllPlants()}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs font-semibold text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Add best-match catalog photo to each plant line
                  </button>
                ) : null}
              </div>

              <div className="space-y-4">
                {missingImagePhotoTargets.length > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                    {missingImagePhotoTargets.length} plant
                    {missingImagePhotoTargets.length === 1 ? "" : "s"} hidden
                    from Photos because no catalog image match is available yet.
                  </div>
                ) : null}
                {visiblePhotoTargets.length === 0 ? (
                  <p className="text-center text-sm text-gray-500">
                    Add at least one plant in Products, save with Next, then
                    attach photos here.
                  </p>
                ) : (
                  visiblePhotoTargets.map(({ row, urls, suggested }) => {
                    const plantLabel = row.name || "this plant";
                    const sizeLine = `${potSizeFromPlantName(row.name)} × ${row.qty}`;
                    const suggestedCatalogPhoto = suggested;
                    const showSuggested =
                      Boolean(suggestedCatalogPhoto?.imagePublicPath) &&
                      !hiddenSuggestedKeys[row.key];
                    return (
                      <div
                        key={row.key}
                        className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-950/50"
                      >
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-bold text-gray-900 dark:text-white">
                              {plantLabel}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {sizeLine}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-gray-400">
                              {urls.length} photo{urls.length === 1 ? "" : "s"}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                plantPhotoInputRefs.current
                                  .get(row.globalIndex)
                                  ?.click()
                              }
                              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm ${PRIMARY_CLASS}`}
                            >
                              <UploadCloud
                                className="h-4 w-4 shrink-0"
                                strokeWidth={2}
                              />
                              Upload Photos
                            </button>
                          </div>
                        </div>
                        {showSuggested ? (
                          <div className="mb-3 rounded-lg border border-emerald-200/70 bg-emerald-50/40 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-900 dark:text-emerald-300">
                                Suggested catalog photo
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  setHiddenSuggestedKeys((prev) => ({
                                    ...prev,
                                    [row.key]: true,
                                  }))
                                }
                                className="text-[10px] font-semibold text-emerald-800 underline dark:text-emerald-300"
                              >
                                Hide suggestion
                              </button>
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                title={`${suggestedCatalogPhoto.commonName} (${suggestedCatalogPhoto.catalogCode})`}
                                onClick={() =>
                                  void appendCatalogPhotoToPlant(
                                    row.globalIndex,
                                    suggestedCatalogPhoto.imagePublicPath!,
                                  )
                                }
                                className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-emerald-200/80 bg-white shadow-sm transition hover:ring-2 hover:ring-[#2b7041]/40 dark:border-emerald-900/60 dark:bg-gray-900"
                              >
                                <Image
                                  src={suggestedCatalogPhoto.imagePublicPath!}
                                  alt={suggestedCatalogPhoto.commonName}
                                  fill
                                  className="object-cover"
                                  sizes="64px"
                                  unoptimized
                                />
                                <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-0.5 text-center text-[8px] font-bold leading-tight text-white">
                                  {suggestedCatalogPhoto.catalogCode}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void appendCatalogPhotoToPlant(
                                    row.globalIndex,
                                    suggestedCatalogPhoto.imagePublicPath!,
                                  )
                                }
                                className="rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-gray-900 dark:text-emerald-100 dark:hover:bg-gray-800"
                              >
                                Add suggested photo
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void replacePlantPhotosWithCatalog(
                                    row.globalIndex,
                                    suggestedCatalogPhoto.imagePublicPath!,
                                  )
                                }
                                className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                              >
                                Replace current photos
                              </button>
                            </div>
                          </div>
                        ) : null}
                        <div className="flex flex-wrap items-start gap-2">
                          {urls.map((src, idx) => (
                            <div
                              key={`${row.key}-${idx}`}
                              className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600"
                            >
                              <WizardPhotoThumb src={src} />
                              <button
                                type="button"
                                onClick={() =>
                                  removePlantPhoto(row.globalIndex, idx)
                                }
                                className="absolute right-0.5 top-0.5 rounded bg-black/55 p-0.5 text-white hover:bg-black/75"
                                aria-label={`Remove photo ${idx + 1} for ${plantLabel}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() =>
                              plantPhotoInputRefs.current
                                .get(row.globalIndex)
                                ?.click()
                            }
                            className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50/80 text-center transition hover:border-[#2b7041]/45 hover:bg-emerald-50/30 dark:border-gray-600 dark:bg-gray-900/50 dark:hover:border-emerald-600/50 dark:hover:bg-emerald-950/30"
                          >
                            <UploadCloud className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                            <span className="px-1 text-[10px] font-semibold leading-tight text-gray-500 dark:text-gray-400">
                              Add more
                            </span>
                          </button>
                          <input
                            ref={(el) => {
                              if (el) {
                                plantPhotoInputRefs.current.set(
                                  row.globalIndex,
                                  el,
                                );
                              } else {
                                plantPhotoInputRefs.current.delete(
                                  row.globalIndex,
                                );
                              }
                            }}
                            type="file"
                            accept="image/*"
                            multiple
                            className="sr-only"
                            aria-label={`Choose images for ${plantLabel}`}
                            onChange={(e) => {
                              void appendPlantPhotosFromFiles(
                                row.globalIndex,
                                e.target.files,
                              );
                              e.target.value = "";
                            }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}

          {/* —— Step 4 Proposal preview —— */}
          {step === 5 ? (
            <div className="space-y-4">
              <div className="no-print flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
                    <FileText
                      className="h-6 w-6"
                      style={{ color: PRIMARY }}
                      strokeWidth={1.75}
                    />
                    Proposal Document
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 sm:max-w-md">
                    Final wording and client-facing presentation are owned by{" "}
                    <strong>Sales</strong>; this view is for review and handoff.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setProposalPreview("client")}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                      proposalPreview === "client"
                        ? `${PRIMARY_CLASS} text-white`
                        : "border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950"
                    }`}
                  >
                    Client (PDF)
                  </button>
                  <button
                    type="button"
                    onClick={() => setProposalPreview("guts")}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                      proposalPreview === "guts"
                        ? `${PRIMARY_CLASS} text-white`
                        : "border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950"
                    }`}
                  >
                    GUTS (Internal)
                  </button>
                  {proposalPreview === "client" && summary ? (
                    <PrintBar />
                  ) : null}
                  {proposalId ? (
                    <Link
                      href={`/proposal/${proposalId}/client`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300"
                    >
                      Open preview in new tab
                    </Link>
                  ) : null}
                </div>
              </div>

              {!summary ? (
                <p className="text-sm text-gray-500">Loading preview…</p>
              ) : proposalPreview === "client" ? (
                <div className="proposal-embed-shell border border-gray-200 bg-[#f3f4f6] dark:border-gray-700 dark:bg-gray-950">
                  <ClientProposalBody data={summary} />
                </div>
              ) : (
                <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 text-sm dark:border-gray-700 dark:bg-gray-950/80">
                  <p className="font-semibold text-gray-900 dark:text-white">
                    Internal summary (GUTS)
                  </p>
                  <dl className="grid gap-2 sm:grid-cols-2">
                    <div className="flex justify-between gap-4 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900">
                      <dt className="text-gray-500">Client</dt>
                      <dd className="font-medium">{summary.client.name}</dd>
                    </div>
                    <div className="flex justify-between gap-4 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900">
                      <dt className="text-gray-500">Labor (total)</dt>
                      <dd className="tabular-nums font-semibold">
                        {money.format(summary.calculations.laborCost)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900">
                      <dt className="text-gray-500">Commission</dt>
                      <dd className="tabular-nums font-semibold">
                        {money.format(summary.calculations.commissionGross)}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-950 sm:col-span-2">
                      <p className="font-semibold text-gray-800 dark:text-gray-200">
                        Maintenance engine
                      </p>
                      <ul className="mt-1 space-y-0.5 tabular-nums">
                        <li>
                          Install minutes:{" "}
                          {summary.calculations.maintenanceBreakdown.totalInstallMinutes.toFixed(
                            0,
                          )}
                        </li>
                        <li>
                          Install hours:{" "}
                          {summary.calculations.maintenanceBreakdown.installationHours.toFixed(
                            3,
                          )}
                        </li>
                        <li>
                          Cost/mo (hours):{" "}
                          {money.format(
                            summary.calculations.maintenanceBreakdown
                              .costPerMonthHours,
                          )}
                        </li>
                        <li>
                          Cost/mo (plants):{" "}
                          {money.format(
                            summary.calculations.maintenanceBreakdown
                              .costPerMonthPlants,
                          )}
                        </li>
                        <li>
                          Overhead factor:{" "}
                          {
                            summary.calculations.maintenanceBreakdown
                              .overheadFactor
                          }
                        </li>
                        <li>
                          Overhead:{" "}
                          {money.format(
                            summary.calculations.maintenanceBreakdown.overhead,
                          )}
                        </li>
                      </ul>
                    </div>
                    <div className="flex justify-between gap-4 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900">
                      <dt className="text-gray-500">Initial to client</dt>
                      <dd className="tabular-nums font-semibold">
                        {money.format(
                          summary.calculations.priceToClientInitial,
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900">
                      <dt className="text-gray-500">Rotations / yr</dt>
                      <dd className="tabular-nums font-semibold">
                        {money.format(summary.calculations.rotationsAnnual)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900">
                      <dt className="text-gray-500">Maintenance / mo</dt>
                      <dd className="tabular-nums font-semibold">
                        {money.format(summary.calculations.maintenanceMonthly)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900">
                      <dt className="text-gray-500">Guaranteed plants / mo</dt>
                      <dd className="tabular-nums font-semibold">
                        {money.format(
                          summary.calculations.guaranteedPlantsMonthly,
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900">
                      <dt className="text-gray-500">
                        Annual replacement budget
                      </dt>
                      <dd className="tabular-nums font-semibold">
                        {money.format(
                          summary.calculations.annualReplacementBudget,
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 rounded-lg bg-emerald-50 px-3 py-2 sm:col-span-2 dark:bg-emerald-950/30">
                      <dt className="font-bold text-[#2b7041] dark:text-emerald-400">
                        Total
                      </dt>
                      <dd className="text-lg font-bold tabular-nums text-[#2b7041] dark:text-emerald-400">
                        {money.format(summary.calculations.priceToClientAnnual)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 rounded-lg bg-gray-50 px-3 py-2 sm:col-span-2 dark:bg-gray-900">
                      <dt className="text-gray-500">Est. gross margin</dt>
                      <dd className="tabular-nums font-semibold text-emerald-800 dark:text-emerald-300">
                        {money.format(summary.calculations.grossMargin)} (
                        {summary.calculations.marginPct.toFixed(1)}%)
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>
          ) : null}

          {/* —— Step 5 Send —— */}
          {step === 6 ? (
            <div className="mx-auto max-w-lg space-y-6">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
                  <Send
                    className="h-6 w-6"
                    style={{ color: PRIMARY }}
                    strokeWidth={1.75}
                  />
                  Send to Client
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Review and send the proposal
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Client Email
                  </label>
                  <input
                    type="email"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950"
                    placeholder="contact@company.com"
                    value={sendEmail}
                    onChange={(e) => setSendEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Subject
                  </label>
                  <input
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950"
                    value={sendSubject}
                    onChange={(e) => setSendSubject(e.target.value)}
                  />
                </div>
              </div>

              {summary ? (
                <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                    Summary
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                    <li>{summary.items.length} items configured</li>
                    <li>{summary.rotations.length} rotations</li>
                    <li>{summaryPhotoCount} photos attached</li>
                  </ul>
                  <p className="mt-3 text-2xl font-bold tabular-nums text-[#2b7041] dark:text-emerald-400">
                    Total:{" "}
                    {money.format(summary.calculations.priceToClientAnnual)}
                  </p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Status: {summary.proposal.status.replaceAll("_", " ")}
                  </p>
                </div>
              ) : null}

              {workflowNotice ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
                  {workflowNotice}
                </div>
              ) : null}

              <div className="space-y-2">
                <button
                  type="button"
                  disabled={
                    busy || !summary || summary.proposal.status !== "draft"
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700/90 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    void runWorkflowAction("send_to_client");
                  }}
                >
                  <Send className="h-4 w-4" />
                  Send Proposal to Client
                </button>
                <button
                  type="button"
                  disabled={
                    busy ||
                    !summary ||
                    (summary.proposal.status !== "pending_approval" &&
                      summary.proposal.status !== "approved")
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-800 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900"
                  onClick={() => {
                    void runWorkflowAction("simulate_approval");
                  }}
                >
                  <Check className="h-4 w-4" />
                  Simulate Approval + Generate Internal Purchase Orders
                </button>
              </div>

              {summary?.workflow?.purchaseOrders?.length ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-950/40">
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-100">
                    Internal purchase orders generated
                  </p>
                  <div className="mt-3 space-y-2">
                    {summary.workflow.purchaseOrders.map((po) => (
                      <div
                        key={po.id}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-900"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-800 dark:text-gray-100">
                              PO-{po.sequence}:{" "}
                              {po.kind === "plants"
                                ? "Plants only"
                                : "Pots and staging"}
                            </p>
                            <p className="mt-1 text-gray-600 dark:text-gray-400">
                              {po.items.length} item(s) · Wholesale{" "}
                              {money.format(po.totals.wholesale)} · Retail{" "}
                              {money.format(po.totals.retail)} · Freight{" "}
                              {money.format(po.totals.freight)}
                            </p>
                          </div>
                          {proposalId ? (
                            <Link
                              href={`/proposal/${proposalId}/po/${po.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[#2b7041]/40 bg-emerald-50/80 px-2.5 py-1.5 text-[11px] font-bold text-[#2b7041] hover:bg-emerald-100/90 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70"
                            >
                              <FileText className="h-3.5 w-3.5 shrink-0" />
                              View / print PDF
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {proposalId ? (
                <p className="text-center text-xs text-gray-500">
                  <Link
                    href={`/proposal/${proposalId}/client`}
                    className="inline-flex items-center gap-1.5 font-semibold text-[#2b7041] underline dark:text-emerald-400"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open client preview in new tab"
                  >
                    <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Preview
                  </Link>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </main>

      {/* Footer nav */}
      <footer className="no-print sticky bottom-0 z-10 shrink-0 border-t border-gray-200/90 bg-white/95 py-4 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 md:px-6">
          <button
            type="button"
            disabled={step === 0 || busy || isProposalLocked}
            onClick={goBack}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Step {step + 1} of {STEPS.length}
          </p>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              disabled={nextDisabled}
              onClick={() =>
                void goNext().catch((e: unknown) => setError(toErrorMessage(e)))
              }
              className={`inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40 ${PRIMARY_CLASS}`}
            >
              {busy ? "Saving…" : "Next"}
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <span className="w-[100px]" />
          )}
        </div>
      </footer>

      {stagingImagePreview ? (
        <div
          className="no-print fixed inset-0 z-[110] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Staging image preview"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setStagingImagePreview(null)}
            aria-label="Close preview"
          />
          <div className="relative z-[111] flex max-h-[min(92vh,860px)] w-full max-w-4xl flex-col rounded-2xl bg-white p-3 shadow-2xl dark:bg-gray-900">
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setStagingImagePreview(null)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="relative mx-auto h-[min(78vh,720px)] w-full max-w-4xl">
              <Image
                src={stagingImagePreview}
                alt=""
                fill
                className="object-contain"
                sizes="(max-width: 896px) 100vw, 896px"
                unoptimized
              />
            </div>
          </div>
        </div>
      ) : null}

      {growerCatalogModalOpen ? (
        <div
          className="no-print fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
          role="presentation"
        >
          <button
            type="button"
            aria-label="Close grower catalog"
            className="absolute inset-0 bg-[#121212]/55 backdrop-blur-sm transition dark:bg-black/65"
            onClick={() => {
              setGrowerCatalogModalOpen(false);
              setGrowerResupplyDraftIndex(null);
            }}
          />
          <div
            className="relative z-[101] flex max-h-[min(90vh,820px)] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-[#f5f2eb] shadow-2xl dark:border-gray-700 dark:bg-gray-900 sm:rounded-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="grower-catalog-title"
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200/80 px-5 py-4 dark:border-gray-700">
              <div className="flex gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
                  style={{ backgroundColor: PRIMARY }}
                >
                  <Store className="h-5 w-5" strokeWidth={2} />
                </span>
                <div>
                  <h2
                    id="grower-catalog-title"
                    className="text-lg font-bold text-[#2b7041] dark:text-emerald-400"
                  >
                    Grower Catalog
                  </h2>
                  <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
                    Find the best-priced grower for each plant.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setGrowerCatalogModalOpen(false);
                  setGrowerResupplyDraftIndex(null);
                }}
                className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-200/80 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="shrink-0 px-4 pb-3 pt-1 sm:px-5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  className="w-full rounded-xl border-2 border-[#2b7041] bg-white py-3 pl-10 pr-4 text-sm text-gray-900 shadow-sm outline-none ring-[#2b7041]/20 placeholder:text-gray-400 focus:ring-2 dark:border-emerald-600 dark:bg-gray-950 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="Search plant name…"
                  value={growerCatalogSearch}
                  onChange={(e) => setGrowerCatalogSearch(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 sm:px-5">
              <div className="space-y-4">
                {growerCatalogFiltered.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    No plants match your search.
                  </p>
                ) : (
                  growerCatalogFiltered.map((plant) => {
                    const sorted = [...plant.growers].sort((a, b) => {
                      if (a.price !== b.price) return a.price - b.price;
                      return a.name.localeCompare(b.name);
                    });
                    const needed = neededQtyForPlant(plant.id);
                    const area = firstRequirementAreaForPlant(plant.id);
                    return (
                      <div
                        key={plant.id}
                        className="overflow-hidden rounded-xl border border-gray-200/90 bg-white/95 shadow-sm dark:border-gray-700 dark:bg-gray-950/90"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                          <h3 className="font-bold text-[#2b7041] dark:text-emerald-400">
                            {plant.name} ({plant.size})
                            {plant.requiresRotation ? (
                              <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                                · rotation
                              </span>
                            ) : null}
                          </h3>
                          <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-[#2b7041] dark:bg-emerald-950/80 dark:text-emerald-200">
                            Needed: {needed} {needed === 1 ? "unit" : "units"}
                          </span>
                        </div>
                        {sorted.length === 0 ? (
                          <p className="px-4 py-6 text-center text-sm text-gray-500">
                            No growers listed for this plant.
                          </p>
                        ) : (
                          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                            {sorted.map((grower, gi) => {
                              const isBest = gi === 0;
                              const origIdx = plant.growers.findIndex(
                                (g) => g.id === grower.id,
                              );
                              return (
                                <li
                                  key={grower.id}
                                  className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:flex-nowrap"
                                >
                                  <Building2
                                    className="h-5 w-5 shrink-0 text-gray-400"
                                    strokeWidth={1.75}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-semibold text-gray-900 dark:text-white">
                                        {grower.name}
                                      </span>
                                      {isBest ? (
                                        <span
                                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                                          style={{ backgroundColor: PRIMARY }}
                                        >
                                          <Star
                                            className="h-3 w-3 fill-current"
                                            strokeWidth={0}
                                          />
                                          Best Price
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                      {grower.address}
                                    </p>
                                  </div>
                                  <div className="flex w-full shrink-0 items-center justify-between gap-3 sm:w-auto sm:justify-end">
                                    <span className="text-base font-bold tabular-nums text-gray-900 dark:text-white">
                                      {money.format(grower.price)}
                                    </span>
                                    <button
                                      type="button"
                                      className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 ${PRIMARY_CLASS}`}
                                      onClick={() =>
                                        growerResupplyDraftIndex !== null
                                          ? addPlant(plant, origIdx)
                                          : addPlant(plant, origIdx, {
                                              qty: needed,
                                              area,
                                            })
                                      }
                                    >
                                      Select
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {potCatalogModalOpen ? (
        <div
          className="no-print fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
          role="presentation"
        >
          <button
            type="button"
            aria-label="Close pot supplier catalog"
            className="absolute inset-0 bg-[#121212]/55 backdrop-blur-sm transition dark:bg-black/65"
            onClick={() => {
              setPotCatalogModalOpen(false);
              setPotResupplyDraftIndex(null);
            }}
          />
          <div
            className="relative z-[101] flex max-h-[min(90vh,820px)] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-[#f5f2eb] shadow-2xl dark:border-gray-700 dark:bg-gray-900 sm:rounded-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pot-catalog-title"
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200/80 px-5 py-4 dark:border-gray-700">
              <div className="flex gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
                  style={{ backgroundColor: PRIMARY }}
                >
                  <Store className="h-5 w-5" strokeWidth={2} />
                </span>
                <div>
                  <h2
                    id="pot-catalog-title"
                    className="text-lg font-bold text-[#2b7041] dark:text-emerald-400"
                  >
                    Pot Supplier Catalog
                  </h2>
                  {potResupplySingleSupplierContext ? (
                    <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
                      &quot;{potResupplySingleSupplierContext.selectedPotName}
                      &quot; has only one supplier. Showing similar-size pots so
                      you can compare alternatives for this plant setup.
                    </p>
                  ) : (
                    <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
                      Find the best-priced supplier for each pot style.
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPotCatalogModalOpen(false);
                  setPotResupplyDraftIndex(null);
                }}
                className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-200/80 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="shrink-0 px-4 pb-3 pt-1 sm:px-5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  className="w-full rounded-xl border-2 border-[#2b7041] bg-white py-3 pl-10 pr-4 text-sm text-gray-900 shadow-sm outline-none ring-[#2b7041]/20 placeholder:text-gray-400 focus:ring-2 dark:border-emerald-600 dark:bg-gray-950 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="Search pot name…"
                  value={potCatalogSearch}
                  onChange={(e) => setPotCatalogSearch(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 sm:px-5">
              <div className="space-y-4">
                {potCatalogFiltered.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    No pots match your search.
                  </p>
                ) : (
                  potCatalogFiltered.map((pot) => {
                    const sorted = [...pot.suppliers].sort((a, b) => {
                      if (a.price !== b.price) return a.price - b.price;
                      return a.name.localeCompare(b.name);
                    });
                    const needed = neededQtyForPot(pot.id);
                    const area = firstRequirementAreaForPot(pot.id);
                    return (
                      <div
                        key={pot.id}
                        className="overflow-hidden rounded-xl border border-gray-200/90 bg-white/95 shadow-sm dark:border-gray-700 dark:bg-gray-950/90"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                          <h3 className="font-bold text-[#2b7041] dark:text-emerald-400">
                            {pot.name}
                          </h3>
                          <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-[#2b7041] dark:bg-emerald-950/80 dark:text-emerald-200">
                            Needed: {needed} {needed === 1 ? "unit" : "units"}
                          </span>
                        </div>
                        {sorted.length === 0 ? (
                          <p className="px-4 py-6 text-center text-sm text-gray-500">
                            No suppliers listed for this pot.
                          </p>
                        ) : (
                          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                            {sorted.map((supplier, gi) => {
                              const isBest = gi === 0;
                              const origIdx = pot.suppliers.findIndex(
                                (s) => s.id === supplier.id,
                              );
                              return (
                                <li
                                  key={supplier.id}
                                  className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:flex-nowrap"
                                >
                                  <Building2
                                    className="h-5 w-5 shrink-0 text-gray-400"
                                    strokeWidth={1.75}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-semibold text-gray-900 dark:text-white">
                                        {supplier.name}
                                      </span>
                                      {isBest ? (
                                        <span
                                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                                          style={{ backgroundColor: PRIMARY }}
                                        >
                                          <Star
                                            className="h-3 w-3 fill-current"
                                            strokeWidth={0}
                                          />
                                          Best Price
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                      {supplier.address}
                                    </p>
                                  </div>
                                  <div className="flex w-full shrink-0 items-center justify-between gap-3 sm:w-auto sm:justify-end">
                                    <span className="text-base font-bold tabular-nums text-gray-900 dark:text-white">
                                      {money.format(supplier.price)}
                                    </span>
                                    <button
                                      type="button"
                                      className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 ${PRIMARY_CLASS}`}
                                      onClick={() =>
                                        potResupplyDraftIndex !== null
                                          ? addPotFromCatalog(pot, origIdx)
                                          : addPotFromCatalog(pot, origIdx, {
                                              qty: needed,
                                              area,
                                            })
                                      }
                                    >
                                      Select
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <CommissionBeneficiaryFormModal
        open={commissionBeneficiaryModalOpen}
        onClose={() => setCommissionBeneficiaryModalOpen(false)}
        onSaved={(row) => {
          setCommissionBeneficiaryCatalog((prev) =>
            [...prev, row].sort((a, b) =>
              a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
            ),
          );
          setCommissionBeneficiarySlots((prev) => {
            const max = Math.max(0, Math.floor(commissionBeneficiaries));
            if (max === 0) return prev;
            if (prev.some((x) => x.trim() === row.id)) return prev;
            const next = [...prev];
            if (next.length < max) {
              next.push(...Array(max - next.length).fill(""));
            }
            const emptyIdx = next.findIndex((x) => !x.trim());
            if (emptyIdx >= 0) {
              next[emptyIdx] = row.id;
            }
            return next.slice(0, max);
          });
        }}
      />

      {beneficiaryReduceModal ? (
        <div
          className="no-print fixed inset-0 z-[110] flex items-center justify-center p-4"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label="Close"
            onClick={() => {
              setBeneficiaryReduceModal(null);
              setBeneficiaryRemovePicks([]);
            }}
          />
          <div className="relative z-[111] w-full max-w-lg rounded-xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              Reduce beneficiaries
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              You set the count to {beneficiaryReduceModal.targetCount}, but
              there are {uniqueSelectedBeneficiaryIds.length} selected
              beneficiaries. Choose {reduceRequiredCount} beneficiary
              {reduceRequiredCount === 1 ? "" : "ies"} to remove.
            </p>
            <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
              {uniqueSelectedBeneficiaryIds.map((id) => {
                const row = commissionBeneficiaryCatalog.find(
                  (b) => b.id === id,
                );
                const checked = beneficiaryRemovePicks.includes(id);
                return (
                  <label
                    key={id}
                    className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#2b7041] focus:ring-[#2b7041]"
                      checked={checked}
                      onChange={() => toggleBeneficiaryRemovePick(id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-gray-900 dark:text-gray-100">
                        {row?.name ?? id}
                      </span>
                      <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                        {row?.email ?? "No email"}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200"
                onClick={() => {
                  setBeneficiaryReduceModal(null);
                  setBeneficiaryRemovePicks([]);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={beneficiaryRemovePicks.length !== reduceRequiredCount}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${PRIMARY_CLASS} disabled:cursor-not-allowed disabled:opacity-40`}
                onClick={() =>
                  confirmBeneficiaryReduction(new Set(beneficiaryRemovePicks))
                }
              >
                Apply reduction
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {stagingCatalogModalOpen ? (
        <div
          className="no-print fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
          role="presentation"
        >
          <button
            type="button"
            aria-label="Close staging catalog"
            className="absolute inset-0 bg-[#121212]/55 backdrop-blur-sm transition dark:bg-black/65"
            onClick={() => setStagingCatalogModalOpen(false)}
          />
          <div
            className="relative z-[101] flex max-h-[min(90vh,820px)] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-[#f5f2eb] shadow-2xl dark:border-gray-700 dark:bg-gray-900 sm:rounded-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="staging-catalog-title"
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200/80 px-5 py-4 dark:border-gray-700">
              <div className="flex gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
                  style={{ backgroundColor: PRIMARY }}
                >
                  <Layers className="h-5 w-5" strokeWidth={2} />
                </span>
                <div>
                  <h2
                    id="staging-catalog-title"
                    className="text-lg font-bold text-[#2b7041] dark:text-emerald-400"
                  >
                    Browse staging catalog
                  </h2>
                  <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
                    Reference only — you cannot add from here. Use{" "}
                    <strong>Add staging</strong> under each plant on the Staging
                    tab; only presets not already on that plant are offered
                    (remove a line to add it again).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStagingCatalogModalOpen(false)}
                className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-200/80 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-4 sm:px-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {stagingLibrary.map((row) => (
                  <div
                    key={row.id}
                    className="overflow-hidden rounded-xl border border-violet-200/90 bg-white shadow-sm dark:border-violet-800 dark:bg-gray-950"
                  >
                    <div className="relative aspect-square w-full bg-gray-100 dark:bg-gray-900">
                      {row.imageUrl ? (
                        <Image
                          src={row.imageUrl}
                          alt={row.label}
                          fill
                          className="object-contain p-2"
                          sizes="(max-width: 768px) 100vw, 33vw"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-400">
                          <Layers className="h-8 w-8" aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 border-t border-violet-100 p-3 dark:border-violet-900/50">
                      <p className="line-clamp-2 text-sm font-semibold text-gray-900 dark:text-white">
                        {row.label}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Base: {money.format(row.wholesaleCost)} · Markup ×
                        {row.markup}
                      </p>
                      {row.description ? (
                        <p className="line-clamp-3 text-xs text-gray-500 dark:text-gray-400">
                          {row.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {stagingPickPlantKey ? (
        <div
          className="no-print fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
          role="presentation"
        >
          <button
            type="button"
            aria-label="Close add staging"
            className="absolute inset-0 bg-[#121212]/55 backdrop-blur-sm transition dark:bg-black/65"
            onClick={() => setStagingPickPlantKey(null)}
          />
          <div
            className="relative z-[101] flex max-h-[min(90vh,820px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-[#f5f2eb] shadow-2xl dark:border-gray-700 dark:bg-gray-900 sm:rounded-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="staging-pick-title"
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200/80 px-5 py-4 dark:border-gray-700">
              <div>
                <h2
                  id="staging-pick-title"
                  className="text-lg font-bold text-[#2b7041] dark:text-emerald-400"
                >
                  Add staging
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  For{" "}
                  <strong>
                    {
                      stagingSectionBanner(stagingPickPlantKey, draftItems)
                        .title
                    }
                  </strong>
                  . Tap an item to add it (already on this plant, including
                  auto, is hidden).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStagingPickPlantKey(null)}
                className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-200/80 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-2 sm:px-5">
              {stagingPickOptions.length === 0 ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-center text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
                  Every catalog preset is already on this plant (including
                  auto-generated lines). Remove a line if you want to add that
                  preset again.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {stagingPickOptions.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() =>
                        addStagingPresetForPlant(row, stagingPickPlantKey)
                      }
                      className="flex gap-3 overflow-hidden rounded-xl border border-violet-200/90 bg-white p-3 text-left shadow-sm transition hover:border-violet-400/80 hover:bg-violet-50/40 dark:border-violet-800 dark:bg-gray-950 dark:hover:border-violet-600 dark:hover:bg-violet-950/20"
                    >
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-900">
                        {row.imageUrl ? (
                          <Image
                            src={row.imageUrl}
                            alt=""
                            fill
                            className="object-contain p-1"
                            sizes="80px"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-gray-400">
                            <Layers className="h-8 w-8" aria-hidden />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {row.label}
                        </p>
                        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                          Base {money.format(row.wholesaleCost)} · Markup ×
                          {row.markup}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {stagingLibraryModalOpen ? (
        <div
          className="no-print fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="presentation"
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-[#121212]/55 backdrop-blur-sm dark:bg-black/65"
            onClick={() => setStagingLibraryModalOpen(false)}
          />
          <div
            className="relative z-[101] flex max-h-[min(90vh,640px)] w-full max-w-lg flex-col rounded-2xl border border-gray-200 bg-[#f5f2eb] shadow-2xl dark:border-gray-700 dark:bg-gray-900"
            role="dialog"
            aria-modal="true"
            aria-labelledby="staging-library-title"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <h2
                id="staging-library-title"
                className="text-lg font-bold text-[#2b7041] dark:text-emerald-400"
              >
                Staging library
              </h2>
              <button
                type="button"
                onClick={() => setStagingLibraryModalOpen(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-200/80 dark:hover:bg-gray-800"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <p className="mb-4 text-xs text-gray-600 dark:text-gray-400">
                Presets are stored in this browser. Close when done — on the
                Staging tab use <strong>Add staging</strong> under each plant to
                attach materials to the proposal.
              </p>
              <div className="space-y-2">
                {stagingLibrary.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white/90 px-3 py-2 dark:border-gray-700 dark:bg-gray-950/90"
                  >
                    {row.imageUrl ? (
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-100 dark:border-gray-600 dark:bg-gray-900">
                        <Image
                          src={row.imageUrl}
                          alt=""
                          fill
                          className="object-contain p-0.5"
                          sizes="48px"
                          unoptimized
                        />
                      </div>
                    ) : null}
                    <input
                      className="min-w-[120px] flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
                      value={row.label}
                      onChange={(e) =>
                        setStagingLibrary((prev) =>
                          prev.map((x) =>
                            x.id === row.id
                              ? { ...x, label: e.target.value }
                              : x,
                          ),
                        )
                      }
                      aria-label="Staging preset name"
                    />
                    <label className="flex items-center gap-1 text-xs text-gray-500">
                      $
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        className="w-20 rounded-md border border-gray-200 px-1.5 py-1 text-sm dark:border-gray-700 dark:bg-gray-950"
                        value={row.wholesaleCost}
                        onChange={(e) =>
                          setStagingLibrary((prev) =>
                            prev.map((x) =>
                              x.id === row.id
                                ? {
                                    ...x,
                                    wholesaleCost: Number(e.target.value) || 0,
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <select
                      className="rounded-md border border-gray-200 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-950"
                      value={row.markup}
                      onChange={(e) =>
                        setStagingLibrary((prev) =>
                          prev.map((x) =>
                            x.id === row.id
                              ? {
                                  ...x,
                                  markup: Number(e.target.value),
                                }
                              : x,
                          ),
                        )
                      }
                    >
                      {markupOptionsForSelect(engineConfig, row.markup).map(
                        (m) => (
                          <option key={m} value={m}>
                            ×{m}
                          </option>
                        ),
                      )}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setStagingLibrary((prev) =>
                          prev.filter((x) => x.id !== row.id),
                        )
                      }
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                      aria-label="Remove preset"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setStagingLibrary((prev) => [
                    ...prev,
                    {
                      id: newStagingLibraryId(),
                      label: "New staging item",
                      wholesaleCost: 10,
                      markup: engineConfig.defaultMarkup,
                    },
                  ])
                }
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-violet-800 hover:underline dark:text-violet-300"
              >
                <Plus className="h-4 w-4" />
                Add preset to library
              </button>
            </div>
            <div className="shrink-0 border-t border-gray-200 px-5 py-3 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setStagingLibraryModalOpen(false)}
                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
