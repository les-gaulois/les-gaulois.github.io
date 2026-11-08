import { describe, expect, it } from "vitest";
import { REMIND_AFTER_HOURS, sendStaffNotice, staffNotice, type StaffDigest } from "../../src/lib/encadrement-discord";

const SITE = "https://les-gaulois.github.io";
// 15 h à Paris, le 8 novembre 2026 (heure d'hiver : UTC+1).
const NOW = new Date("2026-11-08T14:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const digest = (over: Partial<StaffDigest> = {}): StaffDigest => ({ pending: 2, oldest_at: hoursAgo(3), newest_id: 12, notice: { newest_id: 10, reminded_at: hoursAgo(2) }, ...over });

describe("le message à l'encadrement", () => {
  it("part quand une nouvelle demande arrive, sans aucun nom", () => {
    const decision = staffNotice(digest(), NOW, SITE);
    expect(decision).toEqual({
      send: true,
      kind: "nouvelle",
      text: `2 demandes d'adhésion attendent sur le site du clan. À traiter : ${SITE}/admin`,
      note: { newest_id: 12, reminded_at: NOW.toISOString() },
    });
  });

  it("part au tout premier passage s'il y a des demandes", () => {
    const decision = staffNotice(digest({ pending: 1, newest_id: 3, notice: null }), NOW, SITE);
    expect(decision).toMatchObject({ send: true, kind: "nouvelle", text: `Une demande d'adhésion attend sur le site du clan. À traiter : ${SITE}/admin` });
  });

  it("dit l'attente de la plus ancienne au-delà de 24 h", () => {
    const decision = staffNotice(digest({ oldest_at: hoursAgo(50) }), NOW, SITE);
    expect(decision.send && decision.text).toBe(`2 demandes d'adhésion attendent sur le site du clan. La plus ancienne attend depuis 2 jours. À traiter : ${SITE}/admin`);
  });

  it("ne répète rien sans nouvelle demande, puis rappelle une fois par jour une demande de plus de 24 h", () => {
    const same = digest({ newest_id: 10, oldest_at: hoursAgo(REMIND_AFTER_HOURS + 2), notice: { newest_id: 10, reminded_at: hoursAgo(5) } });
    expect(staffNotice(same, NOW, SITE)).toEqual({ send: false, reason: "rien de nouveau depuis le dernier message" });
    const later = digest({ newest_id: 10, oldest_at: hoursAgo(REMIND_AFTER_HOURS + 2), notice: { newest_id: 10, reminded_at: hoursAgo(25) } });
    expect(staffNotice(later, NOW, SITE)).toEqual({
      send: true,
      kind: "rappel",
      text: `Rappel : 2 demandes d'adhésion attendent sur le site du clan. La plus ancienne attend depuis 26 h. À traiter : ${SITE}/admin`,
      note: { newest_id: 10, reminded_at: NOW.toISOString() },
    });
  });

  it("ne rappelle pas une demande récente", () => {
    expect(staffNotice(digest({ newest_id: 10, oldest_at: hoursAgo(5), notice: { newest_id: 10, reminded_at: null } }), NOW, SITE).send).toBe(false);
  });

  it("se tait sans demande, et la nuit", () => {
    expect(staffNotice(digest({ pending: 0, newest_id: null, oldest_at: null }), NOW, SITE)).toEqual({ send: false, reason: "aucune demande en attente" });
    // 23 h 30 à Paris.
    expect(staffNotice(digest(), new Date("2026-11-08T22:30:00Z"), SITE).send).toBe(false);
    // 7 h 59 à Paris.
    expect(staffNotice(digest(), new Date("2026-11-08T06:59:00Z"), SITE).send).toBe(false);
    // 8 h à Paris.
    expect(staffNotice(digest(), new Date("2026-11-08T07:00:00Z"), SITE).send).toBe(true);
  });
});

describe("l'envoi à l'encadrement", () => {
  const WEBHOOK = "https://discord.com/api/webhooks/123456789012345678/jeton-faux_ABC";
  const run = async (respond: (url: string, init: RequestInit) => Promise<Response>, over: Partial<Parameters<typeof sendStaffNotice>[0]> = {}) => {
    const lines: string[] = [];
    const notes: unknown[] = [];
    const calls: { url: string; init: RequestInit }[] = [];
    const result = await sendStaffNotice({
      webhook: WEBHOOK,
      digest: digest(),
      now: NOW,
      siteUrl: SITE,
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return respond(url, init);
      }) as unknown as typeof fetch,
      note: async (state) => {
        notes.push(state);
      },
      log: (line) => lines.push(line),
      ...over,
    });
    return { result, lines, notes, calls };
  };

  it("poste le message sans mention, puis note ce qui a été annoncé", async () => {
    const { result, notes, calls, lines } = await run(async () => new Response(null, { status: 204 }));
    expect(result).toBe("sent");
    expect(notes).toEqual([{ newest_id: 12, reminded_at: NOW.toISOString() }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init.redirect).toBe("error");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ content: expect.stringContaining("2 demandes") as unknown, allowed_mentions: { parse: [] } });
    // Le lien du salon vaut un mot de passe : il n'apparaît dans aucune ligne du journal.
    expect(lines.join("\n")).not.toContain("jeton-faux");
  });

  it("ne note rien si Discord refuse ou ne répond pas : le message repartira", async () => {
    const refused = await run(async () => new Response(null, { status: 500 }));
    expect(refused.result).toBe("failed");
    expect(refused.notes).toEqual([]);
    const down = await run(async () => {
      throw new Error("réseau");
    });
    expect(down.result).toBe("failed");
    expect(down.notes).toEqual([]);
    expect([...refused.lines, ...down.lines].join("\n")).not.toContain("jeton-faux");
  });

  it("ne fait rien sans lien, ou avec un lien qui n'est pas celui d'un salon Discord", async () => {
    const off = await run(async () => new Response(null, { status: 204 }), { webhook: "  " });
    expect(off.result).toBe("off");
    expect(off.calls).toEqual([]);
    const invalid = await run(async () => new Response(null, { status: 204 }), { webhook: "https://exemple.fr/webhook" });
    expect(invalid.result).toBe("invalid");
    expect(invalid.calls).toEqual([]);
  });
});
