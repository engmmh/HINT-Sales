// إعدادات الاتصال بـ Supabase
// الـ anon key مخصص للاستخدام داخل المتصفح، والحماية الفعلية من سياسات RLS في قاعدة البيانات.
// لا تضع هنا مفتاح service_role أبدًا.
window.HM_CONFIG = {
  SUPABASE_URL: "https://guorxzejmtvypiwxrogf.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1b3J4emVqbXR2eXBpd3hyb2dmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MzI2NjksImV4cCI6MjEwNTMwODY2OX0.o95p3N83NLU8ZKZG5LtwS95iR1W3eN03qixqjsnWk_8",
  // الدخول بكلمة سر فقط: الإيميل ثابت ومخفي عن المستخدم (لا يُرسل له أي بريد)
  LOGIN_EMAIL: "hm@example.com",
  // Supabase يشترط 6 خانات على الأقل، فبنضيف بادئة ولاحقة على كلمة السر اللي بتكتبها
  PW_PREFIX: "hm-",
  PW_SUFFIX: "-ufuq",
  ALERT_DAYS: 60,      // تنبيه لأي منتج باقي على انتهائه أقل من شهرين
  DANGER_DAYS: 30      // أحمر لأقل من شهر
};

(function () {
'use strict';

const C = window.HM_CONFIG;
const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
const app = document.getElementById('app');
const BUCKET = 'hm-photos';

/* ---------------- أدوات ---------------- */
function todayStr() { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function addDays(s, n) { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
const S = { user: null, profile: null, date: localStorage.getItem('hm_date') || todayStr(), brands: [], products: [], stores: [], brandBy: {}, prodBy: {}, storeBy: {}, logoUrls: {} };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const fmtDate = s => { if (!s) return ''; const [y, m, d] = s.split('-'); return d + '/' + m + '/' + y; };
function toNum(v) {
  v = String(v == null ? '' : v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٫,]/g, '.').trim();
  const n = Number(v); return isNaN(n) ? 0 : n;
}
const daysLeft = exp => Math.round((new Date(exp + 'T00:00:00') - new Date(S.date + 'T00:00:00')) / 864e5);
const $ = id => document.getElementById(id);
const val = id => { const e = $(id); return e ? e.value : ''; };
function on(id, ev, fn) { const e = $(id); if (e) e.addEventListener(ev, fn); }
let toastTimer;
function toast(msg, err) {
  const t = $('toast'); t.textContent = msg; t.className = 'toast no-print show' + (err ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = 'toast no-print', 3200);
}
function fail(e) {
  console.error(e);
  let m = e && e.message ? e.message : String(e);
  if (e && e.code === '23505') m = 'الاسم ده موجود بالفعل';
  else if (e && e.code === '23503') m = 'مينفعش، عليه بيانات مرتبطة';
  else if (/added_boxes|hm_collection|prod_date|shelf_months/i.test(m)) m = 'لازم تشغّل ملف الترقية SQL في Supabase الأول';
  toast('حصل خطأ: ' + m, true);
}
async function guard(btn, fn) {
  if (btn) btn.disabled = true;
  try { await fn(); } catch (e) { fail(e); } finally { if (btn) btn.disabled = false; }
}

const prodName = id => { const p = S.prodBy[id]; return p ? p.name : '؟'; };
const brandOfProd = id => { const p = S.prodBy[id]; return p ? S.brandBy[p.brand_id] : null; };
const storeName = id => { const s = S.storeBy[id]; return s ? s.name + (s.branch ? ' - ' + s.branch : '') : '؟'; };
function brandBadge(b) {
  if (!b) return '';
  return S.logoUrls[b.id] ? `<img class="blogo" src="${esc(S.logoUrls[b.id])}" alt="${esc(b.name)}">` : `<span class="bbadge">${esc(b.name)}</span>`;
}
function expChip(exp) {
  const d = daysLeft(exp); let cls = 'green', t = d + ' يوم';
  if (d < 0) { cls = 'dark'; t = 'منتهي'; } else if (d <= C.DANGER_DAYS) cls = 'red'; else if (d <= C.ALERT_DAYS) cls = 'orange';
  return `<span class="chip ${cls}">${t}</span>`;
}
function alertClass(exp) { const d = daysLeft(exp); return d < 0 ? 'dark' : d <= C.DANGER_DAYS ? 'red' : ''; }

/* ---------------- تواريخ المنتجات: إنتاج وانتهاء ---------------- */
function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();   // آخر يوم في الشهر الناتج
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}
const bt = (prod, exp) => (prod ? 'إنتاج ' + fmtDate(prod) + ' · ' : '') + 'انتهاء ' + fmtDate(exp);
// لما تكتب تاريخ الإنتاج وللمنتج مدة صلاحية: تاريخ الانتهاء بيتحسب تلقائي (وتقدر تعدله)
function autoExp(prodId, expId, pidFn, hintId, selId) {
  const apply = () => {
    const p = S.prodBy[pidFn()], m = p && Number(p.shelf_months) > 0 ? Number(p.shelf_months) : 0, pd = val(prodId), h = $(hintId);
    if (h) { h.style.display = m ? 'block' : 'none'; h.textContent = m ? `مدة صلاحية المنتج ${m} شهر: لما تكتب تاريخ الإنتاج بيتحسب الانتهاء تلقائي (وتقدر تعدله).` : ''; }
    if (m && pd) $(expId).value = addMonths(pd, m);
  };
  on(prodId, 'change', apply); on(prodId, 'input', apply);
  if (selId) on(selId, 'change', apply);
  apply();
}

function productOptions() {
  let h = '<option value="">اختر المنتج...</option>';
  for (const b of S.brands) {
    const ps = S.products.filter(p => p.brand_id === b.id && p.active);
    if (!ps.length) continue;
    h += `<optgroup label="${esc(b.name)}">` + ps.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('') + '</optgroup>';
  }
  return h;
}
function storeOptions() {
  return '<option value="">اختر المحل...</option>' + S.stores.filter(s => s.active).map(s => `<option value="${s.id}">${esc(s.name + (s.branch ? ' - ' + s.branch : ''))}</option>`).join('');
}
const needSetup = () => (!S.products.length || !S.stores.length)
  ? `<div class="card"><b>لسه محتاج تضيف بيانات:</b><div class="muted">${!S.products.length ? 'المنتجات ' : ''}${!S.stores.length ? 'المحلات ' : ''}— ضيفها من <a href="#/manage">المنتجات والمحلات</a>.</div></div>` : '';

/* ---------------- تحميل القوائم ---------------- */
async function loadLookups() {
  const [b, p, s] = await Promise.all([
    sb.from('hm_brands').select('*').order('id'),
    sb.from('hm_products').select('*').order('name'),
    sb.from('hm_stores').select('*').order('name')
  ]);
  const err = b.error || p.error || s.error; if (err) throw err;
  S.brands = b.data; S.products = p.data; S.stores = s.data;
  S.brandBy = Object.fromEntries(S.brands.map(x => [x.id, x]));
  S.prodBy = Object.fromEntries(S.products.map(x => [x.id, x]));
  S.storeBy = Object.fromEntries(S.stores.map(x => [x.id, x]));
  S.logoUrls = {};
  const withLogo = S.brands.filter(x => x.logo_path);
  if (withLogo.length) {
    const { data } = await sb.storage.from(BUCKET).createSignedUrls(withLogo.map(x => x.logo_path), 3600);
    (data || []).forEach(d => { const br = withLogo.find(x => x.logo_path === d.path); if (br && d.signedUrl) S.logoUrls[br.id] = d.signedUrl; });
  }
}

async function fetchAlerts() {
  const limit = addDays(S.date, C.ALERT_DAYS);
  const [a, b] = await Promise.all([
    sb.from('hm_store_stock').select('*').gt('current_boxes', 0).lte('expiry_date', limit).order('expiry_date'),
    sb.from('hm_stock').select('*').gt('available', 0).lte('expiry_date', limit).order('expiry_date')
  ]);
  if (a.error) throw a.error; if (b.error) throw b.error;
  return { stores: a.data, wh: b.data };
}

/* ---------------- أيقونات ومساعدات ---------------- */
const ICONS = {
  receive: '<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  dist: '<path d="M1 6h13v10H1z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  visit: '<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0"/><path d="M5 12v8h14v-8"/><path d="M10 20v-5h4v5"/>',
  alerts: '<path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 003.4 0"/>',
  stock: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  report: '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h6"/>',
  manage: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  sales: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  coll: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.01M18 12h.01"/>',
  refresh: '<path d="M21 12a9 9 0 11-3-6.7L21 8"/><path d="M21 3v5h-5"/>'
};
const icon = (n, s) => `<svg class="ico" width="${s || 24}" height="${s || 24}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

// قفل الجلسة: بعد 5 دقايق من ترك التطبيق أو الخمول يطلب كلمة السر من جديد
const IDLE_MS = 5 * 60 * 1000;
function touch() { try { localStorage.setItem('hm_last', String(Date.now())); } catch (e) { } }
function idleExpired() { let t = 0; try { t = +localStorage.getItem('hm_last') || 0; } catch (e) { } return !t || Date.now() - t > IDLE_MS; }

// نافذة إدخال بسيطة (تعديل الأسماء)
function modal(opts) {
  return new Promise(resolve => {
    const ov = document.createElement('div'); ov.className = 'ov no-print';
    ov.innerHTML = `<div class="mdl"><h3>${esc(opts.title)}</h3>` +
      opts.fields.map((f, i) => `<label class="lbl">${esc(f.label)}</label><input type="${f.type || 'text'}" id="mf${i}" value="${esc(f.value || '')}">`).join('') +
      `<div class="mact"><button class="btn primary" id="mok">${esc(opts.ok || 'حفظ')}</button><button class="btn" id="mno">إلغاء</button></div></div>`;
    document.body.appendChild(ov);
    const close = v => { ov.remove(); resolve(v); };
    ov.querySelector('#mok').onclick = () => close(opts.fields.map((f, i) => ov.querySelector('#mf' + i).value.trim()));
    ov.querySelector('#mno').onclick = () => close(null);
    ov.addEventListener('click', e => { if (e.target === ov) close(null); });
    ov.querySelector('#mf0').focus();
  });
}
async function countUse(table, col, id) {
  const { count, error } = await sb.from(table).select('id', { count: 'exact', head: true }).eq(col, id);
  if (error) throw error; return count || 0;
}
function niceMax(m) { const p = Math.pow(10, Math.floor(Math.log10(m))); const f = m / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }

/* ---------------- الهيكل العام ---------------- */
function page(title, body) {
  const home = !location.hash || location.hash === '#/home' || location.hash === '#/';
  app.innerHTML = `<header class="topbar no-print">
      ${home ? '<span></span>' : '<a class="back" href="#/home">→ الرئيسية</a>'}
      <div class="ttl">${esc(title)}</div>
      <button class="ghost" id="logout">خروج</button>
    </header>
    ${home ? '' : `<div class="datebar no-print"><span>تاريخ العمل: <b>${fmtDate(S.date)}</b></span><a href="#/home">تغيير</a></div>`}
    <main class="page">${body}</main>`;
  on('logout', 'click', async () => { await sb.auth.signOut({ scope: 'local' }); });
}

/* ---------------- تسجيل الدخول ---------------- */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredPrompt = e;
  document.querySelectorAll('.inst').forEach(b => b.style.display = 'block');
  document.querySelectorAll('.inst-hint').forEach(b => b.style.display = 'none');
});
window.addEventListener('appinstalled', () => { deferredPrompt = null; document.querySelectorAll('.inst,.inst-hint').forEach(b => b.style.display = 'none'); });
function installBlock() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return '';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const hint = ios
    ? 'لتثبيت التطبيق: اضغط زر المشاركة <b>⬆︎</b> ثم <b>إضافة إلى الشاشة الرئيسية</b>'
    : 'لتثبيته على الهاتف: افتح قائمة المتصفح <b>⋮</b> ثم <b>تثبيت التطبيق</b> أو <b>إضافة إلى الشاشة الرئيسية</b>';
  return `<button class="btn inst" style="display:${deferredPrompt ? 'block' : 'none'}">📲 تثبيت التطبيق على الهاتف</button>
    <div class="inst-hint" style="display:${deferredPrompt ? 'none' : 'block'}">${hint}</div>`;
}
function bindInstall() {
  document.querySelectorAll('button.inst').forEach(b => b.onclick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null;
    document.querySelectorAll('.inst').forEach(x => x.style.display = 'none');
  });
}
function viewLogin() {
  const A = window.HM_ASSETS || {};
  app.innerHTML = `<div class="loginwrap">
    <div class="logincard">
      <img class="llogo" src="${A.logo || ''}" alt="أفق">
      <div class="lco">شركة أفق الحروف التجارية</div>
      <div class="lco2">UFUQ AL-HOROUF COMMERCIAL</div>
      <div class="lsep"></div>
      <h1 class="lttl">تقارير المناديب</h1>
      <div class="pwbox">
        <input type="password" id="pw" inputmode="numeric" autocomplete="current-password" dir="ltr" placeholder="كلمة السر" autofocus>
        <button type="button" class="eye" id="eye" aria-label="إظهار كلمة السر">👁</button>
      </div>
      <button class="btn primary big" id="go">دخول</button>
      ${installBlock()}
    </div>
    <div class="lfoot">OUR BRANDS · M DEE - HINT - MLT - KIB</div>
  </div>`;
  const submit = () => guard($('go'), async () => {
    const pin = val('pw').trim();
    if (!pin) return toast('اكتب كلمة السر', true);
    const { data, error } = await sb.auth.signInWithPassword({ email: C.LOGIN_EMAIL, password: C.PW_PREFIX + pin + C.PW_SUFFIX });
    if (error) { toast(error.message.includes('Invalid') ? 'كلمة السر غلط' : error.message, true); return; }
    S.user = data.user; await afterLogin(); location.hash = '#/home'; route();
  });
  on('go', 'click', submit); on('pw', 'keydown', e => { if (e.key === 'Enter') submit(); });
  on('eye', 'click', () => { const i = $('pw'); i.type = i.type === 'password' ? 'text' : 'password'; });
  bindInstall();
}
function viewNoAccess() {
  app.innerHTML = `<div class="login"><div class="card"><h3>حسابك غير مفعّل</h3>
    <p class="muted">تم تسجيل الدخول، لكن الحساب ده لسه مش مضاف لموقع التقارير. اطلب من المسؤول إضافته.</p>
    <button class="btn" id="lo">تسجيل خروج</button></div></div>`;
  on('lo', 'click', () => sb.auth.signOut({ scope: 'local' }));
}
async function afterLogin() {
  touch();
  const { data, error } = await sb.from('hm_users').select('*').eq('user_id', S.user.id).maybeSingle();
  if (error) throw error;
  S.profile = data || null;
  if (S.profile) await loadLookups();
}

/* ---------------- الرئيسية: داش بورد مباشر ---------------- */
let homeTimer = null;
async function viewHome() {
  const tile = (r, ic, t, sub) => `<a class="tile2" href="#/${r}"><span class="tico">${icon(ic, 26)}</span><span class="ttxt"><b>${t}</b><small>${sub}</small></span></a>`;
  if (!S.range) S.range = 30;
  page('أفق - تقارير المناديب', `
    <div class="livebar"><span class="dot"></span><span>مباشر</span><span id="upd"></span>
      <button class="rbtn" id="rfr" aria-label="تحديث">${icon('refresh', 18)}</button></div>
    <div class="dateline"><label for="wd">تاريخ العمل</label><input type="date" id="wd" value="${S.date}"></div>
    <div class="kpis">
      <a class="kpi" href="#/stock"><span class="kic">${icon('stock', 22)}</span><b class="kv" id="k1v">–</b><span class="kl">مخزوني (بوكس)</span><small class="ks" id="k1s">&nbsp;</small></a>
      <a class="kpi" href="#/report"><span class="kic green">${icon('sales', 22)}</span><b class="kv" id="k2v">–</b><span class="kl">مبيع اليوم (بوكس)</span><small class="ks" id="k2s">&nbsp;</small></a>
      <a class="kpi" id="k3" href="#/alerts"><span class="kic red">${icon('alerts', 22)}</span><b class="kv" id="k3v">–</b><span class="kl">تنبيهات الصلاحية</span><small class="ks" id="k3s">&nbsp;</small></a>
    </div>
    <section class="card">
      <div class="chead"><h3>المبيع اليومي (بوكس)</h3>
        <div class="seg" id="seg"><button data-r="7" class="${S.range === 7 ? 'on' : ''}">7 أيام</button><button data-r="30" class="${S.range === 30 ? 'on' : ''}">30 يوم</button></div></div>
      <div class="ctip" id="ctip">&nbsp;</div>
      <div id="chart" class="chart"></div>
    </section>
    <section class="card" id="nearcard" style="display:none">
      <div class="chead"><h3>أقرب انتهاء صلاحية</h3><a href="#/alerts" class="lnk">عرض الكل</a></div><div id="near"></div>
    </section>
    <div class="tiles2">
      ${tile('receive', 'receive', 'استلام من المصنع', 'تسجيل الوارد بالبوكس')}
      ${tile('dist', 'dist', 'توزيع', 'على المحلات')}
      ${tile('visit', 'visit', 'زيارة', 'جرد المحل والمبيع')}
      ${tile('alerts', 'alerts', 'تنبيهات', 'قرب انتهاء الصلاحية')}
      ${tile('stock', 'stock', 'المخزون', 'الكميات والتواريخ')}
      ${tile('report', 'report', 'تقرير نهائي', 'PDF بتصميم الشركة')}
      ${tile('coll', 'coll', 'تحصيل المناديب', 'كشف PDF وExcel')}
      ${tile('manage', 'manage', 'المنتجات والمحلات', 'إضافة وتعديل ومسح')}
    </div>
    <div style="margin-top:14px">${installBlock()}</div>`);
  bindInstall();

  let cache = null, picked = S.date;
  const tip = (d, v) => { const el = $('ctip'); if (el) el.innerHTML = `<b>${fmtDate(d)}</b> — ${num(v)} بوكس`; };
  const drawChart = () => {
    const box = $('chart'); if (!box || !cache) return;
    const n = S.range, days = [];
    for (let i = n - 1; i >= 0; i--) days.push(addDays(S.date, -i));
    const vals = days.map(d => cache.daily[d] || 0);
    const top = niceMax(Math.max(...vals, 1));
    const W = 340, H = 160, pl = 26, pr = 6, pt = 10, pb = 22, bw = (W - pl - pr) / n, ph = H - pt - pb;
    let g = '', bars = '', lab = '';
    [0, 0.5, 1].forEach(f => {
      const y = H - pb - f * ph;
      g += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}"/><text x="${pl - 4}" y="${y + 3}" text-anchor="end">${num(top * f)}</text>`;
    });
    days.forEach((d, i) => {
      const h = vals[i] / top * ph, x = pl + i * bw, y = H - pb - h, sel = d === picked;
      bars += `<g class="bar${sel ? ' sel' : ''}" data-d="${d}" data-v="${vals[i]}"><rect x="${x}" y="${pt}" width="${bw}" height="${ph}" fill="transparent"/><rect x="${x + bw * 0.17}" y="${y}" width="${bw * 0.66}" height="${vals[i] > 0 ? Math.max(h, 2) : 0}" rx="${Math.min(4, bw * 0.3)}"/></g>`;
      const step = n <= 7 ? 1 : 6;
      if ((n - 1 - i) % step === 0) lab += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${d.slice(8)}/${d.slice(5, 7)}</text>`;
    });
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="المبيع اليومي">${g}${bars}${lab}</svg>`;
    tip(picked, cache.daily[picked] || 0);
  };
  const paint = () => {
    if (!cache || !$('k1v')) return;
    const c = cache;
    $('k1v').textContent = num(c.whBoxes); $('k1s').textContent = 'في المحلات: ' + num(c.stBoxes);
    let month = 0; Object.keys(c.daily).forEach(d => { if (d >= c.monthStart) month += c.daily[d]; });
    $('k2v').textContent = num(c.daily[S.date] || 0); $('k2s').textContent = 'الشهر: ' + num(month);
    const all = c.al.stores.map(r => Object.assign({ where: storeName(r.store_id) }, r)).concat(c.al.wh.map(r => Object.assign({ where: 'مخزون عندي' }, r)));
    const red = all.filter(r => daysLeft(r.expiry_date) <= C.DANGER_DAYS).length;
    $('k3v').textContent = all.length;
    $('k3s').textContent = all.length ? red + ' عاجل · ' + (all.length - red) + ' قريب' : 'كله تمام ✅';
    $('k3').classList.toggle('bad', red > 0);
    all.sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
    $('nearcard').style.display = all.length ? 'block' : 'none';
    $('near').innerHTML = all.slice(0, 3).map(r => `<a class="nr" href="#/alerts"><div>${brandBadge(brandOfProd(r.product_id))} <b>${esc(prodName(r.product_id))}</b><div class="muted">${esc(r.where)} · ${bt(r.prod_date, r.expiry_date)}</div></div>${expChip(r.expiry_date)}</a>`).join('');
    $('upd').textContent = 'آخر تحديث ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    drawChart();
  };
  const load = async () => {
    const monthStart = S.date.slice(0, 8) + '01', back = addDays(S.date, -29);
    const from = monthStart < back ? monthStart : back;
    const [wh, st, al, vs] = await Promise.all([
      sb.from('hm_stock').select('available').gt('available', 0),
      sb.from('hm_store_stock').select('current_boxes').gt('current_boxes', 0),
      fetchAlerts(),
      sb.from('hm_visits').select('visit_date, hm_visit_items(sold_boxes)').gte('visit_date', from).lte('visit_date', S.date)
    ]);
    for (const r of [wh, st, vs]) if (r.error) throw r.error;
    const sum = (a, f) => a.reduce((x, r) => x + Number(r[f]), 0), daily = {};
    vs.data.forEach(v => { daily[v.visit_date] = (daily[v.visit_date] || 0) + v.hm_visit_items.reduce((a, i) => a + Number(i.sold_boxes), 0); });
    cache = { whBoxes: sum(wh.data, 'available'), stBoxes: sum(st.data, 'current_boxes'), al, daily, monthStart };
    paint();
  };

  on('rfr', 'click', () => guard($('rfr'), load));
  on('wd', 'change', e => { if (e.target.value) { S.date = e.target.value; localStorage.setItem('hm_date', S.date); viewHome(); } });
  $('seg').onclick = e => { const b = e.target.closest('[data-r]'); if (!b) return; S.range = +b.dataset.r; $('seg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); drawChart(); };
  $('chart').onclick = e => {
    const g = e.target.closest('.bar'); if (!g) return;
    picked = g.dataset.d; $('chart').querySelectorAll('.bar').forEach(x => x.classList.toggle('sel', x === g)); tip(picked, +g.dataset.v);
  };
  S.refreshHome = () => load().catch(() => { });
  clearInterval(homeTimer);
  homeTimer = setInterval(() => { if (document.visibilityState === 'visible' && $('k1v')) S.refreshHome(); }, 60000);
  load().catch(fail);
}

/* ---------------- الاستلام من المصنع ---------------- */
async function viewReceive() {
  const lines = [];
  page('استلام من المصنع', `${needSetup()}
    <section class="card">
      <label class="lbl">المنتج</label><select id="rp">${productOptions()}</select>
      <div class="grid2">
        <div><label class="lbl">تاريخ الإنتاج (اختياري)</label><input type="date" id="rpd"></div>
        <div><label class="lbl">تاريخ الانتهاء</label><input type="date" id="re"></div>
      </div>
      <div class="muted" id="rhint" style="display:none"></div>
      <label class="lbl">الكمية (بوكس)</label><input type="text" inputmode="decimal" id="rb" placeholder="0">
      <button class="btn" id="radd">+ إضافة للقائمة</button>
    </section>
    <section class="card"><h3>قائمة الاستلام</h3><div id="rl"></div>
      <label class="lbl">ملاحظات (اختياري)</label><input type="text" id="rn">
      <button class="btn primary" id="rsave">حفظ الاستلام</button></section>
    <section class="card"><h3>استلامات يوم ${fmtDate(S.date)}</h3><div id="rday"></div></section>`);
  autoExp('rpd', 're', () => +val('rp'), 'rhint', 'rp');

  const renderLines = () => {
    $('rl').innerHTML = lines.length ? lines.map((l, i) => `<div class="row"><div>${brandBadge(brandOfProd(l.pid))} ${esc(prodName(l.pid))}<div class="muted">${bt(l.prod, l.exp)} · ${num(l.boxes)} بوكس</div></div><button class="btn small danger" data-i="${i}">حذف</button></div>`).join('') : '<div class="muted">لسه ما أضفتش أسطر</div>';
  };
  renderLines();
  $('rl').onclick = e => { const b = e.target.closest('[data-i]'); if (b) { lines.splice(+b.dataset.i, 1); renderLines(); } };
  on('radd', 'click', () => {
    const pid = +val('rp'), prod = val('rpd') || null, exp = val('re'), boxes = toNum(val('rb'));
    if (!pid) return toast('اختر المنتج', true);
    if (!exp) return toast('اكتب تاريخ الانتهاء', true);
    if (prod && prod > exp) return toast('تاريخ الإنتاج لازم يكون قبل تاريخ الانتهاء', true);
    if (!(boxes > 0)) return toast('اكتب الكمية بالبوكس', true);
    lines.push({ pid, prod, exp, boxes }); renderLines(); $('rb').value = ''; $('rb').focus();
  });
  on('rsave', 'click', () => guard($('rsave'), async () => {
    if (!lines.length) return toast('أضف سطرًا واحدًا على الأقل', true);
    const notes = val('rn').trim() || null;
    const { error } = await sb.from('hm_receipts').insert(lines.map(l => {
      const o = { receipt_date: S.date, product_id: l.pid, expiry_date: l.exp, boxes: l.boxes, notes };
      if (l.prod) o.prod_date = l.prod;          // لا نرسله إلا لو اتكتب (يحتاج ملف الترقية 2)
      return o;
    }));
    if (error) throw error;
    lines.length = 0; renderLines(); $('rn').value = ''; toast('تم حفظ الاستلام'); loadDay();
  }));
  async function loadDay() {
    const { data, error } = await sb.from('hm_receipts').select('*').eq('receipt_date', S.date).order('id');
    if (error) return fail(error);
    const el = $('rday'); if (!el) return;
    el.innerHTML = data.length ? data.map(r => `<div class="row"><div>${brandBadge(brandOfProd(r.product_id))} ${esc(prodName(r.product_id))}<div class="muted">${bt(r.prod_date, r.expiry_date)} · ${num(r.boxes)} بوكس</div></div><button class="btn small danger" data-del="${r.id}">حذف</button></div>`).join('') : '<div class="muted">لا يوجد استلام في هذا اليوم</div>';
    el.onclick = async e => {
      const b = e.target.closest('[data-del]'); if (!b || !confirm('حذف السطر ده؟ المخزون هيتعدل.')) return;
      const { error } = await sb.from('hm_receipts').delete().eq('id', b.dataset.del); if (error) return fail(error); loadDay();
    };
  }
  loadDay();
}

/* ---------------- التوزيع ---------------- */
async function viewDist() {
  const { data: st, error } = await sb.from('hm_stock').select('*').gt('available', 0).order('expiry_date');
  if (error) throw error;
  const lines = [];
  const same = (l, pid, prod, exp) => l.pid == pid && (l.prod || null) === (prod || null) && l.exp === exp;
  const availOrig = (pid, prod, exp) => { const r = st.find(x => x.product_id == pid && (x.prod_date || null) === (prod || null) && x.expiry_date === exp); return r ? Number(r.available) : 0; };
  const availNow = (pid, prod, exp) => availOrig(pid, prod, exp) - lines.filter(l => same(l, pid, prod, exp)).reduce((a, l) => a + l.boxes, 0);

  page('توزيع على المحلات', `${needSetup()}
    <section class="card">
      <label class="lbl">المحل</label><select id="ds">${storeOptions()}</select>
    </section>
    <section class="card">
      <label class="lbl">المنتج</label><select id="dp">${productOptions()}</select>
      <label class="lbl">الدفعة (تاريخ الإنتاج والانتهاء)</label><select id="dx"></select>
      <div id="dnw" style="display:none">
        <div class="grid2">
          <div><label class="lbl">تاريخ الإنتاج (اختياري)</label><input type="date" id="dnp"></div>
          <div><label class="lbl">تاريخ الانتهاء</label><input type="date" id="dn"></div>
        </div>
        <div class="muted" id="dhint" style="display:none"></div>
      </div>
      <label class="lbl">الكمية (بوكس)</label><input type="text" inputmode="decimal" id="db" placeholder="0">
      <button class="btn" id="dadd">+ إضافة (ممكن أكتر من منتج وأكتر من دفعة)</button>
    </section>
    <section class="card"><h3>أسطر التوزيع</h3><div id="dl"></div>
      <label class="lbl">ملاحظات (اختياري)</label><input type="text" id="dnt">
      <button class="btn primary" id="dsave">حفظ التوزيع</button></section>
    <section class="card"><h3>توزيعات يوم ${fmtDate(S.date)}</h3><div id="dday"></div></section>`);
  autoExp('dnp', 'dn', () => +val('dp'), 'dhint', 'dp');

  const fillExp = () => {
    const pid = val('dp'), rows = pid ? st.filter(x => x.product_id == pid) : [];
    $('dx').innerHTML = rows.map(r => `<option value="${(r.prod_date || '') + '|' + r.expiry_date}">${bt(r.prod_date, r.expiry_date)} — متاح ${num(availNow(pid, r.prod_date, r.expiry_date))} بوكس</option>`).join('') + (pid ? '<option value="__new">دفعة أخرى (أكتب التواريخ بنفسي)...</option>' : '');
    toggleNew();
  };
  const toggleNew = () => { $('dnw').style.display = val('dx') === '__new' ? 'block' : 'none'; };
  const renderLines = () => {
    $('dl').innerHTML = lines.length ? lines.map((l, i) => `<div class="row"><div>${brandBadge(brandOfProd(l.pid))} ${esc(prodName(l.pid))}<div class="muted">${bt(l.prod, l.exp)} · ${num(l.boxes)} بوكس</div></div><button class="btn small danger" data-i="${i}">حذف</button></div>`).join('') : '<div class="muted">لسه ما أضفتش أسطر</div>';
  };
  renderLines(); fillExp();
  on('dp', 'change', fillExp); on('dx', 'change', toggleNew);
  $('dl').onclick = e => { const b = e.target.closest('[data-i]'); if (b) { lines.splice(+b.dataset.i, 1); renderLines(); fillExp(); } };
  on('dadd', 'click', () => {
    const pid = +val('dp'), boxes = toNum(val('db'));
    let prod = null, exp = '';
    if (val('dx') === '__new') { prod = val('dnp') || null; exp = val('dn'); }
    else if (val('dx')) { const x = val('dx').split('|'); prod = x[0] || null; exp = x[1]; }
    if (!pid) return toast('اختر المنتج', true);
    if (!exp) return toast('اختر الدفعة أو اكتب تاريخ الانتهاء', true);
    if (prod && prod > exp) return toast('تاريخ الإنتاج لازم يكون قبل تاريخ الانتهاء', true);
    if (!(boxes > 0)) return toast('اكتب الكمية بالبوكس', true);
    lines.push({ pid, prod, exp, boxes }); renderLines(); $('db').value = ''; fillExp();
  });
  on('dsave', 'click', () => guard($('dsave'), async () => {
    const sid = +val('ds');
    if (!sid) return toast('اختر المحل', true);
    if (!lines.length) return toast('أضف سطرًا واحدًا على الأقل', true);
    const tot = {};
    lines.forEach(l => { const k = l.pid + '|' + (l.prod || '') + '|' + l.exp; tot[k] = (tot[k] || 0) + l.boxes; });
    const over = Object.keys(tot).filter(k => { const [p, pr, e] = k.split('|'); return tot[k] > availOrig(p, pr || null, e); });
    if (over.length && !confirm('في أسطر الكمية فيها أكبر من المتاح في مخزونك (أو دفعة غير مستلمة). تكمل؟')) return;
    const { data: h, error: e1 } = await sb.from('hm_distributions').insert({ dist_date: S.date, store_id: sid, notes: val('dnt').trim() || null }).select('id').single();
    if (e1) throw e1;
    const { error: e2 } = await sb.from('hm_distribution_items').insert(lines.map(l => {
      const o = { distribution_id: h.id, product_id: l.pid, expiry_date: l.exp, boxes: l.boxes };
      if (l.prod) o.prod_date = l.prod;
      return o;
    }));
    if (e2) { await sb.from('hm_distributions').delete().eq('id', h.id); throw e2; }
    toast('تم حفظ التوزيع'); viewDist();
  }));
  (async () => {
    const { data, error } = await sb.from('hm_distributions').select('*, hm_distribution_items(*)').eq('dist_date', S.date).order('id');
    if (error) return fail(error);
    const el = $('dday'); if (!el) return;
    el.innerHTML = data.length ? data.map(d => `<div class="item"><div class="top"><b>${esc(storeName(d.store_id))}</b><button class="btn small danger" data-del="${d.id}">حذف</button></div>${d.hm_distribution_items.map(i => `<div class="muted">${esc(prodName(i.product_id))} · ${bt(i.prod_date, i.expiry_date)} · ${num(i.boxes)} بوكس</div>`).join('')}</div>`).join('') : '<div class="muted">لا يوجد توزيع في هذا اليوم</div>';
    el.onclick = async e => {
      const b = e.target.closest('[data-del]'); if (!b || !confirm('حذف التوزيع ده؟ المخزون هيتعدل.')) return;
      const { error } = await sb.from('hm_distributions').delete().eq('id', b.dataset.del); if (error) return fail(error); viewDist();
    };
  })();
}

/* ---------------- الزيارة ---------------- */
async function viewVisit() {
  page('زيارة محل', `${needSetup()}
    <section class="card"><label class="lbl">اختر المحل</label><select id="vs">${storeOptions()}</select>
      <button class="btn primary" id="vgo">فتح المحل</button></section>
    <div id="vbody"></div>`);
  on('vgo', 'click', () => guard($('vgo'), async () => { const id = +val('vs'); if (!id) return toast('اختر المحل', true); await openStore(id); }));
}
async function compress(file, max = 1280, q = 0.72) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise(r => c.toBlob(r, 'image/jpeg', q));
}
async function openStore(storeId) {
  const { data, error } = await sb.from('hm_store_stock').select('*').eq('store_id', storeId).gt('current_boxes', 0).order('expiry_date');
  if (error) throw error;
  // كل صف: expected = المسجل في سجل المحل، added = صنف أضفته أثناء الزيارة (رصيد لقيته في المحل)
  const rows = data.map(r => ({ pid: r.product_id, prod: r.prod_date || null, exp: r.expiry_date, expected: Number(r.current_boxes), added: 0, isNew: false, rem: Number(r.current_boxes), ret: 0, dam: 0 }));
  const files = [];
  const box = $('vbody');
  const itemHtml = (r, i) => `<div class="item${r.isNew ? ' isnew' : ''}" data-i="${i}">
      <div class="top"><div>${brandBadge(brandOfProd(r.pid))} <b>${esc(prodName(r.pid))}</b>${r.added > 0 ? ' <span class="chip dark">مضاف في الزيارة</span>' : ''}<div class="muted">${bt(r.prod, r.exp)} ${expChip(r.exp)}</div></div>
      <div style="text-align:left"><div class="muted">${r.isNew ? 'الكمية المضافة' : 'المتوقع'}</div><b>${num(r.isNew ? r.added : r.expected)}</b>${!r.isNew && r.added > 0 ? `<div class="muted">+ مضاف ${num(r.added)}</div>` : ''}</div></div>
      <div class="grid3">
        <div><label class="lbl">الموجود</label><input type="text" inputmode="decimal" data-f="rem" value="${r.rem}"></div>
        <div><label class="lbl">مرتجع</label><input type="text" inputmode="decimal" data-f="ret" value="${r.ret}"></div>
        <div><label class="lbl">تالف</label><input type="text" inputmode="decimal" data-f="dam" value="${r.dam}"></div>
      </div>
      <div style="margin-top:6px;display:flex;justify-content:space-between;align-items:center"><span>المبيع: <span class="sold" data-sold>0</span> بوكس</span>${r.isNew ? `<button class="btn small danger" data-rm="${i}">حذف الصنف</button>` : ''}</div></div>`;
  box.innerHTML = `<section class="card">
      <div class="top" style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">${esc(storeName(storeId))}</h3><a href="#/store/${storeId}">سجل المحل</a></div>
      <div class="muted" id="vhint"></div>
      <div id="vitems"></div>
      <button class="btn" id="vaddtog">+ إضافة صنف موجود في المحل</button>
      <div id="vaddp" class="addp" style="display:none">
        <label class="lbl">المنتج</label><select id="ap">${productOptions()}</select>
        <div class="grid2">
          <div><label class="lbl">تاريخ الإنتاج (اختياري)</label><input type="date" id="apd"></div>
          <div><label class="lbl">تاريخ الانتهاء</label><input type="date" id="ae"></div>
        </div>
        <div class="muted" id="ahint" style="display:none"></div>
        <label class="lbl">الكمية (بوكس)</label><input type="text" inputmode="decimal" id="aq" placeholder="0">
        <div class="muted" id="adup" style="display:none"></div>
        <button class="btn primary" id="vadd">إضافة للقايمة</button>
        <div class="muted" style="margin-top:6px">الصنف بيتحفظ مع الزيارة ويفضل في سجل المحل، وبيظهر في التقرير. وبيتحسب مبيعه من الزيارة الجاية.</div>
      </div>
    </section>
    <section class="card">
      <label class="lbl">ملاحظات ومشاكل ومنتجات تحتاج متابعة أو استبدال</label><textarea id="vn"></textarea>
      <label class="lbl">صور (اختياري)</label><input type="file" id="vf" accept="image/*" multiple>
      <div class="thumbs" id="vt"></div>
      <button class="btn primary" id="vsave">حفظ الزيارة</button>
    </section>`;

  const calc = () => {
    let bad = false;
    box.querySelectorAll('.item').forEach(el => {
      const r = rows[+el.dataset.i];
      r.rem = toNum(el.querySelector('[data-f=rem]').value); r.ret = toNum(el.querySelector('[data-f=ret]').value); r.dam = toNum(el.querySelector('[data-f=dam]').value);
      r.sold = r.expected + r.added - r.rem - r.ret - r.dam;
      el.querySelector('[data-sold]').textContent = num(r.sold);
      const isBad = r.sold < 0 || r.rem < 0 || r.ret < 0 || r.dam < 0;
      el.classList.toggle('bad', isBad); bad = bad || isBad;
    });
    return !bad;
  };
  const renderItems = () => {
    $('vhint').textContent = rows.length ? 'سجّل الموجود فعليًا الآن، والمبيع بيتحسب تلقائي.' : 'مفيش بضاعة مسجلة في المحل ده. أضف الأصناف اللي لقيتها بالزرار اللي تحت، أو سجّل توزيعًا الأول.';
    $('vitems').innerHTML = rows.map(itemHtml).join('');
    calc();
  };
  box.addEventListener('input', e => { if (e.target.matches('[data-f]')) calc(); });
  renderItems();

  // ----- إضافة صنف موجود في المحل -----
  const checkDup = () => {
    const pid = +val('ap'), prod = val('apd') || null, exp = val('ae'), el = $('adup');
    const hit = pid && exp ? rows.find(r => r.pid === pid && (r.prod || null) === prod && r.exp === exp) : null;
    el.style.display = hit ? 'block' : 'none';
    if (hit) el.textContent = 'الصنف ده بنفس التواريخ موجود في القايمة. الكمية هتتضاف عليه كزيادة.';
  };
  on('vaddtog', 'click', () => { const p = $('vaddp'); p.style.display = p.style.display === 'none' ? 'block' : 'none'; });
  autoExp('apd', 'ae', () => +val('ap'), 'ahint', 'ap');
  on('ap', 'change', checkDup); on('apd', 'change', checkDup); on('apd', 'input', checkDup); on('ae', 'change', checkDup);
  on('vadd', 'click', () => {
    const pid = +val('ap'), prod = val('apd') || null, exp = val('ae'), q = toNum(val('aq'));
    if (!pid) return toast('اختر المنتج', true);
    if (!exp) return toast('اكتب تاريخ الانتهاء', true);
    if (prod && prod > exp) return toast('تاريخ الإنتاج لازم يكون قبل تاريخ الانتهاء', true);
    if (!(q > 0)) return toast('اكتب الكمية بالبوكس', true);
    calc();                                   // نحفظ اللي اتكتب قبل إعادة الرسم
    const hit = rows.find(r => r.pid === pid && (r.prod || null) === prod && r.exp === exp);
    if (hit) { hit.added += q; hit.rem += q; }
    else rows.push({ pid, prod, exp, expected: 0, added: q, isNew: true, rem: q, ret: 0, dam: 0 });
    renderItems(); $('aq').value = ''; $('adup').style.display = 'none';
    toast('تمت إضافة الصنف للزيارة');
  });
  $('vitems').addEventListener('click', e => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    calc(); rows.splice(+b.dataset.rm, 1); renderItems();
  });

  const renderThumbs = () => {
    $('vt').innerHTML = files.map((f, i) => `<div class="th"><img src="${URL.createObjectURL(f)}"><button data-x="${i}">×</button></div>`).join('');
  };
  $('vf').addEventListener('change', e => { files.push(...e.target.files); e.target.value = ''; renderThumbs(); });
  $('vt').onclick = e => { const b = e.target.closest('[data-x]'); if (b) { files.splice(+b.dataset.x, 1); renderThumbs(); } };
  $('vsave').addEventListener('click', () => guard($('vsave'), async () => {
    if (!calc()) return toast('في سطر الأرقام فيه غير منطقية (المبيع بالسالب). الموجود أكبر من المتوقع؟ أضفه كصنف موجود في المحل، أو سجّل توزيعًا بتاريخ سابق.', true);
    if (!rows.length && !val('vn').trim() && !files.length && !confirm('الزيارة فاضية. تحفظها كزيارة بس؟')) return;
    const { data: v, error: e1 } = await sb.from('hm_visits').insert({ visit_date: S.date, store_id: storeId, notes: val('vn').trim() || null }).select('id').single();
    if (e1) throw e1;
    if (rows.length) {
      const { error: e2 } = await sb.from('hm_visit_items').insert(rows.map(r => {
        const o = { visit_id: v.id, product_id: r.pid, expiry_date: r.exp, expected_boxes: r.expected, remaining_boxes: r.rem, returned_boxes: r.ret, damaged_boxes: r.dam };
        if (r.prod) o.prod_date = r.prod;               // لا نرسله إلا لو اتكتب (يحتاج ملف الترقية 2)
        if (r.added > 0) o.added_boxes = r.added;      // لا نرسله إلا لو فيه صنف مضاف (يحتاج ملف الترقية SQL)
        return o;
      }));
      if (e2) { await sb.from('hm_visits').delete().eq('id', v.id); throw e2; }
    }
    let failed = 0;
    for (const f of files) {
      try {
        const blob = await compress(f);
        const path = `visits/${v.id}/${crypto.randomUUID()}.jpg`;
        const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
        if (up.error) throw up.error;
        const ins = await sb.from('hm_photos').insert({ visit_id: v.id, path });
        if (ins.error) throw ins.error;
      } catch (err) { console.error(err); failed++; }
    }
    toast(failed ? `تم حفظ الزيارة، لكن ${failed} صورة ما اترفعتش` : 'تم حفظ الزيارة', !!failed);
    location.hash = '#/home';
  }));
}

/* ---------------- سجل المحل ---------------- */
async function viewStore(id) {
  id = +id;
  const [stk, ds, vs] = await Promise.all([
    sb.from('hm_store_stock').select('*').eq('store_id', id).gt('current_boxes', 0).order('expiry_date'),
    sb.from('hm_distributions').select('*, hm_distribution_items(*)').eq('store_id', id).order('dist_date', { ascending: false }).order('id', { ascending: false }),
    sb.from('hm_visits').select('*, hm_visit_items(*)').eq('store_id', id).order('visit_date', { ascending: false }).order('id', { ascending: false })
  ]);
  for (const r of [stk, ds, vs]) if (r.error) throw r.error;
  const tSold = vs.data.reduce((a, v) => a + v.hm_visit_items.reduce((b, i) => b + Number(i.sold_boxes), 0), 0);
  page(storeName(id), `
    <section class="card"><h3>الموجود حاليًا في المحل</h3>
      ${stk.data.length ? stk.data.map(r => `<div class="row"><div>${brandBadge(brandOfProd(r.product_id))} ${esc(prodName(r.product_id))}<div class="muted">${bt(r.prod_date, r.expiry_date)}</div></div><div>${num(r.current_boxes)} بوكس ${expChip(r.expiry_date)}</div></div>`).join('') : '<div class="muted">لا توجد بضاعة</div>'}
    </section>
    <section class="card"><h3>إجمالي المبيع المسجل: ${num(tSold)} بوكس</h3>
      <a class="btn primary" style="text-align:center;text-decoration:none" href="#/visit">زيارة جديدة</a></section>
    <section class="card"><h3>الزيارات</h3>
      ${vs.data.length ? vs.data.map(v => `<div class="item"><b>${fmtDate(v.visit_date)}</b>${v.hm_visit_items.map(i => `<div class="muted">${esc(prodName(i.product_id))} · ${bt(i.prod_date, i.expiry_date)} · موجود ${num(i.remaining_boxes)} · مبيع ${num(i.sold_boxes)}${Number(i.added_boxes) > 0 ? ' · مضاف ' + num(i.added_boxes) : ''}</div>`).join('')}${v.notes ? `<div>📝 ${esc(v.notes)}</div>` : ''}</div>`).join('') : '<div class="muted">لا توجد زيارات</div>'}
    </section>
    <section class="card"><h3>التوزيعات</h3>
      ${ds.data.length ? ds.data.map(d => `<div class="item"><b>${fmtDate(d.dist_date)}</b>${d.hm_distribution_items.map(i => `<div class="muted">${esc(prodName(i.product_id))} · ${bt(i.prod_date, i.expiry_date)} · ${num(i.boxes)} بوكس</div>`).join('')}</div>`).join('') : '<div class="muted">لا توجد توزيعات</div>'}
    </section>`);
}

/* ---------------- التنبيهات ---------------- */
async function viewAlerts() {
  const a = await fetchAlerts();
  const card = (r, where, qty) => `<div class="card alertcard ${alertClass(r.expiry_date)}">
      <div class="top" style="display:flex;justify-content:space-between;gap:8px">
        <div>${brandBadge(brandOfProd(r.product_id))} <b>${esc(prodName(r.product_id))}</b>
        <div class="muted">${esc(where)}</div><div class="muted">${bt(r.prod_date, r.expiry_date)} · ${num(qty)} بوكس</div></div>
        <div>${expChip(r.expiry_date)}</div></div></div>`;
  page('تنبيهات الصلاحية', `
    <div class="muted" style="margin-bottom:8px">أي منتج باقي على انتهائه أقل من ${C.ALERT_DAYS} يوم (محسوبة من ${fmtDate(S.date)}).</div>
    <h3>في المحلات (${a.stores.length})</h3>
    ${a.stores.length ? a.stores.map(r => card(r, 'المحل: ' + storeName(r.store_id), r.current_boxes)).join('') : '<div class="card muted">لا توجد تنبيهات في المحلات ✅</div>'}
    <h3>في مخزوني (${a.wh.length})</h3>
    ${a.wh.length ? a.wh.map(r => card(r, 'مخزون عندي', r.available)).join('') : '<div class="card muted">لا توجد تنبيهات في المخزون ✅</div>'}`);
}

/* ---------------- المخزون ---------------- */
async function viewStock() {
  const { data, error } = await sb.from('hm_stock').select('*').neq('available', 0).order('expiry_date');
  if (error) throw error;
  const by = {};
  data.forEach(r => { const p = S.prodBy[r.product_id]; const k = p ? p.brand_id : 0; (by[k] = by[k] || []).push(r); });
  const html = Object.keys(by).map(k => {
    const b = S.brandBy[k]; const tot = by[k].reduce((a, r) => a + Number(r.available), 0);
    return `<section class="card"><h3>${brandBadge(b)} ${esc(b ? b.name : '')} — ${num(tot)} بوكس</h3>` +
      by[k].map(r => `<div class="row"><div>${esc(prodName(r.product_id))}<div class="muted">${bt(r.prod_date, r.expiry_date)} ${expChip(r.expiry_date)}</div></div><b>${num(r.available)}</b></div>`).join('') + '</section>';
  }).join('');
  page('المخزون عندي', html || '<div class="card muted">المخزون فاضي. سجّل استلامًا من المصنع أولًا.</div>');
}

/* ---------------- التقرير النهائي ---------------- */
async function viewReport() {
  page('تقرير نهائي', `
    <section class="card no-print">
      <label class="lbl">تاريخ التقرير</label><input type="date" id="rd" value="${S.date}">
      <button class="btn primary" id="rgo">عرض التقرير</button>
    </section>
    <div id="rout"></div>`);
  on('rd', 'change', e => { if (e.target.value) { S.date = e.target.value; localStorage.setItem('hm_date', S.date); } });
  on('rgo', 'click', () => guard($('rgo'), async () => { S.date = val('rd') || S.date; localStorage.setItem('hm_date', S.date); await buildReport(); }));
  await buildReport();
}
async function buildReport() {
  const d = S.date;
  const [rc, ds, vs, al] = await Promise.all([
    sb.from('hm_receipts').select('*').eq('receipt_date', d).order('id'),
    sb.from('hm_distributions').select('*, hm_distribution_items(*)').eq('dist_date', d).order('id'),
    sb.from('hm_visits').select('*, hm_visit_items(*), hm_photos(*)').eq('visit_date', d).order('id'),
    fetchAlerts()
  ]);
  for (const r of [rc, ds, vs]) if (r.error) throw r.error;
  const paths = vs.data.flatMap(v => v.hm_photos.map(p => p.path));
  const urlBy = {};
  if (paths.length) {
    const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600);
    (data || []).forEach(x => { if (x.signedUrl) urlBy[x.path] = x.signedUrl; });
  }
  const sumSold = vs.data.reduce((a, v) => a + v.hm_visit_items.reduce((b, i) => b + Number(i.sold_boxes), 0), 0);
  const sumRc = rc.data.reduce((a, r) => a + Number(r.boxes), 0);
  const sumDs = ds.data.reduce((a, x) => a + x.hm_distribution_items.reduce((b, i) => b + Number(i.boxes), 0), 0);
  const nAlerts = al.stores.length + al.wh.length;
  const none = '<div>لا يوجد</div>';
  const th = a => '<tr>' + a.map(x => `<th>${x}</th>`).join('') + '</tr>';

  let h = `<div class="no-print" style="display:flex;gap:8px;margin-bottom:10px">
      <button class="btn primary" id="rprint" style="margin:0">🖨️ طباعة / حفظ PDF</button>
      <button class="btn" id="rwa" style="margin:0">واتساب (ملخص)</button></div>
    <div class="sheet" id="sheet"><table class="frame">
      <thead><tr><td><img class="lh" src="${(window.HM_ASSETS||{}).header || ''}" alt=""></td></tr></thead>
      <tfoot><tr><td><img class="lh" src="${(window.HM_ASSETS||{}).footer || ''}" alt=""></td></tr></tfoot>
      <tbody><tr><td><div class="body">
        <h1>تقرير يومي عن العمل</h1>
        <div class="meta"><span>التاريخ: <b>${fmtDate(d)}</b></span><span>المندوب: <b>${esc(S.profile.name)}</b></span></div>
        <div class="sum">
          <div><b>${vs.data.length}</b>محلات مزارة</div><div><b>${num(sumSold)}</b>مبيع (بوكس)</div>
          <div><b>${num(sumRc)} / ${num(sumDs)}</b>استلام / توزيع</div><div><b>${nAlerts}</b>تنبيهات صلاحية</div>
        </div>
        <h2>أولًا: المحلات التي تمت زيارتها وجرد المنتجات</h2>`;
  if (!vs.data.length) h += none;
  vs.data.forEach((v, n) => {
    const tot = v.hm_visit_items.reduce((a, i) => a + Number(i.sold_boxes), 0);
    h += `<h4>${n + 1}. ${esc(storeName(v.store_id))}</h4>`;
    if (v.hm_visit_items.length) {
      h += '<table class="t">' + th(['المنتج', 'الإنتاج', 'الانتهاء', 'المتوقع', 'الموجود', 'مرتجع', 'تالف', 'المبيع']) +
        v.hm_visit_items.map(i => {
          const cls = daysLeft(i.expiry_date) <= C.DANGER_DAYS ? 'crit' : daysLeft(i.expiry_date) <= C.ALERT_DAYS ? 'warn' : '';
          return `<tr class="${cls}"><td>${esc((brandOfProd(i.product_id) || {}).name || '')} ${esc(prodName(i.product_id))}${Number(i.added_boxes) > 0 ? ' <small>(مضاف في الزيارة)</small>' : ''}</td><td>${i.prod_date ? fmtDate(i.prod_date) : '-'}</td><td>${fmtDate(i.expiry_date)}</td><td>${num(i.expected_boxes)}${Number(i.added_boxes) > 0 ? `<br><small>+ ${num(i.added_boxes)} مضاف</small>` : ''}</td><td>${num(i.remaining_boxes)}</td><td>${num(i.returned_boxes)}</td><td>${num(i.damaged_boxes)}</td><td>${num(i.sold_boxes)}</td></tr>`;
        }).join('') + `<tr><td colspan="7"><b>إجمالي المبيع</b></td><td><b>${num(tot)}</b></td></tr></table>`;
    } else h += '<div class="muted">زيارة بدون جرد</div>';
    if (v.notes) h += `<div><b>ملاحظات:</b> ${esc(v.notes)}</div>`;
    if (v.hm_photos.length) h += '<div class="photos">' + v.hm_photos.map(p => urlBy[p.path] ? `<img src="${esc(urlBy[p.path])}" alt="">` : '').join('') + '</div>';
  });

  h += '<h2>ثانيًا: المنتجات القريبة من انتهاء الصلاحية</h2>';
  if (!nAlerts) h += none; else {
    h += '<table class="t">' + th(['الموقع', 'المنتج', 'الإنتاج', 'الانتهاء', 'المتبقي', 'الكمية']) +
      al.stores.map(r => `<tr class="${alertClass(r.expiry_date) ? 'crit' : 'warn'}"><td>${esc(storeName(r.store_id))}</td><td>${esc((brandOfProd(r.product_id) || {}).name || '')} ${esc(prodName(r.product_id))}</td><td>${r.prod_date ? fmtDate(r.prod_date) : '-'}</td><td>${fmtDate(r.expiry_date)}</td><td>${daysLeft(r.expiry_date) < 0 ? 'منتهي' : daysLeft(r.expiry_date) + ' يوم'}</td><td>${num(r.current_boxes)}</td></tr>`).join('') +
      al.wh.map(r => `<tr class="${alertClass(r.expiry_date) ? 'crit' : 'warn'}"><td>مخزون عندي</td><td>${esc((brandOfProd(r.product_id) || {}).name || '')} ${esc(prodName(r.product_id))}</td><td>${r.prod_date ? fmtDate(r.prod_date) : '-'}</td><td>${fmtDate(r.expiry_date)}</td><td>${daysLeft(r.expiry_date) < 0 ? 'منتهي' : daysLeft(r.expiry_date) + ' يوم'}</td><td>${num(r.available)}</td></tr>`).join('') + '</table>';
  }

  h += '<h2>ثالثًا: الاستلام من المصنع</h2>';
  h += rc.data.length ? '<table class="t">' + th(['المنتج', 'الإنتاج', 'الانتهاء', 'الكمية (بوكس)']) + rc.data.map(r => `<tr><td>${esc((brandOfProd(r.product_id) || {}).name || '')} ${esc(prodName(r.product_id))}</td><td>${r.prod_date ? fmtDate(r.prod_date) : '-'}</td><td>${fmtDate(r.expiry_date)}</td><td>${num(r.boxes)}</td></tr>`).join('') + '</table>' : none;

  h += '<h2>رابعًا: التوزيع على المحلات</h2>';
  h += ds.data.length ? '<table class="t">' + th(['المحل', 'المنتج', 'الإنتاج', 'الانتهاء', 'الكمية (بوكس)']) + ds.data.map(x => x.hm_distribution_items.map(i => `<tr><td>${esc(storeName(x.store_id))}</td><td>${esc((brandOfProd(i.product_id) || {}).name || '')} ${esc(prodName(i.product_id))}</td><td>${i.prod_date ? fmtDate(i.prod_date) : '-'}</td><td>${fmtDate(i.expiry_date)}</td><td>${num(i.boxes)}</td></tr>`).join('')).join('') + '</table>' : none;

  h += `<div class="sign"><div>اسم المندوب: ${esc(S.profile.name)}</div><div>التوقيع</div></div>
      </div></td></tr></tbody></table></div>`;
  $('rout').innerHTML = h;

  on('rprint', 'click', async () => {
    const imgs = [...document.querySelectorAll('#sheet img')];
    await Promise.all(imgs.map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; })));
    const old = document.title; document.title = 'تقرير-' + d; window.print(); document.title = old;
  });
  on('rwa', 'click', () => {
    const t = `تقرير يومي - ${fmtDate(d)}\nالمندوب: ${S.profile.name}\nالمحلات المزارة: ${vs.data.length}\n` +
      vs.data.map(v => '• ' + storeName(v.store_id)).join('\n') +
      `\nإجمالي المبيع: ${num(sumSold)} بوكس\nاستلام: ${num(sumRc)} | توزيع: ${num(sumDs)}\nتنبيهات الصلاحية: ${nAlerts}`;
    window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank');
  });
}

/* ---------------- الإدارة: منتجات ومحلات وبراندات ---------------- */
let manageTab = 'products';
async function viewManage() {
  const tabs = [['products', 'المنتجات'], ['stores', 'المحلات'], ['brands', 'البراندات']];
  let body = '';
  if (manageTab === 'products') {
    body = `<section class="card"><h3>إضافة منتج</h3>
      <label class="lbl">البراند</label><select id="mb">${S.brands.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select>
      <label class="lbl">اسم المنتج</label><input type="text" id="mn">
      <label class="lbl">مدة الصلاحية بالأشهر (اختياري، فاضي = يدوي)</label>
      <input type="text" inputmode="numeric" id="msh" placeholder="مثال: 6">
      <div class="chips" id="mchips">${[3, 6, 9, 12, 18, 24].map(n => `<button type="button" class="btn small" data-m="${n}">${n} أشهر</button>`).join('')}<button type="button" class="btn small" data-m="">يدوي</button></div>
      <div class="muted">لو حددت مدة، تاريخ الانتهاء بيتحسب تلقائي من تاريخ الإنتاج.</div>
      <button class="btn primary" id="madd">إضافة</button></section>
      <section class="card"><h3>المنتجات (${S.products.length})</h3>${S.products.map(p => `<div class="row ${p.active ? '' : 'dim'}"><div>${brandBadge(S.brandBy[p.brand_id])} ${esc(p.name)}${p.active ? '' : ' <span class="muted">(موقوف)</span>'}${Number(p.shelf_months) > 0 ? ` <span class="muted">· مدة ${p.shelf_months} شهر</span>` : ''}</div>
        <div class="acts"><button class="btn small" data-ep="${p.id}">تعديل</button><button class="btn small" data-tp="${p.id}">${p.active ? 'إيقاف' : 'تفعيل'}</button><button class="btn small danger" data-dp="${p.id}">مسح</button></div></div>`).join('') || '<div class="muted">لا توجد منتجات</div>'}</section>`;
  } else if (manageTab === 'stores') {
    body = `<section class="card"><h3>إضافة محل</h3>
      <label class="lbl">اسم المحل</label><input type="text" id="sn">
      <div class="grid2"><div><label class="lbl">الفرع</label><input type="text" id="sbr"></div><div><label class="lbl">المدينة</label><input type="text" id="sc"></div></div>
      <button class="btn primary" id="sadd">إضافة</button></section>
      <section class="card"><h3>المحلات (${S.stores.length})</h3>${S.stores.map(s => `<div class="row ${s.active ? '' : 'dim'}"><div><a href="#/store/${s.id}">${esc(s.name + (s.branch ? ' - ' + s.branch : ''))}</a>${s.active ? '' : ' <span class="muted">(موقوف)</span>'}</div>
        <div class="acts"><button class="btn small" data-es="${s.id}">تعديل</button><button class="btn small" data-ts="${s.id}">${s.active ? 'إيقاف' : 'تفعيل'}</button><button class="btn small danger" data-ds="${s.id}">مسح</button></div></div>`).join('') || '<div class="muted">لا توجد محلات</div>'}</section>`;
  } else {
    body = `<section class="card"><h3>البراندات وشعاراتها</h3><div class="muted">الشعار بيظهر في التنبيهات والتقارير.</div>
      ${S.brands.map(b => `<div class="row"><div>${brandBadge(b)} ${esc(b.name)}</div><div class="acts"><button class="btn small" data-eb="${b.id}">تعديل الاسم</button><label class="btn small" style="cursor:pointer">رفع شعار<input type="file" accept="image/*" data-bl="${b.id}" style="display:none"></label></div></div>`).join('')}</section>
      <section class="card"><h3>إضافة براند</h3><input type="text" id="bn" placeholder="اسم البراند"><button class="btn primary" id="badd">إضافة</button></section>`;
  }
  page('المنتجات والمحلات', `<div class="tabs">${tabs.map(t => `<button data-tab="${t[0]}" class="${manageTab === t[0] ? 'on' : ''}">${t[1]}</button>`).join('')}</div>${body}`);
  document.querySelector('.tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { manageTab = b.dataset.tab; viewManage(); } };
  const refresh = async () => { await loadLookups(); viewManage(); };

  if ($('mchips')) $('mchips').onclick = e => { const b = e.target.closest('[data-m]'); if (b) $('msh').value = b.dataset.m; };
  on('madd', 'click', () => guard($('madd'), async () => {
    const name = val('mn').trim(); if (!name) return toast('اكتب اسم المنتج', true);
    const sm = Math.round(toNum(val('msh')));
    if (val('msh').trim() && !(sm > 0 && sm <= 120)) return toast('مدة الصلاحية لازم تكون رقم من 1 إلى 120 شهر', true);
    const o = { brand_id: +val('mb'), name };
    if (sm > 0) o.shelf_months = sm;           // لا نرسله إلا لو اتحدد (يحتاج ملف الترقية 2)
    const { error } = await sb.from('hm_products').insert(o); if (error) throw error; toast('تمت الإضافة'); await refresh();
  }));
  on('sadd', 'click', () => guard($('sadd'), async () => {
    const name = val('sn').trim(); if (!name) return toast('اكتب اسم المحل', true);
    const { error } = await sb.from('hm_stores').insert({ name, branch: val('sbr').trim(), city: val('sc').trim() || null }); if (error) throw error; toast('تمت الإضافة'); await refresh();
  }));
  on('badd', 'click', () => guard($('badd'), async () => {
    const name = val('bn').trim(); if (!name) return toast('اكتب اسم البراند', true);
    const { error } = await sb.from('hm_brands').insert({ name }); if (error) throw error; toast('تمت الإضافة'); await refresh();
  }));

  // ----- تعديل -----
  document.querySelectorAll('[data-ep]').forEach(b => b.onclick = () => guard(b, async () => {
    const p = S.prodBy[b.dataset.ep];
    const r = await modal({ title: 'تعديل المنتج', fields: [{ label: 'اسم المنتج', value: p.name }, { label: 'مدة الصلاحية بالأشهر (فاضي = يدوي)', value: p.shelf_months || '' }] });
    if (!r) return; if (!r[0]) return toast('اكتب الاسم', true);
    const upd = { name: r[0] }, sm = r[1] === '' || r[1] == null ? null : Math.round(toNum(String(r[1])));
    if (sm !== null && !(sm > 0 && sm <= 120)) return toast('مدة الصلاحية لازم تكون رقم من 1 إلى 120', true);
    if ((sm || null) !== (p.shelf_months || null)) upd.shelf_months = sm;    // تغيير المدة لا يمس السجلات القديمة
    const { error } = await sb.from('hm_products').update(upd).eq('id', p.id); if (error) throw error; toast('تم التعديل'); await refresh();
  }));
  document.querySelectorAll('[data-es]').forEach(b => b.onclick = () => guard(b, async () => {
    const s = S.storeBy[b.dataset.es];
    const r = await modal({ title: 'تعديل المحل', fields: [{ label: 'اسم المحل', value: s.name }, { label: 'الفرع', value: s.branch }, { label: 'المدينة', value: s.city || '' }] });
    if (!r) return; if (!r[0]) return toast('اكتب اسم المحل', true);
    const { error } = await sb.from('hm_stores').update({ name: r[0], branch: r[1], city: r[2] || null }).eq('id', s.id); if (error) throw error; toast('تم التعديل'); await refresh();
  }));
  document.querySelectorAll('[data-eb]').forEach(b => b.onclick = () => guard(b, async () => {
    const br = S.brandBy[b.dataset.eb];
    const r = await modal({ title: 'تعديل اسم البراند', fields: [{ label: 'اسم البراند', value: br.name }] });
    if (!r) return; if (!r[0]) return toast('اكتب الاسم', true);
    const { error } = await sb.from('hm_brands').update({ name: r[0] }).eq('id', br.id); if (error) throw error; toast('تم التعديل'); await refresh();
  }));

  // ----- إيقاف / تفعيل -----
  document.querySelectorAll('[data-tp]').forEach(b => b.onclick = () => guard(b, async () => {
    const p = S.prodBy[b.dataset.tp]; const { error } = await sb.from('hm_products').update({ active: !p.active }).eq('id', p.id); if (error) throw error; await refresh();
  }));
  document.querySelectorAll('[data-ts]').forEach(b => b.onclick = () => guard(b, async () => {
    const s = S.storeBy[b.dataset.ts]; const { error } = await sb.from('hm_stores').update({ active: !s.active }).eq('id', s.id); if (error) throw error; await refresh();
  }));

  // ----- مسح (لو عليه حركة بيتوقف بدل ما يتمسح عشان السجلات القديمة) -----
  document.querySelectorAll('[data-dp]').forEach(b => b.onclick = () => guard(b, async () => {
    const p = S.prodBy[b.dataset.dp];
    const used = (await Promise.all([countUse('hm_receipts', 'product_id', p.id), countUse('hm_distribution_items', 'product_id', p.id), countUse('hm_visit_items', 'product_id', p.id)])).reduce((a, c) => a + c, 0);
    if (used > 0) {
      if (!confirm(`المنتج "${p.name}" عليه ${used} حركة مسجلة، فمش هينفع يتمسح نهائي عشان السجلات القديمة.\nتحب نوقفه بدل المسح؟ (مش هيظهر في القوائم الجديدة)`)) return;
      const { error } = await sb.from('hm_products').update({ active: false }).eq('id', p.id); if (error) throw error; toast('تم إيقاف المنتج');
    } else {
      if (!confirm(`مسح "${p.name}" نهائيًا؟`)) return;
      const { error } = await sb.from('hm_products').delete().eq('id', p.id); if (error) throw error; toast('تم المسح');
    }
    await refresh();
  }));
  document.querySelectorAll('[data-ds]').forEach(b => b.onclick = () => guard(b, async () => {
    const s = S.storeBy[b.dataset.ds], nm = s.name + (s.branch ? ' - ' + s.branch : '');
    const used = (await Promise.all([countUse('hm_distributions', 'store_id', s.id), countUse('hm_visits', 'store_id', s.id)])).reduce((a, c) => a + c, 0);
    if (used > 0) {
      if (!confirm(`المحل "${nm}" عليه ${used} حركة (توزيع أو زيارة)، فمش هينفع يتمسح نهائي عشان السجلات القديمة.\nتحب نوقفه بدل المسح؟ (مش هيظهر في القوائم الجديدة)`)) return;
      const { error } = await sb.from('hm_stores').update({ active: false }).eq('id', s.id); if (error) throw error; toast('تم إيقاف المحل');
    } else {
      if (!confirm(`مسح "${nm}" نهائيًا؟`)) return;
      const { error } = await sb.from('hm_stores').delete().eq('id', s.id); if (error) throw error; toast('تم المسح');
    }
    await refresh();
  }));

  document.querySelectorAll('[data-bl]').forEach(inp => inp.onchange = () => guard(null, async () => {
    const f = inp.files[0]; if (!f) return;
    const path = `brands/${inp.dataset.bl}-${Date.now()}.png`;
    const bmp = await createImageBitmap(f); const k = Math.min(1, 300 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/png' }); if (up.error) throw up.error;
    const { error } = await sb.from('hm_brands').update({ logo_path: path }).eq('id', +inp.dataset.bl); if (error) throw error;
    toast('تم رفع الشعار'); await refresh();
  }));
}

/* ---------------- تحصيل المناديب ---------------- */
const COLL_TITLE = 'شركة أوفق الحروف التجارية ( هنت | hint)';
const COLL_COLS = [13, 31.875, 21.875, 15.5, 13, 17.25, 13, 13, 13, 13];   // نفس عرض أعمدة ملف Excel الأصلي
const EXCELJS_URL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
const money = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const collTotal = rows => rows.reduce((a, r) => a + Number(r.amount || 0), 0);

function setPageMargin(on) {
  const old = document.getElementById('pgcoll'); if (old) old.remove();
  if (!on) return;
  const st = document.createElement('style'); st.id = 'pgcoll';
  st.textContent = '@media print{@page{size:A4 portrait;margin:8mm}}';
  document.head.appendChild(st);
}
function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.ExcelJS) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res;
    s.onerror = () => rej(new Error('تعذر تحميل مكتبة Excel، تأكد من الإنترنت وجرب تاني'));
    document.head.appendChild(s);
  });
}
function downloadBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const safeName = s => String(s).replace(/[\\/:*?"<>|\s]+/g, '-');

/* الجدول بنفس تصميم ملف Excel الأصلي (للمعاينة والطباعة PDF) */
function collTables(sh, rows) {
  const cg = '<colgroup>' + [13, 29.875, 24, 15.5, 13, 17.25, 13, 13, 13, 13].map(w => `<col style="width:${(w / 165.5 * 100).toFixed(3)}%">`).join('') + '</colgroup>';
  const top = `<table class="ct">${cg}
    <tr><td colspan="10" class="c1">${esc(sh.title)}</td></tr>
    <tr><td colspan="2" rowspan="3" class="crep">المندوب/ ${esc(sh.rep_name)}</td><td colspan="8" rowspan="5" class="ckind">${esc(sh.kind)}</td></tr>
    <tr></tr><tr></tr>
    <tr><td colspan="2" rowspan="2" class="cdate">تاريخ/ &nbsp; ${fmtDate(sh.coll_date)}</td></tr>
    <tr></tr></table>`;
  const amt = n => `<span dir="ltr" class="nw">${money(n)} <span dir="rtl">ر.س.</span></span>`;
  const body = rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.store_name)}</td><td>${amt(r.amount)}</td><td colspan="2">${esc(r.invoice_no || '')}</td><td>${esc(r.pay_date || '')}</td><td colspan="2">${esc(r.voucher_no || '')}</td><td colspan="2">${esc(r.pay_type || '')}</td></tr>`).join('');
  const data = `<table class="ct ctd">${cg}
    <thead><tr><th rowspan="2">م</th><th rowspan="2">اسم المحل</th><th colspan="8">بيانات</th></tr>
    <tr><th>المبلغ</th><th colspan="2">رقم الفاتورة</th><th>تاريخ</th><th colspan="2">رقم السند</th><th colspan="2">نوع السداد</th></tr></thead>
    <tbody>${body}<tr class="ctot"><td colspan="2">الإجمالي</td><td>${amt(collTotal(rows))}</td><td colspan="7"></td></tr></tbody></table>`;
  return top + data;
}

/* ملف Excel بنفس تنسيق الملف الأصلي: دمج الخلايا، الأعمدة، الحدود السميكة، الخط، تنسيق المبلغ والتاريخ */
function buildCollWorkbook(EX, sh, rows) {
  const wb = new EX.Workbook();
  wb.creator = 'أفق'; wb.created = new Date();
  const ws = wb.addWorksheet('ورقة1', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } }
  });
  COLL_COLS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const last = 8 + rows.length + 1;                       // آخر صف (الإجمالي)
  for (let r = 1; r <= last; r++) ws.getRow(r).height = 33.95;

  const TH = { style: 'thick', color: { argb: 'FF000000' } };
  const frame = { top: TH, left: TH, bottom: TH, right: TH };
  for (let r = 1; r <= last; r++) for (let c = 1; c <= 10; c++) {
    const cell = ws.getCell(r, c); cell.border = frame;
    cell.font = { name: 'Arial', bold: true, size: 16 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }
  const put = (addr, v, size, align) => {
    const c = ws.getCell(addr); c.value = v;
    c.font = { name: 'Arial', bold: true, size: size || 16 };
    c.alignment = { horizontal: align || 'center', vertical: 'middle', wrapText: true };
  };
  const dmy = fmtDate(sh.coll_date);

  ws.mergeCells('A1:J1'); put('A1', sh.title, 22);
  ws.mergeCells('A2:B4'); put('A2', 'المندوب/ ' + sh.rep_name, 16, 'right');
  ws.mergeCells('A5:B6'); put('A5', 'تاريخ/     ' + dmy, 16);
  ws.mergeCells('C2:J6'); put('C2', sh.kind, 20);
  ws.mergeCells('A7:A8'); put('A7', 'م');
  ws.mergeCells('B7:B8'); put('B7', 'اسم المحل');
  ws.mergeCells('C7:J7'); put('C7', 'بيانات');
  put('C8', 'المبلغ');
  ws.mergeCells('D8:E8'); put('D8', 'رقم الفاتورة');
  put('F8', 'تاريخ');
  ws.mergeCells('G8:H8'); put('G8', 'رقم السند');
  ws.mergeCells('I8:J8'); put('I8', 'نوع السداد');

  const AMT = '#,##0.00\\ "ر.س.‏"';
  const numOrText = v => { v = String(v == null ? '' : v).trim(); return /^\d+$/.test(v) ? Number(v) : (v || null); };
  rows.forEach((r, i) => {
    const n = 9 + i;
    ws.mergeCells(`D${n}:E${n}`); ws.mergeCells(`G${n}:H${n}`); ws.mergeCells(`I${n}:J${n}`);
    put('A' + n, i + 1);
    put('B' + n, r.store_name);
    put('C' + n, Number(r.amount || 0)); ws.getCell('C' + n).numFmt = AMT;
    ws.getCell('C' + n).alignment = { horizontal: 'center', vertical: 'middle', shrinkToFit: true };   // يمنع ظهور #### للمبالغ الكبيرة
    put('D' + n, numOrText(r.invoice_no));
    if (r.pay_date) { const [y, m, d] = r.pay_date.split('-').map(Number); put('F' + n, new Date(Date.UTC(y, m - 1, d))); ws.getCell('F' + n).numFmt = 'yyyy\\-mm\\-dd;@'; }
    put('G' + n, numOrText(r.voucher_no));
    put('I' + n, r.pay_type || null);
  });
  const t = last;
  ws.mergeCells(`A${t}:B${t}`); put('A' + t, 'الإجمالي');
  ws.getCell('C' + t).value = { formula: rows.length ? `SUM(C9:C${t - 1})` : '0', result: collTotal(rows) };
  ws.getCell('C' + t).numFmt = AMT;
  ws.getCell('C' + t).alignment = { horizontal: 'center', vertical: 'middle', shrinkToFit: true };
  ws.mergeCells(`D${t}:J${t}`);
  ws.pageSetup.printTitlesRow = '7:8';
  return wb;
}

/* ---- قائمة الكشوف + إنشاء كشف جديد ---- */
async function viewColl() {
  const { data, error } = await sb.from('hm_collections').select('*, hm_collection_rows(amount)').order('coll_date', { ascending: false }).order('id', { ascending: false }).limit(40);
  if (error) throw error;
  const reps = [...new Set(data.map(x => x.rep_name).filter(Boolean))];
  let lastRep = ''; try { lastRep = localStorage.getItem('hm_rep') || ''; } catch (e) { }
  page('تحصيل المناديب', `
    <section class="card"><h3>كشف تحصيل جديد</h3>
      <label class="lbl">تاريخ الكشف</label><input type="date" id="nd" value="${S.date}">
      <label class="lbl">المندوب</label><input type="text" id="nr" list="rl" value="${esc(lastRep || reps[0] || '')}" autocomplete="off">
      <datalist id="rl">${reps.map(r => `<option value="${esc(r)}">`).join('')}</datalist>
      <label class="lbl">نوع التحصيل</label><input type="text" id="nk" value="تحصيل كامل">
      <button class="btn primary" id="ncreate">إنشاء الكشف وبدء الإدخال</button>
    </section>
    <section class="card"><h3>الكشوف السابقة</h3>
      ${data.length ? data.map(c => { const n = c.hm_collection_rows.length, tot = c.hm_collection_rows.reduce((a, x) => a + Number(x.amount), 0);
        return `<a class="row crl" href="#/coll/${c.id}"><div><b>${fmtDate(c.coll_date)}</b> — ${esc(c.rep_name || 'بدون مندوب')}<div class="muted">${esc(c.kind)} · ${n} سطر</div></div><b>${money(tot)}</b></a>`; }).join('') : '<div class="muted">لا توجد كشوف بعد</div>'}
    </section>`);
  on('ncreate', 'click', () => guard($('ncreate'), async () => {
    const rep = val('nr').trim(), d = val('nd');
    if (!d) return toast('اختر التاريخ', true);
    if (!rep) return toast('اكتب اسم المندوب', true);
    const { data: c, error } = await sb.from('hm_collections').insert({ coll_date: d, rep_name: rep, kind: val('nk').trim() || 'تحصيل كامل', title: COLL_TITLE }).select('id').single();
    if (error) throw error;
    try { localStorage.setItem('hm_rep', rep); } catch (e) { }
    location.hash = '#/coll/' + c.id;
  }));
}

/* ---- كشف واحد: إدخال السطور + معاينة + تصدير ---- */
async function viewCollSheet(id) {
  id = +id;
  const [c, r, nm] = await Promise.all([
    sb.from('hm_collections').select('*').eq('id', id).maybeSingle(),
    sb.from('hm_collection_rows').select('*').eq('collection_id', id).order('line_no').order('id'),
    sb.from('hm_collection_rows').select('store_name').order('id', { ascending: false }).limit(300)
  ]);
  if (c.error) throw c.error; if (r.error) throw r.error;
  if (!c.data) { toast('الكشف مش موجود', true); location.hash = '#/coll'; return; }
  let sh = c.data, rows = r.data, editing = null;
  const names = [...new Set(S.stores.map(s => s.name + (s.branch ? ' ' + s.branch : '')).concat((nm.data || []).map(x => x.store_name)))].filter(Boolean);
  const nextVoucher = () => { for (let i = rows.length - 1; i >= 0; i--) { const v = String(rows[i].voucher_no || '').trim(); if (/^\d+$/.test(v)) return String(+v + 1); } return ''; };
  const lastOf = k => { for (let i = rows.length - 1; i >= 0; i--) if (rows[i][k]) return rows[i][k]; return ''; };

  const totalsHtml = () => {
    const by = {}; rows.forEach(x => { const k = (x.pay_type || 'غير محدد').trim(); by[k] = (by[k] || 0) + Number(x.amount); });
    return `<div class="ctotal"><span>إجمالي التحصيل</span><b>${money(collTotal(rows))}</b><small>ر.س.</small></div>
      <div class="muted">${rows.length} سطر</div>
      <div class="chips2">${Object.keys(by).map(k => `<span class="chip dark">${esc(k)}: ${money(by[k])}</span>`).join('')}</div>`;
  };
  const listHtml = () => rows.length ? rows.map((x, i) => `<div class="crow${editing === x.id ? ' editing' : ''}">
      <div class="cno">${i + 1}</div>
      <div class="cmain"><b>${esc(x.store_name)}</b><div class="muted">${[x.invoice_no ? 'فاتورة ' + esc(x.invoice_no) : '', esc(x.pay_date || ''), x.voucher_no ? 'سند ' + esc(x.voucher_no) : '', esc(x.pay_type || '')].filter(Boolean).join(' · ')}</div></div>
      <div class="camt">${money(x.amount)}</div>
      <div class="acts"><button class="btn small" data-ce="${x.id}">تعديل</button><button class="btn small danger" data-cx="${x.id}">مسح</button></div></div>`).join('') : '<div class="muted">لسه ما أضفتش سطور</div>';

  const resetForm = () => {
    editing = null;
    $('cftitle').textContent = 'إضافة سطر رقم ' + (rows.length + 1);
    $('cn').value = ''; $('ca').value = ''; $('ci').value = '';
    $('cd').value = lastOf('pay_date') || sh.coll_date; $('cv').value = nextVoucher(); $('cp').value = lastOf('pay_type');
    $('csave').textContent = 'إضافة السطر'; $('ccancel').style.display = 'none';
  };
  const fit = () => {
    const w = document.querySelector('.cwrap'), c = $('cprev'); if (!w || !c) return;
    const k = Math.min(1, (w.clientWidth - 16) / 720);
    c.style.transform = 'scale(' + k + ')'; w.style.height = Math.ceil(c.offsetHeight * k + 16) + 'px';
  };
  const paintRows = () => {
    $('clist').innerHTML = listHtml(); $('ctot').innerHTML = totalsHtml();
    $('cprev').innerHTML = collTables(sh, rows); fit();
  };
  window.onresize = () => fit();

  const draw = () => {
    document.title = 'تحصيل ' + sh.rep_name + ' ' + fmtDate(sh.coll_date);
    page('كشف التحصيل', `
      <section class="card no-print">
        <div class="chead"><h3>${esc(sh.kind)} — ${esc(sh.rep_name)}</h3><a class="lnk" href="#/coll">كل الكشوف</a></div>
        <div class="muted">تاريخ الكشف: <b>${fmtDate(sh.coll_date)}</b></div>
        <button class="btn small" id="cedit" style="margin-top:8px">تعديل بيانات الكشف</button>
      </section>
      <section class="card no-print"><h3 id="cftitle"></h3>
        <label class="lbl">اسم المحل</label><input type="text" id="cn" list="cdl" autocomplete="off">
        <datalist id="cdl">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        <div class="grid2">
          <div><label class="lbl">المبلغ</label><input type="text" inputmode="decimal" id="ca" placeholder="0.00"></div>
          <div><label class="lbl">نوع السداد</label><input type="text" id="cp" list="cpl" autocomplete="off"></div>
        </div>
        <datalist id="cpl"><option value="تحويل"><option value="شبكة"><option value="كاش"><option value="شيك"></datalist>
        <div class="chips2" id="cpt">${['تحويل', 'شبكة', 'كاش'].map(t => `<button type="button" class="btn small" data-pt="${t}">${t}</button>`).join('')}</div>
        <div class="grid2">
          <div><label class="lbl">رقم الفاتورة</label><input type="text" id="ci"></div>
          <div><label class="lbl">رقم السند (تلقائي — عدّله أو اضغط + / −)</label><div class="vstep"><button type="button" class="btn small" id="cvm">−</button><input type="text" inputmode="numeric" id="cv"><button type="button" class="btn small" id="cvp">+</button></div></div>
        </div>
        <label class="lbl">التاريخ</label><input type="date" id="cd">
        <button class="btn primary" id="csave">إضافة السطر</button>
        <button class="btn" id="ccancel" style="display:none">إلغاء التعديل</button>
      </section>
      <section class="card no-print"><h3>السطور</h3><div id="ctot"></div><div id="clist"></div></section>
      <section class="card no-print">
        <h3>التصدير</h3>
        <div class="grid2"><button class="btn primary" id="cpdf" style="margin:0">PDF</button><button class="btn primary" id="cxls" style="margin:0">Excel</button></div>
        <div class="muted" style="margin-top:6px">PDF بيفتح نافذة الطباعة: اختار "حفظ كـ PDF". وExcel بينزل ملف جاهز للتعديل.</div>
        <button class="btn danger" id="cdel">مسح الكشف كله</button>
      </section>
      <div class="muted no-print" style="margin:4px 4px 6px">معاينة الجدول (نفس شكل ملف الإكسيل):</div>
      <div class="cwrap"><div class="csheet" id="cprev"></div></div>`);
    setPageMargin(true);
    resetForm(); paintRows();

    on('cedit', 'click', () => guard($('cedit'), async () => {
      const v = await modal({ title: 'بيانات الكشف', fields: [
        { label: 'عنوان الجدول', value: sh.title }, { label: 'المندوب', value: sh.rep_name }, { label: 'نوع التحصيل', value: sh.kind }, { label: 'تاريخ الكشف', value: sh.coll_date, type: 'date' }] });
      if (!v) return; if (!v[1] || !v[3]) return toast('المندوب والتاريخ مطلوبين', true);
      const upd = { title: v[0] || COLL_TITLE, rep_name: v[1], kind: v[2] || 'تحصيل كامل', coll_date: v[3] };
      const { error } = await sb.from('hm_collections').update(upd).eq('id', id); if (error) throw error;
      Object.assign(sh, upd); draw(); toast('تم الحفظ');
    }));
    const stepV = d => { const v = toNum(val('cv')); const n = /^\d+$/.test(String(val('cv')).trim()) || val('cv').trim() === '' ? Math.max(0, (val('cv').trim() === '' ? (+nextVoucher() || 1) - d : v) + d) : null; if (n !== null) $('cv').value = String(n); };
    on('cvp', 'click', () => stepV(1)); on('cvm', 'click', () => stepV(-1));
    $('cpt').onclick = e => { const b = e.target.closest('[data-pt]'); if (b) $('cp').value = b.dataset.pt; };
    on('ccancel', 'click', () => { resetForm(); paintRows(); });
    on('csave', 'click', () => guard($('csave'), async () => {
      const name = val('cn').trim(), amount = toNum(val('ca'));
      if (!name) return toast('اكتب اسم المحل', true);
      if (!(amount > 0)) return toast('اكتب المبلغ', true);
      const rec = { store_name: name, amount, invoice_no: val('ci').trim() || null, pay_date: val('cd') || null, voucher_no: val('cv').trim() || null, pay_type: val('cp').trim() || null };
      if (editing) {
        const { error } = await sb.from('hm_collection_rows').update(rec).eq('id', editing); if (error) throw error;
        Object.assign(rows.find(x => x.id === editing), rec); toast('تم تعديل السطر');
      } else {
        const ln = rows.reduce((a, x) => Math.max(a, x.line_no || 0), 0) + 1;
        const { data: ins, error } = await sb.from('hm_collection_rows').insert(Object.assign({ collection_id: id, line_no: ln }, rec)).select().single();
        if (error) throw error; rows.push(ins); toast('تمت إضافة السطر');
      }
      resetForm(); paintRows(); $('cn').focus();
    }));
    $('clist').onclick = async e => {
      const be = e.target.closest('[data-ce]'), bx = e.target.closest('[data-cx]');
      if (be) {
        const x = rows.find(y => y.id == be.dataset.ce); editing = x.id;
        $('cftitle').textContent = 'تعديل السطر';
        $('cn').value = x.store_name; $('ca').value = x.amount; $('ci').value = x.invoice_no || ''; $('cd').value = x.pay_date || ''; $('cv').value = x.voucher_no || ''; $('cp').value = x.pay_type || '';
        $('csave').textContent = 'حفظ التعديل'; $('ccancel').style.display = 'block'; paintRows(); $('cn').scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (bx) {
        if (!confirm('مسح السطر ده؟')) return;
        const { error } = await sb.from('hm_collection_rows').delete().eq('id', bx.dataset.cx); if (error) return fail(error);
        rows = rows.filter(y => y.id != bx.dataset.cx); if (editing == bx.dataset.cx) resetForm(); paintRows(); toast('تم المسح');
      }
    };
    on('cpdf', 'click', () => { if (!rows.length) return toast('أضف سطور الأول', true); window.print(); });
    on('cxls', 'click', () => guard($('cxls'), async () => {
      if (!rows.length) return toast('أضف سطور الأول', true);
      toast('جاري تجهيز ملف Excel...');
      await loadScript(EXCELJS_URL);
      const wb = buildCollWorkbook(window.ExcelJS, sh, rows);
      const buf = await wb.xlsx.writeBuffer();
      downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `تحصيل-${safeName(sh.rep_name)}-${sh.coll_date}.xlsx`);
      toast('تم تنزيل ملف Excel');
    }));
    on('cdel', 'click', () => guard($('cdel'), async () => {
      if (!confirm('مسح الكشف بكل سطوره نهائيًا؟')) return;
      const { error } = await sb.from('hm_collections').delete().eq('id', id); if (error) throw error;
      toast('تم مسح الكشف'); location.hash = '#/coll';
    }));
  };
  draw();
}

/* ---------------- التوجيه ---------------- */
const routes = { home: viewHome, receive: viewReceive, dist: viewDist, visit: viewVisit, alerts: viewAlerts, report: viewReport, stock: viewStock, manage: viewManage, store: viewStore, coll: a => a ? viewCollSheet(a) : viewColl() };
async function route() {
  clearInterval(homeTimer); S.refreshHome = null;
  setPageMargin(false); document.title = 'أفق - تقارير المناديب';
  if (!S.user) return viewLogin();
  if (!S.profile) return viewNoAccess();
  const [name, arg] = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
  try { await (routes[name] || viewHome)(arg); } catch (e) { fail(e); }
  window.scrollTo(0, 0);
}

(async function init() {
  try {
    const { data } = await sb.auth.getSession();
    S.user = data.session ? data.session.user : null;
    // لو مرّ أكثر من 5 دقايق من آخر استخدام: نطلب كلمة السر من جديد
    if (S.user && idleExpired()) { await sb.auth.signOut({ scope: 'local' }); S.user = null; }
    if (S.user) await afterLogin();
  } catch (e) { fail(e); }
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') { S.user = null; S.profile = null; route(); } });
  window.addEventListener('hashchange', route);

  let lastTouch = 0;
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, () => {
    if (S.user && Date.now() - lastTouch > 5000) { lastTouch = Date.now(); touch(); }
  }, { passive: true }));
  setInterval(() => { if (S.user && document.visibilityState === 'visible') touch(); }, 20000);
  window.addEventListener('pagehide', () => { if (S.user) touch(); });
  document.addEventListener('visibilitychange', async () => {
    if (!S.user) return;
    if (document.visibilityState === 'hidden') { touch(); return; }
    if (idleExpired()) { await sb.auth.signOut({ scope: 'local' }); return; }
    touch(); if (S.refreshHome) S.refreshHome();
  });
  route();
})();

})();
