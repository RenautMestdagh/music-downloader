// config/database.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const paths = require('./paths');
const logger = require('../utils/logger');

const DB_PATH = paths.dbPath;
const DB_DIR = path.dirname(DB_PATH);

// Ensure directory exists
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, {
        recursive: true,
        mode: process.env.NODE_ENV === 'production' ? 0o750 : 0o777
    });
}

let db;
try {
    db = new Database(DB_PATH);
    logger.info(`Connected to SQLite database at ${DB_PATH}`);

    // Enable foreign key constraints and better performance
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
} catch (err) {
    logger.error('Database connection error:', err.message);
}

// Initialize database schema
try {
    // Create playlists table
    db.exec(`
        CREATE TABLE IF NOT EXISTS playlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            yt_id TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
} catch (err) {
    logger.error('Database initialization error:', err.message);
}

// Database helper functions wrapped as promises for backwards compatibility
const dbQuery = async (sql, params = []) => {
    try {
        const stmt = db.prepare(sql);
        // Ensure params is an array
        const args = Array.isArray(params) ? params : [params];
        return stmt.all(...args);
    } catch (err) {
        throw err;
    }
};

const dbGet = async (sql, params = []) => {
    try {
        const stmt = db.prepare(sql);
        const args = Array.isArray(params) ? params : [params];
        return stmt.get(...args);
    } catch (err) {
        throw err;
    }
};

const dbRun = async (sql, params = []) => {
    try {
        const stmt = db.prepare(sql);
        const args = Array.isArray(params) ? params : [params];
        const result = stmt.run(...args);
        return { id: result.lastInsertRowid, changes: result.changes };
    } catch (err) {
        throw err;
    }
};

module.exports = {
    db,
    dbQuery,
    dbGet,
    dbRun,
    DB_PATH
};