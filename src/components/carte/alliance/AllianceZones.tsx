/**
 * Les zones que l'alliance doit prendre, dessinées pixel par pixel par l'encadrement de GAL, chacune dans la couleur du clan
 * qui la prend. Chacune se compte sur la vraie carte, au dernier relevé : ce que l'alliance en tient déjà, la terre neutre
 * qui reste et les pixels des autres clans, avec les troupes à prévoir selon les règles du jeu
 * (`src/lib/clanmap/economy.ts`).
 *
 * Le dessin (13 novembre 2026, « que les outils soient mieux compris ») : quatre gros boutons illustrés, une phrase pour
 * l'outil choisi, quatre tailles en mots, et le dessin en cours dans la couleur du clan choisi.
 */
import { useEffect, useState } from "preact/hooks";
import { bilanZone, type BilanZone } from "../../../lib/alliance/bilan";
import { couleurDeZone } from "../../../lib/alliance/couleurs";
import { CADRE_MAX, encoderBits, masqueDeLaZone, type Masque } from "../../../lib/alliance/masque";
import type { ZoneLigne } from "../../../lib/alliance/types";
import { ENEMY_PIXEL_BASE_TROOPS, NEUTRAL_PIXEL_TROOPS, RULES_CHECKED_ON } from "../../../lib/clanmap/economy";
import type { IconePartieNom } from "../../../lib/icones-parties";
import { call } from "../../../lib/compte/api";
import type { EcranAlliance, EtatDessin, Outil } from "../../../scripts/alliance-ecran";
import IconePartie from "../../compte/IconePartie";
import { Problem, messageIn } from "../../compte/common";
import { Barre, Pastille, TableauZone, useTextes, type Contexte } from "./commun";

/** Les tailles du pinceau et de la gomme, en pixels de côté, de « Fin » à « Très gros ». */
const TAILLES = [1, 5, 13, 25] as const;
const OUTILS: { id: Outil; icone: IconePartieNom }[] = [
  { id: "main", icone: "fleches" },
  { id: "crayon", icone: "pinceau" },
  { id: "rectangle", icone: "cadre" },
  { id: "gomme", icone: "gomme" },
];

/** Un clic de trop perd le dessin : le bouton demande une confirmation, et se désarme quand on le quitte. */
function EnDeuxTemps({ busy, texte, confirmer, aria, ariaConfirmer, onConfirm }: { busy: boolean; texte: string; confirmer: string; aria?: string; ariaConfirmer?: string; onConfirm: () => void }) {
  const [arme, setArme] = useState(false);
  return (
    <button
      type="button"
      class="btn btn-ghost !min-h-10 !py-1.5 !text-sm"
      disabled={busy}
      aria-label={arme ? ariaConfirmer : aria}
      onBlur={() => setArme(false)}
      onClick={() => {
        if (arme) onConfirm();
        else setArme(true);
      }}
    >
      {arme ? confirmer : texte}
    </button>
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
  const t = useTextes();
  const { donnees, film, etat, notres, bilans, couleursClans } = ctx;
  const zones = donnees.zones ?? [];
  const clansNotres = [...notres].sort((a, b) => (a === "GAL" ? -1 : b === "GAL" ? 1 : a.localeCompare(b)));
  const sansAlliance = (donnees.ours ?? null) === null;
  const [outil, setOutil] = useState<Outil>("crayon");
  const [taille, setTaille] = useState<number>(TAILLES[1]);
  const [dessin, setDessin] = useState<EtatDessin>({ pixels: 0, cadre: null, tropGrand: false, annulable: false });
  const [apercu, setApercu] = useState<BilanZone | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const couleurEdition = couleurDeZone(edition?.tag ? edition.tag : null, couleursClans);

  // Le dessin en cours se compte à chaque geste fini. GAL est toujours des nôtres dans un bilan.
  useEffect(() => {
    const pourBilan = new Set([...notres, "GAL"]);
    ecran.onDessin = (e) => {
      setDessin(e);
      const m = e.pixels > 0 ? ecran.masqueEdite() : null;
      setApercu(m && etat ? bilanZone(m, etat.valeurs, etat.width, film.clans, pourBilan) : null);
    };
  }, [ecran, etat, film, notres]);

  useEffect(() => {
    if (edition) ecran.choisirOutil(outil, taille);
  }, [ecran, edition, outil, taille]);

  // Le dessin prend la couleur du clan choisi, dès qu'on le change.
  useEffect(() => {
    if (edition) ecran.colorerDessin(couleurEdition);
  }, [ecran, edition, couleurEdition]);

  const commencer = (zone: ZoneLigne | null) => {
    setErreur(null);
    const masque: Masque | null = zone ? masqueDeLaZone(zone) : null;
    setEdition({ id: zone?.id ?? null, titre: zone?.title ?? "", tag: zone?.tag ?? "" });
    choisir(zone?.id ?? null, zone !== null);
    ecran.editer(masque, couleurDeZone(zone?.tag ?? null, couleursClans));
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
      setErreur(t.zoneVide);
      return;
    }
    if (m.w * m.h > CADRE_MAX) {
      setErreur(t.tropGrand);
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
      setErreur(messageIn(e, t.langue));
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
      setErreur(messageIn(e, t.langue));
    } finally {
      setBusy(false);
    }
  };

  if (edition) {
    const tailleVisible = outil === "crayon" || outil === "gomme";
    return (
      <section aria-labelledby="zone-edition-titre" data-testid="zone-edition">
        <h3 id="zone-edition-titre">{edition.id === null ? t.titreNouvelleZone : t.titreModifierZone}</h3>
        <form
          class="mt-3 grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void enregistrer();
          }}
        >
          <div class="alliance-deux">
            <div>
              <label for="zone-titre" class="text-sm font-semibold">
                {t.nomZone}
              </label>
              <input id="zone-titre" class="field mt-1" required minLength={2} maxLength={40} value={edition.titre} onInput={(e) => setEdition({ ...edition, titre: e.currentTarget.value })} />
            </div>
            <div>
              <label for="zone-clan" class="text-sm font-semibold">
                {t.pourQui}
              </label>
              <div class="alliance-choix-clan mt-1">
                <Pastille couleur={couleurEdition} />
                <select id="zone-clan" class="field" value={edition.tag} onChange={(e) => setEdition({ ...edition, tag: e.currentTarget.value })}>
                  <option value="">{t.touteLAlliance}</option>
                  {clansNotres.map((tag) => (
                    <option value={tag}>{tag}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <fieldset class="alliance-outils-dessin">
            <legend class="text-sm font-semibold">{t.outil}</legend>
            <div class="alliance-boutons-outils">
              {OUTILS.map((o) => (
                <label class="alliance-bouton-outil" data-outil={o.id}>
                  <input type="radio" name="zone-outil" value={o.id} checked={outil === o.id} onChange={() => setOutil(o.id)} />
                  <IconePartie nom={o.icone} classe="alliance-icone-outil" />
                  <span>{t.outils[o.id]}</span>
                </label>
              ))}
            </div>
            <p class="alliance-astuce" aria-live="polite" data-testid="zone-astuce">
              {t.aideOutil[outil]}
            </p>
          </fieldset>

          {tailleVisible && (
            <fieldset class="alliance-outils-dessin">
              <legend class="text-sm font-semibold">{t.taille}</legend>
              <div class="alliance-tailles">
                {TAILLES.map((n, i) => (
                  <label class="alliance-bouton-taille">
                    <input type="radio" name="zone-taille" value={String(n)} checked={taille === n} onChange={() => setTaille(n)} />
                    <i aria-hidden="true" style={{ width: `${0.375 + i * 0.25}rem`, height: `${0.375 + i * 0.25}rem` }}></i>
                    <span>{t.tailles[i]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div class="alliance-ligne">
            <button type="button" class="btn btn-ghost !min-h-10 !py-1.5 !text-sm" disabled={!dessin.annulable} onClick={() => ecran.annulerGeste()} aria-keyshortcuts="Control+Z">
              <span aria-hidden="true">↶</span> {t.annulerGeste}
            </button>
            <button type="button" class="btn btn-ghost !min-h-10 !py-1.5 !text-sm" disabled={dessin.pixels === 0} onClick={() => ecran.effacerTout()}>
              {t.toutEffacer}
            </button>
          </div>

          <div class="alliance-compte" aria-live="polite" data-testid="zone-compte">
            <p>
              <span class="alliance-kpi tnum">{t.nombre(dessin.pixels)}</span>
              <span class="text-muted">{t.pixelsDessines}</span>
            </p>
            {dessin.tropGrand && <p class="form-problem">{t.tropGrand}</p>}
            {apercu && <TableauZone bilan={apercu} t={t} />}
          </div>

          <div>
            <button type="submit" class="btn btn-primary" disabled={busy || dessin.pixels === 0 || dessin.tropGrand || edition.titre.trim().length < 2}>
              {t.enregistrer}
            </button>
          </div>
          <Problem message={erreur} />
          {/* Abandonner perd le dessin : à part, sous un filet, et en deux temps. */}
          <div class="alliance-a-part">
            <EnDeuxTemps busy={busy} texte={t.abandonner} confirmer={t.abandonnerConfirmer} onConfirm={abandonner} />
          </div>
        </form>
      </section>
    );
  }

  return (
    <div data-testid="alliance-zones">
      {!etat && <p class="form-problem">{t.sansEtatZones}</p>}
      {ctx.staff && etat && sansAlliance && <p class="carte-aide">{t.rangerGal}</p>}
      {ctx.staff && etat && !sansAlliance && (
        <button type="button" class="btn btn-primary" onClick={() => commencer(null)} data-testid="zone-nouvelle">
          <span aria-hidden="true">+</span> {t.nouvelleZone}
        </button>
      )}
      {zones.length > 0 && (
        <ul class="alliance-zones">
          {zones.map((z) => {
            const bilan = bilans.get(z.id) ?? null;
            const couleur = couleurDeZone(z.tag, couleursClans);
            const choisie = selection === z.id;
            return (
              <li key={z.id} class="alliance-zone" data-choisie={choisie ? "" : undefined} data-testid="zone">
                <button type="button" class="alliance-zone-tete" aria-expanded={choisie} onClick={() => choisir(choisie ? null : z.id, !choisie)}>
                  <span class="alliance-zone-nom">
                    <Pastille couleur={couleur} />
                    <span>
                      <strong>{z.title}</strong>
                      <span class="alliance-zone-clan">{z.tag ?? t.touteLAlliance}</span>
                    </span>
                  </span>
                  {bilan && (
                    <span class="alliance-zone-part tnum">
                      {t.pct(bilan.part)} <span class="alliance-zone-prise">{t.prise}</span>
                    </span>
                  )}
                </button>
                {bilan && <Barre part={bilan.part} couleur={couleur} />}
                {choisie && (
                  <div class="alliance-zone-detail">
                    {bilan && <TableauZone bilan={bilan} t={t} />}
                    <p class="carte-aide">{t.misAJour(t.dateHeure(z.updated_at))}</p>
                    {ctx.staff && etat && (
                      <div class="alliance-ligne mt-2">
                        <button type="button" class="btn btn-ghost !min-h-10 !py-1.5 !text-sm" onClick={() => commencer(z)}>
                          {t.modifier}
                        </button>
                        <span class="alliance-a-part">
                          <EnDeuxTemps busy={busy} texte={t.supprimer} confirmer={t.confirmerSuppression} aria={t.supprimerAria(z.title)} ariaConfirmer={t.confirmerSuppressionAria(z.title)} onConfirm={() => void supprimer(z.id)} />
                        </span>
                      </div>
                    )}
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
          {t.releve(t.dateHeure(film.fetchedAt))} {t.regles(t.nombre(NEUTRAL_PIXEL_TROOPS), t.nombre(ENEMY_PIXEL_BASE_TROOPS), t.jour(`${RULES_CHECKED_ON}T12:00:00Z`))}
        </p>
      )}
    </div>
  );
}
