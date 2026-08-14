const encoder = new TextEncoder();

function base64Url(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

export function jsonResponse(request, data, status = 200, extraHeaders = {}) {
    const origin = request.headers.get('Origin');
    const headers = new Headers({
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        ...extraHeaders,
    });
    if (origin) { headers.set('Access-Control-Allow-Origin', origin); headers.set('Vary', 'Origin'); }
    else headers.set('Access-Control-Allow-Origin', '*');
    return new Response(JSON.stringify(data), { status, headers });
}

export function optionsResponse(request) {
    return jsonResponse(request, { ok: true });
}

export function errorResponse(request, message, status = 400) {
    return jsonResponse(request, { message }, status);
}

async function derivePasswordHash(password, salt) {
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 120000, hash: 'SHA-256' }, key, 256);
    return base64Url(new Uint8Array(bits));
}

export async function makePasswordRecord(password) {
    const salt = base64Url(crypto.getRandomValues(new Uint8Array(16)));
    return { salt, hash: await derivePasswordHash(password, salt), algorithm: 'PBKDF2-SHA-256', iterations: 120000 };
}

export async function verifyPassword(password, record) {
    if (!record?.salt || !record?.hash) return false;
    const hash = await derivePasswordHash(password, record.salt);
    return hash === record.hash;
}

export function randomToken() {
    return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function createSession(env, user) {
    if (!env.JUNGLE_SESSIONS) throw new Error('JUNGLE_SESSIONS KV binding is not configured.');
    const token = randomToken();
    await env.JUNGLE_SESSIONS.put(`session:${token}`, JSON.stringify({ user, createdAt: new Date().toISOString() }), { expirationTtl: 60 * 60 * 24 * 30 });
    return token;
}

export async function currentUser(request, env) {
    const header = request.headers.get('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token || !env.JUNGLE_SESSIONS) return null;
    const raw = await env.JUNGLE_SESSIONS.get(`session:${token}`);
    if (!raw) return null;
    try { return JSON.parse(raw).user || null; } catch (_) { return null; }
}
