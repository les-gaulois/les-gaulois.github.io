/**
 * Le contrat du village des Gaulois (docs/DIRECTION.md, « Le village des Gaulois ») entre l'écran et le serveur, pour les
 * lots qui suivent le vestiaire et les statères : la boutique, la pochette surprise, le marché entre membres et la place du
 * village. Le serveur décide de tout ; ce fichier dit seulement la forme de ses réponses et les réglages de départ.
 *
 * Les prix sont ceux du pilote (13 novembre 2026) : commun 100, peu commun 250, épique 500, mystique 1 000, légendaire
 * 2 500, pochette surprise 200. Ils sont semés dans la table des réglages par la migration de la boutique ; un test garde
 * les deux écritures identiques. Les statères viennent des points rapportés au clan, 30 par point (choix du pilote le 13 novembre 2026, après
 * la mesure de l'économie), et de rien d'autre :
 * ils ne s'achètent jamais.
 */
import type { Emplacement, Rarete, Tenue } from "../gaulois";

/** Le prix d'un objet de la boutique, par rareté, en statères. */
export const PRIX_PAR_RARETE: Readonly<Record<Rarete, number>> = {
  commun: 100,
  "peu-commun": 250,
  epique: 500,
  mystique: 1000,
  legendaire: 2500,
};

/** Le prix d'une pochette surprise, en statères. */
export const PRIX_POCHETTE = 200;

/**
 * Les chances de la pochette surprise, en pour cent, par rareté : la somme fait 100. La pochette tire d'abord la rareté,
 * puis un objet payant de cette rareté, tous à chances égales. Un objet déjà possédé peut sortir : il s'ajoute en double,
 * et un double se vend au marché. Réglage tiré de la mesure de l'économie (`economie.ts`, 13 novembre 2026) : la pochette
 * vaut plus que son prix pour qui débute, moins une fois les communs et les peu communs possédés, si bien que les objets
 * chers s'achètent toujours à la boutique ; le légendaire y a deux chances sur cent.
 */
export const CHANCES_POCHETTE: Readonly<Record<Rarete, number>> = {
  commun: 50,
  "peu-commun": 30,
  epique: 13,
  mystique: 5,
  legendaire: 2,
};

/** Le marché : nombre d'offres ouvertes par membre, et durée d'une offre en jours. */
export const MARCHE_OFFRES_MAX = 5;
export const MARCHE_DUREE_JOURS = 14;

/** Un objet du catalogue, désigné par son emplacement et son identifiant (`OBJETS` de `gaulois.ts`). */
export interface RefObjet {
  emplacement: Emplacement;
  objet: string;
}

/** Une ligne de l'inventaire : un objet payant possédé, en combien d'exemplaires, et d'où vient le dernier. */
export interface ObjetPossede extends RefObjet {
  quantite: number;
  origine: "achat" | "pochette" | "marche";
  acquis_le: string;
}

/**
 * `get_ma_boutique()`, pour un compte connecté : son solde, ce qu'il possède et les réglages en vigueur.
 * `peut_acheter` : compte validé avec un Gaulois créé ; sinon la boutique se regarde sans s'ouvrir.
 */
export interface MaBoutique {
  ok: true;
  solde: number;
  peut_acheter: boolean;
  prix: Record<Rarete, number>;
  pochette: { prix: number; chances: Record<Rarete, number> };
  inventaire: ObjetPossede[];
}

/** `acheter_objet(p_emplacement, p_objet)` : l'objet entre dans l'inventaire, le solde baisse du prix de sa rareté. */
export interface AchatReponse {
  ok: true;
  solde: number;
  objet: RefObjet;
}

/** `ouvrir_pochette()` : l'objet tiré, sa rareté, et s'il était déjà possédé (un double). */
export interface PochetteReponse {
  ok: true;
  solde: number;
  objet: RefObjet & { rarete: Rarete; double: boolean };
}

/**
 * Les refus de la boutique, en plus de ceux de tout compte (`not_signed_in`, `suspended`, `rate_limited`) :
 * `not_validated` compte pas encore validé, `no_gaulois` Gaulois pas encore créé, `unknown_objet` objet hors du catalogue,
 * `objet_gratuit` objet gratuit, `deja_possede` objet déjà dans l'inventaire, `solde_insuffisant` pas assez de statères.
 */
export type RefusBoutique = "not_validated" | "no_gaulois" | "unknown_objet" | "objet_gratuit" | "deja_possede" | "solde_insuffisant";

/** Une offre du marché. `vendeur` : le nom que le QG montre déjà pour ce compte. `a_moi` : c'est l'offre de l'appelant. */
export interface OffreDuMarche extends RefObjet {
  id: number;
  prix: number;
  vendeur: string;
  a_moi: boolean;
  expire_le: string;
}

/** `get_marche()`, pour un compte validé : les offres ouvertes, les plus récentes d'abord, et le solde de l'appelant. */
export interface Marche {
  ok: true;
  solde: number;
  offres: OffreDuMarche[];
  offres_max: number;
}

/**
 * `mettre_en_vente(p_emplacement, p_objet, p_prix)`, `retirer_offre(p_id)` et `acheter_offre(p_id)` répondent tous par le
 * marché à jour. Un objet mis en vente quitte l'inventaire jusqu'à la vente, au retrait ou à l'expiration de l'offre. Le
 * prix va de 1 statère au prix de l'objet à la boutique. L'acheteur paie le prix, le vendeur le reçoit en entier.
 *
 * Un objet acheté au marché ne se remet pas en vente (mesure de l'économie, 13 novembre 2026) : sans cette règle, deux
 * comptes se passeraient des statères sans limite, l'un vendant un objet au prix fort, l'autre le lui rendant pour 1
 * statère. Les doubles de la pochette et les achats de la boutique, eux, se vendent.
 */
export type MarcheReponse = Marche;

/**
 * Les refus du marché : `not_validated`, `pas_possede` objet absent de l'inventaire, `objet_porte` seul exemplaire et porté
 * par le Gaulois (l'enlever d'abord), `achete_au_marche` exemplaire venu du marché, qui ne se revend pas, `prix_invalide`,
 * `trop_d_offres`, `offre_fermee` offre déjà vendue, retirée ou expirée, `offre_a_soi` on n'achète pas sa propre offre,
 * `deja_possede` l'acheteur a déjà cet objet, `solde_insuffisant`.
 */
export type RefusMarche =
  | "not_validated"
  | "pas_possede"
  | "objet_porte"
  | "achete_au_marche"
  | "prix_invalide"
  | "trop_d_offres"
  | "offre_fermee"
  | "offre_a_soi"
  | "deja_possede"
  | "solde_insuffisant";

/** Un Gaulois de la place du village. `nom` : le nom que le QG montre déjà pour ce compte. `moi` : celui de l'appelant. */
export interface GauloisDeLaPlace {
  nom: string;
  tenue: Tenue;
  moi: boolean;
}

/**
 * `get_village()`, pour un compte validé ou de l'encadrement : les Gaulois de tous les comptes validés, par ordre de
 * création. Tout Gaulois d'un compte validé est sur la place : le pilote n'a pas voulu de case pour s'en retirer (13 novembre
 * 2026). Un solde ne s'y lit jamais : il reste privé, sans classement des plus riches.
 */
export interface Village {
  ok: true;
  gaulois: GauloisDeLaPlace[];
}
