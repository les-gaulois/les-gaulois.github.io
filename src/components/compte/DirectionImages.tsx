import { useEffect, useRef, useState } from "preact/hooks";
import { cleanImageName, IMAGE_NAME_MAX, imageNameProblem, INVENTORY_MAX, suggestedName, type SavedImage } from "../../lib/compte/discord-images";
import { IMAGE_TYPES, imageFileProblem, type ImageType } from "../../lib/compte/discord-message";
import { errorMessage } from "../../lib/compte/errors";
import { fmtDate, fmtInt } from "../../lib/format";
import { Loading, Problem, Success, messageOf } from "./common";
import { SecondClic } from "./DirectionMessage";
import { useInventaire, type Inventaire } from "./inventaire";
import { Compteur, fileSize } from "./MessageChamps";

type Act = (action: () => Promise<unknown>, success: string) => Promise<boolean>;

/** Rend le focus à un élément qui va paraître : le formulaire ou le bouton qui avait le focus vient de disparaître. */
const focusLater = (...ids: string[]) =>
  window.requestAnimationFrame(() => {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) return el.focus();
    }
  });
/** Après un ajout, un retrait ou « Annuler » : « Choisir une image », ou le titre du formulaire si l'inventaire est plein. */
const focusAjouter = () => focusLater("di-choisir", "di-ajouter");

/** Ajouter une image : un fichier (bouton ou glisser-déposer), son nom, puis « Enregistrer dans l'inventaire ». */
function Ajouter({ inventaire, images, onDone }: { inventaire: Inventaire; images: SavedImage[]; onDone: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  // `path` : le fichier déjà déposé, si le serveur a refusé de le garder (nom pris…) ; la nouvelle tentative ne le redépose pas.
  const [file, setFile] = useState<{ blob: File; type: ImageType; src: string; path?: string } | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const full = images.length >= INVENTORY_MAX;

  // La vignette n'existe que dans cette page : son adresse est rendue quand le fichier change ou que la page se ferme.
  const src = file?.src;
  useEffect(
    () => () => {
      if (src) URL.revokeObjectURL(src);
    },
    [src],
  );

  const take = (blob: File | null | undefined) => {
    if (!blob || busy) return;
    const issue = imageFileProblem(blob);
    if (issue) return setProblem(issue);
    setProblem(null);
    setFile({ blob, type: blob.type as ImageType, src: URL.createObjectURL(blob) });
    setName(suggestedName(blob.name));
    window.requestAnimationFrame(() => {
      const el = document.getElementById("di-nom");
      if (!(el instanceof HTMLInputElement)) return;
      el.focus();
      el.select();
    });
  };

  const submit = async () => {
    if (busy || !file) return;
    const issue = full ? errorMessage("inventory_full") : imageNameProblem(name, images);
    if (issue) return setProblem(issue);
    setBusy(true);
    setProblem(null);
    try {
      let path = file.path;
      if (path === undefined) {
        const uploaded = await inventaire.upload(file.blob, IMAGE_TYPES[file.type]);
        path = uploaded;
        setFile((current) => (current?.src === file.src ? { ...current, path: uploaded } : current));
      }
      const image = await inventaire.keep(path, cleanImageName(name));
      setFile(null);
      setName("");
      focusAjouter();
      onDone(`« ${image.name} » est dans l'inventaire : choisissez-la avec le bouton « Inventaire » d'un champ d'image du message.`);
    } catch (e) {
      setProblem(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      class={`image-choix grid gap-3 ${over ? "image-choix-survol" : ""}`}
      onDragOver={(e) => {
        if (full || !e.dataTransfer?.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const dropped = e.dataTransfer?.files[0];
        if (!dropped || full) return;
        e.preventDefault();
        take(dropped);
      }}
      data-testid="direction-images-ajouter"
    >
      <div class="flex flex-wrap items-baseline justify-between gap-x-4">
        <p id="di-ajouter" class="nom-champ font-semibold" tabIndex={-1}>
          Ajouter une image
        </p>
        <p class={`tnum text-sm ${full ? "font-semibold text-warn" : "text-muted"}`}>
          {fmtInt(images.length)} / {fmtInt(INVENTORY_MAX)} images
        </p>
      </div>
      {file === null ? (
        full ? (
          <p class="text-warn">{errorMessage("inventory_full")}</p>
        ) : (
          <div>
            <button type="button" id="di-choisir" class="btn btn-ghost" aria-describedby="di-ajouter" onClick={() => input.current?.click()}>
              Choisir une image
            </button>
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              hidden
              onChange={(e) => {
                take(e.currentTarget.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
          </div>
        )
      ) : (
        // Un vrai formulaire : la touche Entrée enregistre l'image dans l'inventaire, ce qui ne publie rien.
        <form
          class="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div class="flex flex-wrap items-center gap-3">
            <img src={file.src} alt="" class="image-choix-vignette" />
            <p class="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">
              {file.blob.name} <span class="tnum text-muted">· {fileSize(file.blob.size)}</span>
            </p>
          </div>
          <div>
            <div class="flex flex-wrap items-baseline justify-between gap-x-4">
              <label for="di-nom" class="text-sm font-semibold">
                Nom dans l'inventaire
              </label>
              <Compteur id="di-nom-compte" text={name} max={IMAGE_NAME_MAX} />
            </div>
            <input id="di-nom" class="field mt-1" autoComplete="off" aria-describedby="di-nom-compte" value={name} onInput={(e) => setName(e.currentTarget.value)} />
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="submit" class="btn btn-primary" disabled={busy} data-testid="direction-images-enregistrer">
              Enregistrer dans l'inventaire
            </button>
            <button
              type="button"
              class="btn btn-ghost"
              disabled={busy}
              onClick={() => {
                setFile(null);
                setProblem(null);
                focusAjouter();
              }}
            >
              Annuler
            </button>
          </div>
          {busy && (
            <p role="status" class="text-muted">
              Enregistrement…
            </p>
          )}
        </form>
      )}
      <Problem message={problem} />
    </div>
  );
}

/** Une image de l'inventaire : en grand d'un clic, son nom, sa taille, qui l'a gardée ; la renommer, la retirer. */
function Carte({ image, images, inventaire, busy, act }: { image: SavedImage; images: SavedImage[]; inventaire: Inventaire; busy: boolean; act: Act }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(image.name);
  const [problem, setProblem] = useState<string | null>(null);
  const field = `di-renommer-${image.id}`;
  const about = [image.size !== null ? fileSize(image.size) : null, image.savedAt ? `ajoutée le ${fmtDate(image.savedAt)}${image.savedBy ? ` par ${image.savedBy}` : ""}` : null].filter(Boolean).join(" · ");

  const rename = async () => {
    const issue = imageNameProblem(name, images, image.id);
    if (issue) return setProblem(issue);
    setProblem(null);
    const clean = cleanImageName(name);
    if (!(await act(() => inventaire.rename(image.id, clean), `Image renommée : « ${clean} ».`))) return;
    setRenaming(false);
    focusLater(`${field}-bouton`);
  };

  return (
    <li class="inventaire-carte" data-testid="direction-image">
      {image.missing ? (
        <div class="inventaire-carte-image">
          <p class="p-3 text-center text-sm font-semibold text-warn">Fichier introuvable sur le serveur</p>
        </div>
      ) : (
        <a class="inventaire-carte-image" href={image.url} target="_blank" rel="noopener noreferrer">
          <img src={image.url} alt={`${image.name}, en grand dans un nouvel onglet`} loading="lazy" decoding="async" />
        </a>
      )}
      <div class="grid gap-3 p-4">
        <div>
          <p class="font-semibold [overflow-wrap:anywhere]">{image.name}</p>
          {about && <p class="tnum text-sm text-muted">{about}</p>}
        </div>
        {renaming ? (
          <form
            class="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) void rename();
            }}
          >
            <div class="flex flex-wrap items-baseline justify-between gap-x-4">
              <label for={field} class="text-sm font-semibold">
                Nouveau nom
              </label>
              <Compteur id={`${field}-compte`} text={name} max={IMAGE_NAME_MAX} />
            </div>
            <input id={field} class="field" autoComplete="off" aria-describedby={`${field}-compte`} value={name} onInput={(e) => setName(e.currentTarget.value)} />
            <div class="flex flex-wrap gap-2">
              <button type="submit" class="btn btn-ghost" disabled={busy}>
                Renommer
              </button>
              <button
                type="button"
                class="btn btn-ghost"
                disabled={busy}
                onClick={() => {
                  setRenaming(false);
                  setProblem(null);
                  focusLater(`${field}-bouton`);
                }}
              >
                Annuler
              </button>
            </div>
            <Problem message={problem} />
          </form>
        ) : (
          <div>
            <button
              type="button"
              class="btn btn-ghost"
              disabled={busy}
              id={`${field}-bouton`}
              aria-label={`Renommer « ${image.name} »`}
              onClick={() => {
                setName(image.name);
                setRenaming(true);
                window.requestAnimationFrame(() => {
                  const el = document.getElementById(field);
                  if (!(el instanceof HTMLInputElement)) return;
                  el.focus();
                  el.select();
                });
              }}
            >
              Renommer
            </button>
          </div>
        )}
        {/* Retirer de l'inventaire, à part, sous un filet, au second clic. Le fichier reste en ligne : un message envoyé le montre. */}
        <div class="border-t border-line pt-3">
          <SecondClic
            id={`direction-image-retirer-${image.id}`}
            label="Retirer de l'inventaire"
            confirm="Confirmer : retirer de l'inventaire"
            warning="L'image quitte l'inventaire. Les messages déjà envoyés l'affichent toujours."
            busy={busy}
            onConfirm={() => void act(() => inventaire.remove(image.id), `« ${image.name} » est retirée de l'inventaire.`).then((ok) => ok && focusAjouter())}
          />
        </div>
      </div>
    </li>
  );
}

/**
 * « Inventaire d'images » : les images gardées pour les messages Discord (le logo du clan, une bannière…), pour les
 * admins et le fondateur. Une image s'ajoute ici, ou depuis un champ d'image du message ; elle se choisit ensuite dans
 * n'importe quel champ d'image, par le bouton « Inventaire ». Le serveur vérifie et refait tout.
 */
export default function DirectionImages() {
  const inventaire = useInventaire();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => inventaire?.ensure(), []);

  if (!inventaire) return null;
  const { images } = inventaire;
  if (images === null) return inventaire.problem ? <Problem message={inventaire.problem} onRetry={() => void inventaire.reload()} /> : <Loading />;

  const act: Act = async (action, success) => {
    setBusy(true);
    setProblem(null);
    setDone(null);
    try {
      await action();
      setDone(success);
      return true;
    } catch (e) {
      setProblem(messageOf(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="grid gap-6" data-testid="direction-images">
      <Ajouter
        inventaire={inventaire}
        images={images}
        onDone={(message) => {
          setProblem(null);
          setDone(message);
        }}
      />
      {inventaire.problem && <Problem message={inventaire.problem} onRetry={() => void inventaire.reload()} />}
      <Problem message={problem} />
      {done && <Success message={done} />}
      {images.length > 0 && (
        <ul class="inventaire-grille">
          {images.map((image) => (
            <Carte key={image.id} image={image} images={images} inventaire={inventaire} busy={busy} act={act} />
          ))}
        </ul>
      )}
    </div>
  );
}
