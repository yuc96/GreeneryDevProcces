"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { CommissionBeneficiaryFormModal } from "@/components/CommissionBeneficiaryFormModal";
import { apiGet, apiJson } from "@/lib/api";
import type { CommissionBeneficiary } from "@/lib/types";
import { toErrorMessage } from "@/lib/to-error-message";

export default function AdminCommissionBeneficiariesPage() {
  const [rows, setRows] = useState<CommissionBeneficiary[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const reload = useCallback(async () => {
    const list = await apiGet<CommissionBeneficiary[]>(
      "/commission-beneficiaries",
    );
    setRows(list);
  }, []);

  useEffect(() => {
    void reload().catch((e) => setErr(toErrorMessage(e)));
  }, [reload]);

  async function onDelete(id: string) {
    if (!window.confirm("Delete this beneficiary from the catalog?")) return;
    setBusy(true);
    setErr(null);
    try {
      await apiJson(`/commission-beneficiaries/${id}`, { method: "DELETE" });
      await reload();
    } catch (e) {
      setErr(toErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-[#2b7041] dark:text-emerald-400">
            Commission beneficiaries
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#2b7041] px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#235a37]"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add beneficiary
            </button>
            <Link
              href="/admin/pricing"
              className="text-sm font-semibold text-[#2b7041] underline dark:text-emerald-400"
            >
              ← Pricing
            </Link>
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Records are stored in{" "}
          <code className="rounded bg-gray-200 px-1 text-xs dark:bg-gray-800">
            data/commission-beneficiaries.json
          </code>
          . Use the <strong>Add beneficiary</strong> button to open the form in
          a modal on this same screen.
        </p>

        {err ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {err}
          </div>
        ) : null}

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">
            Catalog ({rows.length})
          </h2>
          {rows.length === 0 ? (
            <p className="text-sm text-gray-500">
              No records yet. Click{" "}
              <span className="font-semibold">Add beneficiary</span>.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-start justify-between gap-2 py-3"
                >
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">
                      {r.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {r.phone ?? "—"} · {r.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDelete(r.id)}
                    className="shrink-0 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <CommissionBeneficiaryFormModal
        open={createModalOpen}
        title="New commission beneficiary"
        onClose={() => setCreateModalOpen(false)}
        onSaved={() => void reload()}
      />
    </div>
  );
}
