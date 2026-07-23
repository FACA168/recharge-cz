// ---------- 后端代理调用（所有数据读写统一走 /api，前端不再直连数据库） ----------
const API_URL = '/api';

async function callProxy(action, data = null) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, data })
    });
    const result = await response.json();
    if (result.success) {
      return result.data;
    } else {
      throw new Error(result.error || '请求失败');
    }
  } catch (error) {
    console.error(`Proxy call failed (${action}):`, error);
    throw error;
  }
}

// 文件上传：前端把文件转 base64，发到 /api 的 uploadFile��由 Worker 用 service_role 写入 Storage
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function uploadFile(file, folder) {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const fileName = folder + '/' + Date.now() + '_' + Math.random().toString(36).substring(2,8) + '.' + ext;
  const base64 = await fileToBase64(file);
  const data = await callProxy('uploadFile', { fileName, contentType: file.type, base64 });
  if (!data || !data.publicUrl) throw new Error('上传未返回地址');
  return data.publicUrl;
}

// ---------- 全局数据 ----------
let appData = {
  settings: {
    site_name: '充值中心',
    logo: '',
    banner: '',
    announcement: '欢迎使用充值服务，代金券限量发放中！',
    wechat_qr: '',
    alipay_qr: '',
    cs_name: '在线客服',
    cs_link: '#'
  },
  orders: [],
  currentPhone: '',
  currentVoucherCode: ''
};

// ---------- 工具函数 ----------
function formatPhone(p) { return (p && p.length===11) ? p.substring(0,3)+'****'+p.substring(7) : (p||''); }
function generateVoucherCode() { let c='OC-'; for(let i=0;i<10;i++) c+='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.charAt(Math.floor(Math.random()*36)); return c; }
function generateOrderId() { const n=new Date(); const t=n.getFullYear()+String(n.getMonth()+1).padStart(2,'0')+String(n.getDate()).padStart(2,'0')+String(n.getHours()).padStart(2,'0')+String(n.getMinutes()).padStart(2,'0')+String(n.getSeconds()).padStart(2,'0'); return 'ORD'+t+Math.random().toString(36).substring(2,6).toUpperCase(); }
function showToast(m) { const e=document.querySelector('.toast'); if(e)e.remove(); const t=document.createElement('div'); t.className='toast'; t.textContent=m; document.body.appendChild(t); setTimeout(()=>t.remove(),2200); }
function $(id){ return document.getElementById(id); }
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&','<':'<','>':'>','"':'"',"'":'''}[c])); }

// ---------- 加载数据（全部走代理） ----------
async function loadAllData() {
  const lm = $('loadingMask');
  // 先显示首页，避免接口慢/失败导致永久转圈
  applySettings();
  showPage('pageHome');
  lm.style.display = 'none';

  const timeoutPromise = new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),5000));
  try {
    await Promise.race([
      (async() => {
        try {
          const settingsData = await callProxy('getSettings');
          if (settingsData) {
            appData.settings = { ...appData.settings, ...settingsData };
            applySettings();
          }
        } catch(e) {
          console.error('getSettings failed:', e);
        }
        try {
          const s = localStorage.getItem('recharge_session');
          if (s) {
            const ses = JSON.parse(s);
            appData.currentPhone = ses.phone || '';
            appData.currentVoucherCode = ses.voucher || '';
          }
        } catch(e) {}
        return 'success';
      })(),
      timeoutPromise
    ]);
  } catch(e) {
    console.error(e);
  }
}

function saveSession() {
  try { localStorage.setItem('recharge_session', JSON.stringify({phone:appData.currentPhone, voucher:appData.currentVoucherCode})); } catch(e) {}
}

function applySettings() {
  const s = appData.settings;
  $('navSiteName').textContent = s.site_name || '充值中心';
  document.title = s.site_name || '充值中心';
  $('announcementText').textContent = s.announcement || '';
  const lp = $('navLogoPlaceholder');
  if(s.logo) { lp.innerHTML = '<img class="logo-img" src="'+s.logo+'" style="width:38px;height:38px;border-radius:8px;object-fit:contain;">'; } else { lp.innerHTML = '⛽'; }
  const bw = $('homeBanner');
  if(s.banner) { bw.innerHTML = '<img src="'+s.banner+'" alt="Banner">'; } else { bw.innerHTML = '<span class="banner-placeholder">🎉 充值特惠 · 代金券限时领</span>'; }
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

function showPage(id) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const el = $(id); if(el) el.classList.add('active');
  window.scrollTo(0,0);
}

// ---------- 导航 ----------
function goToHome() {
  showPage('pageHome');
  $('inputPhone').value = '';
  $('voucherStatusArea').innerHTML = '<span style="color:#999;font-size:13px;">请输入手机号领取</span>';
  $('btnNext').disabled = true;
  appData.currentPhone = ''; appData.currentVoucherCode = '';
  saveSession();
}

function goToRecharge() {
  if(!appData.currentPhone || !appData.currentVoucherCode) { showToast('请先在首页领取代金券'); return; }
  $('rechargePhone').value = appData.currentPhone;
  $('rechargeVoucherCode').value = appData.currentVoucherCode;
  $('rechargeContact').value = '';
  document.querySelectorAll('#amountOptions .amount-card').forEach(c=>c.classList.remove('selected'));
  $('calcAmount').textContent = '¥0';
  $('calcDiscount').textContent = '-¥0';
  $('calcActual').textContent = '¥0';
  $('uploadPreview').style.display = 'none';
  $('uploadPreview').dataset.url = '';
  $('uploadArea').classList.remove('has-image');
  $('uploadArea').querySelector('.upload-icon').style.display = 'block';
  $('uploadArea').querySelector('.upload-text').textContent = '点击上传付款截图';
  $('qrDisplay').setAttribute('data-payment','wechat');
  document.querySelectorAll('#pageRecharge .qr-tab').forEach((t,i)=>t.classList.toggle('active',i===0));
  updateQRDisplay();
  showPage('pageRecharge');
}

// 后台入口（点击名称5次）
let clickCount = 0, clickTimer = null;
function initSiteNameClick() {
  const el = $('navSiteName');
  el.addEventListener('click', function() {
    clickCount++;
    if(clickCount === 1) { clickTimer = setTimeout(()=>{ clickCount = 0; }, 2000); }
    if(clickCount >= 5) { clearTimeout(clickTimer); clickCount = 0; goToAdmin(); showToast('🔐 已进入后台管理'); }
  });
}

// ---------- 领券 ----------
async function claimVoucher() {
  const phoneInput = $('inputPhone');
  const phone = phoneInput.value.replace(/\D/g,'').trim();
  if(!/^1[3-9]\d{9}$/.test(phone)) { showToast('请输入有效的11位手机号码'); phoneInput.focus(); return; }
  const statusArea = $('voucherStatusArea');
  const btnClaim = $('btnClaim');
  const btnNext = $('btnNext');
  btnClaim.disabled = true; btnClaim.textContent = '⏳ 正在查询…';
  statusArea.innerHTML = '<span style="color:#f09d00;font-size:13px;">🟡 正在查询…</span>';
  btnNext.disabled = true;
  try {
    const existing = await callProxy('getVoucher', { phone });
    let voucherCode;
    if(existing) {
      voucherCode = existing.code;
    } else {
      voucherCode = generateVoucherCode();
      await callProxy('createVoucher', { phone, code: voucherCode });
    }
    appData.currentPhone = phone;
    appData.currentVoucherCode = voucherCode;
    saveSession();
    statusArea.innerHTML = '<span style="color:#2e7d32;font-size:13px;font-weight:600;">🟢 查询完成</span>';
    btnClaim.disabled = false; btnClaim.textContent = '🎫 立即领取电子代金券';
    btnNext.disabled = false;
    showToast('✅ 代金券领取成功！');
  } catch(err) {
    console.error(err);
    showToast('❌ 领取失败：' + err.message);
    statusArea.innerHTML = '<span style="color:#c62828;font-size:13px;">🔴 查询失败，请重试</span>';
    btnClaim.disabled = false; btnClaim.textContent = '🎫 立即领取电子代金券';
  }
}

// ---------- 金额选择 ----------
function selectAmount(card) {
  document.querySelectorAll('#amountOptions .amount-card').forEach(c=>c.classList.remove('selected'));
  card.classList.add('selected');
  const amount = parseInt(card.getAttribute('data-amount'),10);
  const discount = parseInt(card.getAttribute('data-discount'),10);
  $('calcAmount').textContent = '¥'+amount;
  $('calcDiscount').textContent = '-¥'+discount;
  $('calcActual').textContent = '¥'+(amount-discount);
}

// ---------- 支付切换 ----------
function switchPayment(method, btn) {
  document.querySelectorAll('#pageRecharge .qr-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  $('qrDisplay').setAttribute('data-payment', method);
  updateQRDisplay();
}

// ---------- 上传截图（走代理上传，前端不碰 key） ----------
async function handleUpload(input) {
  const file = input.files[0];
  if(!file) return;
  if(!/^image\//.test(file.type)) { showToast('仅支持图片文件'); input.value=''; return; }
  if(file.size > 5*1024*1024) { showToast('图片不能超过5MB'); input.value=''; return; }
  try {
    const url = await uploadFile(file, 'uploads');
    const preview = $('uploadPreview');
    preview.src = url;
    preview.style.display = 'block';
    preview.dataset.url = url;
    $('uploadArea').classList.add('has-image');
    $('uploadArea').querySelector('.upload-icon').style.display = 'none';
    $('uploadArea').querySelector('.upload-text').textContent = '点击更换截图';
    showToast('✅ 截图上传成功');
  } catch(err) {
    console.error(err);
    showToast('❌ 上传失败：'+err.message);
  }
  input.value = '';
}

// ---------- 提交订单 ----------
async function submitOrder() {
  const phone = $('rechargePhone').value;
  const contact = $('rechargeContact').value.trim();
  const selectedCard = document.querySelector('#amountOptions .amount-card.selected');
  const uploadPreview = $('uploadPreview');
  if(!contact) { showToast('请填写联系人姓名'); return; }
  if(!selectedCard) { showToast('请选择充值金额'); return; }
  if(!uploadPreview.dataset.url) { showToast('请上传付款截图'); return; }
  const amount = parseInt(selectedCard.getAttribute('data-amount'),10);
  const discount = parseInt(selectedCard.getAttribute('data-discount'),10);
  const actual = amount - discount;
  const paymentMethod = $('qrDisplay').getAttribute('data-payment') || 'wechat';
  const orderId = generateOrderId();
  const order = {
    id: orderId,
    phone,
    contact,
    voucher_code: $('rechargeVoucherCode').value,
    recharge_amount: amount,
    voucher_discount: discount,
    actual_pay: actual,
    payment_method: paymentMethod,
    payment_screenshot: uploadPreview.dataset.url,
    status: 'processing'
  };
  try {
    await callProxy('createOrder', order);
    order.created_at = new Date().toISOString();
    showResultPage(order);
    showToast('✅ 订单提交成功！');
  } catch(err) {
    console.error(err);
    showToast('❌ 提交失败：' + err.message);
  }
}

function showResultPage(order) {
  $('resOrderId').textContent = order.id;
  $('resPhone').textContent = formatPhone(order.phone);
  $('resVoucherCode').textContent = order.voucher_code;
  $('resAmount').textContent = '¥'+order.recharge_amount;
  $('resDiscount').textContent = '-¥'+order.voucher_discount;
  $('resActual').textContent = '¥'+order.actual_pay;
  $('resStatusCell').innerHTML = '<span class="status-badge status-processing">🟡 处理中…</span>';
  $('resultIcon').textContent = '⏳';
  $('resultStatus').textContent = '🟡 处理中…';
  showPage('pageResult');
}

// ---------- 订单查询（前台） ----------
function showQueryModal() {
  $('queryModal').style.display = 'flex';
  $('queryPhone').value = '';
  $('queryResult').innerHTML = '';
}
function closeQueryModal() { $('queryModal').style.display = 'none'; }
async function queryOrders() {
  const phone = $('queryPhone').value.replace(/\D/g,'').trim();
  if(!phone) { showToast('请输入手机号'); return; }
  const resultDiv = $('queryResult');
  resultDiv.innerHTML = '<span style="color:#f09d00;">⏳ 查询中…</span>';
  try {
    const orders = await callProxy('getOrdersByPhone', { phone });
    if(!orders || orders.length === 0) {
      resultDiv.innerHTML = '<p style="color:#999;text-align:center;">暂无订单</p>';
      return;
    }
    const statusMap = {'processing':'🟡 处理中', 'failed':'🔴 失败', 'success':'🟢 成功'};
    let html = '<div style="max-height:300px;overflow-y:auto;">';
    orders.forEach(o => {
      html += `<div class="order-item">
        <div class="order-id">📦 ${escapeHtml(o.id)}</div>
        <div>金额：¥${o.actual_pay}　<span class="order-status">${statusMap[o.status]||escapeHtml(o.status)}</span></div>
        <div style="font-size:12px;color:#999;">${(o.created_at&&!isNaN(new Date(o.created_at)))?new Date(o.created_at).toLocaleString():''}</div>
      </div>`;
    });
    html += '</div>';
    resultDiv.innerHTML = html;
  } catch(err) {
    console.error(err);
    resultDiv.innerHTML = '<p style="color:#c62828;">❌ 查询失败：' + escapeHtml(err.message) + '</p>';
  }
}

// ---------- 后台管理 ----------
function goToAdmin() {
  showPage('pageAdmin');
  $('adminLoginArea').style.display = 'block';
  $('adminContentArea').style.display = 'none';
  $('adminPasswordInput').value = '';
}

async function adminLogin() {
  const pwd = $('adminPasswordInput').value;
  if(!pwd) { showToast('请输入密码'); return; }
  try {
    const res = await callProxy('adminLogin', { password: pwd });
    if(res && res.ok) {
      isAdmin = true;
      $('adminLoginArea').style.display = 'none';
      $('adminContentArea').style.display = 'block';
      await loadAdminOrders();
      loadQRSettings();
      loadServiceSettings();
      loadSiteSettings();
      showToast('✅ 登录成功');
    } else { showToast('❌ 密码错误'); }
  } catch(err) { showToast('❌ 验证失败，请检查网络'); }
}

let isAdmin = false;
function adminLogout() {
  isAdmin = false;
  $('adminLoginArea').style.display = 'block';
  $('adminContentArea').style.display = 'none';
}

function switchAdminTab(tabName, btn) {
  document.querySelectorAll('.admin-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.admin-panel').forEach(p=>p.classList.remove('active'));
  const panel = $('adminPanel'+tabName.charAt(0).toUpperCase()+tabName.slice(1));
  if(panel) panel.classList.add('active');
  if(tabName==='orders') renderOrderTable();
  if(tabName==='qrcodes') loadQRSettings();
  if(tabName==='service') loadServiceSettings();
  if(tabName==='site') loadSiteSettings();
}

async function loadAdminOrders() {
  try {
    const orders = await callProxy('getAllOrders');
    if (orders) {
      appData.orders = orders;
      renderOrderTable();
    }
  } catch(err) {
    showToast('加载订单失败：' + err.message);
  }
}

function renderOrderTable(filterText) {
  filterText = (filterText||'').toLowerCase();
  const tbody = $('orderTableBody');
  let orders = appData.orders || [];
  if(filterText) {
    orders = orders.filter(o => (o.id||'').toLowerCase().includes(filterText) || (o.phone||'').includes(filterText) || (o.voucher_code && o.voucher_code.toLowerCase().includes(filterText)));
  }
  if(!orders.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;">暂无订单</td></tr>';
    return;
  }
  const statusMap = {'processing':'🟡 处理中','failed':'🔴 失败','success':'🟢 成功'};
  const badgeMap = {'processing':'badge-processing','failed':'badge-failed','success':'badge-success'};
  tbody.innerHTML = orders.map(o => {
    const statusText = statusMap[o.status] || escapeHtml(o.status);
    const badgeClass = badgeMap[o.status] || '';
    return `<tr>
      <td title="${escapeHtml(o.id)}">${escapeHtml(o.id.substring(0,10))}…</td>
      <td>${formatPhone(o.phone)}</td>
      <td>${escapeHtml(o.voucher_code||'-')}</td>
      <td>¥${o.recharge_amount}</td>
      <td>¥${o.actual_pay}</td>
      <td><span class="badge ${badgeClass}">${statusText}</span></td>
      <td>
        <div class="order-actions">
          <button class="btn btn-sm btn-outline" data-act="view" data-id="${escapeHtml(o.id)}">查看凭证</button>
          <select data-act="status" data-id="${escapeHtml(o.id)}" style="font-size:11px;padding:5px;">
            <option value="">修改状态</option>
            <option value="processing" ${o.status==='processing'?'selected':''}>处理中</option>
            <option value="failed" ${o.status==='failed'?'selected':''}>充值失败</option>
            <option value="success" ${o.status==='success'?'selected':''}>充值成功</option>
          </select>
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function searchOrders() {
  renderOrderTable($('orderSearchInput').value.trim());
}

function viewPaymentScreenshot(orderId) {
  const order = (appData.orders||[]).find(o=>o.id===orderId);
  if(!order || !order.payment_screenshot) { showToast('暂无凭证'); return; }
  $('modalImage').src = order.payment_screenshot;
  $('modalOverlay').style.display = 'flex';
}

function closeModal() { $('modalOverlay').style.display = 'none'; }

async function changeOrderStatus(orderId, newStatus) {
  if(!newStatus) return;
  try {
    await callProxy('updateOrderStatus', { orderId, status: newStatus });
    const order = (appData.orders||[]).find(o=>o.id===orderId);
    if(order) order.status = newStatus;
    renderOrderTable($('orderSearchInput').value.trim());
    showToast('✅ 订单状态已更新');
  } catch(err) { showToast('❌ 更新失败：' + err.message); }
}

function loadQRSettings() {
  const w = appData.settings.wechat_qr;
  const a = appData.settings.alipay_qr;
  const we = $('wechatQRPreview'), weS = $('wechatQRStatus');
  if(w) { we.src = w; we.style.display = 'inline-block'; weS.textContent = '已设置'; } else { we.style.display = 'none'; weS.textContent = '未设置'; }
  const al = $('alipayQRPreview'), alS = $('alipayQRStatus');
  if(a) { al.src = a; al.style.display = 'inline-block'; alS.textContent = '已设置'; } else { al.style.display = 'none'; alS.textContent = '未设置'; }
}

async function saveQRCode(type, input) {
  const file = input.files[0];
  if(!file) return;
  if(!/^image\//.test(file.type)) { showToast('仅支持图片文件'); input.value=''; return; }
  if(file.size > 3*1024*1024) { showToast('图片不能超过3MB'); input.value=''; return; }
  try {
    const url = await uploadFile(file, 'qrcodes');
    const field = type==='wechat' ? 'wechat_qr' : 'alipay_qr';
    await callProxy('saveSettings', { [field]: url });
    appData.settings[field] = url;
    loadQRSettings();
    updateQRDisplay();
    showToast('✅ 收款码已更新');
  } catch(err) { showToast('❌ 上传失败：'+err.message); }
  input.value = '';
}

function loadServiceSettings() {
  $('csNameInput').value = appData.settings.cs_name || '';
  $('csLinkInput').value = appData.settings.cs_link || '';
}

async function saveServiceSettings() {
  const name = $('csNameInput').value.trim() || '在线客服';
  const link = $('csLinkInput').value.trim() || '#';
  try {
    await callProxy('saveSettings', { cs_name: name, cs_link: link });
    appData.settings.cs_name = name;
    appData.settings.cs_link = link;
    applySettings();
    showToast('✅ 客服设置已保存');
  } catch(err) { showToast('❌ 保存失败'); }
}

function loadSiteSettings() {
  $('siteNameInput').value = appData.settings.site_name || '';
  $('announcementInput').value = appData.settings.announcement || '';
  $('adminPwdInput').value = '';
  const logo = $('logoPreview');
  if(appData.settings.logo) { logo.src = appData.settings.logo; logo.style.display = 'inline-block'; } else { logo.style.display = 'none'; }
  const banner = $('bannerPreview');
  if(appData.settings.banner) { banner.src = appData.settings.banner; banner.style.display = 'inline-block'; } else { banner.style.display = 'none'; }
}

async function saveSiteImage(type, input) {
  const file = input.files[0];
  if(!file) return;
  if(!/^image\//.test(file.type)) { showToast('仅支持图片文件'); input.value=''; return; }
  if(file.size > 5*1024*1024) { showToast('图片不能超过5MB'); input.value=''; return; }
  try {
    const url = await uploadFile(file, 'site');
    const field = type==='logo' ? 'logo' : 'banner';
    await callProxy('saveSettings', { [field]: url });
    appData.settings[field] = url;
    loadSiteSettings();
    applySettings();
    showToast('✅ 图片已更新');
  } catch(err) { showToast('❌ 上传失败：'+err.message); }
  input.value = '';
}

async function saveSiteSettings() {
  const siteName = $('siteNameInput').value.trim() || '充值中心';
  const announcement = $('announcementInput').value.trim() || '欢迎使用充值服务';
  const newPwd = $('adminPwdInput').value;
  const updateObj = { site_name: siteName, announcement };
  if(newPwd) {
    if(newPwd.length < 6) { showToast('密码至少6位'); return; }
    updateObj.admin_password = newPwd;
  }
  try {
    await callProxy('saveSettings', updateObj);
    appData.settings.site_name = siteName;
    appData.settings.announcement = announcement;
    applySettings();
    loadSiteSettings();
    showToast('✅ 网站设置已保存');
  } catch(err) { showToast('❌ 保存失败'); }
}

// 自动刷新订单（后台，降频 + 仅可见时刷新）
let refreshIntervalId = null;
let pageVisible = true;
document.addEventListener('visibilitychange', () => { pageVisible = !document.hidden; });

function startAutoRefresh() {
  if(refreshIntervalId) clearInterval(refreshIntervalId);
  refreshIntervalId = setInterval(async function() {
    if(!pageVisible) return;
    const adminPage = $('pageAdmin');
    if(adminPage && adminPage.classList.contains('active')) {
      const ordersPanel = $('adminPanelOrders');
      if(ordersPanel && ordersPanel.classList.contains('active')) {
        try {
          const orders = await callProxy('getAllOrders');
          if(orders) {
            appData.orders = orders;
            renderOrderTable($('orderSearchInput').value.trim());
          }
        } catch(e) { /* 静默 */ }
      }
    }
  }, 8000);
}

// ---------- 事件绑定（全部使用 addEventListener，不依赖内联 onclick） ----------
function bindEvents() {
  $('btnHome').addEventListener('click', goToHome);
  $('btnQuery').addEventListener('click', showQueryModal);
  $('btnBackHome').addEventListener('click', goToHome);
  $('btnClaim').addEventListener('click', claimVoucher);
  $('btnNext').addEventListener('click', goToRecharge);
  $('submitOrderBtn').addEventListener('click', submitOrder);
  $('uploadArea').addEventListener('click', () => $('uploadInput').click());
  $('uploadInput').addEventListener('change', function(e) { handleUpload(this); });
  document.querySelectorAll('#amountOptions .amount-card').forEach(card => {
    card.addEventListener('click', function() { selectAmount(this); });
  });
  document.querySelectorAll('.qr-tab').forEach(btn => {
    btn.addEventListener('click', function() { switchPayment(this.dataset.method, this); });
  });

  $('queryModal').addEventListener('click', function(e){ if(e.target===this) closeQueryModal(); });
  $('modalOverlay').addEventListener('click', function(e){ if(e.target===this) closeModal(); });
  $('btnCloseQuery').addEventListener('click', closeQueryModal);
  $('btnCloseModal').addEventListener('click', closeModal);

  $('btnQuerySubmit').addEventListener('click', queryOrders);
  $('queryPhone').addEventListener('keydown', e=>{ if(e.key==='Enter') queryOrders(); });

  $('btnAdminLogin').addEventListener('click', adminLogin);
  $('adminPasswordInput').addEventListener('keydown', e=>{ if(e.key==='Enter') adminLogin(); });
  $('btnAdminLogout').addEventListener('click', adminLogout);
  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', function(){ switchAdminTab(this.dataset.tab, this); });
  });
  $('btnSearchOrders').addEventListener('click', searchOrders);
  $('orderSearchInput').addEventListener('keydown', e=>{ if(e.key==='Enter') searchOrders(); });

  $('orderTableBody').addEventListener('click', function(e){
    const btn = e.target.closest('button[data-act="view"]');
    if(btn) viewPaymentScreenshot(btn.dataset.id);
  });
  $('orderTableBody').addEventListener('change', function(e){
    const sel = e.target.closest('select[data-act="status"]');
    if(sel) changeOrderStatus(sel.dataset.id, sel.value);
  });

  $('btnWechatQR').addEventListener('click', ()=>$('wechatQRInput').click());
  $('btnAlipayQR').addEventListener('click', ()=>$('alipayQRInput').click());
  $('wechatQRInput').addEventListener('change', function(e){ saveQRCode('wechat', this); });
  $('alipayQRInput').addEventListener('change', function(e){ saveQRCode('alipay', this); });
  $('btnSaveService').addEventListener('click', saveServiceSettings);
  $('btnLogo').addEventListener('click', ()=>$('logoInput').click());
  $('btnBanner').addEventListener('click', ()=>$('bannerInput').click());
  $('logoInput').addEventListener('change', function(e){ saveSiteImage('logo', this); });
  $('bannerInput').addEventListener('change', function(e){ saveSiteImage('banner', this); });
  $('btnSaveSite').addEventListener('click', saveSiteSettings);

  ['inputPhone','queryPhone'].forEach(id=>{
    $(id).addEventListener('input', function(){ this.value = this.value.replace(/\D/g,'').slice(0,11); });
  });
}

// ---------- 初始化 ----------
window.addEventListener('DOMContentLoaded', function() {
  initSiteNameClick();
  bindEvents();
  loadAllData().then(() => {
    startAutoRefresh();
    if(window.location.hash === '#admin') { goToAdmin(); }
    console.log('✅ 充值系统已启动（运营版）');
  });
});
