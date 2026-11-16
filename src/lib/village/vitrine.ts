import { CLE_MODELE, EMPLACEMENTS, EMPLACEMENTS_OBJETS, OBJETS, POILS, RARETES, TEINTE_CHEVEUX, TENUE_DE_DEPART, lireTenue, modeleDuGaulois, objetPorte, type Rarete, type Tenue } from "../gaulois";
import type { GauloisDeLaPlace } from "./contrat";

/**
 * La vitrine des Gaulois (demande du pilote, 15 novembre 2026 : « une vitrine dans la page gaulois avec tous les gaulois avec
 * leurs cosmétiques + nom » ; il a choisi les cartes le 16 novembre, avec « derrière leur bannière qu'ils ont choisie en
 * faible opacité »). L'onglet « La vitrine » de « Mon Gaulois » lit `get_village()` (migration
 * 20261116000200_vitrine_des_gaulois) : tous les Gaulois des comptes validés, dans l'ordre du serveur (leur création), chacun
 * avec son nom, sa tenue, son familier et sa bannière. Rien n'est trié, compté ni noté : aucun classement des plus riches.
 */

/**
 * Un Gaulois de la vitrine : son nom, sa tenue, « moi », son familier et sa bannière (`null` si le serveur n'en dit rien).
 * La vitrine ne montre pas les plaques de la forge : elle ne les lit pas.
 */
export interface GauloisVitrine extends Pick<GauloisDeLaPlace, "nom" | "tenue" | "moi"> {
  familier: string | null;
  banniere: string | null;
}

const estObjet = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** Un identifiant de familier ou de bannière, tel que le serveur les écrit ; autre chose : `null`. */
const identifiant = (v: unknown): string | null => (typeof v === "string" && /^[a-z][a-z-]{0,39}$/.test(v) ? v : null);

/**
 * La tenue d'un Gaulois de la vitrine. Le serveur peut connaître un objet, une couleur ou un Gaulois unique que ce site ne
 * connaît pas encore (il est mis à jour juste avant le site) : plutôt que de faire disparaître ce membre, ce qui reste
 * inconnu prend la case de la tenue de départ, et un Gaulois unique inconnu laisse le corps humain, le temps que le site
 * suive. `null` seulement pour ce qui n'est pas une tenue.
 */
export function tenueDeLaVitrine(valeur: unknown): Tenue | null {
  const exacte = lireTenue(valeur);
  if (exacte || !estObjet(valeur)) return exacte;
  const reparee: Record<string, unknown> = {};
  for (const emplacement of EMPLACEMENTS) {
    const id = valeur[emplacement];
    reparee[emplacement] = typeof id === "string" && Object.prototype.hasOwnProperty.call(OBJETS[emplacement], id) ? id : TENUE_DE_DEPART[emplacement];
  }
  const teinte = valeur[TEINTE_CHEVEUX];
  reparee[TEINTE_CHEVEUX] = typeof teinte === "string" && Object.prototype.hasOwnProperty.call(POILS, teinte) ? teinte : TENUE_DE_DEPART[TEINTE_CHEVEUX];
  const avecModele = lireTenue({ ...reparee, [CLE_MODELE]: valeur[CLE_MODELE] });
  return avecModele ?? lireTenue(reparee);
}

/** Un Gaulois de la réponse, ou `null` s'il est illisible (sans nom, ou sans rien qui ressemble à une tenue). */
function lireGaulois(v: unknown): GauloisVitrine | null {
  if (!estObjet(v)) return null;
  const nom = typeof v["nom"] === "string" ? v["nom"].trim() : "";
  const tenue = tenueDeLaVitrine(v["tenue"]);
  if (nom === "" || !tenue) return null;
  return { nom, tenue, moi: v["moi"] === true, familier: identifiant(v["familier"]), banniere: identifiant(v["banniere"]) };
}

/**
 * La réponse de `get_village()` pour la vitrine : la liste de ses Gaulois, dans l'ordre reçu, ou `null` si elle est
 * illisible. Un Gaulois sans nom ni tenue est laissé de côté sans cacher les autres. Un serveur d'avant la migration de la
 * vitrine ne donne ni familier ni bannière : les cartes paraissent alors sans eux.
 */
export function lireVitrine(reponse: unknown): GauloisVitrine[] | null {
  if (!estObjet(reponse) || reponse["ok"] !== true || !Array.isArray(reponse["gaulois"])) return null;
  const lus: GauloisVitrine[] = [];
  for (const v of reponse["gaulois"]) {
    const g = lireGaulois(v);
    if (g) lus.push(g);
  }
  return lus;
}

/**
 * La couleur du cadre d'une carte : la rareté la plus haute de ce que porte le Gaulois, objets de la tête à l'arme et
 * Gaulois unique compris ; `null` sans rien à rareté. Le familier et la bannière ont leur propre dessin sur la carte : ils
 * n'y comptent pas. Un fait du catalogue sur ce qu'il porte, jamais un total ni un score.
 */
export function rareteDuCadre(tenue: Tenue): Rarete | null {
  const raretes: (Rarete | null)[] = EMPLACEMENTS_OBJETS.map((emplacement) => OBJETS[emplacement][objetPorte(tenue, emplacement)]?.rarete ?? null);
  raretes.push(modeleDuGaulois(tenue)?.rarete ?? null);
  let cadre: Rarete | null = null;
  for (const rarete of raretes) {
    if (rarete && RARETES[rarete] && (!cadre || RARETES[rarete].rang > RARETES[cadre].rang)) cadre = rarete;
  }
  return cadre;
}
