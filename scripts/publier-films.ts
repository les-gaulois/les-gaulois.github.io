/**
 * Copie les films des parties que garde le cache du workflow (`.cache/films/`, écrits par `scripts/filmer-parties.ts`) dans
 * `public/films/`, que le build publie avec le site, et écrit leur liste (`public/films/liste.json`), que lisent les pages
 * « Revoir une partie » et « Dernières parties ». Seuls les films de l'index sont publiés : l'index tient le budget de place et
 * l'âge des films. Chaque film est relu comme la page le relira avant d'être copié : un fichier illisible, d'une autre partie
 * ou trop lourd reste dehors. Lancé par le job « build » de `.github/workflows/site.yml`, avant `npm run build`. Sans films
 * (sur un ordinateur, ou cache perdu) : la page le dit, et le site se construit quand même.
 *   npm run films:publier
 */
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { lireFilm, secondesDeLImage } from "../src/lib/rejeu/film";
import { DOSSIER_FILMS, DOSSIER_PUBLIC_FILMS, INDEX_DES_FILMS, LISTE_DES_FILMS, ListeDesFilms, lireIndex, MAX_OCTETS_FILM, MAX_OCTETS_FILM_DECOMPRESSE, nomDuFilm, type FilmPublie } from "../src/lib/rejeu/films-index";

/** Posé avec les films : un film téléchargé seul dit d'où vient son terrain et sous quelle licence il reste. */
const LISEZ_MOI = [
  "Films des parties du clan [GAL], rejouées par le robot du site https://les-gaulois.github.io/ (page « Revoir une partie »).",
  "",
  "Chaque fichier .film contient, pour une grille réduite de la carte de la partie, l'octet de terrain des cartes du jeu",
  "OpenFront (resources/maps/<carte>/ du dépôt https://github.com/openfrontio/OpenFrontIO, au commit de la partie),",
  "© OpenFront and Contributors, CC BY-SA 4.0 : https://creativecommons.org/licenses/by-sa/4.0/deed.fr",
  "Modifié par le site du clan depuis le 15 novembre 2026 : terrain réduit (une case sur plusieurs, celle du milieu) et, image",
  "par image, le camp qui tient chaque case pendant la partie, rejouée par le moteur du jeu. Ces données restent sous la même",
  "licence.",
  "",
].join("\n");

rmSync(DOSSIER_PUBLIC_FILMS, { recursive: true, force: true });
const indexTexte = existsSync(INDEX_DES_FILMS) ? readFileSync(INDEX_DES_FILMS, "utf8") : null;
if (indexTexte === null) {
  console.log("Films : aucun film dans le cache, la page « Revoir une partie » le dira.");
  process.exit(0);
}
const index = lireIndex(indexTexte);
mkdirSync(DOSSIER_PUBLIC_FILMS, { recursive: true });

const films: FilmPublie[] = [];
let refuses = 0;
for (const { partie } of index.films) {
  const nom = nomDuFilm(partie);
  if (!nom) continue;
  const chemin = join(DOSSIER_FILMS, nom);
  try {
    const lu = lstatSync(chemin, { throwIfNoEntry: false });
    if (!lu || !lu.isFile()) throw new Error("fichier absent");
    if (lu.size > MAX_OCTETS_FILM) throw new Error("trop lourd");
    const film = lireFilm(gunzipSync(readFileSync(chemin), { maxOutputLength: MAX_OCTETS_FILM_DECOMPRESSE }));
    const e = film.entete;
    if (e.partie !== partie) throw new Error("film d'une autre partie");
    copyFileSync(chemin, join(DOSSIER_PUBLIC_FILMS, nom));
    films.push({ partie, debut: e.debut, carte: e.carte, victoire: e.victoire, equipes: e.equipes, gaulois: e.gaulois, joueurs: e.joueurs, secondes: secondesDeLImage(e, e.images - 1), octets: lu.size });
  } catch (e) {
    refuses++;
    console.log(`::warning::Films : ${nom} n'est pas publié (${e instanceof Error ? e.message : String(e)}).`);
  }
}
films.sort((a, b) => b.debut.localeCompare(a.debut) || a.partie.localeCompare(b.partie));
const liste = ListeDesFilms.parse({ format: 1, fait: index.passage, films });
writeFileSync(LISTE_DES_FILMS, `${JSON.stringify(liste)}\n`);
writeFileSync(join(DOSSIER_PUBLIC_FILMS, "LISEZ-MOI.txt"), LISEZ_MOI);
console.log(`Films : ${films.length} publiés${refuses > 0 ? `, ${refuses} refusés` : ""}.`);
