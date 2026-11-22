/**
 * Les effets de « Coup pour coup », le duel de cartes de « Mon Gaulois » (chantier du 22 novembre 2026, maquette version 5
 * validée par le pilote, faite par Claude Fable 5.2) : les mots-clés des cartes, les panoplies, les lieux et les compagnons.
 * Des données seules, sans dessin ni DOM : le site, la fonction `code-discord` (Deno) et le serveur SQL lisent les mêmes.
 * Le catalogue des cartes (`catalogue.ts`) en est tiré par `scripts/fabriquer-effets-duel.ts` ; la migration du duel, à
 * venir, en recopiera les chiffres, et un test gardera les écritures identiques.
 *
 * Une phrase porte `{n}` à la place du chiffre de la carte.
 */

/** Les cinq emplacements d'objets, dans l'ordre d'une main : la carte d'indice 0 est l'arme, puis la tête, le haut, les pieds et le bas. */
export const EMPLACEMENTS_DU_DUEL = ["arme", "tete", "haut", "pieds", "bas"] as const;
export type EmplacementDuDuel = (typeof EMPLACEMENTS_DU_DUEL)[number];

/**
 * Les raretés d'une carte : « base » pour les objets gratuits que tout le monde a, puis celles de la garde-robe. Le
 * légendaire de saison a le rang du légendaire.
 */
export const RARETES_DU_DUEL = ["base", "commun", "peu-commun", "epique", "mystique", "legendaire", "saison", "divin"] as const;
export type RareteDuDuel = (typeof RARETES_DU_DUEL)[number];

/** Les treize mots-clés que portent les cartes ordinaires. */
export const MOTS_ORDINAIRES = ["assomme", "saigne", "perce", "brule", "epines", "rempart", "vif", "lourd", "regal", "ardeur", "rage", "gel", "elan"] as const;
/** Les dix effets réservés aux cartes uniques (légendaires, légendaire de saison et divines). */
export const MOTS_UNIQUES = ["vampire", "reveil", "plein", "inarretable", "voleElan", "antiFatigue", "purge", "muraille", "execute", "infatigable"] as const;
/** Tous les mots-clés, dans l'ordre où le serveur les range. */
export const MOTS_CLES = [...MOTS_ORDINAIRES, ...MOTS_UNIQUES] as const;
export type MotCle = (typeof MOTS_CLES)[number];

export interface DefinitionDuMot {
  nom: string;
  phrase: string;
  /** Ne vaut que sur un coup : une arme ou une tête. */
  coup?: true;
  /** Réservé aux cartes uniques : une étoile pour icône. */
  unique?: true;
}

export const MOTS: Readonly<Record<MotCle, DefinitionDuMot>> = {
  assomme: { nom: "Assomme", coup: true, phrase: "Si le coup porte, l'autre perd {n} d'énergie." },
  saigne: { nom: "Saigne", coup: true, phrase: "Si le coup porte, l'autre perd encore {n} de vie : 1 à la fin de chaque manche qui suit." },
  perce: { nom: "Perce", coup: true, phrase: "La garde d'en face arrête {n} de moins." },
  brule: { nom: "Brûle", phrase: "L'autre perd {n} de vie à la fin de la manche, même s'il garde." },
  epines: { nom: "Épines", phrase: "Si l'autre cogne cette manche, il perd {n} de vie." },
  rempart: { nom: "Rempart", phrase: "Tu prends {n} de moins du coup d'en face." },
  vif: { nom: "Vif", phrase: "Se repose 1 manche au lieu de 2." },
  lourd: { nom: "Lourd", phrase: "2 de force en plus, mais se repose 3 manches." },
  regal: { nom: "Régal", phrase: "Te rend {n} de vie." },
  ardeur: { nom: "Ardeur", phrase: "Te rend {n} d'énergie." },
  rage: { nom: "Rage", phrase: "{n} de force en plus si tu as moins de vie que l'autre." },
  gel: { nom: "Gel", phrase: "La carte posée en face se repose {n} manche de plus." },
  elan: { nom: "Élan", phrase: "Donne {n} d'élan à ton coup de la manche suivante." },
  vampire: { nom: "Butin", unique: true, coup: true, phrase: "Te rend autant de vie que le coup en fait perdre, 2 au plus." },
  reveil: { nom: "Réveil", unique: true, phrase: "Tes cartes au repos reviennent toutes." },
  plein: { nom: "Plein d'énergie", unique: true, phrase: "Ton énergie remonte au plafond." },
  inarretable: { nom: "Inarrêtable", unique: true, coup: true, phrase: "Ni garde ni rempart ne l'arrêtent." },
  voleElan: { nom: "Larcin", unique: true, phrase: "Prend l'élan de l'autre." },
  antiFatigue: { nom: "Endurance", unique: true, phrase: "Tu ne subis pas la fatigue de cette manche." },
  purge: { nom: "Pansement", unique: true, phrase: "Arrête ton saignement." },
  muraille: { nom: "Muraille", unique: true, phrase: "Tu prends 5 de moins du coup d'en face." },
  execute: { nom: "Coup de grâce", unique: true, coup: true, phrase: "{n} de force en plus si l'autre a 6 de vie ou moins." },
  infatigable: { nom: "Infatigable", unique: true, phrase: "Ne se repose pas." },
};

/** Les mots-clés sans chiffre : ils valent 1 sur la carte. */
export const MOTS_SANS_CHIFFRE: readonly MotCle[] = ["vif", "lourd", "reveil", "plein", "inarretable", "voleElan", "antiFatigue", "purge", "muraille", "infatigable", "vampire"];

/**
 * Les atouts d'un camp, pour tout le duel : ce que donnent ses panoplies, son compagnon et le lieu. Un chiffre absent vaut
 * 0. Un pouvoir de boss s'écrit avec les mêmes clés (`OptionsDuCamp.passifs`) ; une règle nouvelle se demande à la session
 * du moteur.
 */
export const CLES_DES_ATOUTS = [
  /** Énergie de plus à la première manche. */
  "energieDepart",
  /** Le plafond d'énergie monte d'autant. */
  "plafond",
  /** Vie de plus au départ (et au plafond de vie). */
  "vie",
  /** Élan à la première manche. */
  "elanDepart",
  /** Le souffle ne s'use plus (1 : oui). */
  "souffleSansUsure",
  /** Le souffle rend autant de vie de plus. */
  "soufflePlus",
  /** La garde arrête autant de plus. */
  "gardePlus",
  /** Les armes frappent autant de plus. */
  "frappePlus",
  /** Les pieds donnent autant d'élan de plus. */
  "elanPlus",
  /** Un coup qui porte donne autant d'élan de plus que l'enchaînement. */
  "enchainePlus",
  /** Les coups ont autant de force de plus quand on a moins de vie que l'autre. */
  "rage",
  /** Les pieds se reposent une manche de moins, jamais moins d'une (1 : oui). */
  "piedsVifs",
  /** La fatigue coûte autant de moins. */
  "fatigueMoins",
  /** La fatigue coûte autant de plus à l'autre. */
  "fatigueAdverse",
  /** La fatigue arrive autant de manches plus tard. */
  "fatigueTard",
  /** Une fois par duel, le coup qui devait mettre à terre laisse 1 de vie (1 : oui). */
  "survie",
  /** Le premier coup du duel a autant de force de plus. */
  "premierCoup",
  /** La première fatigue coûte autant de moins. */
  "premiereFatigue",
  /** Le premier souffle rend autant de vie de plus. */
  "premierSouffle",
  /** Chaque coup d'en face est amorti d'autant (comme le mot-clé « rempart », pour tout le duel). */
  "rempart",
  /** Un coup qui porte brûle l'autre d'autant. */
  "brule",
] as const;
export type CleDAtout = (typeof CLES_DES_ATOUTS)[number];
export type Atouts = Partial<Record<CleDAtout, number>>;

export type IdDePanoplie = "forge" | "mer" | "cuisine" | "armee" | "neige" | "bronze" | "fer" | "fete" | "plumes" | "fanfare" | "sauvage" | "or" | "introuvable" | "vache" | "atomique" | "fusee";

export interface Panoplie {
  nom: string;
  /** Le nombre de pièces de la famille à avoir en main. */
  pieces: number;
  /** Une tenue divine : deux pièces suffisent, la bourse n'en laisse pas porter plus. */
  divin?: true;
  phrase: string;
  passif: Atouts;
}

/** Les seize panoplies : trois pièces d'une famille en main, ou deux d'une tenue divine, de l'or ou de la fanfare. Les pièces de chacune sont dans `catalogue.ts`. */
export const PANOPLIES: Readonly<Record<IdDePanoplie, Panoplie>> = {
  forge: { nom: "La forge", pieces: 3, phrase: "Le feu de la forge : tu commences avec 1 d'énergie de plus.", passif: { energieDepart: 1 } },
  mer: { nom: "Les gens de mer", pieces: 3, phrase: "Ton souffle ne s'use plus.", passif: { souffleSansUsure: 1 } },
  cuisine: { nom: "La cuisine", pieces: 3, phrase: "Ton souffle rend 1 de vie de plus.", passif: { soufflePlus: 1 } },
  armee: { nom: "La troupe", pieces: 3, phrase: "Tu commences avec 2 d'énergie de plus.", passif: { energieDepart: 2 } },
  neige: { nom: "Le grand froid", pieces: 3, phrase: "La fatigue te coûte 1 de vie de moins.", passif: { fatigueMoins: 1 } },
  bronze: { nom: "Le bronze", pieces: 3, phrase: "Ta garde arrête 2 de plus.", passif: { gardePlus: 2 } },
  fer: { nom: "Le fer", pieces: 3, phrase: "Ta garde arrête 1 de plus.", passif: { gardePlus: 1 } },
  fete: { nom: "La fête", pieces: 3, phrase: "Tu pars avec 3 de vie de plus.", passif: { vie: 3 } },
  plumes: { nom: "Les plumes", pieces: 3, phrase: "Tes pieds se reposent 1 manche de moins.", passif: { piedsVifs: 1 } },
  // Deux pièces, et non trois comme dans la maquette : ses pièces ne sont que des armes et le maillot du clan (un haut), si
  // bien qu'une main d'une carte par emplacement n'en réunissait jamais trois (vu au portage, le 22 novembre 2026).
  fanfare: { nom: "La fanfare du clan", pieces: 2, phrase: "Un coup qui porte donne 2 d'élan au lieu de 1.", passif: { enchainePlus: 1 } },
  sauvage: { nom: "Les bêtes", pieces: 3, phrase: "Tes coups ont 1 de force en plus quand tu as moins de vie que l'autre.", passif: { rage: 1 } },
  or: { nom: "L'or du chef", pieces: 2, phrase: "Tu commences avec 1 d'énergie de plus et ton plafond monte de 1.", passif: { energieDepart: 1, plafond: 1 } },
  introuvable: { nom: "L'introuvable", pieces: 2, divin: true, phrase: "3 de vie de plus, et une fois par duel, le coup qui devait te mettre à terre te laisse 1 de vie.", passif: { survie: 1, vie: 3 } },
  vache: { nom: "La vache", pieces: 2, divin: true, phrase: "Ton souffle ne s'use plus et rend 3 de vie de plus.", passif: { souffleSansUsure: 1, soufflePlus: 3 } },
  atomique: { nom: "L'atomique", pieces: 2, divin: true, phrase: "La fatigue coûte 2 de vie de plus à l'autre, et 1 de moins à toi.", passif: { fatigueAdverse: 2, fatigueMoins: 1 } },
  fusee: { nom: "La fusée", pieces: 2, divin: true, phrase: "Ton premier coup du duel a 5 de force en plus.", passif: { premierCoup: 5 } },
};
export const ORDRE_DES_PANOPLIES = Object.keys(PANOPLIES) as readonly IdDePanoplie[];

/** Le lieu du duel : la bannière du Gaulois défié, par famille de bannières. Son effet vaut pour les deux duellistes. */
export type IdDeLieu = "front" | "mers" | "cartes" | "saisons" | "legendes" | "tresors";
export interface Lieu {
  phrase: string;
  passif: Atouts;
}
export const LIEUX: Readonly<Record<IdDeLieu, Lieu>> = {
  front: { phrase: "Les armes frappent 1 de plus.", passif: { frappePlus: 1 } },
  mers: { phrase: "Les pieds prennent 1 d'élan de plus.", passif: { elanPlus: 1 } },
  cartes: { phrase: "La fatigue arrive une manche plus tard.", passif: { fatigueTard: 1 } },
  saisons: { phrase: "Le souffle rend 1 de vie de plus.", passif: { soufflePlus: 1 } },
  legendes: { phrase: "Chacun commence avec 1 d'énergie de plus.", passif: { energieDepart: 1 } },
  tresors: { phrase: "Le plafond d'énergie monte de 1.", passif: { plafond: 1 } },
};

/** Le compagnon : le familier montré, par famille. Le même poids pour tous, jamais selon sa rareté. */
export type IdDeCompagnon = "Ferme" | "Forêt" | "Ciel et eaux" | "Légendes" | "Drôles";
export interface Compagnon {
  phrase: string;
  passif: Atouts;
}
export const COMPAGNONS: Readonly<Record<IdDeCompagnon, Compagnon>> = {
  Ferme: { phrase: "1 de vie de plus au départ.", passif: { vie: 1 } },
  Forêt: { phrase: "1 d'énergie de plus au départ.", passif: { energieDepart: 1 } },
  "Ciel et eaux": { phrase: "1 d'élan à la première manche.", passif: { elanDepart: 1 } },
  Légendes: { phrase: "La première fatigue te coûte 1 de moins.", passif: { premiereFatigue: 1 } },
  Drôles: { phrase: "Ton premier souffle rend 1 de vie de plus.", passif: { premierSouffle: 1 } },
};

/** Un mot-clé d'une carte : le mot seul (il vaut 1), ou le mot et son chiffre. */
export type MotDeCarte = readonly [MotCle] | readonly [MotCle, number];

/**
 * La fiche d'un objet dans le catalogue du duel : `e` l'emplacement, `r` la rareté, `m` ses mots-clés, `u` le nom de son
 * effet unique, `p` sa panoplie. Une carte de base n'a ni mot-clé ni panoplie.
 */
export interface FicheDeCarte {
  e: EmplacementDuDuel;
  r: RareteDuDuel;
  p?: IdDePanoplie;
  u?: string;
  m?: readonly MotDeCarte[];
}

export const estUnLieu = (x: unknown): x is IdDeLieu => typeof x === "string" && Object.hasOwn(LIEUX, x);
export const estUnCompagnon = (x: unknown): x is IdDeCompagnon => typeof x === "string" && Object.hasOwn(COMPAGNONS, x);
