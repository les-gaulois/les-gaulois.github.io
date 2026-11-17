/**
 * Essai, hors du site (`npx tsx scripts/essai-utilite.ts <dossier vide> 120`) : le score d'utilité dit-il autre chose qu'un tirage au sort ? Lit la fiche publique des dernières
 * parties du clan (comme le robot le fait chaque heure), calcule l'utilité sans le soutien (les dons demandent le rejeu),
 * et compare, pour les membres qui ont assez de parties, leur moyenne sur une moitié des parties à leur moyenne sur
 * l'autre. Puis refait la même mesure en redistribuant au hasard les scores entre les Gaulois de chaque partie.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadMembers, loadSessions } from "../src/lib/data";
import { scoresDuBilan, statsDuJoueur, type GauloisDuBilan } from "../src/lib/rejeu/bilan";

const DOSSIER = process.argv[2]!;
const COMBIEN = Number(process.argv[3] ?? 80);
mkdirSync(DOSSIER, { recursive: true });
const sessions = [...new Map(loadSessions().map((s) => [s.gameId, s])).values()].sort((a, b) => (a.gameStart < b.gameStart ? 1 : -1)).slice(0, COMBIEN);

const parties: { id: string; joueurs: { id: string; g: GauloisDuBilan }[] }[] = [];
for (const s of sessions) {
  const fichier = join(DOSSIER, `${s.gameId}.json`);
  if (!existsSync(fichier)) {
    const r = await fetch(`https://api.openfront.io/public/game/${s.gameId}`);
    if (!r.ok) continue;
    writeFileSync(fichier, await r.text());
    await new Promise((ok) => setTimeout(ok, 400));
  }
  const fiche = JSON.parse(readFileSync(fichier, "utf8")) as { info?: { players?: { publicID?: string; clanTag?: string; stats?: unknown }[] } };
  const gaulois = (fiche.info?.players ?? []).filter((p) => p.clanTag === "GAL" && p.publicID && p.stats);
  if (gaulois.length < 2) continue;
  parties.push({ id: s.gameId, joueurs: gaulois.map((p) => ({ id: p.publicID!, g: { nom: p.publicID!, enPartie: false, ...statsDuJoueur(p.stats), troupesDonnees: 0, orDonne: 0 } })) });
}

const correlation = (x: number[], y: number[]) => {
  const n = x.length;
  const mx = x.reduce((t, v) => t + v, 0) / n;
  const my = y.reduce((t, v) => t + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i]! - mx) * (y[i]! - my);
    sxx += (x[i]! - mx) ** 2;
    syy += (y[i]! - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
};

/** La corrélation entre la moyenne des parties paires et celle des impaires, pour les joueurs qui en ont `min` de chaque. */
function moitieContreMoitie(scores: { id: string; u: number }[][], min: number) {
  const pair = new Map<string, number[]>();
  const impair = new Map<string, number[]>();
  scores.forEach((partie, k) => {
    for (const { id, u } of partie) (k % 2 === 0 ? pair : impair).set(id, [...((k % 2 === 0 ? pair : impair).get(id) ?? []), u]);
  });
  const x: number[] = [];
  const y: number[] = [];
  for (const [id, a] of pair) {
    const b = impair.get(id);
    if (!b || a.length < min || b.length < min) continue;
    x.push(a.reduce((t, v) => t + v, 0) / a.length);
    y.push(b.reduce((t, v) => t + v, 0) / b.length);
  }
  return { joueurs: x.length, r: correlation(x, y) };
}

const vrais = parties.map((p) => {
  const s = scoresDuBilan(p.joueurs.map((j) => j.g));
  return p.joueurs.flatMap((j, i) => (s[i]!.utilite === null ? [] : [{ id: j.id, u: s[i]!.utilite! }]));
});
const pseudos = new Map((loadMembers()?.members ?? []).filter((m) => m.publicId && m.username).map((m) => [m.publicId!, m.username!]));
console.log(`${parties.length} parties à deux Gaulois au moins, ${new Set(vrais.flat().map((v) => v.id)).size} joueurs.`);
for (const min of [2, 3, 4]) {
  const reel = moitieContreMoitie(vrais, min);
  const hasard: number[] = [];
  for (let essai = 0; essai < 2000; essai++) {
    const melange = vrais.map((partie) => {
      const u = partie.map((v) => v.u);
      for (let i = u.length - 1; i > 0; i--) {
        const k = Math.floor(Math.random() * (i + 1));
        [u[i], u[k]] = [u[k]!, u[i]!];
      }
      return partie.map((v, i) => ({ id: v.id, u: u[i]! }));
    });
    hasard.push(moitieContreMoitie(melange, min).r);
  }
  hasard.sort((a, b) => a - b);
  const auDessus = hasard.filter((h) => h >= reel.r).length;
  console.log(`au moins ${min} parties par moitié : ${reel.joueurs} joueurs, corrélation ${reel.r.toFixed(2)} ; au hasard : médiane ${hasard[1000]!.toFixed(2)}, 95e centile ${hasard[1900]!.toFixed(2)} ; ${auDessus} tirages sur 2000 font aussi bien.`);
}
const cumul = new Map<string, number[]>();
for (const partie of vrais) for (const { id, u } of partie) cumul.set(id, [...(cumul.get(id) ?? []), u]);
const classement = [...cumul].filter(([, v]) => v.length >= 5).map(([id, v]) => ({ nom: pseudos.get(id) ?? "(anonyme)", parties: v.length, utilite: Math.round(v.reduce((t, x) => t + x, 0) / v.length) })).sort((a, b) => b.utilite - a.utilite);
console.log(`${classement.length} joueurs à 5 parties au moins ; les extrêmes :`, classement.slice(0, 5), classement.slice(-3));
