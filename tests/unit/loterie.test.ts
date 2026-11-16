import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES } from "../../src/lib/compte/errors";
import { LOTS_LOTERIE, POCHETTES_GAGNEES, PREMIER_TIRAGE_LOTERIE, PRIX_BILLET_LOTERIE, type PartDeLoterie } from "../../src/lib/village/contrat";
import {
  TEMPS,
  abscisseDuBillet,
  achatPossible,
  apresLAchat,
  bonsEnMots,
  bustesDeLaJauge,
  dispositionDeLaJauge,
  dureeDuTirage,
  etatDuTirage,
  gagnants,
  jourCourt,
  jourEnMots,
  lireAchatDeBillets,
  lireBons,
  lireLoterie,
  lireParts,
  lirePochettesGagnees,
  messageDuRefusDeLoterie,
  ordreDeLaJauge,
  partEnPourcent,
  pochettesDuLot,
  pointeDeLaJauge,
  semaineDuTirage,
} from "../../src/lib/village/loterie";

// Sous Windows, Git rend les fichiers avec des fins de ligne CRLF : les motifs ci-dessous lisent des « \n ».
const SQL = readFileSync("supabase/migrations/20261116001200_loterie_du_lundi.sql", "utf8").replace(/\r\n/g, "\n");
const entre = (texte: string, debut: string, fin: string) => texte.slice(texte.indexOf(debut), texte.indexOf(fin, texte.indexOf(debut)));
/** Le corps d'une fonction de la migration, de son `create` au `$$;` qui la ferme. */
const fonction = (nom: string) => entre(SQL, `create or replace function ${nom}(`, "$$;\n");

const part = (nom: string, gratuits: number, achetes = 0, plus: Partial<PartDeLoterie> = {}): PartDeLoterie => ({ nom, tenue: null, banniere: null, moi: false, gratuits, achetes, rang: null, billet: null, ...plus });
const reponse = (plus: Record<string, unknown> = {}) => ({
  ok: true,
  tirage: "2026-11-23",
  heure: "2026-11-23T20:30:00+00:00",
  close: false,
  prix: 30,
  lots: LOTS_LOTERIE,
  parts: [
    { nom: "Alix", tenue: { peau: "claire" }, moi: true, gratuits: 6, achetes: 2 },
    { nom: "Bran", tenue: null, moi: false, gratuits: 3, achetes: 0 },
  ],
  peut_acheter: true,
  solde: 200,
  bons: { stateres: 2 },
  dernier: null,
  releve: "2026-11-16T18:00:00+00:00",
  ...plus,
});

describe("la loterie du lundi, côté serveur", () => {
  it("garde les lots, le prix et le premier tirage du contrat", () => {
    const lignes = LOTS_LOTERIE.map((l) => `(${l.rang}, ${l.gain}, ${POCHETTES_GAGNEES.map((p) => l.pochettes[p]).join(", ")})`).join(",\n    ");
    expect(fonction("internal.loterie_lots")).toContain(`values\n    ${lignes}\n`);
    expect(fonction("internal.loterie_lots")).toContain(`returns table (rang integer, gain integer, ${POCHETTES_GAGNEES.map((p) => `p_${p} integer`).join(", ")})`);
    expect(fonction("internal.loterie_prix_billet")).toContain(`select ${PRIX_BILLET_LOTERIE}\n`);
    expect(fonction("internal.loterie_premier_tirage")).toContain(`select date '${PREMIER_TIRAGE_LOTERIE}'\n`);
    expect(SQL).toContain(`pochette text not null check (pochette in (${POCHETTES_GAGNEES.map((p) => `'${p}'`).join(", ")}))`);
    // Le premier tirage est un lundi.
    expect(new Date(`${PREMIER_TIRAGE_LOTERIE}T12:00:00Z`).getUTCDay()).toBe(1);
  });

  it("n'ajoute que : ni table ni colonne retirée, et n'efface que ses propres tirages de plus de huit semaines", () => {
    expect(SQL).not.toMatch(/\bdrop (table|column|function)\b|\btruncate\b/i);
    expect([...SQL.matchAll(/\bdelete from ([\w.]+)[^;]*;/g)].map((m) => m[0])).toEqual([
      "delete from internal.loterie_tirages t where t.tirage < p_tirage - 56;",
      "delete from internal.loterie_achats a where a.tirage < p_tirage - 56;",
    ]);
    expect(SQL).toContain("tirage date not null references internal.loterie_tirages (tirage) on delete cascade");
  });

  it("compte un billet par point de la semaine, pour les comptes validés qui ont un Gaulois", () => {
    const gratuits = fonction("internal.loterie_gratuits");
    expect(gratuits).toContain("select m.user_id, greatest(1, round(sum(m.points)))::integer");
    expect(gratuits).toContain("join public.profiles p on p.user_id = m.user_id and p.status = 'validated'");
    expect(gratuits).toContain("join internal.gaulois g on g.user_id = m.user_id");
    expect(gratuits).toContain("where m.nature = 'victoire'\n    and m.debut >= internal.loterie_semaine_debut(p_tirage)\n    and m.debut < internal.loterie_semaine_fin(p_tirage)");
    // La semaine et l'heure du tirage sont à l'heure de Paris.
    expect(fonction("internal.loterie_heure")).toContain("select (p_tirage + time '21:30') at time zone 'Europe/Paris'");
    expect(fonction("internal.loterie_semaine_debut")).toContain("select ((p_tirage - 7)::timestamp) at time zone 'Europe/Paris'");
    expect(fonction("internal.loterie_semaine_fin")).toContain("select (p_tirage::timestamp) at time zone 'Europe/Paris'");
  });

  it("vend un billet au prix vu, jamais plus que de billets gagnés, et jamais pendant le tirage", () => {
    const acheter = fonction("public.acheter_billets_loterie");
    expect(acheter).toContain("if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;");
    expect(acheter).toContain("v_uid := internal.village_acheteur();");
    // Le verrou partagé de la loterie avant celui du compte : le tirage prend le premier seul, puis ceux des gagnants.
    expect(acheter.indexOf("perform pg_advisory_xact_lock_shared(hashtext('gal_loterie'), 0);")).toBeGreaterThan(0);
    expect(acheter.indexOf("perform pg_advisory_xact_lock_shared(hashtext('gal_loterie'), 0);")).toBeLessThan(acheter.indexOf("perform internal.village_verrou(v_uid);"));
    expect(fonction("internal.loterie_tirer").indexOf("perform pg_advisory_xact_lock(hashtext('gal_loterie'), 0);")).toBeLessThan(fonction("internal.loterie_tirer").indexOf("perform internal.village_verrou(v_p.user_id);"));
    const refus = ["invalid_request", "mode_god", "tirage_fait", "prix_change", "aucun_billet", "plafond_billets"];
    expect([...acheter.matchAll(/internal\.fail\('([a-z_]+)'\)/g)].map((m) => m[1])).toEqual(refus);
    for (const code of refus.slice(1)) expect(ERROR_MESSAGES[code], code).toBeTruthy();
    expect(acheter).toContain("if v_achetes + p_nombre > v_gratuits then perform internal.fail('plafond_billets'); end if;");
    expect(acheter.indexOf("internal.fail('plafond_billets')")).toBeLessThan(acheter.indexOf("perform internal.village_debiter(v_uid, 'loterie_billet', p_nombre * v_prix, 'tirage/' || v_tirage::text);"));
  });

  it("tire une fois, l'or d'abord, sans remettre les billets d'un gagnant, et donne les lots dans l'ordre des comptes", () => {
    const tirer = fonction("internal.loterie_tirer");
    expect(tirer).toContain("if p_tirage is null or p_tirage < internal.loterie_premier_tirage() or now() < internal.loterie_heure(p_tirage) then return false; end if;");
    expect(tirer).toContain("insert into internal.loterie_tirages (tirage, billets) values (p_tirage, 0) on conflict (tirage) do nothing;\n  if not found then return false; end if;");
    expect(tirer).toContain("for v_rang in 1..3 loop");
    expect(tirer).toContain("where pa.tirage = p_tirage and pa.rang is null order by pa.user_id loop");
    expect(tirer).toContain("v_tire := least(v_total - 1, floor(internal.village_hasard() * v_total)::integer);");
    expect(tirer).toContain("where pa.tirage = p_tirage\n    order by pa.user_id\n  loop");
    expect(tirer).toContain("values (v_p.user_id, 'loterie_lot', v_p.gain, 'tirage/' || p_tirage::text || '/' || v_p.rang::text);");
    // Trois natures au journal, toutes sous la règle du journal (une minuscule, puis minuscules et soulignés).
    expect([...new Set([...SQL.matchAll(/'(loterie_[a-z]+)'/g)].map((m) => m[1]))].sort()).toEqual(["loterie_billet", "loterie_lot", "loterie_pochette"]);
    // pg_cron : chaque minute du lundi, et un rattrapage toutes les heures.
    expect(SQL).toContain("perform cron.schedule('gal-loterie', '* * * * 1', 'select internal.loterie_reveil()');");
    expect(SQL).toContain("perform cron.schedule('gal-loterie-rattrapage', '13 * * * *', 'select internal.loterie_reveil()');");
  });

  it("ouvre une pochette gagnée par la fonction de la pochette : le bon retiré, son prix crédité puis débité", () => {
    const debiter = fonction("internal.village_debiter");
    // La fonction d'avant, ligne pour ligne, avec l'ajout au milieu.
    const avant = readFileSync("supabase/migrations/20261113001900_village_boutique.sql", "utf8").replace(/\r\n/g, "\n");
    const ancienne = entre(avant, "create or replace function internal.village_debiter(", "$$;\n");
    const [tete, queue] = ancienne.split("  insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (p_user, p_nature, -p_montant, p_ref);");
    expect(debiter.startsWith(tete!.replace("  v_contrainte text;\n", "  v_contrainte text;\n  v_pochette text;\n"))).toBe(true);
    expect(debiter.endsWith(queue!)).toBe(true);
    expect(debiter).toContain("update internal.loterie_bons b set nombre = b.nombre - 1 where b.user_id = p_user and b.pochette = v_pochette and b.nombre > 0;\n    if found then\n      insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (p_user, 'loterie_pochette', p_montant, 'pochette/' || v_pochette);");
    // Chaque pochette se reconnaît à ce que son débit vise, dans la dernière version de sa fonction.
    const pochette = fonction("internal.loterie_pochette_de");
    expect(pochette).toContain("when p_nature = 'pochette_stateres' then 'stateres'");
    expect(pochette).toContain("when p_ref like 'familier/%' then 'familiers'");
    expect(pochette).toContain("when p_ref like 'banniere/%' or p_ref = 'bannieres-rembourse' then 'bannieres'");
    expect(pochette).toContain("when p_ref like 'modele/%' or p_ref = 'modeles-rembourse' then 'modeles'");
    // La surprise par ses cinq emplacements ; tout autre débit de nature 'pochette' ne prend jamais un bon.
    expect(pochette).toContain("when split_part(p_ref, '/', 1) in ('tete', 'haut', 'bas', 'pieds', 'arme') then 'surprise'\n    else null");
    const debits = (fichier: string) => [...readFileSync(`supabase/migrations/${fichier}.sql`, "utf8").matchAll(/village_debiter\(v_uid, '(pochette[a-z_]*)', v_prix, ([^)]+)\)/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(debits("20261116000800_pochette_de_stateres")).toEqual(["pochette_stateres 'lot/' || v_rang::text"]);
    expect(debits("20261115000800_familiers_du_gaulois")).toEqual(["pochette 'familier/' || v_familier"]);
    expect(debits("20261116000700_pochette_bannieres_remboursements")).toEqual(["pochette 'bannieres-rembourse'", "pochette 'banniere/' || v_banniere"]);
    expect(debits("20261116000600_gaulois_uniques_remboursements")).toEqual(["pochette 'modeles-rembourse'", "pochette 'modele/' || v_modele"]);
    expect(debits("20261116000300_divin_et_fusion")).toEqual(["pochette v_emplacement || '/' || v_objet"]);
  });

  it("tient compte du mode GOD : ni billet ni bon touché en essai, un lot reste un vrai gain, la copie se montre", () => {
    const acheter = fonction("public.acheter_billets_loterie");
    expect(acheter).toContain("if exists (select 1 from internal.village_god d where d.user_id = v_uid) then perform internal.fail('mode_god'); end if;");
    expect(acheter.indexOf("internal.fail('mode_god')")).toBeLessThan(acheter.indexOf("perform internal.village_debiter("));
    expect(fonction("internal.village_debiter")).toContain("if v_pochette is not null and not exists (select 1 from internal.village_god d where d.user_id = p_user) then");
    expect(fonction("internal.loterie_parts_json")).toContain("'tenue', m.tenue,");
    expect(fonction("internal.loterie_parts_json")).toContain("join lateral internal.gaulois_montre(x.user_id) m on true");
    // Le déclencheur du mode GOD : celui d'avant, ligne pour ligne, avec 'loterie_lot' parmi les vrais gains.
    const avant = readFileSync("supabase/migrations/20261116000900_village_mode_god.sql", "utf8").replace(/\r\n/g, "\n");
    const ancien = entre(avant, "create or replace function internal.village_god_mouvement(", "$$;\n");
    expect(fonction("internal.village_god_mouvement")).toBe(ancien.replace("'pronostic_rendu', 'marche_vente')", "'pronostic_rendu', 'marche_vente', 'loterie_lot')"));
    expect(ancien).toContain("'pronostic_rendu', 'marche_vente')");
  });

  it("donne la bannière de chaque part par la fonction d'avant, ligne pour ligne, avec un champ en plus", () => {
    const suite = readFileSync("supabase/migrations/20261116001600_loterie_bannieres.sql", "utf8").replace(/\r\n/g, "\n");
    const apres = entre(suite, "create or replace function internal.loterie_parts_json(", "$$;\n");
    const ajout = "        -- Ajout de 20261116001600 : la bannière qu'il montre sur /gaulois, pour la case de son lot.\n        'banniere', m.banniere,\n";
    expect(apres).toBe(fonction("internal.loterie_parts_json").replace("        'tenue', m.tenue,\n", `        'tenue', m.tenue,\n${ajout}`));
    expect(apres).toContain(ajout);
    // Elle vient de internal.gaulois_montre, comme la tenue : la copie pendant un essai du mode GOD.
    expect(apres).toContain("join lateral internal.gaulois_montre(x.user_id) m on true");
    expect(suite).toContain("revoke all on function internal.loterie_parts_json(uuid, date, boolean) from public, anon, authenticated;");
    expect(suite).not.toMatch(/\bdrop\b|\btruncate\b|\bdelete from\b|\bcreate table\b|\bgrant\b/i);
  });

  it("ne donne ni identifiant ni solde d'un autre, et se ferme à qui n'est pas validé", () => {
    const lire = fonction("public.get_loterie");
    expect(lire).toContain("if v_status <> 'validated' and internal.rank_of(v_role) < 2 then return internal.error_json('not_validated', ''); end if;");
    expect(lire).toContain("'solde', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = v_uid), 0)");
    expect(lire).toContain("from internal.loterie_bons b where b.user_id = v_uid and b.nombre > 0");
    const parts = fonction("internal.loterie_parts_json");
    expect(parts).not.toMatch(/'user_id'|solde/);
    expect(parts).toContain("'moi', x.user_id = p_uid");
    // Toute fonction est fermée, puis seules les trois du site s'ouvrent aux comptes connectés.
    const creees = [...SQL.matchAll(/create or replace function ((?:internal|public)\.[a-z_]+)\(/g)].map((m) => m[1]);
    for (const nom of creees) expect(SQL, nom).toMatch(new RegExp(`revoke all on function ${nom!.replace(".", "\\.")}\\([^)]*\\) from public, anon, authenticated;`));
    expect([...SQL.matchAll(/grant execute on function ([\w.]+)\([^)]*\) to (\w+);/g)].map((m) => `${m[1]} ${m[2]}`)).toEqual(["public.get_pochettes_gagnees authenticated", "public.get_loterie authenticated", "public.acheter_billets_loterie authenticated"]);
  });
});

describe("la loterie du lundi, lecture des réponses", () => {
  it("lit get_loterie", () => {
    const ma = lireLoterie(reponse());
    expect(ma?.tirage).toBe("2026-11-23");
    expect(ma?.parts.map((p) => [p.nom, p.gratuits, p.achetes, p.moi, p.rang])).toEqual([["Alix", 6, 2, true, null], ["Bran", 3, 0, false, null]]);
    expect(ma?.bons).toEqual({ stateres: 2 });
    expect(ma?.dernier).toBeNull();
    // La bannière de chacun, si le serveur la donne ; sinon null, et l'écran dessine le gagnant sans elle.
    expect(ma?.parts.map((p) => p.banniere)).toEqual([null, null]);
    const avec = lireLoterie(reponse({ parts: [{ nom: "Alix", tenue: null, banniere: "mer-de-nuages", moi: true, gratuits: 6, achetes: 2 }, { nom: "Bran", tenue: null, banniere: "", moi: false, gratuits: 3, achetes: 0 }] }));
    expect(avec?.parts.map((p) => p.banniere)).toEqual(["mer-de-nuages", null]);
  });

  it("lit le dernier tirage, avec ses gagnants dans l'ordre", () => {
    const parts = [
      { nom: "Alix", tenue: null, moi: false, gratuits: 5, achetes: 0, rang: 2, billet: 4 },
      { nom: "Bran", tenue: null, moi: true, gratuits: 6, achetes: 0, rang: null, billet: null },
      { nom: "Dann", tenue: null, moi: false, gratuits: 7, achetes: 3, rang: 1, billet: 9 },
    ];
    const ma = lireLoterie(reponse({ dernier: { tirage: "2026-11-16", tire_le: "2026-11-16T20:30:20Z", parts } }));
    expect(gagnants(ma!.dernier!.parts).map((g) => [g.rang, g.part.nom, g.billet])).toEqual([[1, "Dann", 9], [2, "Alix", 4]]);
  });

  it("refuse ce qu'il ne saurait pas dessiner juste", () => {
    expect(lireLoterie(null)).toBeNull();
    expect(lireLoterie({ ok: false, error: "not_validated" })).toBeNull();
    expect(lireLoterie(reponse({ tirage: "lundi" }))).toBeNull();
    expect(lireLoterie(reponse({ prix: 0 }))).toBeNull();
    expect(lireLoterie(reponse({ lots: LOTS_LOTERIE.slice(0, 2) }))).toBeNull();
    expect(lireLoterie(reponse({ bons: { stateres: -1 } }))).toBeNull();
    expect(lireParts([{ nom: "A", tenue: null, moi: true, gratuits: 0, achetes: 0 }], false)).toBeNull();
    expect(lireParts([{ nom: " ", tenue: null, moi: true, gratuits: 1, achetes: 0 }], false)).toBeNull();
    expect(lireParts([part("A", 1, 0, { moi: true }), part("B", 1, 0, { moi: true })], false)).toBeNull();
    // Un billet tiré qui n'est pas un des siens, deux gagnants sur la même marche.
    expect(lireParts([{ nom: "A", tenue: null, moi: false, gratuits: 2, achetes: 1, rang: 1, billet: 3 }], true)).toBeNull();
    expect(lireParts([{ nom: "A", tenue: null, moi: false, gratuits: 2, achetes: 0, rang: 1, billet: 0 }, { nom: "B", tenue: null, moi: false, gratuits: 2, achetes: 0, rang: 1, billet: 1 }], true)).toBeNull();
    // Un tirage à venir ne dit jamais de gagnant, même si la réponse en portait un.
    expect(lireParts([{ nom: "A", tenue: null, moi: false, gratuits: 2, achetes: 0, rang: 1, billet: 0 }], false)?.[0]?.rang).toBeNull();
  });

  it("lit un achat et les pochettes gagnées", () => {
    expect(lireAchatDeBillets({ ok: true, solde: 140, gratuits: 6, achetes: 4 })).toEqual({ ok: true, solde: 140, gratuits: 6, achetes: 4 });
    expect(lireAchatDeBillets({ ok: true, solde: 140, gratuits: 6, achetes: 7 })).toBeNull();
    expect(lirePochettesGagnees({ ok: true, bons: { familiers: 1, bannieres: 0, inconnue: 3 } })).toEqual({ familiers: 1 });
    expect(lirePochettesGagnees({ ok: true, bons: [] })).toBeNull();
    expect(lireBons({ stateres: 1.5 })).toBeNull();
    const ma = lireLoterie(reponse())!;
    const apres = apresLAchat(ma, { ok: true, solde: 140, gratuits: 6, achetes: 4 });
    expect([apres.solde, apres.parts[0]?.achetes, apres.parts[1]?.achetes]).toEqual([140, 4, 0]);
  });
});

describe("la loterie du lundi, ce que l'écran en dit", () => {
  it("calcule la part de chacun sur tous les billets", () => {
    const parts = [part("A", 6, 2), part("B", 3), part("C", 1)];
    expect(partEnPourcent(parts[0]!, parts)).toBeCloseTo(66.667, 2);
    expect(parts.reduce((somme, p) => somme + partEnPourcent(p, parts), 0)).toBeCloseTo(100, 9);
    expect(partEnPourcent(parts[0]!, [])).toBe(0);
  });

  it("dit ce qu'on peut encore acheter, comme le serveur", () => {
    const moi = (gratuits: number, achetes: number) => [part("Moi", gratuits, achetes, { moi: true })];
    expect(achatPossible({ peut_acheter: true, parts: moi(6, 2), solde: 500, prix: 30, close: false })).toEqual({ max: 4, raison: null });
    expect(achatPossible({ peut_acheter: true, parts: moi(6, 2), solde: 65, prix: 30, close: true })).toEqual({ max: 2, raison: null });
    expect(achatPossible({ peut_acheter: true, parts: moi(6, 6), solde: 500, prix: 30, close: false }).max).toBe(0);
    expect(achatPossible({ peut_acheter: true, parts: moi(6, 0), solde: 12, prix: 30, close: false }).raison).toContain("18");
    expect(achatPossible({ peut_acheter: true, parts: [part("Autre", 4)], solde: 500, prix: 30, close: false }).raison).toContain("cette semaine");
    // Le lundi avant 21 h 30, la semaine du tirage est finie : l'écran ne promet pas de billet pour des points d'aujourd'hui.
    expect(achatPossible({ peut_acheter: true, parts: [part("Autre", 4)], solde: 500, prix: 30, close: true }).raison).toContain("pour le suivant");
    expect(achatPossible({ peut_acheter: false, parts: moi(6, 0), solde: 500, prix: 30, close: false }).max).toBe(0);
  });

  it("dit la semaine, les jours et les lots en mots", () => {
    expect(semaineDuTirage("2026-11-23")).toEqual({ debut: "2026-11-16", fin: "2026-11-22" });
    expect(jourEnMots("2026-11-23")).toBe("lundi 23 novembre");
    expect(jourEnMots("2027-02-01")).toBe("lundi 1er février");
    expect(jourCourt("2026-11-16")).toBe("16 novembre");
    expect(pochettesDuLot(LOTS_LOTERIE[0]!)).toEqual(["une pochette de chaque sorte"]);
    expect(pochettesDuLot(LOTS_LOTERIE[1]!)).toEqual(["une pochette des familiers", "une pochette des bannières"]);
    expect(pochettesDuLot(LOTS_LOTERIE[2]!)).toEqual(["une pochette des bannières", "5 pochettes de statères"]);
    expect(bonsEnMots({ stateres: 5, bannieres: 1 })).toEqual(["une pochette des bannières", "5 pochettes de statères"]);
    expect(messageDuRefusDeLoterie("plafond_billets")).toBe(ERROR_MESSAGES["plafond_billets"]);
    expect(messageDuRefusDeLoterie("solde_insuffisant", { manque: 40 })).toContain("40");
  });
});

describe("la jauge des parts", () => {
  const parts = [part("A", 14), part("B", 10, 4), part("C", 8), part("D", 6, 2), part("E", 5, 6), part("F", 4), part("G", 2, 1), part("H", 1)];
  const cadre = { x: 30, largeur: 740, joint: 4, buste: 66 };
  const tous = new Set(parts.map((_, i) => i));

  it("alterne les grosses et les petites parts", () => {
    // Par billets : A 14, B 14, E 11, C 8, D 8, F 4, G 3, H 1 ; puis une grosse, une petite.
    expect(ordreDeLaJauge(parts).map((i) => parts[i]!.nom).join("")).toBe("AHBGEFCD");
    expect(ordreDeLaJauge([])).toEqual([]);
  });

  it("partage toute la largeur selon les billets, les billets gagnés avant les achetés", () => {
    const ordre = ordreDeLaJauge(parts);
    const segments = dispositionDeLaJauge(parts, ordre, [], cadre, tous);
    const fin = segments[segments.length - 1]!;
    expect(segments[0]!.x).toBe(30);
    expect(fin.x + fin.largeur).toBeCloseTo(770, 6);
    const pleine = 740 - 4 * 7;
    for (const s of segments) {
      const p = parts[s.index]!;
      expect(s.largeur).toBeCloseTo((pleine * (p.gratuits + p.achetes)) / 63, 6);
      expect(s.gagnes).toBeCloseTo((s.largeur * p.gratuits) / (p.gratuits + p.achetes), 6);
    }
    // Le billet tiré tombe dans la bonne moitié : gagné à gauche, acheté à droite.
    const e = segments.find((s) => parts[s.index]!.nom === "E")!;
    expect(abscisseDuBillet(e, parts[4]!, 4)).toBeLessThan(e.x + e.gagnes);
    expect(abscisseDuBillet(e, parts[4]!, 5)).toBeGreaterThan(e.x + e.gagnes);
  });

  it("referme la part d'un gagnant : les autres reprennent toute la largeur", () => {
    const ordre = ordreDeLaJauge(parts);
    const fermetures = parts.map((_, i) => (i === 0 ? 1 : 0));
    const segments = dispositionDeLaJauge(parts, ordre, fermetures, cadre, tous);
    expect(segments.find((s) => s.index === 0)!.largeur).toBe(0);
    const reste = segments.filter((s) => s.index !== 0);
    expect(reste.reduce((somme, s) => somme + s.largeur, 0) + 4 * 6).toBeCloseTo(740, 6);
    expect(reste[0]!.x).toBe(30);
  });

  it("écarte les Gaulois sans les sortir de la jauge", () => {
    const serrees = [part("A", 40), part("B", 1), part("C", 1), part("D", 1)];
    const segments = dispositionDeLaJauge(serrees, [0, 1, 2, 3], [], cadre, new Set([0, 1, 2, 3]));
    const bustes = segments.map((s) => s.buste!);
    for (let i = 1; i < bustes.length; i++) expect(bustes[i]! - bustes[i - 1]!).toBeGreaterThanOrEqual(66 - 1e-6);
    expect(bustes[0]! - 33).toBeGreaterThanOrEqual(30 - 1e-6);
    expect(bustes[3]! + 33).toBeLessThanOrEqual(770 + 1e-6);
    // Sans place pour tous : les gagnants et le membre d'abord, puis les plus grosses parts.
    const choix = bustesDeLaJauge([part("A", 9), part("B", 8), part("C", 1, 0, { moi: true }), part("D", 1, 0, { rang: 3, billet: 0 })], 3);
    expect([...choix].sort()).toEqual([0, 2, 3]);
    expect(dispositionDeLaJauge(serrees, [0, 1, 2, 3], [], cadre, new Set([0]))[1]!.buste).toBeNull();
  });

  it("mène la pointe d'un bord à l'autre, puis sur le billet", () => {
    expect(pointeDeLaJauge(400, cadre, 0)).toBe(30);
    expect(pointeDeLaJauge(400, cadre, 1)).toBeCloseTo(400, 6);
    expect(pointeDeLaJauge(31, cadre, 1)).toBeCloseTo(31, 6);
    for (let u = 0; u <= 1; u += 0.01) {
      const x = pointeDeLaJauge(400, cadre, u);
      expect(x).toBeGreaterThanOrEqual(30 - 1e-6);
      expect(x).toBeLessThanOrEqual(770 + 1e-6);
    }
  });

  it("déroule le tirage : l'or, l'argent, le bronze, puis le bilan toutes parts rouvertes", () => {
    expect(dureeDuTirage(0)).toBe(0);
    expect(etatDuTirage(0, 0).fini).toBe(true);
    const fin = dureeDuTirage(3);
    expect(fin).toBeLessThan(21);
    const debut = etatDuTirage(0, 3);
    expect([debut.pointes, debut.enCours, debut.fini]).toEqual([[null, null, null], null, false]);
    const milieu = etatDuTirage(TEMPS.depart[0] + 2, 3);
    expect(milieu.enCours).toBe(0);
    expect(milieu.pointes[0]).toBeGreaterThan(0);
    expect(milieu.arrives).toEqual([false, false, false]);
    // Avant le départ du lot suivant, la part du gagnant est refermée et il est sur sa marche.
    const entreDeux = etatDuTirage(TEMPS.depart[1] - 0.01, 3);
    expect(entreDeux.fermetures[0]).toBeCloseTo(1, 3);
    expect(entreDeux.montees[0]).toBe(1);
    expect(entreDeux.visibles[0]).toBe(0);
    // À la fin : tout le monde sur le podium, toutes les parts rouvertes, le dernier jamais refermé.
    const bilan = etatDuTirage(fin, 3);
    expect([bilan.fini, bilan.fermetures, bilan.montees, bilan.arrives]).toEqual([true, [0, 0, 0], [1, 1, 1], [true, true, true]]);
    for (let t = 0; t <= fin; t += 0.05) expect(etatDuTirage(t, 3).fermetures[2]).toBe(0);
    // Un seul participant : une seule course, sa part ne se referme pas.
    expect(dureeDuTirage(1)).toBeLessThan(dureeDuTirage(3));
    expect(etatDuTirage(dureeDuTirage(1), 1).fermetures).toEqual([0]);
  });
});
