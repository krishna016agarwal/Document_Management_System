// backend/db.js
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME;

if (!uri) {
    throw new Error('MONGODB_URI not found in .env file. Please define it.');
}
if (!dbName) {
    console.warn('DB_NAME not found in .env file. Using default from MONGODB_URI or "test".');
}

const client = new MongoClient(uri);
let db;

async function connectDB() {
    if (db) return db;
    try {
        await client.connect();
        console.log("Successfully connected to MongoDB.");
        db = client.db(dbName);

        // Create indexes (example: for text search on document content)
        // This should be done once. For a real app, manage this more carefully.
        const itemsCollection = db.collection('items');
    await itemsCollection.createIndex({ name: "text", content: "text" });
    await itemsCollection.createIndex({ parentId: 1 });
    await itemsCollection.createIndex({ type: 1 });

    const revisionsCollection = db.collection('documentRevisions'); // New
    await revisionsCollection.createIndex({ documentId: 1, version: -1 }); // To quickly get latest revisions
    await revisionsCollection.createIndex({ documentId: 1, savedAt: -1 });

    return db;
    } catch (err) {
        console.error("Failed to connect to MongoDB", err);
        process.exit(1); // Exit if DB connection fails
    }
}

function getDB() {
    if (!db) {
        throw new Error("Database not initialized. Call connectDB first.");
    }
    return db;
}

module.exports = { connectDB, getDB, ObjectId };