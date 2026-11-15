/**
 * Le contrat du village des Gaulois (docs/DIRECTION.md, « Le village des Gaulois ») entre l'écran et le serveur, pour les
 * lots qui suivent le vestiaire et les statères : la boutique, la pochette surprise, le marché entre membres, la place du
 * village et la forge. Le serveur décide de tout ; ce fichier dit seulement la forme de ses réponses et les réglages de départ.
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

/**
 * `acheter_objet(p_emplacement, p_objet, p_prix_vu)` : l'objet entre dans l'inventaire, le solde baisse du prix de sa rareté.
 * `p_prix_vu` : le prix que le membre a vu à l'écran ; s'il n'est plus celui de la boutique (l'encadrement vient de le régler),
 * le serveur refuse (`prix_change`) sans rien débiter.
 */
export interface AchatReponse {
  ok: true;
  solde: number;
  objet: RefObjet;
}

/**
 * `ouvrir_pochette(p_prix_vu)` : l'objet tiré, sa rareté, et s'il était déjà possédé (un double). `p_prix_vu` : le prix de la
 * pochette vu à l'écran ; changé entre-temps, refus `prix_change`.
 */
export interface PochetteReponse {
  ok: true;
  solde: number;
  objet: RefObjet & { rarete: Rarete; double: boolean };
}

/**
 * Les refus de la boutique, en plus de ceux de tout compte (`not_signed_in`, `suspended`, `rate_limited`) :
 * `not_validated` compte pas encore validé, `no_gaulois` Gaulois pas encore créé, `unknown_objet` objet hors du catalogue,
 * `objet_gratuit` objet gratuit, `deja_possede` objet déjà dans l'inventaire ou en vente au marché, `solde_insuffisant` pas assez de statères, `prix_change` le
 * prix a changé depuis que le membre l'a vu.
 */
export type RefusBoutique = "not_validated" | "no_gaulois" | "unknown_objet" | "objet_gratuit" | "deja_possede" | "solde_insuffisant" | "prix_change";

/**
 * Une offre du marché. `vendeur` : le nom du compte au QG, pour tout vendeur (choix du pilote, 14 novembre 2026 : personne ne
 * décide de se montrer ou non au village). `a_moi` : c'est l'offre de l'appelant.
 */
export interface OffreDuMarche extends RefObjet {
  id: number;
  prix: number;
  vendeur: string;
  a_moi: boolean;
  expire_le: string;
}

/**
 * `get_marche()`, pour un compte validé : les offres ouvertes, les plus récentes d'abord, et le solde de l'appelant. Comme
 * `get_village()`, elle a la limite d'appels des gestes (`rate_limited`).
 */
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
 * par le Gaulois (l'enlever d'abord), `achete_au_marche` exemplaire venu du marché, qui ne se revend pas, `objet_grave`
 * dernier exemplaire d'un objet qui porte une plaque de la forge (l'effacer d'abord), `prix_invalide`,
 * `trop_d_offres`, `offre_fermee` offre déjà vendue, retirée ou expirée, `offre_a_soi` on n'achète pas sa propre offre,
 * `deja_possede` l'acheteur a déjà cet objet, `solde_insuffisant`.
 */
export type RefusMarche =
  | "not_validated"
  | "pas_possede"
  | "objet_porte"
  | "achete_au_marche"
  | "objet_grave"
  | "prix_invalide"
  | "trop_d_offres"
  | "offre_fermee"
  | "offre_a_soi"
  | "deja_possede"
  | "solde_insuffisant";

/**
 * Un Gaulois de la place du village. `nom` : le nom du compte au QG. `moi` : celui de l'appelant.
 *
 * Qui paraît (le pilote, 14 novembre 2026 : « je veux pas qu'il puisse décider de se montrer ou pas, tous ceux qui créent
 * un personnage apparaissent dans le village ») : tout compte validé qui a créé son Gaulois, avec son nom et son état vocal,
 * sans regarder le choix « se montrer aux autres membres » du QG. Une seule réserve, qui tient à la règle du site « le
 * publicId d'un anonyme n'est jamais publié » : `partie_le` n'est donné que pour un compte au pseudo public unique dans la
 * liste du clan. L'heure exacte d'une partie, croisée avec les parties publiques, désignerait sinon le joueur OpenFront
 * d'un membre anonyme. Un anonyme suit donc l'heure et le vocal, pas ses parties ; son propre Gaulois suit la même règle.
 *
 * La vie du village (demande du pilote, 13 novembre 2026 : un village animé, où ce que fait le joueur décide de ce que
 * fait son Gaulois) s'appuie sur trois champs que le serveur peut ne pas donner : l'écran les lit alors comme `null`, et
 * le Gaulois suit seulement l'heure de Paris. Aucun n'est du temps réel : ce sont des relevés, et l'écran le dit.
 * - `partie_le` : le début de sa dernière partie qui a rapporté des points au clan, si elle a commencé il y a moins de 24
 *   heures. OpenFront ne dit pas qui joue en ce moment : seule une partie finie se connaît.
 * - `vocal` : il était dans un salon vocal du Discord du clan au dernier relevé ; `null` : pas relevé.
 * - `replique` : une phrase courte que le serveur lui fait dire ; `null` : il ne dit rien.
 *
 * `gravures` (la forge, 14 novembre 2026) : les plaques des objets qu'il porte. Toujours pour le sien ; pour un autre,
 * seulement si son compte a un pseudo public, la règle de `partie_le` : le jour et les points d'une partie désigneraient
 * sinon le joueur OpenFront d'un anonyme. Une liste vide ne dit pas pourquoi. Jamais une plaque d'un objet qu'il ne porte
 * pas : la place ne dit pas ce qu'un membre possède.
 */
export interface GauloisDeLaPlace {
  nom: string;
  tenue: Tenue;
  moi: boolean;
  partie_le?: string | null;
  vocal?: boolean | null;
  replique?: string | null;
  gravures?: PlaqueVue[];
}

/**
 * `get_village()`, pour un compte validé ou de l'encadrement : les Gaulois de tous les comptes validés, par ordre de
 * création. Tout Gaulois d'un compte validé est sur la place : le pilote n'a pas voulu de case pour s'en retirer (13 novembre
 * 2026). Un solde ne s'y lit jamais : il reste privé, sans classement des plus riches.
 */
export interface Village {
  ok: true;
  gaulois: GauloisDeLaPlace[];
  /**
   * L'heure du dernier relevé vocal des Gaulois de la place par le robot (toutes les 5 minutes), ou à défaut celle de la
   * dernière relecture des parties ; `null` : ni l'un ni l'autre.
   */
  releve?: string | null;
}

/*
 * La forge aux souvenirs (idée du pilote, 14 novembre 2026 : « On paie des statères pour graver une vraie partie sur son
 * épée : “12 novembre, à quatre, 2,33 points rapportés”. ») ; migration 20261114001000_village_forge.sql, lecture et textes
 * dans `forge.ts`.
 *
 * Un membre validé qui a créé son Gaulois grave une de ses propres parties qui ont rapporté des points au clan (son journal
 * des statères) sur un objet qu'il porte ou possède : un objet à rareté d'un des cinq emplacements d'objets, gratuit ou de
 * son inventaire ; jamais le corps, le visage ni une case « rien ». Une plaque par objet ; regraver la remplace et se paie
 * de nouveau ; effacer est gratuit. Le dernier exemplaire d'un objet gravé ne se vend pas au marché (`objet_grave`).
 */

/** Le prix d'une gravure, en statères (choix du chef de chantier, 14 novembre 2026). Le même nombre que `internal.forge_prix`. */
export const PRIX_GRAVURE = 150;

/**
 * Les faits d'une partie que garde une plaque, copiés du journal au moment de graver : `jour` à Paris (« AAAA-MM-JJ »),
 * `gaulois` le nombre de Gaulois du clan dans la partie, `points` les points rapportés au clan. Ni l'identifiant ni l'heure.
 */
export interface FaitsDeLaPartie {
  jour: string;
  gaulois: number;
  points: number;
}

/** Une plaque gravée, vue par son propriétaire. `texte` : « 12 novembre, à quatre, 2,33 points rapportés ». */
export interface Plaque extends FaitsDeLaPartie {
  texte: string;
  grave_le: string;
}

/**
 * Une partie qui peut se graver : une des 100 dernières de son journal des statères. `partie` ne sert qu'à `graver_objet`,
 * l'écran ne la montre pas ; `debut` : l'heure de son début, pour la reconnaître ; `texte` : la plaque qu'elle donnerait.
 */
export interface PartieGravable extends FaitsDeLaPartie {
  partie: string;
  debut: string;
  texte: string;
}

/** Un objet qui peut se graver, de la tête à l'arme. `porte` : le Gaulois le porte ; `gravure` : sa plaque, ou `null`. */
export interface ObjetGravable extends RefObjet {
  porte: boolean;
  gravure: Plaque | null;
}

/**
 * `get_ma_forge()`, pour un compte connecté non suspendu, et la réponse de `graver_objet` et `effacer_gravure` : la forge à
 * jour. `prix` vient toujours du serveur. `peut_graver` : compte validé avec un Gaulois créé. `plaques_vues` : les autres
 * membres voient ses plaques sur la place (son pseudo est public) ; sinon lui seul les voit. Limitée comme les gestes
 * (`rate_limited`).
 */
export interface MaForge {
  ok: true;
  prix: number;
  solde: number;
  peut_graver: boolean;
  plaques_vues: boolean;
  parties: PartieGravable[];
  objets: ObjetGravable[];
}

/**
 * Une plaque telle que la montrent la place (`gravures` de `GauloisDeLaPlace`) et le vestiaire (`gravures` de
 * `get_mon_gaulois()`, toutes les plaques de ses objets) : l'objet et le texte, rien d'autre.
 */
export interface PlaqueVue extends RefObjet {
  texte: string;
}

/**
 * `graver_objet(p_emplacement, p_objet, p_partie, p_prix_vu)` grave et répond `MaForge` ; `effacer_gravure(p_emplacement,
 * p_objet)` efface et répond `MaForge`. Les refus, en plus de ceux de tout compte (`not_signed_in`, `suspended`,
 * `rate_limited`), dans l'ordre où le serveur les vérifie : `not_validated`, `no_gaulois`, `objet_non_gravable` (corps,
 * visage, case « rien » ou objet hors du catalogue), `pas_possede`, `partie_inconnue` (pas une partie de son journal),
 * `deja_grave` (l'objet porte déjà cette plaque : rien n'est débité), `prix_change`, `solde_insuffisant` ; et pour l'effacement,
 * `pas_grave` (aucune plaque sur cet objet). Un refus ne débite rien.
 */
export type RefusForge =
  | "not_validated"
  | "no_gaulois"
  | "objet_non_gravable"
  | "pas_possede"
  | "partie_inconnue"
  | "deja_grave"
  | "prix_change"
  | "solde_insuffisant"
  | "pas_grave";

/*
 * Les familiers du Gaulois (demande du pilote, 15 novembre 2026 : « des pets pour les gaulois obtenables uniquement en
 * pochettes prix min 2000 ») ; migration 20261115000800_familiers_du_gaulois, dessins et liste dans
 * `supabase/functions/code-discord/familiers/`, lecture et calculs dans `familiers.ts`.
 *
 * Un familier ne s'obtient que dans la pochette des familiers : jamais à la boutique ni au marché. La pochette ne donne
 * jamais un familier déjà possédé : elle tire une rareté parmi celles où le compte a encore un familier à recevoir (une
 * rareté épuisée est sautée, les autres se partagent ses chances à proportion), puis un de ces familiers, à chances égales.
 * Le compte montre un familier à la fois, ou aucun, à côté de son Gaulois, sur le site et sur l'image de /gaulois.
 */

/** Le prix de départ de la pochette des familiers, en statères : le plus bas permis (le serveur refuse moins de 2 000). */
export const PRIX_POCHETTE_FAMILIERS = 2000;

/** Les chances de départ de la pochette des familiers, en pour cent, par rareté (choix du chef de chantier) : 100 en tout. */
export const CHANCES_POCHETTE_FAMILIERS: Readonly<Record<Rarete, number>> = {
  commun: 45,
  "peu-commun": 28,
  epique: 15,
  mystique: 8,
  legendaire: 4,
};

/** Un familier possédé, et quand il a été reçu. */
export interface FamilierPossede {
  familier: string;
  acquis_le: string;
}

/**
 * `get_mes_familiers()`, pour un compte connecté : son solde, ses familiers (les plus récents d'abord), celui qu'il montre
 * (`porte`, ou `null`) et la pochette. `peut_ouvrir` : compte validé avec un Gaulois créé.
 */
export interface MesFamiliers {
  ok: true;
  solde: number;
  peut_ouvrir: boolean;
  pochette: { prix: number; chances: Record<Rarete, number> };
  familiers: FamilierPossede[];
  porte: string | null;
}

/** `ouvrir_pochette_familiers(p_prix_vu)` : le familier reçu, sa rareté, et combien il en reste à recevoir. */
export interface PochetteFamiliersReponse {
  ok: true;
  solde: number;
  familier: { familier: string; rarete: Rarete };
  reste: number;
}

/** `choisir_familier(p_familier)` : le familier montré, ou `null` (aucun). */
export interface ChoixFamilierReponse {
  ok: true;
  porte: string | null;
}

/**
 * Les refus des familiers, en plus de ceux de tout compte (`not_signed_in`, `suspended`, `rate_limited`) : `not_validated`,
 * `no_gaulois`, `prix_change`, `tout_possede` (il les a tous : rien n'est débité), `solde_insuffisant` ; pour le choix,
 * `unknown_familier` et `pas_possede`. Un refus ne débite rien.
 */
export type RefusFamiliers = "not_validated" | "no_gaulois" | "prix_change" | "tout_possede" | "solde_insuffisant" | "unknown_familier" | "pas_possede";
