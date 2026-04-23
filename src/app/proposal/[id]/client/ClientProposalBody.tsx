"use client";

import { useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import type { SummaryResponse } from "@/lib/types";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function displayPlantLabel(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim() || name;
}

function potSizeFromName(name: string): string {
  const m = name.match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : "—";
}

function rotationMonthlyBilled(r: {
  monthlyBilled?: number;
  costPerRotation?: number;
  frequencyMultiplier?: number;
}): number {
  if (r.monthlyBilled != null && Number.isFinite(r.monthlyBilled)) {
    return r.monthlyBilled;
  }
  if (
    r.costPerRotation != null &&
    r.frequencyMultiplier != null &&
    Number.isFinite(r.costPerRotation) &&
    Number.isFinite(r.frequencyMultiplier)
  ) {
    return (r.costPerRotation * r.frequencyMultiplier) / 12;
  }
  return 0;
}

function maintenanceProgramLabel(
  tier: SummaryResponse["proposal"]["maintenanceTier"],
): string {
  if (tier === "tier_1") return "Tier 1";
  if (tier === "tier_2") return "Tier 2";
  return "Tier 3";
}

/** Same-origin paths or absolute URLs for proposal photos (data URLs are most common). */
function clientProposalPhotoSrc(src: string): string {
  const t = src.trim();
  if (
    t.startsWith("data:") ||
    t.startsWith("http:") ||
    t.startsWith("https:") ||
    t.startsWith("blob:")
  ) {
    return t;
  }
  if (typeof window !== "undefined") {
    try {
      return new URL(t, window.location.origin).href;
    } catch {
      return t;
    }
  }
  return t;
}

function PlantPhotoThumb({
  src,
  alt,
  badge,
}: {
  src: string;
  alt: string;
  badge?: string;
}) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- data URLs from builder or same-origin catalog paths */}
      <img
        src={clientProposalPhotoSrc(src)}
        alt={alt}
        className="plant-card-photo"
        loading="lazy"
      />
      {badge ? (
        <span className="plant-photo-grid-badge" aria-hidden="true">
          {badge}
        </span>
      ) : null}
    </>
  );
}

function plantPhotoGroupMeta(
  row: SummaryResponse["items"][number],
  includeArea: boolean,
): string {
  const size = potSizeFromName(row.name);
  const parts = [`${size} × ${row.qty}`];
  if (includeArea && row.area?.trim()) parts.push(row.area.trim());
  return parts.join(" · ");
}

function PlantPhotoGroup({
  row,
  includeAreaInMeta,
}: {
  row: SummaryResponse["items"][number];
  includeAreaInMeta: boolean;
}) {
  if (row.category !== "plant") return null;
  const label = displayPlantLabel(row.name);
  const meta = plantPhotoGroupMeta(row, includeAreaInMeta);
  const userPhotos = row.photos ?? [];

  if (userPhotos.length === 0) {
    return (
      <div className="plant-photo-group plant-photo-group--text-only">
        <p className="plant-photo-group-title">{label}</p>
        <p className="plant-photo-group-meta">{meta}</p>
      </div>
    );
  }

  return (
    <div className="plant-photo-group">
      <div className="plant-photo-group-header">
        <p className="plant-photo-group-title">{label}</p>
        <p className="plant-photo-group-meta">{meta}</p>
      </div>
      <div
        className={`plant-photo-grid${
          userPhotos.length === 1 ? " plant-photo-grid--single" : ""
        }`}
      >
        {userPhotos.map((src, i) => (
          <figure key={`u-${i}`} className="plant-photo-grid-cell">
            <PlantPhotoThumb
              src={src}
              alt={`${label}, site photo ${i + 1}`}
            />
            <figcaption className="plant-photo-grid-caption">
              {`Photo ${i + 1}`}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

const TERMS_PARAGRAPHS = [
  `Greenery Productions must have access to the client's premises during normal working hours. Moving of foliage plants without prior approval is prohibited and voids the guarantee replacement. Interior foliage plants other than large specimen plants in excess of 6' in height will be replaced free of charge under the maintenance guarantee agreement. Exterior plants are covered on a maintenance program where applicable.`,
  `The client will be responsible for plants damaged by cleaning chemicals, changes in initial light readings, gases, and plants that are stolen, missing, overwatered, or damaged by patrons or employees at the maintenance location.`,
  `Prices quoted are for one year and automatically renew on each anniversary date unless the client sends written cancellation 30 days before the renewal date.`,
  `Acceptance of proposal: The above prices, specifications, and conditions are satisfactory and we hereby accept. Greenery Productions is authorized to do the work as specified. Payment will be made as outlined above. All sums payable under this contract are payable at 1751 Director's Row, Orlando, FL 32809. All guarantees and services will terminate at Greenery Productions' option thirty days after the first of the month if payment is not received.`,
  `In the event of default by the client, Greenery Productions shall be entitled to recover all reasonable costs of collections, including attorney fees. In the event of cancellation prior to the termination date, Greenery Productions requires 30 days' notice in writing and the client will be responsible for paying the remaining agreement amount. By signing this agreement, the client agrees to all services listed above. This agreement shall be governed by and construed according to the laws of the State of Florida.`,
  `Convenience Fee — Our pricing includes a 2% discount; the discount will be rescinded if this invoice is paid with a credit card.`,
];

export function ClientProposalBody({ data }: { data: SummaryResponse }) {
  const rootRef = useRef<HTMLDivElement>(null);

  /**
   * Flex layouts (AppShell, wizard) use overflow + flex-1 + min-h-0 so the
   * screen scrolls inside main; browsers often keep that clip for print/PDF.
   * Before print, relax overflow/size on ancestors so the full document paginates.
   */
  useEffect(() => {
    const stylePatches = new Map<HTMLElement, Set<string>>();

    function patchImportant(el: HTMLElement, prop: string, value: string) {
      if (!stylePatches.has(el)) stylePatches.set(el, new Set());
      stylePatches.get(el)!.add(prop);
      el.style.setProperty(prop, value, "important");
    }

    function restoreAfterPrint() {
      stylePatches.forEach((props, el) => {
        props.forEach((p) => el.style.removeProperty(p));
      });
      stylePatches.clear();
    }

    function releaseForPrint() {
      restoreAfterPrint();
      let cur: HTMLElement | null = rootRef.current?.parentElement ?? null;
      while (cur && cur !== document.documentElement) {
        patchImportant(cur, "overflow", "visible");
        patchImportant(cur, "max-height", "none");
        const tag = cur.tagName;
        const cl = typeof cur.className === "string" ? cur.className : "";
        const flexish =
          tag === "MAIN" ||
          cl.includes("proposal-wizard-root") ||
          cl.includes("proposal-embed-shell") ||
          cl.includes("app-shell") ||
          /\bflex-1\b/.test(cl);
        if (flexish) {
          patchImportant(cur, "height", "auto");
          patchImportant(cur, "flex", "none");
          patchImportant(cur, "min-height", "0");
        }
        cur = cur.parentElement;
      }
      patchImportant(document.body, "overflow", "visible");
      patchImportant(document.documentElement, "overflow", "visible");
    }

    const mq = window.matchMedia("print");
    const onMq = () => {
      if (mq.matches) releaseForPrint();
      else restoreAfterPrint();
    };

    window.addEventListener("beforeprint", releaseForPrint);
    window.addEventListener("afterprint", restoreAfterPrint);
    mq.addEventListener("change", onMq);
    return () => {
      window.removeEventListener("beforeprint", releaseForPrint);
      window.removeEventListener("afterprint", restoreAfterPrint);
      mq.removeEventListener("change", onMq);
      restoreAfterPrint();
    };
  }, []);

  const plants = useMemo(
    () => data.items.filter((i) => i.category === "plant"),
    [data.items],
  );
  const pots = data.items.filter((i) => i.category === "pot");
  const totalPlantPhotos = plants.reduce(
    (n, p) => n + (p.photos?.length ?? 0),
    0,
  );
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const contact =
    data.client.contactName?.trim() ||
    data.proposal.contactName?.trim() ||
    "—";
  const submitted =
    data.proposal.submittedBy?.trim() || "—";
  const contactPhone = data.client.phone?.trim() || "—";
  const companyPhone = data.client.companyPhone?.trim() || "—";
  const companyContact =
    data.client.companyContact?.trim() || "—";
  const clientEmail = data.client.email?.trim() || "—";
  const jobLocation = data.location?.name || "—";

  return (
    <div
      ref={rootRef}
      className="proposal-html-root"
      data-proposal-doc="1"
    >
      <div className="page">
        <div className="proposal-print-main">
          <div className="header-border flex flex-wrap items-start justify-between gap-4">
            <div className="logo-container">
              {/* Same asset name as proposal-client.html */}
              <Image
                src="/greenery-director-chair-plant-removebg-preview.png"
                width={120}
                height={120}
                alt="Greenery Productions — director chair with plant"
                className="logo-icon"
                unoptimized
              />
              <div>
                <h1 className="text-xl font-bold leading-tight tracking-tight text-green-900">
                  GREENERY
                </h1>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                  Productions
                </p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="mb-2 text-2xl font-light text-gray-400">
                Proposal and Acceptance
              </h2>
              <div className="text-[11px] leading-tight">
                <p className="font-bold">1751 Director&apos;s Row</p>
                <p>Orlando, Florida 32809</p>
                <p>Phone: (407) 363-9111</p>
                <p>Fax: (407) 363-9331</p>
                <p className="italic text-green-700">
                  www.greeneryproductions.com
                </p>
              </div>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-8">
            <div>
              <div className="section-title mt-0">Proposal Submitted To</div>
              <div className="space-y-0.5">
                <p className="text-base font-bold text-green-800">
                  {data.client.name}
                </p>
                {data.location?.address ? (
                  <p className="text-[11px] text-gray-600">
                    {data.location.address}
                  </p>
                ) : null}
                <div className="pt-1">
                  <span className="text-[9px] font-bold uppercase text-gray-400">
                    Date:
                  </span>
                  <span className="ml-2 text-[11px]">{today}</span>
                </div>
              </div>
            </div>
            <div>
              <div className="section-title mt-0">Project Details</div>
              <div className="grid grid-cols-2 gap-y-0.5 text-[11px]">
                <span className="font-bold text-gray-500">Contact:</span>
                <span>{contact}</span>
                <span className="font-bold text-gray-500">Email:</span>
                <span>{clientEmail}</span>
                <span className="font-bold text-gray-500">Contact phone:</span>
                <span>{contactPhone}</span>
                <span className="font-bold text-gray-500">Company contact:</span>
                <span>{companyContact}</span>
                <span className="font-bold text-gray-500">Company phone:</span>
                <span>{companyPhone}</span>
                <span className="font-bold text-gray-500">Job Location:</span>
                <span>{jobLocation}</span>
                <span className="font-bold text-gray-500">Submitting By:</span>
                <span>{submitted}</span>
                <span className="font-bold text-gray-500">Proposal #:</span>
                <span>{data.proposal.number}</span>
                <span className="font-bold text-gray-500">
                  Maintenance program:
                </span>
                <span>
                  {maintenanceProgramLabel(data.proposal.maintenanceTier)}
                </span>
              </div>
            </div>
          </div>

          <div className="section-title">Interior Plant Schedule</div>
          <table className="doc-table">
            <thead>
              <tr>
                <th style={{ width: "40%" }}>Location / Area</th>
                <th style={{ width: "10%" }} className="text-center">
                  Qty
                </th>
                <th style={{ width: "35%" }}>Plant Schedule / Description</th>
                <th style={{ width: "15%" }} className="text-right">
                  Pot Size / Ht
                </th>
              </tr>
            </thead>
            <tbody>
              {plants.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-gray-500">
                    No plant schedule lines.
                  </td>
                </tr>
              ) : (
                plants.map((row) => (
                  <tr key={row.id}>
                    <td className="font-semibold">{row.area || "—"}</td>
                    <td className="text-center">{row.qty}</td>
                    <td>{displayPlantLabel(row.name)}</td>
                    <td className="text-right italic text-gray-500">
                      {potSizeFromName(row.name)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {pots.length > 0 ? (
            <>
              <div className="section-title">Planters &amp; Containers</div>
              <table className="doc-table">
                <thead>
                  <tr>
                    <th style={{ width: "40%" }}>Location / Area</th>
                    <th style={{ width: "10%" }} className="text-center">
                      Qty
                    </th>
                    <th style={{ width: "35%" }}>Description</th>
                    <th style={{ width: "15%" }} className="text-right">
                      Pot
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pots.map((row) => (
                    <tr key={row.id}>
                      <td className="font-semibold">{row.area || "—"}</td>
                      <td className="text-center">{row.qty}</td>
                      <td>{displayPlantLabel(row.name)}</td>
                      <td className="text-right text-[10px] text-gray-600">
                        {row.plantingWithoutPot
                          ? "Without pot"
                          : row.clientOwnsPot
                            ? "Client-owned"
                            : "Included"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}

          <div className="section-title mb-2">Reference imagery</div>
          <p className="mb-2 text-[10px] leading-snug text-gray-500">
            {totalPlantPhotos > 0
              ? "Site and reference photos for each plant line are included in Appendix A (Anexo A) at the end of this document. Labels match the Interior Plant Schedule."
              : "No photos were attached for plant lines in this proposal. Add images in the proposal wizard on the Plant Photos step if reference photos are required."}
          </p>

          <div className="client-breakdown mt-8 w-full">
            <table className="breakdown-table purchase-summary" aria-label="Purchase summary">
              <thead>
                <tr>
                  <th colSpan={2}>Purchase Summary</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    Plant and Planter Purchase, Including Materials, Supplies,
                    Labor, Delivery, Installation and Freight
                  </td>
                  <td className="amount font-semibold text-green-900">
                    {money.format(data.calculations.priceToClientInitial)}
                  </td>
                </tr>
              </tbody>
            </table>

            <table
              className="breakdown-table monthly-summary mt-5"
              aria-label="Monthly summary"
            >
              <thead>
                <tr>
                  <th colSpan={2}>Monthly Summary</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Guarantee Monthly Maintenance</td>
                  <td className="amount font-semibold text-green-900">
                    {money.format(data.calculations.maintenanceMonthly)}
                  </td>
                </tr>
                {data.rotations.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {displayPlantLabel(r.plantName)} Rotation ~ billed monthly
                    </td>
                    <td className="amount font-semibold text-green-900">
                      {money.format(rotationMonthlyBilled(r))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="payment-terms-bar mt-5">
              <strong>Payment Terms:</strong> 50% DUE UPON PROPOSAL ACCEPTANCE /
              50% DUE UPON PROJECT COMPLETION
            </div>
            <div className="tax-note-bar mt-2">
              Note: Prices do not include sales tax.
            </div>
          </div>

          <div className="terms-legal-full mt-8 w-full border-t border-gray-200 pt-6">
            <div className="section-title mt-0 mb-3">
              Terms &amp; Legal Conditions
            </div>
            {TERMS_PARAGRAPHS.slice(0, -1).map((p, idx) => (
              <p key={idx}>{p}</p>
            ))}
            <p className="font-semibold text-gray-900 not-italic">
              {TERMS_PARAGRAPHS[TERMS_PARAGRAPHS.length - 1]}
            </p>
          </div>
        </div>

        <div className="proposal-print-footer mt-8">
          <div className="grid grid-cols-2 gap-x-12">
            <div className="space-y-6">
              <div>
                <div className="signature-line" />
                <p className="mt-1 text-[8px] font-bold uppercase text-gray-400">
                  Signature of Acceptance
                </p>
              </div>
              <div>
                <div className="signature-line" />
                <p className="mt-1 text-[8px] font-bold uppercase text-gray-400">
                  Print Name
                </p>
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <div className="signature-line" />
                <p className="mt-1 text-[8px] font-bold uppercase text-gray-400">
                  Date
                </p>
              </div>
              <div>
                <div className="signature-line" />
                <p className="mt-1 text-[8px] font-bold uppercase text-gray-400">
                  P.O. Number
                </p>
              </div>
            </div>
          </div>
          <div className="mt-6 border-t pt-2 text-center">
            <p className="text-[8px] italic uppercase tracking-widest text-gray-300">
              Note: This proposal may be withdrawn by Greenery Productions if
              not accepted within 30 days.
            </p>
          </div>
        </div>

        <section
          className="proposal-appendix"
          aria-label="Appendix A reference photos"
        >
          <div className="proposal-appendix-header">
            <h2 className="proposal-appendix-title">
              Appendix A — Reference photos
            </h2>
            <p className="proposal-appendix-subtitle">
              Anexo A — Fotografías de referencia
            </p>
            <p className="proposal-appendix-intro">
              {totalPlantPhotos > 0
                ? "Images attached in the proposal builder (Plant Photos step), grouped by plant line. Same labels as the Interior Plant Schedule."
                : "No reference photos were attached for this proposal."}
            </p>
          </div>
          <div className="plant-gallery-wrap proposal-appendix-gallery w-full">
            <div
              className="plant-photo-groups-stack plant-photo-groups-stack--reference"
              aria-label="Plant reference photos"
            >
              {plants.length === 0 ? (
                <p className="text-center text-xs text-gray-400">
                  No plants in schedule.
                </p>
              ) : (
                plants.map((row) => (
                  <PlantPhotoGroup
                    key={row.id}
                    row={row}
                    includeAreaInMeta
                  />
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
