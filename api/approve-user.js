import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';

const SUPABASE_URL = 'https://asuccniyofzvwgooxjah.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  const { user_id, token } = req.query;
  if (!user_id || !token) return res.status(400).send(page('Lien invalide', 'Paramètre manquant.', false));

  const secret = process.env.APPROVE_SECRET;
  if (!secret) return res.status(500).send(page('Erreur serveur', 'APPROVE_SECRET non configuré.', false));

  // Verifier le token HMAC
  const expected = createHmac('sha256', secret).update(user_id).digest('hex');
  if (token !== expected) return res.status(403).send(page('Lien invalide', 'Token de vérification incorrect.', false));

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(500).send(page('Erreur serveur', 'SUPABASE_SERVICE_ROLE_KEY non configurée.', false));

  const sb = createClient(SUPABASE_URL, serviceKey);

  // Verifier que l'utilisateur existe
  const { data: access, error: fetchErr } = await sb
    .from('crm_access')
    .select('id, approved')
    .eq('user_id', user_id)
    .maybeSingle();

  if (fetchErr || !access) return res.status(404).send(page('Utilisateur introuvable', 'Aucune demande trouvée pour cet utilisateur.', false));
  if (access.approved) return res.status(200).send(page('Déjà approuvé', 'Cet utilisateur a déjà accès au CRM.', true));

  // Approuver
  const { error: updateErr } = await sb
    .from('crm_access')
    .update({ approved: true })
    .eq('user_id', user_id);

  if (updateErr) return res.status(500).send(page('Erreur', 'Impossible d\'approuver : ' + updateErr.message, false));

  // Recuperer l'email pour affichage
  const { data: { user } } = await sb.auth.admin.getUserById(user_id);
  const email = user?.email || user_id;

  return res.status(200).send(page('Accès approuvé !', `${email} peut maintenant se connecter au CRM.`, true));
}

function page(title, message, success) {
  const color = success ? '#4CAF50' : '#D94040';
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — CRM Akuiteo</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#1A1A1A;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh}
.card{background:#fff;color:#1A1A1A;border-radius:16px;padding:40px;max-width:420px;width:90%;text-align:center;border-top:4px solid ${color};box-shadow:0 16px 64px rgba(0,0,0,0.4)}
h1{font-size:1.5rem;margin-bottom:12px}p{font-size:14px;color:#666;line-height:1.5}
.icon{font-size:48px;margin-bottom:16px}</style></head>
<body><div class="card"><div class="icon">${success ? '&#10003;' : '&#10007;'}</div><h1>${title}</h1><p>${message}</p></div></body></html>`;
}
