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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partie = await createGameRunner(depart as any, undefined, map, (gu: any) => {
    if ("errMsg" in gu) return;
    for (const hu of gu.updates[GameUpdateType.Hash] as HashUpdate[]) {
      const attendue = notees.get(hu.tick);
      if (attendue === undefined) continue;
      if (attendue === hu.hash) retrouvees++;
      else ecart ??= `empreinte différente au tour ${hu.tick}`;
    }
  });
  const film = filmer ? new Film(partie.game, derniere) : null;
  for (const tour of turns) {
    if (tour.turnNumber > derniere) break;
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
  const descriptionDuFilm = film ? { facteur: film.facteur, largeur: film.largeur, hauteur: film.hauteur, pas: film.pas, images: film.images, unites: UNITES_FILMEES } : undefined;
  const meta = { format: 1, partie: fiche.info.gameID, commit: fiche.gitCommit, largeur, hauteur, tours: derniere + 1, toursFiche: turns.length, empreintes: retrouvees, joueurs, film: descriptionDuFilm };
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
