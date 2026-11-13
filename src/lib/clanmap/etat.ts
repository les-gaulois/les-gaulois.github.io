/**
 * L'état complet de la carte des clans, pixel par pixel : pour la carte de l'alliance, où l'on dessine les zones à prendre
 * au pixel près, et où chaque zone se compte sur la vraie carte (terre neutre, alliés, autres clans). Le film, lui, est
 * réduit de moitié : il ne peut pas dire à qui est un pixel précis.
 *
 * Rien de neuf n'est lu chez OpenFront : l'état se refait au build depuis l'historique public déjà collecté
 * (`.cache/clanmap/events.bin`) et le terrain public de la carte. Depuis le 13 novembre 2026, au dernier événement relu
 * par le robot (`rejouerEtat`, avec son relevé `ReleveCarte` et la comparaison sur 24 heures `Veille`), contrôlé par
 * l'ancien propriétaire de chaque événement ; sinon, au dernier événement du film, s'il en redonne les pixels clan par clan.
 * `etatAuRelevé` reste la forme simple de ce rejeu, sans contrôle ni comparaison.
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
  /** Le dernier événement rejoué. */
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

/**
 * Ce qui a changé de main en 24 heures (demande du pilote, 13 novembre 2026 : « ce qui a bougé depuis hier ») : chaque
 * pixel dont la valeur n'est plus celle d'il y a 24 heures, avec sa valeur d'alors, dans le même codage que l'état.
 */
export interface Veille {
  /** L'état auquel elle se compare (`EtatCarte.seq`). */
  seqEtat: number;
  /** Le dernier événement rejoué pour la carte d'alors. */
  seq: number;
  /** Le moment comparé, en secondes Unix : 24 heures avant le relevé. */
  depuis: number;
  /** Les pixels changés, dans l'ordre de la carte, et leur valeur au moment comparé. */
  index: Uint32Array;
  avant: Uint16Array;
}

export interface EtatRejoue {
  etat: EtatCarte;
  /** Par index de clan, son identifiant dans l'annuaire de la carte ; l'index 0 est la terre sans clan. */
  clanIds: number[];
  /** Les événements dont l'ancien propriétaire annoncé contredit le rejeu : un seul suffit pour ne rien publier. */
  ecarts: number;
  /** `null` : pas de comparaison demandée, ou l'historique commence après le moment comparé. */
  veille: Veille | null;
}

/**
 * Rejoue l'historique jusqu'à l'événement `seq` (par défaut, le dernier), avec les index de clans du film, et contrôle
 * chaque événement : l'ancien propriétaire qu'il annonce doit être celui du rejeu, comme pour le film. Avec `depuis` (en
 * secondes Unix), garde aussi la carte telle qu'elle était à ce moment, pour dire ce qui a changé de main depuis.
 * `null` : terrain de la mauvaise taille, événement hors de la carte, ou historique qui ne contient pas `seq`.
 */
export function rejouerEtat(log: EventLog, width: number, height: number, terrain: Uint8Array, options: { seq?: number; depuis?: number } = {}): EtatRejoue | null {
  if (terrain.length !== width * height || log.length === 0) return null;
  const index = new Map<number, number>([[0, 0]]);
  const clanIds = [0];
  const grid = new Uint16Array(width * height);
  const jusqua = options.seq ?? log.seq[log.length - 1]!;
  let ecarts = 0;
  let at = 0;
  let last = -1;
  // Les dates de l'historique reculent parfois de quelques secondes : comme le film, on garde la plus récente vue.
  let plusRecente = 0;
  let photo: Uint16Array | null = null;
  let photoSeq = 0;
  let avantLeDebut = false;
  for (let i = 0; i < log.length; i++) {
    if (log.seq[i]! > jusqua) break;
    const moment = Math.max(plusRecente, log.at[i]!);
    if (options.depuis !== undefined && photo === null && !avantLeDebut && moment > options.depuis) {
      if (i === 0) avantLeDebut = true;
      else {
        photo = grid.slice();
        photoSeq = log.seq[i - 1]!;
      }
    }
    plusRecente = moment;
    const id = log.clan[i]!;
    let clan = index.get(id);
    if (clan === undefined) {
      clan = index.size;
      index.set(id, clan);
      clanIds.push(id);
    }
    const x = log.x[i]!;
    const y = log.y[i]!;
    if (x >= width || y >= height) return null;
    const p = y * width + x;
    if (clanIds[grid[p]!] !== log.previous[i]) ecarts++;
    grid[p] = clan;
    at = log.at[i]!;
    last = log.seq[i]!;
  }
  if (last !== jusqua) return null;
  const valeurDe = (clan: number, p: number) => (clan === 0 ? (terrain[p]! & LAND ? ETAT_NEUTRE : ETAT_MER) : clan + 1);
  const valeurs = new Uint16Array(width * height);
  for (let p = 0; p < valeurs.length; p++) valeurs[p] = valeurDe(grid[p]!, p);
  const etat: EtatCarte = { width, height, seq: last, at, valeurs };

  let veille: Veille | null = null;
  if (options.depuis !== undefined && !avantLeDebut) {
    // Rien après le moment comparé : la carte d'alors est celle d'aujourd'hui.
    const alors = photo ?? grid;
    const changes: number[] = [];
    const avant: number[] = [];
    for (let p = 0; p < valeurs.length; p++) {
      const v = valeurDe(alors[p]!, p);
      if (v !== valeurs[p]) {
        changes.push(p);
        avant.push(v);
      }
    }
    veille = { seqEtat: last, seq: photo ? photoSeq : last, depuis: options.depuis, index: Uint32Array.from(changes), avant: Uint16Array.from(avant) };
  }
  return { etat, clanIds, ecarts, veille };
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

/** Un lecteur de nombres écrits par `pousserNombre`, à partir de l'octet `debut`. */
function lecteur(bytes: Uint8Array, debut: number, quoi: string) {
  let o = debut;
  return {
    lire(): number {
      let n = 0;
      let poids = 1;
      for (;;) {
        if (o >= bytes.length) throw new Error(`${quoi} : fichier coupé`);
        const b = bytes[o++]!;
        n += (b & 0x7f) * poids;
        if (b < 0x80) return n;
        poids *= 128;
        if (poids > 2 ** 35) throw new Error(`${quoi} : nombre impossible`);
      }
    },
    fini: () => o === bytes.length,
  };
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
  const l = lecteur(bytes, MAGIC.length + 12, "état de la carte");
  let p = 0;
  while (p < valeurs.length) {
    const valeur = l.lire();
    const longueur = l.lire();
    if (longueur === 0 || p + longueur > valeurs.length || valeur > 0xffff) throw new Error("état de la carte : suite impossible");
    valeurs.fill(valeur, p, p + longueur);
    p += longueur;
  }
  if (!l.fini()) throw new Error("état de la carte : données en trop");
  return { width, height, seq, at, valeurs };
}

const MAGIC_VEILLE = "GALVEIL1";

/** La veille : l'en-tête, puis, pour chaque pixel changé, l'écart à l'index du précédent et sa valeur d'alors. */
export function encoderVeille(veille: Veille): Uint8Array {
  const out: number[] = [];
  for (const c of MAGIC_VEILLE) out.push(c.charCodeAt(0));
  const head = new DataView(new ArrayBuffer(16));
  head.setUint32(0, veille.seqEtat, true);
  head.setUint32(4, veille.seq, true);
  head.setUint32(8, veille.depuis, true);
  head.setUint32(12, veille.index.length, true);
  out.push(...new Uint8Array(head.buffer));
  let precedent = 0;
  for (let k = 0; k < veille.index.length; k++) {
    const p = veille.index[k]!;
    pousserNombre(out, p - precedent);
    pousserNombre(out, veille.avant[k]!);
    precedent = p;
  }
  return Uint8Array.from(out);
}

/** Relit une veille. `taille` : le nombre de pixels de la carte ; un fichier abîmé ou d'une autre carte lève une erreur. */
export function decoderVeille(bytes: Uint8Array, taille: number): Veille {
  for (let i = 0; i < MAGIC_VEILLE.length; i++) if (bytes[i] !== MAGIC_VEILLE.charCodeAt(i)) throw new Error("veille de la carte : format inconnu");
  if (bytes.length < MAGIC_VEILLE.length + 16) throw new Error("veille de la carte : fichier coupé");
  const head = new DataView(bytes.buffer, bytes.byteOffset + MAGIC_VEILLE.length, 16);
  const nombre = head.getUint32(12, true);
  if (nombre > taille) throw new Error("veille de la carte : trop de pixels");
  const index = new Uint32Array(nombre);
  const avant = new Uint16Array(nombre);
  const l = lecteur(bytes, MAGIC_VEILLE.length + 16, "veille de la carte");
  let p = 0;
  for (let k = 0; k < nombre; k++) {
    const ecart = l.lire();
    // Les pixels vont dans l'ordre, chacun une fois : seul le premier peut être à l'index 0.
    if ((k > 0 && ecart === 0) || p + ecart >= taille) throw new Error("veille de la carte : pixel impossible");
    p += ecart;
    const valeur = l.lire();
    if (valeur > 0xffff) throw new Error("veille de la carte : valeur impossible");
    index[k] = p;
    avant[k] = valeur;
  }
  if (!l.fini()) throw new Error("veille de la carte : données en trop");
  return { seqEtat: head.getUint32(0, true), seq: head.getUint32(4, true), depuis: head.getUint32(8, true), index, avant };
}

/**
 * Ce que la carte de l'alliance lit avec l'état (`etat.json`, écrit au build) : de quand il est, et à qui sont ses index.
 * Depuis le 13 novembre 2026, l'état suit l'historique relu à chaque passage du robot, plus souvent que le film.
 */
export interface ReleveCarte {
  version: 1;
  /** L'heure du relevé : la dernière lecture de l'historique. */
  fetchedAt: string;
  seq: number;
  width: number;
  height: number;
  /** Par index, comme `film.clans` : l'index 0 est la terre sans clan. */
  clans: { tag: string | null; color: number | null }[];
  /** Les clans qui ont des pixels, du plus grand au plus petit. */
  standings: { tag: string | null; color: number | null; pixels: number }[];
  /** La terre peinte, tous clans compris. */
  claimed: number;
  /** La comparaison publiée (`veille.bin.gz`) : son moment et son dernier événement. `null` : aucune. */
  veille: { depuis: string; seq: number } | null;
}

const estEntier = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
const estClan = (c: unknown): boolean => {
  const o = c as { tag?: unknown; color?: unknown };
  return typeof c === "object" && c !== null && (o.tag === null || typeof o.tag === "string") && (o.color === null || estEntier(o.color));
};

/** Un `etat.json` lisible : sinon, la carte de l'alliance reprend le relevé du film. */
export function releveValable(x: unknown): x is ReleveCarte {
  const r = x as Partial<ReleveCarte>;
  return (
    typeof x === "object" &&
    x !== null &&
    r.version === 1 &&
    typeof r.fetchedAt === "string" &&
    !Number.isNaN(Date.parse(r.fetchedAt)) &&
    estEntier(r.seq) &&
    estEntier(r.width) &&
    estEntier(r.height) &&
    estEntier(r.claimed) &&
    Array.isArray(r.clans) &&
    r.clans.every(estClan) &&
    Array.isArray(r.standings) &&
    r.standings.every((s) => estClan(s) && estEntier((s as { pixels?: unknown }).pixels)) &&
    (r.veille === null || (typeof r.veille === "object" && r.veille !== undefined && typeof r.veille.depuis === "string" && estEntier(r.veille.seq)))
  );
}

/** Les clans qui ont des pixels, du plus grand au plus petit, puis par index : comme `standings` dans le film. */
export function classementDeLEtat(valeurs: Uint16Array, clans: readonly { tag: string | null; color: number | null }[]): ReleveCarte["standings"] {
  const counts = pixelsParClan(valeurs, clans.length);
  return [...counts.keys()]
    .filter((i) => i > 0 && counts[i]! > 0)
    .sort((a, b) => counts[b]! - counts[a]! || a - b)
    .map((i) => ({ tag: clans[i]?.tag ?? null, color: clans[i]?.color ?? null, pixels: counts[i]! }));
}
