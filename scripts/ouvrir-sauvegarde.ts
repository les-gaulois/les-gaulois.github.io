/**
 * Ouvre une sauvegarde chiffrée, téléchargée depuis l'onglet Actions de GitHub (Action « Sauvegarde chiffrée »).
 *   npm run sauvegarde:ouvrir -- chemin/gal-sauvegarde-2026-11-09.bin
 * La phrase de passe est demandée à l'écran, sans s'afficher : à lancer soi-même, dans un terminal, jamais dans une
 * conversation. Le contenu, en clair, va dans .cache/sauvegarde/, que Git ignore. Il contient des données personnelles :
 * l'effacer une fois servi.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { createInterface } from "node:readline";
import { BackupError, open } from "../src/lib/sauvegarde";

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

const file = process.argv[2];
if (!file) {
  console.log("Usage : npm run sauvegarde:ouvrir -- chemin/gal-sauvegarde-AAAA-MM-JJ.bin");
  process.exit(1);
}

try {
  const sealed = readFileSync(file);
  const passphrase = process.env["SAUVEGARDE_CLE"] || (await askHidden("Phrase de passe de la sauvegarde (elle ne s'affiche pas) : "));
  const plain = open(sealed, passphrase);
  const dir = ".cache/sauvegarde";
  mkdirSync(dir, { recursive: true });
  const out = `${dir}/${basename(file).replace(/\.bin$/i, "")}.json`;
  writeFileSync(out, JSON.stringify(JSON.parse(plain.toString("utf8")), null, 2));
  console.log(`Sauvegarde ouverte : ${out}. Ce fichier contient des données personnelles : effacez-le après usage.`);
} catch (e) {
  console.log(e instanceof BackupError ? e.message : `Impossible d'ouvrir la sauvegarde : ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
