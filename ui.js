class JungleUI {
    static showToast(message, onClickHandlerOrType = null, type = 'info') {
        // Backwards-compatible: if second arg is a function, treat as onClickHandler (old signature)
        let onClickHandler = null;
        let toastType = 'info';
        if (typeof onClickHandlerOrType === 'function') {
            onClickHandler = onClickHandlerOrType;
            toastType = type;
        } else if (typeof onClickHandlerOrType === 'string') {
            toastType = onClickHandlerOrType;
        }
        const toast = document.createElement('div');
        toast.className = 'jungle-toast flex items-center justify-between gap-4 ' + (onClickHandler ? 'cursor-pointer hover:bg-[#1a2320]' : '');
        if (toastType === 'error') {
            toast.style.borderColor = '#FF5555';
            toast.style.color = '#FF5555';
        } else if (toastType === 'success') {
            toast.style.borderColor = '#50fa7b';
            toast.style.color = '#50fa7b';
        }
        const icon = document.createElement('span');
        icon.className = 'shrink-0';
        icon.textContent = toastType === 'error' ? '⚠' : toastType === 'success' ? '✓' : 'ℹ';
        toast.appendChild(icon);
        const textSpan = document.createElement('span');
        textSpan.style.flex = '1';
        textSpan.textContent = message;
        toast.appendChild(textSpan);
        if (onClickHandler) {
            const actionNotice = document.createElement('span');
            actionNotice.className = 'text-[10px] uppercase font-bold text-[#74a896] border-l border-[#2e3c37] pl-3 shrink-0';
            actionNotice.textContent = 'Inspect';
            toast.appendChild(actionNotice);
            toast.onclick = () => { onClickHandler(); toast.remove(); };
        }
        toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 5000);
    }
    static showErrorInGutter(lineNumber, message) {
        const gutter = document.getElementById('line-gutter');
        if (!gutter) return;
        // Remove any existing marker for this line
        const existingMarker = gutter.querySelector(`.gutter-error-marker[data-line="${lineNumber}"]`);
        if (existingMarker) existingMarker.remove();
        const marker = document.createElement('span');
        marker.className = 'gutter-error-marker';
        marker.dataset.line = String(lineNumber);
        marker.title = message;
        marker.textContent = '!';
        marker.style.cssText = 'position:absolute;left:0;color:#FF5555;font-weight:bold;font-size:11px;line-height:1.5;cursor:default;user-select:none;';
        // Position marker at the correct line (assumes monospace line-height matches gutter)
        const lineHeight = parseFloat(getComputedStyle(gutter).lineHeight) || 21;
        marker.style.top = ((lineNumber - 1) * lineHeight) + 'px';
        gutter.style.position = 'relative';
        gutter.appendChild(marker);
    }
    static clearErrorMarkers() {
        const gutter = document.getElementById('line-gutter');
        if (!gutter) return;
        gutter.querySelectorAll('.gutter-error-marker').forEach(el => el.remove());
        const overlay = document.getElementById('highlight-overlay');
        if (overlay) overlay.querySelectorAll('.error-line-highlight').forEach(el => el.remove());
    }
    static highlightErrorLine(lineNumber) {
        const overlay = document.getElementById('highlight-overlay');
        if (!overlay) return;
        // Remove existing highlight for this line
        const existing = overlay.querySelector(`.error-line-highlight[data-line="${lineNumber}"]`);
        if (existing) existing.remove();
        const highlight = document.createElement('div');
        highlight.className = 'error-line-highlight';
        highlight.dataset.line = String(lineNumber);
        const lineHeight = parseFloat(getComputedStyle(overlay).lineHeight) || 21;
        highlight.style.cssText = `position:absolute;left:0;right:0;height:${lineHeight}px;top:${(lineNumber - 1) * lineHeight}px;background:rgba(255,85,85,0.12);pointer-events:none;border-left:2px solid #FF5555;`;
        overlay.style.position = 'relative';
        overlay.appendChild(highlight);
    }
    static colorizeTerminalErrors(container) {
        if (!container) return;
        const errorPrefixes = /^(Error|SyntaxError|TypeError|ReferenceError|RangeError|URIError|EvalError|ValueError|RuntimeError|Exception|Traceback|FAILED|FATAL|Uncaught)/;
        container.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                const lines = node.textContent.split('\n');
                const hasError = lines.some(l => errorPrefixes.test(l.trim()));
                if (hasError) {
                    const frag = document.createDocumentFragment();
                    lines.forEach((line, i) => {
                        if (errorPrefixes.test(line.trim())) {
                            const span = document.createElement('span');
                            span.style.color = '#FF5555';
                            span.textContent = line;
                            frag.appendChild(span);
                        } else {
                            frag.appendChild(document.createTextNode(line));
                        }
                        if (i < lines.length - 1) frag.appendChild(document.createTextNode('\n'));
                    });
                    node.parentNode.replaceChild(frag, node);
                }
            }
        });
    }
    static appendTerminalLine(container, text) {
        if (!container) return;
        const errorPrefixes = /^(Error|SyntaxError|TypeError|ReferenceError|RangeError|URIError|EvalError|ValueError|RuntimeError|Exception|Traceback|FAILED|FATAL|Uncaught)/;
        const line = text.trimStart();
        if (errorPrefixes.test(line)) {
            const span = document.createElement('span');
            span.style.color = '#FF5555';
            span.textContent = text;
            container.appendChild(span);
            container.appendChild(document.createTextNode('\n'));
        } else {
            container.appendChild(document.createTextNode(text + '\n'));
        }
    }
    static getCurrentProject() { return projects.find(p => p.id === currentProjectId); }
    static loadProject(id) {
        currentProjectId = id;
        const p = this.getCurrentProject();
        if (!p) return;
        // Enter the workspace before rendering its contents so creation always
        // transitions away from the project dashboard immediately.
        projectsDashboard.classList.remove('show');
        workspaceContainer.style.display = 'flex';
        this.renderFilesList();
        this.switchToFile(p.currentFile || Object.keys(p.files)[0]);
        this.showToast(`Switched workspace to ${p.name}`);
    }
    static renameProject(id) {
        const project = projects.find(proj => proj.id === id);
        if (!project) return;
        this.showCustomModal({
            title: "Rename Project",
            placeholder: "New project name...",
            description: `Currently: ${project.name}`,
            onConfirm: (newName) => {
                if (!newName) return;
                project.name = newName;
                JungleStorage.saveProjects(projects);
                this.renderProjectsDashboard();
                this.showToast(`Project renamed to ${newName}`);
            }
        });
    }
    static deleteProject(id) {
        const project = projects.find(proj => proj.id === id);
        if (!project) return;
        this.showCustomModal({
            title: "Delete Project",
            placeholder: null,
            description: `Are you sure you want to delete "${project.name}"? This action cannot be undone.`,
            onConfirm: () => {
                projects = projects.filter(proj => proj.id !== id);
                JungleStorage.saveProjects(projects);
                this.renderProjectsDashboard();
                this.showToast(`Deleted project "${project.name}"`);
            }
        });
    }
    static renderProjectsDashboard() {
        const grid = document.getElementById('dashboard-grid');
        grid.innerHTML = '';
        projects.forEach(p => {
            const card = document.createElement('div');
            card.className = 'project-card';
            card.onclick = () => this.loadProject(p.id);
            card.innerHTML = `
                <div class="project-card-actions">
                    <button class="action-btn rename-proj-btn" title="Rename Project">✏️</button>
                    <button class="action-btn delete-proj-btn" title="Delete Project">🗑️</button>
                </div>
                <div>
                    <h3 class="truncate text-teal-300 font-bold pr-16">📁 ${p.name}</h3>
                    <div class="project-meta mt-2">
                        <span>Total Files: ${Object.keys(p.files).length}</span>
                        <span>Default: ${p.lang || 'General'}</span>
                    </div>
                </div>
            `;
            card.querySelector('.rename-proj-btn').onclick = (e) => {
                e.stopPropagation();
                this.renameProject(p.id);
            };
            card.querySelector('.delete-proj-btn').onclick = (e) => {
                e.stopPropagation();
                this.deleteProject(p.id);
            };
            grid.appendChild(card);
        });
        const createCard = document.createElement('div');
        createCard.className = 'new-project-card';
        createCard.innerHTML = `<div class="plus-icon">+</div><span>New Project</span>`;
        createCard.onclick = () => {
            this.showCustomModal({
                title: "New Project Name",
                placeholder: "e.g., Python math analyzer",
                onConfirm: (name) => {
                    if (!name) return;
                    const newId = 'proj_' + Date.now();
                    const newProj = JungleIntelligence.createStarterProject(newId, name);
                    projects.push(newProj);
                    JungleStorage.saveProjects(projects);
                    this.loadProject(newId);
                }
            });
        };
        grid.appendChild(createCard);
    }
    static collapsedFolders = new Set();
    static renderFilesList() {
        fileListContainer.innerHTML = '';
        const p = this.getCurrentProject();
        if (!p) return;
        const query = (document.getElementById('file-search-input')?.value || '').trim().toLowerCase();
        const allFiles = Object.keys(p.files);
        // A file's full path contains its folder chain, so a substring match also catches
        // files inside a folder whose name matches the query.
        const visibleFiles = query ? allFiles.filter(f => f.toLowerCase().includes(query)) : allFiles;
        const allFolders = p.folders || [];
        const visibleFolders = query ? allFolders.filter(f => f.toLowerCase().includes(query)) : allFolders;
        const tree = this._buildTree(visibleFiles, visibleFolders);
        this._renderTreeNode(tree, fileListContainer, p, 0);
        if (query && visibleFiles.length === 0 && visibleFolders.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'file-search-empty';
            empty.textContent = 'No files found';
            fileListContainer.appendChild(empty);
        }
    }
    // Build a nested tree of arbitrary depth from '/'-separated file paths and folder paths.
    // node = { name, path, dirs: Map<name, node>, files: [fullPath] }
    static _buildTree(filePaths, folderPaths) {
        const root = { name: '', path: '', dirs: new Map(), files: [] };
        const ensureDir = (segs) => {
            let node = root, acc = '';
            for (const seg of segs) {
                if (!seg) continue;
                acc = acc ? acc + '/' + seg : seg;
                if (!node.dirs.has(seg)) node.dirs.set(seg, { name: seg, path: acc, dirs: new Map(), files: [] });
                node = node.dirs.get(seg);
            }
            return node;
        };
        filePaths.forEach(fp => {
            const segs = fp.split('/');
            segs.pop(); // drop the file name; the rest are ancestor folders
            ensureDir(segs).files.push(fp);
        });
        (folderPaths || []).forEach(fp => ensureDir(fp.split('/'))); // explicit (possibly empty) folders
        return root;
    }
    // Render a tree node's children: folders first (sorted), then files (sorted).
    static _renderTreeNode(node, container, p, depth) {
        [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name))
            .forEach(child => this._renderFolder(child, container, p, depth));
        node.files.slice().sort((a, b) => a.localeCompare(b))
            .forEach(fp => this._renderFileLi(fp, container, p, depth));
    }
    static renderFileList() { this.renderFilesList(); }
    static _renderFileLi(filename, container, p, depth) {
        const li = document.createElement('li');
        li.dataset.file = filename;
        if (depth > 0) li.classList.add('nested');
        li.style.paddingLeft = (25 + depth * 14) + 'px'; // indent one level deeper per folder
        if (filename === p.currentFile) li.classList.add('active');
        const title = document.createElement('span');
        title.className = 'flex-1 overflow-hidden truncate pointer-events-auto cursor-pointer';
        title.textContent = '📄 ' + (depth > 0 ? filename.split('/').pop() : filename);
        title.onclick = () => this.switchToFile(filename);
        const actions = document.createElement('div');
        actions.className = 'file-item-actions';
        const del = document.createElement('button');
        del.className = 'action-btn delete';
        del.innerHTML = '🗑️';
        del.onclick = e => { e.stopPropagation(); this.deleteFile(filename); };
        actions.appendChild(del);
        li.appendChild(title);
        li.appendChild(actions);
        container.appendChild(li);
    }
    // Renders one folder tree-node and, when expanded, recurses into its children (any depth).
    static _renderFolder(node, container, p, depth) {
        const folder = node.path;
        const collapsed = this.collapsedFolders.has(folder);
        const li = document.createElement('li');
        li.className = 'folder-item';
        const row = document.createElement('div');
        row.className = 'folder-row';
        row.style.paddingLeft = (10 + depth * 14) + 'px';
        row.onclick = () => {
            if (collapsed) this.collapsedFolders.delete(folder);
            else this.collapsedFolders.add(folder);
            this.renderFilesList();
        };
        const chevron = document.createElement('span');
        chevron.className = 'folder-chevron';
        chevron.textContent = collapsed ? '▶' : '▼';
        const name = document.createElement('span');
        name.className = 'folder-name';
        name.textContent = '📁 ' + node.name + '/';
        const actions = document.createElement('div');
        actions.className = 'file-item-actions';
        const add = document.createElement('button');
        add.className = 'action-btn';
        add.innerHTML = '＋';
        add.title = 'Add a file or subfolder here';
        add.onclick = e => { e.stopPropagation(); if (typeof showFolderAddMenu === 'function') showFolderAddMenu(folder, add); };
        const del = document.createElement('button');
        del.className = 'action-btn delete';
        del.innerHTML = '🗑️';
        del.title = 'Delete folder and all contents';
        del.onclick = e => { e.stopPropagation(); this.deleteFolder(folder); };
        actions.appendChild(add);
        actions.appendChild(del);
        row.appendChild(chevron);
        row.appendChild(name);
        row.appendChild(actions);
        li.appendChild(row);
        if (!collapsed) {
            const inner = document.createElement('ul');
            inner.className = 'folder-files';
            if (node.dirs.size === 0 && node.files.length === 0) {
                const empty = document.createElement('li');
                empty.className = 'folder-empty';
                empty.textContent = 'This folder is empty';
                inner.appendChild(empty);
            } else {
                this._renderTreeNode(node, inner, p, depth + 1);
            }
            li.appendChild(inner);
        }
        container.appendChild(li);
    }
    static deleteFolder(folder) {
        const p = this.getCurrentProject();
        if (!p) return;
        const prefix = folder + '/';
        // Every file inside this folder or any subfolder, to any depth.
        const files = Object.keys(p.files).filter(f => f === folder || f.startsWith(prefix));
        if (files.length > 0) {
            if (Object.keys(p.files).length - files.length <= 0) {
                this.showToast('A project needs at least one file.');
                return;
            }
            const wasActive = files.includes(p.currentFile);
            files.forEach(f => delete p.files[f]);
            if (wasActive) p.currentFile = Object.keys(p.files)[0];
        }
        // Drop this folder and any nested folders beneath it.
        p.folders = (p.folders || []).filter(f => f !== folder && !f.startsWith(prefix));
        [...this.collapsedFolders].forEach(f => { if (f === folder || f.startsWith(prefix)) this.collapsedFolders.delete(f); });
        this.renderFilesList();
        JungleStorage.saveProjects(projects);
        this.showToast(`Deleted folder ${folder}/`);
        if (files.length > 0) this.switchToFile(p.currentFile);
    }
    static deleteFile(name) {
        const p = this.getCurrentProject();
        if (!p) return;
        if (Object.keys(p.files).length <= 1) {
            this.showToast("A project needs at least one file.");
            return;
        }
        delete p.files[name];
        if (p.currentFile === name) {
            p.currentFile = Object.keys(p.files)[0];
        }
        this.renderFilesList();
        this.switchToFile(p.currentFile);
        JungleStorage.saveProjects(projects);
        this.showToast(`Deleted file ${name}`);
    }
    static switchToFile(filename) {
        const p = this.getCurrentProject();
        if (!p) return;
        manualLanguageOverride = false;
        p.currentFile = filename;
        currentFileLabel.textContent = filename;
        editor.value = p.files[filename] || '';
        document.querySelectorAll('#file-list li[data-file]').forEach(item => {
            if (item.dataset.file === filename) item.classList.add('active');
            else item.classList.remove('active');
        });
        selectedLanguages = [JungleIntelligence.languageFromFilename(filename, p.lang || selectedLanguages[0])];
        p.lang = selectedLanguages[0];
        currentLanguageText.textContent = selectedLanguages[0];
        switchView('editor');
        this.updateCodeHighlight();
        this.updateLinesOfCodeCount();
        JungleStorage.saveProjects(projects);
        if (typeof updateTemplateBtnVisibility === 'function') updateTemplateBtnVisibility();
    }
    static updateCodeHighlight() {
        let code = editor.value;
        if (code.endsWith('\n')) code += ' ';
        let escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const lang = selectedLanguages[0];
        // Safe placeholder encoding — prevents nested HTML from innerHTML injection
        const spans = [];
        function tok(cls, content) {
            const id = spans.length;
            spans.push(`<span class="${cls}">${content}</span>`);
            return `\x00${id}\x00`;
        }
        function finalize(s) {
            return s.replace(/\x00(\d+)\x00/g, (_, i) => spans[+i]);
        }
        // Shared operator/punctuation pass (applied after primary tokenization)
        function addOpsAndPunct(s) {
            return s.replace(/([^>\x00])([+\-*/%=!<>&|^~?:]+)(?=[^<\x00])/g, (m, pre, op) => pre + tok('token-op', op))
                    .replace(/(?<=[^>\x00])([{}[\]();,.])/g, p => tok('token-punct', p));
        }
        if (lang === 'Python') {
            escaped = escaped.replace(
                /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|f"""[\s\S]*?"""|f'''[\s\S]*?'''|f"(?:\\.|[^"\\])*"|f'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(@[\w.]+)|(\bdef\s+(\w+))|(\bclass\s+(\w+))|\b(def|class|return|if|elif|else|while|for|in|not in|is not|import|from|as|with|lambda|yield|raise|try|except|finally|break|continue|pass|del|global|nonlocal|and|or|not|is|async|await)\b|\b(True|False|None|self|cls)\b|\b(print|len|range|type|isinstance|issubclass|super|hasattr|getattr|setattr|delattr|repr|str|int|float|list|dict|set|tuple|enumerate|zip|map|filter|sorted|reversed|open|input|abs|max|min|sum|any|all|id|hash|iter|next|vars|dir|callable|staticmethod|classmethod|property)\b|\b(\d+\.?\d*(?:[eE][+-]?\d+)?[jJ]?|0x[\da-fA-F]+|0b[01]+|0o[0-7]+)\b/g,
                (m, comment, str, dec, defFull, fnName, clsFull, clsName, kw, literal, builtin, num) => {
                    if (comment) return tok('token-comment', comment);
                    if (str)     return tok('token-string', str);
                    if (dec)     return tok('token-decorator', dec);
                    if (defFull) return tok('token-keyword', 'def') + ' ' + tok('token-fn', fnName);
                    if (clsFull) return tok('token-keyword', 'class') + ' ' + tok('token-type', clsName);
                    if (kw)      return tok('token-keyword', kw);
                    if (literal) return tok('token-keyword', literal);
                    if (builtin) return tok('token-builtin', builtin);
                    if (num)     return tok('token-number', num);
                    return m;
                }
            );
        } else if (lang === 'HTML') {
            // Highlight <style> and <script> blocks internally
            escaped = escaped.replace(/(&lt;style[^&]*&gt;)([\s\S]*?)(&lt;\/style&gt;)/gi, (_, open, body, close) => {
                return tok('token-tag', open) + JungleUI._highlightCSS(body, tok) + tok('token-tag', close);
            });
            escaped = escaped.replace(/(&lt;script[^&]*&gt;)([\s\S]*?)(&lt;\/script&gt;)/gi, (_, open, body, close) => {
                return tok('token-tag', open) + JungleUI._highlightJS(body, tok) + tok('token-tag', close);
            });
            escaped = escaped.replace(/(&lt;!--[\s\S]*?--&gt;)|(&lt;\/?([\w:-]+)((?:\s+[\w:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s&>]+))?)*)\s*\/?&gt;)/g,
                (m, comment, tag, tagName, attrs) => {
                    if (comment) return tok('token-comment', comment);
                    if (tag) {
                        let out = '&lt;' + (tag.startsWith('&lt;/') ? '/' : '') + tok('token-tag', tagName);
                        if (attrs) {
                            out += attrs.replace(/([\w:-]+)(\s*=\s*)("(?:[^"]*)"|'(?:[^']*)'|[^\s&>]+)/g,
                                (_, a, eq, val) => tok('token-attr', a) + eq + tok('token-string', val))
                                .replace(/\b([\w:-]+)(?!\s*=)/g, (_, a) => tok('token-attr', a));
                        }
                        out += '&gt;';
                        return out;
                    }
                    return m;
                }
            );
        } else if (lang === 'CSS') {
            escaped = JungleUI._highlightCSS(escaped, tok);
        } else if (lang === 'JavaScript' || lang === 'TypeScript' || lang === 'JS' || !['Python','HTML','CSS','Java','C','C++','C#','Rust','Go','Ruby','PHP','Bash','Lua','Swift','Kotlin','Scala','R','Haskell'].includes(lang)) {
            escaped = JungleUI._highlightJS(escaped, tok);
        } else if (lang === 'Java' || lang === 'C#') {
            escaped = escaped.replace(
                /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\$"(?:[^"\\]|\\.)*")|\b((?:(?:public|private|protected|internal|static|final|abstract|sealed|override|virtual|new|async|partial|readonly|volatile|transient|synchronized|native|strictfp|extern|unsafe|ref|out|in|params)\s+)+)?(void|int|long|short|byte|double|float|boolean|bool|char|string|String|var|object|dynamic|decimal|uint|ulong|ushort|sbyte)\b|\b(public|private|protected|internal|static|final|abstract|sealed|override|virtual|new|async|partial|readonly|volatile|class|interface|enum|record|struct|extends|implements|throws|import|package|using|namespace|return|if|else|while|for|foreach|do|switch|case|break|continue|try|catch|finally|throw|null|true|false|this|base|super|instanceof|typeof|sizeof|checked|unchecked|lock|yield|goto|default|delegate|event|operator|explicit|implicit|fixed)\b|(\bvoid\s+(\w+)\s*\(|\b(\w+)\s+(\w+)\s*\()|\b([A-Z][A-Za-z0-9_<>[\]]*)\b|\b(\d+\.?\d*[fFdDlLmM]?|0x[\da-fA-F]+)\b/g,
                (m, comment, str, mods, prim, kw, fnFull, fnName, ctorFull, ctorName, type, num) => {
                    if (comment) return tok('token-comment', comment);
                    if (str)  return tok('token-string', str);
                    if (prim) return tok('token-type', (mods ? tok('token-keyword', mods.trim()) + ' ' : '') + prim);
                    if (kw)   return tok('token-keyword', kw);
                    if (fnFull && fnName) return 'void ' + tok('token-fn', fnName) + '(';
                    if (type) return tok('token-type', type);
                    if (num)  return tok('token-number', num);
                    return m;
                }
            );
        } else if (lang === 'C' || lang === 'C++') {
            escaped = escaped.replace(
                /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(#\w+[^\n]*)|(\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*')|\b(auto|const|constexpr|consteval|constinit|static|inline|extern|register|volatile|mutable|explicit|virtual|override|final|friend|operator|template|typename|namespace|using|typedef|struct|class|union|enum|public|private|protected|new|delete|return|if|else|while|for|do|switch|case|break|continue|try|catch|throw|nullptr|NULL|true|false|this|sizeof|decltype|noexcept|static_assert|co_await|co_return|co_yield)\b|\b(void|int|long|short|char|unsigned|signed|float|double|bool|size_t|uint8_t|uint16_t|uint32_t|uint64_t|int8_t|int16_t|int32_t|int64_t|ptrdiff_t|wchar_t|auto)\b|\b([A-Z][A-Za-z0-9_]*)\b|(\b\w+)(?=\s*\()|\b(\d+\.?\d*[fFlLuU]*|0x[\da-fA-F]+|0b[01]+)\b/g,
                (m, comment, preproc, str, kw, prim, type, fnCall, num) => {
                    if (comment) return tok('token-comment', comment);
                    if (preproc) return tok('token-decorator', preproc);
                    if (str)     return tok('token-string', str);
                    if (kw)      return tok('token-keyword', kw);
                    if (prim)    return tok('token-type', prim);
                    if (type)    return tok('token-type', type);
                    if (fnCall)  return tok('token-fn', fnCall);
                    if (num)     return tok('token-number', num);
                    return m;
                }
            );
        } else if (lang === 'Rust') {
            escaped = escaped.replace(
                /(\/\/[^\n]*|\/\/!.*|\/\*[\s\S]*?\*\/)|(b?"(?:\\.|[^"\\])*"|r#*"[\s\S]*?"#*|'(?:[^'\\]|\\.)')|(!?\[[\w:, ]*\])|(\bfn\s+(\w+))|(\bstruct\s+(\w+))|(\benum\s+(\w+))|(\btrait\s+(\w+))|(\bimpl(?:<[^>]*>)?\s+(\w+))|\b(pub|crate|mod|use|let|mut|const|static|fn|struct|enum|impl|trait|type|where|for|in|if|else|while|loop|match|return|break|continue|self|Self|super|async|await|move|ref|unsafe|extern|dyn|box|yield|become|abstract|final|override|priv|typeof|unsized|virtual|do|try)\b|\b(true|false|None|Some|Ok|Err)\b|\b(println!|print!|eprintln!|eprint!|format!|vec!|assert!|assert_eq!|assert_ne!|panic!|todo!|unimplemented!|dbg!|write!|writeln!|include!|env!|concat!|stringify!)\b|\b([A-Z][A-Z0-9_]{2,})\b|\b([A-Z][a-zA-Z0-9_]*)\b|(&amp;(?:mut\s+)?'?\w*)|(\b\d+\.?\d*(?:[eE][+-]?\d+)?(?:f32|f64|u8|u16|u32|u64|u128|i8|i16|i32|i64|i128|usize|isize)?|0x[\da-fA-F_]+|0b[01_]+|0o[0-7_]+)\b/g,
                (m, comment, str, attr, fnFull, fnName, sFull, sName, eFull, eName, tFull, tName, iFull, iName, kw, lit, mac, constant, type, lifetime, num) => {
                    if (comment)  return tok('token-comment', comment);
                    if (str)      return tok('token-string', str);
                    if (attr)     return tok('token-decorator', attr);
                    if (fnFull)   return tok('token-keyword', 'fn') + ' ' + tok('token-fn', fnName);
                    if (sFull)    return tok('token-keyword', 'struct') + ' ' + tok('token-type', sName);
                    if (eFull)    return tok('token-keyword', 'enum') + ' ' + tok('token-type', eName);
                    if (tFull)    return tok('token-keyword', 'trait') + ' ' + tok('token-type', tName);
                    if (iFull)    return tok('token-keyword', 'impl') + ' ' + tok('token-type', iName);
                    if (kw)       return tok('token-keyword', kw);
                    if (lit)      return tok('token-keyword', lit);
                    if (mac)      return tok('token-builtin', mac);
                    if (constant) return tok('token-type', constant);
                    if (type)     return tok('token-type', type);
                    if (lifetime) return tok('token-decorator', lifetime);
                    if (num)      return tok('token-number', num);
                    return m;
                }
            );
        } else if (lang === 'Go') {
            escaped = escaped.replace(
                /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|`[\s\S]*?`|'(?:\\.|[^'\\])')|(\bfunc\s+(\w+))|(\btype\s+(\w+))|\b(func|var|const|type|struct|interface|map|chan|go|defer|select|switch|case|return|if|else|for|range|import|package|break|continue|fallthrough|goto|default)\b|\b(make|new|len|cap|append|copy|delete|close|panic|recover|print|println|real|imag|complex|clear)\b|\b(true|false|nil|iota)\b|\b(string|int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|uintptr|float32|float64|complex64|complex128|bool|byte|rune|error|any)\b|\b([A-Z][a-zA-Z0-9_]*)\b|(\b\d+\.?\d*(?:[eE][+-]?\d+)?i?|0x[\da-fA-F]+|0b[01]+|0o[0-7]+)\b/g,
                (m, comment, str, fnFull, fnName, tFull, tName, kw, builtin, lit, prim, type, num) => {
                    if (comment) return tok('token-comment', comment);
                    if (str)     return tok('token-string', str);
                    if (fnFull)  return tok('token-keyword', 'func') + ' ' + tok('token-fn', fnName);
                    if (tFull)   return tok('token-keyword', 'type') + ' ' + tok('token-type', tName);
                    if (kw)      return tok('token-keyword', kw);
                    if (builtin) return tok('token-builtin', builtin);
                    if (lit)     return tok('token-keyword', lit);
                    if (prim)    return tok('token-type', prim);
                    if (type)    return tok('token-type', type);
                    if (num)     return tok('token-number', num);
                    return m;
                }
            );
        } else if (lang === 'Ruby') {
            escaped = escaped.replace(
                /(#[^\n]*)|(%[qQwWiIrsx]?(?:(?:\{[\s\S]*?\})|(?:\[[\s\S]*?\])|(?:\([\s\S]*?\))|(?:\/[\s\S]*?\/))|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*'|:\w+|<<~?\w+[\s\S]*?\n\w+)|(\bdef\s+(\w+[?!]?))|(\bclass\s+(\w+))|(\bmodule\s+(\w+))|\b(def|class|module|return|if|elsif|else|unless|while|until|for|in|do|end|begin|rescue|ensure|raise|next|break|yield|include|extend|require|require_relative|attr_reader|attr_writer|attr_accessor|lambda|proc|then|case|when|self|super|nil|true|false|and|or|not|defined?)\b|\b(puts|print|p|pp|gets|rand|sleep|exit|abort|raise|require|load|sprintf|format|Array|String|Integer|Float|Hash|Symbol|Regexp|File|IO|Dir|Math|Time|Proc|Method|Range|Struct|Comparable|Enumerable|Kernel|Object|BasicObject)\b|\b([A-Z][A-Za-z0-9_:]*)\b|(@{1,2}\w+)|(\b\d+\.?\d*(?:[eE][+-]?\d+)?|0x[\da-fA-F]+|0b[01]+|0o[0-7]+)\b/g,
                (m, comment, str, defFull, fnName, clsFull, clsName, modFull, modName, kw, builtin, type, ivar, num) => {
                    if (comment) return tok('token-comment', comment);
                    if (str)     return tok('token-string', str);
                    if (defFull) return tok('token-keyword', 'def') + ' ' + tok('token-fn', fnName);
                    if (clsFull) return tok('token-keyword', 'class') + ' ' + tok('token-type', clsName);
                    if (modFull) return tok('token-keyword', 'module') + ' ' + tok('token-type', modName);
                    if (kw)      return tok('token-keyword', kw);
                    if (builtin) return tok('token-builtin', builtin);
                    if (type)    return tok('token-type', type);
                    if (ivar)    return tok('token-decorator', ivar);
                    if (num)     return tok('token-number', num);
                    return m;
                }
            );
        } else if (lang === 'PHP') {
            escaped = escaped.replace(
                /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|("""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|<<<(?:EOT|EOD|EOH|SQL|HTML|EOF)[\s\S]*?(?:EOT|EOD|EOH|SQL|HTML|EOF);)|\b(function\s+(\w+))|(\bclass\s+(\w+))|\b(echo|print|return|if|elseif|else|while|for|foreach|do|switch|case|break|continue|try|catch|finally|throw|class|interface|trait|extends|implements|new|null|true|false|public|private|protected|static|final|abstract|namespace|use|require|require_once|include|include_once|fn|match|yield|enum)\b|\b(array|string|int|float|bool|void|mixed|object|callable|iterable|never|self|parent|static)\b|\b(print_r|var_dump|var_export|isset|empty|unset|count|strlen|strpos|str_replace|array_push|array_pop|array_map|array_filter|sort|in_array|implode|explode|json_encode|json_decode|date|time|rand|htmlspecialchars|trim|strtolower|strtoupper|sprintf|printf|header|die|exit)\b|(\$\w+)|(\b\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g,
                (m, comment, str, fnFull, fnName, clsFull, clsName, kw, prim, builtin, variable, num) => {
                    if (comment)  return tok('token-comment', comment);
                    if (str)      return tok('token-string', str);
                    if (fnFull)   return tok('token-keyword', 'function') + ' ' + tok('token-fn', fnName);
                    if (clsFull)  return tok('token-keyword', 'class') + ' ' + tok('token-type', clsName);
                    if (kw)       return tok('token-keyword', kw);
                    if (prim)     return tok('token-type', prim);
                    if (builtin)  return tok('token-builtin', builtin);
                    if (variable) return tok('token-property', variable);
                    if (num)      return tok('token-number', num);
                    return m;
                }
            );
        } else if (lang === 'Bash' || lang === 'Shell') {
            escaped = escaped.replace(
                /(#[^\n]*)|(\"(?:\\.|[^\"\\])*\"|'[^']*'|\$\{[^}]*\}|\$\([^)]*\)|\$\w+)|(\bfunction\s+(\w+)|\b(\w+)\s*\(\s*\)\s*\{)|\b(if|then|else|elif|fi|for|in|do|done|while|until|case|esac|return|exit|break|continue|local|export|readonly|source|shift|set|unset|trap|wait|jobs|bg|fg|kill|exec|eval)\b|\b(echo|printf|read|cd|ls|pwd|mkdir|rmdir|rm|cp|mv|cat|grep|sed|awk|sort|uniq|wc|head|tail|find|xargs|cut|tr|test|true|false|source|alias|type|which|command|builtin|declare|typeset|getopts)\b|(\$\w+|\$\{[^}]*\})|(\b\d+)\b/g,
                (m, comment, str, fnFull, fnName1, fnName2, kw, builtin, variable, num) => {
                    if (comment)  return tok('token-comment', comment);
                    if (str)      return tok('token-string', str);
                    if (fnFull)   return tok('token-keyword', fnName1 ? 'function' : '') + ' ' + tok('token-fn', fnName1 || fnName2) + (fnName1 ? '' : '() {');
                    if (kw)       return tok('token-keyword', kw);
                    if (builtin)  return tok('token-builtin', builtin);
                    if (variable) return tok('token-property', variable);
                    if (num)      return tok('token-number', num);
                    return m;
                }
            );
        } else {
            // JS/TS default
            escaped = JungleUI._highlightJS(escaped, tok);
        }
        highlightOverlay.innerHTML = finalize(escaped);
        this.updateLineNumbers();
    }
    // Returns syntax-highlighted HTML for arbitrary lang+code (used by Whole Project view)
    static highlightCode(lang, code) {
        let escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const spans = [];
        function tok(cls, content) { const id = spans.length; spans.push(`<span class="${cls}">${content}</span>`); return `\x00${id}\x00`; }
        function finalize(s) { return s.replace(/\x00(\d+)\x00/g, (_, i) => spans[+i]); }
        // Reuse updateCodeHighlight's logic by temporarily swapping editor value
        const savedValue = editor.value, savedLangs = selectedLanguages.slice();
        editor.value = code;
        selectedLanguages[0] = lang;
        JungleUI.updateCodeHighlight();
        const html = highlightOverlay.innerHTML;
        editor.value = savedValue;
        selectedLanguages[0] = savedLangs[0];
        JungleUI.updateCodeHighlight();
        return html;
    }
    static _highlightJS(escaped, tok) {
        return escaped.replace(
            /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(\/(?:[^/\\\n]|\\.)+\/[gimsuy]*)|(\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b((?:async\s+)?function\*?\s+(\w+)|(\w+)\s*(?==\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>)))|(\b(\w+)\s*\()|\b(const|let|var|return|if|else|while|for|of|in|import|export|default|class|extends|new|this|super|async|await|void|typeof|instanceof|delete|try|catch|finally|throw|switch|case|break|continue|do|yield|static|get|set|from|as|debugger)\b|\b(type|interface|enum|implements|declare|readonly|abstract|override|keyof|infer|never|unknown|any|namespace|satisfies|asserts|is|out|accessor)\b|\b(true|false|null|undefined|NaN|Infinity)\b|\b(console|Math|JSON|Object|Array|String|Number|Boolean|Promise|Map|Set|WeakMap|WeakSet|Date|Error|RegExp|Symbol|Proxy|Reflect|globalThis|window|document|navigator|fetch|setTimeout|setInterval|clearTimeout|clearInterval|queueMicrotask|requestAnimationFrame|localStorage|sessionStorage|performance|URL|FormData|Headers|Request|Response)\b|\b([A-Z][A-Za-z0-9_]*)\b|\b(\d+\.?\d*(?:[eE][+-]?\d+)?n?|0x[\da-fA-F]+|0b[01]+|0o[0-7]+)\b/g,
            (m, comment, regex, str, fnDecl, fnName1, fnName2, callFull, callName, kw, tsKw, lit, globalObj, type, num) => {
                if (comment)   return tok('token-comment', comment);
                if (regex)     return tok('token-string', regex);
                if (str)       return tok('token-string', str);
                if (fnDecl)    return tok('token-keyword', fnDecl.replace(fnName1 || fnName2, '').trim()) + ' ' + tok('token-fn', fnName1 || fnName2);
                if (callFull && callName)  return tok('token-fn', callName) + '(';
                if (kw)        return tok('token-keyword', kw);
                if (tsKw)      return tok('token-keyword', tsKw);
                if (lit)       return tok('token-keyword', lit);
                if (globalObj) return tok('token-builtin', globalObj);
                if (type)      return tok('token-type', type);
                if (num)       return tok('token-number', num);
                return m;
            }
        );
    }
    static _highlightCSS(escaped, tok) {
        return escaped.replace(
            /(\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(#[0-9a-fA-F]{3,8}(?=[;\s,)])|rgb\w*\([^)]*\)|hsl\w*\([^)]*\))|((?:[\w-]+\s*,\s*)*[\w-]+\s*\{)|(@[\w-]+)|(\b\d+\.?\d*(?:px|em|rem|%|vh|vw|vmin|vmax|dvh|dvw|svh|svw|ch|ex|fr|s|ms|deg|rad|turn|dpi|dpcm)?\b)|\b(animation|appearance|aspect-ratio|background|border|border-radius|bottom|box-shadow|box-sizing|clip|clip-path|color|column|content|cursor|direction|display|filter|flex|float|font|gap|grid|height|inset|justify|left|letter-spacing|line-height|list-style|margin|max-height|max-width|min-height|min-width|object-fit|opacity|order|outline|overflow|padding|place|pointer-events|position|resize|right|row-gap|scroll|shape|text|top|transform|transition|user-select|visibility|white-space|width|will-change|word|writing-mode|z-index)\b|\b(auto|none|block|flex|grid|inline|inline-block|inline-flex|inline-grid|absolute|relative|fixed|sticky|static|inherit|initial|unset|revert|normal|bold|italic|center|left|right|justify|solid|dashed|dotted|hidden|visible|scroll|clip|ellipsis|nowrap|wrap|row|column|start|end|stretch|space-between|space-around|space-evenly|transparent|currentColor)\b/g,
            (m, comment, str, color, selector, atRule, num, property, value) => {
                if (comment)  return tok('token-comment', comment);
                if (str)      return tok('token-string', str);
                if (color)    return tok('token-string', color);
                if (selector) return tok('token-type', selector);
                if (atRule)   return tok('token-decorator', atRule);
                if (num)      return tok('token-number', num);
                if (property) return tok('token-property', property);
                if (value)    return tok('token-value', value);
                return m;
            }
        );
    }
    static updateLineNumbers() {
        const count = editor.value.split('\n').length;
        lineGutter.textContent = Array.from({length: count}, (_, i) => i + 1).join('\n') + '\n';
    }
    static updateLinesOfCodeCount() {
        const code = editor.value;
        locDisplay.textContent = `LOC: ${code.split('\n').length}`;
    }
    static showCustomModal({ title, placeholder, onConfirm, description = "" }) {
        const modal = document.getElementById('custom-modal');
        const mTitle = document.getElementById('modal-title');
        const mInput = document.getElementById('modal-input');
        const mCancel = document.getElementById('modal-cancel');
        const mConfirm = document.getElementById('modal-confirm');
        const mBodyText = document.getElementById('modal-body-text');
        mTitle.textContent = title;
        if (description) {
            mBodyText.textContent = description;
            mBodyText.style.display = 'block';
        } else {
            mBodyText.style.display = 'none';
        }
        if (placeholder === null) {
            mInput.style.display = 'none';
        } else {
            mInput.style.display = 'block';
            mInput.placeholder = placeholder;
            mInput.value = '';
        }
        modal.classList.add('show');
        mConfirm.onclick = () => {
            onConfirm(mInput.value.trim());
            modal.classList.remove('show');
        };
        mCancel.onclick = () => {
            modal.classList.remove('show');
        };
    }
}
