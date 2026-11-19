import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { estEnRayon, jourCourt, jourEnMots, lireTournante, motsDeLaCase, raisonHorsRayon, regleDeLaRotation, retourDe } from "../../src/lib/village/boutique-tournante";
import { BOUTIQUE_TOUR_DEBUT, BOUTIQUE_TOURS, MARCHE_DEMANDES_MAX, MARCHE_DEMANDES_PAR_JOUR, MARCHE_DUREE_JOURS } from "../../src/lib/village/contrat";
import { demandesAServir, demandesDesAutres, lireBoutique, lireMarche, meilleureDemande, mesDemandes, peutServir, raisonDeNePasDemander, MESSAGES_DU_MARCHE } from "../../src/lib/village/ecran-marche";

// Sous Windows, Git rend les fichiers avec des fins de ligne CRLF : les motifs ci-dessous lisent des « \n ».
const lire = (nom: string) => readFileSync(`supabase/migrations/${nom}.sql`, "utf8").replace(/\r\n/g, "\n");
const MIGRATION = lire("20261119000100_marche_tournant_et_demandes");
const entre = (texte: string, debut: string, fin: string) => texte.slice(texte.indexOf(debut), texte.indexOf(fin, texte.indexOf(debut)));
const fonction = (nom: string) => entre(MIGRATION, `create or replace function ${nom}(`, "$$;\n");

describe("la boutique tournante, à l'écran", () => {
  const REPONSE = {
    ok: true,
    semaine: 0,
    tours: 3,
    change_le: "2026-11-24T20:30:00+00:00",
    hors_rayon: [
      { emplacement: "tete", objet: "casque-or", revient_le: "2026-11-24T20:30:00+00:00" },
      { emplacement: "arme", objet: "hache", revient_le: "2026-12-01T20:30:00+00:00" },
      { emplacement: "ailleurs", objet: "x", revient_le: "2026-12-01T20:30:00+00:00" },
      { emplacement: "arme", objet: "poele", revient_le: "pas une date" },
      null,
    ],
  };

  it("lit les objets hors du rayon, et saute une ligne mal formée", () => {
    const lue = lireTournante(REPONSE)!;
    expect(lue.changeLe).toBe("2026-11-24T20:30:00+00:00");
    expect([...lue.horsRayon.keys()]).toEqual(["tete/casque-or", "arme/hache"]);
    expect(retourDe(lue, { emplacement: "arme", objet: "hache" })).toBe("2026-12-01T20:30:00+00:00");
    expect(estEnRayon(lue, { emplacement: "arme", objet: "hache" })).toBe(false);
    expect(estEnRayon(lue, { emplacement: "arme", objet: "poele" })).toBe(true);
  });

  it("sans réponse lisible, tout paraît en rayon : le serveur décide à l'achat", () => {
    expect(lireTournante(null)).toBeNull();
    expect(lireTournante({ ok: false, error: "not_signed_in" })).toBeNull();
    expect(lireTournante({ ok: true, change_le: "x", hors_rayon: [] })).toBeNull();
    expect(estEnRayon(null, { emplacement: "tete", objet: "casque-or" })).toBe(true);
  });

  it("dit le retour en mots, à l'heure de Paris, avec « 1er »", () => {
    expect(jourEnMots("2026-12-01T20:30:00+00:00")).toBe("mardi 1er décembre");
    expect(jourEnMots("2026-11-24T20:30:00+00:00")).toBe("mardi 24 novembre");
    expect(jourCourt("2026-12-01T20:30:00+00:00")).toBe("1er déc.");
    expect(motsDeLaCase("2026-12-01T20:30:00+00:00")).toBe("Revient le 1er déc.");
    expect(raisonHorsRayon("2026-12-08T20:30:00+00:00")).toBe("Pas en rayon cette semaine : il revient le mardi 8 décembre, à 21 h 30.");
    expect(regleDeLaRotation("2026-11-24T20:30:00+00:00")).toContain("Prochain changement : mardi 24 novembre.");
    // Des mots, pas des signes (règle du pilote).
    expect(regleDeLaRotation("2026-11-24T20:30:00+00:00")).not.toMatch(/[=÷>]/);
  });
});

describe("la boutique tournante, au serveur", () => {
  it("garde les réglages du contrat : trois tours, le mardi 17 novembre 2026 à 21 h 30, heure de Paris", () => {
    expect(MIGRATION).toContain(`create or replace function internal.boutique_tours() returns integer\nlanguage sql immutable set search_path = public, pg_temp as $$ select ${BOUTIQUE_TOURS} $$;`);
    expect(MIGRATION).toContain(`select timestamp '${BOUTIQUE_TOUR_DEBUT}' $$;`);
    expect(fonction("internal.boutique_semaine")).toContain("at time zone 'Europe/Paris'");
  });

  it("refuse à la boutique un objet hors du rayon, et ne change rien d'autre à l'achat", () => {
    const avant = entre(lire("20261113002000_village_marche_et_place"), "create or replace function public.acheter_objet(", "$$;\n");
    const apres = fonction("public.acheter_objet");
    const ajout = "    -- Ajout de 20261119000100 : seul un objet en rayon cette semaine s'achète.\n    if not internal.boutique_en_rayon(p_emplacement, p_objet, now()) then perform internal.fail('hors_rayon'); end if;\n";
    expect(apres).toContain(ajout);
    expect(apres.split(ajout).join("")).toBe(avant);
  });

  it("ne range en rayon que les objets qui ont un prix", () => {
    expect(fonction("internal.boutique_tours_des_objets")).toContain("join internal.village_prix p on p.rarete = o.rarete\n  where not o.gratuit");
  });
});

describe("les demandes d'achat, à l'écran", () => {
  const demande = (id: number, emplacement: string, objet: string, prix: number, aMoi = false) => ({ id, emplacement, objet, prix, acheteur: `Acheteur ${id}`, a_moi: aMoi, expire_le: "2026-12-03T12:00:00.000Z" });
  const MARCHE = {
    ok: true,
    solde: 300,
    offres_max: 5,
    offres: [],
    demandes_max: 5,
    mis_de_cote: 140,
    demandes: [demande(1, "tete", "casque-or", 2000), demande(2, "arme", "hache", 140, true), demande(3, "tete", "bandeau", 60), demande(4, "tete", "casque-or", 1500), demande(5, "tete", "inconnu", 10), null, demande(6, "tete", "bandeau", 0)],
  };
  const marche = lireMarche(MARCHE)!;
  const boutique = lireBoutique({
    ok: true,
    solde: 300,
    peut_acheter: true,
    prix: { commun: 100, "peu-commun": 250, epique: 500, mystique: 1000, legendaire: 2500 },
    pochette: { prix: 200, chances: {} },
    inventaire: [
      { emplacement: "tete", objet: "casque-or", quantite: 2, origine: "pochette", acquis_le: "" },
      { emplacement: "tete", objet: "bandeau", quantite: 1, origine: "marche", acquis_le: "" },
    ],
  })!;

  it("lit les demandes lisibles, et ce qui est mis de côté", () => {
    expect(marche.demandes?.map((d) => d.id)).toEqual([1, 2, 3, 4]);
    expect(marche.demandesMax).toBe(5);
    expect(marche.misDeCote).toBe(140);
    expect(marche.demandes?.[0]).toMatchObject({ nom: "Casque d'or", rarete: "legendaire", acheteur: "Acheteur 1" });
  });

  it("un serveur d'avant ne connaît pas les demandes : l'écran ne les montre pas", () => {
    const ancien = lireMarche({ ok: true, solde: 10, offres: [], offres_max: 5 })!;
    expect(ancien.demandes).toBeNull();
    expect(mesDemandes(ancien.demandes)).toEqual([]);
    expect(demandesAServir(ancien.demandes, boutique.inventaire)).toEqual([]);
  });

  it("met ses demandes à part, et trouve ce que l'inventaire peut servir", () => {
    expect(mesDemandes(marche.demandes).map((d) => d.id)).toEqual([2]);
    expect(demandesDesAutres(marche.demandes, "tete").map((d) => d.id)).toEqual([1, 3, 4]);
    // Le bandeau ne vient que du marché : il ne se revend pas, il ne sert pas une demande.
    expect(peutServir({ emplacement: "tete", objet: "bandeau" }, boutique.inventaire)).toBe(false);
    expect(demandesAServir(marche.demandes, boutique.inventaire).map((d) => d.id)).toEqual([1, 4]);
    expect(meilleureDemande(marche.demandes, { emplacement: "tete", objet: "casque-or" })?.id).toBe(1);
    expect(meilleureDemande(marche.demandes, { emplacement: "arme", objet: "hache" })).toBeNull();
  });

  it("dit ce qui empêche de demander un objet", () => {
    const rien: never[] = [];
    expect(raisonDeNePasDemander({ emplacement: "tete", objet: "casque-or" }, boutique.inventaire, rien, rien, 5)).toBe(MESSAGES_DU_MARCHE.deja_possede);
    expect(raisonDeNePasDemander({ emplacement: "arme", objet: "hache" }, boutique.inventaire, [{ emplacement: "arme", objet: "hache" }], rien, 5)).toBe("Vous avez cet objet en vente.");
    expect(raisonDeNePasDemander({ emplacement: "arme", objet: "hache" }, boutique.inventaire, rien, mesDemandes(marche.demandes), 5)).toBe(MESSAGES_DU_MARCHE.deja_demande);
    expect(raisonDeNePasDemander({ emplacement: "arme", objet: "poele" }, boutique.inventaire, rien, mesDemandes(marche.demandes), 1)).toBe(MESSAGES_DU_MARCHE.trop_de_demandes);
    expect(raisonDeNePasDemander({ emplacement: "arme", objet: "poele" }, boutique.inventaire, rien, mesDemandes(marche.demandes), 5)).toBeNull();
  });
});

describe("les demandes d'achat, au serveur", () => {
  it("garde les règles du contrat : 5 demandes, 20 par jour, 14 jours", () => {
    expect(MIGRATION).toContain(`create or replace function internal.marche_demandes_max() returns integer\nlanguage sql immutable set search_path = public, pg_temp as $$ select ${MARCHE_DEMANDES_MAX} $$;`);
    expect(MIGRATION).toContain(`create or replace function internal.marche_demandes_par_jour() returns integer\nlanguage sql immutable set search_path = public, pg_temp as $$ select ${MARCHE_DEMANDES_PAR_JOUR} $$;`);
    expect(MARCHE_DUREE_JOURS).toBe(14);
    expect(fonction("public.poser_demande")).toContain("now() + internal.marche_duree()");
  });

  it("met les statères de côté, et ne les crée jamais : chaque ligne d'une demande a sa ligne en face", () => {
    expect(fonction("public.poser_demande")).toContain("perform internal.village_debiter(v_uid, 'marche_demande', p_prix::integer, 'demande/' || v_id);");
    expect(fonction("public.retirer_demande")).toContain("'marche_demande_rendue', v_demande.prix, 'demande/' || v_demande.id");
    const servir = fonction("public.servir_demande");
    // L'acheteur : ce qui était mis de côté revient, puis l'achat au marché ; le vendeur reçoit le prix. Somme : zéro.
    expect([...servir.matchAll(/'(marche_demande_rendue|marche_achat|marche_vente)', (-?)v_demande\.prix/g)].map((m) => `${m[2]}${m[1]}`).sort()).toEqual(["-marche_achat", "-marche_achat", "marche_demande_rendue", "marche_demande_rendue", "marche_vente", "marche_vente"]);
    expect(fonction("internal.marche_expirer")).toContain("'marche_demande_rendue', v_o.prix, 'demande/' || v_o.id");
  });

  it("garde les règles d'une mise en vente pour servir une demande", () => {
    const servir = fonction("public.servir_demande");
    for (const refus of ["pas_possede", "objet_porte", "achete_au_marche", "objet_grave", "demande_a_soi", "demande_fermee", "mode_god"]) expect(servir).toContain(`internal.fail('${refus}')`);
    expect(servir).toContain("values (v_demande.acheteur_id, v_demande.emplacement, v_demande.objet, 1, 'marche', 1)");
  });

  it("garde les vrais gains du mode GOD et y ajoute le remboursement d'une demande", () => {
    const avant = entre(lire("20261117000200_don_de_stateres"), "create or replace function internal.village_god_mouvement(", "$$;\n");
    const apres = fonction("internal.village_god_mouvement");
    expect(apres).toBe(
      avant
        .split("'loterie_lot', 'don')")
        .join("'loterie_lot', 'don', 'marche_demande_rendue')")
        .split("('marche_achat', 'pronostic_mise')")
        .join("('marche_achat', 'pronostic_mise', 'marche_demande')"),
    );
  });

  it("annonce un achat fait en servant une demande, comme un achat d'une offre", () => {
    const avant = entre(lire("20261115000100_achats_nom_discord"), "create or replace function public.achats_du_village(", "$$;\n");
    const apres = fonction("public.achats_du_village");
    expect(apres).toContain("d.id = case when l.ref ~ '^demande/[0-9]{1,18}$' then substring(l.ref from 9)::bigint end");
    // Le reste est la fonction d'avant.
    expect(avant.split("\n").filter((l) => !apres.includes(l))).toEqual([
      "      case when l.nature = 'marche_achat' then o.emplacement",
      "      case when l.nature = 'marche_achat' then o.objet",
    ]);
  });

  it("ferme chaque fonction aux visiteurs, et l'annonce du marché à tout autre que la clé de service", () => {
    for (const [nom, signature] of [
      ["get_boutique_tournante", "()"],
      ["poser_demande", "(text, text, numeric)"],
      ["retirer_demande", "(bigint)"],
      ["servir_demande", "(bigint)"],
      ["acheter_objet", "(text, text, integer)"],
    ] as const) {
      expect(MIGRATION).toContain(`revoke all on function public.${nom}${signature} from public, anon, authenticated;\ngrant execute on function public.${nom}${signature} to authenticated;`);
    }
    expect(MIGRATION).toContain("revoke all on function public.annonces_du_marche(bigint, bigint) from public, anon, authenticated;\ngrant execute on function public.annonces_du_marche(bigint, bigint) to service_role;");
    for (const [, court] of MIGRATION.matchAll(/create or replace function (internal\.[a-z_]+)\(/g)) {
      if (!court) continue;
      expect(MIGRATION, court).toMatch(new RegExp(`revoke all on function ${court.replace(".", "\\.")}\\(`));
      expect(MIGRATION, court).not.toContain(`grant execute on function ${court}(`);
    }
    expect(MIGRATION).toContain("alter table internal.marche_demandes enable row level security;\nrevoke all on table internal.marche_demandes from public, anon, authenticated;");
  });

  it("n'efface rien hors des fonctions, et ne retire ni table ni colonne", () => {
    expect(MIGRATION).not.toMatch(/\bdrop (table|column|function)\b|\btruncate\b/i);
    expect([...MIGRATION.matchAll(/\bdelete from ([\w.]+)/g)].map((m) => m[1])).toEqual(["internal.marche_offres", "internal.marche_demandes", "internal.gaulois_inventaire"]);
  });

  it("passe la sauvegarde en version 12, avec les demandes, sans rien perdre de la 11", () => {
    const cles = (sql: string) => [...sql.slice(sql.indexOf("function public.export_site()")).matchAll(/^ {4}'([a-z_]+)',/gm)].map((m) => m[1]);
    const avant = lire("20261117001600_cadres_des_cartes");
    expect(MIGRATION).toContain("'version', 12,");
    expect(cles(MIGRATION)).toEqual([...cles(avant), "marche_demandes"]);
    expect(MIGRATION).toContain("revoke all on function public.export_site() from public, anon, authenticated;\ngrant execute on function public.export_site() to service_role;");
  });

  it("a un message du marché pour chaque refus des demandes", () => {
    const corps = ["public.poser_demande", "public.retirer_demande", "public.servir_demande"].map(fonction).join("\n");
    const codes = [...corps.matchAll(/internal\.fail\('([a-z_]+)'/g)].map((m) => m[1]!);
    expect(codes.length).toBeGreaterThan(10);
    for (const code of codes) expect(code in MESSAGES_DU_MARCHE, code).toBe(true);
  });
});
