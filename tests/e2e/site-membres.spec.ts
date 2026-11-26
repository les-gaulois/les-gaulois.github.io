// La page Membres, la liste, les fiches des membres, leurs images et les paliers.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { clan } from "../../config/clan";
import { gauloisDuSite, portraitDuGaulois } from "../../src/lib/gaulois-site";
import { loadMemberGames, loadMemberResults, loadMembers, loadMeta, loadCompagnonsDeFlamme, loadRecordsPersonnels, loadSeriesEnCours, loadSessions } from "../../src/lib/data";
import { datesDeLaSerie, datesDuRecord, flammeAllumee, phraseDesCompagnons, serieEnMots } from "../../src/lib/serie-en-cours";
import { fmtCount, fmtDate, fmtDateTime } from "../../src/lib/format";
import { playerPodiums, podiumDates } from "../../src/lib/podiums";
import { gamesOf, recentGamesTitle } from "../../src/lib/members";
import { nextTier, tierOf, tierRows } from "../../src/lib/paliers";
import { SITE_URL, ficheImageUrl, ficheUrl, parseCommandes, parseFiches } from "../../supabase/functions/code-discord/index";
import { members, digits, hydrated, linkAt } from "./outils-site";

test("la page Membres présente l'encadrement, et chacun mène à sa fiche", async ({ page }) => {
  await page.goto("/membres");
  const block = page.getByTestId("command");
  const command = members.members.filter((m: { role: string }) => m.role !== "member");
  await expect(block.getByRole("heading", { name: `L'encadrement · ${command.length}` })).toBeVisible();
  await expect(block.getByTestId("command-member")).toHaveCount(command.length);
  for (const m of command) {
    if (m.username) await expect(block.getByRole("link", { name: m.username, exact: true })).toHaveAttribute("href", new RegExp(`/membres/${m.publicId}$`));
  }
});

// La commande /fiche de Discord lit ce fichier : les fiches des pages des membres, rien de plus, et jamais un anonyme.
test("les fiches de la commande /fiche sont celles des pages des membres", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Un fichier, lu une fois.");
  const res = await request.get("/fiches.json");
  expect(res.ok()).toBe(true);
  const list = parseFiches(await res.json());
  expect(list?.listedAt).toBe(members.fetchedAt);
  const named = members.members.filter((m: { username: string | null; publicId: string | null }) => m.username && m.publicId);
  expect(list?.fiches.map((f) => f.id).sort()).toEqual(named.map((m: { publicId: string }) => m.publicId).sort());
  const shown = list?.fiches.find((f) => f.alt !== null);
  if (shown) {
    // Chaque image a la version de son dessin : sans elle, /moi et /fiche montreraient l'image que Discord a gardée.
    expect(shown.v).toMatch(/^[0-9a-f]{12}$/);
    expect((await request.get(ficheImageUrl(shown.id, list?.listedAt ?? "", shown.v).replace(SITE_URL, ""))).ok()).toBe(true);
    expect((await request.get(ficheUrl(shown.id).replace(SITE_URL, ""))).ok()).toBe(true);
  }
});

// Les commandes du robot lisent cet index : une image par commande, par chapitre du guide et par clan de la liste officielle.
test("les images des commandes du robot sont publiées, chacune à son adresse", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Des fichiers, lus une fois.");
  const res = await request.get("/commandes.json");
  expect(res.ok()).toBe(true);
  const index = parseCommandes(await res.json());
  expect(index).not.toBeNull();
  const listed: { clanTag: string }[] = JSON.parse(readFileSync("data/leaderboard.json", "utf8")).clans;
  expect(index?.rivaux.map((r) => r.tag)).toEqual(listed.some((c) => c.clanTag === clan.tag) ? listed.map((c) => c.clanTag).filter((t) => t !== clan.tag) : []);
  // Un chapitre par fichier du guide, sauf les aide-mémoire, qui ne sont qu'un tableau.
  const chapters = readdirSync("content/guide-clan").filter((f) => f.endsWith(".md") && !/^ouvert: true$/m.test(readFileSync(`content/guide-clan/${f}`, "utf8")));
  expect(index?.guide.map((g) => `${g.id}.md`)).toEqual(chapters);
  // Les données du dépôt donnent le classement, les records et la carte : les trois images doivent exister.
  expect(index?.clan).not.toBeNull();
  expect(index?.records).not.toBeNull();
  expect(index?.carte).not.toBeNull();
  // Le panneau des rôles (/roles) ne lit aucune donnée : son image est toujours là.
  expect(index?.roles?.image).toMatch(/^\/commandes\/roles\.png\?v=[0-9a-f]{12}$/);
  // Les émojis du robot, en PNG de 128 pixels, et les vignettes de ses rôles et de ses tickets : tous publiés.
  expect(index?.emojis.length).toBeGreaterThan(0);
  expect(index?.vignettes.length).toBeGreaterThan(0);
  for (const icon of [...(index?.emojis ?? []), ...(index?.vignettes ?? [])]) {
    const png = await request.get(icon.image);
    expect(png.ok(), icon.image).toBe(true);
    expect(png.headers()["content-type"]).toContain("image/png");
    if (icon.image.startsWith("/commandes/emojis/")) expect((await png.body()).readUInt32BE(16), icon.image).toBe(128);
  }
  const height = (png: Buffer) => png.readUInt32BE(20);
  for (const entry of [index?.clan, index?.records, index?.carte, ...(index?.guide ?? []), index?.rivaux[0], index?.roles]) {
    if (!entry) continue;
    const image = await request.get(entry.image);
    expect(image.ok(), entry.image).toBe(true);
    expect(image.headers()["content-type"]).toContain("image/png");
    // Sous l'en-tête et au-dessus du bas, au moins une case : une image de chapitre n'est jamais vide (vide, elle fait 278 px).
    if (entry.image.startsWith("/commandes/guide-")) expect(height(await image.body()), entry.image).toBeGreaterThan(300);
  }
});

// Le 12 novembre 2026, à la demande du pilote : la liste a son onglet, entre la page Membres et le QG, et n'est qu'à un endroit.
// « Mon Gaulois » (13 novembre 2026, à l'adresse /village) se range entre la liste et le QG ; « La boutique » est un de ses
// onglets depuis le 15 novembre 2026, plus une entrée du menu.
test("la liste des membres a son onglet, entre la page Membres et le QG", async ({ page }) => {
  await page.goto("/membres");
  const tabs = page.getByTestId("section-nav").locator("a");
  await expect(tabs).toHaveText(["Membres", "La liste", "Mon Gaulois", "Le QG"]);
  await expect(page.locator('astro-island[component-url*="MembersTable"]')).toHaveCount(0);
  await tabs.filter({ hasText: "La liste" }).click();
  await expect(page).toHaveURL(/\/liste\/?$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Liste des membres");
  await expect(page.getByTestId("data-status").first()).toContainText("Dernière mise à jour");
  await expect(page.locator('astro-island[component-url*="MembersTable"]')).toHaveCount(1);
  // Un ancien lien vers la liste, en bas de la page Membres, mène à son onglet.
  await page.goto("/membres#liste");
  await expect(page).toHaveURL(/\/liste\/?$/);
});

test("les pseudos de la page Membres se touchent du doigt", async ({ page }, testInfo) => {
  await page.goto("/membres");
  await hydrated(page);
  // Les paliers : chaque pseudo fait au moins 24 pixels de haut, le minimum de WCAG 2.2.
  const tierLink = page.getByTestId("win-tier").locator("a").first();
  if ((await tierLink.count()) > 0) {
    expect((await tierLink.boundingBox())!.height).toBeGreaterThanOrEqual(24);
    // Plus haut, il garde l'allure des pseudos du site : blanc, un trait pâle qui dit le lien (18 novembre 2026), jaune au survol.
    expect(await tierLink.evaluate((a) => getComputedStyle(a).textDecorationLine)).toBe("underline");
    await tierLink.hover();
    await expect(tierLink).toHaveCSS("color", "rgb(255, 200, 87)");
    await expect(tierLink).toHaveCSS("text-decoration-line", "underline");
  }
  // L'encadrement : toute la ligne mène à la fiche, jusqu'au bord opposé au pseudo.
  const staff = page.getByTestId("command-member").filter({ has: page.locator("a") }).first();
  if ((await staff.count()) > 0) {
    await staff.scrollIntoViewIfNeeded();
    const box = (await staff.boundingBox())!;
    expect(await linkAt(page, box.x + box.width - 4, box.y + box.height - 4)).toMatch(/^\/membres\/./);
  }
  if (testInfo.project.name !== "mobile") return;
  // Sur téléphone, dans la liste des membres, toute la carte d'un membre avec pseudo mène à sa fiche, pas seulement ses 20 pixels de pseudo.
  await page.goto("/liste");
  await hydrated(page);
  const card = page.getByTestId("member-card").filter({ has: page.locator("a") }).first();
  await card.scrollIntoViewIfNeeded();
  const box = (await card.boundingBox())!;
  expect(await linkAt(page, box.x + box.width - 8, box.y + box.height - 8)).toBe(await card.locator("a").getAttribute("href"));
});

test("un pseudo qui mène à une fiche a la même allure sur toutes les pages", async ({ page }) => {
  // Remarque reçue le 12 novembre 2026 : un pseudo avait trois allures selon la page (bleu souligné, blanc souligné, blanc
  // en gras). Tous portent la classe `pseudo` : de la couleur de l'écriture (marine sur la page, blancs dans une scène
  // colorée), ambrés et soulignés au survol.
  let seen = 0;
  for (const path of ["/", "/gazette", "/records", "/membres", "/liste"]) {
    await page.goto(path);
    await hydrated(page);
    if (path === "/liste") await expect(page.locator("main a.pseudo").first()).toBeAttached();
    const links = await page.locator("main").evaluate((main) =>
      [...main.querySelectorAll<HTMLAnchorElement>("a[href]")]
        .filter((a) => /\/membres\/[^/#?]+/.test(a.getAttribute("href") ?? ""))
        .map((a) => ({
          href: a.getAttribute("href"),
          pseudo: a.classList.contains("pseudo"),
          color: getComputedStyle(a).color,
          trait: getComputedStyle(a).textDecorationLine,
          // Dans une scène colorée (îlot sombre), l'écriture est blanche ; sur la page, marine. De même sur la ligne d'un
          // membre qui porte sa bannière dans la liste (16 novembre 2026) : blanche et cernée, sur l'image.
          ilot: a.closest(".stage-blue, .stage-indigo, .stage-wine, .card-accent, .ligne-banniere") !== null,
        })),
    );
    for (const link of links) {
      expect(link.pseudo, `${path} : ${link.href}`).toBe(true);
      // Un trait pâle dit partout que le pseudo mène à une fiche (revue du 18 novembre 2026) : pas seulement dans une phrase.
      expect(link.trait, `${path} : ${link.href}`).toBe("underline");
      // La couleur de l'écriture (--ecriture), là où il se trouve : thème clair du 14 novembre 2026.
      expect(link.color, `${path} : ${link.href}`).toBe(link.ilot ? "rgb(255, 255, 255)" : "rgb(10, 18, 48)");
    }
    seen += links.length;
    // Au milieu d'une phrase, un pseudo garde un trait pâle : sa couleur seule ne le distinguerait pas du texte (WCAG 1.4.1).
    const inSentence = await page.locator("main a.pseudo-phrase").evaluateAll((list) => list.map((a) => getComputedStyle(a).textDecorationLine));
    for (const line of inSentence) expect(line, path).toBe("underline");
  }
  expect(seen).toBeGreaterThan(0);
});

// Le 10 novembre 2026, à la demande du pilote : le périmètre des parties passe dans les précisions repliées, qui restent dans la page.
test("la période et les réserves restent visibles, le périmètre se lit dans les précisions repliées", async ({ page }) => {
  await page.goto("/liste");
  const scope = page.getByTestId("members-scope");
  await expect(scope).toContainText("sans le classé");
  await expect(scope).toBeHidden();
  await page.locator("details", { has: scope }).locator("summary").click();
  await expect(scope).toBeVisible();
  await page.goto("/rivaux");
  await expect(page.getByTestId("compare-rate-note")).toBeVisible();
  await page.goto("/records");
  if (playerPodiums(loadMemberResults(), loadSessions(), loadMembers(), loadMeta().sessions.coveredUntil).since !== null) await expect(page.getByTestId("podiums-period")).toBeVisible();
  await page.goto("/parties");
  await expect(page.getByTestId("journal-link-note")).toBeVisible();
  await expect(page.getByTestId("journal-link-note")).toContainText("Rejoindre un salon privé");
  await expect(page.getByTestId("journal-clans-note")).toContainText("L'API ne donne pas l'équipe des perdants");
});

test("une fiche de membre se partage : un bouton copie son lien, et l'aperçu du lien montre sa fiche", async ({ page, context }) => {
  const named = members.members.find((m: { username: string | null; team: unknown; publicId: string | null }) => m.username && m.team && m.publicId);
  await page.goto(`/membres/${named.publicId}`);
  // L'image d'aperçu, dessinée au build, est bien servie et décrite.
  // L'adresse est absolue, sur le domaine du site : on ne garde que le chemin pour l'interroger ici.
  const og = new URL((await page.locator('meta[property="og:image"]').getAttribute("content"))!);
  const image = og.pathname;
  expect(image).toBe(`/generated/fiches/${named.publicId}.png`);
  // Sa version suit son dessin : quand l'image change, Discord ne garde pas l'ancienne.
  expect(og.search).toMatch(/^\?v=[0-9a-f]{12}$/);
  const served = await page.request.get(image);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toContain("image/png");
  const alt = await page.locator('meta[property="og:image:alt"]').getAttribute("content");
  expect(alt?.startsWith(`${named.username}, membre de [${clan.tag}]`), alt ?? "").toBe(true);
  // Le bouton copie l'adresse de la fiche.
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByTestId("copy-link").click();
  await expect(page.getByTestId("copy-status")).toContainText("Lien copié");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
});

// La flamme de série (15 novembre 2026) : à partir de 5 victoires d'affilée sous le tag, un bloc dans l'en-tête de la fiche,
// avant le niveau ; sous 5, ou sans données, rien. Sans liste des parties des membres (.cache/member-games/), aucune flamme.
test("la fiche montre la flamme de série à partir de 5 victoires d'affilée, et rien en dessous", async ({ page }) => {
  const series = loadSeriesEnCours();
  const nommes = (members.members as { username: string | null; team: unknown; publicId: string | null }[]).filter((m) => m.username && m.team && m.publicId);
  const enFeu = nommes.find((m) => flammeAllumee(series.get(m.publicId!) ?? null));
  const sansFeu = nommes.find((m) => !flammeAllumee(series.get(m.publicId!) ?? null));
  if (sansFeu) {
    await page.goto(`/membres/${sansFeu.publicId}`);
    await expect(page.getByTestId("member-streak")).toHaveCount(0);
  }
  if (!enFeu) return;
  const serie = series.get(enFeu.publicId!)!;
  await page.goto(`/membres/${enFeu.publicId}`);
  const bloc = page.getByTestId("member-streak");
  await expect(bloc).toBeVisible();
  await expect(bloc).toContainText(serieEnMots(serie).replace(/^a/, "A"));
  await expect(bloc).toContainText(`Victoires ${datesDeLaSerie(serie)}, sans défaite sous le tag depuis, au dernier relevé du ${fmtDateTime(serie.releve)}`);
  // La flamme est décorative, en cases entières de 4 px ; le nombre est écrit à côté.
  const flamme = bloc.getByTestId("flamme-serie");
  await expect(flamme).toHaveAttribute("aria-hidden", "true");
  // Au centième de pixel près : le navigateur peut rendre 59,99997 pour 60.
  expect(await flamme.evaluate((svg) => [svg.getBoundingClientRect().width, svg.getBoundingClientRect().height].map((v) => Math.round(v * 100) / 100))).toEqual([44, 60]);
  // Le bloc vient avant celui du niveau, quand il y en a un.
  const niveau = page.getByTestId("member-level");
  if ((await niveau.count()) > 0) {
    const [haut, bas] = await Promise.all([bloc.boundingBox(), niveau.boundingBox()]);
    expect(haut!.y).toBeLessThan(bas!.y);
  }
  // L'image de la fiche le dit aussi au lecteur d'écran.
  const alt = await page.locator('meta[property="og:image:alt"]').getAttribute("content");
  expect(alt).toContain(`Série en cours : ${serieEnMots(serie)} sous le tag, ${datesDeLaSerie(serie)}, sans défaite depuis.`);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).include("[data-testid=member-streak]").analyze();
  expect(axe.violations).toEqual([]);
});

// Le record personnel (15 novembre 2026) : dans la scène des parties sous le tag, sa plus longue série, la même qu'aux podiums
// de Records ; la flamme passe à l'or quand la série en cours bat une ancienne flamme, et « son record » le dit.
test("la fiche montre la meilleure série du membre, et la flamme d'or d'un record battu", async ({ page }) => {
  const records = loadRecordsPersonnels();
  const nommes = (members.members as { username: string | null; team: unknown; publicId: string | null }[]).filter((m) => m.username && m.team && m.publicId);
  const avec = nommes.find((m) => records.has(m.publicId!));
  const sans = nommes.find((m) => !records.has(m.publicId!));
  if (sans) {
    await page.goto(`/membres/${sans.publicId}`);
    await expect(page.getByTestId("member-best-streak")).toHaveCount(0);
  }
  if (avec) {
    const record = records.get(avec.publicId!)!;
    await page.goto(`/membres/${avec.publicId}`);
    const bloc = page.getByTestId("member-best-streak");
    await expect(bloc).toContainText(`Meilleure série : ${serieEnMots(record)}`);
    // Toujours ses dates, même en cours : une ancienne série ne se lit pas comme d'aujourd'hui.
    const dates = datesDuRecord(record).replace(/^./, (c) => c.toUpperCase());
    await expect(bloc).toContainText(`${dates}${record.courante ? ", sans défaite sous le tag depuis" : ""}, sur ses parties lues depuis le ${fmtDate(record.luesDepuis)}`);
    // Dans la scène des parties sous le tag, avec les chiffres du clan.
    await expect(page.getByTestId("member-stats").getByTestId("member-best-streak")).toHaveCount(1);
  }
  // Le record d'un membre des podiums de Records est le même chiffre, aux mêmes dates, que sur sa fiche.
  const podium = playerPodiums(loadMemberResults(), loadSessions(), loadMembers(), loadMeta().sessions.coveredUntil).streaks[0];
  const record = podium ? records.get(podium.id) : undefined;
  if (podium && record) {
    expect(record.victoires).toBe(podium.value);
    expect(datesDuRecord(record)).toBe(podiumDates(podium));
  }
  const enOr = nommes.find((m) => records.get(m.publicId!)?.doree);
  if (!enOr) return;
  await page.goto(`/membres/${enOr.publicId}`);
  const flamme = page.getByTestId("member-streak");
  await expect(flamme).toHaveAttribute("data-record", "");
  await expect(flamme).toContainText("son record");
  await expect(flamme.getByTestId("flamme-serie")).toHaveAttribute("data-doree", "");
  const alt = await page.locator('meta[property="og:image:alt"]').getAttribute("content");
  expect(alt).toContain(`C'est son record, sur ses parties lues depuis le ${fmtDate(records.get(enOr.publicId!)!.luesDepuis)}.`);
});

// Les compagnons de flamme (15 novembre 2026) : sous la flamme, ceux qui ont gagné sa série avec lui, cinq au plus, en liens
// vers leur fiche ; le reste et les Gaulois sans pseudo public dans « d'autres Gaulois ». Aucun nombre.
test("la flamme dit avec qui la série a été gagnée, en liens vers leurs fiches, sans déborder à 360 px", async ({ page }) => {
  const compagnons = loadCompagnonsDeFlamme();
  const [id, c] = [...compagnons].sort((a, b) => b[1].noms.length - a[1].noms.length)[0] ?? [];
  if (!id || !c) return;
  const phrase = phraseDesCompagnons(c)!;
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`/membres/${id}`);
  const ligne = page.getByTestId("member-streak").getByTestId("member-streak-mates");
  await expect(ligne).toHaveText(phrase.intro + phrase.noms.map((n) => n.avant + n.username).join("") + phrase.fin);
  // Aucun nombre hors des pseudos, qui peuvent en porter (« Nonex.5264 ») : ni par compagnon, ni pour les autres.
  expect((phrase.intro + phrase.noms.map((n) => n.avant).join("") + phrase.fin).match(/\d/)).toBeNull();
  const liens = ligne.getByRole("link");
  await expect(liens).toHaveCount(phrase.noms.length);
  for (const [i, n] of phrase.noms.entries()) await expect(liens.nth(i)).toHaveAttribute("href", `/membres/${encodeURIComponent(n.id)}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("les paliers rangent chaque membre une fois, sans anonyme nommé", async ({ page }) => {
  const stored = loadMembers();
  if (!stored) throw new Error("La liste des membres devrait exister.");
  const rows = tierRows(stored.members);
  await page.goto("/membres");
  const block = page.getByTestId("win-tiers");
  await expect(block.getByTestId("win-tier")).toHaveCount(rows.length);
  for (const [i, row] of rows.entries()) {
    const tier = block.getByTestId("win-tier").nth(i);
    await expect(tier.getByTestId("win-tier-title")).toHaveText(fmtCount(row.wins, "victoire"));
    await expect(tier.getByTestId("win-tier-count")).toHaveText(fmtCount(row.count, "membre"));
    await expect(tier.locator("a")).toHaveCount(row.named.length);
  }
  // Un pseudo mène à sa fiche, qui dit le même palier.
  const leader = rows[0]?.named[0];
  if (!leader?.team || !leader.username) throw new Error("Le plus haut palier devrait avoir un membre avec pseudo.");
  await block.getByRole("link", { name: leader.username, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/membres/${leader.publicId}`));
  const tier = tierOf(leader.team.wins);
  if (tier === null) throw new Error("Ce membre devrait avoir un palier.");
  await expect(page.getByTestId("member-tier")).toContainText(`Palier atteint : ${fmtCount(tier, "victoire")}`);
  const next = nextTier(leader.team.wins);
  if (next) await expect(page.getByTestId("member-tier")).toContainText(`Prochain palier : ${fmtCount(next.wins, "victoire")}`);
});

test("le Gaulois d'un membre ne paraît qu'à côté de qui a créé le sien, jamais inventé", async ({ page }) => {
  // Les Gaulois relevés avant la construction (.cache/gaulois-fiches.json) : sans eux, aucune page n'en montre.
  const avec = gauloisDuSite();
  const command = (loadMembers()?.members ?? []).filter((m) => m.role !== "member");
  await page.goto("/membres");
  await expect(page.getByTestId("command").locator(".gaulois-portrait")).toHaveCount(command.filter((m) => m.username && portraitDuGaulois(m.publicId)).length);
  for (const path of ["/", "/gazette", "/records", "/membres", "/revoir", "/parties"]) {
    await page.goto(path);
    const portraits = page.locator(".gaulois-portrait");
    if (avec.size === 0) await expect(portraits).toHaveCount(0);
    // Décoratifs : le pseudo est écrit à côté. Chaque image est celle d'un membre qui a un Gaulois.
    const images = await portraits.locator("img").evaluateAll((imgs) => imgs.map((img) => ({ alt: img.getAttribute("alt"), src: img.getAttribute("src") ?? "" })));
    for (const image of images) {
      expect(image.alt, path).toBe("");
      const id = decodeURIComponent(image.src.split("/gaulois/")[1]?.split(".png")[0] ?? "");
      expect(avec.has(id), `${path} : ${image.src}`).toBe(true);
    }
  }
});

test.describe("fiches des membres", () => {
  const roster = loadMembers()?.members ?? [];
  const named = roster.filter((m) => m.username && m.publicId);
  const active = [...named].sort((a, b) => (gamesOf(b) ?? 0) - (gamesOf(a) ?? 0))[0];
  const idle = named.find((m) => gamesOf(m) === 0);
  // Le mot le plus long, pas le pseudo le plus long : c'est lui qui peut faire déborder la page.
  const widestWord = (name: string | null) => Math.max(...(name ?? "").split(" ").map((word) => word.length));
  const longest = [...named].sort((a, b) => widestWord(b.username) - widestWord(a.username))[0];

  test("une fiche reprend les stats d'équipe du membre, et n'est pas indexée", async ({ page }) => {
    if (!active?.team) throw new Error("Il faudrait au moins un membre avec une partie sous le tag.");
    await page.goto(`/membres/${active.publicId}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(active.username ?? "");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
    const stats = page.getByTestId("member-stat");
    await expect(stats).toHaveCount(4);
    expect(digits(await stats.nth(0).locator("dd").textContent())).toBe(String(active.team.wins));
    expect(digits(await stats.nth(1).locator("dd").textContent())).toBe(String(active.team.losses));
    expect(digits(await stats.nth(2).locator("dd").textContent())).toBe(String(gamesOf(active)));
    // Le périmètre de ses stats, sous le nom du bloc, dans le seul repli de la fiche, et une seule date.
    await expect(page.getByTestId("reading-note")).toHaveCount(1);
    await expect(page.getByTestId("reading-note").locator('[data-note-bloc="Ses parties sous le tag"]')).toContainText("sans le classé");
    await expect(page.getByTestId("data-status")).toHaveCount(1);

    // Ni heure ni statistique d'un autre mode : le jour, la carte, le format et le résultat.
    const recent = loadMemberGames()[active.publicId ?? ""];
    const title = recent ? recentGamesTitle(recent, gamesOf(active) ?? 0) : null;
    const block = page.getByTestId("member-recent");
    if (recent && title) {
      await expect(block.getByTestId("member-recent-title")).toHaveText(title);
      await expect(block.getByTestId("member-game")).toHaveCount(recent.recent.length);
      expect(await block.locator("table").textContent()).not.toMatch(/\d{1,2}[:h]\d{2}/);
      await expect(block.getByTestId("map-names-credit")).toContainText("CC BY-SA 4.0");
    } else {
      await expect(block).toContainText("Pas de données");
      await expect(block.getByTestId("member-game")).toHaveCount(0);
    }
    await expect(page.getByRole("link", { name: "Son profil sur OpenFront" })).toHaveAttribute("href", `https://openfront.io/#modal=profile&publicID=${active.publicId}`);
    await page.getByRole("link", { name: "Retour à la liste" }).click();
    await expect(page).toHaveURL(/\/liste\/?$/);
  });

  test("un membre sans partie sous le tag n'a pas de faux zéro", async ({ page }) => {
    if (!idle) return;
    await page.goto(`/membres/${idle.publicId}`);
    await expect(page.getByTestId("member-no-game")).toHaveText("Aucune partie sous le tag");
    await expect(page.getByTestId("member-stat")).toHaveCount(0);
    await expect(page.getByTestId("member-recent")).toHaveCount(0);
  });

  test("le tableau des membres mène à la fiche, et un anonyme n'en a pas", async ({ page }) => {
    await page.goto("/liste");
    await hydrated(page);
    const link = page.getByRole("link", { name: active?.username ?? "", exact: true }).filter({ visible: true }).first();
    await expect(link).toHaveAttribute("href", new RegExp(`/membres/${active?.publicId}$`));
    expect(existsSync("dist/membres")).toBe(true);
    const pages = readdirSync("dist/membres").filter((name) => name !== "index.html");
    expect(pages.sort()).toEqual(named.map((m) => m.publicId).sort());
  });

  test("seuls les membres avec pseudo ont des parties gardées", () => {
    const ids = new Set(named.map((m) => m.publicId));
    expect(Object.keys(loadMemberGames()).filter((id) => !ids.has(id))).toEqual([]);
  });

  for (const width of [360, 375, 768, 1024, 1280, 1920]) {
    test(`la fiche au mot le plus long ne fait pas défiler la page à ${width} px`, async ({ page }) => {
      if (!longest) throw new Error("Il faudrait au moins un membre avec un pseudo.");
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/membres/${longest.publicId}`);
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    });
  }
  test("une fiche passe le contrôle d'accessibilité", async ({ page }) => {
    await page.goto(`/membres/${active?.publicId}`);
    await page.waitForLoadState("networkidle");
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
