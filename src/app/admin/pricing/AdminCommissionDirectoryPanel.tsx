"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, Phone, Plus, Trash2, Users } from "lucide-react";
import { CommissionBeneficiaryFormModal } from "@/components/CommissionBeneficiaryFormModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { apiGet, apiJson } from "@/lib/api";
import type { CommissionBeneficiary } from "@/lib/types";
import { toErrorMessage } from "@/lib/to-error-message";

const PRIMARY =
  "bg-[#2b7041] text-white shadow-sm hover:bg-[#235a37] dark:bg-emerald-700 dark:hover:bg-emerald-600";

export function AdminCommissionDirectoryPanel({
  embedded = false,
}: {
  /** When true, skip the large hero header (parent page already titles this tab). */
  embedded?: boolean;
}) {
  const [rows, setRows] = useState<CommissionBeneficiary[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const list = await apiGet<CommissionBeneficiary[]>(
      "/commission-beneficiaries",
    );
    setRows(list);
  }, []);

  useEffect(() => {
    void reload().catch((e) => setErr(toErrorMessage(e)));
  }, [reload]);

  const deleteTarget = deleteTargetId
    ? rows.find((r) => r.id === deleteTargetId)
    : undefined;

  async function executeDelete(id: string) {
    setBusy(true);
    setErr(null);
    try {
      await apiJson(`/commission-beneficiaries/${id}`, { method: "DELETE" });
      await reload();
      setDeleteTargetId(null);
    } catch (e) {
      setErr(toErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {!embedded ? (
        <header className="space-y-3 border-b border-gray-200 pb-8 dark:border-gray-800">
          <div className="flex flex-wrap items-start gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#2b7041] text-white shadow-md"
              aria-hidden
            >
              <Users className="h-7 w-7" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                Commission catalog
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                Add everyone who might receive commission on a proposal. When you
                build a quote, you pick from this list—nothing here affects freight
                or markup math.
              </p>
            </div>
          </div>
        </header>
      ) : null}

      <section
        aria-labelledby="commission-actions-heading"
        className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
      >
        <h2
          id="commission-actions-heading"
          className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
        >
          Add someone new
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Opens a short form (name, email, optional phone). They appear in proposal
          commission dropdowns immediately after saving.
        </p>
        <button
          type="button"
          onClick={() => setCreateModalOpen(true)}
          className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold transition sm:w-auto sm:min-w-[220px] ${PRIMARY}`}
        >
          <Plus className="h-5 w-5 shrink-0" strokeWidth={2.5} aria-hidden />
          Add person to directory
        </button>
      </section>

      {err ? (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {err}
        </div>
      ) : null}

      <section
        aria-labelledby="commission-catalog-heading"
        className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"
      >
        <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <h2
            id="commission-catalog-heading"
            className="text-lg font-bold text-gray-900 dark:text-white"
          >
            People in the directory
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {rows.length === 0
              ? "No one added yet—use the section above."
              : `${rows.length} ${rows.length === 1 ? "person" : "people"} available on proposals.`}
          </p>
        </div>

        <div className="p-5">
          {rows.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/80 px-6 py-12 text-center dark:border-gray-700 dark:bg-gray-950/50">
              <Users
                className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600"
                strokeWidth={1.5}
                aria-hidden
              />
              <p className="mt-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                Directory is empty
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
                Add salespeople, partners, or anyone who should be selectable when
                commission is enabled on a proposal.
              </p>
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                className={`mt-6 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold ${PRIMARY}`}
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add first person
              </button>
            </div>
          ) : (
            <ul className="space-y-3">
              {rows.map((r) => {
                const initial = (r.name.trim()[0] ?? "?").toUpperCase();
                return (
                  <li
                    key={r.id}
                    className="flex flex-col gap-4 rounded-xl border border-gray-100 bg-gray-50/50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:bg-gray-950/40"
                  >
                    <div className="flex min-w-0 flex-1 gap-3">
                      <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-base font-bold text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200"
                        aria-hidden
                      >
                        {initial}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-gray-900 dark:text-white">
                          {r.name}
                        </p>
                        <div className="mt-2 flex flex-col gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                          <span className="inline-flex items-center gap-2">
                            <Mail
                              className="h-3.5 w-3.5 shrink-0 text-gray-400"
                              aria-hidden
                            />
                            <span className="truncate">{r.email}</span>
                          </span>
                          <span className="inline-flex items-center gap-2">
                            <Phone
                              className="h-3.5 w-3.5 shrink-0 text-gray-400"
                              aria-hidden
                            />
                            <span>{r.phone?.trim() || "—"}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setDeleteTargetId(r.id)}
                        className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:bg-gray-900 dark:text-red-300 dark:hover:bg-red-950/40 sm:self-center"
                      >
                      <Trash2 className="h-4 w-4" aria-hidden />
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-gray-100 px-5 py-3 dark:border-gray-800">
          <p className="text-center text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
            Stored in{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] dark:bg-gray-800">
              data/commission-beneficiaries.json
            </code>
          </p>
        </div>
      </section>

      <CommissionBeneficiaryFormModal
        open={createModalOpen}
        title="Add person to commission directory"
        onClose={() => setCreateModalOpen(false)}
        onSaved={() => void reload()}
      />

      <ConfirmModal
        open={deleteTargetId !== null}
        title="Remove from directory?"
        variant="danger"
        confirmLabel="Remove"
        cancelLabel="Keep"
        busy={busy}
        onCancel={() => {
          if (!busy) setDeleteTargetId(null);
        }}
        onConfirm={() =>
          deleteTargetId ? executeDelete(deleteTargetId) : undefined
        }
        description={
          deleteTarget ? (
            <>
              <span className="font-semibold text-gray-900 dark:text-white">
                {deleteTarget.name}
              </span>{" "}
              will no longer appear in commission dropdowns on proposals. This
              does not change past proposals.
            </>
          ) : (
            "This entry will be removed from the commission directory."
          )
        }
      />
    </div>
  );
}
