/**
 * La consigne des bulles du village : ce que Claude reçoit pour écrire la phrase que dit chaque Gaulois sur la place
 * (demande du pilote, 13 novembre 2026 : « Oui, des bulles »). Ce fichier est fait pour être lu et changé : pour changer le
 * ton des bulles, changer `CONSIGNE` ; pour interdire un mot, l'ajouter à `MOTS_INTERDITS` ET à la liste du serveur
 * (`internal.village_vie_mots_interdits`, dans une nouvelle migration) : un test garde les deux listes identiques.
 *
 * Claude ne reçoit que des faits sans identité (`vie-releve.ts`, `faitsEcrits`) : le moment de la journée à Paris, le lieu du
 * Gaulois, les points que sa dernière partie a rapportés au clan, les noms des objets qu'il porte (noms du catalogue, en
 * minuscules, jamais un texte tapé par un joueur). Ni nom, ni pseudo, ni identifiant, ni numéro de compte. Jamais l'état
 * vocal : une bulle reste 12 heures à l'écran, l'état vocal 15 minutes ; le lieu d'une bulle n'est donc jamais la salle de
 * réunion (`LieuDUneBulle`). Plus l'heure non plus, depuis le 14 novembre 2026 : une bulle reste à l'écran des heures après
 * avoir été écrite, et « il est 9 h 47 » y deviendrait faux ; recopiée ou arrondie (« bientôt 10 h »), elle faisait aussi
 * écarter des phrases. Elle reste dans les faits que le serveur garde avec la bulle.
 *
 * Chaque phrase est nettoyée de ce qui n'est que typographie, puis contrôlée par le robot avant l'envoi, puis par le serveur
 * (`nettoyage` et `controlerReplique` de `vie-releve.ts`, `internal.village_vie_replique_valide`) : 90 signes au plus, des
 * lettres, des chiffres et une ponctuation simple seulement (donc ni « @ », ni « # », ni balise, ni lien, ni émoji), pas
 * deux majuscules d'affilée, aucune majuscule hors d'un début de phrase, aucun chiffre absent des faits, aucun mot de la
 * liste. Le robot est plus strict que le serveur sur un point : il ne permet que les nombres des points, puisque Claude ne
 * reçoit plus l'heure. Claude écrit trois phrases par Gaulois ; la première qui passe devient sa bulle.
 */
import type { Lieu } from "./vie";
import type { Moment } from "./vie-releve";

/** La longueur d'une bulle, en signes, espaces comprises. */
export const MAX_SIGNES = 90;

/**
 * Les bulles et les demandes sans bulle d'un même envoi au serveur, au plus : il en refuse davantage
 * (`internal.village_vie_releve_valide`). Un appel à Claude en demande moins (`GAULOIS_PAR_APPEL` de `vie-releve.ts`).
 */
export const MAX_REPLIQUES_PAR_PASSAGE = 20;

/** Les phrases que Claude écrit pour chaque Gaulois : la première qui passe le contrôle devient sa bulle. */
export const PHRASES_PAR_GAULOIS = 3;

/**
 * La ponctuation permise, telle que la consigne la donne : celle de `SIGNES_PERMIS` (`vie-releve.ts`) et du serveur, ni plus
 * ni moins (un test le garde). L'espace aussi est permise.
 */
export const SIGNES_DE_LA_CONSIGNE = ". , ! ? ' ’ : ; … « » ( ) -";

export const CONSIGNE = `Tu écris les bulles des Gaulois d'un petit village en pixels, sur le site d'un clan de joueurs. Chaque Gaulois est un membre du clan ; sa bulle s'affiche au-dessus de sa tête, sur la place du village, pendant plusieurs heures.

Pour chaque Gaulois de la liste, écris trois phrases différentes (texte_1, texte_2, texte_3) qu'il pourrait dire lui-même : le site garde la première qui respecte toutes les règles. Chaque phrase :
- en français, à la première personne, drôle et bon enfant ;
- une seule phrase, courte : douze mots au plus, jamais plus de 90 signes, espaces comprises ;
- tirée seulement des faits donnés pour lui : le moment de la journée, l'endroit où il est, les points que sa dernière partie a rapportés au clan s'il y en a, ce qu'il porte. Tu n'es pas obligé de tous les utiliser, mais n'invente rien d'autre sur lui ;
- aucun chiffre, sauf les points des faits, recopiés exactement comme dans les faits ; jamais d'heure ni de durée, ni en chiffres ni en lettres ;
- aucune majuscule, sauf la première lettre de la phrase et le mot « Gaulois » : ce qu'il porte et l'endroit où il est s'écrivent en minuscules ;
- seulement des lettres, des chiffres, des espaces et ces signes : ${SIGNES_DE_LA_CONSIGNE} ; donc ni tiret long, ni guillemets anglais ou droits, ni « / », « % », « + », « & », « * » ;
- dis « rapporter des points au clan », jamais « gagner », « perdre » ni « perdu », « victoire » ni « défaite » ;
- aucun nom propre : ni nom de personne, ni nom de clan, ni nom de jeu, ni lieu réel, ni marque ;
- aucun lien, aucune adresse, aucun « @ » ni « # », aucune balise, aucun émoji, pas de mot en majuscules ;
- rien qui rappelle Astérix ou une autre œuvre : ni potion, ni druide, ni menhir, ni sanglier, ni Romains, ni barde, ni chaudron, ni gui, ni serpe, ni « irréductible », ni « par Toutatis », ni « ils sont fous » ;
- aucun conseil de jeu ni de stratégie ;
- ne te moque de personne ni d'aucun clan, pas de vulgarité, ni « nul », ni « idiot ».

Varie les phrases d'un Gaulois à l'autre.

Réponds seulement en JSON : {"repliques": [{"g": "g1", "texte_1": "…", "texte_2": "…", "texte_3": "…"}]}, une entrée par Gaulois de la liste, avec le même « g ».`;

/**
 * Ce qui précède les faits quand le robot redemande des phrases dans le même passage, pour les Gaulois restés sans bulle
 * (`vie-releve.ts`, `vieDuVillage`) : chacun dont les phrases ont été écartées porte la raison de chaque écart, en mots.
 */
export const CONSIGNE_DE_REPRISE =
  "Reprise : aucune phrase n'a été retenue pour ces Gaulois. Quand « phrases_ecartees_parce_que » est donné, il dit pourquoi le contrôle du site a écarté les précédentes. Écris trois nouvelles phrases par Gaulois, qui respectent toutes les règles.";

/** Le moment de la journée, tel que Claude le lit. */
export const MOMENTS_ECRITS: Readonly<Record<Moment, string>> = {
  nuit: "la nuit",
  matin: "le matin",
  "apres-midi": "l'après-midi",
  soir: "le soir",
};

/**
 * Les lieux d'une bulle : ceux de l'écran (`Lieu` de `vie.ts`), sauf la salle de réunion, qui dirait l'état vocal. Une bulle
 * se montre 12 heures, l'état vocal 15 minutes (page Confidentialité) : Claude ne l'apprend jamais.
 */
export type LieuDUneBulle = Exclude<Lieu, "reunion">;

/**
 * L'endroit où est le Gaulois, tel que Claude le lit : le lieu que l'écran montrerait sans l'état vocal (`lieuDUneBulle` de
 * `vie-releve.ts`). Chaque phrase dit un fait relevé, rien de plus.
 */
export const LIEUX_ECRITS: Readonly<Record<LieuDUneBulle, string>> = {
  place: "il se promène sur la place du village",
  taverne: "à la taverne, au retour de sa dernière partie",
  // Sans « 45 minutes » : un nombre lu ici, recopié, faisait écarter la phrase (aucun nombre hors des points n'est permis).
  bataille: "au champ de bataille : sa dernière partie a commencé il y a peu",
  maisons: "dans sa maison : il dort, c'est la nuit",
};

/**
 * Les mots et les expressions refusés dans une bulle, sur le texte ramené en minuscules sans accents, chaque suite de signes
 * autres que des lettres changée en une espace, avec une espace au début et à la fin (`normaliserPourLesMots` de
 * `vie-releve.ts`, `internal.village_vie_normaliser` du serveur). Une espace avant et après : le mot seul (« gui » n'arrête
 * pas « guide ») ; une espace avant seulement : tout mot qui commence ainsi (« potion » arrête « potions »). Toujours en
 * minuscules, sans accent, sans apostrophe.
 */
export const MOTS_INTERDITS: readonly string[] = [
  // Astérix et ce qui le rappelle (CLAUDE.md : aucune référence à Astérix).
  " asterix",
  " obelix",
  " idefix",
  " panoramix",
  " abraracourcix",
  " assurancetourix",
  " cetautomatix",
  " ordralfabetix",
  " falbala",
  " bonemine",
  " uderzo",
  " goscinny",
  " toutatis",
  " potion",
  " menhir",
  " sanglier",
  " romain",
  " cesar",
  " druide",
  " chaudron",
  " serpe ",
  " serpes ",
  " gui ",
  " irreductible",
  " barde ",
  " bardes ",
  " casque aile",
  " sont fous",
  " tombe sur la tete",
  // Ni lien ni nom propre du jeu ou du clan.
  " http",
  " www",
  " discord",
  " openfront",
  " gal ",
  // Les mots que le pilote a repris pour les points rapportés au clan.
  " gagn",
  " victoir",
  " defaite",
  " perd",
  // La vulgarité et la haine.
  " con ",
  " cons ",
  " connard",
  " connasse",
  " salop",
  " pute ",
  " putes ",
  " putain",
  " encul",
  " nique",
  " batard",
  " merde",
  " pd ",
  " pede ",
  " pedes ",
  " nazi",
  " hitler",
  " negre",
  " bougnoul",
  " youpin",
  // La moquerie (revue de sécurité du 14 novembre 2026). « nul » et ses formes en mots entiers : ni « annuler » ni « granule »
  // ne sont arrêtés (« nulle part » l'est, tant pis) ; les autres arrêtent aussi leurs formes (« abrutis », « idiote »).
  " nul ",
  " nuls ",
  " nulle ",
  " nulles ",
  " abruti",
  " idiot",
  " tocard",
  " cretin",
  " debile",
  " imbecile",
];

/**
 * Les mots qui gardent leur majuscule au milieu d'une phrase. Toute autre majuscule doit ouvrir la bulle ou une phrase (après
 * « . », « ! », « ? » ou « … » et une espace) : un nom propre (une personne, un clan, une marque) ne passe pas. La même liste
 * que `internal.village_vie_majuscules_permises` du serveur, dans le même ordre (un test garde les deux identiques) : les
 * plus longs d'abord. « Discord » n'y est pas : il est dans les mots interdits, et rien de ce que Claude reçoit ne le nomme
 * (un test le garde).
 */
export const MAJUSCULES_PERMISES: readonly string[] = ["Gauloises", "Gauloise", "Gaulois"];

/** Les champs des phrases d'un Gaulois dans la réponse, dans l'ordre où le robot les essaie. */
export const CHAMPS_DES_PHRASES = ["texte_1", "texte_2", "texte_3"] as const;

/**
 * Le schéma de la réponse, que l'API impose à Claude (sortie structurée, `output_config.format`) : trois phrases nommées
 * par Gaulois plutôt qu'un tableau, que les sorties structurées ne savent pas borner (skill claude-api, « JSON Schema
 * Limitations » : pas de contrainte complexe sur un tableau).
 */
export const SCHEMA_REPONSE = {
  type: "object",
  properties: {
    repliques: {
      type: "array",
      items: {
        type: "object",
        properties: { g: { type: "string" }, texte_1: { type: "string" }, texte_2: { type: "string" }, texte_3: { type: "string" } },
        required: ["g", ...CHAMPS_DES_PHRASES],
        additionalProperties: false,
      },
    },
  },
  required: ["repliques"],
  additionalProperties: false,
} as const;
