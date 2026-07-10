/* ============================================================
 * 日翊盤點平台 - 資料存取層（api.js）
 * ------------------------------------------------------------
 * 這是唯一與「後端」溝通的檔案。前端各區完全不需知道資料存在哪。
 * 未來要換後端，只改這一支：
 *   階段一（現在）：APPS_SCRIPT_URL 留空 → 資料存在瀏覽器 localStorage（單機、開發用）
 *   階段二（過渡）：填入 Apps Script 網址 → 資料寫進 Google Sheets、照片存 Google Drive
 *                   → 手機與電腦開同一份資料，可實地測試
 *   階段三（正式）：把下方 fetch 換成日翊後端 API（PostgreSQL）即可，畫面邏輯不動
 * ============================================================ */

const API_CONFIG = {
  // ↓↓↓ 部署 Google Apps Script Web App 後，把 /exec 結尾的網址貼在這裡，即啟用雲端共用模式 ↓↓↓
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbz7kHutmQWdXqEC_rW5fO7tVklFfEBvj0788yPan2nrIW29ccWsgoOvnWTqBEPqG5H5/exec",
  // ↑↑↑ 留空 = 本機 localStorage 模式（僅供單機開發測試）↑↑↑
};

const _DB_KEY = "inv-platform-db-v1";

const InventoryAPI = {
  /** 是否為雲端（Google Sheets）模式 */
  cloud() { return !!(API_CONFIG.APPS_SCRIPT_URL && API_CONFIG.APPS_SCRIPT_URL.trim()); },

  /** 讀取整份資料。回傳 null 表示後端尚無資料（呼叫端會寫入範例種子） */
  async loadDB() {
    if (this.cloud()) {
      const res = await fetch(API_CONFIG.APPS_SCRIPT_URL + "?action=getAll");
      return await res.json();
    }
    try {
      const raw = localStorage.getItem(_DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* 資料毀損時回退種子 */ }
    return null;
  },

  /** 寫回指定分頁（維護類資料用；整批覆蓋該分頁） */
  async saveTabs(db, tabs) {
    if (!this.cloud()) { this._localSave(db); return; }
    await Promise.all(tabs.map((t) => this._post({ action: "replaceTab", tab: t, rows: db[t] || [] })));
  },

  /** 新增單筆（盤點紀錄、上傳紀錄用；雲端模式為 append，多裝置同時新增不會互相覆蓋） */
  async appendRow(db, tab, row) {
    if (!this.cloud()) { this._localSave(db); return; }
    await this._post({ action: "append", tab, row });
  },

  /** 上傳照片。本機模式直接回傳 base64；雲端模式存進 Drive 並回傳檔案連結 */
  async uploadPhoto(dataUrl, filename) {
    if (!this.cloud()) return dataUrl;
    const j = await this._post({ action: "uploadPhoto", dataUrl, filename });
    return j.url;
  },

  /* ---------- 內部方法 ---------- */
  _localSave(db) { localStorage.setItem(_DB_KEY, JSON.stringify(db)); },

  async _post(payload) {
    // 不設 Content-Type → 送出為 text/plain（簡單請求），避免 Apps Script 的 CORS 預檢問題
    const res = await fetch(API_CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return await res.json();
  },
};

window.InventoryAPI = InventoryAPI;
