import { describe, expect, it } from "vitest";
import { ficheCard, ficheFacts, ficheImageAlt, type FicheFacts } from "../../src/lib/fiche-image";
import { cardSvg, type Measure } from "../../src/lib/gazette-image";
import { FLAMME, FLAMME_DOREE } from "../../src/lib/flamme-serie";
import { prestigeColor } from "../../src/lib/niveau";
import { TENUE_DE_DEPART } from "../../src/lib/gaulois";
import type { GauloisParJoueur } from "../../src/lib/gaulois-joueurs";
import { spriteRect } from "../../src/lib/gaulois-sprite";
import type { AccountLevel, StoredMember } from "../../src/lib/schemas";
import type { SerieEnCours } from "../../src/lib/serie-en-cours";

const member = (publicId: string, username: string | null, team: { wins: number; losses: number } | null): StoredMember => ({ role: "member", joinedAt: "2026-05-03T20:17:40.935Z", publicId, username, team });
const members = [member("a", "Alpha", { wins: 738, losses: 619 }), member("b", "Bravo", { wins: 900, losses: 100 }), member("c", "Charlie", { wins: 12, losses: 30 }), member("d", null, { wins: 5000, losses: 1 }), member("e", "Echo", null)];
/** Une largeur approximative : les tests ne chargent aucune police. */
const measure: Measure = (text, _font, size) => [...text].length * size * 0.6;
const plain = (s: string) => s.replace(/\u00a0/g, " ");
const LISTED = "2026-11-08T08:53:00.000Z";

describe("ficheFacts", () => {
  it("reprend la place et les chiffres de la liste des membres, et le palier", () => {
    expect(ficheFacts(members, members[0]!)).toEqual({ id: "a", username: "Alpha", rank: 3, ranked: 4, wins: 738, losses: 619, games: 1357, rate: (738 / 1357) * 100, tier: 700, nextTier: { wins: 900, missing: 162 }, niveau: null, serie: null, record: null });
  });
  it("n'a rien à dire d'un anonyme ni d'un membre sans stats", () => {
    expect(ficheFacts(members, members[3]!)).toBeNull();
    expect(ficheFacts(members, members[4]!)).toBeNull();
  });
});

describe("ficheCard", () => {
  const facts = ficheFacts(members, members[0]!)!;
  const card = ficheCard(facts, "GAL", "https://les-gaulois.github.io/", LISTED, measure);
  const words = card.texts.map((t) => plain(t.text));
  it("fait le format des aperçus de lien et écrit le pseudo, la place, les chiffres et la date", () => {
    expect([card.width, card.height]).toEqual([1200, 630]);
    expect(words).toContain("Alpha");
    expect(words).toContain("3e");
    expect(words).toContain("sur 4 membres, aux victoires sous le tag");
    expect(words).toContain("738");
    expect(words).toContain("619");
    expect(words).toContain("54,4 %");
    expect(words).toContain("700 victoires");
    expect(words).toContain("Prochain palier : 900 victoires, encore 162.");
    expect(words).toContain("les-gaulois.github.io/membres");
    expect(words.some((w) => w.includes("Liste officielle du 8 nov. 2026"))).toBe(true);
  });
  it("reste dans l'image : aucun texte ne dépasse", () => {
    for (const t of card.texts) {
      const width = measure(t.text, t.font, t.size);
      const left = t.anchor === "end" ? t.x - width : t.anchor === "middle" ? t.x - width / 2 : t.x;
      expect(left, t.text).toBeGreaterThanOrEqual(0);
      expect(left + width, t.text).toBeLessThanOrEqual(1200);
    }
  });
  it("dit « aucune partie » plutôt qu'une place, sans palier à venir inventé", () => {
    const none = ficheCard({ ...facts, games: 0, wins: 0, losses: 0, rate: null, tier: null, nextTier: null }, "GAL", "https://les-gaulois.github.io", LISTED, measure);
    const texts = none.texts.map((t) => plain(t.text));
    expect(texts).toContain("Aucune partie sous le tag");
    expect(texts).toContain("Pas encore");
    expect(texts.some((t) => t.startsWith("Prochain palier"))).toBe(false);
  });
  it("raccourcit un pseudo trop long au lieu de sortir du cadre", () => {
    const long = ficheCard({ ...facts, username: "Vercingétorix-le-grand-chef-des-Arvernes-et-de-toute-la-Gaule" }, "GAL", "https://les-gaulois.github.io", LISTED, measure);
    const title = long.texts.find((t) => t.text.endsWith("…"))!;
    expect(title.font).toBe("strong");
    expect(title.size).toBe(32);
  });
});

describe("ficheImageAlt", () => {
  it("décrit l'image en une phrase, avec la date de la liste", () => {
    expect(plain(ficheImageAlt(ficheFacts(members, members[0]!)!, "GAL", LISTED))).toBe("Alpha, membre de [GAL] : 3e sur 4 membres aux victoires sous le tag. 738 victoires, 619 défaites, 54,4 %, palier des 700 victoires. Liste officielle du 8 nov. 2026.");
  });
  it("ne lit pas des zéros ni un tiret pour un membre sans partie", () => {
    const facts = { ...ficheFacts(members, members[0]!)!, games: 0, wins: 0, losses: 0, rate: null, tier: null, nextTier: null };
    expect(plain(ficheImageAlt(facts, "GAL", LISTED))).toBe("Alpha, membre de [GAL] : aucune partie sous le tag, pas encore de palier. Liste officielle du 8 nov. 2026.");
  });
});

// La flamme de série et l'emblème de niveau (15 novembre 2026, conception de Claude Fable 5.2) : huit cas, selon qu'il y a
// un Gaulois, un niveau visible et une série d'au moins 5 victoires d'affilée.
describe("la flamme de série et l'emblème de niveau sur la fiche", () => {
  const base = ficheFacts(members, members[0]!)!;
  const NIVEAU: AccountLevel = { level: 62, prestige: 1, legend: false };
  const serie = (victoires: number, auMoins = false): SerieEnCours => ({ victoires, auMoins, depuis: "2026-09-18T19:00:00.000Z", jusqua: "2026-09-21T20:00:00.000Z", releve: LISTED });
  const avecGaulois: GauloisParJoueur = new Map([["a", TENUE_DE_DEPART]]);
  const carte = (niveau: AccountLevel | null, s: SerieEnCours | null, gaulois?: GauloisParJoueur) => ficheCard({ ...base, niveau, serie: s }, "GAL", "https://les-gaulois.github.io", LISTED, measure, gaulois);
  const boite = (t: { text: string; font: Parameters<Measure>[1]; size: number; x: number; y: number; anchor?: "start" | "middle" | "end" }) => {
    const w = measure(t.text, t.font, t.size);
    const left = t.anchor === "end" ? t.x - w : t.anchor === "middle" ? t.x - w / 2 : t.x;
    return { left, right: left + w, top: t.y - t.size, bottom: t.y + t.size * 0.25 };
  };

  it("sans niveau ni série, l'image est celle d'avant, avec ou sans Gaulois", () => {
    // Les faits tels que les donnaient les appels d'avant le 15 novembre 2026 : sans ces deux champs.
    const ancien: FicheFacts = { ...base };
    delete ancien.niveau;
    delete ancien.serie;
    for (const g of [undefined, avecGaulois]) {
      const avant = ficheCard(ancien, "GAL", "https://les-gaulois.github.io", LISTED, measure, g);
      expect(carte(null, null, g)).toEqual(avant);
      expect(avant.emblemes).toBeUndefined();
      expect(avant.dessins).toBeUndefined();
    }
  });

  it("sous 5 victoires d'affilée, aucune flamme ni aucun mot de série", () => {
    const c = carte(null, serie(4));
    expect(c.dessins).toBeUndefined();
    expect(c.texts.some((t) => t.text.includes("affilée"))).toBe(false);
  });

  for (const g of [undefined, avecGaulois]) {
    for (const niveau of [null, NIVEAU]) {
      for (const s of [null, serie(7)]) {
        const nom = `${g ? "avec" : "sans"} Gaulois, ${niveau ? "avec" : "sans"} niveau, ${s ? "avec" : "sans"} série`;
        it(`${nom} : tout tient dans l'image, rien ne se chevauche`, () => {
          const c = carte(niveau, s, g);
          const boites = c.texts.map((t) => ({ t: t.text, ...boite(t) }));
          for (const b of boites) {
            expect(b.left, b.t).toBeGreaterThanOrEqual(0);
            expect(b.right, b.t).toBeLessThanOrEqual(1200);
          }
          // Les textes de la flamme et de l'emblème ne touchent aucun autre texte (ceux d'avant ont leurs propres tests).
          const nouveaux = new Set(["62", "Prestige 1 · Niveau 62", "tout le jeu", "© OpenFront and Contributors", "7 victoires d'affilée", "sous le tag, du 18 au 21 sept. 2026"]);
          for (let i = 0; i < boites.length; i++)
            for (let j = i + 1; j < boites.length; j++) {
              const a = boites[i]!;
              const b = boites[j]!;
              if (!nouveaux.has(plain(a.t)) && !nouveaux.has(plain(b.t))) continue;
              const touche = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
              expect(touche, `« ${a.t} » et « ${b.t} »`).toBe(false);
            }
          // La flamme et l'emblème ne touchent ni un texte (sauf le chiffre du niveau, posé dans l'emblème), ni le Gaulois.
          const formes = [
            ...(c.dessins ?? []).map((d) => ({ nom: "flamme", left: d.x, top: d.y, right: d.x + d.decor.largeur * d.echelle, bottom: d.y + d.decor.hauteur * d.echelle })),
            ...(c.emblemes ?? []).map((e) => ({ nom: "emblème", left: e.x, top: e.y, right: e.x + e.size, bottom: e.y + e.size })),
          ];
          for (const f of formes) {
            expect(f.left).toBeGreaterThanOrEqual(0);
            expect(f.right).toBeLessThanOrEqual(1200);
            expect(f.bottom).toBeLessThanOrEqual(630);
            for (const b of boites) {
              if (f.nom === "emblème" && b.t === String(NIVEAU.level)) continue;
              const touche = f.left < b.right && b.left < f.right && f.top < b.bottom && b.top < f.bottom;
              expect(touche, `${f.nom} et « ${b.t} »`).toBe(false);
            }
            for (const sprite of c.gaulois ?? []) {
              const r = spriteRect(sprite);
              const touche = f.left < r.x + r.width && r.x < f.right && f.top < r.y + r.height && r.y < f.bottom;
              expect(touche, `${f.nom} et le Gaulois`).toBe(false);
            }
          }
          expect(c.emblemes?.length ?? 0).toBe(niveau ? 1 : 0);
          expect(c.dessins?.length ?? 0).toBe(s ? 1 : 0);
          const mots = c.texts.map((t) => plain(t.text));
          if (niveau) expect(mots).toEqual(expect.arrayContaining(["62", "Prestige 1 · Niveau 62", "tout le jeu", "© OpenFront and Contributors"]));
          if (s) expect(mots).toEqual(expect.arrayContaining(["7 victoires d'affilée", "sous le tag, du 18 au 21 sept. 2026"]));
        });
      }
    }
  }

  it("écrit « au moins » quand le chiffre est un minimum, et un niveau à trois chiffres plus petit", () => {
    const c = carte({ level: 100, prestige: 10, legend: true }, serie(12, true), avecGaulois);
    const mots = c.texts.map((t) => plain(t.text));
    expect(mots).toContain("au moins 12 victoires d'affilée");
    expect(mots).toContain("Légende");
    expect(c.texts.find((t) => t.text === "100")?.size).toBe(27);
  });

  it("garde la place du Gaulois sous l'emblème, et arrête un long pseudo avant la colonne de l'emblème", () => {
    const c = carte(NIVEAU, serie(7), avecGaulois);
    expect(spriteRect(c.gaulois![0]!).y).toBeGreaterThanOrEqual(190);
    const long = ficheCard({ ...base, niveau: NIVEAU, username: "Vercingétorix-le-grand-chef-des-Arvernes-et-de-toute-la-Gaule" }, "GAL", "https://les-gaulois.github.io", LISTED, measure);
    const titre = long.texts.find((t) => t.text.endsWith("…"))!;
    expect(boite(titre).right).toBeLessThanOrEqual(1200 - 36 - 280);
  });

  it("le dit au lecteur d'écran, la série puis le compte, deux phrases à part", () => {
    expect(plain(ficheImageAlt({ ...base, niveau: NIVEAU, serie: serie(7) }, "GAL", LISTED))).toBe(
      "Alpha, membre de [GAL] : 3e sur 4 membres aux victoires sous le tag. 738 victoires, 619 défaites, 54,4 %, palier des 700 victoires. Série en cours : 7 victoires d'affilée sous le tag, du 18 au 21 sept. 2026, sans défaite depuis. Compte OpenFront, tout le jeu : Prestige 1 · Niveau 62. Liste officielle du 8 nov. 2026.",
    );
    expect(plain(ficheImageAlt({ ...base, niveau: null, serie: serie(4) }, "GAL", LISTED))).not.toContain("Série");
  });
  it("dore la flamme d'un record battu, et le dit en mots sur l'image et au lecteur d'écran", () => {
    for (const g of [undefined, avecGaulois]) {
      const normale = carte(NIVEAU, serie(7), g);
      const doree = ficheCard({ ...base, niveau: NIVEAU, serie: serie(7), record: { luesDepuis: "2026-04-10T18:00:00.000Z" } }, "GAL", "https://les-gaulois.github.io", LISTED, measure, g);
      expect(normale.dessins![0]!.decor).toBe(FLAMME);
      expect(doree.dessins![0]!.decor).toBe(FLAMME_DOREE);
      // Même place, même taille : seule la couleur et un mot changent.
      expect({ ...doree.dessins![0]!, decor: null }).toEqual({ ...normale.dessins![0]!, decor: null });
      const mots = doree.texts.map((t) => plain(t.text));
      expect(mots).toContain("7 victoires d'affilée");
      expect(mots).toContain("record sous le tag, du 18 au 21 sept. 2026");
    }
    // La plus longue deuxième ligne tient dans ses 480 px, sans être coupée.
    const longue = ficheCard({ ...base, serie: { ...serie(19), depuis: "2026-09-28T19:00:00.000Z", jusqua: "2026-11-14T20:00:00.000Z" }, record: { luesDepuis: "2026-04-10T18:00:00.000Z" } }, "GAL", "https://les-gaulois.github.io", LISTED, measure);
    const ligne = longue.texts.find((t) => t.text.startsWith("record "))!;
    expect(plain(ligne.text)).toBe("record sous le tag, du 28 sept. au 14 nov. 2026");
    expect(measure(ligne.text, ligne.font, ligne.size)).toBeLessThanOrEqual(480);
    expect(plain(ficheImageAlt({ ...base, serie: serie(7), record: { luesDepuis: "2026-04-10T18:00:00.000Z" } }, "GAL", LISTED))).toContain("sans défaite depuis. C'est son record, sur ses parties lues depuis le 10 avr. 2026. Liste officielle");
    expect(plain(ficheImageAlt({ ...base, serie: serie(7), record: null }, "GAL", LISTED))).not.toContain("record");
  });

  it("dessine l'emblème aux couleurs du prestige, ses crans éteints en filet, et la flamme case par case, nette", () => {
    const c = carte(NIVEAU, serie(7), avecGaulois);
    const svg = cardSvg(c, { paths: () => "" }, { table: false });
    // La case, bordée de la couleur du prestige 1 ; un cran allumé, neuf éteints.
    expect(svg).toContain(`stroke="${prestigeColor(NIVEAU)}" stroke-width="4"`);
    expect(svg.match(/stroke-opacity="0.45" stroke-width="8"/g)).toHaveLength(9);
    expect(svg.match(new RegExp(`stroke="${prestigeColor(NIVEAU)}" stroke-width="8"`, "g"))).toHaveLength(1);
    // La flamme : chaque case pleine couverte une fois, à 6 px, à sa place, sans lissage.
    const dessin = c.dessins![0]!;
    const groupe = svg.match(/<g shape-rendering="crispEdges">(.*?)<\/g>/)![1]!;
    const rects = [...groupe.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#[0-9a-f]{6})"\/>/gi)].map((m) => m.slice(1, 5).map(Number));
    const aire = rects.reduce((n, [, , w, h]) => n + w! * h!, 0);
    expect(aire).toBe(FLAMME.cases.filter((x) => x).length * 36);
    for (const [x, y, , h] of rects) {
      expect((x! - dessin.x) % 6).toBe(0);
      expect((y! - dessin.y) % 6).toBe(0);
      expect(h).toBe(6);
    }
  });
});
