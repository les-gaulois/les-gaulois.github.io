/**
 * Les zones que l'alliance doit prendre, dessinées pixel par pixel par l'encadrement de GAL. Chacune se compte sur la vraie
 * carte, au dernier relevé : ce que l'alliance en tient déjà, la terre neutre qui reste et les pixels des autres clans,
 * avec le coût en troupes selon les règles du jeu (`src/lib/clanmap/economy.ts`).
 */
import { useEffect, useMemo, useState } from "preact/hooks";
import { bilanZone, type BilanZone } from "../../../lib/alliance/bilan";
import { CADRE_MAX, encoderBits, masqueDeLaZone, type Masque } from "../../../lib/alliance/masque";
import type { ZoneLigne } from "../../../lib/alliance/types";
import { ENEMY_PIXEL_BASE_TROOPS, NEUTRAL_PIXEL_TROOPS, RULES_CHECKED_ON } from "../../../lib/clanmap/economy";
import { call } from "../../../lib/compte/api";
import { fmtDate, fmtDateTime, fmtInt, fmtPct } from "../../../lib/format";
import type { EcranAlliance, EtatDessin, Outil } from "../../../scripts/alliance-ecran";
import { DeleteButton, Problem, messageOf } from "../../compte/common";
import { nomDuClan, type Contexte } from "./commun";

const TAILLES = [1, 3, 5, 9, 15, 25] as const;
const OUTILS: { id: Outil; label: string }[] = [
  { id: "main", label: "Déplacer" },
  { id: "crayon", label: "Crayon" },
  { id: "gomme", label: "Gomme" },
  { id: "rectangle", label: "Rectangle" },
];

function Reste({ bilan }: { bilan: BilanZone }) {
  const autres = bilan.autres.slice(0, 4).map((a) => `${nomDuClan(a.tag)} ${fmtInt(a.pixels)}`);
  const plus = bilan.autres.length > 4 ? `, et ${bilan.autres.length - 4} autres clans` : "";
  return (
    <ul class="alliance-reste tnum">
      <li>Déjà à l'alliance : {fmtInt(bilan.alliance)} pixels.</li>
      <li>Terre neutre : {fmtInt(bilan.neutres)} pixels, soit {fmtInt(bilan.coutNeutres)} troupes.</li>
      {bilan.ennemis > 0 && (
        <li>
          Aux autres clans : {fmtInt(bilan.ennemis)} pixels ({autres.join(", ")}
          {plus}), soit au moins {fmtInt(bilan.coutEnnemisMinimum)} troupes.
        </li>
      )}
      {bilan.mer > 0 && <li>En mer, qui ne se prend pas : {fmtInt(bilan.mer)} pixels.</li>}
    </ul>
  );
}

function Abandon({ busy, onConfirm }: { busy: boolean; onConfirm: () => void }) {
  const [arme, setArme] = useState(false);
  return (
    <button
      type="button"
      class="btn btn-ghost !min-h-10 !py-1.5 !text-sm"
      disabled={busy}
      onBlur={() => setArme(false)}
      onClick={() => {
        if (arme) onConfirm();
        else setArme(true);
      }}
    >
      {arme ? "Confirmer : jeter le dessin" : "Abandonner le dessin"}
    </button>
  );
}

function Barre({ part }: { part: number }) {
  return (
    <span class="alliance-barre" aria-hidden="true">
      <i style={{ width: `${Math.round(part * 1000) / 10}%` }}></i>
    </span>
  );
}

interface Edition {
  id: number | null;
  titre: string;
  tag: string;
}

export default function AllianceZones({
  ctx,
  ecran,
  selection,
  choisir,
  edition,
  setEdition,
}: {
  ctx: Contexte;
  ecran: EcranAlliance;
  selection: number | null;
  choisir: (id: number | null, viser: boolean) => void;
  edition: Edition | null;
  setEdition: (e: Edition | null) => void;
}) {
  const { donnees, film, etat, notres } = ctx;
  const zones = donnees.zones ?? [];
  const clansNotres = [...notres].sort();
  // GAL est toujours des nôtres dans un bilan, même avant d'être rangé dans une alliance : ses pixels ne sont jamais à prendre.
  const pourBilan = useMemo(() => new Set([...notres, "GAL"]), [notres]);
  const sansAlliance = (donnees.ours ?? null) === null;
  const [outil, setOutil] = useState<Outil>("crayon");
  const [taille, setTaille] = useState(3);
  const [dessin, setDessin] = useState<EtatDessin>({ pixels: 0, cadre: null, tropGrand: false, annulable: false });
  const [apercu, setApercu] = useState<BilanZone | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const bilans = useMemo(() => {
    const out = new Map<number, BilanZone>();
    if (!etat) return out;
    for (const z of zones) {
      const m = masqueDeLaZone(z);
      if (m) out.set(z.id, bilanZone(m, etat.valeurs, etat.width, film.clans, pourBilan));
    }
    return out;
  }, [zones, etat, film, pourBilan]);

  // Le dessin en cours se compte à chaque geste fini.
  useEffect(() => {
    ecran.onDessin = (e) => {
      setDessin(e);
      const m = e.pixels > 0 ? ecran.masqueEdite() : null;
      setApercu(m && etat ? bilanZone(m, etat.valeurs, etat.width, film.clans, pourBilan) : null);
    };
  }, [ecran, etat, film, pourBilan]);

  useEffect(() => {
    if (edition) ecran.choisirOutil(outil, taille);
  }, [ecran, edition, outil, taille]);

  const commencer = (zone: ZoneLigne | null) => {
    setErreur(null);
    const masque: Masque | null = zone ? masqueDeLaZone(zone) : null;
    setEdition({ id: zone?.id ?? null, titre: zone?.title ?? "", tag: zone?.tag ?? "" });
    choisir(zone?.id ?? null, zone !== null);
    ecran.editer(masque);
    setOutil(zone ? "main" : "crayon");
  };

  const abandonner = () => {
    ecran.finirEdition();
    setEdition(null);
    setApercu(null);
    setErreur(null);
  };

  const enregistrer = async () => {
    if (!edition) return;
    const m = ecran.masqueEdite();
    if (!m) {
      setErreur("La zone est vide : dessinez au moins un pixel de terre.");
      return;
    }
    if (m.w * m.h > CADRE_MAX) {
      setErreur("La zone est trop étendue : son cadre dépasse un million de pixels. Coupez-la en plusieurs zones.");
      return;
    }
    setBusy(true);
    setErreur(null);
    try {
      const r = await call<{ id: number }>("save_alliance_zone", {
        p_id: edition.id,
        p_title: edition.titre,
        p_tag: edition.tag || null,
        p_x: m.x,
        p_y: m.y,
        p_w: m.w,
        p_h: m.h,
        p_mask: encoderBits(m.bits),
      });
      ecran.finirEdition();
      setEdition(null);
      setApercu(null);
      await ctx.relire();
      choisir(r.id, false);
    } catch (e) {
      setErreur(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const supprimer = async (id: number) => {
    setBusy(true);
    setErreur(null);
    try {
      await call("delete_alliance_zone", { p_id: id });
      if (selection === id) choisir(null, false);
      await ctx.relire();
    } catch (e) {
      setErreur(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  if (edition) {
    return (
      <section aria-labelledby="zone-edition-titre" data-testid="zone-edition">
        <h3 id="zone-edition-titre">{edition.id === null ? "Nouvelle zone" : "Modifier la zone"}</h3>
        <form
          class="mt-3 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void enregistrer();
          }}
        >
          <div>
            <label for="zone-titre" class="text-sm font-semibold">
              Nom de la zone
            </label>
            <input id="zone-titre" class="field mt-1" required minLength={2} maxLength={40} value={edition.titre} onInput={(e) => setEdition({ ...edition, titre: e.currentTarget.value })} />
          </div>
          <div>
            <label for="zone-clan" class="text-sm font-semibold">
              Qui la prend
            </label>
            <select id="zone-clan" class="field mt-1" value={edition.tag} onChange={(e) => setEdition({ ...edition, tag: e.currentTarget.value })}>
              <option value="">Toute l'alliance</option>
              {clansNotres.map((tag) => (
                <option value={tag}>{tag}</option>
              ))}
            </select>
          </div>
          <fieldset class="alliance-outils-dessin">
            <legend class="text-sm font-semibold">Outil sur la carte</legend>
            {OUTILS.map((o) => (
              <label>
                <input type="radio" name="zone-outil" value={o.id} checked={outil === o.id} onChange={() => setOutil(o.id)} />
                {o.label}
              </label>
            ))}
          </fieldset>
          <div>
            <label for="zone-taille" class="text-sm font-semibold">
              Taille du crayon et de la gomme
            </label>
            <select id="zone-taille" class="field mt-1" value={String(taille)} onChange={(e) => setTaille(Number(e.currentTarget.value))}>
              {TAILLES.map((t) => (
                <option value={String(t)}>{t === 1 ? "1 pixel" : `${t} × ${t} pixels`}</option>
              ))}
            </select>
          </div>
          <p class="carte-aide">
            La mer ne se dessine pas.
          </p>
          <div class="alliance-ligne">
            <button type="button" class="btn btn-ghost" disabled={!dessin.annulable} onClick={() => ecran.annulerGeste()}>
              Annuler le dernier geste
            </button>
            <button type="button" class="btn btn-ghost" disabled={dessin.pixels === 0} onClick={() => ecran.effacerTout()}>
              Tout effacer
            </button>
          </div>
          <div class="carte-bloc" aria-live="polite" data-testid="zone-compte">
            <p class="font-semibold tnum">{fmtInt(dessin.pixels)} pixels dessinés.</p>
            {dessin.tropGrand && <p class="form-problem">Le cadre de la zone dépasse un million de pixels : coupez-la en plusieurs zones.</p>}
            {apercu && <Reste bilan={apercu} />}
          </div>
          <div>
            <button type="submit" class="btn btn-primary" disabled={busy || dessin.pixels === 0 || dessin.tropGrand || edition.titre.trim().length < 2}>
              Enregistrer la zone
            </button>
          </div>
          <Problem message={erreur} />
          {/* Abandonner perd le dessin : à part, sous un filet, et en deux temps. */}
          <div class="alliance-a-part">
            <Abandon busy={busy} onConfirm={abandonner} />
          </div>
        </form>
      </section>
    );
  }

  return (
    <div data-testid="alliance-zones">
      {!etat && <p class="form-problem">La carte pixel par pixel n'est pas publiée pour ce relevé : les zones ne se comptent ni ne se dessinent. Elle revient à la prochaine mise à jour de la carte.</p>}
      {ctx.staff && etat && sansAlliance && <p class="carte-aide">Rangez d'abord GAL dans une alliance, dans Gestion.</p>}
      {ctx.staff && etat && !sansAlliance && (
        <button type="button" class="btn btn-primary" onClick={() => commencer(null)} data-testid="zone-nouvelle">
          Dessiner une nouvelle zone
        </button>
      )}
      {zones.length > 0 && (
        <ul class="carte-liste">
          {zones.map((z) => {
            const bilan = bilans.get(z.id) ?? null;
            return (
              <li key={z.id} class="alliance-zone" data-choisie={selection === z.id ? "" : undefined} data-testid="zone">
                <button type="button" class="film-tile" aria-current={selection === z.id ? "true" : undefined} onClick={() => choisir(selection === z.id ? null : z.id, selection !== z.id)}>
                  <span class="font-semibold">{z.title}</span>
                  <span class="carte-date">{z.tag ?? "Toute l'alliance"}</span>
                </button>
                <p class="tnum carte-petit">
                  {fmtInt(z.pixels)} pixels
                  {bilan && <> · prise à {fmtPct(bilan.part * 100)}</>}
                </p>
                {bilan && <Barre part={bilan.part} />}
                {selection === z.id && bilan && <Reste bilan={bilan} />}
                {selection === z.id && <p class="carte-aide">Dessinée ou modifiée le {fmtDateTime(z.updated_at)}.</p>}
                {selection === z.id && ctx.staff && etat && (
                  <div class="alliance-ligne mt-2">
                    <button type="button" class="btn btn-ghost" onClick={() => commencer(z)}>
                      Modifier
                    </button>
                    <span class="alliance-a-part">
                      <DeleteButton busy={busy} label={z.title} onConfirm={() => void supprimer(z.id)} />
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Problem message={erreur} />
      {zones.length > 0 && etat && (
        <p class="carte-aide tnum">
          Au relevé du {fmtDateTime(film.fetchedAt)}. {fmtInt(NEUTRAL_PIXEL_TROOPS)} troupes par pixel neutre, au moins {fmtInt(ENEMY_PIXEL_BASE_TROOPS)} par pixel d'un autre clan, selon les règles du jeu lues le {fmtDate(`${RULES_CHECKED_ON}T12:00:00Z`)}.
        </p>
      )}
    </div>
  );
}
