/* =========================================================================
 *  dashboard-core.js — 共通ダッシュボードエンジン（LINE / ShopDrop 共有）
 *  ------------------------------------------------------------------------
 *  app.js（LINE版）と app-shopdrop.js（ShopDrop版）で重複していた
 *  ロジックを 1 箇所に集約したコアライブラリ。
 *
 *  各ページは window.DashCore.start({...}) を呼ぶだけでよい。
 *  ページ固有の描画は render() コールバックに、仮想フィールド
 *  （__ageBand / __platform 等）の解決は resolveValue() に委譲する。
 *
 *  依存: Chart.js / noUiSlider / window.DASHBOARD_CONFIG
 * ========================================================================= */
window.DashCore = (function () {
  "use strict";

  const CFG = window.DASHBOARD_CONFIG;
  const F = CFG.fields;

  /* ---- 共通パレット（styles.css の CSS変数に対応）---- */
  const C = {
    attr: "#3b82f6", acq: "#22c55e", rich: "#a855f7", gray: "#94a3b8",
    grid: "rgba(16,24,40,.08)", tick: "#5b636c",
  };

  const DAY_MS = 86400000;

  /* ---- 実行時ステート ---- */
  const state = {
    RAW: [],
    charts: {},
    slider: null,
    dateDomain: { min: null, max: null, days: [] },
    from: null,
    to: null,
  };

  /* ページから注入されるフック（start() で設定）---- */
  let onRender = () => {};                       // (rows) => void  必須
  let resolveValue = (record, field) => record[field]; // 仮想フィールド解決

  /* ========================= DOM / 汎用ヘルパー ========================= */
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
  /* 1 箇所の失敗で画面全体を止めないための安全実行 */
  function safe(label, fn) {
    try { fn(); } catch (e) { console.error(`[dashboard] ${label} でエラー:`, e); }
  }

  /* ========================= 日付ユーティリティ ========================= */
  const toDate = (s) => (s ? new Date(String(s).replace(" ", "T").replace(/\//g, "-")) : null);
  const dayKey = (d) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  };
  const fmtDay = (k) => { const [, m, dd] = k.split("-"); return `${m}/${dd}`; };
  const startOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const endOf   = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

  /* 「切りの良い」上限値へ丸める（Y軸の自動スケール用）*/
  function niceCeil(v) {
    if (v <= 5) return v + 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / mag;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * mag;
  }

  /* multi-select / カンマ結合値をトークン配列へ分割 */
  function tokens(val, splitComma) {
    if (val === undefined || val === null) return [];
    const s = String(val).trim();
    if (!s) return [];
    if (splitComma === false) return [s];
    return s.split(",").map((t) => t.trim()).filter(Boolean);
  }

  /* config のエイリアス(gender 等)を実データのキー(Q1_単一選択 等)へ解決。
     "__" 始まりは仮想フィールドとしてそのまま返す。*/
  function realField(field) {
    if (field && field.indexOf("__") === 0) return field;
    return F[field] || field;
  }

  /* ========================= 集計 ========================= */
  function inRange(r, from, to) {
    const d = toDate(r[F.addedAt]);
    return d && d >= startOf(from) && d <= endOf(to);
  }

  /* 指定フィールドの値を集計して上位N件を返す。
     仮想フィールドは resolveValue() 経由で解決される。*/
  function countBy(rows, field, opts = {}) {
    const map = new Map();
    rows.forEach((r) => {
      const toks = tokens(resolveValue(r, field), opts.splitComma);
      if (!toks.length) {
        if (opts.includeEmpty) map.set(CFG.emptyLabel, (map.get(CFG.emptyLabel) || 0) + 1);
        return;
      }
      toks.forEach((t) => map.set(t, (map.get(t) || 0) + 1));
    });
    let arr = [...map.entries()].sort((a, b) => b[1] - a[1]);
    if (CFG.topN) arr = arr.slice(0, CFG.topN);
    return { labels: arr.map((a) => a[0]), values: arr.map((a) => a[1]) };
  }

  /* ========================= 日付ドメイン / スライダー ========================= */
  function buildDateDomain() {
    const ds = state.RAW.map((r) => toDate(r[F.addedAt])).filter(Boolean).sort((a, b) => a - b);
    const min = startOf(ds[0]);
    const max = startOf(ds[ds.length - 1]);
    const days = [];
    for (let d = new Date(min); d <= max; d.setDate(d.getDate() + 1)) days.push(dayKey(new Date(d)));
    state.dateDomain = { min, max, days };
  }

  const tipFmt = () => ({ to: (v) => dayKey(new Date(+v)), from: (v) => v });

  function buildSlider() {
    const el = $("#dateSlider");
    if (!el) { console.warn("[dashboard] #dateSlider が見つかりません"); return; }
    if (typeof noUiSlider === "undefined") { console.warn("[dashboard] noUiSlider が未ロードです（CDN到達を確認）"); return; }
    const minTs = state.dateDomain.min.getTime();
    const maxTs = state.dateDomain.max.getTime();

    state.slider = noUiSlider.create(el, {
      start: [minTs, maxTs],
      connect: true,
      step: DAY_MS,
      range: { min: minTs, max: maxTs === minTs ? minTs + DAY_MS : maxTs },
      tooltips: [tipFmt(), tipFmt()],
    });
    state.slider.on("update", (vals) => {
      setText("#readoutFrom", dayKey(new Date(+vals[0])));
      setText("#readoutTo",   dayKey(new Date(+vals[1])));
    });
    state.slider.on("change", (vals) => applyRange(new Date(+vals[0]), new Date(+vals[1])));
  }

  /* ========================= ナビゲーション ========================= */
  /* Analyticsメニュー: クリックでセクションへスクロール & スクロール同期 */
  function bindNav() {
    const items = document.querySelectorAll(".nav-item[data-target]");
    items.forEach((item) => {
      item.addEventListener("click", () => {
        items.forEach((x) => x.classList.remove("active"));
        item.classList.add("active");
        const target = document.getElementById(item.dataset.target);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    const sections = [...items].map((i) => document.getElementById(i.dataset.target)).filter(Boolean);
    if (!sections.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          const id = en.target.id;
          items.forEach((x) => x.classList.toggle("active", x.dataset.target === id));
        }
      });
    }, { rootMargin: "-20% 0px -70% 0px", threshold: 0 });
    sections.forEach((s) => io.observe(s));
  }

  /* ========================= チャート描画 ========================= */
  /* 横棒グラフ（属性・流入・行動チャート共通）*/
  function drawBarH(canvasId, agg, palette, seed = 0) {
    destroy(canvasId);
    const el = document.getElementById(canvasId);
    if (!el) { console.warn(`[dashboard] canvas #${canvasId} が見つかりません`); return; }
    const ctx = el.getContext("2d");
    state.charts[canvasId] = new Chart(ctx, {
      type: "bar",
      data: {
        labels: agg.labels,
        datasets: [{
          data: agg.values,
          backgroundColor: agg.labels.map((_, i) => palette[(i + seed) % palette.length]),
          borderRadius: 0, barThickness: 18, maxBarThickness: 22,
        }],
      },
      options: baseOpts({ horizontal: true, xStep: 1 }),
    });
  }

  /* 折れ線グラフ（日毎の登録者数）。rgb は "r,g,b" 文字列で線・塗り色を指定 */
  function drawLine(days, series, dynMax, rgb) {
    destroy("line");
    const canvas = $("#lineChart");
    if (!canvas) { console.warn("[dashboard] #lineChart が見つかりません"); return; }
    const ctx = canvas.getContext("2d");
    const color = `rgb(${rgb})`;
    const grad = ctx.createLinearGradient(0, 0, 0, 300);
    grad.addColorStop(0, `rgba(${rgb},.28)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);

    state.charts.line = new Chart(ctx, {
      type: "line",
      data: {
        labels: days.map(fmtDay),
        datasets: [{
          label: "登録者数", data: series,
          borderColor: color, backgroundColor: grad, fill: true, tension: .35,
          pointRadius: 3, pointBackgroundColor: color, pointBorderColor: "#ffffff",
          pointBorderWidth: 2, borderWidth: 2.5,
        }],
      },
      options: baseOpts({ yMax: dynMax, yStep: dynMax <= 10 ? 1 : undefined }),
    });
  }

  /* 期間内の日毎カウントを集計（filter で任意の絞り込み可）*/
  function seriesForRange(from, to, filterFn) {
    const fromK = dayKey(startOf(from)), toK = dayKey(startOf(to));
    const days = state.dateDomain.days.filter((d) => d >= fromK && d <= toK);
    const perDay = new Map(days.map((d) => [d, 0]));
    state.RAW.forEach((r) => {
      if (filterFn && !filterFn(r)) return;
      const d = toDate(r[F.addedAt]); if (!d) return;
      const k = dayKey(startOf(d));
      if (perDay.has(k)) perDay.set(k, perDay.get(k) + 1);
    });
    let series = days.map((d) => perDay.get(d));
    if (CFG.timeseries.cumulative) { let acc = 0; series = series.map((v) => (acc += v)); }
    return { days, series };
  }

  /* Chart.js 共通オプションファクトリ（縦棒/横棒/折れ線 共用）*/
  function baseOpts({ yMax, yStep, xStep, horizontal } = {}) {
    const catAxis = horizontal ? "y" : "x"; // カテゴリ軸
    const valAxis = horizontal ? "x" : "y"; // 数値軸
    const scales = {};
    scales[catAxis] = {
      grid: { display: false, drawBorder: false },
      ticks: {
        color: C.tick, font: { size: 11 }, autoSkip: false,
        callback: function (v) {
          const l = this.getLabelForValue(v);
          return (typeof l === "string" && l.length > 14) ? l.slice(0, 14) + "…" : l;
        },
      },
    };
    scales[valAxis] = {
      beginAtZero: true,
      ...(yMax != null ? { max: yMax } : {}),
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

  /* ========================= DOM ビルダー ========================= */
  function panelCanvas(title, id, sub, itemCount) {
    const h = Math.max(160, itemCount * 34 + 30); // 項目数に応じて高さ可変
    return `
      <div class="panel">
        <div class="panel-head">
          <h3>${title}</h3>
          <span class="sub">${sub}</span>
        </div>
        <div class="chart-box auto" style="height:${h}px"><canvas id="${id}"></canvas></div>
      </div>`;
  }
  function panelEmpty(title, sub) {
    return `
      <div class="panel">
        <div class="panel-head"><h3>${title}</h3><span class="sub">${sub}</span></div>
        <div class="empty-state"><div><b>No Data</b>選択期間に該当データがありません</div></div>
      </div>`;
  }
  function destroy(key) {
    if (state.charts[key]) { state.charts[key].destroy(); delete state.charts[key]; }
  }

  /* ========================= レンダリング制御 ========================= */
  /* 期間を適用して再描画（スライダー変更・初期表示から呼ばれる）*/
  function applyRange(from, to) {
    state.from = from;
    state.to = to;
    const rows = state.RAW.filter((r) => inRange(r, from, to));
    onRender(rows);
  }
  /* 現在の期間で再描画（セグメント切替など、期間を変えずに再描画したい時）*/
  function rerender() {
    if (state.from && state.to) applyRange(state.from, state.to);
  }
  /* 現在の期間に該当する行を取得 */
  function currentRows() {
    const from = state.from || state.dateDomain.min;
    const to = state.to || state.dateDomain.max;
    return state.RAW.filter((r) => inRange(r, from, to));
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

      // データマートは配列 or { records: [...] } の双方に対応
      state.RAW = Array.isArray(json) ? json : (json.records || []);
      if (!state.RAW.length) throw new Error("records empty");

      buildDateDomain();
      buildSlider();
      applyRange(state.dateDomain.min, state.dateDomain.max);

      // 更新日 = JSON の生成日(generated_at)の「前日」。無ければ最新登録日。
      const genRaw = (!Array.isArray(json) && json.generated_at) ? json.generated_at : null;
      const genDate = toDate(genRaw);
      if (genDate && !isNaN(genDate)) {
        genDate.setDate(genDate.getDate() - 1);
        setText("#genAt", dayKey(startOf(genDate)));
      } else {
        setText("#genAt", dayKey(startOf(state.dateDomain.max)));
      }
      setText("#recCount", state.RAW.length.toLocaleString());
    } catch (e) {
      console.error(e);
      // fetch 失敗（file:// 直開き等）と描画エラーを切り分けて案内
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

  /* ========================= 公開 API ========================= */
  /**
   * ダッシュボードを起動する。
   * @param {Object} opts
   * @param {(rows:Object[])=>void} opts.render         期間確定後の描画（必須）
   * @param {(record:Object,field:string)=>*} [opts.resolveValue] 仮想フィールド解決
   * @param {()=>void} [opts.onInit] boot 前に一度だけ実行（セグメント bind 等）
   */
  function start(opts) {
    onRender = opts.render || onRender;
    if (opts.resolveValue) resolveValue = opts.resolveValue;
    document.addEventListener("DOMContentLoaded", () => {
      if (typeof opts.onInit === "function") opts.onInit();
      boot();
    });
  }

  return {
    // 設定 / 定数 / ステート
    CFG, F, C, state,
    // 汎用ヘルパー
    $, setHTML, setText, safe,
    toDate, dayKey, fmtDay, startOf, endOf, niceCeil, tokens, realField,
    // 集計
    inRange, countBy, seriesForRange,
    // 描画
    drawBarH, drawLine, baseOpts, panelCanvas, panelEmpty, destroy,
    // 制御
    applyRange, rerender, currentRows, start,
  };
})();
