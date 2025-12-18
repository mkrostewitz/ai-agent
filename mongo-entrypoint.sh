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
JS
}

start_noauth
wait_for_mongo
ensure_users
shutdown_mongo

exec mongod --bind_ip_all --port "$PORT" --dbpath "$DB_PATH" --auth
