const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const pbkdf2 = promisify(crypto.pbkdf2);
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_ITERATIONS = 210000;
const PASSWORD_BYTES = 64;

function createCommunityStore(filePath) {
  let state = {
    users: [],
    sessions: [],
    catches: [],
    conversations: [],
    messages: []
  };
  let writeQueue = Promise.resolve();

  const persist = () => {
    writeQueue = writeQueue.catch(() => undefined).then(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const temporaryPath = `${filePath}.${process.pid}.tmp`;
      await fs.writeFile(temporaryPath, JSON.stringify(state), { mode: 0o600 });
      await fs.rename(temporaryPath, filePath);
    });
    return writeQueue;
  };

  const ready = fs.readFile(filePath, 'utf8').then((content) => {
    const saved = JSON.parse(content);
    for (const key of Object.keys(state)) {
      if (Array.isArray(saved[key])) state[key] = saved[key];
    }
  }).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });

  const publicUser = (user) => ({
    id: user.id,
    name: user.name,
    createdAt: user.createdAt
  });

  const makeError = (status, message) => Object.assign(new Error(message), { status });
  const digestToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
  const hashPassword = async (password, salt) => pbkdf2(password, salt, PASSWORD_ITERATIONS, PASSWORD_BYTES, 'sha512');

  async function register({ name, email, password }) {
    await ready;
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (normalizedName.length < 2 || normalizedName.length > 40) {
      throw makeError(400, 'Informe um nome entre 2 e 40 caracteres.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
      throw makeError(400, 'Informe um e-mail válido.');
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      throw makeError(400, 'A senha deve ter entre 8 e 128 caracteres.');
    }
    if (state.users.some((user) => user.email === normalizedEmail)) {
      throw makeError(409, 'Este e-mail já possui uma conta.');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = (await hashPassword(password, salt)).toString('hex');
    if (state.users.some((item) => item.email === normalizedEmail)) {
      throw makeError(409, 'Este e-mail já possui uma conta.');
    }
    const user = {
      id: crypto.randomUUID(),
      name: normalizedName,
      email: normalizedEmail,
      salt,
      passwordHash,
      createdAt: new Date().toISOString()
    };
    state.users.push(user);
    await persist();
    return publicUser(user);
  }

  async function authenticate({ email, password }) {
    await ready;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const user = state.users.find((item) => item.email === normalizedEmail);
    const salt = user?.salt || '00000000000000000000000000000000';
    const actualHash = await hashPassword(typeof password === 'string' ? password : '', salt);
    const expectedHash = Buffer.from(user?.passwordHash || '0'.repeat(PASSWORD_BYTES * 2), 'hex');
    if (!user || actualHash.length !== expectedHash.length || !crypto.timingSafeEqual(actualHash, expectedHash)) {
      throw makeError(401, 'E-mail ou senha incorretos.');
    }

    const token = crypto.randomBytes(32).toString('base64url');
    state.sessions = state.sessions.filter((session) => Date.parse(session.expiresAt) > Date.now());
    state.sessions.push({
      tokenHash: digestToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString()
    });
    await persist();
    return { token, user: publicUser(user) };
  }

  async function getUserForToken(token) {
    await ready;
    if (!token) return null;
    const tokenHash = digestToken(token);
    const session = state.sessions.find((item) => item.tokenHash === tokenHash);
    if (!session || Date.parse(session.expiresAt) <= Date.now()) return null;
    const user = state.users.find((item) => item.id === session.userId);
    return user ? publicUser(user) : null;
  }

  async function revokeToken(token) {
    await ready;
    if (!token) return;
    const tokenHash = digestToken(token);
    const previousLength = state.sessions.length;
    state.sessions = state.sessions.filter((session) => session.tokenHash !== tokenHash);
    if (state.sessions.length !== previousLength) await persist();
  }

  async function searchFishers(userId, query) {
    await ready;
    const needle = typeof query === 'string' ? query.trim().toLocaleLowerCase('pt-BR') : '';
    return state.users
      .filter((user) => user.id !== userId && (!needle || user.name.toLocaleLowerCase('pt-BR').includes(needle)))
      .slice(0, 30)
      .map((user) => ({
        ...publicUser(user),
        catchesCount: state.catches.filter((item) => item.userId === user.id).length
      }));
  }

  async function listCatches(userId) {
    await ready;
    return state.catches
      .filter((item) => item.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async function getFisherCatches(requesterId, fisherId) {
    await ready;
    const fisher = state.users.find((user) => user.id === fisherId && user.id !== requesterId);
    if (!fisher) throw makeError(404, 'Pescador não encontrado.');
    return {
      fisher: {
        ...publicUser(fisher),
        catchesCount: state.catches.filter((item) => item.userId === fisher.id).length
      },
      data: state.catches
        .filter((item) => item.userId === fisher.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    };
  }

  async function addCatch(userId, input) {
    await ready;
    const species = typeof input.species === 'string' ? input.species.trim() : '';
    const location = typeof input.location === 'string' ? input.location.trim() : '';
    const imagePath = typeof input.imagePath === 'string' ? input.imagePath.trim() : '';
    const weight = Number(input.weight);
    const length = Number(input.length);
    if (!species || species.length > 60 || !Number.isFinite(weight) || weight <= 0 || weight > 500) {
      throw makeError(400, 'Informe espécie e peso válidos.');
    }
    if (!Number.isFinite(length) || length <= 0 || length > 1000) {
      throw makeError(400, 'Informe um tamanho válido em centímetros.');
    }
    if (location.length > 80) throw makeError(400, 'O local deve ter até 80 caracteres.');
    if (imagePath && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i.test(imagePath)) {
      throw makeError(400, 'O caminho da foto da captura é inválido.');
    }
    const record = {
      id: crypto.randomUUID(),
      userId,
      species,
      weight,
      length,
      location,
      imagePath: imagePath || null,
      createdAt: new Date().toISOString()
    };
    state.catches.push(record);
    await persist();
    return record;
  }

  async function getLeaderboard(filters) {
    await ready;
    const minWeight = filters.minWeight ? Number(filters.minWeight) : 0;
    const maxWeight = filters.maxWeight ? Number(filters.maxWeight) : Infinity;
    const minLength = filters.minLength ? Number(filters.minLength) : 0;
    const maxLength = filters.maxLength ? Number(filters.maxLength) : Infinity;
    const query = typeof filters.q === 'string' ? filters.q.trim().toLocaleLowerCase('pt-BR') : '';
    if ([minWeight, maxWeight, minLength, maxLength].some((value) => Number.isNaN(value) || value < 0)) {
      throw makeError(400, 'Os filtros de peso e tamanho devem ser números positivos.');
    }
    if (minWeight > maxWeight || minLength > maxLength) {
      throw makeError(400, 'O valor mínimo não pode ser maior que o máximo.');
    }
    return state.catches
      .filter((item) => (
        item.weight >= minWeight &&
        item.weight <= maxWeight &&
        item.length >= minLength &&
        item.length <= maxLength &&
        (!query || item.species.toLocaleLowerCase('pt-BR').includes(query))
      ))
      .sort((left, right) => right.weight - left.weight || right.length - left.length)
      .slice(0, 50)
      .map((item) => ({
        ...item,
        fisher: publicUser(state.users.find((user) => user.id === item.userId))
      }));
  }

  async function listConversations(userId) {
    await ready;
    return state.conversations
      .filter((item) => item.memberIds.includes(userId))
      .map((item) => {
        const latest = state.messages
          .filter((message) => message.conversationId === item.id)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
        return {
          ...item,
          members: item.memberIds.map((id) => publicUser(state.users.find((user) => user.id === id))).filter(Boolean),
          latestMessage: latest || null
        };
      })
      .sort((left, right) => (right.latestMessage?.createdAt || right.createdAt)
        .localeCompare(left.latestMessage?.createdAt || left.createdAt));
  }

  async function createConversation(userId, { type, name, memberIds }) {
    await ready;
    const requestedIds = Array.isArray(memberIds) ? [...new Set(memberIds)] : [];
    if (type === 'direct') {
      const targetId = requestedIds[0];
      if (!targetId || targetId === userId || !state.users.some((user) => user.id === targetId)) {
        throw makeError(400, 'Selecione um pescador válido para conversar.');
      }
      const members = [userId, targetId].sort();
      const existing = state.conversations.find((item) => (
        item.type === 'direct' && item.memberIds.length === 2 &&
        item.memberIds.every((id, index) => id === members[index])
      ));
      if (existing) return existing;
      const conversation = {
        id: crypto.randomUUID(),
        type,
        name: '',
        memberIds: members,
        createdAt: new Date().toISOString()
      };
      state.conversations.push(conversation);
      await persist();
      return conversation;
    }
    if (type !== 'group') throw makeError(400, 'Tipo de conversa inválido.');
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const members = [...new Set([userId, ...requestedIds])];
    if (normalizedName.length < 2 || normalizedName.length > 50) {
      throw makeError(400, 'O nome do grupo deve ter entre 2 e 50 caracteres.');
    }
    if (members.length < 2 || members.length > 20 || members.some((id) => !state.users.some((user) => user.id === id))) {
      throw makeError(400, 'Selecione de 1 a 19 pescadores válidos para o grupo.');
    }
    const conversation = {
      id: crypto.randomUUID(),
      type,
      name: normalizedName,
      memberIds: members,
      createdAt: new Date().toISOString()
    };
    state.conversations.push(conversation);
    await persist();
    return conversation;
  }

  async function listMessages(userId, conversationId) {
    await ready;
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation || !conversation.memberIds.includes(userId)) {
      throw makeError(404, 'Conversa não encontrada.');
    }
    return state.messages
      .filter((item) => item.conversationId === conversationId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(-100)
      .map((item) => ({
        ...item,
        sender: publicUser(state.users.find((user) => user.id === item.userId))
      }));
  }

  async function addMessage(userId, conversationId, text) {
    await ready;
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation || !conversation.memberIds.includes(userId)) {
      throw makeError(404, 'Conversa não encontrada.');
    }
    const content = typeof text === 'string' ? text.trim() : '';
    if (!content || content.length > 1000) throw makeError(400, 'A mensagem deve ter entre 1 e 1000 caracteres.');
    const message = {
      id: crypto.randomUUID(),
      conversationId,
      userId,
      text: content,
      createdAt: new Date().toISOString()
    };
    state.messages.push(message);
    await persist();
    return message;
  }

  return {
    register,
    authenticate,
    getUserForToken,
    revokeToken,
    searchFishers,
    listCatches,
    getFisherCatches,
    addCatch,
    getLeaderboard,
    listConversations,
    createConversation,
    listMessages,
    addMessage
  };
}

module.exports = { createCommunityStore };
