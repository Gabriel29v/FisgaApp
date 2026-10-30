const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createCommunityStore } = require('./community');
const { createServer } = require('./server');

test('community API supports authenticated profiles, catches, ranking, direct and group chat', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fisga-community-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const server = createServer({
    communityStore: createCommunityStore(path.join(directory, 'community.json'))
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const request = async (endpoint, { token, ...options } = {}) => {
    const headers = { ...options.headers };
    if (options.body) headers['Content-Type'] = 'application/json';
    if (token) headers.Cookie = `fisga_session=${token}`;
    const response = await fetch(`${baseUrl}${endpoint}`, { ...options, headers });
    const payload = await response.json();
    return { response, payload };
  };
  const register = async (name, email) => {
    const { response, payload } = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password: 'senha-segura-123' })
    });
    assert.equal(response.status, 201);
    const token = response.headers.get('set-cookie').match(/^fisga_session=([^;]+)/)[1];
    return { user: payload.user, token: decodeURIComponent(token) };
  };

  const alice = await register('Ana Pescadora', 'ana@example.com');
  const bob = await register('Bruno Pescador', 'bruno@example.com');

  const unauthenticated = await request('/api/community/fishers');
  assert.equal(unauthenticated.response.status, 401);

  const catchResponse = await request('/api/community/catches', {
    token: bob.token,
    method: 'POST',
    body: JSON.stringify({
      species: 'Robalo',
      weight: 6.2,
      length: 84,
      location: 'Recife',
      imagePath: '550e8400-e29b-41d4-a716-446655440000/550e8400-e29b-41d4-a716-446655440001.jpg'
    })
  });
  assert.equal(catchResponse.response.status, 201);
  assert.equal(catchResponse.payload.data.imagePath, '550e8400-e29b-41d4-a716-446655440000/550e8400-e29b-41d4-a716-446655440001.jpg');

  const ranking = await request('/api/community/leaderboard?minWeight=5&minLength=80', { token: alice.token });
  assert.equal(ranking.response.status, 200);
  assert.equal(ranking.payload.data[0].fisher.name, 'Bruno Pescador');

  const profile = await request(`/api/community/fishers/${bob.user.id}/catches`, { token: alice.token });
  assert.equal(profile.payload.data[0].species, 'Robalo');
  assert.equal(profile.payload.data[0].imagePath, catchResponse.payload.data.imagePath);

  const invalidPhotoPath = await request('/api/community/catches', {
    token: bob.token,
    method: 'POST',
    body: JSON.stringify({
      species: 'Cioba',
      weight: 2,
      length: 50,
      imagePath: '../foto.jpg'
    })
  });
  assert.equal(invalidPhotoPath.response.status, 400);

  const direct = await request('/api/community/conversations', {
    token: alice.token,
    method: 'POST',
    body: JSON.stringify({ type: 'direct', memberIds: [bob.user.id] })
  });
  const directAgain = await request('/api/community/conversations', {
    token: alice.token,
    method: 'POST',
    body: JSON.stringify({ type: 'direct', memberIds: [bob.user.id] })
  });
  assert.equal(direct.payload.data.id, directAgain.payload.data.id);

  const sent = await request(`/api/community/conversations/${direct.payload.data.id}/messages`, {
    token: alice.token,
    method: 'POST',
    body: JSON.stringify({ text: 'Boa pescaria!' })
  });
  assert.equal(sent.payload.data.text, 'Boa pescaria!');
  const received = await request(`/api/community/conversations/${direct.payload.data.id}/messages`, { token: bob.token });
  assert.equal(received.payload.data[0].sender.name, 'Ana Pescadora');

  const group = await request('/api/community/conversations', {
    token: alice.token,
    method: 'POST',
    body: JSON.stringify({ type: 'group', name: 'Turma do Recife', memberIds: [bob.user.id] })
  });
  assert.equal(group.response.status, 201);
  assert.equal(group.payload.data.name, 'Turma do Recife');

  const logout = await request('/api/auth/logout', { token: alice.token, method: 'POST' });
  assert.equal(logout.response.status, 200);
  const loggedOut = await request('/api/community/me', { token: alice.token });
  assert.equal(loggedOut.response.status, 401);
});
