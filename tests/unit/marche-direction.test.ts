import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLES_DE_PERIODE, LIGNES_DES_ECHANGES, accorde, delaiEnMots, lireMarcheDeLaDirection, partDesDemandesServies, remiseDesOffres, type PeriodeDuMarche } from "../../src/lib/village/marche-direction";

// Sous Windows, Git rend les fichiers avec des fins de ligne CRLF : les motifs ci-dessous lisent des « \n ».
const MIGRATION = readFileSync("supabase/migrations/20261119000200_tableau_du_marche.sql", "utf8").replace(/\r\n/g, "\n");
/** Le code seul, sans les lignes de commentaire ni les commentaires en bout de ligne. */
const CODE = MIGRATION.split("\n")
  .filter((l) => !/^\s*--/.test(l))
  .map((l) => l.replace(/\s--\s.*$/, ""))
  .join("\n");
const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(NUMBER_SPACES, " ");

const periode = (n: number): PeriodeDuMarche => Object.fromEntries(CLES_DE_PERIODE.map((c) => [c, n])) as unknown as PeriodeDuMarche;
const REPONSE = {
  ok: true,
  lu_le: "2026-11-19T15:00:00+00:00",
  rotation: { semaine: 0, depuis: "2026-11-19T11:47:48+00:00", change_le: "2026-11-24T20:30:00+00:00", en_rayon: 89, hors_rayon: 156 },
  ouvert: {
    offres: 4,
    vendeurs: 2,
    valeur: 3000,
    valeur_boutique: 4000,
    demandes: 3,
    demandeurs: 2,
    mis_de_cote: 2140,
    par_rarete: { commun: { offres: 1, demandes: 0 }, legendaire: { offres: 1, demandes: 2 } },
  },
  periodes: { sept_jours: periode(1), trente_jours: periode(2), total: periode(3) },
  par_jour: [
    { jour: "2026-11-18", achats: 3, pochettes: 1, ventes: 0, demandes: 0, reventes: 0, distribues: 556 },
    { jour: "2026-11-19", achats: 1, pochettes: 0, ventes: 2, demandes: 3, reventes: 1, distribues: 120 },
    { jour: "pas un jour", achats: 1, pochettes: 0, ventes: 0, demandes: 0, reventes: 0, distribues: 0 },
  ],
  par_semaine: [{ semaine: -1, debut: "2026-11-10T20:30:00+00:00", achats: 40, pochettes: 30, ventes: 0, demandes: 0 }],
  prix_30: [{ rarete: "legendaire", ventes: 2, part_moyenne: 80 }, { rarete: "inconnue", ventes: 1, part_moyenne: 10 }],
  delais_30: { offres: 7200, demandes: null },
  plus_demandes: [{ emplacement: "tete", objet: "casque-or", nombre: 2, prix: 2000 }, { emplacement: "tete", objet: "inconnu", nombre: 1, prix: 10 }],
  plus_offerts: [{ emplacement: "arme", objet: "hache", nombre: 1, prix: 120 }],
  dernieres_ventes: [
    { le: "2026-11-19T14:00:00+00:00", emplacement: "tete", objet: "casque-or", prix: 2000, prix_boutique: 2500, voie: "demande", hors_rayon: true },
    { le: "2026-11-19T13:00:00+00:00", emplacement: "arme", objet: "hache", prix: 200, prix_boutique: 250, voie: "ailleurs", hors_rayon: false },
    { le: "2026-11-15T13:00:00+00:00", emplacement: "arme", objet: "hache", prix: 200, prix_boutique: 250, voie: "offre", hors_rayon: null },
  ],
};

describe("la lecture du tableau du marché", () => {
  it("lit chaque partie, et saute ce qui est mal formé ou inconnu", () => {
    const t = lireMarcheDeLaDirection(REPONSE)!;
    expect(t.rotation).toEqual({ semaine: 0, depuis: "2026-11-19T11:47:48+00:00", changeLe: "2026-11-24T20:30:00+00:00", enRayon: 89, horsRayon: 156 });
    expect(t.ouvert.misDeCote).toBe(2140);
    expect(t.ouvert.parRarete.legendaire).toEqual({ offres: 1, demandes: 2 });
    // Une rareté absente de la réponse : zéro, pas « pas de données » (le serveur les donne toutes).
    expect(t.ouvert.parRarete.epique).toEqual({ offres: 0, demandes: 0 });
    expect(t.periodes.trente_jours.ventes_offres).toBe(2);
    expect(t.parJour.map((j) => j.jour)).toEqual(["2026-11-18", "2026-11-19"]);
    expect(t.parSemaine[0]?.semaine).toBe(-1);
    expect(t.prix30).toEqual([{ rarete: "legendaire", ventes: 2, partMoyenne: 80 }]);
    expect(t.delais30).toEqual({ offres: 7200, demandes: null });
    expect(t.plusDemandes.map((o) => o.nom)).toEqual(["Casque d'or"]);
    expect(t.dernieresVentes).toHaveLength(2);
    expect(t.dernieresVentes[0]).toMatchObject({ nom: "Casque d'or", voie: "demande", horsRayon: true, prixBoutique: 2500 });
    // Une vente d'avant la rotation : ni en rayon, ni hors du rayon.
    expect(t.dernieresVentes[1]?.horsRayon).toBeNull();
  });

  it("refuse une réponse qui n'a pas sa forme", () => {
    expect(lireMarcheDeLaDirection(null)).toBeNull();
    expect(lireMarcheDeLaDirection({ ok: false, error: "forbidden" })).toBeNull();
    expect(lireMarcheDeLaDirection({ ...REPONSE, periodes: { sept_jours: periode(1), trente_jours: periode(2) } })).toBeNull();
    expect(lireMarcheDeLaDirection({ ...REPONSE, ouvert: { ...REPONSE.ouvert, offres: -1 } })).toBeNull();
    expect(lireMarcheDeLaDirection({ ...REPONSE, rotation: { ...REPONSE.rotation, change_le: "x" } })).toBeNull();
  });
});

describe("les mots du tableau du marché", () => {
  it("accorde les mots, zéro et un au singulier", () => {
    expect(accorde(0, "vente", "ventes")).toBe("0 vente");
    expect(accorde(1, "vente", "ventes")).toBe("1 vente");
    expect(plain(accorde(1200, "vente", "ventes"))).toBe("1 200 ventes");
  });

  it("dit un délai en mots", () => {
    expect(delaiEnMots(600)).toBe("moins d'une heure");
    expect(delaiEnMots(3600)).toBe("1 heure");
    expect(delaiEnMots(5 * 3600)).toBe("5 heures");
    expect(delaiEnMots(36 * 3600)).toBe("1 jour et demi");
    expect(delaiEnMots(48 * 3600)).toBe("2 jours");
    expect(delaiEnMots(60 * 3600)).toBe("2 jours et demi");
  });

  it("calcule la remise des offres et la part des demandes servies", () => {
    expect(remiseDesOffres({ valeur: 3000, valeurBoutique: 4000 })).toBe(25);
    expect(remiseDesOffres({ valeur: 0, valeurBoutique: 0 })).toBeNull();
    expect(partDesDemandesServies({ ...periode(0), ventes_demandes: 3, demandes_rendues: 1 })).toBe(75);
    expect(partDesDemandesServies(periode(0))).toBeNull();
  });

  it("donne une ligne à chaque chiffre des périodes, et pas de signe à la place d'un mot", () => {
    expect(LIGNES_DES_ECHANGES.map((l) => l.cle).sort()).toEqual([...CLES_DE_PERIODE].sort());
    for (const l of LIGNES_DES_ECHANGES) expect(l.label).not.toMatch(/[=÷>]/);
  });
});

describe("le tableau du marché, au serveur", () => {
  it("ne dit « hors rayon » que pour une vente faite depuis que la rotation est en place", () => {
    expect(MIGRATION).toContain("'hors_rayon', case when v.le < internal.boutique_tournante_en_place() then null else not internal.boutique_en_rayon(v.emplacement, v.objet, v.le) end)");
    expect(MIGRATION).toContain("select timestamptz '2026-11-19 11:47:48+00'");
    expect(MIGRATION).toContain("revoke all on function internal.boutique_tournante_en_place() from public, anon, authenticated;");
  });

  it("n'est lu que par un officier ou au-dessus, comme l'économie du village", () => {
    expect(MIGRATION).toContain("perform internal.require_rank(2);");
    expect(MIGRATION).toContain("revoke all on function public.get_village_marche() from public, anon, authenticated;\ngrant execute on function public.get_village_marche() to authenticated;");
  });

  it("ne rend aucun nom ni aucun compte", () => {
    const corps = MIGRATION.slice(MIGRATION.indexOf("create or replace function public.get_village_marche"));
    expect(corps).not.toMatch(/display_name|member_pseudo|discord_name|village_nom|private_links|'user_id'|'vendeur'|'acheteur'|'compte'/);
    // Les comptes ne servent qu'à être comptés : chaque identifiant de compte est dans un « count(distinct …) ».
    const sansComptes = corps.replace(/count\(distinct [a-z]\.(vendeur_id|acheteur_id|user_id)\)/g, "");
    expect(sansComptes).not.toMatch(/\b[a-z]\.(vendeur_id|acheteur_id|user_id)\b/);
  });

  it("n'écrit rien et ne compte que les natures exactes du journal", () => {
    expect(CODE).not.toMatch(/\b(insert|update|delete|drop|truncate)\b\s/i);
    // Les natures se comptent une à une : aucune n'est prise par un motif qui attraperait celles d'un essai (« test_… »).
    expect(CODE).not.toMatch(/test_|god_|nature like/);
    for (const nature of ["achat", "pochette", "pochette_stateres", "marche_vente", "marche_achat", "marche_demande", "marche_demande_rendue", "revente", "victoire"]) expect(MIGRATION).toContain(`'${nature}'`);
  });

  it("rend une clé pour chaque chiffre des périodes que l'écran lit", () => {
    for (const cle of CLES_DE_PERIODE) expect(MIGRATION, cle).toContain(`'${cle}',`);
  });
});
