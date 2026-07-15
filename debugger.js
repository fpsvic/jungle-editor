// JungleDebugger applies conservative, mechanical fixes reported by JungleScanner.
// It never guesses at semantic intent; findings it cannot safely repair remain in Console.
class JungleDebugger {
    static repair(code, issues) {
        let text = String(code || ''), changed = 0;
        for (const issue of issues || []) {
            const line = Number(issue.line) - 1;
            const rows = text.split('\n'); if (line < 0 || line >= rows.length) continue;
            const before = rows[line]; let after = before;
            if (/missing a trailing colon/i.test(issue.msg)) after = before.replace(/\s*$/, ':');
            else if (/print statement is missing parentheses/i.test(issue.msg)) after = before.replace(/^\s*print\s+(.+)$/, (_, value) => before.match(/^\s*/)[0] + `print(${value})`);
            else if (/loose equality/i.test(issue.msg)) after = before.replace(/([^=])==([^=])/, '$1===$2');
            else if (/Python does not use '==='/.test(issue.msg)) after = before.replace(/===/g, '==');
            else if (/console\.log\(\) debug statement/i.test(issue.msg)) after = before.replace(/^\s*console\.log\([^\n]*\);?\s*$/, '');
            else if (/Expected an indented block/i.test(issue.msg) && line + 1 < rows.length && rows[line + 1].trim()) {
                const indent = (before.match(/^\s*/) || [''])[0]; rows[line + 1] = indent + '    ' + rows[line + 1].trimStart(); text = rows.join('\n'); changed++; continue;
            }
            if (after !== before) { rows[line] = after; text = rows.join('\n'); changed++; }
        }
        return { code: text, changed };
    }
}
