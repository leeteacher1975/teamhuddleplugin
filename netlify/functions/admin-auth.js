// 관리자 대시보드(admin.html) 진입용 비밀번호 확인 전용 엔드포인트.
// 데이터를 읽거나 바꾸지 않고, 입력한 비밀번호가 ADMIN_TOKEN과 일치하는지만 확인합니다.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'za2030admin';

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'invalid body' }), { status: 400 });
  }
  const ok = typeof body.adminPassword === 'string' && body.adminPassword === ADMIN_TOKEN;
  return new Response(JSON.stringify({ ok }), {
    status: ok ? 200 : 401,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const config = { path: '/api/admin-auth' };
