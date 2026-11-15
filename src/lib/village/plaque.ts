/**
 * La plaque dorée de la forge aux souvenirs, en pixels : en petit au coin d'un objet gravé (vestiaire, forge), en grand
 * dans la forge, sous le texte de la partie gravée. Dessins de Claude Fable 5.2 (14 novembre 2026), venus du dessin de la
 * forge du chantier, retiré avec le monde du village le 15 novembre 2026.
 */
import { type Decor, Planche } from "./decor";

const OR = { eclat: "#fff1a8", clair: "#ffe08a", fond: "#e2b23c", grave: "#a87a1c", sombre: "#8a6414", ombre: "#5f4410" };

function plaque(lignes: readonly string[]): Decor {
  const planche = new Planche(lignes[0]!.length, lignes.length);
  planche.lettres(0, 0, lignes, { e: OR.eclat, c: OR.clair, f: OR.fond, g: OR.grave, s: OR.sombre, o: OR.ombre });
  return planche.decor();
}

/** La plaque d'un objet gravé, en petit : à poser près de l'objet dans le vestiaire et la forge. Deux lignes gravées, un bord sombre. */
export const PLAQUE: Decor = plaque([".sssss.", "scccccs", "sfggggs", "sfffffs", "sfgggfs", ".ooooo."]);

/**
 * La même plaque en grand, sans texte, pour la forge : le texte s'écrit en HTML par-dessus, sur le champ uni (les cases
 * de 4 à 35 en largeur, de 3 à 12 en hauteur). Un bord sombre, un filet gravé, un rivet à chaque coin.
 */
export const PLAQUE_GRANDE: Decor = (() => {
  const largeur = 40;
  const hauteur = 16;
  const planche = new Planche(largeur, hauteur);
  planche.rect(0, 0, largeur, hauteur, (x, y) => {
    const bordX = Math.min(x, largeur - 1 - x);
    const bordY = Math.min(y, hauteur - 1 - y);
    if (bordX + bordY < 2) return null;
    if (bordX === 0 || bordY === 0) return y === hauteur - 1 || x === largeur - 1 ? OR.ombre : OR.sombre;
    if (bordX + bordY === 2) return OR.sombre;
    if (bordY === 1) return y === 1 ? OR.clair : OR.grave;
    if (bordX === 1) return x === 1 ? OR.clair : OR.grave;
    // Le filet gravé, à deux cases du bord.
    if ((bordY === 2 && bordX >= 5) || (bordX === 2 && bordY >= 5)) return OR.grave;
    // Un reflet en biais, discret, qui ne gêne pas le texte.
    if (bordX > 2 && bordY > 2 && (x + y * 2) % 23 < 2 && x < 16) return OR.clair;
    return OR.fond;
  });
  // Les rivets des coins.
  for (const [x, y] of [
    [3, 3],
    [largeur - 5, 3],
    [3, hauteur - 5],
    [largeur - 5, hauteur - 5],
  ] as const) {
    planche.poser(x, y, OR.eclat);
    planche.poser(x + 1, y, OR.grave);
    planche.poser(x, y + 1, OR.grave);
    planche.poser(x + 1, y + 1, OR.sombre);
  }
  return planche.decor();
})();
