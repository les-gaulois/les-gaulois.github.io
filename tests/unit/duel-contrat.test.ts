import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES, errorMessage } from "../../src/lib/compte/errors";
import { REFUS_DU_DUEL } from "../../src/lib/village/contrat-duel";
import { empreintesDesFlammes } from "../../src/lib/village/flammes-duel";
import type { SerieEnCours } from "../../src/lib/serie-en-cours";
import { hashPublicId } from "../../src/lib/compte/roster";

const SQL = ["20261122000100_duel_des_gaulois", "20261122000200_duel_boss_salon_corrections"].map((m) => readFileSync(`supabase/migrations/${m}.sql`, "utf8")).join("\n");
/** Les refus de tout le site que le duel emploie aussi. */
const COMMUNS = ["rate_limited", "invalid_request", "not_signed_in", "suspended", "not_validated", "no_gaulois", "mode_god"];
/** Les refus des salons du robot, recopiés de 20261115000200_salon_des_achats avec le salon des duels. */
const DES_SALONS = ["invalid_salon", "invalid_webhook", "discord_not_set", "test_too_soon"];

describe("les refus du duel", () => {
  it("sont ceux du contrat, plus les refus de tout le site", () => {
    const codes = new Set([...SQL.matchAll(/internal\.(?:fail|error_json)\('([a-z_]+)'/g), ...SQL.matchAll(/return '([a-z_]+)';/g)].map((m) => m[1]!));
    expect([...codes].filter((c) => !(REFUS_DU_DUEL as readonly string[]).includes(c) && !COMMUNS.includes(c) && !DES_SALONS.includes(c))).toEqual([]);
    for (const c of REFUS_DU_DUEL) expect(codes.has(c), c).toBe(true);
  });

  it("ont chacun un message en français, en mots plutôt qu'en signes", () => {
    for (const c of [...REFUS_DU_DUEL, ...COMMUNS]) {
      expect(ERROR_MESSAGES, c).toHaveProperty(c);
      expect(errorMessage(c), c).not.toMatch(/[<>=÷×%]/);
    }
  });
});

describe("les flammes de série envoyées au duel", () => {
  const serie = (victoires: number): SerieEnCours => ({ victoires } as SerieEnCours);

  it("ne gardent que les flammes qui brûlent, par leur empreinte, jamais l'identifiant", () => {
    const series = new Map([["joueurA", serie(5)], ["joueurB", serie(4)], ["joueurC", serie(12)]]);
    const e = empreintesDesFlammes(series);
    expect(e).toEqual([hashPublicId("joueurA"), hashPublicId("joueurC")].sort());
    for (const x of e) expect(x).toMatch(/^[0-9a-f]{64}$/);
    expect(e.join()).not.toContain("joueur");
    expect(empreintesDesFlammes(new Map())).toEqual([]);
  });
});
