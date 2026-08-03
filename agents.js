// Jungle Agents: an approval-gated Gemini coding assistant for the active browser project.
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
                <span class="agent-status" id="agent-status">Not connected</span>
                <button id="agent-expand" title="Extend upward" aria-label="Extend agent panel upward">↑</button>
                <button id="agent-close" title="Close" aria-label="Close agent panel">×</button>
            </div>
            <div class="agent-connect" id="agent-connect">
                <p>Connect a Gemini API key. The key stays in this browser tab and is sent only to Google's Gemini API.</p>
                <input id="agent-api-key" type="password" placeholder="Gemini API key" autocomplete="off">
                <button id="agent-connect-btn" type="button">Connect</button>
            </div>
            <div class="agent-messages" id="agent-messages"><div class="agent-empty">Ask the agent to explain code, fix a bug, or create and edit project files.</div></div>
            <div class="agent-approval" id="agent-approval">
                Allow model to run this command in the terminal?
                <code class="agent-command" id="agent-command"></code>
                <div class="agent-approval-actions"><button id="agent-deny" type="button">Deny</button><button class="allow" id="agent-allow" type="button">Allow</button></div>
            </div>
            <div class="agent-composer">
                <textarea id="agent-input" placeholder="Ask Gemini to work with your code…"></textarea>
                <select class="agent-model" id="agent-model" aria-label="Agent model"><option value="gemini-3.5-flash">Gemini 3.5 Flash · Free API</option></select>
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
    const approval = document.getElementById('agent-approval');
    const commandLabel = document.getElementById('agent-command');
    let apiKey = sessionStorage.getItem('jungle_gemini_api_key') || '';
    let busy = false;
    let stopped = false;
    let approvalResolver = null;
    const conversation = [];

    const setConnected = connected => {
        connect.classList.toggle('hidden', connected);
        status.textContent = connected ? 'Gemini connected' : 'Not connected';
    };
    setConnected(Boolean(apiKey));

    toggle.onclick = () => {
        panel.classList.toggle('open');
        toggle.classList.toggle('active', panel.classList.contains('open'));
        if (panel.classList.contains('open')) setTimeout(() => (apiKey ? input : keyInput).focus(), 30);
    };
    document.getElementById('agent-close').onclick = () => { panel.classList.remove('open'); toggle.classList.remove('active'); };
    document.getElementById('agent-expand').onclick = event => {
        panel.classList.toggle('expanded');
        event.currentTarget.textContent = panel.classList.contains('expanded') ? '↓' : '↑';
        event.currentTarget.title = panel.classList.contains('expanded') ? 'Restore panel height' : 'Extend upward';
    };
    document.getElementById('agent-connect-btn').onclick = () => {
        const value = keyInput.value.trim();
        if (!value) return;
        apiKey = value;
        sessionStorage.setItem('jungle_gemini_api_key', apiKey);
        keyInput.value = '';
        setConnected(true);
        addMessage('system', 'Gemini connected for this browser tab.');
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

    function addMessage(role, text) {
        messages.querySelector('.agent-empty')?.remove();
        const node = document.createElement('div');
        node.className = 'agent-message ' + role;
        node.textContent = String(text || '');
        messages.appendChild(node);
        messages.scrollTop = messages.scrollHeight;
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
        { name: 'run_terminal', description: 'Request permission to run one Jungle terminal command. Supported commands include ls, cat, head, tail, wc, grep, touch, rm, mv, cp, stat, open, project, analyze, run, node, python, python3, g++, gcc, javac, and tsc.', parameters: { type: 'OBJECT', properties: { command: { type: 'STRING' } }, required: ['command'] } }
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

    async function runTool(name, args) {
        const project = JungleUI.getCurrentProject();
        if (!project) throw new Error('No project is open.');
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
            const allowed = await requestTerminalApproval(command);
            if (!allowed) { stopped = true; throw new Error('Terminal command denied. Agent stopped.'); }
            switchView('terminal', false);
            const before = terminalViewBody.textContent.length;
            executeTerminalCommand(command);
            return terminalViewBody.textContent.slice(before).trim() || 'Command completed.';
        }
        throw new Error('Unknown tool: ' + name);
    }

    function requestTerminalApproval(command) {
        commandLabel.textContent = command;
        approval.classList.add('show');
        messages.scrollTop = messages.scrollHeight;
        return new Promise(resolve => { approvalResolver = resolve; });
    }
    document.getElementById('agent-allow').onclick = () => { approval.classList.remove('show'); approvalResolver?.(true); approvalResolver = null; };
    document.getElementById('agent-deny').onclick = () => { approval.classList.remove('show'); approvalResolver?.(false); approvalResolver = null; };

    async function callGemini(contents) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.value)}:generateContent`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: 'You are Jungle Agent, a concise coding assistant inside a browser IDE. Use the provided project snapshot and tools. You may create, edit, and delete files or folders when asked. Use run_terminal only when execution or inspection is genuinely useful; it always requires user approval. Never claim a tool succeeded until its response confirms success. Prefer focused changes and explain the result briefly.' }] },
                contents, tools, generationConfig: { temperature: 0.2 }
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || `Gemini request failed (${response.status})`);
        const content = data.candidates?.[0]?.content;
        if (!content) throw new Error(data.promptFeedback?.blockReason || 'Gemini returned no response.');
        return content;
    }

    async function submit() {
        const prompt = input.value.trim();
        if (!prompt || busy) return;
        if (!apiKey) { connect.classList.remove('hidden'); keyInput.focus(); return; }
        busy = true; stopped = false; input.value = ''; input.disabled = send.disabled = true; status.textContent = 'Working';
        addMessage('user', prompt);
        const contents = conversation.slice(-12).map(item => ({ role: item.role, parts: [{ text: item.text }] }));
        contents.push({ role: 'user', parts: [{ text: `${prompt}\n\nCURRENT PROJECT SNAPSHOT:\n${projectSnapshot()}` }] });
        try {
            let finalText = '';
            for (let round = 0; round < 12 && !stopped; round++) {
                const content = await callGemini(contents);
                contents.push(content);
                const calls = (content.parts || []).filter(part => part.functionCall).map(part => part.functionCall);
                const text = (content.parts || []).filter(part => part.text).map(part => part.text).join('\n').trim();
                if (text) finalText = text;
                if (!calls.length) break;
                const responses = [];
                for (const call of calls) {
                    try {
                        const result = await runTool(call.name, call.args || {});
                        addMessage('system', result);
                        responses.push({ functionResponse: { name: call.name, response: { result } } });
                    } catch (error) {
                        responses.push({ functionResponse: { name: call.name, response: { error: error.message } } });
                        if (stopped) throw error;
                    }
                }
                contents.push({ role: 'user', parts: responses });
            }
            if (!finalText) finalText = 'Done.';
            addMessage('model', finalText);
            conversation.push({ role: 'user', text: prompt }, { role: 'model', text: finalText });
        } catch (error) {
            if (/API key|permission|unauthenticated/i.test(error.message)) { apiKey = ''; sessionStorage.removeItem('jungle_gemini_api_key'); setConnected(false); }
            addMessage('system', stopped ? 'Agent stopped because the terminal command was denied.' : 'Agent error: ' + error.message);
        } finally {
            busy = false; input.disabled = send.disabled = false; status.textContent = apiKey ? 'Gemini connected' : 'Not connected'; input.focus();
        }
    }

    send.onclick = submit;
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } });
})();
