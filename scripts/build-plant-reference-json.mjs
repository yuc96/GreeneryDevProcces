/**
 * One-off generator: writes src/data/plant-reference-images.json
 * Run: node scripts/build-plant-reference-json.mjs
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const withImg = [
  ["A", "SELECTION_C", "Bamboo Palm", "Chamaedorea 'Florida hybrid'"],
  ["B", "SELECTION_C", "Kentia Palm", "Howea forsteriana"],
  ["C", "SELECTION_C", "Emerald Beauty", "Aglaonema 'Emerald Beauty'"],
  ["D", "SELECTION_C", "Arrowhead", "Nephthytis 'White Butterfly'"],
  ["E", "SELECTION_C", "Silver Queen", "Aglaonema 'Silver Queen'"],
  ["F", "SELECTION_C", "Silver Bay", "Aglaonema 'Silver Bay'"],
  ["G", "SELECTION_C", "Aspidistra", "Aspidistra elatior"],
  ["H", "SELECTION_C", "Spath Sensation", "Spathiphyllum 'Sensation'"],
  ["I", "SELECTION_C", "Corn Plant", "Dracaena fragrans 'massangeana'"],
  ["J", "SELECTION_C", "Golden Pothos", "Epipremnum aureum"],
  ["K", "SELECTION_C", "Aglaonema (catalog varieties)", "Aglaonema spp."],
  ["L", "SHEET_2", "Jade Pothos", "Epipremnum aureum 'Jade'"],
  ["M", "SHEET_2", "Janet Craig", "Dracaena deremensis 'Janet Craig'"],
  ["N", "SHEET_2", "Janet Craig Compacta", "Dracaena deremensis"],
  ["O", "SHEET_2", "Snake Plant", "Sansevieria trifasciata laurentii"],
  ["P", "SHEET_2", "Warneckei", "Dracaena deremensis 'Warneckei'"],
  ["Q", "SHEET_2", "Natal Mahogany", "Trichilia dregeana"],
  ["R", "SHEET_2", "Areca Palm", "Chrysalidocarpus lutescens"],
  ["S", "SHEET_2", "Arboricola tree", "Schefflera arboricola"],
  ["T", "SHEET_2", "Bromeliads", "Bromeliaceae"],
  ["U", "SHEET_2", "Chicken Gizzard", "Polyscias balfouriana"],
  ["V", "SHEET_2", "Color Bowl", "Assorted flowering"],
  ["W", "SHEET_2", "Croton", "Codiaeum variegatum 'Petra'"],
  ["X", "SHEET_3", "Dracaena Lisa", "Dracaena deremensis 'Lisa'"],
  ["Y", "SHEET_3", "Emerald Gem", "Homalomena"],
  ["Z", "SHEET_3", "Exotic Marginata", "Dracaena marginata"],
  ["AA", "SHEET_3", "Ficus Nitida", "Ficus retusa nitida"],
  ["BB", "SHEET_3", "Fishtail Palm", "Caryota mitis"],
  ["CC", "SHEET_3", "Lady Jane", "Anthurium scherzerianum"],
  ["DD", "SHEET_3", "Ming Aralia", "Polyscias fruticosa"],
  ["EE", "SHEET_3", "Michiko Cane", "Dracaena deremensis"],
  ["FF", "SHEET_3", "Neanthe Bella Palm", "Chamaedorea elegans"],
  ["GG", "SHEET_3", "Algerian Ivy", "Hedera canariensis"],
  ["HH", "SHEET_3", "Norfolk Island Pine", "Araucaria heterophylla"],
  ["II", "SHEET_3", "Oak Ivy", "Cissus rhombifolia"],
  ["JJ", "SHEET_4", "Orchids", "Phalaenopsis"],
  ["KK", "SHEET_4", "Pigmy Date Palm", "Phoenix roebelenii"],
  ["LL", "SHEET_4", "Ponytail Palm", "Beaucarnea recurvata"],
  ["MM", "SHEET_4", "Rhapis Palm", "Rhapis excelsa"],
  ["NN", "SHEET_4", "Reflexa", "Pleomele reflexa"],
  ["OO", "SHEET_4", "Schefflera Amate", "Brassaia actinophylla"],
  ["PP", "SHEET_4", "Totem Pothos", "Epipremnum aureum"],
  ["QQ", "SHEET_4", "White Bird Paradise", "Strelitzia nicolai"],
  ["RR", "SHEET_4", "Xanadu", "Philodendron xanadu"],
  ["SS", "SHEET_4", "Yucca", "Yucca elephantipes"],
  ["TT", "SHEET_4", "ZZ Plant", "Zamioculcas zamiifolia"],
  ["UU", "SHEET_4", "King Maya Palm", "Chamaedorea Hooperiana"],
  ["VV", "SELECTION_GUIDE", "Adonidia Palm", "Adonidia merrillii"],
  ["WW", "SELECTION_GUIDE", "Buddhist Pine", "Podocarpus gracilior"],
  ["XX", "SELECTION_GUIDE", "Black Olive", "Bucida buceras"],
  ["YY", "SELECTION_GUIDE", "Cactus group", "Cactaceae"],
  ["ZZ", "SELECTION_GUIDE", "False Aralia", "Dizygotheca elegantissima"],
  ["AAA", "SELECTION_GUIDE", "Ficus Alii", "Ficus binnendijkii 'Alii'"],
  ["BBB", "SELECTION_GUIDE", "Ficus Midnight", "Ficus benjamina 'midnight'"],
  ["CCC", "SELECTION_GUIDE", "Fiddle Leaf Fig", "Ficus lyrata"],
  ["DDD", "SELECTION_GUIDE", "King Sago", "Cycas revoluta"],
];

const noImg = [
  ["EEE", "SELECTION_GUIDE", "Marginata Tricolor", "Dracaena marginata"],
  ["FFF", "SELECTION_GUIDE", "Triangle Palm", "Neodypsis decaryi"],
  ["GGG", "SELECTION_GUIDE", "Washingtonia Palm", "Washingtonia filifera"],
];

const plants = [
  ...withImg.map(([catalogCode, selectionSheet, commonName, scientificName]) => ({
    catalogCode,
    selectionSheet,
    commonName,
    scientificName,
    imageFile: `${catalogCode}.png`,
    imagePublicPath: `/plants/reference/${catalogCode}.png`,
  })),
  ...noImg.map(([catalogCode, selectionSheet, commonName, scientificName]) => ({
    catalogCode,
    selectionSheet,
    commonName,
    scientificName,
    imageFile: null,
    imagePublicPath: null,
  })),
];

const doc = {
  version: 1,
  notes:
    "Greenery selection catalog. 56 PNGs in /public/plants/reference/{code}.png; filenames assigned from Plant Images (sorted). Verify visual match and swap files as needed. EEE/FFF/GGG: add images later.",
  plants,
};

writeFileSync(
  join(root, "src/data/plant-reference-images.json"),
  JSON.stringify(doc, null, 2),
  "utf8",
);
console.log("Wrote plant-reference-images.json, plants:", plants.length);
