// scanner2.js — continuation of JungleScanner (see scanner.js).
// These methods are split out of the main class to keep each file manageable. They are
// attached to the same JungleScanner constructor, so 'this' inside them still refers to
// JungleScanner exactly as when they lived in the class body. This file MUST load after
// scanner.js (which defines the class) and before any code that runs a scan.
'use strict';

    // Advanced HTML checks
JungleScanner.scanHtmlPatterns = function (lines) {
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
JungleScanner.scanHtmlAdvanced = function (lines) {
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
        // Heading order is a cheap, high-value accessibility signal. Only report a
        // skipped level after an H1/H2 exists so component fragments are not penalized.
        let previousHeading = 0;
        for (const match of code.matchAll(/<h([1-6])\b[^>]*>/gi)) {
            const level = Number(match[1]);
            if (previousHeading && level > previousHeading + 1) {
                e(match.index, "Heading level jumps from h" + previousHeading + " to h" + level + ".", "Use headings in order so the document outline remains understandable.", "HTML accessibility", "info");
            }
            previousHeading = level;
        }
        // Form controls need an accessible name. Restrict this to controls with an id
        // but no label/ARIA text; placeholders and visual-only controls are too ambiguous.
        const labelled = new Set([...code.matchAll(/<label\b[^>]*\bfor\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(m => m[1]));
        for (const match of code.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
            const attrs = match[2] || '';
            const id = (attrs.match(/\bid\s*=\s*["']([^"']+)["']/i) || [])[1];
            const type = (attrs.match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1] || 'text';
            if (id && !labelled.has(id) && !/\b(?:aria-label|aria-labelledby)\s*=/i.test(attrs) && !/^(?:hidden|submit|button|reset|image)$/i.test(type)) {
                e(match.index, "Form control '" + id + "' has no associated label.", "Add <label for=\"" + id + "\"> or an aria-label so the control has an accessible name.", "HTML accessibility", "info");
            }
        }
        return issues;
    }

    // Run the JS and CSS scanners inside inline HTML blocks and shift findings back to
    // the original HTML line numbers.
JungleScanner.scanHtmlEmbeddedCode = function (lines) {
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
JungleScanner.scanSql = function (lines) {
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
JungleScanner.scanCssAdvanced = function (lines) {
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
JungleScanner.earlyHint = function (code) {
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
JungleScanner.detectLanguage = function (code) {
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
