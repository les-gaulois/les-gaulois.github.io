/**
 * Relit les films des parties que garde le cache du workflow (`.cache/films/`, écrits par `scripts/filmer-parties.ts`) et écrit
 * leur liste (`public/films/liste.json`), que lisent au build les pages « Revoir une partie » et « Dernières parties ». Les films
 * eux-mêmes ne sont plus publiés depuis le 16 novembre 2026 (le pilote : « je veux plus de film mais uniquement le replay ») :
 * ils restent la matière des faits de chaque partie et de la forme de sa carte. Seuls les films de l'index sont pris : l'index
 * tient le budget de place et l'âge des films. Chaque film est relu : un fichier illisible, d'une autre partie ou trop lourd
 * reste dehors. Lancé par le job « build » de `.github/workflows/site.yml`, avant `npm run build`. Sans films
 * (sur un ordinateur, ou cache perdu) : la page le dit, et le site se construit quand même.
 *   npm run films:publier
 */
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { loadLeaderboard, loadMembers } from "../src/lib/data";
import { MAX_OCTETS_FICHE } from "../src/lib/rejeu-openfront";
import { bilanPublie, lireBilan } from "../src/lib/rejeu/bilan";
import { journalPublie, lireJournal } from "../src/lib/rejeu/journal";
import { lireFilm, secondesDeLImage } from "../src/lib/rejeu/film";
import { adresseDuLecteur, DOSSIER_DES_DRAPEAUX, DOSSIER_DES_FICHES, DOSSIER_DES_LECTEURS, DOSSIER_SITE_DU_LECTEUR, dossierDuLecteur, drapeauxDeLaFiche, ficheNettoyee, lireRecette, manifesteDuLecteur, noticeDuLecteur, origineDuLecteur, pageDuLecteur, RECETTE_DU_LECTEUR, RECETTE_MINIMALE, recettePubliable, SITE_DU_CLAN, svgRepris } from "../src/lib/rejeu/lecteur-jeu";
import { DOSSIER_FILMS, DOSSIER_PUBLIC_FILMS, INDEX_DES_FILMS, LISTE_DES_FILMS, ListeDesFilms, lireIndex, MAX_OCTETS_FILM, MAX_OCTETS_FILM_DECOMPRESSE, nomDeLaFiche, nomDuBilan, nomDuFilm, nomDuJournal, type FilmPublie } from "../src/lib/rejeu/films-index";

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
 * préparé et la page « Revoir une partie » dit qu'il n'y a pas de replay.
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
    // Un lecteur d'une recette trop ancienne n'est pas publié : la page dit d'ici là que le replay n'est pas disponible.
    const recette = lstatSync(join(source, "recette.txt"), { throwIfNoEntry: false })?.isFile() ? lireRecette(readFileSync(join(source, "recette.txt"), "utf8")) : null;
    if (!recettePubliable(recette)) throw new Error(`construit selon une recette trop ancienne (${recette ?? "aucune"}, ${RECETTE_MINIMALE} au moins), à refaire`);
    if (recette !== RECETTE_DU_LECTEUR) console.log(`::notice::Films : le lecteur du jeu de la version ${commit.slice(0, 10)} est de la recette ${recette} : publié en attendant d'être refait selon la recette ${RECETTE_DU_LECTEUR} au prochain passage du job « films ».`);
    const cible = join(DOSSIER_SITE_DU_LECTEUR, dossierDuLecteur(commit));
    const fichiers = readFileSync(join(source, "fichiers.txt"), "utf8").split("\n").filter(Boolean);
    const page = pageDuLecteur(readFileSync(join(source, "modele.html"), "utf8"), { commit, manifeste: manifesteDuLecteur(fichiers, commit, "/", recette ?? undefined), recette: recette ?? undefined, apiHost: `/${DOSSIER_DES_FICHES}`.replace(/\/$/, ""), retour: `${SITE_DU_CLAN}/revoir`, notice: "/jeu/LISEZ-MOI.txt" });
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
/** Un journal plus lourd n'est pas lu : 20 000 faits pèsent moins de 2 Mo. */
const MAX_OCTETS_JOURNAL = 2_000_000;
/** Un bilan plus lourd n'est pas lu : 200 Gaulois pèsent moins de 40 Ko. */
const MAX_OCTETS_BILAN = 100_000;

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
    // Le journal « Entre Gaulois », relu, sans les pseudos qui ne sont plus sur la liste du clan ni les tags sortis du classement
    // officiel. Absent ou refusé : la page ne montre pas de journal pour cette partie, le replay reste.
    let faits: number | null = null;
    const nomJournal = nomDuJournal(partie);
    if (jeu && nomJournal && lstatSync(join(DOSSIER_FILMS, nomJournal), { throwIfNoEntry: false })?.isFile()) {
      try {
        if (lstatSync(join(DOSSIER_FILMS, nomJournal)).size > MAX_OCTETS_JOURNAL) throw new Error("trop lourd");
        const journal = journalPublie(lireJournal(readFileSync(join(DOSSIER_FILMS, nomJournal), "utf8"), partie), nomEncorePublie);
        if (journal.faits.length > 0) writeFileSync(join(DOSSIER_PUBLIC_FILMS, nomJournal), JSON.stringify(journal));
        faits = journal.faits.length;
      } catch (err) {
        console.log(`::warning::Films : le journal de la partie ${partie} n'est pas publié (${err instanceof Error ? err.message : String(err)}).`);
      }
    }
    // Le bilan des Gaulois, relu, sans les pseudos qui ne sont plus sur la liste du clan. Absent ou refusé : pas de bilan
    // pour cette partie, qui ne compte pas non plus au classement général.
    let bilan = false;
    const nomBilan = nomDuBilan(partie);
    if (jeu && nomBilan && lstatSync(join(DOSSIER_FILMS, nomBilan), { throwIfNoEntry: false })?.isFile()) {
      try {
        if (lstatSync(join(DOSSIER_FILMS, nomBilan)).size > MAX_OCTETS_BILAN) throw new Error("trop lourd");
        writeFileSync(join(DOSSIER_PUBLIC_FILMS, nomBilan), JSON.stringify(bilanPublie(lireBilan(readFileSync(join(DOSSIER_FILMS, nomBilan), "utf8"), partie), nomEncorePublie)));
        bilan = true;
      } catch (err) {
        console.log(`::warning::Films : le bilan de la partie ${partie} n'est pas publié (${err instanceof Error ? err.message : String(err)}).`);
      }
    }
    films.push({ partie, faits, bilan, debut: e.debut, carte: e.carte, victoire: e.victoire, equipes: e.equipes, gaulois: e.gaulois, joueurs: e.joueurs, secondes: secondesDeLImage(e, e.images - 1), forme: Math.round((e.largeur / e.hauteur) * 10_000) / 10_000, octets: lu.size, jeu });
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
console.log(`Films : ${films.length} publiés${refuses > 0 ? `, ${refuses} refusés` : ""}, ${films.filter((f) => f.jeu).length} avec le vrai lecteur du jeu (${lecteurs.size} version${lecteurs.size > 1 ? "s" : ""}).`);
