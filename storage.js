// --- User settings (persisted, separate from project data) ---
class JungleSettings {
    static DEFAULTS = { disableAnalysis: false, theme: 'midnight', executionMode: 'interpreter' };
    static _cache = null;
    static all() {
        if (this._cache) return this._cache;
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem('jungle_settings') || '{}'); } catch (e) {}
        this._cache = Object.assign({}, this.DEFAULTS, saved);
        return this._cache;
    }
    static get(key) { return this.all()[key]; }
    static set(key, value) {
        const a = this.all();
        a[key] = value;
        this._cache = a;
        try { localStorage.setItem('jungle_settings', JSON.stringify(a)); } catch (e) {}
    }
}

class JungleStorage {
    static getProjects() {
        const data = localStorage.getItem('jungle_sandbox_projects');
        if (data) {
            try { return this.normalizeProjects(JSON.parse(data)); } catch(e) {
                // localStorage parse failed — try IDB synchronously is not possible,
                // so return default and kick off an async IDB recovery
                this.loadFromIDB().then(projects => {
                    if (projects) localStorage.setItem('jungle_sandbox_projects', JSON.stringify(projects));
                }).catch(() => {});
                return this.getDefaultProjects();
            }
        }
        return this.getDefaultProjects();
    }
    static saveProjects(list) {
        localStorage.setItem('jungle_sandbox_projects', JSON.stringify(list));
        this.saveToIDB(list);
        this.updateStorageBadge();
    }
    static getDefaultProjects() { return []; }
    // --- Storage size ---
    static getStorageSize() {
        const data = localStorage.getItem('jungle_sandbox_projects') || '';
        const bytes = new TextEncoder().encode(data).length;
        let formatted;
        if (bytes >= 1073741824) formatted = (bytes / 1073741824).toFixed(2) + ' GB';
        else if (bytes >= 1048576) formatted = (bytes / 1048576).toFixed(2) + ' MB';
        else if (bytes >= 1024) formatted = (bytes / 1024).toFixed(2) + ' KB';
        else formatted = bytes + ' Bytes';
        return { formatted, bytes };
    }
    static updateStorageBadge() {
        const badge = document.getElementById('storage-size-badge');
        if (badge) badge.textContent = this.getStorageSize().formatted;
    }
    // --- IndexedDB backup ---
    static _openIDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('JungleEditorDB', 1);
            req.onupgradeneeded = e => e.target.result.createObjectStore('projects');
            req.onsuccess = e => resolve(e.target.result);
            req.onerror = e => reject(e.target.error);
        });
    }
    static saveToIDB(projects) {
        this._openIDB().then(db => {
            const tx = db.transaction('projects', 'readwrite');
            tx.objectStore('projects').put(projects, 'all');
        }).catch(() => {});
    }
    static loadFromIDB() {
        return this._openIDB().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction('projects', 'readonly');
            const req = tx.objectStore('projects').get('all');
            req.onsuccess = e => resolve(e.target.result || null);
            req.onerror = e => reject(e.target.error);
        }));
    }
    static normalizeProjects(list) {
        if (!Array.isArray(list)) return [];
        return list.map((project, index) => {
            const files = project && project.files && typeof project.files === 'object' ? project.files : { 'index.html': '' };
            if (Object.keys(files).length === 0) files['index.html'] = '';
            const fileNames = Object.keys(files);
            const currentFile = project && files[project.currentFile] !== undefined ? project.currentFile : fileNames[0];
            const lang = (project && project.lang) || JungleIntelligence.languageFromFilename(currentFile, 'HTML');
            return {
                id: (project && project.id) || `proj_${Date.now()}_${index}`,
                name: (project && project.name) || `Project ${index + 1}`,
                files,
                folders: Array.isArray(project && project.folders) ? project.folders : [],
                currentFile,
                lang
            };
        });
    }
}
class JungleIntelligence {
    static languageExtensions = {
        'HTML': '.html',
        'Javascript': '.js',
        'TypeScript': '.ts',
        'Python': '.py',
        'C++': '.cpp',
        'C': '.c',
        'Java': '.java',
        'C#': '.cs',
        'Ruby': '.rb',
        'Go': '.go',
        'Rust': '.rs',
        'PHP': '.php',
        'Swift': '.swift',
        'Kotlin': '.kt',
        'Scala': '.scala',
        'R': '.r',
        'Perl': '.pl',
        'Haskell': '.hs',
        'Julia': '.jl',
        'Lua': '.lua',
        'Clojure': '.clj',
        'Elixir': '.ex',
        'Erlang': '.erl',
        'OCaml': '.ml',
        'F#': '.fs',
        'Dart': '.dart',
        'Bash': '.sh',
        'Fortran': '.f90',
        'COBOL': '.cob',
        'D': '.d',
        'Zig': '.zig',
        'Nim': '.nim',
        'Assembly': '.asm',
        'Lisp': '.lisp',
        'Prolog': '.pl',
        'Pascal': '.pas'
    };
    static extensionLanguages = {
        '.html': 'HTML',
        '.htm': 'HTML',
        '.js': 'Javascript',
        '.mjs': 'Javascript',
        '.cjs': 'Javascript',
        '.ts': 'TypeScript',
        '.py': 'Python',
        '.cpp': 'C++',
        '.cc': 'C++',
        '.cxx': 'C++',
        '.c': 'C',
        '.java': 'Java',
        '.cs': 'C#',
        '.rb': 'Ruby',
        '.go': 'Go',
        '.rs': 'Rust',
        '.php': 'PHP',
        '.swift': 'Swift',
        '.kt': 'Kotlin',
        '.scala': 'Scala',
        '.r': 'R',
        '.pl': 'Perl',
        '.hs': 'Haskell',
        '.jl': 'Julia',
        '.lua': 'Lua',
        '.clj': 'Clojure',
        '.ex': 'Elixir',
        '.erl': 'Erlang',
        '.ml': 'OCaml',
        '.fs': 'F#',
        '.dart': 'Dart',
        '.sh': 'Bash',
        '.bash': 'Bash',
        '.f90': 'Fortran',
        '.cob': 'COBOL',
        '.d': 'D',
        '.zig': 'Zig',
        '.nim': 'Nim',
        '.asm': 'Assembly',
        '.s': 'Assembly',
        '.lisp': 'Lisp',
        '.pas': 'Pascal'
    };
    static getExtension(name) {
        const match = String(name || '').toLowerCase().match(/(\.[a-z0-9+#]+)$/);
        return match ? match[1] : "";
    }
    static getDefaultExtension(lang) {
        return this.languageExtensions[lang] || '.txt';
    }
    static languageFromFilename(filename, fallback = 'Javascript') {
        return this.extensionLanguages[this.getExtension(filename)] || fallback;
    }
    static sanitizeFileName(input, lang = 'Javascript', existingFiles = {}) {
        // Support folder paths like "src/main.js" — sanitize each segment individually
        const segments = String(input || '').trim().split('/').map(seg =>
            seg.trim().replace(/[\\:*?"<>|]+/g, '-').replace(/\s+/g, '-').replace(/^-+|-+$/g, '')
        ).filter(Boolean);
        if (segments.length === 0) segments.push('main');
        // Only add extension to the final (file) segment
        const last = segments[segments.length - 1];
        if (!this.getExtension(last)) segments[segments.length - 1] = last + this.getDefaultExtension(lang);
        let name = segments.join('/');
        const base = name.replace(/(\.[^.]+)$/, '');
        const ext = this.getExtension(name);
        let candidate = name;
        let counter = 2;
        while (Object.prototype.hasOwnProperty.call(existingFiles, candidate)) {
            candidate = `${base}-${counter}${ext}`;
            counter++;
        }
        return candidate;
    }
    static guessProjectLanguage(name) {
        const text = String(name || '').toLowerCase();
        if (/python|py|data|math|ai|ml/.test(text)) return 'Python';
        if (/type|ts|typescript/.test(text)) return 'TypeScript';
        if (/html|web|site|page|frontend|browser/.test(text)) return 'HTML';
        if (/java\b|android/.test(text)) return 'Java';
        if (/c\+\+|cpp|game|engine/.test(text)) return 'C++';
        if (/\bc\b|clang/.test(text)) return 'C';
        if (/go|golang/.test(text)) return 'Go';
        if (/rust|rs/.test(text)) return 'Rust';
        return 'HTML';
    }
    static createStarterProject(id, name) {
        const lang = this.guessProjectLanguage(name);
        const defaultFile = JungleIntelligence.getDefaultExtension(lang)
            ? `main${JungleIntelligence.getDefaultExtension(lang)}`
            : (lang === 'HTML' ? 'index.html' : 'main.txt');
        return { id, name, files: { [defaultFile]: '' }, currentFile: defaultFile, lang };
    }
    static renameFileForLanguage(filename, lang, files) {
        const desiredExt = this.getDefaultExtension(lang);
        if (!desiredExt || filename.toLowerCase().endsWith(desiredExt)) return filename;
        const next = filename.replace(/(\.[^.]+)?$/, desiredExt);
        if (!Object.prototype.hasOwnProperty.call(files, next)) return next;
        return filename;
    }
    static injectProjectAssetsIntoHtml(html, files) {
        let output = html;
        Object.keys(files).forEach(filename => {
            const lower = filename.toLowerCase();
            if (lower.endsWith('.css')) {
                const linkPattern = new RegExp(`<link[^>]+href=["']${this.escapeRegExp(filename)}["'][^>]*>`, 'i');
                output = output.replace(linkPattern, `<style data-jungle-file="${filename}">\n${files[filename]}\n</style>`);
            } else if (lower.endsWith('.js')) {
                const scriptPattern = new RegExp(`<script[^>]+src=["']${this.escapeRegExp(filename)}["'][^>]*>\\s*<\\/script>`, 'i');
                output = output.replace(scriptPattern, `<script data-jungle-file="${filename}">\n${files[filename]}\n<\\/script>`);
            }
        });
        return output;
    }
    static findMissingHtmlAssets(html, files) {
        const missing = [];
        const assetRegex = /<(script|link)[^>]+(?:src|href)=["']([^"']+)["'][^>]*>/gi;
        let match;
        while ((match = assetRegex.exec(html)) !== null) {
            const assetPath = match[2];
            if (/^(https?:)?\/\//i.test(assetPath) || assetPath.startsWith('data:') || assetPath.startsWith('#')) continue;
            const cleanPath = assetPath.replace(/^\.\//, '').split(/[?#]/)[0];
            if (!Object.prototype.hasOwnProperty.call(files, cleanPath)) {
                const line = html.slice(0, match.index).split('\n').length;
                missing.push({ file: cleanPath, line });
            }
        }
        return missing;
    }
    static escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
