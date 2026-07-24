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
  // 統一包 try/catch：後端出錯時回傳看得懂的 JSON 錯誤訊息（含堆疊），前端才不會只看到霧霧的 CORS/失敗
  try {
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
        return jsonOut(zipFiles(body.files, body.zipName, body.asLayoutPdf));
      case "layoutPdf":
        return jsonOut(layoutPdf(body.fileUrl, body.fileName));
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
  } catch (err) {
    return jsonOut({ error: String(err && err.message ? err.message : err) });
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
// asLayoutPdf=true 時，每份先把 Excel 的「賣場+倉庫 LAYOUT」分頁轉成 PDF 再打包（Layout 圖用）
function zipFiles(files, zipName, asLayoutPdf) {
  if (!files || files.length === 0) return { error: "沒有可下載的檔案" };
  var blobs = [];
  files.forEach(function (f) {
    var id = extractDriveId(f.fileUrl);
    if (!id) return;
    var blob, fname;
    if (asLayoutPdf) {
      blob = layoutExcelToPdf(id);
      fname = String(f.fileName || blob.getName()).replace(/\.(xlsx|xls)$/i, "") + ".pdf";
    } else {
      blob = DriveApp.getFileById(id).getBlob();
      fname = f.fileName || blob.getName();
    }
    blobs.push(blob.setName(fname));
  });
  if (blobs.length === 0) return { error: "找不到可下載的檔案" };
  var zipBlob = Utilities.zip(blobs, (zipName || "下載") + ".zip");
  return { ok: true, filename: zipBlob.getName(), base64: Utilities.base64Encode(zipBlob.getBytes()) };
}

// Layout 圖只轉這張分頁（名稱去掉空白後包含此關鍵字者）
var LAYOUT_SHEET_KEYWORD = "賣場+倉庫";

// 把 Drive 上的 Excel（.xls/.xlsx）轉成 PDF，只輸出「賣場+倉庫 LAYOUT」那張分頁。
// 作法：先把 Excel 匯入成暫存 Google 試算表（需啟用進階服務 Drive API），用 export 端點只匯出指定分頁的 PDF，最後刪除暫存試算表。
// 需求：Apps Script 專案要啟用進階 Google 服務「Drive API」（編輯器左側「服務 +」→ 加入 Drive API）。
// 把 Excel blob 匯入成 Google 試算表，回傳新試算表 ID。自動相容 Drive API v2 與 v3：
// v2 用 Drive.Files.insert(...{convert:true})；v3 用 Drive.Files.create（在 metadata 指定 Google 格式 mimeType 即自動轉換）
function importXlsxToGoogleSheet(blob, title) {
  if (Drive.Files.insert) {
    return Drive.Files.insert({ title: title, mimeType: MimeType.GOOGLE_SHEETS }, blob, { convert: true }).id;
  }
  return Drive.Files.create({ name: title, mimeType: MimeType.GOOGLE_SHEETS }, blob).id;
}

function layoutExcelToPdf(fileId) {
  var xlsxFile = DriveApp.getFileById(fileId);
  var ssId = importXlsxToGoogleSheet(xlsxFile.getBlob(), "_tmp_layout_" + fileId);
  try {
    var ss = SpreadsheetApp.openById(ssId);
    var sheets = ss.getSheets();
    var target = null;
    for (var i = 0; i < sheets.length; i++) {
      if (sheets[i].getName().replace(/\s/g, "").indexOf(LAYOUT_SHEET_KEYWORD) >= 0) { target = sheets[i]; break; }
    }
    if (!target) target = sheets[0];
    var gid = target.getSheetId();
    var url = "https://docs.google.com/spreadsheets/d/" + ssId + "/export?format=pdf"
      + "&gid=" + gid
      + "&portrait=false"      // 橫向（賣場配置圖通常較寬）
      + "&fitw=true"           // 縮放符合頁寬，盡量不切欄
      + "&gridlines=false"
      + "&sheetnames=false&printtitle=false&pagenumbers=false"
      + "&top_margin=0.3&bottom_margin=0.3&left_margin=0.3&right_margin=0.3";
    var resp = UrlFetchApp.fetch(url, { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() } });
    return resp.getBlob();
  } finally {
    // 用 DriveApp 刪暫存試算表（跨 v2/v3 都適用）
    try { DriveApp.getFileById(ssId).setTrashed(true); } catch (e) {}
  }
}

// 單張 Layout PDF 下載：把指定 Drive Excel 轉成 PDF，回傳 base64
function layoutPdf(fileUrl, fileName) {
  var id = extractDriveId(fileUrl);
  if (!id) return { error: "找不到檔案" };
  var pdf = layoutExcelToPdf(id);
  var name = String(fileName || "layout").replace(/\.(xlsx|xls)$/i, "") + ".pdf";
  return { ok: true, filename: name, base64: Utilities.base64Encode(pdf.getBytes()) };
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

// 依 storeId/month/type 產生合法且唯一的資料工作表名稱（主檔／單店格式用）
function dataSheetName(storeId, month, type) {
  var raw = "D_" + storeId + "_" + month + "_" + type;
  return raw.replace(/[:\\\/\?\*\[\]']/g, "_").substring(0, 95);
}

// 寬表工作表名稱（庫存檔用）：一次上傳(一個 srcFile)的所有店鋪共用同一份分頁，不依店鋪各自命名
function wideSheetName(srcFile, month, type) {
  var raw = "W_" + String(srcFile || "").replace(/\.[^.]+$/, "") + "_" + month + "_" + type;
  return raw.replace(/[:\\\/\?\*\[\]']/g, "_").substring(0, 95);
}

// 主檔索引 upsert：同 storeId+month+type 已存在就更新指向的分頁，不存在就新增一列
function upsertMasterIndex(storeId, month, type, sheetName, srcDate, srcFile) {
  var sh = masterIndexSheet();
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === String(storeId) && String(v[i][1]) === String(month) && String(v[i][2]) === String(type)) {
      var rgU = sh.getRange(i + 1, 4, 1, 3); rgU.setNumberFormat("@"); rgU.setValues([[sheetName, srcDate || "", srcFile || ""]]); return;
    }
  }
  var ri = sh.getLastRow() + 1;
  var rg2 = sh.getRange(ri, 1, 1, MASTER_INDEX_HEADERS.length);
  rg2.setNumberFormat("@"); rg2.setValues([[storeId, month, type, sheetName, srcDate || "", srcFile || ""]]);
}

// 讀取單一店鋪主檔／庫存檔。庫存檔存成「寬表」(商品固定欄+每店一欄數量，多店共用一份分頁)，
// 這裡會自動判斷：分頁表頭若找得到 storeId 這個欄位，代表是寬表，重組成標準 6 欄；否則照舊格式直接讀（主檔/舊資料）。
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
  var qtyColIdx = cols.indexOf(String(storeId));
  if (qtyColIdx >= 0) {
    // 寬表格式：商品固定欄(0-4)＋這家店的數量欄，重組回標準 6 欄
    var rows = [];
    for (var r = 1; r < dv.length; r++) {
      if (dv[r].join("") === "") continue;
      rows.push({
        "商品編號": dv[r][0], "barcode": dv[r][1], "舊商品編號2": dv[r][2],
        "物品名稱": dv[r][3], "品項平均成本": dv[r][4], "庫存數量": dv[r][qtyColIdx]
      });
    }
    return { columns: ["商品編號", "barcode", "舊商品編號2", "物品名稱", "庫存數量", "品項平均成本"], rows: rows };
  }
  // 舊格式／主檔：照原本欄位直接讀
  var rows2 = [];
  for (var r2 = 1; r2 < dv.length; r2++) {
    if (dv[r2].join("") === "") continue;
    var o = {};
    for (var c = 0; c < cols.length; c++) o[cols[c]] = dv[r2][c];
    rows2.push(o);
  }
  return { columns: cols, rows: rows2 };
}

// 寫入主檔（歐聖以外品牌／歐聖主檔，一份=一個店鋪或一個種類，非寬表）
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
  upsertMasterIndex(rec.storeId, rec.month, rec.type, name, rec.srcDate, rec.srcFile);
}

// 批次寫入多店鋪庫存檔（歐聖寬表用）：一次上傳只建「一份」分頁——商品固定欄(商品編號/barcode/舊商品編號2/
// 物品名稱/品項平均成本)只出現一次，後面每欄是一家店的數量(欄名=storeId)。取代舊做法「每家店各自存一份完整
// 明細」（40家店×2萬5千筆商品＝上百萬格重複寫入，是造成上傳過大/過慢/失敗的根本原因，不只是單次請求大小的問題）。
// baseRows=[[商品編號,物品名稱,成本],...]（該批商品列），stores=[{storeId, qty:[該批各列數量]}]。
// 商品數量非常大時，前端(api.js)會把商品列切成多個小請求依序送出：append=false(預設)為第一批，建立/清除重建這份
// 寬表分頁＋幫每家店的主檔索引指到這份分頁；append=true 為後續批次，只在寬表尾端加列，不動表頭、不重建索引。
function putMasterBatch(payload) {
  var baseRows = payload.baseRows || [];
  var stores = payload.stores || [];
  var append = !!payload.append;
  var storeIds = stores.map(function (st) { return st.storeId; });
  var name = wideSheetName(payload.srcFile, payload.month, payload.type);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ds = ss.getSheetByName(name);
  var headers = ["商品編號", "barcode", "舊商品編號2", "物品名稱", "品項平均成本"].concat(storeIds);

  if (!append) {
    if (!ds) ds = ss.insertSheet(name); else ds.clear();
    var hr = ds.getRange(1, 1, 1, headers.length);
    hr.setNumberFormat("@"); hr.setValues([headers]);
  }
  if (!ds) return storeIds; // append 但分頁不存在（理論上不會發生，防呆）

  var out = baseRows.map(function (b, i) {
    var row = [b[0], b[0], "", b[1], b[2]];
    stores.forEach(function (st) { row.push(String(st.qty[i])); });
    return row;
  });
  var startRow = append ? ds.getLastRow() + 1 : 2;
  var rg = ds.getRange(startRow, 1, out.length, headers.length);
  rg.setNumberFormat("@"); rg.setValues(out);

  if (!append) {
    storeIds.forEach(function (sid) { upsertMasterIndex(sid, payload.month, payload.type, name, payload.srcDate, payload.srcFile); });
  }
  return storeIds;
}

// 一次性資料轉換：把舊格式「每店一份完整明細」的庫存檔，轉成「一次上傳一份寬表」格式
// 用法：在 Apps Script 編輯器上方函式清單選「migrateStockToWideFormat」→ 按 ▶ 執行
// 會依 (srcFile, month) 分組，讀各店舊分頁的商品固定欄+數量欄，合併成一份寬表，更新索引指向新分頁，刪除舊分頁。
// 每一組都是「先讀完資料、確定安全 → 先刪舊分頁騰出空間 → 再建立寬表寫入」，避免新舊分頁同時並存瞬間
// 超過 Google Sheets 每份試算表 1000 萬儲存格的上限（這是舊格式一直上傳失敗的真正原因，不是請求大小或配額）。
function migrateStockToWideFormat() {
  var sh = masterIndexSheet();
  var v = sh.getDataRange().getValues();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var groups = {};
  for (var i = 1; i < v.length; i++) {
    var row = v[i];
    if (String(row[0]) === "" || String(row[2]) !== "stock") continue;
    var key = row[5] + "|" + row[1];
    (groups[key] = groups[key] || []).push({ storeId: row[0], month: row[1], sheetName: row[3], srcDate: row[4], srcFile: row[5] });
  }
  var migrated = 0, skipped = 0;
  Object.keys(groups).forEach(function (key) {
    var items = groups[key];
    var uniqueSheets = {}; items.forEach(function (x) { uniqueSheets[x.sheetName] = true; });
    if (Object.keys(uniqueSheets).length === 1 && items.length > 1) { skipped += items.length; return; } // 已是寬表(多店共用同一分頁)，略過
    var baseSheet = ss.getSheetByName(items[0].sheetName);
    if (!baseSheet) { skipped += items.length; return; }
    var baseVals = baseSheet.getDataRange().getValues();
    if (baseVals.length < 2) { skipped += items.length; return; }
    var baseCols = baseVals[0];
    var codeIdx = baseCols.indexOf("商品編號"), nameIdx = baseCols.indexOf("物品名稱"), costIdx = baseCols.indexOf("品項平均成本");
    if (codeIdx < 0) { skipped += items.length; return; } // 已是寬表格式（表頭沒有這些固定欄名）或格式不符，略過

    // 1) 先把這組全部店鋪的資料讀進記憶體（讀取不會增加儲存格用量，不受上限影響）
    var productRows = [];
    for (var r = 1; r < baseVals.length; r++) {
      if (baseVals[r].join("") === "") continue;
      productRows.push([baseVals[r][codeIdx], baseVals[r][nameIdx], baseVals[r][costIdx]]);
    }
    var storeIds = [], qtyByStore = {}, sheetsToDelete = {};
    items.forEach(function (it) {
      var ds = ss.getSheetByName(it.sheetName);
      if (!ds) return;
      var dv = ds.getDataRange().getValues();
      var cols = dv[0];
      var qIdx = cols.indexOf("庫存數量");
      var qty = [];
      for (var r2 = 1; r2 < dv.length; r2++) { if (dv[r2].join("") === "") continue; qty.push(dv[r2][qIdx]); }
      storeIds.push(it.storeId);
      qtyByStore[it.storeId] = qty;
      sheetsToDelete[it.sheetName] = true;
    });

    // 2) 資料讀完、確認安全後，先刪除這組的舊分頁騰出儲存格空間，再建立寬表——不要新舊同時並存
    Object.keys(sheetsToDelete).forEach(function (nm) {
      var oldDs = ss.getSheetByName(nm);
      if (oldDs) { try { ss.deleteSheet(oldDs); } catch (e) {} }
    });

    // 3) 騰出空間後才建立寬表並寫入
    var wideName = wideSheetName(items[0].srcFile, items[0].month, "stock");
    var wideSheet = ss.getSheetByName(wideName);
    if (!wideSheet) wideSheet = ss.insertSheet(wideName); else wideSheet.clear();
    var headers = ["商品編號", "barcode", "舊商品編號2", "物品名稱", "品項平均成本"].concat(storeIds);
    var out = [headers];
    productRows.forEach(function (p, idx) {
      var row = [p[0], p[0], "", p[1], p[2]];
      storeIds.forEach(function (sid) { row.push((qtyByStore[sid] && qtyByStore[sid][idx] != null) ? qtyByStore[sid][idx] : ""); });
      out.push(row);
    });
    var rg = wideSheet.getRange(1, 1, out.length, headers.length);
    rg.setNumberFormat("@"); rg.setValues(out);

    // 4) 更新索引，指向新的寬表分頁
    items.forEach(function (it) { upsertMasterIndex(it.storeId, it.month, "stock", wideName, it.srcDate, it.srcFile); });
    migrated += items.length;
  });
  Logger.log("已轉換 " + migrated + " 筆庫存檔索引為寬表格式，略過 " + skipped + " 筆(已是寬表或找不到資料)");
  return { migrated: migrated, skipped: skipped };
}

// 依來源檔名刪除主檔（同檔名重新上傳前先清空舊產出）
// 庫存檔為寬表，同一次上傳的多家店索引列會指向同一份分頁，用 deletedSheets 避免重複刪除同一份分頁時報錯
function deleteMastersByFile(srcFile, month) {
  var sh = masterIndexSheet();
  var v = sh.getDataRange().getValues();
  if (v.length < 2) return 0;
  var header = v[0];
  var keep = [header]; var removed = 0;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var deletedSheets = {};
  for (var i = 1; i < v.length; i++) {
    var row = v[i];
    if (String(row[0]) === "") continue;
    if (String(row[5]) === String(srcFile) && String(row[1]) === String(month)) {
      var sheetName = row[3];
      if (!deletedSheets[sheetName]) {
        var ds = ss.getSheetByName(sheetName); if (ds) { try { ss.deleteSheet(ds); } catch (e) {} }
        deletedSheets[sheetName] = true;
      }
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

/* ============================================================
 * 診斷用：檢查 Layout Excel→PDF 轉檔為何失敗
 * 用法：在 Apps Script 編輯器上方函式清單選「diagnoseLayout」→ 按 ▶ 執行（不需重新部署），看下方執行記錄
 * 會逐步印出：Drive 進階服務是否啟用、拿到的測試檔、實際轉檔有沒有成功／錯在哪
 * ============================================================ */
function diagnoseLayout() {
  Logger.log("① typeof Drive = " + (typeof Drive));
  if (typeof Drive === "undefined") {
    Logger.log("!! Drive 進階服務未啟用。請在編輯器左側『服務 +』加入 Drive API，存檔後再執行一次本函式。");
    return;
  }
  Logger.log("② Drive.Files.insert(v2)=" + (Drive.Files ? typeof Drive.Files.insert : "N/A") + "；Drive.Files.create(v3)=" + (Drive.Files ? typeof Drive.Files.create : "N/A"));
  var rows = readTab("layouts");
  Logger.log("③ layouts 分頁筆數 = " + rows.length);
  if (!rows.length) { Logger.log("!! layouts 分頁沒有資料，請先在平台上傳一張 Layout 圖再測。"); return; }
  var last = rows[rows.length - 1];
  Logger.log("④ 測試檔 fileName = " + last.fileName + "；fileUrl = " + last.fileUrl);
  var id = extractDriveId(last.fileUrl);
  Logger.log("⑤ 解析出的 fileId = " + id);
  if (!id) { Logger.log("!! fileUrl 解析不出 Drive 檔案 ID。"); return; }
  try {
    var pdf = layoutExcelToPdf(id);
    Logger.log("⑥ 轉檔成功！PDF 大小 = " + pdf.getBytes().length + " bytes");
  } catch (err) {
    Logger.log("⑥ 轉檔失敗：" + (err && err.stack ? err.stack : err));
  }
}
