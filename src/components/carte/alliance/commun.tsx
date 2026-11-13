/** Ce que partagent les parties de la fenêtre « Alliance » de la carte. */
import type { TotalAlliance } from "../../../lib/alliance/bilan";
import { cssDe } from "../../../lib/alliance/couleurs";
import type { AccesCarte, CarteAlliance } from "../../../lib/alliance/types";
import type { EtatCarte } from "../../../lib/clanmap/etat";
import type { StoredClanMapFilm } from "../../../lib/schemas";

/** Tout ce que lit une partie de la fenêtre : le serveur, la carte publiée, et qui regarde. */
export interface Contexte {
  donnees: CarteAlliance & { access: AccesCarte };
  film: StoredClanMapFilm;
  /** `null` : l'état pixel par pixel n'est pas publié pour ce relevé ; les zones ne se comptent ni ne se dessinent. */
  etat: EtatCarte | null;
  /** L'encadrement de GAL, hors vue joueur : il range les clans, dessine les zones et invite. */
  staff: boolean;
  totaux: TotalAlliance[];
  /** Les tags de notre alliance, celle où est rangé GAL. */
  notres: Set<string>;
  relire: () => Promise<void>;
}

/** La pastille de couleur d'une alliance, à côté de son nom. Décorative : le nom est écrit. */
export function Pastille({ couleur }: { couleur: number }) {
  return <i class="carte-pastille" style={{ background: cssDe(couleur) }} aria-hidden="true"></i>;
}

/** Le nom lisible d'un clan : son tag, ou « Clan supprimé ». */
export const nomDuClan = (tag: string | null): string => tag ?? "Clan supprimé";
