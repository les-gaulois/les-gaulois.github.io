import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Les règles du serveur ne sont plus vérifiées sur un vrai Postgres (docs/DIRECTION.md) : ce test relit la migration.
const SQL = readFileSync("supabase/migrations/20261109000200_gaulois_de_la_semaine.sql", "utf8");
const QG = readFileSync("supabase/migrations/20261109000100_qg_des_membres.sql", "utf8");
/** Le corps d'une fonction, jusqu'à son « end $$; ». Introuvable : le test échoue, au lieu de lire tout le fichier. */
const body = (name: string) => {
  const start = SQL.indexOf(`create function ${name}(`);
  const end = SQL.indexOf("end $$;", start);
  if (start === -1 || end === -1) throw new Error(`corps de ${name} introuvable`);
  return SQL.slice(start, end);
};
const between = (start: string, end?: string) => {
  const from = SQL.indexOf(start);
  const to = end === undefined ? SQL.length : SQL.indexOf(end, from);
  if (from === -1 || to === -1) throw new Error(`passage introuvable : ${start}`);
  return SQL.slice(from, to);
};

describe("le Gaulois de la semaine, côté serveur", () => {
  const functions = [...SQL.matchAll(/create function (public\.[a-z_]+)\(/g)].map((m) => m[1]!);

  it("se charge : chaque corps de fonction s'ouvre et se ferme par « $$ », jamais par un « $ » seul", () => {
    // Un « $ » seul ferait échouer toute la migration au collage dans l'éditeur SQL.
    expect(SQL.match(/(?<!\$)\$(?!\$)/g) ?? []).toEqual([]);
    const delimiters = SQL.split("$$").length - 1;
    const functionsCreated = [...SQL.matchAll(/\bcreate (?:or replace )?function\b/g)].length;
    expect(delimiters).toBe(2 * functionsCreated);
    for (const name of ["internal.paris_monday", "public.save_weekly_pick", "public.delete_weekly_pick", "public.get_member_faces"]) {
      expect(() => body(name), name).not.toThrow();
    }
  });

  it("ne fait qu'ajouter : rien n'est supprimé ni vidé", () => {
    expect(SQL).not.toMatch(/\bdrop\b|\btruncate\b|\balter table [^;]* drop\b/i);
    // Le seul `delete` retire le choix que l'accueil montre, à la demande de l'encadrement : de cette semaine, ou de la précédente.
    expect([...SQL.matchAll(/delete from/g)].length).toBe(1);
    const del = body("public.delete_weekly_pick");
    expect(del).toContain("where week between internal.paris_monday() - 7 and internal.paris_monday()");
    expect(del).toContain("delete from internal.weekly_picks where week = v_week");
  });

  it("ferme chaque nouvelle fonction à tout le monde, puis ne l'ouvre qu'aux comptes connectés", () => {
    expect(functions.sort()).toEqual(["public.delete_weekly_pick", "public.get_member_faces", "public.save_weekly_pick"]);
    for (const name of functions) {
      expect(SQL, name).toMatch(new RegExp(`revoke all on function ${name.replace(".", "\\.")}\\([^)]*\\) from public, anon, authenticated;`));
      expect(SQL, name).toMatch(new RegExp(`grant execute on function ${name.replace(".", "\\.")}\\([^)]*\\) to authenticated;`));
      expect(SQL, name).not.toMatch(new RegExp(`grant execute on function ${name.replace(".", "\\.")}\\([^)]*\\) to [^;]*anon`));
    }
    for (const name of ["internal.paris_monday", "internal.shown_weekly_pick"]) {
      expect(SQL, name).toMatch(new RegExp(`revoke all on function ${name.replace(".", "\\.")}\\(\\) from public, anon, authenticated;`));
    }
    // La table est privée, comme les idées : l'API ne la montre à personne.
    expect(SQL).toContain("create table internal.weekly_picks (");
    expect(SQL).toContain("alter table internal.weekly_picks enable row level security;");
    expect(SQL).toContain("revoke all on internal.weekly_picks from public, anon, authenticated;");
  });

  it("ne laisse choisir que l'encadrement, et seulement un pseudo de la liste officielle, sans ambiguïté", () => {
    for (const name of ["public.save_weekly_pick", "public.delete_weekly_pick"]) expect(body(name), name).toContain("internal.require_rank(2)");
    const save = body("public.save_weekly_pick");
    expect(save).toContain("from public.clan_roster where lower(username) = lower(v_claim)");
    expect(save).toContain("if v_matches = 0 then perform internal.fail('pick_not_in_roster')");
    expect(save).toContain("if v_matches > 1 then perform internal.fail('pick_ambiguous')");
    expect(save).toContain("char_length(coalesce(v_note, '')) > 300");
    // Chaque choix, et chaque retrait, va au journal : le pseudo, jamais le mot.
    expect(save).toContain("internal.log_admin(v_actor, 'weekly_pick_saved', null, jsonb_build_object('week', v_week, 'player', v_player))");
    expect(body("public.delete_weekly_pick")).toContain("internal.log_admin(v_actor, 'weekly_pick_deleted'");
  });

  it("montre le choix à l'accueil public sans le nom de qui l'a fait, et garde les sondages au QG", () => {
    const shown = between("create function internal.shown_weekly_pick()", "/* ---------- L'accueil public");
    expect(shown).toContain("select week, player, note from internal.weekly_picks");
    expect(shown).not.toContain("author");
    const news = between("create or replace function public.get_site_news()", "/* ---------- La sauvegarde");
    expect(news).toContain("'weekly_pick', internal.shown_weekly_pick()");
    expect(news).toContain("'polls', '[]'::jsonb");
    expect(news).not.toContain("poll_counts");
    expect(news).not.toContain("author");
  });

  it("ne donne les visages qu'à un membre validé, au pseudo d'aujourd'hui, et seulement de ceux qui se montrent", () => {
    const faces = body("public.get_member_faces");
    expect(faces).toContain("perform internal.require_rank(1)");
    // Le pseudo vient de la liste officielle d'aujourd'hui, par l'empreinte : jamais du nom gardé à la validation.
    expect(faces).toContain("join public.clan_roster c on c.public_id_hash = l.openfront_hash");
    expect(faces).toContain("select c.username as pseudo");
    expect(faces).not.toContain("display_name");
    expect(faces).toContain("where p.status = 'validated' and p.show_to_members");
    // Ni photo absente, ni pseudo porté par deux membres.
    expect(faces).toContain("where f.avatar is not null");
    expect(faces).toContain("where lower(c2.username) = lower(f.pseudo)) = 1");
  });

  it("sauvegarde les choix sans rien perdre de la version d'avant", () => {
    const backup = between("create or replace function public.export_site()", "/* ---------- Règles d'accès");
    const before = QG.slice(QG.indexOf("create or replace function public.export_site()"), QG.indexOf("/* ---------- Règles d'accès"));
    expect(backup).toContain("'version', 3");
    expect(backup).toContain("'weekly_picks', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.weekly_picks t)");
    // Chaque ligne de la version 2, sauf son numéro, est reprise telle quelle : les soutiens restent des totaux.
    for (const line of before.split("\n").filter((l) => l.trim().startsWith("'") && !l.includes("'version'"))) {
      expect(backup, line.trim()).toContain(line.trim().replace(/\)$/, ""));
    }
  });
});
