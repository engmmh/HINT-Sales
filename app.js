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
  const t = $('toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = 'toast', 3200);
}
function fail(e) { console.error(e); toast('حصل خطأ: ' + (e && e.message ? e.message : e), true); }
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

/* ---------------- الهيكل العام ---------------- */
function page(title, body) {
  const home = !location.hash || location.hash === '#/home' || location.hash === '#/';
  app.innerHTML = `<header class="topbar no-print">
      ${home ? '<span></span>' : '<a class="back" href="#/home">→ الرئيسية</a>'}
      <div class="ttl">${esc(title)}</div>
      <button class="ghost" id="logout">خروج</button>
    </header>
    <div class="datebar no-print"><span>تاريخ العمل: <b>${fmtDate(S.date)}</b></span><a href="#/home">تغيير</a></div>
    <main class="page">${body}</main>`;
  on('logout', 'click', async () => { await sb.auth.signOut(); });
}

/* ---------------- تسجيل الدخول ---------------- */
function viewLogin() {
  app.innerHTML = `<div class="login">
    <img src="assets/header.jpg" alt="شركة أفق الحروف التجارية">
    <div class="card">
      <h3>تسجيل الدخول</h3>
      <label class="lbl">كلمة السر</label><input type="password" id="pw" inputmode="numeric" autocomplete="current-password" dir="ltr" autofocus>
      <button class="btn primary" id="go">دخول</button>
    </div></div>`;
  const submit = () => guard($('go'), async () => {
    const pin = val('pw').trim();
    if (!pin) return toast('اكتب كلمة السر', true);
    const { data, error } = await sb.auth.signInWithPassword({ email: C.LOGIN_EMAIL, password: C.PW_PREFIX + pin + C.PW_SUFFIX });
    if (error) { toast(error.message.includes('Invalid') ? 'كلمة السر غلط' : error.message, true); return; }
    S.user = data.user; await afterLogin(); location.hash = '#/home'; route();
  });
  on('go', 'click', submit); on('pw', 'keydown', e => { if (e.key === 'Enter') submit(); });
}
function viewNoAccess() {
  app.innerHTML = `<div class="login"><div class="card"><h3>حسابك غير مفعّل</h3>
    <p class="muted">تم تسجيل الدخول، لكن الحساب ده لسه مش مضاف لموقع التقارير. اطلب من المسؤول إضافته.</p>
    <button class="btn" id="lo">تسجيل خروج</button></div></div>`;
  on('lo', 'click', () => sb.auth.signOut());
}
async function afterLogin() {
  const { data, error } = await sb.from('hm_users').select('*').eq('user_id', S.user.id).maybeSingle();
  if (error) throw error;
  S.profile = data || null;
  if (S.profile) await loadLookups();
}

/* ---------------- الرئيسية ---------------- */
async function viewHome() {
  const tile = (r, ic, t, extra) => `<a class="tile" href="#/${r}"><span class="ic">${ic}</span>${t}${extra || ''}</a>`;
  page('أفق - تقارير المناديب', `
    <section class="card">
      <label class="lbl">تاريخ العمل (السجلات والتقارير بتمشي بيه)</label>
      <input type="date" id="wd" value="${S.date}">
      <div class="muted" style="margin-top:6px">أهلًا ${esc(S.profile.name)}</div>
    </section>
    <div class="tiles">
      ${tile('receive', '📦', 'استلام من المصنع')}
      ${tile('dist', '🚚', 'توزيع')}
      ${tile('visit', '🏪', 'زيارة')}
      ${tile('alerts', '⏰', 'تنبيهات', '<b id="ab" class="nb"></b>')}
      ${tile('stock', '📊', 'المخزون')}
      ${tile('report', '📄', 'تقرير نهائي')}
      ${tile('manage', '⚙️', 'المنتجات والمحلات')}
    </div>`);
  on('wd', 'change', e => { if (e.target.value) { S.date = e.target.value; localStorage.setItem('hm_date', S.date); viewHome(); } });
  fetchAlerts().then(a => {
    const n = a.stores.length + a.wh.length, el = $('ab');
    if (el && n) { el.textContent = n; el.style.display = 'inline-block'; }
  }).catch(() => { });
}

/* ---------------- الاستلام من المصنع ---------------- */
async function viewReceive() {
  const lines = [];
  page('استلام من المصنع', `${needSetup()}
    <section class="card">
      <label class="lbl">المنتج</label><select id="rp">${productOptions()}</select>
      <div class="grid2">
        <div><label class="lbl">تاريخ الصلاحية</label><input type="date" id="re"></div>
        <div><label class="lbl">الكمية (بوكس)</label><input type="text" inputmode="decimal" id="rb" placeholder="0"></div>
      </div>
      <button class="btn" id="radd">+ إضافة للقائمة</button>
    </section>
    <section class="card"><h3>قائمة الاستلام</h3><div id="rl"></div>
      <label class="lbl">ملاحظات (اختياري)</label><input type="text" id="rn">
      <button class="btn primary" id="rsave">حفظ الاستلام</button></section>
    <section class="card"><h3>استلامات يوم ${fmtDate(S.date)}</h3><div id="rday"></div></section>`);

  const renderLines = () => {
    $('rl').innerHTML = lines.length ? lines.map((l, i) => `<div class="row"><div>${brandBadge(brandOfProd(l.pid))} ${esc(prodName(l.pid))}<div class="muted">صلاحية ${fmtDate(l.exp)} · ${num(l.boxes)} بوكس</div></div><button class="btn small danger" data-i="${i}">حذف</button></div>`).join('') : '<div class="muted">لسه ما أضفتش أسطر</div>';
  };
  renderLines();
  $('rl').onclick = e => { const b = e.target.closest('[data-i]'); if (b) { lines.splice(+b.dataset.i, 1); renderLines(); } };
  on('radd', 'click', () => {
    const pid = +val('rp'), exp = val('re'), boxes = toNum(val('rb'));
    if (!pid) return toast('اختر المنتج', true);
    if (!exp) return toast('اكتب تاريخ الصلاحية', true);
    if (!(boxes > 0)) return toast('اكتب الكمية بالبوكس', true);
    lines.push({ pid, exp, boxes }); renderLines(); $('rb').value = ''; $('rb').focus();
  });
  on('rsave', 'click', () => guard($('rsave'), async () => {
    if (!lines.length) return toast('أضف سطرًا واحدًا على الأقل', true);
    const notes = val('rn').trim() || null;
    const { error } = await sb.from('hm_receipts').insert(lines.map(l => ({ receipt_date: S.date, product_id: l.pid, expiry_date: l.exp, boxes: l.boxes, notes })));
    if (error) throw error;
    lines.length = 0; renderLines(); $('rn').value = ''; toast('تم حفظ الاستلام'); loadDay();
  }));
  async function loadDay() {
    const { data, error } = await sb.from('hm_receipts').select('*').eq('receipt_date', S.date).order('id');
    if (error) return fail(error);
    const el = $('rday'); if (!el) return;
    el.innerHTML = data.length ? data.map(r => `<div class="row"><div>${brandBadge(brandOfProd(r.product_id))} ${esc(prodName(r.product_id))}<div class="muted">صلاحية ${fmtDate(r.expiry_date)} · ${num(r.boxes)} بوكس</div></div><button class="btn small danger" data-del="${r.id}">حذف</button></div>`).join('') : '<div class="muted">لا يوجد استلام في هذا اليوم</div>';
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
  const availOrig = (pid, exp) => { const r = st.find(x => x.product_id == pid && x.expiry_date === exp); return r ? Number(r.available) : 0; };
  const availNow = (pid, exp) => availOrig(pid, exp) - lines.filter(l => l.pid == pid && l.exp === exp).reduce((a, l) => a + l.boxes, 0);

  page('توزيع على المحلات', `${needSetup()}
    <section class="card">
      <label class="lbl">المحل</label><select id="ds">${storeOptions()}</select>
    </section>
    <section class="card">
      <label class="lbl">المنتج</label><select id="dp">${productOptions()}</select>
      <label class="lbl">تاريخ الصلاحية</label><select id="dx"></select>
      <div id="dnw" style="display:none"><label class="lbl">اكتب التاريخ</label><input type="date" id="dn"></div>
      <label class="lbl">الكمية (بوكس)</label><input type="text" inputmode="decimal" id="db" placeholder="0">
      <button class="btn" id="dadd">+ إضافة (ممكن أكتر من منتج وأكتر من تاريخ)</button>
    </section>
    <section class="card"><h3>أسطر التوزيع</h3><div id="dl"></div>
      <label class="lbl">ملاحظات (اختياري)</label><input type="text" id="dnt">
      <button class="btn primary" id="dsave">حفظ التوزيع</button></section>
    <section class="card"><h3>توزيعات يوم ${fmtDate(S.date)}</h3><div id="dday"></div></section>`);

  const fillExp = () => {
    const pid = val('dp'), rows = pid ? st.filter(x => x.product_id == pid) : [];
    $('dx').innerHTML = rows.map(r => `<option value="${r.expiry_date}">${fmtDate(r.expiry_date)} — متاح ${num(availNow(pid, r.expiry_date))} بوكس</option>`).join('') + (pid ? '<option value="__new">تاريخ آخر (أكتبه بنفسي)...</option>' : '');
    toggleNew();
  };
  const toggleNew = () => { $('dnw').style.display = val('dx') === '__new' ? 'block' : 'none'; };
  const renderLines = () => {
    $('dl').innerHTML = lines.length ? lines.map((l, i) => `<div class="row"><div>${brandBadge(brandOfProd(l.pid))} ${esc(prodName(l.pid))}<div class="muted">صلاحية ${fmtDate(l.exp)} · ${num(l.boxes)} بوكس</div></div><button class="btn small danger" data-i="${i}">حذف</button></div>`).join('') : '<div class="muted">لسه ما أضفتش أسطر</div>';
  };
  renderLines(); fillExp();
  on('dp', 'change', fillExp); on('dx', 'change', toggleNew);
  $('dl').onclick = e => { const b = e.target.closest('[data-i]'); if (b) { lines.splice(+b.dataset.i, 1); renderLines(); fillExp(); } };
  on('dadd', 'click', () => {
    const pid = +val('dp'), boxes = toNum(val('db'));
    const exp = val('dx') === '__new' ? val('dn') : val('dx');
    if (!pid) return toast('اختر المنتج', true);
    if (!exp) return toast('اختر أو اكتب تاريخ الصلاحية', true);
    if (!(boxes > 0)) return toast('اكتب الكمية بالبوكس', true);
    lines.push({ pid, exp, boxes }); renderLines(); $('db').value = ''; fillExp();
  });
  on('dsave', 'click', () => guard($('dsave'), async () => {
    const sid = +val('ds');
    if (!sid) return toast('اختر المحل', true);
    if (!lines.length) return toast('أضف سطرًا واحدًا على الأقل', true);
    const tot = {};
    lines.forEach(l => { const k = l.pid + '|' + l.exp; tot[k] = (tot[k] || 0) + l.boxes; });
    const over = Object.keys(tot).filter(k => { const [p, e] = k.split('|'); return tot[k] > availOrig(p, e); });
    if (over.length && !confirm('في أسطر الكمية فيها أكبر من المتاح في مخزونك (أو تاريخ غير مستلم). تكمل؟')) return;
    const { data: h, error: e1 } = await sb.from('hm_distributions').insert({ dist_date: S.date, store_id: sid, notes: val('dnt').trim() || null }).select('id').single();
    if (e1) throw e1;
    const { error: e2 } = await sb.from('hm_distribution_items').insert(lines.map(l => ({ distribution_id: h.id, product_id: l.pid, expiry_date: l.exp, boxes: l.boxes })));
    if (e2) { await sb.from('hm_distributions').delete().eq('id', h.id); throw e2; }
    toast('تم حفظ التوزيع'); viewDist();
  }));
  (async () => {
    const { data, error } = await sb.from('hm_distributions').select('*, hm_distribution_items(*)').eq('dist_date', S.date).order('id');
    if (error) return fail(error);
    const el = $('dday'); if (!el) return;
    el.innerHTML = data.length ? data.map(d => `<div class="item"><div class="top"><b>${esc(storeName(d.store_id))}</b><button class="btn small danger" data-del="${d.id}">حذف</button></div>${d.hm_distribution_items.map(i => `<div class="muted">${esc(prodName(i.product_id))} · ${fmtDate(i.expiry_date)} · ${num(i.boxes)} بوكس</div>`).join('')}</div>`).join('') : '<div class="muted">لا يوجد توزيع في هذا اليوم</div>';
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
  const rows = data.map(r => ({ pid: r.product_id, exp: r.expiry_date, expected: Number(r.current_boxes) }));
  const files = [];
  const box = $('vbody');
  const itemHtml = (r, i) => `<div class="item" data-i="${i}">
      <div class="top"><div>${brandBadge(brandOfProd(r.pid))} <b>${esc(prodName(r.pid))}</b><div class="muted">صلاحية ${fmtDate(r.exp)} ${expChip(r.exp)}</div></div>
      <div style="text-align:left"><div class="muted">المتوقع</div><b>${num(r.expected)}</b></div></div>
      <div class="grid3">
        <div><label class="lbl">الموجود</label><input type="text" inputmode="decimal" data-f="rem" value="${r.expected}"></div>
        <div><label class="lbl">مرتجع</label><input type="text" inputmode="decimal" data-f="ret" value="0"></div>
        <div><label class="lbl">تالف</label><input type="text" inputmode="decimal" data-f="dam" value="0"></div>
      </div>
      <div style="margin-top:6px">المبيع: <span class="sold" data-sold>0</span> بوكس</div></div>`;
  box.innerHTML = `<section class="card">
      <div class="top" style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">${esc(storeName(storeId))}</h3><a href="#/store/${storeId}">سجل المحل</a></div>
      ${rows.length ? '<div class="muted">سجّل الموجود فعليًا الآن، والمبيع بيتحسب تلقائي.</div>' + rows.map(itemHtml).join('') : '<div class="muted" style="margin-top:8px">مفيش بضاعة مسجلة في المحل ده. سجّل توزيعًا أولًا (ولو لبضاعة قديمة اختر تاريخ توزيع سابق).</div>'}
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
      r.sold = r.expected - r.rem - r.ret - r.dam;
      el.querySelector('[data-sold]').textContent = num(r.sold);
      const isBad = r.sold < 0 || r.rem < 0 || r.ret < 0 || r.dam < 0;
      el.classList.toggle('bad', isBad); bad = bad || isBad;
    });
    return !bad;
  };
  box.addEventListener('input', e => { if (e.target.matches('[data-f]')) calc(); });
  calc();
  const renderThumbs = () => {
    $('vt').innerHTML = files.map((f, i) => `<div class="th"><img src="${URL.createObjectURL(f)}"><button data-x="${i}">×</button></div>`).join('');
  };
  $('vf').addEventListener('change', e => { files.push(...e.target.files); e.target.value = ''; renderThumbs(); });
  $('vt').onclick = e => { const b = e.target.closest('[data-x]'); if (b) { files.splice(+b.dataset.x, 1); renderThumbs(); } };
  $('vsave').addEventListener('click', () => guard($('vsave'), async () => {
    if (!calc()) return toast('في سطر الأرقام فيه غير منطقية (المبيع بالسالب). الموجود أكبر من المتوقع؟ سجّل توزيعًا بتاريخ سابق الأول.', true);
    if (!rows.length && !val('vn').trim() && !files.length && !confirm('الزيارة فاضية. تحفظها كزيارة بس؟')) return;
    const { data: v, error: e1 } = await sb.from('hm_visits').insert({ visit_date: S.date, store_id: storeId, notes: val('vn').trim() || null }).select('id').single();
    if (e1) throw e1;
    if (rows.length) {
      const { error: e2 } = await sb.from('hm_visit_items').insert(rows.map(r => ({ visit_id: v.id, product_id: r.pid, expiry_date: r.exp, expected_boxes: r.expected, remaining_boxes: r.rem, returned_boxes: r.ret, damaged_boxes: r.dam })));
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
      ${stk.data.length ? stk.data.map(r => `<div class="row"><div>${brandBadge(brandOfProd(r.product_id))} ${esc(prodName(r.product_id))}<div class="muted">صلاحية ${fmtDate(r.expiry_date)}</div></div><div>${num(r.current_boxes)} بوكس ${expChip(r.expiry_date)}</div></div>`).join('') : '<div class="muted">لا توجد بضاعة</div>'}
    </section>
    <section class="card"><h3>إجمالي المبيع المسجل: ${num(tSold)} بوكس</h3>
      <a class="btn primary" style="text-align:center;text-decoration:none" href="#/visit">زيارة جديدة</a></section>
    <section class="card"><h3>الزيارات</h3>
      ${vs.data.length ? vs.data.map(v => `<div class="item"><b>${fmtDate(v.visit_date)}</b>${v.hm_visit_items.map(i => `<div class="muted">${esc(prodName(i.product_id))} · ${fmtDate(i.expiry_date)} · موجود ${num(i.remaining_boxes)} · مبيع ${num(i.sold_boxes)}</div>`).join('')}${v.notes ? `<div>📝 ${esc(v.notes)}</div>` : ''}</div>`).join('') : '<div class="muted">لا توجد زيارات</div>'}
    </section>
    <section class="card"><h3>التوزيعات</h3>
      ${ds.data.length ? ds.data.map(d => `<div class="item"><b>${fmtDate(d.dist_date)}</b>${d.hm_distribution_items.map(i => `<div class="muted">${esc(prodName(i.product_id))} · ${fmtDate(i.expiry_date)} · ${num(i.boxes)} بوكس</div>`).join('')}</div>`).join('') : '<div class="muted">لا توجد توزيعات</div>'}
    </section>`);
}

/* ---------------- التنبيهات ---------------- */
async function viewAlerts() {
  const a = await fetchAlerts();
  const card = (r, where, qty) => `<div class="card alertcard ${alertClass(r.expiry_date)}">
      <div class="top" style="display:flex;justify-content:space-between;gap:8px">
        <div>${brandBadge(brandOfProd(r.product_id))} <b>${esc(prodName(r.product_id))}</b>
        <div class="muted">${esc(where)}</div><div class="muted">صلاحية ${fmtDate(r.expiry_date)} · ${num(qty)} بوكس</div></div>
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
      by[k].map(r => `<div class="row"><div>${esc(prodName(r.product_id))}<div class="muted">صلاحية ${fmtDate(r.expiry_date)} ${expChip(r.expiry_date)}</div></div><b>${num(r.available)}</b></div>`).join('') + '</section>';
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
      <thead><tr><td><img class="lh" src="assets/header.jpg" alt=""></td></tr></thead>
      <tfoot><tr><td><img class="lh" src="assets/footer.jpg" alt=""></td></tr></tfoot>
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
      h += '<table class="t">' + th(['المنتج', 'الصلاحية', 'المتوقع', 'الموجود', 'مرتجع', 'تالف', 'المبيع']) +
        v.hm_visit_items.map(i => {
          const cls = daysLeft(i.expiry_date) <= C.DANGER_DAYS ? 'crit' : daysLeft(i.expiry_date) <= C.ALERT_DAYS ? 'warn' : '';
          return `<tr class="${cls}"><td>${esc((brandOfProd(i.product_id) || {}).name || '')} ${esc(prodName(i.product_id))}</td><td>${fmtDate(i.expiry_date)}</td><td>${num(i.expected_boxes)}</td><td>${num(i.remaining_boxes)}</td><td>${num(i.returned_boxes)}</td><td>${num(i.damaged_boxes)}</td><td>${num(i.sold_boxes)}</td></tr>`;
        }).join('') + `<tr><td colspan="6"><b>إجمالي المبيع</b></td><td><b>${num(tot)}</b></td></tr></table>`;
    } else h += '<div class="muted">زيارة بدون جرد</div>';
    if (v.notes) h += `<div><b>ملاحظات:</b> ${esc(v.notes)}</div>`;
    if (v.hm_photos.length) h += '<div class="photos">' + v.hm_photos.map(p => urlBy[p.path] ? `<img src="${esc(urlBy[p.path])}" alt="">` : '').join('') + '</div>';
  });

  h += '<h2>ثانيًا: المنتجات القريبة من انتهاء الصلاحية</h2>';
  if (!nAlerts) h += none; else {
    h += '<table class="t">' + th(['الموقع', 'المنتج', 'الصلاحية', 'المتبقي', 'الكمية']) +
      al.stores.map(r => `<tr class="${alertClass(r.expiry_date) ? 'crit' : 'warn'}"><td>${esc(storeName(r.store_id))}</td><td>${esc((brandOfProd(r.product_id) || {}).name || '')} ${esc(prodName(r.product_id))}</td><td>${fmtDate(r.expiry_date)}</td><td>${daysLeft(r.expiry_date) < 0 ? 'منتهي' : daysLeft(r.expiry_date) + ' يوم'}</td><td>${num(r.current_boxes)}</td></tr>`).join('') +
      al.wh.map(r => `<tr class="${alertClass(r.expiry_date) ? 'crit' : 'warn'}"><td>مخزون عندي</td><td>${esc((brandOfProd(r.product_id) || {}).name || '')} ${esc(prodName(r.product_id))}</td><td>${fmtDate(r.expiry_date)}</td><td>${daysLeft(r.expiry_date) < 0 ? 'منتهي' : daysLeft(r.expiry_date) + ' يوم'}</td><td>${num(r.available)}</td></tr>`).join('') + '</table>';
  }

  h += '<h2>ثالثًا: الاستلام من المصنع</h2>';
  h += rc.data.length ? '<table class="t">' + th(['المنتج', 'الصلاحية', 'الكمية (بوكس)']) + rc.data.map(r => `<tr><td>${esc((brandOfProd(r.product_id) || {}).name || '')} ${esc(prodName(r.product_id))}</td><td>${fmtDate(r.expiry_date)}</td><td>${num(r.boxes)}</td></tr>`).join('') + '</table>' : none;

  h += '<h2>رابعًا: التوزيع على المحلات</h2>';
  h += ds.data.length ? '<table class="t">' + th(['المحل', 'المنتج', 'الصلاحية', 'الكمية (بوكس)']) + ds.data.map(x => x.hm_distribution_items.map(i => `<tr><td>${esc(storeName(x.store_id))}</td><td>${esc((brandOfProd(i.product_id) || {}).name || '')} ${esc(prodName(i.product_id))}</td><td>${fmtDate(i.expiry_date)}</td><td>${num(i.boxes)}</td></tr>`).join('')).join('') + '</table>' : none;

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
      <button class="btn primary" id="madd">إضافة</button></section>
      <section class="card"><h3>المنتجات (${S.products.length})</h3>${S.products.map(p => `<div class="row"><div>${brandBadge(S.brandBy[p.brand_id])} ${esc(p.name)}${p.active ? '' : ' <span class="muted">(موقوف)</span>'}</div><button class="btn small" data-tp="${p.id}">${p.active ? 'إيقاف' : 'تفعيل'}</button></div>`).join('') || '<div class="muted">لا توجد منتجات</div>'}</section>`;
  } else if (manageTab === 'stores') {
    body = `<section class="card"><h3>إضافة محل</h3>
      <label class="lbl">اسم المحل</label><input type="text" id="sn">
      <div class="grid2"><div><label class="lbl">الفرع</label><input type="text" id="sbr"></div><div><label class="lbl">المدينة</label><input type="text" id="sc"></div></div>
      <button class="btn primary" id="sadd">إضافة</button></section>
      <section class="card"><h3>المحلات (${S.stores.length})</h3>${S.stores.map(s => `<div class="row"><div><a href="#/store/${s.id}">${esc(s.name + (s.branch ? ' - ' + s.branch : ''))}</a>${s.active ? '' : ' <span class="muted">(موقوف)</span>'}</div><button class="btn small" data-ts="${s.id}">${s.active ? 'إيقاف' : 'تفعيل'}</button></div>`).join('') || '<div class="muted">لا توجد محلات</div>'}</section>`;
  } else {
    body = `<section class="card"><h3>شعارات البراندات</h3><div class="muted">الشعار بيظهر في التنبيهات والتقارير.</div>
      ${S.brands.map(b => `<div class="row"><div>${brandBadge(b)} ${esc(b.name)}</div><label class="btn small" style="cursor:pointer">رفع شعار<input type="file" accept="image/*" data-bl="${b.id}" style="display:none"></label></div>`).join('')}</section>
      <section class="card"><h3>إضافة براند</h3><input type="text" id="bn" placeholder="اسم البراند"><button class="btn primary" id="badd">إضافة</button></section>`;
  }
  page('المنتجات والمحلات', `<div class="tabs">${tabs.map(t => `<button data-tab="${t[0]}" class="${manageTab === t[0] ? 'on' : ''}">${t[1]}</button>`).join('')}</div>${body}`);
  document.querySelector('.tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { manageTab = b.dataset.tab; viewManage(); } };
  const refresh = async () => { await loadLookups(); viewManage(); };
  on('madd', 'click', () => guard($('madd'), async () => {
    const name = val('mn').trim(); if (!name) return toast('اكتب اسم المنتج', true);
    const { error } = await sb.from('hm_products').insert({ brand_id: +val('mb'), name }); if (error) throw error; toast('تمت الإضافة'); await refresh();
  }));
  on('sadd', 'click', () => guard($('sadd'), async () => {
    const name = val('sn').trim(); if (!name) return toast('اكتب اسم المحل', true);
    const { error } = await sb.from('hm_stores').insert({ name, branch: val('sbr').trim(), city: val('sc').trim() || null }); if (error) throw error; toast('تمت الإضافة'); await refresh();
  }));
  on('badd', 'click', () => guard($('badd'), async () => {
    const name = val('bn').trim(); if (!name) return toast('اكتب اسم البراند', true);
    const { error } = await sb.from('hm_brands').insert({ name }); if (error) throw error; toast('تمت الإضافة'); await refresh();
  }));
  document.querySelectorAll('[data-tp]').forEach(b => b.onclick = () => guard(b, async () => {
    const p = S.prodBy[b.dataset.tp]; const { error } = await sb.from('hm_products').update({ active: !p.active }).eq('id', p.id); if (error) throw error; await refresh();
  }));
  document.querySelectorAll('[data-ts]').forEach(b => b.onclick = () => guard(b, async () => {
    const s = S.storeBy[b.dataset.ts]; const { error } = await sb.from('hm_stores').update({ active: !s.active }).eq('id', s.id); if (error) throw error; await refresh();
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

/* ---------------- التوجيه ---------------- */
const routes = { home: viewHome, receive: viewReceive, dist: viewDist, visit: viewVisit, alerts: viewAlerts, report: viewReport, stock: viewStock, manage: viewManage, store: viewStore };
async function route() {
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
    if (S.user) await afterLogin();
  } catch (e) { fail(e); }
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') { S.user = null; S.profile = null; route(); } });
  window.addEventListener('hashchange', route);
  route();
})();

})();
