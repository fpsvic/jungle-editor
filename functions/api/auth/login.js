import { createSession, errorResponse, jsonResponse, normalizeEmail, optionsResponse, verifyPassword } from '../../../_shared/auth.js';

export async function onRequestOptions({ request }) {
    return optionsResponse(request);
}

export async function onRequestPost({ request, env }) {
    if (!env.JUNGLE_USERS || !env.JUNGLE_SESSIONS) return errorResponse(request, 'Cloud auth is not configured. Add the Jungle Users and Jungle Sessions KV bindings.', 503);
    let body;
    try { body = await request.json(); } catch (_) { return errorResponse(request, 'Send a JSON body with email and password.'); }
    const email = normalizeEmail(body?.email);
    const password = String(body?.password || '');
    const raw = await env.JUNGLE_USERS.get(`user:${email}`);
    if (!raw) return errorResponse(request, 'Email or password is incorrect.', 401);
    let record;
    try { record = JSON.parse(raw); } catch (_) { return errorResponse(request, 'The account record is invalid.', 500); }
    if (!(await verifyPassword(password, record.password))) return errorResponse(request, 'Email or password is incorrect.', 401);
    const token = await createSession(env, record.user);
    return jsonResponse(request, { token, user: record.user });
}
