# Ilysa AI Agent

Ilysa is a single-agent chat widget and admin console built with Next.js,
MongoDB, and Ollama. It can run locally for development, be embedded into other
websites as a small script, and be deployed on GPU-backed infrastructure for
faster local-model inference.

## Features

- Embeddable chat widget with launcher and inline modes.
- Standalone `/chat` page for testing the agent without embedding it elsewhere.
- Admin console for the agent profile, colors, bundled or uploaded avatars,
  localized greetings, starter prompts, model settings, and registration fields.
- Retrieval-augmented knowledge from uploaded PDFs and indexed website content.
- Conversation tracking with visitor details, notes, status, action history,
  request metadata, and optional location enrichment.
- Optional SMTP notifications for new conversations, with SMTP passwords stored
  encrypted in MongoDB.
- Optional IPGeolocation.io and Mapbox integrations for location metadata,
  address support, and conversation maps.
- Local filesystem uploads by default, with DigitalOcean Spaces support for
  production avatars and PDF originals.
- Docker Compose setups for local development, production, HTTPS, and GPU
  Ollama deployments.

## Screenshots

<img src="./docs/screenshots/standalone-chat.png" alt="Standalone chat interface" width="100%">

The standalone chat view is useful for validating the agent, prompts, starter
questions, avatars, and streaming responses before embedding the widget.

<img src="./docs/screenshots/admin-sign-in.png" alt="Admin sign-in screen" width="100%">

The admin area is protected. After first-run setup, use it to manage the agent,
knowledge sources, integrations, and stored conversations.

<img src="./docs/screenshots/admin-agent-settings.png" alt="Admin agent settings panel" width="100%">

The Agent settings panel controls the system prompt, model runtime parameters,
retrieval behavior, and visitor registration fields.

<img src="./docs/screenshots/admin-system-settings.png" alt="Admin system settings and integrations" width="100%">

The Settings tab manages theme colors, location integrations, map support, and
email delivery.

## Tech Stack

- Next.js 14 and React 18
- MongoDB for app data, conversations, admin configuration, and vector chunks
- Ollama for local chat and embedding models
- LangChain for PDF/web document loading and vector storage
- Nodemailer for optional conversation notification emails
- Docker Compose for local and production orchestration

## Local Installation

Docker Compose is the recommended local path because it starts MongoDB and
Ollama with the app and seeds default chatbot/settings documents.

### 1. Prerequisites

- Git
- Docker Desktop or Docker Engine with Docker Compose
- A few minutes for the first Ollama model download

No local GPU is required for development. CPU inference works, but responses are
slower than on a GPU host.

### 2. Clone The Repository

```bash
git clone YOUR_REPO_URL ai-agent
cd ai-agent
```

### 3. Create The Local Docker Environment

Copy the production example and edit it for local development:

```bash
cp .env.production.example .env.docker
```

Use simple alphanumeric MongoDB passwords for local setup, or URL-encode the
password inside `MONGODB_URI` if it contains reserved URL characters.

Minimum local values:

```env
MONGO_INITDB_ROOT_USERNAME="aiagent_root"
MONGO_INITDB_ROOT_PASSWORD="localrootpassword"
MONGO_INITDB_DATABASE="ai-agent"
MONGO_APP_USERNAME="aiagent_app"
MONGO_APP_PASSWORD="localapppassword"
MONGO_RESET_ON_START="false"

MONGODB_URI="mongodb://aiagent_app:localapppassword@mongo:27017/ai-agent?authSource=ai-agent"
MONGODB_DB="ai-agent"
MONGODB_INDEX="vector_index"
MONGODB_DEFAULT_EMBEDDING_COLLECTION="embeddings"
MONGODB_DEFAULT_QUESTIONS_COLLECTION="defaultQuestions"
MONGODB_CHATBOT_COLLECTION="chatbot"
MONGODB_SETTINGS_COLLECTION="settings"
MONGODB_CONVERSATIONS_COLLECTION="conversations"
I18N_FALLBACK_LOCALE="en"

APP_ENCRYPTION_KEY="local-development-encryption-secret-change-me"
APP_BASE_URL="http://localhost:3030"
APP_DOMAIN="localhost"

OLLAMA_BASE_URL="http://ollama:11434"
OLLAMA_HOST="http://ollama:11434"
OLLAMA_MODEL="phi3:mini"
RAG_TOP_K="6"

FILE_STORAGE_DRIVER="local"
```

Optional production storage values such as `DIGITALOCEAN_SPACES_*` can stay
unset when `FILE_STORAGE_DRIVER="local"`.

### 4. Start The Local Stack

```bash
docker compose -f docker-compose.dev.yml up --build
```

The first run pulls the default Ollama models, currently `phi3:mini` and
`nomic-embed-text`. When the server is ready, open:

```text
http://localhost:3030/admin
```

### 5. Complete First-Run Setup

The first visit to `/admin` shows setup if no admin user exists. Create the
first admin account. IPGeolocation.io and Mapbox tokens are optional and can be
added later in Settings.

After setup, use:

- `/admin` for the protected dashboard.
- `/chat` for the standalone chat page.
- `/widget-demo.html` for the protected widget preview and embed snippet.

### 6. Stop The Local Stack

```bash
docker compose -f docker-compose.dev.yml down
```

Do not add `-v` unless you intentionally want to delete MongoDB and Ollama
volumes.

## Manual Local Setup

Use this path only if you already run MongoDB and Ollama locally.

1. Install Node 18+.
2. Start MongoDB.
3. Start Ollama and pull the required models:

```bash
ollama pull phi3:mini
ollama pull nomic-embed-text
```

4. Create `.env.local`:

```env
MONGODB_URI="mongodb://localhost:27017/ai-agent"
MONGODB_DB="ai-agent"
MONGODB_INDEX="vector_index"
MONGODB_DEFAULT_EMBEDDING_COLLECTION="embeddings"

OLLAMA_BASE_URL="http://localhost:11434"
OLLAMA_MODEL="phi3:mini"
RAG_TOP_K="6"

APP_ENCRYPTION_KEY="local-development-encryption-secret-change-me"
APP_BASE_URL="http://localhost:3030"
FILE_STORAGE_DRIVER="local"
```

5. Install dependencies and start the app:

```bash
npm install
npm run dev
```

6. Open `http://localhost:3030/admin` and complete setup.

On a completely empty manual MongoDB database, sign in and save the Agent and
Settings pages once so the public widget has initial chatbot/settings documents.
The Docker setup does this seeding automatically.

## Admin Workflow

The admin dashboard has four main sections:

- Agent: profile name, avatar, colors, localized greetings, starter messages,
  default prompts, registration fields, model settings, and embed snippet.
- Settings: system integrations, IPGeolocation.io key, Mapbox token, and mail
  delivery settings.
- Knowledge: upload PDFs, index website URLs, assign namespaces, refresh
  sources, and delete indexed sources.
- Conversations: review conversations, update status, add notes/actions, inspect
  visitor metadata, and view coordinates on a map when available.

The first-run setup stores the admin password as a hash, generates a server-side
session secret, and stores optional integration keys in MongoDB.

## Admin Settings

The admin UI separates day-to-day agent behavior from system integrations.

### Agent Settings

The Agent tab starts with the model and prompt controls:

- Instructions: the system prompt sent to the model. Use this to define tone,
  source-of-truth rules, answer style, and business-specific constraints.
- Model: the Ollama chat model used for responses. The default is `phi3:mini`;
  production GPU deployments can also pull and select larger models such as
  `llama3.1:8b`.
- Namespace: limits retrieval to one indexed knowledge namespace. Leave it as
  `All namespaces` when the agent should search every uploaded PDF and website
  source.
- Retrieval K: number of knowledge chunks considered for each answer.
- Temperature: controls response variability. Lower values are more stable;
  higher values are more creative.
- Top P and Top K: sampling controls for narrowing or widening candidate tokens.
- Max tokens: upper bound for generated answer length.
- Visitor registration: controls whether the widget asks for visitor details
  before chat and which fields are shown or required.

<img src="./docs/screenshots/admin-agent-settings.png" alt="Admin agent settings panel" width="100%">

### System Settings

The Settings tab covers integrations and operational settings:

- Theme Colors: controls the widget's primary, secondary, and button colors.
- IPGeolocation.io: optional server-side API key for enriching conversations
  with city, country, ASN, timezone, currency, latitude, and longitude.
- Mapbox: optional public token for address support and conversation maps.
- Email delivery: SMTP configuration for new conversation notifications. It
  supports Apple/iCloud, Gmail, Microsoft 365/Outlook, custom SMTP, or disabled
  mode.

<img src="./docs/screenshots/admin-system-settings.png" alt="Admin system settings and integrations" width="100%">

Email passwords are encrypted before they are stored in MongoDB. Use provider
app passwords where required, not a normal account password. The Send test
button verifies the current settings before you rely on production
notifications.

<img src="./docs/screenshots/admin-email-settings.png" alt="Admin email delivery settings" width="100%">

## Embedding The Widget

The admin dashboard can generate the embed snippet for you. The simplest
launcher snippet looks like this:

```html
<script async src="https://your-agent-domain.com/scripts/chat-widget.js"></script>
```

For an inline widget:

```html
<div id="agent-chat-widget"></div>
<script
  async
  src="https://your-agent-domain.com/scripts/chat-widget.js"
  data-mode="embedded"
  data-mount="#agent-chat-widget"
></script>
```

Useful attributes:

- `data-lang="en"` forces a language. If omitted, the widget uses the browser
  language when supported.
- `data-mode="embedded"` renders inline instead of as a bottom-corner launcher.
- `data-mount="#agent-chat-widget"` controls where inline mode mounts.

Public widget assets and APIs include `/scripts/chat-widget.js`,
`/styles/chat-widget.css`, `/api/agents/details`,
`/api/agents/chat/stream`, and the conversation persistence routes.

## Optional Integrations

### IPGeolocation.io

Add an IPGeolocation.io API key during setup or in Settings to enrich
conversations with country, city, ASN, timezone, currency, latitude, and
longitude when available.

### Mapbox

Add a public Mapbox token for address support and the admin conversation map.
The token is stored server-side in MongoDB and exposed only where the widget or
admin map needs it.

### Mail Notifications

Set a stable `APP_ENCRYPTION_KEY`, then configure Apple/iCloud, Gmail,
Microsoft 365/Outlook, or custom SMTP from the Settings page. SMTP passwords are
encrypted before they are stored in MongoDB.

Environment variables such as `MAIL_PROVIDER`, `SMTP_USER`, `SMTP_PASS`,
`MAIL_FROM`, and `MAIL_TO` still work as fallback defaults, but the intended
production path is encrypted storage through `/admin`.

### File Storage

Use local storage for development:

```env
FILE_STORAGE_DRIVER="local"
```

For production, DigitalOcean Spaces is supported:

```env
FILE_STORAGE_DRIVER="digitalocean-spaces"
DIGITALOCEAN_SPACES_REGION="fra1"
DIGITALOCEAN_SPACES_BUCKET="your-space-name"
DIGITALOCEAN_SPACES_KEY="your-access-key"
DIGITALOCEAN_SPACES_SECRET="your-secret-key"
DIGITALOCEAN_SPACES_ENDPOINT="https://fra1.digitaloceanspaces.com"
DIGITALOCEAN_SPACES_PUBLIC_URL="https://your-space-name.fra1.digitaloceanspaces.com"
```

With local storage, public avatars are stored under `public/uploads/avatars` and
private PDF originals under `storage/uploads/documents`.

## Hosted GPU Option

I also provide a managed hosting option on my own GPU-backed environment. This
is intended for people who want the agent running without managing Docker,
Ollama, model downloads, MongoDB, HTTPS, backups, or updates themselves.

Reach out to me directly with questions, local setup issues, or to discuss a
hosted GPU setup.

## Self-Hosted GPU Deployment

For a self-managed production deployment on a DigitalOcean GPU Droplet, use:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

If `APP_DOMAIN` points at the server and `APP_BASE_URL` uses HTTPS, include the
Caddy override:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml -f docker-compose.https.yml up -d --build
```

The GPU override enables NVIDIA GPU reservations for Ollama, Flash Attention,
and pulls `phi3:mini`, `nomic-embed-text`, and `llama3.1:8b`.

Detailed production steps are in
[DEPLOY_DIGITALOCEAN_GPU.md](./DEPLOY_DIGITALOCEAN_GPU.md).

## Development Commands

```bash
npm run dev      # Next.js dev server on port 3030
npm run build    # Production build
npm run start    # Production server on port 3030
```

## Key Routes

- `GET /api/agents/details`: load public chatbot profile and widget settings.
- `POST /api/agents/chat/stream`: stream Ollama responses as SSE.
- `POST /api/agents/conversations/create`: create a stored conversation.
- `PUT /api/agents/conversations/update`: append messages and metadata.
- `GET /api/agents/conversations/details`: load a stored conversation.
- `POST /api/embed/pdf`: embed uploaded PDF content.
- `POST /api/embed/url`: embed website content.
- `GET|POST /api/admin/setup`: first-run setup state and creation.
- `GET|PUT /api/admin/agent`: admin agent profile.
- `GET|PUT /api/admin/settings`: admin model and registration settings.
- `GET|PUT /api/admin/system`: admin integration settings.
- `GET /api/admin/conversations`: admin conversation list.

Protected routes include `/admin`, `/api/admin/*`, `/api/embed/*`, and
`/widget-demo.html`.

## Troubleshooting

- `Invalid MONGODB_URI`: URL-encode the MongoDB password inside `MONGODB_URI`,
  or use simple alphanumeric passwords locally.
- Setup says MongoDB is unavailable: check `.env.docker`, then run
  `docker compose -f docker-compose.dev.yml logs mongo`.
- First startup is slow: Ollama is downloading models into its Docker volume.
- Widget says no chatbot document exists: on manual MongoDB setup, save the
  Agent page once in `/admin`, or use the Docker setup that seeds defaults.
- GPU deployment still uses CPU: run
  `docker compose exec ollama ollama ps` and verify the model processor is GPU.
