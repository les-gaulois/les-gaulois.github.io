/**
 * Copie les films des parties que garde le cache du workflow (`.cache/films/`, écrits par `scripts/filmer-parties.ts`) dans
 * `public/films/`, que le build publie avec le site, et écrit leur liste (`public/films/liste.json`), que lisent les pages
 * « Revoir une partie » et « Dernières parties ». Seuls les films de l'index sont publiés : l'index tient le budget de place et
 * l'âge des films. Chaque film est relu comme la page le relira avant d'être copié : un fichier illisible, d'une autre partie
 * ou trop lourd reste dehors. Lancé par le job « build » de `.github/workflows/site.yml`, avant `npm run build`. Sans films
 * (sur un ordinateur, ou cache perdu) : la page le dit, et le site se construit quand même.
 *   npm run films:publier
 */
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { loadLeaderboard, loadMembers } from "../src/lib/data";
import { MAX_OCTETS_FICHE } from "../src/lib/rejeu-openfront";
import { lireFilm, secondesDeLImage } from "../src/lib/rejeu/film";
import { adresseDuLecteur, DOSSIER_DES_DRAPEAUX, DOSSIER_DES_FICHES, DOSSIER_DES_LECTEURS, DOSSIER_SITE_DU_LECTEUR, dossierDuLecteur, drapeauxDeLaFiche, ficheNettoyee, manifesteDuLecteur, noticeDuLecteur, origineDuLecteur, pageDuLecteur, SITE_DU_CLAN, svgRepris } from "../src/lib/rejeu/lecteur-jeu";
import { DOSSIER_FILMS, DOSSIER_PUBLIC_FILMS, INDEX_DES_FILMS, LISTE_DES_FILMS, ListeDesFilms, lireIndex, MAX_OCTETS_FILM, MAX_OCTETS_FILM_DECOMPRESSE, nomDeLaFiche, nomDuFilm, type FilmPublie } from "../src/lib/rejeu/films-index";

/** Posé avec les films : un film téléchargé seul dit d'où vient son terrain et sous quelle licence il reste. */
const LISEZ_MOI = [
  "Films des parties du clan [GAL], rejouées par le robot du site https://les-gaulois.github.io/ (page « Revoir une partie »).",
  "",
  "Chaque fichier .film contient, pour une grille réduite de la carte de la partie, l'octet de terrain des cartes du jeu",
  "OpenFront (resources/maps/<carte>/ du dépôt https://github.com/openfrontio/OpenFrontIO, au commit de la partie),",
  "© OpenFront and Contributors, CC BY-SA 4.0 : https://creativecommons.org/licenses/by-sa/4.0/deed.fr",
  "Modifié par le site du clan depuis le 15 novembre 2026 : terrain réduit (une case sur plusieurs, celle du milieu) et, image",
  "par image, le camp qui tient chaque case pendant la partie, rejouée par le moteur du jeu, ses constructions, navires et",
  "bombes, et des noms posés sur les territoires (pseudos des membres du clan, tags des clans du classement officiel). Ces",
  "données restent sous la même licence.",
  "",
].join("\n");

/**
 * Les noms qu'un film peut encore montrer : le pseudo d'un membre qui est toujours sur la liste du clan, avec ce pseudo, et le
 * tag d'un clan toujours au classement officiel. Un membre parti, ou qui a retiré son pseudo, ne reste pas sur le site : son
 * film n'est pas publié.
 */
const pseudos = new Set((loadMembers()?.members ?? []).map((m) => m.username).filter((u): u is string => Boolean(u)).map((u) => u.replace(/\s+/g, " ").trim().slice(0, 40)));
const tags = new Set(loadLeaderboard()?.clans.map((c) => `[${c.clanTag}]`) ?? []);
const nomEncorePublie = (texte: string) => (texte.startsWith("[") ? tags.has(texte) : pseudos.has(texte));

rmSync(DOSSIER_PUBLIC_FILMS, { recursive: true, force: true });
const indexTexte = existsSync(INDEX_DES_FILMS) ? readFileSync(INDEX_DES_FILMS, "utf8") : null;
if (indexTexte === null) {
  console.log("Films : aucun film dans le cache, la page « Revoir une partie » le dira.");
  process.exit(0);
}
const index = lireIndex(indexTexte);
mkdirSync(DOSSIER_PUBLIC_FILMS, { recursive: true });

/**
 * Copie un dossier en ne prenant que des dossiers et des fichiers ordinaires : un lien symbolique venu du cache pourrait mener
 * ailleurs sur la machine du workflow. Lève une erreur s'il y en a un.
 */
function copierFichiers(source: string, cible: string, garder: (chemin: string) => boolean = () => true, prefixe = "") {
  mkdirSync(cible, { recursive: true });
  for (const nom of readdirSync(source)) {
    const de = join(source, nom);
    const s = lstatSync(de);
    if (s.isDirectory()) copierFichiers(de, join(cible, nom), garder, `${prefixe}${nom}/`);
    else if (!s.isFile()) throw new Error(`fichier inattendu : ${nom}`);
    else if (garder(`${prefixe}${nom}`)) copyFileSync(de, join(cible, nom));
  }
}

/**
 * Les vrais lecteurs du jeu, construits par `scripts/construire-lecteurs.ts`, préparés pour leur site à eux, sur une autre adresse
 * que celle du clan (`REPLAY_SITE`, choix du pilote du 15 novembre 2026 : le code du jeu ne tourne jamais là où les membres ont
 * leur connexion) : une page par version, ses images, les drapeaux des joueurs, les fiches, un `robots.txt` qui refuse les moteurs
 * de recherche. Le job « build » garde ce dossier, le job « lecteur » le dépose sur ce site. Sans `REPLAY_SITE`, rien n'est
 * préparé et chaque partie garde son film.
 */
rmSync(DOSSIER_SITE_DU_LECTEUR, { recursive: true, force: true });
// Sa première place, dans le site du clan, essayée sur un ordinateur le 15 novembre 2026 et jamais publiée : effacée, pour
// qu'un reste ne parte jamais avec le site.
rmSync("public/jeu", { recursive: true, force: true });
const origine = origineDuLecteur(process.env.REPLAY_SITE);
if (process.env.REPLAY_SITE && !origine) console.log("::warning::Films : REPLAY_SITE doit être l'adresse d'un autre site GitHub Pages (comme gal-replay.github.io) : pas de lecteur du jeu.");
const lecteurs = new Set<string>();
for (const commit of origine && existsSync(DOSSIER_DES_LECTEURS) ? readdirSync(DOSSIER_DES_LECTEURS) : []) {
  const source = join(DOSSIER_DES_LECTEURS, commit);
  if (!/^[0-9a-f]{40}$/.test(commit) || !existsSync(join(source, "modele.html")) || !existsSync(join(source, "fichiers.txt"))) continue;
  try {
    if (!lstatSync(join(source, "modele.html")).isFile() || !lstatSync(join(source, "fichiers.txt")).isFile()) throw new Error("fichier inattendu");
    const cible = join(DOSSIER_SITE_DU_LECTEUR, dossierDuLecteur(commit));
    const fichiers = readFileSync(join(source, "fichiers.txt"), "utf8").split("\n").filter(Boolean);
    const page = pageDuLecteur(readFileSync(join(source, "modele.html"), "utf8"), { commit, manifeste: manifesteDuLecteur(fichiers, commit, "/"), apiHost: `/${DOSSIER_DES_FICHES}`.replace(/\/$/, ""), retour: `${SITE_DU_CLAN}/revoir`, notice: "/jeu/LISEZ-MOI.txt" });
    copierFichiers(join(source, "assets"), join(cible, "assets"));
    // Les images du jeu triées de nouveau : un lecteur gardé en cache a pu être construit avant un changement de la règle.
    if (existsSync(join(source, "res"))) copierFichiers(join(source, "res"), join(cible, "res"), svgRepris);
    writeFileSync(join(cible, "index.html"), page);
    lecteurs.add(commit);
  } catch (e) {
    rmSync(join(DOSSIER_SITE_DU_LECTEUR, dossierDuLecteur(commit)), { recursive: true, force: true });
    console.log(`::warning::Films : le lecteur du jeu de la version ${commit.slice(0, 10)} n'est pas préparé (${e instanceof Error ? e.message : String(e)}).`);
  }
}
if (lecteurs.size > 0) {
  writeFileSync(join(DOSSIER_SITE_DU_LECTEUR, "jeu", "LISEZ-MOI.txt"), noticeDuLecteur([...lecteurs]));
  // Les fiches portent les pseudos des parties : rien du site du lecteur n'est indexé.
  writeFileSync(join(DOSSIER_SITE_DU_LECTEUR, "robots.txt"), "User-agent: *\nDisallow: /\n");
}
const drapeaux = new Set<string>();

const films: FilmPublie[] = [];
let refuses = 0;
for (const { partie, commit } of index.films) {
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
    if (!e.noms.every((n) => nomEncorePublie(n.texte))) throw new Error("un nom n'est plus sur la liste du clan ni au classement officiel");
    copyFileSync(chemin, join(DOSSIER_PUBLIC_FILMS, nom));
    // La fiche, pour le vrai lecteur du jeu de sa version, s'il est construit.
    let jeu: string | null = null;
    const nomFiche = nomDeLaFiche(partie);
    if (origine && commit && lecteurs.has(commit) && nomFiche && lstatSync(join(DOSSIER_FILMS, nomFiche), { throwIfNoEntry: false })?.isFile()) {
      const texte = gunzipSync(readFileSync(join(DOSSIER_FILMS, nomFiche)), { maxOutputLength: MAX_OCTETS_FICHE }).toString("utf8");
      const propre = ficheNettoyee(texte, partie);
      const dossier = join(DOSSIER_SITE_DU_LECTEUR, DOSSIER_DES_FICHES, "game", partie);
      mkdirSync(dossier, { recursive: true });
      writeFileSync(join(dossier, "index.html"), propre);
      for (const d of drapeauxDeLaFiche(propre)) drapeaux.add(d);
      jeu = adresseDuLecteur(origine, commit, partie);
    }
    films.push({ partie, debut: e.debut, carte: e.carte, victoire: e.victoire, equipes: e.equipes, gaulois: e.gaulois, joueurs: e.joueurs, secondes: secondesDeLImage(e, e.images - 1), octets: lu.size, jeu });
  } catch (e) {
    refuses++;
    console.log(`::warning::Films : ${nom} n'est pas publié (${e instanceof Error ? e.message : String(e)}).`);
  }
}
// Les drapeaux des joueurs des fiches préparées, et eux seuls (le jeu en a plus de mille).
const sourceDrapeaux = join(DOSSIER_DES_LECTEURS, "drapeaux");
for (const d of drapeaux) {
  const de = join(sourceDrapeaux, d);
  if (!lstatSync(de, { throwIfNoEntry: false })?.isFile()) continue;
  mkdirSync(join(DOSSIER_SITE_DU_LECTEUR, DOSSIER_DES_DRAPEAUX, d, ".."), { recursive: true });
  copyFileSync(de, join(DOSSIER_SITE_DU_LECTEUR, DOSSIER_DES_DRAPEAUX, d));
}
films.sort((a, b) => b.debut.localeCompare(a.debut) || a.partie.localeCompare(b.partie));
const liste = ListeDesFilms.parse({ format: 1, fait: index.passage, films });
writeFileSync(LISTE_DES_FILMS, `${JSON.stringify(liste)}\n`);
writeFileSync(join(DOSSIER_PUBLIC_FILMS, "LISEZ-MOI.txt"), LISEZ_MOI);
console.log(`Films : ${films.length} publiés${refuses > 0 ? `, ${refuses} refusés` : ""}, ${films.filter((f) => f.jeu).length} avec le vrai lecteur du jeu (${lecteurs.size} version${lecteurs.size > 1 ? "s" : ""}).`);
