/**
 * L'essai d'équilibre de « Coup pour coup », porté de `essai-regles.mjs` (maquette version 5 du duel, 22 novembre 2026) :
 * des mains tirées dans le catalogue par niveau de garde-robe, jouées par la machine, avec un hasard à graine pour que
 * l'essai rende toujours les mêmes chiffres. `tests/unit/duel-equilibre.test.ts` en garde les seuils ;
 * `npx tsx scripts/essai-duel.ts` l'imprime en entier.
 */
import { CATALOGUE_DU_DUEL, EMPLACEMENTS_DU_DUEL, NIVEAUX, P, carte, choisir, hasardDeLaGraine, jouerUnDuel, libres, panopliesDe, prixDeLaMain } from "../../../supabase/functions/code-discord/duel/index";
import type { Camp, Carte, EmplacementDuDuel, IdDePanoplie, Joueur, NiveauDeLaMachine, RareteDuDuel } from "../../../supabase/functions/code-discord/duel/index";

/** Les niveaux de garde-robe de l'essai : les raretés où l'on pioche. */
export const GARDE_ROBES: Readonly<Record<string, readonly RareteDuDuel[]>> = {
  base: ["base"],
  communs: ["base", "commun"],
  modeste: ["base", "commun", "peu-commun"],
  aisee: ["commun", "peu-commun", "epique"],
  riche: ["commun", "peu-commun", "epique", "mystique", "legendaire"],
  divine: ["base", "commun", "peu-commun", "epique", "mystique", "legendaire", "divin"],
};

/** Un hasard à graine pour l'essai : celui de la machine (`hasardDeLaGraine`, Park et Miller). */
export const hasardDEssai = (graine = 12345): (() => number) => hasardDeLaGraine(graine);

const PAR_EMPLACEMENT: Readonly<Record<EmplacementDuDuel, readonly string[]>> = (() => {
  const l = Object.fromEntries(EMPLACEMENTS_DU_DUEL.map((e) => [e, [] as string[]])) as Record<EmplacementDuDuel, string[]>;
  for (const [id, f] of Object.entries(CATALOGUE_DU_DUEL)) l[f.e].push(id);
  return l;
})();

/** Une main légale au hasard dans les raretés permises ; `plein` : elle dépense presque toute la bourse. */
export function mainAuHasard(raretes: readonly RareteDuDuel[], plein: boolean, alea: () => number): Carte[] {
  for (let essai = 0; essai < 400; essai++) {
    const m = EMPLACEMENTS_DU_DUEL.map((e) => {
      const l = PAR_EMPLACEMENT[e].filter((id) => raretes.includes(CATALOGUE_DU_DUEL[id]!.r));
      return carte(l[Math.floor(alea() * l.length)]!);
    });
    const p = prixDeLaMain(m);
    if (p <= P.BOURSE && (!plein || p >= P.BOURSE - 2 || essai > 300)) return m;
  }
  throw new Error("pas de main");
}

/** Un joueur qui pose au hasard une carte libre. */
export const joueurAuHasard = (alea: () => number): Joueur => (moi: Camp) => {
  const l = libres(moi);
  return l[Math.floor(alea() * l.length)]!;
};

/** La machine à un niveau, avec ce hasard. */
export const joueurMachine = (niveau: NiveauDeLaMachine, alea: () => number): Joueur => (moi, lui, m) => choisir(moi, lui, m, alea, NIVEAUX[niveau].fantaisie, NIVEAUX[niveau].loin);

/** La part de points d'un camp sur une série : 1 par victoire, une demie par égalité. */
const points = (v: number): number => (v > 0 ? 1 : v === 0 ? 0.5 : 0);

export interface Releve {
  duels: number;
  manches: number;
  pire: number;
  egalites: number;
  /** La part de victoires de la ligne contre la colonne, en pour cent, par garde-robe. */
  table: Record<string, Record<string, number>>;
  /** La part de victoires des mains qui réunissent chaque panoplie. */
  panoplies: Partial<Record<IdDePanoplie, { part: number; n: number }>>;
}

/**
 * L'essai de la maquette : `n` duels pour chaque paire de garde-robes (la machine au `niveau` joue les deux camps), puis
 * les panoplies rencontrées.
 */
export function essaiDEquilibre(n: number, niveau: NiveauDeLaMachine, graine = 12345): Releve {
  const alea = hasardDEssai(graine), machine = joueurMachine(niveau, alea);
  const noms = Object.keys(GARDE_ROBES), table: Record<string, Record<string, number>> = {};
  let duels = 0, manches = 0, pire = 0, egalites = 0;
  const pan: Partial<Record<IdDePanoplie, [number, number]>> = {};
  for (const na of noms) {
    table[na] = {};
    for (const nb of noms) {
      let g = 0;
      for (let i = 0; i < n; i++) {
        const ma = mainAuHasard(GARDE_ROBES[na]!, na !== "base", alea), mb = mainAuHasard(GARDE_ROBES[nb]!, nb !== "base", alea);
        const d = jouerUnDuel(ma, mb, machine, machine);
        g += points(d.verdict);
        duels++;
        manches += d.manches;
        pire = Math.max(pire, d.manches);
        if (d.verdict === 0) egalites++;
        for (const [main, v] of [[ma, d.verdict], [mb, -d.verdict]] as const) {
          for (const k of panopliesDe(main)) {
            const s = (pan[k] ??= [0, 0]);
            s[0] += points(v);
            s[1]++;
          }
        }
      }
      table[na]![nb] = Math.round((100 * g) / n);
    }
  }
  const panoplies: Releve["panoplies"] = {};
  for (const [k, s] of Object.entries(pan) as [IdDePanoplie, [number, number]][]) panoplies[k] = { part: Math.round((100 * s[0]) / s[1]), n: s[1] };
  return { duels, manches, pire, egalites, table, panoplies };
}

/** La part de victoires d'un joueur contre un autre, la même main des deux côtés, en pour cent. */
export function partContre(n: number, a: (alea: () => number) => Joueur, b: (alea: () => number) => Joueur, graine = 777, garde = GARDE_ROBES.riche!): number {
  const alea = hasardDEssai(graine), ja = a(alea), jb = b(alea);
  let g = 0;
  for (let i = 0; i < n; i++) {
    const m = mainAuHasard(garde, true, alea);
    // les deux sens, pour que celui qui choisit en second n'ait pas d'avantage
    g += points(jouerUnDuel(m, m, ja, jb).verdict) + (1 - points(jouerUnDuel(m, m, jb, ja).verdict));
  }
  return Math.round((100 * g) / (2 * n));
}
