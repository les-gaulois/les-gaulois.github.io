import { useCallback, useState } from "preact/hooks";
import { ServerError, call } from "../../lib/compte/api";
import { Loading, Problem } from "../compte/common";
import { OBJETS, changerObjet, tenueDuServeur, vignetteDeLObjet } from "../../lib/gaulois";
import type { MonSentier, PalierDuSentier, PalierReponse, RefObjet } from "../../lib/village/contrat";
import { instant, lireAchat, manque, objetPayant, points } from "../../lib/village/ecran-boutique";
import {
  NOMS_DES_MISSIONS,
  apresLEtal,
  apresLePalier,
  avancee,
  casesDuCalendrier,
  etatDuPalier,
  jourEnMots,
  joursRestants,
  lireMonSentier,
  lirePalierPris,
  messageDuRefusDuSentier,
  motPas,
  palierAtteint,
  paliersAPrendre,
  part,
  raisonEtalFerme,
  versLeSuivant,
} from "../../lib/village/sentier";
import { CaseMontree, Dialogue, DialogueAchat, type Issue } from "./BoutiqueDialogue";
import { MarqueDeRarete, Pixels, Prix } from "./BoutiquePixels";

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

/** La coche d'une chose faite, décorative : « faite » est écrit à côté. */
function Coche() {
  return (
    <svg class="sentier-coche" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2 6.5 5 9.5 10 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" />
    </svg>
  );
}

function Missions({ sentier }: { sentier: MonSentier }) {
  return (
    <section class="sentier-carte" aria-labelledby="sentier-missions-titre" data-testid="sentier-missions">
      <h3 id="sentier-missions-titre" class="nom-champ vestiaire-titre">
        Les missions du jour
      </h3>
      <ul class="sentier-missions">
        {sentier.missions.map((mission) => {
          const ou = avancee(mission);
          return (
            <li key={mission.code} data-faite={mission.gagnee ? "" : undefined} data-testid={`mission-${mission.code}`}>
              <span class="sentier-puce">{mission.gagnee && <Coche />}</span>
              <span class="sentier-mission-nom">
                {NOMS_DES_MISSIONS[mission.code]}
                {mission.gagnee && <span class="sr-only">, faite</span>}
                {!mission.gagnee && ou && <span class="sentier-ou tnum"> {ou}</span>}
              </span>
              <span class="sentier-gain tnum">{motPas(sentier.regles.mission)}</span>
              {!mission.gagnee && mission.cible > 1 && <Barre fait={mission.fait} cible={mission.cible} />}
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
  return (
    <section class="sentier-carte" aria-labelledby="sentier-defi-titre" data-testid="sentier-defi" data-rempli={rempli ? "" : undefined}>
      <h3 id="sentier-defi-titre" class="nom-champ vestiaire-titre">
        Le défi du clan
      </h3>
      <p class="sentier-chiffre">
        <strong class="tnum">{points(defi.points)}</strong> <span class="tnum">sur {defi.cible} points rapportés au clan aujourd'hui</span>
      </p>
      <Barre fait={defi.points} cible={defi.cible} />
      <p class="pochette-note" data-testid="sentier-defi-regle">
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
  return (
    <section class="sentier-carte" aria-labelledby="sentier-calendrier-titre" data-testid="sentier-calendrier">
      <h3 id="sentier-calendrier-titre" class="nom-champ vestiaire-titre">
        Le calendrier
      </h3>
      <ol class="sentier-calendrier" aria-label={`${cochees} jours de visite sur ${cases}`}>
        {Array.from({ length: cases }, (_, i) => (
          <li key={i} data-cochee={i < cochees ? "" : undefined} data-cadeau={i === cases - 1 ? "" : undefined}>
            {i < cochees ? <Coche /> : <span class="tnum">{i === cases - 1 ? `+${sentier.regles.semaine}` : i + 1}</span>}
          </li>
        ))}
      </ol>
      <p class="pochette-note">
        Chaque jour de visite donne {motPas(sentier.regles.visite)}, le septième {motPas(sentier.regles.semaine)} de plus. Un jour manqué ne retire rien.
      </p>
    </section>
  );
}

function Etal({ sentier, onAcheter }: { sentier: MonSentier; onAcheter: () => void }) {
  const etal = sentier.etal;
  const ref = etal ? objetPayant(etal.emplacement, etal.objet) : null;
  if (!etal || !ref) return null;
  const raison = raisonEtalFerme(sentier, etal);
  return (
    <section class="sentier-carte sentier-etal" aria-labelledby="sentier-etal-titre" data-testid="sentier-etal">
      <h3 id="sentier-etal-titre" class="nom-champ vestiaire-titre">
        L'étal du jour
      </h3>
      <div class="sentier-etal-corps">
        <CaseMontree objet={ref.fiche} rarete={ref.fiche.rarete} vignette={vignetteDeLObjet(ref.emplacement, ref.objet)} />
        <div class="sentier-etal-prix">
          <Prix montant={etal.prix} class="pochette-prix" />
          <span class="sentier-ancien-prix">
            <span class="sr-only">au lieu de </span>
            <s class="tnum">{etal.prix_boutique}</s>
            <span class="sr-only"> statères à la boutique</span>
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
      <p class="pochette-note">Un objet de la boutique, {sentier.regles.remise} pour cent moins cher. Il change à minuit.</p>
    </section>
  );
}

function Palier({ palier, atteint, pas, occupe, onPrendre }: { palier: PalierDuSentier; atteint: number; pas: number; occupe: boolean; onPrendre: () => void }) {
  const etat = etatDuPalier(palier, atteint);
  const pris = palier.pris ? objetPayant(palier.pris.emplacement, palier.pris.objet) : null;
  const vignette = pris ? vignetteDeLObjet(pris.emplacement, pris.objet) : null;
  const echelle = vignette ? Math.max(1, Math.min(3, Math.floor(72 / Math.max(vignette.largeur, vignette.hauteur)))) : 1;
  return (
    <li class="case case-montree palier" data-rarete={palier.rarete} data-etat={etat} data-testid={`palier-${palier.palier}`}>
      <span class="case-image">
        {vignette ? <Pixels largeur={vignette.largeur} hauteur={vignette.hauteur} cases={vignette.cases} echelle={echelle} class="case-dessin" /> : <span class="palier-numero tnum">{palier.palier}</span>}
      </span>
      <span class="case-nom">
        <span class={vignette ? "" : "sr-only"}>Palier {palier.palier}</span>
        {pris && <span class="sr-only">, </span>}
        {pris && <span class="palier-objet">{pris.fiche.nom}</span>}
      </span>
      <MarqueDeRarete rarete={palier.rarete} />
      {etat === "a-prendre" && (
        <button type="button" class="btn btn-primary palier-prendre" disabled={occupe} onClick={onPrendre} data-testid={`palier-prendre-${palier.palier}`}>
          Prendre<span class="sr-only"> l'objet du palier {palier.palier}</span>
        </button>
      )}
      {etat === "ferme" && <span class="palier-seuil tnum">à {motPas(pas)}</span>}
      {etat === "pris" && !pris && <span class="palier-seuil">pris</span>}
    </li>
  );
}

type Fenetre = { kind: "palier"; recu: PalierReponse } | { kind: "etal" } | null;

/**
 * « Le sentier », onglet de « Mon Gaulois » (16 novembre 2026, demande du pilote : « un peu comme un passe de combat »).
 * En tête, la saison, les pas et ce qui reste avant le palier suivant ; puis ce qui se fait aujourd'hui (les trois
 * missions, le défi du clan, le calendrier, l'étal) ; puis les paliers et leurs objets. Tout vient du serveur : l'écran ne
 * compte aucun pas. Rien n'est du temps réel : l'heure du dernier relevé des parties est écrite.
 */
export default function LeSentier({ sentier: s }: { sentier: Sentier }) {
  const [fenetre, setFenetre] = useState<Fenetre>(null);
  const [occupe, setOccupe] = useState(false);
  const [probleme, setProbleme] = useState<string | null>(null);
  const [reussite, setReussite] = useState<string | null>(null);

  if (s.etat.kind === "lecture") return <Loading label="Lecture du sentier…" />;
  if (s.etat.kind === "panne") return <Problem message="Le sentier ne répond pas pour l'instant." onRetry={() => void s.lire()} />;
  const sentier = s.etat.sentier;
  const saison = sentier.saison;
  const atteint = saison ? palierAtteint(sentier.pas, saison) : 0;
  const suivant = saison ? versLeSuivant(sentier.pas, saison) : null;
  const attendent = paliersAPrendre(sentier);

  const prendre = async (palier: number) => {
    setOccupe(true);
    setProbleme(null);
    setReussite(null);
    const issue = await s.prendre(palier);
    setOccupe(false);
    if (issue.ok) setFenetre({ kind: "palier", recu: issue.valeur });
    else setProbleme(issue.message);
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
      {saison ? (
        <header class="sentier-tete" data-testid="sentier-tete">
          <p class="sentier-saison">
            <strong>{saison.nom}</strong>
            {saison.finie ? (
              <span data-testid="sentier-finie">
                finie le {jourEnMots(saison.fin)}
                {saison.prendre_jusqu_au ? ` : vos objets se prennent jusqu'au ${jourEnMots(saison.prendre_jusqu_au)}` : ""}
              </span>
            ) : (
              <span>
                jusqu'au {jourEnMots(saison.fin)}, encore {joursRestants(sentier.jour, saison.fin)} {joursRestants(sentier.jour, saison.fin) > 1 ? "jours" : "jour"}
              </span>
            )}
          </p>
          <p class="sentier-pas">
            <span class="bourse-nombre tnum" data-testid="sentier-pas">
              {sentier.pas}
            </span>
            <span class="sentier-pas-mot">XP</span>
            <span class="sentier-palier tnum" data-testid="sentier-palier">
              Palier {atteint} sur {saison.paliers}
            </span>
          </p>
          {suivant && !saison.finie && (
            <>
              <Barre fait={suivant.fait} cible={suivant.cible} />
              <p class="pochette-note tnum" data-testid="sentier-suivant">
                Encore {motPas(suivant.reste)} avant le palier {suivant.palier}.
              </p>
            </>
          )}
          {!sentier.peut_avancer && (
            <p class="pochette-raison" data-testid="sentier-raison">
              {messageDuRefusDuSentier("not_validated")}
            </p>
          )}
        </header>
      ) : (
        <p class="pochette-note" data-testid="sentier-hors-saison">
          Entre deux saisons : la prochaine n'a pas encore de date.
        </p>
      )}

      {probleme && (
        <p class="form-problem" role="alert" data-testid="sentier-probleme">
          {probleme}
        </p>
      )}
      <p class="form-success" role="status" data-testid="sentier-reussite">
        {reussite}
      </p>

      <div class="sentier-jour">
        {saison && sentier.missions.length > 0 && <Missions sentier={sentier} />}
        {saison && <Defi sentier={sentier} />}
        {saison && !saison.finie && <Calendrier sentier={sentier} />}
        <Etal sentier={sentier} onAcheter={() => setFenetre({ kind: "etal" })} />
      </div>

      {saison && (
        <section class="sentier-chemin" aria-labelledby="sentier-paliers-titre">
          <h3 id="sentier-paliers-titre" class="nom-champ vestiaire-titre">
            Les paliers
            {attendent > 0 && (
              <span class="sentier-attendent tnum" data-testid="sentier-attendent">
                {attendent} {attendent > 1 ? "objets" : "objet"} à prendre
              </span>
            )}
          </h3>
          <p class="pochette-note">Chaque palier donne un objet de la boutique, de la rareté écrite, que vous n'avez pas encore tant qu'il en reste.</p>
          <ol class="sentier-paliers" data-testid="sentier-paliers">
            {sentier.paliers.map((palier) => (
              <Palier key={palier.palier} palier={palier} atteint={atteint} pas={palier.palier * saison.pas_par_palier} occupe={occupe || !sentier.peut_avancer} onPrendre={() => void prendre(palier.palier)} />
            ))}
          </ol>
        </section>
      )}

      {saison && !saison.finie && (
        <p class="pochette-note" data-testid="sentier-releve">
          Les parties sont relevées toutes les 5 minutes environ{sentier.releve ? `, la dernière fois le ${instant(sentier.releve)}` : ""}. Une journée se valide jusqu'au lendemain soir.
        </p>
      )}

      {fenetre?.kind === "palier" && recu && (
        <Dialogue titre={`Palier ${fenetre.recu.palier} : ${recu.fiche.nom}`} etape="fait" occupe={false} onFermer={() => setFenetre(null)} testid="dialogue-palier">
          <CaseMontree objet={recu.fiche} rarete={recu.fiche.rarete} vignette={vignetteDeLObjet(recu.emplacement, recu.objet)} />
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
          acheter={() => s.acheter({ emplacement: etal.emplacement, objet: etal.objet }, sentier.etal?.prix ?? 0)}
          onPorter={() => void porter({ emplacement: etal.emplacement, objet: etal.objet })}
          onFermer={() => setFenetre(null)}
        />
      )}
    </div>
  );
}
