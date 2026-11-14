import { describe, expect, it } from "vitest";
import { type Boite, type Calque, type Figure, type Obstacle, FOULE, OMBRE, PREMIER_PLAN, calquesDeLaFoule, caseDuPlan, cleDuPlan, contient, couverture, decalageDuPlan, milieuPourVoir, nomsSousChacun, ordreDeDessin, planDeLaPlace, seCroisent, sousLeDoigt, vueDuPlan } from "../../src/lib/village/monde/foule";
import { taillesDesDessins } from "../../src/lib/village/monde/composition";
import { planDuMonde } from "../../src/lib/village/monde/plan";
import { type Place, placesDuLieu } from "../../src/lib/village/monde/postes";
import { hasardDe } from "../../src/lib/village/mouvement";

const figure = (x: number, y: number, z: number, ordre: number, largeur = 4, hauteur = 6): Figure => ({ x, y, largeur, hauteur, z, ordre });
const obstacle = (x: number, y: number, largeur: number, hauteur: number, z: number): Obstacle => ({ x, y, largeur, hauteur, z });

/**
 * Peint des boîtes dans une grille, dans l'ordre donné, et rend, case par case, qui est visible (le dernier peint). C'est
 * ce que fait le navigateur : `vrai` dans l'ordre de la page d'avant (chaque Gaulois son élément, son z-index), `calques`
 * dans celui des toiles de la foule.
 */
function grille(peints: readonly { id: string; boite: Boite }[], taille: number): (string | null)[] {
  const cases: (string | null)[] = new Array<string | null>(taille * taille).fill(null);
  for (const { id, boite } of peints) {
    for (let y = boite.y; y < boite.y + boite.hauteur; y++) for (let x = boite.x; x < boite.x + boite.largeur; x++) if (x >= 0 && y >= 0 && x < taille && y < taille) cases[y * taille + x] = id;
  }
  return cases;
}

/** L'ordre de la page d'avant : par z-index ; à égalité, le décor d'abord (il vient avant dans la page), puis les Gaulois dans leur ordre. */
function ordreDeLaPage(figures: readonly Figure[], obstacles: readonly Obstacle[]): { id: string; boite: Boite }[] {
  const tous = [...obstacles.map((o, i) => ({ id: `o${i}`, boite: o, z: o.z, rang: -1, decor: 0 })), ...figures.map((f, i) => ({ id: `g${i}`, boite: f, z: f.z, rang: f.ordre, decor: 1 }))];
  return tous.sort((a, b) => a.z - b.z || a.decor - b.decor || a.rang - b.rang);
}

/** L'ordre avec les toiles : le décor et les toiles par z-index (à égalité, la toile après, elle vient après dans la page), et dans chaque toile, ses figures dans l'ordre. */
function ordreDesToiles(figures: readonly Figure[], obstacles: readonly Obstacle[], ordre: readonly number[], calques: readonly Calque[]): { id: string; boite: Boite }[] {
  const couches = [...obstacles.map((o, i) => ({ z: o.z, decor: 0, peints: [{ id: `o${i}`, boite: o as Boite }] })), ...calques.map((c) => ({ z: c.z, decor: 1, peints: ordre.slice(c.debut, c.fin).map((k) => ({ id: `g${k}`, boite: figures[k]! as Boite })) }))];
  return couches.sort((a, b) => a.z - b.z || a.decor - b.decor).flatMap((c) => c.peints);
}

describe("la part du monde gardée peinte", () => {
  it("contient la vue et sa marge, en cases entières", () => {
    const vue = { x: 100.4, y: -20.7, largeur: 480.25, hauteur: 270.5 };
    const peinte = couverture(vue, 96);
    expect(contient(peinte, vue)).toBe(true);
    expect(Number.isInteger(peinte.x) && Number.isInteger(peinte.y) && Number.isInteger(peinte.largeur) && Number.isInteger(peinte.hauteur)).toBe(true);
    expect(peinte.x).toBeLessThanOrEqual(vue.x - 96);
    expect(peinte.x + peinte.largeur).toBeGreaterThanOrEqual(vue.x + vue.largeur + 96);
    // La vue glisse de presque toute la marge sans sortir de ce qui est peint.
    expect(contient(peinte, { ...vue, x: vue.x + 95 })).toBe(true);
    expect(contient(peinte, { ...vue, x: vue.x + 98 })).toBe(false);
  });

  it("deux boîtes qui se touchent par un bord ne se recouvrent pas", () => {
    expect(seCroisent({ x: 0, y: 0, largeur: 10, hauteur: 10 }, { x: 10, y: 0, largeur: 5, hauteur: 5 })).toBe(false);
    expect(seCroisent({ x: 0, y: 0, largeur: 10, hauteur: 10 }, { x: 9, y: 9, largeur: 5, hauteur: 5 })).toBe(true);
  });
});

describe("l'ordre de dessin de la foule", () => {
  it("va du plus au fond au plus devant, et, à profondeur égale, garde l'ordre d'arrivée", () => {
    const figures = [figure(0, 0, 50, 0), figure(0, 0, 40, 1), figure(0, 0, 50, 2), figure(0, 0, 10, 3), figure(0, 0, 40, 4)];
    expect(ordreDeDessin(figures)).toEqual([3, 1, 4, 0, 2]);
  });
});

describe("les toiles de la foule", () => {
  it("une seule toile quand rien du décor ne passe entre les Gaulois", () => {
    const figures = [figure(0, 0, 10, 0), figure(20, 5, 30, 1), figure(3, 2, 20, 2)];
    const ordre = ordreDeDessin(figures);
    const calques = calquesDeLaFoule(figures, ordre, [obstacle(50, 50, 5, 5, 25), obstacle(0, 0, 30, 30, 5), obstacle(0, 0, 30, 30, 31)]);
    expect(calques).toHaveLength(1);
    expect(calques[0]).toMatchObject({ debut: 0, fin: 3, z: 30, boite: { x: 0, y: 0, largeur: 24, hauteur: 11 } });
  });

  it("une toile de plus quand le grand feu passe devant l'un et derrière l'autre", () => {
    // Derrière le feu (z 10), puis le feu (z 20), puis devant lui (z 30) : les deux Gaulois le touchent.
    const figures = [figure(0, 0, 10, 0), figure(2, 3, 30, 1)];
    const feu = obstacle(1, 1, 6, 6, 20);
    const ordre = ordreDeDessin(figures);
    const calques = calquesDeLaFoule(figures, ordre, [feu]);
    expect(calques.map((c) => [c.debut, c.fin, c.z])).toEqual([
      [0, 1, 10],
      [1, 2, 30],
    ]);
  });

  it("aucun dessin du décor n'est mal rangé : la foule en toiles se voit comme chaque Gaulois à part", () => {
    const hasard = hasardDe(1114);
    const taille = 40;
    for (let essai = 0; essai < 400; essai++) {
      const figures = Array.from({ length: Math.floor(hasard() * 30) }, (_, i) => figure(Math.floor(hasard() * 36), Math.floor(hasard() * 34), Math.floor(hasard() * 40), i, 1 + Math.floor(hasard() * 6), 1 + Math.floor(hasard() * 8)));
      const obstacles = Array.from({ length: Math.floor(hasard() * 8) }, () => obstacle(Math.floor(hasard() * 36), Math.floor(hasard() * 36), 1 + Math.floor(hasard() * 10), 1 + Math.floor(hasard() * 10), Math.floor(hasard() * 40)));
      const ordre = ordreDeDessin(figures);
      const calques = calquesDeLaFoule(figures, ordre, obstacles);
      // Les toiles se suivent, sans trou ni recouvrement, et il n'y en a jamais plus que de dessins du décor, plus une.
      let suivant = 0;
      for (const c of calques) {
        expect(c.debut).toBe(suivant);
        expect(c.fin).toBeGreaterThan(c.debut);
        suivant = c.fin;
        for (let k = c.debut; k < c.fin; k++) expect(contient(c.boite, figures[ordre[k]!]!)).toBe(true);
      }
      expect(suivant).toBe(figures.length);
      expect(calques.length).toBeLessThanOrEqual(Math.max(figures.length > 0 ? 1 : 0, obstacles.length + 1));
      expect(grille(ordreDesToiles(figures, obstacles, ordre, calques), taille)).toEqual(grille(ordreDeLaPage(figures, obstacles), taille));
    }
  });
});

describe("qui est sous le doigt", () => {
  it("le plus en avant, et à profondeur égale, le dernier venu", () => {
    const figures = [figure(0, 0, 30, 0, 10, 10), figure(5, 5, 40, 1, 10, 10), figure(5, 5, 40, 2, 10, 10)];
    expect(sousLeDoigt(figures, 2, 2)).toBe(0);
    expect(sousLeDoigt(figures, 7, 7)).toBe(2);
    expect(sousLeDoigt([figures[0]!, figures[1]!], 7, 7)).toBe(1);
  });

  it("personne hors des boîtes ; le bord droit et le bord bas ne sont plus dans la boîte", () => {
    const figures = [figure(10, 10, 30, 0, 4, 6)];
    expect(sousLeDoigt(figures, 9.9, 12)).toBeNull();
    expect(sousLeDoigt(figures, 10, 10)).toBe(0);
    expect(sousLeDoigt(figures, 13.9, 15.9)).toBe(0);
    expect(sousLeDoigt(figures, 14, 12)).toBeNull();
    expect(sousLeDoigt(figures, 12, 16)).toBeNull();
    expect(sousLeDoigt([], 0, 0)).toBeNull();
  });
});

describe("l'ombre et les noms", () => {
  it("l'ombre est une ellipse de 26 cases sur 5, centrée sous les 48 cases d'un Gaulois", () => {
    expect(OMBRE.largeur).toBe(26);
    expect(OMBRE.hauteur).toBe(5);
    expect(OMBRE.x * 2 + OMBRE.largeur).toBe(48);
    const ligne = (j: number) => OMBRE.masque.slice(j * 26, j * 26 + 26);
    expect(ligne(2).every(Boolean)).toBe(true);
    expect(ligne(0)[0]).toBe(false);
    expect(ligne(0)[13]).toBe(true);
    for (let j = 0; j < 5; j++) expect(ligne(j)).toEqual([...ligne(j)].reverse());
    expect(ligne(0)).toEqual(ligne(4));
  });

  it("vus de loin, au-delà de soixante Gaulois, les noms ne s'écrivent plus sous chacun", () => {
    expect(nomsSousChacun(1, FOULE)).toBe(true);
    expect(nomsSousChacun(1, FOULE + 1)).toBe(false);
    expect(nomsSousChacun(2, 1000)).toBe(true);
  });
});

describe("le plan de chaque Gaulois : échelle et parallaxe", () => {
  it("sans réglage, ou avec un réglage illisible, c'est le premier plan", () => {
    expect(planDeLaPlace(undefined)).toEqual(PREMIER_PLAN);
    expect(planDeLaPlace({ x: 10, y: 20, serre: false } as Place)).toEqual({ echelle: 1, parallaxe: 1 });
    expect(planDeLaPlace({ echelle: 0, parallaxe: -1 })).toEqual({ echelle: 1, parallaxe: 1 });
    expect(planDeLaPlace({ echelle: Number.NaN, parallaxe: Number.POSITIVE_INFINITY })).toEqual({ echelle: 1, parallaxe: 1 });
    expect(planDeLaPlace({ echelle: 0.5, parallaxe: 0.6 })).toEqual({ echelle: 0.5, parallaxe: 0.6 });
    expect(cleDuPlan(PREMIER_PLAN)).toBe("");
    expect(cleDuPlan({ echelle: 0.5, parallaxe: 0.6 })).toBe("0.5|0.6");
  });

  it("les places du monde actuel ne portent aucun réglage : tout le monde reste au premier plan", () => {
    const plan = planDuMonde(taillesDesDessins(), 120);
    const rangs = Array.from({ length: 120 }, (_, i) => i);
    for (const lieu of ["place", "taverne", "reunion", "bataille", "maisons"] as const) for (const place of placesDuLieu(plan, lieu, rangs)) expect(planDeLaPlace(place)).toEqual(PREMIER_PLAN);
  });

  it("une case du fond vaut toujours un nombre entier de pixels, jamais moins d'un", () => {
    expect([1, 2, 3, 4].map((niveau) => caseDuPlan(niveau, 1))).toEqual([1, 2, 3, 4]);
    expect([1, 2, 3, 4].map((niveau) => caseDuPlan(niveau, 0.5))).toEqual([1, 1, 2, 2]);
    expect([1, 2, 3, 4].map((niveau) => caseDuPlan(niveau, 0.75))).toEqual([1, 2, 2, 3]);
  });

  it("le premier plan n'est pas décalé ; un plan qui glisse moins vite est décalé du reste de la caméra", () => {
    expect(decalageDuPlan({ x: 1234.6, y: 88.2 }, 3, 1)).toEqual({ x: 0, y: 0 });
    expect(decalageDuPlan({ x: 1000, y: 200 }, 2, 0.6)).toEqual({ x: 800, y: 160 });
    expect(decalageDuPlan({ x: 1000, y: 200 }, 2, 0)).toEqual({ x: 2000, y: 400 });
  });

  it("à l'écran, un point du fond glisse de la part « parallaxe » du mouvement de la caméra", () => {
    const fond = { echelle: 0.5, parallaxe: 0.6 };
    const cote = 4;
    // Le pixel de l'écran (depuis le coin haut gauche de la scène) où se voit la case (x, y) de ce plan.
    const aLEcran = (camera: { x: number; y: number }, x: number) => x * caseDuPlan(cote, fond.echelle) + decalageDuPlan(camera, cote, fond.parallaxe).x - Math.round(camera.x * cote);
    const avant = aLEcran({ x: 1000, y: 0 }, 2500);
    const apres = aLEcran({ x: 1100, y: 0 }, 2500);
    // La caméra avance de 100 cases du premier plan (400 pixels) : le premier plan recule de 400, ce fond de 240.
    expect(avant - apres).toBe(240);
    expect(aLEcran({ x: 1000, y: 0 }, 2500)).toBe(2500 * 2 + 1600 - 4000);
  });

  it("la vue d'un plan : au premier plan, la vue elle-même ; au fond, en cases du fond", () => {
    const camera = { x: 600, y: 40, vue: 480, vueH: 270 };
    expect(vueDuPlan(camera, 4, PREMIER_PLAN)).toEqual({ x: 600, y: 40, largeur: 480, hauteur: 270 });
    const fond = vueDuPlan(camera, 4, { echelle: 0.5, parallaxe: 0.5 });
    // Cases de 2 pixels ; décalage de 1 200 pixels : le coin de l'écran (2 400 pixels dans le calque) est à la case 600 du fond.
    expect(fond).toEqual({ x: 600, y: 40, largeur: 960, hauteur: 540 });
  });

  it("aller voir un Gaulois du fond met bien son point au milieu de l'écran", () => {
    const cote = 2;
    const fond = { echelle: 0.5, parallaxe: 0.5 };
    const camera = { vue: 960, vueH: 540 };
    const point = { x: 3000, y: 500 };
    const milieu = milieuPourVoir(point, camera, cote, fond);
    const cam = { x: milieu.x - camera.vue / 2, y: milieu.y - camera.vueH / 2 };
    const ecranX = point.x * caseDuPlan(cote, fond.echelle) + decalageDuPlan(cam, cote, fond.parallaxe).x - Math.round(cam.x * cote);
    expect(Math.abs(ecranX - (camera.vue * cote) / 2)).toBeLessThanOrEqual(1);
    expect(milieuPourVoir(point, camera, 3, PREMIER_PLAN)).toEqual(point);
  });

  it("deux plans ne partagent jamais une toile, même sans rien du décor entre eux", () => {
    const figures: Figure[] = [{ ...figure(0, 0, 10, 0), plan: "" }, { ...figure(1, 1, 20, 1), plan: "0.5|0.6" }, { ...figure(2, 2, 30, 2), plan: "0.5|0.6" }, { ...figure(3, 3, 40, 3), plan: "" }];
    const calques = calquesDeLaFoule(figures, ordreDeDessin(figures), []);
    expect(calques.map((c) => [c.debut, c.fin, c.plan])).toEqual([
      [0, 1, ""],
      [1, 3, "0.5|0.6"],
      [3, 4, ""],
    ]);
  });
});
