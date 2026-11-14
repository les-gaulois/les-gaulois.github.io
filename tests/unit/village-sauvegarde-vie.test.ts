import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Sous Windows, Git rend les fichiers avec des fins de ligne CRLF : les motifs ci-dessous lisent des « \n ».
const lire = (nom: string) => readFileSync(`supabase/migrations/${nom}.sql`, "utf8").replace(/\r\n/g, "\n");
const V5 = lire("20261113002200_village_sauvegarde");
const V6 = lire("20261113002400_village_sauvegarde_vie");
const VIE = lire("20261113002300_village_vie");

/** Le corps d'export_site, ligne par ligne, sans la virgule de fin : une ligne de plus après la dernière en ajoute une. */
const lignes = (texte: string) => {
  const corps = texte.slice(texte.indexOf("create or replace function public.export_site()"), texte.indexOf("\n$$;"));
  return corps.split("\n").map((l) => l.trim().replace(/,$/, "")).filter((l) => l !== "");
};
/** Les clés de premier niveau de la sauvegarde : `'nom', (` ou `'nom', valeur`. */
const cles = (texte: string) => lignes(texte).flatMap((l) => (/^'([a-z_]+)', /.exec(l)?.[1] ? [/^'([a-z_]+)', /.exec(l)![1]!] : []));

describe("la sauvegarde, version 6", () => {
  it("reprend la version 5 à l'identique, et n'ajoute que le réglage et la dépense des bulles", () => {
    expect(V5).toContain("'version', 5");
    expect(V6).toContain("'version', 6");
    const v5 = lignes(V5).filter((l) => !l.startsWith("'version'"));
    const v6 = lignes(V6).filter((l) => !l.startsWith("'version'"));
    // Chaque ligne de la version 5 est dans la 6, dans le même ordre, jusqu'à la parenthèse qui ferme la sauvegarde.
    expect(v5.at(-1)).toBe(")");
    expect(v6.slice(0, v5.length - 1)).toEqual(v5.slice(0, -1));
    expect(v6.slice(0, v5.length - 1).length).toBeGreaterThan(35);
    expect(v6.slice(v5.length - 1)).toEqual([
      "-- Ajouts de la version 6 : le réglage et la dépense des bulles du village.",
      "'village_vie_reglage', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.village_vie_reglage t)",
      "'village_vie_depense', (select coalesce(jsonb_agg(to_jsonb(t) order by t.mois), '[]') from internal.village_vie_depense t)",
      ")",
    ]);
    expect(cles(V6)).toEqual([...cles(V5), "village_vie_reglage", "village_vie_depense"]);
    expect(cles(V5).length).toBeGreaterThan(25);
  });

  it("garde les deux tables de la vie du village qui ne se refont pas, jamais les bulles ni les états vocaux", () => {
    for (const table of ["village_vie_reglage", "village_vie_depense"]) {
      expect(VIE).toContain(`create table if not exists internal.${table} (`);
      expect(V6).toContain(`from internal.${table} t`);
    }
    expect(V6).not.toMatch(/internal\.village_vie t\b|replique|vocal/);
  });

  it("ne fait que remplacer la fonction, et la garde à la clé de service", () => {
    expect(V6.match(/create or replace function/g)).toHaveLength(1);
    expect(V6).not.toMatch(/\bdrop\b|\btruncate\b|delete from|insert into|update internal|alter table|create table/i);
    expect(V6).toContain("revoke all on function public.export_site() from public, anon, authenticated;\ngrant execute on function public.export_site() to service_role;");
    expect(V6.match(/^grant /gm)).toHaveLength(1);
  });
});
