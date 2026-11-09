/**
 * Ouvre une sauvegarde chiffrée, téléchargée depuis l'onglet Actions de GitHub (Action « Sauvegarde chiffrée »).
 *   npm run sauvegarde:ouvrir chemin/gal-sauvegarde-2026-11-09.bin
 *   npm run sauvegarde:verifier chemin/gal-sauvegarde-2026-11-09.bin
 * La phrase de passe est demandée à l'écran, sans s'afficher : à lancer soi-même, dans un terminal, jamais dans une
 * conversation. Pour ouvrir, le contenu en clair va dans .cache/sauvegarde/, que Git ignore. Il contient des données
 * personnelles : l'effacer une fois servi. Pour vérifier (--verifier), rien n'est écrit : seul le nombre de lignes de
 * chaque table s'affiche, preuve que la phrase ouvre bien le fichier.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { createInterface } from "node:readline";
import { BackupError, backupSummary, open } from "../src/lib/sauvegarde";

/**
 * Lit une ligne sans l'afficher. Hors terminal (entrée redirigée, ou fenêtre comme Git Bash que node ne reconnaît pas),
 * pose la question sur la sortie d'erreur et prend la première ligne reçue, sans attendre la fin de l'entrée.
 */
async function askHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    process.stderr.write(question);
    const lines = createInterface({ input: stdin, terminal: false });
    const line = await new Promise<string>((resolve) => {
      lines.once("line", resolve);
      lines.once("close", () => resolve(""));
    });
    lines.close();
    return line;
  }
  process.stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve) => {
    let value = "";
    const done = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      process.stdout.write("\n");
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          done();
          resolve(value);
          return;
        }
        // Ctrl+C : on s'arrête sans rien ouvrir.
        if (char === "\u0003") {
          done();
          process.exit(130);
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on("data", onData);
  });
}

const args = process.argv.slice(2);
const verifyOnly = args.includes("--verifier");
const file = args.find((arg) => !arg.startsWith("--"));
if (!file) {
  console.log("Usage : npm run sauvegarde:ouvrir chemin/gal-sauvegarde-AAAA-MM-JJ.bin, ou npm run sauvegarde:verifier chemin/… pour vérifier sans rien écrire.");
  process.exit(1);
}

try {
  const sealed = readFileSync(file);
  const passphrase = process.env["SAUVEGARDE_CLE"] || (await askHidden("Phrase de passe de la sauvegarde (elle ne s'affiche pas) : "));
  const content: unknown = JSON.parse(open(sealed, passphrase).toString("utf8"));
  if (verifyOnly) {
    console.log(`La phrase ouvre bien cette sauvegarde. Lignes : ${backupSummary(content)}. Rien n'a été écrit sur le disque.`);
  } else {
    const dir = ".cache/sauvegarde";
    mkdirSync(dir, { recursive: true });
    const out = `${dir}/${basename(file).replace(/\.bin$/i, "")}.json`;
    writeFileSync(out, JSON.stringify(content, null, 2));
    console.log(`Sauvegarde ouverte : ${out}. Ce fichier contient des données personnelles : effacez-le après usage.`);
  }
} catch (e) {
  if ((e as NodeJS.ErrnoException).code === "ENOENT") console.log(`Fichier introuvable : ${file}. Le .bin se trouve dans le .zip téléchargé : décompressez-le d'abord.`);
  else console.log(e instanceof BackupError ? e.message : `Impossible d'ouvrir la sauvegarde : ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
