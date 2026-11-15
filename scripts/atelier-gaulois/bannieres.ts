/**
 * L'atelier des bannières du Gaulois (`supabase/functions/code-discord/bannieres/`) : des planches pour juger chaque dessin
 * comme Discord le montre, avec le Gaulois, les insignes et le logo par-dessus, et des contrôles de forme.
 *
 *   npx tsx scripts/atelier-gaulois/bannieres.ts            toutes les bannières
 *   npx tsx scripts/atelier-gaulois/bannieres.ts c          seulement le lot C (lettre a à e)
 *   npx tsx scripts/atelier-gaulois/bannieres.ts c un/dossier
 *
 * Les images vont dans `.cache/atelier-bannieres/<lot>/` (ignoré par Git), pour chaque bannière :
 *   <id>.png        l'image de /gaulois avec cette bannière, à 4 pixels par case (496 × 320, la taille envoyée à Discord) :
 *                   insignes d'exemple (flamme et emblème), Gaulois de départ, logo du clan, cadre de la rareté ;
 *   <id>-seule.png  la bannière seule, cadre compris, à 4 pixels par case : tout le dessin, sans rien devant ;
 *   <id>-petite.png l'image de /gaulois à 2 pixels par case (248 × 160), la taille d'une vignette de la boutique ;
 * et planche.png : toutes les bannières du lot, en images de /gaulois à 2 pixels par case, dans l'ordre du lot.
 * Le terminal écrit l'ordre, les raretés et chaque faute de forme ; le code de sortie est 1 s'il y en a une.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ecrirePng } from "../../supabase/functions/code-discord/billets";
import { poserLeCadre } from "../../supabase/functions/code-discord/bannieres/cadres";
import { HAUTEUR, LARGEUR, PIEDS, RARETES_DES_BANNIERES, type BanniereDuLot } from "../../supabase/functions/code-discord/bannieres/commun";
import { LOT_A } from "../../supabase/functions/code-discord/bannieres/lot-a";
import { LOT_B } from "../../supabase/functions/code-discord/bannieres/lot-b";
import { LOT_C } from "../../supabase/functions/code-discord/bannieres/lot-c";
import { LOT_D } from "../../supabase/functions/code-discord/bannieres/lot-d";
import { LOT_E } from "../../supabase/functions/code-discord/bannieres/lot-e";
import { GAULOIS_LARGEUR, PLACE_DU_LOGO, TENUE_DE_DEPART, casesDuGaulois, type Tenue } from "../../supabase/functions/code-discord/gaulois";
import { insignesDeLaScene, peindreLesRectangles } from "../../supabase/functions/code-discord/insignes";
import { LOGO_DU_CLAN } from "../../supabase/functions/code-discord/logo-du-clan";

const LOTS: Readonly<Record<string, readonly BanniereDuLot[]>> = { a: LOT_A, b: LOT_B, c: LOT_C, d: LOT_D, e: LOT_E };
const choix = (process.argv[2] ?? "").toLowerCase();
const lots = choix && LOTS[choix] ? { [choix]: LOTS[choix] } : LOTS;

/** Le Gaulois de départ, celui que voit un membre qui vient de créer le sien. */
const TENUE: Tenue = { ...TENUE_DE_DEPART };

const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const HEX = /^#[0-9a-f]{6}$/;

interface ImageRVBA {
  largeur: number;
  hauteur: number;
  rgba: Uint8Array<ArrayBuffer>;
}

/** L'image de /gaulois avec une bannière, comme `imageDeLaScene` de gaulois.ts, à `echelle` pixels par case. */
function composer(cases: readonly string[], ombre: string, echelle: number, seule: boolean): ImageRVBA {
  const largeur = LARGEUR * echelle;
  const hauteur = HAUTEUR * echelle;
  const rgba = new Uint8Array(new ArrayBuffer(largeur * hauteur * 4));
  const caseA = (cx: number, cy: number, couleur: string) => {
    const [r, g, b] = rgb(couleur);
    for (let dy = 0; dy < echelle; dy++) {
      for (let dx = 0; dx < echelle; dx++) {
        const x = cx * echelle + dx;
        const y = cy * echelle + dy;
        if (x < 0 || y < 0 || x >= largeur || y >= hauteur) continue;
        rgba.set([r, g, b, 255], (y * largeur + x) * 4);
      }
    }
  };
  cases.forEach((couleur, i) => caseA(i % LARGEUR, Math.floor(i / LARGEUR), couleur));
  if (seule) return { largeur, hauteur, rgba };
  // Les insignes ne se dessinent qu'à 4 pixels par case (taille de Discord) : à l'échelle 2, on les réduit d'un pixel sur deux.
  const grande = echelle === 4 ? { largeur, hauteur, rgba } : { largeur: LARGEUR * 4, hauteur: HAUTEUR * 4, rgba: new Uint8Array(new ArrayBuffer(LARGEUR * 4 * HAUTEUR * 4 * 4)) };
  peindreLesRectangles(grande, insignesDeLaScene({ niveau: { level: 87, prestige: 2, legend: false }, serie: { victoires: 12, doree: false } }));
  if (echelle !== 4) {
    for (let y = 0; y < hauteur; y++) {
      for (let x = 0; x < largeur; x++) {
        const s = ((y * 2) * grande.largeur + x * 2) * 4;
        if ((grande.rgba[s + 3] ?? 0) > 0) rgba.set(grande.rgba.subarray(s, s + 4), (y * largeur + x) * 4);
      }
    }
  }
  const ox = (LARGEUR - GAULOIS_LARGEUR) / 2;
  const oy = PIEDS - 62;
  for (let y = PIEDS - 3; y <= PIEDS + 3; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      if (((x + 0.5 - LARGEUR / 2) / 19) ** 2 + ((y + 0.5 - PIEDS - 0.5) / 2.9) ** 2 <= 1) caseA(x, y, ombre);
    }
  }
  casesDuGaulois(TENUE).forEach((couleur, i) => {
    if (couleur) caseA(ox + (i % GAULOIS_LARGEUR), oy + Math.floor(i / GAULOIS_LARGEUR), couleur);
  });
  const logo = Uint8Array.from(atob(LOGO_DU_CLAN.rgba), (c) => c.charCodeAt(0));
  const { x: lx, y: ly, cote } = PLACE_DU_LOGO;
  const pas = 4 / echelle;
  for (let y = 0; y < cote / pas; y++) {
    for (let x = 0; x < cote / pas; x++) {
      const s = ((y * pas) * cote + x * pas) * 4;
      const a = (logo[s + 3] ?? 0) / 255;
      if (a === 0) continue;
      const d = ((ly / pas + y) * largeur + lx / pas + x) * 4;
      for (let k = 0; k < 3; k++) rgba[d + k] = Math.round((logo[s + k] ?? 0) * a + (rgba[d + k] ?? 0) * (1 - a));
    }
  }
  return { largeur, hauteur, rgba };
}

const fautes: string[] = [];
const ids = new Set<string>();

for (const [lettre, lot] of Object.entries(lots)) {
  const sortie = process.argv[3] ?? join(".cache", "atelier-bannieres", lettre);
  mkdirSync(sortie, { recursive: true });
  const petites: ImageRVBA[] = [];
  const compte: Record<string, number> = Object.fromEntries(RARETES_DES_BANNIERES.map((r) => [r, 0]));
  console.log(`Lot ${lettre.toUpperCase()} : ${lot.length} bannière(s)`);
  for (const b of lot) {
    const faute = (texte: string) => fautes.push(`lot ${lettre}, ${b.id} : ${texte}`);
    if (!/^[a-z]+(-[a-z]+)*$/.test(b.id) || b.id.length > 40) faute("identifiant hors de la règle (minuscules sans accent et tirets, sans chiffre, 40 signes au plus)");
    if (ids.has(b.id)) faute("identifiant déjà pris");
    ids.add(b.id);
    if (!b.nom || b.nom.length > 32) faute("nom vide ou de plus de 32 signes");
    if (!/^[A-ZÀ-Ý].*\.$/.test(b.description) || b.description.length > 140) faute("description sans majuscule, sans point final, ou de plus de 140 signes");
    if (!RARETES_DES_BANNIERES.includes(b.rarete)) faute(`rareté inconnue « ${b.rarete} »`);
    compte[b.rarete] = (compte[b.rarete] ?? 0) + 1;
    const t0 = performance.now();
    const brut = b.dessiner();
    const duree = performance.now() - t0;
    if (duree > 250) faute(`dessin trop lent (${Math.round(duree)} ms, 250 au plus)`);
    if (brut.cases.length !== LARGEUR * HAUTEUR) faute(`${brut.cases.length} cases au lieu de ${LARGEUR * HAUTEUR}`);
    const mauvaise = brut.cases.find((c) => typeof c !== "string" || !HEX.test(c));
    if (mauvaise !== undefined) faute(`couleur invalide « ${String(mauvaise)} » (« #rrggbb » en minuscules)`);
    if (!HEX.test(brut.ombre)) faute(`ombre invalide « ${brut.ombre} »`);
    const encore = b.dessiner();
    if (encore.cases.join() !== brut.cases.join()) faute("deux dessins différents : rien d'aléatoire");
    const cases = [...brut.cases];
    poserLeCadre(cases, b.rarete);
    if (mauvaise !== undefined || !HEX.test(brut.ombre) || cases.length !== LARGEUR * HAUTEUR) continue;
    writeFileSync(join(sortie, `${b.id}.png`), await ecrirePng(composer(cases, brut.ombre, 4, false)));
    writeFileSync(join(sortie, `${b.id}-seule.png`), await ecrirePng(composer(cases, brut.ombre, 4, true)));
    const petite = composer(cases, brut.ombre, 2, false);
    writeFileSync(join(sortie, `${b.id}-petite.png`), await ecrirePng(petite));
    petites.push(petite);
    console.log(`  ${b.rarete.padEnd(10)} ${b.id}  « ${b.nom} »  (${Math.round(duree)} ms)`);
  }
  console.log(`  raretés : ${RARETES_DES_BANNIERES.map((r) => `${r} ${compte[r]}`).join(", ")}`);
  if (petites.length > 0) {
    const parRangee = 4;
    const marge = 8;
    const l = LARGEUR * 2;
    const h = HAUTEUR * 2;
    const rangees = Math.ceil(petites.length / parRangee);
    const largeur = marge + Math.min(parRangee, petites.length) * (l + marge);
    const hauteur = marge + rangees * (h + marge);
    const rgba = new Uint8Array(new ArrayBuffer(largeur * hauteur * 4));
    for (let i = 0; i < rgba.length; i += 4) rgba.set([10, 18, 48, 255], i);
    petites.forEach((p, k) => {
      const x0 = marge + (k % parRangee) * (l + marge);
      const y0 = marge + Math.floor(k / parRangee) * (h + marge);
      for (let y = 0; y < h; y++) rgba.set(p.rgba.subarray(y * l * 4, (y + 1) * l * 4), ((y0 + y) * largeur + x0) * 4);
    });
    writeFileSync(join(sortie, "planche.png"), await ecrirePng({ largeur, hauteur, rgba }));
  }
  console.log(`  images : ${sortie}`);
}

if (fautes.length > 0) {
  console.error(`\n${fautes.length} faute(s) :\n${fautes.map((f) => `- ${f}`).join("\n")}`);
  process.exitCode = 1;
}
