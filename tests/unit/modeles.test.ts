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
import { CHANCES_POCHETTE_MODELES, PRIX_MODELE_PAR_RARETE, PRIX_POCHETTE_MODELES, type MesModeles } from "../../src/lib/village/contrat";
import {
  apercuDuModele,
  apresLAchat,
  apresLaPochette,
  apresLaTenue,
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
  raisonPochetteFermee,
  silhouetteDuModele,
  tenueAvecModele,
} from "../../src/lib/village/modeles";

// Sous Windows, Git rend le fichier avec des fins de ligne CRLF : les motifs ci-dessous lisent des « \n ».
const MIGRATION = readFileSync("supabase/migrations/20261115001000_gaulois_uniques.sql", "utf8").replace(/\r\n/g, "\n");
const MIGRATION_PRIX = readFileSync("supabase/migrations/20261116000500_gaulois_uniques_prix.sql", "utf8").replace(/\r\n/g, "\n");
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

  it("vend chaque modèle ce que coûtent en moyenne les pochettes pour le tirer, comme le contrat et le serveur", () => {
    expect(PRIX_POCHETTE_MODELES).toBe(3000);
    expect(prixCalculesDeLaBoutique(PRIX_POCHETTE_MODELES, c)).toEqual(PRIX_MODELE_PAR_RARETE);
    expect(RARETES_DES_GAULOIS_UNIQUES.map((r) => PRIX_MODELE_PAR_RARETE[r])).toEqual([11500, 15500, 20000, 25000, 28000]);
    // Tout modèle coûte plus cher à la boutique qu'une pochette.
    for (const r of RARETES_DES_GAULOIS_UNIQUES) expect(PRIX_MODELE_PAR_RARETE[r]).toBeGreaterThan(PRIX_POCHETTE_MODELES);
    const bloc = MIGRATION_PRIX.slice(MIGRATION_PRIX.indexOf("-- <prix>"), MIGRATION_PRIX.indexOf("-- </prix>"));
    const prixSql = Object.fromEntries([...bloc.matchAll(/\('([a-z-]+)', (\d+)\)/g)].map(([, r, p]) => [r, Number(p)]));
    expect(prixSql).toEqual(PRIX_MODELE_PAR_RARETE);
    expect(MIGRATION_PRIX).toContain(`set prix = ${PRIX_POCHETTE_MODELES}, commun = ${c.commun}, peu_commun = ${c["peu-commun"]}, epique = ${c.epique}, mystique = ${c.mystique}, legendaire = ${c.legendaire}, maj_le = now()`);
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
    expect(mes).toEqual({ ok: true, solde: 4200, peut_acheter: true, prix, pochette: { prix: 2000, chances }, modeles: [{ modele: "loup", acquis_le: "2026-11-15T18:00:00Z" }], porte: "loup" });
    expect(lireMesModeles(reponse({ porte: "dragon" }))?.porte).toBeNull();
    expect(lireMesModeles(reponse({ porte: null }))?.porte).toBeNull();
    expect(lireMesModeles(reponse({ solde: -1 }))).toBeNull();
    expect(lireMesModeles(reponse({ prix: { ...prix, legendaire: 0 } }))).toBeNull();
    expect(lireMesModeles(reponse({ pochette: { prix: 2000, chances: { ...chances, commun: 44 } } }))).toBeNull();
    expect(lireMesModeles(reponse({ peut_acheter: "oui" }))).toBeNull();
    expect(lireMesModeles({ ok: false, error: "not_signed_in" })).toBeNull();
  });

  it("lit un achat et une pochette : un modèle connu, à la rareté que la liste lui donne", () => {
    expect(lireAchatModele({ ok: true, solde: 100, modele: { modele: "dragon", rarete: "legendaire" } })).toEqual({ ok: true, solde: 100, modele: { modele: "dragon", rarete: "legendaire" } });
    expect(lireAchatModele({ ok: true, solde: 100, modele: { modele: "dragon", rarete: "commun" } })).toBeNull();
    expect(lireAchatModele({ ok: true, solde: 100, modele: { modele: "golem", rarete: "commun" } })).toBeNull();
    expect(lirePochetteModeles({ ok: true, solde: 0, modele: { modele: "ovni", rarete: "mystique" }, reste: 9 })).toEqual({ ok: true, solde: 0, modele: { modele: "ovni", rarete: "mystique" }, reste: 9 });
    expect(lirePochetteModeles({ ok: true, solde: 0, modele: { modele: "ovni", rarete: "mystique" } })).toBeNull();
  });
});

describe("ce que l'écran déduit", () => {
  const mes: MesModeles = {
    ok: true,
    solde: 1000,
    peut_acheter: true,
    prix: { commun: 500, "peu-commun": 1250, epique: 2500, mystique: 5000, legendaire: 12500 },
    pochette: { prix: 2000, chances: { commun: 45, "peu-commun": 28, epique: 15, mystique: 8, legendaire: 4 } },
    modeles: [{ modele: "loup", acquis_le: "2026-11-15T18:00:00Z" }],
    porte: null,
  };

  it("dit l'état d'un modèle", () => {
    expect(etatDuModele("loup", mes)).toBe("a-moi");
    expect(etatDuModele("loup", { ...mes, porte: "loup" })).toBe("porte");
    expect(etatDuModele("dragon", mes)).toBe("a-obtenir");
    expect(etatDuModele("dragon", null)).toBe("a-obtenir");
  });

  it("donne les chances réelles : une rareté épuisée est sautée, les autres se partagent sa part", () => {
    const neuf = chancesPourMoi(mes.pochette.chances, new Set());
    expect(neuf).toEqual(mes.pochette.chances);
    const sansCommuns = chancesPourMoi(mes.pochette.chances, new Set(["lezard", "loup", "sanglier"]))!;
    expect(sansCommuns.commun).toBe(0);
    expect(sansCommuns.legendaire).toBeCloseTo((4 * 100) / 55);
    expect(RARETES_DES_GAULOIS_UNIQUES.reduce((s, r) => s + sansCommuns[r], 0)).toBeCloseTo(100);
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
    const pochette = apresLaPochette(mes, { ok: true, solde: 0, modele: { modele: "ovni", rarete: "mystique" }, reste: 9 }, "2026-11-15T19:00:00Z");
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
