/**
 * L'essai contre le hasard du tableau des duellistes, en entier (`npx tsx scripts/essai-tableau-duel.ts [mondes] [dossier]`) :
 * joue `mondes` saisons simulées (`src/lib/village/essai-tableau-duel.ts`), garde leurs relevés dans `dossier` (par défaut
 * `.cache/essai-tableau-duel/`, hors de Git) et imprime la force de chaque talent. Le jugement des façons de classer se lit
 * ensuite dans ces relevés (`scripts/essai-tableau-duel-juger.ts`).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TALENTS, creerMonde, forcesDesTalents, jouerLaSaison } from "../src/lib/village/essai-tableau-duel";

const MONDES = Number(process.argv[2] ?? 60);
const DOSSIER = process.argv[3] ?? ".cache/essai-tableau-duel";
mkdirSync(DOSSIER, { recursive: true });

if (!existsSync(join(DOSSIER, "forces.json"))) {
  const t0 = Date.now();
  const forces = forcesDesTalents(150);
  writeFileSync(join(DOSSIER, "forces.json"), JSON.stringify(forces));
  console.log("Forces contre le guerrier :", TALENTS.map((t, i) => `${t.nom} ${forces[i]!.toFixed(1)}`).join(", "), `(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
for (let k = 0; k < MONDES; k++) {
  const f = join(DOSSIER, `monde-${k}.json`);
  if (existsSync(f)) continue;
  const t0 = Date.now();
  const gaulois = creerMonde(1000 + k * 7919);
  const resultats = jouerLaSaison(gaulois, 5000 + k * 104729);
  writeFileSync(f, JSON.stringify({ gaulois: gaulois.map((g) => Object.fromEntries(Object.entries(g).filter(([k]) => k !== "attaque" && k !== "defense"))), resultats }));
  console.log(`monde ${k} : ${resultats.length} résultats, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
