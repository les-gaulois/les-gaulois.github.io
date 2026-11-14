import { describe, expect, it } from "vitest";
import { JOURS_PROCHES, basculer, garderPresents, jourEtHeure, joursAvant, presence, proximite, viennentLabel } from "../../src/lib/compte/direction-evenements";

// Samedi 14 novembre 2026, 00 h 30 à Paris (UTC+1) : encore le 13 en temps universel.
const NOW = new Date("2026-11-13T23:30:00Z");
// Samedi 14 novembre 2026, midi à Paris.
const MIDI = new Date("2026-11-14T11:00:00Z");
// Les espaces insécables des dates et des nombres français deviennent des espaces ordinaires, pour comparer les textes.
const INSECABLES = [String.fromCharCode(0xa0), String.fromCharCode(0x202f)];
const texte = (s: string) => INSECABLES.reduce((t, c) => t.split(c).join(" "), s);
const ecrit = (startsAt: string, now: Date) => {
  const { jour, heure } = jourEtHeure(startsAt, now);
  return `${texte(jour)} ${heure}`;
};

describe("joursAvant", () => {
  it("compte les jours du calendrier de Paris, pas des tranches de 24 heures", () => {
    expect(joursAvant("2026-11-13T23:45:00Z", NOW)).toBe(0);
    expect(joursAvant("2026-11-14T22:59:00Z", NOW)).toBe(0);
    expect(joursAvant("2026-11-14T23:00:00Z", NOW)).toBe(1);
    expect(joursAvant("2026-11-24T18:00:00Z", NOW)).toBe(10);
    expect(joursAvant("2026-11-13T12:00:00Z", NOW)).toBe(-1);
  });
  it("change de jour à minuit à Paris, pas à minuit en temps universel", () => {
    // 23 h 30 et 0 h 30 à Paris : le même jour en temps universel, deux jours à Paris.
    expect(joursAvant("2026-11-14T22:30:00Z", MIDI)).toBe(0);
    expect(joursAvant("2026-11-14T23:30:00Z", MIDI)).toBe(1);
    // L'été (UTC+2), la frontière recule d'une heure.
    const ete = new Date("2027-06-10T10:00:00Z");
    expect(joursAvant("2027-06-10T21:30:00Z", ete)).toBe(0);
    expect(joursAvant("2027-06-10T22:30:00Z", ete)).toBe(1);
  });
  it("reste juste à travers le passage à l'heure d'hiver, le 25 octobre 2026", () => {
    const samedi = new Date("2026-10-24T10:00:00Z");
    // 2 h 30 deux fois dans la nuit : avant le changement (UTC+2), puis après (UTC+1). Les deux sont demain.
    expect(joursAvant("2026-10-25T00:30:00Z", samedi)).toBe(1);
    expect(joursAvant("2026-10-25T01:30:00Z", samedi)).toBe(1);
    // La journée de 25 heures : 23 h 30 est encore dimanche, 0 h 30 est lundi.
    expect(joursAvant("2026-10-25T22:30:00Z", samedi)).toBe(1);
    expect(joursAvant("2026-10-25T23:30:00Z", samedi)).toBe(2);
    // Lu le dimanche à 23 h, lundi 0 h est demain.
    expect(joursAvant("2026-10-25T23:00:00Z", new Date("2026-10-25T22:00:00Z"))).toBe(1);
  });
  it("reste juste à travers le passage à l'heure d'été, le 28 mars 2027", () => {
    const samedi = new Date("2027-03-27T12:00:00Z");
    expect(joursAvant("2027-03-28T00:30:00Z", samedi)).toBe(1);
    expect(joursAvant("2027-03-28T01:00:00Z", samedi)).toBe(1);
    // La journée de 23 heures : 23 h 59 est encore dimanche, minuit est lundi.
    expect(joursAvant("2027-03-28T21:59:00Z", samedi)).toBe(1);
    expect(joursAvant("2027-03-28T22:00:00Z", samedi)).toBe(2);
    expect(joursAvant("2027-03-29T08:00:00Z", new Date("2027-03-27T10:00:00Z"))).toBe(2);
  });
  it("passe d'une année à l'autre", () => {
    const reveillon = new Date("2026-12-31T22:30:00Z");
    expect(joursAvant("2026-12-31T22:45:00Z", reveillon)).toBe(0);
    expect(joursAvant("2026-12-31T23:30:00Z", reveillon)).toBe(1);
    expect(joursAvant("2027-01-06T19:00:00Z", reveillon)).toBe(6);
  });
});

describe("proximite", () => {
  it("dit « Aujourd'hui » en jaune, « Demain » en bleu, « Dans N jours » en gris", () => {
    expect(proximite("2026-11-14T20:00:00Z", NOW)).toEqual({ ton: "warn", mot: "Aujourd'hui" });
    expect(proximite("2026-11-15T20:00:00Z", NOW)).toEqual({ ton: "ally", mot: "Demain" });
    expect(proximite("2026-11-16T20:00:00Z", NOW)).toEqual({ ton: "muted", mot: "Dans 2 jours" });
    expect(proximite("2026-11-20T20:00:00Z", NOW)).toEqual({ ton: "muted", mot: `Dans ${JOURS_PROCHES} jours` });
  });
  it("dit « Dans 6 jours » jusqu'à 23 h 59 du sixième jour, puis plus rien", () => {
    expect(JOURS_PROCHES).toBe(6);
    expect(proximite("2026-11-20T22:59:00Z", MIDI)).toEqual({ ton: "muted", mot: "Dans 6 jours" });
    expect(proximite("2026-11-20T23:00:00Z", MIDI)).toBeNull();
    expect(proximite("2027-01-02T20:00:00Z", MIDI)).toBeNull();
  });
  it("compte 6 jours à travers le changement d'heure, 7 n'est plus proche", () => {
    const mardi = new Date("2026-10-20T10:00:00Z");
    expect(proximite("2026-10-26T19:00:00Z", mardi)).toEqual({ ton: "muted", mot: "Dans 6 jours" });
    expect(proximite("2026-10-27T19:00:00Z", mardi)).toBeNull();
  });
  it("change de mot à minuit à Paris : la page laissée ouverte suit l'heure", () => {
    const evenement = "2026-11-14T23:30:00Z"; // dimanche 15 novembre, 0 h 30 à Paris
    expect(proximite(evenement, new Date("2026-11-14T22:59:00Z"))).toEqual({ ton: "ally", mot: "Demain" });
    expect(proximite(evenement, new Date("2026-11-14T23:00:00Z"))).toEqual({ ton: "warn", mot: "Aujourd'hui" });
    expect(proximite("2026-11-16T20:00:00Z", new Date("2026-11-14T22:59:00Z"))).toEqual({ ton: "muted", mot: "Dans 2 jours" });
    expect(proximite("2026-11-16T20:00:00Z", new Date("2026-11-14T23:00:00Z"))).toEqual({ ton: "ally", mot: "Demain" });
  });
  it("dit « Commencé » en gris dès l'heure de début passée, même dans la journée", () => {
    const soir = new Date("2026-11-14T21:00:00Z"); // 22 h à Paris
    expect(proximite("2026-11-14T19:00:00Z", soir)).toEqual({ ton: "muted", mot: "Commencé" });
    expect(proximite("2026-11-14T21:00:00Z", soir)).toEqual({ ton: "muted", mot: "Commencé" });
    expect(proximite("2026-11-14T21:01:00Z", soir)).toEqual({ ton: "warn", mot: "Aujourd'hui" });
    // La veille, sur une page restée ouverte : rien ne dit plus « Aujourd'hui » ni la date seule, comme s'il était à venir.
    expect(proximite("2026-11-13T19:00:00Z", soir)).toEqual({ ton: "muted", mot: "Commencé" });
  });
});

describe("jourEtHeure", () => {
  it("écrit le jour et l'heure de Paris, sans l'année quand c'est celle de la lecture", () => {
    const { jour, heure } = jourEtHeure("2026-11-21T20:00:00Z", NOW);
    expect(texte(jour)).toBe("sam. 21 nov.");
    expect(heure).toBe("21:00");
  });
  it("écrit 23 h 30 et 0 h 30 au bon jour de Paris", () => {
    expect(ecrit("2026-11-14T22:30:00Z", MIDI)).toBe("sam. 14 nov. 23:30");
    expect(ecrit("2026-11-14T23:30:00Z", MIDI)).toBe("dim. 15 nov. 00:30");
    expect(ecrit("2026-11-14T23:00:00Z", MIDI)).toBe("dim. 15 nov. 00:00");
  });
  it("suit le changement d'heure du 25 octobre 2026 et du 28 mars 2027", () => {
    const octobre = new Date("2026-10-24T10:00:00Z");
    expect(ecrit("2026-10-24T19:00:00Z", octobre)).toBe("sam. 24 oct. 21:00");
    expect(ecrit("2026-10-25T00:30:00Z", octobre)).toBe("dim. 25 oct. 02:30");
    expect(ecrit("2026-10-25T01:30:00Z", octobre)).toBe("dim. 25 oct. 02:30");
    expect(ecrit("2026-10-25T20:00:00Z", octobre)).toBe("dim. 25 oct. 21:00");
    const mars = new Date("2027-03-27T12:00:00Z");
    expect(ecrit("2027-03-28T00:30:00Z", mars)).toBe("dim. 28 mars 01:30");
    expect(ecrit("2027-03-28T01:00:00Z", mars)).toBe("dim. 28 mars 03:00");
    expect(ecrit("2027-03-28T19:00:00Z", mars)).toBe("dim. 28 mars 21:00");
  });
  it("écrit l'année d'un événement de l'an prochain, à Paris", () => {
    expect(texte(jourEtHeure("2027-01-02T20:00:00Z", NOW).jour)).toBe("sam. 2 janv. 2027");
    const reveillon = new Date("2026-12-31T22:30:00Z"); // 23 h 30 à Paris
    expect(ecrit("2026-12-31T22:45:00Z", reveillon)).toBe("jeu. 31 déc. 23:45");
    // 0 h 30 le 1er janvier à Paris, encore le 31 décembre en temps universel : l'année s'écrit.
    expect(ecrit("2026-12-31T23:30:00Z", reveillon)).toBe("ven. 1 janv. 2027 00:30");
  });
  it("n'écrit pas l'année quand la lecture est déjà dans la même année à Paris", () => {
    // Lu à 0 h 30 le 1er janvier 2027 à Paris, encore 2026 en temps universel.
    const nouvelAn = new Date("2026-12-31T23:30:00Z");
    expect(ecrit("2027-01-02T19:00:00Z", nouvelAn)).toBe("sam. 2 janv. 20:00");
    // Et un événement de l'année d'avant, sur une page restée ouverte, la garde.
    expect(ecrit("2026-12-31T22:45:00Z", nouvelAn)).toBe("jeu. 31 déc. 2026 23:45");
  });
});

describe("viennentLabel", () => {
  it("accorde le verbe, et dit « Personne » pour zéro", () => {
    expect(viennentLabel(0)).toBe("Personne");
    expect(viennentLabel(1)).toBe("1 vient");
    expect(viennentLabel(2)).toBe("2 viennent");
    expect(texte(viennentLabel(23))).toBe("23 viennent");
    expect(texte(viennentLabel(1200))).toBe("1 200 viennent");
  });
});

describe("presence", () => {
  const lues = new Map<number, string[]>([
    [31, ["Ambiorix", "Commios"]],
    [32, ["Brennos"]],
  ]);
  it("ne dit rien tant que les réponses ne sont pas lues", () => {
    expect(presence(undefined, 31)).toEqual({ etat: "attente" });
  });
  it("dit la panne, sans nombre, quand la lecture a échoué", () => {
    expect(presence(null, 31)).toEqual({ etat: "panne" });
  });
  it("donne les noms lus", () => {
    expect(presence(lues, 31)).toEqual({ etat: "lu", noms: ["Ambiorix", "Commios"] });
    expect(presence(lues, 32)).toEqual({ etat: "lu", noms: ["Brennos"] });
  });
  it("lit un événement absent d'une réponse lue comme « personne » : le serveur ne nomme que ceux où quelqu'un vient", () => {
    expect(presence(lues, 99)).toEqual({ etat: "lu", noms: [] });
    expect(presence(new Map(), 31)).toEqual({ etat: "lu", noms: [] });
  });
});

describe("basculer et garderPresents", () => {
  it("déplie puis replie, sans toucher à l'ensemble d'avant", () => {
    const avant: ReadonlySet<number> = new Set([1]);
    const ouvert = basculer(avant, 2);
    expect([...ouvert].sort()).toEqual([1, 2]);
    expect([...basculer(ouvert, 1)]).toEqual([2]);
    expect([...avant]).toEqual([1]);
  });
  it("retire un événement supprimé des noms dépliés", () => {
    const ouverts: ReadonlySet<number> = new Set([31, 33]);
    expect([...garderPresents(ouverts, [31, 32, 34])]).toEqual([31]);
    expect(garderPresents(ouverts, []).size).toBe(0);
  });
  it("rend le même ensemble quand rien ne change", () => {
    const ouverts: ReadonlySet<number> = new Set([31]);
    expect(garderPresents(ouverts, [31, 32])).toBe(ouverts);
    const vide: ReadonlySet<number> = new Set();
    expect(garderPresents(vide, [31])).toBe(vide);
  });
});
