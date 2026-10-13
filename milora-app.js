/* Milora — working calculator layer.
   Loaded after the dashboard's own script. Adds real accounts + saved POs (Supabase),
   AI document extraction (/api/extract), a review step, and an Add PO flow.
   Without a server (/api/config missing) it runs in preview mode: accounts and POs
   live in this browser's localStorage. */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = (v) => String(v == null ? '' : v).replace(/[<>]/g, '');
  const num = (x) => (x === '' || x == null || isNaN(+x) ? null : +x);

  const COSTS = [
    ['factory', 'Factory invoice (EXW / FOB)', 'Factory & Origin'],
    ['freight', 'Freight (air / ocean / truck)', 'Freight & Logistics'],
    ['terminal', 'Terminal / port fee', 'Freight & Logistics'],
    ['decon', 'Deconsolidation / drayage', 'Freight & Logistics'],
    ['delivery', 'Delivery to warehouse / 3PL', 'Freight & Logistics'],
    ['handling', 'Handling fee', 'Freight & Logistics'],
    ['duty', 'Customs duty', 'US Customs & Government'],
    ['mpf', 'Merchandise Processing Fee', 'US Customs & Government'],
    ['clearance', 'Customs clearance / brokerage', 'US Customs & Government'],
  ];
  const OPS = { fulfill: 3.5, storage: 450, months: 2, outbound: 1.8, edi: 0.5, insurance: 0.5, overhead: 5, margin: 35 };
  const INPUT_IDS = Object.keys(OPS).concat(COSTS.map((c) => c[0]), ['units', 'markup']);
  const MODE_LABEL = { air: 'Air Freight', ocean: 'Ocean Freight', truck: 'Truck Freight', rail: 'Rail Freight' };
  const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

  const S = { mode: 'local', sb: null, user: null, pos: [], files: [], signup: false, applying: false, saveTimer: null, editingKey: null };

  /* ---------------- storage ---------------- */
  const store = {
    async list() {
      if (S.mode === 'cloud') {
        const { data, error } = await S.sb.from('purchase_orders').select('id,data').order('created_at', { ascending: false });
        if (error) throw error;
        return data.map((r) => Object.assign({}, r.data, { id: r.id }));
      }
      return JSON.parse(localStorage.getItem('milora-pos:' + S.user.id) || '[]');
    },
    async create(po) {
      if (S.mode === 'cloud') {
        const { data, error } = await S.sb.from('purchase_orders').insert({ name: po.retailer, season: po.season, data: po }).select('id').single();
        if (error) throw error;
        po.id = data.id;
      } else {
        po.id = 'po_' + Date.now();
        const all = await store.list(); all.unshift(po); localStorage.setItem('milora-pos:' + S.user.id, JSON.stringify(all));
      }
      return po;
    },
    async update(po) {
      if (S.mode === 'cloud') {
        const { error } = await S.sb.from('purchase_orders').update({ name: po.retailer, season: po.season, data: po, updated_at: new Date().toISOString() }).eq('id', po.id);
        if (error) throw error;
      } else {
        const all = (await store.list()).map((p) => (p.id === po.id ? po : p));
        localStorage.setItem('milora-pos:' + S.user.id, JSON.stringify(all));
      }
    },
    async remove(po) {
      if (S.mode === 'cloud') {
        await S.sb.from('purchase_orders').delete().eq('id', po.id);
        const paths = (po.files || []).map((f) => f.path).filter(Boolean);
        if (paths.length) await S.sb.storage.from('documents').remove(paths);
      } else {
        const all = (await store.list()).filter((p) => p.id !== po.id);
        localStorage.setItem('milora-pos:' + S.user.id, JSON.stringify(all));
      }
    },
  };

  /* ---------------- UI injection ---------------- */
  function injectUI() {
    // Login card: signup fields + mode toggle
    const card = document.querySelector('#login-overlay .auth-card');
    const passField = $('login-pass').closest('.auth-field');
    const company = document.createElement('div');
    company.className = 'auth-field'; company.id = 'company-field'; company.style.display = 'none';
    company.innerHTML = '<label for="login-company">Company name</label><div class="auth-input-wrap"><i class="ti ti-building"></i><input type="text" id="login-company" placeholder="Shoe Company Inc."></div>';
    passField.parentNode.insertBefore(company, passField.nextSibling);
    card.querySelector('.auth-hint').outerHTML = '<div class="auth-switch" id="auth-switch"></div>';
    card.querySelector('.auth-row a').setAttribute('onclick', 'miloraForgot(); return false;');
    renderAuthMode();

    // Header: Add PO + sign out
    const right = document.querySelector('.header-right');
    const add = document.createElement('button');
    add.className = 'hdr-add-btn'; add.innerHTML = '<i class="ti ti-plus"></i> Add PO'; add.onclick = () => openUpload('new');
    right.appendChild(add);
    const out = document.createElement('button');
    out.className = 'hdr-signout'; out.title = 'Sign out'; out.setAttribute('aria-label', 'Sign out'); out.innerHTML = '<i class="ti ti-logout"></i>'; out.onclick = signOut;
    right.appendChild(out);

    // Subheader: edit current PO
    const acts = document.querySelector('.subheader-actions');
    const edit = document.createElement('button');
    edit.className = 'btn-sm btn-ghost'; edit.id = 'edit-po-btn'; edit.style.display = 'none';
    edit.innerHTML = '<i class="ti ti-edit"></i> Edit PO data'; edit.onclick = () => editCurrentPO();
    acts.insertBefore(edit, acts.firstChild);

    // Upload card: manual entry + status
    const actions = document.querySelector('.upload-actions');
    const manual = document.createElement('button');
    manual.className = 'btn-lg ghost'; manual.id = 'upload-manual-btn'; manual.innerHTML = '<i class="ti ti-keyboard"></i> Enter numbers manually';
    manual.onclick = () => { closeUpload(); openReview(blankExtraction(), { files: [] }); };
    actions.insertBefore(manual, actions.querySelector('.spacer'));
    const status = document.createElement('div');
    status.id = 'upload-status'; status.className = 'upload-status';
    actions.parentNode.insertBefore(status, actions.nextSibling);
    $('file-input').setAttribute('accept', '.pdf,.png,.jpg,.jpeg,.webp,.gif,.csv,.xlsx,.xls,.txt,.edi');
    document.querySelector('.upload-note span').textContent = S.mode === 'cloud'
      ? 'Files are stored privately in your account. Milora reads them with AI, then you review every number before pricing.'
      : 'Preview mode: your account and POs are saved in this browser only. Deploy with the server to store them securely.';

    // Documents tab: container for user POs
    const nord = $('docs-nordstrom');
    const custom = document.createElement('div');
    custom.id = 'docs-custom'; custom.style.display = 'none';
    nord.parentNode.insertBefore(custom, nord.nextSibling);

    // Review modal
    const rv = document.createElement('div');
    rv.className = 'overlay hidden'; rv.id = 'review-overlay';
    rv.innerHTML = '<div class="upload-card review-card" id="review-card"></div>';
    document.body.appendChild(rv);
  }

  function renderAuthMode() {
    const s = S.signup;
    $('company-field').style.display = s ? '' : 'none';
    document.querySelector('#login-overlay .auth-btn').innerHTML = s ? '<i class="ti ti-user-plus"></i> Create account' : '<i class="ti ti-login-2"></i> Sign in';
    document.querySelector('#login-overlay .auth-row').style.display = s ? 'none' : '';
    $('auth-switch').innerHTML = s
      ? 'Already have an account? <a href="#" onclick="miloraToggleAuth(); return false;">Sign in</a>'
      : 'New to Milora? <a href="#" onclick="miloraToggleAuth(); return false;">Create an account</a>';
    $('login-pass').setAttribute('autocomplete', s ? 'new-password' : 'current-password');
    authMsg('');
  }
  window.miloraToggleAuth = () => { S.signup = !S.signup; renderAuthMode(); };

  function authMsg(text, ok) {
    const e = $('auth-error');
    e.textContent = text; e.classList.toggle('show', !!text); e.style.color = ok ? 'var(--success-text)' : '';
  }

  /* ---------------- auth ---------------- */
  window.doLogin = async function () {
    const email = $('login-email').value.trim().toLowerCase();
    const pass = $('login-pass').value;
    const company = $('login-company').value.trim();
    if (!email || !pass) return authMsg('Please enter your email and password.');
    if (S.signup && pass.length < 8) return authMsg('Use at least 8 characters for your password.');
    const btn = document.querySelector('#login-overlay .auth-btn');
    btn.disabled = true;
    try {
      if (S.mode === 'cloud') {
        if (S.signup) {
          const { data, error } = await S.sb.auth.signUp({ email, password: pass, options: { data: { company }, emailRedirectTo: location.origin + location.pathname } });
          if (error) throw error;
          if (!data.session) { authMsg('Check your inbox to confirm your email, then sign in.', true); S.signup = false; renderAuthMode(); authMsg('Check your inbox to confirm your email, then sign in.', true); return; }
          await onSignedIn(data.user);
        } else {
          const { data, error } = await S.sb.auth.signInWithPassword({ email, password: pass });
          if (error) throw error;
          await onSignedIn(data.user);
        }
      } else {
        const users = JSON.parse(localStorage.getItem('milora-local-users') || '{}');
        const hash = await sha(pass + email);
        if (S.signup) {
          if (users[email]) throw new Error('An account with this email already exists in this browser.');
          users[email] = { id: 'local_' + (await sha(email)).slice(0, 12), hash, company };
          localStorage.setItem('milora-local-users', JSON.stringify(users));
        } else if (!users[email] || users[email].hash !== hash) {
          throw new Error(users[email] ? 'Wrong password.' : 'No account with this email. Create one first.');
        }
        const u = { id: users[email].id, email, user_metadata: { company: users[email].company } };
        localStorage.setItem('milora-local-session', JSON.stringify(u));
        await onSignedIn(u);
      }
    } catch (e) {
      authMsg(e.message || String(e));
    } finally { btn.disabled = false; }
  };

  window.miloraForgot = async function () {
    const email = $('login-email').value.trim();
    if (!email) return authMsg('Enter your email first, then click "Forgot password?".');
    if (S.mode !== 'cloud') return authMsg('Password reset needs the hosted version. In preview mode, create a new account.');
    const { error } = await S.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    authMsg(error ? error.message : 'Password reset link sent. Check your inbox.', !error);
  };

  async function sha(s) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  async function onSignedIn(user) {
    S.user = user;
    const company = (user.user_metadata && user.user_metadata.company) || user.email.split('@')[0];
    document.querySelector('.client-name').textContent = company;
    document.querySelector('.client-logo span').textContent = company.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    $('login-overlay').classList.add('hidden');
    $('app-shell').style.display = '';
    try { S.pos = await store.list(); } catch (e) { S.pos = []; alert('Could not load your POs: ' + e.message); }
    S.pos.forEach(registerPO);
    rebuildMenu();
    if (S.pos.length) selectPO(keyOf(S.pos[0])); else { selectPO('macys'); openUpload('first'); }
    adaptWaterfallLabels();
  }

  async function signOut() {
    if (S.mode === 'cloud') await S.sb.auth.signOut(); else localStorage.removeItem('milora-local-session');
    location.reload();
  }

  /* ---------------- PO registry + menu ---------------- */
  const keyOf = (po) => 'u_' + po.id;
  function registerPO(po) { PO_DATA[keyOf(po)] = po; }

  function rebuildMenu() {
    const menu = $('po-menu');
    const item = (key, name, sub, dot, del) => `
      <div class="po-menu-row">
        <button class="po-menu-item${key === activePO ? ' active' : ''}" data-po="${key}" role="menuitem" onclick="selectPO('${key}')">
          <span class="po-menu-dot" style="background:${dot};"></span>
          <span class="po-menu-text"><span class="po-menu-name">${esc(name)}</span><span class="po-menu-sub">${esc(sub)}</span></span>
          <i class="ti ti-check po-menu-check"></i>
        </button>
        ${del ? `<button class="po-menu-del" title="Delete PO" aria-label="Delete ${esc(name)}" onclick="miloraDeletePO('${key}', event)"><i class="ti ti-trash"></i></button>` : ''}
      </div>`;
    let h = '<div class="po-menu-label">Your purchase orders</div>';
    h += S.pos.length ? S.pos.map((p) => item(keyOf(p), p.retailer, `${p.season || 'No season'} · ${(p.inputs.units || 0).toLocaleString()} pairs`, 'var(--accent)', true)).join('')
      : '<div class="po-menu-empty">No POs yet. Add your first one below.</div>';
    h += '<div class="po-menu-divider"></div><div class="po-menu-label">Samples</div>';
    h += item('macys', "Macy's (sample)", 'Spring/Summer 2025 · 1,240 pairs', '#8A9AB5');
    h += item('nordstrom', 'Nordstrom (sample)', 'Fall/Winter 2025 · 1,860 pairs', '#8A9AB5');
    h += `<div class="po-menu-divider"></div>
      <button class="po-menu-item po-menu-add" role="menuitem" onclick="openUpload('new')">
        <span class="po-menu-dot po-menu-dot-add"><i class="ti ti-plus" style="font-size:11px;"></i></span>
        <span class="po-menu-text"><span class="po-menu-name">Add PO</span><span class="po-menu-sub">Upload documents or enter numbers</span></span>
      </button>`;
    menu.innerHTML = h;
  }

  window.miloraDeletePO = async function (key, e) {
    e.stopPropagation();
    const po = PO_DATA[key];
    if (!po || !confirm(`Delete the ${po.retailer} PO and its documents? This can't be undone.`)) return;
    await store.remove(po);
    delete PO_DATA[key];
    S.pos = S.pos.filter((p) => p.id !== po.id);
    rebuildMenu();
    if (activePO === key) selectPO(S.pos.length ? keyOf(S.pos[0]) : 'macys');
  };

  /* ---------------- selectPO / calc wrappers ---------------- */
  const origSelect = window.selectPO;
  window.selectPO = function (key) {
    S.applying = true;
    origSelect(key);
    const po = PO_DATA[key];
    const custom = !!(po && po.custom);
    $('docs-custom').style.display = custom ? '' : 'none';
    $('edit-po-btn').style.display = custom ? '' : 'none';
    if (custom) {
      if (po.method) $('price-method').value = po.method;
      ['fulfill', 'months', 'outbound', 'edi', 'insurance', 'overhead', 'margin', 'markup'].forEach((id) => { const n = $(id + '-num'); if (n && po.inputs[id] != null) n.value = po.inputs[id]; });
      renderCustomDocs(po);
    }
    relabel(po);
    rebuildMenu();
    S.applying = false;
    calc();
  };

  function setFieldLabel(id, text) {
    const lbl = $('lbl-' + id); if (!lbl) return;
    const parent = lbl.parentElement;
    const node = Array.from(parent.childNodes).find((n) => n.nodeType === 3 && n.textContent.trim());
    if (node) node.textContent = text + ' ';
    else { const sp = parent.querySelector('span:not(.field-value)'); if (sp) sp.textContent = text; }
  }
  function relabel(po) {
    if (!po) return;
    const r = po.retailer || 'retailer';
    const freightText = po.custom ? po.freightLabel : (activePO === 'macys' ? 'Air Freight (1,915 kg @ $6.50/kg)' : po.freightLabel);
    setFieldLabel('freight', freightText);
    setFieldLabel('edi', `${r} EDI / Compliance fees`);
    document.querySelectorAll('#tab-calculator .section-label').forEach((el) => { if (/^Delivery to Wholesale Client/.test(el.textContent)) el.textContent = `Delivery to Wholesale Client (${r})`; });
    const sub = $('res-sell-sub'); if (sub) sub.textContent = `to ${r} (wholesale)`;
  }

  const origCalc = window.calc;
  window.calc = function () {
    origCalc();
    const po = PO_DATA[activePO];
    if (!po || !po.custom) return;
    const units = v('units') || 1;
    $('res-premium-label').textContent = 'Freight cost per pair';
    $('res-premium').textContent = fmt(v('freight') / units);
    $('res-premium').className = 'metric-value';
    $('res-premium-sub').textContent = po.freightLabel;
    if (!SKUS.length) $('sku-table-body').innerHTML = '<tr><td colspan="9" style="padding:22px 12px; color:var(--text-muted);">No SKUs on this PO yet. Use <strong>Edit PO data</strong> to add styles and factory prices.</td></tr>';
    if (S.applying) return;
    INPUT_IDS.forEach((id) => { const el = $(id); if (el) po.inputs[id] = parseFloat(el.value) || 0; });
    po.method = $('price-method').value;
    clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(() => store.update(po).catch((e) => console.warn('Save failed', e)), 900);
  };

  /* ---------------- upload ---------------- */
  window.handleFiles = function (list) {
    for (const f of list) pendingFiles.push({ name: f.name, size: f.size, file: f });
    renderFileList();
  };

  const kindOf = (f) => {
    const n = f.name.toLowerCase();
    if (f.type === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
    if (IMAGE_TYPES.includes(f.type)) return 'image';
    if (/\.(xlsx|xls)$/.test(n)) return 'sheet';
    if (/\.(csv|txt|edi)$/.test(n) || f.type.startsWith('text/')) return 'text';
    return 'other';
  };

  function status(t, err) { const s = $('upload-status'); s.textContent = t || ''; s.classList.toggle('err', !!err); }

  async function loadScript(src) {
    return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Could not load ' + src)); document.head.appendChild(s); });
  }
  async function sheetText(file) {
    if (!window.XLSX) await loadScript('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js');
    const wb = XLSX.read(await file.arrayBuffer());
    return wb.SheetNames.map((n) => `# Sheet: ${n}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n\n');
  }
  const b64 = (file) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(file); });

  window.submitUpload = async function () {
    if (!pendingFiles.length) return;
    const btn = $('upload-submit-btn');
    const retailer = $('up-client').value.trim();
    const season = $('up-season').value.trim();
    const bad = pendingFiles.filter((p) => kindOf(p.file) === 'other');
    if (bad.length) return status(`Can't read: ${bad.map((b) => b.name).join(', ')}. Use PDF, image, CSV or Excel.`, true);
    btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2"></i> Reading documents…';
    try {
      const texts = [], blobs = [];
      for (const p of pendingFiles) {
        const k = kindOf(p.file);
        if (k === 'sheet') texts.push({ name: p.name, text: await sheetText(p.file) });
        else if (k === 'text') texts.push({ name: p.name, text: await p.file.text() });
        else blobs.push(p);
      }
      let result, files = [];
      if (S.mode === 'cloud') {
        const total = blobs.reduce((a, p) => a + p.size, 0);
        if (total > 25 * 1024 * 1024) throw new Error('PDFs and images over 25 MB in total. Upload fewer or smaller files at a time.');
        const folder = `${S.user.id}/${Date.now()}`;
        for (let i = 0; i < blobs.length; i++) {
          status(`Uploading ${i + 1} of ${blobs.length}…`);
          const p = blobs[i];
          const path = `${folder}/${p.name.replace(/[^\w.\-]+/g, '_')}`;
          const { error } = await S.sb.storage.from('documents').upload(path, p.file, { contentType: p.file.type || 'application/pdf' });
          if (error) throw error;
          files.push({ name: p.name, path, mediaType: kindOf(p.file) === 'pdf' ? 'application/pdf' : p.file.type, size: p.size });
        }
        status('Milora is reading your documents. This can take up to a minute…');
        const { data: { session } } = await S.sb.auth.getSession();
        const r = await fetch('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify({ retailer, season, files, texts }) });
        const j = await r.json().catch(() => ({ error: 'Server error ' + r.status }));
        if (!r.ok) throw new Error(j.error || 'Extraction failed');
        result = j;
      } else {
        files = pendingFiles.map((p) => ({ name: p.name, size: p.size }));
        status('Reading your documents with AI (preview mode)…');
        result = await localExtract(blobs, texts, retailer, season);
      }
      if (retailer) result.retailer = retailer;
      if (season) result.season = season;
      status('');
      closeUpload();
      openReview(result, { files });
    } catch (e) {
      status(e.message || String(e), true);
    } finally {
      btn.disabled = pendingFiles.length === 0; btn.innerHTML = '<i class="ti ti-check"></i> Process documents';
    }
  };

  async function localExtract(blobs, texts, retailer, season) {
    if (!window.claude || !window.claude.complete) {
      const x = blankExtraction();
      x.warnings.push('AI reading needs the hosted version. Enter the numbers from your documents below.');
      return x;
    }
    const { TOOL, SYSTEM, userPrompt } = await import('./api/_schema.js');
    const ask = 'Respond with ONLY a JSON object (no prose, no code fences) matching this JSON schema:\n' + JSON.stringify(TOOL.input_schema) + '\n\n' + userPrompt(retailer, season);
    const content = [];
    for (const p of blobs) {
      content.push({ type: 'text', text: 'File: ' + p.name });
      const data = await b64(p.file);
      content.push(kindOf(p.file) === 'pdf' ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } } : { type: 'image', source: { type: 'base64', media_type: p.file.type, data } });
    }
    texts.forEach((t) => content.push({ type: 'text', text: `File: ${t.name}\n${t.text.slice(0, 150000)}` }));
    content.push({ type: 'text', text: ask });
    let out;
    try {
      out = await window.claude.complete({ system: SYSTEM, max_tokens: 8000, messages: [{ role: 'user', content }] });
    } catch (e) {
      // Fallback: pull text out of PDFs in the browser.
      const tx = texts.slice();
      for (const p of blobs) if (kindOf(p.file) === 'pdf') tx.push({ name: p.name, text: await pdfText(p.file) });
      const prompt = tx.map((t) => `File: ${t.name}\n${t.text.slice(0, 60000)}`).join('\n\n') + '\n\n' + ask;
      out = await window.claude.complete({ system: SYSTEM, max_tokens: 8000, messages: [{ role: 'user', content: prompt }] });
    }
    const m = String(out).match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Could not read the AI response. Try again or enter numbers manually.');
    return JSON.parse(m[0]);
  }

  async function pdfText(file) {
    if (!window.pdfjsLib) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let s = '';
    for (let i = 1; i <= Math.min(doc.numPages, 30); i++) s += (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' ') + '\n';
    return s;
  }

  function blankExtraction() {
    const costs = {}; COSTS.forEach(([k]) => (costs[k] = { amount: null, confidence: 'low', source: '' }));
    return { retailer: '', season: '', currency: 'USD', freight_mode: 'unknown', route: '', ship_window: '', costs, units: null, skus: [], documents: [], timeline: [], warnings: [] };
  }

  /* ---------------- review ---------------- */
  let RV = null;
  function openReview(x, meta) {
    x = Object.assign(blankExtraction(), x || {});
    COSTS.forEach(([k]) => { x.costs[k] = Object.assign({ amount: null, confidence: 'low', source: '' }, x.costs[k] || {}); });
    RV = { x, meta, skus: (x.skus || []).map((s) => ({ style: s.style || '', color: s.color || '', qty: s.qty || 0, unit_price: s.unit_price != null ? s.unit_price : (s.factory || 0) })) };
    renderReview();
    $('review-overlay').classList.remove('hidden');
  }

  function renderReview() {
    const { x } = RV;
    const conf = (c) => `<span class="rv-conf rv-${c}">${c === 'high' ? 'High' : c === 'medium' ? 'Check' : 'Verify'}</span>`;
    const warn = (x.warnings || []).slice();
    if (x.currency && x.currency.toUpperCase() !== 'USD') warn.unshift(`Amounts are in ${x.currency}. Convert them to USD before confirming.`);
    const rows = COSTS.map(([k, label]) => {
      const c = x.costs[k];
      const flag = c.amount == null || c.confidence !== 'high';
      return `<tr class="${flag ? 'rv-flag' : ''}">
        <td><div class="rv-label">${label}</div>${c.source || c.note ? `<div class="rv-src">${esc(c.source)}${c.note ? ' · ' + esc(c.note) : ''}</div>` : ''}</td>
        <td>${RV.meta.files.length ? conf(c.confidence) : ''}</td>
        <td class="right"><div class="input-currency rv-money"><span>$</span><input type="number" step="0.01" data-cost="${k}" value="${c.amount == null ? '' : c.amount}" placeholder="0.00"></div></td>
      </tr>`;
    }).join('');
    const skuRows = RV.skus.map((s, i) => `<tr>
      <td><input type="text" class="no-prefix" data-sku="${i}" data-f="style" value="${esc(s.style)}" placeholder="Style"></td>
      <td><input type="text" class="no-prefix" data-sku="${i}" data-f="color" value="${esc(s.color)}" placeholder="Color / material"></td>
      <td class="right"><input type="number" class="no-prefix rv-num" data-sku="${i}" data-f="qty" value="${s.qty}" min="0"></td>
      <td class="right"><div class="input-currency rv-money"><span>$</span><input type="number" step="0.01" data-sku="${i}" data-f="unit_price" value="${s.unit_price}"></div></td>
      <td><button class="fr-remove" onclick="miloraRemoveSku(${i})" aria-label="Remove SKU"><i class="ti ti-x"></i></button></td>
    </tr>`).join('');
    const editing = !!S.editingKey;
    $('review-card').innerHTML = `
      <div class="upload-head">
        <div class="uh-icon"><i class="ti ti-checklist"></i></div>
        <div><h2>${editing ? 'Edit PO data' : 'Review the numbers'}</h2>
        <p>${RV.meta.files.length ? `Read from ${RV.meta.files.length} document${RV.meta.files.length > 1 ? 's' : ''}. Check every value against your paperwork. Highlighted rows need a closer look.` : 'Enter the costs from your documents. You can change any of them later.'}</p></div>
        <button class="upload-close" onclick="miloraCloseReview()" aria-label="Close">&times;</button>
      </div>
      ${warn.length ? `<div class="alert-banner alert-warning rv-warn"><i class="ti ti-alert-triangle"></i><div>${warn.map(esc).join('<br>')}</div></div>` : ''}
      <div class="upload-2col">
        <div class="upload-field"><label>Retailer / customer</label><input type="text" class="no-prefix" id="rv-retailer" value="${esc(x.retailer)}" placeholder="e.g. Saks Fifth Avenue"></div>
        <div class="upload-field"><label>Season</label><input type="text" class="no-prefix" id="rv-season" value="${esc(x.season)}" placeholder="e.g. Spring/Summer 2026"></div>
      </div>
      <div class="upload-2col">
        <div class="upload-field"><label>Freight mode</label><select id="rv-mode">${['air', 'ocean', 'truck', 'rail', 'unknown'].map((m) => `<option value="${m}"${x.freight_mode === m ? ' selected' : ''}>${m === 'unknown' ? 'Other / unknown' : MODE_LABEL[m]}</option>`).join('')}</select></div>
        <div class="upload-field"><label>Route</label><input type="text" class="no-prefix" id="rv-route" value="${esc(x.route)}" placeholder="e.g. HKG → ORD → STL"></div>
      </div>
      <div class="rv-section">Import costs (USD)</div>
      <table class="data-table rv-table"><tbody>${rows}</tbody>
        <tfoot><tr class="total-row"><td colspan="2">Import total</td><td class="right" id="rv-import-total"></td></tr></tfoot></table>
      <div class="rv-section">Units &amp; SKUs</div>
      <div class="upload-field" style="max-width:260px;"><label>Total units in order (pairs)</label><input type="number" class="no-prefix" id="rv-units" value="${x.units || ''}" min="1" placeholder="Sum of SKU quantities"></div>
      <table class="data-table rv-table rv-skus"><thead><tr><th>Style</th><th>Color / material</th><th class="right">Pairs</th><th class="right">Factory $/pair</th><th></th></tr></thead><tbody>${skuRows || '<tr><td colspan="5" style="color:var(--text-muted);">No SKUs yet. Add them for per-style pricing.</td></tr>'}</tbody></table>
      <button class="btn-sm btn-ghost" style="margin-top:10px;" onclick="miloraAddSku()"><i class="ti ti-plus"></i> Add SKU</button>
      <div class="rv-check" id="rv-check"></div>
      <div class="upload-actions">
        <button class="btn-lg ghost" onclick="miloraCloseReview()">Cancel</button>
        <div class="spacer"></div>
        <button class="btn-lg primary" id="rv-confirm" onclick="miloraConfirm()"><i class="ti ti-calculator"></i> ${editing ? 'Save changes' : 'Confirm & price'}</button>
      </div>
      <div class="upload-status err" id="rv-error"></div>`;
    $('review-card').oninput = onReviewInput;
    onReviewInput();
  }

  function readReview() {
    const x = RV.x;
    document.querySelectorAll('#review-card [data-cost]').forEach((el) => { x.costs[el.dataset.cost].amount = num(el.value); });
    document.querySelectorAll('#review-card [data-sku]').forEach((el) => {
      const s = RV.skus[+el.dataset.sku]; const f = el.dataset.f;
      s[f] = f === 'style' || f === 'color' ? el.value : (num(el.value) || 0);
    });
    x.retailer = $('rv-retailer').value.trim(); x.season = $('rv-season').value.trim();
    x.freight_mode = $('rv-mode').value; x.route = $('rv-route').value.trim();
    x.units = num($('rv-units').value);
  }

  function onReviewInput() {
    readReview();
    const x = RV.x;
    const total = COSTS.reduce((a, [k]) => a + (x.costs[k].amount || 0), 0);
    $('rv-import-total').textContent = fmt(total);
    const skuPairs = RV.skus.reduce((a, s) => a + (s.qty || 0), 0);
    const skuValue = RV.skus.reduce((a, s) => a + (s.qty || 0) * (s.unit_price || 0), 0);
    $('rv-units').placeholder = skuPairs ? skuPairs.toLocaleString() + ' (sum of SKUs)' : 'e.g. 1240';
    const notes = [];
    const fac = x.costs.factory.amount;
    if (RV.skus.length && fac && Math.abs(skuValue - fac) > Math.max(1, fac * 0.01)) notes.push(`SKU value ${fmt(skuValue)} doesn't match the factory invoice ${fmt(fac)}.`);
    if (RV.skus.length && x.units && skuPairs !== x.units) notes.push(`SKU pairs (${skuPairs.toLocaleString()}) don't match total units (${x.units.toLocaleString()}).`);
    $('rv-check').innerHTML = notes.length ? '<i class="ti ti-info-circle"></i> ' + notes.map(esc).join(' ') : '';
  }

  window.miloraAddSku = () => { readReview(); RV.skus.push({ style: '', color: '', qty: 0, unit_price: 0 }); renderReview(); };
  window.miloraRemoveSku = (i) => { readReview(); RV.skus.splice(i, 1); renderReview(); };
  window.miloraCloseReview = () => { $('review-overlay').classList.add('hidden'); S.editingKey = null; };

  window.miloraConfirm = async function () {
    readReview();
    const x = RV.x, err = $('rv-error');
    const units = x.units || RV.skus.reduce((a, s) => a + (s.qty || 0), 0);
    if (!x.retailer) return (err.textContent = 'Add the retailer or customer name.');
    if (!units) return (err.textContent = 'Add the total units, or SKUs with quantities.');
    if (!x.costs.factory.amount) return (err.textContent = 'Add the factory invoice amount.');
    err.textContent = '';
    const btn = $('rv-confirm'); btn.disabled = true;
    try {
      const prev = S.editingKey ? PO_DATA[S.editingKey] : null;
      const po = buildPO(x, RV.skus, units, prev ? prev.files : RV.meta.files, prev);
      if (prev) { po.id = prev.id; await store.update(po); S.pos = S.pos.map((p) => (p.id === po.id ? po : p)); }
      else { await store.create(po); S.pos.unshift(po); }
      registerPO(po);
      S.editingKey = null;
      $('review-overlay').classList.add('hidden');
      selectPO(keyOf(po));
      switchTab('calculator');
    } catch (e) { err.textContent = 'Could not save: ' + (e.message || e); }
    finally { btn.disabled = false; }
  };

  function editCurrentPO() {
    const po = PO_DATA[activePO]; if (!po || !po.custom) return;
    S.editingKey = activePO;
    const x = Object.assign(blankExtraction(), po.extraction || {});
    x.retailer = po.retailer; x.season = po.season; x.route = po.route === '—' ? '' : po.route; x.freight_mode = po.freightMode || 'unknown';
    x.units = po.inputs.units;
    COSTS.forEach(([k]) => { x.costs[k] = Object.assign({}, x.costs[k] || {}, { amount: po.inputs[k] }); });
    x.skus = po.skus.map((s) => ({ style: s.style, color: s.color, qty: s.qty, unit_price: s.factory }));
    x.warnings = [];
    openReview(x, { files: po.files || [] });
  }

  function buildPO(x, skus, units, files, prev) {
    const lastOps = prev ? prev.inputs : (S.pos[0] ? S.pos[0].inputs : OPS);
    const inputs = {};
    Object.keys(OPS).forEach((k) => (inputs[k] = lastOps[k] != null ? lastOps[k] : OPS[k]));
    if (prev && prev.inputs.markup != null) inputs.markup = prev.inputs.markup;
    COSTS.forEach(([k]) => (inputs[k] = x.costs[k].amount || 0));
    inputs.units = units;
    const importTotal = COSTS.reduce((a, [k]) => a + inputs[k], 0);
    const freightLabel = MODE_LABEL[x.freight_mode] || 'Freight';
    const docs = x.documents || [];
    const breakdown = [];
    let group = '';
    COSTS.slice().sort((a, b) => ['Factory & Origin', 'Freight & Logistics', 'US Customs & Government'].indexOf(a[2]) - ['Factory & Origin', 'Freight & Logistics', 'US Customs & Government'].indexOf(b[2])).forEach(([k, label, g]) => {
      if (!inputs[k]) return;
      if (g !== group) { breakdown.push({ group: g }); group = g; }
      const c = x.costs[k] || {};
      breakdown.push({ item: k === 'freight' ? freightLabel : label, doc: clean(c.source || 'Entered manually'), provider: '', amount: fmt(inputs[k]), notes: clean(c.note || '') });
    });
    breakdown.push({ subtotal: 'Subtotal — all import costs', amount: fmt(importTotal) });
    return {
      custom: true,
      retailer: x.retailer, season: x.season || '', freightMode: x.freight_mode,
      label: `PO → ${x.retailer}`, freightLabel,
      summaryName: `${x.retailer}${x.season ? ' — ' + x.season : ''}`,
      docCount: `${files.length} document${files.length === 1 ? '' : 's'}`,
      shipWindow: x.ship_window || '—', route: x.route || '—',
      totalPairsLabel: `${units.toLocaleString()} pairs / ${skus.length} SKU${skus.length === 1 ? '' : 's'}`,
      importCostLabel: fmt(importTotal),
      altFreightEst: 0, premiumLabel: '',
      inputs, method: prev ? prev.method : 'margin',
      skus: skus.filter((s) => s.style || s.qty).map((s) => ({ style: clean(s.style || '—'), color: clean(s.color || ''), qty: s.qty || 0, factory: s.unit_price || 0 })),
      breakdown,
      shipment: [
        ['Retailer', clean(x.retailer)], ['Season', clean(x.season || '—')], ['Freight mode', freightLabel],
        ['Route', clean(x.route || '—')], ['Ship window', clean(x.ship_window || '—')],
        ['Total pairs', units.toLocaleString()], ['Documents', String(files.length)],
      ],
      timeline: (x.timeline || []).slice(0, 8).map((t) => ({ icon: 'ti-file-invoice', label: clean(t.label), date: clean(t.date), cls: 'done' })),
      documents: docs, files,
      extraction: { costs: x.costs, currency: x.currency, ship_window: x.ship_window, documents: docs, timeline: x.timeline },
      createdAt: prev ? prev.createdAt : new Date().toISOString(),
    };
  }

  /* ---------------- documents tab (user POs) ---------------- */
  function renderCustomDocs(po) {
    const el = $('docs-custom');
    const files = po.files || [];
    let h = '';
    if (files.length) {
      h += `<div><div class="po-group-header"><div class="po-group-badge">Source files</div><div class="po-group-line"></div></div><div class="cf-list">`;
      h += files.map((f, i) => `<div class="file-row"><div class="fr-icon"><i class="ti ti-file"></i></div><div class="fr-name">${esc(f.name)}</div><div class="fr-size">${f.size ? humanSize(f.size) : ''}</div>${f.path ? `<button class="btn-sm btn-ghost" onclick="miloraOpenFile(${i})"><i class="ti ti-external-link"></i> Open</button>` : ''}</div>`).join('');
      h += '</div></div>';
    }
    const docs = po.documents || [];
    if (docs.length) {
      h += `<div><div class="po-group-header"><div class="po-group-badge">Extracted documents</div><div class="po-group-meta">${docs.length} read by Milora</div><div class="po-group-line"></div></div><div class="doc-grid">`;
      h += docs.map((d) => `<div class="doc-card">
        <div class="doc-card-header"><div class="doc-icon teal"><i class="ti ti-file-text"></i></div><div><div class="doc-card-title">${esc(d.doc_type)}</div><div class="doc-card-subtitle">${esc(d.issuer || d.file_name)}</div></div></div>
        <div class="doc-card-body">${(d.key_fields || []).map((f) => `<div class="doc-field-row"><div class="doc-field-label">${esc(f.label)}</div><div class="doc-field-value">${esc(f.value)}</div></div>`).join('')}
          ${d.total != null ? `<div class="doc-total-row"><span>Document total</span><span>${fmt(+d.total)}</span></div>` : ''}</div>
        <div class="doc-card-footer"><div class="doc-date-chip"><i class="ti ti-calendar" style="font-size:12px;"></i> ${esc(d.date || '—')}</div>${d.reference ? `<div class="doc-ref-chip">${esc(d.reference)}</div>` : ''}</div>
      </div>`).join('');
      h += '</div></div>';
    }
    if (!h) h = `<div class="alert-banner alert-warning"><i class="ti ti-info-circle"></i><div>This PO was entered manually, so there are no documents attached. Use <strong>Add PO</strong> to upload documents for your next order.</div></div>`;
    el.innerHTML = h;
  }

  window.miloraOpenFile = async function (i) {
    const f = (PO_DATA[activePO].files || [])[i];
    if (!f || S.mode !== 'cloud') return;
    const { data, error } = await S.sb.storage.from('documents').createSignedUrl(f.path, 120);
    if (error) return alert(error.message);
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  /* ---------------- boot ---------------- */
  async function boot() {
    try {
      const r = await fetch('/api/config', { cache: 'no-store' });
      if (r.ok) {
        const c = await r.json();
        if (c.supabaseUrl && c.supabaseAnonKey && window.supabase) { S.mode = 'cloud'; S.sb = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey); }
      }
    } catch (e) { /* preview mode */ }
    injectUI();
    rebuildMenu();
    if (S.mode === 'cloud') {
      S.sb.auth.onAuthStateChange(async (ev) => {
        if (ev === 'PASSWORD_RECOVERY') {
          const p = prompt('Choose a new password (at least 8 characters):');
          if (p && p.length >= 8) { const { error } = await S.sb.auth.updateUser({ password: p }); alert(error ? error.message : 'Password updated.'); }
        }
      });
      const { data: { session } } = await S.sb.auth.getSession();
      if (session) await onSignedIn(session.user);
    } else {
      const u = JSON.parse(localStorage.getItem('milora-local-session') || 'null');
      if (u) await onSignedIn(u);
    }
  }
  boot();
})();
