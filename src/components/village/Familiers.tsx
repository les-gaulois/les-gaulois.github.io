import { useCallback, useState } from "preact/hooks";
import { ServerError, basePath, call } from "../../lib/compte/api";
import type { Objet, Rarete } from "../../lib/gaulois";
import { ADRESSE_BOUTIQUE } from "../../lib/village/boutique-rayons";
import type { MesFamiliers, PochetteFamiliersReponse } from "../../lib/village/contrat";
import { manque } from "../../lib/village/ecran-boutique";
import { ANCRE_FAMILIERS, apresLaPochette, echelleDuDessin, familierMontre, familiersPossedes, messageDuRefusDesFamiliers, silhouetteDuFamilier, vignetteDuFamilier } from "../../lib/village/ecran-familiers";
import { lireChoixFamilier, lireMesFamiliers, lirePochetteFamiliers, messageDesFamiliers, type Familier } from "../../lib/village/familiers";
import { Problem, messageOf } from "../compte/common";
import type { Issue } from "./BoutiqueDialogue";
import { MarqueDeRarete, Pixels } from "./BoutiquePixels";
import { Case } from "./Cases";

/**
 * Les familiers du Gaulois à l'écran (15 novembre 2026) : ce que partagent « La boutique » (la pochette des familiers et
 * la ménagerie, `PochetteFamiliers.tsx`) et « Mon Gaulois » (le choix du familier montré, ici). Le serveur décide de tout
 * par `get_mes_familiers`, `ouvrir_pochette_familiers` et `choisir_familier` ; l'écran ne montre que ce qu'il a reçu.
 */

/** Les familiers du compte : en lecture, en panne (le reste de la page marche quand même), ou lus. */
export type EtatDesFamiliers = { kind: "lecture" } | { kind: "panne" } | { kind: "pret"; mes: MesFamiliers };

const ILLISIBLE = "La réponse du serveur est illisible. Rechargez la page.";

/**
 * Les familiers du compte connecté et ce qu'il peut en faire. `lire` ne lève jamais : une panne se range dans l'état
 * (`discret` : une relecture, qui garde ce qui est à l'écran). `ouvrir` et `choisir` rendent le résultat du serveur ou les
 * mots de son refus ; après un refus de la pochette, les familiers se relisent, pour dire ce qui manque d'après le serveur.
 */
export function useFamiliers() {
  const [etat, setEtat] = useState<EtatDesFamiliers>({ kind: "lecture" });

  const lire = useCallback(async (discret = false): Promise<MesFamiliers | null> => {
    const mes = await call<unknown>("get_mes_familiers").then(lireMesFamiliers, () => null);
    if (mes) setEtat({ kind: "pret", mes });
    else if (!discret) setEtat({ kind: "panne" });
    return mes;
  }, []);

  const ouvrir = useCallback(
    async (prix: number): Promise<Issue<PochetteFamiliersReponse>> => {
      try {
        // Le prix affiché dans la fenêtre : s'il a changé entre-temps, le serveur refuse (`prix_change`) sans rien débiter.
        const tirage = lirePochetteFamiliers(await call<unknown>("ouvrir_pochette_familiers", { p_prix_vu: prix }));
        if (!tirage) return { ok: false, message: ILLISIBLE };
        setEtat((e) => (e.kind === "pret" ? { kind: "pret", mes: apresLaPochette(e.mes, tirage, new Date().toISOString()) } : e));
        return { ok: true, valeur: tirage };
      } catch (e) {
        const code = e instanceof ServerError ? e.code : "network";
        const fraiche = await lire(true);
        return { ok: false, message: messageDuRefusDesFamiliers(code, { manque: fraiche ? manque(fraiche.solde, fraiche.pochette.prix) : null }) };
      }
    },
    [lire],
  );

  const choisir = useCallback(async (id: string | null): Promise<Issue<string | null>> => {
    try {
      const choix = lireChoixFamilier(await call<unknown>("choisir_familier", { p_familier: id }));
      if (!choix) return { ok: false, message: ILLISIBLE };
      setEtat((e) => (e.kind === "pret" ? { kind: "pret", mes: { ...e.mes, porte: choix.porte } } : e));
      return { ok: true, valeur: choix.porte };
    } catch (e) {
      return { ok: false, message: e instanceof ServerError ? messageDesFamiliers(e.code) : messageOf(e) };
    }
  }, []);

  const mes = etat.kind === "pret" ? etat.mes : null;
  return { etat, mes, montre: familierMontre(mes), lire, ouvrir, choisir };
}

/**
 * Le dessin d'un familier, décoratif : son nom est toujours écrit à côté. Rogné à son cadre et agrandi d'un nombre entier
 * de fois dans `place` pixels. `silhouette` : un familier que le compte n'a pas, sa forme seule.
 */
export function DessinFamilier({ familier, place, maximum, silhouette = false, class: classe = "" }: { familier: Familier; place: number; maximum: number; silhouette?: boolean; class?: string }) {
  const dessin = silhouette ? silhouetteDuFamilier(familier) : vignetteDuFamilier(familier);
  if (!dessin) return null;
  return <Pixels largeur={dessin.largeur} hauteur={dessin.hauteur} cases={dessin.cases} echelle={echelleDuDessin(dessin, place, maximum)} class={`familier-dessin ${classe}`} />;
}

/** La rareté d'un familier hors d'une case : écrite et comptée en losanges, dans la couleur de la rareté. */
export function RareteDuFamilier({ rarete }: { rarete: Rarete }) {
  return (
    <span class="familier-rarete" data-rarete={rarete}>
      <MarqueDeRarete rarete={rarete} />
    </span>
  );
}

/** Une case du choix : la même que celles du vestiaire. Un familier n'a ni calque ni prix. */
const ficheDe = (nom: string, rarete: Rarete | null): Objet => ({ nom, dessin: null, couleurs: {}, rarete, gratuit: rarete === null });
const AUCUN = ficheDe("Aucun", null);

/**
 * « Mon familier », dans « Mon Gaulois » : le familier montré à côté du Gaulois, à choisir parmi ceux qu'on a, ou aucun.
 * Le choix part tout de suite au serveur (`choisir_familier`) : il ne passe pas par l'enregistrement de la tenue. Sans
 * familier, une ligne mène à la pochette des familiers de « La boutique ». En panne, le vestiaire reste.
 */
export function MonFamilier({ etat, occupe, probleme, annonce, onChoisir, onRelire }: { etat: EtatDesFamiliers; occupe: boolean; probleme: string | null; annonce: string | null; onChoisir: (id: string | null) => void; onRelire: () => void }) {
  const [ouvert, setOuvert] = useState(true);
  if (etat.kind === "lecture") return null;
  if (etat.kind === "panne") {
    return (
      <div data-testid="familier-panne">
        <Problem message="Vos familiers ne répondent pas pour l'instant." onRetry={onRelire} />
      </div>
    );
  }
  const possedes = familiersPossedes(etat.mes);
  if (possedes.length === 0) {
    return (
      <p class="familier-invite" data-testid="familier-invite">
        Pour un familier à côté de votre Gaulois : <a href={`${basePath()}${ADRESSE_BOUTIQUE}#${ANCRE_FAMILIERS}`}>la pochette des familiers</a>.
      </p>
    );
  }
  const montre = familierMontre(etat.mes);
  const choisir = (id: string | null) => {
    if (!occupe && id !== (montre?.id ?? null)) onChoisir(id);
  };
  return (
    <details class="fold familier-choix" open={ouvert} onToggle={(e) => setOuvert(e.currentTarget.open)} data-testid="familier-choix">
      <summary>
        <span id="familier-choix-titre">Mon familier</span> <span class="info-discrete">{montre ? montre.nom : "aucun"}</span>
      </summary>
      <div class="cases" role="group" aria-labelledby="familier-choix-titre" aria-busy={occupe}>
        <Case objet={AUCUN} vignette={null} portee={montre === null} onClick={() => choisir(null)} />
        {possedes.map((familier) => (
          <Case key={familier.id} objet={ficheDe(familier.nom, familier.rarete)} vignette={vignetteDuFamilier(familier)} portee={montre?.id === familier.id} onClick={() => choisir(familier.id)} />
        ))}
      </div>
      <Problem message={probleme} />
      <p class="sr-only" role="status" data-testid="familier-annonce">
        {annonce}
      </p>
    </details>
  );
}
