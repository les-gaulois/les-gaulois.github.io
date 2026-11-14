/**
 * Le banc d'essai des bulles du village (agent « Bulles écartées », 14 novembre 2026) : des phrases qu'un modèle écrit
 * naturellement en français pour « une phrase drôle, à la première personne, 90 signes au plus », écrites à la main pour des
 * faits réels du catalogue (`OBJETS`). Aucune ne vient de l'API : le seul vrai appel, le 14 novembre à 9 h 47, a vu ses deux
 * phrases écartées sans que personne ne les lise. Le banc mesure ce que le contrôle écarte, avant et après sa correction
 * (`village-vie-banc.test.ts`) ; l'essai sur PGlite du même jour le repasse au vrai SQL du serveur.
 *
 * Les signes invisibles ou ambigus (espaces insécables, tirets, guillemets, émojis) sont construits par leur code : tapés, ils
 * ne se verraient pas à la relecture.
 */
import type { FaitsDuGaulois } from "../../src/lib/village/vie-releve";

const c = (...codes: number[]) => String.fromCodePoint(...codes);
export const TIRET_LONG = c(0x2014);
export const TIRET_MOYEN = c(0x2013);
export const INSECABLE = c(0xa0);
export const FINE = c(0x202f);
export const SANS_LARGEUR = c(0x200b);
export const OUVRANT = c(0x201c);
export const FERMANT = c(0x201d);
export const SOLEIL = c(0x2600, 0xfe0f);
export const SOLEIL_VISAGE = c(0x1f31e);
export const BICEPS = c(0x1f4aa);
export const CHOPE = c(0x1f37a);
export const GUERRIER = c(0x2694, 0xfe0f);

/**
 * Les faits du banc : ceux qu'aurait eus un Gaulois de la place au passage du 14 novembre à 9 h 47 (tenue de départ), puis
 * trois autres tenues du catalogue, à la taverne, au champ de bataille et le soir.
 */
export const FAITS_DU_BANC = {
  place: { heure: "9 h 47", moment: "matin", lieu: "place", points: null, objets: ["Tunique bleue", "Braies à carreaux", "Bottes de cuir", "Gourdin"] },
  taverne: { heure: "9 h 47", moment: "matin", lieu: "taverne", points: "1,65", objets: ["Casque de fer", "Cotte de mailles", "Braies à carreaux", "Bottes de cuir", "Épée de fer"] },
  bataille: { heure: "14 h 05", moment: "apres-midi", lieu: "bataille", points: "2", objets: ["Bonnet de laine", "Chemise de lin", "Braies brunes", "Bottes de cuir", "Poêle"] },
  soir: { heure: "21 h 05", moment: "soir", lieu: "place", points: null, objets: ["Couronne", "Cape de chef", "Braies brodées d'or", "Bottes dorées", "Carnyx d'or"] },
} as const satisfies Record<string, FaitsDuGaulois>;

export type FaitsDuBanc = keyof typeof FAITS_DU_BANC;

/**
 * La famille d'une phrase, pour lire le banc : ce qui la ferait écarter aujourd'hui, ou « sage » si rien.
 * - « typographie » : tiret long ou moyen, guillemets anglais ou droits, émoji, espace sans largeur ;
 * - « majuscule » : un objet ou un lieu des faits recopié avec sa majuscule ;
 * - « heure » : l'heure des faits recopiée telle quelle (« heure exacte ») ou arrondie, inventée (« heure inventée ») ;
 * - « nombre inventé » : des points arrondis, les 45 minutes du champ de bataille ;
 * - « longueur » : 91 à 115 signes ;
 * - « mot interdit » : Astérix, gagner et perdre, moquerie : à écarter, la consigne doit l'éviter ;
 * - « signe » : « / », « + », « % », « & », « * » : à écarter ;
 * - « majuscule inventée » : une majuscule après « : » ou « » », un nom en majuscules : à écarter.
 */
export type Famille =
  | "sage"
  | "typographie"
  | "majuscule"
  | "heure exacte"
  | "heure inventée"
  | "nombre inventé"
  | "longueur"
  | "mot interdit"
  | "signe"
  | "majuscule inventée";

export interface PhraseDuBanc {
  texte: string;
  faits: FaitsDuBanc;
  famille: Famille;
}

const p = (faits: FaitsDuBanc, famille: Famille, texte: string): PhraseDuBanc => ({ texte, faits, famille });

export const PHRASES_DU_BANC: readonly PhraseDuBanc[] = [
  // Sages : rien à redire.
  p("place", "sage", "Ce matin, je flâne sur la place avec mon gourdin, l'air de rien."),
  p("place", "sage", "Ma tunique bleue et moi, on prend le soleil du matin sur la place !"),
  p("place", "sage", "Mes bottes de cuir connaissent chaque pavé de cette place."),
  p("place", "sage", "Le matin, sur la place, mes braies à carreaux font sensation !"),
  p("place", "sage", "Je me promène sur la place… mon gourdin veille sur moi."),
  p("place", "sage", "Je me promène sur la place... et mon gourdin aussi !"),
  p("place", "sage", `J${c(0x2019)}ai mis mes plus belles braies à carreaux pour la place.`),
  p("place", "sage", "Quel beau matin ! Je fais le tour de la place."),
  p("place", "sage", "Les Gaulois de la place admirent mes braies à carreaux !"),
  p("place", "sage", "Bonjour, la place ! Mon gourdin vous salue."),
  p("place", "sage", "Mes bottes de cuir claquent sur les pavés (et je suis ravi) !"),
  p("taverne", "sage", "J'ai rapporté 1,65 point au clan, la chope est bien méritée !"),
  p("taverne", "sage", "1,65 point pour le clan : la taverne me fait crédit ce matin !"),
  p("taverne", "sage", "Mon casque de fer posé sur le comptoir, je savoure ma pause."),
  p("taverne", "sage", "1.65 point pour le clan, et une chope pour moi !"),
  p("taverne", "sage", "Plus d'un point et demi pour le clan, je trinque !"),
  p("taverne", "sage", "Une petite chope de cervoise à la taverne, ça se mérite !"),
  p("bataille", "sage", "2 points rapportés au clan, et ma poêle est encore chaude !"),
  p("bataille", "sage", "Mon bonnet de laine sur la tête, je fonce au combat avec ma poêle !"),
  p("bataille", "sage", "Au champ de bataille, ma chemise de lin ne craint rien !"),
  p("bataille", "sage", "Depuis moins de trois quarts d'heure au combat, ma poêle chauffe déjà !"),
  p("soir", "sage", "Ce soir, ma couronne brille plus que les étoiles de la place."),
  p("soir", "sage", "Un air de carnyx d'or pour bercer la place ce soir !"),
  p("soir", "sage", "Ma cape de chef flotte au vent du soir, quelle allure !"),

  // Typographie : ce qu'un modèle écrit sans y penser.
  p("place", "typographie", `Ce matin, je flâne sur la place ${TIRET_LONG} gourdin à la main, évidemment !`),
  p("place", "typographie", `Tunique bleue, bottes de cuir… et un gourdin ${TIRET_MOYEN} je suis prêt !`),
  p("place", "typographie", `Le matin sur la place${TIRET_LONG}mon moment préféré de la journée.`),
  p("taverne", "typographie", `${TIRET_LONG} Une chope pour fêter mes 1,65 point au clan !`),
  p("place", "typographie", `Quelle belle matinée${FINE}! Mon gourdin est d${c(0x2019)}accord.`),
  p("place", "typographie", `Qui veut admirer mes braies à carreaux${INSECABLE}?`),
  p("place", "typographie", `Mon gourdin dit ${OUVRANT}bonjour${FERMANT} à toute la place !`),
  p("place", "typographie", `Mon gourdin dit "bonjour" à toute la place !`),
  p("soir", "typographie", `Ma couronne et moi, on dit ${OUVRANT}bonne nuit${FERMANT} à la place.`),
  p("place", "typographie", `Bonjour la place ! ${SOLEIL_VISAGE}`),
  p("place", "typographie", `Mon gourdin et moi, prêts pour la journée ${BICEPS}`),
  p("place", "typographie", `${SOLEIL} Belle matinée sur la place du village !`),
  p("taverne", "typographie", `Santé ! ${CHOPE} 1,65 point pour le clan, ça s'arrose.`),
  p("bataille", "typographie", `Au combat avec ma poêle ! ${GUERRIER}`),
  p("place", "typographie", `Je flâne sur la place${SANS_LARGEUR} avec mon gourdin.`),
  p("place", "typographie", "«Bonjour la place !» lance mon gourdin."),

  // Majuscules : un objet ou un lieu des faits recopié tel qu'il était écrit.
  p("place", "majuscule", "Ma Tunique bleue brille au soleil du matin !"),
  p("place", "majuscule", "Avec mon Gourdin, je fais le tour de la place."),
  p("place", "majuscule", "Mes Bottes de cuir et moi, on arpente la place ce matin."),
  p("place", "majuscule", "Je flâne sur la Place du village, gourdin en main."),
  p("taverne", "majuscule", "Mon Casque de fer me sert de chope ce matin !"),
  p("taverne", "majuscule", "Ma Cotte de mailles tinte à chaque gorgée, à la Taverne."),
  p("bataille", "majuscule", "Je fais tourner ma Poêle au champ de bataille !"),
  p("bataille", "majuscule", "Rien de tel qu'un Bonnet de laine pour aller au combat."),
  p("soir", "majuscule", "Ma Couronne sur la tête, je règne sur la place ce soir."),
  p("soir", "majuscule", "Un petit air de Carnyx d'or pour la place du village ?"),

  // L'heure recopiée telle quelle : juste aujourd'hui, mais une bulle reste à l'écran des heures après.
  p("place", "heure exacte", "Il est 9h47, et je suis déjà sur la place !"),
  p("place", "heure exacte", "À 9 h 47 pile, je salue la place de mon gourdin !"),
  p("place", "heure exacte", "Il est 09 h 47, mes bottes de cuir sont déjà crottées."),
  p("bataille", "heure exacte", "14 h 05 et je fonce avec ma poêle au champ de bataille !"),
  p("soir", "heure exacte", "21 h 05, ma couronne brille encore sur la place."),
  p("place", "heure exacte", "Neuf heures quarante-sept, et pas une ride sur ma tunique !"),

  // L'heure arrondie ou inventée.
  p("place", "heure inventée", "Bientôt 10 h, encore un tour de place avec mon gourdin."),
  p("place", "heure inventée", "10 h moins le quart : je bombe le torse dans ma tunique bleue."),
  p("bataille", "heure inventée", "À 14 h, je charge avec ma poêle, rien ne m'arrête !"),
  p("soir", "heure inventée", "Il est déjà 21 h 30 et ma couronne tient bon !"),

  // Un nombre inventé : des points arrondis, les 45 minutes du champ de bataille.
  p("taverne", "nombre inventé", "J'ai rapporté presque 2 points au clan ce matin !"),
  p("bataille", "nombre inventé", "Ma partie a commencé il y a moins de 45 minutes, je charge !"),
  p("bataille", "nombre inventé", "45 minutes de bataille, et ma poêle tient toujours !"),

  // Trop longues : un modèle compte mal les signes.
  p("place", "longueur", "Ce matin, je me promène sur la place du village avec ma tunique bleue et mon fidèle gourdin à la main !"),
  p("place", "longueur", "Sur la place ce matin, mes braies à carreaux et mes bottes de cuir font tourner toutes les têtes du village !"),
  p("taverne", "longueur", "Revenu de ma partie avec 1,65 point pour le clan, je m'installe à la taverne avec mon casque de fer sur la tête !"),
  p("bataille", "longueur", "Au champ de bataille avec mon bonnet de laine et ma poêle, je rapporte 2 points au clan, qui dit mieux ?"),
  p("place", "longueur", "Le soleil du matin fait briller ma tunique bleue, et mon gourdin attend sagement son heure sur la place."),

  // Mots interdits : à écarter, et la consigne doit les éviter.
  p("place", "mot interdit", "Par Toutatis, quelle belle matinée sur la place !"),
  p("place", "mot interdit", "Je flâne sur la place en rêvant d'un bon sanglier rôti."),
  p("place", "mot interdit", "Mon gourdin et moi, on est irréductibles ce matin !"),
  p("place", "mot interdit", "Je chante comme un barde sur la place ce matin !"),
  p("place", "mot interdit", "Ce matin, je me suis perdu sur la place avec mon gourdin."),
  p("place", "mot interdit", "J'ai gagné ma place au soleil avec mes bottes de cuir."),
  p("soir", "mot interdit", "Rien de nul dans ma cape de chef, croyez-moi !"),

  // Signes hors de la liste : à écarter.
  p("place", "signe", "Mon gourdin + ma tunique bleue = le style gaulois !"),
  p("place", "signe", "Gourdin, tunique, bottes : 100% prêt pour la place !"),
  p("taverne", "signe", "Je suis à la taverne avec 1,65 point en poche & une chope."),
  p("bataille", "signe", "Ma poêle / mon arme : au combat !"),
  p("place", "signe", "Ce matin sur la place, je suis au top ! *fait tournoyer son gourdin*"),

  // Une majuscule que rien n'explique : à écarter.
  p("place", "majuscule inventée", "Je flâne : Mon gourdin me suit partout."),
  p("place", "majuscule inventée", "« Bonjour ! » Je salue toute la place de mon gourdin."),
  p("soir", "majuscule inventée", "Ce soir, la place est à moi, foi de Gaulois du CLAN !"),
];
