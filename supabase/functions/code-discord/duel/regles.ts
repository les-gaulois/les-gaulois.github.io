/**
 * Les règles de « Coup pour coup », le duel de cartes de « Mon Gaulois » : portées de `regles.js`, la maquette version 5
 * validée par le pilote le 22 novembre 2026 (Claude Fable 5.2), sans rien changer à ce qu'elles font. Pures et sans
 * hasard : l'écran, la machine, la fonction `code-discord` et les essais lisent ce même fichier. Le serveur en aura une
 * copie en SQL (`internal.duel_manche`, migration du duel à venir), qui fera foi, comparée à ce fichier par un test sur des
 * milliers de duels tirés au hasard. `tests/unit/duel-reference.test.ts` rejoue 160 duels écrits par la maquette elle-même.
 *
 * Le déroulé : chaque Gaulois a une main de cinq cartes, une par emplacement, achetée dans une bourse de 12 points. À
 * chaque manche, les deux posent une carte en même temps ; la manche se résout (`manche`), et le duel dure jusqu'à ce
 * qu'un Gaulois tombe. Une carte jouée se repose deux manches ; la fatigue, à partir de la sixième, finit toujours le duel.
 *
 * Ce qui change de la maquette :
 * - quand toutes les cartes d'un camp se reposent (des gels empilés peuvent le faire), celles qui ont le moins de repos
 *   restent jouables (`libres`) ; la maquette n'avait rien prévu pour ce cas. L'écran grise les cartes avec `libres`, pas
 *   avec `repos === 0`, et le serveur refuse une carte selon la même règle ;
 * - la fanfare du clan se réunit avec deux pièces (`effets.ts`).
 * Ce qui s'ajoute, sans rien changer : la rareté « saison » (l'objet du pass, au prix du légendaire), les atouts de plus
 * d'un camp (`OptionsDuCamp.passifs`, le pouvoir d'un boss), la vérification d'une main (`refusDeLaMain`) et ses cartes
 * dans l'ordre (`cartesDeLaMain`).
 */
import { CATALOGUE_DU_DUEL } from "./catalogue.ts";
import { COMPAGNONS, EMPLACEMENTS_DU_DUEL, LIEUX, PANOPLIES } from "./effets.ts";
import type { Atouts, CleDAtout, EmplacementDuDuel, IdDeCompagnon, IdDeLieu, IdDePanoplie, MotCle, MotDeCarte, RareteDuDuel } from "./effets.ts";

/** Les chiffres des règles, chacun expliqué. */
export const P = {
  /** Le plafond d'une main : une légendaire et de quoi l'entourer, jamais cinq raretés hautes. */
  BOURSE: 12,
  /** La vie de tout Gaulois : de quoi tenir six à dix manches. */
  VIE_DE_BASE: 18,
  POINTS_POUR_UNE_VIE: 1,
  /** La force d'une carte : son prix, plus deux (une carte de base compte donc). */
  FORCE_EN_PLUS: 2,
  /** Une carte jouée se repose deux manches : trois cartes au choix à chaque manche. */
  REPOS: 2,
  /** L'énergie de la première manche. */
  ENERGIE_DEPART: 3,
  /** Ce que chaque manche rend. */
  ENERGIE_PAR_MANCHE: 3,
  /** Le prix de la carte la plus chère. */
  ENERGIE_PLAFOND: 6,
  /** Une carte jouée sans assez d'énergie : force 1, et ses mots-clés ne jouent pas. */
  FORCE_ESSOUFFLEE: 1,
  /** Un coup qui porte donne cet élan au coup de la manche suivante. */
  ENCHAINEMENT: 1,
  /** Un coup de tête coûte ce point de vie à celui qui le donne. */
  RECUL_DE_TETE: 1,
  /** Chaque souffle rend ce point de moins que le précédent. */
  USURE_DU_SOUFFLE: 1,
  /** La première manche où la fatigue frappe : 1 point, puis 2, puis 3… */
  FATIGUE_DES: 6,
  /** Un saignement coûte 1 de vie par manche, pendant autant de manches que son chiffre. */
  SAIGNE_PAR_MANCHE: 1,
  /** La force de plus d'une carte lourde. */
  LOURD_FORCE: 2,
  /** Le coup de grâce joue quand l'autre a ce chiffre de vie ou moins. */
  COUP_DE_GRACE_SOUS: 6,
  /** Ce qu'arrête la muraille. */
  MURAILLE: 5,
  /** Le butin rend au plus ce chiffre de vie. */
  BUTIN_AU_PLUS: 2,
  /** Chaque point de bourse gardé donne deux points de vie : les mots-clés des cartes rares pèsent lourd, la vie les compense. */
  VIE_PAR_POINT: 2,
} as const;

/** Un duel ne dure jamais plus de manches : la fatigue le finit bien avant (13 au plus dans l'essai de la maquette). */
export const MANCHES_AU_PLUS = 40;

/** Le prix d'une carte, par rareté ; le légendaire de saison a celui du légendaire. */
export const RANGS: Readonly<Record<RareteDuDuel, number>> = { base: 0, commun: 1, "peu-commun": 2, epique: 3, mystique: 4, legendaire: 5, saison: 5, divin: 6 };

/** Le rôle de chaque emplacement : l'arme frappe, la tête cogne, le haut garde, les pieds donnent l'élan, le bas le souffle. */
export type Role = "frappe" | "tete" | "garde" | "elan" | "souffle";
export const ROLES: Readonly<Record<EmplacementDuDuel, Role>> = { arme: "frappe", tete: "tete", haut: "garde", pieds: "elan", bas: "souffle" };

export const prix = (r: RareteDuDuel): number => RANGS[r];
export const force = (r: RareteDuDuel): number => RANGS[r] + P.FORCE_EN_PLUS;
/** Une arme ou une tête : un coup, qui peut porter. */
export const estCoup = (role: Role): boolean => role === "frappe" || role === "tete";

export type Mots = Partial<Record<MotCle, number>>;

/** Une carte : un objet du catalogue, avec son rôle, son prix (`c`), sa force (`f`), ses mots-clés et son repos. */
export interface Carte {
  id: string;
  e: EmplacementDuDuel;
  r: RareteDuDuel;
  role: Role;
  /** Le prix, en points de bourse et en énergie. */
  c: number;
  /** La force. */
  f: number;
  mots: Mots;
  liste: readonly MotDeCarte[];
  unique: string | null;
  panoplie: IdDePanoplie | null;
  /** Le nombre de manches où elle se repose après avoir été jouée. */
  repos: number;
}

/** L'objet est-il une carte du duel ? */
export const estUneCarte = (id: unknown): id is string => typeof id === "string" && Object.hasOwn(CATALOGUE_DU_DUEL, id);

/** La carte d'un objet du catalogue : son emplacement donne le rôle, sa rareté le prix et la force, le catalogue ses mots-clés. */
export function carte(id: string): Carte {
  const f = estUneCarte(id) ? CATALOGUE_DU_DUEL[id] : undefined;
  if (!f) throw new Error("objet inconnu : " + id);
  const liste = f.m ?? [], mots: Mots = {};
  for (const [m, n] of liste) mots[m] = n === undefined ? 1 : n;
  return {
    id,
    e: f.e,
    r: f.r,
    role: ROLES[f.e],
    c: prix(f.r),
    f: force(f.r) + (mots.lourd ? P.LOURD_FORCE : 0),
    mots,
    liste,
    unique: f.u ?? null,
    panoplie: f.p ?? null,
    repos: mots.infatigable ? 0 : P.REPOS + (mots.lourd ? 1 : 0) - (mots.vif ? 1 : 0),
  };
}

export const prixDeLaMain = (main: readonly Carte[]): number => main.reduce((s, c) => s + c.c, 0);

/** Les panoplies qu'une main réunit : assez de pièces d'une même famille. */
export function panopliesDe(main: readonly Carte[]): IdDePanoplie[] {
  const n: Partial<Record<IdDePanoplie, number>> = {};
  for (const c of main) if (c.panoplie) n[c.panoplie] = (n[c.panoplie] ?? 0) + 1;
  return (Object.keys(n) as IdDePanoplie[]).filter((k) => (n[k] ?? 0) >= PANOPLIES[k].pieces);
}

/** Ce qui accompagne un camp : son compagnon (la famille de son familier), le lieu du duel, et des atouts de plus (le pouvoir d'un boss). */
export interface OptionsDuCamp {
  compagnon?: IdDeCompagnon | null;
  lieu?: IdDeLieu | null;
  passifs?: readonly Atouts[];
}

/** Les atouts d'un camp : ses panoplies, son compagnon, et le lieu, qui vaut pour les deux. */
export function atoutsDe(main: readonly Carte[], opts: OptionsDuCamp = {}): Atouts {
  const a: Atouts = {};
  const plus = (p: Atouts): void => {
    for (const k of Object.keys(p) as CleDAtout[]) a[k] = (a[k] ?? 0) + (p[k] ?? 0);
  };
  for (const k of panopliesDe(main)) plus(PANOPLIES[k].passif);
  if (opts.compagnon && Object.hasOwn(COMPAGNONS, opts.compagnon)) plus(COMPAGNONS[opts.compagnon].passif);
  if (opts.lieu && Object.hasOwn(LIEUX, opts.lieu)) plus(LIEUX[opts.lieu].passif);
  for (const p of opts.passifs ?? []) plus(p);
  return a;
}

export const vieDeLaMain = (main: readonly Carte[], opts?: OptionsDuCamp): number =>
  P.VIE_DE_BASE + Math.floor((Math.max(0, P.BOURSE - prixDeLaMain(main)) * P.VIE_PAR_POINT) / P.POINTS_POUR_UNE_VIE) + (atoutsDe(main, opts).vie ?? 0);

/** Un saignement : `n` de vie par manche, pendant `t` manches ; `neuf` le temps de la manche où il est donné. */
export interface Saignement {
  n: number;
  t: number;
  neuf: boolean;
}

/** Ce qui ne sert qu'une fois par duel. */
export interface Drapeaux {
  survie: number;
  premierCoup: number;
  premiereFatigue: number;
  premierSouffle: number;
}

/** Un Gaulois en duel. */
export interface Camp {
  vie: number;
  vieMax: number;
  energie: number;
  plafond: number;
  elan: number;
  /** Le nombre de souffles déjà pris. */
  souffles: number;
  saignes: Saignement[];
  main: readonly Carte[];
  /** Les manches de repos qui restent à chaque carte, dans l'ordre de la main. */
  repos: number[];
  at: Atouts;
  drapeaux: Drapeaux;
}

/** Les cartes jouables : celles qui ne se reposent pas ; si toutes se reposent, celles qui ont le moins de repos. */
export function libres(c: Pick<Camp, "repos">): number[] {
  const l = c.repos.map((r, i) => (r === 0 ? i : -1)).filter((i) => i >= 0);
  if (l.length || !c.repos.length) return l;
  const min = Math.min(...c.repos);
  return c.repos.map((r, i) => (r === min ? i : -1)).filter((i) => i >= 0);
}

/** Un camp au départ du duel. */
export function camp(main: readonly Carte[], opts: OptionsDuCamp = {}): Camp {
  const at = atoutsDe(main, opts), v = vieDeLaMain(main, opts), plafond = P.ENERGIE_PLAFOND + (at.plafond ?? 0);
  return {
    vie: v,
    vieMax: v,
    energie: Math.min(plafond, P.ENERGIE_DEPART + (at.energieDepart ?? 0)),
    plafond,
    elan: at.elanDepart ?? 0,
    souffles: 0,
    saignes: [],
    main: main.slice(),
    repos: main.map(() => 0),
    at,
    drapeaux: { survie: at.survie ?? 0, premierCoup: at.premierCoup ?? 0, premiereFatigue: at.premiereFatigue ?? 0, premierSouffle: at.premierSouffle ?? 0 },
  };
}

const copie = (c: Camp): Camp => ({ ...c, saignes: c.saignes.map((s) => ({ ...s })), repos: c.repos.slice(), drapeaux: { ...c.drapeaux } });

/** La fatigue de la manche `m` : 0 avant la sixième, puis 1, 2, 3… */
export const fatigueDe = (m: number, c?: Pick<Camp, "at"> | null): number => Math.max(0, m - P.FATIGUE_DES - (c?.at.fatigueTard ?? 0) + 1);

/** La force d'une carte jouée maintenant par `c` contre `lui`. Essoufflée : force 1, sans mots-clés. */
export function forceJouee(c: Camp, ca: Carte, lui?: Camp | null): number {
  if (c.energie < ca.c) return P.FORCE_ESSOUFFLEE + (estCoup(ca.role) ? c.elan : 0);
  const at = c.at, m = ca.mots;
  let f = ca.f;
  if (lui && m.rage && c.vie < lui.vie) f += m.rage;
  if (lui && m.execute && lui.vie <= P.COUP_DE_GRACE_SOUS) f += m.execute;
  if (estCoup(ca.role)) {
    f += c.elan + (c.drapeaux.premierCoup || 0);
    if (lui && at.rage && c.vie < lui.vie) f += at.rage;
    if (ca.role === "frappe") f += at.frappePlus ?? 0;
  }
  if (ca.role === "garde") f += at.gardePlus ?? 0;
  if (ca.role === "elan") f += at.elanPlus ?? 0;
  if (ca.role === "souffle") f = Math.max(0, f - (at.souffleSansUsure ? 0 : c.souffles * P.USURE_DU_SOUFFLE)) + (at.soufflePlus ?? 0) + (c.drapeaux.premierSouffle || 0);
  return f;
}

/** Ce qui se voit jouer : un mot-clé (ou « survie ») qui a joué, son chiffre, la vie ou l'énergie qu'il change, et sur quel camp. */
export interface Evenement {
  mot: MotCle | "survie";
  n?: number;
  vie?: number;
  energie?: number;
  sur?: "a" | "b";
  /** Vient d'une panoplie, pas de la carte. */
  panoplie?: true;
}

/** La carte jouée par un camp pendant une manche, et ce qu'elle a fait. */
export interface Coup {
  /** L'indice de la carte dans la main. */
  i: number;
  carte: Carte;
  qui: "a" | "b";
  role: Role;
  /** Jouée sans assez d'énergie : force 1, sans mots-clés. */
  essouffle: boolean;
  mots: Mots;
  /** L'élan pris par ce coup. */
  elanPris: number;
  force: number;
  /** L'énergie payée. */
  paye: number;
  /** Les dégâts que ce coup a faits. */
  degats: number;
  /** Ce que la garde de ce camp a arrêté. */
  pare: number;
  /** Ce que la garde de ce camp a renvoyé. */
  renvoi: number;
  /** La vie perdue par ce camp pendant les coups. */
  subis: number;
  /** Le recul du coup de tête. */
  recul: number;
  /** La vie rendue par le souffle. */
  soin: number;
  /** L'élan donné par les pieds. */
  elan: number;
  /** Coupé par un coup de tête : ni souffle, ni élan, ni mots-clés de fin de manche. */
  coupe: boolean;
  /** L'élan de l'enchaînement, quand le coup a porté. */
  enchaine: number;
  /** La vie perdue au saignement. */
  saignement: number;
  /** Les manches de repos de plus données à cette carte par un gel d'en face. */
  gele: number;
  /** La vie que rend le butin. */
  butin: number;
  vole: boolean;
  evts: Evenement[];
}

/** Ce que rend une manche : les deux camps après la manche, ce que chaque carte a fait, la fatigue de chacun. */
export interface Manche {
  a: Camp;
  b: Camp;
  fa: Coup;
  fb: Coup;
  fatigue: { a: number; b: number };
  fini: boolean;
}

/** Joue la manche `m` : `a` pose sa carte `ia`, `b` sa carte `ib`. Rend les deux camps et, pour chacun, ce qui s'est passé. */
export function manche(a0: Camp, b0: Camp, ia: number, ib: number, m: number): Manche {
  const a = copie(a0), b = copie(b0);
  const ouvrir = (c: Camp, i: number, qui: "a" | "b", lui: Camp): Coup => {
    const ca = c.main[i];
    if (!ca) throw new Error("carte absente : " + i);
    const essouffle = c.energie < ca.c, role = ca.role;
    const f: Coup = {
      i, carte: ca, qui, role, essouffle, mots: essouffle ? {} : ca.mots, elanPris: estCoup(role) ? c.elan : 0, force: forceJouee(c, ca, lui),
      paye: essouffle ? c.energie : ca.c, degats: 0, pare: 0, renvoi: 0, subis: 0, recul: 0, soin: 0, elan: 0, coupe: false, enchaine: 0, saignement: 0, gele: 0, butin: 0, vole: false, evts: [],
    };
    c.energie -= f.paye;
    c.elan = 0;
    if (estCoup(role)) c.drapeaux.premierCoup = 0;
    return f;
  };
  const fa = ouvrir(a, ia, "a", b0), fb = ouvrir(b, ib, "b", a0);
  const camps = { a, b }, autre = (f: Coup): Coup => (f === fa ? fb : fa), de = (f: Coup): Camp => camps[f.qui];
  const note = (f: Coup, mot: Evenement["mot"], o: Omit<Evenement, "mot"> = {}): void => {
    f.evts.push({ mot, ...o });
  };
  // les coups : la garde arrête et renvoie, le rempart amortit, les épines piquent
  const coup = (moi: Coup, lui: Coup): void => {
    if (!estCoup(moi.role)) return;
    const im = moi.mots.inarretable, garde = im || lui.role !== "garde" ? 0 : Math.max(0, lui.force - (moi.mots.perce || 0));
    if (moi.mots.perce && lui.role === "garde") note(moi, "perce", { n: Math.min(moi.mots.perce, lui.force) });
    lui.pare = Math.min(moi.force, garde);
    let d = moi.force - lui.pare;
    const mur = im ? 0 : (lui.mots.muraille ? P.MURAILLE : 0) + (lui.mots.rempart || 0) + (de(lui).at.rempart || 0), amorti = Math.min(d, mur);
    if (amorti > 0) {
      d -= amorti;
      note(lui, lui.mots.muraille ? "muraille" : "rempart", { n: amorti });
    }
    if (im && (lui.role === "garde" || lui.mots.rempart || lui.mots.muraille)) note(moi, "inarretable");
    moi.degats = d;
    lui.subis += d;
    lui.renvoi = lui.pare;
    moi.subis += lui.renvoi;
    if (lui.mots.epines) {
      moi.subis += lui.mots.epines;
      note(lui, "epines", { n: lui.mots.epines, vie: -lui.mots.epines, sur: moi.qui });
    }
    if (moi.role === "tete") {
      moi.recul = P.RECUL_DE_TETE;
      moi.subis += moi.recul;
      if (lui.role === "elan" || lui.role === "souffle") lui.coupe = true;
    }
    if (d > 0) {
      if (moi.mots.assomme) {
        const n = Math.min(moi.mots.assomme, de(lui).energie);
        de(lui).energie -= n;
        note(moi, "assomme", { n, energie: -n, sur: lui.qui });
      }
      if (moi.mots.saigne) {
        de(lui).saignes.push({ n: P.SAIGNE_PAR_MANCHE, t: moi.mots.saigne, neuf: true });
        note(moi, "saigne", { n: moi.mots.saigne, sur: lui.qui });
      }
      if (moi.mots.vampire) moi.butin = Math.min(d, P.BUTIN_AU_PLUS);
      const brule = de(moi).at.brule;
      if (brule) {
        lui.subis += brule;
        note(moi, "brule", { n: brule, vie: -brule, sur: lui.qui, panoplie: true });
      }
    }
  };
  coup(fa, fb);
  coup(fb, fa);
  for (const f of [fa, fb]) {
    if (f.mots.brule && !f.coupe) {
      autre(f).subis += f.mots.brule;
      note(f, "brule", { n: f.mots.brule, vie: -f.mots.brule, sur: autre(f).qui });
    }
  }
  const paires: readonly (readonly [Camp, Coup])[] = [[a, fa], [b, fb]];
  for (const [c, f] of paires) {
    c.vie -= f.subis;
    if (c.vie <= 0 && c.drapeaux.survie) {
      // la tenue de l'introuvable
      c.vie = 1;
      c.drapeaux.survie = 0;
      note(f, "survie", { sur: f.qui });
    }
  }
  const fatigue = { a: 0, b: 0 };
  if (a.vie > 0 && b.vie > 0) {
    for (const [c, f] of paires) {
      if (f.coupe) continue;
      const mo = f.mots;
      const soigne = (n: number, mot?: MotCle): number => {
        const s = Math.min(n, c.vieMax - c.vie);
        c.vie += s;
        if (mot) note(f, mot, { n: s, vie: s, sur: f.qui });
        return s;
      };
      if (f.role === "souffle") {
        f.soin = soigne(f.force);
        c.souffles++;
        c.drapeaux.premierSouffle = 0;
      }
      if (f.butin) soigne(f.butin, "vampire");
      if (mo.regal) soigne(mo.regal, "regal");
      if (f.role === "elan") {
        f.elan = f.force;
        c.elan += f.force;
      }
      if (mo.elan) {
        c.elan += mo.elan;
        note(f, "elan", { n: mo.elan, sur: f.qui });
      }
      if (mo.purge && c.saignes.length) {
        c.saignes = [];
        note(f, "purge", { sur: f.qui });
      }
      if (mo.reveil) {
        c.repos = c.repos.map(() => 0);
        note(f, "reveil", { sur: f.qui });
      }
      if (mo.gel) {
        autre(f).gele += mo.gel;
        note(f, "gel", { n: mo.gel, sur: autre(f).qui });
      }
      if (mo.voleElan) f.vole = true;
    }
    // un coup qui porte lance le suivant
    for (const [c, f] of paires) {
      if (f.degats > 0) {
        f.enchaine = P.ENCHAINEMENT + (c.at.enchainePlus ?? 0);
        c.elan += f.enchaine;
      }
    }
    for (const [c, f] of paires) {
      if (!f.vole) continue;
      const lui = de(autre(f));
      if (lui.elan > 0) {
        c.elan += lui.elan;
        note(f, "voleElan", { n: lui.elan, sur: f.qui });
        lui.elan = 0;
      }
    }
    // le saignement, puis la fatigue
    for (const [c, f] of paires) {
      let n = 0;
      for (const s of c.saignes) {
        if (s.neuf) s.neuf = false;
        else {
          n += s.n;
          s.t--;
        }
      }
      c.saignes = c.saignes.filter((s) => s.t > 0);
      if (n) {
        c.vie -= n;
        f.saignement = n;
      }
    }
    if (a.vie > 0 && b.vie > 0) {
      const triples: readonly (readonly [Camp, Coup, Camp])[] = [[a, fa, b], [b, fb, a]];
      for (const [c, f, lui] of triples) {
        let n = fatigueDe(m, c);
        if (!n) continue;
        n += lui.at.fatigueAdverse ?? 0;
        n -= c.at.fatigueMoins ?? 0;
        if (c.drapeaux.premiereFatigue) {
          n -= c.drapeaux.premiereFatigue;
          c.drapeaux.premiereFatigue = 0;
        }
        if (f.mots.antiFatigue && !f.coupe) {
          n = 0;
          note(f, "antiFatigue", { sur: f.qui });
        }
        n = Math.max(0, n);
        c.vie -= n;
        fatigue[f.qui] = n;
      }
    }
  }
  for (const [c, f] of paires) {
    c.repos = c.repos.map((r) => Math.max(0, r - 1));
    let r = f.carte.repos;
    if (f.carte.e === "pieds" && c.at.piedsVifs) r = Math.max(Math.min(r, 1), r - 1);
    r += f.gele;
    c.repos[f.i] = r;
    if (f.mots.ardeur && !f.coupe) {
      const n = Math.min(f.mots.ardeur, c.plafond - c.energie);
      c.energie += n;
      note(f, "ardeur", { n: f.mots.ardeur, energie: n, sur: f.qui });
    }
    if (f.mots.plein && !f.coupe) {
      c.energie = c.plafond;
      note(f, "plein", { sur: f.qui });
    }
    c.energie = Math.min(c.plafond, c.energie + P.ENERGIE_PAR_MANCHE);
  }
  return { a, b, fa, fb, fatigue, fini: a.vie <= 0 || b.vie <= 0 };
}

/** 1 : `a` gagne ; -1 : `b` gagne ; 0 : égalité. Si les deux tombent à la même manche, gagne celui qui tombe de moins haut. */
export const verdict = (a: Pick<Camp, "vie">, b: Pick<Camp, "vie">): -1 | 0 | 1 => {
  if (a.vie <= 0 && b.vie <= 0) return Math.sign(a.vie - b.vie) as -1 | 0 | 1;
  return b.vie <= 0 ? 1 : a.vie <= 0 ? -1 : 0;
};

/** Les cinq cartes d'une main, une par emplacement, dans l'ordre d'une main. */
export type MainParEmplacement = Readonly<Record<EmplacementDuDuel, string>>;

/** Pourquoi une main n'est pas légale (les mêmes codes que le serveur), ou `null`. */
export type RefusDeMain = "main_invalide" | "main_trop_chere";

/**
 * Une main légale : une carte du catalogue par emplacement, à sa place, pour un prix qui tient dans la bourse. Le serveur
 * vérifie en plus que le membre possède chaque carte qui n'est pas de base (refus « carte_non_possedee »).
 */
export function refusDeLaMain(ids: MainParEmplacement): RefusDeMain | null {
  let total = 0;
  for (const e of EMPLACEMENTS_DU_DUEL) {
    const id = ids[e];
    const f = estUneCarte(id) ? CATALOGUE_DU_DUEL[id] : undefined;
    if (!f || f.e !== e) return "main_invalide";
    total += prix(f.r);
  }
  return total > P.BOURSE ? "main_trop_chere" : null;
}

/** Les cartes d'une main, dans l'ordre d'une main. */
export const cartesDeLaMain = (ids: MainParEmplacement): Carte[] => EMPLACEMENTS_DU_DUEL.map((e) => carte(ids[e]));
