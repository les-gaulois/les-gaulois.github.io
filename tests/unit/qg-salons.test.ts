import { describe, expect, it } from "vitest";
import { fmtInt } from "../../src/lib/format";
import { ENDING_SOON_MINUTES, callMarks, callTon, endingSoon, pingNotice, remainingLabel, remainingMinutes, saveCallArgs, savedNotice, sortCalls, waitingLabel } from "../../src/lib/compte/qg-salons";
import { PING_WAIT_CLAN_MINUTES, PING_WAIT_MEMBER_MINUTES, parseLobbyCalls, pingRefusal } from "../../src/lib/compte/salons";

const NOW = Date.parse("2026-11-14T20:00:00Z");
const at = (minutes: number, seconds = 0) => new Date(NOW + minutes * 60_000 + seconds * 1000).toISOString();

describe("le temps qui reste à un appel", () => {
  it("arrondit vers le haut : la dernière minute se dit jusqu'à la dernière seconde", () => {
    expect(remainingMinutes(at(11), NOW)).toBe(11);
    expect(remainingMinutes(at(10, 1), NOW)).toBe(11);
    expect(remainingMinutes(at(0, 1), NOW)).toBe(1);
  });

  it("vaut 0 pour un appel fini, jamais un nombre négatif", () => {
    expect(remainingMinutes(at(0), NOW)).toBe(0);
    expect(remainingMinutes(at(0, -1), NOW)).toBe(0);
    expect(remainingMinutes(at(-3), NOW)).toBe(0);
    expect(Object.is(remainingMinutes(at(0, -30), NOW), 0)).toBe(true);
  });

  it("compte les 15 minutes d'un appel qui vient de partir", () => {
    expect(remainingMinutes(at(15), NOW)).toBe(15);
    expect(remainingLabel(at(15), NOW)).toBe("encore 15 min");
  });

  it("ne dit rien d'une date illisible", () => {
    expect(remainingMinutes("demain", NOW)).toBeNull();
    expect(remainingMinutes("", NOW)).toBeNull();
    expect(remainingMinutes(at(5), Number.NaN)).toBeNull();
    expect(remainingMinutes(at(5), Number.POSITIVE_INFINITY)).toBeNull();
    expect(remainingLabel("demain", NOW)).toBeNull();
    expect(endingSoon("demain", NOW)).toBe(false);
  });

  it("s'écrit en mots", () => {
    expect(remainingLabel(at(11), NOW)).toBe("encore 11 min");
    expect(remainingLabel(at(1), NOW)).toBe("encore 1 min");
    expect(remainingLabel(at(0, 1), NOW)).toBe("encore 1 min");
    expect(remainingLabel(at(0), NOW)).toBe("se termine");
    expect(remainingLabel(at(-1), NOW)).toBe("se termine");
  });

  it("écrit un grand nombre comme le reste du site", () => {
    expect(remainingLabel(at(1500), NOW)).toBe(`encore ${fmtInt(1500)} min`);
  });

  it("finit bientôt à partir du seuil, pas avant", () => {
    expect(endingSoon(at(ENDING_SOON_MINUTES), NOW)).toBe(true);
    expect(endingSoon(at(ENDING_SOON_MINUTES - 1, 59), NOW)).toBe(true);
    expect(endingSoon(at(ENDING_SOON_MINUTES, 1), NOW)).toBe(false);
    expect(endingSoon(at(0), NOW)).toBe(true);
    expect(endingSoon(at(-5), NOW)).toBe(true);
  });

  it("le seuil tient dans les 15 minutes d'un appel", () => {
    expect(ENDING_SOON_MINUTES).toBeGreaterThan(0);
    expect(ENDING_SOON_MINUTES).toBeLessThan(15);
  });
});

describe("depuis quand un Gaulois attend", () => {
  it("compte les minutes entières écoulées", () => {
    expect(waitingLabel(at(0), NOW)).toBe("à l'instant");
    expect(waitingLabel(at(0, -59), NOW)).toBe("à l'instant");
    expect(waitingLabel(at(-1), NOW)).toBe("depuis 1 min");
    expect(waitingLabel(at(-12, -30), NOW)).toBe("depuis 12 min");
  });

  it("dit « à l'instant » d'un départ un peu en avance sur l'heure du serveur", () => {
    expect(waitingLabel(at(2), NOW)).toBe("à l'instant");
  });

  it("ne dit rien d'une date illisible, plutôt que d'inventer « à l'instant »", () => {
    expect(waitingLabel("hier", NOW)).toBeNull();
    expect(waitingLabel("", NOW)).toBeNull();
    expect(waitingLabel(at(-4), Number.NaN)).toBeNull();
  });
});

describe("la couleur d'une ligne", () => {
  it("bleu pour mon appel, même s'il finit bientôt", () => {
    expect(callTon({ mine: true, expiresAt: at(1) }, NOW)).toBe("ally");
    expect(callTon({ mine: true, expiresAt: at(-1) }, NOW)).toBe("ally");
  });

  it("jaune pour un appel qui finit bientôt ou dont la fin est passée, vert sinon", () => {
    expect(callTon({ mine: false, expiresAt: at(2) }, NOW)).toBe("warn");
    expect(callTon({ mine: false, expiresAt: at(-1) }, NOW)).toBe("warn");
    expect(callTon({ mine: false, expiresAt: at(11) }, NOW)).toBe("ok");
  });

  it("la couleur suit le mot du temps restant", () => {
    for (const minutes of [-2, 0, 1, 2, 3, 4, 10, 15]) {
      const expiresAt = at(minutes, 0);
      expect(callTon({ mine: false, expiresAt }, NOW) === "warn").toBe(endingSoon(expiresAt, NOW));
    }
  });
});

describe("les états d'un appel", () => {
  it("un appel sans Discord et qui n'est pas le mien n'en a aucun", () => {
    expect(callMarks({ mine: false, discord: false, ping: false })).toEqual([]);
  });

  it("le ping remplace « Sur Discord »", () => {
    expect(callMarks({ mine: false, discord: true, ping: false }).map((mark) => mark.label)).toEqual(["Sur Discord"]);
    expect(callMarks({ mine: false, discord: true, ping: true }).map((mark) => mark.label)).toEqual(["Ping parti"]);
  });

  it("un ping sans message Discord n'est pas annoncé", () => {
    expect(callMarks({ mine: false, discord: false, ping: true })).toEqual([]);
  });

  it("le mien vient d'abord, en bleu", () => {
    expect(callMarks({ mine: true, discord: true, ping: true })).toEqual([
      { key: "mine", ton: "ally", label: "Le mien" },
      { key: "ping", ton: "ok", label: "Ping parti" },
    ]);
    expect(callMarks({ mine: true, discord: false, ping: false })).toEqual([{ key: "mine", ton: "ally", label: "Le mien" }]);
  });

  it("chaque état a sa clé, unique sur la ligne", () => {
    for (const mine of [true, false])
      for (const discord of [true, false])
        for (const ping of [true, false]) {
          const keys = callMarks({ mine, discord, ping }).map((mark) => mark.key);
          expect(new Set(keys).size).toBe(keys.length);
        }
  });
});

describe("l'ordre des lignes", () => {
  const calls = [
    { id: 1, mine: false, createdAt: at(-9) },
    { id: 2, mine: false, createdAt: at(-2) },
    { id: 3, mine: true, createdAt: at(-12) },
    { id: 4, mine: false, createdAt: at(-2) },
  ];

  it("mon appel d'abord, puis les plus récents, l'ordre du serveur à date égale", () => {
    expect(sortCalls(calls).map((call) => call.id)).toEqual([3, 2, 4, 1]);
  });

  it("ne modifie pas la liste reçue", () => {
    const before = calls.map((call) => call.id);
    sortCalls(calls);
    expect(calls.map((call) => call.id)).toEqual(before);
  });

  it("une liste vide reste vide", () => {
    expect(sortCalls([])).toEqual([]);
  });

  it("une date illisible passe après les autres, sans casser l'ordre", () => {
    const mixed = [
      { id: 1, mine: false, createdAt: "?" },
      { id: 2, mine: false, createdAt: at(-5) },
      { id: 3, mine: false, createdAt: "?" },
    ];
    expect(sortCalls(mixed).map((call) => call.id)).toEqual([2, 1, 3]);
  });

  it("garde l'ordre d'une réponse relue par parseLobbyCalls", () => {
    const parsed = parseLobbyCalls({
      now: at(0),
      discord: true,
      ping_possible: true,
      calls: [
        { id: 7, game: "AbCd1234", format: null, created_at: at(-9), expires_at: at(6), name: "Epona", mine: false, discord: true, ping: false },
        { id: 8, game: "XyZw9876", format: null, created_at: at(-1), expires_at: at(14), name: "Litavicos", mine: true, discord: true, ping: true },
        { id: 9, game: "Qwerty12", format: null, created_at: at(-4), expires_at: at(11), name: "Tarvos", mine: false, discord: false, ping: false },
      ],
    });
    expect(parsed).not.toBeNull();
    expect(sortCalls(parsed!.calls).map((call) => call.name)).toEqual(["Litavicos", "Tarvos", "Epona"]);
  });
});

describe("l'envoi d'un appel", () => {
  it("n'envoie le ping que coché, pour un serveur qui ne le connaît pas encore", () => {
    expect(saveCallArgs("Qwerty12", false)).toEqual({ p_game: "Qwerty12", p_format: null });
    expect("p_ping" in saveCallArgs("Qwerty12", false)).toBe(false);
    expect(saveCallArgs("Qwerty12", true)).toEqual({ p_game: "Qwerty12", p_format: null, p_ping: true });
  });

  it("dit ce que le serveur a répondu, sans plus", () => {
    expect(savedNotice({ discord: false, ping: null })).toBe("Les Gaulois sont prévenus.");
    expect(savedNotice(null)).toBe("Les Gaulois sont prévenus.");
    expect(savedNotice(undefined)).toBe("Les Gaulois sont prévenus.");
    expect(savedNotice({ discord: true, ping: null })).toBe("Les Gaulois sont prévenus. L'appel part aussi sur Discord.");
    expect(savedNotice({ discord: true, ping: "sent" })).toBe("Les Gaulois sont prévenus. L'appel part aussi sur Discord, avec un ping.");
  });

  it("dit pourquoi un ping demandé n'est pas parti", () => {
    expect(savedNotice({ discord: true, ping: "member" })).toBe(`Les Gaulois sont prévenus. L'appel part aussi sur Discord. ${pingRefusal("member")}`);
    expect(savedNotice({ discord: true, ping: "clan" })).toContain(`${PING_WAIT_CLAN_MINUTES} minutes`);
    expect(savedNotice({ discord: true, ping: "failed" })).toContain("a échoué");
  });

  it("ne prend pas un « discord » qui n'est pas un vrai oui", () => {
    expect(savedNotice({ discord: "true" })).toBe("Les Gaulois sont prévenus.");
    expect(savedNotice({ discord: 1 })).toBe("Les Gaulois sont prévenus.");
  });

  it("ne devine rien d'un code de ping inconnu", () => {
    expect(savedNotice({ discord: true, ping: "peut-être" })).toBe("Les Gaulois sont prévenus. L'appel part aussi sur Discord.");
  });
});

describe("le ping après coup", () => {
  it("dit qu'il est parti, ou pourquoi il ne l'est pas", () => {
    expect(pingNotice({ ping: "sent" })).toBe("Ping parti sur Discord.");
    expect(pingNotice({ ping: "member" })).toContain(`${PING_WAIT_MEMBER_MINUTES} minutes`);
    expect(pingNotice({ ping: "none" })).toBe(pingRefusal("none"));
  });

  it("ne dit rien d'une réponse vide ou d'un code inconnu", () => {
    expect(pingNotice(null)).toBe("");
    expect(pingNotice(undefined)).toBe("");
    expect(pingNotice({})).toBe("");
    expect(pingNotice({ ping: "autre" })).toBe("");
  });
});
