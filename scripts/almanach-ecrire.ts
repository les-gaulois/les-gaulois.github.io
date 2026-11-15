/**
 * L'écriture de l'almanach des petits moments du village (src/lib/village/monde/almanach/ecriture.ts) : 650 moments écrits
 * une fois par Claude Fable 5.2, par l'API Message Batches, contrôlés par le code, gardés dans le dépôt. Lancé par
 * l'Action `.github/workflows/almanach.yml`, sur la seule branche `robot/almanach`.
 *   npx tsx scripts/almanach-ecrire.ts            le prochain lot (ou la reprise d'un lot en route), puis les compléments
 *   npx tsx scripts/almanach-ecrire.ts --essai    une seule requête, sans lot, qui affiche les moments et leurs refus, et ne les écrit que dans essai.json
 *   (l'Action fait de même quand config/almanach.json porte "essai": true)
 * Avec ANTHROPIC_API_KEY dans l'environnement, donnée au seul client du SDK officiel (`@anthropic-ai/sdk`), qui ne l'envoie
 * qu'à api.anthropic.com ; sans elle, rien ne part. Le plafond de dépense est dans config/almanach.json. Le journal ne dit
 * que des nombres, des identifiants et des raisons : jamais la clé.
 * Sortie : 0 fait ou rien à faire, 1 rien n'est parti ou une erreur, 2 un lot est encore en route (le relancer le reprend).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { clientDuSdk, ecrireLAlmanach } from "../src/lib/village/monde/almanach/ecriture";

/** L'adresse de l'API, écrite ici : une variable ANTHROPIC_BASE_URL dans l'environnement n'enverrait jamais la clé ailleurs. */
const ANTHROPIC_BASE_URL = "https://api.anthropic.com";

const cle = (process.env["ANTHROPIC_API_KEY"] ?? "").trim();
const essai = process.argv.includes("--essai");

const lire = (chemin: string): string | null => {
  try {
    return readFileSync(chemin, "utf8");
  } catch {
    return null;
  }
};

process.exitCode = await ecrireLAlmanach({
  client: cle === "" ? null : clientDuSdk(new Anthropic({ apiKey: cle, baseURL: ANTHROPIC_BASE_URL })),
  lire,
  ecrire: (chemin, texte) => {
    mkdirSync(dirname(chemin), { recursive: true });
    writeFileSync(chemin, texte);
  },
  maintenant: () => new Date(),
  attendre: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  journal: (ligne) => console.log(ligne),
  essai,
});
