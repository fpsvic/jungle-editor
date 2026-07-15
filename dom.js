// --- DOM Structure Builder ---
(function buildDOM() {
    document.body.innerHTML = `
    <div class="splash-screen" id="splash-screen">
        <div class="splash-content">
            <svg class="splash-logo" width="110" height="110" viewBox="0 0 100 100" fill="none" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="cyberLeaf" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#aed9cb" />
                        <stop offset="100%" stop-color="#2f443a" />
                    </linearGradient>
                </defs>
                <circle cx="50" cy="50" r="42" fill="#131c18" />
                <circle cx="50" cy="50" r="42" stroke="#74a896" stroke-width="1.5" stroke-opacity="0.3" />
                <path d="M 28,38 L 18,50 L 28,62" stroke="#74a896" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M 72,38 L 82,50 L 72,62" stroke="#74a896" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M 50,22 C 34,34 35,55 50,78 C 65,55 66,34 50,22 Z" fill="url(#cyberLeaf)" />
                <path d="M 39,46 L 49,49 L 36,55" stroke="#131c18" stroke-width="2" stroke-linecap="round" />
                <path d="M 61,46 L 51,49 L 64,55" stroke="#131c18" stroke-width="2" stroke-linecap="round" />
                <path d="M 41,58 L 49,60 L 39,66" stroke="#131c18" stroke-width="2" stroke-linecap="round" />
                <path d="M 59,58 L 51,60 L 61,66" stroke="#131c18" stroke-width="2" stroke-linecap="round" />
                <line x1="50" y1="20" x2="50" y2="80" stroke="#e2f1ec" stroke-width="2.5" stroke-linecap="round" />
            </svg>
            <h1 class="splash-title">Jungle Editor</h1>
            <p class="splash-subtitle">An elegant multi-language coding sandbox environment configured within a soothing, distraction-free forest mist design.</p>
            <button class="enter-btn" id="enter-btn">Enter Workspace</button>
            <button class="settings-icon-btn" id="open-settings-btn" title="Settings">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
                <span>Settings</span>
            </button>
        </div>
    </div>
    <div id="settings-screen">
        <div id="settings-header">
            <button id="settings-back">← Back</button>
            <span id="settings-title">⚙ Settings</span>
        </div>
        <div id="settings-body">
            <div class="settings-section">
                <div class="settings-section-title">Code Execution</div>
                <div class="setting-row">
                    <div class="setting-info">
                        <div class="setting-name">Execution Engine</div>
                        <div class="setting-desc">Choose local interpreters and browser runtimes, or real remote compilers and APIs.</div>
                    </div>
                    <div class="execution-mode-choice" id="execution-mode-choice" role="group" aria-label="Execution engine">
                        <button class="execution-mode-opt" data-mode="interpreter" type="button">Interpreters</button>
                        <button class="execution-mode-opt" data-mode="api" type="button">Real APIs</button>
                    </div>
                </div>
                <div class="setting-row">
                    <div class="setting-info">
                        <div class="setting-name">Scanners &amp; Analyzers</div>
                        <div class="setting-desc">Check your code for errors before it runs. Turn this off to send the plain code straight through the run API even when it has errors.</div>
                    </div>
                    <button class="toggle-switch" id="toggle-analysis" role="switch" aria-checked="true"><span class="toggle-knob"></span></button>
                </div>
                <div class="setting-row">
                    <div class="setting-info">
                        <div class="setting-name">Whole-Project Analysis</div>
                        <div class="setting-desc">For big projects: the analyzer maps every file across all folders and scans the entire project for bugs at once (grouped by file), instead of only the file you're viewing.</div>
                    </div>
                    <button class="toggle-switch" id="toggle-project-scan" role="switch" aria-checked="false"><span class="toggle-knob"></span></button>
                </div>
            </div>
            <div class="settings-section">
                <div class="settings-section-title">Appearance</div>
                <div class="setting-row">
                    <div class="setting-info">
                        <div class="setting-name">Theme</div>
                        <div class="setting-desc">Switch between the dark Midnight theme and a clean white &amp; black Light theme. Changes the background and button colors across the app.</div>
                    </div>
                    <div class="theme-choice" id="theme-choice">
                        <button class="theme-opt" data-theme="midnight">🌙 Midnight</button>
                        <button class="theme-opt" data-theme="light">☀️ Light</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div class="projects-dashboard" id="projects-dashboard">
        <div class="dashboard-header">
            <div class="dashboard-header-left">
                <button class="exit-hub-btn" id="exit-to-splash-btn" title="Return to Title Screen">← Back to Start</button>
                <h1 class="ml-4">Jungle Workspace Hub</h1>
            </div>
            <div class="dashboard-header-right">
                <button class="enter-btn" id="add-project-btn-dash" style="padding: 10px 25px; font-size: 0.95rem;">+ Create Project</button>
            </div>
        </div>
        <div class="dashboard-grid" id="dashboard-grid"></div>
    </div>
    <div class="modal-overlay" id="custom-modal">
        <div class="modal-card">
            <h3 id="modal-title">Create</h3>
            <div class="modal-body-text" id="modal-body-text" style="display: none;"></div>
            <input type="text" id="modal-input" placeholder="Type name here...">
            <div class="modal-actions">
                <button class="modal-btn cancel" id="modal-cancel">Cancel</button>
                <button class="modal-btn confirm" id="modal-confirm">Confirm</button>
            </div>
        </div>
    </div>
    <div id="lang-picker-screen">
        <div id="lang-picker-header">
            <button id="lang-picker-back">← Back</button>
            <span id="lang-picker-title">Select Language</span>
            <input type="text" id="lang-picker-search" placeholder="Search languages...">
        </div>
        <div id="lang-picker-grid"></div>
    </div>
    <div id="toast-container"></div>
    <div class="workspace-container" id="workspace-container" style="display: none;">
        <div class="sidebar">
            <div class="sidebar-tabs">
                <div class="sidebar-tab active" id="project-title-btn">Whole Project</div>
                <div class="sidebar-tab" id="tab-preview">Preview / Run</div>
                <div class="sidebar-tab" id="tab-console">Console</div>
            </div>
            <div class="sidebar-section-header files-section-header" style="position:relative;">
                <div class="files-header-left">
                    <span>Files</span>
                    <input id="file-search-input" type="search" placeholder="Search files..." aria-label="Search files">
                </div>
                <button id="add-file-btn" title="Add File or Folder">+</button>
                <div id="add-item-menu" class="popup-menu"></div>
            </div>
            <ul class="file-list" id="file-list"></ul>
            <div class="sidebar-extensions-row">
                <button id="extensions-btn" title="Choose the language extension for this project">
                    <span>Extensions</span>
                </button>
            </div>
            <div style="padding:8px 15px;font-size:0.72rem;color:#4a6057;border-top:1px solid #1c2321;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
                <span>Storage</span>
                <span id="storage-size-badge">0 Bytes</span>
            </div>
        </div>
        <div class="main-content">
            <div class="editor-header">
                <div class="header-left">
                    <button class="exit-hub-btn" id="exit-to-hub-header-btn" title="Return to Projects Hub">← Exit to Hub</button>
                    <div class="language-selector-wrapper" style="display:none;">
                        <button class="language-btn" id="language-btn">
                            <span id="current-language-text">Language: Javascript</span>
                            <span>▼</span>
                        </button>
                        <div class="language-menu" id="language-menu">
                            <ul id="language-list-dropdown"></ul>
                        </div>
                    </div>
                    <h2 class="ml-2" id="current-file-label">index.html</h2>
                    <span id="loc-display">LOC: 0</span>
                    <div class="tools-control">
                        <button class="tools-icon-btn" id="tools-btn" title="Tools" aria-label="Tools" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4.1 4.1 0 0 0-5.3 5.3L3.1 17.9a1.5 1.5 0 1 0 2.1 2.1l6.3-6.3a4.1 4.1 0 0 0 5.3-5.3l-2.5 2.5-2.2-2.2 2.6-2.4zM14 14l6 6M18.5 14.5l-4 4"/></svg></button>
                        <div class="tools-menu" id="tools-menu"><button id="find-bugs-tool" type="button">Find Bugs <span>›</span></button><button id="multilang-tool" type="button">Multi-language Extension <span>›</span></button></div>
                        <div class="bug-language-menu" id="bug-language-menu" aria-label="Choose a language for bug scanning"></div>
                    </div>
                </div>
                <div class="header-right flex items-center gap-2">
                    <button class="exit-hub-btn" id="template-panel-toggle" title="Show starter templates">⚡ Templates <span id="template-toggle-arrow">▼</span></button>
                    <button class="exit-hub-btn" id="run-btn" style="background-color: #172420; border-color: #528b74; color: #74a896;" title="Compile and Run Code">▶ Run</button>
                    <button class="exit-hub-btn" id="tab-terminal-btn" title="Open Workspace Console Terminal">🖥️ Terminal Console</button>
                </div>
            </div>
            <div id="template-panel">
                <div id="template-panel-body">
                    <div class="template-card" data-template="web">
                        <div class="template-card-icon">🌐</div>
                        <div class="template-card-name">Web Page</div>
                        <div class="template-card-desc">HTML + CSS + JS starter with a styled counter</div>
                    </div>
                    <div class="template-card" data-template="python">
                        <div class="template-card-icon">🐍</div>
                        <div class="template-card-name">Python Script</div>
                        <div class="template-card-desc">Functions, FizzBuzz, and a main() entry point</div>
                    </div>
                    <div class="template-card" data-template="javascript">
                        <div class="template-card-icon">⚡</div>
                        <div class="template-card-name">JavaScript App</div>
                        <div class="template-card-desc">Sorting, async fetch, and modern JS patterns</div>
                    </div>
                </div>
            </div>
            <div class="editor-wrapper" id="editor-wrapper">
                <div id="line-gutter">1</div>
                <div id="editor-container">
                    <pre id="highlight-overlay"></pre>
                    <textarea id="code-editor" spellcheck="false"></textarea>
                    <div style="position:absolute;top:12px;right:30px;z-index:10;display:flex;gap:14px;align-items:center;">
                        <span id="select-all-code-btn" title="Select All Code" style="color:#aed9cb;font-size:0.78rem;cursor:pointer;">☰ Select All</span>
                        <span id="header-copy-code-btn" title="Copy Current File Contents to Clipboard" style="color:#aed9cb;font-size:0.78rem;cursor:pointer;">📋 Copy Code</span>
                        <span id="download-code-btn" title="Download Current File" style="color:#aed9cb;font-size:0.78rem;cursor:pointer;">⬇️ Download</span>
                    </div>
                </div>
            </div>
            <iframe id="preview-frame" style="display: none; flex: 1; width: 100%; height: 100%; border: none; background: #ffffff;"></iframe>
            <div id="terminal-view-container">
                <div id="terminal-view-header">
                    <span>Terminal</span>
                    <span id="terminal-status" style="color: #74a896;">READY</span>
                </div>
                <pre id="terminal-view-body">Jungle Terminal — type 'help' for commands.</pre>
                <div id="terminal-input-row" class="flex items-center gap-2 mt-2 border-t border-[#14201b] pt-2 shrink-0">
                    <span class="text-[#74a896] font-mono text-sm select-none">jungle:~$</span>
                    <input type="text" id="terminal-input" class="flex-1 bg-transparent border-none outline-none text-[#aed9cb] font-mono text-sm" placeholder="Type a command..." disabled>
                </div>
            </div>
            <div id="console-view-container" style="display:none;flex-direction:column;flex:1;overflow:hidden;font-family:'Fira Code',monospace;">
                <div id="terminal-view-header" style="display:flex;justify-content:space-between;align-items:center;padding:8px 14px;background:#0d1512;border-bottom:1px solid #1c2321;flex-shrink:0;">
                    <span style="font-size:0.8rem;color:#74a896;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Console</span>
                    <span id="console-status" style="color:#74a896;font-size:0.75rem;font-weight:700;">CLEAR</span>
                </div>
                <div id="console-view-body" style="flex:1;overflow-y:auto;padding:14px 16px;font-size:12.5px;line-height:1.7;color:#aed9cb;white-space:pre-wrap;word-break:break-word;">No issues detected.</div>
            </div>
            <div id="project-view-container" style="display:none;flex:1;overflow-y:auto;flex-direction:column;padding:0;background:#0b0d10;"></div>
        </div>
    </div>`;
})();
