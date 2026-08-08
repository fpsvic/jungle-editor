// Project publishing flow.
//
// Set window.JUNGLE_PUBLISH_API to a POST endpoint for durable cloud hosting.
// Until that service is configured, the generated link points back to the
// deployed editor and carries a compact URL snapshot. A static GitHub Pages
// site cannot reserve subdomains or provide durable storage by itself.
(function initJunglePublishing() {
    const publishDomain = 'jungle.net';
    const publishDomainSuffix = `.${publishDomain}`;
    const screen = document.getElementById('publish-screen');
    const openButton = document.getElementById('publish-project-header-btn');
    const backButton = document.getElementById('publish-back-btn');
    const nameInput = document.getElementById('publish-name-input');
    const domainSuffix = document.getElementById('publish-domain-suffix') || document.querySelector('.publish-domain-suffix');
    const publicToggle = document.getElementById('publish-public-toggle');
    const currentProjectLabel = document.getElementById('publish-current-project');
    const nameHelp = document.getElementById('publish-name-help');
    const privateNote = document.getElementById('publish-private-note');
    const publishButton = document.getElementById('publish-project-btn');
    const result = document.getElementById('publish-result');
    const resultLink = document.getElementById('publish-result-link');
    const resultNote = document.getElementById('publish-result-note');
    const copyButton = document.getElementById('publish-copy-btn');
    if (!screen || !openButton || !backButton || !nameInput || !publicToggle || !publishButton) return;

    let workspaceDisplay = 'flex';

    const getProject = () => {
        try { return JungleUI.getCurrentProject?.() || null; } catch (_) { return null; }
    };

    function slugify(value) {
        return String(value || '')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 63);
    }

    function isReservedSlug(slug) {
        return new Set(['www', 'api', 'app', 'admin', 'docs', 'mail', 'support', 'jungle']).has(slug);
    }

    function projectSnapshot(project, slug, isPublic) {
        return {
            schemaVersion: 1,
            slug,
            name: String(project.name || slug),
            visibility: isPublic ? 'public' : 'private',
            lang: project.lang || '',
            folders: Array.isArray(project.folders) ? project.folders.slice() : [],
            files: Object.fromEntries(Object.entries(project.files || {}).map(([file, code]) => [file, String(code ?? '')])),
            publishedAt: new Date().toISOString(),
        };
    }

    function encodeSnapshot(snapshot) {
        const json = JSON.stringify(snapshot);
        const bytes = new TextEncoder().encode(json);
        let binary = '';
        for (let index = 0; index < bytes.length; index += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + 0x8000, bytes.length)));
        }
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }

    function decodeSnapshot(encoded) {
        try {
            const padded = String(encoded || '').replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(encoded || '').length + 3) % 4);
            const binary = atob(padded);
            const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
            return JSON.parse(new TextDecoder().decode(bytes));
        } catch (_) { return null; }
    }

    function fallbackLink(slug, snapshot) {
        return `${editorBaseUrl()}#jungle-project=${encodeSnapshot(snapshot)}`;
    }

    function editorBaseUrl() {
        const configured = String(window.JUNGLE_PUBLISH_BASE_URL || document.querySelector('meta[name="jungle-publish-base"]')?.content || '').trim();
        if (configured) return configured.split('#')[0];

        const current = window.location.href.split('#')[0];
        try {
            const currentUrl = new URL(current, window.location.href);
            // The old jungle.app host currently serves Jungle Commerce. Never
            // send a snapshot there unless a real publisher endpoint supplied
            // the URL, otherwise the snapshot is swallowed by the login page.
            if (currentUrl.hostname === 'jungle.app' || currentUrl.hostname.endsWith('.jungle.app')) {
                return 'https://fpsvic.github.io/jungle-editor/';
            }
        } catch (_) {}
        return current;
    }

    function publisherEndpoint() {
        return String(window.JUNGLE_PUBLISH_API || document.querySelector('meta[name="jungle-publish-api"]')?.content || '').trim();
    }

    function updateNamePreview() {
        const slug = slugify(nameInput.value);
        const hasPublisher = Boolean(publisherEndpoint());
        if (domainSuffix) domainSuffix.textContent = hasPublisher ? publishDomainSuffix : 'share link';
        if (!slug) {
            nameHelp.textContent = 'Use letters, numbers, and hyphens. Spaces are converted to hyphens.';
        } else if (isReservedSlug(slug)) {
            nameHelp.textContent = `${slug}${publishDomainSuffix} is reserved. Choose another name.`;
        } else if (!hasPublisher) {
            nameHelp.textContent = 'The project name is saved in the share link. It will open directly in Jungle Editor.';
        } else {
            nameHelp.textContent = `Your address will be https://${slug}${publishDomainSuffix}`;
        }
        privateNote.hidden = publicToggle.checked;
    }

    function openPublish() {
        const project = getProject();
        if (!project) {
            JungleUI.showToast('Open a project before publishing it.');
            return;
        }
        workspaceDisplay = workspaceContainer?.style.display || 'flex';
        currentProjectLabel.textContent = project.name || 'Untitled project';
        nameInput.value = slugify(project.name) || 'my-project';
        publicToggle.checked = false;
        result.hidden = true;
        resultLink.removeAttribute('href');
        resultLink.textContent = '';
        resultNote.textContent = '';
        updateNamePreview();
        document.querySelector('.tools-menu')?.classList.remove('show');
        screen.classList.add('visible');
        setTimeout(() => { nameInput.focus(); nameInput.select(); }, 20);
    }

    function closePublish() {
        screen.classList.remove('visible');
        if (workspaceContainer) workspaceContainer.style.display = workspaceDisplay || 'flex';
    }

    async function publishSnapshot(snapshot) {
        const endpoint = publisherEndpoint();
        if (endpoint) {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(snapshot),
            });
            let data = null;
            try { data = await response.json(); } catch (_) {}
            if (!response.ok) throw new Error(data?.message || `Publisher returned ${response.status}.`);
            const url = String(data?.url || data?.publicUrl || `https://${snapshot.slug}${publishDomainSuffix}`);
            return { url, note: snapshot.visibility === 'public' ? 'This project is public.' : 'This project is private to your account.' };
        }
        const url = fallbackLink(snapshot.slug, snapshot);
        return {
            url,
            note: snapshot.visibility === 'public'
                ? `Share link prepared. It opens in Jungle Editor; connect a publisher API for a durable custom ${publishDomainSuffix} address.`
                : 'Private link prepared as an unlisted snapshot. Connect a publisher API for account-only access control and durable hosting.',
        };
    }

    async function publish() {
        const project = getProject();
        if (!project) { JungleUI.showToast('Open a project before publishing it.'); return; }
        const slug = slugify(nameInput.value);
        if (slug.length < 2) { nameHelp.textContent = 'Choose a name with at least two letters or numbers.'; nameInput.focus(); return; }
        if (isReservedSlug(slug)) { nameHelp.textContent = `${slug}${publishDomainSuffix} is reserved. Choose another name.`; nameInput.focus(); return; }
        const snapshot = projectSnapshot(project, slug, publicToggle.checked);
        publishButton.disabled = true;
        publishButton.textContent = 'Publishing...';
        try {
            const published = await publishSnapshot(snapshot);
            resultLink.href = published.url;
            resultLink.textContent = published.url.split('#')[0] || published.url;
            resultNote.textContent = published.note;
            result.hidden = false;
            JungleUI.showToast('Project publish link is ready', 'success');
        } catch (error) {
            result.hidden = false;
            resultLink.removeAttribute('href');
            resultLink.textContent = 'Publishing failed';
            resultNote.textContent = error?.message || 'The publisher could not be reached. Try again.';
            JungleUI.showToast('Project could not be published', 'error');
        } finally {
            publishButton.disabled = false;
            publishButton.textContent = 'Publish';
        }
    }

    async function copyLink() {
        const url = resultLink.href;
        if (!url) return;
        try {
            await navigator.clipboard.writeText(url);
            JungleUI.showToast('Publish link copied', 'success');
        } catch (_) {
            const input = document.createElement('input');
            input.value = url;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            input.remove();
            JungleUI.showToast('Publish link copied', 'success');
        }
    }

    function openSnapshotFromHash() {
        const marker = '#jungle-project=';
        if (!window.location.hash.startsWith(marker)) return;
        const snapshot = decodeSnapshot(window.location.hash.slice(marker.length));
        if (!snapshot || !snapshot.files || !Object.keys(snapshot.files).length) return;
        const files = snapshot.files;
        const firstFile = Object.keys(files)[0];
        const sharedId = `published_${snapshot.slug || 'project'}_${Date.now()}`;
        projects.push({ id: sharedId, name: snapshot.name || snapshot.slug || 'Published project', files, folders: snapshot.folders || [], currentFile: firstFile, lang: snapshot.lang || 'Javascript' });
        JungleUI.loadProject(sharedId);
        splashScreen.style.display = 'none';
        projectsDashboard.classList.remove('show');
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        JungleUI.showToast('Opened published project snapshot', 'success');
    }

    openButton.onclick = event => { event.preventDefault(); openPublish(); };
    backButton.onclick = event => { event.preventDefault(); closePublish(); };
    nameInput.addEventListener('input', updateNamePreview);
    publicToggle.addEventListener('change', updateNamePreview);
    publishButton.onclick = publish;
    copyButton?.addEventListener('click', copyLink);
    window.addEventListener('jungle-workspace-change', () => {
        if (screen.classList.contains('visible')) {
            const project = getProject();
            if (project) { currentProjectLabel.textContent = project.name || 'Untitled project'; nameInput.value = slugify(project.name) || 'my-project'; updateNamePreview(); }
        }
    });
    window.addEventListener('load', () => setTimeout(openSnapshotFromHash, 0));
    window.JunglePublish = { open: openPublish, close: closePublish, slugify, decodeSnapshot };
})();
