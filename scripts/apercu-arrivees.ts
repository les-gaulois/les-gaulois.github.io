/**
 * Dessine des exemples de l'image de bienvenue du serveur Discord, sans rien envoyer : chaque couleur de l'étendard avec
 * plusieurs phrases, et les seize phrases en tout, dans test-results/arrivees/ (ignoré par Git). Puis l'image du salut du salon
 * général (`general-*.png`), pour chaque nom.
 *   npm run arrivees:apercu
 *   npm run arrivees:apercu -- "Un nom à essayer" "Un autre"
 * Sans nom donné, des noms d'exemple, inventés : aucun n'est celui d'un membre. Les photos de profil sont des dessins faits ici.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { clan } from "../config/clan";
import { DECORS, drawnName, PHRASES, sentence, stableHash } from "../src/lib/arrivees";
import { PALETTES } from "../src/lib/arrivees-decors";
import { GENERAL_TIPS } from "../src/lib/arrivees-general";
import { GENERAL_GAULOIS_MAX, GENERAL_HEIGHT, GENERAL_WIDTH, renderGeneral, type GeneralGaulois } from "../src/lib/arrivees-general-image";
import { renderArrival, WarriorAssets } from "../src/lib/arrivees-image";
import { TENUE_DE_DEPART, tenueAuHasard } from "../src/lib/gaulois";
import { GazetteFonts } from "../src/lib/gazette-image";

const OUT = join("test-results", "arrivees");
const SAMPLE_NAMES = ["Brennos", "Epona la Rapide", "lug_du_nord", "Sucellos", "[GAL] Taranis", "Belisama", "Un nom très long pour bien voir", "nx"];
/** Assez d'images pour que chaque couleur ait plusieurs phrases, et que chaque phrase sorte au moins une fois. */
const PER_DECOR = Math.ceil(PHRASES.length / DECORS.length);

/** Une fausse photo de profil : un dégradé et une forme, différents pour chaque nom. */
async function fakeAvatar(seed: number): Promise<Buffer> {
  const hue = seed % 360;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue} 70% 55%)"/><stop offset="1" stop-color="hsl(${(hue + 70) % 360} 75% 30%)"/></linearGradient></defs>` +
    `<rect width="256" height="256" fill="url(#g)"/><circle cx="128" cy="104" r="46" fill="#fff" fill-opacity="0.85"/>` +
    `<path d="M40 256c0-58 40-92 88-92s88 34 88 92z" fill="#fff" fill-opacity="0.85"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const root = process.cwd();
const fonts = new GazetteFonts(root);
const warrior = new WarriorAssets(root);
const names = process.argv.slice(2).length > 0 ? process.argv.slice(2) : SAMPLE_NAMES;
mkdirSync(OUT, { recursive: true });

let count = 0;
for (const decor of DECORS) {
  console.log(`— ${PALETTES[decor].nom}`);
  for (let i = 0; i < PER_DECOR; i++) {
    const phrase = PHRASES[count % PHRASES.length]!;
    const raw = names[count % names.length] ?? "Brennos";
    const name = drawnName(raw, "gaulois", (char) => fonts.draws(char, "name"));
    // Une image sur quatre sans photo : l'initiale du nom la remplace.
    const avatar = count % 4 === 3 ? null : await fakeAvatar(stableHash(`${decor}:${i}:${raw}`));
    const png = await renderArrival({ decor, phrase, name }, clan.links.site, fonts, warrior, avatar);
    const file = join(OUT, `${decor}-${i + 1}.png`);
    writeFileSync(file, png);
    console.log(`${file} · ${Math.round(png.length / 1024)} Ko · ${sentence(phrase, name)}`);
    count++;
  }
}
console.log(`${count} images dans ${OUT}.`);

// Le salut du salon général : la même image quelle que soit la couleur de l'étendard. Des Gaulois inventés saluent : des
// pseudos d'exemple, des tenues tirées au sort parmi les objets gratuits, toujours les mêmes d'un aperçu à l'autre.
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
const PSEUDOS = ["Luern", "Catumar", "Divico le Vif", "Segomar", "Adiatun", "Un pseudo beaucoup trop long"];
const crowd = (count: number): GeneralGaulois[] => PSEUDOS.slice(0, count).map((nom, i) => ({ nom, tenue: i === 0 ? TENUE_DE_DEPART : tenueAuHasard(seeded(41 + i * 977)) }));

console.log(`— Salon général, ${GENERAL_WIDTH} × ${GENERAL_HEIGHT}, ${GENERAL_GAULOIS_MAX} Gaulois au plus`);
for (const [i, raw] of names.entries()) {
  const name = drawnName(raw, "gaulois", (char) => fonts.draws(char, "name"));
  const decor = DECORS[i % DECORS.length]!;
  const avatar = i % 4 === 3 ? null : await fakeAvatar(stableHash(`general:${raw}`));
  // De cinq Gaulois à aucun, d'une image à la suivante.
  const gaulois = crowd(GENERAL_GAULOIS_MAX - (i % (GENERAL_GAULOIS_MAX + 1)));
  const png = await renderGeneral({ name, decor, tips: GENERAL_TIPS, siteUrl: clan.links.site, gaulois }, fonts, warrior, avatar);
  const file = join(OUT, `general-${i + 1}.png`);
  writeFileSync(file, png);
  // La même, à la largeur où Discord la montre : c'est à cette taille qu'elle se juge.
  writeFileSync(join(OUT, `general-${i + 1}-discord.png`), await sharp(png).resize(550).png().toBuffer());
  console.log(`${file} · ${Math.round(png.length / 1024)} Ko · ${name} · ${gaulois.length} Gaulois`);
}
