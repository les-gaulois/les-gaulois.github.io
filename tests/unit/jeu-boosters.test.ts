import { describe, expect, it } from "vitest";
import {
  CARTE_HAUTEUR,
  CARTE_LARGEUR,
  LUMIERES,
  LUMIERE_NEUTRE,
  PAQUET_HAUTEUR,
  PAQUET_LARGEUR,
  RARETES_DE_CARTE,
  TONS,
  TONS_DU_RENDU,
  carteDUnLot,
  carteDUnRendu,
  carteDeRarete,
  cielDeLaScene,
  dosDeCarte,
  faceDeCarte,
  fissures,
  morceauxDuPaquet,
  paquet,
  placeDeLImage,
  rangDe,
  rareteDeCarte,
  rayonsEnCss,
} from "../../src/lib/jeu/boosters";
import { SORTES_DE_BOOSTER } from "../../src/lib/jeu/boosters-dessins";
import type { Planche } from "../../src/lib/jeu/planche";

// L'ouverture des boosters (21 novembre 2026), reprise de l'animation validée par le pilote : ses dessins, en planches.
const peintes = (p: Planche): number => {
  let n = 0;
  for (let i = 3; i < p.data.length; i += 4) if (p.data[i]! > 0) n++;
  return n;
};
const IMAGE = { largeur: 10, hauteur: 6, cases: Array.from({ length: 60 }, (_, i) => (i % 3 ? "#9b4dff" : null)) };

describe("les paquets des boosters", () => {
  it("ont chacun l'anatomie dont l'animation dépend : 60 × 88 cases, une bande en quatre morceaux, un corps plein", () => {
    for (const sorte of SORTES_DE_BOOSTER) {
      const p = paquet(sorte);
      expect([p.width, p.height], sorte).toEqual([PAQUET_LARGEUR, PAQUET_HAUTEUR]);
      const { corps, bande } = morceauxDuPaquet(p);
      expect([corps.width, corps.height]).toEqual([60, 78]);
      expect(bande).toHaveLength(4);
      for (const m of bande) {
        expect([m.width, m.height]).toEqual([15, 10]);
        expect(peintes(m), `${sorte} : un morceau de bande vide`).toBeGreaterThan(60);
      }
      // Le corps, colonnes 2 à 57, lignes 10 à 77 du paquet, est plein : rien n'y laisse voir le fond.
      for (let y = 0; y < 68; y++) for (let x = 2; x < 58; x++) expect(corps.pleine(x, y), `${sorte} (${x}, ${y + 10})`).toBe(true);
    }
  });
});

describe("la carte", () => {
  it("a un dos et une face de 68 × 88 cases, comme la case du site", () => {
    const dos = dosDeCarte();
    expect([dos.width, dos.height]).toEqual([CARTE_LARGEUR, CARTE_HAUTEUR]);
    const face = faceDeCarte({ nom: "Casque de fer", image: IMAGE, tons: TONS.epique, rang: 3, mot: "Épique" });
    expect([face.width, face.height]).toEqual([CARTE_LARGEUR, CARTE_HAUTEUR]);
    // Le bord est celui de la rareté.
    expect(face.couleur(34, 0)).toEqual([155, 77, 255, 1]);
  });

  it("a un dos à la taille de la vraie carte qui sort du booster, le torque au milieu", () => {
    const dos = dosDeCarte(93, 155);
    expect([dos.width, dos.height]).toEqual([93, 155]);
    // Le cadre jusqu'aux bords, le torque au milieu : la case du centre de son cartouche est la même qu'à 68 × 88.
    expect(dos.couleur(46, 0)?.[3]).toBe(1);
    expect(dos.couleur(46, 154)?.[3]).toBe(1);
    const petit = dosDeCarte();
    expect(dos.couleur(Math.floor((93 - 44) / 2) + 22, Math.floor((155 - 32) / 2) + 2)).toEqual(petit.couleur(12 + 22, 28 + 2));
  });

  it("réduit une image trop grande d'un facteur entier, sans jamais l'agrandir", () => {
    expect(placeDeLImage(34, 12)).toEqual({ largeur: 34, hauteur: 12 });
    expect(placeDeLImage(100, 56)).toEqual({ largeur: 50, hauteur: 28 });
    expect(placeDeLImage(172, 124)).toEqual({ largeur: 43, hauteur: 31 });
  });

  it("garde la vraie rareté du tirage : sa couleur, sa lumière et son icône, jamais une autre", () => {
    for (const r of RARETES_DE_CARTE) {
      const c = carteDeRarete("Objet", r, IMAGE);
      expect(c.rarete).toBe(r);
      expect(c.rang).toBe(rangDe(r));
      expect(c.lumiere).toEqual(LUMIERES[r]);
      expect(c.tons).toEqual(TONS[r]);
    }
    // Une rareté que l'animation ne connaît pas (le légendaire de saison) prend la lumière du légendaire.
    expect(rareteDeCarte("saison")).toBe("legendaire");
  });

  it("range un lot de statères comme une rareté, et des statères rendus sans aucune", () => {
    const lot = carteDUnLot(5, 2000);
    expect([lot.rarete, lot.rang, lot.nom, lot.mot]).toEqual(["legendaire", 5, "+2 000 statères", "Lot 5 sur 6"]);
    expect([lot.face.width, lot.face.height]).toEqual([CARTE_LARGEUR, CARTE_HAUTEUR]);
    expect(lot.lumiere).toEqual(LUMIERES.legendaire);
    expect(carteDUnLot(9, 1).rang).toBe(6);
    const rendu = carteDUnRendu(600, 40);
    expect([rendu.rarete, rendu.rang, rendu.nom, rendu.mot]).toEqual(["rendu", 0, "+600 statères rendus", "40 % du prix"]);
    expect(rendu.tons).toEqual(TONS_DU_RENDU);
    // Pas de lumière de rareté : celle du paquet scellé.
    expect(rendu.lumiere).toEqual(LUMIERE_NEUTRE);
    expect(carteDUnRendu(1, 20).nom).toBe("+1 statère rendu");
  });
});

describe("la scène", () => {
  it("dessine des fissures qui grandissent avec l'effort", () => {
    expect(peintes(fissures(0))).toBe(0);
    expect(peintes(fissures(0.5))).toBeGreaterThan(0);
    expect(peintes(fissures(1))).toBeGreaterThan(peintes(fissures(0.5)));
  });

  it("a un ciel et des rayons toujours les mêmes", () => {
    const a = cielDeLaScene(100, 80, "#d9e5fb", "#fffdf5");
    const b = cielDeLaScene(100, 80, "#d9e5fb", "#fffdf5");
    expect([a.width, a.height]).toEqual([100, 80]);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
    expect(rayonsEnCss("var(--lum)", 7)).toBe(rayonsEnCss("var(--lum)", 7));
    expect(rayonsEnCss("var(--lum)", 7)).toMatch(/^conic-gradient\(/);
  });
});
