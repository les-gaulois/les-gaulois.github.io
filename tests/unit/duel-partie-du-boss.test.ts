import { beforeEach, describe, expect, it, vi } from "vitest";

// Le serveur du duel, simulé : chaque essai dit ce que rendent commencer_duel et jouer_manche_duel.
const appels: [string, ...unknown[]][] = [];
let carteMachine: number | undefined = 2;
let recompense: { pas: number } | null = null;
vi.mock("../../src/lib/compte/api", () => {
  class ServerError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return {
    ServerError,
    duel: {
      commencer: vi.fn(async (contre: string, cle: string | null, main: unknown) => {
        appels.push(["commencer", contre, cle, main]);
        return { ok: true, partie: { partie: 77 } };
      }),
      jouerManche: vi.fn(async (partie: number, manche: number, carte: number) => {
        appels.push(["manche", partie, manche, carte]);
        return { ok: true, partie: { partie, recompense }, ...(carteMachine === undefined ? {} : { carte_machine: carteMachine }) };
      }),
    },
  };
});
const { ServerError } = await import("../../src/lib/compte/api");
const B = await import("../../src/components/village/duel/partie-du-boss");
const C = await import("../../supabase/functions/code-discord/duel/contenu/index");

const MAIN = ["epee", "casque", "cotte-mailles", "bottes-or", "braies-retroussees"];

describe("la partie contre le boss, au serveur", () => {
  beforeEach(() => {
    appels.length = 0;
    carteMachine = 2;
    recompense = null;
  });

  it("commence la partie à la première manche, avec la main rangée par emplacement, puis joue manche par manche", async () => {
    const partie = B.partieContreLeBoss(() => MAIN);
    expect(await partie.jouer(0, 1)).toBe(2);
    expect(await partie.jouer(3, 2)).toBe(2);
    expect(appels).toEqual([
      ["commencer", "boss", null, { arme: "epee", tete: "casque", haut: "cotte-mailles", pieds: "bottes-or", bas: "braies-retroussees" }],
      ["manche", 77, 1, 0],
      ["manche", 77, 2, 3],
    ]);
    expect(partie.pas()).toBeNull();
  });

  it("poursuit une partie que le serveur garde ouverte, sans en commencer une autre", async () => {
    const partie = B.partieContreLeBoss(() => MAIN, 12);
    await partie.jouer(1, 3);
    expect(appels).toEqual([["manche", 12, 3, 1]]);
  });

  it("retient les pas du pass que le serveur donne à la fin", async () => {
    const partie = B.partieContreLeBoss(() => MAIN, 12);
    recompense = { pas: 3 };
    await partie.jouer(0, 6);
    expect(partie.pas()).toBe(3);
  });

  it("refuse par « partie_finie » une manche sans carte de la machine (partie close entre-temps)", async () => {
    carteMachine = undefined;
    const partie = B.partieContreLeBoss(() => MAIN, 12);
    const refus = await partie.jouer(0, 2).catch((e: unknown) => e);
    expect(refus).toBeInstanceOf(ServerError);
    expect((refus as InstanceType<typeof ServerError>).code).toBe("partie_finie");
  });
});

describe("le boss et son mot de la fin", () => {
  it("reprend le boss d'une partie ouverte, même si ce n'est plus celui du jour ; sinon celui du jour", () => {
    const autre = C.BOSS.find((b) => b.id !== C.bossDuJour(new Date()).id)!;
    expect(B.bossDAujourdHui(autre.id).id).toBe(autre.id);
    expect(B.bossDAujourdHui("inconnu").id).toBe(C.bossDuJour(new Date()).id);
    expect(B.bossDAujourdHui().id).toBe(C.bossDuJour(new Date()).id);
  });

  it("dit l'égalité, l'essai sans gain, et les pas d'un duel compté", () => {
    const boss = B.bossDAujourdHui();
    const fin = (verdict: number) => ({ verdict, manches: 5, vieMoi: 3, vieLui: 0 });
    expect(B.motDeFinDuBoss(boss, true, () => null)(fin(0))).toBe("Égalité.");
    expect(B.motDeFinDuBoss(boss, false, () => null)(fin(1))).toBe(`${boss.repliques.vaincu} Essai : rien n'est gagné ni perdu.`);
    expect(B.motDeFinDuBoss(boss, true, () => 2)(fin(1))).toBe(`${boss.repliques.vaincu} Duel compté : 2 pas du pass.`);
    expect(B.motDeFinDuBoss(boss, true, () => null)(fin(-1))).toBe(boss.repliques.vainqueur);
  });

  it("habille le boss de sa main sur le corps de son Gaulois unique", () => {
    const boss = B.bossDAujourdHui();
    const tenue = B.tenueDuBoss(boss) as unknown as Record<string, string>;
    expect(tenue["modele"]).toBe(boss.id);
    expect(boss.main.every((id) => Object.values(tenue).includes(id))).toBe(true);
  });
});

describe("les défis", () => {
  it("un adversaire qui annonce joue la carte annoncée, à partir de la manche de départ du défi", () => {
    for (const d of B.DEFIS.filter((x) => x.adversaire !== "libre")) {
      const s = B.sceneDuDefi(d);
      const { a, b, m } = s.depart();
      expect(s.annonce).toBe(true);
      expect(m).toBe(d.manche);
      const annonce = (d.adversaire as { annonce: readonly string[] }).annonce[0]!;
      expect(d.lui.main[s.choisir(b, a, m)]).toBe(annonce);
    }
  });

  it("un adversaire libre est la machine : elle pose une de ses cartes", () => {
    const libres = B.DEFIS.filter((x) => x.adversaire === "libre");
    expect(libres.length).toBeGreaterThan(0);
    for (const d of libres) {
      const s = B.sceneDuDefi(d);
      const { a, b, m } = s.depart();
      expect(s.annonce).toBe(false);
      const i = s.choisir(b, a, m);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(d.lui.main.length);
    }
  });

  it("l'issue d'un défi suit le contenu", () => {
    const d = B.DEFIS[0]!;
    const s = B.sceneDuDefi(d);
    const { a, b } = s.depart();
    expect(s.issue(a, b, false, 0)).toBe(C.issueDuDefi(d, a as never, b as never, false, 0));
  });
});
