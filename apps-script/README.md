# Google Sheets / Drive 資料橋樑 — 部署說明

讓「日翊盤點平台」把資料存進你指定的 Google Sheets，照片存進 Google Drive 資料夾，
達成 **手機與電腦開同一個網址、看到同一份資料**。之後要改放日翊資料庫時，只需改前端 `api.js`。

- 資料試算表：<https://docs.google.com/spreadsheets/d/1xIRyZFGQDaHOeUTXZy-avvzSamYOem252osHX549xE4/edit>
- 照片資料夾：<https://drive.google.com/drive/folders/1h9qjSAx2-sojs5_uP307qmBUvw-XiDhn>

---

## 一、部署 Apps Script（約 3 分鐘，需用你自己的 Google 帳號）

1. 開啟上方**資料試算表** → 上方選單 **擴充功能 → Apps Script**。
2. 把預設的 `Code.gs` 內容清空，貼上本資料夾 `Code.gs` 的全部內容，按存檔（💾）。
3. 右上角 **部署 → 新增部署作業**。
4. 齒輪選 **網頁應用程式（Web app）**，設定：
   - **執行身分（Execute as）**：`我（你的帳號）`
   - **具有存取權的使用者（Who has access）**：`任何人（Anyone）`
5. 按 **部署**，第一次會要求授權（存取 Sheets 與 Drive），一路同意。
6. 複製產生的 **網頁應用程式網址**（結尾是 `/exec`）。

## 二、把網址填進前端

打開專案根目錄的 `api.js`，把網址貼進：

```js
const API_CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/xxxxxxxx/exec",
};
```

存檔後，平台即從「本機模式」切換為「雲端共用模式」。手機與電腦開同一個平台網址就會共用資料。

## 三、資料表結構（分頁自動建立，無需手動建）

| 分頁 | 內容 | 主要欄位 |
|------|------|----------|
| `brands` | 品牌 | id, name |
| `stores` | 店鋪名單 | id, brandId, month, code, name |
| `staff` | 盤點人員名單 | id, brandId, month, empNo, name |
| `prices` | 單價設定 | storeId, priceType(piece/hour), unitPrice |
| `records` | 盤點填寫紀錄 | id, brandId, storeId, month, date, startTime, endTime, headcount, pieces, special, photos, filledBy |
| `uploads` | 客戶主檔上傳紀錄 | id, brandId, month, type, fileName, storeCount, rowCount, uploadedAt |
| `masters` | 依店鋪切分後的主檔／庫存檔 | storeId, month, type(master/stock), columns(JSON), rows(JSON) |

> 每列一筆、第一列為欄位名稱。所有分頁皆以「純文字格式」寫入，避免 Sheets 把 `2026-07`、`21:00` 自動轉成日期/時間。`photos`、`columns`、`rows` 欄位以 JSON 字串存放。

---

## 注意事項

- **改了 `Code.gs` 之後**：要重新「部署 → 管理部署作業 → 編輯 → 版本選新版本」才會生效（網址不變）。
- **並發**：盤點紀錄、上傳紀錄採「新增一列（append）」，多支手機同時填寫不會互相覆蓋；維護區（品牌/店鋪/人員/單價）為整表覆蓋，建議由單一管理者維護。
- **這是過渡方案**：正式上線改接日翊資料庫時，只需修改前端 `api.js`，其餘程式與 Sheets 內容可作為資料搬遷來源。
- 測試用資料請勿填入真實姓名、電話等個資。
