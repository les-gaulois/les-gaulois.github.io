import { describe, expect, it } from "vitest";
import { othersPlanned } from "../../src/lib/compte/outils";
import { aFaire, etatDeMoi, lignesAttente, nomDuLien, pronosticOuvert, resumeAttente, semaineDeMoi, type MoiAttente } from "../../src/lib/compte/qg-moi";
import { placeOf, rateOf } from "../../src/lib/members";
import { nextTier } from "../../src/lib/paliers";
import type { StoredMember, StoredMembers } from "../../src/lib/schemas";
import type { ClanWeekFile } from "../../src/lib/semaine-du-clan";

// Un samedi à 19 h 30 à Paris (18 h 30 en temps universel).
const NOW = new Date("2026-11-14T18:30:00.000Z");
const RIEN: MoiAttente = { waiting: 0, notVoted: 0, prediction: null, plan: { mine: null, others: 0 }, ideasToDecide: null };

const membre = (username: string | null, wins: number | null, losses = 0, extra: Partial<StoredMember> = {}): StoredMember => ({
  role: "member",
  joinedAt: "2026-01-01T00:00:00.000Z",
  publicId: username === null ? null : `id-${username}`,
  username,
  team: wins === null ? null : { wins, losses },
  ...extra,
});
const liste = (members: StoredMember[]): StoredMembers => ({ fetchedAt: "2026-11-13T22:53:00.000Z", total: members.length, members });

describe("lignesAttente", () => {
  it("ne garde que l'heure de jeu, en gris, quand rien n'attend", () => {
    const lignes = lignesAttente(RIEN, NOW);
    expect(lignes).toEqual([{ onglet: "ce-soir", ton: "muted", etat: "Pas dite", texte: "Votre heure de jeu" }]);
    expect(aFaire(lignes)).toBe(0);
    expect(resumeAttente(lignes)).toEqual({ ton: "ok", texte: "À jour" });
  });

  it("met ce qui est à faire d'abord, puis ce qui se passe, puis ce qui est fait", () => {
    const lignes = lignesAttente(
      {
        waiting: 2,
        notVoted: 1,
        prediction: { mine: 36, closesAt: "2026-11-10T23:00:00.000Z" },
        plan: { mine: null, others: 5 },
        ideasToDecide: 4,
      },
      NOW,
    );
    expect(lignes.map((ligne) => [ligne.onglet, ligne.ton])).toEqual([
      ["decisions", "warn"],
      ["ce-soir", "warn"],
      ["idees", "warn"],
      ["salons", "ally"],
      ["semaine", "ok"],
    ]);
    expect(aFaire(lignes)).toBe(3);
    expect(resumeAttente(lignes)).toEqual({ ton: "warn", texte: "3 à faire" });
  });

  it("accorde les phrases au singulier et au pluriel", () => {
    const un = lignesAttente({ ...RIEN, waiting: 1, notVoted: 1, plan: { mine: null, others: 1 }, ideasToDecide: 1 }, NOW);
    expect(un.map((ligne) => ligne.texte)).toEqual([
      "1 sondage attend votre voix",
      "1 autre Gaulois a dit son heure",
      "1 idée attend une décision",
      "1 Gaulois attend dans un salon",
    ]);
    const plusieurs = lignesAttente({ ...RIEN, waiting: 3, notVoted: 2, plan: { mine: null, others: 4 }, ideasToDecide: 2 }, NOW);
    expect(plusieurs.map((ligne) => ligne.texte)).toEqual([
      "2 sondages attendent votre voix",
      "4 autres Gaulois ont dit leur heure",
      "2 idées attendent une décision",
      "3 Gaulois attendent dans un salon",
    ]);
  });

  it("dit le pronostic à faire jusqu'à sa fin, et ne le réclame plus après", () => {
    const ouvert = lignesAttente({ ...RIEN, prediction: { mine: null, closesAt: "2026-11-17T23:00:00.000Z" } }, NOW);
    expect(ouvert[0]).toEqual({ onglet: "semaine", ton: "warn", etat: "À faire", texte: "Pronostic de la semaine, jusqu'au mardi 17 nov. à minuit" });
    const clos = lignesAttente({ ...RIEN, prediction: { mine: null, closesAt: "2026-11-14T18:30:00.000Z" } }, NOW);
    expect(clos.some((ligne) => ligne.onglet === "semaine")).toBe(false);
  });

  it("garde le pronostic fait, en vert, accordé", () => {
    expect(lignesAttente({ ...RIEN, prediction: { mine: 1, closesAt: "2026-11-17T23:00:00.000Z" } }, NOW)[0]).toMatchObject({ ton: "ok", etat: "Fait", texte: "Votre pronostic de la semaine : 1 victoire" });
    // Accordé comme « Enregistré : 0 victoire » dans l'onglet « La semaine ».
    expect(lignesAttente({ ...RIEN, prediction: { mine: 0, closesAt: "2026-11-17T23:00:00.000Z" } }, NOW)[0]?.texte).toBe("Votre pronostic de la semaine : 0 victoire");
    expect(lignesAttente({ ...RIEN, prediction: { mine: 2, closesAt: "2026-11-17T23:00:00.000Z" } }, NOW)[0]?.texte).toBe("Votre pronostic de la semaine : 2 victoires");
  });

  it("dit l'heure annoncée à l'heure de Paris, et l'oublie une fois finie", () => {
    const dite = lignesAttente({ ...RIEN, plan: { mine: "2026-11-14T20:00:00+00:00", others: 5 } }, NOW);
    expect(dite).toEqual([{ onglet: "ce-soir", ton: "ok", etat: "Dite", texte: "Votre heure de jeu : 21 h" }]);
    const enCours = lignesAttente({ ...RIEN, plan: { mine: "2026-11-14T18:00:00.000Z", others: 0 } }, NOW);
    expect(enCours[0]?.texte).toBe("Votre heure de jeu : maintenant");
    const finie = lignesAttente({ ...RIEN, plan: { mine: "2026-11-14T17:00:00.000Z", others: 0 } }, NOW);
    expect(finie[0]).toMatchObject({ ton: "muted", etat: "Pas dite" });
  });

  it("ne montre jamais les idées à trancher à un membre sans grade, ni une ligne à zéro", () => {
    expect(lignesAttente({ ...RIEN, ideasToDecide: null }, NOW).some((ligne) => ligne.onglet === "idees")).toBe(false);
    expect(lignesAttente({ ...RIEN, ideasToDecide: 0 }, NOW).some((ligne) => ligne.onglet === "idees")).toBe(false);
  });
});

describe("etatDeMoi", () => {
  const members = liste([membre("Devant", 60, 10), membre("Moi", 50, 25, { account: { level: 42, prestige: 2, legend: false } }), membre("Derriere", 40, 5), membre(null, 70, 1), membre("SansStats", null)]);

  it("dit pourquoi les chiffres manquent", () => {
    expect(etatDeMoi(null, members)).toEqual({ etat: "absent" });
    expect(etatDeMoi("Moi", undefined)).toEqual({ etat: "lecture", pseudo: "Moi" });
    expect(etatDeMoi("Moi", null)).toEqual({ etat: "illisible", pseudo: "Moi" });
    expect(etatDeMoi("Personne", members)).toEqual({ etat: "inconnu", pseudo: "Personne" });
    expect(etatDeMoi("SansStats", members)).toEqual({ etat: "inconnu", pseudo: "SansStats" });
  });

  it("ne choisit pas entre deux membres au même pseudo", () => {
    expect(etatDeMoi("moi", liste([membre("Moi", 5), membre("MOI", 9)])).etat).toBe("inconnu");
  });

  it("ne classe pas un membre sans partie sous le tag", () => {
    expect(etatDeMoi("Neuf", liste([membre("Neuf", 0, 0), membre("Autre", 3)])).etat).toBe("sans-partie");
  });

  it("donne la place, les chiffres d'équipe et les deux jauges", () => {
    const etat = etatDeMoi("moi", members);
    if (etat.etat !== "pret") throw new Error("chiffres attendus");
    const c = etat.chiffres;
    expect(c.place.rank).toBe(3);
    expect(c.place.ranked).toBe(4);
    expect(c.place.next?.username).toBe("Devant");
    expect(c.place.missing).toBe(11);
    expect(c.losses).toBe(25);
    expect(c.rate).toBeCloseTo((50 / 75) * 100, 6);
    // 50 victoires : le palier 50 est atteint, le suivant est à 100.
    expect(c.tier).toEqual({ wins: 100, missing: 50, from: 50 });
    expect(c.tierShare).toBe(0);
    expect(c.nextShare).toBeCloseTo((50 / 60) * 100, 6);
    expect(c.account).toEqual({ level: 42, prestige: 2, legend: false });
    expect(c.fetchedAt).toBe("2026-11-13T22:53:00.000Z");
  });

  it("n'a pas de jauge vers un membre de devant quand personne n'est devant, ni de palier après le dernier", () => {
    const etat = etatDeMoi("Chef", liste([membre("Chef", 6000, 10), membre("Autre", 3)]));
    if (etat.etat !== "pret") throw new Error("chiffres attendus");
    expect(etat.chiffres.nextShare).toBeNull();
    expect(etat.chiffres.tier).toBeNull();
    expect(etat.chiffres.tierShare).toBe(100);
    expect(etat.chiffres.account).toBeNull();
  });

  it("mesure la jauge du palier depuis le palier précédent", () => {
    const etat = etatDeMoi("Moi", liste([membre("Moi", 75, 1)]));
    if (etat.etat !== "pret") throw new Error("chiffres attendus");
    expect(etat.chiffres.tierShare).toBe(50);
  });
});

describe("semaineDeMoi", () => {
  const file = (wins: Record<string, number> | null): ClanWeekFile => ({
    until: "2026-11-13T12:53:00.000Z",
    weeks: [],
    gains: wins === null ? null : { since: "2026-11-08T23:53:00.000Z", until: "2026-11-13T12:53:00.000Z", wins },
    clans: null,
  });

  it("lit les victoires de la semaine, zéro compris", () => {
    expect(semaineDeMoi(membre("Moi", 5), file({ "id-Moi": 2 }))).toEqual({ wins: 2, since: "2026-11-08T23:53:00.000Z", until: "2026-11-13T12:53:00.000Z" });
    expect(semaineDeMoi(membre("Moi", 5), file({ "id-Moi": 0 }))?.wins).toBe(0);
  });

  it("ne dit rien sans relevé, sans fichier, ou pour un membre absent du relevé", () => {
    expect(semaineDeMoi(membre("Moi", 5), file(null))).toBeNull();
    expect(semaineDeMoi(membre("Moi", 5), null)).toBeNull();
    expect(semaineDeMoi(membre("Moi", 5), undefined)).toBeNull();
    expect(semaineDeMoi(membre("Moi", 5), file({ "id-Autre": 4 }))).toBeNull();
    expect(semaineDeMoi(membre(null, 5), file({ "id-Moi": 4 }))).toBeNull();
    expect(semaineDeMoi(null, file({ "id-Moi": 4 }))).toBeNull();
  });

  it("ne lit pas un nom hérité de tout objet comme un identifiant", () => {
    expect(semaineDeMoi(membre("Moi", 5, 0, { publicId: "constructor" }), file({}))).toBeNull();
  });

  it("ne publie ni une baisse, ni un nombre illisible, ni un relevé sans liste", () => {
    expect(semaineDeMoi(membre("Moi", 5), file({ "id-Moi": -1 }))).toBeNull();
    expect(semaineDeMoi(membre("Moi", 5), file({ "id-Moi": Number.NaN }))).toBeNull();
    const sansListe = { ...file({}), gains: { since: "2026-11-08T23:53:00.000Z", until: "2026-11-13T12:53:00.000Z" } } as unknown as ClanWeekFile;
    expect(semaineDeMoi(membre("Moi", 5), sansListe)).toBeNull();
  });
});

// Les chiffres de « Moi » sont ceux de « Ma place dans le clan » de l'accueil (`Result`, src/components/MyPlace.tsx) : mêmes
// fonctions, même membre. Un calcul refait ici pourrait s'en écarter sans qu'on le voie.
describe("les chiffres de l'accueil", () => {
  const members = liste([
    membre("Alpha", 100, 20),
    membre("Bravo", 80, 40),
    membre("Charlie", 80, 3),
    membre(null, 50, 50),
    membre("Delta", 10, 30),
    membre("Echo", 0, 0),
    membre("Sans", null),
  ]);

  it("donne pour chaque membre la place, la réussite, le palier et la jauge de « Ma place »", () => {
    for (const member of members.members) {
      if (!member.username) continue;
      const etat = etatDeMoi(member.username, members);
      if (etat.etat !== "pret") continue;
      const place = placeOf(members.members, member);
      expect(etat.chiffres.place).toEqual(place);
      expect(etat.chiffres.rate).toBe(rateOf(member));
      expect(etat.chiffres.losses).toBe(member.team?.losses);
      expect(etat.chiffres.tier).toEqual(nextTier(member.team?.wins ?? -1));
      // La jauge de l'accueil : les victoires du membre rapportées à celles du membre de devant.
      if (place?.next) expect(etat.chiffres.nextShare).toBe((place.wins / (place.next.team?.wins ?? 0)) * 100);
    }
    expect(["Alpha", "Bravo", "Charlie", "Delta"].map((name) => etatDeMoi(name, members).etat)).toEqual(["pret", "pret", "pret", "pret"]);
  });

  it("met deux membres à égalité à la même place, comme l'accueil", () => {
    const bravo = etatDeMoi("Bravo", members);
    const charlie = etatDeMoi("Charlie", members);
    if (bravo.etat !== "pret" || charlie.etat !== "pret") throw new Error("chiffres attendus");
    expect([bravo.chiffres.place.rank, charlie.chiffres.place.rank]).toEqual([2, 2]);
    expect(bravo.chiffres.place.missing).toBe(21);
  });

  it("dit le premier du clan sans membre devant, avec celui qui le suit", () => {
    const etat = etatDeMoi("Alpha", members);
    if (etat.etat !== "pret") throw new Error("chiffres attendus");
    expect(etat.chiffres.place).toMatchObject({ rank: 1, ranked: 6, next: null, missing: null, lead: 20 });
    expect(etat.chiffres.place.behind?.username).toBe("Bravo");
    expect(etat.chiffres.nextShare).toBeNull();
    expect(etat.chiffres.tier).toEqual({ wins: 250, missing: 150, from: 100 });
  });

  it("garde le membre sans partie pour dire son pseudo, sans place ni réussite", () => {
    const etat = etatDeMoi("Echo", members);
    expect(etat.etat).toBe("sans-partie");
    if (etat.etat === "sans-partie") expect(etat.member.username).toBe("Echo");
  });

  it("donne ses chiffres à un membre sans identifiant public, sans semaine", () => {
    const sansId = liste([membre("Moi", 12, 3, { publicId: null }), membre("Autre", 20)]);
    const etat = etatDeMoi("Moi", sansId);
    if (etat.etat !== "pret") throw new Error("chiffres attendus");
    expect(etat.chiffres.place.rank).toBe(2);
    expect(semaineDeMoi(etat.chiffres.member, { until: null, weeks: [], gains: { since: "a", until: "b", wins: { "id-Moi": 3 } }, clans: null })).toBeNull();
  });

  it("garde le niveau du compte tel qu'il est lu, Légende comprise", () => {
    const legende = { level: 100, prestige: 10, legend: true };
    const etat = etatDeMoi("Moi", liste([membre("Moi", 5200, 10, { account: legende })]));
    if (etat.etat !== "pret") throw new Error("chiffres attendus");
    expect(etat.chiffres.account).toEqual(legende);
    expect(etat.chiffres.tier).toBeNull();
  });
});

describe("le pronostic, l'heure de jeu et le lien", () => {
  const FIN = "2026-11-17T23:00:00.000Z";

  it("ferme le pronostic à l'instant de sa fin, comme l'onglet « La semaine »", () => {
    expect(pronosticOuvert(FIN, new Date(Date.parse(FIN) - 1))).toBe(true);
    expect(pronosticOuvert(FIN, new Date(FIN))).toBe(false);
    expect(lignesAttente({ ...RIEN, prediction: { mine: null, closesAt: FIN } }, new Date(Date.parse(FIN) - 1)).some((l) => l.onglet === "semaine")).toBe(true);
    expect(lignesAttente({ ...RIEN, prediction: { mine: null, closesAt: FIN } }, new Date(FIN)).some((l) => l.onglet === "semaine")).toBe(false);
  });

  it("garde le pronostic fait une fois la semaine close", () => {
    expect(lignesAttente({ ...RIEN, prediction: { mine: 30, closesAt: FIN } }, new Date(Date.parse(FIN) + 60_000))[0]).toMatchObject({ onglet: "semaine", etat: "Fait" });
  });

  it("redemande l'heure de jeu une fois la sienne finie, si d'autres ont dit la leur", () => {
    const finie = "2026-11-14T17:00:00.000Z";
    expect(lignesAttente({ ...RIEN, plan: { mine: finie, others: 2 } }, NOW)[0]).toMatchObject({ ton: "warn", etat: "À dire", texte: "2 autres Gaulois ont dit leur heure" });
    // À la dernière minute de son heure, elle est encore dite.
    expect(lignesAttente({ ...RIEN, plan: { mine: finie, others: 2 } }, new Date("2026-11-14T17:59:59.000Z"))[0]).toMatchObject({ ton: "ok", etat: "Dite" });
  });

  it("compte « À dire » avec le nombre de l'onglet « Ce soir », sans soi-même", () => {
    const plans = {
      mine: "2026-11-14T20:00:00.000Z",
      hours: [
        { at: "2026-11-14T17:00:00.000Z", count: 4, faces: [] },
        { at: "2026-11-14T20:00:00.000Z", count: 3, faces: [] },
        { at: "2026-11-14T21:00:00.000Z", count: 1, faces: [] },
      ],
    };
    const others = othersPlanned(plans, NOW);
    expect(others).toBe(3);
    const sansMonHeure = othersPlanned({ ...plans, mine: null }, NOW);
    expect(lignesAttente({ ...RIEN, plan: { mine: null, others: sansMonHeure } }, NOW)[0]?.texte).toBe("4 autres Gaulois ont dit leur heure");
  });

  it("ne compte comme à faire que le jaune et le rouge", () => {
    const lignes = lignesAttente({ waiting: 3, notVoted: 0, prediction: { mine: 4, closesAt: FIN }, plan: { mine: "2026-11-14T20:00:00.000Z", others: 9 }, ideasToDecide: 0 }, NOW);
    expect(lignes.map((l) => l.etat)).toEqual(["Maintenant", "Fait", "Dite"]);
    expect(resumeAttente(lignes)).toEqual({ ton: "ok", texte: "À jour" });
  });

  it("nomme le lien par l'état, la phrase et l'onglet, sans couleur", () => {
    const [ligne] = lignesAttente({ ...RIEN, notVoted: 2 }, NOW);
    if (!ligne) throw new Error("ligne attendue");
    expect(nomDuLien(ligne)).toBe("À voter : 2 sondages attendent votre voix, Décisions");
    expect(nomDuLien(lignesAttente(RIEN, NOW)[0]!)).toBe("Pas dite : Votre heure de jeu, Ce soir");
  });
});
