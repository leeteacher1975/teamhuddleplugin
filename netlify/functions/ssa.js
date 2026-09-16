import { getStore } from '@netlify/blobs';

const STORE_NAME = 'team-huddle-ssa';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'za2030admin';
const CATEGORIES = ['stop', 'start', 'amplify'];
const MAX_PER_CATEGORY = 3;
const MAX_TEXT_LEN = 300;

function emptyState() {
  return { entries: [] };
}

function newId() {
  return 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
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

    if (body.action === 'submit') {
      const { deviceToken, category, text } = body;
      if (!deviceToken || !CATEGORIES.includes(category) || !text) {
        return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400 });
      }
      const trimmedText = String(text).trim().slice(0, MAX_TEXT_LEN);
      if (!trimmedText) {
        return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400 });
      }

      const myCount = data.entries.filter(
        e => e.deviceToken === deviceToken && e.category === category
      ).length;
      if (myCount >= MAX_PER_CATEGORY) {
        return new Response(JSON.stringify({ error: 'quota_exceeded' }), { status: 403 });
      }

      const entry = {
        id: newId(),
        deviceToken,
        category,
        text: trimmedText,
        ts: Date.now()
      };
      data.entries.push(entry);
      await store.setJSON('state', data);
      return new Response(JSON.stringify({ ok: true, entry }), {
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

export const config = { path: '/api/ssa' };
