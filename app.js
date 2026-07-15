// --- DOM Elements Reference Cache ---
var splashScreen = document.getElementById('splash-screen');
var enterBtn = document.getElementById('enter-btn');
var projectsDashboard = document.getElementById('projects-dashboard');
var workspaceContainer = document.getElementById('workspace-container');
var exitToHubHeaderBtn = document.getElementById('exit-to-hub-header-btn');
var exitToSplashBtn = document.getElementById('exit-to-splash-btn');
var editor = document.getElementById('code-editor');
var highlightOverlay = document.getElementById('highlight-overlay');
var lineGutter = document.getElementById('line-gutter');
var editorWrapper = document.getElementById('editor-wrapper');
var currentFileLabel = document.getElementById('current-file-label');
var locDisplay = document.getElementById('loc-display');
var projectTitleBtn = document.getElementById('project-title-btn');
var tabPreview = document.getElementById('tab-preview');
var fileListContainer = document.getElementById('file-list');
var previewFrame = document.getElementById('preview-frame');
var addFileBtn = document.getElementById('add-file-btn');
var addProjectBtnDash = document.getElementById('add-project-btn-dash');
var tabTerminalBtn = document.getElementById('tab-terminal-btn');
var runBtn = document.getElementById('run-btn');
var terminalViewContainer = document.getElementById('terminal-view-container');
var terminalViewBody = document.getElementById('terminal-view-body');
var terminalStatus = document.getElementById('terminal-status');
var terminalInput = document.getElementById('terminal-input');
var extensionsBtn = document.getElementById('extensions-btn');
var fileSearchInput = document.getElementById('file-search-input');
var languageMenu = document.getElementById('language-menu');
var currentLanguageText = document.getElementById('current-language-text');
var languageListDropdown = document.getElementById('language-list-dropdown');
var headerCopyCodeBtn = document.getElementById('header-copy-code-btn');
var toastContainer = document.getElementById('toast-container');
var tabConsoleBtn = document.getElementById('tab-console');
var consoleViewContainer = document.getElementById('console-view-container');
var projectViewContainer = document.getElementById('project-view-container');
var consoleViewBody = document.getElementById('console-view-body');
var consoleStatus = document.getElementById('console-status');
var jungleTextEngine = new JungleTextEngine(editor);
// --- Core State Variables ---
var projects = [];
var currentProjectId = null;
var selectedLanguages = ['Javascript'];
var activeView = 'editor'; // 'editor', 'preview', 'terminal', 'console'
var manualLanguageOverride = false;
var terminalHistory = [];
var terminalHistoryIdx = -1;
function showConsoleIssues(issues, filename) {
    if (!issues || issues.length === 0) {
        consoleViewBody.innerHTML = `<span style="color:#74a896">✓ No issues detected in ${filename || 'current file'}.</span>`;
        consoleStatus.textContent = 'CLEAR';
        consoleStatus.style.color = '#74a896';
        return;
    }
    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');
    const infos = issues.filter(i => i.severity === 'info');
    consoleStatus.textContent = errors.length ? `${errors.length} ERROR${errors.length > 1 ? 'S' : ''}` : `${warnings.length} WARN`;
    consoleStatus.style.color = errors.length ? '#FF5555' : '#FFB86C';
    const rows = issues.map(i => {
        const color = i.severity === 'error' ? '#FF5555' : i.severity === 'warning' ? '#FFB86C' : '#74a896';
        const icon = i.severity === 'error' ? '✗' : i.severity === 'warning' ? '⚠' : 'ℹ';
        const hint = i.hint ? `\n       💡 ${i.hint}` : '';
        return `<span style="color:${color}">${icon} Line ${i.line || '?'}  [${i.kind || i.severity}]  ${i.msg}${hint}</span>`;
    }).join('\n');
    consoleViewBody.innerHTML = `<span style="color:#4a6057">${filename || 'file'} — ${issues.length} issue${issues.length > 1 ? 's' : ''}</span>\n${'─'.repeat(44)}\n${rows}`;
}
// Structured console renderer: group findings into collapsible sections and show the
// exact source context for every line-based issue.
function showConsoleIssues(issues, filename) {
    const project = typeof JungleUI !== 'undefined' ? JungleUI.getCurrentProject() : null;
    const sourceLines = project && filename && project.files[filename] !== undefined
        ? String(project.files[filename] || '').split('\n') : [];
    const order = ['error', 'warning', 'info'];
    const names = { error: 'Error', warning: 'Warning', info: 'Info' };
    const colors = { error: '#FF5555', warning: '#FFB86C', info: '#74a896' };
    const add = (parent, text, className, color) => {
        const node = document.createElement('div');
        node.className = className || '';
        node.textContent = text;
        if (color) node.style.color = color;
        parent.appendChild(node);
        return node;
    };
    const addSnippet = (parent, issue) => {
        const line = Number(issue.line);
        if (!Number.isInteger(line) || line < 1 || line > sourceLines.length) return;
        const block = document.createElement('pre');
        block.className = 'console-code-snippet';
        for (let number = Math.max(1, line - 1); number <= Math.min(sourceLines.length, line + 1); number++) {
            const row = document.createElement('div');
            row.className = number === line ? 'console-code-line current' : 'console-code-line';
            row.textContent = (number === line ? '> ' : '  ') + String(number).padStart(4, ' ') + ' | ' + sourceLines[number - 1];
            block.appendChild(row);
            if (number === line && issue.column) {
                const caret = document.createElement('div');
                caret.className = 'console-code-caret';
                caret.textContent = ' '.repeat(Math.max(0, 8 + Number(issue.column))) + '^';
                block.appendChild(caret);
            }
        }
        parent.appendChild(block);
    };
    consoleViewBody.innerHTML = '';
    if (!issues || issues.length === 0) {
        add(consoleViewBody, 'No issues detected in ' + (filename || 'current file') + '.', 'console-clear', '#74a896');
        consoleStatus.textContent = 'CLEAR';
        consoleStatus.style.color = '#74a896';
        return;
    }
    const errors = issues.filter(issue => issue.severity === 'error');
    const warnings = issues.filter(issue => issue.severity === 'warning');
    const infos = issues.filter(issue => issue.severity === 'info');
    consoleStatus.textContent = errors.length ? errors.length + ' ERROR' + (errors.length > 1 ? 'S' : '') : warnings.length ? warnings.length + ' WARN' : infos.length + ' INFO';
    consoleStatus.style.color = errors.length ? '#FF5555' : warnings.length ? '#FFB86C' : '#74a896';
    add(consoleViewBody, (filename || 'file') + ' - ' + issues.length + ' issue' + (issues.length === 1 ? '' : 's'), 'console-issue-file', '#4a6057');
    for (const severity of order) {
        const group = issues.filter(issue => (issue.severity || 'warning') === severity);
        if (!group.length) continue;
        const lines = group.map(issue => Number(issue.line)).filter(line => Number.isInteger(line) && line > 0);
        const first = lines.length ? Math.min(...lines) : '?';
        const last = lines.length ? Math.max(...lines) : '?';
        const range = first === last ? String(first) : first + '-' + last;
        const details = document.createElement('details');
        details.className = 'console-issue-group ' + severity;
        details.open = group.length === 1;
        const summary = document.createElement('summary');
        summary.textContent = names[severity] + (group.length > 1 ? 's' : '') + ' - lines ' + range + (group.length > 1 ? ' (' + group.length + ')' : '');
        details.appendChild(summary);
        for (const issue of group) {
            const item = document.createElement('div');
            item.className = 'console-issue-item';
            const lineText = Number.isInteger(Number(issue.line)) && Number(issue.line) > 0 ? ' on line ' + issue.line : '';
            const message = String(issue.msg || issue.kind || 'Issue').replace(/^error:\s*/i, '');
            add(item, names[severity] + ': ' + message + lineText + (filename ? ' | File ' + filename : ''), 'console-issue-message', colors[severity]);
            if (issue.kind) add(item, '[' + issue.kind + ']', 'console-issue-kind', '#6f8980');
            // Keep a single error immediately readable. For a group, the dropdown stays
            // compact and lists the locations without repeating large source snippets.
            if (group.length === 1) addSnippet(item, issue);
            if (issue.hint) add(item, 'Hint: ' + issue.hint, 'console-issue-hint', '#9bb8ad');
            details.appendChild(item);
        }
        consoleViewBody.appendChild(details);
    }
}

function terminalPrint(text) {
    terminalViewBody.textContent += text;
    terminalViewBody.scrollTop = terminalViewBody.scrollHeight;
}
function executeTerminalCommand(cmdLine) {
    const raw = cmdLine.trim();
    if (!raw) return;
    terminalHistory.unshift(raw);
    terminalHistoryIdx = -1;
    terminalPrint(`\njungle:~$ ${raw}\n`);
    // Handle pipes: cmd1 | cmd2 (basic: only passes stdout of first as stdin to second)
    const parts = raw.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);
    const p = JungleUI.getCurrentProject();
    const files = p ? Object.keys(p.files) : [];
    const now = new Date();
    switch (command) {
        case 'help':
            terminalPrint(
`Jungle Terminal — available commands:

  FILE SYSTEM
    ls [path]          List project files
    cat <file>         Print file contents
    head <file>        First 10 lines of a file
    tail <file>        Last 10 lines of a file
    wc <file>          Word/line/char count
    grep <pat> <file>  Search for pattern in file
    touch <file>       Create an empty file
    rm <file>          Delete a file
    mv <old> <new>     Rename a file
    cp <src> <dst>     Copy a file
    pwd                Print working directory
    mkdir <name>       Create a directory (virtual)
    stat <file>        File info

  CODE
    run                Compile & run current file
    run <file>         Compile & run a specific file
    node <file>        Run JS file with Node.js
    python <file>      Run Python file
    python3 <file>     Run Python file
    g++ <file>         Compile & run C++ file
    gcc <file>         Compile & run C file
    javac <file>       Compile & run Java file
    tsc <file>         Compile TypeScript file
    analyze            Static analysis + cross-file semantic checks
    lint               Alias for analyze
    fmt                Format active file (auto-indent)

  ENVIRONMENT
    env                Show environment variables
    echo <text>        Print text
    date               Print current date/time
    whoami             Print current user
    hostname           Print hostname
    uname              System info
    uptime             Session uptime

  TERMINAL
    history            Show command history
    clear              Clear terminal
    open <file>        Switch editor to file
    info               Show project info
    exit               Return to editor view
`);
            break;
        case 'clear':
            terminalViewBody.textContent = 'Jungle Terminal — type \'help\' for commands.\n';
            break;
        case 'pwd':
            terminalPrint(`/workspace/${p ? p.name.replace(/\s+/g, '-').toLowerCase() : 'project'}\n`);
            break;
        case 'whoami':
            terminalPrint(`jungle-user\n`);
            break;
        case 'hostname':
            terminalPrint(`jungle-sandbox\n`);
            break;
        case 'uname':
            terminalPrint(`Linux jungle-sandbox 6.1.0 #1 SMP x86_64 GNU/Linux\n`);
            break;
        case 'date':
            terminalPrint(`${now.toDateString()} ${now.toTimeString().split(' ')[0]}\n`);
            break;
        case 'uptime':
            terminalPrint(`up 0 days, session active — jungle sandbox\n`);
            break;
        case 'env':
            terminalPrint(`SHELL=/bin/bash\nLANG=en_US.UTF-8\nTERM=xterm-256color\nUSER=jungle-user\nHOME=/workspace\nPATH=/usr/local/bin:/usr/bin:/bin\nEDITOR=jungle\nJUNGLE_VERSION=1.0.0\n`);
            break;
        case 'echo':
            terminalPrint(args.join(' ').replace(/^["']|["']$/g, '') + '\n');
            break;
        case 'ls':
            if (!p) { terminalPrint(`ls: no project open\n`); break; }
            if (files.length === 0) { terminalPrint(`(empty project)\n`); break; }
            terminalPrint(files.map(f => {
                const lines = (p.files[f] || '').split('\n').length;
                const ext = f.split('.').pop();
                return `${f.padEnd(28)} ${String(lines).padStart(4)} lines`;
            }).join('\n') + '\n');
            break;
        case 'cat':
            if (!args[0]) { terminalPrint(`cat: missing operand\n`); break; }
            if (!p || p.files[args[0]] === undefined) { terminalPrint(`cat: ${args[0]}: No such file\n`); break; }
            terminalPrint((p.files[args[0]] || '(empty)') + '\n');
            break;
        case 'head': {
            if (!args[0]) { terminalPrint(`head: missing operand\n`); break; }
            if (!p || p.files[args[0]] === undefined) { terminalPrint(`head: ${args[0]}: No such file\n`); break; }
            const headLines = (p.files[args[0]] || '').split('\n').slice(0, 10).join('\n');
            terminalPrint(headLines + '\n');
            break;
        }
        case 'tail': {
            if (!args[0]) { terminalPrint(`tail: missing operand\n`); break; }
            if (!p || p.files[args[0]] === undefined) { terminalPrint(`tail: ${args[0]}: No such file\n`); break; }
            const tailLines = (p.files[args[0]] || '').split('\n').slice(-10).join('\n');
            terminalPrint(tailLines + '\n');
            break;
        }
        case 'wc': {
            if (!args[0]) { terminalPrint(`wc: missing operand\n`); break; }
            if (!p || p.files[args[0]] === undefined) { terminalPrint(`wc: ${args[0]}: No such file\n`); break; }
            const content = p.files[args[0]] || '';
            const lineCount = content.split('\n').length;
            const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
            const charCount = content.length;
            terminalPrint(`${String(lineCount).padStart(6)} ${String(wordCount).padStart(7)} ${String(charCount).padStart(7)} ${args[0]}\n`);
            break;
        }
        case 'grep': {
            if (args.length < 2) { terminalPrint(`Usage: grep <pattern> <file>\n`); break; }
            if (!p || p.files[args[1]] === undefined) { terminalPrint(`grep: ${args[1]}: No such file\n`); break; }
            const pattern = args[0].replace(/^\/|\/[gimsuy]*$/g, '');
            let re;
            try { re = new RegExp(pattern, 'i'); } catch { terminalPrint(`grep: invalid pattern\n`); break; }
            const matched = (p.files[args[1]] || '').split('\n')
                .map((l, i) => re.test(l) ? `${String(i+1).padStart(4)}: ${l}` : null)
                .filter(Boolean);
            terminalPrint(matched.length ? matched.join('\n') + '\n' : `(no matches)\n`);
            break;
        }
        case 'touch':
            if (!args[0]) { terminalPrint(`touch: missing file operand\n`); break; }
            if (!p) { terminalPrint(`touch: no project open\n`); break; }
            if (p.files[args[0]] !== undefined) { terminalPrint(`touch: ${args[0]}: already exists\n`); break; }
            p.files[args[0]] = '';
            JungleStor.save(projects);
            JungleUI.renderFileList();
            terminalPrint(`Created: ${args[0]}\n`);
            break;
        case 'rm':
            if (!args[0]) { terminalPrint(`rm: missing operand\n`); break; }
            if (!p || p.files[args[0]] === undefined) { terminalPrint(`rm: ${args[0]}: No such file\n`); break; }
            if (Object.keys(p.files).length <= 1) { terminalPrint(`rm: cannot remove last file\n`); break; }
            delete p.files[args[0]];
            if (p.currentFile === args[0]) p.currentFile = Object.keys(p.files)[0];
            JungleStor.save(projects);
            JungleUI.renderFileList();
            JungleUI.loadFile(p.currentFile);
            terminalPrint(`removed '${args[0]}'\n`);
            break;
        case 'mv':
            if (args.length < 2) { terminalPrint(`Usage: mv <old> <new>\n`); break; }
            if (!p || p.files[args[0]] === undefined) { terminalPrint(`mv: ${args[0]}: No such file\n`); break; }
            if (p.files[args[1]] !== undefined) { terminalPrint(`mv: ${args[1]}: already exists\n`); break; }
            p.files[args[1]] = p.files[args[0]];
            delete p.files[args[0]];
            if (p.currentFile === args[0]) p.currentFile = args[1];
            JungleStor.save(projects);
            JungleUI.renderFileList();
            terminalPrint(`'${args[0]}' -> '${args[1]}'\n`);
            break;
        case 'cp':
            if (args.length < 2) { terminalPrint(`Usage: cp <src> <dst>\n`); break; }
            if (!p || p.files[args[0]] === undefined) { terminalPrint(`cp: ${args[0]}: No such file\n`); break; }
            p.files[args[1]] = p.files[args[0]];
            JungleStor.save(projects);
            JungleUI.renderFileList();
            terminalPrint(`'${args[0]}' -> '${args[1]}'\n`);
            break;
        case 'mkdir':
            terminalPrint(`mkdir: directories are virtual in Jungle — use touch to create files\n`);
            break;
        case 'stat':
            if (!args[0]) { terminalPrint(`stat: missing operand\n`); break; }
            if (!p || p.files[args[0]] === undefined) { terminalPrint(`stat: ${args[0]}: No such file\n`); break; }
            { const c = p.files[args[0]] || ''; terminalPrint(`  File: ${args[0]}\n  Size: ${c.length} bytes\n Lines: ${c.split('\n').length}\n`); }
            break;
        case 'open':
            if (!args[0]) { terminalPrint(`Usage: open <filename>\n`); break; }
            if (!p || p.files[args[0]] === undefined) { terminalPrint(`open: ${args[0]}: No such file\n`); break; }
            JungleUI.switchToFile(args[0]);
            terminalPrint(`Opened ${args[0]}\n`);
            break;
        case 'info':
            if (!p) { terminalPrint(`No project open.\n`); break; }
            terminalPrint(`Project:     ${p.name}\nFile:        ${p.currentFile}\nLanguage:    ${selectedLanguages[0]}\nFiles:       ${files.length}\nTotal LOC:   ${files.reduce((n, f) => n + (p.files[f] || '').split('\n').length, 0)}\nRuntime:     Jungle Sandbox (Judge0 / Piston / WASM)\n`);
            break;
        case 'history':
            terminalPrint(terminalHistory.slice().reverse().map((c, i) => `  ${String(i+1).padStart(3)}  ${c}`).join('\n') + '\n');
            break;
        case 'analyze':
        case 'lint':
            if (!p) { terminalPrint(`No project open.\n`); break; }
            { const fileLang = JungleIntelligence.languageFromFilename(p.currentFile, selectedLanguages[0]);
              const issues = JungleScanner.scan(fileLang, p.files[p.currentFile] || '');
              if (typeof JungleAnalyzer !== 'undefined') {
                  try { issues.push(...JungleAnalyzer.analyze(fileLang, p.files, p.currentFile)); } catch (_) {}
              }
              issues.sort((a, b) => (a.line || 0) - (b.line || 0));
              if (issues.length === 0) { terminalPrint(`✓ No issues found in ${p.currentFile}\n`); }
              else { terminalPrint(issues.map(i => `  ${i.severity === 'error' ? '✗' : i.severity === 'warning' ? '⚠' : 'ℹ'} Line ${i.line}: [${i.kind}] ${i.msg}`).join('\n') + '\n'); }
            }
            break;
        case 'fmt':
        case 'format':
            terminalPrint(`fmt: auto-format not yet implemented\n`);
            break;
        case 'exit':
            switchView('editor');
            break;
        case 'run':
            if (!p) { terminalPrint(`No project open.\n`); break; }
            if (args[0]) {
                if (p.files[args[0]] === undefined) { terminalPrint(`run: ${args[0]}: No such file\n`); break; }
                JungleUI.switchToFile(args[0]);
            }
            JungleRunner.execute(selectedLanguages[0], p.files[p.currentFile], p.files);
            break;
        case 'node':
        case 'python':
        case 'python3':
        case 'g++':
        case 'gcc':
        case 'javac':
        case 'tsc': {
            if (!p) { terminalPrint(`No project open.\n`); break; }
            const langMap = { node: 'Javascript', python: 'Python', python3: 'Python', 'g++': 'C++', gcc: 'C', javac: 'Java', tsc: 'TypeScript' };
            const targetFile = args[0] || p.currentFile;
            if (p.files[targetFile] === undefined) { terminalPrint(`${command}: ${targetFile}: No such file\n`); break; }
            JungleRunner.execute(langMap[command], p.files[targetFile], p.files);
            break;
        }
        default:
            terminalPrint(`${command}: command not found — type 'help' for a list of commands\n`);
    }
}
terminalViewContainer.onclick = () => {
    if (activeView === 'terminal') {
        const row = document.getElementById('terminal-input-row');
        row.classList.remove('hidden');
        terminalInput.removeAttribute('disabled');
        terminalInput.focus();
    }
};
terminalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const cmd = terminalInput.value.trim();
        terminalInput.value = '';
        if (cmd) executeTerminalCommand(cmd);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (terminalHistoryIdx < terminalHistory.length - 1) terminalHistoryIdx++;
        terminalInput.value = terminalHistory[terminalHistoryIdx] || '';
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (terminalHistoryIdx > 0) terminalHistoryIdx--;
        else { terminalHistoryIdx = -1; terminalInput.value = ''; return; }
        terminalInput.value = terminalHistory[terminalHistoryIdx] || '';
    } else if (e.key === 'Tab') {
        e.preventDefault();
        const val = terminalInput.value;
        const p = JungleUI.getCurrentProject();
        if (!p) return;
        const candidates = Object.keys(p.files).filter(f => f.startsWith(val.split(' ').pop()));
        if (candidates.length === 1) {
            const parts2 = val.split(' '); parts2[parts2.length - 1] = candidates[0];
            terminalInput.value = parts2.join(' ');
        } else if (candidates.length > 1) {
            terminalPrint('\n' + candidates.join('  ') + '\n');
        }
    }
});
function highlightActiveFile() {
    const p = JungleUI.getCurrentProject();
    if (!p) return;
    // Only highlight the open file when you're actually editing it. In Preview,
    // Whole Project, Terminal, or Console views no single file is "active".
    const inEditor = activeView === 'editor';
    document.querySelectorAll('#file-list li[data-file]').forEach(item => {
        if (inEditor && item.dataset.file === p.currentFile) item.classList.add('active');
        else item.classList.remove('active');
    });
}
function switchView(view, showInput = false) {
    activeView = view;
    editorWrapper.style.display = previewFrame.style.display = terminalViewContainer.style.display = consoleViewContainer.style.display = 'none';
    if (projectViewContainer) projectViewContainer.style.display = 'none';
    projectTitleBtn.classList.remove('active');
    tabPreview.classList.remove('active');
    tabConsoleBtn.classList.remove('active');
    tabTerminalBtn.classList.remove('bg-[#1c2522]', 'text-[#74a896]', 'border-[#528b74]');
    terminalInput.setAttribute('disabled', 'true');
    const terminalInputRow = document.getElementById('terminal-input-row');
    terminalInputRow.classList.add('hidden');
    if (view === 'editor') {
        editorWrapper.style.display = 'flex';
    } else if (view === 'preview') {
        previewFrame.style.display = 'block';
        tabPreview.classList.add('active');
    } else if (view === 'terminal') {
        terminalViewContainer.style.display = 'flex';
        tabTerminalBtn.classList.add('bg-[#1c2522]', 'text-[#74a896]', 'border-[#528b74]');
        // Only show interactive input when explicitly opened via the Terminal button
        if (showInput !== false) {
            terminalInputRow.classList.remove('hidden');
            terminalInput.removeAttribute('disabled');
            setTimeout(() => terminalInput.focus(), 50);
        }
    } else if (view === 'console') {
        consoleViewContainer.style.display = 'flex';
        tabConsoleBtn.classList.add('active');
    } else if (view === 'project') {
        projectViewContainer.style.display = 'flex';
        projectTitleBtn.classList.add('active');
    }
    highlightActiveFile();
}
enterBtn.onclick = () => { splashScreen.classList.add('fade-out'); setTimeout(() => { splashScreen.style.display = 'none'; splashScreen.style.pointerEvents = 'none'; }, 400); projectsDashboard.classList.add('show'); JungleUI.renderProjectsDashboard(); };
exitToSplashBtn.onclick = () => { splashScreen.style.display = 'flex'; splashScreen.style.pointerEvents = 'auto'; setTimeout(() => splashScreen.classList.remove('fade-out'), 50); projectsDashboard.classList.remove('show'); };
exitToHubHeaderBtn.onclick = () => { workspaceContainer.style.display = 'none'; projectsDashboard.classList.add('show'); JungleUI.renderProjectsDashboard(); };
const addItemMenu = document.getElementById('add-item-menu');
function closeAddItemMenu() {
    addItemMenu.classList.remove('show');
    addItemMenu.innerHTML = '';
    // Reset any anchored positioning so the header (+) menu returns to its default spot.
    addItemMenu.style.position = '';
    addItemMenu.style.top = '';
    addItemMenu.style.left = '';
    addItemMenu.style.right = '';
}
function showPopupMenu(items, anchorEl) {
    addItemMenu.innerHTML = '';
    items.forEach(item => {
        if (item.divider) {
            const div = document.createElement('div');
            div.className = 'popup-menu-divider';
            addItemMenu.appendChild(div);
            return;
        }
        if (item.label && !item.onClick) {
            const lbl = document.createElement('div');
            lbl.className = 'popup-menu-label';
            lbl.textContent = item.label;
            addItemMenu.appendChild(lbl);
            return;
        }
        const el = document.createElement('div');
        el.className = 'popup-menu-item';
        el.textContent = item.text;
        el.onclick = (e) => { e.stopPropagation(); closeAddItemMenu(); item.onClick(); };
        addItemMenu.appendChild(el);
    });
    if (anchorEl) {
        // Pin the menu just below the clicked control (used by the per-folder + button).
        const r = anchorEl.getBoundingClientRect();
        addItemMenu.style.position = 'fixed';
        addItemMenu.style.top = (r.bottom + 4) + 'px';
        addItemMenu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 210)) + 'px';
        addItemMenu.style.right = 'auto';
    }
    addItemMenu.classList.add('show');
}
// Opens the "add file / add subfolder" menu for a specific folder path (called from the tree UI).
function showFolderAddMenu(folderPath, anchorEl) {
    showPopupMenu([
        { label: `Add to ${folderPath}/` },
        { text: '📄 New File', onClick: () => promptCreateFile(folderPath) },
        { text: '📁 New Subfolder', onClick: () => promptCreateFolder(folderPath) },
    ], anchorEl);
}
function getExistingFolders(p) {
    const folders = new Set(p.folders || []);
    Object.keys(p.files).forEach(f => { const i = f.indexOf('/'); if (i !== -1) folders.add(f.slice(0, i)); });
    return Array.from(folders).sort();
}
function promptCreateFile(folderPrefix) {
    JungleUI.showCustomModal({
        title: folderPrefix ? `Create File in ${folderPrefix}/` : "Create File",
        placeholder: "e.g., helpers.py",
        onConfirm: (name) => {
            if (!name) return;
            const p = JungleUI.getCurrentProject();
            if (!p) return;
            const fullName = folderPrefix ? `${folderPrefix}/${name}` : name;
            const fileName = JungleIntelligence.sanitizeFileName(fullName, selectedLanguages[0], p.files);
            p.files[fileName] = '';
            JungleUI.renderFilesList();
            JungleUI.switchToFile(fileName);
            JungleStorage.saveProjects(projects);
            JungleUI.showToast(`File ${fileName} created`);
        }
    });
}
function promptCreateFolder(parentPrefix) {
    JungleUI.showCustomModal({
        title: parentPrefix ? `Create Folder in ${parentPrefix}/` : "Create Folder",
        placeholder: "e.g., src, lib, utils",
        onConfirm: (name) => {
            if (!name) return;
            const p = JungleUI.getCurrentProject();
            if (!p) return;
            const clean = name.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').replace(/^-+|-+$/g, '');
            if (!clean) return;
            const folderName = parentPrefix ? `${parentPrefix}/${clean}` : clean;
            if (!p.folders) p.folders = [];
            if (p.folders.includes(folderName) || Object.keys(p.files).some(f => f.startsWith(folderName + '/'))) {
                JungleUI.showToast(`Folder "${folderName}" already exists`);
                return;
            }
            p.folders.push(folderName);
            JungleUI.collapsedFolders.add(folderName);
            JungleStorage.saveProjects(projects);
            JungleUI.renderFilesList();
            JungleUI.showToast(`Folder ${folderName}/ created`);
        }
    });
}
function promptLocation(kind) {
    const p = JungleUI.getCurrentProject();
    if (!p) return;
    const folders = getExistingFolders(p);
    const items = [
        { label: 'Where?' },
        { text: '🌲 File Tree (root)', onClick: () => promptCreateFile(null) },
    ];
    if (folders.length > 0) {
        items.push({ divider: true });
        folders.forEach(f => items.push({
            text: `📁 ${f}/`,
            onClick: () => promptCreateFile(f)
        }));
    }
    showPopupMenu(items);
}
addFileBtn.onclick = (e) => {
    e.stopPropagation();
    if (addItemMenu.classList.contains('show')) { closeAddItemMenu(); return; }
    showPopupMenu([
        { text: '📄 New File', onClick: () => promptLocation('file') },
        { text: '📁 New Folder', onClick: () => promptCreateFolder(null) },
    ]);
};
document.addEventListener('click', (e) => {
    if (!addItemMenu.contains(e.target) && e.target !== addFileBtn) closeAddItemMenu();
});
addProjectBtnDash.onclick = () => {
    JungleUI.showCustomModal({
        title: "Create Project",
        placeholder: "e.g., Python Sandbox",
        onConfirm: (name) => {
            if (!name) return;
            const newId = 'proj_' + Date.now();
            const newProj = JungleIntelligence.createStarterProject(newId, name);
            projects.push(newProj);
            JungleStorage.saveProjects(projects);
            JungleUI.loadProject(newId);
        }
    });
};
// Global callback handler to trap frame runtime and compilation crashes in written HTML files
window.handleIframeError = (message, source, lineno, colno) => {
    const p = JungleUI.getCurrentProject();
    showConsoleIssues([{ severity: 'error', line: lineno, kind: 'RuntimeError', msg: message, hint: 'Inspect JavaScript near the reported line.' }], (p && p.currentFile) || 'index.html');
    switchView('console');
    JungleUI.showToast("❌ Runtime error — see Console.", () => switchView('console'));
};
// Picks the HTML entry file for a web project, or null if this isn't one.
// A web project = language is HTML or JavaScript AND the project contains an .html file.
// This lets a JS-language project still run as a full page (HTML + CSS + JS bundled),
// so you no longer have to be on the HTML file with HTML selected to see both.
function webEntryFile(p, lang) {
    if (lang !== 'HTML' && lang !== 'Javascript') return null;
    const htmlFiles = Object.keys(p.files).filter(f => /\.html?$/i.test(f));
    if (htmlFiles.length === 0) return null;
    if (/\.html?$/i.test(p.currentFile)) return p.currentFile; // prefer the HTML you're viewing
    return htmlFiles.find(f => /(^|\/)index\.html?$/i.test(f)) || htmlFiles.slice().sort()[0];
}
// Renders a full web page — the entry HTML with all referenced CSS/JS inlined — in the preview.
function runWebPreview(entryFile) {
    const p = JungleUI.getCurrentProject();
    if (!p) return;
    try {
        const html = p.files[entryFile] || '';
        const missingAssets = JungleIntelligence.findMissingHtmlAssets(html, p.files);
        if (missingAssets.length > 0) {
            const missing = missingAssets[0];
            showConsoleIssues([{ severity: 'error', line: missing.line, column: null, kind: 'RunError',
                msg: `Missing file referenced: ${missing.file}`, hint: 'Add the referenced file to the project or fix the path.' }], entryFile);
            switchView('console');
            JungleUI.showToast("❌ Failed to run — see Console.", () => switchView('console'));
            return;
        }
        terminalStatus.textContent = "READY";
        terminalStatus.className = "text-[#74a896]";
        terminalViewBody.textContent = "";
        switchView('preview');
        const iframeWin = previewFrame.contentWindow, doc = iframeWin.document;
        let frameCompileError = false;
        iframeWin.onerror = function(message, source, lineno, colno) { frameCompileError = true; window.handleIframeError(message, source, lineno, colno); return true; };
        doc.open();
        const htmlWithAssets = JungleIntelligence.injectProjectAssetsIntoHtml(html, p.files);
        const errorBubbleInjectedCode = `<script>window.onerror = function(m, s, l, c) { if (window.parent && window.parent.handleIframeError) { window.parent.handleIframeError(m, s, l, c); } return true; };<\/script>` + htmlWithAssets;
        doc.write(errorBubbleInjectedCode);
        doc.close();
        setTimeout(() => { if (!frameCompileError) JungleUI.showToast("Webpage loaded successfully in Preview panel."); }, 150);
    } catch(e) {
        console.error("Frame writing blocked", e);
        showConsoleIssues([{ severity: 'error', line: null, column: null, kind: 'RunError',
            msg: e.message || 'The page could not be rendered.', hint: 'Check the HTML/JS for errors.' }], entryFile);
        switchView('console');
        JungleUI.showToast("❌ Failed to run — see Console.", () => switchView('console'));
    }
}
runBtn.onclick = () => {
    const p = JungleUI.getCurrentProject();
    if (!p) return;
    const lang = selectedLanguages[0];
    const entry = webEntryFile(p, lang);
    if (entry) {
        runWebPreview(entry);
    } else {
        JungleRunner.execute(lang, p.files[p.currentFile], p.files);
    }
};
tabPreview.onclick = runBtn.onclick;
tabTerminalBtn.onclick = () => { switchView('terminal', true); };
tabConsoleBtn.onclick = () => { switchView('console'); };
// "Whole Project" — an editable view of every file, each with its own line-number
// gutter. Edits are written straight back to that file (and persisted).
function renderProjectView() {
    const p = JungleUI.getCurrentProject();
    projectViewContainer.innerHTML = '';
    if (!p || Object.keys(p.files).length === 0) { switchView('editor'); return; }
    Object.keys(p.files).forEach((name) => {
        const block = document.createElement('div');
        block.className = 'pv-block';
        const label = document.createElement('div');
        label.className = 'pv-label';
        label.textContent = `--- ${name} ---`;

        const body = document.createElement('div');
        body.className = 'pv-body';
        const gutter = document.createElement('div');
        gutter.className = 'pv-gutter';
        const editorShell = document.createElement('div');
        editorShell.className = 'pv-editor-shell';
        const highlight = document.createElement('pre');
        highlight.className = 'pv-highlight';
        const ta = document.createElement('textarea');
        ta.className = 'pv-textarea';
        ta.spellcheck = false;
        ta.value = p.files[name] || '';

        const sync = () => {
            const n = ta.value.split('\n').length || 1;
            const lang = JungleIntelligence.languageFromFilename(name, p.lang || selectedLanguages[0]);
            gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
            highlight.innerHTML = JungleUI.highlightCode(lang, ta.value.endsWith('\n') ? ta.value + ' ' : ta.value);
            const height = Math.max(44, n * 22 + 24);
            editorShell.style.height = height + 'px';
            ta.style.height = height + 'px';
            highlight.style.height = height + 'px';
        };
        ta.addEventListener('input', () => {
            p.files[name] = ta.value;
            JungleStorage.saveProjects(projects);
            if (name === p.currentFile) {
                editor.value = ta.value;
                JungleUI.updateCodeHighlight();
                JungleUI.updateLinesOfCodeCount();
            }
            sync();
        });
        ta.addEventListener('scroll', () => {
            highlight.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
        });
        ta.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const s = ta.selectionStart;
                ta.value = ta.value.slice(0, s) + '    ' + ta.value.slice(ta.selectionEnd);
                ta.selectionStart = ta.selectionEnd = s + 4;
                ta.dispatchEvent(new Event('input'));
            }
        });
        editorShell.appendChild(highlight);
        editorShell.appendChild(ta);
        body.appendChild(gutter);
        body.appendChild(editorShell);
        block.appendChild(label);
        block.appendChild(body);
        projectViewContainer.appendChild(block);
        sync();
    });
}
projectTitleBtn.onclick = () => {
    const p = JungleUI.getCurrentProject();
    if (!p || Object.keys(p.files).length === 0) { switchView('editor'); return; }
    switchView('project');
    renderProjectView();
};
// Styles for the editable Whole Project view (gutter + textarea aligned line-for-line).
(function injectProjectViewStyles() {
    const css = `
    #project-view-container .pv-block{margin:0;border:0;overflow:visible;background:#0b0d10;}
    #project-view-container .pv-label{background:#0b0d10;color:#74a896;font-family:'Fira Code','Consolas',monospace;font-size:14px;line-height:22px;padding:14px 20px 6px;border:0;font-weight:600;}
    #project-view-container .pv-body{display:flex;align-items:stretch;background:#0b0d10;}
    #project-view-container .pv-gutter{flex:0 0 55px;box-sizing:border-box;text-align:right;padding:12px 10px 12px 8px;color:#35453e;font-family:'Fira Code','Consolas',monospace;font-size:14px;line-height:22px;white-space:pre;user-select:none;background:#080a0d;border-right:1px solid #1c2321;}
    #project-view-container .pv-editor-shell{position:relative;flex:1;min-width:0;overflow:hidden;background:#0b0d10;}
    #project-view-container .pv-highlight,#project-view-container .pv-textarea{position:absolute;inset:0;width:100%;margin:0;padding:12px 20px;box-sizing:border-box;font-family:'Fira Code','Consolas',monospace;font-size:14px;line-height:22px;white-space:pre;tab-size:4;word-wrap:normal;}
    #project-view-container .pv-highlight{z-index:1;pointer-events:none;overflow:visible;color:#d1d5db;background:transparent;}
    #project-view-container .pv-textarea{z-index:2;border:0;outline:0;resize:none;overflow-x:auto;overflow-y:hidden;background:transparent;color:transparent!important;-webkit-text-fill-color:transparent!important;caret-color:#74a896;}
    #project-view-container .pv-textarea::selection{background:rgba(82,139,116,.35);}
    #project-view-container .pv-textarea::-webkit-scrollbar{height:10px;}
    #project-view-container .pv-textarea::-webkit-scrollbar-track{background:#080a0d;}
    #project-view-container .pv-textarea::-webkit-scrollbar-thumb{background:#1c2522;border:2px solid #080a0d;border-radius:5px;}`;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
})();
const langPickerScreen = document.getElementById('lang-picker-screen');
const langPickerBack = document.getElementById('lang-picker-back');
const langPickerSearch = document.getElementById('lang-picker-search');
const langPickerGrid = document.getElementById('lang-picker-grid');
extensionsBtn.onclick = () => {
    langPickerSearch.value = '';
    renderLangPickerGrid('');
    langPickerScreen.classList.add('visible');
    setTimeout(() => langPickerSearch.focus(), 50);
};
langPickerBack.onclick = () => langPickerScreen.classList.remove('visible');
langPickerSearch.oninput = () => renderLangPickerGrid(langPickerSearch.value.toLowerCase());
fileSearchInput.oninput = () => JungleUI.renderFilesList();
const templatePanelToggle = document.getElementById('template-panel-toggle');
const templatePanelBody = document.getElementById('template-panel-body');
const templateToggleArrow = document.getElementById('template-toggle-arrow');
const TEMPLATES = {
    web: {
        lang: 'HTML',
        files: {
            'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Web Page</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: sans-serif; background: #0f172a; color: #e2e8f0; display: flex; justify-content: center; align-items: center; height: 100vh; }
        .card { text-align: center; padding: 3rem; background: #1e293b; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
        h1 { font-size: 2.5rem; margin-bottom: 0.75rem; color: #7dd3c0; }
        p { color: #94a3b8; margin-bottom: 2rem; }
        button { background: #2dd4bf; color: #0f172a; border: none; padding: 12px 32px; border-radius: 8px; font-size: 1rem; font-weight: 700; cursor: pointer; transition: transform 0.15s, background 0.15s; }
        button:hover { background: #5eead4; transform: translateY(-2px); }
        #counter { font-size: 3rem; font-weight: 800; color: #7dd3c0; margin-top: 1.5rem; }
    </style>
</head>
<body>
    <div class="card">
        <h1>Hello World</h1>
        <p>Click the button to count up.</p>
        <button onclick="increment()">Click Me</button>
        <div id="counter">0</div>
    </div>
    <script src="script.js"></script>
</body>
</html>`,
            'script.js': `let count = 0;
function increment() {
    count++;
    document.getElementById('counter').textContent = count;
}`
        },
        currentFile: 'index.html'
    },
    python: {
        lang: 'Python',
        files: {
            'main.py': `def greet(name):
    return f"Hello, {name}!"
def add(a, b):
    return a + b
def fizzbuzz(n):
    for i in range(1, n + 1):
        if i % 15 == 0:
            print("FizzBuzz")
        elif i % 3 == 0:
            print("Fizz")
        elif i % 5 == 0:
            print("Buzz")
        else:
            print(i)
def main():
    print(greet("World"))
    print(f"3 + 7 = {add(3, 7)}")
    print("\\nFizzBuzz up to 20:")
    fizzbuzz(20)
main()
`
        },
        currentFile: 'main.py'
    },
    javascript: {
        lang: 'Javascript',
        files: {
            'main.js': `// JavaScript App Starter
function greet(name) {
    return \`Hello, \${name}!\`;
}
function sum(numbers) {
    return numbers.reduce((acc, n) => acc + n, 0);
}
function bubbleSort(arr) {
    const a = [...arr];
    for (let i = 0; i < a.length; i++) {
        for (let j = 0; j < a.length - i - 1; j++) {
            if (a[j] > a[j + 1]) [a[j], a[j + 1]] = [a[j + 1], a[j]];
        }
    }
    return a;
}
async function fetchJoke() {
    try {
        const res = await fetch('https://official-joke-api.appspot.com/random_joke');
        const joke = await res.json();
        console.log(\`Joke: \${joke.setup} ... \${joke.punchline}\`);
    } catch (e) {
        console.log('Could not fetch joke:', e.message);
    }
}

async function main() {
    console.log(greet('World'));
    const nums = [5, 3, 8, 1, 9, 2, 7];
    console.log('Unsorted:', nums.join(', '));
    console.log('Sorted:  ', bubbleSort(nums).join(', '));
    console.log('Sum:', sum(nums));
    await fetchJoke();
}

main();
`
        },
        currentFile: 'main.js'
    }
};
templatePanelToggle.onclick = () => {
    const open = templatePanelBody.classList.toggle('open');
    templateToggleArrow.textContent = open ? '▲' : '▼';
};
function updateTemplateBtnVisibility() {
    const p = JungleUI.getCurrentProject();
    if (!p) return;
    const hasContent = Object.values(p.files).some(c => c && c.trim().length > 0);
    templatePanelToggle.style.display = hasContent ? 'none' : '';
}
document.querySelectorAll('.template-card').forEach(card => {
    card.onclick = () => {
        const p = JungleUI.getCurrentProject();
        if (!p) { JungleUI.showToast('Open a project first to load a template.'); return; }
        const t = TEMPLATES[card.getAttribute('data-template')];
        if (!t) return;
        Object.assign(p.files, t.files);
        p.currentFile = t.currentFile;
        p.lang = t.lang;
        selectedLanguages = [t.lang];
        manualLanguageOverride = true;
        JungleStorage.saveProjects(projects);
        JungleUI.renderFilesList();
        JungleUI.switchToFile(t.currentFile);
        templatePanelBody.classList.remove('open');
        templateToggleArrow.textContent = '▼';
        JungleUI.showToast(`Loaded ${card.querySelector('.template-card-name').textContent} template.`);
    };
});
headerCopyCodeBtn.onclick = () => {
    const p = JungleUI.getCurrentProject();
    if (!p) return;
    let text, label;
    if (activeView === 'preview' && projectTitleBtn.classList.contains('active')) {
        // Whole Project view — copy all files
        text = Object.entries(p.files).map(([name, content]) =>
            `${'='.repeat(52)}\n// ${name}\n${'='.repeat(52)}\n${content || ''}`
        ).join('\n\n');
        label = `all files in ${p.name}`;
    } else {
        text = p.files[p.currentFile] || '';
        label = p.currentFile;
    }
    navigator.clipboard ? navigator.clipboard.writeText(text) : (() => {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    })();
    JungleUI.showToast(`Copied ${label} to clipboard!`);
};
document.getElementById('select-all-code-btn').onclick = () => {
    if (activeView === 'preview' && projectTitleBtn.classList.contains('active')) {
        // Select all text inside whole project iframe
        const iwin = previewFrame.contentWindow;
        if (iwin) { iwin.focus(); iwin.document.execCommand('selectAll'); }
    } else {
        editor.focus(); editor.select(); editor.scrollTop = 0;
    }
};
document.getElementById('download-code-btn').onclick = () => {
    const p = JungleUI.getCurrentProject();
    if (!p) return;
    let text, filename;
    if (activeView === 'preview' && projectTitleBtn.classList.contains('active')) {
        text = Object.entries(p.files).map(([name, content]) =>
            `${'='.repeat(52)}\n// ${name}\n${'='.repeat(52)}\n${content || ''}`
        ).join('\n\n');
        filename = p.name.replace(/\s+/g, '_') + '_all_files.txt';
    } else {
        if (!p.currentFile) return;
        text = p.files[p.currentFile] || '';
        filename = p.currentFile;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = filename; a.click(); URL.revokeObjectURL(a.href);
    JungleUI.showToast(`Downloaded ${filename}`);
};
editor.oninput = () => {
    const p = JungleUI.getCurrentProject();
    if (!p || !p.currentFile) return;
    p.files[p.currentFile] = editor.value;
    JungleUI.updateLinesOfCodeCount();
    JungleStorage.saveProjects(projects);
    if (!manualLanguageOverride) {
        const detection = JungleScanner.detectLanguage(editor.value);
        if (detection && detection.lang !== selectedLanguages[0]) {
            const { lang: detectedLang, confidence } = detection;
            selectedLanguages = [detectedLang];
            p.lang = detectedLang;
            currentLanguageText.textContent = detectedLang;
            const newFilename = JungleIntelligence.renameFileForLanguage(p.currentFile, detectedLang, p.files);
            if (newFilename !== p.currentFile) {
                const fileContent = p.files[p.currentFile];
                delete p.files[p.currentFile];
                p.files[newFilename] = fileContent;
                p.currentFile = newFilename;
                currentFileLabel.textContent = newFilename;
                JungleUI.renderFilesList();
            }
            JungleStorage.saveProjects(projects);
            if (confidence === 'confirmed') {
                JungleUI.showToast(`Detected ${detectedLang} — tap language button to override.`);
            }
        }
    }
    JungleUI.updateCodeHighlight();
    updateTemplateBtnVisibility();
    scheduleLiveAnalysis();
};
// Debounced live analysis — runs the offline scanner + semantic analyzer as you type
// and refreshes the Console panel's issue badge without stealing focus from the editor.
var _liveAnalysisTimer = null;
function scheduleLiveAnalysis() {
    if (_liveAnalysisTimer) clearTimeout(_liveAnalysisTimer);
    _liveAnalysisTimer = setTimeout(runLiveAnalysis, 500);
}
// Renders a whole-project bug report into the Console: a summary line, then each file that
// has issues (file name is clickable to open it) with its findings underneath.
function showProjectIssues(report) {
    consoleViewBody.innerHTML = '';
    let errors = 0;
    report.results.forEach(r => { errors += r.issues.filter(i => i.severity === 'error').length; });
    const warnings = report.total - errors;
    consoleStatus.textContent = errors ? `${errors} ERROR${errors > 1 ? 'S' : ''}` : report.total ? `${warnings} WARN` : 'CLEAR';
    consoleStatus.style.color = errors ? '#FF5555' : report.total ? '#FFB86C' : '#74a896';
    const line = (text, color, extra) => {
        const d = document.createElement('div');
        d.textContent = text;
        if (color) d.style.color = color;
        if (extra) d.style.cssText += extra;
        consoleViewBody.appendChild(d);
        return d;
    };
    line(`Project analysis — ${report.scanned} code file${report.scanned === 1 ? '' : 's'} mapped · ${report.total} issue${report.total === 1 ? '' : 's'} across ${report.results.length} file${report.results.length === 1 ? '' : 's'}`, '#4a6057');
    if (report.total === 0) { line('✓ No issues detected across the project.', '#74a896'); return; }
    for (const r of report.results) {
        const e = r.issues.filter(i => i.severity === 'error').length;
        const w = r.issues.length - e;
        const summary = [e ? `${e} error${e > 1 ? 's' : ''}` : '', w ? `${w} warning${w > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ');
        const head = line(`📄 ${r.file}  [${r.lang}] — ${summary}`, e ? '#FF5555' : '#FFB86C', 'font-weight:700;margin-top:10px;cursor:pointer;');
        head.title = 'Open this file';
        head.onclick = () => JungleUI.switchToFile(r.file);
        for (const i of r.issues) {
            const color = i.severity === 'error' ? '#FF5555' : i.severity === 'warning' ? '#FFB86C' : '#74a896';
            const icon = i.severity === 'error' ? '✗' : i.severity === 'warning' ? '⚠' : 'ℹ';
            line(`   ${icon} Line ${i.line || '?'}  [${i.kind || i.severity}]  ${i.msg}`, color);
            if (i.hint) line(`       💡 ${i.hint}`, '#5c7a6e');
        }
    }
}
// Map every code file in the project (path -> language, skipping non-code files) and scan
// each one for bugs. The analyzer gets the whole `files` map so cross-file checks still work.
// Returns { map:[{file,lang,folder}], results:[{file,lang,issues}], scanned, total }.
function analyzeWholeProject(p) {
    const map = [], results = [];
    let total = 0;
    for (const fname of Object.keys(p.files).sort()) {
        const lang = JungleIntelligence.extensionLanguages[JungleIntelligence.getExtension(fname)];
        if (!lang) continue; // non-code / data file — nothing to scan
        const folder = fname.includes('/') ? fname.slice(0, fname.lastIndexOf('/')) : '';
        map.push({ file: fname, lang, folder });
        let issues = [];
        try { issues = JungleScanner.scan(lang, p.files[fname] || ''); } catch (_) {}
        if (typeof JungleAnalyzer !== 'undefined') {
            try { issues.push(...JungleAnalyzer.analyze(lang, p.files, fname)); } catch (_) {}
        }
        if (issues.length) {
            issues.sort((a, b) => (a.line || 0) - (b.line || 0));
            results.push({ file: fname, lang, issues });
            total += issues.length;
        }
    }
    return { map, results, scanned: map.length, total };
}
function runLiveAnalysis() {
    const p = JungleUI.getCurrentProject();
    if (!p || !p.currentFile) return;
    // Whole-project mode (opt-in setting): map + scan every file, report bugs grouped by file.
    if (typeof JungleSettings !== 'undefined' && JungleSettings.get('projectScan')) {
        showProjectIssues(analyzeWholeProject(p));
        return;
    }
    // Scan the file as ITS OWN language (by extension), not the project's selected language —
    // otherwise a .py/.cpp/etc. file in a JS project gets scanned with the wrong rules and
    // lights up with hundreds of false errors. Unknown / non-code types (.txt, .json, .md,
    // images, etc.) aren't scanned at all — there's nothing meaningful to check.
    const lang = JungleIntelligence.extensionLanguages[JungleIntelligence.getExtension(p.currentFile)];
    if (!lang) { showConsoleIssues([], p.currentFile); return; }
    let issues = [];
    try { issues = JungleScanner.scan(lang, p.files[p.currentFile] || ''); } catch (_) {}
    if (typeof JungleAnalyzer !== 'undefined') {
        try { issues.push(...JungleAnalyzer.analyze(lang, p.files, p.currentFile)); } catch (_) {}
    }
    issues.sort((a, b) => (a.line || 0) - (b.line || 0));
    // Update the console panel content + badge in place (don't switch the active view).
    showConsoleIssues(issues, p.currentFile);
}
editor.onscroll = () => { highlightOverlay.scrollTop = lineGutter.scrollTop = editor.scrollTop; highlightOverlay.scrollLeft = editor.scrollLeft; };
editor.onkeydown = (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        const start = editor.selectionStart;
        editor.value = editor.value.substring(0, start) + "    " + editor.value.substring(editor.selectionEnd);
        editor.selectionStart = editor.selectionEnd = start + 4;
        editor.oninput();
    }
};
const LANG_ICONS = {
    'Assembly': '⚙️', 'Bash': '🐚', 'C': '🔵', 'C#': '💜', 'C++': '🔷',
    'Clojure': '🟢', 'COBOL': '🏢', 'D': '🔶', 'Dart': '🎯', 'Elixir': '💧',
    'Erlang': '📡', 'F#': '🟣', 'Fortran': '🧮', 'Go': '🐹', 'Haskell': '🟡',
    'HTML': '🌐', 'Java': '☕', 'Javascript': '⚡', 'Julia': '🔴', 'Kotlin': '🟠',
    'Lisp': '🌀', 'Lua': '🌙', 'Nim': '👑', 'OCaml': '🐪', 'Pascal': '🏛️',
    'Perl': '🐪', 'PHP': '🐘', 'Prolog': '🧠', 'Python': '🐍', 'R': '📊',
    'Ruby': '💎', 'Rust': '🦀', 'Scala': '⚖️', 'Swift': '🕊️', 'TypeScript': '🔷',
    'Zig': '⚡', 'Groovy': '🎵', 'Apex': '☁️', 'GDScript': '🎮', 'Solidity': '🪙', 'Nix': '❄️', 'HCL': '🏗️'
};
const ALL_LANGS = ["Apex","Assembly","Bash","C","C#","C++","Clojure","COBOL","D","Dart","Elixir","Erlang","F#","Fortran","GDScript","Go","Groovy","HCL","Haskell","HTML","Java","Javascript","Julia","Kotlin","Lisp","Lua","Nim","Nix","OCaml","Pascal","Perl","PHP","Prolog","Python","R","Ruby","Rust","Scala","Solidity","SQL","Swift","TypeScript","Zig"];
const LANGUAGE_DESCRIPTIONS = {
    Apex: 'Enterprise Development', Assembly: 'Low-Level Development', Bash: 'Script Automation',
    C: 'Systems Programming', 'C#': 'Game & Desktop Development', 'C++': 'Game & High-Performance Development',
    Clojure: 'Functional Web Development', COBOL: 'Mainframe Development', D: 'Systems & App Development',
    Dart: 'Cross-Platform Mobile Development', Elixir: 'Scalable Web Development', Erlang: 'Distributed Systems Development',
    'F#': 'Data-Driven Functional Development', Fortran: 'Scientific Computing', GDScript: 'Game Development',
    Go: 'Cloud & Microservices Development', Groovy: 'Build Automation & Scripting', HCL: 'Infrastructure-as-Code Development',
    Haskell: 'Compiler & Research Development', HTML: 'Full-Stack Frontend Development', Java: 'Enterprise App Development',
    Javascript: 'Full-Stack Web Development', Julia: 'High-Performance Data Science', Kotlin: 'Native Android Development',
    Lisp: 'AI & Protocol Development', Lua: 'Scripting & Game Engines', Nim: 'Systems & Backend Development',
    Nix: 'Declarative Configuration Development', OCaml: 'Functional Systems Development', Pascal: 'Legacy & Systems Development',
    Perl: 'Text Processing & DevOps', PHP: 'Dynamic Web Development', Prolog: 'AI & Logic Programming',
    Python: 'AI & Data Science Development', R: 'Statistical Computing & Graphics', Ruby: 'Agile Web Development',
    Rust: 'Safe Systems & WebAssembly Development', Scala: 'Big Data & Functional Development', Solidity: 'Smart Contract Development',
    SQL: 'Database & Analytics Development', Swift: 'iOS & macOS Development', TypeScript: 'Typed Full-Stack Web Development',
    Zig: 'Low-Level Systems Development'
};
const LANGUAGE_DISPLAY_NAMES = { Javascript: 'JavaScript' };
function renderLangPickerGrid(filter) {
    const current = selectedLanguages[0] || '';
    const filtered = filter ? ALL_LANGS.filter(l => l.toLowerCase().includes(filter)) : ALL_LANGS;
    langPickerGrid.innerHTML = filtered.map(l => {
        const icon = LANG_ICONS[l] || '📄';
        const description = LANGUAGE_DESCRIPTIONS[l] || '';
        const displayName = LANGUAGE_DISPLAY_NAMES[l] || l;
        const sel = l === current ? ' selected' : '';
        return `<div class="lang-picker-card${sel}" data-lang="${l}"><span class="lang-picker-icon">${icon}</span><span class="lang-picker-name">${displayName}</span><span class="lang-picker-description">${description}</span></div>`;
    }).join('');
    langPickerGrid.querySelectorAll('.lang-picker-card').forEach(card => {
        card.onclick = () => {
            const targetLang = card.getAttribute('data-lang');
            selectedLanguages = [targetLang];
            manualLanguageOverride = true;
            currentLanguageText.textContent = targetLang;
            langPickerScreen.classList.remove('visible');
            const p = JungleUI.getCurrentProject();
            if (p) {
                p.lang = targetLang;
                const firstMatch = Object.keys(p.files).find(f => JungleIntelligence.languageFromFilename(f, '') === targetLang);
                if (firstMatch) {
                    JungleUI.switchToFile(firstMatch);
                } else {
                    const newFilename = JungleIntelligence.renameFileForLanguage(p.currentFile, targetLang, p.files);
                    if (newFilename !== p.currentFile) {
                        p.files[newFilename] = p.files[p.currentFile];
                        delete p.files[p.currentFile];
                        JungleUI.renderFilesList();
                        JungleUI.switchToFile(newFilename);
                    }
                }
                JungleStorage.saveProjects(projects);
            }
        };
    });
}
window.onload = () => {
    projects = JungleStorage.getProjects();
};
// ── Drag-and-drop file import ─────────────────────────────────────────────────
(function setupDragDrop() {
    const zones = [
        document.querySelector('.sidebar'), // whole file-tree panel (covers the <ul> + empty space)
        document.getElementById('editor-wrapper'),
        document.getElementById('preview-frame'),
    ];
    const isZipName = name => /\.zip$/i.test(name || '');
    // Known binary / non-text extensions. Anything on this list is denied on import —
    // only code and text documents are allowed into the editor.
    const BINARY_EXTS = new Set([
        // images (svg is text/XML, so it's intentionally NOT here)
        'png','jpg','jpeg','gif','bmp','webp','ico','tif','tiff','avif','heic','heif','psd','ai','eps','raw','cr2','nef',
        // audio
        'mp3','wav','flac','aac','ogg','oga','m4a','wma','opus','mid','midi','aiff',
        // video
        'mp4','mov','avi','mkv','webm','wmv','flv','m4v','mpg','mpeg','3gp',
        // archives / compressed
        'zip','rar','7z','tar','gz','bz2','xz','tgz','zst','lz','lzma','cab','arj','iso','img','dmg',
        // fonts
        'ttf','otf','woff','woff2','eot',
        // executables / compiled binaries
        'exe','dll','so','dylib','bin','o','obj','a','lib','class','pyc','pyo','wasm','node','msi','apk','deb','rpm','app','jar',
        // binary documents / office
        'pdf','doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp','rtf',
        // databases
        'sqlite','sqlite3','db','db3','mdb','accdb',
        // misc binary
        'sketch','fig','blend','dwg','dat','pak',
    ]);
    // A file is importable if it isn't a known binary type. Extensionless files and dotfiles
    // (e.g. Makefile, .gitignore) are treated as text and allowed.
    function isImportableTextFile(name) {
        const base = (name || '').split('/').pop();
        const dot = base.lastIndexOf('.');
        const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
        return !BINARY_EXTS.has(ext);
    }
    function readFileText(file) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = () => resolve('');
            reader.readAsText(file);
        });
    }
    // A directory reader hands back entries in batches (~100); loop until it's drained.
    function readAllDirEntries(reader) {
        return new Promise((resolve, reject) => {
            const all = [];
            const readBatch = () => reader.readEntries(batch => {
                if (!batch.length) { resolve(all); return; }
                all.push(...batch);
                readBatch();
            }, reject);
            readBatch();
        });
    }
    // Recursively walk a dropped FileSystemEntry, collecting files (with their relative path)
    // and every folder path encountered — this is what enables folders-within-folders, any depth.
    async function walkEntry(entry, prefix, out) {
        if (!entry) return;
        if (entry.isFile) {
            const file = await new Promise((res, rej) => entry.file(res, rej));
            out.files.push({ path: prefix + entry.name, file });
        } else if (entry.isDirectory) {
            const dirPath = prefix + entry.name;
            out.folders.add(dirPath);
            const children = await readAllDirEntries(entry.createReader());
            for (const child of children) await walkEntry(child, dirPath + '/', out);
        }
    }
    // Commit collected files/folders to the current project, preserving the folder structure.
    async function importCollected(out) {
        const p = JungleUI.getCurrentProject();
        if (!p) return;
        if (!Array.isArray(p.folders)) p.folders = [];
        // Only code / text documents get loaded; media (videos, pictures, etc.) never loads.
        const importable = out.files.filter(it => isImportableTextFile(it.path));
        const denied = out.files.length - importable.length;
        const hasFolders = out.folders.size > 0;
        // A lone binary file with no folder has nothing to accept — refuse it outright.
        if (!hasFolders && importable.length === 0) {
            if (denied > 0) JungleUI.showToast('⛔ Cannot load that — only code and text documents are supported.', 'error');
            return;
        }
        // Accept ALL dropped folders (and their ancestors), even ones that held only media —
        // the folder itself is created; the pictures/videos inside are simply not loaded.
        const foldersBefore = p.folders.length;
        const registerChain = (dirPath) => {
            dirPath.split('/').reduce((acc, seg) => {
                const path = acc ? acc + '/' + seg : seg;
                if (path && !p.folders.includes(path)) {
                    p.folders.push(path);
                    // Dropped folders start collapsed (existing folders keep their current state).
                    if (JungleUI.collapsedFolders) JungleUI.collapsedFolders.add(path);
                }
                return path;
            }, '');
        };
        out.folders.forEach(registerChain);
        importable.forEach(it => {
            const parts = it.path.replace(/^\/+/, '').split('/');
            parts.pop();
            if (parts.length) registerChain(parts.join('/'));
        });

        let added = 0, firstFile = null;
        for (const item of importable) {
            const content = await readFileText(item.file);
            let key = item.path.replace(/^\/+/, '');
            // Avoid clobbering an existing file: append -1, -2, … before the extension.
            if (p.files[key] !== undefined) {
                const slash = key.lastIndexOf('/');
                const dot = key.lastIndexOf('.');
                const base = dot > slash ? key.slice(0, dot) : key;
                const ext = dot > slash ? key.slice(dot) : '';
                let n = 1;
                while (p.files[`${base}-${n}${ext}`] !== undefined) n++;
                key = `${base}-${n}${ext}`;
            }
            p.files[key] = content;
            if (!firstFile) firstFile = key;
            added++;
        }
        JungleStorage.saveProjects(projects);
        JungleUI.renderFilesList();
        if (firstFile) JungleUI.switchToFile(firstFile);
        const foldersAdded = p.folders.length - foldersBefore;
        const skipNote = denied > 0 ? ` — skipped ${denied} media file${denied > 1 ? 's' : ''}` : '';
        if (added > 0) {
            const fc = foldersAdded > 0 ? ` in ${foldersAdded} folder${foldersAdded > 1 ? 's' : ''}` : '';
            JungleUI.showToast(`✓ Imported ${added} file${added > 1 ? 's' : ''}${fc}${skipNote}`, denied > 0 ? 'info' : 'success');
        } else if (hasFolders) {
            // Folder(s) accepted, but nothing loadable inside (media isn't loaded).
            JungleUI.showToast(denied > 0
                ? `✓ Folder added${skipNote} (only code & text load)`
                : '✓ Empty folder added', 'info');
        } else {
            JungleUI.showToast('Nothing to import.', 'info');
        }
    }
    async function handleDrop(dataTransfer) {
        const out = { files: [], folders: new Set() };
        const items = dataTransfer.items;
        // Capture entries synchronously — the DataTransferItemList is emptied once the
        // drop handler returns, so we must call webkitGetAsEntry() before any await.
        const entries = [];
        if (items && items.length && typeof items[0].webkitGetAsEntry === 'function') {
            for (let i = 0; i < items.length; i++) {
                const entry = items[i].webkitGetAsEntry();
                if (entry) entries.push(entry);
            }
        }
        if (entries.length) {
            for (const entry of entries) await walkEntry(entry, '', out);
        } else {
            // Fallback for browsers without directory-entry support: flat file list.
            Array.from(dataTransfer.files || []).forEach(f => out.files.push({ path: f.name, file: f }));
        }
        // Browsers block reading a folder's CONTENTS when the page is opened as a local file
        // (file://). The folder entry comes through but readEntries() returns nothing, so it
        // looks empty. Warn instead of silently importing an empty folder. Serving over http
        // (e.g. VS Code's preview) lifts the restriction.
        if (location.protocol === 'file:' && out.folders.size > 0 && out.files.length === 0) {
            JungleUI.showToast('⚠️ Folder contents can’t be read when opened as a local file (file://). Run Jungle Editor through a local server or the VS Code preview to import folders.', 'error');
        }
        await importCollected(out);
    }
    zones.forEach(zone => {
        if (!zone) return;
        zone.addEventListener('dragover', e => {
            e.preventDefault();
            e.stopPropagation();
            // Explicitly mark this as a copy target so the browser shows the "+" cursor
            // (and never a no-drop cursor) for files AND folders.
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
            zone.style.outline = '2px dashed #528b74';
            zone.style.outlineOffset = '-4px';
        });
        zone.addEventListener('dragleave', e => {
            zone.style.outline = '';
            zone.style.outlineOffset = '';
        });
        zone.addEventListener('drop', e => {
            e.preventDefault();
            e.stopPropagation();
            zone.style.outline = '';
            zone.style.outlineOffset = '';
            if (e.dataTransfer) handleDrop(e.dataTransfer);
        });
    });
    // Safety net: stop the browser from opening/navigating to a file or folder dropped
    // anywhere outside a zone. Only fires for file drags, so dragging text into inputs still works.
    const isFileDrag = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    document.addEventListener('dragover', e => { if (isFileDrag(e)) e.preventDefault(); });
    document.addEventListener('drop', e => { if (isFileDrag(e)) e.preventDefault(); });
})();

// ===================== Settings screen =====================
(function initSettings() {
    const settingsScreen = document.getElementById('settings-screen');
    const openBtn = document.getElementById('open-settings-btn');
    const backBtn = document.getElementById('settings-back');
    const analysisToggle = document.getElementById('toggle-analysis');
    const projectScanToggle = document.getElementById('toggle-project-scan');
    const themeChoice = document.getElementById('theme-choice');
    const executionModeChoice = document.getElementById('execution-mode-choice');
    if (!settingsScreen) return;

    function applyTheme(theme) {
        document.body.classList.toggle('theme-light', theme === 'light');
    }
    function syncUI() {
        // Toggle "on" means scanners/analyzers are ENABLED (i.e. not disabled).
        const enabled = !JungleSettings.get('disableAnalysis');
        analysisToggle.classList.toggle('on', enabled);
        analysisToggle.setAttribute('aria-checked', String(enabled));
        if (projectScanToggle) {
            const on = !!JungleSettings.get('projectScan');
            projectScanToggle.classList.toggle('on', on);
            projectScanToggle.setAttribute('aria-checked', String(on));
        }
        const theme = JungleSettings.get('theme');
        themeChoice.querySelectorAll('.theme-opt').forEach(b =>
            b.classList.toggle('selected', b.dataset.theme === theme));
        const mode = JungleSettings.get('executionMode') || 'interpreter';
        executionModeChoice?.querySelectorAll('.execution-mode-opt').forEach(b => {
            const selected = b.dataset.mode === mode;
            b.classList.toggle('selected', selected);
            b.setAttribute('aria-pressed', String(selected));
        });
    }

    openBtn.onclick = () => { settingsScreen.classList.add('visible'); syncUI(); };
    backBtn.onclick = () => settingsScreen.classList.remove('visible');

    analysisToggle.onclick = () => {
        const willEnable = !analysisToggle.classList.contains('on');
        JungleSettings.set('disableAnalysis', !willEnable);
        syncUI();
        JungleUI.showToast(
            willEnable ? 'Scanners & analyzers enabled' : 'Scanners & analyzers OFF — code now runs even with errors',
            willEnable ? 'success' : 'error');
    };

    if (projectScanToggle) projectScanToggle.onclick = () => {
        const willEnable = !projectScanToggle.classList.contains('on');
        JungleSettings.set('projectScan', willEnable);
        syncUI();
        // Refresh the Console immediately to reflect the new mode.
        if (typeof runLiveAnalysis === 'function') runLiveAnalysis();
        JungleUI.showToast(willEnable ? 'Whole-project analysis on — scanning all files' : 'Whole-project analysis off — scanning current file only', willEnable ? 'success' : 'info');
    };

    themeChoice.querySelectorAll('.theme-opt').forEach(btn => {
        btn.onclick = () => {
            const theme = btn.dataset.theme;
            JungleSettings.set('theme', theme);
            applyTheme(theme);
            syncUI();
        };
    });
    executionModeChoice?.querySelectorAll('.execution-mode-opt').forEach(btn => {
        btn.onclick = () => {
            JungleSettings.set('executionMode', btn.dataset.mode === 'api' ? 'api' : 'interpreter');
            syncUI();
            JungleUI.showToast(btn.dataset.mode === 'api' ? 'Real API execution selected' : 'Interpreter execution selected');
        };
    });

    // Apply persisted settings on first load.
    applyTheme(JungleSettings.get('theme'));
    syncUI();
})();

// Tools: multi-language scanning is deliberately isolated from normal editing mode.
(function initBugTools() {
    const toolsBtn = document.getElementById('tools-btn');
    const toolsMenu = document.getElementById('tools-menu');
    const languageMenu = document.getElementById('bug-language-menu');
    const findBugs = document.getElementById('find-bugs-tool');
    const multiLanguage = document.getElementById('multilang-tool');
    if (!toolsBtn || !toolsMenu || !languageMenu) return;
    const extras = ['CSS','JSON','YAML','XML','Markdown','Vue','Svelte','React','Angular','Dockerfile','Makefile','Terraform','GraphQL','PowerShell','Batch','Fish','Racket','Scheme','Reason','Elm','Fennel','Verilog','VHDL','MATLAB','Objective-C'];
    const languages = [...new Set([...ALL_LANGS, ...extras])].sort();
    let multiEnabled = false;
    let scanLanguages = [];
    const close = () => { toolsMenu.classList.remove('show'); languageMenu.classList.remove('show'); toolsBtn.setAttribute('aria-expanded', 'false'); };
    const render = () => {
        languageMenu.innerHTML = languages.map(language => `<button type="button" data-language="${language}" class="${scanLanguages.includes(language) ? 'selected' : ''}">${scanLanguages.includes(language) ? '✓ ' : ''}${LANGUAGE_DISPLAY_NAMES[language] || language}</button>`).join('');
        languageMenu.querySelectorAll('[data-language]').forEach(button => button.onclick = () => {
            const language = button.dataset.language;
            if (multiEnabled) scanLanguages = scanLanguages.includes(language) ? scanLanguages.filter(item => item !== language) : [...scanLanguages, language];
            else scanLanguages = [language];
            render();
            if (scanLanguages.length) runBugScan();
        });
    };
    const runBugScan = () => {
        const project = JungleUI.getCurrentProject(); if (!project || !scanLanguages.length) return;
        document.body.classList.add('bug-scan-mode');
        const results = [], map = [], seen = new Set(); let total = 0;
        for (const [file, code] of Object.entries(project.files)) for (const language of scanLanguages) {
            let issues = []; try { issues = JungleScanner.scan(language, code || ''); } catch (_) {}
            if (typeof JungleAnalyzer !== 'undefined') try { issues.push(...JungleAnalyzer.analyze(language, project.files, file)); } catch (_) {}
            issues = issues.filter(issue => { const key = `${file}:${language}:${issue.line}:${issue.msg}`; if (seen.has(key)) return false; seen.add(key); return true; });
            map.push({ file, lang: language, folder: file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '' });
            if (issues.length) { results.push({ file: `${file} [${language}]`, lang: language, issues }); total += issues.length; }
        }
        showProjectIssues({ map, results, scanned: map.length, total }); switchView('console');
    };
    toolsBtn.onclick = event => { event.stopPropagation(); const open = !toolsMenu.classList.contains('show'); close(); if (open) { toolsMenu.classList.add('show'); toolsBtn.setAttribute('aria-expanded', 'true'); } };
    findBugs.onclick = event => { event.stopPropagation(); multiEnabled = false; languageMenu.classList.add('show'); render(); };
    multiLanguage.onclick = event => { event.stopPropagation(); multiEnabled = true; selectedLanguages = selectedLanguages.length ? selectedLanguages : ['Javascript']; scanLanguages = [...selectedLanguages]; languageMenu.classList.add('show'); render(); };
    document.addEventListener('click', close);
    // The Extensions button now remains open while languages are checked or unchecked.
    renderLangPickerGrid = function(filter) {
        const filtered = filter ? ALL_LANGS.filter(language => language.toLowerCase().includes(filter)) : ALL_LANGS;
        langPickerGrid.innerHTML = filtered.map(language => `<div class="lang-picker-card${selectedLanguages.includes(language) ? ' selected' : ''}" data-lang="${language}"><span class="lang-picker-icon">${LANG_ICONS[language] || '📄'}</span><span class="lang-picker-name">${LANGUAGE_DISPLAY_NAMES[language] || language}</span><span class="lang-picker-description">${selectedLanguages.includes(language) ? '✓ Selected' : LANGUAGE_DESCRIPTIONS[language] || ''}</span></div>`).join('');
        langPickerGrid.querySelectorAll('.lang-picker-card').forEach(card => card.onclick = () => {
            const language = card.dataset.lang;
            selectedLanguages = selectedLanguages.includes(language) ? selectedLanguages.filter(item => item !== language) : [...selectedLanguages, language];
            if (!selectedLanguages.length) selectedLanguages = ['Javascript'];
            const project = JungleUI.getCurrentProject(); if (project) { project.lang = selectedLanguages[0]; JungleStorage.saveProjects(projects); }
            currentLanguageText.textContent = selectedLanguages.map(language => LANGUAGE_DISPLAY_NAMES[language] || language).join(', ');
            renderLangPickerGrid(filter);
        });
    };
    const runCurrentLanguage = runBtn.onclick;
    runBtn.onclick = async () => {
        if (selectedLanguages.length < 2) return runCurrentLanguage();
        const project = JungleUI.getCurrentProject(); if (!project || !project.currentFile) return;
        for (const language of selectedLanguages) await JungleRunner.execute(language, project.files[project.currentFile] || '', project.files);
    };
})();

// Stacked split editor: the original editor stays in the upper half and a second,
// independently-selected project file is editable below it.
(function initStackedSplitEditor() {
    const tools = document.querySelector('.tools-control');
    const container = document.getElementById('editor-container');
    if (!tools || !container) return;
    tools.insertAdjacentHTML('afterend', '<button id="split-editor-btn" title="Toggle stacked editor" aria-label="Toggle stacked editor">↕</button>');
    const button = document.getElementById('split-editor-btn');
    const style = document.createElement('style');
    style.textContent = '#exit-to-hub-header-btn{display:none!important}.tools-control{position:relative;display:flex;align-items:center;margin-left:-8px}.tools-icon-btn,#split-editor-btn{width:24px;height:24px;padding:0;background:transparent;color:#849690;border:0;border-radius:4px;cursor:pointer;font-size:18px;line-height:1}.tools-icon-btn:hover,#split-editor-btn:hover,.tools-icon-btn[aria-expanded="true"]{background:#1c2522;color:#aed9cb}.tools-menu,.bug-language-menu{position:absolute;display:none;top:30px;left:0;z-index:80;background:#161c1a;border:1px solid #2a3d35;border-radius:7px;padding:4px;box-shadow:0 10px 28px #0008}.tools-menu.show,.bug-language-menu.show{display:block}.tools-menu button{width:210px;padding:9px 10px;display:flex;justify-content:space-between;background:none;color:#c8ddd8;border:0;border-radius:4px;text-align:left;cursor:pointer}.tools-menu button:hover,.bug-language-menu button:hover{background:#1c3028;color:#fff}.bug-language-menu{left:218px;max-height:340px;overflow:auto;min-width:190px}.bug-language-menu button{display:block;width:100%;padding:7px 10px;color:#c8ddd8;background:none;border:0;border-radius:4px;text-align:left;cursor:pointer;font:12px monospace}.bug-language-menu button.selected{background:#1c3028;color:#aed9cb}.stacked-pane{position:absolute;left:0;right:0;bottom:0;height:50%;background:#0b0d10;border-top:1px solid #35453e;z-index:5;display:flex;flex-direction:column}.stacked-pane-header{height:28px;display:flex;align-items:center;padding:0 9px;background:#111413;color:#849690;font:12px monospace}.stacked-pane select{margin-left:8px;max-width:260px;background:#161c1a;color:#aed9cb;border:1px solid #35453e;border-radius:3px;font:12px monospace}.stacked-pane textarea{flex:1;min-height:0;resize:none;border:0;outline:0;padding:12px 20px;background:#0b0d10;color:#d1d5db;caret-color:#74a896;font:14px/22px Fira Code,Consolas,monospace;tab-size:4}.split-active #code-editor,.split-active #highlight-overlay{height:50%!important}.split-active #line-gutter{padding-bottom:calc(50% + 20px)}.bug-scan-mode #tab-preview,.bug-scan-mode #run-btn,.bug-scan-mode #tab-terminal-btn,.bug-scan-mode #template-panel-toggle{display:none!important}.bug-scan-mode .sidebar-tabs{display:grid;grid-template-columns:1fr 1fr}';
    document.head.appendChild(style);
    const closeSplit = () => { container.querySelector('.stacked-pane')?.remove(); container.classList.remove('split-active'); button.classList.remove('active'); };
    button.onclick = () => {
        if (container.classList.contains('split-active')) return closeSplit();
        const project = JungleUI.getCurrentProject(); if (!project) return;
        const files = Object.keys(project.files); if (!files.length) return;
        const other = files.find(file => file !== project.currentFile) || project.currentFile;
        const pane = document.createElement('section'); pane.className = 'stacked-pane';
        pane.innerHTML = '<div class="stacked-pane-header">Second editor <select></select></div><textarea spellcheck="false"></textarea>';
        const select = pane.querySelector('select'), textarea = pane.querySelector('textarea');
        const refresh = () => { select.innerHTML = files.map(file => `<option value="${file}">${file}</option>`).join(''); select.value = other; textarea.value = project.files[select.value] || ''; };
        select.onchange = () => { textarea.value = project.files[select.value] || ''; textarea.focus(); };
        textarea.oninput = () => { project.files[select.value] = textarea.value; JungleStorage.saveProjects(projects); };
        textarea.onkeydown = event => { if (event.key === 'Tab') { event.preventDefault(); const start = textarea.selectionStart; textarea.setRangeText('    ', start, textarea.selectionEnd, 'end'); textarea.dispatchEvent(new Event('input')); } };
        refresh(); container.appendChild(pane); container.classList.add('split-active'); button.classList.add('active');
    };
})();
