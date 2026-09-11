/**
 * ONMA scout Chat Widget — vanilla JS, no dependencies.
 * Namespaced DOM (.onma-chat-*) and a single global (ONMAChat) so it can be
 * dropped into any page without colliding with existing site scripts.
 *
 * Bilingual (DE/EN): the visitor picks a language with the DE/EN toggle in
 * the header. This is a manual switch, not automatic language detection
 * (that's a V2 feature) — every string in the widget and the `language`
 * sent to the backend follow whatever the visitor last picked.
 *
 * Usage:
 *   <link rel="stylesheet" href="/chatbot/public/widget.css">
 *   <script src="/chatbot/public/widget.js"></script>
 *   <script>
 *     ONMAChat.init({
 *       apiBase: '/chatbot/api',
 *       hasConsent: function () { return document.cookie.includes('cookie_consent=accepted'); },
 *       onConsentGiven: function (cb) { document.addEventListener('onma:consentAccepted', cb); }
 *     });
 *   </script>
 */
(function (window, document) {
  'use strict';

  // Resolve the bundled logo relative to wherever this script itself was
  // loaded from, so it keeps working no matter which page embeds the widget.
  var CURRENT_SCRIPT_SRC = document.currentScript ? document.currentScript.src : '';
  var DEFAULT_LOGO_URL = CURRENT_SCRIPT_SRC
    ? CURRENT_SCRIPT_SRC.replace(/widget\.js(\?.*)?$/, 'onma.png')
    : 'onma.png';

  var STRINGS = {
    de: {
      title: 'ONMA scout Assistent',
      subtitle: 'Wir antworten in der Regel sofort',
      greeting: 'Hallo! Ich bin der virtuelle Assistent von ONMA scout. Wie kann ich Ihnen bei SEO, SEA, Webdesign oder App-Entwicklung helfen?',
      placeholder: 'Ihre Nachricht…',
      launcherLabel: 'Chat öffnen',
      closeLabel: 'Chat schließen',
      sendLabel: 'Senden',
      inputLabel: 'Nachricht eingeben',
      footerNote: 'Antworten werden automatisch generiert und können Fehler enthalten.',
      consentTitle: 'Bitte Cookies akzeptieren',
      consentBody: 'Der Chat startet, sobald Sie der Cookie-Nutzung auf dieser Seite zugestimmt haben.',
      errorBubble: 'Entschuldigung, da ist etwas schiefgelaufen. Bitte versuchen Sie es erneut.',
      retryLabel: 'Erneut senden',
      fallbackReply: 'Entschuldigung, ich habe darauf keine Antwort.',
      youLabel: 'Sie',
      langButtonLabelDe: 'Auf Deutsch anzeigen',
      langButtonLabelEn: 'Auf Englisch anzeigen'
    },
    en: {
      title: 'ONMA scout Assistant',
      subtitle: 'We usually reply right away',
      greeting: "Hi! I'm ONMA scout's virtual assistant. How can I help you with SEO, SEA, web design or app development?",
      placeholder: 'Your message…',
      launcherLabel: 'Open chat',
      closeLabel: 'Close chat',
      sendLabel: 'Send',
      inputLabel: 'Enter message',
      footerNote: 'Answers are generated automatically and may contain errors.',
      consentTitle: 'Please accept cookies',
      consentBody: 'The chat will start as soon as you accept cookie usage on this site.',
      errorBubble: 'Sorry, something went wrong. Please try again.',
      retryLabel: 'Retry',
      fallbackReply: "Sorry, I don't have an answer for that.",
      youLabel: 'You',
      langButtonLabelDe: 'Show in German',
      langButtonLabelEn: 'Show in English'
    }
  };

  var DEFAULTS = {
    apiBase: '/chatbot/api',
    maxLength: 1000,
    storageKey: 'onma_chat_session_token',
    langStorageKey: 'onma_chat_lang',
    defaultLanguage: null, // null = auto-detect from navigator.language, falls back to 'de'
    logoUrl: DEFAULT_LOGO_URL,
    // By default, look for a common consent cookie/localStorage flag.
    // Host site should override this via ONMAChat.init({ hasConsent: fn }).
    hasConsent: function () {
      try {
        if (localStorage.getItem('cookie_consent') === 'accepted') return true;
      } catch (e) {}
      return /cookie_?consent=accepted/i.test(document.cookie);
    },
    onConsentGiven: function (callback) {
      document.addEventListener('onma:consentAccepted', callback);
      window.addEventListener('storage', function (e) {
        if (e.key === 'cookie_consent' && e.newValue === 'accepted') callback();
      });
    }
  };

  var ICONS = {
    chat: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 4h16v12H7l-3 3V4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 12l16-8-6 8 6 8-16-8z" fill="currentColor"/></svg>'
  };

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function detectDefaultLanguage() {
    try {
      var nav = (navigator.language || navigator.userLanguage || 'de').toLowerCase();
      return nav.indexOf('en') === 0 ? 'en' : 'de';
    } catch (e) {
      return 'de';
    }
  }

  function ONMAChatWidget(config) {
    this.config = Object.assign({}, DEFAULTS, config || {});
    this.sessionToken = null;
    this.isOpen = false;
    this.isSending = false;
    this.consentReady = false;
    this.pendingFirstOpen = false;
    this.history = [];
    this.lang = this._loadInitialLanguage();
    this._build();
    this._bind();
    this._checkConsent();
  }

  ONMAChatWidget.prototype._loadInitialLanguage = function () {
    try {
      var stored = localStorage.getItem(this.config.langStorageKey);
      if (stored === 'de' || stored === 'en') return stored;
    } catch (e) {}
    return this.config.defaultLanguage === 'de' || this.config.defaultLanguage === 'en'
      ? this.config.defaultLanguage
      : detectDefaultLanguage();
  };

  ONMAChatWidget.prototype._t = function (key) {
    return STRINGS[this.lang][key];
  };

  ONMAChatWidget.prototype._checkConsent = function () {
    var self = this;
    if (this.config.hasConsent()) {
      this.consentReady = true;
      return;
    }
    this.config.onConsentGiven(function () {
      self.consentReady = true;
      self._hideConsentNotice();
      if (self.pendingFirstOpen) {
        self.pendingFirstOpen = false;
        self._ensureSession();
      }
    });
  };

  ONMAChatWidget.prototype._build = function () {
    var root = document.createElement('div');
    root.className = 'onma-chat-root';
    root.innerHTML =
      '<button type="button" class="onma-chat-launcher" aria-haspopup="dialog" aria-expanded="false">' +
        ICONS.chat +
      '</button>' +
      '<section class="onma-chat-panel" role="dialog" aria-modal="false">' +
        '<header class="onma-chat-header">' +
          '<div class="onma-chat-header-info">' +
            '<span class="onma-chat-header-title"></span>' +
            '<span class="onma-chat-header-status"><span class="onma-chat-status-dot"></span><span class="onma-chat-header-status-text"></span></span>' +
          '</div>' +
          '<div class="onma-chat-header-actions">' +
            '<div class="onma-chat-lang-switch" role="group">' +
              '<button type="button" class="onma-chat-lang-btn" data-lang="de">DE</button>' +
              '<button type="button" class="onma-chat-lang-btn" data-lang="en">EN</button>' +
            '</div>' +
            '<button type="button" class="onma-chat-close">' + ICONS.close + '</button>' +
          '</div>' +
        '</header>' +
        '<div class="onma-chat-messages" aria-live="polite"></div>' +
        '<div class="onma-chat-inputbar">' +
          '<textarea class="onma-chat-textarea" rows="1" maxlength="' + this.config.maxLength + '"></textarea>' +
          '<button type="button" class="onma-chat-send" disabled>' + ICONS.send + '</button>' +
        '</div>' +
        '<div class="onma-chat-footer-note"></div>' +
      '</section>';

    document.body.appendChild(root);

    this.el = {
      root: root,
      launcher: root.querySelector('.onma-chat-launcher'),
      panel: root.querySelector('.onma-chat-panel'),
      closeBtn: root.querySelector('.onma-chat-close'),
      title: root.querySelector('.onma-chat-header-title'),
      statusText: root.querySelector('.onma-chat-header-status-text'),
      langBtns: root.querySelectorAll('.onma-chat-lang-btn'),
      messages: root.querySelector('.onma-chat-messages'),
      textarea: root.querySelector('.onma-chat-textarea'),
      sendBtn: root.querySelector('.onma-chat-send'),
      footerNote: root.querySelector('.onma-chat-footer-note')
    };

    this._applyStrings();
  };

  ONMAChatWidget.prototype._applyStrings = function () {
    var t = this._t.bind(this);

    this.el.launcher.setAttribute('aria-label', t('launcherLabel'));
    this.el.panel.setAttribute('aria-label', t('title'));
    this.el.closeBtn.setAttribute('aria-label', t('closeLabel'));
    this.el.title.textContent = t('title');
    this.el.statusText.textContent = t('subtitle');
    this.el.textarea.setAttribute('placeholder', t('placeholder'));
    this.el.textarea.setAttribute('aria-label', t('inputLabel'));
    this.el.sendBtn.setAttribute('aria-label', t('sendLabel'));
    this.el.footerNote.textContent = t('footerNote');
    this.el.root.setAttribute('lang', this.lang);

    this.el.langBtns.forEach(function (btn) {
      var isCurrent = btn.getAttribute('data-lang') === this.lang;
      btn.classList.toggle('onma-chat-lang-btn-active', isCurrent);
      btn.setAttribute('aria-pressed', String(isCurrent));
      btn.setAttribute('aria-label', btn.getAttribute('data-lang') === 'de' ? t('langButtonLabelDe') : t('langButtonLabelEn'));
    }, this);

    var consentTitleEl = this.el.messages.querySelector('.onma-chat-consent strong');
    if (consentTitleEl) {
      consentTitleEl.textContent = t('consentTitle');
      consentTitleEl.nextSibling && (consentTitleEl.nextSibling.textContent = t('consentBody'));
    }
  };

  ONMAChatWidget.prototype._setLanguage = function (lang) {
    if (lang !== 'de' && lang !== 'en') return;
    if (lang === this.lang) return;

    this.lang = lang;
    try { localStorage.setItem(this.config.langStorageKey, lang); } catch (e) {}
    this._applyStrings();

    // If nothing beyond the greeting has happened yet, swap the greeting
    // text too so the very first thing the visitor reads matches their pick.
    var onlyGreetingShown = this.history.length === 0 && this.el.messages.children.length === 1;
    if (onlyGreetingShown) {
      this.el.messages.innerHTML = '';
      this._renderGreetingIfEmpty();
    }
  };

  ONMAChatWidget.prototype._bind = function () {
    var self = this;

    this.el.launcher.addEventListener('click', function () { self.toggle(); });
    this.el.closeBtn.addEventListener('click', function () { self.close(); });

    this.el.langBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        self._setLanguage(btn.getAttribute('data-lang'));
      });
    });

    this.el.textarea.addEventListener('input', function () {
      self._autoGrow();
      self.el.sendBtn.disabled = self.isSending || !self.el.textarea.value.trim();
    });

    this.el.textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        self._handleSend();
      }
    });

    this.el.sendBtn.addEventListener('click', function () { self._handleSend(); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && self.isOpen) self.close();
    });
  };

  ONMAChatWidget.prototype._autoGrow = function () {
    var ta = this.el.textarea;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  };

  ONMAChatWidget.prototype.toggle = function () {
    if (this.isOpen) this.close();
    else this.open();
  };

  ONMAChatWidget.prototype.open = function () {
    this.isOpen = true;
    this.el.panel.classList.add('onma-chat-open');
    this.el.launcher.setAttribute('aria-expanded', 'true');

    if (!this.consentReady) {
      this._showConsentNotice();
      this.pendingFirstOpen = true;
      return;
    }

    this._ensureSession();
    this.el.textarea.focus();
  };

  ONMAChatWidget.prototype.close = function () {
    this.isOpen = false;
    this.el.panel.classList.remove('onma-chat-open');
    this.el.launcher.setAttribute('aria-expanded', 'false');
    this.el.launcher.focus();
  };

  ONMAChatWidget.prototype._showConsentNotice = function () {
    if (this.el.messages.querySelector('.onma-chat-consent')) return;
    var notice = document.createElement('div');
    notice.className = 'onma-chat-consent';
    var strong = document.createElement('strong');
    strong.textContent = this._t('consentTitle');
    notice.appendChild(strong);
    notice.appendChild(document.createTextNode(this._t('consentBody')));
    this.el.messages.appendChild(notice);
  };

  ONMAChatWidget.prototype._hideConsentNotice = function () {
    var notice = this.el.messages.querySelector('.onma-chat-consent');
    if (notice) notice.remove();
  };

  ONMAChatWidget.prototype._ensureSession = function () {
    var self = this;
    if (this.sessionToken) return Promise.resolve(this.sessionToken);

    try {
      var stored = localStorage.getItem(this.config.storageKey);
      if (stored) {
        this.sessionToken = stored;
        this._renderGreetingIfEmpty();
        return Promise.resolve(stored);
      }
    } catch (e) {}

    return fetch(this.config.apiBase + '/session.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
      .then(function (res) {
        if (!res.ok) throw new Error('session_failed');
        return res.json();
      })
      .then(function (data) {
        self.sessionToken = data.session_token;
        try { localStorage.setItem(self.config.storageKey, self.sessionToken); } catch (e) {}
        self._renderGreetingIfEmpty();
        return self.sessionToken;
      })
      .catch(function () {
        self._renderGreetingIfEmpty();
        return null;
      });
  };

  ONMAChatWidget.prototype._renderGreetingIfEmpty = function () {
    if (this.history.length === 0) {
      this._renderMessage('assistant', this._t('greeting'));
    }
  };

  ONMAChatWidget.prototype._handleSend = function () {
    var text = this.el.textarea.value.trim();
    if (!text || this.isSending) return;
    this._sendMessage(text);
  };

  ONMAChatWidget.prototype._sendMessage = function (text) {
    var self = this;

    this.el.textarea.value = '';
    this._autoGrow();
    this.el.sendBtn.disabled = true;

    this._renderMessage('user', text);
    this.history.push({ role: 'user', content: text });

    var typingEl = this._renderTyping();
    this.isSending = true;
    this.el.textarea.disabled = true;

    this._ensureSession().then(function (token) {
      return fetch(self.config.apiBase + '/chat.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: token, message: text, language: self.lang })
      });
    })
      .then(function (res) {
        if (!res.ok) throw new Error('request_failed');
        return res.json();
      })
      .then(function (data) {
        typingEl.remove();
        var reply = data.reply || self._t('fallbackReply');
        self._renderMessage('assistant', reply);
        self.history.push({ role: 'assistant', content: reply });
      })
      .catch(function () {
        typingEl.remove();
        self._renderError(text);
      })
      .finally(function () {
        self.isSending = false;
        self.el.textarea.disabled = false;
        self.el.sendBtn.disabled = !self.el.textarea.value.trim();
        self.el.textarea.focus();
      });
  };

  ONMAChatWidget.prototype._botAvatarHtml = function () {
    return '<span class="onma-chat-avatar onma-chat-avatar-bot"><img src="' +
      escapeHtml(this.config.logoUrl) + '" alt="ONMA scout" /></span>';
  };

  ONMAChatWidget.prototype._renderMessage = function (role, content) {
    var isUser = role === 'user';
    var row = document.createElement('div');
    row.className = 'onma-chat-row ' + (isUser ? 'onma-chat-row-user' : 'onma-chat-row-bot');
    row.innerHTML =
      (isUser
        ? '<span class="onma-chat-avatar">' + escapeHtml(this._t('youLabel')) + '</span>'
        : this._botAvatarHtml()) +
      '<div class="onma-chat-bubble"></div>';
    row.querySelector('.onma-chat-bubble').textContent = content;
    this.el.messages.appendChild(row);
    this._scrollToBottom();
    return row;
  };

  ONMAChatWidget.prototype._renderTyping = function () {
    var row = document.createElement('div');
    row.className = 'onma-chat-row onma-chat-row-bot';
    row.innerHTML =
      this._botAvatarHtml() +
      '<div class="onma-chat-bubble"><span class="onma-chat-typing"><span></span><span></span><span></span></span></div>';
    this.el.messages.appendChild(row);
    this._scrollToBottom();
    return row;
  };

  ONMAChatWidget.prototype._renderError = function (originalText) {
    var self = this;
    var row = document.createElement('div');
    row.className = 'onma-chat-row onma-chat-row-bot';
    row.innerHTML =
      this._botAvatarHtml() +
      '<div>' +
        '<div class="onma-chat-bubble onma-chat-bubble-error"></div>' +
        '<button type="button" class="onma-chat-retry"></button>' +
      '</div>';
    row.querySelector('.onma-chat-bubble-error').textContent = this._t('errorBubble');
    var retryBtn = row.querySelector('.onma-chat-retry');
    retryBtn.textContent = this._t('retryLabel');
    retryBtn.addEventListener('click', function () {
      row.remove();
      self._sendMessage(originalText);
    });
    this.el.messages.appendChild(row);
    this._scrollToBottom();
  };

  ONMAChatWidget.prototype._scrollToBottom = function () {
    this.el.messages.scrollTop = this.el.messages.scrollHeight;
  };

  window.ONMAChat = {
    _instance: null,
    init: function (config) {
      if (this._instance) return this._instance;
      this._instance = new ONMAChatWidget(config);
      return this._instance;
    }
  };
})(window, document);
