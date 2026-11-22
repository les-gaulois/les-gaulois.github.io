/**
 * Le jugement du tableau des duellistes sur les saisons simulées de `scripts/essai-tableau-duel.ts`
 * (`npx tsx scripts/essai-tableau-duel-juger.ts [dossier]`). Pour chaque semaine et chaque saison de chaque monde, avec la
 * vraie règle du tableau (`src/lib/village/tableau-duel.ts`) et, pour comparer, la simple part de victoires :
 * - le premier est-il l'un des plus forts, plus souvent qu'un Gaulois tiré au sort parmi les classés ?
 * - les tricheurs moyens (qui joue tout ce qu'il peut, qui n'attaque que les comptes faibles, qui a un ami qui perd exprès)
 *   passent-ils devant leur témoin, un Gaulois honnête de même force ? 50 sur 100 : ça ne leur sert à rien.
 * - à force égale, une garde-robe riche passe-t-elle devant une modeste ?
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TALENTS, type GauloisSimule } from "../src/lib/village/essai-tableau-duel";
import { REGLES_DU_TABLEAU, retenus, tableauDeLaSaison, tableauDeLaSemaine, type ResultatDuTableau } from "../src/lib/village/tableau-duel";

const DOSSIER = process.argv[2] ?? ".cache/essai-tableau-duel";
type G = Omit<GauloisSimule, "attaque" | "defense">;
type Monde = { gaulois: G[]; resultats: ResultatDuTableau[] };
/**
 * Les mondes, comme le serveur les compte : un forfait en salle (le complice de l'ami s'en va chaque jour) est une défaite
 * pour qui part et ne compte pas pour l'autre (`internal.duel_tableau_resultats`).
 */
const mondes: Monde[] = readdirSync(DOSSIER)
  .filter((f) => f.startsWith("monde-"))
  .map((f) => JSON.parse(readFileSync(join(DOSSIER, f), "utf8")) as Monde)
  .map((m) => {
    const ami = String(m.gaulois.find((g) => g.role === "ami")!.id), complice = m.gaulois.find((g) => g.role === "complice")!.id;
    return {
      ...m,
      resultats: m.resultats
        .filter((x) => !(x.type === "salle" && x.joueur === ami && x.adversaire === `membre:${complice}`))
        .map((x) => ({ ...x, semaine: x.semaine ?? Math.floor((x.jour as number) / 7) })),
    };
  });

/**
 * Le pire cas d'une entente : `k` amis forts (les plus forts des honnêtes) perdent exprès chacun deux matchs de salle par
 * semaine contre le témoin, au combat (le plus qu'un même adversaire compte dans une semaine), le reste du temps ils
 * jouent normalement.
 */
function avecAmisForts(m: Monde, k: number): Monde {
  const temoin = String(m.gaulois.find((g) => g.role === "temoin")!.id);
  const forts = m.gaulois.filter((g) => g.role === "honnete").sort((a, b) => b.talent - a.talent).slice(0, k).map((g) => String(g.id));
  const plus: ResultatDuTableau[] = [];
  let ordre = 1e9;
  for (let w = 0; w < 6; w++)
    for (const f of forts)
      for (const j of [7 * w + 5, 7 * w + 6]) {
        plus.push({ joueur: temoin, type: "salle", adversaire: `membre:${f}`, r: 1, jour: j, semaine: w, ordre });
        plus.push({ joueur: f, type: "salle", adversaire: `membre:${temoin}`, r: 0, jour: j, semaine: w, ordre: ordre++ });
      }
  return { ...m, resultats: [...m.resultats, ...plus] };
}
const FORCES = JSON.parse(readFileSync(join(DOSSIER, "forces.json"), "utf8")) as number[];
/** Les « plus forts » d'un tableau : à 3 points ou moins de la plus grande force (le fin et le druide se valent presque). */
const ECART_DES_FORTS = 3;

interface Compte {
  tableaux: number;
  premierFort: number;
  hasardFort: number;
  premierTop3: number;
  hasardTop3: number;
  classes: number;
  premier: Record<string, number>;
  /** Comparaisons avec le témoin : [devant lui, comparaisons]. */
  devant: Record<"volume" | "chasseur" | "ami", [number, number]>;
  /** Deux honnêtes de même force, l'un riche, l'autre modeste : [le riche devant, comparaisons]. */
  riche: [number, number];
}
const neuf = (): Compte => ({ tableaux: 0, premierFort: 0, hasardFort: 0, premierTop3: 0, hasardTop3: 0, classes: 0, premier: {}, devant: { volume: [0, 0], chasseur: [0, 0], ami: [0, 0] }, riche: [0, 0] });

function noter(c: Compte, t: { joueur: string }[], m: { gaulois: G[] }): void {
  if (t.length < 2) return;
  const g = (id: string) => m.gaulois[Number(id)]!;
  const fs = t.map((x) => FORCES[g(x.joueur).talent]!), max = Math.max(...fs), trois = [...fs].sort((a, b) => b - a)[Math.min(2, fs.length - 1)]!;
  c.tableaux++;
  c.classes += t.length;
  if (fs[0]! >= max - ECART_DES_FORTS) c.premierFort++;
  c.hasardFort += fs.filter((v) => v >= max - ECART_DES_FORTS).length / fs.length;
  if (fs[0]! >= trois) c.premierTop3++;
  c.hasardTop3 += fs.filter((v) => v >= trois).length / fs.length;
  const r0 = g(t[0]!.joueur).role;
  c.premier[r0] = (c.premier[r0] ?? 0) + 1;
  t.forEach((x, i) =>
    t.forEach((y, j) => {
      const a = g(x.joueur), b = g(y.joueur);
      if (a.role !== "honnete" || b.role !== "honnete" || a.talent !== b.talent || a.garde !== "riche" || b.garde !== "modeste") return;
      c.riche[0] += i < j ? 1 : 0;
      c.riche[1]++;
    }),
  );
  const place = new Map(t.map((x, i) => [g(x.joueur).role, i]));
  const tem = place.get("temoin");
  if (tem === undefined) return;
  for (const k of ["volume", "chasseur", "ami"] as const) {
    const p = place.get(k);
    if (p === undefined) continue;
    c.devant[k][0] += p < tem ? 1 : 0;
    c.devant[k][1]++;
  }
}

type Classement = (fenetre: ResultatDuTableau[], tous: ResultatDuTableau[]) => { joueur: string }[];

function juger(semaine: Classement, saison: Classement, lesMondes: readonly Monde[] = mondes): { sem: Compte; sai: Compte } {
  const sem = neuf(), sai = neuf();
  for (const m of lesMondes) {
    for (let w = 0; w < 6; w++) {
      const tous = m.resultats.filter((x) => (x.semaine as number) <= w);
      noter(sem, semaine(tous.filter((x) => x.semaine === w), tous), m);
    }
    noter(sai, saison(m.resultats, m.resultats), m);
  }
  return { sem, sai };
}

const sur100 = (a: number, b: number): number => Math.round((100 * a) / Math.max(1, b));
function imprimer(nom: string, { sem, sai }: { sem: Compte; sai: Compte }): void {
  console.log(`\n${nom}`);
  for (const [quand, c] of [["Semaine", sem], ["Saison", sai]] as const) {
    console.log(
      `  ${quand} (${c.tableaux} tableaux, ${(c.classes / c.tableaux).toFixed(1)} classés en moyenne) :\n` +
        `    le premier est l'un des plus forts ${sur100(c.premierFort, c.tableaux)} fois sur 100 (tiré au sort : ${sur100(c.hasardFort, c.tableaux)}) ;\n` +
        `    le premier est l'un des trois plus forts ${sur100(c.premierTop3, c.tableaux)} fois sur 100 (tiré au sort : ${sur100(c.hasardTop3, c.tableaux)}) ;\n` +
        `    devant son témoin honnête de même force (50 : rien n'y fait) : qui joue tout ce qu'il peut ${sur100(...c.devant.volume)}, qui n'attaque que les comptes faibles ${sur100(...c.devant.chasseur)}, qui a un ami qui perd exprès ${sur100(...c.devant.ami)} ;\n` +
        `    premier du tableau : le gros joueur ${sur100(c.premier.volume ?? 0, c.tableaux)}, le chasseur ${sur100(c.premier.chasseur ?? 0, c.tableaux)}, l'ami ${sur100(c.premier.ami ?? 0, c.tableaux)}, le témoin ${sur100(c.premier.temoin ?? 0, c.tableaux)} fois sur 100 ;\n` +
        `    à force égale, une garde-robe riche devant une modeste : ${sur100(...c.riche)} fois sur 100.`,
    );
  }
}

console.log(`${mondes.length} saisons simulées de six semaines, ${mondes.length * 6} semaines. Forces contre le guerrier : ${TALENTS.map((t, i) => `${t.nom} ${FORCES[i]!.toFixed(0)}`).join(", ")}.`);
const part = (minimum: number) => (fenetre: ResultatDuTableau[]) => {
  const par = new Map<string, number[]>();
  for (const x of retenus(fenetre)) (par.get(x.joueur) ?? par.set(x.joueur, []).get(x.joueur)!).push(x.r);
  return [...par].filter(([, l]) => l.length >= minimum).map(([joueur, l]) => ({ joueur, p: l.reduce((s, v) => s + v, 0) / l.length, n: l.length })).sort((a, b) => b.p - a.p || b.n - a.n);
};
imprimer("Pour comparer, la simple part de victoires (mêmes duels retenus) :", juger(part(REGLES_DU_TABLEAU.minimumSemaine), part(REGLES_DU_TABLEAU.minimumSaison)));
const semaine: Classement = (fenetre, tous) => tableauDeLaSemaine(retenus(fenetre), tous);
const saison: Classement = (fenetre, tous) => tableauDeLaSaison(retenus(fenetre), tous);
imprimer("Le tableau des duellistes (src/lib/village/tableau-duel.ts) :", juger(semaine, saison));
for (const k of [1, 3]) {
  const { sem, sai } = juger(semaine, saison, mondes.map((m) => avecAmisForts(m, k)));
  console.log(
    `
Avec ${k === 1 ? "un ami fort qui perd" : `${k} amis forts qui perdent`} exprès au combat deux fois par semaine, le témoin (un Gaulois moyen) finit premier ${sur100(sem.premier.temoin ?? 0, sem.tableaux)} semaines sur 100 et ${sur100(sai.premier.temoin ?? 0, sai.tableaux)} saisons sur 100.`,
  );
}
