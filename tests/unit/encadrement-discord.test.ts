import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clan } from "../../config/clan";
import { instantNotes, REMIND_AFTER_HOURS, sendStaffNotice, staffNotice, type StaffDigest } from "../../src/lib/encadrement-discord";
import { fmtDuration } from "../../src/lib/format";

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
      text: `2 demandes d'adhésion attendent sur le site du clan. À traiter : ${SITE}/direction#demandes`,
      note: { newest_id: 12, reminded_at: NOW.toISOString() },
    });
  });

  it("part au tout premier passage s'il y a des demandes", () => {
    const decision = staffNotice(digest({ pending: 1, newest_id: 3, notice: null }), NOW, SITE);
    expect(decision).toMatchObject({ send: true, kind: "nouvelle", text: `Une demande d'adhésion attend sur le site du clan. À traiter : ${SITE}/direction#demandes` });
  });

  it("dit l'attente de la plus ancienne au-delà de 24 h", () => {
    const decision = staffNotice(digest({ oldest_at: hoursAgo(50) }), NOW, SITE);
    expect(decision.send && decision.text).toBe(`2 demandes d'adhésion attendent sur le site du clan. La plus ancienne attend depuis 2 jours. À traiter : ${SITE}/direction#demandes`);
  });

  it("ne répète rien sans nouvelle demande, puis rappelle une fois par jour une demande de plus de 24 h", () => {
    const same = digest({ newest_id: 10, oldest_at: hoursAgo(REMIND_AFTER_HOURS + 2), notice: { newest_id: 10, reminded_at: hoursAgo(5) } });
    expect(staffNotice(same, NOW, SITE)).toEqual({ send: false, reason: "rien de nouveau depuis le dernier message" });
    const later = digest({ newest_id: 10, oldest_at: hoursAgo(REMIND_AFTER_HOURS + 2), notice: { newest_id: 10, reminded_at: hoursAgo(25) } });
    expect(staffNotice(later, NOW, SITE)).toEqual({
      send: true,
      kind: "rappel",
      text: `Rappel : 2 demandes d'adhésion attendent sur le site du clan. La plus ancienne attend depuis 26 h. À traiter : ${SITE}/direction#demandes`,
      note: { newest_id: 10, reminded_at: NOW.toISOString() },
    });
  });

  it("ne rappelle pas une demande récente", () => {
    expect(staffNotice(digest({ newest_id: 10, oldest_at: hoursAgo(5), notice: { newest_id: 10, reminded_at: null } }), NOW, SITE).send).toBe(false);
  });

  it("se tait sans demande, mais parle jour et nuit", () => {
    expect(staffNotice(digest({ pending: 0, newest_id: null, oldest_at: null }), NOW, SITE)).toEqual({ send: false, reason: "aucune demande en attente" });
    // 23 h 30, 3 h et 7 h 59 à Paris : depuis le 14 novembre 2026, plus d'heures de silence.
    for (const at of ["2026-11-08T22:30:00Z", "2026-11-08T02:00:00Z", "2026-11-08T06:59:00Z"]) {
      expect(staffNotice(digest(), new Date(at), SITE), at).toMatchObject({ send: true, kind: "nouvelle" });
    }
  });

  it("annonce une seule fois sa mise en service, quand rien n'a encore été noté", () => {
    const first = digest({ pending: 0, newest_id: null, oldest_at: null, notice: null });
    const decision = staffNotice(first, NOW, SITE);
    expect(decision).toEqual({
      send: true,
      kind: "service",
      text: `L'avis à l'encadrement est en place : ce salon sera prévenu dans l'heure, jour et nuit, des demandes d'adhésion qui attendent sur le site du clan, sans aucun nom, et du résultat de chaque sauvegarde chiffrée. Les demandes se traitent ici : ${SITE}/direction#demandes`,
      note: { newest_id: null, reminded_at: null },
    });
    // La nuit aussi.
    expect(staffNotice(first, new Date("2026-11-08T22:30:00Z"), SITE).send).toBe(true);
    // Une fois noté, plus jamais ; et la première demande qui suit est bien annoncée.
    const noted = { newest_id: null, reminded_at: null };
    expect(staffNotice(digest({ pending: 0, newest_id: null, oldest_at: null, notice: noted }), NOW, SITE).send).toBe(false);
    expect(staffNotice(digest({ pending: 1, newest_id: 1, oldest_at: hoursAgo(1), notice: noted }), NOW, SITE)).toMatchObject({ send: true, kind: "nouvelle" });
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

  it("laisse une note lisible sans compte GitHub quand le message part, avec la provenance du lien mais jamais le lien", async () => {
    const { lines } = await run(async () => new Response(null, { status: 204 }), { via: "direction" });
    expect(lines).toContain("::notice::Encadrement : message « nouvelle » envoyé sur Discord (lien réglé dans la Direction).");
    expect(lines.join("\n")).not.toContain("jeton-faux");
    const secret = await run(async () => new Response(null, { status: 204 }), { via: "secret" });
    expect(secret.lines).toContain("::notice::Encadrement : message « nouvelle » envoyé sur Discord (lien du secret GitHub).");
    // Rien d'envoyé, pas de note : Discord refuse.
    const refused = await run(async () => new Response(null, { status: 500 }), { via: "secret" });
    expect(refused.lines.some((line) => line.startsWith("::notice::"))).toBe(false);
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

  it("note la mise en service avant de l'envoyer : elle part une fois au plus, même si Discord ou l'enregistrement flanchent", async () => {
    const first = digest({ pending: 0, newest_id: null, oldest_at: null, notice: null });
    const sent = await run(async () => new Response(null, { status: 204 }), { digest: first });
    expect(sent.result).toBe("sent");
    expect(sent.notes).toEqual([{ newest_id: null, reminded_at: null }]);
    expect(JSON.parse(String(sent.calls[0]?.init.body)).content).toContain("est en place");
    // Discord refuse : c'est noté quand même, le message ne repartira pas ; l'avertissement signale le lien.
    const refused = await run(async () => new Response(null, { status: 404 }), { digest: first });
    expect(refused.result).toBe("failed");
    expect(refused.notes).toEqual([{ newest_id: null, reminded_at: null }]);
    expect(refused.lines.some((line) => line.startsWith("::warning::"))).toBe(true);
    // L'enregistrement échoue : rien n'est envoyé, l'essai reprend au passage suivant.
    const calls: string[] = [];
    const failingNote = sendStaffNotice({
      webhook: WEBHOOK,
      digest: first,
      now: NOW,
      siteUrl: SITE,
      fetch: (async (url: string) => {
        calls.push(url);
        return new Response(null, { status: 204 });
      }) as unknown as typeof fetch,
      note: async () => {
        throw new Error("lecture seule");
      },
      log: () => undefined,
    });
    await expect(failingNote).rejects.toThrow("lecture seule");
    expect(calls).toEqual([]);
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

describe("les notes sur les avis partis dès la demande", () => {
  it("ne disent rien sans avis relu, ni avec un serveur d'avant la migration", () => {
    expect(instantNotes({})).toEqual([]);
    expect(instantNotes({ instant: { accepted: 0, refused: 0 } })).toEqual([]);
  });
  it("disent qu'un avis a été accepté ou refusé, sans nombre ni lien", () => {
    const lines = instantNotes({ instant: { accepted: 2, refused: 1 } });
    expect(lines).toEqual([
      "::notice::Encadrement : avis parti dès la demande, accepté par Discord.",
      "::notice::Encadrement : avis parti dès la demande, refusé par Discord ou resté sans réponse : il ne compte pas comme annoncé.",
    ]);
    expect(lines.join("\n")).not.toMatch(/\d|https?:/);
  });
});

describe("les demandes annoncées dès leur arrivée (migration 20261112000600)", () => {
  const SQL = readFileSync("supabase/migrations/20261112000600_demandes_annoncees_aussitot.sql", "utf8").replaceAll("\r\n", "\n");
  const body = (name: string) => {
    const start = SQL.indexOf(`create or replace function ${name}(`);
    const open = SQL.indexOf("$$", start);
    return SQL.slice(start, SQL.indexOf("$$;", open + 2) + 3);
  };
  const trigger = body("internal.announce_request_now");
  const content = trigger.slice(trigger.indexOf("'content',"), trigger.indexOf("'allowed_mentions'"));

  it("ne fait qu'ajouter : rien n'est retiré, sauf ses propres lignes de plus de deux jours", () => {
    expect(SQL).not.toMatch(/\b(drop|truncate)\b/i);
    expect([...SQL.matchAll(/delete from ([\w.]+)/g)].map((m) => m[1])).toEqual(["internal.staff_instant_notices"]);
  });
  it("ferme sa table et ses fonctions : seule la clé de service lit staff_digest", () => {
    expect(SQL).toContain("alter table internal.staff_instant_notices enable row level security;");
    expect(SQL).toContain("revoke all on internal.staff_instant_notices from public, anon, authenticated;");
    for (const sig of ["internal.staff_quiet_hour(timestamptz)", "internal.announce_request_now()", "public.staff_digest()"]) {
      expect(SQL, sig).toContain(`revoke all on function ${sig} from public, anon, authenticated;`);
    }
    expect(SQL).toContain("grant execute on function public.staff_digest() to service_role;");
    expect(SQL).not.toMatch(/grant [^;]* to [^;]*\b(anon|authenticated|public)\b/);
    for (const name of ["internal.announce_request_now", "public.staff_digest"]) expect(body(name), name).toContain("security definer set search_path = public, pg_temp");
  });
  it("demande au serveur s'il doit se taire, question à laquelle la migration 20261114000100 répond toujours non", () => {
    expect(trigger).toContain("if internal.staff_quiet_hour(now()) then return null; end if;");
    const LATER = readFileSync("supabase/migrations/20261114000100_plus_de_silence_la_nuit.sql", "utf8").replaceAll("\r\n", "\n");
    // Même signature, donc la même fonction remplacée, et le déclencheur n'a pas à changer.
    expect(LATER).toContain("create or replace function internal.staff_quiet_hour(p_at timestamptz) returns boolean");
    expect(LATER.slice(LATER.indexOf("as $$"), LATER.indexOf("$$;") + 3)).toBe("as $$\n  select false\n$$;");
    expect(LATER).toContain("revoke all on function internal.staff_quiet_hour(timestamptz) from public, anon, authenticated;");
    // Elle ne fait que remplacer une fonction : rien n'est retiré, rien n'est ouvert.
    expect(LATER).not.toMatch(/\b(drop|truncate|delete|grant)\b/i);
  });
  it("poste le même avis que le robot, vers les demandes de la Direction, sans nom et sans mention", () => {
    expect(trigger).toContain("'allowed_mentions', jsonb_build_object('parse', jsonb_build_array())");
    expect(content).not.toMatch(/new\.|discord_name|display_name|roster_username|claimed_text|user_id|\bnote\b/);
    // Le lien écrit dans le SQL est celui du robot.
    const link = `${clan.links.site}/direction#demandes`;
    expect(content).toContain(`' À traiter : ${link}'`);
    expect(staffNotice({ pending: 2, oldest_at: hoursAgo(26), newest_id: 12, notice: null }, NOW, SITE)).toMatchObject({
      send: true,
      text: `2 demandes d'adhésion attendent sur le site du clan. La plus ancienne attend depuis 26 h. À traiter : ${link}`,
    });
    // L'âge de la plus ancienne, au-delà de REMIND_AFTER_HOURS, écrit comme fmtDuration : des heures jusqu'à 48, puis des jours.
    expect(content).toContain(`now() - v_oldest > interval '${REMIND_AFTER_HOURS} hours'`);
    expect(content).toContain("' La plus ancienne attend depuis ' || case when v_hours < 48 then v_hours || ' h' else (v_hours / 24) || ' jours' end || '.'");
    expect([fmtDuration(47 * 3_600_000), fmtDuration(48 * 3_600_000)]).toEqual(["47 h", "2 jours"]);
    expect(content).toContain("' demandes attendent'");
  });
  it("passe après la validation par un rôle prévu, relit le statut, et n'arrête jamais la demande", () => {
    expect(SQL).toContain("create or replace trigger membership_staff_notice after insert on public.membership_requests");
    // Les déclencheurs d'un même moment passent dans l'ordre alphabétique de leur nom.
    expect("membership_staff_notice" > "membership_planned_role").toBe(true);
    expect(trigger).toContain("where id = new.id and status = 'pending'");
    expect(trigger).toContain("if auth.uid() is null or auth.uid() <> new.user_id then return null; end if;");
    expect(trigger).toMatch(/begin\n {2}begin\n[\s\S]*exception when others then\n {4}null;\n {2}end;\n {2}return null;\nend \$\$;$/);
  });
  it("rend la même réponse au robot, lit les demandes d'abord, et survit à une panne de pg_net", () => {
    const digestSql = body("public.staff_digest");
    for (const key of ["'ok'", "'pending'", "'oldest_at'", "'newest_id'", "'notice'", "'instant'"]) expect(digestSql, key).toContain(key);
    expect(digestSql.indexOf("from public.membership_requests")).toBeLessThan(digestSql.indexOf("net._http_response"));
    const read = digestSql.slice(digestSql.indexOf("net._http_response") - 400, digestSql.indexOf("net._http_response") + 400);
    expect(read).toContain("exception when others then");
    expect(SQL).toContain("notify pgrst, 'reload schema';");
  });
});
