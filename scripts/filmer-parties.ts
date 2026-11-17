/**
 * Le film de chaque partie du clan, victoires et défaites, pour la page « Revoir une partie » (demande du pilote du
 * 15 novembre 2026 : « regarde l'historique des victoires ou défaites déjà faites »). Lancé par le job « films » de
 * `.github/workflows/site.yml`, après la collecte, dans un job sans aucun secret : il exécute le code du jeu, lu sur GitHub au
 * commit de la partie, et dans l'Action seulement dans un conteneur sans réseau ni droits (`scripts/rejeu-commun.ts`).
 *   npm run parties:filmer
 *   npm run parties:filmer -- --partie <identifiant>   (une partie précise, pour essayer)
 *
 * Pour chaque partie des derniers jours sans film, la plus récente d'abord (`partiesAFilmer`) : la fiche de la partie avec toutes
 * ses étapes, le moteur de sa version, les fichiers de sa carte, puis le rejeu, qui note qui tient chaque case d'une grille
 * réduite toutes les quelques étapes. Toutes les empreintes du jeu doivent concorder. Ce que le conteneur laisse est relu comme
 * une donnée venue de l'extérieur et réécrit par le site (`src/lib/rejeu/film-brut.ts`), puis relu comme la page le relira.
 * Les films vont dans `.cache/films/`, que le workflow garde dans son cache : rien n'est écrit dans le dépôt.
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { z } from "zod";
import { clan } from "../config/clan";
import { MAX_OCTETS_DESCRIPTION } from "../src/lib/carte-finale";
import { loadLeaderboard, loadMembers, loadSessions } from "../src/lib/data";
import { mapKey } from "../src/lib/map-names";
import { dossierDeCarte } from "../src/lib/rejeu-openfront";
import { lireFilm } from "../src/lib/rejeu/film";
import { journalDeLaPartie, phrasesDuJeu, pseudoEnPartie, type Phrases } from "../src/lib/rejeu/journal";
import { filmDeLaPartie, nomsPubliables } from "../src/lib/rejeu/film-brut";
import { ficheNettoyee } from "../src/lib/rejeu/lecteur-jeu";
import { DOSSIER_FILMS, INDEX_DES_FILMS, lireIndex, MAX_OCTETS_FILM, MAX_OCTETS_FILM_DECOMPRESSE, nomDeLaFiche, nomDuFilm, nomDuJournal, noterEchec, noterFilm, partiesAFilmer, partiesARefilmer, rangerLesFilms, type IndexDesFilms } from "../src/lib/rejeu/films-index";
import type { StoredSession } from "../src/lib/schemas";
import { construireMoteur, FicheInattendue, lancerMoteur, lireCarte, lireFiche, lireLangueDuJeu, message, type Moteur, RACINE, rangerCartes, rangerMoteurs, TropLong } from "./rejeu-commun";

/**
 * Le job a 12 minutes, et le site attend sa fin pour se publier : le rejeu cesse de commencer des parties au bout de 4, et une
 * partie n'en prend jamais plus de 4. Le clan joue environ 3 parties par heure, filmées en 10 à 50 s chacune.
 */
const BUDGET_MS = 4 * 60_000;
const PAR_PARTIE_MS = 4 * 60_000;
/** Le film brut compressé que le conteneur peut laisser : quelques centaines de kilo-octets pour une partie d'une heure. */
const MAX_OCTETS_FILM_BRUT_GZ = 32_000_000;

const debut = Date.now();
const now = new Date();
const readText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);

/**
 * Les joueurs de la fiche, pour reconnaître les Gaulois (ceux qui portent le tag du clan et ont des stats, comme les compte la
 * session du clan, `clanPlayerCount`, affiché à côté du film, et le message des victoires) et choisir les noms publiables
 * (l'identifiant public relie un joueur à la liste du clan, le tag à la liste officielle : `nomsPubliables`). Rien d'autre n'en
 * est gardé pour le film : ni l'identifiant public ni le pseudo de la partie n'y entrent. Le journal « Entre Gaulois », lui,
 * nomme un Gaulois hors de la liste publique par le pseudo qu'il portait dans la partie (`pseudoEnPartie`, demande du pilote).
 */
const JoueursDeLaFiche = z.object({ info: z.object({ players: z.array(z.object({ clientID: z.string().nullish(), publicID: z.string().nullish(), clanTag: z.string().nullish(), username: z.string().max(200).nullish(), stats: z.unknown().optional() })).max(5_000) }) });

/**
 * Les pseudos des membres de la liste du clan, par identifiant public, et les tags du classement officiel : les seuls noms que
 * les films posent sur la carte (`nomsPubliables`). Un anonyme de la liste n'y est pas.
 */
const pseudosDuClan = new Map((loadMembers()?.members ?? []).filter((m) => m.publicId && m.username).map((m) => [m.publicId!, m.username!]));
const tagsOfficiels = loadLeaderboard()?.clans.map((c) => c.clanTag) ?? [];

let index: IndexDesFilms = lireIndex(readText(INDEX_DES_FILMS));
const noter = () => {
  writeFileSync(`${INDEX_DES_FILMS}.partiel`, `${JSON.stringify(index)}\n`);
  renameSync(`${INDEX_DES_FILMS}.partiel`, INDEX_DES_FILMS);
};

/** Une partie qui ne se filme pas : notée, et essayée de nouveau au plus `ESSAIS_MAX` fois, sauf si c'est pour de bon. */
function echec(s: StoredSession, raison: string, definitive: boolean) {
  console.log(`::warning::Films : la partie ${s.gameId} ne se filme pas (${raison}).`);
  index = noterEchec(index, s.gameId, s.gameStart, raison, definitive);
}

/**
 * Les phrases des messages rapides du jeu, par version : lues une fois par passage. Fichier illisible : aucune phrase, et les
 * messages rapides de ces parties n'entrent pas au journal.
 */
const phrasesParVersion = new Map<string, Promise<Phrases>>();
function phrasesDeLaVersion(commit: string): Promise<Phrases> {
  let phrases = phrasesParVersion.get(commit);
  if (!phrases) {
    phrases = lireLangueDuJeu(commit).then(phrasesDuJeu, (e: unknown) => {
      console.log(`::warning::Films : les phrases du jeu de la version ${commit.slice(0, 8)} ne se lisent pas (${message(e)}) : pas de messages rapides au journal.`);
      return new Map<string, string>();
    });
    phrasesParVersion.set(commit, phrases);
  }
  return phrases;
}

/** Filme une partie. */
async function filmer(s: StoredSession, moteurs: Map<string, Promise<Moteur>>): Promise<void> {
  const nom = nomDuFilm(s.gameId);
  if (!nom) return;
  let fiche: Awaited<ReturnType<typeof lireFiche>>;
  try {
    fiche = await lireFiche(s.gameId);
  } catch (e) {
    // Refusée ou trop lourde : pour de bon. Au format inattendu : la règle du site est peut-être trop stricte, au plus ESSAIS_MAX essais.
    if (e instanceof FicheInattendue) return echec(s, `fiche inutilisable : ${message(e)}`, !message(e).startsWith("fiche au format"));
    // Pas encore archivée, ou l'API ne répond pas : la partie attend le passage suivant, sans compter d'essai.
    console.log(`Films : la fiche de la partie ${s.gameId} ne se lit pas (${message(e)}). Nouvel essai au prochain passage.`);
    return;
  }
  const joueurs = JoueursDeLaFiche.safeParse(JSON.parse(fiche.texte));
  if (!joueurs.success) return echec(s, "joueurs de la fiche au format inattendu", false);
  const clients = new Set(joueurs.data.info.players.filter((p) => p.clanTag === clan.tag && p.clientID && p.stats !== undefined && p.stats !== null).map((p) => p.clientID!));

  const { gitCommit: commit, info } = fiche.fiche;
  let moteur: Moteur;
  try {
    if (!moteurs.has(commit)) moteurs.set(commit, construireMoteur(commit));
    moteur = await moteurs.get(commit)!;
  } catch (e) {
    return echec(s, `le moteur de la version ${commit.slice(0, 8)} ne se construit pas : ${message(e)}`, false);
  }
  const dossierCarte = (moteur.noms ? dossierDeCarte(moteur.noms, info.config.gameMap) : null) ?? mapKey(info.config.gameMap);
  let carte: string;
  try {
    if (!/^[a-z0-9]{1,60}$/.test(dossierCarte)) throw new Error("nom de carte inattendu");
    carte = await lireCarte(commit, dossierCarte, info.config.gameMapSize);
  } catch (e) {
    return echec(s, `fichiers de la carte ${info.config.gameMap} illisibles : ${message(e)}`, false);
  }

  const travail = resolve(RACINE, "travail-films", s.gameId);
  rmSync(travail, { recursive: true, force: true });
  mkdirSync(join(travail, "sortie"), { recursive: true });
  const ficheChemin = join(travail, "fiche.json");
  writeFileSync(ficheChemin, fiche.texte);
  const t0 = Date.now();
  const limite = Math.min(PAR_PARTIE_MS, Math.max(30_000, BUDGET_MS + 60_000 - (Date.now() - debut)));
  try {
    try {
      await lancerMoteur(moteur.fichier, ficheChemin, carte, join(travail, "sortie"), s.gameId, limite, true);
    } catch (e) {
      // Coupée parce que le passage n'avait plus le temps : elle repasse au suivant, sans compter d'essai.
      if (e instanceof TropLong && limite < PAR_PARTIE_MS) {
        console.log(`Films : plus le temps de finir la partie ${s.gameId}, elle sera filmée au prochain passage.`);
        return;
      }
      return echec(s, e instanceof TropLong ? "partie trop longue à rejouer" : `le moteur s'arrête : ${message(e)}`, e instanceof TropLong);
    }
    const metaChemin = join(travail, "sortie", "etat.json");
    const filmChemin = join(travail, "sortie", "etat.film.bin.gz");
    // Ce que le conteneur laisse vient du code du jeu : de vrais fichiers, à la taille attendue, avant même d'être lus.
    for (const [chemin, max] of [[metaChemin, MAX_OCTETS_DESCRIPTION], [filmChemin, MAX_OCTETS_FILM_BRUT_GZ]] as const) {
      const lu = lstatSync(chemin, { throwIfNoEntry: false });
      if (!lu || !lu.isFile() || lu.size > max) return echec(s, "sortie du moteur inattendue", false);
    }
    let octets: Buffer;
    const metaTexte = readFileSync(metaChemin, "utf8");
    const noms = nomsPubliables(joueurs.data.info.players, pseudosDuClan, tagsOfficiels);
    // Pour le journal seul : le pseudo que chaque Gaulois portait dans la partie (jamais celui d'un joueur d'un autre clan).
    const pseudos = new Map<string, string>();
    for (const p of joueurs.data.info.players) {
      const porte = p.clientID && clients.has(p.clientID) ? pseudoEnPartie(p.username) : null;
      if (porte !== null) pseudos.set(p.clientID!, porte);
    }
    try {
      ({ octets } = filmDeLaPartie(metaTexte, readFileSync(filmChemin), {
        partie: s.gameId,
        carte: info.config.gameMap,
        debut: s.gameStart,
        victoire: s.hasWon,
        equipes: s.playerTeams ?? "",
        gaulois: s.clanPlayerCount,
        joueurs: s.totalPlayerCount,
        clients,
        noms,
      }));
      if (octets.length > MAX_OCTETS_FILM) throw new Error("film trop lourd");
      // Relu comme la page le relira : un film qu'elle refuserait n'est pas gardé.
      lireFilm(gunzipSync(octets, { maxOutputLength: MAX_OCTETS_FILM_DECOMPRESSE }));
    } catch (e) {
      // Pas pour de bon : un refus peut venir du site (deux règles qui divergent), corrigé ensuite. Au plus ESSAIS_MAX essais.
      return echec(s, `film refusé : ${message(e)}`, false);
    }
    const chemin = join(DOSSIER_FILMS, nom);
    writeFileSync(`${chemin}.partiel`, octets);
    renameSync(`${chemin}.partiel`, chemin);
    // La fiche nettoyée, pour le vrai lecteur du jeu : sans identifiant public ni cosmétiques (`ficheNettoyee`).
    const nomFiche = nomDeLaFiche(s.gameId);
    if (nomFiche) {
      try {
        const cheminFiche = join(DOSSIER_FILMS, nomFiche);
        writeFileSync(`${cheminFiche}.partiel`, gzipSync(ficheNettoyee(fiche.texte, s.gameId), { level: 9 }));
        renameSync(`${cheminFiche}.partiel`, cheminFiche);
      } catch (e) {
        console.log(`::warning::Films : la fiche de la partie ${s.gameId} n'est pas gardée pour le lecteur du jeu (${message(e)}).`);
      }
    }
    // Le journal « Entre Gaulois » (src/lib/rejeu/journal.ts), relu comme le film. Un moteur qui ne note pas les faits : pas de
    // journal, et la partie n'est pas refaite pour lui. Un journal refusé : pas de journal non plus, le film reste.
    let journalGarde = false;
    const nomJournal = nomDuJournal(s.gameId);
    if (nomJournal) {
      const cheminJournal = join(DOSSIER_FILMS, nomJournal);
      rmSync(cheminJournal, { force: true });
      try {
        const journal = journalDeLaPartie(metaTexte, { partie: s.gameId, clients, noms, pseudos, phrases: await phrasesDeLaVersion(commit) });
        if (journal !== null) {
          writeFileSync(`${cheminJournal}.partiel`, JSON.stringify(journal));
          renameSync(`${cheminJournal}.partiel`, cheminJournal);
          journalGarde = true;
        }
      } catch (e) {
        console.log(`::warning::Films : le journal de la partie ${s.gameId} n'est pas gardé (${message(e)}).`);
      }
    }
    index = noterFilm(index, s.gameId, s.gameStart, octets.length, commit, journalGarde);
    console.log(`Films : partie ${s.gameId} (${info.config.gameMap}, ${s.hasWon ? "victoire" : "défaite"}) filmée en ${Math.round((Date.now() - t0) / 1000)} s, ${Math.round(octets.length / 1024)} Ko.`);
  } finally {
    rmSync(travail, { recursive: true, force: true });
  }
}

/** Retire du cache les films sortis du budget ou trop anciens, et les fichiers qu'aucun film de l'index ne connaît plus. */
function ranger() {
  const { index: range, retires } = rangerLesFilms(index, now);
  index = range;
  for (const partie of retires) {
    const nom = nomDuFilm(partie);
    if (nom) rmSync(join(DOSSIER_FILMS, nom), { force: true });
  }
  const connus = new Set(index.films.flatMap((f) => [nomDuFilm(f.partie), nomDeLaFiche(f.partie), nomDuJournal(f.partie)]));
  for (const nom of readdirSync(DOSSIER_FILMS)) if (nom !== "index.json" && !connus.has(nom)) rmSync(join(DOSSIER_FILMS, nom), { recursive: true, force: true });
}

mkdirSync(DOSSIER_FILMS, { recursive: true });
// Un film dont le fichier manque se refait.
index = { ...index, films: index.films.filter((f) => existsSync(join(DOSSIER_FILMS, nomDuFilm(f.partie) ?? "?"))) };
ranger();
noter();

const sessions = loadSessions();
const demandee = process.argv.indexOf("--partie");
// Les parties sans film d'abord ; puis, s'il reste du temps, celles filmées avant le journal « Entre Gaulois », pour le leur donner.
const parties = demandee >= 0 ? sessions.filter((s) => s.gameId === process.argv[demandee + 1]) : [...partiesAFilmer(sessions, index, now), ...partiesARefilmer(sessions, index, now)];
if (demandee >= 0 && parties.length === 0) console.log("Films : cette partie n'est pas dans les sessions du clan.");

const moteurs = new Map<string, Promise<Moteur>>();
let faites = 0;
for (const s of parties) {
  if (Date.now() - debut > BUDGET_MS) {
    console.log(`Films : temps écoulé, ${parties.length - faites} parties attendent les passages suivants.`);
    break;
  }
  await filmer(s, moteurs);
  faites++;
  ranger();
  noter();
}
if (parties.length === 0) console.log("Films : aucune partie à filmer.");
// Le passage est allé au bout : sa fin est la date que la page montre. Une panne en route laisse celle du passage d'avant.
index = { ...index, passage: new Date().toISOString() };
noter();
console.log(`Films : ${index.films.length} films gardés, ${Math.round(index.films.reduce((t, f) => t + f.octets, 0) / 1_000_000)} Mo.`);
rangerMoteurs();
rangerCartes();
