<!-- Partie de docs/DIRECTION.md : « La commande /fiche ». Sommaire et ordre des parties : docs/DIRECTION.md. -->

## La commande /fiche

Choisie par le pilote le 12 novembre 2026, parmi des idées pour les membres : dans le serveur Discord du clan, `/fiche` suivi d'un pseudo montre à tout le salon la carte d'un membre, l'image d'aperçu de sa fiche (`src/lib/fiche-image.ts`), avec un bouton vers sa page. C'est ce que donne déjà le lien de la fiche collé dans un salon, en plus court.

**Installée le 12 novembre 2026** : le pilote a remis la fonction en ligne (`/etat` disait `"fiches":true` à 20 h 55, heure de Paris), créé la commande et l'a essayée (« ça marche »).

**Pour le joueur :** il tape `/fiche`, puis le début d'un pseudo. Discord propose jusqu'à 25 membres qui ont une fiche : ceux dont le pseudo commence par ce qui est tapé, puis ceux qui le contiennent, sans compter les accents ni les majuscules. Il en choisit un et envoie : tout le salon voit l'image. Un pseudo tapé en entier marche aussi, même sans le nombre que le jeu ajoute à certains noms, gratuits ou déjà pris par un abonné (« Brennos » pour « Brennos.1234 ») ; si deux pseudos conviennent, la réponse demande de choisir. Un nom inconnu reçoit une réponse que lui seul voit : un membre sans pseudo public n'a pas de fiche, et le lien de la fenêtre d'OpenFront où il choisit son pseudo (`src/lib/pseudo-openfront.ts`).

**Comment ça marche :**

- La même fonction serveur que `/code`, `code-discord`, à la même adresse des interactions : signature, heure et serveur du clan se vérifient de la même façon. Pendant la saisie, Discord lui demande des propositions (interaction de type 4), puis lui envoie la commande (type 2).
- Elle lit les fiches dans `/fiches.json`, que le site publie avec ses pages (`src/pages/fiches.json.ts`, `src/lib/fiches-discord.ts`) : pour chaque membre avec pseudo, son identifiant public, son pseudo, la description de l'image de sa fiche et la version de cette image ; depuis le 15 novembre 2026, pour les insignes de /gaulois, le niveau du compte (`niveau`) et la flamme de série (`flamme` : victoires, « au moins », dates, or, heure du relevé) tels que la fiche les montre. Rien de plus que les pages `/membres/:id`, et aucun membre sans pseudo. Elle garde ce fichier cinq minutes ; si le site ne répond plus, la dernière lecture sert encore deux heures, pas plus : un membre parti, devenu anonyme ou dont le compte est supprimé ne reste pas proposé plus longtemps. Elle l'attend une seconde et demie au plus, Discord voulant une réponse en trois, et après un échec ne redemande rien pendant trente secondes, pour que chaque frappe n'attende pas.
- Le message est l'image en grand (message « Components V2 », drapeau 32768), celle que le site dessine à sa construction, avec sa description pour les lecteurs d'écran, et un bouton vers la page. L'adresse de l'image porte une version tirée de son fichier, que `/fiches.json` donne pour chaque fiche (`v`, `ficheImageVersion` de `src/lib/fiches-discord.ts`) : quand l'image change, chiffres ou style, Discord ne montre pas celle qu'il a gardée. Avant le 12 novembre 2026 au soir, elle ne portait que l'heure de la liste des membres, relue une fois par jour : après le passage des images au style du site, /moi montrait encore l'ancienne. Une fonction d'avant ce changement le fait encore, et une fiche sans `v` aussi. Les pages des membres donnent la même version à leur image d'aperçu. Sans image, une ligne de texte et le bouton. Personne ne peut être mentionné, et ce que le joueur tape n'est redit qu'échappé, dans une réponse qu'il est seul à voir, dont les adresses ne se déplient pas en cartes d'aperçu.
- Elle ne lit pas la base et n'écrit rien. `GET …/code-discord/etat` dit aussi `"fiches":true` quand elle lit le fichier du site.

**Installer**, une fois, par le pilote (comptes Supabase et Discord), après la mise en ligne du site qui publie `/fiches.json` :

1. Remettre la fonction en ligne, comme à l'étape 2 de « Se connecter avec un code », depuis un dossier du projet à jour : `npx supabase functions deploy code-discord --remote=zxavwcupauheheqxfdez --use-api --no-verify-jwt --yes`.
2. Ouvrir `https://zxavwcupauheheqxfdez.supabase.co/functions/v1/code-discord/etat` : il doit dire `"fiches":true`, en plus des trois autres.
3. Créer la commande, comme à l'étape 6 : **Reset Token** puis **Copy**, `npm run discord:commande`, qui crée ou remet à jour /code et /fiche, chacune à part, puis **Reset Token** de nouveau, sans copier. Depuis le panneau des rôles, plus de second Reset Token : suivre les étapes 3 à 8 de « Les rôles sur Discord ».
4. Essayer : `/fiche` dans un salon, le début d'un pseudo, un choix, l'envoi.

L'encadrement choisit où elle peut servir dans **Paramètres du serveur → Intégrations**, comme /code.

