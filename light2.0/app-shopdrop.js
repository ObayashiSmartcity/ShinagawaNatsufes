/* =========================================================================
 *  app-shopdrop.js — ShopDrop Dashboard logic
 *  元の app.js（LINE版）のデザイン/挙動を踏襲した ShopDrop 版。
 *  【この版の構成】
 *    - KPIは 総登録数 / DROP登録数 / SHOP登録数 の3タイルのみ
 *    - 登録者数グラフは 全体 / DROP / SHOP を切替表示
 *    - ユーザー属性は 性別・年代 のみを 全体/DROP/SHOP の3段で表示
 *    - 流入チャネル・所属セクションは無し
 *  カラー方針: DROP=青(attr) / SHOP=緑(acq) / それ以外=グレー(gray)
 * ========================================================================= */

const CFG = window.DASHBOARD_CONFIG;
const F = CFG.fields;

const C = {
  attr: "#3b82f6", acq: "#22c55e", gray: "#94a3b8",
  grid: "rgba(16,24,40,.08)", tick: "#5b636c",
};

let RAW = [];
let CHART_STORE = {};
let slider = null;
let dateDomain = { min: null, max: null, days: [] };

/* 折れ線グラフの選択セグメント & 現在の期間 */
let linePlat = "all";
let curFrom = null, curTo = null;

/* ========================= helpers ========================= */
const $ = (s) => document.querySelector(s);

function setHTML(sel, html) {
  const el = $(sel);
  if (!el) { console.warn(`[dashboard] 要素が見つかりません: ${sel}`); return false; }
  el.innerHTML = html;
  return true;
}
function setText(sel, txt) {
  const el = $(sel);
  if (!el) { console.warn(`[dashboard] 要素が見つかりません: ${sel}`); return false; }
  el.textContent = txt;
  return true;
}
function safe(label, fn) {
  try { fn(); } catch (e) { console.error(`[dashboard] ${label} でエラー:`, e); }
}
const toDate = (s) => (s ? new Date(String(s).replace(" ", "T").replace(/\//g, "-")) : null);
const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
};
const fmtDay = (k) => { const [ , m, dd] = k.split("-"); return `${m}/${dd}`; };
const startOf = (d)=>{const x=new Date(d);x.setHours(0,0,0,0);return x;};
const endOf   = (d)=>{const x=new Date(d);x.setHours(23,59,59,999);return x;};

function niceCeil(v) {
  if (v <= 5) return v + 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
}

function tokens(val, splitComma) {
  if (val === undefined || val === null) return [];
  const s = String(val).trim();
  if (!s) return [];
  if (splitComma === false) return [s];
  return s.split(",").map(t => t.trim()).filter(Boolean);
}

function ageBandOf(r) {
  const g = r[F.ageGroup];
  return (g === undefined || g === null) ? "" : String(g).trim();
}

/* 登録プラットフォーム(SHOP / DROP) を導出 */
function platformOf(r) {
  const hasShop = r[F.shopId] != null && String(r[F.shopId]).trim() !== "";
  const hasDrop = r[F.dropId] != null && String(r[F.dropId]).trim() !== "";
  if (hasShop && hasDrop) return "SHOP / DROP 両方";
  if (hasShop) return "SHOP";
  if (hasDrop) return "DROP";
  return "";
}
const isDrop = (r) => platformOf(r).indexOf("DROP") >= 0;
const isShop = (r) => platformOf(r).indexOf("SHOP") >= 0;

/* ========================= boot ========================= */
async function boot() {
  bindNav();
  bindLineSeg();
  if (typeof Chart === "undefined") {
    setHTML("#content", `<div class="state err">Chart.js の読み込みに失敗しました。<br>
      <span style="color:var(--dim)">ネットワーク/CDN到達（インターネット接続）をご確認ください。</span></div>`);
    return;
  }
  try {
    const res = await fetch(CFG.DATA_SOURCE + "?_=" + Date.now());
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    RAW = Array.isArray(json) ? json : (json.records || []);
    if (!RAW.length) throw new Error("records empty");

    buildDateDomain();
    buildSlider();
    render(dateDomain.min, dateDomain.max);

    const genRaw = (!Array.isArray(json) && json.generated_at) ? json.generated_at : null;
    let genDate = toDate(genRaw);
    if (genDate && !isNaN(genDate)) {
      genDate.setDate(genDate.getDate() - 1);
      setText("#genAt", dayKey(startOf(genDate)));
    } else {
      setText("#genAt", dayKey(startOf(dateDomain.max)));
    }
    setText("#recCount", RAW.length.toLocaleString());
  } catch (e) {
    console.error(e);
    const isFetch = (e instanceof TypeError) || /fetch|HTTP|Failed/.test(e.message || "");
    const msg = isFetch
      ? `データの取得に失敗しました（${e.message}）。<br>
         <span style="color:var(--dim)">HTML を直接ダブルクリックで開くとブラウザ制約で JSON を読めません。
         フォルダ内で <code>python -m http.server</code> を起動し <b>http://localhost:8000</b> からアクセスしてください。</span>`
      : `描画中にエラーが発生しました（${e.message}）。<br>
         <span style="color:var(--dim)">キャッシュに古い HTML が残っている可能性があります。
         <b>Ctrl+Shift+R</b>でスーパーリロードしてください。</span>`;
    setHTML("#content", `<div class="state err">${msg}</div>`);
  }
}

/* ---- Analyticsメニュー: クリックで該当セクションへスクロール ---- */
function bindNav() {
  const items = document.querySelectorAll(".nav-item[data-target]");
  items.forEach(item => {
    item.addEventListener("click", () => {
      items.forEach(x => x.classList.remove("active"));
      item.classList.add("active");
      const target = document.getElementById(item.dataset.target);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  const sections = [...items].map(i => document.getElementById(i.dataset.target)).filter(Boolean);
  if (!sections.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        const id = en.target.id;
        items.forEach(x => x.classList.toggle("active", x.dataset.target === id));
      }
    });
  }, { rootMargin: "-20% 0px -70% 0px", threshold: 0 });
  sections.forEach(s => io.observe(s));
}

/* ---- 折れ線グラフの 全体/DROP/SHOP 切替 ---- */
function bindLineSeg() {
  const seg = $("#lineSeg");
  if (!seg) { console.warn("[dashboard] #lineSeg が見つかりません"); return; }
  seg.querySelectorAll("button").forEach(b => {
    b.addEventListener("click", () => {
      seg.querySelectorAll("button").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      linePlat = b.dataset.plat || "all";
      const f = curFrom || dateDomain.min;
      const t = curTo || dateDomain.max;
      if (f && t) safe("折れ線", () => renderTimeseries(f, t, linePlat));
    });
  });
}

function buildDateDomain() {
  const ds = RAW.map(r => toDate(r[F.addedAt])).filter(Boolean).sort((a,b)=>a-b);
  const min = startOf(ds[0]);
  const max = startOf(ds[ds.length-1]);
  const days = [];
  for (let d = new Date(min); d <= max; d.setDate(d.getDate()+1)) days.push(dayKey(new Date(d)));
  dateDomain = { min, max, days };
}

/* ========================= slider ========================= */
function buildSlider() {
  const el = $("#dateSlider");
  if (!el) { console.warn("[dashboard] #dateSlider が見つかりません"); return; }
  if (typeof noUiSlider === "undefined") { console.warn("[dashboard] noUiSlider が未ロードです"); return; }
  const minTs = dateDomain.min.getTime();
  const maxTs = dateDomain.max.getTime();
  const DAY = 86400000;

  slider = noUiSlider.create(el, {
    start: [minTs, maxTs],
    connect: true,
    step: DAY,
    range: { min: minTs, max: maxTs === minTs ? minTs + DAY : maxTs },
    tooltips: [ tipFmt(), tipFmt() ],
  });
  slider.on("update", (vals) => {
    setText("#readoutFrom", dayKey(new Date(+vals[0])));
    setText("#readoutTo",   dayKey(new Date(+vals[1])));
  });
  slider.on("change", (vals) => render(new Date(+vals[0]), new Date(+vals[1])));
}
const tipFmt = () => ({ to: (v) => dayKey(new Date(+v)), from: (v) => v });

/* ========================= aggregation ========================= */
function inRange(r, from, to) {
  const d = toDate(r[F.addedAt]);
  return d && d >= startOf(from) && d <= endOf(to);
}
function valueOf(r, field) {
  if (field === "__ageGroup") return ageBandOf(r);
  if (field === "__platform") return platformOf(r);
  return r[field];
}
function countBy(rows, field, opts = {}) {
  const map = new Map();
  rows.forEach(r => {
    const toks = tokens(valueOf(r, field), opts.splitComma);
    if (!toks.length) {
      if (opts.includeEmpty) map.set(CFG.emptyLabel, (map.get(CFG.emptyLabel)||0)+1);
      return;
    }
    toks.forEach(t => map.set(t, (map.get(t)||0)+1));
  });
  let arr = [...map.entries()].sort((a,b)=>b[1]-a[1]);
  if (CFG.topN) arr = arr.slice(0, CFG.topN);
  return { labels: arr.map(a=>a[0]), values: arr.map(a=>a[1]) };
}

/* ========================= render ========================= */
function render(from, to) {
  curFrom = from; curTo = to;
  const rows = RAW.filter(r => inRange(r, from, to));
  safe("KPI",        () => renderKPIs(rows));
  safe("折れ線",      () => renderTimeseries(from, to, linePlat));
  safe("属性(3段)",   () => renderAttributes(rows));
  safe("メタ更新",     () => updateMeta(rows));
}

/* ---- KPI (3タイル: 総登録数 / DROP / SHOP) ---- */
function renderKPIs(rows) {
  const total  = rows.length;
  const dropU  = rows.filter(isDrop).length;
  const shopU  = rows.filter(isShop).length;
  const vals = { total, dropUsers: dropU, shopUsers: shopU };

  const html = CFG.kpis.map(k => {
    const accent = k.accent || "";
    const v = vals[k.key] ?? 0;
    const unit = k.unit ? `<span class="u">${k.unit}</span>` : "";
    return `
      <div class="kpi ${accent}">
        <div class="k-label">${k.label}</div>
        <div class="k-val">${v.toLocaleString()}${unit}</div>
        <div class="k-cap">${k.caption}</div>
      </div>`;
  });
  setHTML("#kpisRow1", html.join(""));
}

/* ---- 折れ線: 日毎の登録者数（全体 / DROP / SHOP 切替）---- */
function renderTimeseries(from, to, plat) {
  plat = plat || "all";
  const fromK = dayKey(startOf(from)), toK = dayKey(startOf(to));
  const days = dateDomain.days.filter(d => d >= fromK && d <= toK);

  const platMatch = (r) => plat === "DROP" ? isDrop(r) : plat === "SHOP" ? isShop(r) : true;

  const perDay = new Map(days.map(d => [d, 0]));
  RAW.forEach(r => {
    if (!platMatch(r)) return;
    const d = toDate(r[F.addedAt]); if (!d) return;
    const k = dayKey(startOf(d));
    if (perDay.has(k)) perDay.set(k, perDay.get(k)+1);
  });

  let series = days.map(d => perDay.get(d));
  if (CFG.timeseries.cumulative) { let acc=0; series = series.map(v => (acc += v)); }
  const peak = Math.max(1, ...series);
  const sum  = series.reduce((a,b)=>a+b,0);
  const dynMax = niceCeil(Math.ceil(peak * CFG.timeseries.headroom));
  const segLabel = plat === "DROP" ? "DROP" : plat === "SHOP" ? "SHOP" : "全体";
  setText("#lineMeta", `［${segLabel}］合計 ${sum}名 / ピーク ${peak}名 / 上限 ${dynMax}（自動）`);

  /* セグメント色: DROP=青 / SHOP=緑 / 全体=グレー */
  const rgb = plat === "DROP" ? "59,130,246" : plat === "SHOP" ? "34,197,94" : "148,163,184";
  const lineColor = `rgb(${rgb})`;

  destroy("line");
  const canvas = $("#lineChart");
  if (!canvas) { console.warn("[dashboard] #lineChart が見つかりません"); return; }
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0,0,0,300);
  grad.addColorStop(0, `rgba(${rgb},.28)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);

  CHART_STORE.line = new Chart(ctx, {
    type: "line",
    data: {
      labels: days.map(fmtDay),
      datasets: [{
        label: "登録者数", data: series,
        borderColor: lineColor, backgroundColor: grad, fill: true, tension: .35,
        pointRadius: 3, pointBackgroundColor: lineColor, pointBorderColor: "#ffffff",
        pointBorderWidth: 2, borderWidth: 2.5,
      }],
    },
    options: baseOpts({ yMax: dynMax, yStep: dynMax <= 10 ? 1 : undefined }),
  });
}

/* ---- ユーザー属性: 性別・年代を横並び / 全体・DROP・SHOP を縦3段 ---- */
function renderAttributes(rows) {
  const host = $("#attrGrid");
  if (!host) { console.warn("[dashboard] #attrGrid が見つかりません"); return; }
  host.innerHTML = "";

  const segs = [
    { key:"all",  label:"全体", cls:"tier-all",  color:C.gray, match:()=>true },
    { key:"drop", label:"DROP", cls:"tier-drop", color:C.attr, match:isDrop },
    { key:"shop", label:"SHOP", cls:"tier-shop", color:C.acq,  match:isShop },
  ];
  const charts = CFG.attributeCharts; // 性別 / 年代

  segs.forEach(seg => {
    const sub = rows.filter(seg.match);

    // 段ラベル（人数付き）
    host.insertAdjacentHTML("beforeend",
      `<div class="tier-label ${seg.cls}">
         <span class="tier-name">${seg.label}</span>
         <span class="tier-count">${sub.length.toLocaleString()}名</span>
       </div>`);

    // 段内に 性別 + 年代 を横並び（2カラム）
    let panels = "";
    charts.forEach(c => {
      const canvasId = `attr_${seg.key}_${c.key}`;
      const realField = (c.field && c.field.indexOf("__") === 0) ? c.field : (F[c.field] || c.field);
      const agg = countBy(sub, realField, { splitComma: !!c.multi });
      panels += agg.labels.length
        ? panelCanvas(c.title, canvasId, seg.label, agg.labels.length)
        : panelEmpty(c.title, seg.label);
    });
    host.insertAdjacentHTML("beforeend", `<div class="grid-2 ${seg.cls}">${panels}</div>`);

    // 描画（段の色で単色塗り）
    charts.forEach(c => {
      const canvasId = `attr_${seg.key}_${c.key}`;
      const realField = (c.field && c.field.indexOf("__") === 0) ? c.field : (F[c.field] || c.field);
      const agg = countBy(sub, realField, { splitComma: !!c.multi });
      if (agg.labels.length) drawBarH(canvasId, agg, [seg.color], 0);
    });
  });
}

/* ---- 横棒グラフ ---- */
function drawBarH(canvasId, agg, palette, seed=0) {
  destroy(canvasId);
  const el = document.getElementById(canvasId);
  if (!el) { console.warn(`[dashboard] canvas #${canvasId} が見つかりません`); return; }
  const ctx = el.getContext("2d");
  CHART_STORE[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: agg.labels,
      datasets: [{
        data: agg.values,
        backgroundColor: agg.labels.map((_,i)=>palette[(i+seed)%palette.length]),
        borderRadius: 0, barThickness: 18, maxBarThickness: 22,
      }],
    },
    options: baseOpts({ horizontal: true, xStep: 1 }),
  });
}

/* ---- meta 更新 ---- */
function updateMeta(rows) {
  const dropU = rows.filter(isDrop).length;
  const shopU = rows.filter(isShop).length;
  setText("#attrMeta", `全体 ${rows.length} · DROP ${dropU} · SHOP ${shopU}`);
}

/* ========================= chart option factory ========================= */
function baseOpts({ yMax, yStep, xStep, horizontal } = {}) {
  const catAxis = horizontal ? "y" : "x";
  const valAxis = horizontal ? "x" : "y";
  const scales = {};
  scales[catAxis] = {
    grid: { display: false, drawBorder: false },
    ticks: {
      color: C.tick, font: { size: 11 }, autoSkip: false,
      callback: function(v){
        const l = this.getLabelForValue(v);
        return (typeof l==="string" && l.length>14) ? l.slice(0,14)+"…" : l;
      },
    },
  };
  scales[valAxis] = {
    beginAtZero: true,
    ...(yMax!=null ? { max: yMax } : {}),
    grid: { color: C.grid, drawBorder: false },
    ticks: {
      color: C.tick, font: { size: 11 }, precision: 0,
      ...(yStep ? { stepSize: yStep } : {}),
      ...(xStep ? { stepSize: xStep } : {}),
    },
  };
  return {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 500, easing: "easeOutQuart" },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#1b1f24", borderColor: "#2a3038", borderWidth: 1,
        titleColor: "#e8ecef", bodyColor: "#c9d1d9",
        padding: 10, cornerRadius: 8, displayColors: false,
      },
    },
    scales,
  };
}

/* ========================= dom helpers ========================= */
function panelCanvas(title, id, tag, itemCount) {
  const h = Math.max(160, itemCount * 34 + 30);
  return `
    <div class="panel">
      <div class="panel-head">
        <h3>${title}</h3>
        <span class="sub">${tag}</span>
      </div>
      <div class="chart-box auto" style="height:${h}px"><canvas id="${id}"></canvas></div>
    </div>`;
}
function panelEmpty(title, tag) {
  return `
    <div class="panel">
      <div class="panel-head"><h3>${title}</h3><span class="sub">${tag}</span></div>
      <div class="empty-state"><div><b>No Data</b>選択期間に該当データがありません</div></div>
    </div>`;
}
function destroy(key) {
  if (CHART_STORE[key]) { CHART_STORE[key].destroy(); delete CHART_STORE[key]; }
}

/* ========================= go ========================= */
document.addEventListener("DOMContentLoaded", boot);
