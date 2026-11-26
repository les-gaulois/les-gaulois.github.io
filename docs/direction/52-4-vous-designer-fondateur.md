<!-- Partie de docs/DIRECTION.md : « Installer la connexion » › « 4. Vous désigner fondateur ». Sommaire et ordre des parties : docs/DIRECTION.md. -->

### 4. Vous désigner fondateur

Connectez-vous une fois sur le site avec Discord, une fois l'étape 5 faite.

**Faites d'abord votre demande :** dans `/compte`, collez le lien de votre profil dans « Votre lien OpenFront ». Un compte déjà validé ne peut plus en faire : il resterait « Gaulois n° … », sans lien avec son joueur OpenFront.

Puis, dans l'éditeur SQL de Supabase, avec **votre identifiant Discord** (mode développeur de Discord, clic droit sur votre nom, « Copier l'identifiant ») :

```sql
select public.bootstrap_founder('VOTRE_IDENTIFIANT_DISCORD');
```

Cette fonction ne marche qu'une fois, et personne ne peut l'appeler depuis le site.

Enfin, dans la Direction, partie **Demandes** (`/direction#demandes`), validez votre propre demande : votre pseudo OpenFront devient votre nom sur le site.

