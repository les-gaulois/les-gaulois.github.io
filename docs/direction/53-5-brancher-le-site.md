<!-- Partie de docs/DIRECTION.md : « Installer la connexion » › « 5. Brancher le site ». Sommaire et ordre des parties : docs/DIRECTION.md. -->

### 5. Brancher le site

Sur GitHub, **Settings → Secrets and variables → Actions**.

| Onglet | Nom | Valeur |
|---|---|---|
| Variables | `SUPABASE_URL` | L'adresse du projet |
| Variables | `SUPABASE_PUBLISHABLE_KEY` | La clé `sb_publishable_…` |
| Secrets | `SUPABASE_SECRET_KEY` | La clé `sb_secret_…` |
| Secrets, facultatif | `DISCORD_WEBHOOK_ENCADREMENT` | En secours seulement : le lien du salon de l'encadrement se règle dans la Direction. Voir « Les salons du robot sur Discord » |
| Secrets, facultatif | `SAUVEGARDE_CLE` | La phrase de passe de la sauvegarde : voir « La sauvegarde chiffrée » |

Relancez ensuite **Données et site** dans l'onglet **Actions**. Le bouton « Se connecter » apparaît dans l'en-tête.

