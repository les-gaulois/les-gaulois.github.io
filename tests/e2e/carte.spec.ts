import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { changeSinceLastDay, dayHighlights, dayRows, filmDayMarks, parisDayOf } from "../../src/lib/clanmap/days";
import { findMoments, nextThreshold } from "../../src/lib/clanmap/moments";
import { filmResume } from "../../src/lib/clanmap/reprise";
import { fmtDay, fmtEpochDay, fmtEpochHour, fmtInt, fmtRank } from "../../src/lib/format";

/**
 * Sur tous les formats, la carte commence dans le haut de l'écran, juste sous l'en-tête et le titre.
 * Sur téléphone (375 px), sa position dépend de `data/meta.json`, que le robot réécrit à chaque collecte :
 * 133 px d'ordinaire, 171 px si la dernière collecte a échoué, 193 px si les données sont en plus périmées.
 * Ces avertissements sont voulus : une panne doit se signaler. La carte et son bouton de lecture restent alors sur le
 * premier écran. La limite couvre donc ce pire cas, pour que le test ne dépende pas du résultat de la dernière collecte.
 */
const testViewportTitleLimit = 200;
const film = JSON.parse(readFileSync("data/clanmap/film.json", "utf8"));
const lastFrame = film.frames.at(-1);
/** Un film d'avant les dates reste publié jusqu'au passage suivant du robot : ces contrôles l'attendent. */
const datedFilm = film.version >= 4;
/** Ce que le film doit dire de GAL à la fin d'une journée : les chiffres du tableau. */
const galLine = (day: { pixels: number; rank: number | null }) => (day.rank === null ? "GAL n'est pas encore sur la carte." : `GAL : ${fmtRank(day.rank)} avec ${fmtInt(day.pixels)} pixels.`);
const digits = (s: string | null) => (s ?? "").replace(/\D/g, "");

const position = (page: Page) => page.getByTestId("film-pos").inputValue().then(Number);
const playButton = (page: Page) => page.getByTestId("film-play");

/** Déplace la frise comme le ferait un visiteur. */
const seekTo = (page: Page, frame: number) =>
  page.getByTestId("film-pos").evaluate((el: HTMLInputElement, value) => {
    el.value = String(value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, frame);

/** Règle le curseur de vitesse comme le ferait un visiteur. */
const setSpeed = (page: Page, speed: string) =>
  page.getByTestId("film-speed").evaluate((el: HTMLInputElement, value) => {
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, speed);

/** Nombre de pixels peints par le film au-delà du fond de carte : il dépend du territoire affiché. */
const colorfulPixels = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-film-canvas]")!;
    const { data } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.max(data[i]!, data[i + 1]!, data[i + 2]!) - Math.min(data[i]!, data[i + 1]!, data[i + 2]!) > 60) count++;
    }
    return count;
  });

/** Attend le premier dessin du film, puis renvoie le nombre de pixels colorés de la carte finale. */
const firstDrawing = async (page: Page) => {
  await expect.poll(() => colorfulPixels(page)).toBeGreaterThan(1000);
  return colorfulPixels(page);
};

test.describe("film de la carte", () => {
  let errors: string[];
  let apiCalls: string[];

  test.beforeEach(({ page }) => {
    errors = [];
    apiCalls = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("request", (r) => {
      if (r.url().includes("openfront.io")) apiCalls.push(r.url());
    });
  });

  test.afterEach(() => {
    expect(errors, "aucune erreur JavaScript").toEqual([]);
    expect(apiCalls, "aucun appel à OpenFront depuis le navigateur").toEqual([]);
  });

  test("la page donne les chiffres collectés avant même le film", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    await expect(page.getByTestId("data-status")).toContainText("Dernière mise à jour");
    await expect(page.getByTestId("film-gal")).toContainText(String(film.galSummary.rank));
    expect(digits(await page.getByTestId("map-pixels").textContent())).toBe(String(film.galSummary.pixels));
    // Le prochain objectif suit l'ordre de la carte : les pixels du clan juste devant, moins ceux de GAL, plus 1.
    const me = film.standings.findIndex((s: { tag: string }) => s.tag === "GAL");
    if (me > 0) await expect(page.getByTestId("map-gap")).toHaveText(fmtInt(film.standings[me - 1].pixels - film.standings[me].pixels + 1));
    else await expect(page.getByTestId("map-gap")).toHaveCount(0);
    await expect(page.getByTestId("film-fronts").locator("tbody tr")).toHaveCount(film.galSummary.fronts.length);
    await expect(page.getByText("pas le classement des clans").first()).toBeVisible();
    await page.getByTestId("fold-read").locator("summary").click();
    await expect(page.getByText(`${film.check.mismatches} écart sur`)).toBeVisible();
    // La licence du fond de carte reste citée.
    await expect(page.getByTestId("map-license").getByRole("link", { name: "CC BY-SA 4.0" })).toBeVisible();
    // Un chiffre si le terrain est connu, sinon aucune phrase : jamais un zéro inventé.
    const neutral = page.getByTestId("map-neutral-border");
    if (film.galSummary.neutralBorder === undefined || film.galSummary.neutralBorder === null) await expect(neutral).toHaveCount(0);
    else expect(digits(await neutral.textContent())).toBe(String(film.galSummary.neutralBorder));
    // La ligne du changement depuis la veille n'existe qu'à partir du deuxième relevé.
    if ((await page.getByTestId("map-journal").count()) > 0) await expect(page.getByTestId("map-journal")).not.toContainText("..");
  });

  test("la page s'ouvre sur la carte, et les détails restent repliés", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    const box = (await page.getByTestId("film-map").boundingBox())!;
    expect(box.y).toBeLessThan(testViewportTitleLimit);
    await expect(page.locator("main h1")).toHaveText("La carte des clans");
    await expect(page.getByTestId("data-status")).toBeVisible();
    for (const fold of [...(datedFilm ? ["fold-days"] : []), "fold-fronts", "fold-read"]) {
      await expect(page.getByTestId(fold)).not.toHaveAttribute("open");
    }
    // Deux blocs secondaires ne se replient que sur téléphone : sur grand écran, ils restent ouverts, comme avant.
    const phone = (page.viewportSize()?.width ?? 0) < 768;
    const figures = page.getByTestId("fold-figures");
    if (phone) {
      await expect(figures).not.toHaveAttribute("open");
      await expect(page.getByTestId("map-peak")).toBeHidden();
      // Le territoire du moment reste écrit au-dessus du repli.
      await expect(page.getByTestId("map-pixels")).toBeVisible();
      await figures.locator("summary").click();
    } else {
      await expect(figures).toHaveAttribute("open");
      // Le titre n'est pas un bouton sur grand écran : il ne prend pas le focus.
      await expect(figures.locator("summary")).toHaveAttribute("tabindex", "-1");
    }
    // Le plus grand territoire est celui du film, pas un chiffre recopié.
    expect(digits(await page.getByTestId("map-peak").textContent())).toBe(String(film.galSummary.peak.pixels));
    // « Faire grandir GAL » et son calculateur « Votre don sur la carte » ont été retirés le 9 novembre 2026 : la page reste courte.
    for (const name of ["Faire grandir GAL", "Votre don sur la carte"]) await expect(page.getByRole("heading", { name })).toHaveCount(0);
    // Un bloc replié s'ouvre et se referme.
    const summary = page.getByTestId("fold-fronts").locator("summary");
    await summary.click();
    await expect(page.getByTestId("film-fronts")).toBeVisible();
    await summary.click();
    await expect(page.getByTestId("film-fronts")).toBeHidden();
    // Sous la carte, la page se lit dans l'ordre : revoir l'histoire, où en est GAL, puis le détail.
    const order = await page.locator("main section[id]").evaluateAll((sections) => sections.map((section) => section.id));
    expect(order).toEqual(["histoire", "objectif", "details"]);
    await expect(page.getByTestId("page-jumps").getByRole("link")).toHaveText(["Revoir l'histoire", "Où en est GAL", "Les détails"]);
  });

  test("revoir l'histoire tient en largeur : les moments en colonnes, la journée et les zones côte à côte", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    const width = page.viewportSize()?.width ?? 0;
    // Deux colonnes sur téléphone, six sur grand écran : la liste ne s'allonge plus en une seule colonne.
    const tiles = page.getByTestId("map-moments").getByRole("button");
    const count = await tiles.count();
    expect(count).toBe(findMoments(film.frames).length);
    const columns = await tiles.evaluateAll((els) => new Set(els.map((el) => Math.round(el.getBoundingClientRect().x))).size);
    expect(columns).toBe(Math.min(count, width >= 1280 ? 6 : width >= 1024 ? 4 : width >= 640 ? 3 : 2));
    // Sur grand écran, la plus belle journée et nos territoires sont sur la même ligne.
    const day = page.getByTestId("map-days");
    const zones = page.getByRole("heading", { name: "Nos territoires" }).locator("..");
    if (width >= 768 && (await day.count()) > 0 && film.galSummary.zones.length > 0) {
      expect(Math.round((await day.boundingBox())!.y)).toBe(Math.round((await zones.boundingBox())!.y));
    }
    // Rien ne déborde, même avec les tuiles.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  // Avec « réduire les animations », le film attend ce bouton : il doit se voir dès l'arrivée sur la page.
  for (const [width, height] of [
    [375, 812],
    [768, 1024],
    [900, 700],
    [1024, 768],
    [1180, 820],
    [1199, 800],
    [1200, 800],
    [1920, 1080],
  ] as const) {
    test(`à ${width} × ${height}, le bouton de lecture se voit sans défiler et rien ne déborde`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "Formats testés une seule fois.");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width, height });
      await page.goto("/carte");
      await expect(playButton(page)).toBeVisible();
      await expect(playButton(page)).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

      // Le bouton ne gagne pas sa place en écrasant la carte : le monde garde presque toute la largeur.
      const map = (await page.getByTestId("film-map").boundingBox())!;
      expect(Math.min(map.width, map.height * (film.cols / film.rows))).toBeGreaterThan(width * 0.9);
    });
  }

  test("le film démarre seul, puis se met en pause et reprend", async ({ page }) => {
    await page.goto("/carte");
    await expect(playButton(page)).toContainText("Pause", { timeout: 8000 });
    await expect.poll(() => position(page)).toBeGreaterThan(3);

    await playButton(page).click();
    await expect(playButton(page)).toContainText("Lecture");
    const frozen = await position(page);
    await page.waitForTimeout(500);
    expect(await position(page)).toBe(frozen);

    await playButton(page).click();
    await expect.poll(() => position(page)).toBeGreaterThan(frozen);
    await playButton(page).click();
    await expect(playButton(page)).toContainText("Lecture");
  });

  test("le film va jusqu'au bout et retombe sur les chiffres de la page", async ({ page }) => {
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    await seekTo(page, film.frames.length - 6);
    await playButton(page).click();
    await expect(playButton(page)).toContainText("Rejouer", { timeout: 8000 });
    expect(await position(page)).toBe(film.frames.length);
    expect(digits(await page.getByTestId("film-gal").textContent())).toContain(String(lastFrame.gal));

    // Rejouer repart du début.
    await playButton(page).click();
    await expect(playButton(page)).toContainText("Pause");
    expect(await position(page)).toBeLessThan(30);
  });

  test("la frise rejoue le passé et le film se dessine", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    const finalPixels = await firstDrawing(page);

    // Au tout début, la carte est vide et GAL n'y est pas encore : ce n'est pas un zéro.
    await seekTo(page, 0);
    await expect(page.getByTestId("film-gal")).toHaveText("GAL n'est pas encore sur la carte.");
    await expect.poll(() => colorfulPixels(page)).toBeLessThan(finalPixels / 2);

    const mid = Math.floor(film.frames.length / 2);
    await seekTo(page, mid);
    const frame = film.frames[mid - 1];
    await expect(page.getByTestId("film-gal")).toContainText(fmtInt(frame.gal));
    await expect(page.locator("[data-film-event]")).toHaveText(/./);
    expect(digits(await page.locator("[data-film-event]").textContent())).toBe(`${frame.ev}${lastFrame.ev}`);

    await seekTo(page, film.frames.length);
    await expect.poll(() => colorfulPixels(page)).toBeGreaterThan(finalPixels * 0.9);
  });

  test("le film donne les vraies dates, à l'heure de Paris", async ({ page }) => {
    test.skip(!datedFilm, "film sans dates, refait au prochain passage du robot");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();

    // À la fin de l'historique, comme à chaque position : la date de l'image affichée.
    const date = page.getByTestId("film-date");
    await expect(date).toHaveText(fmtEpochHour(lastFrame.at));
    const mid = Math.floor(film.frames.length / 2);
    await seekTo(page, mid);
    await expect(date).toHaveText(fmtEpochHour(film.frames[mid - 1].at));
    // Le lecteur d'écran ne lit pas l'incrustation sur la carte : le curseur dit la même date.
    await expect(page.getByTestId("film-pos")).toHaveAttribute("aria-valuetext", new RegExp(`^${fmtEpochHour(film.frames[mid - 1].at)}, événement `));
    // Avant le premier changement, il n'y a pas encore de date à montrer.
    await seekTo(page, 0);
    await expect(date).toBeHidden();

    // Sous la frise : le premier et le dernier jour, et un repère par jour.
    const marks = filmDayMarks(film.frames);
    const labels = page.getByTestId("film-dates").locator(".film-date");
    await expect(labels.first()).toHaveText(fmtDay(marks[0]!.date));
    await expect(labels.last()).toHaveText(fmtDay(marks.at(-1)!.date));
    await expect(page.getByTestId("film-dates").locator(".film-day")).toHaveCount(marks.length);
    // Les dates écrites ne se chevauchent pas et restent dans la frise.
    const scrub = (await page.getByTestId("film-dates").boundingBox())!;
    const boxes = await labels.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ x: r.x, width: r.width })));
    boxes.forEach((box, i) => {
      expect(box.x).toBeGreaterThanOrEqual(scrub.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(scrub.x + scrub.width + 1);
      if (i > 0) expect(box.x).toBeGreaterThanOrEqual(boxes[i - 1]!.x + boxes[i - 1]!.width - 1);
    });
  });

  test("les grands moments portent leur date", async ({ page }) => {
    test.skip(!datedFilm, "film sans dates, refait au prochain passage du robot");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    const first = page.getByRole("button", { name: /Premier pixel de GAL/ });
    const frame = Number(await first.getAttribute("data-film-moment"));
    await expect(first).toContainText(fmtEpochDay(film.frames[frame - 1].at));
    await page.getByRole("button", { name: /Dernier relevé/ }).click();
    expect(await position(page)).toBe(film.frames.length);
    // Le premier pixel de GAL et son record sont datés dans les chiffres de GAL.
    await expect(page.getByTestId("map-figure").filter({ hasText: "Premier pixel" })).toContainText(`Événement n° ${fmtInt(film.galSummary.firstEvent)}`);
    const since = changeSinceLastDay(dayRows(film.days, film.frames, film.fetchedAt), film.galSummary.pixels)!;
    await expect(page.getByTestId("map-journal")).toContainText(`${fmtInt(Math.abs(since.change))} pixels depuis la fin du ${fmtDay(since.date).replace(/\.$/, "")}`);
  });

  test("la plus belle journée vient de l'historique et se rejoue", async ({ page }) => {
    test.skip(!datedFilm, "film sans dates, refait au prochain passage du robot");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    const { gain, loss } = dayHighlights(dayRows(film.days, film.frames, film.fetchedAt));
    // Seule la plus belle journée est mise en avant : le plus dur recul reste dans le tableau jour après jour.
    const shown = [gain].filter((d) => d !== null);
    const cards = page.getByTestId("map-day");
    await expect(cards).toHaveCount(shown.length);
    // Le bloc ne met en avant aucun recul : ni son titre, ni le jour du plus dur.
    await expect(page.getByTestId("map-days")).not.toContainText("reculé");
    if (loss && gain && loss.date !== gain.date) await expect(page.getByTestId("map-days")).not.toContainText(fmtDay(loss.date));
    for (const [i, day] of shown.entries()) {
      const card = cards.nth(i);
      expect(digits(await card.locator("p").nth(1).textContent())).toBe(String(Math.abs(day.net)));
      await expect(card).toContainText(fmtDay(day.date));
      // Sans mouvement : directement la carte de la fin de cette journée, et sa légende.
      await card.getByRole("button", { name: "Revoir cette journée" }).click();
      expect(await position(page)).toBe(day.frame);
      await expect(page.locator("[data-film-caption]")).toContainText(fmtDay(day.date));
      // Le film montre la fin de ce jour-là, avec les chiffres du tableau.
      await expect(page.getByTestId("film-date")).toContainText(fmtDay(day.date));
      await expect(page.getByTestId("film-gal")).toHaveText(galLine(day));
      await expect(playButton(page)).not.toContainText("Pause");
    }
  });

  test("rejouer une journée s'arrête à la fin de ce jour", async ({ page }) => {
    test.skip(!datedFilm, "film sans dates, refait au prochain passage du robot");
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    const { gain } = dayHighlights(dayRows(film.days, film.frames, film.fetchedAt));
    test.skip(!gain, "aucune journée positive à rejouer");
    await page.getByTestId("map-day").first().getByRole("button", { name: "Revoir cette journée" }).click();
    await expect(playButton(page)).toContainText("Pause");
    expect(await position(page)).toBeGreaterThanOrEqual(gain!.start);
    await expect(playButton(page)).toContainText("Lecture", { timeout: 30_000 });
    expect(await position(page)).toBe(gain!.frame);
    await expect(page.getByTestId("film-date")).toContainText(fmtDay(gain!.date));
    await expect(page.getByTestId("film-gal")).toHaveText(galLine(gain!));
    // La suite du film repart d'ici, jusqu'au bout.
    await playButton(page).click();
    await expect(playButton(page)).toContainText("Pause");
    await seekTo(page, film.frames.length - 1);
    await playButton(page).click();
    await expect(playButton(page)).toContainText("Pause");
    await expect.poll(() => position(page), { timeout: 15_000 }).toBe(film.frames.length);
  });

  test("jour après jour : une ligne par journée, le plus récent d'abord, sans date inventée", async ({ page }) => {
    test.skip(!datedFilm, "film sans dates, refait au prochain passage du robot");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    await page.getByTestId("fold-days").locator("summary").click();
    const rows = dayRows(film.days, film.frames, film.fetchedAt).reverse();
    const lines = page.getByTestId("film-days").locator("tbody tr");
    await expect(lines).toHaveCount(rows.length);
    const first = rows[0]!;
    const cells = lines.first().locator("td");
    await expect(cells.first()).toContainText(fmtDay(first.date));
    expect(digits(await cells.nth(3).textContent())).toBe(String(Math.abs(first.net)));
    expect(digits(await cells.nth(4).textContent())).toBe(String(first.pixels));
    // Seule la dernière journée peut être en cours, et elle le dit.
    await expect(page.getByTestId("film-day-partial")).toHaveCount(rows.filter((r) => !r.complete).length);
    if (!rows[0]!.complete) await expect(page.getByTestId("film-day-partial")).toContainText("relevée jusqu'à");
    // Le dernier jour de la liste est celui du premier pixel de GAL.
    expect(rows.at(-1)!.date).toBe(parisDayOf(film.galSummary.firstAt));
    // Les jours du tableau retombent sur les totaux du film.
    expect(rows.reduce((n, r) => n + r.taken, 0)).toBe(film.galSummary.taken);
    expect(rows.reduce((n, r) => n + r.lost, 0)).toBe(film.galSummary.lost);
    // La fin de chaque journée a sa propre image : le film et le tableau disent la même chose.
    for (const r of rows) {
      const end = film.frames[r.frame - 1];
      expect(end.gal).toBe(r.pixels);
      expect(end.rank).toBe(r.rank);
      expect(parisDayOf(end.at)).toBe(r.date);
    }
    // Un jour se rejoue d'un clic.
    const day = rows[2]!;
    await lines.nth(2).getByRole("button").click();
    expect(await position(page)).toBe(day.frame);
    await expect(page.locator("[data-film-caption]")).toContainText(fmtDay(day.date));
    // La phrase de lecture décrit la frise datée.
    await page.getByTestId("fold-read").locator("summary").click();
    await expect(page.getByText("Des dates, mais pas une horloge.")).toBeVisible();
    await expect(page.getByText("Pas de dates dans le film.")).toHaveCount(0);
  });

  test("revoir le premier pixel de GAL", async ({ page }) => {
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    // D'abord la fin du film : sans le bouton, il ne reviendrait pas au début.
    await seekTo(page, film.frames.length);
    await expect(playButton(page)).not.toContainText("Pause");
    await page.getByRole("button", { name: /Premier pixel de GAL/ }).click();
    await expect(playButton(page)).toContainText("Pause");
    expect(await position(page)).toBeLessThan(10);
  });

  test("la vitesse se règle de × 0,1 à × 1, jamais plus vite", async ({ page }) => {
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    const speed = page.getByTestId("film-speed");
    const shown = page.locator("[data-film-speed-value]");
    // Un curseur gradué de 0,1 en 0,1, à × 1 au départ : plus de × 2 ni de × 4.
    await expect(speed).toHaveAttribute("min", "0.1");
    await expect(speed).toHaveAttribute("max", "1");
    await expect(speed).toHaveAttribute("step", "0.1");
    await expect(speed).toHaveValue("1");
    await expect(shown).toHaveText("× 1,0");
    for (const name of ["× 2", "× 4"]) await expect(page.getByRole("button", { name })).toHaveCount(0);
    // Le curseur a son nom, et dit sa valeur aux lecteurs d'écran.
    await expect(page.getByRole("slider", { name: "Vitesse" })).toHaveAttribute("aria-valuetext", "vitesse normale");
    // Au clavier, un pas de 0,1 à la fois.
    await speed.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(speed).toHaveValue("0.9");
    await expect(shown).toHaveText("× 0,9");
    await expect(speed).toHaveAttribute("aria-valuetext", "0,9 fois la vitesse normale");

    // À × 0,1, le film avance bien moins vite qu'à × 1 pendant le même temps.
    const framesIn = async (value: string) => {
      await setSpeed(page, value);
      await seekTo(page, 0);
      await playButton(page).click();
      await expect(playButton(page)).toContainText("Pause");
      await page.waitForTimeout(1_500);
      await playButton(page).click();
      return position(page);
    };
    const normal = await framesIn("1");
    const slow = await framesIn("0.1");
    await expect(shown).toHaveText("× 0,1");
    expect(normal).toBeGreaterThanOrEqual(6);
    expect(slow).toBeLessThan(normal / 3);
  });

  test("un plan rapproché reste mesuré, puis la caméra revient seule à la carte entière", async ({ page }) => {
    test.slow();
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    const canvas = page.locator("[data-film-canvas]");
    const zoom = async () => Number(await canvas.getAttribute("data-zoom"));
    // Le moment choisi dans la liste a son plan rapproché, sur grand écran comme sur téléphone.
    await page.getByRole("button", { name: /Premier pixel de GAL/ }).click();
    await expect.poll(zoom, { timeout: 8_000 }).toBeGreaterThan(1.2);
    // Le film s'arrête : aucun autre moment ne relance la caméra.
    await playButton(page).click();
    await expect(playButton(page)).not.toContainText("Pause");
    // Le zoom de chaque image : jamais plus de trois fois la vue d'ensemble, puis le retour à la carte entière, sans clic.
    const seen = await page.evaluate(
      () =>
        new Promise<number[]>((resolve) => {
          const el = document.querySelector<HTMLCanvasElement>("[data-film-canvas]")!;
          const values: number[] = [];
          const start = performance.now();
          const tick = () => {
            values.push(Number(el.dataset.zoom ?? "1"));
            if (el.dataset.zoom === "1.00" || performance.now() - start > 12_000) resolve(values);
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );
    expect(Math.max(...seen)).toBeLessThanOrEqual(3);
    expect(seen.at(-1)).toBe(1);
  });

  test("griser les autres clans et changer de vitesse ne changent aucun chiffre", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    const before = await page.getByTestId("film-gal").textContent();
    const pixels = await firstDrawing(page);

    const focus = page.getByRole("button", { name: "Griser les autres" });
    await focus.click();
    await expect(focus).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => colorfulPixels(page)).toBeLessThan(pixels);

    await setSpeed(page, "0.3");
    await expect(page.locator("[data-film-speed-value]")).toHaveText("× 0,3");
    await expect(page.getByTestId("film-gal")).toHaveText(before ?? "");
    // Le bouton « Suivre GAL » a été retiré le 9 novembre 2026.
    await expect(page.getByRole("button", { name: "Suivre GAL" })).toHaveCount(0);
  });

  test("avec « réduire les animations », le film attend une demande", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    await expect(playButton(page)).toContainText("Lancer le film");
    await page.waitForTimeout(2500);
    expect(await position(page)).toBe(film.frames.length);
    await playButton(page).click();
    await expect(playButton(page)).toContainText("Pause");
  });

  test("le bouton pause du site arrête le film et l'empêche de repartir", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Bouton testé sur desktop.");
    await page.goto("/carte");
    await expect(playButton(page)).toContainText("Pause", { timeout: 8000 });
    await page.getByRole("button", { name: "Mettre les animations en pause" }).click();
    await expect(playButton(page)).toContainText("Lecture");
    const frozen = await position(page);
    await page.waitForTimeout(400);
    expect(await position(page)).toBe(frozen);

    await page.goto("/carte");
    await expect(playButton(page)).toContainText("Lancer le film");
    await page.waitForTimeout(2500);
    expect(await position(page)).toBe(film.frames.length);
  });

  test("au survol, la carte nomme le clan", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Le survol est testé sur desktop.");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    const box = (await page.locator("[data-film-canvas]").boundingBox())!;
    // L'Amérique du Sud, en grande partie occupée.
    await page.mouse.move(box.x + box.width * 0.31, box.y + box.height * 0.6);
    await expect(page.locator("[data-film-tip]")).toBeVisible();
    await expect(page.locator("[data-film-tip]")).not.toBeEmpty();
    await page.mouse.move(4, 4);
    await expect(page.locator("[data-film-tip]")).toBeHidden();
  });

  test("si le film ne charge pas, la carte finale reste et on peut réessayer", async ({ page }) => {
    await page.route("**/generated/carte/film.bin.gz", (r) => r.abort());
    await page.goto("/carte");
    await expect(page.getByText("Le film n'a pas pu être chargé.")).toBeVisible();
    await expect(page.locator("[data-testid=film-map] img")).toBeVisible();
    await expect(playButton(page)).toBeHidden();
    await expect(page.getByTestId("film-gal")).not.toBeEmpty();
    errors = [];
    await page.unroute("**/generated/carte/film.bin.gz");
    await page.getByRole("button", { name: "Réessayer" }).click();
    await expect(playButton(page)).toBeVisible();
    await expect(page.getByText("Le film n'a pas pu être chargé.")).toBeHidden();
  });

  test("signale une carte périmée", async ({ page }) => {
    await page.clock.setFixedTime(new Date(Date.parse(film.fetchedAt) + 3 * 86_400_000));
    await page.goto("/carte");
    await expect(page.getByText(/Données périmées : dernière mise à jour il y a \d+/)).toBeVisible();
  });

  test("sans JavaScript, la carte finale et les chiffres restent", async ({ browser }, testInfo) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: testInfo.project.use.baseURL });
    const page = await context.newPage();
    await page.goto("/carte");
    await expect(page.locator("[data-testid=film-map] img")).toBeVisible();
    // Les réserves n'ont leur case que si la fiche du clan a répondu : jamais une case « Pas de données » de plus.
    const reservesKnown = (film.treasury?.troops ?? null) !== null || (film.treasury?.caps ?? null) !== null;
    await expect(page.getByTestId("map-figure")).toHaveCount(reservesKnown ? 4 : 3);
    // Sans script, rien n'est caché : le bloc replié sur téléphone reste ouvert, à toutes les largeurs.
    await expect(page.getByTestId("fold-figures")).toHaveAttribute("open");
    await expect(page.getByTestId("map-peak")).toBeVisible();
    await expect(page.getByTestId("map-pixels")).toBeVisible();
    // Sans réponse de la fiche du clan, une ligne le dit au lieu d'une case vide ; avec, la case des réserves suffit.
    await expect(page.getByTestId("map-no-reserves")).toHaveCount(reservesKnown ? 0 : 1);
    if (!reservesKnown) await expect(page.getByTestId("map-no-reserves")).toBeVisible();
    // La plus belle journée reste lisible, sans son bouton inutile.
    if (datedFilm && dayHighlights(dayRows(film.days, film.frames, film.fetchedAt)).gain) {
      await expect(page.getByTestId("map-day").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Revoir cette journée" }).first()).toBeHidden();
    }
    // Les blocs repliés s'ouvrent sans JavaScript.
    await page.getByTestId("fold-fronts").locator("summary").click();
    await expect(page.getByTestId("film-fronts")).toBeVisible();
    if (datedFilm) {
      await page.getByTestId("fold-days").locator("summary").click();
      await expect(page.getByTestId("film-days")).toBeVisible();
    }
    await expect(playButton(page)).toBeHidden();
    await context.close();
  });

  test("Ma place : un membre retrouve son rang et le joueur à dépasser", async ({ page }) => {
    const all = JSON.parse(readFileSync("data/members.json", "utf8")).members as { username: string | null; team: { wins: number; losses: number } | null }[];
    const known = all.filter((m) => m.team);
    const sorted = [...known].sort((a, b) => (b.team?.wins ?? 0) - (a.team?.wins ?? 0));
    const named = sorted.find((m, i) => i > 0 && m.username && (m.team?.wins ?? 0) > 0 && (m.team?.wins ?? 0) < (sorted[0]?.team?.wins ?? 0));
    const wins = named?.team?.wins ?? 0;
    const rank = known.filter((m) => (m.team?.wins ?? 0) > wins).length + 1;
    await page.goto("/");
    await page.getByTestId("my-place").scrollIntoViewIfNeeded();
    const field = page.getByLabel("Votre pseudo dans le jeu");

    await field.fill(named?.username ?? "");
    const result = page.getByTestId("my-place-result");
    await expect(result).toContainText(`${rank}${rank === 1 ? "er" : "e"}`);
    await expect(result).toContainText(fmtInt(wins));
    await expect(result).toContainText("Prochain à dépasser");

    await field.fill("zzzzzzzzzz");
    await expect(page.getByText("Aucun membre avec ce pseudo.")).toBeVisible();
    await expect(result).toBeHidden();
  });

  test("Ma place : le premier du clan n'a personne à dépasser", async ({ page }) => {
    const all = JSON.parse(readFileSync("data/members.json", "utf8")).members as { username: string | null; team: { wins: number } | null }[];
    const first = [...all].filter((m) => m.team).sort((a, b) => (b.team?.wins ?? 0) - (a.team?.wins ?? 0))[0];
    test.skip(!first?.username, "Le premier du clan est anonyme.");
    await page.goto("/");
    await page.getByTestId("my-place").scrollIntoViewIfNeeded();
    await page.getByLabel("Votre pseudo dans le jeu").fill(first?.username ?? "");
    await expect(page.getByTestId("my-place-result")).toContainText("Personne devant");
  });

  test("Ma place : une panne de la liste se signale et peut se réessayer", async ({ page }) => {
    await page.route("**/data/members.json", (r) => r.abort());
    await page.goto("/");
    await page.getByTestId("my-place").scrollIntoViewIfNeeded();
    await page.getByLabel("Votre pseudo dans le jeu").fill("Gaulois");
    await expect(page.getByTestId("my-place").getByRole("alert")).toContainText("n'a pas pu être chargée");
    errors = [];
    await page.unroute("**/data/members.json");
    await page.getByTestId("my-place").getByRole("button", { name: "Réessayer" }).click();
    await expect(page.getByTestId("my-place").getByRole("alert")).toBeHidden();
  });

  test("les grands moments s'affichent en sous-titre et se rejouent", async ({ page }) => {
    await page.goto("/carte");
    const caption = page.locator("[data-film-caption]");
    await expect(caption).toHaveText("Premier pixel de GAL", { timeout: 8000 });

    const push = page.getByRole("button", { name: /La plus grande poussée/ });
    const frame = Number(await push.getAttribute("data-film-moment"));
    await push.click();
    await expect(caption).toContainText("La plus grande poussée", { timeout: 8000 });
    await expect(push).toHaveAttribute("aria-current", "true");
    expect(await position(page)).toBeGreaterThanOrEqual(frame);
  });

  test("on peut regarder un front ou une zone, puis revenir à la vue d'ensemble", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    const front = film.galSummary.fronts.find((f: { at: unknown }) => f.at);
    const caption = page.locator("[data-film-caption]");
    const world = page.getByRole("button", { name: "Vue d'ensemble" });

    await page.getByTestId("fold-fronts").locator("summary").click();
    await page.getByRole("button", { name: `Voir le front avec ${front.tag} sur la carte` }).click();
    await expect(caption).toContainText(`Front ${front.tag}`);
    await expect(world).toBeVisible();
    await world.click();
    await expect(caption).toBeHidden();
    await expect(world).toBeHidden();

    await page.getByRole("button", { name: /Zone 1/ }).click();
    await expect(caption).toContainText("Zone 1");
    expect(await position(page)).toBe(film.frames.length);
  });

  test("un téléphone tourné en paysage retrouve les blocs ouverts, sans bouton à chercher", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/carte");
    const figures = page.getByTestId("fold-figures");
    await expect(figures).not.toHaveAttribute("open");
    // L'écran s'élargit : les blocs se rouvrent d'eux-mêmes, et leur titre n'est plus un bouton.
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(figures).toHaveAttribute("open");
    await expect(page.getByTestId("map-peak")).toBeVisible();
    await expect(figures.locator("summary")).toHaveAttribute("tabindex", "-1");
    // Même activé par une aide technique, le titre ne referme pas le bloc sur grand écran.
    await figures.locator("summary").dispatchEvent("click");
    await expect(figures).toHaveAttribute("open");
  });

  test("au retour, le film reprend après la dernière image vue, et dit ce qui a changé", async ({ page }) => {
    test.skip(!datedFilm, "film sans dates, refait au prochain passage du robot");
    // La dernière image vue : vers 60 % du film, loin d'un grand moment dont le sous-titre remplacerait le nôtre.
    const moments = findMoments(film.frames).map((m) => m.frame);
    let seen = Math.floor(film.frames.length * 0.6);
    while (moments.some((frame) => frame > seen && frame <= seen + 30)) seen++;
    const lastSeen = film.frames[seen - 1];
    const expected = filmResume(film.frames, lastSeen.at, "2026-10-01T10:05:00.000Z")!;
    const old = { at: "2026-10-01T10:00:00.000Z", rank: null, score: null, games: 0, wins: 0, pixels: lastSeen.gal, mapRank: null, mapAt: lastSeen.at, members: null, gazette: null };
    await page.addInitScript((state) => localStorage.setItem("gal-visite", state), JSON.stringify({ baseline: old, latest: old, since: "2026-10-01T10:05:00.000Z", seenAt: "2026-10-01T10:05:00.000Z" }));
    await page.goto("/carte");
    await expect(playButton(page)).toContainText("Pause", { timeout: 8000 });
    await expect(page.locator("[data-film-caption]")).toHaveText(expected.caption);
    const at = await position(page);
    expect(at).toBeGreaterThanOrEqual(seen);
    expect(at).toBeLessThan(film.frames.length);
    // La visite est notée avec la dernière image du film : la prochaine reprendra après elle.
    const stored = JSON.parse((await page.evaluate(() => localStorage.getItem("gal-visite"))) ?? "null");
    expect(stored.latest.mapAt).toBe(film.frames.at(-1).at);
    expect(stored.baseline.mapAt).toBe(lastSeen.at);
  });

  test("un bouton rejoue la dernière journée terminée", async ({ page }) => {
    test.skip(!datedFilm, "film sans dates, refait au prochain passage du robot");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    const last = [...dayRows(film.days, film.frames, film.fetchedAt)].reverse().find((d) => d.complete)!;
    const button = page.getByTestId("film-last-day");
    await expect(button).toHaveText(`Revoir le ${fmtDay(last.date)}`);
    await button.click();
    expect(await position(page)).toBe(last.frame);
    await expect(page.locator("[data-film-caption]")).toContainText(fmtDay(last.date));
    await expect(page.getByTestId("film-gal")).toHaveText(galLine(last));
  });

  test("la page donne le prochain palier de pixels, sans l'inventer", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    const next = nextThreshold(film.galSummary.pixels);
    const line = page.getByTestId("map-next-threshold");
    if (!next) await expect(line).toHaveCount(0);
    else await expect(line).toHaveText(`Prochain palier : ${fmtInt(next.threshold)} pixels, encore ${fmtInt(next.remaining)}.`);
  });

  test("l'accueil renvoie vers le film", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /pixels sur la carte/i })).toBeVisible();
    await page.getByRole("link", { name: "Voir le film de la conquête" }).click();
    await expect(page).toHaveURL(/carte/);
  });
});

test("sur téléphone, le film part de la carte entière, sans déborder", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Testé sur mobile.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/carte");
  await expect(playButton(page)).toBeVisible();
  // Plus de « Suivre GAL » activé d'office : comme sur grand écran, la caméra montre la vue d'ensemble.
  await expect(page.getByRole("button", { name: "Suivre GAL" })).toHaveCount(0);
  await expect.poll(() => page.locator("[data-film-canvas]").getAttribute("data-zoom")).toBe("1.00");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
