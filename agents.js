// Jungle Agents: a direct-access coding assistant for the active browser project.
(function initJungleAgents() {
    const fallback = document.getElementById('workspace-center-fallback');
    const primaryToggle = document.getElementById('agents-toggle-btn');
    const toggle = primaryToggle || document.getElementById('agents-toggle-fallback');
    if (!toggle) return;
    if (fallback) fallback.style.display = primaryToggle ? 'none' : 'flex';
    const fallbackHub = document.getElementById('workspace-hub-fallback');
    if (fallbackHub) fallbackHub.onclick = () => {
        const workspace = document.getElementById('workspace-container');
        const hub = document.getElementById('projects-dashboard');
        if (workspace) workspace.style.display = 'none';
        if (hub) { hub.classList.add('show'); window.JungleUI?.renderProjectsDashboard?.(); }
    };

    document.body.insertAdjacentHTML('beforeend', `
        <aside class="agent-panel" id="agent-panel" aria-label="Jungle coding agent">
            <div class="agent-resize-handle" id="agent-resize-handle" title="Drag to resize"></div>
            <div class="agent-header">
                <span>Agents</span>
                <button class="agent-status agent-connect-link" id="agent-status" type="button">Connect API key</button>
                <button id="agent-expand" title="Extend upward" aria-label="Extend agent panel upward">↑</button>
                <button id="agent-close" title="Close" aria-label="Close agent panel">×</button>
            </div>
            <div class="agent-session-bar" aria-label="Chat sessions">
                <button id="agent-new-session" class="agent-new-session" type="button">New session</button>
                <select id="agent-session-select" class="agent-session-select" aria-label="Chat session"></select>
                <span id="agent-activity" class="agent-activity" aria-live="polite"></span>
            </div>
            <div class="agent-connect hidden" id="agent-connect" aria-hidden="true">
                <p>Enter an API key. Jungle Editor detects supported providers and loads their available models. The key stays in this browser tab.</p>
                <input id="agent-api-key" type="password" placeholder="enter a API key" autocomplete="off">
                <input id="agent-api-endpoint" class="agent-endpoint" type="url" placeholder="API endpoint for unknown providers (optional)" autocomplete="off">
                <button id="agent-connect-btn" type="button">Connect</button>
            </div>
            <div class="agent-messages" id="agent-messages"><div class="agent-empty">Ask the agent to explain code, fix a bug, or create and edit project files.</div></div>
            <div class="agent-composer">
                <textarea id="agent-input" placeholder="Ask the coding agent to work with your code…"></textarea>
                <div class="agent-model-picker" id="agent-model-picker">
                    <select class="agent-model agent-model-native" id="agent-model" aria-label="Agent model"><option value="" selected>Connect a key to detect models</option></select>
                    <button class="agent-model-trigger" id="agent-model-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">Connect a key to detect models</button>
                    <div class="agent-model-menu" id="agent-model-menu" role="listbox" aria-label="Available models">
                        <input class="agent-model-search" id="agent-model-search" type="search" placeholder="Search models..." aria-label="Search models" autocomplete="off">
                        <div class="agent-model-options" id="agent-model-options"></div>
                    </div>
                </div>
                <button class="agent-send" id="agent-send" type="button">Send</button>
            </div>
        </aside>`);

    const panel = document.getElementById('agent-panel');
    const messages = document.getElementById('agent-messages');
    const input = document.getElementById('agent-input');
    const send = document.getElementById('agent-send');
    const model = document.getElementById('agent-model');
    const status = document.getElementById('agent-status');
    const connect = document.getElementById('agent-connect');
    const keyInput = document.getElementById('agent-api-key');
    const endpointInput = document.getElementById('agent-api-endpoint');
    const newSessionButton = document.getElementById('agent-new-session');
    const sessionSelect = document.getElementById('agent-session-select');
    const activity = document.getElementById('agent-activity');
    const modelPicker = document.getElementById('agent-model-picker');
    const modelTrigger = document.getElementById('agent-model-trigger');
    const modelMenu = document.getElementById('agent-model-menu');
    const modelSearch = document.getElementById('agent-model-search');
    const modelOptions = document.getElementById('agent-model-options');

    function normalizeApiKey(value) {
        return String(value || '').trim()
            .replace(/^['"]|['"]$/g, '')
            .replace(/^Bearer\s+/i, '')
            .replace(/^(?:api[_ -]?key|gemini[_ -]?api[_ -]?key)\s*[:=]\s*/i, '')
            .trim();
    }

    function normalizeApiEndpoint(value) {
        let endpoint = String(value || '').trim();
        if (!endpoint) return '';
        if (!/^https?:\/\//i.test(endpoint)) endpoint = `https://${endpoint}`;
        try {
            const url = new URL(endpoint);
            url.pathname = url.pathname.replace(/\/(?:models|chat\/completions)$/i, '').replace(/\/+$/, '');
            url.search = '';
            url.hash = '';
            return url.toString().replace(/\/$/, '');
        } catch (_) {
            return endpoint.replace(/\/+$/, '').replace(/\/(?:models|chat\/completions)$/i, '');
        }
    }

    let apiKey = normalizeApiKey(sessionStorage.getItem('jungle_agent_api_key') || sessionStorage.getItem('jungle_gemini_api_key') || '');
    let apiEndpoint = normalizeApiEndpoint(sessionStorage.getItem('jungle_agent_api_endpoint') || '');
    endpointInput.value = apiEndpoint;
    let busy = false;
    let conversation = [];
    let sessions = [];
    let activeSessionId = '';
    let sessionProjectId = '';
    let totalTokens = 0;
    const MAX_SESSION_MESSAGES = 240;

    function currentWorkspace() {
        try { return window.JungleUI?.getCurrentProject?.() || null; } catch (_) { return null; }
    }

    function createSession(index) {
        return {
            id: `agent_session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: `Session ${index}`,
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
    }

    function normalizeSession(value, index) {
        const source = value && typeof value === 'object' ? value : {};
        const messages = Array.isArray(source.messages) ? source.messages.map(item => ({
            role: ['user', 'model', 'system'].includes(item?.role) ? item.role : 'system',
            text: String(item?.text || '')
        })).filter(item => item.text).slice(-MAX_SESSION_MESSAGES) : [];
        return {
            id: String(source.id || `agent_session_${Date.now()}_${index}`),
            name: String(source.name || `Session ${index}`).trim().slice(0, 60) || `Session ${index}`,
            messages,
            createdAt: Number(source.createdAt) || Date.now(),
            updatedAt: Number(source.updatedAt) || Date.now()
        };
    }

    function activeSession() { return sessions.find(session => session.id === activeSessionId) || null; }

    function persistSessions() {
        const project = currentWorkspace();
        if (!project || !sessions.length || typeof JungleStorage === 'undefined' || typeof projects === 'undefined') return;
        project.agentSessions = sessions.map(session => ({
            id: session.id,
            name: session.name,
            messages: session.messages.slice(-MAX_SESSION_MESSAGES),
            createdAt: session.createdAt,
            updatedAt: session.updatedAt
        }));
        project.activeAgentSessionId = activeSessionId;
        try { JungleStorage.saveProjects(projects); } catch (_) {}
    }

    function renderSessionSelect() {
        if (!sessionSelect) return;
        sessionSelect.innerHTML = '';
        sessions.forEach((session, index) => {
            const option = document.createElement('option');
            option.value = session.id;
            option.textContent = session.name || `Session ${index + 1}`;
            sessionSelect.appendChild(option);
        });
        sessionSelect.value = activeSessionId;
    }

    function renderSessionMessages() {
        const session = activeSession();
        messages.innerHTML = '';
        if (!session || !session.messages.length) {
            messages.innerHTML = '<div class="agent-empty">Ask the agent to explain code, fix a bug, or create and edit project files.</div>';
        } else {
            session.messages.forEach(item => addMessage(item.role, item.text, { persist: false }));
        }
        messages.scrollTop = messages.scrollHeight;
    }

    function loadActiveSession() {
        const session = activeSession();
        conversation = session ? session.messages.filter(item => item.role === 'user' || item.role === 'model').slice(-12).map(item => ({ role: item.role, text: item.text })) : [];
        renderSessionSelect();
        renderSessionMessages();
    }

    function ensureWorkspaceSessions() {
        const project = currentWorkspace();
        const projectId = project?.id || 'no-project';
        if (sessionProjectId === projectId && sessions.length) {
            renderSessionSelect();
            return;
        }
        sessionProjectId = projectId;
        const stored = Array.isArray(project?.agentSessions) ? project.agentSessions : [];
        sessions = stored.map((item, index) => normalizeSession(item, index + 1));
        if (!sessions.length) sessions = [createSession(1)];
        const preferred = project?.activeAgentSessionId;
        activeSessionId = sessions.some(session => session.id === preferred) ? preferred : sessions[0].id;
        loadActiveSession();
        if (project && (!Array.isArray(project.agentSessions) || project.agentSessions.length !== sessions.length || project.activeAgentSessionId !== activeSessionId)) persistSessions();
    }

    function switchSession(id) {
        ensureWorkspaceSessions();
        if (!sessions.some(session => session.id === id)) return;
        activeSessionId = id;
        loadActiveSession();
        persistSessions();
        input.focus();
    }

    function startNewSession() {
        ensureWorkspaceSessions();
        const session = createSession(sessions.length + 1);
        sessions.push(session);
        activeSessionId = session.id;
        loadActiveSession();
        persistSessions();
        input.focus();
    }

    function storeSessionMessage(role, text) {
        const session = activeSession();
        if (!session || !text) return;
        session.messages.push({ role, text: String(text) });
        if (role === 'user' && session.messages.filter(item => item.role === 'user').length === 1 && /^Session \d+$/i.test(session.name)) {
            session.name = String(text).replace(/\s+/g, ' ').trim().slice(0, 42) || session.name;
        }
        session.messages = session.messages.slice(-MAX_SESSION_MESSAGES);
        session.updatedAt = Date.now();
        persistSessions();
        renderSessionSelect();
    }

    function setActivity(label = '', tokens = totalTokens) {
        if (!activity) return;
        activity.textContent = label ? `${label}... ${Math.max(0, Math.round(tokens || 0))} tokens` : '';
        activity.classList.toggle('visible', Boolean(label));
    }

    window.addEventListener('jungle-workspace-change', () => ensureWorkspaceSessions());
    sessionSelect?.addEventListener('change', () => switchSession(sessionSelect.value));
    newSessionButton?.addEventListener('click', startNewSession);

    function closeModelMenu() {
        modelMenu?.classList.remove('show');
        modelTrigger?.setAttribute('aria-expanded', 'false');
    }

    function renderModelPicker() {
        if (!modelOptions || !modelTrigger) return;
        const selected = [...model.options].find(option => option.value === model.value) || model.options[0];
        modelTrigger.textContent = selected?.textContent || 'Select a model';
        modelTrigger.disabled = model.disabled;
        modelOptions.innerHTML = '';
        const query = String(modelSearch?.value || '').trim().toLowerCase();
        let visible = 0;
        [...model.options].forEach(option => {
            const matches = !query || option.textContent.toLowerCase().includes(query);
            if (!matches) return;
            visible += 1;
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'agent-model-option';
            item.textContent = option.textContent;
            item.setAttribute('role', 'option');
            item.setAttribute('aria-selected', String(option.value === model.value));
            item.disabled = option.disabled || !option.value || model.disabled;
            item.addEventListener('click', event => {
                event.stopPropagation();
                if (item.disabled) return;
                model.value = option.value;
                model.dispatchEvent(new Event('change', { bubbles: true }));
                closeModelMenu();
            });
            modelOptions.appendChild(item);
        });
        if (!visible) {
            const empty = document.createElement('div');
            empty.className = 'agent-model-empty';
            empty.textContent = query ? 'No matching models' : 'No models available';
            modelOptions.appendChild(empty);
        }
    }

    modelTrigger?.addEventListener('click', event => {
        event.stopPropagation();
        if (model.disabled) return;
        const open = !modelMenu.classList.contains('show');
        if (open) {
            renderModelPicker();
            modelMenu.classList.add('show');
            modelTrigger.setAttribute('aria-expanded', 'true');
            setTimeout(() => modelSearch?.focus(), 0);
        } else closeModelMenu();
    });
    modelSearch?.addEventListener('input', renderModelPicker);
    modelSearch?.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closeModelMenu(); modelTrigger?.focus(); } });
    document.addEventListener('click', event => {
        if (modelPicker && !modelPicker.contains(event.target)) closeModelMenu();
    });
    const modelObserver = new MutationObserver(renderModelPicker);
    modelObserver.observe(model, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected'] });

    function resetDetectedModels() {
        model.querySelectorAll('option[data-agent-discovered="true"], option[data-agent-default="true"], option[data-agent-info="true"]').forEach(option => option.remove());
        if (![...model.options].some(option => option.value === '')) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Connect a key to detect models';
            model.appendChild(option);
        }
        model.value = '';
        renderModelPicker();
    }

    const setConnected = connected => {
        // Keep the key field collapsed until the user explicitly opens it.
        connect.classList.add('hidden');
        connect.setAttribute('aria-hidden', 'true');
        status.textContent = connected ? 'API key connected' : 'Connect API key';
        status.setAttribute('aria-label', connected ? 'Change API key' : 'Connect API key');
        status.setAttribute('aria-expanded', 'false');
        model.disabled = !connected;
        if (!connected) resetDetectedModels();
        renderModelPicker();
    };
    // Providers are identified from their documented key prefixes where one
    // exists. A key itself cannot identify an arbitrary provider, so unknown
    // keys are kept intact and never sent to a guessed service.
    const PROVIDERS = {
        Gemini: { kind: 'gemini', keyPattern: /^AIza/i, modelPrefix: '', defaultModel: 'gemini-2.5-flash', defaultLabel: 'Gemini 2.5 Flash', modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models' },
        OpenAI: { kind: 'openai', keyPattern: /^sk-(?!or-v1-|ant-)/i, modelPrefix: 'openai:', defaultModel: 'openai:gpt-4o-mini', defaultLabel: 'GPT-4o mini', modelsUrl: 'https://api.openai.com/v1/models', chatUrl: 'https://api.openai.com/v1/chat/completions' },
        OpenRouter: { kind: 'openai', keyPattern: /^sk-or-v1-/i, modelPrefix: 'openrouter:', defaultModel: 'openrouter:google/gemini-2.5-flash', defaultLabel: 'Google Gemini 2.5 Flash', modelsUrl: 'https://openrouter.ai/api/v1/models', chatUrl: 'https://openrouter.ai/api/v1/chat/completions' },
        Anthropic: { kind: 'anthropic', keyPattern: /^sk-ant-/i, modelPrefix: 'anthropic:', defaultModel: 'anthropic:claude-3-5-haiku-latest', defaultLabel: 'Claude 3.5 Haiku', modelsUrl: 'https://api.anthropic.com/v1/models', chatUrl: 'https://api.anthropic.com/v1/messages' },
        Groq: { kind: 'openai', keyPattern: /^gsk_/i, modelPrefix: 'groq:', defaultModel: 'groq:llama-3.3-70b-versatile', defaultLabel: 'Llama 3.3 70B', modelsUrl: 'https://api.groq.com/openai/v1/models', chatUrl: 'https://api.groq.com/openai/v1/chat/completions' }
    };

    function providerForKey(value) {
        const key = normalizeApiKey(value);
        return Object.keys(PROVIDERS).find(name => PROVIDERS[name].keyPattern.test(key)) || '';
    }

    function providerForEndpoint(value) {
        const endpoint = normalizeApiEndpoint(value);
        if (!endpoint) return '';
        try {
            const host = new URL(endpoint).hostname.toLowerCase();
            if (/generativelanguage\.googleapis\.com|aiplatform\.googleapis\.com|googleapis\.com$/.test(host)) return 'Gemini';
            if (/api\.openai\.com$/.test(host)) return 'OpenAI';
            if (/openrouter\.ai$/.test(host)) return 'OpenRouter';
            if (/anthropic\.com$/.test(host)) return 'Anthropic';
            if (/groq\.com$/.test(host)) return 'Groq';
        } catch (_) {}
        return '';
    }

    function providerForModel(value) {
        const modelValue = String(value || '');
        const match = Object.entries(PROVIDERS).find(([, config]) => config.modelPrefix && modelValue.startsWith(config.modelPrefix));
        if (match) return match[0];
        if (modelValue.startsWith('custom:')) return 'Custom';
        return 'Gemini';
    }

    function configForProvider(provider) {
        if (provider === 'Custom') {
            if (!apiEndpoint) return null;
            return { kind: 'openai', modelPrefix: 'custom:', defaultModel: 'custom:auto', defaultLabel: 'Auto-detected model', modelsUrl: `${apiEndpoint}/models`, chatUrl: `${apiEndpoint}/chat/completions` };
        }
        return PROVIDERS[provider];
    }

    const storedModel = sessionStorage.getItem('jungle_agent_model');
    let modelManuallySelected = Boolean(storedModel && [...model.options].some(option => option.value === storedModel));
    if (modelManuallySelected) model.value = storedModel;
    const storedProvider = providerForKey(apiKey);
    if (storedProvider && modelManuallySelected && providerForModel(model.value) !== storedProvider) modelManuallySelected = false;
    model.onchange = () => {
        modelManuallySelected = true;
        sessionStorage.setItem('jungle_agent_model', model.value);
        renderModelPicker();
    };

    function selectDefaultModel(provider) {
        if (modelManuallySelected) return;
        const option = [...model.options].find(item => providerForModel(item.value) === provider);
        if (option) {
            model.value = option.value;
            sessionStorage.setItem('jungle_agent_model', model.value);
        }
        renderModelPicker();
    }

    function ensureProviderModel(provider) {
        const config = configForProvider(provider);
        const entry = config && { value: config.defaultModel, label: config.defaultLabel };
        if (!entry) return false;
        model.querySelector('option[value=""]')?.remove();
        if (![...model.options].some(option => option.value === entry.value)) {
            const option = document.createElement('option');
            option.value = entry.value;
            option.textContent = `${entry.label} · ${provider} API key`;
            option.dataset.agentDefault = 'true';
            option.dataset.agentProvider = provider;
            model.appendChild(option);
        }
        renderModelPicker();
        return true;
    }

    function showModelInfo(text) {
        model.querySelectorAll('option[value=""]').forEach(option => option.remove());
        model.querySelectorAll('option[data-agent-info="true"]').forEach(option => option.remove());
        const option = document.createElement('option');
        option.value = '';
        option.textContent = text;
        option.disabled = true;
        option.dataset.agentInfo = 'true';
        model.appendChild(option);
        model.value = '';
        renderModelPicker();
    }

    function addDiscoveredModels(provider, entries) {
        model.querySelector('option[value=""]')?.remove();
        model.querySelectorAll('option[data-agent-discovered="true"]').forEach(option => option.remove());
        const values = new Set([...model.options].map(option => option.value));
        let available = 0;
        entries.forEach(entry => {
            if (!entry.value) return;
            available += 1;
            if (values.has(entry.value)) return;
            const option = document.createElement('option');
            option.value = entry.value;
            option.textContent = `${entry.label} · ${provider} API key`;
            option.dataset.agentDiscovered = 'true';
            option.dataset.agentProvider = provider;
            model.appendChild(option);
            values.add(entry.value);
        });
        if (!modelManuallySelected && (entries[0]?.value || model.querySelector('option[data-agent-default="true"]')?.value)) {
            model.value = entries[0]?.value || model.querySelector('option[data-agent-default="true"]').value;
            sessionStorage.setItem('jungle_agent_model', model.value);
        }
        renderModelPicker();
        return available;
    }

    function modelCatalogItems(provider, config, data) {
        let raw = [];
        if (Array.isArray(data)) raw = data;
        else if (Array.isArray(data?.data)) raw = data.data;
        else if (Array.isArray(data?.models)) raw = data.models;
        else if (Array.isArray(data?.results)) raw = data.results;
        else if (Array.isArray(data?.available_models)) raw = data.available_models;
        else if (data?.data && Array.isArray(data.data.data)) raw = data.data.data;
        else if (data && typeof data.models === 'object' && data.models) raw = Object.entries(data.models).map(([id, value]) => ({ id, ...(value && typeof value === 'object' ? value : {}) }));

        const values = new Set();
        return raw.map(item => {
            const object = item && typeof item === 'object' ? item : {};
            const rawId = typeof item === 'string'
                ? item
                : (object.id || object.name || object.model || object.modelId || object.model_id || object.model_name || object.slug || '');
            const id = String(rawId || '').replace(/^models\//, '').trim();
            if (!id || values.has(id.toLowerCase())) return null;
            if (/(embedding|moderation|whisper|tts|dall-e|image-generation|rerank|safety)/i.test(id)) return null;
            if (config.kind === 'gemini' && Array.isArray(object.supportedGenerationMethods) && object.supportedGenerationMethods.length && !object.supportedGenerationMethods.includes('generateContent')) return null;
            const value = config.modelPrefix ? `${config.modelPrefix}${id}` : id;
            values.add(id.toLowerCase());
            return { value, label: String(object.displayName || object.display_name || object.label || id) };
        }).filter(Boolean);
    }

    async function fetchModelCatalog(provider, config, key) {
        const urls = [config.modelsUrl];
        // Gemini accepts the key in a header, but some browser/proxy setups
        // strip that header. Retry its documented query-string form.
        if (config.kind === 'gemini' && !/[?&]key=/i.test(config.modelsUrl)) urls.push(`${config.modelsUrl}?key=${encodeURIComponent(key)}`);
        const headers = config.kind === 'gemini'
            ? { 'x-goog-api-key': key }
            : config.kind === 'anthropic'
                ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
                : { Authorization: `Bearer ${key}` };
        let lastError = null;
        for (const url of urls) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            try {
                const requestHeaders = config.kind === 'gemini' && /[?&]key=/i.test(url) ? {} : headers;
                const response = await fetch(url, { headers: requestHeaders, signal: controller.signal });
                const data = await response.json().catch(() => ({}));
                if (response.ok) return data;
                const message = (typeof data.error === 'string' ? data.error : data.error?.message) || data.message || `Model discovery failed (${response.status})`;
                const error = new Error(message);
                error.auth = response.status === 401 || response.status === 403 || /api key|invalid.*key|unauthenticated|authentication|unauthor/i.test(message);
                lastError = error;
            } catch (error) {
                lastError = error;
                if (error.auth && url === urls[urls.length - 1]) throw error;
            } finally {
                clearTimeout(timeout);
            }
        }
        throw lastError || new Error(`Could not load ${provider} models.`);
    }

    async function discoverModelsForKey(key, announce = true) {
        const endpointProvider = providerForEndpoint(apiEndpoint);
        // An explicitly supplied endpoint wins over a key prefix. Many
        // providers use `sk-`-style keys, so treating every one as OpenAI
        // would send the key to the wrong host.
        const provider = apiEndpoint ? (endpointProvider || 'Custom') : providerForKey(key);
        if (!provider) {
            status.textContent = 'API key connected';
            showModelInfo('Add an API endpoint to load models');
            if (announce) addMessage('system', 'API key saved, but a key alone cannot identify an arbitrary provider. Add that provider’s API endpoint to load its models.');
            return;
        }
        const config = configForProvider(provider);
        if (!config) {
            showModelInfo('Add an API endpoint to load models');
            if (announce) addMessage('system', 'Add an OpenAI-compatible API endpoint so Jungle Editor can request this provider’s model list.');
            return;
        }
        // Select a provider-compatible fallback before discovery. If a browser
        // blocks the provider's model-list request, the first chat still uses
        // the right API instead of sending an OpenAI key to Gemini (or vice versa).
        ensureProviderModel(provider);
        selectDefaultModel(provider);
        status.textContent = 'Loading models…';
        try {
            const data = await fetchModelCatalog(provider, config, key);
            const entries = modelCatalogItems(provider, config, data);
            const count = addDiscoveredModels(provider, entries);
            status.textContent = 'API key connected';
            if (announce) addMessage('system', count ? `Added ${count} ${provider} model${count === 1 ? '' : 's'} to the list.` : `The ${provider} key is valid, but no chat models were returned.`);
        } catch (error) {
            status.textContent = 'API key connected';
            if (error.auth) {
                addMessage('system', `${provider} did not accept this key: ${error.message} The key was kept so you can choose another model or endpoint.`);
            } else if (announce) {
                addMessage('system', `Could not load ${provider} models: ${error.name === 'AbortError' ? 'request timed out' : error.message}`);
            }
        }
    }
    setConnected(Boolean(apiKey));
    if (apiKey) setTimeout(() => discoverModelsForKey(apiKey, false), 0);

    toggle.onclick = () => {
        ensureWorkspaceSessions();
        panel.classList.toggle('open');
        toggle.classList.toggle('active', panel.classList.contains('open'));
        if (panel.classList.contains('open') && apiKey) setTimeout(() => input.focus(), 30);
    };
    document.getElementById('agent-close').onclick = () => { panel.classList.remove('open'); toggle.classList.remove('active'); };
    // Keep the API-key control usable even if another workspace initializer
    // replaces a button handler later in the page lifecycle.  The delegated
    // listener below is intentionally scoped to this control, so it does not
    // interfere with the editor's other buttons.
    const setConnectionFormOpen = open => {
        if (open) {
            panel.classList.add('open');
            toggle.classList.add('active');
        }
        connect.classList.toggle('hidden', !open);
        connect.setAttribute('aria-hidden', String(!open));
        status.setAttribute('aria-expanded', String(open));
        if (open) setTimeout(() => keyInput.focus(), 30);
    };
    const toggleConnectionForm = event => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        setConnectionFormOpen(connect.classList.contains('hidden'));
    };
    status.addEventListener('click', toggleConnectionForm);
    // This also covers a host page that re-renders the status button after
    // Jungle Agents initializes and therefore drops the direct listener.
    document.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target.closest('#agent-status') : null;
        if (target && target === document.getElementById('agent-status')) toggleConnectionForm(event);
    });
    status.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') toggleConnectionForm(event);
    });
    document.getElementById('agent-expand').onclick = event => {
        panel.classList.toggle('expanded');
        event.currentTarget.textContent = panel.classList.contains('expanded') ? '↓' : '↑';
        event.currentTarget.title = panel.classList.contains('expanded') ? 'Restore panel height' : 'Extend upward';
    };
    document.getElementById('agent-connect-btn').onclick = async () => {
        const value = normalizeApiKey(keyInput.value);
        if (!value) return;
        apiKey = value;
        apiEndpoint = normalizeApiEndpoint(endpointInput.value);
        modelManuallySelected = false;
        sessionStorage.setItem('jungle_agent_api_key', apiKey);
        sessionStorage.removeItem('jungle_gemini_api_key');
        if (apiEndpoint) sessionStorage.setItem('jungle_agent_api_endpoint', apiEndpoint);
        else sessionStorage.removeItem('jungle_agent_api_endpoint');
        keyInput.value = '';
        resetDetectedModels();
        setConnected(true);
        addMessage('system', 'API key saved. Checking available models…');
        await discoverModelsForKey(apiKey);
        input.focus();
    };

    // Drag the top edge to resize the attached panel upward.
    const resizeHandle = document.getElementById('agent-resize-handle');
    resizeHandle.addEventListener('pointerdown', event => {
        event.preventDefault(); panel.classList.remove('expanded');
        const startY = event.clientY, startHeight = panel.getBoundingClientRect().height;
        resizeHandle.setPointerCapture(event.pointerId);
        const move = e => { panel.style.height = Math.max(300, Math.min(window.innerHeight - 92, startHeight + startY - e.clientY)) + 'px'; };
        const stop = e => { resizeHandle.releasePointerCapture(e.pointerId); resizeHandle.removeEventListener('pointermove', move); resizeHandle.removeEventListener('pointerup', stop); };
        resizeHandle.addEventListener('pointermove', move); resizeHandle.addEventListener('pointerup', stop);
    });

    function addMessage(role, text, { persist = true } = {}) {
        messages.querySelector('.agent-empty')?.remove();
        const node = document.createElement('div');
        node.className = 'agent-message ' + role;
        node.textContent = String(text || '');
        messages.appendChild(node);
        messages.scrollTop = messages.scrollHeight;
        if (persist) storeSessionMessage(role, text);
    }

    function projectSnapshot() {
        const project = JungleUI.getCurrentProject();
        if (!project) return 'No project is open.';
        let used = 0;
        const limit = 120000;
        const files = Object.entries(project.files).map(([name, content]) => {
            const remaining = Math.max(0, limit - used);
            const text = String(content || '').slice(0, remaining);
            used += text.length;
            return `\n--- FILE: ${name} ---\n${text}`;
        }).join('');
        return `Project: ${project.name}\nActive file: ${project.currentFile}\nFolders: ${(project.folders || []).join(', ') || '(none)'}\n${files}${used >= limit ? '\n[Project snapshot truncated]' : ''}`;
    }

    const tools = [{ functionDeclarations: [
        { name: 'create_file', description: 'Create a new text/code file in the current project.', parameters: { type: 'OBJECT', properties: { path: { type: 'STRING' }, content: { type: 'STRING' } }, required: ['path', 'content'] } },
        { name: 'edit_file', description: 'Replace the full contents of an existing project file.', parameters: { type: 'OBJECT', properties: { path: { type: 'STRING' }, content: { type: 'STRING' } }, required: ['path', 'content'] } },
        { name: 'delete_file', description: 'Delete a project file. Cannot delete the final file.', parameters: { type: 'OBJECT', properties: { path: { type: 'STRING' } }, required: ['path'] } },
        { name: 'create_folder', description: 'Create a virtual folder in the project.', parameters: { type: 'OBJECT', properties: { path: { type: 'STRING' } }, required: ['path'] } },
        { name: 'delete_folder', description: 'Delete a folder and all project files beneath it.', parameters: { type: 'OBJECT', properties: { path: { type: 'STRING' } }, required: ['path'] } },
        { name: 'workspace_status', description: 'Inspect the active workspace view, current file, and safe controls the agent can use.', parameters: { type: 'OBJECT', properties: {} } },
        { name: 'click_workspace_control', description: 'Click one safe, visible Jungle Editor control. Use the canonical control name from workspace_status, such as run, preview_run, terminal, console, templates, agents, stacked_editor, tools, extensions, select_all, copy_code, download_code, or back_to_hub.', parameters: { type: 'OBJECT', properties: { control: { type: 'STRING' } }, required: ['control'] } },
        { name: 'open_workspace_file', description: 'Open an existing project file in the editor.', parameters: { type: 'OBJECT', properties: { path: { type: 'STRING' } }, required: ['path'] } },
        { name: 'run_terminal', description: 'Run a Jungle terminal command immediately. The command operates in the active in-browser project workspace. Supported commands include ls, cat, head, tail, wc, grep, touch, rm, mv, cp, stat, open, project, analyze, run, node, python, python3, g++, gcc, javac, and tsc.', parameters: { type: 'OBJECT', properties: { command: { type: 'STRING' } }, required: ['command'] } }
    ] }];

    function cleanPath(value) {
        const path = String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        if (!path || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid project path.');
        return path;
    }

    function saveAndRefresh(project, preferredFile) {
        JungleStorage.saveProjects(projects);
        JungleUI.renderFilesList();
        if (preferredFile && project.files[preferredFile] !== undefined) JungleUI.switchToFile(preferredFile);
        else if (project.currentFile && project.files[project.currentFile] !== undefined) {
            editor.value = project.files[project.currentFile] || '';
            JungleUI.updateCodeHighlight();
            JungleUI.updateLinesOfCodeCount();
        }
    }

    const WORKSPACE_CONTROL_IDS = {
        run: 'run-btn',
        preview_run: 'tab-preview',
        terminal: 'tab-terminal-btn',
        console: 'tab-console',
        whole_project: 'project-title-btn',
        templates: 'template-panel-toggle',
        agents: 'agents-toggle-btn',
        stacked_editor: 'split-editor-btn',
        tools: 'tools-btn',
        extensions: 'extensions-btn',
        select_all: 'select-all-code-btn',
        copy_code: 'header-copy-code-btn',
        download_code: 'download-code-btn',
        back_to_hub: 'workspace-hub-btn'
    };

    function normalizeControlName(value) {
        return String(value || '').trim().toLowerCase().replace(/[\s\/-]+/g, '_');
    }

    function findWorkspaceControl(name) {
        const key = normalizeControlName(name);
        const id = WORKSPACE_CONTROL_IDS[key];
        if (!id) throw new Error(`Unknown workspace control: ${name}`);
        if (key === 'agents') return document.getElementById('agents-toggle-btn') || document.getElementById('agents-toggle-fallback');
        if (key === 'back_to_hub') return document.getElementById('workspace-hub-btn') || document.getElementById('workspace-hub-fallback');
        return document.getElementById(id);
    }

    function workspaceStatus() {
        const project = JungleUI.getCurrentProject();
        const controls = Object.keys(WORKSPACE_CONTROL_IDS).map(control => {
            const element = findWorkspaceControl(control);
            return { control, available: Boolean(element), visible: Boolean(element && element.getClientRects().length) };
        });
        return JSON.stringify({
            view: typeof activeView === 'string' ? activeView : 'unknown',
            project: project ? project.name : null,
            currentFile: project ? project.currentFile : null,
            controls
        });
    }

    async function runTool(name, args) {
        if (name === 'workspace_status') return workspaceStatus();
        if (name === 'click_workspace_control') {
            const control = normalizeControlName(args.control);
            const element = findWorkspaceControl(control);
            if (!element) throw new Error(`Workspace control is not available: ${control}`);
            element.click();
            return `Clicked workspace control: ${control}`;
        }
        const project = JungleUI.getCurrentProject();
        if (!project) throw new Error('No project is open.');
        if (name === 'open_workspace_file') {
            const path = cleanPath(args.path);
            if (project.files[path] === undefined) throw new Error('File does not exist: ' + path);
            JungleUI.switchToFile(path);
            return 'Opened ' + path;
        }
        if (name === 'create_file') {
            const path = cleanPath(args.path); if (project.files[path] !== undefined) throw new Error('File already exists: ' + path);
            project.files[path] = String(args.content || ''); project.currentFile = path; saveAndRefresh(project, path); return 'Created ' + path;
        }
        if (name === 'edit_file') {
            const path = cleanPath(args.path); if (project.files[path] === undefined) throw new Error('File does not exist: ' + path);
            project.files[path] = String(args.content || ''); saveAndRefresh(project, path); return 'Updated ' + path;
        }
        if (name === 'delete_file') {
            const path = cleanPath(args.path); if (project.files[path] === undefined) throw new Error('File does not exist: ' + path);
            if (Object.keys(project.files).length <= 1) throw new Error('Cannot delete the final project file.');
            delete project.files[path]; if (project.currentFile === path) project.currentFile = Object.keys(project.files)[0]; saveAndRefresh(project, project.currentFile); return 'Deleted ' + path;
        }
        if (name === 'create_folder') {
            const path = cleanPath(args.path); project.folders = [...new Set([...(project.folders || []), path])]; saveAndRefresh(project); return 'Created folder ' + path;
        }
        if (name === 'delete_folder') {
            const path = cleanPath(args.path), prefix = path + '/';
            const targets = Object.keys(project.files).filter(file => file.startsWith(prefix));
            if (Object.keys(project.files).length - targets.length < 1) throw new Error('Cannot remove every project file.');
            targets.forEach(file => delete project.files[file]);
            project.folders = (project.folders || []).filter(folder => folder !== path && !folder.startsWith(prefix));
            if (!project.files[project.currentFile]) project.currentFile = Object.keys(project.files)[0]; saveAndRefresh(project, project.currentFile); return `Deleted ${path} and ${targets.length} file(s)`;
        }
        if (name === 'run_terminal') {
            const command = String(args.command || '').trim(); if (!command) throw new Error('Empty terminal command.');
            switchView('terminal', false);
            const before = terminalViewBody.textContent.length;
            executeTerminalCommand(command);
            return terminalViewBody.textContent.slice(before).trim() || 'Command completed.';
        }
        throw new Error('Unknown tool: ' + name);
    }

    function openAiMessages(contents) {
        const callIds = new Map();
        const messages = [{
            role: 'system',
            content: 'You are Jungle Agent, a concise coding assistant inside a browser IDE. Use the provided project snapshot and tools. You may create, edit, and delete files or folders when asked. Use workspace_status before UI actions, then use click_workspace_control for safe editor controls. Use run_terminal when execution or inspection is useful; it runs immediately in the active in-browser workspace. Never claim a tool succeeded until its response confirms success. Prefer focused changes and explain the result briefly.'
        }];
        contents.forEach(item => {
            const parts = item.parts || [];
            const responses = parts.filter(part => part.functionResponse).map(part => part.functionResponse);
            if (responses.length) {
                responses.forEach(response => messages.push({
                    role: 'tool',
                    tool_call_id: response.id || callIds.get(response.name) || response.name,
                    content: JSON.stringify(response.response || {})
                }));
                return;
            }
            if (item.role === 'model') {
                const text = parts.filter(part => part.text).map(part => part.text).join('\n');
                const calls = parts.filter(part => part.functionCall).map(part => {
                    const call = part.functionCall;
                    const id = call.id || `${call.name}-${callIds.size + 1}`;
                    callIds.set(call.name, id);
                    return { id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args || {}) } };
                });
                messages.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
                return;
            }
            const text = parts.filter(part => part.text).map(part => part.text).join('\n');
            if (text) messages.push({ role: 'user', content: text });
        });
        return messages;
    }

    function openAiSchema(value) {
        if (Array.isArray(value)) return value.map(openAiSchema);
        if (!value || typeof value !== 'object') return value;
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'type' && typeof item === 'string' ? item.toLowerCase() : openAiSchema(item)]));
    }

    async function callOpenAICompatible(contents, provider) {
        const config = configForProvider(provider) || PROVIDERS.OpenAI;
        const modelName = model.value.startsWith(config.modelPrefix) ? model.value.slice(config.modelPrefix.length) : config.defaultModel.slice(config.modelPrefix.length);
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
        if (provider === 'OpenRouter') {
            headers['HTTP-Referer'] = window.location.origin;
            headers['X-Title'] = 'Jungle Editor';
        }
        const response = await fetch(config.chatUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: modelName,
                messages: openAiMessages(contents),
                tools: tools[0].functionDeclarations.map(declaration => ({
                    type: 'function',
                    function: { ...declaration, parameters: openAiSchema(declaration.parameters) }
                })),
                temperature: 0.2
            })
        });
        const data = await response.json();
        if (!response.ok) {
            const error = new Error(data.error?.message || `${provider} request failed (${response.status})`);
            error.auth = response.status === 401 || response.status === 403;
            throw error;
        }
        const message = data.choices?.[0]?.message;
        if (!message) throw new Error('OpenAI returned no response.');
        const parts = [];
        if (message.content) parts.push({ text: message.content });
        (message.tool_calls || []).forEach(call => {
            let args = {};
            try { args = JSON.parse(call.function?.arguments || '{}'); } catch (_) {}
            parts.push({ functionCall: { id: call.id, name: call.function?.name, args } });
        });
        const result = { role: 'model', parts };
        Object.defineProperty(result, '__jungleUsage', { value: data.usage || {}, enumerable: false });
        return result;
    }

    function anthropicMessages(contents) {
        return contents.map(item => {
            const parts = item.parts || [];
            const responses = parts.filter(part => part.functionResponse).map(part => part.functionResponse);
            if (responses.length) return {
                role: 'user',
                content: responses.map(response => ({ type: 'tool_result', tool_use_id: response.id || response.name, content: JSON.stringify(response.response || {}) }))
            };
            if (item.role === 'model') {
                const content = [];
                const text = parts.filter(part => part.text).map(part => part.text).join('\n');
                if (text) content.push({ type: 'text', text });
                parts.filter(part => part.functionCall).forEach(part => content.push({ type: 'tool_use', id: part.functionCall.id || part.functionCall.name, name: part.functionCall.name, input: part.functionCall.args || {} }));
                return { role: 'assistant', content: content.length ? content : [{ type: 'text', text: '' }] };
            }
            const text = parts.filter(part => part.text).map(part => part.text).join('\n');
            return text ? { role: 'user', content: text } : null;
        }).filter(Boolean);
    }

    async function callAnthropic(contents) {
        const config = PROVIDERS.Anthropic;
        const modelName = model.value.startsWith(config.modelPrefix) ? model.value.slice(config.modelPrefix.length) : config.defaultModel.slice(config.modelPrefix.length);
        const response = await fetch(config.chatUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
                model: modelName,
                max_tokens: 4096,
                system: 'You are Jungle Agent, a concise coding assistant inside a browser IDE. Use the provided project snapshot and tools. You may create, edit, and delete files or folders when asked. Use workspace_status before UI actions, then use click_workspace_control for safe editor controls. Use run_terminal when execution or inspection is useful; it runs immediately in the active in-browser workspace. Never claim a tool succeeded until its response confirms success. Prefer focused changes and explain the result briefly.',
                messages: anthropicMessages(contents),
                tools: tools[0].functionDeclarations.map(declaration => ({ name: declaration.name, description: declaration.description, input_schema: openAiSchema(declaration.parameters) }))
            })
        });
        const data = await response.json();
        if (!response.ok) {
            const error = new Error(data.error?.message || `Anthropic request failed (${response.status})`);
            error.auth = response.status === 401 || response.status === 403 || /api key|authentication|unauthor/i.test(error.message);
            throw error;
        }
        const parts = [];
        (data.content || []).forEach(item => {
            if (item.type === 'text' && item.text) parts.push({ text: item.text });
            if (item.type === 'tool_use') parts.push({ functionCall: { id: item.id, name: item.name, args: item.input || {} } });
        });
        if (!parts.length) throw new Error('Anthropic returned no response.');
        const result = { role: 'model', parts };
        Object.defineProperty(result, '__jungleUsage', { value: data.usage || {}, enumerable: false });
        return result;
    }

    async function callModel(contents) {
        const provider = providerForModel(model.value);
        const config = configForProvider(provider);
        if (config?.kind === 'openai') return callOpenAICompatible(contents, provider);
        if (config?.kind === 'anthropic') return callAnthropic(contents);
        return callGemini(contents);
    }

    async function callGemini(contents) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.value)}:generateContent`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: 'You are Jungle Agent, a concise coding assistant inside a browser IDE. Use the provided project snapshot and tools. You may create, edit, and delete files or folders when asked. Use workspace_status before UI actions, then use click_workspace_control for safe editor controls. Use run_terminal when execution or inspection is useful; it runs immediately in the active in-browser workspace. Never claim a tool succeeded until its response confirms success. Prefer focused changes and explain the result briefly.' }] },
                contents, tools, generationConfig: { temperature: 0.2 }
            })
        });
        const data = await response.json();
        if (!response.ok) {
            const error = new Error(data.error?.message || `Gemini request failed (${response.status})`);
            error.auth = response.status === 401 || response.status === 403 || /api key|invalid.*key|unauthenticated/i.test(error.message);
            throw error;
        }
        const content = data.candidates?.[0]?.content;
        if (!content) throw new Error(data.promptFeedback?.blockReason || 'Gemini returned no response.');
        const result = { ...content };
        Object.defineProperty(result, '__jungleUsage', { value: data.usageMetadata || data.usage || {}, enumerable: false });
        return result;
    }

    function estimateTokens(value) { return Math.max(0, Math.ceil(String(value || '').length / 4)); }

    function tokensFromUsage(usage, fallback = '') {
        const source = usage && typeof usage === 'object' ? usage : {};
        const direct = Number(source.total_tokens ?? source.totalTokenCount ?? source.totalTokens ?? source.token_count);
        if (Number.isFinite(direct) && direct > 0) return direct;
        const input = Number(source.prompt_tokens ?? source.input_tokens ?? source.promptTokenCount ?? source.inputTokenCount) || 0;
        const output = Number(source.completion_tokens ?? source.output_tokens ?? source.candidatesTokenCount ?? source.outputTokenCount) || 0;
        return input + output || estimateTokens(fallback);
    }

    async function submit() {
        const prompt = input.value.trim();
        if (!prompt || busy) return;
        if (!apiKey) {
            connect.classList.remove('hidden');
            connect.setAttribute('aria-hidden', 'false');
            keyInput.focus();
            return;
        }
        if (!providerForKey(apiKey) && !apiEndpoint && !modelManuallySelected) {
            addMessage('system', 'This API key provider is not identifiable from the key alone. Enter its OpenAI-compatible API endpoint or select a compatible model before chatting.');
            return;
        }
        busy = true; totalTokens = 0; input.value = ''; input.disabled = send.disabled = true; newSessionButton.disabled = sessionSelect.disabled = true; model.disabled = true; renderModelPicker(); setActivity('Thinking', totalTokens);
        addMessage('user', prompt);
        const contents = conversation.slice(-12).map(item => ({ role: item.role, parts: [{ text: item.text }] }));
        contents.push({ role: 'user', parts: [{ text: `${prompt}\n\nCURRENT PROJECT SNAPSHOT:\n${projectSnapshot()}` }] });
        try {
            let finalText = '';
            for (let round = 0; round < 12; round++) {
                setActivity('Thinking', totalTokens);
                const content = await callModel(contents);
                const responseText = (content.parts || []).filter(part => part.text).map(part => part.text).join('\n');
                totalTokens += tokensFromUsage(content.__jungleUsage, responseText);
                setActivity('Thinking', totalTokens);
                contents.push(content);
                const calls = (content.parts || []).filter(part => part.functionCall).map(part => part.functionCall);
                const text = (content.parts || []).filter(part => part.text).map(part => part.text).join('\n').trim();
                if (text) finalText = text;
                if (!calls.length) break;
                const responses = [];
                setActivity('Working', totalTokens);
                for (const call of calls) {
                    try {
                        const result = await runTool(call.name, call.args || {});
                        totalTokens += estimateTokens(result);
                        setActivity('Working', totalTokens);
                        addMessage('system', result);
                        responses.push({ functionResponse: { name: call.name, id: call.id, response: { result } } });
                    } catch (error) {
                        responses.push({ functionResponse: { name: call.name, id: call.id, response: { error: error.message } } });
                    }
                }
                contents.push({ role: 'user', parts: responses });
            }
            if (!finalText) finalText = 'Done.';
            addMessage('model', finalText);
            conversation.push({ role: 'user', text: prompt }, { role: 'model', text: finalText });
        } catch (error) {
            addMessage('system', 'Agent error: ' + error.message);
        } finally {
            busy = false; setActivity(); input.disabled = send.disabled = false; newSessionButton.disabled = sessionSelect.disabled = false; setConnected(Boolean(apiKey)); input.focus();
        }
    }

    send.onclick = submit;
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } });
})();
