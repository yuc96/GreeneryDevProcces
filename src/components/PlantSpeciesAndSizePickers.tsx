"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { PlantCatalogEntry } from "@/lib/types";
import {
  buildPlantVariantCatalogId,
  buildSpeciesPendingCatalogId,
  CANONICAL_POT_SIZES_INCHES,
  deriveSpeciesCodeAndSize,
  findPlantCatalogVariant,
} from "@/lib/plant-catalog-variants";

interface PlantSpeciesAndSizePickersProps {
  /** One row per species (`catalogCode`), sorted alphabetically by the parent. */
  speciesRows: PlantCatalogEntry[];
  fullCatalog: PlantCatalogEntry[];
  plantCatalogId: string;
  disabled?: boolean;
  onChangePlantCatalogId: (id: string) => void;
  speciesPlaceholder?: string;
  sizeLabel?: string;
  className?: string;
}

/**
 * Two-step plant selection: species (unique, no repeated sizes in the list) then canonical size.
 */
export function PlantSpeciesAndSizePickers({
  speciesRows,
  fullCatalog,
  plantCatalogId,
  disabled = false,
  onChangePlantCatalogId,
  speciesPlaceholder = "Search plant…",
  sizeLabel = "Size",
  className = "",
}: PlantSpeciesAndSizePickersProps) {
  const { speciesCode, sizeStr } = useMemo(
    () => deriveSpeciesCodeAndSize(fullCatalog, plantCatalogId),
    [fullCatalog, plantCatalogId],
  );

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selectedSpecies = useMemo(
    () => speciesRows.find((p) => p.catalogCode === speciesCode) ?? null,
    [speciesRows, speciesCode],
  );

  const filteredSpecies = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return speciesRows;
    return speciesRows.filter((p) => {
      const fields = [
        p.commonName,
        p.name,
        p.scientificName,
        p.catalogCode,
      ]
        .filter((s): s is string => Boolean(s?.trim()))
        .map((s) => s.trim().toLowerCase());
      return fields.some((field) => field.startsWith(q));
    });
  }, [speciesRows, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function pickSpecies(p: PlantCatalogEntry) {
    const code = p.catalogCode?.trim() ?? "";
    if (!code) return;
    onChangePlantCatalogId(buildSpeciesPendingCatalogId(code));
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(filteredSpecies.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = filteredSpecies[highlight];
      if (p) pickSpecies(p);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const displaySpecies = selectedSpecies?.name ?? "";

  return (
    <div
      className={`grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_10rem] md:items-end ${className}`}
    >
      <div ref={rootRef} className="relative min-w-0 flex-1">
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 md:hidden">
          Plant
        </label>
        <div
          className={`flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm transition focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 dark:border-slate-700 dark:bg-[#0B1120] ${
            disabled ? "opacity-50" : ""
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
              placeholder={speciesPlaceholder}
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
              {displaySpecies ? (
                <span className="text-gray-900 dark:text-white">
                  {displaySpecies}
                </span>
              ) : (
                <span className="text-gray-400 dark:text-slate-500">
                  {speciesPlaceholder}
                </span>
              )}
            </button>
          )}
          {selectedSpecies && !disabled ? (
            <button
              type="button"
              onClick={() => onChangePlantCatalogId("")}
              className="rounded p-0.5 text-gray-400 transition hover:text-gray-700 dark:text-slate-500 dark:hover:text-slate-300"
              aria-label="Clear plant"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        {open && !disabled ? (
          <div className="catalog-combobox-scroll absolute z-[100] mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#151E32]">
            {filteredSpecies.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-gray-500 dark:text-slate-500">
                No plants match &ldquo;{query}&rdquo;
              </div>
            ) : (
              <ul className="py-1 text-sm">
                {filteredSpecies.map((p, idx) => {
                  const active = idx === highlight;
                  return (
                    <li key={p.catalogCode ?? p.id}>
                      <button
                        type="button"
                        onMouseEnter={() => setHighlight(idx)}
                        onClick={() => pickSpecies(p)}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                          active
                            ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-600/20 dark:text-emerald-300"
                            : "text-gray-800 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-700/50"
                        }`}
                      >
                        {p.imagePublicPath ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.imagePublicPath}
                            alt=""
                            className="h-6 w-6 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <span className="inline-block h-6 w-6 shrink-0 rounded bg-gray-200 dark:bg-slate-700" />
                        )}
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {p.name}
                          </span>
                          {p.scientificName ? (
                            <span className="ml-1 text-xs italic text-gray-500 dark:text-slate-500">
                              {p.scientificName}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      <div className="w-full shrink-0">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500">
          {sizeLabel}
        </label>
        <select
          className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-[#0B1120] dark:text-white"
          disabled={disabled || !speciesCode}
          value={sizeStr}
          onChange={(e) => {
            const v = e.target.value;
            if (!speciesCode || !v) {
              if (speciesCode) {
                onChangePlantCatalogId(
                  buildSpeciesPendingCatalogId(speciesCode),
                );
              }
              return;
            }
            const inches = Number(v);
            const row = findPlantCatalogVariant(
              fullCatalog,
              speciesCode,
              inches,
            );
            if (row) onChangePlantCatalogId(row.id);
            else {
              onChangePlantCatalogId(
                buildPlantVariantCatalogId(speciesCode, inches),
              );
            }
          }}
        >
          <option value="">—</option>
          {CANONICAL_POT_SIZES_INCHES.map((n) => (
            <option key={n} value={n}>{`${n}"`}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
