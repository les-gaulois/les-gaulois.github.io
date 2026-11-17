import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ServerError, basePath, call } from "../../lib/compte/api";
import { HAUTEUR_DE_TOILE, LARGEUR_DE_TOILE } from "../../lib/fx/finitions-carte";
import { RARETES, TENUE_DE_DEPART, type Tenue } from "../../lib/gaulois";
import type { EtatDeLaBanniere } from "../../lib/village/bannieres";
import { peindreLaVignette } from "../../lib/village/cartes-vignette";
import { CARTES, finitionParId, lireMesCartes, refusDeCarte, type FinitionDuRayon, type IdDeFinition, type MesCartes } from "../../lib/village/cartes";
import { manque, stateres } from "../../lib/village/ecran-boutique";
import { Problem, Success, messageOf } from "../compte/common";
import { BANNIERE_CHOISIE } from "./Bannieres";
import { Compte, Dialogue, Refus, type Issue } from "./BoutiqueDialogue";
import { MarqueDeRarete, Prix } from "./BoutiquePixels";
import { CarteAnimee, RefletDeBloc } from "./CarteAnimee";
import { LivreDesBannieres, type DessinDuLivre } from "./LivreDesBannieres";

/**
 * Le rayon « Cartes » de la boutique (`src/lib/village/cartes.ts`) : les trente-trois finitions de la carte du membre,
 * celle qui paraît en haut de l'accueil quand il est sur le podium de la semaine. Présenté comme le rayon des bannières,
 * à la demande du pilote (17 novembre 2026 : « exactement comme la boutique bannière, le style de livre ») : le même livre
 * (`LivreDesBannieres.tsx`, avec un autre dessin), où la finition touchée s'envole et se dresse en carte, animée, devant
 * la bannière que le membre montre ; à côté, sa fiche, son prix et le bouton d'achat ; au-dessus, le filtre par rareté.
 * Rien n'est caché derrière un prix : toute finition se voit avant l'achat. Le serveur décide de tout (`get_mes_cartes`,
 * `acheter_carte`, `choisir_carte`) ; l'écran ne montre que ce qu'il a reçu, et jamais le solde d'un autre.
 */
type Etat = { kind: "lecture" } | { kind: "panne" } | { kind: "pret"; mes: MesCartes };

const ILLISIBLE = "La réponse du serveur est illisible. Rechargez la page.";
const RARETES_DES_CARTES = ["commun", "peu-commun", "epique", "mystique", "legendaire"] as const;
/** La carte dressée dans le livre : un quart de sa largeur, au milieu, plus haute que large. */
const PLACE_DE_LA_CARTE = { gauche: 0.375, largeur: 0.25, hauteurSurLargeur: HAUTEUR_DE_TOILE / LARGEUR_DE_TOILE };

/** L'image fixe d'une finition, telle que le robot la poste sur Discord à l'achat : la carte sans le Gaulois, sur le fond marine. */
function ImageDeLAnnonce({ finition }: { finition: FinitionDuRayon }) {
  const toile = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (toile.current) peindreLaVignette(toile.current, finition, null);
  }, [finition]);
  return <canvas ref={toile} width={LARGEUR_DE_TOILE} height={HAUTEUR_DE_TOILE} class="pixels cartes-apercu-annonce" aria-hidden="true" />;
}

export function SectionDesCartes({ tenue, onSolde, onRefus }: { tenue: Tenue | null; onSolde: (reste: number) => void; onRefus: () => void }) {
  const [etat, setEtat] = useState<Etat>({ kind: "lecture" });
  const [vue, setVue] = useState<IdDeFinition>(CARTES[0]!.id);
  const [rarete, setRarete] = useState<(typeof RARETES_DES_CARTES)[number] | null>(null);
  // La fenêtre d'achat : fermée, à confirmer, en envoi, refusée (il ne reste qu'à fermer) ou faite (« est à vous »).
  const [achat, setAchat] = useState<"ferme" | "confirmer" | "envoi" | "refuse" | "fait">("ferme");
  const [refus, setRefus] = useState<string | null>(null);
  const [reussite, setReussite] = useState<string | null>(null);
  const [probleme, setProbleme] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const tenueVue = tenue ?? TENUE_DE_DEPART;

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

  // La bannière que le membre montre, pour voir la finition et la bannière ensemble, comme sur l'accueil. De l'habillage :
  // sans bannière, ou si sa lecture échoue, la carte garde son fond marine. Relue quand il en choisit une autre.
  const [banniere, setBanniere] = useState<string | null>(null);
  const [imageDeBanniere, setImageDeBanniere] = useState<HTMLImageElement | null>(null);
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

  const finition = finitionParId(vue) ?? CARTES[0]!;
  const mes = etat.kind === "pret" ? etat.mes : null;
  const prix = mes?.prix[finition.rarete] ?? null;
  const etatDe = (id: string): EtatDeLaBanniere => (mes?.porte === id ? "montree" : mes?.possedees.some((p) => p === id) ? "a-moi" : "a-acheter");
  const etatVu = etatDe(finition.id);
  const montree = mes?.porte ? finitionParId(mes.porte) : null;
  const motDe = (id: string): string => {
    const e = etatDe(id);
    const p = mes?.prix[finitionParId(id)?.rarete ?? "commun"];
    return e === "montree" ? "sur votre carte" : e === "a-moi" ? "à vous" : p ? stateres(p) : "";
  };

  const comptes = useMemo(() => Object.fromEntries(RARETES_DES_CARTES.map((r) => [r, CARTES.filter((c) => c.rarete === r).length])) as Record<(typeof RARETES_DES_CARTES)[number], number>, []);
  const duLivre = useMemo(() => (rarete ? CARTES.filter((c) => c.rarete === rarete) : CARTES), [rarete]);

  // Le dessin du livre : les finitions à la place des bannières. Refait quand la bannière ou la tenue change.
  const dessin = useMemo<DessinDuLivre>(
    () => ({
      genre: "cartes",
      label: "Les finitions",
      image: (id) => {
        const f = finitionParId(id);
        return f ? { largeur: LARGEUR_DE_TOILE, hauteur: HAUTEUR_DE_TOILE, peindre: (toile) => peindreLaVignette(toile, f, imageDeBanniere) } : null;
      },
      decor: (id) => {
        const f = finitionParId(id);
        return f ? <CarteAnimee finition={f} tenue={tenueVue} fond={fond} classe="livre-carte" sonde /> : null;
      },
      parId: finitionParId,
      place: PLACE_DE_LA_CARTE,
    }),
    [imageDeBanniere, tenueVue, fond],
  );

  /**
   * Les aperçus sous le livre, comme ceux du livre des bannières : ce que la finition survolée donne sur la fiche du membre
   * (le premier bloc, devant sa bannière : un reflet seulement) et l'image que le robot poste sur Discord à l'achat.
   */
  const apercus = (id: string | null) => {
    const f = finitionParId(id);
    if (!f) return null;
    return (
      <>
        <figure class="livre-apercu" data-testid="carte-apercu-fiche">
          <figcaption>Sur ma fiche</figcaption>
          <div class="fiche-banniere">
            {adresse ? <img src={adresse} alt="" width="124" height="80" /> : <span class="cartes-apercu-sans-banniere" />}
            <RefletDeBloc finition={f} />
            <span class="fiche-banniere-titre">Ses parties sous le tag</span>
          </div>
          <p class="livre-apercu-note">{f.animee ? "Une animation en pixels reste sur votre carte : le bloc de la fiche ne prend que les reflets." : "À la prochaine mise à jour du site, si votre pseudo est public."}</p>
        </figure>
        <figure class="livre-apercu" data-testid="carte-apercu-annonce">
          <figcaption>Sur Discord, à l'achat</figcaption>
          <ImageDeLAnnonce finition={f} />
          <p class="livre-apercu-note">L'image fixe que le robot poste dans le salon des achats.</p>
        </figure>
      </>
    );
  };

  /** Dans le livre, toucher une finition ne fait que la montrer : rien ne part au serveur. */
  const voirDansLeLivre = (id: string | null): Promise<Issue<string | null>> => {
    const f = finitionParId(id);
    if (f) setVue(f.id);
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
    setProbleme(null);
    setReussite(null);
    try {
      const reponse = await call<unknown>("choisir_carte", { p_finition: id });
      const porte = typeof reponse === "object" && reponse !== null ? (reponse as { porte?: unknown }).porte : undefined;
      if (porte !== null && typeof porte !== "string") setProbleme(ILLISIBLE);
      else {
        const choisie = finitionParId(typeof porte === "string" ? porte : null);
        setEtat({ kind: "pret", mes: { ...mes, porte: choisie?.id ?? null } });
        setReussite(choisie ? `« ${choisie.nom} » est sur votre carte.` : "Votre carte retrouve la finition de votre place.");
      }
    } catch (e) {
      setProbleme(e instanceof ServerError ? refusDeCarte(e.code) : messageOf(e));
    } finally {
      setOccupe(false);
    }
  };

  return (
    <section class="bannieres cartes-rayon" aria-labelledby="cartes-titre" data-testid="rayon-cartes" data-etat={etat.kind}>
      <div class="bannieres-tete">
        <h4 id="cartes-titre" class="sr-only">
          Les cartes
        </h4>
        {mes && (
          <p class="bannieres-compte" data-testid="cartes-compte">
            <strong class="tnum">{mes.possedees.length}</strong> sur {CARTES.length} à vous
          </p>
        )}
      </div>
      <p class="bannieres-porte" data-testid="cartes-porte">
        <span>
          Sur votre carte du podium, en haut de l'accueil : <strong>{montree ? `« ${montree.nom} »` : "la finition de votre place"}</strong>
        </span>
        {montree && (
          <button type="button" class="chip" disabled={occupe} onClick={() => void choisir(null)} data-testid="cartes-place">
            Revenir à la finition de ma place
          </button>
        )}
      </p>
      {etat.kind === "panne" && <Problem message="Le rayon des cartes ne répond pas pour l'instant." onRetry={() => void lire()} />}

      <div class="vestiaire-filtre" role="group" aria-label="Montrer une rareté" data-testid="cartes-raretes">
        <button type="button" class="chip filtre" aria-pressed={rarete === null} onClick={() => setRarete(null)}>
          Tout
          <span class="filtre-nombre tnum">{CARTES.length}</span>
          <span class="sr-only"> finitions</span>
        </button>
        {RARETES_DES_CARTES.map((r) => (
          <button key={r} type="button" class="chip filtre" data-rarete={r} aria-pressed={rarete === r} onClick={() => setRarete(rarete === r ? null : r)}>
            <span class="filtre-rang" aria-hidden="true">
              {Array.from({ length: RARETES[r].rang }, (_, i) => (
                <i key={i} />
              ))}
            </span>
            {RARETES[r].nom}
            <span class="filtre-nombre tnum">{comptes[r]}</span>
            <span class="sr-only"> {comptes[r] > 1 ? "finitions" : "finition"}</span>
          </button>
        ))}
      </div>

      <div class="banniere-vitrine banniere-vitrine-livre" data-rarete={finition.rarete} data-testid="carte-vitrine" data-finition={finition.id} data-etat={etatVu}>
        <div class="banniere-vue">
          <LivreDesBannieres mode="boutique" dessin={dessin} apercus={apercus} miennes={duLivre} montree={finition} tenue={tenueVue} familier={null} choisir={voirDansLeLivre} etatDe={etatDe} motDe={motDe} />
        </div>
        <div class="banniere-fiche">
          <p class="banniere-famille">{finition.animee ? "Animation en pixels" : "Reflet holographique"}</p>
          <h5 class="banniere-nom" data-testid="carte-vue">
            {finition.nom}
          </h5>
          <span class="banniere-rarete" data-rarete={finition.rarete}>
            <MarqueDeRarete rarete={finition.rarete} />
          </span>
          <p class="banniere-description">{finition.description}</p>
          <div class="banniere-actions">
            {!mes ? null : etatVu === "a-acheter" ? (
              <>
                {prix !== null && <Prix montant={prix} class="banniere-prix" />}
                {prix === null || !mes.peutAcheter ? (
                  <p class="pochette-raison" data-testid="carte-raison">
                    {mes.peutAcheter ? "Cette finition n'a pas de prix pour l'instant." : "Réservé aux membres validés qui ont créé leur Gaulois."}
                  </p>
                ) : (
                  <div>
                    <button type="button" class="btn btn-primary" onClick={() => setAchat("confirmer")} data-testid="carte-acheter">
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
                    <button type="button" class="btn btn-primary" disabled={occupe} onClick={() => void choisir(finition.id)} data-testid="carte-montrer">
                      {occupe ? "Enregistrement…" : "Mettre sur ma carte"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          <div class="banniere-avis" data-testid="carte-avis">
            <Success message={reussite} />
            <Problem message={probleme} />
          </div>
        </div>
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
            {achat === "fait" && etatVu !== "montree" && (
              <button
                type="button"
                class="btn btn-primary"
                onClick={() => {
                  setAchat("ferme");
                  void choisir(finition.id);
                }}
                data-testid="carte-montrer-aussitot"
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
