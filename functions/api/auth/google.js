import { createSession, errorResponse, jsonResponse, normalizeEmail, optionsResponse, randomToken } from '../../../_shared/auth.js';

function redirectUri(request) {
    const url = new URL(request.url);
    return `${url.origin}/api/auth/google`;
}

function redirectPage(request, token) {
    const url = new URL('/', request.url);
    url.searchParams.set('auth_token', token);
    return Response.redirect(url.toString(), 302);
}

export async function onRequestOptions({ request }) {
    return optionsResponse(request);
}

export async function onRequestGet({ request, env }) {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.JUNGLE_USERS || !env.JUNGLE_SESSIONS) return errorResponse(request, 'Google OAuth is not configured on this deployment.', 503);
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code) {
        const nextState = randomToken();
        await env.JUNGLE_SESSIONS.put(`oauth:${nextState}`, JSON.stringify({ createdAt: Date.now() }), { expirationTtl: 600 });
        const params = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(request), response_type: 'code', scope: 'openid email profile', state: nextState, access_type: 'online', prompt: 'select_account' });
        return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
    }
    if (!state || !(await env.JUNGLE_SESSIONS.get(`oauth:${state}`))) return errorResponse(request, 'The Google sign-in session expired. Try again.', 400);
    await env.JUNGLE_SESSIONS.delete(`oauth:${state}`);
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri(request), grant_type: 'authorization_code' }) });
    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenData.access_token) return errorResponse(request, 'Google could not complete sign in.', 401);
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const profile = await profileResponse.json().catch(() => ({}));
    const email = normalizeEmail(profile.email);
    if (!profileResponse.ok || !email) return errorResponse(request, 'Google did not return an email address.', 401);
    const key = `user:${email}`;
    let userRecord = await env.JUNGLE_USERS.get(key, 'json');
    if (!userRecord) {
        userRecord = { user: { id: crypto.randomUUID(), email, name: String(profile.name || ''), avatar: String(profile.picture || ''), createdAt: new Date().toISOString(), provider: 'google' } };
        await env.JUNGLE_USERS.put(key, JSON.stringify(userRecord));
    }
    const sessionToken = await createSession(env, userRecord.user);
    return redirectPage(request, sessionToken);
}
