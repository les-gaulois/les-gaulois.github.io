import { useCallback, useState } from "preact/hooks";
import { ServerError, basePath, call } from "../../lib/compte/api";
import { modeleDuGaulois, type Objet, type Rarete, type Tenue, type Vignette } from "../../lib/gaulois";
import { adresseDansLaBoutique } from "../../lib/village/boutique-rayons";
import type { AchatModeleReponse, MesModeles, PochetteModelesReponse } from "../../lib/village/contrat";
import { manque } from "../../lib/village/ecran-boutique";
import { modelesPossedes } from "../../lib/village/ecran-modeles";
import { ANCRE_MODELES, apresLAchat, apresLaPochette, apresLaTenue, lireAchatModele, lireMesModeles, lirePochetteModeles, messageDuRefusDesModeles, tenueAvecModele } from "../../lib/village/modeles";
import { Problem } from "../compte/common";
import type { Issue } from "./BoutiqueDialogue";
import { cleDuModele } from "../../lib/village/fonds-objets";
import { Case } from "./Cases";

/**
 * Les Gaulois uniques à l'écran (15 novembre 2026) : ce que partagent « La boutique » (la pochette des Gaulois uniques et
 * la vitrine, `SectionModeles.tsx`) et « Mon Gaulois » (le choix du corps, ici). Le serveur décide de tout par
 * `get_mes_modeles`, `acheter_modele` et `ouvrir_pochette_modeles` ; le modèle porté est une clé de la tenue, enregistrée
 * comme le reste (`enregistrer_mon_gaulois`). L'écran ne montre que ce qu'il a reçu.
 */

/** Les Gaulois uniques du compte : en lecture, en panne (le reste de la page marche quand même), ou lus. */
export type EtatDesModeles = { kind: "lecture" } | { kind: "panne" } | { kind: "pret"; mes: MesModeles };

const ILLISIBLE = "La réponse du serveur est illisible. Rechargez la page.";

/**
 * Les Gaulois uniques du compte connecté et ce qu'il peut en faire. `lire` ne lève jamais : une panne se range dans l'état
 * (`discret` : une relecture, qui garde ce qui est à l'écran). `acheter` et `ouvrir` rendent le résultat du serveur ou les
 * mots de son refus ; après un refus, les modèles se relisent, pour dire ce qui manque d'après le serveur. `noterLaTenue` :
 * une tenue vient d'être enregistrée, le modèle porté est celui qu'elle porte.
 */
export function useModeles() {
  const [etat, setEtat] = useState<EtatDesModeles>({ kind: "lecture" });

  const lire = useCallback(async (discret = false): Promise<MesModeles | null> => {
    const mes = await call<unknown>("get_mes_modeles").then(lireMesModeles, () => null);
    if (mes) setEtat({ kind: "pret", mes });
    else if (!discret) setEtat({ kind: "panne" });
    return mes;
  }, []);

  /** Après un refus : les mots du serveur, et ce qui manque d'après le solde qu'il vient de relire. */
  const refuser = useCallback(
    async (e: unknown, prixDe: (fraiche: MesModeles) => number | null): Promise<Issue<never>> => {
      const code = e instanceof ServerError ? e.code : "network";
      const fraiche = await lire(true);
      const prix = fraiche ? prixDe(fraiche) : null;
      return { ok: false, message: messageDuRefusDesModeles(code, { manque: fraiche && prix !== null ? manque(fraiche.solde, prix) : null }) };
    },
    [lire],
  );

  const acheter = useCallback(
    async (id: string, rarete: Rarete, prix: number): Promise<Issue<AchatModeleReponse>> => {
      try {
        // Le prix affiché dans la fenêtre : s'il a changé entre-temps, le serveur refuse (`prix_change`) sans rien débiter.
        const achat = lireAchatModele(await call<unknown>("acheter_modele", { p_modele: id, p_prix_vu: prix }));
        if (!achat) return { ok: false, message: ILLISIBLE };
        setEtat((e) => (e.kind === "pret" ? { kind: "pret", mes: apresLAchat(e.mes, achat, new Date().toISOString()) } : e));
        return { ok: true, valeur: achat };
      } catch (e) {
        return refuser(e, (fraiche) => fraiche.prix[rarete]);
      }
    },
    [refuser],
  );

  const ouvrir = useCallback(
    async (prix: number): Promise<Issue<PochetteModelesReponse>> => {
      try {
        const tirage = lirePochetteModeles(await call<unknown>("ouvrir_pochette_modeles", { p_prix_vu: prix }));
        if (!tirage) return { ok: false, message: ILLISIBLE };
        setEtat((e) => (e.kind === "pret" ? { kind: "pret", mes: apresLaPochette(e.mes, tirage, new Date().toISOString()) } : e));
        return { ok: true, valeur: tirage };
      } catch (e) {
        return refuser(e, (fraiche) => fraiche.pochette.prix);
      }
    },
    [refuser],
  );

  const noterLaTenue = useCallback((tenue: Tenue) => setEtat((e) => (e.kind === "pret" ? { kind: "pret", mes: apresLaTenue(e.mes, tenue) } : e)), []);

  const mes = etat.kind === "pret" ? etat.mes : null;
  return { etat, mes, lire, acheter, ouvrir, noterLaTenue };
}

/** Une case du choix : la même que celles du vestiaire. Un corps n'a ni calque ni prix. */
const ficheDe = (nom: string, rarete: Rarete | null): Objet => ({ nom, dessin: null, couleurs: {}, rarete, gratuit: rarete === null });
const HUMAIN = ficheDe("Humain", null);

/**
 * « Corps », en tête du rayon du corps de « Mon Gaulois » : l'humain, ou un des Gaulois uniques du compte. Le choix change
 * la tenue en cours, comme une coupe de cheveux : il s'enregistre avec elle, et le serveur vérifie que le compte a le
 * modèle. Sans modèle, une ligne mène aux Gaulois uniques de « La boutique ». En panne, le vestiaire reste. `vignette` :
 * le visage du Gaulois du membre avec ce corps (`null` : l'humain).
 */
export function MonCorps({ etat, tenue, vignette, onChange, onRelire }: { etat: EtatDesModeles; tenue: Tenue; vignette: (id: string | null) => Vignette; onChange: (tenue: Tenue) => void; onRelire: () => void }) {
  if (etat.kind === "lecture") return null;
  const porte = modeleDuGaulois(tenue);
  const possedes = etat.kind === "pret" ? modelesPossedes(etat.mes) : [];
  // Un modèle porté reste à l'écran même si la liste ne répond pas : on peut toujours revenir à l'humain.
  const choix = porte && !possedes.some((modele) => modele.id === porte.id) ? [porte, ...possedes] : possedes;
  return (
    <div class="vestiaire-emplacement uniques-corps" data-testid="vestiaire-corps">
      <p id="vestiaire-corps" class="nom-champ vestiaire-titre">
        Corps
      </p>
      {choix.length > 0 && (
        <div class="cases co-grille" role="group" aria-labelledby="vestiaire-corps">
          <Case objet={HUMAIN} vignette={vignette(null)} portee={porte === null} onClick={() => onChange(tenueAvecModele(tenue, null))} />
          {choix.map((modele) => (
            <Case key={modele.id} objet={ficheDe(modele.nom, modele.rarete)} vignette={vignette(modele.id)} fond={cleDuModele(modele.id)} pose="bas" portee={porte?.id === modele.id} onClick={() => onChange(tenueAvecModele(tenue, modele.id))} />
          ))}
        </div>
      )}
      {etat.kind === "panne" ? (
        <div data-testid="corps-panne">
          <Problem message="Vos Gaulois uniques ne répondent pas pour l'instant." onRetry={onRelire} />
        </div>
      ) : (
        choix.length === 0 && (
          <p class="familier-invite" data-testid="corps-invite">
            Pour un corps de créature : <a href={`${basePath()}${adresseDansLaBoutique(ANCRE_MODELES)}`}>les Gaulois uniques</a>.
          </p>
        )
      )}
    </div>
  );
}
