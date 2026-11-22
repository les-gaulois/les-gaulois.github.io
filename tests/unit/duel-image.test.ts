import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { dessinDeLaBanniere, BANNIERES } from "../../supabase/functions/code-discord/bannieres/index";
import { HAUTEUR, LARGEUR, PIEDS } from "../../supabase/functions/code-discord/decors/commun";
import { decorDe } from "../../supabase/functions/code-discord/decors/index";
import { COULISSE, COULISSES, LIEU_DE_SECOURS, SCENE_DU_DUEL, casesDuDuel, etoiles, fondDuDuel, miroir, quartDeTour, rogner, vaincuATerre, type Duelliste, type Grille } from "../../supabase/functions/code-discord/duel-image";
import { familierAPoser } from "../../supabase/functions/code-discord/familiers/familier";
import { FAMILIERS } from "../../supabase/functions/code-discord/familiers/index";
import { CLE_MODELE, GAULOIS_LARGEUR, TENUE_DE_DEPART, casesDuGaulois, tenueAuHasard, type Tenue } from "../../supabase/functions/code-discord/gaulois";
import { MODELES } from "../../supabase/functions/code-discord/modeles/index";
import { momentDeParis } from "../../supabase/functions/code-discord/scene";
import { ECHELLE_SCENE, HEIGHT, SCENE_Y, WIDTH, dateDuDuel, duelCard, nomSurLImage, renderDuelCard, titreSurLImage } from "../../src/lib/duels-image";
import type { VictoireEnDuel } from "../../src/lib/duels-discord";
import { drawnWidth, GazetteFonts, MARGIN, type CardText } from "../../src/lib/gazette-image";

const HEX = /^#[0-9a-f]{6}$/i;
const graine = (n: number) => () => (n = (n * 1664525 + 1013904223) >>> 0) / 4294967296;
const seul = (tenue: Tenue): Duelliste => ({ tenue, familier: null });
const BANNIERE = BANNIERES[0]!.id;
const FOND = dessinDeLaBanniere(BANNIERE)!;
const grille = (largeur: number, hauteur: number): Grille => ({ largeur, hauteur, cases: Array.from({ length: largeur * hauteur }, (_, i) => (i % 3 === 0 ? null : `#${(i * 2654435761 % 0xffffff).toString(16).padStart(6, "0")}`)) });

describe("les gestes de la grille", () => {
  it("deux miroirs, ou quatre quarts de tour, rendent la grille de départ", () => {
    const g = grille(5, 3);
    expect(miroir(miroir(g))).toEqual(g);
    expect(quartDeTour(quartDeTour(quartDeTour(quartDeTour(g))))).toEqual(g);
    expect(quartDeTour(g)).toMatchObject({ largeur: 3, hauteur: 5 });
  });
  it("un quart de tour fait passer le haut à droite", () => {
    const g: Grille = { largeur: 2, hauteur: 2, cases: ["#000001", "#000002", null, null] };
    expect(quartDeTour(g).cases).toEqual([null, "#000001", null, "#000002"]);
  });
  it("rogner garde le contour, et une grille vide devient une case vide", () => {
    const g: Grille = { largeur: 4, hauteur: 3, cases: [null, null, null, null, null, "#000001", "#000002", null, null, null, null, null] };
    expect(rogner(g)).toEqual({ largeur: 2, hauteur: 1, cases: ["#000001", "#000002"] });
    expect(rogner({ largeur: 2, hauteur: 2, cases: [null, null, null, null] })).toEqual({ largeur: 1, hauteur: 1, cases: [null] });
  });
});

describe("le vaincu couché", () => {
  const tenues: Tenue[] = [TENUE_DE_DEPART, ...Array.from({ length: 20 }, (_, i) => tenueAuHasard(graine(i + 1))), ...MODELES.map((m) => ({ ...TENUE_DE_DEPART, [CLE_MODELE]: m.id }))];
  it("tient couché sous les étoiles, quelle que soit sa tenue, Gaulois uniques compris", () => {
    for (const tenue of tenues) {
      const couche = vaincuATerre(tenue);
      expect(couche.largeur).toBeLessThanOrEqual(64);
      // Les étoiles (8 rangées) passent au-dessus de lui sans sortir par le haut de la scène.
      expect(couche.hauteur + etoiles().hauteur).toBeLessThanOrEqual(PIEDS);
    }
  });
  it("a les yeux fermés : son dessin n'est pas celui du Gaulois debout, tourné", () => {
    const debout = rogner(quartDeTour(miroir({ largeur: GAULOIS_LARGEUR, hauteur: 64, cases: casesDuGaulois(TENUE_DE_DEPART) })));
    expect(vaincuATerre(TENUE_DE_DEPART).cases).not.toEqual(debout.cases);
  });
});

describe("la scène d'un duel", () => {
  it("fait 188 cases sur 80, toutes de vraies couleurs, et se redessine à l'identique", () => {
    const cases = casesDuDuel(seul(TENUE_DE_DEPART), seul(TENUE_DE_DEPART), FOND);
    expect(SCENE_DU_DUEL).toEqual({ largeur: LARGEUR + 2 * COULISSES, hauteur: HAUTEUR });
    expect(cases).toHaveLength(SCENE_DU_DUEL.largeur * SCENE_DU_DUEL.hauteur);
    expect(cases.every((c) => HEX.test(c))).toBe(true);
    expect(casesDuDuel(seul(TENUE_DE_DEPART), seul(TENUE_DE_DEPART), FOND)).toEqual(cases);
  });
  it("montre le haut de la bannière tel quel, cadre compris : rien ne s'y pose", () => {
    const cases = casesDuDuel(seul(tenueAuHasard(graine(3))), seul(tenueAuHasard(graine(4))), FOND);
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < LARGEUR; x++) expect(cases[y * SCENE_DU_DUEL.largeur + COULISSES + x]).toBe(FOND.cases[y * LARGEUR + x]);
    }
  });
  it("pose le vainqueur debout et entier, tel que /gaulois le dessine", () => {
    const tenue = tenueAuHasard(graine(9));
    const cases = casesDuDuel(seul(tenue), seul(TENUE_DE_DEPART), FOND);
    const debout = casesDuGaulois(tenue);
    // La grille du vainqueur : colonne 6 de la bannière, ses semelles (rangée 62) sur le sol.
    const [ox, oy] = [COULISSES + 6, PIEDS - 62];
    debout.forEach((c, i) => {
      if (c) expect(cases[(oy + Math.floor(i / GAULOIS_LARGEUR)) * SCENE_DU_DUEL.largeur + ox + (i % GAULOIS_LARGEUR)]).toBe(c);
    });
  });
  it("met les étoiles au-dessus du vaincu", () => {
    const cases = casesDuDuel(seul(TENUE_DE_DEPART), seul(TENUE_DE_DEPART), FOND);
    expect(cases).toContain("#fff6d8");
  });
  it("tient avec chaque familier, d'un côté puis de l'autre, sans case vide", () => {
    for (const familier of FAMILIERS) {
      const pose = familierAPoser(familier);
      for (const [a, b] of [
        [{ tenue: TENUE_DE_DEPART, familier: pose }, seul(TENUE_DE_DEPART)],
        [seul(TENUE_DE_DEPART), { tenue: TENUE_DE_DEPART, familier: pose }],
      ] as const) {
        const cases = casesDuDuel(a, b, FOND);
        expect(cases.length, familier.id).toBe(SCENE_DU_DUEL.largeur * SCENE_DU_DUEL.hauteur);
        expect(cases.every((c) => HEX.test(c)), familier.id).toBe(true);
      }
    }
  });
  it("montre le familier du vainqueur dans les coulisses de gauche, celui du vaincu dans celles de droite", () => {
    const pose = familierAPoser(FAMILIERS.find((f) => f.id === "ecureuil-roux") ?? FAMILIERS[0]!);
    const sans = casesDuDuel(seul(TENUE_DE_DEPART), seul(TENUE_DE_DEPART), FOND);
    const change = (cases: string[], de: number, a: number) => cases.some((c, i) => i % SCENE_DU_DUEL.largeur >= de && i % SCENE_DU_DUEL.largeur < a && c !== sans[i]);
    const gauche = casesDuDuel({ tenue: TENUE_DE_DEPART, familier: pose }, seul(TENUE_DE_DEPART), FOND);
    const droite = casesDuDuel(seul(TENUE_DE_DEPART), { tenue: TENUE_DE_DEPART, familier: pose }, FOND);
    expect(change(gauche, 0, COULISSES)).toBe(true);
    expect(change(gauche, COULISSES + LARGEUR, SCENE_DU_DUEL.largeur)).toBe(false);
    expect(change(droite, COULISSES + LARGEUR, SCENE_DU_DUEL.largeur)).toBe(true);
    expect(change(droite, 0, COULISSES)).toBe(false);
  });
  it("garde l'encre des images du robot pour les coulisses", () => {
    const cases = casesDuDuel(seul(TENUE_DE_DEPART), seul(TENUE_DE_DEPART), FOND);
    expect(cases[0]).toBe(COULISSE.mur2);
    expect(cases[SCENE_DU_DUEL.largeur * (SCENE_DU_DUEL.hauteur - 1)]).toMatch(new RegExp(`^(${COULISSE.sol}|${COULISSE.joint})$`));
  });
});

describe("le fond du duel", () => {
  it("est la bannière du vaincu, ou sans elle la place du village au moment du duel", () => {
    const le = new Date("2026-11-22T20:05:00.000Z");
    expect(fondDuDuel(BANNIERE, le)).toEqual(FOND);
    expect(fondDuDuel(null, le)).toEqual(decorDe(LIEU_DE_SECOURS, momentDeParis(le)));
    expect(fondDuDuel("inconnue", le)).toEqual(decorDe(LIEU_DE_SECOURS, momentDeParis(le)));
  });
});

/* ---------- L'image que poste le robot ---------- */

const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(NUMBER_SPACES, " ");
const victoire = (extra: Partial<VictoireEnDuel> = {}): VictoireEnDuel => ({
  id: 1,
  le: "2026-11-22T20:05:00.000Z",
  manches: 7,
  salle: 250,
  carte: { emplacement: "tete", objet: "casque-or" },
  lieu: BANNIERE,
  vainqueur: { pseudo: "Brennos", tenue: tenueAuHasard(graine(7)), familier: "ecureuil-roux" },
  vaincu: { pseudo: "Sucellos", tenue: tenueAuHasard(graine(21)), familier: "herisson-des-haies" },
  ...extra,
});

describe("les mots de l'image", () => {
  it("dit qui bat qui, et « un Gaulois » sans pseudo public", () => {
    expect(titreSurLImage(victoire())).toBe("Brennos bat Sucellos");
    expect(titreSurLImage(victoire({ vainqueur: { ...victoire().vainqueur, pseudo: null }, vaincu: { ...victoire().vaincu, pseudo: null } }))).toBe("Un Gaulois bat un Gaulois");
  });
  it("retire du pseudo ce que la police ne sait pas dessiner", () => {
    const draws = (char: string) => /[\p{L}\p{N}_ .-]/u.test(char);
    expect(nomSurLImage({ pseudo: `Brennos ${String.fromCodePoint(0x1f417)}` }, draws)).toBe("Brennos");
    expect(nomSurLImage({ pseudo: String.fromCodePoint(0x1f417) }, draws)).toBeNull();
  });
  it("date le duel à l'heure de Paris", () => {
    expect(dateDuDuel("2026-11-22T20:05:00.000Z")).toBe("Le 22 novembre 2026 à 21 h 05");
  });
});

describe("l'image d'une victoire en duel", () => {
  const root = process.cwd();
  const fonts = new GazetteFonts(root);
  const draws = (char: string) => fonts.draws(char, "strong");
  const cas: [string, VictoireEnDuel][] = [
    ["misé", victoire()],
    ["sans mise", victoire({ salle: null })],
    ["sans carte", victoire({ carte: null })],
    ["pseudos longs", victoire({ vainqueur: { ...victoire().vainqueur, pseudo: "W".repeat(32) }, vaincu: { ...victoire().vaincu, pseudo: "W".repeat(32) }, salle: 1000, manches: 99 })],
    ["sans bannière", victoire({ lieu: null, manches: 1, salle: 25 })],
    ["carte de base", victoire({ carte: { emplacement: "arme", objet: "gourdin" } })],
    ["carte inconnue", victoire({ carte: "inconnue" })],
  ];
  const cards = cas.map(([id, v]) => ({ id, v, card: duelCard(v, fonts.width, draws) }));

  it("est assez large pour Discord, et aucun texte ne sort de l'image ni n'est trop petit pour 550 pixels", () => {
    for (const { id, card } of cards) {
      expect([card.width, card.height]).toEqual([WIDTH, HEIGHT]);
      expect(card.width / card.height, id).toBeGreaterThanOrEqual(1.55);
      for (const t of card.texts as CardText[]) {
        const width = drawnWidth(t, fonts.width);
        const left = t.anchor === "end" ? t.x - width : t.anchor === "middle" ? t.x - width / 2 : t.x;
        expect(left, `${id} : ${t.text}`).toBeGreaterThanOrEqual(MARGIN - 0.5);
        expect(left + width, `${id} : ${t.text}`).toBeLessThanOrEqual(card.width - MARGIN + 0.5);
        // À 550 pixels de large, rien sous 9,6 pixels : la taille de l'invite des autres images du robot.
        expect(t.size, `${id} : ${t.text}`).toBeGreaterThanOrEqual(21);
      }
    }
  });
  it("ne coupe aucun texte des cas ordinaires", () => {
    for (const { id, card } of cards.filter((c) => c.id !== "pseudos longs")) {
      for (const t of card.texts) expect(t.text.endsWith("…"), `${id} : ${t.text}`).toBe(false);
    }
  });
  it("écrit les manches, la carte décisive et la salle, jamais un solde ni un gain", () => {
    const textes = (id: string) => cards.find((c) => c.id === id)!.card.texts.map((t) => plain(t.text));
    expect(textes("misé")).toEqual(expect.arrayContaining(["MANCHES", "7", "CARTE DÉCISIVE", "Casque d'or", "Légendaire, tête", "SALLE DES", "250", "statères"]));
    expect(textes("sans mise").some((t) => /statère|SALLE/.test(t))).toBe(false);
    expect(textes("sans carte")).toEqual(expect.arrayContaining(["FIN DU DUEL", "Tombé sans coup"]));
    expect(textes("sans bannière")).toContain("MANCHE");
    expect(textes("carte de base")).toEqual(expect.arrayContaining(["CARTE DÉCISIVE", "Gourdin", "De base, arme"]));
    // Une carte que ce code ne connaît pas : rien sur la fin du duel, plutôt qu'une cause inventée.
    expect(textes("carte inconnue").some((t) => /CARTE DÉCISIVE|FIN DU DUEL|Tombé/.test(t))).toBe(false);
    for (const { card } of cards) expect(card.texts.some((t) => /solde|gagn|gain|cagnotte|pot\b/i.test(t.text))).toBe(false);
  });
  it("pose la scène à 6 pixels par case d'un bord à l'autre, et la carte décisive dans sa vitrine", () => {
    for (const { id, card } of cards) {
      const [scene, ...autres] = card.dessins;
      expect(scene, id).toMatchObject({ x: MARGIN, y: SCENE_Y, echelle: ECHELLE_SCENE });
      expect(scene!.decor.largeur * ECHELLE_SCENE, id).toBe(WIDTH - 2 * MARGIN);
      expect(autres.length, id).toBe(id === "sans carte" || id === "carte inconnue" ? 0 : 1);
      const vitrine = card.rects.find((r) => r.cut === 12);
      if (autres[0] && vitrine) {
        const d = autres[0];
        expect(d.x).toBeGreaterThanOrEqual(vitrine.x);
        expect(d.y).toBeGreaterThanOrEqual(vitrine.y);
        expect(d.x + d.decor.largeur * d.echelle).toBeLessThanOrEqual(vitrine.x + vitrine.width);
        expect(d.y + d.decor.hauteur * d.echelle).toBeLessThanOrEqual(vitrine.y + vitrine.height);
      }
    }
  });
  it("se dessine en PNG de 1 200 sur 762", async () => {
    const png = await renderDuelCard(cards[0]!.card, fonts, root);
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 762]);
  });
});
