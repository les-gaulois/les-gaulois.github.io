import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPLACEMENTS, EMPLACEMENTS_OBJETS, OBJETS, ORDRE_RARETES, POILS, type Rarete } from "../../src/lib/gaulois";
import {
  chanceDeLObjet,
  chancesEffectives,
  lireAchat,
  lireMaBoutique,
  lirePochette,
  manquePourAcheter,
  objetPayant,
  objetsDeLaPochette,
  prixDeLObjet,
  quantitePossedee,
  valeurMoyenneDeLaPochette,
  type Catalogue,
} from "../../src/lib/village/boutique";
import { CHANCES_POCHETTE, PRIX_PAR_RARETE, PRIX_POCHETTE, type MaBoutique } from "../../src/lib/village/contrat";

// Sous Windows, Git rend le fichier avec des fins de ligne CRLF : les motifs ci-dessous lisent des « \n ».
const MIGRATION = readFileSync("supabase/migrations/20261113001900_village_boutique.sql", "utf8").replace(/\r\n/g, "\n");

/** Tous les objets payants du catalogue, « emplacement/objet ». */
const PAYANTS = EMPLACEMENTS_OBJETS.flatMap((emplacement) =>
  Object.entries(OBJETS[emplacement])
    .filter(([, objet]) => !objet.gratuit)
    .map(([id]) => `${emplacement}/${id}`),
);

/** Le catalogue, avec une rareté dont tous les objets deviennent gratuits. */
const sansPayantDe = (rarete: Rarete): Catalogue =>
  Object.fromEntries(
    Object.entries(OBJETS).map(([emplacement, objets]) => [emplacement, Object.fromEntries(Object.entries(objets).map(([id, objet]) => [id, objet.rarete === rarete ? { ...objet, gratuit: true } : objet]))]),
  ) as Catalogue;

const BOUTIQUE: MaBoutique = {
  ok: true,
  solde: 340,
  peut_acheter: true,
  prix: { ...PRIX_PAR_RARETE },
  pochette: { prix: PRIX_POCHETTE, chances: { ...CHANCES_POCHETTE } },
  inventaire: [
    { emplacement: "tete", objet: "bandeau", quantite: 1, origine: "achat", acquis_le: "2026-11-13T10:00:00+00:00" },
    { emplacement: "arme", objet: "epee", quantite: 3, origine: "pochette", acquis_le: "2026-11-13T11:00:00.123456+00:00" },
  ],
};

describe("les réglages de la boutique", () => {
  it("sont semés par le serveur avec les prix du contrat", () => {
    const bloc = /insert into internal\.village_prix \(rarete, prix\) values\n([\s\S]*?)\non conflict/.exec(MIGRATION)?.[1] ?? "";
    const semes = Object.fromEntries([...bloc.matchAll(/^ {2}\('([a-z-]+)', (\d+)\)/gm)].map(([, rarete, prix]) => [rarete, Number(prix)]));
    expect(semes).toEqual(PRIX_PAR_RARETE);
  });

  it("sèment la pochette au prix et aux chances du contrat, dans l'ordre des raretés", () => {
    const colonnes = /insert into internal\.village_pochette \(id, prix, ([a-z_, ]+)\) values\n {2}\(true, (\d+), ([\d, ]+)\)\non conflict \(id\) do nothing;/.exec(MIGRATION);
    expect(colonnes).not.toBeNull();
    expect(colonnes?.[1]?.split(", ")).toEqual(ORDRE_RARETES.map((r) => r.replace("-", "_")));
    expect(Number(colonnes?.[2])).toBe(PRIX_POCHETTE);
    expect(colonnes?.[3]?.split(", ").map(Number)).toEqual(ORDRE_RARETES.map((r) => CHANCES_POCHETTE[r]));
    // Rejouée, la migration ne remet pas les réglages de l'encadrement à leur valeur de départ.
    expect(MIGRATION).toContain("on conflict (rarete) do nothing;");
  });

  it("ont des chances qui font 100 et des prix positifs, des deux côtés", () => {
    expect(ORDRE_RARETES.reduce((s, r) => s + CHANCES_POCHETTE[r], 0)).toBe(100);
    for (const r of ORDRE_RARETES) expect(PRIX_PAR_RARETE[r]).toBeGreaterThan(0);
    expect(MIGRATION).toContain("check (commun + peu_commun + epique + mystique + legendaire = 100)");
    expect(MIGRATION).toContain("prix integer not null check (prix between 1 and 1000000)");
    for (const colonne of ["commun", "peu_commun", "epique", "mystique", "legendaire"]) expect(MIGRATION).toContain(`${colonne} numeric(5, 2) not null check (${colonne} between 0 and 100)`);
  });
});

describe("le serveur de la boutique", () => {
  it("garde ses tables privées, ouvre ses trois fonctions aux seuls comptes connectés et n'efface rien", () => {
    for (const table of ["internal.village_prix", "internal.village_pochette", "internal.gaulois_inventaire"]) {
      expect(MIGRATION).toContain(`alter table ${table} enable row level security;`);
      expect(MIGRATION).toContain(`revoke all on table ${table} from public, anon, authenticated;`);
    }
    for (const fn of ["get_ma_boutique()", "acheter_objet(text, text)", "ouvrir_pochette()", "enregistrer_mon_gaulois(jsonb)"]) {
      expect(MIGRATION).toContain(`revoke all on function public.${fn} from public, anon, authenticated;`);
      expect(MIGRATION).toContain(`grant execute on function public.${fn} to authenticated;`);
    }
    // Chaque fonction créée a son revoke.
    const creees = [...MIGRATION.matchAll(/create or replace function ((?:public|internal)\.[a-z_]+)\(/g)].map((m) => m[1]);
    for (const fn of creees) expect(MIGRATION, fn).toMatch(new RegExp(`revoke all on function ${fn!.replace(".", "\\.")}\\(`));
    expect(MIGRATION).not.toMatch(/grant [^;]* to anon/);
    expect(MIGRATION).not.toMatch(/raw_user_meta_data|drop table|drop column|truncate|delete from|log_admin|admin_log/i);
  });

  it("limite les appels des fonctions qui écrivent, et débite par le journal des statères", () => {
    for (const fn of ["acheter_objet", "ouvrir_pochette", "enregistrer_mon_gaulois"]) {
      const corps = new RegExp(`function public\\.${fn}\\([\\s\\S]*?end \\$\\$;`).exec(MIGRATION)?.[0] ?? "";
      expect(corps, fn).toContain("if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;");
      expect(corps, fn).toContain("perform internal.village_verrou(v_uid);");
    }
    expect(MIGRATION).toContain("perform internal.village_debiter(v_uid, 'achat', v_prix, p_emplacement || '/' || p_objet);");
    expect(MIGRATION).toContain("perform internal.village_debiter(v_uid, 'pochette', v_prix, v_emplacement || '/' || v_objet);");
    expect(MIGRATION).toContain("if v_contrainte = 'stateres_soldes_solde_check' then perform internal.fail('solde_insuffisant'); end if;");
    // Le hasard vient du serveur : aucune fonction ne reçoit de tirage du navigateur.
    expect(MIGRATION).toContain("create or replace function public.ouvrir_pochette() returns jsonb");
  });

  it("vérifie la tenue comme le vestiaire, en acceptant en plus un objet de l'inventaire de l'appelant", () => {
    expect(MIGRATION).toContain(`foreach v_emplacement in array array[${EMPLACEMENTS.map((e) => `'${e}'`).join(", ")}] loop`);
    expect(MIGRATION).toContain(`any (array[${Object.keys(POILS).map((p) => `'${p}'`).join(", ")}])`);
    expect(MIGRATION).toContain(`= ${EMPLACEMENTS.length + 1};`);
    expect(MIGRATION).toContain("and (o.gratuit or exists (");
    expect(MIGRATION).toContain("where i.user_id = v_uid and i.emplacement = o.emplacement and i.objet = o.objet))");
    expect(MIGRATION).toContain(`rarete in (${ORDRE_RARETES.map((r) => `'${r}'`).join(", ")})`);
  });

  it("tire la pochette parmi les raretés qui ont des chances et un objet payant, comme le calcule le site", () => {
    expect(MIGRATION.match(/where c\.chance > 0 and exists \(select 1 from internal\.gaulois_objets o where o\.rarete = c\.rarete and not o\.gratuit\)/g)).toHaveLength(2);
  });
});

describe("le catalogue de la boutique", () => {
  it("a au moins un objet payant dans chaque rareté : la pochette peut tout donner, aux chances affichées", () => {
    for (const rarete of ORDRE_RARETES) expect(objetsDeLaPochette(rarete).length, rarete).toBeGreaterThan(0);
    expect(chancesEffectives(CHANCES_POCHETTE)).toEqual(CHANCES_POCHETTE);
  });

  it("donne à la pochette chaque objet payant, une seule fois, et aucun gratuit", () => {
    const dansLaPochette = ORDRE_RARETES.flatMap((rarete) => objetsDeLaPochette(rarete).map(({ emplacement, objet }) => `${emplacement}/${objet}`));
    expect(dansLaPochette.sort()).toEqual([...PAYANTS].sort());
    for (const rarete of ORDRE_RARETES) for (const { emplacement, objet } of objetsDeLaPochette(rarete)) expect(OBJETS[emplacement][objet]?.rarete).toBe(rarete);
  });
});

describe("le prix d'un objet", () => {
  it("est celui de sa rareté, tel que le serveur l'a donné", () => {
    expect(prixDeLObjet("tete", "bandeau", PRIX_PAR_RARETE)).toBe(100);
    expect(prixDeLObjet("arme", "hache", PRIX_PAR_RARETE)).toBe(250);
    expect(prixDeLObjet("haut", "cape-chef", PRIX_PAR_RARETE)).toBe(1000);
    expect(prixDeLObjet("tete", "couronne", PRIX_PAR_RARETE)).toBe(2500);
    expect(prixDeLObjet("tete", "bandeau", { ...PRIX_PAR_RARETE, commun: 120 })).toBe(120);
    for (const cle of PAYANTS) {
      const [emplacement, objet] = cle.split("/") as ["tete", string];
      expect(prixDeLObjet(emplacement, objet, PRIX_PAR_RARETE), cle).toBe(PRIX_PAR_RARETE[OBJETS[emplacement][objet]!.rarete!]);
    }
  });

  it("n'existe pas pour un objet gratuit, une case « rien », le corps ou un objet inconnu", () => {
    for (const [emplacement, objet] of [["tete", "bonnet"], ["arme", "gourdin"], ["pieds", "bottes"], ["tete", "aucun"], ["peau", "claire"], ["barbe", "grande"], ["tete", "inconnu"], ["tete", "toString"], ["tete", "__proto__"]] as const) {
      expect(prixDeLObjet(emplacement, objet, PRIX_PAR_RARETE), `${emplacement}/${objet}`).toBeNull();
    }
    expect(objetPayant("chapeau", "bandeau")).toBeNull();
    expect(objetPayant("tete", 3)).toBeNull();
    expect(objetPayant("tete", "bandeau")?.rarete).toBe("commun");
  });
});

describe("ce qui manque pour acheter", () => {
  it("vaut la différence quand le solde ne suffit pas, zéro sinon", () => {
    expect(manquePourAcheter(340, 500)).toBe(160);
    expect(manquePourAcheter(0, 100)).toBe(100);
    expect(manquePourAcheter(500, 500)).toBe(0);
    expect(manquePourAcheter(2600, 2500)).toBe(0);
  });

  it("se lit avec l'inventaire : un objet possédé ne se rachète pas", () => {
    expect(quantitePossedee(BOUTIQUE.inventaire, "arme", "epee")).toBe(3);
    expect(quantitePossedee(BOUTIQUE.inventaire, "tete", "bandeau")).toBe(1);
    expect(quantitePossedee(BOUTIQUE.inventaire, "tete", "couronne")).toBe(0);
    expect(quantitePossedee([], "tete", "bandeau")).toBe(0);
  });
});

describe("les chances de la pochette", () => {
  it("se partagent à égalité entre les objets d'une rareté, et font 100 en tout", () => {
    const total = PAYANTS.reduce((s, cle) => {
      const [emplacement, objet] = cle.split("/") as ["tete", string];
      return s + chanceDeLObjet(emplacement, objet, CHANCES_POCHETTE);
    }, 0);
    expect(total).toBeCloseTo(100, 9);
    expect(chanceDeLObjet("tete", "couronne", CHANCES_POCHETTE)).toBeCloseTo(CHANCES_POCHETTE.legendaire / objetsDeLaPochette("legendaire").length, 12);
    expect(chanceDeLObjet("tete", "bonnet", CHANCES_POCHETTE)).toBe(0);
    expect(chanceDeLObjet("tete", "inconnu", CHANCES_POCHETTE)).toBe(0);
  });

  it("sautent une rareté sans objet payant, ou à zéro, et donnent sa part aux autres à proportion", () => {
    const sansLegendaire = sansPayantDe("legendaire");
    const effectives = chancesEffectives(CHANCES_POCHETTE, sansLegendaire);
    expect(effectives?.legendaire).toBe(0);
    expect(effectives?.commun).toBeCloseTo((CHANCES_POCHETTE.commun * 100) / (100 - CHANCES_POCHETTE.legendaire), 12);
    expect(ORDRE_RARETES.reduce((s, r) => s + (effectives?.[r] ?? 0), 0)).toBeCloseTo(100, 9);
    expect(chancesEffectives({ commun: 0, "peu-commun": 100, epique: 0, mystique: 0, legendaire: 0 })).toEqual({ commun: 0, "peu-commun": 100, epique: 0, mystique: 0, legendaire: 0 });
    expect(chancesEffectives({ commun: 0, "peu-commun": 0, epique: 0, mystique: 0, legendaire: 100 }, sansLegendaire)).toBeNull();
  });

  it("valent en moyenne 290 statères au prix de la boutique, pour une pochette à 200", () => {
    // 50 % de 100, 30 % de 250, 13 % de 500, 5 % de 1 000, 2 % de 2 500.
    expect(valeurMoyenneDeLaPochette(CHANCES_POCHETTE, PRIX_PAR_RARETE)).toBeCloseTo(290, 9);
    expect(valeurMoyenneDeLaPochette({ commun: 100, "peu-commun": 0, epique: 0, mystique: 0, legendaire: 0 }, PRIX_PAR_RARETE)).toBeCloseTo(100, 9);
    // Sans légendaire payant, l'autre moitié des chances revient au commun.
    expect(valeurMoyenneDeLaPochette({ commun: 50, "peu-commun": 0, epique: 0, mystique: 0, legendaire: 50 }, PRIX_PAR_RARETE, sansPayantDe("legendaire"))).toBeCloseTo(100, 9);
    expect(valeurMoyenneDeLaPochette({ commun: 0, "peu-commun": 0, epique: 0, mystique: 0, legendaire: 100 }, PRIX_PAR_RARETE, sansPayantDe("legendaire"))).toBeNull();
  });
});

describe("la réponse de get_ma_boutique", () => {
  it("se lit telle qu'elle est quand tout est juste, chances à décimales comprises", () => {
    expect(lireMaBoutique(JSON.parse(JSON.stringify(BOUTIQUE)))).toEqual(BOUTIQUE);
    const decimales = { ...BOUTIQUE, pochette: { prix: 200, chances: { commun: 49.5, "peu-commun": 28.5, epique: 15.25, mystique: 5.75, legendaire: 1 } } };
    expect(lireMaBoutique(decimales)?.pochette.chances.commun).toBe(49.5);
    expect(lireMaBoutique({ ...BOUTIQUE, solde: 0, peut_acheter: false, inventaire: [] })).toMatchObject({ solde: 0, peut_acheter: false, inventaire: [] });
    // Une rareté ou une clé inconnues sont ignorées.
    expect(lireMaBoutique({ ...BOUTIQUE, prix: { ...BOUTIQUE.prix, divin: 9 }, autre: 1 })?.prix).toEqual(PRIX_PAR_RARETE);
  });

  it("est écartée en entier si le solde, l'accès, les prix ou la pochette sont illisibles", () => {
    const sans = (cle: keyof MaBoutique) => Object.fromEntries(Object.entries(BOUTIQUE).filter(([k]) => k !== cle));
    for (const reponse of [
      null,
      undefined,
      "ok",
      [],
      { ...BOUTIQUE, ok: false },
      { ok: false, error: "not_signed_in" },
      sans("solde"),
      sans("prix"),
      sans("pochette"),
      sans("inventaire"),
      sans("peut_acheter"),
      { ...BOUTIQUE, solde: -1 },
      { ...BOUTIQUE, solde: 12.5 },
      { ...BOUTIQUE, solde: "340" },
      { ...BOUTIQUE, peut_acheter: "oui" },
      { ...BOUTIQUE, prix: { ...BOUTIQUE.prix, legendaire: undefined } },
      { ...BOUTIQUE, prix: { ...BOUTIQUE.prix, commun: 0 } },
      { ...BOUTIQUE, prix: { ...BOUTIQUE.prix, epique: 499.5 } },
      { ...BOUTIQUE, prix: [100, 250, 500, 1000, 2500] },
      { ...BOUTIQUE, pochette: { ...BOUTIQUE.pochette, prix: 0 } },
      { ...BOUTIQUE, pochette: { prix: 200 } },
      { ...BOUTIQUE, pochette: { ...BOUTIQUE.pochette, chances: { ...CHANCES_POCHETTE, commun: 49 } } },
      { ...BOUTIQUE, pochette: { ...BOUTIQUE.pochette, chances: { ...CHANCES_POCHETTE, commun: 101, "peu-commun": -23 } } },
      { ...BOUTIQUE, pochette: { ...BOUTIQUE.pochette, chances: { ...CHANCES_POCHETTE, legendaire: "1" } } },
      { ...BOUTIQUE, inventaire: {} },
    ]) {
      expect(lireMaBoutique(reponse), JSON.stringify(reponse)).toBeNull();
    }
  });

  it("écarte de l'inventaire chaque ligne illisible, inconnue, gratuite ou déjà lue, et garde le reste", () => {
    const bonne = BOUTIQUE.inventaire[0]!;
    const lue = lireMaBoutique({
      ...BOUTIQUE,
      inventaire: [
        bonne,
        null,
        "tete/bandeau",
        { ...bonne },
        { ...bonne, objet: "inconnu" },
        { ...bonne, objet: "toString" },
        { ...bonne, objet: "bonnet" },
        { ...bonne, emplacement: "peau", objet: "claire" },
        { ...bonne, emplacement: "chapeau" },
        { ...bonne, objet: "beret", quantite: 0 },
        { ...bonne, objet: "beret", quantite: 1.5 },
        { ...bonne, objet: "beret", origine: "vol" },
        { ...bonne, objet: "beret", acquis_le: "hier" },
        { ...bonne, objet: "beret", acquis_le: 0 },
        BOUTIQUE.inventaire[1],
      ],
    });
    expect(lue?.inventaire).toEqual(BOUTIQUE.inventaire);
  });
});

describe("les réponses de l'achat et de la pochette", () => {
  it("se lisent quand l'objet est un objet payant du catalogue", () => {
    expect(lireAchat({ ok: true, solde: 240, objet: { emplacement: "tete", objet: "bandeau" } })).toEqual({ ok: true, solde: 240, objet: { emplacement: "tete", objet: "bandeau" } });
    expect(lirePochette({ ok: true, solde: 0, objet: { emplacement: "arme", objet: "carnyx", rarete: "legendaire", double: false } })).toEqual({
      ok: true,
      solde: 0,
      objet: { emplacement: "arme", objet: "carnyx", rarete: "legendaire", double: false },
    });
  });

  it("sont écartées sinon", () => {
    for (const reponse of [
      null,
      { ok: false, error: "solde_insuffisant" },
      { ok: true, solde: -1, objet: { emplacement: "tete", objet: "bandeau" } },
      { ok: true, solde: 10, objet: { emplacement: "tete", objet: "bonnet" } },
      { ok: true, solde: 10, objet: { emplacement: "tete", objet: "inconnu" } },
      { ok: true, solde: 10, objet: null },
      { ok: true, solde: 10 },
    ]) {
      expect(lireAchat(reponse), JSON.stringify(reponse)).toBeNull();
      expect(lirePochette(reponse), JSON.stringify(reponse)).toBeNull();
    }
    // La rareté annoncée doit être celle du catalogue, et le double un vrai ou faux.
    expect(lirePochette({ ok: true, solde: 0, objet: { emplacement: "arme", objet: "carnyx", rarete: "commun", double: false } })).toBeNull();
    expect(lirePochette({ ok: true, solde: 0, objet: { emplacement: "arme", objet: "carnyx", rarete: "legendaire", double: "non" } })).toBeNull();
    expect(lirePochette({ ok: true, solde: 0, objet: { emplacement: "arme", objet: "carnyx", rarete: "legendaire" } })).toBeNull();
  });
});
