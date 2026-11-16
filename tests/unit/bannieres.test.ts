import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { poserLeCadre } from "../../supabase/functions/code-discord/bannieres/cadres";
import { poserLeCadreDeLaPochette } from "../../supabase/functions/code-discord/bannieres/cadres-pochette";
import { HAUTEUR, LARGEUR, RARETES_DES_BANNIERES } from "../../supabase/functions/code-discord/bannieres/commun";
import { BANNIERES, FAMILLE_DE_LA_POCHETTE, FAMILLES_DES_BANNIERES, banniereParId, dessinDeLaBanniere, estDeLaPochette } from "../../supabase/functions/code-discord/bannieres/index";
import { LOT_A } from "../../supabase/functions/code-discord/bannieres/lot-a";
import { LOT_B } from "../../supabase/functions/code-discord/bannieres/lot-b";
import { LOT_C } from "../../supabase/functions/code-discord/bannieres/lot-c";
import { LOT_D } from "../../supabase/functions/code-discord/bannieres/lot-d";
import { LOT_E } from "../../supabase/functions/code-discord/bannieres/lot-e";
import { LOT_F } from "../../supabase/functions/code-discord/bannieres/lot-f";
import { LOT_G } from "../../supabase/functions/code-discord/bannieres/lot-g";
import { LOT_H } from "../../supabase/functions/code-discord/bannieres/lot-h";
import { LOT_I } from "../../supabase/functions/code-discord/bannieres/lot-i";
import { casesDeLaScene, DECOR_LARGEUR, decrireLaScene, IMAGE_GAULOIS, imageDeLaScene, PLACE_DU_LOGO, TENUE_DE_DEPART } from "../../supabase/functions/code-discord/gaulois";
import { gauloisMessage } from "../../supabase/functions/code-discord/index";
import { annonceEnMots, banniereBienVenue, choseDe, lireReponseDesAchats, origineDe, nouveautes, objetEnMots, titreEnMots, vignetteDeLAchat, type AnnonceDesAchats } from "../../src/lib/achats-discord";
import { achatsCard } from "../../src/lib/achats-image";
import { GazetteFonts } from "../../src/lib/gazette-image";
import { ORDRE_RARETES } from "../../src/lib/gaulois";
import {
  TRESORS,
  albumDesTresors,
  apresLaPochetteDesBannieres,
  chancesDUnTresor,
  rendusDesPaliers,
  valeurMoyenneDeLaPochetteDesBannieres,
  bandeDesTresors,
  chanceDuTresor,
  chancesDesTresorsPourMoi,
  chanceDesStateresRendus,
  comptesParRarete,
  etatDeLaBanniere,
  lignesDesChancesDesTresors,
  lireAchatBanniere,
  lireChoixBanniere,
  lireMesBannieres,
  lirePochetteBannieres,
  manquePour,
  messageDesBannieres,
  rangerLesBannieres,
  sceneDeLaBanniere,
  tresorsAGagner,
  vignetteDeLaBanniere,
} from "../../src/lib/village/bannieres";
import { CHANCES_POCHETTE_BANNIERES, FOIS_LE_PRIX_D_UN_OBJET, PALIERS_DE_REMBOURSEMENT_DES_BANNIERES, PRIX_BANNIERE_PAR_RARETE, PRIX_PAR_RARETE, PRIX_POCHETTE_BANNIERES, REMBOURSEMENT_POCHETTE_BANNIERES } from "../../src/lib/village/contrat";

// Sous Windows, Git rend le fichier avec des fins de ligne CRLF : les motifs ci-dessous lisent des « \n ».
const MIGRATION = readFileSync("supabase/migrations/20261115000900_bannieres_du_gaulois.sql", "utf8").replace(/\r\n/g, "\n");
const MIGRATION_POCHETTE = readFileSync("supabase/migrations/20261116000100_pochette_des_bannieres.sql", "utf8").replace(/\r\n/g, "\n");
const MIGRATION_REMBOURSEMENTS = readFileSync("supabase/migrations/20261116000700_pochette_bannieres_remboursements.sql", "utf8").replace(/\r\n/g, "\n");
const LOTS_BOUTIQUE = { A: LOT_A, B: LOT_B, C: LOT_C, D: LOT_D, E: LOT_E };
const LOTS_POCHETTE = { F: LOT_F, G: LOT_G, H: LOT_H, I: LOT_I };
const LOTS = { ...LOTS_BOUTIQUE, ...LOTS_POCHETTE };
const BOUTIQUE = BANNIERES.filter((b) => !estDeLaPochette(b));
const HEX = /^#[0-9a-f]{6}$/;

describe("les bannières dessinées", () => {
  it("sont 40 à la boutique, en cinq familles de 8, et 10, 10, 10, 5, 5 par rareté", () => {
    expect(BOUTIQUE).toHaveLength(40);
    for (const famille of Object.keys(FAMILLES_DES_BANNIERES).filter((f) => f !== FAMILLE_DE_LA_POCHETTE)) expect(BOUTIQUE.filter((b) => b.famille === famille), famille).toHaveLength(8);
    expect(comptesParRarete(null, BOUTIQUE)).toEqual({ commun: 10, "peu-commun": 10, epique: 10, mystique: 5, legendaire: 5 });
    // Chaque lot : 2 communes, 2 peu communes, 2 épiques, 1 mystique, 1 légendaire, toutes de sa famille.
    for (const [lettre, lot] of Object.entries(LOTS_BOUTIQUE)) {
      expect(lot, lettre).toHaveLength(8);
      expect(new Set(lot.map((b) => b.famille)).size, lettre).toBe(1);
      expect(lot.some(estDeLaPochette), lettre).toBe(false);
      expect(RARETES_DES_BANNIERES.map((r) => lot.filter((b) => b.rarete === r).length), lettre).toEqual([2, 2, 2, 1, 1]);
    }
  });

  it("ont 20 trésors de la pochette (demande du pilote, 16 novembre 2026) : 8 épiques, 8 mystiques, 4 légendaires", () => {
    expect(BANNIERES).toHaveLength(60);
    expect(new Set(BANNIERES.map((b) => b.id)).size).toBe(60);
    expect(TRESORS).toHaveLength(20);
    expect(TRESORS.every((b) => b.famille === FAMILLE_DE_LA_POCHETTE)).toBe(true);
    expect(comptesParRarete(FAMILLE_DE_LA_POCHETTE)).toEqual({ commun: 0, "peu-commun": 0, epique: 8, mystique: 8, legendaire: 4 });
    // Chaque lot de la pochette : 2 épiques, 2 mystiques, 1 légendaire, tous de la famille des trésors.
    for (const [lettre, lot] of Object.entries(LOTS_POCHETTE)) {
      expect(lot, lettre).toHaveLength(5);
      expect(lot.every(estDeLaPochette), lettre).toBe(true);
      expect(RARETES_DES_BANNIERES.map((r) => lot.filter((b) => b.rarete === r).length), lettre).toEqual([0, 0, 2, 2, 1]);
    }
  });

  it("ont un identifiant sans chiffre ni accent, un nom court et une phrase pour qui ne voit pas l'image", () => {
    for (const b of BANNIERES) {
      expect(b.id, b.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(b.id.length, b.id).toBeLessThanOrEqual(40);
      expect(b.nom.length, b.id).toBeGreaterThan(0);
      expect(b.nom.length, b.id).toBeLessThanOrEqual(32);
      expect(b.description, b.id).toMatch(/^[A-ZÀ-Ý].*\.$/);
      expect(b.description.length, b.id).toBeLessThanOrEqual(140);
      // Ni le nom du jeu, ni une œuvre connue dans les mots.
      expect(`${b.nom} ${b.description}`, b.id).not.toMatch(/openfront|ast[ée]rix|ob[ée]lix|potion magique/i);
    }
  });

  it("remplissent les 124 × 80 cases de couleurs « #rrggbb », toujours le même dessin", () => {
    for (const lot of Object.values(LOTS)) {
      for (const b of lot) {
        const un = b.dessiner();
        expect(un.cases, b.id).toHaveLength(LARGEUR * HAUTEUR);
        expect(un.cases.every((c) => HEX.test(c)), b.id).toBe(true);
        expect(un.ombre, b.id).toMatch(HEX);
        expect(b.dessiner().cases.join(), b.id).toBe(un.cases.join());
      }
    }
  });

  it("se lisent par leur identifiant, et rien d'autre", () => {
    const b = BANNIERES[0]!;
    expect(banniereParId(b.id)?.nom).toBe(b.nom);
    expect(banniereParId("inconnue")).toBeNull();
    expect(banniereParId(null)).toBeNull();
    expect(dessinDeLaBanniere("inconnue")).toBeNull();
    expect(dessinDeLaBanniere(b.id)).toBe(dessinDeLaBanniere(b.id));
  });
});

describe("les cadres de rareté", () => {
  const fond = () => new Array<string>(LARGEUR * HAUTEUR).fill("#123456");
  it("laissent les communes et les peu communes jusqu'au bord", () => {
    for (const rarete of ["commun", "peu-commun"] as const) {
      const cases = fond();
      poserLeCadre(cases, rarete);
      expect(cases.every((c) => c === "#123456"), rarete).toBe(true);
    }
  });

  it("ne touchent que les 3 cases du bord des épiques, mystiques et légendaires, en couleurs valides", () => {
    for (const rarete of ["epique", "mystique", "legendaire"] as const) {
      const cases = fond();
      poserLeCadre(cases, rarete);
      let bord = 0;
      cases.forEach((c, i) => {
        const x = i % LARGEUR;
        const y = Math.floor(i / LARGEUR);
        const auBord = x < 3 || y < 3 || x >= LARGEUR - 3 || y >= HAUTEUR - 3;
        expect(HEX.test(c), rarete).toBe(true);
        if (!auBord) expect(c, `${rarete} ${x},${y}`).toBe("#123456");
        else if (c !== "#123456") bord++;
      });
      expect(bord, rarete).toBeGreaterThan(LARGEUR);
    }
  });
});

describe("le cadre de la pochette", () => {
  const fond = () => new Array<string>(LARGEUR * HAUTEUR).fill("#123456");
  it("ne touche que les 3 cases du bord, en couleurs valides, et diffère du cadre de la rareté", () => {
    for (const rarete of ["epique", "mystique", "legendaire"] as const) {
      const cases = fond();
      poserLeCadreDeLaPochette(cases, rarete);
      cases.forEach((c, i) => {
        const x = i % LARGEUR;
        const y = Math.floor(i / LARGEUR);
        expect(HEX.test(c), rarete).toBe(true);
        if (!(x < 3 || y < 3 || x >= LARGEUR - 3 || y >= HAUTEUR - 3)) expect(c, `${rarete} ${x},${y}`).toBe("#123456");
      });
      const boutique = fond();
      poserLeCadre(boutique, rarete);
      expect(cases.join(), rarete).not.toBe(boutique.join());
    }
  });

  it("habille les trésors, et seulement eux", () => {
    const tresor = TRESORS[0]!;
    const brut = LOTS_POCHETTE.F.concat(LOTS_POCHETTE.G, LOTS_POCHETTE.H, LOTS_POCHETTE.I).find((b) => b.id === tresor.id)!.dessiner();
    const attendu = [...brut.cases];
    poserLeCadreDeLaPochette(attendu, tresor.rarete);
    expect(dessinDeLaBanniere(tresor.id)?.cases).toEqual(attendu);
    const vendue = BOUTIQUE.find((b) => b.rarete === tresor.rarete)!;
    const brutVendue = LOT_A.concat(LOT_B, LOT_C, LOT_D, LOT_E).find((b) => b.id === vendue.id)!.dessiner();
    const cadreBoutique = [...brutVendue.cases];
    poserLeCadre(cadreBoutique, vendue.rarete);
    expect(dessinDeLaBanniere(vendue.id)?.cases).toEqual(cadreBoutique);
  });
});

describe("la liste et les règles du serveur (migration des bannières)", () => {
  it("connaît exactement les bannières du dessin, avec leur rareté et leur marque de pochette", () => {
    const lignes = [...MIGRATION.matchAll(/^ {2}\('([a-z-]+)', '([a-z-]+)'\)/gm)].map(([, id, rarete]) => `${id}/${rarete}`);
    expect(lignes.sort()).toEqual(BOUTIQUE.map((b) => `${b.id}/${b.rarete}`).sort());
    const tresors = [...MIGRATION_POCHETTE.matchAll(/^ {2}\('([a-z-]+)', '([a-z-]+)', true\)/gm)].map(([, id, rarete]) => `${id}/${rarete}`);
    expect(tresors.sort()).toEqual(TRESORS.map((b) => `${b.id}/${b.rarete}`).sort());
    expect(MIGRATION_POCHETTE).toContain("on conflict (banniere) do update set rarete = excluded.rarete, pochette = excluded.pochette;");
  });

  it("fait payer le triple du prix d'un objet de la même rareté, comme le contrat", () => {
    expect(FOIS_LE_PRIX_D_UN_OBJET).toBe(3);
    expect(MIGRATION).toContain("select 3 * p.prix from internal.village_prix p where p.rarete = p_rarete");
    expect(ORDRE_RARETES.map((r) => PRIX_BANNIERE_PAR_RARETE[r])).toEqual([300, 750, 1500, 3000, 7500]);
    for (const r of ORDRE_RARETES) expect(PRIX_BANNIERE_PAR_RARETE[r]).toBe(3 * PRIX_PAR_RARETE[r]);
    expect(MIGRATION).toContain("if p_prix_vu is distinct from v_prix then perform internal.fail('prix_change'); end if;");
    expect(MIGRATION).toContain("perform internal.village_debiter(v_uid, 'achat', v_prix, 'banniere/' || p_banniere);");
  });

  it("garde ses tables privées et n'ouvre ses fonctions qu'aux comptes connectés, /gaulois à la seule clé de service", () => {
    for (const table of ["internal.bannieres", "internal.gaulois_bannieres"]) {
      expect(MIGRATION).toContain(`alter table ${table} enable row level security;`);
      expect(MIGRATION).toContain(`revoke all on table ${table} from public, anon, authenticated;`);
    }
    for (const fonction of ["public.get_mes_bannieres()", "public.acheter_banniere(text, integer)", "public.choisir_banniere(text)"]) {
      expect(MIGRATION).toContain(`revoke all on function ${fonction} from public, anon, authenticated;`);
      expect(MIGRATION).toContain(`grant execute on function ${fonction} to authenticated;`);
    }
    expect(MIGRATION).toContain("revoke all on function internal.banniere_prix(text) from public, anon, authenticated;");
    expect(MIGRATION).toContain("grant execute on function public.discord_gaulois(text) to service_role;");
    expect(MIGRATION).not.toMatch(/grant execute on function public\.discord_gaulois\(text\) to (anon|authenticated)/);
    expect(MIGRATION).toContain("grant execute on function public.export_site() to service_role;");
    expect(MIGRATION).toContain("'version', 8,");
    expect(MIGRATION).toContain("'banniere', v_banniere,");
    expect(MIGRATION).not.toMatch(/raw_user_meta_data|drop table|drop column|truncate|delete from/i);
  });

  it("ne garde qu'une bannière possédée comme bannière montrée", () => {
    expect(MIGRATION).toContain("foreign key (user_id, banniere) references internal.gaulois_bannieres (user_id, banniere)");
    expect(MIGRATION).toContain("perform internal.fail('pas_possede');");
  });
});

describe("la pochette des bannières au serveur (migrations 20261116000100 et 20261116000700)", () => {
  it("a le prix et les chances du contrat", () => {
    expect(PRIX_POCHETTE_BANNIERES).toBe(1500);
    expect(MIGRATION_REMBOURSEMENTS).toContain(`select ${PRIX_POCHETTE_BANNIERES}\n`);
    expect(ORDRE_RARETES.reduce((n, r) => n + CHANCES_POCHETTE_BANNIERES[r], 0)).toBe(100);
    ORDRE_RARETES.forEach((r, i) => expect(MIGRATION_POCHETTE, r).toContain(`('${r}', ${i + 1}, ${CHANCES_POCHETTE_BANNIERES[r]}::numeric)`));
    // Rien ne sort d'une rareté qui n'a pas de trésor.
    for (const r of ORDRE_RARETES) if (CHANCES_POCHETTE_BANNIERES[r] > 0) expect(TRESORS.some((b) => b.rarete === r), r).toBe(true);
  });

  it("refuse d'acheter un trésor avant tout débit, tire sans doublon et débite une pochette", () => {
    const achat = MIGRATION_POCHETTE.slice(MIGRATION_POCHETTE.indexOf("create or replace function public.acheter_banniere"), MIGRATION_POCHETTE.indexOf("create or replace function public.ouvrir_pochette_bannieres"));
    expect(achat.indexOf("perform internal.fail('pochette_seulement');")).toBeGreaterThan(0);
    expect(achat.indexOf("perform internal.fail('pochette_seulement');")).toBeLessThan(achat.indexOf("internal.village_debiter"));
    expect(MIGRATION_POCHETTE).toContain("perform internal.village_debiter(v_uid, 'pochette', v_prix, 'banniere/' || v_banniere);");
    expect(MIGRATION_POCHETTE).toContain("if not exists (select 1 from internal.bannieres_pochette_a_recevoir(v_uid)) then perform internal.fail('tout_possede'); end if;");
    expect(MIGRATION_POCHETTE).toContain("and not exists (select 1 from internal.gaulois_bannieres g where g.user_id = p_user and g.banniere = b.banniere)");
    expect(MIGRATION_POCHETTE).toContain("v_tirage := internal.village_hasard() * v_total;");
    expect(MIGRATION_POCHETTE).toContain("perform internal.village_verrou(v_uid);");
  });

  it("n'ouvre ses fonctions qu'aux comptes connectés, garde les autres privées, et n'efface rien", () => {
    for (const fonction of ["public.get_mes_bannieres()", "public.acheter_banniere(text, integer)", "public.ouvrir_pochette_bannieres(integer)"]) {
      expect(MIGRATION_POCHETTE).toContain(`revoke all on function ${fonction} from public, anon, authenticated;`);
      expect(MIGRATION_POCHETTE).toContain(`grant execute on function ${fonction} to authenticated;`);
    }
    for (const fonction of ["internal.bannieres_pochette_prix()", "internal.bannieres_pochette_chances()", "internal.bannieres_pochette_a_recevoir(uuid)"]) {
      expect(MIGRATION_POCHETTE).toContain(`revoke all on function ${fonction} from public, anon, authenticated;`);
      expect(MIGRATION_POCHETTE).not.toContain(`grant execute on function ${fonction}`);
    }
    // Ni /gaulois ni la sauvegarde ne changent : un trésor reçu est une ligne de internal.gaulois_bannieres, déjà sauvegardée.
    expect(MIGRATION_POCHETTE).not.toMatch(/function public\.(discord_gaulois|export_site)/);
    expect(MIGRATION_POCHETTE).not.toMatch(/raw_user_meta_data|drop table|drop column|truncate|delete from/i);
  });
});

describe("le prix baissé et les remboursements de la pochette (migration 20261116000700)", () => {
  it("a la part des remboursements et les paliers du contrat", () => {
    expect(MIGRATION_REMBOURSEMENTS).toContain(`select ${REMBOURSEMENT_POCHETTE_BANNIERES}::numeric\n`);
    expect(MIGRATION_REMBOURSEMENTS).toContain(`select array[${PALIERS_DE_REMBOURSEMENT_DES_BANNIERES.join(", ")}]\n`);
  });

  it("débite la pochette entière puis crédite ce qu'elle rend, sans jamais donner de bannière avec", () => {
    const ouverture = MIGRATION_REMBOURSEMENTS.slice(MIGRATION_REMBOURSEMENTS.indexOf("create or replace function public.ouvrir_pochette_bannieres"));
    const rendu = ouverture.slice(ouverture.indexOf("if internal.village_hasard() * 100 < internal.bannieres_pochette_remboursement() then"), ouverture.indexOf("-- Sinon, la rareté"));
    expect(rendu).toContain("perform internal.village_debiter(v_uid, 'pochette', v_prix, 'bannieres-rembourse');");
    expect(rendu).toContain("values (v_uid, 'pochette', v_rendu, 'bannieres-rembourse');");
    expect(rendu.indexOf("village_debiter")).toBeLessThan(rendu.indexOf("insert into internal.stateres_mouvements"));
    expect(rendu).not.toContain("gaulois_bannieres (user_id");
    // Qui a tout ne paie rien, même pour un remboursement : le refus vient avant le tirage.
    expect(ouverture.indexOf("perform internal.fail('tout_possede');")).toBeLessThan(ouverture.indexOf("if internal.village_hasard() * 100 <"));
    expect(ouverture.indexOf("perform internal.village_verrou(v_uid);")).toBeLessThan(ouverture.indexOf("if internal.village_hasard() * 100 <"));
    expect(ouverture).toContain("perform internal.village_debiter(v_uid, 'pochette', v_prix, 'banniere/' || v_banniere);");
  });

  it("n'ouvre ses fonctions qu'aux comptes connectés, garde les autres privées, et n'efface rien", () => {
    for (const fonction of ["public.get_mes_bannieres()", "public.ouvrir_pochette_bannieres(integer)"]) {
      expect(MIGRATION_REMBOURSEMENTS).toContain(`revoke all on function ${fonction} from public, anon, authenticated;`);
      expect(MIGRATION_REMBOURSEMENTS).toContain(`grant execute on function ${fonction} to authenticated;`);
    }
    for (const fonction of ["internal.bannieres_pochette_prix()", "internal.bannieres_pochette_remboursement()", "internal.bannieres_pochette_paliers()"]) {
      expect(MIGRATION_REMBOURSEMENTS).toContain(`revoke all on function ${fonction} from public, anon, authenticated;`);
      expect(MIGRATION_REMBOURSEMENTS).not.toContain(`grant execute on function ${fonction}`);
    }
    expect(MIGRATION_REMBOURSEMENTS).not.toMatch(/raw_user_meta_data|drop table|drop column|truncate|delete from/i);
  });

  it("vaut en moyenne un peu plus que son prix, au prix de la boutique", () => {
    expect(rendusDesPaliers(PRIX_POCHETTE_BANNIERES, PALIERS_DE_REMBOURSEMENT_DES_BANNIERES)).toEqual([300, 450, 600, 750, 900]);
    expect(valeurMoyenneDeLaPochetteDesBannieres(PRIX_POCHETTE_BANNIERES, CHANCES_POCHETTE_BANNIERES, REMBOURSEMENT_POCHETTE_BANNIERES, PALIERS_DE_REMBOURSEMENT_DES_BANNIERES, PRIX_BANNIERE_PAR_RARETE)).toBeCloseTo(1770, 6);
    // Sans remboursement, à l'ancien prix : 2 550 statères de bannières pour 3 000.
    expect(valeurMoyenneDeLaPochetteDesBannieres(3000, CHANCES_POCHETTE_BANNIERES, 0, [], PRIX_BANNIERE_PAR_RARETE)).toBeCloseTo(2550, 6);
  });

  it("ramène les chances des raretés à la part des pochettes qui donnent un trésor", () => {
    const chances = chancesDUnTresor({ chances: CHANCES_POCHETTE_BANNIERES, remboursement: REMBOURSEMENT_POCHETTE_BANNIERES });
    expect(ORDRE_RARETES.map((r) => chances[r])).toEqual([0, 0, 36, 18, 6]);
    expect(chancesDUnTresor({ chances: CHANCES_POCHETTE_BANNIERES, remboursement: 0 })).toEqual(CHANCES_POCHETTE_BANNIERES);
    // Une rareté terminée laisse ses chances aux statères rendus : les autres raretés ne bougent pas.
    const pochette = { chances: CHANCES_POCHETTE_BANNIERES, remboursement: REMBOURSEMENT_POCHETTE_BANNIERES };
    const de = (...raretes: string[]) => new Set(TRESORS.filter((b) => raretes.includes(b.rarete)).map((b) => b.id));
    const pourMoi = chancesDesTresorsPourMoi(chances, de("legendaire"))!;
    expect(pourMoi.legendaire).toBe(0);
    expect(pourMoi.epique).toBeCloseTo(36, 9);
    expect(pourMoi.mystique).toBeCloseTo(18, 9);
    expect(chanceDesStateresRendus(pochette, new Set())).toBeCloseTo(40, 9);
    expect(chanceDesStateresRendus(pochette, de("legendaire"))).toBeCloseTo(46, 9);
    // Le cas du pilote : épiques et mystiques terminés, le légendaire reste à 6, les statères rendus montent à 94.
    expect(chancesDesTresorsPourMoi(chances, de("epique", "mystique"))!.legendaire).toBeCloseTo(6, 9);
    expect(chanceDesStateresRendus(pochette, de("epique", "mystique"))).toBeCloseTo(94, 9);
    expect(chanceDesStateresRendus(pochette, de("epique", "mystique", "legendaire"))).toBeNull();
  });
});

describe("la lecture des réponses du serveur", () => {
  const [a, b] = BANNIERES;
  const prix = { commun: 300, "peu-commun": 750, epique: 1500, mystique: 3000, legendaire: 7500 };
  const reponse = (p: Record<string, unknown> = {}) => ({
    ok: true,
    solde: 4200,
    peut_acheter: true,
    prix,
    pochette: { prix: 1500, chances: { commun: 0, "peu-commun": 0, epique: 60, mystique: 30, legendaire: 10 }, remboursement: 40, paliers: [20, 30, 40, 50, 60] },
    bannieres: [
      { banniere: a!.id, acquis_le: "2026-11-15T14:00:00Z" },
      { banniere: b!.id, acquis_le: "2026-11-14T14:00:00Z" },
    ],
    porte: a!.id,
    ...p,
  });

  it("lit get_mes_bannieres telle quelle", () => {
    expect(lireMesBannieres(reponse())).toEqual(reponse());
  });

  it("lit sans la pochette une réponse d'avant elle, ou à la pochette illisible", () => {
    expect(lireMesBannieres(reponse({ pochette: undefined }))?.pochette).toBeNull();
    expect(lireMesBannieres(reponse({ pochette: { prix: 0, chances: { commun: 100, "peu-commun": 0, epique: 0, mystique: 0, legendaire: 0 } } }))?.pochette).toBeNull();
    expect(lireMesBannieres(reponse({ pochette: { prix: 3000, chances: { commun: 0, "peu-commun": 0, epique: 60, mystique: 30, legendaire: 9 } } }))?.pochette).toBeNull();
    expect(lireMesBannieres(reponse({ pochette: undefined }))?.solde).toBe(4200);
  });

  it("lit sans remboursement la pochette d'un serveur d'avant eux, ou aux remboursements illisibles", () => {
    const chances = { commun: 0, "peu-commun": 0, epique: 60, mystique: 30, legendaire: 10 };
    expect(lireMesBannieres(reponse({ pochette: { prix: 3000, chances } }))?.pochette).toEqual({ prix: 3000, chances, remboursement: 0, paliers: [] });
    expect(lireMesBannieres(reponse({ pochette: { prix: 1500, chances, remboursement: 40, paliers: [] } }))?.pochette).toEqual({ prix: 1500, chances, remboursement: 0, paliers: [] });
    expect(lireMesBannieres(reponse({ pochette: { prix: 1500, chances, remboursement: 100, paliers: [20] } }))?.pochette?.remboursement).toBe(0);
    expect(lireMesBannieres(reponse({ pochette: { prix: 1500, chances, remboursement: 40, paliers: [20, 150] } }))?.pochette?.paliers).toEqual([]);
  });

  it("lit une pochette qui rend des statères : un pourcentage et un montant entiers, jamais avec une bannière", () => {
    const t = TRESORS[0]!;
    const rendue = (p: Record<string, unknown> = {}) => ({ ok: true, solde: 900, banniere: null, remboursement: { pourcent: 40, rendu: 600 }, reste: 20, ...p });
    expect(lirePochetteBannieres(rendue())).toEqual(rendue());
    expect(lirePochetteBannieres(rendue({ remboursement: null }))).toBeNull();
    expect(lirePochetteBannieres(rendue({ remboursement: { pourcent: 40, rendu: 0 } }))).toBeNull();
    expect(lirePochetteBannieres(rendue({ remboursement: { pourcent: 140, rendu: 600 } }))).toBeNull();
    expect(lirePochetteBannieres(rendue({ banniere: { banniere: t.id, rarete: t.rarete } }))).toBeNull();
  });

  it("lit l'ouverture d'une pochette : un trésor connu, avec sa rareté, jamais une bannière de la boutique", () => {
    const t = TRESORS[0]!;
    const ouverture = (p: Record<string, unknown> = {}) => ({ ok: true, solde: 1200, banniere: { banniere: t.id, rarete: t.rarete }, remboursement: null, reste: 19, ...p });
    // Un serveur d'avant les remboursements ne dit pas `remboursement` : la même lecture.
    expect(lirePochetteBannieres({ ok: true, solde: 1200, banniere: { banniere: t.id, rarete: t.rarete }, reste: 19 })).toEqual(ouverture());
    expect(lirePochetteBannieres(ouverture())).toEqual(ouverture());
    expect(lirePochetteBannieres(ouverture({ reste: -1 }))).toBeNull();
    expect(lirePochetteBannieres(ouverture({ banniere: { banniere: t.id, rarete: "commun" } }))).toBeNull();
    expect(lirePochetteBannieres(ouverture({ banniere: { banniere: BOUTIQUE[0]!.id, rarete: BOUTIQUE[0]!.rarete } }))).toBeNull();
    expect(lirePochetteBannieres({ ok: false, error: "tout_possede" })).toBeNull();
  });

  it("écarte une bannière inconnue, en double ou mal datée, et ne montre pas une bannière qu'il n'a pas", () => {
    const lu = lireMesBannieres(
      reponse({
        bannieres: [
          { banniere: a!.id, acquis_le: "2026-11-15T14:00:00Z" },
          { banniere: a!.id, acquis_le: "2026-11-15T14:00:00Z" },
          { banniere: "inconnue", acquis_le: "2026-11-15T14:00:00Z" },
          { banniere: b!.id, acquis_le: "hier" },
        ],
        porte: b!.id,
      }),
    );
    expect(lu?.bannieres.map((x) => x.banniere)).toEqual([a!.id]);
    expect(lu?.porte).toBeNull();
  });

  it("refuse une réponse au solde, aux prix ou à la liste illisibles", () => {
    expect(lireMesBannieres(reponse({ solde: -1 }))).toBeNull();
    expect(lireMesBannieres(reponse({ solde: 1.5 }))).toBeNull();
    expect(lireMesBannieres(reponse({ peut_acheter: "oui" }))).toBeNull();
    expect(lireMesBannieres(reponse({ prix: { ...prix, legendaire: 0 } }))).toBeNull();
    expect(lireMesBannieres(reponse({ prix: { commun: 300 } }))).toBeNull();
    expect(lireMesBannieres(reponse({ bannieres: null }))).toBeNull();
    expect(lireMesBannieres({ ok: false, error: "not_signed_in" })).toBeNull();
  });

  it("lit un achat, seulement avec la rareté de la liste", () => {
    expect(lireAchatBanniere({ ok: true, solde: 10, banniere: { banniere: a!.id, rarete: a!.rarete } })).toEqual({ ok: true, solde: 10, banniere: { banniere: a!.id, rarete: a!.rarete } });
    const autre = ORDRE_RARETES.find((r) => r !== a!.rarete)!;
    expect(lireAchatBanniere({ ok: true, solde: 10, banniere: { banniere: a!.id, rarete: autre } })).toBeNull();
    expect(lireAchatBanniere({ ok: true, solde: 10, banniere: { banniere: "inconnue", rarete: "commun" } })).toBeNull();
  });

  it("lit le choix de la bannière montrée, le décor du lieu compris", () => {
    expect(lireChoixBanniere({ ok: true, porte: a!.id })).toEqual({ ok: true, porte: a!.id });
    expect(lireChoixBanniere({ ok: true, porte: null })).toEqual({ ok: true, porte: null });
    expect(lireChoixBanniere({ ok: true, porte: "inconnue" })).toBeNull();
    expect(lireChoixBanniere({ ok: true })).toBeNull();
  });

  it("donne des mots à chaque refus des bannières", () => {
    expect(messageDesBannieres("deja_possede")).toBe("Vous avez déjà cette bannière.");
    expect(messageDesBannieres("pas_possede")).toBe("Vous n'avez pas cette bannière.");
    expect(messageDesBannieres("tout_possede")).toContain("trésors de la pochette");
    expect(messageDesBannieres("pochette_seulement")).toContain("pochette des bannières");
    for (const code of ["not_validated", "no_gaulois", "unknown_banniere", "prix_change", "solde_insuffisant", "pochette_seulement", "tout_possede"]) {
      expect(messageDesBannieres(code), code).not.toBe(code);
      expect(messageDesBannieres(code).length, code).toBeGreaterThan(10);
    }
  });
});

describe("le rangement de la boutique", () => {
  it("range par famille puis de la plus courante à la plus rare, avec les comptes de chaque famille", () => {
    const toutes = rangerLesBannieres({ famille: null, rarete: null }, new Set([BANNIERES[0]!.id]));
    expect(toutes.map((f) => f.famille)).toEqual(Object.keys(FAMILLES_DES_BANNIERES));
    expect(toutes.flatMap((f) => f.bannieres)).toHaveLength(60);
    for (const f of toutes) {
      const rangs = f.bannieres.map((b) => ORDRE_RARETES.indexOf(b.rarete));
      expect(rangs).toEqual([...rangs].sort((x, y) => x - y));
      expect(f.total).toBe(f.famille === FAMILLE_DE_LA_POCHETTE ? 20 : 8);
    }
    expect(toutes.reduce((n, f) => n + f.possedees, 0)).toBe(1);
  });

  it("filtre par famille et par rareté, sans rendre une famille vide", () => {
    const legendaires = rangerLesBannieres({ famille: null, rarete: "legendaire" }, new Set());
    expect(legendaires.flatMap((f) => f.bannieres).every((b) => b.rarete === "legendaire")).toBe(true);
    expect(legendaires.flatMap((f) => f.bannieres)).toHaveLength(9);
    const front = rangerLesBannieres({ famille: "front", rarete: null }, new Set());
    expect(front.map((f) => f.famille)).toEqual(["front"]);
    expect(comptesParRarete("front")).toEqual({ commun: 2, "peu-commun": 2, epique: 2, mystique: 1, legendaire: 1 });
  });

  it("dit l'état d'une bannière et ce qui manque pour l'acheter", () => {
    const [a, b, c] = BANNIERES;
    const mes = { bannieres: [{ banniere: a!.id, acquis_le: "x" }, { banniere: b!.id, acquis_le: "x" }], porte: b!.id };
    expect(etatDeLaBanniere(a!.id, mes)).toBe("a-moi");
    expect(etatDeLaBanniere(b!.id, mes)).toBe("montree");
    expect(etatDeLaBanniere(c!.id, mes)).toBe("a-acheter");
    expect(etatDeLaBanniere(c!.id, null)).toBe("a-acheter");
    // Un trésor de la pochette qu'il n'a pas : à gagner, jamais à acheter.
    const tresor = TRESORS[0]!;
    expect(etatDeLaBanniere(tresor.id, mes)).toBe("a-gagner");
    expect(etatDeLaBanniere(tresor.id, { bannieres: [{ banniere: tresor.id, acquis_le: "x" }], porte: null })).toBe("a-moi");
    expect(manquePour(1000, 7500)).toBe(6500);
    expect(manquePour(9000, 7500)).toBe(0);
  });
});

describe("les chances de la pochette des bannières, pour un compte", () => {
  const chances = CHANCES_POCHETTE_BANNIERES;
  const ids = (rarete: string) => TRESORS.filter((b) => b.rarete === rarete).map((b) => b.id);

  it("sont celles du serveur quand il n'a rien, puis mettent à zéro une rareté terminée, sans rien donner aux autres", () => {
    expect(chancesDesTresorsPourMoi(chances, new Set())).toEqual({ commun: 0, "peu-commun": 0, epique: 60, mystique: 30, legendaire: 10 });
    const sansLegendaire = chancesDesTresorsPourMoi(chances, new Set(ids("legendaire")))!;
    expect(sansLegendaire.legendaire).toBe(0);
    expect(sansLegendaire.epique).toBe(60);
    expect(sansLegendaire.mystique).toBe(30);
    expect(chancesDesTresorsPourMoi(chances, new Set(TRESORS.map((b) => b.id)))).toBeNull();
    // Les bannières de la boutique ne comptent pas.
    expect(chancesDesTresorsPourMoi(chances, new Set(BOUTIQUE.map((b) => b.id)))).toEqual(chancesDesTresorsPourMoi(chances, new Set()));
  });

  it("donnent à chaque trésor sa part de sa rareté : 100 en tout sur ceux qui restent", () => {
    const possedees = new Set([...ids("epique").slice(0, 3), ids("legendaire")[0]!]);
    const total = TRESORS.reduce((n, b) => n + chanceDuTresor(b.id, chances, possedees), 0);
    expect(total).toBeCloseTo(100, 6);
    expect(chanceDuTresor(ids("epique")[0]!, chances, possedees)).toBe(0);
    expect(chanceDuTresor(BOUTIQUE[0]!.id, chances, possedees)).toBe(0);
    expect(chanceDuTresor(ids("legendaire")[1]!, chances, new Set())).toBeCloseTo(10 / 4, 6);
  });

  it("font l'album de la pochette : les trésors seuls, par rareté, en couleur, avec la chance du tirage", () => {
    const possedees = new Set([ids("epique")[0]!, BOUTIQUE[0]!.id]);
    const album = albumDesTresors(chances, possedees);
    expect(album.elements.map((e) => e.id).sort()).toEqual(TRESORS.map((b) => b.id).sort());
    const rangs = album.elements.map((e) => (ORDRE_RARETES as readonly string[]).indexOf(e.rarete));
    expect(rangs).toEqual([...rangs].sort((a, b) => a - b));
    for (const e of album.elements) {
      expect(e.chance).toBeCloseTo(chanceDuTresor(e.id, chances, possedees), 10);
      expect(e.silhouette).toBe(false);
      expect(e.dessin).not.toBeNull();
      expect(e.possede).toBe(possedees.has(e.id));
    }
    expect(album.elements.reduce((n, e) => n + e.chance, 0)).toBeCloseTo(100, 6);
    expect(album.sous).toBe(`1 sur ${TRESORS.length} à vous`);
    expect(album.libelleDesGroupes).toBe("Montrer une rareté");
  });

  it("s'écrivent une ligne par rareté qui a des trésors, avec ce qu'il en reste", () => {
    const lignes = lignesDesChancesDesTresors(chances, new Set(ids("legendaire")))!;
    expect(lignes.map((l) => l.rarete)).toEqual(["epique", "mystique", "legendaire"]);
    expect(lignes.map((l) => l.reste)).toEqual([8, 8, 0]);
    expect(lignes.map((l) => l.total)).toEqual([8, 8, 4]);
    expect(lignesDesChancesDesTresors(chances, new Set(TRESORS.map((b) => b.id)))).toBeNull();
    expect(tresorsAGagner(new Set(ids("epique")))).toHaveLength(12);
  });

  it("font tourner le tambour sur des trésors qu'il n'avait pas, et l'arrêtent sur celui reçu", () => {
    const possedees = new Set(ids("mystique").slice(0, 4));
    const recue = TRESORS.find((b) => !possedees.has(b.id) && b.rarete === "legendaire")!;
    let graine = 7;
    const hasard = () => ((graine = (graine * 16807) % 2147483647) - 1) / 2147483646;
    const bande = bandeDesTresors(recue, chances, possedees, hasard);
    expect(bande.rangees[bande.cible]?.valeur.id).toBe(recue.id);
    for (const rangee of bande.rangees) {
      expect(estDeLaPochette(rangee.valeur)).toBe(true);
      expect(possedees.has(rangee.valeur.id)).toBe(false);
    }
  });

  it("mettent le trésor reçu en tête des bannières du compte, avec le solde du serveur", () => {
    const t = TRESORS[1]!;
    const mes = { ok: true as const, solde: 5000, peut_acheter: true, prix: { ...PRIX_BANNIERE_PAR_RARETE }, pochette: null, bannieres: [{ banniere: BOUTIQUE[0]!.id, acquis_le: "2026-11-15T10:00:00Z" }], porte: null };
    const apres = apresLaPochetteDesBannieres(mes, { ok: true, solde: 2000, banniere: { banniere: t.id, rarete: t.rarete }, remboursement: null, reste: 19 }, "2026-11-16T10:00:00Z");
    expect(apres.solde).toBe(2000);
    expect(apres.bannieres.map((b) => b.banniere)).toEqual([t.id, BOUTIQUE[0]!.id]);
    // Une pochette qui rend des statères ne change que le solde.
    const rendue = apresLaPochetteDesBannieres(mes, { ok: true, solde: 4100, banniere: null, remboursement: { pourcent: 40, rendu: 600 }, reste: 20 }, "2026-11-16T10:00:00Z");
    expect(rendue.solde).toBe(4100);
    expect(rendue.bannieres).toEqual(mes.bannieres);
  });
});

describe("l'image de /gaulois devant une bannière", () => {
  const scene = { lieu: "taverne", moment: { phase: "crepuscule" } } as Parameters<typeof imageDeLaScene>[1];
  const legendaire = BANNIERES.find((b) => b.rarete === "legendaire")!;

  it("reste la même sans bannière", () => {
    const avant = imageDeLaScene(TENUE_DE_DEPART, scene);
    const sans = imageDeLaScene(TENUE_DE_DEPART, scene, [], null, null);
    expect(Buffer.from(sans.rgba).equals(Buffer.from(avant.rgba))).toBe(true);
  });

  it("met la bannière, cadre compris, à la place du décor du lieu", () => {
    const fond = dessinDeLaBanniere(legendaire.id)!;
    const image = imageDeLaScene(TENUE_DE_DEPART, scene, [], null, fond);
    const avant = imageDeLaScene(TENUE_DE_DEPART, scene);
    expect(Buffer.from(image.rgba).equals(Buffer.from(avant.rgba))).toBe(false);
    // L'aperçu du site (casesDeLaScene) est l'image envoyée, case par case, hors du logo du clan.
    const cases = casesDeLaScene(TENUE_DE_DEPART, fond);
    const e = IMAGE_GAULOIS.echelle;
    const logo = (x: number, y: number) => x * e + e > PLACE_DU_LOGO.x && x * e < PLACE_DU_LOGO.x + PLACE_DU_LOGO.cote && y * e + e > PLACE_DU_LOGO.y && y * e < PLACE_DU_LOGO.y + PLACE_DU_LOGO.cote;
    cases.forEach((couleur, i) => {
      const x = i % DECOR_LARGEUR;
      const y = Math.floor(i / DECOR_LARGEUR);
      if (logo(x, y)) return;
      const p = (y * e * image.largeur + x * e) * 4;
      const vu = `#${[0, 1, 2].map((k) => image.rgba[p + k]!.toString(16).padStart(2, "0")).join("")}`;
      expect(vu, `${x},${y}`).toBe(couleur);
    });
    expect(sceneDeLaBanniere(legendaire.id, TENUE_DE_DEPART)?.cases).toEqual(cases);
    expect(sceneDeLaBanniere("inconnue", TENUE_DE_DEPART)).toBeNull();
    expect(vignetteDeLaBanniere(legendaire.id)?.cases).toEqual(fond.cases);
  });

  it("nomme la bannière et dit ce qu'on y voit, à la place du lieu, pour qui ne voit pas l'image", () => {
    const mots = decrireLaScene(TENUE_DE_DEPART, scene, null, legendaire);
    expect(mots).toContain(`Il pose devant sa bannière « ${legendaire.nom} » : ${legendaire.description}`);
    expect(mots).not.toContain("taverne");
    expect(decrireLaScene(TENUE_DE_DEPART, scene)).toContain("taverne");
    const message = JSON.stringify(gauloisMessage(TENUE_DE_DEPART, scene, null, null, legendaire));
    expect(message).toContain(legendaire.nom);
    expect(JSON.stringify(gauloisMessage(TENUE_DE_DEPART, scene))).not.toContain("bannière");
  });
});

describe("une bannière annoncée sur Discord, comme les autres achats", () => {
  const b = BANNIERES.find((x) => x.rarete === "mystique")!;
  const ligne = (p: Record<string, unknown> = {}) => ({ id: 61, nature: "achat", emplacement: "banniere", objet: b.id, compte: 7, nom: "Brennos", discord: "brennos", le: "2026-11-15T21:05:00.000Z", ...p });

  it("se lit au serveur : un trésor sorti de la pochette des bannières, jamais acheté", () => {
    const t = TRESORS[0]!;
    const lu = lireReponseDesAchats({ ok: true, jusqu_a: 66, achats: [ligne({ id: 65, nature: "pochette", objet: t.id }), ligne({ id: 66, nature: "achat", objet: t.id })] });
    expect(lu?.achats.map((a) => `${a.nature}/${a.objet}`)).toEqual([`pochette/${t.id}`]);
    expect(lu?.inconnus).toBe(1);
    expect(origineDe(lu!.achats[0]!)).toEqual({ phrase: "dans la pochette des bannières", court: "Pochette des bannières" });
    expect(annonceEnMots({ nom: "Brennos", discord: null, achats: lu!.achats }).join(" ")).toContain("dans la pochette des bannières");
    expect(banniereBienVenue("achat", b.id)).toBe(true);
    expect(banniereBienVenue("pochette", b.id)).toBe(false);
    expect(banniereBienVenue("marche_achat", t.id)).toBe(false);
  });

  it("se lit au serveur : « banniere », seulement achetée à la boutique", () => {
    const lu = lireReponseDesAchats({ ok: true, jusqu_a: 64, achats: [ligne(), ligne({ id: 62, objet: "inconnue" }), ligne({ id: 63, nature: "pochette" }), ligne({ id: 64, nature: "marche_achat" })] });
    expect(lu?.achats.map((a) => `${a.emplacement}/${a.objet}`)).toEqual([`banniere/${b.id}`]);
    expect(lu?.inconnus).toBe(3);
  });

  it("se dit en mots : nom, « bannière », rareté, à la boutique", () => {
    const lu = lireReponseDesAchats({ ok: true, jusqu_a: 61, achats: [ligne()] })!;
    const annonce: AnnonceDesAchats = { nom: "Brennos", discord: "brennos", achats: lu.achats };
    expect(choseDe(lu.achats[0]!)).toEqual({ nom: b.nom, rarete: "mystique", place: "bannière" });
    expect(objetEnMots(lu.achats[0]!)).toBe(`${b.nom} (bannière, rareté mystique)`);
    expect(titreEnMots(annonce, "@brennos")).toBe("@brennos a une nouvelle bannière");
    expect(annonceEnMots(annonce).join(" ")).toContain("à la boutique");
    const mixte = [lu.achats[0]!, { ...lu.achats[0]!, id: 70, emplacement: "tete" as const, objet: "couronne" }, { ...lu.achats[0]!, id: 71, nature: "pochette" as const, emplacement: "familier" as const, objet: "phenix" }];
    expect(nouveautes(mixte)).toBe("1 nouvel objet, 1 nouveau familier et 1 nouvelle bannière");
    expect(nouveautes([lu.achats[0]!, lu.achats[0]!])).toBe("2 nouvelles bannières");
  });

  it("se dessine dans sa vitrine, avec « Bannière » et son origine", () => {
    const fonts = new GazetteFonts(process.cwd());
    const achat = lireReponseDesAchats({ ok: true, jusqu_a: 61, achats: [ligne()] })!.achats[0]!;
    const vignette = vignetteDeLAchat(achat);
    expect(vignette?.largeur).toBe(124);
    expect(vignette?.hauteur).toBe(80);
    const card = achatsCard({ nom: "Brennos", discord: null, achats: [achat] }, [vignette], "https://les-gaulois.github.io", fonts.width);
    const textes = card.texts.map((t) => t.text).join(" | ");
    expect(textes).toContain("BANNIÈRE");
    expect(textes).toContain("Nouvelle bannière pour son Gaulois");
    expect(textes).toContain(b.nom);
    expect(card.dessins).toHaveLength(1);
    const d = card.dessins[0]!;
    expect(d.x + d.decor.largeur * d.echelle).toBeLessThanOrEqual(card.width);
    expect(d.y + d.decor.hauteur * d.echelle).toBeLessThanOrEqual(card.height);
  });
});
