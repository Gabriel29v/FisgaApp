const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const API_BASE_URL = 'https://tabuamare.api.br';
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;

const locations = [
  { id: 'recife', name: 'Recife', latitude: -8.0476, longitude: -34.877, utcOffset: -3 },
  { id: 'itamaraca', name: 'Goiana / Ilha de Itamaracá', latitude: -7.747, longitude: -34.83, utcOffset: -3 },
  { id: 'porto-de-galinhas', name: 'Ipojuca / Porto de Galinhas', latitude: -8.5025, longitude: -35.005, utcOffset: -3 },
  { id: 'tamandare', name: 'Tamandaré', latitude: -8.759, longitude: -35.104, utcOffset: -3 },
  { id: 'sao-jose-da-coroa-grande', name: 'São José da Coroa Grande', latitude: -8.897, longitude: -35.147, utcOffset: -3 },
  { id: 'fernando-de-noronha', name: 'Fernando de Noronha', latitude: -3.854, longitude: -32.423, utcOffset: -2 }
];

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function parseDateInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return { year, month, day };
}

function normalizeTideResponse(payload, selectedDate) {
  if (!payload || !Array.isArray(payload.data)) {
    throw new Error('A API de marés retornou uma resposta em formato inválido.');
  }
  if (!payload.data.length) return null;
  const harbors = payload.data;
  const harbor = harbors.find((item) => Array.isArray(item.months)) || harbors[0];
  if (!Array.isArray(harbor.months)) {
    throw new Error('A API de marés retornou uma resposta em formato inválido.');
  }

  const events = harbors.flatMap((item) => (
    Array.isArray(item.months)
      ? item.months.flatMap((month) => (
          Array.isArray(month.days)
            ? month.days.flatMap((day) => (
                Array.isArray(day.hours)
                  ? day.hours.map((hour) => ({
                      date: `${item.year}-${String(month.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`,
                      time: typeof hour.hour === 'string' ? hour.hour.slice(0, 5) : '',
                      height: Number(hour.level)
                    }))
                  : []
              ))
            : []
        ))
      : []
  )).filter((event) => (
    /^\d{2}:\d{2}$/.test(event.time) &&
    Number.isFinite(event.height)
  ));

  if (!events.some((event) => event.date === selectedDate)) return null;

  return {
    station: harbor.harbor_name,
    stationId: harbor.id,
    timezone: harbor.timezone,
    institution: harbor.data_collection_institution,
    events: events.sort((left, right) => (
      left.date.localeCompare(right.date) || left.time.localeCompare(right.time)
    ))
  };
}

function groupDatesByMonth(dates) {
  const groups = new Map();
  for (const date of dates) {
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
    if (!groups.has(key)) {
      groups.set(key, {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        days: []
      });
    }
    groups.get(key).days.push(date.getUTCDate());
  }
  return [...groups.values()];
}

async function fetchMonthTides(location, group) {
  const requestedDays = [...new Set(group.days)].sort((left, right) => left - right);
  const coordinates = `[${location.latitude},${location.longitude}]`;
  const days = `[${requestedDays.join(',')}]`;
  const url = `${API_BASE_URL}/api/v2/geo-tabua-mare/${coordinates}/pe/${group.month}/${days}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let response;
  let payload;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    try {
      payload = await response.json();
    } catch {
      if (response.ok) throw new Error('A API de marés retornou JSON inválido.');
    }
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const error = new Error(payload?.error?.message || `A API de marés respondeu com HTTP ${response.status}.`);
    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }

  if (!payload || !Array.isArray(payload.data)) {
    throw new Error('A API de marés retornou uma resposta em formato inválido.');
  }
  return payload;
}

async function getTides(location, selectedDate, dateParts) {
  const selected = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day));
  const requestedDates = [-1, 0, 1]
    .map((offset) => new Date(selected.getTime() + offset * 86400000))
    .filter((date) => date.getUTCFullYear() === dateParts.year);
  const monthGroups = groupDatesByMonth(requestedDates);
  const payloads = await Promise.all(monthGroups.map((group) => fetchMonthTides(location, group)));
  const combinedPayload = {
    data: payloads.flatMap((payload) => payload.data)
  };
  const normalized = normalizeTideResponse(combinedPayload, selectedDate);

  if (!normalized) {
    const error = new Error('Não há dados de maré disponíveis para este local e dia.');
    error.status = 404;
    throw error;
  }

  return {
    location: location.name,
    date: selectedDate,
    station: normalized.station,
    stationId: normalized.stationId,
    timezone: normalized.timezone,
    institution: normalized.institution,
    source: 'Tábua de Maré API',
    sourceUrl: 'https://tabuamare.api.br/docs',
    events: normalized.events
  };
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(body));
}

async function handleApiRequest(request, response, url) {
  if (request.method !== 'GET') {
    sendJson(response, 405, { error: 'Método não permitido.' });
    return;
  }

  if (url.pathname === '/api/locations') {
    sendJson(response, 200, {
      data: locations.map(({ id, name, latitude, longitude, utcOffset }) => ({
        id,
        name,
        latitude,
        longitude,
        utcOffset
      }))
    });
    return;
  }

  if (url.pathname !== '/api/tides') {
    sendJson(response, 404, { error: 'Endpoint não encontrado.' });
    return;
  }

  const location = locations.find((item) => item.id === url.searchParams.get('location'));
  const dateValue = url.searchParams.get('date');
  const dateParts = parseDateInput(dateValue);
  if (!location || !dateParts) {
    sendJson(response, 400, { error: 'Informe uma localidade e uma data válidas.' });
    return;
  }

  try {
    const result = await getTides(location, dateValue, dateParts);
    sendJson(response, 200, result);
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 502;
    sendJson(response, status, {
      error: status === 429
        ? 'Limite de consultas atingido. Aguarde um momento e tente novamente.'
        : status === 404
          ? error.message
          : `Não foi possível consultar a API de marés: ${error.message}`
    });
  }
}

function getStaticFile(pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decodedPath.split(/[\\/]/).includes('..')) return null;

  const requestedPath = decodedPath === '/' ? '/index.html' : decodedPath;
  if (
    requestedPath !== '/index.html' &&
    requestedPath !== '/script.js' &&
    requestedPath !== '/style.css' &&
    !requestedPath.startsWith('/assets/') &&
    !requestedPath.startsWith('/login/')
  ) return null;

  const filePath = path.resolve(ROOT, `.${requestedPath}`);
  const relativePath = path.relative(ROOT, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return null;
  return filePath;
}

function serveStaticFile(request, response, pathname) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405);
    response.end();
    return;
  }

  const filePath = getStaticFile(pathname);
  if (!filePath) {
    response.writeHead(404);
    response.end('Não encontrado.');
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      response.writeHead(404);
      response.end('Não encontrado.');
      return;
    }

    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stats.size
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    fs.createReadStream(filePath).pipe(response);
  });
}

function createServer() {
  return http.createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      handleApiRequest(request, response, url).catch((error) => {
        sendJson(response, 500, { error: `Erro interno ao consultar marés: ${error.message}` });
      });
      return;
    }
    serveStaticFile(request, response, url.pathname);
  });
}

if (require.main === module) {
  createServer().listen(PORT, HOST, () => {
    console.log(`Fisga disponível localmente: http://localhost:${PORT}`);
    console.log(`Para acessar pelo celular (mesma rede Wi-Fi): http://192.168.100.3:${PORT}`);
  });
}

module.exports = { createServer, getTides, locations, normalizeTideResponse, parseDateInput };
