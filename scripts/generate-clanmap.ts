/**
 * Prépare le film de la carte pour le site, dans public/generated/carte/ :
 * les données compressées, le fond de carte et une image de la carte finale,
 * affichée sans JavaScript et avant le chargement du film.
 * Sans film collecté, rien n'est généré et la page affiche « Pas de données ».
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import sharp from "sharp";
import { clanRgb, decodeFrames } from "../src/lib/clanmap/codec";
import { parseEventLog } from "../src/lib/clanmap/collect";
import { encoderEtat, etatAuRelevé, etatConforme } from "../src/lib/clanmap/etat";
import { OFFICIAL_MAP, blendOwners, countLand } from "../src/lib/clanmap/terrain";
import { StoredClanMapFilm } from "../src/lib/schemas";

const source = join("data", "clanmap");
const out = join("public", "generated", "carte");
rmSync(out, { recursive: true, force: true });

const paths = { json: join(source, "film.json"), bin: join(source, "film.bin"), terrain: join(source, "terrain.webp") };
if (!existsSync(paths.json) || !existsSync(paths.bin) || !existsSync(paths.terrain)) {
  console.log("Carte : aucun film collecté, page sans film.");
  process.exit(0);
}

const json = readFileSync(paths.json, "utf8");
const film = StoredClanMapFilm.parse(JSON.parse(json));
const bin = readFileSync(paths.bin);
// Un film incohérent arrête le build : mieux vaut le site précédent qu'un film faux.
const frames = decodeFrames(bin, film.frames.length, film.totalChanges);

const owners = new Uint16Array(film.cols * film.rows);
for (let i = 0; i < frames.cells.length; i++) owners[frames.cells[i]!] = frames.owners[i]!;

const background = await sharp(paths.terrain).removeAlpha().raw().toBuffer({ resolveWithObject: true });
if (background.info.width !== film.cols || background.info.height !== film.rows) {
  throw new Error(`Fond de carte de ${background.info.width} × ${background.info.height} pour ${film.cols} × ${film.rows} attendus.`);
}
const colors = film.clans.map((c, i) => (i === 0 ? null : clanRgb(c.color)));
const finale = blendOwners(background.data, owners, colors);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "film.json"), json);
writeFileSync(join(out, "film.bin.gz"), gzipSync(bin, { level: 9 }));
copyFileSync(paths.terrain, join(out, "terrain.webp"));
for (const width of [800, 1400]) {
  await sharp(finale, { raw: { width: film.cols, height: film.rows, channels: 3 } })
    .resize({ width })
    .webp({ quality: 80 })
    .toFile(join(out, `finale-${width}.webp`));
}
console.log(`Carte : film de ${film.frames.length} images, ${film.events} événements.`);

/*
 * La carte de l'alliance : l'état complet, pixel par pixel, au dernier événement du film (`src/lib/clanmap/etat.ts`). Il se
 * refait depuis l'historique public déjà collecté, gardé hors de Git ; sans lui, ou s'il ne redonne pas les pixels du film,
 * il n'est pas publié, et la carte de l'alliance le dit au lieu de compter faux. Le site se construit quand même.
 */
const cache = process.env["CLANMAP_CACHE_DIR"] ?? join(".cache", "clanmap");
const etatMessage = (() => {
  const events = join(cache, "events.bin");
  const terrainPath = join(cache, "terrain.bin");
  if (!existsSync(events) || !existsSync(terrainPath)) return "pas d'historique local, pas d'état pixel par pixel.";
  const log = parseEventLog(readFileSync(events));
  if (!log) return "historique local illisible, pas d'état pixel par pixel.";
  const terrain = readFileSync(terrainPath);
  if (countLand(terrain) !== OFFICIAL_MAP.land) return "terrain local inattendu, pas d'état pixel par pixel.";
  const etat = etatAuRelevé(log, film.seq, film.width, film.height, terrain);
  if (!etat) return `l'historique local ne va pas jusqu'à l'événement n° ${film.seq} du film, pas d'état pixel par pixel.`;
  if (!etatConforme(etat.valeurs, film.clans, film.standings)) return "l'état rejoué ne redonne pas les pixels du film : il n'est pas publié.";
  const bytes = gzipSync(encoderEtat(etat), { level: 9 });
  writeFileSync(join(out, "etat.bin.gz"), bytes);
  return `état pixel par pixel à l'événement n° ${film.seq}, ${Math.round(bytes.length / 1024)} Ko.`;
})();
console.log(`Carte de l'alliance : ${etatMessage}`);
