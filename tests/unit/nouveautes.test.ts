import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fmtLongDay } from "../../src/lib/format";
import { KIND_LABELS, latestNews, newsDays, newsDot, newsMarker, NOUVEAUTES_FIRST, splitDays, typo } from "../../src/lib/nouveautes";
import { NOUVEAUTE_KINDS, Nouveautes, type Nouveaute } from "../../src/lib/schemas";

const entry = (date: string, title: string, over: Partial<Nouveaute> = {}): Nouveaute => ({ date, kind: "nouveau", title, body: "Ce qui change.", ...over });
const NBSP = String.fromCharCode(0xa0);
// L'espace fine (U+202F), absente de nos polices.
const THIN = String.fromCharCode(0x202f);
const titles = (entries: Nouveaute[]) => entries.map((e) => e.title);

describe("newsDays", () => {
  it("range par jour, du plus récent au plus ancien, sans changer l'ordre d'une journée", () => {
    const days = newsDays([entry("2026-11-07", "b"), entry("2026-11-08", "a1"), entry("2026-11-05", "c"), entry("2026-11-08", "a2"), entry("2026-11-07", "b2")]);
    expect(days.map((d) => [d.date, titles(d.entries)])).toEqual([
      ["2026-11-08", ["a1", "a2"]],
      ["2026-11-07", ["b", "b2"]],
      ["2026-11-05", ["c"]],
    ]);
  });
  it("sans entrée, ne crée aucun jour", () => {
    expect(newsDays([])).toEqual([]);
  });
});

describe("splitDays", () => {
  const days = newsDays([
    ...Array.from({ length: 3 }, (_, i) => entry("2026-11-08", `a${i}`)),
    ...Array.from({ length: 4 }, (_, i) => entry("2026-11-07", `b${i}`)),
    ...Array.from({ length: 2 }, (_, i) => entry("2026-11-06", `c${i}`)),
    entry("2026-11-05", "d"),
  ]);
  it("montre des journées entières jusqu'au seuil, et replie les plus anciennes", () => {
    const { shown, folded } = splitDays(days, 6);
    expect(shown.map((d) => d.date)).toEqual(["2026-11-08", "2026-11-07"]);
    expect(folded.map((d) => d.date)).toEqual(["2026-11-06", "2026-11-05"]);
  });
  it("ne coupe jamais une journée, même longue", () => {
    expect(splitDays(days, 2).shown.map((d) => d.date)).toEqual(["2026-11-08"]);
  });
  it("montre tout quand il y a peu d'entrées", () => {
    expect(splitDays(days, 50)).toEqual({ shown: days, folded: [] });
    expect(splitDays([], NOUVEAUTES_FIRST)).toEqual({ shown: [], folded: [] });
  });
});

describe("latestNews", () => {
  it("donne les dernières mises à jour, la plus récente d'abord", () => {
    const entries = [entry("2026-11-06", "vieille"), entry("2026-11-08", "récente"), entry("2026-11-07", "hier"), entry("2026-11-08", "récente 2")];
    expect(titles(latestNews(entries, 3))).toEqual(["récente", "récente 2", "hier"]);
    expect(latestNews([], 3)).toEqual([]);
  });
});

describe("newsMarker", () => {
  const entries = [entry("2026-11-08", "a"), entry("2026-11-08", "b"), entry("2026-11-07", "c")];
  it("donne le jour de la dernière mise à jour et le nombre d'entrées de ce jour", () => {
    expect(newsMarker(entries)).toBe("2026-11-08/2");
  });
  it("change quand une entrée paraît en tête, le même jour ou un autre", () => {
    expect(newsMarker([entry("2026-11-08", "nouvelle"), ...entries])).toBe("2026-11-08/3");
    expect(newsMarker([entry("2026-11-09", "nouvelle"), ...entries])).toBe("2026-11-09/1");
  });
  it("ne change pas quand on corrige le texte d'une entrée", () => {
    expect(newsMarker(entries.map((e) => ({ ...e, title: `${e.title} corrigé`, body: "Autre texte." })))).toBe(newsMarker(entries));
  });
  it("vaut null sans entrée", () => {
    expect(newsMarker([])).toBeNull();
  });
});

describe("newsDot", () => {
  it("à la première visite, retient la marque sans allumer le point : rien n'est nouveau pour le visiteur", () => {
    expect(newsDot(null, "2026-11-08/2")).toEqual({ dot: false, remember: true });
  });
  it("allume le point quand une mise à jour est parue depuis la marque retenue", () => {
    expect(newsDot("2026-11-08/1", "2026-11-08/2")).toEqual({ dot: true, remember: false });
    expect(newsDot("2026-11-07/4", "2026-11-08/1")).toEqual({ dot: true, remember: false });
  });
  it("reste éteint quand rien n'a changé", () => {
    expect(newsDot("2026-11-08/2", "2026-11-08/2")).toEqual({ dot: false, remember: false });
  });
  it("sans nouveautés publiées, ne fait rien", () => {
    expect(newsDot(null, null)).toEqual({ dot: false, remember: false });
    expect(newsDot("2026-11-08/2", null)).toEqual({ dot: false, remember: false });
  });
});

describe("typo", () => {
  it("garde les milliers ensemble, sans toucher aux petits nombres ni aux dates", () => {
    expect(typo("100, 250, 1 000, 2 500 ou 5 000 victoires")).toBe(`100, 250, 1${NBSP}000, 2${NBSP}500 ou 5${NBSP}000 victoires`);
    expect(typo("« 121 976 » et 1 200 000")).toBe(`«${NBSP}121${NBSP}976${NBSP}» et 1${NBSP}200${NBSP}000`);
    expect(typo("le 9 novembre, les 30 derniers jours, 11 chapitres")).toBe("le 9 novembre, les 30 derniers jours, 11 chapitres");
  });
  it("colle les guillemets et la ponctuation haute à leur voisin", () => {
    expect(typo("Le bouton « Nouveautés » : voici ; vraiment ? oui !")).toBe(`Le bouton «${NBSP}Nouveautés${NBSP}»${NBSP}: voici${NBSP}; vraiment${NBSP}? oui${NBSP}!`);
  });
  it("n'écrit jamais l'espace fine, absente de nos polices", () => {
    expect(typo("1 000 « a » : b")).not.toContain(THIN);
  });
});

describe("fmtLongDay", () => {
  it("écrit le jour en toutes lettres, sans décalage de fuseau", () => {
    expect(fmtLongDay("2026-11-08")).toBe("8 novembre 2026");
    expect(fmtLongDay("2026-11-30")).toBe("30 novembre 2026");
  });
  it("écrit « 1er » pour le premier du mois, et seulement pour lui", () => {
    expect(fmtLongDay("2026-01-01")).toBe("1er janvier 2026");
    expect(fmtLongDay("2026-01-11")).toBe("11 janvier 2026");
    expect(fmtLongDay("2026-01-21")).toBe("21 janvier 2026");
  });
});

describe("KIND_LABELS", () => {
  it("nomme chaque sorte de mise à jour", () => {
    expect(Object.keys(KIND_LABELS).sort()).toEqual([...NOUVEAUTE_KINDS].sort());
  });
});

// Le journal publié : ce que lit le visiteur.
describe("content/nouveautes.json", () => {
  const parsed = Nouveautes.safeParse(JSON.parse(readFileSync("content/nouveautes.json", "utf8")));
  const entries = parsed.success ? parsed.data : [];

  it("respecte le format attendu et n'est pas vide", () => {
    expect(parsed.success, parsed.error?.message).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
  });
  it("va de la plus récente à la plus ancienne, sans date à venir", () => {
    // Le jour le plus avancé du monde : une entrée du jour, à Paris, passe toujours.
    const latestDay = new Date(Date.now() + 14 * 3_600_000).toISOString().slice(0, 10);
    for (const [i, e] of entries.entries()) {
      expect(Number.isNaN(Date.parse(`${e.date}T00:00:00.000Z`)), e.date).toBe(false);
      expect(e.date <= latestDay, e.title).toBe(true);
      if (i > 0) expect(e.date <= (entries[i - 1]?.date ?? ""), e.title).toBe(true);
    }
  });
  it("ne cite chaque mise à jour qu'une fois", () => {
    const keys = entries.map((e) => `${e.date} ${e.title}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("écrit des phrases courtes et complètes, sans emoji ni espace fine", () => {
    for (const e of entries) {
      expect(e.body.length, e.title).toBeLessThanOrEqual(200);
      expect(e.body.trim().endsWith("."), e.title).toBe(true);
      expect(e.title.endsWith("."), e.title).toBe(false);
      for (const text of [e.title, e.body, e.link?.label ?? ""]) {
        expect(/\p{Extended_Pictographic}/u.test(text), text).toBe(false);
        expect(text.includes(THIN), text).toBe(false);
      }
    }
  });
  it("ne mène que vers des pages du site qui existent", () => {
    for (const e of entries) {
      if (!e.link) continue;
      const path = e.link.href.split("#")[0] ?? "";
      const file = path.endsWith("/") ? `public${path}index.html` : `src/pages${path}.astro`;
      expect(existsSync(file), e.link.href).toBe(true);
    }
  });
});
