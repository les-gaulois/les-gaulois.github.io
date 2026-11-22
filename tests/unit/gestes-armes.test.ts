import { describe, expect, it } from "vitest";
import { ROLES } from "../../supabase/functions/code-discord/duel/index";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, OBJETS, TENUE_DE_DEPART, casesDuGaulois, changerModele, changerObjet, type Tenue } from "../../src/lib/gaulois";
import {
  ARMES_RANGEES,
  BRAS,
  BRAS_DESSINES,
  CHOREGRAPHIES,
  CHOREGRAPHIES_PROPRES,
  FAMILLES_D_ARMES,
  GESTES,
  IMAGE_DU_GESTE,
  MARGES,
  MILIEU_DU_GAULOIS,
  POING,
  POSE_DE_REPOS,
  PROJECTILES_DESSINES,
  ROLES_DU_DUEL,
  TRAINEE,
  avantDuCorps,
  choregraphieDe,
  contactEntre,
  departDuProjectile,
  distanceDElan,
  distancesDElanFaceAFace,
  dessinsDuGaulois,
  dureeDuGeste,
  familleDeLArme,
  gesteDeLaCarte,
  imageDeLaPose,
  imageDuProjectile,
  instantDeLImpact,
  instantDuLacher,
  placeDuProjectile,
  poseDuGeste,
  projectileDuGeste,
  type Choregraphie,
  type DessinsDuGaulois,
  type Geste,
  type ImageDuGeste,
  type Pose,
} from "../../src/lib/jeu/gestes-armes";

// Les gestes du Gaulois dans le duel (src/lib/jeu/gestes-armes.ts) : chaque arme a sa famille et son geste, chaque geste
// revient au repos, s'arrête un instant avant l'impact, ne clignote pas, reste dans son image, en cases nettes.

const ARMES = Object.keys(OBJETS.arme);
const armesDe = (famille: string): string[] => ARMES.filter((id) => familleDeLArme(id) === famille);

/** Toutes les chorégraphies à contrôler : celles des gestes, puis celles propres à une arme (avec leur geste et leur arme). */
const TOUTES: { nom: string; geste: Geste; arme: string | null; c: Choregraphie }[] = [
  ...GESTES.map((geste) => ({ nom: geste, geste, arme: null, c: CHOREGRAPHIES[geste] })),
  ...Object.entries(CHOREGRAPHIES_PROPRES).map(([arme, c]) => ({ nom: `${familleDeLArme(arme)} (${arme})`, geste: familleDeLArme(arme) as Geste, arme, c })),
];

/** Les poses d'une chorégraphie, milliseconde par milliseconde. */
function poses(g: { geste: Geste; arme: string | null; c: Choregraphie }, pas = 1): { t: number; p: Pose }[] {
  const out: { t: number; p: Pose }[] = [];
  for (let t = 0; t <= g.c.duree; t += pas) out.push({ t, p: poseDuGeste(g.geste, t, { arme: g.arme ?? (g.geste === "tir" ? "arc" : null) }) });
  return out;
}

const estAuRepos = (p: Pose): boolean =>
  p.elan === 0 &&
  p.saut === 0 &&
  p.tete.x === 0 &&
  p.tete.y === 0 &&
  p.buste.x === 0 &&
  p.buste.y === 0 &&
  p.bras === "repos" &&
  p.objet.x === 0 &&
  p.objet.y === 0 &&
  ((p.objet.angle % 360) + 360) % 360 === 0 &&
  p.objet.glisse === 0 &&
  p.objet.visible &&
  !p.objet.derriere &&
  p.traine === null &&
  p.projectile === null;

describe("familleDeLArme", () => {
  it("range les armes de la garde-robe par leur nom et leur dessin", () => {
    expect(familleDeLArme("epee")).toBe("lame");
    expect(familleDeLArme("faux-guerre")).toBe("lame");
    expect(familleDeLArme("marteau-guerre")).toBe("masse");
    expect(familleDeLArme("hache-double")).toBe("masse");
    expect(familleDeLArme("lance")).toBe("hampe");
    expect(familleDeLArme("fourche-guerre")).toBe("hampe");
    expect(familleDeLArme("arc")).toBe("tir");
    expect(familleDeLArme("fronde")).toBe("tir");
    expect(familleDeLArme("javelot")).toBe("tir");
    expect(familleDeLArme("bouclier-bois")).toBe("bouclier");
    expect(familleDeLArme("carnyx")).toBe("son");
    expect(familleDeLArme("saucisson")).toBe("drole");
    expect(familleDeLArme("chat")).toBe("drole");
  });

  it("à mains nues, ce sont les poings", () => {
    expect(familleDeLArme("aucune")).toBe("poings");
    expect(familleDeLArme("")).toBe("poings");
    expect(familleDeLArme(null)).toBe("poings");
    expect(familleDeLArme(undefined)).toBe("poings");
  });

  it("chaque famille a au moins une arme, et la table ne nomme que des armes de la garde-robe", () => {
    for (const famille of FAMILLES_D_ARMES) expect(famille === "poings" ? ["aucune"] : armesDe(famille), famille).not.toHaveLength(0);
    for (const id of ARMES_RANGEES) expect(ARMES, id).toContain(id);
  });

  it("une arme ajoutée plus tard prend la famille que dit son nom, sinon elle est drôle", () => {
    expect(familleDeLArme("glaive-bronze", "Glaive de bronze")).toBe("lame");
    expect(familleDeLArme("massue-noueuse", "Massue noueuse")).toBe("masse");
    expect(familleDeLArme("pique-fer", "Pique de fer")).toBe("hampe");
    expect(familleDeLArme("lance-bronze", "Lance de bronze")).toBe("hampe");
    expect(familleDeLArme("lance-pierres", "Lance-pierres")).toBe("tir");
    expect(familleDeLArme("arc-court", "Arc court")).toBe("tir");
    expect(familleDeLArme("ecu-peint", "Écu peint")).toBe("bouclier");
    expect(familleDeLArme("flute-roseau", "Flûte de roseau")).toBe("son");
    expect(familleDeLArme("cuillere-bois", "Cuillère en bois")).toBe("drole");
  });
});

describe("gesteDeLaCarte", () => {
  it("connaît les rôles du moteur du duel, ni plus ni moins", () => {
    expect([...new Set(Object.values(ROLES))].sort()).toEqual([...ROLES_DU_DUEL].sort());
  });

  it("une frappe prend le geste de la famille de son arme, les autres cartes celui de leur rôle", () => {
    expect(gesteDeLaCarte("frappe", "epee")).toBe("lame");
    expect(gesteDeLaCarte("frappe", "fronde")).toBe("tir");
    expect(gesteDeLaCarte("frappe", null)).toBe("poings");
    expect(gesteDeLaCarte("tete")).toBe("cogne");
    expect(gesteDeLaCarte("garde")).toBe("garde");
    expect(gesteDeLaCarte("elan")).toBe("elan");
    expect(gesteDeLaCarte("souffle")).toBe("souffle");
  });

  it("une arme qui a son propre geste le prend dans sa famille seulement", () => {
    for (const [arme, c] of Object.entries(CHOREGRAPHIES_PROPRES)) {
      const famille = familleDeLArme(arme);
      expect(choregraphieDe(famille, arme), arme).toBe(c);
      expect(dureeDuGeste(famille, arme)).toBe(c.duree);
      expect(instantDeLImpact(famille, arme)).toBe(c.impact);
      expect(choregraphieDe("garde", arme)).toBe(CHOREGRAPHIES.garde);
    }
  });
});

describe("projectileDuGeste", () => {
  it("le tir envoie le projectile de son arme, l'instrument une onde, les autres rien", () => {
    expect(projectileDuGeste("tir", "fronde")).toBe("pierre");
    expect(projectileDuGeste("tir", "arc")).toBe("fleche");
    expect(projectileDuGeste("tir", "arbalete")).toBe("carreau");
    expect(projectileDuGeste("tir", "lance-patates")).toBe("patate");
    expect(projectileDuGeste("tir", "javelot")).toBe("objet");
    expect(projectileDuGeste("son", "carnyx")).toBe("onde");
    for (const g of GESTES.filter((x) => x !== "tir" && x !== "son")) expect(projectileDuGeste(g, "arc")).toBeNull();
  });
});

describe.each(TOUTES)("la chorégraphie $nom", (g) => {
  const { c } = g;
  const tout = poses(g);

  it("va du repos au repos, en clés rangées, en 1,2 seconde au plus", () => {
    expect(c.duree).toBeGreaterThan(0);
    expect(c.duree).toBeLessThanOrEqual(1200);
    expect(c.cles[0]?.t).toBe(0);
    expect(c.cles[0]?.pose).toEqual({});
    expect(c.cles.at(-1)?.t).toBe(c.duree);
    for (let i = 1; i < c.cles.length; i++) expect((c.cles[i]?.t ?? 0) > (c.cles[i - 1]?.t ?? 0), `clé ${i}`).toBe(true);
    expect(estAuRepos(tout[0]!.p)).toBe(true);
    expect(estAuRepos(tout.at(-1)!.p)).toBe(true);
    expect(estAuRepos(poseDuGeste(g.geste, -10, { arme: g.arme }))).toBe(true);
    expect(estAuRepos(poseDuGeste(g.geste, c.duree + 10, { arme: g.arme }))).toBe(true);
    // Juste avant la fin, le Gaulois est déjà presque revenu : rien ne saute à la dernière image.
    const avant = poseDuGeste(g.geste, c.duree - 1, { arme: g.arme });
    expect(Math.abs(avant.elan)).toBeLessThan(0.05);
    expect(Math.abs(avant.buste.x) + Math.abs(avant.buste.y) + Math.abs(avant.tete.x) + Math.abs(avant.tete.y)).toBeLessThanOrEqual(1);
  });

  it("s'arrête un court instant avant l'impact, puis frappe", () => {
    if (g.geste === "elan" || g.geste === "souffle") {
      expect(c.impact).toBeNull();
      return;
    }
    expect(c.impact).not.toBeNull();
    expect(c.arret).not.toBeNull();
    const impact = c.impact ?? 0;
    const [a, b] = c.arret ?? [0, 0];
    expect(b - a).toBeGreaterThanOrEqual(60);
    expect(b - a).toBeLessThanOrEqual(200);
    expect(b).toBeLessThanOrEqual(impact);
    // Pour le tir et le son, l'arrêt précède le lâcher du projectile, qui vole ensuite jusqu'à l'impact.
    const tire = g.geste === "tir" || g.geste === "son";
    const coup = tire ? (c.cles.find((k) => k.pose.tir !== undefined)?.t ?? impact) : impact;
    expect(b).toBeLessThanOrEqual(coup);
    expect(coup - b).toBeLessThanOrEqual(160);
    expect(impact).toBeLessThanOrEqual(tire ? 900 : 700);
    const figee = poseDuGeste(g.geste, a, { arme: g.arme });
    for (let t = a; t <= b; t++) expect(poseDuGeste(g.geste, t, { arme: g.arme }), `${t} ms`).toEqual(figee);
    // Et le coup part vraiment : la pose de l'impact n'est pas celle de l'arrêt.
    expect(poseDuGeste(g.geste, impact, { arme: g.arme })).not.toEqual(figee);
  });

  it("garde ses décalages en cases entières, dans leurs bornes", () => {
    for (const { t, p } of tout) {
      for (const v of [p.saut, p.tete.x, p.tete.y, p.buste.x, p.buste.y, p.objet.x, p.objet.y, p.objet.angle, p.objet.glisse]) expect(Number.isInteger(v), `${t} ms`).toBe(true);
      expect(p.tete.x).toBeGreaterThanOrEqual(-5);
      expect(p.tete.x).toBeLessThanOrEqual(5);
      expect(p.tete.y).toBeGreaterThanOrEqual(-5);
      expect(p.tete.y).toBeLessThanOrEqual(5);
      expect(p.buste.x).toBeGreaterThanOrEqual(-5);
      expect(p.buste.x).toBeLessThanOrEqual(5);
      expect(p.buste.y).toBeGreaterThanOrEqual(-5);
      expect(p.buste.y).toBeLessThanOrEqual(5);
      expect(p.saut).toBeGreaterThanOrEqual(-8);
      expect(p.saut).toBeLessThanOrEqual(0);
      expect(p.objet.glisse).toBeGreaterThanOrEqual(-12);
      expect(p.objet.glisse).toBeLessThanOrEqual(14);
      expect(Math.abs(p.objet.x)).toBeLessThanOrEqual(8);
      expect(Math.abs(p.objet.y)).toBeLessThanOrEqual(8);
      expect(p.elan).toBeGreaterThanOrEqual(-0.5);
      expect(p.elan).toBeLessThanOrEqual(1);
      expect(BRAS).toContain(p.bras);
    }
  });

  it("ne clignote pas : les bras, l'objet derrière et l'objet en main changent au plus deux fois", () => {
    const changements = (lire: (p: Pose) => unknown): number => tout.reduce((n, { p }, i) => (i > 0 && lire(p) !== lire(tout[i - 1]!.p) ? n + 1 : n), 0);
    expect(changements((p) => p.bras)).toBeLessThanOrEqual(2);
    expect(changements((p) => p.objet.derriere)).toBeLessThanOrEqual(2);
    expect(changements((p) => p.objet.visible)).toBeLessThanOrEqual(2);
    expect(changements((p) => p.projectile !== null)).toBeLessThanOrEqual(2);
    expect(changements((p) => p.traine !== null)).toBeLessThanOrEqual(2);
  });

  it("n'envoie un projectile que pour le tir et le son : une seule fois, qui touche à l'impact", () => {
    const enVol = tout.filter(({ p }) => p.projectile);
    if (g.geste !== "tir" && g.geste !== "son") {
      expect(enVol).toHaveLength(0);
      return;
    }
    expect(enVol.length).toBeGreaterThan(0);
    const premier = enVol[0]!;
    const dernier = enVol.at(-1)!;
    expect(dernier.t - premier.t + 1).toBe(enVol.length);
    expect(premier.p.projectile?.avance).toBe(0);
    for (let i = 1; i < enVol.length; i++) expect(enVol[i]!.p.projectile!.avance).toBeGreaterThanOrEqual(enVol[i - 1]!.p.projectile!.avance);
    expect(poseDuGeste(g.geste, c.impact ?? 0, { arme: g.arme ?? "arc" }).projectile?.avance).toBe(1);
    expect(dernier.t - (c.impact ?? 0)).toBeLessThanOrEqual(2);
  });

  it("sous le mouvement réduit, montre une seule pose fixe, sans projectile", () => {
    const fixe = poseDuGeste(g.geste, 1, { arme: g.arme, calme: true });
    expect(estAuRepos(fixe)).toBe(false);
    expect(fixe.projectile).toBeNull();
    expect(fixe.traine).toBeNull();
    for (let t = 1; t < c.duree; t += 7) expect(poseDuGeste(g.geste, t, { arme: g.arme, calme: true })).toEqual(fixe);
    expect(estAuRepos(poseDuGeste(g.geste, c.duree, { arme: g.arme, calme: true }))).toBe(true);
  });
});

describe("le javelot", () => {
  it("quitte la main quand il part, et y revient à la fin du geste", () => {
    const c = choregraphieDe("tir", "javelot");
    const depart = poseDuGeste("tir", c.impact ?? 0, { arme: "javelot" });
    expect(depart.projectile?.sorte).toBe("objet");
    expect(depart.objet.visible).toBe(false);
    expect(poseDuGeste("tir", 1, { arme: "javelot" }).objet.visible).toBe(true);
    expect(poseDuGeste("tir", c.duree, { arme: "javelot" }).objet.visible).toBe(true);
  });
});

/** L'image d'une pose ramenée à la grille du Gaulois, pour la comparer à `casesDuGaulois`. */
function auRepos(d: DessinsDuGaulois): (string | null)[] {
  const im = imageDeLaPose(d, POSE_DE_REPOS);
  const out: (string | null)[] = [];
  for (let y = 0; y < GAULOIS_HAUTEUR; y++) for (let x = 0; x < GAULOIS_LARGEUR; x++) out.push(im.cases[(y + MARGES.haut) * im.largeur + x + MARGES.gauche] ?? null);
  // Rien hors du Gaulois au repos.
  expect(im.cases.filter(Boolean).length).toBe(out.filter(Boolean).length);
  return out;
}

const avec = (arme: string, tenue: Tenue = TENUE_DE_DEPART): Tenue => changerObjet(tenue, "arme", arme);

describe("imageDeLaPose", () => {
  it("au repos, c'est exactement le dessin du site, quelle que soit l'arme", () => {
    for (const arme of ARMES) {
      const tenue = avec(arme);
      expect(auRepos(dessinsDuGaulois(tenue)), arme).toEqual(casesDuGaulois(tenue));
    }
  });

  it("aussi pour un Gaulois unique, et pour une autre peau", () => {
    for (const tenue of [changerModele(avec("epee"), "dragon"), { ...avec("hache"), peau: "foncee" }]) expect(auRepos(dessinsDuGaulois(tenue))).toEqual(casesDuGaulois(tenue));
  });

  it("le poing est au poing du dessin, dans l'image", () => {
    const im = imageDeLaPose(dessinsDuGaulois(avec("epee")), POSE_DE_REPOS);
    expect(im.poing).toEqual({ x: MARGES.gauche + POING.x, y: MARGES.haut + POING.y });
    expect(im.largeur).toBe(IMAGE_DU_GESTE.largeur);
    expect(im.hauteur).toBe(IMAGE_DU_GESTE.hauteur);
  });

  it("un tour entier redonne l'objet tel quel, un quart de tour le pose case pour case", () => {
    const d = dessinsDuGaulois(avec("epee"));
    const repos = imageDeLaPose(d, POSE_DE_REPOS).cases;
    const tourne = (angle: number): (string | null)[] => imageDeLaPose(d, { ...POSE_DE_REPOS, objet: { ...POSE_DE_REPOS.objet, angle } }).cases;
    expect(tourne(360)).toEqual(repos);
    expect(tourne(-360)).toEqual(repos);
    // L'objet seul, tourné d'un quart de tour : ni case perdue, ni case en double.
    const cases = d.objet?.filter(Boolean).length ?? 0;
    for (const angle of [0, 90, 180, -90, 270]) expect(imageDuProjectile("objet", angle, d).cases.filter(Boolean).length, `${angle}`).toBe(cases);
  });

  it("reste en cases nettes : aucune couleur qui ne soit celle du Gaulois, de ses bras ou de la traînée", () => {
    for (const arme of ["epee", "marteau-guerre", "fronde", "bouclier-umbo", "chat"]) {
      const tenue = avec(arme);
      const d = dessinsDuGaulois(tenue);
      const permises = new Set<string>([...casesDuGaulois(tenue).filter((c): c is string => !!c), ...Object.values(d.couleurs), TRAINEE.vive, TRAINEE.douce]);
      const geste = familleDeLArme(arme);
      for (let t = 0; t <= dureeDuGeste(geste, arme); t += 15) {
        const inconnues = new Set(imageDeLaPose(d, poseDuGeste(geste, t, { arme })).cases.filter((c): c is string => !!c && !permises.has(c)));
        expect([...inconnues], `${arme} ${t} ms`).toEqual([]);
      }
    }
  });

  it("une bande qui monte s'étire : pas de trou dans le Gaulois", () => {
    const d = dessinsDuGaulois(avec("aucune"));
    const im = imageDeLaPose(d, { ...POSE_DE_REPOS, tete: { x: 0, y: -2 }, buste: { x: 0, y: -2 } });
    const colonne = MARGES.gauche + 24;
    const pleines = [];
    for (let y = 0; y < im.hauteur; y++) if (im.cases[y * im.largeur + colonne]) pleines.push(y);
    expect(pleines.at(-1)! - pleines[0]! + 1).toBe(pleines.length);
  });

  it("l'objet porté derrière passe sous le Gaulois, le poing reste devant", () => {
    const tenue = avec("epee");
    const d = dessinsDuGaulois(tenue);
    const pose: Pose = { ...POSE_DE_REPOS, objet: { ...POSE_DE_REPOS.objet, angle: -90 } };
    const devant = imageDeLaPose(d, pose).cases;
    const derriere = imageDeLaPose(d, { ...pose, objet: { ...pose.objet, derriere: true } }).cases;
    const corps = imageDeLaPose(d, { ...pose, objet: { ...pose.objet, visible: false } }).cases;
    let cachees = 0;
    corps.forEach((c, i) => {
      if (!c) return;
      expect(derriere[i], `case ${i}`).toBe(c);
      if (devant[i] !== c) cachees++;
    });
    expect(cachees).toBeGreaterThan(0);
  });

  it("les bras dessinés se peignent de la peau du Gaulois et remplacent ses avant-bras", () => {
    for (const bras of BRAS.filter((b) => b !== "repos")) {
      const dessin = BRAS_DESSINES[bras as keyof typeof BRAS_DESSINES];
      for (const ligne of dessin.dessin.lignes) expect(ligne, bras).toMatch(/^[.sSk]*$/);
      expect(Number.isInteger(dessin.poing.x) && Number.isInteger(dessin.poing.y)).toBe(true);
      const tenue = { ...avec("aucune"), peau: "foncee" };
      const d = dessinsDuGaulois(tenue);
      const im = imageDeLaPose(d, { ...POSE_DE_REPOS, bras });
      for (const r of dessin.efface) {
        for (let y = r.y; y < r.y + r.hauteur; y++) {
          for (let x = r.x; x < r.x + r.largeur; x++) {
            const c = im.cases[(y + MARGES.haut) * im.largeur + x + MARGES.gauche];
            const lettre = dessin.dessin.lignes[y - dessin.dessin.y]?.[x];
            // Une case effacée n'est plus que celle du bras dessiné, ou rien.
            expect(c ?? null, `${bras} ${x},${y}`).toBe(lettre && lettre !== "." ? (d.couleurs[lettre] ?? null) : null);
          }
        }
      }
    }
  });
});

describe("chaque geste reste dans son image", () => {
  // Toutes les armes de la garde-robe, à tout instant (tous les 20 ms) : leur geste de famille (ou le leur), et les quatre
  // autres rôles, qui les portent aussi ; et chaque pose fixe.
  it.each(FAMILLES_D_ARMES.map((f) => [f]))("%s", (famille) => {
    const armes = famille === "poings" ? ["aucune"] : armesDe(famille);
    for (const arme of armes) {
      const d = dessinsDuGaulois(avec(arme));
      for (const geste of [famille, "cogne", "garde", "elan", "souffle"] as Geste[]) {
        const duree = dureeDuGeste(geste, arme);
        for (let t = 0; t <= duree; t += 20) expect(imageDeLaPose(d, poseDuGeste(geste, t, { arme })).horsCadre, `${arme}, ${geste}, ${t} ms`).toBe(0);
        expect(imageDeLaPose(d, poseDuGeste(geste, 1, { arme, calme: true })).horsCadre, `${arme}, ${geste}, pose fixe`).toBe(0);
      }
    }
  });
});

describe("les projectiles", () => {
  it("partent du poing et arrivent sur l'adversaire, en cases entières, sur leur courbe", () => {
    const depart = { x: 100, y: 200 };
    const arrivee = { x: 400, y: 184 };
    for (const sorte of ["pierre", "fleche", "carreau", "patate", "onde", "objet"] as const) {
      expect(placeDuProjectile({ sorte, avance: 0 }, depart, arrivee, 4)).toMatchObject(depart);
      expect(placeDuProjectile({ sorte, avance: 1 }, depart, arrivee, 4)).toMatchObject(arrivee);
      for (let a = 0; a <= 1; a += 0.05) {
        const p = placeDuProjectile({ sorte, avance: a }, depart, arrivee, 4);
        expect(Math.abs(p.x - depart.x) % 4).toBe(0);
        expect(Math.abs(p.y - depart.y) % 4).toBe(0);
      }
    }
    // La pierre monte en cloche ; l'onde va tout droit.
    const milieu = (sorte: "pierre" | "onde") => placeDuProjectile({ sorte, avance: 0.5 }, depart, arrivee, 4).y;
    expect(milieu("pierre")).toBeLessThan(milieu("onde"));
    expect(milieu("onde")).toBe(192);
  });

  it("vont vers l'adversaire : une flèche tirée vers la droite pointe à droite, vers la gauche à gauche", () => {
    const droite = placeDuProjectile({ sorte: "carreau", avance: 0.5 }, { x: 0, y: 0 }, { x: 300, y: 0 }, 1).angle;
    const gauche = placeDuProjectile({ sorte: "carreau", avance: 0.5 }, { x: 300, y: 0 }, { x: 0, y: 0 }, 1).angle;
    expect(Math.abs(droite - 90)).toBeLessThan(5);
    expect(Math.abs(Math.abs(gauche) - 90)).toBeLessThan(5);
    expect(Math.sign(gauche)).toBe(-1);
  });

  it("se dessinent de leurs seules couleurs, tournés ou non", () => {
    for (const [sorte, p] of Object.entries(PROJECTILES_DESSINES)) {
      const couleurs = new Set(Object.values(p.couleurs));
      for (const angle of [90, 45, 0, -90, 135]) {
        const im = imageDuProjectile(sorte as "pierre", angle);
        expect(im.cases.filter(Boolean).length, `${sorte} ${angle}`).toBeGreaterThan(0);
        for (const c of im.cases) if (c) expect(couleurs.has(c), `${sorte} ${angle} ${c}`).toBe(true);
        expect(im.cases).toHaveLength(im.largeur * im.hauteur);
      }
      for (const ligne of p.lignes) for (const lettre of ligne) if (lettre !== ".") expect(p.couleurs[lettre], `${sorte} ${lettre}`).toBeDefined();
    }
  });

  it("l'objet lancé, c'est l'objet du Gaulois", () => {
    const d = dessinsDuGaulois(avec("javelot"));
    const im = imageDuProjectile("objet", 90, d);
    const couleurs = new Set(d.objet?.filter((c): c is string => !!c));
    const pleines = im.cases.filter((c): c is string => !!c);
    expect(pleines.length).toBeGreaterThan(20);
    for (const c of pleines) expect(couleurs.has(c)).toBe(true);
  });
});

describe("le vol du projectile", () => {
  it("part au lâcher et vole à vitesse égale jusqu'à l'impact", () => {
    for (const [geste, arme] of [["tir", "arc"], ["tir", "fronde"], ["son", "carnyx"], ["son", "tambour"]] as const) {
      const c = choregraphieDe(geste, arme);
      const lacher = c.cles.find((k) => k.pose.tir !== undefined)?.t ?? 0;
      const impact = c.impact ?? 0;
      expect(poseDuGeste(geste, lacher - 1, { arme }).projectile).toBeNull();
      expect(poseDuGeste(geste, Math.round((lacher + impact) / 2), { arme }).projectile?.avance).toBeCloseTo(0.5, 2);
      expect(poseDuGeste(geste, impact + 1, { arme }).projectile).toBeNull();
    }
  });

  it("part du poing pour la flèche, le carreau et l'objet lancé, du bout de l'objet pour la pierre, la patate et le son", () => {
    const fronde = imageDeLaPose(dessinsDuGaulois(avec("fronde")), POSE_DE_REPOS);
    expect(fronde.bout.y).toBeGreaterThan(fronde.poing.y + 8);
    expect(departDuProjectile("pierre", fronde)).toEqual(fronde.bout);
    expect(departDuProjectile("fleche", fronde)).toEqual(fronde.poing);
    const carnyx = imageDeLaPose(dessinsDuGaulois(avec("carnyx")), POSE_DE_REPOS);
    expect(carnyx.bout.y).toBeLessThan(carnyx.poing.y - 20);
    expect(departDuProjectile("onde", carnyx)).toEqual(carnyx.bout);
    const mains = imageDeLaPose(dessinsDuGaulois(avec("aucune")), POSE_DE_REPOS);
    expect(mains.bout).toEqual(mains.poing);
  });
});

describe("distanceDElan", () => {
  const contact = 60;

  it("mesure l'écart entre les avants de deux Gaulois face à face", () => {
    const d = dessinsDuGaulois(avec("epee"));
    // Le bras droit du dessin finit à la colonne 39.
    expect(avantDuCorps(d)).toBe(40);
    expect(contactEntre(d, d, 100)).toBe(100 + GAULOIS_LARGEUR - 2 * 40);
  });

  it("amène chaque coup au contact de l'adversaire, qu'on tienne une dague ou une hallebarde", () => {
    const essais: [Geste, string][] = [
      ...ARMES.filter((id) => ["lame", "masse", "hampe", "bouclier", "drole"].includes(familleDeLArme(id))).map((id) => [familleDeLArme(id) as Geste, id] as [Geste, string]),
      ["poings", "aucune"],
      ["cogne", "epee"],
      ["cogne", "hallebarde"],
    ];
    let mesures = 0;
    for (const [geste, arme] of essais) {
      const d = dessinsDuGaulois(avec(arme));
      const distance = distanceDElan(d, geste, contact, arme);
      expect(Number.isInteger(distance), arme).toBe(true);
      const pose = poseDuGeste(geste, instantDeLImpact(geste, arme) ?? 0, { arme });
      if (pose.elan < 0.2) continue;
      const image = imageDeLaPose(d, { ...pose, traine: null });
      let devant = 0;
      image.cases.forEach((c, i) => {
        if (c) devant = Math.max(devant, (i % image.largeur) + 1);
      });
      const avance = Math.round(pose.elan * distance);
      const ecart = contact - (devant - MARGES.gauche - avantDuCorps(d)) - avance;
      // Il touche à une case près ; une arme qui touche déjà de chez elle n'avance pas.
      if (distance > 0) expect(Math.abs(ecart), `${geste} ${arme}`).toBeLessThanOrEqual(1);
      else expect(ecart, `${geste} ${arme}`).toBeLessThanOrEqual(0);
      mesures++;
    }
    expect(mesures).toBeGreaterThan(40);
  });

  it("une arme courte va plus loin qu'une longue, et les poings plus loin que la lance", () => {
    expect(distanceDElan(dessinsDuGaulois(avec("dague")), "lame", contact, "dague")).toBeGreaterThan(distanceDElan(dessinsDuGaulois(avec("epee-longue")), "lame", contact, "epee-longue"));
    expect(distanceDElan(dessinsDuGaulois(avec("lance")), "hampe", contact, "lance")).toBeLessThan(distanceDElan(dessinsDuGaulois(avec("aucune")), "poings", contact, "aucune"));
  });

  it("un geste qui ne va pas au contact prend la moitié de l'écart", () => {
    for (const [geste, arme] of [["tir", "arc"], ["son", "carnyx"], ["garde", "epee"], ["elan", "epee"], ["souffle", "epee"]] as const) {
      expect(distanceDElan(dessinsDuGaulois(avec(arme)), geste, contact, arme)).toBe(30);
    }
  });
});

describe("les corrections de la relecture", () => {
  it("la traînée de la lame se voit à l'instant même de l'impact", () => {
    expect(poseDuGeste("lame", instantDeLImpact("lame") ?? 0, { arme: "epee" }).traine).not.toBeNull();
  });

  it("une pose rendue est à l'écran : il peut la changer sans toucher au repos", () => {
    const p = poseDuGeste("lame", -1);
    p.elan = 3;
    p.objet.angle = 45;
    expect(poseDuGeste("lame", -1).elan).toBe(0);
    expect(POSE_DE_REPOS.objet.angle).toBe(0);
  });

  it("donne l'instant du lâcher des gestes qui tirent, et rien aux autres", () => {
    for (const [geste, arme] of [["tir", "arc"], ["tir", "fronde"], ["tir", "javelot"], ["son", "carnyx"]] as const) {
      const lacher = instantDuLacher(geste, arme);
      expect(lacher, arme).not.toBeNull();
      expect(poseDuGeste(geste, lacher ?? 0, { arme }).projectile?.avance).toBe(0);
      expect(poseDuGeste(geste, (lacher ?? 0) - 1, { arme }).projectile).toBeNull();
    }
    expect(instantDuLacher("lame", "epee")).toBeNull();
    expect(instantDuLacher("garde", "arc")).toBeNull();
  });

  it("un Gaulois unique garde ses bras du dessin : rien de son corps n'est effacé", () => {
    for (const modele of ["dragon", "lezard", "axolotl"]) {
      const d = dessinsDuGaulois(changerModele(avec("epee"), modele));
      expect(d.brasMobiles).toBe(false);
      const repos = imageDeLaPose(d, POSE_DE_REPOS).cases;
      for (const bras of BRAS) expect(imageDeLaPose(d, { ...POSE_DE_REPOS, bras }).cases, `${modele} ${bras}`).toEqual(repos);
    }
    expect(dessinsDuGaulois(avec("epee")).brasMobiles).toBe(true);
  });

  it("la pierre et l'onde se retournent quand elles partent vers la gauche", () => {
    for (const sorte of ["onde", "pierre"] as const) {
      const droite = imageDuProjectile(sorte, 90);
      const gauche = imageDuProjectile(sorte, -90);
      const l = droite.largeur;
      expect(gauche.cases).toEqual(droite.cases.map((_, i) => droite.cases[Math.floor(i / l) * l + (l - 1 - (i % l))] ?? null));
      expect(Number.isInteger(droite.centre.x) && Number.isInteger(droite.centre.y)).toBe(true);
    }
  });

  it("le projectile reste sur la grille, même parti d'une demi-case", () => {
    for (let a = 0; a <= 1; a += 0.1) {
      const p = placeDuProjectile({ sorte: "pierre", avance: a }, { x: 102, y: 198 }, { x: 410, y: 170 }, 4);
      expect(Math.abs(p.x) % 4).toBe(0);
      expect(Math.abs(p.y) % 4).toBe(0);
    }
  });
});

/** Le bord avant d'une image posée dans une scène, en cases : à gauche, le Gaulois regarde à droite ; à droite, il est retourné autour de son milieu. */
function bordAvant(image: ImageDuGeste, coin: number, avance: number, droite: boolean): number {
  let min = Infinity;
  let max = -Infinity;
  image.cases.forEach((c, i) => {
    if (!c) return;
    min = Math.min(min, i % image.largeur);
    max = Math.max(max, i % image.largeur);
  });
  if (!droite) return coin - MARGES.gauche + avance + max + 1;
  const milieu = coin + GAULOIS_LARGEUR / 2 - avance;
  return milieu - (max + 1 - MILIEU_DU_GAULOIS);
}

describe("deux Gaulois face à face", () => {
  const ecart = 100;
  const coinA = 20;
  const coinB = coinA + ecart;
  const impact = (d: DessinsDuGaulois, geste: Geste, arme: string): ImageDuGeste => imageDeLaPose(d, { ...poseDuGeste(geste, instantDeLImpact(geste, arme) ?? 0, { arme }), traine: null });

  it("le coup arrive juste sur l'avant de l'adversaire resté chez lui", () => {
    const dB = dessinsDuGaulois({ ...avec("hache"), peau: "mate" });
    const avantB = bordAvant(imageDeLaPose(dB, { ...POSE_DE_REPOS, objet: { ...POSE_DE_REPOS.objet, visible: false } }), coinB, 0, true);
    for (const [geste, arme] of [["lame", "dague"], ["lame", "epee-longue"], ["masse", "marteau-guerre"], ["hampe", "hallebarde"], ["bouclier", "bouclier-bois"], ["poings", "aucune"], ["cogne", "epee"], ["drole", "poele"]] as const) {
      const dA = dessinsDuGaulois(avec(arme));
      const distance = distanceDElan(dA, geste, contactEntre(dA, dB, ecart), arme);
      const pose = poseDuGeste(geste, instantDeLImpact(geste, arme) ?? 0, { arme });
      const avantA = bordAvant(impact(dA, geste, arme), coinA, Math.round(pose.elan * distance), false);
      expect(Math.abs(avantA - avantB), `${geste} ${arme}`).toBeLessThanOrEqual(1);
    }
  });

  it("deux coups donnés ensemble se rejoignent au milieu, sans se traverser", () => {
    for (const [ga, armeA, gb, armeB] of [["lame", "epee", "poings", "aucune"], ["masse", "masse", "hampe", "lance"], ["cogne", "epee", "lame", "dague"], ["poings", "aucune", "cogne", "hache"], ["lame", "dague", "bouclier", "bouclier-bois"]] as const) {
      const dA = dessinsDuGaulois(avec(armeA));
      const dB = dessinsDuGaulois({ ...avec(armeB), peau: "mate" });
      const [distA, distB] = distancesDElanFaceAFace({ d: dA, geste: ga, arme: armeA }, { d: dB, geste: gb, arme: armeB }, contactEntre(dA, dB, ecart));
      const poseA = poseDuGeste(ga, instantDeLImpact(ga, armeA) ?? 0, { arme: armeA });
      const poseB = poseDuGeste(gb, instantDeLImpact(gb, armeB) ?? 0, { arme: armeB });
      const avantA = bordAvant(impact(dA, ga, armeA), coinA, Math.round(poseA.elan * distA), false);
      const avantB = bordAvant(impact(dB, gb, armeB), coinB, Math.round(poseB.elan * distB), true);
      // Deux armes longues qui se touchent déjà de chez elles restent en place, leurs armes croisées.
      if (distA === 0 && distB === 0) expect(avantA, `${armeA} contre ${armeB}`).toBeGreaterThanOrEqual(avantB);
      else expect(Math.abs(avantA - avantB), `${armeA} contre ${armeB}`).toBeLessThanOrEqual(2);
    }
  });
});
