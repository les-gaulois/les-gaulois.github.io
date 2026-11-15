import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { COULEUR_RETOMBEES, MER_FINALE_CSS, type Rgb } from "../lib/carte-dessin";
import { fmtDayAndTime, fmtInt } from "../lib/format";
import { filmSpeed, speedLabel, speedText, SPEED_MAX, SPEED_MIN, SPEED_STEP } from "../lib/fx/speed";
import { replayUrl } from "../lib/journal";
import { mapLabel } from "../lib/map-names";
import { Bobine, CLASSE, COULEURS_DES_CLASSES, contientRetombees, decompresser, dureeDite, horloge, lireFilm, PeintreFilm, secondesDeLImage, type Film } from "../lib/rejeu/film";
import { formatLabel } from "../lib/results";

/** Les images par seconde à la vitesse normale : une partie de 8 minutes se revoit en une demi-minute. */
const IMAGES_PAR_SECONDE = 12;
/** L'écart le plus long compté entre deux images d'écran : un onglet caché ne fait pas sauter le film au bout à son retour. */
const ECART_MAX_MS = 250;

type Etat = "charge" | "pret" | "absent" | "erreur" | "ancien";

interface Props {
  /** Le chemin du site (`BASE_URL` sans la barre finale). */
  base: string;
  /** Le film le plus récent : celui qui s'ouvre sans partie choisie. `null` : aucun film publié. */
  dernier: string | null;
  /** Les jours de parties filmées au plus (`JOURS_DE_FILMS`), passés par la page : le lecteur n'embarque pas Zod. */
  jours: number;
  /** Le tag du clan, pour la légende. */
  tag: string;
}

const css = (c: Rgb) => `rgb(${c[0]} ${c[1]} ${c[2]})`;

/** La partie demandée dans l'adresse (`?partie=…`), si elle a la forme d'un identifiant de partie. */
function partieDeLAdresse(): string | null {
  const id = new URLSearchParams(window.location.search).get("partie");
  return id !== null && /^[A-Za-z0-9]{1,32}$/.test(id) ? id : null;
}

/**
 * La légende. Les autres équipes prennent leurs couleurs parmi huit, dans l'ordre (`couleursDesJoueurs`) : toutes celles du
 * film sont montrées, sous un seul nom, et deux équipes peuvent partager une couleur quand il y en a plus de huit.
 */
function Legende({ film, retombees, tag }: { film: Film; retombees: boolean; tag: string }) {
  const e = film.entete;
  const lignes: { couleurs: Rgb[]; nom: string }[] = [{ couleurs: [COULEURS_DES_CLASSES[CLASSE.gaulois]!], nom: `Gaulois (tag [${tag}])` }];
  if (e.equipe) lignes.push({ couleurs: [COULEURS_DES_CLASSES[CLASSE.equipe]!], nom: "Leur équipe" });
  if (e.adverses > 0) lignes.push({ couleurs: COULEURS_DES_CLASSES.slice(CLASSE.adverses, CLASSE.adverses + e.adverses) as Rgb[], nom: e.adverses > 1 ? "Autres équipes" : "Autre équipe" });
  lignes.push({ couleurs: [COULEURS_DES_CLASSES[CLASSE.robots]!], nom: "Robots" });
  if (retombees) lignes.push({ couleurs: [COULEUR_RETOMBEES], nom: "Retombées nucléaires" });
  return (
    <ul class="revoir-legende" aria-label="Légende des couleurs">
      {lignes.map((l) => (
        <li key={l.nom}>
          <span class="revoir-teintes" aria-hidden="true">
            {l.couleurs.map((c) => (
              <i key={css(c)} style={{ background: css(c) }} />
            ))}
          </span>
          {l.nom}
        </li>
      ))}
    </ul>
  );
}

/**
 * Le lecteur des films de parties (page « Revoir une partie ») : la carte de la partie, rejouée par le moteur du jeu, image par
 * image, avec la lecture, la barre du temps et la vitesse. Le film est un fichier statique du site : le navigateur n'appelle
 * jamais OpenFront. Rien ne part tout seul : la lecture attend le visiteur, et le bouton pause de l'en-tête l'arrête.
 */
export default function RejeuPartie({ base, dernier, jours, tag }: Props) {
  const [partie, setPartie] = useState<string | null>(null);
  const [etat, setEtat] = useState<Etat>("charge");
  const [film, setFilm] = useState<Film | null>(null);
  const [image, setImage] = useState(0);
  const [lecture, setLecture] = useState(false);
  const [vitesse, setVitesse] = useState(SPEED_MAX);
  const [essai, setEssai] = useState(0);
  const toile = useRef<HTMLCanvasElement>(null);
  const bobine = useRef<Bobine | null>(null);
  const peintre = useRef<PeintreFilm | null>(null);
  const pixels = useRef<ImageData | null>(null);
  const imageCourante = useRef(0);
  imageCourante.current = image;

  useEffect(() => setPartie(partieDeLAdresse() ?? dernier), [dernier]);

  // Le film : un fichier du site, décompressé et relu ici.
  useEffect(() => {
    if (partie === null) return;
    let annule = false;
    setEtat("charge");
    setLecture(false);
    (async () => {
      if (typeof DecompressionStream === "undefined") return "ancien" as const;
      const reponse = await fetch(`${base}/films/${encodeURIComponent(partie)}.film`);
      if (reponse.status === 404) return "absent" as const;
      if (!reponse.ok) throw new Error(String(reponse.status));
      const lu = lireFilm(await decompresser(await reponse.arrayBuffer()));
      if (lu.entete.partie !== partie) throw new Error("film d'une autre partie");
      return lu;
    })()
      .then((r) => {
        if (annule) return;
        if (typeof r === "string") {
          setEtat(r);
          return;
        }
        bobine.current = new Bobine(r);
        peintre.current = new PeintreFilm(r);
        pixels.current = new ImageData(r.entete.largeur, r.entete.hauteur);
        setFilm(r);
        // La fin de la partie d'abord : la carte la plus parlante, avant même de lancer le film.
        setImage(r.entete.images - 1);
        setEtat("pret");
      })
      .catch(() => {
        if (!annule) setEtat("erreur");
      });
    return () => {
      annule = true;
    };
  }, [partie, base, essai]);

  // Chaque image : posée sur la grille, peinte, puis copiée sur la toile.
  useEffect(() => {
    const ctx = toile.current?.getContext("2d");
    if (!film || !ctx || !bobine.current || !peintre.current || !pixels.current) return;
    bobine.current.aller(image);
    peintre.current.peindre(bobine.current.grille, pixels.current.data);
    ctx.putImageData(pixels.current, 0, 0);
  }, [film, image, etat]);

  // La lecture : tant d'images par seconde, selon la vitesse. Elle s'arrête à la dernière image.
  useEffect(() => {
    if (!lecture || !film) return;
    let raf = 0;
    let avant = performance.now();
    let reste = 0;
    const pas = (t: number) => {
      reste += (Math.min(ECART_MAX_MS, t - avant) / 1000) * IMAGES_PAR_SECONDE * vitesse;
      avant = t;
      const avance = Math.floor(reste);
      if (avance > 0) {
        reste -= avance;
        const suivante = Math.min(film.entete.images - 1, imageCourante.current + avance);
        setImage(suivante);
        if (suivante >= film.entete.images - 1) {
          setLecture(false);
          return;
        }
      }
      raf = requestAnimationFrame(pas);
    };
    raf = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(raf);
  }, [lecture, film, vitesse]);

  // Le bouton pause de l'en-tête arrête aussi le film, comme le passage du système à « réduire les animations ».
  useEffect(() => {
    const racine = document.documentElement;
    const observateur = new MutationObserver(() => {
      if (racine.classList.contains("fx-off")) setLecture(false);
    });
    observateur.observe(racine, { attributes: true, attributeFilter: ["class"] });
    const reduire = matchMedia("(prefers-reduced-motion: reduce)");
    const arreter = (ev: MediaQueryListEvent) => {
      if (ev.matches) setLecture(false);
    };
    reduire.addEventListener("change", arreter);
    return () => {
      observateur.disconnect();
      reduire.removeEventListener("change", arreter);
    };
  }, []);

  // La partie à l'écran est repérée dans la liste des derniers films, sous le lecteur (src/pages/revoir.astro).
  useEffect(() => {
    for (const lien of document.querySelectorAll<HTMLElement>("[data-revoir-partie]")) {
      if (lien.dataset.revoirPartie === partie) lien.setAttribute("aria-current", "true");
      else lien.removeAttribute("aria-current");
    }
  }, [partie]);

  const retombees = useMemo(() => (film ? contientRetombees(film) : false), [film]);

  if (dernier === null && partie === null) return null;
  if (etat === "absent" || etat === "ancien" || etat === "erreur") {
    return (
      <div class="card revoir-probleme" role="alert" data-testid="rejeu-probleme">
        <p class="font-display text-lg font-bold">{etat === "absent" ? "Pas de film pour cette partie" : etat === "ancien" ? "Ce navigateur ne sait pas ouvrir les films du site" : "Le film de cette partie n'a pas pu être chargé"}</p>
        {etat !== "erreur" && (
          <p class="mt-2 text-sm text-muted">
            {etat === "absent" ? `Seules les dernières parties sont filmées, ${jours} jours au plus, environ une heure après leur fin.` : "Une version récente de Firefox, Chrome, Edge ou Safari le peut."}
          </p>
        )}
        {etat === "erreur" && (
          <button type="button" class="btn btn-ghost mt-4" onClick={() => setEssai(essai + 1)}>
            Réessayer
          </button>
        )}
        {partie !== null && (
          <p class="mt-2">
            <a class="link" href={replayUrl(partie)} rel="noopener">
              Ouvrir la partie sur OpenFront
            </a>
          </p>
        )}
      </div>
    );
  }

  const e = film?.entete;
  const fin = e ? secondesDeLImage(e, e.images - 1) : 0;
  const maintenant = e ? secondesDeLImage(e, image) : 0;
  const auBout = e !== undefined && image >= e.images - 1;
  const lancer = () => {
    if (!e) return;
    if (auBout) setImage(0);
    setLecture(!lecture);
  };

  return (
    <section class="stage stage-blue revoir" aria-labelledby="rejeu-titre" aria-busy={etat === "charge"} data-testid="rejeu">
      <div class="revoir-tete">
        <h2 id="rejeu-titre" class="revoir-titre">
          {e ? `${mapLabel(e.carte)}, ${fmtDayAndTime(e.debut)}` : "Chargement du film…"}
        </h2>
        {e && (
          <span class="revoir-resultat" data-resultat={e.victoire ? "victoire" : "defaite"} data-testid="rejeu-resultat">
            <i aria-hidden="true" />
            {e.victoire ? "Victoire" : "Défaite"}
          </span>
        )}
      </div>

      {/* La carte et sa barre de lecture d'un côté, les faits de la partie et la légende de l'autre (dessous sur téléphone). */}
      <div class="revoir-corps" style={e ? { "--revoir-forme": String(e.largeur / e.hauteur) } : undefined}>
        <div class="revoir-scene">
          {/* Le fond du cadre : la mer de nuit de la carte, posée depuis sa constante (carte-dessin.ts). */}
          <div class="revoir-ecran" style={{ "--revoir-mer": MER_FINALE_CSS }}>
            <canvas
              ref={toile}
              width={e?.largeur ?? 1}
              height={e?.hauteur ?? 1}
              role="img"
              aria-label={e ? `Carte de la partie à ${dureeDite(maintenant)} sur ${dureeDite(fin)} : qui tient chaque territoire, selon la légende.` : "Carte de la partie, en chargement"}
              data-testid="rejeu-toile"
            />
          </div>

          <div class="revoir-transport">
            <button type="button" class="btn btn-secondary revoir-lecture" disabled={!e} onClick={lancer} data-testid="rejeu-lecture">
              <svg viewBox="0 0 14 14" width="14" height="14" fill="currentColor" aria-hidden="true">
                <path d={lecture ? "M2 1h3.5v12H2zM8.5 1H12v12H8.5z" : "M2 1l11 6-11 6z"} />
              </svg>
              {lecture ? "Pause" : auBout ? "Revoir" : "Lecture"}
            </button>
            <label class="revoir-temps">
              <span class="sr-only">Moment de la partie</span>
              <input
                class="film-range"
                type="range"
                min={0}
                max={e ? e.images - 1 : 0}
                step={1}
                value={image}
                disabled={!e}
                aria-valuetext={`${dureeDite(maintenant)} sur ${dureeDite(fin)}`}
                onInput={(ev) => {
                  setLecture(false);
                  setImage(Number(ev.currentTarget.value));
                }}
                data-testid="rejeu-temps"
              />
            </label>
            {/* Pas d'horloge avant le film : « 0:00 » dirait une durée qui n'existe pas encore. */}
            {e && (
              <span class="tnum revoir-horloge" aria-hidden="true" data-testid="rejeu-horloge">
                {horloge(maintenant)} / {horloge(fin)}
              </span>
            )}
            <div class="film-speed revoir-vitesse">
              <label for="rejeu-vitesse">Vitesse</label>
              <input
                id="rejeu-vitesse"
                class="film-range"
                type="range"
                min={SPEED_MIN}
                max={SPEED_MAX}
                step={SPEED_STEP}
                value={vitesse}
                aria-valuetext={speedText(vitesse)}
                onInput={(ev) => setVitesse(filmSpeed(Number(ev.currentTarget.value)))}
              />
              <output for="rejeu-vitesse" class="tnum" aria-hidden="true">
                {speedLabel(vitesse)}
              </output>
            </div>
          </div>
        </div>

        <div class="revoir-fiche">
          {e && (
            <dl class="revoir-faits tnum">
              <div>
                <dt>Format</dt>
                <dd>{formatLabel(e.equipes)}</dd>
              </div>
              <div>
                <dt>Gaulois</dt>
                <dd>
                  {fmtInt(e.gaulois)} sur {fmtInt(e.joueurs)} joueurs
                </dd>
              </div>
              <div>
                <dt>Rejoué</dt>
                <dd>{dureeDite(fin)}</dd>
              </div>
            </dl>
          )}
          {film && <Legende film={film} retombees={retombees} tag={tag} />}
          {partie !== null && (
            <p class="revoir-sortie">
              <a class="link" href={replayUrl(partie)} rel="noopener" data-testid="rejeu-openfront">
                Ouvrir la partie sur OpenFront
              </a>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
