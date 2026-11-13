/**
 * Les règles d'accès de la carte de l'alliance, lues dans ses migrations : les essais sur un vrai Postgres ne sont pas dans
 * le dépôt (docs/DIRECTION.md, « Ce qui n'a pas été vérifié »), ce test garde au moins leur écriture. Une migration qui
 * remplacerait l'une de ces fonctions sans la règle ferait échouer ce test, si elle est ajoutée à `MIGRATIONS`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATIONS = ["20261113000400_alliances_sur_la_carte", "20261113000500_allies_acceptes_par_l_encadrement", "20261113000600_zones_sans_chevauchement", "20261113000700_allies_dessinent_leurs_zones"];
const sql = Object.fromEntries(MIGRATIONS.map((name) => [name, readFileSync(`supabase/migrations/${name}.sql`, "utf8").replace(/\r\n/g, "\n")]));
const accordSql = sql["20261113000500_allies_acceptes_par_l_encadrement"]!;

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
    expect(accordSql).toMatch(/if not exists \(\s*select 1 from information_schema\.columns[\s\S]*column_name = 'approved_at'\s*\) then[\s\S]*update internal\.alliance_allies set approved_at = joined_at where approved_at is null;\s*end if;/);
  });

  it("garde l'encadrement par son rang et refuse une zone posée sur une autre, sous le verrou des zones", () => {
    const zone = corps("public.save_alliance_zone");
    expect(zone).toContain("v_actor := internal.require_rank(2);");
    const verrou = zone.indexOf("perform pg_advisory_xact_lock(hashtext('gal_alliance_zones'));");
    const regle = zone.indexOf("perform internal.fail('zone_overlap');");
    expect(verrou).toBeGreaterThan(0);
    // La règle se vérifie après le verrou et avant l'écriture : deux enregistrements en même temps ne se croisent pas.
    expect(regle).toBeGreaterThan(verrou);
    expect(regle).toBeLessThan(zone.indexOf("insert into internal.alliance_zones"));
    // Une zone reprise ne se compare pas à elle-même.
    expect(zone).toContain("where (p_id is null or z.id <> p_id)");
  });

  it("ouvre à un allié les zones de son clan seulement, vingt au plus, et le dit à la carte", () => {
    const zone = corps("public.save_alliance_zone");
    // L'encadrement par son rang, un allié par son accès à la carte ; tout autre compte est refusé.
    expect(zone).toContain("v_access := internal.require_map_access();");
    expect(zone).toMatch(/if v_staff then\s*(--[^\n]*\n\s*)*v_actor := internal\.require_rank\(2\);\s*elsif v_access ->> 'kind' = 'allie' then\s*v_actor := auth\.uid\(\);\s*else\s*perform internal\.fail\('forbidden'\);/);
    // Un allié ne dessine ni pour toute l'alliance, ni pour un autre clan.
    expect(zone).toContain("if not v_staff and (v_tag is null or v_tag <> v_access ->> 'tag') then perform internal.fail('forbidden'); end if;");
    // Il ne reprend pas la zone d'un autre clan : vérifié sur la ligne verrouillée, sous le verrou des zones, avant le chevauchement.
    const reprise = zone.indexOf("select tag into v_avant from internal.alliance_zones where id = p_id for update;");
    expect(reprise).toBeGreaterThan(zone.indexOf("perform pg_advisory_xact_lock(hashtext('gal_alliance_zones'));"));
    expect(reprise).toBeLessThan(zone.indexOf("perform internal.fail('zone_overlap');"));
    expect(zone).toContain("if not v_staff and (v_avant is null or v_avant <> v_access ->> 'tag') then perform internal.fail('forbidden'); end if;");
    expect(zone).toContain("if not v_staff and (select count(*) from internal.alliance_zones where tag = v_tag) >= 20 then");
    // La suppression suit la même règle.
    const suppression = corps("public.delete_alliance_zone");
    expect(suppression).toContain("v_actor := internal.require_rank(2);");
    expect(suppression).toContain("from internal.alliance_zones where id = p_id for update;");
    expect(suppression).toContain("if not v_staff and (v_tag is null or v_tag <> v_access ->> 'tag') then perform internal.fail('forbidden'); end if;");
    // La carte dit qui peut dessiner et modifier ; une zone de toute l'alliance n'est pas « inconnue » mais refusée.
    const carte = corps("public.get_alliance_map");
    expect(carte).toContain("'can_draw', v_staff or v_clan is not null");
    expect(carte).toContain("'can_edit', v_staff or coalesce(z.tag = v_clan, false)");
    expect(sql["20261113000700_allies_dessinent_leurs_zones"]).toContain("revoke all on function internal.map_name(uuid) from public, anon, authenticated;");
  });
});
