import { describe, expect, it } from "vitest";
import { checkFails, checkSentence, isSalonWaiting, parseDiscordSalons, ROBOT_SALON_TEXTS, testSentence, type RobotCheck } from "../../src/lib/compte/discord-salons";

const NOW = "2026-11-11T16:00:00.000Z";
const when = (iso: string) => `[${iso}]`;
const NEWS = ROBOT_SALON_TEXTS[0]!;
const STAFF = ROBOT_SALON_TEXTS[1]!;
const answer = (salons: unknown[]) => ({ ok: true, now: NOW, salons });
const unset = (salon: string, check: unknown = null) => ({ salon, set: false, updated_at: null, updated_by: null, last: null, check });

describe("parseDiscordSalons", () => {
  it("relit les deux salons, réglés ou non, avec l'essai et le contrôle du robot", () => {
    const parsed = parseDiscordSalons(
      answer([
        {
          salon: "nouvelles",
          set: true,
          updated_at: "2026-11-11T15:00:00.000Z",
          updated_by: "Jod",
          last: { kind: "test", at: "2026-11-11T15:59:30.000Z", failed: false, answered: false, status: null, timed_out: false, error: null },
          check: null,
        },
        unset("encadrement", { at: "2026-11-11T14:53:00.000Z", source: "secret", status: 404, name: null }),
      ]),
    );
    expect(parsed).toEqual([
      { id: "nouvelles", set: true, updatedAt: "2026-11-11T15:00:00.000Z", updatedBy: "Jod", last: { kind: "test", at: "2026-11-11T15:59:30.000Z", outcome: { state: "waiting" } }, check: null },
      { id: "encadrement", set: false, updatedAt: null, updatedBy: null, last: null, check: { at: "2026-11-11T14:53:00.000Z", source: "secret", status: 404, name: null } },
    ]);
    expect(isSalonWaiting(parsed)).toBe(true);
  });
  it("lit la réponse de Discord à l'essai, et l'oublie au bout de six heures", () => {
    const row = (at: string, extra: Record<string, unknown>) => parseDiscordSalons(answer([{ salon: "nouvelles", set: true, updated_at: at, updated_by: null, last: { kind: "test", at, ...extra }, check: null }, unset("encadrement")]))?.[0]?.last?.outcome;
    expect(row("2026-11-11T15:50:00.000Z", { answered: true, status: 204 })).toEqual({ state: "accepted" });
    expect(row("2026-11-11T15:50:00.000Z", { answered: true, status: 404 })).toEqual({ state: "refused", status: 404 });
    expect(row("2026-11-11T15:50:00.000Z", { failed: true, error: "panne" })).toEqual({ state: "unsent", detail: "panne" });
    expect(row("2026-11-11T09:00:00.000Z", { answered: false })).toEqual({ state: "forgotten" });
  });
  it("une réponse illisible ne devient pas un réglage", () => {
    expect(parseDiscordSalons(null)).toBeNull();
    expect(parseDiscordSalons({ ok: true, now: NOW })).toBeNull();
    expect(parseDiscordSalons(answer([unset("nouvelles")]))).toBeNull();
    expect(parseDiscordSalons({ ok: true, now: "hier", salons: [unset("nouvelles"), unset("encadrement")] })).toBeNull();
  });
  it("un contrôle mal formé n'est pas montré, et un statut inconnu n'est pas une réussite", () => {
    const check = (raw: unknown) => parseDiscordSalons(answer([unset("nouvelles", raw), unset("encadrement")]))?.[0]?.check;
    expect(check({ at: NOW, source: "ailleurs", status: 200 })).toBeNull();
    expect(check({ at: NOW, source: "secret", status: 9999, name: "  " })).toEqual({ at: NOW, source: "secret", status: null, name: null });
  });
});

describe("les phrases", () => {
  const check = (over: Partial<RobotCheck>): RobotCheck => ({ at: NOW, source: "direction", status: 200, name: "Le Gaulois", ...over });
  it("disent ce qu'a répondu Discord au contrôle du robot, et d'où venait le lien", () => {
    expect(checkSentence(check({}), NEWS, when)).toBe(`Contrôle du robot, le [${NOW}] : le webhook « Le Gaulois » répond.`);
    expect(checkSentence(check({ source: "secret", status: 404, name: null }), NEWS, when)).toBe(
      `Contrôle du robot, le [${NOW}] (lien du secret GitHub) : Discord ne connaît pas ce lien : le webhook a sans doute été supprimé. Collez le lien d'un nouveau webhook.`,
    );
    expect(checkSentence(check({ source: "none", status: null }), STAFF, when)).toBe(`Contrôle du robot, le [${NOW}] : aucun lien, ni ici ni dans le secret GitHub DISCORD_WEBHOOK_ENCADREMENT. Rien ne part dans ce salon.`);
    expect(checkSentence(check({ status: 0 }), NEWS, when)).toBe(`Contrôle du robot, le [${NOW}] : Discord n'a pas répondu.`);
    expect(checkSentence(check({ status: null }), NEWS, when)).toContain("n'a pas la forme d'un webhook");
    // Le contrôle ne poste rien : un refus n'a rien à voir avec un salon de type forum.
    expect(checkSentence(check({ status: 400 }), NEWS, when)).toBe(`Contrôle du robot, le [${NOW}] : Discord refuse ce lien (erreur 400). Collez le lien d'un nouveau webhook.`);
    expect(checkSentence(check({ status: 403 }), NEWS, when)).not.toContain("forum");
  });
  it("mettent en avant un lien que Discord ne connaît pas, pas une panne passagère ni un salon sans lien", () => {
    expect(checkFails(check({ status: 404 }))).toBe(true);
    expect(checkFails(check({ status: null }))).toBe(true);
    expect(checkFails(check({ status: 503 }))).toBe(false);
    expect(checkFails(check({ status: 0 }))).toBe(false);
    expect(checkFails(check({ source: "none", status: null }))).toBe(false);
    expect(checkFails(null)).toBe(false);
  });
  it("disent l'essai comme pour les appels", () => {
    expect(testSentence({ kind: "test", at: NOW, outcome: { state: "accepted" } }, when)).toBe(`Dernier envoi : l'essai, le [${NOW}]. Discord a accepté l'essai : il est dans le salon.`);
  });
});
