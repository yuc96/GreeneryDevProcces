"use client";

import Link from "next/link";
import { Eye, Plus, Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import type { ProposalsListResponse, ProposalListSummaryRow } from "@/lib/types";
import { toErrorMessage } from "@/lib/to-error-message";

const PRIMARY_CLASS =
  "bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-md shadow-emerald-900/25 hover:from-emerald-400 hover:to-emerald-500";

function formatUsDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function statusBadge(status: string) {
  const base =
    "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide";
  switch (status) {
    case "approved":
      return `${base} bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200`;
    case "pending_approval":
      return `${base} bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200`;
    case "rejected":
      return `${base} bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200`;
    case "draft":
    default:
      return `${base} bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200`;
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending_approval":
      return "Submitted";
    case "approved":
      return "Accepted";
    case "rejected":
      return "Rejected";
    case "draft":
    default:
      return "Draft";
  }
}

export function ProposalsListClient() {
  const [rows, setRows] = useState<ProposalListSummaryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiGet<ProposalsListResponse>("/proposals");
      setRows(res.proposals ?? []);
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Proposals &amp; Quotes
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Create and manage indoor plant proposals.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/pricing?returnTo=${encodeURIComponent("/maintenance/proposals")}`}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
            >
              <Settings className="h-4 w-4" strokeWidth={2} aria-hidden />
              Proposal settings
            </Link>
            <Link
              href="/maintenance/proposals/new"
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white shadow-sm ${PRIMARY_CLASS}`}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              New Proposal
            </Link>
          </div>
        </div>

        {error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        ) : null}

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50/80 text-xs font-bold uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3">Number</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-gray-500 dark:text-gray-400"
                    >
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-gray-500 dark:text-gray-400"
                    >
                      No proposals yet. Click &quot;New proposal&quot; to start.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-gray-100 dark:border-gray-800"
                    >
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-900 dark:text-white">
                        {r.number}
                      </td>
                      <td className="px-4 py-3 text-gray-800 dark:text-gray-200">
                        {r.clientName}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        {r.locationName}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        {formatUsDate(r.updatedAt)}
                      </td>
                      <td className="px-4 py-3 text-gray-400 dark:text-gray-500">
                        —
                      </td>
                      <td className="px-4 py-3">
                        <span className={statusBadge(r.status)}>
                          {statusLabel(r.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/maintenance/proposals/new?proposalId=${encodeURIComponent(r.id)}&wizardStep=${r.status === "approved" ? 5 : 0}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
