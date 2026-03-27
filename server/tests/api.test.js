const request = require('supertest');
const express = require('express');
const bcrypt = require('bcrypt');
const { initDb, prepare } = require('../database');

// Mock the database module
jest.mock('../database', () => {
    const mockDb = {
        users: [],
        groups: [],
        messages: []
    };

    return {
        initDb: jest.fn(() => Promise.resolve()),
        prepare: jest.fn((sql) => ({
            run: jest.fn((...params) => {
                if (sql.includes('INSERT INTO users')) {
                    const id = mockDb.users.length + 1;
                    mockDb.users.push({ id, ...params });
                    return { lastInsertRowid: id };
                }
                if (sql.includes('INSERT INTO groups')) {
                    const id = mockDb.groups.length + 1;
                    mockDb.groups.push({ id, name: params[0], created_by: params[1] });
                    return { lastInsertRowid: id };
                }
                return { lastInsertRowid: 1 };
            }),
            get: jest.fn((...params) => {
                if (sql.includes('SELECT * FROM users WHERE username')) {
                    return mockDb.users.find(u => u[0] === params[0]);
                }
                return null;
            }),
            all: jest.fn(() => mockDb.groups)
        })),
        saveDb: jest.fn(),
        saveDatabaseNow: jest.fn()
    };
});

describe('Vartala API Tests', () => {
    let app;
    let authRoutes;
    let groupsRoutes;

    beforeAll(async () => {
        // Initialize test app
        app = express();
        app.use(express.json());

        authRoutes = require('../auth');
        groupsRoutes = require('../groups');

        app.use('/api/auth', authRoutes);
        app.use('/api/groups', groupsRoutes);
    });

    describe('Authentication', () => {
        test('POST /api/auth/signup - should create a new user', async () => {
            const response = await request(app)
                .post('/api/auth/signup')
                .send({
                    username: 'testuser',
                    email: 'test@example.com',
                    full_name: 'Test User',
                    password: 'password123'
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('token');
            expect(response.body.user).toHaveProperty('username', 'testuser');
        });

        test('POST /api/auth/login - should login existing user', async () => {
            // First create a user
            const hashedPassword = await bcrypt.hash('password123', 10);
            prepare('INSERT INTO users').run('testuser', 'test@example.com', 'Test User', hashedPassword, 0);

            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    username: 'testuser',
                    password: 'password123'
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('token');
        });
    });

    describe('Groups', () => {
        let authToken;

        beforeEach(async () => {
            // Create and login a test user to get auth token
            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send({
                    username: 'testuser',
                    password: 'password123'
                });
            authToken = loginResponse.body.token;
        });

        test('GET /api/groups - should return all groups', async () => {
            const response = await request(app)
                .get('/api/groups')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        test('POST /api/groups - should create a new group', async () => {
            const response = await request(app)
                .post('/api/groups')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ name: 'Test Group' });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('name', 'Test Group');
        });
    });
});
