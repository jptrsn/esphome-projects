"use strict";
/* =============================================================================
   Pet Feeder UI
   Mounts into <esp-app> (the ESPHome web_server shell element).
   Served as /0.js via js_include in the device's web_server config; the UI
   talks to that same device over its REST API + SSE (see EspAdapter).

   Schedule shape (matches firmware contract):
     { "0": {d,h,m,p,e}, "2": {...} }   sparse object, keys "0".."9"
     d = weekday bitmap  h = hour  m = minute  p = portions  e = enabled
============================================================================= */

/* ---- Styles (injected into <head> so they apply globally) ------------- */
(function fixViewport() {
  // The ESPHome shell generates its own <head>; we can't rely on the dev
  // harness viewport meta reaching the device. Set/replace it from JS.
  let vm = document.querySelector('meta[name="viewport"]');
  if (!vm) { vm = document.createElement("meta"); vm.name = "viewport"; document.head.appendChild(vm); }
  vm.content = "width=device-width, initial-scale=1, viewport-fit=cover";
})();

(function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `
  /* ---- design tokens -------------------------------------------------- */
  :root {
    --pf-bg:         #FBF7F0;
    --pf-surface:    #FFFFFF;
    --pf-surface-2:  #F4EEE4;
    --pf-ink:        #2B2622;
    --pf-muted:      #8A817A;
    --pf-hairline:   rgba(43,38,34,.10);
    --pf-accent:     #E8821E;
    --pf-accent-deep:#C8650A;
    --pf-accent-tint:rgba(232,130,30,.12);
    --pf-ok:         #4C9A6A;
    --pf-warn:       #D69A21;
    --pf-alert:      #D9534F;
    --pf-radius:     16px;
    --pf-radius-sm:  10px;
    --pf-mono: ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
    --pf-sans: system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    --pf-shadow: 0 1px 2px rgba(43,38,34,.04),0 6px 20px rgba(43,38,34,.06);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --pf-bg:          #17140F;
      --pf-surface:     #231F1A;
      --pf-surface-2:   #2C2720;
      --pf-ink:         #EDE7DD;
      --pf-muted:       #9C9286;
      --pf-hairline:    rgba(237,231,221,.12);
      --pf-accent-tint: rgba(232,130,30,.16);
      --pf-shadow:      0 1px 2px rgba(0,0,0,.3),0 6px 20px rgba(0,0,0,.35);
    }
  }

  /* ---- reset + base --------------------------------------------------- */
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    font-family: var(--pf-sans);
    color: var(--pf-ink);
    background: var(--pf-bg);
    -webkit-font-smoothing: antialiased;
    line-height: 1.45;
    padding: max(12px, env(safe-area-inset-top)) 0
             max(16px, env(safe-area-inset-bottom));
  }
  esp-app { display: block; }

  /* ---- layout --------------------------------------------------------- */
  .pf-wrap { max-width: 600px; margin: 0 auto; padding: 0 16px; }

  /* ---- header --------------------------------------------------------- */
  .pf-header {
    display: flex; align-items: baseline;
    justify-content: space-between; margin: 6px 2px 14px;
  }
  .pf-brand { font-weight: 700; letter-spacing: -.02em; font-size: 20px; }
  .pf-brand small {
    color: var(--pf-muted); font-weight: 600;
    letter-spacing: 0; font-size: 12px; margin-left: 6px;
  }
  .pf-statusline {
    display: flex; gap: 14px;
    font-family: var(--pf-mono); font-size: 12px; color: var(--pf-muted);
  }
  .pf-statusline b { color: var(--pf-ink); font-weight: 600; }
  .pf-status-dot {
    width: 8px; height: 8px; border-radius: 50%;
    display: inline-block; vertical-align: middle; margin-right: 5px;
  }
  .pf-status-dot.ok   { background: var(--pf-ok); }
  .pf-status-dot.warn { background: var(--pf-warn); }
  .pf-status-dot.alert{ background: var(--pf-alert); }

  /* ---- tabs ----------------------------------------------------------- */
  .pf-tabs {
    display: flex; gap: 4px;
    background: var(--pf-surface-2); padding: 4px;
    border-radius: var(--pf-radius-sm); margin-bottom: 16px;
  }
  .pf-tab {
    flex: 1; border: 0; background: transparent; color: var(--pf-muted);
    font-family: var(--pf-sans); font-size: 14px; font-weight: 600;
    padding: 9px; border-radius: 7px; cursor: pointer;
    transition: background .15s, color .15s;
  }
  .pf-tab[aria-selected="true"] {
    background: var(--pf-surface); color: var(--pf-ink);
    box-shadow: var(--pf-shadow);
  }
  .pf-tab:focus-visible { outline: 2px solid var(--pf-accent); outline-offset: 2px; }

  /* ---- cards ---------------------------------------------------------- */
  .pf-card {
    background: var(--pf-surface); border-radius: var(--pf-radius);
    box-shadow: var(--pf-shadow); padding: 18px; margin-bottom: 14px;
  }
  .pf-card-title {
    margin: 0 0 14px; font-size: 13px; font-weight: 700;
    letter-spacing: .04em; text-transform: uppercase; color: var(--pf-muted);
  }

  /* ---- feed hero ------------------------------------------------------ */
  .pf-feed-hero { display: flex; align-items: center; gap: 16px; }

  .pf-stepper {
    display: flex; align-items: center;
    border: 1px solid var(--pf-hairline);
    border-radius: var(--pf-radius-sm); overflow: hidden;
  }
  .pf-stepper-btn {
    width: 44px; height: 52px; border: 0;
    background: var(--pf-surface-2); color: var(--pf-ink);
    font-size: 22px; cursor: pointer;
  }
  .pf-stepper-btn:active     { background: var(--pf-accent-tint); }
  .pf-stepper-btn:focus-visible { outline: 2px solid var(--pf-accent); outline-offset: -2px; }
  .pf-stepper-value {
    min-width: 46px; text-align: center;
    font-family: var(--pf-mono); font-size: 24px; font-weight: 600;
  }
  .pf-stepper-value small {
    display: block; font-family: var(--pf-sans); font-size: 10px;
    font-weight: 600; color: var(--pf-muted);
    text-transform: uppercase; letter-spacing: .05em; margin-top: -3px;
  }

  .pf-btn-feed {
    flex: 1; height: 52px; border: 0;
    border-radius: var(--pf-radius-sm);
    background: var(--pf-accent); color: #fff;
    font-family: var(--pf-sans); font-size: 16px; font-weight: 700;
    cursor: pointer; transition: background .15s, transform .05s;
    box-shadow: 0 2px 0 var(--pf-accent-deep);
  }
  .pf-btn-feed:hover    { background: var(--pf-accent-deep); }
  .pf-btn-feed:active   { transform: translateY(1px); box-shadow: 0 1px 0 var(--pf-accent-deep); }
  .pf-btn-feed:focus-visible { outline: 2px solid var(--pf-accent-deep); outline-offset: 2px; }
  .pf-btn-feed:disabled { background: var(--pf-muted); box-shadow: none; cursor: not-allowed; opacity: .7; }

  .pf-last-feed {
    display: flex; align-items: baseline; gap: 8px;
    margin-top: 14px; padding-top: 14px;
    border-top: 1px solid var(--pf-hairline);
    color: var(--pf-muted); font-size: 13px;
  }
  .pf-last-feed b { font-family: var(--pf-mono); color: var(--pf-ink); font-size: 15px; font-weight: 600; }

  /* ---- meal rows ------------------------------------------------------ */
  .pf-meal {
    display: flex; align-items: center; gap: 12px;
    padding: 13px 2px; border-bottom: 1px solid var(--pf-hairline);
  }
  .pf-meal:last-child { border-bottom: 0; }
  .pf-meal.is-disabled .pf-meal-body { opacity: .42; }

  .pf-meal-time {
    font-family: var(--pf-mono); font-size: 20px;
    font-weight: 600; letter-spacing: -.01em; width: 62px;
  }
  .pf-meal-body   { flex: 1; min-width: 0; }
  .pf-meal-days   { font-size: 13px; margin-top: 1px; }
  .pf-meal-meta   { font-size: 12.5px; color: var(--pf-muted); display: flex; gap: 8px; }
  .pf-meal-portions { font-family: var(--pf-mono); }
  .pf-meal-actions { display: flex; gap: 4px; }

  .pf-icon-btn {
    width: 34px; height: 34px;
    border: 1px solid var(--pf-hairline); background: var(--pf-surface);
    border-radius: 8px; cursor: pointer; color: var(--pf-muted); font-size: 15px;
  }
  .pf-icon-btn:hover { color: var(--pf-ink); border-color: var(--pf-muted); }
  .pf-icon-btn:focus-visible { outline: 2px solid var(--pf-accent); outline-offset: 2px; }

  /* ---- toggle switch -------------------------------------------------- */
  .pf-toggle { position: relative; width: 42px; height: 25px; flex: none; }
  .pf-toggle input { opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; }
  .pf-toggle-track {
    position: absolute; inset: 0;
    background: var(--pf-surface-2); border: 1px solid var(--pf-hairline);
    border-radius: 99px; transition: background .15s; pointer-events: none;
  }
  .pf-toggle-track::after {
    content: ""; position: absolute; top: 2px; left: 2px;
    width: 19px; height: 19px; background: #fff; border-radius: 50%;
    box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform .15s;
  }
  .pf-toggle input:checked + .pf-toggle-track { background: var(--pf-ok); }
  .pf-toggle input:checked + .pf-toggle-track::after { transform: translateX(17px); }
  .pf-toggle input:focus-visible + .pf-toggle-track { outline: 2px solid var(--pf-accent); outline-offset: 2px; }

  /* ---- empty + add row ------------------------------------------------ */
  .pf-empty { text-align: center; color: var(--pf-muted); padding: 26px 10px; font-size: 14px; }
  .pf-add-meal {
    width: 100%; margin-top: 6px; padding: 13px;
    border: 1px dashed var(--pf-hairline); background: transparent;
    color: var(--pf-accent-deep); border-radius: var(--pf-radius-sm);
    font-family: var(--pf-sans); font-size: 14px; font-weight: 600; cursor: pointer;
  }
  .pf-add-meal:hover { border-color: var(--pf-accent); background: var(--pf-accent-tint); }

  /* ---- editor sheet --------------------------------------------------- */
  .pf-sheet-overlay {
    position: fixed; inset: 0; background: rgba(20,16,12,.45);
    display: none; align-items: flex-end; justify-content: center; z-index: 10;
  }
  .pf-sheet-overlay.is-open { display: flex; }
  .pf-sheet {
    background: var(--pf-surface); width: 100%; max-width: 460px;
    border-radius: var(--pf-radius) var(--pf-radius) 0 0;
    padding: 20px 18px max(20px, env(safe-area-inset-bottom));
    box-shadow: 0 -10px 40px rgba(0,0,0,.2);
  }
  @media (min-width: 520px) {
    .pf-sheet-overlay { align-items: center; }
    .pf-sheet { border-radius: var(--pf-radius); }
  }
  .pf-sheet-title { margin: 0 0 16px; font-size: 17px; }

  .pf-field { margin-bottom: 16px; }
  .pf-field-label {
    display: block; font-size: 12px; font-weight: 600; color: var(--pf-muted);
    text-transform: uppercase; letter-spacing: .04em; margin-bottom: 7px;
  }

  .pf-time-row { display: flex; align-items: center; gap: 8px; font-family: var(--pf-mono); }
  .pf-time-input {
    width: 64px; font-family: var(--pf-mono); font-size: 22px; text-align: center;
    padding: 8px; border: 1px solid var(--pf-hairline);
    border-radius: var(--pf-radius-sm);
    background: var(--pf-surface-2); color: var(--pf-ink);
  }
  .pf-time-colon { font-size: 22px; font-weight: 600; }

  .pf-day-presets { display: flex; gap: 6px; margin-bottom: 9px; }
  .pf-day-preset {
    border: 0; background: transparent; color: var(--pf-accent-deep);
    font-size: 12.5px; font-weight: 600; cursor: pointer; padding: 4px 8px; border-radius: 6px;
  }
  .pf-day-preset:hover { background: var(--pf-accent-tint); }

  .pf-day-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .pf-day-chip {
    border: 1px solid var(--pf-hairline); background: var(--pf-surface-2);
    color: var(--pf-muted); border-radius: 99px; padding: 8px 13px;
    font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--pf-sans);
  }
  .pf-day-chip[aria-pressed="true"] {
    background: var(--pf-accent); border-color: var(--pf-accent); color: #fff;
  }
  .pf-day-chip:focus-visible { outline: 2px solid var(--pf-accent); outline-offset: 2px; }

  .pf-sheet-actions { display: flex; gap: 10px; margin-top: 6px; }
  .pf-btn {
    flex: 1; height: 48px; border-radius: var(--pf-radius-sm);
    border: 1px solid var(--pf-hairline); background: var(--pf-surface);
    color: var(--pf-ink); font-family: var(--pf-sans); font-weight: 700; font-size: 15px; cursor: pointer;
  }
  .pf-btn.is-primary {
    background: var(--pf-accent); color: #fff; border-color: var(--pf-accent);
    box-shadow: 0 2px 0 var(--pf-accent-deep);
  }
  .pf-btn.is-danger {
    color: var(--pf-alert); border-color: transparent;
    flex: 0 0 auto; width: 48px; font-size: 18px;
  }
  .pf-btn:focus-visible { outline: 2px solid var(--pf-accent-deep); outline-offset: 2px; }

  /* ---- toast ---------------------------------------------------------- */
  .pf-toast {
    position: fixed; left: 50%; bottom: 24px;
    transform: translateX(-50%) translateY(20px);
    background: var(--pf-ink); color: var(--pf-bg);
    padding: 11px 18px; border-radius: 99px;
    font-size: 14px; font-weight: 600;
    opacity: 0; transition: opacity .2s, transform .2s;
    z-index: 20; pointer-events: none;
  }
  .pf-toast.is-visible { opacity: 1; transform: translateX(-50%) translateY(0); }

  [hidden] { display: none !important; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
  `;
  document.head.appendChild(style);
})();

/* ---- Mount HTML into <esp-app> -------------------------------------- */
(function mountHTML() {
  const app = document.querySelector("esp-app");
  if (!app) return;
  app.innerHTML = `
<div class="pf-wrap">
  <header class="pf-header">
    <div class="pf-brand">Feeder<small id="pf-feed-state">—</small></div>
    <div class="pf-statusline">
      <span><span class="pf-status-dot" id="pf-food-dot"></span><b id="pf-food-level">—</b></span>
      <span><b id="pf-battery">—</b></span>
    </div>
  </header>

  <div class="pf-tabs" role="tablist">
    <button class="pf-tab" id="pf-tab-home" role="tab" aria-selected="true"  aria-controls="pf-view-home">Home</button>
    <button class="pf-tab" id="pf-tab-sched" role="tab" aria-selected="false" aria-controls="pf-view-sched">Schedule</button>
  </div>

  <!-- HOME -->
  <section id="pf-view-home" role="tabpanel" aria-labelledby="pf-tab-home">
    <div class="pf-card">
      <h2 class="pf-card-title">Feed now</h2>
      <div class="pf-feed-hero">
        <div class="pf-stepper">
          <button type="button" class="pf-stepper-btn" id="pf-amt-down" aria-label="Less">−</button>
          <div class="pf-stepper-value"><span id="pf-amt-val">1</span><small>portions</small></div>
          <button type="button" class="pf-stepper-btn" id="pf-amt-up" aria-label="More">+</button>
        </div>
        <button type="button" class="pf-btn-feed" id="pf-feed-now">Feed Now</button>
      </div>
      <div class="pf-last-feed">Last feed&nbsp;<b id="pf-last-feed">—</b></div>
    </div>
    <div class="pf-card">
      <h2 class="pf-card-title">Schedule</h2>
      <div id="pf-home-schedule"></div>
    </div>
  </section>

  <!-- SCHEDULE -->
  <section id="pf-view-sched" role="tabpanel" aria-labelledby="pf-tab-sched" hidden>
    <div class="pf-card">
      <h2 class="pf-card-title">Meals <span id="pf-meal-count" style="float:right;font-family:var(--pf-mono)"></span></h2>
      <div id="pf-sched-list"></div>
      <button type="button" class="pf-add-meal" id="pf-add-meal">+ Add meal</button>
    </div>
  </section>
</div>

<!-- Editor sheet -->
<div class="pf-sheet-overlay" id="pf-sheet-overlay">
  <div class="pf-sheet" role="dialog" aria-modal="true" aria-labelledby="pf-sheet-title">
    <h3 class="pf-sheet-title" id="pf-sheet-title">Add meal</h3>
    <div class="pf-field">
      <label class="pf-field-label">Time</label>
      <div class="pf-time-row">
        <input class="pf-time-input" id="pf-in-hour" type="number" min="0" max="23" inputmode="numeric" aria-label="Hour">
        <span class="pf-time-colon">:</span>
        <input class="pf-time-input" id="pf-in-min" type="number" min="0" max="59" inputmode="numeric" aria-label="Minute">
      </div>
    </div>
    <div class="pf-field">
      <label class="pf-field-label">Portions</label>
      <div class="pf-stepper" style="width:fit-content">
        <button type="button" class="pf-stepper-btn" id="pf-p-down" aria-label="Less">−</button>
        <div class="pf-stepper-value"><span id="pf-p-val">1</span></div>
        <button type="button" class="pf-stepper-btn" id="pf-p-up" aria-label="More">+</button>
      </div>
    </div>
    <div class="pf-field">
      <label class="pf-field-label">Repeat</label>
      <div class="pf-day-presets">
        <button type="button" class="pf-day-preset" data-preset="127">Every day</button>
        <button type="button" class="pf-day-preset" data-preset="124">Weekdays</button>
        <button type="button" class="pf-day-preset" data-preset="3">Weekend</button>
      </div>
      <div class="pf-day-chips" id="pf-day-chips"></div>
    </div>
    <div class="pf-sheet-actions">
      <button type="button" class="pf-btn is-danger" id="pf-del-meal" title="Delete meal" hidden>🗑</button>
      <button type="button" class="pf-btn" id="pf-cancel-edit">Cancel</button>
      <button type="button" class="pf-btn is-primary" id="pf-save-edit">Save</button>
    </div>
  </div>
</div>

<div class="pf-toast" id="pf-toast"></div>
  `;
})();

/* =====================================================================
   DATA ADAPTERS
===================================================================== */

const DAYS = [
  {l:"Mon",b:64},{l:"Tue",b:32},{l:"Wed",b:16},{l:"Thu",b:8},
  {l:"Fri",b:4},{l:"Sat",b:2},{l:"Sun",b:1},
];
const MAX_SLOTS = 10;

/* ---- ESP adapter (device web_server REST + SSE) -------------------- */
class EspAdapter {
  constructor(base = window.location.origin) { this.base = base; this._sse = null; }

  async _get(path) {
    const r = await fetch(this.base + path);
    if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
    return r.json();
  }
  async _post(path) { await fetch(this.base + path, {method:"POST"}); }
  async _postQ(path, params) {
    const qs = new URLSearchParams(params).toString();
    await fetch(`${this.base}${path}?${qs}`, {method:"POST"});
  }
  async _ts(name)   { const d = await this._get(`/text_sensor/${encodeURIComponent(name)}`); return d.state||""; }
  async _sn(name)   { const d = await this._get(`/sensor/${encodeURIComponent(name)}`); return parseFloat(d.state)||0; }

  async getSchedule() {
    const slots = {};
    await Promise.all(Array.from({length:10},(_,i)=>i).map(async i => {
      const raw = await this._ts(`Schedule Slot ${i}`);
      if (raw && raw !== "N/A") {
        try { slots[String(i)] = JSON.parse(raw); } catch(_) {}
      }
    }));
    return slots;
  }

  async _num(name) {
    // number entity lives under /number/, not /sensor/
    const d = await this._get(`/number/${encodeURIComponent(name)}`);
    return parseFloat(d.value ?? d.state) || 0;
  }

  async getStatus() {
    // Each field fetches independently with its own default. allSettled means a
    // single failing entity (e.g. a removed/renamed sensor) degrades just that
    // field instead of rejecting the whole batch and blanking the UI.
    const fields = [
      { key: "feedState",      fetch: () => this._ts("Feed State"),       def: "standby" },
      { key: "foodLevel",      fetch: () => this._ts("Food Level"),       def: "enough"  },
      { key: "battery",        fetch: () => this._sn("Battery"),          def: 0         },
      { key: "lastFeedAmount", fetch: () => this._sn("Last Feed Amount"), def: 0         },
      { key: "feedAmount",     fetch: () => this._num("Feed Amount"),     def: 1         },
    ];
    const results = await Promise.allSettled(fields.map(f => f.fetch()));
    const status = {};
    results.forEach((r, i) => {
      const f = fields[i];
      if (r.status === "fulfilled") {
        status[f.key] = r.value;
      } else {
        console.warn(`getStatus: '${f.key}' failed, using default`, r.reason);
        status[f.key] = f.def;
      }
    });
    status.lastFeedAt = status.lastFeedAmount > 0 ? Date.now() : null;
    return status;
  }

  async setFeedAmount(n)  { await this._postQ("/number/Feed Amount/set", {value:n}); }
  async feedNow()         { await this._post("/button/Feed Now/press"); }
  async patchSchedule(p)  { await this._postQ("/text/Schedule Patch/set", {value: JSON.stringify(p)}); }

  subscribeEvents(onUpdate) {
    if (this._sse) this._sse.close();
    this._sse = new EventSource(this.base + "/events");
    // Debounce: a burst of SSE state events (one per entity on boot/change)
    // collapses into a single refresh 300ms after the last event settles.
    let debounceTimer;
    this._sse.addEventListener("state", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(onUpdate, 300);
    });
  }
}

/* Only one adapter remains: the device serves this app from its own web_server,
   so the UI always talks to that device over REST + SSE. */
const adapter = new EspAdapter();

/* =====================================================================
   HELPERS
===================================================================== */
const $  = s => document.querySelector(s);
const pad      = n => String(n).padStart(2,"0");
const fmtTime  = (h,m) => `${pad(h)}:${pad(m)}`;
const clamp    = (n,lo,hi) => Math.max(lo, Math.min(hi, n));

function daysLabel(d) {
  if (d === 127) return "Every day";
  if (d === 124) return "Weekdays";
  if (d === 3)   return "Weekend";
  const on = DAYS.filter(x => d & x.b);
  return on.length ? on.map(x=>x.l).join(" · ") : "Never";
}
function relTime(ts) {
  if (!ts) return "never";
  const s = Math.round((Date.now()-ts)/1000);
  if (s < 90) return "just now";
  const m = Math.round(s/60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m/60);
  if (h < 36) return `${h} hr ago`;
  return `${Math.round(h/24)} days ago`;
}
function freeSlot(slots) {
  for (let i = 0; i < MAX_SLOTS; i++) if (!(String(i) in slots)) return String(i);
  return null;
}
function orderedSlots(slots) {
  return Object.entries(slots).sort((a,b) =>
    (a[1].h*60+a[1].m) - (b[1].h*60+b[1].m) || (+a[0])-(+b[0]));
}

let _toastTimer;
function toast(msg) {
  const t = $("#pf-toast");
  t.textContent = msg; t.classList.add("is-visible");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove("is-visible"), 1900);
}

/* =====================================================================
   STATE + RENDER
===================================================================== */
let slots = {};
let feedAmount = 1;

async function refresh() {
  slots = await adapter.getSchedule();
  const st = await adapter.getStatus();
  feedAmount = st.feedAmount;

  const feeding = st.feedState === "feeding";
  const btn = $("#pf-feed-now");
  btn.disabled = feeding;
  btn.textContent = feeding ? "Feeding…" : "Feed Now";

  $("#pf-feed-state").textContent = st.feedState;
  $("#pf-food-level").textContent = ({enough:"Food ok",insufficient:"Food low",run_out:"Empty"})[st.foodLevel] || st.foodLevel;
  $("#pf-food-dot").className = "pf-status-dot " + ({enough:"ok",insufficient:"warn",run_out:"alert"})[st.foodLevel];
  $("#pf-battery").textContent = st.battery + "%";
  $("#pf-amt-val").textContent = feedAmount;
  $("#pf-last-feed").textContent = st.lastFeedAmount
    ? `${st.lastFeedAmount} portions · ${relTime(st.lastFeedAt)}` : "—";

  renderSchedule();
}

function buildMealRow(key, meal, withActions) {
  const row = document.createElement("div");
  row.className = "pf-meal" + (meal.e ? "" : " is-disabled");
  row.innerHTML = `
    <div class="pf-meal-time">${fmtTime(meal.h, meal.m)}</div>
    <div class="pf-meal-body">
      <div class="pf-meal-days">${daysLabel(meal.d)}</div>
      <div class="pf-meal-meta"><span class="pf-meal-portions">${meal.p} portion${meal.p>1?"s":""}</span></div>
    </div>`;

  if (withActions) {
    const actions = document.createElement("div");
    actions.className = "pf-meal-actions";

    const toggle = document.createElement("label");
    toggle.className = "pf-toggle";
    toggle.innerHTML = `<input type="checkbox" ${meal.e?"checked":""} aria-label="Enabled"><span class="pf-toggle-track"></span>`;
    toggle.querySelector("input").addEventListener("change", e =>
      applyPatch({[key]:{e:e.target.checked}}, e.target.checked ? "Meal enabled" : "Meal disabled"));

    const editBtn = document.createElement("button");
    editBtn.className = "pf-icon-btn";
    editBtn.textContent = "✎";
    editBtn.setAttribute("aria-label","Edit meal");
    editBtn.onclick = () => openEditor(key, meal);

    actions.append(toggle, editBtn);
    row.append(actions);
  }
  return row;
}

function renderSchedule() {
  const ordered = orderedSlots(slots);

  const homeList = $("#pf-home-schedule");
  homeList.innerHTML = "";
  if (!ordered.length) homeList.innerHTML = `<div class="pf-empty">No meals scheduled.</div>`;
  else ordered.forEach(([k,m]) => homeList.append(buildMealRow(k,m,false)));

  const schedList = $("#pf-sched-list");
  schedList.innerHTML = "";
  if (!ordered.length) schedList.innerHTML = `<div class="pf-empty">No meals yet. Add the first one below.</div>`;
  else ordered.forEach(([k,m]) => schedList.append(buildMealRow(k,m,true)));

  $("#pf-meal-count").textContent = `${ordered.length}/${MAX_SLOTS}`;
  const addBtn = $("#pf-add-meal");
  addBtn.disabled = ordered.length >= MAX_SLOTS;
  addBtn.style.opacity = ordered.length >= MAX_SLOTS ? .4 : 1;
}

async function applyPatch(patch, msg) {
  await adapter.patchSchedule(patch);
  await refresh();
  if (msg) toast(msg);
}

/* =====================================================================
   FEED NOW
===================================================================== */
function setFeedAmount(n) {
  feedAmount = clamp(n, 1, 12);
  $("#pf-amt-val").textContent = feedAmount;
  adapter.setFeedAmount(feedAmount);
}
$("#pf-amt-down").onclick = () => setFeedAmount(feedAmount - 1);
$("#pf-amt-up").onclick   = () => setFeedAmount(feedAmount + 1);
$("#pf-feed-now").onclick = async () => {
  await adapter.feedNow();
  toast(`Feeding ${feedAmount} portion${feedAmount>1?"s":""}…`);
  const poll = setInterval(async () => {
    await refresh();
    const st = await adapter.getStatus();
    if (st.feedState !== "feeding") clearInterval(poll);
  }, 400);
};

/* =====================================================================
   TABS
===================================================================== */
function selectTab(which) {
  const home = which === "home";
  $("#pf-tab-home").setAttribute("aria-selected", home);
  $("#pf-tab-sched").setAttribute("aria-selected", !home);
  $("#pf-view-home").hidden  = !home;
  $("#pf-view-sched").hidden = home;
}
$("#pf-tab-home").onclick  = () => selectTab("home");
$("#pf-tab-sched").onclick = () => selectTab("sched");

/* =====================================================================
   EDITOR SHEET
===================================================================== */
let editKey  = null;
let draftDays = 0;

function renderDayChips() {
  const wrap = $("#pf-day-chips");
  wrap.innerHTML = "";
  DAYS.forEach(d => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "pf-day-chip";
    chip.textContent = d.l;
    chip.setAttribute("aria-pressed", !!(draftDays & d.b));
    chip.onclick = () => {
      draftDays ^= d.b;
      chip.setAttribute("aria-pressed", !!(draftDays & d.b));
    };
    wrap.append(chip);
  });
}

function openEditor(key, meal) {
  editKey = key;
  $("#pf-sheet-title").textContent = key === null ? "Add meal" : "Edit meal";
  $("#pf-del-meal").hidden = key === null;
  const m = meal || {h:8, m:0, p:1, d:127, e:true};
  $("#pf-in-hour").value = m.h;
  $("#pf-in-min").value  = m.m;
  $("#pf-p-val").textContent = m.p;
  draftDays = m.d;
  renderDayChips();
  $("#pf-sheet-overlay").classList.add("is-open");
  $("#pf-in-hour").focus();
}

function closeEditor() {
  $("#pf-sheet-overlay").classList.remove("is-open");
  editKey = undefined;
}

$("#pf-p-down").onclick = () => $("#pf-p-val").textContent = clamp(+$("#pf-p-val").textContent - 1, 1, 12);
$("#pf-p-up").onclick   = () => $("#pf-p-val").textContent = clamp(+$("#pf-p-val").textContent + 1, 1, 12);

document.querySelectorAll(".pf-day-preset").forEach(b =>
  b.onclick = () => { draftDays = +b.dataset.preset; renderDayChips(); });

$("#pf-add-meal").onclick    = () => openEditor(null, null);
$("#pf-cancel-edit").onclick = closeEditor;
$("#pf-sheet-overlay").onclick = e => { if (e.target === $("#pf-sheet-overlay")) closeEditor(); };

$("#pf-del-meal").onclick = async () => {
  if (editKey != null) {
    const k = editKey; closeEditor();
    await applyPatch({[k]: null}, "Meal deleted");
  }
};

$("#pf-save-edit").onclick = async () => {
  const h = clamp(+$("#pf-in-hour").value || 0, 0, 23);
  const m = clamp(+$("#pf-in-min").value  || 0, 0, 59);
  const p = clamp(+$("#pf-p-val").textContent, 1, 12);
  if (draftDays === 0) { toast("Pick at least one day"); return; }
  let key = editKey;
  if (key === null) {
    key = freeSlot(slots);
    if (key === null) { toast("All 10 slots are full"); return; }
  }
  const existing = slots[key] || {};
  const meal = { d:draftDays, h, m, p, e: editKey === null ? true : (existing.e ?? true) };
  closeEditor();
  await applyPatch({[key]: meal}, editKey === null ? "Meal added" : "Meal saved");
};

/* =====================================================================
   BOOT
===================================================================== */
refresh();
adapter.subscribeEvents(refresh);
