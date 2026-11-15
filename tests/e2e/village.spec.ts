import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";
import { batimentEnCours } from "../../src/lib/village/chantier";
import { entrerDans, fenetreDeLInterieur, interieursOuverts, phraseDuDedans } from "../../src/lib/village/ecran-interieur";
import { BATIMENTS_A_INTERIEUR, type InterieurId, interieurDe } from "../../src/lib/village/interieurs";
import type { EtatDuMonde } from "../../src/lib/village/monde-etat";
import { FENETRES_DU_MONDE, etatDuBatimentEnMots, nomDuFeu, phraseDuChantier, pointsDuFeu } from "../../src/lib/village/monde/textes";
import { phraseDuReleve } from "../../src/lib/village/vie";

/*
 * Le monde du village (/village, 14 novembre 2026) pour un visiteur, sur le site construit sans serveur : le monde, le
 * chantier et le grand feu (publics, calculés à la construction), les fenêtres ouvertes par la rangée d'icônes et par leur
 * adresse, Échap, le clavier, la pause, l'accessibilité et les largeurs. Les Gaulois des membres, la marche d'un lieu à
 * l'autre et les plaques de la forge viennent du serveur : leurs règles sont testées en unitaire (village-monde-marche,
 * village-ecran-place) et à l'écran avec un faux serveur, hors du dépôt.
 */

/** L'état que la page a reçu : celui que publie /village/monde.json, calculé à la même construction. */
async function etatPublie(page: Page): Promise<EtatDuMonde> {
  const reponse = await page.request.get("/village/monde.json");
  expect(reponse.ok()).toBe(true);
  return (await reponse.json()) as EtatDuMonde;
}

/** Le monde est prêt : la page a gardé sa mise en page d'écran, et la scène est mesurée. */
async function pret(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-monde-pret", "");
  await expect(page.getByTestId("monde")).toBeVisible();
}

/** Les fenêtres qu'un visiteur peut ouvrir : sans compte, ni le marché ni « Qui est où ». */
const FENETRES_DU_VISITEUR = FENETRES_DU_MONDE.filter((f) => !f.compte);

/** Ce que disent les tests des intérieurs tant qu'il n'y a rien à ouvrir. */
const SANS_INTERIEUR = "Aucun bâtiment fini n'a encore son dedans dessiné (src/lib/village/interieurs/lot-1.ts et lot-2.ts) : rien à ouvrir.";

/**
 * Le premier bâtiment fini qui a son dedans, dans l'ordre du chantier, trouvé dans la page (la zone posée sur lui porte
 * `data-interieur`) ; `null` : aucun. Les zones de la page sont exactement les bâtiments que l'état publié a finis et
 * qui ont leur dessin : ni un de plus (un bâtiment en chantier ne s'ouvre pas), ni un de moins.
 */
async function premierInterieur(page: Page): Promise<InterieurId | null> {
  const etat = await etatPublie(page);
  await expect(page.getByTestId("monde-zone-forge")).toBeAttached();
  const dansLaPage = await page.locator(".monde-zone[data-interieur]").evaluateAll((zones) => zones.map((zone) => zone.getAttribute("data-interieur") ?? ""));
  const attendus = interieursOuverts(etat);
  expect([...dansLaPage].sort()).toEqual([...attendus].sort());
  return attendus[0] ?? null;
}

test("le monde se visite : un seul écran, le dessin caché aux lecteurs d'écran, la ligne du pied de page posée dessus", async ({ page }) => {
  await page.goto("/village");
  await pret(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Le village");
  // La page ne défile plus : le monde remplit la fenêtre sous l'en-tête, et le pied de page du site est caché.
  expect(await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight)).toBeLessThanOrEqual(1);
  await expect(page.locator("body > footer")).toBeHidden();
  for (const dessin of await page.getByTestId("monde").locator(".monde-dessin").all()) await expect(dessin).toHaveAttribute("aria-hidden", "true");
  const credit = page.getByTestId("monde-credit");
  await expect(credit.getByRole("link", { name: "Code source", exact: true })).toHaveAttribute("href", "https://github.com/les-gaulois/les-gaulois.github.io");
  await expect(credit.getByRole("link", { name: "Mentions légales", exact: true })).toHaveAttribute("href", "/mentions-legales");
  await expect(credit.getByRole("link", { name: "© OpenFront and Contributors", exact: true })).toHaveAttribute("href", "/mentions-legales#credits");
  // Sans compte : pas de Gaulois des membres sur le dessin.
  await expect(page.getByTestId("monde-gaulois")).toHaveCount(0);
});

test("les étiquettes du chantier et du grand feu disent leurs chiffres et l'heure du relevé, ou qu'il n'y a pas de données", async ({ page }) => {
  const etat = await etatPublie(page);
  await page.goto("/village");
  await pret(page);
  const releve = phraseDuReleve(etat.releve);
  const chantier = page.getByTestId("monde-etiquette-chantier");
  const feu = page.getByTestId("monde-etiquette-feu");
  const enCours = batimentEnCours(etat.chantier);
  if (enCours) await expect(chantier).toContainText(phraseDuChantier(enCours));
  else if (!etat.chantier) await expect(chantier).toContainText("Pas de données");
  if (etat.feu) {
    await expect(feu).toContainText(nomDuFeu(etat.feu));
    await expect(feu).toContainText(pointsDuFeu(etat.feu));
  } else await expect(feu).toContainText("Pas de données");
  if (releve) {
    if (enCours || !etat.chantier) await expect(chantier).toContainText(releve);
    await expect(feu).toContainText(releve);
  }
  // Chaque étiquette est un vrai bouton qui ouvre sa fenêtre.
  await feu.click();
  await expect(page.getByTestId("monde-fenetre-feu")).toBeVisible();
  if (etat.feu) await expect(page.getByTestId("monde-feu")).toContainText(pointsDuFeu(etat.feu));
  else await expect(page.getByTestId("monde-feu-sans-donnees")).toBeVisible();
});

test("la fenêtre du chantier dit chaque bâtiment comme l'état publié", async ({ page }) => {
  const etat = await etatPublie(page);
  await page.goto("/village#chantier");
  await pret(page);
  const fenetre = page.getByTestId("monde-fenetre-chantier");
  await expect(fenetre).toBeVisible();
  if (!etat.chantier) {
    await expect(page.getByTestId("monde-chantier-sans-donnees")).toContainText("Pas de données");
    return;
  }
  const lignes = fenetre.locator(".monde-batiments li");
  await expect(lignes).toHaveCount(etat.chantier.batiments.length);
  for (const [i, b] of etat.chantier.batiments.entries()) {
    await expect(lignes.nth(i)).toContainText(b.titre);
    await expect(lignes.nth(i)).toContainText(etatDuBatimentEnMots(b, b.id === etat.chantier.en_cours));
    await expect(lignes.nth(i)).toHaveAttribute("data-etat", b.fini_le !== null ? "fini" : b.id === etat.chantier.en_cours ? "chantier" : "attente");
  }
  // Aucun nombre à virgule : les points s'écrivent en entiers, comme sur Discord.
  await expect(fenetre).not.toContainText(/\d,\d/);
});

test("les icônes ouvrent chaque fenêtre, Échap la referme aussitôt et rend le focus à l'icône", async ({ page }) => {
  await page.goto("/village");
  await pret(page);
  for (const f of FENETRES_DU_VISITEUR) {
    const entree = page.getByTestId(`monde-entree-${f.id}`);
    await entree.click();
    const fenetre = page.getByTestId(`monde-fenetre-${f.id}`);
    // Échap pressée tout de suite après l'ouverture : la touche n'est pas perdue.
    await page.keyboard.press("Escape");
    await expect(fenetre).toBeHidden();
    await expect(entree).toBeFocused();
    await expect(entree).toHaveAttribute("aria-expanded", "false");
    await entree.click();
    await expect(fenetre).toBeVisible();
    await expect(fenetre.getByRole("heading", { level: 2, name: f.titre })).toBeVisible();
    await expect(entree).toHaveAttribute("aria-expanded", "true");
    expect(new URL(page.url()).hash).toBe(`#${f.id}`);
    // Le bouton de la barre la referme aussi.
    await fenetre.getByTestId("monde-fermer").click();
    await expect(fenetre).toBeHidden();
    expect(new URL(page.url()).hash).toBe("");
  }
});

test("les adresses ouvrent leur fenêtre ; #place et le marché d'un visiteur laissent le monde seul", async ({ page }) => {
  for (const f of FENETRES_DU_VISITEUR) {
    await page.goto(`/village#${f.id}`);
    await pret(page);
    await expect(page.getByTestId(`monde-fenetre-${f.id}`)).toBeVisible();
  }
  for (const ancre of ["#place", "#marche", "#qui"]) {
    await page.goto("/");
    await page.goto(`/village${ancre}`);
    await pret(page);
    await expect(page.locator(".monde-fenetre:visible")).toHaveCount(0);
  }
  // L'ancre qui change, page ouverte : la fenêtre suit.
  await page.evaluate(() => (location.hash = "#feu"));
  await expect(page.getByTestId("monde-fenetre-feu")).toBeVisible();
});

test("au clavier, la scène prend le focus et les flèches déplacent le monde", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Clavier testé sur desktop.");
  // Sans mouvement, la caméra saute : le déplacement se lit tout de suite.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/village");
  await pret(page);
  const calque = page.locator(".monde-monde");
  // Ce que le monde a glissé vers la gauche, en pixels : la colonne de gauche de la vue, agrandie.
  const decalage = () => calque.evaluate((el) => Math.abs(new DOMMatrixReadOnly(getComputedStyle(el).transform).m41));
  await page.getByTestId("monde").focus();
  await expect(page.getByTestId("monde")).toBeFocused();
  const avant = await decalage();
  await page.keyboard.press("ArrowRight");
  await expect.poll(decalage).toBeGreaterThan(avant);
  await page.keyboard.press("Home");
  await expect.poll(decalage).toBe(0);
  await page.keyboard.press("End");
  await expect.poll(decalage).toBeGreaterThan(avant);
});

test("à l'arrivée, la grand-rue et ses terrasses derrière elle ; les boutons et les touches plus et moins approchent ou éloignent d'un niveau", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Approche testée sur desktop.");
  // Sans mouvement, le niveau change d'un coup.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/village");
  await pret(page);
  const scene = page.getByTestId("monde");
  const pres = page.getByTestId("monde-plus-pres");
  const loin = page.getByTestId("monde-plus-loin");
  // À l'arrivée : une case du premier plan vaut deux pixels, une case des terrasses du fond un seul.
  await expect(scene).toHaveAttribute("data-niveau", "2");
  await expect(loin).toBeEnabled();
  // La colline : deux terrasses au moins derrière la grand-rue, peintes deux fois plus petites.
  const terrasses = page.getByTestId("monde-terrasse");
  expect(await terrasses.count()).toBeGreaterThanOrEqual(2);
  const tuile = terrasses.first().locator("canvas").first();
  await expect(tuile).toBeAttached();
  expect(await tuile.evaluate((el) => (el as HTMLCanvasElement).offsetWidth / (el as HTMLCanvasElement).width)).toBe(1);
  // Les cases restent entières : d'un niveau à l'autre, le calque du monde est exactement deux fois plus grand.
  const largeur = () => page.locator(".monde-monde").evaluate((el) => (el as HTMLElement).offsetWidth);
  const aDeux = await largeur();
  await scene.focus();
  // La vue d'ensemble : on ne peut pas s'éloigner davantage.
  await page.keyboard.press("-");
  await expect(scene).toHaveAttribute("data-niveau", "1");
  await expect(loin).toBeDisabled();
  expect(await largeur()).toBe(aDeux / 2);
  await pres.click();
  await expect(scene).toHaveAttribute("data-niveau", "2");
  await scene.focus();
  await page.keyboard.press("+");
  await page.keyboard.press("+");
  await page.keyboard.press("+");
  await expect(scene).toHaveAttribute("data-niveau", "4");
  await expect(pres).toBeDisabled();
  expect(await largeur()).toBe(aDeux * 2);
});

test("la petite carte mène à chaque quartier, de la grand-rue comme du bas", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Petite carte testée sur desktop.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/village");
  await pret(page);
  const carte = page.getByTestId("monde-carte");
  await expect(carte.locator("[data-quartier]")).toHaveCount(11);
  for (const quartier of ["port", "gare", "ruisseau", "place"]) {
    await carte.locator(`[data-quartier="${quartier}"]`).click();
    await expect(carte.locator(`[data-quartier="${quartier}"]`)).toHaveAttribute("aria-current", "true");
  }
});

test("le bouton pause fige le monde : plus rien ne bouge", async ({ page }) => {
  await page.goto("/village");
  await pret(page);
  const pause = page.getByRole("button", { name: "Mettre les animations en pause" });
  await expect(pause).toBeVisible();
  await expect.poll(() => page.locator(".monde-nuages").first().evaluate((el) => getComputedStyle(el).animationName)).not.toBe("none");
  await pause.click();
  await expect(page.locator("html")).toHaveClass(/fx-off/);
  await expect(pause).toHaveAttribute("aria-pressed", "true");
  for (const el of await page.locator(".monde-nuages").all()) expect(await el.evaluate((n) => getComputedStyle(n).animationName)).toBe("none");
});

test("sans script, le village se lit en texte : le chantier et le grand feu", async ({ browser }) => {
  const contexte = await browser.newContext({ javaScriptEnabled: false });
  const page = await contexte.newPage();
  const etat = await etatPublie(page);
  await page.goto("/village");
  const texte = page.locator(".monde-sans-script");
  await expect(texte).toBeVisible();
  await expect(texte.getByRole("heading", { level: 2, name: "Le chantier" })).toBeVisible();
  await expect(texte.getByRole("heading", { level: 2, name: "Le grand feu" })).toBeVisible();
  const enCours = batimentEnCours(etat.chantier);
  if (enCours) await expect(texte).toContainText(phraseDuChantier(enCours));
  if (etat.feu) await expect(texte).toContainText(pointsDuFeu(etat.feu));
  else await expect(texte).toContainText("Pas de données");
  await expect(page.locator("body > footer")).toBeVisible();
  await contexte.close();
});

// Le monde et chaque fenêtre d'un visiteur, ouverte : WCAG AA, sans mouvement (le dessin est caché aux lecteurs d'écran).
for (const ancre of ["", ...FENETRES_DU_VISITEUR.map((f) => `#${f.id}`)]) {
  test(`accessibilité WCAG AA du monde : /village${ancre}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/village${ancre}`);
    await pret(page);
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ; ")}`)).toEqual([]);
  });
}

test("aucun défilement horizontal de 360 à 1 920 px, fenêtre fermée ou ouverte", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Largeurs testées une seule fois.");
  for (const width of [360, 375, 414, 768, 1024, 1280, 1366, 1920]) {
    await page.setViewportSize({ width, height: width < 700 ? 780 : 900 });
    for (const ancre of ["", "#chantier", "#gaulois", "#feu"]) {
      await page.goto("/");
      await page.goto(`/village${ancre}`);
      await pret(page);
      const debord = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(debord, `/village${ancre} à ${width} px`).toBeLessThanOrEqual(0);
    }
  }
});

/*
 * Entrer dans les bâtiments (15 novembre 2026) : un bâtiment du chantier fini qui a son dedans dessiné s'ouvre d'un clic
 * sur lui, au clavier, par « Entrer » dans la fenêtre du chantier et par son adresse. Le bâtiment essayé est le premier
 * fini qui a son dessin, lu dans la page ; tant qu'aucun n'est dessiné, ces tests se passent et le disent.
 */

/** La toile du dedans et son cadre, mesurés dans la page. */
async function mesureDuDedans(page: Page) {
  return page.getByTestId("monde-dedans-toile").evaluate((el) => {
    const toile = el as HTMLCanvasElement;
    const r = toile.getBoundingClientRect();
    const cadre = toile.parentElement!.getBoundingClientRect();
    const fenetre = toile.closest(".monde-fenetre")!.getBoundingClientRect();
    return {
      colonnes: toile.width,
      rangees: toile.height,
      largeur: r.width,
      hauteur: r.height,
      pixels: Number(toile.dataset["pixels"]),
      net: toile.dataset["net"],
      densite: window.devicePixelRatio,
      rendu: getComputedStyle(toile).imageRendering,
      dansLeCadre: r.left >= cadre.left - 0.5 && r.right <= cadre.right + 0.5 && r.top >= cadre.top - 0.5 && r.bottom <= cadre.bottom + 0.5,
      ecartAuMilieu: Math.max(Math.abs(r.left + r.right - cadre.left - cadre.right) / 2, Math.abs(r.top + r.bottom - cadre.top - cadre.bottom) / 2),
      dansLEcran: fenetre.left >= -0.5 && fenetre.right <= window.innerWidth + 0.5,
    };
  });
}

test("un bâtiment fini qui a son dedans s'ouvre au clavier et d'un clic ; Échap le referme et rend le focus au bâtiment", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/village");
  await pret(page);
  const id = await premierInterieur(page);
  test.skip(id === null, SANS_INTERIEUR);
  const dessin = interieurDe(id!)!;
  const zone = page.locator(`.monde-zone[data-interieur="${id}"]`);
  await expect(zone).toHaveAccessibleName(entrerDans(id!));
  const fenetre = page.getByTestId("monde-fenetre-interieur");

  // Au clavier : la caméra vient au bâtiment atteint, Entrée y fait entrer.
  await zone.focus();
  await page.keyboard.press("Enter");
  await expect(fenetre).toBeVisible();
  await expect(fenetre).toBeFocused();
  await expect(fenetre).toHaveAttribute("data-interieur", id!);
  await expect(fenetre.getByRole("heading", { level: 2, name: dessin.titre })).toBeVisible();
  expect(new URL(page.url()).hash).toBe(`#${fenetreDeLInterieur(id!)}`);
  // La toile est cachée aux lecteurs d'écran ; la phrase dit ce que c'est, et rien n'écrit de chiffre.
  const toile = page.getByTestId("monde-dedans-toile");
  await expect(toile).toHaveAttribute("aria-hidden", "true");
  await expect(fenetre).toContainText(phraseDuDedans(id!));
  await expect(fenetre).not.toContainText(/\d/);
  // Une case entière de l'écran, sans flou, la toile centrée dans son cadre et la fenêtre dans l'écran.
  await expect(toile).toHaveAttribute("data-pixels", /.+/);
  const m = await mesureDuDedans(page);
  expect([m.colonnes, m.rangees]).toEqual([dessin.largeur, dessin.hauteur]);
  expect(m.dansLeCadre).toBe(true);
  expect(m.dansLEcran).toBe(true);
  expect(m.ecartAuMilieu).toBeLessThanOrEqual(1);
  if (m.net === "true") {
    expect(Number.isInteger(m.pixels) && m.pixels >= 1).toBe(true);
    expect(m.rendu).toBe("pixelated");
    expect(m.largeur).toBeCloseTo((dessin.largeur * m.pixels) / m.densite, 1);
  }
  if (testInfo.project.name === "desktop") expect(m.net, "à 1 280 px de large, au moins un pixel par case").toBe("true");
  // Sans mouvement : l'image 0, et elle y reste.
  await expect(toile).toHaveAttribute("data-image", "0");
  await page.waitForTimeout(1300);
  await expect(toile).toHaveAttribute("data-image", "0");

  // Échap pressée aussitôt : fermée, l'adresse revient au monde, le focus au bâtiment.
  await page.keyboard.press("Escape");
  await expect(fenetre).toHaveCount(0);
  await expect(zone).toBeFocused();
  expect(new URL(page.url()).hash).toBe("");

  // D'un clic sur le bâtiment ; le bouton de la barre la referme aussi.
  await zone.click();
  await expect(fenetre).toBeVisible();
  await fenetre.getByTestId("monde-fermer").click();
  await expect(fenetre).toHaveCount(0);
  await expect(zone).toBeFocused();
});

test("l'adresse ouvre le dedans d'un bâtiment fini ; celle d'un bâtiment sans dedans ou pas fini laisse le monde seul", async ({ page }) => {
  await page.goto("/village");
  await pret(page);
  const id = await premierInterieur(page);
  test.skip(id === null, SANS_INTERIEUR);
  const ouverts = interieursOuverts(await etatPublie(page));
  await page.goto("/");
  await page.goto(`/village#${fenetreDeLInterieur(id!)}`);
  await pret(page);
  const fenetre = page.getByTestId("monde-fenetre-interieur");
  await expect(fenetre).toBeVisible();
  await expect(fenetre).toHaveAttribute("data-interieur", id!);
  // Ouverte par l'adresse, Échap rend le focus au bâtiment lui-même.
  await page.keyboard.press("Escape");
  await expect(fenetre).toHaveCount(0);
  await expect(page.locator(`.monde-zone[data-interieur="${id}"]`)).toBeFocused();
  const fermes = [...BATIMENTS_A_INTERIEUR.filter((b) => !ouverts.includes(b)).map((b) => `#interieur-${b}`), "#interieur-puits", "#interieur-inconnu", "#interieur-"];
  for (const ancre of fermes) {
    await page.goto("/");
    await page.goto(`/village${ancre}`);
    await pret(page);
    await expect(page.locator(".monde-fenetre:visible"), ancre).toHaveCount(0);
  }
  // L'ancre qui change, page ouverte : le dedans s'ouvre.
  await page.evaluate((ancre) => (location.hash = ancre), `#${fenetreDeLInterieur(id!)}`);
  await expect(fenetre).toBeVisible();
});

test("« Entrer » dans la fenêtre du chantier ouvre le dedans d'un bâtiment fini, et seulement s'il est dessiné", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/village#chantier");
  await pret(page);
  const id = await premierInterieur(page);
  const etat = await etatPublie(page);
  const ouverts = interieursOuverts(etat);
  // Un bouton « Entrer » par bâtiment ouvert, pas un de plus.
  await expect(page.getByTestId("monde-fenetre-chantier").getByRole("button", { name: /^Entrer/ })).toHaveCount(ouverts.length);
  test.skip(id === null, SANS_INTERIEUR);
  const entrer = page.getByTestId(`monde-entrer-${id}`);
  await expect(entrer).toHaveAccessibleName(entrerDans(id!));
  await entrer.click();
  const fenetre = page.getByTestId("monde-fenetre-interieur");
  await expect(fenetre).toBeVisible();
  await expect(page.getByTestId("monde-fenetre-chantier")).toBeHidden();
  // La fenêtre du chantier s'est refermée : on ressort devant le bâtiment.
  await page.keyboard.press("Escape");
  await expect(fenetre).toHaveCount(0);
  await expect(page.locator(`.monde-zone[data-interieur="${id}"]`)).toBeFocused();
});

test("le dedans bouge lentement s'il a plusieurs images, et s'arrête à l'image 0 au bouton pause", async ({ page }) => {
  await page.goto("/village");
  await pret(page);
  const id = await premierInterieur(page);
  test.skip(id === null, SANS_INTERIEUR);
  const dessin = interieurDe(id!)!;
  test.skip(dessin.images <= 1, `${dessin.titre} : une seule image, rien ne bouge.`);
  await page.goto(`/village#${fenetreDeLInterieur(id!)}`);
  await pret(page);
  const toile = page.getByTestId("monde-dedans-toile");
  await expect(toile).toHaveAttribute("data-images", String(dessin.images));
  await expect.poll(() => toile.getAttribute("data-image"), { timeout: 4000 }).not.toBe("0");
  await page.getByRole("button", { name: "Mettre les animations en pause" }).click();
  await expect(toile).toHaveAttribute("data-image", "0");
  await page.waitForTimeout(1300);
  await expect(toile).toHaveAttribute("data-image", "0");
});

test("accessibilité WCAG AA du dedans d'un bâtiment", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/village");
  await pret(page);
  const id = await premierInterieur(page);
  test.skip(id === null, SANS_INTERIEUR);
  await page.goto("/");
  await page.goto(`/village#${fenetreDeLInterieur(id!)}`);
  await pret(page);
  await expect(page.getByTestId("monde-dedans-toile")).toHaveAttribute("data-pixels", /.+/);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ; ")}`)).toEqual([]);
});

test("le dedans d'un bâtiment tient de 360 à 1 920 px, sans défilement de côté", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Largeurs testées une seule fois.");
  await page.goto("/village");
  await pret(page);
  const id = await premierInterieur(page);
  test.skip(id === null, SANS_INTERIEUR);
  for (const width of [360, 375, 414, 768, 1024, 1280, 1366, 1920]) {
    await page.setViewportSize({ width, height: width < 700 ? 780 : 900 });
    await page.goto("/");
    await page.goto(`/village#${fenetreDeLInterieur(id!)}`);
    await pret(page);
    await expect(page.getByTestId("monde-dedans-toile")).toHaveAttribute("data-pixels", /.+/);
    const debord = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(debord, `à ${width} px`).toBeLessThanOrEqual(0);
    const m = await mesureDuDedans(page);
    expect(m.dansLeCadre, `la toile dans son cadre, à ${width} px`).toBe(true);
    expect(m.dansLEcran, `la fenêtre dans l'écran, à ${width} px`).toBe(true);
  }
});
