/**
 * L'atelier de l'image d'une victoire en duel (`supabase/functions/code-discord/duel-image.ts` pour la scène,
 * `src/lib/duels-image.ts` pour l'image que poste le robot) : la dessiner comme Discord la reçoit, sans rien envoyer.
 *
 *   npx tsx scripts/atelier-gaulois/duels.ts              les sept cas d'exemple
 *   npx tsx scripts/atelier-gaulois/duels.ts bannieres    le premier cas devant chaque bannière
 *   npx tsx scripts/atelier-gaulois/duels.ts familiers    chaque familier, une fois de chaque côté
 *   npx tsx scripts/atelier-gaulois/duels.ts cas un/dossier
 *
 * Les images vont dans `.cache/atelier-duels/` (ignoré par Git) : `<cas>.png` à 1 200 pixels de large (la taille envoyée),
 * `<cas>-550.png` comme Discord la montre, et `planche-<mode>.png`, toutes les images du mode côte à côte à 550 pixels.
 * Les exemples posent de vrais dessins du catalogue sous des pseudos inventés, qui ne sont pas ceux de membres ; chaque image
 * porte l'étiquette « EXEMPLE », qui ne fait pas partie du dessin envoyé. Le terminal écrit le format de chaque image ; le
 * code de sortie est 1 si une image sort du format des images du robot (au moins 1,55 fois plus large que haute).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { BANNIERES } from "../../supabase/functions/code-discord/bannieres/index";
import { FAMILIERS } from "../../supabase/functions/code-discord/familiers/index";
import { TENUE_DE_DEPART, tenueAuHasard, type Tenue } from "../../supabase/functions/code-discord/gaulois";
import { duelCard, renderDuelCard, SCENE_Y } from "../../src/lib/duels-image";
import type { VictoireEnDuel } from "../../src/lib/duels-discord";
import { GazetteFonts } from "../../src/lib/gazette-image";

const mode = process.argv[2] ?? "cas";
const OUT = process.argv[3] ?? join(".cache", "atelier-duels");
const DISCORD = 550;

/** Un tirage fixe : les mêmes tenues à chaque passage. */
const graine = (n: number) => () => (n = (n * 1664525 + 1013904223) >>> 0) / 4294967296;
const hasard = (n: number): Tenue => tenueAuHasard(graine(n));
const LE = "2026-11-22T20:05:00.000Z";

const BRENNOS = { pseudo: "Brennos", tenue: { ...hasard(7), tete: "casque-or", haut: "cape-chef", arme: "epee-bronze" }, familier: "ecureuil-roux" };
const SUCELLOS = { pseudo: "Sucellos", tenue: { ...hasard(21), haut: "tunique-teinturier", arme: "masse" }, familier: "herisson-des-haies" };

/** Les sept cas : misé, sans mise, sans carte décisive, pseudo long contre « Un Gaulois », Gaulois uniques, bannière chargée, sans bannière. */
const CAS: [string, VictoireEnDuel][] = [
  ["1-mise", { id: 1, le: LE, manches: 7, salle: 250, carte: { emplacement: "tete", objet: "casque-or" }, lieu: "cerisiers-en-fleurs", vainqueur: BRENNOS, vaincu: SUCELLOS }],
  [
    "2-sans-mise",
    {
      id: 2,
      le: LE,
      manches: 5,
      salle: null,
      carte: { emplacement: "arme", objet: "trident" },
      lieu: "foret-doree",
      vainqueur: { pseudo: "Epona la Rapide", tenue: { ...hasard(3), arme: "trident", bas: "jupe-plumes" }, familier: null },
      vaincu: { pseudo: "lug_du_nord", tenue: { ...TENUE_DE_DEPART, tete: "tricorne" }, familier: "chat-tigre" },
    },
  ],
  [
    "3-sans-carte",
    {
      id: 3,
      le: LE,
      manches: 12,
      salle: 50,
      carte: null,
      lieu: "banquise-du-nord",
      vainqueur: { pseudo: "Belisama", tenue: { ...hasard(11), haut: "manteau-plumes" }, familier: "chouette-effraie" },
      vaincu: { pseudo: "Taranis.0815", tenue: { ...hasard(5), bas: "tonneau", arme: "cornemuse" }, familier: null },
    },
  ],
  [
    "4-pseudo-long",
    {
      id: 4,
      le: LE,
      manches: 9,
      salle: 1000,
      carte: { emplacement: "arme", objet: "lance-ceremonie" },
      lieu: "port-au-couchant",
      vainqueur: { pseudo: "Vercingetorix_le_Tres_Grand_0815", tenue: { ...hasard(14), arme: "lance-ceremonie", tete: "chapeau-panache" }, familier: "renardeau-roux" },
      vaincu: { pseudo: null, tenue: hasard(2), familier: "poule-rousse" },
    },
  ],
  [
    "5-unique",
    {
      id: 5,
      le: LE,
      manches: 4,
      salle: 500,
      carte: { emplacement: "arme", objet: "gros-bouton-rouge" },
      lieu: "grotte-aux-cristaux",
      vainqueur: { pseudo: "Capitaine Barbe", tenue: { ...hasard(9), modele: "dragon", arme: "gros-bouton-rouge" }, familier: "canard-dore-couronne" },
      vaincu: { pseudo: "Ogmios", tenue: { ...hasard(4), modele: "squelette", arme: "bouclier-or-cisele" }, familier: "cerf-blanc" },
    },
  ],
  [
    "6-banniere",
    {
      id: 6,
      le: LE,
      manches: 6,
      salle: 100,
      carte: { emplacement: "haut", objet: "armure-dragon" },
      lieu: "arbre-de-foudre",
      vainqueur: { pseudo: "Rosmerta", tenue: { ...hasard(17), haut: "armure-dragon", tete: "couronne-givre" }, familier: "phenix" },
      vaincu: { pseudo: "Esus", tenue: { ...hasard(8), arme: "etendard" }, familier: "blaireau" },
    },
  ],
  ["7-sans-banniere", { id: 7, le: LE, manches: 3, salle: 25, carte: { emplacement: "pieds", objet: "bottes-ressorts" }, lieu: null, vainqueur: BRENNOS, vaincu: SUCELLOS }],
];

function lesCas(): [string, VictoireEnDuel][] {
  const base = CAS[0]![1];
  if (mode === "bannieres") return BANNIERES.map((b) => [`banniere-${b.id}`, { ...base, lieu: b.id }]);
  if (mode === "familiers") {
    return FAMILIERS.map((f, i) => [`familier-${f.id}`, { ...base, vainqueur: { ...base.vainqueur, familier: i % 2 === 0 ? f.id : null }, vaincu: { ...base.vaincu, familier: i % 2 === 1 ? f.id : null } }]);
  }
  return CAS;
}

/** L'étiquette des exemples, en haut à droite de la scène, sur le mur des coulisses : elle n'est pas dans l'image envoyée. */
const etiquette = (largeur: number) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="40"><rect width="150" height="40" fill="#D4132F"/><text x="75" y="28" font-family="Consolas, 'DejaVu Sans Mono', monospace" font-weight="700" font-size="22" fill="#FFFFFF" text-anchor="middle" letter-spacing="1">EXEMPLE</text></svg>`;
  return { input: Buffer.from(svg), left: largeur - 36 - 8 - 150, top: SCENE_Y + 8 };
};

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const root = process.cwd();
  const fonts = new GazetteFonts(root);
  const petites: Buffer[] = [];
  let faute = false;
  for (const [nom, victoire] of lesCas()) {
    const card = duelCard(victoire, fonts.width, (char) => fonts.draws(char, "strong"));
    const png = await sharp(await renderDuelCard(card, fonts, root))
      .composite([etiquette(card.width)])
      .png()
      .toBuffer();
    const petite = await sharp(png).resize({ width: DISCORD }).png().toBuffer();
    if (mode === "cas") {
      writeFileSync(join(OUT, `${nom}.png`), png);
      writeFileSync(join(OUT, `${nom}-${DISCORD}.png`), petite);
    }
    petites.push(petite);
    const rapport = card.width / card.height;
    if (rapport < 1.55) faute = true;
    console.log(`${nom} : ${card.width} × ${card.height} (${rapport.toFixed(3)})${rapport < 1.55 ? " : FAUTE, moins de 1,55 fois plus large que haute" : ""}`);
  }
  // La planche : deux images par rangée, à la taille de Discord.
  const meta = await sharp(petites[0]!).metadata();
  const [l, h, ecart] = [DISCORD, meta.height ?? 350, 10];
  const colonnes = 2;
  const rangees = Math.ceil(petites.length / colonnes);
  const planche = await sharp({ create: { width: colonnes * l + (colonnes + 1) * ecart, height: rangees * h + (rangees + 1) * ecart, channels: 4, background: "#20263a" } })
    .composite(petites.map((input, i) => ({ input, left: ecart + (i % colonnes) * (l + ecart), top: ecart + Math.floor(i / colonnes) * (h + ecart) })))
    .png()
    .toBuffer();
  writeFileSync(join(OUT, `planche-${mode}.png`), planche);
  console.log(`Images dans ${OUT}`);
  if (faute) process.exitCode = 1;
}

await main();
