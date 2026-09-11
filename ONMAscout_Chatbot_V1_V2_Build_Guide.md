# ONMA scout AI Chatbot — Build Guide (Version 1 → Version 2)

This is the build-ready version of the plan: two versions, each with a scope, a checklist, a file structure, and a "start here" sequence. Build V1 fully, ship it internally/staging, then extend the same codebase into V2 — you are not throwing V1 away, you are filling in the parts it deliberately skipped.

---

# VERSION 1 — Working widget, minimal brain

## Goal
A real, embeddable chat widget on onmascout.de, backed by a real LLM call, answering from a small hand-curated knowledge set. No real RAG pipeline, no admin panel, no lead capture, no full compliance hardening. This proves the concept and is demoable, but is **staging-grade, not a permanent public release** — see the two non-negotiable exceptions in the checklist below.

## What's in scope
- Chat widget UI (launcher, panel, messages, loading/error states, mobile)
- PHP chat API (session handling, basic rate limiting, validation)
- One LLM call per message, with a static knowledge blob pasted into the system prompt
- German only
- Basic fallback response when the model doesn't know something
- Manual deploy to existing hosting

## What's explicitly deferred to V2
- Real ingestion pipeline / crawler
- pgvector / embeddings / semantic retrieval
- Multi-language detection
- Lead capture
- Admin dashboard
- Full GDPR data-lifecycle work, caching, streaming, bot protection (Turnstile)

---

## V1 Checklist

### Setup
- [ ] Create Git repo (or a `/chatbot` branch in the existing site repo)
- [ ] Choose LLM provider account for V1 (can be a general provider for now — you will revisit EU-hosting requirements in V2, see the compliance note below)
- [ ] Get API key, store in server-side `.env`, confirm it is **never** referenced in any JS file
- [ ] Provision a MySQL database/schema for the chatbot (`chatbot_v1` or reuse existing DB with a table prefix)

### Compliance (the two things that cannot wait, even for V1)
- [ ] Widget only fires its first network call **after** the existing cookie-consent banner has been accepted
- [ ] Do not store raw visitor IPs in `chat_sessions` — truncate (zero the last octet) or hash-and-drop-after-window before writing to DB

### Backend — PHP Chat API
- [ ] `POST /api/chat` endpoint: accepts `{ session_id, message }`, returns `{ reply }`
- [ ] `POST /api/session` endpoint: creates a session row, returns a session token
- [ ] Input validation: reject empty messages, cap max message length (e.g. 1000 chars)
- [ ] Basic rate limiting: max N requests per session per minute (simple DB counter is fine for V1)
- [ ] Sanitize/escape any user input before it touches a DB query or gets logged
- [ ] System prompt (hard-coded PHP constant or config file) containing:
  - Company facts: services, contact info, address, hours
  - A handful of the most important service-page summaries (SEO, SEA, Webdesign, App)
  - Explicit instruction: "If the answer isn't in the provided context, say you don't have that information and suggest contacting ONMA scout directly — do not invent details."
- [ ] LLM service class (`Chatbot/AI/LlmClient.php` or similar) — isolate provider-specific code so swapping providers in V2 is a one-file change

### Frontend — Widget
- [ ] Floating launcher button, fixed position, doesn't block page content
- [ ] Chat panel: opens/closes smoothly, namespaced CSS (`.onma-chat-*` prefix) to avoid clashing with the site's existing styles
- [ ] Message list: distinct user vs. bot bubbles
- [ ] Loading indicator while waiting for a response
- [ ] Error state: friendly message + retry option if the API call fails
- [ ] Mobile responsive: usable at common phone widths (360–414px)
- [ ] Enter to send, Shift+Enter for newline
- [ ] Basic keyboard/focus accessibility on the launcher and input

### Deploy
- [ ] Deploy `/chatbot/` folder to existing PHP hosting
- [ ] Confirm HTTPS on the endpoint (should already be true for the whole site)
- [ ] Smoke test: open widget, ask 5 real questions a prospective client would ask, confirm sane answers and a sane fallback for an out-of-scope question

## V1 File Structure

```
/chatbot/
  /config/
    config.php              # env loading, DB credentials, LLM API key reference
    system_prompt.php        # the hand-curated knowledge blob + instructions
  /src/
    /AI/
      LlmClient.php          # provider-specific call, isolated for easy swap later
    /Database/
      Db.php                 # PDO connection wrapper
      SessionRepository.php
      MessageRepository.php
  /api/
    chat.php                 # POST /api/chat
    session.php              # POST /api/session
  /public/
    widget.js                 # the entire widget logic, vanilla JS
    widget.css                 # namespaced styles
  /storage/
    logs/                      # app logs, .htaccess deny from all
README.md                       # how to configure and deploy
```

## V1 — Where to start (day 1 sequence)
1. Provision the MySQL tables: `chat_sessions`, `chat_messages` (2 tables only for V1 — see schema below)
2. Write `LlmClient.php` and get one hard-coded test message round-tripping to the LLM from a PHP CLI script (no widget yet) — confirms the API key and network path work
3. Write `system_prompt.php` with real company content pulled from onmascout.de's own service pages
4. Build `api/chat.php` wrapping the CLI script into an HTTP endpoint
5. Build the widget shell (`widget.js` + `widget.css`) against the live endpoint
6. Add loading/error states and mobile CSS last, once the happy path works
7. Deploy to a staging subdomain or a password-protected page first, not the live homepage

## V1 Minimal Database Schema
```sql
CREATE TABLE chat_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_token VARCHAR(64) UNIQUE NOT NULL,
  ip_partial VARCHAR(45),        -- anonymized, not full IP
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  role ENUM('user','assistant') NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
);
```

## V1 Definition of Done
- Widget is live and usable on at least a staging URL
- 90%+ of a 15-question test set (real prospective-client questions) get a sane, non-hallucinated answer or an honest fallback
- No API key or secret is visible in browser dev tools
- Cookie-consent gating and IP anonymization are both verified working

---

# VERSION 2 — Full system

## Goal
Everything V1 deferred: real RAG over the entire site's content, multi-language support, lead capture, an admin panel, full GDPR data-lifecycle handling, and production hardening (caching, streaming, bot protection).

## What's added over V1
- Sitemap-driven crawler + scheduled re-indexing
- pgvector + embeddings + true semantic retrieval with citations
- Multi-language detection and per-language responses (DE/EN/ES/HI)
- Lead capture flow feeding a `chat_leads` table
- Full admin dashboard (sources, re-index, chat logs, settings, analytics)
- GDPR: EU-hosted LLM/embeddings or signed DPA, retention purge cron, right-to-erasure endpoint
- Answer caching, streamed responses, Cloudflare Turnstile on the public endpoint
- Full QA pass: RAG accuracy, security, load, multi-browser, GDPR/consent tests

---

## V2 Checklist

### Compliance
- [ ] Choose and contract an EU-hosted LLM + embedding provider (e.g. Mistral EU, or Azure OpenAI EU region with signed DPA)
- [ ] Add chatbot as a processing activity in the company's Verzeichnis von Verarbeitungstätigkeiten
- [ ] Implement retention purge cron (e.g. delete `chat_messages` older than 90 days)
- [ ] Implement `DELETE /api/session/{id}` for right-to-erasure requests
- [ ] Re-verify cookie-consent gating and IP anonymization still hold under the new architecture

### Infrastructure
- [ ] Provision PostgreSQL + pgvector (self-hosted, EU region)
- [ ] Provision/confirm Redis or MySQL-based cache table for answer caching
- [ ] Set up Cloudflare Turnstile (or equivalent) on the public chat endpoint
- [ ] Set up cron runner for scheduled ingestion re-crawl

### Knowledge ingestion pipeline
- [ ] Build sitemap parser to enumerate all approved URLs (service pages, location pages, blog, Lexikon)
- [ ] HTML extraction + cleanup (strip nav/footer/boilerplate, keep headings)
- [ ] Chunking (500–800 tokens, 50–100 token overlap, respect section boundaries)
- [ ] Attach metadata to every chunk: source URL, title, category, last-indexed date, checksum
- [ ] Generate multilingual embeddings per chunk
- [ ] Upsert vectors + metadata into pgvector
- [ ] Scheduled re-crawl job (checksum-based — only re-embed changed pages)

### RAG / retrieval
- [ ] Language detection on incoming query
- [ ] Query embedding using the same multilingual model as ingestion
- [ ] Top-k similarity search (start k=5–8) with a similarity threshold
- [ ] Context assembly: dedupe, rank, trim to fit model context window
- [ ] Per-language system prompt selection
- [ ] Grounded-answer rules: explicit "do not invent missing facts" instruction
- [ ] No-answer fallback when retrieved context is below threshold
- [ ] Source citations returned alongside the answer

### Lead capture
- [ ] Detect sales-intent signals in conversation (e.g. pricing questions, "Angebot", "Beratung")
- [ ] Trigger a lightweight capture form (name/email/phone) inside the widget
- [ ] `POST /api/lead` endpoint, writes to `chat_leads`
- [ ] Consent checkbox on the lead form itself (separate from cookie consent)
- [ ] Email/CRM handoff (at minimum: email notification to the sales inbox)

### Admin panel
- [ ] Auth: reuse existing site admin authentication
- [ ] Knowledge sources: list, status, last-indexed date
- [ ] Add/import a URL manually (supplement to the crawler)
- [ ] Re-index / disable a source
- [ ] Chat log viewer (with sources shown per answer)
- [ ] Leads inbox (view/export)
- [ ] Settings: system prompt editor, similarity threshold, top-k, retention window
- [ ] Dashboard: total chats, fallback rate, language breakdown
- [ ] Admin activity audit log

### Security
- [ ] Confirm no API keys anywhere in client-side code
- [ ] CORS locked to the site's own origin(s)
- [ ] CSRF protection on all admin actions
- [ ] Parameterized queries everywhere (no string-concatenated SQL)
- [ ] Treat retrieved chunk content as data, never as instructions (prompt-injection defense)
- [ ] Escape HTML/Markdown in the rendered widget output
- [ ] Confirm logs never contain secrets or full API keys

### Performance
- [ ] Answer cache: hash normalized question + language, skip LLM on cache hit
- [ ] Streamed responses (SSE or chunked) from the LLM to the widget
- [ ] Load test with concurrent sessions

### Testing / QA
- [ ] RAG accuracy: evaluation set of real questions with known correct source
- [ ] Out-of-scope question correctly triggers fallback
- [ ] Prompt-injection attempt does not override system rules
- [ ] Oversized input rejected safely
- [ ] Rapid-fire requests correctly rate-limited
- [ ] Cross-browser check (Chrome/Firefox/Edge/Safari)
- [ ] Mobile check on common widths
- [ ] Consent-gating verified: widget doesn't call the API pre-consent
- [ ] Retention purge cron verified on a test dataset

### Deployment
- [ ] Production environment config finalized
- [ ] Monitoring + alerting on the chat endpoint and cron jobs
- [ ] Backups for MySQL and PostgreSQL/pgvector
- [ ] Rollback plan documented

---

## V2 File Structure (extends V1, does not replace it)

```
/chatbot/
  /config/
    config.php
    languages.php              # per-language system prompt map
  /src/
    /AI/
      LlmClient.php             # now points to the EU provider
      EmbeddingClient.php       # new
    /RAG/
      Chunker.php               # new
      Retriever.php             # new
      ContextBuilder.php        # new
      LanguageDetector.php      # new
    /Knowledge/
      SitemapCrawler.php        # new
      HtmlExtractor.php         # new
      IngestionPipeline.php     # new
    /Leads/
      LeadService.php           # new
    /Database/
      Db.php
      SessionRepository.php
      MessageRepository.php
      SourceRepository.php      # new
      ChunkRepository.php       # new
      LeadRepository.php        # new
      CacheRepository.php       # new
  /api/
    chat.php                     # now streams + checks cache + retrieval
    session.php
    lead.php                      # new
    sources.php                   # new — admin
    sources_index.php             # new — admin, POST /api/sources/{id}/index
    chats.php                      # new — admin
    analytics.php                  # new — admin
    health.php                     # new
  /admin/
    dashboard.php                  # new
    sources.php                    # new
    chat_logs.php                  # new
    leads.php                      # new
    settings.php                   # new
  /public/
    widget.js
    widget.css
  /storage/
    logs/
    cache/                          # new
  /cron/
    reindex.php                     # new — scheduled crawl/re-embed
    purge_old_data.php              # new — GDPR retention job
  /tests/
    rag_eval_set.json               # new — evaluation questions + expected sources
README.md
```

## V2 Full Database Schema (adds to V1's two tables)

```sql
-- from V1, unchanged
-- chat_sessions, chat_messages

CREATE TABLE knowledge_sources (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(20),              -- 'url' | 'document'
  title VARCHAR(255),
  url VARCHAR(500),
  status VARCHAR(20),
  checksum VARCHAR(64),
  last_indexed_at DATETIME
);

CREATE TABLE knowledge_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_id INT,
  content LONGTEXT,
  version INT,
  checksum VARCHAR(64),
  FOREIGN KEY (source_id) REFERENCES knowledge_sources(id)
);

-- knowledge_chunks lives in PostgreSQL/pgvector, not MySQL:
-- CREATE TABLE knowledge_chunks (
--   id SERIAL PRIMARY KEY,
--   document_id INT,
--   chunk_text TEXT,
--   chunk_order INT,
--   embedding VECTOR(1024),
--   metadata JSONB
-- );

CREATE TABLE chat_feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id INT,
  rating TINYINT,
  reason VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chat_leads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT,
  name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  service_interest VARCHAR(255),
  consent_at DATETIME,
  status VARCHAR(20) DEFAULT 'new',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
);

CREATE TABLE answer_cache (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question_hash VARCHAR(64) UNIQUE,
  language VARCHAR(5),
  answer TEXT,
  sources_json TEXT,
  hit_count INT DEFAULT 0,
  expires_at DATETIME
);

CREATE TABLE bot_settings (
  `key` VARCHAR(100) PRIMARY KEY,
  `value` TEXT,
  updated_at DATETIME
);

CREATE TABLE admin_activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT,
  action VARCHAR(100),
  entity VARCHAR(100),
  entity_id INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## V2 — Where to start (migration sequence from a working V1)

1. **Compliance first, before any new code runs against real traffic**: finalize the EU LLM/embedding provider contract and DPA
2. Stand up PostgreSQL + pgvector, confirm connectivity from the PHP app
3. Build the ingestion pipeline (`SitemapCrawler` → `HtmlExtractor` → `Chunker` → `EmbeddingClient` → pgvector upsert) and run it once manually against a handful of pages to validate output quality before crawling the whole site
4. Build `Retriever.php` + `ContextBuilder.php`, and swap `api/chat.php` from "static system prompt" to "retrieved context + system prompt" — this is the single riskiest change, test it heavily against the V1 question set before moving on
5. Add `LanguageDetector.php` and per-language prompts
6. Add the cron jobs (`reindex.php`, `purge_old_data.php`) and confirm both run cleanly on a schedule
7. Build the admin panel screens one at a time (sources → chat logs → leads → settings → dashboard)
8. Add lead capture last, once the core RAG answers are trustworthy — a lead form on an unreliable bot does more harm than good
9. Add caching, streaming, and Turnstile as a hardening pass right before the full QA cycle
10. Run the full QA checklist (accuracy, security, load, browsers, GDPR) before flipping the widget from staging to the live homepage

## V2 Definition of Done
- All V1 criteria still pass
- RAG evaluation set (real questions across DE/EN at minimum) scores acceptably on grounding and correct-source retrieval
- Admin can add a new source and see it live in the bot's knowledge within one re-index cycle
- A GDPR erasure request can be fulfilled end-to-end via the admin panel or the API
- Retention purge cron has run successfully at least once against real data
- Load test shows acceptable response times under expected concurrent traffic
