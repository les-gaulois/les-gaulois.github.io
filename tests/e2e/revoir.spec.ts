import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { fmtDayAndTime } from "../../src/lib/format";
import { mapLabel } from "../../src/lib/map-names";
import { lireFilm } from "../../src/lib/rejeu/film";
import { bilanALEcran, classementGeneral, PARTIES_MIN_DU_CLASSEMENT, scoresDuBilan } from "../../src/lib/rejeu/bilan-ecran";
import { porteursDesPseudos } from "../../src/lib/rejeu/insignes";
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

test("sans replay publié, la page le dit ; avec, elle ouvre la dernière partie et mène aux autres", async ({ page }) => {
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
  // Plus de liste sous le lecteur (revue du 18 novembre 2026) : la partie d'après, la liste complète, rien de plus récent.
  await expect(page.getByTestId("revoir-liste")).toHaveCount(0);
  await expect(page.getByTestId("rejeu-toutes")).toHaveAttribute("href", "/parties");
  await expect(page.getByTestId("rejeu-plus-recente")).toHaveCount(0);
  if (parties[1]) await expect(page.getByTestId("rejeu-plus-ancienne")).toHaveAttribute("href", `/revoir?partie=${parties[1].partie}`);
  else await expect(page.getByTestId("rejeu-plus-ancienne")).toHaveCount(0);
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
    // Un seul lien par partie : une partie à revoir n'a pas en plus son lien vers OpenFront, que donne la page du replay.
    const premiere = page.locator('[data-testid="journal-row"], [data-testid="journal-card"]').filter({ visible: true }).filter({ has: page.getByTestId("journal-film") }).first();
    await expect(premiere.getByTestId("journal-replay")).toHaveCount(0);
  });
});

test.describe("le journal « Entre Gaulois »", () => {
  const avecDons = parties.find((f) => (f.faits ?? 0) > 0);
  test.skip(!avecDons, "Aucune partie de ce build n'a de journal « Entre Gaulois » publié.");

  test("le fil suit le replay, qui dit son étape, l'heure d'une ligne y mène le replay, et les filtres retirent une famille", async ({ page }) => {
    const journal = JSON.parse(readFileSync(`${LISTE_DES_FILMS.replace(/liste\.json$/, "")}${avecDons!.partie}.journal.json`, "utf8")) as { fin: number; faits: (number | string)[][] };
    expect(journal.faits).toHaveLength(avecDons!.faits!);
    const premier = journal.faits[0]![0] as number;
    const dernier = journal.fin;
    // Le site du replay remplacé par une page qui dit son étape comme le vrai lecteur, et note où on l'envoie.
    await page.route(LECTEUR, (r) =>
      r.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html lang="fr"><title>Replay du jeu</title><script>let e=${Math.max(0, premier - 1)};setInterval(()=>parent.postMessage({gal:"temps",etape:e},"*"),50);addEventListener("message",(m)=>{if(m.data&&m.data.gal==="aller")e=m.data.etape;if(m.data&&m.data.gal==="fin")e=${dernier};});</script></html>`,
      }),
    );
    await page.goto(`/revoir?partie=${avecDons!.partie}`);
    await hydrated(page);
    const dons = page.getByTestId("rejeu-dons");
    await expect(dons.getByRole("heading", { name: "Entre Gaulois" })).toBeVisible();
    // Avant la première ligne : aucun message, son heure annoncée, et pas encore de fin.
    await expect(dons.getByText(/^Première ligne à \d+:\d\d$/)).toBeVisible();
    await expect(dons.locator(".dons-message")).toHaveCount(0);
    await expect(page.getByTestId("rejeu-dons-fin")).toHaveCount(0);
    // À la fin du replay : toutes les lignes, chacune avec son heure, puis le résultat de la partie.
    await page.getByTestId("rejeu-jeu-cadre").evaluate((f: HTMLIFrameElement) => f.contentWindow!.postMessage({ gal: "fin" }, "*"));
    await expect(dons.locator(".dons-message")).toHaveCount(avecDons!.faits!);
    await expect(page.getByTestId("rejeu-dons-fin")).toContainText(avecDons!.victoire ? "victoire" : "défaite");
    // Un filtre relâché retire les lignes de sa famille, et les remet une fois enfoncé de nouveau.
    const filtres = dons.getByRole("button", { pressed: true });
    if ((await filtres.count()) > 0) {
      const famille = (await filtres.first().getAttribute("data-ton"))!;
      const filtre = page.getByTestId(`rejeu-filtre-${famille}`);
      const dansLaFamille = await dons.locator(`.dons-message[data-famille="${famille}"]`).count();
      expect(dansLaFamille).toBeGreaterThan(0);
      await filtre.click();
      await expect(filtre).toHaveAttribute("aria-pressed", "false");
      await expect(dons.locator(".dons-message")).toHaveCount(avecDons!.faits! - dansLaFamille);
      await filtre.click();
      await expect(dons.locator(".dons-message")).toHaveCount(avecDons!.faits!);
    }
    // L'heure de la première ligne ramène le replay juste avant elle : le fil se vide de nouveau.
    await dons.getByRole("button", { name: /^Aller à / }).first().click();
    await expect(dons.locator(".dons-message")).toHaveCount(0);
  });
});

test.describe("le bilan des Gaulois", () => {
  const avecBilan = parties.find((f) => f.bilan);
  test.skip(!avecBilan, "Aucune partie de ce build n'a de bilan des Gaulois publié.");

  test("montre une carte par Gaulois de la partie, la plus utile d'abord, avec ses trois axes", async ({ page }) => {
    const bilan = bilanALEcran(JSON.parse(readFileSync(`${LISTE_DES_FILMS.replace(/liste\.json$/, "")}${avecBilan!.partie}.bilan.json`, "utf8")), avecBilan!.partie)!;
    const scores = scoresDuBilan(bilan.gaulois);
    await page.route(LECTEUR, (r) => r.fulfill({ status: 200, contentType: "text/html", body: `<!doctype html><html lang="fr"><title>Replay du jeu</title></html>` }));
    await page.goto(`/revoir?partie=${avecBilan!.partie}`);
    await hydrated(page);
    const cartes = page.getByTestId("rejeu-bilan").getByTestId("rejeu-bilan-carte");
    await expect(cartes).toHaveCount(bilan.gaulois.length);
    await expect(page.getByTestId("rejeu-bilan").getByRole("heading", { name: "Bilan des Gaulois" })).toBeVisible();
    for (const axe of ["Économie", "Combat", "Soutien"]) await expect(cartes.first().getByText(axe, { exact: true })).toBeVisible();
    const meilleure = Math.max(...scores.map((s) => s.utilite ?? -1));
    if (meilleure >= 0) {
      await expect(cartes.first()).toContainText(`${meilleure} d'utilité`);
      // Retriées par un axe : la première carte est celle qui en a la plus grande part ; puis l'ordre de l'utilité revient.
      const parCombat = scores.map((s) => s.parts.combat ?? -1);
      if (Math.max(...parCombat) > 0 && parCombat.filter((p) => p === Math.max(...parCombat)).length === 1) {
        await page.getByTestId("rejeu-bilan-tri-combat").click();
        await expect(page.getByTestId("rejeu-bilan-tri-combat")).toHaveAttribute("aria-pressed", "true");
        await expect(cartes.first()).toContainText(`${Math.round(Math.max(...parCombat) * 100)} %`);
        await page.getByTestId("rejeu-bilan-tri-utilite").click();
        await expect(cartes.first()).toContainText(`${meilleure} d'utilité`);
      }
      // Une carte n'a de bannière que celle que le membre a choisie : jamais une bannière par défaut.
      for (const fond of await cartes.evaluateAll((lis) => lis.map((li) => li.getAttribute("data-banniere")))) expect(["membre", null]).toContain(fond);
    }
    else await expect(page.getByTestId("rejeu-bilan")).toContainText("pas de score d'utilité");
  });
});

test("« Les plus utiles » montre le classement général des bilans publiés, ou dit qu'il n'y a pas de données", async ({ page }) => {
  const bilans = parties.flatMap((f) => (f.jeu && f.bilan ? [bilanALEcran(JSON.parse(readFileSync(`${LISTE_DES_FILMS.replace(/liste\.json$/, "")}${f.partie}.bilan.json`, "utf8")), f.partie)!] : []));
  const membres = (JSON.parse(readFileSync("data/members.json", "utf8")) as { members: { username: string | null; publicId: string | null }[] }).members;
  const porteurs = porteursDesPseudos(membres);
  const classement = classementGeneral(bilans, PARTIES_MIN_DU_CLASSEMENT, (nom) => porteurs.get(nom)?.length === 1);
  await page.goto("/utiles");
  await expect(page.getByRole("heading", { level: 1, name: "Les plus utiles" })).toBeVisible();
  if (classement.length === 0) {
    await expect(page.getByTestId("utiles-classement")).toHaveCount(0);
    await expect(page.getByText("Pas de données")).toBeVisible();
  } else {
    const lignes = page.getByTestId("utiles-ligne");
    await expect(lignes).toHaveCount(classement.length);
    // Douze cartes d'emblée, la suite dans un repli (revue du 18 novembre 2026) : 13 écrans sur téléphone sinon.
    if (classement.length > 12) {
      await expect(page.getByTestId("utiles-suite").locator("summary")).toHaveText(`Voir les ${classement.length - 12} suivants`);
      await expect(lignes.nth(12)).toBeHidden();
      await page.getByTestId("utiles-suite").locator("summary").click();
      await expect(lignes.nth(12)).toBeVisible();
    } else {
      await expect(page.getByTestId("utiles-suite")).toHaveCount(0);
    }
    await expect(lignes.first()).toContainText(classement[0]!.nom);
    await expect(lignes.first()).toContainText("d'utilité");
    await expect(lignes.first().getByRole("link", { name: classement[0]!.nom })).toHaveAttribute("href", /\/membres\//);
    // La fiche du premier montre son utilité moyenne et son rang ; celle d'un membre hors classement n'a pas ce bloc.
    await lignes.first().getByRole("link", { name: classement[0]!.nom }).click();
    await expect(page.getByTestId("member-utilite")).toContainText(`${classement[0]!.utilite}`);
    await expect(page.getByTestId("member-utilite")).toContainText("rang 1 des plus utiles");
    const classes = new Set(classement.map((l) => l.nom));
    const autre = membres.find((m) => m.username && m.publicId && !classes.has(m.username.replace(/\s+/g, " ").trim().slice(0, 40)));
    if (autre) {
      await page.goto(`/membres/${autre.publicId}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByTestId("member-utilite")).toHaveCount(0);
    }
    await page.goto("/utiles");
  }
  await expect(page.getByTestId("utiles-revoir")).toHaveAttribute("href", "/revoir");
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
