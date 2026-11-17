/**
 * Le programme qui rejoue une partie avec le moteur d'OpenFront : construit avec le code du jeu au commit de la partie
 * (`construireMoteur`, scripts/rejeu-commun.ts), puis lancé seul, dans un job sans secret, par `scripts/rejouer-victoires.ts`
 * (carte de fin des victoires) et `scripts/filmer-parties.ts` (films des parties). Ce fichier n'est donc ni vérifié par `tsc`
 * ni lancé par le site : il n'a de sens qu'avec le code du jeu.
 *
 *   node moteur.mjs <fiche de la partie.json> <dossier de la carte> <sortie, sans extension> [film]
 *
 * Avec `film` (`scripts/filmer-parties.ts`, demande du pilote du 15 novembre 2026 : revoir les parties déjà jouées), il note
 * aussi, toutes les `pas` étapes, qui tient chaque case d'une grille réduite de la carte, et les unités suivies (constructions,
 * navires, bombes : `UNITES_FILMEES`) : `<sortie>.film.bin.gz`, décrit dans `film` de `<sortie>.json` (voir `FilmBrutMeta`,
 * src/lib/rejeu/film-brut.ts). Aucun nom : le site choisit lui-même ceux qu'il publie.
 *
 * Il note aussi les faits de la partie tels que le moteur les annonce (`GameUpdateType`, packages/engine-api/src/game/
 * GameUpdates.ts) : les dons réussis de troupes et d'or (`DonateEvent`), les éliminations (`ConquestEvent`), les bombes
 * lancées (une unité « Atom Bomb », « Hydrogen Bomb » ou « MIRV » vue pour la première fois, `Unit`), les émojis (`Emoji`),
 * les cibles désignées (`TargetPlayer`), les messages rapides (`DisplayChatEvent` : la clé de la phrase, jamais un texte
 * libre), les alliances demandées, acceptées, refusées, rompues ou finies, et les embargos. Chacun : l'étape, son code (voir
 * `CODES`, src/lib/rejeu/journal-ecran.ts), les petits numéros des joueurs, puis un montant ou un texte, dans `faits` de
 * `<sortie>.json` (voir `FaitsBruts`, src/lib/rejeu/journal.ts). Un moteur qui n'annonce pas les dons, ou une partie de plus
 * de `FAITS_MAX` faits, n'a pas de `faits` : le site n'en montre alors aucun. Aucun nom ici non plus.
 *
 * Appelle le moteur d'OpenFront (https://github.com/openfrontio/OpenFrontIO, AGPL-3.0, © OpenFront and Contributors) :
 * createGameRunner (packages/engine/src/GameRunner.ts), decompressGameRecord et toWireGameStartInfo
 * (packages/shared/src/SharedUtil.ts), WireGameStartInfoSchema (packages/shared/src/WireSchemas.ts). La façon de rejouer une
 * fiche et d'en vérifier les empreintes suit le lecteur de replays du jeu (src/client/replay/processor/ReplayProcessor.ts,
 * commit 8b5d071) et son rejeu des vainqueurs (packages/engine/src/WinnerReplay.ts), réécrite le 15/11/2026 : arrêtée à la
 * dernière empreinte de la fiche, elle ne garde que l'état final de la carte et, avec `film`, la grille réduite de chaque image.
 *
 * Sortie : `<sortie>.json` (voir `EtatFinalMeta`, src/lib/carte-finale.ts), `<sortie>.bin.gz` et, avec `film`,
 * `<sortie>.film.bin.gz`. Code de sortie 0 si tout
 * concorde ; 2 si une empreinte ne concorde pas (la partie a été jouée sur une autre version du moteur) ; 1 pour toute autre
 * panne. La raison est la dernière ligne de la sortie d'erreur. Dans l'Action, il tourne dans un conteneur sans réseau ni
 * droits (`commandeIsolee`, src/lib/rejeu-openfront.ts).
 */
import { GameUpdateType, type HashUpdate } from "@openfront/engine-api/game/GameUpdates";
import type { MapFiles } from "@openfront/engine-api/game/MapFiles";
import { createGameRunner } from "@openfront/engine/GameRunner";
import { decompressGameRecord, toWireGameStartInfo } from "@openfront/shared/SharedUtil";
import { WireGameStartInfoSchema } from "@openfront/shared/WireSchemas";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

/** Le moteur écrit beaucoup pendant une partie (« cannot build Nuke »…) : rien de cela n'a d'intérêt ici. */
const raison = console.error.bind(console);
console.log = console.info = console.debug = console.warn = () => {};

/** Comme `ECART_FIN_MAX` de src/lib/carte-finale.ts : ce programme est construit avec le code du jeu seul, sans celui du site. */
const ECART_FIN_MAX = 50;
/**
 * Comme `CASES_FILM_MAX`, `IMAGES_FILM_MAX`, `PAS_FILM_MIN`, `grilleDuFilm` et `imagesDuFilm` de src/lib/rejeu/film.ts, pour
 * la même raison : tests/unit/film-partie.test.ts vérifie que les deux disent la même chose.
 */
const CASES_FILM_MAX = 160_000;
const IMAGES_FILM_MAX = 360;
const PAS_FILM_MIN = 10;

/** Comme `FAITS_MAX` de src/lib/rejeu/journal-ecran.ts. */
const FAITS_MAX = 20_000;
/** Les bombes dont le lancement est noté, dans les noms du moteur et l'ordre de `BOMBES` (journal-ecran.ts). */
const BOMBES_NOTEES = ["Atom Bomb", "Hydrogen Bomb", "MIRV"];
/** Un joueur tel que le moteur le désigne dans une annonce : son identifiant (un texte) ou son petit numéro (un nombre). */
type Repere = string | number;

/** Un entier positif en octets de 7 bits, les petits d'abord (LEB128). */
function varint(sortie: number[], v: number) {
  while (v >= 0x80) {
    sortie.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  sortie.push(v);
}

/**
 * Les unités que le film suit, dans les noms du moteur (`UnitType`) : les constructions, les navires de guerre et de transport,
 * les bombes en vol. Pas les navires marchands, les trains, les obus ni les missiles des SAM : trop nombreux ou trop brefs. Comme
 * `UNITES_DU_FILM` de src/lib/rejeu/film-brut.ts, qui vérifie la liste écrite dans la description.
 */
const UNITES_FILMEES = ["City", "Port", "Factory", "Defense Post", "SAM Launcher", "Missile Silo", "Warship", "Transport", "Atom Bomb", "Hydrogen Bomb", "MIRV", "MIRV Warhead"];

/**
 * Le film d'une partie : la grille réduite de la carte (une case sur `facteur`, dans chaque sens, celle du centre), l'octet de
 * terrain de chaque case de la grille, puis une image toutes les `pas` étapes et à la dernière. Chaque image ne donne que les
 * cases qui ont changé depuis la précédente : leur nombre, puis pour chacune l'écart avec la précédente changée (moins un) et
 * sa valeur, le propriétaire fois deux, plus un s'il y a des retombées. Puis les unités qui ont changé : leur nombre, puis
 * pour chacune son numéro fois deux, plus un si elle est là ; si elle est là, son type (rang dans `UNITES_FILMEES`), sa case
 * (x, y, sur la carte entière), son propriétaire, son niveau, 1 si elle est en construction. Une unité partie : son numéro seul.
 */
class Film {
  readonly facteur: number;
  readonly largeur: number;
  readonly hauteur: number;
  readonly pas: number;
  private readonly refs: Int32Array;
  private readonly avant: Int32Array;
  private readonly octets: number[] = [];
  private readonly unites = new Map<number, string>();
  private readonly types = new Map(UNITES_FILMEES.map((t, i) => [t, i]));
  images = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly jeu: any, derniere: number) {
    const l = jeu.width();
    const h = jeu.height();
    let facteur = Math.max(1, Math.ceil(Math.sqrt((l * h) / CASES_FILM_MAX)));
    while (Math.ceil(l / facteur) * Math.ceil(h / facteur) > CASES_FILM_MAX) facteur++;
    this.facteur = facteur;
    this.largeur = Math.ceil(l / this.facteur);
    this.hauteur = Math.ceil(h / this.facteur);
    // Une image toutes les `pas` étapes depuis la première, plus la dernière : au plus IMAGES_FILM_MAX.
    this.pas = Math.max(PAS_FILM_MIN, Math.ceil(derniere / (IMAGES_FILM_MAX - 2)));
    this.refs = new Int32Array(this.largeur * this.hauteur);
    this.avant = new Int32Array(this.largeur * this.hauteur);
    for (let y = 0; y < this.hauteur; y++) {
      const ty = Math.min(h - 1, Math.floor((y + 0.5) * this.facteur));
      for (let x = 0; x < this.largeur; x++) {
        const ref = jeu.ref(Math.min(l - 1, Math.floor((x + 0.5) * this.facteur)), ty);
        this.refs[y * this.largeur + x] = ref;
        this.octets.push((jeu.isLand(ref) ? 0x80 : 0) | (jeu.isShoreline(ref) ? 0x40 : 0) | (jeu.isOcean(ref) ? 0x20 : 0) | (jeu.magnitude(ref) & 0x1f));
      }
    }
  }

  noter() {
    const changees: number[] = [];
    let precedente = -1;
    let nombre = 0;
    for (let i = 0; i < this.refs.length; i++) {
      const ref = this.refs[i]!;
      const v = this.jeu.ownerID(ref) * 2 + (this.jeu.hasFallout(ref) ? 1 : 0);
      if (v === this.avant[i]) continue;
      this.avant[i] = v;
      varint(changees, i - precedente - 1);
      varint(changees, v);
      precedente = i;
      nombre++;
    }
    varint(this.octets, nombre);
    for (const o of changees) this.octets.push(o);

    const vues = new Set<number>();
    const unites: number[] = [];
    let changeesU = 0;
    for (const u of this.jeu.units()) {
      const type = this.types.get(u.type());
      if (type === undefined || !u.isActive()) continue;
      const id = u.id();
      const tile = u.tile();
      const valeurs = [type, this.jeu.x(tile), this.jeu.y(tile), u.owner().smallID(), Math.max(1, u.level?.() ?? 1), u.isUnderConstruction?.() ? 1 : 0];
      vues.add(id);
      const cle = valeurs.join(",");
      if (this.unites.get(id) === cle) continue;
      this.unites.set(id, cle);
      varint(unites, id * 2 + 1);
      for (const v of valeurs) varint(unites, v);
      changeesU++;
    }
    for (const id of [...this.unites.keys()]) {
      if (vues.has(id)) continue;
      this.unites.delete(id);
      varint(unites, id * 2);
      changeesU++;
    }
    varint(this.octets, changeesU);
    for (const o of unites) this.octets.push(o);
    this.images++;
  }

  enOctets(): Uint8Array {
    return Uint8Array.from(this.octets);
  }
}

/**
 * Une raison écrite par ce programme : seule sortie qui va au journal de l'Action, public. Une erreur du moteur n'y passe que
 * par son type, son message pouvant reprendre une donnée de la fiche.
 */
class Raison extends Error {}
class Desaccord extends Raison {}

async function rejouer(fichePath: string, carteDir: string, sortie: string, filmer: boolean) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fiche: any = JSON.parse(readFileSync(fichePath, "utf8"));
  const { gameMap, gameMapSize } = fiche.info.config;
  const lire = (nom: string) => new Uint8Array(readFileSync(join(carteDir, nom)));
  const manifest = JSON.parse(readFileSync(join(carteDir, "manifest.json"), "utf8"));
  const map: MapFiles =
    gameMapSize === "Normal" ? { map: gameMap, mapSize: gameMapSize, manifest, mapBin: lire("map.bin"), map4xBin: lire("map4x.bin") } : { map: gameMap, mapSize: gameMapSize, manifest, map4xBin: lire("map4x.bin"), map16xBin: lire("map16x.bin") };

  const { turns } = decompressGameRecord({ ...fiche });
  const depart = toWireGameStartInfo(WireGameStartInfoSchema.parse(fiche.info));
  const notees = new Map<number, number>();
  for (const t of turns) if (t.hash !== null && t.hash !== undefined) notees.set(t.turnNumber, t.hash);
  if (notees.size === 0) throw new Raison("la fiche n'a aucune empreinte");
  const derniere = Math.max(...notees.keys());
  if (turns.length - (derniere + 1) > ECART_FIN_MAX) throw new Raison("la fin de la partie n'a pas d'empreinte");

  let retrouvees = 0;
  let ecart: string | null = null;
  // Les faits de la partie, tels que le moteur les annonce pendant l'étape en cours. `null` : ce moteur n'annonce pas les dons,
  // rien n'est noté.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const T = GameUpdateType as any;
  let etape = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let jeuEnCours: any = null;
  const faitsVus: { etape: number; code: number; joueurs: Repere[]; valeur?: number; texte?: string }[] | null = typeof T.DonateEvent === "number" ? [] : null;
  const bombesVues = new Set<number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partie = await createGameRunner(depart as any, undefined, map, (gu: any) => {
    if ("errMsg" in gu) return;
    for (const hu of gu.updates[GameUpdateType.Hash] as HashUpdate[]) {
      const attendue = notees.get(hu.tick);
      if (attendue === undefined) continue;
      if (attendue === hu.hash) retrouvees++;
      else ecart ??= `empreinte différente au tour ${hu.tick}`;
    }
    if (faitsVus !== null && faitsVus.length <= FAITS_MAX) {
      const noter = (code: number, joueurs: Repere[], valeur?: number, texte?: string) => faitsVus.push({ etape, code, joueurs, valeur, texte });
      const annonces = (type: unknown) => (typeof type === "number" ? (gu.updates[type] ?? []) : []);
      for (const d of annonces(T.DonateEvent)) {
        if (d.donationType !== "gold" && d.donationType !== "troops") continue;
        noter(d.donationType === "gold" ? 1 : 0, [String(d.senderId), String(d.recipientId)], Number(d.amount));
      }
      for (const c of annonces(T.ConquestEvent)) noter(2, [String(c.conquerorId), String(c.conqueredId)], Number(c.gold));
      for (const u of annonces(T.Unit)) {
        const genre = BOMBES_NOTEES.indexOf(u.unitType);
        if (genre < 0 || !u.isActive || bombesVues.has(u.id)) continue;
        bombesVues.add(u.id);
        // Sur qui elle tombe : le propriétaire de la case visée au moment du lancement, 0 pour personne.
        let cible = 0;
        try {
          if (jeuEnCours && typeof u.targetTile === "number") cible = Number(jeuEnCours.ownerID(u.targetTile));
        } catch {
          cible = 0;
        }
        noter(3, [Number(u.ownerID), cible], genre);
      }
      for (const e of annonces(T.Emoji)) {
        const m = e.emoji;
        if (!m || typeof m.message !== "string") continue;
        noter(4, [Number(m.senderID), typeof m.recipientID === "number" ? m.recipientID : 0], undefined, m.message);
      }
      for (const c of annonces(T.TargetPlayer)) noter(5, [Number(c.playerID), Number(c.targetID)]);
      // Un message rapide est annoncé deux fois, à qui le reçoit et à qui l'envoie : seule la seconde est notée.
      for (const c of annonces(T.DisplayChatEvent)) {
        if (c.isFrom !== false || typeof c.playerID !== "number" || typeof c.key !== "string" || typeof c.category !== "string") continue;
        noter(6, [c.playerID, String(c.recipient), typeof c.target === "string" ? c.target : 0], undefined, `${c.category}.${c.key}`);
      }
      for (const a of annonces(T.AllianceRequest)) noter(7, [Number(a.requestorID), Number(a.recipientID)]);
      for (const a of annonces(T.AllianceRequestReply)) if (a.request) noter(a.accepted ? 8 : 9, [Number(a.request.requestorID), Number(a.request.recipientID)]);
      for (const a of annonces(T.BrokeAlliance)) noter(10, [Number(a.traitorID), Number(a.betrayedID)]);
      for (const a of annonces(T.AllianceExpired)) noter(11, [Number(a.player1ID), Number(a.player2ID)]);
      for (const e of annonces(T.EmbargoEvent)) if (e.event === "start" || e.event === "stop") noter(e.event === "start" ? 12 : 13, [Number(e.playerID), Number(e.embargoedID)]);
    }
  });
  jeuEnCours = partie.game;
  const film = filmer ? new Film(partie.game, derniere) : null;
  for (const tour of turns) {
    if (tour.turnNumber > derniere) break;
    etape = tour.turnNumber;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    partie.addTurn(tour as any);
    if (!partie.executeNextTick()) throw new Raison(`le moteur s'arrête au tour ${tour.turnNumber}`);
    if (ecart) throw new Desaccord(ecart);
    if (film && (tour.turnNumber % film.pas === 0 || tour.turnNumber === derniere)) film.noter();
  }
  // Une empreinte notée que le moteur n'a pas calculée est un désaccord aussi.
  if (retrouvees !== notees.size) throw new Desaccord(`${notees.size - retrouvees} empreintes non retrouvées`);

  const jeu = partie.game;
  const largeur = jeu.width();
  const hauteur = jeu.height();
  const n = largeur * hauteur;
  const octets = new Uint8Array(n * 4);
  const vue = new DataView(octets.buffer);
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const i = y * largeur + x;
      const ref = jeu.ref(x, y);
      vue.setUint16(i * 2, jeu.ownerID(ref), true);
      octets[n * 2 + i] = (jeu.isLand(ref) ? 0x80 : 0) | (jeu.isShoreline(ref) ? 0x40 : 0) | (jeu.isOcean(ref) ? 0x20 : 0) | (jeu.magnitude(ref) & 0x1f);
      octets[n * 3 + i] = jeu.hasFallout(ref) ? 1 : 0;
    }
  }
  const joueurs = jeu.allPlayers().map((p) => ({ n: p.smallID(), client: p.clientID() ?? null, equipe: p.team() ?? null, type: String(p.type()) }));
  // Chaque fait : l'étape, son code, les petits numéros des joueurs (0 : personne, ou tous), puis son montant ou son texte.
  let faits: (number | string)[][] | undefined;
  if (faitsVus !== null && faitsVus.length <= FAITS_MAX) {
    const numero = (r: Repere): number | null => {
      if (typeof r === "number") return Number.isSafeInteger(r) && r >= 0 ? r : null;
      return jeu.hasPlayer(r) ? jeu.player(r).smallID() : null;
    };
    faits = [];
    for (const f of faitsVus) {
      const joueurs = f.joueurs.map(numero);
      if (joueurs.some((j) => j === null)) continue;
      const ligne: (number | string)[] = [f.etape, f.code, ...(joueurs as number[])];
      if (f.valeur !== undefined) {
        if (!Number.isSafeInteger(f.valeur) || f.valeur < 0) continue;
        ligne.push(f.valeur);
      }
      if (f.texte !== undefined) ligne.push(f.texte.slice(0, 80));
      faits.push(ligne);
    }
  }
  const descriptionDuFilm = film ? { facteur: film.facteur, largeur: film.largeur, hauteur: film.hauteur, pas: film.pas, images: film.images, unites: UNITES_FILMEES } : undefined;
  const meta = { format: 1, partie: fiche.info.gameID, commit: fiche.gitCommit, largeur, hauteur, tours: derniere + 1, toursFiche: turns.length, empreintes: retrouvees, joueurs, film: descriptionDuFilm, faits };
  writeFileSync(`${sortie}.bin.gz`, gzipSync(octets, { level: 9 }));
  if (film) writeFileSync(`${sortie}.film.bin.gz`, gzipSync(film.enOctets(), { level: 9 }));
  writeFileSync(`${sortie}.json`, JSON.stringify(meta));
}

const [fiche, carte, sortie, option] = process.argv.slice(2);
if (!fiche || !carte || !sortie || (option !== undefined && option !== "film")) {
  raison("usage : node moteur.mjs <fiche.json> <dossier de la carte> <sortie> [film]");
  process.exit(1);
}
rejouer(fiche, carte, sortie, option === "film").then(
  () => process.exit(0),
  (e: unknown) => {
    raison(e instanceof Raison ? e.message : `panne du moteur (${e instanceof Error ? e.name : typeof e})`);
    process.exit(e instanceof Desaccord ? 2 : 1);
  },
);
