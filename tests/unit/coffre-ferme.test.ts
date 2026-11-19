import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * L'arrêt du coffre du druide (décision du pilote, 19 novembre 2026, « Tout de suite, mises rendues ») : la migration qui
 * ferme le jeu et rend la cagnotte à ceux qui l'ont payée. Essayée en entier sur PGlite après toutes les migrations du dépôt
 * (une partie jouée, le fichier collé deux fois) ; ce test garde ses règles écrites.
 */
const lire = (nom: string): string => readFileSync(`supabase/migrations/${nom}.sql`, "utf8").split("\r\n").join("\n");
const ferme = lire("20261121000400_coffre_ferme_mises_rendues");
/** Le SQL sans ses commentaires : ce qui s'exécute. */
const code = ferme
  .split("\n")
  .filter((ligne) => !ligne.trimStart().startsWith("--"))
  .join("\n");

/** Les natures que la règle du mode GOD laisse passer comme de vrais gains. */
const vraisGains = (sql: string): string[] => {
  const debut = sql.lastIndexOf("create or replace function internal.village_god_mouvement()");
  const ligne = sql.slice(debut).split("\n").find((l) => l.includes("then return new; end if;") && l.includes("'victoire'"));
  return [...(ligne ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1] ?? "");
};

/** La dernière définition d'une fonction du coffre dans les migrations du dépôt, celle qui tourne en base. */
const derniere = (nom: string): string => {
  const debut = `create or replace function public.${nom}(`;
  const fichier = readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => lire(f.slice(0, -4)))
    .filter((sql) => sql.includes(debut))
    .at(-1);
  if (!fichier) return "";
  const corps = fichier.slice(fichier.lastIndexOf(debut));
  return corps.slice(0, corps.indexOf("end $$;"));
};

describe("l'arrêt du coffre du druide", () => {
  it("s'appuie sur les fonctions du coffre en base : verrou des réglages d'abord, coffre fermé refusé, essai annulé ignoré", () => {
    for (const nom of ["coffre_ouvrir", "coffre_indice"]) {
      const corps = derniere(nom);
      expect(corps).toContain("select * into r from internal.coffre_reglages where id for update;");
      expect(corps).toContain("if not found or not r.ouvert then\n    return jsonb_build_object('ok', false, 'error', 'closed');");
      // Le refus vient avant toute écriture : ni essai gardé, ni statère pris.
      expect(corps.indexOf("'closed'")).toBeLessThan(corps.indexOf("insert into"));
    }
    const clore = derniere("coffre_clore");
    expect(clore.indexOf("perform 1 from internal.coffre_reglages where id for update;")).toBeGreaterThan(0);
    expect(clore.indexOf("perform 1 from internal.coffre_reglages where id for update;")).toBeLessThan(clore.indexOf("village_debiter"));
    expect(clore).toContain("where id = p_essai and reponse is null and not annule\n  returning * into e;\n  if not found then\n    return jsonb_build_object('ok', false, 'error', 'unknown_attempt');");
    expect(clore.indexOf("'unknown_attempt'")).toBeLessThan(clore.indexOf("village_debiter"));
  });

  it("ferme le coffre et annule les essais encore sans réponse, sous le verrou des réglages", () => {
    expect(code).toContain("select cagnotte into v_cagnotte from internal.coffre_reglages where id for update;");
    expect(code).toContain("update internal.coffre_reglages set ouvert = false where id and ouvert;");
    expect(code).toContain("update internal.coffre_essais set annule = true where reponse is null and not annule;");
  });

  it("rend à chacun ce qu'il a payé, mises et lettres, depuis la dernière cagnotte versée, une seule fois", () => {
    expect(code).toContain("where v.nature = 'coffre_gain';");
    expect(code).toContain("where v.nature in ('coffre_mise', 'coffre_indice')");
    expect(code).toContain("and substring(v.ref from '^manche/([0-9]+)$')::bigint > v_versee");
    expect(code).toContain("where d.nature = 'coffre_rendu' and d.user_id = v.user_id and d.ref = v.ref)");
    expect(code).toContain("values (q.user_id, 'coffre_rendu', q.paye, q.ref);");
    // Rien n'est créé : ni prime, ni part, ni gain, ni plus que la cagnotte (tout s'arrête alors, fermeture comprise).
    expect(code).not.toMatch(/'coffre_(prime|part|gain)'\s*,/);
    expect(code).toContain("if v_rendu > coalesce(v_cagnotte, 0) then\n    raise exception");
    expect(code).toContain("set cagnotte = cagnotte - v_rendu::integer where id;");
    expect(code).not.toContain("greatest(");
  });

  it("ne supprime ni ne vide rien", () => {
    expect(code).not.toMatch(/\b(drop|truncate)\b/i);
    expect(code).not.toMatch(/\bdelete\s+from\b/i);
    expect(code).not.toMatch(/\bcron\.(unschedule|schedule)\b/);
  });

  it("garde vrais, pendant un essai du mode GOD, les gains d'avant, et y ajoute le remboursement du coffre", () => {
    // La version d'avant : la dernière migration, plus ancienne que celle-ci, qui définit la règle du mode GOD.
    const precedente = readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql") && f < "20261121000400")
      .sort()
      .map((f) => lire(f.slice(0, -4)))
      .filter((sql) => sql.includes("create or replace function internal.village_god_mouvement()"))
      .at(-1);
    const avant = vraisGains(precedente ?? "");
    expect(avant.length).toBeGreaterThan(0);
    expect(vraisGains(ferme)).toEqual([...avant, "coffre_rendu"]);
    expect(code).toContain("revoke all on function internal.village_god_mouvement() from public, anon, authenticated;");
  });
});
