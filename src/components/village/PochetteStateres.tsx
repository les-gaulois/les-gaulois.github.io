import { useCallback, useState } from "preact/hooks";
import { ServerError, call } from "../../lib/compte/api";
import type { LotDeStateres, MaPochetteStateres, PochetteStateresReponse } from "../../lib/village/contrat";
import { manque, nombre, pourcent, stateres } from "../../lib/village/ecran-boutique";
import { carteDUnLot, type CarteDeScene } from "../../lib/jeu/boosters";
import type { CouleurDEcriture } from "../../lib/jeu/dans-la-page";
import { reveillerLeSon } from "../../lib/jeu/sons-des-boosters";
import {
  ANCRE_POCHETTE_STATERES,
  apresLOuverture,
  chanceDeGagner,
  lireMaPochetteStateres,
  lireOuvertureDeStateres,
  messageDuRefusDesStateres,
  raisonPochetteStateresFermee,
  rareteDuLot,
  resteAujourdhui,
  retourMoyen,
} from "../../lib/village/pochette-stateres";
import { Px } from "../jeu/Pixels";
import type { Issue } from "./BoutiqueDialogue";
import { BoutonDesBoosters, ConfirmerLeBooster, FenetreDuBooster, FicheDuBooster, LosangesEnPixels, ResteEnPixels, ResultatDuBooster } from "./KitDesBoosters";
import { OuvertureDuBooster } from "./OuvertureDuBooster";
import { casesDeLaPochette } from "./PochetteDessin";

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

/** Les cases de la pochette de statères, pour qui la dessine ailleurs (les lots de la loterie). */
export const casesDeLaPochetteDeStateres = (): readonly (string | null)[] => CASES_POCHETTE;

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
        if (!tirage) {
          // Le prix a pu être débité : la pochette se relit, pour que le solde et le compte du jour soient ceux du serveur.
          void lire(true);
          return { ok: false, message: ILLISIBLE };
        }
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

/**
 * Le booster de statères, sous l'étal (fiche du kit, `FicheDuBooster`) : son paquet, son prix, chaque gain avec sa chance,
 * toujours écrits avant d'ouvrir, tels que le serveur les donne, ce qu'il rend en moyenne (calculé sur ces lots, pas
 * recopié), ce qu'il reste à ouvrir aujourd'hui, et le bouton, ou la raison pour laquelle il ne peut pas ouvrir.
 * `solde` : le dernier que le serveur a donné à la page ; `gagnees` : ceux gagnés à la loterie, qui s'ouvrent sans payer.
 */
export function PochetteStateres({ ma, solde, gagnees = 0, onOuvrir }: { ma: MaPochetteStateres; solde: number; gagnees?: number; onOuvrir: () => void }) {
  const raison = raisonPochetteStateresFermee(ma, solde);
  const moyenne = retourMoyen(ma.lots);
  const reste = resteAujourdhui(ma);
  return (
    <div id={ANCRE_POCHETTE_STATERES}>
      <FicheDuBooster
        sorte="stateres"
        nom="Booster de statères"
        testid="pochette-stateres"
        album={null}
        contenu={`${ma.lots.length} lots`}
        prix={ma.prix}
        compte={`${ma.plafond} par jour au plus${ma.peut_ouvrir && reste > 0 ? `, encore ${reste} aujourd'hui` : ""}`}
        gagnees={gagnees}
        raison={raison}
        onOuvrir={onOuvrir}
        lignes={ma.lots.map((lot) => ({ kind: "lot" as const, rang: lot.rang, gain: lot.gain, chance: pourcent(lot.chance) }))}
        regle={
          <p data-testid="pochette-stateres-regle">
            En moyenne, il rend {stateres(moyenne)}
            {moyenne === ma.prix ? ", autant que son prix" : ""}. Il rend plus que son prix {pourcent(chanceDeGagner(ma.lots, ma.prix))} du temps.
          </p>
        }
      />
    </div>
  );
}

/**
 * Ouvrir un booster de statères : la fenêtre dit le prix et ce qu'il restera, demande au serveur, puis le joueur ouvre le
 * paquet et retourne la carte du lot que le serveur a tiré (`OuvertureDuBooster.tsx`, qui remplace le tambour depuis le 21
 * novembre 2026) : ses pièces, son gain, son rang parmi les six lots, dont la lumière et la fête suivent celles des
 * raretés. « Ouvrir un autre » repart du solde que le serveur vient de répondre, tant que le compte en a le droit (dix par
 * jour au plus) et les moyens ; le serveur revérifie tout. Si le serveur refuse, il ne reste que les mots du refus et
 * « Fermer ».
 */
export function DialogueStateres({ ma, solde, ouvrir, onFermer }: { ma: MaPochetteStateres; solde: number; ouvrir: () => Promise<Issue<PochetteStateresReponse>>; onFermer: () => void }) {
  const [etape, setEtape] = useState<"confirmer" | "envoi" | "ouvre" | "revele">("confirmer");
  const [refus, setRefus] = useState<string | null>(null);
  const [tirage, setTirage] = useState<PochetteStateresReponse | null>(null);
  const [carte, setCarte] = useState<CarteDeScene | null>(null);
  // Une ouverture de plus fait une nouvelle scène.
  const [numero, setNumero] = useState(0);
  // Le compte montré est celui du moment où la fenêtre s'ouvre (ou de la dernière ouverture) : il ne bouge pas derrière.
  const [depart, setDepart] = useState(solde);
  // Les lots du moment où la fenêtre s'ouvre : ceux du tirage.
  const [lots] = useState<readonly LotDeStateres[]>(ma.lots);
  const envoyer = async () => {
    // Dans le clic : sinon certains navigateurs gardent la scène muette.
    reveillerLeSon();
    setEtape("envoi");
    setRefus(null);
    const issue = await ouvrir();
    if (!issue.ok) {
      setRefus(issue.message);
      setTirage(null);
      setEtape("confirmer");
      return;
    }
    setCarte(carteDUnLot(issue.valeur.lot.rang, issue.valeur.lot.gain, lots.length));
    setTirage(issue.valeur);
    setNumero((n) => n + 1);
    setEtape("ouvre");
  };
  const ouverte = (etape === "ouvre" || etape === "revele") && tirage !== null && carte !== null;
  const revele = etape === "revele" && tirage !== null;
  const encore = tirage ? Math.max(0, ma.plafond - tirage.ouvertes) : 0;
  // La chance du lot tiré, si la liste le connaît : sinon, la phrase ne s'écrit pas (jamais un zéro à la place).
  const chanceDuLot = tirage ? lots.find((lot) => lot.rang === tirage.lot.rang)?.chance : undefined;
  const peutRejouer = tirage !== null && encore > 0 && tirage.solde >= ma.prix;
  const rejouer = () => {
    if (!tirage) return;
    setDepart(tirage.solde);
    setTirage(null);
    setCarte(null);
    setEtape("confirmer");
  };
  const titre = revele && tirage ? `+${nombre(tirage.lot.gain)} statères` : refus ? "Le booster reste fermé" : "Booster de statères";
  return (
    <FenetreDuBooster titre={titre} etape={ouverte ? `ouvre-${numero}` : "confirmer"} occupe={etape === "envoi" || etape === "ouvre"} scene={ouverte} onFermer={onFermer} testid="dialogue-stateres">
      {ouverte && tirage && carte ? (
        <OuvertureDuBooster key={numero} sorte="stateres" carte={carte} revelee={revele} onRevelee={() => setEtape((e) => (e === "ouvre" ? "revele" : e))}>
          <ResultatDuBooster
            nom={`+${nombre(tirage.lot.gain)} statères`}
            detail={
              <>
                <LosangesEnPixels rang={tirage.lot.rang} couleur={rareteDuLot(tirage.lot.rang) as CouleurDEcriture} />
                <Px t={`Lot ${tirage.lot.rang} sur ${lots.length}`} couleur={rareteDuLot(tirage.lot.rang) as CouleurDEcriture} dit={`Lot ${tirage.lot.rang} sur ${lots.length}`} />
              </>
            }
            testid="pochette-stateres-tirage"
          >
            <span hidden data-rang={tirage.lot.rang} />
          </ResultatDuBooster>
          <ResteEnPixels solde={tirage.solde} testid="pochette-stateres-reste" />
          <p class="bst-mot">
            {chanceDuLot !== undefined ? `Ce lot sort ${pourcent(chanceDuLot)} du temps. ` : ""}
            {encore > 0 ? `Encore ${encore} ${encore > 1 ? "boosters" : "booster"} aujourd'hui.` : "C'était le dernier d'aujourd'hui."}
          </p>
          <div class="bst-actions">
            {peutRejouer && <BoutonDesBoosters t="Ouvrir un autre" or onClick={rejouer} testid="pochette-stateres-rejouer" />}
            <BoutonDesBoosters t="Fermer" onClick={onFermer} testid="pochette-stateres-fermer" />
          </div>
        </OuvertureDuBooster>
      ) : (
        // Le booster rend toujours un lot : ce qu'il restera est un minimum.
        <ConfirmerLeBooster sorte="stateres" prix={ma.prix} solde={depart} auMoins refus={refus} envoi={etape === "envoi"} onOuvrir={() => void envoyer()} onFermer={onFermer} testid="pochette-stateres" />
      )}
    </FenetreDuBooster>
  );
}
