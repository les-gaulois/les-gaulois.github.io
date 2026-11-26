// Les contrôles communs à tout le site : chaque page de `PAGES` (`outils-site.ts`), en-tête, titres, thèmes, plan du site, pied de page, sans JavaScript, clavier.
import { existsSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { clan } from "../../config/clan";
import { loadMemberResults, loadMembers, loadMeta, loadSessions } from "../../src/lib/data";
import { fmtDateTime, fmtInt } from "../../src/lib/format";
import type { LeaderboardEntry } from "../../src/lib/schemas";
import { neighbours, withOfficialRanks } from "../../src/lib/stats";
import { playerPodiums } from "../../src/lib/podiums";
import { SECTIONS } from "../../src/lib/nav";
import { LETTRINE_TITRE, largeurTexte } from "../../src/lib/police/largeur";
import { CHOOSE_NAME_URL } from "../../src/lib/pseudo-openfront";
import { PAGES, lb, members, gal, digits, openFolds, hydrated } from "./outils-site";

test("sans serveur configuré, la connexion n'apparaît pas et le site reste statique", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("supabase") || r.url().includes("/rest/v1/")) calls.push(r.url());
  });
  await page.goto("/");
  await expect(page.getByTestId("auth-sign-in")).toHaveCount(0);
  // Sans serveur, pas de face privée : l'accueil n'en montre pas la porte.
  await expect(page.getByTestId("home-qg")).toHaveCount(0);
  // Ni la carte de l'alliance, ni son entrée dans la rangée de la page Carte.
  await page.goto("/carte");
  await expect(page.locator("[data-ouvre=\"alliance\"]")).toHaveCount(0);
  await expect(page.locator("[data-alliance-canvas]")).toHaveCount(0);
  // « Mon Gaulois » aussi, même par l'ancienne adresse de sa fenêtre dans le monde du village.
  for (const path of ["/compte", "/direction", "/qg", "/village", "/village#gaulois", "/village#boutique", "/boutique"]) {
    await page.goto(path);
    await expect(page.getByTestId("auth-not-open")).toBeVisible();
  }
  expect(calls).toEqual([]);
});

// L'administration est dans la Direction depuis le 12 novembre 2026 (au QG du 10 au 12) : ses anciennes adresses y mènent,
// avec la suite de l'adresse (le code d'un retour de Discord, un onglet). Les autres onglets du QG restent au QG.
test("les anciennes adresses de l'administration mènent à la Direction", async ({ page }) => {
  const atDirection = (search: string, hash: string) => (url: URL) => /^\/direction\/?$/.test(url.pathname) && url.search === search && url.hash === hash;
  await page.goto("/admin");
  await page.waitForURL(atDirection("", "#demandes"));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Direction");
  await page.goto("/admin?code=essai#comptes");
  await page.waitForURL(atDirection("?code=essai", "#comptes"));
  for (const hash of ["#demandes", "#comptes", "#journal"]) {
    await page.goto(`/qg?code=essai${hash}`);
    await page.waitForURL(atDirection("?code=essai", hash));
  }
  await page.goto("/qg#salons");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Le QG");
  expect(new URL(page.url()).hash).toBe("#salons");
  // Page déjà ouverte, seule l'ancre change : le navigateur ne recharge pas la page, le renvoi a lieu quand même.
  await page.goto("/qg#comptes");
  await page.waitForURL(atDirection("", "#comptes"));
});

// Les faces privées : les pages publiées ne contiennent que la porte. Leur contenu vient du serveur, pour un membre validé
// au QG, pour l'encadrement à la Direction, qui a aussi l'administration.
test("le QG et la Direction ne sont pas indexés, et leur page ne contient rien de privé", async ({ page }) => {
  await page.goto("/qg");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Le QG");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  for (const id of ["qg", "qg-salons", "qg-decisions", "qg-ideas", "qg-wall", "qg-events"]) await expect(page.getByTestId(id)).toHaveCount(0);
  await page.goto("/direction");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Direction");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  for (const id of ["direction", "admin-requests", "admin-members", "admin-log"]) await expect(page.getByTestId(id)).toHaveCount(0);
});

// L'encadrement sait d'un coup d'œil où il est. Le compte d'un membre reste bleu, comme le reste du site, et le QG aussi,
// dans l'ambiance console de la Direction.
test("seules les pages de l'encadrement passent au rouge", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Même thème sur mobile.");
  const look = async (path: string) => {
    await page.goto(path);
    return page.evaluate(() => ({
      theme: document.documentElement.dataset.theme ?? null,
      ambiance: document.documentElement.dataset.ambiance ?? null,
      style: document.documentElement.dataset.console ?? null,
      background: getComputedStyle(document.body).backgroundColor,
      bar: document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? "",
    }));
  };
  // La barre du navigateur, sur téléphone, prend le fond de la page.
  const rgbOf = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
  const blue = await look("/");
  expect(blue.theme).toBeNull();
  expect(blue.ambiance).toBeNull();
  expect(blue.style).toBeNull();
  expect(blue.background).toBe(rgbOf(blue.bar));
  const red = await look("/direction");
  expect(red.theme).toBe("rouge");
  // La Direction a en plus l'ambiance console (docs/DESIGN.md), dans son seul style, Terminal : son fond est le jeton
  // navy de ce style, que la barre du navigateur reprend.
  expect(red.ambiance).toBe("console");
  expect(red.style).toBe("terminal");
  expect(red.background).not.toBe(blue.background);
  expect(red.background).toBe(rgbOf(red.bar));
  // Le QG prend la même console depuis le 12 novembre 2026, sans le rouge : le Terminal bleu des membres.
  const qg = await look("/qg");
  expect(qg.theme).toBeNull();
  expect(qg.ambiance).toBe("console");
  expect(qg.style).toBe("terminal");
  expect(qg.background).not.toBe(blue.background);
  expect(qg.background).not.toBe(red.background);
  expect(qg.background).toBe(rgbOf(qg.bar));
  // Le guide du clan est une console depuis le 12 novembre 2026 (« comme la Carte »), sans le rouge de l'encadrement. Depuis
  // le 13 novembre, son fond est celui du site, et non plus celui du Terminal (« garder la même DA […] sur TOUT le
  // site ») : blanc depuis le thème clair du 14 novembre, et la barre du navigateur le reprend.
  expect(await look("/debuter")).toEqual({ ...qg, background: blue.background, bar: blue.bar });
  // La page Carte n'est plus une console depuis le 13 novembre 2026 au soir (« j'aime pas trop le design hacker sur la
  // carte ») : ni ambiance ni style Terminal, le bleu des autres pages (« mieux fondre avec les codes couleur »).
  expect(await look("/carte")).toEqual(blue);
  for (const path of [...PAGES.filter((path) => path !== "/qg" && path !== "/carte" && path !== "/debuter"), "/compte", "/confidentialite"]) {
    expect(await look(path), path).toEqual(blue);
  }
});

// Au QG et à la Direction, les phrases, les dates et les tableaux portent des chiffres (.tnum) : le 12 novembre 2026, une
// règle les mettait tous en vert ; le pilote a trouvé « un peu trop de vert dans les écritures » au QG, et la Direction a
// suivi avec son accord. Comme sur la page Carte, le vert n'y est plus que la voix de la machine (invite, ligne de
// commande d'une partie, « ~/qg », « > » ; les icônes sont en pastilles de couleur depuis le 14 novembre 2026). Les tests
// construisent le site sans serveur de connexion : ces pages n'y montrent que leur porte. Le contrôle pose donc dans chacune le balisage des écrans connectés (une phrase, un texte,
// un tableau, un grand chiffre).
test("au QG et à la Direction, aucun texte ni chiffre n'est vert", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Même rendu sur mobile.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const SONDES = ["phrase", "texte", "tableau", "grand"];
  const couleurs = async (path: string) => {
    await page.goto(path);
    return page.evaluate(() => {
      const sonde = document.createElement("div");
      sonde.innerHTML = `
        <p data-sonde="phrase" class="tnum text-sm text-muted">Mis à jour le 11 nov. 2026</p>
        <p data-sonde="texte" class="tnum">3 sur 12 membres reconnus se montrent.</p>
        <table class="tnum"><tbody><tr><td data-sonde="tableau">2 311</td></tr></tbody></table>
        <p data-sonde="grand" class="console-valeur tnum font-display text-4xl font-extrabold">40e</p>
        <span data-sonde="vert" style="color: var(--console-vert)">vert</span>`;
      document.querySelector(".espace")!.append(sonde);
      const lu: Record<string, string> = {};
      for (const el of sonde.querySelectorAll<HTMLElement>("[data-sonde]")) lu[el.dataset.sonde ?? ""] = getComputedStyle(el).color;
      const hote = document.querySelector(".console-hote");
      lu.hote = hote ? getComputedStyle(hote).color : "";
      lu.espace = getComputedStyle(document.querySelector(".espace")!).color;
      sonde.remove();
      return lu;
    });
  };
  for (const [nom, path] of [
    ["QG", "/qg"],
    ["Direction", "/direction"],
  ] as const) {
    const lu = await couleurs(path);
    // Une vraie couleur, et pas celle du texte de la page : sans quoi le contrôle ne prouverait rien.
    expect(lu.vert, nom).toBeTruthy();
    expect(lu.vert, nom).not.toBe(lu.espace);
    expect(lu.hote, `l'invite, voix de la machine, reste verte (${nom})`).toBe(lu.vert);
    for (const sonde of SONDES) expect(lu[sonde], `${nom}, ${sonde}`).not.toBe(lu.vert);
  }
});

// Le poste de commandement (docs/DESIGN.md) : depuis le 12 novembre 2026, la chasse fixe de la console est préchargée sur
// toutes les pages, et chacune a son invite décorative (la lumière qui passait sur le titre est retirée le 13 novembre
// 2026). La Direction et le QG gardent leur console. La pause comme « réduire les animations » arrêtent l'invite, la chute
// du guerrier de l'accueil et la bande de la console, portée par <html> lui-même, que `.fx-off *` ne vise pas.
test("l'invite et la console sont décoratives, et la pause arrête leurs animations", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Même rendu sur mobile.");
  const fonts: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("jetbrains-mono")) fonts.push(new URL(r.url()).pathname);
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(fonts.length).toBeGreaterThan(0);
  await expect(page.locator(".invite")).toHaveAttribute("aria-hidden", "true");
  // Le guerrier de l'accueil tombe en colonnes à l'ouverture : la pause et « réduire les animations » l'arrêtent aussi.
  const falling = () => page.evaluate(() => getComputedStyle(document.querySelector(".holo-logo .console-goutte")!).animationName);
  expect(await falling()).toBe("console-goutte");
  // Une page de lecture : la rubrique en dossier, la page en commande. La lumière qui passait sur le titre est retirée
  // depuis le 13 novembre 2026, avec la surbrillance : plus rien n'est dessiné par-dessus lui.
  await page.goto("/classement");
  await expect(page.locator(".invite")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".invite")).toHaveText(/^gal@clan:~\/resultats\$\s\.\/classement$/);
  const reading = () =>
    page.evaluate(() => ({
      light: getComputedStyle(document.querySelector("h1")!, "::after").animationName,
      prompt: getComputedStyle(document.querySelector(".invite")!).animationName,
      cursor: getComputedStyle(document.querySelector(".invite .console-curseur")!).animationName,
    }));
  expect(await page.evaluate(() => getComputedStyle(document.querySelector("h1")!, "::after").content)).toBe("none");
  // Le pavé de l'invite clignote comme un terminal (demande du pilote, 14 novembre 2026) : sans fin, net, moins d'une
  // fois par seconde. La pause et « réduire les animations » le laissent allumé, fixe.
  expect(await reading()).toEqual({ light: "none", prompt: "console-frappe", cursor: "console-clignote" });
  expect(
    await page.evaluate(() => {
      const style = getComputedStyle(document.querySelector(".invite .console-curseur")!);
      return { count: style.animationIterationCount, timing: style.animationTimingFunction, duration: parseFloat(style.animationDuration) };
    }),
  ).toEqual({ count: "infinite", timing: "steps(1)", duration: 1.1 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  expect(await reading()).toEqual({ light: "none", prompt: "none", cursor: "none" });
  await page.goto("/");
  expect(await falling()).toBe("none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => localStorage.setItem("gal-fx", "off"));
  await page.reload();
  expect(await falling()).toBe("none");
  await page.goto("/classement");
  expect(await reading()).toEqual({ light: "none", prompt: "none", cursor: "none" });
  await page.evaluate(() => localStorage.removeItem("gal-fx"));
  await page.goto("/qg");
  await page.waitForLoadState("networkidle");
  // La console a sa propre invite : celle du site ne s'y ajoute pas.
  await expect(page.locator(".invite")).toHaveCount(0);
  await expect(page.locator(".console-invite")).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Le QG");
  await page.goto("/direction");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".console-invite")).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Direction");
  const moving = () =>
    page.evaluate(() => ({
      band: getComputedStyle(document.documentElement, "::after").animationName,
      prompt: getComputedStyle(document.querySelector(".console-invite")!).animationName,
      cursor: getComputedStyle(document.querySelector(".console-invite .console-curseur")!).animationName,
    }));
  expect(await moving()).toEqual({ band: "console-balayage", prompt: "console-frappe", cursor: "console-clignote" });
  // « Réduire les animations » du système : la règle globale vise aussi <html>.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  expect(await moving()).toEqual({ band: "none", prompt: "none", cursor: "none" });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => localStorage.setItem("gal-fx", "off"));
  await page.reload();
  expect(await moving()).toEqual({ band: "none", prompt: "none", cursor: "none" });
});

// L'onciale de cases (docs/DESIGN.md, « Typographie ») : depuis le 12 novembre 2026, les titres et les gros chiffres des
// pages ouvertes à tous, les grands titres et les chiffres clés en cases visibles, choisies par le pilote. Le pied de page
// garde ses titres en chasse fixe, et le QG et la Direction gardent Outfit : ils ne chargent pas l'onciale.
test("l'onciale de cases écrit les titres des pages ouvertes à tous, pas ceux du QG ni de la Direction", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Même rendu sur mobile.");
  const polices: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/generated/polices/")) polices.push(new URL(r.url()).pathname);
  });
  const familles = () =>
    page.evaluate(() => {
      const premiere = (selecteur: string) => {
        const el = document.querySelector(selecteur);
        return el ? (getComputedStyle(el).fontFamily.split(",")[0] ?? "").replace(/"/g, "").trim() : null;
      };
      const chargees = [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, ""));
      return { titre: premiere("main h1"), chiffre: premiere(".kpi-value"), pied: premiere("footer h2"), chargees };
    });
  await page.goto("/classement");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  // Toutes les pages sauf le QG et la Direction, même une page en ambiance console : c'est data-lettres qui décide.
  await expect(page.locator("html")).toHaveAttribute("data-lettres", "onciale");
  const publique = await familles();
  expect({ titre: publique.titre, chiffre: publique.chiffre, pied: publique.pied }).toEqual({ titre: "GAL Onciale Cases", chiffre: "GAL Onciale Cases", pied: "JetBrains Mono Variable" });
  expect(publique.chargees).toContain("GAL Onciale Cases");
  expect(polices.some((p) => p.endsWith("/onciale-cases.woff2"))).toBe(true);
  // Les petits titres, dans les mêmes lettres taillées, sans cases. L'accueil n'en a plus depuis le retrait de « Les Gaulois de
  // la semaine » (22 novembre 2026) : ceux de la gazette, dont ce bloc était le résumé.
  await page.goto("/gazette");
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => getComputedStyle(document.querySelector("main h3")!).fontFamily)).toMatch(/^"GAL Onciale",/);
  polices.length = 0;
  for (const path of ["/qg", "/direction"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html"), path).not.toHaveAttribute("data-lettres", /.*/);
    expect((await familles()).titre, path).toBe("Outfit Variable");
  }
  expect(polices).toEqual([]);
});

// Les vraies minuscules et les lettrines (12 novembre 2026, choisies par le pilote sur captures) : les titres des pages
// ouvertes à tous ne sont plus en capitales ; la première lettre d'un titre de page est plus grande et rouge, celle d'un
// titre de section plus grande. La Carte et le guide du clan, en console, gardent leurs capitales sans lettrine, comme le
// QG et la Direction.
// Le pseudo d'une fiche de membre n'a pas de lettrine non plus : un nom s'écrit tel quel.
// Deux cas à tenir : avec les effets, fx.ts pose chaque mot du titre dans un bloc (.fx-word) et la lettrine est la première
// lettre de ce bloc ; en mouvement réduit, c'est celle du titre lui-même. Une règle écrite pour un seul des deux cas ne
// montrait la lettrine qu'en mouvement réduit.
test("les titres ont de vraies minuscules et une lettrine, sauf en console, au QG et à la Direction", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Même rendu sur mobile.");
  // La première lettre du titre comparée à la deuxième, telles qu'elles sont dessinées : le rapport de leurs hauteurs est
  // la taille de la lettrine. La couleur est lue sur le bloc qui porte la lettre (le mot, ou le titre).
  const titre = (selecteur: string) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const marche = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let noeud = marche.nextNode();
      while (noeud && (noeud.textContent ?? "").trim().length < 2) noeud = marche.nextNode();
      if (!noeud) return null;
      const lettres = noeud;
      const texte = lettres.textContent ?? "";
      const debut = texte.length - texte.trimStart().length;
      const hauteur = (i: number) => {
        const r = document.createRange();
        r.setStart(lettres, i);
        r.setEnd(lettres, i + 1);
        return r.getBoundingClientRect().height;
      };
      const style = getComputedStyle(el);
      const porteur = lettres.parentElement ?? el;
      return {
        casse: style.textTransform,
        lettrine: hauteur(debut) / hauteur(debut + 1),
        // Le rouge du drapeau du thème clair (--color-red, 14 novembre 2026).
        rouge: getComputedStyle(porteur, "::first-letter").color === "rgb(217, 18, 40)",
        interligne: Math.round((parseFloat(style.lineHeight) / parseFloat(style.fontSize)) * 100) / 100,
        motsAnimes: el.querySelectorAll(".fx-word").length,
      };
    }, selecteur);
  const ouvrir = async (path: string) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    // Les mots d'un titre entrent un à un, légèrement inclinés : on mesure une fois leur entrée finie.
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) {
        if (animation.effect?.getComputedTiming().iterations !== Infinity) animation.finish();
      }
    });
  };
  for (const mouvement of ["no-preference", "reduce"] as const) {
    await page.emulateMedia({ reducedMotion: mouvement });
    await ouvrir("/classement");
    const page1 = await titre("main h1");
    expect(page1, mouvement).toMatchObject({ casse: "none", rouge: true, interligne: 1.15 });
    expect(page1?.lettrine, mouvement).toBeCloseTo(LETTRINE_TITRE, 1);
    expect((page1?.motsAnimes ?? 0) > 0, mouvement).toBe(mouvement === "no-preference");
    // La page Carte reprend les lettres du site depuis le 13 novembre 2026 au soir : minuscules et lettrine rouge.
    await ouvrir("/carte");
    const carte = await titre("main h1");
    expect(carte, mouvement).toMatchObject({ casse: "none", rouge: true });
    expect(carte?.lettrine, mouvement).toBeCloseTo(LETTRINE_TITRE, 1);
    // Un titre de section : une lettrine plus petite, rouge elle aussi depuis le 13 novembre 2026 (« plus utiliser la
    // seconde couleur qui est le rouge », remarque transmise par le pilote).
    await ouvrir("/activite");
    const section = await titre("main .section-title");
    expect(section, mouvement).toMatchObject({ casse: "none", rouge: true, interligne: 1.15 });
    expect(section?.lettrine, mouvement).toBeCloseTo(1.3, 1);
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // Une étiquette garde ses capitales, même posée sur un titre : le libellé d'une courbe (.kpi-label sur un h3), la date
  // d'un jour des nouveautés (.uppercase sur un h2). La règle des minuscules ne pèse pas plus qu'une balise.
  await ouvrir("/progression");
  expect(await page.evaluate(() => getComputedStyle(document.querySelector("main h3.kpi-label")!).textTransform)).toBe("uppercase");
  await ouvrir("/nouveautes");
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('main [data-testid="nouveautes-day"] h2')!).textTransform)).toBe("uppercase");
  // La police a un dessin pour chaque minuscule : un mot a la largeur de ses dessins, plus étroite en minuscules.
  await ouvrir("/classement");
  const largeurs = await page.evaluate(() => {
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = '100px "GAL Onciale Cases"';
    return { minuscules: ctx.measureText("classement").width / 100, capitales: ctx.measureText("CLASSEMENT").width / 100 };
  });
  expect(largeurs.minuscules).toBeCloseTo(largeurTexte("classement"), 2);
  expect(largeurs.capitales).toBeCloseTo(largeurTexte("CLASSEMENT"), 2);
  expect(largeurs.minuscules).toBeLessThan(largeurs.capitales);
  // Le guide du clan, le QG et la Direction : des capitales, pas de lettrine.
  for (const path of ["/debuter", "/qg", "/direction"]) {
    await ouvrir(path);
    const enConsole = await titre("main h1");
    expect(enConsole, path).toMatchObject({ casse: "uppercase", rouge: false });
    expect(enConsole?.lettrine, path).toBeCloseTo(1, 1);
  }
  // Une fiche de membre : son titre est un pseudo, qui s'écrit tel quel, sans lettrine. Agrandie, la minuscule de « nico »
  // se lisait comme une capitale.
  const nomme = members.members.find((m: { username: string | null; publicId: string | null }) => m.publicId && /^[A-Za-z0-9]{2}/.test(m.username ?? ""));
  await ouvrir(`/membres/${nomme.publicId}`);
  const fiche = await titre("main h1");
  expect(fiche).toMatchObject({ casse: "none", rouge: false, interligne: 1.15 });
  expect(fiche?.lettrine).toBeCloseTo(1, 1);
  // Les titres de section de la fiche gardent la leur.
  expect((await titre("main .section-title"))?.lettrine).toBeCloseTo(1.3, 1);
});

// Les onglets d'une rubrique font une seule suite de pages : en passant de l'un à l'autre, la rangée d'onglets, la ligne
// tricolore et le titre partent du même bord, même vers le QG et le guide, qui sont en console (01-socle.css, « --page-max »).
// Depuis le 15 novembre 2026, le QG prend toute la largeur du site, sous ses onglets ; la Direction, sans rubrique, prend
// tout l'écran (data-largeur="ecran"), avec les marges du site.
test("d'un onglet à l'autre d'une rubrique, les onglets, la ligne tricolore et le titre ne bougent pas", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Largeurs testées une seule fois.");
  test.slow();
  const bords = async (path: string) => {
    await page.goto(path);
    return page.evaluate(() => {
      const gauche = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().left ?? null;
      const tete = document.querySelector("main .console-tete")?.getBoundingClientRect();
      const wrap = document.querySelector<HTMLElement>("main > .wrap");
      const style = wrap ? getComputedStyle(wrap) : null;
      // Le début de la ligne d'onglets, à l'intérieur de ses marges : sur téléphone, la ligne glisse jusqu'à l'onglet ouvert
      // (18 novembre 2026), son contenu peut donc être décalé, mais la ligne elle-même ne bouge pas.
      const rubrique = document.querySelector<HTMLElement>("main .rubrique");
      return {
        onglet: rubrique ? rubrique.getBoundingClientRect().left + parseFloat(getComputedStyle(rubrique).paddingLeft) : null,
        filet: gauche("main .tribar"),
        titre: gauche("main h1"),
        tete: tete ? { gauche: tete.left, largeur: tete.width } : null,
        // La largeur utile du contenu de la page : son .wrap, moins ses deux marges.
        contenu: wrap && style ? wrap.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) : null,
        // Le bord droit du grand guerrier de l'en-tête (QG, Direction).
        logo: document.querySelector("main .console-logo-tete")?.getBoundingClientRect().right ?? null,
        fenetre: document.documentElement.clientWidth,
        deborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
  };
  for (const width of [360, 390, 768, 1280, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    const rubriques: [string, ...string[]][] = [
      ["/membres", "/liste", "/qg"],
      ["/activite", "/debuter"],
    ];
    for (const [repere, ...autres] of rubriques) {
      const attendu = await bords(repere);
      expect(attendu.onglet, `${repere} à ${width} px`).not.toBeNull();
      expect(attendu.filet, `${repere} à ${width} px`).toBeCloseTo(attendu.onglet!, 0);
      expect(attendu.titre, `${repere} à ${width} px`).toBeCloseTo(attendu.onglet!, 0);
      for (const path of autres) {
        const ici = await bords(path);
        const ou = `${path} à ${width} px`;
        expect(ici.onglet, ou).toBeCloseTo(attendu.onglet!, 0);
        expect(ici.filet, ou).toBeCloseTo(attendu.onglet!, 0);
        expect(ici.titre, ou).toBeCloseTo(attendu.onglet!, 0);
        expect(ici.deborde, ou).toBeLessThanOrEqual(0);
        if (path === "/qg") {
          // La porte et les écrans du QG : toute la largeur du contenu, comme Membres et La liste.
          expect(ici.tete?.gauche, ou).toBeCloseTo(attendu.onglet!, 0);
          expect(ici.tete?.largeur, ou).toBeCloseTo(ici.contenu!, 0);
        }
      }
    }
    // La Direction n'a pas d'onglets de rubrique : elle prend tout l'écran, avec les marges du site (16 px sur téléphone,
    // 4 % de la largeur, 80 px au plus), au-delà des 120 rem des autres pages.
    const direction = await bords("/direction");
    const marge = Math.min(80, Math.max(16, width * 0.04));
    const ou = `/direction à ${width} px`;
    expect(direction.titre, ou).toBeCloseTo(marge, 0);
    expect(direction.contenu, ou).toBeCloseTo(direction.fenetre - 2 * marge, 0);
    // Sur grand écran, le guerrier se place à droite du titre et s'arrête au bord droit du contenu, comme au QG.
    if (width >= 1024) {
      expect(direction.logo, ou).toBeCloseTo(direction.fenetre - marge, 0);
      const qg = await bords("/qg");
      expect(qg.logo, `/qg à ${width} px`).toBeCloseTo(qg.onglet! + qg.contenu!, 0);
    }
    expect(direction.deborde, ou).toBeLessThanOrEqual(0);
  }
});

// L'onciale est plus large qu'Outfit : sur un téléphone de 360 px, chaque titre de page prend la taille qui laisse son plus
// long mot sur une ligne (--mot-em, PageHeader.astro), lettrine comprise, au lieu de le couper en deux.
test("à 360 px, aucun titre de page ne coupe un mot en deux", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Largeur testée une seule fois.");
  await page.setViewportSize({ width: 360, height: 800 });
  for (const path of [...PAGES.filter((path) => path !== "/qg"), "/confidentialite", "/compte"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    const coupes = await page.evaluate(() => {
      const out: string[] = [];
      for (const h1 of document.querySelectorAll("main h1")) {
        const marche = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
        for (let n = marche.nextNode(); n; n = marche.nextNode()) {
          for (const mot of (n.textContent ?? "").matchAll(/[^ \t\r\n]+/g)) {
            const r = document.createRange();
            r.setStart(n, mot.index ?? 0);
            r.setEnd(n, (mot.index ?? 0) + mot[0].length);
            // Deux morceaux d'un mot sont sur la même ligne quand leurs bas sont proches : la lettrine, plus grande, descend
            // à peine plus bas que la suite de son mot, alors qu'une ligne de plus descend d'une hauteur de ligne entière.
            const morceaux = [...r.getClientRects()].filter((x) => x.width > 0).sort((a, b) => a.bottom - b.bottom);
            const coupe = morceaux.some((x, i) => {
              const avant = morceaux[i - 1];
              return avant !== undefined && x.bottom - avant.bottom > Math.min(x.height, avant.height) / 2;
            });
            if (coupe) out.push(mot[0]);
          }
        }
      }
      return out;
    });
    expect(coupes, path).toEqual([]);
  }
});

// Le 14 novembre 2026, le titre de la page et les titres de ses blocs faisaient tous 64 px sur un ordinateur (36 et 32 px
// sur un téléphone) : rien ne disait où commencer. Le titre de la page est maintenant le plus fort, un titre de bloc un
// cran en dessous, sans descendre sous 44 px sur un ordinateur (le pilote veut un site écrit en gros).
test("le titre de la page est plus fort que les titres de ses blocs", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Largeurs testées une seule fois.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const largeur of [1440, 390]) {
    await page.setViewportSize({ width: largeur, height: 900 });
    for (const path of ["/records", "/membres", "/rivaux", "/activite", "/gazette", "/progression"]) {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      // Les courbes de Progression s'affichent après le chargement de la page.
      await page.locator("main .section-title").first().waitFor();
      const tailles = await page.evaluate(() => {
        const px = (el: Element) => parseFloat(getComputedStyle(el).fontSize);
        const visibles = (sel: string) => [...document.querySelectorAll(sel)].filter((el) => el.getClientRects().length > 0);
        return { page: visibles("main h1").map(px), blocs: visibles("main .section-title").map(px) };
      });
      const ou = `${path} à ${largeur} px`;
      expect(tailles.page, ou).toHaveLength(1);
      expect(tailles.blocs.length, ou).toBeGreaterThan(0);
      // Un tiers de plus au moins : 80 px contre 48 sur un ordinateur, 40 contre 28 sur un téléphone.
      expect(tailles.page[0]! / Math.max(...tailles.blocs), ou).toBeGreaterThanOrEqual(1.33);
      // Tous les titres de bloc d'une page ont la même taille, et restent gros sur un ordinateur.
      expect(Math.max(...tailles.blocs) - Math.min(...tailles.blocs), ou).toBeLessThan(0.5);
      if (largeur === 1440) expect(Math.min(...tailles.blocs), ou).toBeGreaterThanOrEqual(44);
    }
  }
});

// Même cause pour les colonnes étroites : un rang ou un tag qui tenait en Outfit se coupe en deux dans l'onciale. Le
// 12 novembre 2026, dans les podiums de Records, « 1er » passait sur deux lignes (« 1e » puis « r ») dans sa colonne de
// 2,25 rem. Dans « Le score autour de [GAL] » de Nos rivaux, la moitié des tags du classement ne tenaient pas dans la
// colonne fixe : on y écrit le plus large d'entre eux, qui doit garder sa ligne, à côté de sa barre, et les barres partir
// toutes du même point.
test("un rang de podium ou un tag de clan tient sur une ligne et dans sa colonne, de 360 à 1 920 px", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Largeurs testées une seule fois.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Sans les lettres taillées, tout se mesurerait en Outfit, plus étroite, et passerait.
  const ouvrir = async (path: string) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    const chargee = await page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/"/g, "") === "GAL Onciale" && f.status === "loaded"));
    expect(chargee, `${path} : police GAL Onciale chargée`).toBe(true);
  };
  // Pour chaque élément : sa police, son nombre de lignes (sa hauteur rapportée à son interligne) et de combien son texte
  // dépasse à droite de sa colonne.
  const mesurer = (selecteur: string) =>
    page.locator(selecteur).evaluateAll((els) =>
      els.map((el) => {
        const style = getComputedStyle(el);
        const boite = el.getBoundingClientRect();
        const texte = document.createRange();
        texte.selectNodeContents(el);
        return {
          texte: el.textContent?.trim() ?? "",
          police: style.fontFamily,
          lignes: Math.round(boite.height / parseFloat(style.lineHeight)),
          depasse: texte.getBoundingClientRect().right - boite.right,
        };
      }),
    );
  const tenir = (mesures: Awaited<ReturnType<typeof mesurer>>, ou: string) => {
    for (const m of mesures) {
      expect(m.police, `« ${m.texte} », ${ou}`).toMatch(/^"GAL Onciale"/);
      expect(m.lignes, `« ${m.texte} », ${ou}`).toBe(1);
      expect(m.depasse, `« ${m.texte} », ${ou}`).toBeLessThanOrEqual(0.5);
    }
  };
  // Combien de rangs et de lignes chaque page doit montrer, d'après les mêmes calculs qu'elle : rien ne passe à vide.
  const podiums = playerPodiums(loadMemberResults(), loadSessions(), loadMembers(), loadMeta().sessions.coveredUntil);
  const voisins = neighbours(withOfficialRanks(lb.clans as LeaderboardEntry[]), clan.tag);
  const attendus = {
    records: podiums.since === null ? 0 : podiums.streaks.length + podiums.days.length,
    rivaux: voisins ? 1 + (voisins.above ? 1 : 0) + (voisins.below ? 1 : 0) : 0,
  };
  const tags: string[] = lb.clans.map((c: { clanTag: string }) => `[${c.clanTag}]`);
  const plusLarge = tags.reduce((a, b) => (largeurTexte(b) > largeurTexte(a) ? b : a));
  for (const width of [360, 375, 768, 1024, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await ouvrir("/records");
    const records = await mesurer('[data-testid="podium-row"] > :first-child');
    expect(records, `/records à ${width} px`).toHaveLength(attendus.records);
    tenir(records, `/records à ${width} px`);
    await ouvrir("/rivaux");
    const lignes = page.locator('[data-testid="score-lanes"] li');
    await expect(lignes, `/rivaux à ${width} px`).toHaveCount(attendus.rivaux);
    if (attendus.rivaux === 0) continue;
    await lignes.first().locator(":scope > :first-child").evaluate((el, tag) => (el.textContent = tag), plusLarge);
    tenir(await mesurer('[data-testid="score-lanes"] li > :first-child'), `/rivaux à ${width} px avec ${plusLarge}`);
    // Tag, barre et score côte à côte sur chaque ligne (sans subgrid, ils s'empileraient), et toutes les barres alignées.
    const placees = await lignes.evaluateAll((lis) =>
      lis.map((li) => {
        const boite = (i: number) => li.children[i]!.getBoundingClientRect();
        const tag = boite(0);
        const barre = boite(1);
        const score = boite(2);
        const milieu = (r: DOMRect) => r.top + r.height / 2;
        return {
          coteACote: barre.left >= tag.right - 0.5 && score.left >= barre.right - 0.5,
          memeLigne: Math.abs(milieu(barre) - milieu(tag)) <= 2 && Math.abs(milieu(score) - milieu(tag)) <= 2,
          depart: Math.round(barre.left),
        };
      }),
    );
    for (const p of placees) expect({ coteACote: p.coteACote, memeLigne: p.memeLigne }, `/rivaux à ${width} px`).toEqual({ coteACote: true, memeLigne: true });
    expect(new Set(placees.map((p) => p.depart)).size, `barres de /rivaux à ${width} px`).toBe(1);
  }
});

test("parcours principal", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile";
  const apiCalls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("api.openfront.io")) apiCalls.push(r.url());
  });

  // Accueil : les cartes affichent les valeurs collectées.
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Aller sur le Discord" })).toHaveAttribute("href", "https://discord.gg/cjUc42T7Y2");
  // L'accueil parle d'abord aux membres : rejoindre le clan a sa rubrique dans le menu et le pied de page, depuis le
  // 22 novembre 2026 plus de bloc dans l'accueil.
  await expect(page.locator("main").getByRole("link", { name: /^Rejoindre/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Jouer à OpenFront" }).first()).toBeVisible();
  const cards = page.getByTestId("stat-card");
  await expect(cards).toHaveCount(5);
  // Le vrai chiffre, tout de suite : l'entrée animée ne le fait plus monter depuis zéro.
  expect(digits(await cards.nth(2).locator("[data-count]").textContent())).toBe(String(gal.games));
  // Des mots, pas de signe de division.
  await expect(cards.nth(4)).toContainText("part des parties gagnées");
  for (const texte of await cards.allTextContents()) expect(texte).not.toContain("÷");
  await expect(page.getByTestId("data-status")).toContainText("Dernière mise à jour");
  await expect(page.getByText("Site communautaire non officiel, sans lien avec les éditeurs d'OpenFront.")).toBeVisible();

  // Classement : navigation, ligne mise en évidence, recherche.
  if (mobile) await page.getByText("Menu", { exact: true }).click();
  await page.getByRole("link", { name: "Résultats", exact: true }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/classement/);
  await hydrated(page);
  await expect(page.locator(".row-highlight").filter({ visible: true })).toContainText("[GAL]");
  // Sans recherche, le nombre de clans n'est dit qu'une fois (plus de « 108 clans sur 108 »).
  await expect(page.getByRole("status").filter({ hasText: "dans la liste" })).toHaveText(`${lb.clans.length} clans dans la liste`);
  await page.getByLabel("Rechercher un clan").fill("gal");
  await expect(page.getByText(/clans? sur \d+/)).toContainText("sur");
  await page.getByLabel("Rechercher un clan").fill("zzzzzz");
  await expect(page.getByText("Aucun clan ne correspond")).toBeVisible();

  // Progression : le filtre change le résumé et le tableau reste accessible.
  await page.goto("/progression");
  await hydrated(page);
  const summary = page.getByTestId("summary-Parties");
  await expect(summary).not.toBeEmpty();
  await page.getByRole("button", { name: "30 jours" }).click();
  const month = digits(await summary.textContent());
  await page.getByRole("button", { name: "7 jours" }).click();
  await expect(async () => expect(Number(digits(await summary.textContent()))).toBeLessThan(Number(month))).toPass();
  await page.getByText("Voir le tableau des parties").click();
  await expect(page.getByRole("table").filter({ visible: true }).locator("tbody tr")).toHaveCount(7);

  // La liste des membres, onglet de la rubrique Membres : liste officielle, anonymes, recherche, tri.
  await page.goto("/liste");
  await hydrated(page);
  await expect(page.getByTestId("member-count")).toContainText(fmtInt(members.total));
  // Un membre sans pseudo n'a jamais choisi le nom de son compte : le lien ouvre la fenêtre du jeu où il le choisit.
  await expect(page.getByTestId("choose-name")).toHaveAttribute("href", CHOOSE_NAME_URL);
  // Trente membres d'abord, dix sur téléphone où chacun est une carte : le reste d'un clic, la page reste courte.
  const firstPage = mobile ? 10 : 30;
  // La liste que le visiteur voit : des cartes sur téléphone, les lignes du tableau au-delà.
  const memberRows = page.getByTestId(mobile ? "member-card" : "member-row").filter({ visible: true });
  await expect(memberRows).toHaveCount(Math.min(firstPage, members.members.length));
  if (members.members.length > firstPage) {
    await page.getByTestId("members-more").click();
    await expect(memberRows).toHaveCount(members.members.length);
  }
  await expect(page.getByTestId("members-more")).toHaveCount(0);
  await expect(page.getByText("Membre anonyme").filter({ visible: true }).first()).toBeVisible();
  const named = members.members.find((m: { username: string | null }) => m.username)?.username;
  await page.getByLabel("Rechercher par pseudo").fill(named);
  await expect(page.getByRole("link", { name: named }).filter({ visible: true }).first()).toBeVisible();
  await page.getByLabel("Rechercher par pseudo").fill("");
  if (mobile) await page.getByLabel("Trier par").selectOption("joinedAt");
  else await page.getByRole("button", { name: /Arrivée/ }).click();
  await expect(page.getByText(/\d+ affichés/)).toBeVisible();

  // Activité : la ligne « Parties enregistrées » et la heatmap.
  await page.goto("/activite");
  await expect(page.getByText("Parties enregistrées, heure de Paris.")).toBeVisible();
  await expect(page.getByTestId("best-slot").first()).toBeVisible();

  // Guide du clan : tous les chapitres sont dans la page, un seul se montre, et le sommaire ouvre le chapitre visé.
  await page.goto("/debuter");
  await hydrated(page);
  await expect(page.getByTestId("guide-chapter")).toHaveCount(11);
  await expect(page.getByTestId("guide-chapter").filter({ visible: true })).toHaveCount(1);
  if (mobile) await page.getByRole("button", { name: /Chapitres/ }).click();
  await page.getByRole("navigation", { name: "Chapitres du guide du clan" }).getByRole("link", { name: /Croissance/ }).click();
  await expect(page.getByTestId("growth-chart").locator("svg")).toBeVisible();
  // Les fiches par mode, adaptées du wiki, sont retirées depuis le 12 novembre 2026 : il ne reste que le guide du clan,
  // et la mention de sa source sous lui.
  await expect(page.getByTestId("guide-card")).toHaveCount(0);
  await expect(page.getByTestId("guide-source")).toContainText("Texte réservé au clan");

  // Rejoindre.
  await page.goto("/rejoindre");
  await expect(page.getByTestId("join-steps").locator("li")).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "Demandez une invitation" })).toBeVisible();

  expect(apiCalls, "aucun appel à l'API OpenFront depuis le navigateur").toEqual([]);
});

// Le thème sombre « Nuit Marine » (16 novembre 2026) : le bouton de l'en-tête passe du clair au sombre, le choix est retenu
// d'une page à l'autre, et un appareil réglé en sombre l'ouvre sans rien demander. La barre du navigateur suit le fond.
test("le bouton de l'en-tête passe du thème clair au thème sombre, et le choix est retenu", async ({ page }) => {
  const rgbOf = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
  const etat = () =>
    page.evaluate(() => ({
      mode: document.documentElement.dataset.mode ?? null,
      fond: getComputedStyle(document.body).backgroundColor,
      ecriture: getComputedStyle(document.querySelector("h1")!).color,
      barre: document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? "",
      schema: document.querySelector('meta[name="color-scheme"]')?.getAttribute("content") ?? "",
    }));
  await page.goto("/classement");
  const bouton = page.getByRole("button", { name: "Thème sombre" });
  await expect(bouton).toBeVisible();
  await expect(bouton).toHaveAttribute("aria-pressed", "false");
  const clair = await etat();
  expect(clair.mode).toBeNull();
  expect(clair.fond).toBe("rgb(255, 255, 255)");
  expect(clair.schema).toBe("light");

  await bouton.click();
  await expect(bouton).toHaveAttribute("aria-pressed", "true");
  const sombre = await etat();
  expect(sombre.mode).toBe("sombre");
  expect(sombre.fond).toBe("rgb(10, 18, 48)");
  expect(sombre.ecriture).toBe("rgb(255, 255, 255)");
  expect(sombre.fond).toBe(rgbOf(sombre.barre));
  expect(sombre.schema).toBe("dark");

  // Retenu : une autre page s'ouvre en sombre, au QG (palette du Terminal) et à la Direction (rouge) comme ailleurs.
  for (const [chemin, fond] of [["/liste", "rgb(10, 18, 48)"], ["/carte", "rgb(10, 18, 48)"], ["/qg", "rgb(10, 18, 48)"], ["/direction", "rgb(48, 10, 16)"]] as const) {
    await page.goto(chemin);
    const vu = await etat();
    expect(vu.mode, chemin).toBe("sombre");
    expect(vu.fond, chemin).toBe(fond);
    expect(vu.fond, chemin).toBe(rgbOf(vu.barre));
  }

  await page.getByRole("button", { name: "Thème sombre" }).click();
  expect((await etat()).mode).toBeNull();
  await page.goto("/");
  expect((await etat()).fond).toBe("rgb(255, 255, 255)");
});

test("un appareil réglé en sombre ouvre le site en sombre, sauf si le visiteur a choisi le clair", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-mode", "sombre");
  const bouton = page.getByRole("button", { name: "Thème sombre" });
  await expect(bouton).toHaveAttribute("aria-pressed", "true");
  await bouton.click();
  await page.goto("/classement");
  await expect(page.locator("html")).not.toHaveAttribute("data-mode", "sombre");
});

test("en thème sombre, chaque page passe les contrôles d'accessibilité", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Mêmes couleurs sur mobile.");
  test.slow();
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  for (const path of [...PAGES, "/direction", "/compte", "/confidentialite"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html"), path).toHaveAttribute("data-mode", "sombre");
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(violations.map((v) => `${path} : ${v.id}: ${v.nodes.map((n) => n.target).join(" ; ")}`)).toEqual([]);
  }
});

test("les jauges n'ont qu'une couleur, et la date de mise à jour reste discrète", async ({ page }) => {
  // Remarque reçue le 12 novembre 2026 : une jauge passait du bleu au blanc, celle de GAL par les trois couleurs.
  for (const path of ["/activite", "/rivaux"]) {
    await page.goto(path);
    const bars = await page.locator("main .meter > i").evaluateAll((list) => list.map((i) => getComputedStyle(i).backgroundImage));
    expect(bars.length, path).toBeGreaterThan(0);
    for (const image of bars) expect(image, path).toBe("none");
  }
  // La date de mise à jour : toujours écrite, en petit, en italique et en gris.
  await page.goto("/classement");
  const date = page.getByTestId("data-status").locator("p").first();
  await expect(date).toContainText("Dernière mise à jour");
  await expect(date).toHaveCSS("font-style", "italic");
  await expect(date).toHaveCSS("font-size", "13px");
});

// Revue du 14 novembre 2026 : la date et « Comment lire ces chiffres » revenaient jusqu'à trois fois par page. La date est
// dans l'en-tête, une fois, avec chaque source qui a la sienne ; les précisions sont dans un seul repli, en bas du contenu.
test("une page n'écrit qu'une fois sa date et ses précisions, sans perdre une date", async ({ page }) => {
  const meta = loadMeta();
  // Le classé n'est daté que si son bloc s'affiche ; le détail des parties, avec le comparateur.
  const ranked = existsSync("data/ranked.json") || meta.ranked.lastError !== null ? [meta.ranked] : [];
  const sources = { "/records": [meta.sessions, meta.memberResults, meta.members], "/membres": [meta.members, ...ranked], "/rivaux": [meta.leaderboard, meta.games] };
  for (const [path, states] of Object.entries(sources)) {
    await page.goto(path);
    const main = page.locator("main");
    expect((await main.textContent())?.match(/Dernière mise à jour/g) ?? [], path).toHaveLength(1);
    await expect(main.locator("summary", { hasText: "Comment lire ces chiffres" }), path).toHaveCount(1);
    // La date est dans l'en-tête de la page, et chaque date distincte de ses sources y est écrite.
    const status = page.locator("header.page-tete").getByTestId("data-status");
    await expect(status, path).toHaveCount(1);
    for (const state of states) if (state.lastSuccessAt) await expect(status, path).toContainText(fmtDateTime(state.lastSuccessAt));
    // Le repli est un .fold, après le dernier bloc de la page.
    const note = page.getByTestId("reading-note");
    await expect(note, path).toHaveClass(/\bfold\b/);
    expect(await note.evaluate((el) => el.nextElementSibling === null), path).toBe(true);
  }
});

test.describe("le plan du site", () => {
  test("chaque page appartient à une rubrique, et ses onglets y mènent", async ({ page }) => {
    for (const section of SECTIONS) {
      for (const target of section.pages) {
        await page.goto(target.href);
        const tabs = page.getByTestId("section-nav");
        // « Mon Gaulois » est un écran de jeu plein écran depuis le 21 novembre 2026 : ni rubrique ni en-tête du site, la barre
        // du jeu à leur place, avec son retour au site. Les autres pages de sa rubrique gardent son onglet (vérifié ici).
        if (target.href === "/village") {
          await expect(tabs).toHaveCount(0);
          await expect(page.getByTestId("jeu-retour")).toHaveAttribute("href", "/");
          continue;
        }
        if (section.pages.length === 1) {
          await expect(tabs).toHaveCount(0);
          continue;
        }
        await expect(tabs.locator("a")).toHaveCount(section.pages.length);
        await expect(tabs.getByRole("link", { name: target.label, exact: true })).toHaveAttribute("aria-current", "page");
      }
    }
  });
  test("une fiche de membre reste dans sa rubrique", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Menu testé sur desktop.");
    const member = members.members.find((m: { publicId: string | null }) => m.publicId);
    await page.goto(`/membres/${member.publicId}`);
    await expect(page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Membres", exact: true })).toHaveAttribute("aria-current", "true");
  });
  test("sur téléphone, les onglets tiennent sur une ligne et l'onglet ouvert y est visible", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "La ligne qui glisse est celle du téléphone.");
  for (const path of ["/utiles", "/records", "/classement", "/nouveautes", "/qg"]) {
    await page.goto(path);
    const ligne = page.getByTestId("section-nav");
    const boites = await ligne.locator("a").evaluateAll((liens) => liens.map((a) => a.getBoundingClientRect().top));
    // Une seule ligne : tous les onglets à la même hauteur.
    expect(new Set(boites.map(Math.round)).size, path).toBe(1);
    const nav = (await ligne.boundingBox())!;
    const ouvert = (await ligne.locator('a[aria-current="page"]').boundingBox())!;
    expect(ouvert.x, path).toBeGreaterThanOrEqual(nav.x - 1);
    expect(ouvert.x + ouvert.width, path).toBeLessThanOrEqual(nav.x + nav.width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), path).toBeLessThanOrEqual(0);
  }
});
test("passer d'un onglet à l'autre change de page sans repasser par le menu", async ({ page }) => {
    await page.goto("/classement");
    await page.getByTestId("section-nav").getByRole("link", { name: "Nos rivaux" }).click();
    await expect(page).toHaveURL(/rivaux/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nos rivaux");
  });
  test("le pied de page donne le plan complet", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("footer-plan").locator("a")).toHaveCount(SECTIONS.flatMap((s) => s.pages).length);
  });
});

test("les nombres n'utilisent que des espaces contenues dans nos polices", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Même texte sur mobile.");
  test.slow();
  // Outfit et Inter n'ont pas l'espace fine U+202F : le navigateur la prenait dans la police de l'appareil, et « 121 976 » se lisait « 121976 » en titre.
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await openFolds(page);
    const text = await page.evaluate(() => document.body.innerText);
    expect(text.includes("\u202f"), path).toBe(false);
  }
});

test("le site s'installe comme une application : un fichier d'installation et ses icônes", async ({ page }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toMatch(/\/manifest\.webmanifest$/);
  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ name: `[${clan.tag}] ${clan.name}`, short_name: clan.tag, display: "standalone", lang: "fr" });
  expect(manifest.icons).toHaveLength(2);
  for (const icon of manifest.icons) {
    const served = await page.request.get(icon.src);
    expect(served.status(), icon.src).toBe(200);
    expect(served.headers()["content-type"]).toContain("image/png");
  }
});

test("la page Confidentialité s'ouvre sur un sommaire qui mène à chaque grande partie, sous l'en-tête", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/confidentialite");
  const liens = page.getByTestId("page-jumps").getByRole("link");
  const titres = page.getByTestId("privacy").locator("h2");
  // Un lien par grande partie, dans l'ordre de la page, sous le titre exact de la partie, vers l'ancre de ce titre.
  const textes = (await titres.allTextContents()).map((t) => t.replace(/\s+/g, " ").trim());
  expect(textes.length).toBeGreaterThanOrEqual(6);
  await expect(liens).toHaveText(textes);
  for (let i = 0; i < textes.length; i++) await expect(titres.nth(i)).toHaveAttribute("id", ((await liens.nth(i).getAttribute("href")) ?? "").replace(/^#/, ""));
  // Un clic amène au titre, visible sous l'en-tête collant (scroll-margin-top).
  await liens.last().click();
  await expect(page).toHaveURL(/#effacer-ses-donnees$/);
  const cible = titres.last();
  await expect(cible).toBeInViewport();
  const basEntete = await page.locator("header.barre").evaluate((el) => el.getBoundingClientRect().bottom);
  expect((await cible.boundingBox())!.y).toBeGreaterThanOrEqual(basEntete);
});

test("signale les données périmées au visiteur", async ({ page }) => {
  await page.clock.setFixedTime(new Date(Date.now() + 10 * 86_400_000));
  await page.goto("/classement");
  // La page peut suivre deux jeux de données, le classement et le classé : chacun a son message. Celui-ci est celui du classement.
  await expect(page.getByTestId("data-status").first().getByText(/Données périmées : dernière mise à jour il y a \d+ jours/)).toBeVisible();
  // Un en-tête qui date plusieurs sources nomme chacune dans son message.
  await page.goto("/records");
  const status = page.getByTestId("data-status");
  const meta = loadMeta();
  for (const [name, state] of [["des parties", meta.sessions], ["des podiums", meta.memberResults], ["de la liste des membres", meta.members]] as const) {
    if (state.lastSuccessAt) await expect(status.getByText(new RegExp(`Données périmées : dernière mise à jour ${name} il y a \\d+ jours`))).toBeVisible();
  }
});

test("affiche une erreur si la liste des membres ne charge pas", async ({ page }) => {
  await page.route("**/data/members.json", (r) => r.abort());
  await page.goto("/liste");
  await expect(page.getByRole("alert")).toContainText("n'a pas pu être chargée");
  await page.unroute("**/data/members.json");
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByTestId("member-count")).toBeVisible();
});

// Le pied de page s'affichait, puis sautait d'un coup vers le bas à l'arrivée du contenu : la liste des membres, lue après
// la page, et la porte du QG et du compte, après la lecture de la session (relevé le 14 novembre 2026 : jusqu'à 0,53). La
// liste est maintenant dans la page construite, la place de la porte y est réservée. Le saut cumulé (« layout shift »), sans
// ceux qui suivent un geste, reste sous 0,05 : 0,1 est déjà mauvais. Le site d'essai sans serveur de connexion montre la
// porte fermée au QG et au compte : le test vaut alors pour elle, et pour la porte dès qu'un serveur est configuré.
for (const path of ["/liste", "/qg", "/compte"]) {
  test(`${path} ne saute pas à l'arrivée de son contenu`, async ({ page }, testInfo) => {
    const sizes = testInfo.project.name === "mobile" ? [{ width: 390, height: 844 }, { width: 360, height: 800 }] : [{ width: 1440, height: 900 }];
    // Ce qui doit être à l'écran avant la mesure : la liste entière lue (la recherche s'ouvre alors), ou la porte.
    const content =
      path === "/liste"
        ? page.locator("#member-search")
        : page.getByTestId(path === "/qg" ? "qg-door" : "signed-out").or(page.getByTestId("auth-not-open"));
    await page.addInitScript(() => {
      const w = window as unknown as { __saut: number };
      w.__saut = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!entry.hadRecentInput) w.__saut += entry.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.goto(path);
      await hydrated(page);
      if (path === "/liste") await expect(content).toBeEnabled();
      else await expect(content).toBeVisible();
      await page.waitForTimeout(800);
      const saut = await page.evaluate(() => (window as unknown as { __saut: number }).__saut);
      expect(saut, `${path} à ${size.width} px`).toBeLessThan(0.05);
    }
  });
}

// La liste des membres est dans la page construite : sans script, ses trente premiers (au plus de victoires) se lisent, avec
// les vrais comptes. Le tri, la recherche et la suite attendent le script : leurs commandes restent inactives.
test.describe("sans JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("la liste des membres montre déjà ses premiers", async ({ page }, testInfo) => {
    await page.goto("/liste");
    const shown = page.getByTestId(testInfo.project.name === "mobile" ? "member-card" : "member-row").filter({ visible: true });
    await expect(shown).toHaveCount(Math.min(30, members.members.length));
    await expect(page.getByTestId("member-count")).toContainText(fmtInt(members.members.length));
    type Row = { username: string | null; team: { wins: number } | null };
    const top = [...(members.members as Row[])].sort((a, b) => (b.team?.wins ?? -1) - (a.team?.wins ?? -1))[0];
    if (top) await expect(shown.first()).toContainText(top.username ?? "Membre anonyme");
    await expect(page.getByLabel("Rechercher par pseudo")).toBeDisabled();
  });
});

// Les pages de l'encadrement ont leurs propres couleurs, le thème rouge : leurs contrastes sont contrôlés aussi.
for (const path of [...PAGES, "/direction"]) {
  test(`accessibilité WCAG AA : ${path}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    // Le vrai lecteur du jeu, encadré dans « Revoir une partie », vient d'un autre site et montre l'interface d'OpenFront telle
    // quelle : le test contrôle la page du site et le cadre (son titre), pas le jeu, et ne dépend pas d'un site en ligne.
    await page.route(/^https:\/\/[a-z0-9-]+\.github\.io\/jeu\//, (r) => r.fulfill({ status: 200, contentType: "text/html", body: '<!doctype html><html lang="fr"><title>Replay du jeu</title><main></main></html>' }));
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await openFolds(page);
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ; ")}`)).toEqual([]);
  });
}

// 360 : une largeur courante de téléphone. 1024 : là où le décor de /rejoindre élargissait la page.
for (const width of [360, 375, 768, 1024, 1280, 1920]) {
  test(`aucun défilement horizontal à ${width} px`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Largeurs testées une seule fois.");
    await page.setViewportSize({ width, height: 900 });
    for (const path of [...PAGES, "/confidentialite", "/carte-monde/"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await openFolds(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} à ${width} px`).toBeLessThanOrEqual(0);
    }
  });
}

// L'AGPL et les conditions d'OpenFront, voir NOTICE.md : le code et la mention restent accessibles sur toutes les pages.
// La loi du 21 juin 2004 (article 1-1) : les mentions légales aussi.
test("chaque page donne le code source, la mention d'OpenFront et les mentions légales", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Même pied de page sur mobile.");
  for (const path of [...PAGES, "/confidentialite", "/compte", "/direction"]) {
    await page.goto(path);
    // La page Carte est un écran qui tient dans la fenêtre, sans bas de page : la ligne posée sur la carte donne les trois
    // (tests/e2e/carte.spec.ts le contrôle aussi).
    const footer = path === "/carte" ? page.getByTestId("map-credit") : page.locator("footer");
    await expect(footer.getByRole("link", { name: "Code source", exact: true }), path).toHaveAttribute("href", "https://github.com/les-gaulois/les-gaulois.github.io");
    await expect(footer, path).toContainText("© OpenFront and Contributors");
    await expect(footer.getByRole("link", { name: "Mentions légales", exact: true }), path).toHaveAttribute("href", "/mentions-legales");
  }
});

// Version anonyme choisie par le pilote (article 1-1, II) : l'éditeur n'est pas nommé, l'hébergeur l'est.
test("les mentions légales nomment l'hébergeur, sans identité de l'éditeur", async ({ page }) => {
  await page.goto("/");
  await page.locator("footer").getByRole("link", { name: "Mentions légales", exact: true }).click();
  await expect(page).toHaveURL(/\/mentions-legales\/?$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mentions légales");
  const legal = page.getByTestId("legal");
  await expect(legal).toContainText("édité à titre non professionnel par un particulier qui garde l'anonymat");
  for (const line of ["GitHub, Inc.", "88 Colin P. Kelly Jr. St.", "San Francisco, CA 94107, États-Unis"]) await expect(legal).toContainText(line);
  await expect(legal.getByRole("link", { name: "Discord du clan" })).toHaveAttribute("href", clan.links.discord);
  // Ces tests tournent sans serveur : Supabase n'héberge alors rien, et n'est pas cité.
  await expect(legal).not.toContainText("Supabase");
  // La page autonome de la carte du monde a son propre pied de page : le lien y est aussi.
  await page.goto("/carte-monde/");
  await page.locator("footer").getByRole("link", { name: "Mentions légales", exact: true }).click();
  await expect(page).toHaveURL(/\/mentions-legales\/?$/);
});

test("navigation au clavier : lien d'évitement et focus visible", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Clavier testé sur desktop.");
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Aller au contenu" });
  await expect(skip).toBeFocused();
  const outline = await skip.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).toBe("solid");
});
