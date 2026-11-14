import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fmtInt } from "../../src/lib/format";
import { OBJETS, ORDRE_RARETES, type Rarete } from "../../src/lib/gaulois";
import { CHANCES_POCHETTE, PRIX_PAR_RARETE, PRIX_POCHETTE } from "../../src/lib/village/contrat";
import {
  CHAMP_PRIX_POCHETTE,
  CHAMP_SOMME,
  PRIX_MAX,
  REGLAGES_DU_PILOTE,
  champChance,
  champPrix,
  changements,
  controlerSaisie,
  lireEconomie,
  lireNombreTape,
  lireReglage,
  memeSaisie,
  reglagesDe,
  reglagesDuPiloteEnMots,
  saisieDe,
  sommeEnMots,
  type EconomieDuVillage,
  type Reglages,
  type Saisie,
  D_OU_VIENNENT_LES_BULLES,
  PLAFOND_ATTEINT,
  confirmationDesBulles,
  confirmationDuPlafond,
  controlerPlafond,
  dollars,
  depenseEnMorceaux,
  etatDesBulles,
  etatDuFormulaire,
  moisEnMots,
  partDuPlafond,
  pastilleDesBulles,
  phraseDeLaDepense,
  plafondEnSaisie,
  prixDuModele,
} from "../../src/lib/village/direction";
import { PLAFOND_MAX, lirePlafond, lireVieDuVillage, type VieDuVillage } from "../../src/lib/village/vie-releve";
import { controlerReglages, hasardAGraine, type Catalogue } from "../../src/lib/village/economie";

const MIGRATION = readFileSync("supabase/migrations/20261113002100_village_direction.sql", "utf8");
/** Le texte d'une fonction de la migration, de sa création à la fin de son corps (« $$; »). */
const corps = (fn: string) => new RegExp(`function ${fn.replace(".", "\\.")}\\([\\s\\S]*?\\$\\$;`).exec(MIGRATION)?.[0] ?? "";

const parRarete = (valeurs: number[]): Record<Rarete, number> => Object.fromEntries(ORDRE_RARETES.map((r, i) => [r, valeurs[i]])) as Record<Rarete, number>;

/** Une réponse complète du serveur, telle que l'essai sur PGlite la donne. */
const REPONSE: EconomieDuVillage = {
  ok: true,
  lu_le: "2026-11-13T21:04:00.123+00:00",
  seuil: 5,
  debut: "2026-11-02T10:00:00+00:00",
  releve: "2026-11-13T21:00:00+00:00",
  gaulois: { total: 12, trente_jours: 7 },
  comptes_credites: { total: 9, trente_jours: 8 },
  distribues: { total: 54_300, trente_jours: 41_250 },
  depenses: { total: 12_900, trente_jours: null },
  boutique: { total: 9_400, trente_jours: null },
  pochettes: { total: 3_500, trente_jours: null },
  circulation: 41_400,
  achats: { total: parRarete([20, 8, 3, 1, 0]), trente_jours: null },
  ouvertures: { total: parRarete([9, 5, 2, 1, 0]), trente_jours: null },
  reglages: {
    prix: { ...PRIX_PAR_RARETE },
    prix_maj_le: "2026-11-13T18:00:00+00:00",
    pochette: { prix: PRIX_POCHETTE, chances: { ...CHANCES_POCHETTE }, maj_le: "2026-11-13T18:00:00+00:00" },
    objets_payants: parRarete([8, 10, 11, 9, 7]),
  },
};

const copie = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
/** La réponse avec une valeur changée à un chemin (« reglages.pochette.prix »). */
function avec(chemin: string, valeur: unknown): unknown {
  const r = copie(REPONSE) as unknown as Record<string, unknown>;
  const cles = chemin.split(".");
  let o = r;
  for (const k of cles.slice(0, -1)) o = o[k] as Record<string, unknown>;
  const derniere = cles.at(-1)!;
  if (valeur === undefined) delete o[derniere];
  else o[derniere] = valeur;
  return r;
}

const PILOTE = saisieDe(REGLAGES_DU_PILOTE);
const saisie = (modif: Partial<{ prix: Partial<Record<Rarete, string>>; prixPochette: string; chances: Partial<Record<Rarete, string>> }>): Saisie => ({
  prix: { ...PILOTE.prix, ...modif.prix },
  prixPochette: modif.prixPochette ?? PILOTE.prixPochette,
  chances: { ...PILOTE.chances, ...modif.chances },
});
const champs = (s: Saisie) => controlerSaisie(s).problemes.map((p) => p.champ);

/** Le catalogue, avec une rareté dont tous les objets deviennent gratuits. */
const sansPayantDe = (rarete: Rarete): Catalogue =>
  Object.fromEntries(Object.entries(OBJETS).map(([e, objets]) => [e, Object.fromEntries(Object.entries(objets).map(([id, o]) => [id, o.rarete === rarete ? { ...o, gratuit: true } : o]))]));

describe("le serveur de l'onglet Village", () => {
  it("ouvre trois fonctions aux seuls comptes connectés, ferme les autres, et ne crée ni n'efface rien", () => {
    const creees = [...MIGRATION.matchAll(/create or replace function ((?:public|internal)\.[a-z_]+)\(/g)].map((m) => m[1]!);
    expect(creees.sort()).toEqual(
      [
        "internal.village_chances_valides",
        "internal.village_passe",
        "internal.village_prix_pochette_valide",
        "internal.village_prix_valides",
        "internal.village_reglages_verrou",
        "internal.village_seuil",
        "public.get_village_economie",
        "public.regler_village_pochette",
        "public.regler_village_prix",
      ].sort(),
    );
    for (const fn of creees) {
      expect(MIGRATION, fn).toMatch(new RegExp(`revoke all on function ${fn.replace(".", "\\.")}\\([^)]*\\) from public, anon, authenticated;`));
      expect(corps(fn), fn).toContain("set search_path = public, pg_temp");
    }
    for (const fn of ["get_village_economie()", "regler_village_prix(jsonb)", "regler_village_pochette(jsonb, jsonb)"]) {
      expect(MIGRATION).toContain(`grant execute on function public.${fn} to authenticated;`);
    }
    expect(MIGRATION.match(/^grant /gm)).toHaveLength(3);
    expect(MIGRATION).not.toMatch(/grant [^;]* to anon|create table|alter table|drop |truncate|delete from|raw_user_meta_data/i);
  });

  it("donne l'économie à l'encadrement, les réglages aux admins et au fondateur seulement, et limite ce qui écrit", () => {
    expect(corps("public.get_village_economie")).toContain("perform internal.require_rank(2);");
    expect(corps("public.get_village_economie")).not.toContain("limit_exceeded");
    for (const fn of ["public.regler_village_prix", "public.regler_village_pochette"]) {
      expect(corps(fn), fn).toContain("if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;");
      expect(corps(fn), fn).toContain("v_actor := internal.require_rank(3);");
      expect(corps(fn), fn).toContain("perform internal.village_reglages_verrou();");
    }
  });

  it("note chaque changement au journal de l'encadrement, avec l'avant et l'après, et rien quand rien ne change", () => {
    // Les prix : avec, s'il y en a, le nombre d'offres du marché fermées parce que plus chères que le nouveau prix.
    expect(corps("public.regler_village_prix")).toMatch(
      /perform internal\.log_admin\(v_actor, 'village_prix_saved', null,\s+jsonb_build_object\('avant', v_avant, 'apres', v_apres\) \|\| case when v_fermees > 0 then jsonb_build_object\('offres_fermees', v_fermees\) else '\{\}'::jsonb end\);/,
    );
    expect(corps("public.regler_village_pochette")).toContain("perform internal.log_admin(v_actor, 'village_pochette_saved', null, jsonb_build_object('avant', v_avant, 'apres', v_apres));");
    for (const fn of ["public.regler_village_prix", "public.regler_village_pochette"]) {
      const c = corps(fn);
      expect(c.indexOf("if v_avant is not distinct from v_apres then"), fn).toBeGreaterThan(0);
      expect(c.indexOf("if v_avant is not distinct from v_apres then"), fn).toBeLessThan(c.indexOf("perform internal.log_admin"));
    }
  });

  it("ferme au marché, après une baisse des prix, les offres plus chères que la boutique (revue de sécurité du 14 novembre 2026)", () => {
    const c = corps("public.regler_village_prix");
    const fermer = c.indexOf("v_fermees := internal.marche_fermer_au_dessus_des_prix();");
    expect(fermer).toBeGreaterThan(c.indexOf("insert into internal.village_prix"));
    expect(fermer).toBeLessThan(c.indexOf("perform internal.log_admin"));
  });

  it("garde le seuil de 5 comptes, et ne lit jamais la table des soldes", () => {
    expect(corps("internal.village_seuil")).toContain("select 5");
    expect(corps("internal.village_passe")).toContain("p_comptes = 0 or p_comptes >= internal.village_seuil()");
    expect(MIGRATION).not.toContain("stateres_soldes");
  });

  it("contrôle les mêmes raretés et les mêmes bornes que le site", () => {
    const raretes = `array[${ORDRE_RARETES.map((r) => `'${r}'`).join(", ")}]`;
    expect(corps("internal.village_prix_valides")).toContain(raretes);
    expect(corps("internal.village_chances_valides")).toContain(raretes);
    expect(corps("internal.village_prix_valides")).toContain(`v_valeur > ${PRIX_MAX}`);
    expect(corps("internal.village_prix_valides")).toContain("v_valeur <= v_precedent");
    expect(corps("internal.village_prix_pochette_valide")).toContain(`v_valeur > ${PRIX_MAX}`);
    expect(corps("internal.village_chances_valides")).toContain("v_valeur < 0 or v_valeur > 100");
    expect(corps("internal.village_chances_valides")).toContain("if v_somme <> 100 then return null; end if;");
    for (const fn of ["internal.village_prix_valides", "internal.village_prix_pochette_valide", "internal.village_chances_valides"]) {
      expect(corps(fn), fn).toContain("v_valeur <> trunc(v_valeur)");
    }
    expect(corps("public.regler_village_pochette")).toContain("and not exists (select 1 from internal.gaulois_objets o where o.rarete = c.key and not o.gratuit)");
  });
});

describe("la réponse de get_village_economie", () => {
  it("se lit telle qu'elle est, chiffres cachés compris", () => {
    expect(lireEconomie(copie(REPONSE))).toEqual(REPONSE);
    const vide = { ...copie(REPONSE), debut: null, releve: null, circulation: null, distribues: { total: null, trente_jours: null } };
    expect(lireEconomie(vide)).toEqual(vide);
  });

  it("garde des chances à décimales, réglées à la main dans l'éditeur SQL", () => {
    const chances = { ...CHANCES_POCHETTE, commun: 49.5, "peu-commun": 30.5 };
    expect(lireEconomie(avec("reglages.pochette.chances", chances))?.reglages.pochette.chances).toEqual(chances);
  });

  it("est écartée en entier si une partie est illisible : jamais un chiffre faux", () => {
    for (const [chemin, valeur] of [
      ["ok", false],
      ["lu_le", undefined],
      ["lu_le", "hier"],
      ["seuil", 0],
      ["releve", 12],
      ["gaulois", null],
      ["gaulois.total", -1],
      ["comptes_credites.trente_jours", "8"],
      ["distribues.total", 1.5],
      ["depenses", undefined],
      ["circulation", undefined],
      ["achats.total", 1],
      ["achats.total.legendaire", undefined],
      ["ouvertures.trente_jours", { commun: 1 }],
      ["reglages.prix.commun", 0],
      ["reglages.prix", undefined],
      ["reglages.pochette.prix", 0],
      ["reglages.pochette.chances.commun", 51],
      ["reglages.pochette.chances.legendaire", -2],
      ["reglages.objets_payants.epique", undefined],
      ["reglages.pochette.maj_le", "pas une date"],
    ] as const) {
      expect(lireEconomie(avec(chemin, valeur)), `${chemin} = ${JSON.stringify(valeur)}`).toBeNull();
    }
    for (const r of [null, undefined, "ok", [], { ok: false, error: "forbidden" }]) expect(lireEconomie(r)).toBeNull();
  });
});

describe("le contrôle des réglages avant l'envoi", () => {
  it("accepte les réglages du pilote, sans avertissement", () => {
    const c = controlerSaisie(PILOTE);
    expect(c.problemes).toEqual([]);
    expect(c.avertissements).toEqual([]);
    expect(c.somme).toBe(100);
    expect(c.reglages).toEqual(REGLAGES_DU_PILOTE);
  });

  it("garde les réglages du pilote identiques au contrat", () => {
    expect(REGLAGES_DU_PILOTE).toEqual({ prix: PRIX_PAR_RARETE, pochette: { prix: PRIX_POCHETTE, chances: CHANCES_POCHETTE } });
    expect(reglagesDuPiloteEnMots()).toBe(
      `Prix de ${ORDRE_RARETES.slice(0, -1).map((r) => fmtInt(PRIX_PAR_RARETE[r])).join(", ")} et ${fmtInt(PRIX_PAR_RARETE.legendaire)} statères, du commun au légendaire ; pochette à ${fmtInt(PRIX_POCHETTE)} statères ; chances de ${ORDRE_RARETES.slice(0, -1).map((r) => fmtInt(CHANCES_POCHETTE[r])).join(", ")} et ${fmtInt(CHANCES_POCHETTE.legendaire)} pour cent.`,
    );
  });

  it("lit un nombre tapé avec des espaces entre les milliers, et rien d'autre", () => {
    const nbsp = String.fromCharCode(0xa0);
    const fine = String.fromCharCode(0x202f);
    expect(lireNombreTape("1 000")).toBe(1000);
    expect(lireNombreTape(` 2${nbsp}500 `)).toBe(2500);
    expect(lireNombreTape(`1${fine}000${fine}000`)).toBe(1_000_000);
    expect(lireNombreTape("0")).toBe(0);
    for (const t of ["", " ", "12,5", "12.5", "-3", "+3", "1e3", "abc", "10 %", "1234567890"]) expect(lireNombreTape(t), t).toBeNull();
    expect(controlerSaisie(saisie({ prix: { mystique: "1 000", legendaire: `2${nbsp}500` } })).problemes).toEqual([]);
  });

  it("refuse un prix illisible, nul ou trop grand, en nommant la rareté", () => {
    for (const p of ["", "abc", "0", "12,5", "-5", "1000001"]) {
      const c = controlerSaisie(saisie({ prix: { commun: p } }));
      expect(c.problemes.map((x) => x.champ), p).toEqual([champPrix("commun")]);
      expect(c.problemes[0]?.texte).toBe(`Commun : un nombre entier de statères, de 1 à ${fmtInt(PRIX_MAX)}.`);
      expect(c.reglages).toBeNull();
    }
    expect(champs(saisie({ prix: { legendaire: String(PRIX_MAX) } }))).toEqual([]);
  });

  it("veut chaque rareté plus chère que la précédente, et le dit en mots", () => {
    const c = controlerSaisie(saisie({ prix: { epique: "250" } }));
    expect(c.problemes).toEqual([{ champ: champPrix("epique"), texte: `Épique : il doit coûter plus qu'un objet peu commun (${fmtInt(250)} statères).` }]);
    expect(champs(saisie({ prix: { commun: "300" } }))).toEqual([champPrix("peu-commun")]);
    expect(champs(saisie({ prix: { legendaire: "999" } }))).toEqual([champPrix("legendaire")]);
  });

  it("refuse un prix de pochette illisible ou nul", () => {
    for (const p of ["", "0", "abc", "1000001"]) expect(champs(saisie({ prixPochette: p })), p).toEqual([CHAMP_PRIX_POCHETTE]);
    expect(champs(saisie({ prixPochette: "1" }))).toEqual([]);
  });

  it("veut des chances entières de 0 à 100, qui font 100, et dit leur somme en mots", () => {
    expect(champs(saisie({ chances: { legendaire: "2,5" } }))).toEqual([champChance("legendaire")]);
    expect(champs(saisie({ chances: { commun: "101" } }))).toEqual([champChance("commun")]);
    expect(controlerSaisie(saisie({ chances: { commun: "47" } })).problemes).toEqual([{ champ: CHAMP_SOMME, texte: "Les chances font 97 pour cent en tout : il en manque 3." }]);
    expect(controlerSaisie(saisie({ chances: { commun: "54" } })).problemes).toEqual([{ champ: CHAMP_SOMME, texte: "Les chances font 104 pour cent en tout : 4 de trop." }]);
    expect(controlerSaisie(saisie({ chances: { commun: "47" } })).somme).toBe(97);
    expect(controlerSaisie(saisie({ chances: { commun: "x" } })).somme).toBeNull();
    expect(champs(saisie({ chances: { commun: "52", legendaire: "0" } }))).toEqual([]);
    expect(champs(saisie({ chances: { commun: "100", "peu-commun": "0", epique: "0", mystique: "0", legendaire: "0" } }))).toEqual([]);
  });

  it("dit la somme des chances sans aucun signe", () => {
    expect(sommeEnMots(100)).toBe("Les chances font 100 pour cent en tout.");
    for (const n of [0, 3, 97, 100, 104, 500]) expect(sommeEnMots(n)).not.toMatch(/[<>=÷%+−-]/);
  });

  it("refuse une chance pour une rareté sans objet à vendre, comme le serveur", () => {
    const catalogue = sansPayantDe("legendaire");
    expect(controlerSaisie(PILOTE, catalogue).problemes).toEqual([{ champ: champChance("legendaire"), texte: "Légendaire : aucun objet de cette rareté n'est à vendre, sa chance doit rester à 0." }]);
    expect(controlerSaisie(saisie({ chances: { commun: "52", legendaire: "0" } }), catalogue).problemes).toEqual([]);
  });

  it("avertit, sans bloquer, d'une pochette plus chère que ce qu'elle vaut en moyenne", () => {
    const c = controlerSaisie(saisie({ prixPochette: "500" }));
    expect(c.problemes).toEqual([]);
    expect(c.reglages?.pochette.prix).toBe(500);
    expect(c.avertissements).toEqual([`La pochette coûterait plus que ce qu'elle vaut en moyenne, ${fmtInt(290)} statères au prix de la boutique : l'ouvrir ferait perdre des statères.`]);
    expect(controlerSaisie(saisie({ prixPochette: "290" })).avertissements).toEqual([]);
  });

  it("bloque exactement ce que le serveur refuserait, sur 3 000 réglages tirés au hasard", () => {
    const hasard = hasardAGraine(2026_11_13);
    const tire = (max: number) => Math.floor(hasard() * (max + 1));
    let acceptes = 0;
    for (let i = 0; i < 3000; i++) {
      // Des prix souvent croissants, parfois non ; des chances qui font souvent 100.
      const base = [tire(300), tire(300), tire(600), tire(1200), tire(3000)];
      const prix = hasard() < 0.7 ? base.map((_, j) => base.slice(0, j + 1).reduce((s, x) => s + x, 0)) : base;
      const coupes = Array.from({ length: 4 }, () => tire(100)).sort((a, b) => a - b);
      const chances = hasard() < 0.7 ? [coupes[0]!, coupes[1]! - coupes[0]!, coupes[2]! - coupes[1]!, coupes[3]! - coupes[2]!, 100 - coupes[3]!] : Array.from({ length: 5 }, () => tire(60));
      const prixPochette = tire(1500);
      const s: Saisie = {
        prix: Object.fromEntries(ORDRE_RARETES.map((r, j) => [r, String(prix[j])])) as Record<Rarete, string>,
        prixPochette: String(prixPochette),
        chances: Object.fromEntries(ORDRE_RARETES.map((r, j) => [r, String(chances[j])])) as Record<Rarete, string>,
      };
      // Les règles du serveur (migration 20261113002100), écrites ici une seconde fois.
      const serveur =
        prix.every((p, j) => p >= 1 && p <= PRIX_MAX && (j === 0 || p > prix[j - 1]!)) && prixPochette >= 1 && prixPochette <= PRIX_MAX && chances.every((c) => c >= 0 && c <= 100) && chances.reduce((a, b) => a + b, 0) === 100;
      const c = controlerSaisie(s);
      expect(c.problemes.length === 0, JSON.stringify(s)).toBe(serveur);
      expect(c.reglages !== null).toBe(serveur);
      if (serveur) {
        acceptes++;
        // Ce que la mesure de l'économie trouve en plus n'est jamais qu'un avertissement, celui de la valeur de la pochette.
        const mesure = controlerReglages({ prix: c.reglages!.prix, prixPochette, chances: c.reglages!.pochette.chances, catalogue: OBJETS });
        expect(c.avertissements.length).toBe(mesure.length);
        expect(mesure.every((m) => m.startsWith("La pochette ("))).toBe(true);
      }
    }
    expect(acceptes).toBeGreaterThan(500);
  });
});

describe("les changements à confirmer", () => {
  const vigueur: Reglages = reglagesDe(REPONSE.reglages);

  it("disent chaque valeur changée en mots, et n'envoient que ce qui a changé", () => {
    const apres: Reglages = { prix: { ...vigueur.prix, commun: 120, legendaire: 3000 }, pochette: vigueur.pochette };
    const c = changements(vigueur, apres);
    expect(c.lignes).toEqual([`Commun : de 100 à 120 statères.`, `Légendaire : de ${fmtInt(2500)} à ${fmtInt(3000)} statères.`]);
    expect(c.prix).toEqual(apres.prix);
    expect(c.pochette).toBeNull();
  });

  it("envoient la pochette entière, prix et chances, dès qu'une de ses valeurs change", () => {
    const chances = { ...vigueur.pochette.chances, commun: 45, "peu-commun": 35 };
    const c = changements(vigueur, { prix: vigueur.prix, pochette: { prix: 250, chances } });
    expect(c.lignes).toEqual(["Pochette : de 200 à 250 statères.", "Chance du commun : de 50 à 45 pour cent.", "Chance du peu commun : de 30 à 35 pour cent."]);
    expect(c.prix).toBeNull();
    expect(c.pochette).toEqual({ p_prix: 250, p_chances: chances });
    for (const l of c.lignes) expect(l).not.toMatch(/[<>=÷%→]/);
  });

  it("ne disent rien et n'envoient rien sans changement", () => {
    expect(changements(vigueur, reglagesDe(REPONSE.reglages))).toEqual({ lignes: [], prix: null, pochette: null });
  });

  it("comparent le formulaire champ par champ, sans tenir compte des espaces", () => {
    expect(memeSaisie(PILOTE, saisieDe(REGLAGES_DU_PILOTE))).toBe(true);
    expect(memeSaisie(saisie({ prix: { legendaire: "2 500" } }), PILOTE)).toBe(true);
    expect(memeSaisie(saisie({ prix: { legendaire: "2 501" } }), PILOTE)).toBe(false);
    expect(memeSaisie(saisie({ chances: { commun: "49" } }), PILOTE)).toBe(false);
    expect(memeSaisie(saisie({ prixPochette: "201" }), PILOTE)).toBe(false);
  });

  it("lisent la réponse d'un réglage", () => {
    expect(lireReglage({ ok: true, change: true, prix: {} })).toEqual({ change: true });
    expect(lireReglage({ ok: true, change: false })).toEqual({ change: false });
    for (const r of [null, { ok: true }, { ok: false, error: "forbidden" }, { ok: true, change: "oui" }]) expect(lireReglage(r)).toBeNull();
  });
});

/** Les espaces insécables du site, ramenées à des espaces ordinaires pour comparer. */
const sp = (s: string) => s.replace(/\s/g, " ");

/** Une réponse de get_vie_du_village, telle que la migration 20261113002300 la donne (numeric en nombres JSON). */
const VIE = (): VieDuVillage =>
  lireVieDuVillage({
    ok: true,
    bulles: true,
    plafond: 10.0,
    plafond_atteint: false,
    modele: "claude-haiku-5-5",
    prix: { entree: 0.1, sortie: 0.5 },
    mois: "2026-11-01",
    depense: { mois: "2026-11-01", cout: 0.4235, appels: 31, entree: 61200, sortie: 45100, repliques: 540, ecartees: 12 },
    historique: [{ mois: "2026-10-01", cout: 1.2, appels: 90, entree: 1, sortie: 1, repliques: 1600, ecartees: 30 }],
    bulles_affichees: 23,
    dernier_vocal: "2026-11-14T09:05:00+00:00",
    derniere_bulle: null,
  })!;

describe("les bulles des Gaulois dans l'onglet Village", () => {
  it("lisent la réponse du serveur par lireVieDuVillage, de vie-releve.ts", () => {
    expect(VIE().depense.repliques).toBe(540);
    expect(VIE().historique).toHaveLength(1);
  });

  it("écrivent les dollars au centime, sans jamais un faux zéro", () => {
    expect(sp(dollars(0))).toBe("0 $");
    expect(sp(dollars(10))).toBe("10 $");
    expect(sp(dollars(12.5))).toBe("12,50 $");
    expect(sp(dollars(0.4235))).toBe("0,42 $");
    expect(sp(dollars(0.0012))).toBe("moins de 0,01 $");
    expect(sp(dollars(0.005))).toBe("0,01 $");
    expect(sp(dollars(1234.5))).toBe("1 234,50 $");
  });

  it("disent la dépense, le plafond, l'état des bulles et le modèle en mots", () => {
    const vie = VIE();
    expect(sp(phraseDeLaDepense(vie))).toBe("Dépense du mois : 0,42 $ sur un plafond de 10 $.");
    expect(etatDesBulles(vie)).toBe("Les bulles sont permises.");
    expect(etatDesBulles({ ...vie, bulles: false })).toBe("Les bulles sont coupées : la place n'en montre aucune, et Claude n'est plus appelé.");
    expect(PLAFOND_ATTEINT).toContain("Plafond atteint");
    expect(sp(prixDuModele(vie))).toBe("Modèle claude-haiku-5-5 : 0,10 $ par million de jetons envoyés à Claude, 0,50 $ par million de jetons écrits par lui.");
    expect(sp(prixDuModele({ ...vie, prix: { entree: 0.0375, sortie: 3 } }))).toContain("0,0375 $ par million");
    expect(D_OU_VIENNENT_LES_BULLES).toContain("écrites par Claude (Anthropic) à partir de faits sans identité");
    expect(D_OU_VIENNENT_LES_BULLES).toContain("en dollars, la monnaie d'Anthropic");
  });

  it("nomment les mois d'avant en toutes lettres", () => {
    expect(moisEnMots("2026-10-01")).toBe("octobre 2026");
    expect(moisEnMots("2026-01-01")).toBe("janvier 2026");
    expect(moisEnMots("pas un mois")).toBe("pas un mois");
  });

  it("relisent le plafond saisi par lirePlafond, et disent le refus du serveur", () => {
    expect(controlerPlafond("15", 10)).toEqual({ valeur: 15, probleme: null, change: true });
    expect(controlerPlafond("12,50", 10)).toEqual({ valeur: 12.5, probleme: null, change: true });
    expect(controlerPlafond("10", 10)).toEqual({ valeur: 10, probleme: null, change: false });
    expect(controlerPlafond("0", 10)).toEqual({ valeur: 0, probleme: null, change: true });
    for (const t of ["", "abc", "-1", "100,001", String(PLAFOND_MAX + 1), "1e2", "12,345"]) {
      expect(lirePlafond(t), t).toBeNull();
      expect(controlerPlafond(t, 10), t).toEqual({ valeur: null, probleme: "Indiquez un plafond de 0 à 100 dollars, au centime près.", change: false });
    }
    expect(plafondEnSaisie(10)).toBe("10");
    expect(plafondEnSaisie(12.5)).toBe("12,5");
    expect(lirePlafond(plafondEnSaisie(12.5))).toBe(12.5);
  });

  it("confirment le plafond en mots, et préviennent quand la dépense l'atteint déjà", () => {
    const vie = VIE();
    expect(confirmationDuPlafond(vie, 15).map(sp)).toEqual(["Le plafond passera de 10 $ à 15 $ par mois."]);
    expect(confirmationDuPlafond(vie, 0.25).map(sp)).toEqual(["Le plafond passera de 10 $ à 0,25 $ par mois.", "La dépense du mois, 0,42 $, l'atteint déjà : plus aucune nouvelle bulle avant le 1er du mois prochain."]);
    expect(confirmationDuPlafond(vie, 0).length).toBe(2);
  });

  it("disent ce que fait le second clic, couper ou remettre, avec le geste inverse", () => {
    expect(confirmationDesBulles(true)).toContain("« Remettre les bulles » les rendra.");
    expect(confirmationDesBulles(false)).toContain("de nouveau appelé");
    for (const t of [confirmationDesBulles(true), confirmationDesBulles(false), etatDesBulles(VIE()), PLAFOND_ATTEINT]) expect(t).not.toMatch(/[<>=÷%→]/);
  });
});

describe("le dessin de l'onglet Village : une couleur et son mot, une jauge", () => {
  it("écrit la dépense en trois morceaux qui, bout à bout, font la phrase", () => {
    const vie = VIE();
    const morceaux = depenseEnMorceaux(vie);
    expect(morceaux.map(sp)).toEqual(["Dépense du mois : ", "0,42 $", " sur un plafond de 10 $."]);
    expect(morceaux.join("")).toBe(phraseDeLaDepense(vie));
    const cher = { ...vie, plafond: 12.5, depense: { ...vie.depense, cout: 0.0012 } };
    expect(depenseEnMorceaux(cher).join("")).toBe(phraseDeLaDepense(cher));
    expect(sp(phraseDeLaDepense(cher))).toBe("Dépense du mois : moins de 0,01 $ sur un plafond de 12,50 $.");
  });

  it("donne aux bulles une couleur et son mot : coupées avant tout, puis le plafond, sinon permises", () => {
    expect(pastilleDesBulles({ bulles: true, plafond_atteint: false })).toEqual({ ton: "ok", mot: "Permises" });
    expect(pastilleDesBulles({ bulles: true, plafond_atteint: true })).toEqual({ ton: "warn", mot: "Plafond atteint" });
    expect(pastilleDesBulles({ bulles: false, plafond_atteint: false })).toEqual({ ton: "danger", mot: "Coupées" });
    expect(pastilleDesBulles({ bulles: false, plafond_atteint: true })).toEqual({ ton: "danger", mot: "Coupées" });
  });

  it("mesure la jauge de la dépense sur le plafond, sans jamais la dire pleine à la place du serveur", () => {
    const vie = VIE();
    const avec = (cout: number, plafond: number, atteint = false) => partDuPlafond({ plafond, plafond_atteint: atteint, depense: { cout } });
    expect(partDuPlafond(vie)).toBeCloseTo(4.235, 6);
    expect(avec(5, 10)).toBe(50);
    expect(avec(0, 10)).toBe(0);
    // Une dépense infime garde un trait ; le serveur seul dit le plafond atteint.
    expect(avec(0.0001, 100)).toBe(1);
    expect(avec(9.999, 10)).toBe(99);
    expect(avec(12, 10)).toBe(99);
    expect(avec(10, 10, true)).toBe(100);
    // Un plafond de 0 dollar : atteint d'après le serveur, plein ; sinon rien à mesurer.
    expect(avec(0, 0, true)).toBe(100);
    expect(avec(0, 0)).toBe(0);
    expect(avec(1, 0)).toBe(0);
  });

  it("donne au formulaire une couleur et son mot : à corriger, modifié, en vigueur", () => {
    expect(etatDuFormulaire(false, 0)).toEqual({ ton: "ok", mot: "En vigueur" });
    expect(etatDuFormulaire(true, 0)).toEqual({ ton: "warn", mot: "Modifié, pas enregistré" });
    expect(etatDuFormulaire(true, 2)).toEqual({ ton: "danger", mot: "À corriger" });
    for (const mot of [etatDuFormulaire(true, 0).mot, etatDuFormulaire(true, 1).mot, pastilleDesBulles({ bulles: true, plafond_atteint: true }).mot]) expect(mot).not.toMatch(/[<>=÷%→]/);
  });
});
