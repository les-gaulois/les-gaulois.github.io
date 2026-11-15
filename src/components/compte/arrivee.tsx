import { useEffect, useRef, useState } from "preact/hooks";
import type { AccesCarte, AttenteAllie } from "../../lib/alliance/types";
import { basePath, call, getSession } from "../../lib/compte/api";
import { PORTE_ARRIVEE, etapeAFaire, gauloisASavoir, type EtapeArrivee } from "../../lib/compte/arrivee";
import type { Me } from "../../lib/compte/types";
import { EVENEMENT_ENREGISTRE, tenueGardee } from "../../lib/compagnon/tenue";

/**
 * L'inscription d'un compte (`src/lib/compte/arrivee.ts`) : ce qui reste à faire, et la porte qui le dit. Fichier léger,
 * lu par l'en-tête de toutes les pages : ni le vestiaire ni le dessin du Gaulois n'y sont.
 */

export interface Allie {
  tag: string;
  name: string;
  enAttente: boolean;
}

/**
 * Ce que la carte de l'alliance ouvre à ce compte, pour un compte en attente : un joueur allié invité y a sa place.
 * `undefined` le temps de la lecture, `null` pour qui n'est pas un allié invité, ou un compte qui n'est pas en attente.
 */
export function useAllie(me: Me | null): Allie | null | undefined {
  // La réponse ne vaut que pour le compte qui l'a demandée : un autre compte, ou un autre état, attend la sienne.
  const cle = me === null ? null : me.signed_in && me.status === "pending" ? `attente-${me.number ?? ""}` : "autre";
  const [lu, setLu] = useState<{ cle: string; allie: Allie | null } | null>(null);
  useEffect(() => {
    if (cle === null || cle === "autre") return;
    let parti = false;
    const noter = (allie: Allie | null) => {
      if (!parti) setLu({ cle, allie });
    };
    call<{ access: AccesCarte | null; waiting?: AttenteAllie | null }>("get_map_access")
      .then((r) => {
        if (r.access?.kind === "allie") noter({ tag: r.access.tag, name: r.access.name, enAttente: false });
        // Il a ouvert son lien d'invitation : l'encadrement doit encore l'accepter.
        else if (r.waiting) noter({ tag: r.waiting.tag, name: r.waiting.alias, enAttente: true });
        else noter(null);
      })
      // Un serveur d'avant la carte de l'alliance ne connaît pas cette fonction : la page reste comme avant.
      .catch(() => noter(null));
    return () => {
      parti = true;
    };
  }, [cle]);
  if (cle === null) return undefined;
  if (cle === "autre") return null;
  return lu?.cle === cle ? lu.allie : undefined;
}

/**
 * Le compte connecté a-t-il créé son Gaulois ? `cle` : ce qui distingue ce compte à l'écran (un autre compte relit) ;
 * `null` : rien à savoir. `undefined` le temps de la lecture, `null`
 * si le serveur n'a pas répondu. Le Gaulois que le compagnon a déjà lu pour ce compte, dans cet onglet, suffit : sans lui,
 * `get_mon_gaulois` (un Gaulois ne s'efface pas, seul un oui se garde). Le vestiaire annonce un Gaulois tout juste créé
 * (`gal:gaulois-enregistre`) : l'étape est faite aussitôt, sans relire.
 */
export function useGauloisCree(cle: string | null): boolean | null | undefined {
  const [lu, setLu] = useState<{ cle: string; cree: boolean | null } | null>(null);
  // Un Gaulois annoncé par le vestiaire l'emporte sur une lecture partie avant lui et revenue après.
  const annonce = useRef<string | null>(null);
  useEffect(() => {
    if (cle === null) return;
    let parti = false;
    const noter = (cree: boolean | null) => {
      if (!parti) setLu({ cle, cree: annonce.current === cle ? true : cree });
    };
    const cree = () => {
      annonce.current = cle;
      noter(true);
    };
    window.addEventListener(EVENEMENT_ENREGISTRE, cree);
    void (async () => {
      const session = await getSession().catch(() => null);
      const gardee = tenueGardee();
      if (session && gardee && gardee.compte === session.user.id && gardee.tenue !== null) return noter(true);
      try {
        const r = await call<{ tenue?: unknown } | null>("get_mon_gaulois");
        noter(r?.tenue !== null && r?.tenue !== undefined);
      } catch {
        noter(null);
      }
    })();
    return () => {
      parti = true;
      window.removeEventListener(EVENEMENT_ENREGISTRE, cree);
    };
  }, [cle]);
  if (cle === null) return null;
  return lu?.cle === cle ? lu.cree : undefined;
}

/**
 * Ce qui reste à faire de l'inscription de ce compte (`etapeAFaire`), et, pour un compte en attente, s'il est un joueur
 * allié invité (`useAllie`).
 */
export function useArrivee(me: Me | null): { etape: EtapeArrivee | null | undefined; allie: Allie | null | undefined } {
  const allie = useAllie(me);
  const estAllie = allie === undefined ? undefined : allie !== null;
  const gaulois = useGauloisCree(gauloisASavoir(me, estAllie) ? `compte-${me?.number ?? ""}` : null);
  return { etape: etapeAFaire(me, estAllie, gaulois), allie };
}

/**
 * La porte d'un écran que l'inscription ouvre (QG, carte de l'alliance) : ce qui manque, et le bouton vers « Mon compte »,
 * où se finit l'inscription.
 */
export function PorteArrivee({ etape, class: classe = "" }: { etape: Exclude<EtapeArrivee, "connexion">; class?: string }) {
  const texte = PORTE_ARRIVEE[etape];
  return (
    <div class={classe} data-testid="arrivee-porte" data-etape={etape}>
      <p>
        <strong>{texte.manque}</strong>
      </p>
      <a class="btn btn-primary mt-3" href={`${basePath()}/compte`}>
        {texte.bouton}
      </a>
    </div>
  );
}
