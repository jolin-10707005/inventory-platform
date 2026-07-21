/**
 * 日翊盤點平台 — Google Apps Script 資料橋樑
 * ------------------------------------------------------------
 * 作用：讓前端平台能把資料寫進這份 Google Sheets、把照片存進 Google Drive。
 * 每個資料表 = Sheets 的一個分頁（brands / stores / staff / prices / produced / records / uploads），
 * 一列一筆，第一列為欄位名稱（表頭），程式會自動建立不存在的分頁與表頭。
 *
 * 部署步驟見同資料夾 README.md。部署後把產生的 /exec 網址貼進前端 api.js 的 APPS_SCRIPT_URL。
 */

// 盤點照片要存放的 Google Drive 資料夾 ID（即使用者提供的資料夾）
var PHOTO_FOLDER_ID = "1h9qjSAx2-sojs5_uP307qmBUvw-XiDhn";

var TABS = ["brands", "stores", "staff", "prices", "records", "uploads", "aliases", "categoryAliases", "manuals", "layouts", "countTotals", "opsMargins"];

// 分頁顯示名稱（程式內部仍用英文代碼；工作表分頁改中文，方便人工檢視）
var SHEET_NAMES = {
  brands: "品牌",
  stores: "店鋪",
  staff: "盤點人員",
  prices: "單價",
  records: "盤點紀錄",
  uploads: "上傳紀錄",
  masters: "主檔索引",
  aliases: "店名對應",
  categoryAliases: "種類對應",
  manuals: "盤點手冊",
  layouts: "Layout圖",
  countTotals: "盤點總表",
  opsMargins: "損益歷史"
};

function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || "getAll";
  if (action === "getAll") return jsonOut(getAll());
  if (action === "getMaster") return jsonOut(getMaster(p.storeId, p.month, p.type));
  return jsonOut({ error: "unknown action: " + action });
}

function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  switch (body.action) {
    case "replaceTab":
      replaceTab(body.tab, body.rows);
      return jsonOut({ ok: true });
    case "append":
      appendRow(body.tab, body.row);
      return jsonOut({ ok: true });
    case "uploadPhoto":
      return jsonOut({ ok: true, url: uploadPhoto(body.dataUrl, body.filename) });
    case "uploadManual":
      return jsonOut({ ok: true, url: uploadManual(body.dataUrl, body.filename, body.brandName) });
    case "uploadLayout":
      return jsonOut({ ok: true, url: uploadLayout(body.dataUrl, body.filename, body.brandName) });
    case "uploadCountSheet":
      return jsonOut({ ok: true, url: uploadCountSheet(body.dataUrl, body.filename, body.brandName) });
    case "zipFiles":
      return jsonOut(zipFiles(body.files, body.zipName));
    case "putMaster":
      putMaster(body.rec);
      return jsonOut({ ok: true });
    case "putMasterBatch":
      return jsonOut({ ok: true, storeIds: putMasterBatch(body) });
    case "deleteMastersByFile":
      return jsonOut({ ok: true, removed: deleteMastersByFile(body.srcFile, body.month) });
    default:
      return jsonOut({ error: "unknown action: " + body.action });
  }
}

/* ---------- 讀取 ---------- */
function getAll() {
  var db = {};
  TABS.forEach(function (tab) { db[tab] = readTab(tab); });
  db.mastersIndex = mastersIndex(); // 主檔只回傳「哪些店有檔」的輕量索引，實際內容用 getMaster 單獨抓
  return db;
}

function readTab(tab) {
  var sh = sheet(tab);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    if (values[i].join("") === "") continue; // 跳過空列
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var v = values[i][j];
      if (typeof v === "string" && (v.charAt(0) === "[" || v.charAt(0) === "{")) {
        try { v = JSON.parse(v); } catch (err) { /* 保持原字串 */ }
      }
      obj[headers[j]] = v;
    }
    rows.push(obj);
  }
  return rows;
}

/* ---------- 寫入 ---------- */
function replaceTab(tab, rows) {
  var sh = sheet(tab);
  sh.clear();
  if (!rows || rows.length === 0) return;
  var headers = collectHeaders(rows);
  var out = [headers];
  rows.forEach(function (r) { out.push(toLine(r, headers)); });
  var range = sh.getRange(1, 1, out.length, headers.length);
  range.setNumberFormat("@"); // 純文字格式，避免 "2026-07"、"21:00" 被 Sheets 自動轉成日期/時間
  range.setValues(out);
}

function appendRow(tab, row) {
  var sh = sheet(tab);
  var values = sh.getDataRange().getValues();
  var headers = (values.length && values[0].join("") !== "") ? values[0] : null;
  if (!headers) {
    headers = Object.keys(row);
    var hr = sh.getRange(1, 1, 1, headers.length);
    hr.setNumberFormat("@");
    hr.setValues([headers]);
  }
  var rowIndex = sh.getLastRow() + 1;
  var range = sh.getRange(rowIndex, 1, 1, headers.length);
  range.setNumberFormat("@"); // 同上，避免日期/時間欄位被自動轉型
  range.setValues([toLine(row, headers)]);
}

var MAX_PHOTO_BYTES = 10 * 1024 * 1024;  // 單張照片上限 10MB
var MAX_MANUAL_BYTES = 20 * 1024 * 1024; // 盤點手冊 PDF 上限 20MB
var MAX_LAYOUT_BYTES = 15 * 1024 * 1024; // Layout 圖上限 15MB（Excel 原檔）
var MAX_COUNT_BYTES = 15 * 1024 * 1024;  // 盤點總表上限 15MB（Excel 原檔，一店一檔不合併）

// 資料夾底下取得指定名稱的子資料夾，不存在就建立（Drive 無原生 mkdir -p）
function getOrCreateFolder(parentFolder, name) {
  var it = parentFolder.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parentFolder.createFolder(name);
}

// 品牌／檔案類型對應的 Drive 資料夾：根目錄 → 品牌 → Layout圖／盤點總表／盤點手冊
function getBrandSubfolder(brandName, subName) {
  var root = DriveApp.getFolderById(PHOTO_FOLDER_ID);
  var brandFolder = getOrCreateFolder(root, brandName || "未分類品牌");
  return getOrCreateFolder(brandFolder, subName);
}

// 共用：驗證並存進 Google Drive（可指定資料夾），回傳可存取連結
function uploadToDrive(folder, dataUrl, filename, isAllowedType, maxBytes, rejectMsg) {
  var parts = dataUrl.split(",");
  var meta = parts[0]; // 例：data:image/jpeg;base64
  var contentType = meta.substring(meta.indexOf(":") + 1, meta.indexOf(";"));
  // 後端驗證：前端 accept 可被繞過，伺服器端必須再驗一次（CWE-434）
  if (!isAllowedType(contentType)) throw new Error(rejectMsg);
  var bytes = Utilities.base64Decode(parts[1]);
  if (bytes.length > maxBytes) throw new Error("檔案過大，上限 " + Math.round(maxBytes / 1024 / 1024) + "MB");
  var blob = Utilities.newBlob(bytes, contentType, filename || "file");
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return "https://drive.google.com/uc?id=" + file.getId();
}

function uploadPhoto(dataUrl, filename) {
  var folder = DriveApp.getFolderById(PHOTO_FOLDER_ID);
  return uploadToDrive(folder, dataUrl, filename, function (ct) { return ct.indexOf("image/") === 0; }, MAX_PHOTO_BYTES, "僅允許上傳影像檔");
}

function uploadManual(dataUrl, filename, brandName) {
  var folder = getBrandSubfolder(brandName, "盤點手冊");
  return uploadToDrive(folder, dataUrl, filename, function (ct) { return ct === "application/pdf"; }, MAX_MANUAL_BYTES, "僅允許上傳 PDF 檔");
}

// Layout 圖為 Excel 原檔（賣場配置圖，不可解析、需保留原始檔案格式）
function uploadLayout(dataUrl, filename, brandName) {
  var folder = getBrandSubfolder(brandName, "Layout圖");
  return uploadToDrive(folder, dataUrl, filename, isExcelType, MAX_LAYOUT_BYTES, "僅允許上傳 Excel 檔（.xlsx / .xls）");
}

// 盤點總表為 Excel 原檔，一家店一份，保留原始檔案（不解析成列資料，只由前端擷取「合計盤點總數」）
function uploadCountSheet(dataUrl, filename, brandName) {
  var folder = getBrandSubfolder(brandName, "盤點總表");
  return uploadToDrive(folder, dataUrl, filename, isExcelType, MAX_COUNT_BYTES, "僅允許上傳 Excel 檔（.xlsx / .xls）");
}

// 瀏覽器對 .xls/.xlsx 回報的 contentType 不一定精準，含 octet-stream 也放行（副檔名已在前端檢查過）
function isExcelType(ct) {
  return ct.indexOf("spreadsheet") >= 0 || ct.indexOf("ms-excel") >= 0 || ct === "application/octet-stream";
}

// 從 "https://drive.google.com/uc?id=XXXX" 取出 Drive 檔案 ID
function extractDriveId(url) {
  var m = String(url || "").match(/[?&]id=([^&]+)/);
  return m ? m[1] : null;
}

// 批次打包下載：files = [{fileUrl, fileName}]；伺服器端直接讀 Drive 檔案打包，避免瀏覽器端 CORS 限制
function zipFiles(files, zipName) {
  if (!files || files.length === 0) return { error: "沒有可下載的檔案" };
  var blobs = [];
  files.forEach(function (f) {
    var id = extractDriveId(f.fileUrl);
    if (!id) return;
    var blob = DriveApp.getFileById(id).getBlob();
    blobs.push(blob.setName(f.fileName || blob.getName()));
  });
  if (blobs.length === 0) return { error: "找不到可下載的檔案" };
  var zipBlob = Utilities.zip(blobs, (zipName || "下載") + ".zip");
  return { ok: true, filename: zipBlob.getName(), base64: Utilities.base64Encode(zipBlob.getBytes()) };
}

/* ---------- 主檔／庫存檔（資料量大：一個資料集 = 一個工作表，一列一筆） ----------
 * 索引分頁 masters：storeId, month, type, sheet（指向實際資料工作表名稱）
 * 資料工作表：第一列為欄位名稱，其後每列一筆。全部純文字格式。
 * 這樣可容納數萬列，不受單一儲存格 5 萬字元限制。
 */
var MASTER_INDEX_HEADERS = ["storeId", "month", "type", "sheet", "srcDate", "srcFile"];

function masterIndexSheet() {
  var sh = sheet("masters");
  var v = sh.getDataRange().getValues();
  if (v.length === 0 || v[0].join("") === "") {
    var hr = sh.getRange(1, 1, 1, MASTER_INDEX_HEADERS.length);
    hr.setNumberFormat("@"); hr.setValues([MASTER_INDEX_HEADERS]);
  }
  return sh;
}

function mastersIndex() {
  var sh = masterIndexSheet();
  var v = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === "") continue;
    out.push({ storeId: v[i][0], month: v[i][1], type: v[i][2], srcDate: v[i][4] || "", srcFile: v[i][5] || "" });
  }
  return out;
}

// 依 storeId/month/type 產生合法且唯一的資料工作表名稱
function dataSheetName(storeId, month, type) {
  var raw = "D_" + storeId + "_" + month + "_" + type;
  return raw.replace(/[:\\\/\?\*\[\]']/g, "_").substring(0, 95);
}

function getMaster(storeId, month, type) {
  var sh = masterIndexSheet();
  var v = sh.getDataRange().getValues();
  var name = null;
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === String(storeId) && String(v[i][1]) === String(month) && String(v[i][2]) === String(type)) { name = v[i][3]; break; }
  }
  if (!name) return null;
  var ds = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!ds) return null;
  var dv = ds.getDataRange().getValues();
  if (dv.length < 1) return { columns: [], rows: [] };
  var cols = dv[0];
  var rows = [];
  for (var r = 1; r < dv.length; r++) {
    if (dv[r].join("") === "") continue;
    var o = {};
    for (var c = 0; c < cols.length; c++) o[cols[c]] = dv[r][c];
    rows.push(o);
  }
  return { columns: cols, rows: rows };
}

function putMaster(rec) {
  var name = dataSheetName(rec.storeId, rec.month, rec.type);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ds = ss.getSheetByName(name);
  if (!ds) ds = ss.insertSheet(name); else ds.clear();
  var cols = rec.columns || [];
  var rows = rec.rows || [];
  if (cols.length) {
    var out = [cols];
    rows.forEach(function (r) { out.push(cols.map(function (c) { var v = r[c]; return v == null ? "" : v; })); });
    var rg = ds.getRange(1, 1, out.length, cols.length);
    rg.setNumberFormat("@"); rg.setValues(out);
  }
  // 索引 upsert
  var sh = masterIndexSheet();
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === String(rec.storeId) && String(v[i][1]) === String(rec.month) && String(v[i][2]) === String(rec.type)) {
      var rgU = sh.getRange(i + 1, 4, 1, 3); rgU.setNumberFormat("@"); rgU.setValues([[name, rec.srcDate || "", rec.srcFile || ""]]); return;
    }
  }
  var ri = sh.getLastRow() + 1;
  var rg2 = sh.getRange(ri, 1, 1, MASTER_INDEX_HEADERS.length);
  rg2.setNumberFormat("@"); rg2.setValues([[rec.storeId, rec.month, rec.type, name, rec.srcDate || "", rec.srcFile || ""]]);
}

// 批次寫入多店鋪主檔/庫存檔（歐聖寬表用）：baseRows=[[商品編號,物品名稱,成本],...] 只送一次，
// stores=[{storeId, qty:[各列數量]}] 每店鋪只帶自己的數量陣列。伺服器端在同一次執行內組回各店鋪完整列、逐一呼叫 putMaster 寫入，
// 取代前端「每個店鋪各自重送整份商品列」的做法——商品數×店鋪數一多，單次請求會被 Google 前端擋掉（瀏覽器端看到類似 CORS 的失敗）。
function putMasterBatch(payload) {
  var baseRows = payload.baseRows || [];
  var stores = payload.stores || [];
  var storeIds = [];
  stores.forEach(function (st) {
    var rows = baseRows.map(function (b, i) {
      return {
        "商品編號": b[0], "barcode": b[0], "舊商品編號2": "",
        "物品名稱": b[1], "庫存數量": String(st.qty[i]), "品項平均成本": b[2]
      };
    });
    putMaster({
      storeId: st.storeId, month: payload.month, type: payload.type,
      srcDate: payload.srcDate, srcFile: payload.srcFile,
      columns: ["商品編號", "barcode", "舊商品編號2", "物品名稱", "庫存數量", "品項平均成本"],
      rows: rows
    });
    storeIds.push(st.storeId);
  });
  return storeIds;
}

// 依來源檔名刪除主檔（同檔名重新上傳前先清空舊產出）
function deleteMastersByFile(srcFile, month) {
  var sh = masterIndexSheet();
  var v = sh.getDataRange().getValues();
  if (v.length < 2) return 0;
  var header = v[0];
  var keep = [header]; var removed = 0;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  for (var i = 1; i < v.length; i++) {
    var row = v[i];
    if (String(row[0]) === "") continue;
    if (String(row[5]) === String(srcFile) && String(row[1]) === String(month)) {
      var ds = ss.getSheetByName(row[3]); if (ds) { try { ss.deleteSheet(ds); } catch (e) {} }
      removed++;
    } else { keep.push(row); }
  }
  sh.clear();
  var rg = sh.getRange(1, 1, keep.length, header.length);
  rg.setNumberFormat("@"); rg.setValues(keep);
  return removed;
}

function safeParse(v, dft) {
  try { return JSON.parse(v); } catch (e) { return dft; }
}

/* ---------- 工具 ---------- */
function collectHeaders(rows) {
  var headers = [];
  rows.forEach(function (r) {
    Object.keys(r).forEach(function (k) { if (headers.indexOf(k) < 0) headers.push(k); });
  });
  return headers;
}

function toLine(row, headers) {
  return headers.map(function (h) {
    var v = row[h];
    if (v && typeof v === "object") return JSON.stringify(v);
    return v == null ? "" : v;
  });
}

function sheet(name) {
  var real = SHEET_NAMES[name] || name; // 英文代碼 → 中文分頁名
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(real);
  if (!sh) sh = ss.insertSheet(real);
  return sh;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
 * 一次性清理：刪除用不到的舊分頁
 * 用法：在 Apps Script 編輯器上方函式清單選「cleanupOldSheets」→ 按 ▶ 執行（首次會要求授權）
 * 會刪除：舊英文分頁、預設空白工作表，以及未被「主檔索引」引用的孤兒資料表(D_...)
 * 會保留：中文分頁（品牌/店鋪/盤點人員/單價/盤點紀錄/上傳紀錄/主檔索引/店名對應）與使用中的主檔資料表
 * ============================================================ */
function cleanupOldSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var removed = [];
  // 1) 舊英文分頁 + 預設空白表
  var oldNames = ["brands", "stores", "staff", "prices", "produced", "records", "uploads", "masters", "aliases", "工作表1", "Sheet1", "Sheet"];
  oldNames.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (sh) { try { ss.deleteSheet(sh); removed.push(name); } catch (e) {} }
  });
  // 2) 未被主檔索引引用的 D_ 孤兒資料表
  var used = {};
  var idx = ss.getSheetByName(SHEET_NAMES.masters); // 主檔索引
  if (idx) {
    var v = idx.getDataRange().getValues();
    for (var i = 1; i < v.length; i++) { if (v[i][3]) used[v[i][3]] = true; }
  }
  ss.getSheets().forEach(function (sh) {
    var nm = sh.getName();
    if (nm.indexOf("D_") === 0 && !used[nm]) { try { ss.deleteSheet(sh); removed.push(nm); } catch (e) {} }
  });
  Logger.log("已刪除 " + removed.length + " 個分頁：" + removed.join(", "));
  return removed;
}
