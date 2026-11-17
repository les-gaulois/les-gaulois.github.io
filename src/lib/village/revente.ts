import { EMPLACEMENTS_OBJETS, OBJETS } from "../gaulois";
import type { RefObjet } from "./contrat";

/**
 * La revente au jeu (17 novembre 2026, demande du pilote : « revendre au système 70 % de la valeur de son cosmétique » ;
 * puis « achetés 70 %, le reste 50 % »). Migration `20261117000400_revente_au_jeu.sql`, qui dit toute la règle : le jeu ne
 * rend que sur un paiement noté au journal des statères, une fois par paiement, pour ne créer aucun statère.
 *
 * - Acheté à la boutique : 70 % du prix de sa rareté, ou de ce qui avait été payé si c'était moins (l'étal du sentier).
 * - Tiré d'une pochette surprise payée : 50 %.
 * - Reçu sans payer (palier du sentier, pochette gagnée à la loterie, fusion à la forge), acheté au marché, ou divin : ne
 *   se revend pas au jeu.
 *
 * Ici, seulement la lecture des réponses et les mots de l'écran : le serveur décide de tout.
 */

/** D'où vient le droit de revente : un achat à la boutique, ou une pochette surprise payée. */
export type ClasseDeRevente = "achat" | "pochette";

/** Un objet de l'inventaire qui peut partir, et ce que le jeu rendrait pour lui. */
export interface ObjetRevendable extends RefObjet {
  rendu: number;
  classe: ClasseDeRevente;
  quantite: number;
}

/** `get_ma_revente()` : le solde, les deux parts en pour cent, et ce qui peut se revendre maintenant. */
export interface MaRevente {
  solde: number;
  taux: { achat: number; pochette: number };
  objets: ObjetRevendable[];
}

/** `revendre_objet(…)` : ce que le jeu a rendu, le solde, et les exemplaires qui restent. */
export interface ReventeFaite {
  solde: number;
  rendu: number;
  objet: RefObjet;
  reste: number;
}

const estObjet = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const entier = (v: unknown, minimum: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= minimum;
const pourCent = (v: unknown): v is number => entier(v, 1) && v <= 100;

/** Un objet de la garde-robe que ce site connaît, ou `null`. */
function lireRef(v: unknown): RefObjet | null {
  if (!estObjet(v)) return null;
  const emplacement = EMPLACEMENTS_OBJETS.find((e) => e === v["emplacement"]);
  const objet = v["objet"];
  if (!emplacement || typeof objet !== "string" || !Object.prototype.hasOwnProperty.call(OBJETS[emplacement], objet)) return null;
  return { emplacement, objet };
}

/**
 * La réponse de `get_ma_revente()`, ou `null` si elle est illisible. Un objet que ce site ne connaît pas encore est laissé
 * de côté sans cacher les autres ; une ligne mal formée rend la réponse illisible.
 */
export function lireMaRevente(reponse: unknown): MaRevente | null {
  if (!estObjet(reponse) || reponse["ok"] !== true || !entier(reponse["solde"], 0) || !Array.isArray(reponse["objets"])) return null;
  const taux = reponse["taux"];
  if (!estObjet(taux) || !pourCent(taux["achat"]) || !pourCent(taux["pochette"])) return null;
  const objets: ObjetRevendable[] = [];
  for (const ligne of reponse["objets"]) {
    if (!estObjet(ligne)) return null;
    const { rendu, classe, quantite } = ligne;
    if (!entier(rendu, 1) || !entier(quantite, 1) || (classe !== "achat" && classe !== "pochette")) return null;
    const ref = lireRef(ligne);
    if (ref) objets.push({ ...ref, rendu, classe, quantite });
  }
  return { solde: reponse["solde"], taux: { achat: taux["achat"], pochette: taux["pochette"] }, objets };
}

/** La réponse de `revendre_objet(…)`, ou `null` si elle est illisible. */
export function lireRevente(reponse: unknown): ReventeFaite | null {
  if (!estObjet(reponse) || reponse["ok"] !== true) return null;
  const { solde, rendu, reste } = reponse;
  const objet = lireRef(reponse["objet"]);
  if (!entier(solde, 0) || !entier(rendu, 1) || !entier(reste, 0) || !objet) return null;
  return { solde, rendu, objet, reste };
}

/** La règle, en une phrase, en tête de la fenêtre : les deux parts viennent du serveur. */
export function regleDeLaRevente(taux: MaRevente["taux"]): string {
  return `Un objet acheté à la boutique se revend ${taux.achat} % de son prix ; tiré d'une pochette payée, ${taux.pochette} %. Un objet reçu sans payer (sentier, loterie, forge) ou acheté au marché ne se revend pas au jeu.`;
}

/** D'où vient ce que le jeu rend pour cet objet. */
export function motsDeLaClasse(classe: ClasseDeRevente, taux: MaRevente["taux"]): string {
  return classe === "achat" ? `Acheté à la boutique : ${taux.achat} % de son prix, ou de ce que vous aviez payé si c'était moins.` : `Tiré d'une pochette payée : ${taux.pochette} % de son prix.`;
}

const REFUS: Readonly<Record<string, string>> = {
  pas_possede: "Cet objet n'est plus dans votre inventaire.",
  pas_revendable: "Cet objet ne se revend pas au jeu : il n'a pas été acheté à la boutique ni tiré d'une pochette payée.",
  objet_porte: "Votre Gaulois porte cet objet et vous n'en avez qu'un : retirez-le d'abord.",
  objet_grave: "Cet objet est gravé à la forge et vous n'en avez qu'un : il reste à vous.",
  achete_au_marche: "Il ne vous reste que l'exemplaire acheté au marché : il ne se revend pas au jeu.",
  prix_change: "Ce que le jeu rend a changé. Fermez la fenêtre et rouvrez-la.",
  mode_god: "Le mode GOD est allumé : rien ne se revend pendant l'essai.",
};

/** Les mots d'un refus de la revente ; `null` pour un code qui n'est pas le sien. */
export const messageDeLaRevente = (code: string): string | null => REFUS[code] ?? null;
