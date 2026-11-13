/**
 * Prépare le film de la carte pour le site, dans public/generated/carte/ :
 * les données compressées, le fond de carte et une image de la carte finale,
 * affichée sans JavaScript et avant le chargement du film.
 * Sans film collecté, rien n'est généré et la page affiche « Pas de données ».
 *
 * Le fond `data/clanmap/terrain.webp` a sa mer assombrie : elle reprend ici la couleur du jeu, case par case, d'après le
 * terrain public de la carte (`merDuJeu`), avec le calque qui dit au film où dessiner les vagues. Sans ce terrain, le
 * fond sombre est publié tel quel, sans vagues, et le build le signale.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import sharp from "sharp";
import { clanRgb, decodeFrames } from "../src/lib/clanmap/codec";
import { parseEventLog } from "../src/lib/clanmap/collect";
import { encoderEtat, etatAuRelevé, etatConforme } from "../src/lib/clanmap/etat";
import { OFFICIAL_MAP, TERRAIN_ORIGIN, TERRAIN_PATH, blendOwners, countLand, merDuJeu } from "../src/lib/clanmap/terrain";
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
const cache = process.env["CLANMAP_CACHE_DIR"] ?? join(".cache", "clanmap");

/**
 * Le terrain public de la carte : celui que la collecte garde en cache, sinon le même fichier, au même commit, lu sur
 * GitHub et gardé dans le cache. Un fichier qui ne donne pas la surface de terre attendue n'est pas utilisé.
 */
async function terrainDeLaCarte(): Promise<Uint8Array | null> {
  const path = join(cache, "terrain.bin");
  const conforme = (bytes: Uint8Array) => bytes.length === OFFICIAL_MAP.width * OFFICIAL_MAP.height && countLand(bytes) === OFFICIAL_MAP.land;
  if (existsSync(path)) {
    const bytes = new Uint8Array(readFileSync(path));
    if (conforme(bytes)) return bytes;
  }
  try {
    const res = await fetch(`${TERRAIN_ORIGIN}${TERRAIN_PATH}`, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!conforme(bytes)) throw new Error("taille ou surface de terre inattendue");
    mkdirSync(cache, { recursive: true });
    writeFileSync(path, bytes);
    return bytes;
  } catch (e) {
    console.log(`::warning::Carte : terrain indisponible (${e instanceof Error ? e.message : String(e)}), mer sombre et sans vagues.`);
    return null;
  }
}

const terrain = await terrainDeLaCarte();
const mer = terrain ? merDuJeu(background.data, film.cols, film.rows, terrain) : null;
if (terrain && !mer) console.log("::warning::Carte : le terrain ne va pas avec le fond, mer sombre et sans vagues.");

const colors = film.clans.map((c, i) => (i === 0 ? null : clanRgb(c.color)));
const finale = blendOwners(mer?.image ?? background.data, owners, colors);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "film.json"), json);
writeFileSync(join(out, "film.bin.gz"), gzipSync(bin, { level: 9 }));
if (mer) {
  await sharp(mer.image, { raw: { width: film.cols, height: film.rows, channels: 3 } }).webp({ quality: 85 }).toFile(join(out, "terrain.webp"));
  // Les vagues sont floues et légères : la moitié de la taille du fond leur suffit, pour un fichier dix fois plus petit.
  await sharp(mer.vagues, { raw: { width: film.cols, height: film.rows, channels: 1 } })
    .resize(Math.ceil(film.cols / 2), Math.ceil(film.rows / 2))
    .webp({ quality: 70 })
    .toFile(join(out, "vagues.webp"));
} else {
  copyFileSync(paths.terrain, join(out, "terrain.webp"));
}
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
