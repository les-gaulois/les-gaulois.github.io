/**
 * Ce que les écrans des familiers déduisent de ce qu'ils ont reçu (15 novembre 2026) : la pochette des familiers sur « La
 * boutique » (`src/components/village/PochetteFamiliers.tsx`, sa ménagerie dans `album-pochette.ts`), le choix du familier montré dans « Mon
 * Gaulois » (`src/components/village/Familiers.tsx`). Des calculs purs : les lignes des
 * chances, la raison d'une pochette fermée, la taille de l'aperçu. Rien ne décide d'un droit, d'un prix ni d'un tirage :
 * le serveur le fait (`contrat.ts`, « Les familiers du Gaulois »), et `familiers.ts` lit ses réponses.
 */
import { ECART_DU_FAMILIER } from "../../../supabase/functions/code-discord/familiers/familier";
import { GAULOIS_LARGEUR, ORDRE_RARETES, RARETES, decrireGaulois, type Rarete, type Tenue } from "../gaulois";
import type { MesFamiliers, PochetteFamiliersReponse } from "./contrat";
import { manque, messageDuRefus, stateres } from "./ecran-boutique";
import { FAMILIERS, chancesPourMoi, familierAPoser, familierDe, familiersParRarete, messageDesFamiliers, restantsParRarete, type Familier } from "./familiers";
import { echelleEntiere } from "./vestiaire-rayons";

/** L'espace qui ne se coupe pas, devant un deux-points. */
const NBSP = String.fromCharCode(0xa0);

/** L'ancre de la pochette des familiers dans l'onglet « Les pochettes » de `/village` : « Mon Gaulois » y mène. */
export const ANCRE_FAMILIERS = "familiers";

/** L'adresse demande-t-elle la pochette des familiers (`/village#familiers`, qui ouvre l'onglet « Les pochettes ») ? */
export const demandeLesFamiliers = (hash: string): boolean => hash === `#${ANCRE_FAMILIERS}`;

/** Les identifiants des familiers du compte. */
export const idsPossedes = (mes: Pick<MesFamiliers, "familiers"> | null): ReadonlySet<string> => new Set((mes?.familiers ?? []).map((ligne) => ligne.familier));

/** Les familiers du compte, dans l'ordre du serveur (les plus récents d'abord). */
export function familiersPossedes(mes: Pick<MesFamiliers, "familiers"> | null, liste: readonly Familier[] = FAMILIERS): Familier[] {
  return (mes?.familiers ?? []).flatMap((ligne) => liste.find((familier) => familier.id === ligne.familier) ?? []);
}

/** Le familier que le compte montre, ou `null`. */
export const familierMontre = (mes: Pick<MesFamiliers, "porte"> | null): Familier | null => familierDe(mes?.porte ?? null);

/** « 12 sur 100 ». */
export const surCombien = (nombre: number, total: number): string => `${nombre} sur ${total}`;

/** Une ligne des chances de la pochette des familiers, pour ce compte. */
export interface LigneDeChance {
  rarete: Rarete;
  nom: string;
  rang: number;
  /** La chance réelle pour ce compte, en pour cent : 0 quand il a déjà tous les familiers de cette rareté. */
  chance: number;
  /** Les familiers de cette rareté qu'il lui reste à recevoir, et combien il y en a en tout. */
  reste: number;
  total: number;
}

/**
 * Les chances de la pochette des familiers pour ce compte, de la rareté la plus courante à la plus rare : celles du
 * serveur, une rareté où il a tout étant sautée (`chancesPourMoi`). `null` quand il n'a plus rien à recevoir.
 */
export function lignesDesChances(chances: Readonly<Record<Rarete, number>>, possedes: ReadonlySet<string>, liste: readonly Familier[] = FAMILIERS): LigneDeChance[] | null {
  const pourMoi = chancesPourMoi(chances, possedes, liste);
  if (!pourMoi) return null;
  const restants = restantsParRarete(possedes, liste);
  const totaux = familiersParRarete(liste);
  return ORDRE_RARETES.map((rarete) => ({ rarete, nom: RARETES[rarete].nom, rang: RARETES[rarete].rang, chance: pourMoi[rarete], reste: restants[rarete], total: totaux[rarete] }));
}

/**
 * Pourquoi ce compte ne peut pas ouvrir la pochette des familiers, dans l'ordre où le serveur refuserait ; `null` s'il le
 * peut. `solde` : le dernier que le serveur a donné.
 */
export function raisonPochetteFermee(mes: Pick<MesFamiliers, "peut_ouvrir" | "pochette" | "familiers">, solde: number, liste: readonly Familier[] = FAMILIERS): string | null {
  if (!mes.peut_ouvrir) return messageDuRefus("not_validated");
  if (!chancesPourMoi(mes.pochette.chances, idsPossedes(mes), liste)) return messageDesFamiliers("tout_possede");
  const ilManque = manque(solde, mes.pochette.prix);
  return ilManque > 0 ? `Il vous manque ${stateres(ilManque)}.` : null;
}

/** Les mots d'un refus de la pochette des familiers. `manque` : les statères qui manquent, quand l'écran le sait. */
export function messageDuRefusDesFamiliers(code: string, contexte: { manque?: number | null } = {}): string {
  if (code === "solde_insuffisant" || code === "not_validated" || code === "no_gaulois") return messageDuRefus(code, contexte);
  return messageDesFamiliers(code);
}

/** Les familiers du compte après une pochette ouverte : le nouveau solde, et le familier reçu en tête. */
export function apresLaPochette(mes: MesFamiliers, reponse: PochetteFamiliersReponse, quand: string): MesFamiliers {
  const recu = reponse.familier.familier;
  return { ...mes, solde: reponse.solde, familiers: [{ familier: recu, acquis_le: quand }, ...mes.familiers.filter((ligne) => ligne.familier !== recu)] };
}

/** Un dessin prêt à peindre : ses cases, rangée par rangée. */
export interface DessinEnCases {
  largeur: number;
  hauteur: number;
  cases: (string | null)[];
}

/** La couleur d'une silhouette : celle de l'écriture du site, que la feuille de style adoucit. */
export const COULEUR_SILHOUETTE = "#0a1230";

const VIGNETTES = new Map<string, DessinEnCases | null>();
const SILHOUETTES = new Map<string, DessinEnCases | null>();

/** Le dessin d'un familier, rogné à son cadre ; `null` pour une grille vide. Calculé une fois par familier. */
export function vignetteDuFamilier(familier: Familier): DessinEnCases | null {
  let vignette = VIGNETTES.get(familier.id);
  if (vignette === undefined) {
    const pose = familierAPoser(familier);
    vignette = pose && { largeur: pose.largeur, hauteur: pose.hauteur, cases: pose.cases };
    VIGNETTES.set(familier.id, vignette);
  }
  return vignette;
}

/** La silhouette d'un familier que le compte n'a pas : la forme de son dessin, d'une seule couleur. */
export function silhouetteDuFamilier(familier: Familier): DessinEnCases | null {
  let silhouette = SILHOUETTES.get(familier.id);
  if (silhouette === undefined) {
    const vignette = vignetteDuFamilier(familier);
    silhouette = vignette && { ...vignette, cases: vignette.cases.map((couleur) => (couleur ? COULEUR_SILHOUETTE : null)) };
    SILHOUETTES.set(familier.id, silhouette);
  }
  return silhouette;
}

/** De combien agrandir un dessin dans une place carrée, en pixels : un nombre entier de fois, de 1 à `maximum`. */
export const echelleDuDessin = (dessin: Pick<DessinEnCases, "largeur" | "hauteur">, place: number, maximum: number): number => echelleEntiere(dessin.largeur, dessin.hauteur, place, maximum);

/**
 * La largeur, en cases, à partir de laquelle l'aperçu du Gaulois et de son familier est « large » : le Gaulois (48 cases),
 * l'écart et un familier de plus de 30 cases (au-delà de « Petit »). La feuille de style réduit alors la taille d'une case.
 */
export const APERCU_LARGE = 80;

/** La largeur, en cases, de l'aperçu du Gaulois avec ce familier : celle de la grille de `apercuAvecFamilier`. */
export function largeurDeLApercu(familier: Familier | null): number {
  const vignette = familier && vignetteDuFamilier(familier);
  return GAULOIS_LARGEUR + (vignette ? ECART_DU_FAMILIER + vignette.largeur : 0);
}

/** La taille de l'aperçu : `null` pour le Gaulois seul, « petit » ou « large » avec son familier. */
export function tailleDeLApercu(familier: Familier | null): "petit" | "large" | null {
  const largeur = largeurDeLApercu(familier);
  if (largeur <= GAULOIS_LARGEUR) return null;
  return largeur > APERCU_LARGE ? "large" : "petit";
}

/** Le texte de remplacement de l'aperçu : le Gaulois, puis son familier s'il en montre un. */
export function decrireLApercu(tenue: Tenue, familier: Familier | null): string {
  const gaulois = decrireGaulois(tenue);
  return familier ? `${gaulois} À côté de lui, son familier${NBSP}: ${familier.nom}.` : gaulois;
}
