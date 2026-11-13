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
}

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
