"use client";

export function PrintBar() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="shrink-0 rounded bg-green-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-green-700"
    >
      Print / Save PDF
    </button>
  );
}
