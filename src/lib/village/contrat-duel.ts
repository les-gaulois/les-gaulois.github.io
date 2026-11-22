/**
 * Le contrat de « Coup pour coup », le duel de cartes de « Mon Gaulois » (chantier du 22 novembre 2026), entre les écrans et
 * le serveur. Le serveur décide de tout : il garde les mains, joue la machine à partir d'une graine qu'il ne montre pas,
 * résout chaque manche en SQL et donne les récompenses. Ce fichier dit seulement la forme de ses réponses, ses codes de
 * refus et ses chiffres de départ ; les règles sont dans `supabase/functions/code-discord/duel/` (le moteur partagé),
 * l'écran les rejoue pour montrer chaque manche.
 *
 * Fonctions SQL (migration du duel, à venir ; elles seront appelées par `src/lib/compte/api.ts`) :
 * - `get_mon_duel()` : tout l'écran d'un coup (`EtatDuDuel`) ;
 * - `enregistrer_main_duel(p_main)` : la main de défense, celle que la machine joue quand un autre membre te défie ;
 * - `get_adversaires_duel()` : les Gaulois qu'on peut défier (`AdversaireDuDuel`) ;
 * - `commencer_duel(p_contre, p_cle, p_main)` : un duel contre la main de défense d'un membre (`p_contre` « membre »,
 *   `p_cle` sa clé) ou contre le boss du jour (« boss », sans clé), avec ta main ;
 * - `jouer_manche_duel(p_partie, p_manche, p_carte)` : tu poses ta carte ; le serveur choisit celle de la machine sans voir
 *   la tienne, résout la manche et rend la partie ;
 * - `abandonner_duel(p_partie)` : la partie est perdue ;
 * - pour le robot et le site, avec la clé de service : `noter_flammes_duel`, `duel_annonces_a_envoyer`, `noter_annonces_duel`.
 *
 * Tant que l'interrupteur `internal.duel_ouvert` est faux, seul le titulaire (le pilote, `internal.stateres_don_titulaire`)
 * voit et joue le duel : pour tout autre compte, ces fonctions refusent `duel_ferme`.
 *
 * Aucune récompense en statères : le duel n'en crée ni n'en prend jamais. Proposition de la session du moteur, à confirmer
 * par le pilote : un duel compté gagné donne des pas du pass (`internal.sentier_gains`, source « duel/1 » à « duel/4 »).
 * Les chiffres ci-dessous (duels comptés, plafond du jour, pas, abandon) sont aussi des propositions, sauf les 3 duels
 * comptés et le duel de la flamme, choisis par le pilote.
 */
import type { Atouts, EmplacementDuDuel, IdDeCompagnon, IdDeLieu, MainParEmplacement, NiveauDeLaMachine } from "../../../supabase/functions/code-discord/duel/index";
import type { Tenue } from "../gaulois";

/** Une main : la carte de chaque emplacement (l'identifiant d'un objet de la garde-robe, ou d'une carte de base). */
export type MainDuDuel = MainParEmplacement;

/** Les duels comptés par jour (heure de Paris) : au-delà, on rejoue pour le plaisir, sans récompense. */
export const DUELS_COMPTES_PAR_JOUR = 3;
/** Le duel de plus quand la flamme de série du membre brûle. */
export const DUELS_DE_LA_FLAMME = 1;
/** Le plafond de duels joués contre le serveur par jour, comptés ou non : chaque manche se calcule chez lui. */
export const DUELS_AU_PLUS_PAR_JOUR = 30;
/** Les pas du pass que donne un duel compté gagné (proposition) ; une mission du jour en donne 10. Une défaite ou une égalité ne donne rien. */
export const PAS_PAR_VICTOIRE = 5;
/** Le niveau de la machine qui joue la main de défense d'un membre. */
export const NIVEAU_DE_LA_DEFENSE: NiveauDeLaMachine = "guerrier";
/** Une partie laissée sans manche jouée pendant ce temps est perdue par abandon. */
export const HEURES_AVANT_ABANDON = 24;

/** Les cartes jouables d'un membre, par emplacement : ses objets possédés, et les cartes de base que tout le monde a. */
export type CollectionDuDuel = Readonly<Record<EmplacementDuDuel, readonly string[]>>;

/** Ce qui accompagne un camp dans une partie : le lieu (la bannière du Gaulois défié), son compagnon, le pouvoir d'un boss. */
export interface OptionsDUnCamp {
  lieu: IdDeLieu | null;
  compagnon: IdDeCompagnon | null;
  passifs: readonly Atouts[];
}

/** Un Gaulois tel que l'écran le dessine : son nom au village (celui du QG), sa tenue, sa bannière et son familier montrés. */
export interface GauloisDuDuel {
  nom: string;
  tenue: Tenue;
  banniere: string | null;
  familier: string | null;
}

/** Les duels du jour du membre. */
export interface DuelsDuJour {
  /** Le jour, à l'heure de Paris (AAAA-MM-JJ). */
  jour: string;
  /** Les duels comptés de base (3). */
  comptes: number;
  /** La flamme de série brûle : un duel compté de plus. Relevée par le site après chaque construction ; `releve` dit quand. */
  flamme: boolean;
  releve: string | null;
  /** Les duels comptés déjà commencés aujourd'hui. */
  faits: number;
  /** Les duels comptés qui restent aujourd'hui. */
  restants: number;
  /** Tous les duels commencés aujourd'hui, comptés ou non, et leur plafond. */
  joues: number;
  au_plus: number;
}

/** Le boss du jour, le même pour tous ; son nom, son dessin et sa phrase sont dans `duel/contenu/`, par son identifiant. */
export interface BossDuJour {
  boss: string;
  niveau: NiveauDeLaMachine;
  main: MainDuDuel;
  options: OptionsDUnCamp;
  /** Le membre l'a déjà battu aujourd'hui. */
  battu: boolean;
}

/** Un Gaulois qu'on peut défier : sa main de défense, visible comme toutes les mains, et son lieu. Jamais son identifiant de compte. */
export interface AdversaireDuDuel extends GauloisDuDuel {
  /** La clé de sa main de défense, à donner à `commencer_duel`. */
  cle: string;
  main: MainDuDuel;
  options: OptionsDUnCamp;
}

/** Ce que rapporte une partie gagnée et comptée : des pas du pass, jamais de statères. `null` : rien. */
export interface RecompenseDuDuel {
  pas: number;
}

/** Contre qui : la main de défense d'un membre, ou le boss du jour. */
export type ContreQui = "membre" | "boss";

/**
 * Une partie, en cours ou finie. L'écran retrouve chaque manche en rejouant `coups` avec le moteur, depuis les deux camps de
 * départ (`camp(cartesDeLaMain(mains.a), options.a)`). Le camp `a` est toujours le membre qui joue, `b` la machine.
 */
export interface PartieDuDuel {
  partie: number;
  contre: ContreQui;
  /** Le Gaulois défié (contre un membre), ou `null` (contre le boss). */
  adversaire: GauloisDuDuel | null;
  boss: string | null;
  niveau: NiveauDeLaMachine;
  /** Un des duels comptés du jour : une victoire rapporte. */
  compte: boolean;
  mains: { a: MainDuDuel; b: MainDuDuel };
  options: { a: OptionsDUnCamp; b: OptionsDUnCamp };
  /** Les cartes posées à chaque manche jouée : [la tienne, celle de la machine]. */
  coups: readonly (readonly [number, number])[];
  /** La prochaine manche à jouer (la première est 1). */
  manche: number;
  /** La vie des deux camps, pour vérifier le rejeu. */
  vies: { a: number; b: number };
  fini: boolean;
  /** Du côté du membre : 1 gagné, -1 perdu, 0 égalité ; `null` tant que la partie dure. */
  verdict: -1 | 0 | 1 | null;
  abandon: boolean;
  recompense: RecompenseDuDuel | null;
  commence_le: string;
  fini_le: string | null;
}

/** Une attaque reçue par ta main de défense : qui t'a battu, qui tu as repoussé. */
export interface LigneDeDefense {
  le: string;
  /** Le Gaulois qui t'a défié. */
  nom: string;
  /** Du côté du défenseur : « repousse » (il a perdu), « battu » (il a gagné), « egalite ». */
  issue: "repousse" | "battu" | "egalite";
  manches: number;
}

/** Une de tes parties finies. */
export interface LigneDAttaque {
  le: string;
  contre: ContreQui;
  /** Le Gaulois défié, ou le boss. */
  nom: string | null;
  boss: string | null;
  verdict: -1 | 0 | 1;
  manches: number;
  compte: boolean;
}

/** Tes chiffres de toujours : attaques et défenses. */
export interface BilanDuDuel {
  victoires: number;
  defaites: number;
  egalites: number;
  repousses: number;
  battus: number;
}

/** La réponse de `get_mon_duel`. */
export interface EtatDuDuel {
  ok: true;
  /** Le duel est ouvert à tous ; faux pendant l'essai du titulaire. */
  ouvert: boolean;
  collection: CollectionDuDuel;
  /** Ta main de défense, ou `null` : sans elle, personne ne peut te défier. */
  defense: MainDuDuel | null;
  /** Ta main de défense se joue encore : faux si une de ses cartes a quitté ta garde-robe (vendue, fondue) ; alors personne ne peut te défier. */
  defense_valide: boolean;
  jour: DuelsDuJour;
  boss: BossDuJour | null;
  /** La partie en cours, à reprendre ; une seule à la fois. */
  partie: PartieDuDuel | null;
  defenses: readonly LigneDeDefense[];
  attaques: readonly LigneDAttaque[];
  bilan: BilanDuDuel;
}

/** La réponse de `get_adversaires_duel`. */
export interface AdversairesDuDuel {
  ok: true;
  adversaires: readonly AdversaireDuDuel[];
}

/** La réponse de `enregistrer_main_duel`. */
export interface MainEnregistree {
  ok: true;
  defense: MainDuDuel;
}

/** La réponse de `commencer_duel`, de `jouer_manche_duel` et d'`abandonner_duel`. `carte_machine` : la carte que la machine vient de poser. */
export interface PartieRendue {
  ok: true;
  partie: PartieDuDuel;
  carte_machine?: number;
}

/**
 * Une victoire à annoncer sur Discord (`duel_annonces_a_envoyer`, clé de service seulement, pour la session de l'image) :
 * chaque duel compté gagné, le plus ancien d'abord. `essai` : le duel était encore fermé (une victoire du titulaire qui
 * l'essaie). `noter_annonces_duel(p_parties)` les note envoyées.
 */
export interface AnnonceDuDuel {
  partie: number;
  essai: boolean;
  le: string;
  contre: ContreQui;
  boss: string | null;
  manches: number;
  /** La main du vainqueur, puis celle du vaincu. */
  main: MainDuDuel;
  main_vaincue: MainDuDuel;
  vainqueur: GauloisDuDuel;
  /** Le Gaulois vaincu, ou `null` contre un boss. */
  vaincu: GauloisDuDuel | null;
}

/**
 * Les refus propres au duel (leur message en français sera dans `src/lib/compte/errors.ts`) ; s'y ajoutent les refus de
 * tout le site (`not_signed_in`, `suspended`, `not_validated`, `rate_limited`, `no_gaulois`…).
 */
export const REFUS_DU_DUEL = [
  /** Le duel n'est pas encore ouvert. */
  "duel_ferme",
  /** Une carte inconnue, à la mauvaise place, ou une main incomplète. */
  "main_invalide",
  /** Une carte que le membre ne possède pas. */
  "carte_non_possedee",
  /** La main dépasse la bourse de 12 points. */
  "main_trop_chere",
  /** Une partie attend déjà d'être finie. */
  "partie_en_cours",
  /** Ce Gaulois n'a pas (ou plus) de main de défense, ou c'est la tienne. */
  "adversaire_inconnu",
  /** Pas de boss aujourd'hui. */
  "pas_de_boss",
  /** Le plafond des duels du jour est atteint. */
  "trop_de_duels",
  /** Cette partie n'existe pas, ou n'est pas la tienne. */
  "duel_inconnu",
  /** La partie est déjà finie. */
  "partie_finie",
  /** Cette manche est déjà jouée (un envoi répété), ou pas encore. */
  "mauvaise_manche",
  /** Cette carte se repose. */
  "carte_au_repos",
] as const;
export type RefusDuDuel = (typeof REFUS_DU_DUEL)[number];
