/**
 * La composition du décor du monde du village : le premier plan de chaque étage (`plan.ts` : les terrasses, la grand-rue,
 * le bas), peint par tuiles carrées de `TUILE` cases pour tenir dans la toile de tout navigateur, et seulement celles
 * qu'on voit ; puis la liste de ce qui bouge lentement par-dessus (le grand feu, les ailes du moulin, la fumée de l'usine,
 * les navires qui tanguent, les reflets du ruisseau et de la mer). Le ciel et les lointains sont dans `ciel.ts`, le
 * terrain dans `etages.ts`, les pièces dans `pieces.ts`, les dessins des bâtiments du chantier dans `../batiments/`, ceux
 * du monde d'OpenFront dans `../openfront/`.
 *
 * Les étages se peignent du plus haut au plus bas : chacun cache le pied de la pente qui descend vers lui. Chaque bâtiment
 * du chantier est à son emplacement : des piquets et un écriteau avant son tour, son chantier (ce qui est bâti et
 * l'échafaudage) pendant, fini ensuite. Sans données du chantier, rien n'est montré comme bâti : « pas de données » n'est
 * pas zéro, et l'écran le dit ailleurs. Une animation ne change jamais une valeur.
 */
import { IMAGES_DU_FEU, imageDuGrandFeu } from "../../../../supabase/functions/code-discord/grand-feu";
import { DESSINS_DES_BATIMENTS, FORGE, dessinDuBatiment } from "../batiments";
import { avancementDuBatiment } from "../chantier";
import type { BatimentId, NiveauDuFeu } from "../chantier-liste";
import { type Decor, type Palette, Planche, alea, paletteDuDehors } from "../decor";
import { type Lumiere, melanger } from "../lumiere";
import type { EtatDuMonde } from "../monde-etat";
import { DESSINS_OPENFRONT, type PieceOpenFrontId } from "../openfront";
import { poserPenteDeLaRue, poserSiegesDehors, poserSolDuBas, poserTerrasse } from "./etages";
import { couleursDeLEau, litDuRuisseau, poserBuisson, poserCamp, poserEtal, poserGrandArbre, poserLisiere, poserMaison, poserPiquets, poserReunion, poserRives, poserSol, poserTaverne } from "./pieces";
import { DESCENTE, type Emplacement, LIGNE, LISIERE, MER_FOND, PAS_DE_TERRASSE, PIED_DU_PONT, type Plan, RAIL, RUE_HAUTEUR, TUILE, type Tailles, dyDeLaTerrasse, emplacementDuBatiment, emplacementsDe, hautDansLeMonde } from "./plan";

/** Les tailles des dessins faits par d'autres, lues sur les dessins eux-mêmes. */
export function taillesDesDessins(): Tailles {
  const tailles: Record<string, { largeur: number; hauteur: number }> = { forge: { largeur: FORGE.largeur, hauteur: FORGE.hauteur } };
  for (const [id, dessin] of Object.entries(DESSINS_DES_BATIMENTS)) tailles[id] = { largeur: dessin.largeur, hauteur: dessin.hauteur };
  for (const [id, dessin] of Object.entries(DESSINS_OPENFRONT)) tailles[id] = { largeur: dessin.largeur, hauteur: dessin.hauteur };
  return tailles as Tailles;
}

/** Où en est un bâtiment : pas encore son tour, en chantier (`avancement` de 0 à 1), ou fini. */
export type EtatDuLot = { sorte: "attente" } | { sorte: "chantier"; avancement: number } | { sorte: "fini" };

export function etatDuLot(etat: EtatDuMonde, id: BatimentId): EtatDuLot {
  const b = etat.chantier?.batiments.find((ligne) => ligne.id === id);
  if (!b || !etat.chantier) return { sorte: "attente" };
  // Fini : la date où il l'a été (`chantier.ts`) ; l'avancement d'un chantier n'atteint 1 qu'une fois fini.
  if (b.fini_le !== null) return { sorte: "fini" };
  if (etat.chantier.en_cours === id) return { sorte: "chantier", avancement: avancementDuBatiment(b) };
  return { sorte: "attente" };
}

/** Une planche qui ne garde qu'un carré du monde : on y pose en cases du monde, elle range en cases de la tuile. */
class Tuile extends Planche {
  constructor(
    readonly x0: number,
    readonly y0: number,
    largeur: number,
    hauteur: number,
  ) {
    super(largeur, hauteur, null);
  }
  override poser(x: number, y: number, couleur: string | null): void {
    super.poser(x - this.x0, y - this.y0, couleur);
  }
  override lire(x: number, y: number): string | null {
    return super.lire(x - this.x0, y - this.y0);
  }
}

/** Un étage : on y dessine dans son repère (la ligne du fond à la rangée 300), il pose dans la tuile à sa hauteur du monde. */
class Etage extends Planche {
  constructor(
    private readonly tuile: Tuile,
    private readonly dy: number,
  ) {
    super(0, 0, null);
  }
  override poser(x: number, y: number, couleur: string | null): void {
    this.tuile.poser(x, y + this.dy, couleur);
  }
  override lire(x: number, y: number): string | null {
    return this.tuile.lire(x, y + this.dy);
  }
}

/** Recopie un dessin sur la planche, son coin haut gauche en (`x`, `y`) ; les cases vides laissent voir ce qui est dessous. */
function poserDessin(planche: Planche, dessin: Decor, x: number, y: number): void {
  for (let j = 0; j < dessin.hauteur; j++) {
    for (let i = 0; i < dessin.largeur; i++) {
      const couleur = dessin.cases[j * dessin.largeur + i];
      if (couleur) planche.poser(x + i, y + j, couleur);
    }
  }
}

/** La première rangée d'un emplacement dans le repère de son étage. */
const hautDe = (e: Emplacement): number => e.pied - e.hauteur + 1;

/** Le bâtiment bouge-t-il (ailes, fumée, feuilles) ? Fini seulement : un chantier ne bouge pas. */
const estAnime = (etat: EtatDuMonde, id: BatimentId): boolean => DESSINS_DES_BATIMENTS[id].images > 1 && etatDuLot(etat, id).sorte === "fini";

/** Les pièces d'OpenFront que le décor fixe ne peint pas : elles bougent, ou un événement les anime (`evenements.ts`). */
const OPENFRONT_ANIME = (id: PieceOpenFrontId): boolean => DESSINS_OPENFRONT[id].images > 1;

/** Les seuils usés par les pas, devant les lieux de la grand-rue où l'on entre. */
function seuilsDuPlan(plan: Plan): { x: number; demi: number }[] {
  return plan.emplacements
    .filter((e) => e.dy === plan.dy0 && (e.piece.sorte === "maison" || e.piece.sorte === "taverne" || e.piece.sorte === "reunion" || e.piece.sorte === "forge" || e.piece.sorte === "etal"))
    .map((e) => ({ x: e.x + Math.floor(e.largeur / 2), demi: Math.round(e.largeur * 0.36) }));
}

/** Les arbres et les buissons plantés entre les bâtiments de la grand-rue : toujours les mêmes, d'après le plan. */
function plantations(plan: Plan): { sorte: "arbre" | "buisson"; x: number; pied: number; taille: number }[] {
  const plantes: { sorte: "arbre" | "buisson"; x: number; pied: number; taille: number }[] = [];
  const places = plan.emplacements.filter((e) => e.dy === plan.dy0 && e.pied <= LIGNE + 2).sort((a, b) => a.x - b.x);
  for (let k = 0; k + 1 < places.length; k++) {
    const fin = places[k]!.x + places[k]!.largeur;
    const trou = places[k + 1]!.x - fin;
    const milieu = fin + trou / 2;
    const dehors = (d: { x: number; sieges: number; parRang: number }): boolean => d.sieges > 0 && milieu > d.x - 30 && milieu < d.x + d.parRang * 34 + 70;
    if (trou >= 22 && trou < 120 && Math.abs(milieu - plan.feu.x) > 150 && !dehors(plan.terrasse) && !dehors(plan.bancs)) plantes.push({ sorte: "buisson", x: Math.floor(milieu), pied: LIGNE + 3, taille: Math.min(1.4, trou / 26) });
  }
  // Deux chênes au bord du pré, un près du ruisseau.
  plantes.push({ sorte: "arbre", x: plan.pre.x + plan.pre.largeur - 30, pied: LIGNE + 2, taille: 0.9 });
  plantes.push({ sorte: "arbre", x: plan.ruisseau.x - plan.ruisseau.largeur - 6, pied: LIGNE + 22, taille: 0.6 });
  return plantes;
}

/** Le nombre de tuiles du monde, en colonnes et en rangées. */
export const tuilesDuMonde = (plan: Plan): { colonnes: number; rangees: number } => ({ colonnes: Math.ceil(plan.largeur / TUILE), rangees: Math.ceil(plan.hauteur / TUILE) });

/**
 * Une tuile du premier plan : le carré de `TUILE` cases dont le coin est à la colonne `tx × TUILE` et à la rangée
 * `ty × TUILE`. Au-dessus de la plus haute ligne, les cases vides laissent voir le ciel et les lointains.
 */
export function composerTuile(plan: Plan, etat: EtatDuMonde, l: Lumiere, tx: number, ty: number): Decor {
  const x0 = tx * TUILE;
  const y0 = ty * TUILE;
  const largeur = Math.min(TUILE, plan.largeur - x0);
  const hauteur = Math.min(TUILE, plan.hauteur - y0);
  const tuile = new Tuile(x0, y0, largeur, hauteur);
  const p = paletteDuDehors(l);
  const x1 = x0 + largeur;
  const y1 = y0 + hauteur;
  /** L'étage à cette hauteur a-t-il des rangées (de `de` à `a`, dans son repère) dans la tuile ? */
  const touche = (dy: number, de: number, a: number): boolean => dy + a > y0 && dy + de < y1;
  const visible = (x: number, l2: number, marge = 60): boolean => x + l2 + marge > x0 && x - marge < x1;
  const voit = (e: Emplacement, marge = 20): boolean => visible(e.x, e.largeur, marge) && hautDansLeMonde(e) < y1 + marge && e.dy + e.pied > y0 - marge;

  // Les terrasses, de la plus haute à la première : l'herbe, le mur, la pente, la forêt aux deux bouts, puis les maisons.
  for (let t = plan.terrasses; t >= 1; t--) {
    const dy = dyDeLaTerrasse(plan, t);
    if (!touche(dy, 100, LIGNE + PAS_DE_TERRASSE + 4)) continue;
    const etage = new Etage(tuile, dy);
    if (visible(0, plan.village.de)) poserLisiere(etage, p, 20, plan.village.de - 30);
    if (visible(plan.village.a, plan.largeur - plan.village.a)) poserLisiere(etage, p, plan.village.a + 40, plan.largeur - 20);
    poserTerrasse(etage, p, l, plan, x0, x1, t);
    for (const e of plan.emplacements) {
      if (e.dy !== dy || e.piece.sorte !== "maison" || !voit(e)) continue;
      poserMaison(etage, p, l, e, e.piece.rang);
    }
  }

  // La grand-rue : les deux lisières, le sol, le ruisseau, les plantations, les bâtiments d'ouest en est, puis sa pente.
  if (touche(plan.dy0, 100, LIGNE + DESCENTE + 24)) {
    const etage = new Etage(tuile, plan.dy0);
    if (visible(0, LISIERE + 40)) poserLisiere(etage, p, 20, LISIERE + 10);
    if (visible(plan.finDeLaRue - 20, plan.largeur - plan.finDeLaRue + 40)) poserLisiere(etage, p, plan.finDeLaRue + 20, plan.largeur - 20);
    poserSol(etage, p, l, plan, x0, x1, seuilsDuPlan(plan));
    const pontBati = etatDuLot(etat, "pont").sorte === "fini";
    if (visible(plan.ruisseau.x - plan.ruisseau.largeur, plan.ruisseau.largeur * 2)) poserRives(etage, p, l, plan, pontBati);
    for (const plante of plantations(plan)) {
      if (!visible(plante.x - 50, 100)) continue;
      if (plante.sorte === "arbre") poserGrandArbre(etage, p, plante.x, plante.pied, plante.taille);
      else poserBuisson(etage, p, plante.x, plante.pied, plante.taille);
    }
    if (visible(plan.terrasse.x, plan.terrasse.parRang * 34 + 60)) poserSiegesDehors(etage, p, l, plan.terrasse, "taverne");
    if (visible(plan.bancs.x, plan.bancs.parRang * 34 + 60)) poserSiegesDehors(etage, p, l, plan.bancs, "reunion");
    for (const e of plan.emplacements) {
      if (e.dy !== plan.dy0 || !voit(e)) continue;
      const piece = e.piece;
      if (piece.sorte === "maison") poserMaison(etage, p, l, e, piece.rang);
      else if (piece.sorte === "taverne") poserTaverne(etage, p, l, e);
      else if (piece.sorte === "reunion") poserReunion(etage, p, l, e);
      else if (piece.sorte === "etal") poserEtal(etage, p, l, e);
      else if (piece.sorte === "camp") poserCamp(etage, p, e);
      else if (piece.sorte === "batiment") {
        const lot = etatDuLot(etat, piece.id);
        // La halle se bâtira autour de l'étal : son écriteau le cacherait.
        if (lot.sorte === "attente") poserPiquets(etage, p, e, piece.id !== "halle");
        else if (!estAnime(etat, piece.id)) poserDessin(etage, dessinDuBatiment(piece.id, l, lot.sorte === "fini" ? 1 : lot.avancement, 0), e.x, hautDe(e));
      } else if (piece.sorte === "openfront" && !OPENFRONT_ANIME(piece.id)) poserDessin(etage, DESSINS_OPENFRONT[piece.id].dessiner(l, 0), e.x, hautDe(e));
    }
    // Devant la forge, l'herbe éclairée par son foyer : à peine le jour, nettement la nuit.
    const forge = emplacementsDe(plan, "forge")[0];
    if (forge && visible(forge.x, forge.largeur)) lueurAuSol(etage, p, forge.x + Math.floor(forge.largeur / 2), Math.round(forge.largeur * 0.3));
    if (touche(plan.dy0, RUE_HAUTEUR, LIGNE + DESCENTE + 24)) poserPenteDeLaRue(etage, p, l, plan, x0, x1);
  }

  // Le bas : le pré, la falaise et la mer, la voie d'un bout à l'autre, puis la gare et le viaduc.
  if (touche(plan.dyBas, 40, RUE_HAUTEUR)) {
    const etage = new Etage(tuile, plan.dyBas);
    poserSolDuBas(etage, p, l, plan, x0, x1);
    const rail = DESSINS_OPENFRONT.rail;
    const morceau = rail.dessiner(l, 0);
    const viaduc = plan.emplacements.find((e) => e.piece.sorte === "openfront" && e.piece.id === "viaduc");
    for (let x = plan.voie.de - (plan.voie.de % rail.largeur); x < plan.voie.a; x += rail.largeur) {
      if (!visible(x, rail.largeur, 0)) continue;
      // Sur le ravin, c'est le viaduc qui porte la voie.
      if (viaduc && x + rail.largeur > viaduc.x + 4 && x < viaduc.x + viaduc.largeur - 4) continue;
      poserDessin(etage, morceau, x, RAIL);
    }
    for (const e of plan.emplacements) {
      if (e.dy !== plan.dyBas || e.piece.sorte !== "openfront" || OPENFRONT_ANIME(e.piece.id) || !voit(e)) continue;
      poserDessin(etage, DESSINS_OPENFRONT[e.piece.id].dessiner(l, 0), e.x, hautDe(e));
    }
  }
  return tuile.decor();
}

/** Une lueur chaude sur l'herbe, en damier, devant un foyer. */
function lueurAuSol(planche: Planche, p: Palette, cx: number, demi: number): void {
  for (let y = LIGNE + 2; y < LIGNE + 20; y++) {
    for (let x = cx - demi; x <= cx + demi; x++) {
      const dx = (x - cx) / demi;
      const dy = (y - (LIGNE + 2)) / 18;
      const d = dx * dx + dy * dy;
      const fond = planche.lire(x, y);
      if (!fond || d > 1) continue;
      if ((x + y) % 2 === 0 || d < 0.3 * p.nuit) planche.poser(x, y, melanger(fond, "#f5a83a", (0.08 + 0.3 * p.nuit) * (1 - d)));
    }
  }
}

/** Ce qui bouge lentement par-dessus le décor : une petite toile à sa place (en cases du monde), repeinte d'une image à la suivante. */
export interface Anime {
  cle: string;
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
  /** La rangée de son pied, dans le monde : ce qui est plus bas à l'écran passe devant. */
  pied: number;
  images: number;
  /** Le nombre de huitièmes de seconde que dure une image : jamais moins de 8 (une seconde) pour un bâtiment. */
  duree: number;
  dessiner(image: number): Decor;
}

/** Les reflets du ruisseau : de courts traits clairs qui descendent le courant, deux cases par image. */
function refletsDuRuisseau(plan: Plan, l: Lumiere): Anime {
  const eau = couleursDeLEau(l);
  const demi = Math.round(plan.ruisseau.largeur * 0.8) + 8;
  const x0 = plan.ruisseau.x - demi;
  const largeur = demi * 2;
  const hauteur = RUE_HAUTEUR - LIGNE;
  return {
    cle: "ruisseau",
    x: x0,
    y: plan.dy0 + LIGNE,
    largeur,
    hauteur,
    pied: plan.dy0 + LIGNE,
    images: 4,
    duree: 10,
    dessiner(image: number): Decor {
      const cases: (string | null)[] = new Array<string | null>(largeur * hauteur).fill(null);
      for (let y = LIGNE + 2; y < RUE_HAUTEUR; y++) {
        // Sous le pont et sur les pierres du gué, l'eau reste celle du décor.
        if (Math.abs(y - (PIED_DU_PONT - 8)) < 16) continue;
        const lit = litDuRuisseau(plan, y);
        for (let x = lit.x - lit.demi + 3; x <= lit.x + lit.demi - 3; x++) {
          const voie = Math.floor(x / 5);
          const phase = (y - image * 2 + Math.floor(alea(voie, 7) * 9) + 900) % 9;
          if (phase === 0 && alea(voie, Math.floor((y - image * 2) / 9)) < 0.5) cases[(y - LIGNE) * largeur + (x - x0)] = x % 5 === 2 ? eau.ecume : eau.claire;
        }
      }
      return { largeur, hauteur, cases };
    },
  };
}

/** La houle : sur la mer, de courtes crêtes claires qui glissent lentement vers le rivage, une bande de mer à la fois. */
function houle(plan: Plan, l: Lumiere, bande: number, x0: number, largeur: number): Anime {
  const eau = couleursDeLEau(l);
  const hauteur = RUE_HAUTEUR - MER_FOND - 4;
  return {
    cle: `houle-${bande}`,
    x: x0,
    y: plan.dyBas + MER_FOND + 4,
    largeur,
    hauteur,
    pied: plan.dyBas + MER_FOND + 4,
    images: 6,
    duree: 12,
    dessiner(image: number): Decor {
      const cases: (string | null)[] = new Array<string | null>(largeur * hauteur).fill(null);
      for (let y = 0; y < hauteur; y++) {
        const rang = Math.floor(y / 7);
        if (y % 7 !== 3) continue;
        for (let x = 0; x < largeur; x++) {
          // Chaque crête fait une douzaine de cases et avance de deux cases par image, vers la gauche.
          const monde = x0 + x + image * 2 + rang * 37;
          const crete = Math.floor(monde / 12);
          if (alea(crete, rang + 3) < 0.16 && monde % 12 < 8) cases[y * largeur + x] = monde % 12 === 0 || monde % 12 === 7 ? eau.claire : eau.ecume;
        }
      }
      return { largeur, hauteur, cases };
    },
  };
}

/**
 * Tout ce qui bouge dans le monde, pour cet état et cette lumière. Le grand feu n'en est que s'il y a des données. Le
 * silo n'en est pas : sa trappe ne s'ouvre que pour un lancement (`evenements.ts`), le décor le peint fermé.
 */
export function animesDuMonde(plan: Plan, etat: EtatDuMonde, l: Lumiere): Anime[] {
  const animes: Anime[] = [refletsDuRuisseau(plan, l)];
  for (let x = plan.mer.de, bande = 0; x < plan.mer.a; x += 500, bande++) animes.push(houle(plan, l, bande, x, Math.min(500, plan.mer.a - x)));
  for (const e of plan.emplacements) {
    const piece = e.piece;
    const boite = { x: e.x, y: hautDansLeMonde(e), largeur: e.largeur, hauteur: e.hauteur, pied: e.dy + e.pied };
    if (piece.sorte === "batiment" && estAnime(etat, piece.id)) {
      const id = piece.id;
      animes.push({ cle: id, ...boite, pied: e.dy + LIGNE, images: DESSINS_DES_BATIMENTS[id].images, duree: 8, dessiner: (image) => dessinDuBatiment(id, l, 1, image) });
    } else if (piece.sorte === "forge") {
      animes.push({ cle: "forge", ...boite, pied: e.dy + LIGNE, images: FORGE.images, duree: 8, dessiner: (image) => FORGE.dessiner(l, image) });
    } else if (piece.sorte === "openfront" && OPENFRONT_ANIME(piece.id)) {
      const id = piece.id;
      const dessin = DESSINS_OPENFRONT[id];
      if (id === "silo") {
        animes.push({ cle: id, ...boite, images: 1, duree: 8, dessiner: () => dessin.dessiner(l, 0) });
        continue;
      }
      // La batterie n'a que quatre images de veille (son radar) : les suivantes sont celles d'un tir.
      const images = id === "batterie" ? 4 : dessin.images;
      animes.push({ cle: id, ...boite, images, duree: id.startsWith("navire") ? 12 : 8, dessiner: (image) => dessin.dessiner(l, image) });
    }
  }
  if (etat.feu) {
    const niveau: NiveauDuFeu = etat.feu.niveau;
    const premiere = imageDuGrandFeu(niveau, 0);
    const pied = plan.dy0 + plan.feu.pied;
    animes.push({ cle: "feu", x: plan.feu.x - Math.floor(premiere.largeur / 2), y: pied - premiere.hauteur + 1, largeur: premiere.largeur, hauteur: premiere.hauteur, pied, images: IMAGES_DU_FEU, duree: 3, dessiner: (image) => imageDuGrandFeu(niveau, image) });
  }
  return animes;
}

/** La boîte du bâtiment en cours de chantier, pour y poser son étiquette ; `null` quand tout est bâti ou sans données. */
export function lotEnCours(plan: Plan, etat: EtatDuMonde): Emplacement | null {
  const id = etat.chantier?.en_cours;
  return id ? emplacementDuBatiment(plan, id) : null;
}
