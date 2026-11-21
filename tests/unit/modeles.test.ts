import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CLE_MODELE,
  GAULOIS_HAUTEUR,
  GAULOIS_LARGEUR,
  TENUE_DE_DEPART,
  casesDuGaulois,
  changerModele,
  couleursDeBase,
  decrireGaulois,
  lireTenue,
  modeleDuGaulois,
  type Tenue,
} from "../../supabase/functions/code-discord/gaulois";
import { FAMILLES_DES_MODELES, LOTS_DE_MODELES, MODELES, RARETES_DES_MODELES, modeleParId } from "../../supabase/functions/code-discord/modeles/index";
import { LETTRES_PARTAGEES, MODELE_COULEURS_MAX } from "../../supabase/functions/code-discord/modeles/modele";
import { choseDe, lireReponseDesAchats, nouveautes, objetEnMots, origineDe, titreEnMots, vignetteDeLAchat } from "../../src/lib/achats-discord";
import {
  CHANCES_POCHETTE_MODELES,
  PALIERS_DE_REMBOURSEMENT,
  PRIX_MODELE_PAR_RARETE,
  PRIX_POCHETTE_MODELES,
  REMBOURSEMENT_POCHETTE_MODELES,
  type MesModeles,
} from "../../src/lib/village/contrat";
import {
  apercuDuModele,
  apresLAchat,
  apresLaPochette,
  apresLaTenue,
  chancesDeLaPochetteDesModeles,
  chancesPourMoi,
  decrireLeModele,
  etatDuModele,
  lireAchatModele,
  lireMesModeles,
  lirePochetteModeles,
  messageDuRefusDesModeles,
  modeleNu,
  modelesParFamille,
  modelesParRarete,
  pochettesEnMoyenne,
  prixCalculesDeLaBoutique,
  RARETES_DES_GAULOIS_UNIQUES,
  raisonDeLAchat,
  remboursementMoyen,
  valeurMoyenneDeLaPochette,
  raisonPochetteFermee,
  silhouetteDuModele,
  tenueAvecModele,
} from "../../src/lib/village/modeles";

// Sous Windows, Git rend le fichier avec des fins de ligne CRLF : les motifs ci-dessous lisent des « \n ».
const MIGRATION = readFileSync("supabase/migrations/20261115001000_gaulois_uniques.sql", "utf8").replace(/\r\n/g, "\n");
const MIGRATION_PRIX = readFileSync("supabase/migrations/20261116000500_gaulois_uniques_prix.sql", "utf8").replace(/\r\n/g, "\n");
const MIGRATION_REMBOURSEMENTS = readFileSync("supabase/migrations/20261116000600_gaulois_uniques_remboursements.sql", "utf8").replace(/\r\n/g, "\n");
const BAISSES = readFileSync("supabase/migrations/20261121000500_prix_baisses.sql", "utf8").replace(/\r\n/g, "\n");
const HEX = /^#[0-9a-f]{6}$/;
const COMMUNES = couleursDeBase(TENUE_DE_DEPART);

describe("les Gaulois uniques dessinés", () => {
  it("sont 11, en quatre familles, trois communs, trois peu communs, deux épiques, deux mystiques et un légendaire", () => {
    expect(MODELES).toHaveLength(11);
    expect(new Set(MODELES.map((m) => m.id)).size).toBe(11);
    expect(Object.keys(LOTS_DE_MODELES)).toEqual(Object.keys(FAMILLES_DES_MODELES));
    expect(modelesParRarete()).toEqual({ commun: 3, "peu-commun": 3, epique: 2, mystique: 2, legendaire: 1 });
    // Chaque modèle a sa rareté écrite, et aucune rareté n'est écrite pour un modèle qui n'existe pas (les quatre écartés).
    expect(Object.keys(RARETES_DES_MODELES).sort()).toEqual(MODELES.map((m) => m.id).sort());
    for (const ecarte of ["champignon", "chene", "grenouille", "golem"]) expect(modeleParId(ecarte), ecarte).toBeNull();
  });

  it("ont un identifiant sans chiffre ni accent, un nom court et une phrase pour qui ne voit pas l'image", () => {
    for (const m of MODELES) {
      expect(m.id, m.id).toMatch(/^[a-z][a-z-]{0,39}$/);
      expect(m.nom.length, m.id).toBeGreaterThan(0);
      expect(m.nom.length, m.id).toBeLessThanOrEqual(32);
      expect(m.description, m.id).toMatch(/^[A-ZÀ-Ý].*\.$/);
      expect(m.description.length, m.id).toBeLessThanOrEqual(200);
      expect(`${m.nom} ${m.description}`, m.id).not.toMatch(/openfront|ast[ée]rix|ob[ée]lix|potion magique/i);
    }
  });

  it("ont une grille de 48 cases de large, dans la grille du Gaulois, et une couleur pour chaque lettre", () => {
    for (const m of MODELES) {
      const { y, lignes } = m.corps;
      expect(Number.isInteger(y) && y >= 0, m.id).toBe(true);
      expect(y + lignes.length, m.id).toBeLessThanOrEqual(GAULOIS_HAUTEUR);
      for (const ligne of lignes) expect(ligne.length, m.id).toBe(GAULOIS_LARGEUR);
      expect("k" in m.couleurs, `${m.id} redéfinit le contour`).toBe(false);
      for (const lettre of LETTRES_PARTAGEES) expect(m.couleurs[lettre], `${m.id} : ${lettre}`).toMatch(HEX);
      for (const [lettre, couleur] of Object.entries(m.couleurs)) {
        expect(lettre, m.id).toMatch(/^[a-zA-Z]$/);
        expect(couleur, `${m.id} : ${lettre}`).toMatch(HEX);
      }
      const lettres = new Set(lignes.join("").replace(/\./g, ""));
      expect(lettres.size, m.id).toBeLessThanOrEqual(MODELE_COULEURS_MAX);
      for (const lettre of lettres) expect(m.couleurs[lettre] ?? COMMUNES[lettre], `${m.id} : lettre ${lettre} sans couleur`).toMatch(HEX);
    }
  });

  it("se dessinent case pour case : chaque case de la grille a sa couleur dans le Gaulois nu", () => {
    const nu: Tenue = { ...TENUE_DE_DEPART, cheveux: "aucun", barbe: "aucune", tete: "aucun", haut: "aucun", bas: "aucun", pieds: "nus", arme: "aucune" };
    for (const m of MODELES) {
      const cases = casesDuGaulois({ ...nu, [CLE_MODELE]: m.id });
      m.corps.lignes.forEach((ligne, dy) => {
        for (let x = 0; x < GAULOIS_LARGEUR; x++) {
          if (ligne[x] === ".") continue;
          expect(cases[(m.corps.y + dy) * GAULOIS_LARGEUR + x], `${m.id} : rangée ${m.corps.y + dy}, colonne ${x}`).not.toBeNull();
        }
      });
    }
  });
});

describe("le Gaulois qui porte un modèle", () => {
  const avec = (id: string): Tenue => ({ ...TENUE_DE_DEPART, [CLE_MODELE]: id });

  it("se lit avec la clé « modele », facultative, qui doit nommer un modèle", () => {
    expect(lireTenue(avec("dragon"))).toEqual(avec("dragon"));
    expect(lireTenue(TENUE_DE_DEPART)).toEqual(TENUE_DE_DEPART);
    expect(lireTenue(avec("golem"))).toBeNull();
    expect(lireTenue({ ...TENUE_DE_DEPART, [CLE_MODELE]: 3 })).toBeNull();
    expect(lireTenue({ ...TENUE_DE_DEPART, [CLE_MODELE]: null })).toBeNull();
    expect(lireTenue({ ...avec("dragon"), autre: "x" })).toBeNull();
    expect(modeleDuGaulois(avec("loup"))?.nom).toBe("Loup");
    expect(modeleDuGaulois(TENUE_DE_DEPART)).toBeNull();
  });

  it("change de corps et revient au corps humain", () => {
    expect(changerModele(TENUE_DE_DEPART, "lezard")).toEqual(avec("lezard"));
    expect(changerModele(avec("lezard"), null)).toEqual(TENUE_DE_DEPART);
    expect(CLE_MODELE in changerModele(avec("lezard"), null)).toBe(false);
    expect(changerModele(TENUE_DE_DEPART, "golem")).toBe(TENUE_DE_DEPART);
    expect(tenueAvecModele(TENUE_DE_DEPART, "ovni")).toEqual(avec("ovni"));
  });

  it("garde chaque objet exactement là où il est sur le corps humain, avec la peau du modèle là où il en montre", () => {
    const tenue: Tenue = { ...TENUE_DE_DEPART, tete: "casque", haut: "cotte-mailles", bas: "braies-cuir", pieds: "bottes-fer", arme: "epee" };
    const humain = casesDuGaulois(tenue);
    // Un objet qui laisse voir la peau la peint avec les lettres de la peau : celles du modèle, sur un modèle.
    const peauHumaine = new Set(LETTRES_PARTAGEES.map((lettre) => COMMUNES[lettre]));
    for (const m of MODELES) {
      const cree = casesDuGaulois({ ...tenue, [CLE_MODELE]: m.id });
      expect(cree, m.id).not.toEqual(humain);
      for (const emplacement of ["tete", "haut", "bas", "pieds", "arme"] as const) {
        const calque = casesDuGaulois(tenue, { seulement: [emplacement] });
        calque.forEach((couleur, i) => {
          if (couleur && !peauHumaine.has(humain[i] ?? "")) expect(cree[i], `${m.id} : ${emplacement}, case ${i}`).toBe(humain[i]);
        });
      }
    }
  });

  it("donne sa peau et sa cicatrice aux calques posés dessus, et garde les cheveux choisis", () => {
    const dragon = modeleParId("dragon")!;
    const couleurs = couleursDeBase(avec("dragon"));
    for (const lettre of LETTRES_PARTAGEES) expect(couleurs[lettre]).toBe(dragon.couleurs[lettre]);
    expect(couleurs["h"]).toBe(couleursDeBase(TENUE_DE_DEPART)["h"]);
    expect(couleurs["k"]).toBe(COMMUNES["k"]);
  });

  it("se dit en mots : le modèle d'abord, sans la peau humaine", () => {
    const mots = decrireGaulois(avec("magma"));
    expect(mots).toMatch(/^Gaulois en pixels, Gaulois unique : gaulois de magma\. /);
    expect(mots).not.toMatch(/Peau/);
    expect(mots).toMatch(/Haut : tunique bleue/);
    expect(decrireGaulois(TENUE_DE_DEPART)).toMatch(/^Gaulois en pixels\. Peau : claire/);
  });
});

describe("le serveur des Gaulois uniques", () => {
  it("garde la même liste et les mêmes raretés que les dessins", () => {
    const bloc = MIGRATION.slice(MIGRATION.indexOf("-- <modeles>"), MIGRATION.indexOf("-- </modeles>"));
    const lignes = [...bloc.matchAll(/\('([a-z-]+)', '([a-z-]+)'\)/g)].map(([, id, rarete]) => [id, rarete]);
    expect(lignes).toEqual(Object.entries(RARETES_DES_MODELES));
  });

  it("débite la boutique et la pochette au prix du serveur, la pochette de départ venant de la première migration", () => {
    expect(MIGRATION).toContain("(true, 2000, 45, 28, 15, 8, 4)");
    expect(MIGRATION).toContain("perform internal.village_debiter(v_uid, 'achat', v_prix, 'modele/' || p_modele);");
    expect(MIGRATION).toContain("perform internal.village_debiter(v_uid, 'pochette', v_prix, 'modele/' || v_modele);");
    expect(MIGRATION).toContain("if p_prix_vu is distinct from v_prix then perform internal.fail('prix_change'); end if;");
    expect(MIGRATION).toContain("perform internal.fail('tout_possede');");
  });
  it("garde ses tables privées et n'ouvre ses fonctions qu'aux comptes connectés", () => {
    for (const table of ["internal.modeles", "internal.modeles_pochette", "internal.gaulois_modeles"]) {
      expect(MIGRATION).toContain(`alter table ${table} enable row level security;`);
      expect(MIGRATION).toContain(`revoke all on table ${table} from public, anon, authenticated;`);
    }
    for (const fonction of ["public.get_mes_modeles()", "public.acheter_modele(text, integer)", "public.ouvrir_pochette_modeles(integer)"]) {
      expect(MIGRATION).toContain(`revoke all on function ${fonction} from public, anon, authenticated;`);
      expect(MIGRATION).toContain(`grant execute on function ${fonction} to authenticated;`);
    }
    for (const fonction of ["internal.modele_prix(text)", "internal.modeles_chances()", "internal.modeles_a_recevoir(uuid)", "internal.gaulois_tenue_valide(jsonb)"]) {
      expect(MIGRATION).toContain(`revoke all on function ${fonction} from public, anon, authenticated;`);
      expect(MIGRATION).not.toContain(`grant execute on function ${fonction}`);
    }
    expect(MIGRATION).toContain("grant execute on function public.export_site() to service_role;");
    expect(MIGRATION).toContain("'version', 9,");
    expect(MIGRATION).toContain("'gaulois_modeles', (select");
    expect(MIGRATION).not.toMatch(/raw_user_meta_data|drop table|drop column|truncate|delete from/i);
  });

  it("n'accepte dans la tenue qu'un modèle de la liste que le compte possède", () => {
    expect(MIGRATION).toContain("if p_tenue ? 'modele' then");
    expect(MIGRATION).toContain("where g.user_id = v_uid and g.modele = p_tenue ->> 'modele'");
  });
});

describe("les prix et les chances des Gaulois uniques (16 novembre 2026)", () => {
  const c = CHANCES_POCHETTE_MODELES;

  it("calcule exactement le nombre moyen de pochettes pour tirer un modèle", () => {
    // Deux communs seuls : la première pochette donne l'un ou l'autre, la seconde forcément l'autre ; 1,5 en moyenne.
    const deux = MODELES.filter((m) => m.id === "lezard" || m.id === "loup");
    expect(pochettesEnMoyenne(c, deux)).toEqual({ lezard: 1.5, loup: 1.5 });
    // Un commun et le dragon, chances 50 et 2 : le dragon sort en premier 2 fois sur 52.
    const duo = MODELES.filter((m) => m.id === "lezard" || m.id === "dragon");
    expect(pochettesEnMoyenne(c, duo)["dragon"]).toBeCloseTo(1 + 50 / 52, 10);
    const moyennes = pochettesEnMoyenne(c);
    const attendues = { lezard: 3.8, axolotl: 5.11, givre: 6.66, magma: 8.3, dragon: 9.32 };
    for (const [id, m] of Object.entries(attendues)) expect(moyennes[id], id).toBeCloseTo(m, 2);
    // Onze pochettes donnent forcément les onze : aucune moyenne ne dépasse 11, et elles montent avec la rareté.
    for (const m of MODELES) expect(moyennes[m.id], m.id).toBeLessThanOrEqual(11);
  });

  it("donne à chaque modèle moins de chances qu'à un modèle d'une rareté plus courante", () => {
    const parRarete = chancesPourMoi(c, new Set())!;
    const nombre = modelesParRarete();
    const parModele = RARETES_DES_GAULOIS_UNIQUES.map((r) => parRarete[r] / nombre[r]);
    for (let i = 1; i < parModele.length; i++) expect(parModele[i]!, RARETES_DES_GAULOIS_UNIQUES[i]).toBeLessThan(parModele[i - 1]!);
    expect(parModele.map((p) => Math.round(p * 10) / 10)).toEqual([16.7, 10, 6, 3, 2]);
    expect(RARETES_DES_GAULOIS_UNIQUES.reduce((s, r) => s + c[r], 0)).toBe(100);
  });

  it("vendait chaque modèle ce que coûtaient les pochettes pour le tirer (16 novembre), puis baisse le 21 novembre 2026", () => {
    // La règle du 16 novembre, avant les remboursements : pochette à 3 000, et la boutique au prix des pochettes qu'il faut.
    const PRIX_DU_16_NOVEMBRE = { commun: 11500, "peu-commun": 15500, epique: 20000, mystique: 25000, legendaire: 28000 };
    expect(prixCalculesDeLaBoutique(3000, c)).toEqual(PRIX_DU_16_NOVEMBRE);
    const bloc = MIGRATION_PRIX.slice(MIGRATION_PRIX.indexOf("-- <prix>"), MIGRATION_PRIX.indexOf("-- </prix>"));
    const prixSql = Object.fromEntries([...bloc.matchAll(/\('([a-z-]+)', (\d+)\)/g)].map(([, r, p]) => [r, Number(p)]));
    expect(prixSql).toEqual(PRIX_DU_16_NOVEMBRE);
    expect(MIGRATION_PRIX).toContain(`set prix = 3000, commun = ${c.commun}, peu_commun = ${c["peu-commun"]}, epique = ${c.epique}, mystique = ${c.mystique}, legendaire = ${c.legendaire}, maj_le = now()`);
    // Le 21 novembre 2026 (« baisse tout ») : 6 000 à 15 000 à la boutique, la pochette à 1 600, mêmes chances.
    expect(PRIX_POCHETTE_MODELES).toBe(1600);
    expect(RARETES_DES_GAULOIS_UNIQUES.map((r) => PRIX_MODELE_PAR_RARETE[r])).toEqual([6000, 8000, 10000, 12500, 15000]);
    for (const r of RARETES_DES_GAULOIS_UNIQUES) expect(BAISSES, r).toContain(`('${r}', ${PRIX_MODELE_PAR_RARETE[r]})`);
    expect(BAISSES).toContain(`update internal.modeles_pochette p set prix = ${PRIX_POCHETTE_MODELES}, maj_le = now() where p.id and p.prix <> ${PRIX_POCHETTE_MODELES};`);
    // Tout modèle coûte plus cher à la boutique qu'une pochette.
    for (const r of RARETES_DES_GAULOIS_UNIQUES) expect(PRIX_MODELE_PAR_RARETE[r]).toBeGreaterThan(PRIX_POCHETTE_MODELES);
    // Seul le réglage de départ change : un réglage déjà modifié reste.
    expect(MIGRATION_PRIX).toContain("where id and prix = 2000 and commun = 45 and peu_commun = 28 and epique = 15 and mystique = 8 and legendaire = 4;");
    expect(MIGRATION_PRIX).toContain("select p.prix from internal.modeles_prix p where p.rarete = p_rarete");
  });

  it("garde la table des prix privée et n'ouvre que get_mes_modeles, aux comptes connectés", () => {
    expect(MIGRATION_PRIX).toContain("alter table internal.modeles_prix enable row level security;");
    expect(MIGRATION_PRIX).toContain("revoke all on table internal.modeles_prix from public, anon, authenticated;");
    expect(MIGRATION_PRIX).toContain("revoke all on function internal.modele_prix(text) from public, anon, authenticated;");
    expect(MIGRATION_PRIX).not.toContain("grant execute on function internal.modele_prix");
    expect(MIGRATION_PRIX).toContain("revoke all on function public.get_mes_modeles() from public, anon, authenticated;");
    expect(MIGRATION_PRIX).toContain("grant execute on function public.get_mes_modeles() to authenticated;");
    expect(MIGRATION_PRIX).toContain("'prix', (select jsonb_object_agg(p.rarete, p.prix) from internal.modeles_prix p),");
    expect(MIGRATION_PRIX).not.toMatch(/raw_user_meta_data|drop table|drop column|truncate|delete from/i);
  });
});

describe("les remboursements de la pochette (16 novembre 2026, au soir)", () => {
  const pochette = { prix: PRIX_POCHETTE_MODELES, chances: CHANCES_POCHETTE_MODELES, remboursement: REMBOURSEMENT_POCHETTE_MODELES, paliers: [...PALIERS_DE_REMBOURSEMENT] };

  it("rendent 85 fois sur 100 de 20 à 60 % du prix, et donnent un Gaulois unique le reste du temps", () => {
    expect(REMBOURSEMENT_POCHETTE_MODELES).toBe(85);
    expect([...PALIERS_DE_REMBOURSEMENT]).toEqual([20, 30, 40, 50, 60]);
    expect(remboursementMoyen(pochette)).toBe(640);
    const toutes = chancesDeLaPochetteDesModeles(pochette, new Set())!;
    expect(toutes.remboursement).toBe(85);
    const nombre = modelesParRarete();
    const parModele = RARETES_DES_GAULOIS_UNIQUES.map((r) => Math.round((toutes.parRarete[r] / nombre[r]) * 100) / 100);
    expect(parModele).toEqual([2.5, 1.5, 0.9, 0.45, 0.3]);
    expect(toutes.remboursement + RARETES_DES_GAULOIS_UNIQUES.reduce((s, r) => s + toutes.parRarete[r], 0)).toBeCloseTo(100, 10);
    expect(chancesDeLaPochetteDesModeles(pochette, new Set(MODELES.map((m) => m.id)))).toBeNull();
  });

  it("valent en moyenne à peu près leur prix, au prix de la boutique", () => {
    // Le 16 novembre : 3 249 statères pour 3 000. Depuis le 21 novembre 2026 : 1 692 pour 1 600.
    const PRIX_DU_16_NOVEMBRE = { commun: 11500, "peu-commun": 15500, epique: 20000, mystique: 25000, legendaire: 28000 };
    expect(Math.round(valeurMoyenneDeLaPochette({ ...pochette, prix: 3000 }, PRIX_DU_16_NOVEMBRE, new Set())!)).toBe(3249);
    expect(valeurMoyenneDeLaPochette({ ...pochette, remboursement: 0, paliers: [] }, PRIX_MODELE_PAR_RARETE, new Set())).toBeCloseTo(7650, 6);
    const valeur = valeurMoyenneDeLaPochette(pochette, PRIX_MODELE_PAR_RARETE, new Set())!;
    expect(Math.round(valeur)).toBe(1692);
    expect(valeur / PRIX_POCHETTE_MODELES).toBeGreaterThan(1);
    expect(valeur / PRIX_POCHETTE_MODELES).toBeLessThan(1.1);
    // Mais tirer un modèle précis par les pochettes coûte, en moyenne et remboursements déduits, bien plus que la boutique :
    // les chiffres écrits dans contrat.ts et docs/DIRECTION.md.
    const netParPochette = PRIX_POCHETTE_MODELES - (REMBOURSEMENT_POCHETTE_MODELES / 100) * remboursementMoyen(pochette);
    const moyennes = pochettesEnMoyenne(CHANCES_POCHETTE_MODELES);
    const cout = (id: string) => ((moyennes[id] ?? 0) / (1 - REMBOURSEMENT_POCHETTE_MODELES / 100)) * netParPochette;
    expect(netParPochette).toBe(1056);
    expect(Math.round(cout("lezard") / 100) * 100).toBe(26800);
    expect(Math.round(cout("axolotl") / 500) * 500).toBe(36000);
    expect(Math.round(cout("givre") / 1000) * 1000).toBe(47000);
    expect(Math.round(cout("magma") / 1000) * 1000).toBe(58000);
    expect(Math.round(cout("dragon") / 1000) * 1000).toBe(66000);
    expect(cout("dragon") / PRIX_MODELE_PAR_RARETE.legendaire).toBeGreaterThan(4);
    // Les communs possédés, leurs chances vont aux statères rendus, pas aux modèles plus chers : elle vaut moins.
    const sansCommuns = new Set(["lezard", "loup", "sanglier"]);
    expect(valeurMoyenneDeLaPochette(pochette, PRIX_MODELE_PAR_RARETE, sansCommuns)!).toBeLessThan(valeur);
    const chances = chancesDeLaPochetteDesModeles(pochette, sansCommuns)!;
    expect(chances.remboursement).toBeCloseTo(92.5, 10);
    expect(chances.parRarete.commun).toBe(0);
    // Le légendaire reste à sa chance du premier jour.
    expect(chances.parRarete.legendaire).toBeCloseTo(chancesDeLaPochetteDesModeles(pochette, new Set())!.parRarete.legendaire, 10);
  });

  it("sont tirés par le serveur, sans annonce sur Discord ni modèle, et comptés en pochette nette", () => {
    expect(MIGRATION_REMBOURSEMENTS).toContain("if internal.village_hasard() * 100 < coalesce(v_rembourse, 0) then");
    expect(MIGRATION_REMBOURSEMENTS).toContain(`select array[${PALIERS_DE_REMBOURSEMENT.join(", ")}]`);
    expect(MIGRATION_REMBOURSEMENTS).toContain("update internal.modeles_pochette set remboursement = " + REMBOURSEMENT_POCHETTE_MODELES + ", maj_le = now() where id;");
    expect(MIGRATION_REMBOURSEMENTS).toContain("perform internal.village_debiter(v_uid, 'pochette', v_prix, 'modeles-rembourse');");
    expect(MIGRATION_REMBOURSEMENTS).toContain("insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_uid, 'pochette', v_rendu, 'modeles-rembourse');");
    // La référence d'un remboursement n'a pas la forme « emplacement/objet » que lit l'annonce des achats.
    expect("modeles-rembourse").not.toMatch(/^[a-z]{1,20}\/[a-z][a-z-]{0,39}$/);
    // Tout possédé : refusé avant tout tirage, remboursement compris.
    const refus = MIGRATION_REMBOURSEMENTS.indexOf("perform internal.fail('tout_possede')");
    expect(refus).toBeGreaterThan(0);
    expect(refus).toBeLessThan(MIGRATION_REMBOURSEMENTS.indexOf("internal.village_hasard() * 100"));
    expect(MIGRATION_REMBOURSEMENTS).toContain("revoke all on function internal.modeles_paliers() from public, anon, authenticated;");
    expect(MIGRATION_REMBOURSEMENTS).toContain("grant execute on function public.ouvrir_pochette_modeles(integer) to authenticated;");
    expect(MIGRATION_REMBOURSEMENTS).toContain("grant execute on function public.get_mes_modeles() to authenticated;");
    expect(MIGRATION_REMBOURSEMENTS).not.toMatch(/raw_user_meta_data|drop table|drop column|truncate|delete from/i);
  });

  it("une rareté terminée rend des statères au serveur, pour les deux pochettes, sans rien donner aux autres raretés", () => {
    const sql = readFileSync("supabase/migrations/20261116001400_raretes_completes_en_stateres.sql", "utf8").replace(/\r\n/g, "\n");
    for (const [chances, ref, fonction] of [
      ["internal.modeles_chances()", "modeles-rembourse", "public.ouvrir_pochette_modeles(integer)"],
      ["internal.bannieres_pochette_chances()", "bannieres-rembourse", "public.ouvrir_pochette_bannieres(integer)"],
    ] as const) {
      // La rareté se tire parmi toutes celles qui ont des chances, sans regarder ce qu'il reste au compte.
      expect(sql).toContain(`select sum(c.chance) into v_total from ${chances} c where c.chance > 0;`);
      expect(sql).toContain(`select c.rarete, c.chance from ${chances} c where c.chance > 0 order by c.rang`);
      expect(sql).toContain(`perform internal.village_debiter(v_uid, 'pochette', v_prix, '${ref}');`);
      expect(sql).toContain(`insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_uid, 'pochette', v_rendu, '${ref}');`);
      expect(sql).toContain(`revoke all on function ${fonction} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function ${fonction} to authenticated;`);
    }
    expect(sql.match(/if v_n = 0 then v_rend := true; end if;/g)).toHaveLength(2);
    expect(sql.match(/perform internal\.fail\('tout_possede'\)/g)).toHaveLength(2);
    expect(sql).not.toMatch(/raw_user_meta_data|drop table|drop column|truncate|delete from|alter table|update internal/i);
  });
});

describe("la lecture des réponses du serveur", () => {
  const prix = { commun: 500, "peu-commun": 1250, epique: 2500, mystique: 5000, legendaire: 12500 };
  const chances = { commun: 45, "peu-commun": 28, epique: 15, mystique: 8, legendaire: 4 };
  const reponse = (p: Record<string, unknown> = {}) => ({
    ok: true,
    solde: 4200,
    peut_acheter: true,
    prix,
    pochette: { prix: 2000, chances },
    modeles: [
      { modele: "loup", acquis_le: "2026-11-15T18:00:00Z" },
      { modele: "golem", acquis_le: "2026-11-15T17:00:00Z" },
      { modele: "loup", acquis_le: "2026-11-15T16:00:00Z" },
      { modele: "dragon", acquis_le: "pas une date" },
    ],
    porte: "loup",
    ...p,
  });

  it("lit get_mes_modeles en écartant l'inconnu, le double et le mal daté", () => {
    const mes = lireMesModeles(reponse());
    expect(mes).toEqual({ ok: true, solde: 4200, peut_acheter: true, prix, pochette: { prix: 2000, chances, remboursement: 0, paliers: [] }, modeles: [{ modele: "loup", acquis_le: "2026-11-15T18:00:00Z" }], porte: "loup" });
    expect(lireMesModeles(reponse({ porte: "dragon" }))?.porte).toBeNull();
    expect(lireMesModeles(reponse({ porte: null }))?.porte).toBeNull();
    expect(lireMesModeles(reponse({ solde: -1 }))).toBeNull();
    expect(lireMesModeles(reponse({ prix: { ...prix, legendaire: 0 } }))).toBeNull();
    expect(lireMesModeles(reponse({ pochette: { prix: 2000, chances: { ...chances, commun: 44 } } }))).toBeNull();
    // Les remboursements du serveur d'aujourd'hui : leur part et leurs paliers.
    expect(lireMesModeles(reponse({ pochette: { prix: 3000, chances, remboursement: 85, paliers: [20, 30, 40, 50, 60] } }))?.pochette).toEqual({ prix: 3000, chances, remboursement: 85, paliers: [20, 30, 40, 50, 60] });
    expect(lireMesModeles(reponse({ pochette: { prix: 3000, chances, remboursement: 85, paliers: [] } }))).toBeNull();
    expect(lireMesModeles(reponse({ pochette: { prix: 3000, chances, remboursement: 100, paliers: [20] } }))).toBeNull();
    expect(lireMesModeles(reponse({ pochette: { prix: 3000, chances, remboursement: 85, paliers: [20, 0] } }))).toBeNull();
    expect(lireMesModeles(reponse({ peut_acheter: "oui" }))).toBeNull();
    expect(lireMesModeles({ ok: false, error: "not_signed_in" })).toBeNull();
  });

  it("lit un achat et une pochette : un modèle connu, à la rareté que la liste lui donne", () => {
    expect(lireAchatModele({ ok: true, solde: 100, modele: { modele: "dragon", rarete: "legendaire" } })).toEqual({ ok: true, solde: 100, modele: { modele: "dragon", rarete: "legendaire" } });
    expect(lireAchatModele({ ok: true, solde: 100, modele: { modele: "dragon", rarete: "commun" } })).toBeNull();
    expect(lireAchatModele({ ok: true, solde: 100, modele: { modele: "golem", rarete: "commun" } })).toBeNull();
    expect(lirePochetteModeles({ ok: true, solde: 0, modele: { modele: "ovni", rarete: "mystique" }, reste: 9 })).toEqual({ ok: true, solde: 0, modele: { modele: "ovni", rarete: "mystique" }, remboursement: null, reste: 9 });
    expect(lirePochetteModeles({ ok: true, solde: 900, modele: null, remboursement: { pourcent: 30, rendu: 900 }, reste: 11 })).toEqual({ ok: true, solde: 900, modele: null, remboursement: { pourcent: 30, rendu: 900 }, reste: 11 });
    expect(lirePochetteModeles({ ok: true, solde: 900, modele: { modele: "ovni", rarete: "mystique" }, remboursement: { pourcent: 30, rendu: 900 }, reste: 11 })).toBeNull();
    expect(lirePochetteModeles({ ok: true, solde: 900, modele: null, remboursement: { pourcent: 0, rendu: 900 }, reste: 11 })).toBeNull();
    expect(lirePochetteModeles({ ok: true, solde: 900, modele: null, remboursement: null, reste: 11 })).toBeNull();
    expect(lirePochetteModeles({ ok: true, solde: 0, modele: { modele: "ovni", rarete: "mystique" } })).toBeNull();
  });
});

describe("ce que l'écran déduit", () => {
  const mes: MesModeles = {
    ok: true,
    solde: 1000,
    peut_acheter: true,
    prix: { commun: 500, "peu-commun": 1250, epique: 2500, mystique: 5000, legendaire: 12500 },
    pochette: { prix: 2000, chances: { commun: 45, "peu-commun": 28, epique: 15, mystique: 8, legendaire: 4 }, remboursement: 0, paliers: [] },
    modeles: [{ modele: "loup", acquis_le: "2026-11-15T18:00:00Z" }],
    porte: null,
  };

  it("dit l'état d'un modèle", () => {
    expect(etatDuModele("loup", mes)).toBe("a-moi");
    expect(etatDuModele("loup", { ...mes, porte: "loup" })).toBe("porte");
    expect(etatDuModele("dragon", mes)).toBe("a-obtenir");
    expect(etatDuModele("dragon", null)).toBe("a-obtenir");
  });

  it("donne les chances réelles : une rareté terminée tombe à zéro, les autres gardent leur chance", () => {
    const neuf = chancesPourMoi(mes.pochette.chances, new Set());
    expect(neuf).toEqual(mes.pochette.chances);
    const sansCommuns = chancesPourMoi(mes.pochette.chances, new Set(["lezard", "loup", "sanglier"]))!;
    expect(sansCommuns.commun).toBe(0);
    expect(sansCommuns.legendaire).toBe(mes.pochette.chances.legendaire);
    expect(RARETES_DES_GAULOIS_UNIQUES.reduce((s, r) => s + sansCommuns[r], 0)).toBeCloseTo(100 - mes.pochette.chances.commun);
    expect(chancesPourMoi(mes.pochette.chances, new Set(MODELES.map((m) => m.id)))).toBeNull();
  });

  it("dit pourquoi un achat ou une pochette est impossible, dans l'ordre du serveur", () => {
    expect(raisonDeLAchat(mes, "sanglier", 1000, 500)).toBeNull();
    expect(raisonDeLAchat(mes, "loup", 1000, 500)).toBe("Vous avez déjà ce Gaulois unique.");
    expect(raisonDeLAchat(mes, "dragon", 1000, 12500)).toMatch(/^Il vous manque 11\s500\sstatères\.$/u);
    expect(raisonDeLAchat({ ...mes, peut_acheter: false }, "sanglier", 1000, 500)).not.toBeNull();
    expect(raisonPochetteFermee(mes, 1000)).toMatch(/^Il vous manque 1\s000\sstatères\.$/u);
    expect(raisonPochetteFermee(mes, 2000)).toBeNull();
    expect(raisonPochetteFermee({ ...mes, modeles: MODELES.map((m) => ({ modele: m.id, acquis_le: "2026-11-15T18:00:00Z" })) }, 99999)).toBe("Vous avez déjà tous les Gaulois uniques : la pochette n'a plus rien à vous donner.");
    expect(messageDuRefusDesModeles("tout_possede")).toMatch(/tous les Gaulois uniques/);
    expect(messageDuRefusDesModeles("unknown_modele")).toMatch(/Ce Gaulois unique n'existe pas/);
  });

  it("met à jour ce qu'il sait après un achat, une pochette ou une tenue enregistrée", () => {
    const apres = apresLAchat(mes, { ok: true, solde: 500, modele: { modele: "sanglier", rarete: "commun" } }, "2026-11-15T19:00:00Z");
    expect(apres.solde).toBe(500);
    expect(apres.modeles.map((l) => l.modele)).toEqual(["sanglier", "loup"]);
    const pochette = apresLaPochette(mes, { ok: true, solde: 0, modele: { modele: "ovni", rarete: "mystique" }, remboursement: null, reste: 9 }, "2026-11-15T19:00:00Z");
    const rendue = apresLaPochette(mes, { ok: true, solde: 1600, modele: null, remboursement: { pourcent: 20, rendu: 600 }, reste: 10 }, "2026-11-15T19:00:00Z");
    expect(rendue.solde).toBe(1600);
    expect(rendue.modeles).toEqual(mes.modeles);
    expect(pochette.modeles.map((l) => l.modele)).toEqual(["ovni", "loup"]);
    expect(apresLaTenue(mes, { ...TENUE_DE_DEPART, [CLE_MODELE]: "loup" }).porte).toBe("loup");
    expect(apresLaTenue({ ...mes, porte: "loup" }, TENUE_DE_DEPART).porte).toBeNull();
  });

  it("range, chiffre et dessine les modèles", () => {
    expect(modelesParFamille().map((f) => f.modeles.length)).toEqual([3, 2, 3, 3]);
    expect(apercuDuModele(TENUE_DE_DEPART, "loup").cases).toEqual(casesDuGaulois({ ...TENUE_DE_DEPART, [CLE_MODELE]: "loup" }));
    expect(apercuDuModele(TENUE_DE_DEPART, null).cases).toEqual(casesDuGaulois(TENUE_DE_DEPART));
    const nu = modeleNu("ovni")!;
    const silhouette = silhouetteDuModele("ovni")!;
    expect(silhouette.cases.map((c) => c !== null)).toEqual(nu.cases.map((c) => c !== null));
    expect(new Set(silhouette.cases.filter(Boolean))).toEqual(new Set(["#0a1230"]));
    expect(modeleNu("golem")).toBeNull();
    expect(decrireLeModele("dragon")).toBe("Dragon, Gaulois unique légendaire");
  });
});

describe("l'annonce des achats sur Discord", () => {
  const ligne = (p: Record<string, unknown>) => ({ id: 1, nature: "achat", emplacement: "modele", objet: "dragon", compte: 1, nom: "Epona", discord: "epona", le: "2026-11-15T19:00:00Z", ...p });

  it("lit un Gaulois unique acheté à la boutique ou sorti de sa pochette, jamais du marché", () => {
    const lu = lireReponseDesAchats({ ok: true, jusqu_a: 9, achats: [ligne({}), ligne({ id: 2, nature: "pochette", objet: "ovni" }), ligne({ id: 3, nature: "marche_achat" }), ligne({ id: 4, objet: "golem" })] });
    expect(lu?.achats.map((a) => [a.emplacement, a.objet, a.nature])).toEqual([
      ["modele", "dragon", "achat"],
      ["modele", "ovni", "pochette"],
    ]);
    expect(lu?.inconnus).toBe(2);
  });

  it("le dit en mots et le dessine seul, rogné à son contour", () => {
    const [achat, pochette] = lireReponseDesAchats({ ok: true, jusqu_a: 9, achats: [ligne({}), ligne({ id: 2, nature: "pochette", objet: "ovni" })] })!.achats;
    expect(choseDe(achat!)).toEqual({ nom: "Dragon", rarete: "legendaire", place: "Gaulois unique" });
    expect(objetEnMots(achat!)).toBe("Dragon (Gaulois unique, rareté légendaire)");
    expect(origineDe(achat!).court).toBe("Boutique");
    expect(origineDe(pochette!).phrase).toBe("dans la pochette des Gaulois uniques");
    expect(titreEnMots({ nom: "Epona", discord: "epona", achats: [achat!] }, "@epona")).toBe("@epona a un nouveau Gaulois unique");
    expect(titreEnMots({ nom: "Epona", discord: "epona", achats: [achat!, pochette!] }, "@epona")).toBe("@epona a 2 nouveaux Gaulois uniques");
    expect(nouveautes([{ emplacement: "tete" }, { emplacement: "modele" }])).toBe("1 nouvel objet et 1 nouveau Gaulois unique");
    const vignette = vignetteDeLAchat(achat!)!;
    expect(vignette.largeur).toBeLessThanOrEqual(GAULOIS_LARGEUR);
    expect(vignette.cases).toHaveLength(vignette.largeur * vignette.hauteur);
    // Rognée : la première et la dernière rangée ont chacune au moins une case peinte.
    expect(vignette.cases.slice(0, vignette.largeur).some(Boolean)).toBe(true);
    expect(vignette.cases.slice(-vignette.largeur).some(Boolean)).toBe(true);
  });
});
