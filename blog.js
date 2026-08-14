// The landing-page journal uses a small tabbed content model so the article
// stays readable on both wide and narrow screens.
(function initBlogJournal() {
    const article = document.querySelector('.blog-content');
    const tabs = Array.from(document.querySelectorAll('[data-blog-tab]'));
    if (!article || !tabs.length) return;

    const sections = {
        overview: {
            kicker: 'JUNGLE EDITOR / GUIDE',
            title: 'What Jungle Editor is',
            body: '<p>Jungle editor is a coding sandbox that can be used for small testing, debugging or coding with a broad support of languages. It brings an editor, project files, a preview, a terminal, and guided diagnostics together in one calm workspace, so you can move from an idea to a working experiment without configuring a full development environment first.</p><h2>Made for momentum</h2><p>Use Jungle Editor to try a function, build a small webpage, inspect an error, or learn how a language behaves. Projects can contain multiple files and folders, while the workspace helps you spot likely syntax, accessibility, quality, and safety issues before you run code.</p>'
        },
        editor: {
            kicker: 'THE WORKSPACE',
            title: 'A small environment with useful edges',
            body: '<p>The editor combines a fast text surface, file explorer, code highlighting, search, undo and redo, templates, and a second stacked editor. The goal is to keep the useful parts of a development environment close at hand without making a small experiment feel heavy.</p><p>Web projects can be previewed immediately. The console groups diagnostics, run output, and scanner advice so you can move from a line of code to a clear next step.</p>'
        },
        runtimes: {
            kicker: 'RUNTIMES',
            title: 'Run the right kind of experiment',
            body: '<p>Jungle Editor supports a broad catalog of languages. JavaScript, TypeScript, HTML, CSS, and SQL have browser-oriented paths, while other languages can use configured execution services when available.</p><p>Remote compilers and WASM runtimes are useful for experiments, but they are not a replacement for the native toolchain used by a production project.</p>'
        },
        scanners: {
            kicker: 'SCANNERS',
            title: 'Diagnostics that explain',
            body: '<p>The scanners look for syntax problems, risky patterns, accessibility issues, SQL mistakes, and maintainability concerns. The analyzer can inspect relationships across a project rather than only the file currently open.</p><p>Scanner findings are guidance. A language compiler, test suite, type checker, and runtime remain the final authority for correctness.</p>'
        },
        agents: {
            kicker: 'AGENTS',
            title: 'A model beside your code',
            body: '<p>The Agents panel can connect to a supported model through a provider API, keep separate sessions per project, and help explain code or suggest edits. Models can work with the workspace only through the capabilities configured for the current build.</p><p>API keys are sensitive credentials. For a production release, authentication and server-side secrets should be handled by a backend rather than stored in a browser tab.</p>'
        },
        publishing: {
            kicker: 'PUBLISHING',
            title: 'Share web projects simply',
            body: '<p>Jungle hosting is intended for HTML, CSS, and JavaScript projects. A published web project can be stored by a serverless publishing service and opened through a shareable address. Python, Java, C++, and other source projects can still be shared as files, but they are not deployed as browser sites.</p><p>Public and private publishing need different permissions: public projects can be read by anyone with the link, while private projects require an account and an authenticated request.</p>'
        },
        roadmap: {
            kicker: 'ROADMAP',
            title: 'From sandbox to dependable workspace',
            body: '<p>The next step is a small cloud layer for accounts, projects, sessions, and publishing. That layer will make links durable and allow a user to move between devices without weakening the browser-first experience.</p><p>Jungle Editor is a strong place for learning, prototypes, and focused debugging. Larger applications still benefit from their normal compiler, package manager, tests, version control, and CI checks.</p>'
        }
    };

    function render(key) {
        const section = sections[key] || sections.overview;
        article.innerHTML = `<p class="blog-kicker">${section.kicker}</p><h1 id="blog-title">${section.title}</h1><div class="blog-panel-copy">${section.body}</div>`;
        tabs.forEach(tab => {
            const active = tab.dataset.blogTab === key;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', String(active));
        });
    }

    tabs.forEach(tab => tab.addEventListener('click', () => render(tab.dataset.blogTab)));
    render('overview');
})();
