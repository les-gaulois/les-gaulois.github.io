import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { casino as appels } from "../../../lib/compte/api";
import { ChampDeCourses, H, TONS_DES_COULOIRS, dossard, fanionDeLaCorde, filDeLaCorde, mesuresDeLaScene, nomDuCouloir, placeSurLaCorde, plaqueDOr, portraitDuFamilier, type FamilierQuiCourt } from "../../../lib/jeu/casino-course";
import { SONS, cor } from "../../../lib/jeu/casino-sons";
import { poseToile } from "../../../lib/jeu/casino-toile";
import { nombreEcrit } from "../../../lib/jeu/ecriture";
import { SON_CHANGE, sonVoulu } from "../../../lib/jeu/sons";
import { COULOIRS } from "../../../lib/village/casino/course";
import type { CoupDeLaCourse } from "../../../lib/village/contrat-casino";
import { Etiquette } from "../../jeu/Pixels";
import { anime, montrer, sansMouvement, useJour, useLargeurDuJeu } from "./commun";
import { useCasino } from "./contexte";
import { PanneauDuCroupier, useCroupier } from "./Croupier";
import { FABRIQUE_DE_LA_PAGE, urlDeLaToile } from "./images";
import { Bouton, JetonPose, Mots, Peinture, Pic } from "./Pieces";
import { Pupitre, usePupitre, type Mises } from "./Pupitre";

/**
 * La course des familiers (maquette « Le Palais d'or » de Claude Fable 5.2, validée par le pilote le 22 novembre 2026, portée
 * telle quelle) : six vrais familiers du site, un couloir par course, une plaque d'or par couloir avec sa cote. Un tour : le
 * pupitre engage la mise, le serveur la prend et tire le couloir gagnant (`jouer_course`), puis la course est écrite pour ce
 * gagnant et la caméra suit le meneur jusqu'à la tribune d'or ; le croupier commente, la plaque dit le résultat, le casino
 * rend le gain. Dessins, course et sons : `src/lib/jeu/casino-course.ts`.
 */

const REPOS: [string, string] = ["Faites vos jeux", "Un couloir, vos jetons"];

/** Ce qui reste sur les plaques après une course : la mise, le couloir gagnant, et si les jetons sont partis. */
interface ApresLaCourse {
  mises: Mises;
  gagnant: number;
  tousPartis: boolean;
}
/** L'annonce de l'arrivée, sur la scène. */
interface Annonce {
  gagnant: number;
  voie: number;
  rendu: number;
  fois: number;
  familier: FamilierQuiCourt | null;
}

/** Le couloir où sont les jetons (un seul par course), ou -1. */
const couloirDesMises = (m: Mises): number => {
  const id = Object.keys(m).find((k) => (m[k] ?? 0) > 0);
  return id ? Number(id.slice(1)) : -1;
};

export default function LaCourse() {
  const casino = useCasino();
  const crou = useCroupier("course");
  const pup = usePupitre({ surRefus: (titre, sous) => crou.dit(titre, sous) });
  const racine = useRef<HTMLDivElement>(null);
  const salle = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);
  const corde = useRef<HTMLDivElement>(null);
  const fin = useRef<HTMLCanvasElement>(null);
  const pions = useRef<(HTMLCanvasElement | null)[]>([]);
  const W = useLargeurDuJeu(racine);
  const jour = useJour();

  const [coureurs, setCoureurs] = useState<FamilierQuiCourt[]>([]);
  const [joue, setJoue] = useState(false);
  const [voie, setVoie] = useState(-1);
  const [apres, setApres] = useState<ApresLaCourse | null>(null);
  const [annonce, setAnnonce] = useState<Annonce | null>(null);
  const [fondu, setFondu] = useState(false);

  /* --- Le champ de courses, ses gestes, la seule boucle --- */
  // Les gestes du moment, lus par le champ (créé une fois) et par les minuteries.
  const gestes = useRef<{ arrivee: () => void; commente: (titre: string, sous: string) => void }>({ arrivee: () => undefined, commente: () => undefined });
  const champ = useRef<ChampDeCourses | null>(null);
  champ.current ??= new ChampDeCourses(FABRIQUE_DE_LA_PAGE, { arrivee: () => gestes.current.arrivee(), commente: (t, s) => gestes.current.commente(t, s) }, { sansMouvement });
  const etat = useRef({ attente: false, fondu: false, departVoulu: false, monte: true, voie: -1, enRoute: false, avant: 0, repos: 0, stop: () => undefined as void });
  const enCours = useRef<{ coup: CoupDeLaCourse; mises: Mises; total: number } | null>(null);

  const dessiner = (): void => {
    const g = toile.current?.getContext("2d");
    if (g) champ.current!.dessiner(g);
  };
  /** La corde : où en est chaque couloir, du départ à l'arrivée ; le pion du pari est d'or et passe devant. */
  const majDeLaCorde = (): void => {
    const el = corde.current;
    const ch = champ.current!;
    if (!el) return;
    const large = el.clientWidth - 26 - 16;
    const ordre = [...ch.coureurs].sort((a, b) => a.part - b.part);
    for (const c of ch.coureurs) {
      const pion = pions.current[c.voie];
      if (!pion) continue;
      const mien = c.voie === ch.voie;
      const cle = (mien ? "or" : "") + c.voie;
      if (pion.dataset["d"] !== cle) {
        pion.dataset["d"] = cle;
        poseToile(pion, dossard(c.voie, mien));
      }
      pion.style.transform = `translateX(${placeSurLaCorde(c.part, large)}px)`;
      pion.style.zIndex = String(1 + ordre.indexOf(c) + (mien ? 10 : 0));
    }
  };
  const lancerLaBoucle = (): void => {
    const ch = champ.current!;
    const b = etat.current;
    if (sansMouvement()) {
      dessiner();
      return;
    }
    if (b.enRoute) return;
    b.enRoute = true;
    b.avant = performance.now();
    b.stop = anime((maintenant) => {
      if (!b.monte) {
        b.enRoute = false;
        return false;
      }
      if (sansMouvement() || document.hidden) {
        b.enRoute = false;
        if (sansMouvement()) ch.figer();
        dessiner();
        majDeLaCorde();
        return false;
      }
      const dt = Math.min(0.05, (maintenant - b.avant) / 1000 || 0);
      b.avant = maintenant;
      // Lente au repos (14 images par seconde : les nuages, la tribune qui se balance), vive pendant la course.
      const vif = ch.vif();
      b.repos += dt;
      if (vif || b.repos >= 1 / 14) {
        ch.pas(vif ? dt : b.repos);
        b.repos = 0;
        dessiner();
        if (vif) majDeLaCorde();
      }
    });
  };

  /* --- Une nouvelle course : six familiers, les paris ouverts --- */
  const nouvelleCourse = (premiere: boolean): void => {
    const ch = champ.current!;
    ch.finDesSons();
    ch.phase = "paris";
    ch.voie = -1;
    etat.current.voie = -1;
    setVoie(-1);
    setAnnonce(null);
    setApres(null);
    setJoue(false);
    if (!premiere) {
      crou.efface();
      crou.dit(...REPOS);
    }
    const poser = (): void => {
      if (!etat.current.monte) return;
      ch.nouvelleCourse();
      ch.voie = etat.current.voie;
      setCoureurs(ch.coureurs.map((c) => c.f));
      etat.current.fondu = false;
      setFondu(false);
      majDeLaCorde();
      dessiner();
      lancerLaBoucle();
      const v = etat.current.voie;
      if (!premiere && v >= 0) crou.dit(`Couloir ${v + 1}`, `${nombreEcrit(pup.total)} misés, ${nombreEcrit(pup.total * (COULOIRS[v]?.fois ?? 0))} pour la victoire`);
      if (etat.current.departVoulu) {
        etat.current.departVoulu = false;
        void depart();
      }
    };
    if (premiere || sansMouvement()) return poser();
    etat.current.fondu = true;
    setFondu(true);
    setTimeout(poser, 360);
  };

  // La scène à la largeur de sa boîte, en points entiers (2 pixels par point), au thème du jour.
  useLayoutEffect(() => {
    const el = scene.current;
    const cv = toile.current;
    if (!el || !cv || W < 120) return;
    const ch = champ.current!;
    const { W: w } = mesuresDeLaScene(el.clientWidth);
    ch.mesurer(w, jour);
    cv.width = w;
    cv.height = H;
    cv.style.width = w * 2 + "px";
    cv.style.height = H * 2 + "px";
    if (!ch.coureurs.length) nouvelleCourse(true);
    majDeLaCorde();
    dessiner();
  }, [W, jour]);

  // Les pièces d'or des plaques et de la corde, une fois.
  useLayoutEffect(() => {
    const el = racine.current;
    if (!el) return;
    el.style.setProperty("--course-plaque", urlDeLaToile(plaqueDOr(0)));
    el.style.setProperty("--course-plaque-s", urlDeLaToile(plaqueDOr(1)));
    el.style.setProperty("--course-plaque-m", urlDeLaToile(plaqueDOr(2)));
    el.style.setProperty("--course-fil", urlDeLaToile(filDeLaCorde()));
    if (fin.current) poseToile(fin.current, fanionDeLaCorde());
  }, []);

  useEffect(() => {
    crou.dit(...REPOS);
    // La pause, le mouvement réduit, l'onglet caché : la boucle s'arrête, puis reprend ; le son coupé fait taire la tribune.
    const reglage = (): void => {
      if (sansMouvement()) {
        champ.current!.figer();
        dessiner();
        majDeLaCorde();
      } else lancerLaBoucle();
    };
    const obs = new MutationObserver(reglage);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener("change", reglage);
    const visible = (): void => {
      if (!document.hidden) lancerLaBoucle();
    };
    document.addEventListener("visibilitychange", visible);
    const son = (): void => {
      if (!sonVoulu()) champ.current!.finDesSons();
    };
    window.addEventListener(SON_CHANGE, son);
    return () => {
      // On quitte la course en plein tour : le tour se finit sans mouvement (la bourse reçoit son solde, la partie s'inscrit).
      const b = etat.current;
      b.monte = false;
      b.stop();
      obs.disconnect();
      mq.removeEventListener("change", reglage);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener(SON_CHANGE, son);
      champ.current!.finDesSons();
      const e = enCours.current;
      enCours.current = null;
      if (e) casino.finDeTour({ coup: e.coup, muet: true });
    };
  }, []);

  /* --- Les mises : un seul couloir par course ; miser après une course en ouvre une nouvelle --- */
  useEffect(() => {
    const ch = champ.current!;
    if (ch.phase !== "paris") {
      if (!pup.total || pup.ferme || ch.phase === "depart" || ch.phase === "course") return;
      nouvelleCourse(false);
    }
    const v = couloirDesMises(pup.mises);
    etat.current.voie = v;
    ch.voie = v;
    setVoie(v);
    if (v >= 0 && !etat.current.fondu) crou.dit(`Couloir ${v + 1}`, `${nombreEcrit(pup.total)} misés, ${nombreEcrit(pup.total * (COULOIRS[v]?.fois ?? 0))} pour la victoire`);
    else if (v < 0) crou.dit(...REPOS);
    majDeLaCorde();
    dessiner();
  }, [pup.mises]);

  const surPlaque = (v: number): void => {
    const ch = champ.current!;
    if (ch.phase === "depart" || ch.phase === "course" || etat.current.attente) return;
    const id = `c${v}`;
    // Un pari par course : le jeton change de couloir.
    if (Object.keys(pup.mises).some((k) => k !== id)) pup.vider();
    pup.poser(id);
  };

  /* --- Une course : le serveur tire d'abord, la course ne fait que le montrer --- */
  async function depart(): Promise<void> {
    const ch = champ.current!;
    const b = etat.current;
    if (ch.phase !== "paris" || b.attente) return;
    if (b.fondu) {
      b.departVoulu = true;
      return;
    }
    b.attente = true;
    const pris = await pup.engager((mises, total) => appels.course(couloirDesMises(mises), total));
    b.attente = false;
    if (!pris.ok) return;
    const coup = pris.valeur;
    // La course a été quittée pendant que le serveur répondait : le tour se finit sans un son ni un mouvement.
    if (!b.monte) {
      casino.finDeTour({ coup, muet: true });
      return;
    }
    casino.prendreLaMise(coup);
    enCours.current = { coup, mises: pris.mises, total: pris.total };
    ch.voie = coup.couloir;
    ch.depart(coup.gagnant);
    setJoue(true);
    crou.dit("Ils partent", "Rien ne va plus");
    crou.visage("Lance");
    if (W < 1240) montrer(salle.current);
    if (sansMouvement()) {
      setTimeout(() => {
        ch.finirDUnCoup();
        dessiner();
        majDeLaCorde();
      }, 350);
      return;
    }
    cor([98, 146.83], 0, 1.25, 0.06);
    lancerLaBoucle();
  }

  /** Le gagnant passe la ligne : la plaque, l'annonce, le gain rendu par le casino. */
  gestes.current.arrivee = (): void => {
    const e = enCours.current;
    if (!e) return;
    enCours.current = null;
    const ch = champ.current!;
    const { coup, mises, total } = e;
    const g = coup.gagnant;
    const fois = COULOIRS[g]?.fois ?? 0;
    const gagne = coup.rendu > 0;
    const calme = sansMouvement();
    const grand = gagne && fois >= 8;
    crou.dit(`Couloir ${g + 1} gagne`, gagne ? `Rendu : ${nombreEcrit(coup.rendu)} statères` : "Rien cette fois");
    crou.resultat({ signe: String(g + 1), ton: TONS_DES_COULOIRS[g]?.plaque ?? "feutre", rendu: coup.rendu, mise: total });
    setAnnonce({ gagnant: g, voie: coup.couloir, rendu: coup.rendu, fois, familier: ch.coureurs[g]?.f ?? null });
    setApres({ mises, gagnant: g, tousPartis: false });
    // La fin du tour : la barre reçoit le solde, le son et le visage suivent ; la pluie lente pour 8 fois la mise et plus.
    if (!calme && !grand) {
      cor([146.83], 0, 0.32, 0.03);
      cor([220], 0.26, 0.3, 0.03);
      cor([146.83, 293.66], 0.52, 0.8, 0.028);
    }
    casino.finDeTour({ coup, grand, croupier: crou, scene: scene.current });
    if (gagne && !calme) ch.allumer(grand);
    setTimeout(() => setApres((a) => (a && a.gagnant === g ? { ...a, tousPartis: true } : a)), 2600);
    pup.finir();
  };
  gestes.current.commente = (titre: string, sous: string): void => crou.dit(titre, sous);

  /* --- Ce qu'on voit sur les plaques --- */
  const rangee = W >= 1500;
  const cote = rangee || W < 500 ? 80 : 96;
  const portraits = useMemo(() => coureurs.map((f) => portraitDuFamilier(f, cote)), [coureurs, cote]);
  const dossards = useMemo(() => COULOIRS.map((_, v) => dossard(v)), []);
  const vignette = useMemo(() => (annonce?.familier ? portraitDuFamilier(annonce.familier, 56) : null), [annonce]);
  const surLaPlaque = (id: string): { montant: number; part: boolean; nouveau: number } => {
    if (pup.total > 0) return { montant: pup.mises[id] ?? 0, part: false, nouveau: pup.dernier?.id === id ? pup.dernier.fois : 0 };
    if (apres) return { montant: apres.mises[id] ?? 0, part: apres.tousPartis || id !== `c${apres.gagnant}`, nouveau: 0 };
    return { montant: 0, part: false, nouveau: 0 };
  };
  const pencher = (e: PointerEvent): void => {
    if (sansMouvement() || e.pointerType === "touch") return;
    const b = e.currentTarget as HTMLElement;
    const q = b.getBoundingClientRect();
    b.style.setProperty("--ry", (((e.clientX - q.left) / q.width - 0.5) * 12).toFixed(1));
    b.style.setProperty("--rx", ((0.5 - (e.clientY - q.top) / q.height) * 10).toFixed(1));
  };
  const redresser = (e: PointerEvent): void => {
    const b = e.currentTarget as HTMLElement;
    b.style.setProperty("--rx", "0");
    b.style.setProperty("--ry", "0");
  };

  return (
    <div class="cas-jeu course-jeu" ref={racine}>
      <div class="course-salle" ref={salle}>
        <section class="course-champ" aria-label="Le champ de courses">
          <div class={`course-scene cas-cadre ${fondu ? "course-fondu" : ""}`} ref={scene}>
            <canvas ref={toile} class="course-toile" role="img" aria-label="Le champ de courses : six familiers sur six couloirs" />
            {annonce && (
              <div class={`course-annonce ${sansMouvement() ? "" : "course-arrive"}`}>
                <span class="jeu-ruban cas-ruban jeu-n9">
                  <Mots t={`Couloir ${annonce.gagnant + 1} gagne`} couleur="creme" relief="cerne" muet />
                </span>
                <div class="course-carton jeu-n9">
                  <span class="course-vignette">
                    <Peinture toile={vignette} />
                  </span>
                  <span>
                    <b>{annonce.familier?.nom ?? `Couloir ${annonce.gagnant + 1}`}</b>
                    <span>{annonce.rendu > 0 ? `Votre pari paie ${annonce.fois} fois la mise.` : `Votre pari sur le couloir ${annonce.voie + 1} est perdu.`}</span>
                  </span>
                </div>
                {annonce.rendu > 0 && (
                  <div class="course-saut">
                    <Etiquette t={`+${nombreEcrit(annonce.rendu)}`} ton="or" />
                  </div>
                )}
                <Bouton
                  ton="bordeaux"
                  icone="rejouer"
                  mot="Nouvelle course"
                  nom="Nouvelle course"
                  classe="course-encore"
                  onClick={() => {
                    const ch = champ.current!;
                    if (ch.phase !== "fini" && ch.phase !== "repos") return;
                    nouvelleCourse(false);
                    racine.current?.querySelector<HTMLElement>(".course-plaque")?.focus({ preventScroll: true });
                  }}
                />
              </div>
            )}
          </div>
          <div class="course-corde" ref={corde} aria-hidden="true">
            <i class="course-fil" />
            <canvas class="course-fin" ref={fin} />
            {COULOIRS.map((_, v) => (
              <canvas key={v} class="course-pion" ref={(el) => void (pions.current[v] = el)} />
            ))}
          </div>
        </section>
        <div class="cas-tapis course-tapis" role="group" aria-label="Les six couloirs : choisir celui du pari">
          <div class={`course-plaques ${joue ? "course-joue" : ""} ${rangee ? "course-rangee" : ""}`}>
            {COULOIRS.map((r, v) => {
              const f = coureurs[v];
              const id = `c${v}`;
              const s = surLaPlaque(id);
              const sorti = apres?.gagnant === v;
              return (
                <button
                  key={id}
                  class={`course-plaque jeu-n9 cas-halo ${sorti ? "cas-sorti" : ""}`}
                  type="button"
                  aria-pressed={voie === v}
                  aria-label={(f ? nomDuCouloir(v, f.nom, f.rarete) : `Couloir ${v + 1} : paie ${r.fois} fois la mise`) + (s.montant ? `. Misé : ${s.montant} statères.` : "")}
                  title={f ? `${f.nom} : paie ${r.fois} fois la mise, mise comprise` : undefined}
                  onClick={() => surPlaque(v)}
                  onPointerMove={pencher}
                  onPointerLeave={redresser}
                  onPointerEnter={(e) => {
                    if (e.pointerType !== "touch" && !joue) SONS.survol();
                  }}
                >
                  <Peinture toile={dossards[v]!} classe="course-dossard" />
                  <span class="course-portrait" aria-hidden="true">
                    <Peinture toile={portraits[v] ?? null} />
                  </span>
                  <span class="course-texte">
                    <span class="course-nom" aria-hidden="true">
                      {f?.nom ?? ""}
                    </span>
                    <span class="course-fois">
                      <Mots t={`${r.fois} fois`} couleur="encre" muet />
                    </span>
                    <span class="course-chance" aria-hidden="true">
                      une fois sur {r.fois}
                    </span>
                  </span>
                  {s.montant ? <JetonPose montant={s.montant} nouveau={s.nouveau} part={s.part} /> : null}
                </button>
              );
            })}
          </div>
        </div>
        <PanneauDuCroupier croupier={crou} classe="course-croupier" />
        <Pupitre pupitre={pup} action="Départ" nomAction="Donner le départ" surAction={() => void depart()} classe="course-pupitre" />
      </div>
      <details class="cas-pli cas-panneau jeu-n9 course-regles">
        <summary>
          <Pic nom="livre" />
          <Mots t="Les règles" />
          <span class="cas-chev">
            <Pic nom="chevron" />
          </span>
        </summary>
        <ul>
          <li>Six familiers courent. Un pari par course : vos jetons sur un seul couloir.</li>
          <li>Couloir 1 : paie 3 fois la mise, gagne une fois sur 3.</li>
          <li>Couloir 2 : paie 4 fois la mise, gagne une fois sur 4.</li>
          <li>Couloir 3 : paie 6 fois la mise, gagne une fois sur 6.</li>
          <li>Couloir 4 : paie 8 fois la mise, gagne une fois sur 8.</li>
          <li>Couloir 5 : paie 12 fois la mise, gagne une fois sur 12.</li>
          <li>Couloir 6 : paie 24 fois la mise, gagne une fois sur 24.</li>
          <li>Les gains comptent la mise. Seul le premier compte : les autres places ne paient pas.</li>
          <li>La rareté d'un familier ne change rien à ses chances : seul son couloir compte.</li>
          <li>200 statères au plus sur la table. Jetons de 10, 20, 50, 100 et 200.</li>
          <li>Le serveur tire le gagnant avant le départ ; la course ne fait que le montrer. Elle rend en moyenne exactement la mise.</li>
        </ul>
      </details>
    </div>
  );
}
