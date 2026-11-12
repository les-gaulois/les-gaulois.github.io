import { existsSync, readdirSync, readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { clan } from "../../config/clan";
import { accueilFacts, accueilImageAlt, accueilRanking } from "../../src/lib/accueil-image";
import { GazetteFonts } from "../../src/lib/gazette-image";
import { worldTerritory } from "../../src/lib/carte-monde";
import { loadClanMapFilm, loadTerritoryReadings, loadGames, loadHistory, loadMemberGames, loadMemberResults, loadMembers, loadMemberWeeks, loadMeta, loadNouveautes, loadSessions } from "../../src/lib/data";
import { fmtCount, fmtGap, fmtInt, fmtRank, fmtScore } from "../../src/lib/format";
import type { LeaderboardEntry } from "../../src/lib/schemas";
import { withOfficialRanks } from "../../src/lib/stats";
import { firstRival } from "../../src/lib/compare";
import { faceOffs } from "../../src/lib/games";
import { editionLead, GAZETTE_RECENT_EDITIONS, gazetteEditions, playersPeriod, rankWords, standingDetails, territoryDetails, weekLabel } from "../../src/lib/gazette";
import { bestGameOf, bestGameSentence, yesterdayOf } from "../../src/lib/belle-partie";
import { clanJournal, JOURNAL_FIRST_ROWS, journalChoices, journalCount, NO_FILTER, replayUrl } from "../../src/lib/journal";
import { recentRecordKeys, weekRecordKeys } from "../../src/lib/records-battus";
import { playerPodiums, podiumDates } from "../../src/lib/podiums";
import { playerRecords } from "../../src/lib/records-joueurs";
import { clanRecords } from "../../src/lib/results";
import { currentWeek, currentWeekComparison, currentWeekLead } from "../../src/lib/semaine";
import { gamesOf, placeOf, recentGamesTitle } from "../../src/lib/members";
import { mapLabel } from "../../src/lib/map-names";
import { meVisitLines } from "../../src/lib/moi-visite";
import { SECTIONS } from "../../src/lib/nav";
import { latestNews, newsDays, newsMarker, NOUVEAUTES_KEY, splitDays } from "../../src/lib/nouveautes";
import { nextTier, tierOf, tierRows } from "../../src/lib/paliers";
import { currentMilestonesPeriod, homeMilestones, recentRecordLines, recentTerritoryRecord } from "../../src/lib/vie-du-clan";
import { milestonesSinceMonday } from "../../src/lib/week-players";

const PAGES = ["/", "/gazette", "/parties", "/nouveautes", "/classement", "/rivaux", "/progression", "/records", "/membres", "/liste", "/qg", "/carte", "/activite", "/debuter", "/outils", "/rejoindre", "/mentions-legales"];
const lb = JSON.parse(readFileSync("data/leaderboard.json", "utf8"));
const members = JSON.parse(readFileSync("data/members.json", "utf8"));
const gal = lb.clans.find((c: { clanTag: string }) => c.clanTag === "GAL");
const digits = (s: string | null) => (s ?? "").replace(/\D/g, "");

/** Ouvre tout ce qui est replié : ce contenu doit tenir les mêmes garanties que le reste. */
const openFolds = (page: Page) =>
  page.evaluate(() => {
    for (const fold of document.querySelectorAll("details")) fold.open = true;
  });

/** Attend que les composants interactifs de la page aient démarré. */
const hydrated = (page: Page) => page.waitForFunction(() => !document.querySelector("astro-island[ssr]"));

test("sans serveur configuré, la connexion n'apparaît pas et le site reste statique", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("supabase") || r.url().includes("/rest/v1/")) calls.push(r.url());
  });
  await page.goto("/");
  await expect(page.getByTestId("auth-sign-in")).toHaveCount(0);
  // Sans serveur, pas de face privée : l'accueil n'en montre pas la porte.
  await expect(page.getByTestId("home-qg")).toHaveCount(0);
  for (const path of ["/compte", "/direction", "/qg"]) {
    await page.goto(path);
    await expect(page.getByTestId("auth-not-open")).toBeVisible();
  }
  expect(calls).toEqual([]);
});

// L'administration est dans la Direction depuis le 12 novembre 2026 (au QG du 10 au 12) : ses anciennes adresses y mènent,
// avec la suite de l'adresse (le code d'un retour de Discord, un onglet). Les autres onglets du QG restent au QG.
test("les anciennes adresses de l'administration mènent à la Direction", async ({ page }) => {
  const atDirection = (search: string, hash: string) => (url: URL) => /^\/direction\/?$/.test(url.pathname) && url.search === search && url.hash === hash;
  await page.goto("/admin");
  await page.waitForURL(atDirection("", "#demandes"));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Direction");
  await page.goto("/admin?code=essai#comptes");
  await page.waitForURL(atDirection("?code=essai", "#comptes"));
  for (const hash of ["#demandes", "#comptes", "#journal"]) {
    await page.goto(`/qg?code=essai${hash}`);
    await page.waitForURL(atDirection("?code=essai", hash));
  }
  await page.goto("/qg#salons");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Le QG");
  expect(new URL(page.url()).hash).toBe("#salons");
  // Page déjà ouverte, seule l'ancre change : le navigateur ne recharge pas la page, le renvoi a lieu quand même.
  await page.goto("/qg#comptes");
  await page.waitForURL(atDirection("", "#comptes"));
});

// Les faces privées : les pages publiées ne contiennent que la porte. Leur contenu vient du serveur, pour un membre validé
// au QG, pour l'encadrement à la Direction, qui a aussi l'administration.
test("le QG et la Direction ne sont pas indexés, et leur page ne contient rien de privé", async ({ page }) => {
  await page.goto("/qg");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Le QG");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  for (const id of ["qg", "qg-salons", "qg-decisions", "qg-ideas", "qg-wall", "qg-events"]) await expect(page.getByTestId(id)).toHaveCount(0);
  await page.goto("/direction");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Direction");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  for (const id of ["direction", "admin-requests", "admin-members", "admin-log"]) await expect(page.getByTestId(id)).toHaveCount(0);
});

// L'encadrement sait d'un coup d'œil où il est. Le compte d'un membre reste bleu, comme le reste du site, et le QG aussi,
// dans l'ambiance console de la Direction.
test("seules les pages de l'encadrement passent au rouge", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Même thème sur mobile.");
  const look = async (path: string) => {
    await page.goto(path);
    return page.evaluate(() => ({
      theme: document.documentElement.dataset.theme ?? null,
      ambiance: document.documentElement.dataset.ambiance ?? null,
      style: document.documentElement.dataset.console ?? null,
      background: getComputedStyle(document.body).backgroundColor,
      bar: document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? "",
    }));
  };
  // La barre du navigateur, sur téléphone, prend le fond de la page.
  const rgbOf = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
  const blue = await look("/");
  expect(blue.theme).toBeNull();
  expect(blue.ambiance).toBeNull();
  expect(blue.style).toBeNull();
  expect(blue.background).toBe(rgbOf(blue.bar));
  const red = await look("/direction");
  expect(red.theme).toBe("rouge");
  // La Direction a en plus l'ambiance console (docs/DESIGN.md), dans son seul style, Terminal : son fond est le jeton
  // navy de ce style, que la barre du navigateur reprend.
  expect(red.ambiance).toBe("console");
  expect(red.style).toBe("terminal");
  expect(red.background).not.toBe(blue.background);
  expect(red.background).toBe(rgbOf(red.bar));
  // Le QG prend la même console depuis le 12 novembre 2026, sans le rouge : le Terminal bleu des membres.
  const qg = await look("/qg");
  expect(qg.theme).toBeNull();
  expect(qg.ambiance).toBe("console");
  expect(qg.style).toBe("terminal");
  expect(qg.background).not.toBe(blue.background);
  expect(qg.background).not.toBe(red.background);
  expect(qg.background).toBe(rgbOf(qg.bar));
  for (const path of [...PAGES.filter((path) => path !== "/qg"), "/compte", "/confidentialite"]) {
    expect(await look(path), path).toEqual(blue);
  }
});

// Le poste de commandement (docs/DESIGN.md) : depuis le 12 novembre 2026, la chasse fixe de la console est préchargée sur
// toutes les pages, chacune a son invite décorative, et une lumière passe une fois sur le titre. La Direction et le QG
// gardent leur console. La pause comme « réduire les animations » arrêtent l'invite, la lumière du titre, la chute du
// guerrier de l'accueil et la bande de la console, portée par <html> lui-même, que `.fx-off *` ne vise pas.
test("l'invite et la console sont décoratives, et la pause arrête leurs animations", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Même rendu sur mobile.");
  const fonts: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("jetbrains-mono")) fonts.push(new URL(r.url()).pathname);
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(fonts.length).toBeGreaterThan(0);
  await expect(page.locator(".invite")).toHaveAttribute("aria-hidden", "true");
  // Le guerrier de l'accueil tombe en colonnes à l'ouverture : la pause et « réduire les animations » l'arrêtent aussi.
  const falling = () => page.evaluate(() => getComputedStyle(document.querySelector(".holo-logo .console-goutte")!).animationName);
  expect(await falling()).toBe("console-goutte");
  // Une page de lecture : la rubrique en dossier, la page en commande, et la lumière du titre.
  await page.goto("/classement");
  await expect(page.locator(".invite")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".invite")).toHaveText(/^gal@clan:~\/resultats\$\s\.\/classement$/);
  const reading = () =>
    page.evaluate(() => ({
      light: getComputedStyle(document.querySelector("h1")!, "::after").animationName,
      prompt: getComputedStyle(document.querySelector(".invite")!).animationName,
    }));
  expect(await reading()).toEqual({ light: "titre-lecture", prompt: "console-frappe" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  expect(await reading()).toEqual({ light: "none", prompt: "none" });
  await page.goto("/");
  expect(await falling()).toBe("none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => localStorage.setItem("gal-fx", "off"));
  await page.reload();
  expect(await falling()).toBe("none");
  await page.goto("/classement");
  expect(await reading()).toEqual({ light: "none", prompt: "none" });
  await page.evaluate(() => localStorage.removeItem("gal-fx"));
  await page.goto("/qg");
  await page.waitForLoadState("networkidle");
  // La console a sa propre invite : celle du site ne s'y ajoute pas.
  await expect(page.locator(".invite")).toHaveCount(0);
  await expect(page.locator(".console-invite")).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Le QG");
  await page.goto("/direction");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".console-invite")).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Direction");
  const moving = () =>
    page.evaluate(() => ({
      band: getComputedStyle(document.documentElement, "::after").animationName,
      prompt: getComputedStyle(document.querySelector(".console-invite")!).animationName,
    }));
  expect(await moving()).toEqual({ band: "console-balayage", prompt: "console-frappe" });
  // « Réduire les animations » du système : la règle globale vise aussi <html>.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  expect(await moving()).toEqual({ band: "none", prompt: "none" });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => localStorage.setItem("gal-fx", "off"));
  await page.reload();
  expect(await moving()).toEqual({ band: "none", prompt: "none" });
});

// L'onciale de cases (docs/DESIGN.md, « Typographie ») : depuis le 12 novembre 2026, les titres et les gros chiffres des
// pages ouvertes à tous, les grands titres et les chiffres clés en cases visibles, choisies par le pilote. Le pied de page
// garde ses titres en chasse fixe, et le QG et la Direction gardent Outfit : ils ne chargent pas l'onciale.
test("l'onciale de cases écrit les titres des pages ouvertes à tous, pas ceux du QG ni de la Direction", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Même rendu sur mobile.");
  const polices: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/generated/polices/")) polices.push(new URL(r.url()).pathname);
  });
  const familles = () =>
    page.evaluate(() => {
      const premiere = (selecteur: string) => {
        const el = document.querySelector(selecteur);
        return el ? (getComputedStyle(el).fontFamily.split(",")[0] ?? "").replace(/"/g, "").trim() : null;
      };
      const chargees = [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, ""));
      return { titre: premiere("main h1"), chiffre: premiere(".kpi-value"), pied: premiere("footer h2"), chargees };
    });
  await page.goto("/classement");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  // Toutes les pages sauf le QG et la Direction, même une page en ambiance console : c'est data-lettres qui décide.
  await expect(page.locator("html")).toHaveAttribute("data-lettres", "onciale");
  const publique = await familles();
  expect({ titre: publique.titre, chiffre: publique.chiffre, pied: publique.pied }).toEqual({ titre: "GAL Onciale Cases", chiffre: "GAL Onciale Cases", pied: "JetBrains Mono Variable" });
  expect(publique.chargees).toContain("GAL Onciale Cases");
  expect(polices.some((p) => p.endsWith("/onciale-cases.woff2"))).toBe(true);
  // Les petits titres de l'accueil, en cases pleines.
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => getComputedStyle(document.querySelector("main h3")!).fontFamily)).toMatch(/^"GAL Onciale",/);
  polices.length = 0;
  for (const path of ["/qg", "/direction"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html"), path).not.toHaveAttribute("data-lettres", /.*/);
    expect((await familles()).titre, path).toBe("Outfit Variable");
  }
  expect(polices).toEqual([]);
});

// L'onciale est plus large qu'Outfit : sur un téléphone de 360 px, chaque titre de page prend la taille qui laisse son plus
// long mot sur une ligne (--mot-em, PageHeader.astro), au lieu de le couper en deux.
test("à 360 px, aucun titre de page ne coupe un mot en deux", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Largeur testée une seule fois.");
  await page.setViewportSize({ width: 360, height: 800 });
  for (const path of [...PAGES.filter((path) => path !== "/qg"), "/confidentialite", "/compte"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    const coupes = await page.evaluate(() => {
      const out: string[] = [];
      for (const h1 of document.querySelectorAll("main h1")) {
        const marche = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
        for (let n = marche.nextNode(); n; n = marche.nextNode()) {
          for (const mot of (n.textContent ?? "").matchAll(/[^ \t\r\n]+/g)) {
            const r = document.createRange();
            r.setStart(n, mot.index ?? 0);
            r.setEnd(n, (mot.index ?? 0) + mot[0].length);
            const lignes = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top)));
            if (lignes.size > 1) out.push(mot[0]);
          }
        }
      }
      return out;
    });
    expect(coupes, path).toEqual([]);
  }
});

test("parcours principal", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile";
  const apiCalls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("api.openfront.io")) apiCalls.push(r.url());
  });

  // Accueil : les cartes affichent les valeurs collectées.
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Aller sur le Discord" })).toHaveAttribute("href", "https://discord.gg/cjUc42T7Y2");
  // L'accueil parle d'abord aux membres : l'appel à rejoindre le clan n'est qu'en bas de page.
  // (Le menu et le pied de page gardent leur rubrique « Rejoindre » : seul le contenu de l'accueil compte ici.)
  await expect(page.locator("main").getByRole("link", { name: /^Rejoindre/ })).toHaveCount(0);
  await expect(page.locator("main section").last()).toContainText("Rejoignez les Gaulois");
  await expect(page.getByRole("link", { name: "Jouer à OpenFront" }).first()).toBeVisible();
  const cards = page.getByTestId("stat-card");
  await expect(cards).toHaveCount(5);
  await expect(async () => {
    expect(digits(await cards.nth(2).locator("[data-count]").textContent())).toBe(String(gal.games));
  }).toPass();
  await expect(page.getByTestId("data-status")).toContainText("Dernière mise à jour");
  await expect(page.getByText("Site communautaire non officiel, sans lien avec les éditeurs d'OpenFront.")).toBeVisible();

  // Classement : navigation, ligne mise en évidence, recherche.
  if (mobile) await page.getByText("Menu", { exact: true }).click();
  await page.getByRole("link", { name: "Résultats", exact: true }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/classement/);
  await hydrated(page);
  await expect(page.locator(".row-highlight").filter({ visible: true })).toContainText("[GAL]");
  await page.getByLabel("Rechercher un clan").fill("gal");
  await expect(page.getByText(/clans? sur \d+/)).toContainText("sur");
  await page.getByLabel("Rechercher un clan").fill("zzzzzz");
  await expect(page.getByText("Aucun clan ne correspond")).toBeVisible();

  // Progression : le filtre change le résumé et le tableau reste accessible.
  await page.goto("/progression");
  await hydrated(page);
  const summary = page.getByTestId("summary-Parties");
  await expect(summary).not.toBeEmpty();
  await page.getByRole("button", { name: "30 jours" }).click();
  const month = digits(await summary.textContent());
  await page.getByRole("button", { name: "7 jours" }).click();
  await expect(async () => expect(Number(digits(await summary.textContent()))).toBeLessThan(Number(month))).toPass();
  await page.getByText("Voir le tableau des parties").click();
  await expect(page.getByRole("table").filter({ visible: true }).locator("tbody tr")).toHaveCount(7);

  // La liste des membres, onglet de la rubrique Membres : liste officielle, anonymes, recherche, tri.
  await page.goto("/liste");
  await hydrated(page);
  await expect(page.getByTestId("member-count")).toContainText(fmtInt(members.total));
  // Trente membres d'abord, dix sur téléphone où chacun est une carte : le reste d'un clic, la page reste courte.
  const firstPage = mobile ? 10 : 30;
  // La liste que le visiteur voit : des cartes sur téléphone, les lignes du tableau au-delà.
  const memberRows = page.getByTestId(mobile ? "member-card" : "member-row").filter({ visible: true });
  await expect(memberRows).toHaveCount(Math.min(firstPage, members.members.length));
  if (members.members.length > firstPage) {
    await page.getByTestId("members-more").click();
    await expect(memberRows).toHaveCount(members.members.length);
  }
  await expect(page.getByTestId("members-more")).toHaveCount(0);
  await expect(page.getByText("Membre anonyme").filter({ visible: true }).first()).toBeVisible();
  const named = members.members.find((m: { username: string | null }) => m.username)?.username;
  await page.getByLabel("Rechercher par pseudo").fill(named);
  await expect(page.getByRole("link", { name: named }).filter({ visible: true }).first()).toBeVisible();
  await page.getByLabel("Rechercher par pseudo").fill("");
  if (mobile) await page.getByLabel("Trier par").selectOption("joinedAt");
  else await page.getByRole("button", { name: /Arrivée/ }).click();
  await expect(page.getByText(/\d+ affichés/)).toBeVisible();

  // Activité : la ligne « Parties enregistrées » et la heatmap.
  await page.goto("/activite");
  await expect(page.getByText("Parties enregistrées, heure de Paris.")).toBeVisible();
  await expect(page.getByTestId("best-slot").first()).toBeVisible();

  // Guides : tout est dans la page, et le sommaire ouvre le chapitre visé.
  await page.goto("/debuter");
  await hydrated(page);
  await expect(page.getByTestId("guide-card")).toHaveCount(5);
  await expect(page.getByTestId("guide-chapter")).toHaveCount(11);
  await page.getByRole("navigation", { name: "Chapitres du guide du clan" }).getByRole("link", { name: /Croissance/ }).click();
  await expect(page.getByTestId("growth-chart").locator("svg")).toBeVisible();
  await expect(page.getByText("Ce guide reste à rédiger")).toHaveCount(0);
  // Le wiki est sous CC BY-SA : sa mention ne doit pas disparaître de la page.
  await expect(page.getByTestId("guide-sources").getByRole("link", { name: "CC BY-SA 4.0" })).toBeVisible();

  // Calculateur : il réagit et ne dépend pas de la frontière.
  await page.goto("/outils");
  await hydrated(page);
  await expect(page.getByText("Repère indicatif, pas une garantie.")).toBeVisible();
  const minimum = page.getByTestId("calc-minimum");
  await expect(minimum).not.toBeEmpty();
  const plains = await minimum.textContent();
  await page.getByLabel("Frontière").fill("500");
  await expect(minimum).toHaveText(plains ?? "");
  await page.getByLabel("Terrain").selectOption("mountain");
  await expect(minimum).not.toHaveText(plains ?? "");
  await page.getByLabel("Taille du bot").fill("0");
  await expect(page.getByTestId("calc-result").getByRole("alert")).toBeVisible();

  // Rejoindre.
  await page.goto("/rejoindre");
  await expect(page.getByTestId("join-steps").locator("li")).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "Demandez une invitation" })).toBeVisible();

  expect(apiCalls, "aucun appel à l'API OpenFront depuis le navigateur").toEqual([]);
});

test("l'accueil n'affiche que des données collectées", async ({ page }) => {
  await page.goto("/");
  expect(digits(await page.getByTestId("home-members").textContent())).toBe(String(members.total));
  // Sans annonce ni événement, le bloc n'existe pas : un visiteur n'a rien à y lire.
  const news = [...JSON.parse(readFileSync("content/announcements.json", "utf8")), ...JSON.parse(readFileSync("content/events.json", "utf8"))];
  if (news.length === 0) await expect(page.getByTestId("news-board")).toHaveCount(0);
  // L'accueil résume et renvoie : la carte, les dernières parties et les créneaux ont leur page, il ne les recopie pas.
  await expect(page.getByRole("heading", { name: /pixels sur la carte|parties en 14 jours|quand jouer|quand le clan joue/i })).toHaveCount(0);

  const clans = withOfficialRanks(lb.clans as LeaderboardEntry[]);
  const me = clans.find((c) => c.clanTag === clan.tag);
  const above = clans[(me?.rank ?? 2) - 2];
  if (me && above) await expect(page.getByTestId("home-race")).toContainText(`${fmtScore(above.weightedWins - me.weightedWins)} de retard sur [${above.clanTag}]`);
  await expect(page.getByRole("link", { name: "Lire les guides" })).toHaveAttribute("href", /\/debuter$/);
});

test("l'accueil donne d'abord le classement, et remonte Ma place pour qui a dit « C'est moi »", async ({ page }) => {
  const titles = () => page.locator("main h2").allTextContents();
  const at = (list: string[], text: string) => list.findIndex((t) => t.includes(text));
  await page.goto("/");
  const visitor = await titles();
  expect(at(visitor, "Le clan au classement officiel")).toBeGreaterThanOrEqual(0);
  expect(at(visitor, "Le clan au classement officiel")).toBeLessThan(at(visitor, "Ma place dans le clan"));
  if (at(visitor, "Les Gaulois de la semaine") >= 0) {
    expect(at(visitor, "Le clan au classement officiel")).toBeLessThan(at(visitor, "Les Gaulois de la semaine"));
    expect(at(visitor, "Les Gaulois de la semaine")).toBeLessThan(at(visitor, "Ma place dans le clan"));
  }

  const named = members.members.find((m: { username: string | null; publicId: string | null; team: unknown }) => m.username && m.publicId && m.team);
  await page.evaluate((id) => localStorage.setItem("gal-moi", id), named.publicId);
  await page.reload();
  await hydrated(page);
  // Déplacée dans la page, pas seulement à l'écran : le clavier et les lecteurs d'écran la trouvent aussi avant le classement.
  const member = await titles();
  expect(at(member, "Ma place dans le clan")).toBeLessThan(at(member, "Le clan au classement officiel"));
  await expect(page.getByTestId("my-place-result")).toContainText(named.username);
  const row = (await page.getByTestId("home-me-row").boundingBox())!;
  const ranking = (await page.locator("#classement-clan").boundingBox())!;
  expect(row.y + row.height).toBeLessThanOrEqual(ranking.y);
});

test("un lien vers l'accueil montre le rang du clan et le podium de la semaine, dessinés à la construction", async ({ page, request }) => {
  const meta = loadMeta();
  const latest = gazetteEditions({ sessions: loadSessions(), history: loadHistory(), territory: loadTerritoryReadings(), weekTops: loadMemberWeeks().tops, members: loadMembers(), archiveStart: clan.archiveStart, completeThrough: meta.sessions.completeThrough })[0] ?? null;
  const facts = accueilFacts(accueilRanking(lb, clan.tag), latest);
  // Un pseudo du podium que les polices du site ne savent pas écrire fait garder l'image du site, comme le veut le script.
  const fonts = new GazetteFonts(process.cwd());
  const drawable = (name: string) => {
    try {
      fonts.width(name, "strong", 27);
      return true;
    } catch {
      return false;
    }
  };
  await page.goto("/");
  const og = page.locator('meta[property="og:image"]');
  if (!facts || !(facts.podium?.players ?? []).every((p) => drawable(p.username))) {
    await expect(og).toHaveAttribute("content", /\/generated\/og\.jpg$/);
    return;
  }
  // L'adresse change avec l'image : Discord ne peut pas garder l'ancienne.
  await expect(og).toHaveAttribute("content", /\/generated\/accueil\.png\?v=[0-9a-f]{12}$/);
  const url = new URL((await og.getAttribute("content"))!);
  const image = await request.get(`${url.pathname}${url.search}`);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toContain("image/png");
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute("content", accueilImageAlt(facts, clan.tag, clan.name));
});

test("la page Membres présente l'encadrement, et chacun mène à sa fiche", async ({ page }) => {
  await page.goto("/membres");
  const block = page.getByTestId("command");
  const command = members.members.filter((m: { role: string }) => m.role !== "member");
  await expect(block.getByRole("heading", { name: `L'encadrement · ${command.length}` })).toBeVisible();
  await expect(block.getByTestId("command-member")).toHaveCount(command.length);
  for (const m of command) {
    if (m.username) await expect(block.getByRole("link", { name: m.username, exact: true })).toHaveAttribute("href", new RegExp(`/membres/${m.publicId}$`));
  }
});

// Le 12 novembre 2026, à la demande du pilote : la liste a son onglet, entre la page Membres et le QG, et n'est qu'à un endroit.
test("la liste des membres a son onglet, entre la page Membres et le QG", async ({ page }) => {
  await page.goto("/membres");
  const tabs = page.getByTestId("section-nav").locator("a");
  await expect(tabs).toHaveText(["Membres", "La liste", "Le QG"]);
  await expect(page.locator('astro-island[component-url*="MembersTable"]')).toHaveCount(0);
  await tabs.filter({ hasText: "La liste" }).click();
  await expect(page).toHaveURL(/\/liste\/?$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Liste des membres");
  await expect(page.getByTestId("data-status").first()).toContainText("Dernière mise à jour");
  await expect(page.locator('astro-island[component-url*="MembersTable"]')).toHaveCount(1);
  // Un ancien lien vers la liste, en bas de la page Membres, mène à son onglet.
  await page.goto("/membres#liste");
  await expect(page).toHaveURL(/\/liste\/?$/);
});

/** Le lien que le doigt touche en un point d'un élément : celui du dessus, comme un vrai toucher. */
const linkAt = async (page: Page, x: number, y: number) =>
  page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.closest("a")?.getAttribute("href") ?? null, [x, y]);

test("les pseudos de la page Membres se touchent du doigt", async ({ page }, testInfo) => {
  await page.goto("/membres");
  await hydrated(page);
  // Les paliers : chaque pseudo fait au moins 24 pixels de haut, le minimum de WCAG 2.2.
  const tierLink = page.getByTestId("win-tier").locator("a").first();
  if ((await tierLink.count()) > 0) {
    expect((await tierLink.boundingBox())!.height).toBeGreaterThanOrEqual(24);
    // Plus haut, il garde l'allure d'un lien : souligné, de la couleur des liens.
    expect(await tierLink.evaluate((a) => getComputedStyle(a).textDecorationLine)).toBe("underline");
  }
  // L'encadrement : toute la ligne mène à la fiche, jusqu'au bord opposé au pseudo.
  const staff = page.getByTestId("command-member").filter({ has: page.locator("a") }).first();
  if ((await staff.count()) > 0) {
    await staff.scrollIntoViewIfNeeded();
    const box = (await staff.boundingBox())!;
    expect(await linkAt(page, box.x + box.width - 4, box.y + box.height - 4)).toMatch(/^\/membres\/./);
  }
  if (testInfo.project.name !== "mobile") return;
  // Sur téléphone, dans la liste des membres, toute la carte d'un membre avec pseudo mène à sa fiche, pas seulement ses 20 pixels de pseudo.
  await page.goto("/liste");
  await hydrated(page);
  const card = page.getByTestId("member-card").filter({ has: page.locator("a") }).first();
  await card.scrollIntoViewIfNeeded();
  const box = (await card.boundingBox())!;
  expect(await linkAt(page, box.x + box.width - 8, box.y + box.height - 8)).toBe(await card.locator("a").getAttribute("href"));
});

test("le bloc de jeu en groupe mène au Discord", async ({ page }) => {
  await page.goto("/activite");
  const block = page.getByTestId("group-play");
  await expect(block.getByTestId("group-size").first()).toContainText("Seul sous le tag");
  await expect(block.getByRole("link", { name: "Trouver un groupe sur Discord" })).toHaveAttribute("href", "https://discord.gg/cjUc42T7Y2");
});

test("Rejoindre donne l'argument du jeu en groupe et renvoie vers son détail", async ({ page }) => {
  await page.goto("/rejoindre");
  await expect(page.getByTestId("group-play")).toHaveCount(0);
  const line = page.getByTestId("join-group");
  await expect(line).toContainText("Seul sous le tag");
  await expect(line).toContainText("Un lien, pas une preuve");
  await expect(line.getByRole("link")).toHaveAttribute("href", /\/activite$/);
  await expect(page.getByTestId("join-guides").getByRole("link")).toHaveAttribute("href", /\/debuter$/);
});

test("les anciens liens vers le calculateur et les outils y mènent encore", async ({ page }) => {
  await page.goto("/debuter#calculateur");
  await expect(page).toHaveURL(/\/outils\/?#calculateur$/);
  await expect(page.getByRole("heading", { name: "Troupes à envoyer contre un bot" })).toBeInViewport();
  await page.goto("/debuter#outils-section");
  await expect(page).toHaveURL(/\/outils\/?#outils-section$/);
});

test("le sommaire des guides rouvre un chapitre refermé", async ({ page }) => {
  await page.goto("/debuter");
  const link = page.getByRole("navigation", { name: "Chapitres du guide du clan" }).getByRole("link", { name: /Trains/ });
  const chapter = page.getByTestId("guide-chapter").filter({ has: page.getByRole("heading", { name: /Trains/ }) });
  await link.click();
  await expect(chapter).toHaveAttribute("open", "");
  await chapter.locator("summary").first().click();
  await expect(chapter).not.toHaveAttribute("open", "");
  await link.click();
  await expect(chapter).toHaveAttribute("open", "");
});

// Le 10 novembre 2026, à la demande du pilote : le périmètre des parties passe dans les précisions repliées, qui restent dans la page.
test("la période et les réserves restent visibles, le périmètre se lit dans les précisions repliées", async ({ page }) => {
  await page.goto("/liste");
  const scope = page.getByTestId("members-scope");
  await expect(scope).toContainText("sans le classé");
  await expect(scope).toBeHidden();
  await page.locator("details", { has: scope }).locator("summary").click();
  await expect(scope).toBeVisible();
  await page.goto("/rivaux");
  await expect(page.getByTestId("compare-rate-note")).toBeVisible();
  await page.goto("/records");
  if (playerPodiums(loadMemberResults(), loadSessions(), loadMembers(), loadMeta().sessions.coveredUntil).since !== null) await expect(page.getByTestId("podiums-period")).toBeVisible();
  await page.goto("/parties");
  await expect(page.getByTestId("journal-link-note")).toBeVisible();
  await expect(page.getByTestId("journal-link-note")).toContainText("Rejoindre un salon privé");
  await expect(page.getByTestId("journal-clans-note")).toContainText("L'API ne donne pas l'équipe des perdants");
});

test("la carte World se trouve depuis la page Carte", async ({ page }) => {
  await page.goto("/carte");
  await expect(page.getByRole("link", { name: "La carte « World »", includeHidden: true })).toHaveAttribute("href", /\/carte-monde\/$/);
});

test.describe("le plan du site", () => {
  test("chaque page appartient à une rubrique, et ses onglets y mènent", async ({ page }) => {
    for (const section of SECTIONS) {
      for (const target of section.pages) {
        await page.goto(target.href);
        const tabs = page.getByTestId("section-nav");
        if (section.pages.length === 1) {
          await expect(tabs).toHaveCount(0);
          continue;
        }
        await expect(tabs.locator("a")).toHaveCount(section.pages.length);
        await expect(tabs.getByRole("link", { name: target.label, exact: true })).toHaveAttribute("aria-current", "page");
      }
    }
  });
  test("une fiche de membre reste dans sa rubrique", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Menu testé sur desktop.");
    const member = members.members.find((m: { publicId: string | null }) => m.publicId);
    await page.goto(`/membres/${member.publicId}`);
    await expect(page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Membres", exact: true })).toHaveAttribute("aria-current", "true");
  });
  test("passer d'un onglet à l'autre change de page sans repasser par le menu", async ({ page }) => {
    await page.goto("/classement");
    await page.getByTestId("section-nav").getByRole("link", { name: "Nos rivaux" }).click();
    await expect(page).toHaveURL(/rivaux/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nos rivaux");
  });
  test("le pied de page donne le plan complet", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("footer-plan").locator("a")).toHaveCount(SECTIONS.flatMap((s) => s.pages).length);
  });
});

test.describe("les nouveautés du site", () => {
  const entries = loadNouveautes();
  const marker = newsMarker(entries);
  /** Les points allumés : sur le bouton de l'en-tête, sur le menu du téléphone, ou dans le menu ouvert. */
  const litDots = (page: Page) => page.locator("[data-nouveautes-dot]").filter({ visible: true });

  test("la page explique chaque mise à jour, de la plus récente à la plus ancienne, et replie les anciennes", async ({ page }) => {
    await page.goto("/nouveautes");
    const items = page.getByTestId("nouveautes-entry");
    const { shown, folded } = splitDays(newsDays(entries));
    await expect(items.filter({ visible: true })).toHaveCount(shown.flatMap((d) => d.entries).length);
    if (folded.length > 0) await page.getByTestId("nouveautes-older").locator("summary").click();
    await expect(items).toHaveCount(entries.length);
    for (const [i, e] of entries.entries()) {
      const item = items.nth(i);
      await expect(item.getByRole("heading", { level: 3 })).toHaveText(e.title);
      await expect(item).toContainText(e.body);
      if (e.link) await expect(item.getByRole("link", { name: e.link.label })).toHaveAttribute("href", e.link.href);
    }
  });

  test("le bouton de l'en-tête résume les dernières, se referme avec Échap et mène à toutes", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Sur téléphone, les nouveautés passent par le menu.");
    await page.goto("/classement");
    const summary = page.getByTestId("nouveautes-menu").locator("summary");
    const panel = page.getByTestId("nouveautes-panel");
    await expect(panel).toBeHidden();
    await summary.click();
    await expect(panel).toBeVisible();
    const latest = latestNews(entries);
    await expect(panel.getByTestId("nouveautes-panel-entry")).toHaveCount(latest.length);
    for (const [i, e] of latest.entries()) await expect(panel.getByTestId("nouveautes-panel-entry").nth(i)).toContainText(e.body);
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(summary).toBeFocused();
    await summary.click();
    await panel.getByRole("link", { name: "Toutes les nouveautés" }).click();
    await expect(page).toHaveURL(/\/nouveautes$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nouveautés du site");
  });

  test("un point signale une mise à jour parue depuis le dernier passage, et s'éteint une fois vue", async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === "mobile";
    // Première visite : rien n'est nouveau pour le visiteur. La marque est retenue, sans point.
    await page.goto("/");
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), NOUVEAUTES_KEY)).toBe(marker);
    await expect(litDots(page)).toHaveCount(0);
    // Comme si la dernière mise à jour vue était plus ancienne.
    await page.evaluate((key) => localStorage.setItem(key, "2026-01-01/1"), NOUVEAUTES_KEY);
    await page.reload();
    await expect(litDots(page)).toHaveCount(1);
    if (mobile) {
      // Le bouton Menu garde son nom ; le point allumé lui donne une description.
      await expect(page.getByLabel("Ouvrir le menu")).toHaveAccessibleDescription("Du nouveau sur le site depuis votre dernier passage");
      await page.getByText("Menu", { exact: true }).click();
      const link = page.getByTestId("nouveautes-menu-link");
      await expect(link).toHaveAccessibleName("Nouveautés du site : du nouveau depuis votre dernier passage");
      await link.click();
      await expect(page).toHaveURL(/\/nouveautes$/);
    } else {
      const summary = page.getByTestId("nouveautes-menu").locator("summary");
      await expect(summary).toHaveAccessibleName("Nouveautés : du nouveau depuis votre dernier passage");
      await summary.click();
      await expect(page.getByTestId("nouveautes-panel")).toBeVisible();
    }
    await expect(litDots(page)).toHaveCount(0);
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), NOUVEAUTES_KEY)).toBe(marker);
    // Vues une fois, elles ne rallument plus le point.
    await page.goto("/membres");
    await expect(litDots(page)).toHaveCount(0);
  });

  test("sans stockage dans le navigateur, aucun point et aucune erreur", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", { get: () => { throw new Error("stockage refusé"); } });
    });
    for (const path of ["/", "/nouveautes"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(litDots(page)).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
});

test("le classement montre 25 clans d'abord, le reste à la demande, et la recherche voit tout", async ({ page }) => {
  await page.goto("/classement");
  await hydrated(page);
  const row = page.getByTestId("leaderboard-row").filter({ visible: true });
  await expect(row).toHaveCount(25);
  await expect(page.locator(".row-highlight").filter({ visible: true })).toContainText("[GAL]");
  const more = page.getByTestId("leaderboard-more");
  await more.locator("summary").click();
  await expect(row).toHaveCount(lb.clans.length);
  await more.locator("summary").click();

  const last = lb.clans.at(-1).clanTag;
  await page.getByLabel("Rechercher un clan").fill(last);
  await expect(more).toHaveCount(0);
  await expect(row.first()).toContainText(`[${last}]`);
  // Tous les clans sont dans la page, même sans script.
  const html = await (await page.request.get("/classement")).text();
  expect(html).toContain(last);
});

test("les nombres n'utilisent que des espaces contenues dans nos polices", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Même texte sur mobile.");
  test.slow();
  // Outfit et Inter n'ont pas l'espace fine U+202F : le navigateur la prenait dans la police de l'appareil, et « 121 976 » se lisait « 121976 » en titre.
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await openFolds(page);
    const text = await page.evaluate(() => document.body.innerText);
    expect(text.includes("\u202f"), path).toBe(false);
  }
});

test("au retour, l'accueil dit ce qui a changé, et rien à la première visite", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  await expect(page.getByTestId("since-visit")).toHaveCount(0);
  // Comme si la visite précédente datait d'il y a longtemps, avec moins de parties.
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("gal-visite") ?? "null");
    const old = { ...state.latest, at: "2026-01-01T10:00:00.000Z", games: state.latest.games - 10, wins: state.latest.wins - 4, gazette: "2020-01-06" };
    localStorage.setItem("gal-visite", JSON.stringify({ baseline: old, latest: old, since: "2026-01-01T10:05:00.000Z", seenAt: "2026-01-01T10:05:00.000Z" }));
  });
  await page.reload();
  await hydrated(page);
  const block = page.getByTestId("since-visit");
  await expect(block.getByRole("heading")).toContainText("Depuis votre dernière visite, le 1 janv. 2026");
  await expect(block.getByTestId("since-line").first()).toHaveText("10 parties de plus, dont 4 victoires.");
  await expect(block.getByRole("link", { name: "Une nouvelle gazette est parue." })).toHaveAttribute("href", /\/gazette$/);
  // Recharger la page ne fait pas perdre le résumé.
  await page.reload();
  await hydrated(page);
  await expect(block.getByTestId("since-line").first()).toHaveText("10 parties de plus, dont 4 victoires.");
});

test("sans stockage dans le navigateur, l'accueil marche quand même", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get: () => { throw new Error("stockage refusé"); } });
  });
  await page.goto("/");
  await hydrated(page);
  await expect(page.getByTestId("since-visit")).toHaveCount(0);
  await expect(page.getByLabel("Votre pseudo dans le jeu")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Ma place ne charge la liste qu'à la demande, et retient seulement le pseudo qu'on choisit", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/data/members.json")) calls.push(r.url());
  });
  await page.goto("/");
  await hydrated(page);
  await page.waitForTimeout(300);
  expect(calls).toEqual([]);

  const named = members.members.find((m: { username: string | null; team: unknown }) => m.username && m.team);
  const field = page.getByLabel("Votre pseudo dans le jeu");
  const result = page.getByTestId("my-place-result");
  await field.fill(named.username);
  await expect(result).toContainText(named.username);
  await expect(page.getByTestId("my-place-tier")).toContainText("Prochain palier");
  await expect(result.getByRole("link", { name: named.username })).toHaveAttribute("href", new RegExp(`/membres/${named.publicId}$`));

  // Chercher un pseudo ne le retient pas.
  await page.reload();
  await hydrated(page);
  await expect(result).toHaveCount(0);

  await field.fill(named.username);
  await page.getByTestId("my-place-remember").click();
  await expect(field).toHaveCount(0);
  await expect(result).toContainText(named.username);
  // Le bouton utilisé disparaît : le clavier reprend sur celui qui le remplace.
  await expect(page.locator(":focus")).toHaveAttribute("data-testid", "my-place-forget");
  await page.reload();
  await hydrated(page);
  await expect(result).toContainText(named.username);
  await expect(field).toHaveCount(0);

  // Le bilan personnel : comme si la visite précédente datait d'un mois, avec trois victoires et une place de moins.
  const place = placeOf(members.members, named)!;
  const current = { id: named.publicId, at: members.fetchedAt, wins: place.wins, losses: named.team.losses, rank: place.rank, ranked: place.ranked };
  const old = { ...current, at: "2026-10-01T10:00:00.000Z", wins: Math.max(0, current.wins - 3), losses: Math.max(0, current.losses - 1), rank: current.rank + 1 };
  await page.evaluate((state) => localStorage.setItem("gal-moi-visite", state), JSON.stringify({ baseline: old, latest: old, since: "2026-10-01T10:05:00.000Z", seenAt: "2026-10-01T10:05:00.000Z" }));
  await page.reload();
  await hydrated(page);
  const since = page.getByTestId("my-place-since");
  await expect(since).toContainText("Pour vous, depuis votre dernière visite, le 1 oct. 2026");
  await expect(since.getByTestId("my-place-since-line")).toHaveText(meVisitLines(old, current));

  await page.getByTestId("my-place-forget").click();
  // Oublier son pseudo efface aussi ce bilan.
  expect(await page.evaluate(() => localStorage.getItem("gal-moi-visite"))).toBeNull();
  await expect(field).toBeVisible();
  await expect(field).toBeFocused();
  await page.reload();
  await hydrated(page);
  await expect(result).toHaveCount(0);
});

test("une fiche de membre se partage : un bouton copie son lien, et l'aperçu du lien montre sa fiche", async ({ page, context }) => {
  const named = members.members.find((m: { username: string | null; team: unknown; publicId: string | null }) => m.username && m.team && m.publicId);
  await page.goto(`/membres/${named.publicId}`);
  // L'image d'aperçu, dessinée au build, est bien servie et décrite.
  // L'adresse est absolue, sur le domaine du site : on ne garde que le chemin pour l'interroger ici.
  const image = new URL((await page.locator('meta[property="og:image"]').getAttribute("content"))!).pathname;
  expect(image).toBe(`/generated/fiches/${named.publicId}.png`);
  const served = await page.request.get(image);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toContain("image/png");
  const alt = await page.locator('meta[property="og:image:alt"]').getAttribute("content");
  expect(alt?.startsWith(`${named.username}, membre de [${clan.tag}]`), alt ?? "").toBe(true);
  // Le bouton copie l'adresse de la fiche.
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByTestId("copy-link").click();
  await expect(page.getByTestId("copy-status")).toContainText("Lien copié");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
});

test("le site s'installe comme une application : un fichier d'installation et ses icônes", async ({ page }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toMatch(/\/manifest\.webmanifest$/);
  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ name: `[${clan.tag}] ${clan.name}`, short_name: clan.tag, display: "standalone", lang: "fr" });
  expect(manifest.icons).toHaveLength(2);
  for (const icon of manifest.icons) {
    const served = await page.request.get(icon.src);
    expect(served.status(), icon.src).toBe(200);
    expect(served.headers()["content-type"]).toContain("image/png");
  }
});

test("une liste vide ne fait pas perdre le pseudo retenu : pas de données n'est pas un départ", async ({ page }) => {
  await page.route("**/data/members.json", (route) => route.fulfill({ json: { fetchedAt: "2026-11-07T10:00:00.000Z", total: 0, members: [] } }));
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("gal-moi", "un-membre"));
  await page.reload();
  await hydrated(page);
  await expect(page.getByLabel("Votre pseudo dans le jeu")).toBeVisible();
  await expect(page.getByTestId("my-place-gone")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("gal-moi"))).toBe("un-membre");
});

test("un pseudo retenu qui n'est plus dans la liste publique n'est plus gardé", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("gal-moi", "parti-du-clan"));
  await page.reload();
  await hydrated(page);
  await expect(page.getByTestId("my-place-gone")).toBeVisible();
  await expect(page.getByLabel("Votre pseudo dans le jeu")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("gal-moi"))).toBeNull();
});

test("le classé ne publie que des décomptes, à part du classement des clans", async ({ page }) => {
  await page.goto("/membres");
  const block = page.getByTestId("ranked-block");
  const panels = block.getByTestId("ranked-mode");
  if (!existsSync("data/ranked.json")) {
    await expect(panels).toHaveCount(0);
    return;
  }
  const ranked = JSON.parse(readFileSync("data/ranked.json", "utf8"));
  await expect(block).toContainText("ne compte pas dans le score du clan");
  await expect(block).toContainText("ces nombres sont donc des minimums");
  await expect(panels).toHaveCount(3);
  for (const [i, key] of ["1v1", "2v2", "ffa"].entries()) {
    const mode = ranked.modes[key];
    expect(digits(await panels.nth(i).getByTestId("ranked-members").textContent())).toBe(String(mode.members));
    expect(digits(await panels.nth(i).getByTestId("ranked-top").textContent())).toBe(`${mode.top}10`);
  }
  // Aucun nom ni chiffre individuel : ni lien de profil, ni tableau de joueurs.
  await expect(block.getByRole("link")).toHaveCount(0);
  await expect(block.getByRole("table")).toHaveCount(0);
  await expect(block).toContainText("Dernière mise à jour");
});

test("la course avec les voisins part du premier relevé", async ({ page }) => {
  await page.goto("/rivaux");
  await hydrated(page);
  const race = page.getByTestId("rival-race");
  const me = lb.clans.indexOf(gal);
  if (me < 0 || !existsSync("data/rivals") || readdirSync("data/rivals").length === 0) {
    await expect(race).toHaveCount(0);
    return;
  }
  await expect(race).toContainText("L'API ne donne pas le passé du classement");
  const gaps = race.getByRole("heading", { name: /^Face à \[/ });
  // Le clan au-dessus et les deux en dessous, s'ils existent.
  await expect(gaps).toHaveCount(lb.clans.filter((_: unknown, i: number) => i !== me && i >= me - 1 && i <= me + 2).length);
  await race.getByText("Voir le tableau des écarts").click();
  await expect(race.getByRole("table").locator("tbody tr")).toHaveCount(readdirSync("data/rivals").length);
});

// Le 10 novembre 2026, à la demande du pilote : la page Records ne garde que les joueurs et les records ; Nos rivaux perd le bloc des face-à-face.
test("les records du clan disent ce qu'ils ne comptent pas, sans résultats par format ni par carte", async ({ page }) => {
  await page.goto("/records");
  await expect(page.getByTestId("clan-record")).toHaveCount(4);
  await expect(page.getByTestId("clan-records")).toContainText("n'est pas comptée");
  for (const gone of ["format-results", "map-results"]) await expect(page.getByTestId(gone)).toHaveCount(0);
});

test("les podiums des Gaulois reprennent les chiffres calculés, chaque joueur menant à sa fiche", async ({ page }) => {
  const podiums = playerPodiums(loadMemberResults(), loadSessions(), loadMembers(), loadMeta().sessions.coveredUntil);
  await page.goto("/records");
  const block = page.getByTestId("player-podiums");
  await expect(block.getByRole("heading", { level: 2 })).toHaveText("Les podiums des Gaulois");
  await expect(block.getByTestId("data-status")).toBeVisible();
  if (podiums.since === null) {
    await expect(block).toContainText("Pas de données");
    await expect(block.getByTestId("podium-row")).toHaveCount(0);
    return;
  }
  for (const [testId, rows] of [
    ["podium-streaks", podiums.streaks],
    ["podium-days", podiums.days],
  ] as const) {
    const lines = block.getByTestId(testId).getByTestId("podium-row");
    await expect(lines).toHaveCount(rows.length);
    for (const [i, row] of rows.entries()) {
      const line = lines.nth(i);
      await expect(line).toContainText(fmtRank(row.place));
      await expect(line.getByRole("link", { name: row.username, exact: true })).toHaveAttribute("href", `/membres/${encodeURIComponent(row.id)}`);
      await expect(line.getByTestId("podium-value")).toHaveText(fmtCount(row.value, "victoire"));
      await expect(line.getByTestId("podium-dates")).toHaveText(podiumDates(row));
    }
  }
  // La période reste écrite ; le périmètre et la réserve sur le niveau sont dans le repli.
  await expect(block.getByTestId("podiums-period")).toBeVisible();
  await expect(block.getByTestId("reading-note")).toContainText("ce n'est pas un classement de niveau");
});

test("le face-à-face ne reste que dans le comparateur, avec sa méthode, sa date, ses chiffres et sa suspension", async ({ page }) => {
  const result = faceOffs(loadSessions(), loadGames(), clan.tag, lb.clans.map((c: { clanTag: string }) => c.clanTag), loadMeta().sessions.coveredUntil);
  await page.goto("/rivaux");
  await expect(page.getByTestId("face-offs")).toHaveCount(0);
  await expect(page.getByTestId("compare-notes")).toContainText("L'API ne donne pas l'équipe des perdants");
  await expect(page.getByTestId("compare-games-status").getByTestId("data-status")).toBeVisible();
  await expect(page.getByTestId("compare-face-off-suspended")).toHaveCount(result && !result.reliable ? 1 : 0);
  await hydrated(page);
  // Le clan comparé d'abord : sa ligne de face-à-face reprend le calcul, ou dit qu'il n'y en a pas.
  const rival = firstRival(withOfficialRanks(lb.clans as LeaderboardEntry[]), clan.tag);
  const row = result?.reliable ? result.rows.find((r) => r.tag === rival?.clanTag) : undefined;
  const line = page.getByTestId("compare-face-off");
  if (!row) {
    await expect(line).toContainText("Pas de face-à-face à afficher");
    return;
  }
  await expect(line).toContainText(fmtCount(row.meetings, "partie"));
  await expect(line).toContainText(`gagne ${fmtInt(row.ours)} fois, celle de [${row.tag}] ${fmtInt(row.theirs)} fois, une autre équipe ${fmtInt(row.others)} fois`);
});

test("le comparateur met côte à côte deux clans de la liste officielle", async ({ page }) => {
  const clans = withOfficialRanks(lb.clans as LeaderboardEntry[]);
  const me = clans.find((c) => c.clanTag === clan.tag);
  const above = clans[(me?.rank ?? 2) - 2];
  const other = clans.at(-1);
  if (!me || !above || !other) throw new Error("La liste devrait contenir le clan et ses voisins.");
  await page.goto("/rivaux");
  const block = page.getByTestId("clan-compare");
  await block.scrollIntoViewIfNeeded();
  // Sans attendre le script : les chiffres sont déjà dans la page.
  const html = await (await page.request.get("/rivaux")).text();
  expect(html).toContain('data-testid="compare-table"');
  await hydrated(page);

  const checkRows = async (tag: string, score: number, games: number) => {
    await expect(block.getByTestId("compare-table").locator("thead")).toContainText(`[${tag}]`);
    const cells = block.getByTestId("compare-row");
    await expect(cells.nth(1).locator("td").nth(1)).toHaveText(fmtScore(score));
    expect(digits(await cells.nth(2).locator("td").nth(1).textContent())).toBe(String(games));
  };
  await checkRows(above.clanTag, above.weightedWins, above.games);
  await expect(block.getByTestId("compare-gap")).toContainText(fmtGap(me.weightedWins - above.weightedWins));

  await block.getByLabel("Clan à comparer").selectOption(other.clanTag);
  await checkRows(other.clanTag, other.weightedWins, other.games);
  await expect(block.getByTestId("compare-gap")).toContainText(fmtGap(me.weightedWins - other.weightedWins));
  await expect(block.getByTestId("compare-row").first().locator("td").nth(1)).toHaveText(fmtRank(other.rank));

  // Le clan lui-même ne se compare pas à lui-même.
  await expect(block.getByLabel("Clan à comparer").locator(`option[value="${clan.tag}"]`)).toHaveCount(0);
});

test("dès deux relevés, le comparateur double sa courbe d'un tableau", async ({ page }) => {
  // Ces deux dates ne servent qu'à ce test, sur un fichier remplacé à la volée : le premier jour de la collecte, il n'y avait qu'un relevé.
  const clans = withOfficialRanks(lb.clans as LeaderboardEntry[]);
  const me = clans.find((c) => c.clanTag === clan.tag);
  const above = clans[(me?.rank ?? 2) - 2];
  if (!me || !above) throw new Error("La liste devrait contenir le clan et son voisin.");
  await page.route("**/classement-scores.json", (route) =>
    route.fulfill({ json: { dates: ["2026-11-07", "2026-11-08"], scores: { [me.clanTag]: [100, 120], [above.clanTag]: [150, 110] } } }),
  );
  await page.goto("/rivaux");
  await hydrated(page);
  const table = page.getByTestId("compare-gap-table");
  await table.locator("summary").click();
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText(`+${fmtScore(10)}`);
  await expect(rows.last()).toContainText(`−${fmtScore(50)}`);
});

test("un bouton de filtre actif reste lisible au survol", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Le survol est testé sur desktop.");
  await page.goto("/parties");
  await hydrated(page);
  const active = page.getByRole("button", { name: "Toutes", exact: true });
  await expect(active).toBeEnabled();
  await active.hover();
  await expect(active).toHaveCSS("color", "rgb(5, 11, 31)");
  await expect(active).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

test("sans le fichier des scores, le comparateur garde ses chiffres et le signale", async ({ page }) => {
  await page.route("**/classement-scores.json", (route) => route.fulfill({ status: 500, body: "panne" }));
  await page.goto("/rivaux");
  const block = page.getByTestId("clan-compare");
  await block.scrollIntoViewIfNeeded();
  await expect(block.getByRole("status").filter({ hasText: "n'a pas pu être chargée" })).toBeVisible();
  await expect(block.getByTestId("compare-row").first()).toBeVisible();
});

test.describe("carte World", () => {
  const film = loadClanMapFilm();
  const expected = worldTerritory(film);

  test("elle dessine la part réelle de GAL et le dit, sans valeur d'exemple", async ({ page }) => {
    test.skip(!expected, "pas de film collecté");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/carte-monde/");
    const text = page.getByTestId("monde-territoire");
    await expect(text).toContainText("carte officielle des clans");
    await expect(text).toContainText("Sa forme ici est une illustration : le vrai tracé de GAL est sur la page Carte.");
    await expect(page.locator("main")).not.toContainText(/démonstration|arbitraire|exemple/i);
    const painted = await page.evaluate(async () => {
      const world = (window as unknown as { carteMonde: { pret: Promise<void> } }).carteMonde;
      await world.pret;
      return document.querySelector('[data-testid="monde-territoire"]')?.textContent ?? "";
    });
    expect(digits(painted)).toContain(String(expected?.pixels));
    expect(digits(painted)).toContain(String(expected?.tiles));
    await expect(page.getByText("© OpenFront and Contributors")).toBeVisible();
    await expect(page.getByRole("link", { name: "page Carte" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("sans son fichier, elle ne dessine aucun territoire et le dit", async ({ page }) => {
    await page.route("**/territoire.json", (route) => route.fulfill({ status: 500, body: "panne" }));
    await page.goto("/carte-monde/");
    await expect(page.getByTestId("monde-territoire")).toHaveText("Pas de données : le territoire de GAL n'est pas dessiné.");
  });
});

test("la progression suit le nombre de membres, relevé chaque jour", async ({ page }) => {
  const last = loadHistory().at(-1);
  if (!last) throw new Error("L'historique devrait avoir au moins un relevé.");
  await page.goto("/progression");
  await hydrated(page);
  await expect(page.getByRole("heading", { name: "Membres", exact: true })).toBeVisible();
  await page.getByText("Voir le tableau des relevés").click();
  const row = page.getByRole("table", { name: "Rang, score et nombre de membres relevés chaque jour" }).locator("tbody tr").first();
  expect(digits(await row.locator("td").nth(3).textContent())).toBe(last.membersTotal === null ? "" : String(last.membersTotal));
});

test("les paliers rangent chaque membre une fois, sans anonyme nommé", async ({ page }) => {
  const stored = loadMembers();
  if (!stored) throw new Error("La liste des membres devrait exister.");
  const rows = tierRows(stored.members);
  await page.goto("/membres");
  const block = page.getByTestId("win-tiers");
  await expect(block.getByTestId("win-tier")).toHaveCount(rows.length);
  for (const [i, row] of rows.entries()) {
    const tier = block.getByTestId("win-tier").nth(i);
    await expect(tier.getByTestId("win-tier-title")).toHaveText(fmtCount(row.wins, "victoire"));
    await expect(tier.getByTestId("win-tier-count")).toHaveText(fmtCount(row.count, "membre"));
    await expect(tier.locator("a")).toHaveCount(row.named.length);
  }
  // Un pseudo mène à sa fiche, qui dit le même palier.
  const leader = rows[0]?.named[0];
  if (!leader?.team || !leader.username) throw new Error("Le plus haut palier devrait avoir un membre avec pseudo.");
  await block.getByRole("link", { name: leader.username, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/membres/${leader.publicId}`));
  const tier = tierOf(leader.team.wins);
  if (tier === null) throw new Error("Ce membre devrait avoir un palier.");
  await expect(page.getByTestId("member-tier")).toContainText(`Palier atteint : ${fmtCount(tier, "victoire")}`);
  const next = nextTier(leader.team.wins);
  if (next) await expect(page.getByTestId("member-tier")).toContainText(`Prochain palier : ${fmtCount(next.wins, "victoire")}`);
});

test("le journal montre les dernières parties, avec leur replay et des filtres", async ({ page }) => {
  const official = (lb.clans as { clanTag: string }[]).map((c) => c.clanTag);
  const { rows, coverage } = clanJournal({ sessions: loadSessions(), games: loadGames(), coveredUntil: loadMeta().sessions.coveredUntil, tag: clan.tag, officialTags: official });
  const first = rows[0];
  if (!first) throw new Error("Le journal devrait avoir au moins une partie.");
  const apiCalls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("api.openfront.io")) apiCalls.push(r.url());
  });
  await page.goto("/parties");
  const line = page.locator('[data-testid="journal-row"], [data-testid="journal-card"]').filter({ visible: true });
  // Écrites dans la page, avant le chargement du reste.
  const html = await (await page.request.get("/parties")).text();
  expect(html.match(/data-testid="journal-replay"/g)?.length).toBe(2 * Math.min(rows.length, JOURNAL_FIRST_ROWS));

  // Un tag se choisit librement : la page et son fichier ne citent que la liste officielle.
  const published = (await (await page.request.get("/parties.json")).json()) as { rivals: [string, number][]; allies: [string, number][] }[];
  expect(published).toHaveLength(rows.length);
  for (const tag of new Set(published.flatMap((r) => [...r.rivals, ...r.allies].map(([t]) => t)))) expect(official).toContain(tag);

  await hydrated(page);
  const count = page.getByTestId("journal-count");
  await expect(count).toContainText(journalCount(rows, NO_FILTER));
  await expect(line.first().getByTestId("journal-replay")).toHaveAttribute("href", replayUrl(first.id));
  await expect(line.first()).toContainText(first.won ? "Victoire" : "Défaite");
  if (first.map) await expect(line.first()).toContainText(mapLabel(first.map));
  // La couverture ne s'écrit que lorsqu'il manque des parties.
  if (coverage.read < coverage.total) expect(digits(await page.getByTestId("journal-coverage").textContent())).toContain(String(coverage.read));
  else await expect(page.getByTestId("journal-coverage")).toHaveCount(0);

  // Un filtre ne garde que ce qu'il annonce, et n'écrit jamais de taux.
  await page.getByRole("button", { name: "Défaites", exact: true }).click();
  const lost = rows.filter((r) => !r.won);
  await expect(count).toContainText(journalCount(lost, { ...NO_FILTER, result: "lost" }));
  await expect(count).not.toContainText("%");
  await expect(line.first()).toContainText("Défaite");

  const rival = journalChoices(rows).rivals[0];
  if (rival) {
    await page.getByLabel("Contre le clan").selectOption(rival);
    const against = lost.filter((r) => r.rivals.some(([tag]) => tag === rival));
    await expect(count).toContainText(fmtCount(against.length, "partie"));
    await expect(count).not.toContainText("%");
    if (coverage.read < coverage.total) await expect(page.getByTestId("journal-unread")).toBeVisible();
  }

  // Au clavier, retirer les filtres ne renvoie pas en haut de la page.
  const reset = page.getByRole("button", { name: "Retirer les filtres" });
  await reset.focus();
  await reset.press("Enter");
  await expect(count).toContainText(journalCount(rows, NO_FILTER));
  await expect(reset).toHaveCount(0);
  await expect(page.locator(":focus")).toHaveText("Toutes");
  await expect(page.getByTestId("journal-unread")).toHaveCount(0);

  // Revenir à « tous » retire aussi le bouton.
  await page.getByLabel("Format").selectOption({ index: 1 });
  await expect(reset).toBeVisible();
  await page.getByLabel("Format").selectOption("");
  await expect(reset).toHaveCount(0);

  // Plus de parties à la demande : le clavier reprend à la première ligne ajoutée.
  const shown = await line.count();
  if (rows.length > shown) {
    const more = page.getByRole("button", { name: /de plus$/ });
    await more.focus();
    await more.press("Enter");
    await expect(line).toHaveCount(Math.min(rows.length, shown * 2));
    await expect(page.locator(":focus")).toHaveAttribute("href", replayUrl(rows[shown]?.id ?? ""));
  }
  await expect(page.getByTestId("map-names-credit")).toBeVisible();
  await expect(page.locator("footer").getByRole("link", { name: "Dernières parties" })).toHaveAttribute("href", /\/parties$/);
  expect(apiCalls).toEqual([]);
});

test("réessayer de charger le journal garde la place du clavier", async ({ page }) => {
  await page.route("**/parties.json", (route) => route.fulfill({ status: 500, body: "panne" }));
  await page.goto("/parties");
  const retry = page.getByRole("button", { name: "Réessayer" });
  await retry.focus();
  await retry.press("Enter");
  await expect(page.locator(":focus")).toHaveAttribute("data-testid", "journal-count");
  await expect(retry).toBeVisible();
});

test("sans son fichier, le journal garde ses premières lignes et le signale", async ({ page }) => {
  await page.route("**/parties.json", (route) => route.fulfill({ status: 500, body: "panne" }));
  await page.goto("/parties");
  await expect(page.getByRole("alert").filter({ hasText: "n'a pas pu être chargé" })).toBeVisible();
  await expect(page.locator('[data-testid="journal-row"], [data-testid="journal-card"]').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Défaites", exact: true })).toBeDisabled();
});

test("la gazette montre la semaine en cours, datée et comparée au même moment de la semaine d'avant", async ({ page }) => {
  const meta = loadMeta();
  const week = currentWeek(loadSessions(), meta.sessions.coveredUntil, clan.archiveStart);
  await page.goto("/gazette");
  const block = page.getByTestId("gazette-now");
  if (!week) {
    await expect(block).toHaveCount(0);
    return;
  }
  await expect(block.getByRole("heading")).toHaveText(`Semaine en cours, ${weekLabel(week)}`);
  await expect(block.getByTestId("gazette-now-lead")).toHaveText(currentWeekLead(week));
  const comparison = currentWeekComparison(week);
  if (comparison) await expect(block.getByTestId("gazette-now-comparison")).toHaveText(comparison);
  else await expect(block.getByTestId("gazette-now-comparison")).toHaveCount(0);
  // Jamais donnée pour la semaine entière : la phrase est datée de la collecte.
  await expect(block.getByTestId("gazette-now-lead")).toContainText("Jusqu'au");
});

test("l'accueil donne la belle partie d'hier, calculée et jamais choisie à la main", async ({ page }) => {
  const meta = loadMeta();
  const { rows } = clanJournal({ sessions: loadSessions(), games: loadGames(), coveredUntil: meta.sessions.coveredUntil, tag: clan.tag, officialTags: lb.clans.map((c: { clanTag: string }) => c.clanTag) });
  const best = meta.sessions.coveredUntil ? bestGameOf(rows, yesterdayOf(meta.sessions.coveredUntil)) : null;
  await page.goto("/");
  const block = page.getByTestId("home-best-game");
  if (!best) {
    await expect(block).toHaveCount(0);
    return;
  }
  await expect(block).toHaveText(`La belle partie d'hier. ${bestGameSentence(best)}`);
  // Elle est dans le fil du clan. Le nom de carte vient de la traduction du jeu : son crédit accompagne ce bloc-là.
  if (best.map !== null) await expect(page.getByTestId("home-feed").getByTestId("map-names-credit")).toBeVisible();
});

test("l'accueil nomme les Gaulois de la semaine d'après la dernière gazette, sans rien inventer", async ({ page }) => {
  const meta = loadMeta();
  const sessions = loadSessions();
  const list = loadMembers();
  const weeks = loadMemberWeeks();
  const latest = gazetteEditions({ sessions, history: loadHistory(), territory: loadTerritoryReadings(), weekTops: weeks.tops, members: list, archiveStart: clan.archiveStart, completeThrough: meta.sessions.completeThrough })[0];
  await page.goto("/");
  const block = page.getByTestId("home-week");
  if (!latest) {
    await expect(block).toHaveCount(0);
    return;
  }
  await expect(block.getByTestId("home-week-lead")).toHaveText(editionLead(latest, clan.tag, { standing: false }));
  await expect(block.getByRole("link", { name: "Lire la gazette" })).toHaveAttribute("href", "/gazette");

  // Le podium est celui de la gazette : mêmes joueurs, mêmes victoires. Sa réserve se lit dans la gazette.
  const podium = block.getByTestId("home-podium");
  if (latest.players) {
    const rows = podium.getByTestId("home-podium-player");
    await expect(rows).toHaveCount(latest.players.length);
    for (const [i, player] of latest.players.entries()) {
      await expect(rows.nth(i).getByRole("link")).toHaveText(player.username);
      await expect(rows.nth(i).getByRole("link")).toHaveAttribute("href", `/membres/${encodeURIComponent(player.id)}`);
      await expect(rows.nth(i)).toContainText(fmtCount(player.wins, "victoire"));
    }
  } else {
    await expect(podium).toHaveCount(0);
  }
  // Les plus actifs : seulement si la semaine a relevé les parties. Sinon, rien, et surtout pas un zéro.
  const active = block.getByTestId("home-active-player");
  await expect(active).toHaveCount(latest.players ? (latest.active?.length ?? 0) : 0);
  for (const [i, player] of (latest.players ? (latest.active ?? []) : []).entries()) await expect(active.nth(i)).toContainText(fmtCount(player.games, "partie"));

  // Les paliers : ceux de la semaine en cours s'il y en a, sinon ceux de la gazette. Sans palier franchi, la ligne n'existe pas.
  const crossed = homeMilestones(milestonesSinceMonday(weeks.reading, list), latest.milestones);
  const milestones = block.getByTestId("home-feed-milestones");
  if (crossed) {
    // La semaine en cours est datée par ses deux relevés ; celle de la gazette porte la période de son podium.
    const period = playersPeriod(latest);
    await expect(milestones).toContainText(crossed.when === "current" ? currentMilestonesPeriod(crossed.since, crossed.until) : period && period !== "de la semaine" ? period : `la semaine ${weekLabel(latest)}`);
    await expect(milestones.getByRole("link")).toHaveCount(crossed.groups.reduce((n, group) => n + group.players.length, 0));
    for (const group of crossed.groups) await expect(milestones).toContainText(fmtCount(group.tier, "victoire"));
  } else {
    await expect(milestones).toHaveCount(0);
  }

  // Les records du clan : ceux que la page Records signale, et eux seuls, avec le lien vers cette page.
  const lines = recentRecordLines(clanRecords(sessions), meta.sessions.coveredUntil);
  const records = block.getByTestId("home-feed-records");
  if (lines.length > 0) {
    for (const line of lines) await expect(records).toContainText(line.slice(1));
    expect(await records.textContent()).not.toMatch(/\.\./);
    await expect(block.getByRole("link", { name: "Voir les records" })).toHaveAttribute("href", "/records");
  } else {
    await expect(records).toHaveCount(0);
    await expect(block.getByRole("link", { name: "Voir les records" })).toHaveCount(0);
  }
  // Le plus grand territoire est un chiffre de la carte des clans : sa propre ligne, qui renvoie à la page Carte.
  const film = loadClanMapFilm();
  const territory = recentTerritoryRecord(film?.galSummary?.peak ?? null, film?.fetchedAt ?? null);
  const peak = block.getByTestId("home-feed-territory");
  if (territory) {
    await expect(peak).toContainText(territory);
    await expect(peak).not.toContainText("Record du clan");
    await expect(peak.getByRole("link", { name: "carte des clans" })).toHaveAttribute("href", "/carte");
    expect(await peak.textContent()).not.toMatch(/\.\./);
  } else {
    await expect(peak).toHaveCount(0);
  }

  // Les arrivées : le nombre de la gazette, jamais un zéro écrit.
  const arrivals = block.getByTestId("home-feed-arrivals");
  if (latest.arrivals && latest.arrivals.count > 0) {
    expect(digits((await arrivals.locator("strong").textContent())?.split("arrivée")[0] ?? "")).toBe(String(latest.arrivals.count));
    // Le périmètre du chiffre reste écrit : seuls ceux encore dans le clan sont comptés.
    await expect(arrivals).toContainText("encore dans le clan");
    if (latest.arrivals.named[0]) await expect(arrivals).toContainText(latest.arrivals.named[0]);
  } else {
    await expect(arrivals).toHaveCount(0);
  }
});

test("la gazette donne les plus actifs et les paliers franchis quand la semaine les a relevés, et rien sinon", async ({ page }) => {
  const meta = loadMeta();
  const latest = gazetteEditions({ sessions: loadSessions(), history: loadHistory(), territory: loadTerritoryReadings(), weekTops: loadMemberWeeks().tops, members: loadMembers(), archiveStart: clan.archiveStart, completeThrough: meta.sessions.completeThrough })[0];
  if (!latest) return;
  await page.goto("/gazette");
  const players = page.getByTestId("gazette-latest").getByTestId("gazette-players");
  await expect(players.getByTestId("gazette-active")).toHaveCount(latest.active?.length ?? 0);
  if (latest.active) await expect(players).toContainText("Les plus actifs");
  else await expect(players).not.toContainText("Les plus actifs");
  // Sans palier relevé, ou sans palier franchi, rien ne s'affiche : pas de liste vide.
  if (latest.milestones === null || latest.milestones.length === 0) {
    await expect(players).not.toContainText("Paliers franchis");
  } else {
    await expect(players.getByTestId("gazette-milestone")).toHaveCount(latest.milestones.length);
    await expect(players).toContainText(latest.milestones[0]!.username);
  }
});

test("un record qui vient de tomber est marqué sur la page Records et dans la gazette, jamais inventé", async ({ page }) => {
  const sessions = loadSessions();
  const meta = loadMeta();
  const records = clanRecords(sessions);
  await page.goto("/records");
  await expect(page.getByTestId("clan-record-new")).toHaveCount(recentRecordKeys(records, meta.sessions.coveredUntil).size);
  const history = loadHistory();
  const editions = gazetteEditions({ sessions, history, territory: loadTerritoryReadings(), weekTops: loadMemberWeeks().tops, members: loadMembers(), archiveStart: clan.archiveStart, completeThrough: meta.sessions.completeThrough });
  const latest = editions[0];
  if (!latest) return;
  await page.goto("/gazette");
  await expect(page.getByTestId("gazette-latest").getByTestId("gazette-record")).toHaveCount(weekRecordKeys(latest.highlights, records).size);
});

test("la page Records cite les joueurs qui détiennent un record, avec leurs chiffres, et aucune photo pour un visiteur", async ({ page }) => {
  const records = playerRecords(loadMemberWeeks(), loadMembers());
  const shown = [
    records.bestWeek && { value: fmtCount(records.bestWeek.value, "victoire"), holders: records.bestWeek.holders },
    records.busiestWeek && { value: fmtCount(records.busiestWeek.value, "partie"), holders: records.busiestWeek.holders },
    records.mostWins && { value: fmtCount(records.mostWins.value, "victoire"), holders: records.mostWins.holders },
  ].filter((r) => r !== null);
  await page.goto("/records");
  // La couverture des semaines reste écrite ; le périmètre et la réserve sur le niveau sont dans le repli.
  if (shown.length > 0) await expect(page.getByTestId("player-records-scope")).toContainText("ce n'est pas un classement de niveau");
  if (shown.length > 0 && records.firstDay) await expect(page.getByTestId("player-records-weeks")).toBeVisible();
  const tiles = page.getByTestId("player-record");
  await expect(tiles).toHaveCount(shown.length);
  for (const [i, record] of shown.entries()) {
    const tile = tiles.nth(i);
    await expect(tile).toContainText(record.value);
    for (const holder of record.holders) {
      if (holder.username) await expect(tile.getByRole("link", { name: holder.username, exact: true })).toHaveAttribute("href", `/membres/${encodeURIComponent(holder.id)}`);
      else await expect(tile).toContainText("un membre sans pseudo public");
    }
  }
  // Les photos Discord ne sont jamais écrites dans une page publiée : un visiteur ne voit que des emplacements vides et masqués.
  for (const path of ["/records", "/", "/membres", "/gazette"]) {
    await page.goto(path);
    await expect(page.locator("[data-face] img")).toHaveCount(0);
    await expect(page.locator(".face-slot[data-face]").filter({ visible: true })).toHaveCount(0);
  }
});

test("la gazette donne le bilan de la dernière semaine complète, et n'invente pas ce qui manque", async ({ page }) => {
  const history = loadHistory();
  const editions = gazetteEditions({ sessions: loadSessions(), history, territory: loadTerritoryReadings(), weekTops: loadMemberWeeks().tops, members: loadMembers(), archiveStart: clan.archiveStart, completeThrough: loadMeta().sessions.completeThrough });
  const latest = editions[0];
  if (!latest) throw new Error("La gazette devrait avoir au moins une semaine complète.");

  await page.goto("/gazette");
  const block = page.getByTestId("gazette-latest");
  await expect(block.getByRole("heading", { level: 2 })).toHaveText(`Semaine ${weekLabel(latest)}`);
  await expect(block.getByTestId("gazette-lead")).toHaveText(editionLead(latest, clan.tag));
  expect(digits(await block.getByTestId("gazette-totals").locator("p").first().textContent())).toBe(String(latest.totals.games));
  await expect(block.getByTestId("gazette-totals")).toContainText(fmtCount(latest.totals.wins, "victoire"));
  await expect(page.getByTestId("gazette-older")).toHaveCount(editions.length - 1);
  // Les dernières éditions d'abord ; les plus anciennes restent dans la page, repliées ensemble, et s'ouvrent d'un geste.
  const olderCount = editions.length - 1;
  const ancient = page.getByTestId("gazette-ancient");
  if (olderCount > GAZETTE_RECENT_EDITIONS) {
    await expect(ancient.getByTestId("gazette-older")).toHaveCount(olderCount - GAZETTE_RECENT_EDITIONS);
    await expect(page.getByTestId("gazette-older").nth(GAZETTE_RECENT_EDITIONS - 1)).toBeVisible();
    await expect(page.getByTestId("gazette-older").nth(olderCount - 1)).toBeHidden();
    await ancient.locator("summary").first().click();
    await expect(page.getByTestId("gazette-older").nth(olderCount - 1)).toBeVisible();
  } else {
    await expect(ancient).toHaveCount(0);
  }
  await expect(page.getByTestId("data-status").first()).toContainText("Dernière mise à jour");
  // Les mois abrégés finissent déjà par un point : aucune phrase ne doit en avoir deux. Les pseudos, eux, sont libres.
  for (const part of ["gazette-lead", "gazette-totals", "gazette-standing", "gazette-territory", "gazette-highlights"]) {
    expect(await block.getByTestId(part).textContent()).not.toMatch(/\.\./);
  }

  // Un relevé qui n'existe pas s'écrit « Pas de données », jamais zéro.
  const standing = block.getByTestId("gazette-standing");
  if (latest.standing) {
    await expect(standing).toContainText(rankWords(latest.standing.end.rank));
    for (const line of standingDetails(latest.standing)) await expect(standing).toContainText(line);
    await expect(standing).toContainText("90 jours glissants");
  } else {
    await expect(standing).toContainText("Pas de données");
  }
  const territory = block.getByTestId("gazette-territory");
  if (latest.territory) {
    expect(digits(await territory.locator("p").first().textContent())).toBe(String(latest.territory.end.pixels));
    for (const line of territoryDetails(latest.territory)) await expect(territory).toContainText(line);
  } else {
    await expect(territory).toContainText("Pas de données");
  }
  // Les joueurs de la semaine, ou « Pas de données » : jamais un classement inventé.
  const players = block.getByTestId("gazette-players");
  if (latest.players) {
    await expect(players.getByTestId("gazette-player")).toHaveCount(latest.players.length);
    await expect(players).toContainText(latest.players[0]!.username);
    // La réserve sur le niveau reste dans l'édition, avec les autres précisions repliées.
    await expect(block.getByTestId("reading-note")).toContainText("d'abord le temps de jeu");
  } else {
    await expect(players).toContainText("Pas de données");
  }
  const arrivals = block.getByTestId("gazette-arrivals");
  if (latest.arrivals) {
    expect(digits(await arrivals.locator("p").first().textContent())).toBe(String(latest.arrivals.count));
    await expect(arrivals).toContainText("Encore dans le clan");
  } else {
    await expect(arrivals).toContainText("Pas de données");
  }

  // On y arrive par le menu, l'accueil et le pied de page.
  await expect(page.locator("footer").getByRole("link", { name: "La gazette", exact: true })).toHaveAttribute("href", /\/gazette$/);
  await page.goto("/");
  // Le résumé de la gazette sur l'accueil est le bloc « Les Gaulois de la semaine ».
  const home = page.getByTestId("home-week");
  await expect(home).toContainText(editionLead(latest, clan.tag, { standing: false }));
  await home.getByRole("link", { name: "Lire la gazette" }).click();
  await expect(page).toHaveURL(/gazette/);
});

test.describe("fiches des membres", () => {
  const roster = loadMembers()?.members ?? [];
  const named = roster.filter((m) => m.username && m.publicId);
  const active = [...named].sort((a, b) => (gamesOf(b) ?? 0) - (gamesOf(a) ?? 0))[0];
  const idle = named.find((m) => gamesOf(m) === 0);
  // Le mot le plus long, pas le pseudo le plus long : c'est lui qui peut faire déborder la page.
  const widestWord = (name: string | null) => Math.max(...(name ?? "").split(" ").map((word) => word.length));
  const longest = [...named].sort((a, b) => widestWord(b.username) - widestWord(a.username))[0];

  test("une fiche reprend les stats d'équipe du membre, et n'est pas indexée", async ({ page }) => {
    if (!active?.team) throw new Error("Il faudrait au moins un membre avec une partie sous le tag.");
    await page.goto(`/membres/${active.publicId}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(active.username ?? "");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
    const stats = page.getByTestId("member-stat");
    await expect(stats).toHaveCount(4);
    expect(digits(await stats.nth(0).locator("dd").textContent())).toBe(String(active.team.wins));
    expect(digits(await stats.nth(1).locator("dd").textContent())).toBe(String(active.team.losses));
    expect(digits(await stats.nth(2).locator("dd").textContent())).toBe(String(gamesOf(active)));
    await expect(page.getByTestId("member-stats")).toContainText("sans le classé");

    // Ni heure ni statistique d'un autre mode : le jour, la carte, le format et le résultat.
    const recent = loadMemberGames()[active.publicId ?? ""];
    const title = recent ? recentGamesTitle(recent, gamesOf(active) ?? 0) : null;
    const block = page.getByTestId("member-recent");
    if (recent && title) {
      await expect(block.getByTestId("member-recent-title")).toHaveText(title);
      await expect(block.getByTestId("member-game")).toHaveCount(recent.recent.length);
      expect(await block.locator("table").textContent()).not.toMatch(/\d{1,2}[:h]\d{2}/);
      await expect(block.getByTestId("map-names-credit")).toContainText("CC BY-SA 4.0");
    } else {
      await expect(block).toContainText("Pas de données");
      await expect(block.getByTestId("member-game")).toHaveCount(0);
    }
    await expect(page.getByRole("link", { name: "Son profil sur OpenFront" })).toHaveAttribute("href", `https://openfront.io/#modal=profile&publicID=${active.publicId}`);
    await page.getByRole("link", { name: "Retour à la liste" }).click();
    await expect(page).toHaveURL(/\/liste\/?$/);
  });

  test("un membre sans partie sous le tag n'a pas de faux zéro", async ({ page }) => {
    if (!idle) return;
    await page.goto(`/membres/${idle.publicId}`);
    await expect(page.getByTestId("member-no-game")).toHaveText("Aucune partie sous le tag");
    await expect(page.getByTestId("member-stat")).toHaveCount(0);
    await expect(page.getByTestId("member-recent")).toHaveCount(0);
  });

  test("le tableau des membres mène à la fiche, et un anonyme n'en a pas", async ({ page }) => {
    await page.goto("/liste");
    await hydrated(page);
    const link = page.getByRole("link", { name: active?.username ?? "", exact: true }).filter({ visible: true }).first();
    await expect(link).toHaveAttribute("href", new RegExp(`/membres/${active?.publicId}$`));
    expect(existsSync("dist/membres")).toBe(true);
    const pages = readdirSync("dist/membres").filter((name) => name !== "index.html");
    expect(pages.sort()).toEqual(named.map((m) => m.publicId).sort());
  });

  test("seuls les membres avec pseudo ont des parties gardées", () => {
    const ids = new Set(named.map((m) => m.publicId));
    expect(Object.keys(loadMemberGames()).filter((id) => !ids.has(id))).toEqual([]);
  });

  for (const width of [360, 375, 768, 1024, 1280, 1920]) {
    test(`la fiche au mot le plus long ne fait pas défiler la page à ${width} px`, async ({ page }) => {
      if (!longest) throw new Error("Il faudrait au moins un membre avec un pseudo.");
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/membres/${longest.publicId}`);
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    });
  }
  test("une fiche passe le contrôle d'accessibilité", async ({ page }) => {
    await page.goto(`/membres/${active?.publicId}`);
    await page.waitForLoadState("networkidle");
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});

test("signale les données périmées au visiteur", async ({ page }) => {
  await page.clock.setFixedTime(new Date(Date.now() + 10 * 86_400_000));
  await page.goto("/classement");
  // La page peut suivre deux jeux de données, le classement et le classé : chacun a son message. Celui-ci est celui du classement.
  await expect(page.getByTestId("data-status").first().getByText(/Données périmées : dernière mise à jour il y a \d+ jours/)).toBeVisible();
});

test("affiche une erreur si la liste des membres ne charge pas", async ({ page }) => {
  await page.route("**/data/members.json", (r) => r.abort());
  await page.goto("/liste");
  await expect(page.getByRole("alert")).toContainText("n'a pas pu être chargée");
  await page.unroute("**/data/members.json");
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByTestId("member-count")).toBeVisible();
});

// Les pages de l'encadrement ont leurs propres couleurs, le thème rouge : leurs contrastes sont contrôlés aussi.
for (const path of [...PAGES, "/direction"]) {
  test(`accessibilité WCAG AA : ${path}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await openFolds(page);
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ; ")}`)).toEqual([]);
  });
}

// 360 : une largeur courante de téléphone. 1024 : là où le décor de /rejoindre élargissait la page.
for (const width of [360, 375, 768, 1024, 1280, 1920]) {
  test(`aucun défilement horizontal à ${width} px`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Largeurs testées une seule fois.");
    await page.setViewportSize({ width, height: 900 });
    for (const path of [...PAGES, "/confidentialite", "/carte-monde/"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await openFolds(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} à ${width} px`).toBeLessThanOrEqual(0);
    }
  });
}

// L'AGPL et les conditions d'OpenFront, voir NOTICE.md : le code et la mention restent accessibles sur toutes les pages.
// La loi du 21 juin 2004 (article 1-1) : les mentions légales aussi.
test("chaque page donne le code source, la mention d'OpenFront et les mentions légales", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Même pied de page sur mobile.");
  for (const path of [...PAGES, "/confidentialite", "/compte", "/direction"]) {
    await page.goto(path);
    const footer = page.locator("footer");
    await expect(footer.getByRole("link", { name: "Code source", exact: true }), path).toHaveAttribute("href", "https://github.com/les-gaulois/les-gaulois.github.io");
    await expect(footer, path).toContainText("© OpenFront and Contributors");
    await expect(footer.getByRole("link", { name: "Mentions légales", exact: true }), path).toHaveAttribute("href", "/mentions-legales");
  }
});

// Version anonyme choisie par le pilote (article 1-1, II) : l'éditeur n'est pas nommé, l'hébergeur l'est.
test("les mentions légales nomment l'hébergeur, sans identité de l'éditeur", async ({ page }) => {
  await page.goto("/");
  await page.locator("footer").getByRole("link", { name: "Mentions légales", exact: true }).click();
  await expect(page).toHaveURL(/\/mentions-legales\/?$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mentions légales");
  const legal = page.getByTestId("legal");
  await expect(legal).toContainText("édité à titre non professionnel par un particulier qui garde l'anonymat");
  for (const line of ["GitHub, Inc.", "88 Colin P. Kelly Jr. St.", "San Francisco, CA 94107, États-Unis"]) await expect(legal).toContainText(line);
  await expect(legal.getByRole("link", { name: "Discord du clan" })).toHaveAttribute("href", clan.links.discord);
  // Ces tests tournent sans serveur : Supabase n'héberge alors rien, et n'est pas cité.
  await expect(legal).not.toContainText("Supabase");
  // La page autonome de la carte du monde a son propre pied de page : le lien y est aussi.
  await page.goto("/carte-monde/");
  await page.locator("footer").getByRole("link", { name: "Mentions légales", exact: true }).click();
  await expect(page).toHaveURL(/\/mentions-legales\/?$/);
});

test("navigation au clavier : lien d'évitement et focus visible", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Clavier testé sur desktop.");
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Aller au contenu" });
  await expect(skip).toBeFocused();
  const outline = await skip.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).toBe("solid");
});
