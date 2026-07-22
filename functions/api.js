// Cloudflare Pages Functions · /api 代理
// 环境变量（Cloudflare Pages 后台配置，勿提交）：
//   SUPABASE_URL          如 https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY  service_role key（仅服务端）

const PBKDF2_ITER = 100000;

function b64encode(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64decode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  s += '='.repeat(pad);
  const bin = atob(s);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}

async function hashPassword(password, saltB64) {
  let salt;
  if (saltB64) { salt = b64decode(saltB64); } else { salt = crypto.getRandomValues(new Uint8Array(16)); }
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBK hashPassword(password, parts[2]);
  const a = new TextEncoder().encode(computed);
  const b = new TextEncoder().encode(stored);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function sbHeaders(env, extra = {}) {
  return { 'Content-Type': 'application/json', 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`, ...extra };
}
async function sbFetch(env, path, options = {}) {
  const url = `${env.SUPABASE_URL}/rest/v1${path}`;
  const res = await fetch(url, { ...options, headers: sbHeaders(env, options.headers || {}) });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
  return { ok: res.ok, status: res.status, json, text };
}

function ok(data) { return new Response(JSON.stringify({ success: true, data }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }); }
function fail(msg, status = 400) { return new Response(JSON.stringify({ success: false, error: msg }), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }); }
function jsonBody(req) { return req.json().catch(() => ({})); }
function sanitizeSettings(s) { if (!s) return s; const { admin_password, ...rest } = s; return rest; }

async function handleAction(action, data, env) {
  switch (action) {
    case 'getSettings': {
      const r = await sbFetch(env, '/settings?id=eq.1&select=*');
      if (!r.ok || !r.json || !r.json[0]) return fail('配置不存在');
      return ok(sanitizeSettings(r.json[0]));
    }
    case 'saveSettings': {
      const patch = data || {};
      if (patch.admin_password) patch.admin_password = await hashPassword(patch.admin_password);
      const r = await sbFetch(env, '/settings?id=eq.1', { method: 'PATCH', body: JSON.stringify(patch), headers: { 'Prefer': 'return=minimal' } });
      if (!r.ok) return fail('保存失败: ' + (r.text || r.status));
      return ok({ saved: true });
    }
    case 'getVoucher': {
      const phone = (data && data.phone) || '';
      const r = await sbFetch(env, `/vouchers?phone=eq.${encodeURIComponent(phone)}&select=code,status&limit=1`);
      if (!r.ok) return fail('查询失败');
      return ok(r.json && r.json[0] ? r.json[0] : null);
    }
    case 'createVoucher': {
      const r = await sbFetch(env, '/vouchers', { method: 'POST', body: JSON.stringify({ phone: data.phone, code: data.code, status: 'active' }), headers: { 'Prefer': 'return=minimal' } });
      if (!r.ok) return fail('创建券失败: ' + (r.text || r.status));
      return ok({ code: data.code });
    }
    case 'createOrder': {
      const r = await sbFetch(env, '/orders', { method: 'POST', body: JSON.stringify(data), headers: { 'Prefer': 'return=minimal' } });
      if (!r.ok) return fail('下单失败: ' + (r.text || r.status));
      return ok({ id: data.id });
    }
    case 'getOrdersByPhone': {
      const phone = (data && data.phone) || '';
      const r = await sbFetch(env, `/orders?phone=eq.${encodeURIComponent(phone)}&select=*&order=created_at.desc`);
      if (!r.ok) return fail('查询失败');
      return ok(r.json || []);
    }
    case 'getAllOrders': {
      const r = await sbFetch(env, '/orders?select=*&order=created_at.desc&limit=500');
      if (!r.ok) return fail('加载失败');
      return ok(r.json || []);
    }
    case 'updateOrderStatus': {
      const r = await sbFetch(env, `/orders?id=eq.${encodeURIComponent(data.orderId)}`, { method: 'PATCH', body: JSON.stringify({ status: data.status }), headers: { 'Prefer': 'return=minimal' } });
      if (!r.ok) return fail('更新失败: ' + (r.text || r.status));
      return ok({ ok: true });
    }
    case 'adminLogin': {
      const r = await sbFetch(env, '/settings?id=eq.1&select=admin_password');
      if (!r.ok || !r.json || !r.json[0]) return ok({ ok: false });
      if (!r.json[0].admin_password) return ok({ ok: false, msg: '请先设置管理密码' });
      const valid = await verifyPassword(data.password || '', r.json[0].admin_password);
      return ok({ ok: valid });
    }
    case 'uploadFile': {
      const { fileName, contentType, base64 } = data || {};
      if (!fileName || !base64) return fail('缺少文件数据');
      const bin = b64decode(base64);
      const up = await fetch(`${env.SUPABASE_URL}/storage/v1/object/files/${fileName}`, {
        method: 'POST',
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': contentType || 'application/octet-stream', 'x-upsert': 'true' },
        body: bin
      });
      if (!up.ok) { const t = await up.text(); return fail('上传失败: ' + t); }
      const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/files/${fileName}`;
      return ok({ publicUrl });
    }
    default:
      return fail('未知操作: ' + action, 404);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (url.pathname === '/api' && request.method === 'POST') {
    const body = await jsonBody(request);
    try { return await handleAction(body.action, body.data || {}, env); }
    catch (e) { return fail('服务器错误: ' + e.message, 500); }
  }
  return fail('Not Found', 404);
}
