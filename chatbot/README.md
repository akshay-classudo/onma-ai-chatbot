# ONMA scout Chatbot — V1

Embeddable chat widget for onmascout.de, backed by a single LLM call per
message with a hand-curated system prompt (no RAG yet — see the build guide
in the repo root for the V2 plan).

## Language support

The widget is bilingual (German/English) via a manual DE/EN toggle in the
chat header — not automatic language detection, which is a V2 feature. It
defaults to the visitor's browser language (`navigator.language`, falling
back to German) and remembers their pick in `localStorage`. The chosen
language is sent to `POST /api/chat` as `language` (`"de"` or `"en"`), which
picks the matching prompt from `config/system_prompts.php` and the matching
offline-fallback reply. Add more languages by adding a key to
`STRINGS` in `public/widget.js`, a key to `config/system_prompts.php`, and a
button in the `.onma-chat-lang-switch` markup.

## Setup

1. Copy `.env.example` to `.env` and fill in real values:
   ```
   cp .env.example .env
   ```
2. Create the database and import the schema:
   ```sql
   CREATE DATABASE chatbot_v1 CHARACTER SET utf8mb4;
   ```
   ```
   mysql -u root -p chatbot_v1 < database/schema_v1.sql
   ```
3. Put real company facts into `config/system_prompts.php` (contact info,
   address, hours, service summaries), for both the `de` and `en` entries —
   replace every `[placeholder]`.
4. Confirm `.env` is not web-accessible (XAMPP serves the whole folder, so
   keep `.env` outside of any path Apache would return directly — the
   provided `.htaccess` files only cover `/storage/logs`; add a root
   `.htaccess` rule denying `.env` before deploying).

## Local development (XAMPP)

- Point your browser at `http://localhost/german%20ai%20chatbot/chatbot/demo/index.html`
  to see the widget in isolation, wired against the local PHP endpoints.
- The demo page simulates the site's cookie-consent banner — the widget
  will not call `/api/session.php` or `/api/chat.php` until "Akzeptieren"
  is clicked, matching the production requirement.

## Embedding on the real site

```html
<link rel="stylesheet" href="/chatbot/public/widget.css">
<script src="/chatbot/public/widget.js"></script>
<script>
  ONMAChat.init({
    apiBase: '/chatbot/api',
    hasConsent: function () {
      // wire this to the site's real cookie-consent state
      return document.cookie.includes('cookie_consent=accepted');
    }
  });
</script>
```

## Folder structure

```
/chatbot/
  /config/        env loading, DB credentials, system prompt
  /src/AI/        LlmClient.php — swap providers here only
  /src/Database/  PDO wrapper + repositories
  /api/           chat.php, session.php (JSON endpoints)
  /public/        widget.js, widget.css (served to the browser)
  /database/      schema_v1.sql
  /demo/          standalone preview page
  /storage/logs/  app.log, access denied via .htaccess
```

## Definition of done (V1)

- Widget live on a staging URL
- 90%+ of a 15-question test set gets a sane answer or honest fallback
- No API key visible in browser dev tools
- Cookie-consent gating and IP anonymization verified working
