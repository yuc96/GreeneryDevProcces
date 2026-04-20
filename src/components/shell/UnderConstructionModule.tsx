import type { ComingSoonModuleCopy } from "@/config/app-navigation";

const PRIMARY = "#2b7041";

export function UnderConstructionModule({
  copy,
}: {
  copy: ComingSoonModuleCopy;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-12">
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 p-8 dark:border-amber-900/50 dark:bg-amber-950/30">
        <p className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-200">
          Under construction
        </p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
          {copy.headline}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
          {copy.subhead}
        </p>
        <ul className="mt-6 list-inside list-disc space-y-2 text-sm text-gray-600 dark:text-gray-400">
          {copy.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <p
          className="mt-8 text-sm font-semibold"
          style={{ color: PRIMARY }}
        >
          Ask about adding this module — Greenery can align the roadmap with
          your next phase.
        </p>
      </div>
    </div>
  );
}
