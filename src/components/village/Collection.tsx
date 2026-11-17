import { useEffect, useState } from "preact/hooks";
import type { EMPLACEMENTS_OBJETS } from "../../lib/gaulois";
import { lignesDeLaCollection, partPossedee, totalDeLaCollection, type Compte } from "../../lib/village/collection";
import type { ObjetPossede } from "../../lib/village/contrat";
import { surCombien } from "../../lib/village/ecran-bannieres";
import { useBannieres } from "./Bannieres";

/**
 * Le livre de la collection, dans « Mon Gaulois » (17 novembre 2026, choix du pilote parmi cinq idées) : un pli, comme
 * tous ceux de la page, qui dit ce que le membre possède sur ce qui existe. Une ligne par rayon du vestiaire (elle ouvre
 * ce rayon), puis les familiers, les bannières et les Gaulois uniques (elles mènent là où ils s'obtiennent). La barre ne
 * fait que redire le compte écrit à côté. Les bannières ne se lisent qu'à l'ouverture du pli : leur liste pèse lourd.
 */
export function LivreDeLaCollection({ inventaire, familiers, modeles, onRayon }: { inventaire: readonly ObjetPossede[] | null; familiers: Compte; modeles: Compte; onRayon: (rayon: (typeof EMPLACEMENTS_OBJETS)[number]) => void }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <details class="fold collection-livre" open={ouvert} onToggle={(e) => setOuvert(e.currentTarget.open)} data-testid="collection">
      <summary>Ma collection</summary>
      {ouvert && <Pages inventaire={inventaire} familiers={familiers} modeles={modeles} onRayon={onRayon} />}
    </details>
  );
}

function Pages({ inventaire, familiers, modeles, onRayon }: { inventaire: readonly ObjetPossede[] | null; familiers: Compte; modeles: Compte; onRayon: (rayon: (typeof EMPLACEMENTS_OBJETS)[number]) => void }) {
  const { etat, lire } = useBannieres();
  useEffect(() => {
    void lire();
  }, [lire]);
  const bannieres: Compte = etat.kind === "pret" ? { possedes: etat.mes.bannieres.length, existants: etat.lib.BANNIERES.length } : null;
  const lignes = lignesDeLaCollection({ inventaire, familiers, bannieres, modeles });
  const total = totalDeLaCollection(lignes);
  return (
    <div class="collection-pages">
      {total && (
        <p class="collection-total" data-testid="collection-total">
          En tout : <strong class="tnum">{surCombien(total.possedes, total.existants)}</strong>
        </p>
      )}
      <ul class="collection-lignes">
        {lignes.map((ligne) => {
          const contenu = (
            <>
              <span class="collection-nom">{ligne.nom}</span>
              <span class="collection-compte tnum">{surCombien(ligne.possedes, ligne.existants)}</span>
              <span class="collection-barre" aria-hidden="true">
                <i style={{ width: `${partPossedee(ligne)}%` }} />
              </span>
            </>
          );
          const { rayon } = ligne;
          return (
            <li key={ligne.id} data-complet={ligne.possedes >= ligne.existants ? "" : undefined} data-testid={`collection-${ligne.id}`}>
              {rayon ? (
                <button type="button" class="collection-ligne" onClick={() => onRayon(rayon)}>
                  {contenu}
                </button>
              ) : (
                <a class="collection-ligne" href={`#${ligne.ancre ?? ""}`}>
                  {contenu}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
