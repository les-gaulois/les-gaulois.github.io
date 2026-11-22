import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { medaillon, portraitEnPied } from "../../../lib/jeu/casino-dessins";
import { banniere, placeDeLaRoue, vignette } from "../../../lib/jeu/casino-hall";
import { SONS } from "../../../lib/jeu/casino-sons";
import { pair } from "../../../lib/jeu/casino-toile";
import { nombreEcrit } from "../../../lib/jeu/ecriture";
import type { EtatDuCasino, JeuDuCasino } from "../../../lib/village/contrat-casino";
import { CATEGORIES_DU_CASINO, JEUX_DU_HALL, jeuDuHall, jeuxDeLaCategorie, netDeLaPartie, resumeDeLaPartie, type CategorieDuCasino, type JeuDuHall } from "../../../lib/village/ecran-casino";
import { Etiquette } from "../../jeu/Pixels";
import { useJour } from "./commun";
import { Bouton, Mots, Peinture, Pic } from "./Pieces";

/**
 * Le hall du Palais d'or (maquette de Claude Fable 5.2, validée par le pilote le 22 novembre 2026) : les catégories, la
 * bannière « À l'affiche », les vignettes des six jeux avec leur croupier et leur rendement, « Vos dernières parties » (les
 * six plus récentes du compte, lues au serveur), le jeu juste et les règles en pli. Chaque peinture est refaite à la taille de sa
 * place, en points entiers, et au thème du moment.
 */

/** La largeur d'un élément, suivie. */
function useLargeur(ref: { current: HTMLElement | null }): number {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setW(el.clientWidth));
    obs.observe(el);
    setW(el.clientWidth);
    return () => obs.disconnect();
  }, [ref]);
  return w;
}
/** La largeur de la fenêtre, suivie : le hall règle la hauteur de sa bannière sur elle, comme la maquette. */
function useFenetre(): number {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1440 : document.documentElement.clientWidth));
  useLayoutEffect(() => {
    const lire = (): void => setW(document.documentElement.clientWidth);
    window.addEventListener("resize", lire);
    return () => window.removeEventListener("resize", lire);
  }, []);
  return w;
}

/**
 * La bannière « À l'affiche » : la roue du charron, la grande roue peinte sur sa table, son croupier en pied. `largeur` :
 * celle du hall, la même que la grille des jeux.
 */
function Affiche({ largeur, ouvrir }: { largeur: number; ouvrir: (id: JeuDuCasino) => void }) {
  const j = useJour();
  const W = useFenetre();
  const etroit = W < 768;
  const cw = largeur ? pair(largeur) : 0;
  const hh = etroit ? 200 : W < 1280 ? 280 : 320;
  const toile = useMemo(() => (cw ? banniere(cw / 2, hh / 2, j, etroit) : null), [cw, hh, j, etroit]);
  const portrait = useMemo(() => portraitEnPied("roue", j), [j]);
  const { rx, R } = placeDeLaRoue(cw / 2, hh / 2, etroit);
  const cache = etroit || cw < 1180;
  return (
    <div class="cas-affiche cas-cadre" style={cw ? `width:${cw}px;--course:${cw + 160}px` : undefined}>
      <Peinture toile={toile} />
      <i class="cas-reflet cas-decor" style="--d:2s" />
      {!cache && <Peinture toile={portrait} classe="cas-affiche-portrait" titre="Le croupier de la roue, un Gaulois" style={`left:${pair((rx - R * 1.9 - portrait.w * 0.55) * 2)}px;top:${pair(hh * 0.22)}px`} />}
      <div class="cas-affiche-texte">
        <Etiquette t="À l'affiche" ton="or" dit="À l'affiche" />
        <h4 class="cas-titre">La roue du charron</h4>
        <div class="cas-affiche-ligne">
          <Mots t="36 cases, pas de zéro" plie />
          <Mots t="Rend 100 %" couleur="or" />
        </div>
        <Bouton ton="or" mot="Jouer" nom="Jouer à la roue du charron" classe="cas-btn-large" onClick={() => ouvrir("roue")} />
      </div>
    </div>
  );
}

/** La vignette d'un jeu : sa peinture dans un cadre d'or, son croupier en médaillon, son nom et ce qu'il rend. */
function Vignette({ jeu, k, ouvert, ouvrir }: { jeu: JeuDuHall; k: number; ouvert: boolean; ouvrir: (id: JeuDuCasino) => void }) {
  const j = useJour();
  const ref = useRef<HTMLButtonElement>(null);
  const largeur = useLargeur(ref);
  const tw = largeur ? pair(largeur) : 0;
  const th = pair(tw * 0.54);
  const toile = useMemo(() => (tw ? vignette(jeu.id, tw / 2, th / 2, j) : null), [jeu.id, tw, th, j]);
  const med = useMemo(() => medaillon(jeu.croupier, 19, j), [jeu.croupier, j]);
  return (
    <button
      class="cas-vignette jeu-n9 cas-panneau"
      type="button"
      ref={ref}
      data-jeu={jeu.id}
      aria-label={`${jeu.nom}. ${ouvert ? jeu.rend : "Bientôt"}.`}
      style={tw ? `--th:${th}px;--course:${tw + 160}px` : undefined}
      onClick={() => ouvrir(jeu.id)}
      onPointerEnter={() => SONS.survol()}
    >
      <span class="cas-image cas-cadre" style={tw ? `width:${tw}px` : undefined}>
        <Peinture toile={toile} classe="cas-vig" />
        <i class="cas-reflet cas-decor" style={`--d:${4 + k * 1.3}s`} />
      </span>
      {!ouvert && (
        <span class="cas-etat">
          <Etiquette t="Bientôt" ton="bleu" />
        </span>
      )}
      <Peinture toile={med} classe="cas-med" titre="Le croupier, un Gaulois" />
      <span class="cas-pied">
        <Mots t={jeu.nom} plie muet />
        <span class="cas-rend">
          <Pic nom="balance" />
          <Mots t={jeu.rend} couleur="or" plie muet />
        </span>
      </span>
    </button>
  );
}

/** La ligne du jour, sous les règles : ce qui empêche de jouer s'il y a quelque chose, sinon ce qui a été misé aujourd'hui. */
function etatDuJour(etat: EtatDuCasino): string {
  if (!etat.ouvert) return "Le casino est fermé pour l'instant";
  if (!etat.peut_jouer) return "Votre compte attend sa validation";
  if (etat.god) return "Essai : rien n'est misé";
  return `Misé aujourd'hui : ${nombreEcrit(etat.mise_du_jour)} sur ${nombreEcrit(etat.plafond)}`;
}

/** « Vos dernières parties » : les six plus récentes du compte, lues au serveur, avec leur mise, leur rendu et leur solde. */
function Parties({ etat }: { etat: EtatDuCasino }) {
  const j = useJour();
  const lignes = etat.parties.slice(0, 6);
  return (
    <ul class="cas-parties">
      {lignes.map((p) => {
        const jeu = jeuDuHall(p.jeu);
        const net = netDeLaPartie(p.mise, p.rendu);
        const resume = resumeDeLaPartie(p.resume);
        return (
          <li key={p.partie}>
            <Peinture toile={medaillon(jeu.croupier, 15, j)} />
            <span class="cas-col">
              <Mots t={jeu.nom} plie />
              {(resume || p.god) && <Mots t={p.god ? `Essai${resume ? ` : ${resume}` : ""}` : resume} couleur="doux" plie />}
            </span>
            <span class="cas-col cas-mi">
              <Mots t="Mise" couleur="doux" />
              <Mots t={nombreEcrit(p.mise)} />
            </span>
            <span class="cas-col cas-re">
              <Mots t="Rendu" couleur="doux" />
              <Mots t={nombreEcrit(p.rendu)} />
            </span>
            <span class="cas-net">
              <Mots t={net.texte} couleur={net.gagne ? "or" : "doux"} p={3} dit={net.dit} />
            </span>
          </li>
        );
      })}
      {!lignes.length && (
        <li class="cas-vide">
          <Peinture toile={medaillon("roue", 15, j)} />
          <span class="cas-col" style="grid-column:2 / -1">
            <Mots t="Vos parties s'inscrivent ici" plie />
          </span>
        </li>
      )}
    </ul>
  );
}

/**
 * Le hall. `prets` : les jeux déjà à la table (les autres ont « Bientôt » sur leur vignette et y mènent quand même, à leur
 * peinture).
 */
export function Hall({ etat, prets, ouvrir }: { etat: EtatDuCasino; prets: ReadonlySet<JeuDuCasino>; ouvrir: (id: JeuDuCasino) => void }) {
  const [cat, setCat] = useState<CategorieDuCasino>("tout");
  const grilleRef = useRef<HTMLDivElement>(null);
  const largeur = useLargeur(grilleRef);
  const cols = largeur >= 980 ? 3 : largeur >= 600 ? 2 : 1;
  const visibles = jeuxDeLaCategorie(cat);
  return (
    <div class="cas-hall">
      <nav class="cas-cats" aria-label="Catégories de jeux">
        {CATEGORIES_DU_CASINO.map((c) => {
          const n = jeuxDeLaCategorie(c.id).length;
          return (
            <button key={c.id} type="button" class="jeu-btn jeu-n9 cas-btn-bordeaux cas-cat" aria-pressed={c.id === cat} aria-label={`${c.nom}, ${n} ${n > 1 ? "jeux" : "jeu"}`} onClick={() => setCat(c.id)}>
              <Pic nom={c.icone} />
              <Mots t={`${c.nom} ${n}`} couleur="creme" relief="cerne" muet classe="cas-mot-bordeaux" />
              <Mots t={`${c.nom} ${n}`} couleur="encre" muet classe="cas-mot-or" />
            </button>
          );
        })}
      </nav>
      <Affiche largeur={largeur} ouvrir={ouvrir} />
      <div class="cas-rang">
        <span class="jeu-ruban jeu-ruban-bleu jeu-n9">
          <Mots t="Les jeux" couleur="creme" relief="cerne" />
        </span>
        <span class="cas-trait" />
        <span>
          <Mots t={`${visibles.length} ${visibles.length > 1 ? "jeux" : "jeu"}`} couleur="doux" />
        </span>
      </div>
      <div class="cas-grille" ref={grilleRef} style={`--cols:${cols}`}>
        {JEUX_DU_HALL.map((jeu, k) => (visibles.includes(jeu) ? <Vignette key={jeu.id} jeu={jeu} k={k} ouvert={prets.has(jeu.id)} ouvrir={ouvrir} /> : null))}
      </div>
      <div class="cas-bas">
        <section class="jeu-n9 cas-panneau cas-bloc" aria-labelledby="cas-r-parties">
          <h4 class="jeu-ruban jeu-ruban-bleu jeu-n9 cas-ruban-bloc" id="cas-r-parties">
            <Mots t="Vos dernières parties" couleur="creme" relief="cerne" />
          </h4>
          <Parties etat={etat} />
        </section>
        <div class="cas-colonne">
          <ul class="jeu-n9 cas-panneau cas-juste" aria-label="Le jeu juste">
            {(
              [
                ["bouclier", "Le serveur tire d'abord"],
                ["balance", "Les jeux rendent la mise en moyenne"],
                ["piece", "Des statères, rien d'autre"],
              ] as const
            ).map(([ic, t]) => (
              <li key={ic}>
                <Pic nom={ic} />
                <Mots t={t} plie />
              </li>
            ))}
          </ul>
          <details class="cas-pli jeu-n9 cas-panneau">
            <summary>
              <Pic nom="livre" />
              <Mots t="Les règles du casino" plie />
              <span class="cas-chev">
                <Pic nom="chevron" />
              </span>
            </summary>
            <ul>
              <li>On joue en statères, gagnés avec le clan. Ils ne s'achètent pas et ne se retirent pas.</li>
              <li>Chaque jeu rend en moyenne exactement la mise. Le vingt-et-un rend 99,4 % joué au mieux.</li>
              <li>Le serveur tire le résultat d'abord. L'animation le montre, elle ne le change jamais.</li>
              <li>Jetons de {etat.jetons.join(", ").replace(/, (\d+)$/, " et $1")} statères, {etat.mise_au_plus} au plus sur une table.</li>
              <li>{nombreEcrit(etat.plafond)} statères misés au plus par jour, tous jeux ensemble.</li>
            </ul>
          </details>
          <div class="cas-remise">
            <Pic nom="sablier" />
            <Mots t={etatDuJour(etat)} couleur="doux" plie />
          </div>
        </div>
      </div>
    </div>
  );
}
