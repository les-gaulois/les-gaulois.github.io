/**
 * Les terrasses du fond du monde du village (la proposition « les terrasses » du pilote, 14 novembre 2026) : derrière la
 * grand-rue, des rues de maisons étagées sur la colline, dessinées dans des cases deux fois plus petites que celles du
 * premier plan, pâlies et bleutées par la distance. Chacune est une longue bande, peinte par tuiles : en haut le ciel
 * (vide), puis ses arbres, ses maisons ouvertes et ses jardins posés sur son sol, tous vus de côté ; son sentier ; puis,
 * dessous, le mur de soutènement et le talus vu de face, qui descend derrière la terrasse d'après (ou la grand-rue).
 * Rien n'est semé sur la face du talus : seulement l'herbe à contre-jour et un escalier de pierre.
 *
 * Tout se compte en cases du fond (`Terrasse` de `plan.ts`). Rien n'est tiré au hasard : `alea(x, y)` donne un grain
 * qui ne bouge pas, le même village donne le même dessin. Design : Claude Fable 5.2.
 */
import { type Decor, type Palette, Planche, alea, paletteDuDehors } from "../decor";
import { type Lumiere, cielDuVillage, melanger } from "../lumiere";
import { type Essence, cadreDeLArbre, essenceDuSemis, poserArbre } from "./arbres";
import { poserEscalier, poserMur, poserPente } from "./etages";
import { poserBanc, poserCloture, poserHaie, poserLinge, poserMeule, poserPetitPuits, poserRuches, teintesDuJardin } from "./jardins";
import { DEPENDANCES, MODELES, poserDependance, poserMaisonDuModele } from "./maisons";
import { LISIERE_DU_FOND, PAS_DE_TERRASSE, PREMIERE_TERRASSE, TUILE, type Terrasse } from "./plan";

/** Au-dessus du sol d'une terrasse, la place de ses plus grands arbres, en cases du fond. */
const AU_DESSUS_DU_SOL = 330;
/** Sous le sol : le sentier, puis le mur, puis le talus. */
const SENTIER = 26;
const MUR = 16;

/** La bande que peint une terrasse, en cases du fond : sa première rangée et sa hauteur. Le talus descend jusque derrière ce qui est devant elle. */
export function bandeDeLaTerrasse(t: Terrasse): { haut: number; hauteur: number } {
  const devant = t.rang === 1 ? PREMIERE_TERRASSE : PAS_DE_TERRASSE;
  return { haut: t.sol - AU_DESSUS_DU_SOL, hauteur: AU_DESSUS_DU_SOL + 2 * devant + 40 };
}

/** Le nombre de tuiles d'une terrasse, d'un bout à l'autre. */
export const tuilesDeLaTerrasse = (t: Terrasse): number => Math.ceil(t.largeur / TUILE);

/** Les rangées des pieds de ceux qui s'y promènent, de la plus lointaine à la plus proche, en cases du fond. */
export const sentierDeLaTerrasse = (t: Terrasse): { haut: number; bas: number } => ({ haut: t.sol + 6, bas: t.sol + SENTIER - 4 });

/** Une planche qui ne garde qu'un morceau de la terrasse : on y pose en cases du fond. */
class Morceau extends Planche {
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

/** Les arbres d'une terrasse : la forêt à ses deux bouts, puis un arbre ou deux entre ses maisons. Toujours les mêmes. */
function arbresDeLaTerrasse(t: Terrasse): { essence: Essence; x: number; pied: number; variante: number; taille?: number }[] {
  const arbres: { essence: Essence; x: number; pied: number; variante: number; taille?: number }[] = [];
  const foret: readonly Essence[] = ["sapin", "hetre", "sapin", "chene", "bouleau", "sapin", "hetre"];
  // La forêt des deux bouts : un rang au fond, un rang devant, de plus en plus clairsemé vers le village.
  for (const [de, a] of [
    [-40, LISIERE_DU_FOND],
    [t.largeur - LISIERE_DU_FOND, t.largeur + 40],
  ] as const) {
    for (let x = de, n = 0; x <= a; x += 46, n++) arbres.push({ essence: foret[(n + t.rang) % foret.length]!, x: x + Math.round(alea(x, t.rang) * 16), pied: t.sol - 4, variante: t.rang * 37 + n });
    for (let x = de + 20, n = 0; x <= a; x += 62, n++) arbres.push({ essence: foret[(n * 3 + t.rang + 2) % foret.length]!, x: x + Math.round(alea(x, t.rang + 9) * 20), pied: t.sol + 3, variante: t.rang * 53 + n });
  }
  // Entre deux places : selon la largeur du passage, un grand arbre, un petit, ou seulement un buisson.
  const petits: readonly Essence[] = ["bouleau", "pommier", "noisetier", "sapin", "pommier", "bouleau"];
  for (let n = 0; n + 1 < t.places.length; n++) {
    const fin = t.places[n]!.x + MODELES[t.places[n]!.modele].largeur;
    const trou = t.places[n + 1]!.x - fin;
    const milieu = fin + Math.floor(trou / 2);
    const graine = t.rang * 71 + n;
    // Derrière une maison sur trois, un grand arbre dépasse du toit.
    if (n % 3 === t.rang % 3) arbres.push({ essence: (["hetre", "chene", "sapin"] as const)[(n + t.rang) % 3]!, x: t.places[n]!.x + Math.round(MODELES[t.places[n]!.modele].largeur * (0.3 + 0.4 * alea(graine, 8))), pied: t.sol - 6, variante: graine + 500, taille: 1.02 });
    if (alea(graine, 5) < 0.06) continue;
    if (trou >= 120 && alea(graine, 6) < 0.6) arbres.push({ essence: essenceDuSemis(n + t.rang * 5), x: milieu, pied: t.sol - 3, variante: graine, taille: 0.84 });
    else arbres.push({ essence: petits[(n + t.rang) % petits.length]!, x: milieu, pied: t.sol - 2, variante: graine });
    if (trou >= 100) arbres.push({ essence: "buisson", x: fin + 22, pied: t.sol + 2, variante: graine + 1 });
  }
  return arbres;
}

/** Une place sans maison : un jardin vu de côté, posé sur le sol. Cinq sortes, selon la place. */
function poserJardin(pl: Planche, p: Palette, l: Lumiere, x: number, largeur: number, sol: number, graine: number, voit: (x: number, largeur: number) => boolean): void {
  const t = teintesDuJardin(l);
  const sorte = Math.floor(alea(graine, 3) * 5);
  const arbre = (essence: Essence, dx: number, variante: number, taille?: number): void => {
    const cadre = cadreDeLArbre(essence, variante, taille);
    if (voit(x + dx - cadre.largeur / 2, cadre.largeur)) poserArbre(pl, p, l, essence, x + dx, sol - 1, variante, taille);
  };
  if (sorte === 0) {
    // Le grenier sur pilotis, dans son enclos.
    arbre("noisetier", largeur - 50, graine);
    if (voit(x + 40, DEPENDANCES.grenier.largeur)) poserDependance(pl, p, l, "grenier", x + 40, sol, graine);
    poserCloture(pl, p, x + 8, x + largeur - 100, sol + 2);
    arbre("buisson", 24, graine + 2);
  } else if (sorte === 1) {
    // La petite hutte, et le linge qui sèche à côté.
    if (voit(x + 20, DEPENDANCES.hutte.largeur)) poserDependance(pl, p, l, "hutte", x + 20, sol, graine);
    poserLinge(pl, p, t, x + 176, sol + 1, Math.min(72, largeur - 190), graine);
    arbre("bouleau", largeur - 30, graine + 1, 0.8);
  } else if (sorte === 2) {
    // Le verger : des pommiers derrière une clôture.
    for (let dx = 46, n = 0; dx < largeur - 40; dx += 96, n++) arbre("pommier", dx, graine + n * 3);
    poserCloture(pl, p, x + 6, x + largeur - 8, sol + 2);
  } else if (sorte === 3) {
    // Le puits, un banc, une haie, un bouleau.
    arbre("bouleau", 40, graine);
    poserHaie(pl, p, x + 70, x + largeur - 20, sol);
    poserPetitPuits(pl, p, t, x + 100, sol + 1);
    poserBanc(pl, p, x + 150, sol + 2);
    arbre("buisson", largeur - 30, graine + 4);
  } else {
    // Les meules et les ruches, au pied d'un noisetier.
    arbre("noisetier", largeur - 60, graine);
    poserMeule(pl, t, x + 40, sol + 1, 15);
    poserMeule(pl, t, x + 78, sol + 2, 12);
    poserRuches(pl, p, t, x + 120, sol + 1);
    poserCloture(pl, p, x + 170, x + largeur - 110, sol + 1);
  }
}

/** Le sol d'une terrasse vu par la tranche : un liseré d'herbe claire, l'herbe, un sentier de terre battue, l'herbe encore. */
function poserSolDeTerrasse(pl: Planche, p: Palette, de: number, a: number, sol: number, graine: number): void {
  for (let y = sol; y < sol + SENTIER; y++) {
    const r = y - sol;
    for (let x = de; x < a; x++) {
      const g = alea(x + graine * 17, y);
      // Le sentier ondule un peu, et ses bords s'effrangent dans l'herbe.
      const onde = Math.round(2 * Math.sin((x + graine * 40) / 47));
      const dansLeSentier = r >= 8 + onde && r <= 19 + onde;
      const auBord = r === 8 + onde || r === 19 + onde;
      let couleur: string;
      if (dansLeSentier && !(auBord && g < 0.5)) couleur = g < 0.07 ? p.terre.sombre : g > 0.9 ? p.terre.claire : p.terre.fond;
      else couleur = r === 0 ? (g < 0.6 ? p.herbe.claire : p.herbe.bord) : g < 0.06 ? p.herbe.claire : g < 0.14 ? p.herbe.sombre : p.herbe.fond;
      pl.poser(x, y, couleur);
    }
  }
}

/**
 * Une tuile d'une terrasse du fond : les colonnes `tx × TUILE` et suivantes, sur toute la hauteur de sa bande
 * (`bandeDeLaTerrasse`). Les cases vides laissent voir ce qui est derrière : une terrasse plus lointaine, le ciel.
 */
export function composerTuileDeTerrasse(t: Terrasse, l: Lumiere, tx: number): Decor {
  const { haut, hauteur } = bandeDeLaTerrasse(t);
  const x0 = tx * TUILE;
  const largeur = Math.min(TUILE, t.largeur - x0);
  const x1 = x0 + largeur;
  const pl = new Morceau(x0, haut, largeur, hauteur);
  const p = paletteDuDehors(l);
  const sol = t.sol;
  const bas = haut + hauteur;
  const voit = (x: number, large: number): boolean => x + large > x0 && x < x1;

  // Le sol, le mur de soutènement, le talus vu de face et ses deux escaliers.
  poserSolDeTerrasse(pl, p, x0, x1, sol, t.rang);
  poserMur(pl, p, l, x0, x1, sol + SENTIER, sol + SENTIER + MUR);
  poserPente(pl, p, l, x0, x1, sol + SENTIER + MUR, bas, t.rang * 3);
  for (const cx of [Math.round(t.largeur * 0.5) + (t.rang % 2 === 0 ? -260 : 240), Math.round(t.largeur * 0.24), Math.round(t.largeur * 0.78)]) {
    if (voit(cx - 20, 40)) poserEscalier(pl, l, cx, sol + SENTIER - 4, bas);
  }

  // Les arbres, derrière les maisons ; puis les maisons et les jardins, d'un bout à l'autre.
  for (const arbre of arbresDeLaTerrasse(t)) {
    const cadre = cadreDeLArbre(arbre.essence, arbre.variante, arbre.taille);
    if (voit(arbre.x - cadre.largeur / 2 - 10, cadre.largeur + 20)) poserArbre(pl, p, l, arbre.essence, arbre.x, arbre.pied, arbre.variante, arbre.taille);
  }
  for (const place of t.places) {
    const modele = MODELES[place.modele];
    if (!voit(place.x - 20, modele.largeur + 40)) continue;
    if (place.rang === null) poserJardin(pl, p, l, place.x, modele.largeur, sol, place.variante, voit);
    else poserMaisonDuModele(pl, p, l, modele, place.x, sol, place.variante);
  }

  // La distance : tout pâlit et tire vers la couleur du ciel près de l'horizon.
  const brume = cielDuVillage(l)[3]!;
  const voilees = new Map<string, string>();
  const cases = pl.cases;
  for (let i = 0; i < cases.length; i++) {
    const couleur = cases[i];
    if (!couleur) continue;
    let voilee = voilees.get(couleur);
    if (!voilee) {
      voilee = melanger(couleur, brume, t.voile);
      voilees.set(couleur, voilee);
    }
    cases[i] = voilee;
  }
  return pl.decor();
}
