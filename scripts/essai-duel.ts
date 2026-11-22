/**
 * L'essai d'équilibre de « Coup pour coup », imprimé en entier (`src/lib/village/essai-duel.ts`) : la table des garde-robes,
 * les panoplies, et les niveaux de la machine entre eux et contre le hasard. Rien n'est écrit ni envoyé.
 *
 * Usage : `npx tsx scripts/essai-duel.ts [duels par paire] [niveau]` (par défaut 40 et « guerrier »).
 */
import { NIVEAUX_DE_LA_MACHINE, estUnNiveau } from "../supabase/functions/code-discord/duel/index.ts";
import { essaiDEquilibre, joueurAuHasard, joueurMachine, partContre } from "../src/lib/village/essai-duel.ts";

const n = Number(process.argv[2] ?? 40), niveau = process.argv[3] ?? "guerrier";
if (!estUnNiveau(niveau)) throw new Error("niveau inconnu : " + niveau);
const debut = Date.now(), r = essaiDEquilibre(n, niveau);
console.log(`garde-robes contre garde-robes, machine « ${niveau} » des deux côtés, ${n} duels par paire (part de victoires de la ligne) :`);
const noms = Object.keys(r.table);
console.log("".padEnd(10) + noms.map((x) => x.padStart(9)).join(""));
for (const a of noms) console.log(a.padEnd(10) + noms.map((b) => String(r.table[a]![b]).padStart(9)).join(""));
console.log(`manches par duel : ${(r.manches / r.duels).toFixed(1)} en moyenne, ${r.pire} au plus ; égalités ${Math.round((100 * r.egalites) / r.duels)} %`);
console.log("panoplies :", Object.entries(r.panoplies).sort((a, b) => b[1]!.part - a[1]!.part).map(([k, s]) => `${k} ${s!.part} (${s!.n})`).join(", "));
for (const x of NIVEAUX_DE_LA_MACHINE) console.log(`${x} contre le hasard : ${partContre(n, (h) => joueurMachine(x, h), joueurAuHasard)} %`);
console.log(`guerrier contre apprenti : ${partContre(n, (h) => joueurMachine("guerrier", h), (h) => joueurMachine("apprenti", h))} %`);
console.log(`druide contre guerrier : ${partContre(n, (h) => joueurMachine("druide", h), (h) => joueurMachine("guerrier", h))} %`);
console.log(`(${((Date.now() - debut) / 1000).toFixed(1)} s)`);
