import { RARETE_DIVINE, CLE_MODELE, EMPLACEMENTS, EMPLACEMENTS_OBJETS, NOMS_EMPLACEMENTS, OBJETS, POILS, RARETES_DES_OBJETS as RARETES, TEINTE_CHEVEUX, TENUE_DE_DEPART, lireTenue, modeleDuGaulois, objetPorte, type RareteDObjet as Rarete, type Tenue } from "../gaulois";
import type { GauloisDeLaPlace } from "./contrat";
import type { PochetteDeLEtal } from "./etal";

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
  /** La finition de carte qu'il montre (rayon « Cartes ») ; absente ou `null` : aucune, ou un serveur d'avant la migration 20261117001500. */
  carte?: string | null;
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
  return { nom, tenue, moi: v["moi"] === true, familier: identifiant(v["familier"]), banniere: identifiant(v["banniere"]), carte: identifiant(v["carte"]) };
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

/** Une ligne de ce que porte un Gaulois regardé en grand : la partie, le nom de l'objet et sa rareté s'il en a une. */
export interface LignePortee {
  partie: string;
  nom: string;
  rarete: Rarete | null;
  /** L'objet du catalogue, pour dessiner sa case ; `modele` : l'identifiant du Gaulois unique, pour le sien. */
  objet?: { emplacement: (typeof EMPLACEMENTS_OBJETS)[number]; id: string };
  modele?: string;
}

/**
 * Ce que porte un Gaulois, pour sa carte ouverte en grand (17 novembre 2026) : son Gaulois unique d'abord, puis ses objets
 * de la tête à l'arme, dans l'ordre du vestiaire, chacun dans une case comme celles du vestiaire (le pilote, le 17
 * novembre : « je préfère voir des jolies cases des items avec leur rareté que des lignes d'écriture »). Une case « rien »
 * (sans dessin) ne se montre pas. Des faits du catalogue,
 * dans l'ordre des emplacements : rien n'est trié ni compté.
 */
export function lignesPortees(tenue: Tenue): LignePortee[] {
  const lignes: LignePortee[] = [];
  const modele = modeleDuGaulois(tenue);
  if (modele) lignes.push({ partie: "Gaulois unique", nom: modele.nom, rarete: modele.rarete, modele: modele.id });
  for (const emplacement of EMPLACEMENTS_OBJETS) {
    const id = objetPorte(tenue, emplacement);
    const objet = OBJETS[emplacement][id];
    if (objet?.dessin) lignes.push({ partie: NOMS_EMPLACEMENTS[emplacement], nom: objet.nom, rarete: objet.rarete, objet: { emplacement, id } });
  }
  return lignes;
}

/** Où trouver ce que porte un autre Gaulois : déjà à soi, gratuit pour tous, ou un lien vers l'endroit où ça s'obtient. */
export type Provenance = { kind: "a-moi" } | { kind: "gratuit" } | { kind: "lien"; mots: string; ancre: string; rayon?: (typeof EMPLACEMENTS_OBJETS)[number]; pochette?: PochetteDeLEtal };

/**
 * D'où vient un objet de la garde-robe (17 novembre 2026, « où trouver cet objet ») : un objet gratuit est à tout le
 * monde ; un objet payant qu'on possède est « à vous » ; un objet divin ne sort que de la pochette surprise ; tout autre
 * s'achète à la boutique, dans le rayon de son emplacement. Des règles du jeu déjà écrites ailleurs, rien de plus.
 */
export function provenanceDeLObjet(emplacement: (typeof EMPLACEMENTS_OBJETS)[number], id: string, possede: boolean): Provenance | null {
  const objet = OBJETS[emplacement][id];
  if (!objet) return null;
  if (objet.gratuit) return { kind: "gratuit" };
  if (possede) return { kind: "a-moi" };
  if (objet.rarete === RARETE_DIVINE) return { kind: "lien", mots: "Pochette surprise", ancre: "pochettes", pochette: "surprise" };
  return { kind: "lien", mots: "À la boutique", ancre: "boutique", rayon: emplacement };
}

/** Un nom sans accent ni majuscule, pour le comparer à ce qu'on tape. */
const simple = (texte: string): string => texte.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/**
 * La recherche de la vitrine : les Gaulois dont le nom contient ce qu'on a tapé, sans tenir compte des accents ni des
 * majuscules, dans l'ordre reçu. Rien de tapé : tous. Rien n'est trié ni classé.
 */
export function chercherDansLaVitrine<G extends Pick<GauloisVitrine, "nom">>(gaulois: readonly G[], texte: string): G[] {
  const cherche = simple(texte);
  return cherche === "" ? [...gaulois] : gaulois.filter((g) => simple(g.nom).includes(cherche));
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
