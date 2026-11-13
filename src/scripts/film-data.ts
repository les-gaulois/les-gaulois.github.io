/** Charge une seule fois les fichiers du film pour son lecteur ; après un échec, « Réessayer » relance le chargement. */
import { decodeFrames, type DecodedFrames } from "../lib/clanmap/codec";
import type { StoredClanMapFilm } from "../lib/schemas";

export interface FilmData {
  film: StoredClanMapFilm;
  frames: DecodedFrames;
  terrain: HTMLImageElement;
  /** Où dessiner les vagues (`src/lib/fx/vagues.ts`) ; `null` si le build n'a pas pu le faire : la mer reste calme. */
  vagues: HTMLImageElement | null;
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

async function load(assets: string): Promise<FilmData> {
  const [meta, bin] = await Promise.all([fetch(`${assets}film.json`), fetch(`${assets}film.bin.gz`)]);
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
  terrain.src = `${assets}terrain.webp`;
  const [, vagues] = await Promise.all([terrain.decode(), optionnelle(`${assets}vagues.webp`)]);
  return { film, frames, terrain, vagues };
}

let pending: Promise<FilmData> | null = null;

export function loadFilmData(assets: string): Promise<FilmData> {
  pending ??= load(assets).catch((e) => {
    // Un nouvel essai reste possible après un échec.
    pending = null;
    throw e;
  });
  return pending;
}
