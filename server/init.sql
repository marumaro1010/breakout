-- 初始化資料庫腳本
-- Docker 會在第一次啟動時自動執行此腳本

USE game_leaderboard;

-- 建立排行榜資料表
CREATE TABLE IF NOT EXISTS leaderboard (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    score INT NOT NULL,
    level INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_score (score DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 插入測試資料（可選）
-- INSERT INTO leaderboard (name, score, level) VALUES
--     ('測試玩家1', 5000, 5),
--     ('測試玩家2', 4500, 4),
--     ('測試玩家3', 4000, 3);
