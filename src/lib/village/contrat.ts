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
import type { RareteDUnique } from "../../../supabase/functions/code-discord/modeles/modele";
import type { Emplacement, Rarete, RareteDObjet, Tenue } from "../gaulois";

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

/**
 * Le divin (demande du pilote, 16 novembre 2026 : « 10 fois plus rare que les légendaires et obtenable uniquement dans la
 * pochette ») ; migration 20261116000300_divin_et_fusion. Un objet divin n'a pas de prix : il ne s'achète pas, ne se vend
 * pas au marché, et la forge n'en fabrique pas. La pochette surprise le donne dix fois moins souvent qu'un légendaire : sa
 * chance est celle du légendaire divisée par dix, prise sur celle du commun (jamais plus que celle-ci). Elle suit donc le
 * réglage de la Direction sans champ de plus. Le même calcul que `internal.village_chance_divine` du serveur.
 */
export const LEGENDAIRES_POUR_UN_DIVIN = 10;

/** Les chances du tirage, divin compris, d'après les cinq chances réglées : 100 en tout. `divin` : la chance donnée par le serveur. */
export function chancesAvecLeDivin(chances: Readonly<Record<Rarete, number>>, divin: number = chances.legendaire / LEGENDAIRES_POUR_UN_DIVIN): Record<RareteDObjet, number> {
  const part = Math.min(Math.max(divin, 0), chances.commun);
  // Le légendaire de saison ne sort jamais d'une pochette.
  return { ...chances, commun: chances.commun - part, saison: 0, divin: part };
}

/** Les chances de départ du tirage : 49,8 ; 30 ; 13 ; 5 ; 2 ; et 0,2 pour le divin. */
export const CHANCES_DU_TIRAGE: Readonly<Record<RareteDObjet, number>> = chancesAvecLeDivin(CHANCES_POCHETTE);

/** Le marché : nombre d'offres ouvertes par membre, et durée d'une offre en jours. */
export const MARCHE_OFFRES_MAX = 5;
export const MARCHE_DUREE_JOURS = 14;

/**
 * Les demandes d'achat (19 novembre 2026, migration 20261119000100_marche_tournant_et_demandes) : demandes ouvertes par
 * membre, et demandes posées en 24 heures. Une demande dure `MARCHE_DUREE_JOURS`, comme une offre.
 */
export const MARCHE_DEMANDES_MAX = 5;
export const MARCHE_DEMANDES_PAR_JOUR = 20;

/**
 * La boutique tournante (même migration) : chaque objet payant a un tour sur `BOUTIQUE_TOURS`, et n'est en rayon qu'une
 * semaine sur trois. Une semaine de la boutique va du mardi 21 h 30 au mardi suivant, heure de Paris (l'heure du tirage de la
 * loterie) ; la première commence le 17 novembre 2026 (`BOUTIQUE_TOUR_DEBUT`, heure de Paris).
 */
export const BOUTIQUE_TOURS = 3;
export const BOUTIQUE_TOUR_DEBUT = "2026-11-17 21:30";

/** Un objet hors du rayon cette semaine, et le début de la semaine où il revient. */
export interface ObjetHorsRayon extends RefObjet {
  revient_le: string;
}

/**
 * `get_boutique_tournante()`, pour un compte connecté : la semaine de la boutique, le prochain changement (`change_le`), et
 * les objets payants hors du rayon. Tout autre objet payant est en rayon. Refus : `not_signed_in`.
 */
export interface BoutiqueTournante {
  ok: true;
  semaine: number;
  tours: number;
  change_le: string;
  hors_rayon: ObjetHorsRayon[];
}

/**
 * Une demande d'achat : un membre cherche un objet, à un prix entier de 1 statère au prix de la boutique ; ses statères sont
 * mis de côté jusqu'au service, au retrait ou à la fin. `acheteur` : le nom du compte au QG, comme le vendeur d'une offre.
 */
export interface DemandeDuMarche extends RefObjet {
  id: number;
  prix: number;
  acheteur: string;
  a_moi: boolean;
  expire_le: string;
}

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
 * `pochette.chances` : les chances du tirage, divin compris. Le serveur donne les cinq chances réglées et, à part, celle du
 * divin (`pochette.divin`) ; la lecture les réunit (`chancesAvecLeDivin`). Un serveur d'avant le divin n'en donne pas : 0.
 */
export interface MaBoutique {
  ok: true;
  solde: number;
  peut_acheter: boolean;
  prix: Record<Rarete, number>;
  pochette: { prix: number; chances: Record<RareteDObjet, number> };
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
  objet: RefObjet & { rarete: RareteDObjet; double: boolean };
}

/**
 * Les refus de la boutique, en plus de ceux de tout compte (`not_signed_in`, `suspended`, `rate_limited`) :
 * `not_validated` compte pas encore validé, `no_gaulois` Gaulois pas encore créé, `unknown_objet` objet hors du catalogue,
 * `objet_gratuit` objet gratuit, `deja_possede` objet déjà dans l'inventaire ou en vente au marché, `solde_insuffisant` pas assez de statères, `prix_change` le
 * prix a changé depuis que le membre l'a vu.
 */
export type RefusBoutique = "not_validated" | "no_gaulois" | "unknown_objet" | "objet_gratuit" | "deja_possede" | "solde_insuffisant" | "prix_change" | "hors_rayon";

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
  /**
   * Depuis la migration 20261119000100 : les demandes ouvertes, la plus chère d'abord, le nombre permis, et les statères mis
   * de côté par l'appelant. Absents d'un serveur d'avant : l'écran ne montre pas les demandes.
   */
  demandes?: DemandeDuMarche[];
  demandes_max?: number;
  mis_de_cote?: number;
}

/** `servir_demande(p_id)` : le marché à jour, et ce qui vient d'être vendu. */
export interface DemandeServie extends Marche {
  vendu: RefObjet & { prix: number };
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
  | "solde_insuffisant"
  // Les demandes d'achat (migration 20261119000100) : `unknown_objet` objet hors du catalogue, `deja_demande` déjà demandé,
  // `trop_de_demandes`, `demandes_du_jour` (20 en 24 heures), `demande_fermee` servie, retirée ou finie, `demande_a_soi`,
  // `mode_god` essai du pilote en cours.
  | "unknown_objet"
  | "deja_demande"
  | "trop_de_demandes"
  | "demandes_du_jour"
  | "demande_fermee"
  | "demande_a_soi"
  | "mode_god";

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
  /**
   * La vitrine (migration 20261116000200_vitrine_des_gaulois, 16 novembre 2026) : le familier montré à côté du Gaulois et la
   * bannière montrée sur /gaulois, ou `null`. Des choix de tenue, que /gaulois montre déjà : donnés pour tous. Un serveur
   * d'avant cette migration ne les donne pas. Lecture : `src/lib/village/vitrine.ts`.
   */
  familier?: string | null;
  banniere?: string | null;
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
 * (`rate_limited`). `fusion` : de quoi fondre ses objets ; `null` si le serveur ne connaît pas encore la fusion.
 */
export interface MaForge {
  ok: true;
  prix: number;
  solde: number;
  peut_graver: boolean;
  plaques_vues: boolean;
  parties: PartieGravable[];
  objets: ObjetGravable[];
  fusion: FusionDeLaForge | null;
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
 * La fusion à la forge (demande du pilote, 16 novembre 2026 : « tant d'objets rares fusionnés deviennent épique, tant
 * d'épiques deviennent légendaire ») ; migration 20261116000300_divin_et_fusion, lecture et calculs dans `fusion.ts`.
 *
 * Un membre validé qui a créé son Gaulois donne trois objets payants d'une même rareté (trois exemplaires de son
 * inventaire, d'un même objet ou non) et reçoit un objet payant de la rareté suivante, tiré au hasard parmi tous ceux de
 * cette rareté, à chances égales ; un double est possible. Du commun au mystique : ni le légendaire ni le divin ne se
 * fondent, et la forge ne fabrique pas de divin. Aucun statère n'est payé ni rendu. Le dernier exemplaire d'un objet porté
 * ou gravé ne se donne pas.
 */

/** Combien d'objets d'une rareté donnent un objet de la suivante. Le même nombre que `internal.forge_fusion_nombre`. */
export const OBJETS_POUR_UNE_FUSION = 3;

/** Un objet qui peut se fondre : sa rareté, ses exemplaires, et ceux qu'il peut donner (`libres`). */
export interface ObjetAFondre extends RefObjet {
  rarete: Rarete;
  quantite: number;
  libres: number;
}

/** `fusion` de `MaForge` : le nombre d'objets à donner, et les objets du compte qui peuvent se fondre. */
export interface FusionDeLaForge {
  nombre: number;
  objets: ObjetAFondre[];
}

/** L'objet reçu d'une fusion ; `double` : le compte l'avait déjà. */
export type FusionRecu = RefObjet & { rarete: Rarete; double: boolean };

/** `fusionner_objets(p_objets)`, `p_objets` : `[{ emplacement, objet }]`, un par exemplaire donné : l'objet reçu et la forge à jour. */
export interface FusionReponse {
  ok: true;
  recu: FusionRecu;
  forge: MaForge;
}

/**
 * Les refus de la fusion, en plus de ceux de tout compte (`not_signed_in`, `suspended`, `rate_limited`), dans l'ordre où
 * le serveur les vérifie : `not_validated`, `no_gaulois`, `fusion_invalide` (pas la bonne liste), `unknown_objet` (un
 * objet hors du catalogue, ou gratuit), `raretes_melangees`, `rarete_sans_fusion` (légendaire ou divin), `pas_possede`
 * (pas assez d'exemplaires), `objet_porte` et `objet_grave` (le dernier exemplaire d'un objet porté ou gravé). Un refus ne
 * prend aucun objet.
 */
export type RefusFusion = "not_validated" | "no_gaulois" | "fusion_invalide" | "unknown_objet" | "raretes_melangees" | "rarete_sans_fusion" | "pas_possede" | "objet_porte" | "objet_grave";

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

/*
 * Les bannières du Gaulois (demande du pilote, 15 novembre 2026 : « un lot de bannières, dans le thème OpenFront, des thèmes
 * spéciaux, de tous les goûts, avec un lot de rareté », « 3 fois plus cher que les cosmétiques », « achetables par statères »,
 * « il pourra choisir la bannière qui s'affichera en faisant /gaulois ») ; migration 20261115000900_bannieres_du_gaulois,
 * dessins et liste dans `supabase/functions/code-discord/bannieres/`, lecture et calculs dans `bannieres.ts`.
 *
 * Une bannière est un fond de l'image de /gaulois, à la place du décor de son lieu. Elle s'achète à la boutique au triple
 * du prix d'un objet de sa rareté, en un seul exemplaire : ni pochette, ni marché, ni forge. Le compte en montre une, ou
 * aucune (le décor du lieu).
 */

/** Combien de fois le prix d'un objet de la même rareté coûte une bannière (demande du pilote). Le même que le serveur. */
export const FOIS_LE_PRIX_D_UN_OBJET = 3;

/** Le prix de départ d'une bannière, par rareté, en statères : le triple des prix de la boutique. */
export const PRIX_BANNIERE_PAR_RARETE: Readonly<Record<Rarete, number>> = {
  commun: PRIX_PAR_RARETE.commun * FOIS_LE_PRIX_D_UN_OBJET,
  "peu-commun": PRIX_PAR_RARETE["peu-commun"] * FOIS_LE_PRIX_D_UN_OBJET,
  epique: PRIX_PAR_RARETE.epique * FOIS_LE_PRIX_D_UN_OBJET,
  mystique: PRIX_PAR_RARETE.mystique * FOIS_LE_PRIX_D_UN_OBJET,
  legendaire: PRIX_PAR_RARETE.legendaire * FOIS_LE_PRIX_D_UN_OBJET,
};

/** Une bannière possédée, et quand elle a été achetée. */
export interface BannierePossedee {
  banniere: string;
  acquis_le: string;
}

/*
 * La pochette des bannières (demande du pilote, 16 novembre 2026 : « 20 bannières différentes obtenables uniquement en
 * pochette, encore plus stylées que celles en boutique ») ; migration 20261116000100_pochette_des_bannieres. Les 20
 * « trésors de la pochette » (famille `tresors` des dessins) ne s'achètent pas : `acheter_banniere` les refuse
 * (`pochette_seulement`). La pochette ne donne jamais une bannière déjà possédée : elle tire une rareté selon ses chances,
 * puis un des trésors de cette rareté que le compte n'a pas, à chances égales. Une rareté où il a déjà tout garde sa
 * chance, qui rend alors des statères comme un remboursement, sans rien ajouter aux autres raretés (le pilote, soir du
 * 16 novembre 2026 : « je veux que ça augmente le % du statères » ; migration 20261116001400, qui fait de même pour la
 * pochette des Gaulois uniques). Prix et chances sont fixés par la migration : aucun réglage dans la Direction.
 *
 * Le prix baissé et les remboursements, depuis le soir du 16 novembre 2026 (le pilote : « baisse le prix des pochettes de
 * bannière car c'est déséquilibré par rapport au prix des bannières dans l'ensemble, et instaure la possibilité de gagner
 * un % de la somme investie en statères, comme pour la pochette des Gaulois » ; migration
 * 20261116000700_pochette_bannieres_remboursements) : la pochette coûte 1 500 statères au lieu de 3 000 ; 40 fois sur 100
 * elle rend 20, 30, 40, 50 ou 60 % de son prix (paliers à chances égales), 60 fois sur 100 elle donne un trésor selon les
 * chances par rareté ci-dessous, prises dans cette part. Au prix de la boutique pour la même rareté, elle vaut en moyenne
 * 1 770 statères pour 1 500 au départ (`valeurMoyenneDeLaPochetteDesBannieres` de `bannieres.ts`, testé).
 */

/** Le prix de la pochette des bannières, en statères : celui d'une bannière épique de la boutique, au départ. */
export const PRIX_POCHETTE_BANNIERES = 1500;

/** La part des pochettes des bannières qui rendent une partie de leur prix au lieu d'un trésor, en pour cent. */
export const REMBOURSEMENT_POCHETTE_BANNIERES = 40;

/** Ce que rend un remboursement, en pour cent du prix de la pochette : cinq paliers à chances égales, 40 % en moyenne. */
export const PALIERS_DE_REMBOURSEMENT_DES_BANNIERES = [20, 30, 40, 50, 60] as const;

/** Les chances de la pochette des bannières par rareté, en pour cent de la part qui donne un trésor : 100 en tout. Ses trésors sont épiques ou plus. */
export const CHANCES_POCHETTE_BANNIERES: Readonly<Record<Rarete, number>> = {
  commun: 0,
  "peu-commun": 0,
  epique: 60,
  mystique: 30,
  legendaire: 10,
};

/**
 * `get_mes_bannieres()`, pour un compte connecté : son solde, le prix d'une bannière de chaque rareté, la pochette des
 * bannières (`null` si le serveur ne la connaît pas encore), ses bannières (les plus récentes d'abord) et celle qu'il
 * montre sur /gaulois (`porte`, ou `null` : le décor de son lieu). `peut_acheter` : compte validé avec un Gaulois créé ;
 * il vaut aussi pour ouvrir la pochette.
 */
export interface MesBannieres {
  ok: true;
  solde: number;
  peut_acheter: boolean;
  prix: Record<Rarete, number>;
  /**
   * La pochette : son prix, les chances par rareté (de la part qui donne un trésor), la part des remboursements en pour
   * cent et leurs paliers (en pour cent du prix). Un serveur d'avant les remboursements ne dit ni l'une ni les autres :
   * 0 et aucun palier.
   */
  pochette: { prix: number; chances: Record<Rarete, number>; remboursement: number; paliers: number[] } | null;
  bannieres: BannierePossedee[];
  porte: string | null;
}

/**
 * `ouvrir_pochette_bannieres(p_prix_vu)` : la bannière reçue et sa rareté, ou le remboursement (la part du prix rendue, en
 * pour cent, et les statères rendus) ; l'un des deux, jamais les deux. Le solde après l'ouverture, et combien de trésors il
 * reste à recevoir.
 */
export interface PochetteBannieresReponse {
  ok: true;
  solde: number;
  banniere: { banniere: string; rarete: Rarete } | null;
  remboursement: { pourcent: number; rendu: number } | null;
  reste: number;
}

/** `acheter_banniere(p_banniere, p_prix_vu)` : la bannière achetée, sa rareté, et le solde après l'achat. */
export interface AchatBanniereReponse {
  ok: true;
  solde: number;
  banniere: { banniere: string; rarete: Rarete };
}

/** `choisir_banniere(p_banniere)` : la bannière montrée sur /gaulois, ou `null` (le décor de son lieu). */
export interface ChoixBanniereReponse {
  ok: true;
  porte: string | null;
}

/**
 * Les refus des bannières, en plus de ceux de tout compte (`not_signed_in`, `suspended`, `rate_limited`) : `not_validated`,
 * `no_gaulois`, `unknown_banniere` (hors de la liste), `pochette_seulement` (un trésor de la pochette ne s'achète pas),
 * `deja_possede`, `prix_change`, `solde_insuffisant` ; pour la pochette, `tout_possede` (il a tous ses trésors : rien n'est
 * débité) ; pour le choix, `pas_possede`. Un refus ne débite rien.
 */
export type RefusBannieres = "not_validated" | "no_gaulois" | "unknown_banniere" | "pochette_seulement" | "deja_possede" | "prix_change" | "solde_insuffisant" | "tout_possede" | "pas_possede";

/*
 * Les Gaulois uniques (demande du pilote, 15 novembre 2026 : des Gaulois lézard, dragon, axolotl, ovni…, « tu peux les
 * mettre en pochette dédiée et en boutique ») ; migration 20261115001000_gaulois_uniques, dessins et liste dans
 * `supabase/functions/code-discord/modeles/`, lecture et calculs dans `modeles.ts`.
 *
 * Un Gaulois unique remplace le corps humain du Gaulois par celui d'une créature ; tout le reste se porte dessus. Il
 * s'obtient de deux façons : à la boutique, ou dans la pochette des Gaulois uniques, qui ne donne jamais un modèle déjà
 * possédé (comme celle des familiers). Un seul exemplaire de chacun : ni marché, ni forge. Le modèle porté est la clé
 * `modele` de la tenue, enregistrée par `enregistrer_mon_gaulois`, qui vérifie que le compte le possède.
 *
 * Les prix et les chances depuis le 16 novembre 2026 (demande du pilote : « le prix n'est pas assez cher en boutique !
 * Calcule bien les probabilités pour la pochette, et la pochette je veux qu'elle coûte 3 000 » ; migration
 * 20261116000500_gaulois_uniques_prix) :
 * - Les chances de la pochette font baisser la chance de chaque modèle d'une rareté à l'autre : 50, 30, 12, 6 et 2 pour cent
 *   par rareté, soit, pour un compte qui n'a rien, 16,7 % pour chaque commun, 10 % pour chaque peu commun, 6 % pour chaque
 *   épique, 3 % pour chaque mystique et 2 % pour le dragon. Avant, chaque mystique avait autant de chances que le dragon.
 * - À la boutique, un modèle coûte ce que coûtent en moyenne les pochettes qu'il faut pour le tirer, arrondi aux 500
 *   statères (`prixCalculesDeLaBoutique` de `modeles.ts`, calcul exact, testé) : 3,8 pochettes pour un commun, 5,1 pour un
 *   peu commun, 6,7 pour un épique, 8,3 pour un mystique, 9,3 pour le dragon. Acheter, c'est payer le sûr ; la pochette
 *   donne en chemin d'autres modèles. C'était la règle du 16 novembre, avant les remboursements : depuis ceux-ci,
 *   chercher un modèle précis par les pochettes coûte bien plus que la boutique (voir plus bas).
 *
 * Les remboursements, depuis le soir du 16 novembre 2026 (le pilote : « le moins bien qu'on peut avoir, c'est un commun à
 * 11 500 ; rajoute la probabilité de récupérer 20 à 60 % de sa somme », puis le choix de 85 % ; migration
 * 20261116000600_gaulois_uniques_remboursements) : une pochette rend, 85 fois sur 100, 20, 30, 40, 50 ou 60 % de son prix
 * (paliers à chances égales), et donne, 15 fois sur 100, un Gaulois unique selon les chances par rareté ci-dessous, prises
 * dans cette part. Au prix de la boutique, elle vaut alors en moyenne 3 249 statères pour 3 000 au départ
 * (`valeurMoyenneDeLaPochette` de `modeles.ts`) ; sans remboursement, elle en valait 14 860. C'est un pari juste en
 * moyenne, pas un chemin vers un modèle précis : tirer un modèle donné coûte en moyenne, remboursements déduits, environ
 * 50 000 statères pour un commun et 123 000 pour le dragon, quatre fois plus que la boutique.
 */

/** Le prix de chaque Gaulois unique à la boutique, par rareté, en statères (table `internal.modeles_prix` du serveur). */
export const PRIX_MODELE_PAR_RARETE: Readonly<Record<RareteDUnique, number>> = {
  commun: 11500,
  "peu-commun": 15500,
  epique: 20000,
  mystique: 25000,
  legendaire: 28000,
};

/** Le prix de la pochette des Gaulois uniques, en statères (demande du pilote ; le serveur refuse moins de 500). */
export const PRIX_POCHETTE_MODELES = 3000;

/** La part des pochettes qui rendent une partie de leur prix au lieu d'un Gaulois unique, en pour cent (choix du pilote). */
export const REMBOURSEMENT_POCHETTE_MODELES = 85;

/** Ce que rend un remboursement, en pour cent du prix de la pochette : cinq paliers à chances égales, 40 % en moyenne. */
export const PALIERS_DE_REMBOURSEMENT = [20, 30, 40, 50, 60] as const;

/** Les chances de la pochette des Gaulois uniques par rareté, en pour cent de la part qui donne un modèle : 100 en tout. */
export const CHANCES_POCHETTE_MODELES: Readonly<Record<RareteDUnique, number>> = {
  commun: 50,
  "peu-commun": 30,
  epique: 12,
  mystique: 6,
  legendaire: 2,
};

/** Un Gaulois unique possédé, et quand il a été reçu. */
export interface ModelePossede {
  modele: string;
  acquis_le: string;
}

/**
 * `get_mes_modeles()`, pour un compte connecté : son solde, le prix d'un Gaulois unique de chaque rareté à la boutique, la
 * pochette, ses modèles (les plus récents d'abord) et celui qu'il porte (`porte`, ou `null` : le corps humain).
 * `peut_acheter` : compte validé avec un Gaulois créé.
 */
export interface MesModeles {
  ok: true;
  solde: number;
  peut_acheter: boolean;
  prix: Record<RareteDUnique, number>;
  /**
   * La pochette : son prix, les chances par rareté (de la part qui donne un modèle), la part des remboursements en pour
   * cent et leurs paliers (en pour cent du prix). Un serveur d'avant les remboursements ne dit ni l'une ni les autres :
   * 0 et aucun palier.
   */
  pochette: { prix: number; chances: Record<RareteDUnique, number>; remboursement: number; paliers: number[] };
  modeles: ModelePossede[];
  porte: string | null;
}

/** `acheter_modele(p_modele, p_prix_vu)` : le modèle acheté, sa rareté, et le solde après l'achat. */
export interface AchatModeleReponse {
  ok: true;
  solde: number;
  modele: { modele: string; rarete: RareteDUnique };
}

/**
 * `ouvrir_pochette_modeles(p_prix_vu)` : le modèle reçu et sa rareté, ou le remboursement (la part du prix rendue, en pour
 * cent, et les statères rendus) ; l'un des deux, jamais les deux. Le solde après l'ouverture, et combien de modèles il reste
 * à recevoir.
 */
export interface PochetteModelesReponse {
  ok: true;
  solde: number;
  modele: { modele: string; rarete: RareteDUnique } | null;
  remboursement: { pourcent: number; rendu: number } | null;
  reste: number;
}

/**
 * Les refus des Gaulois uniques, en plus de ceux de tout compte (`not_signed_in`, `suspended`, `rate_limited`) :
 * `not_validated`, `no_gaulois`, `unknown_modele` (hors de la liste), `deja_possede`, `prix_change`, `tout_possede` (la
 * pochette n'a plus rien à donner : rien n'est débité), `solde_insuffisant`. Un refus ne débite rien.
 */
export type RefusModeles = "not_validated" | "no_gaulois" | "unknown_modele" | "deja_possede" | "prix_change" | "tout_possede" | "solde_insuffisant";

/*
 * La pochette de statères (demande du pilote, 16 novembre 2026 : « des pochettes de statères (un casino) », « des
 * probabilités justes » ; il a choisi la première de quatre idées) ; migration 20261116000800_pochette_de_stateres,
 * calculs dans `pochette-stateres.ts`.
 *
 * Elle coûte des statères et rend des statères : un des six lots ci-dessous, tiré par le serveur. Le jeu est juste : en
 * moyenne, elle rend exactement son prix (la somme des chances fois les gains vaut 200), donc elle ne crée ni ne détruit
 * de statères. Un compte en ouvre dix par jour au plus (le jour de Paris). Prix, lots et plafond sont fixés par la
 * migration : aucun réglage dans la Direction.
 */

/** Le prix de la pochette de statères. Le même que le serveur. */
export const PRIX_POCHETTE_STATERES = 200;

/** Le nombre de pochettes de statères qu'un compte ouvre par jour, au plus. Le même que le serveur. */
export const PLAFOND_POCHETTE_STATERES = 10;

/** Un lot de la pochette de statères : son rang (1, le plus courant), sa chance en pour cent, son gain en statères. */
export interface LotDeStateres {
  rang: number;
  chance: number;
  gain: number;
}

/** Les lots de la pochette de statères, du plus courant au plus rare : 100 pour cent en tout, 200 statères en moyenne. */
export const LOTS_POCHETTE_STATERES: readonly LotDeStateres[] = [
  { rang: 1, chance: 55, gain: 60 },
  { rang: 2, chance: 28, gain: 160 },
  { rang: 3, chance: 11, gain: 350 },
  { rang: 4, chance: 4.5, gain: 700 },
  { rang: 5, chance: 1.3, gain: 2000 },
  { rang: 6, chance: 0.2, gain: 13100 },
];

/**
 * `get_pochette_stateres()`, pour un compte connecté : son solde, la pochette (prix, lots, plafond du jour) et combien il
 * en a ouvert aujourd'hui. `peut_ouvrir` : compte validé avec un Gaulois créé.
 */
export interface MaPochetteStateres {
  ok: true;
  solde: number;
  peut_ouvrir: boolean;
  prix: number;
  plafond: number;
  ouvertes: number;
  lots: LotDeStateres[];
}

/** `ouvrir_pochette_stateres(p_prix_vu)` : le lot tiré, le solde après le prix payé et le gain reçu, les ouvertures du jour. */
export interface PochetteStateresReponse {
  ok: true;
  solde: number;
  lot: { rang: number; gain: number };
  ouvertes: number;
}

/**
 * Les refus de la pochette de statères, en plus de ceux de tout compte (`not_signed_in`, `suspended`, `rate_limited`) :
 * `not_validated`, `no_gaulois`, `prix_change`, `plafond_du_jour` (dix pochettes déjà ouvertes aujourd'hui),
 * `solde_insuffisant`. Un refus ne débite rien.
 */
export type RefusPochetteStateres = "not_validated" | "no_gaulois" | "prix_change" | "plafond_du_jour" | "solde_insuffisant";

/* ---------- Le sentier des Gaulois, « Le pass » à l'écran (16 novembre 2026, migration 20261116001100 ; saisons de six semaines, objet et insigne de saison : 20261121000300) ---------- */

/** Les raretés qu'un palier du sentier peut donner : celles qui ont un prix à la boutique. */
export type RareteDePalier = "commun" | "peu-commun" | "epique" | "mystique" | "legendaire";

/** Les pas que donnent une mission faite, un jour de visite, chaque septième jour de visite, et le défi du clan rempli. Les mêmes que le serveur. */
export const PAS_DU_SENTIER = { mission: 10, visite: 5, semaine: 30, tous_les: 7, defi: 30 } as const;

/** La remise de l'étal du jour, en pour cent du prix de la boutique. La même que le serveur. */
export const REMISE_DE_L_ETAL = 30;

/** Les sept missions du jour. Les mêmes codes que le serveur (`internal.sentier_missions`). */
export const MISSIONS_DU_SENTIER = ["partie", "vocal", "pochette", "parties_3", "victoire", "points_3", "equipe"] as const;
export type MissionDuSentier = (typeof MISSIONS_DU_SENTIER)[number];

/**
 * La première saison : six semaines, du 17 novembre au 28 décembre 2026 (décision du pilote du 21 novembre 2026 ; elle
 * devait finir le 31 décembre), 30 paliers de 30 pas, et son objet, donné au dernier palier. La même que le serveur.
 */
export const SAISON_1 = {
  id: "saison-1",
  nom: "Saison 1",
  debut: "2026-11-17",
  fin: "2026-12-28",
  paliers: 30,
  pas_par_palier: 30,
  objet: { emplacement: "tete", objet: "couronne-solstice" },
} as const;

/** La rareté de l'objet de chaque palier de la saison 1, du palier 1 au palier 30. Les mêmes que le serveur. */
export const PALIERS_DE_LA_SAISON_1: readonly RareteDePalier[] = [
  "commun",
  "commun",
  "commun",
  "peu-commun",
  "commun",
  "commun",
  "peu-commun",
  "commun",
  "peu-commun",
  "epique",
  "commun",
  "peu-commun",
  "commun",
  "peu-commun",
  "epique",
  "commun",
  "peu-commun",
  "peu-commun",
  "epique",
  "mystique",
  "commun",
  "peu-commun",
  "epique",
  "peu-commun",
  "mystique",
  "peu-commun",
  "epique",
  "mystique",
  "mystique",
  "legendaire",
];

/** Une saison du sentier : son premier et son dernier jour, compris, à l'heure de Paris. */
export interface SaisonDuSentier {
  id: string;
  nom: string;
  debut: string;
  fin: string;
  paliers: number;
  pas_par_palier: number;
  /** La saison est passée : plus de missions, mais ses paliers atteints se prennent encore jusqu'à `prendre_jusqu_au` compris. */
  finie: boolean;
  prendre_jusqu_au: string | null;
  /**
   * L'objet de la saison (rareté « légendaire de saison »), donné au dernier palier au lieu d'un légendaire tiré au hasard,
   * et qu'on n'obtient que là ; null pour une saison sans objet. Absent tant que la migration 20261121000300 n'est pas installée.
   */
  objet?: RefObjet | null;
}

/** Un insigne de saison : la saison dont le membre a pris le dernier palier, et quand. Son dessin : `insignes-de-saison.ts`. */
export interface InsigneDuPass {
  saison: string;
  nom: string;
  obtenu_le: string;
}

/** Un palier : la rareté de son objet, et l'objet reçu une fois pris. */
export interface PalierDuSentier {
  palier: number;
  rarete: RareteDePalier;
  pris: RefObjet | null;
}

/** Une mission du jour : ce qui est fait, ce qu'il faut, et si ses pas sont donnés. */
export interface MissionDuJour {
  code: MissionDuSentier;
  fait: number;
  cible: number;
  gagnee: boolean;
}

/** Le défi du clan du jour : la cible et les points du clan, si le compte a joué, et si ses pas sont donnés. */
export interface DefiDuClan {
  cible: number;
  points: number;
  joue: boolean;
  gagne: boolean;
}

/** L'étal du jour : un objet payant de la boutique, à prix réduit. */
export interface EtalDuJour extends RefObjet {
  rarete: RareteDePalier;
  prix: number;
  prix_boutique: number;
  possede: boolean;
}

/**
 * `get_mon_sentier()`, pour un compte connecté. `peut_avancer` : compte validé avec un Gaulois créé. Hors saison, `saison`
 * est `null`, `pas` et `visites` valent 0, `paliers` et `missions` sont vides et `defi` est `null` ; l'étal reste.
 * `releve` : l'heure de la dernière relecture des parties.
 */
export interface MonSentier {
  ok: true;
  peut_avancer: boolean;
  solde: number;
  jour: string;
  releve: string | null;
  regles: { mission: number; visite: number; semaine: number; tous_les: number; defi: number; remise: number };
  saison: SaisonDuSentier | null;
  pas: number;
  paliers: PalierDuSentier[];
  visites: number;
  missions: MissionDuJour[];
  defi: DefiDuClan | null;
  etal: EtalDuJour | null;
  /** Les insignes de saison du compte, le plus récent d'abord. Absent tant que la migration 20261121000300 n'est pas installée. */
  insignes?: InsigneDuPass[];
}

/**
 * `prendre_palier(p_palier)` : l'objet reçu ; `double` : le compte l'avait déjà. Au dernier palier d'une saison qui a son
 * objet, c'est cet objet, de rareté « saison », et `insigne` dit l'insigne de la saison ; sinon `insigne` est null (absent
 * avant la migration 20261121000300).
 */
export interface PalierReponse {
  ok: true;
  palier: number;
  objet: RefObjet & { rarete: RareteDePalier | "saison"; double: boolean };
  insigne?: { saison: string; nom: string } | null;
}

/**
 * Les refus du sentier, en plus de ceux de tout compte : `not_validated`, `no_gaulois`, `mode_god`, `saison_fermee`, `unknown_palier`,
 * `palier_pas_atteint`, `deja_pris` pour un palier ; `etal_change`, `deja_possede`, `prix_change`, `solde_insuffisant`
 * pour l'étal. Un refus ne donne ni ne débite rien.
 */
export type RefusDuSentier = "not_validated" | "no_gaulois" | "mode_god" | "saison_fermee" | "unknown_palier" | "palier_pas_atteint" | "deja_pris" | "etal_change" | "deja_possede" | "prix_change" | "solde_insuffisant";

/* ---------- La loterie du mardi (supabase/migrations/20261116001200_loterie_du_lundi.sql, passée au mardi par la 20261117001300_loterie_du_mardi.sql) ---------- */

/** Les pochettes qu'on gagne à la loterie, sous le nom que le serveur leur donne. */
export const POCHETTES_GAGNEES = ["surprise", "familiers", "bannieres", "modeles", "stateres"] as const;
export type PochetteGagnee = (typeof POCHETTES_GAGNEES)[number];

/** Un lot du podium : 1 l'or, 2 l'argent, 3 le bronze ; ses statères et le nombre de pochettes de chaque sorte. */
export interface LotDeLoterie {
  rang: 1 | 2 | 3;
  gain: number;
  pochettes: Record<PochetteGagnee, number>;
}

/** Les lots fixés par le pilote le 16 novembre 2026, ceux de internal.loterie_lots() : un test les compare. */
export const LOTS_LOTERIE: readonly LotDeLoterie[] = [
  { rang: 1, gain: 3000, pochettes: { surprise: 1, familiers: 1, bannieres: 1, modeles: 1, stateres: 1 } },
  { rang: 2, gain: 1500, pochettes: { surprise: 0, familiers: 1, bannieres: 1, modeles: 0, stateres: 0 } },
  { rang: 3, gain: 750, pochettes: { surprise: 0, familiers: 0, bannieres: 1, modeles: 0, stateres: 5 } },
];

/** Le prix d'un billet acheté, en statères : ce que rapportait un point (internal.loterie_prix_billet). Plus aucun billet ne s'achète depuis le 21 novembre 2026. */
export const PRIX_BILLET_LOTERIE = 30;
/** Le mardi du premier tirage (internal.loterie_premier_tirage). */
export const PREMIER_TIRAGE_LOTERIE = "2026-11-17";
/** Le premier tirage des boosters de loterie (internal.loterie_premier_booster) : celui du mardi 24 novembre 2026. */
export const PREMIER_TIRAGE_DES_BOOSTERS = "2026-11-24";
/** Le ticket d'or : il sort une fois sur `sur` d'un booster de loterie et vaut `billets` billets (internal.loterie_or_sur, internal.loterie_or_billets). */
export const TICKET_D_OR = { sur: 10, billets: 5 } as const;

/**
 * La part d'un Gaulois dans un tirage : ses billets gagnés et achetés. Depuis le tirage du 24 novembre 2026, les billets
 * gagnés sont ceux de ses boosters de loterie ouverts (les billets de points de chaque jour joué, plus 5 par ticket d'or) ;
 * avant, un par point rapporté au clan dans la semaine. Plus aucun billet ne s'achète : `achetes` ne vaut plus que pour les
 * billets payés avant (tirage du 24 novembre 2026 compris). `tickets_or` : les tickets d'or de la part, dont les billets
 * sont déjà dans `gratuits` (absent avant la migration 20261121000200). Dans un tirage fait, `rang` dit sa marche du podium
 * et `billet` le billet tiré, compté dans les siens à partir de zéro, les billets gagnés d'abord ; sinon les deux sont null.
 * `banniere` : la bannière qu'il montre sur /gaulois, ou null. Jamais un identifiant.
 */
export interface PartDeLoterie {
  nom: string;
  tenue: unknown;
  banniere: string | null;
  moi: boolean;
  gratuits: number;
  achetes: number;
  tickets_or?: number;
  rang: 1 | 2 | 3 | null;
  billet: number | null;
}

/**
 * Un booster de loterie : un par jour (à Paris) où le compte a joué au moins une partie du clan, pour le tirage du mardi
 * qui suit. Fermé, il ne dit rien de ce qu'il contient : `billets` et `ticket_or` sont null. Ouvert : `billets`, les billets
 * des points rapportés au clan ce jour-là (au moins un s'il y en a, 0 un jour sans points), et `ticket_or`, s'il contient
 * un ticket d'or (5 billets de plus). Un booster fermé au tirage est ouvert par le serveur.
 */
export interface BoosterDeLoterie {
  jour: string;
  ouvert: boolean;
  billets: number | null;
  ticket_or: boolean | null;
}

/**
 * `get_loterie()`, pour un compte validé ou de l'équipe gauloise. `tirage` : le mardi du tirage à venir (AAAA-MM-JJ, à
 * Paris) ; `heure` : son instant ; `close` : sa semaine est finie, les billets gagnés ne bougent plus. `peut_acheter` :
 * toujours false depuis la migration 20261121000200, qui ajoute `achat_ferme`, `boosters` (ceux de l'appelant pour le tirage
 * à venir) et `or` (le ticket d'or). `solde` et `bons` (les pochettes gagnées qui restent à ouvrir) sont ceux de l'appelant
 * seul. `dernier` : le dernier tirage fait, ou null.
 */
export interface MaLoterie {
  ok: true;
  tirage: string;
  heure: string;
  close: boolean;
  prix: number;
  lots: LotDeLoterie[];
  parts: PartDeLoterie[];
  peut_acheter: boolean;
  achat_ferme?: boolean;
  solde: number;
  bons: Partial<Record<PochetteGagnee, number>>;
  boosters?: BoosterDeLoterie[];
  or?: { sur: number; billets: number };
  dernier: { tirage: string; tire_le: string; parts: PartDeLoterie[] } | null;
  releve: string | null;
}

/**
 * `ouvrir_booster_loterie(p_jour)` : le booster ouvert (celui du jour donné, ou sans jour le plus ancien encore fermé de la
 * semaine du tirage à venir). `billets` : ceux des points du jour ; `billets_or` : 5 avec un ticket d'or, 0 sinon ; `total`
 * leur somme ; `restants` : les boosters de la semaine encore fermés.
 */
export interface BoosterOuvert {
  ok: true;
  jour: string;
  tirage: string;
  billets: number;
  ticket_or: boolean;
  billets_or: number;
  total: number;
  restants: number;
}

/** Les refus de l'ouverture d'un booster de loterie, en plus de ceux de tout compte. Un refus n'ouvre rien. */
export type RefusBoosterDeLoterie = "not_validated" | "no_gaulois" | "aucun_booster" | "deja_ouvert";

/**
 * `get_pochettes_gagnees()` : les pochettes gagnées à la loterie ou offertes par un palier de victoires, qui restent à
 * ouvrir (`bons`), et les paliers de victoires qui ont offert un booster surprise au compte, du plus haut au plus bas
 * (`paliers`, absent avant la migration 20261121000100).
 */
export interface MesPochettesGagnees {
  ok: true;
  bons: Partial<Record<PochetteGagnee, number>>;
  paliers?: number[];
}

/** `acheter_billets_loterie(p_nombre, p_prix_vu)` : le solde après l'achat, les billets gagnés et achetés du compte. */
export interface AchatDeBillets {
  ok: true;
  solde: number;
  gratuits: number;
  achetes: number;
}

/**
 * Les refus de l'achat de billets, en plus de ceux de tout compte : `invalid_request`, `mode_god` (pendant un essai du
 * mode GOD), `tirage_fait`, `prix_change`, `aucun_billet` (aucun point rapporté dans la semaine du tirage),
 * `plafond_billets` (jamais plus de billets achetés que de billets gagnés), `solde_insuffisant`, `not_validated`,
 * `no_gaulois` ; depuis la migration 20261121000200, toujours `achat_ferme`. Un refus ne débite rien.
 */
export type RefusLoterie = "invalid_request" | "mode_god" | "tirage_fait" | "prix_change" | "aucun_billet" | "plafond_billets" | "solde_insuffisant" | "not_validated" | "no_gaulois" | "achat_ferme";
