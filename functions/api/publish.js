import { currentUser, errorResponse, jsonResponse, optionsResponse } from '../../_shared/auth.js';

const DOMAIN = 'jungle.net';
const ALLOWED_EXTENSIONS = new Set(['.html', '.htm', '.css', '.js', '.mjs', '.cjs']);
const MAX_FILES = 120;
const MAX_FILE_BYTES = 300000;
const MAX_TOTAL_BYTES = 1000000;

function cleanSlug(value) {
    return String(value || '').trim().toLowerCase();
}

function validateSnapshot(body) {
    const slug = cleanSlug(body?.slug);
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) throw new Error('Use a project name with letters, numbers, and hyphens.');
    if (new Set(['www', 'api', 'app', 'admin', 'docs', 'mail', 'support', 'jungle']).has(slug)) throw new Error('That project name is reserved.');
    const visibility = body?.visibility === 'private' ? 'private' : 'public';
    const sourceFiles = body?.files && typeof body.files === 'object' && !Array.isArray(body.files) ? body.files : {};
    const entries = Object.entries(sourceFiles);
    if (!entries.length) throw new Error('Add an HTML, CSS, or JavaScript file before publishing.');
    if (entries.length > MAX_FILES) throw new Error(`Projects can contain at most ${MAX_FILES} hosted files.`);
    const files = {};
    let totalBytes = 0;
    for (const [rawPath, rawCode] of entries) {
        const path = String(rawPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
        const extension = path.slice(path.lastIndexOf('.')).toLowerCase();
        if (!path || path.includes('..') || path.startsWith('.') || !ALLOWED_EXTENSIONS.has(extension)) throw new Error(`Hosting only supports HTML, CSS, and JavaScript files. '${path}' cannot be deployed.`);
        const code = String(rawCode ?? '');
        const bytes = new TextEncoder().encode(code).byteLength;
        if (bytes > MAX_FILE_BYTES) throw new Error(`'${path}' is too large to publish.`);
        totalBytes += bytes;
        if (totalBytes > MAX_TOTAL_BYTES) throw new Error('This project is too large for the free publishing tier.');
        files[path] = code;
    }
    return { schemaVersion: 1, slug, name: String(body?.name || slug).slice(0, 120), visibility, lang: String(body?.lang || ''), folders: Array.isArray(body?.folders) ? body.folders.slice(0, MAX_FILES) : [], files, publishedAt: new Date().toISOString() };
}

export async function onRequestOptions({ request }) {
    return optionsResponse(request);
}

export async function onRequestPost({ request, env }) {
    if (!env.JUNGLE_PROJECTS) return errorResponse(request, 'Cloud publishing is not configured. Add the Jungle Projects KV binding.', 503);
    let body;
    try { body = await request.json(); } catch (_) { return errorResponse(request, 'Send the project snapshot as JSON.'); }
    let snapshot;
    try { snapshot = validateSnapshot(body); } catch (error) { return errorResponse(request, error.message || 'This project cannot be hosted.'); }
    const user = await currentUser(request, env);
    if (snapshot.visibility === 'private' && !user) return errorResponse(request, 'Sign in before publishing a private project.', 401);
    const key = snapshot.visibility === 'private' ? `project:${user.id}:${snapshot.slug}` : `project:${snapshot.slug}`;
    const existingRaw = await env.JUNGLE_PROJECTS.get(key);
    if (existingRaw && snapshot.visibility === 'public' && !user) return errorResponse(request, 'That public project name is already in use.', 409);
    snapshot.ownerId = user?.id || null;
    await env.JUNGLE_PROJECTS.put(key, JSON.stringify(snapshot));
    return jsonResponse(request, { ok: true, url: `https://${snapshot.slug}.${DOMAIN}`, publicUrl: `https://${snapshot.slug}.${DOMAIN}`, visibility: snapshot.visibility });
}
