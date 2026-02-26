require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;

// 中介軟體
app.use(cors()); // 允許跨域請求
app.use(express.json()); // 解析 JSON 請求

// 資料庫連線設定（支援 Railway 的環境變數名稱）
const dbConfig = {
  host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
  port: parseInt(process.env.DB_PORT || process.env.MYSQLPORT || '3306'),
  user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
  password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
  database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'game_leaderboard',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+08:00'
};

// 顯示連線設定（隱藏密碼）
console.log('📦 資料庫連線設定:', {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  database: dbConfig.database
});

let pool = null;

// 建立連線池（帶重試機制）
async function createPool(retries = 5, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🔄 嘗試連線資料庫... (${i + 1}/${retries})`);
      pool = mysql.createPool(dbConfig);

      // 測試連線
      const connection = await pool.getConnection();
      connection.release();
      console.log('✅ 資料庫連線成功');
      return true;
    } catch (error) {
      console.error(`❌ 連線失敗: ${error.message}`);
      if (i < retries - 1) {
        console.log(`⏳ ${delay/1000} 秒後重試...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  return false;
}

// 初始化資料庫表格
async function initDatabase() {
  // 先建立連線
  const connected = await createPool();
  if (!connected) {
    console.error('❌ 無法連線到資料庫，請確認：');
    console.log('1. MySQL 服務是否已啟動');
    console.log('2. 環境變數是否正確設定');
    console.log('3. Railway 的 MySQL 是否已準備就緒');
    process.exit(1);
  }

  try {
    const connection = await pool.getConnection();

    // 建立排行榜資料表
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS leaderboard (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        score INT NOT NULL,
        level INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_score (score DESC)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    connection.release();
    console.log('✅ 資料庫表格初始化完成');
  } catch (error) {
    console.error('❌ 資料庫初始化失敗:', error.message);
    process.exit(1);
  }
}

// ===== API 路由 =====

// 取得排行榜（前 10 名）
app.get('/api/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const [rows] = await pool.execute(
      'SELECT id, name, score, level, created_at FROM leaderboard ORDER BY score DESC LIMIT ?',
      [String(limit)]
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('取得排行榜錯誤:', error);
    res.status(500).json({ success: false, error: '伺服器錯誤' });
  }
});

// 新增分數
app.post('/api/leaderboard', async (req, res) => {
  try {
    const { name, score, level } = req.body;

    // 驗證輸入
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: '名字不能為空' });
    }
    if (typeof score !== 'number' || score < 0) {
      return res.status(400).json({ success: false, error: '分數必須是正數' });
    }
    if (typeof level !== 'number' || level < 1) {
      return res.status(400).json({ success: false, error: '關卡必須是正整數' });
    }

    // 清理名字（防止 XSS）
    const cleanName = name.trim().slice(0, 20);

    // 新增記錄
    const [result] = await pool.execute(
      'INSERT INTO leaderboard (name, score, level) VALUES (?, ?, ?)',
      [cleanName, score, level]
    );

    // 計算排名
    const [rankResult] = await pool.execute(
      'SELECT COUNT(*) as `rank` FROM leaderboard WHERE score > ?',
      [score]
    );

    res.json({
      success: true,
      data: {
        id: result.insertId,
        rank: rankResult[0].rank + 1
      }
    });
  } catch (error) {
    console.error('新增分數錯誤:', error);
    res.status(500).json({ success: false, error: '伺服器錯誤' });
  }
});

// 清除排行榜（需要密碼保護）
app.delete('/api/leaderboard', async (req, res) => {
  try {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    if (password !== adminPassword) {
      return res.status(403).json({ success: false, error: '密碼錯誤' });
    }

    await pool.execute('DELETE FROM leaderboard');
    res.json({ success: true, message: '排行榜已清除' });
  } catch (error) {
    console.error('清除排行榜錯誤:', error);
    res.status(500).json({ success: false, error: '伺服器錯誤' });
  }
});

// 健康檢查
app.get('/api/health', async (req, res) => {
  try {
    await pool.execute('SELECT 1');
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

// 啟動伺服器
async function start() {
  await initDatabase();

  app.listen(PORT, () => {
    console.log(`🎮 排行榜 API 伺服器運行中: http://localhost:${PORT}`);
    console.log(`📊 API 端點:`);
    console.log(`   GET  /api/leaderboard - 取得排行榜`);
    console.log(`   POST /api/leaderboard - 新增分數`);
    console.log(`   DELETE /api/leaderboard - 清除排行榜`);
    console.log(`   GET  /api/health - 健康檢查`);
  });
}

start();

// 優雅關閉
process.on('SIGINT', async () => {
  console.log('\n正在關閉伺服器...');
  await pool.end();
  process.exit(0);
});
