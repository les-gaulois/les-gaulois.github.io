import { describe, expect, it } from "vitest";
import { insignesParPseudo, porteursDesPseudos, pseudoDuJournal } from "../../src/lib/rejeu/insignes";
import { FLAMME_DES, type RecordPersonnel, type SerieEnCours } from "../../src/lib/serie-en-cours";

const serie = (victoires: number, auMoins = false): SerieEnCours => ({ victoires, auMoins, depuis: "2026-11-15T10:00:00.000Z", jusqua: "2026-11-16T10:00:00.000Z", releve: "2026-11-17T08:00:00.000Z" });
const record = (doree: boolean) => ({ victoires: 9, auMoins: false, debut: "2026-11-15T10:00:00.000Z", fin: "2026-11-16T10:00:00.000Z", luesDepuis: "2026-11-01T10:00:00.000Z", doree }) as RecordPersonnel;
const compte = { level: 59, prestige: 5, legend: false };

describe("les insignes du fil « Entre Gaulois »", () => {
  const membres = [
    { username: "Judom FR", publicId: "a", account: compte },
    { username: "Sans  niveau ", publicId: "b", account: null },
    { username: "Rien", publicId: "c" },
    { username: "Double", publicId: "d", account: compte },
    { username: "Double", publicId: "e", account: compte },
    { username: null, publicId: null, account: compte },
  ];
  const series = new Map([["a", serie(FLAMME_DES - 1)], ["b", serie(7, true)], ["d", serie(12)]]);
  const records = new Map([["b", record(true)]]);
  const insignes = insignesParPseudo(membres, series, records);

  it("donne le niveau du compte, et la flamme seulement à partir de 5 victoires d'affilée", () => {
    expect(insignes["Judom FR"]).toEqual({ compte, flamme: null });
    expect(insignes["Sans niveau"]).toEqual({ compte: null, flamme: { victoires: 7, auMoins: true, doree: true } });
  });
  it("ne donne rien à qui n'a ni niveau visible ni flamme, ni à un pseudo porté par deux membres, ni à un anonyme", () => {
    expect(Object.keys(insignes).sort()).toEqual(["Judom FR", "Sans niveau"]);
  });
  it("range les membres par le pseudo que le journal écrit", () => {
    expect(pseudoDuJournal("  Deux   mots ")).toBe("Deux mots");
    expect(pseudoDuJournal("x".repeat(60))).toHaveLength(40);
    expect(porteursDesPseudos(membres).get("Double")).toEqual(["d", "e"]);
  });
});
