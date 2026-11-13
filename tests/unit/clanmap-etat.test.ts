import { describe, expect, it } from "vitest";
import { ETAT_MER, ETAT_NEUTRE, classementDeLEtat, decoderEtat, decoderVeille, encoderEtat, encoderVeille, etatAuRelevé, etatConforme, pixelsParClan, rejouerEtat, releveValable } from "../../src/lib/clanmap/etat";
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

describe("l'état récent et ce qui a changé en 24 heures", () => {
  /** Événements [x, y, clan, ancien clan, date], numérotés de 10 en 10. */
  function datés(events: [number, number, number, number, number][]): EventLog {
    return {
      length: events.length,
      seq: Uint32Array.from(events.map((_, i) => 10 * (i + 1))),
      x: Uint16Array.from(events.map((e) => e[0])),
      y: Uint16Array.from(events.map((e) => e[1])),
      clan: Uint32Array.from(events.map((e) => e[2])),
      previous: Uint32Array.from(events.map((e) => e[3])),
      at: Uint32Array.from(events.map((e) => e[4])),
    };
  }
  const T = 1_800_000_000;
  const log = datés([
    [0, 0, 500, 0, T],
    [1, 0, 500, 0, T + 10],
    [2, 0, 77, 0, T + 20],
    // Le lendemain : 77 prend un pixel de 500, et 900 arrive.
    [0, 0, 77, 500, T + 90_000],
    [3, 3, 900, 0, T + 90_010],
  ]);

  it("rejoue jusqu'au dernier événement, avec les index du film et leur clan", () => {
    const r = rejouerEtat(log, WIDTH, HEIGHT, terrain)!;
    expect(r.ecarts).toBe(0);
    expect(r.etat).toMatchObject({ seq: 50, at: T + 90_010 });
    expect(r.clanIds).toEqual([0, 500, 77, 900]);
    expect(r.etat.valeurs[0]).toBe(3);
    expect(r.etat.valeurs[3 * WIDTH + 3]).toBe(4);
    expect(r.veille).toBeNull();
    // Le même état que le rejeu arrêté à un événement donné.
    expect([...r.etat.valeurs]).toEqual([...etatAuRelevé(log, 50, WIDTH, HEIGHT, terrain)!.valeurs]);
  });

  it("compte les événements qui contredisent l'ancien propriétaire annoncé", () => {
    const faux = datés([
      [0, 0, 500, 0, T],
      [0, 0, 77, 0, T + 10],
    ]);
    expect(rejouerEtat(faux, WIDTH, HEIGHT, terrain)!.ecarts).toBe(1);
  });

  it("garde chaque pixel changé depuis le moment comparé, avec sa valeur d'alors", () => {
    const r = rejouerEtat(log, WIDTH, HEIGHT, terrain, { depuis: T + 90_010 - 86_400 })!;
    expect(r.veille).toMatchObject({ seqEtat: 50, seq: 30, depuis: T + 90_010 - 86_400 });
    // Le pixel (0, 0) était à 500 (valeur 2), le pixel (3, 3) était neutre.
    expect([...r.veille!.index]).toEqual([0, 3 * WIDTH + 3]);
    expect([...r.veille!.avant]).toEqual([2, ETAT_NEUTRE]);
  });

  it("ne compare rien avant le début de l'historique, et rien n'a changé si tout est plus ancien", () => {
    expect(rejouerEtat(log, WIDTH, HEIGHT, terrain, { depuis: T - 1 })!.veille).toBeNull();
    const calme = rejouerEtat(log, WIDTH, HEIGHT, terrain, { depuis: T + 100_000 })!;
    expect(calme.veille).toMatchObject({ seq: 50 });
    expect(calme.veille!.index).toHaveLength(0);
  });

  it("s'arrête à l'événement demandé, et le refuse s'il n'est pas dans l'historique", () => {
    expect(rejouerEtat(log, WIDTH, HEIGHT, terrain, { seq: 30 })!.etat.seq).toBe(30);
    expect(rejouerEtat(log, WIDTH, HEIGHT, terrain, { seq: 35 })).toBeNull();
    expect(rejouerEtat(log, WIDTH, HEIGHT, terrain.subarray(1))).toBeNull();
  });

  it("relit la veille à l'identique, et refuse un fichier abîmé ou trop grand pour la carte", () => {
    const veille = rejouerEtat(log, WIDTH, HEIGHT, terrain, { depuis: T + 50_000 })!.veille!;
    const bytes = encoderVeille(veille);
    const relue = decoderVeille(bytes, WIDTH * HEIGHT);
    expect(relue).toMatchObject({ seqEtat: veille.seqEtat, seq: veille.seq, depuis: veille.depuis });
    expect([...relue.index]).toEqual([...veille.index]);
    expect([...relue.avant]).toEqual([...veille.avant]);
    expect(() => decoderVeille(bytes.subarray(0, bytes.length - 1), WIDTH * HEIGHT)).toThrow();
    expect(() => decoderVeille(Uint8Array.from([...bytes, 1]), WIDTH * HEIGHT)).toThrow();
    expect(() => decoderVeille(bytes, 3 * WIDTH)).toThrow();
  });

  it("classe les clans comme le film, et ne lit qu'un relevé bien formé", () => {
    const r = rejouerEtat(log, WIDTH, HEIGHT, terrain)!;
    const clans = [
      { tag: null, color: null },
      { tag: "UN", color: 1 },
      { tag: "GAL", color: 2 },
      { tag: "LUX", color: 3 },
    ];
    expect(classementDeLEtat(r.etat.valeurs, clans)).toEqual([
      { tag: "GAL", color: 2, pixels: 2 },
      { tag: "UN", color: 1, pixels: 1 },
      { tag: "LUX", color: 3, pixels: 1 },
    ]);
    const releve = { version: 1, fetchedAt: "2026-11-13T15:53:00.000Z", seq: 50, width: WIDTH, height: HEIGHT, clans, standings: classementDeLEtat(r.etat.valeurs, clans), claimed: 4, veille: null };
    expect(releveValable(releve)).toBe(true);
    expect(releveValable({ ...releve, veille: { depuis: "2026-11-12T15:53:00.000Z", seq: 30 } })).toBe(true);
    expect(releveValable({ ...releve, version: 2 })).toBe(false);
    expect(releveValable({ ...releve, fetchedAt: "hier" })).toBe(false);
    expect(releveValable({ ...releve, clans: [{ tag: 3, color: null }] })).toBe(false);
    expect(releveValable({ ...releve, standings: [{ tag: "GAL", color: null, pixels: -1 }] })).toBe(false);
    expect(releveValable(null)).toBe(false);
  });
});
