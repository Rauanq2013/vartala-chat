const initSqlJs = require('sql.js');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

let db;

// Initialize database
const initDb = async () => {
    const SQL = await initSqlJs();

    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
    }

    const dbPath = path.join(dataDir, 'chitchat.db');

    // Load existing database or create new one
    if (fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    // Create tables
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            email TEXT UNIQUE,
            full_name TEXT,
            password TEXT NOT NULL,
            profile_pic TEXT,
            status TEXT,
            is_admin INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            created_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(created_by) REFERENCES users(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS group_members (
            group_id INTEGER,
            user_id INTEGER,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (group_id, user_id),
            FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER,
            user_id INTEGER,
            type TEXT CHECK(type IN ('text', 'audio', 'video', 'image', 'file', 'location')) NOT NULL,
            content TEXT,
            filename TEXT,
            filesize INTEGER,
            edit_count INTEGER DEFAULT 0,
            edited_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS join_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER,
            user_id INTEGER,
            status TEXT CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(group_id, user_id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS message_reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER,
            user_id INTEGER,
            emoji TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(message_id, user_id, emoji)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS deleted_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER,
            user_id INTEGER,
            deleted_for_all BOOLEAN DEFAULT 0,
            deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS call_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER,
            caller_id INTEGER,
            call_type TEXT CHECK(call_type IN ('audio', 'video')) NOT NULL,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ended_at DATETIME,
            duration INTEGER,
            participants TEXT,
            FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE,
            FOREIGN KEY(caller_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Seed admin user
    const adminCheck = db.exec('SELECT * FROM users WHERE username = "admin"');
    if (adminCheck.length === 0 || adminCheck[0].values.length === 0) {
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        db.run('INSERT INTO users (username, email, full_name, password, is_admin) VALUES (?, ?, ?, ?, ?)',
            ['admin', 'admin@vartala.com', 'System Administrator', hashedPassword, 1]);
        console.log('Admin user created: username=admin, password=admin123');
    }

    // Seed Raunaq user
    const raunaqCheck = db.exec('SELECT * FROM users WHERE username = "Raunaq_Thallam"');
    if (raunaqCheck.length === 0 || raunaqCheck[0].values.length === 0) {
        const hashedPassword = bcrypt.hashSync('Admin2013', 10);
        db.run('INSERT INTO users (username, email, full_name, password, is_admin) VALUES (?, ?, ?, ?, ?)',
            ['Raunaq_Thallam', 'raunaq.thallam@gmail.com', 'Raunaq', hashedPassword, 1]);
        console.log('Raunaq user created: username=Raunaq_Thallam, password=Admin2013');
    }

    // Save database to file
    saveDb();

    return db;
};

// Save database to file (debounced)
let saveTimeout = null;
const saveDb = () => {
    if (!db) return;

    // Clear existing timeout
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }

    // Debounce saves to avoid excessive file writes
    saveTimeout = setTimeout(() => {
        const dataDir = path.join(__dirname, 'data');
        const dbPath = path.join(dataDir, 'chitchat.db');
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
        console.log('Database saved');
    }, 500); // Save after 500ms of inactivity
};

// Save immediately (for shutdown)
const saveDatabaseNow = () => {
    if (!db) return;
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    const dataDir = path.join(__dirname, 'data');
    const dbPath = path.join(dataDir, 'chitchat.db');
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
    console.log('Database saved immediately');
};

// Wrapper functions to match better-sqlite3 API
const prepare = (sql) => {
    return {
        run: (...params) => {
            db.run(sql, params);
            saveDb();
            return { lastInsertRowid: db.exec('SELECT last_insert_rowid()')[0].values[0][0] };
        },
        get: (...params) => {
            const result = db.exec(sql, params);
            if (result.length === 0 || result[0].values.length === 0) return null;
            const columns = result[0].columns;
            const values = result[0].values[0];
            const obj = {};
            columns.forEach((col, i) => obj[col] = values[i]);
            return obj;
        },
        all: (...params) => {
            const result = db.exec(sql, params);
            if (result.length === 0) return [];
            const columns = result[0].columns;
            return result[0].values.map(row => {
                const obj = {};
                columns.forEach((col, i) => obj[col] = row[i]);
                return obj;
            });
        }
    };
};

module.exports = { initDb, prepare, saveDb, saveDatabaseNow };
