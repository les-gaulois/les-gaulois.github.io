import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMPTE_OPENFRONT_URL, DEBUT_DU_LIEN, identifiantDuLien, lienAttendu, profilOpenFront } from "../../src/lib/compte/lien-openfront";
import type { Me, MyRequest } from "../../src/lib/compte/types";

const SQL = readFileSync("supabase/migrations/20261114000800_lien_openfront_obligatoire.sql", "utf8").replace(/\r\n/g, "\n");
const LIB = readFileSync("src/lib/compte/lien-openfront.ts", "utf8");

describe("le lien du profil OpenFront", () => {
  it("donne l'identifiant du lien que copie « Partager le profil »", () => {
    expect(identifiantDuLien("https://openfront.io/player/AbC-123_x")).toBe("AbC-123_x");
    expect(identifiantDuLien("  https://openfront.io/player/AbC-123_x  ")).toBe("AbC-123_x");
    expect(identifiantDuLien("https://openfront.io/player/AbC/")).toBe("AbC");
    expect(identifiantDuLien("https://openfront.io/player/AbC?tab=games")).toBe("AbC");
    expect(identifiantDuLien("https://www.openfront.io/player/AbC")).toBe("AbC");
    expect(identifiantDuLien("https://OpenFront.io/player/AbC")).toBe("AbC");
    expect(identifiantDuLien("http://openfront.io/player/AbC")).toBe("AbC");
    expect(identifiantDuLien("openfront.io/player/AbC")).toBe("AbC");
  });

  it("lit aussi les chemins de version et de serveur de jeu, et l'ancienne forme du lien", () => {
    expect(identifiantDuLien("https://openfront.io/v/aac56bb/player/AbC")).toBe("AbC");
    expect(identifiantDuLien("https://openfront.io/w3/player/AbC")).toBe("AbC");
    expect(identifiantDuLien("https://openfront.io/v/aac56bb/w12/player/AbC")).toBe("AbC");
    expect(identifiantDuLien("https://openfront.io/#modal=profile&publicID=AbC")).toBe("AbC");
    expect(identifiantDuLien("https://openfront.io/#publicID=AbC&modal=profile")).toBe("AbC");
  });

  it("trouve le lien au milieu d'autres mots", () => {
    expect(identifiantDuLien("Mon profil : https://openfront.io/player/AbC merci")).toBe("AbC");
  });

  it("refuse tout ce qui n'est pas un lien de profil", () => {
    for (const texte of [
      "",
      "   ",
      "Brennos",
      "AbC-123_x",
      "https://openfront.io/",
      "https://openfront.io/player/",
      "https://openfront.io/player/AbC/games",
      "https://openfront.io/clan/GAL",
      "https://openfront.io/foo/player/AbC",
      `https://openfront.io/player/${"a".repeat(23)}`,
      "https://openfront.io/player/Ab%20C",
      "https://openfront.io/player/Ab.C",
      "https://openfront.io/#modal=account",
      "https://openfront.io/#modal=profile",
      "https://openfront.io/#modal=stats&publicID=AbC",
      "https://openfront.example/player/AbC",
      "https://openfront.io.example.com/player/AbC",
      "https://evil.com/?u=openfront.io/player/AbC",
      "ftp://openfront.io/player/AbC",
      "javascript:alert(1)",
    ]) {
      expect(identifiantDuLien(texte), texte).toBeNull();
    }
  });

  it("garde la même forme d'identifiant que le serveur, qui la revérifie", () => {
    const client = /const IDENTIFIANT = \/(.+)\/;/.exec(LIB)?.[1];
    const serveur = /if v_id !~ '(.+)' then perform internal\.fail\('invalid_profile_link'\)/.exec(SQL)?.[1];
    expect(client).toBe("^[A-Za-z0-9_-]{1,22}$");
    expect(serveur).toBe(client);
  });

  it("mène à la fenêtre « Compte » du jeu et au profil public", () => {
    expect(COMPTE_OPENFRONT_URL).toBe("https://openfront.io/#modal=account");
    expect(profilOpenFront("AbC-123_x")).toBe(`${DEBUT_DU_LIEN}AbC-123_x`);
    expect(identifiantDuLien(profilOpenFront("AbC-123_x"))).toBe("AbC-123_x");
  });
});

describe("le lien attendu d'un compte", () => {
  const demande = (status: MyRequest["status"]): MyRequest => ({ id: 1, status, reason: null, in_roster: false, roster_username: null, created_at: "2026-11-14T10:00:00Z", decided_at: null });
  const compte = (me: Partial<Me>): Me => ({ signed_in: true, status: "pending", request: null, ...me });

  it("est demandé avant tout à un compte en attente qui n'a encore rien envoyé", () => {
    expect(lienAttendu(compte({}))).toBe(true);
    expect(lienAttendu(compte({ request: undefined }))).toBe(true);
  });

  it("ne ferme rien à qui a déjà envoyé une demande, même refusée, annulée ou à refaire", () => {
    for (const status of ["pending", "refused", "cancelled", "approved"] as const) expect(lienAttendu(compte({ request: demande(status) })), status).toBe(false);
  });

  it("ne l'est pas pour un compte validé, suspendu ou déconnecté", () => {
    expect(lienAttendu(compte({ status: "validated" }))).toBe(false);
    expect(lienAttendu(compte({ status: "suspended" }))).toBe(false);
    expect(lienAttendu({ signed_in: false })).toBe(false);
  });
});

describe("la demande par le lien, côté serveur", () => {
  const corps = SQL.slice(SQL.indexOf("create or replace function public.request_membership_link("), SQL.indexOf("revoke all on function public.request_membership_link"));

  it("ne garde jamais l'identifiant en clair, et ne le prend jamais pour un pseudo", () => {
    expect(corps).toContain("values (v_uid, v_hash, null, v_entry.username, v_entry.public_id_hash is not null, v_note);");
    expect(corps).toContain("v_hash := internal.hash_public_id(v_id);");
    expect(corps).toContain("select * into v_entry from public.clan_roster where public_id_hash = v_hash;");
    expect(corps).not.toContain("username) = lower(");
  });

  it("garde les refus de la demande d'avant", () => {
    for (const code of ["rate_limited", "not_signed_in", "suspended", "already_validated", "invalid_note", "request_open", "already_linked"]) {
      expect(corps, code).toMatch(new RegExp(`internal\\.(fail|error_json)\\('${code}'`));
    }
    expect(corps).toContain("char_length(coalesce(v_note, '')) > 300");
  });

  it("n'est ouverte qu'aux comptes connectés, et ferme l'ancienne demande par pseudo", () => {
    expect(SQL).toContain("revoke all on function public.request_membership_link(text, text) from public, anon, authenticated;\ngrant execute on function public.request_membership_link(text, text) to authenticated;");
    expect(SQL).toContain("revoke all on function public.request_membership(text, text) from public, anon, authenticated;");
    expect(SQL).not.toMatch(/grant execute on function public\.request_membership\(/);
    expect(SQL).not.toMatch(/\b(drop|truncate|delete)\b/i);
  });
});
