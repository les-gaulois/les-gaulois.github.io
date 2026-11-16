import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { fmtDate, fmtDateTime, fmtInt } from "../../lib/format";
import { ORDRE_RARETES, type Rarete } from "../../lib/gaulois";
import {
  CHAMP_PRIX_POCHETTE,
  CHAMP_SOMME,
  PAS_DONNE,
  REGLAGES_DU_PILOTE,
  champChance,
  champPrix,
  changements,
  controlerSaisie,
  etatDuFormulaire,
  lireEconomie,
  lireNombreTape,
  lireReglage,
  memeSaisie,
  nomRarete,
  pourquoiCache,
  reglagesDe,
  reglagesDuPiloteEnMots,
  regleDuSeuil,
  saisieDe,
  sommeEnMots,
  stateres,
  type Controle,
  type EconomieDuVillage,
  type ParPeriode,
  type ParRarete,
  type Saisie,
} from "../../lib/village/direction";
import { Loading, Problem, Success, messageOf } from "./common";
import { Pastille } from "./direction-kit";
import { PartieTete } from "./Onglets";

const timeParis = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });

/**
 * Un chiffre clé de la bande du haut, comme ceux de l'activité du site. Caché par le serveur : « pas donné », jamais un zéro.
 * `console-*` : l'ambiance console de la Direction.
 */
function Chiffre({ label, value, sub, seuil, testId }: { label: string; value: number | null; sub: string; seuil: number; testId: string }) {
  return (
    <div class="dir-village-chiffre" data-testid={testId}>
      <span class="console-libelle font-semibold text-muted">{label}</span>
      <span class="console-valeur dir-village-valeur tnum block font-display font-extrabold">{value === null ? <span class="dir-village-cache text-muted">{PAS_DONNE}</span> : fmtInt(value)}</span>
      <span class="tnum block text-sm text-muted">{value === null ? pourquoiCache(seuil) : sub}</span>
    </div>
  );
}

/** Une case de tableau : le nombre, qui ne se coupe jamais, ou « pas donné ». */
const Case = ({ n }: { n: number | null }) => <td class="dir-village-nombre">{n === null ? <span class="text-muted">{PAS_DONNE}</span> : fmtInt(n)}</td>;

/** Une rareté : sa couleur du site (`--rarete-*`), jamais seule, toujours avec son nom. */
const NomRarete = ({ r }: { r: Rarete }) => (
  <span class="dir-village-rarete" data-rarete={r}>
    {nomRarete(r)}
  </span>
);

/**
 * Un tableau en lignes serrées (`.dir-table` des pièces communes) qui ne coupe ni les mots ni les nombres (le site coupe
 * partout ailleurs, `overflow-wrap: anywhere`). Encore trop large, il défile de côté dans son cadre, comme le tableau des
 * comptes : la page, elle, ne défile jamais de côté.
 */
function Defile({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="dir-village-cadre" tabIndex={0} role="region" aria-label={label}>
      <table class="dir-table tnum">{children}</table>
    </div>
  );
}

/** Un bloc de l'onglet : son titre, son état en pastille à droite, son contenu. `trait` : la couleur de l'état, au bord. */
function Bloc({ id, titre, aside, trait, testId, children }: { id: string; titre: string; aside?: ComponentChildren; trait?: string; testId: string; children: ComponentChildren }) {
  return (
    <section class="dir-village-bloc card" aria-labelledby={id} data-trait={trait} data-testid={testId}>
      <div class="dir-village-tete">
        <h3 id={id}>{titre}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * L'onglet « Village » de la Direction : l'économie du village en totaux (`get_village_economie`, officiers et au-dessus),
 * puis les prix et les chances, que les admins et le fondateur changent ici (`regler_village_prix`,
 * `regler_village_pochette`). Le serveur revérifie chaque rang et chaque valeur : le formulaire n'est qu'une commodité.
 *
 * Au dessin des autres onglets de la Direction (14 novembre 2026, « comme pour la section compte ») : les chiffres clés dans
 * une bande, les tableaux en lignes serrées, chaque état en pastille avec son mot, le formulaire et ce qu'il changera côte à
 * côte, les gestes qui coupent à part. Les règles de couleur sont dans `src/lib/village/direction.ts`, le dessin dans
 * `03-direction.css`, section « Direction, onglet Village ».
 */
export default function DirectionVillage({ rank }: { rank: number }) {
  const [data, setData] = useState<EconomieDuVillage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reads = useRef(0);

  const load = async (): Promise<EconomieDuVillage | null> => {
    const mine = ++reads.current;
    setBusy(true);
    try {
      const next = lireEconomie(await call<unknown>("get_village_economie"));
      if (mine !== reads.current) return null;
      if (next === null) setError("La réponse du serveur est illisible.");
      else {
        setData(next);
        setError(null);
      }
      return next;
    } catch (e) {
      if (mine === reads.current) setError(messageOf(e));
      return null;
    } finally {
      if (mine === reads.current) setBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const reload = (
    <button type="button" class="btn btn-ghost" disabled={busy} onClick={() => void load()} data-testid="village-reload">
      Actualiser
    </button>
  );

  return (
    <section class="dir-village" aria-labelledby="village-titre" data-testid="direction-village">
      <PartieTete id="village-titre" title="Le village" aside={reload}>
        <p>Des totaux seulement, sans aucun nom.</p>
        {data && (
          <p class="tnum mt-1" data-testid="village-lu">
            Lu à {timeParis.format(new Date(data.lu_le))}, heure de Paris. {data.releve ? `Parties relues le ${fmtDateTime(data.releve)}.` : "Les parties n'ont encore jamais été relues."}
          </p>
        )}
      </PartieTete>
      <div class="dir-village-corps">
        <Problem message={error} onRetry={() => void load()} />
        {data === null ? (
          !error && <Loading />
        ) : (
          <>
            <Economie data={data} />
            {rank >= 3 ? <Reglages data={data} relire={load} /> : <ReglagesLus data={data} />}
          </>
        )}
      </div>
    </section>
  );
}

function Economie({ data }: { data: EconomieDuVillage }) {
  const s = data.seuil;
  const depuis = data.debut ? `Depuis le ${fmtDate(data.debut)}` : "Depuis le début";
  const sur30 = (n: number | null, mot: string) => (n === null ? `${mot}, ${PAS_DONNE} sur 30 jours` : `${mot}, ${fmtInt(n)} ces 30 jours`);
  const lignes: { label: string; valeurs: ParPeriode<number | null> }[] = [
    { label: "Distribués", valeurs: data.distribues },
    { label: "Dépensés à la boutique", valeurs: data.boutique },
    { label: "Dépensés en pochettes", valeurs: data.pochettes },
    { label: "Dépensés en tout", valeurs: data.depenses },
    ...(data.gravures ? [{ label: "Payés à la forge", valeurs: data.gravures }] : []),
  ];
  return (
    <>
      {/* Les chiffres clés dans une seule bande : deux par ligne sur téléphone, quatre au-delà. */}
      <div class="dir-village-chiffres">
        <Chiffre label="Gaulois" value={data.gaulois.total} sub={`créés, ${fmtInt(data.gaulois.trente_jours)} ces 30 jours`} seuil={s} testId="village-gaulois" />
        <Chiffre label="Comptes crédités" value={data.comptes_credites.total} sub={`ont reçu des statères, ${fmtInt(data.comptes_credites.trente_jours)} ces 30 jours`} seuil={s} testId="village-credites" />
        <Chiffre label="Distribués" value={data.distribues.total} sub={sur30(data.distribues.trente_jours, "statères")} seuil={s} testId="village-distribues" />
        <Chiffre label="En circulation" value={data.circulation} sub="statères gardés par les membres" seuil={s} testId="village-circulation" />
      </div>

      {/* Les trois tableaux côte à côte dès qu'il y a la place : les statères, puis les objets et les pochettes par rareté. */}
      <div class="dir-village-tables">
        <Bloc id="village-stateres" titre="Les statères" testId="village-stateres-tableau">
          <Defile label="Les statères">
            <thead>
              <tr>
                <th scope="col">
                  <span class="sr-only">Statères</span>
                </th>
                <th scope="col" class="dir-village-nombre">
                  Ces 30 jours
                </th>
                <th scope="col" class="dir-village-nombre">
                  {depuis}
                </th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.label}>
                  <th scope="row">{l.label}</th>
                  <Case n={l.valeurs.trente_jours} />
                  <Case n={l.valeurs.total} />
                </tr>
              ))}
            </tbody>
          </Defile>
        </Bloc>
        <ParRareteTableau id="village-achats" titre="Objets achetés à la boutique" valeurs={data.achats} depuis={depuis} seuil={s} />
        <ParRareteTableau id="village-ouvertures" titre="Pochettes ouvertes, selon la rareté sortie" valeurs={data.ouvertures} depuis={depuis} seuil={s} />
      </div>

      <details class="fold">
        <summary class="font-semibold">Comment lire ces chiffres</summary>
        <div class="grid gap-3 pb-1 text-muted">
          <p>
            Tout vient du journal des statères du serveur. Distribués : les statères donnés pour les points rapportés au clan. Dépensés : les achats à la boutique et les pochettes ouvertes. Payés à la forge : les gravures d'une partie sur un objet, à part des dépensés. En circulation : ce que les comptes gardent encore. Les 30 jours se comptent à la date de chaque crédit ou de chaque achat. Un compte supprimé sort des totaux.
          </p>
          <p data-testid="village-regle-seuil">{regleDuSeuil(s)}</p>
        </div>
      </details>
    </>
  );
}

function ParRareteTableau({ id, titre, valeurs, depuis, seuil }: { id: string; titre: string; valeurs: ParPeriode<ParRarete | null>; depuis: string; seuil: number }) {
  const cache = valeurs.total === null && valeurs.trente_jours === null;
  return (
    <Bloc id={id} titre={titre} testId={id}>
      {cache ? (
        <p class="dir-note">Pas donné : {pourquoiCache(seuil)}.</p>
      ) : (
        <Defile label={titre}>
          <thead>
            <tr>
              <th scope="col">Rareté</th>
              <th scope="col" class="dir-village-nombre">
                Ces 30 jours
              </th>
              <th scope="col" class="dir-village-nombre">
                {depuis}
              </th>
            </tr>
          </thead>
          <tbody>
            {ORDRE_RARETES.map((r) => (
              <tr key={r}>
                <th scope="row">
                  <NomRarete r={r} />
                </th>
                <Case n={valeurs.trente_jours?.[r] ?? null} />
                <Case n={valeurs.total?.[r] ?? null} />
              </tr>
            ))}
          </tbody>
        </Defile>
      )}
    </Bloc>
  );
}

/** Quand les réglages ont changé pour la dernière fois. */
function datesDesReglages(data: EconomieDuVillage): string | null {
  const { prix_maj_le: prix, pochette } = data.reglages;
  if (!prix && !pochette.maj_le) return null;
  return [prix ? `Prix en vigueur depuis le ${fmtDateTime(prix)}.` : null, pochette.maj_le ? `Pochette en vigueur depuis le ${fmtDateTime(pochette.maj_le)}.` : null].filter(Boolean).join(" ");
}

/**
 * Les réglages en vigueur, pour les officiers : seuls les admins et le fondateur les changent. À gauche le tableau, une
 * ligne par rareté ; à droite le prix de la pochette et qui peut les changer.
 */
function ReglagesLus({ data }: { data: EconomieDuVillage }) {
  const r = data.reglages;
  const dates = datesDesReglages(data);
  return (
    <Bloc id="village-reglages" titre="Les prix et les chances" aside={<Pastille ton="muted">Lecture seule</Pastille>} testId="village-reglages-lus">
      <div class="dir-village-deux">
        <Defile label="Les prix et les chances">
          <thead>
            <tr>
              <th scope="col">Rareté</th>
              <th scope="col" class="dir-village-nombre">
                Prix
              </th>
              <th scope="col" class="dir-village-nombre">
                Chance dans la pochette
              </th>
            </tr>
          </thead>
          <tbody>
            {ORDRE_RARETES.map((x) => (
              <tr key={x}>
                <th scope="row">
                  <NomRarete r={x} />
                </th>
                <td class="dir-village-nombre dir-village-souple">{stateres(r.prix[x])}</td>
                <td class="dir-village-nombre dir-village-souple">{fmtInt(r.pochette.chances[x])} pour cent</td>
              </tr>
            ))}
          </tbody>
        </Defile>
        <div class="dir-village-agir">
          <p class="tnum">La pochette surprise coûte {stateres(r.pochette.prix)}.</p>
          <p class="dir-note tnum">Seuls les admins et le fondateur les changent.{dates ? ` ${dates}` : ""}</p>
          <p class="dir-note" data-testid="village-divin">Le divin, sans prix, sort de la pochette dix fois moins souvent que le légendaire : sa chance est prise sur celle du commun.</p>
        </div>
      </div>
    </Bloc>
  );
}

/**
 * Un champ du tableau des réglages : le nombre, et dessous la valeur en vigueur quand elle a changé. Son nom vient du titre
 * de sa colonne et de celui de sa ligne (`aria-labelledby`) : « Prix, en statères », « Commun ».
 */
function Champ({
  champ,
  nom,
  valeur,
  enVigueur,
  unite,
  probleme,
  inactif,
  onInput,
}: {
  champ: string;
  nom: string;
  valeur: string;
  enVigueur: number;
  unite: string;
  probleme: string | null;
  inactif: boolean;
  onInput: (v: string) => void;
}) {
  const id = `village-${champ}`;
  const change = lireNombreTape(valeur) !== enVigueur;
  const decrit = [change ? `${id}-vigueur` : null, probleme ? `${id}-probleme` : null].filter(Boolean).join(" ");
  return (
    <td>
      <input
        id={id}
        class="field dir-champ tnum"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellcheck={false}
        value={valeur}
        disabled={inactif}
        aria-labelledby={nom}
        aria-invalid={probleme ? "true" : undefined}
        aria-describedby={decrit || undefined}
        onInput={(e) => onInput(e.currentTarget.value)}
      />
      {change && (
        <p id={`${id}-vigueur`} class="dir-village-vigueur tnum">
          en vigueur : {fmtInt(enVigueur)} {unite}
        </p>
      )}
    </td>
  );
}

/**
 * Le réglage des prix et des chances, pour les admins et le fondateur. Pas de `<form>` : la touche Entrée n'envoie rien.
 * « Vérifier et enregistrer » contrôle tout (`controlerSaisie`), puis montre ce qui va changer ; rien ne part avant
 * « Confirmer : enregistrer ». Les prix et la pochette partent chacun par sa fonction, seulement s'ils ont changé.
 *
 * À gauche le formulaire, une ligne par rareté ; à droite ce qu'il changera, dès que la saisie se lit, puis l'enregistrement.
 */
function Reglages({ data, relire }: { data: EconomieDuVillage; relire: () => Promise<EconomieDuVillage | null> }) {
  const enVigueur = reglagesDe(data.reglages);
  const [saisie, setSaisie] = useState<Saisie>(() => saisieDe(enVigueur));
  const [controle, setControle] = useState<Controle | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const [fait, setFait] = useState<string | null>(null);
  const [pilote, setPilote] = useState<string | null>(null);
  const verifier = useRef<HTMLButtonElement>(null);
  const titreConfirmation = useRef<HTMLHeadingElement>(null);

  const courant = controlerSaisie(saisie);
  const modifie = !memeSaisie(saisie, saisieDe(enVigueur));
  const aConfirmer = confirmer && controle?.reglages ? changements(enVigueur, controle.reglages) : null;
  // Les problèmes s'affichent après « Vérifier et enregistrer », puis suivent la saisie : un champ corrigé perd le sien.
  const problemes = controle ? courant.problemes : [];
  const problemeDe = (champ: string) => problemes.find((p) => p.champ === champ)?.texte ?? null;

  useEffect(() => {
    if (aConfirmer) titreConfirmation.current?.focus();
  }, [confirmer]);

  const changer = (next: Saisie) => {
    setSaisie(next);
    setConfirmer(false);
    setFait(null);
    setRefus(null);
    setPilote(null);
  };
  const changerPrix = (r: Rarete, v: string) => changer({ ...saisie, prix: { ...saisie.prix, [r]: v } });
  const changerChance = (r: Rarete, v: string) => changer({ ...saisie, chances: { ...saisie.chances, [r]: v } });

  const verifierEtMontrer = () => {
    setFait(null);
    setRefus(null);
    setPilote(null);
    setControle(courant);
    if (courant.problemes.length > 0) {
      const premier = courant.problemes[0]!.champ;
      document.getElementById(premier === CHAMP_SOMME ? `village-${champChance("commun")}` : `village-${premier}`)?.focus();
      return;
    }
    setConfirmer(true);
  };

  const annuler = () => {
    setConfirmer(false);
    verifier.current?.focus();
  };

  const enregistrer = async () => {
    if (!controle?.reglages) return;
    const aEnvoyer = changements(enVigueur, controle.reglages);
    setEnvoi(true);
    setRefus(null);
    setFait(null);
    let prixFaits = false;
    let tout = false;
    try {
      if (aEnvoyer.prix) {
        if (lireReglage(await call<unknown>("regler_village_prix", { p_prix: aEnvoyer.prix })) === null) throw new Error("illisible");
        prixFaits = true;
      }
      if (aEnvoyer.pochette) {
        if (lireReglage(await call<unknown>("regler_village_pochette", aEnvoyer.pochette)) === null) throw new Error("illisible");
      }
      tout = true;
      setFait("Réglages enregistrés : la boutique les applique dès maintenant.");
      setControle(null);
    } catch (e) {
      const raison = e instanceof Error && e.message === "illisible" ? "La réponse du serveur est illisible : actualisez pour voir les réglages en vigueur." : messageOf(e);
      // Les prix partent avant la pochette : s'ils sont passés, il le dit, et les champs de la pochette restent à renvoyer.
      setRefus(prixFaits && aEnvoyer.pochette ? `Les prix sont enregistrés, mais pas la pochette. ${raison}` : raison);
    } finally {
      setConfirmer(false);
      setEnvoi(false);
    }
    // Les réglages en vigueur, relus : tout enregistré, le formulaire les reprend ; sinon il garde ce qui reste à envoyer.
    const relu = await relire();
    if (relu && tout) setSaisie(saisieDe(reglagesDe(relu.reglages)));
    // Tout enregistré, « Vérifier et enregistrer » n'a plus rien à faire et se grise : le focus va au premier champ.
    (tout ? document.getElementById(`village-${champPrix("commun")}`) : verifier.current)?.focus();
  };

  const reprendrePilote = () => {
    const next = saisieDe(REGLAGES_DU_PILOTE);
    const deja = memeSaisie(saisie, next);
    changer(next);
    setControle(null);
    setPilote(deja ? "Les champs ont déjà les réglages du pilote." : "Les champs reprennent les réglages du pilote. Rien n'est enregistré : vérifiez, puis enregistrez.");
  };

  const dates = datesDesReglages(data);
  const somme = courant.somme;
  const etat = etatDuFormulaire(modifie, problemes.length);
  // Ce que l'enregistrement changerait, écrit à côté du formulaire dès que la saisie se lit ; la confirmation le reprend.
  const apercu = modifie && !aConfirmer && courant.reglages ? changements(enVigueur, courant.reglages) : null;

  return (
    <section aria-labelledby="village-reglages" data-testid="village-reglages">
      <div class="dir-village-bloc card" data-trait={etat.ton}>
        <div class="dir-village-tete">
          <h3 id="village-reglages">Les prix et les chances</h3>
          {/* La zone existe avant de changer : un lecteur d'écran annonce « Modifié, pas enregistré » quand il arrive. */}
          <span role="status">
            <Pastille ton={etat.ton} testid="village-reglages-etat">
              {etat.mot}
            </Pastille>
          </span>
        </div>

        <div class="dir-village-deux">
          <div class="dir-village-lu">
            <table class="dir-table dir-village-saisie tnum">
              <thead>
                <tr>
                  <th scope="col">Rareté</th>
                  <th scope="col" id="village-col-prix">
                    Prix, en statères
                  </th>
                  <th scope="col" id="village-col-chance">
                    Chance dans la pochette, en pour cent
                  </th>
                </tr>
              </thead>
              <tbody>
                {ORDRE_RARETES.map((r) => (
                  <tr key={r}>
                    <th scope="row" id={`village-ligne-${r}`}>
                      <NomRarete r={r} />
                    </th>
                    <Champ champ={champPrix(r)} nom={`village-col-prix village-ligne-${r}`} valeur={saisie.prix[r]} enVigueur={enVigueur.prix[r]} unite="statères" probleme={problemeDe(champPrix(r))} inactif={envoi} onInput={(v) => changerPrix(r, v)} />
                    <Champ
                      champ={champChance(r)}
                      nom={`village-col-chance village-ligne-${r}`}
                      valeur={saisie.chances[r]}
                      enVigueur={enVigueur.pochette.chances[r]}
                      unite="pour cent"
                      probleme={problemeDe(champChance(r))}
                      inactif={envoi}
                      onInput={(v) => changerChance(r, v)}
                    />
                  </tr>
                ))}
                <tr>
                  <th scope="row" id="village-ligne-pochette">
                    La pochette surprise
                  </th>
                  <Champ
                    champ={CHAMP_PRIX_POCHETTE}
                    nom="village-col-prix village-ligne-pochette"
                    valeur={saisie.prixPochette}
                    enVigueur={enVigueur.pochette.prix}
                    unite="statères"
                    probleme={problemeDe(CHAMP_PRIX_POCHETTE)}
                    inactif={envoi}
                    onInput={(v) => changer({ ...saisie, prixPochette: v })}
                  />
                  <td></td>
                </tr>
              </tbody>
            </table>
            <p class={`tnum text-sm ${somme !== null && somme !== 100 ? "font-semibold text-warn" : "text-muted"}`} aria-live="polite" data-testid="village-somme">
              {somme === null ? "Chaque chance est un nombre entier de 0 à 100." : sommeEnMots(somme)}
            </p>
          </div>

          <div class="dir-village-agir">
            <div class="dir-village-boutons">
              <button ref={verifier} type="button" class="btn btn-primary" disabled={envoi || !modifie} onClick={verifierEtMontrer} data-testid="village-verifier">
                Vérifier et enregistrer
              </button>
              {modifie && (
                <button type="button" class="btn btn-ghost" disabled={envoi} onClick={() => changer(saisieDe(enVigueur))} data-testid="village-reprendre">
                  Reprendre les valeurs en vigueur
                </button>
              )}
            </div>

            {/* Sous les boutons : « Vérifier et enregistrer » ne bouge pas quand la confirmation remplace l'aperçu. */}
            {problemes.length > 0 && (
              <div role="alert" data-testid="village-problemes">
                <ul class="grid gap-1">
                  {problemes.map((p) => (
                    <li key={`${p.champ}-${p.texte}`} id={p.champ === CHAMP_SOMME ? undefined : `village-${p.champ}-probleme`} class="form-problem !mt-0">
                      {p.texte}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {apercu && apercu.lignes.length > 0 && (
              <div data-testid="village-apercu">
                <h4>Ce qui changera</h4>
                <ul class="dir-village-lignes tnum">
                  {apercu.lignes.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            )}

            {aConfirmer && (
              <div class="dir-village-confirmation" data-testid="village-confirmation">
                <h4 ref={titreConfirmation} tabIndex={-1}>
                  À enregistrer
                </h4>
                <ul class="dir-village-lignes tnum">
                  {aConfirmer.lignes.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                {controle?.avertissements.map((a) => (
                  <p key={a} class="font-semibold text-warn">
                    {a}
                  </p>
                ))}
                <div class="dir-village-boutons">
                  <button type="button" class="btn btn-primary" disabled={envoi} onClick={() => void enregistrer()} data-testid="village-confirmer">
                    Confirmer : enregistrer
                  </button>
                  <button type="button" class="btn btn-ghost" disabled={envoi} onClick={annuler}>
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {(refus || fait) && (
              <div>
                <Problem message={refus} />
                {fait && <Success message={fait} />}
              </div>
            )}
            {dates && <p class="dir-note tnum">{dates}</p>}
          </div>
        </div>
      </div>

      {/* À part, sous un filet, loin d'« Enregistrer » : il ne fait que remplir les champs, rien ne part sans confirmation. */}
      <div class="dir-village-apart" data-testid="village-pilote">
        <div class="dir-village-apart-ligne">
          <button type="button" class="dir-bouton" disabled={envoi} onClick={reprendrePilote} data-testid="village-pilote-bouton">
            Revenir aux réglages du pilote
          </button>
          <p class="tnum text-sm text-muted">{reglagesDuPiloteEnMots()}</p>
        </div>
        {pilote && (
          <p class="text-sm" role="status">
            {pilote}
          </p>
        )}
      </div>
    </section>
  );
}
