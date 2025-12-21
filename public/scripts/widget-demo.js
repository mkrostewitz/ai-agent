(function () {
  const params = new URLSearchParams(window.location.search);
  let mode = (params.get('mode') || 'modal').toLowerCase();
  let lang = (params.get('lang') || 'browser').toLowerCase();

  const snippetEl = document.getElementById('embed-snippet');
  const copyBtn = document.getElementById('copy-btn');
  const badge = document.getElementById('agent-badge');
  const pill = document.getElementById('agent-pill');
  const warn = document.getElementById('agent-warning');
  const pillText = document.getElementById('agent-pill-text');
  const emptyState = document.getElementById('empty-state');
  const embedShell = document.getElementById('embed-shell');
  const liveCard = document.getElementById('live-card');
  const agentUrlMeta = document.getElementById('agent-url-meta');
  const emptyMsg = document.getElementById('empty-message');
  const previewNote = document.getElementById('preview-note');
  const modeModal = document.getElementById('mode-modal');
  const modeEmbedded = document.getElementById('mode-embedded');
  const previewMount = document.getElementById('preview-mount');
  const langSelect = document.getElementById('lang-select');
  const demoTitle = document.getElementById('demo-title');
  const embedTitle = document.getElementById('embed-title');
  const embedCopy = document.getElementById('embed-copy');
  const liveTitle = document.getElementById('live-title');
  const liveDesc = document.getElementById('live-desc');

  let supportedLangs = [];

  function isSupported(code) {
    if (code === 'browser') return true;
    return supportedLangs.some((l) => l.code === code);
  }

  function buildSnippet() {
    const origin = window.location.origin;
    const attrs = [
      'async',
      'src="' + origin + '/scripts/chat-widget.js"',
    ];
    if (mode && mode !== 'modal') {
      attrs.push('data-mode="' + mode + '"');
      attrs.push('data-mount="#preview-mount"');
    }
    if (lang && lang !== 'browser') {
      attrs.push('data-lang="' + lang + '"');
    }
    return '<script ' + attrs.join('\n  ') + '>\n</script>';
  }

  function setSnippet(text) {
    snippetEl.textContent = text;
  }

  function copySnippet() {
    const text = snippetEl.textContent;
    if (!text) return;
    navigator.clipboard.writeText(text).then(function () {
      copyBtn.textContent = 'Copied!';
      setTimeout(function () {
        copyBtn.textContent = 'Copy';
      }, 1400);
    });
  }

  function showMissing() {
    if (emptyState) emptyState.style.display = 'block';
    if (embedShell) embedShell.style.display = 'none';
    if (liveCard) liveCard.style.display = 'none';
    if (badge) badge.style.display = 'none';
    if (pill) pill.style.display = 'none';
    if (warn) warn.style.display = 'block';
    copyBtn.disabled = true;
    copyBtn.style.opacity = 0.6;
    setSnippet('');
    if (agentUrlMeta) agentUrlMeta.textContent = t('missingNote');
    if (emptyMsg) emptyMsg.textContent = t('missingNote');
    if (liveDesc) liveDesc.textContent = t('missingNote');
  }

  copyBtn.addEventListener('click', copySnippet);

  function setMode(newMode) {
    mode = newMode;
    params.set('mode', mode);
    if (lang) params.set('lang', lang);
    const url =
      window.location.origin +
      window.location.pathname +
      '?' +
      params.toString();
    window.history.replaceState({}, '', url);
    if (modeModal && modeEmbedded) {
      modeModal.classList.toggle('active', mode === 'modal');
      modeEmbedded.classList.toggle('active', mode === 'embedded');
    }
    if (mode === 'embedded') {
      if (previewNote)
        previewNote.textContent = 'Embedded widget shown inside this box.';
      if (previewMount) previewMount.innerHTML = '';
    } else {
      if (previewNote)
        previewNote.textContent =
          'Launching demo widget in the bottom-right corner.';
      if (previewMount) previewMount.innerHTML = '';
    }
  }

  // console.log('[demo] initial lang:', lang, 'mode:', mode, 'agentId:', agentId);

  loadSupportedLanguages()
    .then(function () {
      if (!isSupported(lang)) lang = supportedLangs[0]?.code || 'en';
      params.set('lang', lang);
      return loadTranslations(resolveLangForTranslations(lang));
    })
    .then(function () {
      applyTranslations();
      initLangSelector();
      return fetch('/api/agents/details');
    })
    .then(function (res) {
      return res.json();
    })
    .then(function (resp) {
      const data = resp && resp.data ? resp.data : null;
      const chatbot = data ? data.chatbot || {} : {};
      const snippet = buildSnippet(chatbot);
      setSnippet(snippet);
      if (pill) pill.style.display = 'inline-flex';
      if (warn) warn.style.display = 'none';
      if (emptyState) emptyState.style.display = 'none';
      if (embedShell) embedShell.style.display = 'block';
      if (liveCard) liveCard.style.display = 'block';
      copyBtn.disabled = false;
      copyBtn.style.opacity = 1;
      if (pillText)
        pillText.textContent = t('onlineAs', {
          name: chatbot.name || 'Chatbot',
        });

      const widgetScript = document.createElement('script');
      widgetScript.src = '/scripts/chat-widget.js';
      widgetScript.async = true;
      // Allow overriding language for demo preview only (not included in the copied snippet)
      if (lang && lang !== 'browser') widgetScript.dataset.lang = lang;
      if (mode && mode !== 'modal') widgetScript.dataset.mode = mode;
      if (mode === 'embedded') widgetScript.dataset.mount = '#preview-mount';
      document.body.appendChild(widgetScript);
    })
    .catch(function () {
      showMissing();
    });

  if (modeModal && modeEmbedded) {
    modeModal.addEventListener('click', function () {
      setMode('modal');
      window.location.reload();
    });
    modeEmbedded.addEventListener('click', function () {
      setMode('embedded');
      window.location.reload();
    });
    setMode(mode);
  }

  // Translations and language handling
  function t(key, vars = {}) {
    const val = window.__chatWidgetDemoTx?.[key] || key;
    return Object.keys(vars).reduce(
      (acc, k) => acc.replace(`{{${k}}}`, vars[k]),
      val,
    );
  }

  function applyTranslations() {
    if (demoTitle) demoTitle.textContent = t('title');
    if (embedTitle) embedTitle.textContent = t('embedTitle');
    if (embedCopy) embedCopy.textContent = t('embedCopy');
    if (copyBtn) copyBtn.textContent = t('copy');
    if (liveTitle) liveTitle.textContent = t('liveTitle');
    if (liveDesc)
      liveDesc.textContent =
        mode === 'embedded' ? t('liveDescEmbedded') : t('liveDescModal');
  }

  function resolveLangForTranslations(code) {
    if (!code || code === 'browser') {
      return (navigator.language || 'en').slice(0, 2).toLowerCase();
    }
    return code;
  }

  function loadTranslations(selectedLang) {
    const path = `/locales/${selectedLang}/translation.json`;
    return fetch(path)
      .then((res) => {
        if (!res.ok) throw new Error('lang fetch failed ' + res.status);
        return res.json();
      })
      .then((json) => {
        window.__chatWidgetDemoTx = json?.pages?.ChatWidgetDemo || {};
      })
      .catch(() => {
        if (selectedLang !== 'en') {
          console.warn('[demo] falling back to en translations');
          return loadTranslations('en');
        }
        window.__chatWidgetDemoTx = {};
        console.warn('[demo] using empty translations');
      });
  }

  function initLangSelector() {
    if (!langSelect) return;
    const allOptions = [
      { code: 'browser', label: t('browserLanguage') || 'Browser Language' },
      ...supportedLangs,
    ];
    langSelect.innerHTML = allOptions
      .map(
        (l) =>
          `<option value="${l.code}" ${l.code === lang ? 'selected' : ''}>${l.label}</option>`,
      )
      .join('');
    langSelect.addEventListener('change', function () {
      lang = langSelect.value;
      params.set('lang', lang);
      const url =
        window.location.origin +
        window.location.pathname +
        '?' +
        params.toString();
      window.history.replaceState({}, '', url);
      window.location.reload();
    });
  }

  // Utilities to load supported langs from data file
  function loadSupportedLanguages() {
    return fetch('/data/LanguagesData.json')
      .then((res) => {
        if (!res.ok) throw new Error('langs fetch failed ' + res.status);
        return res.json();
      })
      .then((json) => {
        supportedLangs = (json || [])
          .filter((l) => l.supported)
          .map((l) => ({
            code: (l.code || '').slice(0, 2).toLowerCase(),
            label: l.nativeName || l.name || l.code,
          }));
        if (!isSupported(lang)) {
          lang = supportedLangs[0]?.code || 'en';
        }
      })
      .catch(() => {
        // Fallback to defaults if data file is not served
        supportedLangs = [
          { code: 'en', label: 'English' },
          { code: 'de', label: 'Deutsch' },
          { code: 'it', label: 'Italiano' },
        ];
        if (!isSupported(lang)) lang = 'en';
        console.warn('[demo] languages fallback to defaults, lang:', lang);
      });
  }
})();
