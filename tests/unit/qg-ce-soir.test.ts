import { describe, expect, it } from "vitest";
import { othersPlanned, planOthersLabel } from "../../src/lib/compte/outils";
import { fmtInt } from "../../src/lib/format";
import { PLAN_FACES_SHOWN, PLAN_PEAK_MIN, planBand, planFaces, planSpoken, planWhen } from "../../src/lib/compte/qg-ce-soir";

const H = 3_600_000;
// Le 14 novembre 2026 à 20 h 20, heure de Paris (19 h 20 en temps universel).
const now = new Date("2026-11-14T19:20:00Z");
const at = (hours: number) => new Date(Date.parse("2026-11-14T19:00:00Z") + hours * H).toISOString();
const face = (name: string) => ({ name, role: "member" as const, avatar: null });

describe("planBand", () => {
  it("donne douze heures, de l'heure en cours à la onzième suivante", () => {
    const band = planBand({ mine: null, hours: [] }, now);
    expect(band).toHaveLength(12);
    expect(band[0]!.at).toBe(at(0));
    expect(band[0]!.label).toBe("Maintenant");
    expect(band[1]!.label).toBe("21 h");
    expect(band[11]!.at).toBe(at(11));
    expect(band.every((slot) => slot.proposed)).toBe(true);
    expect(band.map((slot) => slot.current)).toEqual([true, ...Array<boolean>(11).fill(false)]);
  });

  it("personne n'a dit son heure : tout est gris, sans barre ni heure marquée", () => {
    const band = planBand({ mine: null, hours: [] }, now);
    expect(band.every((slot) => slot.count === 0 && slot.share === 0 && slot.ton === "muted" && !slot.mine && !slot.peak)).toBe(true);
  });

  it("moi seul : mon heure en vert, une demi-barre, pas d'heure « le plus de monde »", () => {
    const band = planBand({ mine: at(2), hours: [{ at: at(2), count: 1, faces: [face("Epona")] }] }, now);
    // Un Gaulois seul ne remplit pas sa barre : une barre pleine dirait « le plus de monde ».
    expect(band[2]).toMatchObject({ count: 1, mine: true, peak: false, share: 1 / PLAN_PEAK_MIN, ton: "ok" });
    expect(band[2]!.faces).toEqual([face("Epona")]);
    expect(band.filter((slot) => slot.mine)).toHaveLength(1);
    expect(band.some((slot) => slot.peak)).toBe(false);
  });

  it("plusieurs heures d'un seul Gaulois : aucune barre pleine, aucune « le plus de monde »", () => {
    const band = planBand(
      {
        mine: null,
        hours: [
          { at: at(1), count: 1, faces: [] },
          { at: at(4), count: 1, faces: [] },
        ],
      },
      now,
    );
    expect(band.filter((slot) => slot.count > 0).map((slot) => slot.share)).toEqual([0.5, 0.5]);
    expect(band.some((slot) => slot.peak || slot.share === 1)).toBe(false);
  });

  it("rapporte chaque barre à l'heure la plus remplie, et marque celle-ci en jaune", () => {
    const band = planBand(
      {
        mine: null,
        hours: [
          { at: at(0), count: 5, faces: [] },
          { at: at(3), count: 25, faces: [] },
          { at: at(4), count: 1, faces: [] },
        ],
      },
      now,
    );
    expect(band[0]).toMatchObject({ count: 5, share: 0.2, ton: "ally", peak: false });
    expect(band[3]).toMatchObject({ count: 25, share: 1, ton: "warn", peak: true });
    expect(band[4]).toMatchObject({ count: 1, share: 0.04, ton: "ally" });
    expect(band[1]).toMatchObject({ count: 0, share: 0, ton: "muted" });
  });

  it("mon heure garde le vert quand c'est aussi celle où il y a le plus de monde", () => {
    const band = planBand({ mine: at(1), hours: [{ at: at(1), count: 6, faces: [] }] }, now);
    expect(band[1]).toMatchObject({ mine: true, peak: true, ton: "ok", share: 1 });
  });

  it("à égalité, l'heure la plus proche est celle où il y a le plus de monde ; l'autre a aussi sa barre pleine", () => {
    const band = planBand(
      {
        mine: null,
        hours: [
          { at: at(5), count: 4, faces: [] },
          { at: at(2), count: 4, faces: [] },
        ],
      },
      now,
    );
    expect(band.filter((slot) => slot.peak).map((slot) => slot.at)).toEqual([at(2)]);
    expect(band[5]).toMatchObject({ peak: false, share: 1, ton: "ally" });
  });

  it("reconnaît l'heure écrite par le serveur (« +00:00 ») comme celle du navigateur (« Z »)", () => {
    const server = at(2).replace(".000Z", "+00:00");
    const band = planBand({ mine: server, hours: [{ at: server, count: 2, faces: [] }] }, now);
    expect(band[2]).toMatchObject({ count: 2, mine: true });
    // Ce qui part au serveur reste l'heure de la bande.
    expect(band[2]!.at).toBe(at(2));
  });

  it("deux lignes pour la même heure (« Z » et « +00:00 ») n'en font qu'une : nombres additionnés, mêmes chiffres partout", () => {
    const plans = {
      mine: null,
      hours: [
        { at: at(3), count: 2, faces: [face("Epona")] },
        { at: at(3).replace(".000Z", "+00:00"), count: 3, faces: [face("Tarvos")] },
        { at: at(5), count: 4, faces: [] },
      ],
    };
    const band = planBand(plans, now);
    expect(band).toHaveLength(12);
    expect(band[3]).toMatchObject({ count: 5, peak: true, share: 1, ton: "warn" });
    expect(band[3]!.faces).toEqual([face("Epona"), face("Tarvos")]);
    expect(band[5]).toMatchObject({ count: 4, peak: false, share: 0.8 });
    // Le nombre de l'onglet additionne de même.
    expect(band.reduce((sum, slot) => sum + slot.count, 0)).toBe(othersPlanned(plans, now));
  });

  it("mon heure absente des heures du serveur : elle me compte, en vert, sans devenir « le plus de monde »", () => {
    const band = planBand({ mine: at(4), hours: [{ at: at(6), count: 3, faces: [] }] }, now);
    expect(band[4]).toMatchObject({ count: 1, mine: true, peak: false, ton: "ok", share: 1 / 3 });
    expect(band[6]).toMatchObject({ count: 3, peak: true, ton: "warn" });
    // Le nombre de l'onglet ne compte que les autres : le mien n'y était pas.
    expect(othersPlanned({ mine: at(4), hours: [{ at: at(6), count: 3, faces: [] }] }, now)).toBe(3);
  });

  it("une heure n'a jamais moins de Gaulois que de visages montrés", () => {
    const faces = [face("Epona"), face("Tarvos"), face("Brennos")];
    const band = planBand({ mine: null, hours: [{ at: at(2), count: 2, faces }] }, now);
    expect(band[2]).toMatchObject({ count: 3, peak: true });
    expect(planOthersLabel(band[2]!.count, band[2]!.faces.length)).toBeNull();
  });

  it("un nombre négatif compte zéro", () => {
    const band = planBand({ mine: null, hours: [{ at: at(2), count: -4, faces: [] }] }, now);
    expect(band[2]).toMatchObject({ count: 0, share: 0, ton: "muted" });
  });

  it("oublie une heure finie, la mienne comprise, et ne compte pas les barres sur elle", () => {
    const band = planBand(
      {
        mine: at(-1),
        hours: [
          { at: at(-1), count: 30, faces: [] },
          { at: at(0), count: 3, faces: [] },
        ],
      },
      now,
    );
    expect(band).toHaveLength(12);
    expect(band.some((slot) => slot.mine)).toBe(false);
    expect(band[0]).toMatchObject({ count: 3, share: 1, peak: true });
  });

  it("au passage de l'heure, page ouverte : l'heure finie part, « Maintenant » avance, une heure s'ajoute au bout", () => {
    const plans = {
      mine: at(1),
      hours: [
        { at: at(1), count: 2, faces: [face("Epona")] },
        { at: at(2), count: 3, faces: [] },
      ],
    };
    const before = planBand(plans, new Date(Date.parse(at(1)) + 59 * 60_000 + 59_000));
    expect(before[0]).toMatchObject({ at: at(1), label: "Maintenant", mine: true, count: 2 });
    expect(before[1]).toMatchObject({ at: at(2), label: "22 h", peak: true });
    const after = planBand(plans, new Date(Date.parse(at(2)) + 30_000));
    expect(after).toHaveLength(12);
    expect(after.some((slot) => slot.at === at(1) || slot.mine)).toBe(false);
    expect(after[0]).toMatchObject({ at: at(2), label: "Maintenant", current: true, count: 3, peak: true, share: 1 });
    expect(after[11]!.at).toBe(at(13));
    // Pile à l'heure : l'heure qui finit n'est plus là.
    expect(planBand(plans, new Date(at(2)))[0]!.at).toBe(at(2));
  });

  it("garde à part une heure annoncée au-delà des douze proposées : comptée, jamais à choisir", () => {
    const band = planBand(
      {
        mine: null,
        hours: [
          { at: at(3), count: 2, faces: [] },
          { at: at(12), count: 4, faces: [face("Epona")] },
        ],
      },
      now,
    );
    expect(band).toHaveLength(13);
    expect(band.filter((slot) => slot.proposed)).toHaveLength(12);
    expect(band[12]).toMatchObject({ at: at(12), label: "8 h", proposed: false, count: 4, peak: true, share: 1 });
    expect(band[3]).toMatchObject({ peak: false, share: 0.5 });
  });

  it("mon heure au-delà des douze, absente des heures du serveur, reste la mienne", () => {
    const band = planBand({ mine: at(12), hours: [] }, now);
    expect(band[12]).toMatchObject({ at: at(12), proposed: false, mine: true, count: 1, ton: "ok" });
    expect(band.filter((slot) => slot.proposed).some((slot) => slot.mine)).toBe(false);
  });

  it("la nuit du passage à l'heure d'hiver, « 2 h » revient : la seconde est marquée", () => {
    // Le 25 octobre 2026 à 0 h 30, heure d'été de Paris : à 1 h en temps universel, 3 h redevient 2 h.
    const band = planBand({ mine: null, hours: [] }, new Date("2026-10-24T22:30:00Z"));
    expect(band.slice(0, 5).map((slot) => slot.label)).toEqual(["Maintenant", "1 h", "2 h", "2 h", "3 h"]);
    expect(band.map((slot) => slot.again)).toEqual([false, false, false, true, ...Array<boolean>(8).fill(false)]);
    expect(band[3]!.at).toBe("2026-10-25T01:00:00.000Z");
    expect(new Set(band.map((slot) => slot.at)).size).toBe(12);
  });

  it("la nuit du passage à l'heure d'été, « 2 h » n'existe pas", () => {
    // Le 29 mars 2026 à 0 h 30, heure d'hiver de Paris : à 1 h en temps universel, 2 h devient 3 h.
    const band = planBand({ mine: null, hours: [] }, new Date("2026-03-28T23:30:00Z"));
    expect(band.slice(0, 4).map((slot) => slot.label)).toEqual(["Maintenant", "1 h", "3 h", "4 h"]);
    expect(band.some((slot) => slot.again)).toBe(false);
  });
});

describe("planSpoken et planWhen", () => {
  it("fait du bouton d'une heure une phrase claire à l'oreille, l'heure vue d'abord", () => {
    const band = planBand(
      {
        mine: at(3),
        hours: [
          { at: at(0), count: 1, faces: [] },
          { at: at(3), count: 6, faces: [] },
          { at: at(4), count: 1234, faces: [] },
        ],
      },
      now,
    );
    expect(planSpoken(band[3]!)).toBe("23 h, 6 Gaulois, votre heure");
    expect(planSpoken(band[4]!)).toBe(`0 h, ${fmtInt(1234)} Gaulois, le plus de monde`);
    expect(planSpoken(band[0]!)).toBe("Maintenant, 1 Gaulois");
    expect(planSpoken(band[1]!)).toBe("21 h");
    const both = planBand({ mine: at(2), hours: [{ at: at(2), count: 6, faces: [] }] }, now);
    expect(planSpoken(both[2]!)).toBe("22 h, 6 Gaulois, votre heure, le plus de monde");
    const autumn = planBand({ mine: null, hours: [{ at: "2026-10-25T01:00:00+00:00", count: 2, faces: [] }] }, new Date("2026-10-24T22:30:00Z"));
    expect(planSpoken(autumn[3]!)).toBe("2 h, heure d'hiver, 2 Gaulois, le plus de monde");
  });

  it("dit quand, dans une phrase", () => {
    const band = planBand({ mine: null, hours: [] }, now);
    expect(planWhen(band[0]!)).toBe("maintenant");
    expect(planWhen(band[1]!)).toBe("à 21 h");
    const autumn = planBand({ mine: null, hours: [] }, new Date("2026-10-24T22:30:00Z"));
    expect(autumn.slice(2, 4).map(planWhen)).toEqual(["à 2 h", "à 2 h, heure d'hiver"]);
  });
});

describe("planFaces", () => {
  const list = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("montre tout tant que le repli ne ferait gagner qu'un ou deux visages", () => {
    expect(planFaces([])).toEqual({ first: [], rest: [] });
    expect(planFaces(list(PLAN_FACES_SHOWN + 2))).toEqual({ first: list(PLAN_FACES_SHOWN + 2), rest: [] });
  });

  it("replie la suite au-delà, sans perdre ni doubler un visage", () => {
    const { first, rest } = planFaces(list(25));
    expect(first).toEqual(list(PLAN_FACES_SHOWN));
    expect(rest).toHaveLength(25 - PLAN_FACES_SHOWN);
    expect([...first, ...rest]).toEqual(list(25));
    expect(planFaces(list(PLAN_FACES_SHOWN + 3)).rest).toHaveLength(3);
  });
});
