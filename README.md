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

If the MongoDB password contains reserved URL characters such as `,`, `:`, `@`,
`/`, `?`, `#`, or `%`, URL-encode the password inside `MONGODB_URI`.

Admin users, password hashes, the session-signing secret, the optional IPInfo token, and mail delivery settings are configured through `/admin` and stored in MongoDB.

Mail notification configuration:

```env
# Used to encrypt stored SMTP passwords. Keep stable across deploys.
APP_ENCRYPTION_KEY=replace-with-a-long-random-secret
APP_BASE_URL=https://your-agent-domain.com
```

The Settings tab includes an Email delivery panel for Apple/iCloud, Gmail,
Microsoft 365/Outlook, or custom SMTP. The SMTP password is encrypted before it
is stored in the `app_config` MongoDB document; it is not hashable because the
server must decrypt it later to authenticate with the mail provider. Use
provider app passwords or SMTP authentication credentials, not your normal
account password where the provider requires an app-specific password.

Environment variables such as `MAIL_PROVIDER`, `SMTP_USER`, `SMTP_PASS`,
`MAIL_FROM`, and `MAIL_TO` are still supported as a fallback before mail is
saved from the Admin UI, but the intended production path is encrypted MongoDB
storage through `/admin`.

Optional file storage configuration:

```
# Default: local filesystem storage.
FILE_STORAGE_DRIVER=local

# DigitalOcean Spaces storage for avatars and uploaded CV/PDF originals.
# Keep the app, MongoDB, Ollama, and Space in the same region when possible.
FILE_STORAGE_DRIVER=digitalocean-spaces
DIGITALOCEAN_SPACES_REGION=fra1
DIGITALOCEAN_SPACES_BUCKET=your-space-name
DIGITALOCEAN_SPACES_KEY=your-access-key
DIGITALOCEAN_SPACES_SECRET=your-secret-key
DIGITALOCEAN_SPACES_ENDPOINT=https://fra1.digitaloceanspaces.com
DIGITALOCEAN_SPACES_PUBLIC_URL=https://your-space-name.fra1.digitaloceanspaces.com
```

Aliases `STORAGE_DRIVER`, `DO_SPACES_REGION`, `DO_SPACES_BUCKET`, `DO_SPACES_KEY`, `DO_SPACES_SECRET`, `DO_SPACES_ENDPOINT`, and `DO_SPACES_PUBLIC_URL` are also supported.

With local storage, public avatars are stored under `public/uploads/avatars` and private uploaded PDF originals under `storage/uploads/documents`. The production Docker Compose file mounts both upload roots as named volumes. With DigitalOcean Spaces, avatars are uploaded as public objects and PDF originals as private objects; MongoDB stores the profile URL plus vector chunks and storage keys, not the raw avatar/PDF bytes.

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

- Agent profile: name, bundled or uploaded image/MP4 avatar, colors, localized greetings, and starting messages.
- Agent settings: instructions, model, temperature, top-k/top-p, max tokens, retrieval namespace, and retrieval count.
- System integrations: IPInfo token setup/replacement/clearing and mail delivery settings/status.
- Knowledge: upload PDFs, RAG website URLs on demand, list indexed sources, and delete indexed sources.
- Conversations: review user conversations, status/notes/actions, IP/location metadata, and a location map when coordinates are available.

The IPInfo token enables city/country/coordinate enrichment for widget conversations. Without a token, the app still stores request headers such as user agent/referrer and any proxy-provided country code.

When mail is configured, `/api/agents/conversations/create` sends a best-effort
notification email for each new stored conversation. Delivery errors are logged
server-side and do not prevent the conversation from being saved.

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

- `POST /api/embed/pdf`  
  Stores uploaded PDF originals through the configured file storage backend, then embeds parsed chunks into the MongoDB vector store (multipart or base64).

- `POST /api/embed/url`  
  Fetches and embeds website text (http/https URL) into the same vector store. Body: `{ url: "https://...", namespace? }` or `{ urls: ["..."], namespace? }`.

Admin routes:

- `GET|POST /api/admin/setup`
- `POST /api/admin/auth/login`
- `POST /api/admin/auth/logout`
- `GET|PUT /api/admin/agent`
- `GET|PUT /api/admin/settings`
- `GET|PUT /api/admin/system`
- `POST /api/admin/system/test-email`
- `GET|POST /api/admin/storage`
- `POST /api/admin/avatar`
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

## DigitalOcean GPU Docker Deployment

Detailed setup instructions live in [DEPLOY_DIGITALOCEAN_GPU.md](./DEPLOY_DIGITALOCEAN_GPU.md).

Recommended Droplet choices:

- Image: `OS` -> `AI/ML Ready` for NVIDIA.
- GPU platform: `NVIDIA`.
- GPU plan: `RTX 4000 ADA` with 20 GB VRAM.
- Skip `1-click Models`; this repo pulls Ollama models through Docker Compose.
- Add an SSH key and protect the Droplet with a Cloud Firewall.

Prepare the Droplet once:

```bash
nvidia-smi
docker --version
docker compose version
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

Clone the repo on the Droplet and create the production env file:

```bash
git clone YOUR_REPO_URL /opt/ai-agent
cd /opt/ai-agent
cp .env.production.example .env.docker
nano .env.docker
```

Use the regular compose file plus the GPU override:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

If `APP_DOMAIN` points at the Droplet and `.env.docker` has
`APP_BASE_URL="https://..."`, include the Caddy HTTPS override:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml -f docker-compose.https.yml up -d --build
```

The GPU override keeps up to two requests per loaded model active, keeps two
models loaded when VRAM allows it, enables Flash Attention, and pulls
`phi3:mini`, `nomic-embed-text`, and `llama3.1:8b` for app-specific model
selection.

Verify after startup:

```bash
docker compose ps
docker compose logs -f ollama
docker compose exec ollama ollama ps
```

`ollama ps` should show the active chat model using GPU, not `100% CPU`.

For redeploys:

```bash
cd /opt/ai-agent
git pull
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

For HTTPS deployments, include `docker-compose.https.yml` in the same command.
