/* =========================================================================
 *  app-shopdrop.js — ShopDrop Tracker（ページ固有ロジック）
 *  ------------------------------------------------------------------------
 *  共通処理は dashboard-core.js（window.DashCore）に集約済み。
 *  【この版の構成】
 *    - KPI は 総登録数 / DROP登録数 / SHOP登録数 の 3タイルのみ
 *    - 登録者数グラフは 全体 / DROP / SHOP を切替表示
 *    - ユーザー属性は 性別・年代 のみを 全体/DROP/SHOP の 3段で表示
 *  カラー: DROP=青(attr) / SHOP=緑(acq) / それ以外=グレー(gray)
 * ========================================================================= */
(function () {
  "use strict";

  const D = window.DashCore;
  const { CFG, F, C } = D;

  /* 折れ線グラフの選択セグメント（全体 / DROP / SHOP）*/
  let linePlat = "all";

  /* 折れ線セグメントごとの色（"r,g,b"）*/
  const PLAT_RGB = { DROP: "59,130,246", SHOP: "34,197,94", all: "148,163,184" };

  /* ========================= 固有: プラットフォーム判定 ========================= */
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

  /* ---- 仮想フィールド解決（コアの countBy から呼ばれる）---- */
  function resolveValue(record, field) {
    if (field === "__ageGroup") return ageBandOf(record);
    if (field === "__platform") return platformOf(record);
    return record[field];
  }

  /* ========================= 起動時の追加バインド ========================= */
  /* 折れ線グラフの 全体/DROP/SHOP 切替（期間は変えずに再描画）*/
  function bindLineSeg() {
    const seg = D.$("#lineSeg");
    if (!seg) { console.warn("[dashboard] #lineSeg が見つかりません"); return; }
    seg.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => {
        seg.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        linePlat = b.dataset.plat || "all";
        D.safe("折れ線", renderTimeseries);
      });
    });
  }

  /* ========================= ページ描画 ========================= */
  function render(rows) {
    D.safe("KPI",      () => renderKPIs(rows));
    D.safe("折れ線",    renderTimeseries);
    D.safe("属性(3段)", () => renderAttributes(rows));
    D.safe("メタ更新",   () => updateMeta(rows));
  }

  /* ---- KPI (3タイル: 総登録数 / DROP / SHOP) ---- */
  function renderKPIs(rows) {
    const vals = {
      total:     rows.length,
      dropUsers: rows.filter(isDrop).length,
      shopUsers: rows.filter(isShop).length,
    };
    const html = CFG.kpis.map((k) => {
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
    D.setHTML("#kpisRow1", html.join(""));
  }

  /* ---- 折れ線: 日毎の登録者数（全体 / DROP / SHOP 切替）---- */
  function renderTimeseries() {
    const filter = linePlat === "DROP" ? isDrop : linePlat === "SHOP" ? isShop : null;
    const { days, series } = D.seriesForRange(D.state.from, D.state.to, filter);

    const peak = Math.max(1, ...series);
    const sum  = series.reduce((a, b) => a + b, 0);
    const dynMax = D.niceCeil(Math.ceil(peak * CFG.timeseries.headroom));
    const segLabel = linePlat === "DROP" ? "DROP" : linePlat === "SHOP" ? "SHOP" : "全体";
    D.setText("#lineMeta", `［${segLabel}］合計 ${sum}名 / ピーク ${peak}名 / 上限 ${dynMax}（自動）`);

    D.drawLine(days, series, dynMax, PLAT_RGB[linePlat] || PLAT_RGB.all);
  }

  /* ---- ユーザー属性: 性別・年代を横並び / 全体・DROP・SHOP を縦3段 ---- */
  function renderAttributes(rows) {
    const host = D.$("#attrGrid");
    if (!host) { console.warn("[dashboard] #attrGrid が見つかりません"); return; }
    host.innerHTML = "";

    const segs = [
      { key: "all",  label: "全体", cls: "tier-all",  color: C.gray, match: () => true },
      { key: "drop", label: "DROP", cls: "tier-drop", color: C.attr, match: isDrop },
      { key: "shop", label: "SHOP", cls: "tier-shop", color: C.acq,  match: isShop },
    ];
    const charts = CFG.attributeCharts; // 性別 / 年代

    segs.forEach((seg) => {
      const sub = rows.filter(seg.match);

      // 各チャートの集計は 1 度だけ計算して DOM生成・描画で使い回す
      const cells = charts.map((c) => ({
        chart: c,
        canvasId: `attr_${seg.key}_${c.key}`,
        agg: D.countBy(sub, D.realField(c.field), { splitComma: !!c.multi }),
      }));

      // 段ラベル（人数付き）
      host.insertAdjacentHTML("beforeend",
        `<div class="tier-label ${seg.cls}">
           <span class="tier-name">${seg.label}</span>
           <span class="tier-count">${sub.length.toLocaleString()}名</span>
         </div>`);

      // 段内に 性別 + 年代 を横並び（2カラム）
      const panels = cells.map((cell) =>
        cell.agg.labels.length
          ? D.panelCanvas(cell.chart.title, cell.canvasId, seg.label, cell.agg.labels.length)
          : D.panelEmpty(cell.chart.title, seg.label)
      ).join("");
      host.insertAdjacentHTML("beforeend", `<div class="grid-2 ${seg.cls}">${panels}</div>`);

      // 描画（段の色で単色塗り）
      cells.forEach((cell) => {
        if (cell.agg.labels.length) D.drawBarH(cell.canvasId, cell.agg, [seg.color], 0);
      });
    });
  }

  /* ---- meta 更新 ---- */
  function updateMeta(rows) {
    const dropU = rows.filter(isDrop).length;
    const shopU = rows.filter(isShop).length;
    D.setText("#attrMeta", `全体 ${rows.length} · DROP ${dropU} · SHOP ${shopU}`);
  }

  /* ========================= 起動 ========================= */
  D.start({ render, resolveValue, onInit: bindLineSeg });
})();
