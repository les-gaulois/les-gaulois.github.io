<!-- Partie de docs/DIRECTION.md : « Après avoir créé les comptes : le contrôle ». Sommaire et ordre des parties : docs/DIRECTION.md. -->

## Après avoir créé les comptes : le contrôle

En plus des étapes d'installation ci-dessous, il faut :

- **Ajouter la redirection** `https://les-gaulois.github.io/direction` dans **Authentication → URL Configuration → Redirect URLs**.
- **Couper l'inscription par e-mail** dans **Authentication → Providers → Email**. Le site ne s'en sert pas.

Puis lancez le contrôle. Il n'écrit rien et n'affiche aucune clé. Sous PowerShell, renseignez d'abord les valeurs dans le terminal, sans les enregistrer dans un fichier du dépôt :

```powershell
$env:SUPABASE_URL = "https://votre-projet.supabase.co"
$env:SUPABASE_PUBLISHABLE_KEY = "sb_publishable_..."
$env:SUPABASE_SECRET_KEY = "sb_secret_..."
```

```bash
npm run verifier:ligne
```

Il vérifie que le projet répond, que Discord est activé, que l'e-mail est coupé, que le schéma est installé, qu'un visiteur ne peut ni se désigner fondateur ni lire les tables privées, et, avec la clé secrète, que le clan a un fondateur et que la liste des membres a été relue.

**Ce contrôle ne remplace pas un essai réel.** Il reste à faire, avec de vrais comptes :

1. Se connecter avec Discord : le vrai nom Discord doit apparaître dans `/compte`.
2. Faire sa demande dans `/compte`, se désigner fondateur, ouvrir `/direction` et y valider sa propre demande, partie Demandes (détail à l'étape 4 de l'installation).
3. Publier une annonce, puis la voir sur l'accueil dans une fenêtre privée.
4. Connecter un second compte, faire une demande et la valider.

