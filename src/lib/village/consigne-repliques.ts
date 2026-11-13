/**
 * La consigne des bulles du village : ce que Claude reçoit pour écrire la phrase que dit chaque Gaulois sur la place
 * (demande du pilote, 13 novembre 2026 : « Oui, des bulles »). Ce fichier est fait pour être lu et changé : pour changer le
 * ton des bulles, changer `CONSIGNE` ; pour interdire un mot, l'ajouter à `MOTS_INTERDITS` ET à la liste du serveur
 * (`internal.village_vie_mots_interdits`, dans une nouvelle migration) : un test garde les deux listes identiques.
 *
 * Claude ne reçoit que des faits sans identité (`vie-releve.ts`, `faitsDuGaulois`) : l'heure et le moment de la journée à
 * Paris, le lieu du Gaulois, les points que sa dernière partie a rapportés au clan, les noms des objets qu'il porte (noms du
 * catalogue, jamais un texte tapé par un joueur). Ni nom, ni pseudo, ni identifiant, ni numéro de compte.
 *
 * Chaque phrase est contrôlée par le robot avant l'envoi, puis par le serveur (`controlerReplique` et
 * `internal.village_vie_replique_valide`, mêmes règles) : 90 signes au plus, des lettres, des chiffres et une ponctuation
 * simple seulement (donc ni « @ », ni « # », ni balise, ni lien, ni émoji), pas deux majuscules d'affilée, aucun chiffre
 * absent des faits, aucun mot de la liste. Une phrase refusée ne s'affiche pas, c'est tout.
 */
import type { Lieu } from "./vie";
import type { Moment } from "./vie-releve";

/** La longueur d'une bulle, en signes, espaces comprises. */
export const MAX_SIGNES = 90;

/** Les Gaulois d'un même appel à Claude : plusieurs à la fois coûtent moins qu'un par un. Le serveur en refuse davantage. */
export const MAX_REPLIQUES_PAR_PASSAGE = 20;

export const CONSIGNE = `Tu écris les bulles des Gaulois d'un petit village en pixels, sur le site d'un clan de joueurs. Chaque Gaulois est un membre du clan ; sa bulle s'affiche au-dessus de sa tête, sur la place du village.

Pour chaque Gaulois de la liste, écris UNE phrase qu'il dit lui-même :
- en français, à la première personne, drôle et bon enfant ;
- 90 signes au plus, espaces comprises ;
- tirée seulement des faits donnés pour lui : l'heure et le moment de la journée à Paris, l'endroit où il est, les points que sa dernière partie a rapportés au clan s'il y en a, ce qu'il porte. Tu n'es pas obligé de tous les utiliser, mais n'invente rien d'autre sur lui ;
- aucun chiffre, sauf l'heure ou les points des faits, recopiés tels quels ;
- dis « rapporter des points au clan », jamais « gagner », « perdre », « victoire » ni « défaite » ;
- aucun nom propre : ni nom de personne, ni nom de clan, ni nom de jeu, ni lieu réel, ni marque ;
- aucun lien, aucune adresse, aucun « @ » ni « # », aucune balise, aucun émoji, pas de mot en majuscules ;
- rien qui rappelle Astérix ou une autre œuvre : ni potion, ni druide, ni menhir, ni sanglier, ni Romains, ni « ils sont fous » ;
- aucun conseil de jeu ni de stratégie ;
- ne te moque de personne ni d'aucun clan, pas de vulgarité.

Varie les phrases d'un Gaulois à l'autre.

Réponds seulement en JSON : {"repliques": [{"g": "g1", "texte": "…"}]}, une entrée par Gaulois de la liste, avec le même « g ».`;

/** Le moment de la journée, tel que Claude le lit. */
export const MOMENTS_ECRITS: Readonly<Record<Moment, string>> = {
  nuit: "la nuit",
  matin: "le matin",
  "apres-midi": "l'après-midi",
  soir: "le soir",
};

/**
 * L'endroit où est le Gaulois, tel que Claude le lit : le lieu que l'écran montre (`lieuDuGaulois` de `vie.ts`). Chaque
 * phrase dit un fait relevé, rien de plus.
 */
export const LIEUX_ECRITS: Readonly<Record<Lieu, string>> = {
  place: "il se promène sur la place du village",
  taverne: "à la taverne, au retour de sa dernière partie",
  reunion: "en salle de réunion : il est dans un salon vocal du Discord du clan",
  bataille: "au champ de bataille : sa dernière partie a commencé il y a moins de 45 minutes",
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
];

/** Le schéma de la réponse, que l'API impose à Claude (sortie structurée, `output_config.format`). */
export const SCHEMA_REPONSE = {
  type: "object",
  properties: {
    repliques: {
      type: "array",
      items: {
        type: "object",
        properties: { g: { type: "string" }, texte: { type: "string" } },
        required: ["g", "texte"],
        additionalProperties: false,
      },
    },
  },
  required: ["repliques"],
  additionalProperties: false,
} as const;
