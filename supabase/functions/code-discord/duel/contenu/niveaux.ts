/**
 * Les trois niveaux de l'ordinateur du duel « Coup pour coup » : apprenti, guerrier, druide. Des données seules : ce fichier
 * fait foi pour les niveaux ; la machine du moteur (`../machine.ts`) et sa copie SQL (`internal.duel_niveaux`) en reprennent
 * les chiffres. Elle ne voit que ce que voient les deux joueurs, jamais la carte choisie en face.
 *
 * Deux réglages font un niveau :
 * - `loin` : combien de manches la machine regarde devant elle, en supposant qu'en face on joue n'importe quelle carte prête ;
 * - `fantaisie` : combien elle s'écarte de la carte qu'elle juge la meilleure. Petite, elle prend presque toujours la
 *   meilleure ; grande, elle joue presque au hasard, avec un peu plus de chances pour les meilleures cartes.
 *
 * Les cibles du chantier 9 du duel (fiche de projet) : un joueur de bon sens bat l'apprenti environ 8 fois sur 10, le
 * guerrier 1 fois sur 2, le druide 3 fois sur 10. Le **joueur de bon sens** est lui aussi une machine, pour que la mesure se
 * refasse à l'identique : il regarde une manche devant lui et prend presque toujours la meilleure carte (`BON_SENS`).
 * L'essai joue des mains tirées au hasard dans des garde-robes modeste, aisée et riche, chaque paire des deux côtés :
 * `scripts/essai-duel-contenu.ts` (mesure complète), `tests/unit/duel-niveaux.test.ts` (garde, sur moins de duels).
 *
 * Le druide ne regarde que deux manches devant : à trois, il ne gagnait qu'environ 3 points de plus, pour cinq à sept fois plus de
 * calcul, que le serveur refait à chaque manche d'un duel qui compte.
 */

export const NIVEAUX_DE_LA_MACHINE = ["apprenti", "guerrier", "druide"] as const;
export type NiveauDeLaMachine = (typeof NIVEAUX_DE_LA_MACHINE)[number];

/** Les réglages d'un niveau de la machine. */
export interface ReglageDuNiveau {
  /** Combien elle s'écarte de la meilleure carte : 0,05 presque jamais, 40 presque au hasard. */
  readonly fantaisie: number;
  /** Combien de manches elle regarde devant elle : 1 ou 2. */
  readonly loin: number;
}

/**
 * Les trois niveaux, mesurés le 22 novembre 2026 sur le moteur, 600 paires de mains et deux graines : le joueur de bon sens
 * gagne 80 duels sur 100 contre l'apprenti, 50 contre le guerrier, 33 contre le druide.
 */
export const NIVEAUX: Readonly<Record<NiveauDeLaMachine, ReglageDuNiveau>> = {
  apprenti: { fantaisie: 40, loin: 1 },
  guerrier: { fantaisie: 2, loin: 2 },
  druide: { fantaisie: 0.05, loin: 2 },
};

/** Le joueur de bon sens de l'essai : une manche devant lui, presque toujours la meilleure carte. */
export const BON_SENS: ReglageDuNiveau = { fantaisie: 0.5, loin: 1 };

/** La part de duels que le joueur de bon sens doit gagner contre chaque niveau, sur 100. */
export const CIBLES_DES_NIVEAUX: Readonly<Record<NiveauDeLaMachine, number>> = { apprenti: 80, guerrier: 50, druide: 30 };

/** Le niveau qui joue le boss du jour : son pouvoir le rend dur, la machine reste celle d'un guerrier. */
export const NIVEAU_DES_BOSS: NiveauDeLaMachine = "guerrier";
