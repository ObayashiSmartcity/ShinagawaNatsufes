/* =========================================================================
 *  config-shopdrop.js  —  ShopDrop Dashboard configuration (一元管理)
 *  元の LINE ダッシュボード (config.js) の設計を踏襲した ShopDrop 版。
 *  データ(json)を日々差し替える場合は DATA_SOURCE のパスのみ確認すればOK。
 *  カラー方針: DROP=青系 / SHOP=緑系 / それ以外(全体等)=グレー系
 * ========================================================================= */
window.DASHBOARD_CONFIG = {

  /* --- データソース (日々差し替えるJSON) --------------------------------- */
  DATA_SOURCE: "shopdrop_datamart.json",

  /* --- ブランド ---------------------------------------------------------- */
  brand: {
    title: "ShopDrop Growth Tracker",
    subtitle: "Shop & Drop Registration Analytics",
  },

  /* --- フィールド名マッピング -------------------------------------------- */
  fields: {
    id:       "user_id",
    name:     "display_name",
    addedAt:  "registered_at",      // 登録日時
    blocked:  "deleted",            // 削除フラグ（1=削除）
    gender:   "Q1_単一選択",        // 性別
    ageGroup: "age_group",          // 年代（バンド済み）
    shopId:   "shop_user_id",       // SHOP 登録ID（プラットフォーム判定）
    dropId:   "drop_account_id",    // DROP 登録ID（プラットフォーム判定）
  },

  /* --- KPIタイル（3指標のみ）------------------------------------------- *
   * カラー: total=グレー / DROP=青(attr) / SHOP=緑(acq)                   */
  kpis: [
    { key: "total",     label: "総登録数",    caption: "選択期間の登録合計", accent: "gray" },
    { key: "dropUsers", label: "DROP 登録数", caption: "DROP 経由の登録",   accent: "attr" },
    { key: "shopUsers", label: "SHOP 登録数", caption: "SHOP 経由の登録",   accent: "acq"  },
  ],

  /* --- 折れ線グラフ設定（全体 / DROP / SHOP 切替対応）------------------- */
  timeseries: {
    headroom: 1.25,
    cumulative: false,
  },

  /* --- ユーザー属性（性別・年代のみ / 全体・DROP・SHOP 3段で表示）------ */
  attributeCharts: [
    { key: "gender",  title: "性別", field: "gender",     multi: true  },
    { key: "ageBand", title: "年代", field: "__ageGroup", multi: false },
  ],

  /* --- 棒グラフ表示上限（上位N件・横棒）--------------------------------- */
  topN: 10,

  /* --- 空値ラベル -------------------------------------------------------- */
  emptyLabel: "未回答 / 未取得",
};
