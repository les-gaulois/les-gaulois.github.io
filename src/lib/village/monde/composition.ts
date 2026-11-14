/**
 * La composition du décor du monde du village : le premier plan (le sol, le chemin, le ruisseau, les bâtiments, les
 * arbres), peint par tuiles de `TUILE` cases de large pour tenir dans la toile de tout navigateur, et la liste de ce qui
 * bouge lentement par-dessus (le grand feu, les ailes du moulin, la fumée du four, les reflets du ruisseau). Le ciel et
 * les lointains sont dans `ciel.ts`, les pièces dans `pieces.ts`, les dessins des bâtiments du chantier dans
 * `../batiments/`.
 *
 * Chaque bâtiment du chantier est à son emplacement : des piquets et un écriteau avant son tour, son chantier (ce qui est
 * bâti et l'échafaudage) pendant, fini ensuite. Sans données du chantier, rien n'est montré comme bâti : « pas de
 * données » n'est pas zéro, et l'écran le dit ailleurs. Une animation ne change jamais une valeur.
 */
import { IMAGES_DU_FEU, imageDuGrandFeu } from "../../../../supabase/functions/code-discord/grand-feu";
import { DESSINS_DES_BATIMENTS, FORGE, dessinDuBatiment } from "../batiments";
import type { BatimentId, NiveauDuFeu } from "../chantier-liste";
import { type Decor, type Palette, Planche, alea, paletteDuDehors } from "../decor";
import { type Lumiere, melanger } from "../lumiere";
import type { EtatDuMonde } from "../monde-etat";
import { couleursDeLEau, litDuRuisseau, poserBuisson, poserCamp, poserEtal, poserGrandArbre, poserLisiere, poserMaison, poserPiquets, poserReunion, poserRives, poserSol, poserTaverne } from "./pieces";
import { type Emplacement, LIGNE, LISIERE, MONDE_HAUTEUR, PIED_DU_PONT, type Plan, TUILE, type Tailles, emplacementDuBatiment, emplacementsDe } from "./plan";

/** Les tailles des dessins faits par d'autres, lues sur les dessins eux-mêmes. */
export function taillesDesDessins(): Tailles {
  const tailles: Record<string, { largeur: number; hauteur: number }> = { forge: { largeur: FORGE.largeur, hauteur: FORGE.hauteur } };
  for (const [id, dessin] of Object.entries(DESSINS_DES_BATIMENTS)) tailles[id] = { largeur: dessin.largeur, hauteur: dessin.hauteur };
  return tailles as Tailles;
}

/** Où en est un bâtiment : pas encore son tour, en chantier (`avancement` de 0 à 1), ou fini. */
export type EtatDuLot = { sorte: "attente" } | { sorte: "chantier"; avancement: number } | { sorte: "fini" };

export function etatDuLot(etat: EtatDuMonde, id: BatimentId): EtatDuLot {
  const b = etat.chantier?.batiments.find((ligne) => ligne.id === id);
  if (!b || !etat.chantier) return { sorte: "attente" };
  if (b.cout > 0 && b.poses >= b.cout) return { sorte: "fini" };
  if (etat.chantier.en_cours === id) return { sorte: "chantier", avancement: b.cout > 0 ? Math.min(1, Math.max(0, b.poses / b.cout)) : 0 };
  return { sorte: "attente" };
}

/** Une planche qui ne garde qu'une tranche du monde : on y pose en colonnes du monde, elle range en colonnes de la tuile. */
class Tuile extends Planche {
  constructor(
    readonly origine: number,
    largeur: number,
    hauteur: number,
  ) {
    super(largeur, hauteur, null);
  }
  override poser(x: number, y: number, couleur: string | null): void {
    super.poser(x - this.origine, y, couleur);
  }
  override lire(x: number, y: number): string | null {
    return super.lire(x - this.origine, y);
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

const hautDe = (e: Emplacement): number => e.pied - e.hauteur + 1;

/** Le bâtiment bouge-t-il (ailes, fumée, feuilles) ? Fini seulement : un chantier ne bouge pas. */
const estAnime = (etat: EtatDuMonde, id: BatimentId): boolean => DESSINS_DES_BATIMENTS[id].images > 1 && etatDuLot(etat, id).sorte === "fini";

/** Les seuils usés par les pas, devant les lieux où l'on entre. */
function seuilsDuPlan(plan: Plan): { x: number; demi: number }[] {
  return plan.emplacements
    .filter((e) => e.piece.sorte === "maison" || e.piece.sorte === "taverne" || e.piece.sorte === "reunion" || e.piece.sorte === "forge" || e.piece.sorte === "etal")
    .map((e) => ({ x: e.x + Math.floor(e.largeur / 2), demi: Math.round(e.largeur * 0.36) }));
}

/** Les arbres et les buissons plantés entre les bâtiments : toujours les mêmes, d'après le plan. */
function plantations(plan: Plan): { sorte: "arbre" | "buisson"; x: number; pied: number; taille: number }[] {
  const plantes: { sorte: "arbre" | "buisson"; x: number; pied: number; taille: number }[] = [];
  // Des buissons dans les intervalles entre deux bâtiments, au ras de la ligne du fond.
  const places = [...plan.emplacements].filter((e) => e.pied <= LIGNE + 2).sort((a, b) => a.x - b.x);
  for (let k = 0; k + 1 < places.length; k++) {
    const fin = places[k]!.x + places[k]!.largeur;
    const trou = places[k + 1]!.x - fin;
    if (trou >= 22 && Math.abs(fin + trou / 2 - plan.feu.x) > 150) plantes.push({ sorte: "buisson", x: fin + Math.floor(trou / 2), pied: LIGNE + 3, taille: Math.min(1.4, trou / 26) });
  }
  // Deux chênes au bord du pré, un près du ruisseau.
  plantes.push({ sorte: "arbre", x: plan.pre.x + plan.pre.largeur - 30, pied: LIGNE + 2, taille: 0.9 });
  plantes.push({ sorte: "arbre", x: plan.ruisseau.x - plan.ruisseau.largeur - 6, pied: LIGNE + 22, taille: 0.6 });
  return plantes;
}

/**
 * Une tuile du premier plan : les colonnes `indice × TUILE` et suivantes, sur toute la hauteur du monde. Au-dessus de la
 * ligne du fond, les cases vides laissent voir le ciel et les lointains.
 */
export function composerTuile(plan: Plan, etat: EtatDuMonde, l: Lumiere, indice: number): Decor {
  const origine = indice * TUILE;
  const largeur = Math.min(TUILE, plan.largeur - origine);
  const planche = new Tuile(origine, largeur, MONDE_HAUTEUR);
  const p = paletteDuDehors(l);
  const fin = origine + largeur;
  const visible = (x: number, l2: number, marge = 60): boolean => x + l2 + marge > origine && x - marge < fin;

  // Derrière tout : les deux lisières, dont les arbres dépassent la ligne du fond.
  if (visible(0, LISIERE + 40)) poserLisiere(planche, p, 20, LISIERE + 10);
  if (visible(plan.largeur - LISIERE - 40, LISIERE + 40)) poserLisiere(planche, p, plan.largeur - LISIERE - 10, plan.largeur - 20);

  poserSol(planche, p, l, plan, origine, fin, seuilsDuPlan(plan));
  const pontBati = etatDuLot(etat, "pont").sorte === "fini";
  if (visible(plan.ruisseau.x - plan.ruisseau.largeur, plan.ruisseau.largeur * 2)) poserRives(planche, p, l, plan, pontBati);

  for (const plante of plantations(plan)) {
    if (!visible(plante.x - 50, 100)) continue;
    if (plante.sorte === "arbre") poserGrandArbre(planche, p, plante.x, plante.pied, plante.taille);
    else poserBuisson(planche, p, plante.x, plante.pied, plante.taille);
  }

  // Les bâtiments, d'ouest en est. Ceux qui bougent sont peints à part, par-dessus (`animesDuMonde`).
  for (const e of plan.emplacements) {
    if (!visible(e.x, e.largeur, 20)) continue;
    const piece = e.piece;
    if (piece.sorte === "maison") poserMaison(planche, p, l, e, piece.rang);
    else if (piece.sorte === "taverne") poserTaverne(planche, p, l, e);
    else if (piece.sorte === "reunion") poserReunion(planche, p, l, e);
    else if (piece.sorte === "etal") poserEtal(planche, p, l, e);
    else if (piece.sorte === "camp") poserCamp(planche, p, e);
    else if (piece.sorte === "batiment") {
      const lot = etatDuLot(etat, piece.id);
      // La halle se bâtira autour de l'étal : son écriteau le cacherait.
      if (lot.sorte === "attente") poserPiquets(planche, p, e, piece.id !== "halle");
      else if (!estAnime(etat, piece.id)) poserDessin(planche, dessinDuBatiment(piece.id, l, lot.sorte === "fini" ? 1 : lot.avancement, 0), e.x, hautDe(e));
    }
  }

  // Devant la forge, l'herbe éclairée par son foyer : à peine le jour, nettement la nuit.
  const forge = emplacementsDe(plan, "forge")[0];
  if (forge && visible(forge.x, forge.largeur)) lueurAuSol(planche, p, forge.x + Math.floor(forge.largeur / 2), Math.round(forge.largeur * 0.3));
  return planche.decor();
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

/** Ce qui bouge lentement par-dessus le décor : une petite toile à sa place, repeinte d'une image à la suivante. */
export interface Anime {
  cle: string;
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
  /** La rangée de son pied : ce qui est plus bas à l'écran passe devant. */
  pied: number;
  images: number;
  /** Le nombre de huitièmes de seconde que dure une image : jamais moins de 8 (une seconde) pour un bâtiment. */
  duree: number;
  dessiner(image: number): Decor;
}

/** Les images des reflets du ruisseau. */
const IMAGES_DE_L_EAU = 4;

/** Les reflets du ruisseau : de courts traits clairs qui descendent le courant, une case par image. */
function refletsDuRuisseau(plan: Plan, l: Lumiere): Anime {
  const eau = couleursDeLEau(l);
  const demi = Math.round(plan.ruisseau.largeur * 0.8) + 8;
  const x0 = plan.ruisseau.x - demi;
  const largeur = demi * 2;
  const hauteur = MONDE_HAUTEUR - LIGNE;
  return {
    cle: "ruisseau",
    x: x0,
    y: LIGNE,
    largeur,
    hauteur,
    pied: LIGNE,
    images: IMAGES_DE_L_EAU,
    duree: 10,
    dessiner(image: number): Decor {
      const cases: (string | null)[] = new Array<string | null>(largeur * hauteur).fill(null);
      for (let y = LIGNE + 2; y < MONDE_HAUTEUR; y++) {
        // Sous le pont et sur les pierres du gué, l'eau reste celle du décor.
        if (Math.abs(y - (PIED_DU_PONT - 8)) < 16) continue;
        const lit = litDuRuisseau(plan, y);
        for (let x = lit.x - lit.demi + 3; x <= lit.x + lit.demi - 3; x++) {
          // Un trait de cinq cases toutes les neuf rangées, décalé d'une colonne à l'autre, qui descend d'une case par image.
          const voie = Math.floor(x / 5);
          const phase = (y - image * 2 + Math.floor(alea(voie, 7) * 9) + 900) % 9;
          if (phase === 0 && alea(voie, Math.floor((y - image * 2) / 9)) < 0.5) cases[(y - LIGNE) * largeur + (x - x0)] = x % 5 === 2 ? eau.ecume : eau.claire;
        }
      }
      return { largeur, hauteur, cases };
    },
  };
}

/** Tout ce qui bouge dans le monde, pour cet état et cette lumière. Le grand feu n'en est que s'il y a des données. */
export function animesDuMonde(plan: Plan, etat: EtatDuMonde, l: Lumiere): Anime[] {
  const animes: Anime[] = [refletsDuRuisseau(plan, l)];
  for (const e of plan.emplacements) {
    const piece = e.piece;
    if (piece.sorte === "batiment" && estAnime(etat, piece.id)) {
      const id = piece.id;
      animes.push({ cle: id, x: e.x, y: hautDe(e), largeur: e.largeur, hauteur: e.hauteur, pied: LIGNE, images: DESSINS_DES_BATIMENTS[id].images, duree: 8, dessiner: (image) => dessinDuBatiment(id, l, 1, image) });
    } else if (piece.sorte === "forge") {
      animes.push({ cle: "forge", x: e.x, y: hautDe(e), largeur: e.largeur, hauteur: e.hauteur, pied: LIGNE, images: FORGE.images, duree: 8, dessiner: (image) => FORGE.dessiner(l, image) });
    }
  }
  if (etat.feu) {
    const niveau: NiveauDuFeu = etat.feu.niveau;
    const premiere = imageDuGrandFeu(niveau, 0);
    animes.push({ cle: "feu", x: plan.feu.x - Math.floor(premiere.largeur / 2), y: plan.feu.pied - premiere.hauteur + 1, largeur: premiere.largeur, hauteur: premiere.hauteur, pied: plan.feu.pied, images: IMAGES_DU_FEU, duree: 3, dessiner: (image) => imageDuGrandFeu(niveau, image) });
  }
  return animes;
}

/** Le nombre de tuiles du monde. */
export const nombreDeTuiles = (plan: Plan): number => Math.ceil(plan.largeur / TUILE);

/** La boîte du bâtiment en cours de chantier, pour y poser son étiquette ; `null` quand tout est bâti ou sans données. */
export function lotEnCours(plan: Plan, etat: EtatDuMonde): Emplacement | null {
  const id = etat.chantier?.en_cours;
  return id ? emplacementDuBatiment(plan, id) : null;
}
