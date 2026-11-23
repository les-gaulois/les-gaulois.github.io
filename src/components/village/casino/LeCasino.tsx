import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { vignette } from "../../../lib/jeu/casino-hall";
import { SONS } from "../../../lib/jeu/casino-sons";
import { pair } from "../../../lib/jeu/casino-toile";
import type { CoupDuCasino, EtatDuCasino, JeuDuCasino, PartieDuCasino } from "../../../lib/village/contrat-casino";
import { jeuDuHall, resumeDuCoup, type LimitesDuPupitre } from "../../../lib/village/ecran-casino";
import { Etiquette } from "../../jeu/Pixels";
import { useBourse, useEveilDuSon, useJour } from "./commun";
import { ContexteDuCasino, gestesDeFinDeTour, type Casino } from "./contexte";
import { Hall } from "./Hall";
import { Bouton, Mots, Peinture } from "./Pieces";
import LesDes from "./Des";
import LaMachine from "./Machine";
import LaRoue from "./Roue";
import LaCourse from "./Course";
import LaPalissade from "./Palissade";
import LeVingtEtUn from "./VingtEtUn";

/**
 * « Le casino » de « Mon Gaulois » (`/village#casino`, 22 novembre 2026, direction « Le Palais d'or » validée par le pilote,
 * maquette de Claude Fable 5.2 portée telle quelle) : la salle du palais, son enseigne, le hall, et le jeu ouvert à la place
 * du hall. La bourse est celle de la barre du jeu ; le serveur tire tout (`contrat-casino.ts`).
 *
 * Les jeux sont des composants posés dans `JEUX_OUVERTS` ; un jeu qui n'y est pas encore montre « Bientôt ». Mode d'emploi
 * pour en ajouter un : « Le casino du jeu » de docs/DESIGN.md.
 */
const JEUX_OUVERTS: Partial<Record<JeuDuCasino, () => preact.JSX.Element>> = {
  roue: LaRoue,
  machine: LaMachine,
  des: LesDes,
  course: LaCourse,
  palissade: LaPalissade,
  "vingt-et-un": LeVingtEtUn,
};

const PRETS: ReadonlySet<JeuDuCasino> = new Set(Object.keys(JEUX_OUVERTS) as JeuDuCasino[]);

/** « Bientôt » : un jeu du hall qui n'est pas encore à la table. */
function Bientot({ id, retour }: { id: JeuDuCasino; retour: () => void }) {
  const j = useJour();
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setW(Math.min(520, pair(el.clientWidth - 8)));
  }, []);
  const h = pair(w * 0.54);
  const toile = useMemo(() => (w ? vignette(id, w / 2, h / 2, j) : null), [id, w, h, j]);
  return (
    <div class="cas-bientot" ref={ref}>
      <span class="cas-cadre" style="display:block;line-height:0">
        <Peinture toile={toile} />
      </span>
      <h4 class="cas-titre">{jeuDuHall(id).nom}</h4>
      <Mots t="Bientôt" couleur="or" p={3} />
      <Bouton ton="or" mot="Retour au hall" classe="cas-btn-large" onClick={retour} />
    </div>
  );
}

export default function LeCasino({ etatDuServeur, relire }: { etatDuServeur: EtatDuCasino; relire: () => void }) {
  useEveilDuSon();
  const [etat, setEtat] = useState(etatDuServeur);
  useEffect(() => setEtat(etatDuServeur), [etatDuServeur]);
  const bourse = useBourse(etat.solde);
  const [ouvert, setOuvert] = useState<JeuDuCasino | null>(null);
  const salle = useRef<HTMLElement>(null);
  const dernierOuvert = useRef<JeuDuCasino | null>(null);

  const ouvrir = (id: JeuDuCasino): void => {
    SONS.entree();
    dernierOuvert.current = id;
    setOuvert(id);
  };
  const fermer = (): void => {
    setOuvert(null);
    // Le hall relit le serveur : « Vos dernières parties » et le reste du jour sont ceux du serveur.
    relire();
  };
  // Échap ramène au hall, comme le bouton de retour.
  useEffect(() => {
    if (!ouvert) return;
    const echap = (e: KeyboardEvent): void => {
      if (e.key === "Escape") fermer();
    };
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [ouvert]);
  // Le jeu ouvert : le focus va au retour ; revenu au hall, il retourne à la vignette du jeu quitté.
  useLayoutEffect(() => {
    const el = salle.current;
    if (!el) return;
    el.classList.remove("cas-monte");
    void el.offsetWidth;
    el.classList.add("cas-monte");
    if (ouvert) {
      window.scrollTo(0, 0);
      el.querySelector<HTMLElement>(".cas-retour")?.focus({ preventScroll: true });
    } else if (dernierOuvert.current) el.querySelector<HTMLElement>(`.cas-vignette[data-jeu="${dernierOuvert.current}"]`)?.focus({ preventScroll: true });
  }, [ouvert]);

  const casino = useMemo((): Casino => {
    const limites: LimitesDuPupitre = { plafond: etat.mise_au_plus, bourse, reste: etat.reste_du_jour, god: etat.god };
    const surCoup = (coup: CoupDuCasino): void => {
      const resume = resumeDuCoup(coup as CoupDuCasino & Record<string, unknown>);
      setEtat((e) => {
        const partie: PartieDuCasino | null = resume ? { partie: coup.partie, jeu: coup.jeu, mise: coup.mise, rendu: coup.rendu, god: coup.god, le: new Date().toISOString(), resume } : null;
        return { ...e, mise_du_jour: coup.mise_du_jour, reste_du_jour: coup.reste_du_jour, parties: partie ? [partie, ...e.parties.filter((p) => p.partie !== coup.partie)].slice(0, 10) : e.parties };
      });
    };
    return { etat, bourse, limites, retour: fermer, ...gestesDeFinDeTour(surCoup) };
  }, [etat, bourse]);

  const jeu = ouvert ? jeuDuHall(ouvert) : null;
  const Jeu = ouvert ? JEUX_OUVERTS[ouvert] : undefined;
  return (
    <ContexteDuCasino.Provider value={casino}>
      <section class="jeu-ecran jeu-n9 cas-ecran cas-salle casino-jeu" aria-labelledby="cas-enseigne" ref={salle} data-testid="casino">
        <h3 class="jeu-ruban cas-ruban jeu-n9 cas-enseigne" id="cas-enseigne">
          <Mots t={jeu ? jeu.nom : "Le casino"} couleur="creme" relief="cerne" />
        </h3>
        {!jeu && <Hall etat={etat} prets={PRETS} ouvrir={ouvrir} />}
        {jeu && (
          <div class="cas-table">
            <div class="cas-table-tete">
              <Bouton icone="retour" nom="Retour au hall du casino" classe="cas-retour" onClick={fermer} />
              <Etiquette t={jeu.rend} ton="or" dit={jeu.rend} />
              {etat.god && <Etiquette t="Essai" ton="rouge" dit="Essai : rien n'est misé ni rendu" />}
            </div>
            {Jeu ? <Jeu /> : <Bientot id={jeu.id} retour={fermer} />}
          </div>
        )}
      </section>
    </ContexteDuCasino.Provider>
  );
}
