"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiJson } from "@/lib/api";
import { toErrorMessage } from "@/lib/to-error-message";
import type {
  LaborEngineConfig,
  LaborPlantSize,
} from "@/server/pricing/labor-engine-schema";
import { DEFAULT_LABOR_ENGINE_CONFIG } from "@/server/pricing/labor-engine-schema";

const POT_SIZES: readonly LaborPlantSize[] = [
  `4"`,
  `6"`,
  `8"`,
  `12"`,
  `14"`,
  `17"`,
  `21"`,
  `24"`,
];

const SIZE_LABEL: Record<LaborPlantSize, string> = {
  [`4"`]: '4"',
  [`6"`]: '6"',
  [`8"`]: '8"',
  [`12"`]: '12"',
  [`14"`]: '14"',
  [`17"`]: '17"',
  [`21"`]: '21"',
  [`24"`]: '24"',
};

/**
 * `determinePeopleForInstall` uses strict `count > threshold` → 2 installers.
 */
function exclusiveThresholdHint(threshold: number): string {
  if (threshold <= 0) {
    return "With 0, any matching plants (one or more) already mean two installers.";
  }
  if (threshold >= 500) {
    return "Very high cutoffs rarely trigger this rule (e.g. 999 ≈ off for normal proposals).";
  }
  return `One installer is enough up to ${threshold} plants; at ${threshold + 1}+ plan for two installers.`;
}

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
        <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
          {label}
        </div>
        {description ? (
          <p className="mt-1 text-xs leading-snug text-gray-500 dark:text-gray-400">
            {description}
          </p>
        ) : null}
      </div>
      <div className="w-full sm:max-w-[280px] sm:justify-self-end">
        {children}
      </div>
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
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          {title}
        </h3>
        {subtitle ? (
          <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
            {subtitle}
          </p>
        ) : null}
      </div>
      <div className="divide-y divide-gray-100 px-5 dark:divide-gray-700/80">
        {children}
      </div>
    </section>
  );
}

export function LaborEngineConfigForm() {
  const [labor, setLabor] = useState<LaborEngineConfig>(
    DEFAULT_LABOR_ENGINE_CONFIG,
  );
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

  const setInstallMinutes = useCallback(
    (size: LaborPlantSize, value: number) => {
      setLabor((c) => ({
        ...c,
        INSTALL_MINUTES_PER_PLANT: {
          ...c.INSTALL_MINUTES_PER_PLANT,
          [size]: Math.max(0, value),
        },
      }));
    },
    [],
  );

  if (!loaded) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Loading labor settings…
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {err ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </p>
      ) : null}

      <SectionCard
        title="General & drive"
        subtitle="Used when Google Directions is unavailable (fallback drive hours each way)."
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
                DRIVE_TIME_FALLBACK_HOURS: Math.max(
                  0.1,
                  Number(e.target.value) || 0.75,
                ),
              }))
            }
          />
        </FieldRow>
      </SectionCard>

      <SectionCard
        title="When to send 2 installers"
        subtitle="Very large pots (e.g. 17″, 21″, 24″) can still force two installers from your saved labor file—they are not edited on this screen. Then these cutoffs are checked in order: (1) 14″ totals, (2) 12″ totals, (3) combined 6″+8″. If none match, one installer is enough."
      >
        <div className="py-4">
          <p className="mb-2 text-sm font-medium text-gray-800 dark:text-gray-100">
            Count cutoffs (same-size batches)
          </p>
          <div className="mb-4 rounded-lg border border-sky-200/80 bg-sky-50/90 px-3 py-2.5 text-xs leading-relaxed text-sky-950 dark:border-sky-900/45 dark:bg-sky-950/35 dark:text-sky-100">
            <p className="font-semibold text-sky-900 dark:text-sky-200">
              Same comparison for every row
            </p>
            <p className="mt-1">
              Each number is a <strong>cutoff</strong> (not a minimum crew size).
              The engine asks: is the counted quantity <strong>strictly greater</strong>{" "}
              than this number? If <strong>yes</strong> → plan <strong>two</strong>{" "}
              installers; if <strong>no</strong> → this row passes and the next
              rule is checked.
            </p>
          </div>
        </div>
        <FieldRow
          label="14″ plants only"
          description="Count is the sum of quantities for 14″ pots. Other sizes do not count here."
        >
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              Two installers when 14″ total is greater than…
              <input
                type="number"
                min={0}
                step={1}
                className={`${controlClass} mt-1.5`}
                value={labor.PEOPLE_RULES.threshold14Inch}
                onChange={(e) =>
                  setLabor((c) => ({
                    ...c,
                    PEOPLE_RULES: {
                      ...c.PEOPLE_RULES,
                      threshold14Inch: Math.max(
                        0,
                        Math.floor(Number(e.target.value) || 0),
                      ),
                    },
                  }))
                }
              />
            </label>
            <p className="text-xs leading-snug text-gray-500 dark:text-gray-400">
              {exclusiveThresholdHint(labor.PEOPLE_RULES.threshold14Inch)}
            </p>
          </div>
        </FieldRow>
        <FieldRow
          label="12″ plants only"
          description="Count is the sum of quantities for 12″ pots."
        >
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              Two installers when 12″ total is greater than…
              <input
                type="number"
                min={0}
                step={1}
                className={`${controlClass} mt-1.5`}
                value={labor.PEOPLE_RULES.threshold12Inch}
                onChange={(e) =>
                  setLabor((c) => ({
                    ...c,
                    PEOPLE_RULES: {
                      ...c.PEOPLE_RULES,
                      threshold12Inch: Math.max(
                        0,
                        Math.floor(Number(e.target.value) || 0),
                      ),
                    },
                  }))
                }
              />
            </label>
            <p className="text-xs leading-snug text-gray-500 dark:text-gray-400">
              {exclusiveThresholdHint(labor.PEOPLE_RULES.threshold12Inch)}
            </p>
          </div>
        </FieldRow>
        <FieldRow
          label="6″ and 8″ combined"
          description="Count = (all 6″ quantities) + (all 8″ quantities) on the proposal."
        >
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              Two installers when combined 6″+8″ total is greater than…
              <input
                type="number"
                min={0}
                step={1}
                className={`${controlClass} mt-1.5`}
                value={labor.PEOPLE_RULES.thresholdSmallPlants}
                onChange={(e) =>
                  setLabor((c) => ({
                    ...c,
                    PEOPLE_RULES: {
                      ...c.PEOPLE_RULES,
                      thresholdSmallPlants: Math.max(
                        0,
                        Math.floor(Number(e.target.value) || 0),
                      ),
                    },
                  }))
                }
              />
            </label>
            <p className="text-xs leading-snug text-gray-500 dark:text-gray-400">
              {exclusiveThresholdHint(labor.PEOPLE_RULES.thresholdSmallPlants)}
            </p>
          </div>
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
                <th className="w-[280px] py-3 font-medium">
                  Minutes per plant
                </th>
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
