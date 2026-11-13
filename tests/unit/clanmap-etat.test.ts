import { describe, expect, it } from "vitest";
import { ETAT_MER, ETAT_NEUTRE, decoderEtat, encoderEtat, etatAuRelevé, etatConforme, pixelsParClan } from "../../src/lib/clanmap/etat";
import { replayHistory, type EventLog } from "../../src/lib/clanmap/replay";
import { LAND } from "../../src/lib/clanmap/terrain";

const WIDTH = 8;
const HEIGHT = 4;

/** Événements [x, y, clan], numérotés de 10 en 10 : l'historique officiel a des trous dans ses numéros. */
function logOf(events: [number, number, number][]): EventLog {
  return {
    length: events.length,
    seq: Uint32Array.from(events.map((_, i) => 10 * (i + 1))),
    x: Uint16Array.from(events.map((e) => e[0])),
    y: Uint16Array.from(events.map((e) => e[1])),
    clan: Uint32Array.from(events.map((e) => e[2])),
    previous: new Uint32Array(events.length),
    at: Uint32Array.from(events.map((_, i) => 1_800_000_000 + i)),
  };
}

/** Tout est terre, sauf la dernière colonne, qui est de la mer. */
const terrain = Uint8Array.from({ length: WIDTH * HEIGHT }, (_, p) => (p % WIDTH === WIDTH - 1 ? 0 : LAND));

describe("l'état pixel par pixel de la carte", () => {
  const log = logOf([
    [0, 0, 500],
    [1, 0, 500],
    [2, 0, 77],
    [0, 0, 77],
    [3, 3, 900],
  ]);

  it("garde les index de clans du film, et s'arrête au dernier événement du film", () => {
    const etat = etatAuRelevé(log, 40, WIDTH, HEIGHT, terrain)!;
    expect(etat.seq).toBe(40);
    expect(etat.at).toBe(1_800_000_003);
    // 500 est le clan d'index 1, 77 celui d'index 2 : la valeur d'un pixel est l'index plus un.
    expect(etat.valeurs[0]).toBe(3);
    expect(etat.valeurs[1]).toBe(2);
    expect(etat.valeurs[2]).toBe(3);
    // L'événement n° 50 vient après le film : il n'est pas rejoué.
    expect(etat.valeurs[3 * WIDTH + 3]).toBe(ETAT_NEUTRE);
    expect(etat.valeurs[WIDTH - 1]).toBe(ETAT_MER);
  });

  it("donne les mêmes index que le rejeu du film", () => {
    const etat = etatAuRelevé(log, 50, WIDTH, HEIGHT, terrain)!;
    const film = replayHistory(log, { width: WIDTH, height: HEIGHT, scale: 2, galId: 77 });
    for (let p = 0; p < WIDTH * HEIGHT; p++) {
      const clan = film.grid[p]!;
      expect(etat.valeurs[p]).toBe(clan === 0 ? (terrain[p]! & LAND ? ETAT_NEUTRE : ETAT_MER) : clan + 1);
    }
    expect([...pixelsParClan(etat.valeurs, film.clanIds.length)]).toEqual([...film.pixels]);
  });

  it("refuse un historique qui ne contient pas le dernier événement du film", () => {
    expect(etatAuRelevé(log, 45, WIDTH, HEIGHT, terrain)).toBeNull();
    expect(etatAuRelevé(log, 60, WIDTH, HEIGHT, terrain)).toBeNull();
    expect(etatAuRelevé(log, 50, WIDTH, HEIGHT, terrain.subarray(1))).toBeNull();
  });

  it("n'est conforme que s'il redonne les pixels de chaque clan du film, sous son tag", () => {
    const etat = etatAuRelevé(log, 50, WIDTH, HEIGHT, terrain)!;
    const clans = [{ tag: null }, { tag: "UN" }, { tag: "GAL" }, { tag: "LUX" }];
    const standings = [
      { tag: "GAL", pixels: 2 },
      { tag: "UN", pixels: 1 },
      { tag: "LUX", pixels: 1 },
    ];
    expect(etatConforme(etat.valeurs, clans, standings)).toBe(true);
    expect(etatConforme(etat.valeurs, clans, [{ tag: "GAL", pixels: 2 }, { tag: "UN", pixels: 1 }])).toBe(false);
    // Les mêmes nombres sous d'autres tags : ce n'est pas le même historique.
    expect(etatConforme(etat.valeurs, [{ tag: null }, { tag: "LUX" }, { tag: "GAL" }, { tag: "UN" }], [{ tag: "GAL", pixels: 2 }, { tag: "UN", pixels: 2 }])).toBe(false);
    expect(etatConforme(etat.valeurs, clans.slice(0, 2), standings)).toBe(false);
  });

  it("se relit à l'identique, et refuse un fichier abîmé", () => {
    const etat = etatAuRelevé(log, 50, WIDTH, HEIGHT, terrain)!;
    const bytes = encoderEtat(etat);
    const relu = decoderEtat(bytes);
    expect(relu).toMatchObject({ width: WIDTH, height: HEIGHT, seq: 50, at: etat.at });
    expect([...relu.valeurs]).toEqual([...etat.valeurs]);
    expect(() => decoderEtat(bytes.subarray(0, bytes.length - 1))).toThrow();
    expect(() => decoderEtat(Uint8Array.from([...bytes, 1, 1]))).toThrow();
    const autre = bytes.slice();
    autre[0] = 0;
    expect(() => decoderEtat(autre)).toThrow();
  });

  it("garde une très longue suite de pixels identiques en quelques octets", () => {
    const grand = { width: 4108, height: 1948, seq: 1, at: 1, valeurs: new Uint16Array(4108 * 1948).fill(ETAT_NEUTRE) };
    const bytes = encoderEtat(grand);
    expect(bytes.length).toBeLessThan(30);
    expect(decoderEtat(bytes).valeurs.every((v) => v === ETAT_NEUTRE)).toBe(true);
  });
});
