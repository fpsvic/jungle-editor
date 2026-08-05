var jungleStyles = `
body { font-family: 'Inter', system-ui, -apple-system, sans-serif; margin: 0; background-color: #0b0d10; color: #d1d5db; display: flex; height: 100vh; overflow: hidden; }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: #0b0d10; }
::-webkit-scrollbar-thumb { background: #1b2221; border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: #528b74; }
.splash-screen { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: radial-gradient(circle at center, #101715 0%, #040608 100%); display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 9999; transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1), visibility 0.4s; opacity: 1; visibility: visible; }
.splash-screen.fade-out { opacity: 0; visibility: hidden; }
.splash-content { text-align: center; max-width: 500px; padding: 2rem; display: flex; flex-direction: column; align-items: center; }
.splash-blog-link { position:absolute; top:26px; right:32px; border:0; background:transparent; color:#aed9cb; font:600 0.95rem Inter,sans-serif; cursor:pointer; padding:8px 12px; border-radius:6px; }
.splash-blog-link:hover { background:#1c2b25; color:#fff; }
.blog-screen { position:fixed; inset:0; z-index:10000; display:none; overflow-y:auto; background:radial-gradient(circle at top, #15221d 0%, #06090a 55%); color:#dce9e4; }
.blog-screen.visible { display:block; }
.blog-header { position:sticky; top:0; display:flex; justify-content:space-between; align-items:center; padding:20px 7vw; background:rgba(6,9,10,.88); border-bottom:1px solid #263b31; backdrop-filter:blur(12px); color:#aed9cb; font-weight:700; }
.blog-header button { border:1px solid #415c4f; background:#172420; color:#dce9e4; border-radius:6px; padding:8px 12px; cursor:pointer; font:inherit; }
.blog-content { max-width:1180px; margin:0 auto; padding:64px 44px 100px; font-size:1.2rem; line-height:1.72; }
.blog-kicker { color:#74a896; letter-spacing:.16em; font-weight:700; font-size:.78rem; }
.blog-content h1 { margin:0 0 20px; max-width:1000px; font-size:clamp(3rem,8vw,6.8rem); line-height:.98; color:#eff8f3; letter-spacing:-.055em; }
.blog-content section { max-width:1020px; }
.blog-content h2 { margin:42px 0 10px; color:#aed9cb; font-size:2rem; }
.blog-content p { color:#b7c9c1; margin:0; }
.splash-logo { margin-bottom: 2.5rem; filter: drop-shadow(0 0 25px rgba(116, 168, 147, 0.35)); width: 110px !important; height: 110px !important; flex-shrink: 0 !important; }
.splash-title { font-family: 'Inter', sans-serif; font-size: 3.5rem; font-weight: 800; margin: 0 0 1rem 0; letter-spacing: -1.5px; color: #e2f1ec; }
.splash-subtitle { font-size: 1.05rem; color: #7b8e87; margin: 0 0 3rem 0; font-weight: 400; line-height: 1.6; max-width: 440px; }
.enter-btn { background-color: #2f443a; color: #e2f1ec; border: 1px solid #415c4f; padding: 14px 44px; font-size: 1rem; font-weight: 600; border-radius: 50px; cursor: pointer; box-shadow: 0 8px 24px rgba(47, 68, 58, 0.25); transition: transform 0.2s, box-shadow 0.2s, background-color 0.2s, border-color 0.2s; outline: none; }
.enter-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 30px rgba(47, 68, 58, 0.4); background-color: #385246; border-color: #528b74; }
.enter-btn:active { transform: translateY(1px); }
.template-text-btn { border:0; background:transparent; color:#fff; padding:8px 10px; font-size:.9rem; font-weight:600; cursor:pointer; border-radius:6px; }
.template-text-btn:hover { background:#1c2522; }
#workspace-center-actions { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); display:flex; align-items:center; height:34px; border:1px solid #52645d; border-radius:999px; overflow:hidden; background:#101513; box-shadow:0 3px 14px #0005; z-index:4; }
#workspace-center-actions button { height:100%; border:0; background:transparent; color:#fff; cursor:pointer; font:600 .9rem Inter,sans-serif; }
#agents-toggle-btn { width:38px; display:grid; place-items:center; border-right:1px solid #35453e!important; }
#agents-toggle-btn svg { width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
#workspace-hub-btn { padding:0 14px; white-space:nowrap; }
#workspace-center-actions button:hover, #agents-toggle-btn.active { background:#24342e; }
.agent-panel { position:fixed; right:18px; bottom:18px; width:min(440px,calc(100vw - 36px)); height:480px; min-height:300px; max-height:calc(100vh - 92px); display:none; flex-direction:column; z-index:140; overflow:hidden; border:1px solid #3d574c; border-radius:15px; background:#0d1210; box-shadow:0 20px 60px #000b; }
.agent-panel.open { display:flex; }
.agent-panel.expanded { height:calc(100vh - 110px)!important; }
.agent-resize-handle { height:7px; cursor:ns-resize; background:transparent; flex-shrink:0; }
.agent-resize-handle::after { content:''; display:block; width:44px; height:3px; margin:2px auto; border-radius:4px; background:#3c5249; }
.agent-header { height:43px; padding:0 12px; display:flex; align-items:center; gap:9px; flex-shrink:0; border-bottom:1px solid #26352f; color:#e8f2ee; font-weight:700; }
.agent-header .agent-status { margin-left:auto; color:#74a896; font-size:.68rem; text-transform:uppercase; letter-spacing:.08em; }
.agent-header button.agent-connect-link { position:relative; z-index:2; width:auto; height:auto; margin-left:auto; padding:3px 0; color:#74a896; font:600 .68rem Inter,sans-serif; text-transform:uppercase; letter-spacing:.08em; cursor:pointer; pointer-events:auto; }
.agent-header button.agent-connect-link:hover { background:transparent; color:#fff; text-decoration:underline; }
.agent-header button { width:28px; height:28px; border:0; border-radius:5px; background:transparent; color:#91a59c; cursor:pointer; font-size:17px; }
.agent-header button:hover { background:#1d2a25; color:#fff; }
.agent-connect { padding:14px; display:grid; grid-template-columns:1fr auto; gap:8px; border-bottom:1px solid #26352f; background:#111815; }
.agent-connect.hidden { display:none; }
.agent-connect p { grid-column:1/-1; margin:0 0 3px; color:#8ea098; font-size:.75rem; line-height:1.4; }
.agent-connect input { min-width:0; border:1px solid #354a41; background:#080c0a; color:#e8f2ee; border-radius:7px; padding:9px; font:12px Fira Code,monospace; outline:none; }
.agent-connect .agent-endpoint { grid-column:1/-1; }
.agent-connect button,.agent-send { border:1px solid #4e7564; background:#274639; color:#fff; border-radius:7px; padding:0 13px; cursor:pointer; font-weight:700; }
.agent-messages { flex:1; min-height:0; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:10px; }
.agent-empty { margin:auto; max-width:270px; color:#65786f; text-align:center; font-size:.82rem; line-height:1.55; }
.agent-message { max-width:88%; padding:9px 11px; border-radius:10px; white-space:pre-wrap; word-break:break-word; font:12px/1.5 Inter,sans-serif; }
.agent-message.user { align-self:flex-end; background:#28463a; color:#f1f8f5; border-bottom-right-radius:3px; }
.agent-message.model { align-self:flex-start; background:#171f1c; color:#cbd9d3; border:1px solid #26352f; border-bottom-left-radius:3px; }
.agent-message.system { align-self:center; max-width:96%; background:transparent; color:#74a896; font-size:11px; text-align:center; }
.agent-composer { flex-shrink:0; padding:10px; display:grid; grid-template-columns:1fr auto; gap:8px; border-top:1px solid #26352f; background:#101613; }
.agent-composer textarea { grid-column:1/-1; min-height:58px; max-height:130px; resize:vertical; box-sizing:border-box; border:1px solid #354a41; border-radius:8px; background:#080c0a; color:#e8f2ee; padding:9px; outline:none; font:12px/1.45 Inter,sans-serif; }
.agent-model { min-width:0; border:1px solid #354a41; border-radius:7px; background:#151e1a; color:#d5e3dd; padding:7px; font-size:.75rem; }
.agent-send { height:34px; }
.agent-send:disabled,.agent-composer textarea:disabled { opacity:.5; cursor:not-allowed; }
@media (max-width:850px) { #workspace-center-actions { left:auto; right:8px; transform:translateY(-50%); } #workspace-hub-btn { display:none; } }
.projects-dashboard { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: #0b0d10; z-index: 9000; display: flex; flex-direction: column; box-sizing: border-box; padding: 40px 60px; overflow-y: auto; transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1), visibility 0.4s; opacity: 0; visibility: hidden; }
.projects-dashboard.show { opacity: 1; visibility: visible; }
.dashboard-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; border-bottom: 1px solid #1c2321; padding-bottom: 20px; flex-wrap: wrap; gap: 20px; }
.dashboard-header-left { display: flex; align-items: center; gap: 20px; }
.dashboard-header h1 { margin: 0; font-size: 2.2rem; font-weight: 800; background: linear-gradient(135deg, #74a896 0%, #aed9cb 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: -1px; }
.dashboard-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 25px; padding-bottom: 40px; }
.project-card { background-color: #111413; border: 1px solid #1c2321; border-radius: 12px; padding: 25px; cursor: pointer; position: relative; display: flex; flex-direction: column; justify-content: space-between; height: 180px; box-sizing: border-box; transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.3s, box-shadow 0.3s; }
.project-card:hover { transform: translateY(-5px); border-color: #74a896; box-shadow: 0 10px 25px rgba(116, 168, 150, 0.15); }
.project-card h3 { margin: 0; font-size: 1.3rem; font-weight: 700; color: #ffffff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.project-meta { font-size: 0.85rem; color: #7b8e87; display: flex; flex-direction: column; gap: 4px; }
.project-card-actions { position: absolute; top: 15px; right: 15px; display: flex; gap: 8px; opacity: 0; transition: opacity 0.2s ease; }
.project-card:hover .project-card-actions { opacity: 1; }
.new-project-card { background-color: transparent; border: 2px dashed #1c2321; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; height: 180px; transition: border-color 0.3s, background 0.3s; }
.new-project-card:hover { border-color: #74a896; background-color: rgba(116, 168, 150, 0.03); }
.new-project-card .plus-icon { font-size: 2.5rem; color: #74a896; margin-bottom: 10px; line-height: 1; }
.new-project-card span { font-weight: 600; font-size: 1rem; color: #7b8e87; }
.workspace-container { display: flex; width: 100vw; height: 100vh; overflow: hidden; }
.sidebar { width: 260px; background-color: #111413; border-right: 1px solid #1c2321; display: flex; flex-direction: column; }
.sidebar-tabs { display: flex; background-color: #161a19; }
.sidebar-tab { flex: 1; padding: 10px 6px; font-size: 0.68rem; color: #727e8c; cursor: pointer; text-transform: uppercase; letter-spacing: 0.8px; border-top: 2px solid transparent; text-align: center; transition: all 0.2s; }
.sidebar-tab.active { color: #ffffff; border-top: 2px solid #528b74; background-color: #111413; }
.sidebar-section-header { padding: 10px 15px; gap: 10px; font-size: 0.75rem; color: #849690; text-transform: uppercase; letter-spacing: 1px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #1c2321; background-color: #141917; font-weight: 700; }
.sidebar-section-header button { background: none; border: none; color: #74a896; font-size: 1.2rem; cursor: pointer; padding: 0; display: flex; align-items: center; line-height: 1; transition: color 0.15s, transform 0.1s; }
.sidebar-section-header button:hover { color: #ffffff; transform: scale(1.1); }
.files-header-left { min-width: 0; display: flex; align-items: center; gap: 8px; flex: 1; }
.files-header-left > span { flex-shrink: 0; }
#file-search-input { min-width: 0; flex: 1; width: auto; background: #0d1210; border: 1px solid #26332d; border-radius: 5px; color: #c8ddd8; padding: 4px 7px; font-size: 0.68rem; font-family: inherit; text-transform: none; letter-spacing: 0; outline: none; }
#file-search-input:focus { border-color: #528b74; box-shadow: 0 0 0 2px rgba(82,139,116,0.15); }
#file-search-input::placeholder { color: #5c7068; }
#file-search-input::-webkit-search-cancel-button { filter: grayscale(1); opacity: 0.6; cursor: pointer; }
.file-list { list-style: none; padding: 10px 0; margin: 0; overflow-y: auto; flex: 1; }
.file-list li { padding: 3px 15px 3px 25px; font-size: 0.8125rem; color: #9ca3af; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: all 0.15s; }
.file-list li:hover { background-color: #161c1a; color: #e2f1ec; }
.file-list li.active { background-color: #1c2522; color: #ffffff; border-left: 3px solid #528b74; padding-left: 22px; }
.file-item-actions { display: none; gap: 8px; }
.file-list li:hover .file-item-actions { display: flex; }
.file-list li.folder-item { padding: 0; background: none; cursor: default; display: block; }
.file-list li.folder-item:hover { background: none; }
.folder-row { padding: 3px 15px 3px 10px; display: flex; align-items: center; gap: 5px; cursor: pointer; color: #849690; font-size: 0.8125rem; user-select: none; transition: all 0.15s; }
.folder-row:hover { background-color: #161c1a; color: #e2f1ec; }
.folder-row:hover .file-item-actions { display: flex; }
.folder-chevron { font-size: 0.6rem; color: #528b74; width: 10px; flex-shrink: 0; }
.folder-name { flex: 1; font-size: 0.8125rem; font-weight: 600; }
.folder-files { list-style: none; padding: 0; margin: 0; }
.file-list li.nested { padding-left: 34px; }
.file-list li.nested.active { padding-left: 31px; }
.folder-empty { padding: 5px 14px 5px 34px !important; font-size: 0.75rem !important; color: #4a6057 !important; font-style: italic; cursor: default !important; pointer-events: none; display: block !important; }
.file-search-empty { padding: 18px 15px !important; color: #5c7068 !important; font-size: 0.78rem !important; font-style: italic; cursor: default !important; display: block !important; }
.sidebar-extensions-row { padding: 8px 12px; border-top: 1px solid #1c2321; flex-shrink: 0; }
#extensions-btn { width: 100%; display: flex; align-items: center; justify-content: flex-start; gap: 8px; padding: 8px 10px; background: #172420; border: none; outline: none; box-shadow: none; border-radius: 6px; color: #aed9cb; cursor: pointer; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; transition: background-color 0.15s, color 0.15s; }
#extensions-btn:hover { background: #1c3028; color: #ffffff; }
.popup-menu { display: none; position: absolute; top: 100%; right: 10px; margin-top: 6px; background-color: #161c1a; border: 1px solid #232d2a; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); z-index: 50; min-width: 190px; overflow: hidden; padding: 4px; }
.popup-menu.show { display: block; }
.popup-menu-item { padding: 9px 12px; font-size: 0.85rem; color: #c3cfca; cursor: pointer; border-radius: 5px; display: flex; align-items: center; gap: 8px; transition: all 0.12s; white-space: nowrap; }
.popup-menu-item:hover { background-color: #1c2522; color: #ffffff; }
.popup-menu-divider { height: 1px; background-color: #232d2a; margin: 4px 2px; }
.popup-menu-label { padding: 6px 12px 3px; font-size: 0.68rem; color: #5c6875; text-transform: uppercase; letter-spacing: 0.6px; }
.action-btn { background: none; border: none; color: #5c6875; cursor: pointer; padding: 0 2px; font-size: 0.85rem; transition: color 0.15s, transform 0.1s; }
.action-btn:hover { color: #ffffff; transform: scale(1.15); }
.action-btn.delete:hover { color: #cf6679; }
.main-content { flex: 1; min-width: 0; display: flex; flex-direction: column; background-color: #0b0d10; position: relative; }
.editor-header { position:relative; display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; background-color: #111413; border-bottom: 1px solid #1c2321; }
.editor-header .header-right { position:absolute; right:20px; top:8px; z-index:20; display:flex!important; align-items:center; gap:10px; visibility:visible!important; opacity:1!important; }
.workspace-center-fallback { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); display:flex; align-items:center; height:34px; border:1px solid #52645d; border-radius:999px; overflow:hidden; background:#101513; z-index:4; box-shadow:0 3px 14px #0005; }
.workspace-center-fallback button { height:100%; border:0; background:transparent; color:#fff; cursor:pointer; font:600 .9rem Inter,sans-serif; }
.workspace-center-fallback button:first-child { width:38px; display:grid; place-items:center; border-right:1px solid #35453e; }
.workspace-center-fallback svg { width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
.workspace-center-fallback button:last-child { padding:0 14px; white-space:nowrap; }
.workspace-center-fallback:hover { background:#24342e; }
.editor-header h2 { margin: 0; font-size: 0.95rem; font-weight: 600; color: #aed9cb; }
#run-fullscreen-btn{position:absolute;top:12px;right:16px;z-index:12;display:none;place-items:center;width:32px;height:32px;background:#161c1a;color:#aed9cb;border:1px solid #528b74;border-radius:6px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.35)}#run-fullscreen-btn:hover,#run-fullscreen-btn.active{background:#1c3028;color:#fff}#run-fullscreen-btn svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.header-left { display: flex; align-items: center; gap: 15px; }
.header-right { display: flex; align-items: center; gap: 10px; }
.exit-hub-btn { background-color: #161c1a; color: #a4b3b0; border: 1px solid #232d2a; padding: 8px 16px; font-size: 0.85rem; font-weight: 600; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s ease; }
.exit-hub-btn:hover { background-color: #1c2522; color: #ffffff; border-color: #74a896; box-shadow: 0 0 10px rgba(116, 168, 150, 0.25); }
#exit-to-hub-header-btn{display:none}.tools-control{position:relative}.tools-icon-btn{width:32px;height:32px;background:#161c1a;color:#aed9cb;border:1px solid #232d2a;border-radius:6px;cursor:pointer}.tools-menu,.bug-language-menu{display:none;position:absolute;top:38px;left:0;z-index:80;background:#161c1a;border:1px solid #2a3d35;border-radius:7px;padding:4px;box-shadow:0 10px 28px #0008}.tools-menu.show,.bug-language-menu.show{display:block}.tools-menu button{width:210px;padding:9px 10px;display:flex;justify-content:space-between;background:none;color:#c8ddd8;border:0;border-radius:4px;text-align:left;cursor:pointer}.tools-menu button:hover,.bug-language-menu button:hover{background:#1c3028;color:#fff}.bug-language-menu{left:218px;max-height:340px;overflow:auto;min-width:190px}.bug-language-menu button{display:block;width:100%;padding:7px 10px;color:#c8ddd8;background:none;border:0;border-radius:4px;text-align:left;cursor:pointer;font:12px 'Fira Code',monospace}.bug-language-menu button.selected{background:#1c3028;color:#aed9cb}.bug-scan-mode #tab-preview,.bug-scan-mode #run-btn,.bug-scan-mode #tab-terminal-btn,.bug-scan-mode #template-panel-toggle{display:none!important}.bug-scan-mode .sidebar-tabs{display:grid;grid-template-columns:1fr 1fr}
#loc-display { color: #849690; font-size: 0.85rem; font-family: monospace; background: #0b0d10; padding: 4px 8px; border-radius: 4px; border: 1px solid #1c2321; white-space: nowrap; }
.language-selector-wrapper { position: relative; display: inline-block; }
.language-btn { padding: 7px 12px; background-color: #161c1a; color: #a4b3b0; border: 1px solid #232d2a; border-radius: 6px; cursor: pointer; text-align: left; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center; width: 170px; gap: 5px; transition: all 0.2s; }
.language-btn:hover { background-color: #1c2522; color: #ffffff; border-color: #415c4f; }
#current-language-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
#lang-picker-screen { display: none; position: fixed; inset: 0; z-index: 300; background-color: #0d1210; flex-direction: column; }
#lang-picker-screen.visible { display: flex; }
#lang-picker-header { display: flex; align-items: center; gap: 16px; padding: 14px 20px; background-color: #111a17; border-bottom: 1px solid #1c2321; flex-shrink: 0; }
#lang-picker-back { background: none; border: 1px solid #2a3d35; color: #74a896; padding: 7px 14px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; transition: all 0.15s; }
#lang-picker-back:hover { background-color: #1c2522; color: #aed9cb; }
#lang-picker-title { font-size: 1rem; font-weight: 700; color: #aed9cb; letter-spacing: 0.5px; white-space: nowrap; }
#lang-picker-search { flex: 1; background-color: #0d1210; border: 1px solid #232d2a; border-radius: 6px; color: #c8ddd8; padding: 7px 12px; font-size: 0.85rem; outline: none; font-family: inherit; transition: border-color 0.2s; }
#lang-picker-search:focus { border-color: #528b74; }
#lang-picker-grid { flex: 1; overflow-y: auto; padding: 20px; display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
.lang-picker-card { background-color: #111a17; border: 1px solid #1c2321; border-radius: 10px; padding: 18px 14px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 10px; transition: border-color 0.2s, transform 0.15s, box-shadow 0.2s; }
.lang-picker-card:hover { border-color: #528b74; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.5); }
.lang-picker-card.selected { border-color: #74a896; background-color: #13201b; }
.lang-picker-icon { font-size: 2rem; line-height: 1; }
.lang-picker-name { font-size: 0.92rem; font-weight: 800; color: #aed9cb; text-align: center; }
.lang-picker-description { font-size: 0.72rem; line-height: 1.35; color: #7f9c90; text-align: center; }
.editor-wrapper { display: flex; flex: 1; min-width: 0; position: relative; overflow: hidden; background-color: #0b0d10; }
#line-gutter { padding: 20px 10px 20px 15px; background-color: #080a0d; color: #35453e; font-family: 'Fira Code', 'Consolas', monospace; font-size: 14px; line-height: 22px; text-align: right; user-select: none; border-right: 1px solid #1c2321; min-width: 45px; white-space: pre; overflow: hidden; box-sizing: border-box; }
#editor-container { position: relative; flex: 1; height: 100%; overflow: hidden; }
#highlight-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; margin: 0; padding: 20px; box-sizing: border-box; font-family: 'Fira Code', 'Consolas', monospace; font-size: 14px; line-height: 22px; white-space: pre; overflow: hidden; pointer-events: none; color: #d1d5db; background: transparent; z-index: 1; tab-size: 4; word-wrap: normal; }
#code-editor { position: absolute; top: 0; left: 0; width: 100%; height: 100%; margin: 0; padding: 20px; box-sizing: border-box; background: transparent; color: transparent !important; -webkit-text-fill-color: transparent !important; caret-color: #74a896; font-family: 'Fira Code', 'Consolas', monospace; font-size: 14px; line-height: 22px; border: none; resize: none; outline: none; tab-size: 4; overflow-y: auto; overflow-x: auto; white-space: pre; z-index: 2; word-wrap: normal; }
#code-editor::-webkit-scrollbar { width: 10px; height: 10px; }
#code-editor::-webkit-scrollbar-track { background: #080a0d; }
#code-editor::-webkit-scrollbar-thumb { background: #1c2522; border: 2px solid #080a0d; border-radius: 5px; }
#code-editor::-webkit-scrollbar-thumb:hover { background: #528b74; }
.token-keyword { color: #FFB86C; }
.token-string { color: #06CF7A; }
.token-comment { color: #6272A4; font-style: italic; }
.token-number { color: #FF79C6; }
.token-type { color: #8BE9FD; }
.token-fn { color: #f1fa8c; }
.token-builtin { color: #4d9de0; }
.token-op { color: #FF5555; }
.token-punct { color: #7f848e; }
.token-attr { color: #FFB86C; }
.token-tag { color: #FF79C6; }
.token-property { color: #FFB86C; }
.token-value { color: #FFB86C; }
.token-decorator { color: #bd93f9; font-style: italic; }
.modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: rgba(0, 0, 0, 0.85); display: none; justify-content: center; align-items: center; z-index: 10000; backdrop-filter: blur(6px); }
.modal-overlay.show { display: flex; }
.modal-card { background-color: #111413; border: 1px solid #232d2a; border-radius: 12px; width: 360px; padding: 25px; box-shadow: 0 15px 40px rgba(0,0,0,0.8); animation: modalScale 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes modalScale { from { transform: scale(0.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.modal-card h3 { margin: 0; font-size: 1.25rem; font-weight: 700; color: #74a896; }
.modal-body-text { font-size: 0.9rem; color: #94a3b8; margin-bottom: 15px; line-height: 1.5; }
.modal-card input { width: 100%; background-color: #0b0d10; border: 1px solid #232d2a; border-radius: 6px; padding: 10px 12px; color: #ffffff; font-size: 0.9rem; outline: none; box-sizing: border-box; margin-bottom: 20px; }
.modal-card input:focus { border-color: #74a896; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
.modal-btn { padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 600; border: none; outline: none; transition: all 0.2s; }
.modal-btn.cancel { background-color: #161c1a; color: #a4b3b0; }
.modal-btn.cancel:hover { background-color: #232d2a; color: #ffffff; }
.modal-btn.confirm { background-color: #4b7a69; color: #ffffff; }
.modal-btn.confirm:hover { background-color: #385c4f; }
#template-panel { display: flex; flex-direction: column; flex-shrink: 0; width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; }
#template-panel-body { display: flex; gap: 12px; width: 100%; min-width: 0; box-sizing: border-box; background-color: #0d1210; border-bottom: 1px solid #1c2321; overflow-x: auto; max-height: 0; overflow-y: hidden; transition: max-height 0.3s cubic-bezier(0.4,0,0.2,1), padding 0.3s; padding: 0 16px; }
#template-panel-body.open { max-height: 190px; padding: 14px 16px; overflow-x:auto; overflow-y:hidden; }
.template-card { flex: 0 0 180px; background-color: #111a17; border: 1px solid #1c2321; border-radius: 10px; padding: 14px; cursor: pointer; transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s; }
.template-card:hover { border-color: #528b74; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(82,139,116,0.2); }
.template-card-icon { font-size: 1.5rem; margin-bottom: 6px; }
.template-card-name { font-size: 0.9rem; font-weight: 700; color: #aed9cb; margin-bottom: 4px; }
.template-card-desc { font-size: 0.75rem; color: #5c7a6e; line-height: 1.4; }
#toast-container { position: fixed; bottom: 25px; right: 25px; z-index: 10005; display: flex; flex-direction: column; gap: 10px; pointer-events: none; }
.jungle-toast { background-color: #111413; border: 1px solid #4b7a69; color: #e2f1ec; padding: 12px 24px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; box-shadow: 0 8px 24px rgba(0,0,0,0.5); transform: translateY(50px); opacity: 0; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); pointer-events: auto; }
.jungle-toast.show { transform: translateY(0); opacity: 1; }
#terminal-view-container { flex: 1; display: none; flex-direction: column; background-color: #06090c; font-family: 'Fira Code', 'Consolas', monospace; padding: 24px; box-sizing: border-box; overflow: hidden; cursor: text; }
#terminal-view-header { color: #528b74; font-size: 0.8rem; letter-spacing: 1.5px; border-bottom: 1px solid #14201b; padding-bottom: 12px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; font-weight: bold; }
#terminal-view-body { margin: 0; color: #9cb5a9; font-size: 14px; line-height: 22px; white-space: pre-wrap; word-break: break-all; flex: 1; overflow-y: auto; }
.flex { display: flex; }
.items-center { align-items: center; }
.justify-between { justify-content: space-between; }
.flex-1 { flex: 1; }
.shrink-0 { flex-shrink: 0; }
.hidden { display: none; }
.gap-2 { gap: 0.5rem; }
.gap-4 { gap: 1rem; }
.ml-2 { margin-left: 0.5rem; }
.ml-4 { margin-left: 1rem; }
.mt-2 { margin-top: 0.5rem; }
.pl-3 { padding-left: 0.75rem; }
.pr-16 { padding-right: 4rem; }
.pt-2 { padding-top: 0.5rem; }
.border-t { border-top-width: 1px; border-top-style: solid; }
.border-l { border-left-width: 1px; border-left-style: solid; }
.border-none { border: none; }
.bg-transparent { background-color: transparent; }
.outline-none { outline: none; }
.font-mono { font-family: 'Fira Code', 'Consolas', monospace; }
.font-bold { font-weight: 700; }
.uppercase { text-transform: uppercase; }
.text-sm { font-size: 0.875rem; }
.select-none { user-select: none; }
.cursor-pointer { cursor: pointer; }
.overflow-hidden { overflow: hidden; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pointer-events-auto { pointer-events: auto; }
.text-rose-500 { color: #f43f5e; }
.text-emerald-400 { color: #34d399; }
.text-teal-300 { color: #5eead4; }
.animate-pulse { animation: junglePulse 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
@keyframes junglePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
.bg-\\[\\#1c2522\\] { background-color: #1c2522; }
.text-\\[\\#74a896\\] { color: #74a896; }
.text-\\[\\#aed9cb\\] { color: #aed9cb; }
.text-\\[10px\\] { font-size: 10px; }
.border-\\[\\#528b74\\] { border-color: #528b74; }
.border-\\[\\#14201b\\] { border-color: #14201b; }
.border-\\[\\#2e3c37\\] { border-color: #2e3c37; }
.hover\\:bg-\\[\\#1a2320\\]:hover { background-color: #1a2320; }

/* ---- Settings icon on splash ---- */
.settings-icon-btn { margin-top: 22px; background: transparent; color: #7b8e87; border: 1px solid #26332d; padding: 9px 20px; font-size: 0.85rem; font-weight: 600; border-radius: 50px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: color 0.2s, border-color 0.2s, background-color 0.2s, transform 0.2s; outline: none; }
.settings-icon-btn:hover { color: #aed9cb; border-color: #528b74; background-color: rgba(116,168,150,0.06); transform: translateY(-1px); }
.settings-icon-btn svg { transition: transform 0.4s ease; }
.settings-icon-btn:hover svg { transform: rotate(90deg); }

/* ---- Settings screen ---- */
#settings-screen { display: none; position: fixed; inset: 0; z-index: 10001; background-color: #0b0d10; flex-direction: column; }
#settings-screen.visible { display: flex; }
#settings-header { display: flex; align-items: center; gap: 18px; padding: 16px 26px; background-color: #111413; border-bottom: 1px solid #1c2321; flex-shrink: 0; }
#settings-back { background: none; border: 1px solid #2a3d35; color: #74a896; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; transition: all 0.15s; }
#settings-back:hover { background-color: #1c2522; color: #aed9cb; }
#settings-title { font-size: 1.15rem; font-weight: 800; color: #aed9cb; letter-spacing: 0.5px; }
#settings-body { flex: 1; min-height: 0; overflow: hidden; padding: 0; max-width: none; width: 100%; margin: 0; box-sizing: border-box; display: flex; }
#settings-nav { width: 210px; flex-shrink: 0; padding: 26px 14px; box-sizing: border-box; border-right: 1px solid #1c2321; background: #0e1210; }
.settings-nav-label { padding: 0 12px 12px; color: #5c7a6e; font-size: .7rem; font-weight: 800; letter-spacing: 1.3px; text-transform: uppercase; }
.settings-tab { width: 100%; display: flex; align-items: center; gap: 10px; padding: 11px 12px; margin-bottom: 6px; border: 1px solid transparent; border-radius: 9px; background: transparent; color: #789087; cursor: pointer; text-align: left; font: 600 .88rem Inter, sans-serif; transition: background-color .18s, border-color .18s, color .18s, transform .18s; }
.settings-tab:hover { background: #17221d; color: #d8eee6; transform: translateX(2px); }
.settings-tab.active { background: #1c2b25; border-color: #355c4b; color: #e2f1ec; box-shadow: 0 4px 14px rgba(0,0,0,.16); }
.settings-tab-icon { width: 18px; text-align: center; font-size: 1rem; color: #74a896; }
#settings-content { flex: 1; min-width: 0; overflow-y: auto; padding: 30px 36px 44px; box-sizing: border-box; }
.settings-panel { display: none; max-width: 780px; margin: 0 auto; }
.settings-panel.active { display: block; }
.settings-intro { color: #7b8e87; line-height: 1.55; margin: -3px 0 18px; font-size: .86rem; }
.settings-action-btn { flex-shrink: 0; padding: 9px 13px; border: 1px solid #415c4f; border-radius: 7px; background: #172420; color: #aed9cb; cursor: pointer; font: 700 .78rem Inter, sans-serif; transition: background-color .18s, border-color .18s, color .18s; }
.settings-action-btn:hover { background: #2b5143; border-color: #74a896; color: #fff; }
.plugin-card { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 17px 19px; margin-bottom: 12px; border: 1px solid #1c2b24; border-radius: 12px; background: #111816; }
.plugin-card-info { min-width: 0; flex: 1; }
.plugin-card-title { color: #e2f1ec; font-weight: 700; font-size: .95rem; margin-bottom: 4px; }
.plugin-card-desc { color: #7b8e87; line-height: 1.5; font-size: .81rem; }
.plugin-status { flex-shrink: 0; padding: 5px 9px; border-radius: 999px; color: #9bd6bc; background: rgba(47,106,82,.22); border: 1px solid #315c49; font-size: .7rem; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; }
.settings-section { margin-bottom: 34px; }
.settings-section-title { font-size: 0.72rem; color: #5c7a6e; text-transform: uppercase; letter-spacing: 1.2px; font-weight: 700; margin-bottom: 14px; }
.execution-mode-choice { display: inline-flex; gap: 4px; padding: 4px; border: 1px solid #26332d; border-radius: 8px; background: #111816; }
.execution-mode-opt { border: 0; border-radius: 5px; padding: 8px 11px; color: #789087; background: transparent; cursor: pointer; font-size: 0.78rem; }
.execution-mode-opt.selected { color: #d8eee6; background: #2b5143; }
body.theme-light .execution-mode-choice { border-color: #d1d8d5; background: #f4f6f5; }
body.theme-light .execution-mode-opt { color: #596761; }
body.theme-light .execution-mode-opt.selected { color: #102019; background: #c5ddd3; }
.setting-row { display: flex; justify-content: space-between; align-items: center; gap: 24px; background-color: #111413; border: 1px solid #1c2321; border-radius: 12px; padding: 18px 22px; margin-bottom: 12px; }
.setting-info { flex: 1; }
.setting-name { font-size: 1rem; font-weight: 700; color: #e2f1ec; margin-bottom: 5px; }
.setting-desc { font-size: 0.83rem; color: #7b8e87; line-height: 1.5; }
.toggle-switch { flex-shrink: 0; width: 52px; height: 30px; border-radius: 30px; background-color: #232d2a; border: 1px solid #2e3c37; cursor: pointer; position: relative; padding: 0; transition: background-color 0.25s, border-color 0.25s; outline: none; }
.toggle-switch .toggle-knob { position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background-color: #7b8e87; transition: transform 0.25s cubic-bezier(0.16,1,0.3,1), background-color 0.25s; }
.toggle-switch.on { background-color: #2f6a52; border-color: #528b74; }
.toggle-switch.on .toggle-knob { transform: translateX(22px); background-color: #e2f1ec; }
.theme-choice { display: flex; gap: 8px; flex-shrink: 0; }
.theme-opt { background-color: #161c1a; color: #a4b3b0; border: 1px solid #232d2a; padding: 9px 16px; font-size: 0.85rem; font-weight: 600; border-radius: 8px; cursor: pointer; transition: all 0.2s; }
.theme-opt:hover { border-color: #415c4f; color: #ffffff; }
.theme-opt.selected { background-color: #1c2522; color: #ffffff; border-color: #74a896; box-shadow: 0 0 10px rgba(116,168,150,0.25); }

/* ---- Light theme (white & black) ---- */
body.theme-light { background-color: #ffffff; color: #1a1a1a; }
body.theme-light .splash-screen { background: radial-gradient(circle at center, #ffffff 0%, #dfe4e8 100%); }
body.theme-light .splash-title { color: #111111; }
body.theme-light .splash-subtitle { color: #4a5560; }
body.theme-light .splash-logo { filter: drop-shadow(0 0 25px rgba(0,0,0,0.15)); }
body.theme-light .enter-btn { background-color: #111111; color: #ffffff; border-color: #000000; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
body.theme-light .enter-btn:hover { background-color: #000000; border-color: #333333; }
body.theme-light .settings-icon-btn { color: #444444; border-color: #cbd2d8; }
body.theme-light .settings-icon-btn:hover { color: #111111; border-color: #111111; background-color: rgba(0,0,0,0.04); }
body.theme-light .projects-dashboard { background-color: #ffffff; }
body.theme-light .dashboard-header { border-bottom-color: #e0e4e8; }
body.theme-light .project-card { background-color: #f6f8fa; border-color: #e0e4e8; }
body.theme-light .project-card h3 { color: #111111; }
body.theme-light .main-content, body.theme-light .editor-wrapper { background-color: #ffffff; }
body.theme-light .sidebar { background-color: #f2f4f6; border-right-color: #e0e4e8; }
body.theme-light .editor-header { background-color: #f2f4f6; border-bottom-color: #e0e4e8; }
body.theme-light .template-text-btn, body.theme-light #workspace-center-actions button { color:#111; }
body.theme-light #workspace-center-actions { background:#fff; border-color:#999; box-shadow:0 3px 12px #0002; }
body.theme-light .agent-panel, body.theme-light .agent-composer, body.theme-light .agent-connect { background:#fff; color:#111; border-color:#bbb; }
body.theme-light .agent-header, body.theme-light .agent-composer { border-color:#ccc; }
body.theme-light .agent-message.model { background:#eee; color:#111; border-color:#ccc; }
body.theme-light .agent-composer textarea, body.theme-light .agent-connect input, body.theme-light .agent-model { background:#f7f7f7; color:#111; border-color:#aaa; }
body.theme-light #settings-screen { background-color: #ffffff; }
body.theme-light #settings-header { background-color: #f2f4f6; border-bottom-color: #e0e4e8; }
body.theme-light #settings-title, body.theme-light .setting-name { color: #111111; }
body.theme-light .setting-row { background-color: #f6f8fa; border-color: #e0e4e8; }
body.theme-light .setting-desc { color: #5a6570; }
body.theme-light .exit-hub-btn { background-color: #111111; color: #ffffff; border-color: #000000; }
body.theme-light .exit-hub-btn:hover { background-color: #000000; color: #ffffff; border-color: #333333; box-shadow: none; }
body.theme-light .theme-opt { background-color: #ffffff; color: #333333; border-color: #cbd2d8; }
body.theme-light .theme-opt.selected { background-color: #111111; color: #ffffff; border-color: #000000; box-shadow: none; }
/* Complete monochrome light palette */
body.theme-light .dashboard-header h1 { background:none; -webkit-text-fill-color:#111; color:#111; }
body.theme-light .project-meta, body.theme-light .new-project-card span { color:#666; }
body.theme-light .project-card:hover, body.theme-light .new-project-card:hover { border-color:#555; background:#eee; box-shadow:0 8px 20px rgba(0,0,0,.12); }
body.theme-light .new-project-card, body.theme-light .sidebar-tabs, body.theme-light .sidebar-section-header { background:#eee; border-color:#ccc; }
body.theme-light .new-project-card .plus-icon { color:#111; }
body.theme-light .sidebar-tab { background:#e8e8e8; color:#555; border-color:transparent; }
body.theme-light .sidebar-tab:hover { color:#111; background:#ddd; }
body.theme-light .sidebar-tab.active { color:#000; background:#fff; border-color:#333; }
body.theme-light .files-section-header, body.theme-light .files-header-left span { color:#222; }
body.theme-light #file-search-input { background:#fff; color:#111; border-color:#bbb; }
body.theme-light #file-search-input::placeholder { color:#888; }
body.theme-light #add-file-btn, body.theme-light #extensions-btn { background:#ddd; color:#111; border-color:#bbb; }
body.theme-light #add-file-btn:hover, body.theme-light #extensions-btn:hover { background:#ccc; color:#000; }
body.theme-light .file-list, body.theme-light .file-list li, body.theme-light .folder-row { color:#333; background:#f5f5f5; }
body.theme-light .file-list li:hover, body.theme-light .folder-row:hover { background:#e5e5e5; color:#000; }
body.theme-light .file-list li.active { background:#ddd; color:#000; border-color:#555; }
body.theme-light .editor-header h2, body.theme-light #loc-display { color:#222; }
body.theme-light #line-gutter { background:#eee; color:#777; border-color:#ccc; }
body.theme-light #editor-container, body.theme-light #highlight-overlay { background:#fff; color:#222; }
body.theme-light #code-editor { caret-color:#000; }
body.theme-light #code-editor::selection, body.theme-light .pv-textarea::selection { background:rgba(0,0,0,.18); }
body.theme-light #terminal-view-container, body.theme-light #console-view-container, body.theme-light #terminal-view-body, body.theme-light #console-view-body { background:#fff!important; color:#111!important; border-color:#ccc!important; }
body.theme-light #terminal-view-header, body.theme-light #terminal-input-row { background:#eee!important; color:#111!important; border-color:#ccc!important; }
body.theme-light #terminal-status, body.theme-light #console-status, body.theme-light #terminal-input, body.theme-light #terminal-input-row span { color:#222!important; }
body.theme-light #project-view-container, body.theme-light #project-view-container .pv-block, body.theme-light #project-view-container .pv-label, body.theme-light #project-view-container .pv-body, body.theme-light #project-view-container .pv-editor-shell, body.theme-light #project-view-container .pv-highlight { background:#fff!important; color:#222!important; }
body.theme-light #project-view-container .pv-label { color:#111!important; }
body.theme-light #project-view-container .pv-gutter { background:#eee!important; color:#777!important; border-color:#ccc!important; }
body.theme-light #project-view-container .pv-textarea { caret-color:#000!important; }
body.theme-light #template-panel, body.theme-light #template-panel-body { background:#eee; border-color:#ccc; }
body.theme-light .template-card { background:#fff; color:#111; border-color:#bbb; }
body.theme-light .template-card:hover { background:#ddd; border-color:#555; }
body.theme-light .template-card-desc { color:#666; }
body.theme-light #lang-picker-screen, body.theme-light #lang-picker-header { background:#fff; color:#111; border-color:#ccc; }
body.theme-light #lang-picker-back, body.theme-light #lang-picker-search { background:#eee; color:#111; border-color:#bbb; }
body.theme-light .lang-picker-card { background:#f5f5f5; color:#111; border-color:#ccc; }
body.theme-light .lang-picker-card:hover, body.theme-light .lang-picker-card.selected { background:#ddd; border-color:#333; box-shadow:none; }
body.theme-light .lang-picker-description { color:#666; }
body.theme-light .modal-overlay { background:rgba(0,0,0,.5); }
body.theme-light .modal-card { background:#fff; color:#111; border-color:#aaa; box-shadow:0 20px 60px rgba(0,0,0,.25); }
body.theme-light .modal-card input { background:#f5f5f5; color:#111; border-color:#aaa; }
body.theme-light .modal-btn.cancel { background:#ddd; color:#111; border-color:#aaa; }
body.theme-light .modal-btn.confirm { background:#111; color:#fff; border-color:#000; }
body.theme-light .popup-menu { background:#fff; color:#111; border-color:#aaa; box-shadow:0 8px 24px rgba(0,0,0,.18); }
body.theme-light .popup-menu-item:hover { background:#ddd; color:#000; }
body.theme-light .jungle-toast { background:#fff!important; color:#111!important; border-color:#777!important; box-shadow:0 8px 24px rgba(0,0,0,.18)!important; }
body.theme-light .console-issue-group, body.theme-light .console-issue-item, body.theme-light .console-code-snippet { background:#f5f5f5; color:#222; border-color:#bbb; }
body.theme-light .console-issue-group summary, body.theme-light .console-issue-group.error summary, body.theme-light .console-issue-group.warning summary, body.theme-light .console-issue-group.info summary, body.theme-light .console-code-line.current, body.theme-light .console-code-caret { color:#111!important; background:#ddd!important; }
body.theme-light svg stop:first-child { stop-color:#fff; }
body.theme-light svg stop:last-child { stop-color:#222; }
body.theme-light svg [stroke='#74a896'], body.theme-light svg [stroke='#e2f1ec'] { stroke:#222; }
body.theme-light svg [fill='#131c18'] { fill:#eee; }

.console-clear { padding: 10px 0; }
.console-issue-file { padding: 2px 0 12px; border-bottom: 1px solid #1c2a24; margin-bottom: 10px; }
.console-issue-group { margin: 8px 0; border: 1px solid #24332d; border-radius: 6px; background: rgba(10,18,14,0.55); overflow: hidden; }
.console-issue-group summary { cursor: pointer; padding: 9px 11px; font-weight: 700; user-select: none; outline: none; }
.console-issue-group.error { border-color: rgba(255,85,85,0.45); }
.console-issue-group.error summary { color: #FF5555; background: rgba(255,85,85,0.06); }
.console-issue-group.warning { border-color: rgba(255,184,108,0.35); }
.console-issue-group.warning summary { color: #FFB86C; background: rgba(255,184,108,0.05); }
.console-issue-group.info summary { color: #74a896; background: rgba(116,168,150,0.05); }
.console-issue-item { padding: 10px 12px 12px; border-top: 1px solid #1e2c26; }
.console-issue-message { font-weight: 700; line-height: 1.45; }
.console-issue-kind { margin-top: 3px; font-size: 0.72rem; }
.console-issue-hint { margin-top: 8px; font-size: 0.78rem; line-height: 1.45; }
.console-code-snippet { margin: 9px 0 0; padding: 8px 10px; background: #080f0c; border: 1px solid #1e3328; border-radius: 5px; color: #a8beb5; font-family: 'Fira Code', 'Consolas', monospace; font-size: 0.78rem; line-height: 1.55; white-space: pre; overflow-x: auto; }
.console-code-line.current { color: #f2fff9; background: rgba(255,85,85,0.10); }
.console-code-caret { color: #FF5555; line-height: 1; }
/* ---- Settings tabs and appearance controls ---- */
body.appearance-slate .enter-btn,
body.appearance-slate .exit-hub-btn,
body.appearance-slate .modal-btn.confirm,
body.appearance-slate .settings-icon-btn,
body.appearance-slate .blog-header button,
body.appearance-slate #run-btn,
body.appearance-slate #tab-terminal-btn,
body.appearance-slate #extensions-btn,
body.appearance-slate #add-file-btn,
body.appearance-slate .settings-action-btn { background-color: #263b5b !important; border-color: #6e96c7 !important; color: #eaf2ff !important; }
body.appearance-slate .enter-btn:hover,
body.appearance-slate .exit-hub-btn:hover,
body.appearance-slate .settings-action-btn:hover { background-color: #35547d !important; border-color: #9cc5f3 !important; }
body.appearance-slate #workspace-center-actions { border-color: #6e96c7; background: #182b43; }
body.appearance-slate #workspace-center-actions button:hover,
body.appearance-slate #agents-toggle-btn.active { background: #2d4b70; }
body.appearance-slate .theme-opt.selected,
body.appearance-slate .execution-mode-opt.selected { background-color: #314f76; border-color: #8eb7e8; }

body.appearance-amber .enter-btn,
body.appearance-amber .exit-hub-btn,
body.appearance-amber .modal-btn.confirm,
body.appearance-amber .settings-icon-btn,
body.appearance-amber .blog-header button,
body.appearance-amber #run-btn,
body.appearance-amber #tab-terminal-btn,
body.appearance-amber #extensions-btn,
body.appearance-amber #add-file-btn,
body.appearance-amber .settings-action-btn { background-color: #51351d !important; border-color: #c18a4b !important; color: #fff1dc !important; }
body.appearance-amber .enter-btn:hover,
body.appearance-amber .exit-hub-btn:hover,
body.appearance-amber .settings-action-btn:hover { background-color: #704a25 !important; border-color: #e0ae69 !important; }
body.appearance-amber #workspace-center-actions { border-color: #c18a4b; background: #322319; }
body.appearance-amber #workspace-center-actions button:hover,
body.appearance-amber #agents-toggle-btn.active { background: #634322; }
body.appearance-amber .theme-opt.selected,
body.appearance-amber .execution-mode-opt.selected { background-color: #704a25; border-color: #d9a25b; }

body.button-outlines-off .enter-btn,
body.button-outlines-off .exit-hub-btn,
body.button-outlines-off .modal-btn,
body.button-outlines-off .settings-icon-btn,
body.button-outlines-off .blog-header button,
body.button-outlines-off .theme-opt,
body.button-outlines-off .execution-mode-choice,
body.button-outlines-off #workspace-center-actions,
body.button-outlines-off #add-file-btn,
body.button-outlines-off #extensions-btn,
body.button-outlines-off .settings-action-btn { border-color: transparent !important; }

body.text-bright .splash-title,
body.text-bright #settings-title,
body.text-bright .setting-name,
body.text-bright .plugin-card-title,
body.text-bright .editor-header h2,
body.text-bright .dashboard-header h1 { color: #ffffff !important; }
body.text-bright .splash-subtitle,
body.text-bright .setting-desc,
body.text-bright .settings-intro,
body.text-bright .plugin-card-desc { color: #c9ddd4 !important; }
body.text-soft .splash-title,
body.text-soft #settings-title,
body.text-soft .setting-name,
body.text-soft .plugin-card-title,
body.text-soft .editor-header h2,
body.text-soft .dashboard-header h1 { color: #c6d2cd !important; }
body.text-soft .splash-subtitle,
body.text-soft .setting-desc,
body.text-soft .settings-intro,
body.text-soft .plugin-card-desc { color: #82938c !important; }
body.theme-light.text-bright .splash-title,
body.theme-light.text-bright #settings-title,
body.theme-light.text-bright .setting-name,
body.theme-light.text-bright .plugin-card-title,
body.theme-light.text-bright .editor-header h2,
body.theme-light.text-bright .dashboard-header h1 { color: #111111 !important; }
body.theme-light.text-bright .splash-subtitle,
body.theme-light.text-bright .setting-desc,
body.theme-light.text-bright .settings-intro,
body.theme-light.text-bright .plugin-card-desc { color: #3f4b45 !important; }

body.compact-ui #settings-content { padding: 20px 28px 30px; }
body.compact-ui .settings-section { margin-bottom: 24px; }
body.compact-ui .setting-row { padding: 12px 16px; margin-bottom: 8px; }
body.compact-ui .plugin-card { padding: 12px 15px; margin-bottom: 8px; }
body.reduce-motion *, body.reduce-motion *::before, body.reduce-motion *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: .01ms !important; }

body.theme-light #settings-nav { background: #f2f4f6; border-color: #e0e4e8; }
body.theme-light .settings-nav-label { color: #66736d; }
body.theme-light .settings-tab { color: #596761; }
body.theme-light .settings-tab:hover { background: #e2e6e9; color: #111; }
body.theme-light .settings-tab.active { background: #fff; border-color: #333; color: #111; box-shadow: 0 3px 12px rgba(0,0,0,.08); }
body.theme-light .settings-tab-icon { color: #333; }
body.theme-light .settings-intro { color: #5a6570; }
body.theme-light .settings-action-btn { background: #ddd; border-color: #aaa; color: #111; }
body.theme-light .settings-action-btn:hover { background: #ccc; border-color: #555; color: #000; }
body.theme-light .plugin-card { background: #f6f8fa; border-color: #e0e4e8; }
body.theme-light .plugin-card-title { color: #111; }
body.theme-light .plugin-card-desc { color: #5a6570; }
body.theme-light .plugin-status { color: #234a36; background: #dcefe4; border-color: #a8cdb6; }

@media (max-width: 700px) {
    #settings-body { flex-direction: column; }
    #settings-nav { width: 100%; display: flex; gap: 6px; overflow-x: auto; padding: 12px; border-right: 0; border-bottom: 1px solid #1c2321; }
    .settings-nav-label { display: none; }
    .settings-tab { width: auto; min-width: max-content; margin: 0; }
    #settings-content { padding: 22px 16px 30px; }
    .setting-row { align-items: flex-start; flex-direction: column; gap: 12px; }
    .theme-choice { flex-wrap: wrap; }
    .plugin-card { align-items: flex-start; flex-direction: column; }
}
`;
function installJungleStyles(cssText) {
    var styleElement = document.createElement('style');
    styleElement.setAttribute('data-source', 'styles.ts');
    styleElement.textContent = cssText;
    document.head.appendChild(styleElement);
}
installJungleStyles(jungleStyles);
