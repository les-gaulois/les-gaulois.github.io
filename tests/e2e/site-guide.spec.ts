// Le guide du clan (`/debuter`) et la page Rejoindre.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator } from "@playwright/test";
import { fmtInt } from "../../src/lib/format";
import { GROWTH_REFERENCE_CAPACITY, gainVersusPeak } from "../../src/lib/growth";
import { chantier, orBateau, orTrain, partageAttaque } from "../../src/lib/guide-clan";
import { openFolds, hydrated } from "./outils-site";

test("le bloc de jeu en groupe mène au Discord", async ({ page }) => {
  await page.goto("/activite");
  const block = page.getByTestId("group-play");
  await expect(block.getByTestId("group-size").first()).toContainText("Seul sous le tag");
  await expect(block.getByRole("link", { name: "Trouver un groupe sur Discord" })).toHaveAttribute("href", "https://discord.gg/cjUc42T7Y2");
});

test("Rejoindre donne l'argument du jeu en groupe et renvoie vers son détail", async ({ page }) => {
  // Les deux bouts du tableau de Quand jouer : seul sous le tag, et le plus grand groupe.
  await page.goto("/activite");
  const sizes = page.getByTestId("group-play").getByTestId("group-size");
  const rateOf = async (size: Locator) => [await size.locator("span").first().innerText(), await size.locator("span").nth(1).innerText()];
  const expected = [await rateOf(sizes.first()), await rateOf(sizes.last())];

  await page.goto("/rejoindre");
  await expect(page.getByTestId("group-play")).toHaveCount(0);
  const block = page.getByTestId("join-group");
  await expect(block).toContainText("Un lien, pas une preuve");
  await expect(block.getByRole("link")).toHaveAttribute("href", /\/activite$/);
  // L'argument en grand, avant les étapes : deux chiffres clés, les mêmes que sur Quand jouer, pas son tableau.
  const rates = block.getByTestId("join-rate");
  await expect(rates).toHaveCount(2);
  for (const [i, [label, rate]] of expected.entries()) {
    await expect(rates.nth(i).locator(".kpi-label")).toHaveText(label!);
    await expect(rates.nth(i).locator(".kpi-value")).toHaveText(rate!);
    // La jauge a la longueur du taux écrit (sa largeur demandée : une animation d'entrée peut encore l'étirer).
    const share = await rates.nth(i).locator(".meter > i").evaluate((el: HTMLElement) => Number.parseFloat(el.style.getPropertyValue("--v")));
    expect(Math.abs(share - Number.parseFloat(rate!.replace(",", "."))), label).toBeLessThan(0.1);
  }
  expect(expected[0]![0]).toBe("Seul sous le tag");
  const [top, steps] = await Promise.all([block.boundingBox(), page.getByTestId("join-steps").boundingBox()]);
  expect(top!.y).toBeLessThan(steps!.y);
  await expect(page.getByTestId("join-guides").getByRole("link")).toHaveAttribute("href", /\/debuter$/);
});

// « Calculateur et outils » a été retiré le 12 novembre 2026, à la demande du pilote : ne pas le remettre sans sa demande.
test("le calculateur et les outils sont retirés, et plus rien n'y mène", async ({ page }) => {
  const gone = await page.goto("/outils");
  expect(gone?.status()).toBe(404);
  // Un ancien lien vers le calculateur ouvre les guides, sans renvoi vers la page disparue.
  const guides = await page.goto("/debuter#calculateur");
  expect(guides?.status()).toBe(200);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main h1")).toBeVisible();
  await expect(page).toHaveURL(/\/debuter\/?#calculateur$/);
  // Ni le menu, ni les onglets, ni le pied de page, ni un chapitre du guide, même replié.
  await expect(page.locator('a[href*="/outils"]')).toHaveCount(0);
});

// Le 12 novembre 2026, à la demande du pilote : il ne reste que le guide du clan, « interactif, très intuitif », un
// chapitre à la fois (docs/DESIGN.md, « Le guide du clan »).
test("le guide du clan avance chapitre par chapitre, et l'adresse garde le chapitre ouvert", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile";
  const ouvert = page.getByTestId("guide-chapter").filter({ visible: true });
  const titre = ouvert.getByRole("heading", { level: 2 });
  await page.goto("/debuter");
  await page.waitForLoadState("networkidle");
  await expect(ouvert).toHaveCount(1);
  await expect(titre).toHaveText("Les bases");
  // Le premier chapitre n'a pas de « Précédent ».
  await expect(ouvert.getByTestId("guide-avant")).toHaveCount(0);

  // « Suivant » ouvre le chapitre d'après, l'écrit dans l'adresse, y amène la page et le focus.
  await ouvert.getByTestId("guide-apres").click();
  await expect(page).toHaveURL(/#chapitre-02-croissance$/);
  await expect(ouvert).toHaveCount(1);
  await expect(titre).toHaveText("Croissance de la population");
  await expect(titre).toBeFocused();
  await expect(titre).toBeInViewport();

  // Le bouton Retour du navigateur revient au chapitre d'avant.
  await page.goBack();
  await expect(titre).toHaveText("Les bases");

  // Le sommaire ouvre un chapitre et le marque. Sur téléphone, il attend sous son bouton, qui dit le chapitre ouvert.
  const plan = page.getByRole("navigation", { name: "Chapitres du guide du clan" });
  const bouton = plan.getByRole("button", { name: /Chapitres/ });
  if (mobile) {
    await expect(plan.getByRole("link", { name: /Trains/ })).toBeHidden();
    await bouton.click();
    await expect(bouton).toHaveAttribute("aria-expanded", "true");
  } else {
    await expect(bouton).toBeHidden();
  }
  await plan.getByRole("link", { name: /Trains/ }).click();
  await expect(titre).toHaveText("Trains");
  await expect(plan.locator('[aria-current="step"]')).toHaveCount(1);
  if (mobile) {
    await expect(bouton).toHaveAttribute("aria-expanded", "false");
    await expect(bouton).toContainText("08 · Trains");
  } else {
    await expect(plan.locator('[aria-current="step"]')).toContainText("Trains");
  }

  // Une adresse qui nomme un chapitre l'ouvre d'emblée ; le dernier n'a pas de « Suivant ».
  await page.goto("/debuter#chapitre-11-memo-economie");
  await expect(titre).toHaveText("Aide-mémoire économie");
  await expect(ouvert.getByTestId("guide-apres")).toHaveCount(0);
  await expect(ouvert.getByTestId("guide-avant")).toHaveAttribute("href", "#chapitre-10-memo-combat");
  // Une autre ancre ne ferme rien : le chapitre ouvert reste, le même.
  await page.goto("/debuter#contenu");
  await expect(page).toHaveURL(/#contenu$/);
  await expect(ouvert).toHaveCount(1);
  await expect(titre).toHaveText("Aide-mémoire économie");
});

// Le guide est en console depuis le 12 novembre 2026 (« comme la Carte »). Sur la Carte, le pilote a trouvé « trop de verts
// dans les textes » : le vert de terminal n'est que la voix de la machine. Trois lignes ont du vert : l'invite de la page et
// la ligne de commande de chaque chapitre (leur machine, « gal@guide »), et le dossier du sommaire ; hors d'elles, seuls
// des signes (« > ») et les jalons sont verts, les icônes étant en pastilles de couleur depuis le 14 novembre 2026. Aucune phrase, aucun chiffre, aucun libellé ne l'est, dans aucun chapitre : ni le texte
// de la page, ni un mot écrit par la feuille de style (l'étiquette « essai »), ni un vert voisin du jeton.
test("dans le guide du clan, le vert ne sert qu'aux lignes de commande, jamais aux textes ni aux chiffres", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile";
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/debuter");
  await page.waitForLoadState("networkidle");
  await hydrated(page);
  const vert = await page.locator("[data-guide]").evaluate((guide) => {
    const sonde = document.createElement("i");
    sonde.style.color = "var(--console-vert)";
    guide.append(sonde);
    const couleur = getComputedStyle(sonde).color;
    sonde.remove();
    return couleur;
  });
  // Une vraie couleur, et pas celle du texte : sans quoi le contrôle ne prouverait rien.
  expect(vert).not.toBe(await page.locator("[data-guide]").evaluate((guide) => getComputedStyle(guide).color));
  const textesVerts = () =>
    page.evaluate((vert) => {
      // Vert : le jeton, ou toute couleur où le vert domine le rouge et le bleu de plus de 40. Le vert des réussites du
      // site (--color-ok, #A6E3B4) domine de 47 ; le bleu clair, les gris, le jaune et le blanc restent loin dessous.
      const estVert = (couleur: string) => {
        if (couleur === vert) return true;
        const rvb = /^rgba?\((\d+), (\d+), (\d+)/.exec(couleur);
        return rvb !== null && Number(rvb[2]) - Math.max(Number(rvb[1]), Number(rvb[3])) > 40;
      };
      const verts: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("main *")) {
        if (el.closest(".console-invite, .guide-commande, .guide-plan-racine, .sr-only") || el.getClientRects().length === 0) continue;
        const nom = `${el.tagName.toLowerCase()}.${el.getAttribute("class") ?? ""}`;
        const texte = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? "").join("").trim();
        if (texte && estVert(getComputedStyle(el).color)) verts.push(`${nom} : ${texte.slice(0, 40)}`);
        // Ce que la feuille de style écrit : un signe peut être vert (« > »), un mot ou un chiffre non.
        for (const pseudo of ["::before", "::after"]) {
          const style = getComputedStyle(el, pseudo);
          if (style.content !== "none" && style.content !== "normal" && /[\p{L}\p{N}]/u.test(style.content) && estVert(style.color)) verts.push(`${nom}${pseudo} : ${style.content}`);
        }
      }
      return verts;
    }, vert);
  // Sur téléphone, le sommaire s'ouvre d'abord : ses lignes passent le contrôle avec le premier chapitre.
  if (mobile) await page.getByRole("navigation", { name: "Chapitres du guide du clan" }).getByRole("button", { name: /Chapitres/ }).click();
  expect(await textesVerts(), "premier chapitre").toEqual([]);
  const ancres = await page.getByTestId("guide-chapter").evaluateAll((chapitres) => chapitres.map((c) => c.id));
  for (const ancre of ancres) {
    await page.goto(`/debuter#${ancre}`);
    await expect(page.locator(`#${ancre}`)).toBeVisible();
    await openFolds(page);
    expect(await textesVerts(), ancre).toEqual([]);
  }
  // La voix de la machine, elle, est verte : la machine de la ligne de commande du chapitre ouvert et le dossier du
  // sommaire. Depuis le 14 novembre 2026, le reste de la ligne est gris, comme l'invite du haut (« deux design »).
  const couleurDe = (selecteur: string, pseudo?: string) => page.locator(selecteur).first().evaluate((el, p) => getComputedStyle(el, p).color, pseudo);
  expect(await couleurDe(".guide-ouvert .guide-commande .console-hote")).toBe(vert);
  expect(await couleurDe(".guide-ouvert .guide-commande")).not.toBe(vert);
  if (mobile) await page.getByRole("navigation", { name: "Chapitres du guide du clan" }).getByRole("button", { name: /Chapitres/ }).click();
  expect(await couleurDe(".guide-plan-racine")).toBe(vert);
  await expect(page.locator(".guide-ouvert .guide-commande")).toHaveText(/^gal@guide:~\$ \.\/memo-economie$/);
  // Deux témoins pour ce que la feuille de style écrit : le « > » de l'essentiel est vert, c'est un signe ; l'étiquette
  // « essai » est un mot, que le contrôle lit bien, et elle n'est pas verte.
  await page.goto("/debuter#chapitre-01-bases");
  await expect(page.locator("#chapitre-01-bases")).toBeVisible();
  expect(await couleurDe(".guide-ouvert .guide-essentiel > li", "::before")).toBe(vert);
  const etiquette = await page.locator(".guide-ouvert .guide-outil[data-etiquette]").first().evaluate((el) => {
    const style = getComputedStyle(el, "::before");
    return { mot: style.content, couleur: style.color };
  });
  expect(etiquette.mot).toContain("essai");
  expect(etiquette.couleur).not.toBe(vert);
});

// « À l'impression, le guide entier » : les onze chapitres, « Détails et formules » dépliés, sans le sommaire ni les
// boutons « Précédent » et « Suivant », qui ne mènent nulle part sur le papier.
test("à l'impression, le guide du clan donne tous ses chapitres, détails dépliés", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Le papier n'a qu'une largeur.");
  await page.goto("/debuter");
  await page.waitForLoadState("networkidle");
  // À l'écran, un seul chapitre et des détails repliés : sans quoi la suite ne prouverait rien.
  await expect(page.getByTestId("guide-chapter").filter({ visible: true })).toHaveCount(1);
  const visibles = (selecteur: string) => page.locator(selecteur).evaluateAll((els) => els.filter((el) => el.checkVisibility()).length);
  const details = await page.locator(".guide-details").count();
  expect(details).toBeGreaterThan(0);
  expect(await visibles(".guide-ouvert .guide-details > .guide-body")).toBe(0);
  // Un détail ouvert à l'écran avant d'imprimer : sur le papier, il ne garde pas son « − », ni les autres leur « + ».
  await page.locator(".guide-ouvert .guide-details > summary").click();
  await expect(page.locator(".guide-ouvert .guide-details")).toHaveAttribute("open", "");
  const signes = () => page.locator(".guide-details > summary").evaluateAll((els) => [...new Set(els.map((el) => getComputedStyle(el, "::after").content))]);
  // À l'écran, deux signes : celui des détails repliés et celui du détail ouvert.
  const aLEcran = await signes();
  expect(aLEcran).toHaveLength(2);
  expect(aLEcran).not.toContain("none");
  await page.emulateMedia({ media: "print" });
  expect(await visibles("[data-guide-chapitre]")).toBe(await page.getByTestId("guide-chapter").count());
  expect(await visibles(".guide-details > .guide-body")).toBe(details);
  expect(await visibles(".guide-pas")).toBe(0);
  expect(await visibles(".guide-plan")).toBe(0);
  expect(await signes()).toEqual(["none"]);
});

// Le script du guide ajoute le sommaire du téléphone, le focus et le défilement ; les chapitres, eux, ne dépendent que
// du script écrit dans la page.
test("si le script du guide ne se charge pas, ses liens ouvrent encore les chapitres", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Testé une seule fois.");
  await page.route("**/_astro/*script*", (route) => route.abort());
  const ouvert = page.getByTestId("guide-chapter").filter({ visible: true });
  const titre = ouvert.getByRole("heading", { level: 2 });
  await page.goto("/debuter");
  await expect(ouvert).toHaveCount(1);
  await expect(titre).toHaveText("Les bases");
  await ouvert.getByTestId("guide-apres").click();
  await expect(page).toHaveURL(/#chapitre-02-croissance$/);
  await expect(ouvert).toHaveCount(1);
  await expect(titre).toHaveText("Croissance de la population");
  await page.getByRole("navigation", { name: "Chapitres du guide du clan" }).getByRole("link", { name: /Trahison/ }).click();
  await expect(titre).toHaveText("Trahison");
  await page.goBack();
  await expect(titre).toHaveText("Croissance de la population");
});

test("les essais du guide du clan donnent les chiffres de ses calculs", async ({ page }) => {
  const ouvrir = async (ancre: string) => {
    await page.goto(`/debuter#${ancre}`);
    await expect(page.locator(`#${ancre}`)).toBeVisible();
  };
  await page.goto("/debuter");
  await hydrated(page);

  // Chapitre 1 : l'exemple du guide, déjà dans la page, puis un autre nombre. La règle est écrite en clair : une troupe
  // sur cinq, sans signe de division (le pilote ne comprenait pas « ÷ 5 » et « ÷ 20 », le 12 novembre 2026).
  const attaque = page.getByTestId("essai-attaque");
  await expect(page.getByTestId("guide-bloc-attaque")).toContainText("1 troupe sur 5 part, le reste demeure en défense");
  await expect(page.getByTestId("guide-bloc-attaque")).not.toContainText("÷");
  await expect(attaque.getByTestId("essai-attaque-part")).toHaveText(fmtInt(10_000));
  await expect(attaque.getByTestId("essai-attaque-reste")).toHaveText(fmtInt(40_000));
  await expect(attaque.getByTestId("essai-attaque-pions").locator("svg")).toHaveCount(5);
  await attaque.getByLabel("Vos troupes").fill("200000");
  await expect(attaque.getByTestId("essai-attaque-part")).toHaveText(fmtInt(partageAttaque(200_000).attaque));
  await expect(attaque.getByTestId("essai-attaque-reste")).toHaveText(fmtInt(partageAttaque(200_000).defense));

  // Chapitre 2 : la courbe s'ouvre sur son sommet ; à 80 %, le gain annoncé par le chapitre.
  await ouvrir("chapitre-02-croissance");
  const gain = page.getByTestId("essai-croissance-gain");
  await expect(gain).toHaveText(`${fmtInt(100)} %`);
  await page.getByLabel("Votre réserve").fill("80");
  await expect(gain).toHaveText(`${fmtInt(gainVersusPeak(80, GROWTH_REFERENCE_CAPACITY))} %`);
  await expect(gain).toHaveText("55 %");

  // Chapitre 5 : six questions, chacune avec le lien du chapitre qui l'explique ; le lien ouvre ce chapitre.
  await ouvrir("chapitre-05-reflexes");
  const questions = page.getByTestId("guide-bloc-reflexes").getByRole("listitem");
  await expect(questions).toHaveCount(6);
  await expect(page.getByTestId("guide-bloc-reflexes").getByRole("link")).toHaveCount(6);
  await questions.filter({ hasText: "Y a-t-il un poste ?" }).getByRole("link", { name: "Chapitre 4 : Poste et neutre" }).click();
  await expect(page).toHaveURL(/#chapitre-04-poste-neutre$/);
  await expect(page.getByTestId("guide-chapter").filter({ visible: true }).getByRole("heading", { level: 2 })).toHaveText("Poste de défense et terrain neutre");

  // Chapitre 6 : un Port fait monter le prix de l'Usine, pas celui de la Ville.
  await ouvrir("chapitre-06-economie");
  const batiments = page.getByTestId("essai-batiments");
  const prix = (id: string) => batiments.getByTestId(`essai-batiments-${id}`);
  for (const id of ["ville", "port", "usine"]) await expect(prix(id)).toHaveText(fmtInt(125_000));
  await batiments.getByRole("button", { name: "Construire : Port" }).click();
  const apresPort = chantier(["port"]);
  await expect(prix("usine")).toHaveText(fmtInt(apresPort.prochain.usine));
  await expect(prix("usine")).toHaveText(fmtInt(250_000));
  await expect(prix("ville")).toHaveText(fmtInt(apresPort.prochain.ville));
  await expect(batiments.getByTestId("essai-batiments-total")).toContainText(fmtInt(apresPort.depense));
  // « Remettre à zéro » garde le focus après le clic : inactif, il n'est pas retiré du clavier.
  const zero = batiments.getByRole("button", { name: "Remettre à zéro" });
  await expect(zero).toHaveAttribute("aria-disabled", "false");
  await zero.click();
  await expect(prix("port")).toHaveText(fmtInt(125_000));
  await expect(prix("usine")).toHaveText(fmtInt(125_000));
  await expect(zero).toHaveAttribute("aria-disabled", "true");
  await expect(zero).toBeFocused();
  await expect(batiments.getByRole("status")).toContainText("Chantier remis à zéro");

  // Chapitre 7 : un repère du chapitre.
  await ouvrir("chapitre-07-bateaux");
  const bateau = page.getByTestId("essai-bateau-or");
  await expect(bateau).toHaveText(fmtInt(52_500));
  await page.getByLabel("Distance").fill("500");
  await expect(bateau).toHaveText(fmtInt(Math.round(orBateau(500))));
  await expect(bateau).toHaveText(fmtInt(99_815));

  // Chapitre 8 : l'exemple du chapitre chez un allié, puis chez soi.
  await ouvrir("chapitre-08-trains");
  const train = page.getByTestId("essai-train-or");
  await expect(train).toHaveText(fmtInt(30_000));
  await page.getByLabel("Arrêt n°").fill("12");
  await expect(train).toHaveText(fmtInt(orTrain(35_000, 12)));
  await page.getByTestId("essai-train").getByRole("button", { name: "Vous-même" }).click();
  await expect(train).toHaveText(fmtInt(orTrain(10_000, 12)));
  await expect(page.getByTestId("essai-train-barres").locator(".guide-barre-arret")).toHaveCount(20);
});

test("sans JavaScript, le guide du clan donne tous ses chapitres à la suite", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Même page sur mobile.");
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: testInfo.project.use.baseURL });
  const page = await context.newPage();
  await page.goto("/debuter");
  const chapitres = page.getByTestId("guide-chapter");
  await expect(chapitres).toHaveCount(11);
  await expect(chapitres.filter({ visible: true })).toHaveCount(11);
  // Le sommaire est ouvert, sans bouton, et chaque essai montre déjà son état de départ.
  const plan = page.getByRole("navigation", { name: "Chapitres du guide du clan" });
  await expect(plan.getByRole("link")).toHaveCount(11);
  await expect(plan.getByRole("link", { name: /Trahison/ })).toBeVisible();
  await expect(plan.getByRole("button")).toHaveCount(0);
  await expect(page.getByTestId("essai-attaque-part")).toHaveText(fmtInt(10_000));
  await expect(page.getByTestId("essai-bateau-or")).toHaveText(fmtInt(52_500));
  await expect(page.getByTestId("essai-train-or")).toHaveText(fmtInt(30_000));
  await context.close();
});

// Les tests d'accessibilité et de largeur n'ouvrent que le premier chapitre : chacun des autres passe ici.
test("chaque chapitre du guide du clan tient dans un téléphone et passe les contrôles d'accessibilité", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Les deux largeurs sont testées ici.");
  test.slow();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/debuter");
  await page.waitForLoadState("networkidle");
  const ancres = await page.getByTestId("guide-chapter").evaluateAll((chapitres) => chapitres.map((c) => c.id));
  expect(ancres).toHaveLength(11);
  for (const ancre of ancres) {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/debuter#${ancre}`);
    await expect(page.locator(`#${ancre}`)).toBeVisible();
    await openFolds(page);
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(violations.map((v) => `${ancre} : ${v.id}: ${v.nodes.map((n) => n.target).join(" ; ")}`)).toEqual([]);
    for (const width of [360, 768, 1024]) {
      await page.setViewportSize({ width, height: 800 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${ancre} à ${width} px`).toBeLessThanOrEqual(0);
    }
  }
});
