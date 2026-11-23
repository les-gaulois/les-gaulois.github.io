import { describe, expect, it } from "vitest";
import {
  LACHERS_PAR_MINUTE,
  ORDRE_DES_RANGS,
  RANGS_DES_COUPES,
  SceneDeLaPalissade,
  avancerLaChute,
  bourseDesLachers,
  chancesDuRang,
  chancesEnMots,
  coupesEnMots,
  lacherPermis,
  dansVelours,
  ecrireLaChute,
  etiquetteDeGain,
  mesurerLaPalissade,
  peindreLeDecor,
  placesDesLachers,
  rangDeLaCoupe,
  texteDuRendu,
  xDeLaCoupe,
  xDuPieu,
  type EffetDeChute,
} from "../../src/lib/jeu/casino-palissade";
import type { FabriqueDImages, ImageDeLaScene, Pinceau } from "../../src/lib/jeu/casino-scene";
import { BORDEAUX, OR, Toile, hexDe, ton } from "../../src/lib/jeu/casino-toile";
import { CHANCES_DES_COUPES, DIXIEMES_DES_COUPES, coupeDe, renduDeLaCoupe } from "../../src/lib/village/casino/palissade";
import { foisEcrit } from "../../src/lib/village/casino/commun";
import { resumeDeLaPartie } from "../../src/lib/village/ecran-casino";

// La palissade du casino (maquette « Le Palais d'or » validée par le pilote) : les rangs des coupes et leurs chances, le
// panneau qui tient dans sa place, la chute qui suit pieu par pieu le chemin du serveur et finit toujours dans la coupe tirée,
// plusieurs statères à la fois, et la bourse de la barre qui ne montre jamais un gain avant sa coupe.

function graine(s: number): () => number {
  let x = s >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}
const pleins = (t: Toile): number => {
  let n = 0;
  for (let i = 3; i < t.d.length; i += 4) if (t.d[i]) n++;
  return n;
};
const fabrique: FabriqueDImages = {
  image: (t: Toile) => ({ width: t.w, height: t.h }) as unknown as ImageDeLaScene,
  surface: (w: number, h: number) => ({ image: { width: w, height: h } as unknown as ImageDeLaScene, pinceau: pinceau() }),
};
function pinceau(): Pinceau {
  const rien = (): void => undefined;
  return { fillStyle: "", globalAlpha: 1, imageSmoothingEnabled: true, clearRect: rien, save: rien, restore: rien, beginPath: rien, rect: rien, clip: rien, fillRect: rien, drawImage: rien } as unknown as Pinceau;
}
/** Les 256 chemins possibles. */
const CHEMINS = Array.from({ length: 256 }, (_, n) => Array.from({ length: 8 }, (_, r) => (n >> r) & 1));
const LARGEURS = [280, 310, 358, 760, 1044, 1524];

describe("les coupes", () => {
  it("ont leur chiffre, leurs mots et leurs chances, ceux des règles du serveur", () => {
    for (let k = 0; k < 9; k++) {
      const r = rangDeLaCoupe(k);
      expect(r.signe).toBe(foisEcrit(DIXIEMES_DES_COUPES[k]!));
      expect(r.court).toBe(resumeDeLaPartie({ jeu: "palissade", coupe: k }));
    }
    expect(ORDRE_DES_RANGS.map(chancesDuRang)).toEqual([2, 16, 56, 112, 70]);
    expect(ORDRE_DES_RANGS.reduce((a, d) => a + chancesDuRang(d), 0)).toBe(256);
    expect(CHANCES_DES_COUPES.reduce((a, b) => a + b, 0)).toBe(256);
    expect(Object.keys(RANGS_DES_COUPES).map(Number).sort((a, b) => a - b)).toEqual([2, 5, 15, 40, 190]);
  });

  it("montrent un rendu partiel en neutre, jamais en or ni avec un « + »", () => {
    expect(texteDuRendu(renduDeLaCoupe(10, 4), 10)).toEqual({ texte: "2", fort: false });
    expect(texteDuRendu(renduDeLaCoupe(50, 3), 50)).toEqual({ texte: "25", fort: false });
    expect(texteDuRendu(renduDeLaCoupe(10, 2), 10)).toEqual({ texte: "+15", fort: true });
    expect(texteDuRendu(renduDeLaCoupe(200, 0), 200)).toEqual({ texte: "+3800", fort: true });
    // L'étiquette neutre n'a pas l'or vif de celle d'un gain.
    const or = hexDe(ton(OR, 7));
    const a = etiquetteDeGain("25", false);
    const b = etiquetteDeGain("+15", true);
    const a7 = Array.from({ length: a.w * a.h }, (_, k) => hexDe([a.d[k * 4]!, a.d[k * 4 + 1]!, a.d[k * 4 + 2]!]));
    const b7 = Array.from({ length: b.w * b.h }, (_, k) => hexDe([b.d[k * 4]!, b.d[k * 4 + 1]!, b.d[k * 4 + 2]!]));
    expect(a7).not.toContain(or);
    expect(b7).toContain(or);
  });
});

describe("le panneau", () => {
  it("tient dans sa place, en points entiers, à toutes les largeurs de table", () => {
    for (const W of LARGEURS) {
      const G = mesurerLaPalissade(W);
      expect(G.DX % 2).toBe(0);
      expect(G.H % 2).toBe(0);
      expect(Number.isInteger(G.CX)).toBe(true);
      expect(G.BW * 2, String(W)).toBeLessThanOrEqual(W);
      if (G.large) expect(G.BW * 2).toBeLessThanOrEqual(W * 0.53 + 4);
      const lp = G.BW * 2;
      const n = placesDesLachers(W, lp);
      expect(n).toBeGreaterThanOrEqual(4);
      expect(n).toBeLessThanOrEqual(10);
    }
  });

  it("a son triangle de velours bordeaux sous les pieux, ses pieux au-dessus des coupes", () => {
    for (const W of [310, 1524]) {
      const G = mesurerLaPalissade(W);
      for (const jour of [true, false]) {
        const { decor, devants } = peindreLeDecor(G, jour);
        expect([decor.w, decor.h]).toEqual([G.BW, G.H]);
        expect(devants).toHaveLength(9);
        for (const d of devants) expect(pleins(d)).toBeGreaterThan(20);
        // Le milieu du triangle, entre deux rangées, est du velours bordeaux.
        const y = G.Y0 + Math.round(3.5 * G.DY);
        expect(dansVelours(G, G.CX, y)).toBe(true);
        const i = (y * decor.w + G.CX) * 4;
        expect(BORDEAUX.c.map(hexDe)).toContain(hexDe([decor.d[i]!, decor.d[i + 1]!, decor.d[i + 2]!]));
        // Les coins du haut, hors du triangle, ne le sont pas.
        expect(dansVelours(G, G.e + 4, G.Y0)).toBe(false);
      }
      // Le pieu du sommet est au milieu, ceux de la dernière rangée encadrent les coupes.
      expect(xDuPieu(G, 0, 0)).toBe(G.CX);
      for (let k = 0; k < 8; k++) expect(xDuPieu(G, 7, k)).toBeGreaterThan(xDeLaCoupe(G, k) - G.DX);
    }
  });
});

describe("la chute", () => {
  it("suit pieu par pieu le chemin du serveur et finit toujours dans la coupe tirée, sans saut", () => {
    const alea = graine(9);
    for (const W of [310, 1044, 1524]) {
      const G = mesurerLaPalissade(W);
      for (const chemin of CHEMINS) {
        const k = coupeDe(chemin);
        const v = ecrireLaChute(G, chemin, k, 10, null, alea);
        const effets: EffetDeChute[] = [];
        let x = v.x;
        let y = v.y;
        let saut = 0;
        for (let i = 0; i < 2000 && !v.fini; i++) {
          avancerLaChute(G, v, 1 / 120, (e) => void effets.push(e));
          // Seules comptent les images où le statère est dessiné (arrivé au fond, il n'est plus peint).
          if (!v.fini) saut = Math.max(saut, Math.hypot(v.x - x, v.y - y));
          x = v.x;
          y = v.y;
        }
        expect(v.fini).toBe(true);
        expect(saut).toBeLessThan(6);
        // Les pieux frappés : ceux du chemin, rangée après rangée (une hésitation retouche le même pieu).
        let j = 0;
        const attendus: string[] = ["0,0"];
        for (let r = 1; r < 8; r++) attendus.push(`${r},${(j += chemin[r - 1]!)}`);
        const frappes = effets.filter((e) => e.pieu && !e.doux).map((e) => e.pieu!.join(","));
        expect(frappes).toEqual(attendus);
        for (const e of effets.filter((x) => x.doux)) expect(attendus).toContain(e.pieu!.join(","));
        expect(effets.filter((e) => e.bouche)).toHaveLength(1);
        expect(effets.filter((e) => e.arrivee)).toHaveLength(1);
        expect(effets[effets.length - 1]!.arrivee).toBe(true);
        expect(Math.abs(v.x - xDeLaCoupe(G, k))).toBeLessThanOrEqual(1.5);
        expect(Math.abs(v.x - xDeLaCoupe(G, k))).toBeLessThan(G.cw / 2);
      }
    }
  });
});

describe("la scène", () => {
  it("fait tomber plusieurs statères à la fois, chacun dans sa coupe, et s'arrête au repos", () => {
    const arrivees: number[] = [];
    const sc = new SceneDeLaPalissade<number>(1044, fabrique, (v) => (arrivees.push(v.coup), renduDeLaCoupe(v.m, v.k)), { alea: graine(3) });
    sc.preparer(1044, false);
    const lances = [5, 77, 200, 13, 255];
    for (const n of lances) sc.lancer(CHEMINS[n]!, coupeDe(CHEMINS[n]!), 20, n);
    let pas = 0;
    while (sc.pas(1 / 60) && pas < 60 * 30) {
      if (pas % 30 === 0) sc.dessiner(pinceau(), false);
      pas++;
    }
    expect(pas).toBeLessThan(60 * 30);
    expect([...arrivees].sort((a, b) => a - b)).toEqual([...lances].sort((a, b) => a - b));
    expect(sc.volees).toHaveLength(0);
    expect(sc.pieux.every((p) => p.coup === 0)).toBe(true);
    // Au repos, rien ne tourne : un pas de plus ne trouve rien à faire.
    expect(sc.pas(1 / 60)).toBe(false);
  });

  it("pose tout d'un coup sans mouvement, et aussi quand le panneau change de taille", () => {
    let calme = false;
    const arrivees: [number, boolean][] = [];
    const sc = new SceneDeLaPalissade<number>(1524, fabrique, (v, pose) => (arrivees.push([v.coup, pose]), 0), { sansMouvement: () => calme, alea: graine(4) });
    sc.preparer(1524, true);
    sc.lancer(CHEMINS[1]!, 1, 10, 1);
    sc.lancer(CHEMINS[2]!, 1, 10, 2);
    sc.pas(0.3);
    calme = true;
    expect(sc.pas(1 / 60)).toBe(false);
    expect(arrivees).toEqual([
      [1, true],
      [2, true],
    ]);
    calme = false;
    sc.lancer(CHEMINS[3]!, 2, 10, 3);
    sc.pas(0.2);
    expect(sc.preparer(358, true)).toBe(true);
    expect(arrivees[2]).toEqual([3, true]);
    sc.poserUnStatere(CHEMINS[4]!, 1, 10, 4);
    expect(arrivees[3]).toEqual([4, true]);
    sc.dessiner(pinceau(), true);
  });
});

describe("la cadence et les règles en mots", () => {
  it("ne lâche pas plus vite que le serveur ne l'accepte pour tout le site", () => {
    expect(LACHERS_PAR_MINUTE).toBeLessThan(30);
    const heures: number[] = [];
    let t = 0;
    let permis = 0;
    // Un lâcher toutes les 300 ms pendant deux minutes : jamais plus de 25 dans une même minute.
    for (; t < 120_000; t += 300)
      if (lacherPermis(heures, t)) {
        heures.push(t);
        permis++;
        expect(heures.filter((h) => t - h < 60_000).length).toBeLessThanOrEqual(LACHERS_PAR_MINUTE);
      }
    expect(permis).toBe(2 * LACHERS_PAR_MINUTE);
    for (let m = 0; m < 2; m++) expect(heures.filter((h) => h >= m * 60_000 && h < (m + 1) * 60_000).length).toBeLessThanOrEqual(LACHERS_PAR_MINUTE);
  });

  it("disent les coupes et leurs chances comme la maquette, d'après les règles du serveur", () => {
    expect(coupesEnMots()).toBe("19 fois la mise, 4 fois, une fois et demie, la moitié, le cinquième, la moitié, une fois et demie, 4 fois, 19 fois");
    expect(chancesEnMots()).toBe("1 fois, 8 fois, 28 fois, 56 fois, 70 fois, 56 fois, 28 fois, 8 fois et 1 fois");
  });
});

describe("la bourse pendant les chutes", () => {
  it("ne montre jamais un gain avant sa coupe, et finit sur le solde du serveur", () => {
    // Le serveur : 1 000 statères ; A mise 10 et rend 2 ; B mise 50 et rend 200.
    const A = { rendu: 2, god: false, solde_apres: 992 };
    const B = { rendu: 200, god: false, solde_apres: 1142 };
    expect(bourseDesLachers(A, [A])).toBe(990);
    expect(bourseDesLachers(B, [A, B])).toBe(940);
    expect(bourseDesLachers(B, [B])).toBe(942);
    expect(bourseDesLachers(B, [])).toBe(1142);
    // En essai GOD, rien n'est pris ni rendu.
    const E = { rendu: 200, god: true, solde_apres: 1000 };
    expect(bourseDesLachers(E, [E])).toBe(1000);
    // Le mode GOD allumé pendant qu'un vrai statère tombe : son gain ne paraît toujours pas avant sa coupe.
    const V = { rendu: 380, god: false, solde_apres: 1180 };
    const E2 = { rendu: 40, god: true, solde_apres: 1180 };
    expect(bourseDesLachers(E2, [V, E2])).toBe(800);
    expect(bourseDesLachers(E2, [E2])).toBe(1180);
    // Éteint pendant qu'un essai tombe : la mise du vrai lâcher est prise, l'essai ne compte pas.
    const V2 = { rendu: 5, god: false, solde_apres: 995 };
    expect(bourseDesLachers(V2, [E, V2])).toBe(990);
  });
});
