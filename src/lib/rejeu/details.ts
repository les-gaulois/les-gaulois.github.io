/**
 * Les détails d'une image du film, dessinés par-dessus la carte (page « Revoir une partie ») : les noms sur les territoires et
 * les unités (constructions, navires, bombes en vol), demande du pilote du 15 novembre 2026 (« le nom des joueurs ainsi que ce
 * qu'il pose en jeu », « je veux reconnaître le jeu et pas une version similaire »). La carte se dessine case par case
 * (`PeintreFilm`, film.ts), agrandie sans lissage ; les détails, eux, se dessinent sur une seconde toile à la taille de
 * l'écran, pour rester nets. Sans rien de Node : ce fichier va dans le navigateur.
 *
 * Les icônes sont celles du jeu : ses deux planches, `resources/atlases/icon-atlas.png` et `unit-atlas.png` du dépôt
 * https://github.com/openfrontio/OpenFrontIO (commit 8b5d071, CC BY-SA 4.0, © OpenFront and Contributors), copiées telles
 * quelles dans `public/openfront/` avec leur notice. Leur dessin reprend celui du client du jeu (AGPL-3.0, même commit) :
 * forme de chaque construction, remplissage, bord et icône de src/client/render/gl/shaders/structure/structure.frag.glsl,
 * coloration des sprites gris de src/client/render/gl/shaders/unit/unit.frag.glsl, tailles et teintes de
 * src/client/render/gl/render-settings.json (« structure » et « unit »), rangement des planches de
 * src/client/render/gl/passes/StructurePass.ts et UnitPass.ts. Modifié le 15/11/2026 : réécrit en TypeScript pour une toile 2D,
 * sans WebGL ; couleurs des camps du site (les Gaulois en bleu…) au lieu de celles des joueurs ; bombes d'une seule teinte, sans
 * le clignotement du jeu (le site n'anime rien qui clignote) ; taille des icônes réglée pour une carte vue en entier, l'icône
 * dessinée seulement quand la forme est assez grande, comme le jeu quand on s'éloigne. © OpenFront and Contributors : voir
 * NOTICE.md.
 */
import { couleurBord, type Rgb } from "../carte-dessin";
import { COULEURS_DES_CLASSES, CONSTRUCTIONS, type Etiquette, type Film, type Unite } from "./film";

/** Ce qu'on montre par-dessus la carte : les noms, les unités. */
export interface ChoixDetails {
  noms: boolean;
  unites: boolean;
}

/* ---------- Les constructions, comme le jeu ---------- */

/** Repris de render-settings.json (« structure ») : assombrissement du remplissage et du bord, en valeur HSV. */
const ASSOMBRIR_FOND = 0.65;
const ASSOMBRIR_BORD = 0.1;
/** Repris de structure.frag.glsl : une construction en chantier, grise. */
const FOND_CHANTIER: Rgb = [198, 198, 198];
const BORD_CHANTIER: Rgb = [127, 127, 127];
/** Repris de structure.frag.glsl : rayon de la forme et largeur du bord, en part du carré de l'icône. */
const RAYON = 0.45;
const BORD = 0.06;
/** Repris de render-settings.json (« shapes ») : la taille de chaque forme, et la part de l'icône dans la forme. */
const FORMES: readonly { cotes: number; rotation: number; echelle: number; icone: number }[] = [
  { cotes: 0, rotation: 0, echelle: 1, icone: 0.85 }, // Ville : un cercle.
  { cotes: 5, rotation: Math.PI / 2, echelle: 1.08, icone: 0.85 }, // Port : un pentagone, pointe en haut.
  { cotes: 6, rotation: Math.PI / 6, echelle: 1.08, icone: 0.85 }, // Usine : un hexagone, à plat en haut.
  { cotes: 8, rotation: 0, echelle: 1, icone: 0.8 }, // Poste de défense : un octogone.
  { cotes: 4, rotation: 0, echelle: 1.4, icone: 1 }, // Lance-missiles SAM : un carré.
  { cotes: 3, rotation: Math.PI / 2, echelle: 1.55, icone: 0.85 }, // Silo : un triangle, pointe en haut.
];

/** Repris de structure.frag.glsl (`darken`) : la valeur HSV multipliée, teinte et saturation gardées. */
export function assombrir([r, g, b]: Rgb, facteur: number): Rgb {
  // Multiplier la valeur HSV (le maximum des trois) revient à multiplier les trois composantes.
  return [Math.round(r * facteur), Math.round(g * facteur), Math.round(b * facteur)];
}

/** Le remplissage et le bord d'une construction : la couleur du camp assombrie, ou le gris du chantier. */
export function couleursDeConstruction(couleur: Rgb, chantier: boolean): { fond: Rgb; bord: Rgb } {
  if (chantier) return { fond: FOND_CHANTIER, bord: BORD_CHANTIER };
  return { fond: assombrir(couleur, ASSOMBRIR_FOND), bord: assombrir(couleur, ASSOMBRIR_BORD) };
}

/**
 * Les sommets de la forme d'une construction, centrée en (cx, cy), de rayon `r` (du centre aux sommets), dans le sens de
 * l'écran (y vers le bas). Repris de `sdPolygon` : les côtés font face aux angles `rotation + k × 2π / n`. Un cercle : aucun
 * sommet.
 */
export function sommetsDeForme(code: number, cx: number, cy: number, r: number): [number, number][] {
  const f = FORMES[code];
  if (!f || f.cotes === 0) return [];
  const demi = Math.PI / f.cotes;
  return Array.from({ length: f.cotes }, (_, k) => {
    const a = f.rotation + demi + 2 * demi * k;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number];
  });
}

/* ---------- Les unités, comme le jeu ---------- */

/** Repris de UnitPass.ts : la colonne de chaque unité du film (code de `UNITES`, à partir de 6) dans `unit-atlas.png`. */
const COLONNE_DE_L_UNITE: Readonly<Record<number, number>> = { 6: 2, 7: 0, 8: 3, 9: 4, 10: 5, 11: 8 };
const CASE_UNITE = 13;
const CASE_ICONE = 64;
/** Les bombes : le jeu les fait clignoter (rouge, orange, jaune, blanc) ; le site les garde à la première teinte, fixe. */
const BOMBE: { territoire: Rgb; bord: Rgb } = { territoire: [255, 0, 0], bord: [255, 255, 0] };

/** Repris de unit.frag.glsl : la couleur d'un pixel de sprite selon son gris. */
export function couleurDeSprite(gris: number, territoire: Rgb, bord: Rgb): Rgb {
  const g = gris / 255;
  if (g > 0.6) return territoire;
  if (g > 0.45) return [(territoire[0] + bord[0]) / 2, (territoire[1] + bord[1]) / 2, (territoire[2] + bord[2]) / 2];
  if (g > 0.34) return territoire;
  return bord;
}

/* ---------- Les tailles, réglées pour une carte vue en entier ---------- */

/** Le côté d'une construction, en pixels CSS : de 5 (une carte entière sur un téléphone) à 22 (un grand écran). */
const COTE_MIN = 5;
const COTE_MAX = 22;
/** Sous cette taille, la forme seule, sans son icône : comme le jeu quand on s'éloigne. */
const COTE_AVEC_ICONE = 12;
/** Les noms, en pixels CSS : jamais écrits plus petit que lisible, jamais plus gros qu'un titre. */
const NOM_MIN = 10.5;
const NOM_MAX = 28;
/** Un nom un peu à l'étroit s'écrit quand même, à la plus petite taille ; trop à l'étroit, il ne s'écrit pas. */
const NOM_PLACE_MIN = 7.5;

/**
 * Le côté d'une construction, en pixels CSS, selon la place d'une case de la carte du jeu à l'écran (en pixels CSS). Petit sur
 * un téléphone, pour laisser voir les territoires sous les constructions ; assez grand pour l'icône dès qu'un écran d'ordinateur
 * montre une carte du monde.
 */
export function coteDeConstruction(parTuileCss: number): number {
  return Math.min(COTE_MAX, Math.max(COTE_MIN, parTuileCss * 28));
}

/** Une construction de ce côté (pixels CSS) porte-t-elle son icône ? */
export function avecIcone(cote: number): boolean {
  return cote >= COTE_AVEC_ICONE;
}

/** La taille d'un nom, en pixels CSS, selon la place que lui laisse son territoire (pixels CSS) ; `null` : pas la place. */
export function tailleDuNom(place: number): number | null {
  if (place < NOM_PLACE_MIN) return null;
  return Math.min(NOM_MAX, Math.max(NOM_MIN, place));
}

/* ---------- Le dessin ---------- */

const css = (c: Rgb) => `rgb(${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])})`;
/** Le contour des noms : le bleu de nuit du cadre de la carte. */
const CONTOUR_DES_NOMS = "rgb(10 18 48)";
const ECRITURE_DES_NOMS = "rgb(255 255 255)";

/** Les deux planches d'icônes du jeu, chargées par la page (`public/openfront/`). */
export interface Planches {
  icones: CanvasImageSource & { width: number; height: number };
  unites: CanvasImageSource & { width: number; height: number };
}

type Toile = HTMLCanvasElement | OffscreenCanvas;
const nouvelleToile = (l: number, h: number): Toile => {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(l, h);
  const t = document.createElement("canvas");
  t.width = l;
  t.height = h;
  return t;
};

/**
 * Dessine les détails d'un film. Prépare une fois les icônes des constructions (blanches, comme dans la planche) et chaque
 * sprite d'unité dans chaque couleur de camp, puis ne fait que les poser à chaque image.
 */
export class DessinateurDetails {
  private readonly icones: Toile[] = [];
  private readonly sprites = new Map<string, Toile>();

  constructor(planches: Planches | null) {
    if (!planches) return;
    for (let k = 0; k < CONSTRUCTIONS; k++) {
      const t = nouvelleToile(CASE_ICONE, CASE_ICONE);
      (t.getContext("2d") as CanvasRenderingContext2D | null)?.drawImage(planches.icones, k * CASE_ICONE, 0, CASE_ICONE, CASE_ICONE, 0, 0, CASE_ICONE, CASE_ICONE);
      this.icones.push(t);
    }
    const lecture = nouvelleToile(planches.unites.width, planches.unites.height);
    const ctx = lecture.getContext("2d") as CanvasRenderingContext2D | null;
    if (!ctx) return;
    ctx.drawImage(planches.unites, 0, 0);
    const source = ctx.getImageData(0, 0, planches.unites.width, planches.unites.height);
    for (const [code, colonne] of Object.entries(COLONNE_DE_L_UNITE)) {
      const bombe = Number(code) >= 8;
      COULEURS_DES_CLASSES.forEach((couleur, classe) => {
        if (!couleur) return;
        const territoire = bombe ? BOMBE.territoire : couleur;
        const bord = bombe ? BOMBE.bord : couleurBord(couleur);
        const t = nouvelleToile(CASE_UNITE, CASE_UNITE);
        const c = t.getContext("2d") as CanvasRenderingContext2D | null;
        if (!c) return;
        const img = c.createImageData(CASE_UNITE, CASE_UNITE);
        for (let y = 0; y < CASE_UNITE; y++) {
          for (let x = 0; x < CASE_UNITE; x++) {
            const s = (y * source.width + colonne * CASE_UNITE + x) * 4;
            const d = (y * CASE_UNITE + x) * 4;
            const alpha = source.data[s + 3]!;
            if (alpha < 3) continue;
            const rgb = couleurDeSprite(source.data[s]!, territoire, bord);
            img.data[d] = rgb[0];
            img.data[d + 1] = rgb[1];
            img.data[d + 2] = rgb[2];
            img.data[d + 3] = alpha;
          }
        }
        c.putImageData(img, 0, 0);
        this.sprites.set(`${code}:${classe}`, t);
      });
    }
  }

  /**
   * Dessine une seule unité, centrée sur une toile de `cote × cote` pixels : pour la légende. Une construction avec son icône,
   * une unité avec son sprite, agrandi en pixels entiers ; `chantier` : la construction grise du jeu, pas encore finie.
   * `false` : les planches ne sont pas chargées, rien n'est dessiné.
   */
  dessinerIcone(ctx: CanvasRenderingContext2D, code: number, classe: number, cote: number, chantier = false): boolean {
    ctx.clearRect(0, 0, cote, cote);
    const couleur = COULEURS_DES_CLASSES[classe];
    if (!couleur) return false;
    if (code < CONSTRUCTIONS) {
      if (this.icones.length !== CONSTRUCTIONS) return false;
      this.poserConstruction(ctx, { code, x: 0, y: 0, classe, niveau: 1, chantier }, cote / 2, cote / 2, (cote * 0.9) / FORMES[code]!.echelle, true);
      return true;
    }
    const sprite = this.sprites.get(`${code}:${classe}`);
    if (!sprite) return false;
    const pixel = Math.max(1, Math.floor(cote / CASE_UNITE));
    const t = CASE_UNITE * pixel;
    const lisse = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, Math.round((cote - t) / 2), Math.round((cote - t) / 2), t, t);
    ctx.imageSmoothingEnabled = lisse;
    return true;
  }

  /** Pose une construction centrée en (cx, cy) : sa forme au bord sombre, remplie de la couleur du camp, et son icône. */
  private poserConstruction(ctx: CanvasRenderingContext2D, u: Unite, cx: number, cy: number, cote: number, avecIcone: boolean) {
    const f = FORMES[u.code]!;
    const couleur = COULEURS_DES_CLASSES[u.classe];
    if (!couleur) return;
    const { fond, bord } = couleursDeConstruction(couleur, u.chantier);
    const carre = cote * f.echelle;
    const r = carre * RAYON;
    const tracer = (rayon: number) => {
      ctx.beginPath();
      const sommets = sommetsDeForme(u.code, cx, cy, rayon);
      if (sommets.length === 0) ctx.arc(cx, cy, rayon, 0, 2 * Math.PI);
      else sommets.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
    };
    tracer(r);
    ctx.fillStyle = css(bord);
    ctx.fill();
    tracer(Math.max(0, r - carre * BORD));
    ctx.fillStyle = css(fond);
    ctx.fill();
    if (avecIcone && this.icones.length === CONSTRUCTIONS) {
      const t = carre * f.icone;
      ctx.drawImage(this.icones[u.code]!, cx - t / 2, cy - t / 2, t, t);
    }
  }

  /**
   * Dessine les détails de l'image montrée sur `ctx`, une toile de `largeur × hauteur` pixels qui couvre toute la carte du
   * film ; `ratio` : les pixels de la toile par pixel CSS. Les constructions d'abord, puis les navires et les bombes, puis les
   * noms par-dessus.
   */
  dessiner(ctx: CanvasRenderingContext2D, film: Film, unites: Iterable<Unite>, etiquettes: readonly Etiquette[], choix: ChoixDetails, largeur: number, hauteur: number, ratio: number) {
    const { entete } = film;
    ctx.clearRect(0, 0, largeur, hauteur);
    const parCase = largeur / entete.largeur;
    const parTuile = parCase / entete.facteur;
    const parTuileCss = parTuile / ratio;
    if (choix.unites) {
      const liste = [...unites];
      // La taille d'une construction suit la place de la carte ; son icône ne se dessine que sur une forme assez grande,
      // comme le jeu, qui ne montre que les formes quand on s'éloigne.
      const coteCss = coteDeConstruction(parTuileCss);
      const cote = coteCss * ratio;
      const icone = avecIcone(coteCss) && this.icones.length === CONSTRUCTIONS;
      for (const u of liste) {
        if (u.code >= CONSTRUCTIONS) continue;
        this.poserConstruction(ctx, u, (u.x + 0.5) * parTuile, (u.y + 0.5) * parTuile, cote, icone);
      }
      // Les sprites des unités, en pixels entiers : un pixel du jeu fait un ou deux pixels CSS.
      const pixel = Math.max(1, Math.round(Math.min(2, Math.max(1, parTuileCss * 2.5)) * ratio));
      const lisse = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      for (const u of liste) {
        if (u.code < CONSTRUCTIONS) continue;
        const sprite = this.sprites.get(`${u.code}:${u.classe}`);
        if (!sprite) continue;
        const t = CASE_UNITE * pixel;
        ctx.drawImage(sprite, Math.round((u.x + 0.5) * parTuile - t / 2), Math.round((u.y + 0.5) * parTuile - t / 2), t, t);
      }
      ctx.imageSmoothingEnabled = lisse;
    }
    if (choix.noms) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      for (const e of etiquettes) {
        const nom = entete.noms[e.nom];
        if (!nom) continue;
        const enCss = tailleDuNom((e.taille * parCase * 0.9) / ratio);
        if (enCss === null) continue;
        const taille = enCss * ratio;
        // Blanc, gras, cerné de sombre : l'écriture des noms du jeu, dans la police du site.
        ctx.font = `800 ${Math.round(taille)}px "Inter Variable", system-ui, sans-serif`;
        const x = (e.x + 0.5) * parCase;
        const y = (e.y + 0.5) * parCase;
        ctx.lineWidth = Math.max(2.5 * ratio, taille / 5.5);
        ctx.strokeStyle = CONTOUR_DES_NOMS;
        ctx.strokeText(nom.texte, x, y);
        ctx.fillStyle = ECRITURE_DES_NOMS;
        ctx.fillText(nom.texte, x, y);
      }
    }
  }
}
