import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { ServerError, casino as appels } from "../../../lib/compte/api";
import { gaulois, type Visage } from "../../../lib/jeu/casino-dessins";
import {
  CHANCES_DE_LA_MACHINE,
  ECLAT_DE_LA_CASE,
  NOMS_DES_SYMBOLES,
  SOCLE,
  SONS_DE_LA_MACHINE as SM,
  TITRES_DE_LA_MACHINE,
  TONS_DE_LA_MACHINE,
  bandeDuRouleau,
  casesAMontrer,
  casesDEssai,
  crantDuLevier,
  departDuRouleau,
  dureeDuRouleau,
  emplacementsDuBac,
  entierDuDecor,
  foisDuResultat,
  metriques,
  mini,
  motDeLaPlaque,
  peindreLevier,
  peindreLevre,
  peindreMachine,
  peindreSocle,
  piecesDesRouleaux,
  piecesQuiTombent,
  posDuRouleau,
  stateresDuBac,
  symbole,
  type Emplacement,
  type Metriques,
} from "../../../lib/jeu/casino-machine";
import { SONS, type Roulement } from "../../../lib/jeu/casino-sons";
import { JETONS, OR, Toile, borne, ton, versLaToile, type ValeurDeJeton } from "../../../lib/jeu/casino-toile";
import { nombreEcrit } from "../../../lib/jeu/ecriture";
import type { CoupDeLaMachine, ResultatDeLaMachine } from "../../../lib/village/contrat-casino";
import { motsDuRefus, refusDuJeton } from "../../../lib/village/ecran-casino";
import { anime, montrer, sansMouvement, useLargeurDuJeu } from "./commun";
import { useCasino, type Casino } from "./contexte";
import { PanneauDuCroupier, useCroupier, type CroupierDuJeu } from "./Croupier";
import { Mots, Peinture, Pic, pluie } from "./Pieces";
import { Pupitre, type Engagement, type Mises, type PupitreDuJeu } from "./Pupitre";

/**
 * La machine du forgeron (maquette « Le Palais d'or » de Claude Fable 5.2, validée par le pilote le 22 novembre 2026, portée
 * telle quelle) : trois rouleaux, seule la ligne du milieu paie. Le levier s'attrape et se tire (ou un clic, Entrée, Espace) ;
 * en bas, la mise part au serveur, qui tire le résultat et les neuf cases (`jouer_machine`) ; puis seulement les rouleaux
 * tournent et s'arrêtent de gauche à droite sur ces cases, avec un rebond. Les statères tombent dans le bac, la fête pour 20 et
 * 100 fois. « Voir chaque gain » : des coups d'essai, tirés dans le navigateur, qui ne coûtent ni ne rapportent rien.
 *
 * La mise est le jeton choisi au pupitre : le pupitre du commun n'a ici ni « reprendre » ni « mêmes mises » (comme dans la
 * maquette), d'où son petit double `usePupitreDeLaMachine`, qui prévient et engage comme lui.
 */

const REPOS: [string, string] = ["Faites vos jeux", "Tirez le levier"];
const ESSAIS: readonly (readonly [ResultatDeLaMachine, string])[] = [
  [0, "100 fois"],
  [1, "20 fois"],
  [2, "5 fois"],
  [3, "2 fois"],
  [4, "Rendue"],
  [-1, "Rien"],
];
const RESULTATS: readonly ResultatDeLaMachine[] = [-1, 0, 1, 2, 3, 4];

interface Rouleau {
  bande: number[];
  n: number;
  pos: number;
  t0: number;
  duree: number;
  vit: number;
  arrete: boolean;
  sonne: boolean;
}
interface Piece {
  i: number;
  x: number;
  y: number;
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  t: number;
  pose: boolean;
  sonne: boolean;
  vu: number;
}
interface Tour {
  id: number;
  res: ResultatDeLaMachine;
  cases: number[][];
  mise: number;
  gain: number;
  /** Le coup du serveur ; `null` pour un coup d'essai. */
  coup: CoupDeLaMachine | null;
}
interface Sprites {
  fond: HTMLCanvasElement;
  levre: HTMLCanvasElement;
  case: HTMLCanvasElement;
  ombre: HTMLCanvasElement;
  cadre: HTMLCanvasElement;
  halo: HTMLCanvasElement;
  globe: HTMLCanvasElement;
  sym: HTMLCanvasElement[];
  pieces: HTMLCanvasElement[];
  leviers: Map<number, HTMLCanvasElement>;
  textes: Map<string, HTMLCanvasElement>;
}
type Mode = "repos" | "tenu" | "descend" | "bas" | "remonte";
interface Etat {
  g: Metriques | null;
  sp: Sprites | null;
  forgerons: Map<string, HTMLCanvasElement>;
  W: number;
  H: number;
  mx: number;
  avecForgeron: boolean;
  rouleaux: Rouleau[];
  lev: { t: number; v: number; mode: Mode; cran: number; y0: number; bouge: boolean; attente: number; cede: boolean; ignoreClic: number };
  enCours: boolean;
  etatJeu: "pret" | "tourne" | "paie";
  tour: Tour | null;
  numero: number;
  essai: ResultatDeLaMachine | null;
  vis: Visage;
  roule: Roulement | null;
  lueur: number;
  lueurCible: number;
  lueurFin: number;
  eclat: number;
  gagnantes: number[];
  saut: number;
  horloge: number;
  dernierTic: number;
  tas: Piece[];
  emplacements: Emplacement[];
  aTomber: number;
  prochaine: number;
  intervalle: number;
  total: number;
  enRoute: boolean;
  avant: number;
  stop: () => void;
  monte: boolean;
  /** Finir sans mouvement le tour en cours, si la machine est quittée avant la fin. */
  finir: (() => void) | null;
  minuteries: Set<ReturnType<typeof setTimeout>>;
}

const enToile = (t: Toile): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  versLaToile(c, t);
  return c;
};
const hasard = (): number => entierDuDecor(5);

function etatDeDepart(): Etat {
  // La première image : une ligne ordinaire, tirée comme un coup perdu, pour ne rien promettre.
  const c = casesDEssai(-1);
  return {
    g: null,
    sp: null,
    forgerons: new Map(),
    W: 0,
    H: 0,
    mx: 2,
    avecForgeron: false,
    rouleaux: [0, 1, 2].map((i) => ({ bande: [hasard(), ...c[i]!, hasard()], n: 0, pos: 0, t0: 0, duree: 0, vit: 0, arrete: true, sonne: true })),
    lev: { t: 0, v: 0, mode: "repos", cran: 0, y0: 0, bouge: false, attente: 0, cede: false, ignoreClic: 0 },
    enCours: false,
    etatJeu: "pret",
    tour: null,
    numero: 0,
    essai: null,
    vis: "",
    roule: null,
    lueur: 0.18,
    lueurCible: 0.18,
    lueurFin: 0,
    eclat: 0,
    gagnantes: [],
    saut: 0,
    horloge: 0,
    dernierTic: 0,
    tas: [],
    emplacements: [],
    aTomber: 0,
    prochaine: 0,
    intervalle: 0.12,
    total: 0,
    enRoute: false,
    avant: 0,
    stop: () => undefined,
    monte: true,
    finir: null,
    minuteries: new Set(),
  };
}

/**
 * Le pupitre de la machine : les jetons du pupitre du commun, la mise est le jeton choisi (ou le plus gros que la bourse
 * permet). Il prévient avant d'envoyer, comme le commun (table, reste du jour, bourse), et engage la mise au serveur.
 */
function usePupitreDeLaMachine(casino: Casino, crou: CroupierDuJeu, occupe: () => { enCours: boolean; tourne: boolean }): PupitreDuJeu & { regle(): void } {
  const [jeton, setJeton] = useState<ValeurDeJeton>(20);
  const [mise, setMise] = useState(20);
  const [ferme, setFerme] = useState(false);
  const r = useRef({ jeton: 20 as ValeurDeJeton, mise: 20, ferme: false, casino, crou, occupe });
  r.current.casino = casino;
  r.current.crou = crou;
  r.current.occupe = occupe;
  const actions = useMemo(() => {
    const trop = (v: number): boolean => {
      const l = r.current.casino.limites;
      return !l.god && l.bourse !== null && v > l.bourse;
    };
    const verrou = (v: boolean): void => {
      r.current.ferme = v;
      setFerme(v);
    };
    /** La mise est le jeton choisi, ou le plus gros que la bourse permet ; rien de plus haut ne se pose. */
    const regle = (): void => {
      if (r.current.occupe().enCours) return;
      let v: number = r.current.jeton;
      if (trop(v)) {
        const b = r.current.casino.limites.bourse ?? 0;
        v = [...JETONS].reverse().find((j) => j <= b) ?? 0;
        if (v) {
          r.current.jeton = v as ValeurDeJeton;
          setJeton(v as ValeurDeJeton);
        }
      }
      r.current.mise = v;
      setMise(v);
      verrou(false);
    };
    const refus = (code: string): void => {
      SONS.refus();
      const l = r.current.casino.limites;
      const [titre, sous] = code === "rien" ? ["Faites vos jeux", (l.bourse ?? 0) < 10 ? "La bourse ne suffit pas" : "Choisissez un jeton"] : motsDuRefus(code, l.reste ?? undefined);
      r.current.crou.dit(titre, sous);
    };
    return {
      regle,
      poser: (): boolean => false,
      choisir(v: ValeurDeJeton): void {
        r.current.jeton = v;
        setJeton(v);
        SONS.jeton(JETONS.indexOf(v));
        const o = r.current.occupe();
        // Pendant un tour, le croupier garde son annonce : le jeton vaut pour le tirage suivant.
        if (!o.enCours && !o.tourne) {
          if (trop(v)) r.current.crou.refus("Faites vos jeux", "La bourse ne suffit pas");
          else r.current.crou.dit(...REPOS);
        }
        regle();
      },
      annuler: (): void => undefined,
      vider: (): void => undefined,
      memes: (): void => undefined,
      verrou,
      async engager<T>(envoyer: (mises: Mises, total: number) => Promise<T>): Promise<Engagement<T>> {
        const m = r.current.mise;
        if (r.current.ferme || !m) {
          refus("rien");
          return { ok: false, code: "rien" };
        }
        const non = refusDuJeton(0, m, r.current.casino.limites);
        if (non) {
          refus(non);
          return { ok: false, code: non };
        }
        verrou(true);
        try {
          const valeur = await envoyer({ mise: m }, m);
          return { ok: true, valeur, mises: { mise: m }, total: m };
        } catch (err) {
          verrou(false);
          const code = err instanceof ServerError ? err.code : "network";
          refus(code);
          return { ok: false, code };
        }
      },
      finir: (): void => verrou(false),
    };
  }, []);
  return { mises: mise ? { mise } : {}, total: mise, jeton, dernieres: null, ferme, dernier: null, ...actions };
}

export default function LaMachine() {
  const casino = useCasino();
  const crou = useCroupier("forgeron");
  const racine = useRef<HTMLDivElement>(null);
  const salle = useRef<HTMLDivElement>(null);
  const boite = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLCanvasElement>(null);
  const levierEl = useRef<HTMLButtonElement>(null);
  const W = useLargeurDuJeu(racine);
  const k = W >= 760 ? 1.5 : 1;
  const avecForgeron = W >= 1240;
  const pret = W >= 120;
  const wRef = useRef(W);
  wRef.current = W;

  const s = useRef<Etat>(null as unknown as Etat);
  if (!s.current) s.current = etatDeDepart();
  const casinoRef = useRef(casino);
  casinoRef.current = casino;
  const crouRef = useRef(crou);
  crouRef.current = crou;

  const pup = usePupitreDeLaMachine(casino, crou, () => ({ enCours: s.current.enCours, tourne: s.current.etatJeu === "tourne" }));
  const pupRef = useRef(pup);
  pupRef.current = pup;

  const [enCours, setEnCours] = useState(false);
  const [prise, setPrise] = useState(false);
  const [sorti, setSorti] = useState<ResultatDeLaMachine | null>(null);
  const [lumiere, setLumiere] = useState<"" | "gagne" | "fete">("");
  const [fanion, setFanion] = useState<{ texte: string; vu: boolean }>({ texte: "", vu: false });
  // Vos tirages : les derniers résultats de ce compte, lus au serveur, puis ceux de cette visite.
  const [tours, setTours] = useState<ResultatDeLaMachine[]>(() =>
    casino.etat.parties
      .map((p) => (p.resume.jeu === "machine" ? p.resume.resultat : null))
      .filter((r): r is ResultatDeLaMachine => r !== null && RESULTATS.includes(r))
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

  /* ---------- Le dessin d'une image ---------- */
  const forgeron = (v: Visage): HTMLCanvasElement => {
    const e = s.current;
    let c = e.forgerons.get(v);
    if (!c) e.forgerons.set(v, (c = enToile(gaulois("forgeron", v))));
    return c;
  };
  const texte = (t: string, c: readonly [number, number, number]): HTMLCanvasElement => {
    const sp = s.current.sp!;
    const cle = t + c.join(",");
    let cv = sp.textes.get(cle);
    if (!cv) sp.textes.set(cle, (cv = enToile(motDeLaPlaque(t, c))));
    return cv;
  };
  const levier = (t: number): HTMLCanvasElement => {
    const e = s.current;
    const q = crantDuLevier(t);
    let c = e.sp!.leviers.get(q);
    if (!c) e.sp!.leviers.set(q, (c = enToile(peindreLevier(e.g!, q))));
    return c;
  };
  const dessine = (): void => {
    const e = s.current;
    const g = e.g;
    const sp = e.sp;
    const c = scene.current?.getContext("2d");
    if (!g || !sp || !c) return;
    const { CW, CH, SEP, S, BW, U } = g;
    const { mx, W: Wc, H } = e;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, Wc, H);
    c.drawImage(sp.fond, 0, 0);
    const calme = sansMouvement();
    e.rouleaux.forEach((r, i) => {
      const x0 = mx + g.rx + i * (CW + SEP);
      const y0 = g.ry;
      const sx = x0 + ((CW - S - 2) >> 1);
      const sy = (CH - S - 2) >> 1;
      c.save();
      c.beginPath();
      c.rect(x0, y0, CW, 3 * CH);
      c.clip();
      const pied = Math.floor(r.pos);
      const flou = Math.abs(r.vit) > 9;
      for (let j = pied - 1; j <= pied + 3; j++) {
        const sy0 = r.bande[j + 1];
        if (sy0 === undefined) continue;
        const sym = sp.sym[sy0]!;
        const y = y0 + Math.round((j - r.pos) * CH);
        const gagne = r.arrete && e.eclat > 0 && j === 1 && e.gagnantes.includes(i);
        c.drawImage(sp.case, x0, y);
        if (gagne) {
          c.globalAlpha = e.eclat * 0.6;
          c.fillStyle = ECLAT_DE_LA_CASE;
          c.fillRect(x0, y + 1, CW, CH - 2);
          c.globalAlpha = 1;
        }
        const dy = gagne && !calme && e.lueurFin ? Math.round(Math.sin(e.horloge * 2.4 - i * 0.8) * 1.3 * e.eclat) : 0;
        if (flou) {
          const d = Math.round(CH * 0.2);
          c.globalAlpha = 0.45;
          c.drawImage(sym, sx, y + sy - d);
          c.drawImage(sym, sx, y + sy + d);
          c.globalAlpha = 0.8;
        }
        c.drawImage(sym, sx, y + sy + dy);
        c.globalAlpha = 1;
        if (gagne) {
          c.globalAlpha = e.eclat;
          c.drawImage(sp.cadre, x0, y);
          c.globalAlpha = 1;
        }
      }
      c.drawImage(sp.ombre, x0, y0);
      c.restore();
    });
    // la plaque : la mise, ou le gain
    const tour = e.tour;
    const gagne = e.etatJeu !== "tourne" && tour !== null && tour.gain > 0 && e.gagnantes.length > 0;
    const mise = e.etatJeu === "tourne" && tour ? tour.mise : pupRef.current.total;
    const t = texte(gagne ? (tour.res === 4 ? "RENDU " : "GAIN ") + nombreEcrit(tour.gain) : mise ? "MISE " + mise : "MISE", gagne ? ton(OR, 7) : ton(OR, 5));
    c.drawImage(t, mx + Math.round(BW / 2 - t.width / 2), g.plq.y + ((g.plq.h - 7) >> 1));
    for (const p of e.tas) c.drawImage(sp.pieces[p.pose ? 0 : p.vu]!, mx + Math.round(p.x), Math.round(p.y));
    c.drawImage(sp.levre, mx + g.bac.x - 1, g.bac.y + g.bac.h - U(6) - 1);
    c.drawImage(levier(e.lev.t), mx + g.lev.x, g.lev.y);
    // les globes : leur lueur monte et descend lentement
    const n = Math.min(1.25, e.lueur);
    const rh = sp.halo.width / 2;
    for (const cx of [U(12), BW - 1 - U(12)]) {
      const x = mx + cx;
      const y = g.yB - U(5);
      c.globalAlpha = borne(n * 0.85);
      c.drawImage(sp.globe, x - (sp.globe.width >> 1), y - (sp.globe.height >> 1));
      c.globalAlpha = borne(0.15 + n * 0.7);
      c.drawImage(sp.halo, x - rh, y - rh);
    }
    c.globalAlpha = 1;
    if (e.avecForgeron) {
      let dy = 0;
      if (e.saut && e.horloge >= e.saut) {
        const u = (e.horloge - e.saut) / 0.5;
        if (u < 1) dy = -Math.round(Math.sin(u * Math.PI) * 8);
        else if (tour && tour.res >= 0 && tour.res <= 1 && u > 1.6 && u < 2.6) dy = -Math.round(Math.sin((u - 1.6) * Math.PI) * 6);
      }
      const f = forgeron(e.vis);
      c.drawImage(f, 1 + ((46 - f.width) >> 1), H - SOCLE - 2 - f.height + 2 + dy);
    }
  };

  /* ---------- La boucle : celle du commun, qui s'arrête dès que plus rien ne bouge ---------- */
  const reveiller = (): void => {
    const e = s.current;
    if (e.enRoute) return void dessine();
    e.enRoute = true;
    e.avant = 0;
    e.stop = anime((t) => {
      const dt = Math.min(0.05, e.avant ? (t - e.avant) / 1000 : 0.016);
      e.avant = t;
      const bouge = pas(dt);
      dessine();
      if (!bouge || !e.monte) {
        e.enRoute = false;
        e.avant = 0;
        return false;
      }
    });
  };

  /* ---------- Le levier : on l'attrape, il résiste, il cède, il remonte en ressort ---------- */
  const pasDuLevier = (dt: number): boolean => {
    const lev = s.current.lev;
    if (lev.mode === "tenu") return true;
    if (lev.mode === "descend") {
      lev.t = Math.min(1, lev.t + (dt / 0.11) * (1.05 - lev.t * 0.2));
      const cran = Math.floor(lev.t * 7);
      if (cran > lev.cran) {
        lev.cran = cran;
        SM.cliquet(cran);
      }
      if (lev.t >= 1) {
        lev.t = 1;
        lev.mode = "bas";
        lev.attente = 0.14;
        SM.declic();
        void declenche();
      }
      return true;
    }
    if (lev.mode === "bas") {
      lev.attente -= dt;
      if (lev.attente <= 0) {
        lev.mode = "remonte";
        lev.v = 0;
      }
      return true;
    }
    if (lev.mode === "remonte") {
      // un ressort, un peu trop fort : il dépasse, cogne, se pose
      lev.v += (-210 * lev.t - 13 * lev.v) * dt;
      lev.t += lev.v * dt;
      if (lev.t < -0.045) {
        lev.t = -0.045;
        if (lev.v < -0.6) SM.retour();
        lev.v = Math.abs(lev.v) * 0.28;
      }
      if (Math.abs(lev.t) < 0.004 && Math.abs(lev.v) < 0.05) {
        lev.t = 0;
        lev.v = 0;
        lev.mode = "repos";
        lev.cran = 0;
        return false;
      }
      return true;
    }
    return false;
  };
  /** Au clic, au clavier, au bouton d'or : la machine tire le levier elle-même. */
  const tirerLeLevier = (): void => {
    const e = s.current;
    const lev = e.lev;
    if (e.enCours || (lev.mode !== "repos" && lev.mode !== "remonte")) return;
    if (sansMouvement()) {
      SM.declic();
      void declenche();
      return;
    }
    lev.mode = "descend";
    lev.cran = Math.floor(Math.max(0, lev.t) * 7);
    reveiller();
  };
  const tirerRef = useRef(tirerLeLevier);
  tirerRef.current = tirerLeLevier;

  /* ---------- La partie ---------- */
  /** Efface les marques du coup d'avant. */
  const nettoyer = (): void => {
    const e = s.current;
    setSorti(null);
    crouRef.current.efface();
    e.vis = "";
    setLumiere("");
    setFanion((f) => ({ ...f, vu: false }));
    for (const c of boite.current?.querySelectorAll(".cas-pluie") ?? []) c.remove();
    e.gagnantes = [];
    e.eclat = 0;
    e.lueurFin = 0;
    e.tas.length = 0;
    e.aTomber = 0;
    e.saut = 0;
    e.etatJeu = "pret";
  };
  const poserLesRouleaux = (): void => {
    const e = s.current;
    const tour = e.tour;
    if (!tour) return;
    e.rouleaux.forEach((r, i) => {
      r.bande = [hasard(), ...tour.cases[i]!, hasard()];
      r.n = 0;
      r.pos = 0;
      r.vit = 0;
      r.arrete = true;
      r.sonne = true;
    });
    e.roule?.fin();
    e.roule = null;
  };

  /** Le levier est en bas : la mise est prise, LE TIRAGE est fait par le serveur, puis seulement les rouleaux partent. */
  async function declenche(): Promise<void> {
    const e = s.current;
    if (e.enCours) return;
    e.enCours = true;
    setEnCours(true);
    const essaiRes = e.essai;
    e.essai = null;
    const cr = crouRef.current;
    let tour: Tour;
    if (essaiRes === null) {
      const pris = await pupRef.current.engager((_m, total) => appels.machine(total));
      if (!pris.ok) {
        e.enCours = false;
        setEnCours(false);
        pupRef.current.regle();
        return;
      }
      const coup = pris.valeur;
      // La machine a été quittée pendant que le serveur répondait : le tour se finit sans un son ni un mouvement.
      if (!e.monte) {
        casinoRef.current.finDeTour({ coup, muet: true });
        return;
      }
      casinoRef.current.prendreLaMise(coup);
      const res: ResultatDeLaMachine = RESULTATS.includes(coup.resultat) ? coup.resultat : -1;
      tour = { id: ++e.numero, res, cases: casesAMontrer(res, coup.cases), mise: coup.mise, gain: coup.rendu, coup };
      e.finir = () => {
        e.finir = null;
        casinoRef.current.finDeTour({ coup, muet: true });
      };
    } else {
      // Un coup d'essai : rien ne part au serveur, rien n'est compté.
      pupRef.current.verrou(true);
      const mise = pupRef.current.total || pupRef.current.jeton;
      tour = { id: ++e.numero, res: essaiRes, cases: casesDEssai(essaiRes), mise, gain: mise * foisDuResultat(essaiRes), coup: null };
    }
    nettoyer();
    e.tour = tour;
    e.etatJeu = "tourne";
    e.lueurCible = 0.3;
    cr.dit("Rien ne va plus", tour.coup ? "Les rouleaux tournent" : "Coup d'essai");
    cr.visage("Lance");
    e.vis = "Lance";
    if (wRef.current < 1240) montrer(salle.current);
    if (sansMouvement()) {
      poserLesRouleaux();
      SM.clonc(2);
      plusTard(conclure, 350);
      return void reveiller();
    }
    e.rouleaux.forEach((r, i) => {
      const vus = r.bande.slice(1, 4);
      const b = bandeDuRouleau(i, tour.cases[i]!, vus, hasard);
      r.bande = b.bande;
      r.n = b.n;
      r.pos = b.n;
      r.t0 = e.horloge + departDuRouleau(i);
      r.duree = dureeDuRouleau(i);
      r.arrete = false;
      r.sonne = false;
      r.vit = 0;
    });
    SONS.lance();
    e.roule = SONS.roulement(330, 1.1, 0.05);
    reveiller();
  }

  function conclure(): void {
    const e = s.current;
    if (e.etatJeu !== "tourne" || !e.tour) return;
    const tour = e.tour;
    const { res, mise, gain, coup, id } = tour;
    const calme = sansMouvement();
    const cr = crouRef.current;
    e.etatJeu = "paie";
    e.finir = null;
    // La fin du tour : la barre reçoit le solde du serveur ; la machine a ses sons à elle.
    if (coup) casinoRef.current.finDeTour({ coup, muet: true });
    SM.fin(res);
    const ESSAI = "Coup d'essai";
    const NOTE = coup ? undefined : "Rien n'est compté";
    if (res < 0) {
      cr.dit("Pas de trio", coup ? "" : ESSAI);
      cr.resultat({ signe: "", rendu: gain, mise, note: NOTE });
      e.vis = "Clin";
      e.lueurCible = 0.18;
    } else {
      cr.dit(TITRES_DE_LA_MACHINE[res]!, coup ? `${res === 4 ? "Mise rendue" : "Rendu"} : ${nombreEcrit(gain)} statères` : ESSAI);
      cr.resultat({ signe: res === 4 ? "" : String(foisDuResultat(res)), ton: TONS_DE_LA_MACHINE[res], rendu: gain, mise, note: NOTE });
      e.vis = res <= 1 ? "Bee" : "Joie";
      e.gagnantes = res === 4 ? [0] : [0, 1, 2];
      setSorti(res);
      e.lueurCible = [1.2, 1, 0.8, 0.62, 0.45][res]!;
      const duree = [10, 7, 3.6, 2.8, 2.2][res]!;
      e.lueurFin = e.horloge + duree;
      setLumiere("gagne");
      plusTard(() => {
        if (s.current.numero === id) setLumiere("");
      }, duree * 1000);
      e.total = stateresDuBac(gain, e.emplacements.length); // jamais plus de pièces que de dizaines gagnées
      if (calme) {
        e.eclat = 1;
        e.lueur = e.lueurCible;
        for (let i = 0; i < e.total; i++) poserPiece(i);
      } else {
        const retard = res === 0 ? 0.9 : res === 1 ? 0.65 : 0.25;
        e.aTomber = e.total;
        e.intervalle = borne(2.6 / e.total, 0.07, 0.2);
        e.prochaine = e.horloge + retard;
        e.saut = e.horloge + 0.1;
        if (res <= 1) {
          // la fête des 20 et des 100 fois
          setLumiere("fete");
          setFanion({ texte: `${foisDuResultat(res)} fois la mise`, vu: true });
          plusTard(() => {
            if (s.current.numero === id) setFanion((f) => ({ ...f, vu: false }));
          }, (duree - 1.5) * 1000);
          const n = e.g && e.g.k > 1 ? 16 : 10;
          pluie(boite.current, n);
          if (res === 0)
            plusTard(() => {
              if (s.current.numero === id) pluie(boite.current, n);
            }, 2700);
        }
      }
    }
    cr.visage(e.vis);
    if (coup) {
      setTours((t) => [res, ...t].slice(0, 10));
      pupRef.current.finir();
    }
    e.enCours = false;
    setEnCours(false);
    pupRef.current.regle();
    reveiller();
  }

  const poserPiece = (i: number): void => {
    const e = s.current;
    const p = e.emplacements[i % e.emplacements.length]!;
    e.tas.push({ i, x: p.x, y: p.y, x0: p.x, y0: p.y, cx: p.x, cy: p.y, t: 1, pose: true, sonne: true, vu: 0 });
  };
  const lacherPiece = (i: number): void => {
    const e = s.current;
    const g = e.g!;
    const p = e.emplacements[i % e.emplacements.length]!;
    const x0 = g.BW / 2 - 7 + (Math.random() * 2 - 1) * g.U(14);
    const y0 = g.bac.y - 2;
    e.tas.push({ i, x: x0, y: y0, x0, y0, cx: p.x, cy: p.y, t: 0, pose: false, sonne: false, vu: 0 });
  };

  /** Une image : le levier, les rouleaux, les pièces, les lueurs. Rend vrai tant que quelque chose bouge. */
  function pas(dt: number): boolean {
    const e = s.current;
    let bouge = pasDuLevier(dt);
    e.horloge += dt;
    const der = e.rouleaux[2]!;
    if (e.etatJeu === "tourne" && e.tour && !der.arrete) {
      bouge = true;
      if (sansMouvement()) {
        // la pause arrive en plein tour : on pose le résultat
        poserLesRouleaux();
        SM.clonc(2);
        conclure();
        return true;
      }
      let finis = 0;
      e.rouleaux.forEach((r, i) => {
        if (r.arrete) {
          finis++;
          return;
        }
        const avantPos = r.pos;
        const p = posDuRouleau(r.n, r.duree, e.horloge - r.t0);
        r.pos = p.pos;
        if (p.cogne && !r.sonne) {
          r.sonne = true;
          SM.clonc(i);
          if (e.roule) {
            if (i === 2) {
              e.roule.fin();
              e.roule = null;
            } else e.roule.regle([0.035, 0.02][i]!, 300 - i * 40);
          }
        }
        if (p.arrete) {
          r.arrete = true;
          finis++;
        }
        r.vit = dt > 0 ? (avantPos - r.pos) / dt : 0;
        // les dernières cases passent une à une
        if (i === 2 && r.vit > 0.5 && r.vit < 9 && Math.floor(avantPos) !== Math.floor(r.pos) && e.horloge - e.dernierTic > 0.07) {
          SONS.cloison(0.014);
          e.dernierTic = e.horloge;
        }
      });
      if (finis === 3) {
        for (const r of e.rouleaux) r.vit = 0;
        conclure();
      }
    }
    // les statères tombent un à un dans le bac
    if (e.aTomber > 0 && e.horloge >= e.prochaine) {
      lacherPiece(e.total - e.aTomber);
      e.aTomber--;
      e.prochaine = e.horloge + e.intervalle;
    }
    for (const p of e.tas) {
      if (p.pose) continue;
      bouge = true;
      p.t += dt;
      const chute = 0.22;
      const u = p.t / chute;
      if (u < 1) {
        p.x = p.x0 + (p.cx - p.x0) * u;
        p.y = p.y0 + (p.cy - p.y0) * u * u;
        p.vu = Math.floor(p.t * 22) % 3;
      } else {
        const v = (p.t - chute) / 0.16;
        if (!p.sonne) {
          p.sonne = true;
          SONS.piece(0, p.i);
        }
        if (v >= 1) {
          p.x = p.cx;
          p.y = p.cy;
          p.pose = true;
        } else {
          p.x = p.cx;
          p.y = p.cy - Math.sin(v * Math.PI) * 3;
          p.vu = 0;
        }
      }
    }
    if (e.aTomber > 0) bouge = true;
    if (e.etatJeu === "paie" && e.aTomber === 0 && e.tas.every((p) => p.pose)) e.etatJeu = "pret";
    // la lumière monte et descend lentement
    if (e.lueurFin && e.horloge > e.lueurFin) {
      e.lueurFin = 0;
      e.lueurCible = 0.18;
    }
    e.lueur += (e.lueurCible - e.lueur) * (1 - Math.exp(-dt / 0.6));
    if (Math.abs(e.lueurCible - e.lueur) > 0.01) bouge = true;
    else e.lueur = e.lueurCible;
    const ec = e.gagnantes.length && e.etatJeu !== "tourne" ? 1 : 0;
    if (Math.abs(ec - e.eclat) > 0.002) {
      e.eclat += (ec - e.eclat) * (1 - Math.exp(-dt / 0.4));
      bouge = true;
    } else e.eclat = ec;
    if (e.saut && e.horloge - e.saut < 1.4) bouge = true;
    if (e.gagnantes.length && e.lueurFin && !sansMouvement()) bouge = true; // les symboles gagnants se balancent doucement
    return bouge;
  }

  /* ---------- La machine à sa taille : peinte une fois, à 2 pixels par point ---------- */
  useLayoutEffect(() => {
    const e = s.current;
    const cv = scene.current;
    if (!pret || !cv) return;
    const g = metriques(k);
    const mx = avecForgeron ? 50 : 2;
    let Wc = mx + g.BW + g.lev.w + 1;
    Wc += Wc % 2;
    const fond = new Toile(Wc, g.MH);
    fond.pose(peindreMachine(g), mx, 0);
    if (avecForgeron) fond.pose(peindreSocle(SOCLE), 0, g.MH - SOCLE - 2);
    const p = piecesDesRouleaux(g);
    Object.assign(e, { g, mx, W: Wc, H: g.MH, avecForgeron });
    e.sp = {
      fond: enToile(fond),
      levre: enToile(peindreLevre(g)),
      case: enToile(p.case),
      ombre: enToile(p.ombre),
      cadre: enToile(p.cadre),
      halo: enToile(p.halo),
      globe: enToile(p.globe),
      sym: [0, 1, 2, 3, 4].map((i) => enToile(symbole(i, g.S))),
      pieces: piecesQuiTombent().map(enToile),
      leviers: new Map(),
      textes: new Map(),
    };
    cv.width = Wc;
    cv.height = g.MH;
    cv.style.width = Wc * 2 + "px";
    cv.style.height = g.MH * 2 + "px";
    const b = boite.current;
    if (b) {
      b.style.setProperty("--dr", Wc * 2 + "px");
      b.style.setProperty("--hx", (mx + g.BW / 2) * 2 + "px");
      b.style.setProperty("--fx", mx * 2 + "px");
      b.style.setProperty("--fw", g.BW * 2 + "px");
    }
    salle.current?.style.setProperty("--dr", Wc * 2 + "px");
    const l = levierEl.current;
    if (l) l.style.cssText = `left:${(mx + g.BW - g.U(3)) * 2}px;top:${(g.lev.y - 2) * 2}px;width:${(Wc - mx - g.BW + g.U(3)) * 2}px;height:${(g.lev.h + 4) * 2}px`;
    e.emplacements = emplacementsDuBac(g);
    for (const pc of e.tas) {
      const pl = e.emplacements[pc.i % e.emplacements.length]!;
      pc.x = pc.cx = pl.x;
      pc.y = pc.cy = pl.y;
      pc.pose = true;
    }
    reveiller();
  }, [pret, k, avecForgeron]);

  useEffect(() => {
    crou.dit(...REPOS);
  }, []);
  // La bourse change : la mise suit (jamais plus que ce qu'elle permet).
  useEffect(() => {
    pup.regle();
  }, [casino.bourse]);
  useEffect(() => {
    dessine();
  }, [pup.total]);
  // Espace ou Entrée, quand rien d'autre n'a le focus : la machine tire le levier.
  useEffect(() => {
    const touche = (ev: KeyboardEvent): void => {
      if ((ev.key === " " || ev.key === "Enter") && (ev.target === document.body || ev.target === document.documentElement)) {
        ev.preventDefault();
        if (!ev.repeat) tirerRef.current();
      }
    };
    document.addEventListener("keydown", touche);
    return () => document.removeEventListener("keydown", touche);
  }, []);
  useEffect(
    () => () => {
      // On quitte la machine en plein tour : le tour se finit sans mouvement (la bourse reçoit son solde, la partie s'inscrit).
      const e = s.current;
      e.monte = false;
      e.stop();
      e.roule?.fin();
      e.roule = null;
      for (const m of e.minuteries) clearTimeout(m);
      e.minuteries.clear();
      e.finir?.();
    },
    [],
  );

  /* ---------- Le levier sous la main ---------- */
  const surPrise = (ev: PointerEvent): void => {
    const e = s.current;
    const lev = e.lev;
    if (ev.button > 0 || e.enCours || sansMouvement() || (lev.mode !== "repos" && lev.mode !== "remonte") || !e.g) return;
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    lev.mode = "tenu";
    lev.y0 = ev.clientY - (Math.max(0, lev.t) * 4 * e.g.L) / 0.62;
    lev.bouge = false;
    lev.cran = 0;
    lev.t = Math.max(0, lev.t);
    setPrise(true);
    SM.prise();
    reveiller();
  };
  const surTire = (ev: PointerEvent): void => {
    const e = s.current;
    const lev = e.lev;
    if (lev.mode !== "tenu" || !e.g) return;
    const brut = (ev.clientY - lev.y0) / (4 * e.g.L); // la course du pommeau : 2 L points, 4 L pixels
    if (Math.abs(ev.clientY - lev.y0) > 4) lev.bouge = true;
    lev.t = borne(brut * 0.62, 0, 0.5); // il résiste : il suit la main de loin
    const cran = Math.floor(lev.t * 7);
    if (cran > lev.cran) SM.cliquet(cran);
    lev.cran = cran;
    if (brut >= 0.68) {
      // il cède
      setPrise(false);
      lev.mode = "descend";
      lev.cede = true;
    }
    reveiller();
  };
  const surLache = (): void => {
    const lev = s.current.lev;
    if (lev.cede) {
      lev.cede = false;
      lev.ignoreClic = performance.now();
    }
    if (lev.mode !== "tenu") return;
    setPrise(false);
    if (lev.bouge) {
      lev.mode = "remonte";
      lev.v = 0;
      SM.lache();
      lev.ignoreClic = performance.now();
    } else lev.mode = "repos";
    reveiller();
  };
  const surClic = (): void => {
    const lev = s.current.lev;
    if (lev.ignoreClic && performance.now() - lev.ignoreClic < 400) return;
    if (lev.mode === "descend" || lev.mode === "bas") return;
    tirerLeLevier();
  };
  const essayer = (r: ResultatDeLaMachine): void => {
    const e = s.current;
    if (e.enCours || (e.lev.mode !== "repos" && e.lev.mode !== "remonte")) return;
    e.essai = r;
    montrer(salle.current);
    tirerLeLevier();
  };

  /* ---------- Autour de la machine : la table des gains sur le feutre, les derniers tirages, les coups d'essai ---------- */
  const sym24 = useMemo(() => [0, 1, 2, 3, 4, -1].map((i) => symbole(i, 24)), []);
  const t24 = (i: number): Toile => sym24[i < 0 ? 5 : i]!;
  const v = pup.total;

  return (
    <div class="cas-jeu machine-jeu" ref={racine}>
      <div class="machine-salle" ref={salle}>
        <section class="machine-cote" aria-label="La machine">
          <div class={`machine-boite ${lumiere ? "machine-gagne" : ""} ${lumiere === "fete" ? "machine-fete" : ""}`} ref={boite}>
            <i class="machine-halo" />
            <canvas ref={scene} class="machine-scene" role="img" aria-label="La machine du forgeron : trois rouleaux, seule la ligne du milieu paie" />
            <button
              ref={levierEl}
              class={`machine-levier ${prise ? "machine-prise" : ""}`}
              type="button"
              title="Tirer le levier"
              aria-label={v ? `Tirer le levier : un tirage à ${v} statères` : "Tirer le levier"}
              aria-disabled={enCours ? "true" : undefined}
              onPointerDown={surPrise}
              onPointerMove={surTire}
              onPointerUp={surLache}
              onPointerCancel={surLache}
              onClick={surClic}
            />
            <div class={`machine-fanion ${fanion.vu ? "machine-vu" : ""}`} aria-hidden="true">
              {fanion.texte && (
                <span class="jeu-ruban cas-ruban jeu-n9">
                  <Mots t={fanion.texte} couleur="creme" relief="ombre" muet />
                </span>
              )}
            </div>
          </div>
          <div class="machine-tours">
            <Mots t="Vos tirages" couleur="doux" />
            <span class="machine-liste" role="list" aria-label="Vos derniers tirages">
              {tours.map((r, i) => (
                <span key={`${i}-${r}`} class={`cas-gemme jeu-n9 ${r < 0 ? "" : "cas-" + TONS_DE_LA_MACHINE[r]}`} role="listitem" aria-label={r < 0 ? "Rien" : r === 4 ? "Gui, mise rendue" : `Trois ${NOMS_DES_SYMBOLES[r]}`}>
                  {r >= 0 && <Peinture toile={mini(r)} />}
                </span>
              ))}
              {Array.from({ length: 10 - tours.length }, (_, i) => (
                <span key={`v${i}`} class="cas-gemme jeu-n9 machine-vide" aria-hidden="true" />
              ))}
            </span>
          </div>
        </section>
        <div class="machine-droite">
          <PanneauDuCroupier croupier={crou} />
          <Pupitre pupitre={pup} action="Tirer" nomAction="Tirer le levier" surAction={tirerLeLevier} classe="machine-pupitre" />
          <div class="cas-tapis" role="group" aria-label="La table des gains">
            <div class="machine-tapis" role="list">
              {[0, 1, 2, 3, 4].map((r) => {
                const fois = foisDuResultat(r as ResultatDeLaMachine);
                const marque = sorti === null ? "" : sorti === r ? "cas-sorti" : "cas-eteint";
                return (
                  <div
                    key={r}
                    class={`machine-ligne jeu-n9 cas-halo ${marque}`}
                    role="listitem"
                    aria-label={r === 4 ? `Un brin de gui sur le premier rouleau, sans trio : mise rendue. ${CHANCES_DE_LA_MACHINE[r]}.` : `Trois ${NOMS_DES_SYMBOLES[r]} : ${fois} fois la mise. ${CHANCES_DE_LA_MACHINE[r]}.`}
                  >
                    <span class="machine-trio" aria-hidden="true">
                      {[0, 1, 2].map((j) => (
                        <Peinture key={j} toile={t24(r === 4 && j ? -1 : r)} />
                      ))}
                    </span>
                    <span class="machine-mots" aria-hidden="true">
                      <span class="machine-long">
                        <Mots t={r === 4 ? "Mise rendue" : `${fois} fois la mise`} couleur="creme" relief="ombre" muet />
                      </span>
                      <span class="machine-court">
                        <Mots t={r === 4 ? "Rendue" : `${fois} fois`} couleur="creme" relief="ombre" muet />
                      </span>
                      <Mots t={CHANCES_DE_LA_MACHINE[r]!} couleur="orvif" muet />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <details class="cas-pli cas-panneau jeu-n9 machine-regles">
        <summary>
          <Pic nom="livre" />
          <Mots t="Les règles" />
          <span class="cas-chev">
            <Pic nom="chevron" />
          </span>
        </summary>
        <ul>
          <li>Un tirage coûte un jeton : 10, 20, 50, 100 ou 200 statères. Seule la ligne du milieu paie.</li>
          <li>Trois statères d'or : 100 fois la mise, mise comprise. 2 fois sur 1 000.</li>
          <li>Trois torques d'or : 20 fois la mise. 1 fois sur 100.</li>
          <li>Trois enseignes au sanglier : 5 fois la mise. 4 fois sur 100.</li>
          <li>Trois amphores : 2 fois la mise. 1 fois sur 10.</li>
          <li>Un brin de gui sur le premier rouleau, sans trio : mise rendue. 1 fois sur 5.</li>
          <li>Sinon, rien : 648 fois sur 1 000.</li>
          <li>Le serveur tire le résultat avant que les rouleaux tournent, et la machine ne fabrique aucun « presque gagné ». Elle rend en moyenne exactement la mise.</li>
        </ul>
      </details>
      <details class="cas-pli cas-panneau jeu-n9 machine-regles">
        <summary>
          <Pic nom="machine" />
          <Mots t="Voir chaque gain" />
          <span class="cas-chev">
            <Pic nom="chevron" />
          </span>
        </summary>
        <p class="machine-mot">Des coups d'essai : ils ne coûtent rien et ne rapportent rien.</p>
        <div class="machine-essais">
          {ESSAIS.map(([r, mot]) => (
            <button
              key={r}
              type="button"
              class="machine-essai jeu-n9"
              disabled={enCours}
              aria-label={"Coup d'essai : " + (r < 0 ? "rien" : r === 4 ? "un brin de gui, mise rendue" : `trois ${NOMS_DES_SYMBOLES[r]}, ${foisDuResultat(r)} fois la mise`)}
              onClick={() => essayer(r)}
            >
              <Peinture toile={t24(r)} />
              <Mots t={mot} couleur="creme" muet />
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
