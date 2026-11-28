import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { casino as appels } from "../../../lib/compte/api";
import { SONS, type Roulement } from "../../../lib/jeu/casino-sons";
import { RoueEnPoints, ROUGES, caseDuNumero, caseSousLaBille, mouvementDeLaRoue, poseImmobile, tirerUnLancer } from "../../../lib/jeu/casino-roue";
import { borne, jetonDeMise, pair, poseToile, versLaToile, type Toile } from "../../../lib/jeu/casino-toile";
import { texteEnPixels } from "../../../lib/jeu/dans-la-page";
import { nombreEcrit } from "../../../lib/jeu/ecriture";
import { PARIS_ROUE, chanceDeLaTable, voisinsSurLaRoue } from "../../../lib/village/casino/roue";
import type { CoupDeLaRoue, MisesDeLaRoue } from "../../../lib/village/contrat-casino";
import { couleurDuNumero, motsDuRefus, refusDuJeton } from "../../../lib/village/ecran-casino";
import { anime, montrer, sansMouvement, useLargeurDuJeu } from "./commun";
import { useCasino } from "./contexte";
import { PanneauDuCroupier, useCroupier } from "./Croupier";
import { Bouton, JetonPose, Mots, Pic, pluie } from "./Pieces";
import { Pupitre, usePupitre, type Mises } from "./Pupitre";

/**
 * La roue du charron (maquette « Le Palais d'or » de Claude Fable 5.2, validée par le pilote le 22 novembre 2026, portée
 * telle quelle) : 36 cases sans zéro, rouges au losange et bleues au rond. Un tour : le pupitre engage les paris, le serveur
 * prend la mise et tire le numéro (`jouer_roue`), puis la roue tourne vers ce numéro, la bille tombe, la plaque le dit et le
 * casino rend le gain. Le modèle des autres jeux (« Le casino du jeu » de docs/DESIGN.md).
 *
 * Depuis le 28 novembre 2026 (maquette validée par le pilote) : cinq façons de lancer et la roue qui change de sens, des
 * rebonds, une loupe sur la bille, le tour rapide ; des fêtes selon ce que le tour a vraiment rapporté ; les trois lignes
 * écrites ; les paris entre les cases, les voisins et la barre de chance.
 */

/**
 * Les paris de la roue autres que les numéros, dans l'ordre du tapis, et le mot écrit sur leur case ; leur nom et leur
 * paiement sont ceux des règles du serveur (`PARIS_ROUE`).
 */
const AUTRES: readonly { id: string; nom: string; fois: number; mot?: string }[] = (
  [
    ["c1"],
    ["c2"],
    ["c3"],
    ["t1", "1 à 12"],
    ["t2", "13 à 24"],
    ["t3", "25 à 36"],
    ["bas", "1 à 18"],
    ["pair", "Pair"],
    ["rouge"],
    ["bleu"],
    ["impair", "Impair"],
    ["haut", "19 à 36"],
  ] as const
).map(([id, mot]) => ({ id, nom: PARIS_ROUE[id]?.nom ?? id, fois: PARIS_ROUE[id]?.fois ?? 0, mot }));
/** Les paris entre les cases : à cheval, carré, trio, six. */
const ENTRE = Object.values(PARIS_ROUE).filter((p) => /^[hvqrs]\d+$/.test(p.id));
const NUMEROS = Array.from({ length: 36 }, (_, i) => i + 1);
const REPOS: [string, string] = ["Faites vos jeux", "Posez vos jetons sur le tapis"];
const AUCUN: ReadonlySet<number> = new Set();

/** La place de chaque pari sur la grille du tapis : en long sur une table large, en hauteur sur une table étroite. */
function placeDuPari(id: string, vertical: boolean): string {
  const z = (c: number, r: number, cs = 1, rs = 1): string => `${r} / ${c} / span ${rs} / span ${cs}`;
  const n = id[0] === "n" ? Number(id.slice(1)) : 0;
  const k3 = ["t1", "t2", "t3"].indexOf(id);
  const k6 = ["bas", "pair", "rouge", "bleu", "impair", "haut"].indexOf(id);
  if (!vertical) {
    if (n) return z(Math.ceil(n / 3), 3 - ((n - 1) % 3));
    if (id === "c3") return z(13, 1);
    if (id === "c2") return z(13, 2);
    if (id === "c1") return z(13, 3);
    if (k3 >= 0) return z(1 + k3 * 4, 4, 4);
    return z(1 + k6 * 2, 5, 2);
  }
  if (n) return z(3 + ((n - 1) % 3), Math.ceil(n / 3));
  if (id === "c1") return z(3, 13);
  if (id === "c2") return z(4, 13);
  if (id === "c3") return z(5, 13);
  if (k3 >= 0) return z(2, 1 + k3 * 4, 1, 4);
  return z(1, 1 + k6 * 2, 1, 2);
}

/** Où poser chaque pari entre les cases, d'après le centre des numéros sur le tapis (en pixels du tapis). */
function placesEntreLesCases(centres: ReadonlyMap<number, { x: number; y: number }>): Record<string, { x: number; y: number }> {
  const c = (n: number): { x: number; y: number } => centres.get(n) ?? { x: 0, y: 0 };
  const milieu = (...p: { x: number; y: number }[]): { x: number; y: number } => ({ x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length });
  // Le bord d'une colonne du tapis, du côté du 1 : la moitié du chemin du centre de son voisin vers le sien, encore une fois.
  const bord = (col: number): { x: number; y: number } => {
    const a = c(3 * col - 2);
    const b = c(3 * col - 1);
    return { x: a.x + (a.x - b.x) / 2, y: a.y + (a.y - b.y) / 2 };
  };
  const places: Record<string, { x: number; y: number }> = {};
  for (const p of ENTRE) {
    const n = Number(p.id.slice(1));
    if (p.id[0] === "h") places[p.id] = milieu(c(n), c(n + 3));
    else if (p.id[0] === "v") places[p.id] = milieu(c(n), c(n + 1));
    else if (p.id[0] === "q") places[p.id] = milieu(c(n), c(n + 1), c(n + 3), c(n + 4));
    else if (p.id[0] === "r") places[p.id] = bord(n);
    else places[p.id] = milieu(bord(n), bord(n + 1));
  }
  return places;
}

/**
 * La marque d'un numéro, sous son chiffre : le losange plein des rouges, le rond percé des bleus (`--cas-marque-*` de
 * `casino-pieces.ts`), pour qu'une couleur ne soit jamais seule à dire quelque chose là où l'icône du coin ne tient pas.
 */
function Marque({ rouge }: { rouge: boolean }) {
  return <i class={`roue-marque ${rouge ? "roue-marque-losange" : "roue-marque-rond"}`} aria-hidden="true" />;
}

/** Ce qui reste sur le tapis après un tour : les mises du tour, ce qui a rendu, et si tous les jetons sont partis. */
interface ApresLeTour {
  mises: Mises;
  gagnants: ReadonlySet<string>;
  sorti: number;
  tousPartis: boolean;
}

/** La fête d'un tour gagnant : le gain, et pour un grand gain le numéro en grand sur la roue. */
interface Fete {
  cle: number;
  numero: number;
  gain: number;
  grand: boolean;
}

/** Un jeton gagnant qui vole vers la bourse de la barre du jeu (ou vers le croupier si la barre n'est pas là). */
function envoler(depuis: Element, montant: number, delai: number): void {
  if (sansMouvement()) return;
  const cible = document.querySelector<HTMLElement>('[data-testid="jeu-bourse"]') ?? document.querySelector<HTMLElement>(".roue-croupier");
  if (!cible) return;
  const a = depuis.getBoundingClientRect();
  const b = cible.getBoundingClientRect();
  const c = poseToile(document.createElement("canvas"), jetonDeMise(montant, 8));
  c.className = "roue-vol";
  c.setAttribute("aria-hidden", "true");
  document.body.append(c);
  const w = c.getBoundingClientRect().width || 34;
  const x0 = a.left + a.width / 2 - w / 2;
  const y0 = a.top + a.height / 2 - w / 2;
  c.style.left = x0 + "px";
  c.style.top = y0 + "px";
  const dx = b.left + b.width / 2 - w / 2 - x0;
  const dy = b.top + b.height / 2 - w / 2 - y0;
  const vol = c.animate(
    [
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 60}px) scale(1.25)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.6)`, opacity: 0.2 },
    ],
    { duration: 1150, delay: delai, easing: "ease-in-out", fill: "both" },
  );
  vol.onfinish = vol.oncancel = () => c.remove();
}

export default function LaRoue() {
  const casino = useCasino();
  const crou = useCroupier("roue");
  const pup = usePupitre({ surRefus: (titre, sous) => crou.dit(titre, sous) });
  const racine = useRef<HTMLDivElement>(null);
  const salle = useRef<HTMLDivElement>(null);
  const boite = useRef<HTMLDivElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);
  const loupe = useRef<HTMLCanvasElement>(null);
  const tapis = useRef<HTMLDivElement>(null);
  const W = useLargeurDuJeu(racine);

  const [enCours, setEnCours] = useState(false);
  const [gagne, setGagne] = useState(false);
  const [apres, setApres] = useState<ApresLeTour | null>(null);
  const [rapide, setRapide] = useState(false);
  const [voisins, setVoisins] = useState(false);
  const [vise, setVise] = useState<ReadonlySet<number>>(AUCUN);
  const [loupeVue, setLoupeVue] = useState(false);
  const [fete, setFete] = useState<Fete | null>(null);
  const [zones, setZones] = useState<Record<string, { x: number; y: number }>>({});
  // Vos tours : les derniers numéros sortis pour ce compte, lus au serveur, puis ceux de cette visite.
  const [tours, setTours] = useState<number[]>(() =>
    casino.etat.parties
      .map((p) => (p.resume.jeu === "roue" ? p.resume.numero : 0))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 36)
      .slice(0, 10),
  );
  // Le lancer du tour d'avant (pour ne jamais lancer deux fois de la même façon) et le sens de la roue, qui change à chaque tour.
  const dernierLancer = useRef(-1);
  const sens = useRef<1 | -1>(-1);

  /* --- La roue : peinte point par point, la lumière reste fixe pendant que les cases tournent dessous --- */
  const vue = useRef({ rot: 0.2, billeA: -Math.PI / 2, billeR: 0.865, gagnant: -1, eclat: 0 });
  const roue = useRef<{ points: RoueEnPoints; chiffres: HTMLCanvasElement[]; bille: HTMLCanvasElement; image: ImageData } | null>(null);
  // Les cases qui s'éclairent : les numéros du pari survolé, puis le tour de lumière d'un grand gain.
  const lumieres = useRef(new Float32Array(36));
  const viseRef = useRef<ReadonlySet<number>>(AUCUN);
  const balayage = useRef(0);
  const enToile = (t: Toile): HTMLCanvasElement => {
    const c = document.createElement("canvas");
    versLaToile(c, t);
    return c;
  };
  const dessine = (): void => {
    const r = roue.current;
    const cv = toile.current;
    const ctx = cv?.getContext("2d");
    if (!r || !ctx) return;
    const v = vue.current;
    const lum = lumieres.current;
    lum.fill(0);
    for (const n of viseRef.current) lum[caseDuNumero(n)] = 1;
    if (balayage.current) {
      const e = (performance.now() - balayage.current) / 1000;
      if (e > 3.7) balayage.current = 0;
      else {
        const tete = (v.gagnant + Math.floor(e * 10)) % 36;
        for (let d = 0; d < 5; d++) {
          const k = (tete - d + 72) % 36;
          lum[k] = Math.max(lum[k]!, 2 - d * 0.45);
        }
      }
    }
    r.points.peindre(v.rot, v.gagnant, v.eclat, lum);
    ctx.putImageData(r.image, 0, 0);
    for (let k = 0; k < r.chiffres.length; k++) {
      const p = r.points.placeDuChiffre(k, v.rot);
      ctx.drawImage(r.chiffres[k]!, p.x, p.y);
    }
    const b = r.points.placeDeLaBille(v.billeA, v.billeR);
    ctx.drawImage(r.bille, b.x, b.y);
    // La loupe suit la bille quand elle descend, saute et se pose.
    const lc = loupe.current?.getContext("2d");
    if (lc && loupe.current) {
      const n = loupe.current.width;
      const cx = b.x + r.bille.width / 2;
      const cy = b.y + r.bille.height / 2;
      lc.clearRect(0, 0, n, n);
      lc.drawImage(cv!, Math.round(cx - n / 2), Math.round(cy - n / 2), n, n, 0, 0, n, n);
    }
  };

  // La taille de la roue suit la largeur de la table (celle de la maquette : un tiers de la table, entre 360 et 620 pixels).
  const dr = W >= 1240 ? pair(borne(Math.min(W * 0.34, 620), 360, 620)) : W >= 760 ? pair(borne(W * 0.38, 300, 440)) : pair(Math.min(W - 24, 330));
  // Rien n'est peint tant que la table n'a pas une vraie largeur.
  const R = W >= 120 ? Math.floor(dr / 4) - 2 : 0;
  useLayoutEffect(() => {
    const cv = toile.current;
    if (!R || !cv) return;
    if (roue.current?.points.R !== R) {
      const points = new RoueEnPoints(R);
      cv.width = cv.height = points.S;
      roue.current = { points, chiffres: points.chiffres.map(enToile), bille: enToile(points.bille), image: new ImageData(new Uint8ClampedArray(points.pts.buffer as ArrayBuffer), points.S, points.S) };
    }
    const S = roue.current!.points.S;
    cv.style.width = cv.style.height = S * 2 + "px";
    salle.current?.style.setProperty("--dr", S * 2 + "px");
    if (loupe.current) loupe.current.width = loupe.current.height = Math.max(20, Math.round(S * 0.16));
    dessine();
  }, [R]);

  /* --- Le tapis : une case par pari ; les mises sont tenues par le pupitre --- */
  const vertical = W > 0 && W < 700;
  // La largeur du feutre (sa place dans la salle, à côté de la roue ou sous elle) donne celle des cases.
  const feutre = useRef<HTMLDivElement>(null);
  const [lt, setLt] = useState(0);
  useLayoutEffect(() => {
    const el = feutre.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setLt(el.clientWidth));
    obs.observe(el);
    setLt(el.clientWidth);
    return () => obs.disconnect();
  }, []);
  // La colonne des lignes est assez large pour « Ligne 1 » écrit en pixels.
  const lw = useMemo(() => pair(Math.max(...["Ligne 1", "3 fois"].map((t) => texteEnPixels(t, "creme")[0]!.largeur)) * 2 + 16), []);
  const grille = useMemo(() => {
    const wt = lt - 28;
    if (!vertical) {
      const cw = pair((wt - 24 - lw) / 12);
      const ch = pair(borne(cw * 0.94, 44, 64));
      return { cols: `repeat(12, ${cw}px) ${lw}px`, rows: `repeat(3, ${ch}px) 44px 44px`, petit: cw < 56 };
    }
    const lat = 62;
    const cw = pair((wt - 2 * lat - 8) / 3);
    return { cols: `${lat}px ${lat}px repeat(3, ${cw}px)`, rows: "repeat(12, 38px) 52px", petit: cw < 56 };
  }, [lt, vertical, lw]);

  // Les paris entre les cases se posent d'après la vraie place des numéros, une fois le tapis dessiné.
  useLayoutEffect(() => {
    const t = tapis.current;
    if (!t) return;
    const centres = new Map<number, { x: number; y: number }>();
    for (const el of t.querySelectorAll<HTMLElement>(".roue-num")) centres.set(Number(el.dataset["n"]), { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 });
    if (centres.size === 36) setZones(placesEntreLesCases(centres));
  }, [grille, vertical]);

  useEffect(() => {
    crou.dit(...REPOS);
  }, []);

  // Le pari survolé s'éclaire sur le tapis et sur la roue.
  useEffect(() => {
    viseRef.current = vise;
    if (!enCours) dessine();
  }, [vise]);
  const numerosDuPari = (id: string): readonly number[] => (voisins && id[0] === "n" ? voisinsSurLaRoue(Number(id.slice(1))) : (PARIS_ROUE[id]?.nums ?? []));
  const viser = (el: EventTarget | null): void => {
    const b = (el as HTMLElement | null)?.closest?.<HTMLElement>("[data-pari]");
    setVise(b && !tapisFerme ? new Set(numerosDuPari(b.dataset["pari"]!)) : AUCUN);
  };

  /** Efface les marques du tour d'avant (case sortie, lueur, plaque du résultat, jetons qui partent, fête). */
  const nettoyer = (): void => {
    setApres(null);
    crou.efface();
    setGagne(false);
    setFete(null);
    balayage.current = 0;
    if (vue.current.gagnant >= 0) {
      vue.current.gagnant = -1;
      vue.current.eclat = 0;
      dessine();
    }
  };

  const tapisFerme = enCours;
  const surCase = (id: string): void => {
    if (tapisFerme) return;
    nettoyer();
    // Les voisins : un jeton sur le numéro et un sur chacun de ses quatre voisins de roue, d'un seul geste.
    if (voisins && id[0] === "n") {
      const ns = voisinsSurLaRoue(Number(id.slice(1)));
      // Les cinq jetons d'un coup, ou aucun : la table, le reste du jour et la bourse, comme pour un seul jeton.
      const refus = refusDuJeton(pup.total, ns.length * pup.jeton, casino.limites);
      if (refus) {
        SONS.refus();
        crou.dit("Pas la place pour cinq jetons", motsDuRefus(refus, { reste: casino.limites.reste ?? undefined, plafond: casino.etat.plafond ?? undefined })[1]);
        return;
      }
      let posee = false;
      for (const n of ns) posee = pup.poser(`n${n}`) || posee;
      if (posee) crou.dit(`Les voisins du ${id.slice(1)}`, `${ns.join(", ")} : un jeton sur chacun`);
      return;
    }
    if (pup.poser(id)) crou.dit(...REPOS);
  };

  /* --- Un tour : le serveur tire d'abord, la bille ne fait que montrer --- */
  const arret = useRef<{ stop: () => void; roule: Roulement | null; finir: (() => void) | null; monte: boolean }>({ stop: () => undefined, roule: null, finir: null, monte: true });
  const minuteries = useRef<ReturnType<typeof setTimeout>[]>([]);
  const plusTard = (f: () => void, ms: number): void => void minuteries.current.push(setTimeout(f, ms));
  useEffect(
    () => () => {
      // On quitte la roue en plein tour : le tour se finit sans mouvement (la bourse reçoit son solde, la partie s'inscrit).
      arret.current.monte = false;
      arret.current.stop();
      arret.current.roule?.fin();
      arret.current.finir?.();
      minuteries.current.forEach(clearTimeout);
    },
    [],
  );

  async function lancer(): Promise<void> {
    if (enCours) return;
    nettoyer();
    setVise(AUCUN);
    const pris = await pup.engager((mises) => appels.roue(mises as MisesDeLaRoue));
    if (!pris.ok) return;
    const coup = pris.valeur;
    // La roue a été quittée pendant que le serveur répondait : le tour se finit sans un son ni un mouvement.
    if (!arret.current.monte) {
      casino.finDeTour({ coup, muet: true });
      return;
    }
    casino.prendreLaMise(coup);
    setEnCours(true);
    const numero = coup.numero;
    const k = caseDuNumero(numero);
    // Le lancer et le sens sont tirés ici, sans regarder les jetons : la bille finit toujours dans la case du numéro tiré.
    const { lancer: facon, rang } = tirerUnLancer(rapide, dernierLancer.current);
    dernierLancer.current = rang;
    sens.current = sens.current === 1 ? -1 : 1;
    crou.dit("Rien ne va plus", `${facon.nom}, la roue tourne ${sens.current === 1 ? "à droite" : "à gauche"}`);
    crou.visage("Lance");
    SONS.lance();
    if (W < 1240) montrer(salle.current);
    let fini = false;
    const fin = (): void => {
      if (fini) return;
      fini = true;
      arret.current.finir = null;
      reveler(coup, k, pris.mises, pris.total);
    };
    arret.current.finir = () => {
      if (fini) return;
      fini = true;
      casino.finDeTour({ coup, muet: true });
    };
    if (sansMouvement()) {
      const p = poseImmobile(k);
      Object.assign(vue.current, p);
      dessine();
      setTimeout(fin, 350);
      return;
    }
    const m = mouvementDeLaRoue(k, vue.current.rot, facon, sens.current);
    const roule = SONS.roulement(900, 1.1, 0.05);
    arret.current.roule = roule;
    let t0 = 0;
    let case0: number | null = null;
    let dernierTic = 0;
    let tombe = false;
    let revele = false;
    let sautVu = -1;
    let loupeMontree = false;
    arret.current.stop = anime((maintenant) => {
      if (!t0) t0 = maintenant;
      const t = (maintenant - t0) / 1000;
      const p = m.position(t);
      const v = vue.current;
      v.rot = p.rot;
      v.billeA = p.billeA;
      v.billeR = p.billeR;
      if (p.phase === "piste") roule?.regle(0.012 + 0.05 * Math.min(1, m.vitesseDeLaBille(t) / 8), 520 + m.vitesseDeLaBille(t) * 95);
      else if (p.phase === "descente" || p.phase === "saut") {
        roule?.regle(p.phase === "descente" ? Math.max(0, 0.03 * (1 - p.u * 2.4)) : 0, 480);
        if (!loupeMontree) {
          loupeMontree = true;
          setLoupeVue(true);
        }
        // La bille tinte contre chaque cloison qu'elle passe, de plus en plus doucement ; elle retombe à chaque rebond.
        const c = caseSousLaBille(p.billeA, p.rot);
        if (case0 !== null && c !== case0 && (p.phase === "saut" || p.u > 0.2) && maintenant - dernierTic > 70) {
          SONS.cloison(p.phase === "saut" ? 0.026 : 0.012 + 0.03 * (1 - p.u));
          dernierTic = maintenant;
        }
        case0 = c;
        if (!tombe && p.phase === "descente" && p.u > 0.5) {
          tombe = true;
          SONS.chute();
        }
        if (p.phase === "saut" && p.saut !== sautVu) {
          if (sautVu >= 0) SONS.chute();
          sautVu = p.saut;
        }
      } else if (!revele) {
        revele = true;
        if (sautVu >= 0) SONS.chute();
        roule?.fin();
        arret.current.roule = null;
        setTimeout(fin, 220);
      }
      if (v.gagnant >= 0 && v.eclat < 2 && t > m.pose + 0.6) v.eclat = t > m.pose + 1.1 ? 2 : 1;
      dessine();
      // Une pause en plein tour : la roue s'arrête où elle est, le résultat se pose.
      if (sansMouvement() && !revele) {
        revele = true;
        roule?.fin();
        arret.current.roule = null;
        Object.assign(v, poseImmobile(k));
        dessine();
        fin();
        return false;
      }
      if (t >= m.fin) return false;
    });
  }

  function reveler(coup: CoupDeLaRoue, k: number, mises: Mises, total: number): void {
    const numero = coup.numero;
    const rouge = couleurDuNumero(numero) === "rouge";
    const parPari = coup.par_pari ?? {};
    // La fête suit ce que le tour a vraiment rapporté : grand gain à 9 fois la mise ou plus, beau gain à 3 fois ou plus.
    const fois = total ? coup.rendu / total : 0;
    const grand = fois >= 9;
    const beau = !grand && fois >= 3;
    vue.current.gagnant = k;
    vue.current.eclat = sansMouvement() ? 2 : 0;
    dessine();
    crou.dit(`Le ${numero}, ${rouge ? "rouge" : "bleu"}`, coup.rendu ? `Rendu : ${nombreEcrit(coup.rendu)} statères` : "Rien cette fois");
    crou.resultat({ signe: String(numero), ton: rouge ? "rouge" : "bleue", rendu: coup.rendu, mise: total });
    const gagnants = new Set(Object.keys(mises).filter((id) => (parPari[id] ?? 0) > 0));
    setApres({ mises, gagnants, sorti: numero, tousPartis: false });
    // La lueur d'or seulement quand le tour rapporte plus que la mise.
    if (coup.rendu > total) setGagne(true);
    // La fin du tour : la barre reçoit le solde, le son et le visage suivent, la pluie pour un grand gain.
    casino.finDeTour({ coup, grand, croupier: crou, scene: boite.current });
    if (beau) pluie(boite.current, 6);
    if (coup.rendu > total) {
      const gain = coup.rendu - total;
      // Le gain s'écrit tout de suite, juste : seule son apparition s'anime.
      setFete({ cle: coup.partie, numero, gain, grand });
      plusTard(() => setFete((f) => (f && f.cle === coup.partie ? null : f)), grand ? 3200 : 2800);
      // Le tour de lumière d'un grand gain : la roue l'anime tant qu'elle tourne encore, sinon une petite boucle à part.
      if (grand && !sansMouvement()) {
        balayage.current = performance.now();
        anime(() => {
          // Une pause pendant la fête éteint le tour de lumière.
          if (sansMouvement()) balayage.current = 0;
          dessine();
          return balayage.current !== 0;
        });
      }
      // Les jetons gagnants volent vers la bourse (pas en essai du mode GOD, où la bourse ne bouge pas).
      const t = coup.god ? null : tapis.current;
      [...gagnants].slice(0, 12).forEach((id, i) => {
        const el = t?.querySelector(`[data-pari="${id}"]`);
        if (el) envoler(el, parPari[id] ?? 0, 900 + i * 120);
      });
    }
    plusTard(() => setLoupeVue(false), 1400);
    setTours((t) => [numero, ...t].slice(0, 10));
    setEnCours(false);
    // Les jetons gagnants restent un instant sur le tapis, puis s'en vont (« mêmes mises » les repose).
    plusTard(() => setApres((a) => (a && a.sorti === numero ? { ...a, tousPartis: true } : a)), 2600);
    pup.finir();
  }

  /* --- Ce qu'on voit sur le tapis : les mises du pupitre, ou celles du tour qui vient de finir --- */
  const surLeTapis = (id: string): { montant: number; part: boolean; nouveau: number } => {
    if (pup.total > 0) return { montant: pup.mises[id] ?? 0, part: false, nouveau: pup.dernier?.id === id ? pup.dernier.fois : 0 };
    if (apres) return { montant: apres.mises[id] ?? 0, part: apres.tousPartis || !apres.gagnants.has(id), nouveau: 0 };
    return { montant: 0, part: false, nouveau: 0 };
  };
  const sorti = apres?.sorti ?? 0;
  const marque = (id: string, nums: number): string => {
    if (!apres || pup.total > 0) return "";
    if (id === `n${sorti}` || apres.gagnants.has(id)) return "cas-sorti";
    return nums === 1 ? "cas-eteint" : "";
  };
  /** Ce qu'un lecteur d'écran entend de la mise posée sur un pari (le jeton dessiné lui est caché). */
  const miseDite = (id: string): string => {
    const m = surLeTapis(id).montant;
    return m ? ` Misé : ${m} statères.` : "";
  };
  const jetonSur = (id: string, petit = grille.petit) => {
    const s = surLeTapis(id);
    return s.montant ? <JetonPose montant={s.montant} nouveau={s.nouveau} part={s.part} petit={petit} /> : null;
  };

  /* --- La chance du tour : sur combien des 36 numéros les jetons posés rendent plus que la mise --- */
  const misesVues: Mises = pup.total > 0 ? pup.mises : (apres?.mises ?? {});
  const chance = useMemo(() => chanceDeLaTable(misesVues), [misesVues]);
  const numerosGagnants = chance ? NUMEROS.filter((n) => chance.issues[n - 1] === "gagne") : [];
  const barreDite = !chance
    ? "La barre est vide : pas encore de jetons sur la table"
    : numerosGagnants.length
      ? `Vos jetons rendent plus que la mise sur ${numerosGagnants.length === 1 ? "le" : "les"} ${numerosGagnants.join(", ")}`
      : "Vos jetons ne rendent jamais plus que la mise";

  return (
    <div class="cas-jeu roue-jeu" ref={racine}>
      <div class="roue-salle" ref={salle}>
        <section class="roue-cote" aria-label="La roue">
          <div class={`roue-boite ${gagne ? "roue-gagne" : ""}`} ref={boite}>
            <i class="roue-halo" />
            <canvas ref={toile} role="img" aria-label="La roue : 36 cases, rouges et bleues" />
            <span class={`cas-cadre roue-loupe ${loupeVue ? "roue-vue" : ""}`} aria-hidden="true">
              <canvas ref={loupe} />
            </span>
            {fete && (
              <div class={`roue-fete ${fete.grand ? "roue-fete-grand" : ""}`} key={fete.cle} aria-hidden="true">
                {fete.grand && (
                  <span class="roue-geant">
                    <Mots t={String(fete.numero)} couleur="orvif" relief="cerne" p={9} muet />
                  </span>
                )}
                <span class="roue-gain">
                  <Mots t={`Gain ${nombreEcrit(fete.gain)}`} couleur="orvif" relief="cerne" p={3} muet />
                </span>
              </div>
            )}
          </div>
          <div class="roue-tours">
            <Mots t="Vos tours" couleur="doux" />
            <span class="roue-liste" role="list" aria-label="Vos derniers numéros sortis">
              {tours.map((n, i) => (
                <span key={`${i}-${n}`} class={`cas-gemme jeu-n9 ${ROUGES.has(n) ? "cas-rouge" : "cas-bleue"}`} role="listitem" aria-label={`${n}, ${couleurDuNumero(n)}`}>
                  <Mots t={String(n)} couleur="creme" muet />
                  <Marque rouge={ROUGES.has(n)} />
                </span>
              ))}
              {Array.from({ length: 10 - tours.length }, (_, i) => (
                <span key={`v${i}`} class="cas-gemme jeu-n9 roue-vide" aria-hidden="true" />
              ))}
            </span>
          </div>
          <div class="roue-gestes">
            <Bouton ton={rapide ? "or" : "bordeaux"} mot="Tour rapide" nom="Tour rapide : la roue s'arrête en deux secondes" aria-pressed={rapide} onClick={() => setRapide((r) => !r)} />
          </div>
        </section>
        <PanneauDuCroupier croupier={crou} classe="roue-croupier" />
        <div class="cas-tapis roue-plateau" role="group" aria-label="Le tapis" ref={feutre}>
          <div
            class={`roue-tapis ${tapisFerme ? "roue-ferme" : ""} ${grille.petit ? "roue-petit" : ""}`}
            style={`grid-template-columns:${grille.cols};grid-template-rows:${grille.rows}`}
            ref={tapis}
            onPointerOver={(e) => viser(e.target)}
            onPointerLeave={() => setVise(AUCUN)}
            onFocusIn={(e) => viser(e.target)}
            onFocusOut={() => setVise(AUCUN)}
          >
            {NUMEROS.map((n) => {
              const r = ROUGES.has(n);
              const id = `n${n}`;
              return (
                <button
                  key={id}
                  class={`roue-case roue-num jeu-n9 cas-halo ${r ? "cas-rouge" : "cas-bleue"} ${marque(id, 1)} ${vise.has(n) ? "roue-vise" : ""}`}
                  type="button"
                  data-n={n}
                  data-pari={id}
                  style={`grid-area:${placeDuPari(id, vertical)}`}
                  aria-label={`Le ${n}, ${r ? "rouge" : "bleu"}. Paie 36 fois la mise.${voisins ? " Voisins : cinq jetons." : ""}${miseDite(id)}`}
                  onClick={() => surCase(id)}
                >
                  {!grille.petit && (
                    <span class="roue-coin">
                      <Pic nom={r ? "losange" : "rond"} />
                    </span>
                  )}
                  <Mots t={String(n)} couleur="creme" muet />
                  {grille.petit && <Marque rouge={r} />}
                  {jetonSur(id)}
                </button>
              );
            })}
            {AUTRES.map((p) => {
              const coul = p.id === "rouge" ? "cas-rouge" : p.id === "bleu" ? "cas-bleue" : "";
              const ligne = p.id[0] === "c";
              // Les trois lignes du tapis (les colonnes du 1, du 2 et du 3) portent leur nom en clair.
              const nom = ligne ? `Ligne ${p.id.slice(1)}, 12 numéros` : p.nom;
              return (
                <button
                  key={p.id}
                  class={`roue-case jeu-n9 cas-halo ${coul} ${ligne ? "roue-ligne" : ""} ${marque(p.id, 2)}`}
                  type="button"
                  data-pari={p.id}
                  style={`grid-area:${placeDuPari(p.id, vertical)}`}
                  aria-label={`${nom}. Paie ${p.fois} fois la mise.${miseDite(p.id)}`}
                  title={`${nom} : ${p.fois} fois la mise`}
                  onClick={() => surCase(p.id)}
                >
                  {ligne && vertical ? (
                    <Mots t={p.id.slice(1)} couleur="orvif" p={3} muet />
                  ) : ligne ? (
                    <>
                      <Mots t={`Ligne ${p.id.slice(1)}`} couleur="creme" muet />
                      <Mots t="3 fois" couleur="orvif" muet />
                    </>
                  ) : coul ? (
                    <span class="roue-grand">
                      <Pic nom={p.id === "rouge" ? "losange" : "rond"} />
                    </span>
                  ) : (
                    <Mots t={p.mot ?? p.nom} couleur="creme" plie muet />
                  )}
                  {jetonSur(p.id)}
                </button>
              );
            })}
            {vertical && (
              <span class="roue-lignes-mot" style="grid-area:13 / 1 / span 1 / span 2" aria-hidden="true">
                <Mots t="Lignes" couleur="creme" muet />
                <Mots t="3 fois" couleur="orvif" muet />
              </span>
            )}
            {ENTRE.map((p) => {
              const z = zones[p.id];
              if (!z) return null;
              const s = surLeTapis(p.id);
              const gagnant = !!apres && pup.total === 0 && apres.gagnants.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  class={`roue-zone ${s.montant ? "roue-mise" : ""} ${gagnant ? "roue-zone-gagne" : ""}`}
                  data-pari={p.id}
                  style={`left:${z.x}px;top:${z.y}px`}
                  aria-label={`${p.nom}. Paie ${p.fois} fois la mise.${miseDite(p.id)}`}
                  title={`${p.nom} : ${p.fois} fois la mise`}
                  onClick={() => surCase(p.id)}
                >
                  {jetonSur(p.id, true)}
                </button>
              );
            })}
          </div>
          <div class="roue-chance">
            <div class="roue-chance-tete">
              {chance ? (
                chance.gagnants ? (
                  <>
                    <Mots t="Vous gagnez sur" couleur="creme" />
                    <Mots t={`${chance.gagnants} numéro${chance.gagnants > 1 ? "s" : ""} sur 36`} couleur="orvif" />
                    <Mots t={chance.min === chance.max ? `Gain ${nombreEcrit(chance.min)}` : `Gain de ${nombreEcrit(chance.min)} à ${nombreEcrit(chance.max)}`} couleur="creme" />
                  </>
                ) : (
                  <Mots t="Ces jetons ne rendent jamais plus que la mise" couleur="creme" plie />
                )
              ) : (
                <Mots t="La barre montre où vos jetons gagnent" couleur="creme" plie />
              )}
              <span class="roue-gestes-tapis">
                <Bouton ton={voisins ? "or" : "bordeaux"} mot="Voisins" nom="Voisins : un jeton sur le numéro et sur ses quatre voisins de roue" aria-pressed={voisins} onClick={() => setVoisins((v) => !v)} />
              </span>
            </div>
            <div class="roue-barre" role="img" aria-label={barreDite}>
              {NUMEROS.map((n, i) => (
                <i key={n} title={`Le ${n}`} class={`${chance ? `roue-b-${chance.issues[i]}` : ""} ${sorti === n && pup.total === 0 ? "roue-b-sorti" : ""}`} />
              ))}
            </div>
          </div>
        </div>
        <Pupitre pupitre={pup} action="Lancer" nomAction="Lancer la roue" surAction={() => void lancer()} classe="roue-pupitre" />
      </div>
      <details class="cas-pli cas-panneau jeu-n9 roue-regles">
        <summary>
          <Pic nom="livre" />
          <Mots t="Les règles" />
          <span class="cas-chev">
            <Pic nom="chevron" />
          </span>
        </summary>
        <ul>
          <li>36 cases, pas de zéro : 18 rouges, au losange, et 18 bleues, au rond.</li>
          <li>Un numéro paie 36 fois la mise, mise comprise : une chance sur 36.</li>
          <li>À cheval sur deux numéros voisins du tapis : 18 fois. Le trio, trois numéros qui se suivent (1, 2, 3 ; 4, 5, 6…) : 12 fois. Le carré de quatre : 9 fois. Le six, deux trios voisins : 6 fois.</li>
          <li>Une ligne ou un tiers, 12 numéros : 3 fois la mise, une chance sur 3.</li>
          <li>Rouge, bleu, pair, impair, de 1 à 18, de 19 à 36 : 2 fois la mise, une chance sur 2.</li>
          <li>Voisins : un jeton sur le numéro choisi et un sur chacun de ses quatre voisins de roue.</li>
          <li>200 statères au plus sur la table. Jetons de 10, 20, 50, 100 et 200.</li>
          <li>Le serveur tire le numéro avant que la roue tourne. Le lancer, le sens de la roue et les rebonds sont tirés sans regarder vos jetons. Chaque pari rend en moyenne exactement la mise.</li>
        </ul>
      </details>
    </div>
  );
}
