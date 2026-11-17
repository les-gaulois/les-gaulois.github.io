/**
 * Ce que l'écran de « Revoir une partie » lit du journal « Entre Gaulois » (`journal.ts`, qui dit d'où viennent les faits) :
 * sans Zod, que le lecteur n'embarque pas. Le journal publié est relu ici à la main, comme une donnée venue d'ailleurs.
 */
import { frNumber } from "../nombre";

/** Au-delà, le rejeu ne note aucun fait (`FAITS_MAX` de entree.ts) : aucune partie relevée n'approche ce nombre. */
export const FAITS_MAX = 20_000;
export const FORMAT_DU_JOURNAL = 1;
/** Les étapes du jeu par seconde, comme la frise du replay (`TICKS_PER_SECOND`, src/client/replay/ReplayPlayback.ts). */
export const ETAPES_PAR_SECONDE = 10;

/**
 * Le code de chaque fait, le même dans ce que le rejeu laisse et dans le journal publié, et ce qui le suit dans sa ligne
 * (après l'étape et le code) : des joueurs, puis un montant ou un texte.
 */
export const CODES = {
  /** Donneur, receveur, montant du moteur (les troupes en dixièmes). */
  donTroupes: 0,
  donOr: 1,
  /** Vainqueur, vaincu, or pris. */
  elimination: 2,
  /** Lanceur, joueur visé (personne : -1), genre (rang dans `BOMBES`). */
  bombe: 3,
  /** Auteur, destinataire (tous : -1), l'émoji. */
  emoji: 4,
  /** Auteur, joueur désigné. */
  cible: 5,
  /** Auteur, destinataire, joueur dont parle la phrase (aucun : -1), la phrase du jeu, « [P1] » à sa place. */
  message: 6,
  /** Demandeur, destinataire. */
  allianceDemandee: 7,
  /** Demandeur, répondant. */
  allianceAcceptee: 8,
  allianceRefusee: 9,
  /** Celui qui rompt, l'autre. */
  allianceRompue: 10,
  /** Les deux alliés. */
  allianceFinie: 11,
  /** Celui qui coupe ou rouvre le commerce, l'autre. */
  embargoPose: 12,
  embargoLeve: 13,
} as const;
export const CODE_MAX = 13;
/** Les bombes dont le lancement est noté, dans l'ordre de `BOMBES_NOTEES` de entree.ts. */
export const BOMBES = ["une bombe atomique", "une bombe H", "une MIRV"] as const;

/** Le camp d'un joueur du journal, vu des Gaulois. */
export const CAMPS = ["gaulois", "equipe", "adverse", "nation", "robot"] as const;
export type Camp = (typeof CAMPS)[number];

/** Les familles de faits : les filtres du panneau. */
export const FAMILLES = ["dons", "combats", "chat", "diplomatie"] as const;
export type Famille = (typeof FAMILLES)[number];
export const NOM_DE_FAMILLE: Record<Famille, string> = { dons: "Dons", combats: "Combats", chat: "Chat", diplomatie: "Diplomatie" };
export function familleDuCode(code: number): Famille {
  if (code <= CODES.donOr) return "dons";
  if (code === CODES.elimination || code === CODES.bombe || code === CODES.cible) return "combats";
  if (code === CODES.emoji || code === CODES.message) return "chat";
  return "diplomatie";
}

/**
 * Un joueur du journal : son nom publiable (le pseudo public d'un membre de la liste du clan, ou le tag d'un clan du classement
 * officiel), ou `null` sans lui, et son camp. Quand plusieurs Gaulois de la partie n'ont pas de pseudo public, chacun porte
 * un numéro (1, 2…, dans l'ordre où ils paraissent) pour qu'on les distingue sans les nommer ; 0 sinon.
 */
export interface JoueurDuJournal {
  nom: string | null;
  camp: Camp;
  numero: number;
}

/** Un fait à l'écran. `a`, `cible` : `null` pour personne (ou tous, pour un émoji). */
export interface FaitALEcran {
  etape: number;
  code: number;
  famille: Famille;
  de: JoueurDuJournal;
  a: JoueurDuJournal | null;
  /** Le joueur dont parle un message rapide. */
  cible: JoueurDuJournal | null;
  /** Le montant d'un don ou l'or pris à une élimination (montant du moteur), ou le genre d'une bombe ; 0 sinon. */
  valeur: number;
  /** L'émoji, ou la phrase du jeu d'un message rapide ; vide sinon. */
  texte: string;
}

/** Le journal d'une partie à l'écran : ses faits dans l'ordre, et l'étape où le rejeu s'arrête. */
export interface JournalALEcran {
  fin: number;
  faits: FaitALEcran[];
}

const entier = (v: unknown, min: number): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min;
/** Un texte d'une ligne, sans caractère de contrôle ni chevron : un émoji, ou une phrase du jeu. */
const TEXTE_PERMIS = /^[^\p{Cc}\p{Cf}<>]{1,200}$/u;
/** Un émoji : un à huit signes d'image, avec leurs liaisons et leurs teintes. */
export const EMOJI_PERMIS = /^[\p{Extended_Pictographic}\p{Regional_Indicator}][\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u200d\ufe0f]{0,7}$/u;

/**
 * Ce qui suit l'étape et le code dans la ligne d'un fait, par code : le nombre de joueurs, lesquels peuvent manquer (-1), et
 * ce qui termine la ligne. La même table sert à écrire le journal (`journal.ts`) et à le relire ici.
 */
export const FORME_DES_FAITS: Record<number, { joueurs: number; facultatifs: readonly number[]; fin: "montant" | "genre" | "texte" | "rien" }> = {
  [CODES.donTroupes]: { joueurs: 2, facultatifs: [], fin: "montant" },
  [CODES.donOr]: { joueurs: 2, facultatifs: [], fin: "montant" },
  [CODES.elimination]: { joueurs: 2, facultatifs: [], fin: "montant" },
  [CODES.bombe]: { joueurs: 2, facultatifs: [1], fin: "genre" },
  [CODES.emoji]: { joueurs: 2, facultatifs: [1], fin: "texte" },
  [CODES.cible]: { joueurs: 2, facultatifs: [], fin: "rien" },
  [CODES.message]: { joueurs: 3, facultatifs: [2], fin: "texte" },
  [CODES.allianceDemandee]: { joueurs: 2, facultatifs: [], fin: "rien" },
  [CODES.allianceAcceptee]: { joueurs: 2, facultatifs: [], fin: "rien" },
  [CODES.allianceRefusee]: { joueurs: 2, facultatifs: [], fin: "rien" },
  [CODES.allianceRompue]: { joueurs: 2, facultatifs: [], fin: "rien" },
  [CODES.allianceFinie]: { joueurs: 2, facultatifs: [], fin: "rien" },
  [CODES.embargoPose]: { joueurs: 2, facultatifs: [], fin: "rien" },
  [CODES.embargoLeve]: { joueurs: 2, facultatifs: [], fin: "rien" },
};

/**
 * La ligne d'un fait convient-elle ? `joueurs` : le nombre de joueurs du journal (leurs rangs vont de 0 à ce nombre moins un).
 * Un don vaut au moins 1 ; une bombe est d'un genre connu ; un émoji est un émoji.
 */
export function ligneValable(ligne: unknown, joueurs: number): ligne is (number | string)[] {
  if (!Array.isArray(ligne) || !entier(ligne[0], 0) || !entier(ligne[1], 0)) return false;
  const forme = FORME_DES_FAITS[ligne[1]];
  if (!forme || ligne.length !== 2 + forme.joueurs + (forme.fin === "rien" ? 0 : 1)) return false;
  for (let k = 0; k < forme.joueurs; k++) {
    const r: unknown = ligne[2 + k];
    if (r === -1 && forme.facultatifs.includes(k)) continue;
    if (!entier(r, 0) || r >= joueurs) return false;
  }
  if (ligne[2] === ligne[3]) return false;
  const fin: unknown = ligne[2 + forme.joueurs];
  if (forme.fin === "montant") return entier(fin, ligne[1] === CODES.elimination ? 0 : 1);
  if (forme.fin === "genre") return entier(fin, 0) && fin < BOMBES.length;
  if (forme.fin === "texte") return typeof fin === "string" && (ligne[1] === CODES.emoji ? EMOJI_PERMIS.test(fin) : TEXTE_PERMIS.test(fin));
  return true;
}

/** Le journal publié d'une partie (`Journal`), relu pour l'écran. `null` : il ne convient pas, rien n'est montré. */
export function journalALEcran(brut: unknown, partie: string): JournalALEcran | null {
  if (typeof brut !== "object" || brut === null) return null;
  const j = brut as { format?: unknown; partie?: unknown; fin?: unknown; joueurs?: unknown; faits?: unknown };
  if (j.format !== FORMAT_DU_JOURNAL || j.partie !== partie || !entier(j.fin, 1) || !Array.isArray(j.joueurs) || !Array.isArray(j.faits) || j.faits.length > FAITS_MAX) return null;
  const lus: { nom: string | null; camp: Camp }[] = [];
  for (const q of j.joueurs as unknown[]) {
    if (!Array.isArray(q) || q.length !== 2 || !entier(q[1], 0) || q[1] >= CAMPS.length) return null;
    const nom: unknown = q[0];
    if (nom !== null && (typeof nom !== "string" || nom.length < 1 || nom.length > 40)) return null;
    lus.push({ nom, camp: CAMPS[q[1]]! });
  }
  const lignes: (number | string)[][] = [];
  for (const ligne of j.faits as unknown[]) {
    if (!ligneValable(ligne, lus.length)) return null;
    lignes.push(ligne);
  }
  lignes.sort((x, y) => (x[0] as number) - (y[0] as number));
  // Les Gaulois sans pseudo public, numérotés dans l'ordre où ils paraissent, s'ils sont plusieurs.
  const sans: number[] = [];
  for (const ligne of lignes) {
    for (let k = 0; k < FORME_DES_FAITS[ligne[1] as number]!.joueurs; k++) {
      const r = ligne[2 + k] as number;
      if (r >= 0 && lus[r]!.camp === "gaulois" && lus[r]!.nom === null && !sans.includes(r)) sans.push(r);
    }
  }
  const qui = (r: number | string | undefined): JoueurDuJournal | null => (typeof r === "number" && r >= 0 ? { ...lus[r]!, numero: sans.length > 1 && sans.includes(r) ? sans.indexOf(r) + 1 : 0 } : null);
  const faits = lignes.map((ligne): FaitALEcran => {
    const code = ligne[1] as number;
    const forme = FORME_DES_FAITS[code]!;
    const fin = ligne[2 + forme.joueurs];
    return { etape: ligne[0] as number, code, famille: familleDuCode(code), de: qui(ligne[2])!, a: qui(ligne[3]), cible: forme.joueurs === 3 ? qui(ligne[4]) : null, valeur: typeof fin === "number" ? fin : 0, texte: typeof fin === "string" ? fin : "" };
  });
  return { fin: j.fin, faits };
}

/** Le nom d'un joueur à l'écran : son nom publiable, sinon son camp, en mots. `debut` : en tête de phrase. */
export function nomDit(qui: JoueurDuJournal, debut = false): string {
  if (qui.nom) return qui.nom;
  if (qui.camp === "gaulois") return qui.numero ? `Gaulois ${qui.numero}` : debut ? "Un Gaulois" : "un Gaulois";
  const mots = qui.camp === "equipe" ? "un coéquipier" : qui.camp === "adverse" ? "un adversaire" : qui.camp === "nation" ? "une nation" : "un robot";
  return debut ? mots[0]!.toLocaleUpperCase("fr") + mots.slice(1) : mots;
}

/** Le moment d'un fait dans la partie, en secondes : dix étapes par seconde, comme la frise du replay. */
export const secondesDuFait = (etape: number) => Math.floor(etape / ETAPES_PAR_SECONDE);

/** Le montant comme l'écran du jeu le compte : l'or tel quel, les troupes divisées par dix. */
export const montantAffiche = (code: number, montant: number) => (code === CODES.donTroupes ? Math.floor(montant / 10) : montant);

const compact = frNumber({ notation: "compact", maximumFractionDigits: 1 });
const sansDecimale = frNumber({ maximumFractionDigits: 0 });
/** « 850 », « 12,5 k », « 1,2 M » : un montant court, à la française. */
export const montantDit = (n: number) => (n < 1_000 ? sansDecimale.format(n) : compact.format(n));

/** Les totaux des dons d'un journal : le nombre de dons et la somme, par genre, au montant de l'écran du jeu. */
export function totauxDesDons(faits: readonly Pick<FaitALEcran, "code" | "valeur">[]): { troupes: { dons: number; somme: number }; or: { dons: number; somme: number } } {
  const t = { troupes: { dons: 0, somme: 0 }, or: { dons: 0, somme: 0 } };
  for (const f of faits) {
    if (f.code !== CODES.donTroupes && f.code !== CODES.donOr) continue;
    const c = f.code === CODES.donOr ? t.or : t.troupes;
    c.dons++;
    c.somme += montantAffiche(f.code, f.valeur);
  }
  return t;
}

/** Les faits déjà arrivés à une étape du replay ; `null` : le replay n'a pas dit où il en est, tout le journal est montré. */
export function faitsJusquA<F extends { etape: number }>(faits: readonly F[], etape: number | null): readonly F[] {
  if (etape === null) return faits;
  let n = 0;
  while (n < faits.length && faits[n]!.etape <= etape) n++;
  return faits.slice(0, n);
}

/** Le nombre de faits de chaque famille. */
export function faitsParFamille(faits: readonly Pick<FaitALEcran, "famille">[]): Record<Famille, number> {
  const n: Record<Famille, number> = { dons: 0, combats: 0, chat: 0, diplomatie: 0 };
  for (const f of faits) n[f.famille]++;
  return n;
}
