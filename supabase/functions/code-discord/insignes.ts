/**
 * Les insignes de l'image de /gaulois : ce qui se pose près du logo du clan, à gauche du Gaulois, pour un membre au pseudo
 * public (demande du pilote, 15 novembre 2026).
 * - L'emblème de niveau de son compte OpenFront, « tout le jeu », à part des stats du clan : un médaillon rond de 13 cases,
 *   dix crans sur son bord, un allumé par prestige, une case hexagonale au milieu et le niveau en chiffres dedans. C'est
 *   l'emblème du site (`src/components/NiveauEmblem.tsx`) redessiné en cases, pas son tracé.
 * - La flamme de série, dès 5 victoires d'affilée sous le tag, et le nombre de ces victoires dessous ; dorée, avec une
 *   petite couronne à côté du nombre, quand la série bat un ancien record qui avait eu sa flamme.
 * - Une petite police de chiffres, trois points sur cinq, pour ces deux nombres.
 *
 * Tout est donné en rectangles de pixels dans l'image de 496 × 320 (`IMAGE_GAULOIS` de `gaulois.ts`) : les cases font
 * 4 pixels comme celles du décor, les chiffres et le liseré sombre sont plus fins. Rien n'est lu ni calculé ici : ni
 * réseau, ni heure, ni hasard. La fonction ne lit que son dossier : rien ne vient de `src/`.
 *
 * Couleurs des prestiges (`COULEURS_DES_PRESTIGES`, `COULEUR_DE_LA_LEGENDE`, `COULEURS_DU_PRISME`) : copie de
 * `PRESTIGE_COLORS`, `LEGEND_COLOR` et `PRISM_COLORS` de `src/lib/niveau.ts`, gardée identique par un test. Valeurs reprises
 * d'OpenFront (https://github.com/openfrontio/OpenFrontIO), © OpenFront and Contributors, AGPL-3.0 : `TIER_COLORS` et
 * `LEGEND_COLOR` de src/client/Progression.ts, `PRISM` de src/client/components/LevelBadge.ts, commit 2f0252d du
 * 13 novembre 2026. Modifiées le 13 novembre 2026 : seules les couleurs sont gardées, rangées par prestige ; recopiées ici
 * le 15 novembre 2026. Voir NOTICE.md.
 *
 * Les dessins (médaillon, chiffres, étoile, couronne) sont faits case par case pour le clan [GAL], sans emprunt à une œuvre
 * existante. Design : Claude Fable 5.2, 15 novembre 2026.
 */

/** Un rectangle plein, en pixels de l'image. */
export interface Rectangle {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
  couleur: string;
}

/** Le niveau d'un compte, comme le site le lit (`AccountLevel` de `src/lib/schemas.ts`). */
export interface NiveauDuCompte {
  level: number;
  prestige: number;
  legend: boolean;
}

/** La série en cours d'un membre : le nombre de victoires d'affilée, et si elle bat un ancien record qui avait eu sa flamme. */
export interface SerieEnCours {
  victoires: number;
  doree: boolean;
}

/** Une case du décor et du Gaulois, en pixels. */
export const CASE = 4;

/* ---------- Les couleurs des prestiges, copie de src/lib/niveau.ts, gardée identique par un test ---------- */

export const CRANS = 10;
/** Index 0 : pas encore de prestige. Puis du prestige 1 au prestige 10. */
export const COULEURS_DES_PRESTIGES = [
  "#64748b",
  "#6b7280",
  "#c27c3e",
  "#c3cbd6",
  "#f2c230",
  "#9fe3dc",
  "#2fd28f",
  "#a5e7ff",
  "#c48cff",
  "#ff6b81",
  "#f472b6",
] as const;
export const COULEUR_DE_LA_LEGENDE = "#facc15";
export const COULEURS_DU_PRISME = [
  "#ff5fa8",
  "#ffa53b",
  "#ffe45c",
  "#47e0a0",
  "#46b4ff",
  "#a46bff",
] as const;

/** Les crans allumés : un par prestige, tous pour une Légende (`prestigeLit` de niveau.ts). */
export function cransAllumes(compte: NiveauDuCompte): number {
  return compte.legend
    ? CRANS
    : Math.min(CRANS, Math.max(0, Math.trunc(compte.prestige) || 0));
}

/** La couleur de chaque cran allumé, du haut dans le sens des aiguilles d'une montre (`segmentColors` de niveau.ts). */
export function couleursDesCrans(compte: NiveauDuCompte): string[] {
  const allumes = cransAllumes(compte);
  const prisme = !compte.legend && compte.prestige >= CRANS;
  const unie = compte.legend
    ? COULEUR_DE_LA_LEGENDE
    : (COULEURS_DES_PRESTIGES[allumes] ?? COULEURS_DES_PRESTIGES[0]);
  return Array.from({ length: allumes }, (_, i) =>
    prisme
      ? (COULEURS_DU_PRISME[
          Math.floor((i * COULEURS_DU_PRISME.length) / CRANS)
        ] ?? COULEURS_DU_PRISME[0])
      : unie,
  );
}

/* ---------- L'emblème de niveau ---------- */

/**
 * Le médaillon, 13 cases sur 13. « 0 » à « 9 » : les dix crans, du haut dans le sens des aiguilles d'une montre (trois
 * cases, puis deux, en alternance), séparés par une case de fond. « n » : le fond du médaillon. « x » : la case hexagonale,
 * pointe en haut, où s'écrit le niveau. « . » : rien, le décor reste.
 */
export const EMBLEME_LIGNES = [
  "....99n00....",
  "..n9nnnnn0n..",
  ".8nnnxxxnnn1.",
  ".8nxxxxxxxn1.",
  "nnxxxxxxxxxnn",
  "7nxxxxxxxxxn2",
  "7nxxxxxxxxxn2",
  "7nxxxxxxxxxn2",
  "nnxxxxxxxxxnn",
  ".6nxxxxxxxn3.",
  ".6nnnxxxnnn3.",
  "..n5nnnnn4n..",
  "....55n44....",
] as const;
/** Le côté du médaillon : 13 cases, 52 pixels ; 56 avec son liseré. */
export const EMBLEME_COTE = EMBLEME_LIGNES.length;

/** Le marine du site pour le fond, un bleu plus clair pour la case, un cran éteint presque fondu, le liseré, l'écriture. */
export const EMBLEME_COULEURS = {
  fond: "#0a1230",
  hexagone: "#1f3070",
  eteint: "#35447a",
  lisere: "#050a1c",
  chiffre: "#f4f7ff",
} as const;

/** Le liseré sombre autour d'un insigne, en pixels : il le tient sur un ciel clair comme sur un mur de planches. */
export const LISERE = 2;

/* ---------- La flamme de série : copie de src/lib/flamme-serie.ts, gardée identique par un test ---------- */

/** Du bord au cœur : le contour, la braise, l'orange, le jaune, le cœur. */
export const FEU = {
  contour: "#4a1206",
  braise: "#d92d0f",
  orange: "#f5760f",
  jaune: "#ffc61a",
  coeur: "#fff1a8",
} as const;

/** L'or du record personnel, du bord au cœur : le contour, le vieil or, l'or, l'or clair, l'éclat. */
export const OR = {
  contour: "#3a2606",
  vieilOr: "#9c6a0c",
  or: "#d9a21b",
  clair: "#ffd84a",
  eclat: "#fffbe6",
} as const;

/** La flamme : 11 cases de large, 15 de haut. « o » le contour, « r » la braise, « e » l'orange, « j » le jaune, « c » le cœur. */
export const FLAMME_LIGNES = [
  "....o......",
  "...oro.....",
  "...orro....",
  "...orero...",
  "..oreero.o.",
  "..oreeeroro",
  ".oreejeerro",
  ".orejjeeero",
  "oreejjjeero",
  "orejjcjjero",
  "orejccjjero",
  "orejcccjero",
  ".orejcjero.",
  "..orrrrro..",
  "...ooooo...",
] as const;

/** Les couleurs de la flamme, par lettre : le feu, ou l'or du record. */
export const couleursDeLaFlamme = (
  doree: boolean,
): Readonly<Record<string, string>> =>
  doree
    ? { o: OR.contour, r: OR.vieilOr, e: OR.or, j: OR.clair, c: OR.eclat }
    : {
        o: FEU.contour,
        r: FEU.braise,
        e: FEU.orange,
        j: FEU.jaune,
        c: FEU.coeur,
      };

/* ---------- La petite police : trois points sur cinq ---------- */

/** Les chiffres, rangée par rangée (« # » : un point plein). Dessinés pour ces insignes ; un point fait 3 pixels, ou 2 s'il faut serrer. */
export const PETITS_CHIFFRES: Readonly<Record<string, readonly string[]>> = {
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", ".##", "..#", "###"],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"],
  "7": ["###", "..#", ".#.", ".#.", ".#."],
  "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"],
};
/** L'étoile de la Légende, à la place du niveau : sept points sur sept. */
export const ETOILE = [
  "...#...",
  "...#...",
  "#######",
  ".#####.",
  "..###..",
  ".##.##.",
  ".#...#.",
] as const;
/** La couronne du record, à droite du nombre de la flamme dorée : cinq points de large, trois de haut, au milieu de la hauteur des chiffres. */
export const COURONNE = [".....", "#.#.#", "#####", "#####", "....."] as const;

/** Un signe à écrire : un chiffre, ou la couronne du record (« ^ »). Un signe inconnu ne s'écrit pas. */
const signe = (c: string): readonly string[] | null =>
  c === "^" ? COURONNE : (PETITS_CHIFFRES[c] ?? null);

/** La largeur d'un texte en pixels : ses signes, et un point vide entre deux. */
export function largeurDuTexte(texte: string, point: number): number {
  const signes = [...texte].map(signe).filter((s) => s !== null);
  return (
    signes.reduce((somme, s) => somme + (s[0]?.length ?? 0) * point, 0) +
    Math.max(0, signes.length - 1) * point
  );
}

/** Une grille de points posée à (x, y), « # » plein : ses rectangles, un par point. */
export function rectanglesDeLaGrille(
  lignes: readonly string[],
  x: number,
  y: number,
  point: number,
  couleur: string,
): Rectangle[] {
  const rectangles: Rectangle[] = [];
  lignes.forEach((ligne, dy) => {
    for (let dx = 0; dx < ligne.length; dx++) {
      if (ligne[dx] === "#")
        rectangles.push({
          x: x + dx * point,
          y: y + dy * point,
          largeur: point,
          hauteur: point,
          couleur,
        });
    }
  });
  return rectangles;
}

/** Un texte de chiffres (et « ^ ») dont le coin haut gauche est à (x, y). */
export function rectanglesDuTexte(
  texte: string,
  x: number,
  y: number,
  point: number,
  couleur: string,
): Rectangle[] {
  const rectangles: Rectangle[] = [];
  let cx = x;
  for (const c of texte) {
    const lignes = signe(c);
    if (!lignes) continue;
    rectangles.push(...rectanglesDeLaGrille(lignes, cx, y, point, couleur));
    cx += ((lignes[0]?.length ?? 0) + 1) * point;
  }
  return rectangles;
}

/** Le liseré d'un dessin : chaque rectangle élargi de `epaisseur` pixels, dans la couleur donnée. À peindre avant le dessin. */
export const lisereDe = (
  rectangles: readonly Rectangle[],
  epaisseur: number,
  couleur: string,
): Rectangle[] =>
  rectangles.map((r) => ({
    x: r.x - epaisseur,
    y: r.y - epaisseur,
    largeur: r.largeur + 2 * epaisseur,
    hauteur: r.hauteur + 2 * epaisseur,
    couleur,
  }));

/** Une grille de lettres en cases de 4 pixels : « . » laisse le décor, chaque autre lettre prend sa couleur. */
function rectanglesDesCases(
  lignes: readonly string[],
  x: number,
  y: number,
  couleurs: Readonly<Record<string, string>>,
): Rectangle[] {
  const rectangles: Rectangle[] = [];
  lignes.forEach((ligne, dy) => {
    for (let dx = 0; dx < ligne.length; dx++) {
      const couleur = couleurs[ligne[dx] ?? "."];
      if (couleur)
        rectangles.push({
          x: x + dx * CASE,
          y: y + dy * CASE,
          largeur: CASE,
          hauteur: CASE,
          couleur,
        });
    }
  });
  return rectangles;
}

/** Le niveau à écrire dans l'emblème : de 1 à 100. `null` pour une Légende (l'étoile) ou un niveau illisible (la case reste vide). */
export function niveauAEcrire(compte: NiveauDuCompte): string | null {
  if (
    compte.legend ||
    !Number.isInteger(compte.level) ||
    compte.level < 1 ||
    compte.level > 100
  )
    return null;
  return String(compte.level);
}

/**
 * L'emblème dont le coin haut gauche du médaillon est à (x, y), en pixels : le liseré, le médaillon et ses crans, puis le
 * niveau au milieu de la case hexagonale (points de 3 pixels), ou l'étoile de la Légende, dans son or.
 */
export function rectanglesDeLEmbleme(
  compte: NiveauDuCompte,
  x: number,
  y: number,
): Rectangle[] {
  const allumes = couleursDesCrans(compte);
  const couleurs: Record<string, string> = {
    n: EMBLEME_COULEURS.fond,
    x: EMBLEME_COULEURS.hexagone,
  };
  for (let i = 0; i < CRANS; i++)
    couleurs[String(i)] = allumes[i] ?? EMBLEME_COULEURS.eteint;
  const medaillon = rectanglesDesCases(EMBLEME_LIGNES, x, y, couleurs);
  // Le milieu de la case hexagonale : la septième case du médaillon, en large comme en haut.
  const milieu = (EMBLEME_COTE * CASE) / 2;
  const niveau = niveauAEcrire(compte);
  const point = 3;
  const dedans = compte.legend
    ? rectanglesDeLaGrille(
        ETOILE,
        x + milieu - Math.floor((7 * point) / 2),
        y + milieu - Math.ceil((7 * point) / 2),
        point,
        COULEUR_DE_LA_LEGENDE,
      )
    : niveau
      ? rectanglesDuTexte(
          niveau,
          x + milieu - Math.floor(largeurDuTexte(niveau, point) / 2),
          y + milieu - Math.ceil((5 * point) / 2),
          point,
          EMBLEME_COULEURS.chiffre,
        )
      : [];
  return [
    ...lisereDe(medaillon, LISERE, EMBLEME_COULEURS.lisere),
    ...medaillon,
    ...dedans,
  ];
}

/** Le nombre sous la flamme : les victoires d'affilée, suivies de la couronne du record (« ^ ») si la flamme est dorée. */
export const texteDeLaSerie = (serie: SerieEnCours): string =>
  `${Math.max(0, Math.trunc(serie.victoires) || 0)}${serie.doree ? "^" : ""}`;

/** La largeur de la flamme, en pixels, et ce qui sépare son pied du haut des chiffres : 2 pixels de décor, puis le liseré. */
const FLAMME_LARGEUR = FLAMME_LIGNES[0].length * CASE;
const SOUS_LA_FLAMME = 4;

/**
 * La flamme dont le coin haut gauche est à (x, y), en pixels, et son nombre centré dessous, détaché d'elle pour ne pas
 * lui faire un manche : clair comme le cœur de la flamme, cerné du liseré sombre. Points de 3 pixels ; de 2 si le nombre
 * dépasse la largeur de la flamme (trois chiffres et la couronne).
 */
export function rectanglesDeLaFlamme(
  serie: SerieEnCours,
  x: number,
  y: number,
): Rectangle[] {
  const palette = couleursDeLaFlamme(serie.doree);
  const flamme = rectanglesDesCases(FLAMME_LIGNES, x, y, palette);
  const texte = texteDeLaSerie(serie);
  const point = largeurDuTexte(texte, 3) <= FLAMME_LARGEUR ? 3 : 2;
  const nombre = rectanglesDuTexte(
    texte,
    x + Math.floor((FLAMME_LARGEUR - largeurDuTexte(texte, point)) / 2),
    y + FLAMME_LIGNES.length * CASE + SOUS_LA_FLAMME,
    point,
    palette.c ?? FEU.coeur,
  );
  return [
    ...flamme,
    ...lisereDe(nombre, LISERE, EMBLEME_COULEURS.lisere),
    ...nombre,
  ];
}

/* ---------- Leur place dans l'image de 496 × 320 ---------- */

/**
 * Les places, à droite du logo du clan (qui finit au pixel 69), dans la bande que les cinq décors laissent libre aux
 * quatre moments et où aucune coiffe du Gaulois ne monte. La flamme : au pixel 74, tout en haut de l'image ; son nombre
 * finit au pixel 80. Le médaillon : à la case 19 s'il est seul, à la case 31 à côté de la flamme, depuis la rangée 2.
 */
export const PLACES_DES_INSIGNES = {
  flamme: 74,
  premiere: 19 * CASE,
  seconde: 31 * CASE,
  hautDeLaFlamme: 0,
  hautDeLEmbleme: 2 * CASE,
} as const;

/**
 * Les insignes d'une image de /gaulois, dans l'ordre où les peindre, après le décor et avant l'ombre et le Gaulois, qui
 * passent devant. Rien à poser : une liste vide, et l'image reste celle d'avant au pixel près. Un seul insigne prend la
 * première place ; avec les deux, la flamme d'abord, puis l'emblème.
 */
export function insignesDeLaScene(insignes: {
  niveau?: NiveauDuCompte | null;
  serie?: SerieEnCours | null;
}): Rectangle[] {
  const { flamme, premiere, seconde, hautDeLaFlamme, hautDeLEmbleme } =
    PLACES_DES_INSIGNES;
  const rectangles: Rectangle[] = [];
  if (insignes.serie)
    rectangles.push(
      ...rectanglesDeLaFlamme(insignes.serie, flamme, hautDeLaFlamme),
    );
  if (insignes.niveau)
    rectangles.push(
      ...rectanglesDeLEmbleme(
        insignes.niveau,
        insignes.serie ? seconde : premiere,
        hautDeLEmbleme,
      ),
    );
  return rectangles;
}

/** Peint des rectangles opaques dans une image RVBA, dans l'ordre donné ; ce qui sort de l'image est coupé. */
export function peindreLesRectangles(
  image: { largeur: number; hauteur: number; rgba: Uint8Array },
  rectangles: readonly Rectangle[],
): void {
  for (const r of rectangles) {
    const rouge = parseInt(r.couleur.slice(1, 3), 16);
    const vert = parseInt(r.couleur.slice(3, 5), 16);
    const bleu = parseInt(r.couleur.slice(5, 7), 16);
    for (
      let y = Math.max(0, r.y);
      y < Math.min(image.hauteur, r.y + r.hauteur);
      y++
    ) {
      for (
        let x = Math.max(0, r.x);
        x < Math.min(image.largeur, r.x + r.largeur);
        x++
      ) {
        const i = (y * image.largeur + x) * 4;
        image.rgba[i] = rouge;
        image.rgba[i + 1] = vert;
        image.rgba[i + 2] = bleu;
        image.rgba[i + 3] = 255;
      }
    }
  }
}
