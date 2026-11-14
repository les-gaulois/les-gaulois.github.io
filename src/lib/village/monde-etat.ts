/**
 * Ce que le monde du village sait du clan, calculé à la construction du site sur les sessions publiques du clan
 * (`data/sessions/`) : le chantier du village qui se bâtit et le grand feu de la place. La page `/village` le reçoit
 * tel quel, et `/village/monde.json` le publie pour la commande /feu du robot. Le contrat entre le calcul (`chantier.ts`),
 * l'écran du monde et le robot : base commune du 14 novembre 2026.
 *
 * Rien n'est du temps réel : tout est « au dernier relevé » des sessions, dont l'heure est donnée. `null` : pas de données
 * (ce n'est pas zéro).
 */
import type { BatimentId, NiveauDuFeu } from "./chantier-liste";

export interface EtatDuBatiment {
  id: BatimentId;
  nom: string;
  titre: string;
  cout: number;
  /** Les points rapportés au clan déjà posés sur ce bâtiment, de 0 à `cout`. */
  poses: number;
  /** Le début de la partie qui l'a fini (ISO), ou `null` s'il n'est pas fini. */
  fini_le: string | null;
}

export interface EtatDuChantier {
  /** Le début du chantier (ISO), `DEBUT_DU_CHANTIER`. */
  depuis: string;
  /** Les points rapportés au clan depuis le début du chantier, au dernier relevé. */
  points: number;
  /** Tous les bâtiments, dans l'ordre du chantier. */
  batiments: EtatDuBatiment[];
  /** Le bâtiment en cours, ou `null` quand tout est bâti. */
  en_cours: BatimentId | null;
}

export interface EtatDuFeu {
  niveau: NiveauDuFeu;
  /** Les points rapportés au clan sur les jours comptés. */
  points: number;
  /** Les jours comptés (`FEU_JOURS`), jusqu'au dernier relevé. */
  jours: number;
}

export interface EtatDuMonde {
  /** L'heure du dernier relevé des sessions du clan (ISO), ou `null` si elle n'est pas connue. */
  releve: string | null;
  chantier: EtatDuChantier | null;
  feu: EtatDuFeu | null;
}
