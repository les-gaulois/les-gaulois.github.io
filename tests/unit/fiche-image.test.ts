import { describe, expect, it } from "vitest";
import { ficheCard, ficheFacts, ficheImageAlt } from "../../src/lib/fiche-image";
import type { Measure } from "../../src/lib/gazette-image";
import type { StoredMember } from "../../src/lib/schemas";

const member = (publicId: string, username: string | null, team: { wins: number; losses: number } | null): StoredMember => ({ role: "member", joinedAt: "2026-05-03T20:17:40.935Z", publicId, username, team });
const members = [member("a", "Alpha", { wins: 738, losses: 619 }), member("b", "Bravo", { wins: 900, losses: 100 }), member("c", "Charlie", { wins: 12, losses: 30 }), member("d", null, { wins: 5000, losses: 1 }), member("e", "Echo", null)];
/** Une largeur approximative : les tests ne chargent aucune police. */
const measure: Measure = (text, _font, size) => [...text].length * size * 0.6;
const plain = (s: string) => s.replace(/\u00a0/g, " ");
const LISTED = "2026-11-08T08:53:00.000Z";

describe("ficheFacts", () => {
  it("reprend la place et les chiffres de la liste des membres, et le palier", () => {
    expect(ficheFacts(members, members[0]!)).toEqual({ username: "Alpha", rank: 3, ranked: 4, wins: 738, losses: 619, games: 1357, rate: (738 / 1357) * 100, tier: 500, nextTier: { wins: 1000, missing: 262 } });
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
    expect(words).toContain("500 victoires");
    expect(words).toContain("Prochain palier : 1 000 victoires, encore 262.");
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
    expect(plain(ficheImageAlt(ficheFacts(members, members[0]!)!, "GAL", LISTED))).toBe("Alpha, membre de [GAL] : 3e sur 4 membres aux victoires sous le tag. 738 victoires, 619 défaites, 54,4 %, palier des 500 victoires. Liste officielle du 8 nov. 2026.");
  });
  it("ne lit pas des zéros ni un tiret pour un membre sans partie", () => {
    const facts = { ...ficheFacts(members, members[0]!)!, games: 0, wins: 0, losses: 0, rate: null, tier: null, nextTier: null };
    expect(plain(ficheImageAlt(facts, "GAL", LISTED))).toBe("Alpha, membre de [GAL] : aucune partie sous le tag, pas encore de palier. Liste officielle du 8 nov. 2026.");
  });
});
