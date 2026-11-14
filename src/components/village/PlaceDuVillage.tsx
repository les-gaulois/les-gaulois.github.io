import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ServerError, call } from "../../lib/compte/api";
import type { Village } from "../../lib/village/contrat";
import { lireVillage, messageDeLaPlace, sonGauloisManque } from "../../lib/village/ecran-place";
import { ICONES_DES_LIEUX } from "../../lib/village/lieux-icones";
import { lumiereDuVillage } from "../../lib/village/lumiere";
import { LIEUX, type Lieu, NOMS_DES_LIEUX, compteDuLieu, lieuDOuverture, phraseDuReleve, repartirLeVillage } from "../../lib/village/vie";
import { Loading, Problem, messageOf } from "../compte/common";
import PlaceScene from "./PlaceScene";
import { Toile } from "./PlaceToile";

/** Ce qui amène dans chaque lieu, en une ligne sous la scène. La place n'en a pas besoin : on s'y promène. */
const REGLES: Readonly<Record<Lieu, string | null>> = {
  place: null,
  taverne: "Après une partie, pendant 3 heures.",
  reunion: "En vocal sur Discord au dernier relevé.",
  bataille: "Une partie commencée il y a moins de 45 minutes, rejouée.",
  maisons: "De 23 h à 7 h, heure de Paris.",
};

/** L'heure qu'il est, relue toutes les trente secondes tant que l'onglet est ouvert : la lumière et les lieux la suivent. */
function useMaintenant(actif: boolean): Date {
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => {
    if (!actif) return;
    setMaintenant(new Date());
    const minuterie = window.setInterval(() => setMaintenant(new Date()), 30_000);
    return () => window.clearInterval(minuterie);
  }, [actif]);
  return maintenant;
}

type Etat = { kind: "lecture" } | { kind: "fermee"; message: string } | { kind: "erreur"; message: string } | { kind: "prete"; village: Village };

/** La place se relit toutes les 5 minutes tant que l'onglet est ouvert et la page visible : le robot relève le vocal à ce rythme. */
const RELECTURE_MS = 5 * 60_000;

/**
 * La place du village, devenue un village vivant (demande du pilote, 13 novembre 2026) : cinq lieux qu'on ouvre, la place,
 * la taverne, la salle de réunion, le champ de bataille et les maisons. Le serveur décide de qui est au village et donne
 * les faits (`get_village`) ; `vie.ts` en tire le lieu de chacun, avec l'heure de Paris, qui règle aussi la lumière. Rien
 * n'est du temps réel : chaque Gaulois dit ce qui le place là, et l'heure du relevé est écrite. Aucun solde, aucun
 * classement. `actif` : l'onglet est ouvert ; le village se relit à chaque ouverture, puis toutes les 5 minutes.
 */
export default function PlaceDuVillage({ actif }: { actif: boolean }) {
  const [etat, setEtat] = useState<Etat>({ kind: "lecture" });
  const [choisi, setChoisi] = useState<Lieu | null>(null);
  const maintenant = useMaintenant(actif);

  const derniere = useRef(0);
  const lire = async (discret: boolean) => {
    derniere.current = Date.now();
    if (!discret) setEtat({ kind: "lecture" });
    try {
      const village = lireVillage(await call<unknown>("get_village"));
      if (!village) throw new ServerError("network");
      // Rien de changé : l'écran garde le même village, la scène ne bouge pas.
      setEtat((avant) => (avant.kind === "prete" && JSON.stringify(avant.village) === JSON.stringify(village) ? avant : { kind: "prete", village }));
    } catch (e) {
      const ferme = e instanceof ServerError ? messageDeLaPlace(e.code) : null;
      // Une relecture discrète qui échoue garde le village déjà affiché.
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

  // Puis une relecture discrète toutes les 5 minutes, page visible seulement ; revenu sur la page après plus longtemps, la
  // place se relit aussitôt. Aucun « Lecture… » : les Gaulois changent de lieu sans que la page bouge.
  useEffect(() => {
    if (!actif) return;
    let minuterie = 0;
    const armer = () => {
      window.clearInterval(minuterie);
      minuterie = 0;
      if (document.visibilityState !== "visible") return;
      if (Date.now() - derniere.current >= RELECTURE_MS) void lire(true);
      minuterie = window.setInterval(() => void lire(true), RELECTURE_MS);
    };
    armer();
    document.addEventListener("visibilitychange", armer);
    return () => {
      window.clearInterval(minuterie);
      document.removeEventListener("visibilitychange", armer);
    };
  }, [actif]);

  // La lumière ne change qu'à la minute : le décor n'a pas à se recomposer plus souvent.
  const minute = Math.floor(maintenant.getTime() / 60_000);
  const lumiere = useMemo(() => lumiereDuVillage(new Date(minute * 60_000)), [minute]);
  const village = etat.kind === "prete" ? etat.village : null;
  const lieux = useMemo(() => (village ? repartirLeVillage(village.gaulois, new Date(minute * 60_000), village.releve) : null), [village, minute]);

  if (etat.kind === "lecture") return <Loading label="Lecture du village…" />;
  if (etat.kind === "erreur") return <Problem message={etat.message} onRetry={() => void lire(false)} />;
  if (etat.kind === "fermee" || !village || !lieux) {
    return (
      <div class="place" data-testid="place-fermee">
        <PlaceScene lieu="place" habitants={[]} lumiere={lumiere} actif={actif} />
        <p class="place-mot">{etat.kind === "fermee" ? etat.message : ""}</p>
      </div>
    );
  }

  const ouvert = choisi ?? lieuDOuverture(lieux);
  const ici = lieux[ouvert];
  const releve = phraseDuReleve(village.releve);
  const peuples = LIEUX.filter((lieu) => lieux[lieu].length > 0);
  return (
    <div class="place" data-testid="place">
      <div class="vie-lieux" role="group" aria-label="Les lieux du village">
        {LIEUX.map((lieu) => {
          const nombre = lieux[lieu].length;
          const icone = ICONES_DES_LIEUX[lieu];
          return (
            <button key={lieu} type="button" class="vie-lieu" aria-pressed={lieu === ouvert} data-vide={nombre === 0 ? "" : undefined} data-testid={`lieu-${lieu}`} onClick={() => setChoisi(lieu)}>
              <Toile largeur={icone.largeur} hauteur={icone.hauteur} cases={icone.cases} echelle={2} class="vie-lieu-icone" />
              <span class="vie-lieu-nom">{NOMS_DES_LIEUX[lieu].nom}</span>
              <span class="sr-only"> : </span>
              {nombre > 0 ? <span class="vie-lieu-compte">{nombre}</span> : <span class="sr-only">personne</span>}
              {lieux[lieu].some((h) => h.gaulois.moi) && <span class="vie-lieu-vous">vous y êtes</span>}
            </button>
          );
        })}
      </div>
      <PlaceScene lieu={ouvert} habitants={ici} lumiere={lumiere} actif={actif} />
      <div class="place-pied">
        <p class="place-mot" data-testid="place-compte">
          {village.gaulois.length === 0 ? "Le village est vide." : ici.length > 0 ? compteDuLieu(ouvert, ici.length) : NOMS_DES_LIEUX[ouvert].nom}
          {REGLES[ouvert] && <span class="info-discrete"> {REGLES[ouvert]}</span>}
        </p>
        {releve && (
          <p class="info-discrete" data-testid="place-releve">
            {releve}
          </p>
        )}
      </div>
      {peuples.length > 0 && (
        <details class="fold" data-testid="place-liste">
          <summary>Qui est où</summary>
          {peuples.map((lieu) => (
            <section key={lieu} class="vie-liste">
              <h3 class="vie-liste-titre">{compteDuLieu(lieu, lieux[lieu].length)}</h3>
              <ul>
                {lieux[lieu].map((habitant) => (
                  <li key={habitant.rang}>
                    <span class="vie-liste-nom">
                      {habitant.gaulois.nom}
                      {habitant.gaulois.moi && " (vous)"}
                    </span>
                    <span class="vie-liste-raison">{habitant.presence.raison}</span>
                    {habitant.gaulois.replique && <span class="vie-liste-replique">« {habitant.gaulois.replique} »</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </details>
      )}
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
