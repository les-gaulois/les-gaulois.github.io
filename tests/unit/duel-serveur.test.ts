/**
 * Le serveur du duel fait foi : il doit rendre exactement ce que rend le moteur partagé. Sur le banc PGlite (toutes les
 * migrations du dépôt), ce test compare le SQL de la migration du duel au TypeScript :
 * - les cartes, les atouts et les camps de départ ;
 * - des milliers de manches de duels tirés au hasard des deux côtés, lieux, compagnons et pouvoirs compris ;
 * - des centaines de choix de la machine, aux trois niveaux et plus loin, jusqu'à la valeur de chaque carte, au bit près ;
 * - des duels entiers joués par les fonctions des membres, rejoués à côté par le moteur, avec la graine du serveur.
 * Puis les règles du serveur : l'interrupteur, les mains, les duels comptés, la récompense, les droits, aucun statère.
 */
import type { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { blocsSqlDuDuel } from "../../scripts/fabriquer-sql-duel";
import {
  CATALOGUE_DU_DUEL, CLES_DES_ATOUTS, EMPLACEMENTS_DU_DUEL, NIVEAUX, P, atoutsDe, atoutsEnEntiers, camp, campEnEntiers, carte, carteEnEntiers, cartesDeLaMain,
  choisir, graineSuivante, libres, mainEnEntiers, manche, tirageDeLaGraine, valeurDuCoup, verdict,
} from "../../supabase/functions/code-discord/duel/index";
import type { Atouts, Camp, Carte, IdDeCompagnon, IdDeLieu, MainParEmplacement, OptionsDuCamp } from "../../supabase/functions/code-discord/duel/index";
import { hasardDEssai } from "../../src/lib/village/essai-duel";
import { ATTENDU, NOMS, texteAColler } from "../../scripts/a-coller-duel";
import { BOSS, ORDRE_DES_BOSS, bossDuJour } from "../../supabase/functions/code-discord/duel/contenu/boss";
import { NIVEAU_DES_BOSS } from "../../supabase/functions/code-discord/duel/contenu/niveaux";
import { DOSSIER_DES_MIGRATIONS, baseDeTest, commeMembre, discordDe, migrations, nouveauMembre, texteDeMigration } from "./banc-pglite";

const LONG = 300_000;
let db: PGlite;

const lignes = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => (await db.query<T>(sql, params)).rows;
const une = async <T>(sql: string, params: unknown[] = []): Promise<T> => (await lignes<{ r: T }>(sql, params))[0]!.r;

beforeAll(async () => {
  db = await baseDeTest();
  // un tableau d'entiers depuis un tableau JSON, dans l'ordre
  await db.exec(`create function public.t_ents(j jsonb) returns integer[] language sql immutable as $$
    select coalesce(array_agg(v::integer order by n), '{}') from jsonb_array_elements_text(j) with ordinality t(v, n) $$;`);
}, LONG);

/* ---------- Le tirage des duels d'essai ---------- */

const alea = hasardDEssai(20261122);
const pris = <T>(l: readonly T[]): T => l[Math.floor(alea() * l.length)]!;
const PAR_EMPLACEMENT = Object.fromEntries(EMPLACEMENTS_DU_DUEL.map((e) => [e, Object.keys(CATALOGUE_DU_DUEL).filter((id) => CATALOGUE_DU_DUEL[id]!.e === e)]));
const LIEUX: readonly (IdDeLieu | null)[] = [null, "front", "mers", "cartes", "saisons", "legendes", "tresors"];
const COMPAGNONS: readonly (IdDeCompagnon | null)[] = [null, "Ferme", "Forêt", "Ciel et eaux", "Légendes", "Drôles"];

function mainAuHasard(): Carte[] {
  for (;;) {
    const m = EMPLACEMENTS_DU_DUEL.map((e) => carte(pris(PAR_EMPLACEMENT[e]!)));
    if (m.reduce((s, c) => s + c.c, 0) <= P.BOURSE) return m;
  }
}
/** Un pouvoir de boss au hasard, un fois sur trois : de un à trois atouts, de 1 à 3. */
function passifsAuHasard(): Atouts[] {
  if (alea() > 1 / 3) return [];
  const p: Atouts = {};
  for (let i = 0, n = 1 + Math.floor(alea() * 3); i < n; i++) p[pris(CLES_DES_ATOUTS)] = 1 + Math.floor(alea() * 3);
  return [p];
}
const optionsAuHasard = (lieu: IdDeLieu | null): OptionsDuCamp => ({ lieu, compagnon: pris(COMPAGNONS), passifs: passifsAuHasard() });
const optionsEnJson = (o: OptionsDuCamp) => ({ lieu: o.lieu ?? null, compagnon: o.compagnon ?? null, passifs: o.passifs ?? [] });

interface CasDeManche {
  a: number[];
  b: number[];
  ca: number[];
  cb: number[];
  ta: number[];
  tb: number[];
  ia: number;
  ib: number;
  m: number;
}
interface Position {
  a: Camp;
  b: Camp;
  m: number;
}

/** Des duels tirés au hasard des deux côtés : chaque manche jouée, et quelques positions pour la machine. */
function tirerDesDuels(n: number): { cas: CasDeManche[]; attendus: number[][]; positions: Position[] } {
  const cas: CasDeManche[] = [], attendus: number[][] = [], positions: Position[] = [];
  for (let d = 0; d < n; d++) {
    const lieu = pris(LIEUX), ma = mainAuHasard(), mb = mainAuHasard();
    let a = camp(ma, optionsAuHasard(lieu)), b = camp(mb, optionsAuHasard(lieu));
    for (let m = 1; m <= 40; m++) {
      if (d % 5 === 0 && m % 3 === 1) positions.push({ a, b, m });
      const ia = pris(libres(a)), ib = pris(libres(b)), r = manche(a, b, ia, ib, m);
      const ea = campEnEntiers(r.a);
      cas.push({ a: campEnEntiers(a), b: campEnEntiers(b), ca: mainEnEntiers(a.main), cb: mainEnEntiers(b.main), ta: atoutsEnEntiers(a.at), tb: atoutsEnEntiers(b.at), ia, ib, m });
      attendus.push([ea.length, ...ea, ...campEnEntiers(r.b)]);
      a = r.a;
      b = r.b;
      if (r.fini) break;
    }
  }
  return { cas, attendus, positions };
}

/** Les manches jouées par le SQL, par paquets. */
async function manchesEnSql(cas: CasDeManche[]): Promise<number[][]> {
  const sortie: number[][] = [];
  for (let i = 0; i < cas.length; i += 800) {
    const r = await lignes<{ r: number[] }>(
      `select internal.duel_manche(t_ents(c->'a'), t_ents(c->'b'), t_ents(c->'ca'), t_ents(c->'cb'), t_ents(c->'ta'), t_ents(c->'tb'),
         (c->>'ia')::int, (c->>'ib')::int, (c->>'m')::int) as r
       from jsonb_array_elements($1::jsonb) with ordinality x(c, n) order by n`,
      [JSON.stringify(cas.slice(i, i + 800))],
    );
    sortie.push(...r.map((x) => x.r));
  }
  return sortie;
}

const enJson = (c: Camp) => ({ e: campEnEntiers(c), c: mainEnEntiers(c.main), t: atoutsEnEntiers(c.at) });

/* ---------- Les copies du moteur ---------- */

describe("les données du duel sur le serveur", () => {
  it("sont les blocs que fabrique le moteur, dans la dernière migration qui porte chacun", () => {
    for (const [nom, bloc] of Object.entries(blocsSqlDuDuel())) {
      const derniere = migrations().filter((m) => readFileSync(new URL(m, DOSSIER_DES_MIGRATIONS), "utf8").includes(`-- <duel-${nom}>`)).at(-1);
      expect(derniere, nom).toBeDefined();
      const texte = texteDeMigration(derniere!);
      expect(texte.slice(texte.indexOf(`-- <duel-${nom}>`), texte.indexOf(`-- </duel-${nom}>`) + `-- </duel-${nom}>`.length), nom).toBe(bloc);
    }
  });

  it("ont les onze boss du contenu : leur main, leur pouvoir, leur lieu, leur niveau", async () => {
    const r = await lignes<{ boss: string; rang: number; main: string[]; passif: Atouts; banniere: string; lieu: string; niveau: string }>("select boss, rang, main, passif, banniere, lieu, niveau from internal.duel_boss order by rang");
    expect(r.map((b) => b.boss)).toEqual([...ORDRE_DES_BOSS]);
    for (const b of r) {
      const t = BOSS.find((x) => x.id === b.boss)!;
      expect({ main: b.main, passif: b.passif, banniere: b.banniere, lieu: b.lieu, niveau: b.niveau }, b.boss).toEqual({ main: [...t.main], passif: t.pouvoir.passif, banniere: t.lieu.banniere, lieu: t.lieu.famille, niveau: NIVEAU_DES_BOSS });
      expect(await une(`select internal.duel_refus_de_main(null, $1::text[]) as r`, [b.main]), b.boss).not.toBe("main_invalide");
    }
  });

  it("choisissent le même boss du jour que le contenu, sur plus d'un an de jours", async () => {
    const jours = Array.from({ length: 420 }, (_, i) => new Date(Date.UTC(2026, 10, 1 + i, 11)));
    const r = await lignes<{ b: string }>("select internal.duel_boss_du(j::date) as b from unnest($1::text[]) with ordinality u(j, k) order by k", [jours.map((d) => d.toISOString().slice(0, 10))]);
    expect(r.map((x) => x.b)).toEqual(jours.map((d) => bossDuJour(d).id));
  });

  it("donnent les mêmes niveaux de la machine que le contenu", async () => {
    const r = await lignes<{ niveau: string; fantaisie: number; loin: number }>("select niveau, fantaisie, loin from internal.duel_niveaux order by niveau");
    expect(Object.fromEntries(r.map((x) => [x.niveau, { fantaisie: x.fantaisie, loin: x.loin }]))).toEqual(NIVEAUX);
  });

  it("donnent les mêmes cartes que le moteur", async () => {
    const r = await lignes<{ objet: string; c: number[] }>("select objet, internal.duel_carte(objet) as c from internal.duel_cartes order by rang");
    expect(r.map((x) => x.objet)).toEqual(Object.keys(CATALOGUE_DU_DUEL));
    for (const x of r) expect(x.c, x.objet).toEqual(carteEnEntiers(carte(x.objet)));
  });

  it("donnent les mêmes atouts et les mêmes camps de départ, panoplies, lieux, compagnons et pouvoirs compris", async () => {
    const cas = Array.from({ length: 600 }, () => {
      const main = mainAuHasard(), o = optionsAuHasard(pris(LIEUX));
      return { main: main.map((c) => c.id), o: optionsEnJson(o), at: atoutsEnEntiers(atoutsDe(main, o)), camp: campEnEntiers(camp(main, o)) };
    });
    const r = await lignes<{ at: number[]; camp: number[] }>(
      `select internal.duel_atouts(array(select jsonb_array_elements_text(c->'main')), c->'o') as at,
         internal.duel_camp(internal.duel_cartes_de_la_main(array(select jsonb_array_elements_text(c->'main'))), internal.duel_atouts(array(select jsonb_array_elements_text(c->'main')), c->'o')) as camp
       from jsonb_array_elements($1::jsonb) with ordinality x(c, n) order by n`,
      [JSON.stringify(cas)],
    );
    for (const [i, x] of r.entries()) expect([x.at, x.camp], JSON.stringify(cas[i]!.o)).toEqual([cas[i]!.at, cas[i]!.camp]);
    // une panoplie au moins dans le tirage
    expect(cas.some((c) => c.at.some((v) => v !== 0))).toBe(true);
  });
});

/* ---------- Le moteur : les manches et la machine ---------- */

describe("le moteur du serveur", () => {
  const tirage = tirerDesDuels(3000);

  it("joue des milliers de manches tirées au hasard exactement comme le moteur partagé", { timeout: LONG }, async () => {
    expect(tirage.cas.length).toBeGreaterThan(20_000);
    const sql = await manchesEnSql(tirage.cas);
    let ecarts = 0;
    for (const [i, r] of sql.entries()) {
      if (JSON.stringify(r) !== JSON.stringify(tirage.attendus[i])) {
        ecarts++;
        if (ecarts <= 3) expect({ cas: tirage.cas[i], sql: r }).toEqual({ cas: tirage.cas[i], sql: tirage.attendus[i] });
      }
    }
    expect(ecarts).toBe(0);
  });

  it("dit les mêmes cartes libres et le même verdict", async () => {
    const cas = tirage.positions.slice(0, 400).map((p) => ({ a: campEnEntiers(p.a), b: campEnEntiers(p.b), l: libres(p.a), v: verdict(p.a, p.b) }));
    const r = await lignes<{ l: number[]; v: number }>(
      "select internal.duel_libres(t_ents(c->'a')) as l, internal.duel_verdict(t_ents(c->'a'), t_ents(c->'b')) as v from jsonb_array_elements($1::jsonb) with ordinality x(c, n) order by n",
      [JSON.stringify(cas)],
    );
    expect(r.map((x) => [x.l, x.v])).toEqual(cas.map((c) => [c.l, c.v]));
    expect(await une("select internal.duel_libres(array[18,18,3,6,0,0,0,0,0,0,2,1,3,1,4,0]) as r")).toEqual([1, 3]);
  });

  it("donne la même valeur à chaque carte, au bit près, et la machine fait le même choix", { timeout: LONG }, async () => {
    const reglages = [NIVEAUX.apprenti, NIVEAUX.guerrier, NIVEAUX.druide, { fantaisie: 0.3, loin: 2 }, { fantaisie: 40, loin: 1 }, { fantaisie: 2, loin: 2 }];
    const cas = tirage.positions.slice(0, 240).map((p, i) => {
      const n = reglages[i % reglages.length]!, loin = i % 12 === 0 ? 3 : n.loin, h = alea();
      const moi = p.b, lui = p.a;
      return {
        moi: enJson(moi), lui: enJson(lui), m: p.m, h, f: n.fantaisie, loin,
        valeurs: libres(moi).map((ia) => valeurDuCoup(moi, lui, ia, p.m, loin)),
        choix: choisir(moi, lui, p.m, () => h, n.fantaisie, loin),
      };
    });
    const r = await lignes<{ v: number[]; c: number }>(
      `select array(select internal.duel_valeur(t_ents(c->'moi'->'e'), t_ents(c->'lui'->'e'), t_ents(c->'moi'->'c'), t_ents(c->'lui'->'c'), t_ents(c->'moi'->'t'), t_ents(c->'lui'->'t'),
           i, (c->>'m')::int, (c->>'loin')::int) from unnest(internal.duel_libres(t_ents(c->'moi'->'e'))) with ordinality u(i, k) order by k) as v,
         internal.duel_choisir(t_ents(c->'moi'->'e'), t_ents(c->'lui'->'e'), t_ents(c->'moi'->'c'), t_ents(c->'lui'->'c'), t_ents(c->'moi'->'t'), t_ents(c->'lui'->'t'),
           (c->>'m')::int, (c->>'h')::float8, (c->>'f')::float8, (c->>'loin')::int) as c
       from jsonb_array_elements($1::jsonb) with ordinality x(c, n) order by n`,
      [JSON.stringify(cas)],
    );
    for (const [i, x] of r.entries()) {
      expect(x.v, `valeurs ${i}`).toEqual(cas[i]!.valeurs);
      expect(x.c, `choix ${i}`).toBe(cas[i]!.choix);
    }
  });

  it("calcule l'exponentielle et la graine comme le moteur", async () => {
    const xs = Array.from({ length: 200 }, (_, i) => -i * 0.21 - alea() * 0.01);
    const r = await une<number[]>("select array(select internal.duel_exp(x::float8) from unnest($1::float8[]) with ordinality u(x, k) order by k) as r", [xs]);
    const { expDuDuel } = await import("../../supabase/functions/code-discord/duel/machine");
    expect(r).toEqual(xs.map(expDuDuel));
    expect(await une("select internal.duel_graine_suivante(2147483646)::text as r")).toBe(String(graineSuivante(2147483646)));
  });
});

/* ---------- Le duel joué par les membres ---------- */

const BASE: MainParEmplacement = { arme: "gourdin", tete: "bonnet", haut: "tunique", pieds: "bottes", bas: "braies" };
/** La main d'un boss du contenu, en objet. */
const mainDuBoss = (b: { main: readonly string[] }): MainParEmplacement => Object.fromEntries(EMPLACEMENTS_DU_DUEL.map((e, i) => [e, b.main[i]])) as MainParEmplacement;
const FORTE: MainParEmplacement = { arme: "epee", tete: "casque", haut: "cotte-mailles", pieds: "sandales", bas: "braies" }; // 10 points

interface PartieRendue {
  partie: number;
  compte: boolean;
  niveau: keyof typeof NIVEAUX;
  mains: { a: MainParEmplacement; b: MainParEmplacement };
  options: { a: OptionsDuCamp; b: OptionsDuCamp };
  coups: [number, number][];
  manche: number;
  vies: { a: number; b: number };
  fini: boolean;
  verdict: number | null;
  abandon: boolean;
  recompense: { pas: number } | null;
}
type Reponse = { ok: true; partie: PartieRendue; carte_machine?: number } | { ok: false; error: string };

const appel = <T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []): Promise<T> => commeMembre<T>(db, uid, `select ${sql} as r`, params);

async function donner(uid: string, ids: string[]): Promise<void> {
  for (const id of ids) {
    const e = CATALOGUE_DU_DUEL[id]!.e;
    await db.query("insert into internal.gaulois_inventaire (user_id, emplacement, objet, quantite, origine) values ($1, $2, $3, 1, 'achat') on conflict do nothing", [uid, e, id]);
  }
}

/** Joue une partie jusqu'au bout, en rejouant chaque manche avec le moteur et la graine du serveur. Rend la partie finie. */
async function jouerJusquAuBout(uid: string, p: PartieRendue): Promise<PartieRendue> {
  const n = NIVEAUX[p.niveau];
  let a = camp(cartesDeLaMain(p.mains.a), p.options.a), b = camp(cartesDeLaMain(p.mains.b), p.options.b);
  let partie = p;
  while (!partie.fini) {
    const g = Number((await lignes<{ g: string }>("select graine::text as g from internal.duel_parties where id = $1", [partie.partie]))[0]!.g);
    const attendue = choisir(b, a, partie.manche, () => tirageDeLaGraine(graineSuivante(g)), n.fantaisie, n.loin);
    const ia = pris(libres(a));
    const r = (await appel<Reponse>(uid, "public.jouer_manche_duel($1, $2, $3)", [partie.partie, partie.manche, ia]));
    if (!r.ok) throw new Error(r.error);
    expect(r.carte_machine).toBe(attendue);
    const m = manche(a, b, ia, attendue, partie.manche);
    a = m.a;
    b = m.b;
    partie = r.partie;
    expect(partie.vies).toEqual({ a: a.vie, b: b.vie });
    expect(partie.coups.at(-1)).toEqual([ia, attendue]);
    if (partie.fini) expect(partie.verdict).toBe(verdict(a, b));
  }
  return partie;
}

describe("le duel des membres", () => {
  let titulaire: string, membre: string, defenseur: string;

  beforeAll(async () => {
    titulaire = await nouveauMembre(db);
    membre = await nouveauMembre(db, { empreinte: "a".repeat(64) });
    defenseur = await nouveauMembre(db);
    await db.query("insert into internal.stateres_don_titulaire (discord_id) values ($1)", [await discordDe(db, titulaire)]);
    for (const uid of [titulaire, membre, defenseur]) await donner(uid, ["epee", "casque", "cotte-mailles", "sandales", "braies-cuir", "epee-or", "ogive", "fuselage"]);
    // une saison du pass ouverte aujourd'hui, si celle du dépôt est finie
    await db.query(`insert into internal.sentier_saisons (saison, nom, debut, fin, paliers, pas_par_palier)
      select 'essai-duel', 'Essai du duel', current_date - 1, current_date + 1, 30, 30 where internal.sentier_saison_du(internal.duel_jour(now())) is null`);
  }, LONG);

  it("reste fermé à tous sauf au titulaire tant que l'interrupteur est faux", async () => {
    expect(await une("select ouvert as r from internal.duel_ouvert")).toBe(false);
    expect(await appel(membre, "public.get_mon_duel()")).toMatchObject({ ok: false, error: "duel_ferme" });
    expect(await appel(membre, "public.get_adversaires_duel()")).toMatchObject({ ok: false, error: "duel_ferme" });
    expect(await appel(membre, "public.commencer_duel('boss', null, $1::jsonb)", [JSON.stringify(BASE)])).toMatchObject({ ok: false, error: "duel_ferme" });
    expect(await appel(titulaire, "public.get_mon_duel()")).toMatchObject({ ok: true, ouvert: false, defense: null, partie: null });
  });

  it("garde une main de défense que le membre possède, dans la bourse", async () => {
    expect(await appel(titulaire, "public.enregistrer_main_duel($1::jsonb)", [JSON.stringify({ ...BASE, arme: "hache" })])).toMatchObject({ ok: false, error: "carte_non_possedee" });
    expect(await appel(titulaire, "public.enregistrer_main_duel($1::jsonb)", [JSON.stringify({ ...BASE, arme: "bonnet" })])).toMatchObject({ ok: false, error: "main_invalide" });
    expect(await appel(titulaire, "public.enregistrer_main_duel($1::jsonb)", [JSON.stringify({ ...BASE, arme: "epee-or", tete: "ogive", haut: "fuselage" })])).toMatchObject({ ok: false, error: "main_trop_chere" });
    expect(await appel(titulaire, "public.enregistrer_main_duel($1::jsonb)", [JSON.stringify({ arme: "gourdin" })])).toMatchObject({ ok: false, error: "main_invalide" });
    expect(await appel(titulaire, "public.enregistrer_main_duel($1::jsonb)", [JSON.stringify(FORTE)])).toEqual({ ok: true, defense: FORTE });
    const etat = await appel(titulaire, "public.get_mon_duel()");
    expect(etat).toMatchObject({ ok: true, defense: FORTE, defense_valide: true });
    const collection = etat.collection as Record<string, string[]>;
    expect(collection.arme).toEqual(expect.arrayContaining(["gourdin", "epee", "epee-or"]));
    expect(collection.arme).not.toContain("hache");
  });

  it("joue un duel contre sa propre main pour l'essayer, jamais compté, manche par manche comme le moteur", { timeout: LONG }, async () => {
    const adv = (await appel(titulaire, "public.get_adversaires_duel()")) as { adversaires: { cle: string; main: MainParEmplacement }[] };
    expect(adv.adversaires.length).toBe(1);
    const r = (await appel<Reponse>(titulaire, "public.commencer_duel('membre', $1::uuid, $2::jsonb)", [adv.adversaires[0]!.cle, JSON.stringify(BASE)]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.partie).toMatchObject({ compte: false, niveau: "guerrier", manche: 1, fini: false, mains: { a: BASE, b: FORTE } });
    expect(await appel(titulaire, "public.commencer_duel('boss', null, $1::jsonb)", [JSON.stringify(BASE)])).toMatchObject({ ok: false, error: "partie_en_cours" });
    expect(await appel(titulaire, "public.jouer_manche_duel($1, 2, 0)", [r.partie.partie])).toMatchObject({ ok: false, error: "mauvaise_manche" });
    const finie = await jouerJusquAuBout(titulaire, r.partie);
    expect(finie.recompense).toBeNull();
    expect(await appel(titulaire, "public.jouer_manche_duel($1, $2, 0)", [finie.partie, finie.manche])).toMatchObject({ ok: false, error: "partie_finie" });
    // duel fermé : même contre le boss, rien ne compte, donc aucun pas du pass
    const b = await appel<Reponse>(titulaire, "public.commencer_duel('boss', null, $1::jsonb)", [JSON.stringify(BASE)]);
    if (!b.ok) throw new Error(b.error);
    expect(b.partie.compte).toBe(false);
    await appel(titulaire, "public.abandonner_duel($1)", [b.partie.partie]);
  });

  it("une fois ouvert, joue des duels comptés contre un autre membre, rejoués par le moteur, et note la défense", { timeout: LONG }, async () => {
    await db.query("update internal.duel_ouvert set ouvert = true, maj_le = now() where id");
    expect(await appel(defenseur, "public.enregistrer_main_duel($1::jsonb)", [JSON.stringify(FORTE)])).toMatchObject({ ok: true });
    const adv = (await appel(membre, "public.get_adversaires_duel()")) as { adversaires: { cle: string; nom: string }[] };
    expect(adv.adversaires.length).toBe(2); // le titulaire et le défenseur, plus jamais soi-même
    const cleDuDefenseur = (await lignes<{ cle: string }>("select cle::text as cle from internal.duel_mains where user_id = $1", [defenseur]))[0]!.cle;
    expect(adv.adversaires.map((a) => a.cle)).toContain(cleDuDefenseur);
    const avant = await une<string>("select count(*)::text as r from internal.stateres_mouvements");
    const r = (await appel<Reponse>(membre, "public.commencer_duel('membre', $1::uuid, $2::jsonb)", [cleDuDefenseur, JSON.stringify(FORTE)]));
    if (!r.ok) throw new Error(r.error);
    expect(r.partie.compte).toBe(true);
    const finie = await jouerJusquAuBout(membre, r.partie);
    // un second duel contre le même membre, le même jour, n'est plus compté
    const r2 = (await appel<Reponse>(membre, "public.commencer_duel('membre', $1::uuid, $2::jsonb)", [cleDuDefenseur, JSON.stringify(BASE)]));
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.partie.compte).toBe(false);
    await appel(membre, "public.abandonner_duel($1)", [r2.partie.partie]);
    const vu = (await appel(defenseur, "public.get_mon_duel()")) as { defenses: { issue: string; manches: number }[]; bilan: Record<string, number> };
    expect(vu.defenses.length).toBe(2);
    expect(vu.defenses.at(-1)!.issue).toBe(finie.verdict === 1 ? "battu" : finie.verdict === -1 ? "repousse" : "egalite");
    expect(vu.defenses[0]!.issue).toBe("repousse");
    expect(vu.bilan.repousses! + vu.bilan.battus!).toBeGreaterThanOrEqual(1);
    expect(await une<string>("select count(*)::text as r from internal.stateres_mouvements")).toBe(avant);
  });

  it("récompense un duel compté gagné de cinq pas du pass, l'annonce, et ne crée aucun statère", async () => {
    const avant = await une<string>("select count(*)::text as r from internal.stateres_mouvements");
    const id = (await lignes<{ id: number }>(
      `insert into internal.duel_parties (user_id, contre, adversaire, niveau, compte, jour, main_a, main_b, options_a, options_b, cartes_a, cartes_b, atouts_a, atouts_b, etat_a, etat_b, graine)
       select $1, 'membre', $2, 'guerrier', true, internal.duel_jour(now()), d.main_a, d.main_b, d.options_a, d.options_b, d.cartes_a, d.cartes_b, d.atouts_a, d.atouts_b, d.etat_a, d.etat_b, 7
       from internal.duel_parties d where d.user_id = $1 order by d.id limit 1 returning id::integer as id`,
      [membre, defenseur],
    ))[0]!.id;
    await db.query("select internal.duel_finir($1, 1, false)", [id]);
    const partie = (await lignes<{ pas: number; verdict: number }>("select pas, verdict from internal.duel_parties where id = $1", [id]))[0]!;
    expect(partie).toEqual({ pas: 5, verdict: 1 });
    const gains = await lignes<{ source: string; pas: number }>("select source, pas from internal.sentier_gains where user_id = $1 and source like 'duel/%'", [membre]);
    expect(gains.length).toBeGreaterThanOrEqual(1);
    expect(gains.every((g) => g.pas === 5)).toBe(true);
    const annonces = (await une<{ annonces: Record<string, unknown>[] }>("select public.duel_annonces_a_envoyer() as r")).annonces;
    const la = annonces.find((x) => Number(x.partie) === Number(id));
    expect(la).toMatchObject({ essai: false, contre: "membre", boss: null, carte: null, salle: null, vainqueur: { pseudo: null }, vaincu: { pseudo: null } });
    // une victoire jouée porte sa carte décisive : celle que le vainqueur a posée à la dernière manche
    for (const x of annonces.filter((a) => (a.manches as number) > 0)) {
      const d = (await lignes<{ main_a: string[]; coups: number[] }>("select main_a, coups from internal.duel_parties where id = $1", [x.partie]))[0]!;
      const i = d.coups.at(-2)!;
      expect(x.carte).toEqual({ emplacement: ["arme", "tete", "haut", "pieds", "bas"][i], objet: d.main_a[i] });
    }
    expect(await une("select public.noter_annonces_duel(array[$1]::bigint[]) as r", [id])).toEqual({ ok: true, notees: 1 });
    // une victoire comptée contre un boss donne ses pas, mais n'entre pas dans la file : l'image montre deux vrais Gaulois
    const contreBoss = (await lignes<{ id: number }>(
      `insert into internal.duel_parties (user_id, contre, boss, niveau, compte, jour, main_a, main_b, options_a, options_b, cartes_a, cartes_b, atouts_a, atouts_b, etat_a, etat_b, graine)
       select $1, 'boss', 'loup', 'guerrier', true, internal.duel_jour(now()), d.main_a, d.main_b, d.options_a, d.options_b, d.cartes_a, d.cartes_b, d.atouts_a, d.atouts_b, d.etat_a, d.etat_b, 7
       from internal.duel_parties d where d.user_id = $1 order by d.id limit 1 returning id::integer as id`,
      [membre],
    ))[0]!.id;
    await db.query("select internal.duel_finir($1, 1, false)", [contreBoss]);
    expect((await lignes<{ pas: number }>("select pas from internal.duel_parties where id = $1", [contreBoss]))[0]!.pas).toBe(5);
    expect(await une<number>("select count(*)::int as r from internal.duel_annonces where partie = $1", [contreBoss])).toBe(0);
    expect(await une<string>("select count(*)::text as r from internal.stateres_mouvements")).toBe(avant);
  });

  it("compte trois duels par jour, quatre quand la flamme de série brûle", async () => {
    const jour = (await appel(membre, "public.get_mon_duel()")).jour as Record<string, unknown>;
    expect(jour).toMatchObject({ comptes: 3, flamme: false, au_plus: 30 });
    expect(await une("select public.noter_flammes_duel(array[$1]) as r", ["a".repeat(64)])).toEqual({ ok: true, flammes: 1 });
    const avec = (await appel(membre, "public.get_mon_duel()")).jour as Record<string, unknown>;
    expect(avec).toMatchObject({ flamme: true });
    expect(Number(avec.restants)).toBe(Number(jour.restants) + 1);
    expect(await une("select public.noter_flammes_duel(array['pas-une-empreinte']) as r")).toMatchObject({ ok: false });
  });

  it("joue le boss du jour du contenu, et perd par abandon une partie laissée 24 heures", async () => {
    const attendu = bossDuJour(new Date());
    const etat = await appel<{ boss: Record<string, unknown> }>(membre, "public.get_mon_duel()");
    expect(etat.boss).toMatchObject({ boss: attendu.id, niveau: NIVEAU_DES_BOSS, main: mainDuBoss(attendu), options: { lieu: attendu.lieu.famille, compagnon: null, passifs: [attendu.pouvoir.passif] }, battu: false });
    const r = await appel<Reponse>(membre, "public.commencer_duel('boss', null, $1::jsonb)", [JSON.stringify(BASE)]);
    if (!r.ok) throw new Error(r.error);
    expect(r.partie.mains.b).toEqual(mainDuBoss(attendu));
    // une manche jouée au bout de 24 heures : la partie est perdue par abandon, et rendue telle quelle
    await db.query("update internal.duel_parties set joue_le = now() - interval '25 hours' where id = $1", [r.partie.partie]);
    expect(await appel(membre, "public.jouer_manche_duel($1, 1, 0)", [r.partie.partie])).toMatchObject({ ok: true, partie: { fini: true, abandon: true, verdict: -1 } });
    // une autre, laissée 24 heures : la lecture de l'écran la clôt
    const r2 = await appel<Reponse>(membre, "public.commencer_duel('boss', null, $1::jsonb)", [JSON.stringify(BASE)]);
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.partie.compte).toBe(false); // un seul duel compté par jour contre un même boss
    await db.query("update internal.duel_parties set joue_le = now() - interval '25 hours' where id = $1", [r2.partie.partie]);
    const apres = (await appel(membre, "public.get_mon_duel()")) as { partie: unknown; attaques: { verdict: number; boss: string }[] };
    expect(apres.partie).toBeNull();
    expect(apres.attaques[0]).toMatchObject({ verdict: -1, boss: attendu.id });
    // sans boss, le serveur le dit
    await db.exec("begin; delete from internal.duel_boss where true;");
    try {
      expect(await appel(membre, "public.commencer_duel('boss', null, $1::jsonb)", [JSON.stringify(BASE)])).toMatchObject({ ok: false, error: "pas_de_boss" });
    } finally {
      await db.exec("rollback;");
    }
    expect(await une<number>("select count(*)::int as r from internal.duel_boss")).toBe(BOSS.length);
  });

  it("pendant un essai du mode GOD, ne montre rien aux autres : ni défense, ni duel compté", async () => {
    await appel(membre, "public.enregistrer_main_duel($1::jsonb)", [JSON.stringify(BASE)]);
    const cleDuMembre = (await lignes<{ cle: string }>("select cle::text as cle from internal.duel_mains where user_id = $1", [membre]))[0]!.cle;
    const cleDuDefenseur = (await lignes<{ cle: string }>("select cle::text as cle from internal.duel_mains where user_id = $1", [defenseur]))[0]!.cle;
    await db.query("insert into internal.village_god (user_id, sauvegarde) values ($1, '{\"gaulois\": {\"tenue\": {}}}'::jsonb)", [membre]);
    try {
      const vus = await appel<{ adversaires: { cle: string }[] }>(defenseur, "public.get_adversaires_duel()");
      expect(vus.adversaires.map((a) => a.cle)).not.toContain(cleDuMembre);
      expect(await appel(defenseur, "public.commencer_duel('membre', $1::uuid, $2::jsonb)", [cleDuMembre, JSON.stringify(BASE)])).toMatchObject({ ok: false, error: "adversaire_inconnu" });
      expect(await appel(membre, "public.commencer_duel('membre', $1::uuid, $2::jsonb)", [cleDuDefenseur, JSON.stringify(BASE)])).toMatchObject({ ok: false, error: "mode_god" });
      expect(await appel(membre, "public.commencer_duel('membre', $1::uuid, $2::jsonb)", [cleDuMembre, JSON.stringify(BASE)])).toMatchObject({ ok: false, error: "mode_god" });
      expect(await appel(membre, "public.enregistrer_main_duel($1::jsonb)", [JSON.stringify(FORTE)])).toMatchObject({ ok: false, error: "mode_god" });
      const b = await appel<Reponse>(membre, "public.commencer_duel('boss', null, $1::jsonb)", [JSON.stringify(BASE)]);
      if (!b.ok) throw new Error(b.error);
      expect(b.partie.compte).toBe(false);
      await appel(membre, "public.abandonner_duel($1)", [b.partie.partie]);
    } finally {
      await db.query("delete from internal.village_god where user_id = $1", [membre]);
    }
    const apres = await appel<{ adversaires: { cle: string }[] }>(defenseur, "public.get_adversaires_duel()");
    expect(apres.adversaires.map((a) => a.cle)).toContain(cleDuMembre);
  });

  it("ouvre au robot le salon des duels, réglable comme les autres", async () => {
    expect(await une<Record<string, unknown>>("select public.robot_discord_salons() as r")).toHaveProperty("duels", null);
    await db.query("insert into internal.discord_salons (salon, webhook_url) values ('duels', 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz')");
    expect(await une<Record<string, unknown>>("select public.robot_discord_salons() as r")).toHaveProperty("duels", "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz");
    expect(await une("select public.note_discord_salon('duels', 'direction', 200, 'Le Gaulois') as r")).toEqual({ ok: true });
    expect(await une("select public.note_discord_salon('inconnu', 'direction', 200, 'Le Gaulois') as r")).toMatchObject({ ok: false });
    await db.query("delete from internal.discord_salon_checks where salon = 'duels'");
    await db.query("delete from internal.discord_salons where salon = 'duels'");
  });

  it("refuse les fonctions du duel aux visiteurs, et celles du robot aux membres", async () => {
    for (const f of ["public.get_mon_duel()", "public.enregistrer_main_duel(jsonb)", "public.get_adversaires_duel()", "public.commencer_duel(text, uuid, jsonb)", "public.jouer_manche_duel(bigint, integer, integer)", "public.abandonner_duel(bigint)"]) {
      expect(await une(`select has_function_privilege('anon', '${f}', 'execute') as r`), f).toBe(false);
      expect(await une(`select has_function_privilege('authenticated', '${f}', 'execute') as r`), f).toBe(true);
    }
    for (const f of ["public.noter_flammes_duel(text[])", "public.duel_annonces_a_envoyer()", "public.noter_annonces_duel(bigint[])", "internal.duel_manche(integer[], integer[], integer[], integer[], integer[], integer[], integer, integer, integer)"]) {
      expect(await une(`select has_function_privilege('authenticated', '${f}', 'execute') as r`), f).toBe(false);
    }
    expect(await une("select has_function_privilege('service_role', 'public.noter_flammes_duel(text[])', 'execute') as r")).toBe(true);
  });

  it("se recolle sans erreur ni changement, une fois le duel ouvert et joué", async () => {
    const avant = await une<string>("select count(*)::text as r from internal.duel_parties");
    const r = await db.exec(texteAColler());
    expect((r.at(-1)!.rows[0] as { controle: string }).controle).toBe("duel des Gaulois : installé, ouvert");
    expect(await une<string>("select count(*)::text as r from internal.duel_parties")).toBe(avant);
    expect(await une("select ouvert as r from internal.duel_ouvert")).toBe(true);
  });
});

/* ---------- Le fichier que colle le pilote ---------- */

describe("le fichier à coller", () => {
  it("s'installe après toutes les autres migrations, se recolle sans rien changer, et le dit", { timeout: LONG }, async () => {
    const base = await baseDeTest({ sauf: [...NOMS].map((n) => `${n}.sql`) });
    const controle = async (): Promise<string> => {
      const r = await base.exec(texteAColler());
      return (r.at(-1)!.rows[0] as { controle: string }).controle;
    };
    expect(await controle()).toBe(ATTENDU);
    expect(await controle()).toBe(ATTENDU);
    expect((await base.query<{ n: number }>("select count(*)::int as n from internal.duel_parties")).rows[0]!.n).toBe(0);
    await base.close();
  });

  it("s'arrête sans rien changer quand le village n'est pas installé", { timeout: LONG }, async () => {
    const vide = await baseDeTest({ sauf: migrations().filter((m) => m >= "20261113001700") });
    await expect(vide.exec(texteAColler())).rejects.toThrow(/pas installés/);
    await vide.exec("rollback");
    expect((await vide.query<{ t: string | null }>("select to_regclass('internal.duel_cartes')::text as t")).rows[0]!.t).toBeNull();
    await vide.close();
  });
});
