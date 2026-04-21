"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiJson } from "@/lib/api";
import { toErrorMessage } from "@/lib/to-error-message";
import type { LaborEngineConfig, LaborPlantSize } from "@/server/pricing/labor-engine-schema";
import { DEFAULT_LABOR_ENGINE_CONFIG } from "@/server/pricing/labor-engine-schema";

const POT_SIZES: readonly LaborPlantSize[] = [
  `4"`,
  `6"`,
  `8"`,
  `10"`,
  `14"`,
  `17"`,
  `20"`,
  `24"`,
];

const SIZE_LABEL: Record<LaborPlantSize, string> = {
  [`4"`]: '4"',
  [`6"`]: '6"',
  [`8"`]: '8"',
  [`10"`]: '10"',
  [`14"`]: '14"',
  [`17"`]: '17"',
  [`20"`]: '20"',
  [`24"`]: '24"',
};

/** Sizes that can force 2 people when any plant of that size is on the job. */
const LARGE_PRESENCE_SIZES = [`17"`, `20"`, `24"`] as const;

const controlClass =
  "w-full max-w-[280px] rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none ring-[#2b7041]/0 transition focus:border-[#2b7041] focus:ring-2 focus:ring-[#2b7041]/25 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-emerald-500 dark:focus:ring-emerald-500/25";

function FieldRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_280px] sm:items-center sm:gap-x-8">
      <div className="min-w-0 pt-0.5 sm:pt-0">
        <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{label}</div>
        {description ? (
          <p className="mt-1 text-xs leading-snug text-gray-500 dark:text-gray-400">{description}</p>
        ) : null}
      </div>
      <div className="w-full sm:max-w-[280px] sm:justify-self-end">{children}</div>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-gray-100 bg-gray-50/90 px-5 py-4 dark:border-gray-700 dark:bg-gray-800/50">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
        {subtitle ? (
          <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">{subtitle}</p>
        ) : null}
      </div>
      <div className="divide-y divide-gray-100 px-5 dark:divide-gray-700/80">{children}</div>
    </section>
  );
}

export function LaborEngineConfigForm() {
  const [labor, setLabor] = useState<LaborEngineConfig>(DEFAULT_LABOR_ENGINE_CONFIG);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setErr(null);
    apiGet<LaborEngineConfig>("/labor-engine-config")
      .then((c) => {
        setLabor(c);
        setLoaded(true);
      })
      .catch((e) => {
        setErr(toErrorMessage(e));
        setLoaded(true);
      });
  }, []);

  const save = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const saved = await apiJson<LaborEngineConfig>("/labor-engine-config", {
        method: "PATCH",
        body: JSON.stringify(labor),
      });
      setLabor(saved);
    } catch (e) {
      setErr(toErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [labor]);

  const setInstallMinutes = useCallback((size: LaborPlantSize, value: number) => {
    setLabor((c) => ({
      ...c,
      INSTALL_MINUTES_PER_PLANT: {
        ...c.INSTALL_MINUTES_PER_PLANT,
        [size]: Math.max(0, value),
      },
    }));
  }, []);

  const toggleLargeSize = useCallback((size: LaborPlantSize, on: boolean) => {
    setLabor((c) => {
      const set = new Set(c.PEOPLE_RULES.largeSizesRequireTwo);
      if (on) set.add(size);
      else set.delete(size);
      return {
        ...c,
        PEOPLE_RULES: {
          ...c.PEOPLE_RULES,
          largeSizesRequireTwo: Array.from(set) as LaborPlantSize[],
        },
      };
    });
  }, []);

  if (!loaded) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">Loading labor settings…</p>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {err ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </p>
      ) : null}

      <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
        Only the settings below are editable here. PWU tables, productivity, billing increments, and Maps cache use
        built-in defaults in code—change those in the repository if engineering needs to tune the model.
      </p>

      <SectionCard
        title="General & drive"
        subtitle="Used when Google Directions is unavailable and for the requirements preview before plant sizes are known."
      >
        <FieldRow
          label="Drive time if Maps fails"
          description="Hours applied each way (to job and return) when the route API fails or returns no duration."
        >
          <input
            type="number"
            min={0.1}
            step={0.05}
            className={controlClass}
            value={labor.DRIVE_TIME_FALLBACK_HOURS}
            onChange={(e) =>
              setLabor((c) => ({
                ...c,
                DRIVE_TIME_FALLBACK_HOURS: Math.max(0.1, Number(e.target.value) || 0.75),
              }))
            }
          />
        </FieldRow>
        <FieldRow
          label="Assumed pot size when diameter is unknown"
          description="Used on the Requirements step when no catalog size is available yet."
        >
          <select
            className={controlClass}
            value={labor.simplifiedFallbackPlantSize}
            onChange={(e) =>
              setLabor((c) => ({
                ...c,
                simplifiedFallbackPlantSize: e.target.value as LaborPlantSize,
              }))
            }
          >
            {POT_SIZES.map((s) => (
              <option key={s} value={s}>
                {SIZE_LABEL[s]}
              </option>
            ))}
          </select>
        </FieldRow>
      </SectionCard>

      <SectionCard
        title="When to send 2 installers"
        subtitle="Rules are evaluated in order: large pot sizes first, then how many plants of each size class are on the proposal."
      >
        <div className="py-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Large pots on the job (any quantity → 2 people)
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8 sm:gap-y-2">
            {LARGE_PRESENCE_SIZES.map((size) => (
              <label
                key={size}
                className="flex cursor-pointer items-center gap-3 text-sm text-gray-800 dark:text-gray-100"
              >
                <input
                  type="checkbox"
                  checked={labor.PEOPLE_RULES.largeSizesRequireTwo.includes(size)}
                  onChange={(e) => toggleLargeSize(size, e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-[#2b7041] focus:ring-[#2b7041]/30 dark:border-gray-600 dark:bg-gray-900 dark:text-emerald-600"
                />
                <span className="font-medium">{SIZE_LABEL[size]}</span>
              </label>
            ))}
          </div>
        </div>
        <FieldRow
          label="14″ plants — use 2 people if total count is more than…"
          description="Count only 14″ plants on the proposal. Leave high (e.g. 999) to effectively disable."
        >
          <input
            type="number"
            min={0}
            step={1}
            className={controlClass}
            value={labor.PEOPLE_RULES.threshold14Inch}
            onChange={(e) =>
              setLabor((c) => ({
                ...c,
                PEOPLE_RULES: {
                  ...c.PEOPLE_RULES,
                  threshold14Inch: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                },
              }))
            }
          />
        </FieldRow>
        <FieldRow
          label="10″ plants — use 2 people if total count is more than…"
          description="Count only 10″ plants."
        >
          <input
            type="number"
            min={0}
            step={1}
            className={controlClass}
            value={labor.PEOPLE_RULES.threshold10Inch}
            onChange={(e) =>
              setLabor((c) => ({
                ...c,
                PEOPLE_RULES: {
                  ...c.PEOPLE_RULES,
                  threshold10Inch: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                },
              }))
            }
          />
        </FieldRow>
        <FieldRow
          label="6″ + 8″ plants — use 2 people if combined count is more than…"
          description="Adds 6″ and 8″ quantities together for this rule."
        >
          <input
            type="number"
            min={0}
            step={1}
            className={controlClass}
            value={labor.PEOPLE_RULES.thresholdSmallPlants}
            onChange={(e) =>
              setLabor((c) => ({
                ...c,
                PEOPLE_RULES: {
                  ...c.PEOPLE_RULES,
                  thresholdSmallPlants: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                },
              }))
            }
          />
        </FieldRow>
      </SectionCard>

      <SectionCard
        title="Install — minutes per plant"
        subtitle="Minutes of install work per plant at one person, before the crew size splits the clock time."
      >
        <div className="overflow-x-auto py-2">
          <table className="w-full min-w-[320px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-600 dark:text-gray-400">
                <th className="py-3 pr-4 font-medium">Pot size</th>
                <th className="w-[280px] py-3 font-medium">Minutes per plant</th>
              </tr>
            </thead>
            <tbody>
              {POT_SIZES.map((size) => (
                <tr
                  key={size}
                  className="border-b border-gray-100 last:border-0 dark:border-gray-700/80"
                >
                  <td className="py-2.5 pr-4 align-middle font-medium text-gray-800 dark:text-gray-100">
                    {SIZE_LABEL[size]}
                  </td>
                  <td className="py-2.5 align-middle">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      className={controlClass}
                      value={labor.INSTALL_MINUTES_PER_PLANT[size]}
                      onChange={(e) =>
                        setInstallMinutes(size, Number(e.target.value) || 0)
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-lg bg-[#2b7041] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50 dark:bg-emerald-700"
        >
          {busy ? "Saving…" : "Save labor settings"}
        </button>
      </div>
    </div>
  );
}
