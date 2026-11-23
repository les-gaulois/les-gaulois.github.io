/**
 * Après la construction, chaque page de `dist/` annonce en tête tous les modules qu'elle demandera tout de suite, pour
 * qu'ils partent ensemble (règles et raison dans `src/lib/precharge-modules.ts`).
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { ajouterPrechargements, entreesDeLaPage, modulesAPrecharger } from "../lib/precharge-modules";

function pagesDe(dossier: string): string[] {
  const pages: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) pages.push(...pagesDe(chemin));
    else if (nom.endsWith(".html")) pages.push(chemin);
  }
  return pages;
}

export default function prechargeDesModules(): AstroIntegration {
  let base = "/";
  return {
    name: "gal-precharge-des-modules",
    hooks: {
      "astro:config:done": ({ config }) => {
        base = config.base.endsWith("/") ? config.base : `${config.base}/`;
      },
      "astro:build:done": ({ dir, logger }) => {
        const racine = fileURLToPath(dir);
        const sources = new Map<string, string | null>();
        const lire = (adresse: string): string | null => {
          if (!sources.has(adresse)) {
            let source: string | null = null;
            if (adresse.startsWith(base) && /\.m?js$/.test(adresse)) {
              const fichier = join(racine, ...decodeURIComponent(adresse.slice(base.length)).split("/"));
              if (existsSync(fichier)) source = readFileSync(fichier, "utf8");
            }
            sources.set(adresse, source);
          }
          return sources.get(adresse) ?? null;
        };
        let pages = 0;
        let liens = 0;
        for (const fichier of pagesDe(racine)) {
          const html = readFileSync(fichier, "utf8");
          const modules = modulesAPrecharger(entreesDeLaPage(html), lire);
          const nouveau = ajouterPrechargements(html, modules);
          if (nouveau === html) continue;
          writeFileSync(fichier, nouveau);
          pages += 1;
          liens += modules.length;
        }
        logger.info(`${pages} pages annoncent leurs modules (${liens} préchargements).`);
      },
    },
  };
}
