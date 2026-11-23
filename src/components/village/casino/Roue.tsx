import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { casino as appels } from "../../../lib/compte/api";
import { SONS, type Roulement } from "../../../lib/jeu/casino-sons";
import { RoueEnPoints, ROUGES, caseDuNumero, caseSousLaBille, mouvementDeLaRoue, poseImmobile } from "../../../lib/jeu/casino-roue";
import { borne, pair, versLaToile, type Toile } from "../../../lib/jeu/casino-toile";
import { nombreEcrit } from "../../../lib/jeu/ecriture";
import { PARIS_ROUE } from "../../../lib/village/casino/roue";
import type { CoupDeLaRoue, MisesDeLaRoue } from "../../../lib/village/contrat-casino";
import { couleurDuNumero } from "../../../lib/village/ecran-casino";
import { anime, montrer, sansMouvement, useLargeurDuJeu } from "./commun";
import { useCasino } from "./contexte";
import { PanneauDuCroupier, useCroupier } from "./Croupier";
import { JetonPose, Mots, Pic } from "./Pieces";
import { Pupitre, usePupitre, type Mises } from "./Pupitre";

/**
 * La roue du charron (maquette « Le Palais d'or » de Claude Fable 5.2, validée par le pilote le 22 novembre 2026, portée
 * telle quelle) : 36 cases sans zéro, rouges au losange et bleues au rond. Un tour : le pupitre engage les paris, le serveur
 * prend la mise et tire le numéro (`jouer_roue`), puis la roue tourne vers ce numéro, la bille tombe, la plaque le dit et le
 * casino rend le gain. Le modèle des autres jeux (« Le casino du jeu » de docs/DESIGN.md).
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
const NUMEROS = Array.from({ length: 36 }, (_, i) => i + 1);
const REPOS: [string, string] = ["Faites vos jeux", "Posez vos jetons sur le tapis"];

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

export default function LaRoue() {
  const casino = useCasino();
  const crou = useCroupier("roue");
  const pup = usePupitre({ surRefus: (titre, sous) => crou.dit(titre, sous) });
  const racine = useRef<HTMLDivElement>(null);
  const salle = useRef<HTMLDivElement>(null);
  const boite = useRef<HTMLDivElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);
  const W = useLargeurDuJeu(racine);

  const [enCours, setEnCours] = useState(false);
  const [gagne, setGagne] = useState(false);
  const [apres, setApres] = useState<ApresLeTour | null>(null);
  // Vos tours : les derniers numéros sortis pour ce compte, lus au serveur, puis ceux de cette visite.
  const [tours, setTours] = useState<number[]>(() =>
    casino.etat.parties
      .map((p) => (p.resume.jeu === "roue" ? p.resume.numero : 0))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 36)
      .slice(0, 10),
  );

  /* --- La roue : peinte point par point, la lumière reste fixe pendant que les cases tournent dessous --- */
  const vue = useRef({ rot: 0.2, billeA: -Math.PI / 2, billeR: 0.865, gagnant: -1, eclat: 0 });
  const roue = useRef<{ points: RoueEnPoints; chiffres: HTMLCanvasElement[]; bille: HTMLCanvasElement; image: ImageData } | null>(null);
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
    r.points.peindre(v.rot, v.gagnant, v.eclat);
    ctx.putImageData(r.image, 0, 0);
    for (let k = 0; k < r.chiffres.length; k++) {
      const p = r.points.placeDuChiffre(k, v.rot);
      ctx.drawImage(r.chiffres[k]!, p.x, p.y);
    }
    const b = r.points.placeDeLaBille(v.billeA, v.billeR);
    ctx.drawImage(r.bille, b.x, b.y);
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
  const grille = useMemo(() => {
    const wt = lt - 28;
    if (!vertical) {
      const cw = pair((wt - 24) / 13);
      const ch = pair(borne(cw * 0.94, 44, 64));
      return { cols: `repeat(13, ${cw}px)`, rows: `repeat(3, ${ch}px) 44px 44px`, petit: cw < 56 };
    }
    const lat = 62;
    const cw = pair((wt - 2 * lat - 8) / 3);
    return { cols: `${lat}px ${lat}px repeat(3, ${cw}px)`, rows: "repeat(12, 38px) 40px", petit: cw < 56 };
  }, [lt, vertical]);

  useEffect(() => {
    crou.dit(...REPOS);
  }, []);

  /** Efface les marques du tour d'avant (case sortie, lueur, plaque du résultat, jetons qui partent). */
  const nettoyer = (): void => {
    setApres(null);
    crou.efface();
    setGagne(false);
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
    if (pup.poser(id)) crou.dit(...REPOS);
  };

  /* --- Un tour : le serveur tire d'abord, la bille ne fait que montrer --- */
  const arret = useRef<{ stop: () => void; roule: Roulement | null; finir: (() => void) | null; monte: boolean }>({ stop: () => undefined, roule: null, finir: null, monte: true });
  useEffect(
    () => () => {
      // On quitte la roue en plein tour : le tour se finit sans mouvement (la bourse reçoit son solde, la partie s'inscrit).
      arret.current.monte = false;
      arret.current.stop();
      arret.current.roule?.fin();
      arret.current.finir?.();
    },
    [],
  );

  async function lancer(): Promise<void> {
    if (enCours) return;
    nettoyer();
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
    crou.dit("Rien ne va plus", "La roue tourne");
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
    const m = mouvementDeLaRoue(k, vue.current.rot);
    const roule = SONS.roulement(900, 1.1, 0.05);
    arret.current.roule = roule;
    let t0 = 0;
    let case0: number | null = null;
    let dernierTic = 0;
    let tombe = false;
    let revele = false;
    arret.current.stop = anime((maintenant) => {
      if (!t0) t0 = maintenant;
      const t = (maintenant - t0) / 1000;
      const p = m.position(t);
      const v = vue.current;
      v.rot = p.rot;
      v.billeA = p.billeA;
      v.billeR = p.billeR;
      if (p.phase === "piste") roule?.regle(0.012 + 0.05 * Math.min(1, m.vitesseDeLaBille(t) / 8), 520 + m.vitesseDeLaBille(t) * 95);
      else if (p.phase === "descente") {
        roule?.regle(Math.max(0, 0.03 * (1 - p.u * 2.4)), 480);
        // La bille tinte contre chaque cloison qu'elle passe, de plus en plus doucement.
        const c = caseSousLaBille(p.billeA, p.rot);
        if (case0 !== null && c !== case0 && p.u > 0.2 && maintenant - dernierTic > 70) {
          SONS.cloison(0.012 + 0.03 * (1 - p.u));
          dernierTic = maintenant;
        }
        case0 = c;
        if (!tombe && p.u > 0.5) {
          tombe = true;
          SONS.chute();
        }
      } else if (!revele) {
        revele = true;
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
    const plein = (parPari[`n${numero}`] ?? 0) > 0;
    vue.current.gagnant = k;
    vue.current.eclat = sansMouvement() ? 2 : 0;
    dessine();
    crou.dit(`Le ${numero}, ${rouge ? "rouge" : "bleu"}`, coup.rendu ? `Rendu : ${nombreEcrit(coup.rendu)} statères` : "Rien cette fois");
    crou.resultat({ signe: String(numero), ton: rouge ? "rouge" : "bleue", rendu: coup.rendu, mise: total });
    const gagnants = new Set(Object.keys(mises).filter((id) => (parPari[id] ?? 0) > 0));
    setApres({ mises, gagnants, sorti: numero, tousPartis: false });
    if (coup.rendu) setGagne(true);
    // La fin du tour : la barre reçoit le solde, le son et le visage suivent, la pluie pour un numéro plein.
    casino.finDeTour({ coup, grand: plein, croupier: crou, scene: boite.current });
    setTours((t) => [numero, ...t].slice(0, 10));
    setEnCours(false);
    // Les jetons gagnants restent un instant sur le tapis, puis s'en vont (« mêmes mises » les repose).
    setTimeout(() => setApres((a) => (a && a.sorti === numero ? { ...a, tousPartis: true } : a)), 2600);
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
  const jetonSur = (id: string) => {
    const s = surLeTapis(id);
    return s.montant ? <JetonPose montant={s.montant} nouveau={s.nouveau} part={s.part} petit={grille.petit} /> : null;
  };

  return (
    <div class="cas-jeu roue-jeu" ref={racine}>
      <div class="roue-salle" ref={salle}>
        <section class="roue-cote" aria-label="La roue">
          <div class={`roue-boite ${gagne ? "roue-gagne" : ""}`} ref={boite}>
            <i class="roue-halo" />
            <canvas ref={toile} role="img" aria-label="La roue : 36 cases, rouges et bleues" />
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
        </section>
        <PanneauDuCroupier croupier={crou} classe="roue-croupier" />
        <div class="cas-tapis roue-plateau" role="group" aria-label="Le tapis" ref={feutre}>
          <div class={`roue-tapis ${tapisFerme ? "roue-ferme" : ""} ${grille.petit ? "roue-petit" : ""}`} style={`grid-template-columns:${grille.cols};grid-template-rows:${grille.rows}`}>
            {NUMEROS.map((n) => {
              const r = ROUGES.has(n);
              const id = `n${n}`;
              return (
                <button key={id} class={`roue-case roue-num jeu-n9 cas-halo ${r ? "cas-rouge" : "cas-bleue"} ${marque(id, 1)}`} type="button" style={`grid-area:${placeDuPari(id, vertical)}`} aria-label={`Le ${n}, ${r ? "rouge" : "bleu"}. Paie 36 fois la mise.${miseDite(id)}`} onClick={() => surCase(id)}>
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
              return (
                <button key={p.id} class={`roue-case jeu-n9 cas-halo ${coul} ${marque(p.id, 2)}`} type="button" style={`grid-area:${placeDuPari(p.id, vertical)}`} aria-label={`${p.nom}. Paie ${p.fois} fois la mise.${miseDite(p.id)}`} title={`${p.nom} : ${p.fois} fois la mise`} onClick={() => surCase(p.id)}>
                  {p.id[0] === "c" ? (
                    <span class="roue-grand roue-col" style={vertical ? "transform:rotate(-90deg)" : undefined}>
                      <Pic nom="colonne" />
                    </span>
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
          <li>Rouge, bleu, pair, impair, de 1 à 18, de 19 à 36 : 2 fois la mise, une chance sur 2.</li>
          <li>Un tiers ou une colonne : 3 fois la mise, une chance sur 3.</li>
          <li>200 statères au plus sur la table. Jetons de 10, 20, 50, 100 et 200.</li>
          <li>Le serveur tire le numéro avant que la roue tourne. La roue rend en moyenne exactement la mise.</li>
        </ul>
      </details>
    </div>
  );
}

