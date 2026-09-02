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
    title: "ShopDrop Audience Intelligence",
    subtitle: "Shop & Drop Registration Analytics",
  },

  /* --- フィールド名マッピング -------------------------------------------- */
  fields: {
    id:         "user_id",
    name:       "display_name",
    addedAt:    "registered_at",      // 登録日時（LINE版の friend_added_at 相当）
    blocked:    "deleted",            // 削除フラグ（1=削除）
    gender:     "Q1_単一選択",        // 性別 → Attribute
    ageGroup:   "age_group",          // 年代（バンド済み）→ Attribute
    area:       "area_name",          // 居住/所属エリア
    building:   "Q3_単一選択",        // 所属ビル
    source:     "source",             // 流入経路（登録トリガー）
    enterprise: "enterprise_name",    // 所属企業
    shopId:     "shop_user_id",       // SHOP 登録ID（プラットフォーム判定）
    dropId:     "drop_account_id",    // DROP 登録ID（プラットフォーム判定）
  },

  /* --- KPIタイル（3指標のみ）-------------------------------------------- *
   * カラー: total=グレー / DROP=青(attr) / SHOP=緑(acq)                   */
  kpis: [
    { key: "total",     label: "総登録数",    caption: "選択期間の登録合計", accent: "gray" },
    { key: "dropUsers", label: "DROP 登録数", caption: "DROP 経由の登録",   accent: "attr" },
    { key: "shopUsers", label: "SHOP 登録数", caption: "SHOP 経由の登録",   accent: "acq"  },
  ],

  /* --- 折れ線グラフ設定（全体 / DROP / SHOP 切替対応）------------------- */
  timeseries: {
    headroom: 1.25,     // Y軸上限 = ピーク × この倍率 を「切りの良い数」に丸め
    cumulative: false,
  },

  /* --- ドメイン① ユーザー属性（性別・年代のみ / 全体・DROP・SHOP 3段）-- */
  attributeCharts: [
    { key: "gender",  title: "性別", field: "gender",     multi: true  },
    { key: "ageBand", title: "年代", field: "__ageGroup", multi: false },
  ],

  /* --- ドメイン② 流入経路（緑）----------------------------------------- */
  acquisitionCharts: [
    { key: "source", title: "流入経路（登録トリガー）", field: "source", multi: false },
  ],

  /* --- ドメイン③ 所属・エンゲージメント（紫）--------------------------- */
  engagementCharts: [
    { key: "enterprise", title: "所属企業（上位）", field: "enterprise", multi: false },
  ],

  /* --- 棒グラフ表示上限（上位N件・横棒）--------------------------------- */
  topN: 10,

  /* --- 空値ラベル -------------------------------------------------------- */
  emptyLabel: "未回答 / 未取得",
};
