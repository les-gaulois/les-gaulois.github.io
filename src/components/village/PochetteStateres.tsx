import { useCallback, useEffect, useState } from "preact/hooks";
import { ServerError, call } from "../../lib/compte/api";
import type { LotDeStateres, MaPochetteStateres, PochetteStateresReponse } from "../../lib/village/contrat";
import { manque, pourcent, stateres } from "../../lib/village/ecran-boutique";
import { motionAllowed } from "../../lib/fx/motion";
import {
  ANCRE_POCHETTE_STATERES,
  apresLOuverture,
  bandeDesStateres,
  chanceDeGagner,
  dessinDuLot,
  lireMaPochetteStateres,
  lireOuvertureDeStateres,
  messageDuRefusDesStateres,
  raisonPochetteStateresFermee,
  rareteDuLot,
  resteAujourdhui,
  retourMoyen,
} from "../../lib/village/pochette-stateres";
import { Compte, Dialogue, Refus, type BandeVue, type Issue } from "./BoutiqueDialogue";
import { Pixels, Prix } from "./BoutiquePixels";
import { POCHETTE_COTE, casesDeLaPochette } from "./PochetteDessin";
import { BoutonSon, Tambour, preparerLeSon, useSonDuTambour } from "./Tambour";

const ILLISIBLE = "La réponse du serveur est illisible. Rechargez la page.";

/**
 * Le dessin de la pochette de statères : le sac de la pochette surprise (`PochetteDessin.ts`), en cuir vert sombre noué
 * d'or, pour qu'on ne les confonde pas. Seules les couleurs changent, case par case.
 */
const TEINTES: Readonly<Record<string, string>> = {
  "#3a2412": "#10281c",
  "#f0c27c": "#8fd6a4",
  "#d99a55": "#4fae72",
  "#b9783a": "#2f8a55",
  "#8f5727": "#1f6a40",
  "#6b3d1a": "#134a2c",
  "#ff6b78": "#fff1a8",
  "#d81e33": "#f2b632",
  "#8f1220": "#a86d0c",
};
const CASES_POCHETTE = casesDeLaPochette().map((couleur) => (couleur ? (TEINTES[couleur] ?? couleur) : null));

/** Le dessin de la pochette de statères, décoratif : son nom est écrit à côté. */
function DessinPochetteStateres({ echelle, class: classe = "" }: { echelle: number; class?: string }) {
  return <Pixels largeur={POCHETTE_COTE} hauteur={POCHETTE_COTE} cases={CASES_POCHETTE} echelle={echelle} class={classe} />;
}

/** Le tas de pièces d'un lot, décoratif : son gain est écrit à côté. */
function DessinDuLot({ rang, echelle, class: classe = "" }: { rang: number; echelle: number; class?: string }) {
  const dessin = dessinDuLot(rang);
  return <Pixels largeur={dessin.largeur} hauteur={dessin.hauteur} cases={dessin.cases} echelle={echelle} class={classe} />;
}

type EtatDeLaPochette = { kind: "lecture" } | { kind: "panne" } | { kind: "pret"; ma: MaPochetteStateres };

/**
 * La pochette de statères du compte : sa lecture (`get_pochette_stateres`) et son ouverture (`ouvrir_pochette_stateres`).
 * À part des autres fonctions de la boutique : en panne, le reste de la page marche. Après un refus, elle se relit, pour
 * dire ce qui manque d'après le serveur.
 */
export function usePochetteStateres() {
  const [etat, setEtat] = useState<EtatDeLaPochette>({ kind: "lecture" });

  const lire = useCallback(async (discret = false): Promise<MaPochetteStateres | null> => {
    const ma = await call<unknown>("get_pochette_stateres").then(lireMaPochetteStateres, () => null);
    if (ma) setEtat({ kind: "pret", ma });
    else if (!discret) setEtat({ kind: "panne" });
    return ma;
  }, []);

  const ouvrir = useCallback(
    async (prix: number): Promise<Issue<PochetteStateresReponse>> => {
      try {
        // Le prix affiché dans la fenêtre : s'il a changé entre-temps, le serveur refuse (`prix_change`) sans rien débiter.
        const tirage = lireOuvertureDeStateres(await call<unknown>("ouvrir_pochette_stateres", { p_prix_vu: prix }));
        if (!tirage) return { ok: false, message: ILLISIBLE };
        setEtat((e) => (e.kind === "pret" ? { kind: "pret", ma: apresLOuverture(e.ma, tirage) } : e));
        return { ok: true, valeur: tirage };
      } catch (e) {
        const code = e instanceof ServerError ? e.code : "network";
        const fraiche = await lire(true);
        return { ok: false, message: messageDuRefusDesStateres(code, { manque: fraiche ? manque(fraiche.solde, fraiche.prix) : null }) };
      }
    },
    [lire],
  );

  return { etat, ma: etat.kind === "pret" ? etat.ma : null, lire, ouvrir };
}

/** Les losanges d'un lot, de un à six : le repère de forme, la couleur n'est jamais le seul. */
function Losanges({ rang }: { rang: number }) {
  return (
    <span class="case-rang" aria-hidden="true">
      {Array.from({ length: rang }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

/**
 * La pochette de statères, dans l'onglet « Pochettes » de « La boutique » : son dessin, son prix, chaque gain avec sa
 * chance, toujours écrits avant d'ouvrir, tels que le serveur les donne, ce qu'elle rend en moyenne (calculé sur ces
 * lots, pas recopié), ce qu'il reste à ouvrir aujourd'hui, et le bouton, ou la raison pour laquelle il ne peut pas ouvrir.
 * `solde` : le dernier que le serveur a donné à la page.
 */
export function PochetteStateres({ ma, solde, onOuvrir }: { ma: MaPochetteStateres; solde: number; onOuvrir: () => void }) {
  const raison = raisonPochetteStateresFermee(ma, solde);
  const moyenne = retourMoyen(ma.lots);
  const reste = resteAujourdhui(ma);
  return (
    <section id={ANCRE_POCHETTE_STATERES} class="pochette pochette-stateres" aria-labelledby="pochette-stateres-titre" data-testid="pochette-stateres">
      <div class="pochette-tete">
        <DessinPochetteStateres echelle={3} class="pochette-dessin" />
        <div class="pochette-nom">
          <h4 id="pochette-stateres-titre" class="nom-champ vestiaire-titre">
            La pochette de statères
          </h4>
          <Prix montant={ma.prix} class="pochette-prix" />
        </div>
      </div>
      <ul class="pochette-chances pochette-stateres-lots" aria-label="Gains et chances" data-testid="pochette-stateres-lots">
        {ma.lots.map((lot) => (
          <li key={lot.rang} data-rarete={rareteDuLot(lot.rang)}>
            <Losanges rang={lot.rang} />
            <span class="pochette-rarete tnum">{stateres(lot.gain)}</span>
            <span class="tnum">{pourcent(lot.chance)}</span>
          </li>
        ))}
      </ul>
      <p class="pochette-note" data-testid="pochette-stateres-regle">
        En moyenne, elle rend {stateres(moyenne)}
        {moyenne === ma.prix ? ", autant que son prix" : ""}. Elle rend plus que son prix {pourcent(chanceDeGagner(ma.lots, ma.prix))} du temps. {ma.plafond} par jour au plus
        {ma.peut_ouvrir && reste > 0 ? `, encore ${reste} aujourd'hui` : ""}.
      </p>
      {raison ? (
        <p class="pochette-raison" data-testid="pochette-stateres-raison">
          {raison}
        </p>
      ) : (
        <div>
          <button type="button" class="btn btn-secondary" onClick={onOuvrir} data-testid="pochette-stateres-ouvrir">
            Ouvrir une pochette
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * Ouvrir une pochette de statères : la fenêtre dit le prix et ce qu'il restera, demande au serveur, puis fait tourner le
 * tambour (`Tambour.tsx`) jusqu'au lot tiré et le montre. Le tambour ne fait défiler que les vrais lots, à leurs vraies
 * chances (`bandeDesStateres`) : il ne fait que montrer ce que le serveur a déjà tiré. « Passer » l'arrête ; animations
 * coupées, il ne tourne pas. « Ouvrir une autre » repart du solde que le serveur vient de répondre, tant que le compte en
 * a le droit et les moyens ; le serveur revérifie tout. Si le serveur refuse, il ne reste que les mots du refus et « Fermer ».
 */
export function DialogueStateres({ ma, solde, ouvrir, onFermer }: { ma: MaPochetteStateres; solde: number; ouvrir: () => Promise<Issue<PochetteStateresReponse>>; onFermer: () => void }) {
  const [etape, setEtape] = useState<"confirmer" | "envoi" | "tourne" | "arrete" | "revele">("confirmer");
  const [refus, setRefus] = useState<string | null>(null);
  const [tirage, setTirage] = useState<PochetteStateresReponse | null>(null);
  const [bande, setBande] = useState<BandeVue | null>(null);
  const [passer, setPasser] = useState(false);
  const [son, basculerSon] = useSonDuTambour();
  // Le compte montré est celui du moment où la fenêtre s'ouvre (ou de la dernière ouverture) : il ne bouge pas derrière.
  const [depart, setDepart] = useState(solde);
  // Les lots du moment où la fenêtre s'ouvre : ceux du tirage.
  const [lots] = useState<readonly LotDeStateres[]>(ma.lots);
  const envoyer = async () => {
    if (son) preparerLeSon();
    setEtape("envoi");
    setRefus(null);
    setPasser(false);
    const issue = await ouvrir();
    if (!issue.ok) {
      setRefus(issue.message);
      setTirage(null);
      setEtape("confirmer");
      return;
    }
    const tour = bandeDesStateres(issue.valeur.lot.rang, lots);
    setTirage(issue.valeur);
    if (tour) {
      setBande({ depart: tour.depart, cible: tour.cible, rangees: tour.rangees.map((rangee) => ({ nom: stateres(rangee.valeur.gain), rarete: rangee.rarete, dessin: dessinDuLot(rangee.valeur.rang) })) });
      setEtape("tourne");
    } else setEtape("revele");
  };
  // Le tambour arrêté reste un instant, le temps de voir le lot fêté, puis le gain paraît en grand.
  useEffect(() => {
    if (etape !== "arrete") return;
    const minuterie = window.setTimeout(() => setEtape("revele"), motionAllowed() ? 1600 : 0);
    return () => window.clearTimeout(minuterie);
  }, [etape]);
  const tourne = (etape === "tourne" || etape === "arrete") && tirage !== null && bande !== null;
  const revele = etape === "revele" && tirage !== null;
  const encore = tirage ? Math.max(0, ma.plafond - tirage.ouvertes) : 0;
  const peutRejouer = tirage !== null && encore > 0 && tirage.solde >= ma.prix;
  const rejouer = () => {
    if (!tirage) return;
    setDepart(tirage.solde);
    setTirage(null);
    setBande(null);
    setEtape("confirmer");
  };
  return (
    <Dialogue titre={tourne ? "La pochette s'ouvre…" : revele && tirage ? `La pochette rend ${stateres(tirage.lot.gain)}` : refus ? "La pochette reste fermée" : "Ouvrir une pochette de statères ?"} etape={tourne ? "tourne" : revele ? "revele" : "confirmer"} occupe={etape === "envoi" || tourne} onFermer={onFermer} testid="dialogue-stateres">
      {tourne && bande ? (
        <>
          <Tambour rangees={bande.rangees} depart={bande.depart} cible={bande.cible} passer={passer} son={son} onArrive={() => setEtape((e) => (e === "tourne" ? "arrete" : e))} />
          <div class="boutique-dialogue-actions">
            {/* « Passer » montre le gain tout de suite, sans attendre la toile : la fenêtre ne reste jamais bloquée. */}
            <button
              type="button"
              class="btn btn-ghost"
              onClick={() => {
                setPasser(true);
                setEtape("revele");
              }}
              data-testid="pochette-stateres-passer"
            >
              Passer
            </button>
            <BoutonSon son={son} onBasculer={basculerSon} testid="pochette-stateres-son" />
          </div>
        </>
      ) : revele && tirage ? (
        <div class="familier-recu">
          <div class="pochette-revelation pochette-stateres-revelation" data-rarete={rareteDuLot(tirage.lot.rang)} data-testid="pochette-stateres-tirage" data-rang={tirage.lot.rang}>
            <DessinDuLot rang={tirage.lot.rang} echelle={5} />
          </div>
          <p class="familier-revelation-traits">
            <span class="tnum">Ce lot sort {pourcent(lots.find((lot) => lot.rang === tirage.lot.rang)?.chance ?? 0)} du temps.</span>
          </p>
          <p class="boutique-dialogue-texte" data-testid="pochette-stateres-reste">
            Il vous reste {stateres(tirage.solde)}. {encore > 0 ? `Encore ${encore} ${encore > 1 ? "pochettes" : "pochette"} aujourd'hui.` : "C'était la dernière d'aujourd'hui."}
          </p>
          <div class="boutique-dialogue-actions">
            {peutRejouer && (
              <button type="button" class="btn btn-primary" onClick={rejouer} data-testid="pochette-stateres-rejouer">
                Ouvrir une autre
              </button>
            )}
            <button type="button" class="btn btn-ghost" onClick={onFermer} data-testid="pochette-stateres-fermer">
              Fermer
            </button>
          </div>
        </div>
      ) : (
        <>
          <div class="pochette-attente" data-envoi={etape === "envoi" ? "" : undefined}>
            <DessinPochetteStateres echelle={4} />
          </div>
          {!refus && <Compte prix={ma.prix} solde={depart} />}
          <Refus message={refus} />
          <div class="boutique-dialogue-actions">
            {!refus && (
              <button type="button" class="btn btn-primary" disabled={etape === "envoi"} onClick={() => void envoyer()} data-testid="pochette-stateres-confirmer">
                {etape === "envoi" ? "Ouverture…" : "Ouvrir"}
              </button>
            )}
            <button type="button" class="btn btn-ghost" disabled={etape === "envoi"} onClick={onFermer} data-testid="pochette-stateres-annuler">
              {refus ? "Fermer" : "Annuler"}
            </button>
          </div>
        </>
      )}
    </Dialogue>
  );
}
