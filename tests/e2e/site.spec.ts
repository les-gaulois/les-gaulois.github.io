import { existsSync, readdirSync, readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { clan } from "../../config/clan";
import { worldTerritory } from "../../src/lib/carte-monde";
import { loadClanMapFilm, loadTerritoryReadings, loadGames, loadHistory, loadMemberGames, loadMembers, loadMemberWeeks, loadMeta, loadSessions } from "../../src/lib/data";
import { fmtCount, fmtGap, fmtInt, fmtRank, fmtScore } from "../../src/lib/format";
import type { LeaderboardEntry } from "../../src/lib/schemas";
import { withOfficialRanks } from "../../src/lib/stats";
import { faceOffs, mapResults } from "../../src/lib/games";
import { editionLead, gazetteEditions, rankWords, standingDetails, territoryDetails, weekLabel } from "../../src/lib/gazette";
import { clanJournal, JOURNAL_FIRST_ROWS, journalChoices, journalCount, NO_FILTER, replayUrl } from "../../src/lib/journal";
import { gamesOf, recentGamesTitle } from "../../src/lib/members";
import { mapLabel } from "../../src/lib/map-names";
import { SECTIONS } from "../../src/lib/nav";
import { objectiveFor } from "../../src/lib/clanmap/economy";
import { nextTier, tierOf, tierRows } from "../../src/lib/paliers";

const PAGES = ["/", "/gazette", "/parties", "/classement", "/rivaux", "/progression", "/records", "/membres", "/carte", "/activite", "/debuter", "/outils", "/rejoindre"];
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
  for (const path of ["/compte", "/admin", "/direction"]) {
    await page.goto(path);
    await expect(page.getByTestId("auth-not-open")).toBeVisible();
  }
  expect(calls).toEqual([]);
});

// L'encadrement sait d'un coup d'œil où il est. Le compte d'un membre reste bleu, comme le reste du site.
test("seules les pages de l'encadrement passent au rouge", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Même thème sur mobile.");
  const look = async (path: string) => {
    await page.goto(path);
    return page.evaluate(() => ({
      theme: document.documentElement.dataset.theme ?? null,
      background: getComputedStyle(document.body).backgroundColor,
      bar: document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? "",
    }));
  };
  // La barre du navigateur, sur téléphone, prend le fond de la page.
  const rgbOf = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
  const blue = await look("/");
  expect(blue.theme).toBeNull();
  expect(blue.background).toBe(rgbOf(blue.bar));
  for (const path of ["/admin", "/direction"]) {
    const red = await look(path);
    expect(red.theme, path).toBe("rouge");
    expect(red.background, path).not.toBe(blue.background);
    expect(red.background, path).toBe(rgbOf(red.bar));
  }
  for (const path of [...PAGES, "/compte", "/confidentialite"]) {
    expect(await look(path), path).toEqual(blue);
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
  await expect(page.getByRole("link", { name: "Rejoindre le Discord" })).toHaveAttribute("href", "https://discord.gg/cjUc42T7Y2");
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

  // Membres : liste officielle, anonymes, recherche, tri.
  await page.goto("/membres");
  await hydrated(page);
  await expect(page.getByTestId("member-count")).toContainText(fmtInt(members.total));
  // Trente membres d'abord, le reste d'un clic : la page reste courte sur téléphone.
  const memberRows = page.getByTestId("member-row");
  await expect(memberRows).toHaveCount(Math.min(30, members.members.length));
  if (members.members.length > 30) {
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

  // Activité : la précision obligatoire et la heatmap.
  await page.goto("/activite");
  await expect(page.getByText("Ce sont des parties enregistrées, pas des joueurs connectés.")).toBeVisible();
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
  await expect(page.getByTestId("home-slot").first()).toBeVisible();
  await expect(page.getByTestId("home-games").locator("li")).toHaveCount(5);
  // Les noms de cartes sont sous CC BY-SA : leur crédit accompagne chaque liste.
  await expect(page.getByTestId("map-names-credit")).toBeVisible();

  const clans = withOfficialRanks(lb.clans as LeaderboardEntry[]);
  const me = clans.find((c) => c.clanTag === clan.tag);
  const above = clans[(me?.rank ?? 2) - 2];
  if (me && above) await expect(page.getByTestId("home-race")).toContainText(`${fmtScore(above.weightedWins - me.weightedWins)} de retard sur [${above.clanTag}]`);
  const film = loadClanMapFilm();
  const objective = objectiveFor(film?.standings ?? [], clan.tag);
  if (objective?.above) await expect(page.getByTestId("home-objective")).toContainText(`dépasser [${objective.above.tag}]`);
  await expect(page.getByRole("link", { name: "Lire les guides" })).toHaveAttribute("href", /\/debuter$/);
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

test("ce qui change la lecture d'un chiffre reste visible, hors des précisions repliées", async ({ page }) => {
  await page.goto("/membres");
  await expect(page.getByTestId("members-scope")).toContainText("sans le classé");
  await expect(page.getByTestId("members-scope")).toBeVisible();
  await page.goto("/rivaux");
  await expect(page.getByTestId("compare-rate-note")).toBeVisible();
  await page.goto("/records");
  await expect(page.getByTestId("format-period")).toBeVisible();
  await page.goto("/parties");
  await expect(page.getByTestId("journal-link-note")).toBeVisible();
  await expect(page.getByTestId("journal-link-note")).toContainText("Rejoindre un salon privé");
  await expect(page.getByTestId("journal-sides-note")).toBeVisible();
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

  await page.getByTestId("my-place-forget").click();
  await expect(field).toBeVisible();
  await expect(field).toBeFocused();
  await page.reload();
  await hydrated(page);
  await expect(result).toHaveCount(0);
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

test("les résultats par format donnent le repère du hasard et les records", async ({ page }) => {
  await page.goto("/records");
  const formats = page.getByTestId("format-results");
  await expect(formats.getByTestId("format-row").first()).toContainText("au hasard");
  await expect(formats).toContainText("à 2 équipes, le hasard donne déjà 50 %");
  await expect(page.getByTestId("clan-record")).toHaveCount(4);
  await expect(page.getByTestId("clan-records")).toContainText("n'est pas comptée");
});

// Le détail des parties se lit petit à petit : tant qu'aucune carte ni aucun clan n'atteint son seuil, rien ne s'affiche.
test("les résultats par carte de jeu se comparent aux habitudes du clan et disent ce qui est lu", async ({ page }) => {
  await page.goto("/records");
  const block = page.getByTestId("map-results");
  const results = mapResults(loadSessions(), loadGames(), loadMeta().sessions.coveredUntil);
  if (!results || results.rows.length === 0) {
    await expect(block.getByTestId("map-row")).toHaveCount(0);
    return;
  }
  await expect(block).toContainText("à ne pas confondre avec la carte des clans");
  await expect(block).toContainText("CC BY-SA 4.0");
  await expect(block).toContainText("Dernière mise à jour");
  expect(digits(await block.getByTestId("games-coverage").textContent())).toContain(String(results.coverage.read));
  const signals = results.strong.length + results.weak.length;
  await expect(block.getByTestId("map-row")).toHaveCount(results.rows.length + signals);
  // Aucune carte n'est dite forte ou faible sans écart que le hasard n'explique pas.
  await expect(block.getByTestId("maps-strong").getByTestId("map-row")).toHaveCount(results.strong.length);
  await expect(block.getByTestId("maps-weak").getByTestId("map-row")).toHaveCount(results.weak.length);
  await expect(block.getByTestId("maps-verdict")).toHaveCount(signals === 0 ? 1 : 0);
  const mostPlayed = results.rows[0];
  const row = block.getByTestId("map-row").nth(signals);
  await expect(row).toContainText(mapLabel(mostPlayed?.map ?? ""));
  await expect(row).toContainText(`${fmtCount(mostPlayed?.wins ?? 0, "victoire")} sur ${fmtCount(mostPlayed?.games ?? 0, "partie")} · d'habitude`);
});

test("les face-à-face reprennent les chiffres calculés, sans aucun joueur", async ({ page }) => {
  await page.goto("/rivaux");
  const block = page.getByTestId("face-offs");
  const panels = block.getByTestId("face-off");
  const result = faceOffs(loadSessions(), loadGames(), "GAL", lb.clans.map((c: { clanTag: string }) => c.clanTag), loadMeta().sessions.coveredUntil);
  if (!result?.reliable || result.rows.length === 0) {
    await expect(panels).toHaveCount(0);
    return;
  }
  await expect(block).toContainText("L'API ne donne pas toujours l'équipe des perdants");
  await expect(block).toContainText("Dernière mise à jour");
  await expect(panels).toHaveCount(result.rows.length);
  for (const [i, row] of result.rows.entries()) {
    const panel = panels.nth(i);
    await expect(panel.getByRole("heading")).toHaveText(`[${row.tag}]`);
    expect(digits(await panel.getByTestId("face-off-meetings").textContent())).toBe(String(row.meetings));
    expect(digits(await panel.getByTestId("face-off-ours").textContent())).toBe(String(row.ours));
    expect(digits(await panel.getByTestId("face-off-theirs").textContent())).toBe(String(row.theirs));
    expect(digits(await panel.getByTestId("face-off-others").textContent())).toBe(String(row.others));
  }
  await expect(block.getByRole("link")).toHaveCount(0);
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
  await expect(active).toHaveCSS("color", "rgb(10, 18, 48)");
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
  expect(digits(await page.getByTestId("journal-coverage").textContent())).toContain(String(coverage.read));

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
    await expect(players).toContainText("d'abord le temps de jeu");
  } else {
    await expect(players).toContainText("Pas de données");
  }
  const arrivals = block.getByTestId("gazette-arrivals");
  if (latest.arrivals) {
    expect(digits(await arrivals.locator("p").first().textContent())).toBe(String(latest.arrivals.count));
    await expect(arrivals).toContainText("Seuls les membres encore dans le clan sont comptés");
  } else {
    await expect(arrivals).toContainText("Pas de données");
  }

  // On y arrive par le menu, l'accueil et le pied de page.
  await expect(page.locator("footer").getByRole("link", { name: "La gazette", exact: true })).toHaveAttribute("href", /\/gazette$/);
  await page.goto("/");
  const home = page.getByTestId("home-gazette");
  await expect(home).toContainText(editionLead(latest, clan.tag));
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
    await page.getByRole("link", { name: "Retour aux membres" }).click();
    await expect(page).toHaveURL(/\/membres\/?$/);
  });

  test("un membre sans partie sous le tag n'a pas de faux zéro", async ({ page }) => {
    if (!idle) return;
    await page.goto(`/membres/${idle.publicId}`);
    await expect(page.getByTestId("member-no-game")).toHaveText("Aucune partie sous le tag");
    await expect(page.getByTestId("member-stat")).toHaveCount(0);
    await expect(page.getByTestId("member-recent")).toHaveCount(0);
  });

  test("le tableau des membres mène à la fiche, et un anonyme n'en a pas", async ({ page }) => {
    await page.goto("/membres");
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
  await page.goto("/membres");
  await expect(page.getByRole("alert")).toContainText("n'a pas pu être chargée");
  await page.unroute("**/data/members.json");
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByTestId("member-count")).toBeVisible();
});

// Les pages de l'encadrement ont leurs propres couleurs, le thème rouge : leurs contrastes sont contrôlés aussi.
for (const path of [...PAGES, "/admin", "/direction"]) {
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
test("chaque page donne le code source et la mention d'OpenFront", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Même pied de page sur mobile.");
  for (const path of [...PAGES, "/confidentialite", "/compte", "/admin", "/direction"]) {
    await page.goto(path);
    const footer = page.locator("footer");
    await expect(footer.getByRole("link", { name: "Code source", exact: true }), path).toHaveAttribute("href", "https://github.com/les-gaulois/les-gaulois.github.io");
    await expect(footer, path).toContainText("© OpenFront and Contributors");
  }
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
