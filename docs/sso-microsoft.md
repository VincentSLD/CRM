# Connexion SSO Microsoft (Entra ID / Azure AD)

Le bouton « Se connecter avec Microsoft » est déjà dans l'application
(`signInWithMicrosoft()` → `sb.auth.signInWithOAuth({ provider: 'azure' })`).
Pour qu'il fonctionne, il reste **2 configurations** à faire (une fois).

## 1. Microsoft Entra ID (Azure AD) — par un admin du tenant

1. Portail Entra → **App registrations** → **New registration**.
2. **Supported account types** : « Comptes de cet annuaire organisationnel uniquement »
   (single-tenant → accès restreint à votre administration).
3. **Redirect URI** (plateforme **Web**) :
   `https://asuccniyofzvwgooxjah.supabase.co/auth/v1/callback`
4. Après création, noter :
   - **Application (client) ID**
   - **Directory (tenant) ID**
5. **Certificates & secrets** → **New client secret** → noter la **Value** (pas l'ID).
6. **API permissions** → Microsoft Graph (déléguées) : `openid`, `email`, `profile`
   (puis « Grant admin consent »).

## 2. Supabase — Dashboard du projet

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
