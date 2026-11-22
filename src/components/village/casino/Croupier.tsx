import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { medaillon, type Croupier as NomDuCroupier, type Visage } from "../../../lib/jeu/casino-dessins";
import { SONS } from "../../../lib/jeu/casino-sons";
import { nombreEcrit } from "../../../lib/jeu/ecriture";
import { niveauDuTour, noteDuNiveau, type NiveauDuTour } from "../../../lib/village/ecran-casino";
import { useJour } from "./commun";
import { Mots, Peinture } from "./Pieces";

/**
 * Le panneau du croupier (maquette « Le Palais d'or ») : un vrai Gaulois du clan dans un médaillon d'or, son annonce (lue
 * aux lecteurs d'écran), et la plaque du résultat, dont le chiffre saute. `useCroupier(nom)` rend de quoi le faire parler ;
 * `<PanneauDuCroupier croupier={…} />` le montre.
 */

/** La pierre de la plaque : rouge, bleue, verte, or ou feutre. */
export type TonDeLaPlaque = "rouge" | "bleue" | "verte" | "or" | "feutre";
/** Ce que montre la plaque : `signe` (texte court : « 17 », « 21 ») sur une pierre, ce qui revient (mise comprise) et la mise. */
export interface ResultatDuTour {
  signe?: string;
  ton?: TonDeLaPlaque;
  rendu: number;
  mise: number;
  /** Une note à la place de celle du niveau (« Rendus sur 110 misés », « Mise comprise »…). */
  note?: string;
}
interface EtatDuCroupier {
  titre: string;
  sous: string;
  visage: Visage;
  resultat: (ResultatDuTour & { niveau: NiveauDuTour }) | null;
  vu: boolean;
  /** Le numéro de la plaque : il change à chaque résultat, et le chiffre saute de nouveau. */
  tour: number;
}
export interface CroupierDuJeu {
  readonly nom: NomDuCroupier;
  readonly etat: EtatDuCroupier;
  /** L'annonce : un titre en or, une ligne douce dessous. */
  dit(titre: string, sous?: string): void;
  /** La même, avec le bruit du refus. */
  refus(titre: string, sous?: string): void;
  /** "" au repos, "Lance" (il lance), "Joie", "Bee" (ébahi), "Clin" (complice). */
  visage(v: Visage): void;
  /** Pose la plaque du résultat. Donner toujours `mise` : la plaque choisit son allure d'après le niveau du tour. */
  resultat(r: ResultatDuTour): void;
  /** Retire la plaque et remet le visage au repos. */
  efface(): void;
}

export function useCroupier(nom: NomDuCroupier): CroupierDuJeu {
  const [etat, setEtat] = useState<EtatDuCroupier>({ titre: "", sous: "", visage: "", resultat: null, vu: false, tour: 0 });
  const actions = useMemo(() => {
    const a = {
      dit: (titre: string, sous = ""): void => setEtat((e) => ({ ...e, titre, sous })),
      refus: (titre: string, sous = ""): void => {
        a.dit(titre, sous);
        SONS.refus();
      },
      visage: (v: Visage): void => setEtat((e) => ({ ...e, visage: v })),
      resultat: (r: ResultatDuTour): void => setEtat((e) => ({ ...e, resultat: { ...r, niveau: niveauDuTour(r.rendu, r.mise) }, vu: true, tour: e.tour + 1 })),
      efface: (): void => setEtat((e) => ({ ...e, vu: false, visage: "" })),
    };
    return a;
  }, []);
  return { nom, etat, ...actions };
}

/** Le panneau du croupier. Quand il fait moins de 700 pixels, la plaque passe sous l'annonce (`cas-croupier-etroit`). */
export function PanneauDuCroupier({ croupier, classe = "" }: { croupier: CroupierDuJeu; classe?: string }) {
  const j = useJour();
  const { nom, etat } = croupier;
  const portrait = useMemo(() => medaillon(nom, 23, j, etat.visage), [nom, j, etat.visage]);
  const ref = useRef<HTMLDivElement>(null);
  const [etroit, setEtroit] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setEtroit(el.clientWidth > 0 && el.clientWidth < 700));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  // Une nouvelle plaque monte de nouveau, et son chiffre saute : la classe est retirée, puis remise après un calcul de la page.
  const plaque = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = plaque.current;
    if (!el || !etat.tour || !etat.vu) return;
    el.classList.remove("cas-vu");
    void el.offsetWidth;
    el.classList.add("cas-vu");
  }, [etat.tour]);
  const r = etat.resultat;
  const gagne = r !== null && (r.niveau === "gain" || r.niveau === "grand");
  return (
    <div class={`jeu-n9 cas-panneau cas-croupier ${etroit ? "cas-croupier-etroit" : ""} ${classe}`} ref={ref}>
      <Peinture toile={portrait} classe="cas-medaillon" titre="Le croupier, un Gaulois" />
      <div class="cas-dit">
        <span class="cas-annonce">{etat.titre && <Mots t={etat.titre} couleur="or" p={3} muet plie />}</span>
        <span class="cas-sous">{etat.sous && <Mots t={etat.sous} couleur="doux" muet plie />}</span>
        <span class="sr-only" aria-live="polite">
          {etat.titre + (etat.sous ? `. ${etat.sous}` : "")}
        </span>
      </div>
      <div class={`cas-resultat ${etat.vu ? "cas-vu" : ""}`} data-niveau={r?.niveau} ref={plaque}>
        {r && r.signe ? (
          <span class={`cas-signe cas-gemme cas-${r.ton ?? "feutre"} jeu-n9`}>
            <Mots t={r.signe} couleur="creme" p={4} muet />
          </span>
        ) : null}
        {r && (
          <div class="cas-gain">
            <span class="cas-gain-n">
              <Mots t={gagne ? `+${nombreEcrit(r.rendu)}` : nombreEcrit(r.rendu)} couleur={gagne ? "or" : r.niveau === "perdu" ? "doux" : "texte"} p={4} muet />
            </span>
            <span class="cas-gain-note">
              <Mots t={r.note ?? noteDuNiveau(r.niveau, r.mise)} couleur="doux" muet plie />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
