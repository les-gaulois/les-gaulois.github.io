/**
 * La commande /feu (idée 2 du pilote, 14 novembre 2026 : « Le grand feu. […] La commande /feu le montre sur Discord ») : le
 * grand feu de la place du village, devant le décor de la place au moment de la journée à Paris, avec le logo du clan.
 *
 * Le feu vient du site : `/village/monde.json` (`src/pages/village/monde.json.ts`), l'état du monde que le site calcule à
 * chaque construction sur les sessions du clan (`src/lib/village/chantier.ts`). La fonction ne compte rien elle-même : elle
 * lit le niveau, les points et l'heure du relevé, et les montre. Le fichier est relu sans lui faire confiance (`parseMonde`).
 *
 * Rien d'inventé : sans fichier lisible, sans feu (pas de données, ou sessions de plus de 48 heures au moment du calcul), ou
 * avec un relevé de plus de 48 heures au moment de la commande (le site n'a pas été reconstruit depuis), /feu le dit au seul
 * joueur qui la tape, sans image. L'heure du relevé est toujours écrite sous l'image : rien n'est du temps réel.
 *
 * Le dessin : le décor de la place de /gaulois (`decors/`, 124 × 80 cases de 4 pixels) et le grand feu (`grand-feu.ts`, une
 * toile de 96 × 120 cases à l'échelle des Gaulois), à la plus grande taille de case entière qui tienne entre le haut de
 * l'image et le sol : le feu, plus haut qu'un Gaulois et demi, n'entre pas dans ce décor à 4 pixels par case. Il prend
 * donc des cases plus petites (2 pixels aujourd'hui), les pierres du foyer sur le sol, au milieu, là où /gaulois pose son
 * Gaulois. L'image 0 du feu : celle qui reste quand tout est figé.
 */
import { ecrirePng, type Image } from "./billets.ts";
import { HAUTEUR as DECOR_HAUTEUR, LARGEUR as DECOR_LARGEUR, PIEDS } from "./decors/commun.ts";
import { decorDe } from "./decors/index.ts";
import { imageDuGrandFeu } from "./grand-feu.ts";
import { LOGO_DU_CLAN } from "./logo-du-clan.ts";
import { momentDeParis, PHASES_EN_MOTS, type Moment } from "./scene.ts";

/** Le nom de la commande, que `definitions.ts` décrit. */
export const FEU_COMMAND = "feu";
/** L'état du monde que publie le site, depuis sa racine. */
export const MONDE_PATH = "/village/monde.json";
/** Le nom de l'image jointe à la réponse. */
export const FEU_FILE = "feu.png";

/** Le niveau du feu, de 0 (des braises) à 4 (un feu de joie). */
export type NiveauDuFeu = 0 | 1 | 2 | 3 | 4;

/** Le nom de chaque niveau, dans une phrase : copie de `NOMS_DU_FEU` (`src/lib/village/chantier-liste.ts`), gardée identique par un test. */
export const NOMS_DU_FEU: Readonly<Record<NiveauDuFeu, string>> = {
  0: "des braises",
  1: "un petit feu",
  2: "un beau feu",
  3: "un grand feu",
  4: "un feu de joie",
};

/** Au-delà de cet âge du relevé, le feu n'est plus montré : copie de `RELEVE_DU_FEU_MAX_MS` (`src/lib/village/chantier.ts`). */
export const RELEVE_DU_FEU_MAX_MS = 48 * 3_600_000;

/** Ce que /feu lit de l'état du monde. */
export interface FeuLu {
  niveau: NiveauDuFeu;
  points: number;
  jours: number;
}

export interface MondeLu {
  /** L'heure du dernier relevé des sessions (ISO), ou `null` si elle n'est pas connue. */
  releve: string | null;
  /** `null` : pas de données pour le feu. */
  feu: FeuLu | null;
}

const record = (value: unknown): Record<string, unknown> | null => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

/** L'état du monde publié par le site, relu sans lui faire confiance : `null` s'il n'a pas la forme attendue. */
export function parseMonde(value: unknown): MondeLu | null {
  const body = record(value);
  if (!body) return null;
  const releve = body["releve"];
  if (releve !== null && (typeof releve !== "string" || !Number.isFinite(Date.parse(releve)))) return null;
  const feu = body["feu"];
  if (feu === null) return { releve, feu: null };
  const lu = record(feu);
  const niveau = lu?.["niveau"];
  const points = lu?.["points"];
  const jours = lu?.["jours"];
  if (niveau !== 0 && niveau !== 1 && niveau !== 2 && niveau !== 3 && niveau !== 4) return null;
  if (typeof points !== "number" || !Number.isFinite(points) || points < 0) return null;
  if (typeof jours !== "number" || !Number.isInteger(jours) || jours < 1 || jours > 31) return null;
  // Un feu sans relevé ne se date pas : il n'est pas montré.
  return { releve, feu: releve === null ? null : { niveau, points, jours } };
}

/* ---------- Les mots ---------- */

const PARIS = "Europe/Paris";
const jourEtMois = new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, day: "numeric", month: "long" });
const heureMinute = new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, hour: "numeric", minute: "2-digit", hourCycle: "h23" });
const entier = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
/** L'espace fine des milliers, que les polices de Discord n'ont pas toutes, devient une espace insécable (`src/lib/nombre.ts`). */
const ESPACE_FINE = new RegExp(String.fromCharCode(0x202f), "g");
const ESPACE_INSECABLE = String.fromCharCode(0xa0);

/** « 14 novembre à 13 h 53 », à Paris, et « 1er » pour le premier du mois. */
export function releveEnMots(iso: string): string {
  const date = new Date(iso);
  return `${jourEtMois.format(date).replace(/^1 /, "1er ")} à ${heureMinute.format(date).replace(":", " h ")}`;
}

/** Les points rapportés, écrits arrondis vers le bas comme sur le site (`pointsAffiches`) : « 617 points rapportés ». */
export function pointsRapportes(points: number): string {
  const n = Math.max(0, Math.floor(points));
  return `${entier.format(n).replace(ESPACE_FINE, ESPACE_INSECABLE)} ${n >= 2 ? "points rapportés" : "point rapporté"}`;
}

/** La phrase du feu : « Un beau feu : 523 points rapportés au clan sur les 7 derniers jours, au relevé du 14 novembre à 13 h 53. » */
export function phraseDuFeu(feu: FeuLu, releve: string): string {
  const nom = NOMS_DU_FEU[feu.niveau];
  return `${nom.charAt(0).toUpperCase()}${nom.slice(1)} : ${pointsRapportes(feu.points)} au clan sur les ${feu.jours} derniers jours, au relevé du ${releveEnMots(releve)}.`;
}

/** Ce que /feu dit au seul joueur qui la tape, quand il n'y a pas de feu à montrer. */
export function sansFeu(releve: string | null, site: string): string {
  const dernier = releve ? ` Dernier relevé : le ${releveEnMots(releve)}.` : "";
  return `Pas de feu à montrer : le site n'a pas de relevé récent des parties du clan sur les 7 derniers jours.${dernier} Le village : <${site}/village>`;
}

/* ---------- Le dessin ---------- */

/** L'image : 496 × 320, comme celle de /gaulois, une case du décor faisant 4 pixels. */
export const IMAGE_DU_FEU = { largeur: DECOR_LARGEUR * 4, hauteur: DECOR_HAUTEUR * 4, echelle: 4 } as const;
/** Le sol, en pixels : le bas de la rangée où /gaulois pose les semelles de son Gaulois. */
const SOL = (PIEDS + 1) * IMAGE_DU_FEU.echelle;
/** Le haut le plus haut où monte le feu, en pixels. */
const HAUT = 8;
/** La place du logo, en haut à gauche, comme sur l'image de /gaulois. */
export const PLACE_DU_LOGO = { x: 8, y: 8, cote: LOGO_DU_CLAN.cote } as const;

const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

/** Le logo du clan, une fois décodé : ses pixels en RVBA. */
let logo: Uint8Array | null = null;
const pixelsDuLogo = (): Uint8Array => (logo ??= Uint8Array.from(atob(LOGO_DU_CLAN.rgba), (c) => c.charCodeAt(0)));

/** La taille d'une case du feu, en pixels : la plus grande entière qui le laisse tenir entre le haut de l'image et le sol. */
export function echelleDuFeu(largeur: number, hauteur: number): number {
  return Math.max(1, Math.min(IMAGE_DU_FEU.echelle, Math.floor((SOL - HAUT) / hauteur), Math.floor(IMAGE_DU_FEU.largeur / largeur)));
}

/** L'image de /feu : le décor de la place à ce moment, le grand feu au milieu sur son ombre, le logo en haut à gauche. */
export function imageDuFeu(niveau: NiveauDuFeu, moment: Moment): Image {
  const { largeur, hauteur, echelle } = IMAGE_DU_FEU;
  const rgba = new Uint8Array(new ArrayBuffer(largeur * hauteur * 4));
  const pixel = (x: number, y: number, [r, g, b]: [number, number, number]) => {
    if (x < 0 || y < 0 || x >= largeur || y >= hauteur) return;
    const i = (y * largeur + x) * 4;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = 255;
  };
  const carre = (x: number, y: number, cote: number, couleur: string) => {
    const teinte = rgb(couleur);
    for (let dy = 0; dy < cote; dy++) for (let dx = 0; dx < cote; dx++) pixel(x + dx, y + dy, teinte);
  };

  const decor = decorDe("place", moment);
  decor.cases.forEach((couleur, i) => carre((i % DECOR_LARGEUR) * echelle, Math.floor(i / DECOR_LARGEUR) * echelle, echelle, couleur));

  const feu = imageDuGrandFeu(niveau, 0);
  const cote = echelleDuFeu(feu.largeur, feu.hauteur);
  const gauche = Math.round((largeur - feu.largeur * cote) / 2);
  const haut = SOL - feu.hauteur * cote;
  // Son ombre au sol, une ellipse sous le foyer, dans la couleur d'ombre du décor, comme sous le Gaulois de /gaulois.
  const rayon = (feu.largeur * cote) / 2 / echelle - 2;
  for (let y = PIEDS - 3; y <= PIEDS + 3; y++) {
    for (let x = 0; x < DECOR_LARGEUR; x++) {
      if (((x + 0.5 - DECOR_LARGEUR / 2) / rayon) ** 2 + ((y + 0.5 - PIEDS - 0.5) / 2.9) ** 2 <= 1) carre(x * echelle, y * echelle, echelle, decor.ombre);
    }
  }
  feu.cases.forEach((couleur, i) => {
    if (couleur) carre(gauche + (i % feu.largeur) * cote, haut + Math.floor(i / feu.largeur) * cote, cote, couleur);
  });

  // Le logo, posé par-dessus en tenant compte de sa transparence.
  const pixels = pixelsDuLogo();
  const { x: lx, y: ly, cote: lc } = PLACE_DU_LOGO;
  for (let y = 0; y < lc; y++) {
    for (let x = 0; x < lc; x++) {
      const s = (y * lc + x) * 4;
      const a = (pixels[s + 3] ?? 0) / 255;
      if (a === 0) continue;
      const d = ((ly + y) * largeur + lx + x) * 4;
      for (let k = 0; k < 3; k++) rgba[d + k] = Math.round((pixels[s + k] ?? 0) * a + (rgba[d + k] ?? 0) * (1 - a));
    }
  }
  return { largeur, hauteur, rgba };
}

/** La description de l'image, pour qui ne la voit pas : le feu, ses points, son relevé, et le moment du décor. */
export const descriptionDuFeu = (feu: FeuLu, releve: string, moment: Moment): string =>
  `${phraseDuFeu(feu, releve)} Le grand feu au milieu de la place du village, ${PHASES_EN_MOTS[moment.phase]}.`.slice(0, 1024);

/* ---------- La réponse ---------- */

/** Les messages de Discord à composants (« Components V2 ») : l'image, puis le texte et le bouton. */
const COMPONENTS_V2 = 32768;

/** Ce que voit tout le salon après /feu : le feu en grand, la phrase en petit (l'heure du relevé est toujours écrite), un bouton vers le village. */
export function feuMessage(feu: FeuLu, releve: string, moment: Moment, site: string): Record<string, unknown> {
  const description = descriptionDuFeu(feu, releve, moment);
  return {
    flags: COMPONENTS_V2,
    components: [
      { type: 12, items: [{ media: { url: `attachment://${FEU_FILE}` }, description }] },
      { type: 10, content: `-# ${phraseDuFeu(feu, releve)}` },
      { type: 1, components: [{ type: 2, style: 5, label: "Voir le village", url: `${site}/village` }] },
    ],
    attachments: [{ id: 0, filename: FEU_FILE, description }],
    allowed_mentions: { parse: [] },
  };
}

/** La réponse à /feu : l'image et son message, ou une phrase au seul joueur qui la tape. `monde` : `null` si le site ne répond pas. */
export type ReponseDuFeu = { image: true; message: Record<string, unknown>; png: Uint8Array<ArrayBuffer> } | { image: false; texte: string };

/** `down` : la phrase quand le site ne répond pas, celle des autres commandes. */
export async function reponseDuFeu(monde: MondeLu | null, maintenant: Date, site: string, down: string): Promise<ReponseDuFeu> {
  if (!monde) return { image: false, texte: down };
  const { feu, releve } = monde;
  if (!feu || releve === null || maintenant.getTime() - Date.parse(releve) > RELEVE_DU_FEU_MAX_MS) return { image: false, texte: sansFeu(releve, site) };
  const moment = momentDeParis(maintenant);
  return { image: true, message: feuMessage(feu, releve, moment, site), png: await ecrirePng(imageDuFeu(feu.niveau, moment)) };
}
