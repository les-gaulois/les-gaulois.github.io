import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ServerError, basePath, call } from "../../lib/compte/api";
import { Loading, Problem } from "../compte/common";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, OBJETS, RARETES_DES_OBJETS, casesDuGaulois, changerObjet, tenueDuServeur, vignetteDeLObjet, type Tenue } from "../../lib/gaulois";
import { albumDuPalier, rognerLeDessin } from "../../lib/village/album-pochette";
import { objetsDeLaPochette } from "../../lib/village/boutique";
import type { MonSentier, ObjetPossede, PalierDuSentier, PalierReponse, RareteDePalier, RefObjet } from "../../lib/village/contrat";
import { instant, lireAchat, lireBoutique, manque, objetPayant, points } from "../../lib/village/ecran-boutique";
import {
  NOMS_DES_MISSIONS,
  PALIERS_PAR_RANGEE,
  apresLEtal,
  apresLePalier,
  avancee,
  avantLeCadeau,
  casesDuCalendrier,
  etatDuPalier,
  jourEnMots,
  joursDeLaSaison,
  joursRestants,
  lireMonSentier,
  lirePalierPris,
  messageDuRefusDuSentier,
  motPas,
  palierAtteint,
  paliersAPrendre,
  part,
  partDuDefi,
  raisonEtalFerme,
  rangeeMontree,
  remplissageDuRail,
  versLeSuivant,
} from "../../lib/village/sentier";
import { AlbumDePochette } from "./AlbumPochette";
import { useBannieres } from "./Bannieres";
import { CaseMontree, Dialogue, DialogueAchat, ObjetRecu, type Issue } from "./BoutiqueDialogue";
import { useJoie } from "./Cases";
import { preparerLeSonSiVoulu } from "./Tambour";
import { MarqueDeRarete, Pixels, Prix, peindre } from "./BoutiquePixels";
import { sansCadre } from "../../lib/village/decor-banniere";
import { DESSINS_DES_MISSIONS, EPEE_DES_MISSIONS, casesDuChaudron, pochetteDeRarete, type DessinDuSentier } from "./SentierDessins";

const ILLISIBLE = "La réponse du serveur est illisible. Rechargez la page.";

type EtatDuSentier = { kind: "lecture" } | { kind: "panne" } | { kind: "pret"; sentier: MonSentier };

/**
 * Le sentier du compte : sa lecture (`get_mon_sentier`, qui coche le jour de visite et valide les missions), un palier
 * pris (`prendre_palier`) et l'achat à l'étal (`acheter_a_l_etal`). `VillageApp` le lit dès que la page s'ouvre, et à
 * chaque retour sur son onglet : l'onglet dit ainsi combien d'objets attendent. Après un refus, il se relit.
 */
export function useSentier() {
  const [etat, setEtat] = useState<EtatDuSentier>({ kind: "lecture" });

  const lire = useCallback(async (discret = false): Promise<MonSentier | null> => {
    const sentier = await call<unknown>("get_mon_sentier").then(lireMonSentier, () => null);
    // Une relecture qui échoue garde ce qui est à l'écran : la panne ne se dit que si rien n'a encore été lu.
    if (sentier) setEtat({ kind: "pret", sentier });
    else if (!discret) setEtat((e) => (e.kind === "pret" ? e : { kind: "panne" }));
    return sentier;
  }, []);

  const prendre = useCallback(
    async (palier: number): Promise<Issue<PalierReponse>> => {
      try {
        const recu = lirePalierPris(await call<unknown>("prendre_palier", { p_palier: palier }));
        if (!recu) {
          void lire(true);
          return { ok: false, message: ILLISIBLE };
        }
        setEtat((e) => (e.kind === "pret" ? { kind: "pret", sentier: apresLePalier(e.sentier, recu) } : e));
        return { ok: true, valeur: recu };
      } catch (e) {
        void lire(true);
        return { ok: false, message: messageDuRefusDuSentier(e instanceof ServerError ? e.code : "network") };
      }
    },
    [lire],
  );

  const acheter = useCallback(
    async (ref: RefObjet, prix: number): Promise<Issue<number>> => {
      try {
        const achat = lireAchat(await call<unknown>("acheter_a_l_etal", { p_emplacement: ref.emplacement, p_objet: ref.objet, p_prix_vu: prix }));
        if (!achat) {
          void lire(true);
          return { ok: false, message: ILLISIBLE };
        }
        setEtat((e) => (e.kind === "pret" ? { kind: "pret", sentier: apresLEtal(e.sentier, achat.solde) } : e));
        return { ok: true, valeur: achat.solde };
      } catch (e) {
        const fraiche = await lire(true);
        return { ok: false, message: messageDuRefusDuSentier(e instanceof ServerError ? e.code : "network", { manque: fraiche ? manque(fraiche.solde, prix) : null }) };
      }
    },
    [lire],
  );

  return { etat, lire, prendre, acheter };
}

export type Sentier = ReturnType<typeof useSentier>;

/** Ce que l'onglet annonce : les objets des paliers atteints qui attendent d'être pris. */
export function objetsQuiAttendent(sentier: Sentier): number {
  return sentier.etat.kind === "pret" ? paliersAPrendre(sentier.etat.sentier) : 0;
}

/** Une barre d'avancée, décorative : ce qu'elle montre est toujours écrit à côté. */
function Barre({ fait, cible }: { fait: number; cible: number }) {
  return (
    <span class="sentier-barre" aria-hidden="true">
      <i style={`width:${part(fait, cible)}%`} />
    </span>
  );
}

/** Un dessin du sentier, à un nombre entier de pixels par case. */
function Dessin({ dessin, echelle, class: classe = "" }: { dessin: DessinDuSentier; echelle: number; class?: string }) {
  return <Pixels largeur={dessin.largeur} hauteur={dessin.hauteur} cases={dessin.cases} echelle={echelle} class={classe} />;
}

/** Les colonnes de la piste, comme la feuille de style les pose : trois sur téléphone, cinq, puis dix. */
function useColonnes(): number {
  const lire = (): number => (typeof matchMedia !== "function" ? PALIERS_PAR_RANGEE : matchMedia("(min-width: 1180px)").matches ? PALIERS_PAR_RANGEE : matchMedia("(min-width: 560px)").matches ? 5 : 3);
  const [colonnes, setColonnes] = useState(lire);
  useEffect(() => {
    const relire = (): void => setColonnes(lire());
    window.addEventListener("resize", relire);
    return () => window.removeEventListener("resize", relire);
  }, []);
  return colonnes;
}

/**
 * Le décor du sentier : la bannière que le membre montre sur /gaulois, sans son cadre, étirée derrière la piste. Décorative :
 * son nom est écrit dans la pastille. Le voile qui porte la piste prend la teinte sombre de la bannière.
 */
function Decor({ decor }: { decor: DessinDuSentier }) {
  const toile = useRef<HTMLCanvasElement>(null);
  useEffect(() => peindre(toile.current, decor.largeur, decor.hauteur, decor.cases), [decor]);
  return (
    <>
      <canvas ref={toile} width={decor.largeur} height={decor.hauteur} class="pixels sentier-fond" aria-hidden="true" data-testid="sentier-fond" />
      <span class="sentier-voile" aria-hidden="true" />
    </>
  );
}

/** La teinte du voile : la couleur moyenne de la bannière, très assombrie, en « r, g, b ». */
function teinteDuVoile(cases: readonly (string | null)[]): string {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const couleur of cases) {
    if (!couleur || !/^#[0-9a-f]{6}$/i.test(couleur)) continue;
    r += parseInt(couleur.slice(1, 3), 16);
    g += parseInt(couleur.slice(3, 5), 16);
    b += parseInt(couleur.slice(5, 7), 16);
    n++;
  }
  if (n === 0) return "10, 18, 48";
  return `${Math.round((r / n) * 0.22)}, ${Math.round((g / n) * 0.22)}, ${Math.round((b / n) * 0.3 + 14)}`;
}

function Missions({ sentier }: { sentier: MonSentier }) {
  const faites = sentier.missions.filter((m) => m.gagnee).length;
  return (
    <section class="sentier-carte" data-ton="bleu" aria-labelledby="sentier-missions-titre" data-testid="sentier-missions">
      <div class="sentier-carte-tete">
        <span class="sentier-carte-dessin" aria-hidden="true">
          <Dessin dessin={EPEE_DES_MISSIONS} echelle={4} />
        </span>
        <div>
          <h4 id="sentier-missions-titre">Les missions du jour</h4>
          <small class="tnum">
            {faites} {faites > 1 ? "faites" : "faite"} sur {sentier.missions.length}
          </small>
        </div>
        <span class="sentier-gain tnum">{motPas(sentier.regles.mission)} chacune</span>
      </div>
      <ul class="sentier-missions">
        {sentier.missions.map((mission) => {
          const ou = avancee(mission);
          const image = DESSINS_DES_MISSIONS[mission.code];
          return (
            <li key={mission.code} class="sentier-mission" data-faite={mission.gagnee ? "" : undefined} data-testid={`mission-${mission.code}`}>
              <span class="sentier-tuile" aria-hidden="true">
                <Dessin dessin={image} echelle={image.largeur > 20 ? 1 : image.largeur > 12 ? 2 : 3} />
              </span>
              <span class="sentier-mission-nom">{NOMS_DES_MISSIONS[mission.code]}</span>
              <span class="sentier-mission-suite">
                {mission.gagnee ? (
                  <span>Faite</span>
                ) : ou ? (
                  <>
                    <Barre fait={mission.fait} cible={mission.cible} />
                    <span class="sentier-ou tnum">{ou}</span>
                  </>
                ) : (
                  <span>À faire</span>
                )}
              </span>
              <span class="sentier-xp tnum">{motPas(sentier.regles.mission)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Defi({ sentier }: { sentier: MonSentier }) {
  const defi = sentier.defi;
  if (!defi) return null;
  const rempli = defi.points >= defi.cible;
  const fait = partDuDefi(defi.points, defi.cible);
  const carte = `${basePath()}/openfront/france.webp`;
  return (
    <section class="sentier-carte" data-ton="or" aria-labelledby="sentier-defi-titre" data-testid="sentier-defi" data-rempli={rempli ? "" : undefined}>
      <div class="sentier-carte-tete">
        <span class="sentier-carte-dessin" aria-hidden="true">
          <Dessin dessin={casesDuChaudron(fait / 100)} echelle={2} />
        </span>
        <div>
          <h4 id="sentier-defi-titre">Le défi du clan</h4>
          <small>À nous tous, aujourd'hui</small>
        </div>
        <span class="sentier-gain tnum">{motPas(sentier.regles.defi)}</span>
      </div>
      <div class="sentier-defi-corps">
        <div>
          <p class="sentier-chiffre">
            <strong class="tnum">{points(defi.points)}</strong>
            <span class="tnum">sur {defi.cible} points rapportés au clan aujourd'hui</span>
          </p>
          <Barre fait={defi.points} cible={defi.cible} />
        </div>
        {/* La carte de France du jeu (OpenFront, CC BY-SA 4.0) se colore à la part faite du défi : décorative, le chiffre est écrit à côté. */}
        <div class="sentier-gaule" style={`--part:${fait}%;--carte:url(${carte})`} aria-hidden="true">
          <img src={carte} alt="" width="606" height="606" loading="lazy" decoding="async" />
          <span class="sentier-gaule-prise" />
          <span class="sentier-gaule-front">
            <b class="tnum">{fait} %</b>
          </span>
        </div>
      </div>
      <p class="sentier-note" data-testid="sentier-defi-regle">
        {defi.gagne
          ? `Rempli : vous avez reçu ${motPas(sentier.regles.defi)}.`
          : rempli
            ? `Rempli. Jouez une partie du clan aujourd'hui pour recevoir ${motPas(sentier.regles.defi)}.`
            : `Rempli, il donne ${motPas(sentier.regles.defi)} à chaque membre qui a joué une partie du clan aujourd'hui${defi.joue ? " : vous en êtes" : ""}.`}
      </p>
    </section>
  );
}

function Calendrier({ sentier }: { sentier: MonSentier }) {
  const { cochees, cases } = casesDuCalendrier(sentier.visites, sentier.regles.tous_les);
  const avant = avantLeCadeau(sentier.visites, sentier.regles.tous_les);
  const cadeau = pochetteDeRarete("legendaire");
  return (
    <section class="sentier-carte" data-ton="vert" aria-labelledby="sentier-calendrier-titre" data-testid="sentier-calendrier">
      <div class="sentier-carte-tete">
        <span class="sentier-carte-dessin" aria-hidden="true">
          <Dessin dessin={cadeau} echelle={2} />
        </span>
        <div>
          <h4 id="sentier-calendrier-titre">Le calendrier</h4>
          <small class="tnum">
            {cochees} {cochees > 1 ? "jours" : "jour"} de visite sur {cases}
          </small>
        </div>
        <span class="sentier-gain tnum">{motPas(sentier.regles.visite)} par jour</span>
      </div>
      <ol class="sentier-semaine" aria-label={`${cochees} ${cochees > 1 ? "jours" : "jour"} de visite sur ${cases}`}>
        {Array.from({ length: cases }, (_, i) => (
          <li key={i} data-cochee={i < cochees ? "" : undefined} data-cadeau={i === cases - 1 ? "" : undefined}>
            {i < cochees ? (
              <span class="sr-only">fait</span>
            ) : i === cases - 1 ? (
              <>
                <Dessin dessin={cadeau} echelle={1} />
                <span class="tnum">+{motPas(sentier.regles.semaine)}</span>
              </>
            ) : (
              <span class="tnum">{i + 1}</span>
            )}
          </li>
        ))}
      </ol>
      <p class="sentier-prochain tnum" data-testid="sentier-prochain">
        {avant > 0 ? `Encore ${avant} ${avant > 1 ? "jours" : "jour"} de visite avant le cadeau de ${motPas(sentier.regles.semaine)}.` : `La rangée est pleine : le cadeau de ${motPas(sentier.regles.semaine)} est gagné.`}
      </p>
      <p class="sentier-note">Chaque jour de visite donne {motPas(sentier.regles.visite)}. Un jour manqué ne retire rien.</p>
    </section>
  );
}

function Etal({ sentier, onAcheter }: { sentier: MonSentier; onAcheter: () => void }) {
  const etal = sentier.etal;
  const ref = etal ? objetPayant(etal.emplacement, etal.objet) : null;
  if (!etal || !ref) return null;
  const raison = raisonEtalFerme(sentier, etal);
  return (
    <section class="sentier-carte sentier-etal" data-ton="violet" aria-labelledby="sentier-etal-titre" data-testid="sentier-etal">
      <div class="sentier-carte-tete">
        <div>
          <h4 id="sentier-etal-titre">L'étal du jour</h4>
          <small>Il change à minuit</small>
        </div>
        <span class="sentier-gain tnum">{sentier.regles.remise} % moins cher</span>
      </div>
      <div class="sentier-etal-corps">
        <CaseMontree objet={ref.fiche} rarete={ref.fiche.rarete} vignette={vignetteDeLObjet(ref.emplacement, ref.objet)} />
        <div class="sentier-etal-prix">
          <Prix montant={etal.prix} class="pochette-prix" />
          <span class="sentier-ancien-prix">
            <span class="sr-only">au lieu de </span>
            <s class="tnum">{etal.prix_boutique}</s>
            <span class="sr-only"> statères</span> à la boutique
          </span>
          {raison ? (
            <p class="pochette-raison" data-testid="sentier-etal-raison">
              {raison}
            </p>
          ) : (
            <button type="button" class="btn btn-secondary" onClick={onAcheter} data-testid="sentier-etal-acheter">
              Acheter
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/** Le Gaulois du membre, debout sur la route à son palier. Décoratif : le palier atteint est écrit dans la tête du sentier. */
function Moi({ gaulois }: { gaulois: DessinDuSentier | null }) {
  // Il saute de joie quand un palier vient d'être pris (la fenêtre de l'objet reçu se ferme).
  const moi = useRef<HTMLSpanElement>(null);
  useJoie(moi, moi);
  return (
    <span ref={moi} class="sentier-moi" aria-hidden="true">
      <b>Vous</b>
      {gaulois && <Dessin dessin={gaulois} echelle={2} />}
    </span>
  );
}

function Palier({
  palier,
  atteint,
  seuil,
  fait,
  jalon,
  rangeeDeMoi,
  moi,
  gaulois,
  occupe,
  inventaire,
  onPrendre,
}: {
  palier: PalierDuSentier;
  atteint: number;
  seuil: number;
  /** La part dorée du rail dans cette case, de 0 à 100. */
  fait: number;
  jalon: boolean;
  /** La case est dans la rangée où se tient le Gaulois : toute la rangée lui laisse sa hauteur. */
  rangeeDeMoi: boolean;
  /** Le Gaulois se tient sur ce palier ; « depart » : avant le premier, au bord de la route. */
  moi: "ici" | "depart" | null;
  gaulois: DessinDuSentier | null;
  occupe: boolean;
  inventaire: readonly ObjetPossede[] | null;
  onPrendre: () => void;
}) {
  const etat = etatDuPalier(palier, atteint);
  const pris = palier.pris ? objetPayant(palier.pris.emplacement, palier.pris.objet) : null;
  const vignette = pris ? vignetteDeLObjet(pris.emplacement, pris.objet) : null;
  const echelle = vignette ? Math.max(1, Math.min(2, Math.floor(64 / Math.max(vignette.largeur, vignette.hauteur)))) : 1;
  const lireAlbum = useCallback(() => albumDuPalier(palier.palier, palier.rarete, inventaire), [palier.palier, palier.rarete, inventaire]);
  const nomDeRarete = RARETES_DES_OBJETS[palier.rarete].nom.toLowerCase();
  return (
    <li class="sentier-pas" data-etat={etat} data-rarete={palier.rarete} data-jalon={jalon ? "" : undefined} data-avec-moi={rangeeDeMoi ? "" : undefined} style={`--fait:${fait}%`} data-testid={`palier-${palier.palier}`}>
      <span class="sentier-noeud tnum">
        <span>
          <span class="sr-only">Palier </span>
          {palier.palier}
        </span>
      </span>
      {moi && (
        <span class="sentier-moi-place" data-depart={moi === "depart" ? "" : undefined}>
          <Moi gaulois={gaulois} />
        </span>
      )}
      <div class="case sentier-case" data-rarete={palier.rarete} title={etat === "pris" && pris ? pris.fiche.nom : undefined}>
        {etat === "pris" ? (
          <>
            <span class="case-image">{vignette && <Pixels largeur={vignette.largeur} hauteur={vignette.hauteur} cases={vignette.cases} echelle={echelle} class="case-dessin" />}</span>
            <MarqueDeRarete rarete={palier.rarete} />
            <span class="sentier-sceau" aria-hidden="true" />
            <span class="sr-only">{pris ? `${pris.fiche.nom}, pris` : "pris"}</span>
          </>
        ) : (
          <>
            <span class="case-image">
              <AlbumDePochette lireAlbum={lireAlbum} nombre={nombreDObjets(palier.rarete)} nom={`Voir ce que peut donner le palier ${palier.palier}, un objet ${nomDeRarete}`} testid={`palier-${palier.palier}`}>
                <Dessin dessin={pochetteDeRarete(palier.rarete)} echelle={2} class="sentier-sac" />
              </AlbumDePochette>
            </span>
            <MarqueDeRarete rarete={palier.rarete} />
            {etat === "a-prendre" ? (
              <button type="button" class="btn btn-primary sentier-prendre" disabled={occupe} onClick={onPrendre} data-testid={`palier-prendre-${palier.palier}`}>
                Prendre<span class="sr-only"> l'objet du palier {palier.palier}</span>
              </button>
            ) : (
              <span class="sentier-seuil tnum">à {motPas(seuil)}</span>
            )}
          </>
        )}
      </div>
    </li>
  );
}

const NOMBRES = new Map<RareteDePalier, number>();
/** Combien d'objets payants compte une rareté : ce que dit le bouton de l'album. Compté une fois par rareté. */
function nombreDObjets(rarete: RareteDePalier): number {
  let n = NOMBRES.get(rarete);
  if (n === undefined) NOMBRES.set(rarete, (n = objetsDeLaPochette(rarete).length));
  return n;
}

type Fenetre = { kind: "palier"; recu: PalierReponse } | { kind: "etal" } | null;

/** Les raretés des paliers de la saison, de la plus courante à la plus rare : la légende de la piste. */
const ORDRE: readonly RareteDePalier[] = ["commun", "peu-commun", "epique", "mystique", "legendaire"];

/**
 * « Le sentier », onglet de « Mon Gaulois » (16 novembre 2026, demande du pilote : « un peu comme un passe de combat » ;
 * dessin choisi par lui sur maquettes le même jour). En haut, la bannière que le membre montre sur /gaulois pour seul
 * décor, la saison et ses XP ; dessous, une route de pavés, une dalle par palier, sa pochette à la couleur de la rareté,
 * dont l'album s'ouvre au survol ; la piste ne montre d'abord qu'une rangée de dix, celle du premier objet à prendre, sinon
 * celle du palier suivant. Puis « Aujourd'hui » :
 * les trois missions, le défi du clan, le calendrier, l'étal. Tout vient du serveur : l'écran ne compte aucun XP.
 * Rien n'est du temps réel : l'heure du dernier relevé des parties est écrite.
 */
export default function LeSentier({ sentier: s }: { sentier: Sentier }) {
  const [fenetre, setFenetre] = useState<Fenetre>(null);
  const [occupe, setOccupe] = useState(false);
  const [probleme, setProbleme] = useState<string | null>(null);
  const [reussite, setReussite] = useState<string | null>(null);
  /** La piste entière, ou seulement la rangée du membre ; `null` tant qu'il n'a rien choisi. */
  const [tout, setTout] = useState<boolean | null>(null);
  const [tenue, setTenue] = useState<Tenue | null>(null);
  const [inventaire, setInventaire] = useState<ObjetPossede[] | null>(null);
  const colonnes = useColonnes();
  // La bannière du membre, son Gaulois et ce qu'il possède ne sont que de l'habillage : une panne les laisse de côté, le
  // sentier se lit quand même.
  const bannieres = useBannieres({ leger: true });
  const lireLesBannieres = bannieres.lire;
  const lireLInventaire = useCallback(async (): Promise<void> => {
    const boutique = await call<unknown>("get_ma_boutique").then(lireBoutique, () => null);
    if (boutique) setInventaire(boutique.inventaire);
  }, []);
  useEffect(() => {
    void lireLesBannieres();
    void lireLInventaire();
    void call<unknown>("get_mon_gaulois").then(
      (reponse) => setTenue(tenueDuServeur(reponse)),
      () => undefined,
    );
    const change = (e: Event): void => {
      const nouvelle = (e as CustomEvent<{ tenue?: Tenue }>).detail?.tenue;
      if (nouvelle) setTenue(nouvelle);
    };
    window.addEventListener("gal:gaulois-enregistre", change);
    return () => window.removeEventListener("gal:gaulois-enregistre", change);
  }, [lireLesBannieres, lireLInventaire]);

  const gaulois = useMemo(() => (tenue ? rognerLeDessin({ largeur: GAULOIS_LARGEUR, hauteur: GAULOIS_HAUTEUR, cases: casesDuGaulois(tenue) }) : null), [tenue]);
  const lib = bannieres.etat.kind === "pret" ? bannieres.etat.lib : null;
  const portee = bannieres.etat.kind === "pret" ? bannieres.etat.mes.porte : null;
  const banniere = lib && portee ? lib.banniereParId(portee) : null;
  const decor = useMemo(() => {
    const scene = lib && portee ? lib.vignetteDeLaBanniere(portee) : null;
    return scene ? sansCadre(scene) : null;
  }, [lib, portee]);
  const voile = useMemo(() => (decor ? teinteDuVoile(decor.cases) : null), [decor]);

  if (s.etat.kind === "lecture") return <Loading label="Lecture du pass…" />;
  if (s.etat.kind === "panne") return <Problem message="Le pass ne répond pas pour l'instant." onRetry={() => void s.lire()} />;
  const sentier = s.etat.sentier;
  const saison = sentier.saison;
  const atteint = saison ? palierAtteint(sentier.pas, saison) : 0;
  const suivant = saison ? versLeSuivant(sentier.pas, saison) : null;
  const jours = saison && !saison.finie ? joursDeLaSaison(saison, sentier.jour) : null;
  const rangee = rangeeMontree(sentier.paliers, atteint);
  const pliable = sentier.paliers.length > PALIERS_PAR_RANGEE;
  const entiere = !pliable || (tout ?? rangee.ailleurs > 0);
  const montres = entiere ? sentier.paliers : sentier.paliers.filter((p) => p.palier >= rangee.debut && p.palier <= rangee.fin);
  // Le Gaulois se tient sur le dernier palier atteint ; avant le premier, au bord de la route.
  const palierDeMoi = Math.max(atteint, 1);
  const placeDeMoi = montres.findIndex((p) => p.palier === palierDeMoi);
  const rangeeDeMoi = placeDeMoi < 0 ? -1 : Math.floor(placeDeMoi / colonnes);
  const raretes = ORDRE.filter((r) => sentier.paliers.some((p) => p.rarete === r));

  const prendre = async (palier: number) => {
    // Dans le clic : sinon certains navigateurs gardent muette la note de l'objet reçu.
    preparerLeSonSiVoulu();
    setOccupe(true);
    setProbleme(null);
    setReussite(null);
    const issue = await s.prendre(palier);
    setOccupe(false);
    if (issue.ok) {
      setFenetre({ kind: "palier", recu: issue.valeur });
      void lireLInventaire();
    } else setProbleme(issue.message);
  };

  /** Comme à la boutique : la tenue enregistrée est relue, l'objet y prend sa place, et le serveur vérifie qu'il est au compte. */
  const porter = async (ref: RefObjet) => {
    setFenetre(null);
    setProbleme(null);
    try {
      const actuelle = tenueDuServeur(await call<unknown>("get_mon_gaulois"));
      if (!actuelle) throw new ServerError("network");
      const enregistree = tenueDuServeur(await call<unknown>("enregistrer_mon_gaulois", { p_tenue: changerObjet(actuelle, ref.emplacement, ref.objet) }));
      if (!enregistree) throw new ServerError("network");
      window.dispatchEvent(new CustomEvent("gal:gaulois-enregistre", { detail: { tenue: enregistree } }));
      setReussite(`Votre Gaulois porte « ${OBJETS[ref.emplacement][ref.objet]?.nom ?? "cet objet"} ».`);
    } catch (e) {
      setProbleme(e instanceof ServerError ? e.message : "Le serveur ne répond pas. Réessayez.");
    }
  };

  const recu = fenetre?.kind === "palier" ? objetPayant(fenetre.recu.objet.emplacement, fenetre.recu.objet.objet) : null;
  const etal = sentier.etal ? objetPayant(sentier.etal.emplacement, sentier.etal.objet) : null;

  return (
    <div class="sentier" data-testid="sentier">
      {probleme && (
        <p class="form-problem" role="alert" data-testid="sentier-probleme">
          {probleme}
        </p>
      )}
      <p class="form-success" role="status" data-testid="sentier-reussite">
        {reussite}
      </p>

      {saison ? (
        <section class="sentier-scene" data-banniere={decor ? "" : undefined} style={voile ? `--voile:${voile}` : undefined} aria-label={saison.nom}>
          {decor && <Decor decor={decor} />}
          <div class="sentier-haut">
            <header class="sentier-saison" data-testid="sentier-tete">
              <p class="sentier-etiquette">{saison.nom}</p>
              <div class="sentier-ligne">
                <p class="sentier-kpi">
                  <span class="tnum" data-testid="sentier-pas">
                    {sentier.pas}
                  </span>
                  <small>XP</small>
                </p>
                <p class="sentier-palier tnum">
                  <span data-testid="sentier-palier">
                    Palier {atteint} sur {saison.paliers}
                  </span>
                  {suivant && !saison.finie && (
                    <small data-testid="sentier-suivant">
                      Encore {motPas(suivant.reste)} avant le palier {suivant.palier}.
                    </small>
                  )}
                </p>
              </div>
              {suivant && !saison.finie && <Barre fait={suivant.fait} cible={suivant.cible} />}
              {jours && (
                <span class="sentier-jours" style={`--jours:${jours.total}`} aria-hidden="true">
                  {Array.from({ length: jours.total }, (_, i) => (
                    <i key={i} data-passe={i + 1 < jours.rang ? "" : undefined} data-ici={i + 1 === jours.rang ? "" : undefined} />
                  ))}
                </span>
              )}
              {saison.finie ? (
                <p class="sentier-note" data-testid="sentier-finie">
                  finie le {jourEnMots(saison.fin)}
                  {saison.prendre_jusqu_au ? ` : vos objets se prennent jusqu'au ${jourEnMots(saison.prendre_jusqu_au)}` : ""}
                </p>
              ) : (
                <p class="sentier-note tnum">
                  jusqu'au {jourEnMots(saison.fin)}, encore {joursRestants(sentier.jour, saison.fin)} {joursRestants(sentier.jour, saison.fin) > 1 ? "jours" : "jour"}
                </p>
              )}
              {!sentier.peut_avancer && (
                <p class="pochette-raison" data-testid="sentier-raison">
                  {messageDuRefusDuSentier("not_validated")}
                </p>
              )}
            </header>
            {banniere && (
              <p class="sentier-banniere" data-testid="sentier-banniere">
                Bannière <b>{banniere.nom}</b>
              </p>
            )}
          </div>

          <ol class="sentier-piste" data-testid="sentier-paliers" aria-label="Les paliers">
            {montres.map((palier, i) => (
              <Palier
                key={palier.palier}
                palier={palier}
                atteint={atteint}
                seuil={palier.palier * saison.pas_par_palier}
                fait={suivant ? remplissageDuRail(palier.palier, atteint, suivant.fait, suivant.cible) : 100}
                jalon={palier.palier % PALIERS_PAR_RANGEE === 0}
                rangeeDeMoi={rangeeDeMoi >= 0 && Math.floor(i / colonnes) === rangeeDeMoi}
                moi={palier.palier === palierDeMoi ? (atteint === 0 ? "depart" : "ici") : null}
                gaulois={gaulois}
                occupe={occupe || !sentier.peut_avancer}
                inventaire={inventaire}
                onPrendre={() => void prendre(palier.palier)}
              />
            ))}
          </ol>
          {pliable && (
            <p class="sentier-voir-tout">
              <span class="tnum" data-testid="sentier-rangee">
                {entiere ? `Les ${sentier.paliers.length} paliers` : `Paliers ${rangee.debut} à ${rangee.fin} sur ${sentier.paliers.length}`}
                {!entiere && rangee.ailleurs > 0 && ` · ${rangee.ailleurs} ${rangee.ailleurs > 1 ? "objets" : "objet"} à prendre plus loin`}
              </span>
              <button type="button" class="btn btn-secondary" aria-expanded={entiere} onClick={() => setTout(!entiere)} data-testid="sentier-voir-tout">
                {entiere ? "Replier" : `Voir les ${sentier.paliers.length} paliers`}
              </button>
            </p>
          )}
          <ul class="sentier-legende" aria-label="Les raretés des objets">
            {raretes.map((r) => (
              <li key={r} class="sentier-puce" data-rarete={r}>
                <Dessin dessin={pochetteDeRarete(r)} echelle={1} />
                <MarqueDeRarete rarete={r} />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p class="pochette-note" data-testid="sentier-hors-saison">
          Entre deux saisons : la prochaine n'a pas encore de date.
        </p>
      )}

      <section aria-labelledby="sentier-aujourdhui">
        <h3 id="sentier-aujourdhui" class="sentier-titre">
          Aujourd'hui
        </h3>
        <div class="sentier-jour">
          {saison && sentier.missions.length > 0 && <Missions sentier={sentier} />}
          {saison && <Defi sentier={sentier} />}
          {saison && !saison.finie && <Calendrier sentier={sentier} />}
          <Etal sentier={sentier} onAcheter={() => setFenetre({ kind: "etal" })} />
        </div>
        {saison && sentier.defi && (
          <p class="sentier-credit">
            Carte de France : © OpenFront and Contributors, sous licence{" "}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr" rel="license noopener">
              CC BY-SA 4.0
            </a>{" "}
            (<a href={`${basePath()}/openfront/LISEZ-MOI.txt`}>source</a>).
          </p>
        )}
      </section>

      {saison && !saison.finie && (
        <p class="pochette-note" data-testid="sentier-releve">
          Les parties sont relevées toutes les 5 minutes environ{sentier.releve ? `, la dernière fois le ${instant(sentier.releve)}` : ""}. Une journée se valide jusqu'au lendemain soir.
        </p>
      )}

      {fenetre?.kind === "palier" && recu && (
        <Dialogue titre={`Palier ${fenetre.recu.palier} : ${recu.fiche.nom}`} etape="fait" occupe={false} onFermer={() => setFenetre(null)} testid="dialogue-palier">
          <ObjetRecu objet={recu.fiche} rarete={recu.fiche.rarete} vignette={vignetteDeLObjet(recu.emplacement, recu.objet)} palier />
          {fenetre.recu.objet.double && <p class="boutique-dialogue-texte">Un double : vous l'aviez déjà. Il se fond à la forge ou se vend au marché.</p>}
          <div class="boutique-dialogue-actions">
            <button type="button" class="btn btn-primary" onClick={() => void porter(fenetre.recu.objet)} data-testid="palier-porter">
              Le porter
            </button>
            <button type="button" class="btn btn-ghost" onClick={() => setFenetre(null)} data-testid="palier-fermer">
              Fermer
            </button>
          </div>
        </Dialogue>
      )}
      {fenetre?.kind === "etal" && sentier.etal && etal && (
        <DialogueAchat
          objet={etal.fiche}
          rarete={etal.fiche.rarete}
          vignette={vignetteDeLObjet(etal.emplacement, etal.objet)}
          prix={sentier.etal.prix}
          solde={sentier.solde}
          acheter={async () => {
            const issue = await s.acheter({ emplacement: etal.emplacement, objet: etal.objet }, sentier.etal?.prix ?? 0);
            if (issue.ok) void lireLInventaire();
            return issue;
          }}
          onPorter={() => void porter({ emplacement: etal.emplacement, objet: etal.objet })}
          onFermer={() => setFenetre(null)}
        />
      )}
    </div>
  );
}
