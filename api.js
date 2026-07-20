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
const _MASTERS_KEY = "inv-platform-masters-v1";
const _CLOUD_CACHE_KEY = "inv-platform-cloud-cache-v1";

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
      if (raw) {
        const db = JSON.parse(raw);
        db.mastersIndex = this._localMasters().map((m) => ({ storeId: m.storeId, month: m.month, type: m.type, srcDate: m.srcDate || "" }));
        return db;
      }
    } catch (e) { /* 資料毀損時回退種子 */ }
    return null;
  },

  /** 讀取上次成功抓到的雲端資料快照（同步、不打網路）。用於畫面先顯示舊資料、背景再更新最新版（stale-while-revalidate），
   *  避免每次進站都要等 Apps Script／Sheets 讀完才看得到畫面。本機模式不需要，回傳 null */
  loadCachedDB() {
    if (!this.cloud()) return null;
    try {
      const raw = localStorage.getItem(_CLOUD_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },

  /** 每次成功抓到雲端最新資料後呼叫，更新快取供下次進站先顯示 */
  cacheDB(db) {
    if (!this.cloud()) return;
    try { localStorage.setItem(_CLOUD_CACHE_KEY, JSON.stringify(db)); } catch (e) { /* 快取失敗不影響正常流程 */ }
  },

  /** 讀取單一店鋪主檔（含完整資料列）。回傳 { columns, rows } 或 null */
  async getMaster(storeId, month, type) {
    if (this.cloud()) {
      const res = await fetch(API_CONFIG.APPS_SCRIPT_URL +
        `?action=getMaster&storeId=${encodeURIComponent(storeId)}&month=${encodeURIComponent(month)}&type=${encodeURIComponent(type)}`);
      return await res.json();
    }
    const m = this._localMasters().find((x) => x.storeId === storeId && x.month === month && x.type === type);
    return m ? { columns: m.columns, rows: m.rows } : null;
  },

  /** 寫入/覆蓋單一店鋪主檔 rec = { storeId, month, type, srcDate, srcFile, columns, rows } */
  async putMaster(rec) {
    if (this.cloud()) { await this._post({ action: "putMaster", rec }); return; }
    const list = this._localMasters().filter((x) => !(x.storeId === rec.storeId && x.month === rec.month && x.type === rec.type));
    list.push(rec);
    localStorage.setItem(_MASTERS_KEY, JSON.stringify(list));
  },

  /** 依來源檔名刪除主檔（同檔名重新上傳前先清空） */
  async deleteMastersByFile(srcFile, month) {
    if (this.cloud()) { await this._post({ action: "deleteMastersByFile", srcFile, month }); return; }
    const list = this._localMasters().filter((m) => !(m.srcFile === srcFile && m.month === month));
    localStorage.setItem(_MASTERS_KEY, JSON.stringify(list));
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

  /** 上傳盤點手冊 PDF（存進該品牌的「盤點手冊」資料夾）。本機模式直接回傳 base64；雲端模式存進 Drive 並回傳檔案連結 */
  async uploadManual(dataUrl, filename, brandName) {
    if (!this.cloud()) return dataUrl;
    const j = await this._post({ action: "uploadManual", dataUrl, filename, brandName });
    return j.url;
  },

  /** 上傳 Layout 圖（Excel 原檔，存進該品牌的「Layout圖」資料夾）。本機模式直接回傳 base64；雲端模式存進 Drive 並回傳檔案連結 */
  async uploadLayout(dataUrl, filename, brandName) {
    if (!this.cloud()) return dataUrl;
    const j = await this._post({ action: "uploadLayout", dataUrl, filename, brandName });
    return j.url;
  },

  /** 上傳盤點總表 Excel 原檔（存進該品牌的「盤點總表」資料夾，一店一檔，不解析內容）。本機模式直接回傳 base64 */
  async uploadCountSheet(dataUrl, filename, brandName) {
    if (!this.cloud()) return dataUrl;
    const j = await this._post({ action: "uploadCountSheet", dataUrl, filename, brandName });
    return j.url;
  },

  /** 批次打包下載（伺服器端 zip，避免瀏覽器端抓既有 Drive 檔案的 CORS 限制）
   *  files = [{fileUrl, fileName}]；回傳 { filename, base64 }。本機模式無 Drive，回傳 null 讓呼叫端改用逐個下載 */
  async zipFiles(files, zipName) {
    if (!this.cloud()) return null;
    const j = await this._post({ action: "zipFiles", files, zipName });
    if (j.error) throw new Error(j.error);
    return { filename: j.filename, base64: j.base64 };
  },

  /* ---------- 內部方法 ---------- */
  _localSave(db) {
    const { mastersIndex, ...rest } = db; // mastersIndex 為衍生資料，不存進主 DB
    localStorage.setItem(_DB_KEY, JSON.stringify(rest));
  },
  _localMasters() { try { return JSON.parse(localStorage.getItem(_MASTERS_KEY) || "[]"); } catch (e) { return []; } },

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
