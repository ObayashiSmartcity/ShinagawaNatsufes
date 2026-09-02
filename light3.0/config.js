/* =========================================================================
 *  config.js  —  Dashboard configuration (一元管理)
 *  ------------------------------------------------------------------------
 *  データ(json)を日々差し替える場合は DATA_SOURCE のパスのみ確認すればOK。
 *  カラーは styles.css の CSS変数と対応:
 *     Attribute   = 青 (--attr)
 *     Acquisition = 緑 (--acq)
 *     Engagement  = 紫 (--rich)
 *     その他       = グレー
 * ========================================================================= */

window.DASHBOARD_CONFIG = {

  /* --- データソース (日々差し替えるJSON) --------------------------------- */
  DATA_SOURCE: "line_datamart.json",

  /* --- ブランド ---------------------------------------------------------- */
  brand: {
    title: "LINE Audience Intelligence",
    subtitle: "Friend & Attribution Analytics",
  },

  /* --- フィールド名マッピング -------------------------------------------- */
  fields: {
    id:        "user_id",
    name:      "display_name",
    addedAt:   "friend_added_at",
    blocked:   "blocked",
    gender:    "Q1_単一選択",
    birth:     "Q2_年月日入力",
    building:  "Q3_単一選択",
    area:      "Q4_単一選択",
    heardFrom: "Q5_複数選択",   // 認知経路（複数選択）→ Acquisition
    sentiment: "Q6_複数選択",   // まちへの愛着（複数選択）→ Engagement
    source:    "source",        // 流入経路（登録トリガー）→ Acquisition
    richmenu:  "richmenu",      // リッチメニュークリック → Engagement
  },

  /* --- KPIタイル（2段 × 4 = 8指標）-------------------------------------- */
  kpis: [
    /* Row 1 */
    { key: "total",     label: "総友だち数",        caption: "選択期間の登録合計" },
    { key: "activeRate",label: "アクティブ率",      caption: "未ブロック割合", unit: "%" },
    { key: "blockRate", label: "ブロック率",        caption: "ブロック割合", unit: "%", accent: "gray" },
    { key: "answerRate",label: "回答率",            caption: "アンケート回答割合", unit: "%" },
    /* Row 2 */
    { key: "lastMonth", label: "最新月の増加数",    caption: "直近月の新規登録" },
    { key: "richUsers", label: "リッチメニュー利用者",caption: "1回以上クリック", accent: "rich" },
    { key: "srcUsers",  label: "流入経路 登録数",   caption: "経路が特定できた登録", accent: "acq" },
    { key: "avgAge",    label: "平均年代",          caption: "回答者ベース", unit: "歳", accent: "attr" },
  ],

  /* --- 折れ線グラフ設定 -------------------------------------------------- */
  timeseries: {
    headroom: 1.25,     // Y軸上限 = ピーク × この倍率 を「切りの良い数」に丸め
    cumulative: false,
  },

  /* --- ドメイン① ユーザー属性（青） ------------------------------------- */
  attributeCharts: [
    { key: "gender",   title: "性別",       field: "gender",    multi: true  },
    { key: "ageBand",  title: "年代",       field: "__ageBand", multi: false },
    { key: "area",     title: "居住エリア", field: "area",      multi: false },
    { key: "building", title: "所属ビル",   field: "building",  multi: true  },
  ],

  /* --- ドメイン② 流入経路（緑）※属性とは別軸 --------------------------- */
  acquisitionCharts: [
    { key: "source",    title: "流入経路（登録トリガー）", field: "source",    multi: false },
    { key: "heardFrom", title: "認知経路（Q5・複数回答）", field: "heardFrom", multi: true  },
  ],

  /* --- ドメイン③ エンゲージメント（紫）※さらに別軸 --------------------- */
  engagementCharts: [
    { key: "richmenu",  title: "リッチメニュー クリック",  field: "richmenu",  multi: true },
    { key: "sentiment", title: "まちへの愛着（Q6・複数回答）", field: "sentiment", multi: true },
  ],

  /* --- 棒グラフ表示上限（上位N件・横棒）--------------------------------- */
  topN: 10,

  /* --- 空値ラベル -------------------------------------------------------- */
  emptyLabel: "未回答 / 未取得",
};
