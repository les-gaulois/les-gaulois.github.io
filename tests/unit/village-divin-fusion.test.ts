import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES } from "../../src/lib/compte/errors";
import { EMPLACEMENTS_OBJETS, OBJETS, ORDRE_RARETES, ORDRE_RARETES_DES_OBJETS, RARETES_DES_OBJETS, RARETE_DIVINE, type Emplacement, type Rarete } from "../../src/lib/gaulois";
import { chanceDeLObjet, chancesEffectives, lireMaBoutique, lirePochette, objetPayant, objetsDeLaPochette, prixDeLObjet } from "../../src/lib/village/boutique";
import { CHANCES_DU_TIRAGE, CHANCES_POCHETTE, LEGENDAIRES_POUR_UN_DIVIN, OBJETS_POUR_UNE_FUSION, PRIX_PAR_RARETE, PRIX_POCHETTE, chancesAvecLeDivin, type FusionDeLaForge, type ObjetAFondre } from "../../src/lib/village/contrat";
import { objetDuMarche } from "../../src/lib/village/ecran-marche";
import { lireFusionReponse, lireMaForge } from "../../src/lib/village/forge";
import {
  MESSAGES_DE_LA_FUSION,
  RARETES_A_FONDRE,
  creusetAJour,
  creusetPlein,
  dansLeCreuset,
  demandeDeFusion,
  libresParRarete,
  lireFusion,
  lireRecu,
  messageDeLaFusion,
  objetsDeLaRarete,
  poser,
  rareteDeDepart,
  rareteDuCreuset,
  rareteSuivante,
  regleDeLaRarete,
  reprendre,
  resteAPoser,
  type Creuset,
} from "../../src/lib/village/fusion";
import { rangerLeRayon } from "../../src/lib/village/vestiaire-rayons";
import { ENSEMBLES_DIVINS, LOT_DIVIN, ensembleDeLaPiece } from "../../supabase/functions/code-discord/garde-robe/divin";

// Le divin et la fusion à la forge (16 novembre 2026). Les objets nommés ici sont pris dans le catalogue : aucun n'est
// écrit en dur, sauf ceux du lot divin, lus dans son fichier.

// Sous Windows, Git rend les fichiers avec des fins de ligne CRLF : les motifs ci-dessous lisent des « \n ».
const lire = (nom: string): string => readFileSync(`supabase/migrations/${nom}.sql`, "utf8").replace(/\r\n/g, "\n");
const SQL = lire("20261116000300_divin_et_fusion");
const BOUTIQUE_SQL = lire("20261113001900_village_boutique");
const MARCHE_SQL = lire("20261113002000_village_marche_et_place");
const FORGE_SQL = lire("20261114001000_village_forge");

/** Le texte d'une fonction d'une migration, de « create or replace function » à sa fin. */
function fonction(sql: string, signature: string): string {
  const debut = sql.indexOf(`create or replace function ${signature}`);
  expect(debut, signature).toBeGreaterThanOrEqual(0);
  const fins = ["\nend $$;", "\n$$;"].map((fin) => ({ fin, ou: sql.indexOf(fin, debut) })).filter((f) => f.ou >= 0);
  const premiere = fins.sort((a, b) => a.ou - b.ou)[0]!;
  return sql.slice(debut, premiere.ou + premiere.fin.length);
}

/** Les objets payants d'une rareté dans un emplacement, par identifiant. */
const objetsDe = (emplacement: Emplacement, rarete: Rarete): string[] =>
  Object.entries(OBJETS[emplacement])
    .filter(([, o]) => !o.gratuit && o.rarete === rarete)
    .map(([id]) => id);

const NBSP = String.fromCharCode(0xa0);

/** Les tenues divines retenues, et leur nombre de pièces. */
const TENUES = ["Origine inconnue","Enlèvement","Champignon atomique","Missile humain"];
const NOMBRE = TENUES.length * 5;

const DIVINS = EMPLACEMENTS_OBJETS.flatMap((emplacement) =>
  Object.entries(OBJETS[emplacement])
    .filter(([, o]) => o.rarete === RARETE_DIVINE)
    .map(([id]) => ({ emplacement, id })),
);

describe("le divin", () => {
  it("est la sixième rareté des objets, au-dessus du légendaire, sans être une rareté de la boutique", () => {
    // Le légendaire de saison (21 novembre 2026) s'est glissé entre le légendaire et le divin.
    expect(ORDRE_RARETES_DES_OBJETS).toEqual([...ORDRE_RARETES, "saison", "divin"]);
    expect(RARETES_DES_OBJETS.divin).toEqual({ nom: "Divin", rang: 6 });
    expect(ORDRE_RARETES).not.toContain("divin");
    expect(Object.keys(PRIX_PAR_RARETE)).not.toContain("divin");
  });

  it("a des tenues de cinq pièces, une par emplacement, et rien d'autre", () => {
    // Les tenues choisies par le pilote sur planches (16 novembre 2026).
    expect(ENSEMBLES_DIVINS.map((e) => e.nom)).toEqual(TENUES);
    expect(LOT_DIVIN).toHaveLength(NOMBRE);
    expect(DIVINS).toHaveLength(NOMBRE);
    for (const ensemble of ENSEMBLES_DIVINS) {
      expect(Object.keys(ensemble.pieces).sort()).toEqual([...EMPLACEMENTS_OBJETS].sort());
      for (const emplacement of EMPLACEMENTS_OBJETS) {
        const id = ensemble.pieces[emplacement];
        expect(OBJETS[emplacement][id], `${emplacement}/${id}`).toMatchObject({ rarete: "divin", gratuit: false });
        expect(ensembleDeLaPiece(emplacement, id)?.id).toBe(ensemble.id);
      }
    }
    // Chaque objet divin du catalogue est d'une tenue, et d'une seule.
    for (const { emplacement, id } of DIVINS) expect(ENSEMBLES_DIVINS.filter((e) => e.pieces[emplacement] === id), id).toHaveLength(1);
    expect(new Set(LOT_DIVIN.map((o) => o.nom)).size).toBe(NOMBRE);
    expect(ensembleDeLaPiece("tete", "bandeau")).toBeNull();
  });

  it("sort de la pochette dix fois moins souvent que le légendaire, sur la part du commun", () => {
    expect(LEGENDAIRES_POUR_UN_DIVIN).toBe(10);
    expect(CHANCES_DU_TIRAGE.divin).toBeCloseTo(CHANCES_POCHETTE.legendaire / 10, 12);
    expect(CHANCES_DU_TIRAGE.divin).toBeCloseTo(0.2, 12);
    expect(CHANCES_DU_TIRAGE.commun).toBeCloseTo(CHANCES_POCHETTE.commun - 0.2, 12);
    for (const rarete of ORDRE_RARETES.filter((r) => r !== "commun")) expect(CHANCES_DU_TIRAGE[rarete]).toBe(CHANCES_POCHETTE[rarete]);
    expect(ORDRE_RARETES_DES_OBJETS.reduce((s, r) => s + CHANCES_DU_TIRAGE[r], 0)).toBeCloseTo(100, 9);
    // Jamais plus que la part du commun, jamais moins que zéro.
    expect(chancesAvecLeDivin({ commun: 1, "peu-commun": 9, epique: 0, mystique: 0, legendaire: 90 })).toMatchObject({ commun: 0, divin: 1 });
    expect(chancesAvecLeDivin(CHANCES_POCHETTE, -3)).toEqual({ ...CHANCES_POCHETTE, saison: 0, divin: 0 });
    // Le serveur fait le même calcul.
    expect(fonction(SQL, "internal.village_chance_divine()")).toContain(`least(p.legendaire / ${LEGENDAIRES_POUR_UN_DIVIN}.0, p.commun)`);
    const tirage = fonction(SQL, "internal.village_chances_tirage()");
    expect(tirage).toContain("case when c.rarete = 'commun' then c.chance - internal.village_chance_divine() else c.chance end");
    expect(tirage).toContain("select 'divin', 6, internal.village_chance_divine()");
  });

  it("se partage à égalité entre ses objets, et le tirage fait toujours 100", () => {
    expect(objetsDeLaPochette("divin")).toHaveLength(NOMBRE);
    expect(chancesEffectives(CHANCES_DU_TIRAGE)).toEqual(CHANCES_DU_TIRAGE);
    const { emplacement, id } = DIVINS[0]!;
    expect(chanceDeLObjet(emplacement, id, CHANCES_DU_TIRAGE)).toBeCloseTo(0.2 / NOMBRE, 12);
    const total = ORDRE_RARETES_DES_OBJETS.flatMap((r) => objetsDeLaPochette(r)).reduce((s, ref) => s + chanceDeLObjet(ref.emplacement, ref.objet, CHANCES_DU_TIRAGE), 0);
    expect(total).toBeCloseTo(100, 9);
  });

  it("se lit dans la réponse de la boutique, donnée à part des cinq chances réglées", () => {
    const reponse = { ok: true, solde: 0, peut_acheter: true, prix: PRIX_PAR_RARETE, pochette: { prix: PRIX_POCHETTE, chances: CHANCES_POCHETTE, divin: 0.2 }, inventaire: [] };
    const chances = lireMaBoutique(reponse)?.pochette.chances;
    expect(chances?.divin).toBe(0.2);
    expect(chances?.commun).toBeCloseTo(49.8, 9);
    // Un serveur d'avant le divin n'en dit rien : zéro. Une chance illisible : pas de boutique.
    expect(lireMaBoutique({ ...reponse, pochette: { prix: PRIX_POCHETTE, chances: CHANCES_POCHETTE } })?.pochette.chances).toEqual({ ...CHANCES_POCHETTE, saison: 0, divin: 0 });
    for (const divin of [-1, 101, "0.2", null, Number.NaN]) expect(lireMaBoutique({ ...reponse, pochette: { ...reponse.pochette, divin } }), String(divin)).toBeNull();
    const boutique = fonction(SQL, "public.get_ma_boutique()");
    expect(boutique).toContain("'chances', (select jsonb_object_agg(c.rarete, trim_scale(c.chance)) from internal.village_chances() c),");
    expect(boutique).toContain("'divin', trim_scale(internal.village_chance_divine())");
  });

  it("se possède et sort d'une pochette, mais ne s'achète pas et ne se vend pas", () => {
    for (const { emplacement, id } of DIVINS) {
      expect(objetPayant(emplacement, id)?.rarete, id).toBe("divin");
      expect(prixDeLObjet(emplacement, id, PRIX_PAR_RARETE), id).toBeNull();
      expect(objetDuMarche(emplacement, id), id).toBeNull();
      expect(lirePochette({ ok: true, solde: 0, objet: { emplacement, objet: id, rarete: "divin", double: false } })?.objet.rarete).toBe("divin");
    }
    for (const emplacement of EMPLACEMENTS_OBJETS) {
      expect(rangerLeRayon(OBJETS[emplacement], () => 0).boutique.some(([, o]) => o.rarete === "divin"), emplacement).toBe(false);
      expect(rangerLeRayon(OBJETS[emplacement], () => 1).aMoi.some(([, o]) => o.rarete === "divin"), emplacement).toBe(true);
    }
    // Côté serveur : aucun prix pour le divin, dans aucune migration ; sans prix, l'achat et la vente sont refusés.
    for (const fichier of [BOUTIQUE_SQL, MARCHE_SQL, FORGE_SQL, SQL]) expect(fichier).not.toMatch(/\('divin', \d+\)/);
    expect(SQL).not.toContain("insert into internal.village_prix");
    expect(fonction(MARCHE_SQL, "public.acheter_objet(p_emplacement text, p_objet text, p_prix_vu integer)")).toContain("if v_prix is null then perform internal.fail('unknown_objet'); end if;");
    expect(fonction(FORGE_SQL, "public.mettre_en_vente(p_emplacement text, p_objet text, p_prix numeric)")).toContain("v_plafond is null or p_prix > v_plafond then\n      perform internal.fail('prix_invalide');");
    for (const nom of ["acheter_objet", "mettre_en_vente"]) expect(SQL, nom).not.toContain(`function public.${nom}(`);
  });

  it("est connu du serveur : la rareté admise, et les objets du dessin", () => {
    // La migration du divin ne connaissait pas encore le légendaire de saison (20261121000300).
    expect(SQL).toContain(`check (rarete in (${ORDRE_RARETES_DES_OBJETS.filter((r) => r !== "saison").map((r) => `'${r}'`).join(", ")}));`);
    const bloc = /-- <objets-divins>[^\n]*\ninsert into internal\.gaulois_objets \(emplacement, objet, rarete, gratuit\) values\n([\s\S]*?)\non conflict \(emplacement, objet\) do nothing;\n-- <\/objets-divins>/.exec(SQL)?.[1] ?? "";
    expect(bloc.split("\n")).toEqual(LOT_DIVIN.map((o, i) => `  ('${o.emplacement}', '${o.id}', 'divin', false)${i < LOT_DIVIN.length - 1 ? "," : ""}`));
    for (const o of LOT_DIVIN) expect(o.id).toMatch(/^[a-z][a-z-]{0,39}$/);
  });

  it("ne change ouvrir_pochette que par son tirage, ligne pour ligne", () => {
    const avant = fonction(BOUTIQUE_SQL, "public.ouvrir_pochette(p_prix_vu integer)").split("\n");
    const apres = fonction(SQL, "public.ouvrir_pochette(p_prix_vu integer)").split("\n");
    const rendues = apres.filter((ligne) => !ligne.includes("Changement de 20261116000300")).map((ligne) => ligne.split("internal.village_chances_tirage()").join("internal.village_chances()"));
    expect(rendues).toEqual(avant);
    expect(apres.filter((ligne) => ligne.includes("internal.village_chances_tirage()"))).toHaveLength(2);
    expect(SQL).toContain("grant execute on function public.ouvrir_pochette(integer) to authenticated;");
  });

  it("ne change get_ma_boutique et la lecture de la forge que par leurs ajouts", () => {
    for (const [ancien, signature] of [
      [MARCHE_SQL, "public.get_ma_boutique()"],
      [FORGE_SQL, "internal.forge_json(p_uid uuid)"],
    ] as const) {
      const apres = fonction(SQL, signature);
      const avant = fonction(ancien, signature).split("\n");
      // Chaque ligne d'avant est encore là, à une virgule près sur celle que l'ajout suit.
      for (const ligne of avant) expect(apres.includes(ligne) || apres.includes(`${ligne},`), `${signature} : ${ligne}`).toBe(true);
      expect(apres.split("\n").length).toBeGreaterThan(avant.length);
    }
  });
});

describe("la fusion à la forge", () => {
  it("prend trois objets d'une rareté pour un de la suivante, du commun au légendaire, comme le serveur", () => {
    expect(OBJETS_POUR_UNE_FUSION).toBe(3);
    expect(fonction(SQL, "internal.forge_fusion_nombre()")).toContain(`select ${OBJETS_POUR_UNE_FUSION} `);
    expect(RARETES_A_FONDRE).toEqual(["commun", "peu-commun", "epique", "mystique"]);
    expect(RARETES_A_FONDRE.map(rareteSuivante)).toEqual(["peu-commun", "epique", "mystique", "legendaire"]);
    expect(rareteSuivante("legendaire")).toBeNull();
    const suivante = fonction(SQL, "internal.forge_rarete_suivante(p_rarete text)");
    for (const rarete of RARETES_A_FONDRE) expect(suivante).toContain(`when '${rarete}' then '${rareteSuivante(rarete)}'`);
    // Ni le légendaire ni le divin ne se fondent, et la forge ne fabrique pas de divin.
    expect(suivante).not.toContain("when 'legendaire'");
    expect(suivante).not.toContain("divin");
    expect(regleDeLaRarete("commun", 3)).toBe(`3 objets «${NBSP}Commun${NBSP}» donnent 1 objet «${NBSP}Peu commun${NBSP}», tiré au hasard.`);
    expect(regleDeLaRarete("legendaire", 3)).toBeNull();
  });

  it("coûte plus, aux prix de départ de la boutique, que ce qu'elle donne, et ne touche à aucun statère", () => {
    for (const rarete of RARETES_A_FONDRE) expect(OBJETS_POUR_UNE_FUSION * PRIX_PAR_RARETE[rarete], rarete).toBeGreaterThan(PRIX_PAR_RARETE[rareteSuivante(rarete)!]);
    const fusion = fonction(SQL, "public.fusionner_objets(p_objets jsonb)");
    expect(fusion).not.toContain("village_debiter");
    expect(fusion).not.toContain("stateres_mouvements");
  });

  it("vérifie tout côté serveur, dans l'ordre du contrat, sous le verrou du compte", () => {
    const fusion = fonction(SQL, "public.fusionner_objets(p_objets jsonb)");
    const refus = ["fusion_invalide", "unknown_objet", "raretes_melangees", "rarete_sans_fusion", "pas_possede", "objet_porte", "objet_grave"];
    const places = refus.map((code) => fusion.indexOf(`internal.fail('${code}')`));
    expect(places.every((p) => p >= 0)).toBe(true);
    expect(places).toEqual([...places].sort((a, b) => a - b));
    expect(fusion).toContain("language plpgsql security definer set search_path = public, pg_temp");
    expect(fusion).toContain("if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;");
    expect(fusion.indexOf("v_uid := internal.village_acheteur();")).toBeLessThan(fusion.indexOf("perform internal.village_verrou(v_uid);"));
    expect(fusion.indexOf("perform internal.village_verrou(v_uid);")).toBeLessThan(fusion.indexOf("from internal.gaulois_inventaire"));
    // L'objet reçu : payant, de la rareté suivante, tiré par le générateur du serveur.
    expect(fusion).toContain("where o.rarete = v_suivante and not o.gratuit");
    expect(fusion).toContain("internal.village_hasard()");
    // Les objets donnés partent avant que l'objet reçu n'arrive, et la fusion est gardée.
    expect(fusion.indexOf("delete from internal.gaulois_inventaire")).toBeLessThan(fusion.indexOf("insert into internal.gaulois_inventaire"));
    expect(fusion).toContain("insert into internal.forge_fusions (user_id, rarete, donnes, emplacement, objet)");
    expect(SQL).toContain("revoke all on function public.fusionner_objets(jsonb) from public, anon, authenticated;");
    expect(SQL).toContain("grant execute on function public.fusionner_objets(jsonb) to authenticated;");
    expect(SQL).toContain("alter table internal.forge_fusions enable row level security;");
    expect(SQL).toContain("revoke all on table internal.forge_fusions from public, anon, authenticated;");
    for (const interne of ["village_chance_divine()", "village_chances_tirage()", "forge_fusion_nombre()", "forge_rarete_suivante(text)", "forge_json(uuid)"]) {
      expect(SQL, interne).toContain(`revoke all on function internal.${interne} from public, anon, authenticated;`);
      expect(SQL, interne).not.toContain(`grant execute on function internal.${interne}`);
    }
  });

  const [communA, communB] = objetsDe("tete", "commun") as [string, string];
  const epique = objetsDe("arme", "epique")[0]!;
  const legendaire = objetsDe("tete", "legendaire")[0]!;
  const gratuit = Object.entries(OBJETS.tete).find(([, o]) => o.gratuit && o.dessin)![0];
  const A: ObjetAFondre = { emplacement: "tete", objet: communA, rarete: "commun", quantite: 3, libres: 2 };
  const B: ObjetAFondre = { emplacement: "tete", objet: communB, rarete: "commun", quantite: 1, libres: 1 };
  const E: ObjetAFondre = { emplacement: "arme", objet: epique, rarete: "epique", quantite: 4, libres: 4 };
  const FUSION: FusionDeLaForge = { nombre: 3, objets: [A, B, E] };

  it("lit ce qui peut se fondre : des objets payants du catalogue, à la rareté du catalogue", () => {
    expect(lireFusion(JSON.parse(JSON.stringify(FUSION)))).toEqual(FUSION);
    const lue = lireFusion({
      nombre: 3,
      objets: [
        A,
        { ...A },
        { ...B, rarete: "epique" },
        { emplacement: "tete", objet: gratuit, rarete: "commun", quantite: 1, libres: 1 },
        { emplacement: "tete", objet: legendaire, rarete: "legendaire", quantite: 3, libres: 3 },
        { ...DIVINS[0], objet: DIVINS[0]!.id, rarete: "divin", quantite: 3, libres: 3 },
        { ...E, objet: "inconnu" },
        { ...E, quantite: 0 },
        { ...E, libres: 9 },
        null,
      ],
    });
    // Le doublon, la mauvaise rareté, le gratuit, le légendaire, le divin, l'inconnu et la quantité nulle sont ignorés ;
    // des exemplaires libres illisibles valent zéro.
    expect(lue?.objets).toEqual([A, { ...E, libres: 0 }]);
    for (const illisible of [null, undefined, [], { objets: [] }, { nombre: 1, objets: [] }, { nombre: "3", objets: [] }]) expect(lireFusion(illisible)).toBeNull();
    expect(lireFusion({ nombre: 3 })).toEqual({ nombre: 3, objets: [] });
  });

  it("lit la forge avec ou sans fusion, et la réponse d'une fusion", () => {
    const forge = { ok: true, prix: 150, solde: 12, peut_graver: true, plaques_vues: false, parties: [], objets: [] };
    expect(lireMaForge(forge)?.fusion).toBeNull();
    expect(lireMaForge({ ...forge, fusion: FUSION })?.fusion).toEqual(FUSION);
    const recu = { emplacement: "arme", objet: epique, rarete: "epique", double: true };
    expect(lireRecu(recu)).toEqual(recu);
    for (const faux of [{ ...recu, rarete: "mystique" }, { ...recu, double: "oui" }, { ...recu, objet: "inconnu" }, { ...recu, emplacement: "tete", objet: gratuit }, null]) expect(lireRecu(faux)).toBeNull();
    expect(lireFusionReponse({ ok: true, recu, forge: { ...forge, fusion: FUSION } })).toEqual({ ok: true, recu, forge: { ...forge, fusion: FUSION } });
    expect(lireFusionReponse({ ok: true, recu, forge: { ...forge, solde: -1 } })).toBeNull();
    expect(lireFusionReponse({ ok: true, recu: null, forge })).toBeNull();
    expect(lireFusionReponse({ ok: false, error: "pas_possede" })).toBeNull();
  });

  it("remplit le creuset sans dépasser ce qui est libre, sans mélanger les raretés", () => {
    let creuset: Creuset = [];
    creuset = poser(creuset, A, FUSION);
    creuset = poser(creuset, A, FUSION);
    expect(dansLeCreuset(creuset, A)).toBe(2);
    expect(resteAPoser(creuset, A)).toBe(0);
    // Plus d'exemplaire libre de A, et pas d'épique avec des communs : le creuset ne change pas.
    expect(poser(creuset, A, FUSION)).toBe(creuset);
    expect(poser(creuset, E, FUSION)).toBe(creuset);
    expect(creusetPlein(creuset, FUSION)).toBe(false);
    creuset = poser(creuset, B, FUSION);
    expect(creusetPlein(creuset, FUSION)).toBe(true);
    expect(rareteDuCreuset(creuset)).toBe("commun");
    expect(demandeDeFusion(creuset)).toEqual([
      { emplacement: "tete", objet: communA },
      { emplacement: "tete", objet: communA },
      { emplacement: "tete", objet: communB },
    ]);
    // Plein : rien ne s'ajoute.
    expect(poser([E, E, E], E, FUSION)).toHaveLength(3);
    expect(reprendre(creuset, 0)).toEqual([A, B]);
    expect(rareteDuCreuset([])).toBeNull();
  });

  it("reprend du creuset ce qui ne vaut plus après une relecture de la forge", () => {
    const creuset: Creuset = [A, A, B];
    expect(creusetAJour(creuset, FUSION)).toEqual(creuset);
    // B n'est plus là, et il ne reste qu'un exemplaire libre de A.
    const apres: FusionDeLaForge = { nombre: 3, objets: [{ ...A, quantite: 2, libres: 1 }, E] };
    expect(creusetAJour(creuset, apres)).toEqual([{ ...A, quantite: 2, libres: 1 }]);
    expect(creusetAJour(creuset, { nombre: 3, objets: [] })).toEqual([]);
  });

  it("dit où une fusion est possible, et range les objets à poser", () => {
    expect(libresParRarete(FUSION)).toEqual({ commun: 3, "peu-commun": 0, epique: 4, mystique: 0, legendaire: 0 });
    expect(rareteDeDepart(FUSION)).toBe("commun");
    expect(rareteDeDepart({ nombre: 3, objets: [B, E] })).toBe("epique");
    // Aucune rareté n'a de quoi faire une fusion : la plus courante qui a un objet ; rien du tout : null.
    expect(rareteDeDepart({ nombre: 3, objets: [B] })).toBe("commun");
    expect(rareteDeDepart({ nombre: 3, objets: [] })).toBeNull();
    const garde = { ...B, libres: 0 };
    expect(objetsDeLaRarete({ objets: [garde, A, E] }, "commun")).toEqual([A, garde]);
    expect(objetsDeLaRarete(FUSION, "mystique")).toEqual([]);
  });

  it("a des mots pour chaque refus", () => {
    for (const [code, message] of Object.entries(MESSAGES_DE_LA_FUSION)) {
      expect(message.length, code).toBeGreaterThan(10);
      expect(messageDeLaFusion(code)).toBe(message);
    }
    expect(messageDeLaFusion("rate_limited")).toBeNull();
    for (const code of ["fusion_invalide", "raretes_melangees", "rarete_sans_fusion"]) expect(ERROR_MESSAGES[code], code).toBeTruthy();
  });
});
