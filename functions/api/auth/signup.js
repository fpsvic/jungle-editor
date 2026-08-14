import { createSession, errorResponse, jsonResponse, makePasswordRecord, normalizeEmail, optionsResponse } from '../../../_shared/auth.js';

export async function onRequestOptions({ request }) {
    return optionsResponse(request);
}

export async function onRequestPost({ request, env }) {
    if (!env.JUNGLE_USERS || !env.JUNGLE_SESSIONS) return errorResponse(request, 'Cloud auth is not configured. Add the Jungle Users and Jungle Sessions KV bindings.', 503);
    let body;
    try { body = await request.json(); } catch (_) { return errorResponse(request, 'Send a JSON body with email and password.'); }
    const email = normalizeEmail(body?.email);
    const password = String(body?.password || '');
    if (!/^\S+@\S+\.\S+$/.test(email)) return errorResponse(request, 'Enter a valid email address.');
    if (password.length < 8) return errorResponse(request, 'Use a password with at least 8 characters.');
    const key = `user:${email}`;
    if (await env.JUNGLE_USERS.get(key)) return errorResponse(request, 'An account with that email already exists.', 409);
    const user = { id: crypto.randomUUID(), email, createdAt: new Date().toISOString(), provider: 'password' };
    const passwordRecord = await makePasswordRecord(password);
    await env.JUNGLE_USERS.put(key, JSON.stringify({ user, password: passwordRecord }));
    const token = await createSession(env, user);
    return jsonResponse(request, { token, user }, 201);
}
