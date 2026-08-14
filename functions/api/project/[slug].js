import { currentUser, errorResponse, jsonResponse, optionsResponse } from '../../../_shared/auth.js';

const DOMAIN = 'jungle.net';

function cleanSlug(value) {
    return String(value || '').trim().toLowerCase();
}

export async function onRequestOptions({ request }) {
    return optionsResponse(request);
}

export async function onRequestGet({ request, env, params }) {
    if (!env.JUNGLE_PROJECTS) return errorResponse(request, 'Cloud publishing is not configured.', 503);
    const slug = cleanSlug(params?.slug);
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) return errorResponse(request, 'Invalid project name.', 400);
    const user = await currentUser(request, env);
    let raw = user ? await env.JUNGLE_PROJECTS.get(`project:${user.id}:${slug}`) : null;
    let snapshot = null;
    try { snapshot = raw ? JSON.parse(raw) : null; } catch (_) { return errorResponse(request, 'The published project record is invalid.', 500); }
    if (!snapshot) {
        raw = await env.JUNGLE_PROJECTS.get(`project:${slug}`);
        try { snapshot = raw ? JSON.parse(raw) : null; } catch (_) { return errorResponse(request, 'The published project record is invalid.', 500); }
    }
    if (!snapshot) return errorResponse(request, 'Published project not found.', 404);
    if (snapshot.visibility === 'private' && snapshot.ownerId !== user?.id) return errorResponse(request, 'This project is private. Sign in with the owning account.', 403);
    const { ownerId, ...safeSnapshot } = snapshot;
    return jsonResponse(request, { ...safeSnapshot, url: `https://${slug}.${DOMAIN}` });
}
