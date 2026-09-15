import { getStore } from '@netlify/blobs';

const STORE_NAME = 'team-huddle-focus-pick';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'za2030admin';
const CHOICES = ['customer', 'speed', 'global', 'high_perf'];

// 스토어가 아직 한 번도 저장된 적 없을 때 쓰는 고정 초기값입니다.
// 매 요청마다 새 타임스탬프를 만들면(예: new Date()) 같은 "초기 상태"인데도
// 호출마다 resetAt이 달라져, 참가자 화면이 "관리자가 초기화했다"고 오인해
// 방금 투표한 결과 화면이 곧바로 선택 화면으로 되돌아가는 버그가 생깁니다.
const INITIAL_RESET_AT = 'initial';

function emptyState() {
  return { votes: {}, resetAt: INITIAL_RESET_AT, confirmedChoice: null };
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
    return new Response(JSON.stringify({
      counts,
      total,
      resetAt: data.resetAt,
      confirmedChoice: data.confirmedChoice || null
    }), {
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

    if (body.action === 'confirm') {
      if (body.adminPassword !== ADMIN_TOKEN) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
      }
      if (!CHOICES.includes(body.choice)) {
        return new Response(JSON.stringify({ error: 'invalid choice' }), { status: 400 });
      }
      data.confirmedChoice = body.choice;
      await store.setJSON('state', data);
      return new Response(JSON.stringify({ ok: true, confirmedChoice: data.confirmedChoice }), {
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
