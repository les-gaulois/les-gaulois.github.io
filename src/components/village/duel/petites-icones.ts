/**
 * Les petites icônes blanches des boutons du duel, sur 16 cases (dessins de Claude Fable 5.2, 22 novembre 2026, pour les
 * écrans autour du duel) : la flèche du retour, les épées croisées (affronter, jouer un défi), la coche (réussi, prendre),
 * la carte en pointillé (à trouver). Faites dans la page, sans toucher aux icônes du kit : crème sur un bouton bleu, encre
 * sur un bouton d'or.
 */
import { urlDeLaPlanche } from "../../../lib/jeu/dans-la-page";
import { PAL } from "../../../lib/jeu/palette";
import { grille } from "../../../lib/jeu/planche";

const PETITES = {
  fleche: ["................", "................", "................", ".......ww.......", "......www.......", ".....www........", "....wwwwwwwwww..", "...wwwwwwwwwww..", "....wwwwwwwwWW..", ".....www........", "......www.......", ".......WW.......", "................", "................", "................", "................"],
  epees: ["................", ".ww..........ww.", ".www........www.", "..www......www..", "...www....www...", "....www..www....", ".....wwwwww.....", "......wwww......", "......wwww......", ".....wwwwww.....", "..w.www..www.w..", "..wwww....wwww..", "...ww......ww...", "..wwww....wwww..", ".ww..w....w..ww.", "................"],
  coche: ["................", "................", "................", ".............ww.", "............www.", "...........www..", "..........www...", ".ww......www....", ".www....www.....", "..www..www......", "...wwwwww.......", "....wwww........", ".....ww.........", "................", "................", "................"],
  manque: ["................", "................", "....ww.ww.ww....", "....w......w....", "...........w....", "....w...........", "....w......w....", "...........w....", "....w...........", "....w......w....", "...........w....", "....w...........", "....w......w....", "....ww.ww.ww....", "................", "................"],
} as const;
export type NomDePetiteIconeDuDuel = keyof typeof PETITES;

/** L'image d'une petite icône, pour `--i` d'un `.jeu-pic` : en encre sur l'or, en crème sur le bleu. */
export const urlDePetiteIcone = (nom: NomDePetiteIconeDuDuel, encre: boolean): string =>
  urlDeLaPlanche(`duel-petite|${nom}|${encre}`, () => grille(PETITES[nom], encre ? { w: "#231503", W: "#231503" } : { w: PAL.w, W: PAL.W }));
