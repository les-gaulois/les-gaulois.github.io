import { describe, expect, it } from "vitest";
import { AGENDA_FILTERS_FROM, agendaDate, agendaHold, agendaMine, agendaSeries, agendaShown, agendaWhen, parisDaysUntil } from "../../src/lib/compte/qg-evenements";

const at = (iso: string) => Date.parse(iso);
// Le 14 novembre 2026 à 20:00 à Paris (heure d'hiver, UTC+1).
const NOW = at("2026-11-14T19:00:00Z");

describe("agendaDate", () => {
  it("donne le jour et l'heure de Paris", () => {
    expect(agendaDate("2026-11-14T20:00:00Z", NOW)).toEqual({ day: "sam. 14 nov.", time: "21:00" });
  });
  it("passe au lendemain à Paris quand il est encore la veille en temps universel", () => {
    expect(agendaDate("2026-11-14T23:30:00Z", NOW)).toEqual({ day: "dim. 15 nov.", time: "00:30" });
  });
  it("suit l'heure d'été", () => {
    expect(agendaDate("2026-07-01T19:00:00Z", at("2026-06-30T10:00:00Z"))).toEqual({ day: "mer. 1 juil.", time: "21:00" });
  });
  it("ajoute l'année quand ce n'est pas celle d'aujourd'hui", () => {
    expect(agendaDate("2027-01-02T20:00:00Z", NOW)).toEqual({ day: "sam. 2 janv. 2027", time: "21:00" });
  });
  it("compte l'année à Paris, pas en temps universel, le soir du 31 décembre", () => {
    // Le 31 décembre 2026 à 23:30 à Paris : le 1er janvier 2027 à 00:10 est de l'année suivante, et l'inverse le lendemain.
    expect(agendaDate("2026-12-31T23:10:00Z", at("2026-12-31T22:30:00Z"))).toEqual({ day: "ven. 1 janv. 2027", time: "00:10" });
    expect(agendaDate("2026-12-31T22:00:00Z", at("2026-12-31T23:30:00Z"))).toEqual({ day: "jeu. 31 déc. 2026", time: "23:00" });
  });
  it("garde la date d'un événement commencé", () => {
    expect(agendaDate("2026-11-14T18:00:00Z", NOW)).toEqual({ day: "sam. 14 nov.", time: "19:00" });
  });
  it("rend null pour une date illisible", () => {
    expect(agendaDate("bientôt", NOW)).toBeNull();
    expect(agendaDate("", NOW)).toBeNull();
    expect(agendaDate("2026-11-14T20:00:00Z", Number.NaN)).toBeNull();
  });
});

describe("parisDaysUntil", () => {
  it("compte les jours du calendrier de Paris", () => {
    expect(parisDaysUntil(at("2026-11-14T22:59:00Z"), NOW)).toBe(0);
    expect(parisDaysUntil(at("2026-11-14T23:00:00Z"), NOW)).toBe(1);
    expect(parisDaysUntil(at("2026-11-23T10:00:00Z"), NOW)).toBe(9);
    expect(parisDaysUntil(at("2026-11-13T10:00:00Z"), NOW)).toBe(-1);
  });
  it("ne se trompe pas au changement d'heure", () => {
    // Du samedi 28 mars 2026 à 23:30 (UTC+1) au lundi 30 mars à 00:30 (UTC+2) : deux jours de calendrier, 48 h moins une.
    expect(parisDaysUntil(at("2026-03-29T22:30:00Z"), at("2026-03-28T22:30:00Z"))).toBe(2);
    // Du samedi 24 octobre à 12:00 (UTC+2) au dimanche 25 à 23:30 (UTC+1).
    expect(parisDaysUntil(at("2026-10-25T22:30:00Z"), at("2026-10-24T10:00:00Z"))).toBe(1);
  });
  it("passe l'année", () => {
    expect(parisDaysUntil(at("2027-01-01T08:00:00Z"), at("2026-12-31T22:30:00Z"))).toBe(1);
    expect(parisDaysUntil(at("2027-01-02T08:00:00Z"), at("2026-12-31T22:30:00Z"))).toBe(2);
  });
  it("rend NaN pour un instant illisible, sans lever d'erreur", () => {
    expect(parisDaysUntil(Number.NaN, NOW)).toBeNaN();
    expect(parisDaysUntil(NOW, Number.NaN)).toBeNaN();
  });
});

describe("agendaWhen", () => {
  it("dit « Commencé » une fois l'heure passée, ou à l'heure juste", () => {
    expect(agendaWhen("2026-11-14T18:00:00Z", NOW)).toEqual({ ton: "muted", label: "Commencé" });
    expect(agendaWhen("2026-11-14T19:00:00Z", NOW)).toEqual({ ton: "muted", label: "Commencé" });
  });
  it("dit « Commencé » d'un événement de la veille resté à l'écran, sans rien dire de plus", () => {
    expect(agendaWhen("2026-11-13T20:00:00Z", NOW)).toEqual({ ton: "muted", label: "Commencé" });
    expect(agendaWhen("2026-11-14T18:59:59.999Z", NOW)).toEqual({ ton: "muted", label: "Commencé" });
  });
  it("compte les minutes à moins d'une heure, arrondies au-dessus", () => {
    expect(agendaWhen("2026-11-14T19:05:00Z", NOW)).toEqual({ ton: "warn", label: "Dans 5 min" });
    expect(agendaWhen("2026-11-14T19:00:20Z", NOW)).toEqual({ ton: "warn", label: "Dans 1 min" });
    expect(agendaWhen("2026-11-14T19:59:00Z", NOW)).toEqual({ ton: "warn", label: "Dans 59 min" });
  });
  it("ne dit jamais « Dans 60 min » : passé 59 minutes, c'est le jour qui compte", () => {
    expect(agendaWhen("2026-11-14T19:59:30Z", NOW)).toEqual({ ton: "warn", label: "Aujourd'hui" });
    expect(agendaWhen("2026-11-14T20:00:00Z", NOW)).toEqual({ ton: "warn", label: "Aujourd'hui" });
  });
  it("compte les minutes même de l'autre côté de minuit", () => {
    expect(agendaWhen("2026-11-14T23:10:00Z", at("2026-11-14T22:40:00Z"))).toEqual({ ton: "warn", label: "Dans 30 min" });
  });
  it("dit « Aujourd'hui » à une heure ou plus, le même jour à Paris", () => {
    expect(agendaWhen("2026-11-14T20:00:00Z", NOW)).toEqual({ ton: "warn", label: "Aujourd'hui" });
    expect(agendaWhen("2026-11-14T22:59:00Z", NOW)).toEqual({ ton: "warn", label: "Aujourd'hui" });
  });
  it("dit « Demain » dès minuit à Paris", () => {
    expect(agendaWhen("2026-11-14T23:00:00Z", NOW)).toEqual({ ton: "ally", label: "Demain" });
    expect(agendaWhen("2026-11-15T22:59:00Z", NOW)).toEqual({ ton: "ally", label: "Demain" });
  });
  it("compte les jours ensuite", () => {
    expect(agendaWhen("2026-11-15T23:00:00Z", NOW)).toEqual({ ton: "muted", label: "Dans 2 jours" });
    expect(agendaWhen("2026-11-23T10:00:00Z", NOW)).toEqual({ ton: "muted", label: "Dans 9 jours" });
  });
  it("passe minuit juste le soir du passage à l'heure d'été (dimanche 29 mars 2026)", () => {
    // Samedi 28 mars à 23:30 à Paris (UTC+1). La nuit qui suit n'a que 23 heures.
    const samedi = at("2026-03-28T22:30:00Z");
    expect(agendaWhen("2026-03-28T23:20:00Z", samedi)).toEqual({ ton: "warn", label: "Dans 50 min" });
    // Dimanche à 03:30, déjà à l'heure d'été (UTC+2), et dimanche à 23:59.
    expect(agendaWhen("2026-03-29T01:30:00Z", samedi)).toEqual({ ton: "ally", label: "Demain" });
    expect(agendaWhen("2026-03-29T21:59:00Z", samedi)).toEqual({ ton: "ally", label: "Demain" });
    // Lundi 30 mars à 00:00 : 23 h 30 plus tard seulement, mais deux jours de calendrier.
    expect(agendaWhen("2026-03-29T22:00:00Z", samedi)).toEqual({ ton: "muted", label: "Dans 2 jours" });
    // Dimanche à minuit juste : la journée de 23 heures reste « Aujourd'hui » jusqu'au bout.
    const minuit = at("2026-03-28T23:00:00Z");
    expect(agendaWhen("2026-03-29T21:00:00Z", minuit)).toEqual({ ton: "warn", label: "Aujourd'hui" });
    expect(agendaWhen("2026-03-29T22:00:00Z", minuit)).toEqual({ ton: "ally", label: "Demain" });
  });
  it("passe minuit juste le soir du retour à l'heure d'hiver (dimanche 25 octobre 2026)", () => {
    // Samedi 24 octobre à 23:30 à Paris (UTC+2). La nuit qui suit a 25 heures.
    const samedi = at("2026-10-24T21:30:00Z");
    expect(agendaWhen("2026-10-24T22:20:00Z", samedi)).toEqual({ ton: "warn", label: "Dans 50 min" });
    // Dimanche à 00:30 : soixante minutes, c'est « Demain ».
    expect(agendaWhen("2026-10-24T22:30:00Z", samedi)).toEqual({ ton: "ally", label: "Demain" });
    // Dimanche à 23:59 (UTC+1) : plus de 25 heures, mais toujours « Demain ».
    expect(agendaWhen("2026-10-25T22:59:00Z", samedi)).toEqual({ ton: "ally", label: "Demain" });
    expect(agendaWhen("2026-10-25T23:00:00Z", samedi)).toEqual({ ton: "muted", label: "Dans 2 jours" });
  });
  it("passe l'année le soir du 31 décembre", () => {
    const reveillon = at("2026-12-31T22:30:00Z");
    expect(agendaWhen("2026-12-31T23:10:00Z", reveillon)).toEqual({ ton: "warn", label: "Dans 40 min" });
    expect(agendaWhen("2026-12-31T23:30:00Z", reveillon)).toEqual({ ton: "ally", label: "Demain" });
    expect(agendaWhen("2027-01-01T23:00:00Z", reveillon)).toEqual({ ton: "muted", label: "Dans 2 jours" });
  });
  it("rend null pour une date illisible", () => {
    expect(agendaWhen("", NOW)).toBeNull();
    expect(agendaWhen("bientôt", NOW)).toBeNull();
    expect(agendaWhen("2026-11-14T20:00:00Z", Number.NaN)).toBeNull();
  });
});

describe("agendaSeries", () => {
  it("dit la série tant qu'il reste plus d'un rendez-vous", () => {
    expect(agendaSeries({ left: 4, until: "2026-12-05T20:00:00+00:00" })).toBe("Encore 4 rendez-vous, jusqu'au 5 déc. 2026");
    expect(agendaSeries({ left: 1, until: "2026-12-05T20:00:00+00:00" })).toBeNull();
    expect(agendaSeries(null)).toBeNull();
    expect(agendaSeries(undefined)).toBeNull();
  });
  it("se tait sur une date de série illisible, sans faire tomber la page", () => {
    expect(agendaSeries({ left: 3, until: "bientôt" })).toBeNull();
    expect(agendaSeries({ left: 3, until: "" })).toBeNull();
  });
});

describe("filtres de l'agenda", () => {
  const events = [
    { id: 1, mine: false },
    { id: 2, mine: true },
    { id: 3, mine: false },
    { id: 4, mine: true },
  ];
  it("paraissent à partir de six événements", () => {
    expect(AGENDA_FILTERS_FROM).toBe(6);
  });
  it("comptent les événements où je viens", () => {
    expect(agendaMine(events)).toBe(2);
    expect(agendaMine([])).toBe(0);
  });
  it("montrent tout sous « Tous », lignes gardées comprises", () => {
    expect(agendaShown(events, "all", [])).toBe(events);
    expect(agendaShown(events, "all", [1])).toBe(events);
  });
  it("montrent sous « Je viens » mes événements et les lignes gardées, dans l'ordre du serveur", () => {
    expect(agendaShown(events, "mine", []).map((e) => e.id)).toEqual([2, 4]);
    expect(agendaShown(events, "mine", [3]).map((e) => e.id)).toEqual([2, 3, 4]);
    // Une ligne gardée qui n'est plus dans la liste du serveur ne revient pas.
    expect(agendaShown(events, "mine", [9]).map((e) => e.id)).toEqual([2, 4]);
  });
  it("gardent la ligne dont on retire la présence sous « Je viens », et seulement elle", () => {
    expect(agendaHold([], { id: 2, mine: true }, "mine")).toEqual([2]);
    expect(agendaHold([4], { id: 2, mine: true }, "mine")).toEqual([4, 2]);
  });
  it("ne gardent rien quand on dit « Je viens », sous « Tous », ni deux fois la même ligne", () => {
    const held = [4];
    expect(agendaHold(held, { id: 3, mine: false }, "mine")).toBe(held);
    expect(agendaHold(held, { id: 2, mine: true }, "all")).toBe(held);
    expect(agendaHold(held, { id: 4, mine: true }, "mine")).toBe(held);
  });
});
