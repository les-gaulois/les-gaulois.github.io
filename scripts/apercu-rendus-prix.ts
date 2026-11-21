/**
 * Aperçu des deux images du trop-payé rendu (src/lib/rendus-prix-image.ts), pour les regarder avant l'envoi :
 *   npx tsx scripts/apercu-rendus-prix.ts
 * Écrit quatre PNG dans test-results/rendus-prix/ (dossier ignoré par Git). N'envoie rien et ne lit aucun serveur.
 *
 * Tout ce qui suit est un EXEMPLE : des joueurs, des achats et des montants inventés pour l'aperçu seulement, jamais montrés
 * sur le site ni sur Discord. Les identifiants d'objets, eux, sont ceux des vraies listes, pour que leurs dessins paraissent.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { clan } from "../config/clan";
import { TENUE_DE_DEPART } from "../src/lib/gaulois";
import type { GenreRendu, LigneRendue, RenduDUnJoueur, RendusDesPrix } from "../src/lib/rendus-prix";
import { dessinerLePrive, dessinerLePublic, texteDuPrive, texteDuPublic } from "../src/lib/rendus-prix-image";

const DOSSIER = "test-results/rendus-prix";
const root = process.cwd();

/** Exemple : une ligne rendue. `dejaRendu` : ce qu'un booster avait déjà rendu de son prix. */
function exemple(genre: GenreRendu, objet: string | null, rarete: LigneRendue["rarete"], paye: number, nouveau: number, dejaRendu = 0): LigneRendue {
  // La formule du serveur (migration 20261121000600) : le trop-payé net d'un booster qui avait rendu une part.
  const rendu = dejaRendu > 0 ? Math.round(((paye - nouveau) * (paye - dejaRendu)) / paye) : paye - nouveau;
  return { genre, objet, rarete, paye, nouveau, dejaRendu, rendu };
}
const joueur = (n: number, nom: string, gaulois: RenduDUnJoueur["gaulois"], lignes: LigneRendue[]): RenduDUnJoueur => ({ n, discord: null, nom, total: lignes.reduce((s, l) => s + l.rendu, 0), gaulois, lignes });

/** Exemple : deux achats, un Gaulois devant sa bannière avec un familier. */
const COURT = joueur(
  1,
  "Exemple le Gaulois",
  { tenue: { ...TENUE_DE_DEPART, tete: "casque", haut: "cotte-mailles", arme: "epee" }, familier: "souris-des-greniers", banniere: "aube-de-la-bombe-h" },
  [exemple("banniere", "aube-de-la-bombe-h", "legendaire", 7500, 5000), exemple("pochette_familiers", "souris-des-greniers", null, 2000, 1000)],
);

/** Exemple : dix achats variés, dont des boosters qui avaient rendu une part de leur prix ; un Gaulois sans bannière. */
const LONG = joueur(
  2,
  "Exemple aux dix achats",
  { tenue: { ...TENUE_DE_DEPART, tete: "toque", haut: "maillot-clan", bas: "braies-cuir", pieds: "bottes-fer", arme: "hallebarde" }, familier: null, banniere: null },
  [
    exemple("modele", "dragon", "legendaire", 28000, 15000),
    exemple("banniere", "port-au-couchant", "peu-commun", 750, 500),
    exemple("pochette_modeles", null, null, 3000, 1600, 900),
    exemple("pochette_modeles", "lezard", null, 3000, 1600),
    exemple("carte", "champignon-atomique", "legendaire", 7500, 5000),
    exemple("cadre", "rubis", "epique", 1500, 1000),
    exemple("pochette_bannieres", null, null, 1500, 1000, 300),
    exemple("pochette_familiers", "poussin-jaune", null, 2000, 1000),
    exemple("banniere", "foret-doree", "commun", 300, 200),
    exemple("cadre", "soleil", "legendaire", 7500, 5000),
  ],
);

/** Exemple : douze joueurs remboursés (la somme s'écrit), puis trois (elle ne s'écrit pas). */
const PUBLIC: RendusDesPrix = { comptes: 12, total: 48500, le: "2026-11-21T20:00:00Z", jusquA: null, rendus: [COURT, LONG] };
const PUBLIC_PEU: RendusDesPrix = { comptes: 3, total: 9000, le: "2026-11-21T20:00:00Z", jusquA: null, rendus: [COURT] };

mkdirSync(DOSSIER, { recursive: true });
const images: readonly (readonly [string, () => Promise<{ png: Uint8Array; alt: string }>, string])[] = [
  ["public", () => dessinerLePublic(PUBLIC, clan.links.site, root), texteDuPublic(PUBLIC)],
  ["public-peu", () => dessinerLePublic(PUBLIC_PEU, clan.links.site, root), texteDuPublic(PUBLIC_PEU)],
  ["prive-court", () => dessinerLePrive(COURT, clan.links.site, root), texteDuPrive(COURT)],
  ["prive-long", () => dessinerLePrive(LONG, clan.links.site, root), texteDuPrive(LONG)],
];
for (const [nom, dessiner, texte] of images) {
  const { png, alt } = await dessiner();
  const chemin = join(DOSSIER, `${nom}.png`);
  writeFileSync(chemin, png);
  console.log(`\n${chemin} (exemple)\nDescription (${alt.length} signes) : ${alt}\nTexte de secours (${texte.length} signes) :\n${texte}`);
}
