/**
 * Le trop-payé rendu après les prix baissés du 21 novembre 2026 (migration 20261121000600_prix_baisses_rendus ;
 * docs/DIRECTION.md, « Le trop-payé rendu ») : ce que le robot lit au serveur (`rendus_des_prix`, clé de service seulement),
 * et ce qu'il en dit, en mots. Des calculs purs : l'envoi est dans `rendus-prix-discord.ts`, le dessin dans
 * `rendus-prix-image.ts`.
 *
 * Le message public ne donne aucun montant d'un joueur (le solde ne se montre qu'à son titulaire) ; la somme de tous
 * seulement quand au moins `COMPTES_POUR_LE_TOTAL` joueurs ont été remboursés, pour qu'elle ne redonne pas celle d'un seul.
 * Le message privé, à chaque joueur remboursé, donne son montant et le détail de ses achats.
 */
import { banniereParId } from "../../supabase/functions/code-discord/bannieres/index";
import { modeleParId } from "../../supabase/functions/code-discord/modeles/index";
import { fmtInt } from "./format";
import { RARETES, type Rarete } from "./gaulois";
import { cadreParId } from "./village/cadres";
import { finitionParId } from "./village/cartes";
import { FOIS_LE_PRIX_D_UN_OBJET, PRIX_MODELE_PAR_RARETE, PRIX_PAR_RARETE, PRIX_POCHETTE_BANNIERES, PRIX_POCHETTE_FAMILIERS, PRIX_POCHETTE_MODELES } from "./village/contrat";

/** Ce qu'un achat rendu avait payé : un article de la boutique, ou une pochette (« booster » à l'écran). */
export type GenreRendu = "banniere" | "carte" | "cadre" | "modele" | "pochette_familiers" | "pochette_bannieres" | "pochette_modeles";
export const GENRES_RENDUS: readonly GenreRendu[] = ["banniere", "carte", "cadre", "modele", "pochette_familiers", "pochette_bannieres", "pochette_modeles"];

/** Un achat rendu, tel que le serveur le garde (internal.prix_baisse_rendus). */
export interface LigneRendue {
  genre: GenreRendu;
  /** L'article acheté, ou ce que la pochette a donné ; null pour une pochette qui avait rendu des statères. */
  objet: string | null;
  /** La rareté d'un article de la boutique ; null pour une pochette. */
  rarete: Rarete | null;
  paye: number;
  nouveau: number;
  /** Ce que la pochette avait déjà rendu de son prix. */
  dejaRendu: number;
  rendu: number;
}

/** Un joueur remboursé. `n` : la ligne de son journal, qui sert d'ordre et de marque-page au robot. */
export interface RenduDUnJoueur {
  n: number;
  /** Son identifiant Discord, pour le message privé ; null : pas de message privé possible. */
  discord: string | null;
  nom: string;
  total: number;
  /** Son Gaulois, pour l'image : la tenue, le familier et la bannière montrés. */
  gaulois: { tenue: unknown; familier: string | null; banniere: string | null } | null;
  lignes: LigneRendue[];
}

/** La réponse du serveur. `comptes` et `total` : tous les joueurs remboursés. */
export interface RendusDesPrix {
  comptes: number;
  total: number;
  /** Quand le serveur a rendu le trop-payé (le collage de la migration), ou null s'il n'a rien rendu. */
  le: string | null;
  jusquA: number | null;
  rendus: RenduDUnJoueur[];
}

const entier = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);
const texte = (v: unknown): string | null => (typeof v === "string" ? v : null);
const estRarete = (v: unknown): v is Rarete => typeof v === "string" && Object.hasOwn(RARETES, v);
const DISCORD_ID = /^[0-9]{17,20}$/;

function lireLigne(raw: unknown): LigneRendue | null {
  if (!raw || typeof raw !== "object") return null;
  const l = raw as Record<string, unknown>;
  const genre = texte(l["genre"]);
  if (!genre || !(GENRES_RENDUS as readonly string[]).includes(genre)) return null;
  const [paye, nouveau, dejaRendu, rendu] = [entier(l["paye"]), entier(l["nouveau"]), entier(l["deja_rendu"]), entier(l["rendu"])];
  if (paye === null || nouveau === null || dejaRendu === null || rendu === null) return null;
  if (!(rendu > 0 && nouveau > 0 && paye > nouveau && rendu <= paye - nouveau && dejaRendu >= 0)) return null;
  const rarete = l["rarete"] === null || l["rarete"] === undefined ? null : estRarete(l["rarete"]) ? l["rarete"] : undefined;
  if (rarete === undefined) return null;
  return { genre: genre as GenreRendu, objet: texte(l["objet"]), rarete, paye, nouveau, dejaRendu, rendu };
}

function lireJoueur(raw: unknown): RenduDUnJoueur | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const n = entier(r["n"]);
  const total = entier(r["total"]);
  const nom = texte(r["nom"]);
  if (n === null || n <= 0 || total === null || total <= 0 || !nom) return null;
  const discord = texte(r["discord"]);
  const lignes = Array.isArray(r["lignes"]) ? r["lignes"].map(lireLigne) : [];
  if (lignes.length === 0 || lignes.some((l) => l === null)) return null;
  const sures = lignes as LigneRendue[];
  // La somme du détail doit être le total : sinon, rien n'est dit plutôt qu'un chiffre faux.
  if (sures.reduce((s, l) => s + l.rendu, 0) !== total) return null;
  const g = r["gaulois"];
  const gaulois =
    g && typeof g === "object"
      ? { tenue: (g as Record<string, unknown>)["tenue"] ?? null, familier: texte((g as Record<string, unknown>)["familier"]), banniere: texte((g as Record<string, unknown>)["banniere"]) }
      : null;
  return { n, discord: discord && DISCORD_ID.test(discord) ? discord : null, nom, total, gaulois, lignes: sures };
}

/** La réponse de `rendus_des_prix`, ou null si elle n'a pas la forme attendue (rien n'est alors envoyé). */
export function lireRendusDesPrix(raw: unknown): RendusDesPrix | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r["ok"] !== true) return null;
  const comptes = entier(r["comptes"]);
  const total = entier(r["total"]);
  if (comptes === null || comptes < 0 || total === null || total < 0) return null;
  const jusquA = r["jusqu_a"] === null || r["jusqu_a"] === undefined ? null : entier(r["jusqu_a"]);
  const rendus = Array.isArray(r["rendus"]) ? r["rendus"].map(lireJoueur) : [];
  if (rendus.some((x) => x === null)) return null;
  const le = texte(r["le"]);
  return { comptes, total, le: le && !Number.isNaN(Date.parse(le)) ? le : null, jusquA, rendus: rendus as RenduDUnJoueur[] };
}

/* ---------- En mots ---------- */

/** « 1 statère », « 2 500 statères ». */
export const enStateres = (n: number): string => `${fmtInt(n)} ${Math.abs(n) > 1 ? "statères" : "statère"}`;

/** Le nom à l'écran d'une pochette : à l'écran du jeu, « Les pochettes » s'appellent « Les boosters ». */
export const NOMS_DES_BOOSTERS: Readonly<Record<"pochette_familiers" | "pochette_bannieres" | "pochette_modeles", string>> = {
  pochette_familiers: "Booster des familiers",
  pochette_bannieres: "Booster des bannières",
  pochette_modeles: "Booster des Gaulois uniques",
};

const NOMS_DES_ARTICLES: Readonly<Record<"banniere" | "carte" | "cadre" | "modele", string>> = {
  banniere: "Bannière",
  carte: "Finition de carte",
  cadre: "Cadre de carte",
  modele: "Gaulois unique",
};

/** Le nom d'un article de la boutique, d'après sa liste ; son identifiant si la liste ne le connaît plus. */
export function nomDeLArticle(genre: "banniere" | "carte" | "cadre" | "modele", objet: string | null): string | null {
  if (!objet) return null;
  const trouve = genre === "banniere" ? banniereParId(objet) : genre === "carte" ? finitionParId(objet) : genre === "cadre" ? cadreParId(objet) : modeleParId(objet);
  return trouve?.nom ?? objet;
}

/** Une ligne du détail, en mots : ce qui a été payé, ce que cela coûte aujourd'hui, ce qui est rendu. */
export interface LigneEnMots {
  /** « Bannière « Aube de la bombe H » », « Booster des familiers ». */
  quoi: string;
  /** « Légendaire : payée 7 500, 5 000 après la baisse », « 2 ouverts à 2 000, 1 000 après la baisse ». */
  detail: string;
  rendu: number;
  /** Le genre, pour le dessin (une vignette, une couleur). */
  genre: GenreRendu;
  rarete: Rarete | null;
  objet: string | null;
}

/** « à 2 000 » pour un seul prix, « de 1 500 à 3 000 » pour plusieurs. */
const lesPrix = (prix: readonly number[]): string => {
  const uniques = [...new Set(prix)].sort((a, b) => a - b);
  return uniques.length === 1 ? `à ${fmtInt(uniques[0]!)}` : `de ${fmtInt(uniques[0]!)} à ${fmtInt(uniques.at(-1)!)}`;
};

/**
 * Le détail d'un joueur, dans l'ordre de ses achats : chaque article de la boutique sur sa ligne, chaque sorte de pochette
 * en une ligne (combien, à quel prix, ce qui est rendu), une pochette qui avait rendu une part signalée en clair.
 */
export function lignesEnMots(lignes: readonly LigneRendue[]): LigneEnMots[] {
  const sortie: LigneEnMots[] = [];
  const pochettes = new Map<GenreRendu, LigneRendue[]>();
  for (const l of lignes) {
    if (l.genre === "pochette_familiers" || l.genre === "pochette_bannieres" || l.genre === "pochette_modeles") {
      if (!pochettes.has(l.genre)) {
        pochettes.set(l.genre, []);
        sortie.push({ quoi: NOMS_DES_BOOSTERS[l.genre], detail: "", rendu: 0, genre: l.genre, rarete: null, objet: null });
      }
      pochettes.get(l.genre)!.push(l);
      continue;
    }
    const nom = nomDeLArticle(l.genre, l.objet);
    const feminin = l.genre === "banniere" || l.genre === "carte";
    sortie.push({
      quoi: nom ? `${NOMS_DES_ARTICLES[l.genre]} « ${nom} »` : NOMS_DES_ARTICLES[l.genre],
      detail: `${l.rarete ? `${RARETES[l.rarete].nom} : ` : ""}payé${feminin ? "e" : ""} ${fmtInt(l.paye)}, ${fmtInt(l.nouveau)} après la baisse`,
      rendu: l.rendu,
      genre: l.genre,
      rarete: l.rarete,
      objet: l.objet,
    });
  }
  for (const ligne of sortie) {
    const groupe = pochettes.get(ligne.genre);
    if (!groupe) continue;
    const parts = groupe.filter((l) => l.dejaRendu > 0).length;
    const n = groupe.length;
    ligne.rendu = groupe.reduce((s, l) => s + l.rendu, 0);
    ligne.detail =
      `${n} ${n > 1 ? "ouverts" : "ouvert"} ${lesPrix(groupe.map((l) => l.paye))}, ${lesPrix(groupe.map((l) => l.nouveau)).replace(/^à /, "")} après la baisse` +
      (parts > 0 ? ` ; ${parts === n ? (n > 1 ? "tous avaient" : "il avait") : `${parts} sur ${n} ${parts > 1 ? "avaient" : "avait"}`} rendu une part, déduite` : "");
  }
  return sortie;
}

/* ---------- Le message public ---------- */

/** Au-dessous de ce nombre de joueurs remboursés, le message public ne donne pas la somme rendue à tous. */
export const COMPTES_POUR_LE_TOTAL = 5;

/** La somme rendue à tous et le nombre de joueurs, pour le message public ; null s'ils sont trop peu. */
export function totalPublic(r: Pick<RendusDesPrix, "comptes" | "total">): { comptes: number; total: number } | null {
  return r.comptes >= COMPTES_POUR_LE_TOTAL && r.total > 0 ? { comptes: r.comptes, total: r.total } : null;
}

/** Une ligne du tableau des prix : avant le 21 novembre 2026, et maintenant. */
export interface PrixAvantMaintenant {
  quoi: string;
  avant: string;
  maintenant: string;
}

const deA = (a: number, b: number) => `${fmtInt(a)} à ${fmtInt(b)}`;

/**
 * Les prix qui ont baissé (migration 20261121000500) : les anciens écrits en clair, les nouveaux lus dans le contrat. Les
 * bannières, finitions et cadres vont du commun au légendaire, aux prix de départ des objets.
 */
export const PRIX_BAISSES: readonly PrixAvantMaintenant[] = [
  { quoi: "Gaulois uniques", avant: deA(11500, 28000), maintenant: deA(PRIX_MODELE_PAR_RARETE.commun, PRIX_MODELE_PAR_RARETE.legendaire) },
  { quoi: "Booster des Gaulois uniques", avant: fmtInt(3000), maintenant: fmtInt(PRIX_POCHETTE_MODELES) },
  { quoi: "Bannières, finitions et cadres", avant: deA(3 * PRIX_PAR_RARETE.commun, 3 * PRIX_PAR_RARETE.legendaire), maintenant: deA(FOIS_LE_PRIX_D_UN_OBJET * PRIX_PAR_RARETE.commun, FOIS_LE_PRIX_D_UN_OBJET * PRIX_PAR_RARETE.legendaire) },
  { quoi: "Booster des bannières", avant: fmtInt(1500), maintenant: fmtInt(PRIX_POCHETTE_BANNIERES) },
  { quoi: "Booster des familiers", avant: fmtInt(2000), maintenant: fmtInt(PRIX_POCHETTE_FAMILIERS) },
];

/** Pourquoi les prix ont baissé, et ce qui est rendu : les phrases du message public, en français simple. */
export const POURQUOI_LES_PRIX_BAISSENT =
  "Ces objets étaient trop chers pour ce que rapportent les parties avec le clan.";
export const CE_QUI_EST_RENDU =
  "Chaque achat payé avant la baisse vous rend ce qu'il aurait coûté de moins au nouveau prix. Un booster qui vous avait rendu une part de son prix rend la différence, cette part déduite. Rien pour un booster offert par la loterie.";
export const CE_QUI_NE_CHANGE_PAS = "Les objets, le booster surprise, le booster de statères et toutes les chances ne changent pas.";
export const OU_VOIR_SON_MONTANT = "Votre montant est déjà dans votre bourse, dans Mon Gaulois. Le robot vous l'envoie aussi en message privé, si vous les acceptez.";
