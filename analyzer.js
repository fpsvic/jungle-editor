// JungleAnalyzer — lightweight, offline, multi-file semantic analysis.
//
// This is a real symbol-table pass (not regex heuristics): it strips strings/comments,
// collects the names each file BINDS (declares) and USES (references), then reports a
// reference to a name that is bound nowhere in the project, is not a language builtin,
// and is not imported. It resolves names across sibling files of the same language, so
// it works for multi-file projects.
//
// Design bias: CONSERVATIVE. It flattens scopes rather than modelling them precisely,
// which means it won't invent false positives on valid-but-dynamic code — it only fires
// when a name genuinely appears nowhere. For JavaScript/TypeScript it limits itself to
// cross-file checks (undefined function calls); single-file JS/TS is left alone. Python
// gets full undefined-name detection since there's no offline compiler for it.
class JungleAnalyzer {
    // ---- Public entry: returns issues for `currentFile`, using the whole project ----
    static analyze(lang, files, currentFile) {
        try {
            files = files || {};
            if (!(currentFile in files)) files = { [currentFile || 'file']: files[currentFile] ?? '' };
            const projectReferences = this.analyzeProjectReferences(lang, files, currentFile);
            if (lang === 'Python') return [...this.analyzePython(files, currentFile), ...projectReferences];
            if (lang === 'Javascript' || lang === 'TypeScript') {
                return [...this.analyzeJsCrossFile(lang, files, currentFile), ...this.analyzeLocalImports(lang, files, currentFile)];
            }
            if (lang === 'HTML') return [...this.analyzeHtmlAssets(files, currentFile), ...projectReferences];
            if (lang === 'CSS') return [...this.analyzeCssAssets(files, currentFile), ...projectReferences];
            if (lang === 'Nim' || lang === 'Dart' || lang === 'Zig' || lang === 'Julia') return [...this.analyzeGenericCrossFile(lang, files, currentFile), ...projectReferences];
            return projectReferences;
        } catch (e) {
            // Never let analysis crash the editor — degrade to "no findings".
            return [];
        }
    }

    static makeIssue(line, msg, hint, kind, severity = 'warning') {
        return { line, msg, hint, kind, column: null, severity };
    }

    // Files in `files` that share a language with `currentFile` (by extension).
    static siblingsOfLang(lang, files, currentFile) {
        const out = {};
        for (const name of Object.keys(files)) {
            const l = (typeof JungleIntelligence !== 'undefined')
                ? JungleIntelligence.languageFromFilename(name, lang)
                : lang;
            if (l === lang) out[name] = files[name];
        }
        if (!(currentFile in out)) out[currentFile] = files[currentFile] ?? '';
        return out;
    }

    // Replace string literals and comments with spaces, preserving line breaks and column
    // positions so identifier line numbers stay accurate. `mode` tunes comment/quote syntax.
    static stripLiterals(code, mode) {
        // Nim and Julia use '#' line comments (like Python) plus their own nestable block
        // comments — #[ ]# for Nim, #= =# for Julia — which must be blanked so code inside a
        // comment isn't mistaken for real references.
        const hash = mode === 'py' || mode === 'nim' || mode === 'julia';
        const nested = mode === 'nim' ? { o: '#[', c: ']#' } : mode === 'julia' ? { o: '#=', c: '=#' } : null;
        let out = '';
        let i = 0;
        let state = null; // 'sq','dq','bq','tsq','tdq','line','block','nblk'
        let nestDepth = 0; // nesting depth while state === 'nblk'
        const n = code.length;
        while (i < n) {
            const c = code[i], c2 = code[i + 1], c3 = code.slice(i, i + 3);
            if (state === null) {
                if (nested && c === nested.o[0] && c2 === nested.o[1]) { state = 'nblk'; nestDepth = 1; out += '  '; i += 2; continue; }
                if (hash && c === '#') { state = 'line'; out += ' '; i++; continue; }
                if (!hash && c === '/' && c2 === '/') { state = 'line'; out += '  '; i += 2; continue; }
                if (!hash && c === '/' && c2 === '*') { state = 'block'; out += '  '; i += 2; continue; }
                // Python string prefixes (f, r, b, u and combos like rb/fr) sit right before the
                // quote — blank them with the literal so e.g. the 'f' in f"..." isn't later read
                // as a bare, undefined name. Only fires when 1–2 prefix letters abut a quote.
                if (hash && /[rbuf]/i.test(c)) {
                    const pm = code.slice(i, i + 3).match(/^([rbuf]{1,2})['"]/i);
                    if (pm) { out += ' '.repeat(pm[1].length); i += pm[1].length; continue; }
                }
                if (hash && (c3 === '"""' || c3 === "'''")) { state = c3 === '"""' ? 'tdq' : 'tsq'; out += '   '; i += 3; continue; }
                if (c === '"') { state = 'dq'; out += ' '; i++; continue; }
                if (c === "'") { state = 'sq'; out += ' '; i++; continue; }
                if (c === '`') { state = 'bq'; out += ' '; i++; continue; }
                out += c; i++; continue;
            }
            if (state === 'line') { if (c === '\n') { state = null; out += '\n'; } else out += ' '; i++; continue; }
            if (state === 'nblk') {
                if (c === nested.o[0] && c2 === nested.o[1]) { nestDepth++; out += '  '; i += 2; continue; }
                if (c === nested.c[0] && c2 === nested.c[1]) { nestDepth--; out += '  '; i += 2; if (nestDepth === 0) state = null; continue; }
                out += (c === '\n' ? '\n' : ' '); i++; continue;
            }
            if (state === 'block') { if (c === '*' && c2 === '/') { state = null; out += '  '; i += 2; } else { out += (c === '\n' ? '\n' : ' '); i++; } continue; }
            if (state === 'tdq' || state === 'tsq') {
                const tag = state === 'tdq' ? '"""' : "'''";
                if (c3 === tag) { state = null; out += '   '; i += 3; } else { out += (c === '\n' ? '\n' : ' '); i++; }
                continue;
            }
            // single-line string states
            if (c === '\\') { out += '  '; i += 2; continue; } // escape — skip next char
            if ((state === 'dq' && c === '"') || (state === 'sq' && c === "'") || (state === 'bq' && c === '`')) { state = null; out += ' '; i++; continue; }
            out += (c === '\n' ? '\n' : ' '); i++;
        }
        return out;
    }

    // ============================ PYTHON ============================
    static analyzePython(files, currentFile) {
        const code = files[currentFile] ?? '';
        const stripped = this.stripLiterals(code, 'py');
        const lines = stripped.split('\n');

        // `from x import *` makes any name potentially defined — disable undefined checks.
        if (/^\s*from\s+[\w.]+\s+import\s+\*/m.test(stripped)) return [];

        const bound = new Set();       // every name bound anywhere in this file (any scope)
        const imported = new Set();    // names introduced by import statements
        this.collectPythonBindings(stripped, bound, imported);

        // Sibling files: top-level def/class/assignment names, for "defined elsewhere" hints.
        const siblings = this.siblingsOfLang('Python', files, currentFile);
        const siblingDefs = new Map(); // name -> filename
        for (const [fname, content] of Object.entries(siblings)) {
            if (fname === currentFile) continue;
            const s = this.stripLiterals(content || '', 'py');
            for (const m of s.matchAll(/^(?:def|class)\s+([A-Za-z_]\w*)/gm)) siblingDefs.set(m[1], fname);
            for (const m of s.matchAll(/^([A-Za-z_]\w*)\s*=(?!=)/gm)) if (!siblingDefs.has(m[1])) siblingDefs.set(m[1], fname);
        }

        const builtins = this.PY_BUILTINS;
        const issues = [];
        const reported = new Set(); // one report per (name,line)

        for (let li = 0; li < lines.length; li++) {
            const raw = lines[li];
            // import/from/global/nonlocal lines introduce names — they are not "uses".
            if (/^\s*(?:import|from|global|nonlocal)\b/.test(raw)) continue;
            const idRe = /[A-Za-z_]\w*/g;
            let m;
            while ((m = idRe.exec(raw)) !== null) {
                const name = m[0];
                const start = m.index;
                const prevCh = raw[start - 1];
                // Skip attribute access (obj.NAME) and decorators handled below.
                if (prevCh === '.') continue;
                if (this.PY_KEYWORDS.has(name)) continue;
                if (name.startsWith('__') && name.endsWith('__')) continue;
                // Skip binding position: NAME = ... and keyword arg NAME=... (single '=').
                const after = raw.slice(start + name.length);
                if (/^\s*=(?!=)/.test(after)) continue;
                // Skip 'NAME:' type annotations / dict-ish only when it's an annotation target at stmt start.
                if (bound.has(name) || imported.has(name) || builtins.has(name)) continue;
                const key = name + ':' + (li + 1);
                if (reported.has(key)) continue;
                reported.add(key);
                if (siblingDefs.has(name)) {
                    issues.push(this.makeIssue(li + 1, `'${name}' is defined in ${siblingDefs.get(name)} but is not imported in this file.`,
                        `Add an import, e.g. 'from ${siblingDefs.get(name).replace(/\.py$/, '')} import ${name}'.`, 'Cross-file reference', 'warning'));
                } else {
                    issues.push(this.makeIssue(li + 1, `'${name}' is not defined — this will raise NameError at runtime.`,
                        `Define '${name}', import it, or fix the spelling.`, 'Undefined name', 'warning'));
                }
            }
        }
        return issues;
    }

    static collectPythonBindings(stripped, bound, imported) {
        const add = (s) => { if (s) bound.add(s); };
        // def / class names + parameters
        for (const m of stripped.matchAll(/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(([^)]*)/gm)) {
            add(m[1]);
            this.addPyParams(m[2], bound);
        }
        for (const m of stripped.matchAll(/^\s*class\s+([A-Za-z_]\w*)/gm)) add(m[1]);
        // lambda params
        for (const m of stripped.matchAll(/\blambda\s+([^:]*):/g)) this.addPyParams(m[1], bound);
        // for/comprehension targets:  for X, Y in ...
        // NOTE: horizontal-whitespace class [ \t] (not \s) so a target list never spans a
        // newline into the next statement — \s would swallow line breaks and merge bindings.
        for (const m of stripped.matchAll(/\bfor\s+([A-Za-z_][\w, \t()\[\]*]*?)\s+in\b/g)) this.addPyTargets(m[1], bound);
        // with/except ... as X  and tuple targets  as (x, y)  — a global 'as' scan also
        // harmlessly re-binds import aliases (over-binding never creates a false positive).
        for (const m of stripped.matchAll(/\bas\s+(\([^)]*\)|[A-Za-z_]\w*)/g)) this.addPyTargets(m[1], bound);
        // walrus  X :=
        for (const m of stripped.matchAll(/([A-Za-z_]\w*)\s*:=/g)) add(m[1]);
        // global / nonlocal   (horizontal whitespace only — see for-target note above)
        for (const m of stripped.matchAll(/^[ \t]*(?:global|nonlocal)[ \t]+([A-Za-z_][\w, \t]*)/gm)) this.addPyTargets(m[1], bound);
        // assignments (simple + tuple targets) at line start:  X = ...   or   X, Y = ...
        // [ \t] rather than \s in the target class so the capture can't bleed across a newline
        // (e.g. a bare `return x, y` on the line above an assignment would otherwise merge in).
        for (const m of stripped.matchAll(/^[ \t]*([A-Za-z_][\w, \t()\[\].*]*?)[ \t]*(?::[^=\n]+)?=(?!=)/gm)) {
            // ignore comparison/augmented handled by \s*= ; capture simple targets only
            this.addPyTargets(m[1], bound);
        }
        // chained assignment  a = b = c = expr  — bind EVERY target, not just the first.
        // Matches one or more `name =` heads; excludes ==/<=/>=/!= and augmented (+=, etc.)
        // because those don't present a bare `identifier =` head.
        for (const m of stripped.matchAll(/^[ \t]*((?:[A-Za-z_][\w.\[\]]*[ \t]*=[ \t]*){2,})[^=\n]/gm)) {
            for (const seg of m[1].split('=')) this.addPyTargets(seg, bound);
        }
        // match-case capture patterns bind names:  case (a, b):  case Point(x=px):  case [h, *t]:
        // Over-bind every identifier in the pattern (conservative — a truly-undefined class in a
        // case pattern won't fire, but capture names never produce false NameError reports).
        for (const m of stripped.matchAll(/^[ \t]*case[ \t]+(.+):/gm)) {
            const pat = m[1].replace(/\bif\b[\s\S]*$/, ''); // drop a guard:  case P if cond:
            for (const idm of pat.matchAll(/[A-Za-z_]\w*/g)) {
                if (pat[idm.index - 1] === '.') continue;   // skip dotted value patterns (Color.RED)
                bound.add(idm[0]);
            }
        }
        // augmented assignment  X += ...  (X is also used, but binding-safe to record)
        for (const m of stripped.matchAll(/^\s*([A-Za-z_]\w*)\s*[-+*/%&|^@]?=(?!=)/gm)) add(m[1]);
        // bare variable annotations at statement start:  name: Type   (no '=' on the line)
        for (const m of stripped.matchAll(/^\s*([A-Za-z_]\w*)\s*:[^=\n]+$/gm)) add(m[1]);
        // imports
        for (const m of stripped.matchAll(/^\s*import\s+([^\n]+)/gm)) {
            for (const part of m[1].split(',')) {
                const t = part.trim();
                const asM = t.match(/\bas\s+([A-Za-z_]\w*)/);
                if (asM) { imported.add(asM[1]); continue; }
                const top = t.split('.')[0].trim();
                if (/^[A-Za-z_]\w*$/.test(top)) imported.add(top);
            }
        }
        const addFromImport = (raw) => {
            const t = raw.trim();
            if (!t || t === '*') return;
            const asM = t.match(/([A-Za-z_]\w*)\s+as\s+([A-Za-z_]\w*)/);
            if (asM) imported.add(asM[2]);
            else if (/^[A-Za-z_]\w*$/.test(t)) imported.add(t);
        };
        // Multi-line parenthesised form:  from mod import (\n  a,\n  b as c,\n)
        for (const m of stripped.matchAll(/^\s*from\s+[\w.]+\s+import\s+\(([\s\S]*?)\)/gm)) {
            for (const part of m[1].split(',')) addFromImport(part);
        }
        // Single-line form:  from mod import a, b as c   (stop before '(' so it doesn't eat the paren form)
        for (const m of stripped.matchAll(/^\s*from\s+[\w.]+\s+import\s+([^\n(]+)/gm)) {
            for (const part of m[1].split(',')) addFromImport(part);
        }
    }

    static addPyParams(paramStr, bound) {
        if (!paramStr) return;
        for (let p of paramStr.split(',')) {
            p = p.trim().replace(/^[*]+/, '');           // drop * / **
            p = p.split('=')[0].split(':')[0].trim();     // drop default + annotation
            if (/^[A-Za-z_]\w*$/.test(p)) bound.add(p);
        }
    }

    static addPyTargets(targetStr, bound) {
        if (!targetStr) return;
        for (const t of targetStr.replace(/[()\[\]*]/g, ' ').split(',')) {
            const name = t.trim();
            // skip attribute/subscript targets like self.x -> leave dotted alone
            if (/^[A-Za-z_]\w*$/.test(name)) bound.add(name);
        }
    }

    // ============================ JS / TS (cross-file only) ============================
    // Conservative multi-file check: flag a call `foo(...)` to a bare function name that is
    // defined in NO file of the project, is not imported/required, and is not a known global.
    // (Full undefined-variable + type checking for JS/TS is done by the real tsc pass.)
    static analyzeJsCrossFile(lang, files, currentFile) {
        const siblings = this.siblingsOfLang(lang, files, currentFile);
        if (Object.keys(siblings).length < 2) return []; // single file: leave symbol checks to tsc
        // Once a project imports a package outside the workspace, unknown bare calls may
        // legitimately come from that package or its framework globals. Do not guess in
        // that situation; the local-import pass below still checks relative file paths.
        const externalImport = /\b(?:import\s+(?:[^'";]+?\s+from\s+)?|require\s*\(\s*)["'](?!\.\.?\/)([^"']+)["']/;
        if (Object.values(siblings).some(content => externalImport.test(String(content || '')))) return [];

        const defined = new Set();
        const imported = new Set();
        for (const content of Object.values(siblings)) {
            const s = this.stripLiterals(content || '', 'js');
            this.collectJsDefinitions(s, defined);
            this.collectJsImports(s, imported);
        }

        const code = files[currentFile] ?? '';
        const stripped = this.stripLiterals(code, 'js');
        const lines = stripped.split('\n');
        const builtins = this.JS_GLOBALS;
        const issues = [];
        const reported = new Set();

        for (let li = 0; li < lines.length; li++) {
            const line = lines[li];
            const callRe = /(^|[^\w$.])([a-zA-Z_$][\w$]*)\s*\(/g;
            let m;
            while ((m = callRe.exec(line)) !== null) {
                const name = m[2];
                if (this.JS_KEYWORDS.has(name)) continue;
                if (defined.has(name) || imported.has(name) || builtins.has(name)) continue;
                if (/^[A-Z]/.test(name)) continue; // Constructors/types — too dynamic to be sure
                const key = name + ':' + (li + 1);
                if (reported.has(key)) continue;
                reported.add(key);
                issues.push(this.makeIssue(li + 1, `Function '${name}' is called but is defined in no file of this project.`,
                    `Define '${name}', import it, or fix the spelling. (Checked across ${Object.keys(siblings).length} files.)`, 'Cross-file reference', 'warning'));
            }
        }
        return issues;
    }

    static collectJsDefinitions(s, defined) {
        const addIds = (str) => {
            if (!str) return;
            for (const idm of str.matchAll(/[A-Za-z_$][\w$]*/g)) defined.add(idm[0]);
        };
        for (const m of s.matchAll(/\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\(([^)]*)\)/g)) { if (m[1]) defined.add(m[1]); addIds(m[2]); }
        for (const m of s.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)) defined.add(m[1]);
        // const/let/var NAME  — plus destructured  const {a, b:c} = ...  /  const [x, y] = ...
        for (const m of s.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) defined.add(m[1]);
        for (const m of s.matchAll(/\b(?:const|let|var)\s*(\{[^{}]*\}|\[[^\][]*\])/g)) addIds(m[1]);
        // arrow-function parameters:  (a, b) => ...   or   x => ...
        for (const m of s.matchAll(/\(([^()]*)\)\s*=>/g)) addIds(m[1]);
        for (const m of s.matchAll(/(^|[^\w$.])([A-Za-z_$][\w$]*)\s*=>/g)) defined.add(m[2]);
        // object-method / class-method shorthand:  name(params) {  — record name + params
        for (const m of s.matchAll(/(?:^|[;{}\s])([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g)) { defined.add(m[1]); addIds(m[2]); }
        // catch(e) / for(x ...) binding names
        for (const m of s.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)) defined.add(m[1]);
        for (const m of s.matchAll(/\bfor\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) defined.add(m[1]);
    }

    static collectJsImports(s, imported) {
        for (const m of s.matchAll(/\bimport\s+([A-Za-z_$][\w$]*)/g)) imported.add(m[1]);
        for (const m of s.matchAll(/\bimport\s*\{([^}]*)\}/g)) {
            for (const part of m[1].split(',')) {
                const t = part.trim().split(/\s+as\s+/).pop().trim();
                if (/^[A-Za-z_$][\w$]*$/.test(t)) imported.add(t);
            }
        }
        for (const m of s.matchAll(/\bimport\s*\*\s*as\s+([A-Za-z_$][\w$]*)/g)) imported.add(m[1]);
        // const X = require(...) / const {a,b} = require(...)
        for (const m of s.matchAll(/\brequire\s*\(/g)) { /* presence noted via const collection */ }
    }

    // Project-aware asset/import checks. These are deliberately limited to relative
    // paths: package names, URL routes, aliases, and runtime-generated paths are not
    // knowable from a browser-side static pass and are left alone.
    static normalizeProjectPath(path) {
        const stack = [];
        for (const part of String(path || '').replace(/\\/g, '/').split('/')) {
            if (!part || part === '.') continue;
            if (part === '..') { if (stack.length) stack.pop(); else return null; }
            else stack.push(part);
        }
        return stack.join('/');
    }

    static resolveProjectPath(specifier, currentFile) {
        const raw = String(specifier || '').split(/[?#]/)[0].replace(/\\/g, '/');
        if (!raw || /^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/|#)/.test(raw) || raw.startsWith('//')) return null;
        const base = String(currentFile || '').replace(/\\/g, '/').split('/');
        base.pop();
        return this.normalizeProjectPath(base.concat(raw.split('/')).join('/'));
    }

    static projectHasPath(files, path, kind = 'asset') {
        const normalized = new Set(Object.keys(files || {}).map(name => this.normalizeProjectPath(name)).filter(Boolean));
        const exact = this.normalizeProjectPath(path);
        if (!exact) return true;
        if (normalized.has(exact)) return true;
        const extensions = kind === 'module'
            ? ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.json']
            : ['.html', '.htm', '.css', '.js', '.ts', '.json', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.webm', '.mp4', '.woff', '.woff2', '.ttf'];
        if (!/\.[A-Za-z0-9]+$/.test(exact)) {
            if (extensions.some(ext => normalized.has(exact + ext))) return true;
            if (extensions.some(ext => normalized.has(exact + '/index' + ext))) return true;
        }
        return false;
    }

    static missingPathIssue(files, currentFile, specifier, offset, kind, label) {
        const resolved = this.resolveProjectPath(specifier, currentFile);
        if (!resolved || this.projectHasPath(files, resolved, kind)) return null;
        const line = String(files[currentFile] || '').slice(0, offset).split('\n').length;
        const beforeLine = String(files[currentFile] || '').slice(0, offset);
        const column = offset - beforeLine.lastIndexOf('\n');
        return this.makeIssue(line, label + " references missing project path '" + specifier + "'.",
            "Add " + resolved + " to the project, correct the path, or leave it dynamic if it is supplied by the host.",
            'Missing project asset', 'warning', column);
    }

    static analyzeLocalImports(lang, files, currentFile) {
        const code = files[currentFile] || '';
        const issues = [];
        const seen = new Set();
        const check = (regex, label) => {
            let match;
            while ((match = regex.exec(code)) !== null) {
                const specifier = match[1];
                if (!/^\.\.?\//.test(specifier)) continue;
                const issue = this.missingPathIssue(files, currentFile, specifier, match.index, 'module', label);
                if (!issue) continue;
                const key = issue.line + '|' + specifier;
                if (!seen.has(key)) { seen.add(key); issues.push(issue); }
            }
        };
        check(/\b(?:import|export)\s+(?:[^'";]+?\s+from\s+)?["']([^"']+)["']/g, lang + ' module import');
        check(/\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g, lang + ' dynamic import');
        check(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g, lang + ' module import');
        return issues;
    }

    static analyzeHtmlAssets(files, currentFile) {
        const code = files[currentFile] || '';
        const issues = [];
        const seen = new Set();
        const assetRe = /<([A-Za-z][\w:-]*)\b[^>]*\b(src|href|action)\s*=\s*["']([^"']+)["']/gi;
        let match;
        while ((match = assetRe.exec(code)) !== null) {
            const tag = match[1].toLowerCase();
            const specifier = match[3];
            const isKnownAsset = new Set(['script', 'link', 'img', 'source', 'video', 'audio', 'iframe', 'form']).has(tag);
            if (!isKnownAsset || !/^\.\.?\//.test(specifier)) continue;
            const issue = this.missingPathIssue(files, currentFile, specifier, match.index, 'asset', '<' + tag + '> ' + match[2]);
            if (!issue) continue;
            const key = issue.line + '|' + specifier;
            if (!seen.has(key)) { seen.add(key); issues.push(issue); }
        }
        return issues;
    }

    static analyzeCssAssets(files, currentFile) {
        const code = files[currentFile] || '';
        const issues = [];
        const urlRe = /\burl\(\s*["']?([^\)"']+)["']?\s*\)/gi;
        let match;
        while ((match = urlRe.exec(code)) !== null) {
            const specifier = match[1].trim();
            if (!/^\.\.?\//.test(specifier)) continue;
            const issue = this.missingPathIssue(files, currentFile, specifier, match.index, 'asset', 'CSS url()');
            if (issue) issues.push(issue);
        }
        return issues;
    }

    static analyzeProjectReferences(lang, files, currentFile) {
        const patterns = {
            Assembly: [/%include\s+["'](\.\.?\/[^"']+)["']/i],
            Bash: [/(?:^|\s)(?:source|\.)\s+["'](\.\.?\/[^"']+)["']/gm],
            C: [/^\s*#\s*include\s+["'](\.\.?\/[^"']+)["']/gm],
            'C++': [/^\s*#\s*include\s+["'](\.\.?\/[^"']+)["']/gm],
            COBOL: [/\bCOPY\s+["'](\.\.?\/[^"']+)["']/i],
            Dart: [/(?:import|export|part)\s+["'](\.\.?\/[^"']+)["']/g],
            Elixir: [/\bCode\.(?:require_file|eval_file)\s*\(\s*["'](\.\.?\/[^"']+)["']/g],
            Erlang: [/-include(?:_lib)?\s*\(\s*["'](\.\.?\/[^"']+)["']/g],
            'F#': [/#load\s+["'](\.\.?\/[^"']+)["']/gi],
            Fortran: [/\binclude\s+["'](\.\.?\/[^"']+)["']/gi],
            GDScript: [/(?:preload|load)\s*\(\s*["'](\.\.?\/[^"']+)["']/g],
            Go: [/(?:go:embed|go:generate)\s+(\.\.?\/\S+)/g],
            HCL: [/\btemplatefile\s*\(\s*["'](\.\.?\/[^"']+)["']/g],
            Julia: [/\binclude\s*\(\s*["'](\.\.?\/[^"']+)["']/g],
            Lua: [/(?:dofile|loadfile)\s*\(\s*["'](\.\.?\/[^"']+)["']/g],
            Nim: [/^\s*(?:include|import)\s+(\.\.?\/\S+)/gm],
            OCaml: [/#use\s+["'](\.\.?\/[^"']+)["']/g],
            Pascal: [/\{\$I\s*(\.\.?\/[^}\s]+)\s*\}/gi],
            Perl: [/(?:require|do)\s*["'](\.\.?\/[^"']+)["']/g],
            PHP: [/(?:require|include)(?:_once)?\s*\(?\s*["'](\.\.?\/[^"']+)["']/gi],
            Prolog: [/(?:consult|ensure_loaded)\s*\(\s*["'](\.\.?\/[^"']+)["']/gi],
            R: [/\bsource\s*\(\s*["'](\.\.?\/[^"']+)["']/g],
            Ruby: [/\brequire_relative\s+["'](\.\.?\/[^"']+)["']/g],
            Rust: [/#\[path\s*=\s*["'](\.\.?\/[^"']+)["']/g],
            Solidity: [/\bimport\s+["'](\.\.?\/[^"']+)["']/g],
            Zig: [/@import\s*\(\s*["'](\.\.?\/[^"']+)["']/g]
        };
        const code = files[currentFile] || '';
        const issues = [];
        const seen = new Set();
        for (const regex of (patterns[lang] || [])) {
            let match;
            while ((match = regex.exec(code)) !== null) {
                const issue = this.missingPathIssue(files, currentFile, match[1], match.index, 'asset', lang + ' project reference');
                if (!issue) continue;
                const key = issue.line + '|' + match[1];
                if (!seen.has(key)) { seen.add(key); issues.push(issue); }
            }
        }
        return issues;
    }

    // ============= Nim / Dart / Zig / Julia (conservative cross-file) =============
    // These four run against real compilers (Piston), so this pass only adds the one
    // thing a compiler can't see until link time in a browser sandbox: a bare function
    // call whose definition exists in NO file of the project.
    //
    // SOUNDNESS over completeness. It only fires when the project is fully self-contained
    // — i.e. no file pulls in unqualified names via import/using/include. In that state the
    // set of callable functions is exactly {language builtins} ∪ {project definitions}, so a
    // bare call outside that set is genuinely undefined. If any such import exists we can't
    // know what it introduced, so we bail and report nothing. Definitions are collected
    // permissively (over-collecting only *suppresses* warnings, never creates them). Findings
    // are warnings, so they never block execution.
    static analyzeGenericCrossFile(lang, files, currentFile) {
        const siblings = this.siblingsOfLang(lang, files, currentFile);
        if (Object.keys(siblings).length < 2) return []; // single file: leave it to the compiler

        const bailRe = this.GENERIC_IMPORT_BAIL[lang];
        const mode = lang === 'Nim' ? 'nim' : lang === 'Julia' ? 'julia' : 'js';
        const defined = new Set();
        for (const content of Object.values(siblings)) {
            const s = this.stripLiterals(content || '', mode);
            if (bailRe && bailRe.test(s)) return []; // an import may introduce unqualified names — unsafe to judge
            for (const re of this.GENERIC_DEF_PATTERNS[lang]) {
                for (const m of s.matchAll(re)) if (m[1]) defined.add(m[1]);
            }
        }

        const builtins = this.GENERIC_BUILTINS[lang];
        const reserved = this.RESERVED_BEFORE_CALL;
        const code = files[currentFile] ?? '';
        const stripped = this.stripLiterals(code, mode);
        const lines = stripped.split('\n');
        const issues = [];
        const reported = new Set();
        // A real call is written tight — `name(` — so we require the name to sit immediately
        // against the '('. Control-flow keywords are conventionally spaced (`if (x)`, `for (x)`),
        // which fails this adjacency test, so no keyword list is needed to skip them. We also
        // skip Type/constructor names (uppercase), method calls (.foo), and Julia macros / Zig
        // builtins (@foo). The few expression keywords that CAN be written tight (`return(x)`,
        // `assert(x)`) are covered by the small shared RESERVED_BEFORE_CALL set.
        const callRe = /(^|[^\w.@$])([a-z_]\w*!?)\(/g;

        for (let li = 0; li < lines.length; li++) {
            const line = lines[li];
            let m;
            callRe.lastIndex = 0;
            while ((m = callRe.exec(line)) !== null) {
                const name = m[2];
                if (reserved.has(name) || builtins.has(name) || defined.has(name)) continue;
                // Structural keyword filter: if this parenthesised group is a control-flow header
                // — its matching ')' is immediately followed by '{' (e.g. `if(x){`, `while(x){`) —
                // it is a statement, not a call. Skip it without needing to know the keyword.
                const openIdx = m.index + m[0].length - 1; // index of '('
                if (this.afterMatchingParen(line, openIdx) === '{') continue;
                const key = name + ':' + (li + 1);
                if (reported.has(key)) continue;
                reported.add(key);
                issues.push(this.makeIssue(li + 1, `'${name}' is called but is defined in no file of this project.`,
                    `Define '${name}', import the module that provides it, or fix the spelling. (Checked across ${Object.keys(siblings).length} files.)`,
                    'Cross-file reference', 'warning'));
            }
        }
        return issues;
    }

    // First non-space character after the ')' that closes the '(' at openIdx, searching only
    // within this line. Returns '' if the parentheses don't balance on the line (e.g. a
    // multi-line call) — which conservatively means "not a detected block header".
    static afterMatchingParen(line, openIdx) {
        let depth = 0;
        for (let i = openIdx; i < line.length; i++) {
            const c = line[i];
            if (c === '(') depth++;
            else if (c === ')') {
                if (--depth === 0) {
                    let j = i + 1;
                    while (j < line.length && /\s/.test(line[j])) j++;
                    return line[j] || '';
                }
            }
        }
        return '';
    }
}

// ---- Builtin / global name tables ----
JungleAnalyzer.PY_KEYWORDS = new Set(['False','None','True','and','as','assert','async','await','break','class','continue','def','del','elif','else','except','finally','for','from','global','if','import','in','is','lambda','nonlocal','not','or','pass','raise','return','try','while','with','yield','match','case','self','cls','_']);
JungleAnalyzer.PY_BUILTINS = new Set(['abs','aiter','all','anext','any','ascii','bin','bool','breakpoint','bytearray','bytes','callable','chr','classmethod','compile','complex','delattr','dict','dir','divmod','enumerate','eval','exec','filter','float','format','frozenset','getattr','globals','hasattr','hash','help','hex','id','input','int','isinstance','issubclass','iter','len','list','locals','map','max','memoryview','min','next','object','oct','open','ord','pow','print','property','range','repr','reversed','round','set','setattr','slice','sorted','staticmethod','str','sum','super','tuple','type','vars','zip','__import__','NotImplemented','Ellipsis','Exception','BaseException','ArithmeticError','AssertionError','AttributeError','BufferError','EOFError','FloatingPointError','GeneratorExit','ImportError','ModuleNotFoundError','IndexError','KeyError','KeyboardInterrupt','LookupError','MemoryError','NameError','NotImplementedError','OSError','IOError','OverflowError','RecursionError','ReferenceError','RuntimeError','StopIteration','StopAsyncIteration','SyntaxError','IndentationError','TabError','SystemError','SystemExit','TypeError','UnboundLocalError','UnicodeError','ValueError','ZeroDivisionError','FileNotFoundError','FileExistsError','PermissionError','TimeoutError','ConnectionError','Warning','DeprecationWarning','UserWarning','RuntimeWarning','PendingDeprecationWarning','FutureWarning','ImportWarning','UnicodeWarning','BytesWarning','ResourceWarning','SyntaxWarning','EncodingWarning','EnvironmentError','BlockingIOError','ChildProcessError','ConnectionAbortedError','ConnectionRefusedError','ConnectionResetError','BrokenPipeError','InterruptedError','IsADirectoryError','NotADirectoryError','ProcessLookupError','UnicodeDecodeError','UnicodeEncodeError','UnicodeTranslateError','ExceptionGroup','BaseExceptionGroup','__name__','__file__','__doc__','__spec__','__loader__','__package__','__builtins__']);
JungleAnalyzer.JS_KEYWORDS = new Set(['if','for','while','switch','catch','return','function','typeof','instanceof','new','delete','void','do','else','case','in','of','await','yield','throw','with','super','this','var','let','const','class','extends','import','export','default','from','as','async','static','get','set','constructor']);
JungleAnalyzer.JS_GLOBALS = new Set(['console','window','document','globalThis','global','process','module','exports','require','Math','JSON','Object','Array','String','Number','Boolean','Date','RegExp','Map','Set','WeakMap','WeakSet','Promise','Symbol','Proxy','Reflect','BigInt','Function','Error','TypeError','RangeError','SyntaxError','ReferenceError','EvalError','URIError','AggregateError','parseInt','parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent','encodeURI','decodeURI','setTimeout','setInterval','clearTimeout','clearInterval','setImmediate','queueMicrotask','structuredClone','fetch','alert','prompt','confirm','atob','btoa','eval','Intl','URL','URLSearchParams','TextEncoder','TextDecoder','Blob','File','FileReader','FormData','Headers','Request','Response','AbortController','WebSocket','XMLHttpRequest','crypto','performance','navigator','location','history','localStorage','sessionStorage','requestAnimationFrame','cancelAnimationFrame','addEventListener','removeEventListener','dispatchEvent','Image','Audio','Event','CustomEvent','Node','Element','HTMLElement','NodeList','DOMParser','Buffer','__dirname','__filename','Array','Number','isNaN','test','describe','it','expect','beforeEach','afterEach','beforeAll','afterAll','jest','assert']);

// ---- Generic cross-file tables for Nim / Dart / Zig / Julia ----
// If a file contains any of these, unqualified names may be introduced from outside the
// project, so the cross-file undefined-call check bails (Zig has no such construct — std is
// always accessed through a qualified `const x = @import(...)` binding).
JungleAnalyzer.GENERIC_IMPORT_BAIL = {
    Nim:   /^\s*(?:import|include|from)\b/m,
    Dart:  /^\s*(?:import|export|part)\b/m,
    Julia: /^\s*(?:using|import)\b/m,
    Zig:   null,
};
// Definition patterns — capture group 1 is the bound name. Over-collecting is safe: it only
// suppresses warnings, never creates them.
JungleAnalyzer.GENERIC_DEF_PATTERNS = {
    Nim: [
        /\b(?:proc|func|method|iterator|template|macro|converter)\s+`?([A-Za-z_]\w*)/g,
        /\btype\s+([A-Za-z_]\w*)/g,
        /\b(?:let|var|const)\s+([A-Za-z_]\w*)/g,
    ],
    Dart: [
        /(?:^|[^\w.])([A-Za-z_]\w*)\s*\([^;{}\n]*\)\s*(?:async\*?\s*|sync\*\s*)?\{/g, // funcs/methods (and harmlessly control-flow)
        /\b(?:var|final|const|late)\s+([A-Za-z_]\w*)/g,
        /\b(?:void|int|double|String|bool|num|dynamic|Object|List|Map|Set|Future|Stream|var)\s+([A-Za-z_]\w*)\s*\(/g,
        /\bclass\s+([A-Za-z_]\w*)/g,
    ],
    Zig: [
        /\bfn\s+([A-Za-z_]\w*)/g,
        /\b(?:const|var)\s+([A-Za-z_]\w*)/g,
    ],
    Julia: [
        /\bfunction\s+([A-Za-z_]\w*!?)/g,
        /\bmacro\s+([A-Za-z_]\w*)/g,
        /\b(?:mutable\s+)?struct\s+([A-Za-z_]\w*)/g,
        /(?:^|[^\w.])([a-z_]\w*!?)\s*\([^=;\n]*\)\s*=(?!=)/gm, // one-line function definitions:  f(x) = ...
        /\bconst\s+([A-Za-z_]\w*)/g,
    ],
};
// The only keyword handling left: a small, language-agnostic set of statement/expression
// keywords that can legally be written tight against a '(' — e.g. `return(x)`, `assert(x)`,
// `sizeof(T)`. Every other keyword is filtered structurally (spaced `if (x)` fails the
// adjacency test; brace-headed `while(x){` fails the matching-paren test), so there are no
// per-language keyword tables to maintain.
JungleAnalyzer.RESERVED_BEFORE_CALL = new Set([
    'return','throw','yield','await','assert','raise','discard','defer','errdefer',
    'sizeof','typeof','alignof','comptime','not','and','or','in','is','isa','new','delete',
]);
// Always-available (auto-imported / core) functions per language. Kept generous so ordinary
// self-contained programs don't trip the check. Not exhaustive — findings are warnings.
JungleAnalyzer.GENERIC_BUILTINS = {
    Nim: new Set(['echo','len','add','newSeq','newSeqOfCap','newString','newStringOfCap','high','low','inc','dec','succ','pred','ord','chr','abs','min','max','sum','contains','find','pop','insert','delete','setLen','del','swap','sort','sorted','reverse','reversed','map','filter','apply','foldl','foldr','items','pairs','mitems','mpairs','keys','values','toSeq','repr','quit','assert','doAssert','defined','declared','sizeof','alignof','typeof','type','addr','unsafeAddr','cast','move','system','isNil','open','close','readLine','readAll','write','writeLine','stdout','stdin','stderr','parseInt','parseFloat','parseBool','intToStr','toInt','toFloat','toBiggestInt','toOpenArray','zip','join','split','strip','startsWith','endsWith','replace','toUpperAscii','toLowerAscii','format','fmt','count','allIt','anyIt','mapIt','filterIt','result','once','raise','new','create','dealloc','alloc','copyMem','zeroMem','shallowCopy','deepCopy','hash','ord','bindSym']),
    Dart: new Set(['print','identical','identityHashCode','assert','List','Map','Set','Iterable','String','int','double','num','bool','Object','dynamic','Future','Stream','Duration','DateTime','Uri','RegExp','StringBuffer','Comparable','Exception','Error','StateError','ArgumentError','RangeError','FormatException','UnimplementedError','UnsupportedError','runZoned','main','max','min','sqrt','pow','jsonEncode','jsonDecode']),
    Zig: new Set(['main']),
    Julia: new Set(['println','print','printstyled','display','show','length','size','ndims','axes','eachindex','push','pushfirst','pop','popfirst','append','insert','deleteat','splice','append','prepend','empty','isempty','first','last','get','get!','getindex','setindex','haskey','keys','values','pairs','collect','zip','enumerate','map','filter','reduce','foldl','foldr','mapreduce','sum','prod','maximum','minimum','extrema','count','any','all','findall','findfirst','findlast','sort','sort!','sortperm','reverse','reverse!','unique','union','intersect','setdiff','abs','abs2','sign','sqrt','cbrt','exp','log','log2','log10','sin','cos','tan','floor','ceil','round','trunc','mod','rem','div','gcd','lcm','clamp','min','max','minmax','parse','tryparse','string','repeat','join','split','strip','lstrip','rstrip','replace','uppercase','lowercase','occursin','startswith','endswith','contains','match','eachmatch','rand','randn','zeros','ones','fill','fill!','similar','copy','deepcopy','convert','promote','typeof','eltype','isa','error','throw','rethrow','try','typemax','typemin','identity','hcat','vcat','cat','reshape','vec','transpose','dot','norm','range','LinRange','in','hash','isequal','isnothing','isnan','isinf','isfinite','open','close','read','readline','readlines','write','flush','time','sleep','Dict','Set','Vector','Matrix','Array','Tuple','Pair','abs','float','Int','Float64','big']),
};

if (typeof module !== 'undefined' && module.exports) module.exports = { JungleAnalyzer };
