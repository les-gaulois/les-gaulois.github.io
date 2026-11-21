/**
 * La feuille de style du site, en morceaux (`src/styles/feuilles/`), et ceux que charge chaque page. Voir docs/DESIGN.md,
 * « Les feuilles de style, en morceaux ».
 *
 * Jusqu'au 14 novembre 2026, une seule feuille de 18 000 lignes partait vers toutes les pages, Direction, QG, Carte, guide
 * et village compris. Elle est coupée en tranches contiguës, sans qu'une règle ne change ni ne change de place : la liste
 * ci-dessous est l'ordre d'origine, donc l'ordre de la cascade. Base.astro écrit, pour chaque page, un `<link>` par morceau
 * qu'elle charge, dans cet ordre : une page voit les mêmes règles qu'avant, dans le même ordre, moins celles qui ne peuvent
 * pas la toucher. Les morceaux de toutes les pages restent en cache d'une page à l'autre.
 *
 * Une page absente de toutes les listes ne charge que les morceaux de toutes les pages. tests/unit/feuilles.test.ts vérifie
 * qu'aucune règle d'un morceau qu'une page ne charge pas ne peut toucher ce qu'elle affiche, connexion comprise.
 */

/** Toutes les pages. */
const TOUTES = "toutes";

/**
 * Les morceaux, dans l'ordre de la cascade, et les pages qui les chargent (le motif de la route, comme `Astro.routePattern`).
 * La Direction charge tout : elle montre aussi, en aperçu, les écrans des autres pages.
 */
export const FEUILLES: readonly { fichier: string; pages: typeof TOUTES | readonly string[] }[] = [
  // Tailwind, les jetons, les composants communs, les écrans du compte, l'ambiance console et le logo du guerrier.
  { fichier: "01-socle.css", pages: TOUTES },
  // Les pièces communes des onglets (pastilles, filtres, tableaux) : la Direction et le QG.
  { fichier: "02-onglets-kit.css", pages: ["/direction", "/qg"] },
  // Les onglets de la Direction, son menu déroulant et ses messages Discord.
  { fichier: "03-direction.css", pages: ["/direction"] },
  // Le poste de commandement et l'onciale de cases.
  { fichier: "04-poste.css", pages: TOUTES },
  { fichier: "05-guide.css", pages: ["/debuter", "/direction"] },
  // La carte en console.
  { fichier: "06-carte.css", pages: ["/carte", "/direction"] },
  // « Plus calme », le second lot des remarques du 12 novembre 2026.
  { fichier: "07-calme.css", pages: TOUTES },
  { fichier: "08-alliance.css", pages: ["/carte", "/direction"] },
  // « Mon Gaulois » (/village) : les onglets, le vestiaire, la bourse, la boutique et le marché (la boutique est un onglet de
  // /village depuis le 15 novembre 2026 : /boutique ne fait plus qu'y renvoyer).
  // « Mon compte » montre le vestiaire à l'inscription (ParcoursArrivee.tsx, 15 novembre 2026).
  { fichier: "09-village.css", pages: ["/compte", "/village", "/direction"] },
  // Le classement en colonne et les fenêtres de la Carte.
  { fichier: "10-carte-colonne.css", pages: ["/carte", "/direction"] },
  // L'onglet Comptes de la Direction.
  { fichier: "11-comptes.css", pages: ["/direction"] },
  { fichier: "12-qg.css", pages: ["/qg", "/direction"] },
  // Le Gaulois compagnon, sur toutes les pages.
  { fichier: "13-compagnon.css", pages: TOUTES },
  // La forge de « Mon Gaulois » ; le monde du village, qui partageait ce morceau, est retiré depuis le 15 novembre 2026.
  // « Mon compte » aussi : le vestiaire de l'inscription montre les plaques de la forge.
  { fichier: "14-forge.css", pages: ["/compte", "/village", "/direction"] },
  // Le lecteur des films de parties, « Revoir une partie » (15 novembre 2026).
  { fichier: "15-revoir.css", pages: ["/revoir", "/utiles", "/direction"] },
  // « Mon Gaulois » en écran de jeu (21 novembre 2026) : le kit en pixels (cadres, boutons, rubans, barres, icônes) et le
  // cadre de jeu plein écran de /village (barre du jeu, menu, « Ma carte »). Ses images viennent de /village/kit.css.
  { fichier: "16-jeu.css", pages: ["/village", "/direction"] },
  // « Les boosters » de « Mon Gaulois » (21 novembre 2026) : leur écran habillé du kit et l'animation d'ouverture validée
  // par le pilote (SceneDuBooster.ts).
  { fichier: "17-jeu-boosters.css", pages: ["/village", "/direction"] },
  // Le vestiaire du jeu « Mon Gaulois » (21 novembre 2026) : le Gaulois et ses emplacements, ses cartes qu'on lâche sur lui.
  { fichier: "18-jeu-vestiaire.css", pages: ["/village", "/direction"] },
  // « La boutique » de « Mon Gaulois » habillée en écran de jeu (21 novembre 2026) : la sélection de la semaine, les onglets
  // des rayons, les filtres, l'essayage et le marché en images, tout sous `.boutique-jeu`.
  { fichier: "19-jeu-boutique.css", pages: ["/village", "/direction"] },
  // « Le pass » et « La forge » de « Mon Gaulois » habillés en écran de jeu (21 novembre 2026) : la saison et sa récompense,
  // la route des paliers, les missions, la présence, le défi, l'étal ; la fusion et la gravure. Tout sous `.pass-jeu` et
  // `.forge-jeu`.
  { fichier: "20-jeu-pass-forge.css", pages: ["/village", "/direction"] },
  // « La vitrine » et « La loterie » de « Mon Gaulois » en écran de jeu, et la démonstration des visiteurs (21 novembre 2026) :
  // les cartes des Gaulois du clan, la rangée des boosters de loterie de la semaine, le booster d'essai.
  { fichier: "21-jeu-vitrine-loterie.css", pages: ["/village", "/direction"] },
];

/** Les morceaux qu'une page charge, dans l'ordre de la cascade. `route` : le motif de la page (`/membres/[id]`). */
export function feuillesDeLaPage(route: string): string[] {
  return FEUILLES.filter((f) => f.pages === TOUTES || f.pages.includes(route)).map((f) => f.fichier);
}
