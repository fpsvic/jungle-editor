// JungleDebugger applies conservative, mechanical fixes reported by JungleScanner.
// It never guesses at semantic intent; findings it cannot safely repair remain in Console.
class JungleDebugger {
    static errorCount(issues) { return (issues || []).filter(issue => issue.severity === 'error').length; }
    static repair(code, issues, language) {
        let text = String(code || ''), changed = 0, fixes = [];
        for (const issue of issues || []) {
            const line = Number(issue.line) - 1;
            const rows = text.split('\n'); if (line < 0 || line >= rows.length) continue;
            const before = rows[line]; let after = before;
            if (language === 'Python' && /missing a trailing colon/i.test(issue.msg) && /\b(?:if|elif|else|for|while|def|class|try|except|finally|with|match|case)\b/.test(before)) after = before.replace(/\s*$/, ':');
            else if (language === 'Python' && /print statement is missing parentheses/i.test(issue.msg)) after = before.replace(/^(\s*)print\s+(.+)$/, '$1print($2)');
            else if ((language === 'Javascript' || language === 'TypeScript') && /loose equality/i.test(issue.msg)) after = before.replace(/(^|[^=!])==(?!=)/, '$1===');
            else if (language === 'Python' && /does not use '==='/.test(issue.msg)) after = before.replace(/===/g, '==');
            else if (/Expected an indented block/i.test(issue.msg) && line + 1 < rows.length && rows[line + 1].trim()) {
                const indent = (before.match(/^\s*/) || [''])[0]; rows[line + 1] = indent + '    ' + rows[line + 1].trimStart(); text = rows.join('\n'); changed++; continue;
            }
            if (after !== before) { rows[line] = after; text = rows.join('\n'); changed++; fixes.push({ line: line + 1, message: issue.msg }); }
        }
        return { code: text, changed, fixes };
    }
    static debugFile(code, language, scan) {
        const originalIssues = scan(language, code);
        const proposal = this.repair(code, originalIssues, language);
        if (!proposal.changed) return { code, changed: 0, accepted: false, before: originalIssues, after: originalIssues, fixes: [] };
        const afterIssues = scan(language, proposal.code);
        const beforeErrors = this.errorCount(originalIssues), afterErrors = this.errorCount(afterIssues);
        // Never write a proposal that fails to improve the measured error state.
        const accepted = afterErrors < beforeErrors || (beforeErrors === 0 && afterIssues.length < originalIssues.length);
        return { code: accepted ? proposal.code : code, changed: accepted ? proposal.changed : 0, accepted, before: originalIssues, after: accepted ? afterIssues : originalIssues, fixes: accepted ? proposal.fixes : [] };
    }
}
