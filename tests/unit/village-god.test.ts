import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES } from "../../src/lib/compte/errors";
import { lireModeGod } from "../../src/lib/village/god";

const SQL = readFileSync("supabase/migrations/20261116000900_village_mode_god.sql", "utf8");

describe("le mode GOD du village", () => {
  it("ne montre rien à un compte qui n'y a pas droit", () => {
    expect(lireModeGod({ ok: true, permis: false })).toEqual({ permis: false });
  });

  it("lit l'essai éteint et l'essai allumé", () => {
    expect(lireModeGod({ ok: true, permis: true, actif: false, depuis: null, somme: 1000000 })).toEqual({ permis: true, actif: false, depuis: null, somme: 1000000 });
    expect(lireModeGod({ ok: true, permis: true, actif: true, depuis: "2026-11-16T10:00:00+00:00", somme: 1000000 })).toEqual({ permis: true, actif: true, depuis: "2026-11-16T10:00:00+00:00", somme: 1000000 });
  });

  it("refuse une réponse mal formée", () => {
    for (const raw of [null, [], "oui", { ok: false, error: "forbidden" }, { ok: true }, { ok: true, permis: "oui" }, { ok: true, permis: true }, { ok: true, permis: true, actif: true, depuis: null, somme: 1000000 }, { ok: true, permis: true, actif: false, depuis: null, somme: 0 }, { ok: true, permis: true, actif: true, depuis: "hier", somme: 1000000 }]) {
      expect(lireModeGod(raw), JSON.stringify(raw)).toBeNull();
    }
  });

  it("a un message en français pour chaque refus du serveur", () => {
    const codes = new Set([...SQL.matchAll(/internal\.(?:fail|error_json)\('([a-z_]+)'/g)].map((m) => m[1]!));
    expect([...codes].sort()).toEqual(["forbidden", "mode_god", "no_gaulois", "not_signed_in", "not_validated", "offres_ouvertes", "rate_limited", "suspended"]);
    expect([...codes].filter((code) => !(code in ERROR_MESSAGES))).toEqual([]);
  });

  it("ne porte aucun identifiant Discord dans le dépôt", () => {
    expect(SQL).not.toMatch(/\d{17,20}/);
  });

  it("ferme chaque nouvelle fonction avant de l'ouvrir à qui de droit", () => {
    const creees = new Set([...SQL.matchAll(/create or replace function ((?:public|internal)\.[a-z_]+)\(/g)].map((m) => m[1]!));
    const fermees = new Set([...SQL.matchAll(/revoke all on function ((?:public|internal)\.[a-z_]+)\(/g)].map((m) => m[1]!));
    expect([...creees].filter((f) => !fermees.has(f))).toEqual([]);
    // Les trois boutons : tout compte connecté les appelle, chacun vérifie le titulaire lui-même.
    for (const f of ["get_village_god", "activer_village_god", "desactiver_village_god"]) {
      expect(SQL).toContain(`grant execute on function public.${f}() to authenticated;`);
      expect(SQL).toMatch(new RegExp(`function public\\.${f}\\(\\)[\\s\\S]*?internal\\.village_god_permis\\(\\)`));
    }
  });
});
