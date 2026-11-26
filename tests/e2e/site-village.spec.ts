// « Mon Gaulois » (`/village`) vu sans serveur : la porte, l'écran de jeu, la démo des visiteurs.
import { expect, test } from "@playwright/test";
import { portraitDuGaulois } from "../../src/lib/gaulois-site";
import { vitrinePublique } from "../../src/lib/village/vitrine-publique";
import { loadMembers } from "../../src/lib/data";

// « Mon Gaulois » sans serveur (le site publié sans PUBLIC_SUPABASE_URL) : la porte fermée, sans vestiaire ni onglets. Le
// Gaulois de départ, la connexion et la forge ne paraissent qu'avec le serveur : ils sont essayés à part, contre
// les vraies fonctions SQL. Le monde du village, retiré le 15 novembre 2026, ne revient pas : ni scène, ni chantier, ni feu.
// L'accessibilité et les largeurs de /village sont contrôlées avec les autres pages (PAGES).
test("« Mon Gaulois » sans serveur garde sa porte fermée, sans le monde du village, avec le bouton pause", async ({ page }) => {
  await page.goto("/village");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mon Gaulois");
  await expect(page.getByRole("heading", { level: 2, name: "Votre Gaulois" })).toBeVisible();
  await expect(page.getByTestId("auth-not-open")).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByTestId("vestiaire-porte")).toHaveCount(0);
  await expect(page.locator(".monde, .monde-sans-script")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveClass(/village-monde/);
  const pause = page.getByRole("button", { name: "Mettre les animations en pause" });
  await expect(pause).toBeVisible();
  await pause.click();
  await expect(page.locator("html")).toHaveClass(/fx-off/);
  await expect(pause).toHaveAttribute("aria-pressed", "true");
});

// « Mon Gaulois » en écran de jeu (21 novembre 2026, maquette validée par le pilote) : plein écran, sans l'en-tête, le menu,
// la rubrique ni le pied de page du site ; à leur place, la barre du jeu (logo dessiné, son, musique, pause, thème, retour au
// site) et une ligne discrète en bas, qui garde les mentions légales, le code source et la mention d'OpenFront. Les images du
// kit en pixels viennent de /village/kit.css, et les chiffres de « Ma carte » de /village/chiffres.json, sans aucun identifiant.
test("« Mon Gaulois » s'ouvre en écran de jeu, avec sa barre, son kit en pixels et sa ligne du bas", async ({ page, request }) => {
  await page.goto("/village");
  await expect(page.locator("html")).toHaveAttribute("data-ecran", "jeu");
  const barre = page.getByTestId("jeu-barre");
  await expect(barre).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mon Gaulois");
  await expect(page.getByRole("navigation", { name: "Navigation principale" })).toHaveCount(0);
  await expect(page.getByTestId("section-nav")).toHaveCount(0);
  await expect(barre.getByRole("link", { name: "Retour au site" })).toHaveAttribute("href", "/");
  for (const nom of ["Son", "Musique", "Mettre les animations en pause", "Thème sombre"]) await expect(barre.getByRole("button", { name: nom }), nom).toBeVisible();
  // La musique est coupée au départ ; le son, lui, est actif.
  await expect(barre.getByRole("button", { name: "Musique" })).toHaveAttribute("aria-pressed", "false");
  await expect(barre.getByRole("button", { name: "Son" })).toHaveAttribute("aria-pressed", "true");
  // Le thème se change depuis la barre du jeu, comme depuis l'en-tête du site.
  await barre.getByRole("button", { name: "Thème sombre" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "sombre");
  await barre.getByRole("button", { name: "Thème sombre" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-mode", "sombre");
  const pied = page.getByTestId("jeu-pied");
  await expect(pied.getByRole("link", { name: "Mentions légales" })).toHaveAttribute("href", "/mentions-legales");
  await expect(pied).toContainText("© OpenFront and Contributors");
  // Le logo et les boutons sont des images du kit, chargées.
  const logo = await page.locator(".jeu-logo").evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(logo).toMatch(/^url\("data:image\/png;base64,/);
  const kit = await request.get((await page.locator('link[href*="/village/kit.css"]').getAttribute("href")) ?? "");
  expect(kit.ok()).toBe(true);
  expect(await kit.text()).toContain("--jeu-insigne-13:");
  const chiffres = await request.get("/village/chiffres.json");
  expect(chiffres.ok()).toBe(true);
  const json = (await chiffres.json()) as { joueurs: Record<string, unknown> };
  expect(typeof json.joueurs).toBe("object");
  // Aucun identifiant public n'y est écrit.
  const ids = (loadMembers()?.members ?? []).flatMap((m) => (m.publicId ? [m.publicId] : []));
  const texte = JSON.stringify(json);
  expect(ids.filter((id) => texte.includes(`"${id}"`))).toEqual([]);
});

// La vitrine des visiteurs (revue du 18 novembre 2026) : sous la porte, les Gaulois déjà créés, le plus de victoires d'abord,
// chacun menant à sa fiche. Sans Gaulois relevé (un poste sans le cache de l'Action), rien.
test("« Mon Gaulois » montre aux visiteurs les Gaulois déjà créés par les membres", async ({ page }) => {
  const attendus = vitrinePublique(loadMembers()?.members ?? [], (id) => portraitDuGaulois(id) !== null);
  await page.goto("/village");
  if (attendus.length === 0) {
    await expect(page.getByTestId("vitrine-publique")).toHaveCount(0);
    return;
  }
  await expect(page.getByRole("heading", { level: 2, name: "Les Gaulois du clan" })).toBeVisible();
  const cases = page.getByTestId("vitrine-publique-gaulois");
  await expect(cases).toHaveCount(attendus.length);
  await expect(cases.first()).toHaveAttribute("href", `/membres/${encodeURIComponent(attendus[0]!.id)}`);
  await expect(cases.first()).toContainText(attendus[0]!.pseudo);
});

// La démonstration des visiteurs (21 novembre 2026, choix du pilote) : un booster d'essai s'ouvre avec l'animation des
// boosters, sur un tirage d'exemple fait dans le navigateur, sans rien demander au serveur ; puis « Rejoins le clan pour jouer ».
test("« Mon Gaulois » laisse un visiteur ouvrir un booster d'essai, puis l'invite à rejoindre le clan", async ({ page }) => {
  const appels: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/rest/v1/") || r.url().includes("/auth/v1/")) appels.push(r.url());
  });
  await page.goto("/village");
  const demo = page.getByTestId("demo-jeu");
  await expect(demo.getByRole("heading", { level: 2, name: "Essayez un booster" })).toBeVisible();
  await expect(demo.getByRole("heading", { level: 2, name: "Rejoins le clan pour jouer" })).toBeVisible();
  await expect(demo.getByTestId("demo-lien-rejoindre")).toHaveAttribute("href", "/rejoindre");
  await demo.getByTestId("demo-ouvrir").click();
  const fenetre = page.getByTestId("demo-fenetre");
  await expect(fenetre).toBeVisible();
  await fenetre.getByTestId("booster-passer").click();
  await expect(fenetre.getByTestId("demo-tirage")).toBeVisible();
  await expect(fenetre).toContainText("Tirage d'exemple : cet objet n'est ni enregistré ni donné.");
  await expect(fenetre.getByTestId("demo-fenetre-rejoindre")).toHaveAttribute("href", "/rejoindre");
  await fenetre.getByTestId("demo-fermer").click();
  await expect(fenetre).toHaveCount(0);
  expect(appels).toEqual([]);
});

// « La boutique » (15 novembre 2026) : sa page est devenue, le même jour, un onglet de « Mon Gaulois », à la demande du
// pilote. L'ancienne adresse y mène, et celle du marché aussi, sans aucun appel au serveur. Sans serveur, la porte fermée de
// /village : ni onglets, ni bourse, ni rayons, ni marché. Ses écrans connectés sont essayés à part.
test("/boutique et /village#marche mènent à l'onglet « La boutique » de « Mon Gaulois »", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("supabase") || r.url().includes("/rest/v1/")) calls.push(r.url());
  });
  await page.goto("/boutique");
  await expect(page).toHaveURL(/\/village\/?#boutique$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mon Gaulois");
  await expect(page.getByTestId("auth-not-open")).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
  for (const id of ["boutique", "bourse", "pochette", "marche"]) await expect(page.getByTestId(id), id).toHaveCount(0);
  // Un écran de jeu depuis le 21 novembre 2026 : la barre du jeu, pas la rubrique du site.
  await expect(page.getByTestId("jeu-barre")).toBeVisible();
  await expect(page.getByTestId("section-nav")).toHaveCount(0);
  // L'ancienne adresse du marché, sur /boutique ou sur /village, garde son ancre : la boutique y descend une fois ouverte.
  await page.goto("/boutique#marche");
  await expect(page).toHaveURL(/\/village\/?#marche$/);
  // Celle de la pochette des familiers aussi.
  await page.goto("/boutique#familiers");
  await expect(page).toHaveURL(/\/village\/?#familiers$/);
  for (const path of ["/village", "/village#gaulois", "/village#forge", "/village#boutique", "/village#marche", "/village#familiers"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mon Gaulois");
    expect(new URL(page.url()).pathname).toMatch(/\/village\/?$/);
  }
  expect(calls).toEqual([]);
});

// La commande /feu du robot Discord lit le grand feu dans /village/monde.json : le site le publie toujours, même sans le
// monde du village à l'écran (15 novembre 2026). Le chantier et le feu y sont un objet, ou null quand il n'y a pas de données.
test("/village/monde.json reste publié pour la commande /feu", async ({ request }) => {
  const reponse = await request.get("/village/monde.json");
  expect(reponse.ok()).toBe(true);
  expect(reponse.headers()["content-type"]).toContain("application/json");
  const etat = (await reponse.json()) as Record<string, unknown>;
  expect(Object.keys(etat).sort()).toEqual(["chantier", "feu", "releve"]);
  if (etat["feu"] !== null) expect(etat["feu"]).toEqual(expect.objectContaining({ niveau: expect.any(Number), points: expect.any(Number) }));
  if (etat["releve"] !== null) expect(Number.isNaN(Date.parse(String(etat["releve"])))).toBe(false);
});
