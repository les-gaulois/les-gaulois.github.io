/**
 * L'atelier des cartes : dessine d'avance l'image fixe de chaque finition du rayon « Cartes » (`src/lib/village/cartes.ts`),
 * pour l'annonce des achats sur Discord, où il n'y a pas de navigateur (`src/lib/achats-discord.ts`).
 *   npx tsx scripts/atelier-cartes.ts
 * À relancer après tout changement d'une finition ou de son image fixe (`src/lib/village/cartes-vignette.ts`), puis
 * committer les images. Écrit `src/lib/village/cartes-vignettes/<identifiant>.png`, 48 × 80, une case par pixel : la carte
 * sans le Gaulois, sur le fond marine, avec la finition posée une fois. Un test vérifie qu'aucune ne manque.
 *
 * Le dessin est celui du site : le même code, empaqueté par esbuild (déjà là avec tsx et Astro) et joué dans le Chromium
 * de Playwright. N'envoie rien, ne lit que le dépôt.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { CARTES } from "../src/lib/village/cartes";
import { DOSSIER_DES_VIGNETTES, VIGNETTE_HAUTEUR, VIGNETTE_LARGEUR } from "../src/lib/village/cartes-vignettes";

const paquet = await build({
  stdin: {
    contents: `export { peindreLaVignette } from "./src/lib/village/cartes-vignette"; export { CARTES } from "./src/lib/village/cartes";`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  format: "iife",
  globalName: "atelier",
  write: false,
  logLevel: "silent",
});
const code = paquet.outputFiles[0]?.text;
if (!code) throw new Error("Le dessin des cartes n'a pas pu être empaqueté.");

const navigateur = await chromium.launch();
try {
  const page = await navigateur.newPage();
  await page.setContent("<!doctype html><title>Atelier des cartes</title>");
  await page.addScriptTag({ content: code });
  mkdirSync(DOSSIER_DES_VIGNETTES, { recursive: true });
  for (const { id } of CARTES) {
    const image = await page.evaluate(
      ([finition, largeur, hauteur]) => {
        type Atelier = { peindreLaVignette: (toile: HTMLCanvasElement, finition: unknown, banniere: null) => void; CARTES: { id: string }[] };
        const atelier = (globalThis as unknown as { atelier: Atelier }).atelier;
        const grande = document.createElement("canvas");
        grande.width = largeur * 2;
        grande.height = hauteur * 2;
        atelier.peindreLaVignette(
          grande,
          atelier.CARTES.find((c) => c.id === finition),
          null,
        );
        // Une case sur deux : la finition est dessinée sur 96 × 160, l'image du robot en garde 48 × 80.
        const petite = document.createElement("canvas");
        petite.width = largeur;
        petite.height = hauteur;
        const c = petite.getContext("2d");
        if (!c) return null;
        c.imageSmoothingEnabled = false;
        c.drawImage(grande, 0, 0, largeur, hauteur);
        return petite.toDataURL("image/png");
      },
      [id, VIGNETTE_LARGEUR, VIGNETTE_HAUTEUR] as const,
    );
    if (!image) throw new Error(`La finition ${id} n'a pas pu être dessinée.`);
    writeFileSync(join(DOSSIER_DES_VIGNETTES, `${id}.png`), Buffer.from(image.slice(image.indexOf(",") + 1), "base64"));
  }
  console.log(`${CARTES.length} images de finitions dans ${DOSSIER_DES_VIGNETTES}.`);
} finally {
  await navigateur.close();
}
