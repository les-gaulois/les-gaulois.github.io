import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { COULEUR_RETOMBEES, MER_FINALE_CSS, type Rgb } from "../lib/carte-dessin";
import { fmtDayAndTime, fmtInt } from "../lib/format";
import { filmSpeed, speedLabel, speedText, SPEED_MAX, SPEED_MIN, SPEED_STEP } from "../lib/fx/speed";
import { replayUrl } from "../lib/journal";
import { mapLabel } from "../lib/map-names";
import { DessinateurDetails, type ChoixDetails } from "../lib/rejeu/details";
import { ficheDuLecteur } from "../lib/rejeu/fiche-du-lecteur";
import { Bobine, CLASSE, CONSTRUCTIONS, COULEURS_DES_CLASSES, contientRetombees, decompresser, dureeDite, etiquettesDe, horloge, lireFilm, PeintreFilm, secondesDeLImage, UNITES, unitesDuFilm, type Film } from "../lib/rejeu/film";
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
  /** Le vrai lecteur du jeu de chaque partie qui l'a, sur son site à lui (`https://<…>.github.io/jeu/<version>/#replay-viewer=<partie>`). */
  jeux?: Record<string, string>;
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

/** Le côté d'une icône de la légende, en pixels CSS : deux fois la case d'un sprite du jeu, qui s'agrandit en pixels entiers. */
const COTE_ICONE = 26;

/** Une unité de la légende : la vraie icône du jeu, dessinée comme sur la carte, dans la couleur des Gaulois. */
function IconeUnite({ dessinateur, code, chantier = false }: { dessinateur: DessinateurDetails; code: number; chantier?: boolean }) {
  const toile = useRef<HTMLCanvasElement>(null);
  const [cote, setCote] = useState(COTE_ICONE);
  useEffect(() => setCote(COTE_ICONE * Math.max(1, Math.round(devicePixelRatio || 1))), []);
  useEffect(() => {
    const ctx = toile.current?.getContext("2d");
    if (ctx) dessinateur.dessinerIcone(ctx, code, CLASSE.gaulois, cote, chantier);
  }, [dessinateur, code, chantier, cote]);
  return <canvas ref={toile} class="revoir-icone" width={cote} height={cote} aria-hidden="true" />;
}

/**
 * La légende des unités : celles qui paraissent dans ce film, chacune avec son icône du jeu et son nom. Elle attend les
 * planches d'icônes : sans elles, une liste de noms ne dirait rien de la carte.
 */
function LegendeUnites({ film, dessinateur }: { film: Film; dessinateur: DessinateurDetails }) {
  const codes = useMemo(() => [...unitesDuFilm(film)].sort((a, b) => a - b), [film]);
  if (codes.length === 0) return null;
  const chantier = codes.find((c) => c < CONSTRUCTIONS);
  return (
    <ul class="revoir-unites" aria-label="Légende des constructions et des unités" data-testid="rejeu-unites">
      {codes.map((c) => (
        <li key={c}>
          <IconeUnite dessinateur={dessinateur} code={c} />
          {UNITES[c]}
        </li>
      ))}
      {chantier !== undefined && (
        <li>
          <IconeUnite dessinateur={dessinateur} code={chantier} chantier />
          En chantier
        </li>
      )}
    </ul>
  );
}

/**
 * Le lecteur des films de parties (page « Revoir une partie ») : la carte de la partie, rejouée par le moteur du jeu, image par
 * image, avec la lecture, la barre du temps et la vitesse. Le film est un fichier statique du site : le navigateur n'appelle
 * jamais OpenFront. Rien ne part tout seul : la lecture attend le visiteur, et le bouton pause de l'en-tête l'arrête.
 */
export default function RejeuPartie({ base, dernier, jours, tag, jeux = {} }: Props) {
  const [partie, setPartie] = useState<string | null>(null);
  const [etat, setEtat] = useState<Etat>("charge");
  const [film, setFilm] = useState<Film | null>(null);
  const [image, setImage] = useState(0);
  const [lecture, setLecture] = useState(false);
  const [vitesse, setVitesse] = useState(SPEED_MAX);
  const [essai, setEssai] = useState(0);
  const [choix, setChoix] = useState<ChoixDetails>({ noms: true, unites: true });
  // La taille de la toile des détails, en pixels de l'écran : celle de la carte affichée.
  const [taille, setTaille] = useState<{ l: number; h: number } | null>(null);
  const toile = useRef<HTMLCanvasElement>(null);
  const toileDetails = useRef<HTMLCanvasElement>(null);
  // Les icônes du jeu (public/openfront/) : sans elles, les constructions gardent leur forme, sans icône.
  const dessinateur = useRef(new DessinateurDetails(null));
  const [planches, setPlanches] = useState(false);
  const bobine = useRef<Bobine | null>(null);
  const peintre = useRef<PeintreFilm | null>(null);
  const pixels = useRef<ImageData | null>(null);
  const imageCourante = useRef(0);
  imageCourante.current = image;

  useEffect(() => setPartie(partieDeLAdresse() ?? dernier), [dernier]);

  // Le vrai lecteur du jeu de cette partie : sa fiche est demandée à son site avant de montrer le cadre. Jamais sur l'adresse
  // de cette page : le cadre laisse ses scripts tourner, ils ne doivent le faire qu'à part (src/lib/rejeu/lecteur-jeu.ts).
  const jeuDemande = partie !== null ? jeux[partie] : undefined;
  const [jeuEtat, setJeuEtat] = useState<"verif" | "pret" | "absent">("verif");
  useEffect(() => {
    if (jeuDemande === undefined) return;
    const fiche = ficheDuLecteur(jeuDemande);
    if (fiche === null || new URL(fiche).origin === window.location.origin) {
      setJeuEtat("absent");
      return;
    }
    let annule = false;
    setJeuEtat("verif");
    fetch(fiche, { method: "HEAD", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" })
      .then((r) => {
        if (!annule) setJeuEtat(r.ok ? "pret" : "absent");
      })
      .catch(() => {
        if (!annule) setJeuEtat("absent");
      });
    return () => {
      annule = true;
    };
  }, [jeuDemande]);

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

  // La toile des détails suit la taille de la carte à l'écran, en pixels réels : noms et icônes restent nets.
  useEffect(() => {
    const cadre = toileDetails.current?.parentElement;
    if (!cadre || typeof ResizeObserver === "undefined") return;
    const mesurer = () => {
      const r = devicePixelRatio || 1;
      setTaille({ l: Math.max(1, Math.round(cadre.clientWidth * r)), h: Math.max(1, Math.round(cadre.clientHeight * r)) });
    };
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(cadre);
    mesurer();
    return () => observateur.disconnect();
  }, [film]);

  // Les deux planches d'icônes du jeu, chargées une fois.
  useEffect(() => {
    const charger = (src: string) =>
      new Promise<HTMLImageElement>((ok, ko) => {
        const img = new Image();
        img.onload = () => ok(img);
        img.onerror = () => ko(new Error(src));
        img.src = src;
      });
    let annule = false;
    Promise.all([charger(`${base}/openfront/icon-atlas.png`), charger(`${base}/openfront/unit-atlas.png`)])
      .then(([icones, unites]) => {
        if (annule) return;
        dessinateur.current = new DessinateurDetails({ icones, unites });
        setPlanches(true);
      })
      .catch(() => {});
    return () => {
      annule = true;
    };
  }, [base]);

  // Les noms et les unités de l'image montrée, par-dessus la carte (après elle : la bobine est à la bonne image).
  useEffect(() => {
    const ctx = toileDetails.current?.getContext("2d");
    if (!film || !ctx || !bobine.current || !taille) return;
    bobine.current.aller(image);
    dessinateur.current.dessiner(ctx, film, bobine.current.unites.values(), etiquettesDe(film, image), choix, taille.l, taille.h, devicePixelRatio || 1);
  }, [film, image, etat, choix, taille, planches]);

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
  // Le replay du jeu seul, sauf si sa fiche manque sur son site (dépôt en panne ou en retard) : le film, alors, en secours.
  const jeu = jeuDemande !== undefined && jeuEtat !== "absent" ? jeuDemande : undefined;
  const montreLeJeu = jeu !== undefined;
  const fin = e ? secondesDeLImage(e, e.images - 1) : 0;
  const maintenant = e ? secondesDeLImage(e, image) : 0;
  const auBout = e !== undefined && image >= e.images - 1;
  const lancer = () => {
    if (!e) return;
    if (auBout) setImage(0);
    setLecture(!lecture);
  };

  return (
    <section class="revoir" aria-labelledby="rejeu-titre" aria-busy={etat === "charge"} data-testid="rejeu" style={{ "--revoir-mer": MER_FINALE_CSS }}>
      {/* La mer de nuit de la carte (`--revoir-mer`, posée sur la section depuis sa constante de carte-dessin.ts) : le fond
          du film et des icônes de sa légende. */}
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
      {/* Le cadre d'un côté, les faits de la partie de l'autre (dessous quand la place manque). Une partie qui a le vrai lecteur
          de replay du jeu (src/lib/rejeu/lecteur-jeu.ts) ne montre que lui ; le film du site est son secours. */}
      <div class="revoir-corps" style={e ? { "--revoir-forme": String(e.largeur / e.hauteur) } : undefined}>
        {/* Le vrai lecteur du jeu, dans un cadre à la forme de la carte : elle le remplit, sans fond autour. Il vient d'un autre site : enfermé (`sandbox`), sans autre droit que ses
            scripts, son propre stockage et ses liens en nouvel onglet. Il s'ouvre en pause : le visiteur le lance. */}
        {montreLeJeu && (
          <div class="revoir-scene">
            {/* Cadre vide le temps de vérifier que la fiche de la partie est bien sur le site du lecteur. */}
            {/* Obstacle du compagnon : à l'arrêt, il se tient à côté du lecteur et de son bandeau « © OpenFront and Contributors ». */}
            <div class="revoir-cadre" aria-busy={jeuEtat !== "pret"} data-compagnon-obstacle>
              {jeuEtat === "pret" && (
                <iframe
                  key={partie}
                  src={jeu}
                  title={e ? `Replay du jeu OpenFront : ${mapLabel(e.carte)}, ${fmtDayAndTime(e.debut)}` : "Replay du jeu OpenFront"}
                  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                  allow="fullscreen"
                  allowFullScreen
                  referrerpolicy="no-referrer"
                  loading="lazy"
                  data-testid="rejeu-jeu-cadre"
                />
              )}
            </div>
          </div>
        )}
        {/* Le film reste dans la page, masqué : ses toiles sont prêtes si la fiche du lecteur manque. */}
        <div class="revoir-scene" hidden={montreLeJeu}>
          <div class="revoir-ecran">
            <canvas
              ref={toile}
              width={e?.largeur ?? 1}
              height={e?.hauteur ?? 1}
              role="img"
              aria-label={e ? `Carte de la partie à ${dureeDite(maintenant)} sur ${dureeDite(fin)} : qui tient chaque territoire, selon la légende.` : "Carte de la partie, en chargement"}
              data-testid="rejeu-toile"
            />
            {/* Les noms et les unités, dessinés à la taille de l'écran ; la carte dessous dit déjà ce qu'elle montre. */}
            <canvas ref={toileDetails} class="revoir-details" width={taille?.l ?? 1} height={taille?.h ?? 1} aria-hidden="true" data-testid="rejeu-details" />
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
          {/* Les légendes et les cases ne parlent que du film : le jeu a ses propres couleurs. */}
          {film && !montreLeJeu && <Legende film={film} retombees={retombees} tag={tag} />}
          {film && !montreLeJeu && planches && <LegendeUnites film={film} dessinateur={dessinateur.current} />}
          {film && !montreLeJeu && (
            <fieldset class="revoir-choix" data-testid="rejeu-choix">
              <legend>Sur la carte</legend>
              <label>
                <input type="checkbox" checked={choix.noms} onChange={(ev) => setChoix({ ...choix, noms: ev.currentTarget.checked })} />
                Noms
              </label>
              <label>
                <input type="checkbox" checked={choix.unites} onChange={(ev) => setChoix({ ...choix, unites: ev.currentTarget.checked })} />
                Constructions et unités
              </label>
            </fieldset>
          )}
          {partie !== null && (
            <p class="revoir-sortie">
              {jeu !== undefined && (
                <a class="link" href={jeu} target="_blank" rel="noopener" data-testid="rejeu-jeu">
                  Ouvrir le replay en grand
                  <span class="sr-only"> (nouvel onglet)</span>
                </a>
              )}
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
