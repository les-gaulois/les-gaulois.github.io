import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Le Gaulois compagnon (src/scripts/compagnon.ts, « Le Gaulois compagnon » dans docs/DESIGN.md) : il suit le visiteur au
// bas de la fenêtre, de page en page. Ces tests tournent sans serveur : tout le monde y voit le Gaulois de départ. La
// tenue d'un membre connecté s'essaie avec un faux serveur, hors du dépôt (voir docs/DESIGN.md).

const compagnon = (page: Page) => page.locator("[data-compagnon]");
const gaulois = (page: Page) => page.getByRole("button", { name: "Le Gaulois compagnon : lui parler" });
const bulle = (page: Page) => page.locator("[data-compagnon-bulle]");
const parole = (page: Page) => page.locator("[data-compagnon-parole]");
const pauseButton = (page: Page) => page.getByRole("button", { name: "Mettre les animations en pause" });
const revenir = (page: Page) => page.getByRole("button", { name: "Faire revenir le Gaulois" });

/** Le bord gauche de son dessin, en pixels de la page. */
const placeX = (page: Page) => compagnon(page).evaluate((el) => Math.round(el.getBoundingClientRect().left));

/** Son salut spontané est dit une fois par onglet : déjà dit, il ne gêne pas les tests qui ne le regardent pas. */
const sansSalut = (page: Page) => page.addInitScript(() => sessionStorage.setItem("gal-compagnon-salue", "1"));

/** Ouvre sa bulle d'un clic, et attend la phrase. */
async function luiParler(page: Page): Promise<void> {
  await gaulois(page).click();
  await expect(compagnon(page)).toHaveAttribute("data-bulle", "1");
  await expect(parole(page)).not.toBeEmpty();
}

test("il est là, au bas de la fenêtre, dans le pied de page, et il a un nom", async ({ page }) => {
  await sansSalut(page);
  for (const path of ["/", "/classement", "/village"]) {
    await page.goto(path);
    await expect(compagnon(page), path).toBeVisible();
    await expect(page.getByRole("contentinfo").getByRole("button", { name: "Le Gaulois compagnon : lui parler" })).toBeVisible();
    await expect(gaulois(page)).toHaveAttribute("aria-expanded", "false");
    // Son dessin (le Gaulois de départ, peint à la construction du site), et son pied au bas de la fenêtre.
    expect(await page.locator("[data-compagnon-image]").evaluate((el) => getComputedStyle(el).backgroundImage)).toMatch(/\/compagnon\/depart-gaulois\.png\?v=[0-9a-f]{12}"\)$/);
    const cadre = await compagnon(page).boundingBox();
    const hauteur = page.viewportSize()?.height ?? 0;
    expect(Math.round((cadre?.y ?? 0) + (cadre?.height ?? 0))).toBe(hauteur);
  }
});

test("sa bulle ouverte passe le contrôle d'accessibilité", async ({ page }) => {
  await sansSalut(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await luiParler(page);
  await expect(bulle(page)).toBeVisible();
  await expect(page.getByRole("group", { name: "Le Gaulois compagnon" }).getByRole("button", { name: "Ranger" })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ; ")}`)).toEqual([]);
});

test("au clavier : Entrée ouvre la bulle, Échap la ferme et rend le focus, les flèches le déplacent", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Clavier testé sur desktop.");
  await sansSalut(page);
  await page.goto("/classement");
  await expect(compagnon(page)).toBeVisible();
  await gaulois(page).focus();
  await page.keyboard.press("Enter");
  await expect(gaulois(page)).toHaveAttribute("aria-expanded", "true");
  await expect(parole(page)).toHaveText("Voyons où en est le clan.");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Reste là" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(gaulois(page)).toHaveAttribute("aria-expanded", "false");
  await expect(compagnon(page)).not.toHaveAttribute("data-bulle", "1");
  await expect(gaulois(page)).toBeFocused();
  // Le focus se voit.
  expect(await gaulois(page).evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
  const avant = await placeX(page);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  expect(await placeX(page)).toBe(avant + 48);
  await page.keyboard.press("ArrowLeft");
  expect(await placeX(page)).toBe(avant + 24);
  await expect(compagnon(page)).toHaveAttribute("data-vers", "gauche");
});

test("il garde sa place d'une page à l'autre, et au retour arrière", async ({ page }) => {
  await sansSalut(page);
  await page.goto("/");
  await expect(compagnon(page)).toBeVisible();
  await gaulois(page).focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
  const ici = await placeX(page);
  await page.goto("/classement");
  await expect(compagnon(page)).toBeVisible();
  expect(Math.abs((await placeX(page)) - ici)).toBeLessThanOrEqual(1);
  // Déplacé sur la seconde page : au retour arrière, il est là où on l'a laissé en dernier, pas sur l'ancienne place.
  await gaulois(page).focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  const la = await placeX(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(compagnon(page)).toBeVisible();
  await expect.poll(() => placeX(page)).toBe(la);
});

test("au retour arrière d'une page gardée par le navigateur, il reprend la place et l'état de l'onglet", async ({ page }) => {
  await sansSalut(page);
  await page.goto("/classement");
  await expect(compagnon(page)).toBeVisible();
  const avant = await placeX(page);
  // Ce qu'aurait changé une autre page de l'onglet, puis le retour d'une page gardée en mémoire (bfcache).
  await page.evaluate(() => {
    sessionStorage.setItem("gal-compagnon-place", JSON.stringify({ part: 0.5, vers: -1 }));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await expect.poll(() => placeX(page)).not.toBe(avant);
  await expect(compagnon(page)).toHaveAttribute("data-vers", "gauche");
  // Rangé entre-temps sur une autre page : il ne revient pas tout seul.
  await page.evaluate(() => {
    localStorage.setItem("gal-compagnon-range", "1");
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await expect(compagnon(page)).toBeHidden();
  await expect(revenir(page)).toBeVisible();
});

test("la pause de l'en-tête l'arrête net, sans le faire disparaître", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Le curseur est testé sur desktop.");
  await sansSalut(page);
  await page.goto("/classement");
  await expect(compagnon(page)).toBeVisible();
  await pauseButton(page).click();
  await expect(page.locator("html")).toHaveClass(/fx-off/);
  const avant = await placeX(page);
  await page.mouse.move(1_100, 600, { steps: 8 });
  await page.waitForTimeout(2_000);
  expect(await placeX(page)).toBe(avant);
  await expect(compagnon(page)).not.toHaveAttribute("data-pose", "marche");
  // En pause, on peut toujours lui parler, sans saut.
  await luiParler(page);
  await expect(page.locator("[data-compagnon-image]")).not.toHaveClass(/compagnon-saut/);
  await page.keyboard.press("Escape");
  // Sans pause, il rejoint le curseur, lentement.
  await pauseButton(page).click();
  await expect(page.locator("html")).not.toHaveClass(/fx-off/);
  await page.mouse.move(1_100, 620, { steps: 4 });
  await expect(compagnon(page)).toHaveAttribute("data-pose", "marche", { timeout: 3_000 });
  await expect.poll(() => placeX(page)).toBeGreaterThan(avant);
});

test("rangé, il ne revient que si on le rappelle, aussi depuis le village", async ({ page }) => {
  await sansSalut(page);
  await page.goto("/");
  await luiParler(page);
  await page.getByRole("button", { name: "Ranger" }).click();
  await expect(compagnon(page)).toBeHidden();
  const piedDePage = page.getByRole("contentinfo").getByRole("button", { name: "Faire revenir le Gaulois" });
  await expect(piedDePage).toBeVisible();
  await expect(piedDePage).toBeFocused();
  await page.goto("/classement");
  await page.waitForTimeout(2_500);
  await expect(compagnon(page)).toBeHidden();
  await expect(piedDePage).toBeVisible();
  // Rangé, rien n'est chargé ni peint.
  expect(await page.locator("[data-compagnon-image]").evaluate((el) => el.style.backgroundImage)).toBe("");
  // Au village, on peut le rappeler sous le titre de la page.
  await page.goto("/village");
  await expect(revenir(page)).toHaveCount(2);
  const sousLeTitre = page.getByRole("main").getByRole("button", { name: "Faire revenir le Gaulois" });
  await expect(sousLeTitre).toBeVisible();
  await sousLeTitre.click();
  await expect(compagnon(page)).toBeVisible();
  await expect(gaulois(page)).toBeFocused();
  await expect(revenir(page).first()).toBeHidden();
  await expect(revenir(page).last()).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("gal-compagnon-range"))).toBeNull();
});

test("il ne vient pas sur la Carte, et retrouve le visiteur à la page suivante", async ({ page }) => {
  await sansSalut(page);
  await page.goto("/carte");
  await page.waitForTimeout(2_500);
  await expect(compagnon(page)).toBeHidden();
  await page.goto("/");
  await expect(compagnon(page)).toBeVisible();
});

test("à 360 px, ni lui ni sa bulle ne font défiler la page de côté", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "La largeur est réglée ici.");
  await sansSalut(page);
  await page.setViewportSize({ width: 360, height: 780 });
  for (const path of ["/", "/village", "/classement"]) {
    await page.goto(path);
    await expect(compagnon(page)).toBeVisible();
    // Au bord droit, la bulle ouverte.
    await gaulois(page).focus();
    for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowRight");
    await luiParler(page);
    const cadre = await bulle(page).boundingBox();
    expect((cadre?.x ?? -1) >= 0 && (cadre?.x ?? 0) + (cadre?.width ?? 0) <= 360, path).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0);
    await page.keyboard.press("Escape");
  }
});

test("« réduire les animations » : il reste debout à sa place, sans salut ni saut", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Le curseur est testé sur desktop.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/classement");
  await expect(compagnon(page)).toBeVisible();
  const avant = await placeX(page);
  await page.mouse.move(1_100, 600, { steps: 8 });
  await page.waitForTimeout(3_000);
  expect(await placeX(page)).toBe(avant);
  await expect(compagnon(page)).not.toHaveAttribute("data-bulle", "1");
  await luiParler(page);
  await expect(page.locator("[data-compagnon-image]")).not.toHaveClass(/compagnon-saut/);
  expect(await compagnon(page).evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
});

test("il salue une fois par onglet, pas à chaque page", async ({ page }) => {
  await page.goto("/");
  await expect(compagnon(page)).toHaveAttribute("data-bulle", "1", { timeout: 6_000 });
  await expect(parole(page)).not.toBeEmpty();
  await page.goto("/classement");
  await expect(compagnon(page)).toBeVisible();
  await page.waitForTimeout(3_000);
  await expect(compagnon(page)).not.toHaveAttribute("data-bulle", "1");
});

test("il ne couvre pas ce qui est fixé au bas de la fenêtre", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Une largeur suffit.");
  await sansSalut(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/classement");
  await expect(compagnon(page)).toBeVisible();
  // Une fenêtre fixée au coin bas gauche, comme celles des appels du QG à droite : il se pose à côté, sans la couvrir.
  await page.evaluate(() => {
    const coin = document.createElement("div");
    coin.dataset.compagnonObstacle = "";
    coin.id = "essai-coin";
    coin.style.cssText = "position:fixed;left:0;bottom:0;width:420px;height:180px;background:#123";
    document.body.append(coin);
  });
  await expect.poll(() => placeX(page)).toBeGreaterThanOrEqual(428);
  // Toute la largeur : il s'efface, le temps qu'elle reste.
  await page.evaluate(() => {
    const coin = document.getElementById("essai-coin");
    if (coin) coin.style.width = "100%";
  });
  await expect(compagnon(page)).toHaveAttribute("data-efface", "1");
  await expect(gaulois(page)).toBeHidden();
  await page.evaluate(() => document.getElementById("essai-coin")?.remove());
  await expect(compagnon(page)).not.toHaveAttribute("data-efface", "1");
  await expect(gaulois(page)).toBeVisible();
});

test("en bas de page, la mention de licence d'OpenFront et le dernier lien se lisent sans lui devant", async ({ page }) => {
  await sansSalut(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const image = page.locator("[data-compagnon-image]");
  const chevauche = async (cible: ReturnType<Page["locator"]>) => {
    const a = await image.boundingBox();
    const b = await cible.boundingBox();
    if (!a || !b) return true;
    return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  };
  for (const path of ["/classement", "/village"]) {
    await page.goto(path);
    await expect(compagnon(page)).toBeVisible();
    // Au bout de la page, il se tient sous le pied de page, dans la place qui lui est gardée.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const mention = page.getByRole("contentinfo").getByText("© OpenFront and Contributors", { exact: false }).first();
    await expect.poll(() => chevauche(mention), path).toBe(false);
    const dernier = page.getByRole("contentinfo").getByRole("link", { name: "Code source" });
    await expect.poll(() => chevauche(dernier), path).toBe(false);
    // Un lien qui prend le focus au clavier remonte au-dessus de lui.
    await page.evaluate(() => window.scrollTo(0, 0));
    await dernier.focus();
    await expect.poll(() => chevauche(dernier), path).toBe(false);
  }
});

test("un lien atteint au clavier n'est jamais caché derrière lui", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Clavier testé sur desktop.");
  await sansSalut(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/classement");
  await expect(compagnon(page)).toBeVisible();
  const x = await placeX(page);
  // Un lien posé juste sous lui, au bas de la fenêtre.
  await page.evaluate((gauche) => {
    const lien = document.createElement("a");
    lien.href = "#essai";
    lien.id = "essai-lien";
    lien.textContent = "Essai";
    lien.style.cssText = `position:fixed;left:${gauche + 20}px;bottom:16px;z-index:1`;
    document.body.append(lien);
  }, x);
  await page.keyboard.press("Shift");
  await page.locator("#essai-lien").focus();
  const chevauche = async () => {
    const a = await page.locator("[data-compagnon-image]").boundingBox();
    const b = await page.locator("#essai-lien").boundingBox();
    if (!a || !b) return true;
    return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  };
  await expect.poll(chevauche).toBe(false);
  await expect(gaulois(page)).toBeVisible();
});

test("le clavier d'un téléphone ou la page agrandie du bout des doigts l'effacent, le temps qu'il faut", async ({ page }) => {
  await sansSalut(page);
  await page.goto("/classement");
  await expect(compagnon(page)).toBeVisible();
  // Ce que le navigateur dit de la partie visible de la page (visualViewport) : un clavier ouvert, puis refermé.
  const visible = (hauteur: number, echelle: number) =>
    page.evaluate(
      ([h, s]) => {
        const vue = window.visualViewport;
        if (!vue) return;
        Object.defineProperty(vue, "height", { configurable: true, get: () => h });
        Object.defineProperty(vue, "scale", { configurable: true, get: () => s });
        vue.dispatchEvent(new Event("resize"));
      },
      [hauteur, echelle] as const,
    );
  const hauteur = page.viewportSize()?.height ?? 800;
  await visible(hauteur * 0.5, 1);
  await expect(compagnon(page)).toHaveAttribute("data-efface", "1");
  await expect(gaulois(page)).toBeHidden();
  await visible(hauteur, 1);
  await expect(compagnon(page)).not.toHaveAttribute("data-efface", "1");
  await visible(hauteur / 2, 2);
  await expect(compagnon(page)).toHaveAttribute("data-efface", "1");
  await visible(hauteur, 1);
  await expect(gaulois(page)).toBeVisible();
});

test("ni à l'impression, ni en contraste élevé il ne gêne la lecture", async ({ page }) => {
  await sansSalut(page);
  await page.goto("/");
  await expect(compagnon(page)).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(compagnon(page)).toBeHidden();
  await page.emulateMedia({ media: "screen", forcedColors: "active" });
  await expect(compagnon(page)).toBeVisible();
  await luiParler(page);
  // La bulle prend un vrai cadre ; le Gaulois garde son dessin et ses couleurs.
  expect(await bulle(page).evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe("solid");
  expect(await page.locator("[data-compagnon-image]").evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("/compagnon/depart-gaulois.png");
  expect(await page.locator("[data-compagnon-image]").evaluate((el) => getComputedStyle(el).forcedColorAdjust)).toBe("none");
});

test("un visiteur ne télécharge pas le dessin du Gaulois : deux petites images, peintes à la construction du site", async ({ page }) => {
  await sansSalut(page);
  const dessins: string[] = [];
  const planches: string[] = [];
  page.on("request", (r) => {
    if (/\/_astro\/(dessin|gaulois|poses)\.[^/]+\.js$/.test(r.url())) dessins.push(r.url());
    if (r.url().includes("/compagnon/depart-")) planches.push(r.url());
  });
  await page.goto("/");
  await expect(compagnon(page)).toBeVisible();
  await page.goto("/classement");
  await expect(compagnon(page)).toBeVisible();
  expect(dessins).toEqual([]);
  const version = await compagnon(page).getAttribute("data-version");
  expect(version).toMatch(/^[0-9a-f]{12}$/);
  // Ses quatre poses et son lit, une case par pixel, à l'adresse de la version du dessin.
  const adresses = [`/compagnon/depart-gaulois.png?v=${version}`, `/compagnon/depart-lit.png?v=${version}`];
  expect([...new Set(planches.map((u) => new URL(u).pathname + new URL(u).search))].sort()).toEqual(adresses);
  const tailles = await page.evaluate(
    (liste) =>
      Promise.all(
        liste.map(async (adresse) => {
          const image = new Image();
          image.src = adresse;
          await image.decode();
          return [image.naturalWidth, image.naturalHeight];
        }),
      ),
    adresses,
  );
  expect(tailles).toEqual([
    [4 * 48, 64],
    [2 * 68, 44],
  ]);
  // Des images gardées d'un ancien dessin : elles ne sont pas reprises.
  await page.evaluate(() => {
    const gardees = JSON.parse(sessionStorage.getItem("gal-compagnon-images") ?? "{}") as { cle: string };
    sessionStorage.setItem("gal-compagnon-images", JSON.stringify({ ...gardees, cle: gardees.cle.replace(/^(\d+)\.[0-9a-f]+:/, "$1.ancien:"), gaulois: "data:image/png;base64,AAAA" }));
  });
  await page.goto("/rejoindre");
  await expect(compagnon(page)).toBeVisible();
  expect(await page.locator("[data-compagnon-image]").evaluate((el) => el.style.backgroundImage)).toContain(`depart-gaulois.png?v=${version}`);
  expect(await page.evaluate(() => (JSON.parse(sessionStorage.getItem("gal-compagnon-images") ?? "{}") as { cle?: string }).cle)).toContain(`.${version}:`);
  expect(dessins).toEqual([]);
});
