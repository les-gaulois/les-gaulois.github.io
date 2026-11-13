import { describe, expect, it } from "vitest";
import {
  BORDS,
  ECART_BAS,
  HAUTEUR_MIN,
  LARGEUR_MIN,
  MARGE,
  PAS_CLAVIER,
  PAS_CLAVIER_MAJ,
  TEXTES_FENETRE,
  borner,
  deplacer,
  geometrieAgrandie,
  largeurCouverte,
  largeurCouverteAGauche,
  lireFenetreGardee,
  pasDeLaFleche,
  redimensionner,
  reserveDuBas,
  textesFenetre,
  type Geometrie,
} from "../../src/lib/fenetre-libre";

/** La carte d'un écran de 1 440 × 900, sous l'en-tête et au-dessus de la rangée. */
const cadre = { largeur: 1440, hauteur: 783 };
const fenetre: Geometrie = { x: 964, y: 48, w: 464, h: null };

describe("la fenêtre libre de la carte", () => {
  it("reste entière dans la carte, à sa marge", () => {
    expect(borner({ x: -500, y: -40, w: 464, h: 300 }, cadre)).toEqual({ x: MARGE, y: MARGE, w: 464, h: 300 });
    expect(borner({ x: 5000, y: 5000, w: 464, h: 300 }, cadre)).toEqual({ x: 1440 - MARGE - 464, y: 783 - MARGE - 300, w: 464, h: 300 });
    // Une hauteur qui suit le contenu garde au moins la place de la hauteur minimale sous elle.
    expect(borner({ x: 0, y: 5000, w: 464, h: null }, cadre).y).toBe(783 - MARGE - HAUTEUR_MIN);
  });

  it("ne devient ni plus petite que le minimum, ni plus grande que la carte", () => {
    expect(borner({ x: 100, y: 100, w: 10, h: 10 }, cadre)).toMatchObject({ w: LARGEUR_MIN, h: HAUTEUR_MIN });
    expect(borner({ x: 100, y: 100, w: 9000, h: 9000 }, cadre)).toEqual({ x: MARGE, y: MARGE, w: 1440 - 2 * MARGE, h: 783 - 2 * MARGE });
    // Une carte plus petite que le minimum : la fenêtre prend la place qu'il y a, sans déborder.
    const petite = borner({ x: 0, y: 0, w: 464, h: 400 }, { largeur: 250, hauteur: 150 });
    expect(petite).toEqual({ x: MARGE, y: MARGE, w: 250 - 2 * MARGE, h: 150 - 2 * MARGE });
  });

  it("se déplace du mouvement de la souris, puis bute sur les bords", () => {
    expect(deplacer(fenetre, -320, 100, cadre)).toEqual({ x: 644, y: 148, w: 464, h: null });
    expect(deplacer(fenetre, 2000, -900, cadre)).toEqual({ x: 1440 - MARGE - 464, y: MARGE, w: 464, h: null });
  });

  it("change de taille par chaque bord, le bord opposé immobile", () => {
    const g: Geometrie = { x: 600, y: 100, w: 464, h: 500 };
    expect(redimensionner(g, "e", 100, 0, cadre, 500)).toEqual({ ...g, w: 564 });
    expect(redimensionner(g, "w", -100, 0, cadre, 500)).toEqual({ ...g, x: 500, w: 564 });
    expect(redimensionner(g, "s", 0, 80, cadre, 500)).toEqual({ ...g, h: 580 });
    expect(redimensionner(g, "n", 0, -60, cadre, 500)).toEqual({ ...g, y: 40, h: 560 });
    expect(redimensionner(g, "sw", -100, 80, cadre, 500)).toEqual({ x: 500, y: 100, w: 564, h: 580 });
    // Tiré au-delà du minimum, le bord opposé ne bouge toujours pas.
    const w = redimensionner(g, "w", 900, 0, cadre, 500);
    expect(w.x + w.w).toBe(g.x + g.w);
    expect(w.w).toBe(LARGEUR_MIN);
    const n = redimensionner(g, "n", 0, 900, cadre, 500);
    expect(n.y + (n.h ?? 0)).toBe(g.y + (g.h ?? 0));
    expect(n.h).toBe(HAUTEUR_MIN);
    // Tiré au-delà de la carte, il s'arrête à la marge.
    expect(redimensionner(g, "e", 5000, 0, cadre, 500).w).toBe(1440 - MARGE - 600);
    expect(redimensionner(g, "n", 0, -5000, cadre, 500)).toMatchObject({ y: MARGE, h: 600 - MARGE });
    expect(BORDS).toHaveLength(8);
  });

  it("garde sa hauteur au contenu quand on ne tire qu'un côté, et la fixe par le haut ou le bas", () => {
    expect(redimensionner(fenetre, "w", -50, 0, cadre, 700).h).toBeNull();
    expect(redimensionner(fenetre, "se", 10, -100, cadre, 700).h).toBe(600);
  });

  it("agrandie, couvre toute la carte à sa marge", () => {
    expect(geometrieAgrandie(cadre)).toEqual({ x: MARGE, y: MARGE, w: 1440 - 2 * MARGE, h: 783 - 2 * MARGE });
  });

  it("relit sans confiance ce que garde le navigateur", () => {
    expect(lireFenetreGardee(null)).toEqual({ g: null, etat: "normal" });
    expect(lireFenetreGardee("pas du json")).toEqual({ g: null, etat: "normal" });
    expect(lireFenetreGardee("42")).toEqual({ g: null, etat: "normal" });
    expect(lireFenetreGardee('{"etat":"enorme","g":{"x":"a"}}')).toEqual({ g: null, etat: "normal" });
    expect(lireFenetreGardee('{"etat":"petit","g":{"x":1,"y":2,"w":-3,"h":null}}')).toEqual({ g: null, etat: "petit" });
    expect(lireFenetreGardee('{"etat":"grand","g":{"x":1,"y":2,"w":300,"h":null}}')).toEqual({ g: { x: 1, y: 2, w: 300, h: null }, etat: "grand" });
    expect(lireFenetreGardee('{"etat":"normal","g":{"x":1,"y":2,"w":300,"h":250}}').g).toEqual({ x: 1, y: 2, w: 300, h: 250 });
  });

  it("se déplace d'un pas aux flèches, de quatre avec Maj", () => {
    expect(pasDeLaFleche("ArrowLeft", false)).toEqual({ dx: -PAS_CLAVIER, dy: 0 });
    expect(pasDeLaFleche("ArrowDown", true)).toEqual({ dx: 0, dy: PAS_CLAVIER_MAJ });
    expect(pasDeLaFleche("Enter", false)).toBeNull();
  });

  it("couvre la droite de la carte à sa place d'origine, rien posée à gauche ou agrandie", () => {
    const carte = { left: 0, right: 1440, top: 64, bottom: 847, width: 1440 };
    const aDroite = { left: 964, right: 1428, top: 112, bottom: 835, width: 464 };
    expect(largeurCouverte(carte, aDroite)).toBe(476);
    expect(largeurCouverteAGauche(carte, aDroite)).toBe(0);
    const aGauche = { left: 12, right: 476, top: 112, bottom: 835, width: 464 };
    expect(largeurCouverte(carte, aGauche)).toBe(0);
    expect(largeurCouverteAGauche(carte, aGauche)).toBe(476);
    const agrandie = { left: 12, right: 1428, top: 76, bottom: 835, width: 1416 };
    expect(largeurCouverte(carte, agrandie)).toBe(0);
    expect(largeurCouverteAGauche(carte, agrandie)).toBe(0);
    expect(largeurCouverte(carte, null)).toBe(0);
    // Sous la carte (tout s'empile) : rien.
    expect(largeurCouverte(carte, { left: 964, right: 1428, top: 900, bottom: 1200, width: 464 })).toBe(0);
    // Sur une carte de 768 px, la fenêtre d'origine (29rem) en couvre six dixièmes : elle compte toujours.
    expect(largeurCouverte({ left: 0, right: 768, top: 64, bottom: 600, width: 768 }, { left: 292, right: 756, top: 112, bottom: 500, width: 464 })).toBe(476);
  });

  it("garde libre le bas de la carte, où sont la mention d'OpenFront et l'alerte de collecte", () => {
    const carte = { top: 64, bottom: 847 };
    // La mention et ses liens, de 790 à 838 : la fenêtre s'arrête 8 px au-dessus, marge comprise.
    const credit = { top: 790, bottom: 838 };
    const reserve = reserveDuBas(carte, [credit]);
    expect(reserve).toBe(847 - 790 + ECART_BAS - MARGE);
    // Agrandie dans la place qui reste, la fenêtre ne descend pas sur la mention.
    const place = { largeur: 1440, hauteur: 783 - reserve };
    const agrandie = geometrieAgrandie(place);
    expect(64 + agrandie.y + (agrandie.h ?? 0)).toBe(790 - ECART_BAS);
    // Déplacée tout en bas, non plus.
    const basse = borner({ x: 0, y: 5000, w: 464, h: 300 }, place);
    expect(64 + basse.y + (basse.h ?? 0)).toBeLessThanOrEqual(790 - ECART_BAS);
    // L'alerte, plus haute, compte quand elle paraît ; un élément caché (rectangle vide) ou hors de la carte, non.
    expect(reserveDuBas(carte, [credit, { top: 700, bottom: 760 }])).toBe(847 - 700 + ECART_BAS - MARGE);
    expect(reserveDuBas(carte, [credit, { top: 0, bottom: 0 }])).toBe(reserve);
    expect(reserveDuBas(carte, [{ top: 900, bottom: 940 }])).toBe(0);
    expect(reserveDuBas(carte, [])).toBe(0);
  });

  it("nomme ses boutons en français, ou en anglais dans une fenêtre en anglais", () => {
    expect(textesFenetre(null)).toBe(TEXTES_FENETRE.fr);
    expect(textesFenetre("fr")).toBe(TEXTES_FENETRE.fr);
    expect(textesFenetre("en")).toBe(TEXTES_FENETRE.en);
    expect(textesFenetre("en-GB")).toBe(TEXTES_FENETRE.en);
    expect(Object.keys(TEXTES_FENETRE.en).sort()).toEqual(Object.keys(TEXTES_FENETRE.fr).sort());
  });
});
