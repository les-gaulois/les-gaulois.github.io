import { afterEach, describe, expect, it, vi } from "vitest";
import { ServerError, avecDelai } from "../../src/lib/compte/api";
import { errorMessage } from "../../src/lib/compte/errors";
import { motsDuRefus, secondesAvantLaMinute } from "../../src/lib/village/ecran-casino";
import { motsDuRefusEnMain } from "../../src/lib/village/ecran-vingt-et-un";

// Le casino ne se fige plus (24 novembre 2026, « je jouais au black jack et d'un coup plus rien ne marche ») : une animation
// qui lève ne bloque plus les autres, un appel sans réponse devient un refus au bout de 20 secondes, et le refus de cadence
// dit quand on pourra rejouer.

describe("la boucle d'animation du casino", () => {
  const images: ((t: number) => void)[] = [];
  const pannes: string[] = [];
  const avant = { raf: globalThis.requestAnimationFrame, window: (globalThis as { window?: unknown }).window };
  const image = (t: number): void => {
    const l = images.splice(0);
    for (const f of l) f(t);
  };
  afterEach(() => {
    globalThis.requestAnimationFrame = avant.raf;
    (globalThis as { window?: unknown }).window = avant.window;
    vi.restoreAllMocks();
  });

  it("retire seule la tâche qui lève, laisse les autres finir, et annonce la panne", async () => {
    globalThis.requestAnimationFrame = ((f: (t: number) => void) => images.push(f)) as typeof requestAnimationFrame;
    (globalThis as { window?: unknown }).window = { dispatchEvent: (e: Event) => pannes.push(e.type), addEventListener: () => undefined };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { PANNE_DU_CASINO, anime } = await import("../../src/components/village/casino/commun");
    let fautive = 0;
    let saine = 0;
    anime(() => {
      fautive++;
      throw new Error("une scène en panne");
    });
    anime((t) => {
      saine++;
      if (t >= 3) return false;
    });
    image(1);
    image(2);
    image(3);
    // La tâche fautive n'a tourné qu'une fois, la saine jusqu'au bout, et la boucle s'est arrêtée d'elle-même.
    expect(fautive).toBe(1);
    expect(saine).toBe(3);
    expect(images).toHaveLength(0);
    expect(pannes).toEqual([PANNE_DU_CASINO]);
    // Une animation suivante repart : la tâche fautive ne revient pas devant elle.
    let suivante = 0;
    anime(() => {
      suivante++;
      return false;
    });
    image(4);
    expect([fautive, suivante]).toEqual([1, 1]);
  });
});

describe("un appel du casino sans réponse", () => {
  afterEach(() => vi.useRealTimers());

  it("devient un refus « delai » au bout du délai, sans rien attendre de plus", async () => {
    vi.useFakeTimers();
    const jamais = new Promise<number>(() => undefined);
    const p = avecDelai(jamais, 20_000);
    const verdict = p.then(
      () => "réponse",
      (e: unknown) => (e instanceof ServerError ? e.code : "autre"),
    );
    await vi.advanceTimersByTimeAsync(19_999);
    let fini = false;
    void verdict.then(() => (fini = true));
    await Promise.resolve();
    expect(fini).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await verdict).toBe("delai");
    expect(errorMessage("delai")).toMatch(/le coup a pu partir.*rechargez la page/);
  });

  it("rend la réponse ou le refus du serveur quand ils arrivent à temps", async () => {
    await expect(avecDelai(Promise.resolve(7), 50)).resolves.toBe(7);
    await expect(avecDelai(Promise.reject(new ServerError("rate_limited")), 50)).rejects.toMatchObject({ code: "rate_limited" });
  });
});

describe("ce que dit le croupier", () => {
  it("dit quand on pourra rejouer après le refus de cadence (30 actions par minute de l'horloge)", () => {
    expect(secondesAvantLaMinute(new Date(2026, 10, 24, 10, 15, 37))).toBe(23);
    expect(secondesAvantLaMinute(new Date(2026, 10, 24, 10, 15, 0))).toBe(60);
    expect(motsDuRefus("rate_limited", { secondes: 23 })).toEqual(["Doucement", "Trop de coups cette minute : reprise dans 23 secondes"]);
    // Sans le temps (le frein de la palissade compte sur une minute glissante), la phrase reste générale.
    expect(motsDuRefus("rate_limited")).toEqual(["Doucement", "Un instant entre deux tours"]);
    expect(motsDuRefusEnMain("rate_limited")[1]).toMatch(/^Trop de coups cette minute : reprise dans \d+ secondes$/);
  });
  it("dit que le serveur ne répond pas, et quoi faire si cela dure", () => {
    // Le coup a pu partir : le casino relit la bourse et les dernières parties, et le dit.
    expect(motsDuRefus("delai")).toEqual(["Le serveur ne répond pas", "Le coup a pu partir : la bourse se relit"]);
    expect(motsDuRefusEnMain("delai")).toEqual(["Le serveur ne répond pas", "Le coup a pu partir : la bourse se relit"]);
  });
});

describe("le plafond du jour, lisible d'un coup d'œil", () => {
  const etat = (reste: number, god = false) => ({ ouvert: true, god, plafond: 12500, mise_du_jour: 12500 - reste, reste_du_jour: reste, jetons: [10, 20, 50, 100, 200], mise_au_plus: 200 });

  it("est atteint quand il ne reste pas même le plus petit jeton, bas sous une table pleine, et ne dit rien en essai", async () => {
    const { etatDuPlafond } = await import("../../src/lib/village/ecran-casino");
    expect(etatDuPlafond(etat(0))).toEqual({ niveau: "atteint", plafond: 12500, misee: 12500, reste: 0 });
    expect(etatDuPlafond(etat(10))).toEqual({ niveau: "bas", plafond: 12500, misee: 12490, reste: 10 });
    expect(etatDuPlafond(etat(190))).toEqual({ niveau: "bas", plafond: 12500, misee: 12310, reste: 190 });
    // Casino fermé : c'est la fermeture qui se dit.
    expect(etatDuPlafond({ ...etat(0), ouvert: false })).toBeNull();
    expect(etatDuPlafond(etat(200))).toBeNull();
    expect(etatDuPlafond(etat(0, true))).toBeNull();
    // Le plafond est celui que le serveur donne, quel qu'il soit.
    expect(etatDuPlafond({ ...etat(0), plafond: 2000 })).toMatchObject({ niveau: "atteint", plafond: 2000 });
  });

  it("compte jusqu'à minuit à l'heure de Paris, en hiver comme en été", async () => {
    const { avantMinuitAParis, dureeEnMots } = await import("../../src/lib/village/ecran-casino");
    // 24 novembre 2026, 18 h 48 min 30 s à Paris (17 h 48 UTC) : 5 h 12 min avant minuit, arrondi à la minute du dessus.
    expect(avantMinuitAParis(new Date("2026-11-24T17:48:30Z"))).toEqual({ heures: 5, minutes: 12 });
    // L'été, Paris est à UTC + 2 : 23 h 59 min 30 s à Paris.
    expect(avantMinuitAParis(new Date("2026-07-14T21:59:30Z"))).toEqual({ heures: 0, minutes: 1 });
    // Minuit pile à Paris : le jour vient de changer (le casino se relit à la demi-minute suivante).
    expect(avantMinuitAParis(new Date("2026-11-24T23:00:00Z"))).toEqual({ heures: 0, minutes: 0 });
    expect(dureeEnMots({ heures: 5, minutes: 12 })).toBe("5 heures et 12 minutes");
    expect(dureeEnMots({ heures: 1, minutes: 0 })).toBe("1 heure");
    expect(dureeEnMots({ heures: 0, minutes: 1 })).toBe("1 minute");
    expect(dureeEnMots({ heures: 0, minutes: 0 })).toBe("moins d'une minute");
  });
});
