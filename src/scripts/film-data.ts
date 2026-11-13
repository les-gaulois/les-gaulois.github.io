/** Charge une seule fois les fichiers du film pour son lecteur ; après un échec, « Réessayer » relance le chargement. */
import { adresseVersionnee } from "../lib/clanmap/adresse";
import { decodeFrames, type DecodedFrames } from "../lib/clanmap/codec";
import { niveauDeRelief } from "../lib/clanmap/terrain";
import type { StoredClanMapFilm } from "../lib/schemas";

export interface FilmData {
  film: StoredClanMapFilm;
  frames: DecodedFrames;
  terrain: HTMLImageElement;
  /** Où dessiner les vagues (`src/lib/fx/vagues.ts`) ; `null` si le build n'a pas pu le faire : la mer reste calme. */
  vagues: HTMLImageElement | null;
  /**
   * Le niveau de relief de chaque case du film (`niveauDeRelief`), `film.cols × film.rows`, lu une fois dans `relief.webp`
   * pour le film et la carte de l'alliance ; `null` si le build ne l'a pas fait : les couleurs des clans restent unies.
   */
  relief: Uint8Array | null;
}

/** Les niveaux de relief de `relief.webp`, à la taille du film ; `null` si l'image ne se lit pas. */
function lireRelief(image: HTMLImageElement, width: number, height: number): Uint8Array | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(image, 0, 0, width, height);
    const px = ctx.getImageData(0, 0, width, height).data;
    const out = new Uint8Array(width * height);
    for (let i = 0; i < out.length; i++) out[i] = niveauDeRelief(px[i * 4]!);
    return out;
  } catch {
    return null;
  }
}

/** Une image facultative : son absence ne doit pas empêcher le film. */
async function optionnelle(src: string): Promise<HTMLImageElement | null> {
  const image = new Image();
  image.src = src;
  try {
    await image.decode();
    return image;
  } catch {
    return null;
  }
}

async function load(assets: string, version: string | undefined): Promise<FilmData> {
  const fichier = (nom: string) => adresseVersionnee(assets, nom, version);
  const [meta, bin] = await Promise.all([fetch(fichier("film.json")), fetch(fichier("film.bin.gz"))]);
  if (!meta.ok || !bin.ok) throw new Error("fichiers du film absents");
  const film = (await meta.json()) as StoredClanMapFilm;
  let bytes = new Uint8Array(await bin.arrayBuffer());
  // Un hébergeur peut avoir déjà décompressé le fichier en route.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const frames = decodeFrames(bytes, film.frames.length, film.totalChanges);
  const terrain = new Image();
  terrain.src = fichier("terrain.webp");
  const [, vagues, reliefImage] = await Promise.all([terrain.decode(), optionnelle(fichier("vagues.webp")), optionnelle(fichier("relief.webp"))]);
  const relief = reliefImage ? lireRelief(reliefImage, film.cols, film.rows) : null;
  return { film, frames, terrain, vagues, relief };
}

let pending: Promise<FilmData> | null = null;

/** `version` : celle des fichiers publiés (`data-version` de la page), ajoutée à leur adresse. */
export function loadFilmData(assets: string, version?: string): Promise<FilmData> {
  pending ??= load(assets, version).catch((e) => {
    // Un nouvel essai reste possible après un échec.
    pending = null;
    throw e;
  });
  return pending;
}
