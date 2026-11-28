import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
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
import { Compte, Dialogue, Refus } from "./BoutiqueDialogue";
import { Prix } from "./BoutiquePixels";
import { IconeDeRarete } from "./IconeDeRarete";
import { CarteAnimee } from "./CarteAnimee";
import { DefileDeCartes, bruitDuJeu, piedDuDefile, type CarteDuDefile } from "./DefileDeCartes";
import { CarteDeCosmetique } from "./CarteDeCosmetique";

/**
 * Le rayon « Cadres » de la boutique (`src/lib/village/cadres.ts`) : les vingt-six cadres animés de la carte du membre.
 * Présenté comme le rayon des cartes et celui des bannières (demande du pilote, 17 novembre 2026) : depuis le 22 novembre
 * 2026, à sa demande, en grandes cartes qui défilent (`DefileDeCartes.tsx`, à la place du livre) ; la carte du milieu montre
 * le cadre autour de la vraie carte du membre, animé, avec sa bannière, sa finition et son familier ; sous la bande, sa
 * description et le bouton d'achat ; au-dessus, le filtre par rareté. Tout cadre se voit avant l'achat. Le serveur décide de tout (`get_mes_cadres`,
 * `acheter_cadre`, `choisir_cadre`) ; l'écran ne montre que ce qu'il a reçu, et jamais le solde d'un autre.
 */
type Etat = { kind: "lecture" } | { kind: "panne" } | { kind: "pret"; mes: MesCadres };

const ILLISIBLE = "La réponse du serveur est illisible. Rechargez la page.";
const RARETES_DES_CADRES = ["commun", "peu-commun", "epique", "mystique", "legendaire"] as const;

/** L'image fixe d'un cadre autour de la carte du membre : les cartes voisines du défilé. */
function VignetteDuCadre({ cadre, banniere }: { cadre: IdDeCadre; banniere: HTMLImageElement | null }) {
  const toile = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (toile.current) peindreLaVignetteDuCadre(toile.current, cadre, banniere);
  }, [cadre, banniere]);
  return <canvas ref={toile} width={LARGEUR_DU_CADRE} height={HAUTEUR_DU_CADRE} class="pixels dc-cadre-fixe" />;
}

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

  const comptes = useMemo(() => Object.fromEntries(RARETES_DES_CADRES.map((r) => [r, CADRES.filter((c) => c.rarete === r).length])) as Record<(typeof RARETES_DES_CADRES)[number], number>, []);
  const duDefile = useMemo(() => (rarete ? CADRES.filter((c) => c.rarete === rarete) : CADRES), [rarete]);
  /** Ce que dit chaque carte du défilé : son prix tant qu'elle n'est pas au compte, sinon « À vous », et « Sur ma carte ». */
  const cartesDuDefile = duDefile.map((c): CarteDuDefile => {
    const e = etatDe(c.id);
    return { id: c.id, nom: c.nom, rarete: c.rarete, prix: e === "a-acheter" ? (mes?.prix[c.rarete] ?? null) : null, mot: e === "a-acheter" ? null : "À vous", marque: e === "montree" ? "Sur ma carte" : null };
  });

  /**
   * La carte d'un cadre dans le défilé : la carte des cosmétiques que le cadre couvre toute (« La carte la porte », choix du
   * pilote, 28 novembre 2026).
   */
  const carteDuDefile = (c: CarteDuDefile) => (cadreParId(c.id) ? <CarteDeCosmetique nom={c.nom} rarete={c.rarete} cle={`cadre/${c.id}`} dessin={null} effets={null} type="Cadre de la carte" imagePleine image={<VignetteDuCadre cadre={c.id as IdDeCadre} banniere={imageDeBanniere} />} pied={piedDuDefile(c)} /> : null);

  /** Un autre cadre au milieu du défilé : rien ne part au serveur, la fiche dessous le décrit. */
  const voir = (id: string): void => {
    const c = cadreParId(id);
    if (c) setVue(c.id);
    setRefus(null);
    setReussite(null);
    setProbleme(null);
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
      bruitDuJeu("piece");
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
        if (choisi) {
          bruitDuJeu("enfile");
          bruitDuJeu("enfile2", 0.09);
        }
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

      <div class="banniere-vitrine dc-vitrine" data-rarete={cadre.rarete} data-testid="cadre-vitrine" data-cadre={cadre.id} data-etat={etatVu}>
        <DefileDeCartes cartes={cartesDuDefile} choisie={cadre.id} onChoisir={voir} forme="cadre" label="Les cadres" carte={carteDuDefile} testid="cadres-defile">
          <div class="dc-fiche">
            <p class="banniere-famille">Cadre animé</p>
            <h5 class="banniere-nom" data-testid="cadre-vu">
              {cadre.nom}
            </h5>
            <p class="banniere-description">{cadre.description}</p>
            {/* La vraie carte du membre dans ce cadre, animée. */}
            <figure class="dc-sur-ma-carte" data-testid="cadre-sur-ma-carte">
              <figcaption>Sur ma carte</figcaption>
              <CarteAnimee finition={finition} cadre={cadre.id} tenue={tenueVue} fond={fond} classe="dc-membre dc-membre-cadre" sonde familier={familier} />
            </figure>
            <div class="dc-actions">
              {!mes ? null : etatVu === "a-acheter" ? (
                prix === null || !mes.peutAcheter ? (
                  <p class="pochette-raison" data-testid="cadre-raison">
                    {mes.peutAcheter ? "Ce cadre n'a pas de prix pour l'instant." : "Réservé aux membres validés qui ont créé leur Gaulois."}
                  </p>
                ) : (
                  <button type="button" class="btn btn-primary" onClick={() => setAchat("confirmer")} data-testid="cadre-acheter">
                    Acheter <Prix montant={prix} class="dc-prix-bouton" />
                  </button>
                )
              ) : etatVu === "a-moi" ? (
                <button type="button" class="btn btn-primary" disabled={occupe} onClick={() => void choisir(cadre.id)} data-testid="cadre-montrer">
                  {occupe ? "Enregistrement…" : "Mettre sur ma carte"}
                </button>
              ) : (
                <span class="banniere-etat" data-etat={etatVu}>
                  Sur votre carte
                </span>
              )}
            </div>
            <div class="banniere-avis" data-testid="cadre-avis">
              <Success message={reussite} />
              <Problem message={probleme} />
            </div>
          </div>
        </DefileDeCartes>
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
