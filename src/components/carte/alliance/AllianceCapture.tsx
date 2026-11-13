/**
 * L'onglet « Capture » de la fenêtre « Alliance » (13 novembre 2026, demande du pilote) : une image de la carte telle que
 * le joueur l'a cadrée, avec le logo de GAL en haut, la légende des couleurs et, au choix, les zones numérotées et leurs
 * chiffres, à copier, télécharger ou partager pour l'envoyer sur Discord. Pour tous ceux qui ont la fenêtre : Gaulois
 * validés et joueurs alliés acceptés.
 *
 * L'image se fabrique dans ce navigateur (`src/scripts/alliance-capture.ts`) avec ce que la fenêtre montre déjà : rien
 * n'est demandé au serveur, rien n'y est envoyé.
 */
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { clan } from "../../../../config/clan";
import { troupesDeLAlliance } from "../../../lib/alliance/bilan";
import { CAPTURE, TEXTES_CAPTURE, contenuDeLaCapture, legendeDeCapture, nomDeFichier, vueDeCapture } from "../../../lib/alliance/capture";
import { basePath } from "../../../lib/compte/api";
import { dessinerCapture } from "../../../scripts/alliance-capture";
import type { EcranAlliance, ZoneAffichee } from "../../../scripts/alliance-ecran";
import { useTextes, type Contexte, type EntreeLegende, type ModeCouleurs } from "./commun";

type Prise = { status: "vide" } | { status: "encours" } | { status: "erreur" } | { status: "prete"; blob: Blob; url: string; alt: string; nom: string };

export default function AllianceCapture({
  ctx,
  ecran,
  legende,
  mode,
  zones,
  demande,
}: {
  ctx: Contexte;
  ecran: EcranAlliance;
  /** La légende de la carte, dans l'ordre de la fenêtre. */
  legende: readonly EntreeLegende[];
  mode: ModeCouleurs;
  zones: readonly ZoneAffichee[];
  /** Change à chaque clic sur « Capture » posé sur la carte : la capture se prend aussitôt. */
  demande: number;
}) {
  const t = useTextes();
  const tc = TEXTES_CAPTURE[t.langue];
  const [avecZones, setAvecZones] = useState(true);
  const [prise, setPrise] = useState<Prise>({ status: "vide" });
  const [message, setMessage] = useState<string | null>(null);
  const resultat = useRef<HTMLDivElement>(null);
  const url = useRef<string | null>(null);
  // Le numéro de la dernière capture demandée : une capture plus ancienne qui finit après elle ne la remplace pas.
  const numero = useRef(0);

  // L'adresse de l'image d'avant se libère à chaque nouvelle capture, et en quittant la page.
  const poser = (p: Prise) => {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = p.status === "prete" ? p.url : null;
    setPrise(p);
  };
  useEffect(() => () => void (url.current && URL.revokeObjectURL(url.current)), []);

  const prendre = useCallback(
    async (zonesAussi: boolean, focaliser: boolean) => {
      const source = ecran.sourceDeCapture();
      if (!source) {
        poser({ status: "erreur" });
        return;
      }
      const ce = ++numero.current;
      setMessage(null);
      setPrise({ status: "encours" });
      try {
        const sortie = { width: CAPTURE.carte.w, height: CAPTURE.carte.h };
        const vue = vueDeCapture(source.cadre, sortie, source.monde);
        const notre = ctx.totaux.find((a) => a.id === (ctx.donnees.ours ?? null)) ?? null;
        const maintenant = new Date();
        const contenu = contenuDeLaCapture({
          langue: t.langue,
          nombre: t.nombre,
          pct: t.pct,
          vue,
          monde: source.monde,
          releve: ctx.film.fetchedAt,
          maintenant,
          notreAlliance: notre?.name ?? null,
          legende: legendeDeCapture({
            legende,
            mode,
            couleursClans: ctx.couleursClans,
            totaux: ctx.totaux,
            standings: ctx.film.standings,
            avecZones: zonesAussi,
            touteLAlliance: t.touteLAlliance,
            pixels: (n) => tc.pixels(t.nombre(n)),
          }),
          troupes: notre ? troupesDeLAlliance(notre.clans.map((c) => c.tag), ctx.donnees.troops ?? []) : null,
          zones: zonesAussi ? zones.map((z) => ({ id: z.id, title: z.title, tag: ctx.donnees.zones?.find((l) => l.id === z.id)?.tag ?? null, masque: z.masque, couleur: z.couleur })) : null,
          bilans: ctx.bilans,
          adresse: `${new URL(clan.links.site).host}${basePath()}/carte`,
        });
        const blob = await dessinerCapture(ecran, contenu, `${basePath()}/generated/logo-horizontal-160.webp`);
        if (ce !== numero.current) return;
        poser({ status: "prete", blob, url: URL.createObjectURL(blob), alt: contenu.alt, nom: nomDeFichier(maintenant) });
        // Prise par un bouton (celui de la carte ou de l'onglet) : le résultat vient sous les yeux, et sous le clavier.
        if (focaliser) requestAnimationFrame(() => resultat.current?.focus());
      } catch {
        if (ce === numero.current) poser({ status: "erreur" });
      }
    },
    [ecran, ctx, t, tc, legende, mode, zones],
  );

  // Le bouton « Capture » de la carte : la fenêtre passe sur cet onglet, et la capture se prend.
  const vu = useRef(demande);
  useEffect(() => {
    if (demande === vu.current) return;
    vu.current = demande;
    void prendre(avecZones, true);
  }, [demande, prendre, avecZones]);

  const copier = async (blob: Blob) => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setMessage(tc.copiee);
    } catch {
      setMessage(tc.copieRefusee);
    }
  };

  const partager = async (blob: Blob, nom: string) => {
    try {
      await navigator.share({ files: [new File([blob], nom, { type: blob.type })] });
    } catch {
      // Partage annulé par le joueur : rien à dire.
    }
  };

  const peutCopier = typeof ClipboardItem === "function" && typeof navigator.clipboard?.write === "function";
  const peutPartager = (blob: Blob, nom: string) => {
    try {
      return typeof navigator.share === "function" && navigator.canShare?.({ files: [new File([blob], nom, { type: blob.type })] }) === true;
    } catch {
      return false;
    }
  };

  return (
    <div data-testid="alliance-capture">
      <p class="carte-aide">{tc.aide}</p>
      <label class="mt-2 flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          class="size-5 shrink-0"
          checked={avecZones}
          onChange={(e) => {
            const on = e.currentTarget.checked;
            setAvecZones(on);
            // Une capture déjà prise suit le choix.
            if (prise.status === "prete") void prendre(on, false);
          }}
        />
        {tc.avecZones}
      </label>
      <div class="mt-3">
        {/* Pas « disabled » pendant la prise : le clavier resterait sur un bouton inerte, puis retomberait en haut de la page. */}
        <button
          type="button"
          class="btn btn-primary"
          aria-disabled={prise.status === "encours" ? "true" : undefined}
          onClick={() => {
            if (prise.status !== "encours") void prendre(avecZones, true);
          }}
          data-testid="capture-prendre"
        >
          {prise.status === "prete" ? tc.reprendre : tc.prendre}
        </button>
      </div>
      <p class="sr-only" role="status">
        {prise.status === "encours" ? tc.enCours : prise.status === "prete" ? tc.prete : ""}
      </p>
      {prise.status === "encours" && (
        <p class="text-muted mt-3" aria-hidden="true">
          {tc.enCours}
        </p>
      )}
      {prise.status === "erreur" && (
        <p class="form-problem mt-3" role="alert">
          {tc.echec}
        </p>
      )}
      {prise.status === "prete" && (
        <div class="alliance-capture-resultat" ref={resultat} tabIndex={-1} data-testid="capture-resultat">
          <img class="alliance-capture-apercu" src={prise.url} alt={prise.alt} width={CAPTURE.largeur} height={CAPTURE.hauteur} data-testid="capture-image" />
          <div class="alliance-ligne mt-3">
            {peutCopier && (
              <button type="button" class="btn btn-primary" onClick={() => void copier(prise.blob)} data-testid="capture-copier">
                {tc.copier}
              </button>
            )}
            <a href={prise.url} download={prise.nom} class={`btn ${peutCopier ? "btn-ghost" : "btn-primary"}`} data-testid="capture-telecharger">
              {tc.telecharger}
            </a>
            {peutPartager(prise.blob, prise.nom) && (
              <button type="button" class="btn btn-ghost" onClick={() => void partager(prise.blob, prise.nom)}>
                {tc.partager}
              </button>
            )}
          </div>
          <p class="carte-petit mt-2" role="status" data-testid="capture-message">
            {message ?? ""}
          </p>
        </div>
      )}
    </div>
  );
}
