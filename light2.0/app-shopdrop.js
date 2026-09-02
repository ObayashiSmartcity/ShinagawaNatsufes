/* =========================================================================
 *  app-shopdrop.js — ShopDrop Dashboard logic
 *  元の app.js（LINE版）のロジックを踏襲した ShopDrop 版。
 *  - Analyticsメニュー → セクションへスムーズスクロール
 *  - 属性=青 / 流入=緑 / エンゲージメント=紫 / その他=グレー
 *  - 横棒グラフ化 / 空データ時の No Data 表示 / KPI 2段8指標
 *  【ShopDrop 版の差分】
 *    - データマートが「配列そのまま」の形式でも {records:[]} 形式でも読める
 *    - 年代は age_group（バンド済み）を直接利用（生年月日計算は不要）
 *    - 登録プラットフォーム(SHOP/DROP) を shop_user_id / drop_account_id から導出
 * ========================================================================= */

const CFG = window.DASHBOARD_CONFIG;
const F = CFG.fields;

/* ---- Palette (config accents と対応) ---- */
const C = {
  attr: "#3b82f6", acq: "#22c55e", rich: "#a855f7", gray: "#94a3b8",
  grid: "rgba(16,24,40,.08)", tick: "#5b636c",
};
const attrPalette = ["#3b82f6","#60a5fa","#2563eb","#1d4ed8","#93c5fd","#38bdf8","#0ea5e9","#1e40af"];
const acqPalette  = ["#22c55e","#2fbf71","#16a34a","#3ddc84","#0e9f6e","#65d6a0","#0b7d54","#4ade80"];
const richPalette = ["#a855f7","#c084fc","#9333ea","#7c3aed","#d8b4fe","#8b5cf6","#6d28d9","#e9d5ff"];

let RAW = [];
let CHART_STORE = {};
let slider = null;
let dateDomain = { min: null, max: null, days: [] };

/* ========================= helpers ========================= */
const $ = (s) => document.querySelector(s);

/* --- 安全セッター: 要素が無ければ警告のみ（全体は止めない）--- */
function setHTML(sel, html) {
  const el = $(sel);
  if (!el) { console.warn(`[dashboard] 要素が見つかりません: ${sel}（HTMLを確認/再読込してください）`); return false; }
  el.innerHTML = html;
  return true;
}
function setText(sel, txt) {
  const el = $(sel);
  if (!el) { console.warn(`[dashboard] 要素が見つかりません: ${sel}`); return false; }
  el.textContent = txt;
  return true;
}
/* --- 描画処理を安全に実行（1箇所の失敗で全体を止めない）--- */
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

/* multi-select / comma-joined を分割 */
function tokens(val, splitComma) {
  if (val === undefined || val === null) return [];
  const s = String(val).trim();
  if (!s) return [];
  if (splitComma === false) return [s];
  return s.split(",").map(t => t.trim()).filter(Boolean);
}

/* ---- ShopDrop 版: 年代（age_group はバンド済み文字列） ---- */
function ageBandOf(r) {
  const g = r[F.ageGroup];
  return (g === undefined || g === null) ? "" : String(g).trim();
}
/* 年代バンド → 代表年齢（中央値）。平均年代KPIの算出に使用 */
const AGE_MID = { "10代": 15, "20代": 25, "30代": 35, "40代": 45, "50代": 55, "60代": 65, "70代": 75 };
function ageMid(r) {
  const b = ageBandOf(r);
  return AGE_MID[b] ?? null;
}

/* ---- ShopDrop 版: 登録プラットフォーム(SHOP / DROP) を導出 ---- */
function platformOf(r) {
  const hasShop = r[F.shopId] !== undefined && r[F.shopId] !== null && String(r[F.shopId]).trim() !== "";
  const hasDrop = r[F.dropId] !== undefined && r[F.dropId] !== null && String(r[F.dropId]).trim() !== "";
  if (hasShop && hasDrop) return "SHOP / DROP 両方";
  if (hasShop) return "SHOP";
  if (hasDrop) return "DROP";
  return "";
}

/* ========================= boot ========================= */
async function boot() {
  bindNav();
  if (typeof Chart === "undefined") {
    setHTML("#content", `<div class="state err">Chart.js の読み込みに失敗しました。<br>
      <span style="color:var(--dim)">ネットワーク/CDN到達（インターネット接続）をご確認ください。</span></div>`);
    return;
  }
  try {
    const res = await fetch(CFG.DATA_SOURCE + "?_=" + Date.now());
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    // 配列そのまま / {records:[]} どちらの形式でも読み込めるようにする
    RAW = Array.isArray(json) ? json : (json.records || []);
    if (!RAW.length) throw new Error("records empty");

    buildDateDomain();
    buildSlider();
    render(dateDomain.min, dateDomain.max);

    // データマートのアップデート日: generated_at があればその前日、無ければ最新登録日
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
         <span style="color:var(--dim)">ブラウザのキャッシュに古い HTML が残っている可能性があります。
         <b>Ctrl+Shift+R（Mac は ⌘+Shift+R）でスーパーリロード</b>してください。</span>`;
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

  // スクロール位置に応じて active を自動同期
  const sections = [...items].map(i => document.getElementById(i.dataset.target)).filter(Boolean);
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
  if (typeof noUiSlider === "undefined") { console.warn("[dashboard] noUiSlider が未ロードです（CDN到達を確認）"); return; }
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

/* ========================= filtering / aggregation ========================= */
function inRange(r, from, to) {
  const d = toDate(r[F.addedAt]);
  return d && d >= startOf(from) && d <= endOf(to);
}

/* 計算フィールド(__xxx)にも対応した値の取り出し */
function valueOf(r, field) {
  if (field === "__ageGroup") return ageBandOf(r);
  if (field === "__platform") return platformOf(r);
  return r[field];
}

function countBy(rows, field, opts = {}) {
  const map = new Map();
  rows.forEach(r => {
    const val = valueOf(r, field);
    const toks = tokens(val, opts.splitComma);
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
  const rows = RAW.filter(r => inRange(r, from, to));
  safe("KPI",         () => renderKPIs(rows));
  safe("折れ線",       () => renderTimeseries(from, to));
  safe("属性チャート",  () => renderCharts(rows, CFG.attributeCharts,  "#attrGrid", attrPalette, "属性"));
  safe("流入チャート",  () => renderCharts(rows, CFG.acquisitionCharts,"#acqGrid",  acqPalette,  "流入"));
  safe("行動チャート",  () => renderCharts(rows, CFG.engagementCharts, "#engGrid",  richPalette, "所属"));
  safe("メタ更新",      () => updateMeta(rows));
}

/* ---- KPI (2段8指標) ---- */
function renderKPIs(rows) {
  const total    = rows.length;
  const deleted  = rows.filter(r => String(r[F.blocked]) === "1").length;
  const active   = total - deleted;
  const answered = rows.filter(r => tokens(r[F.gender]).length || tokens(r[F.area]).length).length;
  const shopU    = rows.filter(r => platformOf(r).indexOf("SHOP") >= 0).length;
  const dropU    = rows.filter(r => platformOf(r).indexOf("DROP") >= 0).length;

  const byMonth = {};
  rows.forEach(r => { const m = (r[F.addedAt]||"").slice(0,7); if (m) byMonth[m]=(byMonth[m]||0)+1; });
  const months = Object.keys(byMonth).sort();
  const lastMonth = months.length ? byMonth[months[months.length-1]] : 0;

  const mids = rows.map(ageMid).filter(a => a !== null);
  const avgAge = mids.length ? Math.round(mids.reduce((a,b)=>a+b,0)/mids.length) : 0;

  const pct = (n)=> total ? Math.round(n/total*100) : 0;
  const vals = {
    total, activeRate: pct(active), deleteRate: pct(deleted), answerRate: pct(answered),
    lastMonth, shopUsers: shopU, dropUsers: dropU, avgAge,
  };

  const html = CFG.kpis.map(k => {
    const accent = k.accent === "attr" ? "attr" : k.accent === "acq" ? "acq"
                 : k.accent === "rich" ? "rich" : "";
    const v = vals[k.key] ?? 0;
    const unit = k.unit ? `<span class="u">${k.unit}</span>` : "";
    return `
      <div class="kpi ${accent}">
        <div class="k-label">${k.label}</div>
        <div class="k-val">${v.toLocaleString()}${unit}</div>
        <div class="k-cap">${k.caption}</div>
      </div>`;
  });
  setHTML("#kpisRow1", html.slice(0,4).join(""));
  setHTML("#kpisRow2", html.slice(4).join(""));
}

/* ---- 折れ線: 日毎の登録者数 (Y軸上限 動的) ---- */
function renderTimeseries(from, to) {
  const fromK = dayKey(startOf(from)), toK = dayKey(startOf(to));
  const days = dateDomain.days.filter(d => d >= fromK && d <= toK);

  const perDay = new Map(days.map(d => [d, 0]));
  RAW.forEach(r => {
    const d = toDate(r[F.addedAt]); if (!d) return;
    const k = dayKey(startOf(d));
    if (perDay.has(k)) perDay.set(k, perDay.get(k)+1);
  });

  let series = days.map(d => perDay.get(d));
  if (CFG.timeseries.cumulative) { let acc=0; series = series.map(v => (acc += v)); }
  const peak = Math.max(1, ...series);
  const dynMax = niceCeil(Math.ceil(peak * CFG.timeseries.headroom));
  setText("#lineMeta", `ピーク ${peak}名 / 上限 ${dynMax}（自動）`);

  destroy("line");
  const canvas = $("#lineChart");
  if (!canvas) { console.warn("[dashboard] #lineChart が見つかりません"); return; }
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0,0,0,300);
  grad.addColorStop(0, "rgba(148,163,184,.28)");
  grad.addColorStop(1, "rgba(148,163,184,0)");

  CHART_STORE.line = new Chart(ctx, {
    type: "line",
    data: {
      labels: days.map(fmtDay),
      datasets: [{
        label: "登録者数", data: series,
        borderColor: C.gray, backgroundColor: grad, fill: true, tension: .35,
        pointRadius: 3, pointBackgroundColor: C.gray, pointBorderColor: "#ffffff",
        pointBorderWidth: 2, borderWidth: 2.5,
      }],
    },
    options: baseOpts({ yMax: dynMax, yStep: dynMax <= 10 ? 1 : undefined }),
  });
}

/* ---- ドメイン別 横棒グラフ群（空データは No Data 表示）---- */
function renderCharts(rows, list, hostSel, palette, tag) {
  const host = $(hostSel);
  if (!host) { console.warn(`[dashboard] ${hostSel} が見つかりません`); return; }
  host.innerHTML = "";
  list.forEach((c, i) => {
    const canvasId = `${hostSel.slice(1)}_${c.key}`;
    // config は別名(gender等)を使うので実データのキー(Q1_単一選択等)へ解決
    const realField = (c.field && c.field.indexOf("__") === 0) ? c.field : (F[c.field] || c.field);
    const split = c.multi ? true : false;
    const agg = countBy(rows, realField, { includeEmpty: false, splitComma: split });

    if (!agg.labels.length) {
      host.insertAdjacentHTML("beforeend", panelEmpty(c.title, tag));
      return;
    }
    host.insertAdjacentHTML("beforeend", panelCanvas(c.title, canvasId, tag, agg.labels.length));
    drawBarH(canvasId, agg, palette, i);
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
  const shopU = rows.filter(r => platformOf(r).indexOf("SHOP") >= 0).length;
  const dropU = rows.filter(r => platformOf(r).indexOf("DROP") >= 0).length;
  setText("#richMeta", `所属企業 判明 ${rows.filter(r=>tokens(r[F.enterprise]).length).length}件`);
  setText("#attrMeta", `対象 ${rows.length}名 · 上位${CFG.topN}`);
  setText("#acqMeta",  `SHOP ${shopU} · DROP ${dropU}`);
}

/* ========================= chart option factory ========================= */
function baseOpts({ yMax, yStep, xStep, horizontal } = {}) {
  const catAxis = horizontal ? "y" : "x";  // カテゴリ軸
  const valAxis = horizontal ? "x" : "y";  // 数値軸
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
  const h = Math.max(160, itemCount * 34 + 30); // 項目数に応じて高さ可変
  return `
    <div class="panel">
      <div class="panel-head">
        <h3>${title}</h3>
        <span class="sub">${tag} · 上位${CFG.topN}</span>
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
