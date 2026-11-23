/**
 * Les sons du jeu de cartes du vingt-et-un (maquette de Claude Fable 5.2, validée par le pilote le 22 novembre 2026, portés
 * tels quels) : feutrés, de la famille du casino, faits des briques de `casino-sons.ts` (rien au-dessus de 7 400 Hz). Une
 * carte qui glisse du sabot, une carte qui se retourne, le croupier qui soulève sa carte cachée, deux mains qui se séparent,
 * une main qui dépasse 21, le druide qui conseille.
 */
import { peau, souffle, ton } from "./casino-sons";

export const SONS_DU_VINGT_ET_UN = {
  /** Une carte sort du sabot et se pose sur le feutre. */
  carte: (): void => {
    souffle(0, 0.11, "bandpass", 2600, 1100, 1.1, 0.05, 0.004);
    peau(0.09, 190, 0.035, 0.05, 1.3);
  },
  /** Une carte se retourne. */
  retourne: (): void => {
    souffle(0, 0.05, "bandpass", 1500, 3000, 2, 0.04, 0.002);
    ton(820, 640, 0.07, 0.06, 0.02, "triangle", 0.002);
  },
  /** Le croupier soulève le coin de sa carte cachée. */
  regarde: (): void => souffle(0, 0.16, "bandpass", 900, 1700, 1.5, 0.03, 0.05),
  /** Deux mains qui se séparent sur le feutre. */
  glisse: (): void => souffle(0, 0.26, "bandpass", 1300, 700, 1, 0.045, 0.03),
  /** Plus de 21 : un coup sourd. */
  saute: (): void => {
    peau(0, 118, 0.1, 0.22, 1.4);
    souffle(0, 0.08, "lowpass", 600, 200, 0.7, 0.04);
  },
  /** Le druide conseille : trois notes claires. */
  druide: (): void => {
    ton(587.3, 587.3, 0, 0.7, 0.03, "triangle", 0.02);
    ton(880, 880, 0.14, 0.8, 0.022, "sine", 0.02);
    ton(1174.7, 1174.7, 0.28, 0.9, 0.012, "sine", 0.02);
  },
};
export type SonDuVingtEtUn = keyof typeof SONS_DU_VINGT_ET_UN;
