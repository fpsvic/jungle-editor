// Tree-sitter AST service. Grammars load only for languages the user scans.
class JungleAstScanner {
    static runtime = null;
    static loading = null;
    static languages = new Map();
    static names = { Javascript:'javascript', TypeScript:'typescript', Python:'python', Java:'java', C:'c', 'C++':'cpp', 'C#':'c_sharp', Go:'go', Rust:'rust', Ruby:'ruby', PHP:'php', Lua:'lua', Bash:'bash', SQL:'sql', HTML:'html', CSS:'css', JSON:'json', Kotlin:'kotlin', Swift:'swift', Scala:'scala', Haskell:'haskell', Dart:'dart', Elixir:'elixir', Erlang:'erlang', Clojure:'clojure', OCaml:'ocaml', Perl:'perl', R:'r', Julia:'julia', Nim:'nim', Zig:'zig', Solidity:'solidity', HCL:'hcl', Nix:'nix', Assembly:'asm', Fortran:'fortran', COBOL:'cobol', Pascal:'pascal', Prolog:'prolog', Lisp:'commonlisp', Groovy:'groovy', GDScript:'gdscript', Apex:'apex' };
    static async parser() {
        if (this.runtime) return this.runtime;
        if (!this.loading) this.loading = new Promise((resolve, reject) => {
            const done = () => window.TreeSitter.init({ locateFile: () => 'https://cdn.jsdelivr.net/npm/web-tree-sitter@0.25.10/tree-sitter.wasm' }).then(() => { this.runtime = window.TreeSitter; resolve(this.runtime); }, reject);
            if (window.TreeSitter) return done();
            const script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/web-tree-sitter@0.25.10/tree-sitter.js'; script.onload = done; script.onerror = reject; document.head.appendChild(script);
        });
        return this.loading;
    }
    static async language(name) {
        const grammar = this.names[name]; if (!grammar) throw new Error('No AST grammar: ' + name);
        if (!this.languages.has(grammar)) { const Parser = await this.parser(); this.languages.set(grammar, await Parser.Language.load(`https://cdn.jsdelivr.net/npm/tree-sitter-wasm@1.0.7/${grammar}/tree-sitter-${grammar}.wasm`)); }
        return this.languages.get(grammar);
    }
    static async scan(name, source) {
        const Parser = await this.parser(), parser = new Parser(); parser.setLanguage(await this.language(name));
        const tree = parser.parse(String(source || '')), issues = [];
        const visit = node => { if (node.type === 'ERROR' || node.isMissing) { const p = node.startPosition; issues.push({ line:p.row+1, column:p.column+1, severity:'error', kind:'AST syntax', msg:node.isMissing ? 'Missing required syntax.' : 'Invalid syntax.', hint:'Fix the highlighted syntax.' }); return; } for (const child of node.children) visit(child); };
        visit(tree.rootNode); tree.delete?.(); parser.delete?.(); return issues;
    }
}
