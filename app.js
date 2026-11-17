'use strict';
(() => {
  const DATA_KEY = 'subtrack.subs';
  const SETTINGS_KEY = 'subtrack.settings';
  const NOTIFIED_KEY = 'subtrack.notified';
  const DAY = 86400000;
  const CYCLES = ['weekly', 'monthly', 'yearly', 'custom'];
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  const $ = (s) => document.querySelector(s);

  // ---------- storage ----------
  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }
  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { toast('Could not save: browser storage is full or blocked'); return false; }
  }

  const settings = Object.assign({ leadDays: 3, theme: 'auto', notify: false, currency: guessCurrency() }, load(SETTINGS_KEY, {}));
  let subs = []; // loaded at boot, once the helpers below exist
  const loadSubs = () => { const raw = load(DATA_KEY, []); subs = (Array.isArray(raw) ? raw : []).map(normalize).filter(Boolean); };

  const saveSubs = () => store(DATA_KEY, subs);
  const saveSettings = () => store(SETTINGS_KEY, settings);

  function guessCurrency() {
    const region = (navigator.language || '').split('-')[1];
    const map = { US: 'USD', GB: 'GBP', NG: 'NGN', CA: 'CAD', AU: 'AUD', IN: 'INR', JP: 'JPY', ZA: 'ZAR', KE: 'KES',
      GH: 'GHS', BR: 'BRL', CH: 'CHF', SE: 'SEK', NZ: 'NZD', SG: 'SGD', AE: 'AED', MX: 'MXN',
      DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', IE: 'EUR', PT: 'EUR', BE: 'EUR', AT: 'EUR', FI: 'EUR' };
    return map[region] || 'USD';
  }

  // ---------- dates ----------
  const pad = (n) => String(n).padStart(2, '0');
  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const daysUntil = (iso, from = today()) => Math.round((parse(iso) - from) / DAY);
  function addMonths(d, n) {
    const last = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
    return new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), last));
  }
  // Date k billing cycles after `base` (month arithmetic is clamped, so the 31st stays the 31st where it exists).
  function stepFrom(sub, base, k) {
    switch (sub.cycle) {
      case 'weekly': return addDays(base, 7 * k);
      case 'monthly': return addMonths(base, k);
      case 'yearly': return addMonths(base, 12 * k);
      default: return addDays(base, sub.days * k);
    }
  }
  // Move any renewal date that has passed forward to the next one on or after today.
  function rollForward() {
    const t = today();
    let changed = false;
    for (const s of subs) {
      if (parse(s.next) >= t) continue;
      const anchor = parse(s.anchor);
      let k = 1, d = stepFrom(s, anchor, k);
      while (d < t && k < 100000) d = stepFrom(s, anchor, ++k);
      s.next = toISO(d);
      changed = true;
    }
    if (changed) saveSubs();
  }

  // ---------- money ----------
  const yearly = (s) => s.cycle === 'weekly' ? s.price * 52
    : s.cycle === 'monthly' ? s.price * 12
    : s.cycle === 'yearly' ? s.price
    : s.price * 365 / s.days;
  const fmtCache = new Map();
  function money(amount, cur) {
    try {
      if (!fmtCache.has(cur)) fmtCache.set(cur, new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }));
      return fmtCache.get(cur).format(amount);
    } catch { return `${amount.toFixed(2)} ${cur}`; }
  }
  function totals(items, fn) {
    const m = new Map();
    for (const s of items) m.set(s.currency, (m.get(s.currency) || 0) + fn(s));
    return [...m].sort((a, b) => b[1] - a[1]);
  }
  function setMoney(el, pairs) {
    el.replaceChildren();
    pairs = pairs.filter(([, v]) => v > 0);
    if (!pairs.length) { el.textContent = money(0, settings.currency); return; }
    pairs.forEach(([cur, v], i) => {
      const node = i === 0 ? document.createTextNode(money(v, cur)) : h('small', {}, '+ ' + money(v, cur));
      el.append(node);
    });
  }
  const cycleLabel = (s) => s.cycle === 'custom' ? `every ${s.days} days`
    : { weekly: 'week', monthly: 'month', yearly: 'year' }[s.cycle];
  const perLabel = (s) => s.cycle === 'custom' ? ` / ${s.days}d` : ` / ${{ weekly: 'wk', monthly: 'mo', yearly: 'yr' }[s.cycle]}`;

  // ---------- data model ----------
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  function normalize(o) {
    if (!o || typeof o !== 'object') return null;
    const name = String(o.name ?? '').trim().slice(0, 80);
    const price = Number(o.price);
    const next = DATE_RE.test(o.next) ? o.next : null;
    if (!name || !Number.isFinite(price) || price < 0 || !next || isNaN(parse(next))) return null;
    const cycle = CYCLES.includes(o.cycle) ? o.cycle : 'monthly';
    return {
      id: typeof o.id === 'string' && o.id ? o.id.slice(0, 40) : uid(),
      name,
      price: Math.round(price * 100) / 100,
      currency: /^[A-Za-z]{3}$/.test(o.currency) ? o.currency.toUpperCase() : 'USD',
      cycle,
      days: cycle === 'custom' ? Math.min(3650, Math.max(1, Math.round(Number(o.days) || 30))) : undefined,
      next,
      anchor: DATE_RE.test(o.anchor) ? o.anchor : next,
      category: String(o.category ?? '').trim().slice(0, 40),
      trial: DATE_RE.test(o.trial) ? o.trial : '',
      unused: !!o.unused,
    };
  }
  const trialActive = (s, t = today()) => s.trial && parse(s.trial) >= t;
  const sortKey = (s) => trialActive(s) && s.trial < s.next ? s.trial : s.next;

  // ---------- DOM helpers ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) el.append(k);
    return el;
  }
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  function whenText(n) {
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    return `in ${n} days`;
  }

  // ---------- render ----------
  const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'short' });
  const fullFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  function render() {
    rollForward();
    const t = today();
    const sorted = [...subs].sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || a.name.localeCompare(b.name));

    $('#list').replaceChildren(...sorted.map((s) => row(s, t)));
    $('#empty').hidden = subs.length > 0;
    $('#count').textContent = subs.length ? `${subs.length} active` : '';

    setMoney($('#statMonthly'), totals(subs, (s) => yearly(s) / 12));
    setMoney($('#statYearly'), totals(subs, yearly));
    const horizon = addDays(t, 30);
    setMoney($('#statSoon'), totals(subs, (s) => {
      let n = 0, d = parse(s.next), k = 0;
      while (d <= horizon && k < 60) { n++; d = stepFrom(s, parse(s.next), ++k); }
      return n * s.price;
    }));
    const flagged = subs.filter((s) => s.unused);
    setMoney($('#statSave'), totals(flagged, yearly));
    $('#statSaveHint').textContent = flagged.length
      ? `by cancelling ${flagged.length} you're not using`
      : 'Flag anything you don\'t use';

    const cats = [...new Set(['Streaming', 'Music', 'Software', 'Cloud storage', 'News', 'Fitness', 'Gaming', 'Utilities',
      ...subs.map((s) => s.category).filter(Boolean)])];
    $('#categories').replaceChildren(...cats.map((c) => h('option', { value: c })));
  }

  function row(s, t) {
    const n = daysUntil(s.next, t);
    const trialDays = trialActive(s, t) ? daysUntil(s.trial, t) : null;
    const soon = n <= 7 || (trialDays != null && trialDays <= 7);
    const d = parse(s.next);
    const badges = [];
    if (trialDays != null) {
      badges.push(h('span', { class: 'badge' + (trialDays <= 7 ? ' trial-soon' : ''), title: fullFmt.format(parse(s.trial)) },
        `Free trial ends ${whenText(trialDays)}`));
    }
    if (s.unused) badges.push(h('span', { class: 'badge unused' }, `Not using · save ${money(yearly(s), s.currency)}/yr`));

    return h('li', { class: 'item' + (soon ? ' soon' : '') + (s.unused ? ' unused' : ''), 'data-id': s.id },
      h('div', { class: 'date', title: fullFmt.format(d) },
        h('span', { class: 'm' }, monthFmt.format(d)), h('span', { class: 'd' }, String(d.getDate()))),
      h('div', { class: 'info' },
        h('div', { class: 'name' }, s.name),
        h('div', { class: 'meta' },
          h('span', { class: 'when' }, `Renews ${whenText(n)}`),
          ` · ${s.cycle === 'custom' ? `every ${s.days} days` : s.cycle}`,
          s.category ? ` · ${s.category}` : ''),
        badges.length ? h('div', { class: 'badges' }, badges) : null),
      h('div', { class: 'right' },
        h('div', { class: 'price' }, money(s.price, s.currency), h('small', {}, perLabel(s))),
        h('div', { class: 'acts' },
          h('button', { type: 'button', class: 'small', 'data-action': 'unused', 'aria-pressed': String(s.unused),
            title: 'Flag as not using' }, s.unused ? 'Not using ✓' : 'Not using?'),
          h('button', { type: 'button', class: 'small', 'data-action': 'ics', title: 'Download calendar reminder' }, '📅 .ics'),
          h('button', { type: 'button', class: 'small', 'data-action': 'edit' }, 'Edit'))));
  }

  // ---------- form ----------
  const dlg = $('#dlg');
  const form = $('#form');
  let editingId = null;

  function openForm(id) {
    editingId = id || null;
    const s = id ? subs.find((x) => x.id === id) : null;
    form.reset();
    $('#formError').textContent = '';
    $('#dlgTitle').textContent = s ? 'Edit subscription' : 'Add subscription';
    $('#deleteBtn').hidden = !s;
    const f = form.elements;
    f.name.value = s?.name ?? '';
    f.price.value = s ? s.price : '';
    f.currency.value = s?.currency ?? settings.currency;
    f.cycle.value = s?.cycle ?? 'monthly';
    f.days.value = s?.days ?? 30;
    f.next.value = s?.next ?? toISO(addMonths(today(), 1));
    f.trial.value = s?.trial ?? '';
    f.category.value = s?.category ?? '';
    f.unused.checked = !!s?.unused;
    $('#daysWrap').hidden = f.cycle.value !== 'custom';
    dlg.showModal();
    if (!s) f.name.focus();
  }

  form.elements.cycle.addEventListener('change', (e) => { $('#daysWrap').hidden = e.target.value !== 'custom'; });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = form.elements;
    const err = (msg, el) => { $('#formError').textContent = msg; el?.focus(); };
    if (!f.name.value.trim()) return err('Give it a name.', f.name);
    if (f.price.value === '' || !(Number(f.price.value) >= 0)) return err('Enter a price (0 or more).', f.price);
    if (!/^[A-Za-z]{3}$/.test(f.currency.value.trim())) return err('Currency should be a 3-letter code like USD or EUR.', f.currency);
    if (!DATE_RE.test(f.next.value)) return err('Pick the next renewal date.', f.next);
    if (f.cycle.value === 'custom' && !(Number(f.days.value) >= 1)) return err('Enter how many days between renewals.', f.days);

    const prev = editingId ? subs.find((x) => x.id === editingId) : null;
    const keepAnchor = prev && prev.next === f.next.value && prev.cycle === f.cycle.value && prev.days === (f.cycle.value === 'custom' ? Math.round(Number(f.days.value)) : undefined);
    const s = normalize({
      id: editingId || uid(),
      name: f.name.value,
      price: f.price.value,
      currency: f.currency.value.trim(),
      cycle: f.cycle.value,
      days: f.days.value,
      next: f.next.value,
      anchor: keepAnchor ? prev.anchor : f.next.value,
      trial: f.trial.value,
      category: f.category.value,
      unused: f.unused.checked,
    });
    if (!s) return err('Something in the form isn\'t valid.');
    settings.currency = s.currency;
    saveSettings();
    if (prev) subs[subs.indexOf(prev)] = s; else subs.push(s);
    saveSubs();
    dlg.close();
    render();
    toast(prev ? 'Saved' : `Added ${s.name}`);
  });

  $('#cancelBtn').addEventListener('click', () => dlg.close());
  $('#deleteBtn').addEventListener('click', () => {
    const s = subs.find((x) => x.id === editingId);
    if (!s || !confirm(`Delete "${s.name}"? This can't be undone (unless you have an export).`)) return;
    subs = subs.filter((x) => x !== s);
    saveSubs();
    dlg.close();
    render();
    toast(`Deleted ${s.name}`);
  });

  // ---------- list actions ----------
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'add') return openForm();
    const id = btn.closest('[data-id]')?.dataset.id;
    const s = subs.find((x) => x.id === id);
    if (!s) return;
    if (action === 'edit') openForm(id);
    else if (action === 'ics') downloadICS([s], slug(s.name));
    else if (action === 'unused') {
      s.unused = !s.unused;
      saveSubs();
      render();
      toast(s.unused ? `Flagged ${s.name}: cancel it to save ${money(yearly(s), s.currency)}/yr` : `${s.name} unflagged`);
    }
  });
  $('#addBtn').addEventListener('click', () => openForm());

  // ---------- .ics ----------
  const enc = new TextEncoder();
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'subscription';
  const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, (m) => '\\' + m);
  const icsDate = (iso) => iso.replace(/-/g, '');
  function fold(line) { // RFC 5545: lines at most 75 octets
    let out = '', n = 0;
    for (const ch of line) {
      const b = enc.encode(ch).length;
      if (n + b > 75) { out += '\r\n '; n = 1; }
      out += ch; n += b;
    }
    return out;
  }
  function rrule(s) {
    const day = parse(s.anchor).getDate();
    if (s.cycle === 'weekly') return 'FREQ=WEEKLY';
    if (s.cycle === 'custom') return `FREQ=DAILY;INTERVAL=${s.days}`;
    if (s.cycle === 'monthly') {
      if (day <= 28) return 'FREQ=MONTHLY';
      const days = []; for (let i = 28; i <= day; i++) days.push(i);
      return `FREQ=MONTHLY;BYMONTHDAY=${days.join(',')};BYSETPOS=-1`; // last of these that exists = clamped day
    }
    const a = parse(s.anchor);
    if (a.getMonth() === 1 && day === 29) return 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1';
    return 'FREQ=YEARLY';
  }
  function alarm(text) {
    const lead = settings.leadDays;
    const trigger = lead > 1 ? `-P${lead - 1}DT15H` : '-PT15H'; // 09:00 local, `lead` days before an all-day event
    return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(text)}`, `TRIGGER:${trigger}`, 'END:VALARM'];
  }
  function vevents(s, stamp) {
    const price = money(s.price, s.currency);
    const desc = [`${price} per ${cycleLabel(s).replace('every ', '')}.`, s.category && `Category: ${s.category}.`,
      s.unused && 'You flagged this as not using. Consider cancelling before it renews.'].filter(Boolean).join(' ');
    const out = ['BEGIN:VEVENT', `UID:${s.id}-renewal@subscription-tracker`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(s.next)}`, `DTEND;VALUE=DATE:${icsDate(toISO(addDays(parse(s.next), 1)))}`,
      `RRULE:${rrule(s)}`, `SUMMARY:${icsText(`${s.name} renews (${price})`)}`, `DESCRIPTION:${icsText(desc)}`,
      'TRANSP:TRANSPARENT', ...alarm(`${s.name} renews in ${settings.leadDays} day(s): ${price}`), 'END:VEVENT'];
    if (trialActive(s)) {
      out.push('BEGIN:VEVENT', `UID:${s.id}-trial@subscription-tracker`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icsDate(s.trial)}`, `DTEND;VALUE=DATE:${icsDate(toISO(addDays(parse(s.trial), 1)))}`,
        `SUMMARY:${icsText(`Free trial ends: ${s.name}`)}`,
        `DESCRIPTION:${icsText(`Cancel before the trial ends if you don't want to pay ${price} per ${cycleLabel(s).replace('every ', '')}.`)}`,
        'TRANSP:TRANSPARENT', ...alarm(`Free trial for ${s.name} ends in ${settings.leadDays} day(s)`), 'END:VEVENT');
    }
    return out;
  }
  function buildICS(items) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Stravix86//Subscription Tracker//EN', 'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH', 'X-WR-CALNAME:Subscriptions', ...items.flatMap((s) => vevents(s, stamp)), 'END:VCALENDAR'];
    return lines.map(fold).join('\r\n') + '\r\n';
  }
  function download(text, filename, type) {
    if (window.NativeApp?.saveFile) return window.NativeApp.saveFile(filename, type, text); // Android app
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = h('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function downloadICS(items, name) {
    if (!items.length) return toast('Nothing to add yet');
    download(buildICS(items), `${name}.ics`, 'text/calendar;charset=utf-8');
    toast('Open the .ics file to add the reminders to your calendar');
  }
  $('#icsAllBtn').addEventListener('click', () => downloadICS(subs, 'subscriptions'));

  // ---------- settings: lead days / theme ----------
  const lead = $('#leadDays');
  lead.value = String(settings.leadDays);
  if (lead.value !== String(settings.leadDays)) { settings.leadDays = 3; lead.value = '3'; }
  lead.addEventListener('change', () => { settings.leadDays = Number(lead.value); saveSettings(); checkReminders(); });

  const THEMES = { auto: ['◐', 'Theme: auto (follows system)'], light: ['☀', 'Theme: light'], dark: ['☾', 'Theme: dark'] };
  function applyTheme() {
    const [icon, label] = THEMES[settings.theme] || THEMES.auto;
    if (settings.theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = settings.theme;
    const b = $('#themeBtn');
    b.textContent = icon; b.title = label; b.setAttribute('aria-label', label);
    const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name="theme-color"]').content = dark ? '#0f1117' : '#4f46e5';
  }
  $('#themeBtn').addEventListener('click', () => {
    const order = ['auto', 'light', 'dark'];
    settings.theme = order[(order.indexOf(settings.theme) + 1) % 3];
    saveSettings();
    applyTheme();
    toast(THEMES[settings.theme][1]);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

  // ---------- export / import ----------
  $('#exportBtn').addEventListener('click', () => {
    const data = { app: 'subscription-tracker', version: 1, exported: new Date().toISOString(),
      settings: { leadDays: settings.leadDays, currency: settings.currency }, subscriptions: subs };
    download(JSON.stringify(data, null, 2), `subscriptions-${toISO(today())}.json`, 'application/json');
    toast(`Exported ${subs.length} subscription${subs.length === 1 ? '' : 's'}`);
  });
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const raw = Array.isArray(data) ? data : data?.subscriptions;
      if (!Array.isArray(raw)) throw new Error('no list');
      const incoming = raw.map(normalize).filter(Boolean);
      if (!incoming.length) return toast('No valid subscriptions found in that file');
      const byId = new Map(subs.map((s) => [s.id, s]));
      let added = 0, updated = 0;
      for (const s of incoming) { byId.has(s.id) ? updated++ : added++; byId.set(s.id, s); }
      subs = [...byId.values()];
      saveSubs();
      render();
      toast(`Imported: ${added} added, ${updated} updated`);
    } catch {
      toast('That file isn\'t a valid Subscription Tracker export');
    }
  });

  // ---------- browser notifications ----------
  const canNotify = 'Notification' in window;
  function updateNotifyBtn() {
    const b = $('#notifyBtn');
    if (!canNotify) { b.hidden = true; return; } // e.g. inside the Android app: calendar reminders cover it
    const on = settings.notify && Notification.permission === 'granted';
    b.textContent = on ? 'Browser notifications: on' : Notification.permission === 'denied'
      ? 'Notifications blocked in browser settings' : 'Enable browser notifications';
    b.setAttribute('aria-pressed', String(on));
  }
  $('#notifyBtn').addEventListener('click', async () => {
    if (!canNotify) return;
    if (settings.notify && Notification.permission === 'granted') {
      settings.notify = false; saveSettings(); updateNotifyBtn(); return toast('Notifications off');
    }
    const p = await Notification.requestPermission();
    settings.notify = p === 'granted';
    saveSettings();
    updateNotifyBtn();
    if (settings.notify) { toast('You\'ll be notified while the app is open'); checkReminders(); }
    else toast('Permission not granted');
  });
  async function notify(title, body, tag) {
    const opts = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' };
    try {
      const reg = 'serviceWorker' in navigator && await navigator.serviceWorker.getRegistration();
      if (reg) await reg.showNotification(title, opts); else new Notification(title, opts);
    } catch { /* ignore */ }
  }
  function checkReminders() {
    if (!canNotify || !settings.notify || Notification.permission !== 'granted') return;
    const t = today(), todayISO = toISO(t);
    const sent = load(NOTIFIED_KEY, {});
    for (const k of Object.keys(sent)) if (k.slice(-10) < todayISO) delete sent[k]; // forget past dates
    for (const s of subs) {
      const n = daysUntil(s.next, t);
      const key = `${s.id}:r:${s.next}`;
      if (n <= settings.leadDays && !sent[key]) {
        sent[key] = 1;
        notify(`${s.name} renews ${whenText(n)}`, `${money(s.price, s.currency)}${s.unused ? ' · you flagged this as not using' : ''}`, key);
      }
      if (trialActive(s, t)) {
        const tn = daysUntil(s.trial, t);
        const tkey = `${s.id}:t:${s.trial}`;
        if (tn <= settings.leadDays && !sent[tkey]) {
          sent[tkey] = 1;
          notify(`Free trial for ${s.name} ends ${whenText(tn)}`, `Cancel before then to avoid paying ${money(s.price, s.currency)}`, tkey);
        }
      }
    }
    store(NOTIFIED_KEY, sent);
  }

  // ---------- boot ----------
  loadSubs();
  applyTheme();
  updateNotifyBtn();
  render();
  checkReminders();
  let lastDay = toISO(today());
  const tick = () => {
    const d = toISO(today());
    if (d !== lastDay) { lastDay = d; render(); }
    checkReminders();
  };
  setInterval(tick, 30 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('storage', (e) => { if (e.key === DATA_KEY) { loadSubs(); render(); } });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
