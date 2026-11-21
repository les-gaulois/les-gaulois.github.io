/**
 * Les pièces du kit en pixels de « Mon Gaulois » : les cadres en neuf parts (panneau, infobulle, tube des barres), les pleins
 * des barres, les boutons à trois états (repos, survol, enfoncé), les rubans, les étiquettes et le compteur des points. Ce
 * sont les dessins de la maquette validée par le pilote (planche de Claude Fable 5.2, 19-21 novembre 2026), recopiés tels
 * quels. Un cadre en neuf parts s'étire par ses bords droits seulement : ses coins restent nets à toute taille (`.jeu-n9`,
 * 16-jeu.css, `border-image`). Jamais de dégradé ni de bordure de site à la place : c'est la demande du pilote (« pas des
 * trucs Paint »). Voir « Le kit du jeu » dans docs/DESIGN.md.
 */
import { ecrire, largeurDuTexte, nombreEcrit } from "./ecriture";
import { PAL, TONS_DES_ETIQUETTES, type JetonsDesPieces, type TonDEtiquette } from "./palette";
import { Planche, R, ell, grille, rr } from "./planche";

/**
 * Le nom d'une pièce en neuf parts et ses quatre bords (haut, droite, bas, gauche), en cases : ce que la feuille de style
 * passe à `border-image-slice`. `theme` : la pièce change avec le thème du site.
 */
export interface PieceEnNeufParts {
  nom: string;
  bords: readonly [number, number, number, number];
  theme: boolean;
  dessin: (j: JetonsDesPieces) => Planche;
}

/** Le panneau des écrans : contour, biseau, double filet gravé, quatre losanges d'or. */
function panneau(j: JetonsDesPieces): Planche {
  const c = new Planche(32, 34);
  rr(c, 1, 3, 30, 31, 4, j.ombre);
  rr(c, 0, 0, 32, 32, 4, j.trait);
  rr(c, 2, 2, 28, 28, 2, j.ombrePiece);
  rr(c, 2, 2, 27, 27, 2, j.lumiere);
  rr(c, 3, 3, 26, 26, 1, j.face);
  R(c, 7, 7, 18, 1, j.creux);
  R(c, 7, 24, 18, 1, j.creux);
  R(c, 7, 7, 1, 18, j.creux);
  R(c, 24, 7, 1, 18, j.creux);
  R(c, 8, 25, 17, 1, j.lumiere);
  R(c, 25, 8, 1, 17, j.lumiere);
  const losange = grille(["..k..", ".kyk.", "kyYOk", ".kOk.", "..k.."], { k: j.trait, y: PAL.y, Y: PAL.Y, O: PAL.O });
  for (const [x, y] of [[5, 5], [22, 5], [5, 22], [22, 22]] as const) c.drawImage(losange, x, y);
  return c;
}

/** L'infobulle : un cartouche crème. */
function bulle(j: JetonsDesPieces): Planche {
  const c = new Planche(12, 14);
  rr(c, 1, 3, 10, 11, 2, j.ombre);
  rr(c, 0, 0, 12, 12, 2, PAL.k);
  rr(c, 1, 1, 10, 10, 1, "#d9cfae");
  rr(c, 1, 1, 10, 9, 1, "#fff7dc");
  return c;
}

/** Le tube des barres et des capsules : toujours sombre, le chiffre s'y lit en crème. */
function tube(): Planche {
  const c = new Planche(9, 13);
  rr(c, 0, 0, 9, 13, 2, PAL.k);
  rr(c, 1, 1, 7, 11, 1, "#101a4a");
  R(c, 2, 1, 5, 1, "#0a1136");
  R(c, 2, 11, 5, 1, "#1b2a6e");
  return c;
}

/** Le plein d'une barre : reflet en haut, ombre en bas, bout clair. */
function plein([a, b, d, e]: readonly [string, string, string, string]): Planche {
  const c = new Planche(4, 9);
  R(c, 0, 0, 4, 9, b);
  R(c, 0, 0, 4, 1, a);
  R(c, 0, 2, 3, 1, a);
  R(c, 0, 7, 4, 1, d);
  R(c, 0, 8, 4, 1, e);
  R(c, 3, 1, 1, 7, a);
  R(c, 0, 1, 1, 7, d);
  return c;
}

/** Un bouton : face, tranche, ombre ; enfoncé, la face descend sur sa tranche. */
function bouton([bord, clair, corps, bas, tranche]: readonly [string, string, string, string, string], etat: "repos" | "survol" | "enfonce", j: JetonsDesPieces): Planche {
  const c = new Planche(20, 20);
  const dy = etat === "enfonce" ? 2 : 0;
  if (etat !== "enfonce") rr(c, 1, 5, 18, 15, 2, j.ombre);
  rr(c, 0, 3, 20, 15, 2, bord);
  rr(c, 1, 4, 18, 13, 1, tranche);
  rr(c, 0, dy, 20, 15, 2, bord);
  rr(c, 1, 1 + dy, 18, 13, 1, corps);
  R(c, 2, 1 + dy, 16, 1, clair);
  R(c, 1, 2 + dy, 1, 2, clair);
  R(c, 2, 13 + dy, 16, 1, bas);
  R(c, 18, 11 + dy, 1, 2, bas);
  if (etat === "survol") {
    R(c, 3, 3, 2, 1, "#ffffff");
    R(c, 3, 4, 1, 1, "#ffffff");
    R(c, 15, 11, 2, 1, "#ffffff");
  }
  return c;
}

const BOUTONS = {
  or: { repos: [PAL.k, "#fff2a8", "#ffc61a", "#e09a12", "#9c5f0a"], survol: [PAL.k, "#fffbe6", "#ffd84a", "#f0b020", "#9c5f0a"], enfonce: [PAL.k, "#ffd84a", "#e8aa14", "#c8860e", "#9c5f0a"] },
  bleu: { repos: [PAL.k, "#7fa6ff", "#2f55d8", "#2343b4", "#12256e"], survol: [PAL.k, "#b9d4ff", "#3f6dff", "#2a50d0", "#12256e"], enfonce: [PAL.k, "#5f86e8", "#2647b8", "#1d3897", "#12256e"] },
} as const;

/** Un ruban : une bande, deux queues fendues, le pli dans l'ombre. */
function ruban([clair, corps, bas, queue, pli]: readonly [string, string, string, string, string]): Planche {
  const c = new Planche(30, 17);
  const dans = (x: number, y: number): boolean => y >= 4 && y <= 16 && x >= Math.max(0, 3 - Math.floor(Math.abs(y - 10) / 2)) && x <= 8;
  for (const miroir of [0, 1])
    for (let y = 0; y < 17; y++)
      for (let x = 0; x < 9; x++) {
        if (!dans(x, y)) continue;
        const bord = !dans(x - 1, y) || !dans(x, y - 1) || !dans(x, y + 1);
        R(c, miroir ? 29 - x : x, y, 1, 1, bord ? PAL.k : y >= 13 ? pli : queue);
      }
  R(c, 6, 0, 18, 13, PAL.k);
  R(c, 7, 1, 16, 11, corps);
  R(c, 7, 1, 16, 1, clair);
  R(c, 7, 10, 16, 2, bas);
  R(c, 7, 11, 16, 1, "#ffd84a");
  R(c, 6, 13, 3, 1, PAL.k);
  R(c, 21, 13, 3, 1, PAL.k);
  R(c, 7, 14, 2, 1, PAL.k);
  R(c, 21, 14, 2, 1, PAL.k);
  R(c, 8, 15, 1, 1, PAL.k);
  R(c, 21, 15, 1, 1, PAL.k);
  return c;
}

/**
 * Toutes les pièces en neuf parts du kit. La feuille de style les nomme `--jeu-s-<nom>` ; celles qui changent avec le thème
 * ont le même nom redéfini sous `:root[data-mode="sombre"]`. `src/pages/village/kit.css.ts` les écrit à la construction.
 */
export const PIECES_EN_NEUF_PARTS: readonly PieceEnNeufParts[] = [
  { nom: "panneau", bords: [12, 12, 14, 12], theme: true, dessin: panneau },
  // Le même cadre autour d'un fond de page : les écrans du jeu, où les parties d'avant gardent leurs couleurs.
  { nom: "ecran", bords: [12, 12, 14, 12], theme: true, dessin: (j) => panneau({ ...j, face: j.page }) },
  { nom: "bulle", bords: [4, 4, 6, 4], theme: true, dessin: bulle },
  { nom: "tube", bords: [3, 3, 3, 3], theme: false, dessin: tube },
  { nom: "plein-or", bords: [3, 1, 2, 1], theme: false, dessin: () => plein(["#fff2a8", "#ffc61a", "#d9981b", "#9c6a0c"]) },
  { nom: "plein-bleu", bords: [3, 1, 2, 1], theme: false, dessin: () => plein(["#b9d4ff", "#3f7dff", "#1a52d9", "#0b3398"]) },
  { nom: "plein-vert", bords: [3, 1, 2, 1], theme: false, dessin: () => plein(["#c9fbcf", "#3fce6a", "#1f9a4b", "#0f6a30"]) },
  { nom: "plein-violet", bords: [3, 1, 2, 1], theme: false, dessin: () => plein(["#e2d6ff", "#8b5cf6", "#6a3fe0", "#3f1fa8"]) },
  ...(["or", "bleu"] as const).flatMap((teinte) =>
    (["repos", "survol", "enfonce"] as const).map((etat) => ({ nom: `btn-${teinte}-${etat}`, bords: [4, 5, 8, 5] as const, theme: true, dessin: (j: JetonsDesPieces) => bouton(BOUTONS[teinte][etat], etat, j) })),
  ),
  { nom: "ruban", bords: [0, 10, 0, 10], theme: false, dessin: () => ruban(["#ff8a8f", "#e0263a", "#a8101f", "#c01a2c", "#6e0a15"]) },
  { nom: "ruban-bleu", bords: [0, 10, 0, 10], theme: false, dessin: () => ruban(["#9cc2ff", "#2f6bff", "#0b3fc4", "#0b3fc4", "#07257a"]) },
];

/** Les images simples (pas en neuf parts) du kit : la pointe de l'infobulle, les crans des barres. */
export const IMAGES_DU_KIT: Readonly<Record<string, () => Planche>> = {
  pointe: () => grille(["kwwwwwk", ".kwwwk.", "..kwk..", "...k..."], { k: PAL.k, w: "#fff7dc" }),
  crans: () => {
    const c = new Planche(10, 9);
    R(c, 9, 0, 1, 9, "rgba(4,7,22,.3)");
    return c;
  },
};

/** Une étiquette : un mot ou un nombre dans une pastille (« NOUVEAU », « 3 », « +90 »). */
export function etiquette(texte: string, ton: TonDEtiquette): Planche {
  const [clair, corps, bas, encre] = TONS_DES_ETIQUETTES[ton];
  const lt = largeurDuTexte(texte);
  const w = Math.max(11, lt + 6);
  const c = new Planche(w, 11);
  rr(c, 0, 0, w, 11, 3, PAL.k);
  rr(c, 1, 1, w - 2, 9, 2, corps);
  R(c, 3, 1, w - 6, 1, clair);
  R(c, 3, 9, w - 6, 1, bas);
  c.drawImage(ecrire(texte, encre, encre === "#231503" ? null : "rgba(4,7,22,.55)"), Math.floor((w - lt) / 2), 2);
  return c;
}

/** Le compteur des points : un rouleau par chiffre, sans maximum, donc sans barre. */
export function compteur(n: number): Planche {
  const t = nombreEcrit(n);
  let w = -1;
  for (const ch of t) w += ch === " " ? 3 : 10;
  const c = new Planche(Math.max(1, w), 13);
  let x = 0;
  for (const ch of t) {
    if (ch === " ") {
      x += 3;
      continue;
    }
    rr(c, x, 0, 9, 13, 2, PAL.k);
    rr(c, x + 1, 1, 7, 11, 1, "#16235e");
    R(c, x + 2, 1, 5, 2, "#0a1136");
    R(c, x + 2, 10, 5, 2, "#22347c");
    R(c, x + 1, 6, 7, 1, "#0d1744");
    c.drawImage(ecrire(ch, "#f6f1e3"), x + 2, 3);
    x += 10;
  }
  return c;
}

/** Les pions de la série : une flamme allumée ou éteinte. */
export function pionDeSerie(allume: boolean): Planche {
  return allume
    ? grille(["...f...", "..fEf..", "..fEEf.", ".fEeEf.", ".fEejEf", "fEejjEf", "fEejqEf", ".fEjEf.", "..fff.."], PAL)
    : grille(["...k...", "..kdk..", "..kddk.", ".kdddk.", ".kddddk", "kdddddk", "kdddddk", ".kdddk.", "..kkk.."], { k: PAL.k, d: "#3a4a8c" });
}

/** Une petite pièce d'or, sur 9 cases : le signe des prix. */
export function pieceMini(): Planche {
  const c = new Planche(9, 9);
  ell(c, 4.5, 4.5, 4.4, 4.4, PAL.k);
  ell(c, 4.5, 4.5, 3.4, 3.4, "#ffd84a");
  R(c, 3, 2, 2, 1, "#fffbe6");
  R(c, 5, 5, 2, 2, "#d9981b");
  return c;
}
