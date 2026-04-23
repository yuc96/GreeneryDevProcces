"use client";

import { Printer } from "lucide-react";

type PrintBarProps = {
  /** When true, shows a short “Print” label next to the icon (e.g. standalone client page). */
  showLabel?: boolean;
};

export function PrintBar({ showLabel = false }: PrintBarProps) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#2b7041] text-sm font-bold text-white shadow-sm transition hover:bg-[#245838] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2b7041]/50 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 ${
        showLabel ? "px-3 py-2.5" : "h-10 w-10 p-0"
      }`}
      aria-label="Print or save as PDF"
      title="Print or save as PDF"
    >
      <Printer className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
      {showLabel ? <span>Print</span> : null}
    </button>
  );
}
