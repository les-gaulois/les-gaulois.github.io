/**
 * Les vrais dessins du site dans le casino de « Mon Gaulois » (22 novembre 2026, maquette « Le Palais d'or » validée par le
 * pilote) : les croupiers sont de vrais Gaulois (`casesDuGaulois`), habillés d'objets de la garde-robe, avec cinq visages ;
 * les familiers de la course et le statère sont ceux du village. Rien n'est dessiné à la main ici : les tenues viennent de la
 * maquette de Claude Fable 5.2, les dessins du serveur (`supabase/functions/code-discord/`).
 */
import { FAMILIER_LARGEUR, casesDuFamilier } from "../../../supabase/functions/code-discord/familiers/familier";
import { familierDe } from "../../../supabase/functions/code-discord/familiers/index";
import { casesDuStatere, type TailleStatere } from "../../../supabase/functions/code-discord/statere";
import { GAULOIS_LARGEUR, TENUE_DE_DEPART, casesDuGaulois, type Tenue } from "../gaulois";
import { ROSE, NOIR, OR, BORDEAUX, Toile, cadreOr, disque, ton, toileDesCases } from "./casino-toile";

/** Les sept croupiers, un par jeu : le donneur du vingt-et-un, celui de la roue, le forgeron de la machine, la bergère de la course, la gardienne de la palissade, le joueur de dés, le barde du poker. */
export const CROUPIERS = ["donneur", "roue", "forgeron", "course", "palissade", "des", "barde"] as const;
export type Croupier = (typeof CROUPIERS)[number];

/** Leur tenue, posée sur la tenue de départ du jeu (maquette de Claude Fable 5.2). */
export const TENUES_DES_CROUPIERS: Readonly<Record<Croupier, Tenue>> = {
  donneur: { cheveux: "raie", teinte_cheveux: "noir", barbe: "guidon", tete: "chapeau-feutre", haut: "gilet-cuir-cloute", bas: "braies-grises", arme: "aucune", yeux: "severe", bouche: "en-coin" },
  roue: { peau: "doree", cheveux: "queue-de-cheval", teinte_cheveux: "chatain", barbe: "courte", tete: "bandeau", haut: "tunique-rayee", bas: "braies-bleues", arme: "aucune", bouche: "grand-sourire" },
  forgeron: { peau: "mate", cheveux: "degarni", teinte_cheveux: "gris", barbe: "grande", tete: "lunettes-forgeron", haut: "tablier-forgeron", bas: "braies-cuir", pieds: "bottes-fer", arme: "aucune" },
  course: { cheveux: "tresses", teinte_cheveux: "blond", barbe: "aucune", tete: "chapeau-berger", haut: "gilet-berger", bas: "braies-carreaux", arme: "aucune", yeux: "rieurs", bouche: "grand-sourire" },
  palissade: { peau: "foncee", cheveux: "courts", teinte_cheveux: "noir", barbe: "bouc", tete: "casque-cuir", haut: "plastron-cuir", bas: "braies-lacees", arme: "aucune", bouche: "sourire" },
  des: { cheveux: "meches", teinte_cheveux: "roux", barbe: "longue-moustache", tete: "bonnet", haut: "chemise-jabot", bas: "braies-rayees", arme: "aucune", yeux: "clin-d-oeil", bouche: "en-coin" },
  barde: { peau: "mate", cheveux: "tresses", teinte_cheveux: "noir", barbe: "bouc", tete: "couronne-fleurs", haut: "manteau-plumes", bas: "braies-lacees", arme: "aucune", yeux: "vifs", bouche: "sourire" },
};

/** Les cinq visages d'un croupier : au repos, concentré (il lance), content, ébahi (un grand gain), complice (rien cette fois). */
export const VISAGES = ["", "Lance", "Joie", "Bee", "Clin"] as const;
export type Visage = (typeof VISAGES)[number];
const TRAITS_DES_VISAGES: Readonly<Record<Visage, Tenue>> = {
  "": {},
  Lance: { yeux: "severe", bouche: "pincees" },
  Joie: { yeux: "rieurs", bouche: "grand-sourire" },
  Bee: { yeux: "ronds", bouche: "bee" },
  Clin: { yeux: "clin-d-oeil", bouche: "en-coin" },
};

const memo = new Map<string, Toile>();
const garde = (cle: string, faire: () => Toile): Toile => {
  let t = memo.get(cle);
  if (!t) memo.set(cle, (t = faire()));
  return t;
};

/** La tenue entière d'un croupier avec un visage. */
export const tenueDuCroupier = (nom: Croupier, visage: Visage = ""): Tenue => ({ ...TENUE_DE_DEPART, ...TENUES_DES_CROUPIERS[nom], ...TRAITS_DES_VISAGES[visage] });

/** Le croupier en pied, recadré au plus près. */
export const gaulois = (nom: Croupier, visage: Visage = ""): Toile => garde(`g|${nom}|${visage}`, () => toileDesCases(casesDuGaulois(tenueDuCroupier(nom, visage)), GAULOIS_LARGEUR));

/** Les familiers que montre le casino (la vignette de la course ; la course elle-même en prend d'autres). */
export const familier = (id: string, miroir = false): Toile =>
  garde(`f|${id}|${miroir}`, () => {
    const f = familierDe(id);
    const t = f ? toileDesCases(casesDuFamilier(f), FAMILIER_LARGEUR) : new Toile(1, 1);
    if (!miroir) return t;
    const m = new Toile(t.w, t.h);
    m.pose(t, 0, 0, true);
    return m;
  });

/** Le statère du site, à sa taille de 12, 16 ou 24 points. */
export const statere = (taille: TailleStatere): Toile => garde(`s|${taille}`, () => toileDesCases(casesDuStatere(taille), taille));

/** Le portrait d'un croupier : son buste dans un médaillon d'or, sur un fond de velours bordeaux la nuit, de rose ivoire le jour. */
export function medaillon(nom: Croupier, R = 17, jour = false, visage: Visage = ""): Toile {
  const Tl = new Toile(2 * R + 2, 2 * R + 2);
  const g = gaulois(nom, visage);
  const cx = R + 1;
  const cy = R + 1;
  const fond = new Toile(Tl.w, Tl.h);
  disque(fond, cx, cy, R - 3, (r, _a, x, y) => (jour ? ROSE : BORDEAUX).t((jour ? 0.86 : 0.5) - r * 0.3 - ((y - cy) / R) * 0.14, x, y, 1));
  const tmp = new Toile(Tl.w, Tl.h);
  tmp.pose(g, cx - (g.w >> 1), cy - 15);
  Tl.pose(fond, 0, 0);
  for (let y = 0; y < Tl.h; y++)
    for (let x = 0; x < Tl.w; x++)
      if (tmp.a(x, y) && Math.hypot(x - cx, y - cy) <= R - 3) {
        const i = (y * Tl.w + x) * 4;
        Tl.p(x, y, [tmp.d[i]!, tmp.d[i + 1]!, tmp.d[i + 2]!]);
      }
  Tl.f(0, 0, Tl.w, Tl.h, (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    const a = Math.atan2(y - cy, x - cx);
    if (d > R || d <= R - 3) return null;
    return OR.t(0.4 + 0.5 * Math.pow(0.5 + 0.5 * Math.cos(a + 2.3), 1.4) + (d > R - 1 ? -0.2 : d < R - 2 ? -0.2 : 0.1), x, y);
  });
  return Tl.cerne();
}

/** Le croupier en pied, dans un grand cadre d'or (la bannière du hall). */
export function portraitEnPied(nom: Croupier, jour: boolean): Toile {
  const g = gaulois(nom);
  const w = 54;
  const h = 74;
  const Tl = new Toile(w, h);
  Tl.f(3, 3, w - 3, h - 3, (x, y) => {
    const d = Math.hypot((x - w / 2) / w, (y - h * 0.4) / h);
    return (jour ? ROSE : BORDEAUX).t((jour ? 0.92 : 0.56) - d * 1.1, x, y, 1);
  });
  Tl.f(3, h - 12, w - 3, h - 3, (x, y) => NOIR.t(0.2 + (y - h + 12) * 0.03 + 0.2 * Math.cos((x - w / 2) * 0.1), x, y, 1));
  Tl.r(3, h - 13, w - 6, 1, ton(OR, 4));
  Tl.pose(g, (w - g.w) >> 1, h - 7 - g.h);
  cadreOr(Tl, 0, 0, w, h, 4);
  return Tl;
}
