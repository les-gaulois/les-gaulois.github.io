/**
 * Ce que répond un Gaulois de la place quand on le touche (demande du pilote, le 14 novembre 2026 : « quand on clique
 * dessus ça envoie un message », et si on insiste dans l'heure, « plein plein de phrases », « arrête de me tripoter, tu me
 * soûles, laisse-moi respirer »). La règle qui choisit la liste est dans `toucher.ts` ; ici, seulement les phrases, écrites
 * à la main. Rien ne vient du serveur ni de l'API Claude, rien n'y part.
 *
 * Les règles, que `tests/unit/village-toucher.test.ts` relit phrase par phrase :
 * - 90 signes au plus (`REPLIQUE_MAX` : la bulle coupe au-delà), aucun chiffre, aucun doublon ;
 * - français parlé, au tutoiement, à la première personne du Gaulois ;
 * - insultes de cour de récréation seulement, sans cible réelle : des légumes, des objets, des petites bêtes. Rien sur le
 *   physique, la santé, l'origine, la religion ou le genre ; aucune grossièreté ; aucun vrai clan, aucun vrai joueur ;
 * - le visiteur peut être un enfant, et n'est pas supposé être un homme : aucun accord au masculin qui le vise ; chaque
 *   phrase paraît sous le nom d'un vrai membre : rien à double sens, rien qui se lise comme un refus qu'on ignore ;
 *   « tripoter » ne s'écrit que dans la phrase du pilote, « Arrête de me tripoter ! » (`PHRASE_DU_PILOTE`) ;
 * - aucune référence à Astérix ni à une autre œuvre (`MOTS_INTERDITS`) ;
 * - aucun conseil de jeu, aucun résultat, rien qui se lise comme un message du site ou de l'équipe.
 * Ce qu'aucun test ne sait voir (le ton, un sous-entendu) se relit à chaque ajout.
 */

/** La première fois, quand le serveur ne lui a pas donné de bulle : un salut. */
export const SALUTS: readonly string[] = [
  "Salut à toi !",
  "Tiens, de la visite.",
  "Oui ? C'est pour quoi ?",
  "Bien le bonjour à toi.",
  "Ah, te voilà, toi.",
  "On se connaît, non ?",
  "On est bien, au village.",
  "Salut ! Tu cherches quelqu'un ?",
  "Présent !",
  "Hé ! Doucement, mais bonjour.",
  "Tu m'as appelé ?",
  "Bienvenue chez nous.",
  "Salut, toi.",
  "Oh, de la curiosité.",
  "Je t'écoute.",
  "Ça va, toi ?",
  "Bonjour, bonjour.",
  "Un doigt sur mon épaule ? Bonjour quand même.",
  "Tu admires ma tenue ? Tu as bon goût.",
  "Le clan te salue.",
  "Hé, salut ! Je ne t'avais pas vu.",
  "Qui me demande ?",
];

/** Les deuxième et troisième fois : aimable ou amusé, selon ce qu'il fait là où il est. */
export const AIMABLES = {
  place: [
    "Encore toi ? Ça me fait plaisir.",
    "Je fais ma promenade. Tu viens ?",
    "Je tourne autour du feu, ça réchauffe.",
    "Tu as vu ma tenue ? Pas mal, hein.",
    "Rien à signaler sur la place.",
    "Je cherchais quelqu'un à qui parler. Trouvé.",
    "On est bien, près du feu.",
    "Deux fois bonjour, ça ne fait pas de mal.",
    "Je me dégourdis les jambes.",
    "Tu me suis, ou je rêve ?",
    "Ça chatouille.",
    "Si tu cherches la taverne, c'est par là. Enfin, je crois.",
  ],
  taverne: [
    "Assieds-toi, il reste de la place.",
    "Chut, je savoure.",
    "Ma chope et moi, on passe un bon moment.",
    "On raconte la dernière partie. Tu veux la version longue ?",
    "Attention, tu vas renverser ma chope.",
    "À la tienne !",
    "Ici, on refait la bataille, mais assis.",
    "Après l'effort, la chope.",
    "Je lève ma chope au clan.",
    "Tu m'offres la prochaine ?",
    "Parle plus fort, ça chante à côté.",
  ],
  reunion: [
    "Chut, on est en réunion.",
    "Je prends des notes. Enfin, je fais semblant.",
    "Tu as demandé la parole ?",
    "On discute, on discute.",
    "Attends, c'est bientôt mon tour de parler.",
    "Lève la main avant de me toucher.",
    "Réunion au sommet. Enfin, autour de la table.",
    "J'écoute d'une oreille. L'autre est pour toi.",
    "Une réunion, ça se respecte.",
    "Je garde ma place autour de la table.",
    "Tu veux t'asseoir avec nous ?",
  ],
  bataille: [
    "Pas maintenant, je me bats !",
    "Tiens-moi ça... Non, rien, j'ai les mains prises.",
    "Tu vois bien que je suis occupé.",
    "Un instant, je finis celui-là.",
    "Viens m'aider au lieu de regarder.",
    "Attention, ça tape par ici.",
    "Je rejoue ma dernière partie, pour le plaisir.",
    "Tu me déconcentres, mais c'est gentil de passer.",
    "Regarde ce coup-là. Tu as vu ?",
    "Reste derrière moi.",
    "On cause après la bataille ?",
  ],
} as const satisfies Record<string, readonly string[]>;

/** Dans les maisons, il dort : les trois premières fois, il marmonne dans son sommeil, sans se réveiller. */
export const SOMMEIL: readonly string[] = [
  "Zzz... encore un peu...",
  "Mmmh... pas l'heure...",
  "Zzz... la couverture... rends-la...",
  "Rrron... pchiii...",
  "Mmh... c'est pas mon tour de garde...",
  "Zzz... tous au front... zzz...",
  "Hmmf... laisse... je dors...",
  "Rrron... il est où, mon casque... zzz...",
  "Mmmh... éteins le feu...",
  "Zzz... encore une partie... demain...",
];

/** Dans les maisons, à partir de la quatrième fois : il grogne dans son sommeil, toujours sans se réveiller. */
export const SOMMEIL_AGACE: readonly string[] = [
  "Grrmbl... arrête... zzz...",
  "Mmmh... qui me secoue... pchiii...",
  "Rrron... touche à ton lit...",
  "Grmf... je dors, moi... zzz...",
  "Zzz... pas les pieds... grrr...",
  "Hmmf... file... rrron...",
  "Grrr... même en rêve, tu m'embêtes...",
  "Mmmh... laisse-moi dormir... zzz...",
  "Rrrron... je mords en dormant... zzz...",
  "Grmbl... demain... on en reparle... zzz...",
  "Zzz... va embêter l'oreiller... rrron...",
  "Pchiii... même pas réveillé... grmf...",
];

/** Son propre Gaulois, les trois premières fois. */
export const LE_SIEN: readonly string[] = [
  "C'est toi qui m'as habillé comme ça, je te signale.",
  "Ah, c'est toi. Tu viens admirer ton œuvre ?",
  "On se ressemble, non ?",
  "Salut, moi. Enfin, toi. Enfin, nous.",
  "Tu m'as bien choisi, je trouve.",
  "Si ma tenue ne te plaît plus, tu sais où est le vestiaire.",
  "C'est moi, ton Gaulois. Je me tiens bien, promis.",
  "Je te représente, alors je me tiens droit.",
  "Tu passes me voir ? C'est gentil.",
  "Dis, on change de tenue, un de ces jours ?",
];

/** Son propre Gaulois, quand il insiste : ces phrases s'ajoutent à celles du palier. */
export const LE_SIEN_AGACE: readonly string[] = [
  "C'est toi-même que tu embêtes, là. Réfléchis.",
  "Je suis ton Gaulois, pas ton jouet.",
  "C'est toi qui m'as créé, et voilà comment tu me traites.",
  "Continue, et je choisis ma tenue tout seul. N'importe comment.",
  "On m'a créé, et on ne me laisse même pas tranquille.",
  "Tu m'as fait pour ça ? Pour m'embêter ?",
  "Je vais demander à changer de propriétaire.",
  "Arrête, ou je mets ma tenue à l'envers.",
];

/** De la quatrième à la sixième fois dans l'heure : agacé. */
export const AGACES: readonly string[] = [
  "Arrête de me tripoter !",
  "Encore ? Tu n'as rien d'autre à faire ?",
  "Laisse-moi respirer.",
  "Hé ! Bas les pattes.",
  "Tu commences à m'agacer.",
  "On a déjà dit bonjour, non ?",
  "Doucement, mon épaule !",
  "Je ne suis pas une sonnette.",
  "Tu vas froisser ma tenue.",
  "Ça suffit, maintenant.",
  "Va chatouiller quelqu'un d'autre.",
  "Tu me prends pour un tambour ?",
  "Oui, oui, je t'ai vu. C'est bon.",
  "Ton doigt ne sait pas s'arrêter ?",
  "Une fois, ça va. Là, ça fait beaucoup.",
  "Je sens que tu vas recommencer.",
  "Tu ne veux pas aller voir à la taverne si j'y suis ?",
  "Stop. On respire. Toi aussi.",
  "C'est fragile, un Gaulois. Enfin, non. Mais arrête.",
  "Tu comptes me toucher encore longtemps ?",
  "Pas touche !",
  "J'ai l'air d'un bouton ?",
  "Mon épaule n'a rien demandé.",
  "Tu colles, toi.",
  "Je vais finir par me fâcher.",
  "Garde tes mains dans tes poches.",
  "Tu me chatouilles, et je ne ris pas.",
  "Il y a plein d'autres Gaulois. Va les embêter.",
  "Dis donc, tu t'ennuies à ce point ?",
  "Je te préviens, ma patience est courte.",
  "Recule d'un pas. Voilà. Encore un.",
  "Ça t'amuse ? Moi, moyen.",
];

/** De la septième à la dixième fois : excédé. */
export const EXCEDES: readonly string[] = [
  "Tu me soûles !",
  "Mais lâche-moi, à la fin !",
  "Tu es pénible, tu le sais, ça ?",
  "J'en ai plein le casque !",
  "Non mais ça va durer longtemps ?",
  "Tu es pire qu'un moustique.",
  "Pot de colle !",
  "Je vais le dire au chef.",
  "Arrête, ou je range mes bonnes manières.",
  "Tu me cherches, là.",
  "Mais qu'est-ce que je t'ai fait ?",
  "Va voir ailleurs si le feu brûle.",
  "Tu pèses sur mes nerfs comme une enclume.",
  "Je ne suis pas ton doudou !",
  "Laisse-moi tranquille, sangsue !",
  "Ça y est, tu m'as énervé.",
  "Encore un doigt, et je boude.",
  "Tu as juré de me rendre chèvre ?",
  "Même les mouches sont moins collantes.",
  "Je compte jusqu'à trois. Un...",
  "Ouste !",
  "Du balai !",
  "Mes nerfs, tu marches dessus.",
  "Tu veux que je m'énerve ? C'est fait.",
  "Tu n'as pas une partie à jouer, plutôt ?",
  "Je vais porter plainte au conseil du village.",
  "Quelle plaie !",
  "Assez ! Assez ! Assez !",
  "Je te l'ai demandé gentiment, avant.",
  "Tu me fatigues plus qu'une bataille.",
  "C'est un village, ici, pas un marché aux Gaulois.",
  "Encore une fois, et je me cache derrière le feu.",
  "Enlève ton doigt de mon épaule, casse-pieds !",
];

/** À partir de la onzième fois, et jusqu'à ce que l'heure soit passée : furieux, théâtral, insultant pour rire. */
export const FURIEUX: readonly string[] = [
  "Espèce de cornichon à pattes !",
  "Va te faire cuire un œuf, andouille !",
  "Tu n'es qu'un navet mal épluché !",
  "File, pot de colle sans couvercle !",
  "Chaussette trouée, va !",
  "Je te maudis jusqu'à la prochaine partie !",
  "Hors de ma vue, courant d'air !",
  "Tu as le doigt plus têtu qu'une mule !",
  "Reviens dans une heure, je serai calmé. Peut-être.",
  "Espèce de poireau mal lavé !",
  "Moustique ! Sangsue ! Glu de printemps !",
  "Range ce doigt, ou je le confisque !",
  "Tu mériterais de laver toutes les chopes du village !",
  "Triple patate !",
  "Quel sans-gêne ! Non mais quel sans-gêne !",
  "Je boude. Voilà. Ça te plaît ? Je boude.",
  "Je ne te parle plus. Sauf pour te dire que je ne te parle plus.",
  "Espèce de casserole sans manche !",
  "Qu'on m'apporte un bouclier, il recommence !",
  "Tu es la honte du doigt !",
  "Espèce de tabouret bancal !",
  "Mon casque fume. Bravo.",
  "Tu touches comme une limace éternue !",
  "Va embêter un poteau, il a plus de patience !",
  "Médaille du doigt le plus pénible !",
  "Grande nouille trop cuite !",
  "Je vais aboyer. Je te jure que je vais aboyer.",
  "Sur la tête de mon casque, tu vas me lâcher, oui ?",
  "Tu es le caillou dans la sandale du village !",
  "Espèce de fromage oublié au soleil !",
  "Je fais grève de la parole. À partir de maintenant.",
  "Graine de chardon ! Épluchure ! Trognon !",
  "Même une ortie est plus agréable que toi !",
  "À force, tu m'as poli l'épaule !",
  "Disparais, courge molle !",
  "Ça suffit, espèce de bigorneau à roulettes !",
];

/** Toutes les listes, par nom : pour les tests et pour les compter. */
export const FAMILLES: Readonly<Record<string, readonly string[]>> = {
  saluts: SALUTS,
  "aimables, place": AIMABLES.place,
  "aimables, taverne": AIMABLES.taverne,
  "aimables, réunion": AIMABLES.reunion,
  "aimables, bataille": AIMABLES.bataille,
  sommeil: SOMMEIL,
  "sommeil agacé": SOMMEIL_AGACE,
  "le sien": LE_SIEN,
  "le sien, agacé": LE_SIEN_AGACE,
  agacés: AGACES,
  excédés: EXCEDES,
  furieux: FURIEUX,
};

/**
 * Ce qu'aucune phrase ne contient, en minuscules : les mots qui rappellent Astérix ou une autre œuvre, les grossièretés,
 * et les injures qui visent le physique, la santé, l'origine, la religion ou le genre. Chaque mot est cherché en mot entier,
 * pour ne pas refuser « content » à cause de trois lettres, avec ou sans « s » ou « x » au bout (`contientLeMot`) : un
 * pluriel ne passe pas. Un féminin s'écrit à part dans la liste : accepter un « e » au bout refuserait « Range ce doigt »
 * à cause de « rang ».
 */
export const MOTS_INTERDITS: readonly string[] = [
  // Astérix et autres œuvres.
  "toutatis", "bélénos", "belenos", "potion", "menhir", "sanglier", "romain", "druide", "barde", "cervoise", "serpe", "chaudron", "irréductible",
  "ils sont fous", "astérix", "obélix", "idéfix", "panoramix", "par ma", "par mon", "par tous", "sabord", "bachi", "ectoplasme", "moule à gaufres", "tonnerre de", "sacripant", "chenapan", "pignouf", "malotru", "olibrius", "zigoto", "garnement",
  // Grossièretés.
  "merde", "putain", "pute", "connard", "connasse", "con", "conne", "salaud", "salope", "salopard", "enculé", "encule", "bordel", "cul", "chier", "chiant", "foutre", "fous-moi",
  "foutu", "bâtard", "batard", "gueule", "pisse", "bite", "couille", "nique", "niquer", "crève", "tuer", "mort", "morte", "sang",
  // Le physique, la santé, l'origine, la religion, le genre.
  "gros", "grosse", "moche", "laid", "laide", "nain", "chauve", "vieux", "vieille", "débile", "crétin", "crétine", "idiot", "idiote", "imbécile", "abruti", "abrutie", "taré", "tarée", "fou", "folle", "malade", "mongol",
  "handicap", "attardé", "attardée", "bête", "stupide", "étranger", "étrangère", "dieu", "dieux", "diable", "enfer", "fillette", "femmelette", "tapette", "pédé", "gonzesse",
  // Ce qui se lirait comme un message du site, ou comme un résultat.
  "erreur", "votre", "vous", "statère", "classement", "victoire", "gagné", "perdu", "rang", "score",
];

/** Un mot interdit est-il dans ce texte ? En mot entier, sans égard aux capitales, avec ou sans « s » ou « x » au bout. */
export function contientLeMot(texte: string, mot: string): boolean {
  const lettres = mot.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<!\\p{L})${lettres}[sx]?(?!\\p{L})`, "u").test(texte.toLowerCase());
}

/** La seule phrase où s'écrit « tripoter » : c'est l'exemple du pilote, mot pour mot. */
export const PHRASE_DU_PILOTE = "Arrête de me tripoter !";
