/**
 * Les règles d'accès de la carte de l'alliance, lues dans ses migrations : les essais sur un vrai Postgres ne sont pas dans
 * le dépôt (docs/DIRECTION.md, « Ce qui n'a pas été vérifié »), ce test garde au moins leur écriture. Une migration qui
 * remplacerait l'une de ces fonctions sans la règle ferait échouer ce test, si elle est ajoutée à `MIGRATIONS`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATIONS = ["20261113000400_alliances_sur_la_carte", "20261113000500_allies_acceptes_par_l_encadrement"];
const sql = Object.fromEntries(MIGRATIONS.map((name) => [name, readFileSync(`supabase/migrations/${name}.sql`, "utf8").replace(/\r\n/g, "\n")]));
const derniere = sql[MIGRATIONS.at(-1)!]!;

/** Le corps de la dernière version d'une fonction, dans l'ordre des migrations. */
function corps(nom: string): string {
  for (const name of [...MIGRATIONS].reverse()) {
    const texte = sql[name]!;
    const debut = texte.lastIndexOf(`create or replace function ${nom}(`);
    if (debut < 0) continue;
    const ouverture = texte.indexOf("$$", debut);
    return texte.slice(ouverture, texte.indexOf("$$", ouverture + 2));
  }
  throw new Error(`fonction introuvable : ${nom}`);
}

describe("la carte de l'alliance, côté serveur", () => {
  it("n'ouvre aucune fonction aux visiteurs, et ferme chacune avant de l'ouvrir aux comptes connectés", () => {
    for (const [name, texte] of Object.entries(sql)) {
      expect(texte, name).not.toMatch(/grant [^;]* to [^;]*\banon\b/);
      const publiques = [...texte.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]!);
      for (const fn of publiques) expect(texte, `${name} : ${fn}`).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated;`));
    }
  });

  it("ne laisse entrer un allié qu'une fois accepté par l'encadrement", () => {
    const acces = corps("internal.map_access");
    expect(acces).toContain("a.approved_at is not null");
    // Un Gaulois validé entre toujours ; un compte suspendu jamais.
    expect(acces).toContain("when p.status = 'validated'");
    expect(acces).toContain("when p.status = 'pending' and a.user_id is not null and a.approved_at is not null");
  });

  it("remet en attente un joueur qui accepte une nouvelle invitation", () => {
    const accepter = corps("public.accept_alliance_invite");
    expect(accepter).toContain("approved_at = null, approved_by = null");
    expect(accepter).toContain("if v_status = 'validated' then perform internal.fail('already_gaulois')");
    expect(accepter).toContain("discord_id is not null");
    expect(accepter).toContain("used_at is null and expires_at > now()");
  });

  it("réserve l'accord, le refus et la liste des alliés à l'encadrement, sans valeur nulle", () => {
    const accord = corps("public.approve_alliance_ally");
    expect(accord).toContain("internal.require_rank(2)");
    expect(accord).toContain("if p_approve is null then perform internal.fail('invalid_request')");
    expect(accord.match(/approved_at is null/g)?.length).toBe(2);
    expect(corps("public.list_alliance_allies")).toContain("internal.require_rank(2)");
  });

  it("n'accepte d'avance que les alliés entrés avant l'accord, une seule fois", () => {
    expect(derniere).toMatch(/if not exists \(\s*select 1 from information_schema\.columns[\s\S]*column_name = 'approved_at'\s*\) then[\s\S]*update internal\.alliance_allies set approved_at = joined_at where approved_at is null;\s*end if;/);
  });
});
