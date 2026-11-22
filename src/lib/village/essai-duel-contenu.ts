/**
 * L'essai du contenu du duel « Coup pour coup » : un joueur de bon sens (`BON_SENS`) contre chaque niveau de la machine et
 * contre chaque boss du jour. Bâti sur l'essai d'équilibre du moteur (`essai-duel.ts` : mains tirées par garde-robe,
 * `jouerUnDuel`) ; le hasard suit des graines, l'essai rend toujours les mêmes chiffres.
 * `tests/unit/duel-niveaux.test.ts` et `duel-boss.test.ts` en gardent les cibles sur peu de duels ;
 * `npx tsx scripts/essai-duel-contenu.ts` fait la mesure complète.
 */
import { BON_SENS, NIVEAUX, NIVEAU_DES_BOSS, optionsDuBoss, type BossDuJour, type ReglageDuNiveau } from "../../../supabase/functions/code-discord/duel/contenu/index";
import { carte, choisir, hasardDeLaGraine, jouerUnDuel } from "../../../supabase/functions/code-discord/duel/index";
import type { Carte, Joueur } from "../../../supabase/functions/code-discord/duel/index";
import { GARDE_ROBES, mainAuHasard } from "./essai-duel";

/** Un joueur machine à ce réglage, avec ce hasard. */
export const joueurAuReglage = (r: ReglageDuNiveau, alea: () => number): Joueur => (moi, lui, m) => choisir(moi, lui, m, alea, r.fantaisie, r.loin);

/** 1 par victoire, une demie par égalité. */
const points = (v: number): number => (v > 0 ? 1 : v === 0 ? 0.5 : 0);

/** Les garde-robes où le joueur et la machine tirent leurs mains, tour à tour. */
export const GARDE_ROBES_DE_L_ESSAI = ["modeste", "aisee", "riche"] as const;

/**
 * La part de duels, sur 100, que gagne le joueur de bon sens contre la machine à ce réglage : `paires` paires de mains, tirées
 * tour à tour dans les garde-robes modeste, aisée et riche, chaque paire jouée des deux côtés.
 */
export function bonSensContreLaMachine(machine: ReglageDuNiveau, paires: number, graine = 2026): number {
  const tirage = hasardDeLaGraine(graine), jeu = hasardDeLaGraine(1122);
  const bon = joueurAuReglage(BON_SENS, jeu), lui = joueurAuReglage(machine, jeu);
  let g = 0;
  for (let i = 0; i < paires; i++) {
    const garde = GARDE_ROBES[GARDE_ROBES_DE_L_ESSAI[i % GARDE_ROBES_DE_L_ESSAI.length]!]!;
    const ma = mainAuHasard(garde, true, tirage), mb = mainAuHasard(garde, true, tirage);
    g += points(jouerUnDuel(ma, mb, bon, lui).verdict) + points(-jouerUnDuel(mb, ma, lui, bon).verdict);
  }
  return (100 * g) / (2 * paires);
}

/**
 * La part de duels, sur 100, que gagne le joueur de bon sens contre ce boss, joué par la machine au niveau des boss : `n`
 * duels, le joueur tirant sa main dans cette garde-robe, avec le lieu du boss.
 */
export function bonSensContreLeBoss(boss: BossDuJour, n: number, garde: (typeof GARDE_ROBES_DE_L_ESSAI)[number] = "aisee", graine = 31): number {
  const tirage = hasardDeLaGraine(graine), jeu = hasardDeLaGraine(57);
  const bon = joueurAuReglage(BON_SENS, jeu), machine = joueurAuReglage(NIVEAUX[NIVEAU_DES_BOSS], jeu);
  const mainDuBoss: Carte[] = boss.main.map(carte);
  let g = 0;
  for (let i = 0; i < n; i++) {
    const main = mainAuHasard(GARDE_ROBES[garde]!, true, tirage);
    g += points(jouerUnDuel(main, mainDuBoss, bon, machine, { lieu: boss.lieu.famille }, optionsDuBoss(boss)).verdict);
  }
  return (100 * g) / n;
}
