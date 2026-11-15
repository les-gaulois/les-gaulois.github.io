import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { fmtDayAndTime } from "../../src/lib/format";
import { mapLabel } from "../../src/lib/map-names";
import { EcrivainFilm, FORMAT_FILM, type EnteteFilm } from "../../src/lib/rejeu/film";
import { LISTE_DES_FILMS, ListeDesFilms } from "../../src/lib/rejeu/films-index";

/**
 * « Revoir une partie ». Les films ne sont pas dans Git : ils viennent du cache du workflow, ou d'un `npm run parties:filmer`
 * suivi de `npm run films:publier` sur un ordinateur. Sans eux, la page le dit ; avec eux, le lecteur est essayé, et des films
 * fabriqués ici remplacent ceux du site pour vérifier ce qu'il montre.
 */
const liste = existsSync(LISTE_DES_FILMS) ? ListeDesFilms.parse(JSON.parse(readFileSync(LISTE_DES_FILMS, "utf8"))) : null;
const films = liste?.films ?? [];

const hydrated = (page: Page) => page.waitForFunction(() => !document.querySelector("astro-island[ssr]"));

/** Un film de 3 × 2 cases sur la carte « World », deux images : les Gaulois prennent une case, puis trois. */
function filmEssai(partie: string, victoire: boolean): Buffer {
  const entete: EnteteFilm = { format: FORMAT_FILM, partie, carte: "World", debut: "2026-11-15T09:31:11.450Z", victoire, equipes: "Duos", gaulois: 2, joueurs: 20, largeur: 3, hauteur: 2, facteur: 4, pas: 600, images: 2, tours: 601, adverses: 1, equipe: false };
  const e = new EcrivainFilm(3, 2);
  e.ajouter(Uint8Array.from([1, 0, 0, 4, 0, 3]));
  e.ajouter(Uint8Array.from([1, 1, 1, 4, 4, 3]));
  return gzipSync(e.octetsDuFilm(entete, new Uint8Array(6).fill(0x80)));
}

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
