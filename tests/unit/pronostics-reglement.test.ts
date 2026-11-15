import { describe, expect, it } from "vitest";
import type { RpcResult } from "../../src/lib/compte/roster";
import { partageDeLaCagnotte, settlePass, weeksToSettle, type StakeToShare } from "../../src/lib/pronostics-reglement";
import type { ClanWeek } from "../../src/lib/semaine-du-clan";

const week = (from: string, wins: number, complete: boolean): ClanWeek => ({ from, games: wins * 2, wins, complete });
// Comme clanWeeks : la plus récente d'abord.
const WEEKS = [week("2026-11-16", 40, false), week("2026-11-09", 293, true), week("2026-11-02", 250, true)];

function harness(answers: Record<string, RpcResult | Error>) {
  const calls: Record<string, unknown>[] = [];
  const lines: string[] = [];
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, ...args });
    const answer = answers[String(args["p_week"])];
    if (answer instanceof Error) throw answer;
    return answer ?? { ok: true, already: true, outcome: "regle", wins: args["p_wins"], pot: 0 };
  };
  return { calls, lines, deps: { rpc, weeks: WEEKS, log: (line: string) => lines.push(line) } };
}

describe("le règlement des pronostics", () => {
  it("n'envoie que les semaines entièrement relevées, la plus ancienne d'abord", () => {
    expect(weeksToSettle(WEEKS)).toEqual([
      { week: "2026-11-02", wins: 250 },
      { week: "2026-11-09", wins: 293 },
    ]);
    expect(weeksToSettle([week("2026-11-16", 3, false)])).toEqual([]);
  });

  it("envoie chaque semaine complète au serveur, avec le total que le QG affiche", async () => {
    const { calls, lines, deps } = harness({ "2026-11-09": { ok: true, already: false, outcome: "regle", wins: 293, pot: 1000, winners: 2 } });
    expect(await settlePass(deps)).toEqual({ settled: 1, failed: 0 });
    expect(calls).toEqual([
      { fn: "settle_predictions", p_week: "2026-11-02", p_wins: 250 },
      { fn: "settle_predictions", p_week: "2026-11-09", p_wins: 293 },
    ]);
    expect(lines).toEqual(["Pronostics du 2026-11-09 : réglés sur 293 victoires, cagnotte de 1000 statères versée à 2 mise(s)."]);
  });

  it("se tait sur une semaine déjà réglée, et signale seulement un total qui a changé depuis", async () => {
    const { lines, deps } = harness({ "2026-11-02": { ok: true, already: true, outcome: "regle", wins: 248, pot: 10 } });
    expect(await settlePass(deps)).toEqual({ settled: 0, failed: 0 });
    expect(lines).toEqual(["::notice::Pronostics du 2026-11-02 : réglés sur 248 victoires, le relevé dit aujourd'hui 250. Rien ne change."]);
  });

  it("ne compare pas le total d'une semaine aux mises rendues", async () => {
    const { lines, deps } = harness({ "2026-11-02": { ok: true, already: true, outcome: "rendu", wins: null, pot: 10 } });
    await settlePass(deps);
    expect(lines).toEqual([]);
  });

  it("continue après un refus ou une panne, et les compte", async () => {
    const { calls, lines, deps } = harness({ "2026-11-02": new Error("settle_predictions : réseau"), "2026-11-09": { ok: false, error: "week_not_over" } });
    expect(await settlePass(deps)).toEqual({ settled: 0, failed: 2 });
    expect(calls).toHaveLength(2);
    expect(lines).toEqual(["::warning::Pronostics du 2026-11-02 : settle_predictions : réseau", "::warning::Pronostics du 2026-11-09 : refusé (week_not_over)."]);
  });

  it("dit une semaine réglée sans mise", async () => {
    const { lines, deps } = harness({ "2026-11-09": { ok: true, already: false, outcome: "regle", wins: 293, pot: 0, winners: 0 } });
    await settlePass(deps);
    expect(lines).toEqual(["Pronostics du 2026-11-09 : réglés sur 293 victoires, sans mise."]);
  });
});

describe("le partage de la cagnotte", () => {
  const mise = (id: string, wins: number, stake: number, placedAt = 0): StakeToShare => ({ id, wins, stake, placedAt });

  it("donne la cagnotte aux plus proches, au prorata : 333 et 667 sur 1 000", () => {
    const gains = partageDeLaCagnotte([mise("a", 290, 100), mise("b", 310, 200), mise("c", 400, 700), mise("d", 300, 0)], 300);
    expect(Object.fromEntries(gains)).toEqual({ a: 333, b: 667, c: 0 });
  });

  it("le plus proche rafle tout ; seul à miser, on récupère sa mise", () => {
    expect(Object.fromEntries(partageDeLaCagnotte([mise("a", 100, 40), mise("b", 120, 60)], 101))).toEqual({ a: 100, b: 0 });
    expect(Object.fromEntries(partageDeLaCagnotte([mise("a", 1, 75)], 500))).toEqual({ a: 75 });
  });

  it("sans mise, rien à partager ; un pronostic pour l'honneur ne prend ni ne bloque la cagnotte", () => {
    expect(partageDeLaCagnotte([mise("a", 300, 0)], 300).size).toBe(0);
    expect(Object.fromEntries(partageDeLaCagnotte([mise("h", 300, 0), mise("a", 250, 10), mise("b", 200, 10)], 300))).toEqual({ a: 20, b: 0 });
  });

  it("à restes égaux, le premier posé, puis le plus petit identifiant", () => {
    // 10 statères entre trois mises égales : 3 chacun, et le statère qui reste au premier posé.
    expect(Object.fromEntries(partageDeLaCagnotte([mise("c", 5, 1, 1), mise("b", 5, 1, 2), mise("a", 5, 1, 3), mise("z", 50, 7, 0)], 5))).toEqual({ c: 4, b: 3, a: 3, z: 0 });
    expect(Object.fromEntries(partageDeLaCagnotte([mise("c", 5, 1, 0), mise("b", 5, 1, 0), mise("a", 5, 1, 0), mise("z", 50, 7, 0)], 5))).toEqual({ a: 4, b: 3, c: 3, z: 0 });
  });

  it("résiste au hasard : rien n'est créé ni perdu, chaque gagnant reçoit au moins sa mise", () => {
    // Un générateur fixe, pour rejouer le même tirage.
    let graine = 20261115;
    const hasard = (n: number) => {
      graine = (graine * 1103515245 + 12345) % 2147483648;
      return graine % n;
    };
    for (let essai = 0; essai < 2000; essai++) {
      const result = hasard(400);
      const stakes = Array.from({ length: 1 + hasard(12) }, (_, i) => mise(`m${i}`, result - 20 + hasard(41), hasard(4) === 0 ? 0 : 1 + hasard(1000), hasard(5)));
      const gains = partageDeLaCagnotte(stakes, result);
      const pot = stakes.reduce((sum, item) => sum + item.stake, 0);
      expect([...gains.values()].reduce((sum, gain) => sum + gain, 0)).toBe(pot);
      const best = Math.min(...stakes.filter((item) => item.stake > 0).map((item) => Math.abs(item.wins - result)));
      for (const item of stakes.filter((s) => s.stake > 0)) {
        const gain = gains.get(item.id) ?? -1;
        if (Math.abs(item.wins - result) === best) expect(gain).toBeGreaterThanOrEqual(item.stake);
        else expect(gain).toBe(0);
      }
    }
  });
});
