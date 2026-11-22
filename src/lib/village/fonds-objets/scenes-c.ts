/**
 * Les fonds d'objets, lot C, « mers, monts et saisons » (voir `socle.ts` et son `CATALOGUE_DES_SCENES`) : le bord de mer,
 * le port, la montagne enneigée, le lac gelé, l'automne pluvieux, le ciel d'orage et le marais. Sept décors de plein air
 * d'une même famille : un ciel tramé en bandes, un lointain pâle, puis l'eau, la neige ou la terre où la chose se pose, les
 * détails rangés sur les côtés. La graine change le côté et la place de chaque détail ; l'accent teinte une voile, une
 * coque, un fanion, un reflet, des feuilles, un éclair ou une fleur.
 *
 * Dessin de Claude Fable 5.2, 22 novembre 2026.
 */
import { CATALOGUE_DES_SCENES, adoucir, assombrir, crete, degrade, eclaircir, entre, hasard, melanger, nuage, remplirSous, trame } from "./socle";
import type { ParametresDuFond, Planche, SceneDeFond } from "./socle";

// ---------------------------------------------------------------------------------------------------------------------
// Les outils du lot.
// ---------------------------------------------------------------------------------------------------------------------

/** L'unité du dessin : 1 case sur les plus petits fonds, 4 sur les plus grands. */
const unite = (o: ParametresDuFond): number => Math.max(1, Math.round(o.hauteur / 22));

/** Vrai si la case est derrière la chose, à `marge` cases près : là, pas de détail fin. */
const derriere = (o: ParametresDuFond, x: number, y: number, marge = 1): boolean =>
  x >= o.zone.x - marge && x < o.zone.x + o.zone.largeur + marge && y >= o.zone.y - marge && y < o.zone.y + o.zone.hauteur + marge;

/** La rangée où commence le sol de la scène : un peu au-dessus des pieds de la chose, jamais plus haut que le milieu. */
function rangeeDuSol(o: ParametresDuFond): number {
  const u = unite(o);
  return Math.max(Math.round(o.hauteur * 0.5), Math.min(o.sol - 2 * u, Math.round(o.hauteur * 0.72)));
}

/** Le côté tiré par la graine : -1 à gauche, 1 à droite. */
const cote = (h: () => number): -1 | 1 => (h() < 0.5 ? -1 : 1);

/** Une colonne dans la marge d'un côté : entre `pres` et `loin` (parts de la largeur) du bord. */
function colonne(o: ParametresDuFond, c: -1 | 1, part: number): number {
  const x = Math.round(o.largeur * part);
  return c < 0 ? x : o.largeur - 1 - x;
}

/** Une ellipse pleine, colorée case par case (dx, dy depuis le centre). */
function ellipse(p: Planche, cx: number, cy: number, rx: number, ry: number, couleur: string | ((dx: number, dy: number) => string | null)): void {
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      const t = (dx * dx) / ((rx + 0.4) * (rx + 0.4)) + (dy * dy) / ((ry + 0.4) * (ry + 0.4));
      if (t > 1) continue;
      const c = typeof couleur === "string" ? couleur : couleur(dx, dy);
      if (c !== null) p.poser(cx + dx, cy + dy, c);
    }
  }
}

/**
 * Une eau : un dégradé tramé du lointain au premier plan, puis de petits reflets horizontaux, plus longs vers le bas, et
 * aucun derrière la chose.
 */
function eau(p: Planche, o: ParametresDuFond, y0: number, y1: number, loin: string, pres: string, reflet: string, h: () => number, densite = 1): void {
  if (y1 < y0) return;
  degrade(p, y0, y1, loin, pres, 3);
  const n = Math.round(((y1 - y0 + 1) * p.largeur * densite) / 34);
  for (let i = 0; i < n; i++) {
    const y = entre(h, y0 + 1, Math.max(y0 + 1, y1));
    const l = 1 + Math.round(((y - y0) / Math.max(1, y1 - y0)) * unite(o) * 1.5 + h());
    const x = entre(h, 0, p.largeur - 1);
    if (y > y1 || derriere(o, x, y, 1) || derriere(o, x + l, y, 1)) continue;
    p.rect(x, y, l, 1, reflet);
  }
}

/** Quelques nuages clairs dans le haut du ciel, plutôt sur les côtés. */
function nuages(p: Planche, o: ParametresDuFond, h: () => number, yMax: number, clair: string, ombre: string): void {
  const u = unite(o);
  const n = o.largeur >= 50 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const l = entre(h, 4 * u + 2, 7 * u + 3);
    const c = i % 2 === 0 ? -1 : 1;
    const x = c < 0 ? entre(h, -u, Math.round(o.largeur * 0.3)) : entre(h, Math.round(o.largeur * 0.62), o.largeur - l + u);
    const y = entre(h, u + 1, Math.max(u + 1, Math.min(yMax, Math.round(o.hauteur * 0.3))));
    nuage(p, x, y, l, clair, ombre);
  }
}

/** Un oiseau au loin, deux ailes en accent circonflexe retourné. */
function oiseau(p: Planche, x: number, y: number, grand: boolean, couleur: string): void {
  if (grand) p.lettres(x - 2, y, ["aa.aa", "..a.."], { a: couleur });
  else p.lettres(x - 1, y, ["a.a", ".a."], { a: couleur });
}

/** Une pluie : de courts traits qui foncent un peu ce qu'ils croisent, droits (`biais` 0) ou penchés, jamais sur la chose. */
function pluie(p: Planche, o: ParametresDuFond, h: () => number, biais: number, long: number, densite: number, teinte: string, yMax: number): void {
  const n = Math.round((o.largeur * yMax * densite) / 30);
  for (let i = 0; i < n; i++) {
    const x = entre(h, 0, o.largeur + long);
    const y = entre(h, 0, Math.max(0, yMax - long));
    for (let k = 0; k < long; k++) {
      const xx = x - k * biais;
      const yy = y + k;
      if (derriere(o, xx, yy, 1)) break;
      const dessous = p.lire(xx, yy);
      if (dessous) p.poser(xx, yy, melanger(dessous, teinte, 0.3));
    }
  }
}

/** Un sapin : des étages en dents de scie, plus sombres à droite, avec ou sans neige sur la gauche de chaque étage. */
function sapin(p: Planche, cx: number, base: number, haut: number, vert: string, neige: string | null): void {
  const etage = Math.max(2, Math.round(haut / 3.2));
  const sombre = assombrir(vert, 0.16);
  p.rect(cx, base - 1, 1, 1, "#9a8474");
  for (let j = 0; j < haut - 1; j++) {
    const r = j % etage;
    const demi = Math.floor(r * 0.8 + Math.floor(j / etage) * etage * 0.45);
    const y = base - haut + j;
    for (let dx = -demi; dx <= demi; dx++) {
      let c = dx > 0 ? sombre : vert;
      if (neige && (r === 0 || (r === 1 && dx < 0)) && dx <= 0) c = neige;
      p.poser(cx + dx, y, c);
    }
  }
}

/** Un arbre rond de l'automne : un tronc et une boule de feuilles, claire en haut à gauche. */
function arbreRond(p: Planche, cx: number, base: number, r: number, haut: number, feuilles: string, tronc: string): void {
  p.rect(cx, base - haut, Math.max(1, Math.round(r / 3)), haut, tronc);
  const clair = eclaircir(feuilles, 0.25);
  const sombre = assombrir(feuilles, 0.12);
  ellipse(p, cx, base - haut - Math.round(r * 0.5), r, Math.max(1, Math.round(r * 0.8)), (dx, dy) => {
    if (dx + dy < -r * 0.5) return clair;
    if (dx + dy > r * 0.7) return trame(cx + dx, base + dy, 0.5) ? sombre : feuilles;
    return feuilles;
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Le bord de mer : la plage, les vagues, une voile au loin, des mouettes.
// ---------------------------------------------------------------------------------------------------------------------

function peindreBordDeMer(p: Planche, o: ParametresDuFond): void {
  const h = hasard(o.graine);
  const u = unite(o);
  const L = o.largeur;
  const H = o.hauteur;
  const plage = rangeeDuSol(o);
  const horizon = Math.max(Math.round(H * 0.3), plage - Math.max(3, Math.round(H * 0.2)));
  const c = cote(h);

  degrade(p, 0, horizon - 1, "#bfe2f6", "#edf7fa", 4);
  // Le soleil pâle d'un côté, les nuages partout.
  const rs = Math.max(2, 2 * u);
  p.disque(colonne(o, -c as -1 | 1, 0.14), rs + u, rs, "#fff7dc");
  nuages(p, o, h, o.zone.y - u - 1, "#ffffff", "#dcecf6");

  eau(p, o, horizon, plage, "#b5e0e8", "#84cadb", "#d8f2f5", h);

  // La voile au loin, à la couleur de la chose.
  const vx = colonne(o, c, 0.1 + h() * 0.1);
  const vh = Math.max(3, 2 * u + 1);
  const voile = melanger("#ffffff", adoucir(o.accent, 0.1), 0.5);
  for (let j = 1; j < vh; j++) p.rect(vx + 1, horizon - 1 - j, Math.ceil((vh - j) * 0.75), 1, j === vh - 1 || j === 1 ? voile : eclaircir(voile, 0.25));
  p.rect(vx, horizon - vh - 1, 1, vh, "#9a8472");
  p.rect(vx - 1, horizon - 1, Math.ceil(vh * 0.75) + 2, 1, "#8d745f");

  // Les mouettes.
  const nb = L >= 50 ? 3 : 2;
  for (let i = 0; i < nb; i++) {
    const x = i % 2 === 0 ? entre(h, 3, Math.round(L * 0.3)) : entre(h, Math.round(L * 0.68), L - 4);
    const y = entre(h, u + 1, Math.max(u + 1, horizon - 2 * u - 2));
    const libre = [-2, 0, 2].every((dx) => p.lire(x + dx, y) !== "#ffffff" && p.lire(x + dx, y + 1) !== "#ffffff" && p.lire(x + dx, y) !== "#fff7dc");
    if (libre && !derriere(o, x, y, 3)) oiseau(p, x, y, u >= 3, "#8499b5");
  }

  // Le sable : sec en bas, mouillé sous l'écume ; la ligne d'écume ondule.
  const f = 0.5 + h() * 0.5;
  const d = h() * 6;
  const rive: number[] = [];
  for (let x = 0; x < L; x++) rive.push(plage + Math.round(u * 0.8 * Math.sin((x / L) * Math.PI * 2 * f * 2 + d)));
  remplirSous(p, rive, (x, y, prof) => {
    if (prof < u) return "#ffffff";
    if (prof < 2 * u + 1) return trame(x, y, 0.5) ? "#e6d4a8" : "#decb9c";
    const t = (y - plage) / Math.max(1, H - plage);
    return trame(x, y, t * 0.6) ? "#fbf1d2" : "#f4e5bb";
  });
  // Une seconde vague, en crêtes blanches sur l'eau.
  if (plage - horizon >= 5) {
    const yv = plage - Math.max(2, Math.round((plage - horizon) * 0.4));
    for (let x = 0; x < L; x++) {
      const y = yv + Math.round(0.8 * Math.sin((x / L) * Math.PI * 5 + d));
      if ((x + Math.floor(d * 3)) % (5 * u + 2) < 3 * u + 1 && !derriere(o, x, y, 1)) p.poser(x, y, "#f3fbfc");
    }
  }

  // Sur le sable, dans les coins : une étoile de mer à la couleur de la chose, des galets, un coquillage.
  const ys = Math.min(H - 2, plage + 3 * u + 2);
  if (ys > plage + 2 * u) {
    const ex = colonne(o, -c as -1 | 1, 0.08 + h() * 0.1);
    const etoile = eclaircir(o.accent, 0.2);
    if (u >= 2) p.lettres(ex - 2, ys - 2, ["..a..", "abbba", ".aba.", ".a.a."], { a: etoile, b: eclaircir(etoile, 0.3) });
    else p.lettres(ex - 1, ys - 1, [".a.", "aaa", ".a."], { a: etoile });
    const n = L >= 50 ? 5 : 2;
    for (let i = 0; i < n; i++) {
      const x = entre(h, 1, L - 3);
      const y = entre(h, Math.min(H - 1, plage + 2 * u + 2), H - 1);
      if (derriere(o, x, y, 1) || Math.abs(x - ex) < 4) continue;
      p.rect(x, y, i % 2 === 0 ? 2 : 1, 1, i % 3 === 0 ? "#ffffff" : "#d9c7a0");
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Le port : le quai de planches, les bittes d'amarrage, une barque, un filet qui sèche.
// ---------------------------------------------------------------------------------------------------------------------

function peindrePort(p: Planche, o: ParametresDuFond): void {
  const h = hasard(o.graine);
  const u = unite(o);
  const L = o.largeur;
  const H = o.hauteur;
  const quai = rangeeDuSol(o);
  const horizon = Math.max(Math.round(H * 0.28), quai - Math.max(4, Math.round(H * 0.26)));
  const c = cote(h);
  const autre = -c as -1 | 1;

  degrade(p, 0, horizon - 1, "#cde5f1", "#f7f1e2", 4);
  nuages(p, o, h, o.zone.y - u - 1, "#ffffff", "#e3ecf2");
  // La côte au loin, d'un côté.
  const cotes = crete(L, horizon, Math.max(2, 2 * u), h);
  for (let x = 0; x < L; x++) {
    const t = c < 0 ? x / L : 1 - x / L;
    if (t > 0.45) continue;
    const y0 = Math.min(horizon, (cotes[x] ?? horizon) + Math.round(t * 5 * u));
    for (let y = y0; y < horizon; y++) p.poser(x, y, "#c3d9d2");
  }
  eau(p, o, horizon, quai, "#b4dbe1", "#8cc5d3", "#d9eff2", h);

  // La barque sur l'eau, la coque à la couleur de la chose, son mât et sa voile roulée.
  const bl = Math.max(6, 5 * u + 2);
  const bx = Math.max(1, Math.min(L - bl - 1, colonne(o, c, 0.05 + h() * 0.06) - (c > 0 ? bl : 0)));
  const by = Math.min(quai - 2, horizon + Math.max(2, Math.round((quai - horizon) * 0.45)));
  const coque = eclaircir(adoucir(o.accent, 0.1), 0.22);
  const bh = Math.max(2, u + 1);
  for (let j = 0; j < bh; j++) p.rect(bx + j, by + j, bl - 2 * j, 1, j === 0 ? eclaircir(coque, 0.45) : j === bh - 1 ? assombrir(coque, 0.18) : coque);
  const mx = bx + Math.round(bl * 0.45);
  const mh = Math.max(4, 3 * u + 1);
  p.rect(mx, by - mh, 1, mh, "#8d745f");
  p.rect(mx - Math.max(1, u), by - mh + 1, Math.max(3, 2 * u + 1), 1, "#f6efe0");
  p.rect(bx + 1, by + bh, bl - 2, 1, "#a9d6de");

  // Le filet qui sèche de l'autre côté, entre deux perches plantées au bord du quai.
  const fl = Math.max(5, 4 * u + 1);
  const fx = Math.max(1, Math.min(L - fl - 2, colonne(o, autre, 0.06 + h() * 0.05) - (autre > 0 ? fl : 0)));
  const fh = Math.max(4, 3 * u + 1);
  const fy = quai - fh - u;
  for (let j = 0; j < fh; j++) {
    for (let i = 1; i < fl; i++) {
      const creux = Math.round(Math.sin((i / fl) * Math.PI) * u);
      if (j < creux || j > fh - 2 + creux - u) continue;
      if ((i + j) % 3 === 0 || (i - j + 30) % 3 === 0) p.poser(fx + i, fy + j, "#c4ab86");
    }
  }
  p.rect(fx, fy - 1, 1, fh + u + 1, "#8d745f");
  p.rect(fx + fl, fy - 1, 1, fh + u + 1, "#8d745f");
  if (u >= 2) {
    p.rect(fx + Math.round(fl / 2), fy + fh - u, 1, 1, "#e9a25c");
    p.rect(fx + 2, fy + fh - u - 1, 1, 1, "#e9a25c");
  }

  // Le quai : des planches en rangs, les joints décalés d'un rang à l'autre, le bord clair au soleil.
  const pas = Math.max(2, 2 * u);
  const decal = entre(h, 0, 7);
  for (let y = quai; y < H; y++) {
    const rang = Math.floor((y - quai) / pas);
    const dansLeRang = (y - quai) % pas;
    for (let x = 0; x < L; x++) {
      let coul = rang % 2 === 0 ? "#e2c69a" : "#dcbf92";
      if (y === quai) coul = "#f3dfb9";
      else if (dansLeRang === pas - 1 && pas > 2) coul = "#c9aa7e";
      else if ((x + decal + rang * (4 * u + 3)) % (9 * u + 4) === 0 && (pas > 2 || rang % 2 === 0)) coul = "#c9aa7e";
      p.poser(x, y, coul);
    }
  }
  // Les bittes d'amarrage au bord du quai, une de chaque côté, et un bout de cordage.
  const bittes = [colonne(o, -1, 0.1 + h() * 0.08), colonne(o, 1, 0.1 + h() * 0.08)];
  for (const x of bittes) {
    const haut = Math.max(2, u + 1);
    p.rect(x - 1, quai - haut + 1, Math.max(2, u + 1), haut + u - 1, (xx) => (xx === x - 1 ? "#93a5bb" : "#7688a0"));
    p.rect(x - 2, quai - haut, Math.max(4, u + 3), 1, "#a9b9cc");
    if (u >= 2) p.rect(x - 2, quai - haut + 2, Math.max(4, u + 3), 1, "#d8c49c");
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// La montagne enneigée : deux grands sommets blancs sur les côtés, des sapins, la neige, des flocons.
// ---------------------------------------------------------------------------------------------------------------------

function peindreMontagneEnneigee(p: Planche, o: ParametresDuFond): void {
  const h = hasard(o.graine);
  const u = unite(o);
  const L = o.largeur;
  const H = o.hauteur;
  const neige = rangeeDuSol(o);
  const c = cote(h);

  degrade(p, 0, neige, "#c2d8f3", "#f1f5fb", 4);
  // La chaîne du lointain, très pâle.
  const loin = crete(L, neige - Math.round(H * 0.12), Math.round(H * 0.16), h);
  remplirSous(p, loin, (_x, y) => (y < neige ? "#dbe5f3" : null));

  // Les sommets : le grand d'un côté, le second de l'autre, un col bas entre les deux, derrière la chose.
  const sommets = [
    { x: colonne(o, c, 0.1 + h() * 0.12), y: Math.max(1, neige - Math.round(H * (0.44 + h() * 0.06))) },
    { x: colonne(o, -c as -1 | 1, 0.08 + h() * 0.1), y: Math.max(2, neige - Math.round(H * (0.3 + h() * 0.06))) },
  ];
  const pente = 0.72 + h() * 0.2;
  for (let x = 0; x < L; x++) {
    let haut = neige;
    let pic = sommets[0]!;
    for (const s of sommets) {
      const y = Math.round(s.y + Math.abs(x - s.x) * pente);
      if (y < haut) {
        haut = y;
        pic = s;
      }
    }
    const coiffe = Math.round((neige - pic.y) * 0.42);
    // La coiffe de neige suit la pente et finit en dents.
    const periode = 3 * u + 2;
    const dents = Math.round((Math.abs(((x + pic.x * 3) % periode) - periode / 2) / (periode / 2)) * (u + 1));
    const ecart = Math.abs(x - pic.x) * pente;
    const ombre = x > pic.x;
    for (let y = haut; y < neige; y++) {
      let coul: string;
      if (y - haut < coiffe - Math.round(ecart * 0.55) + dents && ecart < coiffe * 1.6) coul = ombre ? "#e4ecf8" : "#ffffff";
      else coul = ombre ? (trame(x, y, 0.5) ? "#aebbd6" : "#b9c5dc") : "#c6d1e5";
      p.poser(x, y, coul);
    }
  }

  // La neige au sol : blanche, des ombres bleutées tramées dans les creux.
  const congere = crete(L, neige + u, 2 * u, h);
  p.rect(0, neige, L, H - neige, "#f8fbfe");
  remplirSous(p, congere, (x, y, prof) => {
    const t = (y - neige) / Math.max(1, H - neige);
    if (prof === 0) return "#ffffff";
    return trame(x, y, 0.15 + t * 0.4) ? "#e3ebf7" : "#f4f8fd";
  });

  // Les sapins, rangés sur les côtés, la neige sur leurs branches.
  const nb = L >= 100 ? 6 : L >= 50 ? 4 : 2;
  for (let i = 0; i < nb; i++) {
    const k = i % 2 === 0 ? -1 : 1;
    const x = colonne(o, k, 0.03 + Math.floor(i / 2) * 0.085 + h() * 0.03);
    const haut = Math.max(5, entre(h, 4 * u + 1, 6 * u + 2) - Math.floor(i / 2) * u);
    const base = neige + u + Math.floor(i / 2) * u + entre(h, 0, u);
    sapin(p, x, Math.min(H, base), haut, i < 2 ? "#7ea593" : "#93b5a4", "#ffffff");
  }

  // Le fanion planté dans la neige, à la couleur de la chose.
  if (L >= 30) {
    const fx = colonne(o, -c as -1 | 1, 0.26 + h() * 0.04);
    const fy = Math.min(H - 1, neige + 2 * u + 1);
    const mat = Math.max(4, 3 * u + 1);
    if (!derriere(o, fx, fy - mat, 0) && !derriere(o, fx + 2 * u, fy - 1, 0)) {
      p.rect(fx, fy - mat, 1, mat, "#8d745f");
      const fanion = eclaircir(o.accent, 0.15);
      const fl = Math.max(2, u + 1);
      for (let j = 0; j < fl; j++) p.rect(fx + 1, fy - mat + j, Math.max(1, fl - j + (u > 1 ? 1 : 0)), 1, j === 0 ? eclaircir(fanion, 0.3) : fanion);
    }
  }

  // Les flocons : blancs, un peu partout sauf derrière la chose.
  const flocons = Math.round((L * neige) / 55);
  for (let i = 0; i < flocons; i++) {
    const x = entre(h, 0, L - 1);
    const y = entre(h, 0, Math.max(0, neige - 1));
    if (derriere(o, x, y, 1)) continue;
    p.poser(x, y, "#ffffff");
    if (u >= 3 && i % 3 === 0) p.poser(x + 1, y, "#ffffff");
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Le lac gelé : la glace bleutée jusqu'au bas, les rives enneigées au loin, un ciel d'hiver pâle et rosé.
// ---------------------------------------------------------------------------------------------------------------------

function peindreLacGele(p: Planche, o: ParametresDuFond): void {
  const h = hasard(o.graine);
  const u = unite(o);
  const L = o.largeur;
  const H = o.hauteur;
  const rive = Math.max(Math.round(H * 0.34), Math.min(rangeeDuSol(o) - Math.round(H * 0.16), Math.round(H * 0.5)));
  const c = cote(h);

  degrade(p, 0, rive, "#dfe3f5", "#fcefe8", 4);
  // Le soleil d'hiver, bas et pâle.
  const rs = Math.max(2, 2 * u);
  p.disque(colonne(o, c, 0.16 + h() * 0.06), Math.max(rs + 1, Math.round(rive * 0.38)), rs, "#fffaf0");

  // La rive d'en face : des collines de neige, puis des arbres nus et des sapins lointains sur les côtés.
  const collines = crete(L, rive - u, Math.round(H * 0.12), h);
  remplirSous(p, collines, (x, y, prof) => (y >= rive ? null : prof === 0 ? "#ffffff" : trame(x, y, 0.25) ? "#dfe7f4" : "#eef3fb"));
  const nb = L >= 100 ? 7 : L >= 50 ? 5 : 3;
  for (let i = 0; i < nb; i++) {
    const k = i % 2 === 0 ? -1 : 1;
    const x = colonne(o, k, 0.03 + Math.floor(i / 2) * 0.07 + h() * 0.03);
    const haut = Math.max(4, entre(h, 3 * u, 4 * u + 2));
    sapin(p, x, rive + 1, haut, i % 3 === 0 ? "#a9bccb" : "#b9c9d6", null);
  }

  // La glace : un dégradé bleuté, de longs reflets en biais, tramés et sobres derrière la chose.
  degrade(p, rive, H - 1, "#d6ecf5", "#b9deee", 4);
  p.rect(0, rive, L, 1, "#f3fafd");
  const periode = 11 * u + 6;
  const d = entre(h, 0, periode - 1);
  for (let y = rive + 1; y < H; y++) {
    for (let x = 0; x < L; x++) {
      const bande = (x + (y - rive) * 2 + d) % periode;
      const large = bande < 2 * u || (bande >= 4 * u && bande < 4 * u + Math.max(1, u - 1));
      if (!large) continue;
      const calme = derriere(o, x, y, 1);
      if (trame(x, y, calme ? 0.25 : 0.5)) p.poser(x, y, "#e4f4fa");
    }
  }
  // Les traces de patins : deux arcs fins sur les côtés.
  for (const k of [-1, 1] as const) {
    const cx = colonne(o, k, 0.02 + h() * 0.08);
    const cy = Math.round(rive + (H - rive) * (0.45 + h() * 0.2));
    const rx = Math.round(L * (0.12 + h() * 0.05));
    const ry = Math.max(2, Math.round((H - rive) * 0.3));
    for (let a = 0; a < 40; a++) {
      const t = (a / 39) * Math.PI;
      const x = Math.round(cx + k * rx * Math.sin(t));
      const y = Math.round(cy - ry * Math.cos(t));
      if (y > rive + 1 && !derriere(o, x, y, 1)) p.poser(x, y, "#a5d0e3");
    }
  }

  // Le reflet de la chose sur la glace, à sa couleur, juste sous elle.
  const reflet = eclaircir(adoucir(o.accent, 0.1), 0.55);
  const rx = Math.max(3, Math.round(o.zone.largeur * 0.45));
  const ry = Math.max(1, Math.min(u + 1, H - 1 - o.sol));
  const ry0 = Math.min(H - 1 - ry, o.sol + ry);
  ellipse(p, o.zone.x + Math.floor(o.zone.largeur / 2), ry0, rx, ry, (dx, dy) => ((dy + ry) % 2 === 0 ? reflet : null));

  // Les congères du premier plan, dans les coins.
  for (const k of [-1, 1] as const) {
    const larg = Math.round(L * (0.16 + h() * 0.1));
    const haut = Math.max(2, Math.round(u * (1.6 + h() * 1.2)));
    const cx = k < 0 ? 0 : L - 1;
    ellipse(p, cx, H - 1, larg, haut, (dx, dy) => (dy <= -haut + 1 || dx * k < -larg * 0.5 ? "#ffffff" : trame(cx + dx, H + dy, 0.3) ? "#e3ebf7" : "#f6f9fd"));
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// L'automne pluvieux : les arbres roux, la pluie fine, les flaques, les feuilles qui tombent.
// ---------------------------------------------------------------------------------------------------------------------

function peindreAutomnePluvieux(p: Planche, o: ParametresDuFond): void {
  const h = hasard(o.graine);
  const u = unite(o);
  const L = o.largeur;
  const H = o.hauteur;
  const terre = rangeeDuSol(o);
  const c = cote(h);
  const roux = ["#e59a58", "#e2b354", "#d97f52"] as const;
  const feuilleAccent = melanger("#e59a58", eclaircir(o.accent, 0.15), 0.5);

  degrade(p, 0, terre, "#d9dde8", "#f4ecdd", 4);
  nuages(p, o, h, o.zone.y - u - 1, "#eceef4", "#cfd4e0");

  // Le bois du lointain : une lisière pâle, dorée.
  const lisiere = crete(L, terre - Math.round(H * 0.1), Math.round(H * 0.12), h);
  remplirSous(p, lisiere, (x, y, prof) => (y >= terre ? null : prof < u && trame(x, y, 0.5) ? "#f3dcae" : "#ecd0a4"));

  // Les arbres roux, sur les côtés ; l'un porte la couleur de la chose.
  const nb = L >= 100 ? 6 : L >= 50 ? 4 : 2;
  for (let i = 0; i < nb; i++) {
    const k = i % 2 === 0 ? c : (-c as -1 | 1);
    const rang = Math.floor(i / 2);
    const x = colonne(o, k, 0.05 + rang * 0.1 + h() * 0.03);
    const r = Math.max(2, entre(h, 2 * u + 1, 3 * u + 1) - rang);
    const haut = Math.max(2, 2 * u + entre(h, 0, u));
    const coul = i === 1 ? feuilleAccent : roux[(i + entre(h, 0, 2)) % 3]!;
    arbreRond(p, x, terre + u, r, haut, coul, "#9c8272");
  }

  // La terre mouillée, tapissée de feuilles sur les bords.
  degrade(p, terre + u, H - 1, "#d8c7a4", "#e6d8b8", 3);
  p.rect(0, terre, L, u, (x, y) => (trame(x, y, 0.5) ? "#cdbb93" : "#d8c7a4"));
  // Les flaques : le ciel gris clair s'y reflète.
  const flaques = L >= 50 ? 3 : 2;
  for (let i = 0; i < flaques; i++) {
    const k = i % 2 === 0 ? (-c as -1 | 1) : c;
    const rx = Math.max(2, entre(h, 2 * u + 1, 4 * u + 1));
    const ry = Math.max(1, Math.round(u * 0.7));
    const cx = colonne(o, k, 0.1 + h() * 0.14 + (i >= 2 ? 0.2 : 0));
    const cy = Math.min(H - 1 - ry, terre + 2 * u + ry + entre(h, 0, Math.max(0, H - terre - 4 * u - 2)));
    if (cy - ry <= terre) continue;
    ellipse(p, cx, cy, rx, ry, (dx, dy) => (dy === -ry ? "#c2b08a" : dy === ry || (dy === 0 && dx > 0 && dx < rx - 1 && u >= 2) ? "#f0f4f9" : "#d3dbe8"));
  }
  // Les feuilles tombées, et celles qui tombent encore.
  const feuilles = Math.round((L * H) / 110);
  for (let i = 0; i < feuilles; i++) {
    const x = entre(h, 0, L - 2);
    const auSol = i % 5 !== 0;
    const y = auSol ? entre(h, Math.min(H - 1, terre + u), H - 1) : entre(h, 1, Math.max(1, terre - 1));
    if (derriere(o, x, y, 2)) continue;
    const coul = i % 4 === 0 ? feuilleAccent : roux[i % 3]!;
    p.poser(x, y, coul);
    if (u >= 2) p.poser(x + 1, y + (auSol ? 0 : 1), assombrir(coul, 0.1));
  }

  pluie(p, o, h, 0, Math.max(2, u + 1), 0.4, "#8798b8", terre + u);
}

// ---------------------------------------------------------------------------------------------------------------------
// Le ciel d'orage : de gros nuages gris clair qui encadrent une trouée lumineuse, un éclair, la pluie en biais.
// ---------------------------------------------------------------------------------------------------------------------

/** Les trois tons d'un nuage : sa lumière, son corps, son ventre. */
interface TonsDeNuage {
  clair: string;
  corps: string;
  ombre: string;
}

/**
 * Un gros nuage d'orage : des bosses rondes sur deux rangs, posées sur un ventre plat à la rangée `bas` ; clair en haut à
 * gauche, tramé puis plus gris vers le ventre.
 */
function grosNuage(p: Planche, o: ParametresDuFond, h: () => number, cx: number, bas: number, demi: number, haut: number, tons: TonsDeNuage): void {
  const u = unite(o);
  const L = o.largeur;
  const H = o.hauteur;
  const masque = new Uint8Array(L * H);
  const bosse = (x0: number, y0: number, r: number): void => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = x0 + dx;
        const y = y0 + dy;
        // Le dessus est rond, le ventre à peine bombé.
        const d = dy <= 0 ? dx * dx + dy * dy : dx * dx + dy * dy * 9;
        if (d > r * r + r * 0.4 || x < 0 || x >= L || y < 0 || y >= H) continue;
        masque[y * L + x] = 1;
      }
    }
  };
  const n = Math.max(3, Math.round((demi * 2) / Math.max(3, haut * 0.8)));
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * 2 - 1;
    const r = Math.max(2, Math.round(haut * (0.32 + 0.3 * (1 - t * t)) * (0.85 + h() * 0.3)));
    const x = Math.round(cx + t * (demi - r * 0.6));
    bosse(x, bas - Math.round(r * 0.55), r);
    if (Math.abs(t) < 0.75) bosse(x + entre(h, -u, u), bas - Math.round(r * 1.3), Math.max(2, Math.round(r * 0.75)));
  }
  const plein = (x: number, y: number): boolean => x >= 0 && x < L && y >= 0 && y < H && masque[y * L + x] === 1;
  const lisere = Math.max(1, u - 1);
  for (let x = 0; x < L; x++) {
    let ventre = -1;
    for (let y = Math.min(H - 1, bas + haut); y >= 0 && ventre < 0; y--) if (plein(x, y)) ventre = y;
    for (let y = 0; y <= ventre; y++) {
      if (!plein(x, y)) continue;
      let lumiere = false;
      for (let k = 1; k <= lisere && !lumiere; k++) lumiere = y - k >= 0 && !plein(x - (k > 1 ? k - 1 : 0), y - k);
      let coul = tons.corps;
      if (lumiere) coul = tons.clair;
      else if (ventre - y < u) coul = tons.ombre;
      else if (ventre - y < 3 * u) coul = trame(x, y, 0.5) ? tons.ombre : tons.corps;
      p.poser(x, y, coul);
    }
  }
}

function peindreCielDOrage(p: Planche, o: ParametresDuFond): void {
  const h = hasard(o.graine);
  const u = unite(o);
  const L = o.largeur;
  const H = o.hauteur;
  const terre = Math.max(rangeeDuSol(o), Math.round(H * 0.68));
  const c = cote(h);

  // La trouée : un ciel gris-bleu pâle qui tourne au jaune clair vers l'horizon.
  degrade(p, 0, terre, "#d3dbea", "#fbf3d8", 5);

  // Les nuages : un banc pâle tout en haut, puis un gros nuage de chaque côté, celui de l'éclair plus bas.
  grosNuage(p, o, h, Math.round(L * (0.4 + h() * 0.2)), Math.round(H * 0.17), Math.round(L * 0.62), Math.round(H * 0.24), { clair: "#e9ecf2", corps: "#dadfe8", ombre: "#cbd1dd" });
  const basEclair = Math.round(H * (0.36 + h() * 0.05));
  const basAutre = Math.round(H * (0.27 + h() * 0.05));
  const tons: TonsDeNuage = { clair: "#f1f3f7", corps: "#c6cdd9", ombre: "#aab3c5" };
  grosNuage(p, o, h, colonne(o, -c as -1 | 1, 0.1), basAutre, Math.round(L * 0.33), Math.round(H * 0.3), tons);
  grosNuage(p, o, h, colonne(o, c, 0.12), basEclair, Math.round(L * 0.36), Math.round(H * 0.34), tons);

  // Les collines du lointain et la plaine mouillée.
  const collines = crete(L, terre, Math.round(H * 0.08), h);
  remplirSous(p, collines, (x, y, prof) => (y >= terre ? null : prof === 0 ? "#c4d0c6" : "#b5c4bb"));
  degrade(p, terre, H - 1, "#c3cfbb", "#d6dfc9", 3);
  p.rect(0, terre, L, 1, "#e3ead2");

  // L'éclair, sous le gros nuage : un zigzag clair, bordé d'une lueur à la couleur de la chose.
  const lueur = eclaircir(melanger("#ffd45e", o.accent, 0.35), 0.15);
  const large = u >= 3 ? 2 : 1;
  const fin = terre - 1 - entre(h, 0, u);
  const traits: [number, number][] = [];
  let ex = colonne(o, c, 0.17 + h() * 0.08);
  let ey = basEclair - u;
  for (let segment = 0; ey < fin; segment++) {
    const long = Math.max(3, Math.round((3 * u + 1) * (segment === 0 ? 1.3 : 1)));
    for (let k = 0; k < long && ey < fin; k++) {
      traits.push([ex, ey]);
      if (k % 2 === 1) ex -= c;
      ey++;
    }
    if (ey >= fin) break;
    const saut = Math.max(2, u + 1);
    for (let i = 1; i <= saut; i++) traits.push([ex + i * c, ey - 1]);
    ex += saut * c;
  }
  for (const [x, y] of traits) p.rect(x - 1, y, large + 2, 1, lueur);
  for (const [x, y] of traits) p.rect(x, y, large, 1, "#fffef0");

  // La pluie en biais.
  pluie(p, o, h, c, Math.max(3, 2 * u + 1), 0.4, "#7585a6", H - 1);
}

// ---------------------------------------------------------------------------------------------------------------------
// Le marais : l'eau verte claire, la brume, les nénuphars, les joncs, un îlot de mousse sous la chose.
// ---------------------------------------------------------------------------------------------------------------------

function peindreMarais(p: Planche, o: ParametresDuFond): void {
  const h = hasard(o.graine);
  const u = unite(o);
  const L = o.largeur;
  const H = o.hauteur;
  const rive = Math.max(Math.round(H * 0.32), Math.min(rangeeDuSol(o) - Math.round(H * 0.14), Math.round(H * 0.5)));
  const c = cote(h);

  degrade(p, 0, rive, "#dcedde", "#f3f7e6", 4);
  // Les arbres du lointain, deux rideaux pâles, plus hauts sur les côtés.
  const rideau = crete(L, rive - Math.round(H * 0.06), Math.round(H * 0.1), h);
  remplirSous(p, rideau, (x, y) => {
    const t = Math.abs(x - L / 2) / (L / 2);
    return y >= rive || y < (rideau[x] ?? 0) + Math.round((1 - t) * H * 0.07) ? null : "#cfe3cd";
  });
  const pres = crete(L, rive, Math.round(H * 0.14), h);
  remplirSous(p, pres, (x, y) => {
    const t = Math.abs(x - L / 2) / (L / 2);
    return y >= rive || y < (pres[x] ?? 0) + Math.round((1 - t * t) * H * 0.13) ? null : trame(x, y, 0.25) ? "#b3d2b4" : "#bcd8bb";
  });

  eau(p, o, rive, H - 1, "#cfe8cf", "#a6d5b6", "#e2f3de", h, 0.7);
  // La brume : des bandes pâles tramées au ras de l'eau.
  for (let y = rive - u; y <= rive + u; y++) {
    const part = y === rive ? 0.5 : 0.25;
    for (let x = 0; x < L; x++) if (trame(x + (y & 1) * 2, y, part)) p.poser(x, y, "#f4f9ee");
  }

  // L'îlot de mousse où la chose se pose : une lentille plate, son reflet dessous.
  const ix = o.zone.x + o.zone.largeur / 2;
  const demi = Math.min(L * 0.42, Math.max(L * 0.24, o.zone.largeur * 0.75));
  const bosse = Math.max(1, Math.min(2 * u, o.sol - rive - 1));
  const fond = Math.max(1, Math.min(2 * u + 1, H - 1 - o.sol));
  for (let x = 0; x < L; x++) {
    const t = (x - ix) / demi;
    if (Math.abs(t) > 1) continue;
    const k = Math.sqrt(1 - t * t);
    const y0 = o.sol - Math.round(bosse * k);
    const y1 = Math.min(H - 1, o.sol + Math.round(fond * k));
    for (let y = y0; y <= y1; y++) {
      const coul = y === y0 ? "#d3e9aa" : y1 - y < Math.max(1, u - 1) && y > o.sol ? "#9cc387" : trame(x, y, 0.2 + (0.5 * (y - y0)) / Math.max(1, y1 - y0)) ? "#a9cd8c" : "#b9d998";
      p.poser(x, y, coul);
    }
    if (y1 + 1 < H && trame(x, y1 + 1, 0.5)) p.poser(x, y1 + 1, "#8fc3a2");
  }

  // Les nénuphars sur l'eau des côtés ; l'un porte une fleur à la couleur de la chose.
  const nb = L >= 100 ? 6 : L >= 50 ? 4 : 2;
  const fleur = eclaircir(o.accent, 0.3);
  for (let i = 0; i < nb; i++) {
    const k = i % 2 === 0 ? c : (-c as -1 | 1);
    const rang = Math.floor(i / 2);
    const rx = Math.max(1, entre(h, u + 1, 2 * u + 1));
    const ry = Math.max(1, Math.round(rx * 0.45));
    const cx = colonne(o, k, 0.04 + h() * 0.16);
    const cy = Math.round(rive + 2 * u + 1 + ((H - rive - 3 * u) * (rang + h())) / Math.ceil(nb / 2));
    if (cy + ry >= H || Math.abs(cx - ix) < demi + rx + 1) continue;
    ellipse(p, cx, cy, rx, ry, (dx, dy) => (dy === ry && ry > 0 && rx > 1 ? "#7fb884" : dx === rx && dy === 0 ? null : dx + dy * 2 < -rx * 0.4 ? "#a9d99a" : "#8fca8c"));
    if (ry >= 1) p.rect(cx - rx, cy + ry + 1, 2 * rx + 1, 1, (x, y) => (trame(x, y, 0.5) ? "#93c9a8" : null));
    if (i < 2 && rx >= 2) {
      p.rect(cx - 1, cy - 1, 3, 1, fleur);
      p.poser(cx, cy - 2, eclaircir(fleur, 0.4));
      p.poser(cx, cy - 1, "#fff2b0");
    }
  }

  // Les joncs du premier plan, en touffes dans les coins, leurs quenouilles brunes.
  for (const k of [-1, 1] as const) {
    const tiges = L >= 100 ? 6 : L >= 50 ? 4 : 2;
    for (let i = 0; i < tiges; i++) {
      const x = colonne(o, k, 0.02 + i * 0.035 + h() * 0.02);
      const haut = Math.round(H * (0.3 + h() * 0.22)) - i * u;
      const y0 = H - haut;
      const vert = i % 2 === 0 ? "#86b07a" : "#9cc089";
      for (let y = y0; y < H; y++) p.poser(x + (y - y0 < haut * 0.3 && i % 3 === 2 ? k : 0), y, vert);
      if (i % 2 === 0) p.rect(x, y0 - Math.max(2, u + 1), 1 + (u >= 3 ? 1 : 0), Math.max(2, u + 1), (_x, y) => (y === y0 - Math.max(2, u + 1) ? "#c79a72" : "#ab7f5c"));
      else if (u >= 2) p.poser(x - k, y0 + 1, vert);
    }
  }

  // Deux lueurs d'insectes dans la brume, sur les grands fonds.
  if (L >= 50) {
    for (let i = 0; i < 3; i++) {
      const x = entre(h, 2, L - 3);
      const y = entre(h, 2, Math.max(2, rive - 2 * u));
      if (!derriere(o, x, y, 2)) p.poser(x, y, "#fffbe0");
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------

export const SCENES_C: readonly SceneDeFond[] = [
  { id: "bord-de-mer", nom: CATALOGUE_DES_SCENES["bord-de-mer"].nom, peindre: peindreBordDeMer },
  { id: "port", nom: CATALOGUE_DES_SCENES.port.nom, peindre: peindrePort },
  { id: "montagne-enneigee", nom: CATALOGUE_DES_SCENES["montagne-enneigee"].nom, peindre: peindreMontagneEnneigee },
  { id: "lac-gele", nom: CATALOGUE_DES_SCENES["lac-gele"].nom, peindre: peindreLacGele },
  { id: "automne-pluvieux", nom: CATALOGUE_DES_SCENES["automne-pluvieux"].nom, peindre: peindreAutomnePluvieux },
  { id: "ciel-d-orage", nom: CATALOGUE_DES_SCENES["ciel-d-orage"].nom, peindre: peindreCielDOrage },
  { id: "marais", nom: CATALOGUE_DES_SCENES.marais.nom, peindre: peindreMarais },
];
