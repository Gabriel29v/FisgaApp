const test = require('node:test');
const assert = require('node:assert/strict');
const { getTides, locations, normalizeTideResponse, parseDateInput } = require('./server');

test('parseDateInput accepts valid ISO dates and rejects impossible dates', () => {
  assert.deepEqual(parseDateInput('2026-10-01'), { year: 2026, month: 10, day: 1 });
  assert.equal(parseDateInput('2026-02-29'), null);
  assert.equal(parseDateInput('01-10-2026'), null);
});

test('normalizeTideResponse combines context days from adjacent months', () => {
  const response = {
    data: [
      {
        id: 'pe02',
        year: 2026,
        harbor_name: 'PORTO DO RECIFE',
        timezone: 'UTC -03.0',
        data_collection_institution: 'DHN',
        months: [{
          month: 9,
          days: [{ day: 30, hours: [{ hour: '19:04:00', level: 2.03 }] }]
        }]
      },
      {
        id: 'pe02',
        year: 2026,
        harbor_name: 'PORTO DO RECIFE',
        timezone: 'UTC -03.0',
        data_collection_institution: 'DHN',
        months: [{
          month: 10,
          days: [{ day: 1, hours: [{ hour: '00:25:00', level: 0.36 }] }]
        }]
      }
    ]
  };

  const result = normalizeTideResponse(response, '2026-10-01');
  assert.equal(result.stationId, 'pe02');
  assert.deepEqual(result.events, [
    { date: '2026-09-30', time: '19:04', height: 2.03 },
    { date: '2026-10-01', time: '00:25', height: 0.36 }
  ]);
});

test('location configuration includes the requested Pernambuco destinations', () => {
  assert.equal(locations.length, 6);
  assert.ok(locations.some((location) => location.id === 'fernando-de-noronha'));
});

test('getTides requests the nearest port and returns normalized events', async () => {
  const originalFetch = global.fetch;
  const requestedUrls = [];
  global.fetch = async (url) => {
    requestedUrls.push(String(url));
    return {
      ok: true,
      json: async () => ({
        data: [{
          id: 'pe02',
          year: 2026,
          harbor_name: 'PORTO DO RECIFE',
          timezone: 'UTC -03.0',
          data_collection_institution: 'DHN',
          months: [{
            month: 10,
            days: [
              { day: 26, hours: [{ hour: '18:30:00', level: 2.0 }] },
              { day: 27, hours: [{ hour: '00:20:00', level: 0.4 }, { hour: '06:35:00', level: 2.1 }] },
              { day: 28, hours: [{ hour: '01:05:00', level: 0.3 }] }
            ]
          }]
        }]
      })
    };
  };

  try {
    const result = await getTides(locations[0], '2026-10-27', parseDateInput('2026-10-27'));
    assert.equal(result.stationId, 'pe02');
    assert.equal(result.events.length, 4);
    assert.equal(requestedUrls.length, 1);
    assert.match(requestedUrls[0], /geo-tabua-mare/);
  } finally {
    global.fetch = originalFetch;
  }
});
