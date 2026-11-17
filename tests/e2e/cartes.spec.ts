import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Les cartes du podium, la carte d'un membre et le reflet d'un bloc de fiche, sur la page d'essai (src/lib/essai-cartes.ts).
 * Sans les Gaulois relevés par la GitHub Action, l'accueil montre le guerrier : ces tests sont les seuls à voir les cartes.
 * La page d'essai n'existe que si le site est construit avec GAL_ESSAI=1 (`GAL_ESSAI=1 npm run build`) : sans elle, ces
 * tests sont sautés, et il faut le dire dans le rapport.
 *
 * Chaque test garde un défaut trouvé par le pilote le 17 novembre 2026 : des cartes qui ne s'inclinaient pas, des reflets
 * qui glissaient hors de la carte, la plaque du nom décentrée sur les cartes de côté.
 */
const PAGE = "/essai/cartes";

test.beforeEach(async ({ page }) => {
  const reponse = await page.goto(PAGE);
  test.skip(reponse === null || reponse.status() === 404, "La page d'essai n'est pas construite : GAL_ESSAI=1 npm run build.");
  await expect(page.getByTestId("hero-card")).toHaveCount(3);
});

/** L'angle de la carte autour de son axe vertical, en degrés, d'après sa transformation calculée. */
const angle = (carte: Locator) =>
  carte.evaluate((el) => {
    const t = getComputedStyle(el).transform;
    if (!t.startsWith("matrix3d")) return 0;
    const m = t.slice(9, -1).split(",").map(Number);
    return (Math.asin(-(m[2] ?? 0)) * 180) / Math.PI;
  });

/** Pose l'inclinaison à la main, animations en pause : le script ne la reprend pas. */
async function incliner(page: Page, mx: number, my: number): Promise<void> {
  await page.evaluate(
    ([x, y]) => {
      for (const carte of document.querySelectorAll<HTMLElement>(".podium-carte")) {
        carte.style.setProperty("--carte-mx", String(x));
        carte.style.setProperty("--carte-my", String(y));
      }
    },
    [mx, my],
  );
}

test("les cartes du podium s'inclinent vers la souris, et reviennent à plat en pause", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "La souris : sur ordinateur.");
  const cartes = page.getByTestId("essai-podium").locator(".podium-carte");
  const boite = (await page.getByTestId("essai-podium").boundingBox())!;
  // La souris loin à gauche, puis loin à droite : la carte tourne d'un côté puis de l'autre, vraiment (transformation calculée).
  await page.mouse.move(Math.max(2, boite.x - 400), boite.y + 60);
  await expect.poll(() => angle(cartes.first()), { timeout: 6000 }).toBeLessThan(-4);
  await page.mouse.move(boite.x + boite.width + 400, boite.y + 60);
  await expect.poll(() => angle(cartes.first()), { timeout: 6000 }).toBeGreaterThan(4);
  // Jamais plus que l'inclinaison prévue.
  expect(Math.abs(await angle(cartes.first()))).toBeLessThanOrEqual(11.5);
  await page.locator("[data-fx-toggle]").click();
  await expect.poll(() => angle(cartes.first())).toBe(0);
});

test("la plaque du nom reste au milieu de chaque carte, même sur celles de côté", async ({ page }) => {
  await page.locator("[data-fx-toggle]").click();
  const ecarts = await page
    .getByTestId("essai-podium")
    .locator(".podium-carte")
    .evaluateAll((cartes) =>
      cartes.map((carte) => {
        const face = carte.querySelector(".podium-carte-face")!.getBoundingClientRect();
        const plaque = carte.querySelector(".podium-carte-bas")!.getBoundingClientRect();
        return Math.abs(plaque.left + plaque.width / 2 - (face.left + face.width / 2));
      }),
    );
  for (const ecart of ecarts) expect(ecart).toBeLessThanOrEqual(1.5);
});

test("la feuille d'un reflet couvre toute la carte à toutes les inclinaisons, sans glisser dehors", async ({ page }) => {
  await page.locator("[data-fx-toggle]").click();
  // La deuxième carte porte un reflet (arc-en-ciel) ; la carte du membre, un autre (prisme).
  const reflets = page.locator('.podium-carte[data-reflet]:not(.bloc-effet .podium-carte)');
  await expect(reflets).toHaveCount(2);
  for (const [mx, my] of [
    [-1, -1],
    [0, 0],
    [1, 1],
  ] as const) {
    await incliner(page, mx, my);
    const couvertes = await reflets.evaluateAll((cartes) =>
      cartes.map((carte) => {
        const cadre = carte.querySelector(".podium-carte-face")!;
        const face = cadre.getBoundingClientRect();
        // La feuille remplit l'intérieur de la face : son liseré n'en fait pas partie.
        const bord = parseFloat(getComputedStyle(cadre).borderLeftWidth) + 1;
        const feuille = carte.querySelector(".podium-carte-holo")!;
        const f = feuille.getBoundingClientRect();
        const style = getComputedStyle(feuille);
        // La feuille ne glisse pas (ni translate ni transform) et son dessin est bien là.
        return f.left <= face.left + bord && f.right >= face.right - bord && f.top <= face.top + bord && f.bottom >= face.bottom - bord && style.translate === "none" && style.backgroundImage !== "none";
      }),
    );
    expect(couvertes, `inclinaison ${mx}, ${my}`).toEqual([true, true]);
  }
});

test("l'arc-en-ciel offert dérive sans jamais découvrir la carte, et s'arrête en pause", async ({ page }) => {
  const carte = page.getByTestId("essai-podium").locator(".podium-carte:not([data-reflet])").first();
  const feuille = carte.locator(".podium-carte-holo");
  await expect(feuille).toHaveCSS("animation-name", "podium-carte-derive");
  for (const [mx, my] of [
    [-1, -1],
    [1, 1],
  ] as const) {
    await incliner(page, mx, my);
    const couvre = await carte.evaluate((el) => {
      const face = el.querySelector(".podium-carte-face")!.getBoundingClientRect();
      const f = el.querySelector(".podium-carte-holo")!.getBoundingClientRect();
      return f.left <= face.left + 1 && f.right >= face.right - 1 && f.top <= face.top + 1 && f.bottom >= face.bottom - 1;
    });
    expect(couvre, `inclinaison ${mx}, ${my}`).toBe(true);
  }
  await page.locator("[data-fx-toggle]").click();
  await expect(feuille).toHaveCSS("animation-name", "none");
});

test("chaque carte du podium dessine la finition de sa place, et l'efface en pause", async ({ page }) => {
  const peintes = () =>
    page
      .getByTestId("essai-podium")
      .locator('.podium-carte:not([data-reflet]) canvas[data-toile="fond"]')
      .evaluateAll((toiles) =>
        (toiles as HTMLCanvasElement[]).map((toile) => {
          const d = toile.getContext("2d")!.getImageData(0, 0, toile.width, toile.height).data;
          let n = 0;
          for (let i = 3; i < d.length; i += 4) if ((d[i] ?? 0) > 0) n++;
          return n;
        }),
      );
  // Le premier (champignon atomique) et le troisième (feu d'artifice) : des animations en pixels.
  await expect.poll(async () => (await peintes()).every((n) => n > 0), { timeout: 8000 }).toBe(true);
  await page.locator("[data-fx-toggle]").click();
  await expect.poll(async () => (await peintes()).every((n) => n === 0)).toBe(true);
});

test("le Gaulois a ses six couches, la place reste devant lui, et rien ne déborde", async ({ page }) => {
  const carte = page.getByTestId("essai-podium").locator(".podium-carte").first();
  await expect(carte.locator(".podium-carte-gaulois img")).toHaveCount(6);
  await expect(carte.locator(".podium-carte-rang")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  // Sur une machine de test, la page ne passe pas en mode léger d'elle-même dès l'ouverture.
  await expect(page.locator("html")).not.toHaveClass(/cartes-econome/);
});

test("le reflet d'un bloc de fiche reste sous l'écriture et ne bouge pas sans la souris", async ({ page }) => {
  const bloc = page.getByTestId("essai-bloc");
  await bloc.scrollIntoViewIfNeeded();
  const carte = bloc.locator(".bloc-effet .podium-carte");
  await expect(bloc.locator("h2")).toBeVisible();
  expect(await bloc.locator(".bloc-effet").evaluate((el) => getComputedStyle(el).zIndex)).toBe("-1");
  // Trois secondes sans que la souris bouge : le reflet revient au repos, et n'en bouge plus.
  await page.mouse.move(2, 2);
  await page.waitForTimeout(5500);
  expect(Math.abs(Number(await carte.evaluate((el: HTMLElement) => el.style.getPropertyValue("--carte-mx") || "0")))).toBeLessThan(0.05);
});

test("la couronne du champion est sur la tête du premier, et de lui seul", async ({ page }) => {
  await page.locator("[data-fx-toggle]").click();
  const podium = page.getByTestId("essai-podium");
  await expect(podium.locator(".podium-carte-couronne")).toHaveCount(1);
  const carte = podium.locator(".podium-carte").first();
  await expect(carte).toHaveAttribute("data-champion", "");
  const places = await carte.evaluate((el) => {
    const face = el.querySelector(".podium-carte-face")!.getBoundingClientRect();
    const c = el.querySelector(".podium-carte-couronne")!.getBoundingClientRect();
    const g = el.querySelector(".podium-carte-gaulois")!.getBoundingClientRect();
    return {
      dedans: c.left >= face.left && c.right <= face.right && c.top >= face.top,
      surLaTete: c.bottom >= g.top - 2 && c.bottom <= g.top + g.height * 0.2,
      auDessusDuGaulois: c.left >= g.left - c.width * 0.5 && c.right <= g.right + c.width * 0.5,
      lisible: c.width >= g.width * 0.3,
    };
  });
  expect(places).toEqual({ dedans: true, surLaTete: true, auDessusDuGaulois: true, lisible: true });
});

test("le cadre animé entoure la carte du membre, bouge, et reste en place en pause", async ({ page }) => {
  const carte = page.getByTestId("member-card");
  await carte.scrollIntoViewIfNeeded();
  const toile = carte.locator('canvas[data-toile="cadre"]');
  await expect(toile).toHaveCount(1);
  const empreinte = () =>
    toile.evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let peints = 0;
      let somme = 0;
      for (let k = 3; k < d.length; k += 4) {
        if (d[k]! > 0) peints++;
        somme = (somme * 31 + d[k - 2]!) >>> 0;
      }
      return { peints, somme };
    });
  await expect.poll(async () => (await empreinte()).peints).toBeGreaterThan(3000);
  const avant = await empreinte();
  await expect.poll(async () => (await empreinte()).somme).not.toBe(avant.somme);
  // La toile dépasse la carte de tous les côtés ; la plaque du nom reste dans le cadre. La carte flotte de quelques
  // pixels : sa place est contrôlée à ce flottement près.
  const places = await carte.evaluate((el) => {
    const c = el.querySelector(".podium-carte")!.getBoundingClientRect();
    const t = el.querySelector('canvas[data-toile="cadre"]')!.getBoundingClientRect();
    const n = el.querySelector(".podium-carte-bas")!.getBoundingClientRect();
    const hote = el.getBoundingClientRect();
    return { deborde: t.left < c.left && t.right > c.right && t.top < c.top && t.bottom > c.bottom, nomDedans: n.left > c.left + 6 && n.right < c.right - 6 && n.bottom < c.bottom - 6, aSaPlace: t.top >= hote.top - 14 && t.bottom <= hote.bottom + 14 };
  });
  expect(places).toEqual({ deborde: true, nomDedans: true, aSaPlace: true });
  // En pause, le cadre reste peint et ne bouge plus : c'est un objet du membre, pas un effet.
  await page.locator("[data-fx-toggle]").click();
  await page.waitForTimeout(500);
  const fige = await empreinte();
  expect(fige.peints).toBeGreaterThan(3000);
  await page.waitForTimeout(500);
  expect((await empreinte()).somme).toBe(fige.somme);
});

test("le familier se pose en bas à droite de la carte, devant le Gaulois, sans en sortir", async ({ page }) => {
  await page.locator("[data-fx-toggle]").click();
  const carte = page.getByTestId("essai-podium").locator(".podium-carte").first();
  const familier = carte.locator(".podium-carte-familier");
  await expect(familier).toBeVisible();
  const places = await carte.evaluate((el) => {
    const face = el.querySelector(".podium-carte-face")!.getBoundingClientRect();
    const f = el.querySelector(".podium-carte-familier")!.getBoundingClientRect();
    const g = el.querySelector(".podium-carte-gaulois")!.getBoundingClientRect();
    const plaque = el.querySelector(".podium-carte-bas")!.getBoundingClientRect();
    return { dedans: f.left >= face.left && f.right <= face.right + 0.5 && f.top >= face.top, aDroite: f.left + f.width / 2 > g.left + g.width / 2, auDessusDeLaPlaque: f.bottom <= plaque.top + 1, pasPlusGrand: f.height <= g.height };
  });
  expect(places).toEqual({ dedans: true, aDroite: true, auDessusDeLaPlaque: true, pasPlusGrand: true });
  // Les deux autres joueurs n'en montrent pas : rien n'est inventé.
  await expect(page.getByTestId("essai-podium").locator(".podium-carte-familier")).toHaveCount(1);
});

