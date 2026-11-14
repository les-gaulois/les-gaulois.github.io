import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MARCHE_DUREE_JOURS, MARCHE_OFFRES_MAX } from "../../src/lib/village/contrat";
import { MESSAGES_DU_MARCHE } from "../../src/lib/village/ecran-marche";

// Sous Windows, Git rend les fichiers avec des fins de ligne CRLF : les motifs ci-dessous lisent des « \n ».
const lire = (nom: string) => readFileSync(`supabase/migrations/${nom}.sql`, "utf8").replace(/\r\n/g, "\n");
const MARCHE = lire("20261113002000_village_marche_et_place");
const SAUVEGARDE = lire("20261113002200_village_sauvegarde");
const entre = (texte: string, debut: string, fin: string) => texte.slice(texte.indexOf(debut), texte.indexOf(fin, texte.indexOf(debut)));
/** Le corps d'une fonction de la migration du marché, de son `create` au `$$;` qui la ferme. */
const fonction = (nom: string) => entre(MARCHE, `create or replace function ${nom}(`, "$$;\n");

describe("le marché du village, côté serveur", () => {
  it("garde les règles du contrat : 5 offres, 14 jours", () => {
    expect(MARCHE).toContain(`create or replace function internal.marche_offres_max() returns integer\nlanguage sql immutable set search_path = public, pg_temp as $$ select ${MARCHE_OFFRES_MAX} $$;`);
    expect(MARCHE).toContain(`create or replace function internal.marche_duree() returns interval\nlanguage sql immutable set search_path = public, pg_temp as $$ select interval '${MARCHE_DUREE_JOURS} days' $$;`);
  });

  it("ne répond que des refus du contrat, en plus de ceux de tout compte et de la boutique", () => {
    const codes = new Set([...MARCHE.matchAll(/internal\.(?:fail|error_json)\('([a-z_]+)'/g)].map((m) => m[1]!));
    const communs = ["not_signed_in", "suspended", "rate_limited"];
    const boutique = ["unknown_objet", "objet_gratuit", "no_gaulois", "invalid_request", "prix_change"];
    expect([...codes].filter((c) => !(c in MESSAGES_DU_MARCHE) && !communs.includes(c) && !boutique.includes(c))).toEqual([]);
    // Chaque refus du contrat peut sortir du serveur ; `solde_insuffisant` vient du débit de la boutique (migration
    // 20261113001900), que l'achat au marché appelle.
    expect(fonction("public.acheter_offre")).toContain("perform internal.village_debiter(v_uid, 'marche_achat', v_offre.prix, v_ref);");
    codes.add("solde_insuffisant");
    expect(Object.keys(MESSAGES_DU_MARCHE).filter((c) => !codes.has(c))).toEqual([]);
  });

  it("n'ajoute que : ni table ni colonne retirée, ni donnée effacée hors d'une fonction", () => {
    expect(MARCHE).not.toMatch(/\bdrop (table|column|function)\b|\btruncate\b/i);
    // Trois `delete`, chacun dans sa fonction : les offres closes depuis plus de 30 jours (à la lecture), l'exemplaire mis en
    // vente qui quitte l'inventaire, l'offre retirée (revue de sécurité du 14 novembre 2026 : la table ne grossit plus).
    expect([...MARCHE.matchAll(/\bdelete from ([\w.]+)/g)].map((m) => m[1])).toEqual(["internal.marche_offres", "internal.gaulois_inventaire", "internal.marche_offres"]);
    expect(fonction("internal.marche_expirer")).toContain("delete from internal.marche_offres m where m.etat <> 'ouverte' and m.ferme_le < now() - interval '30 days';");
    expect(fonction("public.mettre_en_vente")).toContain("delete from internal.gaulois_inventaire");
    expect(fonction("public.retirer_offre")).toContain("delete from internal.marche_offres m where m.id = v_offre.id;");
    expect(fonction("public.retirer_offre")).not.toContain("'retiree'");
  });

  it("ferme chaque fonction aux visiteurs et n'ouvre que les siennes aux comptes connectés", () => {
    for (const [nom, signature] of [
      ["get_marche", "()"],
      ["mettre_en_vente", "(text, text, numeric)"],
      ["retirer_offre", "(bigint)"],
      ["acheter_offre", "(bigint)"],
      ["get_village", "()"],
      ["get_ma_boutique", "()"],
      ["acheter_objet", "(text, text, integer)"],
    ] as const) {
      expect(MARCHE).toContain(`revoke all on function public.${nom}${signature} from public, anon, authenticated;\ngrant execute on function public.${nom}${signature} to authenticated;`);
    }
    for (const nom of ["marche_offres_max()", "marche_duree()", "marche_verrou()", "marche_membre()", "marche_rendre(uuid, text, text, text, timestamptz)", "marche_expirer()", "marche_fermer_au_dessus_des_prix()", "marche_json(uuid)", "village_nom(text, integer)"]) {
      expect(MARCHE).toContain(`revoke all on function internal.${nom} from public, anon, authenticated;`);
      expect(MARCHE).not.toContain(`grant execute on function internal.${nom}`);
    }
    expect(MARCHE).toContain("alter table internal.marche_offres enable row level security;\nrevoke all on table internal.marche_offres from public, anon, authenticated;");
  });

  it("limite les gestes, et aussi les lectures du marché et de la place, qui renvoient de grosses réponses", () => {
    for (const nom of ["public.mettre_en_vente", "public.retirer_offre", "public.acheter_offre", "public.acheter_objet", "public.get_marche", "public.get_village"]) {
      expect(fonction(nom), nom).toContain("if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;");
    }
    // Le compteur s'écrit : la place n'est plus une fonction en lecture seule (`stable`).
    expect(fonction("public.get_village")).not.toMatch(/language plpgsql stable/);
  });

  it("ferme les offres plus chères que la boutique, sous les verrous du marché puis des vendeurs", () => {
    const fermer = fonction("internal.marche_fermer_au_dessus_des_prix");
    expect(fermer.indexOf("perform internal.marche_verrou();")).toBeLessThan(fermer.indexOf("perform internal.village_verrou(v_vendeur);"));
    expect(fermer).toContain("where m.etat = 'ouverte' and o.emplacement = m.emplacement and o.objet = m.objet and p.rarete = o.rarete and m.prix > p.prix");
    expect(fermer).toContain("perform internal.marche_rendre(v_o.vendeur_id, v_o.emplacement, v_o.objet, v_o.origine, now());");
  });

  it("paie par deux lignes du journal, dans l'ordre des user_id, sous les verrous pris dans le même ordre", () => {
    const achat = fonction("public.acheter_offre");
    expect(achat.indexOf("perform internal.marche_verrou();")).toBeLessThan(achat.indexOf("perform internal.village_verrou(least(v_uid, v_vendeur));"));
    expect(achat.indexOf("village_verrou(least(v_uid, v_vendeur))")).toBeLessThan(achat.indexOf("village_verrou(greatest(v_uid, v_vendeur))"));
    expect(achat).toContain("if v_uid < v_offre.vendeur_id then\n      perform internal.village_debiter(v_uid, 'marche_achat'");
    expect(achat).toContain("'marche_vente', v_offre.prix, v_ref);\n      perform internal.village_debiter(v_uid, 'marche_achat'");
    // Le journal des statères n'est jamais modifié : on y ajoute des lignes, le solde suit.
    expect(MARCHE).not.toMatch(/update internal\.stateres_(mouvements|soldes)|insert into internal\.stateres_soldes/);
  });

  it("garde l'objet acheté au marché hors de la vente, et l'objet en vente hors de la boutique", () => {
    expect(fonction("public.mettre_en_vente")).toContain("if v_ligne.quantite - v_ligne.du_marche < 1 then perform internal.fail('achete_au_marche'); end if;");
    expect(fonction("public.acheter_offre")).toContain("values (v_uid, v_offre.emplacement, v_offre.objet, 1, 'marche', 1)");
    expect(fonction("public.acheter_objet")).toContain("or exists (select 1 from internal.marche_offres m where m.vendeur_id = v_uid and m.etat = 'ouverte'");
  });

  it("montre la place sans choix de s'en retirer, sans solde ni inventaire", () => {
    const place = fonction("public.get_village");
    expect(place).toContain("'gaulois', coalesce(");
    expect(place).toContain("where p.status = 'validated'");
    expect(place).not.toMatch(/visible|solde|stateres|inventaire/);
    expect(MARCHE).not.toContain("regler_ma_visibilite");
    expect(MARCHE).not.toMatch(/alter table public\.profiles/);
  });

  // Décision du pilote du 14 novembre 2026 : « tous ceux qui créent un personnage apparaissent dans le village », sans choix
  // de se montrer ou non. Le choix du mur du QG (show_to_members) n'est plus lu par le village.
  it("nomme chaque vendeur et chaque Gaulois comme le QG, sans lire le choix du mur, jamais par une adresse ni par raw_user_meta_data", () => {
    expect(fonction("internal.marche_json")).toContain("'vendeur', internal.village_nom(p.display_name, p.gaul_number),");
    expect(fonction("public.get_village")).toContain("'nom', internal.village_nom(p.display_name, p.gaul_number),");
    for (const nom of ["internal.marche_json", "public.get_village"]) {
      expect(fonction(nom), nom).not.toMatch(/raw_user_meta_data|email|auth\.users|show_to_members|Un Gaulois/);
    }
  });

  it("donne toujours un nom : celui du QG, ou « Gaulois n° » et le numéro du compte pour un nom fait d'espaces", () => {
    expect(fonction("internal.village_nom")).toContain("select coalesce(nullif(btrim(p_nom), ''), 'Gaulois n° ' || p_numero)");
    expect(MARCHE).toContain("revoke all on function internal.village_nom(text, integer) from public, anon, authenticated;");
    expect(MARCHE).not.toContain("grant execute on function internal.village_nom");
    // Sans commentaire, la migration du marché et de la place ne lit nulle part le choix du mur du QG.
    expect(MARCHE.replace(/--.*$/gm, "")).not.toMatch(/show_to_members|'Un Gaulois'/);
  });
});

describe("la sauvegarde, version 5", () => {
  const v5 = entre(SAUVEGARDE, "create or replace function public.export_site()", "\n$$;");
  const v4 = entre(lire("20261113000400_alliances_sur_la_carte"), "create or replace function public.export_site()", "/* ---------- Règles d'accès");

  it("reprend chaque ligne de la version 4, sans rien perdre", () => {
    expect(v4).toContain("'version', 4");
    expect(v5).toContain("'version', 5");
    for (const line of v4.split("\n").filter((l) => l.trim().startsWith("'") && !l.includes("'version'"))) {
      expect(v5, line.trim()).toContain(line.trim().replace(/\)$/, ""));
    }
  });

  it("garde le village : tenues, inventaires, journal, soldes, réglages, offres", () => {
    for (const table of ["gaulois", "gaulois_inventaire", "stateres_mouvements", "stateres_soldes", "village_prix", "village_pochette", "marche_offres"]) {
      expect(v5).toContain(`from internal.${table} t`);
    }
    expect(v5).toContain("'stateres_victoires_totaux'");
  });

  it("ne garde rien qui désigne un joueur OpenFront : ni partie, ni heure de partie, ni empreinte", () => {
    expect(v5).not.toMatch(/stateres_presences|stateres_victoires t|stateres_suspensions|stateres_releve/);
    expect(v5).toContain("to_jsonb(t) - 'partie' - 'debut' - 'points' - 'gaulois' order by t.id), '[]') from internal.stateres_mouvements t where t.nature <> 'victoire'");
    expect(v5).toContain("jsonb_build_object('user_id', t.user_id, 'solde', t.solde)");
  });

  it("reste réservée à la clé de service", () => {
    expect(SAUVEGARDE).toContain("revoke all on function public.export_site() from public, anon, authenticated;\ngrant execute on function public.export_site() to service_role;");
  });
});
