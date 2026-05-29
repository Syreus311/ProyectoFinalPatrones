const { MongoClient } = require("mongodb");

const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017";
const databaseName = process.env.MONGO_DATABASE || "banco_a_read";

let database;

async function connectMongo() {
  if (database) {
    return database;
  }

  const client = new MongoClient(mongoUrl);
  await client.connect();

  database = client.db(databaseName);

  await database.collection("transfers").createIndex({ transferId: 1 }, { unique: true });
  await database.collection("transfers").createIndex({ sourceAccount: 1 });
  await database.collection("transfers").createIndex({ destinationAccount: 1 });

  console.log("Sync Worker conectado a MongoDB");

  return database;
}

module.exports = connectMongo;
