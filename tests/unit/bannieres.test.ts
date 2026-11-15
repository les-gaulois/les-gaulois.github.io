import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { poserLeCadre } from "../../supabase/functions/code-discord/bannieres/cadres";
import { HAUTEUR, LARGEUR, RARETES_DES_BANNIERES } from "../../supabase/functions/code-discord/bannieres/commun";
import { BANNIERES, FAMILLES_DES_BANNIERES, banniereParId, dessinDeLaBanniere } from "../../supabase/functions/code-discord/bannieres/index";
import { LOT_A } from "../../supabase/functions/code-discord/bannieres/lot-a";
import { LOT_B } from "../../supabase/functions/code-discord/bannieres/lot-b";
import { LOT_C } from "../../supabase/functions/code-discord/bannieres/lot-c";
import { LOT_D } from "../../supabase/functions/code-discord/bannieres/lot-d";
import { LOT_E } from "../../supabase/functions/code-discord/bannieres/lot-e";
import { casesDeLaScene, DECOR_LARGEUR, decrireLaScene, IMAGE_GAULOIS, imageDeLaScene, PLACE_DU_LOGO, TENUE_DE_DEPART } from "../../supabase/functions/code-discord/gaulois";
import { gauloisMessage } from "../../supabase/functions/code-discord/index";
import { annonceEnMots, choseDe, lireReponseDesAchats, nouveautes, objetEnMots, titreEnMots, vignetteDeLAchat, type AnnonceDesAchats } from "../../src/lib/achats-discord";
import { achatsCard } from "../../src/lib/achats-image";
import { GazetteFonts } from "../../src/lib/gazette-image";
import { ORDRE_RARETES } from "../../src/lib/gaulois";
import {
  comptesParRarete,
  etatDeLaBanniere,
  lireAchatBanniere,
  lireChoixBanniere,
  lireMesBannieres,
  manquePour,
  messageDesBannieres,
  rangerLesBannieres,
  sceneDeLaBanniere,
  vignetteDeLaBanniere,
} from "../../src/lib/village/bannieres";
import { FOIS_LE_PRIX_D_UN_OBJET, PRIX_BANNIERE_PAR_RARETE, PRIX_PAR_RARETE } from "../../src/lib/village/contrat";

// Sous Windows, Git rend le fichier avec des fins de ligne CRLF : les motifs ci-dessous lisent des « \n ».
const MIGRATION = readFileSync("supabase/migrations/20261115000900_bannieres_du_gaulois.sql", "utf8").replace(/\r\n/g, "\n");
const LOTS = { A: LOT_A, B: LOT_B, C: LOT_C, D: LOT_D, E: LOT_E };
const HEX = /^#[0-9a-f]{6}$/;

describe("les bannières dessinées", () => {
  it("sont 40, en cinq familles de 8, et 10, 10, 10, 5, 5 par rareté", () => {
    expect(BANNIERES).toHaveLength(40);
    expect(new Set(BANNIERES.map((b) => b.id)).size).toBe(40);
    for (const famille of Object.keys(FAMILLES_DES_BANNIERES)) expect(BANNIERES.filter((b) => b.famille === famille), famille).toHaveLength(8);
    expect(comptesParRarete(null)).toEqual({ commun: 10, "peu-commun": 10, epique: 10, mystique: 5, legendaire: 5 });
    // Chaque lot : 2 communes, 2 peu communes, 2 épiques, 1 mystique, 1 légendaire, toutes de sa famille.
    for (const [lettre, lot] of Object.entries(LOTS)) {
      expect(lot, lettre).toHaveLength(8);
      expect(new Set(lot.map((b) => b.famille)).size, lettre).toBe(1);
      expect(RARETES_DES_BANNIERES.map((r) => lot.filter((b) => b.rarete === r).length), lettre).toEqual([2, 2, 2, 1, 1]);
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

describe("la liste et les règles du serveur (migration des bannières)", () => {
  it("connaît exactement les bannières du dessin, avec leur rareté", () => {
    const lignes = [...MIGRATION.matchAll(/^ {2}\('([a-z-]+)', '([a-z-]+)'\)/gm)].map(([, id, rarete]) => `${id}/${rarete}`);
    expect(lignes.sort()).toEqual(BANNIERES.map((b) => `${b.id}/${b.rarete}`).sort());
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

describe("la lecture des réponses du serveur", () => {
  const [a, b] = BANNIERES;
  const prix = { commun: 300, "peu-commun": 750, epique: 1500, mystique: 3000, legendaire: 7500 };
  const reponse = (p: Record<string, unknown> = {}) => ({
    ok: true,
    solde: 4200,
    peut_acheter: true,
    prix,
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
    expect(messageDesBannieres("pas_possede")).toContain("achetez-la d'abord");
    for (const code of ["not_validated", "no_gaulois", "unknown_banniere", "prix_change", "solde_insuffisant"]) {
      expect(messageDesBannieres(code), code).not.toBe(code);
      expect(messageDesBannieres(code).length, code).toBeGreaterThan(10);
    }
  });
});

describe("le rangement de la boutique", () => {
  it("range par famille puis de la plus courante à la plus rare, avec les comptes de chaque famille", () => {
    const toutes = rangerLesBannieres({ famille: null, rarete: null }, new Set([BANNIERES[0]!.id]));
    expect(toutes.map((f) => f.famille)).toEqual(Object.keys(FAMILLES_DES_BANNIERES));
    expect(toutes.flatMap((f) => f.bannieres)).toHaveLength(40);
    for (const f of toutes) {
      const rangs = f.bannieres.map((b) => ORDRE_RARETES.indexOf(b.rarete));
      expect(rangs).toEqual([...rangs].sort((x, y) => x - y));
      expect(f.total).toBe(8);
    }
    expect(toutes.reduce((n, f) => n + f.possedees, 0)).toBe(1);
  });

  it("filtre par famille et par rareté, sans rendre une famille vide", () => {
    const legendaires = rangerLesBannieres({ famille: null, rarete: "legendaire" }, new Set());
    expect(legendaires.flatMap((f) => f.bannieres).every((b) => b.rarete === "legendaire")).toBe(true);
    expect(legendaires.flatMap((f) => f.bannieres)).toHaveLength(5);
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
    expect(manquePour(1000, 7500)).toBe(6500);
    expect(manquePour(9000, 7500)).toBe(0);
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
