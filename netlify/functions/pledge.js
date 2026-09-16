import { getStore } from '@netlify/blobs';

const STORE_NAME = 'team-huddle-pledge';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'za2030admin';
const MAX_NAME_LEN = 30;
const MAX_TEAM_LEN = 40;
const MAX_IDEA_LEN = 200;

function emptyState() {
  return { entries: [] };
}

function newId() {
  return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

export default async (req, context) => {
  let store;
  try {
    store = getStore(STORE_NAME);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Blobs 스토어를 초기화하지 못했습니다.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (req.method === 'GET') {
    let data;
    try {
      data = (await store.get('state', { type: 'json' })) || emptyState();
    } catch (e) {
      data = emptyState();
    }
    const entries = Array.isArray(data.entries) ? data.entries : [];
    return new Response(JSON.stringify({ entries, total: entries.length }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (req.method === 'POST') {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'invalid body' }), { status: 400 });
    }

    let data;
    try {
      data = (await store.get('state', { type: 'json' })) || emptyState();
    } catch (e) {
      data = emptyState();
    }
    if (!Array.isArray(data.entries)) data.entries = [];

    // 한 사람(디바이스)당 다짐은 하나: 다시 제출하면 기존 다짐을 덮어씁니다(수정 개념).
    if (body.action === 'submit') {
      const { deviceToken, name, team, pillarKey, pillarName, idea } = body;
      if (!deviceToken || !name || !team || !pillarKey || !pillarName || !idea) {
        return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400 });
      }
      const trimmedName = String(name).trim().slice(0, MAX_NAME_LEN);
      const trimmedTeam = String(team).trim().slice(0, MAX_TEAM_LEN);
      const trimmedIdea = String(idea).trim().slice(0, MAX_IDEA_LEN);
      if (!trimmedName || !trimmedTeam || !trimmedIdea) {
        return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400 });
      }

      const existingIdx = data.entries.findIndex(e => e.deviceToken === deviceToken);
      const now = Date.now();
      if (existingIdx !== -1) {
        data.entries[existingIdx] = {
          ...data.entries[existingIdx],
          name: trimmedName,
          team: trimmedTeam,
          pillarKey,
          pillarName,
          idea: trimmedIdea,
          ts: now
        };
        await store.setJSON('state', data);
        return new Response(JSON.stringify({ ok: true, entry: data.entries[existingIdx], updated: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const entry = {
        id: newId(),
        deviceToken,
        name: trimmedName,
        team: trimmedTeam,
        pillarKey,
        pillarName,
        idea: trimmedIdea,
        ts: now
      };
      data.entries.push(entry);
      await store.setJSON('state', data);
      return new Response(JSON.stringify({ ok: true, entry, updated: false }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (body.action === 'delete') {
      const { deviceToken, id } = body;
      if (!deviceToken || !id) {
        return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400 });
      }
      const idx = data.entries.findIndex(e => e.id === id);
      if (idx === -1) {
        return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
      }
      if (data.entries[idx].deviceToken !== deviceToken) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
      }
      data.entries.splice(idx, 1);
      await store.setJSON('state', data);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (body.action === 'reset') {
      if (body.adminPassword !== ADMIN_TOKEN) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
      }
      const fresh = emptyState();
      await store.setJSON('state', fresh);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'unknown action' }), { status: 400 });
  }

  return new Response('Method not allowed', { status: 405 });
};

export const config = { path: '/api/pledge' };
