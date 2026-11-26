// Les résultats : classement, classé, rivaux et comparateur, records, gazette, journal des parties, progression, carte World.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { clan } from "../../config/clan";
import { worldTerritory } from "../../src/lib/carte-monde";
import { loadClanMapFilm, loadTerritoryReadings, loadGames, loadHistory, loadMemberResults, loadMembers, loadMemberWeeks, loadMeta, loadRivals, loadSessions } from "../../src/lib/data";
import { fmtCount, fmtDateTime, fmtGap, fmtInt, fmtRank, fmtScore } from "../../src/lib/format";
import type { LeaderboardEntry } from "../../src/lib/schemas";
import { withOfficialRanks } from "../../src/lib/stats";
import { firstRival } from "../../src/lib/compare";
import { rivalSeries } from "../../src/lib/rivals";
import { faceOffs } from "../../src/lib/games";
import { GAZETTE_RECENT_EDITIONS, gazetteEditions, rankWords, standingDetails, territoryDetails, weekLabel } from "../../src/lib/gazette";
import { clanJournal, JOURNAL_FIRST_ROWS, journalChoices, journalCount, NO_FILTER, replayUrl } from "../../src/lib/journal";
import { recentRecordKeys, weekRecordKeys } from "../../src/lib/records-battus";
import { playerPodiums, podiumDates } from "../../src/lib/podiums";
import { playerRecords } from "../../src/lib/records-joueurs";
import { clanRecords } from "../../src/lib/results";
import { currentWeek, currentWeekComparison, currentWeekLead } from "../../src/lib/semaine";
import { mapLabel } from "../../src/lib/map-names";
import { lb, gal, digits, hydrated, raceTags, occurrences } from "./outils-site";

test("la carte World se trouve depuis la page Carte", async ({ page }) => {
  await page.goto("/carte");
  await expect(page.getByRole("link", { name: "La carte « World »", includeHidden: true })).toHaveAttribute("href", /\/carte-monde\/$/);
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

test("le classé ne publie que des décomptes, à part du classement des clans", async ({ page }) => {
  await page.goto("/membres");
  const block = page.getByTestId("ranked-block");
  const panels = block.getByTestId("ranked-mode");
  if (!existsSync("data/ranked.json")) {
    await expect(panels).toHaveCount(0);
    return;
  }
  const ranked = JSON.parse(readFileSync("data/ranked.json", "utf8"));
  // Ses précisions sont dans le repli unique de la page, sous son nom.
  const note = page.getByTestId("reading-note").locator('[data-note-bloc="Membres présents au classé"]');
  await expect(note).toContainText("ne compte pas dans le score du clan");
  await expect(note).toContainText("ces nombres sont donc des minimums");
  await expect(panels).toHaveCount(3);
  for (const [i, key] of ["1v1", "2v2", "ffa"].entries()) {
    const mode = ranked.modes[key];
    expect(digits(await panels.nth(i).getByTestId("ranked-members").textContent())).toBe(String(mode.members));
    expect(digits(await panels.nth(i).getByTestId("ranked-top").textContent())).toBe(`${mode.top}10`);
  }
  // Aucun nom ni chiffre individuel : ni lien de profil, ni tableau de joueurs.
  await expect(block.getByRole("link")).toHaveCount(0);
  await expect(block.getByRole("table")).toHaveCount(0);
  // Sa date est dans l'en-tête de la page, la seule de la page.
  await expect(page.getByTestId("data-status")).toHaveCount(1);
  await expect(page.getByTestId("data-status")).toContainText(fmtDateTime(loadMeta().ranked.lastSuccessAt ?? ""));
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
  await expect(page.getByTestId("reading-note").locator('[data-note-bloc="La course avec nos voisins"]')).toContainText("L'API ne donne pas le passé du classement");
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
  await expect(page.getByTestId("reading-note").locator('[data-note-bloc="Les records du clan"]')).toContainText("n'est pas comptée");
  for (const gone of ["format-results", "map-results"]) await expect(page.getByTestId(gone)).toHaveCount(0);
});

test("les podiums des Gaulois reprennent les chiffres calculés, chaque joueur menant à sa fiche", async ({ page }) => {
  const podiums = playerPodiums(loadMemberResults(), loadSessions(), loadMembers(), loadMeta().sessions.coveredUntil);
  await page.goto("/records");
  const block = page.getByTestId("player-podiums");
  await expect(block.getByRole("heading", { level: 2 })).toHaveText("Les podiums des Gaulois");
  // Leur date est dans l'en-tête de la page, avec celles des autres blocs.
  await expect(page.getByTestId("data-status")).toContainText(fmtDateTime(loadMeta().memberResults.lastSuccessAt ?? ""));
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
  // La période reste écrite ; le périmètre et la réserve sur le niveau sont dans le repli de la page, sous le nom du bloc.
  await expect(block.getByTestId("podiums-period")).toBeVisible();
  await expect(page.getByTestId("reading-note").locator('[data-note-bloc="Les podiums des Gaulois"]')).toContainText("ce n'est pas un classement de niveau");
});

test("le face-à-face ne reste que dans le comparateur, avec sa méthode, sa date, ses chiffres et sa suspension", async ({ page }) => {
  const result = faceOffs(loadSessions(), loadGames(), clan.tag, lb.clans.map((c: { clanTag: string }) => c.clanTag), loadMeta().sessions.coveredUntil);
  await page.goto("/rivaux");
  await expect(page.getByTestId("face-offs")).toHaveCount(0);
  // Sa méthode est dans le repli unique de la page ; la date du détail des parties, dans son en-tête.
  await expect(page.getByTestId("reading-note").getByTestId("compare-notes")).toContainText("L'API ne donne pas l'équipe des perdants");
  await expect(page.getByTestId("data-status")).toHaveCount(1);
  await expect(page.getByTestId("data-status")).toContainText(fmtDateTime(loadMeta().games.lastSuccessAt ?? ""));
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

test("à l'ouverture de Nos rivaux, l'écart avec le premier voisin n'est écrit qu'une fois", async ({ page }) => {
  const clans = withOfficialRanks(lb.clans as LeaderboardEntry[]);
  const me = clans.find((c) => c.clanTag === clan.tag);
  const rival = firstRival(clans, clan.tag);
  if (!me || !rival) throw new Error("La liste devrait contenir le clan et un voisin.");
  // La course écrit l'écart de son dernier relevé ; sans relevé, seul le comparateur l'écrit, d'après le classement.
  const series = rivalSeries(lb.clans as LeaderboardEntry[], loadRivals(), clan.tag)?.find((s) => s.clanTag === rival.clanTag);
  const gap = series?.points.findLast((p) => p.value !== null)?.value ?? me.weightedWins - rival.weightedWins;
  await page.goto("/rivaux");
  await hydrated(page);
  await expect(page.getByTestId("compare-table").locator("thead")).toContainText(`[${rival.clanTag}]`);
  expect(occurrences(await page.locator("main").innerText(), fmtScore(Math.abs(gap)))).toBe(1);
});

test("le comparateur met côte à côte deux clans de la liste officielle, sans redire l'écart que la course écrit déjà", async ({ page }) => {
  const clans = withOfficialRanks(lb.clans as LeaderboardEntry[]);
  const me = clans.find((c) => c.clanTag === clan.tag);
  const above = clans[(me?.rank ?? 2) - 2];
  const other = clans.at(-1);
  if (!me || !above || !other) throw new Error("La liste devrait contenir le clan et ses voisins.");
  const inRace = raceTags();
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
  // L'écart n'est dit qu'une fois dans la page : un clan qui a sa courbe dans la course y renvoie, sans écart ni courbe ici.
  const checkGap = async (rival: { clanTag: string; weightedWins: number }) => {
    const gap = fmtGap(me.weightedWins - rival.weightedWins);
    if (inRace.includes(rival.clanTag.toUpperCase())) {
      await expect(block.getByTestId("compare-gap")).toHaveCount(0);
      await expect(block.getByTestId("compare-gap-race")).toContainText(`[${rival.clanTag}]`);
      await expect(block.getByTestId("compare-gap-race").getByRole("link", { name: "la course avec nos voisins" })).toHaveAttribute("href", "#race-title");
      await expect(page.locator("#race-title")).toHaveCount(1);
      await expect(block.getByRole("heading", { name: /^Écart de score avec/ })).toHaveCount(0);
      await expect(block.getByTestId("compare-gap-table")).toHaveCount(0);
    } else {
      await expect(block.getByTestId("compare-gap-race")).toHaveCount(0);
      await expect(block.getByTestId("compare-gap")).toContainText(gap);
      // La courbe, sous ce titre, ne redit pas l'écart : sa ligne ne garde que la date de la dernière mesure.
      if (existsSync("data/rivals") && readdirSync("data/rivals").length > 0) await expect(block.getByRole("heading", { name: `Écart de score avec [${rival.clanTag}], jour après jour` })).toBeVisible();
      expect(occurrences(await block.innerText(), gap)).toBe(1);
    }
  };
  await checkRows(above.clanTag, above.weightedWins, above.games);
  await checkGap(above);

  await block.getByLabel("Clan à comparer").selectOption(other.clanTag);
  await checkRows(other.clanTag, other.weightedWins, other.games);
  await checkGap(other);
  await expect(block.getByTestId("compare-row").first().locator("td").nth(1)).toHaveText(fmtRank(other.rank));

  // Le clan lui-même ne se compare pas à lui-même.
  await expect(block.getByLabel("Clan à comparer").locator(`option[value="${clan.tag}"]`)).toHaveCount(0);
});

test("dès deux relevés, le comparateur double sa courbe d'un tableau", async ({ page }) => {
  // Ces deux dates ne servent qu'à ce test, sur un fichier remplacé à la volée : le premier jour de la collecte, il n'y avait qu'un relevé.
  const clans = withOfficialRanks(lb.clans as LeaderboardEntry[]);
  const me = clans.find((c) => c.clanTag === clan.tag);
  // Un clan qui n'a pas de courbe dans la course : le comparateur trace la sienne.
  const inRace = raceTags();
  const far = clans.find((c) => c.clanTag !== clan.tag && !inRace.includes(c.clanTag.toUpperCase()));
  if (!me || !far) throw new Error("La liste devrait contenir le clan et un clan hors de la course.");
  await page.route("**/classement-scores.json", (route) =>
    route.fulfill({ json: { dates: ["2026-11-07", "2026-11-08"], scores: { [me.clanTag]: [100, 120], [far.clanTag]: [150, 110] } } }),
  );
  await page.goto("/rivaux");
  await hydrated(page);
  await page.getByTestId("clan-compare").getByLabel("Clan à comparer").selectOption(far.clanTag);
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
  // Thème clair du 14 novembre 2026 : le filtre actif est marine, son texte blanc.
  await expect(active).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(active).toHaveCSS("background-color", "rgb(10, 18, 48)");
});

test("sans le fichier des scores, le comparateur garde ses chiffres et le signale", async ({ page }) => {
  await page.route("**/classement-scores.json", (route) => route.fulfill({ status: 500, body: "panne" }));
  // La courbe manquante est celle d'un clan hors de la course : celle d'un voisin est dans la course, pas ici.
  const inRace = raceTags();
  const far = withOfficialRanks(lb.clans as LeaderboardEntry[]).find((c) => c.clanTag !== clan.tag && !inRace.includes(c.clanTag.toUpperCase()));
  if (!far) throw new Error("La liste devrait contenir un clan hors de la course.");
  await page.goto("/rivaux");
  const block = page.getByTestId("clan-compare");
  await block.scrollIntoViewIfNeeded();
  await hydrated(page);
  await block.getByLabel("Clan à comparer").selectOption(far.clanTag);
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

test("le journal montre les dernières parties, avec leur replay et des filtres", async ({ page }, testInfo) => {
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
  // Un seul lien par partie (revue du 18 novembre 2026) : « Revoir » sur le site s'il existe, sinon « Sur OpenFront ».
  expect(html.match(/data-testid="journal-(?:replay|film)"/g)?.length).toBe(2 * Math.min(rows.length, JOURNAL_FIRST_ROWS));

  // Un tag se choisit librement : la page et son fichier ne citent que la liste officielle.
  const published = (await (await page.request.get("/parties.json")).json()) as { rivals: [string, number][]; allies: [string, number][] }[];
  expect(published).toHaveLength(rows.length);
  for (const tag of new Set(published.flatMap((r) => [...r.rivals, ...r.allies].map(([t]) => t)))) expect(official).toContain(tag);

  await hydrated(page);
  const count = page.getByTestId("journal-count");
  await expect(count).toContainText(journalCount(rows, NO_FILTER));
  const lienDeLaLigne = line.first().locator('[data-testid="journal-replay"], [data-testid="journal-film"]');
  await expect(lienDeLaLigne).toHaveCount(1);
  expect([replayUrl(first.id), `/revoir?partie=${encodeURIComponent(first.id)}`]).toContain(await lienDeLaLigne.getAttribute("href"));
  // Le lien, seule commande d'une carte sur téléphone : une cible de 44 px de haut pour le doigt, 24 px au moins dans le
  // tableau (WCAG 2.5.8). Sa marge négative rend la place : une ligne du tableau garde la hauteur d'une ligne de texte.
  const cible = (await lienDeLaLigne.boundingBox())!;
  expect(Math.round(cible.height)).toBeGreaterThanOrEqual(testInfo.project.name === "mobile" ? 44 : 24);
  expect(Math.round(cible.width)).toBeGreaterThanOrEqual(testInfo.project.name === "mobile" ? 44 : 24);
  if (testInfo.project.name === "desktop") {
    const sansLien = await line.first().evaluate((tr) => {
      const lien = tr.querySelector<HTMLElement>('[data-testid="journal-replay"], [data-testid="journal-film"]');
      const avant = tr.getBoundingClientRect().height;
      if (lien) lien.style.display = "none";
      const apres = tr.getBoundingClientRect().height;
      if (lien) lien.style.display = "";
      return { avant, apres };
    });
    expect(sansLien.avant).toBeCloseTo(sansLien.apres, 0);
  }
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
  // Chaque chiffre n'est dit qu'une fois : plus de phrase d'introduction qui redisait les panneaux (l'accueil garde la sienne).
  await expect(block.getByTestId("gazette-lead")).toHaveCount(0);
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
  for (const part of ["gazette-totals", "gazette-standing", "gazette-territory", "gazette-highlights"]) {
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
    // La réserve sur le niveau reste dans la page, dans le seul repli de précisions, en bas, qui réunit celles de toutes les éditions.
    await expect(block.getByTestId("reading-note")).toHaveCount(0);
    await expect(page.getByTestId("reading-note")).toHaveCount(1);
    await expect(page.getByTestId("reading-note")).toContainText("d'abord le temps de jeu");
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

  // On y arrive par le menu et le pied de page.
  await expect(page.locator("footer").getByRole("link", { name: "La gazette", exact: true })).toHaveAttribute("href", /\/gazette$/);
});
