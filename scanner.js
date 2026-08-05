class JungleScanner {
    static normalizeLanguage(lang) {
        const aliases = { JavaScript: 'Javascript', JS: 'Javascript', TypeScript: 'TypeScript', TS: 'TypeScript' };
        return aliases[String(lang || '')] || lang;
    }
    static scan(lang, code) {
        lang = this.normalizeLanguage(lang);
        const lines = code.split('\n');
        const issues = [
            ...this.scanDelimiters(lines, lang),
            ...this.scanLanguagePatterns(lang, lines),
            ...this.scanUniversal(lang, lines)
        ];
        if (lang === 'Javascript' || lang === 'TypeScript') issues.push(...this.scanJavaScriptTypeScript(lines, lang));
        if (lang === 'HTML') issues.push(...this.scanHtmlTags(lines), ...this.scanHtmlPatterns(lines), ...this.scanHtmlAdvanced(lines), ...this.scanHtmlEmbeddedCode(lines));
        if (lang === 'SQL') issues.push(...this.scanSql(lines));
        if (lang === 'Python') issues.push(...this.scanPythonIndentation(lines));
        if (lang === 'CSS') issues.push(...this.scanCssPatterns(lines), ...this.scanCssAdvanced(lines));
        // Universal cross-language checks
        issues.push(...this.scanUniversalAdvanced(lang, lines));
        issues.push(...this.scanLanguageGuardrails(lang, lines));
        return this.finalizeIssues(issues, lang, lines.length);
    }
    // Async chunked scan — processes 200 lines at a time, yielding between chunks
    // Falls back to sync scan() for files under 500 lines
    static scanAsyncLegacy(lang, code) {
        lang = this.normalizeLanguage(lang);
        // Tree-sitter provides authoritative syntax structure. The legacy rules
        // remain a no-network fallback and continue to supply style/security hints.
        if (typeof JungleAstScanner !== 'undefined' && JungleAstScanner.names[lang]) {
            // Keep parser diagnostics *and* the carefully masked heuristic checks.  The
            // AST used to replace the rule scan here, which silently hid security and
            // project-quality findings whenever Tree-sitter was available.
            return Promise.all([
                JungleAstScanner.scan(lang, code).catch(() => [{ line: 1, column: 1, severity: 'info', kind: 'Scanner integration', msg: 'AST scanner unavailable; heuristic checks were used instead.', hint: 'Reconnect or allow the bundled grammar resources if structural diagnostics are needed.' }]),
                Promise.resolve(this.scan(lang, code))
            ]).then(([astIssues, ruleIssues]) => this.finalizeIssues([...astIssues, ...ruleIssues], lang, code.split('\n').length));
        }
        const lines = code.split('\n');
        if (lines.length <= 500) {
            return Promise.resolve(this.scan(lang, code));
        }
        return new Promise((resolve) => {
            const CHUNK = 200;
            const allIssues = [];
            // Sub-scanners that operate per-line and can be chunked
            const chunkableResults = [];
            let chunkIdx = 0;
            const processChunk = () => {
                const start = chunkIdx * CHUNK;
                const end = Math.min(start + CHUNK, lines.length);
                const chunkLines = lines.slice(start, end);
                // For chunked per-line scans we pass the full lines array context but only
                // flag issues found within this chunk's range, using line offset.
                chunkableResults.push({ start, end, lines: chunkLines });
                chunkIdx++;
                if (end < lines.length) {
                    setTimeout(processChunk, 0);
                } else {
                    // All chunks done — now run whole-file scanners (they are fast, O(n) single pass)
                    const issues = [
                        ...this.scanDelimiters(lines, lang),
                        ...this.scanLanguagePatterns(lang, lines),
                        ...this.scanUniversal(lang, lines)
                    ];
                    if (lang === 'Javascript' || lang === 'TypeScript') issues.push(...this.scanJavaScriptTypeScript(lines, lang));
                    if (lang === 'HTML') issues.push(...this.scanHtmlTags(lines), ...this.scanHtmlPatterns(lines), ...this.scanHtmlAdvanced(lines), ...this.scanHtmlEmbeddedCode(lines));
                    if (lang === 'SQL') issues.push(...this.scanSql(lines));
                    if (lang === 'Python') issues.push(...this.scanPythonIndentation(lines));
                    if (lang === 'CSS') issues.push(...this.scanCssPatterns(lines), ...this.scanCssAdvanced(lines));
                    issues.push(...this.scanUniversalAdvanced(lang, lines));
                    issues.push(...this.scanLanguageGuardrails(lang, lines));
                    resolve(this.finalizeIssues(issues, lang, lines.length));
                }
            };
            setTimeout(processChunk, 0);
        });
    }
    // Cooperative scanner used by live analysis and whole-project scans. Large files
    // run line-oriented checks in real chunks, while structural checks retain the full
    // source context and execute once after the chunks finish.
    static scanAsync(lang, code) {
        lang = this.normalizeLanguage(lang);
        const lines = String(code || '').split('\n');
        const runStructural = () => {
            const issues = [...this.scanDelimiters(lines, lang)];
            if (lang === 'Javascript' || lang === 'TypeScript') issues.push(...this.scanJavaScriptTypeScript(lines, lang));
            if (lang === 'HTML') issues.push(...this.scanHtmlTags(lines), ...this.scanHtmlPatterns(lines), ...this.scanHtmlAdvanced(lines), ...this.scanHtmlEmbeddedCode(lines));
            if (lang === 'SQL') issues.push(...this.scanSql(lines));
            if (lang === 'Python') issues.push(...this.scanPythonIndentation(lines));
            if (lang === 'CSS') issues.push(...this.scanCssPatterns(lines), ...this.scanCssAdvanced(lines));
            issues.push(...this.scanUniversalAdvanced(lang, lines), ...this.scanLanguageGuardrails(lang, lines));
            return issues;
        };
        if (lines.length <= 500) return Promise.resolve(this.scan(lang, String(code || '')));
        return new Promise(resolve => {
            const CHUNK = 200;
            const CONTEXT = 24;
            const issues = [];
            let start = 0;
            const process = () => {
                const end = Math.min(start + CHUNK, lines.length);
                const contextStart = Math.max(0, start - CONTEXT);
                const chunkLines = lines.slice(contextStart, Math.min(lines.length, end + CONTEXT));
                const addChunk = found => {
                    for (const issue of found) {
                        const absoluteLine = issue.line + contextStart;
                        if (absoluteLine >= start + 1 && absoluteLine <= end) issues.push({ ...issue, line: absoluteLine });
                    }
                };
                addChunk(this.scanLanguagePatterns(lang, chunkLines));
                addChunk(this.scanUniversal(lang, chunkLines));
                start = end;
                if (start < lines.length) { setTimeout(process, 0); return; }
                const astPromise = typeof JungleAstScanner !== 'undefined' && JungleAstScanner.names[lang]
                    ? JungleAstScanner.scan(lang, String(code || '')).catch(() => [{ line: 1, column: 1, severity: 'info', kind: 'Scanner integration', msg: 'AST scanner unavailable; heuristic checks were used instead.', hint: 'Reconnect or allow the bundled grammar resources if structural diagnostics are needed.' }])
                    : Promise.resolve([]);
                astPromise.then(astIssues => resolve(this.finalizeIssues([...astIssues, ...issues, ...runStructural()], lang, lines.length)));
            };
            setTimeout(process, 0);
        });
    }

    static scanPythonIndentation(lines) {
        const issues = [];
        const depths = this.computeBracketDepths(lines);
        let prevIndent = 0;
        let expectIndent = false;
        let continuation = false; // true while inside a multi-line bracket/backslash continuation
        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            const trimmed = raw.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const indent = raw.match(/^(\s*)/)[1].length;
            const hasTabs = raw.match(/^\t+/);
            const hasSpaces = raw.match(/^ +/);
            const isContinuation = depths.start[i] > 0 || continuation;
            if (hasTabs && hasSpaces) {
                issues.push(this.makeIssue(i + 1, "Mixed tabs and spaces for indentation.", "Use only spaces (PEP 8 recommends 4 spaces per level).", "Python indentation", 1, "error"));
            }
            if (!isContinuation) {
                if (expectIndent && indent <= prevIndent) {
                    issues.push(this.makeIssue(i + 1, "Expected an indented block after ':'.", "Indent the next line with 4 spaces to begin the block body.", "Python indentation", 1, "error"));
                }
                prevIndent = indent;
            }
            // A logical statement ends only once its brackets are balanced and it
            // doesn't end with an explicit backslash line continuation.
            const endsLogicalLine = depths.end[i] === 0 && !trimmed.endsWith('\\');
            if (endsLogicalLine) {
                expectIndent = /:\s*(#.*)?$/.test(trimmed);
                continuation = false;
            } else {
                continuation = true;
            }
        }
        return issues;
    }
    static makeIssue(line, msg, hint = "", kind = "Static analysis", column = null, severity = "error") {
        return { line, msg, hint, kind, column, severity };
    }
    static finalizeIssues(issues, lang = null, lineCount = null) {
        const seen = new Set();
        // Only high-confidence syntax/structure findings should block execution. The
        // scanner also reports style, security, performance, accessibility, and semantic
        // heuristics; those are useful warnings but are too context-dependent to present
        // as hard errors on otherwise valid programs.
        const hardErrorKind = kind => /syntax|indentation|delimiter|unclosed|string check|comment check|html structure|compile|runtime|type error|ast syntax|javascript error/i.test(String(kind || ''));
        const normalized = issues.map(issue => {
            // TypeScript scanner rules are only hints. The bundled TypeScript
            // compiler supplies the authoritative diagnostics during execution.
            if (issue.severity === 'error' && !hardErrorKind(issue.kind)) return { ...issue, severity: 'warning' };
            return issue;
        });
        const unique = normalized.filter(issue => {
            // A diagnostic must refer to a real source line.  Some heuristic rules
            // inspect look-ahead state; never expose a synthetic/out-of-file line.
            if (lineCount !== null && Number.isFinite(Number(issue.line)) && (Number(issue.line) < 1 || Number(issue.line) > lineCount)) return false;
            const rawMessage = String(issue.msg || '').toLowerCase();
            let fingerprint = rawMessage
                .replace(/duplicate\s+id(?:\s*=\s*["']?)[^\s"']+/i, 'duplicate id')
                .replace(/empty\s+catch[^.]*|catch\s+block[^.]*swallow[^.]*/i, 'empty catch block')
                .replace(/unwrap\(\)[^.]*|value\s+is\s+none\s+or\s+err/i, 'unwrap panic')
                .replace(/(?:go\s+)?error(?:\s+return\s+value)?[^.]*checked|error result[^.]*ignored/i, 'unchecked go error')
                .replace(/\s+/g, ' ').trim();
            if (/\bunwrap\s*\(/i.test(rawMessage)) fingerprint = 'rust unwrap';
            if (/\bcatch\b.*\b(?:empty|swallow|silently|hides?)\b/i.test(rawMessage)) fingerprint = 'empty catch block';
            if (/\b(?:err|error)\b.*(?:checked|ignored)/i.test(rawMessage)) fingerprint = 'unchecked go error';
            const key = `${issue.line ?? 0}|${fingerprint}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        const order = { error: 0, warning: 1, info: 2 };
        unique.sort((a, b) => (order[a.severity] ?? 1) - (order[b.severity] ?? 1) || (a.line || 0) - (b.line || 0) || (a.column || 0) - (b.column || 0));
        return unique;
    }
    static scanCssPatterns(lines) {
        const issues = [];
        let braceDepth = 0;
        let openBraceLine = -1;
        let inBlockComment = false;
        let inString = null;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;
            const trimmed = line.trim();
            if (!trimmed) continue;
            for (let j = 0; j < line.length; j++) {
                const char = line[j];
                const next = line[j + 1];
                if (inBlockComment) {
                    if (char === '*' && next === '/') { inBlockComment = false; j++; }
                    continue;
                }
                if (inString) {
                    if (char === inString) inString = null;
                    continue;
                }
                if (char === '/' && next === '*') { inBlockComment = true; j++; continue; }
                if (char === '"' || char === "'") { inString = char; continue; }
                if (char === '{') { if (braceDepth === 0) openBraceLine = lineNum; braceDepth++; }
                else if (char === '}') {
                    if (braceDepth === 0) {
                        issues.push(this.makeIssue(lineNum, `Unexpected '}' with no matching '{' in CSS.`, "Remove this '}' or add a matching '{' for the rule above.", "CSS syntax", j + 1));
                    } else {
                        braceDepth--;
                    }
                }
            }
            // Property declarations inside a rule must end with ';'
            const nextCssLine = lines.slice(i + 1).find(candidate => candidate.trim());
            const declarationClosesBlock = nextCssLine && /^\s*}/.test(nextCssLine);
            if (braceDepth > 0 && trimmed && !trimmed.startsWith('/*') && !trimmed.startsWith('//') && !trimmed.endsWith('{') && !trimmed.endsWith('}') && !trimmed.endsWith(';') && !trimmed.endsWith(',') && trimmed.includes(':') && !declarationClosesBlock) {
                issues.push(this.makeIssue(lineNum, `CSS property declaration may be missing a semicolon.`, "Add ';' at the end of this property declaration.", "CSS syntax", null, "warning"));
            }
            // Detect a selector line followed by nothing (likely forgot brace)
            if (braceDepth === 0 && /^[.#]?[a-zA-Z][\w\s,:.#\[\]>+~*()-]*$/.test(trimmed) && trimmed.length > 1 && i + 1 < lines.length) {
                const nextTrimmed = lines[i + 1]?.trim();
                if (nextTrimmed && !nextTrimmed.startsWith('{') && !nextTrimmed.startsWith('/*') && !nextTrimmed.startsWith('@') && nextTrimmed.includes(':') && !nextTrimmed.startsWith('.') && !nextTrimmed.startsWith('#')) {
                    issues.push(this.makeIssue(lineNum, `CSS selector '${trimmed.slice(0, 40)}' may be missing an opening '{'.`, "Add '{' after the selector and '}' after the declarations.", "CSS syntax", null, "warning"));
                }
            }
        }
        if (inBlockComment) {
            issues.push(this.makeIssue(openBraceLine > 0 ? openBraceLine : 1, "Unclosed block comment in CSS.", "Add */ to close this comment.", "CSS syntax"));
        }
        if (braceDepth > 0) {
            issues.push(this.makeIssue(openBraceLine, `Unclosed '{' on line ${openBraceLine} — CSS rule block is never closed.`, "Add '}' to close this rule block.", "CSS syntax"));
        }
        return issues;
    }
    // True if an odd number of backslashes immediately precede position j on `line`
    // (an even count means they cancel out in pairs — a literal backslash, not an escape).
    static isEscaped(line, j) {
        let count = 0;
        let k = j - 1;
        while (k >= 0 && line[k] === '\\') { count++; k--; }
        return count % 2 === 1;
    }
    // Detects PHP/Bash/Ruby/HCL heredoc & nowdoc blocks (<<<TAG ... TAG; or <<EOF ... EOF)
    // and returns a boolean per line marking lines that are entirely inside one — their
    // raw text (which can contain any quotes/brackets/apostrophes) must not be scanned as code.
    static computeHeredocSkip(lines) {
        const skip = new Array(lines.length).fill(false);
        const openRe = /<<[<~-]?\s*(['"]?)([A-Za-z_]\w*)\1\s*$/;
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(openRe);
            if (!m) continue;
            const tag = m[2];
            const closeRe = new RegExp(`^\\s*${tag}\\s*[;,)]?\\s*$`);
            for (let k = i + 1; k < lines.length; k++) {
                skip[k] = true;
                if (closeRe.test(lines[k])) break;
            }
        }
        return skip;
    }
    // Perl POD documentation blocks (=pod / =head1 / etc. through =cut) are prose, not
    // code — they must not be scanned for brackets/strings any more than a heredoc body.
    static computePodSkip(lines, lang) {
        const skip = new Array(lines.length).fill(false);
        if (lang !== 'Perl') return skip;
        let inPod = false;
        for (let i = 0; i < lines.length; i++) {
            if (!inPod && /^=\w+/.test(lines[i])) inPod = true;
            if (inPod) {
                skip[i] = true;
                if (/^=cut\b/.test(lines[i])) inPod = false;
            }
        }
        return skip;
    }
    static scanDelimiters(lines, lang) {
        const errors = [];
        const stack = [];
        const bracketPairs = { '(': ')', '[': ']', '{': '}' };
        const matchingPairs = { ')': '(', ']': '[', '}': '{' };
        // Languages where a bare '/' can start a regex literal (not just division) —
        // without this, patterns like /don't match/ or /[a-z]\// get misread as strings/brackets.
        const regexCapable = lang === 'Javascript' || lang === 'TypeScript' || lang === 'Ruby';
        const regexPreChars = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', ';', '{', '}', '+', '-', '*', '%', '<', '>', '~', '^', '\n']);
        const regexKeywords = new Set(['return', 'typeof', 'instanceof', 'case', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'do', 'else']);
        const heredocSkip = this.computeHeredocSkip(lines);
        const podSkip = this.computePodSkip(lines, lang);
        // Single line-comment prefix, by language, for the many languages that don't use // or #.
        const hashCommentLangs = new Set(['Python', 'Ruby', 'Bash', 'Perl', 'R', 'Nix', 'Julia', 'Elixir', 'HCL', 'GDScript', 'Nim']);
        const percentCommentLangs = new Set(['Erlang', 'Prolog']);
        const semicolonCommentLangs = new Set(['Lisp', 'Clojure', 'Assembly']);
        const dashCommentLangs = new Set(['Haskell', 'Lua', 'SQL']);
        const bangCommentLangs = new Set(['Fortran']);
        const asteriskGtCommentLangs = new Set(['COBOL']); // free-format *> inline comments
        // Languages using (* *) instead of C-style /* */ block comments.
        const parenStarBlockLangs = new Set(['OCaml', 'F#', 'Pascal']);
        // Lisp/Clojure use ' only as the quote reader macro (e.g. '(1 2) or 'symbol) —
        // strings are always double-quoted, so a bare ' must never open a string there.
        const noSingleQuoteStringLangs = new Set(['Lisp', 'Clojure']);
        let blockCommentCloser = null; // '*/', '*)', or '}' depending on language — null means not in one
        let inHaskellBlockComment = 0; // nesting depth — Haskell {- -} comments nest
        let inNestedComment = 0;       // nesting depth — Nim #[ ]# and Julia #= =# comments nest
        let nestedOpen = null, nestedClose = null; // the 2-char open/close tokens for the active nested comment
        let luaLongClose = null;    // Lua long-bracket ]==] closer while inside [[..]] / --[[..]]
        let luaLongStart = null;    // where the current Lua long string/comment opened
        let inString = null;
        let inTriple = null; // '"""' or "'''" — persists across lines, unlike single-char strings
        let inRegex = false;
        let inCharClass = false; // inside [...] of a regex literal
        let blockCommentStart = null;
        let stringStart = null;
        let tripleStart = null;
        let lastSig = '\n'; // last non-whitespace, non-comment/string character seen so far
        for (let i = 0; i < lines.length; i++) {
            if (heredocSkip[i] || podSkip[i]) continue; // heredoc/nowdoc/POD body — raw text, not code
            const line = lines[i];
            const lineNum = i + 1;
            for (let j = 0; j < line.length; j++) {
                const char = line[j];
                const next = line[j + 1];
                // Rust/OCaml/F# type & lifetime variables ('a, 'static, <'a>) and Haskell's
                // prime-suffix identifier convention (x', map') look like an unclosed char
                // literal — a real char literal always closes right after one character (or
                // escape); these never do. A genuine char literal ('c', '\n') still falls
                // through to string handling because the char is immediately followed by "'".
                const primeIdentLang = lang === 'Rust' || lang === 'Haskell' || lang === 'OCaml' || lang === 'F#';
                if (primeIdentLang && char === "'" && !inString && !inTriple && !inRegex && !blockCommentCloser && !inHaskellBlockComment && !inNestedComment) {
                    const prevChar = line[j - 1];
                    if (lang === 'Haskell' && prevChar && /[A-Za-z0-9_']/.test(prevChar)) {
                        // trailing prime on an identifier (x', map'') — just a normal character
                        lastSig = char;
                        continue;
                    }
                    const identMatch = line.slice(j + 1).match(/^[A-Za-z_]\w*/);
                    if (identMatch && line[j + 1 + identMatch[0].length] !== "'") {
                        j += identMatch[0].length;
                        lastSig = identMatch[0].slice(-1);
                        continue;
                    }
                }
                if (noSingleQuoteStringLangs.has(lang) && char === "'" && !inString && !inTriple) {
                    lastSig = char;
                    continue; // quote reader macro, e.g. '(1 2 3) or 'symbol — never a string
                }
                if (inRegex) {
                    if (char === '\\') { j++; continue; }
                    if (char === '[') inCharClass = true;
                    else if (char === ']') inCharClass = false;
                    else if (char === '/' && !inCharClass) { inRegex = false; lastSig = '/'; }
                    continue;
                }
                if (inTriple) {
                    if (line.slice(j, j + 3) === inTriple) { inTriple = null; tripleStart = null; j += 2; }
                    continue;
                }
                if (inHaskellBlockComment) {
                    if (line.slice(j, j + 2) === '{-') { inHaskellBlockComment++; j++; }
                    else if (line.slice(j, j + 2) === '-}') { inHaskellBlockComment--; j++; }
                    continue;
                }
                if (inNestedComment) {
                    if (line.slice(j, j + 2) === nestedOpen) { inNestedComment++; j++; }
                    else if (line.slice(j, j + 2) === nestedClose) { inNestedComment--; j++; }
                    continue;
                }
                if (luaLongClose) {
                    // Lua long strings/comments are opaque and don't nest; scan only for the closer.
                    if (line.slice(j, j + luaLongClose.length) === luaLongClose) { j += luaLongClose.length - 1; luaLongClose = null; luaLongStart = null; }
                    continue;
                }
                if (blockCommentCloser) {
                    if (line.slice(j, j + blockCommentCloser.length) === blockCommentCloser) {
                        j += blockCommentCloser.length - 1;
                        blockCommentCloser = null;
                    }
                    continue;
                }
                if (inString) {
                    // SQL escapes quote characters by doubling them ('' or ""), not only
                    // with a backslash. Treat the pair as content inside the same literal.
                    if (lang === 'SQL' && (inString === "'" || inString === '"') && char === inString && next === inString) { j++; continue; }
                    if (char === inString && !this.isEscaped(line, j)) inString = null;
                    continue;
                }
                if (lang === 'Pascal' && char === '{') {
                    // In Pascal, { ... } is ALWAYS a comment — blocks use begin/end, never braces.
                    blockCommentCloser = '}';
                    blockCommentStart = { line: lineNum, column: j + 1 };
                    continue;
                }
                if (parenStarBlockLangs.has(lang) && char === '(' && next === '*') {
                    blockCommentCloser = '*)';
                    blockCommentStart = { line: lineNum, column: j + 1 };
                    j++;
                    continue;
                }
                if (lang === 'Haskell' && line.slice(j, j + 2) === '{-') {
                    inHaskellBlockComment = 1;
                    blockCommentStart = { line: lineNum, column: j + 1 };
                    j++;
                    continue;
                }
                // Nim #[ ]# and Julia #= =# block comments (both nest) — must be checked
                // before the plain '#' line-comment break below, or #[ / #= is misread as a
                // line comment and the following lines get scanned as live code.
                if (lang === 'Nim' && line.slice(j, j + 2) === '#[') {
                    inNestedComment = 1; nestedOpen = '#['; nestedClose = ']#';
                    blockCommentStart = { line: lineNum, column: j + 1 }; j++; continue;
                }
                if (lang === 'Julia' && line.slice(j, j + 2) === '#=') {
                    inNestedComment = 1; nestedOpen = '#='; nestedClose = '=#';
                    blockCommentStart = { line: lineNum, column: j + 1 }; j++; continue;
                }
                if (lang === 'Lua') {
                    // Long-bracket forms: [[ ]] and [=[ ]=] (strings) and --[[ ]] (comments).
                    // All are opaque multi-line spans. The comment form always applies; the bare
                    // string form is only treated as such in value position so ordinary nested
                    // indexing like a[b[c]] is never misread as a long string.
                    const luaOpen = line.slice(j).match(/^(--)?\[(=*)\[/);
                    if (luaOpen) {
                        const isComment = !!luaOpen[1];
                        const wordBefore = (line.slice(0, j).match(/([A-Za-z_]\w*)\s*$/) || [])[1] || '';
                        const valuePos = regexPreChars.has(lastSig) || /^(return|and|or|not|do|then|else|elseif|until|in)$/.test(wordBefore);
                        if (isComment || valuePos) {
                            luaLongClose = ']' + '='.repeat(luaOpen[2].length) + ']';
                            luaLongStart = { line: lineNum, column: j + 1 };
                            j += luaOpen[0].length - 1;
                            continue;
                        }
                    }
                }
                if (dashCommentLangs.has(lang) && line.slice(j, j + 2) === '--') break;
                if (asteriskGtCommentLangs.has(lang) && line.slice(j, j + 2) === '*>') break;
                if (hashCommentLangs.has(lang) && char === '#') break;
                if (percentCommentLangs.has(lang) && char === '%') break;
                if (semicolonCommentLangs.has(lang) && char === ';') break;
                if (bangCommentLangs.has(lang) && char === '!') break;
                if (lang === 'HTML' && line.slice(j, j + 4) === '<!--') { blockCommentCloser = '-->'; blockCommentStart = { line: lineNum, column: j + 1 }; j += 3; continue; }
                if (char === '/' && next === '/') break;
                if (char === '/' && next === '*') { blockCommentCloser = '*/'; blockCommentStart = { line: lineNum, column: j + 1 }; j++; continue; }
                if (regexCapable && char === '/' && next !== '/' && next !== '*') {
                    // Look back at the last significant token to decide if '/' opens a regex
                    // (after an operator/keyword) rather than being division.
                    const wordMatch = line.slice(0, j).match(/([A-Za-z_$][\w$]*)\s*$/);
                    const trailingWord = wordMatch ? wordMatch[1] : '';
                    if (regexPreChars.has(lastSig) || regexKeywords.has(trailingWord)) {
                        inRegex = true;
                        inCharClass = false;
                        continue;
                    }
                }
                // Triple-quoted strings (Python docstrings, etc.) span multiple lines — track them
                // as a distinct persistent state so quotes/brackets inside don't get misread as code.
                if ((char === '"' || char === "'") && line.slice(j, j + 3) === char.repeat(3)) {
                    inTriple = char.repeat(3);
                    tripleStart = { line: lineNum, column: j + 1 };
                    j += 2;
                    continue;
                }
                if (char === '"' || char === "'" || char === '`') { inString = char; stringStart = { line: lineNum, column: j + 1 }; lastSig = char; continue; }
                if (bracketPairs[char]) {
                    stack.push({ char, line: lineNum, column: j + 1 });
                } else if (matchingPairs[char]) {
                    if (stack.length === 0) {
                        errors.push(this.makeIssue(lineNum, `Mismatched closing bracket '${char}' without matching opener.`, `Remove this '${char}' or add the matching '${matchingPairs[char]}' before it.`, "Delimiter check", j + 1));
                    } else {
                        const last = stack.pop();
                        if (last.char !== matchingPairs[char]) {
                            errors.push(this.makeIssue(lineNum, `Mismatched closing bracket '${char}' - expected '${bracketPairs[last.char]}' for '${last.char}' from line ${last.line}.`, `Close '${last.char}' with '${bracketPairs[last.char]}' before using '${char}'.`, "Delimiter check", j + 1));
                        }
                    }
                }
                if (!/\s/.test(char)) lastSig = char;
            }
            if (inString && inString !== '`' && !line.trimEnd().endsWith('\\')) {
                errors.push(this.makeIssue(stringStart.line, `Unclosed string literal starting with ${inString}.`, `Add a closing ${inString} before the end of the line.`, "String check", stringStart.column));
                inString = null;
                stringStart = null;
            }
            inRegex = false; // regex literals don't span raw lines
            if (!inTriple && !inString) lastSig = '\n';
        }
        if (blockCommentCloser && blockCommentStart) {
            errors.push(this.makeIssue(blockCommentStart.line, "Unclosed block comment detected.", `Add ${blockCommentCloser} to close this block comment.`, "Comment check", blockCommentStart.column));
        }
        if (inHaskellBlockComment > 0 && blockCommentStart) {
            errors.push(this.makeIssue(blockCommentStart.line, "Unclosed block comment detected.", "Add -} to close this block comment.", "Comment check", blockCommentStart.column));
        }
        if (inNestedComment > 0 && blockCommentStart) {
            errors.push(this.makeIssue(blockCommentStart.line, "Unclosed block comment detected.", `Add ${nestedClose} to close this block comment.`, "Comment check", blockCommentStart.column));
        }
        if (inTriple && tripleStart) {
            errors.push(this.makeIssue(tripleStart.line, `Unclosed triple-quoted string starting with ${inTriple}.`, `Add a closing ${inTriple}.`, "String check", tripleStart.column));
        }
        if (luaLongClose && luaLongStart) {
            errors.push(this.makeIssue(luaLongStart.line, "Unclosed Lua long-bracket string or comment.", `Add ${luaLongClose} to close the long bracket opened here.`, "String check", luaLongStart.column));
        }
        if (inString && stringStart) {
            errors.push(this.makeIssue(stringStart.line, `Unclosed string literal starting with ${inString}.`, `Add a closing ${inString}.`, "String check", stringStart.column));
        }
        while (stack.length > 0) {
            const unclosed = stack.pop();
            errors.push(this.makeIssue(unclosed.line, `Unclosed '${unclosed.char}' on line ${unclosed.line}, column ${unclosed.column} — never closed.`, `Add '${bracketPairs[unclosed.char]}' to close the '${unclosed.char}' opened here.`, "Delimiter check", unclosed.column));
        }
        return errors;
    }
    // Tokenize HTML without treating `>` inside quoted attributes as the end of a
    // tag. Script/style bodies are raw text in HTML, so their contents are skipped;
    // this prevents strings such as `const markup = "<div>"` from becoming tags.
    static tokenizeHtml(code) {
        const tokens = [];
        let i = 0;
        let rawTextTag = null;
        const pushToken = (start, end, name, attrs, closing, selfClosing) => tokens.push({
            raw: code.slice(start, end), index: start, name: name.toLowerCase(), attrs: attrs || '',
            closing: !!closing, selfClosing: !!selfClosing
        });
        while (i < code.length) {
            if (rawTextTag) {
                const close = new RegExp(`<\\/\\s*${rawTextTag}\\b`, 'ig');
                close.lastIndex = i;
                const match = close.exec(code);
                if (!match) break;
                i = match.index;
                rawTextTag = null;
            }
            if (code.slice(i, i + 4) === '<!--') {
                const end = code.indexOf('-->', i + 4);
                i = end < 0 ? code.length : end + 3;
                continue;
            }
            if (code[i] !== '<') { i++; continue; }
            const rest = code.slice(i);
            const doctype = rest.match(/^<!doctype\b/i);
            if (doctype) {
                let j = i + doctype[0].length, quote = null;
                for (; j < code.length; j++) {
                    const ch = code[j];
                    if (quote) { if (ch === quote) quote = null; continue; }
                    if (ch === '"' || ch === "'") { quote = ch; continue; }
                    if (ch === '>') { j++; break; }
                }
                i = j; continue;
            }
            const head = rest.match(/^<\s*(\/?)\s*([A-Za-z][\w:-]*)/);
            if (!head) { i++; continue; }
            const start = i;
            const closing = !!head[1];
            const name = head[2];
            let j = i + head[0].length, quote = null;
            for (; j < code.length; j++) {
                const ch = code[j];
                if (quote) { if (ch === quote) quote = null; continue; }
                if (ch === '"' || ch === "'") { quote = ch; continue; }
                if (ch === '>') { j++; break; }
            }
            if (j > code.length || code[j - 1] !== '>') { i++; continue; }
            const raw = code.slice(start, j);
            const attrStart = head[0].length;
            const attrEnd = raw.length - 1 - (raw.endsWith('/>') ? 1 : 0);
            const attrs = closing ? '' : raw.slice(attrStart, Math.max(attrStart, attrEnd));
            const selfClosing = /\/\s*>$/.test(raw);
            pushToken(start, j, name, attrs, closing, selfClosing);
            i = j;
            if (!closing && !selfClosing && /^(script|style)$/i.test(name)) rawTextTag = name.toLowerCase();
        }
        return tokens;
    }

    static scanHtmlTags(lines) {
        const errors = [];
        const stack = [];
        const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
        const optionalTags = new Set(['li','dt','dd','p','rt','rp','optgroup','option','thead','tbody','tfoot','tr','td','th','colgroup']);
        const code = lines.join('\n');
        const tokens = this.tokenizeHtml(code);
        const impliedClose = (open, next) => {
            if (open === 'p') return new Set(['address','article','aside','blockquote','div','dl','fieldset','footer','form','h1','h2','h3','h4','h5','h6','header','hgroup','hr','main','menu','nav','ol','p','pre','section','table','ul']).has(next);
            if (open === 'li') return next === 'li';
            if (open === 'dt' || open === 'dd') return next === 'dt' || next === 'dd';
            if (open === 'rt' || open === 'rp') return next === 'rt' || next === 'rp';
            if (open === 'option') return next === 'option' || next === 'optgroup';
            if (open === 'optgroup') return next === 'optgroup';
            if (open === 'tr') return next === 'tr';
            if (open === 'td' || open === 'th') return next === 'td' || next === 'th';
            if (open === 'thead') return next === 'tbody' || next === 'tfoot';
            if (open === 'tbody') return next === 'tbody' || next === 'tfoot';
            return false;
        };
        for (const token of tokens) {
            const raw = token.raw;
            const tagName = token.name;
            const before = code.slice(0, token.index);
            const line = before.split('\n').length;
            const column = token.index - before.lastIndexOf('\n');
            const isClosing = token.closing;
            const isSelfClosing = raw.endsWith('/>') || voidTags.has(tagName);
            if (isClosing) {
                let matchIndex = -1;
                for (let k = stack.length - 1; k >= 0; k--) if (stack[k].tag === tagName) { matchIndex = k; break; }
                if (matchIndex < 0) {
                    errors.push(this.makeIssue(line, `Closing tag </${tagName}> has no matching opening tag.`, `Remove </${tagName}> or add <${tagName}> before it.`, "HTML structure", column));
                    continue;
                }
                while (stack.length - 1 > matchIndex) {
                    const implicit = stack.pop();
                    if (!optionalTags.has(implicit.tag)) errors.push(this.makeIssue(line, `Closing tag </${tagName}> does not match <${implicit.tag}> from line ${implicit.line}.`, `Change this to </${implicit.tag}> or close <${implicit.tag}> before </${tagName}>.`, "HTML structure", column));
                }
                stack.pop();
            } else if (!isSelfClosing) {
                while (stack.length && optionalTags.has(stack[stack.length - 1].tag) && impliedClose(stack[stack.length - 1].tag, tagName)) stack.pop();
                stack.push({ tag: tagName, line, column });
            }
        }
        while (stack.length > 0) {
            const unclosed = stack.pop();
            if (optionalTags.has(unclosed.tag)) continue;
            errors.push(this.makeIssue(unclosed.line, `Unclosed HTML tag <${unclosed.tag}> detected.`, `Add </${unclosed.tag}> after this element's content.`, "HTML structure", unclosed.column));
        }
        return errors;
    }
    // Tracks running (paren/bracket/brace) nesting depth at the START of each line,
    // honoring strings/triple-quotes/comments so multi-line comprehensions and
    // continued conditions inside brackets aren't mistaken for fresh statements.
    static computeBracketDepths(lines) {
        const startDepths = [];
        const endDepths = [];
        let depth = 0;
        let inTriple = null;
        for (const line of lines) {
            startDepths.push(depth);
            let i = 0, inStr = null;
            while (i < line.length) {
                const ch = line[i];
                if (inTriple) {
                    if (line.slice(i, i + 3) === inTriple) { inTriple = null; i += 3; continue; }
                    i++; continue;
                }
                if (inStr) {
                    if (ch === '\\') { i += 2; continue; }
                    if (ch === inStr) inStr = null;
                    i++; continue;
                }
                if (line.slice(i, i + 3) === '"""' || line.slice(i, i + 3) === "'''") { inTriple = line.slice(i, i + 3); i += 3; continue; }
                if (ch === '"' || ch === "'") { inStr = ch; i++; continue; }
                if (ch === '#') break;
                if (ch === '(' || ch === '[' || ch === '{') depth++;
                else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
                i++;
            }
            endDepths.push(depth);
        }
        return { start: startDepths, end: endDepths };
    }
    // First non-empty trimmed line strictly after `idx`, or '' if none remain.
    static nextNonBlankTrimmed(lines, idx) {
        for (let j = idx + 1; j < lines.length; j++) {
            const t = lines[j].trim();
            if (t) return t;
        }
        return '';
    }
    // JS/TS checks that need a little more context than the line-oriented rules above.
    // This intentionally stays heuristic/offline: it catches high-confidence bugs without
    // pretending to replace the TypeScript compiler or a full JavaScript parser.
    static maskJavaScriptTypeScript(code) {
        let out = '';
        let state = 'normal';
        let quote = null;
        let regexClass = false;
        for (let i = 0; i < code.length; i++) {
            const ch = code[i];
            const next = code[i + 1];
            if (state === 'line') {
                if (ch === '\n') { out += '\n'; state = 'normal'; }
                else out += ' ';
                continue;
            }
            if (state === 'block') {
                if (ch === '*' && next === '/') { out += '  '; i++; state = 'normal'; }
                else out += ch === '\n' ? '\n' : ' ';
                continue;
            }
            if (state === 'string') {
                if (ch === '\\') { out += ' '; if (i + 1 < code.length) { out += code[i + 1] === '\n' ? '\n' : ' '; i++; } continue; }
                if (ch === quote) { out += ' '; state = 'normal'; quote = null; }
                else out += ch === '\n' ? '\n' : ' ';
                continue;
            }
            if (state === 'regex') {
                if (ch === '\\') { out += ' '; if (i + 1 < code.length) { out += code[i + 1] === '\n' ? '\n' : ' '; i++; } continue; }
                if (ch === '[') regexClass = true;
                else if (ch === ']') regexClass = false;
                else if (ch === '/' && !regexClass) { out += ' '; state = 'normal'; }
                else out += ch === '\n' ? '\n' : ' ';
                continue;
            }
            if (ch === '/' && next === '/') { out += '  '; i++; state = 'line'; continue; }
            if (ch === '/' && next === '*') { out += '  '; i++; state = 'block'; continue; }
            if (ch === '"' || ch === "'" || ch === '\x60') { out += ' '; state = 'string'; quote = ch; continue; }
            if (ch === '/') {
                const before = out.slice(Math.max(0, out.length - 32));
                const word = before.match(/([A-Za-z_$][\w$]*)\s*$/);
                if (!word || /(?:return|throw|case|delete|void|typeof|instanceof|in|of|yield|await)$/.test(word[1]) || /[=(,:!?;{}[\]&|+\-*%^<>~]?\s*$/.test(before)) {
                    out += ' ';
                    state = 'regex';
                    regexClass = false;
                    continue;
                }
            }
            out += ch;
        }
        return out;
    }

    static scanJavaScriptTypeScript(lines, lang) {
        const issues = [];
        const code = lines.join('\n');
        const maskedLines = this.maskJavaScriptTypeScript(code).split('\n');
        const maskedFull = maskedLines.join('\n');
        const e = (ln, msg, hint, kind, sev = 'warning', col = null) => issues.push(this.makeIssue(ln, msg, hint, kind, col, sev));
        const nextNonBlank = (idx) => {
            for (let j = idx + 1; j < lines.length; j++) if (maskedLines[j].trim()) return maskedLines[j].trim();
            return '';
        };
        const switchInfo = start => {
            let depth = 0;
            let started = false;
            let end = maskedLines.length - 1;
            const cases = [];
            let hasDefault = false;
            for (let j = start; j < maskedLines.length; j++) {
                const text = maskedLines[j];
                if (started && depth === 1) {
                    for (const match of text.matchAll(/\bcase\s+(.+?)\s*:/g)) cases.push({ value: match[1].trim(), line: j + 1 });
                    if (/\bdefault\s*:/.test(text)) hasDefault = true;
                }
                for (const ch of text) {
                    if (ch === '{') { depth++; started = true; }
                    else if (ch === '}' && started) { depth--; if (depth === 0) { end = j; break; } }
                }
                if (started && depth === 0) break;
            }
            return { cases, hasDefault, end };
        };
        const constDeclarations = [];
        for (let i = 0; i < maskedLines.length; i++) {
            const m = maskedLines[i].match(/^\s*const\s+([A-Za-z_$][\w$]*)\s*=/);
            if (m) constDeclarations.push({ name: m[1], line: i + 1 });
        }
        // Scan object literals with a brace stack so duplicate keys are also found
        // when the properties are spread across several lines.
        const objectStack = [];
        let codeOffset = 0;
        for (let lineIndex = 0; lineIndex < maskedLines.length; lineIndex++) {
            const maskedLine = maskedLines[lineIndex];
            for (let pos = 0; pos < maskedLine.length; pos++) {
                const ch = maskedLine[pos];
                if (ch === '{') {
                    const before = maskedFull.slice(Math.max(0, codeOffset + pos - 48), codeOffset + pos);
                    objectStack.push({ object: /(?:=|:|,|\(|\[|\breturn)\s*$/.test(before), keys: new Set() });
                } else if (ch === '}') {
                    objectStack.pop();
                }
                const keyMatch = maskedLine.slice(pos).match(/^([A-Za-z_$][\w$]*)\s*:/);
                const current = objectStack[objectStack.length - 1];
                if (keyMatch && current?.object) {
                    const key = keyMatch[1];
                    const lineNum = lineIndex + 1;
                    if (current.keys.has(key)) e(lineNum, "Duplicate object key '" + key + "'; the later value overwrites the earlier one.", "Rename or remove one of the duplicate keys.", "JavaScript logic", "warning");
                    current.keys.add(key);
                }
            }
            codeOffset += maskedLine.length + 1;
        }

        for (let idx = 0; idx < maskedLines.length; idx++) {
            const line = maskedLines[idx];
            const raw = lines[idx];
            const rawTrimmed = raw.trim();
            const trimmed = line.trim();
            if (!trimmed) continue;
            const compact = trimmed.replace(/\s+/g, ' ');
            const lineNum = idx + 1;
            const next = nextNonBlank(idx);

            const condition = compact.match(/\b(?:if|while|for)\s*\(([^)]*)\)/);
            if (condition && /=>/.test(condition[1])) {
                e(lineNum, "Arrow function found inside a control condition.", "Use a comparison such as x >= 1; '=>' is probably a typo for '>='.", "JavaScript logic", "error");
            }

            // Unlike let/var, const declarations must have an initializer.
            if (/^\s*const\s+[^=;]+;\s*$/.test(line) || (/^\s*const\s+[^=;]+$/.test(line) && !next.startsWith('=') && !next.startsWith(','))) {
                e(lineNum, "const declaration is missing an initializer.", "Assign a value immediately: const name = value;.", "JavaScript syntax", "error");
            }

            // Async callbacks passed to forEach are not awaited by the caller.
            if (/\.\s*forEach\s*\(\s*async\b/.test(compact)) {
                e(lineNum, "async callback passed to forEach() is not awaited.", "Use for...of for sequential awaits, or await Promise.all(items.map(async item => ...)).", "JavaScript async", "warning");
            }
            if (/\bawait\s+[\w$.()[\]]+\s*\.\s*forEach\s*\(/.test(compact)) {
                e(lineNum, "awaiting forEach() does not wait for its async callbacks.", "Use for...of or Promise.all(items.map(...)) instead.", "JavaScript async", "error");
            }
            if (/\bnew\s+Promise\s*\(\s*async\b/.test(compact)) {
                e(lineNum, "Promise constructor contains an async executor.", "Remove async from the executor and await the promise outside; async executors can create uncaught errors.", "JavaScript async", "warning");
            }
            if (/\.\s*reduce\s*\(\s*async\b/.test(compact)) {
                e(lineNum, "async reducer returns a promise accumulator.", "Use a for...of loop or await the accumulator explicitly between reductions.", "JavaScript async", "warning");
            }
            if (/\bArray\s*\(\s*\d+\s*\)\s*\.fill\s*\(\s*[{[]/.test(compact)) {
                e(lineNum, "Array.fill() reuses the same object or array reference in every slot.", "Create a fresh value per element with Array.from({ length: n }, () => ({})).", "JavaScript logic", "warning");
            }

            if (/\.(?:innerHTML|outerHTML)\s*=/.test(compact) && /\.\s*(?:innerHTML|outerHTML)\s*=\s*[A-Za-z_$][\w$.[\]]*/.test(compact)) {
                e(lineNum, "Untrusted value assigned to innerHTML/outerHTML.", "Prefer textContent or sanitize the HTML before inserting it.", "JavaScript security", "warning");
            }
            if (/\.\s*insertAdjacentHTML\s*\(/.test(compact) && !/insertAdjacentHTML\s*\(\s*["'][^"']*["']\s*,\s*["'\x60]/.test(raw)) {
                e(lineNum, "insertAdjacentHTML() may insert unsanitized HTML.", "Sanitize dynamic markup or build the DOM with createElement/textContent.", "JavaScript security", "warning");
            }
            if (/\.\s*postMessage\s*\([^)]*,\s*["']\*["']\s*\)/.test(compact)) {
                e(lineNum, "postMessage() uses '*' as targetOrigin.", "Send messages only to the exact trusted origin.", "JavaScript security", "warning");
            }

            if (/\bcatch\s*(?:\([^)]*\))?\s*\{/.test(compact)) {
                const tail = maskedLines.slice(idx, Math.min(idx + 40, maskedLines.length)).join('\n');
                if (/\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(tail)) {
                    e(lineNum, "Empty catch block silently swallows errors.", "Log, rethrow, or otherwise handle the error inside the catch block.", "JavaScript error handling", "warning");
                }
            }
            if (/^\s*try\s*\{/.test(compact)) {
                const tail = maskedLines.slice(idx, Math.min(idx + 120, maskedLines.length)).join('\n');
                if (!/\}\s*(?:catch|finally)\b/.test(tail)) {
                    e(lineNum, "try block has no catch or finally handler.", "Add catch/finally or remove the unnecessary try block.", "JavaScript error handling", "warning");
                }
            }

            // Repeated object literal keys are legal but the later value silently wins.
            if (/[{,]\s*[A-Za-z_$][\w$]*\s*:/.test(compact) && /\}/.test(compact)) {
                const keys = new Set();
                for (const m of compact.matchAll(/[{,]\s*([A-Za-z_$][\w$]*)\s*:/g)) {
                    if (keys.has(m[1])) {
                        e(lineNum, "Duplicate object key '" + m[1] + "'; the later value overwrites the earlier one.", "Rename or remove one of the duplicate keys.", "JavaScript logic", "warning");
                    }
                    keys.add(m[1]);
                }
            }

            if (/^\s*switch\s*\(/.test(compact)) {
                const info = switchInfo(idx);
                if (!info.hasDefault) {
                    e(lineNum, "switch statement has no default case.", "Handle unexpected values with a default branch.", "JavaScript logic", "info");
                }
            }

            if (lang === 'TypeScript') {
                if (/^\s*type\s+[A-Za-z_$][\w$]*\s*=\s*(?:;)?$/.test(compact)) {
                    e(lineNum, "Type alias is missing its right-hand type.", "Complete the alias, for example: type UserId = string;.", "TypeScript syntax", "error");
                }
                if (/^\s*(?:const\s+)?enum\s+[A-Za-z_$][\w$]*(?:\s+extends\b[^{}]+)?\s*$/.test(compact)) {
                    e(lineNum, "Enum declaration is missing its body.", "Add { ... } with the enum members.", "TypeScript syntax", "error");
                }
                if (/^\s*namespace\s+[A-Za-z_$][\w$]*\s*$/.test(compact)) {
                    e(lineNum, "Namespace declaration is missing its body.", "Add { ... } or remove the namespace keyword.", "TypeScript syntax", "error");
                }

                const typed = rawTrimmed.match(/\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*:\s*(number|string|boolean|bigint)\b[^=]*=\s*(.+?);?$/);
                if (typed) {
                    const declared = typed[1];
                    const value = typed[2].trim();
                    const mismatch = (declared === 'number' && (/^["']/.test(value) || /^(?:true|false)\b/.test(value)))
                        || (declared === 'string' && /^(?:\d+(?:\.\d+)?|true|false)\b/.test(value))
                        || (declared === 'boolean' && (/^["']/.test(value) || /^\d/.test(value)))
                        || (declared === 'bigint' && !/n\b/.test(value) && /^\d/.test(value));
                    if (mismatch) {
                        e(lineNum, "Initializer does not match the declared TypeScript type '" + declared + "'.", "Use a value of type " + declared + " or correct the annotation.", "TypeScript type error", "error");
                    }
                }
                const imports = compact.match(/\b(?:import|export)\s*\{([^}]*)\}/);
                if (imports) {
                    const names = imports[1].split(',').map(x => x.trim().split(/\s+as\s+/i)[0]).filter(Boolean);
                    const repeated = names.find((name, i) => names.indexOf(name) !== i);
                    if (repeated) e(lineNum, "Duplicate named import/export '" + repeated + "'.", "Keep each named import/export only once.", "TypeScript syntax", "error");
                }
            }
        }

        // const reassignment is a definite runtime error, including +=/++ variants.
        for (const declaration of constDeclarations) {
            for (let idx = declaration.line - 1; idx < maskedLines.length; idx++) {
                const line = idx === declaration.line - 1
                    ? maskedLines[idx].slice(Math.max(0, maskedLines[idx].indexOf(declaration.name) + declaration.name.length))
                    : maskedLines[idx];
                const assignment = new RegExp("(^|[^.\\w$])" + declaration.name + "\\s*(?:=|\\+=|-=|\\*=|/=|%=|\\+\\+|--)");
                if (assignment.test(line)) {
                    e(idx + 1, "Assignment to const '" + declaration.name + "'.", "Use let if the binding must change, or remove the reassignment.", "JavaScript runtime", "error");
                    break;
                }
            }
        }
        return issues;
    }

    // Returns a copy of `lines` with the contents of strings, char literals, comments,
    // heredocs and other opaque spans replaced by spaces (length and structure preserved).
    // Brackets, operators, identifiers and keywords survive, so per-line keyword checks can
    // match real code without firing on words that merely appear inside a string or comment.
    // This is the multi-language generalisation of maskJavaScriptTypeScript().
    static maskCode(lang, lines) {
        const hashCommentLangs = new Set(['Python', 'Ruby', 'Bash', 'Perl', 'R', 'Nix', 'Julia', 'Elixir', 'HCL', 'GDScript', 'Nim']);
        const percentCommentLangs = new Set(['Erlang', 'Prolog']);
        const semicolonCommentLangs = new Set(['Lisp', 'Clojure', 'Assembly']);
        const dashCommentLangs = new Set(['Haskell', 'Lua', 'SQL']);
        const bangCommentLangs = new Set(['Fortran']);
        const asteriskGtCommentLangs = new Set(['COBOL']);
        const parenStarBlockLangs = new Set(['OCaml', 'F#', 'Pascal']);
        const noSingleQuoteStringLangs = new Set(['Lisp', 'Clojure']);
        const primeIdentLang = lang === 'Rust' || lang === 'Haskell' || lang === 'OCaml' || lang === 'F#';
        // '//' is a line comment only in languages that don't reserve it for something else
        // (Python/Julia use it for division; Nim rejects it; hash/percent/etc. langs never use it).
        const slashComment = !hashCommentLangs.has(lang) && !percentCommentLangs.has(lang)
            && !semicolonCommentLangs.has(lang) && !dashCommentLangs.has(lang) && !bangCommentLangs.has(lang);
        const heredocSkip = this.computeHeredocSkip(lines);
        const podSkip = this.computePodSkip(lines, lang);
        const blank = n => ' '.repeat(n);
        const out = new Array(lines.length);
        let blockCloser = null, haskellDepth = 0, nestedDepth = 0, nestedOpen = null, nestedClose = null;
        let luaClose = null, inString = null, inTriple = null;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (heredocSkip[i] || podSkip[i]) { out[i] = blank(line.length); continue; }
            let res = '';
            for (let j = 0; j < line.length; j++) {
                const ch = line[j], next = line[j + 1];
                if (inTriple) { if (line.slice(j, j + 3) === inTriple) { res += '   '; inTriple = null; j += 2; } else res += ' '; continue; }
                if (haskellDepth) { if (line.slice(j, j + 2) === '{-') { haskellDepth++; res += '  '; j++; } else if (line.slice(j, j + 2) === '-}') { haskellDepth--; res += '  '; j++; } else res += ' '; continue; }
                if (nestedDepth) { if (line.slice(j, j + 2) === nestedOpen) { nestedDepth++; res += '  '; j++; } else if (line.slice(j, j + 2) === nestedClose) { nestedDepth--; res += '  '; j++; } else res += ' '; continue; }
                if (luaClose) { if (line.slice(j, j + luaClose.length) === luaClose) { res += blank(luaClose.length); j += luaClose.length - 1; luaClose = null; } else res += ' '; continue; }
                if (blockCloser) { if (line.slice(j, j + blockCloser.length) === blockCloser) { res += blank(blockCloser.length); j += blockCloser.length - 1; blockCloser = null; } else res += ' '; continue; }
                if (inString) {
                    if (lang === 'SQL' && (inString === "'" || inString === '"') && ch === inString && next === inString) { res += '  '; j++; continue; }
                    if (ch === inString && !this.isEscaped(line, j)) { res += ' '; inString = null; } else res += ' ';
                    continue;
                }
                if (primeIdentLang && ch === "'") {
                    const prev = line[j - 1];
                    if (lang === 'Haskell' && prev && /[A-Za-z0-9_']/.test(prev)) { res += ch; continue; }
                    const m = line.slice(j + 1).match(/^[A-Za-z_]\w*/);
                    if (m && line[j + 1 + m[0].length] !== "'") { res += ch; continue; }
                }
                if (noSingleQuoteStringLangs.has(lang) && ch === "'") { res += ch; continue; }
                if (lang === 'Pascal' && ch === '{') { blockCloser = '}'; res += ' '; continue; }
                if (parenStarBlockLangs.has(lang) && ch === '(' && next === '*') { blockCloser = '*)'; res += '  '; j++; continue; }
                if (lang === 'Haskell' && line.slice(j, j + 2) === '{-') { haskellDepth = 1; res += '  '; j++; continue; }
                if (lang === 'Nim' && line.slice(j, j + 2) === '#[') { nestedDepth = 1; nestedOpen = '#['; nestedClose = ']#'; res += '  '; j++; continue; }
                if (lang === 'Julia' && line.slice(j, j + 2) === '#=') { nestedDepth = 1; nestedOpen = '#='; nestedClose = '=#'; res += '  '; j++; continue; }
                if (lang === 'Lua') { const m = line.slice(j).match(/^(--)?\[(=*)\[/); if (m) { luaClose = ']' + '='.repeat(m[2].length) + ']'; res += blank(m[0].length); j += m[0].length - 1; continue; } }
                if (dashCommentLangs.has(lang) && line.slice(j, j + 2) === '--') { res += blank(line.length - j); break; }
                if (asteriskGtCommentLangs.has(lang) && line.slice(j, j + 2) === '*>') { res += blank(line.length - j); break; }
                if (hashCommentLangs.has(lang) && ch === '#') { res += blank(line.length - j); break; }
                if (percentCommentLangs.has(lang) && ch === '%') { res += blank(line.length - j); break; }
                if (semicolonCommentLangs.has(lang) && ch === ';') { res += blank(line.length - j); break; }
                if (bangCommentLangs.has(lang) && ch === '!') { res += blank(line.length - j); break; }
                if (lang === 'HTML' && line.slice(j, j + 4) === '<!--') { blockCloser = '-->'; res += '    '; j += 3; continue; }
                if (slashComment && ch === '/' && next === '/') { res += blank(line.length - j); break; }
                if (slashComment && ch === '/' && next === '*') { blockCloser = '*/'; res += '  '; j++; continue; }
                if ((ch === '"' || ch === "'") && line.slice(j, j + 3) === ch.repeat(3)) { inTriple = ch.repeat(3); res += '   '; j += 2; continue; }
                if (ch === '"' || ch === "'" || ch === '`') { inString = ch; res += ' '; continue; }
                res += ch;
            }
            out[i] = res;
        }
        return out;
    }
    static scanLanguagePatterns(lang, lines) {
        const issues = [];
        const rawLines = lines;
        const codeLines = this.maskCode(lang, lines);
        const fullCode = lines.join('\n');
        const maskedFull = codeLines.join('\n');
        const e = (ln, msg, hint, kind, sev = "error") => issues.push(this.makeIssue(ln, msg, hint, kind, null, sev));
        const bracketDepths = this.computeBracketDepths(lines);
        const nextNonBlank = (idx) => this.nextNonBlankTrimmed(lines, idx);
        const hclResourceRanges = [];
        if (lang === 'HCL') {
            for (let start = 0; start < codeLines.length; start++) {
                if (!/^\s*resource\s+"[^"]+"\s+"[^"]+"\s*\{/.test(codeLines[start])) continue;
                const baseDepth = bracketDepths.start[start];
                let end = start;
                for (let cursor = start; cursor < codeLines.length; cursor++) {
                    if (cursor > start && bracketDepths.end[cursor] <= baseDepth) { end = cursor; break; }
                    end = cursor;
                }
                hclResourceRanges.push({ start, end });
            }
        }
        const cMemory = (lang === 'C' || lang === 'C++') ? {
            allocations: [...maskedFull.matchAll(/\bmalloc\s*\(/g)].map(match => match.index),
            frees: (maskedFull.match(/\bfree\s*\(/g) || []).length,
            news: lang === 'C++' ? [...maskedFull.matchAll(/\bnew\b/g)].length : 0,
            deletes: lang === 'C++' ? (maskedFull.match(/\bdelete\b/g) || []).length : 0
        } : null;
        // `line`/`trimmed` are string/comment-masked so keyword checks don't fire on text
        // inside strings or comments. `rawLine`/`rawTrimmed` keep the original text for the
        // few checks that must inspect the actual quotes or string contents.
        codeLines.forEach((line, idx) => {
            const lineNum = idx + 1;
            const rawLine = rawLines[idx];
            const rawTrimmed = rawLine.trim();
            const trimmed = line.trim();
            // '//' is a line comment in most languages, but NOT in Nim (which uses '#'),
            // so for Nim we let '//'-lines fall through to be flagged below.
            if (!trimmed || (trimmed.startsWith('//') && lang !== 'Nim') || (trimmed.startsWith('#') && !(lang === 'C' || lang === 'C++') && !/^#\s*include\b/.test(trimmed))) return;
            // Skip bracket-sensitive checks if this line starts inside an open bracket
            // (continuation of a comprehension/condition) or itself opens brackets
            // that stay unclosed at line's end (multi-line def/if signature).
            const insideBrackets = bracketDepths.start[idx] > 0 || bracketDepths.end[idx] > 0;
            if (lang === 'Python') {
                if (!insideBrackets && /^(?:async\s+def|if|elif|else|for|while|def|class|try|except|finally|with|match|case)\b/.test(trimmed) && !trimmed.endsWith(':') && !trimmed.endsWith('\\') && !trimmed.includes('#')) {
                    e(lineNum, "Python block statement is missing a trailing colon.", "Add ':' at the end of the line.", "Python syntax");
                }
                if (/^print\s+[^(\s]/.test(rawTrimmed)) {
                    e(lineNum, "print statement is missing parentheses (Python 3).", "Use print(...) with parentheses.", "Python syntax");
                }
                // Assignment '=' in an if/elif/while condition is a SyntaxError (':=' walrus is fine).
                // Strip strings and balanced brackets first so keyword args like f(x=1) don't trip it.
                const _pyCond = trimmed.match(/^(if|elif|while)\b(.*):\s*(#.*)?$/);
                if (_pyCond) {
                    let cond = _pyCond[2].replace(/"[^"]*"|'[^']*'/g, '');
                    let prev;
                    do { prev = cond; cond = cond.replace(/\([^()]*\)|\[[^\][]*\]|\{[^{}]*\}/g, ''); } while (cond !== prev);
                    if (/(?<![=!<>:+\-*/%&|^])=(?!=)/.test(cond)) {
                        e(lineNum, "Assignment '=' inside a condition is a SyntaxError in Python.", "Use '==' to compare, or ':=' (walrus) if you intend an assignment expression.", "Python syntax");
                    }
                }
                if (/\bxrange\s*\(/.test(trimmed)) {
                    e(lineNum, "'xrange' does not exist in Python 3.", "Replace xrange(...) with range(...).", "Python syntax");
                }
                if (/\b===/.test(trimmed)) {
                    e(lineNum, "Python does not use '===' for comparison.", "Use '==' for equality in Python.", "Language mismatch");
                }
                if (/\b(console\.log|let\s+\w+\s*=|const\s+\w+\s*=|var\s+\w+\s*=)\b/.test(trimmed)) {
                    e(lineNum, "This looks like JavaScript syntax inside a Python file.", "Switch to JavaScript or rewrite using Python syntax.", "Language mismatch");
                }
                if (!insideBrackets && /^\s*def\s+\w+\s*\([^)]*\)\s*$/.test(line)) {
                    e(lineNum, "Python function definition is missing a colon.", "Add ':' after the closing parenthesis.", "Python syntax");
                }
                if (/^except\s+\w+\s*,\s*\w+/.test(trimmed)) {
                    e(lineNum, "Python 2 'except X, e:' syntax is not valid in Python 3.", "Use 'except X as e:' instead.", "Python syntax");
                }
                if (/\bexec\s+["']/.test(trimmed)) {
                    e(lineNum, "'exec' is a function in Python 3, not a statement.", "Use exec(...) with parentheses.", "Python syntax");
                }
                // Only flag operator-at-end if line is a standalone expression (not inside parens/brackets)
                if (/[+\-*/%&|]$/.test(trimmed) && !/\\$/.test(trimmed) && !/[,(\[{]$/.test(trimmed) && /^[a-zA-Z_$]/.test(trimmed)) {
                    e(lineNum, "Line ends with an operator — expression appears incomplete.", "Finish the expression or use a backslash to continue on the next line.", "Python syntax", "warning");
                }
                if (/\beval\s*\(/.test(trimmed)) {
                    e(lineNum, "eval() can execute arbitrary code and is a security risk.", "Avoid eval(); parse data explicitly instead.", "Python security", "warning");
                }
                if (/\btype\s*\(\s*\w+\s*\)\s*==/.test(trimmed)) {
                    e(lineNum, "Comparing types with type() == is fragile.", "Use isinstance(obj, Type) for type checking.", "Python style", "info");
                }
                // Mutable default arguments
                if (/\bdef\s+\w+\s*\([^)]*=\s*[\[{]/.test(trimmed)) {
                    e(lineNum, "Mutable default argument (list or dict) in function definition.", "Use `None` as the default and initialize inside the function body.", "Python bug", "warning");
                }
                // Bare except:
                if (/^except\s*:/.test(trimmed)) {
                    e(lineNum, "Bare `except:` catches all exceptions including KeyboardInterrupt and SystemExit.", "Specify an exception type: `except Exception as e:`.", "Python error handling", "warning");
                }
                // == None instead of is None
                if (/==\s*None\b/.test(trimmed)) {
                    e(lineNum, "Using `== None` is not idiomatic Python.", "Use `is None` to check for None values.", "Python style", "warning");
                }
                // == True / == False
                if (/==\s*(True|False)\b/.test(trimmed)) {
                    e(lineNum, "Comparing to True/False with `==` is unnecessary.", "Use the value directly: `if x:` instead of `if x == True:`.", "Python style", "info");
                }
                // NEW: Shadowed built-ins
                const shadowedBuiltins = ['list','dict','set','type','id','input','print','open','range','len','str','int','float','bool'];
                for (const bi of shadowedBuiltins) {
                    if (new RegExp(`^(${bi})\\s*=(?!=)`, 'i').test(trimmed) || new RegExp(`\\b(for|with)\\s+${bi}\\s+in\\b`).test(trimmed)) {
                        e(lineNum, `'${bi}' is a Python built-in — shadowing it hides the built-in.`, `Rename this variable to avoid hiding the built-in '${bi}'.`, "Python style", "warning");
                        break;
                    }
                }
                // NEW: Swallowed exception: except Exception as e: pass
                if (/^except\s+\w+(\s+as\s+\w+)?\s*:/.test(trimmed)) {
                    const nextTrimmed = (lines[idx + 1] || '').trim();
                    if (nextTrimmed === 'pass') {
                        e(lineNum, "Exception caught but immediately silenced with 'pass'.", "Log or handle the exception; silently swallowing errors hides bugs.", "Python error handling", "warning");
                    }
                }
                // NEW: String concatenation in loop
                if (/^\s*(for|while)\b/.test(line)) {
                    // Look ahead for += with string context
                    for (let j = idx + 1; j < Math.min(idx + 30, lines.length); j++) {
                        const inner = lines[j].trim();
                        if (/\w+\s*\+=\s*["'\w]/.test(inner) && !/^\s*(for|while|def|class)\b/.test(inner)) {
                            e(j + 1, "String concatenation with '+=' inside a loop is O(n²).", "Collect parts in a list and use ''.join(parts) after the loop.", "Python performance", "warning");
                            break;
                        }
                        if (/^(for|while|def|class)\b/.test(inner) || /^(return|break|continue)\b/.test(inner)) break;
                    }
                }
                // NEW: range(len(x)) — suggest enumerate
                if (/\brange\s*\(\s*len\s*\(/.test(trimmed)) {
                    e(lineNum, "range(len(x)) is a common anti-pattern.", "Use enumerate(x) to get both index and value: for i, v in enumerate(x).", "Python style", "info");
                }
                // NEW: global variable declaration
                if (/^global\s+\w+/.test(trimmed)) {
                    e(lineNum, "'global' variable declaration found.", "Avoid global state; pass values as parameters or use class attributes.", "Python style", "info");
                }
                // NEW: Unreachable code after return at same indent
                if (/^return\b/.test(trimmed)) {
                    const currentIndent = (line.match(/^(\s*)/) || ['',''])[1].length;
                    for (let j = idx + 1; j < lines.length; j++) {
                        const nextLine = lines[j];
                        const nextTrimmed = nextLine.trim();
                        if (!nextTrimmed || nextTrimmed.startsWith('#')) continue;
                        const nextIndent = (nextLine.match(/^(\s*)/) || ['',''])[1].length;
                        if (nextIndent === currentIndent && !/^(def|class|elif|else|except|finally)\b/.test(nextTrimmed)) {
                            e(j + 1, "Unreachable code after 'return' at the same indentation level.", "Remove or relocate this code — it will never execute.", "Python logic", "warning");
                        }
                        break;
                    }
                }
                // open() without a 'with' statement — file may not be closed
                if (/\bopen\s*\(/.test(trimmed) && !/^\s*with\b/.test(line)) {
                    const context = lines.slice(Math.max(0, idx - 2), idx + 1).join(' ');
                    if (!/\bwith\b/.test(context)) {
                        e(lineNum, "open() called without a 'with' statement — the file may not be closed on error.", "Use: with open(file) as f: to ensure the file is always closed.", "Python resource", "warning");
                    }
                }
                // f-string with no {} interpolation — prefix is pointless
                if (/\bf["']/.test(rawTrimmed) && !/\{/.test(rawTrimmed.replace(/\\{/g, ''))) {
                    e(lineNum, "f-string has no {} placeholders — the 'f' prefix does nothing here.", "Remove the 'f' prefix or add a {variable} placeholder inside the string.", "Python style", "info");
                }
                // 'is' used for value equality (not None/True/False)
                if (/\bis\s+(?!None\b|True\b|False\b|not\b)["'\d]/.test(trimmed)) {
                    e(lineNum, "'is' checks object identity, not value equality.", "Use '==' to compare values; reserve 'is' for None, True, and False.", "Python logic", "warning");
                }
            } else if (lang === 'Javascript' || lang === 'TypeScript') {
                const condMatch = trimmed.match(/\b(if|while)\s*\((.*)\)/);
                if (condMatch && /(^|[^=!<>])=([^=>]|$)/.test(condMatch[2])) {
                    e(lineNum, "Possible assignment '=' inside a condition — did you mean '==='?", "Use '===' for comparison, or wrap '(x = val)' in extra parens if intentional.", "JavaScript logic", "warning");
                }
                // Invalid typeof comparison string — a typo makes the check always false
                const _typeofM = rawTrimmed.match(/\btypeof\s+[\w.$[\]'"]+\s*[=!]==?\s*["']([^"']*)["']/);
                if (_typeofM) {
                    const validTypeof = ['undefined', 'object', 'boolean', 'number', 'bigint', 'string', 'symbol', 'function'];
                    if (!validTypeof.includes(_typeofM[1])) {
                        e(lineNum, `"${_typeofM[1]}" is not a valid typeof result — this comparison is always false.`, "Valid typeof values: undefined, object, boolean, number, bigint, string, symbol, function.", "JavaScript logic", "error");
                    }
                }
                // Comparing a value to itself is always true (likely a typo). Note: 'x !== x'
                // is a deliberate NaN idiom, so only flag the '=='/'===' forms.
                const _selfCmp = trimmed.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""').match(/([A-Za-z_$][\w$.]*)\s*(===|==)\s*([A-Za-z_$][\w$.]*)/);
                if (_selfCmp && _selfCmp[1] === _selfCmp[3] && !/\b(true|false|null|undefined|NaN)\b/.test(_selfCmp[1])) {
                    e(lineNum, `'${_selfCmp[1]}' is compared to itself — this is always true.`, "This is likely a typo; compare against the value you actually meant.", "JavaScript logic", "warning");
                }
                if (/\b(const|let|var)\s+[A-Za-z_$][\w$]*\s*=$/.test(trimmed)) {
                    const nt = nextNonBlank(idx);
                    // A value continuing on the next line (e.g. "const x =\n  compute();") is valid —
                    // only flag when nothing follows or the next line clearly starts a new statement.
                    if (!nt || /^(const|let|var|function|class|if|for|while|switch|return|}|export|import)\b/.test(nt)) {
                        e(lineNum, "Variable declaration is missing a value after '='.", "Add the assigned value or remove the '='.", "JavaScript syntax");
                    }
                }
                if (/^\s*(if|while|for)\s+[^(\s]/.test(line) && !/^\s*for\s+await\b/.test(line)) {
                    e(lineNum, "Control statement condition must be wrapped in parentheses.", "Add ( ) around the condition.", "JavaScript syntax");
                }
                if (/^\s*(def|elif)\b/.test(line)) {
                    e(lineNum, "This looks like Python syntax inside a JavaScript file.", "Switch to Python or rewrite using JavaScript syntax.", "Language mismatch");
                }
                const moduleSyntax = /(^|\n)\s*(?:import\b|export\b)/m.test(maskedFull);
                if (/\bawait\b/.test(trimmed) && !moduleSyntax && !/\basync\b/.test(fullCode.slice(0, rawLines.slice(0, idx).join('\n').length).slice(-600))) {
                    e(lineNum, "'await' used outside an async function.", "Mark the enclosing function with 'async'.", "JavaScript async", "warning");
                }
                // Loose equality == — strip strings/comments, use lookbehind to avoid matching === or !==
                const _eqStripped = trimmed.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""').replace(/\/\/.*$/, '');
                if (/(?<![=!<>])==(?!=)/.test(_eqStripped)) {
                    e(lineNum, "Loose equality '==' found — use '===' for strict equality.", "Replace '==' with '===' to avoid unexpected type coercion.", "JavaScript logic", "warning");
                }
                if (/\bvar\b/.test(trimmed)) {
                    e(lineNum, "'var' is function-scoped and hoisted — can cause subtle bugs.", "Use 'const' or 'let' instead.", "JavaScript style", "warning");
                }
                // console.log left in code
                if (/\bconsole\.log\s*\(/.test(trimmed)) {
                    e(lineNum, "console.log() debug statement left in code.", "Remove or replace with a proper logging solution before shipping.", "JavaScript debug", "info");
                }
                // typeof x == "undefined"
                if (/\btypeof\s+\w[\w.]*\s*==\s*["']undefined["']/.test(rawTrimmed)) {
                    e(lineNum, "typeof x == \"undefined\" is unnecessary.", "Use `typeof x === \"undefined\"` (or `typeof x !== \"undefined\"`) so an undeclared name remains safe to test.", "JavaScript style", "info");
                }
                // Empty catch block
                if (/\bcatch\s*\(\s*\w+\s*\)\s*\{\s*\}/.test(trimmed)) {
                    e(lineNum, "Empty catch block silently swallows errors.", "Log or handle the error inside the catch block.", "JavaScript error handling", "warning");
                }
                // Unreachable code after return/throw/break on same block level (simple heuristic)
                // Skip when this statement leaves a bracket open — e.g. "return (" continuing
                // onto following lines is a multi-line return value, not a complete statement.
                if (/^\s*(return|throw|break)\b/.test(line) && bracketDepths.end[idx] === bracketDepths.start[idx]) {
                    const nextLine = lines[idx + 1];
                    if (nextLine) {
                        const nextTrimmed = nextLine.trim();
                        if (nextTrimmed && !nextTrimmed.startsWith('}') && !nextTrimmed.startsWith('//') && !nextTrimmed.startsWith('/*') && !nextTrimmed.startsWith('case ') && !nextTrimmed.startsWith('default:') && nextLine.match(/^(\s*)/)[1].length >= line.match(/^(\s*)/)[1].length) {
                            e(lineNum + 1, "Unreachable code after return/throw/break statement.", "Remove or relocate this code — it will never be executed.", "JavaScript logic", "warning");
                        }
                    }
                }
                if (/\bdocument\.write\s*\(/.test(trimmed)) {
                    e(lineNum, "document.write() can erase the whole page when called after load.", "Use DOM methods like appendChild or innerHTML instead.", "JavaScript security", "warning");
                }
                if (/\beval\s*\(/.test(trimmed)) {
                    e(lineNum, "eval() executes arbitrary code and is a security risk.", "Find a safer alternative — JSON.parse, Function constructor, or a proper parser.", "JavaScript security", "warning");
                }
                if (/\bnew\s+Array\s*\(\d+\)/.test(trimmed)) {
                    e(lineNum, "new Array(n) creates a sparse array, not n copies of a value.", "Use Array.from({length: n}, () => val) or Array(n).fill(val) for filled arrays.", "JavaScript style", "info");
                }
                if (lang === 'TypeScript' && /\binterface\s+[A-Za-z_$][\w$]*\s*$/.test(trimmed)) {
                    e(lineNum, "TypeScript interface declaration is missing a body.", "Add { ... } after the interface name.", "TypeScript syntax");
                }
                if (lang === 'TypeScript' && /:\s*any\b/.test(trimmed)) {
                    e(lineNum, "Type 'any' disables type checking for this value.", "Replace 'any' with a specific type.", "TypeScript style", "warning");
                }
                if (lang === 'TypeScript' && /\bas\s+any\b/.test(trimmed)) {
                    e(lineNum, "'as any' type assertion bypasses TypeScript safety.", "Use a more specific type assertion or narrow the type properly.", "TypeScript style", "warning");
                }
                // Invalid variable declarations: var/let/const with no identifier
                if (/^\s*(var|let|const)\s*[;=,]/.test(line) || /^\s*(var|let|const)\s*$/.test(trimmed)) {
                    e(lineNum, `'${trimmed.split(/\s/)[0]}' declaration is missing a variable name.`, `Add a variable name after '${trimmed.split(/\s/)[0]}'.`, "JavaScript syntax");
                }
                // Missing semicolons — only flag the most obvious single-line cases
                // (avoid flagging multiline expressions, arrow functions, etc.)
                if (
                    !/[;{},\\:(\[<]$/.test(trimmed) &&
                    !trimmed.endsWith('*/') &&
                    !/^\s*\/[/*]/.test(line) &&
                    /^\w[\w$.]*\s*(\+\+|--)$/.test(trimmed)
                ) {
                    e(lineNum, `Statement appears to be missing a semicolon.`, "Add ';' at the end of this statement.", "JavaScript syntax", "warning");
                }
                // Invalid function declarations: 'function' keyword with no name and no assignment context
                if (/^\s*function\s*\(/.test(line) && !/[=:(,]/.test(line.slice(0, line.indexOf('function')))) {
                    e(lineNum, "Function declaration is missing a name.", "Add a function name after 'function', or assign this expression to a variable.", "JavaScript syntax");
                }
                // Invalid function declarations: function keyword followed immediately by non-identifier
                if (/\bfunction\s+[^a-zA-Z_$(\s]/.test(trimmed)) {
                    e(lineNum, "Invalid function name — function names must start with a letter, '$', or '_'.", "Fix the function name.", "JavaScript syntax");
                }
                // arguments in arrow function — only flag if the current line itself is inside an arrow function
                if (/\barguments\b/.test(trimmed) && /=>\s*[\w{(]/.test(line)) {
                    e(lineNum, "'arguments' object is not available in arrow functions.", "Use rest parameters (...args) instead of 'arguments' in arrow functions.", "JavaScript error", "error");
                }
                // NEW: delete on variable (not property)
                if (/\bdelete\s+[a-zA-Z_$][\w$]*\s*[;,)\n]/.test(trimmed) && !/\bdelete\s+\w[\w$]*\./.test(trimmed) && !/\bdelete\s+\w[\w$]*\[/.test(trimmed)) {
                    e(lineNum, "'delete' on a variable is a no-op — it always returns true but does nothing.", "Use 'delete obj.prop' to remove object properties; variables cannot be deleted.", "JavaScript logic", "warning");
                }
                // NEW: for...in on arrays
                if (/\bfor\s*\(\s*(var|let|const)\s+\w+\s+in\s+/.test(trimmed)) {
                    e(lineNum, "for...in loop on an array iterates keys, not values, and includes inherited properties.", "Use for...of or .forEach() to iterate array values.", "JavaScript logic", "warning");
                }
                // NEW: .bind(this) — suggest arrow function
                if (/\.bind\s*\(\s*this\s*\)/.test(trimmed)) {
                    e(lineNum, ".bind(this) is often unnecessary with arrow functions.", "Consider converting the callback to an arrow function to lexically bind 'this'.", "JavaScript style", "info");
                }
                // NEW: .then() without .catch()
                if (/\.then\s*\(/.test(trimmed) && !/\.catch\s*\(/.test(trimmed) && !/\.catch\s*\(/.test((lines[idx + 1] || '') + (lines[idx + 2] || ''))) {
                    e(lineNum, "Promise .then() without a .catch() — unhandled rejections can crash silently.", "Add .catch(err => ...) or use async/await with try/catch.", "JavaScript async", "warning");
                }
                // NEW: parseInt without radix
                if (/\bparseInt\s*\(\s*[^,)]+\s*\)/.test(trimmed) && !/\bparseInt\s*\([^)]+,[^)]+\)/.test(trimmed)) {
                    e(lineNum, "parseInt() called without a radix argument.", "Always specify the radix: parseInt(str, 10) to avoid octal/hex surprises.", "JavaScript style", "warning");
                }
                // NEW: assignment to undefined (but not the comparisons 'undefined ==' / 'undefined ===')
                if (/\bundefined\s*=(?!=)/.test(trimmed)) {
                    e(lineNum, "Assigning to 'undefined' is not allowed in strict mode and is always wrong.", "Do not reassign 'undefined'; use a different variable name.", "JavaScript error", "error");
                }
                // NEW: NaN === NaN
                if (/\bNaN\s*===\s*NaN\b|\bNaN\s*==\s*NaN\b/.test(trimmed)) {
                    e(lineNum, "NaN === NaN is always false — NaN is never equal to itself.", "Use Number.isNaN(value) or isNaN(value) to check for NaN.", "JavaScript logic", "error");
                }
                // NEW: with() statement
                if (/^\s*with\s*\(/.test(line)) {
                    e(lineNum, "'with' statement is forbidden in strict mode and creates unpredictable scoping.", "Rewrite using explicit variable references instead of 'with'.", "JavaScript error", "error");
                }
                // NEW: duplicate case values (scan ahead)
                if (/^switch\s*\(/.test(trimmed)) {
                    const caseValues = new Set();
                    for (const entry of switchInfo(idx).cases) {
                        if (caseValues.has(entry.value)) e(entry.line, `Duplicate case value '${entry.value}' in switch statement.`, "Each case value should be unique; duplicate cases are unreachable.", "JavaScript logic", "warning");
                        caseValues.add(entry.value);
                    }
                }
                // NEW: shadowed variables — only flag when the earlier declaration is in an
                // ENCLOSING scope (strictly shallower bracket depth), never a sibling block.
                if (/^\s*(let|const)\s+(\w+)/.test(line)) {
                    const varMatch = line.match(/^\s*(?:let|const)\s+(\w+)/);
                    if (varMatch) {
                        const varName = varMatch[1];
                        const curDepth = bracketDepths.start[idx];
                        const declRe = new RegExp(`^\\s*(?:let|const|var)\\s+${varName}\\b`);
                        for (let j = 0; j < idx; j++) {
                            if (declRe.test(lines[j]) && bracketDepths.start[j] < curDepth) {
                                e(lineNum, `Variable '${varName}' shadows an outer declaration from line ${j + 1}.`, `Rename this '${varName}' to avoid shadowing the outer variable and potential confusion.`, "JavaScript logic", "info");
                                break;
                            }
                        }
                    }
                }
                // setTimeout/setInterval with a string argument (behaves like eval)
                if (/\b(setTimeout|setInterval)\s*\(\s*["']/.test(rawTrimmed)) {
                    e(lineNum, "setTimeout/setInterval with a string argument runs code like eval().", "Pass an arrow function instead: setTimeout(() => { ... }, delay).", "JavaScript security", "warning");
                }
                // Nested ternary operators (two or more ? in one line)
                const _ternaryStripped = trimmed.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""');
                if ((_ternaryStripped.match(/\?/g) || []).length >= 2) {
                    e(lineNum, "Nested ternary operators reduce readability.", "Extract into named variables or use if/else for multi-branch logic.", "JavaScript style", "info");
                }
                // JSON.parse without a try/catch nearby
                if (/\bJSON\.parse\s*\(/.test(trimmed)) {
                    const nearby = lines.slice(Math.max(0, idx - 4), Math.min(lines.length, idx + 4)).join('\n');
                    if (!/\btry\b/.test(nearby)) {
                        e(lineNum, "JSON.parse() can throw on malformed input — no try/catch found nearby.", "Wrap JSON.parse() in try/catch or use a safe parse helper.", "JavaScript error handling", "warning");
                    }
                }
                // Object spread vs Object.assign({}, ...) mutating first arg
                if (/\bObject\.assign\s*\(\s*\w[\w.]*\s*,/.test(trimmed) && !/Object\.assign\s*\(\s*\{\s*\}/.test(trimmed)) {
                    e(lineNum, "Object.assign() mutates the first argument — this may be unintentional.", "Pass {} as the first argument to create a new object: Object.assign({}, source).", "JavaScript logic", "warning");
                }
            } else if (lang === 'Java') {
                if (/public\s+class\s+[A-Za-z_]\w*/.test(trimmed) && !/[{;]/.test(trimmed) && !/^\s*\{/.test(nextNonBlank(idx)) && !/^(extends|implements)\b/.test(nextNonBlank(idx))) {
                    e(lineNum, "Java class declaration is missing an opening brace.", "Add '{' after the class name.", "Java syntax");
                }
                if (/System\.out\.print(?:ln)?\s+["']/.test(rawTrimmed)) {
                    e(lineNum, "Java print call is missing parentheses.", "Use System.out.println(...).", "Java syntax");
                }
                // String comparison with '==' — a string literal on either side means one operand
                // is a String, so '==' compares references. Double-quotes only: 'char == \\'x\\'' is valid.
                if (/[\w)\]]\s*==\s*"/.test(rawTrimmed) || /"\s*==\s*[\w("]/.test(rawTrimmed)) {
                    e(lineNum, "String comparison with '==' compares references, not content.", "Use .equals() or .equalsIgnoreCase() to compare String values.", "Java logic", "warning");
                }
                if (/\bcatch\s*\(\s*Exception\s+\w+\s*\)/.test(trimmed)) {
                    e(lineNum, "Catching 'Exception' is too broad and hides real errors.", "Catch the specific exception type your code can throw.", "Java style", "info");
                }
                if (/\bnew\s+\w+\s*\(\s*\)\s*$/.test(trimmed) && !/^\s*(return|=)/.test(trimmed) && !/^\./.test(nextNonBlank(idx))) {
                    e(lineNum, "Object created with 'new' but result is not used.", "Assign the object to a variable or remove the statement.", "Java logic", "warning");
                }
            } else if (lang === 'C++' || lang === 'C') {
                if (/^\s*#include\s+[A-Za-z0-9_./]+\s*$/.test(line) && !/</.test(line) && !/"/.test(line)) {
                    e(lineNum, "Include directive is missing angle brackets or quotes.", "Use #include <header> for system headers or #include \"file.h\" for local files.", "C/C++ syntax");
                }
                if (/\b(int|float|double|char|bool|long|short|void)\s+\w+\s*\([^)]*\)\s*$/.test(trimmed) && nextNonBlank(idx) !== '{') {
                    e(lineNum, "Function declaration or definition is missing ';' or '{'.", "Add ';' for a prototype or '{...}' for a function body.", "C/C++ syntax");
                }
                const scanfCall = rawTrimmed.match(/\b(?:f?scanf|sscanf)\s*\(\s*["']([^"']*)["']\s*,\s*([\s\S]*)\)\s*;?$/);
                if (scanfCall && scanfCall[2].trim() && !/^&\s*[A-Za-z_]\w*/.test(scanfCall[2].trim())) {
                    e(lineNum, "scanf argument may be missing '&' address-of operator.", "Pass the address of the variable: scanf(\"%d\", &var).", "C/C++ syntax");
                }
                if (false && /\bmalloc\s*\(/.test(trimmed) && !/\bfree\s*\(/.test(maskedFull)) {
                    e(lineNum, "malloc() called but no matching free() found in the file.", "Always free() every malloc() allocation to prevent memory leaks.", "C/C++ memory", "warning");
                }
                if ((lang === 'C' || lang === 'C++') && /\bgets\s*\(/.test(trimmed)) {
                    e(lineNum, "gets() is unsafe and removed in C11.", "Use fgets(buf, size, stdin) instead.", "C/C++ security", "warning");
                }
                if (false && lang === 'C++' && /\bnew\b/.test(trimmed) && !/\bdelete\b/.test(maskedFull)) {
                    e(lineNum, "'new' used but no 'delete' found — possible memory leak.", "Match every 'new' with a 'delete' or use smart pointers (unique_ptr).", "C++ memory", "warning");
                }
            } else if (lang === 'Go') {
                if (/^\s*func\s+\w+\s*\([^)]*$/.test(line)) {
                    // Multi-line param lists are normal Go style — only flag if the
                    // opened parenthesis never closes within a reasonable window.
                    const startDepth = bracketDepths.start[idx];
                    const closesSoon = lines.slice(idx + 1, Math.min(idx + 20, lines.length)).some((_, k) => bracketDepths.end[idx + 1 + k] <= startDepth);
                    if (!closesSoon) {
                        e(lineNum, "Go function signature appears incomplete.", "Close the parameter list with ')' and add the opening brace.", "Go syntax");
                    }
                }
                if (/fmt\.Print(?:ln|f)?\s+["']/.test(rawTrimmed)) {
                    e(lineNum, "Go print call is missing parentheses.", "Use fmt.Println(...).", "Go syntax");
                }
                if (/\b:=\b/.test(trimmed) && /^\s*(if|for|switch)\b/.test(line)) {
                    e(lineNum, "Variable declared with ':=' inside a control statement is block-scoped.", "Declare the variable before the block with 'var' if you need it outside.", "Go scope", "warning");
                }
                // Accept both Go import forms: import "fmt" and a parenthesized block.
                // Report at most once, and only when a fmt call is actually present.
                const hasFmtImport = /\bimport\s+(?:["']fmt["']|\([\s\S]*?["']fmt["'][\s\S]*?\))/.test(fullCode);
                const firstFmtUse = lines.findIndex(l => /\bfmt\./.test(l));
                if (idx === firstFmtUse && firstFmtUse >= 0 && !hasFmtImport) {
                    e(lineNum, "fmt package may not be imported.", "Add \"fmt\" to your import block.", "Go imports", "warning");
                }
                if (/\berr\b/.test(trimmed) && /,\s*err\s*:=/.test(trimmed) && !/if\s+err/.test(lines.slice(idx + 1, idx + 3).join(' '))) {
                    e(lineNum, "Error return value 'err' may not be checked.", "Add 'if err != nil { ... }' after this call.", "Go error handling", "warning");
                }
            } else if (lang === 'Rust') {
                if (/\bprintln\s*\(/.test(trimmed) && !/\bprintln!\s*\(/.test(trimmed)) {
                    e(lineNum, "Rust macros require '!' — use println!(...) not println(...).", "Add '!' after println.", "Rust syntax");
                }
                if (/\bpanic\s*\(/.test(trimmed) && !/\bpanic!\s*\(/.test(trimmed)) {
                    e(lineNum, "panic is a macro in Rust — use panic!(...).", "Add '!' after panic.", "Rust syntax");
                }
                if (/\bfn\s+\w+\s*\([^)]*\)\s*$/.test(trimmed) && !/^(->|\{)/.test(nextNonBlank(idx))) {
                    e(lineNum, "Rust function is missing a body.", "Add { ... } after the function signature.", "Rust syntax");
                }
                if (/\bunwrap\s*\(\s*\)/.test(trimmed)) {
                    e(lineNum, "unwrap() will panic if the value is None or Err.", "Use match, if let, or unwrap_or_else() to handle errors safely.", "Rust error handling", "warning");
                }
                if (/\bclone\s*\(\s*\)/.test(trimmed)) {
                    e(lineNum, "Calling clone() — make sure this is necessary and not avoidable with borrowing.", "Consider passing a reference (&val) instead of cloning if ownership isn't required.", "Rust performance", "info");
                }
            } else if (lang === 'PHP') {
                if (/^\s*[A-Za-z_]\w*\s*=/.test(line) && !/^\s*\$/.test(line) && !/^\s*(if|else|for|while|foreach|function|class|return|echo|namespace|use)\b/.test(line)) {
                    e(lineNum, "PHP variables must start with '$'.", "Change 'name' to '$name'.", "PHP syntax");
                }
                if (!/;\s*$/.test(trimmed) && /^\s*(echo|print|return|\$\w+\s*=)/.test(line)) {
                    const selfContained = bracketDepths.end[idx] === bracketDepths.start[idx];
                    const endsWithContinuation = /[.+\-*/&|,(\[]$/.test(trimmed);
                    const opensHeredoc = /<<<\s*['"]?[A-Za-z_]\w*['"]?\s*$/.test(trimmed);
                    if (selfContained && !endsWithContinuation && !opensHeredoc) {
                        e(lineNum, "PHP statement may be missing a semicolon.", "Add ';' at the end of the line.", "PHP syntax");
                    }
                }
                if (/\bmysql_/.test(trimmed)) {
                    e(lineNum, "mysql_*() functions are removed in PHP 7+.", "Use mysqli_*() or PDO instead.", "PHP syntax");
                }
                if (/\beval\s*\(/.test(trimmed)) {
                    e(lineNum, "eval() is dangerous in PHP and can lead to remote code execution.", "Avoid eval(); use safer alternatives.", "PHP security", "warning");
                }
            } else if (lang === 'Ruby') {
                // Ruby 3+ "endless method" (def foo(x) = x * 2) needs no 'end' at all.
                const isEndlessMethod = /^def\s+[\w.]+\s*(\([^)]*\))?\s*=\s*.+$/.test(trimmed);
                let rubyMethodClosed = isEndlessMethod;
                if (!rubyMethodClosed && /^\s*def\b/.test(trimmed)) {
                    let depth = 0;
                    for (let j = idx; j < lines.length; j++) {
                        const rubyLine = codeLines[j].trim();
                        if (/^(?:def|class|module|if|unless|case|while|until|for|begin)\b/.test(rubyLine)) depth++;
                        if (/\bdo(?:\s*\|[^|]*\|)?\s*$/.test(rubyLine)) depth++;
                        depth -= (rubyLine.match(/\bend\b/g) || []).length;
                        if (depth <= 0) { rubyMethodClosed = true; break; }
                    }
                }
                if (/\bdef\s+\w+/.test(trimmed) && !rubyMethodClosed) {
                    e(lineNum, "Ruby method defined with 'def' may be missing a closing 'end'.", "Add 'end' after the method body.", "Ruby syntax");
                }
                if (/\bputs\s*\(/.test(trimmed)) {
                    e(lineNum, "'puts(...)' with parentheses is valid but 'puts ...' is idiomatic Ruby.", "Drop the parentheses: puts value.", "Ruby style", "info");
                }
                if (/\brescue\s*$/.test(trimmed)) {
                    e(lineNum, "Bare 'rescue' catches all exceptions including system errors.", "Rescue a specific exception class: rescue SomeError => e.", "Ruby style", "warning");
                }
            } else if (lang === 'Groovy') {
                if (/\bdef\s+\w+\s*\([^)]*\)/.test(trimmed) && !/\{/.test(trimmed) && !/=\s*$/.test(trimmed) && nextNonBlank(idx) !== '{') {
                    e(lineNum, "Groovy method definition may be missing a body.", "Add a '{...}' block after the parameter list.", "Groovy syntax");
                }
                if (/\beval\s*\(/.test(trimmed)) {
                    e(lineNum, "eval() is a security risk in Groovy — it executes arbitrary code.", "Avoid eval(); use explicit logic instead.", "Groovy security", "warning");
                }
                if (/\bnew\s+\w+\s*\(\s*\)\s*$/.test(trimmed) && !/[=;,)]/.test(trimmed.slice(-2)) && !/^\./.test(nextNonBlank(idx))) {
                    e(lineNum, "Object instantiation result is discarded.", "Assign the result: def obj = new Foo().", "Groovy style", "warning");
                }
                if (/^import\s+static\s+\S+\.\*/.test(trimmed)) {
                    e(lineNum, "Wildcard static import makes it hard to trace where symbols come from.", "Import only the specific members you need.", "Groovy style", "info");
                }
            } else if (lang === 'Apex') {
                if (/\bSystem\.debug\s*\(/.test(trimmed)) {
                    e(lineNum, "System.debug() left in production code.", "Remove debug statements before deploying to production.", "Apex style", "warning");
                }
                if (/\bSOQL\b/.test(trimmed) || /\[\s*SELECT\b/i.test(trimmed)) {
                    if (/^\s*for\s*\(/.test(lines[idx - 1] || '') === false && /^\s*(for|while)\b/.test(lines[idx - 1] || '')) {
                        e(lineNum, "SOQL query inside a loop can hit governor limits.", "Move the query outside the loop and process results with a collection.", "Apex governor limits", "warning");
                    }
                }
                if (/\[\s*SELECT\b/i.test(trimmed) && /^\s*(for|while)\b/.test(lines[idx > 0 ? idx - 1 : 0] || '')) {
                    e(lineNum, "SOQL query inside a loop will hit Salesforce governor limits.", "Bulkify: query once outside the loop and iterate the result list.", "Apex governor limits", "warning");
                }
                if (/\bwithout\s+sharing\b/i.test(trimmed)) {
                    e(lineNum, "'without sharing' bypasses Salesforce record-level security.", "Use 'with sharing' unless you have a specific reason to bypass sharing rules.", "Apex security", "warning");
                }
                if (/\bDML\b/.test(trimmed) || /\b(insert|update|delete|upsert)\s+\w/i.test(trimmed)) {
                    if (/^\s*(for|while)\b/.test(lines[idx > 0 ? idx - 1 : 0] || '')) {
                        e(lineNum, "DML inside a loop will hit Salesforce governor limits.", "Collect records in a List and perform DML once outside the loop.", "Apex governor limits", "warning");
                    }
                }
                if (/\bcatch\s*\(\s*Exception\s+e\s*\)/.test(trimmed)) {
                    const next = (lines[idx + 1] || '').trim();
                    if (next === '' || next === '}') {
                        e(lineNum, "Caught exception is silently swallowed.", "Log or rethrow the exception so failures are visible.", "Apex error handling", "warning");
                    }
                }
            } else if (lang === 'GDScript') {
                if (!insideBrackets && /^(if|elif|else|for|while|func|class|match)\b/.test(trimmed) && !trimmed.endsWith(':') && !trimmed.endsWith('\\')) {
                    e(lineNum, "GDScript block statement is missing a trailing colon.", "Add ':' at the end of the line.", "GDScript syntax");
                }
                if (!insideBrackets && /^func\s+\w+/.test(trimmed) && !trimmed.endsWith(':')) {
                    e(lineNum, "GDScript function definition is missing a trailing colon.", "End the func line with ':'.", "GDScript syntax");
                }
                if (/\bprint\s*\(/.test(trimmed)) {
                    e(lineNum, "print() is fine for debugging but should be removed in released builds.", "Remove or replace with push_warning() / push_error() for production.", "GDScript style", "info");
                }
                if (false && /\bsetget\b/.test(trimmed)) {
                    e(lineNum, "'setget' is Godot 3 syntax — use @export and property setter/getter in Godot 4.", "Replace setget with a Godot 4 property: var x: int: get: return _x", "GDScript version", "warning");
                }
                if (false && /\bonready\b/.test(trimmed)) {
                    e(lineNum, "'onready' is Godot 3 syntax — use @onready in Godot 4.", "Replace 'onready var' with '@onready var'.", "GDScript version", "warning");
                }
                if (/^\s*var\s+\w+\s*=\s*(null|0|false|"")\s*$/.test(line)) {
                    e(lineNum, "Variable initialised to a zero value — consider adding a type hint.", "Use 'var x: Type = value' for clearer, type-safe code.", "GDScript style", "info");
                }
            } else if (lang === 'Solidity') {
                if (/\bpragma\s+solidity\b/i.test(trimmed) && /\^\s*0\.[1-7]\./.test(trimmed)) {
                    e(lineNum, "Pragma targets a Solidity version older than 0.8 — lacking built-in overflow checks.", "Upgrade to pragma solidity ^0.8.0 or newer.", "Solidity version", "warning");
                }
                if (/\btx\.origin\b/.test(trimmed)) {
                    e(lineNum, "tx.origin is vulnerable to phishing attacks — it identifies the original EOA, not the direct caller.", "Use msg.sender for authorization checks instead of tx.origin.", "Solidity security", "error");
                }
                if (/\.call\s*\{[^}]*\}\s*\(/.test(trimmed) || /\.call\s*\(/.test(trimmed)) {
                    e(lineNum, "Low-level .call() forwards all gas and can enable reentrancy attacks.", "Check return value, use reentrancy guards, or prefer transfer()/send().", "Solidity security", "warning");
                }
                if (/\bsuicide\s*\(/.test(trimmed)) {
                    e(lineNum, "'suicide()' is deprecated — use 'selfdestruct()' instead.", "Replace suicide() with selfdestruct(addr).", "Solidity syntax");
                }
                if (/\bblock\.timestamp\b/.test(trimmed) || /\bnow\b/.test(trimmed)) {
                    e(lineNum, "block.timestamp can be manipulated by miners within ~15 seconds.", "Avoid using block.timestamp for randomness or exact timing logic.", "Solidity security", "warning");
                }
                if (!insideBrackets && /\bpublic\b/.test(trimmed) && /\bfunction\b/.test(trimmed) && !/\b(view|pure|returns|payable)\b/.test(trimmed)) {
                    e(lineNum, "Public function with no visibility modifier on state mutation.", "Add 'view', 'pure', or 'payable' as appropriate, or restrict to 'external'.", "Solidity style", "info");
                }
                if (/\bfloat\b|\bdouble\b/.test(trimmed)) {
                    e(lineNum, "Solidity has no floating-point types.", "Use uint/int with fixed-point arithmetic or a library like PRBMath.", "Solidity syntax");
                }
            } else if (lang === 'Nix') {
                const letPos = trimmed.search(/\blet\b/);
                const letTail = letPos >= 0 ? trimmed.slice(letPos + 3) : '';
                if (letPos >= 0 && !/\bin\b/.test(letTail) && !lines.slice(idx + 1, idx + 40).some(l => /\bin\b/.test(l))) {
                    e(lineNum, "'let' expression is missing a corresponding 'in'.", "Add 'in <expression>' after the let bindings.", "Nix syntax");
                }
                if (/^\s*with\s+\w/.test(line) && !trimmed.endsWith(';')) {
                    e(lineNum, "'with' expression should end with a semicolon before the body.", "Use: with pkgs; <body>  — note the semicolon.", "Nix syntax", "warning");
                }
                if (/\bimport\s+<nixpkgs>/.test(trimmed) && /fetchurl\s*\{/.test(fullCode)) {
                    e(lineNum, "Pinning nixpkgs with <nixpkgs> produces impure, non-reproducible builds.", "Pin nixpkgs to a specific revision using a lock file or fetchTarball with a hash.", "Nix reproducibility", "warning");
                }
                if (/\bfetchurl\s*\{/.test(trimmed) && !/sha256\s*=/.test(trimmed) && !lines.slice(idx, idx + 8).some(l => /sha256\s*=/.test(l))) {
                    e(lineNum, "fetchurl is missing a sha256 hash.", "Add 'sha256 = \"...\";' to pin the download and ensure reproducibility.", "Nix security");
                }
                if (/\b(mkDerivation|buildPackage)\b/.test(trimmed) && !lines.slice(idx, idx + 30).some(l => /version\s*=/.test(l))) {
                    e(lineNum, "Derivation is missing a 'version' attribute.", "Add 'version = \"1.0.0\";' so Nix can track and upgrade the package.", "Nix style", "info");
                }
                if (/==/.test(trimmed) && !/!=/.test(trimmed)) {
                    e(lineNum, "Nix uses '==' for equality but it is only valid in assertions and conditions, not in attribute sets.", "Use '=' for attribute assignment inside { }.", "Nix syntax", "warning");
                }
            } else if (lang === 'HCL') {
                if (/\bresource\s+"[^"]+"\s+"[^"]+"\s*$/.test(trimmed) && nextNonBlank(idx) !== '{') {
                    e(lineNum, "Resource block declaration is missing an opening brace.", "Add '{' at the end of the resource line.", "HCL syntax");
                }
                if (/\$\{[^}]*\}/.test(trimmed) && /"\s*\+\s*"/.test(trimmed)) {
                    e(lineNum, "String concatenation with '+' is not valid in HCL — use template interpolation.", "Use \"${var.a}${var.b}\" instead of \"${var.a}\" + \"${var.b}\".", "HCL syntax");
                }
                const resource = hclResourceRanges.find(range => idx >= range.start && idx <= range.end);
                if (resource && /\bcount\s*=/.test(trimmed) && codeLines.slice(resource.start, resource.end + 1).some(item => /\bfor_each\s*=/.test(item))) {
                    e(lineNum, "A resource cannot use both count and for_each.", "Choose one meta-argument for this resource; count and for_each are valid in separate resources.", "HCL style", "warning");
                }
                if (/\bhardcoded\b|password\s*=\s*"[^"]{3,}"|secret\s*=\s*"[^"]{3,}"/i.test(rawTrimmed)) {
                    e(lineNum, "Hardcoded secret or password detected in HCL.", "Use a variable or a secrets manager reference instead of a literal value.", "HCL security", "error");
                }
                if (/\baws_access_key\b|\baws_secret_key\b/.test(trimmed)) {
                    e(lineNum, "AWS credentials should never be hardcoded in Terraform files.", "Use environment variables, IAM roles, or AWS Secrets Manager.", "HCL security", "error");
                }
                if (/^\s*#\s*TODO\b/i.test(line) === false && /terraform\s+\{/.test(trimmed) && !lines.some(l => /required_version\s*=/.test(l))) {
                    e(lineNum, "Terraform block is missing 'required_version'.", "Pin the Terraform CLI version: required_version = \">= 1.6\".", "HCL style", "info");
                }
            } else if (lang === 'Nim') {
                // Nim comments are '#' (and '#[ ]#'); '//' is not a comment and not an operator.
                if (trimmed.startsWith('//')) {
                    e(lineNum, "Nim uses '#' for comments, not '//'.", "Replace '//' with '#'. Use '#[ ]#' for block comments.", "Nim syntax");
                }
                // Assignment is '='; '==' is equality. Reject '==' where a binding is expected.
                if (/^(?:let|var|const)\s+\w+\s*==/.test(trimmed)) {
                    e(lineNum, "Nim binding uses '=' to assign, but '==' was found.", "Use a single '=' to bind: 'let x = value'.", "Nim syntax");
                }
                // Control-flow headers need a trailing ':' (unless the body is on the same line).
                if (!insideBrackets && /^(if|elif|while|for|when|case)\b/.test(trimmed)
                    && !trimmed.includes(':') && !/[,+\-*/=<>(&|]$/.test(trimmed) && !/\bof\b/.test(trimmed)) {
                    e(lineNum, "Nim control-flow statement is missing a trailing ':'.", "End the line with ':' before the indented block.", "Nim syntax", "warning");
                }
                // Common cross-language paste errors.
                if (/\bconsole\.log\s*\(/.test(trimmed) || /\bSystem\.out\./.test(trimmed)) {
                    e(lineNum, "This looks like JavaScript/Java syntax inside a Nim file.", "Use 'echo ...' to print in Nim.", "Language mismatch");
                }
            } else if (lang === 'Dart') {
                // 'new' is optional (and discouraged) in Dart 2+.
                if (/(^|[^.\w])new\s+[A-Z]/.test(line)) {
                    e(lineNum, "The 'new' keyword is optional in Dart 2+.", "Drop 'new' — 'Foo()' is preferred over 'new Foo()'.", "Dart style", "info");
                }
                // Assignment '=' inside an if/while condition (Dart requires a bool — usually a typo for '==').
                if (/^(if|while)\s*\(.*[^=!<>]=[^=].*\)/.test(trimmed)) {
                    e(lineNum, "Assignment '=' inside a condition — likely a typo for '=='.", "Use '==' to compare inside the condition.", "Dart bug", "warning");
                }
                // == null then .method on same reference is fine; but '== null' comparisons are idiomatic — no flag.
                if (/\bconsole\.log\s*\(/.test(trimmed) || /\bSystem\.out\./.test(trimmed) || /\bprintln\s*\(/.test(trimmed)) {
                    e(lineNum, "This looks like JS/Java syntax inside a Dart file.", "Use 'print(...)' to write to stdout in Dart.", "Language mismatch");
                }
            } else if (lang === 'Zig') {
                // Zig has '==' but no '==='.
                if (/[^=!<>]===[^=]/.test(trimmed)) {
                    e(lineNum, "Zig uses '==' for equality — there is no '===' operator.", "Replace '===' with '=='.", "Zig syntax");
                }
                // 'usingnamespace' is deprecated/removed in recent Zig.
                if (/\busingnamespace\b/.test(trimmed)) {
                    e(lineNum, "'usingnamespace' is deprecated and removed in recent Zig versions.", "Reference imported declarations through their container (e.g. std.mem.eql).", "Zig version", "warning");
                }
                if (/\bconsole\.log\s*\(/.test(trimmed) || /\bprintf\s*\(/.test(trimmed) || /\bSystem\.out\./.test(trimmed)) {
                    e(lineNum, "This looks like C/JS syntax inside a Zig file.", "Use std.debug.print(\"{}\\n\", .{value}) to print in Zig.", "Language mismatch");
                }
            } else if (lang === 'Julia') {
                // Julia spells it 'elseif' (one word); 'else if' silently opens a nested block.
                if (/^else\s+if\b/.test(trimmed)) {
                    e(lineNum, "Julia uses 'elseif' (one word), not 'else if'.", "Change 'else if' to 'elseif' — otherwise you open a second 'if' that needs its own 'end'.", "Julia syntax");
                }
                // No increment/decrement operators in Julia.
                if (/\b\w+\+\+(?!\+)/.test(trimmed) || /\b\w+--(?!-)/.test(trimmed)) {
                    e(lineNum, "Julia has no '++' or '--' operators.", "Use 'x += 1' or 'x -= 1' instead.", "Julia syntax");
                }
                // Note: '//' is the rational-number operator in Julia and '===' is identity — never flagged.
                if (/\bconsole\.log\s*\(/.test(trimmed) || /\bSystem\.out\./.test(trimmed)) {
                    e(lineNum, "This looks like JS/Java syntax inside a Julia file.", "Use 'println(...)' to print in Julia.", "Language mismatch");
                }
            }
        });
        if (cMemory) {
            const unmatchedMalloc = Math.max(0, cMemory.allocations.length - cMemory.frees);
            const mallocOffsets = cMemory.allocations.slice(cMemory.frees);
            for (const offset of mallocOffsets.slice(0, unmatchedMalloc)) {
                const line = fullCode.slice(0, offset).split('\n').length;
                issues.push(this.makeIssue(line, "malloc() allocation may not have a matching free().", "Track each allocation and free it exactly once, or use an ownership-aware helper.", "C/C++ memory", null, "warning"));
            }
            if (lang === 'C++') {
                const unmatchedNew = Math.max(0, cMemory.news - cMemory.deletes);
                if (unmatchedNew) {
                    const line = lines.findIndex(item => /\bnew\b/.test(item)) + 1;
                    issues.push(this.makeIssue(line > 0 ? line : 1, "A new allocation may not have a matching delete.", "Match each new with delete, or prefer std::unique_ptr/std::shared_ptr.", "C++ memory", null, "warning"));
                }
            }
        }
        return issues;
    }
    // Universal checks that apply to all languages
    static scanUniversal(lang, lines) {
        const issues = [];
        const e = (ln, msg, hint, kind, col, sev) => issues.push(this.makeIssue(ln, msg, hint, kind, col ?? null, sev ?? "info"));
        const hasTabs = lines.some(l => /^\t/.test(l));
        const hasSpaces = lines.some(l => /^ /.test(l));
        let mixedTabsReported = false;
        const commentRe = ({
            Python: /#+\s*(TODO|FIXME|HACK|XXX)\b/i,
            Ruby: /#+\s*(TODO|FIXME|HACK|XXX)\b/i,
            Bash: /#+\s*(TODO|FIXME|HACK|XXX)\b/i,
            SQL: /(?:--|\/\*)\s*(TODO|FIXME|HACK|XXX)\b/i,
            Haskell: /(?:--|\{-)\s*(TODO|FIXME|HACK|XXX)\b/i,
            Lua: /--\s*(TODO|FIXME|HACK|XXX)\b/i,
            Erlang: /%\s*(TODO|FIXME|HACK|XXX)\b/i,
            Lisp: /;\s*(TODO|FIXME|HACK|XXX)\b/i,
            Clojure: /;\s*(TODO|FIXME|HACK|XXX)\b/i,
            Fortran: /!\s*(TODO|FIXME|HACK|XXX)\b/i
        }[lang] || /(?:\/\/|\/\*|#)\s*(TODO|FIXME|HACK|XXX)\b/i);
        lines.forEach((line, idx) => {
            const lineNum = idx + 1;
            // Lines over 120 characters
            if (line.length > 120) {
                e(lineNum, `Line is ${line.length} characters long (limit: 120).`, "Break this line into shorter segments for readability.", "Line length", 121);
            }
            // Trailing whitespace — only flag if 3+ trailing spaces (single space is too common)
            if (/[ \t]{3,}$/.test(line)) {
                e(lineNum, "Line has trailing whitespace.", "Remove the trailing spaces or tabs.", "Style");
            }
            // More than 3 consecutive blank lines
            if (!line.trim() && idx >= 3 && !lines[idx-1].trim() && !lines[idx-2].trim() && !lines[idx-3].trim()) {
                e(lineNum, "More than 3 consecutive blank lines.", "Reduce excessive whitespace to improve readability.", "Style", null);
            }
            // TODO/FIXME/HACK/XXX comments
            const todoMatch = commentRe.exec(line);
            if (todoMatch) {
                e(lineNum, `${todoMatch[1].toUpperCase()} comment left in code.`, "Resolve or track this item before shipping.", "Code quality", todoMatch.index + 1);
            }
            // Mixed tabs and spaces (file-level, reported once per line that has both)
            if (!mixedTabsReported && hasTabs && hasSpaces && /^\t/.test(line) && lines.some(l => /^ /.test(l))) {
                e(lineNum, "File mixes tab and space indentation.", "Choose one indentation style consistently throughout the file.", "Style");
                mixedTabsReported = true;
            }
        });
        return issues;
    }
    // Universal advanced checks — apply to all languages
    static scanUniversalAdvanced(lang, lines) {
        const issues = [];
        const e = (ln, msg, hint, kind, col, sev) => issues.push(this.makeIssue(ln, msg, hint, kind, col ?? null, sev ?? "info"));
        const fullCode = lines.join('\n');
        // Detect files with no actual code (only whitespace/comments)
        const commentPatterns = {
            Python: /^\s*(#.*)?$/,
            Ruby: /^\s*(#.*)?$/,
            Bash: /^\s*(#.*)?$/,
            SQL: /^\s*(--.*|\/\*.*\*\/\s*)?$/,
            Haskell: /^\s*(--.*|\{-[\s\S]*-\}\s*)?$/,
            Lua: /^\s*(--.*)?$/,
            Erlang: /^\s*(%.*)?$/,
            Lisp: /^\s*(;.*)?$/,
            Clojure: /^\s*(;.*)?$/,
            Fortran: /^\s*(!.*|[cC]\s.*)?$/
        }[lang] || /^\s*(\/\/.*|\/\*.*\*\/\s*|#.*)?$/;
        const maskedForCodeCheck = this.maskCode(lang, lines);
        const hasCode = maskedForCodeCheck.some(l => l.trim());
        if (!hasCode && lines.length > 0) {
            e(1, "File contains no executable code — only whitespace or comments.", "Add code or remove the file if it is no longer needed.", "Code quality", null, "info");
        }
        // Large file warning
        if (lines.length > 600) {
            e(1, `File is ${lines.length} lines long.`, "Consider splitting this into smaller modules — large files are harder to navigate and test.", "Code quality", null, "info");
        }
        // Detect very long functions (>50 lines between open and close brace)
        // Works for JS/TS/Java/C/C++/Go/Rust — brace-delimited languages
        const bracelangs = ['Javascript','TypeScript','Java','C','C++','Go','Rust','PHP','C#','Kotlin','Swift','Dart','Zig'];
        if (bracelangs.includes(lang)) {
            let fnStartLine = -1;
            let fnBraceDepth = 0;
            let inFn = false;
            for (let i = 0; i < lines.length; i++) {
                const t = lines[i].trim();
                // Detect function/method opening — a line containing 'function', '=>', or known patterns with '{'
                const isControl = /^(?:if|for|while|switch|catch|with)\b/.test(t);
                const isFnOpen = !isControl && /\b(function\s+\w+|function\s*\(|\w+\s*\([^)]*\)\s*\{|=>\s*\{)/.test(t);
                for (let ci = 0; ci < lines[i].length; ci++) {
                    const ch = lines[i][ci];
                    if (ch === '{') {
                        if (!inFn && isFnOpen) { inFn = true; fnStartLine = i + 1; fnBraceDepth = 1; }
                        else if (inFn) fnBraceDepth++;
                    } else if (ch === '}' && inFn) {
                        fnBraceDepth--;
                        if (fnBraceDepth === 0) {
                            const fnLen = (i + 1) - fnStartLine;
                            if (fnLen > 50) {
                                e(fnStartLine, `Function is ${fnLen} lines long — consider splitting it.`, "Break large functions into smaller, focused helpers for readability and testability.", "Code quality", null, "info");
                            }
                            inFn = false;
                            fnStartLine = -1;
                        }
                    }
                }
            }
        }
        return issues;
    }
    // Conservative language-specific guardrails. These are advisory findings for risky
    // constructs that compilers accept but which frequently cause real bugs in practice.
    static scanLanguageGuardrails(lang, lines) {
        const issues = [];
        const e = (line, msg, hint, kind, severity = 'warning') => issues.push(this.makeIssue(line, msg, hint, kind, null, severity));
        // Guardrails only look for code tokens (risky calls, operators). Run them over
        // string/comment-masked text so a keyword inside a string or comment isn't flagged.
        const maskedLines = this.maskCode(lang, lines);
        const code = maskedLines.join('\n');
        const cLike = ['C', 'C++', 'C#', 'Java', 'Go', 'D', 'Kotlin', 'Swift', 'Dart', 'PHP', 'Groovy'];
        if (cLike.includes(lang)) {
            maskedLines.forEach((raw, index) => {
                const line = raw.trim();
                if (!line || line.startsWith('//') || line.startsWith('#')) return;
                const condition = line.match(/\b(?:if|while)\s*\(([^()]*)\)/);
                if (condition && /(^|[^=!<>])=(?!=)/.test(condition[1])) {
                    e(index + 1, "Assignment inside a condition may be accidental.", "Use == or === for comparison, or add parentheses to make an intentional assignment explicit.", lang + ' logic', 'warning');
                }
                if (/\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(line)) {
                    e(index + 1, "Empty catch block hides failures.", "Log, rethrow, or handle the exception instead of silently ignoring it.", lang + ' error handling', 'warning');
                }
            });
        }
        if (lang === 'Javascript' || lang === 'TypeScript') {
            maskedLines.forEach((raw, index) => {
                if (/\b(?:setTimeout|setInterval)\s*\(\s*['"]/.test(raw)) e(index + 1, "String-based timer execution is hard to refactor and can execute injected code.", "Pass a function to setTimeout/setInterval instead of a string.", lang + ' safety', 'warning');
                if (/\bJSON\.parse\s*\(/.test(raw) && !/\b(?:try|catch)\b/.test(code)) e(index + 1, "JSON.parse can throw on malformed input.", "Validate the source or wrap parsing in try/catch when input is not guaranteed.", lang + ' error handling', 'info');
                if (/\b(?:==|!=)(?!=)/.test(raw) && !/\b(?:null|undefined)\b/.test(raw)) e(index + 1, "Loose equality can coerce values unexpectedly.", "Use === or !== unless coercion is intentional.", lang + ' logic', 'info');
            });
        }
        if (lang === 'Python') {
            maskedLines.forEach((raw, index) => {
                if (/^\s*except\s*:\s*(?:pass)?\s*$/.test(raw)) e(index + 1, "Bare exception handler can hide unrelated failures.", "Catch the expected exception type and handle or report it.", 'Python error handling', 'warning');
                if (/\bsubprocess\.(?:call|run|Popen)\s*\([^\n]*shell\s*=\s*True/.test(raw)) e(index + 1, "subprocess with shell=True can interpret untrusted input as commands.", "Pass an argument list with shell=False unless a shell is strictly required.", 'Python security', 'warning');
            });
        }
        if (lang === 'Go') {
            maskedLines.forEach((raw, index) => {
                if (/\b(?:err|error)\s*:=/.test(raw) && !/\bif\s+err\s*!=\s*nil\b/.test(lines.slice(index, Math.min(index + 4, lines.length)).join('\n'))) e(index + 1, "Error result may be ignored.", "Check err promptly or deliberately document why it is safe to ignore.", 'Go error handling', 'info');
            });
        }
        if (lang === 'PHP') {
            maskedLines.forEach((raw, index) => {
                if (/\b(?:mysqli_query|->query)\s*\([^\n]*\$/.test(raw)) e(index + 1, "SQL query appears to interpolate a variable.", "Use prepared statements and bound parameters for external values.", 'PHP security', 'warning');
                if (/\bunserialize\s*\(/.test(raw)) e(index + 1, "unserialize() on untrusted data can instantiate attacker-controlled objects.", "Prefer JSON for external data, or strictly validate a trusted serialized payload.", 'PHP security', 'warning');
            });
        }
        if (lang === 'Java' || lang === 'C#') {
            maskedLines.forEach((raw, index) => {
                if (/\bcatch\s*\(\s*(?:Exception|Throwable|System\.Exception)\b[^)]*\)\s*\{?\s*\}?/.test(raw)) e(index + 1, "Broad exception catch can conceal programming errors.", "Catch the narrowest expected exception and preserve useful failure context.", lang + ' error handling', 'info');
            });
        }
        if (lang === 'C' || lang === 'C++') {
            maskedLines.forEach((raw, index) => {
                if (/\b(?:strcpy|strcat|sprintf)\s*\(/.test(raw)) e(index + 1, "Unbounded C string function can overflow its destination.", "Use a bounded alternative such as snprintf or a size-aware string API.", lang + ' security', 'warning');
                if (/\bscanf\s*\([^\n]*%s(?!\d)/.test(lines[index])) e(index + 1, "scanf %s has no width limit and can overflow the buffer.", "Add a maximum field width or use fgets with explicit validation.", 'C input safety', 'warning');
            });
        }
        if (lang === 'Bash') {
            maskedLines.forEach((raw, index) => {
                if (/\b(?:rm|cp|mv|chmod|chown|mkdir|cat|grep|source)\b[^\n]*\$[A-Za-z_][\w]*/.test(raw) && !/"[^"\n]*\$[A-Za-z_]/.test(raw) && !/'[^'\n]*\$[A-Za-z_]/.test(raw)) {
                    e(index + 1, "Shell variable is unquoted in a file/path command.", "Quote expansions such as \"$file\" to preserve spaces and prevent wildcard expansion.", 'Bash safety', 'warning');
                }
                if (/^\s*if\s+\[[^\s]/.test(raw) || /[^\s]\]\s*(?:;|then|$)/.test(raw)) {
                    e(index + 1, "Bash test brackets need spaces around the expression.", "Use: if [ \"$value\" = \"expected\" ]; then", 'Bash syntax', 'warning');
                }
            });
        }
        if (lang === 'Rust') {
            maskedLines.forEach((raw, index) => { if (/\.(?:unwrap|expect)\s*\(/.test(raw)) e(index + 1, "Fallible result is force-unwrapped and can panic.", "Handle the Result or Option explicitly when failure is possible.", 'Rust error handling', 'info'); });
        }
        if (lang === 'Kotlin') {
            maskedLines.forEach((raw, index) => { if (/\w!\W/.test(raw) && !/!=/.test(raw)) e(index + 1, "Non-null assertion can throw when the value is null.", "Prefer safe calls (?.), let, or an explicit null check.", 'Kotlin null safety', 'info'); });
        }
        if (lang === 'Swift') {
            maskedLines.forEach((raw, index) => { if (/\b[A-Za-z_]\w*!\s*(?:\.|\[|$)/.test(raw) && !/!=/.test(raw)) e(index + 1, "Force unwrap can crash when the value is nil.", "Use optional binding, ??, or optional chaining instead.", 'Swift safety', 'info'); });
        }
        if (lang === 'Scala' || lang === 'Java') {
            maskedLines.forEach((raw, index) => { if (/\b(?:Option|Optional)\s*<[^>]+>[^\n]*\.get\s*\(/.test(raw)) e(index + 1, "Optional value is accessed with get() and may be empty.", "Use a safe fallback, map/flatMap, or explicit presence check.", lang + ' null safety', 'info'); });
        }
        if (lang === 'Lua') {
            maskedLines.forEach((raw, index) => { if (/\b(?:loadstring|load)\s*\(/.test(raw)) e(index + 1, "Dynamic Lua code loading can execute untrusted input.", "Avoid dynamic loading or validate the source before executing it.", 'Lua security', 'warning'); });
        }
        if (lang === 'Elixir') {
            maskedLines.forEach((raw, index) => { if (/\bString\.to_atom\s*\(/.test(raw)) e(index + 1, "Converting untrusted strings to atoms can exhaust the VM atom table.", "Use String.to_existing_atom only for controlled values, or keep the value as a string.", 'Elixir safety', 'warning'); });
        }
        if (lang === 'Erlang') {
            maskedLines.forEach((raw, index) => { if (/\blist_to_atom\s*\(/.test(raw)) e(index + 1, "Creating atoms from untrusted lists can exhaust the Erlang VM atom table.", "Use binaries or existing-atom conversion for external input.", 'Erlang safety', 'warning'); });
        }
        if (lang === 'Perl') {
            maskedLines.forEach((raw, index) => { if (/`[^`]+`/.test(raw) || /\bsystem\s*\(/.test(raw)) e(index + 1, "Shell command execution is present.", "Keep arguments separated and validated; never concatenate untrusted input into a shell command.", 'Perl security', 'warning'); });
        }
        if (lang === 'Haskell') {
            maskedLines.forEach((raw, index) => { if (/\bunsafePerformIO\b/.test(raw)) e(index + 1, "unsafePerformIO breaks normal purity and evaluation guarantees.", "Keep IO in the IO type and pass values explicitly where possible.", 'Haskell safety', 'warning'); });
        }
        if (lang === 'Fortran' && /\b(?:program|module|subroutine|function)\b/i.test(code) && !/\bimplicit\s+none\b/i.test(code)) {
            e(1, "Fortran source has no IMPLICIT NONE declaration.", "Add IMPLICIT NONE to catch misspelled variables at compile time.", 'Fortran safety', 'info');
        }
        if (lang === 'Nim') {
            maskedLines.forEach((raw, index) => { if (/\bunsafeAddr\b/.test(raw)) e(index + 1, "unsafeAddr bypasses Nim's normal memory-safety checks.", "Use a safe reference or pointer operation unless the lifetime is guaranteed.", 'Nim safety', 'warning'); });
        }
        if (lang === 'R') {
            maskedLines.forEach((raw, index) => { if (/\b1\s*:\s*length\s*\(/.test(raw)) e(index + 1, "1:length(x) becomes 1:0 when x is empty.", "Use seq_along(x) or seq_len(length(x)) for empty-safe iteration.", 'R logic', 'warning'); });
        }
        return issues;
    }
}
