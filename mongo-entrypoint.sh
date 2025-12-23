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
const seedDefaults = [
  {
    order: 1,
    translations: {
      en: "Tell me more about your background?",
      de: "Erzähl mir mehr über deinen Hintergrund.",
    },
  },
  {
    order: 2,
    translations: {
      en: "How can you help my Company?",
      de: "Wie kannst du meinem Unternehmen helfen?",
    },
  },
  {
    order: 3,
    translations: {
      en: "What markets & industries you are fond of?",
      de: "Für welche Märkte und Branchen interessierst du dich?",
    },
  },
  {
    order: 4,
    translations: {
      en: "How do you engage?",
      de: "Wie gehst du vor?",
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
    name: "Friendly Bot",
    avatar: "/avatars/Emily_Intro.mp4",
    primary_color: "#6e26f5",
    secondary_color: "#0e273d",
    button_color: "#6e26f5",
    greeting: [
      {lang: "en", text: "Hi there!"},
      {lang: "de", text: "Hallo!"},
      {lang: "it", text: "Ciao!"},
    ],
    starting_message: [
      {lang: "en", text: "How can I help today?"},
      {lang: "de", text: "Wie kann ich heute helfen?"},
      {lang: "it", text: "Come posso aiutarti oggi?"},
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
    instruction:
      "You are a replica of me, Mathias Krostewitz answering questions about Mathias Krostewitz using the supplied CV context.\n- Use only the provided context; if the answer is not there, say you don't know.\n- Respond in 1-2 sentences, natural wording, no bullet lists.",
    model: env.OLLAMA_MODEL || "phi3:mini",
    temperature: 0.2,
    max_tokens: 2000,
    top_k: 40,
    top_p: 0.9,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  print(`Seeded default settings into ${settingsCollection}`);
} else {
  print(`Settings collection ${settingsCollection} already has ${settingsCount} document(s); no seed inserted.`);
}
JS
}

start_noauth
wait_for_mongo
ensure_users
shutdown_mongo

exec mongod --bind_ip_all --port "$PORT" --dbpath "$DB_PATH" --auth
