/* =========================================================================
 *  config-shopdrop.js  —  ShopDrop Dashboard configuration (一元管理)
 *  元の LINE ダッシュボード (config.js) の設計を踏襲した ShopDrop 版。
 *  データ(json)を日々差し替える場合は DATA_SOURCE のパスのみ確認すればOK。
 *  カラーは styles.css の CSS変数と対応:
 *    Attribute=青 / Acquisition=緑 / Engagement=紫 / その他=グレー
 * ========================================================================= */
window.DASHBOARD_CONFIG = {

  /* --- データソース (日々差し替えるJSON) --------------------------------- */
  DATA_SOURCE: "shopdrop_datamart.json",

  /* --- ブランド ---------------------------------------------------------- */
  brand: {
    title: "ShopDrop Audience Intelligence",
    subtitle: "Shop & Drop Registration Analytics",
  },

  /* --- フィールド名マッピング -------------------------------------------- */
  fields: {
    id:         "user_id",
    name:       "display_name",
    addedAt:    "registered_at",      // 登録日時（LINE版の friend_added_at 相当）
    blocked:    "deleted",            // 削除フラグ（LINE版の blocked 相当・1=削除）
    gender:     "Q1_単一選択",        // 性別 → Attribute
    ageGroup:   "age_group",          // 年代（バンド済み）→ Attribute
    area:       "area_name",          // 居住/所属エリア → Attribute
    building:   "Q3_単一選択",        // 所属ビル → Attribute
    source:     "source",             // 流入経路（登録トリガー）→ Acquisition
    enterprise: "enterprise_name",    // 所属企業 → Engagement
    shopId:     "shop_user_id",       // SHOP 登録ID → Acquisition（プラットフォーム判定）
    dropId:     "drop_account_id",    // DROP 登録ID → Acquisition（プラットフォーム判定）
  },

  /* --- KPIタイル（2段 × 4 = 8指標）-------------------------------------- */
  kpis: [
    /* Row 1 */
    { key: "total",      label: "総登録数",          caption: "選択期間の登録合計" },
    { key: "activeRate", label: "アクティブ率",      caption: "未削除の割合", unit: "%" },
    { key: "deleteRate", label: "削除率",            caption: "削除済みの割合", unit: "%", accent: "gray" },
    { key: "answerRate", label: "回答率",            caption: "属性が取得できた割合", unit: "%" },
    /* Row 2 */
    { key: "lastMonth",  label: "最新月の増加数",    caption: "直近月の新規登録" },
    { key: "shopUsers",  label: "SHOP 登録数",       caption: "SHOP 経由の登録", accent: "acq" },
    { key: "dropUsers",  label: "DROP 登録数",       caption: "DROP 経由の登録", accent: "rich" },
    { key: "avgAge",     label: "平均年代",          caption: "回答者ベース（年代中央値）", unit: "歳", accent: "attr" },
  ],

  /* --- 折れ線グラフ設定 -------------------------------------------------- */
  timeseries: {
    headroom: 1.25,     // Y軸上限 = ピーク × この倍率 を「切りの良い数」に丸め
    cumulative: false,
  },

  /* --- ドメイン① ユーザー属性（青） ------------------------------------- */
  attributeCharts: [
    { key: "gender",   title: "性別",       field: "gender",      multi: true  },
    { key: "ageBand",  title: "年代",       field: "__ageGroup",  multi: false },
    { key: "area",     title: "居住エリア", field: "area",        multi: false },
    { key: "building", title: "所属ビル",   field: "building",    multi: true  },
  ],

  /* --- ドメイン② 流入経路（緑）※属性とは別軸 --------------------------- */
  acquisitionCharts: [
    { key: "platform", title: "登録プラットフォーム（SHOP / DROP）", field: "__platform", multi: false },
    { key: "source",   title: "流入経路（登録トリガー）",           field: "source",     multi: false },
  ],

  /* --- ドメイン③ エンゲージメント（紫）※さらに別軸 --------------------- */
  engagementCharts: [
    { key: "enterprise", title: "所属企業（上位）", field: "enterprise", multi: false },
  ],

  /* --- 棒グラフ表示上限（上位N件・横棒）--------------------------------- */
  topN: 10,

  /* --- 空値ラベル -------------------------------------------------------- */
  emptyLabel: "未回答 / 未取得",
};
