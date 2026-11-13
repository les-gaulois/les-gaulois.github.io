/** Charge une seule fois les fichiers du film pour son lecteur ; après un échec, « Réessayer » relance le chargement. */
import { adresseVersionnee } from "../lib/clanmap/adresse";
import { decodeFrames, type DecodedFrames } from "../lib/clanmap/codec";
import type { StoredClanMapFilm } from "../lib/schemas";

export interface FilmData {
  film: StoredClanMapFilm;
  frames: DecodedFrames;
  terrain: HTMLImageElement;
  /** Où dessiner les vagues (`src/lib/fx/vagues.ts`) ; `null` si le build n'a pas pu le faire : la mer reste calme. */
  vagues: HTMLImageElement | null;
  /** Le relief de chaque case (`reliefDuFond`) ; `null` si le build ne l'a pas fait : les couleurs des clans restent unies. */
  relief: HTMLImageElement | null;
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
  const [, vagues, relief] = await Promise.all([terrain.decode(), optionnelle(fichier("vagues.webp")), optionnelle(fichier("relief.webp"))]);
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
