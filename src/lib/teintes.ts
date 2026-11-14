/**
 * Les pastilles de couleur des icônes en pixels : la palette 5, « Pastilles », choisie par le pilote le 14 novembre 2026
 * pour le guide du clan, puis pour les menus des parties du QG et de la Direction (« pareil, mets-moi ça en couleur »).
 * Chaque icône prend une couleur par son rang dans sa liste, du rouge au rose en descendant, et se pose sur une petite
 * case de la même couleur, pâle. Les couleurs sont les règles `[data-teinte]` de src/styles/global.css ; aucune n'est
 * verte, le vert restant la voix de la machine (tests/unit/pastilles.test.ts).
 */

/** Le nombre de couleurs : au-delà, elles recommencent. */
export const TEINTES = 11;

/** La couleur d'une icône, de 1 à TEINTES, par son rang dans sa liste (0 pour la première). */
export const teinteDuRang = (index: number): number => (((index % TEINTES) + TEINTES) % TEINTES) + 1;
