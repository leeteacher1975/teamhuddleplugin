import { getStore } from '@netlify/blobs';

const STORE_NAME = 'team-huddle-case-share';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'za2030admin';
const MAX_ENTRIES_PER_DEVICE = 2;
const MAX_TEXT_LEN = 1000;
const MAX_NAME_LEN = 30;
const MAX_TEAM_LEN = 40;

function emptyState() {
  return { entries: [] };
}

function newId() {
  return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
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
    // 관리자 초기화 판별용 내부 필드(deviceToken)는 그대로 내려줘야
    // 참가자 화면이 "내 케이스"를 식별할 수 있음(익명 게시판이 아니라 이름/소속을 이미 공개하므로 노출 문제 없음)
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
      const { deviceToken, name, team, text } = body;
      if (!deviceToken || !name || !team || !text) {
        return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400 });
      }
      const trimmedName = String(name).trim().slice(0, MAX_NAME_LEN);
      const trimmedTeam = String(team).trim().slice(0, MAX_TEAM_LEN);
      const trimmedText = String(text).trim().slice(0, MAX_TEXT_LEN);
      if (!trimmedName || !trimmedTeam || !trimmedText) {
        return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400 });
      }

      const myCount = data.entries.filter(e => e.deviceToken === deviceToken).length;
      if (myCount >= MAX_ENTRIES_PER_DEVICE) {
        return new Response(JSON.stringify({ error: 'quota_exceeded' }), { status: 403 });
      }

      const entry = {
        id: newId(),
        deviceToken,
        name: trimmedName,
        team: trimmedTeam,
        text: trimmedText,
        ts: Date.now(),
        likes: 0,
        likedBy: []
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

    if (body.action === 'like') {
      const { deviceToken, id } = body;
      if (!deviceToken || !id) {
        return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400 });
      }
      const entry = data.entries.find(e => e.id === id);
      if (!entry) {
        return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
      }
      if (!Array.isArray(entry.likedBy)) entry.likedBy = [];
      const likedIdx = entry.likedBy.indexOf(deviceToken);
      if (likedIdx === -1) {
        entry.likedBy.push(deviceToken);
      } else {
        entry.likedBy.splice(likedIdx, 1);
      }
      entry.likes = entry.likedBy.length;
      await store.setJSON('state', data);
      return new Response(JSON.stringify({ ok: true, likes: entry.likes }), {
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

export const config = { path: '/api/case' };
