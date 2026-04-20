"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { PlantCatalogEntry } from "@/lib/types";

interface PlantPickerProps {
  plants: PlantCatalogEntry[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Show the size suffix (e.g. "(14\"")") next to the plant name. */
  showSize?: boolean;
  className?: string;
}

/**
 * Searchable combobox for the plant catalog. Matches on common name,
 * scientific name, legacy A/B/C catalog code, and selection sheet via
 * the `searchKey` field pre-computed on the server.
 */
export function PlantPicker({
  plants,
  value,
  onChange,
  placeholder = "Search plant…",
  disabled = false,
  showSize = true,
  className = "",
}: PlantPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(
    () => plants.find((p) => p.id === value) ?? null,
    [plants, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return plants;
    return plants.filter((p) => {
      const key =
        p.searchKey ??
        `${p.name} ${p.commonName ?? ""} ${p.scientificName ?? ""} ${p.catalogCode ?? ""}`.toLowerCase();
      return key.includes(q);
    });
  }, [plants, query]);

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

  function pick(p: PlantCatalogEntry) {
    onChange(p.id);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = filtered[highlight];
      if (p) pick(p);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const displayLabel = selected
    ? showSize && selected.size
      ? `${selected.name} (${selected.size})`
      : selected.name
    : "";

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div
        className={`flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm shadow-sm focus-within:border-[#2b7041] dark:border-gray-700 dark:bg-gray-950 ${
          disabled ? "opacity-50" : ""
        }`}
      >
        <Search className="h-4 w-4 shrink-0 text-gray-400" />
        {open ? (
          <input
            ref={inputRef}
            autoFocus
            disabled={disabled}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setOpen(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="min-w-0 flex-1 truncate text-left text-sm text-gray-800 dark:text-gray-100"
          >
            {displayLabel || (
              <span className="text-gray-400">{placeholder}</span>
            )}
          </button>
        )}
        {selected && !disabled ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="rounded p-0.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
            aria-label="Clear selection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {open && !disabled ? (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-950">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-gray-500">
              No plants match &ldquo;{query}&rdquo;
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
                      onClick={() => pick(p)}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${
                        active
                          ? "bg-emerald-50 text-[#2b7041] dark:bg-emerald-950/50 dark:text-emerald-200"
                          : "text-gray-800 dark:text-gray-100"
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
                        <span className="inline-block h-6 w-6 shrink-0 rounded bg-gray-200 dark:bg-gray-800" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium">{p.name}</span>
                        {p.scientificName ? (
                          <span className="ml-1 text-xs italic text-gray-500">
                            {p.scientificName}
                          </span>
                        ) : null}
                      </span>
                      {showSize && p.size ? (
                        <span className="shrink-0 text-xs text-gray-500">
                          {p.size}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
