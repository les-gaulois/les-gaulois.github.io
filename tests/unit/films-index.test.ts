import { describe, expect, it } from "vitest";
import { BUDGET_FILMS_OCTETS, ESSAIS_MAX, indexVide, lireIndex, nomDuFilm, noterEchec, noterFilm, partiesAFilmer, rangerLesFilms, type IndexDesFilms } from "../../src/lib/rejeu/films-index";

const NOW = new Date("2026-11-15T12:00:00Z");
const s = (gameId: string, gameStart: string) => ({ gameId, gameStart });

describe("les parties à filmer", () => {
  it("prend celles des sept derniers jours sans film, la plus récente d'abord, une fois chacune", () => {
    const sessions = [s("ancienne", "2026-11-07T11:00:00.000Z"), s("hier", "2026-11-14T20:00:00.000Z"), s("matin", "2026-11-15T09:00:00.000Z"), s("hier", "2026-11-14T20:00:00.000Z"), s("faite", "2026-11-15T08:00:00.000Z")];
    const index = noterFilm(indexVide(), "faite", "2026-11-15T08:00:00.000Z", 1000);
    expect(partiesAFilmer(sessions, index, NOW).map((x) => x.gameId)).toEqual(["matin", "hier"]);
  });
  it("laisse les parties ratées pour de bon, ou trop souvent", () => {
    let index = noterEchec(indexVide(), "fichue", "2026-11-15T08:00:00.000Z", "fiche inutilisable", true);
    for (let k = 0; k < ESSAIS_MAX; k++) index = noterEchec(index, "têtue", "2026-11-15T07:00:00.000Z", "le moteur s'arrête", false);
    index = noterEchec(index, "encore", "2026-11-15T06:00:00.000Z", "le moteur s'arrête", false);
    const sessions = [s("fichue", "2026-11-15T08:00:00.000Z"), s("tetue", "2026-11-15T07:00:00.000Z"), s("encore", "2026-11-15T06:00:00.000Z")];
    expect(index.ratees.find((r) => r.partie === "têtue")?.essais).toBe(ESSAIS_MAX);
    expect(partiesAFilmer(sessions, index, NOW).map((x) => x.gameId)).toEqual(["tetue", "encore"]);
  });
  it("ne filme pas, budget plein, une partie plus ancienne que le plus ancien film gardé", () => {
    const index: IndexDesFilms = { format: 2, films: [{ partie: "gros", debut: "2026-11-14T00:00:00.000Z", octets: 1_900_000 }], ratees: [], passage: null };
    for (let k = 0; k < Math.ceil(BUDGET_FILMS_OCTETS / 1_900_000); k++) index.films.push({ partie: `f${k}`, debut: "2026-11-15T00:00:00.000Z", octets: 1_900_000 });
    const sessions = [s("vieille", "2026-11-13T00:00:00.000Z"), s("neuve", "2026-11-15T10:00:00.000Z")];
    expect(partiesAFilmer(sessions, index, NOW).map((x) => x.gameId)).toEqual(["neuve"]);
  });
  it("écarte un identifiant ou une date étranges", () => {
    expect(partiesAFilmer([s("../x", "2026-11-15T09:00:00.000Z"), s("ok", "hier")], indexVide(), NOW)).toEqual([]);
    expect(nomDuFilm("../x")).toBeNull();
    expect(nomDuFilm("cghZxSstUC")).toBe("cghZxSstUC.film");
  });
});

describe("ce que le cache garde", () => {
  it("garde les plus récents dans le budget, retire les trop anciens et ce qui dépasse", () => {
    const index: IndexDesFilms = {
      format: 2,
      films: [
        { partie: "a", debut: "2026-11-15T10:00:00.000Z", octets: BUDGET_FILMS_OCTETS - 10 },
        { partie: "b", debut: "2026-11-15T09:00:00.000Z", octets: 100 },
        { partie: "c", debut: "2026-11-15T08:00:00.000Z", octets: 5 },
        { partie: "d", debut: "2026-11-01T08:00:00.000Z", octets: 1 },
      ],
      ratees: [
        { partie: "x", debut: "2026-11-01T08:00:00.000Z", raison: "?", essais: 1, definitive: true },
        { partie: "y", debut: "2026-11-15T08:00:00.000Z", raison: "?", essais: 1, definitive: true },
      ],
      passage: "2026-11-15T11:00:00.000Z",
    };
    const { index: garde, retires } = rangerLesFilms(index, NOW);
    expect(garde.films.map((f) => f.partie)).toEqual(["a", "c"]);
    expect(retires.sort()).toEqual(["b", "d"]);
    // La date du dernier passage du robot reste : c'est elle que la page montre.
    expect(garde.passage).toBe("2026-11-15T11:00:00.000Z");
    expect(garde.ratees.map((r) => r.partie)).toEqual(["y"]);
  });
  it("un film fait efface l'échec de sa partie", () => {
    const index = noterFilm(noterEchec(indexVide(), "p", "2026-11-15T08:00:00.000Z", "?", false), "p", "2026-11-15T08:00:00.000Z", 10);
    expect(index.ratees).toEqual([]);
    expect(index.films).toEqual([{ partie: "p", debut: "2026-11-15T08:00:00.000Z", octets: 10 }]);
  });
  it("repart d'un index vide s'il est absent ou illisible", () => {
    expect(lireIndex(null)).toEqual(indexVide());
    expect(lireIndex("{")).toEqual(indexVide());
    expect(lireIndex(JSON.stringify({ format: 3 }))).toEqual(indexVide());
    // Un index écrit avant la date des passages se relit, sans date.
    expect(lireIndex(JSON.stringify({ format: 2, films: [], ratees: [] })).passage).toBeNull();
    // Un index des films de la version 1 repart de zéro : ses films se refont avec les noms et les unités.
    const v1 = { format: 1, films: [{ partie: "a", debut: "2026-11-15T08:00:00.000Z", octets: 1 }], ratees: [{ partie: "b", debut: "2026-11-15T08:00:00.000Z", raison: "partie trop longue à rejouer", essais: 1, definitive: true }, { partie: "c", debut: "2026-11-15T08:00:00.000Z", raison: "?", essais: 1, definitive: false }], passage: "2026-11-15T12:00:00.000Z" };
    // … en gardant ses échecs pour de bon et la date de son dernier passage.
    expect(lireIndex(JSON.stringify(v1))).toEqual({ ...indexVide(), ratees: [v1.ratees[0]], passage: "2026-11-15T12:00:00.000Z" });
  });
});
