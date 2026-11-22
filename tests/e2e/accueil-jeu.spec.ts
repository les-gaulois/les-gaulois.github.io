import { expect, test, type Page } from "@playwright/test";
import { nombresDuJeu } from "../../src/lib/accueil-jeu";
import { loadMembers } from "../../src/lib/data";
import { fmtInt } from "../../src/lib/format";
import { EMPLACEMENTS_OBJETS, OBJETS } from "../../src/lib/gaulois";
import { portraitDuGaulois } from "../../src/lib/gaulois-site";
import { CADRES } from "../../src/lib/village/cadres";
import { vitrinePublique } from "../../src/lib/village/vitrine-publique";
import { BANNIERES } from "../../supabase/functions/code-discord/bannieres/index";
import { FAMILIERS } from "../../supabase/functions/code-discord/familiers/index";
import { MODELES } from "../../supabase/functions/code-discord/modeles/index";

/**
 * Le jeu des Gaulois sur l'accueil (22 novembre 2026) : « Ouvre ton premier booster » et « Du commun au divin ». Sans les
 * Gaulois relevés par la GitHub Action, l'accueil n'en montre aucun : ces tests vérifient alors qu'il n'en invente pas.
 */
const vitrine = vitrinePublique(loadMembers()?.members ?? [], (id) => portraitDuGaulois(id) !== null);
const hydrated = (page: Page) => page.waitForFunction(() => !document.querySelector("astro-island[ssr]"));

test("l'accueil montre le jeu des Gaulois : les Gaulois relevés, les nombres du catalogue, rien d'inventé", async ({ page }) => {
  await page.goto("/");
  const bande = page.getByTestId("home-booster");
  await expect(bande.getByRole("heading", { level: 2, name: "Ouvre ton premier booster" })).toBeVisible();

  // Les nombres : ceux du catalogue du jeu, comptés comme la page les compte.
  const attendus = nombresDuJeu({
    objets: EMPLACEMENTS_OBJETS.flatMap((e) => Object.values(OBJETS[e])),
    familiers: FAMILIERS.length,
    uniques: MODELES.length,
    bannieres: BANNIERES.length,
    cadres: CADRES.length,
  });
  const nombres = page.getByTestId("home-nombres").locator("li");
  await expect(nombres).toHaveCount(attendus.length);
  for (const [i, n] of attendus.entries()) await expect(nombres.nth(i)).toHaveText(`${fmtInt(n.n)} ${n.mot}`);

  // Les Gaulois : ceux de la vitrine des visiteurs, chacun vers sa fiche ; aucun sans relevé.
  const cases = page.getByTestId("home-defile-gaulois");
  await expect(cases).toHaveCount(vitrine.length);
  if (vitrine.length === 0) {
    await expect(page.getByTestId("home-defile")).toHaveCount(0);
    await expect(page.getByTestId("home-vedette")).toHaveCount(0);
  }
  for (const [i, g] of vitrine.entries()) {
    await expect(cases.nth(i)).toHaveAttribute("href", `/membres/${encodeURIComponent(g.id)}`);
    await expect(cases.nth(i)).toContainText(g.pseudo);
  }
  for (const vedette of await page.getByTestId("home-vedette").all()) expect(vitrine.map((g) => `/membres/${encodeURIComponent(g.id)}`)).toContain(await vedette.getAttribute("href"));

  await expect(page.getByTestId("home-creer")).toHaveAttribute("href", "/village");
});

test("le booster d'essai de l'accueil s'ouvre, montre un tirage d'exemple et mène à « Mon Gaulois »", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  await page.getByTestId("home-ouvrir").click();
  const fenetre = page.getByTestId("home-fenetre");
  await expect(fenetre).toBeVisible();
  await fenetre.getByRole("button", { name: /^Passer/ }).click();
  await expect(fenetre.getByTestId("home-tirage")).toBeVisible();
  // Le tirage est un exemple, et l'écran le dit ; le vrai booster se gagne en jouant.
  await expect(fenetre).toContainText("Tirage d'exemple : cet objet n'est ni enregistré ni donné.");
  await expect(fenetre.getByTestId("home-fenetre-creer")).toHaveAttribute("href", "/village");
  await fenetre.getByTestId("home-fermer").click();
  await expect(fenetre).toHaveCount(0);
});

test("« Du commun au divin » suit le défilement en quatre étapes", async ({ page }) => {
  await page.goto("/");
  const scene = page.locator(".accueil-parcours-scene");
  await expect(page.getByTestId("home-parcours-etape")).toHaveCount(4);
  await expect(scene).toHaveAttribute("data-etape", "0");
  const aller = (part: number) =>
    page.evaluate((k) => {
      const piste = document.querySelector<HTMLElement>("[data-parcours]")!;
      const s = piste.querySelector<HTMLElement>(".accueil-parcours-scene")!;
      const r = piste.getBoundingClientRect();
      window.scrollTo({ top: scrollY + r.top + (r.height - s.clientHeight) * k, behavior: "instant" });
    }, part);
  for (const [part, etape] of [
    [0.4, "1"],
    [0.7, "2"],
    [0.97, "3"],
  ] as const) {
    await aller(part);
    await expect(scene).toHaveAttribute("data-etape", etape);
    await expect(page.getByTestId("home-parcours-etape").nth(Number(etape))).toHaveClass(/actif/);
  }
  // La bourse n'est qu'un exemple de la règle : 30 statères par point, jamais le solde d'un membre.
  await aller(0.45);
  await expect(scene).toHaveAttribute("data-etape", "1");
  // Les deux nombres lus d'un coup : le défilement peut encore les changer entre deux lectures.
  const bourse = () =>
    page.evaluate(() => {
      const lire = (s: string) => Number(document.querySelector(s)?.textContent?.replace(/\D/g, ""));
      return { stateres: lire("[data-parcours-stateres]"), points: lire("[data-parcours-points]") };
    });
  await expect
    .poll(async () => {
      const b = await bourse();
      return b.stateres === b.points * 30 && b.points > 0;
    })
    .toBe(true);
  await expect(page.locator(".accueil-bourse")).toContainText("Un exemple de la règle");
});

test("sans script, « Du commun au divin » se lit à la suite", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: testInfo.project.use.baseURL });
  const page = await context.newPage();
  await page.goto("/");
  for (const etape of await page.getByTestId("home-parcours-etape").all()) await expect(etape.locator(".accueil-parcours-texte")).toBeVisible();
  // Et leurs images, à la suite : le Gaulois de départ, la bourse d'exemple, l'échelle des raretés.
  for (const calque of await page.locator(".accueil-calque").all()) await expect(calque).toBeVisible();
  await expect(page.locator(".accueil-bourse")).toBeVisible();
  await expect(page.locator(".accueil-echelle")).toBeVisible();
  // Le booster d'essai demande un script : sans lui, la table mène à « Mon Gaulois ».
  await expect(page.getByTestId("home-booster").getByRole("link", { name: "Essaie un booster dans « Mon Gaulois »" })).toHaveAttribute("href", "/village");
  await context.close();
});
