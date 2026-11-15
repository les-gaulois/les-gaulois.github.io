import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES } from "../../src/lib/compte/errors";
import { PREDICTION_STAKE_MAX } from "../../src/lib/compte/outils";
import { fmtInt } from "../../src/lib/format";

// Sous Windows, Git rend les fichiers avec des fins de ligne CRLF : les motifs ci-dessous lisent des « \n ».
const SQL = readFileSync("supabase/migrations/20261115000400_pronostics_avec_mise.sql", "utf8").replace(/\r\n/g, "\n");
const entre = (texte: string, debut: string, fin: string) => texte.slice(texte.indexOf(debut), texte.indexOf(fin, texte.indexOf(debut)));
/** Le corps d'une fonction de la migration, de son `create` au `$$;` qui la ferme. */
const fonction = (nom: string) => entre(SQL, `create or replace function ${nom}(`, "$$;\n");
const plain = (s: string | undefined) => s?.replace(/\s/g, " ");

describe("les pronostics avec mise, côté serveur", () => {
  it("garde la même mise permise que l'écran et que son message", () => {
    expect(fonction("internal.prediction_stake_max")).toContain(`select ${PREDICTION_STAKE_MAX}\n`);
    expect(SQL).toContain(`mise integer check (mise is null or mise between 0 and ${PREDICTION_STAKE_MAX})`);
    expect(plain(ERROR_MESSAGES["invalid_stake"])).toContain(plain(fmtInt(PREDICTION_STAKE_MAX)));
  });

  it("n'ajoute que : ni table ni colonne retirée ; seule l'ancienne fonction des pronostics disparaît", () => {
    expect(SQL).not.toMatch(/\bdrop (table|column)\b|\btruncate\b/i);
    expect([...SQL.matchAll(/\bdrop function if exists ([\w.]+\([^)]*\))/g)].map((m) => m[1])).toEqual(["public.save_prediction(integer)"]);
    // Les pronostics trop anciens, jamais une mise ni réglée ni rendue ; puis, dans get_qg_tools, les heures finies et les
    // vieux GG, comme dans la migration 20261111000400.
    expect([...SQL.matchAll(/\bdelete from ([\w.]+)/g)].map((m) => m[1])).toEqual(["internal.predictions", "internal.play_plans", "internal.gg"]);
    expect(fonction("internal.prediction_forget_old")).toContain("perform internal.prediction_refund_stale();\n  delete from internal.predictions pr");
    expect(fonction("internal.prediction_forget_old")).toContain("and (coalesce(pr.mise, 0) = 0 or exists (select 1 from internal.prediction_results r where r.week = pr.week));");
  });

  it("pose une fois : un second envoi ne change rien, sauf un pronostic d'avant les mises", () => {
    const poser = fonction("public.place_prediction");
    expect(poser).toContain("if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;");
    expect(poser).toContain("v_actor := internal.require_rank(1);");
    expect(poser).toContain("on conflict (week, user_id) do update set wins = excluded.wins, mise = excluded.mise, updated_at = now()\n      where pr.mise is null;\n    if not found then perform internal.fail('prediction_placed'); end if;");
    // La semaine affichée, et les remboursements avant de toucher au solde de l'appelant.
    expect(poser).toContain("if p_week is distinct from v_week then perform internal.fail('prediction_closed'); end if;");
    expect(poser.indexOf("perform internal.prediction_forget_old();")).toBeLessThan(poser.indexOf("insert into internal.predictions"));
    expect(poser).toContain("perform internal.village_debiter(v_actor, 'pronostic_mise', p_stake, 'pronostic/' || v_week::text);");
  });

  it("règle une fois, sous la clé primaire des résultats, et paie dans l'ordre des comptes", () => {
    const regler = fonction("public.settle_predictions");
    expect(regler).toContain("insert into internal.prediction_results (week, wins, outcome) values (p_week, p_wins, 'regle') on conflict (week) do nothing;\n  if not found then");
    expect(regler).toContain("row_number() over (order by (v_pot * mise) % v_winning desc, updated_at, user_id) as rank");
    expect(regler).toContain("for v_row in select user_id, gain from internal.predictions where week = p_week and gain > 0 order by user_id loop");
    const rendre = fonction("internal.prediction_refund_stale");
    expect(rendre).toContain("insert into internal.prediction_results (week, wins, outcome) values (v_week, null, 'rendu') on conflict (week) do nothing;\n    if found then");
    expect(rendre).toContain("order by user_id loop");
    // Trois natures au journal, toutes sous la règle du journal (une minuscule, puis minuscules et soulignés).
    expect([...SQL.matchAll(/'(pronostic_[a-z]+)'/g)].map((m) => m[1]).sort()).toEqual(["pronostic_gain", "pronostic_mise", "pronostic_rendu"]);
  });

  it("ne montre ni le pronostic d'un autre avant la clôture, ni un solde d'un autre, ni un classement par montant", () => {
    const outils = fonction("public.get_qg_tools");
    const ouverte = entre(outils, "'predictions', jsonb_build_object(", "'closed', v_closed");
    expect(ouverte).toContain("'mine', (select wins from internal.predictions where week = v_target and user_id = v_actor)");
    expect(ouverte).toContain("'balance', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = v_actor), 0)");
    const mises = entre(ouverte, "'stakes', (", "'closed'");
    expect(mises).not.toContain("wins");
    expect(mises).toContain("order by p.status <> 'validated', p.display_name");
    // Les semaines closes seulement.
    expect(outils).toContain("where internal.prediction_closes(w.week) <= now();");
    // Le nom d'un compte suspendu ne paraît pas.
    expect([...outils.matchAll(/case when p\.status = 'validated' then p\.display_name else 'Compte suspendu' end/g)]).toHaveLength(2);
  });

  it("ferme tout aux visiteurs, ouvre la pose aux comptes connectés et le règlement à la clé de service seule", () => {
    for (const nom of ["prediction_now()", "prediction_stake_max()", "prediction_refund_stale()", "prediction_forget_old()"]) {
      expect(SQL).toContain(`revoke all on function internal.${nom} from public, anon, authenticated;`);
      expect(SQL).not.toContain(`grant execute on function internal.${nom}`);
    }
    for (const signature of ["place_prediction(date, integer, integer)", "settle_predictions(date, integer)", "get_qg_tools()"]) {
      expect(SQL).toContain(`revoke all on function public.${signature} from public, anon, authenticated;`);
    }
    expect(SQL).toContain("grant execute on function public.place_prediction(date, integer, integer) to authenticated;");
    expect(SQL).toContain("grant execute on function public.get_qg_tools() to authenticated;");
    expect([...SQL.matchAll(/grant execute on function public\.settle_predictions\(date, integer\) to (\w+);/g)].map((m) => m[1])).toEqual(["service_role"]);
    expect(SQL).toContain("alter table internal.prediction_results enable row level security;\nrevoke all on table internal.prediction_results from public, anon, authenticated;");
  });
});
