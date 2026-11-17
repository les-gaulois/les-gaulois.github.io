import { useEffect, useRef, useState } from "preact/hooks";
import { fmtDayAndTime, fmtInt } from "../lib/format";
import { replayUrl } from "../lib/journal";
import { mapLabel } from "../lib/map-names";
import { adresseEnLecture, ficheDuLecteur } from "../lib/rejeu/fiche-du-lecteur";
import { dureeDite } from "../lib/rejeu/film";
import { formatLabel } from "../lib/results";
import JournalDeLaPartie, { type FlammesDuJournal, type InsignesDuJournal, type PortraitDuJournal } from "./JournalDeLaPartie";

/** Une partie qui a son replay, telle que la page la reçoit de la liste publiée (`FilmPublie`, relue par Zod au build). */
export interface PartieDuReplay {
  partie: string;
  debut: string;
  carte: string;
  victoire: boolean;
  equipes: string;
  gaulois: number;
  joueurs: number;
  secondes: number;
  forme: number | null;
  jeu: string;
  /** Les faits du journal « Entre Gaulois » publié pour cette partie ; `null` : pas relevés. */
  faits: number | null;
}

interface Props {
  /** Les parties qui ont leur replay, la plus récente d'abord : celle-ci s'ouvre sans partie choisie. */
  parties: PartieDuReplay[];
  /** Les parties rejouées par le robot dont le replay n'est pas prêt (lecteur pas encore construit ou déposé). */
  enAttente: string[];
  /** Les jours de parties gardées au plus (`JOURS_DE_FILMS`), passés par la page : le lecteur n'embarque pas Zod. */
  jours: number;
  /** La base du site, pour l'adresse des journaux (`/films/<partie>.journal.json`). */
  base: string;
  /** Les Gaulois des membres au pseudo public, par pseudo, pour le journal « Entre Gaulois ». */
  portraits: Record<string, PortraitDuJournal>;
  /** Le niveau du compte et la flamme de série de ces membres, par pseudo, et les deux flammes en image. */
  insignes: Record<string, InsignesDuJournal>;
  flammes: FlammesDuJournal;
}

/** La partie demandée dans l'adresse (`?partie=…`), si elle a la forme d'un identifiant de partie. */
function partieDeLAdresse(): string | null {
  const id = new URLSearchParams(window.location.search).get("partie");
  return id !== null && /^[A-Za-z0-9]{1,32}$/.test(id) ? id : null;
}

/**
 * « Revoir une partie » : le vrai replay du jeu, seul (demande du pilote, 16 novembre 2026 : « je veux plus de film mais
 * uniquement le replay »). Le lecteur de replay d'OpenFront, construit par le site et servi sur son site à part
 * (src/lib/rejeu/lecteur-jeu.ts), est montré dans un cadre à la forme de la carte. Le robot du site rejoue toujours chaque
 * partie (son film reste sa matière : la fiche, la carte, les faits), mais le film n'est plus montré. Une partie dont le
 * replay n'est pas disponible le dit, avec le lien vers OpenFront. Les parties arrivent par la page, écrites au build : pas de
 * fichier lu au chargement, que le cache de GitHub Pages pourrait servir en retard.
 */
export default function RejeuPartie({ parties, enAttente, jours, base, portraits, insignes, flammes }: Props) {
  const dernier = parties[0]?.partie ?? null;
  // Avant l'hydratation (et sans partie dans l'adresse), la plus récente : son titre et son cadre sont réservés d'emblée.
  const [partie, setPartie] = useState<string | null>(dernier);
  const [essai, setEssai] = useState(0);

  useEffect(() => setPartie(partieDeLAdresse() ?? dernier), [dernier]);

  const infos = partie !== null ? (parties.find((p) => p.partie === partie) ?? null) : null;

  // Le replay de cette partie : sa fiche est demandée à son site avant de montrer le cadre. Jamais sur l'adresse de cette
  // page : le cadre laisse ses scripts tourner, ils ne doivent le faire qu'à part (src/lib/rejeu/lecteur-jeu.ts).
  const jeuDemande = infos?.jeu;
  const [jeuEtat, setJeuEtat] = useState<"verif" | "pret" | "absent" | "erreur">("verif");
  // La lecture d'office en × 8 (demande du pilote, 16 novembre 2026), décidée au moment de monter le cadre : jamais pour qui a
  // demandé moins d'animations (bouton pause de l'en-tête, ou réglage du système).
  const [enLecture, setEnLecture] = useState(false);
  const cadreDuJeu = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (jeuDemande === undefined) return;
    const fiche = ficheDuLecteur(jeuDemande);
    if (fiche === null || new URL(fiche).origin === window.location.origin) {
      setJeuEtat("absent");
      return;
    }
    let annule = false;
    setJeuEtat("verif");
    setEnLecture(!document.documentElement.classList.contains("fx-off") && !matchMedia("(prefers-reduced-motion: reduce)").matches);
    fetch(fiche, { method: "HEAD", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" })
      .then((r) => {
        if (!annule) setJeuEtat(r.ok ? "pret" : "absent");
      })
      .catch(() => {
        // Le site du replay injoignable : pas une absence, une panne à réessayer.
        if (!annule) setJeuEtat("erreur");
      });
    return () => {
      annule = true;
    };
  }, [jeuDemande, essai]);

  // Le bouton pause de l'en-tête arrête le replay, comme le passage du système à « réduire les animations ». Le replay vient
  // d'un autre site : la pause lui est demandée par un message, que sa page n'accepte que d'ici et écoute dès son chargement ;
  // le cadre la redemande quand il a fini de charger (`onLoad`), au cas où le clic l'a précédé.
  const [animationsCoupees, setAnimationsCoupees] = useState(false);
  const coupees = useRef(false);
  coupees.current = animationsCoupees;
  const pauseDuJeu = () => {
    const f = cadreDuJeu.current;
    if (!f?.contentWindow) return;
    try {
      f.contentWindow.postMessage({ gal: "pause" }, new URL(f.src).origin);
    } catch {
      /* Un cadre sans adresse lisible : rien à arrêter. */
    }
  };
  useEffect(() => {
    const racine = document.documentElement;
    const reduire = matchMedia("(prefers-reduced-motion: reduce)");
    const relever = () => {
      const oui = racine.classList.contains("fx-off") || reduire.matches;
      coupees.current = oui;
      setAnimationsCoupees(oui);
      return oui;
    };
    relever();
    const changement = () => {
      if (relever()) pauseDuJeu();
    };
    const observateur = new MutationObserver(changement);
    observateur.observe(racine, { attributes: true, attributeFilter: ["class"] });
    reduire.addEventListener("change", changement);
    return () => {
      observateur.disconnect();
      reduire.removeEventListener("change", changement);
    };
  }, []);

  // La partie à l'écran est repérée dans la liste des dernières parties, sous le lecteur (src/pages/revoir.astro).
  useEffect(() => {
    for (const lien of document.querySelectorAll<HTMLElement>("[data-revoir-partie]")) {
      if (lien.dataset.revoirPartie === partie) lien.setAttribute("aria-current", "true");
      else lien.removeAttribute("aria-current");
    }
  }, [partie]);

  if (partie === null) return null;

  /** Un message à la place du replay, avec le lien vers OpenFront. */
  const probleme = (titre: string, texte: string | null, reessayer = false) => (
    <div class="card revoir-probleme" role="alert" data-testid="rejeu-probleme">
      <p class="font-display text-lg font-bold">{titre}</p>
      {texte && <p class="mt-2 text-sm text-muted">{texte}</p>}
      {reessayer && (
        <button type="button" class="btn btn-ghost mt-4" onClick={() => setEssai(essai + 1)}>
          Réessayer
        </button>
      )}
      <p class="mt-2">
        <a class="link" href={replayUrl(partie)} rel="noopener" data-testid="rejeu-openfront">
          Ouvrir la partie sur OpenFront
        </a>
      </p>
    </div>
  );

  if (infos === null) {
    return enAttente.includes(partie)
      ? probleme("Le replay de cette partie n'est pas disponible pour l'instant", null)
      : probleme("Pas de replay pour cette partie", `Seules les dernières parties se revoient, ${jours} jours au plus, environ une heure après leur fin.`);
  }
  if (jeuEtat === "absent") return probleme("Le replay de cette partie n'est pas disponible pour l'instant", null);
  if (jeuEtat === "erreur") return probleme("Le replay n'a pas pu être chargé", null, true);

  const jeu = infos.jeu;
  const titre = `${mapLabel(infos.carte)}, ${fmtDayAndTime(infos.debut)}`;
  return (
    <section class="revoir" aria-labelledby="rejeu-titre" aria-busy={jeuEtat !== "pret"} data-testid="rejeu">
      <div class="revoir-tete">
        <h2 id="rejeu-titre" class="revoir-titre">
          {titre}
        </h2>
        <span class="revoir-resultat" data-resultat={infos.victoire ? "victoire" : "defaite"} data-testid="rejeu-resultat">
          <i aria-hidden="true" />
          {infos.victoire ? "Victoire" : "Défaite"}
        </span>
      </div>
      {/* Sur un écran large : la fiche en une ligne sous le titre, puis le replay et, à sa droite, le fil « Entre Gaulois » sur
          toute sa hauteur (demande du pilote, 17 novembre 2026). Plus étroit : le replay, la fiche, puis le fil. */}
      <div class="revoir-corps" style={infos.forme ? { "--revoir-forme": String(infos.forme) } : undefined}>
        <div class="revoir-fiche">
          <dl class="revoir-faits tnum">
            <div>
              <dt>Format</dt>
              <dd>{formatLabel(infos.equipes)}</dd>
            </div>
            <div>
              <dt>Gaulois</dt>
              <dd>
                {fmtInt(infos.gaulois)} sur {fmtInt(infos.joueurs)} joueurs
              </dd>
            </div>
            <div>
              <dt>Rejoué</dt>
              <dd>{dureeDite(infos.secondes)}</dd>
            </div>
          </dl>
          <p class="revoir-sortie">
            {/* Le lien n'est donné qu'une fois la fiche vérifiée sur le site du replay. */}
            {jeuEtat === "pret" && (
              <a class="link" href={animationsCoupees ? jeu : adresseEnLecture(jeu)} target="_blank" rel="noopener" data-testid="rejeu-jeu">
                Ouvrir le replay en grand
                <span class="sr-only"> (nouvel onglet)</span>
              </a>
            )}
            <a class="link" href={replayUrl(infos.partie)} rel="noopener" data-testid="rejeu-openfront">
              Ouvrir la partie sur OpenFront
            </a>
          </p>
        </div>
        {/* Le vrai lecteur du jeu, dans un cadre à la forme de la carte : elle le remplit, sans fond autour. Il vient d'un autre
            site : enfermé (`sandbox`), sans autre droit que ses scripts, son propre stockage et ses liens en nouvel onglet. Il
            part de lui-même en × 8, sauf pour qui veut moins d'animations, à qui il s'ouvre en pause. */}
        <div class="revoir-scene revoir-scene-jeu">
          {/* Cadre vide le temps de vérifier que la fiche de la partie est bien sur le site du lecteur. Obstacle du compagnon : à
              l'arrêt, il se tient à côté du lecteur et de son bandeau « © OpenFront and Contributors ». */}
          <div class="revoir-cadre" aria-busy={jeuEtat !== "pret"} data-compagnon-obstacle>
            {jeuEtat === "pret" && (
              <iframe
                key={partie}
                ref={cadreDuJeu}
                src={enLecture ? adresseEnLecture(jeu) : jeu}
                title={`Replay du jeu OpenFront : ${titre}`}
                sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                allow="fullscreen"
                allowFullScreen
                referrerpolicy="no-referrer"
                loading="lazy"
                data-testid="rejeu-jeu-cadre"
                onLoad={() => {
                  if (coupees.current) pauseDuJeu();
                }}
              />
            )}
          </div>
        </div>

        {/* Le journal « Entre Gaulois » de la partie, en fil qui suit le replay : seulement quand il a des faits. */}
        {jeuEtat === "pret" && infos.faits !== null && infos.faits > 0 && (
          <div class="revoir-fil">
            <JournalDeLaPartie key={partie} partie={partie} victoire={infos.victoire} adresse={`${base}/films/${partie}.journal.json`} cadre={cadreDuJeu} origine={new URL(jeu).origin} portraits={portraits} insignes={insignes} flammes={flammes} />
          </div>
        )}
      </div>
    </section>
  );
}
