import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES } from "../../src/lib/compte/errors";
import { MOTIF_MAX, lireMontantDuDon, lirePanneauDuDon, nomDuMembre } from "../../src/lib/village/don";

const lire = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const SQL = lire("supabase/migrations/20261117000200_don_de_stateres.sql");
const ID = "3f0c1a52-9b7e-4c1d-8a55-0f6f2f6f9a01";

/** Le texte d'une fonction de la migration, de son « create » à son « end $$; » ou à son « $$; ». */
function fonction(nom: string): string {
  const debut = SQL.indexOf(`create or replace function ${nom}(`);
  expect(debut, nom).toBeGreaterThanOrEqual(0);
  const fin = SQL.indexOf("$$;", debut);
  return SQL.slice(debut, fin + 3);
}

describe("le don de statères", () => {
  it("ne montre rien à un compte qui n'y a pas droit", () => {
    expect(lirePanneauDuDon({ ok: true, permis: false })).toEqual({ permis: false });
  });

  it("lit le panneau du titulaire", () => {
    expect(
      lirePanneauDuDon({
        ok: true,
        permis: true,
        plafond: 100000,
        membres: [{ id: ID, nom: "Brennos", numero: 7 }],
        dons: [
          { le: "2026-11-17T10:00:00+00:00", nom: "Brennos", montant: 500, motif: "Concours" },
          { le: "2026-11-17T09:00:00+00:00", nom: "Brennos", montant: 1, motif: null },
        ],
      }),
    ).toEqual({
      permis: true,
      plafond: 100000,
      membres: [{ id: ID, nom: "Brennos", numero: 7 }],
      dons: [
        { le: "2026-11-17T10:00:00+00:00", nom: "Brennos", montant: 500, motif: "Concours" },
        { le: "2026-11-17T09:00:00+00:00", nom: "Brennos", montant: 1, motif: null },
      ],
    });
  });

  it("refuse une réponse mal formée", () => {
    const bon = { ok: true, permis: true, plafond: 100000, membres: [], dons: [] };
    expect(lirePanneauDuDon(bon)).not.toBeNull();
    for (const raw of [
      null,
      [],
      { ok: false, error: "forbidden" },
      { ok: true },
      { ok: true, permis: "oui" },
      { ...bon, plafond: 0 },
      { ...bon, membres: null },
      { ...bon, membres: [{ id: "moi", nom: "Brennos", numero: 7 }] },
      { ...bon, membres: [{ id: ID, nom: " ", numero: 7 }] },
      { ...bon, membres: [{ id: ID, nom: "Brennos" }] },
      { ...bon, membres: [{ id: ID, nom: "Brennos", numero: 0 }] },
      { ...bon, dons: [{ le: "hier", nom: "Brennos", montant: 5, motif: null }] },
      { ...bon, dons: [{ le: "2026-11-17T10:00:00+00:00", nom: "Brennos", montant: -5, motif: null }] },
      { ...bon, dons: [{ le: "2026-11-17T10:00:00+00:00", nom: "Brennos", montant: 5, motif: 3 }] },
    ]) {
      expect(lirePanneauDuDon(raw), JSON.stringify(raw)).toBeNull();
    }
  });

  it("nomme chaque membre avec son numéro, pour deux comptes au même nom", () => {
    expect(nomDuMembre({ id: ID, nom: "Brennos", numero: 7 })).toBe("Brennos (Gaulois n° 7)");
    expect(SQL).toContain("'numero', p.gaul_number");
  });

  it("ne lit qu'un montant entier, de 1 au plafond", () => {
    expect(lireMontantDuDon("1", 100000)).toBe(1);
    expect(lireMontantDuDon(" 1 500 ", 100000)).toBe(1500);
    expect(lireMontantDuDon("100000", 100000)).toBe(100000);
    for (const tape of ["", "0", "100001", "-5", "1,5", "1.5", "1e3", "cent", "12345678"]) {
      expect(lireMontantDuDon(tape, 100000), tape).toBeNull();
    }
  });

  it("a un message en français pour chaque refus du serveur", () => {
    const codes = new Set([...SQL.matchAll(/internal\.(?:fail|error_json)\('([a-z_]+)'/g)].map((m) => m[1]!));
    expect([...codes].sort()).toEqual(["forbidden", "invalid_request", "mode_god", "rate_limited", "unknown_member"]);
    expect([...codes].filter((code) => !(code in ERROR_MESSAGES))).toEqual([]);
  });

  it("ne porte aucun identifiant Discord dans le dépôt", () => {
    expect(SQL).not.toMatch(/\d{17,20}/);
    expect(SQL).not.toMatch(/insert into internal\.stateres_don_titulaire/);
  });

  it("ferme chaque fonction et chaque table avant de l'ouvrir à qui de droit", () => {
    const creees = new Set([...SQL.matchAll(/create or replace function ((?:public|internal)\.[a-z_]+)\(/g)].map((m) => m[1]!));
    const fermees = new Set([...SQL.matchAll(/revoke all on function ((?:public|internal)\.[a-z_]+)\(/g)].map((m) => m[1]!));
    expect([...creees].filter((f) => !fermees.has(f))).toEqual([]);
    for (const t of ["stateres_don_titulaire", "stateres_dons"]) {
      expect(SQL).toContain(`alter table internal.${t} enable row level security;`);
      expect(SQL).toContain(`revoke all on table internal.${t} from public, anon, authenticated;`);
    }
    // Seules les deux fonctions du panneau s'ouvrent, et aux seuls comptes connectés.
    expect([...SQL.matchAll(/^grant execute on function (.+) to (\w+);$/gm)].map((m) => `${m[1]} ${m[2]}`)).toEqual([
      "public.get_stateres_don() authenticated",
      "public.donner_stateres(uuid, integer, text, uuid) authenticated",
    ]);
  });

  it("vérifie le titulaire avant tout, dans les deux fonctions", () => {
    const lireF = fonction("public.get_stateres_don");
    const donner = fonction("public.donner_stateres");
    expect(lireF).toContain("if v_uid is null or not internal.stateres_don_permis() then\n    return jsonb_build_object('ok', true, 'permis', false);");
    // Le droit est la première instruction du don : rien ne se lit ni ne s'écrit avant.
    expect(donner.slice(donner.indexOf("begin\n") + 6).trimStart().startsWith("if v_uid is null or not internal.stateres_don_permis() then return internal.error_json('forbidden', ''); end if;")).toBe(true);
    // Le titulaire se reconnaît par l'identifiant venu de Discord, sur un compte validé.
    const permis = fonction("internal.stateres_don_permis");
    expect(permis).toContain("join internal.stateres_don_titulaire t on t.discord_id = l.discord_id");
    expect(permis).toContain("where p.user_id = auth.uid() and p.status = 'validated'");
    expect(SQL).not.toMatch(/raw_user_meta_data|email/);
  });

  it("borne le don, ne le fait qu'une fois par clé et le note", () => {
    const donner = fonction("public.donner_stateres");
    expect(fonction("internal.stateres_don_plafond")).toContain("select 100000");
    expect(SQL).toContain("montant integer not null check (montant between 1 and 100000)");
    expect(donner).toContain("p_montant not between 1 and internal.stateres_don_plafond()");
    expect(SQL).toContain(`char_length(motif) between 1 and ${MOTIF_MAX}`);
    expect(donner).toContain(`char_length(coalesce(v_motif, '')) > ${MOTIF_MAX}`);
    expect(SQL).toContain("cle uuid not null unique");
    const deja = donner.indexOf("if exists (select 1 from internal.stateres_dons d where d.cle = p_cle) then return public.get_stateres_don(); end if;");
    const ecrit = donner.indexOf("insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (p_user, 'don', p_montant,");
    expect(deja).toBeGreaterThan(0);
    expect(ecrit).toBeGreaterThan(deja);
    expect(donner).toContain("p.user_id = p_user and p.status = 'validated'");
    expect(donner).toContain("perform internal.log_admin(v_uid, 'stateres_don', p_user, jsonb_build_object('montant', p_montant));");
  });

  it("ne rend jamais un solde", () => {
    expect(SQL).not.toMatch(/stateres_soldes/);
    expect(fonction("public.get_stateres_don")).not.toMatch(/solde/);
  });

  it("garde le déclencheur du mode GOD, avec le don parmi les vrais gains", () => {
    const avant = lire("supabase/migrations/20261116001200_loterie_du_lundi.sql");
    const d = avant.indexOf("create or replace function internal.village_god_mouvement(");
    const ancien = avant.slice(d, avant.indexOf("$$;", d) + 3);
    expect(fonction("internal.village_god_mouvement")).toBe(ancien.replace("'marche_vente', 'loterie_lot')", "'marche_vente', 'loterie_lot', 'don')"));
  });
});
