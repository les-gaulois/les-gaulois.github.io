/**
 * L'écran du duel « Coup pour coup » de « Mon Gaulois » (22 novembre 2026), sans navigateur : ce que l'écran calcule pour
 * montrer la collection, construire une main et la garder sous la bourse. Les règles du duel ne sont pas ici : elles sont
 * au moteur partagé (`supabase/functions/code-discord/duel/`), que le serveur rejoue. Ici, seulement ce que l'écran en fait.
 *
 * - **La collection** : les cartes sont les vrais objets du membre. Celles de base (les objets gratuits que tout le monde a)
 *   sont à tous ; les autres, à qui possède l'objet. Une carte qu'on n'a pas se montre grisée, avec où la trouver.
 * - **La main** : cinq cartes, une par emplacement, sous la bourse de duel. Par défaut, ce que porte le Gaulois, ramené
 *   sous la bourse en remplaçant le plus cher par la carte de base de son emplacement.
 */
import { OBJETS, objetPorte, type Tenue } from "../gaulois";
import type { ObjetPossede } from "./contrat";

/** Les cinq emplacements d'une main, dans son ordre : l'arme, la tête, le haut, les pieds, le bas. */
export const EMPLACEMENTS_DE_LA_MAIN = ["arme", "tete", "haut", "pieds", "bas"] as const;
export type EmplacementDeLaMain = (typeof EMPLACEMENTS_DE_LA_MAIN)[number];

/** Les rôles : l'arme frappe, la tête cogne, le haut garde, les pieds prennent de l'élan, le bas souffle. */
export type Role = "frappe" | "tete" | "garde" | "elan" | "souffle";

/** Les raretés d'une carte : « base » pour les objets gratuits, puis celles de la garde-robe. */
export const RANGS_DE_CARTE = ["base", "commun", "peu-commun", "epique", "mystique", "legendaire", "saison", "divin"] as const;
export type RangDeCarte = (typeof RANGS_DE_CARTE)[number];

/** Le nom d'une rareté, pour les phrases et les lecteurs d'écran. */
export const NOMS_DES_RANGS: Readonly<Record<RangDeCarte, string>> = {
  base: "De base",
  commun: "Commun",
  "peu-commun": "Peu commun",
  epique: "Épique",
  mystique: "Mystique",
  legendaire: "Légendaire",
  saison: "Légendaire de saison",
  divin: "Divin",
};

/** Le nom d'un emplacement, en capitales du kit. */
export const NOMS_DES_EMPLACEMENTS: Readonly<Record<EmplacementDeLaMain, string>> = { arme: "ARME", tete: "TÊTE", haut: "HAUT", pieds: "PIEDS", bas: "BAS" };

/** Une fiche du catalogue du duel, comme le moteur la donne : emplacement, rareté, mots-clés, effet unique, panoplie. */
export interface FicheDuCatalogue {
  e: EmplacementDeLaMain;
  r: RangDeCarte;
  p?: string;
  u?: string;
  m?: readonly (readonly [string] | readonly [string, number])[];
}
export type Catalogue = Readonly<Record<string, FicheDuCatalogue>>;

/** Le nom d'un objet du catalogue, celui de la garde-robe. */
export const nomDeLObjet = (e: EmplacementDeLaMain, id: string): string => OBJETS[e][id]?.nom ?? id;

/* ---------- Où trouver une carte ---------- */

/** Là où un objet s'obtient : la boutique, un booster, le pass. */
export type Source = "boutique" | "booster" | "pass";

/**
 * Où trouver la carte d'une rareté : une carte de base est à tous ; le légendaire de saison ne se gagne qu'au dernier palier
 * du pass ; le divin ne sort que du booster surprise ; les autres s'achètent à la boutique, sortent des boosters et des
 * paliers du pass (CLAUDE.md, « Le village des Gaulois »).
 */
export function ouTrouver(r: RangDeCarte): readonly Source[] {
  if (r === "base") return [];
  if (r === "saison") return ["pass"];
  if (r === "divin") return ["booster"];
  return ["boutique", "booster", "pass"];
}

/** Ce que dit « où trouver » en mots, pour la fiche et les lecteurs d'écran. */
export function ouTrouverEnMots(r: RangDeCarte): string {
  if (r === "base") return "Tout le monde l'a.";
  if (r === "saison") return "Seulement au dernier palier du pass de sa saison.";
  if (r === "divin") return "Seulement dans le booster surprise.";
  return "À la boutique, dans les boosters ou sur les paliers du pass.";
}

/* ---------- La collection ---------- */

/**
 * Les cartes à moi : toutes celles de base, et celles dont je possède l'objet (au moins un exemplaire, au bon
 * emplacement). `inventaire` à `null` : la garde-robe ne se sait pas, seules les cartes de base sont sûres.
 */
export function cartesAMoi(catalogue: Catalogue, inventaire: readonly ObjetPossede[] | null): Set<string> {
  const a = new Set<string>();
  for (const [id, f] of Object.entries(catalogue)) if (f.r === "base") a.add(id);
  for (const l of inventaire ?? []) {
    const f = catalogue[l.objet];
    if (f && f.e === l.emplacement && l.quantite > 0) a.add(l.objet);
  }
  return a;
}

const RANG = (r: RangDeCarte): number => RANGS_DE_CARTE.indexOf(r);

/** Les cartes d'un emplacement, de la plus courante à la plus rare, puis par nom ; une rareté seule si on la filtre. */
export function cartesDeLEmplacement(catalogue: Catalogue, e: EmplacementDeLaMain, filtre: RangDeCarte | null = null): string[] {
  return Object.entries(catalogue)
    .filter(([, f]) => f.e === e && (filtre === null || f.r === filtre))
    .sort(([a, fa], [b, fb]) => RANG(fa.r) - RANG(fb.r) || nomDeLObjet(e, a).localeCompare(nomDeLObjet(e, b), "fr"))
    .map(([id]) => id);
}

/** Combien de cartes j'ai sur combien, en tout ou pour un emplacement. */
export function compteDeLaCollection(catalogue: Catalogue, aMoi: ReadonlySet<string>, e: EmplacementDeLaMain | null = null): { a: number; total: number } {
  let a = 0;
  let total = 0;
  for (const [id, f] of Object.entries(catalogue)) {
    if (e !== null && f.e !== e) continue;
    total++;
    if (aMoi.has(id)) a++;
  }
  return { a, total };
}

/* ---------- La main ---------- */

/** Le prix d'une carte, selon les règles du moteur (le prix de sa rareté). */
export type PrixDUneCarte = (id: string) => number;

/** La carte de base d'un emplacement : la moins chère, celle que tout le monde a. */
export function carteDeBase(catalogue: Catalogue, e: EmplacementDeLaMain): string {
  const id = cartesDeLEmplacement(catalogue, e, "base")[0];
  if (!id) throw new Error(`duel : pas de carte de base pour l'emplacement ${e}`);
  return id;
}

/**
 * La main par défaut : ce que porte le Gaulois, emplacement par emplacement (la carte de base là où il ne porte rien qui
 * soit une carte à lui), puis, tant qu'elle dépasse la bourse, la carte la plus chère remplacée par celle de base.
 */
export function mainParDefaut(catalogue: Catalogue, tenue: Tenue, aMoi: ReadonlySet<string>, prix: PrixDUneCarte, bourse: number): string[] {
  const main = EMPLACEMENTS_DE_LA_MAIN.map((e) => {
    const porte = objetPorte(tenue, e);
    return catalogue[porte]?.e === e && aMoi.has(porte) ? porte : carteDeBase(catalogue, e);
  });
  const total = (): number => main.reduce((s, id) => s + prix(id), 0);
  while (total() > bourse) {
    let i = 0;
    for (let k = 1; k < main.length; k++) if (prix(main[k]!) > prix(main[i]!)) i = k;
    const base = carteDeBase(catalogue, EMPLACEMENTS_DE_LA_MAIN[i]!);
    if (main[i] === base) break;
    main[i] = base;
  }
  return main;
}

export type RefusDeLaMain = "emplacement" | "pas-a-moi" | "bourse";

/** Une main que le serveur accepterait : cinq cartes, une par emplacement dans l'ordre, toutes à moi, sous la bourse. */
export function refusDeLaMain(main: readonly string[], catalogue: Catalogue, aMoi: ReadonlySet<string>, prix: PrixDUneCarte, bourse: number): RefusDeLaMain | null {
  if (main.length !== EMPLACEMENTS_DE_LA_MAIN.length || main.some((id, i) => catalogue[id]?.e !== EMPLACEMENTS_DE_LA_MAIN[i])) return "emplacement";
  if (main.some((id) => !aMoi.has(id))) return "pas-a-moi";
  if (main.reduce((s, id) => s + prix(id), 0) > bourse) return "bourse";
  return null;
}

/** Ce qui reste de la bourse pour un emplacement, une fois payées les quatre autres cartes. */
export function resteDeLaBourse(main: readonly string[], i: number, prix: PrixDUneCarte, bourse: number): number {
  return bourse - main.reduce((s, id, k) => (k === i ? s : s + prix(id)), 0);
}

/* ---------- Le duel d'entraînement ---------- */

/** Les trois niveaux de la machine, du plus facile au plus fort (les réglages sont au moteur). */
export const NIVEAUX_D_ENTRAINEMENT = ["apprenti", "guerrier", "druide"] as const;
export type NiveauDEntrainement = (typeof NIVEAUX_D_ENTRAINEMENT)[number];
export const NOMS_DES_NIVEAUX: Readonly<Record<NiveauDEntrainement, string>> = { apprenti: "Apprenti", guerrier: "Guerrier", druide: "Druide" };
/** Le niveau avec son article, pour « contre l'apprenti », « contre le guerrier ». */
export const NIVEAUX_AVEC_ARTICLE: Readonly<Record<NiveauDEntrainement, string>> = { apprenti: "l'apprenti", guerrier: "le guerrier", druide: "le druide" };

/** Un adversaire d'entraînement : la machine, sa main, son allure, sa bannière (le lieu du duel) et son familier. */
export interface AdversaireDEntrainement {
  main: readonly string[];
  /** Ce qui change de la tenue de départ : coupe, barbe, couleurs, visage. Les objets viennent de sa main. */
  allure: Readonly<Record<string, string>>;
  banniere: string;
  familier: string;
}

/**
 * Les adversaires d'entraînement : les trois adversaires d'exemple de la maquette validée par le pilote, un par niveau (la
 * panoplie du grand froid pour l'apprenti, celle des gens de mer pour le guerrier, une légendaire bien entourée pour le
 * druide). Ils attendent ceux de la session « Duel : boss, défis et niveaux » (`duel/contenu/`), qui les remplaceront.
 */
export const ADVERSAIRES_D_ENTRAINEMENT: Readonly<Record<NiveauDEntrainement, AdversaireDEntrainement>> = {
  apprenti: {
    main: ["hache", "chapka", "manteau-fourrure", "raquettes-neige", "pagne-fourrure"],
    allure: { cheveux: "boucles", teinte_cheveux: "blond", barbe: "trois-jours", yeux: "ronds", bouche: "grand-sourire", peau: "claire" },
    banniere: "cretes-au-levant",
    familier: "lievre-brun",
  },
  guerrier: {
    main: ["trident", "chapeau-pecheur", "maillot-marin", "bottes-pecheur", "pantalon-marin"],
    allure: { cheveux: "crete", teinte_cheveux: "roux", barbe: "fourchue", yeux: "severe", bouche: "sourire", peau: "mate" },
    banniere: "port-au-couchant",
    familier: "chouette-effraie",
  },
  druide: {
    main: ["lance-ceremonie", "masque-bois", "pelerine-pluie", "bottes-neige", "braies-retroussees"],
    allure: { cheveux: "longs", teinte_cheveux: "blanc", barbe: "fleuve", yeux: "sourcils-epais", bouche: "serieuse", peau: "claire" },
    banniere: "cerisiers-en-fleurs",
    familier: "herisson-des-haies",
  },
};

/* ---------- Ce que le serveur du duel dit de moi ---------- */

/** Une attaque reçue par ma main de défense. */
export interface DefenseRecue {
  le: string;
  /** Le nom au village de celui qui m'a défié ; `null` si son compte n'est plus validé (l'écran écrit « Un Gaulois »). */
  nom: string | null;
  issue: "repousse" | "battu" | "egalite";
  manches: number;
}

/**
 * La réponse de `get_mon_duel` (`EtatDuDuel` de `contrat-duel.ts`), lue sans rien supposer : ce que l'écran en montre.
 * `collection` : les cartes jouables selon le serveur (`null` s'il ne la donne pas). Les totaux de l'historique viennent du
 * bilan du serveur, jamais d'un recomptage de la liste, qu'il peut couper : `null` s'il ne les donne pas.
 */
export interface EtatLuDuServeur {
  boss: string | null;
  bossBattu: boolean;
  defense: string[] | null;
  /** Faux si une carte de la défense a quitté la garde-robe : personne ne peut alors me défier. */
  defenseValide: boolean;
  collection: Set<string> | null;
  defenses: DefenseRecue[];
  repousses: number | null;
  battus: number | null;
  /** La partie en cours au serveur, à reprendre (une seule à la fois) ; `null` sans partie en cours. */
  partie: PartieEnCours | null;
}

/** Une partie que le serveur garde ouverte : l'écran la rejoue depuis sa main et ses coups, puis la poursuit. */
export interface PartieEnCours {
  id: number;
  contre: "membre" | "boss";
  boss: string | null;
  /** Ma main de cette partie, dans l'ordre des emplacements. */
  main: string[];
  /** Les manches jouées : [ma carte, la sienne]. */
  coups: [number, number][];
  compte: boolean;
}

function lirePartie(p: unknown): PartieEnCours | null {
  if (!estObjet(p) || p["fini"] !== false || entier(p["partie"]) === null) return null;
  const contre = p["contre"];
  const mains = estObjet(p["mains"]) ? p["mains"] : null;
  const a = mains && estObjet(mains["a"]) ? mains["a"] : null;
  if ((contre !== "membre" && contre !== "boss") || !a) return null;
  const main = EMPLACEMENTS_DE_LA_MAIN.map((e) => (typeof a[e] === "string" ? (a[e] as string) : ""));
  if (!main.every(Boolean)) return null;
  const coups: [number, number][] = [];
  for (const c of Array.isArray(p["coups"]) ? p["coups"] : []) {
    if (!Array.isArray(c) || entier(c[0]) === null || entier(c[1]) === null) return null;
    coups.push([c[0] as number, c[1] as number]);
  }
  return { id: p["partie"] as number, contre, boss: typeof p["boss"] === "string" ? p["boss"] : null, main, coups, compte: p["compte"] === true };
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const entier = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null);

export function lireLEtatDuServeur(raw: unknown): EtatLuDuServeur | null {
  if (!estObjet(raw) || raw["ok"] !== true) return null;
  const d = raw["defense"];
  const defense = estObjet(d) ? EMPLACEMENTS_DE_LA_MAIN.map((e) => (typeof d[e] === "string" ? (d[e] as string) : "")) : null;
  const c = raw["collection"];
  const collection = estObjet(c) ? new Set(EMPLACEMENTS_DE_LA_MAIN.flatMap((e) => (Array.isArray(c[e]) ? (c[e] as unknown[]).filter((x): x is string => typeof x === "string") : []))) : null;
  const defenses = (Array.isArray(raw["defenses"]) ? raw["defenses"] : []).flatMap((l): DefenseRecue[] => {
    if (!estObjet(l) || typeof l["le"] !== "string" || entier(l["manches"]) === null) return [];
    const nom = typeof l["nom"] === "string" && l["nom"].trim() !== "" ? l["nom"] : null;
    const issue = l["issue"];
    return issue === "repousse" || issue === "battu" || issue === "egalite" ? [{ le: l["le"], nom, issue, manches: l["manches"] as number }] : [];
  });
  const bilan = estObjet(raw["bilan"]) ? raw["bilan"] : {};
  const boss = estObjet(raw["boss"]) ? raw["boss"] : null;
  const valide = defense !== null && defense.every(Boolean);
  return {
    boss: boss && typeof boss["boss"] === "string" ? boss["boss"] : null,
    bossBattu: boss?.["battu"] === true,
    defense: valide ? defense : null,
    defenseValide: valide && raw["defense_valide"] !== false,
    collection: collection && collection.size > 0 ? collection : null,
    defenses,
    repousses: entier(bilan["repousses"]),
    battus: entier(bilan["battus"]),
    partie: lirePartie(raw["partie"]),
  };
}

/* ---------- Le premier duel guidé ---------- */

/** Le guide du premier duel a été vu sur cet appareil : la clé de son souvenir. */
export const CLE_DU_GUIDE = "gal-duel-guide";
