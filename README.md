# AI Agent (Next.js)

Single-agent chat widget and demo built with Next.js, Ollama, and MongoDB. Includes an embeddable widget, a demo page, and backend routes for chatbot details, chat streaming, and conversation persistence.

## Prerequisites

- Node 18+
- MongoDB
- Ollama running with your chosen model (default: `phi3:mini`)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment in `.env` (example):

```
MONGODB_URI=mongodb://USER:PASS@localhost:27017
MONGODB_DB=ai-agent
MONGODB_CHATBOT_COLLECTION=chatbot
MONGODB_SETTINGS_COLLECTION=settings
MONGODB_CONVERSATIONS_COLLECTION=conversations
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=phi3:mini
```

Admin users, password hashes, the session-signing secret, and the optional IPInfo token are configured through `/admin` on first run and stored in MongoDB.

3. Seed defaults (via docker entrypoint or manually):
   - `chatbot` collection: one document with name/colors/avatar/greeting/starting_message (localized arrays or maps).
   - `settings` collection: instruction + model params (temperature, top_k, top_p, max_tokens).
4. Run dev server:

```bash
npm run dev
```

Visit `http://localhost:3030`.

## Admin UI

Use one admin entry point:

```bash
/admin
```

`/admin` decides what to show based on MongoDB state. If setup is incomplete, it shows first-run setup. If setup is complete and no admin session exists, it shows sign-in. If an admin session exists, it shows the dashboard.

The first-run setup creates the first admin user, stores the password as a hash in MongoDB, generates the server-side session secret, and saves the optional IPInfo token.

It lets an admin manage:

- Agent profile: name, avatar, colors, localized greetings, and starting messages.
- Agent settings: instructions, model, temperature, top-k/top-p, max tokens, retrieval namespace, and retrieval count.
- System integrations: IPInfo token setup/replacement/clearing.
- Knowledge: upload PDFs, RAG website URLs on demand, list indexed sources, and delete indexed sources.
- Conversations: review user conversations, status/notes/actions, IP/location metadata, and a location map when coordinates are available.

The IPInfo token enables city/country/coordinate enrichment for widget conversations. Without a token, the app still stores request headers such as user agent/referrer and any proxy-provided country code.

Protected routes:

- `/admin`
- `/api/admin/*`
- `/api/embed/*`
- `/widget-demo.html`

Public routes needed by external embedded widgets remain public, including `/scripts/chat-widget.js`, `/styles/chat-widget.css`, `/api/agents/details`, `/api/agents/chat/stream`, and conversation persistence APIs.

## Key Routes

- `GET /api/agents/details`  
  Loads the single chatbot config from Mongo (`chatbot` collection). Returns `data.chatbot` and `agent.name`.

- `POST /api/agents/chat/stream`  
  Streams OpenAI-style SSE (`data: {choices:[{delta:{content}}]}`) using Ollama. Builds prompt from `messages` and `instruction`/settings in Mongo `settings` collection. Query/body: `{ messages: [{role, content}, ...] }`.

- `POST /api/agents/conversations/create`  
  Creates a conversation in Mongo `conversations` collection. Body: `{ conversation, user?, metadata?, source? }`. Returns `data.conversation_id`.

- `PUT /api/agents/conversations/update`  
  Appends messages and updates user/metadata for a given `conversation_id`.

- `GET /api/agents/conversations/details?conversation_id=...`  
  Returns stored messages, metadata, and user for a conversation.

- `POST /api/embed`  
  Embed PDF uploads into MongoDB vector store (multipart or base64) with chunking.

- `POST /api/embed/url`  
  Fetches and embeds website text (http/https URL) into the same vector store. Body: `{ url: "https://...", namespace? }` or `{ urls: ["..."], namespace? }`.

Admin routes:

- `GET|POST /api/admin/setup`
- `POST /api/admin/auth/login`
- `POST /api/admin/auth/logout`
- `GET|PUT /api/admin/agent`
- `GET|PUT /api/admin/settings`
- `GET|PUT /api/admin/system`
- `GET|DELETE /api/admin/documents`
- `GET /api/admin/conversations`
- `PATCH|DELETE /api/admin/conversations/:conversationId`

## Widget & Demo

- `public/scripts/chat-widget.js`: embeddable widget that:
  - Fetches chatbot details from `/api/agents/details`.
  - Streams replies from `/api/agents/chat/stream`.
  - Persists conversations via `/api/agents/conversations/{create,update,details}` with a cookie for conversation id/user info.
  - Supports `data-lang` override; if omitted, uses browser language.
- `/widget-demo.html`: protected admin-only widget demo that showcases the widget and generates an embed snippet. The language dropdown includes a “Browser Language” option; selecting it removes `data-lang` from the snippet so browser locale is used.

## Static Data

- `public/data/CountryData.json` and `public/data/LanguagesData.json` support phone placeholders and language selection in the widget/demo.
- Translations for the widget and demo live under `public/locales/{en,de,it}/translation.json`.

## Running Notes

- Widget avatar defaults to `/avatars/Michael_Intro.mp4`; can be overridden via Mongo `chatbot.avatar` or `data-avatar`.
- Conversation cookie: `intu_chat_conversation` stores `conversation_id`, `lang` (unless forced by `data-lang`), and user details for continuity.
