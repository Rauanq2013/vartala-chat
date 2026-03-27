const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Helper: run any query
const query = async (sql, params = []) => {
    const client = await pool.connect();
    try {
        const result = await client.query(sql, params);
        return result;
    } finally {
        client.release();
    }
};

// Helper: get first row or null
const getRow = async (sql, params = []) => {
    const result = await query(sql, params);
    return result.rows[0] || null;
};

// Helper: get all rows
const getAllRows = async (sql, params = []) => {
    const result = await query(sql, params);
    return result.rows;
};

// Helper: run INSERT/UPDATE/DELETE — returns { lastInsertRowid, rowCount }
const run = async (sql, params = []) => {
    const result = await query(sql, params);
    return {
        lastInsertRowid: result.rows[0]?.id ?? null,
        rowCount: result.rowCount
    };
};

const initDb = async () => {
    await query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE,
            email TEXT UNIQUE,
            full_name TEXT,
            password TEXT NOT NULL,
            profile_pic TEXT,
            status TEXT,
            is_admin SMALLINT DEFAULT 0,
            last_seen_at TIMESTAMP,
            is_online BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS groups (
            id SERIAL PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            created_by INTEGER REFERENCES users(id),
            invite_code TEXT UNIQUE,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS group_members (
            group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            joined_at TIMESTAMP DEFAULT NOW(),
            PRIMARY KEY (group_id, user_id)
        )
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id),
            type TEXT CHECK(type IN ('text', 'audio', 'video', 'image', 'file', 'location')) NOT NULL,
            content TEXT,
            filename TEXT,
            filesize INTEGER,
            edit_count INTEGER DEFAULT 0,
            edited_at TIMESTAMP,
            reply_to_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
            forwarded BOOLEAN DEFAULT FALSE,
            disappear_after INTEGER,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS join_requests (
            id SERIAL PRIMARY KEY,
            group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            status TEXT CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(group_id, user_id)
        )
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS message_reactions (
            id SERIAL PRIMARY KEY,
            message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            emoji TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(message_id, user_id, emoji)
        )
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS deleted_messages (
            id SERIAL PRIMARY KEY,
            message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            deleted_for_all BOOLEAN DEFAULT FALSE,
            deleted_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS call_history (
            id SERIAL PRIMARY KEY,
            group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
            caller_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            call_type TEXT CHECK(call_type IN ('audio', 'video')) NOT NULL,
            started_at TIMESTAMP DEFAULT NOW(),
            ended_at TIMESTAMP,
            duration INTEGER,
            participants TEXT
        )
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS message_read_status (
            message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            read_at TIMESTAMP DEFAULT NOW(),
            PRIMARY KEY (message_id, user_id)
        )
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS pinned_messages (
            id SERIAL PRIMARY KEY,
            group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
            message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
            pinned_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
            pinned_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS status_updates (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            type TEXT CHECK(type IN ('text', 'image', 'video')) NOT NULL,
            content TEXT,
            expires_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS user_group_settings (
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
            last_read_message_id INTEGER,
            muted BOOLEAN DEFAULT FALSE,
            PRIMARY KEY (user_id, group_id)
        )
    `);

    // Seed admin user
    const adminCheck = await getRow('SELECT id FROM users WHERE username = $1', ['admin']);
    if (!adminCheck) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await query(
            'INSERT INTO users (username, email, full_name, password, is_admin) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
            ['admin', 'admin@vartala.com', 'System Administrator', hashedPassword, 1]
        );
        console.log('Admin user created: username=admin, password=admin123');
    }

    // Seed Raunaq user
    const raunaqCheck = await getRow('SELECT id FROM users WHERE username = $1', ['Raunaq_Thallam']);
    if (!raunaqCheck) {
        const hashedPassword = await bcrypt.hash('Admin2013', 10);
        await query(
            'INSERT INTO users (username, email, full_name, password, is_admin) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
            ['Raunaq_Thallam', 'raunaq.thallam@gmail.com', 'Raunaq', hashedPassword, 1]
        );
        console.log('Raunaq user created');
    }

    console.log('Database initialized successfully');
};

// No-ops for compatibility (PostgreSQL doesn't need manual save)
const saveDb = () => {};
const saveDatabaseNow = () => {};

module.exports = { query, getRow, getAllRows, run, initDb, saveDb, saveDatabaseNow };
