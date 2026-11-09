import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Le mouvement du site. Depuis le 9 novembre 2026, le site est immobile : plus de fond animé, plus de titres mot à mot,
 * plus de blocs qui apparaissent au défilement, plus de bouton pause. Seuls bougent, à la demande ou pour montrer un calcul :
 * le film de la carte (tests/e2e/carte.spec.ts), le rejeu du calculateur, le tri des membres et les chiffres d'un filtre.
 */
const PAGES = ["/", "/gazette", "/parties", "/nouveautes", "/classement", "/rivaux", "/progression", "/records", "/membres", "/carte", "/activite", "/debuter", "/outils", "/rejoindre"];

/** Amène un élément au centre de l'écran sans défilement animé : le test ne vise pas une page en mouvement. */
const centerOnScreen = (locator: Locator) => locator.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));

/** Attend que les composants interactifs de la page aient démarré. */
const hydrated = (page: Page) => page.waitForFunction(() => !document.querySelector("astro-island[ssr]"));

/** Les erreurs JavaScript de la page, console comprise. */
const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
};

/** Retient si le dernier clic droit a gardé le menu habituel du navigateur. */
const watchContextMenu = (page: Page) =>
  page.evaluate(() => {
    window.addEventListener("contextmenu", (e) => {
      (window as unknown as { __prevented: boolean }).__prevented = e.defaultPrevented;
    });
  });
const menuPrevented = (page: Page) => page.evaluate(() => (window as unknown as { __prevented?: boolean }).__prevented);

/** Les blocs de la page qui ne sont pas entièrement visibles : opacité, visibilité ou découpe. */
const hiddenBlocks = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("main section, main article, main .card, main h1, main h2")]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .filter((el) => {
        const style = getComputedStyle(el);
        return style.opacity !== "1" || style.visibility !== "visible" || style.clipPath !== "none";
      })
      .map((el) => el.id || el.className || el.tagName),
  );

// La garantie la plus importante : tout le contenu est là dès le chargement, sans attendre un défilement ni un script.
for (const path of PAGES) {
  test(`tout le contenu est visible dès le chargement : ${path}`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await hiddenBlocks(page)).toEqual([]);
    // Ni fond animé, ni barre de progression, ni infobulle qui suit le curseur.
    await expect(page.locator("#fx-territory, #fx-sparks, #fx-aurora, #fx-progress, #fx-tip")).toHaveCount(0);
    expect(errors, "aucune erreur JavaScript").toEqual([]);
  });
}

test("aucune animation ne tourne seule à l'ouverture d'une page", async ({ page }) => {
  for (const path of ["/", "/gazette", "/classement", "/rivaux", "/progression", "/records", "/activite", "/debuter", "/outils", "/rejoindre"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
    expect(running, path).toBe(0);
  }
});

// Le rejeu du calculateur ne tourne plus en boucle : il attend un geste, et chaque rejeu dure 5 s au plus (WCAG 2.2.2).
test("le rejeu du calculateur attend un geste du visiteur", async ({ page }) => {
  await page.goto("/outils");
  await hydrated(page);
  const troops = page.getByTestId("replay-troops");
  await expect(troops).not.toBeEmpty();
  const still = await troops.textContent();
  await page.waitForTimeout(1500);
  expect(await troops.textContent()).toBe(still);
});

test("ni bouton pause, ni phrase d'instruction : il n'y a plus d'effet à piloter", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /animations/i })).toHaveCount(0);
  await expect(page.getByText("Bougez la souris")).toHaveCount(0);
  // L'ancien choix « en pause », gardé dans le navigateur, est effacé : il ne sert plus.
  await page.evaluate(() => localStorage.setItem("gal-fx", "off"));
  await page.reload();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("gal-fx"))).toBeNull();
});

test("le titre de l'accueil reste un seul texte, sans découpe mot à mot", async ({ page }) => {
  await page.goto("/");
  const title = page.getByRole("heading", { level: 1 });
  await expect(title.locator("span")).toHaveCount(0);
});

test("le clic droit garde son menu partout", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "La souris est testée sur desktop.");
  await page.goto("/rejoindre");
  await watchContextMenu(page);
  await page.mouse.click(20, 500, { button: "right" });
  expect(await menuPrevented(page)).toBe(false);
  await page.getByRole("heading", { level: 1 }).click({ button: "right" });
  expect(await menuPrevented(page)).toBe(false);
});

test("une recherche tapée avant le démarrage de la page est prise en compte", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Testé une seule fois.");
  await page.route("**/_astro/*LeaderboardTable*", async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  await page.goto("/classement", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Rechercher un clan").fill("zzzzzz");
  await expect(page.getByText("Aucun clan ne correspond")).toBeVisible({ timeout: 5000 });
});

test("le classement montre les scores en barres proportionnelles", async ({ page }) => {
  await page.goto("/classement");
  const first = page.locator("tbody tr .score-bar").first();
  await expect(first).toHaveAttribute("style", /width:\s*100%/);
  await page.goto("/rivaux");
  await expect(page.getByTestId("score-lanes").locator("li")).toHaveCount(3);
});

test("le graphique des parties donne le détail d'une barre au survol", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Le survol est testé sur desktop.");
  await page.goto("/progression");
  await hydrated(page);
  const bars = page.locator(".bar-stack");
  await expect(bars.first()).toBeVisible();
  const bar = bars.nth(Math.floor((await bars.count()) / 2));
  await centerOnScreen(bar);
  const box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
  const label = page.getByTestId("chart-label");
  await expect(label).toBeVisible();
  expect(Number((await label.textContent())?.replace(/\D/g, ""))).toBeGreaterThan(0);
  await expect(page.locator(".chart-cursor")).toBeVisible();
  await page.mouse.move(4, 4);
  await expect(label).toBeHidden();
});

test("les chiffres d'une période finissent sur la bonne valeur", async ({ page }) => {
  await page.goto("/progression");
  await hydrated(page);
  await page.getByRole("button", { name: "7 jours" }).click();
  const screenReaderValue = page.locator("dd .sr-only").first();
  const value = page.getByTestId("summary-Parties");
  await expect.poll(async () => value.textContent(), { timeout: 2000 }).toBe(await screenReaderValue.textContent());
});

test("chaque case de la heatmap donne son détail au survol", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "La heatmap du bureau est testée sur desktop.");
  await page.goto("/activite");
  const cell = page.getByTestId("heatmap").locator("td[title]").nth(100);
  await expect(cell).toHaveAttribute("title", /\d+ h : \d+ partie/);
});

test("le calculateur rejoue l'attaque à la demande, et le rejeu reste cohérent", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Testé une seule fois.");
  await page.goto("/outils");
  await hydrated(page);
  const replay = page.getByTestId("attack-replay");
  await centerOnScreen(replay);
  const troops = page.getByTestId("replay-troops");
  const number = async () => Number((await troops.textContent())?.replace(/\D/g, "") ?? 0);
  await page.getByRole("button", { name: "Rejouer l'attaque" }).click();
  await expect.poll(number, { timeout: 2000 }).toBeGreaterThan(0);
  const values = new Set<number>();
  await expect
    .poll(
      async () => {
        values.add(await number());
        return values.size;
      },
      { timeout: 6000, intervals: [120] },
    )
    .toBeGreaterThan(2);
  const minimum = Number((await page.getByTestId("calc-minimum").textContent())?.replace(/\D/g, ""));
  expect(Math.max(...values)).toBeLessThanOrEqual(minimum);
});

test("trier les membres fait glisser les lignes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Le tableau est testé sur desktop.");
  await page.goto("/membres");
  await expect(page.getByTestId("member-row").first()).toBeVisible();
  await page.waitForTimeout(800);
  // Trier par parties garde en grande partie les mêmes lignes : elles changent seulement de place.
  const glided = page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const begin = performance.now();
        const check = () => {
          const found = [...document.querySelectorAll("tbody tr[data-key]")].some((row) =>
            row.getAnimations().some((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)),
          );
          if (found) return resolve(true);
          if (performance.now() - begin > 4000) return resolve(false);
          requestAnimationFrame(check);
        };
        check();
      }),
  );
  await page.getByRole("button", { name: /Parties/ }).click();
  expect(await glided).toBe(true);
});

test("avec « réduire les animations », le calculateur et le tri ne bougent plus", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/outils");
  await hydrated(page);
  const troops = page.getByTestId("replay-troops");
  await expect(troops).not.toBeEmpty();
  // Un champ modifié donne directement l'image finale du nouvel envoi, sans rejeu.
  await page.getByLabel("Taille du bot").fill("2000");
  await page.waitForTimeout(300);
  const frozen = await troops.textContent();
  await page.waitForTimeout(400);
  expect(await troops.textContent()).toBe(frozen);
  // Sans mouvement possible, pas de bouton pour rejouer.
  await expect(page.getByRole("button", { name: "Rejouer l'attaque" })).toHaveCount(0);

  if (testInfo.project.name !== "desktop") return;
  await page.goto("/membres");
  await expect(page.getByTestId("member-row").first()).toBeVisible();
  const glided = page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const begin = performance.now();
        const check = () => {
          const found = [...document.querySelectorAll("tbody tr[data-key]")].some((row) => row.getAnimations().length > 0);
          if (found) return resolve(true);
          if (performance.now() - begin > 1500) return resolve(false);
          requestAnimationFrame(check);
        };
        check();
      }),
  );
  await page.getByRole("button", { name: /Parties/ }).click();
  expect(await glided).toBe(false);
});

test("sans JavaScript, tout le contenu reste visible", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: testInfo.project.use.baseURL, viewport: testInfo.project.use.viewport });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByTestId("stat-card")).toHaveCount(5);
  for (const id of ["stats-title", "progress-title", "slots-title", "join-title"]) {
    await expect(page.locator(`#${id}`)).toBeVisible();
    await expect(page.locator(`section:has(> div > #${id}), section:has(> #${id})`).first()).toHaveCSS("opacity", "1");
  }
  await context.close();
});

test("sur téléphone, l'ouverture de l'accueil tient dans le haut du premier écran", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mesuré sur téléphone.");
  await page.goto("/");
  const hero = page.locator('section[aria-labelledby="hero-title"]');
  const box = (await hero.boundingBox())!;
  const viewport = page.viewportSize()!;
  // L'en-tête, l'ouverture et son bouton : moins des deux tiers de l'écran. Le premier contenu suit dans le même écran.
  expect(box.y + box.height).toBeLessThan(viewport.height * (2 / 3));
  await expect(page.getByRole("link", { name: "Rejoindre le Discord" })).toBeInViewport();
});
