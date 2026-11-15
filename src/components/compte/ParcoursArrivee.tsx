import type { ComponentType, RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { basePath } from "../../lib/compte/api";
import { ETAPES_ARRIVEE, numeroDeLEtape, type EtapeArrivee } from "../../lib/compte/arrivee";
import type { Me } from "../../lib/compte/types";
import { ADRESSE_VILLAGE } from "../../lib/gaulois";
import { Loading, Problem } from "./common";
import { DemandeLienOpenFront } from "./LienOpenFront";

/**
 * L'inscription dans « Mon compte » (`src/lib/compte/arrivee.ts`) : les trois étapes en tête, puis celle qui reste à faire,
 * le lien OpenFront ou le vestiaire. Le vestiaire n'est chargé qu'à son étape : un visiteur de « Mon compte » ne télécharge
 * pas le dessin du Gaulois.
 */

/**
 * Une étape qui vient de changer sous les yeux (le lien envoyé, le Gaulois créé) : la page remonte jusqu'à `haut`, sous
 * l'en-tête (`scroll-mt-24`), et le focus passe au titre de la nouvelle étape, pour les lecteurs d'écran. Sans glissement :
 * le contenu vient de changer d'un coup.
 */
function montrer(haut: HTMLElement | null, titre: HTMLElement | null): void {
  haut?.scrollIntoView({ block: "start", behavior: "instant" });
  titre?.focus({ preventScroll: true });
}

/** Les trois étapes, la faite, l'en cours et celles qui suivent. */
function EtapesArrivee({ etape, haut }: { etape: EtapeArrivee; haut?: RefObject<HTMLDivElement> }) {
  const courant = numeroDeLEtape(etape);
  return (
    <div ref={haut} class="arrivee-etapes scroll-mt-24" data-testid="arrivee-etapes">
      <p class="arrivee-compte">
        Étape {courant} sur {ETAPES_ARRIVEE.length}
      </p>
      <ol aria-label="Votre inscription">
        {ETAPES_ARRIVEE.map((e, i) => {
          const n = i + 1;
          const etat = n < courant ? "faite" : n === courant ? "en-cours" : "a-faire";
          return (
            <li key={e.id} data-etat={etat} aria-current={etat === "en-cours" ? "step" : undefined}>
              <span class="arrivee-numero" aria-hidden="true">
                {n}
              </span>
              <span>
                {e.nom}
                {etat === "faite" && <span class="sr-only"> : faite</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Le vestiaire, chargé à son étape. Un chargement qui échoue (réseau coupé) se réessaie. */
function VestiaireDifere() {
  const [Vestiaire, setVestiaire] = useState<ComponentType | null>(null);
  const [panne, setPanne] = useState(false);
  const charger = () => {
    setPanne(false);
    import("./Vestiaire").then(
      (m) => setVestiaire(() => m.default),
      () => setPanne(true),
    );
  };
  useEffect(charger, []);
  if (panne) return <Problem message="Le vestiaire n'a pas pu s'ouvrir. Vérifiez votre connexion, puis réessayez." onRetry={charger} />;
  return Vestiaire ? <Vestiaire /> : <Loading label="Ouverture du vestiaire…" />;
}

/**
 * L'étape qui reste. `onSent` : le lien parti, relire le compte. `suite` : on vient de finir l'étape d'avant sur cette
 * page (le temps de relire le compte, le parcours a pu disparaître) : la page remonte à celle-ci, comme à un changement
 * d'étape sous les yeux. Pas à une simple arrivée sur la page.
 */
export default function ParcoursArrivee({ me, etape, onSent, suite = false }: { me: Me; etape: Exclude<EtapeArrivee, "connexion">; onSent: () => Promise<void>; suite?: boolean }) {
  const haut = useRef<HTMLDivElement>(null);
  const titre = useRef<HTMLHeadingElement>(null);
  const valide = me.status === "validated";
  const avant = useRef<EtapeArrivee | null>(suite ? null : etape);
  useEffect(() => {
    if (avant.current === etape) return;
    avant.current = etape;
    montrer(haut.current, titre.current);
  }, [etape]);
  return (
    <div class="grid gap-6" data-testid="arrivee" data-etape={etape}>
      <EtapesArrivee etape={etape} haut={haut} />
      {etape === "lien" ? (
        <div class="max-w-3xl">
          <DemandeLienOpenFront me={me} onSent={onSent} />
        </div>
      ) : (
        <section class="card p-5" aria-labelledby="arrivee-gaulois-titre" data-testid="arrivee-gaulois">
          <h2 ref={titre} id="arrivee-gaulois-titre" class="text-xl" tabIndex={-1}>
            Votre Gaulois
          </h2>
          {/* Un compte en attente ne verra le QG qu'une fois validé par un officier : le texte ne lui promet rien de plus. */}
          <p class="mt-2 text-muted">
            {valide ? "Le QG et la carte de l'alliance s'ouvrent dès qu'il est créé." : "Dernière étape : ensuite, un officier valide votre compte et le QG s'ouvre."}{" "}
            <a href={`${basePath()}/confidentialite#village`}>Où il paraît</a>
          </p>
          <div class="mt-6">
            <VestiaireDifere />
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * L'inscription tout juste finie, sur cette page : la suite. Un membre validé entre au QG ; un compte dont la demande
 * attend l'officier attend, sa demande se lit juste dessous ; une demande refusée, annulée ou à refaire se renvoie dessous.
 */
export function ArriveeFinie({ me }: { me: Me }) {
  const base = basePath();
  const valide = me.status === "validated";
  const suite = valide
    ? "Votre inscription est finie."
    : me.request?.status === "pending"
      ? "Il ne reste qu'à attendre l'officier qui confirme que c'est bien vous."
      : "Renvoyez le lien de votre profil OpenFront, juste en dessous, pour qu'un officier valide votre compte.";
  const haut = useRef<HTMLElement>(null);
  const titre = useRef<HTMLHeadingElement>(null);
  // Le bouton « Créer mon Gaulois » est en bas du vestiaire : la page remonte jusqu'ici.
  useEffect(() => montrer(haut.current, titre.current), []);
  return (
    <section ref={haut} class="card scroll-mt-24 p-5" data-testid="arrivee-finie">
      <h2 ref={titre} class="text-xl" tabIndex={-1}>
        Votre Gaulois est créé
      </h2>
      <p class="mt-2">{suite}</p>
      <p class="mt-2 text-muted">Tapez /gaulois dans le Discord du clan pour le montrer.</p>
      <div class="mt-4 flex flex-wrap gap-3">
        {valide && (
          <a class="btn btn-primary" href={`${base}/qg`} data-testid="arrivee-qg">
            Entrer dans le QG
          </a>
        )}
        <a class={valide ? "btn btn-ghost" : "btn btn-primary"} href={`${base}${ADRESSE_VILLAGE}`}>
          L'habiller au village
        </a>
      </div>
    </section>
  );
}
