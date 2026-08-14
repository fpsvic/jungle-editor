// Account screens and the small client for the optional cloud auth API.
(function initJungleAuth() {
    const screen = document.getElementById('auth-screen');
    const splash = document.getElementById('splash-screen');
    const blog = document.getElementById('blog-screen');
    const openLogin = document.getElementById('open-login-btn');
    const openSignup = document.getElementById('open-signup-btn');
    const back = document.getElementById('auth-back-btn');
    const form = document.getElementById('auth-form');
    const formView = document.getElementById('auth-form-view');
    const picker = document.getElementById('auth-google-picker');
    const accountList = document.getElementById('auth-account-list');
    const modeKicker = document.getElementById('auth-mode-kicker');
    const title = document.getElementById('auth-title');
    const description = document.getElementById('auth-mode-description');
    const submit = document.getElementById('auth-submit-btn');
    const switchText = document.getElementById('auth-switch-text');
    const switchButton = document.getElementById('auth-switch-btn');
    const googleButton = document.getElementById('google-auth-btn');
    const googleOther = document.getElementById('auth-google-other');
    const googleBack = document.getElementById('auth-google-back');
    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const status = document.getElementById('auth-status');
    if (!screen || !form || !openLogin || !openSignup) return;

    let mode = 'login';

    function authEndpoint() {
        const configured = String(window.JUNGLE_AUTH_API || document.querySelector('meta[name="jungle-auth-api"]')?.content || '').trim();
        if (configured) return configured.replace(/\/+$/, '');
        const host = window.location.hostname || '';
        return host === 'jungle.net' || host.endsWith('.jungle.net') ? '/api/auth' : '';
    }

    function setStatus(message, kind = '') {
        status.textContent = message;
        status.className = `auth-status ${kind}`.trim();
    }

    function setMode(nextMode) {
        mode = nextMode === 'signup' ? 'signup' : 'login';
        const signup = mode === 'signup';
        modeKicker.textContent = signup ? 'CREATE YOUR ACCOUNT' : 'WELCOME BACK';
        title.textContent = signup ? 'Create a Jungle Editor account' : 'Log in to Jungle Editor';
        description.textContent = signup ? 'Create an account to sync projects and publish private links.' : 'Use your email and password to continue.';
        submit.textContent = signup ? 'Create account' : 'Log in';
        passwordInput.autocomplete = signup ? 'new-password' : 'current-password';
        switchText.innerHTML = signup ? 'Already have an account? <button id="auth-switch-btn" type="button">Log in</button>' : "Don't have an account? <button id=\"auth-switch-btn\" type=\"button\">Sign up</button>";
        switchText.querySelector('button').onclick = () => setMode(signup ? 'login' : 'signup');
        setStatus('');
    }

    function open(modeName) {
        splash.style.display = 'none';
        blog?.classList.remove('visible');
        screen.classList.add('visible');
        picker.classList.add('hidden');
        formView.classList.remove('hidden');
        setMode(modeName);
        setTimeout(() => emailInput.focus(), 30);
    }

    function close() {
        screen.classList.remove('visible');
        splash.style.display = 'flex';
        splash.style.pointerEvents = 'auto';
    }

    async function submitForm(event) {
        event.preventDefault();
        const email = emailInput.value.trim().toLowerCase();
        const password = passwordInput.value;
        if (!/^\S+@\S+\.\S+$/.test(email)) { setStatus('Enter a valid email address.', 'error'); emailInput.focus(); return; }
        if (password.length < 8) { setStatus('Use a password with at least 8 characters.', 'error'); passwordInput.focus(); return; }
        const endpoint = authEndpoint();
        if (!endpoint) {
            setStatus('Cloud accounts are not connected on this deployment yet. Configure the Cloudflare auth endpoint to enable sign in.', 'error');
            return;
        }
        submit.disabled = true;
        setStatus(mode === 'signup' ? 'Creating your account...' : 'Signing you in...');
        try {
            const response = await fetch(`${endpoint}/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.message || `Account request failed (${response.status}).`);
            if (data.token) sessionStorage.setItem('jungle_auth_token', data.token);
            if (data.user) sessionStorage.setItem('jungle_auth_user', JSON.stringify(data.user));
            setStatus(mode === 'signup' ? 'Account created.' : 'Signed in.', 'success');
            setTimeout(() => { close(); projectsDashboard?.classList.add('show'); JungleUI.renderProjectsDashboard?.(); }, 350);
        } catch (error) {
            setStatus(error?.message || 'The account service could not be reached.', 'error');
        } finally { submit.disabled = false; }
    }

    function showGooglePicker() {
        const oauthUrl = String(window.JUNGLE_GOOGLE_AUTH_URL || (authEndpoint() ? `${authEndpoint()}/google` : '')).trim();
        if (oauthUrl) { window.location.href = oauthUrl; return; }
        formView.classList.add('hidden');
        picker.classList.remove('hidden');
        accountList.innerHTML = '<button class="auth-account" id="auth-demo-google-account" type="button"><span class="google-account-mark">G</span><span><strong>Continue with Google</strong><small>Choose an account after Google OAuth is configured</small></span><span class="auth-account-arrow">&rarr;</span></button>';
        document.getElementById('auth-demo-google-account').onclick = () => setStatus('Google account selection is ready, but OAuth credentials still need to be connected to the Cloudflare deployment.', 'error');
    }

    openLogin.onclick = () => open('login');
    openSignup.onclick = () => open('signup');
    back.onclick = close;
    form.addEventListener('submit', submitForm);
    googleButton?.addEventListener('click', showGooglePicker);
    googleOther?.addEventListener('click', () => setStatus('Connect a Google OAuth client to enable account selection.', 'error'));
    googleBack?.addEventListener('click', () => { picker.classList.add('hidden'); formView.classList.remove('hidden'); setStatus(''); });
    const authToken = new URLSearchParams(window.location.search).get('auth_token');
    if (authToken) {
        sessionStorage.setItem('jungle_auth_token', authToken);
        window.history.replaceState(null, '', window.location.pathname);
    }
})();
