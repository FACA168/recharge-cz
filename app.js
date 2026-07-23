// ===== 全局状态 =====
const appData = {
  settings: {},
  currentPhone: '',
  currentVoucherCode: '',
  currentOrder: null,
  selectedAmount: 0,
  selectedDiscount: 0,
  uploadFileUrl: null,
  adminSession: null,
  currentQR: null
};

// ===== 工具函数 =====
function $(id){ return document.getElementById(id); }
function $all(sel){ return document.querySelectorAll(sel); }

function escapeHtml(s) {
  const map = { '&':'\x26', '<':'\x3C', '>':'\x3E', '"':'\x22', "'":'\x27' };
  return String(s==null?'':s).replace(/[&<>"']/g, c => map[c]);
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2100);
}

function showPage(pageId) {
  $all('.page').forEach(p => p.classList.remove('active'));
  const page = $(pageId);
  if (page) page.classList.add('active');
  window.scrollTo(0, 0);
}

async function callProxy(action, payload) {
  const body = JSON.stringify({ action, payload: payload || {} });
  const resp = await fetch('/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data.data;
}

// ===== 初始化 =====
async function loadAllData() {
  const lm = $('loadingMask');
  applySettings();
  showPage('pageHome');
  lm.style.display = 'none';
  const timeoutPromise = new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 5000));
  try {
    await Promise.race([
      (async () => {
        try {
          const settingsData = await callProxy('getSettings');
          if (settingsData) { appData.settings = { ...appData.settings, ...settingsData }; applySettings(); }
        } catch(e) { console.error('getSettings failed:', e); }
        try {
          const s = localStorage.getItem('recharge_session');
          if (s) { const ses = JSON.parse(s); appData.currentPhone = ses.phone || ''; appData.currentVoucherCode = ses.voucher || ''; }
        } catch(e) {}
        return 'success';
      })(),
      timeoutPromise
    ]);
  } catch(e) { console.error(e); }
}

function applySettings() {
  const s = appData.settings;
  $('navSiteName').textContent = s.site_name || '充值中心';
  document.title = s.site_name || '充值中心';
  $('announcementText').textContent = s.announcement || '';
  const lp = $('navLogoPlaceholder');
  if(s.logo) { lp.innerHTML = '<img class="logo-img" src="'+s.logo+'" style="width:38px;height:38px;border-radius:8px;object-fit:contain;">'; } else { lp.innerHTML = '⛽'; }
  const bw = $('homeBanner');
  if(s.banner) { bw.innerHTML = '<img src="'+s.banner+'" alt="Banner">'; } else { bw.innerHTML = '<div class="banner-placeholder"><div class="bp-title">🎉 充值特惠 · 代金券限时领</div><div class="bp-sub">充值即享优惠 · 代金券限量发放中，先到先得</div></div>'; }
  const cl = $('csLinkResult');
  cl.textContent = '💬 联系' + (s.cs_name||'在线客服');
  cl.href = s.cs_link||'#';
  if(!s.cs_link || s.cs_link==='#') { cl.setAttribute('onclick','showToast("客服链接暂未设置");return false;'); } else { cl.removeAttribute('onclick'); }
  updateQRDisplay();
}

function updateQRDisplay() {
  const qd = $('qrDisplay');
  const method = qd.getAttribute('data-payment') || 'wechat';
  const qrData = method==='wechat' ? appData.settings.wechat_qr : appData.settings.alipay_qr;
  if(qrData) { qd.innerHTML = '<img src="'+qrData+'" alt="收款码" style="width:100%;height:100%;object-fit:contain;">'; } else { qd.innerHTML = '<span class="qr-placeholder">请在后台设置'+(method==='wechat'?'微信':'支付宝')+'收款码</span>'; }
}

// ===== 首页：领取代金券 =====
async function claimVoucher() {
  const phone = $('inputPhone').value.trim();
  if (!/^1\d{10}$/.test(phone)) { toast('请输入正确的手机号'); return; }
  try {
    const data = await callProxy('createVoucher', { phone });
    appData.currentPhone = phone;
    appData.currentVoucherCode = data.voucher_code;
    localStorage.setItem('recharge_session', JSON.stringify({ phone, voucher: data.voucher_code }));
    $('voucherStatusArea').innerHTML = '<span style="color:#0096D6;font-weight:600;">✅ 已领取：' + escapeHtml(data.voucher_code) + '</span>';
    $('btnNext').disabled = false;
    toast('领取成功');
  } catch(e) {
    if (e.message && e.message.indexOf('已领取') >= 0) {
      try {
        const data = await callProxy('getVoucher', { phone });
        appData.currentPhone = phone;
        appData.currentVoucherCode = data.voucher_code;
        localStorage.setItem('recharge_session', JSON.stringify({ phone, voucher: data.voucher_code }));
        $('voucherStatusArea').innerHTML = '<span style="color:#0096D6;font-weight:600;">✅ 已领取：' + escapeHtml(data.voucher_code) + '</span>';
        $('btnNext').disabled = false;
      } catch(e2) { toast('领取失败：' + e2.message); }
    } else {
      toast('领取失败：' + e.message);
    }
  }
}

function goRecharge() {
  $('rechargePhone').value = appData.currentPhone;
  $('rechargeVoucherCode').value = appData.currentVoucherCode;
  showPage('pageRecharge');
  if (appData.settings.wechat_qr) updateQRDisplay();
}

// ===== 充值页：金额选择 =====
function initAmountOptions() {
  $all('.amount-card').forEach(card => {
    card.addEventListener('click', () => {
      $all('.amount-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      appData.selectedAmount = parseInt(card.dataset.amount, 10);
      appData.selectedDiscount = parseInt(card.dataset.discount, 10);
      updateCalc();
    });
  });
}

function updateCalc() {
  const amount = appData.selectedAmount;
  const discount = appData.selectedDiscount;
  const actual = Math.max(0, amount - discount);
  $('calcAmount').textContent = '¥' + amount;
  $('calcDiscount').textContent = '-¥' + discount;
  $('calcActual').textContent = '¥' + actual;
}

// ===== 充值页：二维码切换 =====
function initQRTabs() {
  $all('.qr-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $all('.qr-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const method = tab.dataset.method;
      const url = method === 'wechat' ? appData.settings.wechat_qr : appData.settings.alipay_qr;
      const qd = $('qrDisplay');
      qd.setAttribute('data-payment', method);
      if (url) { qd.innerHTML = '<img src="'+url+'" alt="收款码" style="width:100%;height:100%;object-fit:contain;">'; } else { qd.innerHTML = '<span class="qr-placeholder">请在后台设置'+(method==='wechat'?'微信':'支付宝')+'收款码</span>'; }
    });
  });
}

// ===== 充值页：上传支付截图 =====
function initUpload() {
  const area = $('uploadArea');
  const input = $('uploadInput');
  area.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      toast('上传中…');
      const data = await uploadFile(file);
      appData.uploadFileUrl = data.url;
      $('uploadPreview').src = data.url;
      $('uploadPreview').style.display = 'block';
      area.classList.add('has-image');
      toast('上传成功');
    } catch(e) { toast('上传失败：' + e.message); }
  });
}

async function uploadFile(file) {
  const form = new FormData();
  form.append('file', file);
  const resp = await fetch('/api?action=uploadFile', { method: 'POST', body: form });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data.data;
}

// ===== 充值页：提交订单 =====
async function submitOrder() {
  if (!appData.selectedAmount) { toast('请选择充值金额'); return; }
  if (!appData.uploadFileUrl) { toast('请上传付款截图'); return; }
  const contact = $('rechargeContact').value.trim();
  const payload = {
    phone: appData.currentPhone,
    voucher_code: appData.currentVoucherCode,
    amount: appData.selectedAmount,
    discount: appData.selectedDiscount,
    actual: Math.max(0, appData.selectedAmount - appData.selectedDiscount),
    payment_method: $('qrDisplay').getAttribute('data-payment') || 'wechat',
    proof_url: appData.uploadFileUrl,
    contact
  };
  try {
    const data = await callProxy('createOrder', payload);
    appData.currentOrder = data;
    showResult(data);
  } catch(e) { toast('提交失败：' + e.message); }
}

function showResult(order) {
  showPage('pageResult');
  $('resOrderId').textContent = order.order_id;
  $('resPhone').textContent = order.phone;
  $('resVoucherCode').textContent = order.voucher_code;
  $('resAmount').textContent = '¥' + order.amount;
  $('resDiscount').textContent = '-¥' + order.discount;
  $('resActual').textContent = '¥' + order.actual;
  const statusMap = { processing: ['⏳', '🟡 处理中…'], success: ['✅', '🟢 充值成功'], failed: ['❌', '🔴 失败'] };
  const st = statusMap[order.status] || statusMap.processing;
  $('resultIcon').textContent = st[0];
  $('resultStatus').textContent = st[1];
  $('resStatusCell').innerHTML = '<span class="status-badge status-' + order.status + '">' + st[1] + '</span>';
}

// ===== 订单查询 =====
function initQueryModal() {
  $('btnQuery').addEventListener('click', () => { $('queryModal').style.display = 'flex'; });
  $('btnCloseQuery').addEventListener('click', () => { $('queryModal').style.display = 'none'; });
  $('btnQuerySubmit').addEventListener('click', doQuery);
}

async function doQuery() {
  const phone = $('queryPhone').value.trim();
  if (!/^1\d{10}$/.test(phone)) { toast('请输入正确的手机号'); return; }
  try {
    const orders = await callProxy('getOrdersByPhone', { phone });
    const box = $('queryResult');
    if (!orders || !orders.length) { box.innerHTML = '<p style="color:#999;text-align:center;">暂无订单</p>'; return; }
    box.innerHTML = orders.map(o => {
      const sm = { processing: '🟡 处理中', success: '🟢 成功', failed: '🔴 失败' };
      return '<div class="order-item"><span class="order-id">' + escapeHtml(o.order_id) + '</span><span class="order-status">' + (sm[o.status] || '') + '</span><div>金额 ¥' + o.amount + ' · 实付 ¥' + o.actual + '</div></div>';
    }).join('');
  } catch(e) { toast('查询失败：' + e.message); }
}

// ===== 后台管理 =====
function initAdmin() {
  $('btnAdminLogin').addEventListener('click', adminLogin);
  $('btnAdminLogout').addEventListener('click', adminLogout);
  $all('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => switchAdminTab(tab.dataset.tab));
  });
  $('btnSaveService').addEventListener('click', saveService);
  $('btnSaveSite').addEventListener('click', saveSite);
  initAdminUpload();
}

function switchAdminTab(tab) {
  $all('.admin-tab').forEach(t => t.classList.remove('active'));
  const activeTab = document.querySelector('.admin-tab[data-tab="' + tab + '"]');
  if (activeTab) activeTab.classList.add('active');
  $all('.admin-panel').forEach(p => p.classList.remove('active'));
  const panel = $('adminPanel' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (panel) panel.classList.add('active');
  if (tab === 'orders') loadAdminOrders();
  if (tab === 'qrcodes') loadQRSettings();
  if (tab === 'service') loadServiceSettings();
  if (tab === 'site') loadSiteSettings();
}

async function adminLogin() {
  const pwd = $('adminPasswordInput').value;
  if (!pwd) { toast('请输入密码'); return; }
  try {
    const data = await callProxy('adminLogin', { password: pwd });
    appData.adminSession = data.token;
    localStorage.setItem('admin_session', data.token);
    $('adminLoginArea').style.display = 'none';
    $('adminContentArea').style.display = 'block';
    switchAdminTab('orders');
    toast('登录成功');
  } catch(e) { toast('登录失败：' + e.message); }
}

function adminLogout() {
  appData.adminSession = null;
  localStorage.removeItem('admin_session');
  $('adminLoginArea').style.display = 'block';
  $('adminContentArea').style.display = 'none';
}

async function loadAdminOrders() {
  try {
    const orders = await callProxy('getAllOrders');
    const body = $('orderTableBody');
    if (!orders || !orders.length) { body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;">暂无订单</td></tr>'; return; }
    body.innerHTML = orders.map(o => {
      const sm = { processing: 'processing', success: 'success', failed: 'failed' };
      const badge = '<span class="badge badge-' + (sm[o.status] || 'processing') + '">' + o.status + '</span>';
      const proof = o.proof_url ? '<a href="#" onclick="showModal(\'' + o.proof_url + '\');return false;">查看</a>' : '—';
      const ops = '<div class="order-actions"><select onchange="updateOrderStatus(\'' + o.order_id + '\',this.value)">' +
        '<option value="processing"' + (o.status === 'processing' ? ' selected' : '') + '>处理中</option>' +
        '<option value="success"' + (o.status === 'success' ? ' selected' : '') + '>成功</option>' +
        '<option value="failed"' + (o.status === 'failed' ? ' selected' : '') + '>失败</option>' +
        '</select></div>';
      return '<tr><td>' + escapeHtml(o.order_id) + '</td><td>' + escapeHtml(o.phone) + '</td><td>' + escapeHtml(o.voucher_code || '-') + '</td><td>¥' + o.amount + '</td><td>¥' + o.actual + '</td><td>' + badge + '</td><td>' + proof + ops + '</td></tr>';
    }).join('');
  } catch(e) { toast('加载订单失败：' + e.message); }
}

async function updateOrderStatus(orderId, status) {
  try {
    await callProxy('updateOrderStatus', { order_id: orderId, status });
    toast('已更新');
    loadAdminOrders();
  } catch(e) { toast('更新失败：' + e.message); }
}

function showModal(url) {
  $('modalImage').src = url;
  $('modalOverlay').style.display = 'flex';
}

// ===== 后台：收款码设置 =====
async function loadQRSettings() {
  const s = appData.settings;
  if (s.wechat_qr) { $('wechatQRPreview').src = s.wechat_qr; $('wechatQRStatus').textContent = '已设置'; }
  if (s.alipay_qr) { $('alipayQRPreview').src = s.alipay_qr; $('alipayQRStatus').textContent = '已设置'; }
}

function initAdminUpload() {
  bindAdminUpload('wechatQR', 'wechat_qr');
  bindAdminUpload('alipayQR', 'alipay_qr');
  bindAdminUpload('logo', 'logo');
  bindAdminUpload('banner', 'banner');
}

function bindAdminUpload(btnId, field) {
  const btn = $('btn' + btnId.charAt(0).toUpperCase() + btnId.slice(1));
  const input = $(btnId + 'Input');
  if (!btn || !input) return;
  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      toast('上传中…');
      const data = await uploadFile(file);
      appData.settings[field] = data.url;
      const statusEl = $(btnId + 'Status');
      if (statusEl) statusEl.textContent = '已设置';
      const preview = $(btnId + 'Preview');
      if (preview) preview.src = data.url;
      await callProxy('saveSettings', appData.settings);
      toast('已保存');
      applySettings();
    } catch(e) { toast('上传失败：' + e.message); }
  });
}

// ===== 后台：客服设置 =====
async function loadServiceSettings() {
  const s = appData.settings;
  $('csNameInput').value = s.cs_name || '';
  $('csLinkInput').value = s.cs_link || '';
}

async function saveService() {
  appData.settings.cs_name = $('csNameInput').value.trim();
  appData.settings.cs_link = $('csLinkInput').value.trim();
  try {
    await callProxy('saveSettings', appData.settings);
    toast('已保存');
    applySettings();
  } catch(e) { toast('保存失败：' + e.message); }
}

// ===== 后台：网站设置 =====
async function loadSiteSettings() {
  const s = appData.settings;
  $('siteNameInput').value = s.site_name || '';
  $('announcementInput').value = s.announcement || '';
  if (s.logo) $('logoPreview').src = s.logo;
  if (s.banner) $('bannerPreview').src = s.banner;
}

async function saveSite() {
  appData.settings.site_name = $('siteNameInput').value.trim();
  appData.settings.announcement = $('announcementInput').value.trim();
  const pwd = $('adminPwdInput').value;
  if (pwd) appData.settings.admin_password = pwd;
  try {
    await callProxy('saveSettings', appData.settings);
    $('adminPwdInput').value = '';
    toast('已保存');
    applySettings();
  } catch(e) { toast('保存失败：' + e.message); }
}

// ===== 绑定导航与启动 =====
function initNav() {
  $('btnHome').addEventListener('click', () => showPage('pageHome'));
  $('navSiteName').addEventListener('click', () => showPage('pageHome'));
  $('btnNext').addEventListener('click', goRecharge);
  $('btnClaim').addEventListener('click', claimVoucher);
  $('submitOrderBtn').addEventListener('click', submitOrder);
  $('btnBackHome').addEventListener('click', () => showPage('pageHome'));
  $('btnCloseModal').addEventListener('click', () => { $('modalOverlay').style.display = 'none'; });
  $('modalOverlay').addEventListener('click', (e) => { if (e.target === $('modalOverlay')) $('modalOverlay').style.display = 'none'; });
}

function showToast(msg){ toast(msg); }

function init() {
  initNav();
  initAmountOptions();
  initQRTabs();
  initUpload();
  initQueryModal();
  initAdmin();
  const savedAdmin = localStorage.getItem('admin_session');
  if (savedAdmin) { appData.adminSession = savedAdmin; }
  loadAllData();
}

document.addEventListener('DOMContentLoaded', init);
