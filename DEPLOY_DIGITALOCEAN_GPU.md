# DigitalOcean GPU Deployment

This guide deploys the Dockerized Next.js, MongoDB, and Ollama stack on a
single DigitalOcean GPU Droplet.

## Droplet Selection

Use the GPU Droplet form with these choices:

- Region: choose the region closest to your users where the RTX 4000 plan is available.
- Image: `OS` -> `AI/ML Ready` for NVIDIA. It includes the NVIDIA driver stack and NVIDIA container toolkit. The `Inference Optimized` image also works and includes Docker, but it is vLLM-oriented and not required for this Ollama Compose setup.
- GPU Platform: `NVIDIA`.
- GPU Plan: `RTX 4000 ADA`, `1 GPU`, `20 GB VRAM`, `8 vCPU`, `32 GB RAM`.
- 1-click Models: do not use this for the app. The compose stack pulls Ollama models itself.
- Custom Images: not needed.
- Backups: enable for production, or take regular snapshots and MongoDB dumps.
- Volumes Block Storage: not needed initially; the 500 GB NVMe boot disk is enough for this app and the planned models.
- SSH Key: required. Do not use password SSH for production.

Create a DigitalOcean Cloud Firewall:

- Allow `22/tcp` from your IP address only.
- Allow `80/tcp` and `443/tcp` from anywhere once you add a reverse proxy/domain.
- Temporarily allow `3030/tcp` only for smoke testing if you do not have a reverse proxy yet.
- Do not expose `27017` or `11434`; compose binds MongoDB and Ollama to localhost.

References:

- DigitalOcean GPU image guidance: https://docs.digitalocean.com/products/droplets/getting-started/recommended-gpu-setup/
- Docker Compose GPU support: https://docs.docker.com/compose/how-tos/gpu-support/
- DigitalOcean Cloud Firewalls: https://docs.digitalocean.com/docs/networking/firewalls

## First Server Setup

SSH into the Droplet:

```bash
ssh root@YOUR_DROPLET_IP
```

Verify the GPU:

```bash
nvidia-smi
```

Verify Docker and Compose:

```bash
docker --version
docker compose version
```

If Docker is missing because you chose the AI/ML Ready image, install Docker
Engine from Docker's official instructions, then verify GPU access from Docker:

```bash
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

If Docker is installed but the GPU test fails, configure the NVIDIA runtime and
restart Docker:

```bash
nvidia-ctk runtime configure --runtime=docker
systemctl restart docker
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

Clone the repo:

```bash
git clone YOUR_REPO_URL /opt/ai-agent
cd /opt/ai-agent
```

Create the production env file:

```bash
cp .env.production.example .env.docker
nano .env.docker
```

Replace all `CHANGE_ME` values. Keep this set:

```env
MONGO_RESET_ON_START="false"
OLLAMA_BASE_URL="http://ollama:11434"
OLLAMA_HOST="http://ollama:11434"
```

For automatic conversation map coordinates, create an IPGeolocation.io key in
the dashboard and save it during first-run setup or in the Settings tab.

Keep `MONGO_APP_PASSWORD` as the raw MongoDB password. In `MONGODB_URI`, the
password must be URL-encoded if it contains reserved characters such as `,`,
`:`, `@`, `/`, `?`, `#`, or `%`. For example, a raw password containing `,` must
use `%2C` at that character position inside `MONGODB_URI`.

If the first-run admin form shows this error, the IPGeolocation.io key is not
the problem; `MONGODB_URI` is malformed:

```text
Unable to parse aiagent_app:X with URL
```

Either use a URL-safe app password containing only letters and numbers, or keep
the raw password in `MONGO_APP_PASSWORD` and use the URL-encoded version in
`MONGODB_URI`.

For conversation notification emails, keep a stable encryption key in
`.env.docker`, then configure Apple/iCloud, Gmail, Microsoft, or custom SMTP in
the `/admin` Settings tab. The SMTP password is encrypted before it is stored in
MongoDB.

```env
APP_ENCRYPTION_KEY="CHANGE_ME_LONG_RANDOM_SECRET"
APP_BASE_URL="https://your-agent-domain.com"
APP_DOMAIN="your-agent-domain.com"
```

Start the GPU stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

If a domain points to the Droplet, start the HTTPS stack as well:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml -f docker-compose.https.yml up -d --build
```

The first startup downloads models listed in `docker-compose.gpu.yml`, currently:

```text
phi3:mini
nomic-embed-text
llama3.1:8b
```

This can take several minutes.

## Verification

Check containers:

```bash
docker compose ps
```

Check Ollama startup:

```bash
docker compose logs -f ollama
```

Check the app:

```bash
curl http://localhost:3030
```

After sending one chat message, confirm the model is on GPU:

```bash
docker compose exec ollama ollama ps
```

The `PROCESSOR` column should show GPU usage, not `100% CPU`.

## Production Notes

- Use a reverse proxy such as Caddy, nginx, or a DigitalOcean Load Balancer for HTTPS.
- This repo includes a Caddy override in `docker-compose.https.yml`; set `APP_DOMAIN` in `.env.docker` before using it.
- Do not expose MongoDB or Ollama publicly.
- Use DigitalOcean Spaces for uploaded avatars and files in production.
- Use separate Compose project names and separate Mongo databases if you later host multiple apps on the same GPU Droplet.
- Do not run `docker compose down -v` unless you intentionally want to delete named volumes.

## Redeploy

For a simple manual redeploy:

```bash
cd /opt/ai-agent
git pull
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

For HTTPS deployments:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml -f docker-compose.https.yml up -d --build
```

For continuous deployment, use GitHub Actions to SSH into the Droplet and run
the same commands. Deploy each future app with a unique Compose project name:

```bash
docker compose -p app-a up -d
docker compose -p app-b up -d
docker compose -p inference up -d
```

## GitHub Actions Continuous Deployment

This repo includes `.github/workflows/deploy-gpu-droplet.yml`.

Before enabling it, complete the first manual deployment once so the Droplet has:

- the repository cloned at `/opt/ai-agent`
- a completed `.env.docker`
- Docker, Compose, and NVIDIA GPU access working
- Git access to pull this repository

For a private repository, give the Droplet read access with a GitHub deploy key.
On the Droplet:

```bash
ssh-keygen -t ed25519 -C "ai-agent-droplet-git" -f ~/.ssh/ai-agent_git
cat ~/.ssh/ai-agent_git.pub
```

Add the public key in GitHub under `Settings` -> `Deploy keys` with read access,
then configure the Droplet SSH client to use it for this repo.

On the Droplet, add:

```bash
cat > ~/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/ai-agent_git
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh -T git@github.com || true
```

Create a separate SSH key for GitHub Actions to log into the Droplet:

```bash
ssh-keygen -t ed25519 -C "github-actions-ai-agent" -f github-actions-ai-agent
```

Add the public key to the Droplet:

```bash
cat github-actions-ai-agent.pub | ssh root@YOUR_DROPLET_IP 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys'
```

Add these GitHub repository secrets:

```text
DROPLET_HOST          your Droplet IP or hostname
DROPLET_SSH_KEY       private key contents from github-actions-ai-agent
DROPLET_USER          root, or your deploy user
DROPLET_PORT          22, if omitted the workflow uses 22
DEPLOY_PATH           /opt/ai-agent, if omitted the workflow uses /opt/ai-agent
DROPLET_KNOWN_HOSTS   optional but recommended output of ssh-keyscan YOUR_DROPLET_IP
```

After that, every push to `main` runs `npm run build` in GitHub Actions and,
if successful, SSHes into the Droplet and runs:

```bash
git pull --ff-only origin main
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

## Reset MongoDB Intentionally

MongoDB data is preserved by default.

To intentionally wipe MongoDB and reseed defaults, edit `.env.docker`:

```env
MONGO_RESET_ON_START="true"
MONGO_RESET_CONFIRM="delete-data"
```

Then recreate Mongo:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --force-recreate mongo
```

After the reset, immediately set `MONGO_RESET_ON_START="false"` again.
