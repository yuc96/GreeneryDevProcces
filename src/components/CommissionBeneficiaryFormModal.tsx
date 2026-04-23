"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiJson } from "@/lib/api";
import type { CommissionBeneficiary } from "@/lib/types";
import { toErrorMessage } from "@/lib/to-error-message";

export interface CommissionBeneficiaryFormModalProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  /** Called after a successful POST; modal closes automatically. */
  onSaved?: (row: CommissionBeneficiary) => void;
}

export function CommissionBeneficiaryFormModal({
  open,
  title = "New commission beneficiary",
  onClose,
  onSaved,
}: CommissionBeneficiaryFormModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = useCallback(() => {
    setName("");
    setPhone("");
    setEmail("");
    setErr(null);
  }, []);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const created = await apiJson<CommissionBeneficiary>(
        "/commission-beneficiaries",
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim() || undefined,
          }),
        },
      );
      onSaved?.(created);
      onClose();
    } catch (e) {
      setErr(toErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="commission-beneficiary-modal-title"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2
            id="commission-beneficiary-modal-title"
            className="text-lg font-bold text-[#2b7041] dark:text-emerald-400"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mb-5 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-950/50">
          <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
            They will show up in proposal commission dropdowns. Stored in{" "}
            <code className="rounded bg-white px-1 text-[10px] dark:bg-gray-900">
              data/commission-beneficiaries.json
            </code>
            .
          </p>
        </div>

        {err ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {err}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4">
          <fieldset className="space-y-3 rounded-lg border border-gray-100 p-3 dark:border-gray-800">
            <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Contact
            </legend>
            <label className="block text-sm font-medium text-gray-800 dark:text-gray-200">
              Full name
              <input
                required
                autoFocus
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-950"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium text-gray-800 dark:text-gray-200">
              Email
              <input
                required
                type="email"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-950"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium text-gray-800 dark:text-gray-200">
              Phone <span className="font-normal text-gray-500">(optional)</span>
              <input
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-950"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
          </fieldset>
          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold dark:border-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-[#2b7041] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#235a37] disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save to directory"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
