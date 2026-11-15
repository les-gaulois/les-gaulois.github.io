/**
 * Les bannières du Gaulois côté site (contrat : `contrat.ts`, « Les bannières du Gaulois » ; serveur : migration
 * 20261115000900_bannieres_du_gaulois ; dessins : `supabase/functions/code-discord/bannieres/`). Des calculs purs, sans
 * rien de Node : la lecture prudente des réponses du serveur, le rangement des bannières à l'écran et la scène d'aperçu
 * (le Gaulois du membre devant une bannière, comme sur /gaulois). Le serveur décide de tout : le prix, le solde, l'achat,
 * la bannière montrée.
 */
import {
  BANNIERES,
  FAMILLES_DES_BANNIERES,
  RARETES_DES_BANNIERES,
  banniereParId,
  dessinDeLaBanniere,
  type Banniere,
  type FamilleDeBanniere,
} from "../../../supabase/functions/code-discord/bannieres/index";
import { familierAPoser, type Familier } from "../../../supabase/functions/code-discord/familiers/familier";
import { casesDeLaScene, DECOR_HAUTEUR, DECOR_LARGEUR } from "../../../supabase/functions/code-discord/gaulois";
import { errorMessage } from "../compte/errors";
import { ORDRE_RARETES, type Rarete, type Tenue } from "../gaulois";
import type { AchatBanniereReponse, BannierePossedee, ChoixBanniereReponse, MesBannieres } from "./contrat";

export { BANNIERES, FAMILLES_DES_BANNIERES, RARETES_DES_BANNIERES, banniereParId, dessinDeLaBanniere, type Banniere, type FamilleDeBanniere };

/** Les familles, dans l'ordre de la boutique. */
export const FAMILLES = Object.keys(FAMILLES_DES_BANNIERES) as FamilleDeBanniere[];

const estObjetJson = (valeur: unknown): valeur is Record<string, unknown> => valeur !== null && typeof valeur === "object" && !Array.isArray(valeur);
const entier = (valeur: unknown, min: number): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= min;
const estRarete = (valeur: unknown): valeur is Rarete => typeof valeur === "string" && (ORDRE_RARETES as readonly string[]).includes(valeur);

/** Le texte d'un refus des bannières : `deja_possede` et `pas_possede` ont leurs mots ici, les autres ceux de tout le site. */
export function messageDesBannieres(code: string): string {
  if (code === "deja_possede") return "Vous avez déjà cette bannière.";
  if (code === "pas_possede") return "Vous n'avez pas cette bannière : achetez-la d'abord à la boutique.";
  return errorMessage(code);
}

/** Les prix : un entier d'au moins 1 statère pour chaque rareté ; sinon `null`. */
function lirePrix(valeur: unknown): Record<Rarete, number> | null {
  if (!estObjetJson(valeur)) return null;
  const prix: Partial<Record<Rarete, number>> = {};
  for (const rarete of ORDRE_RARETES) {
    const p = valeur[rarete];
    if (!entier(p, 1)) return null;
    prix[rarete] = p;
  }
  return prix as Record<Rarete, number>;
}

/**
 * La réponse de `get_mes_bannieres`, vérifiée : `null` si le solde, `peut_acheter` ou les prix sont illisibles. Une
 * bannière inconnue de ce dessin, déjà lue ou mal datée est écartée ; `porte` qui n'est pas une bannière possédée et
 * connue se lit `null` (le décor du lieu).
 */
export function lireMesBannieres(reponse: unknown, liste: readonly Banniere[] = BANNIERES): MesBannieres | null {
  if (!estObjetJson(reponse) || reponse["ok"] !== true) return null;
  const solde = reponse["solde"];
  const peutAcheter = reponse["peut_acheter"];
  const prix = lirePrix(reponse["prix"]);
  const lignes = reponse["bannieres"];
  if (!entier(solde, 0) || typeof peutAcheter !== "boolean" || !prix || !Array.isArray(lignes)) return null;
  const connues = new Set(liste.map((b) => b.id));
  const bannieres: BannierePossedee[] = [];
  const vues = new Set<string>();
  for (const ligne of lignes) {
    if (!estObjetJson(ligne)) continue;
    const { banniere, acquis_le } = ligne;
    if (typeof banniere !== "string" || !connues.has(banniere) || vues.has(banniere)) continue;
    if (typeof acquis_le !== "string" || !Number.isFinite(Date.parse(acquis_le))) continue;
    vues.add(banniere);
    bannieres.push({ banniere, acquis_le });
  }
  const porte = reponse["porte"];
  return { ok: true, solde, peut_acheter: peutAcheter, prix, bannieres, porte: typeof porte === "string" && vues.has(porte) ? porte : null };
}

/** La réponse de `acheter_banniere`, vérifiée : une bannière connue, avec la rareté que la liste lui donne ; sinon `null`. */
export function lireAchatBanniere(reponse: unknown, liste: readonly Banniere[] = BANNIERES): AchatBanniereReponse | null {
  if (!estObjetJson(reponse) || reponse["ok"] !== true || !entier(reponse["solde"], 0)) return null;
  const recue = reponse["banniere"];
  if (!estObjetJson(recue) || typeof recue["banniere"] !== "string" || !estRarete(recue["rarete"])) return null;
  const banniere = liste.find((b) => b.id === recue["banniere"]);
  if (!banniere || banniere.rarete !== recue["rarete"]) return null;
  return { ok: true, solde: reponse["solde"], banniere: { banniere: banniere.id, rarete: banniere.rarete } };
}

/** La réponse de `choisir_banniere`, vérifiée : une bannière connue, ou `null` (le décor du lieu) ; sinon `null` pour toute la réponse. */
export function lireChoixBanniere(reponse: unknown, liste: readonly Banniere[] = BANNIERES): ChoixBanniereReponse | null {
  if (!estObjetJson(reponse) || reponse["ok"] !== true || !("porte" in reponse)) return null;
  const porte = reponse["porte"];
  if (porte === null) return { ok: true, porte: null };
  return typeof porte === "string" && liste.some((b) => b.id === porte) ? { ok: true, porte } : null;
}

/** Ce qu'une bannière est pour ce compte : à acheter, à lui, ou montrée sur /gaulois. */
export type EtatDeLaBanniere = "a-acheter" | "a-moi" | "montree";

export function etatDeLaBanniere(id: string, mes: Pick<MesBannieres, "bannieres" | "porte"> | null): EtatDeLaBanniere {
  if (mes?.porte === id) return "montree";
  return mes?.bannieres.some((b) => b.banniere === id) ? "a-moi" : "a-acheter";
}

/** Le filtre de la boutique : une famille, une rareté, ou tout (`null`). */
export interface FiltreDesBannieres {
  famille: FamilleDeBanniere | null;
  rarete: Rarete | null;
}

/** Une famille rangée : ses bannières pour le filtre, de la plus courante à la plus rare, et combien le compte en a. */
export interface FamilleRangee {
  famille: FamilleDeBanniere;
  nom: string;
  bannieres: Banniere[];
  possedees: number;
  total: number;
}

/**
 * Les bannières rangées par famille, dans l'ordre de la boutique, réduites au filtre. Une famille sans bannière pour ce
 * filtre n'est pas rendue. `possedees` et `total` comptent toute la famille, sans filtre.
 */
export function rangerLesBannieres(filtre: FiltreDesBannieres, possedees: ReadonlySet<string>, liste: readonly Banniere[] = BANNIERES): FamilleRangee[] {
  const rang = (r: Rarete) => ORDRE_RARETES.indexOf(r);
  return FAMILLES.flatMap((famille) => {
    if (filtre.famille && filtre.famille !== famille) return [];
    const toutes = liste.filter((b) => b.famille === famille);
    const bannieres = toutes.filter((b) => !filtre.rarete || b.rarete === filtre.rarete).sort((a, b) => rang(a.rarete) - rang(b.rarete));
    if (bannieres.length === 0) return [];
    return [{ famille, nom: FAMILLES_DES_BANNIERES[famille], bannieres, possedees: toutes.filter((b) => possedees.has(b.id)).length, total: toutes.length }];
  });
}

/** Combien de bannières de chaque rareté (pour le filtre), dans la famille choisie s'il y en a une. */
export function comptesParRarete(famille: FamilleDeBanniere | null, liste: readonly Banniere[] = BANNIERES): Record<Rarete, number> {
  const compte = Object.fromEntries(ORDRE_RARETES.map((r) => [r, 0])) as Record<Rarete, number>;
  for (const b of liste) if (!famille || b.famille === famille) compte[b.rarete]++;
  return compte;
}

/** Ce qui manque pour acheter : 0 si le solde suffit. */
export const manquePour = (solde: number, prix: number): number => Math.max(0, prix - solde);

/** Une scène d'aperçu : 124 × 80 cases, rangée par rangée, et ses dimensions. */
export interface SceneDApercu {
  largeur: number;
  hauteur: number;
  cases: string[];
}

/**
 * L'aperçu du site : le Gaulois du membre (et son familier) devant une bannière, cadre compris, comme sur /gaulois, sans
 * le logo ni les insignes ; `null` pour une bannière inconnue.
 */
export function sceneDeLaBanniere(id: string, tenue: Tenue, familier: Familier | null = null): SceneDApercu | null {
  const fond = dessinDeLaBanniere(id);
  if (!fond) return null;
  return { largeur: DECOR_LARGEUR, hauteur: DECOR_HAUTEUR, cases: casesDeLaScene(tenue, fond, familier ? familierAPoser(familier) : null) };
}

/** La bannière seule, cadre compris, sans Gaulois : pour une vignette ; `null` pour une bannière inconnue. */
export function vignetteDeLaBanniere(id: string): SceneDApercu | null {
  const fond = dessinDeLaBanniere(id);
  return fond ? { largeur: DECOR_LARGEUR, hauteur: DECOR_HAUTEUR, cases: [...fond.cases] } : null;
}
