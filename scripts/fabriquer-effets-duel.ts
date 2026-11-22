/**
 * Fabrique le catalogue des cartes de « Coup pour coup », le duel de « Mon Gaulois » : une fiche par objet de la
 * garde-robe du dépôt (`supabase/functions/code-discord/gaulois.ts`, `OBJETS`), qui fait foi. Porté de
 * `fabriquer-effets.mjs`, l'outil de la maquette version 5 validée par le pilote le 22 novembre 2026 (Claude Fable 5.2).
 *
 * Les mots-clés suivent le nom et le thème de l'objet ; la rareté règle leur richesse ; chaque légendaire, chaque divin et
 * l'objet de chaque saison du pass ont un effet écrit à la main, plus bas. Un objet ajouté à la garde-robe reçoit ses
 * mots-clés en relançant ce script ; un nouveau légendaire, divin ou objet de saison doit d'abord recevoir son effet ici.
 *
 * Usage : `npx tsx scripts/fabriquer-effets-duel.ts` réécrit `supabase/functions/code-discord/duel/catalogue.ts`. Un test
 * (`tests/unit/duel-catalogue.test.ts`) vérifie que le fichier écrit est à jour.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EMPLACEMENTS_DU_DUEL, MOTS, ORDRE_DES_PANOPLIES, PANOPLIES } from "../supabase/functions/code-discord/duel/effets.ts";
import type { EmplacementDuDuel, FicheDeCarte, IdDePanoplie, MotCle, MotDeCarte, RareteDuDuel } from "../supabase/functions/code-discord/duel/effets.ts";
import { OBJETS } from "../supabase/functions/code-discord/gaulois.ts";

/** Les thèmes : ce que le nom de l'objet dit de lui. Le premier qui convient donne le mot-clé, le suivant le second (mystique). */
const THEMES: readonly (readonly [RegExp, MotCle])[] = [
  [/givre|neige|glace|chapka|cache-oreilles|fourr|nuage-orage|patins|raquettes/, "gel"],
  [/flamb|torche|lanterne|forgeron|candelabre|dragon|citrouille|soleil|ecarlate|flammes/, "brule"],
  [/marteau|masse|gourdin|poele|rouleau|fleau|louche|tambour|jambon|seau|marmite|sabots|pelle|balai|baton|sucre-orge|cone/, "assomme"],
  [/lance|javelot|arc$|arbalete|fronde|fourche|trident|fourchette|hallebarde|canne-peche|rateau|entonnoir|pointe/, "perce"],
  [/epee|dague|coutelas|hache|sabre|faux|tricorne|eperons/, "saigne"],
  [/clout|ecailles|armure-os|bois-cerf|herisson|couronne-fleurs|nid-oiseau|apiculteur|criniere|crete/, "epines"],
  [/bouclier|rondache|casque|heaume|cotte|plastron|cuirasse|brigandine|gambison|jambieres|cuissards|bottes-fer|bottes-bronze|couvercle|passoire|tonneau|gilet-sauvetage|parapluie|bocal/, "rempart"],
  [/cor-guerre|clairon|cornemuse|drapeau|talkie|maillot-clan|cape-chef|plumet|bottes-cavalier|bottes-armee|guetres|chaussures-marche|jumelles/, "elan"],
  [/baguette|saucisson|chou|pasteque|toque$|calot|tablier-boulanger|gamelle|poulet|oie|chat$|pantoufles|bonnet-nuit|pull|laine|pot-fleurs|jupe-paille|fleurs|poncho/, "regal"],
  [/fete|papier|perruque|abat-jour|haut-de-forme|jabot|brodee|teinturier|etoilee|galons|bouffant|losanges|bicolores|boucle|canotier|melon|slip|calecon/, "ardeur"],
  [/loup|ours$|-peau|pagne|kilt|guerre|masque-bois|barrette|rapiecees|trouees|veste-kaki|casque-armee|bleu-travail|tue-mouche|epee-bois/, "rage"],
  [/sandales|espadrilles|mocassins|chaussons|plumes|ressorts|poulaines|bandeau|foulard|courtes|retroussees|lin$|beret|casquette|bob|capuche|cape|pelerine|marin|pecheur|pluie/, "vif"],
  [/hache-double|marteau-guerre|sabots-bois|manteau-fourrure/, "lourd"],
];
const PAR_DEFAUT: Readonly<Record<EmplacementDuDuel, readonly MotCle[]>> = { arme: ["perce", "assomme"], tete: ["rage", "rempart"], haut: ["rempart", "epines"], pieds: ["vif", "ardeur"], bas: ["regal", "ardeur"] };
/** Sur une carte qui ne cogne pas, le thème se traduit. */
const SANS_COUP: Partial<Record<MotCle, MotCle>> = { assomme: "rempart", saigne: "epines", perce: "vif" };
const SANS_CHIFFRE: ReadonlySet<MotCle> = new Set(["vif", "lourd"]);
/** La brûlure passe la garde : elle reste à 1 hors des cartes uniques. */
const DOUX: ReadonlySet<MotCle> = new Set(["brule"]);

/** Les familles des panoplies, lues dans les noms ; les tenues divines par la liste de leurs pièces. */
const FAMILLES: Readonly<Record<IdDePanoplie, RegExp | readonly string[]>> = {
  forge: /forgeron|bleu-travail|bottes-fer|torche|marteau-guerre/,
  mer: /pecheur|marin|canne-peche|trident|tricorne|gilet-sauvetage|bocal|bottes-pluie|chapeau-pluie|pelerine-pluie/,
  cuisine: /boulanger|toque$|baguette|rouleau|poele|louche|marmite|passoire|jambon|saucisson|fourchette|gamelle/,
  armee: /armee|kaki|talkie|pelle-tranchee|jumelles|gamelle|casque-nasal/,
  neige: /chapka|fourr|neige|glace|givre|cache-oreilles|pompon/,
  bronze: /bronze/,
  fer: /^casque$|heaume$|cotte-mailles|plastron-fer|jambieres-fer|bottes-fer|^epee$|bouclier-umbo|brigandine/,
  fete: /fete|papier|sucre-orge|citrouille|deguisement|costume-poulet/,
  plumes: /plumes|paon|plume-or|panache|plumet/,
  fanfare: /cor-guerre|clairon|tambour|cornemuse|drapeau|maillot-clan|carnyx|etendard|harpe/,
  sauvage: /loup|ours$|-peau|pagne-fourrure|bois-cerf|criniere/,
  or: /-or$|^torque-or|doree|^bottes-or|^casque-or|^epee-or|braies-or|jupe-guerre-or|bouclier-or/,
  introuvable: ["tete-introuvable", "torse-en-chargement", "braies-sans-texture", "bottes-sans-texture", "panneau-d-erreur"],
  vache: ["soucoupe-curieuse", "costume-de-vache", "braies-de-vache", "sabots-de-vache", "pancarte-par-ici"],
  atomique: ["champignon-atomique", "combinaison-jaune", "braies-etanches", "bottes-de-decontamination", "gros-bouton-rouge"],
  fusee: ["ogive", "fuselage", "ailerons", "tuyeres", "telecommande-de-tir"],
};

/** Les légendaires, les divins et l'objet de chaque saison : un effet unique chacun, écrit à la main. */
const UNIQUES: Readonly<Record<string, readonly [string, readonly MotDeCarte[]]>> = {
  // légendaires, tête
  "casque-or": ["Éclat d'or", [["rempart", 2], ["assomme", 1]]],
  couronne: ["Autorité", [["voleElan"], ["ardeur", 1]]],
  "couronne-moissons": ["Moisson", [["regal", 3]]],
  "chapeau-panache": ["Panache", [["vif"], ["elan", 2]]],
  "casque-apparat": ["Parade", [["muraille"]]],
  "candelabre-or": ["Sept flammes", [["brule", 3]]],
  "heaume-couronne": ["Roi de fer", [["lourd"], ["rempart", 2]]],
  // légendaires, haut
  "torque-or": ["Torque du chef", [["plein"]]],
  "chemise-fil-or": ["Fil d'or", [["vif"], ["regal", 2]]],
  "gilet-brocart": ["Brocart", [["ardeur", 2], ["elan", 2]]],
  "armure-doree": ["Ciselures", [["epines", 3]]],
  "manteau-hermine": ["Hermine", [["purge"], ["regal", 2], ["gel", 1]]],
  "armure-dragon": ["Souffle du dragon", [["brule", 2], ["epines", 2]]],
  // légendaires, bas
  "braies-or": ["Second souffle", [["vif"], ["ardeur", 1]]],
  "jupe-guerre-or": ["Pas de guerre", [["elan", 3]]],
  "braies-royales": ["Repos royal", [["reveil"]]],
  // légendaires, pieds
  "bottes-or": ["Foulée d'or", [["vif"], ["ardeur", 1]]],
  "bottes-couronnees": ["Marche du roi", [["antiFatigue"], ["regal", 1]]],
  "bottes-soleil": ["Zénith", [["brule", 2], ["vif"]]],
  // légendaires, arme
  "epee-or": ["Lame du chef", [["perce", 3], ["saigne", 2]]],
  carnyx: ["Appel du carnyx", [["reveil"], ["elan", 2]]],
  "lance-ceremonie": ["Estoc d'apparat", [["inarretable"]]],
  etendard: ["Ralliement", [["plein"], ["elan", 2]]],
  "bouclier-or-cisele": ["Mur d'or", [["muraille"], ["epines", 2]]],
  "harpe-or": ["Berceuse", [["gel", 1], ["regal", 2]]],
  "pelle-tarte-or": ["Part du chef", [["vampire"]]],
  "sceptre-bois-flotte": ["Marée", [["assomme", 3]]],
  "plume-or": ["Trait de plume", [["infatigable"]]],
  // légendaire de saison, saison 1 (le pass, du 17 novembre au 28 décembre 2026) : la glace et le soleil du solstice.
  // Proposition de la session du moteur, le 22 novembre 2026 ; à changer si le pilote le demande.
  "couronne-solstice": ["Solstice", [["gel", 1], ["brule", 1]]],
  // divins : l'introuvable
  "tete-introuvable": ["Erreur 404", [["gel", 2], ["assomme", 2]]],
  "torse-en-chargement": ["Chargement", [["elan", 4]]],
  "braies-sans-texture": ["Sans texture", [["purge"], ["regal", 4]]],
  "bottes-sans-texture": ["Passe-muraille", [["vif"], ["ardeur", 2], ["regal", 2]]],
  "panneau-d-erreur": ["Plantage", [["inarretable"], ["assomme", 2]]],
  // divins : la vache
  "soucoupe-curieuse": ["Enlèvement", [["voleElan"], ["assomme", 2]]],
  "costume-de-vache": ["Cuir épais", [["epines", 1], ["regal", 2]]],
  "braies-de-vache": ["Lait frais", [["regal", 5]]],
  "sabots-de-vache": ["Ruade", [["brule", 4]]],
  "pancarte-par-ici": ["Par ici", [["perce", 4], ["gel", 1]]],
  // divins : l'atomique
  "champignon-atomique": ["Retombées", [["brule", 4], ["assomme", 2]]],
  "combinaison-jaune": ["Étanche", [["purge"], ["antiFatigue"], ["epines", 2]]],
  "braies-etanches": ["Sas", [["antiFatigue"], ["regal", 4], ["vif"]]],
  "bottes-de-decontamination": ["Douche", [["purge"], ["plein"], ["regal", 2]]],
  "gros-bouton-rouge": ["Ne pas appuyer", [["lourd"], ["brule", 3]]],
  // divins : la fusée
  ogive: ["Pointe", [["inarretable"]]],
  fuselage: ["Blindage", [["muraille"], ["epines", 3]]],
  ailerons: ["Stabilité", [["reveil"], ["regal", 3]]],
  tuyeres: ["Poussée", [["vif"], ["ardeur", 1]]],
  "telecommande-de-tir": ["Mise à feu", [["execute", 4], ["vif"]]],
};

/** Les raretés qui demandent un effet écrit à la main. */
const RARETES_UNIQUES: ReadonlySet<RareteDuDuel> = new Set(["legendaire", "saison", "divin"]);

export interface CatalogueFabrique {
  cartes: Record<string, FicheDeCarte>;
  pieces: Record<IdDePanoplie, string[]>;
  /** Le nombre de cartes qui portent chaque mot-clé. */
  compte: Partial<Record<MotCle, number>>;
}

/** Le catalogue tiré des objets du dépôt. Lève une erreur si un objet unique n'a pas son effet ou si un mot-clé est mal placé. */
export function fabriquerLeCatalogue(): CatalogueFabrique {
  const cartes: Record<string, FicheDeCarte> = {}, compte: Partial<Record<MotCle, number>> = {}, sansUnique: string[] = [];
  for (const e of EMPLACEMENTS_DU_DUEL) {
    for (const [id, o] of Object.entries(OBJETS[e])) {
      if (!o.dessin) continue;
      if (Object.hasOwn(cartes, id)) throw new Error(`deux objets « ${id} »`);
      const r: RareteDuDuel = o.gratuit ? "base" : (o.rarete ?? "commun"), coup = e === "arme" || e === "tete";
      const fiche: { e: EmplacementDuDuel; r: RareteDuDuel; p?: IdDePanoplie; u?: string; m?: readonly MotDeCarte[] } = { e, r };
      const pan = ORDRE_DES_PANOPLIES.find((k) => {
        const f = FAMILLES[k];
        return f instanceof RegExp ? f.test(id) && r !== "divin" : f.includes(id);
      });
      if (pan) fiche.p = pan;
      const unique = UNIQUES[id];
      if (unique) {
        fiche.u = unique[0];
        fiche.m = unique[1];
      } else if (RARETES_UNIQUES.has(r)) sansUnique.push(id);
      else if (r !== "base") {
        const themes = THEMES.filter(([re]) => re.test(id)).map(([, m]) => m);
        let mots = [...themes, ...PAR_DEFAUT[e]].map((m) => (!coup && SANS_COUP[m]) || m).filter((m) => !(m === "elan" && e === "pieds"));
        mots = [...new Set(mots)].slice(0, r === "mystique" ? 2 : 1);
        const n = r === "epique" || r === "mystique" ? 2 : 1;
        fiche.m = mots.map((m, i): MotDeCarte => (SANS_CHIFFRE.has(m) ? [m] : [m, i === 0 && !DOUX.has(m) ? n : 1]));
      }
      for (const [m] of fiche.m ?? []) {
        if (!Object.hasOwn(MOTS, m)) throw new Error(`mot inconnu : ${m}`);
        if (MOTS[m].coup && !coup) throw new Error(`${id} : « ${m} » ne vaut que sur un coup`);
        compte[m] = (compte[m] ?? 0) + 1;
      }
      cartes[id] = fiche;
    }
  }
  if (sansUnique.length) throw new Error(`sans effet unique : ${sansUnique.join(", ")}`);
  for (const id of Object.keys(UNIQUES)) if (!cartes[id]) throw new Error(`effet unique d'un objet inconnu : ${id}`);
  const pieces = Object.fromEntries(ORDRE_DES_PANOPLIES.map((k) => [k, Object.entries(cartes).filter(([, f]) => f.p === k).map(([id]) => id)])) as Record<IdDePanoplie, string[]>;
  for (const k of ORDRE_DES_PANOPLIES) if ((pieces[k]?.length ?? 0) < PANOPLIES[k].pieces) throw new Error(`panoplie sans assez de pièces : ${k}`);
  return { cartes, pieces, compte };
}

/** Le texte de `catalogue.ts`. */
export function texteDuCatalogue(c: CatalogueFabrique): string {
  const lignes = Object.entries(c.cartes).map(([id, f]) => `  ${JSON.stringify(id)}: ${JSON.stringify(f)},`);
  const pieces = Object.entries(c.pieces).map(([k, l]) => `  ${k}: ${JSON.stringify(l)},`);
  return [
    "/**",
    " * Le catalogue des cartes de « Coup pour coup » : une fiche par objet de la garde-robe. Fabriqué par",
    " * `scripts/fabriquer-effets-duel.ts` : ne pas modifier à la main, relancer le script.",
    " *",
    " * `e` l'emplacement, `r` la rareté, `m` les mots-clés [mot, chiffre], `u` le nom de l'effet unique, `p` la panoplie.",
    " */",
    'import type { FicheDeCarte, IdDePanoplie } from "./effets.ts";',
    "",
    "export const CATALOGUE_DU_DUEL: Readonly<Record<string, FicheDeCarte>> = {",
    ...lignes,
    "};",
    "",
    "/** Les pièces de chaque panoplie, dans l'ordre du catalogue. */",
    "export const PIECES_DES_PANOPLIES: Readonly<Record<IdDePanoplie, readonly string[]>> = {",
    ...pieces,
    "};",
    "",
  ].join("\n");
}

export const CHEMIN_DU_CATALOGUE = fileURLToPath(new URL("../supabase/functions/code-discord/duel/catalogue.ts", import.meta.url));

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/fabriquer-effets-duel.ts")) {
  const c = fabriquerLeCatalogue();
  writeFileSync(CHEMIN_DU_CATALOGUE, texteDuCatalogue(c));
  console.log(Object.keys(c.cartes).length, "cartes écrites dans", CHEMIN_DU_CATALOGUE);
  console.log("mots-clés :", Object.entries(c.compte).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).map(([m, n]) => `${m} ${n}`).join(", "));
  console.log("panoplies :", Object.entries(c.pieces).map(([k, l]) => `${k} ${l.length}`).join(", "));
}
