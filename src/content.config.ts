import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { GROUPES, type GroupeId } from "./lib/guide";
import { ICONES_PARTIES, type IconePartieNom } from "./lib/icones-parties";

const groupes = GROUPES.map((g) => g.id) as [GroupeId, ...GroupeId[]];
const icones = Object.keys(ICONES_PARTIES) as [IconePartieNom, ...IconePartieNom[]];

/**
 * Les chapitres du guide du clan, sur /debuter : un chapitre par fichier de content/guide-clan/. L'en-tête porte ce
 * qu'un débutant lit d'abord (le nom court, l'essentiel, le bloc à essayer, l'encadré) ; le texte sous l'en-tête, ce
 * qui se déplie ensuite, « Détails et formules ». Tout vient du Guide Gaulois : rien ne s'écrit à la place du clan.
 */
const guideClan = defineCollection({
  loader: glob({ pattern: "*.md", base: "./content/guide-clan" }),
  schema: z.object({
    title: z.string(),
    order: z.number().int().positive(),
    /** Le nom court du chapitre, dans le sommaire et sur le bouton « Suivant ». */
    court: z.string(),
    /** Le groupe du sommaire : combat, economie, alliances ou memo (src/lib/guide.ts). */
    groupe: z.enum(groupes),
    /** L'icône du chapitre : un dessin de src/lib/icones-parties.ts. */
    icone: z.enum(icones),
    /** Une phrase d'entrée, avant l'essentiel. */
    chapeau: z.string().optional(),
    /** L'essentiel : quatre phrases courtes au plus, celles du chapitre. `**gras**` permis, rien d'autre. */
    essentiel: z.array(z.string()).max(4).default([]),
    /** Le bloc du chapitre : un essai à manipuler, des repères ou une liste (src/components/guide/). */
    bloc: z.enum(["attaque", "croissance", "terrain", "poste", "reflexes", "batiments", "bateau", "train", "trahison"]).optional(),
    blocTitre: z.string().optional(),
    /** La phrase qui répond au titre du bloc, avant l'essai. `**gras**` permis. */
    blocTexte: z.string().optional(),
    /** Les lignes du bloc, quand il en a : les questions d'une liste, les situations, le rôle de chaque bâtiment. */
    points: z
      .array(
        z.object({
          titre: z.string(),
          texte: z.string(),
          /** La conséquence en deux mots, et sa couleur (le bloc des situations de trahison). */
          marque: z.string().optional(),
          ton: z.enum(["danger", "attention", "calme"]).optional(),
          /** Le chapitre qui explique cette ligne : le nom de son fichier, sans « .md » (la liste des réflexes). */
          renvoi: z.string().optional(),
        }),
      )
      .default([]),
    /** L'encadré du chapitre : son titre (« Important », « Réflexe ») et sa phrase. */
    retenir: z.object({ titre: z.string(), texte: z.string() }).optional(),
    /** Le texte du chapitre se lit d'emblée, sans repli : les deux aide-mémoire, qui ne sont qu'un tableau. */
    ouvert: z.boolean().default(false),
  }),
});

export const collections = { guideClan };
