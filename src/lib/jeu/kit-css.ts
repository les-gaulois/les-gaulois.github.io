/**
 * Les images du kit en pixels, fabriquées à la construction du site : chaque pièce, icône, insigne et le logo deviennent un
 * petit PNG, posé dans une variable CSS de `/village/kit.css` (`src/pages/village/kit.css.ts`), que la feuille du jeu (16-jeu.css)
 * utilise. La page n'a donc rien à dessiner pour son cadre, et ces images restent en cache d'une visite à l'autre. Seuls les
 * mots et les nombres qui changent (menu, chiffres de « Ma carte », pastilles) sont dessinés dans la page
 * (`dans-la-page.ts`).
 *
 * Les pièces qui changent avec le thème ont leur version sombre, posée sous `:root[data-mode="sombre"]`. Ce fichier tourne
 * sous Node seulement (sharp) : la page ne l'importe pas.
 */
import sharp from "sharp";
import { GRANDES_ICONES, PETITES_ICONES, grandeIcone, petiteIcone } from "./icones";
import { logo } from "./logo";
import { JETONS_DES_PIECES } from "./palette";
import { PALIERS_DE_VICTOIRES, insigne } from "./paliers-de-victoires";
import { IMAGES_DU_KIT, PIECES_EN_NEUF_PARTS, pieceMini, pionDeSerie } from "./pieces";
import type { Planche } from "./planche";
import { VARIABLES_DU_CASINO } from "./casino-pieces";
import { VARIABLES_DU_VESTIAIRE } from "./vestiaire";

async function png(p: Planche): Promise<string> {
  const tampon = await sharp(Buffer.from(p.data.buffer, p.data.byteOffset, p.data.byteLength), { raw: { width: p.width, height: p.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return `url("data:image/png;base64,${tampon.toString("base64")}")`;
}

let fait: Promise<{ css: string; version: string }> | null = null;

/** La feuille des images du kit, et sa version (une empreinte de son contenu, pour l'adresse). Faite une fois par construction. */
export function feuilleDuKit(): Promise<{ css: string; version: string }> {
  fait ??= (async () => {
    const clair: string[] = [];
    const sombre: string[] = [];
    for (const piece of PIECES_EN_NEUF_PARTS) {
      clair.push(`--jeu-s-${piece.nom}:${await png(piece.dessin(JETONS_DES_PIECES.clair))}`);
      if (piece.theme) sombre.push(`--jeu-s-${piece.nom}:${await png(piece.dessin(JETONS_DES_PIECES.sombre))}`);
    }
    for (const [nom, dessin] of Object.entries(IMAGES_DU_KIT)) clair.push(`--jeu-i-${nom}:${await png(dessin())}`);
    clair.push(`--jeu-i-piece:${await png(pieceMini())}`);
    clair.push(`--jeu-i-pion-allume:${await png(pionDeSerie(true))}`);
    clair.push(`--jeu-i-pion-eteint:${await png(pionDeSerie(false))}`);
    for (const nom of GRANDES_ICONES) clair.push(`--jeu-ic-${nom}:${await png(grandeIcone(nom))}`);
    for (const nom of PETITES_ICONES) clair.push(`--jeu-pic-${nom}:${await png(petiteIcone(nom))}`);
    for (let rang = 0; rang < PALIERS_DE_VICTOIRES.length; rang++) clair.push(`--jeu-insigne-${rang}:${await png(insigne(rang))}`);
    for (const grand of [false, true]) {
      const l = logo(grand);
      const nom = grand ? "logo-grand" : "logo";
      clair.push(`--jeu-${nom}:${await png(l)}`, `--jeu-${nom}-w:${l.width}`, `--jeu-${nom}-h:${l.height}`);
    }
    // Les pièces du vestiaire (21 novembre 2026, `vestiaire.ts`) : des images, et les couleurs de fond de ses cartes.
    for (const piece of VARIABLES_DU_VESTIAIRE)
      for (const theme of ["clair", "sombre"] as const) {
        if (theme === "sombre" && !piece.theme) continue;
        const valeur = piece.valeur(theme);
        (theme === "clair" ? clair : sombre).push(`--jeu-v-${piece.nom}:${typeof valeur === "string" ? valeur : await png(valeur)}`);
      }
    // Le casino (22 novembre 2026, `casino-pieces.ts`) : les pièces du palais, des tables, ses icônes et celle du menu.
    for (const piece of VARIABLES_DU_CASINO)
      for (const theme of ["clair", "sombre"] as const) {
        if (theme === "sombre" && !piece.theme) continue;
        (theme === "clair" ? clair : sombre).push(`${piece.nom}:${await png(piece.valeur(theme))}`);
      }
    const css = `/* Les images du kit en pixels de « Mon Gaulois » (src/lib/jeu/kit-css.ts), fabriquées à la construction. */\n:root{${clair.join(";")}}\n:root[data-mode="sombre"]{${sombre.join(";")}}\n`;
    let empreinte = 0;
    for (let i = 0; i < css.length; i++) empreinte = (Math.imul(empreinte, 31) + css.charCodeAt(i)) | 0;
    return { css, version: (empreinte >>> 0).toString(36) };
  })();
  return fait;
}
