// Jungle TextEngine: a language-aware editing layer over the native textarea.
// The textarea remains the editing surface, while this class supplies the
// model, transactions, navigation, completion, and editor components that a
// larger text editor normally owns.
class JungleTextEngine {
    constructor(textarea, options = {}) {
        if (!textarea) throw new Error('JungleTextEngine needs a textarea.');
        this.el = textarea;
        this.indent = options.indent || '    ';
        this.historyLimit = Math.max(50, Number(options.historyLimit) || 500);
        this.history = [];
        this.future = [];
        this.commands = new Map();
        this.visibleCommands = [];
        this.commandIndex = 0;
        this.composing = false;
        this.suppressRecord = false;
        this.breakUndoGroup = true;
        this.lastInputAt = 0;
        this.suggestions = [];
        this.suggestIndex = 0;

        this.record({ force: true });
        textarea.addEventListener('compositionstart', () => { this.composing = true; });
        textarea.addEventListener('compositionend', () => {
            this.composing = false;
            this.record({ coalesce: false });
            this.refreshStatus();
        });
        textarea.addEventListener('input', () => {
            if (!this.composing && !this.suppressRecord) this.record({ coalesce: true });
            this.hideSuggestions();
            this.refreshStatus();
        });
        ['click', 'keyup', 'select', 'scroll'].forEach(type => textarea.addEventListener(type, () => this.refreshStatus()));
        textarea.addEventListener('keydown', event => this.onKeydown(event));
        textarea.addEventListener('paste', event => this.onPaste(event));
        this.buildPanels();
        this.registerDefaultCommands();
        this.refreshStatus();
    }

    state() {
        return { value: this.el.value, start: this.el.selectionStart, end: this.el.selectionEnd, time: Date.now() };
    }

    setDocument(value = '', start = 0, end = start, { emitInput = false } = {}) {
        const numericStart = Number(start);
        const numericEnd = Number(end);
        const safeStart = Number.isFinite(numericStart) ? numericStart : 0;
        const safeEnd = Number.isFinite(numericEnd) ? numericEnd : safeStart;
        this.suppressRecord = true;
        this.el.value = String(value ?? '');
        this.el.selectionStart = Math.max(0, Math.min(safeStart, this.el.value.length));
        this.el.selectionEnd = Math.max(this.el.selectionStart, Math.min(safeEnd, this.el.value.length));
        this.suppressRecord = false;
        this.history = [];
        this.future = [];
        this.breakUndoGroup = true;
        this.lastInputAt = 0;
        this.hideSuggestions();
        this.findPanel?.classList.remove('show');
        this.commandPanel?.classList.remove('show');
        this.record({ force: true });
        if (emitInput) this.dispatchInput();
        this.refreshStatus();
    }

    record({ coalesce = false, force = false } = {}) {
        if (this.suppressRecord) return;
        const state = this.state();
        const last = this.history[this.history.length - 1];
        if (!force && last && last.value === state.value) return;
        const now = Date.now();
        const canCoalesce = coalesce && !this.breakUndoGroup && last && this.history.length > 1
            && now - (this.lastInputAt || last.time || 0) < 900;
        if (canCoalesce) {
            this.history[this.history.length - 1] = state;
        } else {
            this.history.push(state);
            if (this.history.length > this.historyLimit) this.history.shift();
        }
        this.lastInputAt = now;
        this.breakUndoGroup = false;
        this.future = [];
    }

    restore(state) {
        this.suppressRecord = true;
        this.el.value = state.value;
        this.el.selectionStart = Math.min(state.start, this.el.value.length);
        this.el.selectionEnd = Math.min(state.end, this.el.value.length);
        this.suppressRecord = false;
        this.dispatchInput();
        this.breakUndoGroup = true;
        this.refreshStatus();
    }

    dispatchInput() {
        this.el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    change(start, end, text, selectionStart = start + text.length, selectionEnd = selectionStart) {
        const from = Math.max(0, Math.min(start, this.el.value.length));
        const to = Math.max(from, Math.min(end, this.el.value.length));
        this.suppressRecord = true;
        this.el.setRangeText(String(text), from, to, 'preserve');
        this.el.selectionStart = Math.max(0, Math.min(selectionStart, this.el.value.length));
        this.el.selectionEnd = Math.max(this.el.selectionStart, Math.min(selectionEnd, this.el.value.length));
        this.suppressRecord = false;
        this.dispatchInput();
        this.record({ coalesce: false });
        this.breakUndoGroup = true;
        this.refreshStatus();
    }

    lineRange() {
        const value = this.el.value;
        const start = value.lastIndexOf('\n', this.el.selectionStart - 1) + 1;
        const next = value.indexOf('\n', this.el.selectionEnd);
        const end = next < 0 ? value.length : next;
        return { start, end, text: value.slice(start, end) };
    }

    lineNumberAt(offset) {
        const safe = Math.max(0, Math.min(Number(offset) || 0, this.el.value.length));
        return this.el.value.slice(0, safe).split('\n').length;
    }

    columnAt(offset) {
        const safe = Math.max(0, Math.min(Number(offset) || 0, this.el.value.length));
        return safe - this.el.value.lastIndexOf('\n', safe - 1);
    }

    offsetAt(line, column = 1) {
        const lines = this.el.value.split('\n');
        const index = Math.max(0, Math.min(lines.length - 1, Number(line) - 1));
        let offset = 0;
        for (let i = 0; i < index; i++) offset += lines[i].length + 1;
        return Math.min(offset + Math.max(0, Number(column) - 1), offset + lines[index].length);
    }

    currentLocation() {
        return { line: this.lineNumberAt(this.el.selectionStart), column: this.columnAt(this.el.selectionStart) };
    }

    selectedLineText() {
        return this.el.value.slice(this.lineRange().start, this.lineRange().end);
    }

    currentFile() {
        try { return JungleUI.getCurrentProject?.()?.currentFile || ''; } catch (_) { return ''; }
    }

    languageProfile() {
        const file = this.currentFile().toLowerCase();
        if (/\.(html?|xml|svg)$/.test(file)) return { line: null, block: ['<!--', '-->'], keywords: ['doctype', 'class', 'id', 'script', 'style'] };
        if (/\.(css|scss|less)$/.test(file)) return { line: null, block: ['/*', '*/'], keywords: ['display', 'position', 'margin', 'padding', 'color', 'background'] };
        if (/\.(py|pyw)$/.test(file)) return { line: '# ', block: null, keywords: ['def', 'class', 'import', 'from', 'return', 'async', 'await', 'match', 'case'] };
        if (/\.(rb)$/.test(file)) return { line: '# ', block: null, keywords: ['def', 'class', 'module', 'end', 'require', 'yield'] };
        if (/\.(sh|bash|zsh|fish|yml|yaml|toml|r|pl|pm|jl|nim)$/.test(file)) return { line: '# ', block: null, keywords: ['if', 'then', 'fi', 'for', 'in', 'do', 'done'] };
        if (/\.(sql)$/.test(file)) return { line: '-- ', block: ['/*', '*/'], keywords: ['select', 'from', 'where', 'join', 'group', 'order', 'limit'] };
        if (/\.(lua)$/.test(file)) return { line: '-- ', block: ['--[[', ']]'], keywords: ['function', 'local', 'require', 'return', 'if', 'then', 'end'] };
        if (/\.(hs|haskell)$/.test(file)) return { line: '-- ', block: ['{-', '-}'], keywords: ['module', 'import', 'where', 'let', 'in', 'case', 'of', 'data'] };
        if (/\.(erl)$/.test(file)) return { line: '% ', block: null, keywords: ['module', 'export', 'receive', 'case', 'of', 'end'] };
        if (/\.(ex|exs)$/.test(file)) return { line: '# ', block: null, keywords: ['def', 'defmodule', 'use', 'alias', 'case', 'fn', 'do', 'end'] };
        if (/\.(fs|f90|for|f)$/.test(file)) return { line: '! ', block: null, keywords: ['module', 'use', 'subroutine', 'function', 'end'] };
        if (/\.(lisp|clj|cljc|scm)$/.test(file)) return { line: '; ', block: null, keywords: ['defn', 'let', 'fn', 'require', 'ns'] };
        return { line: '// ', block: ['/*', '*/'], keywords: ['const', 'let', 'var', 'function', 'class', 'return', 'if', 'else', 'for', 'while', 'import', 'export', 'async', 'await'] };
    }

    indentationForLine(line) {
        return (String(line).match(/^\s*/) || [''])[0];
    }

    indentSelection(outdent = false) {
        const range = this.lineRange();
        const lines = range.text.split('\n');
        const unit = this.indent;
        const text = lines.map(line => {
            if (!outdent) return unit + line;
            if (line.startsWith('\t')) return line.slice(1);
            if (line.startsWith(unit)) return line.slice(unit.length);
            return line.replace(/^ {1,4}/, '');
        }).join('\n');
        const delta = text.length - range.text.length;
        const start = this.el.selectionStart === this.el.selectionEnd
            ? this.el.selectionStart + (outdent ? Math.min(0, delta) : unit.length) : range.start;
        const end = this.el.selectionStart === this.el.selectionEnd ? start : range.start + text.length;
        this.change(range.start, range.end, text, start, end);
    }

    toggleComment() {
        const range = this.lineRange();
        const profile = this.languageProfile();
        const lines = range.text.split('\n');
        const nonEmpty = lines.filter(line => line.trim());
        if (!nonEmpty.length) return;
        if (!profile.line && profile.block) {
            const trimmed = range.text.trim();
            const isWrapped = trimmed.startsWith(profile.block[0]) && trimmed.endsWith(profile.block[1]);
            const next = isWrapped
                ? trimmed.slice(profile.block[0].length, trimmed.length - profile.block[1].length).trim()
                : `${profile.block[0]} ${trimmed} ${profile.block[1]}`;
            const leading = range.text.match(/^\s*/)?.[0] || '';
            this.change(range.start, range.end, leading + next, range.start, range.start + leading.length + next.length);
            return;
        }
        const prefix = profile.line || '// ';
        const remove = nonEmpty.every(line => line.trimStart().startsWith(prefix.trim()));
        const text = lines.map(line => {
            const lead = line.match(/^\s*/)?.[0] || '';
            if (remove) return lead + line.slice(lead.length).replace(new RegExp(`^${this.escapeRegExp(prefix.trim())} ?`), '');
            return lead + prefix + line.slice(lead.length);
        }).join('\n');
        this.change(range.start, range.end, text, range.start, range.start + text.length);
    }

    undo() {
        if (this.history.length <= 1) return;
        this.future.push(this.history.pop());
        this.restore(this.history[this.history.length - 1]);
    }

    redo() {
        const next = this.future.pop();
        if (!next) return;
        this.history.push(next);
        this.restore(next);
    }

    buildPanels() {
        const host = this.el.closest('.editor-wrapper') || this.el.parentElement;
        if (!host) return;
        this.findPanel = document.createElement('div');
        this.findPanel.className = 'jungle-find-panel';
        this.findPanel.innerHTML = '<input aria-label="Find" placeholder="Find"><input aria-label="Replace" placeholder="Replace"><button title="Previous match">Prev</button><button title="Next match">Next</button><button title="Replace current">Replace</button><button title="Replace all">All</button><button title="Close">Close</button>';
        const [find, replace, previous, next, one, all, close] = this.findPanel.children;
        this.findInput = find;
        this.replaceInput = replace;
        this.findCase = document.createElement('input');
        this.findCase.type = 'checkbox';
        this.findCase.id = 'jungle-find-case';
        this.findRegex = document.createElement('input');
        this.findRegex.type = 'checkbox';
        this.findRegex.id = 'jungle-find-regex';
        const options = document.createElement('span');
        options.className = 'jungle-find-options';
        options.innerHTML = '<label><span>Case</span></label><label><span>Regex</span></label>';
        options.children[0].prepend(this.findCase);
        options.children[1].prepend(this.findRegex);
        this.findStatus = document.createElement('span');
        this.findStatus.className = 'jungle-find-status';
        options.appendChild(this.findStatus);
        this.findPanel.insertBefore(options, close);
        find.addEventListener('input', () => this.updateFindStatus());
        find.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); this.findNext(e.shiftKey); }
            if (e.key === 'Escape') this.hideFind();
        });
        replace.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.replaceCurrent(); } });
        this.findCase.addEventListener('change', () => this.updateFindStatus());
        this.findRegex.addEventListener('change', () => this.updateFindStatus());
        previous.onclick = () => this.findNext(true);
        next.onclick = () => this.findNext(false);
        one.onclick = () => this.replaceCurrent();
        all.onclick = () => this.replaceAll(find.value, replace.value);
        close.onclick = () => this.hideFind();
        host.appendChild(this.findPanel);

        this.suggestPanel = document.createElement('div');
        this.suggestPanel.className = 'jungle-suggest-panel';
        this.suggestPanel.setAttribute('role', 'listbox');
        host.appendChild(this.suggestPanel);

        this.commandPanel = document.createElement('div');
        this.commandPanel.className = 'jungle-command-panel';
        this.commandPanel.innerHTML = '<input aria-label="Command palette" placeholder="Type a command..."><div class="jungle-command-results"></div>';
        this.commandInput = this.commandPanel.querySelector('input');
        this.commandResults = this.commandPanel.querySelector('div');
        this.commandInput.addEventListener('input', () => { this.commandIndex = 0; this.renderCommands(); });
        this.commandInput.addEventListener('keydown', e => {
            if (e.key === 'Escape') { e.preventDefault(); this.hideCommands(); }
            if (e.key === 'ArrowDown') { e.preventDefault(); this.moveCommandSelection(1); }
            if (e.key === 'ArrowUp') { e.preventDefault(); this.moveCommandSelection(-1); }
            if (e.key === 'Enter') { e.preventDefault(); this.runCommand(this.visibleCommands[this.commandIndex]?.id); }
        });
        host.appendChild(this.commandPanel);

        this.statusPanel = document.createElement('div');
        this.statusPanel.className = 'jungle-editor-status';
        this.statusPanel.setAttribute('aria-live', 'polite');
        host.appendChild(this.statusPanel);
        const style = document.createElement('style');
        style.textContent = '.jungle-find-panel{position:absolute;right:16px;top:12px;z-index:10;display:none;align-items:center;flex-wrap:wrap;gap:6px;max-width:min(760px,calc(100% - 28px));padding:7px;background:#111a17;border:1px solid #528b74;border-radius:7px;box-shadow:0 8px 25px #0008}.jungle-find-panel.show{display:flex}.jungle-find-panel input:not([type=checkbox]),.jungle-command-panel input{width:120px;background:#080a0d;color:#d1d5db;border:1px solid #35453e;border-radius:4px;padding:5px 7px;font:12px Fira Code,monospace}.jungle-find-panel button{background:#1c2b25;color:#aed9cb;border:1px solid #528b74;border-radius:4px;cursor:pointer;padding:4px 7px}.jungle-find-options{display:flex;align-items:center;gap:7px;color:#849690;font:11px Inter,sans-serif}.jungle-find-options label{display:inline-flex;align-items:center;gap:3px}.jungle-find-options input{accent-color:#74a896}.jungle-find-status{min-width:42px;color:#74a896}.jungle-suggest-panel{position:absolute;display:none;z-index:11;min-width:190px;max-height:190px;overflow:auto;background:#111a17;border:1px solid #528b74;border-radius:6px;box-shadow:0 8px 25px #0008}.jungle-suggest-panel.show{display:block}.jungle-suggest-item{padding:6px 10px;color:#d1d5db;font:12px Fira Code,monospace;cursor:pointer}.jungle-suggest-item:hover,.jungle-suggest-item.active{background:#1c2b25;color:#aed9cb}.jungle-command-panel{position:absolute;top:18%;left:50%;transform:translateX(-50%);z-index:15;display:none;width:min(460px,80%);padding:10px;background:#111a17;border:1px solid #74a896;border-radius:9px;box-shadow:0 15px 50px #000b}.jungle-command-panel.show{display:block}.jungle-command-panel input{width:100%;box-sizing:border-box;padding:9px}.jungle-command-results{margin-top:8px;max-height:300px;overflow:auto}.jungle-command-row{padding:8px;color:#d1d5db;font:13px Inter,sans-serif;cursor:pointer;border-radius:4px}.jungle-command-row:hover,.jungle-command-row.active{background:#1c2b25;color:#aed9cb}.jungle-editor-status{position:absolute;right:14px;bottom:7px;z-index:4;max-width:calc(100% - 90px);padding:3px 7px;border:1px solid #263b31;border-radius:4px;background:rgba(13,18,16,.88);color:#789087;font:11px Fira Code,monospace;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}body.theme-light .jungle-find-panel,body.theme-light .jungle-command-panel{background:#fff;border-color:#6d8c7e;box-shadow:0 8px 25px #0003}body.theme-light .jungle-find-panel input:not([type=checkbox]),body.theme-light .jungle-command-panel input{background:#f5f7f6;color:#17221e;border-color:#9aada4}body.theme-light .jungle-find-panel button{background:#edf3f0;color:#214438;border-color:#6d8c7e}body.theme-light .jungle-find-options{color:#536a60}body.theme-light .jungle-suggest-panel{background:#fff;border-color:#6d8c7e;box-shadow:0 8px 25px #0003}body.theme-light .jungle-suggest-item,body.theme-light .jungle-command-row{color:#263b32}body.theme-light .jungle-suggest-item:hover,body.theme-light .jungle-suggest-item.active,body.theme-light .jungle-command-row:hover,body.theme-light .jungle-command-row.active{background:#e7f0ec;color:#194f3c}body.theme-light .jungle-editor-status{background:rgba(255,255,255,.9);color:#536a60;border-color:#bdcbc4}';
        document.head.appendChild(style);
    }

    showFind(replace = false) {
        this.findPanel.classList.add('show');
        const field = this.findPanel.children[replace ? 1 : 0];
        field.focus();
        field.select();
        this.updateFindStatus();
    }

    hideFind() { this.findPanel.classList.remove('show'); this.el.focus(); }

    getFindMatches(term = this.findInput?.value || '') {
        const value = this.el.value;
        if (!term) return [];
        if (this.findRegex?.checked) {
            let regex;
            try { regex = new RegExp(term, `${this.findCase?.checked ? '' : 'i'}g`); } catch (_) { return []; }
            const matches = [];
            let match;
            while ((match = regex.exec(value)) !== null) {
                if (match[0].length === 0) regex.lastIndex += 1;
                matches.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
                if (regex.lastIndex > value.length) break;
            }
            return matches;
        }
        const needle = this.findCase?.checked ? term : term.toLowerCase();
        const source = this.findCase?.checked ? value : value.toLowerCase();
        const matches = [];
        let at = 0;
        while ((at = source.indexOf(needle, at)) >= 0) {
            matches.push({ start: at, end: at + term.length, text: value.slice(at, at + term.length) });
            at += Math.max(1, term.length);
        }
        return matches;
    }

    updateFindStatus() {
        if (!this.findStatus) return;
        const term = this.findInput?.value || '';
        if (!term) { this.findStatus.textContent = ''; return; }
        const matches = this.getFindMatches(term);
        this.findStatus.textContent = matches.length ? `${matches.length} match${matches.length === 1 ? '' : 'es'}` : 'No matches';
    }

    findNext(backward = false) {
        const matches = this.getFindMatches();
        if (!matches.length) { this.updateFindStatus(); return; }
        const cursor = backward ? this.el.selectionStart - 1 : this.el.selectionEnd;
        let found = backward ? [...matches].reverse().find(match => match.start < cursor) : matches.find(match => match.start >= cursor);
        if (!found) found = backward ? matches[matches.length - 1] : matches[0];
        this.el.focus();
        this.el.selectionStart = found.start;
        this.el.selectionEnd = found.end;
        this.refreshStatus();
    }

    replaceCurrent() {
        const term = this.findInput?.value || '';
        if (!term) return;
        const selected = this.el.value.slice(this.el.selectionStart, this.el.selectionEnd);
        const matches = this.getFindMatches(term);
        const current = matches.find(match => match.start === this.el.selectionStart && match.end === this.el.selectionEnd);
        if (!current || (this.findRegex?.checked ? !new RegExp(`^(?:${term})$`, this.findCase?.checked ? '' : 'i').test(selected) : (!this.findCase?.checked && selected.toLowerCase() !== term.toLowerCase()) && selected !== term)) {
            this.findNext(false);
            return;
        }
        const replacement = this.findRegex?.checked ? selected.replace(new RegExp(term, this.findCase?.checked ? '' : 'i'), this.replaceInput?.value || '') : (this.replaceInput?.value || '');
        this.change(current.start, current.end, replacement, current.start, current.start + replacement.length);
        this.updateFindStatus();
    }

    replaceAll(term, replacement) {
        if (!term) return;
        const matches = this.getFindMatches(term);
        if (!matches.length) { this.updateFindStatus(); return; }
        let value = this.el.value;
        for (let i = matches.length - 1; i >= 0; i--) {
            const match = matches[i];
            const next = this.findRegex?.checked ? match.text.replace(new RegExp(term, this.findCase?.checked ? '' : 'i'), replacement) : replacement;
            value = value.slice(0, match.start) + next + value.slice(match.end);
        }
        this.change(0, this.el.value.length, value, 0, 0);
        this.updateFindStatus();
    }

    goToLine() {
        const line = Number(prompt('Go to line:'));
        if (!Number.isInteger(line) || line < 1) return;
        const at = this.offsetAt(line, 1);
        this.el.focus();
        this.el.selectionStart = this.el.selectionEnd = at;
        this.el.scrollTop = Math.max(0, (line - 3) * 22);
        this.refreshStatus();
    }

    selectLine() {
        const range = this.lineRange();
        this.el.focus();
        this.el.selectionStart = range.start;
        this.el.selectionEnd = range.end;
        this.refreshStatus();
    }

    selectWord() {
        const range = this.getWordRange(this.el.selectionStart);
        if (!range) return;
        this.el.focus();
        this.el.selectionStart = range.start;
        this.el.selectionEnd = range.end;
        this.refreshStatus();
    }

    duplicateLine() {
        const range = this.lineRange();
        const suffix = range.end < this.el.value.length ? '\n' : '';
        this.change(range.end, range.end, suffix + range.text, range.end + suffix.length, range.end + suffix.length + range.text.length);
    }

    moveLine(direction) {
        const range = this.lineRange();
        const value = this.el.value;
        const start = range.start;
        const end = range.end;
        if (direction < 0 && start > 0) {
            const previousStart = value.lastIndexOf('\n', start - 2) + 1;
            const previous = value.slice(previousStart, start - 1);
            this.change(previousStart, end, range.text + '\n' + previous, previousStart, previousStart + range.text.length);
        } else if (direction > 0 && end < value.length) {
            const nextEnd = value.indexOf('\n', end + 1);
            const safeEnd = nextEnd < 0 ? value.length : nextEnd;
            const next = value.slice(end + 1, safeEnd);
            this.change(start, safeEnd, next + '\n' + range.text, start + next.length + 1, start + next.length + 1 + range.text.length);
        }
    }

    trimTrailingWhitespace() {
        const value = this.el.value.replace(/[ \t]+(?=\r?$)/gm, '');
        if (value !== this.el.value) this.change(0, this.el.value.length, value, this.el.selectionStart, this.el.selectionEnd);
    }

    sortSelectedLines() {
        const range = this.lineRange();
        const sorted = range.text.split('\n').sort((a, b) => a.localeCompare(b)).join('\n');
        if (sorted !== range.text) this.change(range.start, range.end, sorted, range.start, range.start + sorted.length);
    }

    joinSelectedLines() {
        const range = this.lineRange();
        const joined = range.text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).join(' ');
        this.change(range.start, range.end, joined, range.start, range.start + joined.length);
    }

    getWordRange(offset) {
        const value = this.el.value;
        let start = Math.max(0, Math.min(offset, value.length));
        let end = start;
        while (start > 0 && /[\w$]/.test(value[start - 1])) start--;
        while (end < value.length && /[\w$]/.test(value[end])) end++;
        return start === end ? null : { start, end };
    }

    completionWords() {
        const profile = this.languageProfile();
        const sourceWords = this.el.value.match(/[A-Za-z_$][\w$]*/g) || [];
        return [...new Set([...profile.keywords, ...sourceWords])];
    }

    showSuggestions() {
        const before = this.el.value.slice(0, this.el.selectionStart);
        const match = before.match(/[A-Za-z_$][\w$]*$/);
        if (!match) return;
        const word = match[0];
        const words = this.completionWords().filter(item => item.length > 1 && item !== word && item.toLowerCase().startsWith(word.toLowerCase())).slice(0, 12);
        if (!words.length) return;
        this.suggestions = words;
        this.suggestIndex = 0;
        this.suggestPanel.innerHTML = '';
        words.forEach((item, index) => {
            const node = document.createElement('div');
            node.className = `jungle-suggest-item${index === 0 ? ' active' : ''}`;
            node.textContent = item;
            node.setAttribute('role', 'option');
            node.addEventListener('mousedown', event => { event.preventDefault(); this.acceptSuggestion(item); });
            this.suggestPanel.appendChild(node);
        });
        const rect = this.el.getBoundingClientRect();
        const location = this.currentLocation();
        this.suggestPanel.style.left = Math.max(60, Math.min(rect.width - 220, 20 + location.column * 8)) + 'px';
        this.suggestPanel.style.top = Math.max(24, Math.min(rect.height - 200, (location.line * 22) - this.el.scrollTop + 20)) + 'px';
        this.suggestPanel.classList.add('show');
    }

    moveSuggestionSelection(direction) {
        if (!this.suggestions.length) return;
        this.suggestIndex = (this.suggestIndex + direction + this.suggestions.length) % this.suggestions.length;
        this.suggestPanel.querySelectorAll('.jungle-suggest-item').forEach((node, index) => node.classList.toggle('active', index === this.suggestIndex));
    }

    acceptSuggestion(word) {
        const match = this.el.value.slice(0, this.el.selectionStart).match(/[A-Za-z_$][\w$]*$/);
        if (match) this.change(this.el.selectionStart - match[0].length, this.el.selectionStart, word, this.el.selectionStart - match[0].length + word.length);
        this.hideSuggestions();
    }

    hideSuggestions() { this.suggestPanel?.classList.remove('show'); }

    addCommand(id, title, action) { this.commands.set(id, { id, title, action }); }

    registerDefaultCommands() {
        this.addCommand('find', 'Find', () => this.showFind(false));
        this.addCommand('replace', 'Find and Replace', () => this.showFind(true));
        this.addCommand('goto', 'Go to Line', () => this.goToLine());
        this.addCommand('selectLine', 'Select Current Line', () => this.selectLine());
        this.addCommand('selectWord', 'Select Word', () => this.selectWord());
        this.addCommand('duplicate', 'Duplicate Line', () => this.duplicateLine());
        this.addCommand('moveUp', 'Move Line Up', () => this.moveLine(-1));
        this.addCommand('moveDown', 'Move Line Down', () => this.moveLine(1));
        this.addCommand('comment', 'Toggle Comment', () => this.toggleComment());
        this.addCommand('indent', 'Indent Selection', () => this.indentSelection(false));
        this.addCommand('outdent', 'Outdent Selection', () => this.indentSelection(true));
        this.addCommand('trimWhitespace', 'Trim Trailing Whitespace', () => this.trimTrailingWhitespace());
        this.addCommand('sortLines', 'Sort Selected Lines', () => this.sortSelectedLines());
        this.addCommand('joinLines', 'Join Selected Lines', () => this.joinSelectedLines());
        this.addCommand('selectAll', 'Select All', () => { this.el.focus(); this.el.select(); });
        this.addCommand('uppercase', 'Transform Selection to Uppercase', () => this.transformSelection(text => text.toUpperCase()));
        this.addCommand('lowercase', 'Transform Selection to Lowercase', () => this.transformSelection(text => text.toLowerCase()));
    }

    transformSelection(transform) {
        const start = this.el.selectionStart;
        const end = this.el.selectionEnd;
        if (start !== end) this.change(start, end, transform(this.el.value.slice(start, end)), start, end);
    }

    showCommands() {
        this.commandPanel.classList.add('show');
        this.commandInput.value = '';
        this.commandIndex = 0;
        this.renderCommands();
        this.commandInput.focus();
    }

    hideCommands() { this.commandPanel.classList.remove('show'); this.el.focus(); }

    moveCommandSelection(direction) {
        if (!this.visibleCommands.length) return;
        this.commandIndex = (this.commandIndex + direction + this.visibleCommands.length) % this.visibleCommands.length;
        this.renderCommands();
    }

    renderCommands() {
        const query = this.commandInput.value.toLowerCase();
        this.visibleCommands = [...this.commands.values()].filter(command => command.title.toLowerCase().includes(query));
        this.commandIndex = Math.min(this.commandIndex, Math.max(0, this.visibleCommands.length - 1));
        this.commandResults.innerHTML = '';
        if (!this.visibleCommands.length) {
            const empty = document.createElement('div');
            empty.className = 'jungle-command-row';
            empty.textContent = 'No matching command';
            this.commandResults.appendChild(empty);
            return;
        }
        this.visibleCommands.forEach((command, index) => {
            const node = document.createElement('div');
            node.className = `jungle-command-row${index === this.commandIndex ? ' active' : ''}`;
            node.textContent = command.title;
            node.addEventListener('mousedown', event => { event.preventDefault(); this.runCommand(command.id); });
            this.commandResults.appendChild(node);
        });
    }

    runCommand(id) {
        const command = this.commands.get(id);
        if (!command) return;
        this.hideCommands();
        this.breakUndoGroup = true;
        command.action();
    }

    findMatchingBracket(position = this.el.selectionStart) {
        const value = this.el.value;
        const pairs = { '(': ')', '[': ']', '{': '}' };
        const closing = { ')': '(', ']': '[', '}': '{' };
        let at = value[position];
        if (!pairs[at] && !closing[at] && position > 0) { position--; at = value[position]; }
        if (!pairs[at] && !closing[at]) return -1;
        const step = pairs[at] ? 1 : -1;
        const target = pairs[at] || closing[at];
        let depth = 0;
        for (let i = position; i >= 0 && i < value.length; i += step) {
            const char = value[i];
            if (char === at) depth++;
            if (char === target) {
                depth--;
                if (depth === 0) return i;
            }
        }
        return -1;
    }

    refreshStatus() {
        if (!this.statusPanel) return;
        const location = this.currentLocation();
        const selected = Math.abs(this.el.selectionEnd - this.el.selectionStart);
        const file = this.currentFile();
        let language = '';
        try { language = JungleIntelligence.languageFromFilename(file, '') || ''; } catch (_) {}
        const bracket = this.findMatchingBracket();
        const bracketText = bracket >= 0 ? `Bracket ${this.lineNumberAt(bracket)}:${this.columnAt(bracket)}` : '';
        this.statusPanel.textContent = `Ln ${location.line}, Col ${location.column}${selected ? `  Sel ${selected}` : ''}${language ? `  ${language}` : ''}  Spaces: ${this.indent.length}  UTF-8${bracketText ? `  ${bracketText}` : ''}`;
    }

    onPaste(event) {
        const text = event.clipboardData?.getData('text/plain');
        if (!text || !text.includes('\n')) return;
        const before = this.el.value.slice(0, this.el.selectionStart);
        const currentLine = before.slice(before.lastIndexOf('\n') + 1);
        const base = this.indentationForLine(currentLine);
        const normalized = text.replace(/\r\n?/g, '\n').split('\n').map((line, index) => index ? base + line : line).join('\n');
        event.preventDefault();
        this.change(this.el.selectionStart, this.el.selectionEnd, normalized, this.el.selectionStart + normalized.length);
    }

    escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    onKeydown(event) {
        if (this.composing || event.defaultPrevented) return;
        const mod = event.ctrlKey || event.metaKey;
        const key = event.key;
        const stop = fn => { event.preventDefault(); event.stopImmediatePropagation(); fn(); };
        if (mod && key.toLowerCase() === 'z') return stop(() => event.shiftKey ? this.redo() : this.undo());
        if (mod && key.toLowerCase() === 'y') return stop(() => this.redo());
        if (mod && key.toLowerCase() === 'f') return stop(() => this.showFind(false));
        if (mod && event.shiftKey && key.toLowerCase() === 'p') return stop(() => this.showCommands());
        if (mod && key.toLowerCase() === 'h') return stop(() => this.showFind(true));
        if (mod && key.toLowerCase() === 'g') return stop(() => this.goToLine());
        if (mod && event.shiftKey && key.toLowerCase() === 'd') return stop(() => this.duplicateLine());
        if (mod && key === '/') return stop(() => this.toggleComment());
        if (this.suggestPanel?.classList.contains('show')) {
            if (key === 'ArrowDown') return stop(() => this.moveSuggestionSelection(1));
            if (key === 'ArrowUp') return stop(() => this.moveSuggestionSelection(-1));
            if (key === 'Tab' || key === 'Enter') return stop(() => this.acceptSuggestion(this.suggestions[this.suggestIndex]));
            if (key === 'Escape') return stop(() => this.hideSuggestions());
        }
        if (event.altKey && key === 'ArrowUp') return stop(() => this.moveLine(-1));
        if (event.altKey && key === 'ArrowDown') return stop(() => this.moveLine(1));
        if (event.ctrlKey && key === ' ') return stop(() => this.showSuggestions());
        if (key === 'Backspace' && !mod && this.el.selectionStart === this.el.selectionEnd) {
            const position = this.el.selectionStart;
            const left = this.el.value[position - 1];
            const right = this.el.value[position];
            const pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
            if (left && pairs[left] === right) return stop(() => this.change(position - 1, position + 1, '', position - 1));
        }
        if (key === 'Tab') return stop(() => this.indentSelection(event.shiftKey));
        if (key === 'Enter') return stop(() => {
            const start = this.el.selectionStart;
            const before = this.el.value.slice(0, start);
            const line = before.slice(before.lastIndexOf('\n') + 1);
            let padding = this.indentationForLine(line);
            const trimmed = line.trimEnd();
            if (/[{[(]\s*$/.test(trimmed) || /:\s*(?:[#].*)?$/.test(trimmed)) padding += this.indent;
            if (/^[}\])]/.test(this.el.value.slice(start).trimStart())) padding = padding.slice(0, Math.max(0, padding.length - this.indent.length));
            this.change(start, this.el.selectionEnd, '\n' + padding, start + 1 + padding.length);
        });
        const pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
        const closers = new Set(Object.values(pairs));
        if (!mod && closers.has(key) && this.el.selectionStart === this.el.selectionEnd && this.el.value[this.el.selectionStart] === key) {
            return stop(() => {
                const position = this.el.selectionStart + 1;
                this.el.selectionStart = this.el.selectionEnd = position;
                this.refreshStatus();
            });
        }
        if (!mod && pairs[key]) return stop(() => {
            const start = this.el.selectionStart;
            const end = this.el.selectionEnd;
            const selected = this.el.value.slice(start, end);
            this.change(start, end, key + selected + pairs[key], start + 1, start + 1 + selected.length);
        });
    }
}
