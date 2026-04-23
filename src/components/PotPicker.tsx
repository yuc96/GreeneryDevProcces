"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { PotCatalogEntry } from "@/lib/types";
import {
  bandForInches,
  DEFAULT_SIZE_BANDS,
  matchPotsForPlantSize,
  potsInSameBandAs,
} from "@/lib/pot-matching";

interface PotPickerProps {
  pots: PotCatalogEntry[];
  value: string;
  onChange: (potName: string, pot?: PotCatalogEntry) => void;
  /** When set, restrict the list to pots in the same size band as this plant
   *  by default. User can toggle to "show all sizes" inside the dropdown. */
  plantSizeInches?: number | null;
  /** Additional plain options to offer (e.g. "Client-supplied (no pot PO)"). */
  extraOptions?: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Searchable combobox for the pot catalog. Matches on name/sku/family/kind/size.
 * The caller gets back the name (so it can roundtrip through text-based fields
 * like `requirement.potType`) plus optionally the full catalog row.
 */
export function PotPicker({
  pots,
  value,
  onChange,
  plantSizeInches,
  extraOptions,
  placeholder = "Search pot…",
  disabled = false,
  className = "",
}: PotPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  /** When true the user has explicitly opted into "show every pot size". */
  const [showAllSizes, setShowAllSizes] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const plantBand = useMemo(
    () => bandForInches(DEFAULT_SIZE_BANDS, plantSizeInches ?? null),
    [plantSizeInches],
  );

  const sortedPots = useMemo(() => {
    if (plantSizeInches == null) return pots;
    if (!showAllSizes && plantBand) {
      // Strict: only same-band pots.
      return potsInSameBandAs(pots, plantSizeInches, DEFAULT_SIZE_BANDS);
    }
    return matchPotsForPlantSize(pots, plantSizeInches);
  }, [pots, plantSizeInches, showAllSizes, plantBand]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedPots;
    return sortedPots.filter((p) => {
      const key = p.searchKey ?? `${p.name} ${p.sku ?? ""}`.toLowerCase();
      return key.includes(q);
    });
  }, [sortedPots, query]);

  const extrasFiltered = useMemo(() => {
    if (!extraOptions || !extraOptions.length) return [] as string[];
    const q = query.trim().toLowerCase();
    return extraOptions.filter((o) => (q ? o.toLowerCase().includes(q) : true));
  }, [extraOptions, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function pickPot(p: PotCatalogEntry) {
    onChange(p.name, p);
    setOpen(false);
    setQuery("");
  }
  function pickExtra(name: string) {
    onChange(name);
    setOpen(false);
    setQuery("");
  }

  const totalItems = filtered.length + extrasFiltered.length;

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(totalItems - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlight < filtered.length) {
        const p = filtered[highlight];
        if (p) pickPot(p);
      } else {
        const extra = extrasFiltered[highlight - filtered.length];
        if (extra) pickExtra(extra);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const displayLabel = value || "";

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div
        className={`flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm transition focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 dark:border-slate-700 dark:bg-[#0B1120] ${
          disabled ? "cursor-not-allowed opacity-50" : ""
        }`}
      >
        <Search className="h-4 w-4 shrink-0 text-gray-400 dark:text-slate-500" />
        {open ? (
          <input
            ref={inputRef}
            autoFocus
            disabled={disabled}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-slate-500"
          />
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setOpen(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="min-w-0 flex-1 truncate text-left text-sm"
          >
            {displayLabel ? (
              <span className="text-gray-900 dark:text-white">{displayLabel}</span>
            ) : (
              <span className="text-gray-400 dark:text-slate-500">
                {placeholder}
              </span>
            )}
          </button>
        )}
        {value && !disabled ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="rounded p-0.5 text-gray-400 transition hover:text-gray-700 dark:text-slate-500 dark:hover:text-slate-300"
            aria-label="Clear selection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {open && !disabled ? (
        <div className="catalog-combobox-scroll absolute z-[100] mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#151E32]">
          {plantBand ? (
            <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-gray-200 bg-emerald-50/90 px-3 py-1.5 text-[11px] text-emerald-900 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80 dark:text-emerald-300">
              <span>
                Filtering by <strong>{plantBand.label}</strong> (
                {plantBand.min ?? "≤"}–{plantBand.max ?? "+"}&quot;)
                {showAllSizes ? " — all sizes" : ""}
              </span>
              <button
                type="button"
                onClick={() => setShowAllSizes((s) => !s)}
                className="shrink-0 rounded border border-emerald-600/50 bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-slate-800"
              >
                {showAllSizes ? "Only this band" : "Show all sizes"}
              </button>
            </div>
          ) : null}
          {totalItems === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-gray-500 dark:text-slate-500">
              {plantBand && !showAllSizes
                ? `No pots found in ${plantBand.label}. Enable "Show all sizes".`
                : `No pots match "${query}"`}
            </div>
          ) : (
            <ul className="py-1 text-sm">
              {filtered.map((p, idx) => {
                const active = idx === highlight;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlight(idx)}
                      onClick={() => pickPot(p)}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                        active
                          ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-600/20 dark:text-emerald-300"
                          : "text-gray-800 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-700/50"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-gray-900 dark:text-white">
                          {p.name}
                        </span>
                        <span className="block truncate text-[11px] text-gray-500 dark:text-slate-500">
                          {[p.family, p.kind, p.exteriorSize]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      {typeof p.sizeInches === "number" ? (
                        <span className="shrink-0 text-xs text-gray-500 dark:text-slate-500">
                          {p.sizeInches}&quot;
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
              {extrasFiltered.length ? (
                <>
                  <li className="border-t border-gray-200 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:border-slate-700 dark:text-slate-500">
                    Special
                  </li>
                  {extrasFiltered.map((o, i) => {
                    const idx = filtered.length + i;
                    const active = idx === highlight;
                    return (
                      <li key={`extra-${o}`}>
                        <button
                          type="button"
                          onMouseEnter={() => setHighlight(idx)}
                          onClick={() => pickExtra(o)}
                          className={`flex w-full items-center px-3 py-1.5 text-left transition-colors ${
                            active
                              ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-600/20 dark:text-emerald-300"
                              : "text-gray-800 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-700/50"
                          }`}
                        >
                          <span className="font-medium text-gray-900 dark:text-white">
                            {o}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </>
              ) : null}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
