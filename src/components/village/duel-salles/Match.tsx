import { useEffect, useRef, useState } from "preact/hooks";
import { ServerError } from "../../../lib/compte/api";
import { TENUE_DE_DEPART, lireTenue, type Tenue } from "../../../lib/gaulois";
import { enCapitales } from "../../../lib/jeu/ecriture";
import type { MatchDeSalle } from "../../../lib/village/contrat-salles";
import { ADVERSAIRES_D_ENTRAINEMENT } from "../../../lib/village/ecran-duel";
import { coupsDeMonCote, issueEnMots, luiDe, mainEnListe, potDeLaSalle, stateresEnMots, tempsDeLaManche, type TempsDeLaManche } from "../../../lib/village/ecran-salles";
import { familierDe, type Familier } from "../../../lib/village/familiers";
import { Etiquette, Px } from "../../jeu/Pixels";
import { messageOf } from "../../compte/common";
import { PrixDuJeu } from "../BoutiqueDuJeu";
import type { MoteurDuDuel } from "../duel/moteur";
import { estUnLieu } from "../duel/moteur-du-site";
import { urlDePetiteIcone } from "../duel/petites-icones";
import { lancerLeDuel, type CampAPoser, type LieuDuDuel, type OptionsDeLaScene, type SceneDuDuel } from "../duel/SceneDuDuel";
import { SON } from "../duel/sons-du-duel";
import { PALIERS_DU_SABLIER, iconeMachine, iconePose, iconeReflechit, palierDuSablier, sablier } from "./dessins-salles";
import { FinDuMatch } from "./Fin";
import { Refus } from "./Hall";
import { ImageDesSalles, Mot, ROUGE, VERT } from "./pieces";
import { FinSansCombat, PontDuMatch } from "./pont";
import type { LienDesSalles } from "./serveur";

/** Les bannières, chargées à la demande par l'accueil du duel : `null` tant qu'elles chargent, `false` si elles n'ont pas pu. */
export type LibDesBannieres = typeof import("../../../lib/village/bannieres");

/** Le lieu du match : la bannière de celui qui attendait dans la salle (comme `lieuDe` de l'accueil du duel). */
function lieuDu(lib: LibDesBannieres | false | null, id: string | null, m: MoteurDuDuel): LieuDuDuel {
  const b = id && lib ? lib.banniereParId(id) : null;
  const decor = id && lib ? lib.dessinDeLaBanniere(id) : null;
  const idDuLieu = b && estUnLieu(b.famille) ? b.famille : null;
  return { nom: b?.nom ?? "", phrase: idDuLieu ? (m.lieux[idDuLieu]?.phrase ?? null) : null, banniere: decor ? { cases: decor.cases, largeur: 124, hauteur: 80, pieds: 72 } : null };
}

/** Le nom d'en face sur son ruban : en capitales, coupé s'il est trop long pour le ruban. */
const nomDuRuban = (nom: string): string => {
  const n = enCapitales(nom.trim());
  return n.length > 14 ? `${n.slice(0, 13)}.` : n || "GAULOIS";
};

/** La machine de l'essai : l'allure du guerrier de l'entraînement. */
const TENUE_DE_LA_MACHINE: Tenue = { ...TENUE_DE_DEPART, ...ADVERSAIRES_D_ENTRAINEMENT.guerrier.allure };

/** L'horloge de la manche, relue quatre fois par seconde. */
function useTemps(match: MatchDeSalle, ecart: number): TempsDeLaManche {
  const [t, setT] = useState(() => tempsDeLaManche(match, Date.now(), ecart));
  useEffect(() => {
    const lire = (): void => setT(tempsDeLaManche(match, Date.now(), ecart));
    lire();
    const id = window.setInterval(lire, 250);
    return () => window.clearInterval(id);
  }, [match.ouverte_le, match.limite, ecart]);
  return t;
}

/** Le bandeau du match (dessin de Claude Fable 5.2) : partir, le sablier et les secondes, l'état d'en face, le pot. */
function Bandeau({ match, ecart, panne, onPartir }: { match: MatchDeSalle; ecart: number; panne: boolean; onPartir: () => void }) {
  const t = useTemps(match, ecart);
  const pose = match.pose !== null;
  const court = t.phase === "pose" && t.secondes <= 5 && !pose;
  const etat = match.fini ? "fini" : t.phase === "revelation" ? "revelation" : pose ? "pose" : court ? "court" : "temps";
  const nom = match.essai ? "La machine" : (match.adversaire?.nom ?? "Un Gaulois");
  const posee = !match.fini && (match.adverse_pose || t.phase === "revelation");
  const { pot, gagnant } = potDeLaSalle(match.mise);
  // Le sable ne bouge que d'un cran à la fois : sept images, une par palier de cinq secondes.
  const palier = match.fini ? 0 : t.phase === "revelation" ? PALIERS_DU_SABLIER : palierDuSablier(t.part);
  // Le lecteur d'écran : le début de la manche, puis dix et cinq secondes ; jamais chaque seconde.
  const [annonce, setAnnonce] = useState("");
  const dite = useRef<string>("");
  useEffect(() => {
    const cle = t.phase === "pose" ? (t.secondes === 10 ? "10" : t.secondes === 5 ? "5" : t.secondes >= 29 ? "debut" : "") : "";
    if (!cle || dite.current === `${match.manche}|${cle}`) return;
    dite.current = `${match.manche}|${cle}`;
    const duree = Math.round((Date.parse(match.limite) - Date.parse(match.ouverte_le)) / 1000);
    setAnnonce(cle === "debut" ? `Manche ${match.manche}.${match.pose === null ? ` ${duree} secondes pour poser.` : ""}` : cle === "10" ? "Dix secondes." : "Cinq secondes.");
  }, [t.phase, t.secondes, match.manche]);
  // Les cinq dernières secondes, un son discret par seconde, tant que ta carte n'est pas posée.
  useEffect(() => {
    if (court && t.secondes > 0) SON.survol();
  }, [court ? t.secondes : -1]);
  // « a posé » : le petit son de la carte, une fois par manche.
  const vuPose = useRef(false);
  useEffect(() => {
    if (match.adverse_pose && !vuPose.current) SON.pose(0.05);
    vuPose.current = match.adverse_pose;
  }, [match.adverse_pose, match.manche]);
  return (
    <div class="ds-bandeau" data-testid="salles-bandeau">
      {!match.fini && (
        <button type="button" class="jeu-btn jeu-btn-bleu jeu-n9 jeu-btn-ic dl-btn ds-partir" aria-label="Quitter le match" data-mot="Quitter" onClick={onPartir}>
          <i class="jeu-pic" style={`--i:${urlDePetiteIcone("fleche", false)}`} />
        </button>
      )}
      <div class="ds-temps-manche" data-etat={etat}>
        <ImageDesSalles cle={`sablier-${palier}`} planche={() => sablier(palier / PALIERS_DU_SABLIER)} />
        {match.fini ? null : t.phase === "revelation" ? (
          <Px t="Révélation" couleur="doux" classe="ds-revelation" muet />
        ) : court ? (
          <Mot t={String(t.secondes)} {...ROUGE} classe="ds-secondes" dit="" />
        ) : (
          <Px t={String(t.secondes)} couleur={pose ? "doux" : "texte"} classe="ds-secondes" muet />
        )}
        {!match.fini && <span class="sr-only" role="timer">{`${t.secondes} secondes`}</span>}
      </div>
      <div class="ds-face" data-pose={posee ? "oui" : "non"}>
        {match.essai && <ImageDesSalles cle="machine" planche={iconeMachine} />}
        {!match.fini && <ImageDesSalles cle={posee ? "pose" : "reflechit"} planche={posee ? iconePose : iconeReflechit} classe="ds-face-carte" />}
        {panne ? <Px t="Connexion perdue" couleur="doux" classe="ds-face-nom" /> : <Px t={nom} couleur="texte" classe="ds-face-nom" />}
        {t.phase !== "revelation" && !panne && !match.fini && (match.adverse_pose ? <Mot t="a posé" {...VERT} classe="ds-face-mot" /> : <Px t="réfléchit" couleur="doux" classe="ds-face-mot" />)}
      </div>
      <div class="ds-pot">
        {match.essai ? (
          <Etiquette t="Essai" ton="bleu" dit="Essai : rien n'est misé" />
        ) : (
          <>
            <span class="sr-only">{`Pot : ${stateresEnMots(pot)}. Au gagnant : ${stateresEnMots(gagnant)}.`}</span>
            <Px t="Pot" couleur="doux" muet />
            <span aria-hidden="true">
              <PrixDuJeu valeur={pot} />
            </span>
            <span class="ds-pot-gagnant" aria-hidden="true">
              <Px t="au gagnant" couleur="doux" muet />
              <PrixDuJeu valeur={gagnant} />
            </span>
          </>
        )}
      </div>
      <p class="sr-only" aria-live="polite">
        {annonce}
      </p>
      <p class="sr-only" role="status">
        {match.adverse_pose ? `${nom} a posé sa carte.` : ""}
      </p>
    </div>
  );
}

/** La confirmation de départ : quitter, c'est perdre. Échap : rester. */
function Confirmation({ match, onRester, onQuitter }: { match: MatchDeSalle; onRester: () => void; onQuitter: () => void }) {
  const rester = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    rester.current?.focus({ preventScroll: true });
    const touche = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") onRester();
    };
    document.addEventListener("keydown", touche);
    return () => document.removeEventListener("keydown", touche);
  }, []);
  return (
    <div class="jeu-panneau jeu-n9 dl-p ds-confirme" role="alertdialog" aria-labelledby="ds-confirme-titre" data-testid="salles-confirme">
      <h4 id="ds-confirme-titre" class="ds-confirme-titre">
        <Px t="Quitter, c'est perdre" couleur="texte" />
      </h4>
      {!match.essai && <p class="dl-p-mot">{`Ta mise de ${stateresEnMots(match.mise)} reste à l'autre Gaulois.`}</p>}
      <div class="ds-fin-boutons">
        <button
          ref={rester}
          type="button"
          class="jeu-btn jeu-n9"
          onClick={() => {
            SON.clic();
            onRester();
          }}
        >
          <Px t="Rester" couleur="encre" />
        </button>
        <button
          type="button"
          class="jeu-btn jeu-btn-bleu jeu-n9"
          data-testid="salles-quitter-match"
          onClick={() => {
            SON.clic();
            onQuitter();
          }}
        >
          <Px t="Quitter le match" couleur="creme" relief="cerne" />
        </button>
      </div>
    </div>
  );
}

export interface ProprietesDuMatch {
  m: MoteurDuDuel;
  lib: LibDesBannieres | false | null;
  gaulois: { tenue: Tenue; familier: Familier | null };
  /** Le match, en cours ou fini (l'état le donne en `match` puis en `dernier`). */
  match: MatchDeSalle;
  lien: LienDesSalles;
  /** La salle du match t'est encore ouverte (pour « Rejouer »). */
  permise: boolean;
  onRejouer: () => void;
  onRetour: () => void;
}

/**
 * Le match en direct : la scène du duel, telle quelle (`../duel/SceneDuDuel.ts`), branchée sur le serveur par le pont ; le
 * bandeau au-dessus ; la confirmation de départ ; la fin. Ma carte part au serveur, qui la garde cachée ; la carte d'en
 * face se retourne quand l'autre a posé. Un match qui finit au combat se termine dans la scène, avec ce que dit le serveur
 * de l'argent ; un match qui finit autrement (le temps, un départ, le duel fermé) y finit tout de suite (`interrompre`),
 * avec sa raison. Sans scène (un match déjà fini à l'ouverture), le panneau de fin.
 */
export function MatchEnDirect({ m, lib, gaulois, match, lien, permise, onRejouer, onRetour }: ProprietesDuMatch) {
  const racine = useRef<HTMLDivElement>(null);
  const scene = useRef<SceneDuDuel | null>(null);
  const pont = useRef<PontDuMatch | null>(null);
  const dernier = useRef<MatchDeSalle>(match);
  dernier.current = match;
  const [montage, setMontage] = useState(0);
  const [finale, setFinale] = useState(false);
  const finaleVue = useRef(false);
  finaleVue.current = finale;
  // La fin donnée à la scène par `interrompre` : une seule fois.
  const interrompue = useRef(false);
  const [partir, setPartir] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const pret = lib !== null;
  const lui = luiDe(match);

  // La scène, montée une fois par match (et remontée si elle a des manches de retard sur le serveur).
  useEffect(() => {
    if (!pret || !racine.current || finaleVue.current) return;
    const depart = dernier.current;
    if (depart.fini) {
      setFinale(true);
      return;
    }
    const p = new PontDuMatch(depart.match, depart.coups.length);
    pont.current = p;
    const adv = depart.adversaire;
    const famLui = adv?.familier ? (familierDe(adv.familier) ?? null) : null;
    const moi: CampAPoser = { ruban: "TOI", bleu: true, dit: "Ton Gaulois", main: mainEnListe(depart.mains[depart.moi]), tenue: gaulois.tenue, familier: gaulois.familier, options: depart.options[depart.moi] };
    const luiCamp: CampAPoser = depart.essai
      ? { ruban: "MACHINE", bleu: false, dit: "La machine, en face", main: mainEnListe(depart.mains[lui]), tenue: TENUE_DE_LA_MACHINE, familier: null, options: depart.options[lui] }
      : { ruban: nomDuRuban(adv?.nom ?? ""), bleu: false, dit: `Le Gaulois d'en face : ${adv?.nom ?? "un Gaulois"}`, main: mainEnListe(depart.mains[lui]), tenue: lireTenue(adv?.tenue) ?? TENUE_DE_DEPART, familier: famLui, options: depart.options[lui] };
    const options: OptionsDeLaScene = {
      moteur: m,
      moi,
      lui: luiCamp,
      lieu: lieuDu(lib, depart.banniere, m),
      jouer: (ia, manche) => {
        const attente = p.attendre(manche);
        lien.poser(depart.match, manche, ia).then(
          (etat) => p.relire(etat.match ?? (etat.dernier?.match === depart.match ? etat.dernier : null)),
          (err) => p.echouer(err),
        );
        return attente;
      },
      reprise: coupsDeMonCote(depart),
      changerUneCarte: null,
      guide: false,
      // La main est fixée en entrant dans la salle : la scène entre seule, sans « Entrer dans l'arène ».
      entreeDirecte: true,
      libelles: { quitter: "Les salles", rejouer: "Rejouer ici" },
      motDeFin: () => {
        const fin = dernier.current;
        if (!fin.fini) return null;
        const i = issueEnMots(fin);
        return [i.argent, i.cagnotte].filter(Boolean).join(" ");
      },
      onFin: () => undefined,
      onErreur: (err) => {
        if (err instanceof FinSansCombat) return;
        if (err instanceof ServerError && (err.code === "match_fini" || err.code === "match_inconnu" || err.code === "mauvaise_manche")) return;
        setErreur(messageOf(err));
      },
      onRejouer,
      onQuitter: onRetour,
    };
    scene.current = lancerLeDuel(racine.current, options);
    return () => {
      p.fermer();
      scene.current?.arreter();
      scene.current = null;
    };
    // La fin posée par-dessus ne l'arrête pas : la scène reste derrière le voile, figée sur sa dernière manche.
  }, [pret, montage]);

  // Chaque relecture : la carte d'en face attendue, une scène en retard, une fin qui n'est pas un combat.
  useEffect(() => {
    const p = pont.current;
    if (!p || finale || interrompue.current) return;
    if (match.fini) {
      const s = scene.current;
      // Au combat, la scène joue la dernière manche et sa fin (la carte d'en face règle la promesse qu'elle attend).
      const parLaScene = match.fin === "combat" && (p.mancheAttendue === match.coups.length || (!p.enAttente && p.jouees >= match.coups.length));
      if (parLaScene) {
        p.relire(match);
        return;
      }
      p.fermer();
      // Une scène restée en arrière (ou pas de scène) montrerait des vies périmées : le panneau de fin, aux chiffres du serveur.
      const enArriere = p.jouees < match.coups.length;
      if (!s || enArriere) {
        setFinale(true);
        return;
      }
      // Le temps, un départ, le duel fermé : la scène finit tout de suite, avec la raison et l'argent dits par le serveur.
      interrompue.current = true;
      const i = issueEnMots(match);
      s.interrompre(match.verdict ?? 0, [i.raison, i.argent, i.cagnotte].filter(Boolean).join(" "));
      return;
    }
    p.relire(match);
    if (p.enRetard(match)) setMontage((n) => n + 1);
  }, [match]);

  useEffect(() => {
    if (!erreur) return;
    const id = window.setTimeout(() => setErreur(null), 4000);
    return () => window.clearTimeout(id);
  }, [erreur]);

  return (
    <section class="dl-ecran dl-arene ds-match" aria-label={match.essai ? "Essai contre la machine" : `Match contre ${match.adversaire?.nom ?? "un Gaulois"}`} data-testid="salles-match">
      <Bandeau match={match} ecart={lien.ecart} panne={lien.panne} onPartir={() => setPartir(true)} />
      {partir && !match.fini && (
        <Confirmation
          match={match}
          onRester={() => setPartir(false)}
          onQuitter={() => {
            setPartir(false);
            void lien.quitter(match.match);
          }}
        />
      )}
      <Refus message={erreur} />
      <div class="dl-arene-cadre ds-arene">
        <div ref={racine} class="dl-racine" />
        {!pret && <p class="dl-attente">Préparation de l'arène…</p>}
        {finale && match.fini && (
          <div class="ds-voile">
            <FinDuMatch match={match} permise={permise} envoi={lien.envoi} onRejouer={onRejouer} onRetour={onRetour} />
          </div>
        )}
      </div>
    </section>
  );
}
