import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { ServerError, call } from "../../lib/compte/api";
import { fmtDate, fmtDateTime, fmtInt } from "../../lib/format";
import { ORDRE_RARETES, type Rarete } from "../../lib/gaulois";
import {
  CHAMP_PRIX_POCHETTE,
  CHAMP_SOMME,
  D_OU_VIENNENT_LES_BULLES,
  PAS_DONNE,
  PLAFOND_ATTEINT,
  REGLAGES_DU_PILOTE,
  champChance,
  champPrix,
  changements,
  confirmationDesBulles,
  confirmationDuPlafond,
  controlerPlafond,
  controlerSaisie,
  dollars,
  etatDesBulles,
  moisEnMots,
  phraseDeLaDepense,
  plafondEnSaisie,
  prixDuModele,
  lireEconomie,
  lireNombreTape,
  lireReglage,
  memeSaisie,
  nomRarete,
  pourquoiCache,
  reglagesDe,
  reglagesDuPiloteEnMots,
  saisieDe,
  sommeEnMots,
  stateres,
  type Controle,
  type EconomieDuVillage,
  type ParPeriode,
  type ParRarete,
  type Saisie,
} from "../../lib/village/direction";
import { lireVieDuVillage, type VieDuVillage } from "../../lib/village/vie-releve";
import { Loading, Problem, Success, messageOf } from "./common";
import { PartieTete } from "./Onglets";

const timeParis = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });

/** Un chiffre clé, comme ceux de l'activité du site. Caché par le serveur : « pas donné », jamais un zéro. */
function Chiffre({ label, value, sub, seuil, testId }: { label: string; value: number | null; sub: string; seuil: number; testId: string }) {
  return (
    <div class="card p-4 sm:p-5" data-testid={testId}>
      <span class="console-libelle font-semibold text-muted">{label}</span>
      <span class="console-valeur tnum mt-1 block font-display text-4xl font-extrabold">{value === null ? <span class="text-lg text-muted">{PAS_DONNE}</span> : fmtInt(value)}</span>
      <span class="tnum mt-1 block text-sm text-muted">{value === null ? pourquoiCache(seuil) : sub}</span>
    </div>
  );
}

/** Une case de tableau : le nombre, qui ne se coupe jamais, ou « pas donné ». */
const Case = ({ n }: { n: number | null }) => <td>{n === null ? <span class="text-muted">{PAS_DONNE}</span> : <span class="whitespace-nowrap">{fmtInt(n)}</span>}</td>;

/**
 * Un tableau qui ne coupe ni les mots ni les nombres (le site coupe partout ailleurs, `overflow-wrap: anywhere`), aux
 * cases serrées sur un petit téléphone, comme le veut la règle des tableaux de global.css (que la marge plus grande des
 * espaces de travail recouvre). Encore trop large, il défile de côté dans son cadre, comme le tableau des comptes.
 */
function Defile({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label={label}>
      <table class="data-table tnum w-full text-sm [overflow-wrap:normal] max-[30rem]:[&_:is(td,th)]:!px-2">{children}</table>
    </div>
  );
}

/**
 * L'onglet « Village » de la Direction : l'économie du village en totaux (`get_village_economie`, officiers et au-dessus),
 * puis les prix et les chances, que les admins et le fondateur changent ici (`regler_village_prix`,
 * `regler_village_pochette`). Le serveur revérifie chaque rang et chaque valeur : le formulaire n'est qu'une commodité.
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
    <section aria-labelledby="village-titre" data-testid="direction-village">
      <PartieTete id="village-titre" title="Le village" aside={reload}>
        <p>Des totaux seulement : jamais le solde ni les achats d'un membre.</p>
        {data && (
          <p class="tnum mt-1" data-testid="village-lu">
            Lu à {timeParis.format(new Date(data.lu_le))}, heure de Paris. {data.releve ? `Parties relues le ${fmtDateTime(data.releve)}.` : "Les parties n'ont encore jamais été relues."}
          </p>
        )}
      </PartieTete>
      {/* `grid-cols-1` : une colonne qui ne s'élargit pas pour un tableau trop large ; c'est le tableau qui défile. */}
      <div class="mt-6 grid grid-cols-1 gap-6">
        <Problem message={error} onRetry={() => void load()} />
        {data === null ? (
          !error && <Loading />
        ) : (
          <>
            <Economie data={data} />
            {rank >= 3 ? <Reglages data={data} relire={load} /> : <ReglagesLus data={data} />}
          </>
        )}
        {/* Les bulles se lisent à part : sans leur migration, le reste de l'onglet ne change pas. */}
        <BullesDuVillage rank={rank} />
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
  ];
  return (
    <>
      {/* Une colonne sur téléphone, deux au-delà : un total de statères à sept chiffres tient sans se couper. */}
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Chiffre label="Gaulois" value={data.gaulois.total} sub={`créés, ${fmtInt(data.gaulois.trente_jours)} ces 30 jours`} seuil={s} testId="village-gaulois" />
        <Chiffre label="Comptes crédités" value={data.comptes_credites.total} sub={`ont reçu des statères, ${fmtInt(data.comptes_credites.trente_jours)} ces 30 jours`} seuil={s} testId="village-credites" />
        <Chiffre label="Distribués" value={data.distribues.total} sub={sur30(data.distribues.trente_jours, "statères")} seuil={s} testId="village-distribues" />
        <Chiffre label="En circulation" value={data.circulation} sub="statères gardés par les membres" seuil={s} testId="village-circulation" />
      </div>

      <section class="card p-4 sm:p-5" aria-labelledby="village-stateres" data-testid="village-stateres-tableau">
        <h3 id="village-stateres" class="text-lg">
          Les statères
        </h3>
        <Defile label="Les statères">
          <thead>
            <tr>
              <th scope="col">
                <span class="sr-only">Statères</span>
              </th>
              <th scope="col">Ces 30 jours</th>
              <th scope="col">{depuis}</th>
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
      </section>

      <div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <ParRareteTableau id="village-achats" titre="Objets achetés à la boutique" valeurs={data.achats} depuis={depuis} seuil={s} />
        <ParRareteTableau id="village-ouvertures" titre="Pochettes ouvertes, selon la rareté sortie" valeurs={data.ouvertures} depuis={depuis} seuil={s} />
      </div>

      <details class="fold">
        <summary class="font-semibold">Comment lire ces chiffres</summary>
        <div class="grid gap-3 pb-1 text-muted">
          <p>
            Tout vient du journal des statères du serveur. Distribués : les statères donnés pour les points rapportés au clan. Dépensés : les achats à la boutique et les pochettes ouvertes. En circulation : ce que les comptes gardent encore. Les 30 jours se comptent à la date de chaque crédit ou de chaque achat. Un compte supprimé sort des totaux.
          </p>
          <p>
            Un chiffre qui viendrait de moins de {fmtInt(s)} comptes n'est pas donné : il pourrait désigner quelqu'un. Il n'est pas donné non plus quand une soustraction le redonnerait : par exemple, les dépenses de la boutique et des pochettes sont cachées ensemble si l'une des deux vient de moins de {fmtInt(s)} comptes, et les 30 derniers jours si ce qui reste d'avant en vient. « {PAS_DONNE} » n'est pas zéro.
          </p>
        </div>
      </details>
    </>
  );
}

function ParRareteTableau({ id, titre, valeurs, depuis, seuil }: { id: string; titre: string; valeurs: ParPeriode<ParRarete | null>; depuis: string; seuil: number }) {
  const cache = valeurs.total === null && valeurs.trente_jours === null;
  return (
    <section class="card p-4 sm:p-5" aria-labelledby={id} data-testid={id}>
      <h3 id={id} class="text-lg">
        {titre}
      </h3>
      {cache ? (
        <p class="mt-3 text-muted">
          Pas donné : {pourquoiCache(seuil)}.
        </p>
      ) : (
        <Defile label={titre}>
          <thead>
            <tr>
              <th scope="col">Rareté</th>
              <th scope="col">Ces 30 jours</th>
              <th scope="col">{depuis}</th>
            </tr>
          </thead>
          <tbody>
            {ORDRE_RARETES.map((r) => (
              <tr key={r}>
                <th scope="row">{nomRarete(r)}</th>
                <Case n={valeurs.trente_jours?.[r] ?? null} />
                <Case n={valeurs.total?.[r] ?? null} />
              </tr>
            ))}
          </tbody>
        </Defile>
      )}
    </section>
  );
}

/** Quand les réglages ont changé pour la dernière fois. */
function datesDesReglages(data: EconomieDuVillage): string | null {
  const { prix_maj_le: prix, pochette } = data.reglages;
  if (!prix && !pochette.maj_le) return null;
  return [prix ? `Prix en vigueur depuis le ${fmtDateTime(prix)}.` : null, pochette.maj_le ? `Pochette en vigueur depuis le ${fmtDateTime(pochette.maj_le)}.` : null].filter(Boolean).join(" ");
}

/** Les réglages en vigueur, pour les officiers : seuls les admins et le fondateur les changent. */
function ReglagesLus({ data }: { data: EconomieDuVillage }) {
  const r = data.reglages;
  const dates = datesDesReglages(data);
  return (
    <section class="card p-4 sm:p-5" aria-labelledby="village-reglages" data-testid="village-reglages-lus">
      <h3 id="village-reglages" class="text-lg">
        Les prix et les chances
      </h3>
      <p class="mt-1 text-sm text-muted">Seuls les admins et le fondateur les changent.{dates ? ` ${dates}` : ""}</p>
      <Defile label="Les prix et les chances">
        <thead>
          <tr>
            <th scope="col">Rareté</th>
            <th scope="col">Prix</th>
            <th scope="col">Chance dans la pochette</th>
          </tr>
        </thead>
        <tbody>
          {ORDRE_RARETES.map((x) => (
            <tr key={x}>
              <th scope="row">{nomRarete(x)}</th>
              <td class="whitespace-nowrap">{stateres(r.prix[x])}</td>
              <td class="whitespace-nowrap">{fmtInt(r.pochette.chances[x])} pour cent</td>
            </tr>
          ))}
        </tbody>
      </Defile>
      <p class="tnum mt-3">La pochette surprise coûte {stateres(r.pochette.prix)}.</p>
    </section>
  );
}

/** Un champ du formulaire : son nom à gauche, la valeur en vigueur dessous quand elle a changé, le nombre à droite. */
function Champ({
  champ,
  label,
  valeur,
  enVigueur,
  unite,
  probleme,
  onInput,
}: {
  champ: string;
  label: string;
  valeur: string;
  enVigueur: number;
  unite: string;
  probleme: string | null;
  onInput: (v: string) => void;
}) {
  const id = `village-${champ}`;
  const change = lireNombreTape(valeur) !== enVigueur;
  const decrit = [change ? `${id}-vigueur` : null, probleme ? `${id}-probleme` : null].filter(Boolean).join(" ");
  return (
    <div class="flex items-center justify-between gap-4">
      <div class="min-w-0">
        <label for={id} class="font-semibold">
          {label}
        </label>
        {change && (
          <p id={`${id}-vigueur`} class="tnum text-sm text-muted">
            en vigueur : {fmtInt(enVigueur)} {unite}
          </p>
        )}
      </div>
      <input
        id={id}
        class="field tnum !w-32 shrink-0"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellcheck={false}
        value={valeur}
        aria-invalid={probleme ? "true" : undefined}
        aria-describedby={decrit || undefined}
        onInput={(e) => onInput(e.currentTarget.value)}
      />
    </div>
  );
}

/**
 * Le réglage des prix et des chances, pour les admins et le fondateur. Pas de `<form>` : la touche Entrée n'envoie rien.
 * « Vérifier et enregistrer » contrôle tout (`controlerSaisie`), puis montre ce qui va changer ; rien ne part avant
 * « Confirmer : enregistrer ». Les prix et la pochette partent chacun par sa fonction, seulement s'ils ont changé.
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

  return (
    <section aria-labelledby="village-reglages" data-testid="village-reglages">
      <div class="card grid grid-cols-1 gap-5 p-5">
        <div>
          <h3 id="village-reglages" class="text-lg">
            Les prix et les chances
          </h3>
          {dates && <p class="tnum mt-1 text-sm text-muted">{dates}</p>}
        </div>

        <div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <fieldset class="grid min-w-0 gap-3" disabled={envoi}>
            <legend class="mb-3 text-sm font-semibold">Prix à la boutique, en statères</legend>
            {ORDRE_RARETES.map((r) => (
              <Champ key={r} champ={champPrix(r)} label={nomRarete(r)} valeur={saisie.prix[r]} enVigueur={enVigueur.prix[r]} unite="statères" probleme={problemeDe(champPrix(r))} onInput={(v) => changerPrix(r, v)} />
            ))}
          </fieldset>

          <fieldset class="grid min-w-0 gap-3" disabled={envoi}>
            <legend class="mb-3 text-sm font-semibold">La pochette surprise</legend>
            <Champ
              champ={CHAMP_PRIX_POCHETTE}
              label="Prix, en statères"
              valeur={saisie.prixPochette}
              enVigueur={enVigueur.pochette.prix}
              unite="statères"
              probleme={problemeDe(CHAMP_PRIX_POCHETTE)}
              onInput={(v) => changer({ ...saisie, prixPochette: v })}
            />
            <p class="mt-2 text-sm font-semibold">Chances, en pour cent</p>
            {ORDRE_RARETES.map((r) => (
              <Champ key={r} champ={champChance(r)} label={nomRarete(r)} valeur={saisie.chances[r]} enVigueur={enVigueur.pochette.chances[r]} unite="pour cent" probleme={problemeDe(champChance(r))} onInput={(v) => changerChance(r, v)} />
            ))}
            <p class={`tnum text-sm ${somme !== null && somme !== 100 ? "font-semibold text-warn" : "text-muted"}`} aria-live="polite" data-testid="village-somme">
              {somme === null ? "Chaque chance est un nombre entier de 0 à 100." : sommeEnMots(somme)}
            </p>
          </fieldset>
        </div>

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

        <div class="flex flex-wrap gap-3">
          <button ref={verifier} type="button" class="btn btn-primary" disabled={envoi || !modifie} onClick={verifierEtMontrer} data-testid="village-verifier">
            Vérifier et enregistrer
          </button>
          {modifie && (
            <button type="button" class="btn btn-ghost" disabled={envoi} onClick={() => changer(saisieDe(enVigueur))} data-testid="village-reprendre">
              Reprendre les valeurs en vigueur
            </button>
          )}
        </div>

        {aConfirmer && (
          <div class="grid gap-3 border-t border-line pt-4" data-testid="village-confirmation">
            <h4 ref={titreConfirmation} tabIndex={-1} class="text-lg">
              À enregistrer
            </h4>
            <ul class="tnum grid gap-1">
              {aConfirmer.lignes.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            {controle?.avertissements.map((a) => (
              <p key={a} class="font-semibold text-warn">
                {a}
              </p>
            ))}
            <div class="flex flex-wrap gap-3">
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
      </div>

      {/* À part, sous un filet, loin d'« Enregistrer » : il ne fait que remplir les champs, rien ne part sans confirmation. */}
      <div class="mt-6 grid gap-2 border-t border-line pt-4" data-testid="village-pilote">
        <div>
          <button type="button" class="btn btn-ghost" disabled={envoi} onClick={reprendrePilote} data-testid="village-pilote-bouton">
            Revenir aux réglages du pilote
          </button>
        </div>
        <p class="tnum text-sm text-muted">{reglagesDuPiloteEnMots()}</p>
        {pilote && (
          <p class="text-sm" role="status">
            {pilote}
          </p>
        )}
      </div>
    </section>
  );
}

/** Une heure du serveur, ou « jamais ». */
const quand = (iso: string | null): string => (iso && Number.isFinite(Date.parse(iso)) ? fmtDateTime(iso) : "jamais");

/**
 * Les bulles des Gaulois (migration 20261113002300, `get_vie_du_village`), pour l'encadrement : permises ou coupées, la
 * dépense du mois chez Claude et son plafond, ce qui a été écrit. Les admins et le fondateur changent le plafond et coupent ou
 * remettent les bulles (`regler_plafond_du_village`, `regler_bulles_du_village`), chaque fois après une confirmation ; le
 * serveur revérifie le rang et la valeur. Sans la migration, le bloc le dit, et le reste de l'onglet ne change pas.
 */
function BullesDuVillage({ rank }: { rank: number }) {
  const [vie, setVie] = useState<VieDuVillage | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const reads = useRef(0);

  const lire = async () => {
    const mine = ++reads.current;
    try {
      const next = lireVieDuVillage(await call<unknown>("get_vie_du_village"));
      if (mine !== reads.current) return;
      if (next === null) setErreur("La réponse du serveur est illisible.");
      else {
        setVie(next);
        setErreur(null);
      }
    } catch (e) {
      if (mine !== reads.current) return;
      // Le site ne distingue pas une fonction absente d'une panne : une seule phrase, vraie dans les deux cas.
      setErreur(e instanceof ServerError && e.code !== "network" ? messageOf(e) : "La vie du village n'est pas installée sur le serveur, ou ne répond pas pour l'instant.");
    }
  };

  useEffect(() => {
    void lire();
  }, []);

  return (
    <section class="card p-4 sm:p-5" aria-labelledby="village-bulles" data-testid="village-bulles">
      <h3 id="village-bulles" class="text-lg">
        Les bulles des Gaulois
      </h3>
      {vie === null ? (
        <div class="mt-3">{erreur ? <Problem message={erreur} onRetry={() => void lire()} /> : <Loading />}</div>
      ) : (
        <>
          <p class="mt-1 text-sm text-muted">{D_OU_VIENNENT_LES_BULLES}</p>
          <div class="mt-4 grid gap-1">
            <p class="font-semibold" data-testid="village-bulles-etat">
              {etatDesBulles(vie)}
            </p>
            <p class="tnum" data-testid="village-bulles-depense">
              {phraseDeLaDepense(vie)}
            </p>
            {vie.plafond_atteint && (
              <p class="font-semibold text-warn" data-testid="village-bulles-plafond-atteint">
                {PLAFOND_ATTEINT}
              </p>
            )}
          </div>
          <dl class="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="village-bulles-chiffres">
            {[
              ["Bulles écrites ce mois-ci", fmtInt(vie.depense.repliques)],
              ["Phrases écartées par le contrôle", fmtInt(vie.depense.ecartees)],
              ["Appels à Claude ce mois-ci", fmtInt(vie.depense.appels)],
              ["Bulles sur la place en ce moment", fmtInt(vie.bulles_affichees)],
              ["Dernier relevé vocal", quand(vie.dernier_vocal)],
              ["Dernière bulle écrite", quand(vie.derniere_bulle)],
            ].map(([dt, dd]) => (
              <div key={dt}>
                <dt class="text-sm font-semibold">{dt}</dt>
                <dd class="tnum text-sm text-muted">{dd}</dd>
              </div>
            ))}
          </dl>
          <p class="tnum mt-4 text-sm text-muted">{prixDuModele(vie)}</p>
          {vie.historique.length > 0 && (
            <details class="fold mt-4 !pb-0" data-testid="village-bulles-historique">
              <summary class="text-sm font-semibold">Les mois d'avant</summary>
              <Defile label="Les mois d'avant">
                <thead>
                  <tr>
                    <th scope="col">Mois</th>
                    <th scope="col">Dépense</th>
                    <th scope="col">Bulles écrites</th>
                    <th scope="col">Phrases écartées</th>
                    <th scope="col">Appels</th>
                  </tr>
                </thead>
                <tbody>
                  {vie.historique.map((m) => (
                    <tr key={m.mois}>
                      <th scope="row">{moisEnMots(m.mois)}</th>
                      <td class="whitespace-nowrap">{dollars(m.cout)}</td>
                      <Case n={m.repliques} />
                      <Case n={m.ecartees} />
                      <Case n={m.appels} />
                    </tr>
                  ))}
                </tbody>
              </Defile>
            </details>
          )}
          {rank >= 3 && <ReglagesDesBulles vie={vie} onChange={setVie} />}
        </>
      )}
    </section>
  );
}

/**
 * Le plafond, puis, à part et sous un filet, « Couper les bulles » ou « Remettre les bulles » : deux gestes séparés, chacun
 * avec sa confirmation. Pas de `<form>` : la touche Entrée n'envoie rien. Le serveur répond la lecture à jour.
 */
function ReglagesDesBulles({ vie, onChange }: { vie: VieDuVillage; onChange: (vie: VieDuVillage) => void }) {
  const [saisie, setSaisie] = useState(() => plafondEnSaisie(vie.plafond));
  const [verifie, setVerifie] = useState(false);
  const [confirmer, setConfirmer] = useState(false);
  const [arme, setArme] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const [fait, setFait] = useState<string | null>(null);
  const titreConfirmation = useRef<HTMLHeadingElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);

  const plafond = controlerPlafond(saisie, vie.plafond);
  const couper = vie.bulles;

  useEffect(() => {
    if (confirmer) titreConfirmation.current?.focus();
  }, [confirmer]);

  const envoyer = async (fn: string, args: Record<string, unknown>, succes: string): Promise<boolean> => {
    setEnvoi(true);
    setRefus(null);
    setFait(null);
    try {
      const next = lireVieDuVillage(await call<unknown>(fn, args));
      if (next === null) {
        setRefus("La réponse du serveur est illisible : actualisez pour voir les réglages en vigueur.");
        return false;
      }
      onChange(next);
      setFait(succes);
      return true;
    } catch (e) {
      setRefus(messageOf(e));
      return false;
    } finally {
      setEnvoi(false);
    }
  };

  const verifier = () => {
    setVerifie(true);
    setFait(null);
    setRefus(null);
    if (plafond.valeur !== null && plafond.change) setConfirmer(true);
  };

  const changerLePlafond = async () => {
    if (plafond.valeur === null) return;
    const valeur = plafond.valeur;
    const ok = await envoyer("regler_plafond_du_village", { p_plafond: valeur }, `Plafond changé : ${dollars(valeur)} par mois.`);
    setConfirmer(false);
    if (ok) {
      setSaisie(plafondEnSaisie(valeur));
      setVerifie(false);
    }
    bouton.current?.focus();
  };

  const basculer = async () => {
    setArme(false);
    await envoyer("regler_bulles_du_village", { p_actives: !couper }, couper ? "Bulles coupées." : "Bulles remises.");
  };

  return (
    <div class="mt-5 grid gap-5" data-testid="village-bulles-reglages">
      <div class="grid gap-3 border-t border-line pt-4">
        <h4 class="text-lg">Le plafond du mois</h4>
        <div class="flex flex-wrap items-end gap-3">
          <div>
            <label for="village-plafond" class="block text-sm font-semibold">
              Plafond, en dollars
            </label>
            <input
              id="village-plafond"
              class="field tnum mt-1 !w-32"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellcheck={false}
              value={saisie}
              disabled={envoi}
              aria-invalid={verifie && plafond.probleme ? "true" : undefined}
              aria-describedby={verifie && plafond.probleme ? "village-plafond-probleme" : undefined}
              onInput={(e) => {
                setSaisie(e.currentTarget.value);
                setConfirmer(false);
                setFait(null);
                setRefus(null);
              }}
            />
          </div>
          <button ref={bouton} type="button" class="btn btn-primary" disabled={envoi || (plafond.valeur !== null && !plafond.change)} onClick={verifier} data-testid="village-plafond-verifier">
            Changer le plafond
          </button>
        </div>
        {verifie && plafond.probleme && (
          <p id="village-plafond-probleme" class="form-problem" role="alert">
            {plafond.probleme}
          </p>
        )}
        {confirmer && plafond.valeur !== null && (
          <div class="grid gap-3" data-testid="village-plafond-confirmation">
            <h5 ref={titreConfirmation} tabIndex={-1} class="font-semibold">
              À enregistrer
            </h5>
            {confirmationDuPlafond(vie, plafond.valeur).map((l, i) => (
              <p key={l} class={i === 0 ? "tnum" : "tnum font-semibold text-warn"}>
                {l}
              </p>
            ))}
            <div class="flex flex-wrap gap-3">
              <button type="button" class="btn btn-primary" disabled={envoi} onClick={() => void changerLePlafond()} data-testid="village-plafond-confirmer">
                Confirmer : changer le plafond
              </button>
              <button
                type="button"
                class="btn btn-ghost"
                disabled={envoi}
                onClick={() => {
                  setConfirmer(false);
                  bouton.current?.focus();
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Couper les bulles : un geste à part, sous un filet, au second clic seulement, comme « Débrancher le salon ». */}
      <div class="mt-4 grid gap-2 border-t border-line pt-4" data-testid="village-bulles-interrupteur">
        <div>
          <button
            type="button"
            class="btn btn-ghost"
            disabled={envoi}
            aria-describedby={arme ? "village-bulles-note" : undefined}
            onClick={() => (arme ? void basculer() : setArme(true))}
            onBlur={() => setArme(false)}
            data-testid="village-bulles-bouton"
          >
            {arme ? (couper ? "Confirmer : couper les bulles" : "Confirmer : remettre les bulles") : couper ? "Couper les bulles" : "Remettre les bulles"}
          </button>
        </div>
        {arme && (
          <p id="village-bulles-note" class="text-sm text-warn">
            {confirmationDesBulles(couper)}
          </p>
        )}
      </div>

      {(refus || fait) && (
        <div>
          <Problem message={refus} />
          {fait && <Success message={fait} />}
        </div>
      )}
    </div>
  );
}
