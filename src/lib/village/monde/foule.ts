/**
 * La foule du monde du village, calculs purs (demande du pilote, 14 novembre 2026 : « un monde vivant qui pourra accueillir
 * jusqu'à 1 000 membres gaulois », puis « fais le moteur pour 250, 350 personnes »). Les Gaulois ne sont plus chacun un
 * élément de la page : ils se peignent dans quelques toiles posées sur le décor (`MondeHabitants.tsx`). Ici, ce qui se
 * décide sans navigateur, et se teste (tests/unit/village-monde-foule.test.ts) :
 * - ce que l'écran garde peint : la vue et une marge autour (`couverture`), et qui s'y trouve (`seCroisent`) ;
 * - l'ordre de dessin : du plus au fond au plus devant, comme le faisait le z-index de chacun (`ordreDeDessin`) ;
 * - les toiles : une seule tant que rien du décor ne s'intercale entre deux Gaulois qui se touchent ; une de plus là où
 *   une bête, le grand feu, une fumée ou un train passe devant les uns et derrière les autres (`calquesDeLaFoule`) ;
 * - qui est sous le doigt : le plus en avant (`sousLeDoigt`) ;
 * - l'ombre sous un Gaulois debout, en cases (`OMBRE`) ;
 * - la règle des noms écrits sous chacun (`nomsSousChacun`).
 * Tout est en cases du monde ; une figure est la boîte d'un Gaulois (ou d'un guerrier d'en face) à l'instant dessiné.
 */

/** Un rectangle du monde, en cases : son coin haut gauche, sa largeur et sa hauteur. */
export interface Boite {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}

/**
 * Ce que la foule dessine : une boîte, sa profondeur `z` (la rangée sous son pied : ce qui est plus bas à l'écran passe
 * devant) et son `ordre` (à profondeur égale, le dernier venu passe devant, comme dans la page). `plan` : la clé de son
 * plan (`cleDuPlan`) ; deux figures de plans différents ne partagent jamais une toile (elles n'ont pas la même échelle).
 */
export interface Figure extends Boite {
  z: number;
  ordre: number;
  plan?: string;
}

/**
 * Le plan d'un Gaulois (la proposition « les terrasses » du pilote : la grand-rue devant, des terrasses plus loin, plus
 * petites, qui glissent moins vite). `echelle` : la taille d'une case de ce plan, en cases du premier plan ; `parallaxe` :
 * la part du déplacement de la caméra que ce plan suit. Le premier plan : 1 et 1.
 */
export interface PlanDeVue {
  echelle: number;
  parallaxe: number;
}

export const PREMIER_PLAN: PlanDeVue = { echelle: 1, parallaxe: 1 };

/** Le plan que dit une place (`Place` de `postes.ts`) : ses deux réglages s'ils sont lisibles, sinon le premier plan. */
export function planDeLaPlace(place: { echelle?: number; parallaxe?: number } | null | undefined): PlanDeVue {
  const echelle = place?.echelle;
  const parallaxe = place?.parallaxe;
  return {
    echelle: typeof echelle === "number" && Number.isFinite(echelle) && echelle > 0 ? echelle : 1,
    parallaxe: typeof parallaxe === "number" && Number.isFinite(parallaxe) && parallaxe >= 0 ? parallaxe : 1,
  };
}

/** La clé d'un plan : deux figures de même clé peuvent partager une toile. Le premier plan a la clé vide. */
export const cleDuPlan = (plan: PlanDeVue): string => (plan.echelle === 1 && plan.parallaxe === 1 ? "" : `${plan.echelle}|${plan.parallaxe}`);

/**
 * Le côté d'une case de ce plan à l'écran, en pixels, au niveau d'approche `cote` (le côté d'une case du premier plan) :
 * l'échelle fois le niveau, arrondie dès qu'elle atteint un pixel. Ainsi 0,5 donne un demi-pixel, 1, 2 et 2 pixels aux
 * niveaux 1 à 4 : aux niveaux du monde (1, 2 et 4, `camera.ts`), le fond vaut toujours la moitié du premier plan. Sous
 * un pixel par case, le navigateur adoucit le dessin (vue d'ensemble).
 */
export const caseDuPlan = (cote: number, echelle: number): number => (cote * echelle >= 1 ? Math.round(cote * echelle) : cote * echelle);

/**
 * Le décalage d'un plan dans le calque du monde, en pixels entiers. Le calque suit toute la caméra (il est posé à moins la
 * caméra fois le niveau, arrondi) ; un plan qui n'en suit que la part `parallaxe` y est décalé du reste, de gauche à droite
 * seulement : de haut en bas, les plans du fond suivent la caméra comme le premier plan (les terrasses restent posées
 * derrière la grand-rue, à leur hauteur ; choix du designer, 14 novembre 2026).
 * À l'écran, la case (x, y) de ce plan est donc au pixel
 *   x × caseDuPlan(niveau, echelle) + décalage.x − arrondi(caméra.x × niveau)
 * (en hauteur : y × caseDuPlan − arrondi(caméra.y × niveau)), à partir du coin haut gauche de la scène.
 */
export const decalageDuPlan = (camera: { x: number; y: number }, cote: number, parallaxe: number): { x: number; y: number } => ({
  x: Math.round((1 - parallaxe) * camera.x * cote),
  y: 0,
});

/**
 * Le rang d'un plan du fond sous le premier plan : ce qu'on ajoute à la rangée des pieds pour ranger ses Gaulois en
 * profondeur. Le premier plan : 0. Un plan du fond passe sous tout le décor du premier plan (les tuiles sont au rang 0),
 * et d'autant plus bas qu'il glisse moins vite, donc qu'il est plus loin. Le décor de ce plan se pose juste dessous
 * (`MondeTerrasses`), à ce rang moins `SOUS_LA_FOULE`.
 */
export const fondDuPlan = (plan: PlanDeVue): number => (plan.echelle === 1 && plan.parallaxe === 1 ? 0 : -100_000 - Math.round((1 - plan.parallaxe) * 1_000_000));
export const SOUS_LA_FOULE = 8000;

/** Une boîte de ce plan (en cases du plan), dans le calque du monde (en pixels). */
export const boiteDansLeCalque = (b: Boite, casePx: number, decalage: { x: number; y: number }): Boite => ({ x: b.x * casePx + decalage.x, y: b.y * casePx + decalage.y, largeur: b.largeur * casePx, hauteur: b.hauteur * casePx });

/**
 * Ce que l'écran montre d'un plan, en cases de ce plan : la vue de la caméra (`x`, `y`, `vue`, `vueH`, en cases du premier
 * plan), au niveau `cote`. Le premier plan voit la vue elle-même.
 */
export function vueDuPlan(camera: { x: number; y: number; vue: number; vueH: number }, cote: number, plan: PlanDeVue): Boite {
  const c = caseDuPlan(cote, plan.echelle);
  const d = decalageDuPlan(camera, cote, plan.parallaxe);
  return { x: (Math.round(camera.x * cote) - d.x) / c, y: (Math.round(camera.y * cote) - d.y) / c, largeur: (camera.vue * cote) / c, hauteur: (camera.vueH * cote) / c };
}

/**
 * Le milieu de la vue (en cases du premier plan, ce que prend `CameraDuMonde.aller`) qui met ce point d'un plan au milieu de
 * l'écran. Au premier plan, le point lui-même.
 */
export function milieuPourVoir(point: { x: number; y: number }, camera: { vue: number; vueH: number }, cote: number, plan: PlanDeVue): { x: number; y: number } {
  const c = caseDuPlan(cote, plan.echelle);
  const p = plan.parallaxe > 0 ? plan.parallaxe : 1;
  return { x: (point.x * c) / (p * cote) - camera.vue / (2 * p) + camera.vue / 2, y: (point.y * c) / cote };
}

/** Un dessin du décor rangé en profondeur avec les Gaulois (une bête, le grand feu, une fumée, le train…) : sa boîte et son z-index. */
export interface Obstacle extends Boite {
  z: number;
}

/** Une toile de la foule : les figures de `ordre[debut]` à `ordre[fin - 1]`, posée au z-index `z`, dans la boîte `boite`. */
export interface Calque {
  debut: number;
  fin: number;
  z: number;
  boite: Boite;
  /** La clé du plan de ses figures (toutes du même plan). */
  plan: string;
}

/** Au-delà de ce nombre de Gaulois, vus de loin (une case par pixel), leurs noms ne s'écrivent plus sous chacun (sauf le sien). */
export const FOULE = 60;

/** Les noms s'écrivent-ils sous chacun ? Pas vus de loin dans un village de plus de soixante Gaulois : ils se liraient mal. */
export const nomsSousChacun = (cote: number, nombre: number): boolean => !(cote === 1 && nombre > FOULE);

/** Deux boîtes se recouvrent-elles (d'au moins une case) ? */
export const seCroisent = (a: Boite, b: Boite): boolean => a.x < b.x + b.largeur && b.x < a.x + a.largeur && a.y < b.y + b.hauteur && b.y < a.y + a.hauteur;

/** La grande boîte contient-elle toute la petite ? */
export const contient = (grande: Boite, petite: Boite): boolean => petite.x >= grande.x && petite.y >= grande.y && petite.x + petite.largeur <= grande.x + grande.largeur && petite.y + petite.hauteur <= grande.y + grande.hauteur;

/**
 * Ce que l'écran garde peint : la vue (en cases, avec ses décimales), agrandie de `marge` cases de chaque côté, en cases
 * entières. La caméra peut glisser de presque toute la marge sans qu'il faille repeindre.
 */
export function couverture(vue: Boite, marge: number): Boite {
  const x = Math.floor(vue.x - marge);
  const y = Math.floor(vue.y - marge);
  return { x, y, largeur: Math.ceil(vue.x + vue.largeur + marge) - x, hauteur: Math.ceil(vue.y + vue.hauteur + marge) - y };
}

/** L'ordre de dessin : les indices des figures, du plus au fond au plus devant ; à profondeur égale, dans l'ordre d'arrivée. */
export function ordreDeDessin(figures: readonly Figure[]): number[] {
  return figures.map((_, i) => i).sort((a, b) => figures[a]!.z - figures[b]!.z || figures[a]!.ordre - figures[b]!.ordre);
}

/** La plus petite boîte qui contient les deux. */
const union = (a: Boite, b: Boite): Boite => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, largeur: Math.max(a.x + a.largeur, b.x + b.largeur) - x, hauteur: Math.max(a.y + a.hauteur, b.y + b.hauteur) - y };
};

/**
 * Les toiles de la foule, dans l'ordre de dessin. Une toile posée au z-index `z` passe devant tout dessin du décor de z-index
 * inférieur ou égal (elle vient après lui dans la page) et derrière les autres. Un Gaulois de profondeur `p` dans cette
 * toile est donc juste tant qu'aucun dessin du décor de z-index entre `p` (exclu) et `z` (inclus) ne le recouvre : il
 * devrait passer devant lui. On ajoute les Gaulois un à un, du fond vers le devant ; quand le suivant ferait passer la
 * toile devant un dessin du décor qui recouvre un Gaulois déjà dedans, on ouvre une nouvelle toile. Sans rien du décor
 * entre eux, tous les Gaulois d'un même plan tiennent dans une seule toile ; deux plans différents n'en partagent jamais
 * une (elles n'ont pas la même échelle). `ordre` : celui de `ordreDeDessin`.
 */
export function calquesDeLaFoule(figures: readonly Figure[], ordre: readonly number[], obstacles: readonly Obstacle[]): Calque[] {
  const calques: Calque[] = [];
  if (ordre.length === 0) return calques;
  const parZ = [...obstacles].sort((a, b) => a.z - b.z);
  let o = 0;
  let courant: Calque | null = null;
  for (let k = 0; k < ordre.length; k++) {
    const figure = figures[ordre[k]!]!;
    if (courant && courant.plan === (figure.plan ?? "")) {
      // Les dessins du décor que la toile passerait devant en prenant cette figure : z-index entre son z (exclu) et celui de la figure.
      let coupe = false;
      while (o < parZ.length && parZ[o]!.z <= courant.z) o++;
      for (let j = o; j < parZ.length && parZ[j]!.z <= figure.z; j++) {
        const obstacle = parZ[j]!;
        if (!seCroisent(obstacle, courant.boite)) continue;
        for (let m = courant.debut; m < k; m++) {
          if (seCroisent(obstacle, figures[ordre[m]!]!)) {
            coupe = true;
            break;
          }
        }
        if (coupe) break;
      }
      if (!coupe) {
        courant.fin = k + 1;
        courant.z = figure.z;
        courant.boite = union(courant.boite, figure);
        continue;
      }
    }
    courant = { debut: k, fin: k + 1, z: figure.z, boite: { x: figure.x, y: figure.y, largeur: figure.largeur, hauteur: figure.hauteur }, plan: figure.plan ?? "" };
    calques.push(courant);
  }
  return calques;
}

/**
 * Qui est sous le doigt (ou la souris) au point (x, y) du monde : l'indice de la figure la plus en avant dont la boîte le
 * contient (profondeur la plus grande ; à égalité, la dernière venue), comme le clic sur la page d'avant. `null` : personne.
 */
export function sousLeDoigt(figures: readonly Figure[], x: number, y: number): number | null {
  let choisi: number | null = null;
  for (let i = 0; i < figures.length; i++) {
    const f = figures[i]!;
    if (x < f.x || x >= f.x + f.largeur || y < f.y || y >= f.y + f.hauteur) continue;
    const c = choisi === null ? null : figures[choisi]!;
    if (!c || f.z > c.z || (f.z === c.z && f.ordre > c.ordre)) choisi = i;
  }
  return choisi;
}

/**
 * L'ombre posée sous un Gaulois debout (celle que dessinait la feuille de style) : une ellipse de 26 cases sur 5, centrée
 * sous lui, à la rangée 59 de sa boîte, noire à 28 %. `masque` : les cases de l'ellipse, rangée par rangée.
 */
export const OMBRE: { x: number; y: number; largeur: number; hauteur: number; opacite: number; masque: readonly boolean[] } = (() => {
  const largeur = 26;
  const hauteur = 5;
  const masque: boolean[] = [];
  for (let j = 0; j < hauteur; j++) {
    for (let i = 0; i < largeur; i++) {
      const dx = (i + 0.5 - largeur / 2) / (largeur / 2);
      const dy = (j + 0.5 - hauteur / 2) / (hauteur / 2);
      masque.push(dx * dx + dy * dy <= 1);
    }
  }
  return { x: 11, y: 59, largeur, hauteur, opacite: 0.28, masque };
})();
