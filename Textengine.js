// Jungle TextEngine: editor commands layered over the native textarea.
class JungleTextEngine {
    constructor(textarea, options = {}) {
        if (!textarea) throw new Error('JungleTextEngine needs a textarea.');
        this.el = textarea;
        this.indent = options.indent || '    ';
        this.history = [];
        this.future = [];
        this.composing = false;
        this.commands = new Map();
        this.record();
        textarea.addEventListener('compositionstart', () => this.composing = true);
        textarea.addEventListener('compositionend', () => { this.composing = false; this.record(); });
        textarea.addEventListener('input', () => { if (!this.composing) this.record(); });
        textarea.addEventListener('keydown', event => this.onKeydown(event));
        this.buildPanels();
        this.registerDefaultCommands();
    }
    state() { return { value: this.el.value, start: this.el.selectionStart, end: this.el.selectionEnd }; }
    record() {
        const state = this.state(), last = this.history[this.history.length - 1];
        if (last && last.value === state.value) return;
        this.history.push(state); if (this.history.length > 200) this.history.shift(); this.future = [];
    }
    restore(state) {
        this.el.value = state.value; this.el.selectionStart = state.start; this.el.selectionEnd = state.end;
        this.el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    change(start, end, text, selectionStart = start + text.length, selectionEnd = selectionStart) {
        this.el.setRangeText(text, start, end, 'preserve');
        this.el.selectionStart = selectionStart; this.el.selectionEnd = selectionEnd;
        this.el.dispatchEvent(new Event('input', { bubbles: true })); this.record();
    }
    lineRange() {
        const value = this.el.value, start = value.lastIndexOf('\n', this.el.selectionStart - 1) + 1;
        const next = value.indexOf('\n', this.el.selectionEnd);
        return { start, end: next < 0 ? value.length : next, text: value.slice(start, next < 0 ? value.length : next) };
    }
    indentSelection(outdent) {
        const range = this.lineRange();
        const text = range.text.split('\n').map(line => outdent ? line.replace(/^( {1,4}|\t)/, '') : this.indent + line).join('\n');
        this.change(range.start, range.end, text, range.start, range.start + text.length);
    }
    toggleComment() {
        const range = this.lineRange();
        const file = typeof JungleUI !== 'undefined' ? JungleUI.getCurrentProject?.()?.currentFile || '' : '';
        const prefix = /\.(py|rb|sh|bash|r|pl|nim|jl|yml|yaml)$/i.test(file) ? '# ' : '// ';
        const lines = range.text.split('\n');
        const remove = lines.filter(line => line.trim()).every(line => line.trimStart().startsWith(prefix));
        const text = lines.map(line => {
            const lead = line.match(/^\s*/)[0];
            return remove ? lead + line.slice(lead.length).replace(prefix, '') : lead + prefix + line.slice(lead.length);
        }).join('\n');
        this.change(range.start, range.end, text, range.start, range.start + text.length);
    }
    undo() { if (this.history.length > 1) { this.future.push(this.history.pop()); this.restore(this.history[this.history.length - 1]); } }
    redo() { const next = this.future.pop(); if (next) { this.history.push(next); this.restore(next); } }
    buildPanels() {
        const host = this.el.closest('.editor-wrapper') || this.el.parentElement;
        if (!host) return;
        this.findPanel = document.createElement('div');
        this.findPanel.className = 'jungle-find-panel';
        this.findPanel.innerHTML = '<input aria-label="Find" placeholder="Find"><input aria-label="Replace" placeholder="Replace"><button title="Previous match">↑</button><button title="Next match">↓</button><button title="Replace all">All</button><button title="Close">×</button>';
        const [find, replace, previous, next, all, close] = this.findPanel.children;
        find.addEventListener('input', () => this.findNext(false));
        find.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.findNext(e.shiftKey); } if (e.key === 'Escape') this.hideFind(); });
        previous.onclick = () => this.findNext(true); next.onclick = () => this.findNext(false);
        all.onclick = () => this.replaceAll(find.value, replace.value); close.onclick = () => this.hideFind();
        host.appendChild(this.findPanel);
        this.suggestPanel = document.createElement('div'); this.suggestPanel.className = 'jungle-suggest-panel'; host.appendChild(this.suggestPanel);
        this.commandPanel = document.createElement('div'); this.commandPanel.className = 'jungle-command-panel';
        this.commandPanel.innerHTML = '<input aria-label="Command palette" placeholder="Type a command…"><div class="jungle-command-results"></div>';
        this.commandInput = this.commandPanel.querySelector('input'); this.commandResults = this.commandPanel.querySelector('div');
        this.commandInput.addEventListener('input', () => this.renderCommands());
        this.commandInput.addEventListener('keydown', e => {
            if (e.key === 'Escape') { e.preventDefault(); this.hideCommands(); }
            if (e.key === 'Enter') { e.preventDefault(); this.runCommand(this.visibleCommands?.[0]?.id); }
        });
        host.appendChild(this.commandPanel);
        const style = document.createElement('style');
        style.textContent = '.jungle-find-panel{position:absolute;right:16px;top:12px;z-index:10;display:none;gap:6px;padding:7px;background:#111a17;border:1px solid #528b74;border-radius:7px;box-shadow:0 8px 25px #0008}.jungle-find-panel.show{display:flex}.jungle-find-panel input,.jungle-command-panel input{width:120px;background:#080a0d;color:#d1d5db;border:1px solid #35453e;border-radius:4px;padding:5px 7px;font:12px Fira Code,monospace}.jungle-find-panel button{background:#1c2b25;color:#aed9cb;border:1px solid #528b74;border-radius:4px;cursor:pointer}.jungle-suggest-panel{position:absolute;display:none;z-index:11;min-width:180px;max-height:170px;overflow:auto;background:#111a17;border:1px solid #528b74;border-radius:6px;box-shadow:0 8px 25px #0008}.jungle-suggest-panel.show{display:block}.jungle-suggest-item{padding:6px 10px;color:#d1d5db;font:12px Fira Code,monospace;cursor:pointer}.jungle-suggest-item:hover,.jungle-suggest-item.active{background:#1c2b25;color:#aed9cb}.jungle-command-panel{position:absolute;top:18%;left:50%;transform:translateX(-50%);z-index:15;display:none;width:min(460px,80%);padding:10px;background:#111a17;border:1px solid #74a896;border-radius:9px;box-shadow:0 15px 50px #000b}.jungle-command-panel.show{display:block}.jungle-command-panel input{width:100%;box-sizing:border-box;padding:9px}.jungle-command-results{margin-top:8px;max-height:260px;overflow:auto}.jungle-command-row{padding:8px;color:#d1d5db;font:13px Inter,sans-serif;cursor:pointer;border-radius:4px}.jungle-command-row:hover{background:#1c2b25;color:#aed9cb}';
        document.head.appendChild(style);
    }
    showFind(replace = false) { this.findPanel.classList.add('show'); this.findPanel.children[replace ? 1 : 0].focus(); this.findPanel.children[replace ? 1 : 0].select(); }
    hideFind() { this.findPanel.classList.remove('show'); this.el.focus(); }
    findNext(backward) {
        const term = this.findPanel.children[0].value; if (!term) return;
        const from = backward ? this.el.selectionStart - 1 : this.el.selectionEnd;
        let at = backward ? this.el.value.lastIndexOf(term, from) : this.el.value.indexOf(term, from);
        if (at < 0) at = backward ? this.el.value.lastIndexOf(term) : this.el.value.indexOf(term);
        if (at >= 0) { this.el.focus(); this.el.selectionStart = at; this.el.selectionEnd = at + term.length; this.el.dispatchEvent(new Event('scroll')); }
    }
    replaceAll(term, replacement) {
        if (!term) return; const value = this.el.value, count = value.split(term).length - 1;
        if (!count) return; this.change(0, value.length, value.split(term).join(replacement), 0, 0);
    }
    goToLine() {
        const line = Number(prompt('Go to line:')); if (!Number.isInteger(line) || line < 1) return;
        let at = 0; for (let i = 1; i < line && at >= 0; i++) at = this.el.value.indexOf('\n', at) + 1;
        if (at >= 0) { this.el.focus(); this.el.selectionStart = this.el.selectionEnd = at; this.el.scrollTop = Math.max(0, (line - 3) * 22); }
    }
    duplicateLine() { const r = this.lineRange(); this.change(r.end, r.end, '\n' + r.text, r.start + r.text.length + 1, r.end + r.text.length + 1); }
    moveLine(direction) {
        const r = this.lineRange(), value = this.el.value;
        const beforeStart = value.lastIndexOf('\n', r.start - 2) + 1, afterEnd = value.indexOf('\n', r.end + 1);
        if (direction < 0 && r.start > 0) { const previous = value.slice(beforeStart, r.start - 1); this.change(beforeStart, r.end, r.text + '\n' + previous, beforeStart, beforeStart + r.text.length); }
        if (direction > 0 && afterEnd >= 0) { const next = value.slice(r.end + 1, afterEnd); this.change(r.start, afterEnd, next + '\n' + r.text, r.start + next.length + 1, r.start + next.length + 1 + r.text.length); }
    }
    showSuggestions() {
        const before = this.el.value.slice(0, this.el.selectionStart), match = before.match(/[A-Za-z_$][\w$]*$/); if (!match) return;
        const word = match[0], words = [...new Set((this.el.value.match(/[A-Za-z_$][\w$]*/g) || []).filter(w => w.length > 2 && w !== word))].filter(w => w.toLowerCase().startsWith(word.toLowerCase())).slice(0, 8);
        if (!words.length) return; this.suggestions = words; this.suggestIndex = 0;
        this.suggestPanel.innerHTML = words.map((w, i) => `<div class="jungle-suggest-item${i ? '' : ' active'}" data-word="${w}">${w}</div>`).join('');
        this.suggestPanel.querySelectorAll('[data-word]').forEach(node => node.onclick = () => this.acceptSuggestion(node.dataset.word));
        const rect = this.el.getBoundingClientRect(); this.suggestPanel.style.left = Math.min(rect.width - 200, 70) + 'px'; this.suggestPanel.style.bottom = '14px'; this.suggestPanel.classList.add('show');
    }
    acceptSuggestion(word) { const match = this.el.value.slice(0, this.el.selectionStart).match(/[A-Za-z_$][\w$]*$/); if (match) this.change(this.el.selectionStart - match[0].length, this.el.selectionStart, word); this.hideSuggestions(); }
    hideSuggestions() { this.suggestPanel.classList.remove('show'); }
    addCommand(id, title, action) { this.commands.set(id, { id, title, action }); }
    registerDefaultCommands() {
        this.addCommand('find', 'Find', () => this.showFind(false));
        this.addCommand('replace', 'Find and Replace', () => this.showFind(true));
        this.addCommand('goto', 'Go to Line', () => this.goToLine());
        this.addCommand('duplicate', 'Duplicate Line', () => this.duplicateLine());
        this.addCommand('comment', 'Toggle Comment', () => this.toggleComment());
        this.addCommand('indent', 'Indent Selection', () => this.indentSelection(false));
        this.addCommand('outdent', 'Outdent Selection', () => this.indentSelection(true));
        this.addCommand('selectAll', 'Select All', () => { this.el.focus(); this.el.select(); });
        this.addCommand('uppercase', 'Transform Selection to Uppercase', () => this.transformSelection(text => text.toUpperCase()));
        this.addCommand('lowercase', 'Transform Selection to Lowercase', () => this.transformSelection(text => text.toLowerCase()));
    }
    transformSelection(transform) {
        const start = this.el.selectionStart, end = this.el.selectionEnd;
        if (start !== end) this.change(start, end, transform(this.el.value.slice(start, end)), start, end);
    }
    showCommands() { this.commandPanel.classList.add('show'); this.commandInput.value = ''; this.renderCommands(); this.commandInput.focus(); }
    hideCommands() { this.commandPanel.classList.remove('show'); this.el.focus(); }
    renderCommands() {
        const query = this.commandInput.value.toLowerCase();
        this.visibleCommands = [...this.commands.values()].filter(command => command.title.toLowerCase().includes(query));
        this.commandResults.innerHTML = this.visibleCommands.map(command => `<div class="jungle-command-row" data-command="${command.id}">${command.title}</div>`).join('') || '<div class="jungle-command-row">No matching command</div>';
        this.commandResults.querySelectorAll('[data-command]').forEach(node => node.onclick = () => this.runCommand(node.dataset.command));
    }
    runCommand(id) { const command = this.commands.get(id); if (command) { this.hideCommands(); command.action(); } }
    onKeydown(event) {
        if (this.composing || event.defaultPrevented) return;
        const mod = event.ctrlKey || event.metaKey, key = event.key;
        const stop = fn => { event.preventDefault(); event.stopImmediatePropagation(); fn(); };
        if (mod && key.toLowerCase() === 'z') return stop(() => event.shiftKey ? this.redo() : this.undo());
        if (mod && key.toLowerCase() === 'y') return stop(() => this.redo());
        if (mod && key.toLowerCase() === 'f') return stop(() => this.showFind(false));
        if (mod && event.shiftKey && key.toLowerCase() === 'p') return stop(() => this.showCommands());
        if (mod && key.toLowerCase() === 'h') return stop(() => this.showFind(true));
        if (mod && key.toLowerCase() === 'g') return stop(() => this.goToLine());
        if (mod && event.shiftKey && key.toLowerCase() === 'd') return stop(() => this.duplicateLine());
        if (mod && key === '/') return stop(() => this.toggleComment());
        if (event.altKey && key === 'ArrowUp') return stop(() => this.moveLine(-1));
        if (event.altKey && key === 'ArrowDown') return stop(() => this.moveLine(1));
        if (event.ctrlKey && key === ' ') return stop(() => this.showSuggestions());
        if (this.suggestPanel?.classList.contains('show') && (key === 'Tab' || key === 'Enter')) return stop(() => this.acceptSuggestion(this.suggestions[this.suggestIndex]));
        if (this.suggestPanel?.classList.contains('show') && key === 'Escape') return stop(() => this.hideSuggestions());
        if (key === 'Tab') return stop(() => this.indentSelection(event.shiftKey));
        if (key === 'Enter') return stop(() => {
            const before = this.el.value.slice(0, this.el.selectionStart), line = before.slice(before.lastIndexOf('\n') + 1);
            const padding = (line.match(/^\s*/) || [''])[0] + (/[{[(]\s*$/.test(line) ? this.indent : '');
            this.change(this.el.selectionStart, this.el.selectionEnd, '\n' + padding);
        });
        const pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
        if (!mod && pairs[key]) return stop(() => {
            const start = this.el.selectionStart, end = this.el.selectionEnd, selected = this.el.value.slice(start, end);
            this.change(start, end, key + selected + pairs[key], start + 1, selected ? end + 1 : start + 1);
        });
    }
}
