// Aides communes aux tests du site, sorties de site.spec.ts le 26 novembre 2026 quand il a été découpé par domaine.
// `PAGES` est la liste des pages contrôlées : une nouvelle page s'y ajoute (skill `nouvelle-page`).
import { readFileSync } from "node:fs";
import { type Page } from "@playwright/test";
import { clan } from "../../config/clan";
import { loadRivals } from "../../src/lib/data";
import type { LeaderboardEntry } from "../../src/lib/schemas";
import { tagsInRace } from "../../src/lib/compare";
import { rivalSeries } from "../../src/lib/rivals";

export const PAGES = ["/", "/gazette", "/parties", "/revoir", "/nouveautes", "/classement", "/rivaux", "/progression", "/records", "/utiles", "/membres", "/liste", "/village", "/qg", "/carte", "/activite", "/debuter", "/rejoindre", "/mentions-legales"];
export const lb = JSON.parse(readFileSync("data/leaderboard.json", "utf8"));
export const members = JSON.parse(readFileSync("data/members.json", "utf8"));
export const gal = lb.clans.find((c: { clanTag: string }) => c.clanTag === "GAL");
export const digits = (s: string | null) => (s ?? "").replace(/\D/g, "");

/** Ouvre tout ce qui est replié : ce contenu doit tenir les mêmes garanties que le reste. */
export const openFolds = (page: Page) =>
  page.evaluate(() => {
    for (const fold of document.querySelectorAll("details")) fold.open = true;
  });

/** Attend que les composants interactifs de la page aient démarré. */
export const hydrated = (page: Page) => page.waitForFunction(() => !document.querySelector("astro-island[ssr]"));

/** Le lien que le doigt touche en un point d'un élément : celui du dessus, comme un vrai toucher. */
export const linkAt = async (page: Page, x: number, y: number) =>
  page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.closest("a")?.getAttribute("href") ?? null, [x, y]);

/** Les clans dont « La course avec nos voisins » écrit déjà l'écart, comme la page les calcule. */
export const raceTags = () => tagsInRace(rivalSeries(lb.clans as LeaderboardEntry[], loadRivals(), clan.tag));
/** Le texte, espaces insécables comprises, ramené à des espaces simples. */
export const plain = (s: string) => s.replace(/\s+/g, " ");
export const occurrences = (text: string, part: string) => plain(text).split(plain(part)).length - 1;
