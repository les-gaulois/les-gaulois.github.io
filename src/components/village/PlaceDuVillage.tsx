import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { ServerError, call } from "../../lib/compte/api";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, casesDuGaulois } from "../../lib/gaulois";
import type { GauloisDeLaPlace, Village } from "../../lib/village/contrat";
import { TUILE_DU_SOL, composerDecor, feuDuDecor, tuileDuSol } from "../../lib/village/decor";
import { caseDuDecor, compteDeLaPlace, largeurDuDecor, lireVillage, messageDeLaPlace, ordreDeLaPlace, sonGauloisManque, tailleDesGaulois } from "../../lib/village/ecran-place";
import { Loading, Problem, messageOf } from "../compte/common";
import { Toile, imageDeFond } from "./PlaceToile";

/**
 * La scène : le décor du village en haut, à la largeur de l'écran, et le sol dessous, où se tiennent les Gaulois. Le décor
 * est décoratif : rien n'y est une donnée. La fumée du feu monte lentement ; le bouton pause de l'en-tête et le réglage
 * « réduire les animations » l'arrêtent (feuille de style).
 */
function Scene({ children }: { children?: ComponentChildren }) {
  const cadre = useRef<HTMLDivElement>(null);
  const [mesure, setMesure] = useState<{ cote: number; cases: number } | null>(null);

  useLayoutEffect(() => {
    const el = cadre.current;
    if (!el) return;
    const mesurer = () => {
      const cote = caseDuDecor(window.innerWidth);
      const cases = largeurDuDecor(el.clientWidth, cote);
      setMesure((avant) => (avant && avant.cote === cote && avant.cases === cases ? avant : { cote, cases }));
    };
    mesurer();
    const observateur = typeof ResizeObserver === "function" ? new ResizeObserver(mesurer) : null;
    observateur?.observe(el);
    return () => observateur?.disconnect();
  }, []);

  const cases = mesure?.cases ?? null;
  const decor = useMemo(() => (cases === null ? null : composerDecor(cases)), [cases]);
  const sol = useMemo(() => {
    const tuile = tuileDuSol();
    return imageDeFond(tuile.largeur, tuile.hauteur, tuile.cases);
  }, []);
  const feu = decor ? feuDuDecor(decor.largeur) : null;
  const cote = mesure?.cote ?? 2;

  return (
    <div ref={cadre} class="place-scene" style={{ "--place-case": `${cote}px` }} data-testid="place-scene">
      <div class="place-decor" aria-hidden="true">
        {decor && <Toile largeur={decor.largeur} hauteur={decor.hauteur} cases={decor.cases} echelle={cote} />}
        {feu && (
          <div class="place-fumee" style={{ "--feu-x": String(feu.x), "--feu-y": String(feu.y) }}>
            <i />
            <i />
            <i />
          </div>
        )}
      </div>
      <div class="place-sol" style={sol ? { backgroundImage: `url(${sol})`, backgroundSize: `${TUILE_DU_SOL * cote}px` } : undefined}>
        {children}
      </div>
    </div>
  );
}

/** Un Gaulois de la place : son dessin, son nom dessous. Le sien porte une flèche et un nom en clair. */
function Habitant({ gaulois }: { gaulois: GauloisDeLaPlace }) {
  const cases = useMemo(() => casesDuGaulois(gaulois.tenue), [gaulois.tenue]);
  return (
    <li class="place-gaulois" data-moi={gaulois.moi ? "" : undefined} data-testid="place-gaulois">
      {gaulois.moi && <span class="place-fleche" aria-hidden="true" />}
      <Toile largeur={GAULOIS_LARGEUR} hauteur={GAULOIS_HAUTEUR} cases={cases} class="place-gaulois-toile" />
      <span class="place-nom">
        {gaulois.nom}
        {gaulois.moi && <span class="sr-only"> (vous)</span>}
      </span>
    </li>
  );
}

type Etat = { kind: "lecture" } | { kind: "fermee"; message: string } | { kind: "erreur"; message: string } | { kind: "prete"; village: Village };

/**
 * La place du village : les Gaulois de tous les membres validés, autour du feu. Le serveur décide de qui y est
 * (`get_village`) ; aucune case pour s'en retirer (choix du pilote, 13 novembre 2026). Aucun solde, aucun classement.
 * `actif` : l'onglet est ouvert ; la place se relit à chaque ouverture, pour suivre une tenue changée à côté.
 */
export default function PlaceDuVillage({ actif }: { actif: boolean }) {
  const [etat, setEtat] = useState<Etat>({ kind: "lecture" });

  const lire = async (discret: boolean) => {
    if (!discret) setEtat({ kind: "lecture" });
    try {
      const village = lireVillage(await call<unknown>("get_village"));
      if (!village) throw new ServerError("network");
      setEtat({ kind: "prete", village });
    } catch (e) {
      const ferme = e instanceof ServerError ? messageDeLaPlace(e.code) : null;
      // Une relecture discrète qui échoue garde la place déjà affichée.
      if (ferme) setEtat({ kind: "fermee", message: ferme });
      else if (!discret) setEtat({ kind: "erreur", message: messageOf(e) });
    }
  };

  const dejaLue = useRef(false);
  useEffect(() => {
    if (!actif) return;
    void lire(dejaLue.current);
    dejaLue.current = true;
  }, [actif]);

  if (etat.kind === "lecture") return <Loading label="Lecture de la place…" />;
  if (etat.kind === "erreur") return <Problem message={etat.message} onRetry={() => void lire(false)} />;
  if (etat.kind === "fermee") {
    return (
      <div class="place" data-testid="place-fermee">
        <Scene />
        <p class="place-mot">{etat.message}</p>
      </div>
    );
  }

  const { village } = etat;
  const foule = ordreDeLaPlace(village.gaulois);
  const compte = compteDeLaPlace(foule.length);
  return (
    <div class="place" data-testid="place">
      <Scene>
        {foule.length > 0 && (
          <ul class="place-foule" data-taille={tailleDesGaulois(foule.length)} aria-label="Les Gaulois sur la place">
            {foule.map((gaulois, i) => (
              <Habitant key={`${i}-${gaulois.nom}`} gaulois={gaulois} />
            ))}
          </ul>
        )}
      </Scene>
      <div class="place-pied">
        {compte ? (
          <p class="info-discrete" data-testid="place-compte">
            {compte}
          </p>
        ) : (
          <p class="place-mot" data-testid="place-vide">
            La place est vide.
          </p>
        )}
      </div>
      {sonGauloisManque(village) && (
        <p class="place-mot" data-testid="place-sans-gaulois">
          <a href="#gaulois" class="underline">
            Créez votre Gaulois
          </a>{" "}
          pour y paraître.
        </p>
      )}
    </div>
  );
}
