/**
 * L'atelier de dessin du Gaulois : lire et remplacer les grilles de `supabase/functions/code-discord/gaulois.ts`.
 *
 *   npx tsx scripts/atelier-gaulois/grille.ts montrer <emplacement> <objet>
 *       écrit la grille dans le terminal, avec le numéro de chaque rangée et la règle des colonnes ;
 *       `corps corps` montre le corps nu.
 *   npx tsx scripts/atelier-gaulois/grille.ts poser <fichier.txt>
 *       remplace dans gaulois.ts chaque dessin du fichier, après avoir vérifié sa taille.
 *
 * Le fichier texte : pour chaque dessin, une ligne « @ emplacement objet y=10 x=14 » (la rangée et la colonne de son coin
 * en haut à gauche sur la grille de 48 × 64 ; « x » peut manquer, il vaut alors 0), puis ses rangées, toutes de la même
 * longueur, « . » pour une case vide. Les lignes vides et celles qui commencent par « # » sont ignorées. Le dessin doit
 * déjà exister dans gaulois.ts : pour un nouvel objet, y écrire d'abord une grille d'une rangée, et son entrée au catalogue.
 *
 * Repères du corps (colonnes 0 à 47, rangées 0 à 63) : le crâne commence rangée 10, les sourcils sont rangée 17, les yeux
 * rangées 20 à 22, la tête va des colonnes 10 à 37 ; les épaules rangée 34, les mains rangées 46 à 48 (la droite tient
 * l'arme colonnes 38 et 39) ; les jambes vont des rangées 50 à 61, colonnes 14 à 33. Un haut s'arrête rangée 46, un bas
 * va des rangées 46 à 57, des bottes hautes commencent rangée 53 : c'est ce qui laisse voir les braies. Sous la rangée 49,
 * un bas ou des bottes ne sortent pas des colonnes 14 à 33 avant la rangée 57 : une cape tombe juste à côté.
 *
 * Après chaque changement : `npx tsx scripts/atelier-gaulois/planche.ts`, puis regarder les planches.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const LARGEUR = 48;
export const HAUTEUR = 64;
export const FICHIER = fileURLToPath(new URL("../../supabase/functions/code-discord/gaulois.ts", import.meta.url));

export interface Grille {
  y: number;
  lignes: string[];
}

/** Un dessin d'un fichier texte : où il va, et sa grille. */
export interface Dessin extends Grille {
  emplacement: string;
  objet: string;
}

/** Le texte de gaulois.ts, fins de ligne ramenées à un seul saut : sous Windows, le fichier est écrit avec retour chariot. */
function lireSource(): { texte: string; chariot: boolean } {
  const brut = readFileSync(FICHIER, "utf8");
  return { texte: brut.replaceAll("\r\n", "\n"), chariot: brut.includes("\r\n") };
}

/** Où commence et finit, dans le texte de gaulois.ts, le bloc `{ y, lignes }` d'un dessin. */
function bornes(texte: string, emplacement: string, objet: string): { debut: number; fin: number; retrait: string } {
  const corps = emplacement === "corps";
  const tete = corps ? "const CORPS: Calque = {" : `    "${objet}": {`;
  const depuis = corps ? 0 : texte.indexOf(`\n  ${emplacement}: {\n`, texte.indexOf("const DESSINS = {"));
  const debut = depuis < 0 ? -1 : texte.indexOf(tete, depuis);
  if (debut < 0) throw new Error(`dessin introuvable : ${emplacement} ${objet}`);
  const retrait = corps ? "" : "    ";
  const queue = `\n${retrait}  ],\n${retrait}}`;
  const fin = texte.indexOf(queue, debut);
  if (fin < 0) throw new Error(`fin du dessin introuvable : ${emplacement} ${objet}`);
  return { debut: debut + tete.length - 1, fin: fin + queue.length, retrait };
}

/** La grille d'un dessin, lue dans gaulois.ts. */
export function lireDessin(emplacement: string, objet: string, texte = lireSource().texte): Grille {
  const { debut, fin } = bornes(texte, emplacement, objet);
  const bloc = texte.slice(debut, fin);
  const y = Number(/y: (\d+),/.exec(bloc)?.[1]);
  const lignes = [...bloc.matchAll(/"([^"]+)",/g)].map((m) => m[1] as string);
  if (!Number.isInteger(y) || !lignes.length) throw new Error(`dessin illisible : ${emplacement} ${objet}`);
  return { y, lignes };
}

/** Complète les rangées à 48 cases, retire les rangées vides du haut et du bas, et vérifie la taille. */
export function ranger(grille: Grille): Grille {
  const lignes = grille.lignes.map((ligne) => ligne.padEnd(LARGEUR, "."));
  let y = grille.y;
  while (lignes.length && /^\.+$/.test(lignes[0] ?? "")) {
    lignes.shift();
    y += 1;
  }
  while (lignes.length && /^\.+$/.test(lignes[lignes.length - 1] ?? "")) lignes.pop();
  if (!lignes.length) throw new Error("dessin vide");
  if (lignes.some((ligne) => ligne.length !== LARGEUR)) throw new Error("une rangée dépasse 48 cases");
  if (y < 0 || y + lignes.length > HAUTEUR) throw new Error(`le dessin sort de la grille (rangées ${y} à ${y + lignes.length - 1})`);
  return { y, lignes };
}

/** Remplace des dessins dans gaulois.ts, en une seule écriture. */
export function ecrireDessins(dessins: readonly Dessin[]): void {
  const { texte: source, chariot } = lireSource();
  let texte = source;
  for (const dessin of dessins) {
    const { debut, fin, retrait } = bornes(texte, dessin.emplacement, dessin.objet);
    const { y, lignes } = ranger(dessin);
    const bloc = `{\n${retrait}  y: ${y},\n${retrait}  lignes: [\n${lignes.map((ligne) => `${retrait}    "${ligne}",`).join("\n")}\n${retrait}  ],\n${retrait}}`;
    texte = texte.slice(0, debut) + bloc + texte.slice(fin);
  }
  writeFileSync(FICHIER, chariot ? texte.replaceAll("\n", "\r\n") : texte);
}

/** Les dessins d'un fichier texte (voir l'en-tête). */
export function lireFichier(chemin: string): Dessin[] {
  const dessins: Dessin[] = [];
  let largeur = 0;
  let decalage = 0;
  readFileSync(chemin, "utf8").split(/\r?\n/).forEach((brute, numero) => {
    const ligne = brute.trim();
    if (!ligne || ligne.startsWith("#")) return;
    const tete = /^@\s+(\S+)\s+(\S+)\s+y=(\d+)(?:\s+x=(\d+))?$/.exec(ligne);
    if (tete) {
      dessins.push({ emplacement: tete[1] as string, objet: tete[2] as string, y: Number(tete[3]), lignes: [] });
      decalage = Number(tete[4] ?? 0);
      largeur = 0;
      return;
    }
    const dessin = dessins[dessins.length - 1];
    if (!dessin) throw new Error(`ligne ${numero + 1} : « @ emplacement objet y=… x=… » attendu avant les rangées`);
    largeur ||= ligne.length;
    if (ligne.length !== largeur) throw new Error(`ligne ${numero + 1} (${dessin.objet}) : ${ligne.length} cases au lieu de ${largeur}`);
    dessin.lignes.push(".".repeat(decalage) + ligne);
  });
  return dessins;
}

/** La grille sur 64 rangées entières, pour la retoucher case par case. */
export function etaler(grille: Grille): string[][] {
  const cases = Array.from({ length: HAUTEUR }, () => Array<string>(LARGEUR).fill("."));
  grille.lignes.forEach((ligne, dy) => [...ligne].forEach((lettre, x) => ((cases[grille.y + dy] as string[])[x] = lettre)));
  return cases;
}
export const replier = (cases: readonly string[][]): Grille => ranger({ y: 0, lignes: cases.map((rangee) => rangee.join("")) });

function montrer(grille: Grille): void {
  const regle = Array.from({ length: LARGEUR }, (_, x) => (x % 10 === 0 ? String(x / 10) : String(x % 10))).join("");
  console.log(`    ${regle}`);
  grille.lignes.forEach((ligne, dy) => console.log(`${String(grille.y + dy).padStart(3)} ${ligne}`));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [commande, a, b] = process.argv.slice(2);
  if (commande === "montrer" && a && b) montrer(lireDessin(a, b));
  else if (commande === "poser" && a) {
    const dessins = lireFichier(a);
    ecrireDessins(dessins);
    console.log(`${dessins.length} dessin(s) posé(s) : ${dessins.map((dessin) => dessin.objet).join(", ")}`);
  } else console.log("Usage : grille.ts montrer <emplacement> <objet> | poser <fichier.txt>");
}
