import { useEffect, useRef, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { dayTicksLegend, dayWords, weekTicks } from "../../lib/compte/direction-activite";
import { fmtDateTime, fmtInt } from "../../lib/format";
import { ORDRE_RARETES } from "../../lib/gaulois";
import {
  LIGNES_DES_ECHANGES,
  SERIES_DES_JOURS,
  accorde,
  delaiEnMots,
  lireMarcheDeLaDirection,
  partDesDemandesServies,
  remiseDesOffres,
  type MarcheDeLaDirection,
  type ObjetCompte,
} from "../../lib/village/marche-direction";
import { stateres } from "../../lib/village/direction";
import { Loading, Problem, messageOf } from "./common";
import { Colonnes } from "./DirectionActivite";
import { Pastille } from "./direction-kit";
import { Bloc, Defile, NomRarete } from "./village-kit";

const timeParis = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
const jourMois = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long" });
const jourEnMots = (iso: string) => jourMois.format(new Date(iso)).replace(/^1 /, "1er ");
/** « 19 novembre à 12 h 47 », heure de Paris. */
const momentEnMots = (iso: string) => `${jourEnMots(iso)} à ${timeParis.format(new Date(iso)).replace(":", " h ")}`;

/** Un chiffre clé de la bande du marché, comme ceux du village : tout est donné, sans seuil. */
function Chiffre({ label, value, sub, testId }: { label: string; value: number; sub: string; testId: string }) {
  return (
    <div class="dir-village-chiffre" data-testid={testId}>
      <span class="console-libelle font-semibold text-muted">{label}</span>
      <span class="console-valeur dir-village-valeur tnum block font-display font-extrabold">{fmtInt(value)}</span>
      <span class="tnum block text-sm text-muted">{sub}</span>
    </div>
  );
}

/** Une liste d'objets comptés : le nom et sa rareté, combien, et le prix qui compte (la meilleure demande, l'offre la moins chère). */
function ObjetsComptes({ id, titre, objets, mot, prixMot, testId }: { id: string; titre: string; objets: ObjetCompte[]; mot: [string, string]; prixMot: string; testId: string }) {
  if (objets.length === 0) return null;
  return (
    <Bloc id={id} titre={titre} testId={testId} niveau={4}>
      <Defile label={titre}>
          <thead>
            <tr>
              <th scope="col">Objet</th>
              <th scope="col">Rareté</th>
              <th scope="col" class="dir-village-nombre">
                Combien
              </th>
              <th scope="col" class="dir-village-nombre">
                {prixMot}
              </th>
            </tr>
          </thead>
          <tbody>
            {objets.map((o) => (
              <tr key={`${o.emplacement}/${o.objet}`}>
                <th scope="row">{o.nom}</th>
                <td>
                  <NomRarete r={o.rarete} />
                </td>
                <td class="dir-village-nombre">{accorde(o.nombre, mot[0], mot[1])}</td>
                <td class="dir-village-nombre">{fmtInt(o.prix)}</td>
              </tr>
            ))}
          </tbody>
      </Defile>
    </Bloc>
  );
}

/**
 * Le tableau du marché (19 novembre 2026, le pilote : « 5 pousse-le au maximum ») : dans l'onglet Village de la Direction,
 * pour un officier et au-dessus, ce que fait le marché depuis la boutique tournante et les demandes d'achat. Des totaux
 * seulement, sans aucun nom de membre, comme le reste de l'onglet ; tout vient de `get_village_marche`
 * (migration 20261119000200_tableau_du_marche), lu à part du reste : en panne, le reste de l'onglet marche.
 *
 * Dans l'ordre : la bande des chiffres clés (ouvert maintenant, sept derniers jours, rotation), quatre petits graphiques
 * des 30 derniers jours (un par geste, chacun sa propre échelle), le tableau des échanges sur 7 jours, 30 jours et depuis le
 * début, les semaines de la boutique avant et depuis la rotation, ce qui est ouvert par rareté, les prix payés et les
 * délais, les objets les plus demandés et les plus en vente, et les dernières ventes.
 */
export function LeMarche() {
  const [data, setData] = useState<MarcheDeLaDirection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reads = useRef(0);

  const load = async () => {
    const mine = ++reads.current;
    setBusy(true);
    try {
      const next = lireMarcheDeLaDirection(await call<unknown>("get_village_marche"));
      if (mine !== reads.current) return;
      if (next === null) setError("La réponse du serveur est illisible.");
      else {
        setData(next);
        setError(null);
      }
    } catch (e) {
      if (mine === reads.current) setError(messageOf(e));
    } finally {
      if (mine === reads.current) setBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const aside = (
    <span class="dir-marche-tete-actions">
      {data && <span class="tnum text-sm text-muted">Lu à {timeParis.format(new Date(data.luLe))}</span>}
      <button type="button" class="btn btn-ghost" disabled={busy} onClick={() => void load()} data-testid="marche-reload">
        Actualiser
      </button>
    </span>
  );

  return (
    <section class="dir-marche" aria-labelledby="marche-titre" data-testid="direction-marche">
      <div class="dir-marche-titre">
        <h3 id="marche-titre">Le marché</h3>
        {aside}
      </div>
      {error && (
        <div data-testid="marche-panne">
          <Problem message={`Le tableau du marché ne répond pas pour l'instant. ${error}`} onRetry={() => void load()} />
        </div>
      )}
      {data === null ? !error && <Loading /> : <Tableau data={data} />}
    </section>
  );
}

function Tableau({ data }: { data: MarcheDeLaDirection }) {
  const { ouvert, periodes, rotation } = data;
  const sept = periodes.sept_jours;
  const remise = remiseDesOffres(ouvert);
  const servies = partDesDemandesServies(periodes.trente_jours);
  const jours = data.parJour.map((j) => j.jour);
  const reperes = new Map(weekTicks(jours).map((i) => [i, dayWords(jours[i] ?? "").replace(/ \d{4}$/, "")]));
  const ventes7 = sept.ventes_offres + sept.ventes_demandes;
  return (
    <div class="dir-marche-corps">
      <div class="dir-village-chiffres dir-marche-chiffres">
        <Chiffre label="Offres ouvertes" value={ouvert.offres} sub={ouvert.offres === 0 ? "aucune en ce moment" : `de ${accorde(ouvert.vendeurs, "membre", "membres")}${remise !== null && remise > 0 ? `, ${fmtInt(remise)} % sous la boutique` : ""}`} testId="marche-offres" />
        <Chiffre label="Demandes ouvertes" value={ouvert.demandes} sub={ouvert.demandes === 0 ? "aucune en ce moment" : `de ${accorde(ouvert.demandeurs, "membre", "membres")} ; mis de côté : ${stateres(ouvert.misDeCote)}`} testId="marche-demandes" />
        <Chiffre label="Ventes, 7 jours" value={ventes7} sub={`d'un membre à l'autre : ${stateres(sept.stateres_echanges)}`} testId="marche-ventes-7" />
        <Chiffre label="Boutique, 7 jours" value={sept.achats_boutique} sub={`${accorde(sept.achats_boutique, "achat", "achats")}, ${stateres(sept.stateres_boutique)}`} testId="marche-boutique-7" />
        <Chiffre label="Revente au jeu, 7 jours" value={sept.reventes} sub={`rendus par le jeu : ${stateres(sept.stateres_revendus)}`} testId="marche-reventes-7" />
        <Chiffre label="En rayon cette semaine" value={rotation.enRayon} sub={`objets sur ${fmtInt(rotation.enRayon + rotation.horsRayon)}, changement le ${jourEnMots(rotation.changeLe)}`} testId="marche-rotation" />
      </div>

      {/* Les quatre gestes, jour par jour : un petit graphique chacun, avec sa propre échelle. Les valeurs sont dans le
          tableau replié dessous ; le dessin est masqué aux lecteurs d'écran. */}
      <Bloc id="marche-jours" titre="Les 30 derniers jours" aside={<span class="tnum text-sm text-muted">{dayTicksLegend(jours)}</span>} testId="marche-jours" niveau={4}>
        <div class="dir-marche-multiples">
          {SERIES_DES_JOURS.map((s) => (
            <div key={s.cle} class="dir-marche-multiple" data-testid={`marche-jours-${s.cle}`}>
              <p class="font-semibold">{s.label}</p>
              <Colonnes
                bars={data.parJour.map((j) => ({ key: j.jour, value: j[s.cle] }))}
                slots={30}
                current={data.parJour.length - 1}
                ticks={reperes}
                readout={(i) => {
                  const j = data.parJour[i];
                  return j ? `${dayWords(j.jour)} : ${accorde(j[s.cle], s.un, s.plusieurs)}` : "";
                }}
                label={`${s.label}, les 30 derniers jours : voir le tableau.`}
                testId={`marche-lu-${s.cle}`}
              />
            </div>
          ))}
        </div>
        <details class="fold mt-3">
          <summary class="font-semibold">Les chiffres de chaque jour</summary>
          <Defile label="Les chiffres de chaque jour">
            <thead>
              <tr>
                <th scope="col">Jour</th>
                {SERIES_DES_JOURS.map((s) => (
                  <th key={s.cle} scope="col" class="dir-village-nombre">
                    {s.label}
                  </th>
                ))}
                <th scope="col" class="dir-village-nombre">
                  Reventes au jeu
                </th>
                <th scope="col" class="dir-village-nombre">
                  Statères distribués
                </th>
              </tr>
            </thead>
            <tbody>
              {[...data.parJour].reverse().map((j) => (
                <tr key={j.jour}>
                  <th scope="row">{dayWords(j.jour)}</th>
                  {SERIES_DES_JOURS.map((s) => (
                    <td key={s.cle} class="dir-village-nombre">
                      {fmtInt(j[s.cle])}
                    </td>
                  ))}
                  <td class="dir-village-nombre">{fmtInt(j.reventes)}</td>
                  <td class="dir-village-nombre">{fmtInt(j.distribues)}</td>
                </tr>
              ))}
            </tbody>
          </Defile>
        </details>
      </Bloc>

      <div class="dir-village-tables">
        <Bloc id="marche-echanges" titre="Les échanges" testId="marche-echanges" niveau={4}>
          <Defile label="Les échanges">
            <thead>
              <tr>
                <th scope="col">
                  <span class="sr-only">Échanges</span>
                </th>
                <th scope="col" class="dir-village-nombre">
                  7 jours
                </th>
                <th scope="col" class="dir-village-nombre">
                  30 jours
                </th>
                <th scope="col" class="dir-village-nombre">
                  Depuis le début
                </th>
              </tr>
            </thead>
            <tbody>
              {LIGNES_DES_ECHANGES.map((l) => (
                <tr key={l.cle}>
                  <th scope="row">{l.label}</th>
                  <td class="dir-village-nombre">{fmtInt(periodes.sept_jours[l.cle])}</td>
                  <td class="dir-village-nombre">{fmtInt(periodes.trente_jours[l.cle])}</td>
                  <td class="dir-village-nombre">{fmtInt(periodes.total[l.cle])}</td>
                </tr>
              ))}
            </tbody>
          </Defile>
          <p class="dir-note tnum" data-testid="marche-servies">
            {servies === null ? "Aucune demande close ces 30 jours." : `Ces 30 jours, ${fmtInt(servies)} % des demandes closes ont trouvé un vendeur.`}
          </p>
        </Bloc>

        <Bloc id="marche-semaines" titre="Les semaines de la boutique" aside={<span class="text-sm text-muted">Du mardi 21 h 30 au suivant</span>} testId="marche-semaines" niveau={4}>
          <Defile label="Les semaines de la boutique">
            <thead>
              <tr>
                <th scope="col">Semaine du</th>
                <th scope="col" class="dir-village-nombre">
                  Achats
                </th>
                <th scope="col" class="dir-village-nombre">
                  Pochettes
                </th>
                <th scope="col" class="dir-village-nombre">
                  Ventes au marché
                </th>
                <th scope="col" class="dir-village-nombre">
                  Demandes
                </th>
              </tr>
            </thead>
            <tbody>
              {[...data.parSemaine].reverse().map((s) => (
                <tr key={s.semaine}>
                  <th scope="row">
                    {jourEnMots(s.debut)}
                    {s.semaine === rotation.semaine && <span class="text-muted">, en cours</span>}
                  </th>
                  <td class="dir-village-nombre">{fmtInt(s.achats)}</td>
                  <td class="dir-village-nombre">{fmtInt(s.pochettes)}</td>
                  <td class="dir-village-nombre">{fmtInt(s.ventes)}</td>
                  <td class="dir-village-nombre">{fmtInt(s.demandes)}</td>
                </tr>
              ))}
            </tbody>
          </Defile>
          <p class="dir-note" data-testid="marche-rotation-depuis">
            Rotation en place depuis le {momentEnMots(rotation.depuis)} ; avant, tout était en rayon.
          </p>
        </Bloc>

        <Bloc id="marche-raretes" titre="Ouvert maintenant, par rareté" testId="marche-raretes" niveau={4}>
          <Defile label="Ouvert maintenant, par rareté">
            <thead>
              <tr>
                <th scope="col">Rareté</th>
                <th scope="col" class="dir-village-nombre">
                  Offres
                </th>
                <th scope="col" class="dir-village-nombre">
                  Demandes
                </th>
              </tr>
            </thead>
            <tbody>
              {ORDRE_RARETES.map((r) => (
                <tr key={r}>
                  <th scope="row">
                    <NomRarete r={r} />
                  </th>
                  <td class="dir-village-nombre">{fmtInt(ouvert.parRarete[r].offres)}</td>
                  <td class="dir-village-nombre">{fmtInt(ouvert.parRarete[r].demandes)}</td>
                </tr>
              ))}
            </tbody>
          </Defile>
        </Bloc>

        {data.prix30.length > 0 && (
        <Bloc id="marche-prix" titre="Les prix payés, 30 jours" testId="marche-prix" niveau={4}>
            <Defile label="Les prix payés, 30 jours">
              <thead>
                <tr>
                  <th scope="col">Rareté</th>
                  <th scope="col" class="dir-village-nombre">
                    Ventes
                  </th>
                  <th scope="col" class="dir-village-nombre">
                    Prix payé, part de la boutique
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.prix30.map((p) => (
                  <tr key={p.rarete}>
                    <th scope="row">
                      <NomRarete r={p.rarete} />
                    </th>
                    <td class="dir-village-nombre">{fmtInt(p.ventes)}</td>
                    <td class="dir-village-nombre">{p.partMoyenne === null ? "pas de prix" : `${fmtInt(p.partMoyenne)} %`}</td>
                  </tr>
                ))}
              </tbody>
            </Defile>
          <ul class="dir-village-lignes tnum mt-3" data-testid="marche-delais">
            {data.delais30.offres !== null && <li>Une offre trouve son acheteur en {delaiEnMots(data.delais30.offres)}, en médiane.</li>}
            {data.delais30.demandes !== null && <li>Une demande trouve son vendeur en {delaiEnMots(data.delais30.demandes)}, en médiane.</li>}
          </ul>
        </Bloc>
        )}

        <ObjetsComptes id="marche-plus-demandes" titre="Les plus demandés" objets={data.plusDemandes} mot={["demande", "demandes"]} prixMot="Meilleure demande" testId="marche-plus-demandes" />
        <ObjetsComptes id="marche-plus-offerts" titre="Les plus en vente" objets={data.plusOfferts} mot={["offre", "offres"]} prixMot="Offre la moins chère" testId="marche-plus-offerts" />
      </div>

      {data.dernieresVentes.length > 0 && (
      <Bloc id="marche-ventes" titre="Les dernières ventes" testId="marche-dernieres-ventes" niveau={4}>
          <Defile label="Les dernières ventes">
            <thead>
              <tr>
                <th scope="col">Quand</th>
                <th scope="col">Objet</th>
                <th scope="col">Rareté</th>
                <th scope="col" class="dir-village-nombre">
                  Prix
                </th>
                <th scope="col" class="dir-village-nombre">
                  Boutique
                </th>
                <th scope="col">Voie</th>
                <th scope="col">Rayon</th>
              </tr>
            </thead>
            <tbody>
              {data.dernieresVentes.map((v, i) => (
                <tr key={`${v.le}-${i}`}>
                  <td>{fmtDateTime(v.le)}</td>
                  <th scope="row">{v.nom}</th>
                  <td>
                    <NomRarete r={v.rarete} />
                  </td>
                  <td class="dir-village-nombre">{fmtInt(v.prix)}</td>
                  <td class="dir-village-nombre">{v.prixBoutique === null ? "pas de prix" : fmtInt(v.prixBoutique)}</td>
                  <td>{v.voie === "offre" ? "Offre achetée" : "Demande servie"}</td>
                  <td>{v.horsRayon === null ? <span class="text-muted">Avant la rotation</span> : v.horsRayon ? <Pastille ton="ok">Hors rayon</Pastille> : <span class="text-muted">En rayon</span>}</td>
                </tr>
              ))}
            </tbody>
          </Defile>
      </Bloc>
      )}

      <details class="fold">
        <summary class="font-semibold">Comment lire ces chiffres</summary>
        <div class="grid gap-3 pb-1 text-muted">
          <p>
            Tout vient du serveur, sans aucun nom de membre. Les ventes, achats, pochettes, demandes et reventes se comptent dans le journal des statères, à l'heure de chaque geste, depuis le début : un essai du mode GOD n'y compte jamais. Une vente au marché, c'est une offre achetée ou une demande servie ; les statères passent d'un membre à l'autre, le jeu n'en crée ni n'en
            retire.
          </p>
          <p>
            Ce qui est ouvert, les prix payés, les délais, les objets les plus demandés et les dernières ventes se lisent dans les offres et les demandes du marché, qui s'effacent 30 jours après leur fin : on ne remonte pas plus loin. Le prix de la boutique d'une vente est celui d'aujourd'hui. « Hors rayon » : l'objet n'était pas en rayon à l'heure de la vente, d'après le
            rangement des tours d'aujourd'hui.
          </p>
          <p>
            Les semaines vont du mardi 21 h 30 au suivant. La rotation est en place depuis le {momentEnMots(data.rotation.depuis)} : la semaine qui la contient en a une partie sans elle, et les semaines d'avant, où tout était en rayon, servent à comparer.
          </p>
        </div>
      </details>
    </div>
  );
}
