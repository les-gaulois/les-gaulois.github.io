/**
 * Les fonds d'objets, lot B (voir `socle.ts` et son `CATALOGUE_DES_SCENES`) : « le front, le feu et le métal ». Sept
 * scènes pour les armes, les armures et les outils : la forge, l'armurerie, les remparts, le camp militaire, le champ de
 * bataille, la mine et le tournoi.
 *
 * Elles sont de la même famille : le même bois blond, la même pierre crème, le même fer gris-bleu, et partout une étoffe
 * (fanion, tenture, bouclier, étendard) à la couleur propre de la chose. Le décor se tient sur les deux bords, hors de la
 * place de la chose ; le milieu reste calme. Tout est clair : même la forge et la mine ont des murs pâles et une lumière
 * chaude.
 *
 * Dessin de Claude Fable 5.2, 22 novembre 2026.
 */
import { CATALOGUE_DES_SCENES, adoucir, alea, crete, degrade, eclaircir, entre, hasard, melanger, nuage, remplirSous, trame } from "./socle";
import type { ParametresDuFond, Planche, SceneDeFond } from "./socle";

// ---------------------------------------------------------------------------------------------------------------------
// La palette de la famille.
// ---------------------------------------------------------------------------------------------------------------------

const BOIS = { lumiere: "#f0dcb8", clair: "#e2c498", fond: "#cfab7c", sombre: "#b08a5e", creux: "#94714c" } as const;
const PIERRE = { lumiere: "#f6f0e4", clair: "#ede4d3", fond: "#e3d8c4", joint: "#d0c3aa", sombre: "#c2b398" } as const;
const FER = { lumiere: "#e6ebf2", clair: "#c9d0dc", fond: "#a7b1c1", sombre: "#8a94a7" } as const;
const BRAISE = { coeur: "#fff3bc", vif: "#ffd277", fond: "#f9a653", bord: "#e9824a", charbon: "#c9623c" } as const;
const BLANC = "#f8f3e8";
/** Les couleurs d'étoffe passées, pour ce qui n'est pas à la couleur de la chose. */
const ETOFFES = ["#8fb0d6", "#d99588", "#96c292", "#e2c56c", "#b79ac9"] as const;

/** L'étoffe à la couleur propre de la chose, un peu passée pour ne pas lui voler la vedette. */
const teinteDe = (accent: string): string => melanger(adoucir(accent, 0.15), "#ffffff", 0.26);
/** L'ombre d'une étoffe ou d'une toile. */
const ombreDe = (c: string): string => melanger(c, "#6a5868", 0.26);

// ---------------------------------------------------------------------------------------------------------------------
// Le cadre : les mesures que toutes les scènes partagent.
// ---------------------------------------------------------------------------------------------------------------------

interface Cadre {
  L: number;
  H: number;
  /** Une longueur en cases, proportionnelle à la taille du fond (jamais moins d'une case). */
  u: (n: number) => number;
  /** La largeur de la bande libre à gauche de la chose. */
  bande: number;
  /** La première colonne de la bande libre à droite de la chose. */
  droite: number;
  /** La rangée où commence le sol de la scène. */
  solY: number;
  /** Vrai sur les plus petites tailles : on y retire des détails. */
  petit: boolean;
  /** Vrai derrière la chose (et une case autour) : rien de fin, peu de contraste. */
  calme: (x: number, y: number) => boolean;
  /** Le milieu d'une des deux bandes libres. */
  milieu: (aGauche: boolean) => number;
}

function cadreDe(o: ParametresDuFond): Cadre {
  const L = o.largeur;
  const H = o.hauteur;
  const g = Math.min(L / 56, H / 38);
  const u = (n: number): number => Math.max(1, Math.round(n * g));
  const mini = Math.round(L * 0.24);
  const bande = Math.max(mini, Math.min(o.zone.x, Math.round(L * 0.4)));
  const droite = Math.min(L - mini, Math.max(o.zone.x + o.zone.largeur, L - Math.round(L * 0.4)));
  const solY = Math.max(Math.round(H * 0.55), Math.min(o.sol, H - Math.max(3, Math.round(H * 0.14))));
  const calme = (x: number, y: number): boolean => x >= o.zone.x - 1 && x <= o.zone.x + o.zone.largeur && y >= o.zone.y - 1 && y <= o.zone.y + o.zone.hauteur;
  const milieu = (aGauche: boolean): number => (aGauche ? Math.floor((bande - 1) / 2) : Math.floor((droite + L - 1) / 2));
  return { L, H, u, bande, droite, solY, petit: L < 34 || H < 24, calme, milieu };
}

/** Un élément d'une liste, tiré par `h`. */
const choisir = <T>(h: () => number, liste: readonly T[]): T => liste[Math.floor(h() * liste.length)]!;

// ---------------------------------------------------------------------------------------------------------------------
// Les petits outils de dessin du lot.
// ---------------------------------------------------------------------------------------------------------------------

/** Une ligne droite d'une case d'épaisseur ; `pointille` n'en pose qu'une sur deux. */
function ligne(p: Planche, x0: number, y0: number, x1: number, y1: number, couleur: string, pointille = false): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    if (pointille && i % 2 === 1) continue;
    const t = n === 0 ? 0 : i / n;
    p.poser(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), couleur);
  }
}

/** Une lueur ronde, tramée : elle teinte ce qui est déjà peint, plus fort au centre. */
function lueur(p: Planche, cx: number, cy: number, r: number, couleur: string, force: number): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d >= 1) continue;
      const c = p.lire(x, y);
      if (c && trame(x, y, (1 - d) * force)) p.poser(x, y, melanger(c, couleur, 0.55));
    }
  }
}

/** Un mur de pierres taillées, en rangs décalés : quelques pierres plus claires ou plus sombres, des joints doux. */
function murDePierre(p: Planche, o: ParametresDuFond, c: Cadre, y0: number, y1: number, rang: number): void {
  const pas = rang * 2;
  const d = o.graine % pas;
  const g = o.graine % 251;
  for (let y = y0; y <= y1; y++) {
    const r = Math.floor((y - y0) / rang);
    const dec = d + (r % 2 ? rang : 0);
    for (let x = 0; x < c.L; x++) {
      const col = Math.floor((x + dec) / pas);
      const joint = (y - y0) % rang === rang - 1 || (x + dec) % pas === 0;
      const tirage = alea(col + g, r * 31 + g);
      const calme = c.calme(x, y);
      let couleur: string = PIERRE.fond;
      if (joint) couleur = calme ? melanger(PIERRE.joint, PIERRE.fond, 0.6) : PIERRE.joint;
      else if (calme) couleur = PIERRE.fond;
      else if (tirage < 0.2) couleur = PIERRE.clair;
      else if (tirage > 0.86) couleur = melanger(PIERRE.fond, PIERRE.joint, 0.5);
      else if (rang >= 4 && (y - y0) % rang === 0) couleur = PIERRE.clair;
      p.poser(x, y, couleur);
    }
  }
}

/** Un sol en bandes : un dégradé tramé, un filet d'ombre au pied du mur, et des joints décalés d'un rang à l'autre. */
function solEnDalles(p: Planche, c: Cadre, haut: string, bas: string, joint: string, graine: number): void {
  degrade(p, c.solY, c.H - 1, haut, bas, 3);
  const rang = Math.max(2, c.u(3));
  const pas = Math.max(5, c.u(10));
  for (let y = c.solY; y < c.H; y++) {
    const r = Math.floor((y - c.solY) / rang);
    for (let x = 0; x < c.L; x++) {
      if (y === c.solY) p.poser(x, y, melanger(joint, haut, 0.3));
      else if ((y - c.solY) % rang === 0 && !c.petit) p.poser(x, y, melanger(joint, haut, 0.45));
      else if ((x + (graine % pas) + (r % 2) * Math.floor(pas / 2)) % pas === 0 && !c.petit) p.poser(x, y, melanger(joint, haut, 0.55));
    }
  }
}

/** Un fanion en pointe, accroché en (x, y), qui flotte vers `sens` (+1 à droite, -1 à gauche). */
function fanion(p: Planche, x: number, y: number, longueur: number, hauteur: number, couleur: string, sens: number): void {
  for (let i = 0; i < longueur; i++) {
    const h = Math.max(1, Math.round(hauteur * (1 - i / longueur)));
    const y0 = y + Math.floor((hauteur - h) / 2);
    for (let j = 0; j < h; j++) p.poser(x + i * sens, y0 + j, j >= Math.ceil(h / 2) && h > 1 ? ombreDe(couleur) : couleur);
  }
}

/** Un étendard : une étoffe droite pendue sous (x, y), à queue fendue si `fendu`. */
function etendard(p: Planche, x: number, y: number, l: number, h: number, couleur: string, fendu = true): void {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < l; i++) {
      const fente = fendu && j >= h - Math.max(1, Math.round(h / 4)) && l >= 3 && Math.abs(i - (l - 1) / 2) < 0.6 + (l >= 5 ? 0.5 : 0);
      if (fente) continue;
      p.poser(x + i, y + j, i === l - 1 && l >= 3 ? ombreDe(couleur) : j === 0 ? eclaircir(couleur, 0.3) : couleur);
    }
  }
}

/** Un bouclier rond pendu au mur : cercle de fer, champ de couleur, un motif simple et un umbo. */
function bouclierRond(p: Planche, cx: number, cy: number, r: number, champ: string, second: string, motif: number): void {
  p.disque(cx, cy, r, (dx, dy) => {
    const d = Math.hypot(dx, dy);
    if (d > r - 0.9) return dx + dy > r * 0.5 ? FER.sombre : dx + dy < -r * 0.5 ? FER.lumiere : FER.fond;
    let c = champ;
    if (r >= 3) {
      if (motif === 0 && dx * dy > 0) c = second;
      else if (motif === 1 && Math.abs(dy) <= Math.max(0, Math.round(r / 5))) c = second;
      else if (motif === 2 && Math.abs(Math.abs(dx) - (dy + Math.round(r / 3))) <= (r >= 6 ? 1 : 0)) c = second;
      else if (motif === 3 && d > r * 0.55) c = second;
    }
    if (dx + dy > r * 0.75) c = ombreDe(c);
    return c;
  });
  if (r >= 3) {
    const b = r >= 7 ? 1 : 0;
    p.disque(cx, cy, b, FER.clair);
    p.poser(cx - b, cy - b, FER.lumiere);
  }
}

/** Un écu en pointe : le haut droit, le bas qui se resserre. */
function ecu(p: Planche, x: number, y: number, l: number, h: number, champ: string, second: string): void {
  const droit = Math.round(h * 0.45);
  for (let j = 0; j < h; j++) {
    const retrait = j < droit ? 0 : Math.round(((j - droit + 1) / (h - droit)) * (l / 2 - 0.5));
    for (let i = retrait; i < l - retrait; i++) {
      const bord = j === 0 || i === retrait || i === l - 1 - retrait;
      const pal = l >= 5 && Math.abs(i - (l - 1) / 2) <= (l >= 9 ? 1 : 0.5);
      p.poser(x + i, y + j, bord ? (i >= l / 2 && j > 0 ? FER.sombre : FER.clair) : pal ? second : i > l * 0.6 ? ombreDe(champ) : champ);
    }
  }
}

/** Une caisse de bois : un cadre, des planches, et une bande de couleur. */
function caisse(p: Planche, x: number, y: number, l: number, h: number, marque: string | null): void {
  p.rect(x, y, l, h, (i, j) => {
    if (i === x || j === y) return BOIS.clair;
    if (i === x + l - 1 || j === y + h - 1) return BOIS.sombre;
    if (marque && h >= 4 && j === y + Math.floor(h / 2)) return marque;
    if (l >= 6 && h >= 5 && (j - y) % 2 === 0) return melanger(BOIS.fond, BOIS.sombre, 0.35);
    return BOIS.fond;
  });
}

/** Une touffe d'herbe ou de paille, de trois brins au plus. */
function touffe(p: Planche, x: number, y: number, couleur: string, grande: boolean): void {
  p.poser(x, y, couleur);
  p.poser(x + 1, y - 1, couleur);
  if (grande) {
    p.poser(x + 1, y, couleur);
    p.poser(x + 2, y, couleur);
    p.poser(x - 1, y - 1, couleur);
  }
}

/** Des nuages sur les bords et tout en haut du ciel, jamais derrière la chose. */
function nuages(p: Planche, c: Cadre, h: () => number, yMax: number, clair: string, ombre: string): void {
  const nombre = c.petit ? 1 : entre(h, 2, 3);
  for (let i = 0; i < nombre; i++) {
    const l = Math.max(5, c.u(entre(h, 9, 15)));
    const aGauche = i % 2 === 0 ? h() < 0.5 : h() >= 0.5;
    const x = aGauche ? entre(h, -2, Math.max(0, c.bande - l)) : entre(h, Math.min(c.L - l, c.droite), c.L - l + 2);
    const y = entre(h, Math.max(2, c.u(3)), Math.max(3, Math.min(yMax, c.u(11))));
    nuage(p, x, y, l, clair, ombre);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// La forge : un mur de pierre claire, le foyer et ses braises d'un côté, l'enclume et les outils pendus de l'autre.
// ---------------------------------------------------------------------------------------------------------------------

function peindreForge(p: Planche, o: ParametresDuFond): void {
  const c = cadreDe(o);
  const { L, u, solY } = c;
  const h = hasard(o.graine);
  const foyerAGauche = h() < 0.5;
  const rang = Math.max(3, u(5));

  murDePierre(p, o, c, 0, solY - 1, rang);
  solEnDalles(p, c, "#dccbb0", "#cdb999", "#b9a384", o.graine);

  // Le foyer : un massif de pierre contre le bord, sa bouche pleine de braises, sa hotte qui monte.
  const fl = Math.min(c.bande, Math.max(6, u(15)));
  const fh = Math.max(6, u(13));
  const fx = foyerAGauche ? 0 : L - fl;
  const fy = solY - fh + 1;
  const marge = Math.max(1, u(2));
  const bl = fl - 2 * marge;
  const bh = Math.max(3, fh - Math.max(2, u(5)));
  const bx = fx + marge;
  const by = solY - bh;
  lueur(p, bx + Math.floor(bl / 2), by + Math.floor(bh / 2), Math.max(8, u(19)), "#ffd9a6", 0.85);

  const pierreChaude = { clair: "#efe2cc", fond: "#dccdb3", sombre: "#c5b295" };
  const hl = Math.max(3, Math.round(fl * 0.55));
  const evase = Math.max(2, u(6));
  for (let y = 0; y < fy; y++) {
    const t = y < fy - evase ? 0 : (y - (fy - evase) + 1) / evase;
    const l = Math.round(hl + (fl - hl) * t);
    for (let i = 0; i < l; i++) {
      const x = foyerAGauche ? i : L - 1 - i;
      const bord = i === l - 1;
      p.poser(x, y, bord ? pierreChaude.sombre : y % rang === rang - 1 ? melanger(pierreChaude.fond, pierreChaude.sombre, 0.5) : pierreChaude.fond);
    }
  }
  p.rect(fx, fy, fl, fh, (x, y) => {
    if (y === fy) return pierreChaude.clair;
    if (x === (foyerAGauche ? fx + fl - 1 : fx)) return pierreChaude.sombre;
    return (y - fy) % rang === rang - 1 ? melanger(pierreChaude.fond, pierreChaude.sombre, 0.5) : pierreChaude.fond;
  });
  // La tablette du foyer, qui dépasse d'une case, et le cadre de pierre de la bouche.
  p.rect(foyerAGauche ? fx : fx - 1, fy, fl + 1, 1, PIERRE.lumiere);
  p.rect(foyerAGauche ? fx : fx - 1, fy + 1, fl + 1, 1, pierreChaude.sombre);
  p.rect(bx - 1, by - 1, bl + 2, bh + 1, (x, y) => (y === by - 1 && (x === bx - 1 || x === bx + bl) ? null : "#b9a283"));
  // La bouche du foyer, du rouge doux en haut au jaune clair en bas, puis un rang de charbons.
  const tons = [BRAISE.bord, BRAISE.fond, BRAISE.fond, BRAISE.vif, BRAISE.vif, BRAISE.coeur];
  for (let j = 0; j < bh; j++) {
    for (let i = 0; i < bl; i++) {
      if (j === 0 && bl >= 4 && (i === 0 || i === bl - 1)) continue;
      const t = (j / Math.max(1, bh - 1)) * (tons.length - 1);
      const a = tons[Math.floor(t)]!;
      const b = tons[Math.min(tons.length - 1, Math.floor(t) + 1)]!;
      const centre = Math.abs(i - (bl - 1) / 2) / Math.max(1, bl / 2);
      let couleur: string = trame(bx + i, by + j, t - Math.floor(t)) ? b : a;
      if (centre > 0.75 && j < bh - 1) couleur = melanger(couleur, BRAISE.bord, 0.35);
      if (j === bh - 1) couleur = (i + (o.graine & 1)) % 2 === 0 ? BRAISE.charbon : BRAISE.vif;
      p.poser(bx + i, by + j, couleur);
    }
  }
  // Quelques étincelles, du côté de la pièce.
  if (!c.petit) {
    const nombre = entre(h, 3, 6);
    for (let i = 0; i < nombre; i++) {
      const dx = fl + entre(h, 0, u(5));
      const x = foyerAGauche ? dx : L - 1 - dx;
      const y = entre(h, fy - u(5), solY - u(3));
      if (!c.calme(x, y)) p.poser(x, y, i % 2 ? BRAISE.vif : BRAISE.coeur);
    }
  }

  // De l'autre côté : la tringle aux outils, puis l'enclume sur son billot.
  const x0 = foyerAGauche ? c.droite + 1 : 1;
  const x1 = foyerAGauche ? L - 2 : c.bande - 2;
  const ty = Math.max(1, u(4));
  p.rect(x0, ty, x1 - x0 + 1, 1, BOIS.fond);
  p.rect(x0, ty + 1, x1 - x0 + 1, 1, melanger(PIERRE.joint, PIERRE.fond, 0.3));
  const places = Math.max(1, Math.min(4, Math.floor((x1 - x0 + 1) / Math.max(3, u(6)))));
  const etoffe = Math.floor(h() * places);
  const debut = entre(h, 0, 2);
  const teinte = teinteDe(o.accent);
  for (let i = 0; i < places; i++) {
    const x = x0 + Math.round(((i + 0.5) * (x1 - x0 + 1)) / places);
    const y = ty + 1;
    if (i === etoffe) {
      const l = Math.max(2, u(4));
      etendard(p, x - Math.floor(l / 2), y, l, Math.max(3, u(6)), teinte, false);
      continue;
    }
    const sorte = (debut + i) % 3;
    if (sorte === 0) {
      // Le marteau, tête en bas.
      const m = Math.max(2, u(5));
      p.rect(x, y, 1, m, BOIS.sombre);
      p.rect(x - Math.max(1, u(1.5)), y + m, Math.max(3, u(4)), Math.max(1, u(2)), (i2, j2) => (j2 === y + m ? FER.clair : FER.sombre));
    } else if (sorte === 1) {
      // La pince : deux branches qui s'écartent.
      const m = Math.max(3, u(7));
      for (let j = 0; j < m; j++) {
        const e = j < m * 0.4 ? 0 : 1;
        p.poser(x - e, y + j, FER.sombre);
        p.poser(x + 1 + e, y + j, FER.fond);
      }
    } else {
      // Le fer à cheval, ouvert vers le bas.
      const r = Math.max(1, u(2));
      p.poser(x, y, BOIS.creux);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.hypot(dx, dy);
          if (d <= r + 0.3 && d > r - 0.9 && !(dy > 0 && Math.abs(dx) < r)) p.poser(x + dx, y + 1 + r + dy, dx < 0 ? FER.fond : FER.sombre);
        }
      }
    }
  }

  const ex = c.milieu(!foyerAGauche) + entre(h, -u(2), u(2));
  const base = Math.min(c.H - 2, solY + Math.max(1, u(2)));
  const bil = Math.max(3, u(7));
  const bih = Math.max(2, u(4));
  p.rect(ex - Math.floor(bil / 2), base - bih + 1, bil, bih, (x, y) => (y === base - bih + 1 ? BOIS.clair : x === ex - Math.floor(bil / 2) + bil - 1 ? BOIS.creux : (x - ex) % 3 === 0 ? BOIS.fond : BOIS.sombre));
  const al = Math.max(5, u(11));
  const ah = Math.max(3, u(6));
  const table = Math.max(1, Math.round(ah * 0.35));
  const ay = base - bih - ah + 1;
  const bec = foyerAGauche ? -1 : 1;
  for (let j = 0; j < ah; j++) {
    const l = j < table ? al - (j > 0 ? Math.max(1, u(2)) : 0) : j === ah - 1 ? Math.max(3, Math.round(al * 0.6)) : Math.max(1, Math.round(al * 0.34));
    const ax = j < table ? ex - Math.floor(al / 2) + (j > 0 && bec < 0 ? al - l : 0) : ex - Math.floor(l / 2);
    for (let i = 0; i < l; i++) p.poser(ax + i, ay + j, j === 0 ? FER.lumiere : i === l - 1 ? FER.sombre : j < table ? FER.clair : FER.fond);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// L'armurerie : un mur de planches blondes, des boucliers pendus, un râtelier d'armes et un coffre.
// ---------------------------------------------------------------------------------------------------------------------

function peindreArmurerie(p: Planche, o: ParametresDuFond): void {
  const c = cadreDe(o);
  const { L, u, solY } = c;
  const h = hasard(o.graine);
  const ratelierAGauche = h() < 0.5;
  const teinte = teinteDe(o.accent);

  // Le mur de planches debout.
  const pl = Math.max(4, u(7));
  const d = o.graine % pl;
  const g = o.graine % 241;
  for (let y = 0; y < solY; y++) {
    for (let x = 0; x < L; x++) {
      const col = Math.floor((x + d) / pl);
      const joint = (x + d) % pl === 0;
      const calme = c.calme(x, y);
      const ton = alea(col + g, g) < 0.4 ? "#efdfc0" : "#e9d5b1";
      let couleur = calme ? "#ecdab9" : ton;
      if (joint) couleur = calme ? "#e2cda6" : "#d6bd92";
      else if (!calme && !c.petit && (x + d) % pl === 1) couleur = eclaircir(ton, 0.35);
      else if (!calme && !c.petit && alea(col * 7 + g, Math.floor(y / 2)) > 0.985) couleur = "#d6bd92";
      p.poser(x, y, couleur);
    }
  }
  // La poutre du haut.
  const ph = Math.max(2, u(3));
  p.rect(0, 0, L, ph, (x, y) => (y === 0 ? BOIS.clair : y === ph - 1 ? BOIS.sombre : BOIS.fond));
  p.rect(0, ph, L, 1, "#dcc59c");
  solEnDalles(p, c, "#dcdde1", "#cbcdd6", "#b3b6c2", o.graine);

  // Un bouclier rond par côté ; celui du côté du coffre est à la couleur de la chose.
  const autres = ETOFFES.filter((_, i) => i !== o.graine % ETOFFES.length);
  const bas: number[] = [];
  for (const aGauche of [true, false]) {
    const large = aGauche ? c.bande : L - c.droite;
    const r = Math.max(2, Math.min(u(6), Math.floor((large - 2) / 2)));
    const cx = c.milieu(aGauche) + entre(h, -1, 1) * Math.min(u(2), Math.max(0, Math.floor(large / 2) - r - 1));
    const cy = ph + r + Math.max(1, u(2)) + entre(h, 0, u(3));
    const champ = aGauche === ratelierAGauche ? choisir(h, autres) : teinte;
    const second = aGauche === ratelierAGauche ? BLANC : melanger(teinte, BLANC, 0.75);
    // Deux lances croisées derrière le bouclier.
    if (!c.petit) {
      const m = r + Math.max(2, u(4));
      for (const s of [-1, 1]) {
        for (let k = -m; k <= m; k++) {
          const x = cx + s * k;
          const y = cy + k;
          if (y <= ph || y >= solY - 1 || x < 0 || x >= L || c.calme(x, y)) continue;
          p.poser(x, y, k < -m + Math.max(2, u(2.5)) ? FER.fond : BOIS.sombre);
          if (k < -m + Math.max(2, u(2.5)) && k > -m) p.poser(x + s, y, FER.clair);
        }
      }
    }
    // Le clou et la courroie.
    p.rect(cx, cy - r - Math.max(1, u(2)), 1, Math.max(1, u(2)), BOIS.creux);
    bouclierRond(p, cx, cy, r, champ, second, entre(h, 0, 3));
    bas.push(cy + r + 2);
    // Sur un grand fond, un écu de plus, plus bas, vers le bord.
    if (large >= r * 4 + 6 && !c.petit) {
      const el = Math.max(5, u(6));
      const ex = aGauche ? Math.max(1, cx - r - el) : Math.min(L - el - 1, cx + r + 2);
      ecu(p, ex, cy + Math.round(r / 2), el, Math.max(6, u(8)), choisir(h, autres), BLANC);
    }
  }

  // Le râtelier : deux montants, deux traverses, et des armes debout.
  const large = ratelierAGauche ? c.bande : L - c.droite;
  const base = Math.min(c.H - 2, solY + Math.max(1, u(2)));
  const rl = Math.max(6, Math.min(large - 2, u(18)));
  const rx = ratelierAGauche ? 1 + Math.max(0, Math.floor((large - 2 - rl) / 2)) : c.droite + 1 + Math.max(0, Math.floor((large - 2 - rl) / 2));
  const rh = Math.min(u(17), base - (bas[ratelierAGauche ? 0 : 1] ?? 0));
  if (rh >= 5) {
    const nombre = Math.max(2, Math.min(4, Math.floor((rl - 2) / Math.max(4, u(5)))));
    const gros = c.petit ? 1 : Math.max(2, u(1.6));
    for (let i = 0; i < nombre; i++) {
      const x = rx + 1 + Math.round(((i + 0.5) * (rl - 2)) / nombre);
      const sorte = entre(h, 0, 2);
      const haut = base - rh + entre(h, 0, Math.max(1, u(2)));
      if (sorte === 0) {
        // La lance : une hampe et un fer en pointe.
        p.rect(x, haut + Math.max(2, u(3)), 1, base - haut - Math.max(2, u(3)), BOIS.sombre);
        p.rect(x, haut, 1, Math.max(2, u(4)), FER.fond);
        if (!c.petit) p.rect(x - 1, haut + 1, 3, Math.max(2, u(2)), (x2) => (x2 < x ? FER.clair : x2 > x ? FER.sombre : FER.fond));
        p.poser(x, haut, FER.lumiere);
      } else if (sorte === 1) {
        // L'épée, la pointe en bas : pommeau, garde dorée, lame claire.
        const y = haut + Math.max(1, u(3));
        p.rect(x, y, 1, Math.max(1, u(2)), BOIS.creux);
        p.rect(x - 1, y + Math.max(1, u(2)), gros + 2, 1, "#d4ad4e");
        p.rect(x, y + Math.max(1, u(2)) + 1, gros, base - y - Math.max(1, u(2)) - 1, (x2) => (x2 === x ? FER.clair : FER.sombre));
        p.poser(x, y - 1, "#d4ad4e");
      } else {
        // La hache : un manche et un fer d'un côté.
        p.rect(x, haut + 1, 1, base - haut - 1, BOIS.sombre);
        const f = Math.max(2, u(4));
        p.rect(x + 1, haut + 1, Math.max(1, u(2)), f, (i2, j2) => (j2 === haut + 1 ? FER.lumiere : FER.fond));
        p.rect(x + 1 + Math.max(1, u(2)), haut, 1, f + 2, FER.sombre);
      }
    }
    const t1 = base - Math.round(rh * 0.55);
    const t2 = base - Math.max(1, Math.round(rh * 0.18));
    const ep = Math.max(1, u(1.4));
    for (const y of [t1, t2]) p.rect(rx, y, rl, ep, (x2, y2) => (y2 === y ? BOIS.clair : BOIS.fond));
    for (const x of [rx, rx + rl - ep]) p.rect(x, t1 - Math.max(1, u(2)), ep, base - t1 + Math.max(1, u(2)) + 1, (x2) => (x2 === x ? BOIS.fond : BOIS.sombre));
  }

  // Le coffre, et un écu posé contre lui.
  const autre = ratelierAGauche ? L - c.droite : c.bande;
  const cl = Math.max(5, Math.min(autre - 2, u(11)));
  const ch = Math.max(3, u(6));
  const cx = c.milieu(!ratelierAGauche) - Math.floor(cl / 2) + entre(h, -u(1), u(2));
  const cy = base - ch + 1;
  p.rect(cx, cy, cl, ch, (x, y) => {
    if (y === cy) return BOIS.lumiere;
    if (y === cy + Math.max(1, Math.round(ch * 0.35))) return BOIS.creux;
    if (cl >= 7 && (x === cx + 1 || x === cx + cl - 2)) return FER.fond;
    if (x === cx + cl - 1) return BOIS.sombre;
    return y < cy + ch * 0.35 ? BOIS.clair : BOIS.fond;
  });
  p.poser(cx + Math.floor(cl / 2), cy + Math.max(1, Math.round(ch * 0.35)) + 1, "#dcb95a");
  if (!c.petit) {
    const el = Math.max(4, u(5));
    const eh = Math.max(5, u(8));
    const ex = ratelierAGauche ? cx + cl + 1 : cx - el - 1;
    if (!c.calme(ex, base - 2) && !c.calme(ex + el - 1, base - 2) && ex > 0 && ex + el < L) ecu(p, ex, base - eh + 1, el, eh, choisir(h, autres), BLANC);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Les remparts : une palissade de rondins sous un ciel clair, une tour de guet et son fanion.
// ---------------------------------------------------------------------------------------------------------------------

function peindreRemparts(p: Planche, o: ParametresDuFond): void {
  const c = cadreDe(o);
  const { L, H, u, solY } = c;
  const h = hasard(o.graine);
  const tourAGauche = h() < 0.5;
  const teinte = teinteDe(o.accent);
  const yP = solY - Math.max(4, Math.round(H * 0.27));

  degrade(p, 0, solY, "#c2e2f8", "#eef7fc", 4);
  nuages(p, c, h, yP - u(8), "#ffffff", "#dcebf6");
  remplirSous(p, crete(L, yP + u(1), Math.max(2, u(6)), h), "#c7e0cf");
  // Quelques oiseaux au loin.
  if (!c.petit) {
    for (let i = entre(h, 1, 3); i > 0; i--) {
      const x = h() < 0.5 ? entre(h, 2, Math.max(3, c.bande - 4)) : entre(h, c.droite + 1, L - 5);
      const y = entre(h, u(3), Math.max(u(4), yP - u(10)));
      p.poser(x, y, "#93a9c4");
      p.poser(x + 1, y + 1, "#93a9c4");
      p.poser(x + 2, y, "#93a9c4");
    }
  }

  // La tour de guet : un plancher, un garde-corps, deux poteaux, un toit, et le fanion à la couleur de la chose.
  const large = tourAGauche ? c.bande : L - c.droite;
  const tl = Math.max(5, Math.min(large - 3, u(13)));
  const tx = (tourAGauche ? 1 : c.droite + 1) + Math.max(0, Math.floor((large - 2 - tl) / 2)) + entre(h, -u(1), u(1));
  const mat = Math.max(2, u(4));
  const k = Math.min(1, Math.max(0.35, (yP - 2 - mat) / Math.max(1, u(16))));
  const v = (n: number): number => Math.max(1, Math.round(u(n) * k));
  const plancher = yP - v(3);
  const garde = plancher - v(4);
  const sousToit = garde - v(4);
  const faite = sousToit - v(5);
  p.rect(tx, plancher, tl, solY - plancher, (x) => (x === tx ? BOIS.clair : x === tx + tl - 1 ? BOIS.sombre : (x - tx) % 3 === 2 ? melanger(BOIS.fond, BOIS.sombre, 0.4) : BOIS.fond));
  for (const x of [tx, tx + tl - 1]) p.rect(x, sousToit, 1, garde - sousToit, x === tx ? BOIS.fond : BOIS.sombre);
  p.rect(tx - 1, garde, tl + 2, plancher - garde, (x, y) => (y === garde ? BOIS.lumiere : (x - tx) % 2 === 0 ? BOIS.clair : BOIS.fond));
  p.rect(tx - 1, plancher, tl + 2, 1, BOIS.sombre);
  const toit = { clair: "#e9b99c", fond: "#d9a080", sombre: "#c08a6c" };
  for (let y = faite; y < sousToit; y++) {
    const t = (y - faite + 1) / (sousToit - faite);
    const demi = Math.round((tl / 2 + 2) * (0.25 + 0.75 * t));
    const mx = tx + Math.floor(tl / 2);
    for (let x = mx - demi; x <= mx + demi; x++) p.poser(x, y, y === sousToit - 1 ? toit.sombre : x < mx - demi * 0.3 ? toit.clair : (x + y) % 3 === 0 ? toit.sombre : toit.fond);
  }
  const mx = tx + Math.floor(tl / 2);
  p.rect(mx, faite - mat, 1, mat, BOIS.creux);
  fanion(p, mx + (tourAGauche ? 1 : -1), faite - mat, Math.max(3, u(6)), Math.max(2, u(3)), teinte, tourAGauche ? 1 : -1);

  // De l'autre côté, des fers de lance qui dépassent : la garde veille.
  if (!c.petit) {
    const x0 = tourAGauche ? c.droite + 2 : 2;
    const x1 = tourAGauche ? L - 3 : c.bande - 3;
    for (let i = entre(h, 2, 3); i > 0; i--) {
      const x = entre(h, x0, Math.max(x0, x1));
      const y = yP - entre(h, u(4), u(8));
      p.rect(x, y + Math.max(2, u(2)), 1, yP - y, BOIS.sombre);
      p.rect(x, y, 1, Math.max(2, u(2)), FER.fond);
      p.poser(x, y, FER.lumiere);
      if (i === 1) fanion(p, x + 1, y + Math.max(2, u(3)), Math.max(2, u(4)), Math.max(1, u(2)), choisir(h, ETOFFES), 1);
    }
  }

  // La palissade : des rondins taillés en pointe, de hauteurs inégales, liés par deux traverses.
  const rl = Math.max(2, u(4));
  const d = o.graine % rl;
  const g = o.graine % 239;
  const lien = yP + Math.max(2, Math.round((solY - yP) * 0.3));
  for (let x = 0; x < L; x++) {
    const col = Math.floor((x + d) / rl);
    const dans = (x + d) % rl;
    const saut = alea(col + g, g) < 0.35 ? 1 : 0;
    const pointe = rl <= 2 ? (dans === 0 ? 0 : 1) : Math.round(Math.abs(dans - (rl - 1) / 2));
    const haut = yP - saut + pointe;
    const clair = alea(col * 3 + g, 7) < 0.5;
    for (let y = haut; y < solY; y++) {
      const calme = c.calme(x, y);
      let couleur: string = clair ? "#ead3aa" : "#e2c89c";
      if (dans === 0 && rl > 2) couleur = calme ? "#efdcb8" : BOIS.lumiere;
      else if (dans === rl - 1) couleur = calme ? "#d9bd90" : "#c9aa7a";
      if (y === lien || (y === lien + 1 && u(1) > 1)) couleur = calme ? "#d3b78a" : "#bd9d6e";
      if (y === haut && !calme) couleur = eclaircir(couleur, 0.3);
      p.poser(x, y, couleur);
    }
  }

  // Le sol : un chemin de terre battue et de l'herbe au pied des rondins.
  degrade(p, solY, H - 1, "#e6d7ae", "#d6c496", 3);
  p.rect(0, solY, L, 1, "#c4ad80");
  for (let x = (o.graine % 5) + 1; x < L - 2; x += entre(h, 3, 8)) {
    if (c.calme(x, solY) && h() < 0.6) continue;
    touffe(p, x, solY + Math.max(1, u(1)), h() < 0.5 ? "#a9cf8a" : "#bcd99a", !c.petit && h() < 0.5);
  }
  if (!c.petit) {
    for (let i = entre(h, 3, 6); i > 0; i--) p.poser(entre(h, 1, L - 2), entre(h, solY + 2, H - 2), "#c9b588");
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Le camp militaire : des tentes kaki, un poteau radio et son fanion, des sacs de sable, des caisses.
// ---------------------------------------------------------------------------------------------------------------------

/** Une tente à faîtière, vue de trois quarts : le pignon clair devant, le pan de toit qui file vers `sens`. */
function tente(p: Planche, cx: number, base: number, l: number, h: number, long: number, sens: number, toile: { clair: string; fond: string; sombre: string; creux: string }): void {
  for (let j = 0; j < h; j++) {
    const y = base - h + 1 + j;
    const demi = Math.round(((l / 2) * (j + 1)) / h);
    // Le pan de toit, derrière le pignon.
    for (let i = 0; i < long; i++) {
      const x = cx + sens * (demi + 1 + i);
      p.poser(x, y, j === 0 ? toile.clair : i === long - 1 || j === h - 1 ? toile.sombre : (i + Math.floor(long / 2)) % Math.max(3, Math.floor(long / 2)) === 0 && j > 1 ? toile.sombre : toile.fond);
    }
    for (let x = cx - demi; x <= cx + demi; x++) {
      const ouvert = j >= h * 0.4 ? Math.round((l * 0.16 * (j - h * 0.4)) / (h * 0.6)) : -1;
      let couleur = sens * (x - cx) > 0 ? melanger(toile.clair, toile.fond, 0.5) : toile.clair;
      if (Math.abs(x - cx) <= ouvert) couleur = toile.creux;
      else if (x === cx && j > 0) couleur = toile.fond;
      else if (Math.abs(x - cx) === demi) couleur = eclaircir(toile.clair, 0.35);
      p.poser(x, y, couleur);
    }
  }
}

function peindreCamp(p: Planche, o: ParametresDuFond): void {
  const c = cadreDe(o);
  const { L, H, u, solY } = c;
  const h = hasard(o.graine);
  const radioAGauche = h() < 0.5;
  const teinte = teinteDe(o.accent);
  const kaki = { clair: "#c6c48c", fond: "#adaf79", sombre: "#939766", creux: "#737852" };

  degrade(p, 0, solY, "#cfe1ea", "#f1f1df", 4);
  nuages(p, c, h, solY - u(16), "#fbfbf3", "#dfe7e2");
  remplirSous(p, crete(L, solY - u(1), Math.max(2, u(7)), h), "#c3d3b3");
  remplirSous(p, crete(L, solY + u(1), Math.max(1, u(4)), h), "#d2d8b0");
  degrade(p, solY, H - 1, "#e6d9b4", "#d6c79c", 3);
  p.rect(0, solY, L, 1, "#d0c69c");

  // Le poteau radio : un mât, une traverse, des haubans, et le fanion à la couleur de la chose.
  const px = c.milieu(radioAGauche) + (radioAGauche ? -1 : 1) * entre(h, 0, u(4));
  const haut = Math.max(1, u(3));
  const sens = radioAGauche ? 1 : -1;
  if (!c.petit) {
    ligne(p, px, haut + u(3), px + sens * u(11), solY + 1, "#b3b29a", true);
    ligne(p, px, haut + u(3), px - sens * u(7), solY + 1, "#b3b29a", true);
    // Le fil qui part vers le bord.
    ligne(p, px, haut + u(1), radioAGauche ? 0 : L - 1, haut + u(4), "#a9ab98");
  }
  p.rect(px, haut, 1, solY + 2 - haut, "#9c9a80");
  if (u(1) > 1) p.rect(px + 1, haut + u(3), 1, solY + 2 - haut - u(3), "#85846c");
  const tl = Math.max(1, u(3));
  p.rect(px - tl, haut + Math.max(1, u(2)), tl * 2 + 1, 1, "#85846c");
  p.poser(px - tl, haut + Math.max(1, u(2)) - 1, FER.clair);
  p.poser(px + tl, haut + Math.max(1, u(2)) - 1, FER.clair);
  fanion(p, px + sens, haut + Math.max(2, u(4)), Math.max(3, u(6)), Math.max(2, u(3)), teinte, sens);

  // Les tentes : une grande de chaque côté, parfois une petite au loin.
  for (const aGauche of [true, false]) {
    const large = aGauche ? c.bande : L - c.droite;
    const l = Math.max(7, Math.min(large - 1, u(15)));
    const th = Math.max(5, u(11));
    const long = Math.max(2, Math.min(u(8), large - l));
    const versBord = aGauche ? -1 : 1;
    const cx = aGauche ? Math.max(Math.floor(l / 2) + Math.min(long, 3), c.bande - 2 - Math.floor(l / 2) - entre(h, 0, u(3))) : Math.min(L - 1 - Math.floor(l / 2) - Math.min(long, 3), c.droite + 1 + Math.floor(l / 2) + entre(h, 0, u(3)));
    if (!c.petit && h() < 0.7) {
      const loin = { clair: melanger(kaki.clair, "#f1f1df", 0.35), fond: melanger(kaki.fond, "#f1f1df", 0.35), sombre: melanger(kaki.sombre, "#f1f1df", 0.35), creux: melanger(kaki.creux, "#f1f1df", 0.3) };
      tente(p, cx + versBord * Math.round(l * 0.7), solY, Math.round(l * 0.6), Math.round(th * 0.6), Math.round(long * 0.6), versBord, loin);
    }
    if (aGauche === radioAGauche && c.petit) continue;
    tente(p, cx, solY + Math.max(1, u(2)), l, th, long, versBord, kaki);
  }

  // Devant : des sacs de sable d'un côté, des caisses de l'autre.
  const base = H - 1 - Math.max(0, u(1) - 1);
  const sl = Math.max(4, u(6));
  const sh = Math.max(2, u(3));
  const largeSacs = Math.min(radioAGauche ? L - c.droite : c.bande, u(20));
  const rangs = c.petit ? 1 : 2;
  for (let r = 0; r < rangs; r++) {
    const y = base - (r + 1) * sh + 1;
    const retrait = r * Math.floor(sl / 2);
    for (let i = retrait; i + sl <= largeSacs + (r === 0 ? 2 : 0); i += sl) {
      const x = radioAGauche ? L - largeSacs - 2 + i : i - 1;
      p.rect(x, y, sl, sh, (x2, y2) => {
        if (y2 === y + sh - 1 || x2 === x + sl - 1) return "#c4b48a";
        if (y2 === y && (x2 === x || x2 === x + sl - 2)) return "#c4b48a";
        return y2 === y ? "#f0e4c2" : "#e2d3aa";
      });
    }
  }
  const cl = Math.max(4, u(8));
  const ch = Math.max(3, u(6));
  const cx = radioAGauche ? entre(h, 0, Math.max(0, Math.min(u(4), c.bande - cl - 1))) : L - cl - entre(h, 0, Math.max(0, Math.min(u(4), L - c.droite - cl - 1)));
  caisse(p, cx, base - ch + 1, cl, ch, teinte);
  if (!c.petit && h() < 0.65) caisse(p, cx + (radioAGauche ? Math.round(cl * 0.4) : -Math.round(cl * 0.15)), base - ch - Math.max(3, u(4)) + 1, Math.max(4, u(6)), Math.max(3, u(4)), null);
  for (let x = (o.graine % 7) + 2; x < L - 2; x += entre(h, 5, 11)) {
    if (!c.calme(x, solY + 1)) touffe(p, x, solY + Math.max(1, u(1)) + entre(h, 0, 1), "#b5c592", false);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Le champ de bataille : une plaine au soleil couchant clair, des étendards au loin, des fumées légères.
// ---------------------------------------------------------------------------------------------------------------------

function peindreChampDeBataille(p: Planche, o: ParametresDuFond): void {
  const c = cadreDe(o);
  const { L, H, u, solY } = c;
  const h = hasard(o.graine);
  const soleilAGauche = h() < 0.5;
  const teinte = teinteDe(o.accent);
  const horizon = solY - Math.max(1, u(2));
  const mi = Math.round(horizon * 0.5);

  degrade(p, 0, mi, "#f3c3cc", "#fbd6bb", 3);
  degrade(p, mi + 1, solY, "#fbd6bb", "#fff1d2", 3);
  // De longs nuages plats, roses et crème, en haut et sur les bords.
  const bandes = c.petit ? 2 : entre(h, 3, 5);
  for (let i = 0; i < bandes; i++) {
    const l = Math.max(5, u(entre(h, 8, 20)));
    const aGauche = i % 2 === 0;
    const x = aGauche ? entre(h, -3, Math.max(0, c.bande - l)) : entre(h, Math.min(L - l, c.droite), L - l + 3);
    const y = entre(h, 1, Math.max(2, horizon - u(7)));
    p.rect(x, y, l, 1, "#fdebe0");
    if (!c.petit) p.rect(x + Math.max(1, u(2)), y + 1, Math.max(2, l - u(5)), 1, "#f2b9bd");
  }
  // Le soleil bas, large et pâle, à demi derrière la crête.
  const r = Math.max(4, u(9));
  const sx = c.milieu(soleilAGauche) + (soleilAGauche ? 1 : -1) * entre(h, 0, u(5));
  p.disque(sx, horizon, r + Math.max(2, u(4)), (dx, dy) => (trame(sx + dx, horizon + dy, 0.5) ? "#fff3d6" : null));
  p.disque(sx, horizon, r + Math.max(1, u(1.5)), "#fff0cc");
  p.disque(sx, horizon, r, "#fffae6");

  // Deux crêtes au loin, puis la plaine.
  const loin = crete(L, horizon + u(1), Math.max(2, u(5)), h);
  remplirSous(p, loin, "#ecc1bd");
  const pres = crete(L, solY + u(1), Math.max(1, u(3)), h);

  // Les fumées : des bouffées claires qui montent en dérivant.
  const fumees = c.petit ? 1 : entre(h, 1, 2);
  for (let i = 0; i < fumees; i++) {
    const aGauche = fumees === 1 ? !soleilAGauche : i === 0;
    let x = c.milieu(aGauche) + entre(h, -u(4), u(4));
    let y = (loin[Math.max(0, Math.min(L - 1, x))] ?? horizon) - 1;
    const derive = h() < 0.5 ? 1 : -1;
    let rayon = 1;
    for (let k = entre(h, 4, 6); k > 0 && y > 2; k--) {
      p.disque(x, y, rayon, "#fdeee3");
      p.poser(x + rayon, y + rayon, "#f1cfc8");
      y -= rayon + 1;
      x += derive * entre(h, 0, Math.max(1, u(2)));
      if (k % 2 === 0 && rayon < Math.max(1, u(3))) rayon++;
      if (c.calme(x, y)) break;
    }
  }

  // Les étendards sur la crête : des hampes fines, de petites étoffes mauves, et une à la couleur de la chose.
  const mauves = ["#c39bb4", "#d3a0a0", "#b9a3c9"] as const;
  const nombre = c.petit ? 2 : entre(h, 4, 7);
  const marque = Math.floor(h() * nombre);
  for (let i = 0; i < nombre; i++) {
    const aGauche = i % 2 === 0;
    const x = aGauche ? entre(h, 1, Math.max(1, c.bande - 3)) : entre(h, c.droite + 2, L - 3);
    const pied = (loin[x] ?? horizon) + 1;
    const m = Math.max(3, u(entre(h, 5, 10)));
    p.rect(x, pied - m, 1, m, "#b48e96");
    if (i === marque || h() < 0.6) {
      const l = Math.max(2, u(3));
      etendard(p, x + (aGauche ? 1 : -l), pied - m, l, Math.max(2, u(4)), i === marque ? teinte : choisir(h, mauves));
    } else p.poser(x, pied - m, FER.clair);
  }

  remplirSous(p, pres, (x, y, prof) => {
    const t = (y - solY) / Math.max(1, H - 1 - solY);
    if (prof === 0) return "#f0d3a2";
    return trame(x, y, Math.max(0, Math.min(1, t))) ? "#dcb688" : "#e8c797";
  });
  // Devant : des herbes sèches, et des flèches ou une lance plantées dans les coins.
  for (let x = (o.graine % 6) + 1; x < L - 2; x += entre(h, 4, 9)) {
    const y = entre(h, solY + Math.max(2, u(2)), H - 2);
    if (!c.calme(x, y)) touffe(p, x, y, h() < 0.5 ? "#cfa272" : "#d9ad7a", !c.petit && h() < 0.4);
  }
  const plantes = c.petit ? 1 : entre(h, 2, 4);
  for (let i = 0; i < plantes; i++) {
    const aGauche = i % 2 === 0 ? soleilAGauche : !soleilAGauche;
    const x = aGauche ? entre(h, 2, Math.max(2, Math.min(c.bande - 3, u(14)))) : entre(h, Math.max(c.droite + 2, L - u(14)), L - 3);
    const pied = entre(h, Math.min(H - 2, solY + u(3)), H - 2);
    const m = Math.max(3, u(entre(h, 5, 9)));
    const penche = h() < 0.5 ? 1 : -1;
    ligne(p, x, pied, x + penche * Math.round(m / 4), pied - m, "#a98568");
    const tx = x + penche * Math.round(m / 4);
    if (i === 0 && !c.petit) {
      // Une lance : un fer clair et un ruban.
      p.poser(tx, pied - m - 1, FER.clair);
      p.poser(tx, pied - m, FER.fond);
      fanion(p, tx + 1, pied - m + 2, Math.max(2, u(3)), Math.max(1, u(2)), choisir(h, mauves), 1);
    } else {
      // Une flèche : son empennage clair.
      p.poser(tx - 1, pied - m, "#fbeedd");
      p.poser(tx + 1, pied - m, "#fbeedd");
      p.poser(tx, pied - m - 1, "#fbeedd");
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// La mine : une galerie de grès clair, ses étais de bois, des lanternes, et des filons qui brillent.
// ---------------------------------------------------------------------------------------------------------------------

function peindreMine(p: Planche, o: ParametresDuFond): void {
  const c = cadreDe(o);
  const { L, H, u, solY } = c;
  const h = hasard(o.graine);
  const wagonAGauche = h() < 0.5;
  const gres = { lumiere: "#f6ead0", clair: "#efdfc0", fond: "#e8d5b1", strate: "#dfc9a1", fond1: "#e0cba5", fond2: "#d6bf97" };
  const cristal = melanger(adoucir(o.accent, 0.1), "#ffffff", 0.3);

  // La roche : des strates douces qui ondulent.
  const f = 1 + h() * 1.5;
  const dep = h() * 6;
  const bande = Math.max(3, u(5));
  for (let y = 0; y < solY; y++) {
    for (let x = 0; x < L; x++) {
      const onde = Math.round(Math.sin((x / L) * Math.PI * f + dep) * u(2));
      const i = Math.floor((y + onde + (o.graine % bande)) / bande);
      const bord = (y + onde + (o.graine % bande)) % bande === 0;
      p.poser(x, y, bord ? gres.strate : i % 3 === 0 ? gres.clair : i % 3 === 1 ? gres.fond : melanger(gres.fond, gres.clair, 0.5));
    }
  }
  // Le fond de la galerie : deux voûtes emboîtées, de plus en plus profondes, calmes derrière la chose.
  const mx = (L - 1) / 2;
  const rx = Math.max(o.zone.largeur * 0.7 + 2, L * 0.27);
  const ry = Math.max(solY * 0.8, solY - o.zone.y + 2);
  for (let y = 0; y < solY; y++) {
    for (let x = 0; x < L; x++) {
      const d = Math.hypot((x - mx) / rx, (y - solY) / ry);
      if (d < 0.68) p.poser(x, y, gres.fond2);
      else if (d < 0.74) p.poser(x, y, trame(x, y, 0.5) ? gres.fond2 : gres.fond1);
      else if (d < 1) p.poser(x, y, gres.fond1);
      else if (d < 1.06) p.poser(x, y, gres.lumiere);
    }
  }
  // Le sol : la terre battue, plus claire au milieu, et une voie de planches.
  degrade(p, solY, H - 1, "#e2cfa8", "#d2bc92", 3);
  p.rect(0, solY, L, 1, "#c9b187");
  const voie = Math.min(H - 2, solY + Math.max(2, u(3)));
  if (!c.petit) {
    for (let x = (o.graine % 4) + 1; x < L; x += Math.max(4, u(5))) p.rect(x, voie - 1, Math.max(1, u(2)), 3, BOIS.sombre);
  }
  p.rect(0, voie, L, 1, (x, y) => (c.calme(x, y) ? "#b9b7b4" : FER.fond));

  // Les filons : des veines d'or en zigzag et des cristaux à la couleur de la chose, dans les parois.
  const veines = c.petit ? 2 : entre(h, 4, 6);
  for (let i = 0; i < veines; i++) {
    const aGauche = i % 2 === 0;
    let x = aGauche ? entre(h, Math.max(2, u(6)), Math.max(3, c.bande - 2)) : entre(h, c.droite + 1, L - 1 - Math.max(2, u(6)));
    let y = entre(h, Math.max(3, u(7)), Math.max(4, solY - u(8)));
    const sens = h() < 0.5 ? 1 : -1;
    const longueur = Math.max(3, u(entre(h, 5, 9)));
    for (let k = 0; k < longueur; k++) {
      if (c.calme(x, y) || Math.hypot((x - mx) / rx, (y - solY) / ry) < 1.08) break;
      p.poser(x, y, k % 3 === 1 ? "#fff3b8" : "#f1cb62");
      if (k % 4 === 2 && !c.petit) p.poser(x, y - 1, "#f7dc8a");
      x += sens;
      if (h() < 0.55) y += 1;
    }
    // Un cristal au bout de la veine.
    if (!c.calme(x, y) && Math.hypot((x - mx) / rx, (y - solY) / ry) >= 1.1 && y < solY - 2) {
      const t = Math.max(1, u(1.6));
      for (let j = -t; j <= t; j++) {
        for (let k2 = -(t - Math.abs(j)); k2 <= t - Math.abs(j); k2++) p.poser(x + k2, y + j, k2 < 0 || j < 0 ? cristal : ombreDe(cristal));
      }
      p.poser(x - (t > 1 ? 1 : 0), y - (t > 1 ? 1 : 0), "#ffffff");
    }
  }

  // Les étais : deux poteaux, une poutre, deux jambes de force.
  const ep = Math.max(2, u(3));
  const px = Math.max(1, u(2));
  const py = Math.max(1, u(2));
  const lueurs: [number, number][] = [];
  const nombre = c.petit ? 1 : 2;
  for (let i = 0; i < nombre; i++) {
    const aGauche = nombre === 1 ? !wagonAGauche : i === 0;
    const large = aGauche ? c.bande : L - c.droite;
    const x = c.milieu(aGauche) + (aGauche ? 1 : -1) * Math.min(Math.floor(large / 4), entre(h, 0, u(3))) + (aGauche ? ep : -ep) * 0;
    lueurs.push([Math.max(px + ep + 2, Math.min(L - px - ep - 3, x)), py + ep + Math.max(2, u(3)) + entre(h, 0, u(2))]);
  }
  for (const [lx, ly] of lueurs) lueur(p, lx, ly + u(2), Math.max(6, u(13)), "#fff2c4", 0.9);
  for (const x of [px, L - px - ep]) {
    p.rect(x, py, ep, voie - py, (x2, y2) => (x2 === x ? BOIS.clair : x2 === x + ep - 1 ? BOIS.sombre : y2 % Math.max(4, u(7)) === 3 ? BOIS.sombre : BOIS.fond));
  }
  p.rect(0, py, L, ep, (x, y) => (y === py ? BOIS.clair : y === py + ep - 1 ? BOIS.sombre : x % Math.max(5, u(9)) === 4 ? BOIS.sombre : BOIS.fond));
  if (!c.petit) {
    const j = Math.max(3, u(6));
    for (let k = 0; k < j; k++) {
      p.rect(px + ep + k, py + ep + j - 1 - k, Math.max(1, u(1.5)), 1, BOIS.sombre);
      p.rect(L - px - ep - 1 - k - Math.max(1, u(1.5)) + 1, py + ep + j - 1 - k, Math.max(1, u(1.5)), 1, BOIS.sombre);
    }
  }
  // Les lanternes, pendues à la poutre.
  for (const [lx, ly] of lueurs) {
    const ll = Math.max(3, u(3)) | 1;
    const lh = Math.max(3, u(4));
    p.rect(lx, py + ep, 1, ly - py - ep, FER.sombre);
    p.rect(lx - Math.floor(ll / 2), ly, ll, lh, (x2, y2) => {
      if (y2 === ly || y2 === ly + lh - 1) return BOIS.creux;
      if (x2 === lx - Math.floor(ll / 2) || x2 === lx + Math.floor(ll / 2)) return ll >= 5 ? BOIS.creux : "#ffe28e";
      return x2 === lx ? "#fffbe0" : "#ffe28e";
    });
  }

  // Le wagonnet, plein de minerai, sur sa voie.
  const large = wagonAGauche ? c.bande : L - c.droite;
  const wl = Math.max(5, Math.min(large - px - ep - 2, u(11)));
  const wh = Math.max(3, u(5));
  if (wl >= 5) {
    const wx = wagonAGauche ? px + ep + 1 + entre(h, 0, Math.max(0, large - px - ep - 2 - wl)) : c.droite + 1 + entre(h, 0, Math.max(0, large - px - ep - 2 - wl));
    const wy = voie - wh - Math.max(0, u(1) - 1);
    for (let i = 1; i < wl - 1; i++) {
      const bosse = Math.round(Math.sin((i / (wl - 1)) * Math.PI) * Math.max(1, u(2)));
      for (let j = 1; j <= bosse; j++) p.poser(wx + i, wy - j, alea(wx + i + (o.graine % 17), j) < 0.3 ? "#f1cb62" : alea(i, j + (o.graine % 13)) < 0.25 ? cristal : "#cdb48a");
    }
    for (let j = 0; j < wh; j++) {
      const retrait = j >= wh - 1 && wl >= 7 ? 1 : 0;
      for (let i = retrait; i < wl - retrait; i++) p.poser(wx + i, wy + j, j === 0 ? FER.lumiere : i === wl - 1 - retrait ? FER.sombre : (i - retrait) % Math.max(3, u(4)) === 0 && wl >= 7 ? FER.sombre : FER.fond);
    }
    for (const rxx of [wx + 1, wx + wl - 2 - (u(1) > 1 ? 1 : 0)]) p.rect(rxx, wy + wh, u(1) > 1 ? 2 : 1, Math.max(1, voie - wy - wh), BOIS.creux);
  }
  // Des cailloux au sol.
  if (!c.petit) {
    for (let i = entre(h, 4, 8); i > 0; i--) {
      const x = entre(h, 1, L - 3);
      const y = entre(h, Math.min(H - 1, voie + 2), H - 1);
      p.poser(x, y, "#bfa67c");
      if (h() < 0.5) p.poser(x + 1, y, "#efe0c0");
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Le tournoi : la lice, un pavillon rayé à la couleur de la chose, un second pavillon ou la tribune, des fanions.
// ---------------------------------------------------------------------------------------------------------------------

/** Un pavillon rond rayé : un mur de toile, un toit en cône, un fanion au sommet. */
function pavillon(p: Planche, cx: number, base: number, l: number, hMur: number, hToit: number, couleur: string, c: Cadre, sens: number): void {
  const x0 = cx - Math.floor(l / 2);
  const raie = Math.max(1, Math.round(l / 7));
  const sombre = ombreDe(couleur);
  const haut = base - hMur + 1;
  for (let y = haut; y <= base; y++) {
    for (let x = x0; x < x0 + l; x++) {
      const pleine = Math.floor((x - x0) / raie) % 2 === 0;
      const aLOmbre = x - x0 >= l * 0.7;
      let couleurIci = pleine ? (aLOmbre ? sombre : couleur) : aLOmbre ? "#e6dfd2" : BLANC;
      const porte = Math.abs(x - cx) <= Math.max(0, Math.round(l / 9)) && y > haut + Math.max(1, Math.round(hMur * 0.3));
      if (porte) couleurIci = melanger(sombre, "#6a5868", 0.3);
      p.poser(x, y, couleurIci);
    }
  }
  // Le lambrequin : une frise à dents sous le toit.
  for (let x = x0 - 1; x <= x0 + l; x++) {
    p.poser(x, haut, sombre);
    if ((x - x0) % 2 === 0 && hMur >= 5) p.poser(x, haut + 1, sombre);
  }
  for (let j = 0; j < hToit; j++) {
    const y = haut - hToit + j;
    const demi = Math.max(0, Math.round(((l / 2 + 1) * (j + 1)) / hToit));
    for (let x = cx - demi; x <= cx + demi; x++) {
      const secteur = Math.floor(((x - cx) / (demi + 0.5)) * 2.5 + 10);
      const pleine = secteur % 2 === 0;
      p.poser(x, y, pleine ? (x > cx + demi * 0.4 ? sombre : couleur) : x > cx + demi * 0.4 ? "#e6dfd2" : BLANC);
    }
  }
  const mat = Math.max(2, c.u(3));
  p.rect(cx, haut - hToit - mat, 1, mat, BOIS.creux);
  fanion(p, cx + sens, haut - hToit - mat, Math.max(2, c.u(5)), Math.max(1, c.u(2.6)), couleur, sens);
}

function peindreTournoi(p: Planche, o: ParametresDuFond): void {
  const c = cadreDe(o);
  const { L, H, u, solY } = c;
  const h = hasard(o.graine);
  const pavillonAGauche = h() < 0.5;
  const avecTribune = h() < 0.55;
  const teinte = teinteDe(o.accent);
  const autres = ETOFFES.filter((_, i) => i !== o.graine % ETOFFES.length);
  const seconde = choisir(h, autres);

  degrade(p, 0, solY, "#bfe3fa", "#eef8fd", 4);
  nuages(p, c, h, solY - u(22), "#ffffff", "#dcedf8");
  remplirSous(p, crete(L, solY - u(1), Math.max(2, u(5)), h), "#c5e3bd");
  // Une rangée d'arbres ronds, au loin.
  if (!c.petit) {
    for (let x = (o.graine % 5) - 2; x < L; x += entre(h, 4, 9)) {
      const r = Math.max(1, u(entre(h, 2, 3)));
      p.disque(x, solY - r, r, (dx, dy) => (dx + dy < -r * 0.3 ? "#b9dcae" : "#a9d0a0"));
    }
  }
  // Le pré, et la piste de sable de la lice.
  degrade(p, solY, H - 1, "#c3e3a0", "#acd488", 3);
  p.rect(0, solY, L, 1, "#a4cc84");
  const piste = Math.min(H - 2, solY + Math.max(2, u(3)));
  p.rect(0, piste, L, H - piste - Math.max(1, u(1.5)), (x, y) => (y === piste ? "#f6ead0" : trame(x, y, 0.25) ? "#e6d5a6" : "#efe0b8"));

  // La tribune (ou un second pavillon) d'un côté.
  const base = solY + Math.max(1, u(1));
  {
    const aGauche = !pavillonAGauche;
    const large = aGauche ? c.bande : L - c.droite;
    if (avecTribune && !c.petit) {
      const tl = Math.max(9, Math.min(large - 1, u(19)));
      const tx = aGauche ? Math.max(0, c.bande - tl - 1 - entre(h, 0, u(2))) : Math.min(L - tl, c.droite + 1 + entre(h, 0, u(2)));
      const hBas = Math.max(3, u(6));
      const hRang = Math.max(2, u(3));
      const hVide = Math.max(2, u(4));
      const hAuvent = Math.max(2, u(3));
      const yRang = base - hBas - hRang + 1;
      const yAuvent = yRang - hVide - hAuvent;
      const pan = Math.max(2, u(3));
      // Le soubassement drapé, en panneaux de deux couleurs.
      p.rect(tx, base - hBas + 1, tl, hBas, (x, y) => (y === base - hBas + 1 ? BOIS.lumiere : Math.floor((x - tx) / pan) % 2 === 0 ? seconde : y === base ? "#e6dfd2" : BLANC));
      // Le fond de la loge et le rang des spectateurs : des têtes rondes, sans visage.
      p.rect(tx, yRang - hVide, tl, hVide + hRang, "#e6d9c8");
      const teintes = ["#f1cdae", "#e4b693", FER.clair, "#d9a98c", "#f1cdae"] as const;
      for (let x = tx + 1 + (o.graine % 2); x < tx + tl - 1; x += Math.max(2, u(2.5))) {
        const y = yRang - (alea(x, o.graine % 97) < 0.4 ? 1 : 0);
        p.poser(x, y, teintes[Math.floor(alea(x + (o.graine % 31), 3) * teintes.length)]!);
        p.rect(x, y + 1, 1, yRang + hRang - y - 1, alea(x, 9 + (o.graine % 11)) < 0.5 ? ombreDe(seconde) : "#c9b9c9");
      }
      p.rect(tx, yRang + hRang - 1, tl, 1, BOIS.fond);
      for (const x of [tx, tx + tl - 1]) p.rect(x, yAuvent, 1, yRang + hRang - yAuvent, BOIS.sombre);
      // L'auvent rayé et ses dents.
      p.rect(tx - 1, yAuvent, tl + 2, hAuvent, (x, y) => (y === yAuvent ? eclaircir(seconde, 0.4) : Math.floor((x - tx + 1) / pan) % 2 === 0 ? seconde : BLANC));
      for (let x = tx - 1; x <= tx + tl; x++) if ((x - tx) % 2 === 0) p.poser(x, yAuvent + hAuvent, ombreDe(seconde));
      const mat = Math.max(2, u(4));
      for (const x of [tx, tx + tl - 1]) {
        p.rect(x, yAuvent - mat, 1, mat, BOIS.creux);
        fanion(p, x + (aGauche ? 1 : -1), yAuvent - mat, Math.max(2, u(4)), Math.max(1, u(2.6)), x === tx ? seconde : teinte, aGauche ? 1 : -1);
      }
    } else {
      const l = Math.max(7, Math.min(large - 2, u(13)));
      const cx = c.milieu(aGauche) + entre(h, -u(2), u(2));
      pavillon(p, cx, base, l, Math.max(4, u(8)), Math.max(3, u(7)), seconde, c, aGauche ? 1 : -1);
    }
  }
  // Le pavillon à la couleur de la chose, de l'autre côté.
  {
    const large = pavillonAGauche ? c.bande : L - c.droite;
    const l = Math.max(7, Math.min(large - 2, u(14)));
    const cx = c.milieu(pavillonAGauche) + entre(h, -u(2), u(2));
    pavillon(p, cx, base + Math.max(0, u(1) - 1), l, Math.max(4, u(9)), Math.max(3, u(8)), teinte, c, pavillonAGauche ? 1 : -1);
  }

  // La lice : une barrière basse, drapée d'un damier sur les bords.
  const by = piste + Math.max(1, u(2));
  const ep = Math.max(1, u(1.4));
  const hb = Math.max(2, u(3));
  if (by + ep + hb < H) {
    const carre = Math.max(1, u(2));
    for (let x = 0; x < L; x++) {
      const calme = c.calme(x, by);
      if (!calme && (x < c.bande - 1 || x > c.droite)) {
        for (let y = by + ep; y < by + ep + hb; y++) p.poser(x, y, (Math.floor(x / carre) + Math.floor((y - by - ep) / carre)) % 2 === 0 ? teinte : BLANC);
      } else if (x % Math.max(5, u(9)) === 2) p.rect(x, by + ep, 1, hb, BOIS.sombre);
    }
    p.rect(0, by, L, ep, (x, y) => (y === by ? BOIS.lumiere : BOIS.clair));
  }
  for (let x = (o.graine % 6) + 1; x < L - 2; x += entre(h, 5, 10)) touffe(p, x, H - 1, "#98c476", false);
}

// ---------------------------------------------------------------------------------------------------------------------

export const SCENES_B: readonly SceneDeFond[] = [
  { id: "forge", nom: CATALOGUE_DES_SCENES.forge.nom, peindre: peindreForge },
  { id: "armurerie", nom: CATALOGUE_DES_SCENES.armurerie.nom, peindre: peindreArmurerie },
  { id: "remparts", nom: CATALOGUE_DES_SCENES.remparts.nom, peindre: peindreRemparts },
  { id: "camp-militaire", nom: CATALOGUE_DES_SCENES["camp-militaire"].nom, peindre: peindreCamp },
  { id: "champ-de-bataille", nom: CATALOGUE_DES_SCENES["champ-de-bataille"].nom, peindre: peindreChampDeBataille },
  { id: "mine", nom: CATALOGUE_DES_SCENES.mine.nom, peindre: peindreMine },
  { id: "tournoi", nom: CATALOGUE_DES_SCENES.tournoi.nom, peindre: peindreTournoi },
];
