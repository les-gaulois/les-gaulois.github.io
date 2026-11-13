/**
 * L'état complet de la carte des clans, pixel par pixel, au dernier relevé du film : pour la carte de l'alliance, où
 * l'encadrement dessine les zones à prendre au pixel près, et où chaque zone se compte sur la vraie carte (terre neutre,
 * alliés, autres clans). Le film, lui, est réduit de moitié : il ne peut pas dire à qui est un pixel précis.
 *
 * Rien de neuf n'est lu chez OpenFront : l'état se refait au build depuis l'historique public déjà collecté
 * (`.cache/clanmap/events.bin`), arrêté au dernier événement du film, et le terrain public de la carte. Il n'est
 * publié que s'il redonne, clan par clan, les pixels du film (`standings`).
 *
 * Une valeur par pixel : 0 la mer, 1 la terre neutre, et `i + 1` le clan d'index `i` dans `film.clans`.
 */
import type { EventLog } from "./replay";
import { LAND } from "./terrain";

export const ETAT_MER = 0;
export const ETAT_NEUTRE = 1;
const MAGIC = "GALETAT1";

export interface EtatCarte {
  width: number;
  height: number;
  /** Le dernier événement rejoué, celui du film. */
  seq: number;
  /** Sa date, en secondes Unix. */
  at: number;
  valeurs: Uint16Array;
}

/**
 * Rejoue l'historique jusqu'à l'événement `seq` compris, avec les index de clans du film : un clan reçoit son index à sa
 * première apparition, comme dans `replayHistory`. `null` : l'historique s'arrête avant `seq`, ou ne le contient pas.
 */
export function etatAuRelevé(log: EventLog, seq: number, width: number, height: number, terrain: Uint8Array): EtatCarte | null {
  if (terrain.length !== width * height) return null;
  const index = new Map<number, number>([[0, 0]]);
  const grid = new Uint16Array(width * height);
  let at = 0;
  let last = -1;
  for (let i = 0; i < log.length; i++) {
    if (log.seq[i]! > seq) break;
    const id = log.clan[i]!;
    let clan = index.get(id);
    if (clan === undefined) {
      clan = index.size;
      index.set(id, clan);
    }
    const x = log.x[i]!;
    const y = log.y[i]!;
    if (x >= width || y >= height) return null;
    grid[y * width + x] = clan;
    at = log.at[i]!;
    last = log.seq[i]!;
  }
  if (last !== seq) return null;
  const valeurs = new Uint16Array(width * height);
  for (let p = 0; p < valeurs.length; p++) {
    const clan = grid[p]!;
    valeurs[p] = clan === 0 ? (terrain[p]! & LAND ? ETAT_NEUTRE : ETAT_MER) : clan + 1;
  }
  return { width, height, seq, at, valeurs };
}

/** Un pixel de mer qui touche la terre par un de ses quatre côtés : le littoral. Le bord de la carte n'en est pas. */
export function auLittoral(valeurs: Uint16Array, width: number, p: number): boolean {
  if (valeurs[p] !== ETAT_MER) return false;
  const x = p % width;
  return (
    (x > 0 && valeurs[p - 1] !== ETAT_MER) ||
    (x < width - 1 && valeurs[p + 1] !== ETAT_MER) ||
    (p >= width && valeurs[p - width] !== ETAT_MER) ||
    (p + width < valeurs.length && valeurs[p + width] !== ETAT_MER)
  );
}

/** Les pixels de chaque clan, par son index dans `film.clans`. */
export function pixelsParClan(valeurs: Uint16Array, clans: number): Int32Array {
  const counts = new Int32Array(clans);
  for (let p = 0; p < valeurs.length; p++) {
    const v = valeurs[p]!;
    if (v > ETAT_NEUTRE && v - 1 < clans) counts[v - 1]!++;
  }
  return counts;
}

/**
 * L'état redonne-t-il les pixels du film, clan par clan ? Sinon, il n'est pas publié : la carte de l'alliance dit alors
 * qu'elle n'a pas l'état pixel par pixel, plutôt que de compter faux.
 */
export function etatConforme(valeurs: Uint16Array, clans: readonly { tag: string | null }[], standings: readonly { tag: string | null; pixels: number }[]): boolean {
  // Une valeur au-delà des clans du film trahit un autre historique.
  for (let p = 0; p < valeurs.length; p++) if (valeurs[p]! > clans.length) return false;
  const counts = pixelsParClan(valeurs, clans.length);
  // Chaque clan avec son tag et ses pixels, des deux côtés : un même compte sous un autre tag ne passe pas.
  const comptes = [...counts].flatMap((n, i) => (i > 0 && n > 0 ? [`${clans[i]?.tag ?? ""}:${n}`] : [])).sort();
  const attendus = standings.map((s) => `${s.tag ?? ""}:${s.pixels}`).sort();
  return attendus.length === comptes.length && attendus.every((s, i) => s === comptes[i]);
}

function pousserNombre(out: number[], n: number): void {
  let v = n;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
}

/** L'état en suites de pixels identiques : l'en-tête, puis, pour chaque suite, sa valeur et sa longueur. */
export function encoderEtat(etat: EtatCarte): Uint8Array {
  const out: number[] = [];
  for (const c of MAGIC) out.push(c.charCodeAt(0));
  const head = new DataView(new ArrayBuffer(12));
  head.setUint16(0, etat.width, true);
  head.setUint16(2, etat.height, true);
  head.setUint32(4, etat.seq, true);
  head.setUint32(8, etat.at, true);
  out.push(...new Uint8Array(head.buffer));
  const v = etat.valeurs;
  let p = 0;
  while (p < v.length) {
    const valeur = v[p]!;
    let fin = p + 1;
    while (fin < v.length && v[fin] === valeur) fin++;
    pousserNombre(out, valeur);
    pousserNombre(out, fin - p);
    p = fin;
  }
  return Uint8Array.from(out);
}

/** Relit un état. Un fichier abîmé lève une erreur : la carte de l'alliance dit alors qu'elle n'a pas l'état. */
export function decoderEtat(bytes: Uint8Array): EtatCarte {
  for (let i = 0; i < MAGIC.length; i++) if (bytes[i] !== MAGIC.charCodeAt(i)) throw new Error("état de la carte : format inconnu");
  const head = new DataView(bytes.buffer, bytes.byteOffset + MAGIC.length, 12);
  const width = head.getUint16(0, true);
  const height = head.getUint16(2, true);
  const seq = head.getUint32(4, true);
  const at = head.getUint32(8, true);
  const valeurs = new Uint16Array(width * height);
  let o = MAGIC.length + 12;
  const lire = (): number => {
    let n = 0;
    let poids = 1;
    for (;;) {
      if (o >= bytes.length) throw new Error("état de la carte : fichier coupé");
      const b = bytes[o++]!;
      n += (b & 0x7f) * poids;
      if (b < 0x80) return n;
      poids *= 128;
    }
  };
  let p = 0;
  while (p < valeurs.length) {
    const valeur = lire();
    const longueur = lire();
    if (longueur === 0 || p + longueur > valeurs.length || valeur > 0xffff) throw new Error("état de la carte : suite impossible");
    valeurs.fill(valeur, p, p + longueur);
    p += longueur;
  }
  if (o !== bytes.length) throw new Error("état de la carte : données en trop");
  return { width, height, seq, at, valeurs };
}
