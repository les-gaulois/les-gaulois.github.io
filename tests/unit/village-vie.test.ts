import { describe, expect, it } from "vitest";
import { TENUE_DE_DEPART } from "../../src/lib/gaulois";
import type { GauloisDeLaPlace } from "../../src/lib/village/contrat";
import { LIEUX, REPLIQUE_MAX, compteDuLieu, heureDeParis, ilFaitNuit, lieuDOuverture, lieuDuGaulois, lireReplique, phraseDuReleve, repartirLeVillage } from "../../src/lib/village/vie";

/** Le 13 novembre 2026 à Paris (heure d'hiver). */
const a = (heure: string) => new Date(`2026-11-13T${heure}:00+01:00`);
const ilYA = (maintenant: Date, minutes: number) => new Date(maintenant.getTime() - minutes * 60_000).toISOString();
const gaulois = (nom: string, faits: Partial<GauloisDeLaPlace> = {}): GauloisDeLaPlace => ({ nom, tenue: TENUE_DE_DEPART, moi: false, ...faits });

describe("où est un Gaulois", () => {
  const soir = a("21:50");

  it("se bat quand sa partie a commencé il y a moins de 45 minutes", () => {
    expect(lieuDuGaulois({ partie_le: ilYA(soir, 12) }, soir)).toEqual({ lieu: "bataille", raison: "Partie commencée à 21 h 38" });
    expect(lieuDuGaulois({ partie_le: ilYA(soir, 0) }, soir).lieu).toBe("bataille");
    expect(lieuDuGaulois({ partie_le: ilYA(soir, 44.9) }, soir).lieu).toBe("bataille");
  });

  it("fête à la taverne de 45 minutes à 3 heures après le début", () => {
    expect(lieuDuGaulois({ partie_le: ilYA(soir, 45) }, soir)).toEqual({ lieu: "taverne", raison: "Partie commencée à 21 h 05" });
    expect(lieuDuGaulois({ partie_le: ilYA(soir, 179) }, soir).lieu).toBe("taverne");
    expect(lieuDuGaulois({ partie_le: ilYA(soir, 180) }, soir).lieu).toBe("place");
  });

  it("est en salle de réunion quand il est en vocal, la partie passant d'abord", () => {
    expect(lieuDuGaulois({ vocal: true }, soir)).toEqual({ lieu: "reunion", raison: "En vocal sur Discord" });
    expect(lieuDuGaulois({ vocal: true, partie_le: ilYA(soir, 10) }, soir).lieu).toBe("bataille");
    expect(lieuDuGaulois({ vocal: true, partie_le: ilYA(soir, 400) }, soir).lieu).toBe("reunion");
    expect(lieuDuGaulois({ vocal: true }, a("03:00")).lieu).toBe("reunion");
  });

  it("ne croit pas un vocal relevé il y a 3 heures ou plus", () => {
    expect(lieuDuGaulois({ vocal: true }, soir, ilYA(soir, 179)).lieu).toBe("reunion");
    expect(lieuDuGaulois({ vocal: true }, soir, ilYA(soir, 180)).lieu).toBe("place");
    expect(lieuDuGaulois({ vocal: true }, soir, "illisible").lieu).toBe("reunion");
    expect(lieuDuGaulois({ vocal: true }, soir, null).lieu).toBe("reunion");
  });

  it("dort de 23 heures à 7 heures, heure de Paris, et se promène le reste du temps", () => {
    expect(lieuDuGaulois({}, a("22:59"))).toEqual({ lieu: "place", raison: "Se promène" });
    expect(lieuDuGaulois({}, a("23:00"))).toEqual({ lieu: "maisons", raison: "Dort" });
    expect(lieuDuGaulois({}, a("06:59")).lieu).toBe("maisons");
    expect(lieuDuGaulois({}, a("07:00")).lieu).toBe("place");
    expect(ilFaitNuit(new Date("2026-07-01T21:30:00Z"))).toBe(true);
    expect(ilFaitNuit(new Date("2026-07-01T20:30:00Z"))).toBe(false);
  });

  it("compte pour rien un fait absent, vide, illisible ou daté du futur", () => {
    for (const faits of [{}, { partie_le: null, vocal: null }, { partie_le: "" }, { partie_le: "bientôt" }, { partie_le: ilYA(soir, -5) }, { vocal: false }]) {
      expect(lieuDuGaulois(faits, soir).lieu).toBe("place");
      expect(lieuDuGaulois(faits, a("02:00")).lieu).toBe("maisons");
    }
  });

  it("écrit l'heure de Paris en mots", () => {
    expect(heureDeParis(new Date("2026-11-13T20:38:00Z"))).toBe("21 h 38");
    expect(heureDeParis(new Date("2026-07-01T22:05:00Z"))).toBe("0 h 05");
  });
});

describe("tout le village", () => {
  const soir = a("21:50");
  const village = [
    gaulois("A"),
    gaulois("B", { partie_le: ilYA(soir, 10) }),
    gaulois("Moi", { moi: true, partie_le: ilYA(soir, 90) }),
    gaulois("C", { partie_le: ilYA(soir, 60) }),
    gaulois("D", { vocal: true }),
    gaulois("E"),
  ];

  it("range chacun dans un seul lieu, le sien d'abord, les autres dans l'ordre du serveur", () => {
    const lieux = repartirLeVillage(village, soir, ilYA(soir, 5));
    expect(lieux.place.map((h) => h.gaulois.nom)).toEqual(["A", "E"]);
    expect(lieux.bataille.map((h) => h.gaulois.nom)).toEqual(["B"]);
    expect(lieux.taverne.map((h) => h.gaulois.nom)).toEqual(["Moi", "C"]);
    expect(lieux.reunion.map((h) => h.gaulois.nom)).toEqual(["D"]);
    expect(lieux.maisons).toEqual([]);
    expect(LIEUX.reduce((n, lieu) => n + lieux[lieu].length, 0)).toBe(village.length);
    expect(lieux.taverne[0]).toMatchObject({ rang: 2, presence: { lieu: "taverne" } });
  });

  it("ouvre le lieu où se trouve son Gaulois, sinon le plus peuplé, sinon la place", () => {
    expect(lieuDOuverture(repartirLeVillage(village, soir))).toBe("taverne");
    expect(lieuDOuverture(repartirLeVillage([gaulois("A", { vocal: true }), gaulois("B", { vocal: true }), gaulois("C")], soir))).toBe("reunion");
    expect(lieuDOuverture(repartirLeVillage([gaulois("A"), gaulois("B", { vocal: true })], soir))).toBe("place");
    expect(lieuDOuverture(repartirLeVillage([], soir))).toBe("place");
    expect(lieuDOuverture(repartirLeVillage([gaulois("A"), gaulois("B")], a("01:00")))).toBe("maisons");
  });

  it("vit au seul rythme de l'heure quand aucun fait n'est connu", () => {
    const sansFait = [gaulois("A"), gaulois("B"), gaulois("C", { moi: true })];
    expect(repartirLeVillage(sansFait, a("15:00")).place).toHaveLength(3);
    expect(repartirLeVillage(sansFait, a("23:30")).maisons).toHaveLength(3);
  });
});

describe("les mots", () => {
  it("compte un lieu en une phrase", () => {
    expect(compteDuLieu("taverne", 3)).toBe("À la taverne : 3");
    expect(compteDuLieu("place", 12)).toBe("Sur la place : 12");
    expect(compteDuLieu("bataille", 1)).toBe("Au champ de bataille : 1");
  });

  it("garde une réplique en texte brut, resserrée, coupée à 90 signes", () => {
    expect(lireReplique("  Belle   partie\n les amis ")).toBe("Belle partie les amis");
    expect(lireReplique("<b>gras</b>")).toBe("<b>gras</b>");
    expect(lireReplique("")).toBeNull();
    expect(lireReplique("   ")).toBeNull();
    expect(lireReplique(null)).toBeNull();
    expect(lireReplique(42)).toBeNull();
    const longue = lireReplique("a".repeat(200))!;
    expect(Array.from(longue)).toHaveLength(REPLIQUE_MAX);
    expect(longue.endsWith("…")).toBe(true);
    expect(lireReplique("é".repeat(REPLIQUE_MAX))).toBe("é".repeat(REPLIQUE_MAX));
  });

  it("date le relevé une fois, à l'heure de Paris, ou ne dit rien", () => {
    expect(phraseDuReleve("2026-11-13T20:53:00Z")).toBe("Relevé du 13 nov. à 21 h 53");
    expect(phraseDuReleve("2026-12-01T07:05:00Z")).toBe("Relevé du 1er déc. à 8 h 05");
    expect(phraseDuReleve(null)).toBeNull();
    expect(phraseDuReleve(undefined)).toBeNull();
    expect(phraseDuReleve("jamais")).toBeNull();
  });
});
