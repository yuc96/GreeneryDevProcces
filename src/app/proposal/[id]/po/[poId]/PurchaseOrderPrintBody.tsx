import type { PurchaseOrderPrintData } from "@/lib/types";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function categoryLabel(
  c: PurchaseOrderPrintData["purchaseOrder"]["items"][number]["category"],
): string {
  if (c === "plant") return "Plant";
  if (c === "pot") return "Pot";
  return "Staging";
}

function poKindTitle(
  kind: PurchaseOrderPrintData["purchaseOrder"]["kind"],
): string {
  return kind === "plants"
    ? "Purchase order — Plants"
    : "Purchase order — Pots & staging";
}

export function PurchaseOrderPrintBody({
  data,
}: {
  data: PurchaseOrderPrintData;
}) {
  const po = data.purchaseOrder;
  const created = new Date(po.createdAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="po-print-root">
      <div className="po-page">
        <header className="po-header">
          <div>
            <h1 className="po-title">{poKindTitle(po.kind)}</h1>
            <p className="po-sub">
              Internal purchasing. Order from each supplier below; install area is
              where the material is used on the client job. Supplier address is the
              source / pick-up location from the catalog line.
            </p>
          </div>
          <div className="po-meta-block">
            <strong>Greenery Productions</strong>
            <span>PO #{po.sequence}</span>
            <span>Ref proposal {data.proposalNumber}</span>
            <span>Issued {created}</span>
            <span className="po-meta-id">PO ID {po.id}</span>
          </div>
        </header>

        <div className="po-section">
          <h3>Client &amp; job site</h3>
          <p>
            <strong>Client:</strong> {data.clientName}
          </p>
          {data.jobSite ? (
            <p className="mt-1">
              <strong>Job site (installation):</strong> {data.jobSite.name}
              {data.jobSite.address ? ` — ${data.jobSite.address}` : ""}
            </p>
          ) : (
            <p className="mt-1">No job location on file.</p>
          )}
        </div>

        <div className="po-table-wrap">
          <table className="po-lines">
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>Type</th>
                <th>Install area</th>
                <th className="num">Qty</th>
                <th className="num">Unit cost</th>
                <th className="num">Line wholesale</th>
                <th>Supplier / grower</th>
                <th>Supplier address (buy / pick-up)</th>
              </tr>
            </thead>
            <tbody>
              {po.items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="po-empty-row">
                    No line items in this purchase order.
                  </td>
                </tr>
              ) : (
                po.items.map((it, i) => {
                  const lineWh = it.wholesaleCost * it.qty;
                  return (
                    <tr key={it.id}>
                      <td>{i + 1}</td>
                      <td>
                        <div>{it.name}</div>
                        <div className="po-muted-sm">
                          Catalog ID: {it.catalogId || "—"}
                        </div>
                      </td>
                      <td>{categoryLabel(it.category)}</td>
                      <td>{it.area?.trim() || "—"}</td>
                      <td className="num">{it.qty}</td>
                      <td className="num">{money.format(it.wholesaleCost)}</td>
                      <td className="num">{money.format(lineWh)}</td>
                      <td>
                        <div className="po-vendor">{it.vendorName}</div>
                      </td>
                      <td>
                        <div className="po-vendor-addr">{it.vendorAddress}</div>
                        {it.category === "plant" ? (
                          <div className="po-line-note">
                            {it.clientOwnsPot ? "Client-owned pot. " : null}
                            {it.requiresRotation
                              ? "Includes rotation program."
                              : null}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="po-totals">
          <span>Wholesale subtotal: {money.format(po.totals.wholesale)}</span>
        </div>

        <p className="po-footnote">
          Values mirror the approved proposal lines (wholesale and supplier from
          catalog). Confirm ship or pick-up with each vendor before payment.
        </p>
      </div>
    </div>
  );
}
