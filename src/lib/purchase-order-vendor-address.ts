/** Canonical pick-up address for Home Depot (Orlando) on purchase orders. */
export const HOME_DEPOT_PICKUP_ADDRESS =
  "6130 E Colonial Dr, Orlando, FL 32807, Estados Unidos";

function normalizeVendorLabel(name: string): string {
  return name
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function isHomeDepotVendorName(name: string): boolean {
  const n = normalizeVendorLabel(name);
  return n === "home depot" || n === "the home depot";
}

/** Address shown in PO “Supplier address” column; Home Depot always uses the store above. */
export function vendorPickupAddressForPo(
  vendorName: string,
  vendorAddress: string,
): string {
  if (isHomeDepotVendorName(vendorName)) return HOME_DEPOT_PICKUP_ADDRESS;
  const a = vendorAddress?.trim();
  return a || "—";
}
