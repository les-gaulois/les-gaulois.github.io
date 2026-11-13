import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lirePng } from "../../supabase/functions/code-discord/billets";
import {
  EMPLACEMENTS,
  GAMMES,
  GAULOIS_HAUTEUR,
  GAULOIS_LARGEUR,
  IMAGE_GAULOIS,
  OBJETS,
  TENUE_DE_DEPART,
  casesDuGaulois,
  changerObjet,
  cleTeinte,
  decrireGaulois,
  imageDuGaulois,
  lireTenue,
  pngDuGaulois,
  tenueAuHasard,
  type Tenue,
} from "../../supabase/functions/code-discord/gaulois";
import { memeTenue, tenueDuServeur } from "../../src/lib/gaulois";

const MIGRATION = readFileSync("supabase/migrations/20261113001700_village_des_gaulois_vestiaire.sql", "utf8");

/** Un tirage reproductible, pour que les tenues au hasard soient les mêmes à chaque passage. */
function hasardFixe(graine: number): () => number {
  let etat = graine;
  return () => (etat = (etat * 48271) % 2147483647) / 2147483647;
}

/** Toutes les tenues d'un objet de chaque emplacement, avec chacune de ses teintes, sur le Gaulois de départ. */
function chaqueObjet(): Tenue[] {
  return EMPLACEMENTS.flatMap((emplacement) =>
    Object.entries(OBJETS[emplacement]).flatMap(([id, objet]) => {
      const base = changerObjet(TENUE_DE_DEPART, emplacement, id);
      return objet.gamme ? Object.keys(GAMMES[objet.gamme]).map((teinte) => ({ ...base, [cleTeinte(emplacement)]: teinte })) : [base];
    }),
  );
}

describe("les dessins du Gaulois", () => {
  it("tiennent dans la grille de 24 cases sur 32, chaque rangée à sa largeur", () => {
    for (const emplacement of EMPLACEMENTS) {
      for (const [id, objet] of Object.entries(OBJETS[emplacement])) {
        if (!objet.dessin) continue;
        expect(objet.dessin.y, `${emplacement}/${id}`).toBeGreaterThanOrEqual(0);
        expect(objet.dessin.y + objet.dessin.lignes.length, `${emplacement}/${id}`).toBeLessThanOrEqual(GAULOIS_HAUTEUR);
        for (const ligne of objet.dessin.lignes) expect(ligne, `${emplacement}/${id}`).toHaveLength(GAULOIS_LARGEUR);
      }
    }
  });

  it("ont une couleur pour chaque lettre, avec toutes les teintes de chaque objet", () => {
    for (const tenue of chaqueObjet()) {
      const cases = casesDuGaulois(tenue);
      const attendues = new Set<number>();
      for (const emplacement of EMPLACEMENTS) {
        const dessin = OBJETS[emplacement][tenue[emplacement] ?? ""]?.dessin;
        dessin?.lignes.forEach((ligne, dy) => [...ligne].forEach((lettre, x) => lettre !== "." && attendues.add((dessin.y + dy) * GAULOIS_LARGEUR + x)));
      }
      // Une lettre sans couleur laisserait une case vide là où l'objet est dessiné.
      for (const i of attendues) expect(cases[i], `${JSON.stringify(tenue)} case ${i}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("dessinent la peau, les cheveux et les habits choisis, chacun à sa place", () => {
    const cases = casesDuGaulois(TENUE_DE_DEPART);
    const a = (x: number, y: number) => cases[y * GAULOIS_LARGEUR + x];
    // La joue, les cheveux roux, la tunique bleue, la case vide autour.
    expect(a(10, 9)).toBe("#f2c9a0");
    expect(a(10, 6)).toBe("#c4561f");
    expect(a(10, 19)).toBe("#2f5fa8");
    expect(a(0, 0)).toBeNull();
    const fonce = casesDuGaulois({ ...TENUE_DE_DEPART, peau: "foncee", teinte_cheveux: "blanc", teinte_haut: "rouge" });
    expect(fonce[9 * GAULOIS_LARGEUR + 10]).toBe("#7d4e30");
    expect(fonce[6 * GAULOIS_LARGEUR + 10]).toBe("#ececec");
    expect(fonce[19 * GAULOIS_LARGEUR + 10]).toBe("#b8322a");
  });

  it("donnent des Gaulois différents pour des tenues différentes", () => {
    const vus = new Set(chaqueObjet().map((tenue) => casesDuGaulois(tenue).join()));
    expect(vus.size).toBe(new Set(chaqueObjet().map((tenue) => JSON.stringify(tenue))).size);
  });
});

describe("une tenue", () => {
  it("de départ, au hasard ou faite de n'importe quel objet est lue telle quelle", () => {
    expect(lireTenue(TENUE_DE_DEPART)).toEqual(TENUE_DE_DEPART);
    const hasard = hasardFixe(42);
    for (let i = 0; i < 200; i++) {
      const tenue = tenueAuHasard(hasard);
      expect(lireTenue(tenue), JSON.stringify(tenue)).toEqual(tenue);
    }
    for (const tenue of chaqueObjet()) expect(lireTenue(tenue), JSON.stringify(tenue)).toEqual(tenue);
  });

  it("est refusée s'il lui manque un objet ou une teinte, ou s'il y a quoi que ce soit en trop", () => {
    const sans = (cle: string) => Object.fromEntries(Object.entries(TENUE_DE_DEPART).filter(([k]) => k !== cle));
    for (const valeur of [
      null,
      undefined,
      "tunique",
      [],
      {},
      sans("pieds"),
      sans("teinte_haut"),
      sans("teinte_cheveux"),
      { ...TENUE_DE_DEPART, en_trop: "x" },
      { ...TENUE_DE_DEPART, teinte_haut: "violet" },
      { ...TENUE_DE_DEPART, teinte_bas: "bleu" },
      { ...TENUE_DE_DEPART, haut: "veste-peau" },
      { ...TENUE_DE_DEPART, teinte_pieds: "rouge" },
      { ...TENUE_DE_DEPART, pieds: "patins" },
      { ...TENUE_DE_DEPART, pieds: 3 },
      { ...TENUE_DE_DEPART, peau: "toString" },
      { ...TENUE_DE_DEPART, tete: "casque", teinte_tete: "rouge" },
    ]) {
      expect(lireTenue(valeur), JSON.stringify(valeur)).toBeNull();
    }
  });

  it("garde sa teinte quand un objet de la même gamme la connaît, la change sinon, et la perd sans gamme", () => {
    const rouge = { ...TENUE_DE_DEPART, tete: "bonnet", teinte_tete: "rouge" };
    expect(changerObjet(rouge, "tete", "capuche")).toMatchObject({ tete: "capuche", teinte_tete: "rouge" });
    expect(changerObjet(rouge, "tete", "casque")).not.toHaveProperty("teinte_tete");
    expect(changerObjet(TENUE_DE_DEPART, "bas", "braies")).toMatchObject({ bas: "braies", teinte_bas: "rouge" });
    expect(changerObjet(TENUE_DE_DEPART, "bas", "braies-rayees")).toMatchObject({ teinte_bas: "vert-jaune" });
    expect(changerObjet(TENUE_DE_DEPART, "pieds", "patins")).toBe(TENUE_DE_DEPART);
    for (const tenue of chaqueObjet()) for (const emplacement of EMPLACEMENTS) for (const id of Object.keys(OBJETS[emplacement])) expect(lireTenue(changerObjet(tenue, emplacement, id))).not.toBeNull();
  });

  it("se dit en mots, pour qui ne voit pas l'image", () => {
    const nbsp = String.fromCharCode(0xa0);
    expect(decrireGaulois(TENUE_DE_DEPART)).toBe(
      ["Gaulois en pixels", "Peau : claire", "Cheveux : courts, roux", "Barbe : moustache", "Tête : rien", "Haut : tunique, bleu", "Bas : braies à carreaux, vert et jaune", "Pieds : bottes"].join(". ").replaceAll(" :", `${nbsp}:`) + ".",
    );
  });

  it("revient du serveur telle qu'il l'a gardée, ou pas du tout si elle est illisible", () => {
    expect(tenueDuServeur({ ok: true, tenue: TENUE_DE_DEPART })).toEqual(TENUE_DE_DEPART);
    expect(tenueDuServeur({ ok: true, tenue: null })).toBeNull();
    expect(tenueDuServeur({ ok: true, tenue: { ...TENUE_DE_DEPART, pieds: "patins" } })).toBeNull();
    expect(tenueDuServeur(null)).toBeNull();
    expect(memeTenue(TENUE_DE_DEPART, { ...TENUE_DE_DEPART })).toBe(true);
    expect(memeTenue(TENUE_DE_DEPART, changerObjet(TENUE_DE_DEPART, "pieds", "nus"))).toBe(false);
    expect(memeTenue(TENUE_DE_DEPART, null)).toBe(false);
    expect(memeTenue(null, null)).toBe(true);
  });
});

describe("le serveur", () => {
  it("connaît exactement les objets et les teintes du dessin (migration du vestiaire)", () => {
    const lignes = [...MIGRATION.matchAll(/\('([a-z]+)', '([a-z-]+)', array\[([^\]]*)\]::text\[\]\)/g)].map(([, emplacement, objet, teintes]) => {
      const liste = [...(teintes ?? "").matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
      return `${emplacement}/${objet}/${liste.join(",")}`;
    });
    const attendues = EMPLACEMENTS.flatMap((emplacement) => Object.entries(OBJETS[emplacement]).map(([id, objet]) => `${emplacement}/${id}/${objet.gamme ? Object.keys(GAMMES[objet.gamme]).join(",") : ""}`));
    expect(lignes.sort()).toEqual(attendues.sort());
  });

  it("vérifie les mêmes emplacements, et ne laisse la fonction de /gaulois qu'à la clé de service", () => {
    expect(MIGRATION).toContain(`array[${EMPLACEMENTS.map((e) => `'${e}'`).join(", ")}]`);
    expect(MIGRATION).toContain("revoke all on function public.discord_gaulois(text) from public, anon, authenticated;");
    expect(MIGRATION).toContain("grant execute on function public.discord_gaulois(text) to service_role;");
    // Des tables privées, comme toutes celles du schéma internal depuis le 8 novembre 2026 : RLS active, droits retirés.
    for (const table of ["internal.gaulois_objets", "internal.gaulois"]) {
      expect(MIGRATION).toContain(`alter table ${table} enable row level security;`);
      expect(MIGRATION).toContain(`revoke all on table ${table} from public, anon, authenticated;`);
    }
    expect(MIGRATION).not.toMatch(/grant execute on function public\.discord_gaulois\(text\) to (anon|authenticated)/);
    expect(MIGRATION).not.toMatch(/raw_user_meta_data|drop table|drop column|truncate/i);
  });
});

describe("l'image de /gaulois", () => {
  it("est un PNG de 496 sur 320, plus large que haut comme les autres images du robot", async () => {
    expect(IMAGE_GAULOIS.largeur / IMAGE_GAULOIS.hauteur).toBeGreaterThanOrEqual(1.55);
    const image = await lirePng(await pngDuGaulois(TENUE_DE_DEPART));
    expect(image).toMatchObject({ largeur: 496, hauteur: 320 });
  });

  it("montre le Gaulois case par case, une case faisant huit pixels, sur le fond du site", () => {
    const image = imageDuGaulois(TENUE_DE_DEPART);
    const { largeur, hauteur, echelle } = IMAGE_GAULOIS;
    const ox = (largeur - GAULOIS_LARGEUR * echelle) / 2;
    const oy = hauteur - GAULOIS_HAUTEUR * echelle - 24;
    const pixel = (x: number, y: number) => {
      const i = (y * largeur + x) * 4;
      return `#${[0, 1, 2].map((d) => (image.rgba[i + d] ?? 0).toString(16).padStart(2, "0")).join("")}`;
    };
    // La joue, au milieu de sa case de huit pixels, puis le coin du fond.
    expect(pixel(ox + 10 * echelle + 4, oy + 9 * echelle + 4)).toBe("#f2c9a0");
    expect(pixel(2, hauteur - 2)).toBe("#0a1230");
  });
});
