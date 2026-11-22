/**
 * Le boss du jour du duel « Coup pour coup » (chantier 4, 22 novembre 2026) : chacun des 11 Gaulois uniques
 * (`../../modeles/`) devient un boss, le même pour tous ce jour-là (la règle du jour : `rotation.ts`). Design de
 * Claude Fable 5.2 (pouvoirs, icônes, lieux, mains, répliques) ; chiffres réglés par l'essai d'équilibre
 * (`scripts/essai-duel-contenu.ts`, gardé par `tests/unit/duel-boss.test.ts`) pour tomber près de `CIBLES_DES_BOSS`.
 *
 * - **Son corps** : le Gaulois unique de même identifiant, habillé des objets de sa main.
 * - **Sa main** : cinq objets de la garde-robe, dans l'ordre arme, tête, haut, pieds, bas, dans la même bourse que tout le
 *   monde ; ni divin, ni plus d'un légendaire.
 * - **Son pouvoir** : des atouts du vocabulaire du moteur (`CLES_DES_ATOUTS` de `../effets.ts`), donnés à son camp seul
 *   (`OptionsDuCamp.passifs`) ; aucune règle nouvelle. Son icône : 11 cases sur 11, sans cerne (l'écran le pose).
 * - **Son lieu** : une bannière du catalogue ; son effet est celui de sa famille (`LIEUX`), et vaut pour les deux.
 * - **Sa machine** : le niveau `NIVEAU_DES_BOSS` de `niveaux.ts`. Elle ne voit jamais la carte choisie en face.
 * - **Ses répliques** : à son entrée, quand il tombe, quand il gagne ; douze mots au plus.
 *
 * Des données seules, sans rien de Node ni de Deno : le site, le robot et le serveur (copie SQL demandée à la session du
 * moteur) lisent les mêmes.
 */
import type { RareteDUnique } from "../../modeles/modele.ts";
import type { Atouts, IdDeLieu } from "../effets.ts";
import type { OptionsDuCamp } from "../regles.ts";
import { rangDuJour } from "./rotation.ts";

/** L'icône d'un pouvoir : 11 rangées de 11 lettres, « . » pour une case vide, et la couleur de chaque lettre. */
export interface IconeDePouvoir {
  readonly rangees: readonly string[];
  readonly teintes: Readonly<Record<string, string>>;
}

/** Le pouvoir d'un boss : son nom, sa phrase, ses atouts et son icône. */
export interface PouvoirDeBoss {
  readonly nom: string;
  readonly phrase: string;
  readonly passif: Atouts;
  readonly icone: IconeDePouvoir;
}

/** Un boss du jour. */
export interface BossDuJour {
  /** L'identifiant du Gaulois unique dont il a le corps. */
  readonly id: string;
  readonly titre: string;
  readonly pouvoir: PouvoirDeBoss;
  /** Sa bannière, et la famille de lieu qu'elle donne au duel. */
  readonly lieu: { readonly banniere: string; readonly famille: IdDeLieu };
  /** Ses cinq objets : arme, tête, haut, pieds, bas. */
  readonly main: readonly [string, string, string, string, string];
  readonly repliques: { readonly entree: string; readonly vaincu: string; readonly vainqueur: string };
}

/**
 * La part de duels, sur 100, qu'un joueur de bon sens (`BON_SENS` de `niveaux.ts`), avec une main tirée d'une garde-robe
 * aisée, doit gagner contre le boss, selon la rareté de son Gaulois unique : plus il est rare, plus il est dur. Tous sont au
 * moins aussi durs qu'un duel ordinaire contre le guerrier, où ce joueur gagne 50 fois sur 100. Une proposition de ce
 * chantier, pas un chiffre du pilote.
 */
export const CIBLES_DES_BOSS: Readonly<Record<RareteDUnique, number>> = { commun: 46, "peu-commun": 42, epique: 36, mystique: 32, legendaire: 30 };

export const BOSS: readonly BossDuJour[] = [
  {
    id: "lezard",
    titre: "Le Lézard des marais",
    pouvoir: {
      nom: "Queue qui repousse",
      phrase: "Il a 3 de vie de plus, et son premier souffle rend 2 de vie de plus.",
      passif: { premierSouffle: 2, vie: 3 },
      icone: {
        teintes: { L: "#b8f08a", M: "#3fae4c", D: "#1f7a3a", W: "#e9ffb0" },
        rangees: [
          "...........",
          ".......LMM.",
          "......LMMD.",
          ".....LMMD..",
          "....LMMD...",
          "...LMMD....",
          "..WLMD.....",
          ".WWLD......",
          ".WW........",
          "..W........",
          "...........",
        ],
      },
    },
    lieu: { banniere: "delta-verdoyant", famille: "cartes" },
    main: ["fronde", "bandeau", "cuirasse-ecailles", "bottes-ecailles", "jambieres-ecailles"],
    repliques: {
      entree: "Approche, Gaulois. Mes écailles ont tout leur temps.",
      vaincu: "Bien joué. Ma queue repoussera, ma fierté aussi.",
      vainqueur: "Trop pressé, Gaulois. Reviens quand tu sauras attendre.",
    },
  },
  {
    id: "loup",
    titre: "Le Loup gris",
    pouvoir: {
      nom: "Faim de loup",
      phrase: "Ses coups ont 1 de force en plus quand il a moins de vie que toi.",
      passif: { rage: 1 },
      icone: {
        teintes: { G: "#c9566a", L: "#fff6e0", W: "#ffffff", M: "#eedfb8", D: "#b89a6a", R: "#e0344a" },
        rangees: [
          "...........",
          "..GGGGGGG..",
          "..LWWMMMD..",
          "..LWWMMMD..",
          "...LWMMD...",
          "...LWMMD...",
          "....LMD....",
          "....LMD....",
          ".....M.....",
          ".....R.....",
          "...........",
        ],
      },
    },
    lieu: { banniere: "nuit-de-neige", famille: "saisons" },
    main: ["epee-courte", "chapeau-berger", "veste-peau", "bottes-fourrees", "braies-loup"],
    repliques: {
      entree: "Tu sens bon la victoire facile. Dommage pour toi.",
      vaincu: "Je rentre à la tanière. Garde-moi une place au feu.",
      vainqueur: "Blessé, je mords plus fort. Retiens-le.",
    },
  },
  {
    id: "sanglier",
    titre: "Le Sanglier têtu",
    pouvoir: {
      nom: "La charge",
      phrase: "Son premier coup du duel a 2 de force en plus.",
      passif: { premierCoup: 2 },
      icone: {
        teintes: { L: "#fff6e0", W: "#ffffff", M: "#eedfb8", D: "#b89a6a", K: "#a9744a" },
        rangees: [
          "...........",
          ".......W...",
          "......LW...",
          ".....LMW...",
          "....LMM....",
          "...LMMD....",
          "..LMMD.....",
          "..MMDD.....",
          "..MDD..K.K.",
          "..DD..K.K..",
          "...........",
        ],
      },
    },
    lieu: { banniere: "poste-sur-la-crete", famille: "front" },
    main: ["baton-marche", "barrette-mineur", "gilet-berger", "bottes-cavalier", "braies-cuir"],
    repliques: {
      entree: "Je fonce d'abord, je réfléchis après. Écarte-toi !",
      vaincu: "Ouf. Tu as tenu ma charge, chapeau.",
      vainqueur: "Fallait pas rester au milieu du chemin, Gaulois.",
    },
  },
  {
    id: "axolotl",
    titre: "L'Axolotl du lagon",
    pouvoir: {
      nom: "Peau neuve",
      phrase: "Son souffle rend 2 de vie de plus.",
      passif: { soufflePlus: 2 },
      icone: {
        teintes: { L: "#ffd6e0", M: "#ff8fab", D: "#d4587a" },
        rangees: [
          "...........",
          "..L..L..L..",
          "..M..M..M..",
          "..ML.M.LM..",
          "...M.M.M...",
          "...MLMLM...",
          "....MMM....",
          "....DMD....",
          ".....M.....",
          ".....D.....",
          "...........",
        ],
      },
    },
    lieu: { banniere: "mer-des-lueurs", famille: "mers" },
    main: ["canne-peche", "bocal-poisson", "pelerine-pluie", "bottes-pecheur", "pantalon-marin"],
    repliques: {
      entree: "Coucou ! Tape toujours, ça repousse tout seul.",
      vaincu: "Oh. Bravo ! Je retourne barboter, sans rancune.",
      vainqueur: "Tu vois ? Tout neuf. On recommence quand tu veux.",
    },
  },
  {
    id: "corbeau",
    titre: "Le Corbeau moqueur",
    pouvoir: {
      nom: "Coup d'aile",
      phrase: "Ses pieds lui donnent 1 d'élan de plus.",
      passif: { elanPlus: 1 },
      icone: {
        teintes: { L: "#6f86e8", M: "#2b3a8c", D: "#161d4d", W: "#c9d2ff" },
        rangees: [
          "...........",
          ".......LM..",
          "......LMMD.",
          ".....LMMMD.",
          "....LMMMD..",
          "...LMWMD...",
          "..LMWMD....",
          "..MWMD.....",
          "..WDD......",
          ".W.........",
          "...........",
        ],
      },
    },
    lieu: { banniere: "mer-de-nuages", famille: "legendes" },
    main: ["sabre-courbe", "casque-plumet", "cape-capuche", "bottes-plumes", "braies-courtes"],
    repliques: {
      entree: "Croa ! J'ai vu ta main de là-haut. Pas fameux.",
      vaincu: "Croa. Je n'ai rien vu, je regardais ailleurs.",
      vainqueur: "Un coup, puis deux, puis trois. Tu comptais ?",
    },
  },
  {
    id: "squelette",
    titre: "Le Squelette bonhomme",
    pouvoir: {
      nom: "Tas d'os",
      phrase: "Il a 2 de vie de plus, et une fois par duel, le coup qui devait l'abattre le laisse à 1 de vie.",
      passif: { survie: 1, vie: 2 },
      icone: {
        teintes: { W: "#fff6e0", M: "#e2d2a8", D: "#b89a6a" },
        rangees: [
          "...........",
          ".......W.W.",
          ".......WWM.",
          "......WWM..",
          ".....WWM...",
          "....WWM....",
          "...WWM.....",
          ".WWWM......",
          ".WMWD......",
          "...D.......",
          "...........",
        ],
      },
    },
    lieu: { banniere: "nuit-des-citrouilles", famille: "saisons" },
    main: ["faux-guerre", "seau-bois", "armure-os", "bottes", "braies-rapiecees"],
    repliques: {
      entree: "Salut l'ami ! Promis, je ne me casse pas facilement.",
      vaincu: "Bon. Qui m'aide à retrouver mon tibia ?",
      vainqueur: "Tu m'as cru fini ? Je me suis remonté à temps.",
    },
  },
  {
    id: "givre",
    titre: "Le Gaulois de givre",
    pouvoir: {
      nom: "Froid mordant",
      phrase: "La fatigue te coûte 3 de vie de plus.",
      passif: { fatigueAdverse: 3 },
      icone: {
        teintes: { L: "#d9f3ff", M: "#6cc4ff", W: "#ffffff" },
        rangees: [
          "...........",
          ".....L.....",
          "..L..M..L..",
          "...M.M.M...",
          "....MWM....",
          ".LMMWWWMML.",
          "....MWM....",
          "...M.M.M...",
          "..L..M..L..",
          ".....L.....",
          "...........",
        ],
      },
    },
    lieu: { banniere: "banquise-du-nord", famille: "cartes" },
    main: ["javelot", "chapka", "cape-voyage", "patins-glace", "braies-fete"],
    repliques: {
      entree: "Prends ton temps, Gaulois. Le froid travaille pour moi.",
      vaincu: "Tu m'as fait fondre. Joli duel.",
      vainqueur: "Tu as traîné. Chez moi, traîner coûte cher.",
    },
  },
  {
    id: "automate",
    titre: "L'Automate de bronze",
    pouvoir: {
      nom: "Remonté à bloc",
      phrase: "Il commence avec 2 d'énergie de plus et son plafond monte de 1.",
      passif: { energieDepart: 2, plafond: 1 },
      icone: {
        teintes: { L: "#ffd9a0", M: "#d08a3c", D: "#8a5320" },
        rangees: [
          "...........",
          "....LMM....",
          "..L.LMM.M..",
          "..LLMMMMD..",
          ".LLMM.MMMD.",
          ".LMM...MMD.",
          ".MMMM.MMDD.",
          "..MMMMMDD..",
          "..M.MMD.D..",
          "....MDD....",
          "...........",
        ],
      },
    },
    lieu: { banniere: "salle-d-arcade", famille: "legendes" },
    main: ["epee-bronze", "bonnet", "cuirasse-bronze", "bottes-bronze", "braies-rapiecees"],
    repliques: {
      entree: "Clé tournée. Ressort tendu. Duel lancé. Bip.",
      vaincu: "Ressort à plat. Bien joué. Remonte-moi un autre jour.",
      vainqueur: "Calcul terminé. Tu manquais d'énergie. Bip.",
    },
  },
  {
    id: "magma",
    titre: "Le Gaulois de magma",
    pouvoir: {
      nom: "Coulée de lave",
      phrase: "Chacun de ses coups qui porte te fait perdre 1 de vie de plus.",
      passif: { brule: 1 },
      icone: {
        teintes: { R: "#e8431f", O: "#ff9a2e", Y: "#ffe46b" },
        rangees: [
          "...........",
          ".....R.....",
          "....RR.....",
          "....ROR....",
          "...RROR.R..",
          "...ROORRR..",
          "..RROYORR..",
          "..ROOYYOR..",
          "..ROYYYOR..",
          "...ROYOR...",
          "...........",
        ],
      },
    },
    lieu: { banniere: "forge-du-volcan", famille: "legendes" },
    main: ["torche", "lunettes-forgeron", "tablier-forgeron", "bottes-ecarlates", "bleu-travail"],
    repliques: {
      entree: "Approche donc, je te garde une place au chaud.",
      vaincu: "Me voilà refroidi. Beau travail, Gaulois.",
      vainqueur: "Tu t'es brûlé les doigts. Ça arrive aux meilleurs.",
    },
  },
  {
    id: "ovni",
    titre: "Le Visiteur des étoiles",
    pouvoir: {
      nom: "Champ de force",
      phrase: "Sa garde arrête 2 de plus, et il prend 1 de moins de chaque coup.",
      passif: { gardePlus: 2, rempart: 1 },
      icone: {
        teintes: { L: "#dcc8ff", W: "#ffffff", M: "#b084f5", D: "#6b3fc0", Y: "#ffe46b", C: "#5fd8d0" },
        rangees: [
          "...........",
          "....LLM....",
          "...LWLMM...",
          "...LLMMM...",
          ".DDMMMMMDD.",
          ".MMYMYMYMM.",
          "..DDDDDDD..",
          "....C.C....",
          "...C...C...",
          "..C.....C..",
          "...........",
        ],
      },
    },
    lieu: { banniere: "sous-la-nebuleuse", famille: "legendes" },
    main: ["lance-patates", "abat-jour", "tunique-etoilee", "mocassins", "braies-bleues"],
    repliques: {
      entree: "Bonjour, Gaulois. J'étudie vos coutumes. Frappe, pour voir.",
      vaincu: "Fascinant. Je note : le Gaulois cogne fort.",
      vainqueur: "Étude terminée. Tu passes très mal mon bouclier.",
    },
  },
  {
    id: "dragon",
    titre: "Le Dragon rouge",
    pouvoir: {
      nom: "Écailles de dragon",
      phrase: "Il prend 1 de moins de chaque coup.",
      passif: { rempart: 1 },
      icone: {
        teintes: { G: "#f2b632", L: "#ff7a6b", W: "#ffd9c9", M: "#d8342f", D: "#8f1420" },
        rangees: [
          "...........",
          "..GGGGGGG..",
          "..GLLMMMG..",
          "..GLWMMDG..",
          "..GLMMMDG..",
          "..GMMMDDG..",
          "...GMMDG...",
          "...GMDDG...",
          "....GDG....",
          ".....G.....",
          "...........",
        ],
      },
    },
    lieu: { banniere: "dragon-de-pierre", famille: "legendes" },
    main: ["torche", "citrouille", "armure-dragon", "sandales", "braies-rouges"],
    repliques: {
      entree: "Enfin un Gaulois. Je commençais à m'ennuyer sur mon or.",
      vaincu: "Tu as gagné ta place dans mes histoires, Gaulois.",
      vainqueur: "Pas mal. Reviens avec une meilleure garde-robe.",
    },
  },
];

/** L'ordre du cycle : le boss du premier jour, puis un de plus chaque jour, et l'on recommence. */
export const ORDRE_DES_BOSS: readonly string[] = ["loup", "axolotl", "automate", "magma", "sanglier", "squelette", "lezard", "givre", "corbeau", "ovni", "dragon"];

const PAR_ID = new Map(BOSS.map((b) => [b.id, b]));

/** Le boss de cet identifiant, ou `null`. */
export const bossParId = (id: string | null | undefined): BossDuJour | null => (id ? (PAR_ID.get(id) ?? null) : null);

/** Le boss du jour de cette date, à Paris : le même pour tous, sans tirage. */
export function bossDuJour(date: Date): BossDuJour {
  const id = ORDRE_DES_BOSS[rangDuJour(date, ORDRE_DES_BOSS.length)];
  const boss = bossParId(id);
  if (!boss) throw new Error(`boss inconnu : ${id}`);
  return boss;
}

/** Les options du camp du boss : son lieu et son pouvoir. Le camp du joueur prend le même lieu (`boss.lieu.famille`). */
export const optionsDuBoss = (boss: BossDuJour): OptionsDuCamp => ({ lieu: boss.lieu.famille, passifs: [boss.pouvoir.passif] });
