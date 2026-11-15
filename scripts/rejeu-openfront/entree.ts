/**
 * Le programme qui rejoue une partie avec le moteur d'OpenFront : construit avec le code du jeu au commit de la partie
 * (`src/lib/rejeu-openfront.ts`, `construireMoteur`), puis lancé seul, dans un job sans secret, par
 * `scripts/rejouer-victoires.ts`. Ce fichier n'est donc ni vérifié par `tsc` ni lancé par le site : il n'a de sens qu'avec le
 * code du jeu.
 *
 *   node moteur.mjs <fiche de la partie.json> <dossier de la carte> <sortie, sans extension>
 *
 * Appelle le moteur d'OpenFront (https://github.com/openfrontio/OpenFrontIO, AGPL-3.0, © OpenFront and Contributors) :
 * createGameRunner (packages/engine/src/GameRunner.ts), decompressGameRecord et toWireGameStartInfo
 * (packages/shared/src/SharedUtil.ts), WireGameStartInfoSchema (packages/shared/src/WireSchemas.ts). La façon de rejouer une
 * fiche et d'en vérifier les empreintes suit le lecteur de replays du jeu (src/client/replay/processor/ReplayProcessor.ts,
 * commit 8b5d071) et son rejeu des vainqueurs (packages/engine/src/WinnerReplay.ts), réécrite le 15/11/2026 : sans
 * enregistrement image par image, arrêtée à la dernière empreinte de la fiche, et qui ne garde que l'état final de la carte.
 *
 * Sortie : `<sortie>.json` (voir `EtatFinalMeta`, src/lib/carte-finale.ts) et `<sortie>.bin.gz`. Code de sortie 0 si tout
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
 * Une raison écrite par ce programme : seule sortie qui va au journal de l'Action, public. Une erreur du moteur n'y passe que
 * par son type, son message pouvant reprendre une donnée de la fiche.
 */
class Raison extends Error {}
class Desaccord extends Raison {}

async function rejouer(fichePath: string, carteDir: string, sortie: string) {
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
  for (const tour of turns) {
    if (tour.turnNumber > derniere) break;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    partie.addTurn(tour as any);
    if (!partie.executeNextTick()) throw new Raison(`le moteur s'arrête au tour ${tour.turnNumber}`);
    if (ecart) throw new Desaccord(ecart);
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
  const meta = { format: 1, partie: fiche.info.gameID, commit: fiche.gitCommit, largeur, hauteur, tours: derniere + 1, toursFiche: turns.length, empreintes: retrouvees, joueurs };
  writeFileSync(`${sortie}.bin.gz`, gzipSync(octets, { level: 9 }));
  writeFileSync(`${sortie}.json`, JSON.stringify(meta));
}

const [fiche, carte, sortie] = process.argv.slice(2);
if (!fiche || !carte || !sortie) {
  raison("usage : node moteur.mjs <fiche.json> <dossier de la carte> <sortie>");
  process.exit(1);
}
rejouer(fiche, carte, sortie).then(
  () => process.exit(0),
  (e: unknown) => {
    raison(e instanceof Raison ? e.message : `panne du moteur (${e instanceof Error ? e.name : typeof e})`);
    process.exit(e instanceof Desaccord ? 2 : 1);
  },
);
