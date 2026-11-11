import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROLE_PATTERN, WEBHOOK_PATTERN, isWaiting, isWebhookLink, lastSendSentence, outcomeSentence, parseDiscordCalls, roleOf, type LastSend } from "../../src/lib/compte/discord-appels";
import { ERROR_MESSAGES } from "../../src/lib/compte/errors";

const SQL = readFileSync("supabase/migrations/20261111000100_appels_sur_discord.sql", "utf8");
const body = (name: string) => {
  const start = SQL.indexOf(`create or replace function ${name}(`);
  return SQL.slice(start, SQL.indexOf("$$;", SQL.indexOf("$$", start) + 2));
};

// Un lien factice, assemblé en morceaux : écrit d'un bloc, il aurait la forme d'un vrai lien pour les outils qui cherchent des secrets.
const HOOK = ["https://discord.com/api/webhooks", "123456789012345678", `${"AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"}_-${"AbCdEfGhIjKlMnOpQrStUvWxYz012345"}`].join("/");
const NOW = "2026-11-11T14:00:00Z";
const set = (last: Record<string, unknown> | null) => ({ ok: true, now: NOW, set: true, role: "987654321098765432", updated_at: "2026-11-11T13:59:00Z", updated_by: "Chef", last });
const sent = (over: Record<string, unknown> = {}) => ({ kind: "test", at: "2026-11-11T13:59:58Z", failed: false, answered: true, status: 200, timed_out: false, error: null, ...over });
const last = (outcome: LastSend["outcome"], kind: LastSend["kind"] = "call"): LastSend => ({ kind, at: "2026-11-11T13:59:58Z", outcome });

describe("le lien du webhook", () => {
  it("accepte les liens que Discord donne, sous toutes leurs formes", () => {
    for (const text of [HOOK, ` ${HOOK} `, HOOK.replace("discord.com", "discordapp.com"), HOOK.replace("discord.com", "ptb.discord.com"), HOOK.replace("discord.com", "canary.discord.com"), HOOK.replace("/api/", "/api/v10/"), `${HOOK}/`, `${HOOK}?wait=true`]) {
      expect(isWebhookLink(text), text).toBe(true);
    }
  });

  it("refuse tout ce qui ne mène pas à un webhook de Discord", () => {
    for (const text of [
      "",
      HOOK.replace("https://", "http://"),
      HOOK.replace("discord.com", "discord.com.exemple.fr"),
      HOOK.replace("discord.com", "exemple.fr"),
      HOOK.replace("123456789012345678", "1234"),
      "https://discord.com/api/webhooks/123456789012345678/court",
      `${HOOK} suite`,
      "https://discord.com/channels/123456789012345678/123456789012345678",
      "javascript:alert(1)",
    ]) {
      expect(isWebhookLink(text), text).toBe(false);
    }
  });

  it("suit la même règle que le serveur", () => {
    expect(SQL).toContain(`'${WEBHOOK_PATTERN}'`);
    expect(SQL).toContain(`'${ROLE_PATTERN}'`);
    // Rangé sous une seule forme : le serveur ne peut poster que chez Discord.
    expect(SQL).toContain("check (webhook_url ~ '^https://discord\\.com/api/webhooks/[0-9]{17,20}/[A-Za-z0-9_-]{20,100}$')");
    expect(SQL).toContain("select 'https://discord.com/api/webhooks/' || m[1] || '/' || m[2]");
  });
});

describe("le rôle à mentionner", () => {
  it("se colle seul ou tel que Discord l'écrit", () => {
    expect(roleOf("987654321098765432")).toBe("987654321098765432");
    expect(roleOf(" <@&987654321098765432> ")).toBe("987654321098765432");
    expect(roleOf("")).toBeNull();
    expect(roleOf("   ")).toBeNull();
  });

  it("refuse un nom ou un identifiant d'autre chose", () => {
    for (const text of ["@Rassemblement", "Rassemblement", "12345", "<@987654321098765432>", "<#987654321098765432>", "rôle 987654321098765432"]) {
      expect(roleOf(text), text).toBe(false);
    }
  });
});

describe("la réponse du réglage", () => {
  it("se lit, sans lien ni jeton", () => {
    const state = parseDiscordCalls(set(sent()));
    expect(state).toEqual({ set: true, role: "987654321098765432", updatedAt: "2026-11-11T13:59:00Z", updatedBy: "Chef", last: { kind: "test", at: "2026-11-11T13:59:58Z", outcome: { state: "accepted" } } });
    expect(parseDiscordCalls({ ok: true, now: NOW, set: false })).toEqual({ set: false, role: null, updatedAt: null, updatedBy: null, last: null });
  });

  it("dit illisible une réponse sans heure ni état", () => {
    expect(parseDiscordCalls({ ok: true, set: true })).toBeNull();
    expect(parseDiscordCalls({ ok: true, now: NOW })).toBeNull();
    expect(parseDiscordCalls(null)).toBeNull();
  });

  it("n'invente pas un rôle illisible, ni un envoi sans date", () => {
    expect(parseDiscordCalls({ ...set(null), role: "Rassemblement" })?.role).toBeNull();
    expect(parseDiscordCalls(set({ kind: "test", at: "hier" }))?.last).toBeNull();
    expect(parseDiscordCalls(set({ kind: "autre", at: NOW }))?.last).toBeNull();
  });

  it("dit où en est le dernier envoi, d'après ce que le serveur a gardé", () => {
    const outcome = (over: Record<string, unknown>) => parseDiscordCalls(set(sent(over)))?.last?.outcome;
    expect(outcome({ status: 204 })).toEqual({ state: "accepted" });
    expect(outcome({ status: 404 })).toEqual({ state: "refused", status: 404 });
    expect(outcome({ timed_out: true, status: null })).toEqual({ state: "timeout" });
    expect(outcome({ status: null, error: "Couldn't resolve host name" })).toEqual({ state: "unsent", detail: "Couldn't resolve host name" });
    expect(outcome({ failed: true, answered: false, status: null, error: "function net.http_post does not exist" })).toEqual({ state: "unsent", detail: "function net.http_post does not exist" });
    // Sans réponse : elle arrive, elle se fait attendre, ou pg_net l'a effacée au bout de six heures.
    expect(outcome({ answered: false, status: null })).toEqual({ state: "waiting" });
    expect(outcome({ answered: false, status: null, at: "2026-11-11T13:50:00Z" })).toEqual({ state: "silent" });
    expect(outcome({ answered: false, status: null, at: "2026-11-11T07:00:00Z" })).toEqual({ state: "forgotten" });
  });

  it("relit le réglage tant que la réponse de Discord est attendue", () => {
    expect(isWaiting(parseDiscordCalls(set(sent({ answered: false, status: null }))))).toBe(true);
    expect(isWaiting(parseDiscordCalls(set(sent())))).toBe(false);
    expect(isWaiting(null)).toBe(false);
  });
});

describe("les phrases du dernier envoi", () => {
  it("disent la réponse de Discord, et ce qu'il faut faire", () => {
    expect(outcomeSentence(last({ state: "accepted" }, "test"))).toBe("Discord a accepté l'essai : il est dans le salon.");
    expect(outcomeSentence(last({ state: "accepted" }))).toBe("Discord a accepté le message.");
    expect(outcomeSentence(last({ state: "refused", status: 404 }))).toContain("webhook a sans doute été supprimé");
    expect(outcomeSentence(last({ state: "refused", status: 401 }))).toBe("Discord refuse ce lien (erreur 401). Collez le lien d'un nouveau webhook.");
    // Un refus 400 vient souvent d'un forum, pas toujours : la phrase ne l'affirme pas.
    expect(outcomeSentence(last({ state: "refused", status: 400 }))).toBe("Discord refuse le message (erreur 400). C'est souvent un salon de type forum : choisissez un salon textuel ordinaire.");
    expect(outcomeSentence(last({ state: "refused", status: 429 }))).toContain("trop de messages");
    expect(outcomeSentence(last({ state: "refused", status: 502 }))).toBe("Discord ne répond pas correctement pour l'instant (erreur 502).");
    expect(outcomeSentence(last({ state: "refused", status: 413 }))).toBe("Discord refuse le message (erreur 413).");
    expect(outcomeSentence(last({ state: "timeout" }))).toBe("Discord n'a pas répondu à temps.");
    expect(outcomeSentence(last({ state: "unsent", detail: null }))).toBe("Le message n'a pas pu partir du serveur.");
    expect(outcomeSentence(last({ state: "unsent", detail: "panne" }))).toBe("Le message n'a pas pu partir du serveur : panne.");
    expect(outcomeSentence(last({ state: "waiting" }))).toBe("En attente de la réponse de Discord…");
    expect(outcomeSentence(last({ state: "silent" }))).toBe("Discord n'a pas répondu.");
    expect(outcomeSentence(last({ state: "forgotten" }))).toBeNull();
  });

  it("disent quoi et quand, sans réponse inventée", () => {
    const when = (iso: string) => `[${iso}]`;
    expect(lastSendSentence(last({ state: "accepted" }, "test"), when)).toBe("Dernier envoi : l'essai, le [2026-11-11T13:59:58Z]. Discord a accepté l'essai : il est dans le salon.");
    expect(lastSendSentence(last({ state: "forgotten" }), when)).toBe("Dernier envoi : un appel, le [2026-11-11T13:59:58Z].");
  });
});

describe("les appels sur Discord, côté serveur", () => {
  const publics = [...SQL.matchAll(/create or replace function (public\.[a-z_]+)\(/g)].map((m) => m[1]!);
  const internals = [...SQL.matchAll(/create or replace function (internal\.[a-z_]+)\(/g)].map((m) => m[1]!);

  it("ferme chaque fonction à tout le monde, puis n'ouvre que celles du site aux comptes connectés", () => {
    expect(publics.sort()).toEqual(["public.clear_discord_calls", "public.end_lobby_call", "public.get_discord_calls", "public.get_lobby_calls", "public.save_discord_calls", "public.save_lobby_call", "public.test_discord_calls"]);
    for (const name of [...publics, ...internals]) {
      expect(SQL, name).toMatch(new RegExp(`revoke all on function ${name.replace(".", "\\.")}\\([^)]*\\) from public, anon, authenticated;`));
      expect(SQL, name).not.toMatch(new RegExp(`grant execute on function ${name.replace(".", "\\.")}\\([^)]*\\) to [^;]*anon`));
    }
    for (const name of publics) expect(SQL, name).toMatch(new RegExp(`grant execute on function ${name.replace(".", "\\.")}\\([^)]*\\) to authenticated;`));
    // Les outils ne s'ouvrent à personne, et ne passent pas par les droits de leur propriétaire : seules les fonctions du site les appellent.
    for (const name of internals) {
      expect(SQL, name).not.toMatch(new RegExp(`grant execute on function ${name.replace(".", "\\.")}\\(`));
      expect(body(name), name).not.toContain("security definer");
    }
    expect(SQL).toContain("alter table internal.discord_calls enable row level security;");
    expect(SQL).toContain("revoke all on internal.discord_calls from public, anon, authenticated;");
  });

  it("réserve le réglage aux admins et au fondateur, les appels aux membres validés", () => {
    for (const name of ["public.get_discord_calls", "public.save_discord_calls", "public.test_discord_calls", "public.clear_discord_calls"]) expect(body(name), name).toContain("internal.require_rank(3)");
    for (const name of ["public.save_lobby_call", "public.end_lobby_call", "public.get_lobby_calls"]) expect(body(name), name).toContain("internal.require_rank(1)");
  });

  it("ne rend jamais le lien du webhook au navigateur", () => {
    const state = body("public.get_discord_calls");
    expect(state).not.toMatch(/'webhook(_url)?',/);
    // Le jeton est retiré du détail d'une erreur.
    expect(state).toContain("split_part(v_hook.webhook_url, '/', 7), '…'");
  });

  it("ne notifie que le rôle réglé, et personne pour un essai", () => {
    const post = body("internal.discord_post");
    expect(post).toContain("jsonb_build_object('parse', jsonb_build_array(), 'roles', jsonb_build_array(v_hook.role_id))");
    expect(post).toContain("else jsonb_build_object('parse', jsonb_build_array())");
    expect(body("internal.discord_post_test")).toMatch(/false\s*\);\s*end/);
    expect(body("internal.discord_post_call")).toMatch(/true\s*\);\s*end/);
    // Le pseudo passe sans mise en forme : ni lien, ni mention, ni gras.
    expect(body("internal.discord_post_call")).toContain("internal.discord_plain(internal.lobby_caller_name(p_user))");
  });

  it("garde les règles des appels : identifiant de partie, 15 minutes, une minute entre deux salons", () => {
    const save = body("public.save_lobby_call");
    expect(save).toContain("v_game !~ '^[A-Za-z0-9]{8,10}$'");
    expect(save).toContain("now() + interval '15 minutes'");
    expect(save).toContain("interval '1 minute' then perform internal.fail('call_too_soon')");
    expect(body("internal.discord_post_call")).toContain("https://openfront.io/game/' || p_game");
    // Le nom est celui que montre le pop-up : le pseudo d'aujourd'hui, sinon le nom du compte.
    expect(body("internal.lobby_caller_name")).toContain("join public.clan_roster c on c.public_id_hash = l.openfront_hash");
    expect(body("public.get_lobby_calls")).toContain("case when p.show_to_members then internal.discord_avatar(p.user_id) end as avatar");
    expect(body("public.get_lobby_calls")).toContain("'discord', exists (select 1 from internal.discord_calls)");
    // Pour chaque appel : son message est-il parti ? La fenêtre de qui appelle ne le dit que dans ce cas.
    expect(body("public.get_lobby_calls")).toContain("k.discord_request is not null as discord,");
  });

  it("ne retire rien et peut être rejouée", () => {
    expect(SQL).not.toMatch(/\bdrop\s+(table|column|function|schema)\b/i);
    expect(SQL).not.toMatch(/\btruncate\b/i);
    expect(SQL).toContain("create extension if not exists pg_net with schema extensions;");
    expect(SQL).toContain("create table if not exists internal.discord_calls");
    expect(SQL).toContain("add column if not exists discord_request bigint");
    expect(SQL).not.toMatch(/create function /);
  });

  it("a un message en français pour chaque refus", () => {
    const codes = [...SQL.matchAll(/internal\.fail\('([a-z_]+)'/g)].map((m) => m[1]!);
    expect(codes).toEqual(expect.arrayContaining(["invalid_webhook", "invalid_role", "discord_not_set", "test_too_soon"]));
    for (const code of codes) expect(ERROR_MESSAGES[code], code).toBeTruthy();
  });
});
