#!/bin/bash
# Hardened Mongo entrypoint that always enforces auth, even on existing data volumes.
# It starts mongod without auth briefly to ensure users exist, then restarts with --auth.

set -euo pipefail

DB_PATH="/data/db"
PORT="${MONGO_PORT:-27017}"
LOG_FILE="/var/log/mongod-init.log"

root_user="${MONGO_INITDB_ROOT_USERNAME:-}"
root_pass="${MONGO_INITDB_ROOT_PASSWORD:-}"
app_user="${MONGO_APP_USERNAME:-}"
app_pass="${MONGO_APP_PASSWORD:-}"
app_db="${MONGO_INITDB_DATABASE:-ai-agent}"
mongo_reset_on_start="${MONGO_RESET_ON_START:-false}"
mongo_reset_confirm="${MONGO_RESET_CONFIRM:-}"

if [[ -z "$root_user" || -z "$root_pass" || -z "$app_user" || -z "$app_pass" ]]; then
  echo "Missing required Mongo credentials (root/app). Check .env.docker." >&2
  exit 1
fi

start_noauth() {
  mongod --bind_ip_all \
    --port "$PORT" \
    --dbpath "$DB_PATH" \
    --fork \
    --logpath "$LOG_FILE" \
    --pidfilepath /tmp/mongod.pid \
    --setParameter enableLocalhostAuthBypass=1
}

wait_for_mongo() {
  for _ in {1..30}; do
    if mongosh --quiet --eval "db.runCommand({ ping: 1 })" > /dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  echo "Mongo did not start in time" >&2
  return 1
}

shutdown_mongo() {
  mongosh --quiet --eval "db.adminCommand({ shutdown: 1 })" >/dev/null 2>&1 || true
}

reset_data_if_requested() {
  case "${mongo_reset_on_start,,}" in
    true|1|yes) ;;
    *) return 0 ;;
  esac

  if [[ "$mongo_reset_confirm" != "delete-data" ]]; then
    echo "MONGO_RESET_ON_START is enabled, but MONGO_RESET_CONFIRM is not 'delete-data'." >&2
    echo "Refusing to reset MongoDB data." >&2
    exit 1
  fi

  if [[ "$DB_PATH" != "/data/db" ]]; then
    echo "Refusing to reset unexpected MongoDB path: $DB_PATH" >&2
    exit 1
  fi

  echo "MONGO_RESET_ON_START=true; deleting MongoDB data in $DB_PATH before startup."
  shopt -s dotglob nullglob
  rm -rf "$DB_PATH"/*
  shopt -u dotglob nullglob
}

ensure_users() {
  cat <<'JS' | mongosh --quiet
const env = process.env;
const rootUser = env.MONGO_INITDB_ROOT_USERNAME;
const rootPass = env.MONGO_INITDB_ROOT_PASSWORD;
const appUser = env.MONGO_APP_USERNAME;
const appPass = env.MONGO_APP_PASSWORD;
const appDbName = env.MONGO_INITDB_DATABASE || "ai-agent";

const admin = db.getSiblingDB("admin");
if (!admin.system.users.findOne({user: rootUser})) {
  admin.createUser({user: rootUser, pwd: rootPass, roles: [{role: "root", db: "admin"}]});
  print(`Created root user ${rootUser}`);
} else {
  admin.updateUser(rootUser, {pwd: rootPass});
  print(`Root user ${rootUser} already exists; password updated`);
}

const appDb = db.getSiblingDB(appDbName);
if (!appDb.getUser(appUser)) {
  appDb.createUser({user: appUser, pwd: appPass, roles: [{role: "readWrite", db: appDbName}]});
  print(`Created app user ${appUser} on ${appDbName}`);
} else {
  appDb.updateUser(appUser, {pwd: appPass});
  print(`App user ${appUser} already exists on ${appDbName}; password updated`);
}

const defaultQuestionsCollection = env.MONGODB_DEFAULT_QUESTIONS_COLLECTION || "defaultQuestions";
const chatbotCollection = env.MONGODB_CHATBOT_COLLECTION || "chatbot";
const settingsCollection = env.MONGODB_SETTINGS_COLLECTION || "settings";
const fallbackLocale = env.I18N_FALLBACK_LOCALE || "en";

const deploymentStandardInstruction = [
  "Answer as a professional personal assistant for Jon Doe.",
  "Use the uploaded CVs, resumes, indexed website data, and AI Chat Knowledge Base as the source of truth.",
  "Use the AI Chat Knowledge Base for positioning, tone, preferred wording, IN2TEC, Schlegel, roles, availability, and contact guidance.",
  "Use the CVs and resumes for facts, dates, roles, companies, markets, industries, and achievements.",
  "Answer naturally and professionally. Do not answer with only a bare list unless the user specifically asks for a list.",
  [
    "For most answers:",
    "* Start with one direct sentence.",
    "* Add 2 to 4 useful details.",
    "* Keep the answer concise but complete.",
  ].join("\n"),
  "For background and career questions, answer in reverse chronological order: current roles first, then recent prior roles.",
  "For broad background answers, include the current/latest organization(s) plus the next three distinct prior organizations when relevant.",
  "Mention early-career roles only when directly relevant or explicitly requested.",
  "Position Jon as a hands-on business builder, market-entry specialist, and entrepreneurial operator who connects strategy, sales, operations, leadership, and digital systems.",
  "Do not make Jon sound like a pure consultant, pure software developer, or someone focused only on U.S. market entry.",
  "Do not suggest long-term relocation to the U.S. or China. Jon is based in Germany, open to frequent international travel, and open to temporary project assignments.",
  "Use only the provided context. If the answer is not available, say so briefly and suggest contacting Jon.",
  "When a visitor wants to get in touch, offer the configured contact email/contact section or forward a contact request if visitor details are available.",
].join("\n\n");

const seedDefaults = [
  {
    order: 1,
    translations: {
      en: "Tell me about {{OwnerFirstName}}.",
      de: "Erzähl mir mehr über {{OwnerFirstName}}.",
      it: "Raccontami di {{OwnerFirstName}}.",
    },
  },
  {
    order: 2,
    translations: {
      en: "How can {{OwnerFirstName}} support my company?",
      de: "Wie kann {{OwnerFirstName}} mein Unternehmen unterstützen?",
      it: "Come può supportare la mia azienda, {{OwnerFirstName}}?",
    },
  },
  {
    order: 3,
    translations: {
      en: "Where does {{OwnerFirstName}} have experience?",
      de: "Wo hat {{OwnerFirstName}} Erfahrung?",
      it: "Dove ha esperienza {{OwnerFirstName}}?",
    },
  },
  {
    order: 4,
    translations: {
      en: "What is {{OwnerFirstName}} looking for?",
      de: "Was sucht {{OwnerFirstName}} beruflich?",
      it: "Cosa cerca {{OwnerFirstName}} professionalmente?",
    },
  },
];

const defaultsCol = appDb.getCollection(defaultQuestionsCollection);
const defaultsCount = defaultsCol.estimatedDocumentCount();

if (defaultsCount === 0) {
  defaultsCol.insertMany(
    seedDefaults.map((item) => ({
      ...item,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  );
  print(`Seeded ${seedDefaults.length} default questions into ${defaultQuestionsCollection}`);
} else {
  let migrated = 0;
  defaultsCol
    .find({translations: {$exists: false}, question: {$type: "string"}})
    .forEach((doc) => {
      const translations = {};
      translations[fallbackLocale] = doc.question;
      defaultsCol.updateOne(
        {_id: doc._id},
        {
          $set: {
            translations,
            active: doc.active !== false,
            updatedAt: new Date(),
          },
          $unset: {question: ""},
        }
      );
      migrated += 1;
    });
  print(
    `Default questions collection ${defaultQuestionsCollection} already has ${defaultsCount} documents; migrated ${migrated} to translations format if needed.`
  );
}

// Seed chatbot collection with a single default bot if empty
const chatbotCol = appDb.getCollection(chatbotCollection);
const chatbotCount = chatbotCol.estimatedDocumentCount();
if (chatbotCount === 0) {
  chatbotCol.insertOne({
    _id: ObjectId("6945708d17667ce0fa13e361"),
    name: "Michaela",
    owner_profile: {
      type: "person",
      first_name: "Jon",
      last_name: "Krostewitz",
      company_name: "",
    },
    avatar: "/avatars/Michelle_Intro.mp4",
    primary_color: "#6e26f5",
    secondary_color: "#0e273d",
    button_color: "#6e26f5",
    greeting: [
      {lang: "en", text: "Hi there, I am Michaela!"},
      {lang: "de", text: "Hallo, Michaela hier!"},
      {lang: "it", text: "Ciao, sono Michaela."},
    ],
    starting_message: [
      {
        lang: "en",
        text: "Hi {{FName}}, I am Michaela, the AI assistant for Jon. How can I help today?",
      },
      {
        lang: "de",
        text: "Hallo {{FName}}, ich bin die KI Assistentin von Jon. Wie kann ich dir heute helfen?",
      },
      {lang: "it", text: "Ciao, {{FName}}, come posso aiutarti oggi?"},
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  print(`Seeded default chatbot into ${chatbotCollection}`);
} else {
  print(`Chatbot collection ${chatbotCollection} already has ${chatbotCount} document(s); no seed inserted.`);
}

// Seed settings collection with defaults if empty
const settingsCol = appDb.getCollection(settingsCollection);
const settingsCount = settingsCol.estimatedDocumentCount();
if (settingsCount === 0) {
  settingsCol.insertOne({
    instruction: deploymentStandardInstruction,
    model: env.OLLAMA_MODEL || "phi3:mini",
    temperature: 0.2,
    max_tokens: 2000,
    top_k: 40,
    top_p: 0.9,
    namespace: "",
    retrieval_k: 6,
    registration: {
      enabled: true,
      fields: {
        first_name: {show: true, required: true},
        last_name: {show: true, required: true},
        phone: {show: true, required: false},
        email: {show: true, required: true},
        company: {show: false, required: false},
        address: {show: false, required: false},
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  print(`Seeded default settings into ${settingsCollection}`);
} else {
  print(`Settings collection ${settingsCollection} already has ${settingsCount} document(s); no seed inserted.`);
}
JS
}

reset_data_if_requested
start_noauth
wait_for_mongo
ensure_users
shutdown_mongo

exec mongod --bind_ip_all --port "$PORT" --dbpath "$DB_PATH" --auth
