/**
 * One-off importer: parses the JSC WH2 Professional Pricelist xlsx
 * and writes src/data/pots-catalog.json with a canonical pot-catalog schema.
 * Run: node scripts/import-jsc-pots.mjs
 */
import XLSX from "xlsx";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const xlsxPath = join(root, "JSC WH2 PROFESSIONAL Pricelist 2025_2026.xlsx");
const outPath = join(root, "src/data/pots-catalog.json");

const wb = XLSX.readFile(xlsxPath);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

/** Return the first numeric inch value found in an "Exterior Size" cell. */
function parseSizeInches(raw) {
  if (raw == null) return null;
  const s = String(raw);
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** Prettify the raw description so the UI can show a clean name. */
function prettifyName(desc) {
  if (!desc) return "";
  let n = String(desc).trim();
  // Strip trailing "Nnn.nnTwo each", "xxx combined w/ item # xxxxx" type suffixes
  n = n.replace(/\s+\d{2,}\.\d+.*$/, "").trim();
  n = n.replace(/\s+combined w\/ item.*$/i, "").trim();
  n = n.replace(/\s+-\s*requires.*$/i, "").trim();
  n = n.replace(/\s+\(optional\).*$/i, "").trim();
  return n;
}

/** Split a product into kind (Planter | Saucer | Interior Shelf | Accessory) + product family label. */
function classifyProduct(desc) {
  if (!desc) return { kind: "Planter", baseName: "" };
  const s = String(desc);
  if (/^SAUCER\b/i.test(s)) {
    const m = s.match(/SAUCER FOR\s+(.*?)(?:\s+PLANTER|\s*$)/i);
    return {
      kind: "Saucer",
      baseName: m ? m[1].trim() : prettifyName(s).replace(/^SAUCER\s+/i, ""),
    };
  }
  if (/^INTERIOR SHELF\b/i.test(s)) {
    const m = s.match(/INTERIOR SHELF\s*-\s*(.*?)(?:\s*$)/i);
    return { kind: "Interior Shelf", baseName: m ? prettifyName(m[1]) : "" };
  }
  if (/\bPLANTER\b/i.test(s)) {
    const pretty = prettifyName(s).replace(/\s+PLANTER\s*$/i, "");
    return { kind: "Planter", baseName: pretty };
  }
  return { kind: "Accessory", baseName: prettifyName(s) };
}

const HEADER_REGEX = /^\s*(RECTANGLE|ROUND|SQUARE|TALL|CONICAL|BOWL|CYLINDRICAL|TAPERED|OVAL|HEXAGON)\b.*PLANTERS?\s*$/i;

const catalog = [];
let currentFamily = "Unknown";
let sectionCount = 0;

for (let i = 0; i < rows.length; i++) {
  const r = rows[i] ?? [];
  const [, a, b, c, d, e, f] = r;

  if (r.every((x) => x == null)) continue;
  if (a === "Item" && b === "Description") continue;

  const cellA = typeof a === "string" ? a.trim() : "";
  const rest = [b, c, d, e, f].every((x) => x == null || x === "");
  if (cellA && rest && HEADER_REGEX.test(cellA)) {
    currentFamily = cellA
      .replace(/\s+/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
    sectionCount++;
    continue;
  }

  if (typeof f !== "number" || f <= 0) continue;
  if (typeof a !== "string" && typeof a !== "number") continue;

  const sku = String(a).trim();
  const description = typeof b === "string" ? b.trim() : "";
  const { kind, baseName } = classifyProduct(description);
  const cleanName = prettifyName(description);
  const sizeInches = parseSizeInches(c);

  catalog.push({
    id: `jsc-${sku}`,
    sku,
    family: currentFamily,
    kind,
    baseName,
    name: cleanName || baseName || sku,
    exteriorSize: typeof c === "string" ? c.trim() : c == null ? null : String(c),
    interiorOpening:
      typeof d === "string" ? d.trim() : d == null ? null : String(d),
    sizeInches,
    mapPrice: typeof e === "number" ? Number(e.toFixed(2)) : null,
    wholesalePrice: Number(f.toFixed(2)),
    source: "JSC WH2 PROFESSIONAL Pricelist 2025_2026",
  });
}

catalog.sort((x, y) => {
  if (x.family !== y.family) return x.family.localeCompare(y.family);
  if (x.kind !== y.kind) return x.kind.localeCompare(y.kind);
  const xs = x.sizeInches ?? 0;
  const ys = y.sizeInches ?? 0;
  if (xs !== ys) return xs - ys;
  return x.sku.localeCompare(y.sku);
});

const payload = {
  generatedAt: new Date().toISOString(),
  source: "JSC WH2 PROFESSIONAL Pricelist 2025_2026.xlsx",
  sheet: wb.SheetNames[0],
  families: Array.from(new Set(catalog.map((p) => p.family))).sort(),
  pots: catalog,
};

writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
console.log(
  `Wrote ${outPath}: ${catalog.length} pots across ${sectionCount} sections (${payload.families.join(" · ")})`,
);
