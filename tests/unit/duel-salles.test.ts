/**
 * Les salles en direct du duel (migration 20261122001000_duel_salles_en_direct), sur le banc PGlite de toutes les
 * migrations du dépôt :
 * - l'essai du titulaire tant que le duel est fermé : la machine en face, sans mise, joue comme le moteur ;
 * - deux faux membres qui jouent un match entier, chaque manche rejouée par le moteur partagé, la carte d'en face cachée ;
 * - le temps (celui qui ne pose pas perd), l'égalité (chacun reprend sa mise), le départ ;
 * - les garde-fous : trois matchs par jour contre un même adversaire, dix par jour, le solde, le mode GOD, les attentes
 *   sans nouvelles ;
 * - la somme des soldes, des mises en jeu et des cagnottes, qui ne bouge jamais ;
 * - la file des victoires, les droits, la sauvegarde, et le fichier que colle le pilote.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ATTENDU, NOM, texteAColler } from "../../scripts/a-coller-duel-salles";
import {
  CATALOGUE_DU_DUEL, EMPLACEMENTS_DU_DUEL, NIVEAUX, P, atoutsEnEntiers, camp, campEnEntiers, carte, cartesDeLaMain, choisir, graineSuivante, libres,
  mainEnEntiers, manche, tirageDeLaGraine, verdict,
} from "../../supabase/functions/code-discord/duel/index";
import type { Camp, IdDeCompagnon, IdDeLieu, MainParEmplacement, OptionsDuCamp } from "../../supabase/functions/code-discord/duel/index";
import { hasardDEssai } from "../../src/lib/village/essai-duel";
import { SALLES_DU_DUEL, gainDuGagnant, partDeLaCagnotte } from "../../src/lib/village/contrat-salles";
import { baseDeTest, commeMembre, discordDe, migrations, nouveauMembre } from "./banc-pglite";

const LONG = 300_000;
let db: PGlite;

const lignes = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => (await db.query<T>(sql, params)).rows;
const une = async <T>(sql: string, params: unknown[] = []): Promise<T> => (await lignes<{ r: T }>(sql, params))[0]!.r;

beforeAll(async () => {
  db = await baseDeTest();
}, LONG);
afterAll(async () => {
  await db?.close();
});

const alea = hasardDEssai(20261122);
const pris = <T>(l: readonly T[]): T => l[Math.floor(alea() * l.length)]!;

const BASE: MainParEmplacement = { arme: "gourdin", tete: "bonnet", haut: "tunique", pieds: "bottes", bas: "braies" };
const FORTE: MainParEmplacement = { arme: "epee", tete: "casque", haut: "cotte-mailles", pieds: "sandales", bas: "braies" };

interface MatchVu {
  match: number;
  mise: number;
  essai: boolean;
  moi: "a" | "b";
  adversaire: { nom: string } | null;
  banniere: string | null;
  mains: { a: MainParEmplacement; b: MainParEmplacement };
  options: { a: OptionsDuCamp; b: OptionsDuCamp };
  coups: [number, number][];
  manche: number;
  vies: { a: number; b: number };
  pose: number | null;
  adverse_pose: boolean;
  ouverte_le: string;
  limite: string;
  fini: boolean;
  verdict: -1 | 0 | 1 | null;
  fin: "combat" | "temps" | "quitte" | null;
  gain: number | null;
  cagnotte: number | null;
}
interface Etat {
  ok: true;
  ouvert: boolean;
  salles: { mise: number; attente: boolean; permise: boolean }[];
  attente: { mise: number } | null;
  match: MatchVu | null;
  dernier: MatchVu | null;
  jour: { joues: number; au_plus: number };
  cagnotte: { saison: string; montant: number };
  regles: Record<string, number>;
}
type Reponse = Etat | { ok: false; error: string };

/** Un appel comme le membre `uid`, ses compteurs d'appels remis à zéro. */
async function appel<T = Reponse>(uid: string, sql: string, params: unknown[] = []): Promise<T> {
  await db.query("delete from internal.duel_salle_appels where true");
  return commeMembre<T>(db, uid, `select ${sql} as r`, params);
}
const etat = async (uid: string): Promise<Etat> => {
  const r = await appel(uid, "public.get_salles_duel()");
  if (!r.ok) throw new Error(r.error);
  return r;
};
const entrer = (uid: string, mise: number, main: MainParEmplacement = BASE): Promise<Reponse> => appel(uid, "public.entrer_salle_duel($1, $2::jsonb)", [mise, JSON.stringify(main)]);
const poser = (uid: string, m: MatchVu, carte: number): Promise<Reponse> => appel(uid, "public.poser_carte_salle($1, $2, $3)", [m.match, m.manche, carte]);
const ok = (r: Reponse): Etat => {
  if (!r.ok) throw new Error(r.error);
  return r;
};

async function donner(uid: string, ids: string[]): Promise<void> {
  for (const id of ids) {
    await db.query("insert into internal.gaulois_inventaire (user_id, emplacement, objet, quantite, origine) values ($1, $2, $3, 1, 'achat') on conflict do nothing", [uid, CATALOGUE_DU_DUEL[id]!.e, id]);
  }
}
const crediter = (uid: string, n: number) => db.query("insert into internal.stateres_mouvements (user_id, nature, montant, ref) values ($1, 'don', $2, 'essai')", [uid, n]);
const solde = (uid: string): Promise<number> => une<number>("select coalesce((select solde from internal.stateres_soldes where user_id = $1), 0)::int as r", [uid]);

/** Tous les statères : les soldes, les mises des matchs en cours, et les cagnottes. Ne bouge jamais. */
const somme = (): Promise<number> =>
  une<number>(`select ((select coalesce(sum(solde), 0) from internal.stateres_soldes)
    + (select coalesce(sum(2 * mise), 0) from internal.duel_matchs where not fini and not essai)
    + (select coalesce(sum(montant), 0) from internal.duel_cagnottes))::int as r`);

/** Le temps passe : la manche du match est échue (ou la machine a posé, ou l'attente a vieilli). */
const echoir = (id: number) => db.query("update internal.duel_matchs set ouverte_le = now() - interval '40 seconds', limite = now() - interval '1 second' where id = $1", [id]);

/** Le camp de départ de chaque côté, tel que le moteur le pose. */
const departs = (m: MatchVu): { a: Camp; b: Camp } => ({ a: camp(cartesDeLaMain(m.mains.a), m.options.a), b: camp(cartesDeLaMain(m.mains.b), m.options.b) });

/** Les manches d'un match, rejouées par le moteur depuis ses coups ; rend les deux camps. */
function rejouer(m: MatchVu): { a: Camp; b: Camp; fini: boolean } {
  let { a, b } = departs(m);
  let fini = false;
  m.coups.forEach(([ia, ib], k) => {
    const r = manche(a, b, ia, ib, k + 1);
    a = r.a;
    b = r.b;
    fini = r.fini;
  });
  return { a, b, fini };
}

/* ---------- Le moteur, dans les deux sens ---------- */

describe("le moteur du duel pour deux vrais joueurs", () => {
  it("rend la même manche quand on échange les deux camps : chaque joueur se voit à gauche sans se tromper", { timeout: LONG }, async () => {
    const PAR = Object.fromEntries(EMPLACEMENTS_DU_DUEL.map((e) => [e, Object.keys(CATALOGUE_DU_DUEL).filter((id) => CATALOGUE_DU_DUEL[id]!.e === e)]));
    const LIEUX: readonly (IdDeLieu | null)[] = [null, "front", "mers", "cartes", "saisons", "legendes", "tresors"];
    const COMPAGNONS: readonly (IdDeCompagnon | null)[] = [null, "Ferme", "Forêt", "Ciel et eaux", "Légendes", "Drôles"];
    const main = () => {
      for (;;) {
        const m = EMPLACEMENTS_DU_DUEL.map((e) => carte(pris(PAR[e]!)));
        if (m.reduce((s, c) => s + c.c, 0) <= P.BOURSE) return m;
      }
    };
    const cas: Record<string, unknown>[] = [];
    let n = 0;
    for (let d = 0; d < 1500; d++) {
      const lieu = pris(LIEUX);
      let a = camp(main(), { lieu, compagnon: pris(COMPAGNONS) }), b = camp(main(), { lieu, compagnon: pris(COMPAGNONS) });
      for (let m = 1; m <= 40; m++) {
        const ia = pris(libres(a)), ib = pris(libres(b));
        const r = manche(a, b, ia, ib, m), s = manche(b, a, ib, ia, m);
        n++;
        expect(campEnEntiers(s.a)).toEqual(campEnEntiers(r.b));
        expect(campEnEntiers(s.b)).toEqual(campEnEntiers(r.a));
        expect(verdict(s.a, s.b) + verdict(r.a, r.b)).toBe(0);
        if (d % 10 === 0) cas.push({ a: campEnEntiers(a), b: campEnEntiers(b), ca: mainEnEntiers(a.main), cb: mainEnEntiers(b.main), ta: atoutsEnEntiers(a.at), tb: atoutsEnEntiers(b.at), ia, ib, m });
        a = r.a;
        b = r.b;
        if (r.fini) break;
      }
    }
    expect(n).toBeGreaterThan(10_000);
    // et le serveur aussi : la manche du SQL, les camps échangés, rend les mêmes camps échangés
    await db.exec(`create or replace function public.t_ents(j jsonb) returns integer[] language sql immutable as $$
      select coalesce(array_agg(v::integer order by n), '{}') from jsonb_array_elements_text(j) with ordinality t(v, n) $$;`);
    const differents = await une<number>(
      `select count(*)::int as r from (
         select internal.duel_manche(t_ents(c->'a'), t_ents(c->'b'), t_ents(c->'ca'), t_ents(c->'cb'), t_ents(c->'ta'), t_ents(c->'tb'), (c->>'ia')::int, (c->>'ib')::int, (c->>'m')::int) as r,
                internal.duel_manche(t_ents(c->'b'), t_ents(c->'a'), t_ents(c->'cb'), t_ents(c->'ca'), t_ents(c->'tb'), t_ents(c->'ta'), (c->>'ib')::int, (c->>'ia')::int, (c->>'m')::int) as s
         from jsonb_array_elements($1::jsonb) c) x
       where x.r[2:1 + x.r[1]] is distinct from x.s[2 + x.s[1]:cardinality(x.s)] or x.r[2 + x.r[1]:cardinality(x.r)] is distinct from x.s[2:1 + x.s[1]]`,
      [JSON.stringify(cas)],
    );
    expect(cas.length).toBeGreaterThan(500);
    expect(differents).toBe(0);
  });

  it("donnent au contrat de l'écran les mêmes chiffres que le serveur", async () => {
    const c = await import("../../src/lib/village/contrat-salles");
    const sql = await une<Record<string, number>>(`select jsonb_build_object('secondes', internal.duel_salle_secondes(), 'revelation', internal.duel_salle_revelation(),
      'presence', internal.duel_salle_presence(), 'part', internal.duel_salle_part_cagnotte(), 'par_jour', internal.duel_salle_par_jour(),
      'meme', internal.duel_salle_meme_adversaire()) as r`);
    expect(sql).toEqual({ secondes: c.SECONDES_PAR_MANCHE, revelation: c.SECONDES_DE_REVELATION, presence: c.SECONDES_SANS_NOUVELLES, part: c.PART_DE_LA_CAGNOTTE, par_jour: c.MATCHS_PAR_JOUR, meme: c.MATCHS_CONTRE_UN_MEME });
  });

  it("partage le pot comme le contrat de l'écran : 10 % à la cagnotte, le reste au gagnant", async () => {
    expect(await une<number[]>("select internal.duel_salles_mises() as r")).toEqual([...SALLES_DU_DUEL]);
    for (const mise of SALLES_DU_DUEL) {
      expect(partDeLaCagnotte(mise) + gainDuGagnant(mise)).toBe(2 * mise);
      expect(partDeLaCagnotte(mise)).toBe(await une<number>("select (2 * $1::int * internal.duel_salle_part_cagnotte() / 100) as r", [mise]));
    }
    expect(SALLES_DU_DUEL.map(gainDuGagnant)).toEqual([45, 90, 180, 450, 900, 1800]);
  });
});

/* ---------- L'essai du titulaire ---------- */

describe("les salles, tant que le duel est fermé", () => {
  let titulaire: string, membre: string;

  beforeAll(async () => {
    titulaire = await nouveauMembre(db);
    membre = await nouveauMembre(db);
    await db.query("insert into internal.stateres_don_titulaire (discord_id) values ($1)", [await discordDe(db, titulaire)]);
  }, LONG);

  it("restent fermées à tout autre membre", async () => {
    expect(await appel(membre, "public.get_salles_duel()")).toMatchObject({ ok: false, error: "duel_ferme" });
    expect(await entrer(membre, 100)).toMatchObject({ ok: false, error: "duel_ferme" });
    expect(await appel(membre, "public.quitter_salle_duel()")).toMatchObject({ ok: false, error: "duel_ferme" });
  });

  it("montrent les six salles au titulaire, sans solde, toutes ouvertes à l'essai", async () => {
    const e = await etat(titulaire);
    expect(e).toMatchObject({ ok: true, ouvert: false, attente: null, match: null, dernier: null, regles: { secondes: 30, part_cagnotte: 10, par_jour: 10, meme_adversaire: 3 } });
    expect(e.salles).toEqual(SALLES_DU_DUEL.map((mise) => ({ mise, attente: false, permise: true })));
    // le solde de l'appelant seul, pour la bourse de la barre du jeu ; aucun autre
    expect(e).toMatchObject({ solde: 0 });
    expect(JSON.stringify(e.salles)).not.toMatch(/solde/);
  });

  it("asseyent la machine en face au bout de 5 secondes, qui joue comme le moteur, sans rien miser ni annoncer", { timeout: LONG }, async () => {
    const journal = await une<number>("select count(*)::int as r from internal.stateres_mouvements");
    expect(ok(await entrer(titulaire, 1000)).attente).toMatchObject({ mise: 1000 });
    expect((await etat(titulaire)).match).toBeNull();
    await db.query("update internal.duel_salle_attentes set entre_le = now() - interval '6 seconds'");
    let m = (await etat(titulaire)).match!;
    expect(m).toMatchObject({ essai: true, mise: 1000, moi: "a", adversaire: null, manche: 1, coups: [], pose: null, adverse_pose: false, fini: false });
    expect(m.mains.b).toEqual(m.mains.a); // sans main de défense, la machine joue la même main que lui
    expect(await une<number>("select count(*)::int as r from internal.duel_salle_attentes")).toBe(0);
    const g = NIVEAUX.guerrier;
    while (!m.fini) {
      const rejeu = rejouer(m);
      const graine = Number(await une<string>("select graine::text as r from internal.duel_matchs where id = $1", [m.match]));
      const attendue = choisir(rejeu.b, rejeu.a, m.manche, () => tirageDeLaGraine(graineSuivante(graine)), g.fantaisie, g.loin);
      // la machine pose à son heure, sans voir la carte du joueur
      await db.query("update internal.duel_matchs set machine_le = now() - interval '1 second' where id = $1", [m.match]);
      const vu = (await etat(titulaire)).match!;
      expect(vu).toMatchObject({ adverse_pose: true, pose: null, manche: m.manche });
      const ia = pris(libres(rejeu.a));
      const r = ok(await poser(titulaire, vu, ia));
      const apres = r.match ?? r.dernier!;
      expect(apres.coups.at(-1)).toEqual([ia, attendue]);
      const rejoue = rejouer(apres);
      expect(apres.vies).toEqual({ a: rejoue.a.vie, b: rejoue.b.vie });
      if (apres.fini) {
        expect(rejoue.fini || apres.coups.length >= 40).toBe(true);
        expect(apres).toMatchObject({ fin: "combat", verdict: verdict(rejoue.a, rejoue.b), gain: null, cagnotte: null });
      }
      m = apres;
    }
    expect(await une<number>("select count(*)::int as r from internal.stateres_mouvements")).toBe(journal);
    expect(await une<number>("select count(*)::int as r from internal.duel_salle_annonces")).toBe(0);
    expect((await etat(titulaire)).dernier).toMatchObject({ match: m.match, fini: true });
  });

  it("perdent le match de celui qui ne pose pas à temps, même dans un essai", async () => {
    ok(await entrer(titulaire, 25));
    await db.query("update internal.duel_salle_attentes set entre_le = now() - interval '6 seconds'");
    const m = (await etat(titulaire)).match!;
    await db.query("update internal.duel_matchs set machine_le = now() - interval '1 second' where id = $1", [m.match]);
    await etat(titulaire);
    await echoir(m.match);
    const e = await etat(titulaire);
    expect(e.match).toBeNull();
    expect(e.dernier).toMatchObject({ match: m.match, fini: true, fin: "temps", verdict: -1 });
  });

});

/* ---------- Deux vrais joueurs ---------- */

describe("les salles en direct, avec mise", () => {
  let a: string, b: string, c: string, d: string, e: string;
  let depart: number;
  // les statères entrés ou sortis par d'autres chemins que les salles (une dépense, un essai du journal)
  let ailleurs = 0;

  beforeAll(async () => {
    await db.query("update internal.duel_ouvert set ouvert = true, maj_le = now() where id");
    [a, b, c, d, e] = [await nouveauMembre(db), await nouveauMembre(db), await nouveauMembre(db), await nouveauMembre(db), await nouveauMembre(db)];
    for (const u of [a, b, c]) {
      await donner(u, ["epee", "casque", "cotte-mailles", "sandales"]);
      await crediter(u, 5000);
    }
    await crediter(d, 30);
    await crediter(e, 1000);
    // une saison du pass ouverte aujourd'hui, si celle du dépôt est finie : sa cagnotte reçoit les parts
    await db.query(`insert into internal.sentier_saisons (saison, nom, debut, fin, paliers, pas_par_palier)
      select 'essai-salles', 'Essai des salles', current_date - 1, current_date + 1, 30, 30 where internal.sentier_saison_du(internal.duel_jour(now())) is null`);
    depart = await somme();
  }, LONG);

  afterAll(async () => {
    // tout ce qui s'est passé ici n'a ni créé ni détruit un seul statère
    expect(await somme()).toBe(depart + ailleurs);
  });

  it("font jouer un match entier entre deux membres : mises prises, carte d'en face cachée, chaque manche du moteur, pot partagé", { timeout: LONG }, async () => {
    const avant = await somme();
    expect((await etat(a)).salles.find((s) => s.mise === 100)).toEqual({ mise: 100, attente: false, permise: true });
    expect(ok(await entrer(a, 100, FORTE)).attente).toMatchObject({ mise: 100 });
    expect((await etat(b)).salles.find((s) => s.mise === 100)).toEqual({ mise: 100, attente: true, permise: true });
    const r = ok(await entrer(b, 100, BASE));
    expect(r.attente).toBeNull();
    let mb = r.match!;
    expect(mb).toMatchObject({ essai: false, mise: 100, moi: "b", manche: 1, mains: { a: FORTE, b: BASE }, fini: false });
    expect(mb.adversaire).toMatchObject({ nom: expect.any(String) });
    expect(await solde(a)).toBe(4900);
    expect(await solde(b)).toBe(4900);
    expect(await somme()).toBe(avant);
    let ma = (await etat(a)).match!;
    expect(ma).toMatchObject({ match: mb.match, moi: "a" });
    expect(await une<number>("select count(*)::int as r from internal.duel_salle_attentes")).toBe(0);

    while (!ma.fini) {
      const rejeu = rejouer(ma);
      const ia = pris(libres(rejeu.a)), ib = pris(libres(rejeu.b));
      // a pose : b sait qu'il a posé, jamais quelle carte
      const apresA = ok(await poser(a, ma, ia)).match!;
      expect(apresA).toMatchObject({ pose: ia, adverse_pose: false });
      mb = (await etat(b)).match!;
      expect(mb).toMatchObject({ pose: null, adverse_pose: true, coups: ma.coups });
      expect(await poser(a, ma, ia)).toMatchObject({ ok: false, error: "deja_pose" });
      // b pose : la manche se résout
      const rb = ok(await poser(b, mb, ib));
      const fin = rb.match ?? rb.dernier!;
      expect(fin.coups.at(-1)).toEqual([ia, ib]);
      const rejoue = rejouer(fin);
      expect(fin.vies).toEqual({ a: rejoue.a.vie, b: rejoue.b.vie });
      expect(fin).toMatchObject({ pose: null, adverse_pose: false });
      ma = (await etat(a)).match ?? (await etat(a)).dernier!;
      expect(ma.coups).toEqual(fin.coups);
      if (ma.fini) {
        expect(ma).toMatchObject({ fin: "combat", verdict: verdict(rejoue.a, rejoue.b) });
        expect(fin.verdict! + ma.verdict!).toBe(0);
      }
    }
    const v = ma.verdict!;
    if (v === 0) {
      expect([await solde(a), await solde(b)]).toEqual([5000, 5000]);
      expect(ma).toMatchObject({ gain: 100, cagnotte: null });
    } else {
      const [gagnant, perdant] = v === 1 ? [a, b] : [b, a];
      expect(await solde(gagnant)).toBe(4900 + 180);
      expect(await solde(perdant)).toBe(4900);
      expect(ma).toMatchObject({ gain: v === 1 ? 180 : 0, cagnotte: 20 });
      expect((await etat(a)).cagnotte.montant).toBe(20);
      // la victoire attend son annonce, avec la salle et le gain
      const annonces = (await une<{ annonces: Record<string, unknown>[] }>("select public.duel_annonces_a_envoyer() as r")).annonces;
      const la = annonces.find((x) => Number(x.partie) === ma.match)!;
      const mainGagnante = v === 1 ? FORTE : BASE;
      const dernier = ma.coups.at(-1)![v === 1 ? 0 : 1];
      expect(la).toMatchObject({ essai: false, contre: "membre", boss: null, salle: 100, manches: ma.coups.length, main: mainGagnante, vainqueur: { pseudo: null }, vaincu: { pseudo: null } });
      expect(la).not.toHaveProperty("gain");
      expect(la).toHaveProperty("banniere_du_lieu");
      expect(la.carte).toEqual({ emplacement: EMPLACEMENTS_DU_DUEL[dernier], objet: mainGagnante[EMPLACEMENTS_DU_DUEL[dernier]!] });
      expect(await une("select public.noter_annonces_duel(array[$1]::bigint[]) as r", [ma.match])).toEqual({ ok: true, notees: 1 });
      expect(await une("select public.noter_annonces_duel(array[$1]::bigint[]) as r", [ma.match])).toEqual({ ok: true, notees: 0 });
    }
    expect(await somme()).toBe(avant);
  });

  it("donnent le match à celui qui a posé quand l'autre laisse passer les 30 secondes", async () => {
    const avant = await somme();
    const [sa, sb] = [await solde(a), await solde(b)];
    ok(await entrer(a, 250));
    const m = ok(await entrer(b, 250)).match!;
    ok(await poser(b, m, libres(rejouer(m).b)[0]!));
    await echoir(m.match);
    const vuA = await etat(a);
    expect(vuA.match).toBeNull();
    expect(vuA.dernier).toMatchObject({ match: m.match, fin: "temps", verdict: -1, gain: 0 });
    expect((await etat(b)).dernier).toMatchObject({ verdict: 1, gain: 450 });
    expect(await solde(a)).toBe(sa - 250);
    expect(await solde(b)).toBe(sb - 250 + 450);
    expect(await somme()).toBe(avant);
    // sans manche jouée, la victoire n'est pas annoncée : l'image montre un vrai combat
    expect(await une<number>("select count(*)::int as r from internal.duel_salle_annonces where match = $1", [m.match])).toBe(0);
  });

  it("rendent sa mise à chacun quand aucun des deux ne pose : égalité", async () => {
    const avant = await somme();
    const [sa, sb] = [await solde(a), await solde(b)];
    ok(await entrer(b, 50));
    const m = ok(await entrer(a, 50)).match!;
    expect(m.moi).toBe("b");
    expect(await solde(a)).toBe(sa - 50);
    await echoir(m.match);
    // personne n'appelle plus : pg_cron finit le match
    await db.query("select internal.duel_salles_reveil()");
    expect((await etat(a)).dernier).toMatchObject({ match: m.match, fin: "temps", verdict: 0, gain: 50, cagnotte: null });
    expect([await solde(a), await solde(b)]).toEqual([sa, sb]);
    expect(await somme()).toBe(avant);
    expect(await une<string>("select jobname as r from cron.job where jobname = 'gal-duel-salles'")).toBe("gal-duel-salles");
  });

  it("n'apparient plus deux membres qui ont déjà joué trois matchs avec mise ensemble aujourd'hui", async () => {
    expect(await une<number>("select internal.duel_salle_matchs_contre($1, $2, internal.duel_jour(now())) as r", [a, b])).toBe(3);
    ok(await entrer(a, 100));
    const r = ok(await entrer(b, 100));
    expect(r.match).toBeNull();
    expect(r.attente).toMatchObject({ mise: 100 });
    // un troisième Gaulois prend le premier qui attend
    const m = ok(await entrer(c, 100)).match!;
    expect(m.moi).toBe("b");
    expect((await etat(a)).match).toMatchObject({ match: m.match, moi: "a" });
    expect((await etat(b)).attente).toMatchObject({ mise: 100 });
    // « Quitter la salle », sans nommer le match : le match qui vient de commencer n'est pas touché
    expect(ok(await appel(c, "public.quitter_salle_duel()")).match).toMatchObject({ match: m.match, fini: false });
    // c s'en va du match : il perd
    const sc = await solde(c);
    const q = ok(await appel(c, "public.quitter_salle_duel($1)", [m.match]));
    expect(q.dernier).toMatchObject({ match: m.match, fin: "quitte", verdict: -1, gain: 0 });
    expect(await solde(c)).toBe(sc);
    expect((await etat(a)).dernier).toMatchObject({ verdict: 1, gain: 180 });
    // b quitte la salle sans rien perdre
    ok(await appel(b, "public.quitter_salle_duel()"));
    expect((await etat(b)).attente).toBeNull();
  });

  it("refusent un compte qui n'a pas la mise, et font sortir de la salle celui qui ne l'a plus", async () => {
    expect(await entrer(d, 50)).toMatchObject({ ok: false, error: "solde_insuffisant" });
    expect((await etat(d)).salles.map((s) => s.permise)).toEqual([true, false, false, false, false, false]);
    ok(await entrer(d, 25));
    // il dépense ailleurs pendant qu'il attend
    await db.query("insert into internal.stateres_mouvements (user_id, nature, montant, ref) values ($1, 'achat', -10, 'essai')", [d]);
    ailleurs -= 10;
    const r = ok(await entrer(e, 25));
    expect(r.match).toBeNull();
    expect(r.attente).toMatchObject({ mise: 25 });
    expect((await etat(d)).attente).toBeNull();
    ok(await appel(e, "public.quitter_salle_duel()"));
  });

  it("font sortir de la salle celui qui ne donne plus de nouvelles depuis 10 secondes", async () => {
    ok(await entrer(e, 500));
    await db.query("update internal.duel_salle_attentes set vu_le = now() - interval '20 seconds' where user_id = $1", [e]);
    const r = ok(await entrer(c, 500));
    expect(r.match).toBeNull();
    expect((await etat(e)).attente).toBeNull();
    ok(await appel(c, "public.quitter_salle_duel()"));
  });

  it("gardent les règles d'un match : une manche à la fois, une carte au repos, un seul match, une main qu'on possède", async () => {
    ok(await entrer(a, 25));
    const m = ok(await entrer(c, 25)).match!;
    expect(await entrer(c, 50)).toMatchObject({ ok: false, error: "match_en_cours" });
    expect(await appel(c, "public.poser_carte_salle($1, 2, 0)", [m.match])).toMatchObject({ ok: false, error: "mauvaise_manche" });
    expect(await appel(e, "public.poser_carte_salle($1, 1, 0)", [m.match])).toMatchObject({ ok: false, error: "match_inconnu" });
    expect(await appel(c, "public.poser_carte_salle($1, 1, 7)", [m.match])).toMatchObject({ ok: false, error: "carte_au_repos" });
    expect(await entrer(e, 25, { ...BASE, arme: "epee-or" })).toMatchObject({ ok: false, error: "carte_non_possedee" });
    expect(await entrer(e, 25, { ...BASE, arme: "bonnet" })).toMatchObject({ ok: false, error: "main_invalide" });
    expect(await entrer(e, 30)).toMatchObject({ ok: false, error: "salle_inconnue" });
    // une carte jouée se repose : au manche suivante, elle est refusée
    const ia = 0, ib = 0;
    ok(await poser(a, (await etat(a)).match!, ia));
    const suite = ok(await poser(c, m, ib)).match!;
    expect(suite.manche).toBe(2);
    expect(await appel(c, "public.poser_carte_salle($1, 2, 0)", [m.match])).toMatchObject({ ok: false, error: "carte_au_repos" });
    ok(await appel(a, "public.quitter_salle_duel($1)", [m.match]));
    expect(await appel(c, "public.poser_carte_salle($1, 2, 1)", [m.match])).toMatchObject({ ok: false, error: "match_fini" });
    // un forfait n'est pas annoncé : l'image montre un combat et sa carte décisive
    expect(await une<number>("select count(*)::int as r from internal.duel_salle_annonces where match = $1", [m.match])).toBe(0);
    expect(await appel(c, "public.quitter_salle_duel($1)", [m.match + 1000])).toMatchObject({ ok: false, error: "match_inconnu" });
  });

  it("arrêtent un compte à dix matchs avec mise par jour", async () => {
    await db.exec("begin;");
    try {
      await db.query(
        `insert into internal.duel_matchs (mise, essai, jour, joueur_a, joueur_b, main_a, main_b, options_a, options_b, cartes_a, cartes_b, atouts_a, atouts_b, etat_a, etat_b, ouverte_le, limite, fini, verdict, fin)
         select m.mise, false, m.jour, $1, null, m.main_a, m.main_b, m.options_a, m.options_b, m.cartes_a, m.cartes_b, m.atouts_a, m.atouts_b, m.etat_a, m.etat_b, m.ouverte_le, m.limite, true, 0, 'temps'
         from internal.duel_matchs m, generate_series(1, 10 - internal.duel_salle_matchs_du_jour($1, internal.duel_jour(now()))) g
         where m.id = (select max(id) from internal.duel_matchs where not essai)`,
        [e],
      );
      expect(await entrer(e, 25)).toMatchObject({ ok: false, error: "trop_de_matchs" });
      expect((await etat(e)).salles.every((s) => !s.permise)).toBe(true);
      expect((await etat(e)).jour).toMatchObject({ joues: 10, au_plus: 10 });
    } finally {
      await db.exec("rollback;");
    }
  });

  it("refusent la mise pendant un essai du mode GOD, et gardent vrais les gains d'un match commencé avant", async () => {
    await db.query("insert into internal.village_god (user_id, sauvegarde) values ($1, '{\"gaulois\": {\"tenue\": {}}}'::jsonb)", [e]);
    try {
      expect(await entrer(e, 25)).toMatchObject({ ok: false, error: "mode_god" });
      await expect(db.query("insert into internal.stateres_mouvements (user_id, nature, montant, ref) values ($1, 'duel_mise', -25, 'essai')", [e])).rejects.toThrow(/mode_god/);
      const avant = await solde(e);
      await db.query("insert into internal.stateres_mouvements (user_id, nature, montant, ref) values ($1, 'duel_rendu', 25, 'essai')", [e]);
      expect(await une<string>("select nature as r from internal.stateres_mouvements where user_id = $1 order by id desc limit 1", [e])).toBe("duel_rendu");
      expect(await solde(e)).toBe(avant + 25);
      ailleurs += 25;
    } finally {
      await db.query("delete from internal.village_god where user_id = $1", [e]);
    }
  });

  it("donnent aux matchs des numéros que nulle partie du duel n'a, et une cagnotte qui ne se corrige pas", async () => {
    const ids = await lignes<{ id: number }>("select id::int as id from internal.duel_matchs union all select id::int from internal.duel_parties");
    expect(new Set(ids.map((x) => x.id)).size).toBe(ids.length);
    await expect(db.query("update internal.duel_cagnotte_mouvements set montant = 1 where true")).rejects.toThrow(/ne se modifie pas/);
    await expect(db.query("update internal.duel_cagnottes set montant = 0 where true")).rejects.toThrow(/que par son journal/);
    const sauvegarde = await une<Record<string, unknown>>("select public.export_site() as r");
    expect(sauvegarde.version).toBe(13);
    expect(sauvegarde).toHaveProperty("duel_cagnotte_mouvements");
    expect(sauvegarde).toHaveProperty("duel_matchs_en_cours", []);
    expect(sauvegarde).toHaveProperty("marche_demandes");
  });

  describe("d'autres membres", () => {
    let f: string, g: string, h: string, x: string;
    beforeAll(async () => {
      [f, g, h, x] = [await nouveauMembre(db), await nouveauMembre(db), await nouveauMembre(db), await nouveauMembre(db)];
      for (const u of [f, g, h, x]) await crediter(u, 3000);
      await donner(f, ["epee", "casque", "cotte-mailles", "sandales"]);
      depart += 4 * 3000;
    });

    it("annoncent la carte décisive du vainqueur, qu'il ait attendu ou rejoint, avec la bannière du lieu", async () => {
      for (const v of [1, -1] as const) {
        ok(await entrer(f, 25, FORTE));
        const m = ok(await entrer(g, 25)).match!;
        const vu = (await etat(f)).match!;
        ok(await poser(f, vu, 2));
        ok(await poser(g, m, 3));
        await db.query("select internal.duel_salle_finir($1, $2, 'combat')", [m.match, v]);
        const la = (await une<{ annonces: Record<string, unknown>[] }>("select public.duel_annonces_a_envoyer() as r")).annonces.find((x) => Number(x.partie) === m.match)!;
        expect(la).toMatchObject({ salle: 25, manches: 1, main: v === 1 ? FORTE : BASE, main_vaincue: v === 1 ? BASE : FORTE, banniere_du_lieu: null });
        expect(la.carte).toEqual(v === 1 ? { emplacement: "haut", objet: FORTE.haut } : { emplacement: "pieds", objet: BASE.pieds });
        expect(la).not.toHaveProperty("gain");
        expect(await une("select public.noter_annonces_duel(array[$1]::bigint[]) as r", [m.match])).toEqual({ ok: true, notees: 1 });
      }
    });

    it("donnent le match à celui qui reste quand le compte d'en face est effacé, sans perdre sa mise", async () => {
      ok(await entrer(h, 250));
      const m = ok(await entrer(x, 250)).match!;
      const sh = await solde(h);
      const sx = await solde(x);
      await db.query("delete from auth.users where id = $1", [x]);
      ailleurs -= sx; // le solde d'un compte effacé part avec lui
      const fin = (await etat(h)).dernier!;
      expect(fin).toMatchObject({ match: m.match, fin: "quitte", verdict: 1, gain: 450, cagnotte: 50 });
      expect(await solde(h)).toBe(sh + 450);
    });

    it("tirent les numéros des matchs de la même suite que les parties du duel", async () => {
      const p = await appel<{ ok: boolean; partie: { partie: number } }>(f, "public.commencer_duel('boss', null, $1::jsonb)", [JSON.stringify(BASE)]);
      expect(p.ok).toBe(true);
      ok(await entrer(f, 50));
      const m = ok(await entrer(g, 50)).match!;
      expect(m.match).toBeGreaterThan(p.partie.partie);
      const p2 = await appel<{ ok: boolean; partie: { partie: number } }>(g, "public.commencer_duel('boss', null, $1::jsonb)", [JSON.stringify(BASE)]);
      expect(p2.partie.partie).toBeGreaterThan(m.match);
      await appel(f, "public.abandonner_duel($1)", [p.partie.partie]);
      await appel(g, "public.abandonner_duel($1)", [p2.partie.partie]);
      ok(await appel(g, "public.quitter_salle_duel($1)", [m.match]));
      const ids = await lignes<{ id: number }>("select id::int as id from internal.duel_matchs union all select id::int from internal.duel_parties");
      expect(new Set(ids.map((y) => y.id)).size).toBe(ids.length);
    });

    it("gardent vrais les gains d'un match commencé avant un essai du mode GOD", async () => {
      ok(await entrer(h, 100));
      const m = ok(await entrer(f, 100)).match!;
      ok(await poser(h, (await etat(h)).match!, 0));
      const sh = await solde(h);
      await db.query("insert into internal.village_god (user_id, sauvegarde) values ($1, '{\"gaulois\": {\"tenue\": {}}}'::jsonb)", [h]);
      try {
        await echoir(m.match);
        await db.query("select internal.duel_salles_reveil()");
        expect(await une<string>("select nature as r from internal.stateres_mouvements where user_id = $1 order by id desc limit 1", [h])).toBe("duel_gain");
        expect(await solde(h)).toBe(sh + 180);
      } finally {
        await db.query("delete from internal.village_god where user_id = $1", [h]);
      }
    });

    it("finissent en égalité les matchs en cours quand le duel est fermé, mises rendues", async () => {
      const [sg, sh] = [await solde(g), await solde(h)];
      ok(await entrer(g, 500));
      const m = ok(await entrer(h, 500)).match!;
      await db.query("update internal.duel_ouvert set ouvert = false, maj_le = now() where id");
      try {
        await db.query("select internal.duel_salles_reveil()");
        expect(await une<string>("select fin as r from internal.duel_matchs where id = $1", [m.match])).toBe("ferme");
        expect([await solde(g), await solde(h)]).toEqual([sg, sh]);
      } finally {
        await db.query("update internal.duel_ouvert set ouvert = true, maj_le = now() where id");
      }
    });

    it("bornent les relectures à 150 par minute, à part de la limite des autres fonctions", async () => {
      await db.query("delete from internal.duel_salle_appels where true");
      for (let i = 0; i < 150; i++) expect(await commeMembre<Reponse>(db, g, "select public.get_salles_duel() as r")).toMatchObject({ ok: true });
      expect(await commeMembre<Reponse>(db, g, "select public.get_salles_duel() as r")).toMatchObject({ ok: false, error: "rate_limited" });
      await db.query("delete from internal.duel_salle_appels where true");
    });
  });

  it("refusent les salles aux visiteurs, et la file des victoires aux membres", async () => {
    for (const f of ["public.get_salles_duel()", "public.entrer_salle_duel(integer, jsonb)", "public.poser_carte_salle(bigint, integer, integer)", "public.quitter_salle_duel(bigint)"]) {
      expect(await une(`select has_function_privilege('anon', '${f}', 'execute') as r`), f).toBe(false);
      expect(await une(`select has_function_privilege('authenticated', '${f}', 'execute') as r`), f).toBe(true);
    }
    for (const f of ["public.duel_annonces_a_envoyer()", "public.noter_annonces_duel(bigint[])", "public.export_site()", "internal.duel_salle_finir(bigint, integer, text)", "internal.duel_salles_reveil()"]) {
      expect(await une(`select has_function_privilege('authenticated', '${f}', 'execute') as r`), f).toBe(false);
    }
    for (const t of ["duel_matchs", "duel_salle_attentes", "duel_cagnottes", "duel_cagnotte_mouvements"]) {
      expect(await une(`select has_table_privilege('authenticated', 'internal.${t}', 'select') as r`), t).toBe(false);
    }
  });

  it("se recolle sans rien changer, un match en cours, et le dit", async () => {
    ok(await entrer(a, 1000));
    ok(await entrer(c, 1000));
    const avant = await somme();
    const n = await une<number>("select count(*)::int as r from internal.duel_matchs");
    const r = await db.exec(texteAColler());
    expect((r.at(-1)!.rows[0] as { controle: string }).controle).toBe(ATTENDU.replace("fermé", "ouvert"));
    expect(await une<number>("select count(*)::int as r from internal.duel_matchs")).toBe(n);
    expect(await somme()).toBe(avant);
    const m = (await etat(c)).match!;
    ok(await appel(c, "public.quitter_salle_duel($1)", [m.match]));
  });
});

/* ---------- Le fichier que colle le pilote ---------- */

describe("le fichier à coller des salles", () => {
  it("s'installe après toutes les autres migrations, se recolle sans rien changer, et le dit", { timeout: LONG }, async () => {
    const base = await baseDeTest({ sauf: [`${NOM}.sql`] });
    const controle = async (): Promise<string> => ((await base.exec(texteAColler())).at(-1)!.rows[0] as { controle: string }).controle;
    expect(await controle()).toBe(ATTENDU);
    expect(await controle()).toBe(ATTENDU);
    await base.close();
  });

  it("s'arrête sans rien changer quand le duel n'est pas installé", { timeout: LONG }, async () => {
    const sans = await baseDeTest({ sauf: migrations().filter((m) => m >= "20261122000100") });
    await expect(sans.exec(texteAColler())).rejects.toThrow(/pas installé/);
    await sans.exec("rollback");
    expect((await sans.query<{ t: string | null }>("select to_regclass('internal.duel_matchs')::text as t")).rows[0]!.t).toBeNull();
    await sans.close();
  });
});

/* ---------- Les refus ---------- */

describe("les refus des salles", () => {
  it("sont ceux du contrat, du duel et du village, chacun avec un message en mots", async () => {
    const { readFileSync } = await import("node:fs");
    const { ERROR_MESSAGES, errorMessage } = await import("../../src/lib/compte/errors");
    const { REFUS_DU_DUEL } = await import("../../src/lib/village/contrat-duel");
    const { REFUS_DES_SALLES } = await import("../../src/lib/village/contrat-salles");
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const codes = new Set([...sql.matchAll(/internal\.(?:fail|error_json)\('([a-z_]+)'/g), ...sql.matchAll(/then return '([a-z_]+)';/g)].map((m) => m[1]!));
    const AILLEURS = ["rate_limited", "invalid_request", "not_validated", "no_gaulois", "mode_god", "solde_insuffisant", ...REFUS_DU_DUEL];
    expect([...codes].filter((c) => !(REFUS_DES_SALLES as readonly string[]).includes(c) && !AILLEURS.includes(c))).toEqual([]);
    for (const c of REFUS_DES_SALLES) expect(codes.has(c), c).toBe(true);
    for (const c of [...REFUS_DES_SALLES, ...AILLEURS]) {
      expect(ERROR_MESSAGES, c).toHaveProperty(c);
      expect(errorMessage(c), c).not.toMatch(/[<>=÷×%]/);
    }
  });
});
