import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const config = window.FISGA_SUPABASE_CONFIG;
const isConfigured = config?.url &&
  config?.anonKey &&
  !config.url.includes('SEU-PROJETO') &&
  !config.anonKey.includes('SUA_CHAVE');

export const supabase = isConfigured
  ? createClient(config.url, config.anonKey)
  : null;

const requireClient = () => {
  if (!supabase) {
    throw new Error('Configure a URL do projeto e a chave pública em supabase-config.js.');
  }
  return supabase;
};

const requireRoomId = (roomId) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roomId || '')) {
    throw new Error('A sala selecionada não é válida.');
  }
};

const createMessageElement = (message, currentUserId) => {
  const article = document.createElement('article');
  article.className = `chat-message${message.usuario_id === currentUserId ? ' mine' : ''}`;

  const author = document.createElement('strong');
  author.textContent = message.nome_usuario;
  const content = document.createElement('p');
  content.textContent = message.conteudo;
  const time = document.createElement('time');
  time.dateTime = message.criado_em;
  time.textContent = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' })
    .format(new Date(message.criado_em));

  article.dataset.messageId = message.id;
  article.append(author, content, time);
  return article;
};

const renderMessageList = (container, messages, currentUserId) => {
  if (!messages.length) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'community-empty';
    emptyMessage.textContent = 'Diga olá para iniciar a conversa.';
    container.replaceChildren(emptyMessage);
  } else {
    container.replaceChildren(...messages.map((message) => createMessageElement(message, currentUserId)));
  }
  container.scrollTop = container.scrollHeight;
};

export async function registerWithSupabase(email, password, fisherName) {
  const name = typeof fisherName === 'string' ? fisherName.trim() : '';
  if (name.length < 2 || name.length > 40) {
    throw new Error('O nome de pescador deve ter entre 2 e 40 caracteres.');
  }
  const client = requireClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { nome_usuario: name } }
  });
  if (error) throw error;
  return data;
}

export async function signInWithSupabase(email, password) {
  const client = requireClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOutFromSupabase() {
  const client = requireClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function getSupabaseUser() {
  const client = requireClient();
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function searchSupabaseFishers(query = '') {
  const client = requireClient();
  const text = query.trim().replace(/[\\%_,]/g, '\\$&');
  let request = client
    .from('perfis')
    .select('id, nome_usuario')
    .order('nome_usuario', { ascending: true })
    .limit(30);
  if (text) request = request.ilike('nome_usuario', `%${text}%`);

  const { data, error } = await request;
  if (error) throw error;
  return data;
}

export async function listSupabaseFriendships() {
  const client = requireClient();
  const user = await getSupabaseUser();
  if (!user) throw new Error('Entre na sua conta para ver suas amizades.');

  const { data: friendships, error } = await client
    .from('amizades')
    .select('solicitante_id, destinatario_id, status, criada_em')
    .or(`solicitante_id.eq.${user.id},destinatario_id.eq.${user.id}`)
    .order('criada_em', { ascending: false });
  if (error) throw error;
  if (!friendships.length) return [];

  const otherIds = friendships.map((friendship) => (
    friendship.solicitante_id === user.id
      ? friendship.destinatario_id
      : friendship.solicitante_id
  ));
  const { data: profiles, error: profilesError } = await client
    .from('perfis')
    .select('id, nome_usuario')
    .in('id', otherIds);
  if (profilesError) throw profilesError;

  const namesById = new Map(profiles.map((profile) => [profile.id, profile.nome_usuario]));
  return friendships.map((friendship) => ({
    userId: friendship.solicitante_id === user.id
      ? friendship.destinatario_id
      : friendship.solicitante_id,
    name: namesById.get(
      friendship.solicitante_id === user.id
        ? friendship.destinatario_id
        : friendship.solicitante_id
    ) || 'Pescador',
    status: friendship.status,
    direction: friendship.solicitante_id === user.id ? 'sent' : 'received'
  }));
}

export async function requestSupabaseFriendship(otherUserId) {
  const client = requireClient();
  const { data, error } = await client.rpc('solicitar_amizade', {
    p_outro_usuario: otherUserId
  });
  if (error) throw error;
  return data;
}

export async function respondSupabaseFriendship(otherUserId, accept) {
  const client = requireClient();
  const { error } = await client.rpc('responder_solicitacao_amizade', {
    p_outro_usuario: otherUserId,
    p_aceitar: accept
  });
  if (error) throw error;
}

export async function removeSupabaseFriendship(otherUserId) {
  const client = requireClient();
  const { error } = await client.rpc('remover_amizade', {
    p_outro_usuario: otherUserId
  });
  if (error) throw error;
}

export async function uploadCatchPhoto(file) {
  if (!(file instanceof File)) throw new Error('Selecione uma foto válida.');
  const allowedTypes = new Map([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp']
  ]);
  const extension = allowedTypes.get(file.type);
  if (!extension) throw new Error('A foto deve estar no formato JPG, PNG ou WebP.');
  if (file.size === 0) throw new Error('A foto selecionada está vazia.');
  if (file.size > 5 * 1024 * 1024) throw new Error('A foto deve ter no máximo 5 MB.');

  const user = await getSupabaseUser();
  if (!user) throw new Error('Entre na sua conta para enviar uma foto.');
  const client = requireClient();
  const imagePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await client.storage
    .from('fisga-capturas')
    .upload(imagePath, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false
    });
  if (error) throw error;
  return imagePath;
}

export async function removeCatchPhoto(imagePath) {
  if (typeof imagePath !== 'string' || !imagePath) return;
  const { error } = await requireClient()
    .storage
    .from('fisga-capturas')
    .remove([imagePath]);
  if (error) throw error;
}

export function getCatchPhotoUrl(imagePath) {
  if (typeof imagePath !== 'string' || !imagePath) return '';
  return requireClient()
    .storage
    .from('fisga-capturas')
    .getPublicUrl(imagePath)
    .data.publicUrl;
}

export async function createDirectRoom(otherUserId) {
  const client = requireClient();
  const { data, error } = await client.rpc('obter_ou_criar_conversa_direta', {
    p_outro_usuario: otherUserId
  });
  if (error) throw error;
  return data;
}

export async function listSupabaseRooms() {
  const client = requireClient();
  const user = await getSupabaseUser();
  if (!user) throw new Error('Entre na sua conta Supabase para ver as conversas.');

  const { data: rooms, error: roomError } = await client
    .from('salas')
    .select('id, tipo, nome, criada_em')
    .order('criada_em', { ascending: false });
  if (roomError) throw roomError;
  if (!rooms.length) return [];

  const roomIds = rooms.map((room) => room.id);
  const { data: memberships, error: membershipError } = await client
    .from('salas_membros')
    .select('sala_id, usuario_id')
    .in('sala_id', roomIds);
  if (membershipError) throw membershipError;

  const memberIds = [...new Set(memberships.map((member) => member.usuario_id))];
  const { data: profiles, error: profilesError } = await client
    .from('perfis')
    .select('id, nome_usuario')
    .in('id', memberIds);
  if (profilesError) throw profilesError;

  const profileById = new Map(profiles.map((profile) => [profile.id, profile.nome_usuario]));
  const { data: messages, error: messagesError } = await client
    .from('mensagens')
    .select('id, usuario_id, nome_usuario, conteudo, criado_em, sala_id')
    .in('sala_id', roomIds)
    .order('criado_em', { ascending: false })
    .limit(1000);
  if (messagesError) throw messagesError;

  const latestMessageByRoom = new Map();
  for (const message of messages) {
    if (!latestMessageByRoom.has(message.sala_id)) {
      latestMessageByRoom.set(message.sala_id, message);
    }
  }

  return rooms.map((room) => {
    const members = memberships
      .filter((member) => member.sala_id === room.id)
      .map((member) => ({
        id: member.usuario_id,
        name: profileById.get(member.usuario_id) || 'Pescador'
      }));
    return {
      id: room.id,
      type: room.tipo === 'direta' ? 'direct' : 'group',
      name: room.nome || '',
      createdAt: room.criada_em,
      members,
      latestMessage: latestMessageByRoom.get(room.id) || null
    };
  }).sort((left, right) => (
    (right.latestMessage?.criado_em || right.createdAt)
      .localeCompare(left.latestMessage?.criado_em || left.createdAt)
  ));
}

export async function createGroupRoom(name, memberIds) {
  const client = requireClient();
  const { data, error } = await client.rpc('criar_sala_grupo', {
    p_nome: name,
    p_membros: memberIds
  });
  if (error) throw error;
  return data;
}

export async function loadRoomHistory(roomId) {
  requireRoomId(roomId);
  const client = requireClient();
  const { data, error } = await client
    .from('mensagens')
    .select('id, usuario_id, nome_usuario, conteudo, criado_em, sala_id')
    .eq('sala_id', roomId)
    .order('criado_em', { ascending: true })
    .limit(100);
  if (error) throw error;
  return data;
}

export async function openRoomChat(roomId, container) {
  requireRoomId(roomId);
  if (!(container instanceof HTMLElement)) throw new Error('O elemento de mensagens não foi encontrado.');

  const client = requireClient();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('Entre na sua conta para abrir o chat.');

  const userId = authData.user.id;
  const pendingMessages = new Map();
  let historyLoaded = false;
  const channel = client
    .channel(`mensagens:${roomId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'mensagens',
      filter: `sala_id=eq.${roomId}`
    }, (payload) => {
      const message = payload.new;
      if (container.querySelector(`[data-message-id="${message.id}"]`)) return;
      if (!historyLoaded) {
        pendingMessages.set(message.id, message);
      } else {
        container.querySelector('.community-empty')?.remove();
        container.append(createMessageElement(message, userId));
        container.scrollTop = container.scrollHeight;
      }
    });

  await new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error('O Supabase Realtime não respondeu. Verifique a conexão e a publicação.'));
    }, 10000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        window.clearTimeout(timeout);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        window.clearTimeout(timeout);
        reject(new Error(`Não foi possível acompanhar esta sala em tempo real (${status}).`));
      }
    });
  }).catch(async (error) => {
    await client.removeChannel(channel);
    throw error;
  });

  container.replaceChildren();
  let history;
  try {
    history = await loadRoomHistory(roomId);
  } catch (error) {
    await client.removeChannel(channel);
    throw error;
  }

  const historyIds = new Set(history.map((message) => message.id));
  const queuedMessages = [...pendingMessages.values()]
    .filter((message) => !historyIds.has(message.id))
    .sort((left, right) => left.criado_em.localeCompare(right.criado_em));
  renderMessageList(container, [...history, ...queuedMessages], userId);
  pendingMessages.clear();
  historyLoaded = true;

  return async () => {
    const status = await client.removeChannel(channel);
    if (status !== 'ok') throw new Error(`Não foi possível encerrar o canal Realtime (${status}).`);
  };
}

export async function sendRoomMessage(roomId, content) {
  requireRoomId(roomId);
  const text = typeof content === 'string' ? content.trim() : '';
  if (!text || text.length > 1000) throw new Error('A mensagem deve ter entre 1 e 1000 caracteres.');

  const client = requireClient();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('Entre na sua conta para enviar mensagens.');

  const { data, error } = await client
    .from('mensagens')
    .insert({
      usuario_id: authData.user.id,
      sala_id: roomId,
      conteudo: text
    })
    .select('id, usuario_id, nome_usuario, conteudo, criado_em, sala_id')
    .single();
  if (error) throw error;
  return data;
}

export function bindRoomMessageForm({ form, input, getRoomId, statusElement }) {
  if (!(form instanceof HTMLFormElement) || !(input instanceof HTMLInputElement)) {
    throw new Error('O formulário e o campo de mensagem são obrigatórios.');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    if (statusElement) statusElement.textContent = '';

    try {
      await sendRoomMessage(getRoomId(), text);
      input.value = '';
    } catch (error) {
      if (statusElement) statusElement.textContent = error.message;
      else console.error('Não foi possível enviar a mensagem:', error);
    } finally {
      if (submitButton) submitButton.disabled = false;
      input.focus();
    }
  });
}

window.FisgaSupabase = supabase;
window.FisgaSupabaseChat = {
  registerWithSupabase,
  signInWithSupabase,
  signOutFromSupabase,
  getSupabaseUser,
  searchSupabaseFishers,
  listSupabaseFriendships,
  requestSupabaseFriendship,
  respondSupabaseFriendship,
  removeSupabaseFriendship,
  uploadCatchPhoto,
  removeCatchPhoto,
  getCatchPhotoUrl,
  listSupabaseRooms,
  createDirectRoom,
  createGroupRoom,
  loadRoomHistory,
  openRoomChat,
  sendRoomMessage,
  bindRoomMessageForm
};
