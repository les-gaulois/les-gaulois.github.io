import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { fmtDayAndTime } from "../../src/lib/format";
import { mapLabel } from "../../src/lib/map-names";
import { EcrivainFilm, FORMAT_FILM, type EnteteFilm } from "../../src/lib/rejeu/film";
import { LISTE_DES_FILMS, ListeDesFilms } from "../../src/lib/rejeu/films-index";
import { DOSSIER_DES_FICHES, DOSSIER_SITE_DU_LECTEUR } from "../../src/lib/rejeu/lecteur-jeu";

/**
 * « Revoir une partie ». Les films ne sont pas dans Git : ils viennent du cache du workflow, ou d'un `npm run parties:filmer`
 * suivi de `npm run films:publier` sur un ordinateur. Sans eux, la page le dit ; avec eux, le lecteur est essayé, et des films
 * fabriqués ici remplacent ceux du site pour vérifier ce qu'il montre.
 */
const liste = existsSync(LISTE_DES_FILMS) ? ListeDesFilms.parse(JSON.parse(readFileSync(LISTE_DES_FILMS, "utf8"))) : null;
const films = liste?.films ?? [];

const hydrated = (page: Page) => page.waitForFunction(() => !document.querySelector("astro-island[ssr]"));

/** Le site du vrai lecteur du jeu n'est jamais joint pendant les tests : une page vide le remplace, fiches comprises. */
const LECTEUR = /^https:\/\/[a-z0-9-]+\.github\.io\/jeu\//;
test.beforeEach(async ({ page }) => {
  await page.route(LECTEUR, (r) => r.fulfill({ status: 200, contentType: "text/html", body: '<!doctype html><html lang="fr"><title>Replay du jeu</title></html>' }));
});

/**
 * Un film de 3 × 2 cases sur la carte « World », deux images : les Gaulois prennent une case, puis trois. À la seconde image,
 * une ville gauloise au milieu de la carte entière (12 × 8 cases) et un navire adverse.
 */
function filmEssai(partie: string, victoire: boolean): Buffer {
  const entete: EnteteFilm = { format: FORMAT_FILM, partie, carte: "World", debut: "2026-11-15T09:31:11.450Z", victoire, equipes: "Duos", gaulois: 2, joueurs: 20, largeur: 3, hauteur: 2, facteur: 4, pas: 600, images: 2, tours: 601, adverses: 1, equipe: false, noms: [{ texte: "Vercingé", classe: 1 }] };
  const e = new EcrivainFilm(3, 2);
  e.ajouter(Uint8Array.from([1, 0, 0, 4, 0, 3]));
  e.ajouter(Uint8Array.from([1, 1, 1, 4, 4, 3]), [{ nom: 0, x: 1, y: 0, taille: 1 }], [
    { id: 0, unite: { code: 0, x: 6, y: 4, classe: 1, niveau: 1, chantier: false } },
    { id: 1, unite: { code: 6, x: 2, y: 6, classe: 4, niveau: 1, chantier: false } },
  ]);
  return gzipSync(e.octetsDuFilm(entete, new Uint8Array(6).fill(0x80)));
}

/** Les pixels peints de la toile des détails : noms et unités. */
const pixelsPeints = (page: Page) =>
  page.getByTestId("rejeu-details").evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++;
    return n;
  });

test("sans film publié, la page le dit ; avec, elle ouvre la dernière partie et liste les autres", async ({ page }) => {
  await page.goto("/revoir");
  if (films.length === 0) {
    await expect(page.getByText("Pas de film", { exact: true })).toBeVisible();
    await expect(page.getByTestId("rejeu")).toHaveCount(0);
    return;
  }
  await hydrated(page);
  const dernier = films[0]!;
  await expect(page.locator("#rejeu-titre")).toHaveText(`${mapLabel(dernier.carte)}, ${fmtDayAndTime(dernier.debut)}`);
  await expect(page.getByTestId("rejeu-resultat")).toHaveText(dernier.victoire ? "Victoire" : "Défaite");
  await expect(page.getByTestId("revoir-liste").locator("a")).toHaveCount(Math.min(12, films.length));
  // La date du dernier passage du robot des films, pas celle du build : absente si elle est inconnue.
  if (liste!.fait) await expect(page.getByTestId("revoir-date")).toContainText(fmtDayAndTime(liste!.fait));
  else await expect(page.getByTestId("revoir-date")).toHaveCount(0);
  await expect(page.getByTestId("revoir-credit")).toContainText("© OpenFront and Contributors");
  await expect(page.getByTestId("revoir-credit")).toContainText("CC BY-SA 4.0");
  await expect(page.getByTestId("revoir-credit").getByRole("link", { name: "CC BY-SA 4.0" })).toHaveAttribute("href", "https://creativecommons.org/licenses/by-sa/4.0/deed.fr");
  // La notice de licence posée avec les films.
  expect((await page.request.get("/films/LISEZ-MOI.txt")).ok()).toBe(true);
  await expect(page.getByTestId("rejeu-openfront")).toHaveAttribute("href", `https://openfront.io/game/${dernier.partie}`);
});

test.describe("le lecteur", () => {
  test.skip(films.length === 0, "Aucun film publié dans ce build : le lecteur n'est pas sur la page.");

  test("montre la fin d'abord, se lance, s'arrête au bout, et revient au début", async ({ page }) => {
    await page.route("**/films/essai00001.film", (route) => route.fulfill({ status: 200, contentType: "application/octet-stream", body: filmEssai("essai00001", true) }));
    await page.goto("/revoir?partie=essai00001");
    await hydrated(page);
    await expect(page.locator("#rejeu-titre")).toHaveText(`${mapLabel("World")}, ${fmtDayAndTime("2026-11-15T09:31:11.450Z")}`);
    await expect(page.getByTestId("rejeu-resultat")).toHaveText("Victoire");
    // 601 étapes de 100 ms : la dernière image est à 1 min, la première au début.
    await expect(page.getByTestId("rejeu-horloge")).toHaveText("1:00 / 1:00");
    await expect(page.getByTestId("rejeu-temps")).toHaveAttribute("aria-valuetext", "1 min 0 s sur 1 min 0 s");
    // La toile montre bien la dernière image : la case du coin haut droit est aux Gaulois (bord, donc plus sombre que le bleu).
    const pixel = await page.getByTestId("rejeu-toile").evaluate((c: HTMLCanvasElement) => [...c.getContext("2d")!.getImageData(2, 0, 1, 1).data]);
    expect(pixel[2]).toBeGreaterThan(pixel[0]! + 80);
    await page.getByTestId("rejeu-lecture").click();
    await expect(page.getByTestId("rejeu-lecture")).toHaveText("Revoir");
    await expect(page.getByTestId("rejeu-horloge")).toHaveText("1:00 / 1:00");
    await page.getByTestId("rejeu-temps").fill("0");
    await expect(page.getByTestId("rejeu-horloge")).toHaveText("0:00 / 1:00");
    await expect(page.getByTestId("rejeu-lecture")).toHaveText("Lecture");
  });

  test("pose les constructions, les navires et les noms sur la carte, et les cache sur demande", async ({ page }) => {
    await page.route("**/films/essai00002.film", (route) => route.fulfill({ status: 200, contentType: "application/octet-stream", body: filmEssai("essai00002", true) }));
    await page.goto("/revoir?partie=essai00002");
    await hydrated(page);
    await expect(page.getByTestId("rejeu-horloge")).toHaveText("1:00 / 1:00");
    // Les icônes du jeu se chargent, puis la toile des détails se peint.
    await expect.poll(() => pixelsPeints(page), { timeout: 10_000 }).toBeGreaterThan(0);
    const avec = await pixelsPeints(page);
    const choix = page.getByTestId("rejeu-choix");
    await choix.getByLabel("Constructions et unités").uncheck();
    await choix.getByLabel("Noms").uncheck();
    await expect.poll(() => pixelsPeints(page)).toBe(0);
    await choix.getByLabel("Constructions et unités").check();
    await expect.poll(() => pixelsPeints(page)).toBeGreaterThan(0);
    expect(await pixelsPeints(page)).toBeLessThanOrEqual(avec);
  });

  test("dit quand une partie n'a pas de film, et mène quand même au jeu", async ({ page }) => {
    await page.route("**/films/absente0001.film", (route) => route.fulfill({ status: 404, body: "" }));
    await page.goto("/revoir?partie=absente0001");
    await hydrated(page);
    await expect(page.getByTestId("rejeu-probleme")).toContainText("Pas de film pour cette partie");
    await expect(page.getByTestId("rejeu-probleme").getByRole("link")).toHaveAttribute("href", "https://openfront.io/game/absente0001");
  });

  test("refuse un fichier qui n'est pas un film du site", async ({ page }) => {
    await page.route("**/films/abime00001.film", (route) => route.fulfill({ status: 200, body: gzipSync(Buffer.from("pas un film")) }));
    await page.goto("/revoir?partie=abime00001");
    await hydrated(page);
    await expect(page.getByTestId("rejeu-probleme")).toContainText("n'a pas pu être chargé");
    await expect(page.getByRole("button", { name: "Réessayer" })).toBeVisible();
  });

  test("chaque partie filmée a son lien « Revoir » dans « Dernières parties »", async ({ page }) => {
    await page.goto("/parties");
    await hydrated(page);
    const liens = page.getByTestId("journal-film").filter({ visible: true });
    await expect(liens.first()).toBeVisible();
    const filmes = new Set(films.map((f) => `/revoir?partie=${f.partie}`));
    for (const href of await liens.evaluateAll((as) => as.map((a) => a.getAttribute("href")))) expect(filmes.has(href ?? "")).toBe(true);
    await expect(page.getByTestId("journal-link-note")).toContainText("« Revoir » montre le film de la partie sur le site.");
  });
});

test.describe("le vrai lecteur du jeu", () => {
  const avecJeu = films.find((f) => f.jeu);
  test.skip(!avecJeu, "Aucun lecteur du jeu publié dans ce build : chaque partie garde son film.");

  test("la page d'une partie filmée mène au lecteur, sur son adresse à lui, sans publicité ni mesure", async ({ page }) => {
    await page.goto(`/revoir?partie=${avecJeu!.partie}`);
    await hydrated(page);
    const lien = page.getByTestId("rejeu-jeu");
    await expect(lien).toHaveAttribute("href", avecJeu!.jeu!);
    // Jamais sur l'adresse du site du clan : le code du jeu n'y tourne pas.
    expect(new URL(avecJeu!.jeu!).origin).not.toBe(new URL(page.url()).origin);
    expect(new URL(avecJeu!.jeu!).hostname).not.toBe("les-gaulois.github.io");
    expect((await page.request.get(new URL(avecJeu!.jeu!).pathname)).ok()).toBe(false);
    // Le site du lecteur, préparé à côté du build (`.cache/site-du-lecteur/`), que le robot dépose sur son adresse.
    const dossier = `${DOSSIER_SITE_DU_LECTEUR}${new URL(avecJeu!.jeu!).pathname}`;
    const html = readFileSync(`${dossier}index.html`, "utf8");
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain("© OpenFront and Contributors");
    expect(html).toContain("non officiel");
    expect(html).not.toMatch(/googletag|gtag\(|intergient|cloudflareinsights|challenges\.cloudflare\.com|<title>OpenFront/);
    // La fiche publiée de la partie : sans identifiant public des joueurs.
    const fiche = readFileSync(`${DOSSIER_SITE_DU_LECTEUR}/${DOSSIER_DES_FICHES}game/${avecJeu!.partie}/index.html`, "utf8");
    expect(fiche).not.toContain("publicID");
    expect(fiche).not.toMatch(/[<>]/);
  });

  test("le replay du jeu s'ouvre dans la page, sans clic, dans un cadre isolé, et s'ouvre aussi en grand", async ({ page }) => {
    await page.goto(`/revoir?partie=${avecJeu!.partie}`);
    await hydrated(page);
    const cadre = page.getByTestId("rejeu-jeu-cadre");
    await expect(cadre).toBeVisible();
    await expect(cadre).toHaveAttribute("src", avecJeu!.jeu!);
    // Ni navigation de la page qui l'encadre, ni formulaire : seulement ses scripts, son stockage à lui et les liens qu'il ouvre.
    await expect(cadre).toHaveAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox");
    await expect(cadre).toHaveAttribute("referrerpolicy", "no-referrer");
    await expect(cadre).toHaveAttribute("allow", "fullscreen");
    expect((await cadre.getAttribute("title")) ?? "").toContain("Replay du jeu");
    const lien = page.getByTestId("rejeu-jeu");
    await expect(lien).toHaveAttribute("href", avecJeu!.jeu!);
    await expect(lien).toHaveAttribute("target", "_blank");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("« Film du site » montre le film et sa légende, « Replay du jeu » remet le cadre et arrête le film", async ({ page }) => {
    await page.goto(`/revoir?partie=${avecJeu!.partie}`);
    await hydrated(page);
    const jeu = page.getByTestId("rejeu-vue-jeu");
    const filmDuSite = page.getByTestId("rejeu-vue-film");
    await expect(jeu).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("rejeu-toile")).toBeHidden();
    await expect(page.getByTestId("rejeu-choix")).toHaveCount(0);
    await filmDuSite.click();
    await expect(filmDuSite).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("rejeu-jeu-cadre")).toHaveCount(0);
    await expect(page.getByTestId("rejeu-toile")).toBeVisible();
    await expect(page.getByTestId("rejeu-choix")).toBeVisible();
    // Le film lancé s'arrête quand le replay du jeu reprend la place.
    await page.getByTestId("rejeu-temps").fill("0");
    await page.getByTestId("rejeu-lecture").click();
    await expect(page.getByTestId("rejeu-lecture")).toHaveText("Pause");
    await jeu.click();
    await expect(page.getByTestId("rejeu-jeu-cadre")).toBeVisible();
    await filmDuSite.click();
    await expect(page.getByTestId("rejeu-lecture")).not.toHaveText("Pause");
  });

  test("si la fiche manque sur le site du lecteur, la partie montre son film, sans cadre ni bascule", async ({ page }) => {
    await page.route(LECTEUR, (r) => r.fulfill({ status: 404, contentType: "text/html", body: "introuvable" }));
    await page.goto(`/revoir?partie=${avecJeu!.partie}`);
    await hydrated(page);
    await expect(page.getByTestId("rejeu-toile")).toBeVisible();
    await expect(page.getByTestId("rejeu-jeu-cadre")).toHaveCount(0);
    await expect(page.getByTestId("rejeu-vue-film")).toHaveCount(0);
    await expect(page.getByTestId("rejeu-jeu")).toHaveCount(0);
  });

  test("une partie sans lecteur du jeu garde son film, sans cadre", async ({ page }) => {
    const sansJeu = films.find((f) => !f.jeu);
    test.skip(!sansJeu, "Toutes les parties publiées ont le lecteur du jeu.");
    await page.goto(`/revoir?partie=${sansJeu!.partie}`);
    await hydrated(page);
    await expect(page.getByTestId("rejeu-toile")).toBeVisible();
    await expect(page.getByTestId("rejeu-jeu-cadre")).toHaveCount(0);
    await expect(page.getByTestId("rejeu-jeu")).toHaveCount(0);
  });
});
