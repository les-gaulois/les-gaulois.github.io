/**
 * La garde-robe du village, lot « visage » : dix paires d'yeux, dix bouches et huit cicatrices ou marques, gratuites, à
 * choisir dès la création du Gaulois (demande du pilote : « plusieurs modèles œil, bouche, et cicatrice pour leur perso
 * gratuit au départ de la création »). Dessins originaux de Claude Fable 5.2, faits pour le clan [GAL] le 14 novembre
 * 2026 ; aucun n'emprunte un personnage, un objet ni une tenue à une œuvre existante.
 *
 * Les yeux restent de part et d'autre du nez, là où sont les « Yeux vifs » ; les sourcils et les yeux tiennent entre les
 * rangées 16 et 23, que les cheveux courts laissent voir. Une cicatrice se pose sur la peau du visage seulement.
 */
import type { ObjetDuLot } from "../gaulois.ts";

export const LOT_VISAGE: readonly ObjetDuLot[] = [
  // Les yeux, chacun avec ses sourcils (h, H : la couleur des cheveux).
  {
    emplacement: "yeux",
    id: "ronds",
    nom: "Yeux ronds",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 16,
      lignes: [
        ".................HHH........HHH.................",
        "................H...H......H...H................",
        "................................................",
        "..................ww........ww..................",
        ".................wkkw......wkkw.................",
        ".................wkkw......wkkw.................",
        "..................ww........ww..................",
      ],
    },
  },
  {
    emplacement: "yeux",
    id: "severe",
    nom: "Regard sévère",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 17,
      lignes: [
        "................HH............HH................",
        ".................HHH........HHH.................",
        "...................HHH....HHH...................",
        "..................kk........kk..................",
        "..................nk........nk..................",
        "..................kk........kk..................",
      ],
    },
  },
  {
    emplacement: "yeux",
    id: "rieurs",
    nom: "Yeux rieurs",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 16,
      lignes: [
        ".................HHH........HHH.................",
        "................H..............H................",
        "................................................",
        "................................................",
        "..................kk........kk..................",
        ".................k..k......k..k.................",
      ],
    },
  },
  {
    emplacement: "yeux",
    id: "clin-d-oeil",
    nom: "Clin d'œil",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 16,
      lignes: [
        "................HHHH............................",
        "................................................",
        "............................HHHH................",
        "................................................",
        "..................nk...........k................",
        "..................kk.......kkkk.................",
        "..................kk............................",
      ],
    },
  },
  {
    emplacement: "yeux",
    id: "endormi",
    nom: "Regard endormi",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 17,
      lignes: [
        "..................HHH......HHH..................",
        "................HH............HH................",
        "................................................",
        ".................SSSS......SSSS.................",
        ".................kkkk......kkkk.................",
        "..................kk........kk..................",
      ],
    },
  },
  {
    emplacement: "yeux",
    id: "sourcils-epais",
    nom: "Sourcils épais",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 17,
      lignes: [
        "................hhhhh......hhhhh................",
        "................HHHHH......HHHHH................",
        "................................................",
        "..................nk........nk..................",
        "..................kk........kk..................",
        "..................kk........kk..................",
      ],
    },
  },
  {
    emplacement: "yeux",
    id: "sourcil-leve",
    nom: "Sourcil levé",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 16,
      lignes: [
        ".................HHHH...........................",
        "................H...............................",
        "............................HHHH................",
        "...........................H....................",
        "..................nk............................",
        "..................kk........nk..................",
        "..................kk........kk..................",
      ],
    },
  },
  {
    emplacement: "yeux",
    id: "amande",
    nom: "Yeux en amande",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 17,
      lignes: [
        "................HHHH........HHHH................",
        "................................................",
        "................k..............k................",
        ".................kkkk......kkkk.................",
        ".................wkkw......wkkw.................",
        "..................kk........kk..................",
      ],
    },
  },
  {
    emplacement: "yeux",
    id: "bleus",
    nom: "Yeux bleus",
    rarete: null,
    gratuit: true,
    couleurs: { p: "#4a9be8", P: "#2a6fc0" },
    dessin: {
      y: 17,
      lignes: [
        "................HHHH........HHHH................",
        "................................................",
        "................................................",
        "..................kk........kk..................",
        "..................np........np..................",
        "..................pP........pP..................",
      ],
    },
  },
  {
    emplacement: "yeux",
    id: "cernes",
    nom: "Yeux cernés",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 17,
      lignes: [
        "................HHHH........HHHH................",
        "................................................",
        "................................................",
        "..................nk........nk..................",
        "..................kk........kk..................",
        ".................SkkS......SkkS.................",
        ".................STTS......STTS.................",
      ],
    },
  },
  // Les bouches : l'essentiel se lit rangées 28 et 29, sous la moustache.
  {
    emplacement: "bouche",
    id: "grand-sourire",
    nom: "Grand sourire",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 27,
      lignes: [
        "...................e........e...................",
        "....................ewwwwwwe....................",
        ".....................eeeeee.....................",
      ],
    },
  },
  {
    emplacement: "bouche",
    id: "moue",
    nom: "Moue",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 28,
      lignes: [
        ".....................eeeeee.....................",
        "....................e......e....................",
      ],
    },
  },
  {
    emplacement: "bouche",
    id: "bee",
    nom: "Bouche bée",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 27,
      lignes: [
        "......................eeee......................",
        ".....................ekkkke.....................",
        "......................eeee......................",
      ],
    },
  },
  {
    emplacement: "bouche",
    id: "en-coin",
    nom: "Sourire en coin",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 27,
      lignes: [
        "...........................e....................",
        "........................eee.....................",
        "....................eeee........................",
      ],
    },
  },
  {
    emplacement: "bouche",
    id: "dents-du-bonheur",
    nom: "Dents du bonheur",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 27,
      lignes: [
        "...................e.......e....................",
        "....................ewwewwe.....................",
        ".....................eeeee......................",
      ],
    },
  },
  {
    emplacement: "bouche",
    id: "dent-en-or",
    nom: "Dent en or",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 27,
      lignes: [
        "...................e........e...................",
        "....................ewwwwyge....................",
        ".....................eeeeee.....................",
      ],
    },
  },
  {
    emplacement: "bouche",
    id: "langue",
    nom: "Langue tirée",
    rarete: null,
    gratuit: true,
    couleurs: { p: "#e2707c", P: "#b84a5a" },
    dessin: {
      y: 27,
      lignes: [
        "....................e......e....................",
        ".....................eeeeee.....................",
        "......................pppP......................",
        ".......................pP.......................",
      ],
    },
  },
  {
    emplacement: "bouche",
    id: "pincees",
    nom: "Lèvres pincées",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 28,
      lignes: [
        ".....................SeeeeS.....................",
        "......................SSSS......................",
      ],
    },
  },
  {
    emplacement: "bouche",
    id: "grimace",
    nom: "Grimace",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 27,
      lignes: [
        "....................eeeeeeee....................",
        "....................ewWwWwWe....................",
        "....................eeeeeeee....................",
      ],
    },
  },
  {
    emplacement: "bouche",
    id: "serieuse",
    nom: "Bouche sérieuse",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 28,
      lignes: [
        "....................eeeeeeee....................",
      ],
    },
  },
  // Les cicatrices et les marques (t, T : selon la peau).
  {
    emplacement: "cicatrice",
    id: "balafre",
    nom: "Balafre",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 20,
      lignes: [
        ".............T..................................",
        ".............tT.................................",
        "..............tT................................",
        "...............tT...............................",
        "................tT..............................",
        ".................tT.............................",
        "..................tT............................",
      ],
    },
  },
  {
    emplacement: "cicatrice",
    id: "sourcil-fendu",
    nom: "Sourcil fendu",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 16,
      lignes: [
        "..............................T.................",
        "..............................t.................",
        "..............................t.................",
        "..............................T.................",
        "................................................",
        "................................................",
        "................................................",
        "..............................T.................",
        "..............................T.................",
        "..............................T.................",
      ],
    },
  },
  {
    emplacement: "cicatrice",
    id: "griffure",
    nom: "Griffure",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 22,
      lignes: [
        "...............T................................",
        ".............T.T.T..............................",
        ".............T.T.T..............................",
        "..............T.T.T.............................",
        "..............T.T.T.............................",
        "................T...............................",
      ],
    },
  },
  {
    emplacement: "cicatrice",
    id: "suture",
    nom: "Points de suture",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 21,
      lignes: [
        "...............T................................",
        "..............kTk...............................",
        "...............T................................",
        "..............kTk...............................",
        "...............T................................",
        "..............kTk...............................",
      ],
    },
  },
  {
    emplacement: "cicatrice",
    id: "pansement",
    nom: "Pansement de lin",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 22,
      lignes: [
        ".....................wwwwwU.....................",
        ".....................uUUUUU.....................",
      ],
    },
  },
  {
    emplacement: "cicatrice",
    id: "rousseur",
    nom: "Taches de rousseur",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 23,
      lignes: [
        "..............T.T.....T.......T.T...............",
        "...............T.T.....T.......T................",
        "..............T...............T.T...............",
      ],
    },
  },
  {
    emplacement: "cicatrice",
    id: "coquard",
    nom: "Coquard",
    rarete: null,
    gratuit: true,
    couleurs: { p: "#8f6a9c", P: "#6b4a80" },
    dessin: {
      y: 22,
      lignes: [
        "................p....p..........................",
        "................pPPPPp..........................",
        ".................pppp...........................",
      ],
    },
  },
  {
    emplacement: "cicatrice",
    id: "grain-de-beaute",
    nom: "Grain de beauté",
    rarete: null,
    gratuit: true,
    dessin: {
      y: 24,
      lignes: [
        "..............................k.................",
      ],
    },
  },
];
