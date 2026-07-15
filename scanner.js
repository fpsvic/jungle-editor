class JungleScanner {
    static scan(lang, code) {
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
        return this.finalizeIssues(issues, lang);
    }
    // Async chunked scan — processes 200 lines at a time, yielding between chunks
    // Falls back to sync scan() for files under 500 lines
    static scanAsync(lang, code) {
        // Tree-sitter provides authoritative syntax structure. The legacy rules
        // remain a no-network fallback and continue to supply style/security hints.
        if (typeof JungleAstScanner !== 'undefined' && JungleAstScanner.names[lang]) {
            return JungleAstScanner.scan(lang, code).catch(() => this.scan(lang, code));
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
                    resolve(this.finalizeIssues(issues, lang));
                }
            };
            setTimeout(processChunk, 0);
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
    static finalizeIssues(issues, lang = null) {
        const seen = new Set();
        // Only high-confidence syntax/structure findings should block execution. The
        // scanner also reports style, security, performance, accessibility, and semantic
        // heuristics; those are useful warnings but are too context-dependent to present
        // as hard errors on otherwise valid programs.
        const hardErrorKind = kind => /syntax|indentation|delimiter|unclosed|string check|comment check|html structure|compile/i.test(String(kind || ''));
        const normalized = issues.map(issue => {
            // TypeScript scanner rules are only hints. The bundled TypeScript
            // compiler supplies the authoritative diagnostics during execution.
            if (lang === 'TypeScript' && issue.severity === 'error') return { ...issue, severity: 'warning' };
            if (issue.severity === 'error' && !hardErrorKind(issue.kind)) return { ...issue, severity: 'warning' };
            return issue;
        });
        const unique = normalized.filter(issue => {
            const key = `${issue.line ?? 0}|${issue.column ?? 0}|${issue.kind ?? ''}|${issue.msg ?? ''}`;
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
            if (braceDepth > 0 && trimmed && !trimmed.startsWith('/*') && !trimmed.startsWith('//') && !trimmed.endsWith('{') && !trimmed.endsWith('}') && !trimmed.endsWith(';') && !trimmed.endsWith(',') && trimmed.includes(':')) {
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
                // Rust lifetime annotations ('a, 'static, <'a>) and Haskell's prime-suffix
                // identifier convention (x', map') look like an unclosed char literal — a real
                // char literal always closes right after one character (or escape); these never do.
                if ((lang === 'Rust' || lang === 'Haskell') && char === "'" && !inString && !inTriple && !inRegex && !blockCommentCloser && !inHaskellBlockComment) {
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
        if (inString && stringStart) {
            errors.push(this.makeIssue(stringStart.line, `Unclosed string literal starting with ${inString}.`, `Add a closing ${inString}.`, "String check", stringStart.column));
        }
        while (stack.length > 0) {
            const unclosed = stack.pop();
            errors.push(this.makeIssue(unclosed.line, `Unclosed '${unclosed.char}' on line ${unclosed.line}, column ${unclosed.column} — never closed.`, `Add '${bracketPairs[unclosed.char]}' to close the '${unclosed.char}' opened here.`, "Delimiter check", unclosed.column));
        }
        return errors;
    }
    static scanHtmlTags(lines) {
        const errors = [];
        const stack = [];
        const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
        const tagRegex = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/?([a-zA-Z0-9:-]+)(?:\s[^>]*)?>/gi;
        const code = lines.join('\n');
        let match;
        while ((match = tagRegex.exec(code)) !== null) {
            const raw = match[0];
            const tagName = match[1] ? match[1].toLowerCase() : null;
            if (!tagName || raw.startsWith('<!--') || raw.toLowerCase().startsWith('<!doctype')) continue;
            const before = code.slice(0, match.index);
            const line = before.split('\n').length;
            const column = match.index - before.lastIndexOf('\n');
            const isClosing = raw.startsWith('</');
            const isSelfClosing = raw.endsWith('/>') || voidTags.has(tagName);
            if (isClosing) {
                const last = stack.pop();
                if (!last) {
                    errors.push(this.makeIssue(line, `Closing tag </${tagName}> has no matching opening tag.`, `Remove </${tagName}> or add <${tagName}> before it.`, "HTML structure", column));
                } else if (last.tag !== tagName) {
                    errors.push(this.makeIssue(line, `Closing tag </${tagName}> does not match <${last.tag}> from line ${last.line}.`, `Change this to </${last.tag}> or close <${last.tag}> before </${tagName}>.`, "HTML structure", column));
                }
            } else if (!isSelfClosing) {
                stack.push({ tag: tagName, line, column });
            }
        }
        while (stack.length > 0) {
            const unclosed = stack.pop();
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
        const e = (ln, msg, hint, kind, sev = 'warning', col = null) => issues.push(this.makeIssue(ln, msg, hint, kind, col, sev));
        const nextNonBlank = (idx) => {
            for (let j = idx + 1; j < lines.length; j++) if (maskedLines[j].trim()) return maskedLines[j].trim();
            return '';
        };
        const constDeclarations = [];
        for (let i = 0; i < maskedLines.length; i++) {
            const m = maskedLines[i].match(/^\s*const\s+([A-Za-z_$][\w$]*)\s*=/);
            if (m) constDeclarations.push({ name: m[1], line: i + 1 });
        }

        for (let idx = 0; idx < maskedLines.length; idx++) {
            const line = maskedLines[idx];
            const raw = lines[idx];
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
                const tail = maskedLines.slice(idx, Math.min(idx + 200, maskedLines.length)).join('\n');
                if (!/\bdefault\s*:/.test(tail)) {
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

                const typed = compact.match(/\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*:\s*(number|string|boolean|bigint)\b[^=]*=\s*(.+?);?$/);
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
            for (let idx = declaration.line; idx < maskedLines.length; idx++) {
                const line = maskedLines[idx];
                const assignment = new RegExp("(^|[^.\\w$])" + declaration.name + "\\s*(?:=|\\+=|-=|\\*=|/=|%=|\\+\\+|--)");
                if (assignment.test(line)) {
                    e(idx + 1, "Assignment to const '" + declaration.name + "'.", "Use let if the binding must change, or remove the reassignment.", "JavaScript runtime", "error");
                    break;
                }
            }
        }
        return issues;
    }

    static scanLanguagePatterns(lang, lines) {
        const issues = [];
        const fullCode = lines.join('\n');
        const e = (ln, msg, hint, kind, sev = "error") => issues.push(this.makeIssue(ln, msg, hint, kind, null, sev));
        const bracketDepths = this.computeBracketDepths(lines);
        const nextNonBlank = (idx) => this.nextNonBlankTrimmed(lines, idx);
        lines.forEach((line, idx) => {
            const lineNum = idx + 1;
            const trimmed = line.trim();
            // '//' is a line comment in most languages, but NOT in Nim (which uses '#'),
            // so for Nim we let '//'-lines fall through to be flagged below.
            if (!trimmed || (trimmed.startsWith('//') && lang !== 'Nim') || trimmed.startsWith('#')) return;
            // Skip bracket-sensitive checks if this line starts inside an open bracket
            // (continuation of a comprehension/condition) or itself opens brackets
            // that stay unclosed at line's end (multi-line def/if signature).
            const insideBrackets = bracketDepths.start[idx] > 0 || bracketDepths.end[idx] > 0;
            if (lang === 'Python') {
                if (!insideBrackets && /^(if|elif|else|for|while|def|class|try|except|finally|with)\b/.test(trimmed) && !trimmed.endsWith(':') && !trimmed.endsWith('\\') && !trimmed.includes('#')) {
                    e(lineNum, "Python block statement is missing a trailing colon.", "Add ':' at the end of the line.", "Python syntax");
                }
                if (/^print\s+[^(\s]/.test(trimmed)) {
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
                if (/\bf["']/.test(trimmed) && !/\{/.test(trimmed.replace(/\\{/g, ''))) {
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
                const _typeofM = trimmed.match(/\btypeof\s+[\w.$[\]'"]+\s*[=!]==?\s*["']([^"']*)["']/);
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
                if (/\bawait\b/.test(trimmed) && !/\basync\b/.test(fullCode.slice(0, fullCode.indexOf(trimmed)).slice(-600))) {
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
                if (/\btypeof\s+\w[\w.]*\s*==\s*["']undefined["']/.test(trimmed)) {
                    e(lineNum, "typeof x == \"undefined\" is unnecessary.", "Use `x === undefined` for a cleaner check.", "JavaScript style", "info");
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
                    for (let j = idx + 1; j < Math.min(idx + 200, lines.length); j++) {
                        const caseTrimmed = lines[j].trim();
                        const caseMatch = caseTrimmed.match(/^case\s+(.+?)\s*:/);
                        if (caseMatch) {
                            const val = caseMatch[1];
                            if (caseValues.has(val)) {
                                e(j + 1, `Duplicate case value '${val}' in switch statement.`, "Each case value should be unique; duplicate cases are unreachable.", "JavaScript logic", "warning");
                            }
                            caseValues.add(val);
                        }
                        if (/^\}/.test(caseTrimmed)) break;
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
                if (/\b(setTimeout|setInterval)\s*\(\s*["']/.test(trimmed)) {
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
                if (/public\s+class\s+[A-Za-z_]\w*/.test(trimmed) && !/[{;]/.test(trimmed) && !/^(extends|implements)\b/.test(nextNonBlank(idx))) {
                    e(lineNum, "Java class declaration is missing an opening brace.", "Add '{' after the class name.", "Java syntax");
                }
                if (/System\.out\.print(?:ln)?\s+["']/.test(trimmed)) {
                    e(lineNum, "Java print call is missing parentheses.", "Use System.out.println(...).", "Java syntax");
                }
                // String comparison with '==' — a string literal on either side means one operand
                // is a String, so '==' compares references. Double-quotes only: 'char == \\'x\\'' is valid.
                if (/[\w)\]]\s*==\s*"/.test(trimmed) || /"\s*==\s*[\w("]/.test(trimmed)) {
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
                if (/\bscanf\s*\(\s*["'][^"']*["']\s*,\s*[^&]/.test(trimmed)) {
                    e(lineNum, "scanf argument may be missing '&' address-of operator.", "Pass the address of the variable: scanf(\"%d\", &var).", "C/C++ syntax");
                }
                if (/\bmalloc\s*\(/.test(trimmed) && !/\bfree\s*\(/.test(fullCode)) {
                    e(lineNum, "malloc() called but no matching free() found in the file.", "Always free() every malloc() allocation to prevent memory leaks.", "C/C++ memory", "warning");
                }
                if (lang === 'C++' && /\bgets\s*\(/.test(trimmed)) {
                    e(lineNum, "gets() is unsafe and removed in C11.", "Use fgets(buf, size, stdin) instead.", "C/C++ security", "warning");
                }
                if (lang === 'C++' && /\bnew\b/.test(trimmed) && !/\bdelete\b/.test(fullCode)) {
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
                if (/fmt\.Print(?:ln|f)?\s+["']/.test(trimmed)) {
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
                if (/\bdef\s+\w+/.test(trimmed) && !isEndlessMethod && !lines.slice(idx, idx + 30).some(l => /^\s*end\b/.test(l))) {
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
                if (/\bsetget\b/.test(trimmed)) {
                    e(lineNum, "'setget' is Godot 3 syntax — use @export and property setter/getter in Godot 4.", "Replace setget with a Godot 4 property: var x: int: get: return _x", "GDScript version", "warning");
                }
                if (/\bonready\b/.test(trimmed)) {
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
                if (/\blet\b/.test(trimmed) && !lines.slice(idx, idx + 40).some(l => /^\s*in\b/.test(l))) {
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
                if (/\bcount\s*=\s*\d/.test(trimmed) && /\bfor_each\b/.test(fullCode)) {
                    e(lineNum, "Mixing 'count' and 'for_each' in the same configuration can cause index drift.", "Use one meta-argument consistently per resource.", "HCL style", "warning");
                }
                if (/\bhardcoded\b|password\s*=\s*"[^"]{3,}"|secret\s*=\s*"[^"]{3,}"/i.test(trimmed)) {
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
        return issues;
    }
    // Universal checks that apply to all languages
    static scanUniversal(lang, lines) {
        const issues = [];
        const e = (ln, msg, hint, kind, col, sev) => issues.push(this.makeIssue(ln, msg, hint, kind, col ?? null, sev ?? "info"));
        const hasTabs = lines.some(l => /^\t/.test(l));
        const hasSpaces = lines.some(l => /^ /.test(l));
        let mixedTabsReported = false;
        const commentRe = lang === 'Python' || lang === 'Ruby' || lang === 'Bash'
            ? /#+\s*(TODO|FIXME|HACK|XXX)\b/i
            : /(?:\/\/|\/\*|#)\s*(TODO|FIXME|HACK|XXX)\b/i;
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
        const commentPatterns = lang === 'Python' || lang === 'Ruby' || lang === 'Bash'
            ? /^\s*(#.*)?$/
            : /^\s*(\/\/.*|\/\*.*\*\/\s*|#.*)?$/;
        const hasCode = lines.some(l => l.trim() && !commentPatterns.test(l));
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
                const isFnOpen = /\b(function\s+\w+|function\s*\(|\w+\s*\([^)]*\)\s*\{|=>\s*\{)/.test(t);
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
        const code = lines.join('\n');
        const cLike = ['C', 'C++', 'C#', 'Java', 'Go', 'D', 'Kotlin', 'Swift', 'Dart', 'PHP', 'Groovy'];
        if (cLike.includes(lang)) {
            lines.forEach((raw, index) => {
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
        if (lang === 'C' || lang === 'C++') {
            lines.forEach((raw, index) => {
                if (/\b(?:strcpy|strcat|sprintf)\s*\(/.test(raw)) e(index + 1, "Unbounded C string function can overflow its destination.", "Use a bounded alternative such as snprintf or a size-aware string API.", lang + ' security', 'warning');
                if (/\bscanf\s*\([^\n]*%s(?!\d)/.test(raw)) e(index + 1, "scanf %s has no width limit and can overflow the buffer.", "Add a maximum field width or use fgets with explicit validation.", 'C input safety', 'warning');
            });
        }
        if (lang === 'Bash') {
            lines.forEach((raw, index) => {
                if (/\b(?:rm|cp|mv|chmod|chown|mkdir|cat|grep|source)\b[^\n]*\$[A-Za-z_][\w]*/.test(raw) && !/"[^"\n]*\$[A-Za-z_]/.test(raw) && !/'[^'\n]*\$[A-Za-z_]/.test(raw)) {
                    e(index + 1, "Shell variable is unquoted in a file/path command.", "Quote expansions such as \"$file\" to preserve spaces and prevent wildcard expansion.", 'Bash safety', 'warning');
                }
                if (/^\s*if\s+\[[^\s]/.test(raw) || /[^\s]\]\s*(?:;|then|$)/.test(raw)) {
                    e(index + 1, "Bash test brackets need spaces around the expression.", "Use: if [ \"$value\" = \"expected\" ]; then", 'Bash syntax', 'warning');
                }
            });
        }
        if (lang === 'Rust') {
            lines.forEach((raw, index) => { if (/\.(?:unwrap|expect)\s*\(/.test(raw)) e(index + 1, "Fallible result is force-unwrapped and can panic.", "Handle the Result or Option explicitly when failure is possible.", 'Rust error handling', 'info'); });
        }
        if (lang === 'Kotlin') {
            lines.forEach((raw, index) => { if (/\w!\W/.test(raw) && !/!=/.test(raw)) e(index + 1, "Non-null assertion can throw when the value is null.", "Prefer safe calls (?.), let, or an explicit null check.", 'Kotlin null safety', 'info'); });
        }
        if (lang === 'Swift') {
            lines.forEach((raw, index) => { if (/\b[A-Za-z_]\w*!\s*(?:\.|\[|$)/.test(raw) && !/!=/.test(raw)) e(index + 1, "Force unwrap can crash when the value is nil.", "Use optional binding, ??, or optional chaining instead.", 'Swift safety', 'info'); });
        }
        if (lang === 'Scala' || lang === 'Java') {
            lines.forEach((raw, index) => { if (/\b(?:Option|Optional)\s*<[^>]+>[^\n]*\.get\s*\(/.test(raw)) e(index + 1, "Optional value is accessed with get() and may be empty.", "Use a safe fallback, map/flatMap, or explicit presence check.", lang + ' null safety', 'info'); });
        }
        if (lang === 'Lua') {
            lines.forEach((raw, index) => { if (/\b(?:loadstring|load)\s*\(/.test(raw)) e(index + 1, "Dynamic Lua code loading can execute untrusted input.", "Avoid dynamic loading or validate the source before executing it.", 'Lua security', 'warning'); });
        }
        if (lang === 'Elixir') {
            lines.forEach((raw, index) => { if (/\bString\.to_atom\s*\(/.test(raw)) e(index + 1, "Converting untrusted strings to atoms can exhaust the VM atom table.", "Use String.to_existing_atom only for controlled values, or keep the value as a string.", 'Elixir safety', 'warning'); });
        }
        if (lang === 'Erlang') {
            lines.forEach((raw, index) => { if (/\blist_to_atom\s*\(/.test(raw)) e(index + 1, "Creating atoms from untrusted lists can exhaust the Erlang VM atom table.", "Use binaries or existing-atom conversion for external input.", 'Erlang safety', 'warning'); });
        }
        if (lang === 'Perl') {
            lines.forEach((raw, index) => { if (/`[^`]+`/.test(raw) || /\bsystem\s*\(/.test(raw)) e(index + 1, "Shell command execution is present.", "Keep arguments separated and validated; never concatenate untrusted input into a shell command.", 'Perl security', 'warning'); });
        }
        if (lang === 'Haskell') {
            lines.forEach((raw, index) => { if (/\bunsafePerformIO\b/.test(raw)) e(index + 1, "unsafePerformIO breaks normal purity and evaluation guarantees.", "Keep IO in the IO type and pass values explicitly where possible.", 'Haskell safety', 'warning'); });
        }
        if (lang === 'Fortran' && /\b(?:program|module|subroutine|function)\b/i.test(code) && !/\bimplicit\s+none\b/i.test(code)) {
            e(1, "Fortran source has no IMPLICIT NONE declaration.", "Add IMPLICIT NONE to catch misspelled variables at compile time.", 'Fortran safety', 'info');
        }
        if (lang === 'Nim') {
            lines.forEach((raw, index) => { if (/\bunsafeAddr\b/.test(raw)) e(index + 1, "unsafeAddr bypasses Nim's normal memory-safety checks.", "Use a safe reference or pointer operation unless the lifetime is guaranteed.", 'Nim safety', 'warning'); });
        }
        if (lang === 'R') {
            lines.forEach((raw, index) => { if (/\b1\s*:\s*length\s*\(/.test(raw)) e(index + 1, "1:length(x) becomes 1:0 when x is empty.", "Use seq_along(x) or seq_len(length(x)) for empty-safe iteration.", 'R logic', 'warning'); });
        }
        return issues;
    }

    // Advanced HTML checks
    static scanHtmlPatterns(lines) {
        const issues = [];
        const e = (ln, msg, hint, kind, col, sev) => issues.push(this.makeIssue(ln, msg, hint, kind, col ?? null, sev ?? "warning"));
        const fullCode = lines.join('\n');
        // Missing <!DOCTYPE html>
        if (!/<!DOCTYPE\s+html>/i.test(fullCode)) {
            e(1, "Missing <!DOCTYPE html> declaration.", "Add <!DOCTYPE html> as the very first line of the document.", "HTML best practice", null, "warning");
        }
        // Missing lang on <html> tag
        if (/<html[\s>]/i.test(fullCode) && !/<html[^>]+lang\s*=/i.test(fullCode)) {
            const htmlLine = lines.findIndex(l => /<html[\s>]/i.test(l));
            e(htmlLine >= 0 ? htmlLine + 1 : 1, "<html> tag is missing a 'lang' attribute.", "Add lang=\"en\" (or appropriate language code) to <html> for accessibility and SEO.", "HTML accessibility", null, "warning");
        }
        // Duplicate id attributes
        const idMatches = [...fullCode.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)];
        const idSeen = new Map();
        for (const m of idMatches) {
            const idVal = m[1];
            const beforeMatch = fullCode.slice(0, m.index);
            const lineNum = beforeMatch.split('\n').length;
            if (idSeen.has(idVal)) {
                e(lineNum, `Duplicate id="${idVal}" found — id attributes must be unique in a document.`, "Change one of the duplicate ids to a unique value or use a class instead.", "HTML accessibility", null, "error");
            } else {
                idSeen.set(idVal, lineNum);
            }
        }
        // Missing <title>
        if (/<head[\s>]/i.test(fullCode) && !/<title[\s>]/i.test(fullCode)) {
            e(1, "Document is missing a <title> tag.", "Add <title>Your Page Title</title> inside <head> for SEO and accessible browser tabs.", "HTML best practice", null, "warning");
        }
        // Missing <meta charset>
        if (!/<meta[^>]+charset\s*=/i.test(fullCode)) {
            e(1, "Document is missing a <meta charset> declaration.", "Add <meta charset=\"UTF-8\"> as the first element inside <head>.", "HTML best practice", null, "warning");
        }
        // Missing <meta name="viewport">
        if (!/<meta[^>]+name\s*=\s*["']viewport["']/i.test(fullCode)) {
            e(1, "Document is missing a viewport meta tag.", "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> for mobile responsiveness.", "HTML best practice", null, "info");
        }
        const deprecatedTags = ['center', 'font', 'marquee', 'blink'];
        lines.forEach((line, idx) => {
            const lineNum = idx + 1;
            const lowerLine = line.toLowerCase();
            // Missing alt on <img>
            const imgMatches = [...line.matchAll(/<img\b([^>]*)>/gi)];
            for (const m of imgMatches) {
                if (!/\balt\s*=/i.test(m[1])) {
                    e(lineNum, "<img> tag is missing an `alt` attribute.", "Add alt=\"description\" for accessibility.", "HTML accessibility", m.index + 1, "warning");
                }
            }
            // Deprecated tags
            for (const tag of deprecatedTags) {
                const re = new RegExp(`<${tag}[\\s>]`, 'i');
                if (re.test(line)) {
                    e(lineNum, `<${tag}> is a deprecated HTML tag.`, `Remove <${tag}> and use CSS or modern HTML equivalents instead.`, "HTML deprecated", null, "warning");
                }
            }
            // Inline style attribute (info)
            if (/\bstyle\s*=\s*["'][^"']+["']/i.test(line)) {
                e(lineNum, "Inline `style` attribute found.", "Move styles to a CSS class or stylesheet for maintainability.", "HTML style", null, "info");
            }
            // Empty <script> without src or type
            if (/<script\s*>\s*<\/script>/i.test(line) || /<script>\s*<\/script>/i.test(line)) {
                e(lineNum, "Empty <script> block with no src or content.", "Add a src attribute or add script content, or remove the tag.", "HTML quality", null, "info");
            }
            // NEW: <a href="#"> placeholder links
            if (/<a\b[^>]*\bhref\s*=\s*["']#["'][^>]*>/i.test(line)) {
                e(lineNum, "<a href=\"#\"> is a placeholder link with no real destination.", "Replace '#' with a real URL or use a <button> for click handlers.", "HTML quality", null, "info");
            }
            // NEW: <input> without type attribute
            const inputMatches = [...line.matchAll(/<input\b([^>]*)>/gi)];
            for (const m of inputMatches) {
                if (!/\btype\s*=/i.test(m[1])) {
                    e(lineNum, "<input> is missing a 'type' attribute — defaults to 'text' but is ambiguous.", "Add type=\"text\", type=\"email\", type=\"checkbox\", etc. to be explicit.", "HTML quality", null, "info");
                }
            }
            // NEW: <form> without action or onsubmit
            const formMatches = [...line.matchAll(/<form\b([^>]*)>/gi)];
            for (const m of formMatches) {
                if (!/\b(action|onsubmit)\s*=/i.test(m[1])) {
                    e(lineNum, "<form> has no 'action' or 'onsubmit' — form submission may go nowhere.", "Add an action URL or onsubmit handler to process the form data.", "HTML quality", null, "info");
                }
            }
            // <button> without type inside a <form> — outside a form, the default is harmless
            const btnMatches = [...line.matchAll(/<button\b([^>]*)>/gi)];
            const inForm = /<form[\s>]/i.test(fullCode.slice(0, fullCode.indexOf(line) >= 0 ? fullCode.indexOf(line) : 0));
            for (const m of btnMatches) {
                if (!/\btype\s*=/i.test(m[1]) && inForm) {
                    e(lineNum, "<button> missing a 'type' attribute inside a form — defaults to 'submit' and may submit unintentionally.", "Add type=\"button\" for action buttons or type=\"submit\" to be explicit.", "HTML quality", m.index + 1, "info");
                }
            }
            // <script src> in <head> without defer or async (not at end of body where it's fine)
            const extScriptMatches = [...line.matchAll(/<script\b([^>]*)>/gi)];
            const inHead = /<head[\s>]/i.test(fullCode.slice(0, fullCode.indexOf(line) >= 0 ? fullCode.indexOf(line) : 0) + line);
            for (const m of extScriptMatches) {
                if (/\bsrc\s*=/i.test(m[1]) && !/\bdefer\b|\basync\b/i.test(m[1]) && !/\btype\s*=\s*["']module["']/i.test(m[1])) {
                    // Only flag if we're clearly still inside <head> — check that </head> hasn't appeared yet
                    const beforeLine = fullCode.slice(0, fullCode.indexOf(line) >= 0 ? fullCode.indexOf(line) : 0);
                    if (!/<\/head>/i.test(beforeLine) && /<head[\s>]/i.test(beforeLine)) {
                        e(lineNum, "<script src> in <head> without 'defer' or 'async' blocks HTML parsing until the script downloads.", "Add the 'defer' attribute to load the script after the document is parsed.", "HTML performance", m.index + 1, "info");
                    }
                }
            }
            // <label> without for attribute and not wrapping an input
            const labelMatches = [...line.matchAll(/<label\b([^>]*)>/gi)];
            for (const m of labelMatches) {
                if (!/\bfor\s*=/i.test(m[1]) && !/\bhtmlfor\s*=/i.test(m[1])) {
                    const labelContent = line.slice(m.index);
                    if (!/<input\b/i.test(labelContent) && !/<select\b/i.test(labelContent) && !/<textarea\b/i.test(labelContent)) {
                        e(lineNum, "<label> has no 'for' attribute linking it to an input.", "Add for=\"inputId\" matching the id of the associated input element.", "HTML accessibility", m.index + 1, "info");
                    }
                }
            }
        });
        return issues;
    }
    // Additional HTML checks: broken references, duplicate attributes, unsafe URLs,
    // document structure, and accessibility issues that are not visible from tag nesting alone.
    static scanHtmlAdvanced(lines) {
        const issues = [];
        const code = lines.join('\n');
        const e = (offset, msg, hint, kind, sev = 'warning') => {
            const before = code.slice(0, Math.max(0, offset));
            const line = before.split('\n').length;
            const column = offset - before.lastIndexOf('\n');
            issues.push(this.makeIssue(line, msg, hint, kind, column, sev));
        };
        const unquote = value => value == null ? '' : value.replace(/^["']|["']$/g, '');
        const ids = new Map();
        const references = [];
        const tagRe = /<([A-Za-z][\w:-]*)(\s[^<>]*?)?\/?>/g;
        const tagCounts = new Map();
        let tagMatch;
        while ((tagMatch = tagRe.exec(code)) !== null) {
            const tagName = tagMatch[1].toLowerCase();
            const attrs = tagMatch[2] || '';
            const raw = tagMatch[0];
            const tagOffset = tagMatch.index;
            tagCounts.set(tagName, (tagCounts.get(tagName) || 0) + 1);
            const entries = [];
            const attrRe = /([:@A-Za-z_][\w:.-]*)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>\x60]+))?/g;
            let attrMatch;
            while ((attrMatch = attrRe.exec(attrs)) !== null) {
                const name = attrMatch[1].toLowerCase();
                const valueMatch = attrMatch[0].match(/=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>\x60]+))/);
                const value = valueMatch ? (valueMatch[1] ?? valueMatch[2] ?? valueMatch[3] ?? '') : null;
                entries.push({ name, value, offset: tagOffset + raw.indexOf(attrs) + attrMatch.index });
            }
            const attrMap = new Map();
            for (const entry of entries) {
                if (!attrMap.has(entry.name)) attrMap.set(entry.name, []);
                attrMap.get(entry.name).push(entry);
            }
            for (const [name, same] of attrMap) {
                if (same.length > 1) {
                    e(same[1].offset, "Duplicate '" + name + "' attribute on <" + tagName + ">.", "Keep only one " + name + " attribute; browsers use inconsistent duplicate-attribute recovery rules.", "HTML syntax", "error");
                }
            }
            for (const entry of entries) {
                if (entry.value !== null && /\s=\s*[^\s"'=<>\x60]+/.test(attrs.slice(entry.offset - (tagOffset + raw.indexOf(attrs))))) {
                    e(entry.offset, "Unquoted value for '" + entry.name + "' attribute on <" + tagName + ">.", "Quote attribute values so spaces and special characters cannot change the parsed markup.", "HTML syntax", "warning");
                }
                if (entry.name === 'id') {
                    if (!entry.value) e(entry.offset, "Empty id attribute on <" + tagName + ">.", "Give the element a non-empty id or remove the attribute.", "HTML accessibility", "warning");
                    else if (ids.has(entry.value)) e(entry.offset, "Duplicate id=\"" + entry.value + "\" found.", "Every id must be unique in the document.", "HTML accessibility", "error");
                    else ids.set(entry.value, tagOffset);
                }
                if (entry.name === 'for' || entry.name === 'aria-labelledby' || entry.name === 'aria-describedby' || entry.name === 'aria-controls') {
                    for (const ref of unquote(entry.value).split(/\s+/).filter(Boolean)) references.push({ ref, offset: entry.offset, type: entry.name });
                }
                if (entry.name === 'href' || entry.name === 'src' || entry.name === 'action') {
                    const value = unquote(entry.value);
                    if (entry.value !== null && !value.trim()) e(entry.offset, "Empty " + entry.name + " attribute on <" + tagName + ">.", "Provide a real URL or remove the attribute.", "HTML link", "warning");
                    if (/^javascript:/i.test(value)) e(entry.offset, "javascript: URL found in " + entry.name + ".", "Use a real URL or a button event handler instead of executable URL text.", "HTML security", "error");
                }
            }

            const get = name => {
                const found = attrMap.get(name);
                return found && found[0] ? unquote(found[0].value) : null;
            };
            const has = name => attrMap.has(name);
            if (tagName === 'img' && !has('src')) {
                e(tagOffset, "<img> has no src attribute and will render as a broken image.", "Add a valid src or remove the image element.", "HTML resource", "warning");
            }
            if (tagName === 'a') {
                const href = get('href');
                if (href === null && get('role') !== 'button') e(tagOffset, "<a> has no href and is not marked as a button.", "Use <button> for an action or add a real href for navigation.", "HTML accessibility", "warning");
                if (get('target') === '_blank' && !/\b(?:noopener|noreferrer)\b/i.test(get('rel') || '')) {
                    e(tagOffset, "target=\"_blank\" link is missing rel=\"noopener\".", "Add rel=\"noopener noreferrer\" to prevent the opened page from accessing window.opener.", "HTML security", "warning");
                }
            }
            if (tagName === 'iframe' && !has('title')) {
                e(tagOffset, "<iframe> is missing a title.", "Add a concise title so screen-reader users know what the embedded content is.", "HTML accessibility", "warning");
            }
            if (tagName === 'script' && has('src')) {
                const src = get('src');
                if (!src) e(tagOffset, "<script src> is empty.", "Provide a script URL or remove the script tag.", "HTML resource", "error");
                if (/^https:\/\//i.test(src || '') && !has('integrity')) {
                    e(tagOffset, "Third-party script has no integrity attribute.", "Use Subresource Integrity where the remote provider supports it, or self-host the dependency.", "HTML security", "info");
                }
            }
            if (tagName === 'link' && /\bstylesheet\b/i.test(get('rel') || '') && !has('href')) {
                e(tagOffset, "Stylesheet link is missing href.", "Add the stylesheet URL or remove the link element.", "HTML resource", "error");
            }
            if (tagName === 'html' && get('lang') === '') {
                e(tagOffset, "<html lang> is empty.", "Set lang to the document language, for example lang=\"en\".", "HTML accessibility", "warning");
            }
            if (tagName === 'input' && has('id') && !has('name') && !/\btype\s*=\s*["'](?:submit|button|reset|image)["']/i.test(raw)) {
                e(tagOffset, "Form input has an id but no name.", "Add name if the control's value should be submitted with the form.", "HTML forms", "info");
            }
            if (/\bon[a-z]+\s*=/i.test(attrs)) {
                e(tagOffset, "Inline event handler found on <" + tagName + ">.", "Prefer addEventListener in a script so behavior stays separate from markup.", "HTML maintainability", "info");
            }
        }

        const firstContent = code.search(/\S/);
        const doctypes = [...code.matchAll(/<!doctype\b/gi)];
        if (doctypes.length > 1) e(doctypes[1].index, "Document contains multiple DOCTYPE declarations.", "Keep exactly one DOCTYPE at the beginning of the document.", "HTML structure", "error");
        if (doctypes.length && firstContent >= 0 && doctypes[0].index !== firstContent) {
            e(doctypes[0].index, "DOCTYPE must be the first non-whitespace content.", "Move <!DOCTYPE html> before comments and other markup.", "HTML structure", "warning");
        }
        if (tagCounts.has('html')) {
            for (const tag of ['html', 'head', 'body']) {
                if ((tagCounts.get(tag) || 0) > 1) {
                    const second = code.toLowerCase().indexOf('<' + tag, code.toLowerCase().indexOf('<' + tag) + 1);
                    e(second >= 0 ? second : code.toLowerCase().indexOf('<' + tag), "Document contains multiple <" + tag + "> elements.", "Use one document-level <" + tag + "> element.", "HTML structure", "error");
                }
            }
            if (!tagCounts.has('head')) e(code.toLowerCase().indexOf('<html'), "Document with <html> is missing <head>.", "Add a <head> section for metadata and the document title.", "HTML structure", "warning");
            if (!tagCounts.has('body')) e(code.toLowerCase().indexOf('<html'), "Document with <html> is missing <body>.", "Add a <body> section for visible content.", "HTML structure", "warning");
        }
        for (const ref of references) {
            if (!ids.has(ref.ref)) {
                e(ref.offset, "'" + ref.type + "=\"" + ref.ref + "\" references an id that does not exist.", "Add id=\"" + ref.ref + "\" to the target element or correct the reference.", "HTML accessibility", "warning");
            }
        }
        return issues;
    }

    // Run the JS and CSS scanners inside inline HTML blocks and shift findings back to
    // the original HTML line numbers.
    static scanHtmlEmbeddedCode(lines) {
        const issues = [];
        const code = lines.join('\n');
        const shift = (found, startLine) => found.map(issue => ({ ...issue, line: issue.line + startLine - 1 }));
        const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
        let match;
        while ((match = scriptRe.exec(code)) !== null) {
            const attrs = match[1] || '';
            if (/\bsrc\s*=/i.test(attrs)) continue;
            const type = (attrs.match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
            if (type && !/(?:javascript|ecmascript|module)/i.test(type)) continue;
            const startLine = code.slice(0, match.index + match[0].indexOf('>') + 1).split('\n').length;
            issues.push(...shift(this.scanJavaScriptTypeScript(match[2].split('\n'), 'Javascript'), startLine));
        }
        const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
        while ((match = styleRe.exec(code)) !== null) {
            const startLine = code.slice(0, match.index + match[0].indexOf('>') + 1).split('\n').length;
            const styleLines = match[1].split('\n');
            issues.push(...shift([...this.scanCssPatterns(styleLines), ...this.scanCssAdvanced(styleLines)], startLine));
        }
        return issues;
    }

    // SQL checks use a quote/comment-aware statement splitter so semicolons and
    // keywords inside string literals do not create false findings.
    static scanSql(lines) {
        const issues = [];
        const code = lines.join('\n');
        const e = (offset, msg, hint, kind, sev = 'warning') => {
            const safeOffset = Math.max(0, Math.min(code.length, offset));
            const before = code.slice(0, safeOffset);
            issues.push(this.makeIssue(before.split('\n').length, msg, hint, kind, safeOffset - before.lastIndexOf('\n'), sev));
        };
        const maskSql = text => {
            let out = '';
            let state = 'normal';
            for (let i = 0; i < text.length; i++) {
                const ch = text[i], next = text[i + 1];
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
                if (state === 'quote') {
                    if (ch === "'" && next === "'") { out += '  '; i++; continue; }
                    if (ch === "'") { out += ' '; state = 'normal'; }
                    else out += ch === '\n' ? '\n' : ' ';
                    continue;
                }
                if ((ch === '-' && next === '-') || ch === '#') {
                    out += ch === '#' ? ' ' : '  ';
                    if (ch === '-') i++;
                    state = 'line';
                    continue;
                }
                if (ch === '/' && next === '*') { out += '  '; i++; state = 'block'; continue; }
                if (ch === "'") { out += ' '; state = 'quote'; continue; }
                out += ch;
            }
            return out;
        };
        const splitTopLevel = text => {
            const parts = [];
            let start = 0, depth = 0, quote = false;
            for (let i = 0; i < text.length; i++) {
                const ch = text[i], next = text[i + 1];
                if (quote) {
                    if (ch === "'" && next === "'") { i++; continue; }
                    if (ch === "'") quote = false;
                    continue;
                }
                if (ch === "'") { quote = true; continue; }
                if (ch === '(') depth++;
                else if (ch === ')') depth = Math.max(0, depth - 1);
                else if (ch === ',' && depth === 0) { parts.push(text.slice(start, i).trim()); start = i + 1; }
            }
            parts.push(text.slice(start).trim());
            return parts.filter(Boolean);
        };
        const matchingParen = (text, open) => {
            let depth = 0, quote = false;
            for (let i = open; i < text.length; i++) {
                const ch = text[i], next = text[i + 1];
                if (quote) {
                    if (ch === "'" && next === "'") { i++; continue; }
                    if (ch === "'") quote = false;
                    continue;
                }
                if (ch === "'") { quote = true; continue; }
                if (ch === '(') depth++;
                else if (ch === ')' && --depth === 0) return i;
            }
            return -1;
        };
        const chunks = [];
        let state = 'normal', start = 0, quoteStart = -1, commentStart = -1;
        for (let i = 0; i < code.length; i++) {
            const ch = code[i], next = code[i + 1];
            if (state === 'line') {
                if (ch === '\n') state = 'normal';
                continue;
            }
            if (state === 'block') {
                if (ch === '*' && next === '/') { i++; state = 'normal'; }
                continue;
            }
            if (state === 'quote') {
                if (ch === "'" && next === "'") { i++; continue; }
                if (ch === "'") state = 'normal';
                continue;
            }
            if ((ch === '-' && next === '-') || ch === '#') {
                commentStart = i;
                if (ch === '-') i++;
                state = 'line';
                continue;
            }
            if (ch === '/' && next === '*') { commentStart = i; i++; state = 'block'; continue; }
            if (ch === "'") { quoteStart = i; state = 'quote'; continue; }
            if (ch === ';') { chunks.push({ text: code.slice(start, i), start }); start = i + 1; }
        }
        if (state === 'quote') e(quoteStart, "Unterminated SQL string literal.", "Close the string with a matching single quote; escape a quote as ''.", "SQL syntax", "error");
        if (state === 'block') e(commentStart, "Unterminated SQL block comment.", "Add */ to close the comment.", "SQL syntax", "error");
        if (start < code.length) chunks.push({ text: code.slice(start), start });

        for (const chunk of chunks) {
            const raw = chunk.text;
            const masked = maskSql(raw);
            const sql = masked.replace(/\s+/g, ' ').trim();
            if (!sql) continue;
            const upper = sql.toUpperCase();
            const leading = raw.search(/\S/);
            const at = needle => {
                const index = sql.indexOf(needle);
                return chunk.start + Math.max(0, leading) + Math.max(0, index);
            };
            const startOffset = chunk.start + Math.max(0, leading);

            if (/^UPDATE\b/.test(upper)) {
                if (!/\bSET\b/.test(upper)) e(startOffset, "UPDATE statement is missing SET.", "Add SET column = value before the optional WHERE clause.", "SQL syntax", "error");
                if (!/\bWHERE\b/.test(upper)) e(startOffset, "UPDATE has no WHERE clause and will modify every row.", "Add a restrictive WHERE clause or make the full-table update explicit.", "SQL safety", "warning");
            }
            if (/^DELETE\s+FROM\b/.test(upper) && !/\bWHERE\b/.test(upper)) {
                e(startOffset, "DELETE has no WHERE clause and will remove every row.", "Add a restrictive WHERE clause or confirm that a full-table delete is intended.", "SQL safety", "warning");
            }
            if (/^(?:DROP|TRUNCATE)\b/.test(upper)) {
                e(startOffset, "Destructive SQL statement detected.", "Verify the target and consider a transaction or backup before running it.", "SQL safety", "warning");
            }
            if (/\bSELECT\s+\*/.test(upper)) {
                e(at('SELECT'), "SELECT * couples the query to every column and can fetch unnecessary data.", "List the columns the caller actually needs.", "SQL performance", "info");
            }
            for (const m of upper.matchAll(/(?:=|<>|!=|<|>)\s*NULL\b/g)) {
                e(at(m[0]), "NULL is compared with an operator; the comparison will not behave as intended.", "Use IS NULL or IS NOT NULL instead of =, <>, or != NULL.", "SQL logic", "error");
            }
            if (/\b(?:WHERE|OR|AND)\s+(?:1\s*=\s*1|TRUE\s*=\s*TRUE)\b/.test(upper) || /\b(?:OR|AND)\s+1\s*=\s*1\b/.test(raw.toUpperCase())) {
                e(at('WHERE'), "Tautological SQL predicate detected.", "Remove the always-true condition; it can hide a missing filter or enable SQL injection.", "SQL security", "warning");
            }
            if (/\bIN\s*\(\s*\)/.test(upper) || /\bVALUES\s*\(\s*\)/.test(upper)) {
                e(startOffset, "Empty IN or VALUES list is invalid SQL.", "Provide at least one value or handle the empty collection before building the query.", "SQL syntax", "error");
            }
            if (/\bLIMIT\s*-\d+\b|\bOFFSET\s*-\d+\b/.test(upper)) {
                e(startOffset, "LIMIT/OFFSET cannot use a negative value.", "Use a non-negative integer or validate the pagination input.", "SQL syntax", "error");
            }
            if (/\bBETWEEN\b/.test(upper)) {
                const between = upper.indexOf('BETWEEN');
                const tail = upper.slice(between).split(/\b(?:WHERE|GROUP BY|ORDER BY|LIMIT|UNION)\b/)[0];
                if (!/\bAND\b/.test(tail)) e(at('BETWEEN'), "BETWEEN expression is missing its AND boundary.", "Use BETWEEN lower_value AND upper_value.", "SQL syntax", "error");
            }
            const caseCount = (upper.match(/\bCASE\b/g) || []).length;
            const endCount = (upper.match(/\bEND\b/g) || []).length;
            if (caseCount > endCount) e(startOffset, "CASE expression is missing END.", "Close every CASE expression with END.", "SQL syntax", "error");

            for (const join of upper.matchAll(/\b(?:(?:LEFT|RIGHT|FULL|INNER|OUTER|CROSS|NATURAL)\s+)?JOIN\b/g)) {
                const beforeJoin = upper.slice(Math.max(0, join.index - 16), join.index);
                if (/\b(?:CROSS|NATURAL)\s*$/.test(beforeJoin)) continue;
                const after = upper.slice(join.index + join[0].length);
                const boundary = after.search(/\b(?:JOIN|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|UNION)\b/);
                const segment = boundary >= 0 ? after.slice(0, boundary) : after;
                if (!/\bON\b|\bUSING\s*\(/.test(segment)) {
                    e(chunk.start + Math.max(0, leading) + join.index, "JOIN is missing an ON or USING condition.", "Add the join relationship explicitly or use CROSS JOIN when a Cartesian product is intentional.", "SQL logic", "warning");
                }
            }

            const from = upper.match(/\bFROM\b/);
            if (from) {
                const fromTail = upper.slice(from.index + 4).split(/\b(?:WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|UNION)\b/)[0];
                if (splitTopLevel(fromTail).length > 1) {
                    e(at('FROM') + 5, "Implicit comma join found in FROM.", "Use an explicit JOIN with an ON condition so relationships are visible and less error-prone.", "SQL logic", "warning");
                }
            }
            if (/^SELECT\s*(?:FROM|WHERE|GROUP BY|ORDER BY|LIMIT)\b/.test(upper)) {
                e(startOffset, "SELECT statement is missing its select list.", "Add one or more expressions between SELECT and the next clause.", "SQL syntax", "error");
            }
            if (/^INSERT\s+INTO\b/.test(upper) && !/\b(?:VALUES|SELECT|DEFAULT\s+VALUES|SET)\b/.test(upper)) {
                e(startOffset, "INSERT statement is missing VALUES, SELECT, or DEFAULT VALUES.", "Provide the rows to insert.", "SQL syntax", "error");
            }
            if (/\bHAVING\b/.test(upper) && !/\bGROUP\s+BY\b/.test(upper) && !/\b(?:COUNT|SUM|AVG|MIN|MAX)\s*\(/.test(upper)) {
                e(at('HAVING'), "HAVING is used without GROUP BY or an aggregate expression.", "Move the filter to WHERE or add the intended grouping/aggregate.", "SQL logic", "warning");
            }
            const limitIndex = upper.indexOf('LIMIT');
            const orderIndex = upper.indexOf('ORDER BY');
            if (limitIndex >= 0 && orderIndex > limitIndex) {
                e(chunk.start + Math.max(0, leading) + orderIndex, "ORDER BY appears after LIMIT.", "Place ORDER BY before LIMIT/OFFSET.", "SQL syntax", "error");
            }
            if (/\b==\b/.test(upper)) e(at('=='), "SQL uses a single equals sign for comparison.", "Replace == with =.", "SQL syntax", "error");

            if (/^CREATE\s+TABLE\b/.test(upper)) {
                const open = sql.indexOf('(');
                const close = open >= 0 ? matchingParen(sql, open) : -1;
                if (open < 0 || close < 0) {
                    e(startOffset, "CREATE TABLE is missing a complete column definition list.", "Add a parenthesized list of columns and constraints.", "SQL syntax", "error");
                } else {
                    const definitions = splitTopLevel(sql.slice(open + 1, close));
                    if (!definitions.length) e(startOffset + open, "CREATE TABLE has no columns or constraints.", "Add at least one column definition.", "SQL syntax", "error");
                    const names = new Set();
                    for (const definition of definitions) {
                        const first = definition.match(/^["\x60\[]?([A-Za-z_][\w$]*)["\x60\]]?/);
                        const keyword = (first ? first[1] : '').toUpperCase();
                        if (!first || /^(PRIMARY|UNIQUE|CONSTRAINT|FOREIGN|CHECK|INDEX|KEY)$/.test(keyword)) continue;
                        if (names.has(keyword)) e(startOffset, "CREATE TABLE repeats column '" + first[1] + "'.", "Rename or remove the duplicate column.", "SQL schema", "error");
                        names.add(keyword);
                        const rest = definition.slice(first[0].length).trim();
                        if (!rest || /^(?:,|CONSTRAINT)\s*$/i.test(rest)) {
                            e(startOffset, "Column '" + first[1] + "' is missing a data type.", "Add a type such as INTEGER, TEXT, BOOLEAN, or a dialect-specific type.", "SQL schema", "error");
                        }
                    }
                }
            }
            // Preserve quoted values for arity checks; the masked form turns string
            // literals into whitespace and previously made valid INSERTs look short.
            const insertSql = raw.replace(/\s+/g, ' ').trim();
            const insert = insertSql.match(/^INSERT\s+INTO\s+[^\s(]+\s*(?:\(([^)]*)\))?\s+VALUES\s*(\(.+\))$/i);
            if (insert && insert[1]) {
                const columns = splitTopLevel(insert[1]);
                const rows = splitTopLevel(insert[2]);
                const hasMismatch = rows.some(row => {
                    const close = row.startsWith('(') ? matchingParen(row, 0) : -1;
                    return close === row.length - 1 && columns.length !== splitTopLevel(row.slice(1, -1)).length;
                });
                if (hasMismatch) {
                    e(startOffset, "INSERT column count does not match value count.", "Provide one value for each listed column.", "SQL syntax", "error");
                }
            }
            if (/^CREATE\s+INDEX\b/.test(upper) && !/\bON\b/.test(upper)) e(startOffset, "CREATE INDEX is missing its ON table clause.", "Use CREATE INDEX name ON table (column).", "SQL syntax", "error");
            if (/^CREATE\s+VIEW\b/.test(upper) && !/\bAS\s+SELECT\b/.test(upper)) e(startOffset, "CREATE VIEW is missing AS SELECT.", "Define the query that supplies the view.", "SQL syntax", "error");
            if (/^ALTER\s+TABLE\b/.test(upper) && !/\b(?:ADD|ALTER|DROP|RENAME)\b/.test(upper)) e(startOffset, "ALTER TABLE has no schema change operation.", "Add ADD, ALTER, DROP, or RENAME with the intended change.", "SQL syntax", "error");

            const unionParts = upper.split(/\bUNION(?:\s+ALL)?\b/);
            if (unionParts.length > 2) {
                const counts = unionParts.map(part => {
                    const select = part.match(/\bSELECT\b([\s\S]*?)(?:\bFROM\b|$)/);
                    return select ? splitTopLevel(select[1]).length : 0;
                }).filter(Boolean);
                if (counts.length > 1 && counts.some(count => count !== counts[0])) {
                    e(startOffset, "UNION branches return different numbers of columns.", "Make every SELECT in the UNION return the same number of expressions.", "SQL logic", "error");
                }
            }
        }
        return issues;
    }

    // Advanced CSS checks
    static scanCssAdvanced(lines) {
        const issues = [];
        const e = (ln, msg, hint, kind, col, sev) => issues.push(this.makeIssue(ln, msg, hint, kind, col ?? null, sev ?? "warning"));
        let importantCount = 0;
        let importantFirstLine = -1;
        let hasColor = false;
        let hasBgColor = false;
        const vendorPrefixProps = {};
        // Track per-rule-block state for duplicate property and margin:auto checks
        let inBlock = false;
        let blockProps = new Map(); // prop -> first line seen
        let blockStartLine = -1;
        let blockHasWidth = false;
        let marginAutoLine = -1;
        lines.forEach((line, idx) => {
            const lineNum = idx + 1;
            const trimmed = line.trim();
            // !important overuse
            if (/!important/i.test(trimmed)) {
                importantCount++;
                if (importantFirstLine === -1) importantFirstLine = lineNum;
            }
            // color without background-color (track both)
            if (/^\s*color\s*:/i.test(trimmed)) hasColor = true;
            if (/^\s*background-color\s*:/i.test(trimmed)) hasBgColor = true;
            // Vendor prefixes: track which vendor-prefixed props exist and whether standard follows
            const vendorMatch = trimmed.match(/^(-webkit-|-moz-|-ms-|-o-)([a-z-]+)\s*:/i);
            if (vendorMatch) {
                const prop = vendorMatch[2];
                if (!vendorPrefixProps[prop]) vendorPrefixProps[prop] = { lines: [], hasStandard: false };
                vendorPrefixProps[prop].lines.push(lineNum);
            }
            // Check if standard property exists on same/nearby lines
            const standardMatch = trimmed.match(/^([a-z][a-z-]+)\s*:/i);
            if (standardMatch && !/^-/.test(trimmed)) {
                const prop = standardMatch[1];
                if (vendorPrefixProps[prop]) vendorPrefixProps[prop].hasStandard = true;
            }
            // Block tracking for duplicate properties, margin:auto, z-index, float, 0px
            if (trimmed.endsWith('{')) {
                inBlock = true;
                blockProps = new Map();
                blockStartLine = lineNum;
                blockHasWidth = false;
                marginAutoLine = -1;
            } else if (trimmed === '}') {
                // Check margin:auto without width
                if (marginAutoLine > 0 && !blockHasWidth) {
                    e(marginAutoLine, "'margin: auto' is set but no 'width' is defined in this rule block.", "margin: auto only centers block elements that have an explicit width.", "CSS layout", null, "info");
                }
                inBlock = false;
                blockProps = new Map();
                blockHasWidth = false;
                marginAutoLine = -1;
            }
            if (inBlock && trimmed.includes(':') && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
                const propMatch = trimmed.match(/^([\w-]+)\s*:/);
                if (propMatch) {
                    const prop = propMatch[1].toLowerCase();
                    // NEW: duplicate property in same rule block
                    if (blockProps.has(prop)) {
                        e(lineNum, `Duplicate CSS property '${prop}' in the same rule block.`, `Remove or merge the duplicate '${prop}' declaration — the second one overrides the first.`, "CSS quality", null, "warning");
                    } else {
                        blockProps.set(prop, lineNum);
                    }
                    // Track width
                    if (prop === 'width') blockHasWidth = true;
                    // Track margin:auto
                    if (prop === 'margin' && /:\s*auto\b/i.test(trimmed)) marginAutoLine = lineNum;
                    // NEW: z-index > 9000
                    if (prop === 'z-index') {
                        const zMatch = trimmed.match(/:\s*(\d+)/);
                        if (zMatch && parseInt(zMatch[1], 10) > 9000) {
                            e(lineNum, `z-index value ${zMatch[1]} is extremely high (> 9000).`, "Avoid arbitrarily large z-index values; use a z-index scale (e.g. 100, 200, 300) for maintainability.", "CSS quality", null, "info");
                        }
                    }
                    // NEW: float usage
                    if (prop === 'float' && !/none/i.test(trimmed)) {
                        e(lineNum, "'float' is used — consider modern layout methods.", "Replace float-based layouts with Flexbox or CSS Grid for simpler, more robust layouts.", "CSS quality", null, "info");
                    }
                    // NEW: 0px instead of 0
                    if (/:\s*0px\b/.test(trimmed)) {
                        e(lineNum, "Value '0px' should be written as just '0' — units are unnecessary on zero.", "Replace '0px' with '0'; CSS does not require units for zero values.", "CSS style", null, "info");
                    }
                    // font-size in px on root/body — accessibility concern (not on components)
                    if (prop === 'font-size' && /:\s*\d+px\b/.test(trimmed)) {
                        // Only flag on html/body selectors, not component-level rules
                        const selector = (lines.slice(Math.max(0, idx - 8), idx).reverse().find(l => /^\s*[a-z][\w\s,:.#[\]>+~*()-]*\s*\{/.test(l.trim())) || '').trim();
                        if (/^(html|body)\s*[\{,]/.test(selector)) {
                            e(lineNum, "'font-size' in 'px' on html/body prevents users from scaling text in their browser.", "Use 'rem' on html/body so all relative sizes scale with user preferences.", "CSS accessibility", null, "info");
                        }
                    }
                }
            }
            // Universal selector warning — only flag when combined with heavy properties, not simple resets
            if (/^\*\s*\{/.test(trimmed) || /,\s*\*\s*\{/.test(trimmed)) {
                // Common reset patterns (margin/padding/box-sizing) are fine — only flag if it sets visual properties
                const nextFewLines = lines.slice(idx + 1, idx + 6).join(' ');
                if (/\b(font-size|color|background|display|position|overflow)\s*:/i.test(nextFewLines)) {
                    e(lineNum, "Universal selector '*' with visual properties applies to every element.", "Scope this to a container: '.container *', or split into targeted selectors.", "CSS performance", null, "info");
                }
            }
        });
        // Report !important overuse (more than 3)
        if (importantCount > 3) {
            e(importantFirstLine > 0 ? importantFirstLine : 1, `!important used ${importantCount} times in this file.`, "Avoid overusing !important; restructure selectors for proper specificity instead.", "CSS quality", null, "warning");
        }
        // Only flag color-without-background if file has multiple color rules (likely a full stylesheet)
        if (hasColor && !hasBgColor && importantCount > 0) {
            e(1, "`color` is set but `background-color` is not defined in this file.", "Set both `color` and `background-color` to ensure readable contrast.", "CSS accessibility", null, "info");
        }
        // Report vendor prefixes without standard property
        for (const [prop, info] of Object.entries(vendorPrefixProps)) {
            if (!info.hasStandard) {
                e(info.lines[0], `Vendor-prefixed property '-*-${prop}' has no standard '${prop}' fallback.`, `Add the standard \`${prop}\` property after the vendor-prefixed versions.`, "CSS compatibility", null, "warning");
            }
        }
        return issues;
    }
    // Instant recognition from a single unmistakable token — runs before full scoring
    static earlyHint(code) {
        const hints = [
            [/<\?php/i,                                          'PHP'],
            [/<!DOCTYPE\s+html>/i,                               'HTML'],
            [/^#!\/bin\/(bash|sh)\b/m,                           'Bash'],
            [/^#!\/usr\/bin\/(perl|env\s+perl)/m,               'Perl'],
            [/^#!\/usr\/bin\/(ruby|env\s+ruby)/m,               'Ruby'],
            [/^#!\/usr\/bin\/(python3?|env\s+python3?)/m,       'Python'],
            [/\bIDENTIFICATION\s+DIVISION\b/i,                  'COBOL'],
            [/\bIMPLICIT\s+NONE\b/i,                            'Fortran'],
            [/\bPROGRAM-ID\b/i,                                  'COBOL'],
            [/const\s+std\s*=\s*@import\s*\("std"\)/,           'Zig'],
            [/@import\s*\("std"\)/,                              'Zig'],
            [/\bcomptime\b/,                                     'Zig'],
            [/section\s+\.(text|data|bss)\b/i,                  'Assembly'],
            [/\bglobal\s+_start\b/,                             'Assembly'],
            [/\bdefmodule\b/,                                    'Elixir'],
            [/\bIO\.puts\b/,                                     'Elixir'],
            [/^-module\s*\(/m,                                   'Erlang'],
            [/\bio:format\b/,                                    'Erlang'],
            [/\[<EntryPoint>\]/,                                 'F#'],
            [/\bprintfn\b/,                                      'F#'],
            [/\blet\s*\(\s*\)\s*=/,                              'OCaml'],
            [/\bPrintf\.printf\b/,                               'OCaml'],
            [/^\s*\(defn\b/m,                                    'Clojure'],
            [/^\s*\(ns\s+\w/m,                                   'Clojure'],
            [/\bputStrLn\b/,                                     'Haskell'],
            [/\bmain\s*=\s*do\b/,                               'Haskell'],
            [/\bimport\s+'package:flutter/,                      'Dart'],
            [/\bStatelessWidget\b|\bStatefulWidget\b/,           'Dart'],
            [/\battr_(reader|writer|accessor)\b/,               'Ruby'],
            [/\bdo\s*\|[\w,\s]+\|/,                             'Ruby'],
            [/@State\b|@Binding\b|@Published\b/,                'Swift'],
            [/\bguard\s+let\b/,                                  'Swift'],
            [/\bdata\s+class\s+\w+/,                            'Kotlin'],
            [/\bwhen\s*\(\w+\)\s*\{/,                           'Kotlin'],
            [/\bcase\s+class\b/,                                 'Scala'],
            [/\bobject\s+\w+\s+extends\b/,                      'Scala'],
            [/\bprintln!\s*\(/,                                  'Rust'],
            [/\blet\s+mut\b/,                                    'Rust'],
            [/\bcout\s*<</,                                      'C++'],
            [/\bstd::/,                                          'C++'],
            [/\bSystem\.out\.print/,                             'Java'],
            [/\bpublic\s+static\s+void\s+main\b/,               'Java'],
            [/\bConsole\.WriteLine\b/,                           'C#'],
            [/\busing\s+System\b/,                               'C#'],
            [/^package\s+\w+\s*$/m,                              'Go'],
            [/\bfmt\.Print(?:ln|f)?\b/,                         'Go'],
            [/\bggplot\s*\(/,                                    'R'],
            [/\bdata\.frame\s*\(/,                               'R'],
            [/\bipairs\s*\(|\bpairs\s*\(/,                      'Lua'],
            [/\bIPO\b|\bWRITE\s*\(\s*\*\s*,/i,                 'Fortran'],
            [/\bputs\b.*\bend\b/s,                               'Ruby'],
            [/\bnim\s+import\b|\becho\s+"/,                      'Nim'],
            [/\bwriteln\s*\(\s*["']/,                            'Pascal'],
            [/\bBEGIN\b[\s\S]*\bEND\b/,                         'Pascal'],
            [/^\?-\s/m,                                          'Prolog'],
            [/\?-\s*[\w]+\s*\(/,                                 'Prolog'],
            [/^\s*\(defun\b/m,                                   'Lisp'],
            [/^\s*\(format\s+t\b/m,                             'Lisp'],
            [/\b@\[[\w.]+\]/,                                    'Julia'],
            [/\busing\s+\w+(?:,\s*\w+)*\s*$/m,                  'Julia'],
        ];
        for (const [pattern, lang] of hints) {
            if (pattern.test(code)) return lang;
        }
        return null;
    }
    static detectLanguage(code) {
        if (!code || code.trim().length < 3) return null;
        const scores = {};
        const add = (lang, pts) => { scores[lang] = (scores[lang] || 0) + pts; };
        // Early hint: a single unmistakable token is enough to tentatively identify
        const hint = this.earlyHint(code);
        if (hint) add(hint, 50);
        // --- Python ---
        if (/^\s*def\s+\w+\s*\(/m.test(code)) add('Python', 20);
        if (/^\s*class\s+\w+.*:/m.test(code)) add('Python', 15);
        if (/\belif\b/.test(code)) add('Python', 20);
        if (/^\s*from\s+\w+\s+import\b/m.test(code)) add('Python', 18);
        if (/\bself\b/.test(code)) add('Python', 15);
        if (/\bNone\b/.test(code) && !/\/\//.test(code)) add('Python', 10);
        if (/\bTrue\b|\bFalse\b/.test(code) && !/\/\//.test(code)) add('Python', 8);
        if (/\blambda\b/.test(code)) add('Python', 12);
        if (/\bprint\s*\(/.test(code) && !/console\./.test(code) && !/System\.out/.test(code) && !/\bprintln\b/.test(code)) add('Python', 10);
        if (/#[^!]/.test(code) && !/\/\//.test(code)) add('Python', 5);
        // --- JavaScript ---
        if (/\bconsole\.log\b/.test(code)) add('Javascript', 22);
        if (/\bdocument\.\w+|\bwindow\.\w+/.test(code)) add('Javascript', 20);
        if (/\bmodule\.exports\b/.test(code)) add('Javascript', 22);
        if (/\brequire\s*\(['"]/.test(code)) add('Javascript', 18);
        if (/\bPromise\b|\basync\s+function\b/.test(code)) add('Javascript', 14);
        if (/\bconst\b|\blet\b/.test(code) && !/:\s*(string|number|boolean)\b/.test(code)) add('Javascript', 8);
        if (/\bfunction\s+\w+\s*\(/.test(code) && !/\bdef\b/.test(code) && !/\bfun\b/.test(code)) add('Javascript', 10);
        if (/=>\s*[{(]/.test(code)) add('Javascript', 10);
        if (/\bnull\b/.test(code) && /\bundefined\b/.test(code)) add('Javascript', 10);
        if (/\bdocument\.getElementById\b/.test(code)) add('Javascript', 22);
        // --- TypeScript ---
        if (/\binterface\s+[A-Z]/.test(code)) add('TypeScript', 28);
        if (/\btype\s+[A-Z]\w*\s*=/.test(code)) add('TypeScript', 25);
        if (/\benum\s+\w+\s*\{/.test(code)) add('TypeScript', 25);
        if (/:\s*(string|number|boolean|void|never|unknown|any)\b/.test(code)) add('TypeScript', 18);
        if (/\bReadonly<|\bPartial<|\bRequired<|\bRecord</.test(code)) add('TypeScript', 28);
        if (/\)\s*:\s*[A-Za-z][\w<>[\]| ]+\s*(=>|\{)/.test(code)) add('TypeScript', 18);
        if (/<[A-Z]\w*>/.test(code) && /\binterface\b|\btype\b/.test(code)) add('TypeScript', 12);
        // --- HTML ---
        if (/<!DOCTYPE\s+html>/i.test(code)) add('HTML', 40);
        if (/<html[\s>]/i.test(code)) add('HTML', 25);
        if (/<\/?(div|span|body|head|script|style|meta|link)\b/i.test(code)) add('HTML', 20);
        if (/<\/\w+>/.test(code) && /<\w[\w-]*[\s>]/.test(code)) add('HTML', 15);
        // --- C++ ---
        if (/#include\s*<\w+>/.test(code)) add('C++', 22);
        if (/\bstd::/.test(code)) add('C++', 25);
        if (/\bcout\s*<</.test(code)) add('C++', 28);
        if (/\btemplate\s*</.test(code)) add('C++', 28);
        if (/\bvector\s*<|\bmap\s*<|\bunordered_map\s*</.test(code)) add('C++', 22);
        if (/\bint\s+main\s*\(\s*\)/.test(code) && /#include/.test(code)) add('C++', 15);
        if (/\bdelete\s+\w+/.test(code) && /\bnew\b/.test(code)) add('C++', 15);
        // --- C ---
        if (/#include\s*<stdio\.h>/.test(code)) add('C', 30);
        if (/\bprintf\s*\(/.test(code) && !/#include\s*<iostream>/.test(code) && !/\bstd::/.test(code)) add('C', 22);
        if (/\bscanf\s*\(/.test(code)) add('C', 22);
        if (/\bmalloc\s*\(|\bcalloc\s*\(|\bfree\s*\(/.test(code)) add('C', 22);
        if (/\bint\s+main\s*\(\s*void\s*\)/.test(code)) add('C', 22);
        if (/#include\s*<string\.h>|#include\s*<stdlib\.h>/.test(code)) add('C', 15);
        // --- Java ---
        if (/\bpublic\s+static\s+void\s+main\s*\(/.test(code)) add('Java', 35);
        if (/\bSystem\.out\.print/.test(code)) add('Java', 28);
        if (/\bpublic\s+class\s+[A-Z]/.test(code)) add('Java', 22);
        if (/\bimport\s+java\./.test(code)) add('Java', 28);
        if (/@Override\b/.test(code)) add('Java', 22);
        if (/\bArrayList\b|\bHashMap\b|\bLinkedList\b/.test(code)) add('Java', 18);
        if (/\bthrows\s+\w+Exception\b/.test(code)) add('Java', 20);
        // --- C# ---
        if (/\bConsole\.Write(?:Line)?\s*\(/.test(code)) add('C#', 28);
        if (/\busing\s+System\b/.test(code)) add('C#', 28);
        if (/\bnamespace\s+\w+/.test(code)) add('C#', 22);
        if (/\bpublic\s+static\s+void\s+Main\s*\(/.test(code)) add('C#', 25);
        if (/\bList<\w+>\b|\bDictionary</.test(code)) add('C#', 18);
        if (/\bforeach\s*\(/.test(code) && /\bvar\b/.test(code)) add('C#', 15);
        if (/\[Serializable\]|\[HttpGet\]|\[ApiController\]/.test(code)) add('C#', 25);
        // --- Go ---
        if (/^package\s+\w+/m.test(code)) add('Go', 28);
        if (/\bfunc\s+main\s*\(\)/.test(code)) add('Go', 28);
        if (/\bfmt\.Print(?:ln|f)?/.test(code)) add('Go', 22);
        if (/:=/.test(code) && /^package\b/m.test(code)) add('Go', 15);
        if (/\bgoroutine\b|\bchan\b|\bselect\b/.test(code)) add('Go', 25);
        if (/\bimport\s+\(/.test(code) && /^package\b/m.test(code)) add('Go', 18);
        // --- Rust ---
        if (/\bfn\s+main\s*\(\)/.test(code)) add('Rust', 25);
        if (/\bprintln!\s*\(/.test(code)) add('Rust', 28);
        if (/\blet\s+mut\b/.test(code)) add('Rust', 22);
        if (/\bimpl\s+\w+/.test(code)) add('Rust', 20);
        if (/\bSome\(|\bNone\b|\bOk\(|\bErr\(/.test(code)) add('Rust', 15);
        if (/\buse\s+std::/.test(code)) add('Rust', 22);
        if (/\bmatch\s+\w+\s*\{/.test(code)) add('Rust', 15);
        if (/\bunwrap\s*\(\)/.test(code)) add('Rust', 12);
        // --- PHP ---
        if (/<\?php/.test(code)) add('PHP', 40);
        if (/\$[a-zA-Z_]\w*/.test(code) && /\becho\b/.test(code)) add('PHP', 22);
        if (/\bforeach\s*\(\s*\$/.test(code)) add('PHP', 22);
        if (/\barray\s*\(/.test(code) && /\$/.test(code)) add('PHP', 15);
        // --- Ruby ---
        if (/^\s*end\s*$/m.test(code)) add('Ruby', 18);
        if (/\bputs\s+/.test(code) && /^\s*end\s*$/m.test(code)) add('Ruby', 20);
        if (/\bdo\s*\|[\w,\s]+\|/.test(code)) add('Ruby', 25);
        if (/\battr_(reader|writer|accessor)\b/.test(code)) add('Ruby', 28);
        if (/=~\s*\//.test(code)) add('Ruby', 18);
        if (/\.each\s+do\b|\bmap\s*\{/.test(code)) add('Ruby', 18);
        // --- Swift ---
        if (/\bimport\s+(Foundation|UIKit|SwiftUI)\b/.test(code)) add('Swift', 35);
        if (/\bguard\s+let\b|\bif\s+let\b/.test(code)) add('Swift', 22);
        if (/@State\b|@Binding\b|@Published\b|@ObservedObject\b/.test(code)) add('Swift', 35);
        if (/\bvar\s+\w+\s*:\s*[A-Z]/.test(code) && /\bfunc\b/.test(code)) add('Swift', 18);
        if (/\bnil\b/.test(code) && /\bfunc\b/.test(code)) add('Swift', 10);
        // --- Kotlin ---
        if (/\bfun\s+main\s*\(/.test(code)) add('Kotlin', 28);
        if (/\bprintln\s*\(/.test(code) && /\bval\b|\bvar\b/.test(code)) add('Kotlin', 22);
        if (/\bdata\s+class\s+\w+/.test(code)) add('Kotlin', 28);
        if (/\bwhen\s*\(/.test(code)) add('Kotlin', 22);
        if (/\bval\s+\w+\s*:/.test(code) && /\bfun\b/.test(code)) add('Kotlin', 15);
        // --- Bash ---
        if (/^#!\/bin\/(bash|sh)/m.test(code)) add('Bash', 40);
        if (/\[\[.*\]\]/.test(code)) add('Bash', 25);
        if (/\bfi\b/.test(code) && /\bthen\b/.test(code)) add('Bash', 22);
        if (/\bdone\b/.test(code) && /\bdo\b/.test(code)) add('Bash', 20);
        if (/\$\{[^}]+\}/.test(code)) add('Bash', 12);
        // --- R ---
        if (/<-\s*\w/.test(code) && !/\bclass\b/.test(code)) add('R', 22);
        if (/\blibrary\s*\(/.test(code)) add('R', 22);
        if (/\bggplot\s*\(|\bdplyr\b|\btidyr\b/.test(code)) add('R', 28);
        if (/\bdata\.frame\s*\(/.test(code)) add('R', 22);
        // --- Lua ---
        if (/\blocal\s+\w+\s*=/.test(code) && /\bend\b/.test(code)) add('Lua', 22);
        if (/\bipairs\s*\(|\bpairs\s*\(/.test(code)) add('Lua', 25);
        if (/\bfunction\s+\w+\s*\(/.test(code) && /\bend\b/.test(code) && !/\bdef\b/.test(code)) add('Lua', 18);
        if (/--[^\n]/.test(code) && /\blocal\b/.test(code)) add('Lua', 12);
        // --- Scala ---
        if (/\bobject\s+\w+\s+extends\b/.test(code)) add('Scala', 28);
        if (/\bcase\s+class\b/.test(code)) add('Scala', 28);
        if (/\bdef\s+\w+\s*\(/.test(code) && /\bval\b/.test(code)) add('Scala', 15);
        if (/\bprintln\s*\(/.test(code) && /\bval\b/.test(code) && /\bdef\b/.test(code)) add('Scala', 15);
        // --- Haskell ---
        if (/\bmain\s*=\s*do\b/.test(code)) add('Haskell', 35);
        if (/\bputStrLn\b|\bputStr\b/.test(code)) add('Haskell', 28);
        if (/\bimport\s+Data\./.test(code)) add('Haskell', 22);
        if (/\s->\s/.test(code) && /\b(where|let|in)\b/.test(code)) add('Haskell', 18);
        // --- Dart ---
        if (/\bvoid\s+main\s*\(\s*\)/.test(code) && /\bprint\s*\(/.test(code)) add('Dart', 25);
        if (/\bimport\s+'package:flutter/.test(code)) add('Dart', 40);
        if (/\bWidget\b|\bStatefulWidget\b|\bStatelessWidget\b/.test(code)) add('Dart', 35);
        // --- Perl ---
        if (/^#!\/usr\/bin\/(perl|env\s+perl)/m.test(code)) add('Perl', 40);
        if (/\buse\s+strict\b/.test(code)) add('Perl', 22);
        if (/\buse\s+warnings\b/.test(code)) add('Perl', 18);
        if (/\bmy\s+\$\w+/.test(code)) add('Perl', 20);
        if (/\bsub\s+\w+\s*\{/.test(code)) add('Perl', 18);
        if (/\bchomp\b/.test(code)) add('Perl', 22);
        if (/\$_\b|\@_\b/.test(code)) add('Perl', 15);
        // --- Elixir ---
        if (/\bdefmodule\b/.test(code)) add('Elixir', 35);
        if (/\bIO\.puts\b/.test(code)) add('Elixir', 28);
        if (/\|>/.test(code) && /\bdef\b/.test(code)) add('Elixir', 20);
        if (/\bdef\s+\w+\s*\(/.test(code) && /\bend\b/.test(code) && /\bdo\b/.test(code)) add('Elixir', 18);
        // --- Erlang ---
        if (/^-module\s*\(/m.test(code)) add('Erlang', 40);
        if (/\bio:format\b/.test(code)) add('Erlang', 28);
        if (/^-export\s*\(/m.test(code)) add('Erlang', 25);
        if (/\bspawn\s*\(|\breceive\b/.test(code)) add('Erlang', 20);
        // --- OCaml ---
        if (/\blet\s*\(\s*\)\s*=/.test(code)) add('OCaml', 35);
        if (/\bPrintf\.printf\b/.test(code)) add('OCaml', 28);
        if (/\blet\s+rec\b/.test(code)) add('OCaml', 22);
        if (/\bmatch\b.+\bwith\b/s.test(code) && !/\bRust\b/.test(code)) add('OCaml', 18);
        if (/\bopen\s+[A-Z]\w+/.test(code)) add('OCaml', 15);
        // --- F# ---
        if (/\[<EntryPoint>\]/.test(code)) add('F#', 40);
        if (/\bprintfn\b/.test(code)) add('F#', 30);
        if (/\bopen\s+System\b/.test(code) && /\bprintfn\b/.test(code)) add('F#', 18);
        if (/\|>/.test(code) && /\blet\b/.test(code) && /\bprintfn\b/.test(code)) add('F#', 15);
        // --- Clojure ---
        if (/^\s*\(ns\s+\w/m.test(code)) add('Clojure', 35);
        if (/^\s*\(defn\b/m.test(code)) add('Clojure', 30);
        if (/^\s*\(println\b/m.test(code)) add('Clojure', 22);
        if (/^\s*\(def\s+\w/m.test(code)) add('Clojure', 18);
        // --- Julia ---
        if (/\busing\s+\w+(?:,\s*\w+)*\s*$/m.test(code)) add('Julia', 25);
        if (/\bfunction\s+\w+\s*\(/.test(code) && /\bend\b/.test(code) && /::\w+/.test(code)) add('Julia', 22);
        if (/\b@show\b|\b@time\b|\b@assert\b/.test(code)) add('Julia', 22);
        if (/::Int(?:64)?|::Float(?:64)?|::String\b/.test(code)) add('Julia', 20);
        if (/\bprintln\s*\(/.test(code) && /\busing\b/.test(code)) add('Julia', 15);
        // --- Lisp ---
        if (/^\s*\(defun\b/m.test(code)) add('Lisp', 35);
        if (/^\s*\(format\s+t\b/m.test(code)) add('Lisp', 28);
        if (/^\s*\(setq\b/m.test(code)) add('Lisp', 22);
        if (/^\s*\(let\s+\(/m.test(code)) add('Lisp', 18);
        // --- Prolog ---
        if (/^\?-\s/m.test(code)) add('Prolog', 35);
        if (/:-\s*use_module\b/.test(code)) add('Prolog', 30);
        if (/\b\w+\s*:-\s*\w+/.test(code)) add('Prolog', 22);
        if (/\bwrite\s*\(/.test(code) && /\.\s*$/m.test(code)) add('Prolog', 15);
        // --- Fortran ---
        if (/\bIMPLICIT\s+NONE\b/i.test(code)) add('Fortran', 35);
        if (/\bPROGRAM\s+\w+/i.test(code) && /\bEND\s+PROGRAM\b/i.test(code)) add('Fortran', 30);
        if (/\bWRITE\s*\(\s*\*\s*,/i.test(code)) add('Fortran', 25);
        if (/\bREAL\s*::|INTEGER\s*::|LOGICAL\s*::/i.test(code)) add('Fortran', 22);
        if (/\bSUBROUTINE\s+\w+/i.test(code)) add('Fortran', 20);
        // --- COBOL ---
        if (/\bIDENTIFICATION\s+DIVISION\b/i.test(code)) add('COBOL', 40);
        if (/\bPROGRAM-ID\b/i.test(code)) add('COBOL', 30);
        if (/\bDATA\s+DIVISION\b|\bPROCEDURE\s+DIVISION\b/i.test(code)) add('COBOL', 25);
        if (/\bDISPLAY\s+["']/.test(code)) add('COBOL', 18);
        if (/\bMOVE\b.+\bTO\b/i.test(code)) add('COBOL', 18);
        // --- Assembly ---
        if (/section\s+\.(text|data|bss)\b/i.test(code)) add('Assembly', 35);
        if (/\bglobal\s+_start\b/.test(code)) add('Assembly', 30);
        if (/\bmov\s+[a-z]{2,3}\s*,/i.test(code)) add('Assembly', 22);
        if (/\bint\s+0x80\b|\bsyscall\b/.test(code)) add('Assembly', 25);
        if (/\bpush\s+\w+|\bpop\s+\w+/.test(code) && /\bret\b/.test(code)) add('Assembly', 20);
        // --- D ---
        if (/\bimport\s+std\.stdio\b/.test(code)) add('D', 35);
        if (/\bwriteln\s*\(/.test(code)) add('D', 25);
        if (/\bimmutable\b/.test(code) && /\bauto\b/.test(code)) add('D', 20);
        if (/\bvoid\s+main\s*\(\s*\)/.test(code) && /\bwriteln\b/.test(code)) add('D', 20);
        // --- Zig ---
        if (/@import\s*\("std"\)/.test(code)) add('Zig', 40);
        if (/\bcomptime\b/.test(code)) add('Zig', 25);
        if (/\bpub\s+fn\s+main\b/.test(code)) add('Zig', 22);
        if (/\bstd\.debug\.print\b/.test(code)) add('Zig', 25);
        if (/\bconst\s+\w+\s*=\s*@import\b/.test(code)) add('Zig', 22);
        // --- Nim ---
        if (/^import\s+\w+/m.test(code) && /\becho\s+"/.test(code)) add('Nim', 30);
        if (/\bproc\s+\w+\s*\(/.test(code)) add('Nim', 25);
        if (/\becho\s+"/.test(code) && /\bvar\b/.test(code)) add('Nim', 18);
        if (/\bwhen\s+isMainModule\b/.test(code)) add('Nim', 30);
        // --- Pascal ---
        if (/\bprogram\s+\w+\s*;/i.test(code)) add('Pascal', 35);
        if (/\bbegin\b/i.test(code) && /\bend\.\s*$/im.test(code)) add('Pascal', 28);
        if (/\bwriteln\s*\(/.test(code) && /\bbegin\b/i.test(code)) add('Pascal', 22);
        if (/\bvar\b/i.test(code) && /\binteger\b|\bstring\b|\breal\b/i.test(code)) add('Pascal', 18);
        if (/\bprocedure\s+\w+/i.test(code)) add('Pascal', 18);
        // Negative scoring: penalize languages when clear contradicting signals are present
        const sub = (lang, pts) => { scores[lang] = (scores[lang] || 0) - pts; };
        if (/\bconsole\.log\b/.test(code) || /\bdocument\.\w/.test(code)) { sub('Python', 20); sub('Java', 10); sub('Go', 10); }
        if (/\bSystem\.out\.print\b/.test(code)) { sub('Javascript', 15); sub('Python', 15); sub('Go', 10); }
        if (/\bdef\s+\w+\s*\(/.test(code) && /\bself\b/.test(code)) { sub('Javascript', 10); sub('Ruby', 10); }
        if (/\belif\b/.test(code)) { sub('Javascript', 15); sub('Java', 15); sub('Go', 15); }
        if (/<\?php/.test(code)) { sub('Javascript', 20); sub('Python', 20); }
        if (/\bfn\s+main\b/.test(code) && /\blet\s+mut\b/.test(code)) { sub('Javascript', 15); sub('Go', 15); }
        if (/\bpackage\s+main\b/.test(code) && /\bfunc\b/.test(code)) { sub('Rust', 10); sub('Javascript', 10); }
        if (/\bimport\s+java\.\w/.test(code)) { sub('Kotlin', 5); sub('Scala', 5); sub('C#', 10); }
        if (/\busing\s+System\b/.test(code)) { sub('Java', 15); sub('Javascript', 10); }
        if (/\bprintln!\s*\(/.test(code)) { sub('Kotlin', 10); sub('Javascript', 10); }
        // Clamp negative scores to 0
        Object.keys(scores).forEach(k => { if (scores[k] < 0) scores[k] = 0; });
        const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        if (sorted.length === 0) return null;
        const [topLang, topScore] = sorted[0];
        const runnerUp = sorted[1] ? sorted[1][1] : 0;
        if (topScore >= 10 && topScore - runnerUp >= 8) {
            const confidence = topScore >= 35 ? 'confirmed' : topScore >= 18 ? 'tentative' : null;
            if (!confidence) return null;
            return { lang: topLang, score: topScore, confidence, ext: JungleIntelligence.getDefaultExtension(topLang) || '.txt' };
        }
        return null;
    }
}
