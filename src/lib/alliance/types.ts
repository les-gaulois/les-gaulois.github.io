/**
 * Ce que rend le serveur pour la carte de l'alliance (migration `20261113000400_alliances_sur_la_carte.sql`). Le serveur
 * décide de tout : ces types ne servent qu'à l'affichage.
 */

/** Ce que la carte de l'alliance ouvre à ce compte. */
export interface AccesCarte {
  /** Un Gaulois validé, ou un joueur d'un clan allié invité par l'encadrement. */
  kind: "gaulois" | "allie";
  /** Son clan : GAL pour un Gaulois. */
  tag: string;
  /** Son nom sur la carte : le pseudo d'un Gaulois dans la liste officielle, le nom choisi par un allié. */
  name: string;
  rank: number;
  /** Un officier, un admin ou le fondateur de GAL : il range les clans, dessine les zones et invite les alliés. */
  staff: boolean;
}

export interface AllianceLigne {
  id: number;
  name: string;
  /** 0xRRGGBB. */
  color: number;
  clans: string[];
}

/** Des troupes déclarées par un joueur du clan, jamais relevées chez OpenFront. */
export interface TroupesLigne {
  tag: string;
  troops: number;
  /** « [LUX] Kraken » : qui a déclaré. */
  by: string;
  at: string;
}

export interface ZoneLigne {
  id: number;
  title: string;
  /** Le clan chargé de la prendre, ou toute l'alliance. */
  tag: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Un bit par pixel du cadre, en base 64. */
  mask: string;
  pixels: number;
  updated_at: string;
  /** « [LUX] Pseudo » : qui l'a dessinée ou modifiée en dernier, `null` s'il n'a plus accès (migration 20261113000700). */
  by?: string | null;
  /** L'appelant peut la modifier : l'encadrement, ou un allié pour une zone de son clan. Absent d'un serveur plus ancien. */
  can_edit?: boolean;
  /**
   * Depuis la migration 20261113001000 : son état, réglé par l'encadrement, et sa place dans l'ordre des priorités (1 pour
   * la première). Absents d'un serveur d'avant : la zone n'a pas d'état affiché, et l'ordre est celui reçu.
   */
  state?: EtatZone;
  rank?: number | null;
  /**
   * Depuis la migration 20261113001100 : une zone créée ou modifiée par un allié, qui attend l'accord de l'encadrement. Elle
   * ne se voit que de l'encadrement et des alliés de son clan, et ne compte pas encore. Absent d'un serveur d'avant : acceptée.
   */
  pending?: boolean;
  /**
   * Pour une zone acceptée qu'un allié a modifiée depuis, et qui attend : le cadre et le masque de sa version acceptée, qui
   * revient si l'encadrement refuse la modification. Seuls l'encadrement et les alliés de son clan la reçoivent ; les autres
   * reçoivent cette version acceptée à la place de la zone.
   */
  previous?: { title?: string; x: number; y: number; w: number; h: number; mask: string } | null;
}

/** L'état d'une zone, choisi par l'encadrement. */
export type EtatZone = "a_prendre" | "en_cours" | "tenue" | "abandonnee";
export const ETATS_ZONE: readonly EtatZone[] = ["a_prendre", "en_cours", "tenue", "abandonnee"];

export interface AllieLigne {
  number: number;
  alias: string;
  tag: string;
  discord_name: string | null;
  joined_at: string;
  /** Faux tant que l'encadrement ne l'a pas accepté : il a ouvert son lien et attend. */
  approved: boolean;
  /** Faux tant qu'il attend, ou quand son clan n'est plus dans notre alliance : il n'entre plus, sans avoir été retiré. */
  active: boolean;
}

export interface InvitationLigne {
  id: number;
  tag: string;
  note: string;
  created_at: string;
  expires_at: string;
}

/** Le joueur qui a ouvert son lien d'invitation et attend l'accord de l'encadrement. */
export interface AttenteAllie {
  tag: string;
  alias: string;
  since: string;
}

export interface CarteAlliance {
  access: AccesCarte | null;
  /** L'appelant peut dessiner une zone : l'encadrement, et un allié pour son clan. Absent d'un serveur plus ancien. */
  can_draw?: boolean;
  /** Pour un compte sans accès : sa demande en attente, s'il en a une. */
  waiting?: AttenteAllie | null;
  /** L'alliance où est rangé GAL. */
  ours?: number | null;
  alliances?: AllianceLigne[];
  troops?: TroupesLigne[];
  zones?: ZoneLigne[];
  /** Pour l'encadrement seulement. */
  allies?: AllieLigne[] | null;
  invites?: InvitationLigne[] | null;
}

export interface MessageAlliance {
  id: number;
  at: string;
  tag: string;
  name: string;
  /** Écrit par l'encadrement de GAL. */
  staff: boolean;
  body: string;
  mine: boolean;
  can_delete: boolean;
}

/** Le message épinglé par l'encadrement en haut de la discussion (migration 20261113001000). */
export interface MessageEpingle {
  id: number;
  at: string;
  tag: string;
  name: string;
  staff: boolean;
  body: string;
  pinned_at: string;
  /** Son auteur ou l'encadrement peut le retirer ; absent d'un serveur plus ancien. */
  can_delete?: boolean;
}
