/**
 * L'image fixe d'un cadre, pour les cartes voisines du défilé du rayon « Cadres » (`src/components/village/Cadres.tsx`) : le cadre
 * à un instant choisi, autour de la bannière du membre ou du fond marine de la carte. Navigateur seulement.
 */
import { CARTE_H, CARTE_L, HAUTEUR_DU_CADRE, INSTANT_DU_CADRE_FIGE, LARGEUR_DU_CADRE, MARGE_DU_CADRE, peindreLeCadre, type CadreDeCarte } from "../fx/cadres-carte";

export function peindreLaVignetteDuCadre(toile: HTMLCanvasElement, id: CadreDeCarte, banniere: HTMLImageElement | null): void {
  const ctx = toile.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, LARGEUR_DU_CADRE, HAUTEUR_DU_CADRE);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#0a1230";
  ctx.fillRect(MARGE_DU_CADRE, MARGE_DU_CADRE, CARTE_L, CARTE_H);
  if (banniere && banniere.naturalWidth > 0 && banniere.naturalHeight > 0) {
    // La bannière couvre la carte, centrée, comme sur la carte elle-même.
    const large = Math.min(banniere.naturalWidth, (banniere.naturalHeight * CARTE_L) / CARTE_H);
    ctx.drawImage(banniere, (banniere.naturalWidth - large) / 2, 0, large, banniere.naturalHeight, MARGE_DU_CADRE, MARGE_DU_CADRE, CARTE_L, CARTE_H);
  }
  const tampon = document.createElement("canvas");
  tampon.width = LARGEUR_DU_CADRE;
  tampon.height = HAUTEUR_DU_CADRE;
  const encre = tampon.getContext("2d");
  if (!encre) return;
  const image = encre.createImageData(LARGEUR_DU_CADRE, HAUTEUR_DU_CADRE);
  peindreLeCadre(id, INSTANT_DU_CADRE_FIGE, image.data);
  encre.putImageData(image, 0, 0);
  ctx.drawImage(tampon, 0, 0);
}
