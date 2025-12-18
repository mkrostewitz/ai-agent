// Create an application user for MongoDB during container init.
// This script runs only on first startup when the data volume is empty.

const appDbName = process.env.MONGO_INITDB_DATABASE || "ai-agent";
const username = process.env.MONGO_APP_USERNAME;
const password = process.env.MONGO_APP_PASSWORD;

if (!username || !password) {
  throw new Error("Missing MONGO_APP_USERNAME or MONGO_APP_PASSWORD for Mongo init");
}

const appDb = db.getSiblingDB(appDbName); // `db` comes from the Mongo shell context.
const existingUser = appDb.getUser(username);

if (existingUser) {
  print(`Mongo init: user ${username} already exists in ${appDbName}, skipping creation.`);
} else {
  appDb.createUser({
    user: username,
    pwd: password,
    roles: [{role: "readWrite", db: appDbName}],
  });
  print(`Mongo init: created user ${username} with readWrite on ${appDbName}.`);
}
