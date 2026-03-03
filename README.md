## 🚀 快速開始

### 1. 啟動後端（Docker）

```bash
cd server
cp .env.example .env
# 編輯 .env 設定密碼

docker-compose up -d
```

| 服務 | 網址 |
|-----|-----|
| API | http://localhost:3000 |
| MySQL | localhost:3307 |
| phpMyAdmin | http://localhost:8081 |

### 2. 開啟遊戲（前端）

```bash
# 在專案根目錄執行
cd /game
python3 -m http.server 5500
```

然後開啟瀏覽器：**http://localhost:5500**

---

## 📁 專案結構

```
game/
├── index.html          # 遊戲主頁面
├── styles.css          # 樣式表
├── game.js             # 遊戲邏輯
├── images/             # 圖片資源
└── server/             # 後端 API（Docker）
    ├── index.js        # Express 伺服器
    ├── package.json    # 依賴管理
    ├── Dockerfile      # Node.js 映像
    ├── docker-compose.yml  # Docker 編排
    ├── init.sql        # 資料庫初始化
    └── .env.example    # 環境變數範例
```

---

### 1. 部署後端 API(以Railway為範例)

1. 登入 [Railway](https://railway.app/)
2. New Project → Deploy from GitHub repo
3. 選擇此 repo
4. Settings → Root Directory 設為 `server`
5. 新增 MySQL 服務
6. 設定環境變數

### 2. 部署前端

使用 GitHub Pages：
1. GitHub repo → Settings → Pages
2. Source 選擇 main branch
3. 網址：`https://你的帳號.github.io/game/`

### 3. 更新 API 網址

修改 `game.js` 中的 Railway 網址：
```javascript
return 'https://你的網址.up.railway.app/api';
```

---

## 📡 API 端點

| 方法 | 路徑 | 說明 |
|-----|-----|-----|
| GET | `/api/leaderboard` | 取得排行榜 |
| POST | `/api/leaderboard` | 新增分數 |
| GET | `/api/health` | 健康檢查 |

