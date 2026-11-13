/**
 * L'écran de la carte de l'alliance, à la place du film quand la fenêtre « Alliance » est ouverte : la carte complète au
 * dernier relevé, pixel par pixel (`src/lib/clanmap/etat.ts`), les clans en couleur de leur alliance, les zones à prendre,
 * et, pour l'encadrement, le dessin d'une zone au pixel près.
 *
 * Ce script ne change aucune valeur : il dessine l'état publié par le site et les zones du serveur. Le dessin d'une zone
 * reste dans ce navigateur jusqu'à son enregistrement, que le serveur vérifie (`save_alliance_zone`).
 * La carte se manie comme celle du film (`src/lib/clanmap/vue.ts`) : molette ou deux doigts pour le zoom, glisser pour se
 * déplacer, flèches, plus, moins et zéro au clavier. Avec un outil de dessin, un doigt dessine et deux doigts déplacent.
 */
import { CADRE_MAX, annuler, cadreDuCalque, dansLeMasque, forEachPixel, masqueDuCalque, poserMasque, rectangle, trait, type Masque, type Pinceau, type Retouche } from "../lib/alliance/masque";
import { clanRgb } from "../lib/clanmap/codec";
import { ETAT_MER, ETAT_NEUTRE, decoderEtat, type EtatCarte } from "../lib/clanmap/etat";
import { borner, decaler, echelleDuMonde, estVueDEnsemble, pointDeCarte, zoomer } from "../lib/clanmap/vue";
import type { StoredClanMapFilm } from "../lib/schemas";
import { loadFilmData } from "./film-data";

export type Outil = "main" | "crayon" | "gomme" | "rectangle";
export type Couleurs = "alliances" | "clans";

export interface ZoneAffichee {
  id: number;
  title: string;
  masque: Masque;
}

/** Ce qu'il y a sous le pointeur, sur la carte complète. */
export interface InfoPixel {
  x: number;
  y: number;
  /** Mer, terre neutre, ou un clan (son tag, `null` pour un clan supprimé). */
  sorte: "mer" | "neutre" | "clan";
  tag: string | null;
  /** La zone sous le pointeur, la plus récente quand plusieurs se chevauchent. */
  zone: number | null;
}

/** Le dessin en cours. */
export interface EtatDessin {
  pixels: number;
  cadre: { x: number; y: number; w: number; h: number } | null;
  /** Le cadre dépasse ce que le serveur accepte. */
  tropGrand: boolean;
  annulable: boolean;
}

export interface Chargement {
  film: StoredClanMapFilm;
  /** `null` : l'état pixel par pixel n'est pas publié pour ce relevé. */
  etat: EtatCarte | null;
}

interface Vue {
  x: number;
  y: number;
  s: number;
}

/** Au plus près, un pixel de la carte fait 32 pixels CSS : assez pour dessiner pixel par pixel au doigt. */
const MAX_CSS_PX = 32;
const ZOOM_STEP = 1.6;
const DRAG_PX = 5;
const KEY_PAN = 0.18;
/** Le quadrillage des pixels n'apparaît qu'à partir de ce zoom, en pixels CSS par pixel de la carte. */
const GRILLE_CSS_PX = 10;
/** Une zone plus petite que cela à l'écran, en pixels CSS, reçoit un repère pour être vue de loin. */
const REPERE_CSS_PX = 14;
const FOND = "#091426";
const DIM = [120, 130, 155, 80] as const;

const rgba = (r: number, g: number, b: number, a: number) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;

/**
 * L'état pixel par pixel de la carte. `null` s'il manque, s'il est abîmé, ou s'il n'est pas du même relevé que le film
 * (un cache de l'hébergeur peut garder l'un plus longtemps que l'autre) : les zones ne se comptent alors pas, mais la
 * discussion et les troupes restent.
 */
async function chargerEtat(assets: string, film: StoredClanMapFilm): Promise<EtatCarte | null> {
  try {
    const res = await fetch(`${assets}etat.bin.gz`);
    if (!res.ok) return null;
    let bytes = new Uint8Array(await res.arrayBuffer());
    // Un hébergeur peut avoir déjà décompressé le fichier en route, comme celui du film.
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    const etat = decoderEtat(bytes);
    return etat.seq === film.seq && etat.width === film.width && etat.height === film.height ? etat : null;
  } catch {
    return null;
  }
}

export class EcranAlliance {
  private pret: Promise<Chargement> | null = null;
  private readonly assets: string;
  private readonly root: HTMLElement;
  private readonly map: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private film: StoredClanMapFilm | null = null;
  private etat: EtatCarte | null = null;
  private terrain: HTMLImageElement | null = null;
  private base: HTMLCanvasElement | null = null;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private covered = 0;
  private vue: Vue = { x: 0, y: 0, s: 1 };
  private visible = false;
  private demande = 0;

  private couleurs = new Map<string, number>();
  private mode: Couleurs = "alliances";
  private zones: ZoneAffichee[] = [];
  private selection: number | null = null;
  private dessins = new Map<string, HTMLCanvasElement>();

  // Le dessin d'une zone par l'encadrement.
  private calque: Uint8Array | null = null;
  private brouillon: HTMLCanvasElement | null = null;
  private pixels = 0;
  private gestes: Retouche[] = [];
  private outil: Outil = "main";
  private taille = 1;
  private geste: { retouche: Retouche; x: number; y: number; ancre: [number, number]; fin: [number, number] } | null = null;

  private pointeurs = new Map<number, { x: number; y: number }>();
  private glisse: { x0: number; y0: number; x: number; y: number; bouge: boolean } | null = null;
  private pince: { distance: number; x: number; y: number; depuis: Vue } | null = null;
  private survolPx: [number, number] | null = null;

  onSurvol: (info: InfoPixel | null) => void = () => {};
  onClic: (info: InfoPixel) => void = () => {};
  onDessin: (etat: EtatDessin) => void = () => {};

  constructor(root: HTMLElement, assets: string) {
    this.root = root;
    const map = root.querySelector<HTMLElement>("[data-film-map]");
    const canvas = root.querySelector<HTMLCanvasElement>("[data-alliance-canvas]");
    const ctx = canvas?.getContext("2d");
    if (!map || !canvas || !ctx) throw new Error("écran de l'alliance absent");
    this.map = map;
    this.canvas = canvas;
    this.ctx = ctx;
    this.assets = assets;
  }

  /**
   * Charge la carte publiée, une seule fois, et seulement pour qui a accès à la carte de l'alliance : un visiteur ne
   * télécharge pas l'état pixel par pixel. Après un échec, un nouvel appel recommence.
   */
  charger(): Promise<Chargement> {
    this.pret ??= loadFilmData(this.assets)
      .then(async (data) => ({ data, etat: await chargerEtat(this.assets, data.film) }))
      .then(({ data, etat }) => {
        this.film = data.film;
        this.terrain = data.terrain;
        this.etat = etat;
        this.W = data.film.width;
        this.H = data.film.height;
        // La carte se peint au premier réglage des couleurs (`regler`), pas deux fois.
        this.brancher();
        this.vue = this.vueDEnsemble();
        return { film: data.film, etat: this.etat };
      })
      .catch((e: unknown) => {
        this.pret = null;
        throw e;
      });
    return this.pret;
  }

  /* ---------- Ce que règle la fenêtre ---------- */

  /** Montre l'écran de l'alliance à la place du film, ou rend la carte au film. */
  montrer(on: boolean): void {
    if (this.visible === on) return;
    this.visible = on;
    this.canvas.hidden = !on;
    for (const el of [this.map, this.root]) {
      if (on) el.dataset.vue = "alliance";
      else delete el.dataset.vue;
    }
    // Le cadre de la carte reçoit le clavier du film : à sa place, c'est l'écran de l'alliance qui le reçoit.
    if (this.map.hasAttribute("tabindex")) this.map.tabIndex = on ? -1 : 0;
    this.root.dispatchEvent(new CustomEvent("carte:alliance", { detail: { on } }));
    if (on) {
      this.redimensionner();
      this.dessiner();
    }
  }

  /** La couleur de chaque clan rangé dans une alliance, par son tag, et la façon de colorer la carte. */
  regler(couleurs: Map<string, number>, mode: Couleurs): void {
    this.couleurs = couleurs;
    this.mode = mode;
    this.peindreBase();
    this.dessiner();
  }

  /** Les zones à dessiner, et celle qui est choisie. */
  montrerZones(zones: ZoneAffichee[], selection: number | null): void {
    this.zones = zones;
    this.selection = selection;
    this.dessins.clear();
    this.dessiner();
  }

  /** Cadre la carte sur une zone. */
  viser(cadre: { x: number; y: number; w: number; h: number }): void {
    if (!this.film) return;
    const marge = 1.6;
    const s = Math.min((this.canvas.width - this.covered) / (cadre.w * marge), this.canvas.height / (cadre.h * marge));
    const cible = this.borne({ x: cadre.x + cadre.w / 2, y: cadre.y + cadre.h / 2, s });
    // La zone paraît au milieu de ce qu'aucune fenêtre ne couvre.
    this.vue = this.borne(decaler({ x: cadre.x + cadre.w / 2, y: cadre.y + cadre.h / 2, s: cible.s }, this.covered));
    this.dessiner();
  }

  vueGenerale(): void {
    this.vue = this.vueDEnsemble();
    this.dessiner();
  }

  zoom(facteur: number): void {
    this.zoomerAutour(facteur, (this.canvas.width - this.covered) / 2, this.canvas.height / 2);
  }

  /** Commence le dessin d'une zone, vide ou reprise d'une zone existante. */
  editer(masque: Masque | null): void {
    if (!this.etat) return;
    this.calque = new Uint8Array(this.W * this.H);
    if (masque) poserMasque(this.calque, this.W, masque);
    this.pixels = masque ? this.compter() : 0;
    this.gestes = [];
    const [brouillon] = this.calqueCanvas(this.W, this.H);
    this.brouillon = brouillon;
    if (masque) this.majBrouillon(masque.x, masque.y, masque.x + masque.w - 1, masque.y + masque.h - 1);
    this.annoncer();
    this.dessiner();
  }

  /** Arrête le dessin, enregistré ou abandonné. */
  finirEdition(): void {
    this.calque = null;
    this.brouillon = null;
    this.gestes = [];
    this.geste = null;
    this.outil = "main";
    this.canvas.dataset.outil = "main";
    this.dessiner();
  }

  choisirOutil(outil: Outil, taille: number): void {
    this.outil = this.calque ? outil : "main";
    this.taille = Math.max(1, Math.min(64, Math.round(taille)));
    this.canvas.dataset.outil = this.outil;
    this.dessiner();
  }

  annulerGeste(): void {
    const dernier = this.gestes.pop();
    if (!dernier || !this.calque) return;
    this.pixels += annuler(this.calque, dernier);
    this.majRetouche(dernier);
    this.annoncer();
    this.dessiner();
  }

  effacerTout(): void {
    if (!this.calque) return;
    const retouche: Retouche = new Map();
    for (let p = 0; p < this.calque.length; p++) {
      if (this.calque[p]) {
        retouche.set(p, 1);
        this.calque[p] = 0;
      }
    }
    if (retouche.size === 0) return;
    this.gestes.push(retouche);
    this.pixels = 0;
    this.majRetouche(retouche);
    this.annoncer();
    this.dessiner();
  }

  /** La zone dessinée, sous la forme gardée par le serveur. `null` : rien n'est dessiné. */
  masqueEdite(): Masque | null {
    return this.calque ? masqueDuCalque(this.calque, this.W) : null;
  }

  /* ---------- La carte de fond ---------- */

  private calqueCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("dessin indisponible");
    return [canvas, ctx];
  }

  /** Les clans, de la couleur de leur alliance (les autres en gris), ou de leur propre couleur ; la mer et la terre neutre au pixel près. */
  private peindreBase(): void {
    if (!this.film || !this.etat) return;
    const clans = this.film.clans;
    const palette = new Uint32Array(clans.length + 1);
    for (let i = 1; i < clans.length; i++) {
      const tag = clans[i]?.tag ?? null;
      const alliance = tag === null ? undefined : this.couleurs.get(tag);
      if (this.mode === "clans") {
        const [r, g, b] = clanRgb(clans[i]?.color ?? null);
        palette[i + 1] = rgba(r, g, b, alliance === undefined ? 150 : 225);
      } else if (alliance !== undefined) {
        palette[i + 1] = rgba((alliance >> 16) & 0xff, (alliance >> 8) & 0xff, alliance & 0xff, 230);
      } else {
        palette[i + 1] = rgba(DIM[0], DIM[1], DIM[2], DIM[3]);
      }
    }
    // La mer et la terre au pixel près, d'après l'état : le fond de carte, réduit de moitié, ne dessine la côte que par
    // carrés de deux pixels. La mer prend la couleur de celle du fond ; la terre neutre, un voile gris qui laisse voir le relief.
    palette[ETAT_MER] = rgba(9, 20, 37, 255);
    palette[ETAT_NEUTRE] = rgba(60, 64, 63, 120);
    const [base, ctx] = this.base ? [this.base, this.base.getContext("2d")!] : this.calqueCanvas(this.W, this.H);
    this.base = base;
    const image = ctx.createImageData(this.W, this.H);
    const pix = new Uint32Array(image.data.buffer);
    const valeurs = this.etat.valeurs;
    for (let p = 0; p < valeurs.length; p++) pix[p] = palette[valeurs[p]!] ?? 0;
    ctx.putImageData(image, 0, 0);
  }

  /** Une zone : des hachures blanches, qui laissent voir à qui est chaque pixel, et un bord plein. Jaune quand elle est choisie. */
  private dessinDeZone(zone: ZoneAffichee): HTMLCanvasElement {
    const cle = `${zone.id}:${zone.id === this.selection ? 1 : 0}`;
    const deja = this.dessins.get(cle);
    if (deja) return deja;
    const { masque } = zone;
    const [canvas, ctx] = this.calqueCanvas(masque.w, masque.h);
    const image = ctx.createImageData(masque.w, masque.h);
    const pix = new Uint32Array(image.data.buffer);
    const choisie = zone.id === this.selection;
    const bord = choisie ? rgba(250, 204, 21, 255) : rgba(255, 255, 255, 235);
    const raie = choisie ? rgba(250, 204, 21, 190) : rgba(255, 255, 255, 150);
    const voile = choisie ? rgba(250, 204, 21, 55) : rgba(255, 255, 255, 30);
    forEachPixel(masque, (x, y) => {
      const lx = x - masque.x;
      const ly = y - masque.y;
      const auBord = !dansLeMasque(masque, x - 1, y) || !dansLeMasque(masque, x + 1, y) || !dansLeMasque(masque, x, y - 1) || !dansLeMasque(masque, x, y + 1);
      pix[ly * masque.w + lx] = auBord ? bord : (x + y) % 4 === 0 ? raie : voile;
    });
    ctx.putImageData(image, 0, 0);
    this.dessins.set(cle, canvas);
    return canvas;
  }

  /** Recopie une partie du calque sur le brouillon affiché. */
  private majBrouillon(x0: number, y0: number, x1: number, y1: number): void {
    if (!this.calque || !this.brouillon) return;
    const gauche = Math.max(0, Math.min(x0, x1));
    const haut = Math.max(0, Math.min(y0, y1));
    const droite = Math.min(this.W - 1, Math.max(x0, x1));
    const bas = Math.min(this.H - 1, Math.max(y0, y1));
    if (droite < gauche || bas < haut) return;
    const w = droite - gauche + 1;
    const h = bas - haut + 1;
    const ctx = this.brouillon.getContext("2d")!;
    const image = ctx.createImageData(w, h);
    const pix = new Uint32Array(image.data.buffer);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const gx = gauche + x;
        const gy = haut + y;
        if (this.calque[gy * this.W + gx]) pix[y * w + x] = (gx + gy) % 3 === 0 ? rgba(125, 211, 252, 240) : rgba(125, 211, 252, 120);
      }
    }
    ctx.putImageData(image, gauche, haut);
  }

  private majRetouche(retouche: Retouche): void {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -1;
    let y1 = -1;
    for (const p of retouche.keys()) {
      const x = p % this.W;
      const y = Math.floor(p / this.W);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    if (x1 >= 0) this.majBrouillon(x0, y0, x1, y1);
  }

  private compter(): number {
    let n = 0;
    if (this.calque) for (let p = 0; p < this.calque.length; p++) n += this.calque[p]!;
    return n;
  }

  private annoncer(): void {
    const cadre = this.calque && this.pixels > 0 ? cadreDuCalque(this.calque, this.W) : null;
    this.onDessin({ pixels: this.pixels, cadre, tropGrand: cadre !== null && cadre.w * cadre.h > CADRE_MAX, annulable: this.gestes.length > 0 });
  }

  /* ---------- La vue ---------- */

  private ecran() {
    return { width: this.canvas.width, height: this.canvas.height };
  }

  private vueDEnsemble(): Vue {
    const monde = { width: this.W, height: this.H };
    const s = echelleDuMonde(monde, this.ecran());
    return this.borne({ x: this.W / 2, y: this.H / 2, s });
  }

  private borne(vue: Vue): Vue {
    return borner(vue, { width: this.W, height: this.H }, this.ecran(), MAX_CSS_PX * this.dpr, this.covered);
  }

  private zoomerAutour(facteur: number, px: number, py: number): void {
    const s = this.borne({ ...this.vue, s: this.vue.s * facteur }).s;
    this.vue = this.borne(zoomer(this.vue, s, px, py, this.ecran()));
    this.dessiner();
  }

  private deplacer(dx: number, dy: number): void {
    this.vue = this.borne({ x: this.vue.x - dx / this.vue.s, y: this.vue.y - dy / this.vue.s, s: this.vue.s });
    this.dessiner();
  }

  private mesurer(): void {
    const fenetre = this.root.querySelector<HTMLElement>("[data-fenetre].est-ouverte");
    const m = this.map.getBoundingClientRect();
    const f = fenetre?.getBoundingClientRect();
    this.covered = !f || f.width === 0 || m.width === 0 || f.bottom <= m.top || f.top >= m.bottom ? 0 : Math.max(0, m.right - f.left) * (this.canvas.width / m.width);
  }

  private redimensionner(): void {
    if (!this.visible) return;
    const r = this.map.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(r.width * this.dpr));
    const height = Math.max(1, Math.round(r.height * this.dpr));
    const premier = this.canvas.width <= 1 || this.canvas.height <= 1;
    const etaitEnsemble = !premier && estVueDEnsemble(this.vue, { width: this.W, height: this.H }, this.ecran());
    this.canvas.width = width;
    this.canvas.height = height;
    this.mesurer();
    this.vue = premier || etaitEnsemble ? this.vueDEnsemble() : this.borne(this.vue);
    this.dessiner();
  }

  /** Le pixel de la carte complète sous un point de l'écran. */
  private pixelSous(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) * (this.canvas.width / r.width);
    const py = (e.clientY - r.top) * (this.canvas.height / r.height);
    const [mx, my] = pointDeCarte(this.vue, px, py, this.ecran());
    return [Math.floor(mx), Math.floor(my)];
  }

  private dansLeDessin(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * (this.canvas.width / r.width), (e.clientY - r.top) * (this.canvas.height / r.height)];
  }

  private info(x: number, y: number): InfoPixel | null {
    if (!this.film || !this.etat || x < 0 || y < 0 || x >= this.W || y >= this.H) return null;
    const v = this.etat.valeurs[y * this.W + x]!;
    let zone: number | null = null;
    for (const z of this.zones) if (dansLeMasque(z.masque, x, y)) zone = z.id;
    if (v === ETAT_MER) return { x, y, sorte: "mer", tag: null, zone };
    if (v === ETAT_NEUTRE) return { x, y, sorte: "neutre", tag: null, zone };
    return { x, y, sorte: "clan", tag: this.film.clans[v - 1]?.tag ?? null, zone };
  }

  /* ---------- Le dessin à l'écran ---------- */

  private dessiner(): void {
    if (!this.visible || this.demande) return;
    this.demande = requestAnimationFrame(() => {
      this.demande = 0;
      this.peindre();
    });
  }

  private peindre(): void {
    const c = this.ctx;
    const { s, x, y } = this.vue;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = FOND;
    c.fillRect(0, 0, cw, ch);
    if (!this.film || !this.base || !this.terrain) return;
    c.setTransform(s, 0, 0, s, cw / 2 - x * s, ch / 2 - y * s);
    c.imageSmoothingEnabled = s < 1;
    c.drawImage(this.terrain, 0, 0, this.W, this.H);
    c.drawImage(this.base, 0, 0);
    c.imageSmoothingEnabled = false;
    for (const zone of this.zones) {
      if (this.calque && zone.id === this.selection) continue;
      c.drawImage(this.dessinDeZone(zone), zone.masque.x, zone.masque.y);
    }
    if (this.brouillon) c.drawImage(this.brouillon, 0, 0);

    // Le quadrillage des pixels, de près, pour dessiner au pixel.
    const cssPx = s / this.dpr;
    if (cssPx >= GRILLE_CSS_PX) {
      const [gx0, gy0] = pointDeCarte(this.vue, 0, 0, this.ecran());
      const [gx1, gy1] = pointDeCarte(this.vue, cw, ch, this.ecran());
      c.beginPath();
      for (let gx = Math.max(0, Math.floor(gx0)); gx <= Math.min(this.W, Math.ceil(gx1)); gx++) {
        c.moveTo(gx, Math.max(0, gy0));
        c.lineTo(gx, Math.min(this.H, gy1));
      }
      for (let gy = Math.max(0, Math.floor(gy0)); gy <= Math.min(this.H, Math.ceil(gy1)); gy++) {
        c.moveTo(Math.max(0, gx0), gy);
        c.lineTo(Math.min(this.W, gx1), gy);
      }
      c.strokeStyle = "rgba(255,255,255,0.14)";
      c.lineWidth = 1 / s;
      c.stroke();
    }

    // L'aperçu du pinceau ou du rectangle.
    if (this.calque && this.outil !== "main") {
      c.lineWidth = 2 / s;
      c.strokeStyle = this.outil === "gomme" ? "#f87171" : "#7dd3fc";
      if (this.outil === "rectangle" && this.geste) {
        const [ax, ay] = this.geste.ancre;
        const [bx, by] = this.geste.fin;
        c.strokeRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax) + 1, Math.abs(by - ay) + 1);
      } else if (this.survolPx) {
        const demi = Math.floor((this.taille - 1) / 2);
        const t = this.outil === "rectangle" ? 1 : this.taille;
        c.strokeRect(this.survolPx[0] - (this.outil === "rectangle" ? 0 : demi), this.survolPx[1] - (this.outil === "rectangle" ? 0 : demi), t, t);
      }
    }

    // De loin, une petite zone serait invisible : un losange la signale, avec son nom.
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.font = `${Math.round(12 * this.dpr)}px ui-monospace, monospace`;
    c.textBaseline = "middle";
    for (const zone of this.zones) {
      const { masque } = zone;
      if (Math.max(masque.w, masque.h) * cssPx >= REPERE_CSS_PX * 4) continue;
      const cx = (masque.x + masque.w / 2 - x) * s + cw / 2;
      const cy = (masque.y + masque.h / 2 - y) * s + ch / 2;
      if (cx < -50 || cy < -50 || cx > cw + 50 || cy > ch + 50) continue;
      const r = 6 * this.dpr;
      c.beginPath();
      c.moveTo(cx, cy - r);
      c.lineTo(cx + r, cy);
      c.lineTo(cx, cy + r);
      c.lineTo(cx - r, cy);
      c.closePath();
      c.fillStyle = zone.id === this.selection ? "#facc15" : "#ffffff";
      c.strokeStyle = FOND;
      c.lineWidth = 2 * this.dpr;
      c.stroke();
      c.fill();
      c.lineWidth = 3 * this.dpr;
      c.strokeText(zone.title, cx + r + 4 * this.dpr, cy);
      c.fillText(zone.title, cx + r + 4 * this.dpr, cy);
    }
    this.canvas.dataset.zoom = (s / this.vueDEnsemble().s).toFixed(2);
  }

  /* ---------- La souris, le doigt et le clavier ---------- */

  private pinceau(valeur: 0 | 1): Pinceau {
    const valeurs = this.etat!.valeurs;
    return { width: this.W, height: this.H, taille: this.outil === "rectangle" ? 1 : this.taille, valeur, permis: (p) => valeurs[p] !== ETAT_MER };
  }

  private appliquer(x0: number, y0: number, x1: number, y1: number): void {
    if (!this.calque || !this.geste) return;
    const valeur = this.outil === "gomme" ? 0 : 1;
    const avant = this.geste.retouche.size;
    const pinceau = this.pinceau(valeur);
    const changes = trait(this.calque, pinceau, x0, y0, x1, y1, this.geste.retouche);
    this.pixels += valeur === 1 ? changes : -changes;
    if (this.geste.retouche.size !== avant || changes > 0) {
      const demi = Math.floor((this.taille - 1) / 2) + 1;
      this.majBrouillon(Math.min(x0, x1) - demi, Math.min(y0, y1) - demi, Math.max(x0, x1) + demi, Math.max(y0, y1) + demi);
    }
  }

  private finirGeste(): void {
    if (!this.geste || !this.calque) return;
    if (this.outil === "rectangle") {
      const [ax, ay] = this.geste.ancre;
      const [bx, by] = this.geste.fin;
      const changes = rectangle(this.calque, this.pinceau(1), ax, ay, bx, by, this.geste.retouche);
      this.pixels += changes;
      this.majBrouillon(ax, ay, bx, by);
    }
    if (this.geste.retouche.size > 0) this.gestes.push(this.geste.retouche);
    this.geste = null;
    this.annoncer();
    this.dessiner();
  }

  private deuxDoigts(): { distance: number; x: number; y: number } | null {
    const [a, b] = [...this.pointeurs.values()];
    if (!a || !b) return null;
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private brancher(): void {
    const canvas = this.canvas;
    canvas.tabIndex = 0;

    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      const [x, y] = this.dansLeDessin(e);
      this.pointeurs.set(e.pointerId, { x, y });
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Un pointeur déjà relâché ne se capture pas.
      }
      if (this.pointeurs.size === 2) {
        // Un deuxième doigt : le geste devient un pincement, et le trait commencé s'arrête là.
        if (this.geste) this.finirGeste();
        const doigts = this.deuxDoigts();
        this.pince = doigts ? { ...doigts, depuis: { ...this.vue } } : null;
        this.glisse = null;
        return;
      }
      const dessine = this.calque !== null && this.outil !== "main" && e.button === 0;
      if (dessine) {
        const [mx, my] = this.pixelSous(e);
        this.geste = { retouche: new Map(), x: mx, y: my, ancre: [mx, my], fin: [mx, my] };
        if (this.outil !== "rectangle") this.appliquer(mx, my, mx, my);
        this.dessiner();
      } else {
        this.glisse = { x0: x, y0: y, x, y, bouge: false };
      }
    });

    canvas.addEventListener("pointermove", (e) => {
      const tenu = this.pointeurs.get(e.pointerId);
      const [mx, my] = this.pixelSous(e);
      if (!this.survolPx || this.survolPx[0] !== mx || this.survolPx[1] !== my) {
        this.survolPx = [mx, my];
        this.onSurvol(this.info(mx, my));
        if (this.calque && this.outil !== "main") this.dessiner();
      }
      if (!tenu) return;
      const [x, y] = this.dansLeDessin(e);
      tenu.x = x;
      tenu.y = y;
      if (this.pince) {
        const doigts = this.deuxDoigts();
        if (!doigts || this.pince.distance === 0) return;
        const depuis = this.pince.depuis;
        const s = this.borne({ ...depuis, s: depuis.s * (doigts.distance / this.pince.distance) }).s;
        const [cx, cy] = pointDeCarte(depuis, this.pince.x, this.pince.y, this.ecran());
        this.vue = this.borne({ x: cx - (doigts.x - this.canvas.width / 2) / s, y: cy - (doigts.y - this.canvas.height / 2) / s, s });
        this.dessiner();
        return;
      }
      if (this.geste) {
        if (this.outil === "rectangle") this.geste.fin = [mx, my];
        else this.appliquer(this.geste.x, this.geste.y, mx, my);
        this.geste.x = mx;
        this.geste.y = my;
        this.dessiner();
        return;
      }
      if (!this.glisse) return;
      if (!this.glisse.bouge && Math.hypot(x - this.glisse.x0, y - this.glisse.y0) < DRAG_PX * this.dpr) return;
      if (!this.glisse.bouge) {
        this.glisse.bouge = true;
        canvas.classList.add("est-saisie");
      }
      this.deplacer(x - this.glisse.x, y - this.glisse.y);
      this.glisse.x = x;
      this.glisse.y = y;
    });

    const relacher = (e: PointerEvent) => {
      if (!this.pointeurs.delete(e.pointerId)) return;
      if (this.pointeurs.size < 2) this.pince = null;
      if (this.pointeurs.size === 1) {
        // Un doigt reste après un pincement : il déplace la carte, sans dessiner ni cliquer.
        const [reste] = [...this.pointeurs.values()];
        this.glisse = reste ? { x0: reste.x, y0: reste.y, x: reste.x, y: reste.y, bouge: true } : null;
        return;
      }
      canvas.classList.remove("est-saisie");
      if (this.geste) {
        this.finirGeste();
        return;
      }
      const clic = this.glisse !== null && !this.glisse.bouge && e.type === "pointerup";
      this.glisse = null;
      if (!clic) return;
      const info = this.info(...this.pixelSous(e));
      if (info) this.onClic(info);
    };
    canvas.addEventListener("pointerup", relacher);
    canvas.addEventListener("pointercancel", relacher);
    canvas.addEventListener("pointerleave", () => {
      if (this.pointeurs.size > 0) return;
      this.survolPx = null;
      this.onSurvol(null);
      this.dessiner();
    });
    // Au doigt, le navigateur enverrait son clic après coup à ce qui se trouve alors sous le doigt.
    canvas.addEventListener("touchend", (e) => {
      if (e.cancelable) e.preventDefault();
    });

    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
        const [px, py] = this.dansLeDessin(e);
        this.zoomerAutour(Math.exp(-delta / (e.ctrlKey ? 110 : 320)), px, py);
      },
      { passive: false },
    );

    canvas.addEventListener("keydown", (e) => {
      if (e.altKey) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        this.annulerGeste();
        e.preventDefault();
        return;
      }
      if (e.ctrlKey || e.metaKey) return;
      const pasX = this.canvas.width * KEY_PAN;
      const pasY = this.canvas.height * KEY_PAN;
      if (e.key === "ArrowLeft") this.deplacer(pasX, 0);
      else if (e.key === "ArrowRight") this.deplacer(-pasX, 0);
      else if (e.key === "ArrowUp") this.deplacer(0, pasY);
      else if (e.key === "ArrowDown") this.deplacer(0, -pasY);
      else if (e.key === "+" || e.key === "=") this.zoom(ZOOM_STEP);
      else if (e.key === "-") this.zoom(1 / ZOOM_STEP);
      else if (e.key === "0" || e.code === "Digit0" || e.code === "Numpad0") this.vueGenerale();
      else return;
      e.preventDefault();
      // Le film écoute aussi le clavier de la carte : ces touches sont pour l'écran de l'alliance.
      e.stopPropagation();
    });

    for (const bouton of this.root.querySelectorAll<HTMLButtonElement>("[data-alliance-zoom]")) {
      bouton.addEventListener("click", () => this.zoom(Number(bouton.dataset.allianceZoom) > 0 ? ZOOM_STEP : 1 / ZOOM_STEP));
    }
    this.root.querySelector<HTMLButtonElement>("[data-alliance-monde]")?.addEventListener("click", () => this.vueGenerale());

    if (typeof ResizeObserver === "function") new ResizeObserver(() => this.redimensionner()).observe(this.map);
    else addEventListener("resize", () => this.redimensionner());
    this.root.addEventListener("carte:fenetre", () => {
      this.mesurer();
      this.vue = this.borne(this.vue);
      this.dessiner();
    });
  }
}

let ecran: EcranAlliance | null = null;

/** L'écran de l'alliance de la page, créé une fois. `null` : la page n'a pas de carte. */
export function ecranAlliance(): EcranAlliance | null {
  if (ecran) return ecran;
  const root = document.querySelector<HTMLElement>("[data-carte]");
  const assets = root?.dataset.assets;
  if (!root || !assets) return null;
  ecran = new EcranAlliance(root, assets);
  return ecran;
}
