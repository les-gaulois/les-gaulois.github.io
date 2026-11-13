import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { clan } from "../../config/clan";
import { ECRAN_POSE, FENETRES } from "../../src/lib/carte-console";
import { changeSinceLastDay, dayHighlights, dayRows, filmDayMarks, parisDayOf } from "../../src/lib/clanmap/days";
import { findMoments, nextThreshold } from "../../src/lib/clanmap/moments";
import { filmResume } from "../../src/lib/clanmap/reprise";
import { ligneDuClan } from "../../src/lib/clanmap/vue";
import { fmtDay, fmtEpochDay, fmtEpochHour, fmtInt, fmtRank } from "../../src/lib/format";

/**
 * Sur tous les formats, la carte commence dans le haut de l'écran, juste sous l'en-tête et le titre.
 * Sur téléphone (375 px), sa position dépend de `data/meta.json`, que le robot réécrit à chaque collecte :
 * 134 px d'ordinaire, davantage si la dernière collecte a échoué ou si les données sont en plus périmées.
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
const caption = (page: Page) => page.locator("[data-film-caption]");
const canvas = (page: Page) => page.locator("[data-film-canvas]");
const zoom = async (page: Page) => Number(await canvas(page).getAttribute("data-zoom"));
/** Le centre de la vue, en cases du film. */
const centre = async (page: Page) => ((await canvas(page).getAttribute("data-centre")) ?? "").split(",").map(Number) as [number, number];

/** La rangée du bas de la console, et la fenêtre qu'ouvre une de ses entrées. */
const dock = (page: Page) => page.getByTestId("carte-dock");
const entry = (page: Page, id: string) => dock(page).locator(`[data-ouvre="${id}"]`);
const windowOf = (page: Page, id: string) => page.locator(`[data-fenetre="${id}"]`);
const openWindows = (page: Page) => page.locator("[data-fenetre].est-ouverte").filter({ visible: true });

/** Ouvre une fenêtre de la console depuis la rangée du bas, comme le ferait un visiteur. */
const openWindow = async (page: Page, id: string) => {
  if ((await entry(page, id).getAttribute("aria-current")) !== "true") await entry(page, id).click();
  await expect(windowOf(page, id)).toBeVisible();
};

/**
 * Les réglages du film (vitesse, griser les autres, revoir la dernière journée) : posés à côté de la frise sur un grand
 * écran, dans leur fenêtre ailleurs.
 */
const showSettings = async (page: Page) => {
  if (await entry(page, "reglages").isVisible()) await openWindow(page, "reglages");
  await expect(page.getByTestId("film-speed")).toBeVisible();
};

/** Laisse au film le temps de dessiner : le zoom et le centre lus par les tests sont ceux de la dernière image dessinée. */
const drawn = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

/** La page défile-t-elle ? La console tient dans l'écran : jamais. */
const pageScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);

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

/**
 * Nombre de pixels peints par le film au-delà du fond de carte : il dépend du territoire affiché. La mer, bleue depuis le
 * 13 novembre 2026 (du littoral au large, `src/lib/clanmap/terrain.ts`), n'en est pas : son bleu a le vert au-dessus du
 * rouge et le bleu au-dessus du vert, chacun de 20 à 75 de plus. Quelques clans bleu clair y tombent aussi (1,5 % des
 * pixels le 13 novembre 2026), les mêmes à chaque image : les comparaisons entre images n'en changent pas. La mer seule
 * n'y compte qu'environ 500 pixels, la carte finale plus de 200 000.
 */
const colorfulPixels = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-film-canvas]")!;
    const { data } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!];
      const sea = g - r >= 20 && g - r <= 75 && b - g >= 20 && b - g <= 75 && r < 140;
      if (!sea && Math.max(r, g, b) - Math.min(r, g, b) > 60) count++;
    }
    return count;
  });

/** Attend le premier dessin du film, puis renvoie le nombre de pixels colorés de la carte finale. */
const firstDrawing = async (page: Page) => {
  await expect.poll(() => colorfulPixels(page)).toBeGreaterThan(1000);
  return colorfulPixels(page);
};

/** Un point de la carte où un clan a du territoire : l'Amérique du Sud, en grande partie occupée. */
const occupiedPoint = async (page: Page) => {
  const box = (await canvas(page).boundingBox())!;
  return { x: box.x + box.width * 0.31, y: box.y + box.height * 0.6 };
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
    // Le podium est sous les yeux à l'arrivée : posé sur la carte, ou avec les clans sous elle sur téléphone.
    await expect(page.getByText("pas le classement des clans").first()).toBeVisible();

    await openWindow(page, "objectif");
    expect(digits(await page.getByTestId("map-pixels").textContent())).toBe(String(film.galSummary.pixels));
    // Le film peut montrer un autre jour à côté : la fenêtre dit de quand sont ses chiffres.
    await expect(windowOf(page, "objectif")).toContainText(`${fmtRank(film.galSummary.rank)} sur la carte, au dernier relevé`);
    // Le prochain objectif suit l'ordre de la carte : les pixels du clan juste devant, moins ceux de GAL, plus 1.
    const me = film.standings.findIndex((s: { tag: string }) => s.tag === "GAL");
    if (me > 0) await expect(page.getByTestId("map-gap")).toHaveText(fmtInt(film.standings[me - 1].pixels - film.standings[me].pixels + 1));
    else await expect(page.getByTestId("map-gap")).toHaveCount(0);
    // La ligne du changement depuis la veille n'existe qu'à partir du deuxième relevé.
    if ((await page.getByTestId("map-journal").count()) > 0) await expect(page.getByTestId("map-journal")).not.toContainText("..");

    await openWindow(page, "fronts");
    await expect(page.getByTestId("film-fronts").locator("tbody tr")).toHaveCount(film.galSummary.fronts.length);

    // Un chiffre si le terrain est connu, sinon aucune phrase : jamais un zéro inventé.
    await openWindow(page, "chiffres");
    const neutral = page.getByTestId("map-neutral-border");
    if (film.galSummary.neutralBorder === undefined || film.galSummary.neutralBorder === null) await expect(neutral).toHaveCount(0);
    else expect(digits(await neutral.textContent())).toBe(String(film.galSummary.neutralBorder));
    // Le plus grand territoire est celui du film, pas un chiffre recopié.
    expect(digits(await page.getByTestId("map-peak").textContent())).toBe(String(film.galSummary.peak.pixels));
    // « Faire grandir GAL » et son calculateur « Votre don sur la carte » ont été retirés le 9 novembre 2026.
    for (const name of ["Faire grandir GAL", "Votre don sur la carte"]) await expect(page.getByRole("heading", { name, includeHidden: true })).toHaveCount(0);
    // Aucune fenêtre n'écrit un nombre avec l'espace fine que nos polices n'ont pas (voir site.spec.ts).
    expect(await page.locator("[data-carte]").evaluate((el) => (el.textContent ?? "").includes(" "))).toBe(false);
  });

  // Demande du pilote, le 12 novembre 2026 : « tout interactible depuis la carte », « on ne peut plus descendre en bas de la page ».
  test("la page tient dans l'écran : rien ne défile, et tout s'ouvre depuis la rangée du bas", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    const box = (await page.getByTestId("film-map").boundingBox())!;
    expect(box.y).toBeLessThan(testViewportTitleLimit);
    await expect(page.locator("main h1")).toHaveText("La carte des clans");
    await expect(page.getByTestId("data-status")).toBeVisible();
    expect(await pageScroll(page)).toBe(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // La rangée : une entrée par fenêtre, dans l'ordre. Sur un grand écran, les réglages sont posés à côté de la frise.
    const wide = (page.viewportSize()?.width ?? 0) >= 1200;
    // Les tests tournent sans la connexion du site : la fenêtre de l'alliance n'existe pas, le site reste statique.
    const names = FENETRES.filter((f) => f.id !== "alliance" && !(wide && "etroit" in f && f.etroit)).map((f) => f.label);
    await expect(dock(page).getByRole("link").filter({ visible: true })).toHaveText(names);
    // Sous la carte (téléphone), les clans sont ouverts à l'arrivée ; sur un écran de 1 280 px, rien ne couvre la carte.
    await expect(openWindows(page)).toHaveCount(wide ? 0 : 1);
    if (!wide) await expect(entry(page, "clans")).toHaveAttribute("aria-current", "true");

    // Chaque entrée ouvre sa fenêtre, une seule à la fois, et la page ne défile toujours pas.
    for (const fenetre of FENETRES.filter((f) => names.includes(f.label))) {
      await entry(page, fenetre.id).click();
      await expect(windowOf(page, fenetre.id)).toBeVisible();
      await expect(openWindows(page)).toHaveCount(1);
      await expect(entry(page, fenetre.id)).toHaveAttribute("aria-current", "true");
      // La fenêtre ouverte reçoit le focus, et l'adresse la retient.
      await expect(windowOf(page, fenetre.id)).toBeFocused();
      expect(new URL(page.url()).hash).toBe(`#${fenetre.id}`);
      expect(await pageScroll(page), fenetre.id).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), fenetre.id).toBeLessThanOrEqual(0);
      // Une fenêtre plus haute que sa place défile dans son cadre, jamais plus large que lui.
      expect(await windowOf(page, fenetre.id).evaluate((el) => el.scrollWidth - el.clientWidth), fenetre.id).toBeLessThanOrEqual(0);
    }

    // Recliquer l'entrée ouverte : la fenêtre se ferme sur la carte ; sous la carte, il en reste toujours une.
    await entry(page, "fronts").click();
    await entry(page, "fronts").click();
    if (wide) {
      await expect(openWindows(page)).toHaveCount(0);
      expect(new URL(page.url()).hash).toBe("");
      // Le bouton de la barre de titre et la touche Échap ferment aussi, et rendent le focus à l'entrée.
      await entry(page, "fronts").click();
      await page.getByRole("button", { name: "Fermer la fenêtre Fronts" }).click();
      await expect(openWindows(page)).toHaveCount(0);
      await expect(entry(page, "fronts")).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(windowOf(page, "fronts")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(openWindows(page)).toHaveCount(0);
      await expect(entry(page, "fronts")).toBeFocused();
      // Un menu de l'en-tête ouvert passe avant la fenêtre : Échap ferme le menu, pas elle, et lui rend le focus.
      await entry(page, "fronts").click();
      const menu = page.getByTestId("nouveautes-menu");
      await menu.locator("summary").click();
      await expect(page.getByTestId("nouveautes-panel")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("nouveautes-panel")).toBeHidden();
      await expect(windowOf(page, "fronts")).toBeVisible();
      await expect(menu.locator("summary")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(openWindows(page)).toHaveCount(0);
    } else {
      await expect(windowOf(page, "fronts")).toBeVisible();
      await expect(page.getByRole("button", { name: "Fermer la fenêtre Fronts" })).toBeHidden();
    }
  });

  test("l'adresse ouvre une fenêtre, et les anciens liens de la page mènent encore quelque part", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte#fronts");
    await expect(windowOf(page, "fronts")).toBeVisible();
    await expect(entry(page, "fronts")).toHaveAttribute("aria-current", "true");
    // « Revoir l'histoire » et « Les détails », du temps où la page se lisait de haut en bas.
    await page.goto("/carte#histoire");
    await expect(windowOf(page, "moments")).toBeVisible();
    await page.goto("/carte#details");
    await expect(windowOf(page, "journees")).toBeVisible();
    // Une ancre inconnue ne change rien à la fenêtre ouverte.
    await page.goto("/carte#inconnue");
    await expect(windowOf(page, "journees")).toBeVisible();
    // Et à l'arrivée, elle n'ouvre rien de plus que d'ordinaire : les clans sous la carte, rien sur un écran de 1 280 px.
    await page.goto("about:blank");
    await page.goto("/carte#inconnue");
    await expect(playButton(page)).toBeVisible();
    const wide = (page.viewportSize()?.width ?? 0) >= 1200;
    await expect(openWindows(page)).toHaveCount(wide ? 0 : 1);
    if (!wide) await expect(windowOf(page, "clans")).toBeVisible();
  });

  // Avec « réduire les animations », le film attend ce bouton : il doit se voir dès l'arrivée sur la page.
  // Les formats d'avant, plus ceux où la hauteur manque : un iPhone SE avec la barre de son navigateur (375 × 548), un
  // téléphone courant (390 × 664), un portable de 1 280 × 720 ou de 1 366 × 768 dans leur navigateur, un Mac de 1 440 × 900.
  for (const [width, height] of [
    [375, 548],
    [390, 664],
    [375, 812],
    [768, 1024],
    [900, 700],
    [1024, 768],
    [1180, 820],
    [1199, 800],
    [1200, 800],
    [1280, 585],
    [1366, 650],
    [1440, 780],
    [1920, 1080],
  ] as const) {
    test(`à ${width} × ${height}, la console tient dans l'écran, bouton de lecture compris, et rien ne déborde`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "Formats testés une seule fois.");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width, height });
      await page.goto("/carte");
      await expect(playButton(page)).toBeVisible();
      await expect(playButton(page)).toBeInViewport({ ratio: 1 });
      // La rangée du bas est entière dans l'écran, elle aussi : rien n'oblige à descendre.
      await expect(dock(page)).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      expect(await pageScroll(page)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

      // La console ne gagne pas sa place en écrasant la carte.
      const map = (await page.getByTestId("film-map").boundingBox())!;
      const world = Math.min(map.width, map.height * (film.cols / film.rows));
      if (width >= 768 && width / height >= 1.25) {
        // Écran large : la carte prend toute la largeur, commence sous l'en-tête du site, et ne laisse à la lecture et à
        // la rangée que 150 px au plus, à elles deux. Le monde est plus large que haut : il garde presque toute la
        // largeur, comme avant ; sur un écran trop bas pour cela (un portable dans son navigateur), c'est la hauteur qui
        // le limite, et il prend alors toute celle qui reste.
        const top = await page.locator("body > header").evaluate((el) => el.getBoundingClientRect().bottom);
        expect(map.width).toBe(width);
        expect(map.y).toBeLessThanOrEqual(top + 1);
        expect(height - (map.y + map.height)).toBeLessThanOrEqual(150);
        expect(world).toBeGreaterThan(Math.min(width * 0.9, (height - top - 150) * (film.cols / film.rows)));
        // Posés sur la carte, la session et le podium gardent leur écart, et le podium n'a pas à défiler dans son cadre.
        const session = (await page.locator(".carte-session").boundingBox())!;
        const podium = (await page.locator(".carte-podium").boundingBox())!;
        expect(podium.y).toBeGreaterThanOrEqual(session.y + session.height + 8);
        expect(await page.locator(".carte-podium").evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(0);
        // Le crédit, sur ses deux lignes, ne passe pas sous le podium.
        const credit = (await page.getByTestId("map-credit").boundingBox())!;
        expect(credit.x).toBeGreaterThanOrEqual(podium.x + podium.width);
        await expect(page.getByTestId("film-gal")).toBeInViewport({ ratio: 1 });
        // L'objectif, qui s'ouvre seul dès 1 360 px de large, se lit entier dès 650 px de haut : il n'a pas à défiler dans
        // son cadre sur un portable.
        if (width >= 1360 && height >= 650) {
          await expect(windowOf(page, "objectif")).toBeVisible();
          expect(await windowOf(page, "objectif").evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(0);
        }
      } else {
        // Carte en haut, fenêtre dessous : le monde garde presque toute la largeur, même sur un téléphone peu haut, et la
        // fenêtre ouverte garde de quoi lire sous la carte.
        expect(world).toBeGreaterThan(width * (height >= 640 ? 0.9 : 0.78));
        const panel = (await page.locator("[data-carte-panneaux]").boundingBox())!;
        expect(panel.height).toBeGreaterThanOrEqual(90);
        await expect(page.getByTestId("film-gal")).toBeInViewport({ ratio: 1 });
      }
      // Le crédit de la carte est sous les yeux, entier, à toutes les tailles.
      await expect(page.getByTestId("map-credit")).toBeInViewport({ ratio: 1 });
    });
  }

  // `.carte` coupe ce qui dépasse d'elle : le contrôle « aucun défilement horizontal » du site ne verrait plus rien ici.
  // 360 et 768 : tout s'empile. 1 024 et 1 920 : la fenêtre se pose sur la carte, avec ou sans les réglages dans la rangée.
  for (const [width, height] of [
    [360, 800],
    [768, 1024],
    [1024, 768],
    [1920, 1080],
  ] as const) {
    test(`à ${width} px, rien ne dépasse de la console ni d'une de ses fenêtres`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "Largeurs testées une seule fois.");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width, height });
      await page.goto("/carte");
      await expect(playButton(page)).toBeVisible();
      const overflow = () =>
        page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>("[data-carte], [data-carte] .carte-ecran, [data-carte] .carte-transport, [data-carte] .carte-dock, [data-carte] .carte-podium, [data-fenetre].est-ouverte")]
            .filter((el) => el.getClientRects().length > 0 && el.scrollWidth > el.clientWidth)
            .map((el) => `${el.className} : ${el.scrollWidth - el.clientWidth} px`),
        );
      expect(await overflow(), "à l'arrivée").toEqual([]);
      for (const id of await dock(page).getByRole("link").filter({ visible: true }).evaluateAll((links) => links.map((link) => link.getAttribute("data-ouvre") ?? ""))) {
        await openWindow(page, id);
        expect(await overflow(), id).toEqual([]);
        // Chaque nom de la rangée tient dans sa case.
        expect(await dock(page).getByRole("link").filter({ visible: true }).evaluateAll((links) => links.filter((link) => link.scrollWidth > link.clientWidth).map((link) => link.textContent))).toEqual([]);
      }
    });
  }

  test("un écran trop bas pour la console laisse la page défiler, sans rien écraser", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Format testé une seule fois.");
    await page.emulateMedia({ reducedMotion: "reduce" });
    // Un téléphone couché.
    await page.setViewportSize({ width: 740, height: 360 });
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    expect(await pageScroll(page)).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    // La rangée du bas s'atteint en descendant : le doigt garde donc le défilement vertical sur la carte.
    await dock(page).scrollIntoViewIfNeeded();
    await expect(dock(page)).toBeInViewport({ ratio: 1 });
    expect(await canvas(page).evaluate((el) => getComputedStyle(el).touchAction)).toBe("pan-y");
  });

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

  test("les grands moments portent leur date, dans leur fenêtre", async ({ page }) => {
    test.skip(!datedFilm, "film sans dates, refait au prochain passage du robot");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    await openWindow(page, "moments");
    // Tous les grands moments du film, un bouton chacun.
    await expect(page.getByTestId("map-moments").getByRole("button")).toHaveCount(findMoments(film.frames).length);
    const first = page.getByRole("button", { name: /Premier pixel de GAL/ });
    const frame = Number(await first.getAttribute("data-film-moment"));
    await expect(first).toContainText(fmtEpochDay(film.frames[frame - 1].at));
    await page.getByRole("button", { name: /Dernier relevé/ }).click();
    expect(await position(page)).toBe(film.frames.length);
    // Le premier pixel de GAL et son record sont datés dans les chiffres de GAL.
    await openWindow(page, "chiffres");
    await expect(page.getByTestId("map-figure").filter({ hasText: "Premier pixel" })).toContainText(`Événement n° ${fmtInt(film.galSummary.firstEvent)}`);
    await openWindow(page, "objectif");
    const since = changeSinceLastDay(dayRows(film.days, film.frames, film.fetchedAt), film.galSummary.pixels)!;
    await expect(page.getByTestId("map-journal")).toContainText(`${fmtInt(Math.abs(since.change))} pixels depuis la fin du ${fmtDay(since.date).replace(/\.$/, "")}`);
  });

  test("la plus belle journée vient de l'historique et se rejoue", async ({ page }) => {
    test.skip(!datedFilm, "film sans dates, refait au prochain passage du robot");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    await openWindow(page, "journees");
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
      await expect(caption(page)).toContainText(fmtDay(day.date));
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
    await openWindow(page, "journees");
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
    await openWindow(page, "journees");
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
    await expect(caption(page)).toContainText(fmtDay(day.date));
  });

  test("revoir le premier pixel de GAL", async ({ page }) => {
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    // D'abord la fin du film : sans le bouton, il ne reviendrait pas au début.
    await seekTo(page, film.frames.length);
    await expect(playButton(page)).not.toContainText("Pause");
    await openWindow(page, "moments");
    await page.getByRole("button", { name: /Premier pixel de GAL/ }).click();
    await expect(playButton(page)).toContainText("Pause");
    expect(await position(page)).toBeLessThan(10);
  });

  test("la vitesse se règle de × 0,1 à × 1, jamais plus vite", async ({ page }) => {
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    await showSettings(page);
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
    // Le moment choisi dans la liste a son plan rapproché, sur grand écran comme sur téléphone.
    await openWindow(page, "moments");
    await page.getByRole("button", { name: /Premier pixel de GAL/ }).click();
    await expect.poll(() => zoom(page), { timeout: 8_000 }).toBeGreaterThan(1.2);
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
    await showSettings(page);

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
    // Rien ne bouge seul : ni la bande de lumière de l'ouverture, ni la commande d'une fenêtre.
    expect(await page.locator(".carte-balayage").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    await openWindow(page, "objectif");
    expect(await page.locator('[data-fenetre="objectif"] .carte-fenetre-corps').evaluate((el) => getComputedStyle(el, "::before").animationName)).toBe("none");
    await playButton(page).click();
    await expect(playButton(page)).toContainText("Pause");
  });

  test("le bouton pause du site arrête le film et l'empêche de repartir", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Bouton testé sur desktop.");
    await page.goto("/carte");
    await expect(playButton(page)).toContainText("Pause", { timeout: 8000 });
    // À l'ouverture, la bande de lumière passe une fois sur la carte, et la commande d'une fenêtre s'écrit.
    expect(await page.locator(".carte-balayage").evaluate((el) => getComputedStyle(el).animationName)).toBe("carte-balayage");
    await page.getByRole("button", { name: "Mettre les animations en pause" }).click();
    await expect(playButton(page)).toContainText("Lecture");
    const frozen = await position(page);
    await page.waitForTimeout(400);
    expect(await position(page)).toBe(frozen);
    expect(await page.locator(".carte-balayage").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");

    await page.goto("/carte");
    await expect(playButton(page)).toContainText("Lancer le film");
    await page.waitForTimeout(2500);
    expect(await position(page)).toBe(film.frames.length);
  });

  test("au survol, la carte nomme le clan et donne la position sur la carte complète", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Le survol est testé sur desktop.");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    const point = await occupiedPoint(page);
    await page.mouse.move(point.x, point.y);
    await expect(page.locator("[data-film-tip]")).toBeVisible();
    await expect(page.locator("[data-film-tip]")).not.toBeEmpty();
    // La position, comptée sur la carte complète : deux nombres de quatre chiffres, dans ses limites.
    const coords = page.locator("[data-film-coords]");
    await expect(coords).toHaveText(/^x \d{4} · y \d{4}$/);
    const [x, y] = ((await coords.textContent()) ?? "").match(/\d{4}/g)!.map(Number);
    expect(x).toBeLessThan(film.width);
    expect(y).toBeLessThan(film.height);
    await page.mouse.move(4, 4);
    await expect(page.locator("[data-film-tip]")).toBeHidden();
    await expect(coords).toBeHidden();
  });

  test("un clic sur un territoire nomme son clan, sans changer aucun chiffre, et un autre clic le relâche", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Le clic à la souris est testé sur desktop.");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    const before = await page.getByTestId("film-gal").textContent();
    const pixels = await firstDrawing(page);
    const point = await occupiedPoint(page);
    await page.mouse.move(point.x, point.y);
    const tag = (await page.locator("[data-film-tip]").textContent()) ?? "";
    await page.mouse.click(point.x, point.y);
    // La phrase vient du dernier relevé de la carte (`standings` : le territoire de chaque clan, rejoué depuis
    // l'historique officiel, du plus grand au plus petit), et dit de quand sont ses chiffres.
    await expect(caption(page)).toHaveText(ligneDuClan(tag, film.standings));
    await expect(caption(page)).toContainText("au dernier relevé");
    await expect(page.locator("[data-film-status]")).toHaveText(ligneDuClan(tag, film.standings));
    // Les autres clans se grisent, GAL reste en couleur ; aucun chiffre ne bouge.
    await expect.poll(() => colorfulPixels(page)).toBeLessThan(pixels);
    await expect(page.getByTestId("film-gal")).toHaveText(before ?? "");
    expect(await zoom(page)).toBe(1);
    // Le clan est marqué dans la liste des clans.
    await openWindow(page, "clans");
    await expect(page.getByRole("button", { name: `Voir ${tag} sur la carte` })).toHaveAttribute("aria-current", "true");
    // « Vue d'ensemble » le relâche ; un deuxième clic au même endroit aussi.
    await page.getByRole("button", { name: "Vue d'ensemble" }).click();
    await expect(caption(page)).toBeHidden();
    await expect(page.getByRole("button", { name: "Vue d'ensemble" })).toBeHidden();
    await page.mouse.click(point.x, point.y);
    await expect(caption(page)).toBeVisible();
    await page.mouse.click(point.x, point.y);
    await expect(caption(page)).toBeHidden();
    await expect.poll(() => colorfulPixels(page)).toBeGreaterThan(pixels * 0.9);
  });

  test("tous les clans de la carte sont dans leur fenêtre, et un clic y montre un clan", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    await openWindow(page, "clans");
    const rows = page.getByTestId("map-clans").locator("tbody tr");
    // L'ordre et les pixels du dernier relevé de la carte, tels que la collecte les a écrits : la page ne refait aucun
    // calcul et ne trie rien.
    await expect(rows).toHaveCount(film.standings.length);
    // La fenêtre dit « du plus grand au plus petit » : c'est l'ordre du relevé.
    await expect(windowOf(page, "clans")).toContainText("du plus grand au plus petit");
    expect(film.standings.every((standing: { pixels: number }, i: number) => i === 0 || film.standings[i - 1].pixels >= standing.pixels)).toBe(true);
    for (const i of [0, 1, film.standings.length - 1]) {
      const cells = rows.nth(i).locator("td");
      await expect(cells.nth(0)).toHaveText(String(i + 1));
      await expect(cells.nth(1)).toContainText(film.standings[i].tag ?? "Clan supprimé");
      expect(digits(await cells.nth(2).textContent())).toBe(String(film.standings[i].pixels));
    }
    await expect(page.getByTestId("map-clans").locator("tr.est-gal")).toContainText("GAL");
    if (datedFilm) await expect(page.getByTestId("map-clans").locator("caption")).toContainText(fmtEpochHour(lastFrame.at));
    // Un clan du film : la carte d'aujourd'hui, cadrée sur lui, et sa phrase.
    await seekTo(page, Math.floor(film.frames.length / 2));
    const rival = film.standings.find((s: { tag: string | null }) => s.tag && s.tag !== "GAL");
    await page.getByRole("button", { name: `Voir ${rival.tag} sur la carte` }).click();
    expect(await position(page)).toBe(film.frames.length);
    await expect(caption(page)).toHaveText(ligneDuClan(rival.tag, film.standings));
    await expect(page.getByRole("button", { name: `Voir ${rival.tag} sur la carte` })).toHaveAttribute("aria-current", "true");
    const world = page.getByRole("button", { name: "Vue d'ensemble" });
    await expect(world).toBeVisible();
    await world.click();
    await expect(caption(page)).toBeHidden();
    await expect(page.getByRole("button", { name: `Voir ${rival.tag} sur la carte` })).not.toHaveAttribute("aria-current", "true");
  });

  test("la carte se manie à la molette, à la souris et au clavier, sans changer aucun chiffre", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "La souris et le clavier sont testés sur desktop.");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    const before = await page.getByTestId("film-gal").textContent();
    const world = page.getByRole("button", { name: "Vue d'ensemble" });
    await expect.poll(() => zoom(page)).toBe(1);
    await expect(world).toBeHidden();
    const box = (await canvas(page).boundingBox())!;
    const [x, y] = [box.x + box.width * 0.52, box.y + box.height * 0.35];

    // La molette zoome sur l'endroit visé, jamais plus loin que la limite.
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, -300);
    await expect.poll(() => zoom(page)).toBeGreaterThan(1.5);
    await expect(world).toBeVisible();
    for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -300);
    await drawn(page);
    const closest = await zoom(page);
    expect(closest).toBeGreaterThan(3);
    await page.mouse.wheel(0, -300);
    await drawn(page);
    expect(await zoom(page)).toBe(closest);

    // Glisser déplace la carte : tirée vers la gauche, la vue va vers l'est.
    const [x0] = await centre(page);
    await page.mouse.down();
    await page.mouse.move(x - 160, y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => (await centre(page))[0]).toBeGreaterThan(x0);
    // Le déplacement n'est pas un clic : aucun clan n'est nommé.
    await expect(caption(page)).toBeHidden();

    // « Vue d'ensemble » rend la carte entière.
    await world.click();
    await expect.poll(() => zoom(page)).toBe(1);
    await expect(world).toBeHidden();

    // Les touches de la carte : plus et moins, à la souris.
    await page.getByRole("button", { name: "Zoomer sur la carte" }).click();
    await expect.poll(() => zoom(page)).toBeGreaterThan(1.5);
    await page.getByRole("button", { name: "Dézoomer la carte" }).click();
    await expect.poll(() => zoom(page)).toBe(1);
    await expect(world).toBeHidden();

    // Au clavier, une fois la carte choisie : plus, flèche, puis zéro. Son mode d'emploi est dit aux lecteurs d'écran.
    await expect(page.getByTestId("film-map")).toHaveAccessibleDescription(/les flèches déplacent la carte/);
    await page.getByTestId("film-map").focus();
    await page.keyboard.press("+");
    await page.keyboard.press("+");
    await expect.poll(() => zoom(page)).toBeGreaterThan(2);
    const [k0, ky0] = await centre(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await centre(page))[0]).toBeGreaterThan(k0);
    await page.keyboard.press("ArrowDown");
    await expect.poll(async () => (await centre(page))[1]).toBeGreaterThan(ky0);
    // Les flèches ne font pas défiler la page : elle tient dans l'écran.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.keyboard.press("0");
    await expect.poll(() => zoom(page)).toBe(1);
    await expect(page.getByTestId("film-gal")).toHaveText(before ?? "");
    expect(await pageScroll(page)).toBe(0);
  });

  test("une vue choisie par le visiteur reste pendant la lecture du film", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "La molette est testée sur desktop.");
    await page.goto("/carte");
    await expect(playButton(page)).toContainText("Pause", { timeout: 8000 });
    await playButton(page).click();
    await seekTo(page, 0);
    const box = (await canvas(page).boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.35);
    await page.mouse.wheel(0, -260);
    await expect.poll(() => zoom(page)).toBeGreaterThan(1.5);
    await page.waitForTimeout(600);
    const chosen = await zoom(page);
    // Le film passe sur le premier pixel de GAL, filmé de près d'ordinaire : la caméra ne reprend pas la main.
    await playButton(page).click();
    await expect(caption(page)).toHaveText("Premier pixel de GAL", { timeout: 8000 });
    await page.waitForTimeout(1500);
    expect(await zoom(page)).toBe(chosen);
    await expect(page.getByRole("button", { name: "Vue d'ensemble" })).toBeVisible();
  });

  test("si le film ne charge pas, la carte finale reste et on peut réessayer", async ({ page }) => {
    await page.route("**/generated/carte/film.bin.gz", (r) => r.abort());
    await page.goto("/carte");
    await expect(page.getByText("Le film n'a pas pu être chargé.")).toBeVisible();
    await expect(page.locator("[data-testid=film-map] img")).toBeVisible();
    await expect(playButton(page)).toBeHidden();
    await expect(page.getByTestId("film-gal")).not.toBeEmpty();
    // Le podium de la page, sans le film : ses cinq lignes tiennent dans leur cadre, l'une sous l'autre, sans se chevaucher.
    await openWindow(page, "clans");
    const rows = await page.locator("[data-film-rows] > li").evaluateAll((items) => items.map((item) => item.getBoundingClientRect()).map((r) => ({ top: r.top, bottom: r.bottom })));
    const ladder = (await page.locator("[data-film-rows]").boundingBox())!;
    expect(rows).toHaveLength(Math.min(5, film.standings.length));
    rows.forEach((row, i) => {
      expect(row.top).toBeGreaterThanOrEqual(ladder.y - 1);
      expect(row.bottom).toBeLessThanOrEqual(ladder.y + ladder.height + 1);
      if (i > 0) expect(row.top).toBeGreaterThanOrEqual(rows[i - 1]!.bottom - 1);
    });
    // Les fenêtres qui ne dépendent pas du film s'ouvrent quand même ; celles qui le rejouent n'ont pas d'entrée.
    await openWindow(page, "objectif");
    await expect(page.getByTestId("map-pixels")).toBeVisible();
    await expect(entry(page, "moments")).toBeHidden();
    expect(await pageScroll(page)).toBe(0);
    errors = [];
    await page.unroute("**/generated/carte/film.bin.gz");
    await page.getByRole("button", { name: "Réessayer" }).click();
    await expect(playButton(page)).toBeVisible();
    await expect(page.getByText("Le film n'a pas pu être chargé.")).toBeHidden();
    await expect(entry(page, "moments")).toBeVisible();
  });

  test("signale une carte périmée", async ({ page }) => {
    await page.clock.setFixedTime(new Date(Date.parse(film.fetchedAt) + 3 * 86_400_000));
    await page.goto("/carte");
    const warning = page.getByText(/Données périmées : dernière mise à jour il y a \d+/);
    await expect(warning).toBeVisible();
    // L'avertissement allonge la session : posé sur la carte, le podium s'arrête dessous au lieu de le recouvrir.
    await expect(playButton(page)).toBeVisible();
    await expect(warning).toBeInViewport({ ratio: 1 });
    const session = (await page.locator(".carte-session").boundingBox())!;
    const podium = await page.locator(".carte-podium").boundingBox();
    if (podium && (page.viewportSize()?.width ?? 0) >= 1200) expect(podium.y).toBeGreaterThanOrEqual(session.y + session.height);
    expect(await pageScroll(page)).toBe(0);
  });

  test("sans JavaScript, la page défile : la carte finale, toutes les fenêtres et le pied de page restent", async ({ browser }, testInfo) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: testInfo.project.use.baseURL });
    const page = await context.newPage();
    await page.goto("/carte");
    await expect(page.locator("[data-testid=film-map] img")).toBeVisible();
    // Pas de console sans script : une page ordinaire, plus haute que l'écran, avec son pied de page et le crédit de la carte.
    expect(await pageScroll(page)).toBeGreaterThan(0);
    await expect(page.locator("body > footer").getByRole("link", { name: "Mentions légales", exact: true })).toBeVisible();
    await expect(page.getByTestId("map-credit")).toBeVisible();
    await expect(page.getByTestId("map-credit").getByRole("link", { name: "© OpenFront and Contributors · CC BY-SA 4.0" })).toHaveAttribute("href", "/mentions-legales#credits");
    // Les réserves n'ont leur case que si la fiche du clan a répondu : jamais une case « Pas de données » de plus.
    const reservesKnown = (film.treasury?.troops ?? null) !== null || (film.treasury?.caps ?? null) !== null;
    await expect(page.getByTestId("map-figure")).toHaveCount(reservesKnown ? 4 : 3);
    // Rien n'est caché : tout ce qui ne demande pas le film se lit, l'un sous l'autre.
    for (const id of ["map-peak", "map-pixels", "film-gal", "film-fronts", "map-clans"]) await expect(page.getByTestId(id)).toBeVisible();
    // Sans réponse de la fiche du clan, une ligne le dit au lieu d'une case vide ; avec, la case des réserves suffit.
    await expect(page.getByTestId("map-no-reserves")).toHaveCount(reservesKnown ? 0 : 1);
    if (!reservesKnown) await expect(page.getByTestId("map-no-reserves")).toBeVisible();
    // La plus belle journée reste lisible, sans son bouton inutile, et le tableau des journées aussi.
    if (datedFilm) {
      await expect(page.getByTestId("film-days")).toBeVisible();
      if (dayHighlights(dayRows(film.days, film.frames, film.fetchedAt)).gain) {
        await expect(page.getByTestId("map-day").first()).toBeVisible();
        await expect(page.getByRole("button", { name: "Revoir cette journée" }).first()).toBeHidden();
      }
    }
    // Ce qui ne sert qu'avec le film n'est pas là : ni lecture, ni fenêtre vide, ni bouton pour fermer.
    await expect(playButton(page)).toBeHidden();
    for (const id of ["moments", "zones", "reglages"]) await expect(windowOf(page, id)).toBeHidden();
    await expect(page.getByRole("button", { name: /^Fermer la fenêtre/ })).toHaveCount(0);
    // La rangée reste une liste de liens vers les parties de la page.
    await dock(page).getByRole("link", { name: "Fronts" }).click();
    await expect(page).toHaveURL(/#fronts$/);
    await expect(page.getByTestId("film-fronts")).toBeInViewport();
    await context.close();
  });

  test("si le script de la page n'arrive pas, la console se retire et la page défile", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Testé une seule fois.");
    await page.route("**/_astro/*.js", (route) => route.abort());
    await page.goto("/carte");
    // D'abord la console, posée avant le premier affichage ; sans nouvelle de son script, elle se retire.
    await expect(page.locator("html")).toHaveClass(/carte-console/);
    await expect(page.locator("html")).not.toHaveClass(/carte-console/, { timeout: 10_000 });
    expect(await pageScroll(page)).toBeGreaterThan(0);
    await expect(page.locator("body > footer")).toBeVisible();
    await expect(page.getByTestId("map-pixels")).toBeVisible();
    // Les scripts refusés par ce test laissent des erreurs de chargement : elles sont attendues.
    errors = [];
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
    await expect(caption(page)).toHaveText("Premier pixel de GAL", { timeout: 8000 });

    await openWindow(page, "moments");
    const push = page.getByRole("button", { name: /La plus grande poussée/ });
    const frame = Number(await push.getAttribute("data-film-moment"));
    await push.click();
    await expect(caption(page)).toContainText("La plus grande poussée", { timeout: 8000 });
    await expect(push).toHaveAttribute("aria-current", "true");
    expect(await position(page)).toBeGreaterThanOrEqual(frame);
  });

  test("on peut regarder un front ou une zone, puis revenir à la vue d'ensemble", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    const front = film.galSummary.fronts.find((f: { at: unknown }) => f.at);
    const world = page.getByRole("button", { name: "Vue d'ensemble" });

    await openWindow(page, "fronts");
    await page.getByRole("button", { name: `Voir le front avec ${front.tag} sur la carte` }).click();
    await expect(caption(page)).toContainText(`Front ${front.tag}`);
    await expect(world).toBeVisible();
    // La caméra cadre le front, puis rend la carte entière : le dessin suit à l'image suivante.
    await expect.poll(() => zoom(page)).toBeGreaterThan(1);
    await world.click();
    await expect(caption(page)).toBeHidden();
    await expect(world).toBeHidden();
    await expect.poll(() => zoom(page)).toBe(1);

    await openWindow(page, "zones");
    await page.getByRole("button", { name: /Zone 1/ }).click();
    await expect(caption(page)).toContainText("Zone 1");
    expect(await position(page)).toBe(film.frames.length);
  });

  test("un écran qui change garde la fenêtre ouverte, et un téléphone retrouve toujours la sienne", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    // Sous la carte, les clans : le podium du film y est, la place de GAL avant les cinq premiers.
    await expect(windowOf(page, "clans")).toBeVisible();
    const gal = (await page.getByTestId("film-gal").boundingBox())!;
    const ladder = (await page.locator("[data-film-rows]").boundingBox())!;
    expect(gal.y).toBeLessThan(ladder.y);
    // Les réglages du film ont leur fenêtre.
    await openWindow(page, "reglages");
    await expect(page.getByRole("slider", { name: "Vitesse" })).toBeVisible();
    // L'écran s'élargit : les réglages se posent à côté de la frise, leur fenêtre n'existe plus, et le podium se pose sur la carte.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(openWindows(page)).toHaveCount(0);
    await expect(entry(page, "reglages")).toBeHidden();
    await expect(page.getByRole("slider", { name: "Vitesse" })).toBeVisible();
    await expect(page.getByTestId("film-gal")).toBeVisible();
    // Une fenêtre ouverte le reste d'un écran à l'autre.
    await openWindow(page, "fronts");
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(windowOf(page, "fronts")).toBeVisible();
    // Fermée sur grand écran, le téléphone retrouve les clans.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.keyboard.press("Escape");
    await expect(openWindows(page)).toHaveCount(0);
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(windowOf(page, "clans")).toBeVisible();
    expect(await pageScroll(page)).toBe(0);
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
    await expect(caption(page)).toHaveText(expected.caption);
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
    await expect(playButton(page)).toBeVisible();
    await showSettings(page);
    const last = [...dayRows(film.days, film.frames, film.fetchedAt)].reverse().find((d) => d.complete)!;
    const button = page.getByTestId("film-last-day");
    await expect(button).toHaveText(`Revoir le ${fmtDay(last.date)}`);
    await button.click();
    expect(await position(page)).toBe(last.frame);
    await expect(caption(page)).toContainText(fmtDay(last.date));
    await expect(page.getByTestId("film-gal")).toHaveText(galLine(last));
  });

  test("la page donne le prochain palier de pixels, sans l'inventer", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    await openWindow(page, "objectif");
    const next = nextThreshold(film.galSummary.pixels);
    const line = page.getByTestId("map-next-threshold");
    if (!next) await expect(line).toHaveCount(0);
    else await expect(line).toHaveText(`Prochain palier : ${fmtInt(next.threshold)} pixels, encore ${fmtInt(next.remaining)}.`);
  });

  // La console de la page est en style Terminal : chaque fenêtre a ses couleurs à elle, contrôlées comme le reste du site.
  // Les tests d'accessibilité de site.spec.ts ne voient que la fenêtre ouverte à l'arrivée.
  test("chaque fenêtre passe le contrôle d'accessibilité WCAG AA", async ({ page }) => {
    test.slow();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    await page.waitForLoadState("networkidle");
    for (const id of await dock(page).getByRole("link").filter({ visible: true }).evaluateAll((links) => links.map((link) => link.getAttribute("data-ouvre") ?? ""))) {
      await openWindow(page, id);
      const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(violations.map((v) => `${id} — ${v.id}: ${v.nodes.map((n) => n.target).join(" ; ")}`)).toEqual([]);
    }
    // Un clan nommé sur la carte : la légende et le bouton « Vue d'ensemble » aussi.
    await openWindow(page, "clans");
    await page.getByTestId("map-clans").getByRole("button").first().click();
    await expect(page.getByRole("button", { name: "Vue d'ensemble" })).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(violations.map((v) => `clan choisi — ${v.id}: ${v.nodes.map((n) => n.target).join(" ; ")}`)).toEqual([]);
  });

  // Le soir de la mise en ligne, tous les chiffres de la page étaient en vert de terminal, et le pilote a trouvé « trop de
  // verts dans les textes ». Le vert n'est plus que la voix de la machine : la ligne de commande de chaque fenêtre,
  // « ~/carte », les « > » et les icônes. Aucun texte ni aucun chiffre n'est vert, dans aucune fenêtre.
  test("le vert ne sert qu'aux lignes de commande et aux icônes, jamais aux textes ni aux chiffres", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    // Le vert de la console, tel que le navigateur l'écrit dans la page Carte (une sonde posée dedans voit aussi un vert
    // redéfini pour elle seule).
    const vert = await page.locator("[data-carte]").evaluate((carte) => {
      const sonde = document.createElement("i");
      sonde.style.color = "var(--console-vert)";
      carte.append(sonde);
      const couleur = getComputedStyle(sonde).color;
      sonde.remove();
      return couleur;
    });
    // Une vraie couleur, et pas le blanc du texte : sans quoi le contrôle ne prouverait rien.
    expect(vert).not.toBe(await page.locator("[data-carte]").evaluate((carte) => getComputedStyle(carte).color));
    const textesVerts = () =>
      page.evaluate((vert) => {
        const verts: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>("[data-carte] *")) {
          // L'invite de la session (« gal@carte:~$ ./carte ») est une commande. Les textes décoratifs cachés aux lecteurs
          // d'écran, comme la date posée sur la carte, sont contrôlés : ils se voient.
          if (el.closest(".console-invite, .sr-only") || el.getClientRects().length === 0) continue;
          const texte = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? "").join("").trim();
          if (texte && getComputedStyle(el).color === vert) verts.push(`${el.tagName.toLowerCase()}.${el.className} : ${texte.slice(0, 40)}`);
        }
        return verts;
      }, vert);
    expect(await textesVerts(), "à l'arrivée").toEqual([]);
    for (const id of await dock(page).getByRole("link").filter({ visible: true }).evaluateAll((links) => links.map((link) => link.getAttribute("data-ouvre") ?? ""))) {
      await openWindow(page, id);
      expect(await textesVerts(), id).toEqual([]);
    }
    // La voix de la machine, elle, reste verte : la ligne de commande d'une fenêtre.
    await openWindow(page, "clans");
    expect(await windowOf(page, "clans").locator(".carte-fenetre-corps[data-commande]").evaluate((el) => getComputedStyle(el, "::before").color)).toBe(vert);
  });

  // La mention d'OpenFront et la licence du fond de carte ne sont jamais à plus d'un regard : un crédit posé sur la carte,
  // comme sur toute carte en ligne, quelle que soit la fenêtre ouverte. Il mène aux crédits des mentions légales, qui
  // disent tout. La console n'a pas de bas de page : sur un écran large, le code source et les mentions légales sont sur
  // la carte, eux aussi ; sur téléphone, où la carte est trop petite pour deux lignes, au bas de la fenêtre ouverte.
  // « Légende » et « À propos », retirées le 13 novembre 2026 à la demande du pilote, ne reviennent pas dans la rangée.
  test("le crédit de la carte reste sous les yeux, avec le code source et les mentions légales", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carte");
    await expect(playButton(page)).toBeVisible();
    await expect(dock(page).getByRole("link", { name: /Légende|À propos/ })).toHaveCount(0);
    const pose = await page.evaluate((media) => matchMedia(media).matches, ECRAN_POSE);
    const credit = page.getByTestId("map-credit");
    const pied = page.getByTestId("carte-pied");
    const mention = credit.getByRole("link", { name: "© OpenFront and Contributors · CC BY-SA 4.0", exact: true });
    const source = (pose ? credit : pied).getByRole("link", { name: "Code source", exact: true });
    const mentions = (pose ? credit : pied).getByRole("link", { name: "Mentions légales", exact: true });
    await expect(source).toHaveAttribute("href", clan.links.source);
    // Un seul des deux exemplaires se voit, selon l'écran.
    await expect(page.locator("[data-carte]").getByRole("link", { name: "Code source", exact: true })).toHaveCount(1);
    await expect(page.locator("[data-carte]").getByRole("link", { name: "Mentions légales", exact: true })).toHaveCount(1);
    for (const link of pose ? [mention, source, mentions] : [mention]) {
      await expect(link).toBeInViewport({ ratio: 1 });
      // Une cible assez haute pour le doigt.
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(24);
    }
    if (!pose) {
      // Sur téléphone, la carte ne garde que la mention, sur une ligne : la légende des grands moments passe au-dessus,
      // sous le bouton « Vue d'ensemble ».
      expect((await credit.boundingBox())!.height).toBeLessThan(40);
      await expect(pied).toContainText("Site communautaire non officiel");
      await expect(pied).toContainText("Code sous licence AGPL-3.0");
      await source.scrollIntoViewIfNeeded();
      await expect(source).toBeInViewport();
      await expect(mentions).toBeInViewport();
      expect(await pageScroll(page)).toBe(0);
    }
    // Une fenêtre ouverte ne le recouvre pas : il se clique encore.
    await openWindow(page, "clans");
    await expect(credit).toBeInViewport({ ratio: 1 });
    await mention.click();
    await expect(page).toHaveURL(/\/mentions-legales\/?#credits$/);
    const license = page.getByTestId("map-license");
    await expect(license).toBeInViewport();
    await expect(license).toContainText("© OpenFront and Contributors");
    await expect(license).toContainText("Ce site a réduit le fond de carte, assombri sa terre et redessiné sa mer ; le fond reste sous la même licence");
    await expect(license.getByRole("link", { name: "CC BY-SA 4.0" })).toHaveAttribute("href", "https://creativecommons.org/licenses/by-sa/4.0/deed.fr");
    await expect(license.getByRole("link", { name: "Giant World Map" })).toHaveAttribute("href", /resources\/maps\/giantworldmap$/);
    // Et les mentions légales elles-mêmes.
    await page.goBack();
    await expect(playButton(page)).toBeVisible();
    await mentions.click();
    await expect(page).toHaveURL(/\/mentions-legales\/?$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mentions légales");
  });

  // Une fenêtre ouverte laisse peu de place entre elle et le podium : la mention passe sur deux lignes au lieu de glisser
  // sous le podium, et sous 1 008 px le crédit passe dans le coin, sous la fenêtre raccourcie. La légende des grands
  // moments reste au-dessus de lui.
  for (const [width, height] of [
    [800, 600],
    [900, 700],
    [1024, 768],
    [1100, 800],
    [1280, 720],
  ] as const) {
    test(`à ${width} × ${height}, une fenêtre ouverte, le crédit ne passe ni sous le podium ni sous la fenêtre`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "Formats testés une seule fois.");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width, height });
      await page.goto("/carte#clans");
      await expect(windowOf(page, "clans")).toBeVisible();
      type Boite = { x: number; y: number; width: number; height: number };
      const separees = (a: Boite, b: Boite) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      const credit = (await page.getByTestId("map-credit").boundingBox())!;
      const podium = (await page.locator(".carte-podium").boundingBox())!;
      const fenetre = (await windowOf(page, "clans").boundingBox())!;
      expect(separees(credit, podium), "podium").toBe(true);
      expect(separees(credit, fenetre), "fenêtre").toBe(true);
      await expect(page.getByTestId("map-credit").getByRole("link", { name: "Code source", exact: true })).toBeInViewport({ ratio: 1 });
      const legende = await page.locator(".film-caption").evaluate((el) => getComputedStyle(el).bottom);
      const carte = (await page.getByTestId("film-map").boundingBox())!;
      expect(carte.y + carte.height - parseFloat(legende)).toBeLessThanOrEqual(credit.y);
    });
  }
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

test("sur téléphone, un toucher nomme le clan, et deux doigts zooment la carte", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Testé sur mobile.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/carte");
  await expect(playButton(page)).toBeVisible();
  const box = (await canvas(page).boundingBox())!;
  const [x, y] = [box.x + box.width * 0.31, box.y + box.height * 0.6];
  await page.touchscreen.tap(x, y);
  await expect(caption(page)).toContainText("au dernier relevé");
  await expect(page.getByRole("button", { name: "Vue d'ensemble" })).toBeVisible();
  // La phrase du clan se pose entre le bouton « Vue d'ensemble » et le crédit, sans couvrir ni l'un ni l'autre.
  const phrase = (await caption(page).boundingBox())!;
  const bouton = (await page.getByRole("button", { name: "Vue d'ensemble" }).boundingBox())!;
  expect(phrase.y).toBeGreaterThanOrEqual(bouton.y + bouton.height);
  expect(phrase.y + phrase.height).toBeLessThanOrEqual((await page.getByTestId("map-credit").boundingBox())!.y);
  await page.getByRole("button", { name: "Vue d'ensemble" }).tap();
  await expect(caption(page)).toBeHidden();

  // Deux doigts qui s'écartent : la carte s'approche, sans nommer de clan.
  const session = await page.context().newCDPSession(page);
  const fingers = (spread: number) => [
    { x: x - spread, y, id: 1 },
    { x: x + spread, y, id: 2 },
  ];
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: fingers(20) });
  for (const spread of [30, 45, 60, 80]) await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: fingers(spread) });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => zoom(page)).toBeGreaterThan(2);
  await expect(caption(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "Vue d'ensemble" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
