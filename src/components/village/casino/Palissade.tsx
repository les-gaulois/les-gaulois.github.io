import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { ServerError, casino as appels } from "../../../lib/compte/api";
import type { Visage } from "../../../lib/jeu/casino-dessins";
import {
  ARGENT,
  BOIS,
  ORDRE_DES_RANGS,
  RANGS_DES_COUPES,
  SONS_DE_LA_PALISSADE,
  SceneDeLaPalissade,
  bourseDesLachers,
  chancesDuRang,
  dixiemesDe,
  enPhrase,
  mesurerLaPalissade,
  placesDesLachers,
  type DixiemesDUneCoupe,
  type Volee,
} from "../../../lib/jeu/casino-palissade";
import { SONS } from "../../../lib/jeu/casino-sons";
import { JETONS, caseGemme, jeton, type ValeurDeJeton } from "../../../lib/jeu/casino-toile";
import { nombreEcrit } from "../../../lib/jeu/ecriture";
import type { CoupDeLaPalissade } from "../../../lib/village/contrat-casino";
import { motsDuRefus, refusDuJeton } from "../../../lib/village/ecran-casino";
import { anime, annoncerLeSolde, montrer, sansMouvement, useJour, useLargeurDuJeu } from "./commun";
import { useCasino } from "./contexte";
import { PanneauDuCroupier, useCroupier, type TonDeLaPlaque } from "./Croupier";
import { FABRIQUE_DE_LA_PAGE, urlDeLaToile } from "./images";
import { Bouton, Mots, Peinture, Pic } from "./Pieces";

/**
 * La palissade (maquette « Le Palais d'or » de Claude Fable 5.2, validée par le pilote le 22 novembre 2026, portée telle
 * quelle) : un statère d'or lâché du haut tombe de pieu en pieu jusqu'à l'une des neuf coupes. Un lâcher : le serveur prend
 * le jeton et tire le chemin (`jouer_palissade`), puis la chute le suit, rebond après rebond, et le casino rend ce que paie
 * la coupe. Plusieurs statères peuvent tomber à la suite : ce qui tombe compte « sur la table », 200 au plus. Dessins, chute
 * et sons : `src/lib/jeu/casino-palissade.ts`.
 */

const REPOS: [string, string] = ["Lâchez un statère", "Choisissez un jeton, puis lâchez-le"];
const AIDE_DE_LA_SCENE =
  "La palissade : huit rangées de pieux à tête d'or au-dessus de neuf coupes. De gauche à droite, elles paient 19 fois la mise, 4 fois, une fois et demie, la moitié, le cinquième, la moitié, une fois et demie, 4 fois, 19 fois.";

/** La plaque d'un rang : sa pierre, son chiffre (les plaques d'argent et de bois sont peintes par l'écran, `--pal-s-*`). */
function Gemme({ d, classe = "" }: { d: DixiemesDUneCoupe; classe?: string }) {
  const r = RANGS_DES_COUPES[d];
  return (
    <span class={`cas-gemme cas-${r.cle} jeu-n9 ${classe}`} aria-hidden="true">
      <Mots t={r.signe} couleur="creme" muet />
    </span>
  );
}

export default function LaPalissade() {
  const casino = useCasino();
  const crou = useCroupier("palissade");
  const racine = useRef<HTMLDivElement>(null);
  const salle = useRef<HTMLDivElement>(null);
  const sceneEl = useRef<HTMLDivElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);
  const pupitre = useRef<HTMLDivElement>(null);
  const W = useLargeurDuJeu(racine);
  const jour = useJour();
  const { limites } = casino;

  const [mise, setMise] = useState<ValeurDeJeton>(10);
  const [enVol, setEnVol] = useState(0);
  const [gagne, setGagne] = useState(false);
  const [derniere, setDerniere] = useState<DixiemesDUneCoupe | null>(null);
  // Vos lâchers : les dernières coupes de ce compte, lues au serveur, puis celles de cette visite.
  const [laches, setLaches] = useState<DixiemesDUneCoupe[]>(() =>
    casino.etat.parties
      .map((p) => (p.resume.jeu === "palissade" && Number.isInteger(p.resume.coupe) && p.resume.coupe >= 0 && p.resume.coupe <= 8 ? dixiemesDe(p.resume.coupe) : null))
      .filter((d): d is DixiemesDUneCoupe => d !== null)
      .slice(0, 10),
  );
  const [rayon, setRayon] = useState(13);

  /** Ce qui tombe : les coups du serveur pas encore arrivés dans leur coupe, le dernier coup, ce qui est en train de tomber. */
  const etat = useRef({
    attente: false,
    dernierLacher: 0,
    monte: true,
    actif: false,
    stop: () => undefined as void,
    enRoute: [] as CoupDeLaPalissade[],
    dernier: null as CoupDeLaPalissade | null,
    enVol: 0,
    mise: 10 as ValeurDeJeton,
    retourVisage: 0 as ReturnType<typeof setTimeout> | 0,
  });
  etat.current.mise = mise;
  // Les gestes du moment, lus par la scène (créée une fois) et par les minuteries.
  const gestes = useRef<{ rendre: (v: Volee<CoupDeLaPalissade>) => number }>({ rendre: () => 0 });
  const scene = useRef<SceneDeLaPalissade<CoupDeLaPalissade> | null>(null);
  scene.current ??= new SceneDeLaPalissade<CoupDeLaPalissade>(Math.max(W, 310), FABRIQUE_DE_LA_PAGE, (v) => gestes.current.rendre(v), { sansMouvement });

  const dessiner = (): void => {
    const g = toile.current?.getContext("2d");
    if (g) scene.current!.dessiner(g);
  };
  /** Réveille la boucle : elle tourne tant que quelque chose bouge, puis s'arrête d'elle-même. */
  const reveiller = (): void => {
    const b = etat.current;
    if (b.actif) return;
    b.actif = true;
    let avant = 0;
    b.stop = anime((t) => {
      if (!b.monte) {
        b.actif = false;
        return false;
      }
      const dt = avant ? Math.min(0.05, (t - avant) / 1000) : 0.016;
      avant = t;
      const encore = scene.current!.pas(dt);
      dessiner();
      if (!encore) {
        b.actif = false;
        return false;
      }
    });
  };
  /** Le visage du croupier (son médaillon et son corps dans la scène), qui revient au repos tout seul. */
  const visage = (v: Visage, duree = 2600): void => {
    const b = etat.current;
    scene.current!.visage(v);
    crou.visage(v);
    if (!b.actif) dessiner();
    if (b.retourVisage) clearTimeout(b.retourVisage);
    b.retourVisage = setTimeout(() => {
      if (!b.monte) return;
      scene.current!.visage("");
      crou.visage("");
      if (!b.actif) dessiner();
    }, duree);
  };
  const refus = (titre: string, sous: string): void => {
    crou.dit(titre, sous);
    SONS.refus();
  };

  /* --- La scène à la largeur de la table, au thème du jour ; les plaques d'argent et de bois --- */
  const places = W >= 120 ? placesDesLachers(W, mesurerLaPalissade(W).BW * 2) : 10;
  useLayoutEffect(() => {
    const cv = toile.current;
    if (!cv || W < 120) return;
    const sc = scene.current!;
    sc.preparer(W, jour);
    const G = sc.G;
    cv.width = G.BW;
    cv.height = G.H;
    cv.style.width = G.BW * 2 + "px";
    cv.style.height = G.H * 2 + "px";
    salle.current?.style.setProperty("--dp", G.BW * 2 + "px");
    dessiner();
  }, [W, jour]);
  useLayoutEffect(() => {
    const el = racine.current;
    if (!el) return;
    el.style.setProperty("--pal-s-argent", urlDeLaToile(caseGemme(ARGENT, 0)));
    el.style.setProperty("--pal-s-bois", urlDeLaToile(caseGemme(BOIS, 0)));
  }, []);
  // Les jetons du pupitre, à sa largeur : 13 points de rayon, 11 quand cinq ne tiendraient pas.
  useEffect(() => {
    const el = pupitre.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setRayon(!el.clientWidth || el.clientWidth >= 330 ? 13 : 11));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const jetons = useMemo(() => JETONS.map((v) => jeton(v, rayon)), [rayon]);

  useEffect(() => {
    crou.dit(...REPOS);
    return () => {
      // On quitte la palissade pendant que des statères tombent : chacun se finit sans mouvement (la bourse reçoit son solde,
      // les parties s'inscrivent).
      const b = etat.current;
      b.monte = false;
      b.stop();
      if (b.retourVisage) clearTimeout(b.retourVisage);
      const dernier = b.dernier;
      for (const coup of b.enRoute.splice(0)) casino.finDeTour({ coup: dernier ? { ...coup, solde_apres: bourseDesLachers(dernier, b.enRoute), mise_du_jour: dernier.mise_du_jour, reste_du_jour: dernier.reste_du_jour } : coup, muet: true });
    };
  }, []);

  /* --- La fin d'un lâcher : le casino rend ce que paie la coupe, le croupier l'annonce --- */
  gestes.current.rendre = (v: Volee<CoupDeLaPalissade>): number => {
    const b = etat.current;
    const coup = v.coup;
    const i = b.enRoute.indexOf(coup);
    if (i < 0) return coup.rendu;
    b.enRoute.splice(i, 1);
    b.enVol -= coup.mise;
    setEnVol(b.enVol);
    const d = dixiemesDe(coup.coupe);
    const rg = RANGS_DES_COUPES[d];
    const dernier = b.dernier ?? coup;
    // La barre reçoit la bourse sans les gains des statères qui tombent encore ; le reste du jour est celui du dernier coup.
    const montre = { ...coup, solde_apres: bourseDesLachers(dernier, b.enRoute), mise_du_jour: dernier.mise_du_jour, reste_du_jour: dernier.reste_du_jour };
    // Le son du niveau vient du commun ; seuls le cor des 4 fois et les trois statères de la fois et demie sont d'ici.
    const niv = casino.finDeTour({ coup: montre, grand: d === 190, scene: d === 190 ? sceneEl.current : null, muet: d === 40 || d === 15 });
    crou.dit(rg.court, niv === "partiel" ? `Rendu : ${nombreEcrit(coup.rendu)} sur ${nombreEcrit(coup.mise)} lâchés` : `Rendu : ${nombreEcrit(coup.rendu)} statères`);
    // Les plaques d'argent et de bois du croupier sont celles de l'écran (`--pal-s-*`, posées sur la racine du jeu).
    crou.resultat({ signe: rg.signe, ton: rg.cle as TonDeLaPlaque, rendu: coup.rendu, mise: coup.mise });
    setLaches((l) => [d, ...l].slice(0, 10));
    setDerniere(d);
    if (d === 190) {
      visage("Bee", 6000);
      setGagne(true);
    } else if (d === 40) {
      SONS_DE_LA_PALISSADE.cor();
      visage("Joie", 3200);
      setGagne(true);
    } else if (d === 15) {
      SONS_DE_LA_PALISSADE.troisPieces();
      visage("Joie");
    } else visage(niv === "perdu" ? "Clin" : "", 1800);
    return coup.rendu;
  };

  /* --- Un lâcher : le serveur prend le jeton et tire le chemin, la chute le montre --- */
  async function lacher(): Promise<void> {
    const b = etat.current;
    const t = performance.now();
    if (b.attente || t - b.dernierLacher < 300) return;
    const m = b.mise;
    if (b.enVol + m > limites.plafond) return refus(b.enVol ? "Un instant" : REPOS[0], `${limites.plafond} au plus sur la table`);
    // La table compte ce qui tombe ; la bourse et le reste du jour ont déjà perdu les jetons lâchés.
    const reste = b.dernier && b.enRoute.length ? Math.min(limites.reste ?? Infinity, b.dernier.reste_du_jour) : limites.reste;
    const r = refusDuJeton(0, m, { ...limites, reste });
    if (r) return refus(...motsDuRefus(r, reste ?? undefined));
    b.attente = true;
    b.dernierLacher = t;
    let coup: CoupDeLaPalissade;
    try {
      coup = await appels.palissade(m);
    } catch (err) {
      b.attente = false;
      return refus(...motsDuRefus(err instanceof ServerError ? err.code : "network", reste ?? undefined));
    }
    b.attente = false;
    // La palissade a été quittée pendant que le serveur répondait : le lâcher se finit sans un son ni un mouvement.
    if (!b.monte) {
      casino.finDeTour({ coup, muet: true });
      return;
    }
    const premier = b.enRoute.length === 0;
    b.enRoute.push(coup);
    b.dernier = coup;
    b.enVol += m;
    setEnVol(b.enVol);
    if (!coup.god) annoncerLeSolde(bourseDesLachers(coup, b.enRoute));
    if (premier && W < 760) montrer(salle.current);
    if (premier) crou.efface();
    setGagne(false);
    crou.dit("Le statère tombe", `${m} statères lâchés`);
    visage("Lance", 700);
    // Pause ou mouvement réduit : le résultat est posé.
    if (sansMouvement()) {
      setTimeout(() => {
        if (!b.monte) return;
        scene.current!.poserUnStatere(coup.chemin, coup.coupe, m, coup);
        dessiner();
      }, 350);
      return;
    }
    SONS_DE_LA_PALISSADE.lancer();
    scene.current!.lancer(coup.chemin, coup.coupe, m, coup);
    reveiller();
  }

  return (
    <div class="cas-jeu pal-jeu" ref={racine}>
      <div class="pal-salle" ref={salle}>
        <section class="pal-cote" aria-label="Le panneau">
          <div class={`pal-scene ${gagne ? "pal-gagne" : ""}`} ref={sceneEl} role="img" aria-label={AIDE_DE_LA_SCENE} onClick={() => void lacher()}>
            <i class="pal-halo" />
            <canvas ref={toile} class="pal-toile" />
          </div>
          <div class="pal-laches">
            <Mots t="Vos lâchers" couleur="doux" />
            <span class="pal-liste" role="list" aria-label="Vos derniers lâchers">
              {laches.slice(0, places).map((d, i) => (
                <span key={`${i}-${d}`} role="listitem" aria-label={enPhrase(RANGS_DES_COUPES[d].mots)}>
                  <Gemme d={d} />
                </span>
              ))}
              {Array.from({ length: Math.max(0, places - Math.min(places, laches.length)) }, (_, i) => (
                <span key={`v${i}`} class="cas-gemme jeu-n9 pal-vide" aria-hidden="true" />
              ))}
            </span>
          </div>
        </section>
        <PanneauDuCroupier croupier={crou} classe="pal-croupier" />
        <div class={`cas-pupitre cas-panneau jeu-n9 pal-pupitre ${rayon === 11 ? "cas-pupitre-etroit" : ""}`} ref={pupitre}>
          <div class="cas-jetons" role="group" aria-label="Choisir un jeton">
            {JETONS.map((v, i) => (
              <button
                key={v}
                class="cas-jeton"
                type="button"
                aria-pressed={mise === v}
                aria-label={`Jeton de ${v} statères`}
                title={`Jeton de ${v}`}
                onClick={() => {
                  setMise(v);
                  SONS.jeton(i);
                }}
              >
                <Peinture toile={jetons[i]!} />
              </button>
            ))}
          </div>
          <div class="cas-compte">
            <Mots t="Sur la table" couleur="doux" />
            <span class="cas-total">
              <Mots t={`${enVol} sur ${limites.plafond}`} couleur="or" p={3} dit={`${enVol} statères sur ${limites.plafond}`} />
            </span>
          </div>
          <div class="cas-gestes">
            <Bouton ton="or" mot="Lâcher" nom={`Lâcher un statère de ${mise}`} classe="cas-action" onClick={() => void lacher()} />
          </div>
        </div>
        <div class="pal-coupes cas-panneau jeu-n9" role="group" aria-label="Ce que paient les coupes">
          <div class="pal-coupes-titre">
            <Pic nom="piece" />
            <Mots t="Les coupes" />
          </div>
          <div class="pal-rangs">
            {ORDRE_DES_RANGS.map((d) => {
              const r = RANGS_DES_COUPES[d];
              const n = chancesDuRang(d);
              return (
                <div key={d} class="pal-rang">
                  <span class={`cas-halo ${derniere === d ? "cas-sorti" : ""}`}>
                    <Gemme d={d} />
                  </span>
                  <span class="pal-rang-mots">
                    <Mots t={r.court} couleur="texte" dit={enPhrase(r.mots)} />
                    <Mots t={`${n} sur 256`} couleur="doux" dit={`${n} chances sur 256`} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <details class="cas-pli cas-panneau jeu-n9 pal-regles">
        <summary>
          <Pic nom="livre" />
          <Mots t="Les règles" />
          <span class="cas-chev">
            <Pic nom="chevron" />
          </span>
        </summary>
        <ul>
          <li>Choisissez un jeton de 10, 20, 50, 100 ou 200 statères, puis lâchez-le. Vous pouvez en lâcher plusieurs à la suite, tant qu'il n'y a pas plus de 200 statères en train de tomber.</li>
          <li>Huit rangées de pieux : à chaque pieu, le statère part à gauche ou à droite, une chance sur deux.</li>
          <li>Les neuf coupes paient, mise comprise, de gauche à droite : 19 fois la mise, 4 fois, une fois et demie, la moitié, le cinquième, la moitié, une fois et demie, 4 fois, 19 fois.</li>
          <li>Sur 256 lâchers, le statère tombe en moyenne 1 fois, 8 fois, 28 fois, 56 fois, 70 fois, 56 fois, 28 fois, 8 fois et 1 fois dans chacune, de gauche à droite.</li>
          <li>La palissade rend en moyenne exactement la mise : elle ne crée aucun statère.</li>
          <li>Le chemin est tiré avant la chute : l'animation ne change jamais le résultat.</li>
        </ul>
      </details>
    </div>
  );
}
