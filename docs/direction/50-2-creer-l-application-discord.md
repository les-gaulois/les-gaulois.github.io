<!-- Partie de docs/DIRECTION.md : « Installer la connexion » › « 2. Créer l'application Discord ». Sommaire et ordre des parties : docs/DIRECTION.md. -->

### 2. Créer l'application Discord

Sur le [portail développeur de Discord](https://discord.com/developers/applications) : **New Application**, puis **OAuth2**.

- Dans **Redirects**, ajoutez `https://<votre-projet>.supabase.co/auth/v1/callback`, puis cliquez sur **Save Changes**. Sinon, Discord répond « redirect_uri OAuth2 non valide » à la connexion.
- Copiez le **Client ID** et le **Client Secret**.

Dans Supabase, **Authentication → Providers → Discord** : activez-le et collez ces deux valeurs. Le secret reste là, jamais dans le dépôt.

Toujours dans Supabase, **Authentication → URL Configuration** :

- **Site URL :** `https://les-gaulois.github.io/`
- **Redirect URLs :** ajoutez `https://les-gaulois.github.io/compte`, `https://les-gaulois.github.io/admin` et `https://les-gaulois.github.io/direction`

Dans **Authentication → Providers → Email**, coupez l'inscription par e-mail : le site ne s'en sert pas.

