import { describe, expect, it } from "vitest";
import { OBJETS, POILS } from "../../supabase/functions/code-discord/gaulois";
import {
  CHAMPS_DES_PLAQUES,
  ChampDeCourses,
  ENCRES_DES_PLAQUES,
  DEPART_X,
  FAMILIERS_DE_LA_COURSE,
  TENUES_DE_LA_TRIBUNE,
  TONS_DES_COULOIRS,
  dossard,
  familierQuiCourt,
  fanionDeLaCorde,
  gauloisDeLaTribune,
  chanceDuCouloir,
  mesuresDeLaScene,
  motsDuPari,
  nomDuCouloir,
  placeSurLaCorde,
  plaqueDOr,
  portraitDuFamilier,
} from "../../src/lib/jeu/casino-course";
import type { FabriqueDImages, ImageDeLaScene, Pinceau } from "../../src/lib/jeu/casino-scene";
import { BORDEAUX, Toile, hexDe, ton } from "../../src/lib/jeu/casino-toile";
import { COULEURS_DES_RARETES } from "../../src/lib/jeu/icones-de-rarete";

// La course des familiers du casino (maquette « Le Palais d'or » validée par le pilote) : les vrais familiers et les vrais
// Gaulois du site, les pièces des couloirs, et surtout la course, qui montre toujours le gagnant tiré par le serveur, sans
// recul ni saut, avec une caméra qui glisse sans zoomer.

/** Un générateur pseudo-aléatoire à graine, pour des essais rejouables. */
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
const couleur = (t: Toile, x: number, y: number): string => {
  const i = (y * t.w + x) * 4;
  return "#" + [t.d[i]!, t.d[i + 1]!, t.d[i + 2]!].map((v) => v.toString(16).padStart(2, "0")).join("");
};

/** Une fabrique d'images sans écran : elle compte ce qui est peint. */
function fabriqueDEssai(): FabriqueDImages & { traits: number } {
  const f = {
    traits: 0,
    image: (t: Toile) => ({ width: t.w, height: t.h }) as unknown as ImageDeLaScene,
    surface: (w: number, h: number) => ({ image: { width: w, height: h } as unknown as ImageDeLaScene, pinceau: pinceau(f) }),
  };
  return f;
}
function pinceau(f: { traits: number }): Pinceau {
  const rien = (): void => undefined;
  return {
    fillStyle: "",
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    clearRect: rien,
    save: rien,
    restore: rien,
    beginPath: rien,
    rect: rien,
    clip: rien,
    fillRect: () => void f.traits++,
    drawImage: () => void f.traits++,
  } as unknown as Pinceau;
}

describe("les coureurs et la tribune", () => {
  it("sont de vrais familiers du site, tournés vers la droite", () => {
    expect(FAMILIERS_DE_LA_COURSE.length).toBeGreaterThanOrEqual(6);
    expect(new Set(FAMILIERS_DE_LA_COURSE).size).toBe(FAMILIERS_DE_LA_COURSE.length);
    for (const id of FAMILIERS_DE_LA_COURSE) {
      const f = familierQuiCourt(id);
      expect(f, id).not.toBeNull();
      expect(pleins(f!.toile), id).toBeGreaterThan(40);
      expect(Object.keys(COULEURS_DES_RARETES), id).toContain(f!.rarete);
    }
    expect(familierQuiCourt("pas-un-familier")).toBeNull();
  });

  it("ont dans la tribune de vrais Gaulois, habillés d'objets de la garde-robe", () => {
    for (const [i, t] of TENUES_DE_LA_TRIBUNE.entries())
      for (const [cle, valeur] of Object.entries(t)) {
        if (cle === "teinte_cheveux") expect(Object.keys(POILS)).toContain(valeur);
        else expect(OBJETS[cle as keyof typeof OBJETS]?.[valeur as never], `${i} : ${cle} ${valeur}`).toBeDefined();
      }
    const foule = gauloisDeLaTribune();
    expect(foule).toHaveLength(TENUES_DE_LA_TRIBUNE.length);
    for (const g of foule) expect(pleins(g)).toBeGreaterThan(300);
  });
});

describe("les pièces des couloirs", () => {
  it("donnent à chaque couloir son dossard, d'or pour le pari", () => {
    expect(TONS_DES_COULOIRS).toHaveLength(6);
    for (let v = 0; v < 6; v++) {
      const d = dossard(v);
      const o = dossard(v, true);
      expect([d.w, d.h]).toEqual([13, 15]);
      expect(pleins(d)).toBeGreaterThan(120);
      expect(o.d.join(",")).not.toBe(d.d.join(","));
    }
    // Le cinquième couloir est au bordeaux du palais (le pourpre de la maquette).
    expect(TONS_DES_COULOIRS[4]!.rp).toBe(BORDEAUX);
    expect(couleur(fanionDeLaCorde(), 3, 5)).toBe(hexDe(ton(BORDEAUX, 5)));
  });

  it("posent les plaques d'or en neuf parts et le portrait au cadre de la rareté", () => {
    for (const e of [0, 1, 2] as const) expect([plaqueDOr(e).w, plaqueDOr(e).h]).toEqual([24, 26]);
    const f = familierQuiCourt("licorne")!;
    for (const cote of [96, 80, 56]) {
      const p = portraitDuFamilier(f, cote);
      expect([p.w, p.h]).toEqual([cote / 2, cote / 2]);
      expect(couleur(p, 1, 1)).toBe(COULEURS_DES_RARETES[f.rarete as keyof typeof COULEURS_DES_RARETES]);
      expect(p.a(0, 0)).toBe(0);
    }
    expect(motsDuPari(2, 70)).toEqual(["Couloir 3", "70 misés, 420 pour la victoire"]);
    expect(motsDuPari(5, 200)).toEqual(["Couloir 6", "200 misés, 4 800 pour la victoire"]);
    expect(nomDuCouloir(5, "Licorne", "mystique")).toBe("Licorne, couloir 6, mystique : paie 24 fois la mise, gagne une fois sur 24");
    expect(chanceDuCouloir(0)).toBe("une fois sur 3");
  });

  it("écrivent leurs mots en AA sur l'or des plaques et la bulle crème de l'arrivée, dans les deux thèmes", () => {
    const lum = (h: string): number => {
      const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    };
    const contraste = (a: string, b: string): number => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    // La bulle du kit (`pieces.ts`) est crème dans les deux thèmes.
    for (const fond of [...CHAMPS_DES_PLAQUES, "#fff7dc"]) expect(contraste(ENCRES_DES_PLAQUES.encre, fond), fond).toBeGreaterThanOrEqual(4.5);
    for (const fond of CHAMPS_DES_PLAQUES) expect(contraste(ENCRES_DES_PLAQUES.douce, fond), fond).toBeGreaterThanOrEqual(4.5);
  });

  it("tiennent la scène et la corde dans leur place, en points entiers", () => {
    for (const l of [300, 358, 1044, 1524]) {
      const { W, L } = mesuresDeLaScene(l);
      expect(W % 2).toBe(0);
      expect(W * 2).toBeLessThanOrEqual(Math.max(240, l - 16));
      expect(L).toBeGreaterThanOrEqual(860);
      expect(L).toBeLessThanOrEqual(2300);
    }
    expect(placeSurLaCorde(-0.2, 500)).toBe(0);
    expect(placeSurLaCorde(1.3, 500)).toBe(500);
    expect(placeSurLaCorde(0.333, 501) % 2).toBe(0);
  });
});

/** Une course entière, image par image, au pas de `dt`. */
function courir(gagnant: number, s: number, dt = 1 / 60) {
  const f = fabriqueDEssai();
  const vus: { arrivees: number; commentaires: string[]; premier: number; reculs: number; sauts: number; camRecule: number; W: number[] } = { arrivees: 0, commentaires: [], premier: -1, reculs: 0, sauts: 0, camRecule: 0, W: [] };
  const champ = new ChampDeCourses(f, {
    arrivee: () => {
      vus.arrivees++;
      // À l'arrivée, le gagnant a passé la ligne, et il est devant tous les autres.
      const g = champ.coureurs[gagnant]!;
      expect(g.part).toBeGreaterThanOrEqual(1);
      for (const c of champ.coureurs) if (c !== g) expect(c.part).toBeLessThan(1);
    },
    commente: (t) => void vus.commentaires.push(t),
  });
  const alea = graine(s);
  champ.mesurer(480, s % 2 === 0);
  champ.nouvelleCourse(alea);
  champ.voie = (gagnant + s) % 6;
  champ.depart(gagnant, alea);
  let avant = champ.coureurs.map((c) => c.x);
  let cam = champ.cam;
  for (let i = 0; i < 60 * 30 && champ.phase !== "repos"; i++) {
    champ.pas(dt);
    for (const c of champ.coureurs) {
      const d = c.x - avant[c.voie]!;
      if (d < -1e-9) vus.reculs++;
      if (d > 8) vus.sauts++;
      if (vus.premier < 0 && c.part >= 1) vus.premier = c.voie;
    }
    if (champ.cam < cam - 1e-9) vus.camRecule++;
    cam = champ.cam;
    avant = champ.coureurs.map((c) => c.x);
    vus.W.push(champ.W);
    if (i % 97 === 0) champ.dessiner(pinceau(f));
  }
  return { champ, vus };
}

describe("la course", () => {
  it("montre toujours le gagnant tiré par le serveur, sans recul ni saut, la caméra qui glisse sans zoom", () => {
    for (let s = 1; s <= 48; s++) {
      const gagnant = s % 6;
      const { champ, vus } = courir(gagnant, s);
      expect(champ.phase, `graine ${s}`).toBe("repos");
      expect(vus.arrivees).toBe(1);
      expect(vus.premier, `graine ${s}`).toBe(gagnant);
      expect(vus.reculs).toBe(0);
      expect(vus.sauts).toBe(0);
      expect(vus.camRecule).toBe(0);
      expect(new Set(vus.W).size).toBe(1);
      expect(champ.cam).toBeGreaterThanOrEqual(0);
      expect(champ.cam).toBeLessThanOrEqual(champ.fin() - champ.W * 0.7 + 1e-6);
      // Le croupier commente deux fois : à mi-course, puis dans la dernière ligne droite.
      expect(vus.commentaires).toEqual(["La forêt", "Dernière ligne droite"]);
    }
  });

  it("se pose à l'arrivée d'un coup sans mouvement, et ne s'annonce qu'une fois", () => {
    let arrivees = 0;
    const champ = new ChampDeCourses(fabriqueDEssai(), { arrivee: () => void arrivees++ });
    champ.mesurer(300, true);
    champ.nouvelleCourse(graine(5));
    champ.depart(4, graine(6));
    champ.pas(1.2);
    champ.pas(3);
    champ.figer();
    expect(champ.phase).toBe("repos");
    expect(arrivees).toBe(1);
    expect(champ.coureurs.every((c) => c.part >= 1)).toBe(true);
    const meilleur = champ.heures.indexOf(Math.min(...champ.heures));
    expect(meilleur).toBe(4);
    champ.figer();
    champ.finirDUnCoup();
    expect(arrivees).toBe(1);
  });

  it("repart du départ à chaque nouvelle course, avec six familiers différents", () => {
    const champ = new ChampDeCourses(fabriqueDEssai());
    champ.mesurer(760, false);
    for (let s = 1; s < 20; s++) {
      champ.nouvelleCourse(graine(s));
      expect(champ.phase).toBe("paris");
      expect(champ.coureurs).toHaveLength(6);
      expect(new Set(champ.coureurs.map((c) => c.f.id)).size).toBe(6);
      expect(champ.coureurs.every((c) => c.x === DEPART_X && c.part === 0)).toBe(true);
      expect(champ.cam).toBe(0);
    }
  });
});
