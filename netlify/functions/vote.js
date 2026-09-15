import { getStore } from '@netlify/blobs';

const STORE_NAME = 'team-huddle-focus-pick';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'za2030admin';
const CHOICES = ['customer', 'speed', 'global', 'high_perf'];

function emptyState() {
  return { votes: {}, resetAt: new Date().toISOString() };
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
    const counts = { customer: 0, speed: 0, global: 0, high_perf: 0 };
    for (const v of Object.values(data.votes || {})) {
      if (v && CHOICES.includes(v.choice)) counts[v.choice]++;
    }
    const total = Object.keys(data.votes || {}).length;
    return new Response(JSON.stringify({ counts, total, resetAt: data.resetAt }), {
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
    if (!data.votes) data.votes = {};

    if (body.action === 'vote') {
      if (!body.deviceToken || !CHOICES.includes(body.choice)) {
        return new Response(JSON.stringify({ error: 'invalid vote' }), { status: 400 });
      }
      data.votes[body.deviceToken] = { choice: body.choice, ts: Date.now() };
      await store.setJSON('state', data);
      return new Response(JSON.stringify({ ok: true, resetAt: data.resetAt }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (body.action === 'reset') {
      if (body.adminPassword !== ADMIN_TOKEN) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
      }
      const fresh = emptyState();
      await store.setJSON('state', fresh);
      return new Response(JSON.stringify({ ok: true, resetAt: fresh.resetAt }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'unknown action' }), { status: 400 });
  }

  return new Response('Method not allowed', { status: 405 });
};

export const config = { path: '/api/vote' };
