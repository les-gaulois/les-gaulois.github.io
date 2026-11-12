/**
 * Dessine l'image d'aperçu de chaque fiche de membre dans public/generated/fiches/<identifiant>.png :
 * c'est elle que Discord montre quand un membre colle le lien de sa fiche. Seuls les membres avec pseudo et stats en ont une,
 * à partir de la liste officielle déjà collectée. Sans liste, rien n'est généré et les fiches gardent l'image du site.
 * Un pseudo que les polices ne savent pas écrire n'arrête jamais la construction : sa fiche garde l'image du site, et le journal le compte.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { clan } from "../config/clan";
import { loadMembers } from "../src/lib/data";
import { ficheCard, ficheFacts } from "../src/lib/fiche-image";
import { GazetteFonts, renderGazetteCard } from "../src/lib/gazette-image";

const out = join("public", "generated", "fiches");
rmSync(out, { recursive: true, force: true });

const list = loadMembers();
if (!list) {
  console.log("Fiches : aucune liste de membres collectée, pas d'image d'aperçu.");
  process.exit(0);
}

const root = process.cwd();
const fonts = new GazetteFonts(root);
mkdirSync(out, { recursive: true });
const started = Date.now();
const todo = list.members.flatMap((member) => {
  const facts = member.publicId ? ficheFacts(list.members, member) : null;
  return facts && member.publicId ? [{ id: member.publicId, facts }] : [];
});
let drawn = 0;
let skipped = 0;
// Huit images à la fois : le dessin attend surtout la bibliothèque d'images, qui sait travailler en parallèle.
const BATCH = 8;
for (let i = 0; i < todo.length; i += BATCH) {
  await Promise.all(
    todo.slice(i, i + BATCH).map(async ({ id, facts }) => {
      try {
        const png = await renderGazetteCard(ficheCard(facts, clan.tag, clan.links.site, list.fetchedAt, fonts.width), fonts, root);
        // Une palette de 256 couleurs, tramée, garde le rendu net malgré les dégradés du fond et divise le poids par plus de deux.
        writeFileSync(join(out, `${id}.png`), await sharp(png).png({ palette: true, compressionLevel: 9 }).toBuffer());
        drawn++;
      } catch (e) {
        // Le pseudo n'est pas écrit dans le journal : il peut contenir n'importe quoi.
        skipped++;
        console.log(`Fiches : une image sautée (${e instanceof Error ? e.message : "erreur inconnue"}), la fiche garde l'image du site.`);
      }
    }),
  );
}
console.log(`Fiches : ${drawn} images d'aperçu${skipped > 0 ? `, ${skipped} sautée(s)` : ""} en ${((Date.now() - started) / 1000).toFixed(1)} s.`);
