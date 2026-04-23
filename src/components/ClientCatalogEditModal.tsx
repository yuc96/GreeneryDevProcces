"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiJson } from "@/lib/api";
import type { Client } from "@/lib/types";
import { toErrorMessage } from "@/lib/to-error-message";

export interface ClientCatalogEditModalProps {
  open: boolean;
  client: Client | null;
  onClose: () => void;
  onSaved?: (row: Client) => void;
}

export function ClientCatalogEditModal({
  open,
  client,
  onClose,
  onSaved,
}: ClientCatalogEditModalProps) {
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyContact, setCompanyContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const hydrate = useCallback(() => {
    if (!client) return;
    setCompanyName(client.companyName ?? "");
    setContactName(client.contactName ?? "");
    setEmail(client.email ?? "");
    setPhone(client.phone ?? "");
    setCompanyPhone(client.companyPhone ?? "");
    setCompanyContact(client.companyContact ?? "");
    setErr(null);
  }, [client]);

  useEffect(() => {
    if (open && client) hydrate();
  }, [open, client, hydrate]);

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

  if (!open || !client) return null;

  const editingClient = client;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const updated = await apiJson<Client>(`/clients/${editingClient.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          companyName: companyName.trim(),
          contactName: contactName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          companyPhone: companyPhone.trim(),
          companyContact: companyContact.trim(),
        }),
      });
      onSaved?.(updated);
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
        aria-labelledby="client-catalog-edit-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2
            id="client-catalog-edit-title"
            className="text-lg font-bold text-[#2b7041] dark:text-emerald-400"
          >
            Edit client catalog
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
        <p className="mb-4 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
          Changes are saved to the database and apply to all proposals that use
          this client.
        </p>

        {err ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {err}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-sm font-medium text-gray-800 dark:text-gray-200">
            Company name
            <input
              required
              autoFocus
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-950"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </label>
          <label className="block text-sm font-medium text-gray-800 dark:text-gray-200">
            Contact person name
            <input
              required
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-950"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
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
            Direct phone{" "}
            <span className="font-normal text-gray-500">(contact)</span>
            <input
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-950"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 407-555-0111"
            />
          </label>
          <label className="block text-sm font-medium text-gray-800 dark:text-gray-200">
            Main company line
            <input
              required
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-950"
              value={companyPhone}
              onChange={(e) => setCompanyPhone(e.target.value)}
              placeholder="e.g. 407-555-0100"
            />
          </label>
          <label className="block text-sm font-medium text-gray-800 dark:text-gray-200">
            Company contact
            <textarea
              required
              rows={2}
              className="mt-1 w-full resize-y rounded-lg border border-gray-200 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-950"
              value={companyContact}
              onChange={(e) => setCompanyContact(e.target.value)}
              placeholder="Reception, department, or who answers the main line"
            />
          </label>

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
              {busy ? "Saving…" : "Save client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
