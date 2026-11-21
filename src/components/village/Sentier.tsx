import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ServerError, basePath, call } from "../../lib/compte/api";
import { Loading, Problem } from "../compte/common";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, OBJETS, RARETES_DES_OBJETS, casesDuGaulois, changerObjet, tenueDuServeur, vignetteDeLObjet, type RareteDObjet, type Tenue } from "../../lib/gaulois";
import { carteDeRarete, type CarteDeScene } from "../../lib/jeu/boosters";
import { boosterDuPass, cocheDeMission, dalleDuPalier, etendardDuDefi, jourDuCalendrier, paveDeLaRoute, sceauDuPalier, type RareteDuPass } from "../../lib/jeu/pass-forge";
import { reveillerLeSon } from "../../lib/jeu/sons-des-boosters";
import { albumDuPalier, rognerLeDessin } from "../../lib/village/album-pochette";
import { objetsDeLaPochette } from "../../lib/village/boutique";
import type { MonSentier, ObjetPossede, PalierDuSentier, PalierReponse, RareteDePalier, RefObjet } from "../../lib/village/contrat";
import { instant, lireAchat, lireBoutique, manque, objetPayant, points } from "../../lib/village/ecran-boutique";
import { datesDeLaSaison, estUnJalon, etatDeLaDalle, etatsDuCalendrier, joursEnMots, motDuJour, partDeLaBarre, rareteDuPalier, seuilEnMots } from "../../lib/village/ecran-pass";
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
  partDuDefi,
  raisonEtalFerme,
  rangeeMontree,
  remplissageDuRail,
  versLeSuivant,
} from "../../lib/village/sentier";
import { sansCadre } from "../../lib/village/decor-banniere";
import { Etiquette, Icone, Px } from "../jeu/Pixels";
import { AlbumDePochette } from "./AlbumPochette";
import { useBannieres } from "./Bannieres";
import { CaseMontree, DialogueAchat, type Issue } from "./BoutiqueDialogue";
import { BoutonDuJeu, PrixDuJeu, Ruban } from "./BoutiqueDuJeu";
import { MarqueDeRarete, Pixels, peindre } from "./BoutiquePixels";
import { feterLObjet, useJoie } from "./Cases";
import { ImageEnCases, imageEnCases } from "./ImageEnCases";
import InsigneDeSaison from "./InsigneDeSaison";
import { BoutonDesBoosters, FenetreDuBooster, RangEnIcone, RareteEnPixels, ResultatDuBooster } from "./KitDesBoosters";
import { OuvertureDuBooster } from "./OuvertureDuBooster";
import { DESSINS_DES_MISSIONS, type DessinDuSentier } from "./SentierDessins";

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

/**
 * Une barre du kit : le tube sombre, son plein de `part` (0 à 1), ses crans, et ce qu'elle dit écrit dedans en pixels.
 * Décorative pour les lecteurs d'écran : ce qu'elle montre est toujours dit à côté (`muet`).
 */
function Tube({ part, plein, mots, classe = "" }: { part: number; plein: "or" | "bleu" | "vert" | "violet"; mots?: string; classe?: string }) {
  return (
    <span class={`jeu-tube jeu-n9 pj-tube ${classe}`} aria-hidden="true">
      <span class={`jeu-plein jeu-n9 jeu-plein-${plein} ${part <= 0 ? "jeu-plein-vide" : ""}`} style={`--part:${part}`} />
      <span class="jeu-crans" />
      {mots && <Px t={mots} couleur="creme" relief="cerne" muet />}
    </span>
  );
}

/** Un dessin du sentier, à un nombre entier de pixels par case. */
function Dessin({ dessin, echelle, class: classe = "" }: { dessin: DessinDuSentier; echelle: number; class?: string }) {
  return <Pixels largeur={dessin.largeur} hauteur={dessin.hauteur} cases={dessin.cases} echelle={echelle} class={classe} />;
}

/** Le booster d'un palier, en image (dessin de Claude Fable 5.2) : gardé une fois par rareté. */
const planchesDesBoosters = new Map<RareteDuPass, ReturnType<typeof boosterDuPass>>();
function planche(rarete: RareteDuPass): ReturnType<typeof boosterDuPass> {
  let p = planchesDesBoosters.get(rarete);
  if (!p) planchesDesBoosters.set(rarete, (p = boosterDuPass(rarete)));
  return p;
}
function BoosterDuPalier({ rarete, classe = "" }: { rarete: RareteDuPass; classe?: string }) {
  return <ImageEnCases cle={`pass-booster|${rarete}`} dessin={() => planche(rarete)} classe={`pj-booster ${classe}`} />;
}

/** Les colonnes de la piste, comme la feuille de style les pose : trois sur téléphone, cinq, puis dix. */
function useColonnes(): number {
  const lire = (): number => (typeof matchMedia !== "function" ? PALIERS_PAR_RANGEE : matchMedia("(min-width: 1440px)").matches ? PALIERS_PAR_RANGEE : matchMedia("(min-width: 560px)").matches ? 5 : 3);
  const [colonnes, setColonnes] = useState(lire);
  useEffect(() => {
    const relire = (): void => setColonnes(lire());
    window.addEventListener("resize", relire);
    return () => window.removeEventListener("resize", relire);
  }, []);
  return colonnes;
}

/**
 * Le décor de la piste : la bannière que le membre montre sur /gaulois, sans son cadre, étirée derrière la route. Décorative :
 * son nom est écrit dans la bulle. Le voile qui porte la route prend la teinte sombre de la bannière.
 */
function Decor({ decor }: { decor: DessinDuSentier }) {
  const toile = useRef<HTMLCanvasElement>(null);
  useEffect(() => peindre(toile.current, decor.largeur, decor.hauteur, decor.cases), [decor]);
  return (
    <>
      <canvas ref={toile} width={decor.largeur} height={decor.hauteur} class="pixels pj-fond" aria-hidden="true" data-testid="sentier-fond" />
      <span class="pj-voile" aria-hidden="true" />
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

/** Les missions du jour : une carte par mission, son image en pixels, ses mots, où elle en est, ses XP et sa coche. */
function Missions({ sentier }: { sentier: MonSentier }) {
  const faites = sentier.missions.filter((m) => m.gagnee).length;
  const gain = motPas(sentier.regles.mission);
  return (
    <section class="pj-bloc pj-missions jeu-panneau jeu-n9" aria-labelledby="sentier-missions-titre" data-testid="sentier-missions">
      <Ruban t="Missions du jour" bleu id="sentier-missions-titre" />
      <p class="pj-bloc-tete">
        <Px t={`${faites} ${faites > 1 ? "faites" : "faite"} sur ${sentier.missions.length}`} couleur="doux" />
        <Etiquette t={`${gain} chacune`} ton="bleu" dit={`${gain} chacune`} />
      </p>
      <ul class="pj-missions-liste">
        {sentier.missions.map((mission) => {
          const ou = avancee(mission);
          const image = DESSINS_DES_MISSIONS[mission.code];
          return (
            <li key={mission.code} class="pj-mission jeu-bulle jeu-n9" data-faite={mission.gagnee ? "" : undefined} data-testid={`mission-${mission.code}`}>
              <span class="pj-mission-image" aria-hidden="true">
                <Dessin dessin={image} echelle={image.largeur > 20 ? 1 : image.largeur > 12 ? 2 : 3} />
              </span>
              <span class="pj-mission-nom">
                <Px t={NOMS_DES_MISSIONS[mission.code]} couleur="marine" plie dit={NOMS_DES_MISSIONS[mission.code]} />
              </span>
              <span class="pj-mission-suite">
                {mission.gagnee ? (
                  <Etiquette t="Faite" ton="or" dit="Faite" />
                ) : ou ? (
                  <>
                    <Tube part={partDeLaBarre(mission.fait, mission.cible)} plein="vert" classe="pj-tube-petit" />
                    <Px t={ou} couleur="marine" dit={ou} />
                  </>
                ) : (
                  <Etiquette t="À faire" ton="bleu" dit="À faire" />
                )}
              </span>
              <Etiquette t={`+${gain}`} ton="rouge" dit={gain} classe="pj-mission-xp" />
              <ImageEnCases cle={`pass-coche|${mission.gagnee}`} dessin={() => cocheDeMission(mission.gagnee)} echelle={2} classe="pj-coche" />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Le défi du clan : l'étendard qui se remplit d'or à mesure que le clan rapporte des points aujourd'hui. */
function Defi({ sentier }: { sentier: MonSentier }) {
  const defi = sentier.defi;
  if (!defi) return null;
  const rempli = defi.points >= defi.cible;
  const fait = partDuDefi(defi.points, defi.cible);
  const gain = motPas(sentier.regles.defi);
  const chiffre = `${points(defi.points)} sur ${defi.cible}`;
  const carte = `${basePath()}/openfront/france.webp`;
  return (
    <section class="pj-bloc pj-defi jeu-panneau jeu-n9" aria-labelledby="sentier-defi-titre" data-testid="sentier-defi" data-rempli={rempli ? "" : undefined}>
      <Ruban t="Défi du clan" bleu id="sentier-defi-titre" />
      <div class="pj-defi-corps">
        <ImageEnCases cle={`pass-etendard|${fait}|${rempli}`} dessin={() => etendardDuDefi(fait / 100, rempli)} echelle={2} classe="pj-etendard" />
        <div class="pj-defi-chiffres">
          <Px t="À nous tous, aujourd'hui" couleur="doux" plie />
          <p class="pj-defi-nombre">
            <Px t={chiffre} couleur="texte" relief="ombre" dit={`${chiffre} points rapportés au clan aujourd'hui`} />
          </p>
          <Px t="points rapportés au clan" couleur="doux" plie muet />
          <Tube part={fait / 100} plein="or" mots={`${fait} %`} classe="pj-tube-defi" />
          {/* Ce que dit l'étiquette est l'état du défi : gagné, rempli, ou ce qu'il donnera une fois rempli. */}
          {defi.gagne ? (
            <Etiquette t={`Gagné : +${gain}`} ton="or" dit={`Gagné : ${gain}`} />
          ) : rempli ? (
            <Etiquette t={`Rempli : +${gain}`} ton="bleu" dit={`Rempli : ${gain} à qui a joué une partie du clan aujourd'hui`} />
          ) : (
            <Etiquette t={`Si rempli : +${gain}`} ton="rouge" dit={`Une fois rempli : ${gain}`} />
          )}
        </div>
        {/* La carte de France du jeu (OpenFront, CC BY-SA 4.0) se colore à la part faite du défi : décorative, le chiffre est écrit à côté. */}
        <div class="pj-gaule sentier-gaule" style={`--part:${fait}%;--carte:url(${carte})`} aria-hidden="true">
          <img src={carte} alt="" width="606" height="606" loading="lazy" decoding="async" />
          <span class="sentier-gaule-prise" />
        </div>
      </div>
      <p class="pj-note" data-testid="sentier-defi-regle">
        {defi.gagne
          ? `Rempli : vous avez reçu ${gain}.`
          : rempli
            ? `Rempli. Jouez une partie du clan aujourd'hui pour recevoir ${gain}.`
            : `Rempli, il donne ${gain} à chaque membre qui a joué une partie du clan aujourd'hui${defi.joue ? " : vous en êtes" : ""}.`}
      </p>
    </section>
  );
}

/** La présence : une petite page de calendrier par jour de visite, la dernière porte le cadeau. */
function Calendrier({ sentier }: { sentier: MonSentier }) {
  const { cochees, cases } = casesDuCalendrier(sentier.visites, sentier.regles.tous_les);
  const avant = avantLeCadeau(sentier.visites, sentier.regles.tous_les);
  const cadeau = motPas(sentier.regles.semaine);
  const etats = etatsDuCalendrier(cochees, cases);
  const resume = `${cochees} ${cochees > 1 ? "jours" : "jour"} de visite sur ${cases}`;
  return (
    <section class="pj-bloc pj-presence jeu-panneau jeu-n9" aria-labelledby="sentier-calendrier-titre" data-testid="sentier-calendrier">
      <Ruban t="Présence" bleu id="sentier-calendrier-titre" />
      <p class="pj-bloc-tete">
        <Px t={resume} couleur="doux" muet />
        <Etiquette t={`+${motPas(sentier.regles.visite)} par jour`} ton="bleu" dit={`${motPas(sentier.regles.visite)} par jour de visite`} />
      </p>
      <ol class="pj-jours" aria-label={resume}>
        {etats.map((etat, i) => (
          <li key={i} data-etat={etat}>
            <ImageEnCases cle={`pass-jour|${i + 1}|${etat}`} dessin={() => jourDuCalendrier(i + 1, etat)} echelle={2} classe="pj-jour" />
            <span class="sr-only">{motDuJour(i + 1, etat, cadeau)}</span>
          </li>
        ))}
      </ol>
      <p class="pj-bloc-tete">
        <Etiquette t={`Le ${cases}e jour : +${cadeau}`} ton="or" dit={`Le ${cases}e jour de visite : ${cadeau} de plus`} />
      </p>
      <p class="pj-note pj-prochain" data-testid="sentier-prochain">
        {avant > 0 ? `Encore ${avant} ${avant > 1 ? "jours" : "jour"} de visite avant le cadeau de ${cadeau}.` : `La rangée est pleine : le cadeau de ${cadeau} est gagné.`}
      </p>
      <p class="pj-note">Chaque jour de visite donne {motPas(sentier.regles.visite)}. Un jour manqué ne retire rien.</p>
    </section>
  );
}

/** L'étal du jour : un objet de la boutique, moins cher aujourd'hui, à la carte claire de sa rareté. */
function Etal({ sentier, onAcheter }: { sentier: MonSentier; onAcheter: () => void }) {
  const etal = sentier.etal;
  const ref = etal ? objetPayant(etal.emplacement, etal.objet) : null;
  if (!etal || !ref) return null;
  const raison = raisonEtalFerme(sentier, etal);
  return (
    <section class="pj-bloc pj-etal jeu-panneau jeu-n9" aria-labelledby="sentier-etal-titre" data-testid="sentier-etal">
      <Ruban t="Étal du jour" bleu id="sentier-etal-titre" />
      <p class="pj-bloc-tete">
        <Px t="Il change à minuit" couleur="doux" />
      </p>
      <div class="pj-etal-corps">
        <div class="pj-etal-case">
          <CaseMontree objet={ref.fiche} rarete={ref.fiche.rarete} vignette={vignetteDeLObjet(ref.emplacement, ref.objet)} />
          <Etiquette t={`-${sentier.regles.remise} %`} ton="rouge" dit={`${sentier.regles.remise} % moins cher`} classe="pj-remise" />
        </div>
        <div class="pj-etal-prix">
          <PrixDuJeu valeur={etal.prix} classe="pj-prix" />
          <span class="pj-ancien-prix">
            <span class="sr-only">au lieu de </span>
            <s class="tnum">{etal.prix_boutique}</s>
            <span class="sr-only"> statères</span> à la boutique
          </span>
          {raison ? (
            <p class="pj-raison" data-testid="sentier-etal-raison">
              {raison}
            </p>
          ) : (
            <BoutonDuJeu t="Acheter" dit={`Acheter ${ref.fiche.nom}`} onClick={onAcheter} testid="sentier-etal-acheter" />
          )}
        </div>
      </div>
    </section>
  );
}

/** Le Gaulois du membre, debout sur la route à son palier. Décoratif : le palier atteint est écrit dans la saison. */
function Moi({ gaulois }: { gaulois: DessinDuSentier | null }) {
  // Il saute de joie quand un palier vient d'être pris (la fenêtre du booster se ferme).
  const moi = useRef<HTMLSpanElement>(null);
  useJoie(moi, moi);
  return (
    <span ref={moi} class="pj-moi sentier-moi" aria-hidden="true">
      <Etiquette t="Vous" ton="rouge" classe="pj-moi-mot" />
      {gaulois && <Dessin dessin={gaulois} echelle={2} />}
    </span>
  );
}

/** Une vignette d'objet, à un nombre entier de pixels par case pour tenir dans `place` pixels. */
function Vignette({ refObjet, place }: { refObjet: RefObjet; place: number }) {
  const vignette = vignetteDeLObjet(refObjet.emplacement, refObjet.objet);
  if (!vignette) return null;
  const echelle = Math.max(1, Math.min(2, Math.floor(place / Math.max(vignette.largeur, vignette.hauteur))));
  return <Pixels largeur={vignette.largeur} hauteur={vignette.hauteur} cases={vignette.cases} echelle={echelle} class="case-dessin" />;
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
  objetDeSaison,
  onPrendre,
}: {
  palier: PalierDuSentier;
  atteint: number;
  seuil: number;
  /** La part dorée de la route dans cette case, de 0 à 100. */
  fait: number;
  jalon: boolean;
  /** La case est dans la rangée où se tient le Gaulois : toute la rangée lui laisse sa hauteur. */
  rangeeDeMoi: boolean;
  /** Le Gaulois se tient sur ce palier ; « depart » : avant le premier, au bord de la route. */
  moi: "ici" | "depart" | null;
  gaulois: DessinDuSentier | null;
  occupe: boolean;
  inventaire: readonly ObjetPossede[] | null;
  /** Pour le dernier palier d'une saison qui a son objet : cet objet, qu'on n'obtient que là (21 novembre 2026). */
  objetDeSaison: RefObjet | null;
  onPrendre: () => void;
}) {
  const etat = etatDuPalier(palier, atteint);
  const deSaison = objetDeSaison ? objetPayant(objetDeSaison.emplacement, objetDeSaison.objet) : null;
  const rarete = rareteDuPalier(palier.rarete, deSaison !== null);
  const pris = palier.pris ? objetPayant(palier.pris.emplacement, palier.pris.objet) : null;
  const lireAlbum = useCallback(() => albumDuPalier(palier.palier, palier.rarete, inventaire), [palier.palier, palier.rarete, inventaire]);
  const nomDeRarete = RARETES_DES_OBJETS[palier.rarete].nom.toLowerCase();
  const dalle = etatDeLaDalle(etat);
  return (
    <li class="pj-pas" data-etat={etat} data-rarete={rarete} data-jalon={jalon ? "" : undefined} data-avec-moi={rangeeDeMoi ? "" : undefined} style={`--fait:${fait}%`} data-testid={`palier-${palier.palier}`}>
      <span class="pj-dalle">
        <ImageEnCases cle={`pass-dalle|${palier.palier}|${dalle}|${jalon}`} dessin={() => dalleDuPalier(palier.palier, dalle, jalon)} echelle={2} />
        <span class="sr-only">Palier {palier.palier}</span>
      </span>
      {moi && (
        <span class="pj-moi-place" data-depart={moi === "depart" ? "" : undefined}>
          <Moi gaulois={gaulois} />
        </span>
      )}
      <div class="case pj-case" data-rarete={rarete} title={etat === "pris" && pris ? pris.fiche.nom : deSaison ? `${deSaison.fiche.nom}, l'objet de la saison` : undefined}>
        {etat === "pris" ? (
          <>
            <span class="case-image">{palier.pris && <Vignette refObjet={palier.pris} place={64} />}</span>
            <MarqueDeRarete rarete={rarete} />
            <ImageEnCases cle="pass-sceau" dessin={sceauDuPalier} echelle={2} classe="pj-sceau" />
            <span class="sr-only">{pris ? `${pris.fiche.nom}, pris` : "pris"}</span>
          </>
        ) : (
          <>
            <span class="case-image">
              {deSaison ? (
                // L'objet de la saison se montre tel quel : il n'y a rien d'autre à tirer.
                <>
                  <Vignette refObjet={deSaison} place={64} />
                  <span class="sr-only">{deSaison.fiche.nom}, l'objet de la saison, et son insigne</span>
                </>
              ) : (
                <AlbumDePochette lireAlbum={lireAlbum} nombre={nombreDObjets(palier.rarete)} nom={`Voir ce que peut donner le booster du palier ${palier.palier}, un objet ${nomDeRarete}`} testid={`palier-${palier.palier}`}>
                  <BoosterDuPalier rarete={rarete} classe="pj-sac" />
                </AlbumDePochette>
              )}
            </span>
            <MarqueDeRarete rarete={rarete} />
            {etat === "a-prendre" ? (
              <BoutonDuJeu
                t="Ouvrir"
                dit={deSaison ? `Ouvrir le booster du palier ${palier.palier}, qui donne ${deSaison.fiche.nom}` : `Ouvrir le booster du palier ${palier.palier}`}
                disabled={occupe}
                onClick={onPrendre}
                testid={`palier-prendre-${palier.palier}`}
                classe="pj-prendre"
              />
            ) : (
              <span class="pj-seuil">
                <Px t={seuilEnMots(seuil)} couleur="doux" dit={`à ${seuilEnMots(seuil)}`} />
              </span>
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

/** Les raretés des paliers de la saison, de la plus courante à la plus rare : la légende de la piste. */
const ORDRE: readonly RareteDePalier[] = ["commun", "peu-commun", "epique", "mystique", "legendaire"];

/** Le palier qui vient d'être pris, et son booster qui s'ouvre. */
type Ouverture = { recu: PalierReponse; carte: CarteDeScene; revele: boolean };

/**
 * « Le pass » de « Mon Gaulois » (`#sentier`) : le sentier du 16 novembre 2026 (« un peu comme un passe de combat »), dont
 * le pilote a choisi le dessin sur maquettes (la bannière du membre pour seul décor, une route de pavés en pixels, une
 * pochette à album par palier, devenue un booster, la piste repliée sur dix paliers), habillé avec le kit du jeu le
 * 21 novembre 2026 (dessins de Claude Fable 5.2, `src/lib/jeu/pass-forge.ts`, feuille `20-jeu-pass-forge.css`).
 *
 * En haut, la saison et ses XP, à côté de la récompense de fin de saison (l'objet légendaire de saison et l'insigne). Puis la
 * route : une dalle numérotée par palier, le Gaulois du membre debout sur la sienne, et sous chaque dalle la récompense en
 * case claire à la couleur de sa rareté : un booster dont l'album s'ouvre au survol, l'objet de la saison au dernier palier,
 * l'objet reçu une fois pris. Un palier atteint s'ouvre par l'animation des boosters, le serveur ayant tiré d'abord. Puis
 * « Aujourd'hui » : les missions en cartes à icône, la présence en petit calendrier dessiné, le défi du clan en étendard qui
 * se remplit, l'étal du jour. Tout vient du serveur : l'écran ne compte aucun XP. Rien n'est du temps réel : l'heure du
 * dernier relevé des parties est écrite.
 */
export default function LeSentier({ sentier: s }: { sentier: Sentier }) {
  const [etal, setEtal] = useState(false);
  const [ouverture, setOuverture] = useState<Ouverture | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [probleme, setProbleme] = useState<string | null>(null);
  const [reussite, setReussite] = useState<string | null>(null);
  /** La piste entière, ou seulement la rangée du membre ; `null` tant qu'il n'a rien choisi. */
  const [tout, setTout] = useState<boolean | null>(null);
  const [tenue, setTenue] = useState<Tenue | null>(null);
  const [inventaire, setInventaire] = useState<ObjetPossede[] | null>(null);
  const colonnes = useColonnes();
  // La bannière du membre, son Gaulois et ce qu'il possède ne sont que de l'habillage : une panne les laisse de côté, le
  // pass se lit quand même.
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
  const objetDeLaSaison = saison?.objet ? objetPayant(saison.objet.emplacement, saison.objet.objet) : null;
  const insigneObtenu = saison ? sentier.insignes?.find((i) => i.saison === saison.id) : undefined;
  const reste = saison ? joursRestants(sentier.jour, saison.fin) : 0;
  // La route en pixels : ses deux motifs, gris et doré, posés en fond par la feuille de style.
  const paveGris = imageEnCases("pass-pave|gris", () => paveDeLaRoute(false));
  const paveOr = imageEnCases("pass-pave|or", () => paveDeLaRoute(true));
  const route = `--pj-pave-gris:${paveGris.url};--pj-pave-or:${paveOr.url};--pj-pave-w:${paveGris.largeur};--pj-pave-h:${paveGris.hauteur}`;

  const prendre = async (palier: PalierDuSentier) => {
    // Dans le clic : sinon certains navigateurs gardent la scène du booster muette.
    reveillerLeSon();
    setOccupe(true);
    setProbleme(null);
    setReussite(null);
    const issue = await s.prendre(palier.palier);
    setOccupe(false);
    if (issue.ok) {
      const recu = issue.valeur;
      const fiche = objetPayant(recu.objet.emplacement, recu.objet.objet);
      setOuverture({ recu, carte: carteDeRarete(fiche?.fiche.nom ?? "Objet", recu.objet.rarete, vignetteDeLObjet(recu.objet.emplacement, recu.objet.objet)), revele: false });
      void lireLInventaire();
    } else setProbleme(issue.message);
  };

  const fermerLOuverture = () => {
    const vue = ouverture;
    setOuverture(null);
    // Le Gaulois de la route saute de joie, une fois la fenêtre fermée, pour chaque palier.
    if (vue?.revele) feterLObjet(vue.recu.objet.rarete as RareteDObjet, true);
  };

  /** Comme à la boutique : la tenue enregistrée est relue, l'objet y prend sa place, et le serveur vérifie qu'il est au compte. */
  const porter = async (ref: RefObjet) => {
    fermerLOuverture();
    setEtal(false);
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

  const recu = ouverture ? objetPayant(ouverture.recu.objet.emplacement, ouverture.recu.objet.objet) : null;
  const objetDeLEtal = sentier.etal ? objetPayant(sentier.etal.emplacement, sentier.etal.objet) : null;
  const rareteRecue = ouverture?.recu.objet.rarete;

  return (
    <div class="pass-jeu" style={route} data-testid="sentier">
      {/* Le ruban du titre n'est qu'un dessin : la partie a déjà son titre caché, « Le pass » (VillageApp.tsx). */}
      <div class="pj-titre" aria-hidden="true">
        <span class="boutique-jeu-ruban">
          <span class="jeu-ruban jeu-n9">
            <Px t="Le pass" couleur="creme" relief="ombre" muet />
          </span>
        </span>
      </div>
      {probleme && (
        <p class="form-problem pj-message" role="alert" data-testid="sentier-probleme">
          {probleme}
        </p>
      )}
      <p class="form-success pj-message" role="status" data-testid="sentier-reussite">
        {reussite}
      </p>

      {saison ? (
        <>
          <div class="pj-haut">
            <section class="pj-saison jeu-panneau jeu-n9" aria-label={saison.nom} data-testid="sentier-tete">
              <p class="pj-saison-nom">
                <Px t={saison.nom} relief="ombre" dit={saison.nom} />
                <Px t={datesDeLaSaison(saison)} couleur="doux" plie />
              </p>
              <p class="pj-xp">
                <Icone nom="xp" classe="pj-xp-icone" />
                <span class="pj-grand">
                  <Px t={`${sentier.pas} XP`} relief="ombre" muet />
                </span>
                <span class="sr-only">
                  <span data-testid="sentier-pas">{sentier.pas}</span> XP
                </span>
              </p>
              {suivant && !saison.finie ? (
                <div class="pj-progres">
                  <Etiquette t={`Palier ${atteint}`} ton="bleu" />
                  <Tube part={partDeLaBarre(suivant.fait, suivant.cible)} plein="bleu" mots={`${suivant.fait} / ${suivant.cible} XP`} classe="pj-tube-xp" />
                  <Etiquette t={`Palier ${suivant.palier}`} ton="or" />
                </div>
              ) : null}
              <p class="pj-saison-mots">
                <span data-testid="sentier-palier">
                  <Px t={`Palier ${atteint} sur ${saison.paliers}`} dit={`Palier ${atteint} sur ${saison.paliers}`} />
                </span>
                {suivant && !saison.finie && (
                  <span data-testid="sentier-suivant">
                    <Px t={`Encore ${motPas(suivant.reste)} avant le palier ${suivant.palier}`} couleur="doux" plie dit={`Encore ${motPas(suivant.reste)} avant le palier ${suivant.palier}.`} />
                  </span>
                )}
              </p>
              {jours && (
                <span class="pj-jours-saison" style={`--jours:${jours.total}`} aria-hidden="true">
                  {Array.from({ length: jours.total }, (_, i) => (
                    <i key={i} data-passe={i + 1 < jours.rang ? "" : undefined} data-ici={i + 1 === jours.rang ? "" : undefined} />
                  ))}
                </span>
              )}
              {saison.finie ? (
                <p class="pj-note" data-testid="sentier-finie">
                  Finie le {jourEnMots(saison.fin)}
                  {saison.prendre_jusqu_au ? ` : vos objets se prennent jusqu'au ${jourEnMots(saison.prendre_jusqu_au)}` : ""}.
                </p>
              ) : (
                <p class="pj-saison-reste">
                  <Etiquette t={joursEnMots(reste)} ton="rouge" dit={`Jusqu'au ${jourEnMots(saison.fin)}, ${joursEnMots(reste)}`} />
                </p>
              )}
              {!sentier.peut_avancer && (
                <p class="pj-raison" data-testid="sentier-raison">
                  {messageDuRefusDuSentier("not_validated")}
                </p>
              )}
            </section>

            {(objetDeLaSaison || insigneObtenu) && (
              <section class="pj-fin jeu-panneau jeu-n9" aria-labelledby="sentier-fin-titre" data-testid={insigneObtenu ? "sentier-insigne" : "sentier-objet-de-saison"}>
                <Ruban t={`Au palier ${saison.paliers}`} id="sentier-fin-titre" />
                <div class="pj-fin-corps">
                  {objetDeLaSaison && (
                    <div class="pj-fin-objet">
                      <CaseMontree objet={objetDeLaSaison.fiche} rarete="saison" vignette={vignetteDeLObjet(objetDeLaSaison.emplacement, objetDeLaSaison.objet)} />
                    </div>
                  )}
                  <div class="pj-fin-insigne">
                    <InsigneDeSaison saison={saison.id} echelle={3} />
                    <Px t={insigneObtenu ? "Insigne obtenu" : "Et son insigne"} couleur="doux" plie muet />
                  </div>
                </div>
                <p class="pj-note">
                  {insigneObtenu
                    ? `Insigne de la ${saison.nom.toLowerCase()} obtenu${objetDeLaSaison ? `, avec « ${objetDeLaSaison.fiche.nom} »` : ""}.`
                    : `Au palier ${saison.paliers} : « ${objetDeLaSaison?.fiche.nom ?? ""} », légendaire de saison qu'on n'obtient que là, et l'insigne de la saison, montré sur votre carte.`}
                </p>
              </section>
            )}
          </div>

          <section class="pj-scene jeu-panneau jeu-n9" data-banniere={decor ? "" : undefined} style={voile ? `--voile:${voile}` : undefined} aria-label={`La route de la ${saison.nom.toLowerCase()}`}>
            <div class="pj-scene-dedans">
              {decor && <Decor decor={decor} />}
              {banniere && (
                <p class="pj-banniere jeu-bulle jeu-n9" data-testid="sentier-banniere">
                  <Px t="Bannière" couleur="marine" muet />
                  <Px t={banniere.nom} couleur="marine" relief="plat" dit={`Bannière ${banniere.nom}`} />
                </p>
              )}
              <ol class="pj-piste" data-testid="sentier-paliers" aria-label="Les paliers">
                {montres.map((palier, i) => (
                  <Palier
                    key={palier.palier}
                    palier={palier}
                    atteint={atteint}
                    seuil={palier.palier * saison.pas_par_palier}
                    fait={suivant ? remplissageDuRail(palier.palier, atteint, suivant.fait, suivant.cible) : 100}
                    jalon={estUnJalon(palier.palier, PALIERS_PAR_RANGEE)}
                    rangeeDeMoi={rangeeDeMoi >= 0 && Math.floor(i / colonnes) === rangeeDeMoi}
                    moi={palier.palier === palierDeMoi ? (atteint === 0 ? "depart" : "ici") : null}
                    gaulois={gaulois}
                    occupe={occupe || !sentier.peut_avancer}
                    inventaire={inventaire}
                    objetDeSaison={palier.palier === saison.paliers ? (saison.objet ?? null) : null}
                    onPrendre={() => void prendre(palier)}
                  />
                ))}
              </ol>
              {pliable && (
                <div class="pj-voir-tout">
                  <span class="jeu-bulle jeu-n9" data-testid="sentier-rangee">
                    <Px
                      t={entiere ? `Les ${sentier.paliers.length} paliers` : `Paliers ${rangee.debut} à ${rangee.fin} sur ${sentier.paliers.length}`}
                      couleur="marine"
                      dit={entiere ? `Les ${sentier.paliers.length} paliers` : `Paliers ${rangee.debut} à ${rangee.fin} sur ${sentier.paliers.length}`}
                    />
                    {!entiere && rangee.ailleurs > 0 && <Px t={`${rangee.ailleurs} ${rangee.ailleurs > 1 ? "objets" : "objet"} à prendre plus loin`} couleur="mystique" dit={`, ${rangee.ailleurs} ${rangee.ailleurs > 1 ? "objets" : "objet"} à prendre plus loin`} />}
                  </span>
                  <button type="button" class="jeu-btn jeu-btn-bleu jeu-n9" aria-expanded={entiere} onClick={() => setTout(!entiere)} data-testid="sentier-voir-tout">
                    <Px t={entiere ? "Replier" : `Voir les ${sentier.paliers.length} paliers`} couleur="creme" relief="cerne" />
                  </button>
                </div>
              )}
              <ul class="pj-legende" aria-label="Les raretés des objets">
                {raretes.map((r) => (
                  <li key={r} class="pj-puce jeu-bulle jeu-n9" data-rarete={r}>
                    <BoosterDuPalier rarete={r} classe="pj-booster-mini" />
                    <RangEnIcone rang={RARETES_DES_OBJETS[r].rang} rarete={r} />
                    <Px t={RARETES_DES_OBJETS[r].nom} couleur={r} dit={RARETES_DES_OBJETS[r].nom} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      ) : (
        <p class="pj-note pj-hors-saison jeu-bulle jeu-n9" data-testid="sentier-hors-saison">
          Entre deux saisons : la prochaine n'a pas encore de date.
        </p>
      )}

      <section class="pj-jour" aria-labelledby="sentier-aujourdhui">
        <h3 id="sentier-aujourdhui" class="pj-titre">
          <span class="jeu-ruban jeu-n9">
            <Px t="Aujourd'hui" couleur="creme" relief="ombre" />
          </span>
        </h3>
        <div class="pj-grille">
          {saison && sentier.missions.length > 0 && <Missions sentier={sentier} />}
          {saison && !saison.finie && <Calendrier sentier={sentier} />}
          {saison && <Defi sentier={sentier} />}
          <Etal sentier={sentier} onAcheter={() => setEtal(true)} />
        </div>
        {saison && sentier.defi && (
          <p class="pj-note pj-credit">
            Carte de France : © OpenFront and Contributors, sous licence{" "}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr" rel="license noopener">
              CC BY-SA 4.0
            </a>{" "}
            (<a href={`${basePath()}/openfront/LISEZ-MOI.txt`}>source</a>).
          </p>
        )}
      </section>

      {saison && !saison.finie && (
        <p class="pj-note pj-releve" data-testid="sentier-releve">
          Les parties sont relevées toutes les 5 minutes environ{sentier.releve ? `, la dernière fois le ${instant(sentier.releve)}` : ""}. Une journée se valide jusqu'au lendemain soir.
        </p>
      )}

      {ouverture && recu && rareteRecue && (
        <FenetreDuBooster
          titre={ouverture.revele ? (ouverture.recu.objet.double ? "Un double" : `Palier ${ouverture.recu.palier}`) : `Booster du palier ${ouverture.recu.palier}`}
          etape={ouverture.revele ? "revele" : "ouvre"}
          occupe={!ouverture.revele}
          scene
          onFermer={fermerLOuverture}
          testid="dialogue-palier"
        >
          <OuvertureDuBooster
            sorte="surprise"
            autre={{ paquet: planche(rareteRecue), nom: `Booster du palier ${ouverture.recu.palier}` }}
            carte={ouverture.carte}
            revelee={ouverture.revele}
            onRevelee={() => setOuverture((o) => (o ? { ...o, revele: true } : o))}
          >
            <ResultatDuBooster
              nom={recu.fiche.nom}
              detail={
                rareteRecue === "saison" ? (
                  <span class="bst-rarete-px">
                    <RangEnIcone rang={5} rarete="saison" />
                    <Px t={RARETES_DES_OBJETS.saison.nom} couleur="legendaire" dit={RARETES_DES_OBJETS.saison.nom} />
                  </span>
                ) : (
                  <RareteEnPixels rarete={rareteRecue} />
                )
              }
              double={ouverture.recu.objet.double}
              testid="palier-recu"
            >
              <span hidden data-objet={`${ouverture.recu.objet.emplacement}/${ouverture.recu.objet.objet}`} />
            </ResultatDuBooster>
            {ouverture.recu.insigne && (
              <p class="bst-mot pj-insigne-recu" data-testid="palier-insigne">
                <InsigneDeSaison saison={ouverture.recu.insigne.saison} echelle={2} />
                Et l'insigne de la {ouverture.recu.insigne.nom.toLowerCase()}.
              </p>
            )}
            {ouverture.recu.objet.double && <p class="bst-mot">Un double : vous l'aviez déjà. Il se fond à la forge ou se vend au marché.</p>}
            <div class="bst-actions">
              <BoutonDesBoosters t="Le porter" or onClick={() => void porter(ouverture.recu.objet)} testid="palier-porter" />
              <BoutonDesBoosters t="Fermer" onClick={fermerLOuverture} testid="palier-fermer" />
            </div>
          </OuvertureDuBooster>
        </FenetreDuBooster>
      )}
      {etal && sentier.etal && objetDeLEtal && (
        <DialogueAchat
          objet={objetDeLEtal.fiche}
          rarete={objetDeLEtal.fiche.rarete}
          vignette={vignetteDeLObjet(objetDeLEtal.emplacement, objetDeLEtal.objet)}
          prix={sentier.etal.prix}
          solde={sentier.solde}
          acheter={async () => {
            const issue = await s.acheter({ emplacement: objetDeLEtal.emplacement, objet: objetDeLEtal.objet }, sentier.etal?.prix ?? 0);
            if (issue.ok) void lireLInventaire();
            return issue;
          }}
          onPorter={() => void porter({ emplacement: objetDeLEtal.emplacement, objet: objetDeLEtal.objet })}
          onFermer={() => setEtal(false)}
        />
      )}
    </div>
  );
}
