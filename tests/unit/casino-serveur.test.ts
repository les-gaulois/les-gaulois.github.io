/**
 * Le serveur du casino fait foi : il doit rendre exactement ce que disent les règles (src/lib/village/casino/). Sur le banc
 * PGlite (toutes les migrations du dépôt), ce test compare le SQL de la migration du casino au TypeScript :
 * - chaque paiement de la roue, des dés, de la palissade, de la machine et de la course, sur toutes les issues ;
 * - la vérification des paris, cas par cas ;
 * - la machine du vingt-et-un, main après main et coup après coup, sur les mêmes cartes ;
 * - des parties entières jouées par les fonctions des membres, avec un hasard d'essai, rejouées à côté par le TypeScript.
 * Puis les règles du serveur : le journal des statères, le plafond du jour, les refus, le mode GOD, la carte cachée, la main
 * reprise, l'interrupteur, les droits, et le fichier que colle le pilote.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { ATTENDU, NOMS, texteAColler } from "../../scripts/a-coller-casino";
import { ERROR_MESSAGES } from "../../src/lib/compte/errors";
import { PARIS_DE_LA_ROUE, PARIS_DES_DES, REFUS_DU_CASINO, type CoupDuVingtEtUn, type EtatDuCasino, type FaitDuVingtEtUn, type ReponseDuVingtEtUn } from "../../src/lib/village/contrat-casino";
import { verifierLesParis } from "../../src/lib/village/casino/commun";
import { ROUGES, payerLaRoue } from "../../src/lib/village/casino/roue";
import { PARIS_DES, payerLesDes } from "../../src/lib/village/casino/des";
import { DIXIEMES_DES_COUPES, renduDeLaCoupe } from "../../src/lib/village/casino/palissade";
import { FOIS_DE_LA_MACHINE, lireLaLigne, renduDeLaMachine, resultatDuTirage } from "../../src/lib/village/casino/machine";
import { COULOIRS, couloirPour } from "../../src/lib/village/casino/course";
import { carteDuNombre, coupsPermis, distribuer, faitsMontres, jouerUnCoup, type EtatDuVingtEtUn } from "../../src/lib/village/casino/vingt-et-un";
import { baseDeTest, commeMembre, discordDe, migrations, nouveauMembre, texteDeMigration } from "./banc-pglite";
import { graine } from "./casino-essai";

const LONG = 300_000;
const MIGRATION = `${NOMS[0]}.sql`;
let db: PGlite;

const lignes = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => (await db.query<T>(sql, params)).rows;
const une = async <T>(sql: string, params: unknown[] = []): Promise<T> => (await lignes<{ r: T }>(sql, params))[0]!.r;
const json = (v: unknown): string => JSON.stringify(v);

beforeAll(async () => {
  db = await baseDeTest();
  await db.exec(`
    -- un tableau d'entiers depuis un tableau JSON, dans l'ordre
    create function public.t_ents(j jsonb) returns integer[] language sql immutable as $$
      select coalesce(array_agg(v::integer order by n), '{}') from jsonb_array_elements_text(j) with ordinality t(v, n) $$;
    -- le refus d'une fonction interne, en texte, ou son résultat
    create function public.t_paris(p jsonb, k text[]) returns text language plpgsql as $$
    begin return internal.casino_paris(p, k)::text; exception when sqlstate 'GA001' then return sqlerrm; end $$;
    create function public.t_mise(p integer) returns text language plpgsql as $$
    begin return internal.casino_mise(p)::text; exception when sqlstate 'GA001' then return sqlerrm; end $$;
    create function public.t_jouer(e jsonb, c text, p jsonb) returns jsonb language plpgsql as $$
    begin return internal.casino_v21_jouer(e, c, public.t_ents(p)); exception when sqlstate 'GA001' then return jsonb_build_object('erreur', sqlerrm); end $$;
    -- Le hasard d'essai : les valeurs de public.t_hasard, dans l'ordre, puis le vrai hasard du serveur quand elles manquent.
    create table public.t_hasard (i bigserial primary key, v integer not null);
    alter function internal.casino_entier(integer) rename to casino_entier_vrai;
    create function internal.casino_entier(p_n integer) returns integer language plpgsql volatile as $$
    declare v_i bigint; v_v integer;
    begin
      select h.i, h.v into v_i, v_v from public.t_hasard h order by h.i limit 1;
      if v_i is null then return internal.casino_entier_vrai(p_n); end if;
      delete from public.t_hasard where i = v_i;
      if v_v < 0 or v_v >= p_n then raise exception 'hasard d''essai % hors de 0 à %', v_v, p_n - 1; end if;
      return v_v;
    end $$;
  `);
}, LONG);

/** Les prochaines valeurs du hasard du serveur. */
const pousser = async (valeurs: readonly number[]): Promise<void> => {
  await db.query("insert into public.t_hasard (v) select unnest(public.t_ents($1::jsonb))", [json(valeurs)]);
};
const viderLeHasard = async (): Promise<void> => {
  await db.query("delete from public.t_hasard where true");
};

/** Un membre validé avec son Gaulois et `stateres` statères. */
async function joueur(stateres = 10_000, o: { valide?: boolean; gaulois?: boolean } = {}): Promise<string> {
  await viderLeHasard();
  const uid = await nouveauMembre(db, o);
  if (stateres > 0) await db.query("insert into internal.stateres_mouvements (user_id, nature, montant, ref) values ($1, 'don', $2, 'essai')", [uid, stateres]);
  return uid;
}
const comme = <T>(uid: string, requete: string, params: unknown[] = []): Promise<T> => commeMembre<T>(db, uid, requete, params);
const solde = async (uid: string): Promise<number> => (await lignes<{ s: number }>("select coalesce((select solde from internal.stateres_soldes where user_id = $1), 0)::int as s", [uid]))[0]!.s;
const journal = (uid: string) =>
  lignes<{ nature: string; montant: number; ref: string }>("select nature, montant, ref from internal.stateres_mouvements where user_id = $1 and nature ~ 'casino' order by id", [uid]);

/* ---------- Le hasard du serveur ---------- */

describe("le hasard du serveur", () => {
  it("tire sans biais de 0 à n - 1", async () => {
    const comptes = await lignes<{ v: number; n: number }>("select v, count(*)::int as n from (select internal.casino_entier_vrai(6) as v from generate_series(1, 60000)) t group by v order by v");
    expect(comptes.map((c) => c.v)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const c of comptes) expect(Math.abs(c.n - 10000), String(c.v)).toBeLessThan(500);
    const bornes = await une<{ min: number; max: number }>("select jsonb_build_object('min', min(v), 'max', max(v)) as r from (select internal.casino_entier_vrai(52) as v from generate_series(1, 20000)) t");
    expect(bornes).toEqual({ min: 0, max: 51 });
  });

  it("tire une pioche de cartes de 0 à 51", async () => {
    await viderLeHasard();
    const p = await une<number[]>("select to_jsonb(internal.casino_pioche(24)) as r");
    expect(p).toHaveLength(24);
    expect(p.every((c) => Number.isInteger(c) && c >= 0 && c <= 51)).toBe(true);
  });
});

/* ---------- Les règles en SQL ---------- */

describe("les règles du serveur sont celles du TypeScript", () => {
  const alea = graine(20261123);
  const tableAuHasard = (ids: readonly string[]): Record<string, number> => {
    const t: Record<string, number> = {};
    for (let i = 0, n = 1 + Math.floor(alea() * 4); i < n; i++) t[ids[Math.floor(alea() * ids.length)]!] = 10 * (1 + Math.floor(alea() * 5));
    return t;
  };

  it("la roue : les 48 paris, les rouges, et chaque paiement sur les 36 numéros", async () => {
    expect(await une("select to_jsonb(internal.casino_roue_paris()) as r")).toEqual([...PARIS_DE_LA_ROUE]);
    expect(await une("select to_jsonb(internal.casino_roue_rouges()) as r")).toEqual([...ROUGES].sort((a, b) => a - b));
    const cas = Array.from({ length: 400 }, (_, i) => ({ paris: i < 48 ? { [PARIS_DE_LA_ROUE[i]!]: 10 } : tableAuHasard(PARIS_DE_LA_ROUE), n: 1 + (i % 36) }));
    const sql = await une<{ total: number; par_pari: Record<string, number> }[]>(
      "select jsonb_agg(internal.casino_roue_rendu(c -> 'paris', (c ->> 'n')::int) order by i) as r from jsonb_array_elements($1::jsonb) with ordinality t (c, i)", [json(cas)]);
    cas.forEach((c, i) => {
      const ts = payerLaRoue(c.paris, c.n);
      expect(sql[i], json(c)).toEqual({ total: ts.total, par_pari: ts.parPari });
    });
    // chaque pari seul, sur chacun des 36 numéros
    const exhaustif = await une<number[]>(
      "select jsonb_agg((internal.casino_roue_rendu(jsonb_build_object(p, 10), n) ->> 'total')::int order by k, n) as r from unnest(internal.casino_roue_paris()) with ordinality u (p, k), generate_series(1, 36) n");
    expect(exhaustif).toEqual(PARIS_DE_LA_ROUE.flatMap((p) => Array.from({ length: 36 }, (_, n) => payerLaRoue({ [p]: 10 }, n + 1).total)));
  });

  it("les dés : les quatorze paris et chaque paiement sur les 36 faces", async () => {
    expect(await une("select to_jsonb(internal.casino_des_paris()) as r")).toEqual([...PARIS_DES_DES]);
    expect(await une("select jsonb_agg(internal.casino_des_dixiemes(p) order by k) as r from unnest(internal.casino_des_paris()) with ordinality u (p, k)")).toEqual(PARIS_DES.map((p) => p.dixiemes));
    const cas = Array.from({ length: 360 }, (_, i) => ({ paris: tableAuHasard(PARIS_DES_DES), a: 1 + (i % 6), b: 1 + (Math.floor(i / 6) % 6) }));
    const sql = await une<{ total: number; par_pari: Record<string, number> }[]>(
      "select jsonb_agg(internal.casino_des_rendu(c -> 'paris', (c ->> 'a')::int, (c ->> 'b')::int) order by i) as r from jsonb_array_elements($1::jsonb) with ordinality t (c, i)", [json(cas)]);
    cas.forEach((c, i) => {
      const ts = payerLesDes(c.paris, [c.a, c.b]);
      expect(sql[i], json(c)).toEqual({ total: ts.total, par_pari: ts.parPari });
    });
  });

  it("la palissade, la machine et la course : chaque issue", async () => {
    expect(await une("select to_jsonb(internal.casino_palissade_dixiemes()) as r")).toEqual([...DIXIEMES_DES_COUPES]);
    expect(await une("select to_jsonb(internal.casino_machine_fois()) as r")).toEqual([...FOIS_DE_LA_MACHINE]);
    expect(await une("select to_jsonb(internal.casino_course_fois()) as r")).toEqual(COULOIRS.map((c) => c.fois));
    expect(await une("select jsonb_agg(internal.casino_machine_resultat(r) order by r) as r from generate_series(0, 999) r")).toEqual(Array.from({ length: 1000 }, (_, r) => resultatDuTirage(r)));
    expect(await une("select jsonb_agg(internal.casino_course_couloir(n) order by n) as r from generate_series(0, 23) n")).toEqual(Array.from({ length: 24 }, (_, n) => couloirPour(n)));
    for (let k = 0; k <= 8; k++) expect(renduDeLaCoupe(200, k)).toBe((200 * DIXIEMES_DES_COUPES[k]!) / 10);
  });

  it("la machine montre toujours le résultat tiré, avec ses neuf cases tirées au hasard", async () => {
    await viderLeHasard();
    for (const res of [0, 1, 2, 3, 4, -1] as const) {
      const toutes = await une<number[][][]>("select jsonb_agg(internal.casino_machine_cases($1)) as r from generate_series(1, 300)", [res]);
      for (const c of toutes) {
        expect(lireLaLigne(c)).toBe(res);
        expect(c.flat().every((s) => Number.isInteger(s) && s >= 0 && s < 5)).toBe(true);
      }
      // le haut et le bas des rouleaux prennent tous les symboles
      expect(new Set(toutes.flatMap((c) => [c[0]![0], c[2]![2]])).size).toBe(5);
    }
  });

  it("les paris et les mises : refusés et acceptés comme le dit le TypeScript", async () => {
    const cas: { paris: unknown; ids: readonly string[] }[] = [
      { paris: {}, ids: PARIS_DE_LA_ROUE },
      { paris: { rouge: 15 }, ids: PARIS_DE_LA_ROUE },
      { paris: { rouge: 0 }, ids: PARIS_DE_LA_ROUE },
      { paris: { rouge: -10 }, ids: PARIS_DE_LA_ROUE },
      { paris: { rouge: "10" }, ids: PARIS_DE_LA_ROUE },
      { paris: { rouge: 10.5 }, ids: PARIS_DE_LA_ROUE },
      { paris: { rouge: true }, ids: PARIS_DE_LA_ROUE },
      { paris: { n37: 10 }, ids: PARIS_DE_LA_ROUE },
      { paris: { n0: 10 }, ids: PARIS_DE_LA_ROUE },
      { paris: { s7: 10 }, ids: PARIS_DE_LA_ROUE },
      { paris: { rouge: 100, n7: 100 }, ids: PARIS_DE_LA_ROUE },
      { paris: { rouge: 100, n7: 110 }, ids: PARIS_DE_LA_ROUE },
      { paris: { rouge: 1000 }, ids: PARIS_DE_LA_ROUE },
      { paris: { s7: 200 }, ids: PARIS_DES_DES },
      { paris: { s13: 10 }, ids: PARIS_DES_DES },
      ...Array.from({ length: 200 }, () => ({ paris: tableAuHasard(alea() < 0.5 ? PARIS_DE_LA_ROUE : PARIS_DES_DES), ids: alea() < 0.5 ? PARIS_DE_LA_ROUE : PARIS_DES_DES })),
    ];
    for (const c of cas) {
      const sql = await une<string>("select public.t_paris($1::jsonb, $2::text[]) as r", [json(c.paris), `{${c.ids.join(",")}}`]);
      const ts = verifierLesParis(c.paris as Record<string, unknown>, c.ids);
      expect(sql, json(c.paris)).toBe(ts.ok ? String(ts.total) : ts.refus);
    }
    expect(await une("select public.t_paris('[10]'::jsonb, '{rouge}') as r")).toBe("pari_invalide");
    expect(await une("select public.t_paris(null, '{rouge}') as r")).toBe("pari_invalide");
    const mises = await une<string[]>("select jsonb_agg(public.t_mise(m) order by k) as r from unnest(array[null, -10, 0, 5, 10, 200, 210, 1000]) with ordinality u (m, k)");
    expect(mises).toEqual(["pari_invalide", "pari_invalide", "pari_invalide", "pari_invalide", "10", "200", "mise_trop_haute", "mise_trop_haute"]);
  });

  it("refusent un montant écrit autrement qu'en chiffres seuls, et ce qu'ils acceptent se paie toujours, quel que soit le tirage", async () => {
    // Écrits à la main, comme un membre peut les envoyer sans passer par l'écran (JSON.stringify n'écrit jamais « 10.0 »).
    const textes: [string, string][] = [
      ['{"rouge":10.0}', "pari_invalide"],
      ['{"rouge":190,"bleu":10.0}', "pari_invalide"],
      ['{"rouge":100E-1}', "pari_invalide"],
      ['{"rouge":10.00001}', "pari_invalide"],
      ['{"rouge":-0}', "pari_invalide"],
      ['{"rouge":1e1}', "10"],
      ['{"rouge":1.0e1,"n7":2e1}', "30"],
      ['{"rouge":1e30}', "mise_trop_haute"],
    ];
    for (const [t, attendu] of textes) expect(await une("select public.t_paris($1::jsonb, internal.casino_roue_paris()) as r", [t]), t).toBe(attendu);
    for (const [t] of textes.filter(([, a]) => /^\d+$/.test(a))) {
      const totaux = await une<number[]>("select jsonb_agg((internal.casino_roue_rendu($1::jsonb, n) ->> 'total')::int order by n) as r from generate_series(1, 36) n", [t]);
      expect(totaux, t).toEqual(Array.from({ length: 36 }, (_, n) => payerLaRoue(JSON.parse(t) as Record<string, number>, n + 1).total));
    }
    expect(await une("select public.t_paris('{\"s7\":180,\"moins\":10.0,\"plus\":10.0}'::jsonb, internal.casino_des_paris()) as r")).toBe("pari_invalide");
    const des = await une<number[]>("select jsonb_agg((internal.casino_des_rendu('{\"s7\":1.0e1,\"double\":2e1}'::jsonb, a, b) ->> 'total')::int order by a, b) as r from generate_series(1, 6) a, generate_series(1, 6) b");
    expect(des.reduce((s, x) => s + x, 0)).toBe(36 * 30);
  });
});

/* ---------- Le vingt-et-un : la machine en SQL ---------- */

interface MainSql {
  cartes: number[];
  mise: number;
  doublee: boolean;
  finie: boolean;
  issue: string | null;
  recu: number;
}
interface EtatSql {
  mise: number;
  tavernier: number[];
  mains: MainSql[];
  separee: boolean;
  courante: number;
  phase: "joueur" | "fini";
}
type FaitSql = Record<string, unknown> & { carte?: number };

const etatVersTs = (e: EtatSql): EtatDuVingtEtUn => ({
  ...e,
  tavernier: e.tavernier.map(carteDuNombre),
  mains: e.mains.map((m) => ({ ...m, cartes: m.cartes.map(carteDuNombre), issue: m.issue as EtatDuVingtEtUn["mains"][number]["issue"] })),
});
const faitsVersTs = (f: FaitSql[]): FaitDuVingtEtUn[] => f.map((x) => (typeof x.carte === "number" ? { ...x, carte: carteDuNombre(x.carte) } : x) as FaitDuVingtEtUn);
/** Une source qui suit la pioche et compte ce qu'elle a donné. */
const sourceDe = (pioche: readonly number[]) => {
  const s = { prises: 0, tire: () => pioche[s.prises++]! };
  return s;
};

describe("la machine du vingt-et-un en SQL", () => {
  it("joue chaque main comme le TypeScript : 1 200 mains tirées au hasard, coup après coup", { timeout: LONG }, async () => {
    const alea = graine(21);
    const carte = () => Math.floor(alea() * 52);
    const coups: CoupDuVingtEtUn[] = ["tirer", "rester", "doubler", "separer"];
    let separations = 0;
    let doubles = 0;
    for (let h = 0; h < 1200; h++) {
      const mise = 10 * (1 + Math.floor(alea() * 20));
      const pioche = Array.from({ length: 4 }, carte);
      // une main sur trois commence par une paire, pour essayer les séparations (des as une fois sur cinq)
      if (h % 3 === 0) pioche[2] = (h % 15 === 0 ? 0 : pioche[0]! % 13) + 13 * Math.floor(alea() * 4);
      if (h % 15 === 0) pioche[0] = 13 * Math.floor(alea() * 4);
      const src = sourceDe(pioche);
      const ts = distribuer(mise, src.tire);
      const sql = await une<{ etat: EtatSql; faits: FaitSql[]; prises: number }>("select internal.casino_v21_distribuer($1, public.t_ents($2::jsonb)) as r", [mise, json(pioche)]);
      expect(etatVersTs(sql.etat), json(pioche)).toEqual(ts.etat);
      expect(faitsVersTs(sql.faits)).toEqual(ts.faits);
      expect(sql.prises).toBe(4);
      let etat = sql.etat;
      while (ts.etat.phase === "joueur") {
        const permis = coupsPermis(ts.etat);
        expect(await une("select internal.casino_v21_permis($1::jsonb) as r", [json(etat)])).toEqual(permis);
        const permises = coups.filter((k) => permis[k]);
        const coup = permis.separer && alea() < 0.6 ? "separer" : permises[Math.floor(alea() * permises.length)]!;
        if (coup === "separer") separations++;
        if (coup === "doubler") doubles++;
        const p = Array.from({ length: 24 }, carte);
        const s = sourceDe(p);
        const faits = jouerUnCoup(ts.etat, coup, s.tire);
        const r = await une<{ etat: EtatSql; faits: FaitSql[]; prises: number }>("select public.t_jouer($1::jsonb, $2, $3::jsonb) as r", [json(etat), coup, json(p)]);
        expect(etatVersTs(r.etat), `${json(etat)} ${coup} ${json(p)}`).toEqual(ts.etat);
        expect(faitsVersTs(r.faits)).toEqual(faits);
        expect(r.prises).toBe(s.prises);
        etat = r.etat;
      }
    }
    expect(separations).toBeGreaterThan(200);
    expect(doubles).toBeGreaterThan(200);
  });

  it("refuse un coup non permis", async () => {
    const d = await une<{ etat: EtatSql }>("select internal.casino_v21_distribuer(10, '{4,5,6,9}') as r");
    expect(await une("select public.t_jouer($1::jsonb, 'separer', '[]') as r", [json(d.etat)])).toEqual({ erreur: "coup_refuse" });
    expect(await une("select public.t_jouer($1::jsonb, 'abandon', '[]') as r", [json(d.etat)])).toEqual({ erreur: "coup_refuse" });
    const fini = await une<{ etat: EtatSql }>("select public.t_jouer($1::jsonb, 'rester', '[9,9,9]') as r", [json(d.etat)]);
    expect(await une("select public.t_jouer($1::jsonb, 'tirer', '[1]') as r", [json(fini.etat)])).toEqual({ erreur: "coup_refuse" });
  });

  it("ne manque jamais de cartes : un coup en demande au plus 24", () => {
    // Le tavernier : le plus de cartes qu'il peut tirer, de toute main de départ, avant 17 ; le joueur : trois au plus
    // (séparer, puis la main suivante).
    const valeurs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const tot = (v: number[]) => {
      const dur = v.reduce((a, b) => a + b, 0);
      return v.includes(1) && dur + 10 <= 21 ? dur + 10 : dur;
    };
    let auPlus = 0;
    const va = (main: number[], tirees: number): void => {
      if (tot(main) >= 17) {
        auPlus = Math.max(auPlus, tirees);
        return;
      }
      for (const c of valeurs) va([...main, c], tirees + 1);
    };
    for (const a of valeurs) for (const b of valeurs) va([a, b], 0);
    expect(auPlus).toBe(10);
    expect(auPlus + 3).toBeLessThanOrEqual(24);
  });
});

/* ---------- Le casino des membres ---------- */

describe("le casino des membres", () => {
  it("montre l'écran entier, sans rien d'un autre compte", async () => {
    const uid = await joueur(5000);
    const e = await comme<EtatDuCasino>(uid, "select public.get_casino() as r");
    expect(e).toMatchObject({ ok: true, ouvert: true, peut_jouer: true, god: false, solde: 5000, plafond: 2000, mise_au_plus: 200, jetons: [10, 20, 50, 100, 200], mise_du_jour: 0, reste_du_jour: 2000, parties: [], main: null });
    expect(e.jour).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Object.keys(e).sort()).toEqual(["god", "jetons", "jour", "main", "mise_au_plus", "mise_du_jour", "ok", "ouvert", "parties", "peut_jouer", "plafond", "reste_du_jour", "solde"]);
  });

  it("joue chaque jeu à un coup : tire, prend la mise au journal, rend le gain", async () => {
    const uid = await joueur(5000);
    await viderLeHasard();
    // la roue : le numéro 7 (rouge non, impair oui)
    await pousser([6]);
    const roue = await comme<Record<string, unknown>>(uid, "select public.jouer_roue($1::jsonb) as r", [json({ rouge: 100, n7: 10, impair: 50 })]);
    const attendu = payerLaRoue({ rouge: 100, n7: 10, impair: 50 }, 7);
    expect(roue).toMatchObject({ ok: true, jeu: "roue", numero: 7, mise: 160, rendu: attendu.total, par_pari: attendu.parPari, god: false, solde_apres: 5000 - 160 + attendu.total, mise_du_jour: 160, reste_du_jour: 1840 });
    expect(roue).not.toHaveProperty("solde");
    // la machine : le tirage 5 donne la torque d'or, 20 fois
    await pousser([5]);
    const machine = await comme<{ resultat: number; cases: number[][]; rendu: number }>(uid, "select public.jouer_machine(50) as r");
    expect(machine).toMatchObject({ resultat: 1, rendu: renduDeLaMachine(50, 1), mise: 50 });
    expect(lireLaLigne(machine.cases)).toBe(1);
    // la course : le tirage 22 fait gagner le couloir 4 (12 fois)
    await pousser([22]);
    expect(await comme(uid, "select public.jouer_course(4, 20) as r")).toMatchObject({ couloir: 4, gagnant: 4, mise: 20, rendu: 240 });
    await pousser([0]);
    expect(await comme(uid, "select public.jouer_course(4, 20) as r")).toMatchObject({ couloir: 4, gagnant: 0, rendu: 0 });
    // la palissade : six pas à droite sur huit
    await pousser([1, 1, 0, 1, 1, 0, 1, 1]);
    expect(await comme(uid, "select public.jouer_palissade(30) as r")).toMatchObject({ chemin: [1, 1, 0, 1, 1, 0, 1, 1], coupe: 6, mise: 30, rendu: renduDeLaCoupe(30, 6) });
    // les dés : 3 et 3
    await pousser([2, 2]);
    const des = await comme<Record<string, unknown>>(uid, "select public.jouer_des($1::jsonb) as r", [json({ double: 10, s6: 20, plus: 10 })]);
    const d = payerLesDes({ double: 10, s6: 20, plus: 10 }, [3, 3]);
    expect(des).toMatchObject({ faces: [3, 3], mise: 40, rendu: d.total, par_pari: d.parPari });
    // le journal : une mise par partie, et un gain quand quelque chose revient
    const j = await journal(uid);
    const parties = await lignes<{ id: number; mise: number; rendu: number }>("select id::int, mise, rendu from internal.casino_parties where user_id = $1 order by id", [uid]);
    expect(parties).toHaveLength(6);
    for (const p of parties) {
      expect(j.filter((l) => l.ref === `casino/${p.id}`).map((l) => [l.nature, l.montant])).toEqual(p.rendu > 0 ? [["casino_mise", -p.mise], ["casino_gain", p.rendu]] : [["casino_mise", -p.mise]]);
    }
    expect(await solde(uid)).toBe(5000 - parties.reduce((s, p) => s + p.mise - p.rendu, 0));
    // les dernières parties, de la plus récente à la plus ancienne, en résumé
    const e = await comme<EtatDuCasino>(uid, "select public.get_casino() as r");
    expect(e.parties.map((p) => p.jeu)).toEqual(["des", "palissade", "course", "course", "machine", "roue"]);
    expect(e.parties[0]!.resume).toEqual({ jeu: "des", faces: [3, 3] });
    expect(e.parties[4]!.resume).toEqual({ jeu: "machine", resultat: 1 });
    expect(e.parties[5]!.resume).toEqual({ jeu: "roue", numero: 7 });
  });

  it("refuse ce qui n'est pas valable, sans rien prendre", async () => {
    const uid = await joueur(100);
    const refus = async (requete: string, params: unknown[] = []) => (await comme<{ ok: boolean; error: string }>(uid, requete, params)).error;
    expect(await refus("select public.jouer_roue($1::jsonb) as r", [json({ rouge: 15 })])).toBe("pari_invalide");
    expect(await refus("select public.jouer_roue($1::jsonb) as r", [json({ s7: 10 })])).toBe("pari_invalide");
    expect(await refus("select public.jouer_roue($1::jsonb) as r", [json({ rouge: 210 })])).toBe("mise_trop_haute");
    // « 10.0 » : refusé avant le tirage, gagnant ou perdant
    for (let n = 0; n < 36; n++) {
      await pousser([n]);
      expect(await refus("select public.jouer_roue($1::jsonb) as r", ['{"rouge":90,"bleu":10.0}'])).toBe("pari_invalide");
    }
    await viderLeHasard();
    expect(await refus("select public.jouer_des($1::jsonb) as r", ['{"s7":80,"moins":10.0,"plus":10.0}'])).toBe("pari_invalide");
    expect(await refus("select public.jouer_des($1::jsonb) as r", [json({})])).toBe("pari_invalide");
    expect(await refus("select public.jouer_machine(0) as r")).toBe("pari_invalide");
    expect(await refus("select public.jouer_machine(null) as r")).toBe("pari_invalide");
    expect(await refus("select public.jouer_palissade(250) as r")).toBe("mise_trop_haute");
    expect(await refus("select public.jouer_course(6, 10) as r")).toBe("pari_invalide");
    expect(await refus("select public.jouer_course(-1, 10) as r")).toBe("pari_invalide");
    expect(await refus("select public.distribuer_vingt_et_un(5) as r")).toBe("pari_invalide");
    expect(await refus("select public.jouer_machine(110) as r")).toBe("solde_insuffisant");
    expect(await refus("select public.distribuer_vingt_et_un(200) as r")).toBe("solde_insuffisant");
    expect(await journal(uid)).toEqual([]);
    expect(await lignes("select 1 from internal.casino_parties where user_id = $1", [uid])).toEqual([]);
    expect(await solde(uid)).toBe(100);
  });

  it("ne laisse jouer qu'un compte validé avec son Gaulois", async () => {
    const attente = await joueur(1000, { valide: false });
    expect(await comme(attente, "select public.get_casino() as r")).toMatchObject({ ok: true, peut_jouer: false });
    expect(await comme(attente, "select public.jouer_roue('{\"rouge\":10}'::jsonb) as r")).toMatchObject({ ok: false, error: "not_validated" });
    const sansGaulois = await joueur(1000, { gaulois: false });
    expect(await comme(sansGaulois, "select public.jouer_des('{\"s7\":10}'::jsonb) as r")).toMatchObject({ ok: false, error: "no_gaulois" });
    expect(await comme(sansGaulois, "select public.distribuer_vingt_et_un(10) as r")).toMatchObject({ ok: false, error: "no_gaulois" });
    const suspendu = await joueur(1000);
    await db.query("update public.profiles set status = 'suspended' where user_id = $1", [suspendu]);
    expect(await comme(suspendu, "select public.get_casino() as r")).toMatchObject({ ok: false, error: "suspended" });
    expect(await comme(suspendu, "select public.jouer_machine(10) as r")).toMatchObject({ ok: false, error: "suspended" });
    expect((await lignes<{ r: { error: string } }>("select public.get_casino() as r"))[0]!.r).toMatchObject({ ok: false, error: "not_signed_in" });
    expect((await lignes<{ r: { error: string } }>("select public.lire_vingt_et_un() as r"))[0]!.r).toMatchObject({ ok: false, error: "not_signed_in" });
  });

  it("tient le plafond de 2 000 statères misés par jour de Paris, tous jeux confondus", async () => {
    const uid = await joueur(100_000);
    // une mise d'hier soir, à l'heure de Paris, ne compte pas
    await db.query(
      "insert into internal.stateres_mouvements (user_id, nature, montant, ref, cree_le) values ($1, 'casino_mise', -200, 'casino/0', date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris' - interval '1 second')",
      [uid],
    );
    expect(await comme(uid, "select public.get_casino() as r")).toMatchObject({ mise_du_jour: 0, reste_du_jour: 2000 });
    for (let i = 0; i < 9; i++) expect(await comme(uid, "select public.jouer_roue('{\"rouge\":100,\"bleu\":100}'::jsonb) as r")).toMatchObject({ ok: true, mise_du_jour: 200 * (i + 1) });
    expect(await comme(uid, "select public.jouer_machine(190) as r")).toMatchObject({ ok: true, mise_du_jour: 1990, reste_du_jour: 10 });
    expect(await comme(uid, "select public.jouer_des('{\"s7\":20}'::jsonb) as r")).toMatchObject({ ok: false, error: "casino_plafond" });
    expect(await comme(uid, "select public.jouer_palissade(10) as r")).toMatchObject({ ok: true, mise_du_jour: 2000, reste_du_jour: 0 });
    expect(await comme(uid, "select public.distribuer_vingt_et_un(10) as r")).toMatchObject({ ok: false, error: "casino_plafond" });
    expect(await comme(uid, "select public.get_casino() as r")).toMatchObject({ mise_du_jour: 2000, reste_du_jour: 0 });
    expect(await lignes("select 1 from internal.casino_parties where user_id = $1", [uid])).toHaveLength(11);
  });

  it("refuse plus de 30 actions en une minute", async () => {
    const uid = await joueur(1000);
    await db.query("delete from public.action_limits where true");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
    try {
      const reponses: { ok: boolean; error?: string }[] = [];
      for (let i = 0; i < 31; i++) reponses.push((await db.query<{ r: { ok: boolean; error?: string } }>("select public.jouer_roue('{\"pair\":10}'::jsonb) as r")).rows[0]!.r);
      expect(reponses.slice(0, 30).every((r) => r.ok)).toBe(true);
      expect(reponses[30]).toMatchObject({ ok: false, error: "rate_limited" });
    } finally {
      await db.query("select set_config('request.jwt.claim.sub', '', false)");
    }
  });

  it("se ferme par son interrupteur, sans jamais perdre une main ouverte", async () => {
    const uid = await joueur(1000);
    await viderLeHasard();
    await pousser([4, 5, 6, 22]);
    const d = await comme<ReponseDuVingtEtUn>(uid, "select public.distribuer_vingt_et_un(50) as r");
    expect(d.table.phase).toBe("joueur");
    await db.query("update internal.casino_ouvert set ouvert = false, maj_le = now() where id");
    try {
      expect(await comme(uid, "select public.get_casino() as r")).toMatchObject({ ouvert: false, main: { partie: d.table.partie } });
      expect(await comme(uid, "select public.jouer_roue('{\"rouge\":10}'::jsonb) as r")).toMatchObject({ ok: false, error: "casino_ferme" });
      expect(await comme(uid, "select public.distribuer_vingt_et_un(10) as r")).toMatchObject({ ok: false, error: "casino_ferme" });
      const fin = await comme<ReponseDuVingtEtUn>(uid, "select public.jouer_vingt_et_un($1, 0, 'rester') as r", [d.table.partie]);
      expect(fin.table.phase).toBe("fini");
    } finally {
      await db.query("update internal.casino_ouvert set ouvert = true, maj_le = now() where id");
    }
  });
});

/* ---------- Le vingt-et-un des membres ---------- */

describe("le vingt-et-un des membres", () => {
  it("joue une main entière comme le TypeScript : séparer, doubler, le tavernier, le journal", async () => {
    const uid = await joueur(2000);
    await viderLeHasard();
    // une paire de 8 contre un 6, carte cachée un 10
    const donne = [7, 5, 20, 9];
    await pousser(donne);
    const d = await comme<ReponseDuVingtEtUn>(uid, "select public.distribuer_vingt_et_un(100) as r");
    const ts = distribuer(100, sourceDe(donne).tire);
    expect(d.table).toMatchObject({ mise: 100, misee: 100, tour: 0, phase: "joueur", cachee: true, complement: 100, permis: { separer: true, doubler: true } });
    expect(d.table.faits).toEqual(faitsMontres(ts.faits));
    expect(d.table.tavernier).toEqual([carteDuNombre(5)]);
    expect(d).toMatchObject({ solde_apres: 1900, mise_du_jour: 100 });
    // séparer : la première main reçoit un 3
    const p1 = [2, ...Array.from({ length: 23 }, () => 0)];
    await pousser(p1);
    const s = await comme<ReponseDuVingtEtUn>(uid, "select public.jouer_vingt_et_un($1, 0, 'separer') as r", [d.table.partie]);
    expect(s.table.faits).toEqual(jouerUnCoup(ts.etat, "separer", sourceDe(p1).tire));
    expect(s.table).toMatchObject({ tour: 1, misee: 200, separee: true, courante: 0 });
    expect(s).toMatchObject({ solde_apres: 1800, mise_du_jour: 200 });
    // doubler la première (un 10 : 21), puis la seconde reçoit un 9 et reste
    const p2 = [9, 8, ...Array.from({ length: 22 }, () => 0)];
    await pousser(p2);
    const dbl = await comme<ReponseDuVingtEtUn>(uid, "select public.jouer_vingt_et_un($1, 1, 'doubler') as r", [d.table.partie]);
    expect(dbl.table.faits).toEqual(jouerUnCoup(ts.etat, "doubler", sourceDe(p2).tire));
    expect(dbl.table).toMatchObject({ courante: 1, misee: 300, phase: "joueur" });
    // rester : le tavernier (6 et 10) tire un 5 et fait 21
    const p3 = [4, ...Array.from({ length: 23 }, () => 0)];
    await pousser(p3);
    const fin = await comme<ReponseDuVingtEtUn>(uid, "select public.jouer_vingt_et_un($1, 2, 'rester') as r", [d.table.partie]);
    expect(fin.table.faits).toEqual(jouerUnCoup(ts.etat, "rester", sourceDe(p3).tire));
    expect(ts.etat.mains.map((m) => m.issue)).toEqual(["egal", "perdu"]);
    expect(fin.table).toMatchObject({ phase: "fini", cachee: false, rendu: 200, misee: 300, permis: { tirer: false, rester: false, doubler: false, separer: false } });
    expect(fin.table.tavernier).toEqual([5, 9, 4].map(carteDuNombre));
    expect(fin).toMatchObject({ solde_apres: 2000 - 300 + 200 });
    expect((await journal(uid)).map((l) => [l.nature, l.montant])).toEqual([["casino_mise", -100], ["casino_mise", -100], ["casino_mise", -100], ["casino_gain", 200]]);
    expect(await comme(uid, "select public.lire_vingt_et_un() as r")).toEqual({ ok: true, table: null });
    const e = await comme<EtatDuCasino>(uid, "select public.get_casino() as r");
    expect(e.parties[0]).toMatchObject({ jeu: "vingt-et-un", mise: 300, rendu: 200, resume: { jeu: "vingt-et-un", issues: ["egal", "perdu"] } });
  });

  it("ne montre jamais la carte cachée avant la fin, et reprend une main laissée ouverte", async () => {
    const uid = await joueur(1000);
    await viderLeHasard();
    // joueur 5 et 7 ; tavernier 6, carte cachée le roi de chênes (51)
    await pousser([4, 5, 6, 51]);
    const d = await comme<ReponseDuVingtEtUn>(uid, "select public.distribuer_vingt_et_un(20) as r");
    // la carte cachée, dans les deux ordres où ses clés pourraient s'écrire
    const cachees = [json({ e: 3, r: 12 }), json({ r: 12, e: 3 })];
    const lu = await comme<{ table: ReponseDuVingtEtUn["table"] }>(uid, "select public.lire_vingt_et_un() as r");
    const ecran = await comme<EtatDuCasino>(uid, "select public.get_casino() as r");
    for (const vu of [d, lu, ecran]) for (const c of cachees) expect(json(vu)).not.toContain(c);
    expect(json(d)).toContain(json({ e: 0, r: 5 }));
    expect(lu.table).toEqual(ecran.main);
    expect(lu.table.faits).toHaveLength(4);
    expect(lu.table.faits[3]).toEqual({ t: "carte", a: "tavernier", carte: null, cachee: true });
    // une autre main ne commence pas tant que celle-ci attend
    expect(await comme(uid, "select public.distribuer_vingt_et_un(10) as r")).toMatchObject({ ok: false, error: "main_en_cours" });
    // un double clic : le second coup arrive au même tour
    await pousser([0, ...Array.from({ length: 23 }, () => 0)]);
    expect(await comme(uid, "select public.jouer_vingt_et_un($1, 0, 'tirer') as r", [d.table.partie])).toMatchObject({ ok: true, table: { tour: 1 } });
    expect(await comme(uid, "select public.jouer_vingt_et_un($1, 0, 'tirer') as r", [d.table.partie])).toMatchObject({ ok: false, error: "main_changee" });
    // un coup non permis (trois cartes : ni doubler ni séparer), une main d'un autre compte, une main finie
    expect(await comme(uid, "select public.jouer_vingt_et_un($1, 1, 'doubler') as r", [d.table.partie])).toMatchObject({ ok: false, error: "coup_refuse" });
    expect(await comme(uid, "select public.jouer_vingt_et_un($1, 1, null) as r", [d.table.partie])).toMatchObject({ ok: false, error: "coup_refuse" });
    const autre = await joueur(1000);
    expect(await comme(autre, "select public.jouer_vingt_et_un($1, 1, 'rester') as r", [d.table.partie])).toMatchObject({ ok: false, error: "pas_de_main" });
    expect(await comme(autre, "select public.get_casino() as r")).toMatchObject({ main: null, parties: [] });
    const fin = await comme<ReponseDuVingtEtUn>(uid, "select public.jouer_vingt_et_un($1, 1, 'rester') as r", [d.table.partie]);
    expect(fin.table.faits.find((f) => f.t === "retourne")).toEqual({ t: "retourne", carte: carteDuNombre(51) });
    expect(await comme(uid, "select public.jouer_vingt_et_un($1, 2, 'rester') as r", [d.table.partie])).toMatchObject({ ok: false, error: "pas_de_main" });
  });

  it("paie 3 pour 2 un 21 d'entrée, et finit la main à la donne", async () => {
    const uid = await joueur(1000);
    await viderLeHasard();
    await pousser([0, 8, 12, 4]);
    const d = await comme<ReponseDuVingtEtUn>(uid, "select public.distribuer_vingt_et_un(100) as r");
    expect(d.table).toMatchObject({ phase: "fini", rendu: 250, mains: [{ issue: "vingt-et-un", recu: 250 }] });
    expect(d).toMatchObject({ solde_apres: 1150 });
    expect(await comme(uid, "select public.lire_vingt_et_un() as r")).toEqual({ ok: true, table: null });
  });

  it("prend les compléments sous le plafond du jour et dans la bourse", async () => {
    const riche = await joueur(100_000);
    for (let i = 0; i < 9; i++) await comme(riche, "select public.jouer_roue('{\"rouge\":100,\"bleu\":100}'::jsonb) as r");
    await viderLeHasard();
    await pousser([7, 5, 20, 9]);
    const d = await comme<ReponseDuVingtEtUn>(riche, "select public.distribuer_vingt_et_un(100) as r");
    expect(d).toMatchObject({ mise_du_jour: 1900, reste_du_jour: 100 });
    await pousser([2, ...Array.from({ length: 23 }, () => 0)]);
    expect(await comme(riche, "select public.jouer_vingt_et_un($1, 0, 'separer') as r", [d.table.partie])).toMatchObject({ ok: true, mise_du_jour: 2000 });
    expect(await comme(riche, "select public.jouer_vingt_et_un($1, 1, 'doubler') as r", [d.table.partie])).toMatchObject({ ok: false, error: "casino_plafond" });
    expect(await comme(riche, "select public.lire_vingt_et_un() as r")).toMatchObject({ table: { tour: 1, misee: 200 } });

    const juste = await joueur(100);
    await pousser([7, 5, 20, 9]);
    const j = await comme<ReponseDuVingtEtUn>(juste, "select public.distribuer_vingt_et_un(100) as r");
    expect(j).toMatchObject({ solde_apres: 0 });
    expect(await comme(juste, "select public.jouer_vingt_et_un($1, 0, 'doubler') as r", [j.table.partie])).toMatchObject({ ok: false, error: "solde_insuffisant" });
    expect(await comme(juste, "select public.jouer_vingt_et_un($1, 0, 'separer') as r", [j.table.partie])).toMatchObject({ ok: false, error: "solde_insuffisant" });
    await viderLeHasard();
    expect(await comme(juste, "select public.jouer_vingt_et_un($1, 0, 'rester') as r", [j.table.partie])).toMatchObject({ ok: true, table: { phase: "fini", misee: 100 } });
  });

  it("garde au plus 10 parties à montrer, et une seule main ouverte par compte", async () => {
    const uid = await joueur(5000);
    for (let i = 0; i < 12; i++) await comme(uid, "select public.jouer_machine(10) as r");
    const e = await comme<EtatDuCasino>(uid, "select public.get_casino() as r");
    expect(e.parties).toHaveLength(10);
    expect(e.parties.map((p) => p.partie)).toEqual([...e.parties.map((p) => p.partie)].sort((a, b) => b - a));
    expect(await lignes("select 1 from pg_indexes where indexname = 'casino_une_main_ouverte'")).toHaveLength(1);
  });
});

/* ---------- Le mode GOD ---------- */

describe("le mode GOD", () => {
  it("joue sans mise ni gain : rien au journal, rien au plafond", async () => {
    const uid = await joueur(500);
    await db.query("insert into internal.village_god_titulaire (discord_id) values ($1)", [await discordDe(db, uid)]);
    expect(await comme(uid, "select public.activer_village_god() as r")).toMatchObject({ ok: true, actif: true });
    const avant = await solde(uid);
    await viderLeHasard();
    await pousser([2]);
    expect(await comme(uid, "select public.jouer_roue('{\"n3\":200}'::jsonb) as r")).toMatchObject({ ok: true, god: true, mise: 200, rendu: 7200, solde_apres: avant, mise_du_jour: 0, reste_du_jour: 2000 });
    for (let i = 0; i < 12; i++) expect(await comme(uid, "select public.jouer_palissade(200) as r")).toMatchObject({ ok: true, god: true });
    await pousser([7, 5, 20, 9, 2, ...Array.from({ length: 23 }, () => 0)]);
    const d = await comme<ReponseDuVingtEtUn>(uid, "select public.distribuer_vingt_et_un(200) as r");
    expect(d.table.god).toBe(true);
    expect(await comme(uid, "select public.jouer_vingt_et_un($1, 0, 'separer') as r", [d.table.partie])).toMatchObject({ ok: true, table: { misee: 400 } });
    await viderLeHasard();
    expect(await comme(uid, "select public.jouer_vingt_et_un($1, 1, 'rester') as r", [d.table.partie])).toMatchObject({ ok: true });
    expect(await comme(uid, "select public.jouer_vingt_et_un($1, 2, 'rester') as r", [d.table.partie])).toMatchObject({ ok: true, table: { phase: "fini" } });
    expect(await solde(uid)).toBe(avant);
    expect(await lignes("select 1 from internal.stateres_mouvements where user_id = $1 and nature ~ 'casino'", [uid])).toEqual([]);
    expect(await comme(uid, "select public.get_casino() as r")).toMatchObject({ god: true, mise_du_jour: 0 });
    expect(await comme(uid, "select public.desactiver_village_god() as r")).toMatchObject({ ok: true, actif: false });
    expect(await solde(uid)).toBe(500);
  });

  it("laisse une vraie main attendre la fin de l'essai, et son gain reste vrai", async () => {
    const uid = await joueur(1000);
    await db.query("insert into internal.village_god_titulaire (discord_id) values ($1)", [await discordDe(db, uid)]);
    await viderLeHasard();
    // joueur 10 et 9 (19) ; tavernier 6, carte cachée un 10 : il tire un 8 et saute
    await pousser([9, 5, 8, 9]);
    const d = await comme<ReponseDuVingtEtUn>(uid, "select public.distribuer_vingt_et_un(100) as r");
    expect(d.table.god).toBe(false);
    await comme(uid, "select public.activer_village_god() as r");
    expect(await comme(uid, "select public.jouer_vingt_et_un($1, 0, 'rester') as r", [d.table.partie])).toMatchObject({ ok: false, error: "mode_god" });
    expect(await comme(uid, "select public.distribuer_vingt_et_un(10) as r")).toMatchObject({ ok: false, error: "main_en_cours" });
    await comme(uid, "select public.desactiver_village_god() as r");
    await pousser([7, ...Array.from({ length: 23 }, () => 0)]);
    expect(await comme(uid, "select public.jouer_vingt_et_un($1, 0, 'rester') as r", [d.table.partie])).toMatchObject({ ok: true, table: { phase: "fini", rendu: 200 } });
    expect((await journal(uid)).map((l) => [l.nature, l.montant])).toEqual([["casino_mise", -100], ["casino_gain", 200]]);
    expect(await solde(uid)).toBe(1100);
  });
});

/* ---------- Les droits ---------- */

describe("les droits du casino", () => {
  const PUBLIQUES = [
    "public.get_casino()", "public.lire_vingt_et_un()", "public.jouer_roue(jsonb)", "public.jouer_machine(integer)", "public.jouer_course(integer, integer)",
    "public.jouer_palissade(integer)", "public.jouer_des(jsonb)", "public.distribuer_vingt_et_un(integer)", "public.jouer_vingt_et_un(bigint, integer, text)",
  ];

  it("n'ouvrent les neuf fonctions qu'aux comptes connectés, et rien d'interne ni aucune table", async () => {
    for (const f of PUBLIQUES) {
      expect(await une(`select has_function_privilege('authenticated', '${f}', 'execute') as r`), f).toBe(true);
      expect(await une(`select has_function_privilege('anon', '${f}', 'execute') as r`), f).toBe(false);
    }
    const internes = await lignes<{ f: string }>("select p.oid::regprocedure::text as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'internal' and p.proname like 'casino\\_%' and p.proname <> 'casino_entier'");
    expect(internes.length).toBeGreaterThan(40);
    for (const { f } of internes) {
      expect(await une(`select has_function_privilege('authenticated', '${f}', 'execute') as r`), f).toBe(false);
      expect(await une(`select has_function_privilege('anon', '${f}', 'execute') as r`), f).toBe(false);
    }
    for (const t of ["internal.casino_ouvert", "internal.casino_parties", "internal.casino_mains"]) {
      expect(await une(`select has_table_privilege('authenticated', '${t}', 'select') as r`), t).toBe(false);
      expect(await une(`select has_table_privilege('anon', '${t}', 'select') as r`), t).toBe(false);
    }
  });

  it("ont chaque refus de la migration écrit en mots, et ce sont ceux du contrat", () => {
    const sql = texteDeMigration(MIGRATION);
    const codes = new Set([...sql.matchAll(/internal\.(?:fail|error_json)\('([a-z_]+)'/g)].map((m) => m[1]!));
    for (const code of codes) expect(ERROR_MESSAGES, code).toHaveProperty(code);
    // les refus du serveur, plus ceux des fonctions du village qu'il appelle (compte, bourse, mode GOD)
    expect([...codes, "not_validated", "no_gaulois", "solde_insuffisant"].every((c) => (REFUS_DU_CASINO as readonly string[]).includes(c))).toBe(true);
    expect(REFUS_DU_CASINO.every((c) => codes.has(c) || ["not_validated", "no_gaulois", "solde_insuffisant"].includes(c))).toBe(true);
  });

  it("ne remplacent aucune fonction existante", () => {
    const sql = texteDeMigration(MIGRATION);
    const remplacees = [...sql.matchAll(/create or replace function ([a-z_]+\.[a-z0-9_]+)\(/g)].map((m) => m[1]!);
    expect(remplacees.length).toBeGreaterThan(40);
    expect(remplacees.filter((f) => !/^(internal\.casino_|public\.(get_casino|lire_vingt_et_un|jouer_(roue|machine|course|palissade|des|vingt_et_un)|distribuer_vingt_et_un)$)/.test(f))).toEqual([]);
    const autres = migrations().filter((m) => m !== MIGRATION).map(texteDeMigration).join("\n");
    for (const f of new Set(remplacees)) expect(autres.includes(`function ${f}(`), f).toBe(false);
  });
});

/* ---------- Le fichier que colle le pilote ---------- */

describe("le fichier à coller", () => {
  it("s'installe après toutes les autres migrations, se recolle sans rien changer, et le dit", { timeout: LONG }, async () => {
    const base = await baseDeTest({ sauf: [MIGRATION] });
    const controle = async (): Promise<string> => {
      const r = await base.exec(texteAColler());
      return (r.at(-1)!.rows[0] as { controle: string }).controle;
    };
    expect(await controle()).toBe(ATTENDU);
    expect(await controle()).toBe(ATTENDU);
    expect((await base.query<{ n: number }>("select count(*)::int as n from internal.casino_parties")).rows[0]!.n).toBe(0);
    await base.close();
  });

  it("s'arrête sans rien changer quand le village n'est pas installé", { timeout: LONG }, async () => {
    const vide = await baseDeTest({ sauf: migrations().filter((m) => m >= "20261113001700") });
    await expect(vide.exec(texteAColler())).rejects.toThrow(/pas installés/);
    await vide.exec("rollback");
    expect((await vide.query<{ t: string | null }>("select to_regclass('internal.casino_parties')::text as t")).rows[0]!.t).toBeNull();
    await vide.close();
  });
});
