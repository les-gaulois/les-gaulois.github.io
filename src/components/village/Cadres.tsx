import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { ServerError, basePath, call } from "../../lib/compte/api";
import { HAUTEUR_DU_CADRE, LARGEUR_DU_CADRE } from "../../lib/fx/cadres-carte";
import { RARETES, TENUE_DE_DEPART, type Tenue } from "../../lib/gaulois";
import type { EtatDeLaBanniere } from "../../lib/village/bannieres";
import { peindreLaVignetteDuCadre } from "../../lib/village/cadres-vignette";
import { CADRES, cadreParId, lireMesCadres, refusDeCadre, type IdDeCadre, type MesCadres } from "../../lib/village/cadres";
import { finitionParId, lireMesCartes, type FinitionDuRayon } from "../../lib/village/cartes";
import { manque, stateres } from "../../lib/village/ecran-boutique";
import type { Familier } from "../../lib/village/familiers";
import { Problem, Success, messageOf } from "../compte/common";
import { BANNIERE_CHOISIE } from "./Bannieres";
import { Compte, Dialogue, Refus, type Issue } from "./BoutiqueDialogue";
import { MarqueDeRarete, Prix } from "./BoutiquePixels";
import { IconeDeRarete } from "./IconeDeRarete";
import { CarteAnimee } from "./CarteAnimee";
import { LivreDesBannieres, type DessinDuLivre } from "./LivreDesBannieres";

/**
 * Le rayon « Cadres » de la boutique (`src/lib/village/cadres.ts`) : les vingt-six cadres animés de la carte du membre.
 * Présenté comme le rayon des cartes et celui des bannières (demande du pilote, 17 novembre 2026 : « exactement comme la
 * boutique bannière, le style de livre ») : le même livre, où le cadre touché s'envole et se dresse autour de la carte du
 * membre, animé, avec sa bannière, sa finition et son familier ; à côté, sa fiche, son prix et le bouton d'achat ;
 * au-dessus, le filtre par rareté. Tout cadre se voit avant l'achat. Le serveur décide de tout (`get_mes_cadres`,
 * `acheter_cadre`, `choisir_cadre`) ; l'écran ne montre que ce qu'il a reçu, et jamais le solde d'un autre.
 */
type Etat = { kind: "lecture" } | { kind: "panne" } | { kind: "pret"; mes: MesCadres };

const ILLISIBLE = "La réponse du serveur est illisible. Rechargez la page.";
const RARETES_DES_CADRES = ["commun", "peu-commun", "epique", "mystique", "legendaire"] as const;
/** La carte dressée dans le livre, avec la marge de son cadre : un tiers de sa largeur, au milieu. */
const PLACE_DU_CADRE = { gauche: 0.335, largeur: 0.33, hauteurSurLargeur: HAUTEUR_DU_CADRE / LARGEUR_DU_CADRE };

export function SectionDesCadres({ tenue, familier = null, onSolde, onRefus }: { tenue: Tenue | null; familier?: Familier | null; onSolde: (reste: number) => void; onRefus: () => void }) {
  const [etat, setEtat] = useState<Etat>({ kind: "lecture" });
  const [vue, setVue] = useState<IdDeCadre>(CADRES[0]!.id);
  const [rarete, setRarete] = useState<(typeof RARETES_DES_CADRES)[number] | null>(null);
  // La fenêtre d'achat : fermée, à confirmer, en envoi, refusée (il ne reste qu'à fermer) ou faite (« est à vous »).
  const [achat, setAchat] = useState<"ferme" | "confirmer" | "envoi" | "refuse" | "fait">("ferme");
  const [refus, setRefus] = useState<string | null>(null);
  const [reussite, setReussite] = useState<string | null>(null);
  const [probleme, setProbleme] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const tenueVue = tenue ?? TENUE_DE_DEPART;

  const lire = useCallback(async (discret = false): Promise<MesCadres | null> => {
    const mes = lireMesCadres(await call<unknown>("get_mes_cadres").catch(() => null));
    if (mes) setEtat({ kind: "pret", mes });
    else if (!discret) setEtat({ kind: "panne" });
    return mes;
  }, []);
  useEffect(() => {
    void lire().then((mes) => {
      if (mes?.porte) setVue(mes.porte);
    });
  }, [lire]);

  // La bannière et la finition que le membre montre, pour voir le cadre sur sa vraie carte. De l'habillage : si leur
  // lecture échoue, la carte garde son fond marine et le reflet offert.
  const [banniere, setBanniere] = useState<string | null>(null);
  const [imageDeBanniere, setImageDeBanniere] = useState<HTMLImageElement | null>(null);
  const [finition, setFinition] = useState<FinitionDuRayon | null>(null);
  useEffect(() => {
    const lireLaBanniere = () =>
      void call<unknown>("get_mes_bannieres").then(
        (reponse) => {
          const porte = typeof reponse === "object" && reponse !== null ? (reponse as { porte?: unknown }).porte : null;
          setBanniere(typeof porte === "string" && /^[a-z]+(-[a-z]+)*$/.test(porte) ? porte : null);
        },
        () => setBanniere(null),
      );
    lireLaBanniere();
    void call<unknown>("get_mes_cartes").then(
      (reponse) => setFinition(finitionParId(lireMesCartes(reponse)?.porte)),
      () => setFinition(null),
    );
    window.addEventListener(BANNIERE_CHOISIE, lireLaBanniere);
    return () => window.removeEventListener(BANNIERE_CHOISIE, lireLaBanniere);
  }, []);
  const adresse = banniere ? `${basePath()}/bannieres/${banniere}.png` : null;
  useEffect(() => {
    setImageDeBanniere(null);
    if (!adresse) return;
    const image = new Image();
    image.onload = () => setImageDeBanniere(image);
    image.src = adresse;
    return () => {
      image.onload = null;
    };
  }, [adresse]);
  const fond = adresse ? `--banniere:url("${adresse}")` : undefined;

  const cadre = cadreParId(vue) ?? CADRES[0]!;
  const mes = etat.kind === "pret" ? etat.mes : null;
  const prix = mes?.prix[cadre.rarete] ?? null;
  const etatDe = (id: string): EtatDeLaBanniere => (mes?.porte === id ? "montree" : mes?.possedes.some((p) => p === id) ? "a-moi" : "a-acheter");
  const etatVu = etatDe(cadre.id);
  const montre = mes?.porte ? cadreParId(mes.porte) : null;
  const motDe = (id: string): string => {
    const e = etatDe(id);
    const p = mes?.prix[cadreParId(id)?.rarete ?? "commun"];
    return e === "montree" ? "sur votre carte" : e === "a-moi" ? "à vous" : p ? stateres(p) : "";
  };

  const comptes = useMemo(() => Object.fromEntries(RARETES_DES_CADRES.map((r) => [r, CADRES.filter((c) => c.rarete === r).length])) as Record<(typeof RARETES_DES_CADRES)[number], number>, []);
  const duLivre = useMemo(() => (rarete ? CADRES.filter((c) => c.rarete === rarete) : CADRES), [rarete]);

  // Le dessin du livre : les cadres à la place des bannières. Refait quand la bannière, la tenue ou la finition change.
  const dessin = useMemo<DessinDuLivre>(
    () => ({
      genre: "cadres",
      label: "Les cadres",
      image: (id) => {
        const c = cadreParId(id);
        return c ? { largeur: LARGEUR_DU_CADRE, hauteur: HAUTEUR_DU_CADRE, peindre: (toile) => peindreLaVignetteDuCadre(toile, c.id, imageDeBanniere) } : null;
      },
      decor: (id) => {
        const c = cadreParId(id);
        return c ? <CarteAnimee finition={finition} cadre={c.id} tenue={tenueVue} fond={fond} classe="livre-carte livre-carte-cadree" sonde familier={familier} /> : null;
      },
      parId: cadreParId,
      place: PLACE_DU_CADRE,
    }),
    [imageDeBanniere, tenueVue, fond, familier, finition],
  );

  /** Dans le livre, toucher un cadre ne fait que le montrer : rien ne part au serveur. */
  const voirDansLeLivre = (id: string | null): Promise<Issue<string | null>> => {
    const c = cadreParId(id);
    if (c) setVue(c.id);
    setRefus(null);
    setReussite(null);
    setProbleme(null);
    return Promise.resolve({ ok: true, valeur: id });
  };

  const acheter = async () => {
    if (!mes || prix === null) return;
    setAchat("envoi");
    setRefus(null);
    try {
      const reponse = await call<unknown>("acheter_cadre", { p_cadre: cadre.id, p_prix_vu: prix });
      const solde = typeof reponse === "object" && reponse !== null ? (reponse as { solde?: unknown }).solde : null;
      if (typeof solde !== "number" || !Number.isSafeInteger(solde) || solde < 0) {
        setRefus(ILLISIBLE);
        setAchat("refuse");
        return;
      }
      setEtat({ kind: "pret", mes: { ...mes, solde, possedes: [cadre.id, ...mes.possedes] } });
      onSolde(solde);
      setAchat("fait");
    } catch (e) {
      const frais = e instanceof ServerError ? await lire(true) : null;
      const reste = frais && e instanceof ServerError && e.code === "solde_insuffisant" ? manque(frais.solde, frais.prix[cadre.rarete] ?? prix) : 0;
      setRefus(e instanceof ServerError ? (reste > 0 ? `Il vous manque ${stateres(reste)}.` : refusDeCadre(e.code)) : messageOf(e));
      setAchat("refuse");
      onRefus();
    }
  };

  const choisir = async (id: IdDeCadre | null) => {
    if (!mes) return;
    setOccupe(true);
    setProbleme(null);
    setReussite(null);
    try {
      const reponse = await call<unknown>("choisir_cadre", { p_cadre: id });
      const porte = typeof reponse === "object" && reponse !== null ? (reponse as { porte?: unknown }).porte : undefined;
      if (porte !== null && typeof porte !== "string") setProbleme(ILLISIBLE);
      else {
        const choisi = cadreParId(typeof porte === "string" ? porte : null);
        setEtat({ kind: "pret", mes: { ...mes, porte: choisi?.id ?? null } });
        setReussite(choisi ? `« ${choisi.nom} » entoure votre carte.` : "Votre carte n'a plus de cadre.");
      }
    } catch (e) {
      setProbleme(e instanceof ServerError ? refusDeCadre(e.code) : messageOf(e));
    } finally {
      setOccupe(false);
    }
  };

  return (
    <section class="bannieres cartes-rayon cadres-rayon" aria-labelledby="cadres-titre" data-testid="rayon-cadres" data-etat={etat.kind}>
      <div class="bannieres-tete">
        <h4 id="cadres-titre" class="sr-only">
          Les cadres
        </h4>
        {mes && (
          <p class="bannieres-compte" data-testid="cadres-compte">
            <strong class="tnum">{mes.possedes.length}</strong> sur {CADRES.length} à vous
          </p>
        )}
      </div>
      <p class="bannieres-porte" data-testid="cadres-porte">
        <span>
          Autour de votre carte, sur votre fiche : <strong>{montre ? `« ${montre.nom} »` : "pas de cadre"}</strong>
        </span>
        {montre && (
          <button type="button" class="chip" disabled={occupe} onClick={() => void choisir(null)} data-testid="cadres-retirer">
            Retirer le cadre
          </button>
        )}
      </p>
      {etat.kind === "panne" && <Problem message="Le rayon des cadres ne répond pas pour l'instant." onRetry={() => void lire()} />}

      <div class="vestiaire-filtre" role="group" aria-label="Montrer une rareté" data-testid="cadres-raretes">
        <button type="button" class="chip filtre" aria-pressed={rarete === null} onClick={() => setRarete(null)}>
          Tout
          <span class="filtre-nombre tnum">{CADRES.length}</span>
          <span class="sr-only"> cadres</span>
        </button>
        {RARETES_DES_CADRES.map((r) => (
          <button key={r} type="button" class="chip filtre" data-rarete={r} aria-pressed={rarete === r} onClick={() => setRarete(rarete === r ? null : r)}>
            <span class="filtre-rang" aria-hidden="true">
              <IconeDeRarete rarete={r} />
            </span>
            {RARETES[r].nom}
            <span class="filtre-nombre tnum">{comptes[r]}</span>
            <span class="sr-only"> {comptes[r] > 1 ? "cadres" : "cadre"}</span>
          </button>
        ))}
      </div>

      <div class="banniere-vitrine banniere-vitrine-livre" data-rarete={cadre.rarete} data-testid="cadre-vitrine" data-cadre={cadre.id} data-etat={etatVu}>
        <div class="banniere-vue">
          <LivreDesBannieres mode="boutique" dessin={dessin} miennes={duLivre} montree={cadre} tenue={tenueVue} familier={null} choisir={voirDansLeLivre} etatDe={etatDe} motDe={motDe} />
        </div>
        <div class="banniere-fiche">
          <p class="banniere-famille">Cadre animé</p>
          <h5 class="banniere-nom" data-testid="cadre-vu">
            {cadre.nom}
          </h5>
          <span class="banniere-rarete" data-rarete={cadre.rarete}>
            <MarqueDeRarete rarete={cadre.rarete} />
          </span>
          <p class="banniere-description">{cadre.description}</p>
          <div class="banniere-actions">
            {!mes ? null : etatVu === "a-acheter" ? (
              <>
                {prix !== null && <Prix montant={prix} class="banniere-prix" />}
                {prix === null || !mes.peutAcheter ? (
                  <p class="pochette-raison" data-testid="cadre-raison">
                    {mes.peutAcheter ? "Ce cadre n'a pas de prix pour l'instant." : "Réservé aux membres validés qui ont créé leur Gaulois."}
                  </p>
                ) : (
                  <div>
                    <button type="button" class="btn btn-primary" onClick={() => setAchat("confirmer")} data-testid="cadre-acheter">
                      Acheter
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <span class="banniere-etat" data-etat={etatVu}>
                  {etatVu === "montree" ? "Sur votre carte" : "À vous"}
                </span>
                {etatVu === "a-moi" && (
                  <div>
                    <button type="button" class="btn btn-primary" disabled={occupe} onClick={() => void choisir(cadre.id)} data-testid="cadre-montrer">
                      {occupe ? "Enregistrement…" : "Mettre sur ma carte"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          <div class="banniere-avis" data-testid="cadre-avis">
            <Success message={reussite} />
            <Problem message={probleme} />
          </div>
        </div>
      </div>

      {achat !== "ferme" && mes && prix !== null && (
        <Dialogue titre={`Acheter « ${cadre.nom} »`} etape={achat} occupe={achat === "envoi"} onFermer={() => setAchat("ferme")} testid="cadre-dialogue">
          {achat === "fait" ? (
            <p class="form-success" role="status" data-testid="cadre-fait">
              « {cadre.nom} » est à vous.
            </p>
          ) : achat === "refuse" ? (
            <Refus message={refus} />
          ) : (
            <Compte prix={prix} solde={mes.solde} />
          )}
          <div class="mt-4 flex flex-wrap gap-3">
            {(achat === "confirmer" || achat === "envoi") && (
              <button type="button" class="btn btn-primary" disabled={achat === "envoi" || mes.solde < prix} onClick={() => void acheter()} data-testid="cadre-confirmer">
                Acheter
              </button>
            )}
            {achat === "fait" && etatVu !== "montree" && (
              <button
                type="button"
                class="btn btn-primary"
                onClick={() => {
                  setAchat("ferme");
                  void choisir(cadre.id);
                }}
                data-testid="cadre-montrer-aussitot"
              >
                Mettre sur ma carte
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
