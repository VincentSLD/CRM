# Connexion SSO Microsoft (Entra ID / Azure AD)

Le bouton « Se connecter avec Microsoft » est déjà dans l'application
(`signInWithMicrosoft()` → `sb.auth.signInWithOAuth({ provider: 'azure' })`).
Pour qu'il fonctionne, il reste **2 configurations** à faire (une fois).

## 1. Microsoft Entra ID (Azure AD) — par un admin du locataire (portail en français)

1. Portail Microsoft Entra (entra.microsoft.com) ou Azure → **Inscriptions d'applications**
   (*App registrations*) → **Nouvelle inscription** (*New registration*).
2. **Types de comptes pris en charge** : cocher
   **« Comptes dans cet annuaire d'organisation uniquement »**
   (mono-locataire → accès restreint à votre administration).
3. **URI de redirection** (*Redirect URI*) → plateforme **Web** :
   `https://asuccniyofzvwgooxjah.supabase.co/auth/v1/callback`
   puis **S'inscrire**.
4. Sur la page **Vue d'ensemble** (*Overview*), noter :
   - **ID d'application (client)** (*Application (client) ID*)
   - **ID de l'annuaire (locataire)** (*Directory (tenant) ID*)
5. Menu **Certificats et secrets** (*Certificates & secrets*) → onglet **Secrets client**
   → **Nouveau secret client** → noter la **Valeur** (*Value*, pas l'ID secret) —
   elle n'est visible qu'une fois.
6. Menu **Autorisations d'API** (*API permissions*) → **Ajouter une autorisation**
   → **Microsoft Graph** → **Autorisations déléguées** : cocher `openid`, `email`, `profile`
   → puis **Accorder le consentement administrateur pour <votre organisation>**.

## 2. Supabase — Dashboard du projet (interface en anglais)

1. **Authentication → Providers → Azure** → **Enable**.
2. Renseigner :
   - **Client ID** = Application (client) ID
   - **Secret** = la Value du client secret
   - **Azure Tenant URL** = `https://login.microsoftonline.com/<DIRECTORY_TENANT_ID>`
3. **Authentication → URL Configuration** → ajouter l'URL de l'app (Vercel) dans
   **Redirect URLs** (ex. `https://crm-nine-livid.vercel.app`) et en **Site URL**.

## Comportement

- Au clic, l'utilisateur est redirigé vers Microsoft, puis revient connecté.
- L'`init()` de l'app récupère la session, crée/valide la ligne `crm_access`
  (approved) et ouvre le CRM.
- La restriction d'accès repose sur : **app single-tenant Azure** (votre annuaire)
  + table **`crm_access`**. (Pas de filtre par domaine email côté app.)
- La connexion **email / mot de passe** reste disponible en parallèle.

## Pour passer en « Microsoft uniquement » (plus tard)

Masquer le formulaire email/mot de passe (`#loginFormFields`, `#loginBtn`,
`#forgotPasswordLink`, `.login-toggle`) et ne garder que le bouton Microsoft.
