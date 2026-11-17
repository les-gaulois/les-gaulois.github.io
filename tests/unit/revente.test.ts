import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPLACEMENTS_OBJETS, OBJETS } from "../../src/lib/gaulois";
import { lireMaRevente, lireRevente, messageDeLaRevente, motsDeLaClasse, regleDeLaRevente } from "../../src/lib/village/revente";

// La revente au jeu : ce que l'écran lit du serveur, ses mots, et ce que la migration promet.

const MIGRATION = readFileSync("supabase/migrations/20261117000400_revente_au_jeu.sql", "utf8");
const payant = (emplacement: (typeof EMPLACEMENTS_OBJETS)[number]): string => {
  const trouve = Object.entries(OBJETS[emplacement]).find(([, o]) => !o.gratuit && o.rarete && o.rarete !== "divin");
  if (!trouve) throw new Error("pas d'objet payant");
  return trouve[0];
};
const tete = payant("tete");
const taux = { achat: 70, pochette: 50 };
const reponse = (objets: unknown[], autre: Record<string, unknown> = {}): unknown => ({ ok: true, solde: 1200, taux, objets, ...autre });
const ligne = (autre: Record<string, unknown> = {}): Record<string, unknown> => ({ emplacement: "tete", objet: tete, rendu: 350, classe: "achat", quantite: 1, ...autre });

describe("ce qui peut se revendre", () => {
  it("lit le solde, les deux parts et les objets", () => {
    expect(lireMaRevente(reponse([ligne(), ligne({ emplacement: "arme", objet: payant("arme"), rendu: 50, classe: "pochette", quantite: 3 })]))).toEqual({
      solde: 1200,
      taux,
      objets: [
        { emplacement: "tete", objet: tete, rendu: 350, classe: "achat", quantite: 1 },
        { emplacement: "arme", objet: payant("arme"), rendu: 50, classe: "pochette", quantite: 3 },
      ],
    });
    expect(lireMaRevente(reponse([]))?.objets).toEqual([]);
  });

  it("laisse de côté un objet que le site ne connaît pas encore, sans cacher les autres", () => {
    expect(lireMaRevente(reponse([ligne({ objet: "objet-de-demain" }), ligne()]))?.objets).toHaveLength(1);
  });

  it("refuse une réponse mal formée", () => {
    expect(lireMaRevente(null)).toBeNull();
    expect(lireMaRevente({ ok: false, error: "not_validated" })).toBeNull();
    expect(lireMaRevente(reponse([], { solde: -1 }))).toBeNull();
    expect(lireMaRevente(reponse([], { taux: { achat: 70 } }))).toBeNull();
    expect(lireMaRevente(reponse([], { taux: { achat: 0, pochette: 50 } }))).toBeNull();
    expect(lireMaRevente(reponse([], { taux: { achat: 170, pochette: 50 } }))).toBeNull();
    expect(lireMaRevente(reponse([ligne({ rendu: 0 })]))).toBeNull();
    expect(lireMaRevente(reponse([ligne({ rendu: 12.5 })]))).toBeNull();
    expect(lireMaRevente(reponse([ligne({ classe: "marche" })]))).toBeNull();
    expect(lireMaRevente(reponse([ligne({ quantite: 0 })]))).toBeNull();
  });
});

describe("une revente faite", () => {
  it("lit ce que le jeu a rendu", () => {
    expect(lireRevente({ ok: true, solde: 1550, rendu: 350, objet: { emplacement: "tete", objet: tete }, reste: 0 })).toEqual({ solde: 1550, rendu: 350, objet: { emplacement: "tete", objet: tete }, reste: 0 });
  });

  it("refuse une réponse mal formée", () => {
    expect(lireRevente({ ok: false, error: "prix_change" })).toBeNull();
    expect(lireRevente({ ok: true, solde: 1550, rendu: 0, objet: { emplacement: "tete", objet: tete }, reste: 0 })).toBeNull();
    expect(lireRevente({ ok: true, solde: 1550, rendu: 350, objet: { emplacement: "tete", objet: "inconnu" }, reste: 0 })).toBeNull();
    expect(lireRevente({ ok: true, solde: 1550, rendu: 350, objet: { emplacement: "tete", objet: tete }, reste: -1 })).toBeNull();
  });
});

describe("les mots de la revente", () => {
  it("dit la règle avec les parts du serveur", () => {
    expect(regleDeLaRevente(taux)).toContain("70 % de son prix");
    expect(regleDeLaRevente(taux)).toContain("50 %");
    expect(regleDeLaRevente({ achat: 60, pochette: 40 })).toContain("60 % de son prix");
    expect(motsDeLaClasse("achat", taux)).toContain("70 %");
    expect(motsDeLaClasse("pochette", taux)).toContain("50 %");
  });

  it("a des mots pour chaque refus du serveur", () => {
    for (const code of ["pas_possede", "pas_revendable", "objet_porte", "objet_grave", "achete_au_marche", "prix_change", "mode_god"]) {
      expect(messageDeLaRevente(code), code).toBeTruthy();
      expect(MIGRATION, code).toContain(`internal.fail('${code}')`);
    }
    expect(messageDeLaRevente("not_validated")).toBeNull();
  });
});

describe("la migration de la revente", () => {
  it("rend 70 % d'un achat et 50 % d'une pochette, comme l'a choisi le pilote", () => {
    expect(MIGRATION).toMatch(/function internal\.revente_taux_achat\(\)[^$]*\$\$ select 70 \$\$/);
    expect(MIGRATION).toMatch(/function internal\.revente_taux_autre\(\)[^$]*\$\$ select 50 \$\$/);
  });

  it("rend 70 % du plus petit du prix et de ce qui avait été payé, et un droit ne sert qu'une fois", () => {
    // Un achat à l'étal du sentier, fait avec une remise, ne rend pas tout ce qu'il a coûté.
    expect(MIGRATION).toContain("least(p.prix, e.paye) * internal.revente_taux_achat() / 100");
    expect(MIGRATION).toContain("mouvement bigint primary key references internal.stateres_mouvements (id)");
    expect(MIGRATION).toContain("where not exists (select 1 from internal.village_reventes r where r.mouvement = e.id)");
  });

  it("n'ouvre aucun droit pour une pochette gagnée à la loterie ni pour un achat au marché", () => {
    expect(MIGRATION).toContain("l.nature = 'loterie_pochette' and l.cree_le = e.cree_le");
    expect(MIGRATION).toContain("m.nature in ('achat', 'pochette')");
    expect(MIGRATION).not.toContain("'marche_achat'");
  });

  it("n'ouvre ses fonctions qu'aux comptes connectés, et ne fait qu'ajouter", () => {
    for (const fonction of ["public.get_ma_revente()", "public.revendre_objet(text, text, integer)"]) {
      expect(MIGRATION).toContain(`revoke all on function ${fonction} from public, anon, authenticated;`);
      expect(MIGRATION).toContain(`grant execute on function ${fonction} to authenticated;`);
    }
    expect(MIGRATION).toContain("revoke all on table internal.village_reventes from public, anon, authenticated;");
    expect(MIGRATION).not.toMatch(/\b(drop|truncate)\b/i);
    // Les seules lignes retirées sont l'exemplaire revendu, dans l'inventaire de qui le revend.
    expect(MIGRATION.match(/delete from/gi)).toHaveLength(1);
    expect(MIGRATION).toContain("delete from internal.gaulois_inventaire i where i.user_id = v_uid and i.emplacement = p_emplacement and i.objet = p_objet;");
  });
});
