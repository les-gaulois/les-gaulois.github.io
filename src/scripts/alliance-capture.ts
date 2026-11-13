/**
 * Le dessin de la capture de la carte de l'alliance (`src/lib/alliance/capture.ts`), dans le navigateur : le logo de GAL et
 * le titre en haut, la carte telle que le joueur l'a cadrée, les couleurs et les zones numérotées dans le panneau de droite,
 * et en bas le crédit du fond de carte, que sa licence (CC BY-SA 4.0) demande sur l'image même.
 *
 * Ce script ne change aucune valeur : il écrit les textes déjà mis en forme par la fenêtre, et la carte peinte par l'écran
 * de l'alliance. L'image reste dans ce navigateur : rien n'est envoyé au serveur.
 */
import { CAPTURE, blocsQuiTiennent, couperEnLignes, raccourcir, versLImage, type ContenuCapture, type EntreeZone, type Vue } from "../lib/alliance/capture";
import type { Ecran } from "../lib/clanmap/vue";

/** Ce que la capture demande à l'écran de l'alliance : la carte peinte dans un autre dessin. */
export interface SourceCarte {
  peindreCapture(c: CanvasRenderingContext2D, vue: Vue, sortie: Ecran, zones: boolean): void;
}

/** L'encre du poste de commandement, comme les images du robot (`gazette-image.ts`). */
const C = {
  NAVY: "#050B1F",
  SURFACE: "#0A1433",
  LINE: "#1B2B5E",
  LINE_STRONG: "#5469AE",
  BLUE: "#0B5FFF",
  BLUE_TEXT: "#9DBCFF",
  RED: "#FF1A2E",
  MUTED: "#C0C9E2",
  WHITE: "#FFFFFF",
  /** Le texte sombre posé sur la couleur vive d'une étiquette. */
  ENCRE: "#0A1230",
} as const;

const POLICES = {
  titre: '"GAL Onciale Cases", "GAL Onciale", "Outfit Variable", system-ui, sans-serif',
  corps: '"Inter Variable", system-ui, sans-serif',
  mono: '"JetBrains Mono Variable", ui-monospace, Consolas, monospace',
} as const;
type Police = keyof typeof POLICES;

const police = (famille: Police, taille: number, gras = false) => `${gras ? 700 : 400} ${taille}px ${POLICES[famille]}`;
const css = (couleur: number) => `#${(couleur & 0xffffff).toString(16).padStart(6, "0")}`;
/** La lettrine du titre : la première lettre agrandie, en rouge, comme le titre d'une page du site. */
const LETTRINE = 1.45;

/** Les polices de l'image, chargées avant de dessiner : sinon le navigateur écrirait avec celle de secours. */
async function chargerPolices(): Promise<void> {
  if (!("fonts" in document)) return;
  const attendre = Promise.allSettled([
    document.fonts.load(police("titre", 44)),
    document.fonts.load(police("corps", 20)),
    document.fonts.load(police("corps", 20, true)),
    document.fonts.load(police("mono", 16)),
    document.fonts.load(police("mono", 16, true)),
  ]);
  // Une police qui ne vient pas ne bloque pas la capture : celle de secours écrit le même texte.
  await Promise.race([attendre, new Promise((r) => setTimeout(r, 3000))]);
}

function chargerImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Un rectangle aux coins arrondis, ou droits si le navigateur ne sait pas les arrondir. */
function cadre(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  if (typeof c.roundRect === "function") c.roundRect(x, y, w, h, r);
  else c.rect(x, y, w, h);
}

/** La taille la plus grande, entre `max` et `min`, à laquelle un texte tient dans `largeur`. */
function ajuster(c: CanvasRenderingContext2D, texte: string, famille: Police, max: number, min: number, largeur: number, gras = false): number {
  for (let taille = max; taille > min; taille--) {
    c.font = police(famille, taille, gras);
    if (c.measureText(texte).width <= largeur) return taille;
  }
  c.font = police(famille, min, gras);
  return min;
}

function mesureEn(c: CanvasRenderingContext2D, famille: Police, taille: number, gras = false) {
  return (texte: string) => {
    c.font = police(famille, taille, gras);
    return c.measureText(texte).width;
  };
}

function ecrire(c: CanvasRenderingContext2D, texte: string, x: number, y: number, famille: Police, taille: number, couleur: string, opts: { gras?: boolean; fin?: boolean; largeur?: number } = {}): number {
  c.font = police(famille, taille, opts.gras);
  const t = opts.largeur === undefined ? texte : raccourcir(texte, opts.largeur, (s) => c.measureText(s).width);
  c.fillStyle = couleur;
  c.textAlign = opts.fin ? "right" : "left";
  c.textBaseline = "alphabetic";
  c.fillText(t, x, y);
  return c.measureText(t).width;
}

/** L'en-tête : le logo de GAL, l'invite de la console, le titre, puis le nom de l'alliance et les dates à droite. */
function entete(c: CanvasRenderingContext2D, contenu: ContenuCapture, logo: HTMLImageElement | null): void {
  const { marge, largeur } = CAPTURE;
  let x = marge;
  if (logo && logo.naturalWidth > 0) {
    const h = 80;
    const w = Math.round((logo.naturalWidth / logo.naturalHeight) * h);
    c.drawImage(logo, x, 20, w, h);
    x += w + 28;
  } else {
    // Sans le logo publié, le tag du clan en tient lieu.
    x += ecrire(c, "[GAL]", x, 82, "corps", 46, C.WHITE, { gras: true }) + 28;
  }

  // L'invite décorative de la console, comme sur la page : la voix de la machine, en bleu clair et en blanc.
  let ix = x;
  ix += ecrire(c, "gal@carte", ix, 46, "mono", 18, C.BLUE_TEXT, { gras: true });
  ix += ecrire(c, ":~$ ", ix, 46, "mono", 18, C.MUTED);
  ix += ecrire(c, "./alliance", ix, 46, "mono", 18, C.WHITE);
  c.fillStyle = C.RED;
  c.fillRect(Math.round(ix + 7), 30, 11, 21);

  // Le titre, avec sa lettrine rouge.
  const droiteTitre = 1180;
  const lettre = [...contenu.titre][0] ?? "";
  const suite = contenu.titre.slice(lettre.length);
  const taille = ajuster(c, contenu.titre, "titre", 46, 30, droiteTitre - x - 20);
  const lx = ecrire(c, lettre, x, 100, "titre", Math.round(taille * LETTRINE), C.RED);
  ecrire(c, suite, x + lx, 100, "titre", taille, C.WHITE);

  // À droite : le nom de notre alliance, puis les dates.
  const fin = largeur - marge;
  const place = fin - droiteTitre;
  let y = 46;
  if (contenu.sousTitre) {
    ecrire(c, contenu.sousTitre, fin, y, "corps", 24, C.WHITE, { gras: true, fin: true, largeur: place });
    y += 30;
  }
  for (const date of contenu.dates) {
    ecrire(c, date, fin, y, "corps", 19, C.MUTED, { fin: true, largeur: place });
    y += 26;
  }

  // Le filet sous l'en-tête, avec les trois couleurs à gauche.
  c.fillStyle = C.LINE;
  c.fillRect(marge, CAPTURE.entete.h - 8, largeur - 2 * marge, 1);
  [C.BLUE, C.WHITE, C.RED].forEach((couleur, i) => {
    c.fillStyle = couleur;
    c.fillRect(marge + i * 33, CAPTURE.entete.h - 10, 30, 5);
  });
}

/** Les numéros des zones posés sur la carte, avec leur nom quand il a la place de s'écrire sans en couvrir un autre. */
function etiquettes(c: CanvasRenderingContext2D, entrees: readonly EntreeZone[], vue: Vue, sortie: Ecran): void {
  const { x: ox, y: oy } = CAPTURE.carte;
  const posees: { g: number; h: number; d: number; b: number }[] = [];
  const touche = (r: { g: number; h: number; d: number; b: number }) => posees.some((p) => r.g < p.d && r.d > p.g && r.h < p.b && r.b > p.h);
  const hauteur = 30;
  c.textBaseline = "middle";
  for (const e of entrees) {
    const [px, py] = versLImage(vue, sortie, e.point[0] + 0.5, e.point[1] + 0.5);
    const cx = Math.min(Math.max(px, 24), sortie.width - 24) + ox;
    const cy = Math.min(Math.max(py, hauteur / 2 + 4), sortie.height - hauteur / 2 - 4) + oy;
    const numero = String(e.numero);
    c.font = police("corps", 18, true);
    const largeurNumero = Math.max(hauteur, c.measureText(numero).width + 16);
    const nom = raccourcir(e.titre, 260, (s) => c.measureText(s).width);
    const largeurNom = c.measureText(nom).width + 14;
    // Le nom s'écrit dans l'étiquette s'il ne couvre ni une autre étiquette, ni le bord de la carte.
    let largeurTotale = largeurNumero + largeurNom;
    let gauche = cx - largeurNumero / 2;
    const avecNom = gauche + largeurTotale <= ox + sortie.width - 4 && !touche({ g: gauche - 3, h: cy - hauteur / 2 - 3, d: gauche + largeurTotale + 3, b: cy + hauteur / 2 + 3 });
    if (!avecNom) largeurTotale = largeurNumero;
    gauche = Math.min(gauche, ox + sortie.width - 4 - largeurTotale);
    posees.push({ g: gauche, h: cy - hauteur / 2, d: gauche + largeurTotale, b: cy + hauteur / 2 });
    const fond = e.couleur === null ? C.WHITE : css(e.couleur);
    cadre(c, gauche, cy - hauteur / 2, largeurTotale, hauteur, 6);
    c.fillStyle = fond;
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = C.NAVY;
    c.stroke();
    c.fillStyle = C.ENCRE;
    c.textAlign = "center";
    c.fillText(numero, gauche + largeurNumero / 2, cy + 1);
    if (avecNom) {
      c.fillStyle = C.ENCRE;
      c.fillRect(gauche + largeurNumero, cy - hauteur / 2 + 6, 1, hauteur - 12);
      c.textAlign = "left";
      c.font = police("corps", 18, true);
      c.fillText(nom, gauche + largeurNumero + 7, cy + 1);
    }
  }
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
}

/** Le libellé d'une partie du panneau, en capitales, dans la voix de la machine. */
function libelle(c: CanvasRenderingContext2D, texte: string, x: number, y: number): void {
  c.save();
  c.font = police("mono", 16, true);
  if ("letterSpacing" in c) (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "1px";
  c.fillStyle = C.BLUE_TEXT;
  c.fillText(texte.toLocaleUpperCase("fr-FR"), x, y);
  c.restore();
}

/** Le panneau de droite : les couleurs de la carte, puis les zones numérotées et leurs chiffres, puis les règles et le cadre. */
function panneau(c: CanvasRenderingContext2D, contenu: ContenuCapture): void {
  const p = CAPTURE.panneau;
  cadre(c, p.x, p.y, p.w, p.h, 8);
  c.fillStyle = C.SURFACE;
  c.fill();
  c.lineWidth = 1;
  c.strokeStyle = C.LINE;
  c.stroke();

  const pad = 24;
  const x = p.x + pad;
  const w = p.w - 2 * pad;
  const fin = x + w;
  let y = p.y + pad + 14;

  // Le bas du panneau, posé d'abord : les règles du coût des zones et le cadre en coordonnées.
  const mesurePetit = mesureEn(c, "corps", 16);
  // Les règles du coût des zones, seulement quand l'image en montre.
  const regles = contenu.zones && contenu.zones.entrees.length > 0 ? couperEnLignes(contenu.zones.regles, w, mesurePetit) : [];
  const basLignes = [...regles.map((t) => ({ t, mono: false })), { t: contenu.cadre, mono: true }];
  let bas = p.y + p.h - pad;
  for (const ligne of [...basLignes].reverse()) {
    if (ligne.mono) ecrire(c, ligne.t, x, bas, "mono", 15, C.MUTED, { largeur: w });
    else ecrire(c, ligne.t, x, bas, "corps", 16, C.MUTED);
    bas -= 22;
  }
  const limite = bas - 14;

  // Les couleurs de la carte.
  libelle(c, contenu.legendeTitre, x, y);
  y += 34;
  for (const l of contenu.legende) {
    cadre(c, x, y - 17, 20, 20, 3);
    c.fillStyle = css(l.couleur);
    c.fill();
    c.lineWidth = 1;
    c.strokeStyle = C.NAVY;
    c.stroke();
    const larg = ecrire(c, l.detail, fin, y, "corps", 19, C.MUTED, { fin: true });
    ecrire(c, l.texte, x + 32, y, "corps", 21, C.WHITE, { gras: true, largeur: w - 32 - larg - 16 });
    y += 32;
  }
  const mesureNote = mesureEn(c, "corps", 17);
  for (const note of contenu.legendeNotes) {
    for (const ligne of couperEnLignes(note, w, mesureNote)) {
      ecrire(c, ligne, x, y, "corps", 17, C.MUTED);
      y += 24;
    }
  }

  // Les zones, autant que le panneau en tient ; les autres restent numérotées sur la carte.
  if (!contenu.zones || contenu.zones.entrees.length === 0) return;
  y += 22;
  c.fillStyle = C.LINE;
  c.fillRect(x, y - 22, w, 1);
  libelle(c, contenu.zones.titre, x, y + 8);
  y += 42;
  const mesureLigne = mesureEn(c, "corps", 18);
  const blocs = contenu.zones.entrees.map((e) => ({ e, lignes: e.lignes.flatMap((l) => couperEnLignes(l, w - 44, mesureLigne)) }));
  const hauteurs = blocs.map(({ lignes }) => 30 + lignes.length * 25 + 14);
  const poses = blocsQuiTiennent(hauteurs, limite - y, 30);
  for (const { e, lignes } of blocs.slice(0, poses)) {
    // Le numéro, comme sur la carte, puis le nom et la part prise.
    c.font = police("corps", 17, true);
    const numero = String(e.numero);
    const largeurNumero = Math.max(28, c.measureText(numero).width + 14);
    cadre(c, x, y - 21, largeurNumero, 28, 6);
    c.fillStyle = e.couleur === null ? C.WHITE : css(e.couleur);
    c.fill();
    c.fillStyle = C.ENCRE;
    c.textAlign = "center";
    c.fillText(numero, x + largeurNumero / 2, y - 1);
    c.textAlign = "left";
    const larg = ecrire(c, e.droite, fin, y, "corps", 19, C.WHITE, { gras: true, fin: true });
    ecrire(c, e.titre, x + 44, y, "corps", 21, C.WHITE, { gras: true, largeur: w - 44 - larg - 14 });
    y += 30;
    for (const ligne of lignes) {
      ecrire(c, ligne, x + 44, y, "corps", 18, C.MUTED);
      y += 25;
    }
    y += 14;
  }
  const manquent = blocs.length - poses;
  if (manquent > 0) {
    for (const ligne of couperEnLignes(contenu.zones.reste(manquent), w, mesureEn(c, "corps", 17))) {
      ecrire(c, ligne, x, y, "corps", 17, C.MUTED);
      y += 24;
    }
  }
}

/** Le bas de l'image : le crédit du fond de carte et sa licence, les adresses de la source et de la licence, celle du site. */
function pied(c: CanvasRenderingContext2D, contenu: ContenuCapture): void {
  const { marge, largeur, pied: p } = CAPTURE;
  const place = largeur - 2 * marge;
  const tCredit = ajuster(c, contenu.credit, "corps", 17, 12, place);
  ecrire(c, contenu.credit, marge, p.y + 30, "corps", tCredit, C.MUTED);
  c.font = police("mono", 17, true);
  const adresse = c.measureText(contenu.adresse).width;
  ecrire(c, contenu.adresse, largeur - marge, p.y + 58, "mono", 17, C.BLUE_TEXT, { gras: true, fin: true });
  const tSources = ajuster(c, contenu.sources, "mono", 15, 10, place - adresse - 32);
  ecrire(c, contenu.sources, marge, p.y + 58, "mono", tSources, C.MUTED);
}

/**
 * Dessine la capture et la rend en PNG. `logo` : l'adresse du logo de GAL ; `zones` : avec ou sans les zones sur la carte.
 * Le navigateur peut refuser un dessin aussi grand (vieux téléphone) : la promesse échoue alors, et la fenêtre le dit.
 */
export async function dessinerCapture(source: SourceCarte, contenu: ContenuCapture, logo: string): Promise<Blob> {
  const [image] = await Promise.all([chargerImage(logo), chargerPolices()]);
  const canvas = document.createElement("canvas");
  canvas.width = CAPTURE.largeur;
  canvas.height = CAPTURE.hauteur;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("dessin indisponible");

  c.fillStyle = C.NAVY;
  c.fillRect(0, 0, CAPTURE.largeur, CAPTURE.hauteur);
  entete(c, contenu, image);

  // La carte, dans son cadre.
  const k = CAPTURE.carte;
  const sortie = { width: k.w, height: k.h };
  c.save();
  cadre(c, k.x, k.y, k.w, k.h, 8);
  c.clip();
  c.translate(k.x, k.y);
  source.peindreCapture(c, contenu.vue, sortie, contenu.zones !== null);
  c.restore();
  if (contenu.zones) etiquettes(c, contenu.zones.entrees, contenu.vue, sortie);
  cadre(c, k.x + 0.5, k.y + 0.5, k.w - 1, k.h - 1, 8);
  c.lineWidth = 1;
  c.strokeStyle = C.LINE_STRONG;
  c.stroke();

  panneau(c, contenu);
  pied(c, contenu);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("image impossible à fabriquer"))), "image/png");
  });
}
