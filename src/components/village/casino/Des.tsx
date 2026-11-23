import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { casino as appels } from "../../../lib/compte/api";
import { familier, gaulois, type Visage } from "../../../lib/jeu/casino-dessins";
import {
  AVANT_LE_JET,
  SECOUE,
  SONS_DES_DES as SD,
  desDuDebut,
  ecranY,
  etatDuDe,
  geometrie,
  peindreCornet,
  peindreDe,
  peindreDouble,
  peindreLueur,
  peindreMur,
  peindrePlaque,
  peindreTable,
  placeDuCornet,
  preparer,
  type DeLance,
  type EtatDuDe,
  type Geometrie,
} from "../../../lib/jeu/casino-des";
import { ENCRE, Toile, borne, hexDe, mel, pair, versLaToile } from "../../../lib/jeu/casino-toile";
import { nombreEcrit } from "../../../lib/jeu/ecriture";
import { foisEcrit } from "../../../lib/village/casino/commun";
import { PARIS_DES, PARIS_DES_PAR_ID, type PariDesFaces } from "../../../lib/village/casino/des";
import type { CoupDesDes, MisesDesDes } from "../../../lib/village/contrat-casino";
import { Etiquette } from "../../jeu/Pixels";
import { anime, montrer, sansMouvement, useJour, useLargeurDuJeu } from "./commun";
import { useCasino } from "./contexte";
import { PanneauDuCroupier, useCroupier } from "./Croupier";
import { JetonPose, Mots, Peinture, Pic } from "./Pieces";
import { Pupitre, usePupitre, type Mises } from "./Pupitre";

/**
 * Les dés (maquette « Le Palais d'or » de Claude Fable 5.2, validée par le pilote le 22 novembre 2026, portée telle quelle) :
 * deux dés d'ivoire à points de rubis, versés d'un cornet de cuir et d'or sur une piste de velours. Un tour : le pupitre
 * engage les paris du tapis (200 au plus sur la table), le serveur prend la mise et tire les deux faces (`jouer_des`), puis
 * le cornet est secoué et versé, les dés roulent vers ces faces, la plaque dit la somme, les cases gagnantes se dorent et le
 * casino rend le gain.
 */

const REPOS: [string, string] = ["Faites vos jeux", "Posez vos jetons sur le tapis"];
const maj = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
const nomDeCase = (p: PariDesFaces, mise: number, rendu = 0): string => `${maj(p.nom)}. Paie ${foisEcrit(p.dixiemes)} fois la mise.${mise ? ` ${mise} statères posés.` : ""}${rendu ? ` Rendu : ${rendu} statères.` : ""}`;
/** L'ordre des cases sur un tapis étroit (six de front) : moins et plus, puis les sommes en miroir, le double à la fin. */
const ordreDeLaCase = (p: PariDesFaces): number => (p.id === "moins" ? 0 : p.id === "plus" ? 1 : p.id === "double" ? 13 : p.somme! <= 7 ? p.somme! : 20 - p.somme!);
const tonDeLaCase = (p: PariDesFaces): string => (p.id === "moins" ? "cas-rouge" : p.id === "plus" ? "cas-bleue" : p.id === "double" ? "cas-verte" : "");
const facesValides = (f: unknown): f is [number, number] => Array.isArray(f) && f.length === 2 && f.every((v) => Number.isInteger(v) && v >= 1 && v <= 6);

/** Un de vos lancers, dans « Vos lancers ». */
interface Lancer {
  a: number;
  b: number;
  s: number;
  ton: "rouge" | "bleue" | "or";
  double: boolean;
}
const lancerDe = (a: number, b: number): Lancer => {
  const s = a + b;
  return { a, b, s, ton: s < 7 ? "rouge" : s > 7 ? "bleue" : "or", double: a === b };
};
/** Ce qui reste sur le tapis après un tour : les mises du tour, ce que chaque pari a rendu (du serveur), les faces sorties. */
interface ApresLeTour {
  mises: Mises;
  rendus: Readonly<Record<string, number>>;
  faces: [number, number];
  tousPartis: boolean;
}
/** Un dé sur la piste : sa course, son état à l'instant, s'il est sorti du cornet, ses sons joués, s'il est posé. */
interface DeVu {
  d: DeLance;
  e: EtatDuDe | null;
  vu: boolean;
  sons: number;
  pose: boolean;
}
interface Etat {
  G: Geometrie | null;
  mur: HTMLCanvasElement | null;
  table: HTMLCanvasElement | null;
  cornetT: Toile | null;
  cornet: HTMLCanvasElement | null;
  lueur: HTMLCanvasElement | null;
  gaulois: Map<Visage, HTMLCanvasElement>;
  familier: HTMLCanvasElement | null;
  brouillon: HTMLCanvasElement | null;
  lancer: { t: number; fini: boolean; verse: boolean; fin: () => void } | null;
  des: DeVu[];
  anciens: EtatDuDe[] | null;
  somme: { t: number; plaque: HTMLCanvasElement } | null;
  eclat: number;
  vis: Visage;
  enMarche: boolean;
  dernier: number;
  stop: () => void;
  perso: { y: number; vy: number };
  renard: { y: number; vy: number };
  monte: boolean;
  finir: (() => void) | null;
  minuteries: Set<ReturnType<typeof setTimeout>>;
}

const enToile = (t: Toile, c = document.createElement("canvas")): HTMLCanvasElement => {
  versLaToile(c, t);
  return c;
};

export default function LesDes() {
  const casino = useCasino();
  const crou = useCroupier("des");
  const pup = usePupitre({ surRefus: (titre, sous) => crou.dit(titre, sous) });
  const racine = useRef<HTMLDivElement>(null);
  const salle = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);
  const feutre = useRef<HTMLDivElement>(null);
  const W = useLargeurDuJeu(racine);
  const j = useJour();
  const wRef = useRef(W);
  wRef.current = W;

  const s = useRef<Etat>(null as unknown as Etat);
  if (!s.current)
    s.current = {
      G: null,
      mur: null,
      table: null,
      cornetT: null,
      cornet: null,
      lueur: null,
      gaulois: new Map(),
      familier: null,
      brouillon: null,
      lancer: null,
      des: desDuDebut().map((d) => ({ d, e: null, vu: true, sons: 0, pose: true })),
      anciens: null,
      somme: null,
      eclat: 0,
      vis: "",
      enMarche: false,
      dernier: 0,
      stop: () => undefined,
      perso: { y: 0, vy: 0 },
      renard: { y: 0, vy: 0 },
      monte: true,
      finir: null,
      minuteries: new Set(),
    };

  const [enCours, setEnCours] = useState(false);
  const [apres, setApres] = useState<ApresLeTour | null>(null);
  const [tours, setTours] = useState<Lancer[]>(() =>
    casino.etat.parties
      .map((p) => (p.resume.jeu === "des" && facesValides(p.resume.faces) ? lancerDe(p.resume.faces[0], p.resume.faces[1]) : null))
      .filter((l): l is Lancer => l !== null)
      .slice(0, 10),
  );

  const plusTard = (f: () => void, ms: number): void => {
    const e = s.current;
    const m = setTimeout(() => {
      e.minuteries.delete(m);
      if (e.monte) f();
    }, ms);
    e.minuteries.add(m);
  };

  /* ===== Le dessin d'une image ===== */
  const croupierPeint = (v: Visage): HTMLCanvasElement => {
    const e = s.current;
    let c = e.gaulois.get(v);
    if (!c) e.gaulois.set(v, (c = enToile(gaulois("des", v))));
    return c;
  };
  const dessineDe = (ctx: CanvasRenderingContext2D, G: Geometrie, e: EtatDuDe, alpha = 1): void => {
    const T = peindreDe(G.a, e.M);
    const c = (s.current.brouillon ??= document.createElement("canvas"));
    versLaToile(c, T);
    const ext = (T.w - 1) / 2;
    const sx = Math.round(e.x);
    const sy = Math.round(ecranY(G, e.y, G.a / 2 + e.h));
    const gy = Math.round(ecranY(G, e.y)) + 1;
    // l'ombre reste sur le velours : plus petite et plus pâle quand le dé est haut
    const haut = borne(e.h / (2 * G.a));
    const rxo = Math.round(G.a * (0.74 - haut * 0.3));
    const ryo = Math.max(2, Math.round(rxo * 0.56));
    ctx.globalAlpha = alpha * (0.5 - haut * 0.25);
    ctx.fillStyle = hexDe(ENCRE);
    for (let jj = -ryo; jj <= ryo; jj++) {
      const l = Math.round(rxo * Math.sqrt(1 - (jj * jj) / (ryo * ryo + 0.5)));
      ctx.fillRect(sx + 3 - l, gy + jj + Math.round(G.a * 0.12), 2 * l, 1);
    }
    ctx.globalAlpha = alpha;
    ctx.drawImage(c, sx - ext, sy - ext);
    ctx.globalAlpha = 1;
  };
  const dessineCornet = (ctx: CanvasRenderingContext2D, x: number, y: number, ang: number): void => {
    const e = s.current;
    if (!e.cornetT || !e.cornet) return;
    const T = ang ? e.cornetT.tourne(ang) : e.cornetT;
    const c = ang ? enToile(T, (e.brouillon ??= document.createElement("canvas"))) : e.cornet;
    ctx.drawImage(c, Math.round(x - T.w / 2), Math.round(y - T.h / 2));
  };
  const dessine = (): void => {
    const e = s.current;
    const G = e.G;
    const ctx = toile.current?.getContext("2d");
    if (!ctx || !G || !e.mur || !e.table) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, G.W, G.H);
    ctx.drawImage(e.mur, 0, 0);
    const cr = croupierPeint(e.vis);
    ctx.drawImage(cr, G.cx - (cr.width >> 1), G.yT - 42 + Math.round(e.perso.y));
    ctx.drawImage(e.table, 0, 0);
    if (e.familier) ctx.drawImage(e.familier, G.xFam - (e.familier.width >> 1), G.yT + 9 - e.familier.height + Math.round(e.renard.y));
    if (e.eclat > 0 && e.lueur) {
      const L = e.lueur;
      ctx.globalAlpha = e.eclat * 0.8;
      for (const d of e.des) if (d.e) ctx.drawImage(L, Math.round(d.e.x - L.width / 2), Math.round(ecranY(G, d.e.y) - L.height / 2));
      ctx.globalAlpha = 1;
    }
    // le cornet : debout près du croupier, secoué, puis versé sur la piste
    const cornet = placeDuCornet(G, e.lancer && !e.lancer.fini ? e.lancer.t : null);
    if (!cornet.devant) dessineCornet(ctx, cornet.x, cornet.y, cornet.ang);
    if (e.anciens && e.lancer && e.lancer.t < 0.28) {
      const u = e.lancer.t / 0.28;
      for (const a of e.anciens) dessineDe(ctx, G, { ...a, x: mel(a.x, G.repos.x, u * u), y: mel(a.y, -0.2 * G.a, u * u), h: G.a * 1.2 * u }, 1 - u);
    }
    for (const d of [...e.des].filter((d) => d.vu && d.e).sort((p, q) => p.e!.y - q.e!.y)) dessineDe(ctx, G, d.e!);
    if (cornet.devant) dessineCornet(ctx, cornet.x, cornet.y, cornet.ang);
    if (e.somme && e.des.length) {
      const u = borne(e.somme.t / 0.6);
      const k = 1 - Math.pow(1 - u, 3);
      const P = e.somme.plaque;
      ctx.globalAlpha = k;
      ctx.drawImage(P, G.cx - (P.width >> 1), G.ty0 - 9 + Math.round((1 - k) * 4));
      ctx.globalAlpha = 1;
    }
  };

  /* ===== Le pas : tout ce qui bouge, dans la boucle du commun ; rien ne tourne au repos ===== */
  const pas = (maintenant: number): boolean => {
    const e = s.current;
    const G = e.G;
    const dt = Math.min(0.05, e.dernier ? (maintenant - e.dernier) / 1000 : 0.016);
    e.dernier = maintenant;
    let actif = false;
    const lancer = e.lancer;
    if (lancer && !lancer.fini && G) {
      actif = true;
      lancer.t += dt;
      const calme = sansMouvement();
      if (calme) lancer.t = 99; // pause demandée en plein lancer : on pose le résultat
      const jet = lancer.t - SECOUE - AVANT_LE_JET;
      if (jet > 0) {
        if (!lancer.verse) {
          lancer.verse = true;
          if (!calme) SD.verse();
        }
        for (const d of e.des) {
          const tt = jet - d.d.retard;
          if (tt <= 0) continue;
          d.vu = true;
          d.e = etatDuDe(G, d.d, tt);
          // les bruits suivent ce que fait le dé : il touche le velours, cogne l'autre, bascule de plus en plus doucement
          if (calme) d.sons = d.d.ng + 1;
          while (d.sons <= d.e.n + 1 && d.sons <= d.d.ng) {
            const k = d.sons++;
            if (k === 0) {
              SD.velours(d.d.retard ? 330 : 290, 1.2);
              if (d.d.retard) SD.cogne();
              if (!e.renard.vy && !e.renard.y) e.renard.vy = -30;
            } else SD.velours(300 + k * 45, Math.max(0.2, 0.85 - k * 0.17));
          }
          if (tt >= d.d.T && !d.pose) {
            d.pose = true;
            if (!calme) SD.pose();
          }
        }
        if (e.des.every((d) => jet - d.d.retard >= d.d.T + 0.2)) {
          lancer.fini = true;
          lancer.fin();
        }
      }
    }
    if (e.somme && e.somme.t < 0.6) {
      e.somme.t += dt;
      actif = true;
    }
    if (e.eclat > 0 && e.eclat < 1) {
      e.eclat = Math.min(1, e.eclat + dt / 1.7);
      actif = true;
    }
    for (const o of [e.perso, e.renard])
      if (o.y < 0 || o.vy < 0) {
        o.vy += 300 * dt;
        o.y += o.vy * dt;
        if (o.y >= 0) {
          o.y = 0;
          o.vy = 0;
        }
        actif = true;
      }
    dessine();
    if (!actif || !e.monte) {
      e.enMarche = false;
      e.dernier = 0;
      return false;
    }
    return true;
  };
  const reveille = (): void => {
    const e = s.current;
    if (e.enMarche) return;
    e.enMarche = true;
    e.dernier = 0;
    e.stop = anime(pas);
  };

  /* ===== La mise en page : la piste prend sa taille (en points), tout est repeint ===== */
  const [ls, setLs] = useState(0);
  const [lt, setLt] = useState(0);
  useLayoutEffect(() => {
    const el = salle.current;
    const f = feutre.current;
    if (!el || !f) return;
    const obs = new ResizeObserver(() => {
      setLs(el.clientWidth);
      setLt(f.clientWidth);
    });
    obs.observe(el);
    obs.observe(f);
    setLs(el.clientWidth);
    setLt(f.clientWidth);
    return () => obs.disconnect();
  }, []);
  const lp = W >= 1240 ? borne(W * 0.4, 480, 640) : W >= 760 ? borne(W * 0.42, 320, 470) : Math.min(ls || W, 480);
  const Wp = Math.floor(lp / 2);
  const Hp = Math.round(Wp * (W >= 1240 ? 0.76 : W >= 760 ? 0.8 : 0.96));
  useLayoutEffect(() => {
    const e = s.current;
    const cv = toile.current;
    if (W < 120 || Wp < 60 || !cv) return;
    const G = geometrie(Wp, Hp);
    e.G = G;
    cv.width = Wp;
    cv.height = Hp;
    cv.style.width = Wp * 2 + "px";
    cv.style.height = Hp * 2 + "px";
    salle.current?.style.setProperty("--ds", Wp * 2 + "px");
    salle.current?.style.setProperty("--dh", Hp * 2 + "px");
    e.mur = enToile(peindreMur(G, j));
    e.table = enToile(peindreTable(G, j));
    e.cornetT = peindreCornet(G);
    e.cornet = enToile(e.cornetT);
    e.lueur = enToile(peindreLueur(Math.round(G.a * 2.3)));
    e.familier ??= enToile(familier("renardeau-roux"));
    for (const d of e.des)
      if (!e.lancer || e.lancer.fini) {
        d.vu = true;
        d.e = etatDuDe(G, d.d, 99);
      }
    dessine();
  }, [Wp, Hp, j, W >= 120]);

  // Le tapis : onze cases de front, ou six sur une table étroite.
  const etroit = W > 0 && W < 620;
  const n = etroit ? 6 : 11;
  const cw = pair(Math.min(96, (lt - 28 - (n - 1) * 2) / n));
  const grand = cw >= 70;
  const placeDesTours = Math.max(4, Math.min(10, Math.floor((W < 768 ? Wp * 2 - 8 : Wp * 2 - 144) / 37)));
  const double = useMemo(() => peindreDouble(), []);

  useEffect(() => {
    crou.dit(...REPOS);
  }, []);
  useEffect(
    () => () => {
      // On quitte les dés en plein lancer : le tour se finit sans mouvement (la bourse reçoit son solde, la partie s'inscrit).
      const e = s.current;
      e.monte = false;
      e.stop();
      for (const m of e.minuteries) clearTimeout(m);
      e.minuteries.clear();
      e.finir?.();
    },
    [],
  );

  /** Efface les marques du tour d'avant (cases dorées, gains écrits, plaque, lueur, visage). */
  const nettoyer = (): void => {
    const e = s.current;
    setApres(null);
    crou.efface();
    if (e.somme || e.eclat || e.vis) {
      e.somme = null;
      e.eclat = 0;
      e.vis = "";
      dessine();
    }
  };
  const surCase = (id: string): void => {
    if (enCours) return;
    nettoyer();
    if (pup.poser(id)) crou.dit(...REPOS);
  };

  /* ===== Un tour : le serveur tire les deux faces d'abord, les dés ne font que les montrer ===== */
  async function lancerLesDes(): Promise<void> {
    const e = s.current;
    if (enCours || e.lancer?.fini === false) return;
    nettoyer();
    const pris = await pup.engager((mises) => appels.des(mises as MisesDesDes));
    if (!pris.ok) return;
    const coup = pris.valeur;
    // Les dés ont été quittés pendant que le serveur répondait : le tour se finit sans un son ni un mouvement.
    if (!e.monte) {
      casino.finDeTour({ coup, muet: true });
      return;
    }
    casino.prendreLaMise(coup);
    // Des faces illisibles (le serveur n'en envoie jamais) : le tour est payé, la plaque le dit, aucun dé n'est inventé.
    if (!facesValides(coup.faces)) {
      crou.dit("Le tour est joué", coup.rendu ? `Rendu : ${nombreEcrit(coup.rendu)} statères` : "Rien cette fois");
      crou.resultat({ rendu: coup.rendu, mise: pris.total });
      casino.finDeTour({ coup, croupier: crou });
      pup.finir();
      return;
    }
    setEnCours(true);
    const faces: [number, number] = coup.faces;
    crou.dit("Rien ne va plus", "Les dés roulent");
    crou.visage("Lance");
    e.vis = "Lance";
    if (wRef.current < 1240) montrer(salle.current);
    let fini = false;
    const fin = (): void => {
      if (fini) return;
      fini = true;
      e.finir = null;
      reveler(coup, faces, pris.mises, pris.total);
    };
    e.finir = () => {
      if (fini) return;
      fini = true;
      e.finir = null;
      casino.finDeTour({ coup, muet: true });
    };
    const G = e.G;
    e.anciens = e.des.filter((d) => d.vu && d.e).map((d) => d.e!);
    e.des = G ? preparer(G, faces[0], faces[1]).map((d) => ({ d, e: null, vu: false, sons: 0, pose: false })) : e.des;
    if (sansMouvement() || !G) {
      for (const d of e.des) {
        d.vu = true;
        d.pose = true;
        if (G) d.e = etatDuDe(G, d.d, 99);
      }
      e.anciens = null;
      e.lancer = null;
      dessine();
      plusTard(fin, 350);
      return;
    }
    e.lancer = { t: 0, fini: false, verse: false, fin };
    e.perso.vy = -16;
    SD.secoue(SECOUE);
    reveille();
  }

  function reveler(coup: CoupDesDes, [a, b]: [number, number], mises: Mises, total: number): void {
    const e = s.current;
    const l = lancerDe(a, b);
    const G = e.G;
    if (G)
      for (const d of e.des) {
        d.vu = true;
        d.e = etatDuDe(G, d.d, 99);
      }
    e.lancer = null;
    e.anciens = null;
    const calme = sansMouvement();
    e.somme = { t: calme ? 1 : 0, plaque: enToile(peindrePlaque(String(l.s))) };
    crou.dit(l.double ? `Double ${a}` : `${a} et ${b} : ${l.s}`, (l.double ? `Soit ${l.s}. ` : "") + (coup.rendu ? `Rendu : ${nombreEcrit(coup.rendu)} statères` : "Rien cette fois"));
    crou.resultat({ signe: String(l.s), ton: l.ton, rendu: coup.rendu, mise: total });
    // Ce que chaque pari a rendu, du serveur ; le meilleur multiple gagnant fait la fête (en dixièmes : 360 pour 36 fois).
    const rendus = coup.par_pari ?? {};
    const meilleur = Math.max(0, ...Object.keys(rendus).filter((id) => (rendus[id] ?? 0) > 0).map((id) => PARIS_DES_PAR_ID[id]?.dixiemes ?? 0));
    setApres({ mises, rendus, faces: [a, b], tousPartis: false });
    // La fin du tour : la barre reçoit le solde, le son et le visage suivent ; la pluie pour une somme à 36 fois.
    const grand = meilleur >= 360;
    casino.finDeTour({ coup, grand, croupier: crou, scene: scene.current });
    e.vis = !coup.rendu ? "Clin" : grand ? "Bee" : "Joie";
    if (coup.rendu && !calme) {
      e.eclat = 0.01;
      e.perso.vy = grand ? -44 : meilleur >= 90 ? -34 : -22;
      if (!grand && meilleur >= 90) SD.beauGain();
    } else if (coup.rendu) e.eclat = 1;
    setTours((t) => [l, ...t].slice(0, 10));
    setEnCours(false);
    reveille();
    dessine();
    // Les jetons gagnants restent un instant sur le tapis, puis s'en vont (« mêmes mises » les repose).
    plusTard(() => setApres((x) => (x && x.faces[0] === a && x.faces[1] === b ? { ...x, tousPartis: true } : x)), 2600);
    pup.finir();
  }

  /* ===== Ce qu'on voit sur le tapis : les mises du pupitre, ou celles du tour qui vient de finir ===== */
  const vueDuTour = apres && pup.total === 0 ? apres : null;
  const surLeTapis = (id: string): { montant: number; part: boolean; nouveau: number } => {
    if (pup.total > 0) return { montant: pup.mises[id] ?? 0, part: false, nouveau: pup.dernier?.id === id ? pup.dernier.fois : 0 };
    if (apres) return { montant: apres.mises[id] ?? 0, part: apres.tousPartis || !(apres.rendus[id] ?? 0), nouveau: 0 };
    return { montant: 0, part: false, nouveau: 0 };
  };
  const tapisFerme = enCours;

  return (
    <div class="cas-jeu des-jeu" ref={racine}>
      <div class="des-salle" ref={salle}>
        <section class="des-cote" aria-label="La piste">
          <div
            class={`des-scene cas-cadre ${pup.total > 0 && !enCours && !pup.ferme ? "des-pret" : ""}`}
            ref={scene}
            onClick={() => {
              // un clic sur la piste lance aussi les dés (le bouton d'or reste le geste du clavier)
              if (!enCours && !pup.ferme && pup.total) void lancerLesDes();
            }}
          >
            <canvas ref={toile} role="img" aria-label="La piste de velours : le croupier, son cornet de cuir et deux dés d'ivoire" />
          </div>
          <div class="des-tours">
            <Mots t="Vos lancers" couleur="doux" />
            <span class="des-liste" role="list" aria-label="Vos derniers lancers">
              {tours.slice(0, placeDesTours).map((t, i) => (
                <span key={`${i}-${t.a}-${t.b}`} class={`cas-gemme jeu-n9 cas-${t.ton}`} role="listitem" aria-label={`${t.double ? "Double " + t.a : t.a + " et " + t.b}, soit ${t.s}`}>
                  <Mots t={String(t.s)} couleur="creme" muet />
                </span>
              ))}
              {Array.from({ length: Math.max(0, placeDesTours - tours.length) }, (_, i) => (
                <span key={`v${i}`} class="cas-gemme jeu-n9 des-vide" aria-hidden="true" />
              ))}
            </span>
          </div>
        </section>
        <PanneauDuCroupier croupier={crou} classe="des-croupier" />
        <div class="cas-tapis des-plateau" role="group" aria-label="Le tapis des paris" ref={feutre}>
          <div class={`des-tapis ${tapisFerme ? "des-ferme" : ""} ${etroit ? "des-etroit" : ""} ${grand ? "des-grand" : ""}`} style={`--cw:${cw}px`}>
            {PARIS_DES.map((p) => {
              const f = foisEcrit(p.dixiemes);
              const t = surLeTapis(p.id);
              const sortie = vueDuTour ? p.gagne(vueDuTour.faces[0], vueDuTour.faces[1]) : false;
              const marque = vueDuTour ? (sortie ? "cas-sorti" : "cas-eteint") : "";
              const rendu = vueDuTour?.rendus[p.id] ?? 0;
              // Sur une case dorée, l'or des multiples passerait sous le contraste AA : il s'écrit en crème.
              const coulFois = sortie ? "creme" : "orvif";
              const petit = (p.somme ? cw : cw * 3) < 56;
              return (
                <button
                  key={p.id}
                  class={`des-case jeu-n9 cas-halo ${tonDeLaCase(p)} ${p.somme ? "" : "des-large des-" + p.id} ${marque}`}
                  type="button"
                  style={`--om:${ordreDeLaCase(p)}`}
                  aria-label={nomDeCase(p, t.montant, rendu)}
                  title={`${maj(p.nom)} : ${f} fois la mise`}
                  onClick={() => surCase(p.id)}
                >
                  {p.somme ? (
                    <>
                      <span class="des-n">
                        <Mots t={String(p.somme)} couleur="creme" muet />
                      </span>
                      <Mots t={f} couleur={coulFois} muet />
                    </>
                  ) : (
                    <>
                      {p.id === "double" && <Peinture toile={double} classe="des-ic" />}
                      <span class="des-mots">
                        <span class="des-mot">
                          <Mots t={p.id === "double" ? "Double" : p.nom} couleur="creme" muet />
                        </span>
                        <span class="des-long">
                          <Mots t={f + " fois"} couleur={coulFois} muet />
                        </span>
                        <span class="des-court">
                          <Mots t={f} couleur={coulFois} muet />
                        </span>
                      </span>
                    </>
                  )}
                  {t.montant > 0 && <JetonPose montant={t.montant} nouveau={t.nouveau} part={t.part} coin="hd" petit={petit} />}
                  {rendu > 0 && (
                    <span class="des-gain">
                      <Etiquette t={"+" + nombreEcrit(rendu)} ton="or" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div class="des-note">
            <Mots t="En or : fois la mise" couleur="orvif" />
          </div>
        </div>
        <Pupitre pupitre={pup} action="Lancer" nomAction="Lancer les dés" surAction={() => void lancerLesDes()} classe="des-pupitre" />
      </div>
      <details class="cas-pli cas-panneau jeu-n9 des-regles">
        <summary>
          <Pic nom="livre" />
          <Mots t="Les règles" />
          <span class="cas-chev">
            <Pic nom="chevron" />
          </span>
        </summary>
        <ul>
          <li>Posez un ou plusieurs jetons sur le tapis, 200 statères au plus sur la table, puis lancez les deux dés.</li>
          <li>Moins de 7 ou plus de 7 : 2,4 fois la mise, mise comprise. 15 chances sur 36 chacun.</li>
          <li>Un double : 6 fois la mise. 6 chances sur 36.</li>
          <li>Une somme précise : 2 ou 12, 36 fois la mise ; 3 ou 11, 18 fois ; 4 ou 10, 12 fois ; 5 ou 9, 9 fois ; 6 ou 8, 7,2 fois ; 7 tout juste, 6 fois.</li>
          <li>Jetons de 10, 20, 50, 100 et 200. Les gains sont des statères entiers.</li>
          <li>Le serveur tire les deux faces avant que le cornet bouge. Chaque pari rend en moyenne exactement la mise.</li>
        </ul>
      </details>
    </div>
  );
}

