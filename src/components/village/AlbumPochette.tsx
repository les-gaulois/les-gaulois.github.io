import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { RARETES_DES_OBJETS as RARETES } from "../../lib/gaulois";
import { ALBUM_ETROIT, TOUS, casesDuGroupe, decrireLaCase, groupesDeLAlbum, placerLAlbum, premiereALaLoupe, type Album, type ElementDeLAlbum } from "../../lib/village/album-pochette";
import { pourcent } from "../../lib/village/ecran-boutique";
import { echelleDuDessin, type DessinEnCases } from "../../lib/village/ecran-familiers";
import { MarqueDeRarete, Pixels } from "./BoutiquePixels";

/**
 * L'album d'une pochette (16 novembre 2026, « l'album à loupe », choisi par le pilote parmi cinq modèles) : le dessin de
 * la pochette devient un bouton. Le curseur passe dessus : ce que la pochette peut donner s'ouvre près de lui, en petites
 * cases, avec une loupe qui montre en grand la case survolée (son nom, sa rareté, sa chance pour ce compte). L'album reste
 * ouvert tant que le curseur est sur le dessin ou sur lui ; un clic le garde ouvert, Échap ou « Fermer » le ferme, un clic
 * ailleurs aussi. Au doigt et au clavier, le dessin s'ouvre et se ferme d'un appui. Sous 640 pixels de large, l'album
 * monte du bas de l'écran. Calculs dans `src/lib/village/album-pochette.ts` : l'écran ne fait que montrer ce que le
 * serveur a donné.
 */

/** La largeur que l'album voudrait, en pixels ; il se réduit à l'écran. */
const LARGEUR = 780;
/** Le délai avant de s'ouvrir sous le curseur, et avant de se fermer quand il s'en va : un passage rapide n'ouvre rien. */
const OUVRIR_APRES = 140;
const FERMER_APRES = 300;
/** La place d'une case de l'album, et celle de la loupe, en pixels. */
const PLACE_CASE = 38;
const PLACE_LOUPE = 148;

/** Un dessin de l'album : un nombre entier de pixels par case quand il tient ; réduit en douceur sinon (un grand familier). */
function DessinDeLAlbum({ dessin, place, maximum, silhouette, class: classe }: { dessin: DessinEnCases | null; place: number; maximum: number; silhouette: boolean; class: string }) {
  if (!dessin) return null;
  const reduit = Math.max(dessin.largeur, dessin.hauteur) > place;
  return <Pixels largeur={dessin.largeur} hauteur={dessin.hauteur} cases={dessin.cases} echelle={echelleDuDessin(dessin, place, maximum)} class={`${classe}${reduit ? " album-reduit" : ""}${silhouette ? " album-silhouette" : ""}`} />;
}

/** La loupe : la case choisie en grand, décorative ; chaque case dit aux lecteurs d'écran son nom, sa rareté, son rayon ou sa famille et sa chance. */
function Loupe({ element }: { element: ElementDeLAlbum }) {
  return (
    <div class="album-loupe" data-rarete={element.rarete} aria-hidden="true" data-testid="album-loupe" data-element={element.id}>
      <div class="album-loupe-cadre">
        <DessinDeLAlbum dessin={element.dessin} place={PLACE_LOUPE} maximum={4} silhouette={element.silhouette} class="album-loupe-dessin" />
      </div>
      <p class="album-loupe-nom">{element.nom}</p>
      <MarqueDeRarete rarete={element.rarete} />
      <p class="album-loupe-detail">{element.detail}</p>
      {element.possede && <span class="album-a-vous">{element.montre ? "montré" : "à vous"}</span>}
      {element.chance > 0 && (
        <p class="album-loupe-chance">
          <strong class="tnum">{pourcent(element.chance)}</strong>
          <span>dans votre prochaine pochette</span>
        </p>
      )}
    </div>
  );
}

/** Le panneau de l'album, ouvert : les puces des groupes, les cases, la loupe. */
function Panneau({ album, id, onFermer, onPlacer }: { album: Album; id: string; onFermer: () => void; onPlacer: () => void }) {
  const [groupe, setGroupe] = useState(TOUS);
  // Une puce change la hauteur de l'album : il se replace, la pointe toujours vers le dessin.
  useLayoutEffect(onPlacer, [groupe]);
  const [choisi, setChoisi] = useState<ElementDeLAlbum | null>(() => premiereALaLoupe(album.elements));
  const groupes = groupesDeLAlbum(album.elements);
  const cases = casesDuGroupe(album.elements, groupe);
  return (
    <>
      <div class="album-tete">
        <div>
          <p id={`${id}-titre`} class="album-titre" tabIndex={-1}>
            {album.titre}
          </p>
          <p class="album-sous">{album.sous}</p>
        </div>
        <button type="button" class="album-fermer" onClick={onFermer} aria-label="Fermer" data-testid="album-fermer">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </div>
      <div class="album-corps">
        <div class="album-gauche">
          <div class="album-groupes" role="group" aria-label={album.libelleDesGroupes} data-testid="album-groupes">
            {groupes.map((g) => (
              <button key={g.groupe} type="button" class="chip filtre" aria-pressed={groupe === g.groupe} onClick={() => setGroupe(g.groupe)} data-testid="album-groupe">
                {g.nom}
                <span class="filtre-nombre tnum">{g.nombre}</span>
              </button>
            ))}
          </div>
          <ul class="album-cases" data-testid="album-cases">
            {cases.map((element) => (
              <li key={element.id}>
                <button type="button" class="album-case" data-rarete={element.rarete} data-possede={element.possede ? "" : undefined} data-actif={choisi?.id === element.id ? "" : undefined} aria-label={decrireLaCase(element)} onPointerEnter={() => setChoisi(element)} onFocus={() => setChoisi(element)} onClick={() => setChoisi(element)} data-testid="album-case" data-element={element.id}>
                  <DessinDeLAlbum dessin={element.dessin} place={PLACE_CASE} maximum={1} silhouette={element.silhouette} class="album-case-dessin" />
                  {/* La rareté en losanges aussi : la couleur n'est jamais le seul repère. */}
                  <span class="album-case-rang" aria-hidden="true">
                    {Array.from({ length: RARETES[element.rarete].rang }, (_, i) => (
                      <i key={i} />
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {choisi && <Loupe element={choisi} />}
      </div>
    </>
  );
}

/**
 * Le dessin d'une pochette, qui ouvre son album. `lireAlbum` : ce que la pochette peut donner à ce compte, calculé à
 * l'ouverture seulement (cent dessins de moins à préparer à l'arrivée sur la page). `nombre` : combien elle contient, écrit
 * sur la pastille du dessin. `nom` : ce que le bouton dit aux lecteurs d'écran.
 */
export function AlbumDePochette({ lireAlbum, nombre, nom, testid, children }: { lireAlbum: () => Album; nombre: number; nom: string; testid: string; children: ComponentChildren }) {
  const [mode, setMode] = useState<"survol" | "clic" | null>(null);
  const declencheur = useRef<HTMLButtonElement>(null);
  const panneau = useRef<HTMLDivElement>(null);
  const minuteries = useRef({ ouvrir: 0, fermer: 0 });
  const auClavier = useRef(false);
  const id = `album-${testid}`;
  const ouvert = mode !== null;
  // L'album se calcule à chaque ouverture : les chances et ce que le compte possède ont pu changer depuis la dernière.
  const album = useMemo(() => (ouvert ? lireAlbum() : null), [ouvert, lireAlbum]);

  const annuler = (): void => {
    window.clearTimeout(minuteries.current.ouvrir);
    window.clearTimeout(minuteries.current.fermer);
  };
  const fermer = (rendreLeFocus: boolean): void => {
    annuler();
    setMode(null);
    if (rendreLeFocus) declencheur.current?.focus();
  };
  // Le curseur s'en va : l'album ouvert au survol se ferme un instant après, sauf s'il revient sur le dessin ou sur l'album.
  const plusTard = (): void => {
    window.clearTimeout(minuteries.current.fermer);
    minuteries.current.fermer = window.setTimeout(() => setMode((m) => (m === "survol" ? null : m)), FERMER_APRES);
  };

  // La place de l'album, près du dessin ; elle suit la page quand elle défile.
  const placer = (): void => {
    const p = panneau.current;
    const d = declencheur.current;
    if (!p || !d) return;
    const largeurEcran = document.documentElement.clientWidth;
    const etroit = largeurEcran < ALBUM_ETROIT;
    p.classList.toggle("album-feuille", etroit);
    if (etroit) {
      p.removeAttribute("style");
      p.removeAttribute("data-cote");
      return;
    }
    const largeur = Math.min(LARGEUR, largeurEcran - 32);
    p.style.width = `${largeur}px`;
    p.style.left = "0px";
    p.style.top = "0px";
    p.style.maxHeight = `${Math.min(window.innerHeight - 32, 640)}px`;
    // La barre du site reste collée en haut de l'écran : l'album s'ouvre toujours dessous.
    const barre = document.querySelector("header.barre")?.getBoundingClientRect();
    const place = placerLAlbum(d.getBoundingClientRect(), largeur, p.offsetHeight, { largeur: largeurEcran, hauteur: window.innerHeight, haut: barre && barre.bottom > 0 ? barre.bottom : 0 });
    p.style.left = `${place.left}px`;
    p.style.top = `${place.top}px`;
    p.style.maxHeight = `${place.hauteurMax}px`;
    p.style.setProperty("--pointe", `${place.pointe}px`);
    if (place.cote) p.dataset.cote = place.cote;
    else p.removeAttribute("data-cote");
  };

  useLayoutEffect(() => {
    if (!ouvert) return;
    placer();
    if (auClavier.current) panneau.current?.querySelector<HTMLElement>(".album-titre")?.focus();
  }, [ouvert]);

  useEffect(() => {
    if (!ouvert) return;
    const touche = (e: KeyboardEvent): void => {
      // Échap revient d'abord à une fenêtre ouverte par-dessus (ouvrir une pochette, acheter).
      if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      fermer(true);
    };
    const ailleurs = (e: PointerEvent): void => {
      const cible = e.target as Node | null;
      if (cible && (panneau.current?.contains(cible) || declencheur.current?.contains(cible))) return;
      fermer(false);
    };
    const suivre = (): void => placer();
    document.addEventListener("keydown", touche);
    document.addEventListener("pointerdown", ailleurs);
    window.addEventListener("scroll", suivre, { passive: true });
    window.addEventListener("resize", suivre);
    return () => {
      document.removeEventListener("keydown", touche);
      document.removeEventListener("pointerdown", ailleurs);
      window.removeEventListener("scroll", suivre);
      window.removeEventListener("resize", suivre);
    };
  }, [ouvert]);

  useEffect(() => annuler, []);

  // Le focus quitte le dessin et l'album (Tab vers « Ouvrir une pochette ») : l'album se ferme, pour ne jamais cacher ce qui
  // a le focus. Sans destination connue (un clic dans le vide, Safari), rien : le clic ailleurs ferme déjà.
  const focusParti = (e: FocusEvent): void => {
    const vers = e.relatedTarget as Node | null;
    if (!vers || panneau.current?.contains(vers) || declencheur.current?.contains(vers)) return;
    fermer(false);
  };

  return (
    <>
      <button
        ref={declencheur}
        type="button"
        class="album-declencheur"
        aria-expanded={ouvert}
        aria-controls={ouvert ? id : undefined}
        aria-haspopup="dialog"
        onFocusOut={focusParti}
        onPointerEnter={(e) => {
          if (e.pointerType === "touch") return;
          window.clearTimeout(minuteries.current.fermer);
          if (mode) return;
          window.clearTimeout(minuteries.current.ouvrir);
          minuteries.current.ouvrir = window.setTimeout(() => {
            auClavier.current = false;
            setMode((m) => m ?? "survol");
          }, OUVRIR_APRES);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "touch") return;
          window.clearTimeout(minuteries.current.ouvrir);
          plusTard();
        }}
        onClick={(e) => {
          window.clearTimeout(minuteries.current.ouvrir);
          const clavier = e.detail === 0;
          if (mode === null) {
            auClavier.current = clavier;
            setMode("clic");
          } else if (mode === "survol" && !clavier) setMode("clic");
          else fermer(true);
        }}
        data-testid={`${testid}-album`}
      >
        {children}
        <span class="album-pastille" aria-hidden="true">
          <svg viewBox="0 0 12 12" fill="currentColor">
            <rect width="5" height="5" rx="1" />
            <rect x="7" width="5" height="5" rx="1" />
            <rect y="7" width="5" height="5" rx="1" />
            <rect x="7" y="7" width="5" height="5" rx="1" />
          </svg>
          <span class="tnum">{nombre}</span>
        </span>
        <span class="sr-only">{nom}</span>
      </button>
      {album && (
        <div
          ref={panneau}
          id={id}
          class="album"
          role="dialog"
          aria-labelledby={`${id}-titre`}
          onFocusOut={focusParti}
          onPointerEnter={(e) => {
            if (e.pointerType !== "touch") window.clearTimeout(minuteries.current.fermer);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType !== "touch") plusTard();
          }}
          data-testid="album"
        >
          <Panneau album={album} id={id} onFermer={() => fermer(true)} onPlacer={placer} />
        </div>
      )}
    </>
  );
}
