export function isRotationEligiblePlantName(name: string | null | undefined): boolean {
  const normalized = (name ?? "").toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("orchid") ||
    normalized.includes("annual") ||
    normalized.includes("mum")
  );
}
