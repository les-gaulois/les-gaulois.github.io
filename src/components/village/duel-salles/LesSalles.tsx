import { useEffect, useRef, useState } from "preact/hooks";
import { salles } from "../../../lib/compte/api";
import type { Tenue } from "../../../lib/gaulois";
import type { MainDuDuel } from "../../../lib/village/contrat-duel";
import type { MiseDeSalle } from "../../../lib/village/contrat-salles";
import { EMPLACEMENTS_DE_LA_MAIN, NOMS_DES_EMPLACEMENTS, refusDeLaMain, resteDeLaBourse } from "../../../lib/village/ecran-duel";
import { ecranDesSalles } from "../../../lib/village/ecran-salles";
import type { Familier } from "../../../lib/village/familiers";
import { FenetreDuBooster } from "../KitDesBoosters";
import type { MoteurDuDuel } from "../duel/moteur";
import { Recueil } from "../duel/Recueil";
import { Attente } from "./Attente";
import { FinDuMatch } from "./Fin";
import { CagnotteDeLaTete, Hall } from "./Hall";
import { MatchEnDirect, type LibDesBannieres } from "./Match";
import { TeteDesSalles } from "./pieces";
import { useLienDesSalles } from "./serveur";

/** Ce que l'accueil du duel (`../duel/LeDuel.tsx`, à la session de l'écran du duel) donne aux salles. */
export interface ProprietesDesSalles {
  /** Revenir à l'accueil du duel. */
  retour: () => void;
  m: MoteurDuDuel;
  lib: LibDesBannieres | false | null;
  /** Le Gaulois du membre tel que le duel le dessine. */
  gaulois: { tenue: Tenue; familier: Familier | null; banniere: string | null };
  /** La main d'entraînement du duel (arme, tête, haut, pieds, bas), emportée dans la salle ; elle s'y change. */
  main: readonly string[];
  /** Les cartes du membre. */
  aMoi: ReadonlySet<string>;
  /** La main a changé ici : le duel la garde. */
  onMain: (main: string[]) => void;
}

const enObjet = (main: readonly string[]): MainDuDuel => Object.fromEntries(EMPLACEMENTS_DE_LA_MAIN.map((e, i) => [e, main[i]!])) as unknown as MainDuDuel;

/**
 * « Les salles » du duel (vague 2, 22 novembre 2026, dessin de Claude Fable 5.2) : six salles de 25 à 1 000 statères, où
 * deux membres s'affrontent en direct. Le serveur fait foi (`src/lib/village/contrat-salles.ts`) ; l'écran le relit environ
 * chaque seconde (`serveur.ts`) et montre l'écran qui va : le hall, l'attente, le match (la scène du duel, branchée par
 * `pont.ts`), la fin. Un match en cours s'ouvre tout seul, même après un rechargement.
 */
export default function LesSalles({ retour, m, lib, gaulois, main: mainDuDuel, aMoi, onMain }: ProprietesDesSalles) {
  const lien = useLienDesSalles();
  const [main, setMain] = useState<string[]>(() => [...mainDuDuel]);
  const [vus, setVus] = useState<ReadonlySet<number>>(() => new Set());
  const [tiroir, setTiroir] = useState<number | null>(null);
  const [envoi, setEnvoi] = useState<MiseDeSalle | null>(null);
  // Le match dont la scène reste ouverte jusqu'à ce qu'on la referme (sa fin se joue dans la scène).
  const [sceneDe, setSceneDe] = useState<number | null>(null);
  const e = lien.etat;
  const mainValide = refusDeLaMain(main, m.catalogue, aMoi, m.prix, m.P.BOURSE) === null;

  useEffect(() => {
    if (e?.match) setSceneDe(e.match.match);
  }, [e?.match?.match]);

  // Fermer l'écran pendant une attente quitte la salle (sans rien perdre, et sans toucher un match qui viendrait de
  // commencer) : sinon on y resterait encore quelques secondes, et un adversaire pourrait arriver devant une place vide.
  const enAttente = useRef(false);
  enAttente.current = !!e?.attente && !e.match;
  useEffect(
    () => () => {
      if (enAttente.current) void salles.quitter().catch(() => undefined);
    },
    [],
  );

  const voir = (id: number): void => {
    setVus((v) => new Set([...v, id]));
    setSceneDe(null);
    lien.effacerErreur();
  };
  /** Rejouer dans la même salle si elle t'est encore ouverte ; sinon, revenir au hall, où le cadenas le dit. */
  const rejouer = (m: { match: number; mise: MiseDeSalle }): void => {
    voir(m.match);
    if (salleOuverte(m.mise)) void entrer(m.mise);
  };
  const entrer = async (mise: MiseDeSalle): Promise<void> => {
    setEnvoi(mise);
    await lien.entrer(mise, enObjet(main));
    setEnvoi(null);
  };
  if (!e) {
    return (
      <section class="dl-ecran ds-hall" aria-label="Les salles">
        <TeteDesSalles titre="Les salles" retour={retour} />
        <p class="dl-attente">{lien.panne ? "Le serveur ne répond pas pour l'instant : les salles reviennent dès qu'il répond." : "Ouverture des salles…"}</p>
      </section>
    );
  }

  const calcule = ecranDesSalles(e, vus);
  // La scène d'un match fini au combat reste ouverte : elle joue la dernière manche et sa fin.
  const ecran = calcule.kind !== "match" && e.dernier && sceneDe === e.dernier.match && !vus.has(e.dernier.match) ? ({ kind: "match", match: e.dernier } as const) : calcule;
  const salleOuverte = (mise: number): boolean => mainValide && (e.salles.find((s) => s.mise === mise)?.permise ?? false);

  return (
    <>
      {ecran.kind === "hall" && (
        <Hall
          e={e}
          m={m}
          main={main}
          mainValide={mainValide}
          envoi={envoi}
          refus={lien.erreur}
          retour={retour}
          onChanger={(i) => {
            lien.effacerErreur();
            setTiroir(i);
          }}
          onEntrer={(mise) => {
            lien.effacerErreur();
            void entrer(mise);
          }}
        />
      )}
      {ecran.kind === "attente" && <Attente e={e} ecart={lien.ecart} gaulois={gaulois} nom={null} envoi={lien.envoi} refus={lien.erreur} onQuitter={() => void lien.quitter()} />}
      {ecran.kind === "match" && (
        <MatchEnDirect
          key={ecran.match.match}
          m={m}
          lib={lib}
          gaulois={gaulois}
          match={ecran.match}
          lien={lien}
          permise={salleOuverte(ecran.match.mise)}
          onRejouer={() => rejouer(ecran.match)}
          onRetour={() => voir(ecran.match.match)}
        />
      )}
      {ecran.kind === "fin" && (
        <section class="dl-ecran ds-hall" aria-label="La fin du match" data-testid="salles-fin-seule">
          <TeteDesSalles titre="Les salles" retour={() => voir(ecran.match.match)} droite={<CagnotteDeLaTete e={e} />} />
          <div class="ds-fin-seule">
            <FinDuMatch
              match={ecran.match}
              permise={salleOuverte(ecran.match.mise)}
              envoi={lien.envoi}
              onRejouer={() => rejouer(ecran.match)}
              onRetour={() => voir(ecran.match.match)}
            />
          </div>
        </section>
      )}
      {tiroir !== null && (
        <FenetreDuBooster titre={`Changer : ${NOMS_DES_EMPLACEMENTS[EMPLACEMENTS_DE_LA_MAIN[tiroir]!]}`} etape="choix" occupe={false} onFermer={() => setTiroir(null)} testid="salles-tiroir">
          <Recueil
            m={m}
            aMoi={aMoi}
            choix={{
              emplacement: EMPLACEMENTS_DE_LA_MAIN[tiroir]!,
              actuelle: main[tiroir]!,
              reste: resteDeLaBourse(main, tiroir, m.prix, m.P.BOURSE),
              onPrendre: (id) => {
                const suite = main.map((x, i) => (i === tiroir ? id : x));
                setTiroir(null);
                setMain(suite);
                onMain(suite);
              },
            }}
          />
        </FenetreDuBooster>
      )}
    </>
  );
}
