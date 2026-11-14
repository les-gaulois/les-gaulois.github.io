import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lirePng } from "../../supabase/functions/code-discord/billets";
import {
  EMPLACEMENTS,
  EMPLACEMENTS_CORPS,
  EMPLACEMENTS_OBJETS,
  GAULOIS_HAUTEUR,
  GAULOIS_LARGEUR,
  DECOR_HAUTEUR,
  DECOR_LARGEUR,
  IMAGE_GAULOIS,
  OBJETS,
  ORDRE_RARETES,
  POILS,
  RARETES,
  TEINTE_CHEVEUX,
  TENUE_DE_DEPART,
  casesDuDecor,
  casesDuGaulois,
  changerObjet,
  decrireGaulois,
  estGratuit,
  imageDuGaulois,
  lireTenue,
  pngDuGaulois,
  tenueAuHasard,
  tenueGratuite,
  vignetteDeLObjet,
  type Tenue,
} from "../../supabase/functions/code-discord/gaulois";
import { memeTenue, tenueDuServeur } from "../../src/lib/gaulois";

const MIGRATION = readFileSync("supabase/migrations/20261113001700_village_des_gaulois_vestiaire.sql", "utf8");

/** Un tirage reproductible, pour que les tenues au hasard soient les mêmes à chaque passage. */
function hasardFixe(graine: number): () => number {
  let etat = graine;
  return () => (etat = (etat * 48271) % 2147483647) / 2147483647;
}

/** Le Gaulois de départ avec chaque objet du catalogue, un à la fois. */
const chaqueObjet = (): Tenue[] => EMPLACEMENTS.flatMap((emplacement) => Object.keys(OBJETS[emplacement]).map((id) => changerObjet(TENUE_DE_DEPART, emplacement, id)));

describe("les dessins du Gaulois", () => {
  it("tiennent dans la grille de 48 cases sur 64, chaque rangée à sa largeur", () => {
    expect([GAULOIS_LARGEUR, GAULOIS_HAUTEUR]).toEqual([48, 64]);
    for (const emplacement of EMPLACEMENTS) {
      for (const [id, objet] of Object.entries(OBJETS[emplacement])) {
        if (!objet.dessin) continue;
        expect(objet.dessin.y, `${emplacement}/${id}`).toBeGreaterThanOrEqual(0);
        expect(objet.dessin.y + objet.dessin.lignes.length, `${emplacement}/${id}`).toBeLessThanOrEqual(GAULOIS_HAUTEUR);
        for (const ligne of objet.dessin.lignes) expect(ligne, `${emplacement}/${id}`).toHaveLength(GAULOIS_LARGEUR);
      }
    }
  });

  it("donnent une couleur à chaque case dessinée et un Gaulois différent pour chaque objet", () => {
    const vus = new Set<string>();
    for (const tenue of chaqueObjet()) {
      const cases = casesDuGaulois(tenue);
      expect(cases).toHaveLength(GAULOIS_LARGEUR * GAULOIS_HAUTEUR);
      for (const couleur of cases) if (couleur !== null) expect(couleur).toMatch(/^#[0-9a-f]{6}$/);
      vus.add(cases.join());
    }
    expect(vus.size).toBe(new Set(chaqueObjet().map((tenue) => JSON.stringify(tenue))).size);
  });

  it("changent avec la peau et la couleur des cheveux", () => {
    const depart = casesDuGaulois(TENUE_DE_DEPART).join();
    expect(casesDuGaulois({ ...TENUE_DE_DEPART, peau: "foncee" }).join()).not.toBe(depart);
    expect(casesDuGaulois({ ...TENUE_DE_DEPART, [TEINTE_CHEVEUX]: "blanc" }).join()).not.toBe(depart);
  });

  it("ont une vignette pour chaque objet dessiné, rognée à son contour, et aucune pour une case « rien »", () => {
    for (const emplacement of EMPLACEMENTS_OBJETS) {
      for (const [id, objet] of Object.entries(OBJETS[emplacement])) {
        const vignette = vignetteDeLObjet(emplacement, id);
        if (!objet.dessin) {
          expect(vignette, `${emplacement}/${id}`).toBeNull();
          continue;
        }
        expect(vignette, `${emplacement}/${id}`).not.toBeNull();
        if (!vignette) continue;
        expect(vignette.cases).toHaveLength(vignette.largeur * vignette.hauteur);
        expect(vignette.largeur).toBeLessThanOrEqual(GAULOIS_LARGEUR);
        expect(vignette.hauteur).toBeLessThanOrEqual(GAULOIS_HAUTEUR);
        // Chaque case dessinée a sa couleur : une lettre sans couleur laisserait un trou dans l'objet.
        const dessinees = objet.dessin.lignes.reduce((n, ligne) => n + [...ligne].filter((lettre) => lettre !== ".").length, 0);
        expect(dessinees, `${emplacement}/${id}`).toBeGreaterThan(0);
        expect(vignette.cases.filter((c) => c !== null), `${emplacement}/${id}`).toHaveLength(dessinees);
        for (const couleur of vignette.cases) if (couleur !== null) expect(couleur).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
    expect(vignetteDeLObjet("tete", "inconnu")).toBeNull();
  });
});

describe("le catalogue", () => {
  it("a cinq raretés, du commun au légendaire, chacune avec son nom et son rang", () => {
    expect(ORDRE_RARETES).toEqual(["commun", "peu-commun", "epique", "mystique", "legendaire"]);
    expect(ORDRE_RARETES.map((r) => RARETES[r].nom)).toEqual(["Commun", "Peu commun", "Épique", "Mystique", "Légendaire"]);
    expect(ORDRE_RARETES.map((r) => RARETES[r].rang)).toEqual([1, 2, 3, 4, 5]);
  });

  it("donne gratuitement, en commun : deux hauts, deux bas, une paire de bottes, une coiffe et une arme (demande du pilote)", () => {
    const gratuits = (emplacement: (typeof EMPLACEMENTS_OBJETS)[number]) =>
      Object.entries(OBJETS[emplacement])
        .filter(([, objet]) => objet.gratuit && objet.rarete !== null)
        .map(([id]) => id);
    expect(gratuits("haut")).toHaveLength(2);
    expect(gratuits("bas")).toHaveLength(2);
    expect(gratuits("pieds")).toEqual(["bottes"]);
    expect(gratuits("tete")).toHaveLength(1);
    expect(gratuits("arme")).toHaveLength(1);
    for (const emplacement of EMPLACEMENTS_OBJETS) for (const id of gratuits(emplacement)) expect(OBJETS[emplacement][id]?.rarete).toBe("commun");
  });

  it("garde le corps et une case « rien » par emplacement gratuits et sans rareté, et une rareté à tout le reste", () => {
    for (const emplacement of EMPLACEMENTS_CORPS) for (const objet of Object.values(OBJETS[emplacement])) expect(objet).toMatchObject({ rarete: null, gratuit: true });
    for (const emplacement of EMPLACEMENTS_OBJETS) {
      const riens = Object.values(OBJETS[emplacement]).filter((objet) => objet.dessin === null);
      expect(riens, emplacement).toHaveLength(1);
      expect(riens[0]).toMatchObject({ rarete: null, gratuit: true });
      for (const objet of Object.values(OBJETS[emplacement])) if (objet.dessin) expect(ORDRE_RARETES).toContain(objet.rarete);
      // Chaque rareté a au moins un objet à montrer dans chaque emplacement.
      for (const rarete of ORDRE_RARETES) expect(Object.values(OBJETS[emplacement]).some((objet) => objet.rarete === rarete), `${emplacement} ${rarete}`).toBe(true);
    }
  });
});

describe("une tenue", () => {
  it("de départ ou au hasard est complète et ne porte que des objets gratuits", () => {
    expect(lireTenue(TENUE_DE_DEPART)).toEqual(TENUE_DE_DEPART);
    expect(tenueGratuite(TENUE_DE_DEPART)).toBe(true);
    const hasard = hasardFixe(42);
    for (let i = 0; i < 300; i++) {
      const tenue = tenueAuHasard(hasard);
      expect(lireTenue(tenue), JSON.stringify(tenue)).toEqual(tenue);
      expect(tenueGratuite(tenue), JSON.stringify(tenue)).toBe(true);
    }
  });

  it("se lit avec un objet de la boutique, que le robot saura dessiner, mais n'est alors plus gratuite", () => {
    const doree = changerObjet(TENUE_DE_DEPART, "tete", "casque-or");
    expect(lireTenue(doree)).toEqual(doree);
    expect(tenueGratuite(doree)).toBe(false);
    expect(estGratuit("tete", "casque-or")).toBe(false);
    expect(estGratuit("tete", "inconnu")).toBe(false);
  });

  it("est refusée s'il lui manque quelque chose, ou s'il y a quoi que ce soit en trop", () => {
    const sans = (cle: string) => Object.fromEntries(Object.entries(TENUE_DE_DEPART).filter(([k]) => k !== cle));
    for (const valeur of [
      null,
      undefined,
      "tunique",
      [],
      {},
      sans("pieds"),
      sans("arme"),
      sans(TEINTE_CHEVEUX),
      { ...TENUE_DE_DEPART, en_trop: "x" },
      { ...TENUE_DE_DEPART, teinte_haut: "bleu" },
      { ...TENUE_DE_DEPART, [TEINTE_CHEVEUX]: "violet" },
      { ...TENUE_DE_DEPART, pieds: "patins" },
      { ...TENUE_DE_DEPART, pieds: 3 },
      { ...TENUE_DE_DEPART, peau: "toString" },
    ]) {
      expect(lireTenue(valeur), JSON.stringify(valeur)).toBeNull();
    }
  });

  it("ne change que l'emplacement choisi, et reste telle quelle pour un objet inconnu", () => {
    expect(changerObjet(TENUE_DE_DEPART, "pieds", "nus")).toEqual({ ...TENUE_DE_DEPART, pieds: "nus" });
    expect(changerObjet(TENUE_DE_DEPART, "pieds", "patins")).toBe(TENUE_DE_DEPART);
  });

  it("se dit en mots, pour qui ne voit pas l'image", () => {
    const texte = decrireGaulois(TENUE_DE_DEPART);
    const nbsp = String.fromCharCode(0xa0);
    expect(texte).toBe(
      ["Gaulois en pixels", "Peau : claire", "Cheveux : courts, roux", "Barbe : moustache", "Tête : tête nue", "Haut : tunique bleue", "Bas : braies à carreaux", "Pieds : bottes de cuir", "Arme : gourdin"].join(". ").replaceAll(" :", `${nbsp}:`) + ".",
    );
    for (const emplacement of EMPLACEMENTS) {
      const nom = OBJETS[emplacement][TENUE_DE_DEPART[emplacement] ?? ""]?.nom ?? "";
      expect(texte.toLowerCase(), emplacement).toContain(nom.toLowerCase());
    }
    expect(texte.toLowerCase()).toContain(POILS.roux.nom.toLowerCase());
    expect(texte.length).toBeLessThanOrEqual(1024);
    expect(decrireGaulois(changerObjet(TENUE_DE_DEPART, "arme", "aucune"))).not.toBe(texte);
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
  it("connaît exactement les objets du dessin, avec leur rareté et s'ils sont gratuits (migration du vestiaire)", () => {
    const lignes = [...MIGRATION.matchAll(/^ {2}\('([a-z]+)', '([a-z-]+)', ('[a-z-]+'|null), (true|false)\)/gm)].map(([, emplacement, objet, rarete, gratuit]) => `${emplacement}/${objet}/${rarete?.replaceAll("'", "")}/${gratuit}`);
    const attendues = EMPLACEMENTS.flatMap((emplacement) => Object.entries(OBJETS[emplacement]).map(([id, objet]) => `${emplacement}/${id}/${objet.rarete ?? "null"}/${objet.gratuit}`));
    expect(lignes.sort()).toEqual(attendues.sort());
  });

  it("vérifie les mêmes emplacements, les mêmes couleurs de cheveux et les mêmes raretés", () => {
    expect(MIGRATION).toContain(`foreach v_emplacement in array array[${EMPLACEMENTS.map((e) => `'${e}'`).join(", ")}] loop`);
    expect(MIGRATION).toContain(`any (array[${Object.keys(POILS).map((p) => `'${p}'`).join(", ")}])`);
    expect(MIGRATION).toContain(`rarete in (${ORDRE_RARETES.map((r) => `'${r}'`).join(", ")})`);
    expect(MIGRATION).toContain(`= ${EMPLACEMENTS.length + 1};`);
    // Seuls les objets gratuits s'enregistrent tant que la boutique n'existe pas.
    expect(MIGRATION).toContain("o.objet = p_tenue ->> v_emplacement and o.gratuit");
  });

  it("garde ses tables privées et ne laisse la fonction de /gaulois qu'à la clé de service", () => {
    expect(MIGRATION).toContain("revoke all on function public.discord_gaulois(text) from public, anon, authenticated;");
    expect(MIGRATION).toContain("grant execute on function public.discord_gaulois(text) to service_role;");
    expect(MIGRATION).not.toMatch(/grant execute on function public\.discord_gaulois\(text\) to (anon|authenticated)/);
    // Des tables privées, comme toutes celles du schéma internal depuis le 8 novembre 2026 : RLS active, droits retirés.
    for (const table of ["internal.gaulois_objets", "internal.gaulois"]) {
      expect(MIGRATION).toContain(`alter table ${table} enable row level security;`);
      expect(MIGRATION).toContain(`revoke all on table ${table} from public, anon, authenticated;`);
    }
    expect(MIGRATION).not.toMatch(/raw_user_meta_data|drop table|drop column|truncate/i);
  });
});

describe("l'image de /gaulois", () => {
  it("est un PNG de 496 sur 320, plus large que haut comme les autres images du robot", async () => {
    expect(IMAGE_GAULOIS.largeur / IMAGE_GAULOIS.hauteur).toBeGreaterThanOrEqual(1.55);
    const image = await lirePng(await pngDuGaulois(TENUE_DE_DEPART));
    expect(image).toMatchObject({ largeur: 496, hauteur: 320 });
  });

  it("pose un décor de nuit en cases de 4 pixels : le ciel du site en haut, le sol en bas, et seulement des couleurs écrites", () => {
    const decor = casesDuDecor();
    expect([DECOR_LARGEUR, DECOR_HAUTEUR]).toEqual([124, 80]);
    expect(decor).toHaveLength(DECOR_LARGEUR * DECOR_HAUTEUR);
    for (const couleur of decor) expect(couleur).toMatch(/^#[0-9a-f]{6}$/);
    // Le haut du ciel est le fond du site, comme sur les autres images du robot ; le sol est plus bas que le ciel.
    expect([decor[0], decor[DECOR_LARGEUR - 1]]).toEqual(["#0a1230", "#0a1230"]);
    expect(decor[decor.length - 1]).not.toBe("#0a1230");
    // Sobre : une vingtaine de couleurs au plus, et le même décor à chaque image.
    expect(new Set(decor).size).toBeLessThanOrEqual(32);
    expect(casesDuDecor()).toBe(decor);
    // Les seules couleurs chaudes sont les feux : la porte de la hutte et la torche, moins d'une case sur cinquante.
    const chaudes = decor.filter((couleur) => parseInt(couleur.slice(1, 3), 16) > parseInt(couleur.slice(5, 7), 16)).length;
    expect(chaudes).toBeGreaterThan(0);
    expect(chaudes / decor.length).toBeLessThan(0.02);
  });

  it("montre le Gaulois devant le décor, en entier, avec n'importe quel objet du catalogue", { timeout: 30_000 }, () => {
    const { largeur, hauteur, echelle } = IMAGE_GAULOIS;
    expect(GAULOIS_HAUTEUR * echelle).toBeLessThanOrEqual(hauteur);
    const decor = casesDuDecor();
    const pixel = (image: ReturnType<typeof imageDuGaulois>, x: number, y: number) => {
      const i = (y * largeur + x) * 4;
      return `#${[0, 1, 2].map((d) => (image.rgba[i + d] ?? 0).toString(16).padStart(2, "0")).join("")}`;
    };
    const duDecor = (x: number, y: number) => decor[Math.floor(y / echelle) * DECOR_LARGEUR + Math.floor(x / echelle)];
    for (const tenue of chaqueObjet()) {
      const image = imageDuGaulois(tenue);
      expect(image.rgba).toHaveLength(largeur * hauteur * 4);
      // Les quatre coins et les bords gauche et droit restent au décor : rien ne déborde du cadre.
      for (const [x, y] of [[2, 2], [largeur - 3, 2], [2, hauteur - 2], [largeur - 3, hauteur - 2], [2, hauteur / 2], [largeur - 3, hauteur / 2]] as const) expect(pixel(image, x, y)).toBe(duDecor(x, y));
      expect(pixel(image, 2, 2)).toBe("#0a1230");
      // Chaque couleur du Gaulois est dans l'image.
      const dans = new Set<string>();
      for (let i = 0; i < image.rgba.length; i += 4) dans.add(`#${[0, 1, 2].map((d) => (image.rgba[i + d] ?? 0).toString(16).padStart(2, "0")).join("")}`);
      for (const couleur of new Set(casesDuGaulois(tenue))) if (couleur) expect(dans.has(couleur), couleur).toBe(true);
    }
  });

  it("pose le Gaulois au milieu, les pieds sur le sol, sur son ombre", () => {
    const { largeur, echelle } = IMAGE_GAULOIS;
    const image = imageDuGaulois(TENUE_DE_DEPART);
    const pixel = (x: number, y: number) => {
      const i = (y * largeur + x) * 4;
      return `#${[0, 1, 2].map((d) => (image.rgba[i + d] ?? 0).toString(16).padStart(2, "0")).join("")}`;
    };
    const cases = casesDuGaulois(TENUE_DE_DEPART);
    const ox = (DECOR_LARGEUR - GAULOIS_LARGEUR) / 2;
    const oy = 10;
    // Chaque case pleine du Gaulois est à sa place, agrandie quatre fois.
    cases.forEach((couleur, i) => {
      if (couleur) expect(pixel((ox + (i % GAULOIS_LARGEUR)) * echelle + 1, (oy + Math.floor(i / GAULOIS_LARGEUR)) * echelle + 1)).toBe(couleur);
    });
    // Sous ses pieds, à côté de lui : l'ombre, plus sombre que le sol.
    expect(pixel((largeur / 2 - 17 * echelle) | 0, 72 * echelle + 6)).toBe("#060b1f");
  });
});
