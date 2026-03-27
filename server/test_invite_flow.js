const API_URL = 'http://localhost:3001/api';

async function request(url, method = 'GET', body = null, token = null) {
    const headers = {
        'Content-Type': 'application/json'
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const options = {
        method,
        headers,
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    const data = await res.json();

    if (!res.ok) {
        const error = new Error(data.error || 'Request failed');
        error.response = { data };
        throw error;
    }

    return { data, status: res.status };
}

async function runTest() {
    try {
        console.log('--- Starting Private Group Invite Flow Test (using fetch) ---');

        // 1. Register & Login User A (Owner)
        const userA = {
            username: `owner_${Date.now()}`,
            email: `owner_${Date.now()}@test.com`,
            password: 'password123',
            fullName: 'Owner User'
        };

        console.log('1. Registering User A...');
        await request(`${API_URL}/auth/signup`, 'POST', userA);
        const loginResA = await request(`${API_URL}/auth/login`, 'POST', { username: userA.username, password: userA.password });
        const tokenA = loginResA.data.token;
        console.log('   User A logged in.');

        // 2. Create Group
        console.log('2. User A creating group...');
        const groupName = `Test Group ${Date.now()}`;
        const groupRes = await request(`${API_URL}/groups`, 'POST', { name: groupName }, tokenA);
        const groupId = groupRes.data.id;
        const inviteCode = groupRes.data.invite_code;
        console.log(`   Group created: ${groupName}, ID: ${groupId}, Invite Code: ${inviteCode}`);

        // 3. Register & Login User B (Joiner)
        const userB = {
            username: `joiner_${Date.now()}`,
            email: `joiner_${Date.now()}@test.com`,
            password: 'password123',
            fullName: 'Joiner User'
        };

        console.log('3. Registering User B...');
        await request(`${API_URL}/auth/signup`, 'POST', userB);
        const loginResB = await request(`${API_URL}/auth/login`, 'POST', { username: userB.username, password: userB.password });
        const tokenB = loginResB.data.token;
        console.log('   User B logged in.');

        // 4. User B joins via Invite Code
        console.log('4. User B joining via invite code...');
        const joinRes = await request(`${API_URL}/groups/join/${inviteCode}`, 'POST', {}, tokenB);
        console.log(`   Join response status: ${joinRes.data.status}`);

        if (joinRes.data.status !== 'pending') {
            throw new Error(`Expected status 'pending', got '${joinRes.data.status}'`);
        }

        // 5. User A checks pending requests
        console.log('5. User A checking pending requests...');
        const requestsRes = await request(`${API_URL}/groups/requests/pending`, 'GET', null, tokenA);
        const requestItem = requestsRes.data.find(r => r.group_id === groupId && r.username === userB.username);

        if (!requestItem) {
            throw new Error('Pending request not found for User B');
        }
        console.log(`   Found pending request ID: ${requestItem.id}`);

        // 6. User A approves request
        console.log('6. User A approving request...');
        await request(`${API_URL}/groups/requests/${requestItem.id}/approve`, 'POST', {}, tokenA);
        console.log('   Request approved.');

        // 7. User B checks status (by trying to join again or checking status)
        console.log('7. User B verifying membership...');
        const statusRes = await request(`${API_URL}/groups/${groupId}/request-status`, 'GET', null, tokenB);
        console.log(`   User B status: ${statusRes.data.status}`);

        if (statusRes.data.status !== 'member') {
            throw new Error(`Expected status 'member', got '${statusRes.data.status}'`);
        }

        console.log('--- TEST PASSED: Private Group Invite Flow works correctly! ---');

    } catch (err) {
        console.error('--- TEST FAILED ---');
        console.error(err.message);
        if (err.response) {
            console.error('Response data:', err.response.data);
        }
    }
}

runTest();
