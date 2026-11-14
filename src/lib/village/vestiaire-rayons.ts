/**
 * Le rangement du vestiaire du village (14 novembre 2026) : la garde-robe passe d'une quinzaine d'objets par emplacement à
 * une soixantaine, et le visage se choisit (yeux, bouche, cicatrice). Le vestiaire ne montre donc plus tout d'un coup :
 * un rayon à la fois (le corps, puis un rayon par emplacement d'objets), et la boutique d'un rayon se filtre par rareté.
 *
 * Ici, seulement des calculs purs : quel rayon tient un emplacement, ce qui est au membre et ce qui est à la boutique,
 * combien d'objets par rareté, le cadre du gros plan d'un visage. Rien ne décide d'un droit ni d'un prix : le serveur
 * le fait, et l'écran (`src/components/compte/Vestiaire.tsx`) ne range que ce qu'il a reçu.
 */
import {
  EMPLACEMENTS_OBJETS,
  EMPLACEMENTS_VISAGE,
  GAULOIS_HAUTEUR,
  GAULOIS_LARGEUR,
  NOMS_EMPLACEMENTS,
  OBJETS,
  ORDRE_RARETES,
  type Catalogue,
  type Emplacement,
  type Objet,
  type Rarete,
  type Tenue,
  type Vignette,
} from "../gaulois";

/** Le rayon du corps : la peau, les cheveux, la barbe et le visage, gratuits, à choisir dès la création. */
export const RAYON_CORPS = "corps";

/** Les rayons, dans l'ordre de la barre : le corps, puis un rayon par emplacement d'objets. */
export const RAYONS = [RAYON_CORPS, ...EMPLACEMENTS_OBJETS] as const;
export type Rayon = (typeof RAYONS)[number];

export const NOMS_RAYONS: Readonly<Record<Rayon, string>> = {
  corps: "Corps",
  tete: NOMS_EMPLACEMENTS.tete,
  haut: NOMS_EMPLACEMENTS.haut,
  bas: NOMS_EMPLACEMENTS.bas,
  pieds: NOMS_EMPLACEMENTS.pieds,
  arme: NOMS_EMPLACEMENTS.arme,
};

/** Le rayon où se trouve un emplacement : le sien pour un objet, le corps pour tout le reste. */
export function rayonDe(emplacement: Emplacement): Rayon {
  return (EMPLACEMENTS_OBJETS as readonly string[]).includes(emplacement) ? (emplacement as Rayon) : RAYON_CORPS;
}

/** Un objet et son identifiant, comme les donne le catalogue. */
export type Entree = readonly [id: string, objet: Objet];

/** Un rayon rangé : ce qui se porte tout de suite, puis ce qui reste à la boutique. */
export interface Rangement {
  aMoi: Entree[];
  boutique: Entree[];
}

/**
 * Les objets d'un emplacement en deux tas, dans l'ordre du catalogue (les gratuits, puis de la rareté la plus courante à
 * la plus rare) : ceux qui se portent (gratuits, ou possédés d'après `possede`) et ceux de la boutique.
 */
export function rangerLeRayon(objets: Readonly<Record<string, Objet>>, possede: (id: string) => number): Rangement {
  const rangement: Rangement = { aMoi: [], boutique: [] };
  for (const entree of Object.entries(objets)) {
    const [id, objet] = entree;
    (objet.gratuit || possede(id) > 0 ? rangement.aMoi : rangement.boutique).push(entree);
  }
  return rangement;
}

/** Le filtre de la boutique d'un rayon : une rareté, ou tout. */
export const TOUT = "tout";
export type Filtre = Rarete | typeof TOUT;

/** Combien d'objets de chaque rareté dans une liste. Un objet sans rareté ne compte nulle part. */
export function compterParRarete(liste: readonly Entree[]): Record<Rarete, number> {
  const comptes = Object.fromEntries(ORDRE_RARETES.map((rarete) => [rarete, 0])) as Record<Rarete, number>;
  for (const [, objet] of liste) if (objet.rarete) comptes[objet.rarete] += 1;
  return comptes;
}

/**
 * Le filtre qui s'applique vraiment : une rareté qui n'a plus d'objet dans la liste (le dernier vient d'être acheté) ne
 * laisse pas une boutique vide, tout se remontre.
 */
export function filtreEffectif(filtre: Filtre | undefined, comptes: Readonly<Record<Rarete, number>>): Filtre {
  return filtre && filtre !== TOUT && comptes[filtre] > 0 ? filtre : TOUT;
}

/** La liste, réduite à une rareté ; entière avec « tout ». L'ordre ne change pas. */
export function filtrerParRarete(liste: readonly Entree[], filtre: Filtre): Entree[] {
  return filtre === TOUT ? [...liste] : liste.filter(([, objet]) => objet.rarete === filtre);
}

/** Le filtre de chaque rayon : un rayon garde le sien quand on en visite un autre. */
export type Filtres = Readonly<Partial<Record<Rayon, Filtre>>>;

/** Les filtres après un choix dans un rayon : choisir de nouveau la rareté déjà retenue revient à tout montrer. */
export function choisirFiltre(filtres: Filtres, rayon: Rayon, filtre: Filtre): Filtres {
  return { ...filtres, [rayon]: filtres[rayon] === filtre ? TOUT : filtre };
}

/** Un carré de cases pris dans le dessin du Gaulois : son coin en haut à gauche et son côté. */
export interface Cadre {
  gauche: number;
  haut: number;
  cote: number;
}

/** Le plus petit gros plan : les yeux et la bouche du visage d'avant, avec leur marge. Jamais plus serré. */
const COTE_MINIMAL = 20;

/**
 * Le cadre du gros plan des cases du visage : le plus petit carré qui contient tous les dessins des yeux, des bouches et
 * des cicatrices du catalogue, centré sur eux. Il suit les dessins : un lot qui pose une marque plus loin sur la joue
 * élargit le cadre, sans rien régler à la main. Les trois parties partagent le même cadre : d'une case à l'autre, seul le
 * trait à choisir change.
 */
export function cadreDuVisage(catalogue: Catalogue = OBJETS): Cadre {
  let gauche = GAULOIS_LARGEUR;
  let droite = -1;
  let haut = GAULOIS_HAUTEUR;
  let bas = -1;
  for (const emplacement of EMPLACEMENTS_VISAGE) {
    for (const objet of Object.values(catalogue[emplacement])) {
      objet.dessin?.lignes.forEach((ligne, dy) => {
        for (let x = 0; x < GAULOIS_LARGEUR; x++) {
          if ((ligne[x] ?? ".") === ".") continue;
          gauche = Math.min(gauche, x);
          droite = Math.max(droite, x);
          haut = Math.min(haut, objet.dessin!.y + dy);
          bas = Math.max(bas, objet.dessin!.y + dy);
        }
      });
    }
  }
  // Aucun dessin : le milieu de la tête.
  if (droite < gauche) return { gauche: (GAULOIS_LARGEUR - COTE_MINIMAL) / 2, haut: 13, cote: COTE_MINIMAL };
  const cote = Math.min(GAULOIS_LARGEUR, Math.max(COTE_MINIMAL, droite - gauche + 1, bas - haut + 1));
  const caler = (debut: number, fin: number, limite: number): number => Math.max(0, Math.min(limite - cote, Math.floor((debut + fin + 1 - cote) / 2)));
  return { gauche: caler(gauche, droite, GAULOIS_LARGEUR), haut: caler(haut, bas, GAULOIS_HAUTEUR), cote };
}

/** Le gros plan : les cases du Gaulois entier (`casesDuGaulois`) rognées au cadre. */
export function grosPlan(cases: readonly (string | null)[], cadre: Cadre): Vignette {
  const rognees: (string | null)[] = [];
  for (let y = cadre.haut; y < cadre.haut + cadre.cote; y++) {
    for (let x = cadre.gauche; x < cadre.gauche + cadre.cote; x++) rognees.push(cases[y * GAULOIS_LARGEUR + x] ?? null);
  }
  return { largeur: cadre.cote, hauteur: cadre.cote, cases: rognees };
}

/**
 * La tenue à dessiner dans une case du visage : le Gaulois du membre, sans coiffe, sans arme et sans barbe. Une grande
 * barbe cache la bouche et les joues : la case montre ce qu'on choisit, le Gaulois entier montre ce qui s'en voit.
 */
export function visageNu(tenue: Tenue): Tenue {
  return { ...tenue, tete: "aucun", arme: "aucune", barbe: "aucune" };
}

/**
 * De combien agrandir un dessin pour qu'il tienne dans une place carrée, en pixels : un nombre entier de fois, pour des
 * bords nets, entre 1 et `maximum`.
 */
export function echelleEntiere(largeur: number, hauteur: number, place: number, maximum: number): number {
  const grand = Math.max(1, largeur, hauteur);
  return Math.max(1, Math.min(maximum, Math.floor(place / grand)));
}
