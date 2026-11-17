import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ServerError, call } from "../../lib/compte/api";
import { HAUTEUR_DE_TOILE, LARGEUR_DE_TOILE } from "../../lib/fx/finitions-carte";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, casesDuGaulois, type Tenue } from "../../lib/gaulois";
import { CARTES, finitionParId, lireMesCartes, refusDeCarte, type FinitionDuRayon, type IdDeFinition, type MesCartes } from "../../lib/village/cartes";
import { manque, stateres } from "../../lib/village/ecran-boutique";
import { monterLesCartes } from "../../scripts/cartes-mouvement";
import { Problem, messageOf } from "../compte/common";
import { Compte, Dialogue, Refus } from "./BoutiqueDialogue";
import { MarqueDeRarete, Prix, peindre } from "./BoutiquePixels";

/**
 * Le rayon « Cartes » de la boutique (`src/lib/village/cartes.ts`) : les trente-trois finitions de la carte du membre,
 * celle qui paraît en haut de l'accueil quand il est sur le podium de la semaine. Chaque finition s'essaie sur la carte
 * du haut avant l'achat : rien n'est caché derrière un prix. Le serveur décide de tout (`get_mes_cartes`,
 * `acheter_carte`, `choisir_carte`) ; l'écran ne montre que ce qu'il a reçu, et jamais le solde d'un autre.
 */
type Etat = { kind: "lecture" } | { kind: "panne" } | { kind: "pret"; mes: MesCartes };

const ILLISIBLE = "La réponse du serveur est illisible. Rechargez la page.";

/** La carte d'essai : le Gaulois du membre devant la finition regardée, animée comme sur l'accueil. */
function CarteDEssai({ finition, tenue }: { finition: FinitionDuRayon; tenue: Tenue | null }) {
  const racine = useRef<HTMLDivElement>(null);
  const gaulois = useRef<HTMLCanvasElement>(null);
  const cases = useMemo(() => (tenue ? casesDuGaulois(tenue) : null), [tenue]);
  useEffect(() => {
    if (cases) peindre(gaulois.current, GAULOIS_LARGEUR, GAULOIS_HAUTEUR, cases);
  }, [cases, finition.id]);
  // À chaque finition regardée, la carte est refaite (`key`) et son mouvement repart.
  useEffect(() => (racine.current ? monterLesCartes(racine.current) : undefined), [finition.id]);
  return (
    <div ref={racine} class="cartes-essai" aria-hidden="true">
      <div class="podium-carte-case">
        <div key={finition.id} class="podium-carte" data-metal="or" data-finition={finition.id} data-reflet={finition.animee ? undefined : ""}>
          <span class="podium-carte-face">
            <canvas class="podium-carte-fx" data-toile="fond" width={LARGEUR_DE_TOILE} height={HAUTEUR_DE_TOILE} />
            <i class="podium-carte-holo" />
            <i class="podium-carte-eclat" />
          </span>
          {cases && (
            <span class="podium-carte-gaulois" style={`--w:${GAULOIS_LARGEUR};--h:${GAULOIS_HAUTEUR};--e:0.78`}>
              <canvas ref={gaulois} width={GAULOIS_LARGEUR} height={GAULOIS_HAUTEUR} />
            </span>
          )}
          <canvas class="podium-carte-fx podium-carte-fx-devant" data-toile="devant" width={LARGEUR_DE_TOILE} height={HAUTEUR_DE_TOILE} />
        </div>
      </div>
    </div>
  );
}

export function SectionDesCartes({ tenue, onSolde, onRefus }: { tenue: Tenue | null; onSolde: (reste: number) => void; onRefus: () => void }) {
  const [etat, setEtat] = useState<Etat>({ kind: "lecture" });
  const [vue, setVue] = useState<IdDeFinition>(CARTES[0]!.id);
  // La fenêtre d'achat : fermée, à confirmer, en envoi, refusée (il ne reste qu'à fermer) ou faite (« est à vous »).
  const [achat, setAchat] = useState<"ferme" | "confirmer" | "envoi" | "refuse" | "fait">("ferme");
  const [refus, setRefus] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const lire = useCallback(async (discret = false): Promise<MesCartes | null> => {
    const mes = lireMesCartes(await call<unknown>("get_mes_cartes").catch(() => null));
    if (mes) setEtat({ kind: "pret", mes });
    else if (!discret) setEtat({ kind: "panne" });
    return mes;
  }, []);
  useEffect(() => {
    void lire().then((mes) => {
      if (mes?.porte) setVue(mes.porte);
    });
  }, [lire]);

  const finition = finitionParId(vue) ?? CARTES[0]!;
  const mes = etat.kind === "pret" ? etat.mes : null;
  const prix = mes?.prix[finition.rarete] ?? null;
  const possedee = mes?.possedees.includes(finition.id) ?? false;
  const montree = mes?.porte === finition.id;

  const regarder = (id: IdDeFinition) => {
    setVue(id);
    setRefus(null);
  };

  const acheter = async () => {
    if (!mes || prix === null) return;
    setAchat("envoi");
    setRefus(null);
    try {
      const reponse = await call<unknown>("acheter_carte", { p_finition: finition.id, p_prix_vu: prix });
      const solde = typeof reponse === "object" && reponse !== null ? (reponse as { solde?: unknown }).solde : null;
      if (typeof solde !== "number" || !Number.isSafeInteger(solde) || solde < 0) {
        setRefus(ILLISIBLE);
        setAchat("refuse");
        return;
      }
      setEtat({ kind: "pret", mes: { ...mes, solde, possedees: [finition.id, ...mes.possedees] } });
      onSolde(solde);
      setAchat("fait");
    } catch (e) {
      const fraiche = e instanceof ServerError ? await lire(true) : null;
      const reste = fraiche && e instanceof ServerError && e.code === "solde_insuffisant" ? manque(fraiche.solde, fraiche.prix[finition.rarete] ?? prix) : 0;
      setRefus(e instanceof ServerError ? (reste > 0 ? `Il vous manque ${stateres(reste)}.` : refusDeCarte(e.code)) : messageOf(e));
      setAchat("refuse");
      onRefus();
    }
  };

  const choisir = async (id: IdDeFinition | null) => {
    if (!mes) return;
    setOccupe(true);
    setRefus(null);
    try {
      const reponse = await call<unknown>("choisir_carte", { p_finition: id });
      const porte = typeof reponse === "object" && reponse !== null ? (reponse as { porte?: unknown }).porte : undefined;
      if (porte !== null && typeof porte !== "string") setRefus(ILLISIBLE);
      else setEtat({ kind: "pret", mes: { ...mes, porte: finitionParId(typeof porte === "string" ? porte : null)?.id ?? null } });
    } catch (e) {
      setRefus(e instanceof ServerError ? refusDeCarte(e.code) : messageOf(e));
    } finally {
      setOccupe(false);
    }
  };

  return (
    <section class="cartes-rayon" aria-labelledby="cartes-titre" data-testid="rayon-cartes">
      <h3 id="cartes-titre" class="text-xl">Les cartes</h3>
      <p class="mt-1 max-w-3xl text-muted">Votre carte paraît en haut de l'accueil quand vous êtes sur le podium de la semaine. Sans choix, elle porte la finition de votre place.</p>
      {etat.kind === "panne" && <Problem message="Le rayon des cartes ne répond pas pour l'instant." onRetry={() => void lire()} />}
      <div class="cartes-corps">
        <div class="cartes-vue">
          <CarteDEssai finition={finition} tenue={tenue} />
          <p class="max-w-56 text-center text-sm text-muted">Les animations s'arrêtent avec le bouton pause du site.</p>
          <p class="cartes-vue-nom" data-testid="carte-vue">
            <strong>{finition.nom}</strong>
            <MarqueDeRarete rarete={finition.rarete} />
          </p>
          {mes && (
            <div class="cartes-gestes">
              {possedee ? (
                <button type="button" class="btn btn-secondary" disabled={occupe} onClick={() => void choisir(montree ? null : finition.id)} data-testid="carte-montrer">
                  {montree ? "Ne plus la montrer" : "Montrer sur ma carte"}
                </button>
              ) : prix !== null && mes.peutAcheter ? (
                <button type="button" class="btn btn-primary" onClick={() => setAchat("confirmer")} data-testid="carte-acheter">
                  Acheter, {stateres(prix)}
                </button>
              ) : (
                <p class="text-sm text-muted">{mes.peutAcheter ? "Cette finition n'a pas de prix pour l'instant." : "Réservé aux membres validés qui ont créé leur Gaulois."}</p>
              )}
              {achat === "ferme" && <Refus message={refus} />}
            </div>
          )}
        </div>
        <ul class="cartes-cases" aria-label="Les finitions">
          {CARTES.map((c) => {
            const aMoi = mes?.possedees.includes(c.id) ?? false;
            const p = mes?.prix[c.rarete] ?? null;
            return (
              <li key={c.id}>
                <button type="button" class="cartes-case" data-rarete={c.rarete} aria-pressed={vue === c.id} onClick={() => regarder(c.id)} data-testid="carte-case">
                  <span class="cartes-case-nom">{c.nom}</span>
                  <MarqueDeRarete rarete={c.rarete} />
                  <span class="cartes-case-etat">{aMoi ? (mes?.porte === c.id ? "Montrée" : "À vous") : p !== null ? <Prix montant={p} /> : c.animee ? "Animée" : "Reflet"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {achat !== "ferme" && mes && prix !== null && (
        <Dialogue titre={`Acheter « ${finition.nom} »`} etape={achat} occupe={achat === "envoi"} onFermer={() => setAchat("ferme")} testid="carte-dialogue">
          {achat === "fait" ? (
            <p class="form-success" role="status" data-testid="carte-faite">
              « {finition.nom} » est à vous.
            </p>
          ) : achat === "refuse" ? (
            <Refus message={refus} />
          ) : (
            <Compte prix={prix} solde={mes.solde} />
          )}
          <div class="mt-4 flex flex-wrap gap-3">
            {(achat === "confirmer" || achat === "envoi") && (
              <button type="button" class="btn btn-primary" disabled={achat === "envoi" || mes.solde < prix} onClick={() => void acheter()} data-testid="carte-confirmer">
                Acheter
              </button>
            )}
            {achat === "fait" && !montree && (
              <button
                type="button"
                class="btn btn-primary"
                onClick={() => {
                  setAchat("ferme");
                  void choisir(finition.id);
                }}
                data-testid="carte-montrer-aussitot"
              >
                Montrer sur ma carte
              </button>
            )}
            <button type="button" class="btn btn-ghost" disabled={achat === "envoi"} onClick={() => setAchat("ferme")}>
              {achat === "confirmer" || achat === "envoi" ? "Annuler" : "Fermer"}
            </button>
          </div>
        </Dialogue>
      )}
    </section>
  );
}
