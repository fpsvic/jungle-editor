(function initWorkspaceUploadTool() {
    const toolsMenu = document.getElementById('tools-menu');
    const toolsControl = document.querySelector('.tools-control');
    if (!toolsMenu || !toolsControl) return;

    const uploadButton = document.createElement('button');
    uploadButton.id = 'upload-files-tool';
    uploadButton.type = 'button';
    uploadButton.appendChild(document.createTextNode('Upload folders/files'));
    const arrow = document.createElement('span');
    arrow.textContent = '>';
    uploadButton.appendChild(arrow);
    toolsMenu.appendChild(uploadButton);

    const overlay = document.createElement('div');
    overlay.className = 'upload-modal-overlay';
    overlay.innerHTML = `
        <div class="upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-modal-title">
            <button class="upload-modal-close" id="upload-modal-close" type="button" aria-label="Close">×</button>
            <h3 id="upload-modal-title">Select folder/file</h3>
            <p>Choose files or a folder to add to the open workspace. Existing files are kept; duplicate names get a numbered copy.</p>
            <div class="upload-choice-row">
                <button id="upload-select-file" type="button">Select files</button>
                <button id="upload-select-folder" type="button">Select folder</button>
            </div>
            <p class="upload-modal-status" id="upload-modal-status" aria-live="polite"></p>
        </div>`;
    document.body.appendChild(overlay);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.hidden = true;
    fileInput.id = 'workspace-upload-files-input';
    document.body.appendChild(fileInput);

    const folderInput = document.createElement('input');
    folderInput.type = 'file';
    folderInput.multiple = true;
    folderInput.setAttribute('webkitdirectory', '');
    folderInput.setAttribute('directory', '');
    folderInput.hidden = true;
    folderInput.id = 'workspace-upload-folder-input';
    document.body.appendChild(folderInput);

    const status = overlay.querySelector('#upload-modal-status');
    const closeButton = overlay.querySelector('#upload-modal-close');
    const fileButton = overlay.querySelector('#upload-select-file');
    const folderButton = overlay.querySelector('#upload-select-folder');
    let busy = false;

    function close() {
        if (!busy) overlay.classList.remove('show');
    }

    function open() {
        const project = typeof JungleUI !== 'undefined' ? JungleUI.getCurrentProject() : null;
        if (!project) {
            if (typeof JungleUI !== 'undefined') JungleUI.showToast('Open a workspace before uploading files.', 'info');
            return;
        }
        status.textContent = '';
        overlay.classList.add('show');
    }

    async function importSelection(fileList, folderMode) {
        if (busy) return;
        const files = Array.from(fileList || []);
        if (!files.length) return;
        busy = true;
        fileButton.disabled = true;
        folderButton.disabled = true;
        closeButton.disabled = true;
        status.textContent = `Reading ${files.length} selected file${files.length === 1 ? '' : 's'}...`;
        try {
            if (!window.JungleFileImport) throw new Error('The workspace importer is not ready yet.');
            await (folderMode ? window.JungleFileImport.uploadFolder(files) : window.JungleFileImport.uploadFiles(files));
            overlay.classList.remove('show');
        } catch (error) {
            status.textContent = error.message || 'Upload failed.';
            if (typeof JungleUI !== 'undefined') JungleUI.showToast(`Upload failed: ${error.message}`, 'error');
        } finally {
            busy = false;
            fileButton.disabled = false;
            folderButton.disabled = false;
            closeButton.disabled = false;
        }
    }

    uploadButton.addEventListener('click', event => {
        event.stopPropagation();
        open();
    });
    fileButton.addEventListener('click', () => fileInput.click());
    folderButton.addEventListener('click', () => folderInput.click());
    fileInput.addEventListener('change', event => {
        const files = event.target.files;
        importSelection(files, false);
        event.target.value = '';
    });
    folderInput.addEventListener('change', event => {
        const files = event.target.files;
        importSelection(files, true);
        event.target.value = '';
    });
    closeButton.addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && overlay.classList.contains('show')) close(); });
})();
