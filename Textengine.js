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
        this.modelVersion = 0;
        this.modelListeners = new Set();
        this.model = { value: String(textarea.value || ''), lineStarts: [0], versionId: 0 };
        this.lexicalCache = { versionId: -1, mask: null };
        this.suggestTimer = 0;
        this.rebuildLineIndex();

        this.record({ force: true });
        textarea.addEventListener('compositionstart', () => { this.composing = true; });
        textarea.addEventListener('compositionend', () => {
            this.composing = false;
            this.record({ coalesce: false });
            this.refreshStatus();
        });
        textarea.addEventListener('input', () => {
            const changed = this.syncModel();
            if (!this.composing && !this.suppressRecord) this.record({ coalesce: true });
            this.hideSuggestions();
            if (changed) this.scheduleSuggestions();
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

    /**
     * A small Monaco-like model API.  The textarea is still the browser input
     * surface, but callers can now work with a versioned document model rather
     * than reaching into the DOM for every operation.
     */
    getValue() { return this.model.value; }

    getVersionId() { return this.model.versionId; }

    getLineCount() { return this.model.lineStarts.length; }

    getLineContent(line) {
        const safeLine = Math.max(1, Math.min(this.getLineCount(), Number(line) || 1));
        const start = this.offsetAt(safeLine, 1);
        const next = safeLine < this.getLineCount() ? this.model.lineStarts[safeLine] : this.model.value.length;
        return this.model.value.slice(start, next).replace(/\r?\n$/, '');
    }

    onDidChangeModelContent(listener) {
        if (typeof listener !== 'function') return { dispose() {} };
        this.modelListeners.add(listener);
        return { dispose: () => this.modelListeners.delete(listener) };
    }

    rebuildLineIndex() {
        const value = this.model?.value ?? String(this.el?.value || '');
        const starts = [0];
        for (let index = value.indexOf('\n'); index >= 0; index = value.indexOf('\n', index + 1)) starts.push(index + 1);
        if (this.model) this.model.lineStarts = starts;
        return starts;
    }

    syncModel({ force = false, changes = null, source = 'user' } = {}) {
        const value = String(this.el.value ?? '');
        const changed = force || value !== this.model.value;
        if (!changed) return false;
        this.model.value = value;
        this.model.versionId = ++this.modelVersion;
        this.rebuildLineIndex();
        this.lexicalCache = { versionId: -1, mask: null };
        const detail = {
            changes,
            source,
            value,
            versionId: this.model.versionId,
            selections: this.getSelections(),
        };
        this.modelListeners.forEach(listener => {
            try { listener(detail); } catch (_) {}
        });
        this.el.dispatchEvent(new CustomEvent('jungle-model-change', { bubbles: true, detail }));
        return true;
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
        this.syncModel({ force: true, source: 'setDocument' });
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
        this.syncModel();
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
        this.syncModel({ force: true, source: 'undoRedo' });
        this.dispatchInput();
        this.breakUndoGroup = true;
        this.refreshStatus();
    }

    dispatchInput() {
        this.el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    /** Apply one or more non-overlapping edits as a single undoable transaction. */
    applyEdits(edits = [], { selectionStart, selectionEnd, source = 'command' } = {}) {
        this.syncModel();
        const value = this.model.value;
        const normalized = edits.map(edit => {
            const start = Math.max(0, Math.min(Number(edit.start) || 0, value.length));
            const end = Math.max(start, Math.min(Number(edit.end ?? start) || 0, value.length));
            return { start, end, text: String(edit.text ?? '') };
        }).filter(edit => edit.start <= edit.end).sort((a, b) => b.start - a.start || b.end - a.end);
        if (!normalized.length) return false;
        for (let index = 1; index < normalized.length; index++) {
            if (normalized[index - 1].start < normalized[index].end) return false;
        }
        let next = value;
        normalized.forEach(edit => { next = next.slice(0, edit.start) + edit.text + next.slice(edit.end); });
        const primary = normalized[0];
        const fallbackStart = primary.start + primary.text.length;
        const nextStart = Number.isFinite(selectionStart) ? selectionStart : fallbackStart;
        const nextEnd = Number.isFinite(selectionEnd) ? selectionEnd : nextStart;
        this.suppressRecord = true;
        this.el.value = next;
        this.el.selectionStart = Math.max(0, Math.min(nextStart, next.length));
        this.el.selectionEnd = Math.max(this.el.selectionStart, Math.min(nextEnd, next.length));
        this.suppressRecord = false;
        this.syncModel({ changes: normalized.slice().reverse(), source });
        this.dispatchInput();
        this.record({ coalesce: false });
        this.breakUndoGroup = true;
        this.refreshStatus();
        return true;
    }

    executeEdits(source, edits, options = {}) {
        return this.applyEdits(edits, { ...options, source: source || 'command' });
    }

    change(start, end, text, selectionStart = start + String(text ?? '').length, selectionEnd = selectionStart) {
        return this.applyEdits([{ start, end, text }], { selectionStart, selectionEnd, source: 'change' });
    }

    getSelections() {
        return [{ start: this.el.selectionStart || 0, end: this.el.selectionEnd || 0 }];
    }

    setSelection(start, end = start, { reveal = true } = {}) {
        const safeStart = Math.max(0, Math.min(Number(start) || 0, this.model.value.length));
        const safeEnd = Math.max(safeStart, Math.min(Number(end) || 0, this.model.value.length));
        this.el.focus();
        this.el.selectionStart = safeStart;
        this.el.selectionEnd = safeEnd;
        if (reveal) this.revealLine(this.lineNumberAt(safeStart));
        this.refreshStatus();
    }

    revealLine(line) {
        const safeLine = Math.max(1, Number(line) || 1);
        this.el.scrollTop = Math.max(0, (safeLine - 3) * 22);
    }

    lineRange() {
        const value = this.el.value;
        const start = value.lastIndexOf('\n', this.el.selectionStart - 1) + 1;
        const next = value.indexOf('\n', this.el.selectionEnd);
        const end = next < 0 ? value.length : next;
        return { start, end, text: value.slice(start, end) };
    }

    lineNumberAt(offset) {
        const safe = Math.max(0, Math.min(Number(offset) || 0, this.model.value.length));
        const starts = this.model.lineStarts;
        let low = 0;
        let high = starts.length - 1;
        while (low <= high) {
            const middle = (low + high) >> 1;
            if (starts[middle] <= safe) low = middle + 1;
            else high = middle - 1;
        }
        return Math.max(1, high + 1);
    }

    columnAt(offset) {
        const safe = Math.max(0, Math.min(Number(offset) || 0, this.model.value.length));
        const line = this.lineNumberAt(safe);
        return safe - this.model.lineStarts[line - 1] + 1;
    }

    offsetAt(line, column = 1) {
        const index = Math.max(0, Math.min(this.model.lineStarts.length - 1, (Number(line) || 1) - 1));
        const start = this.model.lineStarts[index];
        const next = index + 1 < this.model.lineStarts.length ? this.model.lineStarts[index + 1] : this.model.value.length;
        const terminatorLength = next > start && this.model.value[next - 1] === '\n' ? (this.model.value[next - 2] === '\r' ? 2 : 1) : 0;
        const lineLength = Math.max(0, next - start - terminatorLength);
        return Math.min(start + Math.max(0, Number(column) - 1), start + lineLength);
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
        const cLike = ['const', 'let', 'var', 'function', 'class', 'interface', 'type', 'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'try', 'catch', 'finally', 'import', 'export', 'async', 'await', 'new', 'this', 'true', 'false', 'null'];
        const base = { line: '// ', block: ['/*', '*/'], keywords: cLike, indentAfter: /(?:\{|\[|\(|=>|\b(?:else|try|finally|do|case|default))\s*$/ };
        if (/\.(html?|xml|svg)$/.test(file)) return { line: null, block: ['<!--', '-->'], keywords: ['doctype', 'html', 'head', 'body', 'script', 'style', 'class', 'id', 'aria', 'data'], indentAfter: /<[^/!][^>]*>\s*$/ };
        if (/\.(css|scss|less)$/.test(file)) return { line: null, block: ['/*', '*/'], keywords: ['display', 'position', 'margin', 'padding', 'color', 'background', 'grid', 'flex', 'width', 'height', 'var'], indentAfter: /\{\s*$/ };
        if (/\.(json|jsonc)$/.test(file)) return { line: null, block: ['/*', '*/'], keywords: ['true', 'false', 'null'], indentAfter: /[\{\[]\s*$/ };
        if (/\.(py|pyw)$/.test(file)) return { line: '# ', block: null, keywords: ['def', 'class', 'import', 'from', 'return', 'async', 'await', 'match', 'case', 'if', 'elif', 'else', 'for', 'while', 'try', 'except', 'finally', 'with', 'yield', 'lambda', 'True', 'False', 'None'], indentAfter: /:\s*(?:#.*)?$/ };
        if (/\.(rb)$/.test(file)) return { line: '# ', block: null, keywords: ['def', 'class', 'module', 'end', 'require', 'yield', 'if', 'unless', 'case', 'when', 'do', 'begin', 'rescue'] , indentAfter: /\b(?:do|else|begin|case|when)\s*$/ };
        if (/\.(sh|bash|zsh|fish|yml|yaml|toml|r|pl|pm|jl|nim)$/.test(file)) return { line: '# ', block: null, keywords: ['if', 'then', 'fi', 'for', 'in', 'do', 'done', 'function', 'case', 'esac', 'return'], indentAfter: /\b(?:then|do|else|case)\s*$/ };
        if (/\.(sql)$/.test(file)) return { line: '-- ', block: ['/*', '*/'], keywords: ['select', 'from', 'where', 'join', 'left', 'right', 'inner', 'group', 'order', 'having', 'limit', 'offset', 'insert', 'update', 'delete', 'create', 'alter', 'with', 'as'], indentAfter: /\b(?:select|from|where|join|group by|order by|having|with)\s*$/i };
        if (/\.(lua)$/.test(file)) return { line: '-- ', block: ['--[[', ']]'], keywords: ['function', 'local', 'require', 'return', 'if', 'then', 'elseif', 'else', 'end', 'for', 'while', 'repeat', 'until'], indentAfter: /\b(?:then|do|function|else|elseif)\s*$/ };
        if (/\.(hs|haskell)$/.test(file)) return { line: '-- ', block: ['{-', '-}'], keywords: ['module', 'import', 'where', 'let', 'in', 'case', 'of', 'data', 'type', 'newtype'], indentAfter: /\b(?:where|let|of|do)\s*$/ };
        if (/\.(erl)$/.test(file)) return { line: '% ', block: null, keywords: ['module', 'export', 'receive', 'case', 'of', 'end', 'fun', 'spawn'], indentAfter: /\b(?:case|of|receive|fun)\s*$/ };
        if (/\.(ex|exs)$/.test(file)) return { line: '# ', block: null, keywords: ['def', 'defmodule', 'use', 'alias', 'case', 'fn', 'do', 'end', 'cond', 'with'], indentAfter: /\b(?:do|else|fn|case|cond)\s*$/ };
        if (/\.(fs|f90|for|f)$/.test(file)) return { line: '! ', block: null, keywords: ['module', 'use', 'subroutine', 'function', 'end', 'do', 'if', 'then', 'else'], indentAfter: /\b(?:then|do|else)\s*$/i };
        if (/\.(lisp|clj|cljc|scm)$/.test(file)) return { line: '; ', block: null, keywords: ['defn', 'def', 'let', 'fn', 'require', 'ns', 'if', 'cond', 'case', 'loop', 'recur'] , indentAfter: /[\(]\s*$/ };
        if (/\.(rs)$/.test(file)) return { ...base, keywords: [...cLike, 'fn', 'pub', 'struct', 'enum', 'impl', 'trait', 'match', 'loop', 'move', 'mut', 'use', 'mod', 'crate', 'where'] };
        if (/\.(go)$/.test(file)) return { ...base, keywords: ['package', 'import', 'func', 'type', 'struct', 'interface', 'var', 'const', 'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'go', 'defer', 'select', 'chan'] };
        if (/\.(java|kt|kts|scala)$/.test(file)) return { ...base, keywords: [...cLike, 'public', 'private', 'protected', 'static', 'void', 'int', 'boolean', 'extends', 'implements', 'package', 'throws', 'fun', 'val', 'var', 'object'] };
        if (/\.(cs)$/.test(file)) return { ...base, keywords: [...cLike, 'namespace', 'using', 'public', 'private', 'protected', 'internal', 'static', 'void', 'string', 'int', 'bool', 'async', 'await', 'record', 'get', 'set'] };
        if (/\.(c|h|cc|cpp|cxx|hpp)$/.test(file)) return { ...base, keywords: [...cLike, 'include', 'define', 'ifdef', 'ifndef', 'endif', 'struct', 'enum', 'namespace', 'template', 'public', 'private', 'virtual', 'override', 'auto', 'nullptr'] };
        if (/\.(php)$/.test(file)) return { ...base, keywords: [...cLike, 'function', 'echo', 'namespace', 'use', 'public', 'private', 'protected', 'trait', 'extends', 'implements'] };
        if (/\.(swift)$/.test(file)) return { ...base, keywords: [...cLike, 'func', 'struct', 'enum', 'protocol', 'extension', 'guard', 'defer', 'let', 'var', 'init', 'import'] };
        return base;
    }

    indentationForLine(line) {
        return (String(line).match(/^\s*/) || [''])[0];
    }

    indentationUnitForLine(line) {
        const whitespace = this.indentationForLine(line);
        if (/\t/.test(whitespace)) return '\t';
        const width = whitespace.match(/ {2,}/)?.[0]?.length || this.indent.length;
        return ' '.repeat(Math.max(1, width));
    }

    computeIndentForEnter(start = this.el.selectionStart) {
        const value = this.model.value;
        const before = value.slice(0, start);
        const lineStart = before.lastIndexOf('\n') + 1;
        const line = before.slice(lineStart);
        const profile = this.languageProfile();
        let padding = this.indentationForLine(line);
        const codeLine = line.replace(/(?:\/\/|#|--|;|%).*$/, '').trimEnd();
        if (profile.indentAfter?.test(codeLine)) padding += this.indent;

        // Align continued calls/arrays with the first character after the
        // unmatched opener, which is much closer to Monaco's smart indent.
        const openers = [];
        const mask = this.lexicalMask();
        for (let index = lineStart - 1; index >= 0; index--) {
            if (!mask[index]) continue;
            const char = value[index];
            if ('([{'.includes(char)) openers.push(index);
            else if (')]}'.includes(char) && openers.length) openers.pop();
        }
        const opener = openers[openers.length - 1];
        if (opener >= lineStart && /[\[\(]/.test(value[opener])) {
            const openerLineStart = value.lastIndexOf('\n', opener - 1) + 1;
            const openerColumn = opener - openerLineStart;
            padding = ' '.repeat(openerColumn + 1);
        }
        const next = value.slice(start).match(/^\s*([}\])]|else\b|elif\b|catch\b|except\b|finally\b|case\b|default\b)/);
        if (next) padding = padding.slice(0, Math.max(0, padding.length - this.indent.length));
        return padding;
    }

    scheduleSuggestions() {
        clearTimeout(this.suggestTimer);
        const value = this.model.value;
        if (value.length > 250000 || this.composing || this.el.selectionStart !== this.el.selectionEnd) return;
        const before = value.slice(0, this.el.selectionStart);
        if (!/[A-Za-z_$\.]$/.test(before)) return;
        this.suggestTimer = setTimeout(() => {
            if (document.activeElement === this.el) this.showSuggestions({ automatic: true });
        }, 140);
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
        return this.completionItems().map(item => item.label);
    }

    completionItems() {
        const profile = this.languageProfile();
        const items = new Map();
        const add = (label, detail = '', kind = 'keyword', insertText = label) => {
            if (!label || items.has(label)) return;
            items.set(label, { label, insertText, detail, kind });
        };
        profile.keywords.forEach(word => add(word, 'language keyword'));
        (this.model.value.match(/[A-Za-z_$][\w$]*/g) || []).forEach(word => add(word, 'document symbol', 'symbol'));
        try {
            const project = JungleUI.getCurrentProject?.();
            Object.entries(project?.files || {}).forEach(([file, code]) => {
                const source = String(code || '');
                const symbolPattern = /\b(?:class|interface|struct|enum|function|func|fn|def|sub|async\s+def)\s+([A-Za-z_$][\w$]*)/g;
                let match;
                while ((match = symbolPattern.exec(source))) add(match[1], file, 'project symbol');
                if (file !== this.currentFile()) add(file.split('/').pop(), `file: ${file}`, 'file');
            });
        } catch (_) {}
        return [...items.values()];
    }

    showSuggestions({ automatic = false } = {}) {
        const before = this.model.value.slice(0, this.el.selectionStart);
        const match = before.match(/[A-Za-z_$][\w$]*$/);
        if (!match && automatic) return;
        const word = match?.[0] || '';
        const lower = word.toLowerCase();
        const items = this.completionItems().filter(item => item.label.length > 1 && item.label !== word && item.label.toLowerCase().startsWith(lower));
        items.sort((a, b) => (a.kind === 'symbol' ? -1 : 0) - (b.kind === 'symbol' ? -1 : 0) || a.label.localeCompare(b.label));
        const visible = items.slice(0, 16);
        if (!visible.length) { this.hideSuggestions(); return; }
        this.suggestions = visible;
        this.suggestIndex = 0;
        this.suggestPanel.innerHTML = '';
        visible.forEach((item, index) => {
            const node = document.createElement('div');
            node.className = `jungle-suggest-item${index === 0 ? ' active' : ''}`;
            node.textContent = item.label;
            if (item.detail) {
                const detail = document.createElement('small');
                detail.textContent = `  ${item.detail}`;
                detail.style.opacity = '0.6';
                node.appendChild(detail);
            }
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

    acceptSuggestion(item) {
        const suggestion = typeof item === 'string' ? { label: item, insertText: item } : item;
        if (!suggestion) return;
        const match = this.model.value.slice(0, this.el.selectionStart).match(/[A-Za-z_$][\w$]*$/);
        if (match) {
            const text = suggestion.insertText || suggestion.label;
            this.change(this.el.selectionStart - match[0].length, this.el.selectionStart, text, this.el.selectionStart - match[0].length + text.length);
        }
        this.hideSuggestions();
    }

    hideSuggestions() { this.suggestPanel?.classList.remove('show'); }

    selectNextOccurrence() {
        const start = this.el.selectionStart;
        const end = this.el.selectionEnd;
        const selected = this.model.value.slice(start, end);
        if (!selected) return this.selectWord();
        const next = this.model.value.indexOf(selected, end);
        const target = next >= 0 ? next : this.model.value.indexOf(selected);
        if (target >= 0 && target !== start) this.setSelection(target, target + selected.length);
    }

    jumpToMatchingBracket() {
        const match = this.findMatchingBracket();
        if (match >= 0) this.setSelection(match, match + 1);
    }

    normalizeDocument() {
        const value = this.model.value.replace(/\r\n?/g, '\n').replace(/[ \t]+(?=\n|$)/g, '');
        if (value !== this.model.value) this.change(0, this.model.value.length, value, Math.min(this.el.selectionStart, value.length), Math.min(this.el.selectionEnd, value.length));
    }

    addCommand(id, title, action) { this.commands.set(id, { id, title, action }); }

    registerDefaultCommands() {
        this.addCommand('find', 'Find', () => this.showFind(false));
        this.addCommand('replace', 'Find and Replace', () => this.showFind(true));
        this.addCommand('goto', 'Go to Line', () => this.goToLine());
        this.addCommand('jumpBracket', 'Go to Matching Bracket', () => this.jumpToMatchingBracket());
        this.addCommand('selectLine', 'Select Current Line', () => this.selectLine());
        this.addCommand('selectWord', 'Select Word', () => this.selectWord());
        this.addCommand('selectNext', 'Select Next Occurrence', () => this.selectNextOccurrence());
        this.addCommand('duplicate', 'Duplicate Line', () => this.duplicateLine());
        this.addCommand('moveUp', 'Move Line Up', () => this.moveLine(-1));
        this.addCommand('moveDown', 'Move Line Down', () => this.moveLine(1));
        this.addCommand('comment', 'Toggle Comment', () => this.toggleComment());
        this.addCommand('indent', 'Indent Selection', () => this.indentSelection(false));
        this.addCommand('outdent', 'Outdent Selection', () => this.indentSelection(true));
        this.addCommand('trimWhitespace', 'Trim Trailing Whitespace', () => this.trimTrailingWhitespace());
        this.addCommand('sortLines', 'Sort Selected Lines', () => this.sortSelectedLines());
        this.addCommand('joinLines', 'Join Selected Lines', () => this.joinSelectedLines());
        this.addCommand('normalize', 'Normalize Document Whitespace', () => this.normalizeDocument());
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

    lexicalMask() {
        if (this.lexicalCache.versionId === this.model.versionId && this.lexicalCache.mask) return this.lexicalCache.mask;
        const value = this.model.value;
        const mask = new Uint8Array(value.length);
        const profile = this.languageProfile();
        const lineMarker = profile.line ? profile.line.trimEnd() : '';
        const blockStart = profile.block?.[0] || '';
        const blockEnd = profile.block?.[1] || '';
        let state = 'code';
        let quote = '';
        let escaped = false;
        for (let index = 0; index < value.length; index++) {
            const char = value[index];
            if (state === 'line') {
                if (char === '\n') { state = 'code'; mask[index] = 1; }
                continue;
            }
            if (state === 'block') {
                if (blockEnd && value.startsWith(blockEnd, index)) { state = 'code'; index += blockEnd.length - 1; }
                continue;
            }
            if (state === 'string') {
                if (escaped) { escaped = false; continue; }
                if (char === '\\') { escaped = true; continue; }
                if (char === quote) { state = 'code'; quote = ''; }
                continue;
            }
            if (blockStart && value.startsWith(blockStart, index)) { state = 'block'; index += blockStart.length - 1; continue; }
            if (lineMarker && value.startsWith(lineMarker, index)) { state = 'line'; index += lineMarker.length - 1; continue; }
            if (char === '"' || char === "'" || char === '`') { state = 'string'; quote = char; escaped = false; continue; }
            mask[index] = 1;
        }
        this.lexicalCache = { versionId: this.model.versionId, mask };
        return mask;
    }

    findMatchingBracket(position = this.el.selectionStart) {
        const value = this.model.value;
        const mask = this.lexicalMask();
        const pairs = { '(': ')', '[': ']', '{': '}' };
        const opening = new Set(Object.keys(pairs));
        const closing = { ')': '(', ']': '[', '}': '{' };
        let atPosition = Math.max(0, Math.min(Number(position) || 0, value.length));
        let at = value[atPosition];
        if (!pairs[at] && !closing[at] && atPosition > 0) { atPosition--; at = value[atPosition]; }
        if (!pairs[at] && !closing[at]) return -1;
        if (!mask[atPosition]) return -1;
        if (opening.has(at)) {
            const stack = [at];
            for (let index = atPosition + 1; index < value.length; index++) {
                if (!mask[index]) continue;
                const char = value[index];
                if (opening.has(char)) stack.push(char);
                else if (closing[char] === stack[stack.length - 1]) {
                    stack.pop();
                    if (!stack.length) return index;
                }
            }
            return -1;
        }
        const stack = [at];
        for (let index = atPosition - 1; index >= 0; index--) {
            if (!mask[index]) continue;
            const char = value[index];
            if (closing[char]) stack.push(char);
            else if (pairs[char] === stack[stack.length - 1]) {
                stack.pop();
                if (!stack.length) return index;
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
        if (mod && !event.shiftKey && key.toLowerCase() === 'd') return stop(() => this.selectNextOccurrence());
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
            const before = this.el.value.slice(0, position);
            const line = before.slice(before.lastIndexOf('\n') + 1);
            const unit = this.indentationUnitForLine(line);
            if (!line.trim() && line.length >= unit.length && line.endsWith(unit)) return stop(() => this.change(position - unit.length, position, '', position - unit.length));
        }
        if (key === 'Tab') return stop(() => this.indentSelection(event.shiftKey));
        if (key === 'Enter') return stop(() => {
            const start = this.el.selectionStart;
            const padding = this.computeIndentForEnter(start);
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
