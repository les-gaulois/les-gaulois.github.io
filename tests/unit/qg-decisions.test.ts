import { describe, expect, it } from "vitest";
import { pollRows } from "../../src/lib/compte/polls";
import {
  choixEnTete,
  compterSondages,
  egaliteEnTete,
  etatSondage,
  etatsVus,
  fermeturePassee,
  filtrerSondages,
  FILTRES_DES,
  partEcrite,
  passeLeFiltre,
  rangerSondages,
  tempsRestant,
  type EtatSondage,
  type FiltreSondages,
} from "../../src/lib/compte/qg-decisions";

const NOW = Date.parse("2026-11-14T12:00:00Z");
const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;
const iso = (t: number) => new Date(t).toISOString();
/** L'espace insécable entre le nombre et « % ». */
const NB = String.fromCharCode(160);

const poll = (id: number, over: Partial<{ is_open: boolean; mine: number | null; closes_at: string | null; ended_at: string | null }> = {}) => ({
  id,
  is_open: true,
  mine: null as number | null,
  closes_at: null as string | null,
  ended_at: null as string | null,
  ...over,
});
const ids = (polls: readonly { id: number }[]) => polls.map((p) => p.id);
const FILTRES: FiltreSondages[] = ["a-voter", "ouverts", "fermes"];

describe("etatSondage", () => {
  it("dit ce que le membre a à faire", () => {
    expect(etatSondage({ is_open: true, mine: null })).toBe("a-voter");
    expect(etatSondage({ is_open: true, mine: 0 })).toBe("vote");
    expect(etatSondage({ is_open: false, mine: null })).toBe("ferme");
    expect(etatSondage({ is_open: false, mine: 1 })).toBe("ferme");
  });
});

describe("compterSondages et passeLeFiltre", () => {
  const polls = [poll(1), poll(2, { mine: 1 }), poll(3, { is_open: false }), poll(4, { is_open: false, mine: 0 })];

  it("compte chaque filtre, « ouverts » avec ceux à voter", () => {
    expect(compterSondages(polls)).toEqual({ "a-voter": 1, ouverts: 2, fermes: 2 });
    expect(compterSondages([])).toEqual({ "a-voter": 0, ouverts: 0, fermes: 0 });
  });

  it("le nombre d'un filtre est le nombre de sondages qu'il laisse passer", () => {
    const compte = compterSondages(polls);
    for (const filtre of FILTRES) expect(polls.filter((p) => passeLeFiltre(p, filtre))).toHaveLength(compte[filtre]);
    expect(polls.filter((p) => passeLeFiltre(p, null))).toHaveLength(polls.length);
  });

  it("les filtres n'existent qu'au-delà de six sondages", () => {
    expect(FILTRES_DES).toBe(6);
  });
});

describe("filtrerSondages", () => {
  const polls = [poll(1), poll(2, { mine: 0 }), poll(3, { is_open: false }), poll(4, { is_open: false, mine: 1 })];
  const aucun = new Set<number>();

  it("sans filtre, montre tout, dans l'ordre reçu", () => {
    expect(filtrerSondages(polls, null, aucun)).toEqual({ actif: null, montres: polls });
    expect(filtrerSondages(polls, null, new Set([3])).montres).toEqual(polls);
  });

  it("chaque filtre montre ce qu'il compte", () => {
    expect(ids(filtrerSondages(polls, "a-voter", aucun).montres)).toEqual([1]);
    expect(ids(filtrerSondages(polls, "ouverts", aucun).montres)).toEqual([1, 2]);
    expect(ids(filtrerSondages(polls, "fermes", aucun).montres)).toEqual([3, 4]);
    for (const filtre of FILTRES) expect(filtrerSondages(polls, filtre, aucun).actif).toBe(filtre);
  });

  it("garde à l'écran le sondage où l'on vient de voter sous le filtre, même voté ou fermé depuis", () => {
    const apresVote = [poll(1, { mine: 0 }), poll(2, { mine: 0 }), poll(3, { is_open: false })];
    expect(filtrerSondages(apresVote, "a-voter", new Set([1]))).toEqual({ actif: "a-voter", montres: [apresVote[0]] });
    const fermeDepuis = [poll(1, { is_open: false }), poll(2), poll(3, { is_open: false })];
    expect(ids(filtrerSondages(fermeDepuis, "a-voter", new Set([1])).montres)).toEqual([1, 2]);
    expect(ids(filtrerSondages(fermeDepuis, "ouverts", new Set([1])).montres)).toEqual([1, 2]);
  });

  it("un filtre qui ne laisse plus rien passer se lève : la liste n'est jamais vide", () => {
    const tousVotes = [poll(1, { mine: 0 }), poll(2, { is_open: false })];
    expect(filtrerSondages(tousVotes, "a-voter", aucun)).toEqual({ actif: null, montres: tousVotes });
    const tousFermes = [poll(1, { is_open: false }), poll(2, { is_open: false })];
    expect(filtrerSondages(tousFermes, "ouverts", aucun).actif).toBeNull();
    // Un sondage gardé qui n'est plus dans la liste ne retient pas le filtre.
    expect(filtrerSondages(tousVotes, "a-voter", new Set([99])).actif).toBeNull();
    expect(filtrerSondages([], "fermes", aucun)).toEqual({ actif: null, montres: [] });
  });

  it("ne touche pas à la liste reçue", () => {
    const recus = [poll(1), poll(2, { is_open: false })];
    const { montres } = filtrerSondages(recus, null, aucun);
    expect(montres).not.toBe(recus);
    expect(ids(recus)).toEqual([1, 2]);
  });
});

describe("rangerSondages", () => {
  it("met les sondages à voter d'abord, puis votés, puis fermés", () => {
    const ranges = rangerSondages([poll(1, { is_open: false }), poll(2, { mine: 0 }), poll(3)]);
    expect(ids(ranges)).toEqual([3, 2, 1]);
  });

  it("parmi les ouverts, celui qui ferme le plus tôt d'abord, sans date ou date illisible à la fin", () => {
    const ranges = rangerSondages([poll(1), poll(2, { closes_at: iso(NOW + 3 * D) }), poll(3, { closes_at: iso(NOW + H) }), poll(4, { closes_at: "illisible" })]);
    expect(ids(ranges)).toEqual([3, 2, 1, 4]);
  });

  it("parmi les fermés, le plus récent d'abord, sans date de fin ou date illisible à la fin", () => {
    const ranges = rangerSondages([poll(1, { is_open: false }), poll(2, { is_open: false, ended_at: iso(NOW - 9 * D) }), poll(3, { is_open: false, ended_at: iso(NOW - D) }), poll(4, { is_open: false, ended_at: "hier" })]);
    expect(ids(ranges)).toEqual([3, 2, 1, 4]);
  });

  it("une date de fermeture passée reste devant : c'est la plus proche", () => {
    expect(ids(rangerSondages([poll(1, { closes_at: iso(NOW + H) }), poll(2, { closes_at: iso(NOW - MIN) })]))).toEqual([2, 1]);
  });

  it("garde l'ordre du serveur à égalité et ne touche pas à la liste reçue", () => {
    const recus = [poll(1), poll(2), poll(3), poll(4, { closes_at: iso(NOW + D) }), poll(5, { closes_at: iso(NOW + D) })];
    expect(ids(rangerSondages(recus))).toEqual([4, 5, 1, 2, 3]);
    expect(ids(recus)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("etatsVus et l'ordre gardé pendant la visite", () => {
  const arrivee = [poll(1, { closes_at: iso(NOW + D) }), poll(2, { closes_at: iso(NOW + 2 * D) }), poll(3, { mine: 0, closes_at: iso(NOW + H) }), poll(4, { is_open: false, ended_at: iso(NOW - D) })];
  const vus = etatsVus(new Map(), arrivee);

  it("retient l'état de chaque sondage à son arrivée, sans le changer ensuite", () => {
    expect([...vus]).toEqual([
      [1, "a-voter"],
      [2, "a-voter"],
      [3, "vote"],
      [4, "ferme"],
    ]);
    const apresVote = [poll(1, { mine: 1 }), ...arrivee.slice(1)];
    expect(etatsVus(vus, apresVote)).toBe(vus);
  });

  it("ajoute les sondages nouveaux, une fois chacun", () => {
    const avecNouveau = etatsVus(vus, [...arrivee, poll(9, { mine: 0 }), poll(9)]);
    expect(avecNouveau).not.toBe(vus);
    expect(avecNouveau.get(9)).toBe("vote");
    expect(vus.has(9)).toBe(false);
  });

  it("le sondage où l'on vient de voter garde sa place parmi les « à voter »", () => {
    expect(ids(rangerSondages(arrivee, vus))).toEqual([1, 2, 3, 4]);
    const apresVote = [poll(1, { mine: 1, closes_at: iso(NOW + D) }), ...arrivee.slice(1)];
    expect(ids(rangerSondages(apresVote, vus))).toEqual([1, 2, 3, 4]);
    // Sans mémoire, il descendrait parmi les votés.
    expect(ids(rangerSondages(apresVote))).toEqual([2, 3, 1, 4]);
  });

  it("un sondage qui ferme pendant la visite rejoint les fermés, à sa date de fin", () => {
    const fermeDepuis = [poll(1, { closes_at: iso(NOW + D) }), poll(2, { is_open: false, closes_at: iso(NOW - MIN), ended_at: iso(NOW - MIN) }), poll(3, { mine: 0, closes_at: iso(NOW + H) }), poll(4, { is_open: false, ended_at: iso(NOW - D) }), poll(5, { is_open: false, ended_at: iso(NOW - 2 * D) })];
    expect(ids(rangerSondages(fermeDepuis, etatsVus(vus, fermeDepuis)))).toEqual([1, 3, 2, 4, 5]);
  });

  it("un sondage nouveau se range selon son propre état", () => {
    const avecNouveau = [...arrivee, poll(9, { closes_at: iso(NOW + 10 * MIN) })];
    expect(ids(rangerSondages(avecNouveau, etatsVus(vus, avecNouveau)))).toEqual([9, 1, 2, 3, 4]);
  });

  it("un sondage vu fermé puis rouvert se range selon son état du moment", () => {
    const vusFerme = new Map<number, EtatSondage>([[1, "ferme"]]);
    expect(ids(rangerSondages([poll(2, { mine: 0 }), poll(1)], vusFerme))).toEqual([1, 2]);
  });
});

describe("choixEnTete et egaliteEnTete", () => {
  it("désigne le choix qui a strictement le plus de voix", () => {
    expect(choixEnTete([4, 10, 2])).toBe(1);
    expect(choixEnTete([1, 0])).toBe(0);
    expect(choixEnTete([0, 0, 1])).toBe(2);
    expect(egaliteEnTete([4, 10, 2])).toBe(false);
  });

  it("ne désigne rien sans voix", () => {
    expect(choixEnTete([0, 0])).toBeNull();
    expect(choixEnTete([])).toBeNull();
    expect(egaliteEnTete([0, 0])).toBe(false);
    expect(egaliteEnTete([])).toBe(false);
  });

  it("ne désigne rien à égalité en tête, à deux comme à plus", () => {
    expect(choixEnTete([5, 5, 1])).toBeNull();
    expect(choixEnTete([1, 5, 5])).toBeNull();
    expect(choixEnTete([5, 1, 5])).toBeNull();
    expect(egaliteEnTete([5, 5, 1])).toBe(true);
    expect(choixEnTete([3, 3, 3])).toBeNull();
    expect(egaliteEnTete([3, 3, 3])).toBe(true);
    expect(choixEnTete([0, 4, 4, 4, 1, 2])).toBeNull();
    expect(egaliteEnTete([0, 4, 4, 4, 1, 2])).toBe(true);
    expect(choixEnTete([1, 1, 1, 1, 1, 1])).toBeNull();
  });

  it("une égalité plus bas ne gêne pas", () => {
    expect(choixEnTete([2, 2, 7])).toBe(2);
    expect(choixEnTete([7, 2, 2])).toBe(0);
    expect(choixEnTete([4, 4, 4, 5])).toBe(3);
    expect(egaliteEnTete([7, 2, 2])).toBe(false);
    expect(egaliteEnTete([4, 4, 4, 5])).toBe(false);
  });

  it("ne compte pas un total illisible, et les deux réponses restent d'accord", () => {
    expect(choixEnTete([Number.NaN, 2])).toBe(1);
    expect(choixEnTete([2, Number.NaN, 2])).toBeNull();
    expect(egaliteEnTete([2, Number.NaN, 2])).toBe(true);
    expect(choixEnTete([-3, 1])).toBe(1);
    expect(choixEnTete([Number.POSITIVE_INFINITY, 1])).toBe(1);
    expect(choixEnTete([Number.NaN, Number.NaN])).toBeNull();
    expect(egaliteEnTete([Number.NaN, Number.NaN])).toBe(false);
  });

  it("jamais « En tête » et « Égalité » ensemble", () => {
    for (const counts of [[0], [1], [2, 2], [3, 1, 3], [0, 0, 0], [5, 4, 3, 2, 1, 0], [1, 1, 2, 2]]) expect(choixEnTete(counts) !== null && egaliteEnTete(counts)).toBe(false);
  });
});

describe("parts arrondies à côté du choix en tête", () => {
  const sondage = (counts: number[]) => ({ options: counts.map((_, i) => `Choix ${i + 1}`), counts });

  it("chaque part est arrondie à l'unité, leur somme peut ne pas faire 100", () => {
    expect(pollRows(sondage([1, 1, 1])).rows.map((r) => r.share)).toEqual([33, 33, 33]);
    expect(pollRows(sondage([1, 2])).rows.map((r) => r.share)).toEqual([33, 67]);
    expect(pollRows(sondage([1, 1, 1, 1, 1, 1])).rows.map((r) => r.share)).toEqual([17, 17, 17, 17, 17, 17]);
  });

  it("deux parts arrondies égales ne font pas une égalité : seules les voix comptent", () => {
    const counts = [200, 199];
    expect(pollRows(sondage(counts)).rows.map((r) => r.share)).toEqual([50, 50]);
    expect(choixEnTete(counts)).toBe(0);
    expect(egaliteEnTete(counts)).toBe(false);
  });

  it("sans voix, pas de part et personne en tête", () => {
    expect(pollRows(sondage([0, 0])).rows.map((r) => r.share)).toEqual([null, null]);
    expect(choixEnTete([0, 0])).toBeNull();
  });
});

describe("partEcrite", () => {
  const ecrites = (counts: number[]) => {
    const { rows, total } = pollRows({ options: counts.map((_, i) => `Choix ${i + 1}`), counts });
    return rows.map((row) => partEcrite(row, total));
  };

  it("écrit la part arrondie, le nombre et « % » jamais séparés", () => {
    expect(ecrites([1, 3])).toEqual([`25${NB}%`, `75${NB}%`]);
    expect(ecrites([1, 2])).toEqual([`33${NB}%`, `67${NB}%`]);
  });

  it("« 0 % » et « 100 % » seulement quand c'est exact", () => {
    expect(ecrites([0, 5])).toEqual([`0${NB}%`, `100${NB}%`]);
    expect(ecrites([0, 0, 1])).toEqual([`0${NB}%`, `0${NB}%`, `100${NB}%`]);
  });

  it("aux deux bouts, des mots plutôt qu'un arrondi trompeur", () => {
    expect(ecrites([1, 999])).toEqual([`moins de 1${NB}%`, `plus de 99${NB}%`]);
    expect(ecrites([3, 997])).toEqual([`moins de 1${NB}%`, `plus de 99${NB}%`]);
    // 0,5 % s'arrondit à 1 % et 99,5 % à 100 % : le second n'a pas toutes les voix.
    expect(ecrites([1, 199])).toEqual([`1${NB}%`, `plus de 99${NB}%`]);
    expect(ecrites([1, 99])).toEqual([`1${NB}%`, `99${NB}%`]);
  });

  it("rien tant que personne n'a voté", () => {
    expect(ecrites([0, 0])).toEqual([null, null]);
    expect(partEcrite({ count: 0, share: null }, 0)).toBeNull();
    expect(partEcrite({ count: 2, share: 50 }, 0)).toBeNull();
  });
});

describe("tempsRestant", () => {
  it("ne dit rien sans date, avec une date illisible ou passée", () => {
    expect(tempsRestant(null, NOW)).toBeNull();
    expect(tempsRestant("demain", NOW)).toBeNull();
    expect(tempsRestant("", NOW)).toBeNull();
    expect(tempsRestant(iso(NOW), NOW)).toBeNull();
    expect(tempsRestant(iso(NOW - MIN), NOW)).toBeNull();
    expect(tempsRestant(iso(NOW - 3 * D), NOW)).toBeNull();
  });

  it("lit les dates telles que Postgres les écrit", () => {
    expect(tempsRestant("2026-11-14T13:30:00.123456+00:00", NOW)).toEqual({ texte: "1 heure", proche: true });
    expect(tempsRestant("2026-11-14T14:30:00+01:00", NOW)).toEqual({ texte: "1 heure", proche: true });
  });

  it("compte en jours à partir de deux jours, sans arrondir vers le haut", () => {
    expect(tempsRestant(iso(NOW + 2 * D), NOW)).toEqual({ texte: "2 jours", proche: false });
    expect(tempsRestant(iso(NOW + 3 * D - MIN), NOW)).toEqual({ texte: "2 jours", proche: false });
    expect(tempsRestant(iso(NOW + 3 * D), NOW)).toEqual({ texte: "3 jours", proche: false });
    expect(tempsRestant(iso(NOW + 10 * D + H), NOW)).toEqual({ texte: "10 jours", proche: false });
  });

  it("compte en heures sous deux jours ; proche sous 24 heures pile", () => {
    expect(tempsRestant(iso(NOW + 2 * D - 1), NOW)).toEqual({ texte: "47 heures", proche: false });
    expect(tempsRestant(iso(NOW + 2 * D - MIN), NOW)).toEqual({ texte: "47 heures", proche: false });
    expect(tempsRestant(iso(NOW + D), NOW)).toEqual({ texte: "24 heures", proche: false });
    expect(tempsRestant(iso(NOW + D - 1), NOW)).toEqual({ texte: "23 heures", proche: true });
    expect(tempsRestant(iso(NOW + D - MIN), NOW)).toEqual({ texte: "23 heures", proche: true });
    expect(tempsRestant(iso(NOW + 2 * H), NOW)).toEqual({ texte: "2 heures", proche: true });
    expect(tempsRestant(iso(NOW + 2 * H - 1), NOW)).toEqual({ texte: "1 heure", proche: true });
    expect(tempsRestant(iso(NOW + H), NOW)).toEqual({ texte: "1 heure", proche: true });
  });

  it("compte en minutes sous une heure", () => {
    expect(tempsRestant(iso(NOW + H - 1), NOW)).toEqual({ texte: "59 minutes", proche: true });
    expect(tempsRestant(iso(NOW + 59 * MIN), NOW)).toEqual({ texte: "59 minutes", proche: true });
    expect(tempsRestant(iso(NOW + 59 * MIN - 1), NOW)).toEqual({ texte: "58 minutes", proche: true });
    expect(tempsRestant(iso(NOW + 2 * MIN), NOW)).toEqual({ texte: "2 minutes", proche: true });
    expect(tempsRestant(iso(NOW + MIN), NOW)).toEqual({ texte: "1 minute", proche: true });
    expect(tempsRestant(iso(NOW + MIN - 1), NOW)).toEqual({ texte: "moins d'une minute", proche: true });
    expect(tempsRestant(iso(NOW + 1), NOW)).toEqual({ texte: "moins d'une minute", proche: true });
  });
});

describe("fermeturePassee", () => {
  it("dit l'heure de fermeture atteinte, exactement quand le temps restant se tait", () => {
    expect(fermeturePassee(null, NOW)).toBe(false);
    expect(fermeturePassee("demain", NOW)).toBe(false);
    expect(fermeturePassee(iso(NOW + 1), NOW)).toBe(false);
    expect(fermeturePassee(iso(NOW), NOW)).toBe(true);
    expect(fermeturePassee(iso(NOW - 5 * D), NOW)).toBe(true);
    for (const ecart of [-D, -MIN, -1, 0, 1, MIN, D]) {
      const date = iso(NOW + ecart);
      expect(fermeturePassee(date, NOW)).toBe(tempsRestant(date, NOW) === null);
    }
  });
});
