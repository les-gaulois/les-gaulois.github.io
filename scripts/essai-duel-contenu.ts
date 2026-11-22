/**
 * La mesure complète du contenu du duel « Coup pour coup » (`src/lib/village/essai-duel-contenu.ts`) : le joueur de bon sens
 * contre les trois niveaux de la machine, puis contre chaque boss du jour, à côté des cibles. Rien n'est écrit ni envoyé.
 *
 * Usage : `npx tsx scripts/essai-duel-contenu.ts [paires des niveaux] [duels par boss]` (par défaut 600 et 600).
 */
import { BOSS, CIBLES_DES_BOSS, CIBLES_DES_NIVEAUX, NIVEAUX, NIVEAUX_DE_LA_MACHINE } from "../supabase/functions/code-discord/duel/contenu/index.ts";
import { RARETES_DES_MODELES } from "../supabase/functions/code-discord/modeles/index.ts";
import { GARDE_ROBES_DE_L_ESSAI, bonSensContreLaMachine, bonSensContreLeBoss } from "../src/lib/village/essai-duel-contenu.ts";

const paires = Number(process.argv[2] ?? 600), duels = Number(process.argv[3] ?? 600);
const debut = Date.now();
const r = (x: number): string => x.toFixed(1).padStart(5);
console.log(`Le joueur de bon sens contre la machine, ${paires} paires de mains jouées des deux côtés, deux graines (part sur 100) :`);
for (const n of NIVEAUX_DE_LA_MACHINE) {
  const a = bonSensContreLaMachine(NIVEAUX[n], paires, 2026), b = bonSensContreLaMachine(NIVEAUX[n], paires, 77);
  console.log(`  ${n.padEnd(9)} ${r(a)} ${r(b)}   cible ${CIBLES_DES_NIVEAUX[n]}`);
}
console.log(`Le joueur de bon sens contre chaque boss, ${duels} duels par garde-robe (part sur 100) :`);
for (const b of BOSS) {
  const rarete = RARETES_DES_MODELES[b.id] ?? "commun";
  const parts = GARDE_ROBES_DE_L_ESSAI.map((g) => `${g} ${r(bonSensContreLeBoss(b, duels, g))}`).join(" · ");
  console.log(`  ${b.id.padEnd(10)} ${rarete.padEnd(11)} cible ${CIBLES_DES_BOSS[rarete]} | ${parts}`);
}
console.log(`(${((Date.now() - debut) / 1000).toFixed(1)} s)`);
