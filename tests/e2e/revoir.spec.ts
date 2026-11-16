import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { fmtDayAndTime } from "../../src/lib/format";
import { mapLabel } from "../../src/lib/map-names";
import { lireFilm } from "../../src/lib/rejeu/film";
import { DOSSIER_FILMS, LISTE_DES_FILMS, ListeDesFilms, nomDuFilm } from "../../src/lib/rejeu/films-index";
import { adresseEnLecture } from "../../src/lib/rejeu/fiche-du-lecteur";
import { DOSSIER_DES_FICHES, DOSSIER_SITE_DU_LECTEUR } from "../../src/lib/rejeu/lecteur-jeu";

/**
 * « Revoir une partie » : le vrai replay du jeu, seul (plus de film depuis le 16 novembre 2026). La liste des parties ne vient pas
 * de Git : du cache du workflow, ou d'un `npm run parties:filmer` suivi de `npm run films:publier` sur un ordinateur. Sans parties
 * qui ont leur replay, la page le dit ; avec elles, le cadre est essayé, le site du replay étant remplacé par une page vide.
 */
const liste = existsSync(LISTE_DES_FILMS) ? ListeDesFilms.parse(JSON.parse(readFileSync(LISTE_DES_FILMS, "utf8"))) : null;
const films = liste?.films ?? [];
/** Les parties proposées par la page : celles qui ont le vrai lecteur du jeu. */
const parties = films.filter((f) => f.jeu);

const hydrated = (page: Page) => page.waitForFunction(() => !document.querySelector("astro-island[ssr]"));

/** Le site du vrai lecteur du jeu n'est jamais joint pendant les tests : une page vide le remplace, fiches comprises. */
const LECTEUR = /^https:\/\/[a-z0-9-]+\.github\.io\/jeu\//;
test.beforeEach(async ({ page }) => {
  await page.route(LECTEUR, (r) => r.fulfill({ status: 200, contentType: "text/html", body: '<!doctype html><html lang="fr"><title>Replay du jeu</title></html>' }));
});

test("sans replay publié, la page le dit ; avec, elle ouvre la dernière partie et liste les autres", async ({ page }) => {
  await page.goto("/revoir");
  if (parties.length === 0) {
    await expect(page.getByText("Pas de replay", { exact: true })).toBeVisible();
    await expect(page.getByTestId("rejeu")).toHaveCount(0);
    return;
  }
  await hydrated(page);
  const dernier = parties[0]!;
  await expect(page.locator("#rejeu-titre")).toHaveText(`${mapLabel(dernier.carte)}, ${fmtDayAndTime(dernier.debut)}`);
  await expect(page.getByTestId("rejeu-resultat")).toHaveText(dernier.victoire ? "Victoire" : "Défaite");
  await expect(page.getByTestId("revoir-liste").locator("a")).toHaveCount(Math.min(12, parties.length));
  // La date du dernier passage du robot, pas celle du build : absente si elle est inconnue.
  if (liste!.fait) await expect(page.getByTestId("revoir-date")).toContainText(fmtDayAndTime(liste!.fait));
  else await expect(page.getByTestId("revoir-date")).toHaveCount(0);
  await expect(page.getByTestId("revoir-credit")).toContainText("© OpenFront and Contributors");
  await expect(page.getByTestId("revoir-credit").getByRole("link", { name: "CC BY-SA 4.0" })).toHaveAttribute("href", "https://creativecommons.org/licenses/by-sa/4.0/deed.fr");
  await expect(page.getByTestId("rejeu-openfront")).toHaveAttribute("href", `https://openfront.io/game/${dernier.partie}`);
  // Plus de film : ni toile, ni barre de lecture, ni légende, ni cases, et ses fichiers ne sont plus publiés.
  for (const repere of ["rejeu-toile", "rejeu-details", "rejeu-lecture", "rejeu-temps", "rejeu-choix", "rejeu-unites", "rejeu-vue-film"]) await expect(page.getByTestId(repere)).toHaveCount(0);
  expect((await page.request.get(`/films/${nomDuFilm(dernier.partie)}`)).ok()).toBe(false);
  expect((await page.request.get("/films/LISEZ-MOI.txt")).ok()).toBe(false);
});

test.describe("les messages à la place du replay", () => {
  test.skip(parties.length === 0, "Aucune partie avec son replay dans ce build : le lecteur n'est pas sur la page.");

  test("une partie qui n'est pas dans la liste : pas de replay, et le lien vers le jeu", async ({ page }) => {
    await page.goto("/revoir?partie=absente0001");
    await hydrated(page);
    await expect(page.getByTestId("rejeu-probleme")).toContainText("Pas de replay pour cette partie");
    await expect(page.getByTestId("rejeu-probleme").getByRole("link")).toHaveAttribute("href", "https://openfront.io/game/absente0001");
  });

  test("une partie rejouée dont le replay n'est pas prêt : le message, jamais un film", async ({ page }) => {
    const sansJeu = films.find((f) => !f.jeu);
    test.skip(!sansJeu, "Toutes les parties rejouées ont leur replay dans ce build.");
    await page.goto(`/revoir?partie=${sansJeu!.partie}`);
    await hydrated(page);
    await expect(page.getByTestId("rejeu-probleme")).toContainText("Le replay de cette partie n'est pas disponible pour l'instant");
    await expect(page.getByTestId("rejeu-jeu-cadre")).toHaveCount(0);
    await expect(page.getByTestId("rejeu-toile")).toHaveCount(0);
  });

  test("le site du replay injoignable : le message, et « Réessayer », qui le redemande", async ({ page }) => {
    let refus = true;
    await page.route(LECTEUR, (r) => (refus ? r.abort() : r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>x</title>" })));
    await page.goto(`/revoir?partie=${parties[0]!.partie}`);
    await hydrated(page);
    await expect(page.getByTestId("rejeu-probleme")).toContainText("Le replay n'a pas pu être chargé");
    refus = false;
    await page.getByRole("button", { name: "Réessayer" }).click();
    await expect(page.getByTestId("rejeu-jeu-cadre")).toBeVisible();
  });

  test("chaque partie qui a son replay a son lien « Revoir » dans « Dernières parties »", async ({ page }) => {
    await page.goto("/parties");
    await hydrated(page);
    const liens = page.getByTestId("journal-film").filter({ visible: true });
    await expect(liens.first()).toBeVisible();
    const avecReplay = new Set(parties.map((f) => `/revoir?partie=${f.partie}`));
    for (const href of await liens.evaluateAll((as) => as.map((a) => a.getAttribute("href")))) expect(avecReplay.has(href ?? "")).toBe(true);
    await expect(page.getByTestId("journal-link-note")).toContainText("« Revoir » montre le replay de la partie sur le site.");
  });
});

/** La forme de la carte d'une partie, lue dans son film du cache (source indépendante de la liste publiée). */
const formeDuFilm = (partie: string) => {
  const { entete } = lireFilm(gunzipSync(readFileSync(join(DOSSIER_FILMS, nomDuFilm(partie)!))));
  return entete.largeur / entete.hauteur;
};

test.describe("le vrai lecteur du jeu", () => {
  const avecJeu = parties[0];
  test.skip(!avecJeu, "Aucune partie avec son replay dans ce build.");

  test("la page d'une partie mène au lecteur, sur son adresse à lui, sans publicité ni mesure", async ({ page }) => {
    await page.goto(`/revoir?partie=${avecJeu!.partie}`);
    await hydrated(page);
    const lien = page.getByTestId("rejeu-jeu");
    await expect(lien).toHaveAttribute("href", adresseEnLecture(avecJeu!.jeu!));
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
    // Il part de lui-même en ×8 (demande du pilote) : son lien le lui demande.
    await expect(cadre).toHaveAttribute("src", adresseEnLecture(avecJeu!.jeu!));
    expect(adresseEnLecture(avecJeu!.jeu!)).toContain("/?lecture=8#replay-viewer=");
    // Ni navigation de la page qui l'encadre, ni formulaire : seulement ses scripts, son stockage à lui et les liens qu'il ouvre.
    await expect(cadre).toHaveAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox");
    await expect(cadre).toHaveAttribute("referrerpolicy", "no-referrer");
    await expect(cadre).toHaveAttribute("allow", "fullscreen");
    expect((await cadre.getAttribute("title")) ?? "").toContain("Replay du jeu");
    const lien = page.getByTestId("rejeu-jeu");
    await expect(lien).toHaveAttribute("href", adresseEnLecture(avecJeu!.jeu!));
    await expect(lien).toHaveAttribute("target", "_blank");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("pour qui veut moins d'animations, le replay du jeu s'ouvre en pause", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/revoir?partie=${avecJeu!.partie}`);
    await hydrated(page);
    await expect(page.getByTestId("rejeu-jeu-cadre")).toHaveAttribute("src", avecJeu!.jeu!);
    await expect(page.getByTestId("rejeu-jeu")).toHaveAttribute("href", avecJeu!.jeu!);
  });

  /** Le site du lecteur, remplacé par une page qui note les messages qu'elle reçoit et d'où ils viennent. */
  const NOTEUR = '<!doctype html><html lang="fr"><title>Replay du jeu</title><script>window.recus = []; addEventListener("message", (e) => window.recus.push([e.origin, e.data]));</script></html>';
  /** Les messages reçus par le cadre du lecteur, une fois chargé ; `null` tant qu'il ne l'est pas. */
  const recus = async (page: Page) => {
    const lecteur = page.frames().find((f) => f.url().startsWith(new URL(avecJeu!.jeu!).origin));
    return lecteur ? lecteur.evaluate(() => (window as unknown as { recus?: [string, unknown][] }).recus ?? null).catch(() => null) : null;
  };

  test("le bouton pause de l'en-tête demande la pause au replay du jeu, et à lui seul", async ({ page }) => {
    await page.route(LECTEUR, (r) => r.fulfill({ status: 200, contentType: "text/html", body: NOTEUR }));
    await page.goto(`/revoir?partie=${avecJeu!.partie}`);
    await hydrated(page);
    await expect(page.getByTestId("rejeu-jeu-cadre")).toBeVisible();
    await expect.poll(() => recus(page)).toEqual([]);
    await page.locator("[data-fx-toggle]").click();
    await expect.poll(() => recus(page)).toEqual([[new URL(page.url()).origin, { gal: "pause" }]]);
    // Le lien « en grand » ne demande plus la lecture d'office.
    await expect(page.getByTestId("rejeu-jeu")).toHaveAttribute("href", avecJeu!.jeu!);
  });

  test("la pause déjà choisie sur le site : le replay du jeu s'ouvre en pause, et sa page le lui redit au chargement", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("gal-fx", "off"));
    await page.route(LECTEUR, (r) => r.fulfill({ status: 200, contentType: "text/html", body: NOTEUR }));
    await page.goto(`/revoir?partie=${avecJeu!.partie}`);
    await hydrated(page);
    await expect(page.getByTestId("rejeu-jeu-cadre")).toHaveAttribute("src", avecJeu!.jeu!);
    await expect(page.getByTestId("rejeu-jeu")).toHaveAttribute("href", avecJeu!.jeu!);
    await expect.poll(() => recus(page)).toEqual([[new URL(page.url()).origin, { gal: "pause" }]]);
  });

  test("une partie qui a le replay du jeu ne montre que lui, au cadre de la forme de sa carte", async ({ page }, testInfo) => {
    await page.goto(`/revoir?partie=${avecJeu!.partie}`);
    await hydrated(page);
    const cadre = page.getByTestId("rejeu-jeu-cadre");
    await expect(cadre).toBeVisible();
    // La forme de la carte, donnée par la liste publiée et vérifiée sur le film de la partie, pour que la carte remplisse le
    // cadre sans gris.
    const boite = (await cadre.boundingBox())!;
    expect(avecJeu!.forme).not.toBeNull();
    const forme = formeDuFilm(avecJeu!.partie);
    expect(avecJeu!.forme!).toBeCloseTo(forme, 3);
    // Sur un téléphone, une carte très large garde 18 rem de haut (classement et frise du jeu) : le cadre est alors moins large
    // que la carte, jamais plus (la carte le remplit en débordant sur les côtés, sans gris).
    if (testInfo.project.name === "mobile" && boite.height <= 18 * 16 + 1 && forme > boite.width / boite.height) expect(boite.height).toBeCloseTo(18 * 16, 0);
    else expect(boite.width / boite.height).toBeCloseTo(forme, 1);
  });

  test("si la fiche manque sur le site du lecteur, la page dit que le replay n'est pas prêt, sans cadre ni film", async ({ page }) => {
    await page.route(LECTEUR, (r) => r.fulfill({ status: 404, contentType: "text/html", body: "introuvable" }));
    await page.goto(`/revoir?partie=${avecJeu!.partie}`);
    await hydrated(page);
    await expect(page.getByTestId("rejeu-probleme")).toContainText("Le replay de cette partie n'est pas disponible pour l'instant");
    await expect(page.getByTestId("rejeu-jeu-cadre")).toHaveCount(0);
    await expect(page.getByTestId("rejeu-toile")).toHaveCount(0);
    await expect(page.getByTestId("rejeu-jeu")).toHaveCount(0);
  });
});
