// L'accueil, Ma place et les nouveautés du site.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { clan } from "../../config/clan";
import { accueilFacts, accueilImageAlt, accueilRanking } from "../../src/lib/accueil-image";
import { GazetteFonts } from "../../src/lib/gazette-image";
import { portraitDuGaulois } from "../../src/lib/gaulois-site";
import { cartesDuPodium, legendeDuPodium } from "../../src/lib/cartes-podium";
import { loadTerritoryReadings, loadHistory, loadMembers, loadMemberWeeks, loadMeta, loadNouveautes, loadSessions } from "../../src/lib/data";
import { fmtCount, fmtScore } from "../../src/lib/format";
import type { LeaderboardEntry } from "../../src/lib/schemas";
import { withOfficialRanks } from "../../src/lib/stats";
import { gazetteEditions, playersPeriod, weekLabel } from "../../src/lib/gazette";
import { placeOf } from "../../src/lib/members";
import { meVisitLines } from "../../src/lib/moi-visite";
import { headlineCount, isForPlayers, latestNews, newsDays, newsMarker, NOUVEAUTES_KEY, splitDays } from "../../src/lib/nouveautes";
import { CHOOSE_NAME_URL } from "../../src/lib/pseudo-openfront";
import { lb, members, hydrated } from "./outils-site";

test("l'accueil n'affiche que des données collectées", async ({ page }) => {
  await page.goto("/");
  // Sans annonce ni événement, le bloc n'existe pas : un visiteur n'a rien à y lire.
  const news = [...JSON.parse(readFileSync("content/announcements.json", "utf8")), ...JSON.parse(readFileSync("content/events.json", "utf8"))];
  if (news.length === 0) await expect(page.getByTestId("news-board")).toHaveCount(0);
  // L'accueil résume et renvoie : la carte, les dernières parties et les créneaux ont leur page, il ne les recopie pas.
  await expect(page.getByRole("heading", { name: /pixels sur la carte|parties en 14 jours|quand jouer|quand le clan joue/i })).toHaveCount(0);

  const clans = withOfficialRanks(lb.clans as LeaderboardEntry[]);
  const me = clans.find((c) => c.clanTag === clan.tag);
  const above = clans[(me?.rank ?? 2) - 2];
  const below = clans[me?.rank ?? 0];
  // Les écarts avec les voisins ont leur page (le classement, Nos rivaux) : l'accueil y renvoie sans les recopier.
  await expect(page.getByTestId("home-race")).toHaveCount(0);
  const ranking = page.locator("#classement-clan");
  for (const near of [above, below]) {
    if (me && near) await expect(ranking).not.toContainText(fmtScore(Math.abs(near.weightedWins - me.weightedWins)));
  }
  if (me && (above || below)) await expect(ranking.getByTestId("home-rivals")).toHaveAttribute("href", /\/rivaux$/);
  await expect(ranking.getByRole("link", { name: "Voir le classement complet" })).toHaveAttribute("href", /\/classement$/);
  // Retirés le 22 novembre 2026, à la demande du pilote : les portes de la Carte et du village, la semaine et l'appel à rejoindre.
  for (const id of ["home-week", "home-map", "home-village", "home-join"]) await expect(page.getByTestId(id)).toHaveCount(0);
});

test("l'accueil donne le classement avant Ma place, et remonte Ma place pour qui a dit « C'est moi »", async ({ page }) => {
  const titles = () => page.locator("main h2").allTextContents();
  const at = (list: string[], text: string) => list.findIndex((t) => t.includes(text));
  await page.goto("/");
  const visitor = await titles();
  expect(at(visitor, "Le clan au classement officiel")).toBeGreaterThanOrEqual(0);
  expect(at(visitor, "Le clan au classement officiel")).toBeLessThan(at(visitor, "Ma place dans le clan"));

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

test.describe("les nouveautés du site", () => {
  const entries = loadNouveautes();
  const marker = newsMarker(entries);
  /** Les points allumés : sur le bouton de l'en-tête, sur le menu du téléphone, ou dans le menu ouvert. */
  const litDots = (page: Page) => page.locator("[data-nouveautes-dot]").filter({ visible: true });

  test("la page trie les mises à jour pour les joueurs, replie les retouches et les jours anciens, et tait celles de l'équipe", async ({ page }) => {
    await page.goto("/nouveautes");
    const items = page.getByTestId("nouveautes-entry");
    const days = newsDays(entries);
    const { shown, folded } = splitDays(days);
    // D'abord, seules les entrées à lire des premiers jours : ni retouche, ni jour ancien.
    await expect(items.filter({ visible: true })).toHaveCount(shown.reduce((n, d) => n + headlineCount(d), 0));
    if (folded.length > 0) await page.getByTestId("nouveautes-older").locator("> summary").click();
    const shownOrder = days.flatMap((d) => d.entries);
    expect(shownOrder.length).toBe(entries.filter(isForPlayers).length);
    await expect(items).toHaveCount(shownOrder.length);
    for (const staff of entries.filter((e) => !isForPlayers(e)).slice(0, 3)) await expect(page.getByRole("heading", { level: 3, name: staff.title, exact: true })).toHaveCount(0);
    // Le pli d'une journée ouvre ses retouches.
    const firstMinor = page.getByTestId("nouveautes-minor").first();
    if ((await firstMinor.count()) > 0) {
      await expect(firstMinor.getByTestId("nouveautes-entry").first()).toBeHidden();
      await firstMinor.locator("summary").click();
      await expect(firstMinor.getByTestId("nouveautes-entry").first()).toBeVisible();
    }
    // Les autres plis s'ouvrent d'un coup : un titre replié n'a pas de rôle à lire.
    await page.evaluate(() => document.querySelectorAll<HTMLDetailsElement>("[data-testid=nouveautes-minor]").forEach((d) => (d.open = true)));
    for (const [i, e] of shownOrder.entries()) {
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
  await expect(result.getByRole("link", { name: named.username, exact: true }).first()).toHaveAttribute("href", new RegExp(`/membres/${named.publicId}$`));

  // Chercher un pseudo ne le retient pas.
  await page.reload();
  await hydrated(page);
  await expect(result).toHaveCount(0);

  // Un pseudo que personne ne porte : le lien pour choisir le sien dans OpenFront.
  await field.fill("zz-aucun-gaulois-zz");
  await expect(page.getByTestId("my-place").getByRole("status")).toContainText("Aucun membre avec ce pseudo");
  await expect(page.getByTestId("my-place").getByTestId("choose-name")).toHaveAttribute("href", CHOOSE_NAME_URL);

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

test("les cartes du podium de l'accueil reprennent la dernière gazette, sans rien inventer", async ({ page }) => {
  const meta = loadMeta();
  const latest = gazetteEditions({ sessions: loadSessions(), history: loadHistory(), territory: loadTerritoryReadings(), weekTops: loadMemberWeeks().tops, members: loadMembers(), archiveStart: clan.archiveStart, completeThrough: meta.sessions.completeThrough })[0];
  await page.goto("/");
  // Les cartes paraissent dès qu'un joueur du podium a son Gaulois relevé (src/lib/cartes-podium.ts) ; sinon, le guerrier reste.
  if (cartesDuPodium(latest?.players, portraitDuGaulois, () => null) === null) {
    await expect(page.getByTestId("hero-podium")).toHaveCount(0);
    return;
  }
  if (!latest?.players) throw new Error("des cartes sans podium");
  // Mêmes joueurs, mêmes victoires, même lien vers la fiche, même période que le podium de la gazette.
  await expect(page.getByTestId("hero-card")).toHaveCount(latest.players.length);
  for (const player of latest.players) {
    const carte = page.locator(`[data-testid="hero-card"][href="/membres/${encodeURIComponent(player.id)}"]`);
    await expect(carte).toHaveCount(1);
    await expect(carte).toContainText(player.username);
    await expect(carte).toContainText(fmtCount(player.wins, "victoire"));
  }
  await expect(page.getByTestId("hero-podium-legende")).toHaveText(legendeDuPodium(playersPeriod(latest), weekLabel(latest)));
});
