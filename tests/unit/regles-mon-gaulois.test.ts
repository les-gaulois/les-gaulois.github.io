/**
 * Les nouvelles règles de « Mon Gaulois » (décisions du pilote des 20 et 21 novembre 2026) : les quatorze paliers de
 * victoires et leur booster offert, la loterie aux boosters du jour, le pass en saisons de six semaines avec son objet et son
 * insigne. Le serveur (migrations 20261121000100 à 000300) et le site doivent dire la même chose ; les règles elles-mêmes
 * sont essayées sur PGlite avant chaque mise en ligne (docs/DIRECTION.md).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LOT_SAISON_1 } from "../../supabase/functions/code-discord/garde-robe/saison";
import { OBJETS, ORDRE_RARETES_DES_OBJETS, RARETES_DES_OBJETS, aUnPrix } from "../../src/lib/gaulois";
import { WIN_TIERS } from "../../src/lib/paliers";
import { objetsDeLaPochette, prixDeLObjet } from "../../src/lib/village/boutique";
import { LOTS_LOTERIE, PALIERS_DE_LA_SAISON_1, PREMIER_TIRAGE_DES_BOOSTERS, PRIX_PAR_RARETE, SAISON_1, TICKET_D_OR } from "../../src/lib/village/contrat";
import { objetDuMarche } from "../../src/lib/village/ecran-marche";
import { COTE_DE_L_INSIGNE, INSIGNES_DE_SAISON, casesDeLInsigne, insigneDeLaSaison } from "../../src/lib/village/insignes-de-saison";
import { apresLOuverture, lireBoosterOuvert, lireBoostersDeLoterie, lireLoterie, lireParts, lirePaliersOfferts, messageDuRefusDuBooster } from "../../src/lib/village/loterie";
import { lireMonSentier, lirePalierPris } from "../../src/lib/village/sentier";

const lire = (nom: string) => readFileSync(`supabase/migrations/${nom}.sql`, "utf8").replace(/\r\n/g, "\n");
const PALIERS_SQL = lire("20261121000100_paliers_de_victoires_boosters");
const LOTERIE_SQL = lire("20261121000200_loterie_boosters_du_jour");
const PASS_SQL = lire("20261121000300_pass_saison_objet_et_insigne");
const TOUTES = [PALIERS_SQL, LOTERIE_SQL, PASS_SQL];
const entre = (texte: string, debut: string, fin: string) => texte.slice(texte.indexOf(debut), texte.indexOf(fin, texte.indexOf(debut)));
const fonction = (sql: string, nom: string) => entre(sql, `create or replace function ${nom}(`, "$$;\n");

describe("les migrations du 21 novembre 2026", () => {
  it("n'effacent ni table ni colonne, et ne lisent jamais l'identité dans les métadonnées", () => {
    for (const sql of TOUTES) expect(sql).not.toMatch(/drop table|drop column|truncate|raw_user_meta_data/i);
    // Les seuls effacements : ceux des boosters de plus de huit semaines, comme ceux des tirages déjà effacés avant.
    expect([...LOTERIE_SQL.matchAll(/delete from ([a-z_.]+)/g)].map((m) => m[1])).toEqual(["internal.loterie_tirages", "internal.loterie_achats", "internal.loterie_boosters"]);
    for (const sql of [PALIERS_SQL, PASS_SQL]) expect(sql).not.toMatch(/delete from/i);
  });

  it("ouvrent chaque fonction publique à qui elle sert, et à lui seul", () => {
    expect(PALIERS_SQL).toContain("grant execute on function public.noter_paliers_victoires(jsonb) to service_role;");
    expect(PALIERS_SQL).not.toMatch(/noter_paliers_victoires\(jsonb\) to authenticated/);
    expect(PASS_SQL).toContain("grant execute on function public.insignes_des_joueurs(text[]) to service_role;");
    expect(PASS_SQL).not.toMatch(/insignes_des_joueurs\(text\[\]\) to authenticated/);
    expect(LOTERIE_SQL).toContain("grant execute on function public.ouvrir_booster_loterie(date) to authenticated;");
    for (const sql of TOUTES) expect(sql).not.toMatch(/to anon/);
  });
});

describe("les quatorze paliers de victoires", () => {
  it("sont les mêmes au serveur et sur le site", () => {
    expect(entre(PALIERS_SQL, "<paliers-de-victoires>", "</paliers-de-victoires>")).toContain(`select array[${WIN_TIERS.join(", ")}]`);
    expect(WIN_TIERS).toHaveLength(14);
  });

  it("n'offrent rien au premier passage d'un compte, et un booster surprise par palier franchi ensuite, sans statère", () => {
    const noter = fonction(PALIERS_SQL, "public.noter_paliers_victoires");
    // Le point de départ : la première lecture note le palier et passe au compte suivant.
    expect(noter).toMatch(/if not found then\n\s+insert into internal\.paliers_victoires[^\n]*\n\s+v_nouveaux := v_nouveaux \+ 1;\n\s+continue;/);
    // Un bon de la pochette surprise par palier, une seule fois par compte, et rien pour un compte suspendu.
    expect(noter).toContain("continue when v_c.status <> 'validated';");
    expect(noter).toContain("insert into internal.paliers_boosters (user_id, palier) values (v_c.user_id, v_t) on conflict (user_id, palier) do nothing;");
    expect(noter).toContain("values (v_c.user_id, 'surprise', 1)");
    expect(noter).toContain("set palier = greatest(pv.palier, v_palier)");
    // Un compte relié à un autre identifiant OpenFront repart d'un nouveau point de départ, sans rien recevoir pour l'écart.
    expect(noter).toMatch(/if v_empreinte <> v_c\.empreinte then\n[\s\S]*?v_nouveaux := v_nouveaux \+ 1;\n\s+continue;/);
    expect(noter).not.toContain("stateres_mouvements");
  });

  it("disent au membre quels paliers lui ont offert un booster", () => {
    expect(lirePaliersOfferts({ ok: true, bons: { surprise: 1 }, paliers: [200, 100] })).toEqual([200, 100]);
    expect(lirePaliersOfferts({ ok: true, bons: {} })).toEqual([]);
    expect(lirePaliersOfferts({ ok: true, bons: {}, paliers: [5] })).toEqual([]);
    expect(lirePaliersOfferts({ ok: false })).toEqual([]);
  });
});

describe("la loterie aux boosters du jour", () => {
  it("a le ticket d'or et le premier tirage du serveur", () => {
    expect(fonction(LOTERIE_SQL, "internal.loterie_or_sur")).toContain(`select ${TICKET_D_OR.sur}`);
    expect(fonction(LOTERIE_SQL, "internal.loterie_or_billets")).toContain(`select ${TICKET_D_OR.billets}`);
    expect(fonction(LOTERIE_SQL, "internal.loterie_premier_booster")).toContain(`select date '${PREMIER_TIRAGE_DES_BOOSTERS}'`);
    // Le tirage du ticket d'or vient du serveur, une fois sur dix.
    expect(fonction(LOTERIE_SQL, "internal.loterie_ouvrir")).toContain("ticket_or = internal.village_hasard() * internal.loterie_or_sur() < 1");
  });

  it("ne vend plus aucun billet, ne crée aucun statère et garde les lots", () => {
    const achat = fonction(LOTERIE_SQL, "public.acheter_billets_loterie");
    expect(achat).toContain("return internal.error_json('achat_ferme', '');");
    expect(achat).not.toContain("village_debiter");
    for (const nom of ["public.ouvrir_booster_loterie", "internal.loterie_ouvrir", "internal.loterie_noter_boosters"]) expect(fonction(LOTERIE_SQL, nom)).not.toContain("stateres_mouvements (");
    // Le tirage garde ses lots : les mêmes lignes qu'avant, la seule création de statères de la loterie.
    expect(fonction(LOTERIE_SQL, "internal.loterie_tirer")).toContain("values (v_p.user_id, 'loterie_lot', v_p.gain,");
    expect(LOTS_LOTERIE.map((l) => l.gain)).toEqual([3000, 1500, 750]);
    expect(LOTERIE_SQL).not.toContain("function internal.loterie_lots(");
  });

  it("lit les boosters de la semaine, fermés sans rien dire de leur contenu", () => {
    expect(lireBoostersDeLoterie(undefined)).toEqual([]);
    const boosters = [
      { jour: "2026-11-18", ouvert: true, billets: 3, ticket_or: true },
      { jour: "2026-11-19", ouvert: false, billets: null, ticket_or: null },
    ];
    expect(lireBoostersDeLoterie(boosters)).toEqual(boosters);
    expect(lireBoostersDeLoterie([{ jour: "2026-11-19", ouvert: false, billets: 2, ticket_or: null }])).toBeNull();
    expect(lireBoostersDeLoterie([...boosters, boosters[0]])).toBeNull();
    expect(lireBoostersDeLoterie(Array.from({ length: 8 }, (_, i) => ({ jour: `2026-11-${10 + i}`, ouvert: false, billets: null, ticket_or: null })))).toBeNull();
  });

  it("lit la loterie sans achat, avec les boosters et les tickets d'or de chaque part", () => {
    const reponse = {
      ok: true,
      tirage: "2026-11-24",
      heure: "2026-11-24T20:30:00+00:00",
      close: false,
      prix: 30,
      lots: LOTS_LOTERIE,
      parts: [{ nom: "Alix", tenue: null, moi: true, gratuits: 9, achetes: 0, tickets_or: 1 }],
      peut_acheter: false,
      achat_ferme: true,
      solde: 10,
      bons: {},
      boosters: [{ jour: "2026-11-18", ouvert: true, billets: 4, ticket_or: true }],
      or: { sur: 10, billets: 5 },
      dernier: null,
      releve: null,
    };
    const lue = lireLoterie(reponse);
    expect(lue).toMatchObject({ peut_acheter: false, achat_ferme: true, or: { sur: 10, billets: 5 }, boosters: reponse.boosters });
    expect(lue?.parts[0]?.tickets_or).toBe(1);
    // Plus de tickets d'or que de billets : la réponse n'est pas celle du serveur.
    expect(lireParts([{ nom: "Alix", tenue: null, moi: true, gratuits: 4, achetes: 0, tickets_or: 1 }], false)).toBeNull();
    // Un serveur d'avant : ni boosters ni ticket d'or, la loterie se lit quand même.
    const avant = lireLoterie({ ...reponse, achat_ferme: undefined, boosters: undefined, or: undefined, peut_acheter: true });
    expect(avant?.boosters).toEqual([]);
    expect(avant?.peut_acheter).toBe(true);
  });

  it("lit un booster ouvert, et le pose à la place du fermé", () => {
    const ouvert = { ok: true, jour: "2026-11-19", tirage: "2026-11-24", billets: 2, ticket_or: true, billets_or: 5, total: 7, restants: 1 };
    expect(lireBoosterOuvert(ouvert)).toEqual(ouvert);
    expect(lireBoosterOuvert({ ...ouvert, total: 6 })).toBeNull();
    expect(lireBoosterOuvert({ ...ouvert, ticket_or: false })).toBeNull();
    const ma = lireLoterie({
      ok: true,
      tirage: "2026-11-24",
      heure: "2026-11-24T20:30:00+00:00",
      close: false,
      prix: 30,
      lots: LOTS_LOTERIE,
      parts: [],
      peut_acheter: false,
      achat_ferme: true,
      solde: 0,
      bons: {},
      boosters: [{ jour: "2026-11-19", ouvert: false, billets: null, ticket_or: null }],
      dernier: null,
      releve: null,
    });
    if (!ma) throw new Error("loterie illisible");
    expect(apresLOuverture(ma, lireBoosterOuvert(ouvert)!).boosters).toEqual([{ jour: "2026-11-19", ouvert: true, billets: 2, ticket_or: true }]);
    expect(messageDuRefusDuBooster("aucun_booster")).toContain("jour joué avec le clan");
    expect(messageDuRefusDuBooster("deja_ouvert")).toBe("Ce booster est déjà ouvert.");
  });
});

describe("le pass : six semaines, l'objet et l'insigne de la saison", () => {
  it("la saison 1 dure six semaines, et son objet est celui du serveur", () => {
    expect(PASS_SQL).toContain(`set fin = date '${SAISON_1.fin}', objet_emplacement = '${SAISON_1.objet.emplacement}', objet = '${SAISON_1.objet.objet}'`);
    const jours = (Date.parse(`${SAISON_1.fin}T00:00:00Z`) - Date.parse(`${SAISON_1.debut}T00:00:00Z`)) / 86_400_000 + 1;
    expect(jours).toBe(42);
    expect(PALIERS_DE_LA_SAISON_1).toHaveLength(30);
  });

  it("l'objet de la saison est au catalogue, de rareté « saison », et le serveur connaît le même", () => {
    expect(LOT_SAISON_1).toHaveLength(1);
    const objet = LOT_SAISON_1[0]!;
    expect([objet.emplacement, objet.id, objet.rarete, objet.gratuit]).toEqual([SAISON_1.objet.emplacement, SAISON_1.objet.objet, "saison", false]);
    const bloc = entre(PASS_SQL, "<objets-de-saison>", "</objets-de-saison>");
    expect(bloc).toContain(`  ('${objet.emplacement}', '${objet.id}', 'saison', false)`);
    expect(PASS_SQL).toContain(`check (rarete in (${ORDRE_RARETES_DES_OBJETS.map((r) => `'${r}'`).join(", ")}));`);
    expect(RARETES_DES_OBJETS.saison).toEqual({ nom: "Légendaire de saison", rang: 5 });
  });

  it("ne s'achète pas, ne se vend pas, ne sort d'aucune pochette", () => {
    const { emplacement, objet } = SAISON_1.objet;
    expect(aUnPrix("saison")).toBe(false);
    expect(Object.keys(PRIX_PAR_RARETE)).not.toContain("saison");
    expect(prixDeLObjet(emplacement, objet, PRIX_PAR_RARETE)).toBeNull();
    expect(objetDuMarche(emplacement, objet)).toBeNull();
    expect(objetsDeLaPochette("saison")).toEqual([]);
    expect(OBJETS[emplacement][objet]?.rarete).toBe("saison");
  });

  it("chaque saison qui a son objet a son insigne, de 24 cases de côté", () => {
    const insigne = insigneDeLaSaison(SAISON_1.id);
    expect(insigne).not.toBeNull();
    for (const i of INSIGNES_DE_SAISON) {
      expect(i.lignes).toHaveLength(COTE_DE_L_INSIGNE);
      for (const ligne of i.lignes) {
        expect(ligne).toHaveLength(COTE_DE_L_INSIGNE);
        for (const lettre of ligne) if (lettre !== ".") expect(i.couleurs, `${i.saison} « ${lettre} »`).toHaveProperty(lettre);
      }
      const cases = casesDeLInsigne(i);
      expect(cases).toHaveLength(COTE_DE_L_INSIGNE * COTE_DE_L_INSIGNE);
      expect(cases.every((c) => c === null || /^#[0-9a-f]{6}$/i.test(c))).toBe(true);
    }
  });

  it("le dernier palier donne l'objet de la saison et l'insigne, sans rien changer aux autres paliers", () => {
    const prendre = fonction(PASS_SQL, "public.prendre_palier");
    expect(prendre).toContain("if p_palier = v_saison.paliers and v_saison.objet is not null then");
    expect(prendre).toContain("insert into internal.pass_insignes (user_id, saison) values (v_uid, v_saison.saison) on conflict (user_id, saison) do nothing;");
    expect(prendre).toContain("if v_essai then perform internal.fail('mode_god'); end if;");
    expect(prendre).not.toContain("stateres_mouvements");
  });

  it("le pass se lit avec l'objet de la saison et les insignes, et le palier pris avec son insigne", () => {
    const reponse = {
      ok: true,
      peut_avancer: true,
      solde: 0,
      jour: "2026-11-21",
      releve: null,
      regles: { mission: 10, visite: 5, semaine: 30, tous_les: 7, defi: 30, remise: 30 },
      saison: { ...SAISON_1, finie: false, prendre_jusqu_au: "2027-01-04" },
      pas: 900,
      paliers: PALIERS_DE_LA_SAISON_1.map((rarete, i) => ({ palier: i + 1, rarete, pris: null })),
      visites: 5,
      missions: [],
      defi: null,
      etal: null,
      insignes: [{ saison: "saison-1", nom: "Saison 1", obtenu_le: "2026-12-20T18:00:00+00:00" }, { saison: 3 }],
    };
    const lu = lireMonSentier(reponse);
    expect(lu?.saison?.objet).toEqual(SAISON_1.objet);
    expect(lu?.insignes).toEqual([{ saison: "saison-1", nom: "Saison 1", obtenu_le: "2026-12-20T18:00:00+00:00" }]);
    // Un objet de saison inconnu du site, ou d'une autre rareté, n'est pas montré.
    expect(lireMonSentier({ ...reponse, saison: { ...reponse.saison, objet: { emplacement: "tete", objet: "bonnet" } } })?.saison?.objet).toBeNull();
    const pris = lirePalierPris({ ok: true, palier: 30, objet: { ...SAISON_1.objet, rarete: "saison", double: false }, insigne: { saison: "saison-1", nom: "Saison 1" } });
    expect(pris).toMatchObject({ palier: 30, objet: { ...SAISON_1.objet, rarete: "saison" }, insigne: { saison: "saison-1", nom: "Saison 1" } });
  });
});
