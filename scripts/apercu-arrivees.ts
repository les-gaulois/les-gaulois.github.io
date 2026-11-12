/**
 * Dessine des exemples de l'image de bienvenue du serveur Discord, sans rien envoyer : une image par phrase et par décor,
 * dans test-results/arrivees/ (ignoré par Git).
 *   npm run arrivees:apercu
 *   npm run arrivees:apercu -- "Un nom à essayer" "Un autre"
 * Sans nom donné, des noms d'exemple, inventés : aucun n'est celui d'un membre. Les photos de profil sont des dessins faits ici.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { clan } from "../config/clan";
import { DECORS, drawnName, PHRASES, sentence, stableHash } from "../src/lib/arrivees";
import { renderArrival, WarriorAssets } from "../src/lib/arrivees-image";
import { GazetteFonts } from "../src/lib/gazette-image";

const OUT = join("test-results", "arrivees");
const SAMPLE_NAMES = ["Brennos", "Epona la Rapide", "lug_du_nord", "Sucellos", "[GAL] Taranis", "Belisama", "Un nom très long pour bien voir", "nx"];

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
  const phrases = PHRASES.filter((p) => p.decors.includes(decor));
  for (const [i, phrase] of phrases.entries()) {
    const raw = names[count % names.length] ?? "Brennos";
    const name = drawnName(raw, "gaulois", (char) => fonts.draws(char, "name") && fonts.draws(char, "monoStrong"));
    const seed = stableHash(`${decor}:${i}:${raw}`);
    // Une image sur quatre sans photo : l'initiale du nom la remplace.
    const avatar = count % 4 === 3 ? null : await fakeAvatar(seed);
    const png = await renderArrival({ decor, seed, phrase, name }, clan.links.site, fonts, warrior, avatar);
    const file = join(OUT, `${decor}-${i + 1}.png`);
    writeFileSync(file, png);
    console.log(`${file} · ${Math.round(png.length / 1024)} Ko · ${sentence(phrase, name)}`);
    count++;
  }
}
console.log(`${count} images dans ${OUT}.`);
