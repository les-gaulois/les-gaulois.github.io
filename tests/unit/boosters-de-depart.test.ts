/**
 * Les boosters de départ (migration 20261128001100_boosters_de_depart, demande du pilote du 28 novembre 2026 : dix
 * boosters surprise offerts à la création de son Gaulois, et à ceux qui ont déjà le leur), sur le banc PGlite de toutes
 * les migrations du dépôt : le fichier à coller, collé après toutes les autres, sert chaque Gaulois déjà créé une seule
 * fois ; un Gaulois créé ensuite reçoit les siens, une seule fois aussi ; le booster s'ouvre sans rien créer ni coûter, et
 * seulement pour un compte validé.
 */
import { describe, expect, it } from "vitest";
import { ATTENDU, NOM, VERSION, texteAColler } from "../../scripts/a-coller-boosters-de-depart";
import { boostersDeDepartEnMots } from "../../src/lib/village/etal";
import { baseDeTest, commeMembre, migrations, nouveauMembre, texteDeMigration } from "./banc-pglite";

const LONG = 300_000;
const MIGRATION = `${NOM}.sql`;

type Reponse = { ok: boolean; error?: string };

describe("les boosters de départ", () => {
  it("sont la migration du dépôt, et le fichier à coller la contient telle quelle", () => {
    expect(migrations()).toContain(MIGRATION);
    const sql = texteDeMigration(MIGRATION);
    expect(texteAColler()).toContain("create or replace trigger gaulois_boosters_de_depart after insert on internal.gaulois");
    // Dix, une fois par compte, en bons de la pochette surprise : jamais de statère, rien d'effacé ni d'ouvert au site.
    expect(sql).toContain("select 10\n");
    expect(sql).toContain("on conflict (user_id) do nothing;\n  if not found then return 0; end if;");
    expect(sql).toContain("values (p_user, 'surprise', v_nombre)");
    expect(sql).not.toMatch(/stateres_mouvements|drop table|drop column|truncate|delete from|raw_user_meta_data|grant execute/i);
  });

  it("collé après les autres migrations, sert chaque Gaulois une fois ; un Gaulois créé ensuite reçoit les siens ; le booster s'ouvre sans rien coûter", { timeout: LONG }, async () => {
    const base = await baseDeTest({ sauf: migrations().filter((m) => m >= MIGRATION) });
    const bons = async (uid: string) =>
      (await base.query<{ n: number }>("select coalesce(sum(nombre), 0)::int as n from internal.loterie_bons where user_id = $1 and pochette = 'surprise'", [uid])).rows[0]!.n;
    const ancien = await nouveauMembre(base);
    const enAttente = await nouveauMembre(base, { valide: false });
    const sansGaulois = await nouveauMembre(base, { gaulois: false });
    const gagnant = await nouveauMembre(base);
    // Un booster surprise déjà gagné (loterie ou palier) reste, les dix s'y ajoutent.
    await base.query("insert into internal.loterie_bons (user_id, pochette, nombre) values ($1, 'surprise', 2)", [gagnant]);

    const controle = async (): Promise<string> => {
      const r = await base.exec(texteAColler());
      return (r.at(-1)!.rows[0] as { controle: string }).controle;
    };
    expect(await controle()).toBe(`${ATTENDU} (3 Gaulois servis)`);
    expect([await bons(ancien), await bons(enAttente), await bons(sansGaulois), await bons(gagnant)]).toEqual([10, 10, 0, 12]);
    // Recollé : rien de plus.
    expect(await controle()).toBe(`${ATTENDU} (3 Gaulois servis)`);
    expect([await bons(ancien), await bons(enAttente), await bons(sansGaulois), await bons(gagnant)]).toEqual([10, 10, 0, 12]);

    // Le compte sans Gaulois crée le sien : dix boosters ; changer de tenue ensuite ne redonne rien.
    const tenue = Object.fromEntries(
      (await base.query<{ emplacement: string; objet: string }>(
        "select distinct on (emplacement) emplacement, objet from internal.gaulois_objets where gratuit and emplacement in ('peau', 'cheveux', 'barbe', 'tete', 'haut', 'bas', 'pieds', 'arme') order by emplacement, objet",
      )).rows.map((o) => [o.emplacement, o.objet]),
    );
    const enregistrer = (t: Record<string, string>) => commeMembre<Reponse>(base, sansGaulois, "select public.enregistrer_mon_gaulois($1::jsonb) as r", [JSON.stringify(t)]);
    expect((await enregistrer({ ...tenue, teinte_cheveux: "roux" })).ok).toBe(true);
    expect(await bons(sansGaulois)).toBe(10);
    expect((await enregistrer({ ...tenue, teinte_cheveux: "noir" })).ok).toBe(true);
    expect(await bons(sansGaulois)).toBe(10);
    // Un compte créé après la mise en ligne, comme à l'inscription : dix aussi.
    expect(await bons(await nouveauMembre(base))).toBe(10);

    // Le booster s'ouvre gratuitement, par la pochette habituelle : un bon de moins, le solde inchangé, aucun statère créé.
    const prix = (await base.query<{ prix: number }>("select prix from internal.village_pochette where id")).rows[0]!.prix;
    const solde = async (uid: string) => Number((await base.query<{ s: string | null }>("select solde::text as s from internal.stateres_soldes where user_id = $1", [uid])).rows[0]?.s ?? 0);
    const somme = async (uid: string) => Number((await base.query<{ s: string }>("select coalesce(sum(montant), 0)::text as s from internal.stateres_mouvements where user_id = $1", [uid])).rows[0]!.s);
    const [avant, sommeAvant] = [await solde(ancien), await somme(ancien)];
    const ouvrir = (uid: string) => commeMembre<Reponse>(base, uid, "select public.ouvrir_pochette($1) as r", [prix]);
    expect((await ouvrir(ancien)).ok).toBe(true);
    expect(await bons(ancien)).toBe(9);
    expect(await solde(ancien)).toBe(avant);
    expect(await somme(ancien)).toBe(sommeAvant);
    // Reçu sans payer : rien à revendre au jeu.
    expect((await base.query<{ n: number }>("select count(*)::int as n from internal.revente_droits($1)", [ancien])).rows[0]!.n).toBe(0);
    // Un compte qui attend sa validation garde ses boosters, sans pouvoir les ouvrir.
    expect(await ouvrir(enAttente)).toMatchObject({ ok: false, error: "not_validated" });
    expect(await bons(enAttente)).toBe(10);

    // La fonction du cadeau reste fermée au site.
    const permis = async (role: string) =>
      (await base.query<{ p: boolean }>(`select has_function_privilege('${role}', 'internal.offrir_boosters_de_depart(uuid)', 'execute') as p`)).rows[0]!.p;
    expect([await permis("anon"), await permis("authenticated")]).toEqual([false, false]);
    expect((await base.query<{ n: number }>(`select count(*)::int as n from supabase_migrations.schema_migrations where version = '${VERSION}'`)).rows[0]!.n).toBe(1);
    await base.close();
  });

  it("s'arrête sans rien changer quand le village n'a pas ses boosters offerts", { timeout: LONG }, async () => {
    const sansBons = await baseDeTest({ sauf: migrations().filter((m) => m >= "20261116001200") });
    await expect(sansBons.exec(texteAColler())).rejects.toThrow(/pas installés/);
    await sansBons.exec("rollback");
    expect((await sansBons.query<{ t: string | null }>("select to_regclass('internal.boosters_de_depart')::text as t")).rows[0]!.t).toBeNull();
    await sansBons.close();
  });
});

describe("la phrase dite à la création du Gaulois", () => {
  it("donne le nombre lu au serveur, au singulier comme au pluriel, et rien sans booster", () => {
    expect(boostersDeDepartEnMots(10, true)).toBe("10 boosters surprises vous attendent dans « Mon Gaulois », onglet « Les boosters », à ouvrir sans rien payer.");
    expect(boostersDeDepartEnMots(1, true)).toBe("Un booster surprise vous attend dans « Mon Gaulois », onglet « Les boosters », à ouvrir sans rien payer.");
    expect(boostersDeDepartEnMots(0, true)).toBeNull();
    expect(boostersDeDepartEnMots(undefined, false)).toBeNull();
  });

  it("dit à un compte pas encore validé qu'il les ouvrira une fois validé", () => {
    expect(boostersDeDepartEnMots(10, false)).toBe(
      "10 boosters surprises vous attendent dans « Mon Gaulois », onglet « Les boosters », à ouvrir sans rien payer une fois votre compte validé.",
    );
  });
});
