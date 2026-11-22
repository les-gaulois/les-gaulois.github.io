/**
 * Un mot en pixels du kit, dessiné à la construction du site, pour une page écrite sans script (l'accueil, 22 novembre 2026) :
 * les mêmes lettres et les mêmes couleurs que `motEnPixels` de `dans-la-page.ts`, qui dessine dans le navigateur. Le style
 * rendu se pose sur le `<i>` d'un `.jeu-px` (16-jeu.css) : `--i` au thème clair, `--i-sombre` au thème sombre, `--w` et
 * `--h` en cases. Ce fichier tourne sous Node seulement (sharp) : aucune page ne l'envoie au navigateur.
 */
import sharp from "sharp";
import { COULEURS_D_ECRITURE, type CouleurDEcriture, type ReliefDEcriture } from "./dans-la-page";
import { ecrire, enCapitales } from "./ecriture";
import type { Planche } from "./planche";

async function url(p: Planche): Promise<string> {
  const image = await sharp(Buffer.from(p.data.buffer, p.data.byteOffset, p.data.byteLength), { raw: { width: p.width, height: p.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return `url("data:image/png;base64,${image.toString("base64")}")`;
}

const faits = new Map<string, Promise<string>>();

/** Le style d'un mot en pixels (déjà en capitales ou non) : ses deux images et sa taille en cases. */
export function motAuBuild(texte: string, couleur: CouleurDEcriture, relief: ReliefDEcriture = "plat"): Promise<string> {
  const mot = enCapitales(texte);
  const cle = `${mot}|${couleur}|${relief}`;
  let fait = faits.get(cle);
  if (!fait) {
    fait = (async () => {
      const c = COULEURS_D_ECRITURE[couleur];
      const dessin = (coul: string): Planche => ecrire(mot, coul, relief === "ombre" ? "rgba(4,7,22,.75)" : null, relief === "cerne" ? "#070b1f" : null);
      const clair = dessin(typeof c === "string" ? c : c.clair);
      const sombre = typeof c === "string" ? clair : dessin(c.sombre);
      const urlClair = await url(clair);
      const urlSombre = sombre === clair ? urlClair : await url(sombre);
      return `--i:${urlClair};--i-sombre:${urlSombre};--w:${clair.width};--h:${clair.height}`;
    })();
    faits.set(cle, fait);
  }
  return fait;
}
