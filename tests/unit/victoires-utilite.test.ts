import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { CARD_COLORS, GazetteFonts, type Measure } from "../../src/lib/gazette-image";
import { bilanDeLaPartie, scoresDuBilan } from "../../src/lib/rejeu/bilan";
import { nomsPubliables } from "../../src/lib/rejeu/film-brut";
import { TENUE_DE_DEPART } from "../../src/lib/gaulois";
import { spriteRect } from "../../src/lib/gaulois-sprite";
import { ApiVictoryGame, type StoredMembers, type StoredSession } from "../../src/lib/schemas";
import { MAX_UTILITY_TRIES, mergeStates, PAUSE_MS, readVictoryGame, utilitiesToRetry, UTILITY_PAUSE_MS, UTILITY_RETRY_MS, victoryPass, VictoryState, type UtilityOutcome, type VictoryPassDeps } from "../../src/lib/victoires";
import { bilanDeLaVictoire, lignesDUtilite, NOTE_DE_LA_MOYENNE, NOTE_DES_LIMITES, sendUtility, utilityContent, utilityPayload, type LigneDUtilite } from "../../src/lib/victoires-utilite";
import { largeurDeBarre, LIGNES_HAUTES_MAX, NOTE_DE_LA_SOURCE, renderUtilityCard, TON_DE_L_AXE, utilityCard, utilityImageAlt } from "../../src/lib/victoires-utilite-image";

const WEBHOOK = "https://discord.com/api/webhooks/123456/abc-DEF_123";
const SITE = "https://x.test/";
const PARTIE = "abc12345";
const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(NUMBER_SPACES, " ");
/** Une largeur approchée, pour tester la mise en page sans police. */
const measure: Measure = (text, font, size) => [...text].length * size * (font === "body" ? 0.52 : 0.58);

/** Des membres inventés : trois avec pseudo, dont deux qui portent le même, et un sans. */
const MEMBERS: StoredMembers = {
  fetchedAt: "2026-11-17T10:00:00.000Z",
  total: 4,
  members: [
    { role: "member", joinedAt: "2026-05-03T20:17:40.935Z", publicId: "id-zoe", username: "Zoé", team: null },
    { role: "member", joinedAt: "2026-05-03T20:17:40.935Z", publicId: "id-double-1", username: "Double", team: null },
    { role: "member", joinedAt: "2026-05-03T20:17:40.935Z", publicId: "id-double-2", username: "Double", team: null },
    { role: "member", joinedAt: "2026-05-03T20:17:40.935Z", publicId: null, username: null, team: null },
  ],
};

const joueurs = [
  { n: 1, client: "g1", equipe: "Red", type: "HUMAN" },
  { n: 2, client: "g2", equipe: "Red", type: "HUMAN" },
  { n: 3, client: "g3", equipe: "Red", type: "HUMAN" },
  { n: 4, client: "a4", equipe: "Blue", type: "HUMAN" },
];
const meta = (faits?: unknown, partie = PARTIE) => JSON.stringify({ format: 1, partie, commit: "a".repeat(40), largeur: 10, hauteur: 10, tours: 1000, toursFiche: 1000, empreintes: 5, joueurs, ...(faits === undefined ? {} : { faits }) });
/** La fiche de la partie comme l'API la donne : noms inventés, nombres en texte comme le jeu les écrit. */
const fiche = () => ({
  info: {
    gameID: PARTIE,
    config: { gameMap: "Four Islands" },
    duration: 600,
    players: [
      { clientID: "g1", clanTag: "GAL", publicID: "id-zoe", username: "[GAL] Zoé en jeu", stats: { gold: ["300"], attacks: ["1000"], units: { city: ["0", "1"] } } },
      // Un Gaulois hors de la liste publique : nommé par le pseudo qu'il portait dans la partie.
      { clientID: "g2", clanTag: "GAL", publicID: "id-inconnu", username: "[GAL] Passant", stats: { gold: ["100"], attacks: ["3000"], units: { city: ["0", "3"] } } },
      { clientID: "g3", clanTag: "GAL", publicID: "id-double-1", username: "Double", stats: { gold: ["0"], attacks: ["0"] } },
      // Un Gaulois jamais apparu sur la carte : pas de stats, pas au bilan.
      { clientID: "g9", clanTag: "GAL", publicID: "id-zoe", username: "Absent" },
      { clientID: "a4", clanTag: "UN", publicID: "id-autre", username: "Adversaire", stats: { gold: ["999999"], attacks: ["999999"] } },
    ],
  },
});
// 1 donne 5 000 dixièmes de troupes à 2, puis 400 d'or à 3.
const FAITS = [[10, 0, 1, 2, 5000], [20, 1, 1, 3, 400]];
const PARTIE_ANNONCEE = { id: PARTIE, start: "2026-11-16T21:33:20.000Z", map: "Four Islands" };

const bilan = () => bilanDeLaVictoire(meta(FAITS), fiche(), PARTIE, MEMBERS, "GAL", ["UN"])!;
const lignes = () => lignesDUtilite(bilan(), MEMBERS)!;
const ligne = (over: Partial<LigneDUtilite>): LigneDUtilite => ({ rang: 1, nom: "Zoé", id: null, utilite: 100, axes: { economie: 100, combat: 100, soutien: 100 }, titres: [], ...over });

describe("le bilan d'une victoire", () => {
  it("est celui du site : les mêmes Gaulois, les mêmes noms et les mêmes nombres que le film de la partie", () => {
    const players = fiche().info.players;
    const attendu = bilanDeLaPartie(meta(FAITS), {
      partie: PARTIE,
      clients: new Set(["g1", "g2", "g3"]),
      noms: nomsPubliables(players, new Map([["id-zoe", "Zoé"], ["id-double-1", "Double"], ["id-double-2", "Double"]]), ["UN"]),
      pseudos: new Map([["g1", "Zoé en jeu"], ["g2", "Passant"], ["g3", "Double"], ["g9", "Absent"], ["a4", "Adversaire"]]),
      stats: new Map(players.map((p) => [p.clientID, (p as { stats?: unknown }).stats] as const)),
    });
    expect(bilan()).toEqual(attendu);
    expect(bilan().gaulois).toEqual([
      { nom: "Zoé", enPartie: false, or: 300, attaque: 100, prises: 1, eliminations: 0, troupesDonnees: 500, orDonne: 400 },
      { nom: "Passant", enPartie: true, or: 100, attaque: 300, prises: 3, eliminations: 0, troupesDonnees: 0, orDonne: 0 },
      { nom: "Double", enPartie: false, or: 0, attaque: 0, prises: 0, eliminations: 0, troupesDonnees: 0, orDonne: 0 },
    ]);
    // Ni l'adversaire ni un identifiant n'y entrent.
    expect(JSON.stringify(bilan())).not.toMatch(/Adversaire|999999|id-|"g1"/);
  });
  it("n'existe pas sans les faits du rejeu ; refuse une fiche ou une description qui ne convient pas", () => {
    expect(bilanDeLaVictoire(meta(), fiche(), PARTIE, MEMBERS, "GAL", [])).toBeNull();
    expect(bilanDeLaVictoire(meta(FAITS), fiche(), PARTIE, MEMBERS, "AUTRE", [])).toBeNull();
    expect(() => bilanDeLaVictoire(meta(FAITS), undefined, PARTIE, MEMBERS, "GAL", [])).toThrow("joueurs de la fiche au format inattendu");
    expect(() => bilanDeLaVictoire(meta(FAITS), { info: {} }, PARTIE, MEMBERS, "GAL", [])).toThrow("format inattendu");
    expect(() => bilanDeLaVictoire(meta(FAITS, "autre"), fiche(), PARTIE, MEMBERS, "GAL", [])).toThrow("autre partie");
    expect(() => bilanDeLaVictoire("{", fiche(), PARTIE, MEMBERS, "GAL", [])).toThrow("illisible");
  });
  it("sans liste des membres, chacun porte son pseudo de partie", () => {
    expect(bilanDeLaVictoire(meta(FAITS), fiche(), PARTIE, null, "GAL", [])!.gaulois.map((g) => [g.nom, g.enPartie])).toEqual([["Zoé en jeu", true], ["Passant", true], ["Double", true]]);
  });
});

describe("les lignes du score d'utilité", () => {
  it("le plus utile d'abord, avec le score du site, chaque axe à l'échelle de l'utilité, et les titres", () => {
    const l = lignes();
    const scores = scoresDuBilan(bilan().gaulois);
    expect(l.map((x) => [x.rang, x.nom, x.utilite])).toEqual([[1, "Zoé", 200], [2, "Passant", 100], [3, "Double", 0]]);
    expect(l.map((x) => x.utilite).sort()).toEqual(scores.map((s) => s.utilite).sort());
    // Zoé : 300 d'or sur 400, 100 troupes sur 400 et 1 prise sur 4, tous les dons. Trois Gaulois : sa part fois 300.
    expect(l[0]!.axes).toEqual({ economie: 225, combat: 75, soutien: 300 });
    expect(l[0]!.titres).toEqual(["economie", "soutien"]);
    expect(l[1]!.axes).toEqual({ economie: 75, combat: 225, soutien: 0 });
    expect(l[1]!.titres).toEqual(["combat"]);
    expect(l[2]!.axes).toEqual({ economie: 0, combat: 0, soutien: 0 });
  });
  it("ne donne un Gaulois du village qu'à un pseudo public qui désigne un seul membre", () => {
    const l = lignes();
    expect(l.find((x) => x.nom === "Zoé")!.id).toBe("id-zoe");
    // Un pseudo de partie n'est relié à personne ; un pseudo public porté par deux membres non plus.
    expect(l.find((x) => x.nom === "Passant")!.id).toBeNull();
    expect(l.find((x) => x.nom === "Double")!.id).toBeNull();
    expect(lignesDUtilite(bilan(), null)!.every((x) => x.id === null)).toBe(true);
  });
  it("un seul Gaulois, ou rien à partager : pas de score, donc pas de message", () => {
    const seul = { ...bilan(), gaulois: bilan().gaulois.slice(0, 1) };
    expect(lignesDUtilite(seul, MEMBERS)).toBeNull();
    const rien = { ...bilan(), gaulois: bilan().gaulois.map((g) => ({ ...g, or: 0, attaque: 0, prises: 0, troupesDonnees: 0, orDonne: 0 })) };
    expect(lignesDUtilite(rien, MEMBERS)).toBeNull();
  });
  it("un axe où il n'y a rien à partager reste sans nombre : ce n'est pas zéro", () => {
    const sansDon = bilanDeLaVictoire(meta([]), fiche(), PARTIE, MEMBERS, "GAL", [])!;
    expect(lignesDUtilite(sansDon, MEMBERS)!.map((x) => x.axes.soutien)).toEqual([null, null, null]);
  });
  it("à utilité égale, le même rang, dans l'ordre du bilan", () => {
    const egaux = { ...bilan(), gaulois: [bilan().gaulois[0]!, { ...bilan().gaulois[0]!, nom: "Jumeau", enPartie: true }] };
    expect(lignesDUtilite(egaux, MEMBERS)!.map((x) => [x.rang, x.nom])).toEqual([[1, "Zoé"], [1, "Jumeau"]]);
  });
});

describe("le message du score d'utilité", () => {
  it("le texte de secours dit la partie, chaque Gaulois, ses axes et ses titres, ce que vaut 100 et ce que le score ne mesure pas", () => {
    const content = plain(utilityContent(PARTIE_ANNONCEE, lignes(), "GAL", SITE));
    expect(content.split("\n")).toEqual([
      "**Les plus utiles** · Victoire de \\[GAL\\] sur la carte Quatre Îles",
      "1. **Zoé** · 200 d'utilité (économie 225, combat 75, soutien 300) · Trésorier, Ravitailleur",
      "2. **Passant** · 100 d'utilité (économie 75, combat 225, soutien 0) · Fer de lance",
      "3. **Double** · 0 d'utilité (économie 0, combat 0, soutien 0)",
      "[Revoir la partie](<https://x.test/revoir/?partie=abc12345>) · [Les plus utiles](<https://x.test/utiles>)",
      `-# ${NOTE_DE_LA_MOYENNE} ${NOTE_DES_LIMITES}`,
    ]);
  });
  it("un nom ne met rien en forme et ne glisse ni lien ni mention ; sans nom : « Un Gaulois »", () => {
    const content = utilityContent(PARTIE_ANNONCEE, [ligne({ nom: "**@everyone** [x](http://y)" }), ligne({ rang: 2, nom: null })], "GAL", SITE);
    expect(content).not.toContain("**@everyone**");
    expect(content).not.toContain("[x](http://y)");
    expect(content).toContain("2. **Un Gaulois**");
    expect(utilityPayload(PARTIE_ANNONCEE, lignes(), "GAL", SITE, null)["allowed_mentions"]).toEqual({ parse: [] });
  });
  it("au-delà de ce que Discord accepte, compte ceux qu'il ne peut plus écrire", () => {
    const beaucoup = Array.from({ length: 60 }, (_, i) => ligne({ rang: i + 1, nom: `Un nom assez long numéro ${i}` }));
    const content = utilityContent(PARTIE_ANNONCEE, beaucoup, "GAL", SITE);
    expect(content.length).toBeLessThanOrEqual(1900);
    expect(content).toMatch(/… et \d+ autres Gaulois/);
    expect(content).toContain(NOTE_DES_LIMITES);
  });
  it("avec l'image : le fichier joint et deux boutons, la partie à revoir et le classement, sans aucun texte", () => {
    const payload = utilityPayload(PARTIE_ANNONCEE, lignes(), "GAL", SITE, { alt: "Image.", filename: "utilite.png" });
    expect(payload).not.toHaveProperty("content");
    expect(payload["attachments"]).toEqual([{ id: 0, filename: "utilite.png", description: "Image." }]);
    const buttons = (payload["components"] as { components: { label: string; url: string }[] }[])[0]!.components;
    expect(buttons.map((b) => [b.label, b.url])).toEqual([["Revoir la partie", "https://x.test/revoir/?partie=abc12345"], ["Les plus utiles", "https://x.test/utiles"]]);
  });
  it("part en texte si l'image ne se dessine pas, et n'écrit jamais le lien", async () => {
    const logs: string[] = [];
    const post = vi.fn(async () => new Response(null, { status: 204 }));
    const ok = await sendUtility({ link: WEBHOOK, partie: PARTIE_ANNONCEE, lignes: lignes(), renderImage: () => Promise.reject(new Error("police")), tag: "GAL", siteUrl: SITE, fetch: post as unknown as typeof fetch, log: (l) => logs.push(l) });
    expect(ok).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    const [, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(JSON.parse(String(init.body)).content)).toContain("d'utilité");
    expect(logs.join("\n")).toContain("Utilité : image impossible à dessiner");
    for (const line of logs) expect(line).not.toContain("abc-DEF_123");
  });
  it("avec l'image, l'envoie seule, jointe sous le nom de la partie ; un refus de Discord se dit", async () => {
    const post = vi.fn(async (_url: string, init: RequestInit) => new Response(null, { status: init.body instanceof FormData ? 200 : 500 }));
    const deps = { link: WEBHOOK, partie: PARTIE_ANNONCEE, lignes: lignes(), renderImage: async () => ({ png: new Uint8Array([1]), alt: "Image." }), tag: "GAL", siteUrl: SITE, log: () => {} };
    expect(await sendUtility({ ...deps, fetch: post as unknown as typeof fetch })).toBe(true);
    const [url, init] = post.mock.calls[0]!;
    expect(url).toBe(`${WEBHOOK}?with_components=true`);
    expect(JSON.parse((init.body as FormData).get("payload_json") as string).attachments[0].filename).toBe("utilite-abc12345.png");
    const down = vi.fn(async () => new Response(null, { status: 503 }));
    expect(await sendUtility({ ...deps, fetch: down as unknown as typeof fetch })).toBe(false);
  });
});

describe("l'image du score d'utilité", () => {
  it("dessine l'en-tête de la partie, une ligne par Gaulois avec son rang, son utilité, ses titres et ses trois axes, puis les notes", () => {
    const card = utilityCard(PARTIE_ANNONCEE, lignes(), "GAL", SITE, measure);
    const texts = card.texts.map((t) => plain(t.text));
    for (const expected of ["Les plus utiles", "Victoire de [GAL] · Quatre Îles", "Lundi 16 novembre à 22:33, heure de Paris", "Passant", "Zoé", "Double", "200", "100", "d'utilité", "ÉCONOMIE", "COMBAT", "SOUTIEN", "225", "300", "FER DE LANCE", "TRÉSORIER", "RAVITAILLEUR", NOTE_DES_LIMITES, "x.test/utiles", NOTE_DE_LA_SOURCE]) {
      expect(texts).toContain(expected);
    }
    expect(texts.some((t) => t.startsWith(NOTE_DE_LA_MOYENNE))).toBe(true);
    // Le titre de chacun est dans la couleur de son axe, et le premier a son rang en bleu.
    expect(card.texts.find((t) => t.text === "TRÉSORIER")!.color).toBe(TON_DE_L_AXE.economie);
    expect(card.texts.find((t) => t.text === "FER DE LANCE")!.color).toBe(TON_DE_L_AXE.combat);
    expect(card.rects.filter((r) => r.color === CARD_COLORS.BLUE && r.width === 60)).toHaveLength(1);
    // Rien ne sort de l'image.
    for (const r of card.rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(card.width);
      expect(r.y + r.height).toBeLessThanOrEqual(card.height);
    }
    for (const t of card.texts) expect(t.y).toBeLessThan(card.height);
    expect(card.gaulois).toBeUndefined();
  });
  it("une barre va de 0 au double de la moyenne, 100 au milieu ; une part non nulle se voit toujours", () => {
    expect([largeurDeBarre(0), largeurDeBarre(1), largeurDeBarre(100), largeurDeBarre(200), largeurDeBarre(480)]).toEqual([0, 3, 69, 138, 138]);
    const card = utilityCard(PARTIE_ANNONCEE, [ligne({ axes: { economie: 100, combat: 200, soutien: 0 } }), ligne({ rang: 2 })], "GAL", SITE, measure);
    const pleines = (ton: string) => card.rects.filter((r) => r.color === ton).map((r) => r.width);
    expect(pleines(TON_DE_L_AXE.economie)).toEqual([69, 69]);
    expect(pleines(TON_DE_L_AXE.combat)).toEqual([138, 69]);
    // Zéro : la barre vide, sans partie pleine.
    expect(pleines(TON_DE_L_AXE.soutien)).toEqual([69]);
  });
  it("un axe où il n'y a rien à partager : un tiret, et aucune barre", () => {
    const avec = utilityCard(PARTIE_ANNONCEE, [ligne({}), ligne({ rang: 2 })], "GAL", SITE, measure);
    const sans = utilityCard(PARTIE_ANNONCEE, [ligne({ axes: { economie: 100, combat: 100, soutien: null } }), ligne({ rang: 2, axes: { economie: 100, combat: 100, soutien: null } })], "GAL", SITE, measure);
    expect(sans.texts.filter((t) => t.text === "–")).toHaveLength(2);
    expect(sans.rects.filter((r) => r.color === TON_DE_L_AXE.soutien)).toHaveLength(0);
    expect(avec.rects.length - sans.rects.length).toBe(6);
  });
  it(`au-delà de ${LIGNES_HAUTES_MAX} Gaulois, des lignes plus basses : tous y sont, et un nom trop long est coupé, pas débordé`, () => {
    const hautes = utilityCard(PARTIE_ANNONCEE, Array.from({ length: 5 }, (_, i) => ligne({ rang: i + 1 })), "GAL", SITE, measure);
    const basses = utilityCard(PARTIE_ANNONCEE, Array.from({ length: 12 }, (_, i) => ligne({ rang: i + 1, nom: i === 0 ? "W".repeat(40) : `Gaulois ${i}` })), "GAL", SITE, measure);
    const ligneDe = (card: typeof hautes) => card.rects.filter((r) => r.width === card.width - 72 && r.stroke === CARD_COLORS.LINE);
    expect(ligneDe(hautes).map((r) => r.height)).toEqual(Array(5).fill(78));
    expect(ligneDe(basses).map((r) => r.height)).toEqual(Array(12).fill(62));
    const long = basses.texts.find((t) => t.text.startsWith("WWW"))!;
    // Réduit pour tenir avant l'utilité ; plus large encore, il serait coupé.
    expect(long.size).toBeLessThan(25);
    expect(long.x + measure(long.text, "strong", long.size)).toBeLessThanOrEqual(488);
    const large: Measure = (text, font, size) => measure(text, font, size) * 2;
    const coupe = utilityCard(PARTIE_ANNONCEE, [ligne({ nom: "W".repeat(40) }), ligne({ rang: 2 })], "GAL", SITE, large).texts.find((t) => t.text.startsWith("WWW"))!;
    expect(coupe.text.endsWith("…")).toBe(true);
    expect(coupe.x + large(coupe.text, "strong", coupe.size)).toBeLessThanOrEqual(488);
    expect(basses.texts.filter((t) => t.text.startsWith("Gaulois "))).toHaveLength(11);
  });
  it("les Gaulois du village : en buste dans une colonne entre le rang et le nom, sans jamais passer sur un texte", () => {
    const deux = [ligne({ id: "id-zoe", titres: ["economie"] }), ligne({ rang: 2, nom: "Passant", id: null })];
    const sans = utilityCard(PARTIE_ANNONCEE, deux, "GAL", SITE, measure);
    const avec = utilityCard(PARTIE_ANNONCEE, deux, "GAL", SITE, measure, new Map([["id-zoe", TENUE_DE_DEPART]]));
    expect(avec.gaulois).toHaveLength(1);
    const bust = spriteRect(avec.gaulois![0]!);
    const nameX = (card: typeof avec, nom: string) => card.texts.find((t) => t.text === nom)!.x;
    // Après le rang, avant les noms, qui restent alignés entre eux ; le bas posé sur le bord de sa ligne.
    expect(bust.x).toBeGreaterThanOrEqual(36 + 11 + 60);
    expect(bust.x + bust.width).toBeLessThan(nameX(avec, "Zoé"));
    expect(nameX(avec, "Passant")).toBe(nameX(avec, "Zoé"));
    expect(avec.texts.find((t) => t.text === "TRÉSORIER")!.x).toBe(nameX(avec, "Zoé"));
    expect(nameX(avec, "Zoé")).toBeGreaterThan(nameX(sans, "Zoé"));
    const row = avec.rects.find((r) => r.width === avec.width - 72 && r.stroke === CARD_COLORS.LINE)!;
    expect(bust.y + bust.height).toBe(row.y + row.height - 1);
    // La hauteur de l'image ne change pas.
    expect(avec.height).toBe(sans.height);
  });
  it("trois titres sous un nom tiennent dans la place du nom, jamais sous l'utilité, avec ou sans Gaulois, lignes hautes ou basses", () => {
    const fonts = new GazetteFonts(process.cwd());
    const tous = ligne({ id: "id-zoe", utilite: 1200, titres: ["economie", "combat", "soutien"] });
    for (const gaulois of [undefined, new Map([["id-zoe", TENUE_DE_DEPART]])]) {
      for (const autres of [1, 11]) {
        const card = utilityCard(PARTIE_ANNONCEE, [tous, ...Array.from({ length: autres }, (_, i) => ligne({ rang: i + 2 }))], "GAL", SITE, fonts.width, gaulois);
        const titres = card.texts.filter((t) => ["TRÉSORIER", "FER DE LANCE", "RAVITAILLEUR"].includes(t.text));
        expect(titres.map((t) => t.text)).toEqual(["TRÉSORIER", "FER DE LANCE", "RAVITAILLEUR"]);
        const dernier = titres.at(-1)!;
        const fin = dernier.x + fonts.width(dernier.text, "monoStrong", dernier.size) + 0.06 * dernier.size * (dernier.text.length - 1);
        // Le nombre de l'utilité, à quatre chiffres, écrit à droite : son bord gauche.
        const nombre = card.texts.find((t) => plain(t.text) === "1 200")!;
        expect(fin).toBeLessThan(nombre.x - fonts.width(nombre.text, "onciale", nombre.size));
      }
    }
  });
  it("dit tout à un lecteur d'écran, sans couper une ligne", () => {
    const alt = plain(utilityImageAlt(PARTIE_ANNONCEE, lignes(), "GAL"));
    expect(alt).toBe(
      "Score d'utilité des Gaulois de la partie. Victoire de [GAL] sur la carte Quatre Îles, lundi 16 novembre à 22:33, heure de Paris. " +
        "1. Zoé : 200 d'utilité, économie 225, combat 75, soutien 300 (Trésorier, Ravitailleur). " +
        "2. Passant : 100 d'utilité, économie 75, combat 225, soutien 0 (Fer de lance). " +
        "3. Double : 0 d'utilité, économie 0, combat 0, soutien 0. " +
        `${NOTE_DE_LA_MOYENNE} ${NOTE_DES_LIMITES}`,
    );
    const beaucoup = Array.from({ length: 80 }, (_, i) => ligne({ rang: i + 1, nom: `Un nom assez long numéro ${i}` }));
    const long = utilityImageAlt(PARTIE_ANNONCEE, beaucoup, "GAL");
    expect(long.length).toBeLessThanOrEqual(1024);
    expect(long).toMatch(/Et \d+ autres Gaulois\./);
    expect(long.endsWith(NOTE_DES_LIMITES)).toBe(true);
  });
  it("se dessine en PNG avec les vraies polices, à la taille de la mise en page", async () => {
    const root = process.cwd();
    const fonts = new GazetteFonts(root);
    const card = utilityCard(PARTIE_ANNONCEE, lignes(), "GAL", SITE, fonts.width);
    const meta = await sharp(await renderUtilityCard(card, fonts, root)).metadata();
    expect([meta.width, meta.height]).toEqual([card.width, card.height]);
  });
});

describe("le passage : la victoire, puis son score d'utilité", () => {
  const NOW = new Date("2026-11-17T20:53:00.000Z");
  const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
  const session = (gameId: string, gameStart: string): StoredSession => ({ gameId, clanPlayerCount: 3, hasWon: true, numTeams: 4, playerTeams: "4", totalPlayerCount: 20, gameStart, score: 1.5 });
  const GAME = ApiVictoryGame.parse(fiche());
  /** `outcomes` : ce que répond l'envoi du score, appel après appel ; le dernier se répète. */
  const setup = (sessions: StoredSession[], outcomes: (UtilityOutcome | Error)[], over: Partial<VictoryPassDeps> = {}) => {
    const events: string[] = [];
    const saved: VictoryState[] = [];
    const logs: string[] = [];
    let call = 0;
    const deps: VictoryPassDeps = {
      stored: { done: [] },
      sessions,
      members: MEMBERS,
      tag: "GAL",
      now: NOW,
      readGame: async () => GAME,
      isMember: async () => true,
      send: async (v) => {
        events.push(`victoire ${v.id}`);
        return true;
      },
      sendUtility: async (s) => {
        const outcome = outcomes[Math.min(call++, outcomes.length - 1)]!;
        events.push(`utilité ${s.gameId} ${outcome instanceof Error ? "erreur" : outcome}`);
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
      pause: async (ms) => {
        events.push(`pause ${ms}`);
      },
      progress: (state) => void saved.push(JSON.parse(JSON.stringify(state)) as VictoryState),
      log: (l) => logs.push(l),
      ...over,
    };
    return { deps, events, saved, logs };
  };

  it("une seconde après chaque victoire, son score ; deux secondes avant la victoire suivante", async () => {
    expect([UTILITY_PAUSE_MS, PAUSE_MS]).toEqual([1_000, 2_000]);
    const { deps, events } = setup([session("a", ago(2)), session("b", ago(1))], ["sent"]);
    const result = await victoryPass(deps);
    expect(events).toEqual(["victoire a", "pause 1000", "utilité a sent", "pause 2000", "victoire b", "pause 1000", "utilité b sent"]);
    expect(result).toEqual({ state: { done: [["a", ago(2)], ["b", ago(1)]], utility: [["a", ago(2), 0, true], ["b", ago(1), 0, true]] }, failed: false });
    expect(utilitiesToRetry(result.state, NOW)).toEqual([]);
  });
  it("le score est noté dû dans la même écriture que la victoire, avant d'être tenté : un passage coupé entre les deux le reprend", async () => {
    const { deps, saved } = setup([session("a", ago(2))], ["sent"]);
    await victoryPass(deps);
    expect(saved).toEqual([
      { done: [["a", ago(2)]], utility: [["a", ago(2), 0, false]] },
      { done: [["a", ago(2)]], utility: [["a", ago(2), 0, true]] },
    ]);
    // Coupé après la première écriture : au passage suivant, le score part seul, sans que la victoire reparte.
    expect(utilitiesToRetry(saved[0]!, NOW)).toEqual(["a"]);
    const next = setup([session("a", ago(2))], ["sent"], { stored: saved[0]! });
    const result = await victoryPass(next.deps);
    expect(next.events).toEqual(["utilité a sent"]);
    expect(result.state).toEqual({ done: [["a", ago(2)]], utility: [["a", ago(2), 0, true]] });
  });
  it("refusé par Discord : retenté une fois tout de suite, puis au début du passage suivant, sans retenir les autres victoires", async () => {
    const { deps, events, logs } = setup([session("a", ago(2)), session("b", ago(1))], ["failed", "failed", "sent"]);
    const result = await victoryPass(deps);
    expect(events).toEqual(["victoire a", "pause 1000", "utilité a failed", `pause ${UTILITY_RETRY_MS}`, "utilité a failed", "pause 2000", "victoire b", "pause 1000", "utilité b sent"]);
    expect(result).toEqual({ state: { done: [["a", ago(2)], ["b", ago(1)]], utility: [["a", ago(2), 1, false], ["b", ago(1), 0, true]] }, failed: true });
    expect(logs).toContain("Utilité : le score de la partie a n'est pas parti, nouvel essai au prochain passage.");
    expect(utilitiesToRetry(result.state, NOW)).toEqual(["a"]);
    // Au passage suivant : le score dû d'abord, puis la nouvelle victoire, deux secondes après.
    const next = setup([session("a", ago(2)), session("b", ago(1)), session("c", ago(0.2))], ["sent"], { stored: result.state });
    const after = await victoryPass(next.deps);
    expect(next.events).toEqual(["utilité a sent", "pause 2000", "victoire c", "pause 1000", "utilité c sent"]);
    expect(after.state!.utility).toEqual([["a", ago(2), 1, true], ["b", ago(1), 0, true], ["c", ago(0.2), 0, true]]);
    expect(after.failed).toBe(false);
  });
  it("un refus retenté qui passe au second essai ne laisse rien de dû", async () => {
    const { deps, events } = setup([session("a", ago(2))], ["failed", "sent"]);
    const result = await victoryPass(deps);
    expect(events).toEqual(["victoire a", "pause 1000", "utilité a failed", `pause ${UTILITY_RETRY_MS}`, "utilité a sent"]);
    expect(result).toEqual({ state: { done: [["a", ago(2)]], utility: [["a", ago(2), 0, true]] }, failed: false });
  });
  it("une erreur en préparant le score compte comme un refus : elle ne fait pas tomber le passage", async () => {
    const { deps, logs } = setup([session("a", ago(2)), session("b", ago(1))], [new Error("panne"), new Error("panne"), "sent"]);
    const result = await victoryPass(deps);
    expect(result.state!.done.map(([id]) => id)).toEqual(["a", "b"]);
    expect(result.state!.utility).toEqual([["a", ago(2), 1, false], ["b", ago(1), 0, true]]);
    expect(logs.filter((l) => l.includes("ne se prépare pas (panne)"))).toHaveLength(2);
  });
  it("une partie que le rejeu n'a pas encore vue : le score attend le passage suivant, sans compter comme une panne", async () => {
    const { deps, events, logs } = setup([session("a", ago(2))], ["later"]);
    const result = await victoryPass(deps);
    expect(events).toEqual(["victoire a", "pause 1000", "utilité a later"]);
    expect(result).toEqual({ state: { done: [["a", ago(2)]], utility: [["a", ago(2), 1, false]] }, failed: false });
    expect(logs).toContain("Utilité : le score de la partie a attend son rejeu, nouvel essai au prochain passage.");
  });
  it("une partie sans score est réglée pour de bon : rien n'est retenté", async () => {
    const { deps } = setup([session("a", ago(2))], ["none"]);
    const result = await victoryPass(deps);
    expect(result.state!.utility).toEqual([["a", ago(2), 0, true]]);
    const next = setup([session("a", ago(2))], ["sent"], { stored: result.state });
    expect(await victoryPass(next.deps)).toEqual({ state: null, failed: false });
    expect(next.events).toEqual([]);
  });
  it(`abandonne au bout de ${MAX_UTILITY_TRIES} passages, avec un avertissement, et ne retente plus`, async () => {
    let stored: VictoryState = { done: [["a", ago(2)]], utility: [["a", ago(2), MAX_UTILITY_TRIES - 1, false]] };
    const last = setup([session("a", ago(2))], ["failed"], { stored });
    const result = await victoryPass(last.deps);
    expect(result.state!.utility).toEqual([["a", ago(2), MAX_UTILITY_TRIES, true]]);
    expect(last.logs).toContain(`::warning::Utilité : le score de la partie a n'a pas pu partir en ${MAX_UTILITY_TRIES} passages, il est abandonné.`);
    stored = result.state!;
    expect(utilitiesToRetry(stored, NOW)).toEqual([]);
    const next = setup([session("a", ago(2))], ["sent"], { stored });
    await victoryPass(next.deps);
    expect(next.events).toEqual([]);
  });
  it("un score dû dont le détail de la partie ne se lit pas compte un essai, sans appel à l'envoi, et reste dû", async () => {
    const stored: VictoryState = { done: [["a", ago(2)]], utility: [["a", ago(2), 0, false]] };
    const { deps, events, logs } = setup([session("a", ago(2))], ["sent"], { stored, readGame: () => Promise.reject(new Error("HTTP 503")) });
    const result = await victoryPass(deps);
    expect(events).toEqual([]);
    expect(result.state!.utility).toEqual([["a", ago(2), 1, false]]);
    expect(logs[0]).toBe("::warning::Utilité : le détail de la partie a ne se lit pas (HTTP 503).");
  });
  it("un score dû ne dépend pas des sessions lues à ce passage : il part même si sa partie n'y est pas", async () => {
    // La lecture des dernières heures a échoué, et la collecte horaire n'a pas encore la partie.
    const stored: VictoryState = { done: [["a", ago(0.5)]], utility: [["a", ago(0.5), 1, false]] };
    const seen: [string, string][] = [];
    const { deps, events } = setup([], ["sent"], {
      stored,
      sendUtility: async (s) => {
        seen.push([s.gameId, s.gameStart]);
        return "sent";
      },
    });
    const result = await victoryPass(deps);
    expect(events).toEqual([]);
    expect(seen).toEqual([["a", ago(0.5)]]);
    expect(result.state!.utility).toEqual([["a", ago(0.5), 1, true]]);
  });
  it("une victoire à renvoyer dont le score était encore dû : un seul score, après la victoire renvoyée", async () => {
    const stored: VictoryState = { done: [["a", ago(2)]], utility: [["a", ago(2), 2, false]] };
    const { deps, events } = setup([session("a", ago(2))], ["sent"], { stored, resend: new Set(["a"]) });
    const result = await victoryPass(deps);
    expect(events).toEqual(["victoire a", "pause 1000", "utilité a sent"]);
    expect(result.state!.utility).toEqual([["a", ago(2), 0, true]]);
  });
  it("les victoires notées avant ce second message n'en reçoivent pas : rien ne se déverse dans le salon", async () => {
    const { deps, events } = setup([session("a", ago(2)), session("b", ago(1))], ["sent"], { stored: { done: [["a", ago(2)], ["b", ago(1)]] } });
    expect(await victoryPass(deps)).toEqual({ state: null, failed: false });
    expect(events).toEqual([]);
    expect(utilitiesToRetry({ done: [["a", ago(2)]] }, NOW)).toEqual([]);
    expect(utilitiesToRetry(null, NOW)).toEqual([]);
  });
  it("sans envoi du score, le passage et son état sont ceux d'avant", async () => {
    const { deps, events } = setup([session("a", ago(2))], ["sent"], { sendUtility: undefined });
    expect(await victoryPass(deps)).toEqual({ state: { done: [["a", ago(2)]] }, failed: false });
    expect(events).toEqual(["victoire a"]);
  });
  it("une victoire refusée par Discord n'a pas de score : les deux repartent ensemble au passage suivant", async () => {
    const { deps, events } = setup([session("a", ago(2))], ["sent"], { send: async () => false });
    expect(await victoryPass(deps)).toEqual({ state: null, failed: true });
    expect(events).toEqual([]);
  });
  it("oublie un score au bout d'un jour, et les deux copies de l'état ne reviennent jamais en arrière", () => {
    const stored: VictoryState = { done: [], utility: [["vieux", ago(30), 0, false], ["a", ago(2), 2, false]] };
    expect(utilitiesToRetry(stored, NOW)).toEqual(["a"]);
    const merged = mergeStates({ done: [], utility: [["a", ago(2), 2, false], ["b", ago(1), 0, true]] }, { done: [], utility: [["a", ago(2), 1, true], ["b", ago(1), 3, false], ["c", ago(0.5), 0, false]] });
    expect(merged).toEqual({ done: [], utility: [["a", ago(2), 2, true], ["b", ago(1), 3, true], ["c", ago(0.5), 0, false]] });
    // Un état d'avant se lit toujours, et s'écrit sans le champ.
    expect(VictoryState.parse({ done: [["a", ago(2)]] })).toEqual({ done: [["a", ago(2)]] });
    expect(mergeStates({ done: [["a", ago(2)]] }, null)).toEqual({ done: [["a", ago(2)]] });
    expect(VictoryState.safeParse({ done: [], utility: [["a", ago(2), -1, false]] }).success).toBe(false);
  });
  it("une victoire renvoyée repart avec son score", async () => {
    const stored: VictoryState = { done: [["a", ago(2)]], utility: [["a", ago(2), 0, true]] };
    const { deps, events } = setup([session("a", ago(2))], ["sent"], { stored, resend: new Set(["a"]) });
    const result = await victoryPass(deps);
    expect(events).toEqual(["victoire a", "pause 1000", "utilité a sent"]);
    expect(result.state).toEqual({ done: [["a", ago(2)]], resent: [["a", ago(2)]], utility: [["a", ago(2), 0, true]] });
  });
});

describe("la fiche lue pour la victoire sert aussi au score", () => {
  it("donne la réponse entière de l'API, stats comprises, sans rien changer à ce que le message de la victoire en garde", async () => {
    const bodies: unknown[] = [];
    const get = vi.fn(async () => new Response(JSON.stringify(fiche()), { status: 200 }));
    const game = await readVictoryGame(PARTIE, get as unknown as typeof fetch, async () => {}, (body) => bodies.push(body));
    expect(game).toEqual(ApiVictoryGame.parse(fiche()));
    expect(JSON.stringify(game)).not.toMatch(/gold|attacks/);
    expect(bodies).toEqual([fiche()]);
    // Une réponse qui ne convient pas n'est pas donnée.
    const odd = vi.fn(async () => new Response(JSON.stringify({ info: {} }), { status: 200 }));
    await expect(readVictoryGame(PARTIE, odd as unknown as typeof fetch, async () => {}, (body) => bodies.push(body))).rejects.toThrow("réponse au mauvais format");
    expect(bodies).toHaveLength(1);
  });
});
