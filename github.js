(function initGitHubPlugin() {
    'use strict';

    const toolsMenu = document.getElementById('tools-menu');
    const toolsControl = document.querySelector('.tools-control');
    if (!toolsMenu || !toolsControl) return;

    const TOKEN_KEY = 'jungle_github_token';
    const API_ROOT = 'https://api.github.com';
    const MAX_FILES = 10000;
    const BINARY_EXTENSIONS = new Set([
        'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico', 'tif', 'tiff', 'avif', 'heic', 'psd', 'ai', 'eps', 'raw',
        'mp3', 'wav', 'flac', 'aac', 'ogg', 'oga', 'm4a', 'wma', 'opus', 'mid', 'midi', 'aiff',
        'mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv', 'm4v', 'mpg', 'mpeg', '3gp',
        'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz', 'zst', 'lz', 'lzma', 'cab', 'iso', 'img', 'dmg',
        'ttf', 'otf', 'woff', 'woff2', 'eot', 'exe', 'dll', 'so', 'dylib', 'bin', 'o', 'obj', 'a', 'lib', 'class',
        'pyc', 'pyo', 'wasm', 'node', 'msi', 'apk', 'deb', 'rpm', 'app', 'jar', 'pdf', 'doc', 'docx', 'xls', 'xlsx',
        'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'sqlite', 'sqlite3', 'db', 'db3', 'mdb', 'accdb', 'sketch', 'blend',
        'dwg', 'dat', 'pak'
    ]);

    const pluginEnabled = () => typeof JungleSettings !== 'undefined' && JungleSettings.get('githubPlugin') === true;
    const getToken = () => {
        try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; }
    };
    const showToast = (message, type = 'info') => {
        if (typeof JungleUI !== 'undefined' && JungleUI.showToast) JungleUI.showToast(message, type);
    };
    if (!pluginEnabled()) {
        try { sessionStorage.removeItem(TOKEN_KEY); } catch (_) {}
    }
    const openPluginSettings = () => {
        const opener = document.getElementById('open-settings-btn');
        opener?.click();
        setTimeout(() => document.getElementById('settings-tab-plugins')?.click(), 0);
    };

    let repositories = [];
    let requestNumber = 0;
    let selectedRepository = null;
    let importing = false;

    const githubButton = document.getElementById('connect-github-tool') || document.createElement('button');
    if (!githubButton.id) {
        githubButton.id = 'connect-github-tool';
        githubButton.type = 'button';
        githubButton.appendChild(document.createTextNode('Connect GitHub'));
        const arrow = document.createElement('span');
        arrow.textContent = '>';
        githubButton.appendChild(arrow);
        toolsMenu.appendChild(githubButton);
    }

    const repoMenu = document.getElementById('github-repo-menu') || document.createElement('div');
    if (!repoMenu.id) {
        repoMenu.id = 'github-repo-menu';
        repoMenu.className = 'github-repo-menu';
        repoMenu.setAttribute('aria-label', 'GitHub repositories');
        toolsControl.appendChild(repoMenu);
    }

    const authOverlay = document.createElement('div');
    authOverlay.className = 'github-modal-overlay';
    authOverlay.innerHTML = `
        <div class="github-modal" role="dialog" aria-modal="true" aria-labelledby="github-auth-title">
            <h3 id="github-auth-title">Connect GitHub</h3>
            <p>Paste a GitHub personal access token with read access to the repositories you want to use. The token is kept only in this browser tab.</p>
            <label for="github-token-input">GitHub token</label>
            <input id="github-token-input" type="password" autocomplete="off" placeholder="github_pat_...">
            <p class="github-modal-help"><a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener">Create a fine-grained token</a> with repository Metadata and Contents read access.</p>
            <p class="github-modal-status" id="github-auth-status" aria-live="polite"></p>
            <div class="github-modal-actions">
                <button type="button" class="github-deny" id="github-auth-cancel">Cancel</button>
                <button type="button" class="github-allow" id="github-auth-connect">Connect</button>
            </div>
        </div>`;
    document.body.appendChild(authOverlay);
    const tokenInput = authOverlay.querySelector('#github-token-input');
    const authStatus = authOverlay.querySelector('#github-auth-status');
    const authCancel = authOverlay.querySelector('#github-auth-cancel');
    const authConnect = authOverlay.querySelector('#github-auth-connect');

    const trustOverlay = document.createElement('div');
    trustOverlay.className = 'github-modal-overlay';
    trustOverlay.innerHTML = `
        <div class="github-modal" role="dialog" aria-modal="true" aria-labelledby="github-trust-title">
            <h3 id="github-trust-title">Do you trust Jungle Editor with this repo?</h3>
            <p id="github-trust-description"></p>
            <p class="github-modal-status" id="github-trust-status" aria-live="polite"></p>
            <div class="github-modal-actions">
                <button type="button" class="github-deny" id="github-trust-deny">Deny</button>
                <button type="button" class="github-allow" id="github-trust-allow">Allow</button>
            </div>
        </div>`;
    document.body.appendChild(trustOverlay);
    const trustDescription = trustOverlay.querySelector('#github-trust-description');
    const trustStatus = trustOverlay.querySelector('#github-trust-status');
    const trustDeny = trustOverlay.querySelector('#github-trust-deny');
    const trustAllow = trustOverlay.querySelector('#github-trust-allow');

    function hideRepositoryMenu() {
        repoMenu.classList.remove('show');
    }

    function closeAuth() {
        authOverlay.classList.remove('show');
        tokenInput.value = '';
        authStatus.textContent = '';
    }

    function closeTrust() {
        trustOverlay.classList.remove('show');
        selectedRepository = null;
        importing = false;
        trustAllow.disabled = false;
        trustDeny.disabled = false;
        trustAllow.textContent = 'Allow';
        trustStatus.textContent = '';
    }

    function parseNextLink(header) {
        const match = String(header || '').split(',').map(part => part.trim()).find(part => /rel="next"/.test(part));
        if (!match) return '';
        return match.match(/^<([^>]+)>/)?.[1] || '';
    }

    async function githubRequest(pathOrUrl, tokenOverride = '') {
        if (!pluginEnabled()) throw new Error('GitHub access is disabled in Settings > Plugins.');
        const token = tokenOverride || getToken();
        if (!token) throw new Error('Connect a GitHub token first.');
        const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : API_ROOT + pathOrUrl;
        const response = await fetch(url, {
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${token}`,
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.message || `GitHub request failed (${response.status})`);
            error.status = response.status;
            if (response.status === 403 && /rate limit/i.test(error.message)) error.rateLimited = true;
            throw error;
        }
        return { data, response };
    }

    function renderRepositoryMenu(state = {}) {
        repoMenu.innerHTML = '';
        const head = document.createElement('div');
        head.className = 'github-repo-head';
        const title = document.createElement('span');
        title.textContent = state.title || 'GitHub repositories';
        head.appendChild(title);
        if (getToken()) {
            const refresh = document.createElement('button');
            refresh.type = 'button';
            refresh.className = 'github-repo-action';
            refresh.textContent = 'Refresh';
            refresh.addEventListener('click', event => { event.stopPropagation(); loadRepositories(); });
            head.appendChild(refresh);
            const disconnect = document.createElement('button');
            disconnect.type = 'button';
            disconnect.className = 'github-repo-action';
            disconnect.textContent = 'Disconnect';
            disconnect.addEventListener('click', event => {
                event.stopPropagation();
                try { sessionStorage.removeItem(TOKEN_KEY); } catch (_) {}
                repositories = [];
                renderRepositoryMenu({ title: 'GitHub disconnected' });
                showToast('GitHub token removed from this browser tab.', 'info');
            });
            head.appendChild(disconnect);
        }
        repoMenu.appendChild(head);

        if (state.loading) {
            const loading = document.createElement('div');
            loading.className = 'github-repo-state';
            loading.textContent = 'Loading repositories...';
            repoMenu.appendChild(loading);
            return;
        }
        if (state.error) {
            const error = document.createElement('div');
            error.className = 'github-repo-state github-repo-error';
            error.textContent = state.error;
            repoMenu.appendChild(error);
            return;
        }
        if (!repositories.length) {
            const empty = document.createElement('div');
            empty.className = 'github-repo-state';
            empty.textContent = 'No repositories were returned for this token.';
            repoMenu.appendChild(empty);
            return;
        }
        repositories.forEach(repo => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'github-repo-item';
            const name = document.createElement('strong');
            name.textContent = repo.full_name || repo.name || 'Unnamed repository';
            const meta = document.createElement('small');
            meta.textContent = `${repo.private ? 'Private' : 'Public'} · ${repo.default_branch || 'main'}`;
            item.append(name, meta);
            item.addEventListener('click', event => {
                event.stopPropagation();
                openTrust(repo);
            });
            repoMenu.appendChild(item);
        });
    }

    async function loadRepositories() {
        if (!pluginEnabled()) {
            hideRepositoryMenu();
            showToast('Enable the GitHub plugin in Settings > Plugins first.', 'info');
            openPluginSettings();
            return;
        }
        if (!getToken()) {
            openAuth();
            return;
        }
        const thisRequest = ++requestNumber;
        renderRepositoryMenu({ loading: true });
        repoMenu.classList.add('show');
        try {
            let next = `${API_ROOT}/user/repos?per_page=100&sort=updated&affiliation=owner%2Ccollaborator%2Corganization_member`;
            const all = [];
            while (next) {
                const result = await githubRequest(next);
                if (Array.isArray(result.data)) all.push(...result.data);
                next = parseNextLink(result.response.headers.get('link'));
            }
            if (thisRequest !== requestNumber) return;
            repositories = all.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
            renderRepositoryMenu();
        } catch (error) {
            if (thisRequest !== requestNumber) return;
            const message = error.status === 401
                ? 'GitHub rejected this token. Connect again with repository read access.'
                : error.rateLimited ? 'GitHub API rate limit reached. Try again later.' : `Could not load GitHub repositories: ${error.message}`;
            renderRepositoryMenu({ error: message });
        }
    }

    function openAuth() {
        if (!pluginEnabled()) {
            showToast('Enable the GitHub plugin in Settings > Plugins first.', 'info');
            openPluginSettings();
            return;
        }
        authStatus.textContent = '';
        authConnect.disabled = false;
        authConnect.textContent = 'Connect';
        authOverlay.classList.add('show');
        setTimeout(() => tokenInput.focus(), 30);
    }

    authCancel.addEventListener('click', closeAuth);
    authOverlay.addEventListener('click', event => { if (event.target === authOverlay) closeAuth(); });
    authConnect.addEventListener('click', async () => {
        const candidate = tokenInput.value.trim();
        if (!candidate) {
            authStatus.textContent = 'Enter a GitHub token.';
            tokenInput.focus();
            return;
        }
        authConnect.disabled = true;
        authStatus.textContent = 'Checking token...';
        try {
            const result = await githubRequest('/user', candidate);
            if (!result.data || !result.data.login) throw new Error('GitHub returned no user for this token.');
            if (!pluginEnabled()) throw new Error('GitHub access was disabled in Settings > Plugins.');
            try { sessionStorage.setItem(TOKEN_KEY, candidate); } catch (_) {}
            closeAuth();
            showToast(`Connected to GitHub as ${result.data.login}.`, 'success');
            repoMenu.classList.add('show');
            await loadRepositories();
        } catch (error) {
            authStatus.textContent = error.status === 401 ? 'GitHub rejected this token.' : error.message;
            authConnect.disabled = false;
        }
    });
    tokenInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') authConnect.click();
        if (event.key === 'Escape') closeAuth();
    });

    function safeRepoPath(path) {
        const value = String(path || '').replace(/\\/g, '/');
        return value && !value.startsWith('/') && !value.split('/').some(part => !part || part === '.' || part === '..');
    }

    function addParentFolders(path, folders) {
        const parts = String(path).split('/');
        parts.pop();
        let current = '';
        parts.forEach(part => {
            current = current ? `${current}/${part}` : part;
            folders.add(current);
        });
    }

    function addFolderPath(path, folders) {
        if (!safeRepoPath(path)) return;
        const parts = String(path).split('/');
        let current = '';
        parts.forEach(part => {
            current = current ? `${current}/${part}` : part;
            folders.add(current);
        });
    }

    function isTextPath(path) {
        const base = String(path).split('/').pop() || '';
        const dot = base.lastIndexOf('.');
        const extension = dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
        return !BINARY_EXTENSIONS.has(extension);
    }

    function decodeBase64(value) {
        const binary = atob(String(value || '').replace(/\s/g, ''));
        const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    }

    function repoApiPath(repo, suffix) {
        const owner = repo.owner?.login || String(repo.full_name || '').split('/')[0];
        const name = repo.name || String(repo.full_name || '').split('/')[1];
        return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}${suffix}`;
    }

    async function listContentsRecursively(repo, branch, path, output) {
        const encodedPath = path ? '/' + path.split('/').map(encodeURIComponent).join('/') : '';
        const result = await githubRequest(repoApiPath(repo, `/contents${encodedPath}?ref=${encodeURIComponent(branch)}`));
        const entries = Array.isArray(result.data) ? result.data : [result.data];
        for (const entry of entries) {
            if (!entry || !safeRepoPath(entry.path)) continue;
            if (entry.type === 'dir') {
                addFolderPath(entry.path, output.folders);
                await listContentsRecursively(repo, branch, entry.path, output);
            } else if (entry.type === 'file' && entry.sha) {
                addParentFolders(entry.path, output.folders);
                output.blobs.push({ path: entry.path, sha: entry.sha, size: Number(entry.size) || 0 });
            }
        }
    }

    async function repositoryTree(repo, branch) {
        const result = await githubRequest(repoApiPath(repo, `/git/trees/${encodeURIComponent(branch)}?recursive=1`));
        if (!result.data?.truncated) return result.data?.tree || [];
        const fallback = { blobs: [], folders: new Set() };
        await listContentsRecursively(repo, branch, '', fallback);
        return fallback.blobs.concat([...fallback.folders].map(path => ({ path, type: 'tree' })));
    }

    async function loadRepositorySnapshot(repo) {
        const branch = repo.default_branch || 'main';
        const tree = await repositoryTree(repo, branch);
        const blobs = tree.filter(entry => entry.type === 'blob' && safeRepoPath(entry.path));
        const folders = new Set(tree.filter(entry => entry.type === 'tree' && safeRepoPath(entry.path)).map(entry => entry.path));
        blobs.forEach(entry => addParentFolders(entry.path, folders));
        if (blobs.length > MAX_FILES) throw new Error(`This repository has ${blobs.length} files; the browser importer is limited to ${MAX_FILES}.`);
        const importable = blobs.filter(entry => isTextPath(entry.path));
        const files = {};
        let cursor = 0;
        const worker = async () => {
            while (cursor < importable.length) {
                const entry = importable[cursor++];
                const result = await githubRequest(repoApiPath(repo, `/git/blobs/${encodeURIComponent(entry.sha)}`));
                files[entry.path] = result.data?.encoding === 'base64' ? decodeBase64(result.data.content) : String(result.data?.content || '');
            }
        };
        const workers = Array.from({ length: Math.min(6, Math.max(1, importable.length)) }, () => worker());
        await Promise.all(workers);
        if (!Object.keys(files).length) files['index.html'] = '';
        const skipped = blobs.length - importable.length;
        return { files, folders: [...folders].sort(), branch, skipped };
    }

    function openTrust(repo) {
        if (!pluginEnabled()) {
            showToast('GitHub plugin access is disabled.', 'info');
            return;
        }
        selectedRepository = repo;
        trustDescription.textContent = `Allowing ${repo.full_name || repo.name} will replace every file and folder in the current Jungle Editor project with the text files from its ${repo.default_branch || 'main'} branch. This cannot be undone from the editor. Binary files are not supported by the in-browser workspace and will be skipped.`;
        trustStatus.textContent = '';
        trustAllow.disabled = false;
        trustDeny.disabled = false;
        trustAllow.textContent = 'Allow';
        hideRepositoryMenu();
        trustOverlay.classList.add('show');
    }

    async function importSelectedRepository() {
        if (importing || !selectedRepository) return;
        if (!pluginEnabled()) {
            closeTrust();
            showToast('GitHub plugin access is disabled.', 'info');
            return;
        }
        const project = typeof JungleUI !== 'undefined' ? JungleUI.getCurrentProject() : null;
        if (!project) {
            closeTrust();
            showToast('Open a Jungle Editor project before importing a repository.', 'error');
            return;
        }
        importing = true;
        trustAllow.disabled = true;
        trustDeny.disabled = true;
        trustAllow.textContent = 'Importing...';
        trustStatus.textContent = 'Reading repository files...';
        try {
            const repo = selectedRepository;
            const snapshot = await loadRepositorySnapshot(repo);
            if (!pluginEnabled()) throw new Error('GitHub access was disabled in Settings > Plugins.');
            project.files = snapshot.files;
            project.folders = snapshot.folders;
            project.currentFile = Object.keys(snapshot.files).sort()[0];
            project.lang = typeof JungleIntelligence !== 'undefined'
                ? JungleIntelligence.languageFromFilename(project.currentFile, project.lang || 'Javascript')
                : project.lang;
            project.githubSource = repo.full_name || repo.name;
            JungleStorage.saveProjects(projects);
            JungleUI.renderFilesList();
            JungleUI.switchToFile(project.currentFile);
            closeTrust();
            const skipped = snapshot.skipped ? `; skipped ${snapshot.skipped} binary file${snapshot.skipped === 1 ? '' : 's'}` : '';
            showToast(`Imported ${repo.full_name || repo.name} (${Object.keys(snapshot.files).length} files${skipped}).`, 'success');
        } catch (error) {
            trustAllow.disabled = false;
            trustDeny.disabled = false;
            trustAllow.textContent = 'Allow';
            trustStatus.textContent = error.message || 'Repository import failed.';
            showToast(`Could not import repository: ${error.message}`, 'error');
        } finally {
            importing = false;
        }
    }

    trustDeny.addEventListener('click', closeTrust);
    trustAllow.addEventListener('click', importSelectedRepository);
    trustOverlay.addEventListener('click', event => { if (event.target === trustOverlay && !importing) closeTrust(); });

    githubButton.addEventListener('click', event => {
        event.stopPropagation();
        if (!pluginEnabled()) {
            hideRepositoryMenu();
            showToast('Enable the GitHub plugin in Settings > Plugins first.', 'info');
            openPluginSettings();
            return;
        }
        if (repoMenu.classList.contains('show')) {
            hideRepositoryMenu();
            return;
        }
        repoMenu.classList.add('show');
        if (getToken() && !repositories.length) loadRepositories();
        else if (!getToken()) openAuth();
        else renderRepositoryMenu();
    });
    document.getElementById('tools-btn')?.addEventListener('click', () => {
        if (!toolsMenu.classList.contains('show')) hideRepositoryMenu();
    });
    ['find-bugs-tool', 'debug-tool', 'multilang-tool'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', hideRepositoryMenu);
    });
    repoMenu.addEventListener('click', event => event.stopPropagation());
    document.addEventListener('click', event => {
        if (!toolsControl.contains(event.target)) hideRepositoryMenu();
    });

    window.addEventListener('jungle-github-plugin-change', event => {
        if (event.detail?.enabled) return;
        try { sessionStorage.removeItem(TOKEN_KEY); } catch (_) {}
        requestNumber++;
        repositories = [];
        hideRepositoryMenu();
        closeAuth();
        closeTrust();
    });
})();
