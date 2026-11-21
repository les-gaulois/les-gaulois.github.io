/**
 * Les pièces en pixels du vestiaire du jeu « Mon Gaulois » (`/village#gaulois`, 21 novembre 2026, maquette validée par le
 * pilote, dessin de Claude Fable 5.2) : le cadre des cartes et des emplacements à la couleur de leur rareté, la trame qui
 * les fonce vers le bas, le cadre doré de la bannière, le socle où le Gaulois se tient, la lueur tramée derrière lui, le
 * viseur qui désigne l'emplacement ouvert et l'endroit où lâcher une carte, la coche de l'objet porté, l'éclat d'un essai
 * et le plateau où se posent les cartes. Tout est peint case par case avec les outils de la planche (`planche.ts`) : jamais
 * de dégradé ni de bordure de site (« pas des trucs Paint »). La feuille `18-jeu-vestiaire.css` les lit dans les variables
 * `--jeu-v-…` de `/village/kit.css` (`kit-css.ts`). Voir « Le kit du jeu » dans docs/DESIGN.md.
 */
import { PAL, JETONS_DES_PIECES } from "./palette";
import { Planche, R, cerne, ell, grille, melange, rr } from "./planche";

export type ThemeDuJeu = "clair" | "sombre";

/** Les raretés d'une carte ou d'un emplacement ; « aucune » : un objet gratuit, un emplacement vide. */
export const RARETES_DU_VESTIAIRE = ["aucune", "commun", "peu-commun", "epique", "mystique", "legendaire", "divin"] as const;
export type RareteDuVestiaire = (typeof RARETES_DU_VESTIAIRE)[number];

/** La trame ordonnée de la maquette : seize seuils, quatre cases sur quatre. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;
const seuil = (x: number, y: number): number => BAYER[(y & 3) * 4 + (x & 3)]!;

/**
 * Les tons d'une carte : le fond en haut, la couleur que la trame pose vers le bas, le liseré de lumière, le bord (côté
 * éclairé, côté dans l'ombre) et la tranche sous la carte.
 */
export interface TonsDeCarte {
  haut: string;
  bas: string;
  lisere: string;
  bord: string;
  bordOmbre: string;
  tranche: string;
}

/** La couleur de chaque rareté : celles des jetons `--rarete-…` du site ; « aucune » prend le gris-bleu des filets. */
const COULEURS: Readonly<Record<RareteDuVestiaire, string>> = {
  aucune: "#8a96b8",
  commun: "#4aa3ff",
  "peu-commun": "#3a4fe8",
  epique: "#9b4dff",
  mystique: "#ff2e4a",
  legendaire: "#f2b632",
  divin: "#19d3c5",
};

/** En clair, les fonds des cases du site et de la maquette : le haut presque blanc, le bas à la couleur de la rareté. */
const FONDS_CLAIRS: Readonly<Record<RareteDuVestiaire, readonly [string, string]>> = {
  aucune: ["#eef2fb", "#d5ddf0"],
  commun: ["#eef6ff", "#cfe6ff"],
  "peu-commun": ["#eceeff", "#c9cffb"],
  epique: ["#f4eaff", "#dcc6ff"],
  mystique: ["#ffecef", "#ffc4cc"],
  legendaire: ["#fff8dc", "#ffe59a"],
  divin: ["#e4fbf8", "#aef0ea"],
};

/**
 * Les tons d'une rareté dans un thème. En « Nuit Marine », le fond est le marine de la page teinté de la rareté, comme
 * les cases du site : le nom (blanc) et la rareté (jetons `--rarete-…-texte`) s'y lisent, ce que le test vérifie. Le
 * légendaire et le divin gardent un bord à deux tons, souvenir de leur cadre en dégradé du site.
 */
export function tonsDeCarte(rarete: RareteDuVestiaire, theme: ThemeDuJeu): TonsDeCarte {
  const bord = rarete === "aucune" && theme === "sombre" ? "#5469ae" : COULEURS[rarete];
  const marine = JETONS_DES_PIECES.sombre.page;
  const [haut, bas] = theme === "clair" ? FONDS_CLAIRS[rarete] : [melange(marine, bord, 0.26), melange(marine, bord, 0.46)];
  const deuxTons: Partial<Record<RareteDuVestiaire, readonly [string, string]>> = { legendaire: ["#ffe08a", "#c98a12"], divin: ["#19d3c5", "#7a5cff"] };
  const [clair, ombre] = deuxTons[rarete] ?? [bord, bord];
  return { haut, bas, lisere: theme === "clair" ? "#ffffff" : melange(haut, "#ffffff", 0.16), bord: clair, bordOmbre: ombre, tranche: melange(ombre, PAL.k, 0.24) };
}

/**
 * Le cadre d'une carte, en neuf parts (bords : 2 en haut et sur les côtés, 4 en bas) : un trait d'une case, les coins
 * taillés, un liseré de lumière en haut et à gauche, la tranche de trois cases dessous. Le centre reste vide : la feuille y
 * pose le fond et la trame, qui ne s'étirent pas.
 */
export function cadreDeCarte(t: TonsDeCarte): Planche {
  const c = new Planche(10, 11);
  // La tranche d'abord : la silhouette entière, que la face recouvre ensuite.
  rr(c, 0, 0, 10, 11, 2, t.tranche);
  rr(c, 0, 0, 10, 8, 2, t.bordOmbre);
  // Le côté éclairé du bord : le haut et la gauche.
  R(c, 2, 0, 6, 1, t.bord);
  R(c, 1, 1, 1, 1, t.bord);
  R(c, 0, 2, 1, 4, t.bord);
  // La face : le liseré en haut et à gauche, le fond à droite, la dernière rangée déjà au ton du bas ; dessous, le bord puis la tranche.
  R(c, 2, 1, 6, 1, t.lisere);
  R(c, 1, 2, 1, 4, t.lisere);
  R(c, 8, 2, 1, 4, t.haut);
  R(c, 2, 6, 6, 1, t.bas);
  c.clearRect(2, 2, 6, 4);
  return c;
}

/** Les bords du cadre d'une carte, en cases : haut, droite, bas, gauche. */
export const BORDS_DE_CARTE = [2, 2, 5, 2] as const;

/** La hauteur de la trame, en cases : elle se pose en bas du fond et se répète de côté. */
export const HAUTEUR_DE_TRAME = 28;

/** La trame d'une carte : de rien, en haut, à presque plein, en bas. Quatre cases de large, à répéter. */
export function trameDeCarte(t: TonsDeCarte): Planche {
  const c = new Planche(4, HAUTEUR_DE_TRAME);
  for (let y = 0; y < HAUTEUR_DE_TRAME; y++) {
    const part = ((y + 1) / HAUTEUR_DE_TRAME) * 15;
    for (let x = 0; x < 4; x++) if (seuil(x, y) < part) R(c, x, y, 1, 1, t.bas);
  }
  return c;
}

/** Le cadre doré de la bannière derrière le Gaulois, en neuf parts de trois cases : encre, or en biseau, encre. */
export function cadreDeBanniere(): Planche {
  const c = new Planche(9, 9);
  rr(c, 0, 0, 9, 9, 2, PAL.k);
  rr(c, 1, 1, 7, 7, 1, PAL.O);
  R(c, 2, 1, 5, 1, PAL.Y);
  R(c, 1, 2, 1, 5, PAL.y);
  R(c, 2, 7, 5, 1, PAL.o);
  R(c, 7, 2, 1, 5, PAL.O);
  R(c, 2, 2, 5, 5, PAL.k);
  c.clearRect(3, 3, 3, 3);
  return c;
}

/** Les bords du socle, en cases : il s'étire par son milieu seulement (haut, droite, bas, gauche). */
export const BORDS_DU_SOCLE = [0, 5, 0, 5] as const;

/**
 * Le socle : deux dalles de pierre bleue, la plus étroite dessus, où le Gaulois se tient. Le même dans les deux thèmes : son
 * trait d'encre le détache de la neige comme de la nuit.
 */
export function socle(): Planche {
  const c = new Planche(18, 10);
  // L'ombre portée, une case plus bas.
  rr(c, 1, 5, 16, 5, 1, "rgba(4,7,22,.32)");
  // La dalle du bas.
  rr(c, 0, 3, 18, 6, 1, PAL.k);
  R(c, 1, 4, 16, 4, "#3f4f96");
  R(c, 1, 4, 16, 1, "#6577bd");
  R(c, 1, 7, 16, 1, "#2c3a78");
  // La dalle du haut, deux cases en retrait.
  rr(c, 2, 0, 14, 5, 1, PAL.k);
  R(c, 3, 1, 12, 3, "#6577bd");
  R(c, 3, 1, 12, 1, "#9fb0e6");
  R(c, 3, 3, 12, 1, "#52639f");
  // Les coins usés : une case de lumière, une d'ombre.
  R(c, 3, 2, 1, 1, "#9fb0e6");
  R(c, 14, 2, 1, 1, "#3f4f96");
  return c;
}

/** Le losange d'or au milieu du socle : celui des coins des panneaux du jeu. */
export function losangeDuSocle(): Planche {
  return grille(["..k..", ".kyk.", "kyYOk", ".kOk.", "..k.."], { k: PAL.k, y: PAL.y, Y: PAL.Y, O: PAL.O });
}

/** Le bord de la lueur, en cases du Gaulois : la bande où elle s'efface, sur ses quatre côtés. */
export const BORD_DE_LA_LUEUR = 12;

/**
 * La lueur tramée derrière le Gaulois, en neuf parts : une clairière de la couleur de la page, pleine en son centre, qui
 * s'efface en trame sur son bord, avec quelques cases de bleu là où elle s'éteint. Elle calme la bannière du fond du jeu
 * derrière la scène : le Gaulois et les noms de ses emplacements s'en détachent. Ses bords et son centre se répètent sans
 * s'étirer (huit cases, deux fois la trame) : la trame reste nette à toute taille.
 */
export function lueur(theme: ThemeDuJeu): Planche {
  const b = BORD_DE_LA_LUEUR;
  const t = 2 * b + 8;
  const c = new Planche(t, t);
  const page = theme === "clair" ? "rgba(255,255,255,.9)" : "rgba(10,18,48,.86)";
  const bleu = theme === "clair" ? "rgba(120,160,255,.6)" : "rgba(120,160,255,.42)";
  for (let y = 0; y < t; y++)
    for (let x = 0; x < t; x++) {
      // La distance au centre plein, comptée en parts du bord : 0 au centre, 1 là où la lueur s'éteint.
      const dx = Math.max(0, b - x - 0.5, x + 0.5 - (t - b)) / b;
      const dy = Math.max(0, b - y - 0.5, y + 0.5 - (t - b)) / b;
      const d = Math.hypot(dx, dy);
      if (d >= 1) continue;
      const part = (1 - d * d) * 13;
      const s = seuil(x, y);
      if (s < part) R(c, x, y, 1, 1, page);
      else if (d > 0.35 && s < part + 2.5) R(c, x, y, 1, 1, bleu);
    }
  return c;
}

/**
 * Le viseur, en neuf parts de six cases : quatre équerres d'or cernées d'encre, rien entre elles. Il désigne l'emplacement
 * ouvert, celui que vise une carte tenue, et le Gaulois quand on peut y lâcher une carte. Or et encre : il se lit sur la
 * neige comme sur la nuit.
 */
export function viseur(): Planche {
  const c = new Planche(13, 13);
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    const x = dx ? 11 : 1;
    const y = dy ? 11 : 1;
    R(c, dx ? 8 : 1, y, 4, 1, PAL.y);
    R(c, x, dy ? 8 : 1, 1, 4, PAL.y);
    R(c, x, y, 1, 1, PAL.Y);
  }
  return cerne(c);
}

/** La coche de l'objet porté : un rond d'or cerné d'encre, une coche brune. Neuf cases. */
export function coche(): Planche {
  const c = new Planche(9, 9);
  ell(c, 4.5, 4.5, 4.5, 4.5, PAL.k);
  ell(c, 4.5, 4.5, 3.5, 3.5, PAL.y);
  R(c, 2, 1, 3, 1, PAL.Y);
  for (const [x, y] of [[6, 2], [6, 3], [5, 4], [2, 4], [4, 5], [3, 5], [3, 6]] as const) R(c, x, y, 1, 1, PAL.n);
  return c;
}

/** L'éclat d'un essai : une étoile à quatre branches au coin de l'emplacement dont la tenue n'est pas encore enregistrée. */
export function eclatDEssai(): Planche {
  return grille(["...k...", "..kyk..", ".kkykk.", "kyyYyyk", ".kkykk.", "..kyk..", "...k..."], { k: PAL.k, y: PAL.y, Y: PAL.Y });
}

/** Les bords du plateau, en cases : haut, droite, bas, gauche. */
export const BORDS_DU_PLATEAU = [3, 3, 5, 3] as const;

/**
 * Le plateau où se posent les cartes du rayon, en neuf parts : un trait fin, un filet de lumière en haut, un filet creux en
 * bas, une ombre de deux cases. Sa face laisse passer un peu de la bannière du fond du jeu, assez peu pour que tout texte
 * s'y lise comme sur la page.
 */
export function plateau(theme: ThemeDuJeu): Planche {
  const j = JETONS_DES_PIECES[theme];
  const c = new Planche(12, 14);
  rr(c, 1, 2, 10, 12, 2, j.ombre);
  rr(c, 0, 0, 12, 12, 2, j.trait);
  // La face se pose sur du vide, pas sur le trait : elle garde sa transparence.
  for (let y = 1; y < 11; y++) {
    const e = y === 1 || y === 10 ? 2 : 1;
    c.clearRect(e, y, 12 - 2 * e, 1);
    R(c, e, y, 12 - 2 * e, 1, theme === "clair" ? "rgba(255,255,255,.92)" : "rgba(10,18,48,.9)");
  }
  R(c, 2, 1, 8, 1, theme === "clair" ? "#ffffff" : j.lumiere);
  R(c, 2, 10, 8, 1, j.creux);
  return c;
}

/**
 * Une variable de `/village/kit.css` : son nom (`--jeu-v-<nom>`), si elle change avec le thème, et sa valeur, une image ou
 * une couleur écrite.
 */
export interface VariableDuVestiaire {
  nom: string;
  theme: boolean;
  valeur: (theme: ThemeDuJeu) => Planche | string;
}

/** Toutes les variables du vestiaire, dans l'ordre où `kit-css.ts` les écrit. */
export const VARIABLES_DU_VESTIAIRE: readonly VariableDuVestiaire[] = [
  ...RARETES_DU_VESTIAIRE.flatMap((rarete): VariableDuVestiaire[] => [
    { nom: `tuile-${rarete}`, theme: true, valeur: (theme) => cadreDeCarte(tonsDeCarte(rarete, theme)) },
    { nom: `trame-${rarete}`, theme: true, valeur: (theme) => trameDeCarte(tonsDeCarte(rarete, theme)) },
    { nom: `fond-${rarete}`, theme: true, valeur: (theme) => tonsDeCarte(rarete, theme).haut },
  ]),
  { nom: "cadre", theme: false, valeur: cadreDeBanniere },
  { nom: "socle", theme: false, valeur: socle },
  { nom: "losange", theme: false, valeur: losangeDuSocle },
  { nom: "lueur", theme: true, valeur: lueur },
  { nom: "viseur", theme: false, valeur: viseur },
  { nom: "coche", theme: false, valeur: coche },
  { nom: "eclat", theme: false, valeur: eclatDEssai },
  { nom: "plateau", theme: true, valeur: plateau },
];
