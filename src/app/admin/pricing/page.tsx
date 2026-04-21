"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiJson } from "@/lib/api";
import { toErrorMessage } from "@/lib/to-error-message";
import type {
  PricingEngineConfig,
  StagingRecipe,
} from "@/server/pricing/engine-schema";
import { DEFAULT_PRICING_ENGINE_CONFIG } from "@/server/pricing/engine-schema";
import stagingsData from "@/data/staggings-list.json";
import { LaborEngineConfigForm } from "./LaborEngineConfigForm";

const LABOR_STEP_LABELS: Record<
  "load" | "driveToJob" | "unload" | "install" | "cleanUp" | "driveFromJob",
  string
> = {
  load: "Load",
  driveToJob: "Drive to job",
  unload: "Unload",
  install: "Install",
  cleanUp: "Clean up",
  driveFromJob: "Drive from job",
};

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function truckFeeForPlantCountLocal(
  plantCount: number,
  ranges: Array<{ from: number; to: number | null; fee: number }>,
): number | null {
  const count = Math.max(1, Math.floor(plantCount || 0));
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  for (const r of sorted) {
    if (r.to == null) {
      if (count >= r.from) return r.fee;
      continue;
    }
    if (count >= r.from && count <= r.to) return r.fee;
  }
  return null;
}

function truckRangeValidationMessage(
  ranges: Array<{ from: number; to: number | null; fee: number }>,
): string | null {
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  if (!sorted.length) return "Add at least one truck fee range.";
  if (sorted[0]!.from !== 1) return "The first range must start at 1.";
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]!;
    if (cur.to != null && cur.to < cur.from) {
      return `Range ${i + 1}: 'to' must be >= 'from'.`;
    }
    if (i < sorted.length - 1) {
      const next = sorted[i + 1]!;
      if (cur.to == null) return "Only the last range can be infinite.";
      if (next.from !== cur.to + 1) {
        return "Ranges must be contiguous and non-overlapping.";
      }
    } else if (cur.to !== null) {
      return "Last range must be infinite (to = infinity).";
    }
  }
  return null;
}

/** Helper that mutates a single recipe inside the cfg array. */
function patchRecipe(
  recipes: StagingRecipe[],
  recipeId: string,
  patch: (r: StagingRecipe) => StagingRecipe,
): StagingRecipe[] {
  return recipes.map((r) => (r.id === recipeId ? patch(r) : r));
}

const ENVIRONMENT_LABELS: Record<"indoor" | "outdoor", string> = {
  indoor: "Indoor (decorative, double-pot)",
  outdoor: "Outdoor (planted, substrate)",
};

type PricingConfigTab = "prices" | "install" | "staging" | "company";

const PRICING_CONFIG_TABS: {
  id: PricingConfigTab;
  label: string;
  description: string;
}[] = [
  {
    id: "prices",
    label: "Freight & prices",
    description: "Wholesale freight %, markups, hourly rate, rotation defaults.",
  },
  {
    id: "install",
    label: "Delivery & install labor",
    description:
      "Labor crew rules, install minutes, and drive fallbacks (technical PWU defaults live in code).",
  },
  {
    id: "staging",
    label: "Staging materials",
    description: "Auto-generated staging per plant band and indoor/outdoor.",
  },
  {
    id: "company",
    label: "Company & routes",
    description: "Greenery HQ address and demo drive-time limits.",
  },
];

function safeWizardReturnPath(raw: string | null): string {
  if (!raw || typeof raw !== "string") return "/maintenance/proposals";
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return "/";
  try {
    const u = new URL(t, "http://local");
    return `${u.pathname}${u.search}`;
  } catch {
    return "/";
  }
}

function AdminPricingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnToHref = useMemo(
    () => safeWizardReturnPath(searchParams.get("returnTo")),
    [searchParams],
  );
  const backFromProposalFlow = Boolean(searchParams.get("returnTo")?.trim());
  const [cfg, setCfg] = useState<PricingEngineConfig>(DEFAULT_PRICING_ENGINE_CONFIG);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PricingConfigTab>("prices");
  const [truckFeePreviewPlants, setTruckFeePreviewPlants] = useState(20);

  useEffect(() => {
    apiGet<PricingEngineConfig>("/pricing-config")
      .then(setCfg)
      .catch((e) => setErr(toErrorMessage(e)));
  }, []);

  const save = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const saved = await apiJson<PricingEngineConfig>("/pricing-config", {
        method: "PATCH",
        body: JSON.stringify(cfg),
      });
      setCfg(saved);
      router.push(returnToHref);
    } catch (e) {
      setErr(toErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [cfg, returnToHref, router]);

  return (
    <div className="no-scrollbar h-screen overflow-y-auto bg-gray-50 px-4 py-10 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#2b7041] dark:text-emerald-400">
              Proposal pricing settings
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Use the tabs below to focus one area at a time. Values are saved to{" "}
              <code className="rounded bg-gray-200 px-1 text-xs dark:bg-gray-800">
                data/pricing-engine.config.json
              </code>
              .
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            <Link
              href={returnToHref}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {backFromProposalFlow ? "Back to General" : "Back to proposals"}
            </Link>
            <Link
              href="/admin/commission-beneficiaries"
              className="text-center text-sm font-semibold text-[#2b7041] underline dark:text-emerald-400"
            >
              Commission beneficiaries
            </Link>
          </div>
        </div>
        {err ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {err}
          </p>
        ) : null}

        <div className="rounded-xl border border-gray-200 bg-gray-100/80 p-1.5 dark:border-gray-800 dark:bg-gray-900/80">
          <nav
            className="flex flex-wrap gap-1"
            role="tablist"
            aria-label="Pricing configuration sections"
          >
            {PRICING_CONFIG_TABS.map((t) => {
              const selected = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`pricing-panel-${t.id}`}
                  id={`pricing-tab-${t.id}`}
                  onClick={() => setActiveTab(t.id)}
                  className={`rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                    selected
                      ? "bg-white text-[#2b7041] shadow-sm dark:bg-gray-950 dark:text-emerald-400"
                      : "text-gray-600 hover:bg-white/60 dark:text-gray-400 dark:hover:bg-gray-800/80"
                  }`}
                >
                  <span className="block">{t.label}</span>
                  <span className="mt-0.5 block text-[11px] font-normal leading-snug text-gray-500 dark:text-gray-500">
                    {t.description}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {activeTab === "prices" ? (
          <div
            id="pricing-panel-prices"
            className="space-y-6"
            role="tabpanel"
            aria-labelledby="pricing-tab-prices"
          >
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">
            Freight (wholesale × rate)
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm">
              Plants ({pct(cfg.plantFreightPct)})
              <input
                type="number"
                step={0.01}
                min={0}
                max={1}
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                value={cfg.plantFreightPct}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    plantFreightPct: Number(e.target.value) || 0,
                  }))
                }
              />
            </label>
            <label className="text-sm">
              Pots ({pct(cfg.potFreightPct)})
              <input
                type="number"
                step={0.01}
                min={0}
                max={1}
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                value={cfg.potFreightPct}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    potFreightPct: Number(e.target.value) || 0,
                  }))
                }
              />
            </label>
            <label className="text-sm">
              Materials ({pct(cfg.materialFreightPct)})
              <input
                type="number"
                step={0.01}
                min={0}
                max={1}
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                value={cfg.materialFreightPct}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    materialFreightPct: Number(e.target.value) || 0,
                  }))
                }
              />
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">
            Markup defaults
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Default markup
              <input
                type="number"
                min={cfg.markupMin}
                max={cfg.markupMax}
                step={cfg.markupStep}
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                value={cfg.defaultMarkup}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    defaultMarkup: Number(e.target.value) || 0,
                  }))
                }
              />
              <span className="mt-1 block text-[11px] text-gray-500 dark:text-gray-400">
                Same step as markup range ({cfg.markupMin}–{cfg.markupMax}, step{" "}
                {cfg.markupStep}).
              </span>
            </label>
            <label className="text-sm">
              Hourly rate ($)
              <input
                type="number"
                step={1}
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                value={cfg.hourlyRate}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    hourlyRate: Number(e.target.value) || 0,
                  }))
                }
              />
            </label>
            <label className="text-sm">
              Planting without pot fee ($ per plant)
              <input
                type="number"
                min={0}
                step={0.5}
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                value={cfg.plantingWithoutPotFeePerPlant}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    plantingWithoutPotFeePerPlant: Math.max(
                      0,
                      Number(e.target.value) || 0,
                    ),
                  }))
                }
              />
            </label>
            <label className="text-sm">
              Guarantee annual add-on (%)
              <input
                type="number"
                min={0}
                step={0.1}
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                value={cfg.guaranteeAnnualAddOnPct}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    guaranteeAnnualAddOnPct: Math.max(
                      0,
                      Number(e.target.value) || 0,
                    ),
                  }))
                }
              />
            </label>
            <label className="text-sm">
              Annual replacement budget (%)
              <input
                type="number"
                min={0}
                step={0.1}
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                value={cfg.replacementReservePct}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    replacementReservePct: Math.max(
                      0,
                      Number(e.target.value) || 0,
                    ),
                  }))
                }
              />
            </label>
            <label className="text-sm">
              Weeks / month (4.33)
              <input
                type="number"
                step={0.01}
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                value={cfg.weeksPerMonth}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    weeksPerMonth: Number(e.target.value) || 0,
                  }))
                }
              />
            </label>
            <label className="text-sm">
              Plant wholesale monthly factor (0.65)
              <input
                type="number"
                step={0.01}
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                value={cfg.plantWholesaleMonthlyFactor}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    plantWholesaleMonthlyFactor: Number(e.target.value) || 0,
                  }))
                }
              />
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">
            Rotations (P2 / P3)
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Plants per hour
              <input
                type="number"
                step={1}
                min={1}
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                value={cfg.rotationPlantsPerHour}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    rotationPlantsPerHour: Math.max(
                      1,
                      Number(e.target.value) || 1,
                    ),
                  }))
                }
              />
            </label>
            <div className="text-sm sm:col-span-2">
              <p className="mb-2 font-semibold">Truck fee by total plants</p>
              <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900">
                    <tr>
                      <th className="px-2 py-2">From</th>
                      <th className="px-2 py-2">To</th>
                      <th className="px-2 py-2">Fee (USD)</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cfg.rotationTruckFeeRanges.map((r, idx) => (
                      <tr key={idx} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            className="w-24 rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                            value={r.from}
                            onChange={(e) =>
                              setCfg((c) => ({
                                ...c,
                                rotationTruckFeeRanges: c.rotationTruckFeeRanges.map((x, i) =>
                                  i === idx
                                    ? { ...x, from: Math.max(1, Math.floor(Number(e.target.value) || 1)) }
                                    : x,
                                ),
                              }))
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            placeholder="∞"
                            className="w-24 rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                            value={r.to ?? ""}
                            onChange={(e) =>
                              setCfg((c) => ({
                                ...c,
                                rotationTruckFeeRanges: c.rotationTruckFeeRanges.map((x, i) => {
                                  if (i !== idx) return x;
                                  const raw = e.target.value.trim();
                                  return {
                                    ...x,
                                    to:
                                      raw === ""
                                        ? null
                                        : Math.max(1, Math.floor(Number(raw) || 1)),
                                  };
                                }),
                              }))
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0.01}
                            step={0.01}
                            className="w-28 rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                            value={r.fee}
                            onChange={(e) =>
                              setCfg((c) => ({
                                ...c,
                                rotationTruckFeeRanges: c.rotationTruckFeeRanges.map((x, i) =>
                                  i === idx
                                    ? { ...x, fee: Math.max(0.01, Number(e.target.value) || 0.01) }
                                    : x,
                                ),
                              }))
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() =>
                              setCfg((c) => ({
                                ...c,
                                rotationTruckFeeRanges:
                                  c.rotationTruckFeeRanges.length <= 1
                                    ? c.rotationTruckFeeRanges
                                    : c.rotationTruckFeeRanges.filter((_, i) => i !== idx),
                              }))
                            }
                            className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 dark:border-red-900 dark:text-red-300"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setCfg((c) => {
                      const sorted = [...c.rotationTruckFeeRanges].sort((a, b) => a.from - b.from);
                      const last = sorted[sorted.length - 1];
                      const from = last?.to == null ? last.from + 1 : last.to + 1;
                      const fee = last?.fee ?? c.defaultRotationTruckFee ?? 50;
                      const next = sorted.map((row, i) =>
                        i === sorted.length - 1 ? { ...row, to: from - 1 } : row,
                      );
                      return {
                        ...c,
                        rotationTruckFeeRanges: [...next, { from, to: null, fee }],
                      };
                    })
                  }
                  className="rounded border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:text-emerald-300"
                >
                  Añadir rango
                </button>
                {truckRangeValidationMessage(cfg.rotationTruckFeeRanges) ? (
                  <span className="text-xs text-red-700 dark:text-red-300">
                    {truckRangeValidationMessage(cfg.rotationTruckFeeRanges)}
                  </span>
                ) : (
                  <span className="text-xs text-emerald-700 dark:text-emerald-300">
                    Ranges valid.
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-end gap-3">
                <label className="text-xs">
                  Preview plant count
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className="mt-1 w-28 rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                    value={truckFeePreviewPlants}
                    onChange={(e) =>
                      setTruckFeePreviewPlants(Math.max(1, Math.floor(Number(e.target.value) || 1)))
                    }
                  />
                </label>
                <div className="text-sm">
                  Fee:{" "}
                  <strong>
                    $
                    {(
                      truckFeeForPlantCountLocal(
                        truckFeePreviewPlants,
                        cfg.rotationTruckFeeRanges,
                      ) ?? cfg.defaultRotationTruckFee ?? 0
                    ).toFixed(2)}
                  </strong>
                </div>
              </div>
            </div>
            <label className="text-sm sm:col-span-2">
              Default frequency (weeks)
              <select
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                value={cfg.defaultRotationFrequencyWeeks}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    defaultRotationFrequencyWeeks: Number(
                      e.target.value,
                    ) as 4 | 6 | 8,
                  }))
                }
              >
                <option value={4}>4</option>
                <option value={6}>6</option>
                <option value={8}>8</option>
              </select>
            </label>
          </div>
        </section>
          </div>
        ) : null}

        {activeTab === "install" ? (
          <div
            id="pricing-panel-install"
            className="space-y-6"
            role="tabpanel"
            aria-labelledby="pricing-tab-install"
          >
            <section className="rounded-xl border border-emerald-200/80 bg-white p-5 shadow-sm dark:border-emerald-900/40 dark:bg-gray-900">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                Labor engine (PWU)
              </h2>
              <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                Business-facing labor options only. Values are saved to{" "}
                <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">
                  data/labor-engine.config.json
                </code>{" "}
                when you use <strong>Save labor settings</strong> in the form
                (separate from the main <strong>Save</strong>, which only updates{" "}
                <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">
                  pricing-engine.config.json
                </code>
                ).
              </p>
              <LaborEngineConfigForm />
            </section>

            <details className="rounded-xl border border-gray-200 bg-white shadow-sm open:ring-1 open:ring-gray-200 dark:border-gray-800 dark:bg-gray-900 dark:open:ring-gray-700">
              <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-gray-700 marker:content-none dark:text-gray-300 [&::-webkit-details-marker]:hidden">
                Legacy CPP / split fields (not used by the PWU motor)
              </summary>
              <div className="space-y-6 border-t border-gray-100 px-5 pb-5 pt-2 dark:border-gray-800">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">
            Auto Labor (CPP staffing model) — legacy
          </h2>
          <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
            <strong>Formula:</strong>{" "}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">
              people = quantity &gt; threshold(diameter) ? 2 : 1
            </code>
            . Threshold can be configured per diameter point and interpolates
            linearly between points. Missing diameter uses fallback threshold.
            Install workload for labor line distribution is then derived from
            resulting people. Crew size ={" "}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">
              max(1, ceil(sum person-minutes ÷ target clock minutes))
            </code>
            . Each line&apos;s hours = line person-minutes ÷ crew ÷ 60.
          </p>
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
            Examples: 8&quot; threshold 50 (1 up to 50, then 2),
            10&quot; threshold 30, 14&quot; threshold 20, 19&quot;+ threshold 1.5.
            Missing diameter uses fallback threshold.
          </div>
          <div className="mb-5 overflow-x-auto rounded-lg border border-emerald-200/70 p-3 dark:border-emerald-800/60">
            <p className="mb-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
              CPP points by diameter
            </p>
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="pb-2">Diameter (in)</th>
                  <th className="pb-2">CPP</th>
                  <th className="pb-2">Min employees</th>
                  <th className="pb-2">Threshold qty for 2 people</th>
                </tr>
              </thead>
              <tbody>
                {cfg.laborAuto.cppByDiameterPoints.map((point, idx) => (
                  <tr
                    key={`${point.diameterInches}-${idx}`}
                    className="border-t border-gray-100 dark:border-gray-800"
                  >
                    <td className="py-2">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        className="w-24 rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                        value={point.diameterInches}
                        onChange={(e) =>
                          setCfg((c) => ({
                            ...c,
                            laborAuto: {
                              ...c.laborAuto,
                              cppByDiameterPoints: c.laborAuto.cppByDiameterPoints.map(
                                (row, i) =>
                                  i === idx
                                    ? {
                                        ...row,
                                        diameterInches: Math.max(
                                          0,
                                          Number(e.target.value) || 0,
                                        ),
                                      }
                                    : row,
                              ),
                            },
                          }))
                        }
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        min={0.1}
                        step={0.1}
                        className="w-24 rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                        value={point.cpp}
                        onChange={(e) =>
                          setCfg((c) => ({
                            ...c,
                            laborAuto: {
                              ...c.laborAuto,
                              cppByDiameterPoints: c.laborAuto.cppByDiameterPoints.map(
                                (row, i) =>
                                  i === idx
                                    ? {
                                        ...row,
                                        cpp: Math.max(
                                          0.1,
                                          Number(e.target.value) || 0.1,
                                        ),
                                      }
                                    : row,
                              ),
                            },
                          }))
                        }
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        className="w-24 rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                        value={point.minEmployees}
                        onChange={(e) =>
                          setCfg((c) => ({
                            ...c,
                            laborAuto: {
                              ...c.laborAuto,
                              cppByDiameterPoints: c.laborAuto.cppByDiameterPoints.map(
                                (row, i) =>
                                  i === idx
                                    ? {
                                        ...row,
                                        minEmployees: Math.max(
                                          1,
                                          Math.floor(Number(e.target.value) || 1),
                                        ),
                                      }
                                    : row,
                              ),
                            },
                          }))
                        }
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        min={0.1}
                        step={0.1}
                        className="w-32 rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                        value={point.twoPeopleThresholdQty ?? point.cpp}
                        onChange={(e) =>
                          setCfg((c) => ({
                            ...c,
                            laborAuto: {
                              ...c.laborAuto,
                              cppByDiameterPoints: c.laborAuto.cppByDiameterPoints.map(
                                (row, i) =>
                                  i === idx
                                    ? {
                                        ...row,
                                        twoPeopleThresholdQty: Math.max(
                                          0.1,
                                          Number(e.target.value) || 0.1,
                                        ),
                                      }
                                    : row,
                              ),
                            },
                          }))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Interpolation mode
                <select
                  className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                  value={cfg.laborAuto.cppInterpolationMode}
                  onChange={(e) =>
                    setCfg((c) => ({
                      ...c,
                      laborAuto: {
                        ...c.laborAuto,
                        cppInterpolationMode:
                          e.target.value === "linear" ? "linear" : "linear",
                      },
                    }))
                  }
                >
                  <option value="linear">Linear interpolation</option>
                </select>
              </label>
              <label className="text-sm">
                Fallback CPP (missing diameter)
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                  value={cfg.laborAuto.missingDiameterFallbackCpp}
                  onChange={(e) =>
                    setCfg((c) => ({
                      ...c,
                      laborAuto: {
                        ...c.laborAuto,
                        missingDiameterFallbackCpp: Math.max(
                          0.1,
                          Number(e.target.value) || 0.1,
                        ),
                      },
                    }))
                  }
                />
              </label>
              <label className="text-sm">
                Fallback min employees (missing diameter)
                <input
                  type="number"
                  min={1}
                  step={1}
                  className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                  value={cfg.laborAuto.missingDiameterFallbackMinEmployees}
                  onChange={(e) =>
                    setCfg((c) => ({
                      ...c,
                      laborAuto: {
                        ...c.laborAuto,
                        missingDiameterFallbackMinEmployees: Math.max(
                          1,
                          Math.floor(Number(e.target.value) || 1),
                        ),
                      },
                    }))
                  }
                />
              </label>
              <label className="text-sm">
                Fallback threshold qty for 2 people
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                  value={
                    cfg.laborAuto.missingDiameterTwoPeopleThresholdQty ??
                    cfg.laborAuto.missingDiameterFallbackCpp
                  }
                  onChange={(e) =>
                    setCfg((c) => ({
                      ...c,
                      laborAuto: {
                        ...c.laborAuto,
                        missingDiameterTwoPeopleThresholdQty: Math.max(
                          0.1,
                          Number(e.target.value) || 0.1,
                        ),
                      },
                    }))
                  }
                />
              </label>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm">
              Enabled by default
              <select
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                value={cfg.laborAuto.enabledByDefault ? "on" : "off"}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    laborAuto: {
                      ...c.laborAuto,
                      enabledByDefault: e.target.value === "on",
                    },
                  }))
                }
              >
                <option value="on">Yes</option>
                <option value="off">No</option>
              </select>
            </label>
            <label className="text-sm">
              Target clock minutes per person
              <input
                type="number"
                min={1}
                step={5}
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                value={cfg.laborAuto.targetClockMinutesPerPerson}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    laborAuto: {
                      ...c.laborAuto,
                      targetClockMinutesPerPerson: Math.max(
                        1,
                        Number(e.target.value) || 1,
                      ),
                    },
                  }))
                }
              />
              <span className="mt-1 block text-[11px] text-gray-500 dark:text-gray-400">
                Maximum clock minutes per person. Use 120 for a 2-hour cap;
                when workload exceeds this target, the engine adds people in
                parallel.
              </span>
            </label>
            <label className="text-sm">
              Driver people (Drive lines)
              <input
                type="number"
                min={1}
                step={1}
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                value={1}
                readOnly
              />
              <span className="mt-1 block text-[11px] text-gray-500 dark:text-gray-400">
                Fixed to 1. The driver is part of total staffing.
              </span>
            </label>
            <label className="text-sm sm:col-span-3">
              Drive one-way hours fallback (when real drive time is unavailable)
              <input
                type="number"
                min={0}
                step={0.25}
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                value={cfg.laborAuto.defaultDriveHoursOneWayFallback}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    laborAuto: {
                      ...c.laborAuto,
                      defaultDriveHoursOneWayFallback: Math.max(
                        0,
                        Number(e.target.value) || 0,
                      ),
                    },
                  }))
                }
              />
            </label>
          </div>
          <div className="mt-6 border-t border-gray-100 pt-4 dark:border-gray-800">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
              Handling minimums (person-minutes per job)
            </h3>
            <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
              When the proposal includes plants, each phase is billed at least
              this many person-minutes (even for a single plant with one
              installer), before adding the plant-derived portion split by the
              weights below.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(["load", "unload", "install", "cleanUp"] as const).map((key) => (
                <label key={key} className="text-sm">
                  {LABOR_STEP_LABELS[key]}
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                    value={cfg.laborAuto.handlingMinimumPersonMinutes[key]}
                    onChange={(e) =>
                      setCfg((c) => ({
                        ...c,
                        laborAuto: {
                          ...c.laborAuto,
                          handlingMinimumPersonMinutes: {
                            ...c.laborAuto.handlingMinimumPersonMinutes,
                            [key]: Math.max(
                              0,
                              Number(e.target.value) || 0,
                            ),
                          },
                        },
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">
            Plant-minute split (relative weights)
          </h2>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            These four numbers split only the <strong>plant-derived</strong>{" "}
            person-minutes (from CPP staffing results). They do not need to
            add up to 100%: the engine normalizes them to sum to 1. Drive lines
            ignore this table and use route / fallback drive hours.
          </p>
          <p className="mb-3 text-xs font-medium text-gray-600 dark:text-gray-300">
            Raw weight sum:{" "}
            {(
              cfg.laborAuto.lineDistributionPct.load +
              cfg.laborAuto.lineDistributionPct.unload +
              cfg.laborAuto.lineDistributionPct.install +
              cfg.laborAuto.lineDistributionPct.cleanUp
            ).toFixed(2)}{" "}
            → normalized to 1.00 for the plant portion.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(["load", "unload", "install", "cleanUp"] as const).map((key) => (
              <label key={key} className="text-sm">
                {LABOR_STEP_LABELS[key]} (weight)
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                  value={cfg.laborAuto.lineDistributionPct[key]}
                  onChange={(e) =>
                    setCfg((c) => ({
                      ...c,
                      laborAuto: {
                        ...c.laborAuto,
                        lineDistributionPct: {
                          ...c.laborAuto.lineDistributionPct,
                          [key]: Math.min(
                            1,
                            Math.max(0, Number(e.target.value) || 0),
                          ),
                        },
                      },
                    }))
                  }
                />
              </label>
            ))}
          </div>
        </section>
              </div>
            </details>

          </div>
        ) : null}

        {activeTab === "staging" ? (
          <div
            id="pricing-panel-staging"
            className="space-y-6"
            role="tabpanel"
            aria-labelledby="pricing-tab-staging"
          >
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">
            Staging recipes (band × environment)
          </h2>
          <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
            Rules for auto-generating staging materials per plant. The engine
            picks a recipe using <strong>(complexity band, indoor/outdoor)</strong>{" "}
            and multiplies <code>qtyPerPlant × plant quantity</code> (rounded
            up). Each material is referenced by its <code>sourceId</code> in{" "}
            <code>src/data/staggings-list.json</code>. Remove components with
            qty=0 if you do not want to include a material.
          </p>

          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            <label className="text-sm">
              Default environment (when a plant does not specify one)
              <select
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                value={cfg.defaultPlantEnvironment}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    defaultPlantEnvironment: e.target.value as
                      | "indoor"
                      | "outdoor",
                  }))
                }
              >
                <option value="indoor">{ENVIRONMENT_LABELS.indoor}</option>
                <option value="outdoor">{ENVIRONMENT_LABELS.outdoor}</option>
              </select>
            </label>
          </div>

          <div className="space-y-4">
            {(["indoor", "outdoor"] as const).map((env) => (
              <div key={env}>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  {ENVIRONMENT_LABELS[env]}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="pb-2">Band</th>
                        <th className="pb-2">Material</th>
                        <th className="pb-2">Qty / plant</th>
                        <th className="pb-2">Note</th>
                        <th className="pb-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cfg.laborAuto.complexityBands.map((band) => {
                        const recipe = cfg.stagingRecipes.find(
                          (r) =>
                            r.bandId === band.id && r.environment === env,
                        );
                        if (!recipe) {
                          return (
                            <tr
                              key={`${env}-${band.id}-empty`}
                              className="border-t border-gray-100 dark:border-gray-800"
                            >
                              <td className="py-2 align-top font-semibold">
                                {band.label}
                              </td>
                              <td colSpan={4} className="py-2 text-xs text-gray-500">
                                No recipe. Staging will be omitted for this
                                combination.
                                <button
                                  type="button"
                                  className="ml-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
                                  onClick={() =>
                                    setCfg((c) => ({
                                      ...c,
                                      stagingRecipes: [
                                        ...c.stagingRecipes,
                                        {
                                          id: `${band.id}-${env}`,
                                          bandId: band.id,
                                          environment: env,
                                          components: [],
                                        },
                                      ],
                                    }))
                                  }
                                >
                                  + Create recipe
                                </button>
                              </td>
                            </tr>
                          );
                        }
                        return (
                          <tr
                            key={recipe.id}
                            className="border-t border-gray-100 align-top dark:border-gray-800"
                          >
                            <td className="py-2 font-semibold">{band.label}</td>
                            <td className="py-2" colSpan={4}>
                              {recipe.components.length === 0 ? (
                                <p className="mb-2 text-xs italic text-gray-500">
                                  Empty recipe.
                                </p>
                              ) : null}
                              <div className="space-y-1">
                                {recipe.components.map((comp, ci) => {
                                  const mat = stagingsData.stagings.find(
                                    (m) => m.id === comp.materialSourceId,
                                  );
                                  return (
                                    <div
                                      key={`${recipe.id}-${ci}`}
                                      className="grid items-center gap-2 sm:grid-cols-[2fr_1fr_2fr_auto]"
                                    >
                                      <select
                                        className="w-full rounded border border-gray-200 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-950"
                                        value={comp.materialSourceId}
                                        onChange={(e) =>
                                          setCfg((c) => ({
                                            ...c,
                                            stagingRecipes: patchRecipe(
                                              c.stagingRecipes,
                                              recipe.id,
                                              (r) => ({
                                                ...r,
                                                components: r.components.map(
                                                  (x, i) =>
                                                    i === ci
                                                      ? {
                                                          ...x,
                                                          materialSourceId:
                                                            Number(
                                                              e.target.value,
                                                            ),
                                                        }
                                                      : x,
                                                ),
                                              }),
                                            ),
                                          }))
                                        }
                                      >
                                        {stagingsData.stagings.map((m) => (
                                          <option key={m.id} value={m.id}>
                                            {m.name}
                                          </option>
                                        ))}
                                      </select>
                                      <input
                                        type="number"
                                        min={0}
                                        step={0.5}
                                        className="w-full rounded border border-gray-200 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-950"
                                        value={comp.qtyPerPlant}
                                        onChange={(e) =>
                                          setCfg((c) => ({
                                            ...c,
                                            stagingRecipes: patchRecipe(
                                              c.stagingRecipes,
                                              recipe.id,
                                              (r) => ({
                                                ...r,
                                                components: r.components.map(
                                                  (x, i) =>
                                                    i === ci
                                                      ? {
                                                          ...x,
                                                          qtyPerPlant: Math.max(
                                                            0,
                                                            Number(
                                                              e.target.value,
                                                            ) || 0,
                                                          ),
                                                        }
                                                      : x,
                                                ),
                                              }),
                                            ),
                                          }))
                                        }
                                      />
                                      <input
                                        type="text"
                                        placeholder={mat?.description ?? ""}
                                        className="w-full rounded border border-gray-200 px-2 py-1 text-xs italic dark:border-gray-700 dark:bg-gray-950"
                                        value={comp.note ?? ""}
                                        onChange={(e) =>
                                          setCfg((c) => ({
                                            ...c,
                                            stagingRecipes: patchRecipe(
                                              c.stagingRecipes,
                                              recipe.id,
                                              (r) => ({
                                                ...r,
                                                components: r.components.map(
                                                  (x, i) =>
                                                    i === ci
                                                      ? { ...x, note: e.target.value }
                                                      : x,
                                                ),
                                              }),
                                            ),
                                          }))
                                        }
                                      />
                                      <button
                                        type="button"
                                        className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                                        onClick={() =>
                                          setCfg((c) => ({
                                            ...c,
                                            stagingRecipes: patchRecipe(
                                              c.stagingRecipes,
                                              recipe.id,
                                              (r) => ({
                                                ...r,
                                                components: r.components.filter(
                                                  (_, i) => i !== ci,
                                                ),
                                              }),
                                            ),
                                          }))
                                        }
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                              <button
                                type="button"
                                className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
                                onClick={() =>
                                  setCfg((c) => ({
                                    ...c,
                                    stagingRecipes: patchRecipe(
                                      c.stagingRecipes,
                                      recipe.id,
                                      (r) => ({
                                        ...r,
                                        components: [
                                          ...r.components,
                                          {
                                            materialSourceId:
                                              stagingsData.stagings[0]?.id ?? 1,
                                            qtyPerPlant: 1,
                                          },
                                        ],
                                      }),
                                    ),
                                  }))
                                }
                              >
                                + Material
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>
          </div>
        ) : null}

        {activeTab === "company" ? (
          <div
            id="pricing-panel-company"
            className="space-y-6"
            role="tabpanel"
            aria-labelledby="pricing-tab-company"
          >
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">
            Greenery HQ &amp; drive-time simulation
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              Vendor home address
              <input
                type="text"
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                value={cfg.vendorHomeAddress}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    vendorHomeAddress: e.target.value,
                  }))
                }
              />
            </label>
            <label className="text-sm">
              Simulated max drive minutes (demo)
              <input
                type="number"
                min={0}
                step={5}
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                value={cfg.simulatedMaxDriveMinutes}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    simulatedMaxDriveMinutes: Math.max(
                      0,
                      Number(e.target.value) || 0,
                    ),
                  }))
                }
              />
            </label>
          </div>
        </section>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3 border-t border-gray-200 pt-6 dark:border-gray-800">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="rounded-lg bg-[#2b7041] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#235a37] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save and return to General"}
          </button>
          <button
            type="button"
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold dark:border-gray-600"
            onClick={() => setCfg(DEFAULT_PRICING_ENGINE_CONFIG)}
          >
            Reset form to code defaults
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPricingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 p-10 text-gray-600 dark:bg-gray-950 dark:text-gray-300">
          Loading…
        </div>
      }
    >
      <AdminPricingPageInner />
    </Suspense>
  );
}
