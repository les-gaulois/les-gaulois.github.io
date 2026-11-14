/**
 * L'onglet « Village » de la Direction (docs/DIRECTION.md, « Le village des Gaulois ») : l'économie du village en totaux,
 * et le réglage des prix et des chances. Des calculs purs, sans rien de Node ; l'écran est
 * `src/components/compte/DirectionVillage.tsx`, le serveur la migration `20261113002100_village_direction.sql`.
 *
 * Le serveur décide de tout : il ne donne que des totaux, cache un chiffre qui viendrait de moins de 5 comptes (`null`) et
 * revérifie chaque réglage. Ici, la lecture prudente de ses réponses, et le contrôle des réglages avant l'envoi, en phrases
 * simples, en s'appuyant sur la mesure de l'économie (`controlerReglages` de `economie.ts`) : ce que le serveur refuserait
 * bloque l'envoi ; ce que la mesure trouve en plus (une pochette plus chère que ce qu'elle vaut en moyenne) est seulement dit.
 */
import { errorMessage } from "../compte/errors";
import { fmtInt } from "../format";
import { OBJETS, ORDRE_RARETES, RARETES, type Rarete } from "../gaulois";
import { frNumber } from "../nombre";
import { CHANCES_POCHETTE, PRIX_PAR_RARETE, PRIX_POCHETTE } from "./contrat";
import { controlerReglages, objetsParRarete, valeurMoyennePochette, type Catalogue } from "./economie";
import { lirePlafond, type VieDuVillage } from "./vie-releve";

/** Un nombre par rareté. */
export type ParRarete = Record<Rarete, number>;

/** Un chiffre depuis le début du village, et sur les 30 derniers jours. */
export interface ParPeriode<T> {
  total: T;
  trente_jours: T;
}

/** Les réglages en vigueur, tels que le serveur les donne. `objets_payants` : les objets que la boutique vend, par rareté. */
export interface ReglagesEnVigueur {
  prix: ParRarete;
  prix_maj_le: string | null;
  pochette: { prix: number; chances: ParRarete; maj_le: string | null };
  objets_payants: ParRarete;
}

/**
 * La réponse de `get_village_economie()`. Un chiffre `null` n'est pas donné : il viendrait de moins de `seuil` comptes
 * (ou une soustraction le redonnerait). Ce n'est pas zéro. `releve` : la dernière relecture des parties, `null` si jamais.
 * `debut` : la première ligne du journal des statères, `null` s'il est vide.
 */
export interface EconomieDuVillage {
  ok: true;
  lu_le: string;
  seuil: number;
  debut: string | null;
  releve: string | null;
  gaulois: ParPeriode<number>;
  comptes_credites: ParPeriode<number>;
  distribues: ParPeriode<number | null>;
  depenses: ParPeriode<number | null>;
  boutique: ParPeriode<number | null>;
  pochettes: ParPeriode<number | null>;
  circulation: number | null;
  achats: ParPeriode<ParRarete | null>;
  ouvertures: ParPeriode<ParRarete | null>;
  reglages: ReglagesEnVigueur;
}

/** Les réglages qu'on envoie : les cinq prix, et la pochette (son prix et ses chances). */
export interface Reglages {
  prix: ParRarete;
  pochette: { prix: number; chances: ParRarete };
}

/** Les réglages du pilote (13 novembre 2026), ceux du contrat : le bouton « Revenir aux réglages du pilote » les remet. */
export const REGLAGES_DU_PILOTE: Readonly<Reglages> = {
  prix: { ...PRIX_PAR_RARETE },
  pochette: { prix: PRIX_POCHETTE, chances: { ...CHANCES_POCHETTE } },
};

/** Les bornes du serveur : un prix de 1 à 1 000 000 statères. */
export const PRIX_MAX = 1_000_000;

// ---------------------------------------------------------------------------------------------------------------------
// La lecture de la réponse
// ---------------------------------------------------------------------------------------------------------------------

const sommeDesChances = (chances: ParRarete): number => ORDRE_RARETES.reduce((s, r) => s + chances[r], 0);
const estObjet = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const entier = (v: unknown, min: number): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min;
const date = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));

/** Levée quand une partie de la réponse est illisible : toute la réponse est alors écartée. */
class Illisible extends Error {}

function lireEntier(v: unknown, min = 0): number {
  if (!entier(v, min)) throw new Illisible();
  return v;
}
/** Un chiffre caché (`null`) ou un entier positif ou nul. */
function lireChiffre(v: unknown): number | null {
  return v === null ? null : lireEntier(v);
}
function lireDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (!date(v)) throw new Illisible();
  return v;
}
function lirePeriode<T>(v: unknown, lire: (x: unknown) => T): ParPeriode<T> {
  if (!estObjet(v)) throw new Illisible();
  return { total: lire(v["total"]), trente_jours: lire(v["trente_jours"]) };
}
function lireParRarete(v: unknown, lire: (x: unknown) => number): ParRarete {
  if (!estObjet(v)) throw new Illisible();
  return Object.fromEntries(ORDRE_RARETES.map((r) => [r, lire(v[r])])) as ParRarete;
}
const lireNombres = (v: unknown): ParRarete | null => (v === null ? null : lireParRarete(v, (x) => lireEntier(x)));

/** Les chances lues : de 0 à 100 pour cent chacune, 100 en tout (à deux décimales près, comme la table du serveur). */
function lireChances(v: unknown): ParRarete {
  const chances = lireParRarete(v, (x) => {
    if (typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > 100) throw new Illisible();
    return x;
  });
  if (Math.abs(sommeDesChances(chances) - 100) > 1e-6) throw new Illisible();
  return chances;
}

function lireReglagesEnVigueur(v: unknown): ReglagesEnVigueur {
  if (!estObjet(v) || !estObjet(v["pochette"])) throw new Illisible();
  const pochette = v["pochette"];
  return {
    prix: lireParRarete(v["prix"], (x) => lireEntier(x, 1)),
    prix_maj_le: lireDate(v["prix_maj_le"]),
    pochette: { prix: lireEntier(pochette["prix"], 1), chances: lireChances(pochette["chances"]), maj_le: lireDate(pochette["maj_le"]) },
    objets_payants: lireParRarete(v["objets_payants"], (x) => lireEntier(x)),
  };
}

/**
 * La réponse de `get_village_economie`, vérifiée : `null` si une seule partie est illisible (l'écran dit alors que la
 * réponse est illisible, plutôt que d'afficher un chiffre faux). Un chiffre `null` reste `null` : il n'est pas donné.
 */
export function lireEconomie(reponse: unknown): EconomieDuVillage | null {
  if (!estObjet(reponse) || reponse["ok"] !== true) return null;
  try {
    const luLe = lireDate(reponse["lu_le"]);
    if (luLe === null) return null;
    return {
      ok: true,
      lu_le: luLe,
      seuil: lireEntier(reponse["seuil"], 1),
      debut: lireDate(reponse["debut"]),
      releve: lireDate(reponse["releve"]),
      gaulois: lirePeriode(reponse["gaulois"], (x) => lireEntier(x)),
      comptes_credites: lirePeriode(reponse["comptes_credites"], (x) => lireEntier(x)),
      distribues: lirePeriode(reponse["distribues"], lireChiffre),
      depenses: lirePeriode(reponse["depenses"], lireChiffre),
      boutique: lirePeriode(reponse["boutique"], lireChiffre),
      pochettes: lirePeriode(reponse["pochettes"], lireChiffre),
      circulation: lireChiffre(reponse["circulation"]),
      achats: lirePeriode(reponse["achats"], lireNombres),
      ouvertures: lirePeriode(reponse["ouvertures"], lireNombres),
      reglages: lireReglagesEnVigueur(reponse["reglages"]),
    };
  } catch (e) {
    if (e instanceof Illisible) return null;
    throw e;
  }
}

/**
 * La réponse d'un réglage (`regler_village_prix` ou `regler_village_pochette`) : `change` dit si quelque chose a changé
 * (sinon rien n'est noté au journal). `null` si elle est illisible.
 */
export function lireReglage(reponse: unknown): { change: boolean } | null {
  if (!estObjet(reponse) || reponse["ok"] !== true || typeof reponse["change"] !== "boolean") return null;
  return { change: reponse["change"] };
}

// ---------------------------------------------------------------------------------------------------------------------
// Ce que l'écran écrit
// ---------------------------------------------------------------------------------------------------------------------

/** Un chiffre caché, en mots : il n'est pas donné, ce n'est pas zéro. */
export const PAS_DONNE = "pas donné";

/** Pourquoi un chiffre n'est pas donné. */
export const pourquoiCache = (seuil: number): string => `moins de ${fmtInt(seuil)} comptes`;

/** Un nombre de statères en toutes lettres : « 1 statère », « 2 500 statères ». */
export const stateres = (n: number): string => `${fmtInt(n)} ${n > 1 ? "statères" : "statère"}`;

/** Le nom d'une rareté, avec sa majuscule (« Peu commun ») ou en minuscules dans une phrase (« peu commun »). */
export const nomRarete = (r: Rarete, majuscule = true): string => (majuscule ? RARETES[r].nom : RARETES[r].nom.toLowerCase());

/** La somme des chances, dite en mots : 100 en tout, ou ce qu'il manque, ou ce qu'il y a de trop. */
export function sommeEnMots(somme: number): string {
  const total = `Les chances font ${fmtInt(somme)} pour cent en tout`;
  if (somme === 100) return `${total}.`;
  return somme < 100 ? `${total} : il en manque ${fmtInt(100 - somme)}.` : `${total} : ${fmtInt(somme - 100)} de trop.`;
}

/** Les réglages du pilote, en une phrase, tirés du contrat. */
export function reglagesDuPiloteEnMots(): string {
  const liste = (valeurs: number[]) => `${valeurs.slice(0, -1).map(fmtInt).join(", ")} et ${fmtInt(valeurs.at(-1) ?? 0)}`;
  const p = REGLAGES_DU_PILOTE;
  return `Prix de ${liste(ORDRE_RARETES.map((r) => p.prix[r]))} statères, du commun au légendaire ; pochette à ${stateres(p.pochette.prix)} ; chances de ${liste(ORDRE_RARETES.map((r) => p.pochette.chances[r]))} pour cent.`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Le formulaire : saisie, contrôle avant l'envoi, changements à confirmer
// ---------------------------------------------------------------------------------------------------------------------

/** Ce que contiennent les champs du formulaire, tel quel. */
export interface Saisie {
  prix: Record<Rarete, string>;
  prixPochette: string;
  chances: Record<Rarete, string>;
}

/** Les champs remplis avec des réglages : ceux en vigueur, ou ceux du pilote. */
export function saisieDe(r: Reglages): Saisie {
  return {
    prix: Object.fromEntries(ORDRE_RARETES.map((x) => [x, String(r.prix[x])])) as Record<Rarete, string>,
    prixPochette: String(r.pochette.prix),
    chances: Object.fromEntries(ORDRE_RARETES.map((x) => [x, String(r.pochette.chances[x])])) as Record<Rarete, string>,
  };
}

/** Un nombre entier tapé : des chiffres, avec ou sans espaces entre les milliers (« 1 000 »). `null` sinon. */
export function lireNombreTape(texte: string): number | null {
  const sansEspaces = texte.replace(/\s/g, "");
  if (!/^\d{1,9}$/.test(sansEspaces)) return null;
  return Number(sansEspaces);
}

/** Un problème qui bloque l'envoi : le champ en cause (son suffixe d'identifiant), et une phrase simple. */
export interface Probleme {
  champ: string;
  texte: string;
}

export interface Controle {
  /** Ce que le serveur refuserait : l'envoi attend qu'ils soient corrigés. */
  problemes: Probleme[];
  /** Ce qui mérite d'être lu avant de confirmer, sans bloquer. */
  avertissements: string[];
  /** La somme des chances, si chaque chance se lit. */
  somme: number | null;
  /** Les réglages à envoyer, s'il n'y a aucun problème. */
  reglages: Reglages | null;
}

/** L'identifiant (suffixe) de chaque champ : `prix-commun`, `prix-pochette`, `chance-commun`, et `chances` pour leur somme. */
export const champPrix = (r: Rarete): string => `prix-${r}`;
export const champChance = (r: Rarete): string => `chance-${r}`;
export const CHAMP_PRIX_POCHETTE = "prix-pochette";
export const CHAMP_SOMME = "chances";

/**
 * Le contrôle avant l'envoi : les mêmes règles que le serveur (prix entiers de 1 à 1 000 000 statères, chaque rareté plus
 * chère que la précédente ; pochette au prix entier de 1 à 1 000 000 ; chances entières de 0 à 100, 100 en tout ; une
 * rareté qui a une chance a des objets à vendre), en phrases simples, champ par champ. Puis la mesure de l'économie
 * (`controlerReglages`) : ce qu'elle trouve en plus est un avertissement.
 */
export function controlerSaisie(saisie: Saisie, catalogue: Catalogue = OBJETS): Controle {
  const problemes: Probleme[] = [];
  const prix = {} as ParRarete;
  const chances = {} as ParRarete;
  const aVendre = objetsParRarete(catalogue);

  ORDRE_RARETES.forEach((r, i) => {
    const p = lireNombreTape(saisie.prix[r]);
    if (p === null || p < 1 || p > PRIX_MAX) {
      problemes.push({ champ: champPrix(r), texte: `${nomRarete(r)} : un nombre entier de statères, de 1 à ${fmtInt(PRIX_MAX)}.` });
      return;
    }
    prix[r] = p;
    const dessous = ORDRE_RARETES[i - 1];
    const prixDessous = dessous === undefined ? undefined : prix[dessous];
    if (dessous !== undefined && prixDessous !== undefined && p <= prixDessous) {
      problemes.push({ champ: champPrix(r), texte: `${nomRarete(r)} : il doit coûter plus qu'un objet ${nomRarete(dessous, false)} (${stateres(prixDessous)}).` });
    }
  });

  const prixPochette = lireNombreTape(saisie.prixPochette);
  if (prixPochette === null || prixPochette < 1 || prixPochette > PRIX_MAX) {
    problemes.push({ champ: CHAMP_PRIX_POCHETTE, texte: `Pochette : un nombre entier de statères, de 1 à ${fmtInt(PRIX_MAX)}.` });
  }

  let lisibles = true;
  for (const r of ORDRE_RARETES) {
    const c = lireNombreTape(saisie.chances[r]);
    if (c === null || c > 100) {
      lisibles = false;
      problemes.push({ champ: champChance(r), texte: `Chance du ${nomRarete(r, false)} : un nombre entier de 0 à 100.` });
      continue;
    }
    chances[r] = c;
    if (c > 0 && aVendre[r].length === 0) {
      problemes.push({ champ: champChance(r), texte: `${nomRarete(r)} : aucun objet de cette rareté n'est à vendre, sa chance doit rester à 0.` });
    }
  }
  const somme = lisibles ? sommeDesChances(chances) : null;
  if (somme !== null && somme !== 100) problemes.push({ champ: CHAMP_SOMME, texte: sommeEnMots(somme) });

  if (problemes.length > 0 || prixPochette === null) return { problemes, avertissements: [], somme, reglages: null };

  // La mesure de l'économie : tout ce que le serveur refuserait est déjà écarté plus haut. Ce qu'elle trouve en plus, une
  // pochette plus chère que ce qu'elle vaut en moyenne au prix de la boutique, ne bloque pas : c'est au pilote de choisir.
  const avertissements: string[] = [];
  for (const texte of controlerReglages({ prix, prixPochette, chances, catalogue })) {
    if (texte.startsWith("La pochette (")) {
      const valeur = Math.round(valeurMoyennePochette(chances, prix));
      avertissements.push(`La pochette coûterait plus que ce qu'elle vaut en moyenne, ${stateres(valeur)} au prix de la boutique : l'ouvrir ferait perdre des statères.`);
    } else {
      // Un cas que les contrôles ci-dessus n'ont pas vu : on bloque plutôt que d'envoyer un réglage absurde.
      problemes.push({ champ: CHAMP_SOMME, texte });
    }
  }
  if (problemes.length > 0) return { problemes, avertissements: [], somme, reglages: null };
  return { problemes, avertissements, somme, reglages: { prix, pochette: { prix: prixPochette, chances } } };
}

/** Ce que l'enregistrement changerait, en phrases, et ce qu'il faut envoyer au serveur (`null` : rien à envoyer). */
export interface Changements {
  lignes: string[];
  prix: ParRarete | null;
  pochette: { p_prix: number; p_chances: ParRarete } | null;
}

/** Les changements entre les réglages en vigueur et ceux du formulaire, une phrase par valeur, dans l'ordre du formulaire. */
export function changements(avant: Reglages, apres: Reglages): Changements {
  const lignes: string[] = [];
  for (const r of ORDRE_RARETES) {
    if (avant.prix[r] !== apres.prix[r]) lignes.push(`${nomRarete(r)} : de ${fmtInt(avant.prix[r])} à ${stateres(apres.prix[r])}.`);
  }
  const prixChange = lignes.length > 0;
  const lignesPochette: string[] = [];
  if (avant.pochette.prix !== apres.pochette.prix) lignesPochette.push(`Pochette : de ${fmtInt(avant.pochette.prix)} à ${stateres(apres.pochette.prix)}.`);
  for (const r of ORDRE_RARETES) {
    const a = avant.pochette.chances[r];
    const b = apres.pochette.chances[r];
    if (a !== b) lignesPochette.push(`Chance du ${nomRarete(r, false)} : de ${fmtInt(a)} à ${fmtInt(b)} pour cent.`);
  }
  return {
    lignes: [...lignes, ...lignesPochette],
    prix: prixChange ? { ...apres.prix } : null,
    pochette: lignesPochette.length > 0 ? { p_prix: apres.pochette.prix, p_chances: { ...apres.pochette.chances } } : null,
  };
}

/** Les réglages en vigueur, sous la forme de ceux qu'on envoie. */
export const reglagesDe = (r: ReglagesEnVigueur): Reglages => ({ prix: { ...r.prix }, pochette: { prix: r.pochette.prix, chances: { ...r.pochette.chances } } });

/** Le formulaire est-il celui des réglages en vigueur ? Champ par champ, tel que tapé. */
export function memeSaisie(a: Saisie, b: Saisie): boolean {
  const propre = (t: string) => t.replace(/\s/g, "");
  return (
    propre(a.prixPochette) === propre(b.prixPochette) &&
    ORDRE_RARETES.every((r) => propre(a.prix[r]) === propre(b.prix[r]) && propre(a.chances[r]) === propre(b.chances[r]))
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Les bulles des Gaulois (migration 20261113002300) : ce que l'onglet en écrit. La réponse se lit par `lireVieDuVillage`,
// le plafond saisi par `lirePlafond`, tous deux dans `vie-releve.ts`.
// ---------------------------------------------------------------------------------------------------------------------

const ESPACE_INSECABLE = String.fromCharCode(0xa0);
const auCentime = frNumber({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
const prixFin = frNumber({ minimumFractionDigits: 2, maximumFractionDigits: 4 });
const moisLong = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", month: "long", year: "numeric" });

/**
 * Une somme en dollars, la monnaie de la facture d'Anthropic : « 10 $ », « 12,50 $ », « 0,42 $ ». Une dépense de moins d'un
 * demi-centime, qui s'écrirait « 0,00 $ », s'écrit « moins de 0,01 $ » : jamais un zéro qui n'en est pas un.
 */
export function dollars(n: number): string {
  if (n > 0 && n < 0.005) return `moins de 0,01${ESPACE_INSECABLE}$`;
  return `${Number.isInteger(n) ? fmtInt(n) : auCentime.format(n)}${ESPACE_INSECABLE}$`;
}

/** Le premier jour d'un mois (« 2026-10-01 »), en mots : « octobre 2026 ». Tel quel s'il ne se lit pas. */
export function moisEnMots(mois: string): string {
  const date = new Date(`${mois.slice(0, 10)}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}/.test(mois) && Number.isFinite(date.getTime()) ? moisLong.format(date) : mois;
}

/**
 * La dépense du mois et le plafond, en trois morceaux : ce qui précède la somme, la somme, ce qui la suit. L'écran écrit la
 * somme en grand ; bout à bout, les trois morceaux font la phrase de `phraseDeLaDepense`.
 */
export const depenseEnMorceaux = (vie: VieDuVillage): [string, string, string] => ["Dépense du mois : ", dollars(vie.depense.cout), ` sur un plafond de ${dollars(vie.plafond)}.`];

/** La dépense du mois et le plafond, en une phrase. */
export const phraseDeLaDepense = (vie: VieDuVillage): string => depenseEnMorceaux(vie).join("");

/** Les couleurs d'état de la Direction dont l'onglet se sert (`DirTon` de `direction-kit.tsx`). */
export type TonDuVillage = "ok" | "warn" | "danger";

/**
 * L'état des bulles, d'un mot et d'une couleur, jamais l'une sans l'autre : rouge « Coupées » quand l'encadrement les a
 * coupées (cela passe avant le plafond : rien ne s'écrit, plafond ou pas), jaune « Plafond atteint » quand le serveur dit
 * que la dépense du mois l'a atteint, vert « Permises » sinon. C'est le serveur qui dit si le plafond est atteint
 * (`plafond_atteint`) : l'écran ne le recalcule pas.
 */
export function pastilleDesBulles(vie: Pick<VieDuVillage, "bulles" | "plafond_atteint">): { ton: TonDuVillage; mot: string } {
  if (!vie.bulles) return { ton: "danger", mot: "Coupées" };
  if (vie.plafond_atteint) return { ton: "warn", mot: "Plafond atteint" };
  return { ton: "ok", mot: "Permises" };
}

/**
 * La longueur de la jauge de la dépense, de 0 à 100 : la part du plafond déjà dépensée. Pleine quand le serveur dit le
 * plafond atteint (un plafond de 0 dollar compris) ; jamais pleine sinon, même si l'arrondi le voudrait ; vide sans dépense.
 * Une dépense qui existe a toujours un trait, même infime.
 */
export function partDuPlafond(vie: Pick<VieDuVillage, "plafond" | "plafond_atteint"> & { depense: Pick<VieDuVillage["depense"], "cout"> }): number {
  if (vie.plafond_atteint) return 100;
  const cout = vie.depense.cout;
  if (!(cout > 0) || !(vie.plafond > 0)) return 0;
  return Math.min(99, Math.max(1, (cout / vie.plafond) * 100));
}

/**
 * L'état du formulaire des prix et des chances, d'un mot et d'une couleur : rouge « À corriger » tant que le contrôle montre
 * un problème, jaune « Modifié, pas enregistré » dès qu'un champ diffère des réglages en vigueur, vert « En vigueur » sinon.
 */
export function etatDuFormulaire(modifie: boolean, problemes: number): { ton: TonDuVillage; mot: string } {
  if (problemes > 0) return { ton: "danger", mot: "À corriger" };
  if (modifie) return { ton: "warn", mot: "Modifié, pas enregistré" };
  return { ton: "ok", mot: "En vigueur" };
}

/** Les bulles permises ou coupées, en une phrase. */
export const etatDesBulles = (vie: VieDuVillage): string =>
  vie.bulles ? "Les bulles sont permises." : "Les bulles sont coupées : la place n'en montre aucune, et Claude n'est plus appelé.";

/** Quand le plafond est atteint : il n'y a plus de nouvelle bulle jusqu'au mois suivant. */
export const PLAFOND_ATTEINT = "Plafond atteint : plus de nouvelle bulle avant le 1er du mois prochain.";

/** Le modèle et son prix, en mots. */
export const prixDuModele = (vie: VieDuVillage): string =>
  `Modèle ${vie.modele} : ${prixFin.format(vie.prix.entree)}${ESPACE_INSECABLE}$ par million de jetons envoyés à Claude, ${prixFin.format(vie.prix.sortie)}${ESPACE_INSECABLE}$ par million de jetons écrits par lui.`;

/** Une seule fois dans le bloc : qui écrit les bulles, à partir de quoi, et en quelle monnaie se compte la dépense. */
export const D_OU_VIENNENT_LES_BULLES =
  "Les phrases des bulles sont écrites par Claude (Anthropic) à partir de faits sans identité : l'heure, le lieu du Gaulois, les points de sa dernière partie, ses objets. La dépense se compte en dollars, la monnaie d'Anthropic.";

/** Le plafond en vigueur, tel qu'on le tape : « 10 », « 12,5 ». */
export const plafondEnSaisie = (plafond: number): string => String(plafond).replace(".", ",");

/** Le plafond saisi, relu par `lirePlafond` : sa valeur, ou le message du serveur ; `change` : il diffère du plafond en vigueur. */
export function controlerPlafond(saisie: string, enVigueur: number): { valeur: number | null; probleme: string | null; change: boolean } {
  const valeur = lirePlafond(saisie);
  if (valeur === null) return { valeur, probleme: errorMessage("invalid_plafond"), change: false };
  return { valeur, probleme: null, change: valeur !== enVigueur };
}

/** Ce que l'on confirme avant de changer le plafond, en phrases : le changement, et ce qu'il fait si la dépense l'atteint déjà. */
export function confirmationDuPlafond(vie: VieDuVillage, apres: number): string[] {
  const lignes = [`Le plafond passera de ${dollars(vie.plafond)} à ${dollars(apres)} par mois.`];
  if (vie.depense.cout >= apres) lignes.push(`La dépense du mois, ${dollars(vie.depense.cout)}, l'atteint déjà : plus aucune nouvelle bulle avant le 1er du mois prochain.`);
  return lignes;
}

/** Ce que dit le second clic de « Couper les bulles » ou de « Remettre les bulles ». */
export const confirmationDesBulles = (couper: boolean): string =>
  couper
    ? "La place ne montrera plus aucune bulle, et Claude ne sera plus appelé. « Remettre les bulles » les rendra."
    : "Claude sera de nouveau appelé pour les bulles, dans la limite du plafond du mois.";
