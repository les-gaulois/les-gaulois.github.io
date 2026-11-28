import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { COULEURS_D_ECRITURE } from "../../src/lib/jeu/dans-la-page";
import { OBJETS, POILS } from "../../supabase/functions/code-discord/gaulois";
import { CROUPIERS, TENUES_DES_CROUPIERS, VISAGES, gaulois, medaillon, portraitEnPied, statere } from "../../src/lib/jeu/casino-dessins";
import { banniere, placeDeLaRoue, vignette } from "../../src/lib/jeu/casino-hall";
import { PETITES_ICONES_DU_CASINO, VARIABLES_DU_CASINO, BORDEAUX_DU_BOUTON, BORDEAUX_DU_RUBAN, MATIERES_DU_PALAIS, MARQUES_DE_LA_ROUE, marqueDeLaRoue, reteindre, iconeDuCasino, petiteIconeDuCasino } from "../../src/lib/jeu/casino-pieces";
import { CASES, FACONS_DE_LANCER, LANCER_DE_TOUJOURS, ORDRE_DE_LA_ROUE, ROUGES, RoueEnPoints, angleDeLaCase, caseDuNumero, caseSousLaBille, mouvementDeLaRoue, poseImmobile, tirerUnLancer } from "../../src/lib/jeu/casino-roue";
import { COUPE_HAUTE, SONS } from "../../src/lib/jeu/casino-sons";
import { BORDEAUX, ENCRE, IVOIRE, JETONS, OR, PIECES_DES_TABLES, RUBIS, SAPHIR, Toile, hexDe, jeton, jetonDeMise, pair, toileDesCases } from "../../src/lib/jeu/casino-toile";
import { Planche, R } from "../../src/lib/jeu/planche";
import { JEUX_DU_CASINO, REFUS_DU_CASINO, type CoupDuCasino } from "../../src/lib/village/contrat-casino";
import { RENDEMENT_DU_POKER } from "../../src/lib/village/casino/poker";
import { rendementAuMieux as rendementDuVingtEtUn } from "../../src/lib/village/casino/vingt-et-un";
import {
  JEUX_DU_HALL,
  MOYENNE_DU_JEU,
  casinoMontre,
  jeuxDeLaCategorie,
  lireEtatDuCasino,
  motsDuRefus,
  netDeLaPartie,
  niveauDuTour,
  noteDuNiveau,
  refusDesMemesMises,
  refusDuJeton,
  resumeDeLaPartie,
  resumeDuCoup,
} from "../../src/lib/village/ecran-casino";

// Le casino de « Mon Gaulois » (22 novembre 2026, maquette « Le Palais d'or » validée par le pilote) : la toile en points,
// les pièces du palais, les croupiers, les peintures du hall, la roue qui va toujours où le serveur a tiré, et ce que
// l'écran lit du serveur. Les chances et les gains sont ceux du serveur, testés avec ses règles (`src/lib/village/casino/`).

const pleins = (t: Toile): number => {
  let n = 0;
  for (let i = 3; i < t.d.length; i += 4) if (t.d[i]) n++;
  return n;
};
const couleur = (t: Toile, x: number, y: number): [number, number, number] => {
  const i = (y * t.w + x) * 4;
  return [t.d[i]!, t.d[i + 1]!, t.d[i + 2]!];
};

describe("la toile du casino", () => {
  it("pose, mêle et cerne en points entiers", () => {
    const t = new Toile(6, 6);
    t.r(2, 2, 2, 2, [255, 0, 0]);
    expect(t.a(2, 2)).toBe(255);
    expect(t.a(9, 9)).toBe(0);
    t.m(2, 2, [0, 0, 0], 0.5);
    expect(couleur(t, 2, 2)[0]).toBeGreaterThan(120);
    expect(couleur(t, 2, 2)[0]).toBeLessThan(135);
    t.cerne();
    expect(couleur(t, 1, 2)).toEqual([...ENCRE]);
    expect(t.a(0, 0)).toBe(0);
  });

  it("recadre les cases du site au plus près", () => {
    const cases = Array.from<string | null>({ length: 25 }).fill(null);
    cases[6] = "#ff0000";
    cases[18] = "#00ff00";
    const t = toileDesCases(cases, 5);
    expect([t.w, t.h]).toEqual([3, 3]);
    expect(couleur(t, 0, 0)).toEqual([255, 0, 0]);
    expect(couleur(t, 2, 2)).toEqual([0, 255, 0]);
  });

  it("tramée par les rampes, reste dans leurs tons", () => {
    for (let k = 0; k < 50; k++) expect(OR.c).toContain(OR.t(k / 49, k, k * 3));
    expect(pair(7)).toBe(6);
    expect(pair(1)).toBe(2);
  });

  it("peint les cinq jetons à leur taille, et le jeton d'une mise à la couleur du plus gros qu'elle contient", () => {
    for (const v of JETONS) {
      const t = jeton(v, 13);
      expect([t.w, t.h]).toEqual([29, 30]);
      expect(pleins(t)).toBeGreaterThan(400);
    }
    const t30 = jetonDeMise(30);
    const t20 = jeton(20, 8, true, 30);
    expect(t30.d).toEqual(t20.d);
    expect(jetonDeMise(5).d).toEqual(jeton(10, 8, true, 5).d);
  });

  it("donne aux pièces des tables les tailles que la feuille coupe", () => {
    const tailles: Record<string, [number, number]> = { halo: [16, 16], feutre: [32, 32], jonc: [20, 20], cadre: [16, 16], "cadre-vif": [16, 16], reflet: [56, 8] };
    for (const [nom, f] of Object.entries(PIECES_DES_TABLES)) {
      const t = f();
      expect([t.w, t.h]).toEqual(tailles[nom] ?? [12, 12]);
    }
  });
});

describe("les images du palais", () => {
  it("a un nom unique par image, des icônes de 16 cases et celle du menu de 24", () => {
    const noms = VARIABLES_DU_CASINO.map((v) => v.nom);
    expect(new Set(noms).size).toBe(noms.length);
    expect(noms).toContain("--jeu-ic-casino");
    expect(noms).toContain("--cas-s-panneau");
    for (const nom of PETITES_ICONES_DU_CASINO) {
      const p = petiteIconeDuCasino(nom);
      expect([p.width, p.height]).toEqual([16, 16]);
      expect(p.data.some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
    }
    expect([iconeDuCasino().width, iconeDuCasino().height]).toEqual([24, 24]);
    for (const v of VARIABLES_DU_CASINO) for (const theme of v.theme ? (["clair", "sombre"] as const) : (["clair"] as const)) expect(v.valeur(theme).width).toBeGreaterThan(0);
  });

  it("reteint le bouton bleu et le ruban rouge du kit au bordeaux du palais, sans rien laisser de bleu ni de rouge", () => {
    const p = new Planche(2, 1);
    R(p, 0, 0, 1, 1, "#2f55d8");
    R(p, 1, 0, 1, 1, "#ffd84a");
    reteindre(p, BORDEAUX_DU_BOUTON);
    expect(p.couleur(0, 0)?.slice(0, 3)).toEqual([0x8f, 0x1f, 0x35]);
    expect(p.couleur(1, 0)?.slice(0, 3)).toEqual([0xff, 0xd8, 0x4a]);
    const restes = (pl: Planche, carte: Readonly<Record<string, string>>): number => {
      let n = 0;
      for (let y = 0; y < pl.height; y++)
        for (let x = 0; x < pl.width; x++) {
          const c = pl.couleur(x, y);
          if (c && Object.keys(carte).includes("#" + c.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join(""))) n++;
        }
      return n;
    };
    for (const etat of ["repos", "survol", "enfonce"]) {
      const v = VARIABLES_DU_CASINO.find((x) => x.nom === `--cas-s-btn-bordeaux-${etat}`)!;
      for (const theme of ["clair", "sombre"] as const) expect(restes(v.valeur(theme), BORDEAUX_DU_BOUTON)).toBe(0);
    }
    expect(restes(VARIABLES_DU_CASINO.find((x) => x.nom === "--cas-s-ruban")!.valeur("clair"), BORDEAUX_DU_RUBAN)).toBe(0);
  });

  it("garde AA pour l'écriture du kit sur les panneaux du palais, dans les deux thèmes", () => {
    const lum = (h: string): number => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const ratio = (a: string, b: string): number => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x! + 0.05) / (y! + 0.05);
    };
    for (const [theme, couleurs] of [
      ["clair", ["#0a1230", "#3d4a80", "#8a5a00"]],
      ["sombre", ["#f6f1e3", "#aab6e8", "#ffd84a"]],
    ] as const)
      for (const c of couleurs) {
        expect(ratio(c, MATIERES_DU_PALAIS[theme].face)).toBeGreaterThanOrEqual(4.5);
        expect(ratio(c, MATIERES_DU_PALAIS[theme].page)).toBeGreaterThanOrEqual(4.5);
      }
    for (const corps of ["#8f1f35", "#a3263e", "#7c1a2e", "#7f1a2e"]) expect(ratio("#f6f1e3", corps)).toBeGreaterThanOrEqual(4.5);
  });

  it("dit rouge et bleu par une forme crème, losange plein et rond percé, sur 5 cases (revue du 23 novembre 2026)", () => {
    expect(MARQUES_DE_LA_ROUE).toEqual(["losange", "rond"]);
    const cases = (forme: (typeof MARQUES_DE_LA_ROUE)[number]): string => {
      const p = marqueDeLaRoue(forme);
      expect([p.width, p.height]).toEqual([5, 5]);
      let s = "";
      for (let y = 0; y < 5; y++)
        for (let x = 0; x < 5; x++) {
          const c = p.couleur(x, y);
          if (c && c[3]) expect(c.slice(0, 3)).toEqual([0xf6, 0xf1, 0xe3]);
          s += c && c[3] ? "X" : ".";
        }
      return s;
    };
    const losange = cases("losange");
    const rond = cases("rond");
    expect(losange[12]).toBe("X");
    expect(rond[12]).toBe(".");
    expect(losange).not.toBe(rond);
    for (const forme of MARQUES_DE_LA_ROUE) expect(VARIABLES_DU_CASINO.map((v) => v.nom)).toContain(`--cas-marque-${forme}`);
  });

  it("peint le jeton de 200 d'un velours qui se détache de la laque de nuit, loin du rubis du 20", () => {
    const lum = (h: string): number => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const coeur = (v: 20 | 200): string => {
      const j = jeton(v, 13, false);
      const n = new Map<string, number>();
      for (let y = 8; y < 21; y++)
        for (let x = 8; x < 21; x++) {
          const i = (y * j.w + x) * 4;
          const h = hexDe([j.d[i]!, j.d[i + 1]!, j.d[i + 2]!]);
          n.set(h, (n.get(h) ?? 0) + 1);
        }
      return [...n].sort((a, b) => b[1] - a[1])[0]![0];
    };
    const c200 = coeur(200);
    expect(BORDEAUX.c.map(hexDe).indexOf(c200)).toBeGreaterThanOrEqual(5);
    expect((lum(c200) + 0.05) / (lum(MATIERES_DU_PALAIS.sombre.face) + 0.05)).toBeGreaterThanOrEqual(2);
    expect(RUBIS.c.map(hexDe)).toContain(coeur(20));
    expect(RUBIS.c.map(hexDe)).not.toContain(c200);
  });

  it("garde AA pour le chiffre crème et les multiples d'or sur les pierres du tapis, au repos, survolées et voilées", () => {
    const lin = (c: number): number => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
    const lum = ([r, g, b]: readonly number[]): number => 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
    const ratio = (a: readonly number[], b: readonly number[]): number => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x! + 0.05) / (y! + 0.05);
    };
    // Le voile d'une case perdue, lu dans la feuille : la même matrice que le filtre CSS (luminosité puis saturation).
    const feuille = readFileSync("src/styles/feuilles/27-jeu-casino.css", "utf8");
    const [, br, sa] = /\.casino-jeu \.cas-eteint \{[^}]*filter: brightness\(([\d.]+)\) saturate\(([\d.]+)\)/.exec(feuille)!.map(Number);
    const voile = ([r, g, b]: readonly number[]): number[] => {
      const s = sa!;
      return [
        ((0.213 + 0.787 * s) * r! + (0.715 - 0.715 * s) * g! + (0.072 - 0.072 * s) * b!) * br!,
        ((0.213 - 0.213 * s) * r! + (0.715 + 0.285 * s) * g! + (0.072 - 0.072 * s) * b!) * br!,
        ((0.213 - 0.213 * s) * r! + (0.715 - 0.715 * s) * g! + (0.072 + 0.928 * s) * b!) * br!,
      ].map((v) => Math.min(255, v));
    };
    // Les couleurs d'écriture du kit, les mêmes dans les deux thèmes.
    const rvb = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const creme = rvb(COULEURS_D_ECRITURE.creme);
    const orvif = rvb(COULEURS_D_ECRITURE.orvif);
    const coeur = (nom: string): number[] => {
      const t = PIECES_DES_TABLES[nom]!();
      const i = (6 * t.w + 6) * 4;
      return [t.d[i]!, t.d[i + 1]!, t.d[i + 2]!];
    };
    for (const nom of ["case-rouge", "case-rouge-s", "case-bleue", "case-bleue-s", "case-verte", "case-verte-s"])
      for (const ecrit of [creme, orvif]) {
        expect(ratio(ecrit, coeur(nom)), nom).toBeGreaterThanOrEqual(4.5);
        expect(ratio(voile(ecrit), voile(coeur(nom))), `${nom} voilée`).toBeGreaterThanOrEqual(4.5);
      }
    // Une case dorée (gagnante) n'est jamais voilée ; on y écrit en crème.
    expect(ratio(creme, coeur("case-or"))).toBeGreaterThanOrEqual(4.5);
    // Survolée, la pierre garde son cœur : l'or du cadre et le biseau disent le survol.
    for (const c of ["rouge", "bleue", "verte"]) expect(coeur(`case-${c}-s`)).toEqual(coeur(`case-${c}`));
  });
});

describe("les croupiers", () => {
  it("sont habillés d'objets qui existent dans la garde-robe", () => {
    for (const nom of CROUPIERS)
      for (const [cle, valeur] of Object.entries(TENUES_DES_CROUPIERS[nom])) {
        if (cle === "teinte_cheveux") expect(Object.keys(POILS)).toContain(valeur);
        else expect(OBJETS[cle as keyof typeof OBJETS]?.[valeur], `${nom} : ${cle} ${valeur}`).toBeDefined();
      }
  });

  it("ont cinq visages, et tiennent dans leur médaillon", () => {
    for (const nom of CROUPIERS) {
      for (const v of VISAGES) expect(pleins(gaulois(nom, v))).toBeGreaterThan(300);
      // Un croupier rieur de nature (la bergère de la course) a le même visage au repos et content : trois au moins diffèrent.
      expect(new Set(VISAGES.map((v) => gaulois(nom, v).d.join(","))).size).toBeGreaterThanOrEqual(3);
      const m = medaillon(nom, 23, false);
      expect([m.w, m.h]).toEqual([48, 48]);
      expect([portraitEnPied(nom, true).w, portraitEnPied(nom, true).h]).toEqual([54, 74]);
    }
    expect([statere(16).w, statere(16).h]).toEqual([16, 16]);
  });
});

describe("les peintures du hall", () => {
  it("peignent chaque jeu à sa taille, de jour comme de nuit", () => {
    for (const id of JEUX_DU_CASINO)
      for (const jour of [true, false]) {
        const t = vignette(id, 150, 82, jour);
        expect([t.w, t.h]).toEqual([150, 82]);
        expect(pleins(t)).toBe(150 * 82);
      }
    const b = banniere(520, 160, false, false);
    expect(pleins(b)).toBe(520 * 160);
    const etroit = placeDeLaRoue(170, 100, true);
    expect(etroit.rx).toBe(85);
  });

  it("montre les sept jeux du contrat (le poker du barde depuis le 28 novembre 2026), rangés en trois catégories", () => {
    expect(JEUX_DU_HALL.map((j) => j.id).sort()).toEqual([...JEUX_DU_CASINO].sort());
    expect(jeuxDeLaCategorie("tout")).toHaveLength(7);
    expect(jeuxDeLaCategorie("tables").length + jeuxDeLaCategorie("machines").length + jeuxDeLaCategorie("courses").length).toBe(7);
    expect(jeuxDeLaCategorie("tables").map((j) => j.id)).toContain("poker");
  });

  it("donne à « Mon bilan » ce que chaque jeu rend en moyenne, les jeux de cartes joués au mieux, au dixième du calcul exact", () => {
    expect(Object.keys(MOYENNE_DU_JEU).sort()).toEqual([...JEUX_DU_CASINO].sort());
    for (const j of JEUX_DU_CASINO) expect(MOYENNE_DU_JEU[j].auMieux, j).toBe(j === "vingt-et-un" || j === "poker");
    for (const j of JEUX_DU_CASINO) if (!MOYENNE_DU_JEU[j].auMieux) expect(MOYENNE_DU_JEU[j].pourCent, j).toBe(100);
    expect(MOYENNE_DU_JEU["vingt-et-un"].pourCent).toBe(Math.round(rendementDuVingtEtUn() * 1000) / 10);
    expect(MOYENNE_DU_JEU.poker.pourCent).toBe(Math.round(RENDEMENT_DU_POKER * 1000) / 10);
  });
});

describe("la roue du charron", () => {
  it("a 18 rouges et 18 bleus, qui alternent autour de la roue", () => {
    expect(ROUGES.size).toBe(18);
    expect([...ORDRE_DE_LA_ROUE].sort((a, b) => a - b)).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
    for (let k = 0; k < CASES; k++) expect(ROUGES.has(ORDRE_DE_LA_ROUE[k]!)).toBe(k % 2 === 0);
  });

  it("amène toujours la bille sur le numéro tiré, et l'y laisse jusqu'à l'arrêt", () => {
    for (let n = 1; n <= 36; n++)
      for (const rot0 of [0, 0.2, 2.9, -4.1]) {
        const k = caseDuNumero(n);
        const m = mouvementDeLaRoue(k, rot0);
        expect(m.pose).toBeGreaterThan(m.TA);
        expect(m.fin).toBeGreaterThan(m.pose);
        for (const t of [m.pose, m.pose + 0.5, m.fin - 0.01, m.fin, m.fin + 3]) {
          const p = m.position(t);
          expect(p.phase).toBe("posee");
          expect(caseSousLaBille(p.billeA, p.rot)).toBe(k);
        }
      }
  });

  it("amène la bille sur le numéro tiré quel que soit le lancer, le sens et les rebonds, sans regarder les jetons", () => {
    // Un hasard rejouable : les lancers tirés dépendent de lui seul, jamais d'un pari posé.
    let x = 20261128;
    const hasard = (): number => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
    let avant = -1;
    let sauts = 0;
    for (let i = 0; i < 400; i++) {
      const rapide = i % 9 === 0;
      const { lancer, rang } = tirerUnLancer(rapide, avant, hasard);
      if (!rapide) {
        expect(rang).not.toBe(avant);
        expect(rang).toBeGreaterThanOrEqual(0);
        expect(rang).toBeLessThan(FACONS_DE_LANCER);
        avant = rang;
      } else expect(lancer.sauts).toHaveLength(0);
      expect(lancer.nom.length).toBeGreaterThan(0);
      sauts += lancer.sauts.length;
      const k = i % CASES;
      const sens = i % 2 === 0 ? 1 : -1;
      const m = mouvementDeLaRoue(k, -3 + (i % 7), lancer, sens);
      expect(m.pose).toBeGreaterThan(m.TA);
      expect(m.fin).toBeGreaterThan(m.pose);
      // Le tour rapide s'arrête en moins de deux secondes et demie. Pour les autres, la bille se pose entre trois et sept
      // secondes et demie après le lancer, et la roue s'arrête avant onze secondes et demie (avant le 28 novembre 2026 :
      // toujours 5,7 et 8,9 secondes).
      if (rapide) expect(m.fin).toBeLessThan(2.5);
      else {
        expect(m.pose).toBeGreaterThan(3);
        expect(m.pose).toBeLessThan(7.5);
        expect(m.fin).toBeLessThan(11.5);
      }
      for (const t of [m.pose, m.pose + 0.3, m.fin, m.fin + 2]) {
        const p = m.position(t);
        expect(p.phase).toBe("posee");
        expect(caseSousLaBille(p.billeA, p.rot)).toBe(k);
      }
      // Les rebonds se suivent dans l'ordre, la bille au-dessus des cases pendant le saut.
      for (let s = 0; s < lancer.sauts.length; s++) {
        let vu = false;
        for (let t = m.TA; t < m.pose; t += 0.02) {
          const p = m.position(t);
          if (p.phase === "saut" && p.saut === s) {
            vu = true;
            expect(p.billeR).toBeGreaterThanOrEqual(0.515);
          }
        }
        expect(vu).toBe(true);
      }
    }
    expect(sauts).toBeGreaterThan(0);
  });

  it("garde le lancer de toujours quand on ne lui en donne pas", () => {
    const m = mouvementDeLaRoue(5, 0.2);
    const t = mouvementDeLaRoue(5, 0.2, LANCER_DE_TOUJOURS, 1);
    for (const s of [0, 1, 3.3, 4, m.pose, m.fin]) expect(m.position(s)).toEqual(t.position(s));
  });

  it("pose le résultat sans mouvement sur la même case", () => {
    for (let k = 0; k < CASES; k++) {
      const p = poseImmobile(k);
      expect(caseSousLaBille(p.billeA, p.rot)).toBe(k);
    }
    expect(angleDeLaCase(0)).toBeCloseTo(Math.PI / 36);
  });

  it("peint la case sous la bille à sa couleur", () => {
    const r = new RoueEnPoints(60);
    expect(r.S).toBe(124);
    expect(r.chiffres).toHaveLength(36);
    for (const n of [31, 16]) {
      const k = caseDuNumero(n);
      const { rot, billeA } = poseImmobile(k);
      r.peindre(rot, k, 2);
      // Un point au milieu de la case, sur l'anneau des cases.
      const x = Math.round(r.S / 2 + Math.cos(billeA) * r.R * 0.7);
      const y = Math.round(r.S / 2 + Math.sin(billeA) * r.R * 0.7);
      const v = r.pts[y * r.S + x]!;
      const c = [v & 255, (v >> 8) & 255, (v >> 16) & 255];
      const rampe = ROUGES.has(n) ? RUBIS : SAPHIR;
      expect(rampe.c.map((t) => [...t])).toContainEqual(c);
    }
  });
});

describe("l'écran du casino", () => {
  const etat = {
    ok: true,
    ouvert: true,
    peut_jouer: true,
    god: false,
    solde: 1234,
    jour: "2026-11-23",
    plafond: 2000,
    mise_au_plus: 200,
    jetons: [10, 20, 50, 100, 200],
    mise_du_jour: 300,
    reste_du_jour: 1700,
    parties: [
      { partie: 9, jeu: "roue", mise: 110, rendu: 100, god: false, le: "2026-11-23T20:00:00Z", resume: { jeu: "roue", numero: 31 } },
      { partie: 8, jeu: "inconnu", mise: 10, rendu: 0 },
    ],
    main: null,
  };

  it("ne montre l'onglet qu'au titulaire tant que le casino n'est pas ouvert à tous", () => {
    expect(casinoMontre(false, { permis: true })).toBe(true);
    expect(casinoMontre(false, { permis: false })).toBe(false);
    expect(casinoMontre(false, null)).toBe(false);
    expect(casinoMontre(true, null)).toBe(true);
    expect(casinoMontre(true, { permis: false })).toBe(true);
  });

  it("lit get_casino, et refuse ce qui ne lui ressemble pas", () => {
    const e = lireEtatDuCasino(etat);
    expect(e?.solde).toBe(1234);
    expect(e?.parties).toHaveLength(1);
    expect(lireEtatDuCasino({ ...etat, ok: false })).toBeNull();
    expect(lireEtatDuCasino({ ...etat, solde: "1234" })).toBeNull();
    expect(lireEtatDuCasino(null)).toBeNull();
    expect(lireEtatDuCasino([etat])).toBeNull();
  });

  it("lit un casino sans plafond du jour (27 novembre 2026) : plafond et reste à null, jamais un reste absent", () => {
    expect(lireEtatDuCasino({ ...etat, plafond: null, reste_du_jour: null })).toMatchObject({ plafond: null, reste_du_jour: null, mise_du_jour: 300 });
    expect(lireEtatDuCasino({ ...etat, reste_du_jour: undefined })).toBeNull();
    expect(lireEtatDuCasino({ ...etat, reste_du_jour: "1700" })).toBeNull();
  });

  it("écrit chaque partie en mots courts", () => {
    expect(resumeDeLaPartie({ jeu: "roue", numero: 31 })).toBe("Sorti : le 31, rouge");
    expect(resumeDeLaPartie({ jeu: "roue", numero: 16 })).toBe("Sorti : le 16, bleu");
    expect(resumeDeLaPartie({ jeu: "machine", resultat: -1 })).toBe("Pas de trio");
    expect(resumeDeLaPartie({ jeu: "machine", resultat: 4 })).toBe("Gui : mise rendue");
    expect(resumeDeLaPartie({ jeu: "machine", resultat: 0 })).toBe("Trois statères : 100 fois");
    expect(resumeDeLaPartie({ jeu: "course", couloir: 2, gagnant: 2 })).toBe("Couloir 3");
    expect(resumeDeLaPartie({ jeu: "palissade", coupe: 0 })).toBe("19 fois la mise");
    expect(resumeDeLaPartie({ jeu: "palissade", coupe: 4 })).toBe("Le cinquième");
    expect(resumeDeLaPartie({ jeu: "des", faces: [3, 3] })).toBe("Sorti : double 3, soit 6");
    expect(resumeDeLaPartie({ jeu: "des", faces: [2, 5] })).toBe("Sorti : 2 et 5, soit 7");
    expect(resumeDeLaPartie({ jeu: "vingt-et-un", issues: ["vingt-et-un"] })).toBe("21 d'entrée");
    expect(resumeDeLaPartie({ jeu: "vingt-et-un", issues: ["gagne", "perdu"] })).toBe("Deux mains : gagnée et perdue");
    const coup = { ok: true, partie: 3, jeu: "roue", mise: 50, rendu: 100, god: false, solde_apres: 1000, mise_du_jour: 50, reste_du_jour: 1950, numero: 7 } as CoupDuCasino & Record<string, unknown>;
    expect(resumeDuCoup(coup)).toEqual({ jeu: "roue", numero: 7 });
    expect(netDeLaPartie(110, 100)).toEqual({ texte: "-10", dit: "moins 10 statères", gagne: false });
    expect(netDeLaPartie(50, 1800).texte).toBe("+1 750");
  });

  it("dit chaque refus du serveur avec ses mots", () => {
    const parDefaut = motsDuRefus("inconnu");
    for (const code of REFUS_DU_CASINO) expect(motsDuRefus(code), code).not.toEqual(parDefaut);
    expect(motsDuRefus("plafond_du_jour", { reste: 120 })[1]).toBe("Encore 120 aujourd'hui");
    // Atteint : le plafond est celui du serveur, jamais une valeur écrite dans l'écran.
    expect(motsDuRefus("plafond_du_jour", { reste: 0, plafond: 12500 })).toEqual(["Plafond du jour atteint", "12 500 misés aujourd'hui, le casino rouvre à minuit"]);
    expect(motsDuRefus("plafond_du_jour", { reste: 0, plafond: 7000 })[1]).toBe("7 000 misés aujourd'hui, le casino rouvre à minuit");
    expect(motsDuRefus("plafond_du_jour")).toEqual(["Plafond du jour atteint", "Le casino rouvre à minuit"]);
    // Le refus du serveur ne répète pas un reste que l'écran croyait : le casino le relit, la ligne du plafond le dit.
    expect(motsDuRefus("casino_plafond", { reste: 3500, plafond: 12500 })).toEqual(["Plafond du jour", "La mise dépasse ce qu'il reste à miser aujourd'hui"]);
  });

  it("donne à chaque tour son niveau : l'or et le « + » seulement pour un vrai gain", () => {
    expect(niveauDuTour(0, 100)).toBe("perdu");
    expect(niveauDuTour(50, 100)).toBe("partiel");
    expect(niveauDuTour(100, 100)).toBe("rendue");
    expect(niveauDuTour(200, 100)).toBe("gain");
    expect(niveauDuTour(3600, 100, true)).toBe("grand");
    expect(niveauDuTour(100, 100, true)).toBe("rendue");
    expect(noteDuNiveau("partiel", 110)).toBe("Rendus sur 110 misés");
  });

  it("refuse au pupitre le jeton de trop : la table, le reste du jour, la bourse", () => {
    const l = { plafond: 200, bourse: 500, reste: 120, god: false };
    expect(refusDuJeton(190, 20, l)).toBe("plafond");
    expect(refusDuJeton(100, 50, l)).toBe("plafond_du_jour");
    expect(refusDuJeton(100, 50, { ...l, reste: null, bourse: 120 })).toBe("bourse");
    expect(refusDuJeton(100, 20, l)).toBeNull();
    expect(refusDuJeton(100, 50, { ...l, god: true })).toBeNull();
    expect(refusDesMemesMises({ rouge: 100, n7: 50 }, l)).toBe("plafond_du_jour");
  });
});

describe("les sons du casino", () => {
  it("restent sous 7 400 Hz, et se taisent sans contexte audio", () => {
    expect(COUPE_HAUTE).toBeLessThanOrEqual(7400);
    for (const f of [SONS.jeton, SONS.ramasse, SONS.piece, SONS.refus, SONS.lance, SONS.cloison, SONS.chute, SONS.gain, SONS.grandGain, SONS.perdu, SONS.egal, SONS.partiel, SONS.entree, SONS.survol]) expect(() => f()).not.toThrow();
    expect(SONS.roulement(900, 1, 0.05)).toBeNull();
    expect(IVOIRE.n).toBe(7);
  });
});
