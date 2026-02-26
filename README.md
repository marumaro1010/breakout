# 打磚塊遊戲 - 排行榜 API 伺服器

## 🎮 開啟遊戲

### 本地開發
```bash
# 在專案根目錄執行
python3 -m http.server 5500
```
然後開啟瀏覽器前往：**http://localhost:5500**

---

## 快速開始

### 1. 安裝依賴
```bash
cd server
npm install
```

### 2. 啟動伺服器
```bash
# 正式環境
npm start

# 開發環境（自動重啟）
npm run dev
```

伺服器預設運行在 `http://localhost:3000`

## API 端點

### 取得排行榜
```http
GET /api/leaderboard?limit=10
```

回應範例：
```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "玩家A", "score": 5000, "level": 5, "created_at": "2026-02-26T10:00:00.000Z" },
    { "id": 2, "name": "玩家B", "score": 4500, "level": 4, "created_at": "2026-02-26T09:30:00.000Z" }
  ]
}
```

### 新增分數
```http
POST /api/leaderboard
Content-Type: application/json

{
  "name": "玩家名稱",
  "score": 5000,
  "level": 5
}
```

回應範例：
```json
{
  "success": true,
  "data": {
    "id": 3,
    "rank": 1
  }
}
```

### 清除排行榜
```http
DELETE /api/leaderboard
Content-Type: application/json

{
  "password": "admin123"
}
```

## 注意事項
- 預設使用 SQLite，資料儲存在 `leaderboard.db`
- 正式環境建議改用 PostgreSQL 或 MySQL
- 記得更換 admin 密碼
