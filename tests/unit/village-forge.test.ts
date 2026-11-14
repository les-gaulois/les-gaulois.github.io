import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES, errorMessage } from "../../src/lib/compte/errors";
import { PRIX_GRAVURE, type RefusForge } from "../../src/lib/village/contrat";
import {
  MESSAGES_DE_LA_FORGE,
  assezDeStateres,
  compagnieEnMots,
  estGravable,
  jourAParis,
  jourEnMots,
  lireMaForge,
  lirePlaques,
  messageDeLaForge,
  plaqueDe,
  pointsEnMots,
  texteDeLaPlaque,
} from "../../src/lib/village/forge";

// Sous Windows, Git rend les fichiers avec des fins de ligne CRLF : les motifs ci-dessous lisent des « \n ».
const lire = (nom: string) => readFileSync(`supabase/migrations/${nom}.sql`, "utf8").replace(/\r\n/g, "\n");
const NOM = "20261114001000_village_forge";
const FORGE = lire(NOM);
/** Le corps d'une fonction d'une migration, de son `create` au `$$;` qui la ferme. */
const fonction = (texte: string, nom: string) => {
  const debut = texte.indexOf(`create or replace function ${nom}(`);
  expect(debut, nom).toBeGreaterThanOrEqual(0);
  return texte.slice(debut, texte.indexOf("$$;\n", debut) + 4);
};

describe("le texte de la plaque", () => {
  it("écrit l'exemple du pilote", () => {
    expect(texteDeLaPlaque({ jour: "2026-11-12", gaulois: 4, points: 2.3333333333333335 })).toBe("12 novembre, à quatre, 2,33 points rapportés");
  });

  it("écrit le jour en français, le premier du mois compris", () => {
    expect(jourEnMots("2026-11-01")).toBe("1er novembre");
    expect(jourEnMots("2026-08-15")).toBe("15 août");
    expect(jourEnMots("2027-02-28")).toBe("28 février");
    expect(jourEnMots("2026-12-31")).toBe("31 décembre");
    expect(jourEnMots("2026-02-30")).toBeNull();
    expect(jourEnMots("12 novembre")).toBeNull();
  });

  it("dit le nombre de Gaulois en mots jusqu'à vingt, puis en chiffres", () => {
    expect(compagnieEnMots(1)).toBe("seul");
    expect(compagnieEnMots(2)).toBe("à deux");
    expect(compagnieEnMots(4)).toBe("à quatre");
    expect(compagnieEnMots(17)).toBe("à dix-sept");
    expect(compagnieEnMots(20)).toBe("à vingt");
    expect(compagnieEnMots(23)).toBe("à 23");
    expect(compagnieEnMots(0)).toBeNull();
    expect(compagnieEnMots(2.5)).toBeNull();
  });

  it("arrondit les points à deux décimales comme le serveur, sans zéro inutile, au singulier sous 2", () => {
    expect(pointsEnMots(2.3333333333333335)).toBe("2,33 points rapportés");
    expect(pointsEnMots(1.5)).toBe("1,5 point rapporté");
    expect(pointsEnMots(2)).toBe("2 points rapportés");
    expect(pointsEnMots(1)).toBe("1 point rapporté");
    expect(pointsEnMots(10.1)).toBe("10,1 points rapportés");
    // Une demie vers le haut, sur l'écriture décimale du nombre (celle que le serveur reçoit) : 1,005 donne 1,01.
    expect(pointsEnMots(1.005)).toBe("1,01 point rapporté");
    expect(pointsEnMots(2.675)).toBe("2,68 points rapportés");
    expect(pointsEnMots(1.995)).toBe("2 points rapportés");
    expect(pointsEnMots(1.994)).toBe("1,99 point rapporté");
    expect(pointsEnMots(0.05)).toBe("0,05 point rapporté");
    expect(pointsEnMots(999.995)).toBe("1000 points rapportés");
  });

  it("ne dit jamais « 0 point » pour une partie qui en a rapporté", () => {
    expect(pointsEnMots(0.004)).toBe("moins de 0,01 point rapporté");
    expect(pointsEnMots(1e-7)).toBe("moins de 0,01 point rapporté");
    expect(pointsEnMots(0.005)).toBe("0,01 point rapporté");
    expect(pointsEnMots(0)).toBeNull();
    expect(pointsEnMots(-1)).toBeNull();
    expect(pointsEnMots(Number.NaN)).toBeNull();
    expect(pointsEnMots(1000)).toBeNull();
  });

  it("ne garde aucun signe à la place d'un mot", () => {
    expect(texteDeLaPlaque({ jour: "2026-11-01", gaulois: 25, points: 0.004 })).toBe("1er novembre, à 25, moins de 0,01 point rapporté");
    expect(texteDeLaPlaque({ jour: "2026-11-12", gaulois: 4, points: 2.33 })).not.toMatch(/[<>=÷×%]/);
    expect(texteDeLaPlaque({ jour: "pas un jour", gaulois: 4, points: 2 })).toBeNull();
  });

  it("prend le jour à Paris, changements d'heure compris", () => {
    expect(jourAParis("2026-11-11T23:30:00Z")).toBe("2026-11-12");
    expect(jourAParis("2026-11-11T22:59:59Z")).toBe("2026-11-11");
    expect(jourAParis("2026-07-14T21:59:00Z")).toBe("2026-07-14");
    expect(jourAParis("2026-07-14T22:00:00Z")).toBe("2026-07-15");
    expect(jourAParis("2026-10-24T22:00:00Z")).toBe("2026-10-25");
    expect(jourAParis("hier")).toBeNull();
  });

  it("emploie les mêmes mots que le serveur", () => {
    const tableau = (corps: string) => [...corps.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    const mois = tableau(fonction(FORGE, "internal.forge_jour").slice(fonction(FORGE, "internal.forge_jour").indexOf("array[")));
    expect(mois).toHaveLength(12);
    mois.forEach((nom, i) => expect(jourEnMots(`2026-${String(i + 1).padStart(2, "0")}-15`)).toBe(`15 ${nom}`));
    const compagnie = fonction(FORGE, "internal.forge_compagnie");
    const nombres = tableau(compagnie.slice(compagnie.indexOf("array["), compagnie.indexOf("])")));
    expect(nombres).toHaveLength(19);
    nombres.forEach((mot, i) => expect(compagnieEnMots(i + 2)).toBe(`à ${mot}`));
    expect(compagnie).toContain("when p_gaulois = 1 then 'seul'");
    expect(fonction(FORGE, "internal.forge_points")).toContain("'moins de 0,01 point rapporté'");
    expect(fonction(FORGE, "internal.forge_points")).toContain("when round(p_points, 2) >= 2 then ' points rapportés' else ' point rapporté' end");
    expect(fonction(FORGE, "internal.forge_jour")).toContain("then '1er'");
    expect(fonction(FORGE, "internal.forge_plaque")).toContain("internal.forge_jour(p_jour) || ', ' || internal.forge_compagnie(p_gaulois) || ', ' || internal.forge_points(p_points)");
  });
});

describe("le prix de la gravure", () => {
  it("est le même au site et au serveur", () => {
    expect(PRIX_GRAVURE).toBe(150);
    expect(FORGE).toContain(`create or replace function internal.forge_prix() returns integer\nlanguage sql immutable set search_path = public, pg_temp as $$ select ${PRIX_GRAVURE} $$;`);
  });

  it("se vérifie au moment de graver, et se débite au journal des statères", () => {
    const graver = fonction(FORGE, "public.graver_objet");
    expect(graver).toContain("if p_prix_vu is distinct from v_prix then perform internal.fail('prix_change'); end if;");
    expect(graver).toContain("perform internal.village_debiter(v_uid, 'gravure', v_prix, p_emplacement || '/' || p_objet);");
    expect(graver.indexOf("fail('prix_change')")).toBeLessThan(graver.indexOf("village_debiter"));
    expect(graver.indexOf("fail('deja_grave')")).toBeLessThan(graver.indexOf("village_debiter"));
  });
});

describe("la lecture de la forge", () => {
  const plaque = { jour: "2026-11-12", gaulois: 4, points: 2.3333333333333335, texte: "12 novembre, à quatre, 2,33 points rapportés", grave_le: "2026-11-14T13:00:00+00:00" };
  const reponse = {
    ok: true,
    prix: 150,
    solde: 420,
    peut_graver: true,
    plaques_vues: false,
    parties: [
      { partie: "AbCd1234", debut: "2026-11-12T20:30:00+00:00", jour: "2026-11-12", gaulois: 4, points: 2.3333333333333335, texte: "12 novembre, à quatre, 2,33 points rapportés" },
      { partie: "pas une partie !", debut: "2026-11-12T20:30:00+00:00", jour: "2026-11-12", gaulois: 4, points: 1, texte: "x" },
      { partie: "EfGh5678", debut: "2026-11-11T23:30:00+00:00", jour: "2026-11-12", gaulois: 1, points: 1.5 },
    ],
    objets: [
      { emplacement: "arme", objet: "gourdin", porte: true, gravure: plaque },
      { emplacement: "tete", objet: "bonnet", porte: false, gravure: null },
      { emplacement: "peau", objet: "claire", porte: true, gravure: null },
      { emplacement: "tete", objet: "inconnu", porte: false, gravure: null },
      { emplacement: "haut", objet: "tunique", porte: true, gravure: { jour: "hier" } },
    ],
  };

  it("lit une réponse du serveur, et ignore ce qui ne se lit pas", () => {
    const forge = lireMaForge(reponse);
    expect(forge).not.toBeNull();
    expect(forge!.prix).toBe(150);
    expect(forge!.solde).toBe(420);
    expect(forge!.peut_graver).toBe(true);
    expect(forge!.plaques_vues).toBe(false);
    expect(forge!.parties.map((p) => p.partie)).toEqual(["AbCd1234", "EfGh5678"]);
    // Sans texte du serveur, la même règle l'écrit.
    expect(forge!.parties[1]!.texte).toBe("12 novembre, seul, 1,5 point rapporté");
    expect(forge!.objets.map((o) => `${o.emplacement}/${o.objet}`)).toEqual(["arme/gourdin", "tete/bonnet", "haut/tunique"]);
    expect(forge!.objets[0]!.gravure).toEqual(plaque);
    // Une plaque illisible : l'objet reste, sans plaque.
    expect(forge!.objets[2]!.gravure).toBeNull();
  });

  it("refuse une réponse sans prix ou sans solde : pas de données n'est pas zéro", () => {
    expect(lireMaForge(null)).toBeNull();
    expect(lireMaForge({ ...reponse, ok: false })).toBeNull();
    expect(lireMaForge({ ...reponse, prix: undefined })).toBeNull();
    expect(lireMaForge({ ...reponse, prix: 0 })).toBeNull();
    expect(lireMaForge({ ...reponse, solde: -1 })).toBeNull();
    expect(lireMaForge({ ...reponse, solde: "420" })).toBeNull();
    expect(lireMaForge({ ok: true, prix: 150, solde: 0 })).toEqual({ ok: true, prix: 150, solde: 0, peut_graver: false, plaques_vues: false, parties: [], objets: [] });
  });

  it("dit si le solde suffit", () => {
    expect(assezDeStateres({ solde: 150, prix: 150 })).toBe(true);
    expect(assezDeStateres({ solde: 149, prix: 150 })).toBe(false);
  });

  it("lit les plaques de la place et du vestiaire, l'objet et le texte seulement", () => {
    const plaques = lirePlaques([
      { emplacement: "arme", objet: "gourdin", texte: " 12 novembre, à quatre, 2,33 points rapportés " },
      { emplacement: "yeux", objet: "vifs", texte: "x" },
      { emplacement: "tete", objet: "bonnet", texte: "" },
      "rien",
    ]);
    expect(plaques).toEqual([{ emplacement: "arme", objet: "gourdin", texte: "12 novembre, à quatre, 2,33 points rapportés" }]);
    expect(lirePlaques(undefined)).toEqual([]);
    expect(lirePlaques({ arme: "gourdin" })).toEqual([]);
    expect(plaqueDe(plaques, { emplacement: "arme", objet: "gourdin" })).toBe("12 novembre, à quatre, 2,33 points rapportés");
    expect(plaqueDe(plaques, { emplacement: "arme", objet: "glaive" })).toBeNull();
  });

  it("ne propose que des objets à graver : ni le corps, ni le visage, ni une case « rien »", () => {
    expect(estGravable({ emplacement: "arme", objet: "gourdin" })).toBe(true);
    expect(estGravable({ emplacement: "tete", objet: "bandeau" })).toBe(true);
    expect(estGravable({ emplacement: "arme", objet: "aucune" })).toBe(false);
    expect(estGravable({ emplacement: "pieds", objet: "nus" })).toBe(false);
    expect(estGravable({ emplacement: "peau", objet: "claire" })).toBe(false);
    expect(estGravable({ emplacement: "yeux", objet: "vifs" })).toBe(false);
    expect(estGravable({ emplacement: "arme", objet: "toString" })).toBe(false);
  });
});

describe("les refus de la forge", () => {
  const REFUS: RefusForge[] = ["not_validated", "no_gaulois", "objet_non_gravable", "pas_possede", "partie_inconnue", "deja_grave", "prix_change", "solde_insuffisant", "pas_grave"];

  it("ont chacun leur message, en français, sans signe à la place d'un mot", () => {
    expect(Object.keys(MESSAGES_DE_LA_FORGE).sort()).toEqual([...REFUS].sort());
    for (const code of REFUS) {
      const message = messageDeLaForge(code);
      expect(message, code).toBeTruthy();
      expect(message!.length, code).toBeGreaterThan(15);
      expect(message, code).not.toMatch(/[<>=÷×%]/);
    }
    expect(new Set(REFUS.map((code) => messageDeLaForge(code))).size).toBe(REFUS.length);
    expect(messageDeLaForge("network")).toBeNull();
    expect(messageDeLaForge("toString")).toBeNull();
  });

  it("sont tous dits par le serveur, et le serveur n'en dit pas d'autres", () => {
    const codes = new Set<string>();
    for (const nom of ["public.get_ma_forge", "public.graver_objet", "public.effacer_gravure", "internal.forge_titulaire"]) {
      for (const m of fonction(FORGE, nom).matchAll(/internal\.(?:fail|error_json)\('([a-z_]+)'/g)) codes.add(m[1]!);
    }
    // Ceux de l'appelant qui achète (internal.village_acheteur, migration 20261113001900) et du débit (solde_insuffisant).
    expect(fonction(FORGE, "public.graver_objet")).toContain("v_uid := internal.village_acheteur();");
    for (const code of ["not_validated", "no_gaulois", "solde_insuffisant"]) codes.add(code);
    const communs = ["not_signed_in", "suspended", "rate_limited"];
    expect([...codes].filter((c) => !communs.includes(c)).sort()).toEqual([...REFUS].sort());
    for (const code of codes) expect(errorMessage(code), code).not.toBe("Une erreur inattendue est survenue.");
  });

  it("gardent dans errors.ts les mots des refus qui n'existent qu'à la forge, et au marché le refus d'un objet gravé", () => {
    for (const code of ["objet_non_gravable", "partie_inconnue", "deja_grave", "pas_grave", "pas_possede"] as const) {
      expect(ERROR_MESSAGES[code], code).toBe(MESSAGES_DE_LA_FORGE[code]);
    }
    expect(ERROR_MESSAGES["objet_grave"]).toMatch(/effacez-la d'abord/);
    expect(fonction(FORGE, "public.mettre_en_vente")).toContain("perform internal.fail('objet_grave');");
  });
});

describe("la migration de la forge", () => {
  /** La dernière migration avant la forge qui (re)définit une fonction. */
  const derniereAvant = (nom: string) =>
    readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql") && f < `${NOM}.sql`)
      .sort()
      .filter((f) => lire(f.replace(/\.sql$/, "")).includes(`create or replace function ${nom}(`))
      .at(-1)
      ?.replace(/\.sql$/, "");

  // Chaque fonction remplacée l'est depuis sa dernière version, mot pour mot, avec ses seuls ajouts.
  const AJOUTS: Record<string, { depuis: string; ajouts: string[] }> = {
    "public.mettre_en_vente": {
      depuis: "20261113002000_village_marche_et_place",
      ajouts: [
        "    -- Ajout de 20261114001000 : le dernier exemplaire d'un objet gravé à la forge reste à son propriétaire.\n    if v_ligne.quantite = 1 and exists (select 1 from internal.gaulois_gravures gr where gr.user_id = v_uid and gr.emplacement = p_emplacement and gr.objet = p_objet) then\n      perform internal.fail('objet_grave');\n    end if;\n",
      ],
    },
    "public.get_mon_gaulois": {
      depuis: "20261113001700_village_des_gaulois_vestiaire",
      ajouts: [",\n      -- Ajout de 20261114001000 : les plaques de la forge sur ses objets.\n      'gravures', internal.forge_mes_plaques(v_uid)"],
    },
    "public.get_village": {
      depuis: "20261113002300_village_vie",
      ajouts: [
        ",\n          -- Ajout de 20261114001000 : les plaques de la forge sur ce qu'il porte, pour lui toujours, pour les autres\n          -- seulement avec un pseudo public (la règle de partie_le).\n          'gravures', case when g.user_id = v_uid or internal.member_pseudo(g.user_id) is not null\n            then internal.forge_plaques_portees(g.user_id, g.tenue) else '[]'::jsonb end",
      ],
    },
    "public.get_village_economie": {
      depuis: "20261113002100_village_direction",
      ajouts: [
        "\n  -- Ajout de 20261114001000 : les gravures de la forge.\n  v_graves boolean;",
        ",\n    -- Ajout de 20261114001000 : les comptes qui ont gravé à la forge, et ce qu'ils y ont dépensé.\n    count(distinct m.user_id) filter (where m.nature = 'gravure') as graveurs,\n    count(distinct m.user_id) filter (where m.nature = 'gravure' and m.cree_le >= v_depuis) as graveurs_30,\n    count(distinct m.user_id) filter (where m.nature = 'gravure' and m.cree_le < v_depuis) as graveurs_avant,\n    coalesce(-(sum(m.montant) filter (where m.nature = 'gravure')), 0) as gravures,\n    coalesce(-(sum(m.montant) filter (where m.nature = 'gravure' and m.cree_le >= v_depuis)), 0) as gravures_30",
        "\n  -- Ajout de 20261114001000 : distribués, moins dépensés, moins gravures, égale en circulation. Les gravures cachées (de 1 à\n  -- 4 comptes), la circulation l'est aussi : sinon distribués moins dépensés moins circulation les redonnerait. La\n  -- circulation cachée, les distribués et les dépensés laissent deux inconnues : rien de plus à cacher.\n  v_graves := internal.village_passe(v_j.graveurs);\n  if not v_graves then v_circule := false; end if;",
        "\n    -- Ajout de 20261114001000 : les statères dépensés à la forge, sous le même seuil.\n    'gravures', jsonb_build_object('total', case when v_graves then v_j.gravures end, 'trente_jours', case when internal.village_passe(v_j.graveurs_30) and internal.village_passe(v_j.graveurs_avant) then v_j.gravures_30 end),",
      ],
    },
  };

  for (const [nom, { depuis, ajouts }] of Object.entries(AJOUTS)) {
    it(`reprend ${nom} de sa dernière version, sans rien perdre`, () => {
      expect(derniereAvant(nom)).toBe(depuis);
      const nouvelle = fonction(FORGE, nom);
      let sans = nouvelle;
      for (const ajout of ajouts) {
        expect(sans.split(ajout), ajout.slice(0, 80)).toHaveLength(2);
        sans = sans.split(ajout).join("");
      }
      expect(sans).toBe(fonction(lire(depuis), nom));
    });
  }

  it("garde les droits de chaque fonction remplacée, et ferme les nouvelles aux visiteurs", () => {
    for (const signature of ["mettre_en_vente(text, text, numeric)", "get_mon_gaulois()", "get_village()", "get_village_economie()", "get_ma_forge()", "graver_objet(text, text, text, integer)", "effacer_gravure(text, text)"]) {
      expect(FORGE).toContain(`revoke all on function public.${signature} from public, anon, authenticated;\ngrant execute on function public.${signature} to authenticated;`);
    }
    for (const signature of ["forge_prix()", "forge_jour(date)", "forge_compagnie(integer)", "forge_points(numeric)", "forge_plaque(date, integer, numeric)", "forge_titulaire()", "forge_objets(uuid)", "forge_mes_plaques(uuid)", "forge_plaques_portees(uuid, jsonb)", "forge_json(uuid)"]) {
      expect(FORGE).toContain(`revoke all on function internal.${signature} from public, anon, authenticated;`);
      expect(FORGE).not.toContain(`grant execute on function internal.${signature}`);
    }
    expect(FORGE).not.toMatch(/grant [^;]* to (anon|public)\b/);
    expect(FORGE).toContain("alter table internal.gaulois_gravures enable row level security;\nrevoke all on table internal.gaulois_gravures from public, anon, authenticated;");
    // Chaque fonction a son chemin de recherche.
    const fonctions = FORGE.match(/create or replace function [^\n]*\nlanguage [^\n]*/g) ?? [];
    // Treize ajoutées, quatre remplacées.
    expect(fonctions).toHaveLength(17);
    for (const f of fonctions) expect(f, f).toContain("set search_path = public, pg_temp as $$");
  });

  it("limite les gestes et la lecture de la forge", () => {
    for (const nom of ["public.get_ma_forge", "public.graver_objet", "public.effacer_gravure", "public.get_village", "public.mettre_en_vente"]) {
      expect(fonction(FORGE, nom), nom).toContain("if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;");
    }
  });

  it("n'ajoute que : ni table ni colonne retirée, ni donnée effacée hors de l'effacement d'une plaque et de la mise en vente", () => {
    expect(FORGE).not.toMatch(/\bdrop (table|column|function)\b|\btruncate\b|alter table [^;]* drop/i);
    expect([...FORGE.matchAll(/\bdelete from ([\w.]+)/g)].map((m) => m[1])).toEqual(["internal.gaulois_gravures", "internal.gaulois_inventaire"]);
    expect(fonction(FORGE, "public.effacer_gravure")).toContain("delete from internal.gaulois_gravures gr where gr.user_id = v_uid and gr.emplacement = p_emplacement and gr.objet = p_objet;");
    // Le journal des statères n'est jamais modifié : on y ajoute des lignes, le solde suit.
    expect(FORGE).not.toMatch(/update internal\.stateres_(mouvements|soldes)|insert into internal\.stateres_/);
    // La sauvegarde ne change pas : le jour et les points d'une partie désigneraient le joueur OpenFront d'un membre.
    expect(FORGE.replace(/--.*$/gm, "")).not.toContain("export_site");
    // Rien au journal de l'encadrement.
    expect(FORGE).not.toMatch(/log_admin|admin_log/);
  });

  it("ne garde de la partie que son jour, son nombre de Gaulois et ses points", () => {
    const table = FORGE.slice(FORGE.indexOf("create table if not exists internal.gaulois_gravures ("), FORGE.indexOf(");\n", FORGE.indexOf("create table if not exists internal.gaulois_gravures (")));
    const colonnes = [...table.matchAll(/^ {2}([a-z_]+) [a-z]/gm)].map((m) => m[1]).filter((c) => c !== "primary" && c !== "foreign");
    expect(colonnes).toEqual(["user_id", "emplacement", "objet", "jour", "gaulois", "points", "grave_le"]);
    expect(table).toContain("references public.profiles (user_id) on delete cascade");
    expect(table).toContain("emplacement in ('tete', 'haut', 'bas', 'pieds', 'arme')");
  });

  it("ne montre sur la place que ce que le Gaulois porte, et pour un autre seulement avec un pseudo public", () => {
    const portees = fonction(FORGE, "internal.forge_plaques_portees");
    expect(portees).toContain("where gr.user_id = p_uid and p_tenue ->> gr.emplacement = gr.objet");
    expect(portees).not.toMatch(/inventaire|solde|stateres/);
    expect(fonction(FORGE, "public.get_village")).toContain("case when g.user_id = v_uid or internal.member_pseudo(g.user_id) is not null");
    // La place ne dit pas qui est anonyme : une liste vide, comme pour qui n'a rien gravé.
    expect(fonction(FORGE, "public.get_village")).toContain("else '[]'::jsonb end");
    // Seules les fonctions du propriétaire lisent toutes ses plaques.
    expect(fonction(FORGE, "public.get_mon_gaulois")).toContain("internal.forge_mes_plaques(v_uid)");
    expect(fonction(FORGE, "internal.forge_json")).not.toContain("member_pseudo(g.");
  });

  it("ne grave qu'une partie du journal de l'appelant, sur un objet qu'il a", () => {
    const graver = fonction(FORGE, "public.graver_objet");
    expect(graver).toContain("where m.user_id = v_uid and m.nature = 'victoire' and m.partie = p_partie;");
    expect(graver.indexOf("perform internal.village_verrou(v_uid);")).toBeLessThan(graver.indexOf("internal.forge_objets(v_uid)"));
    // La fin des offres d'abord : le verrou du marché avant celui du compte.
    expect(graver.indexOf("perform internal.marche_expirer();")).toBeLessThan(graver.indexOf("perform internal.village_verrou(v_uid);"));
    expect(fonction(FORGE, "internal.forge_objets")).toContain("where o.emplacement in ('tete', 'haut', 'bas', 'pieds', 'arme') and o.rarete is not null");
  });
});
