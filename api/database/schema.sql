-- =====================================================
-- GOSIA 2.0 STYLIST MANAGER - DATABASE SCHEMA
-- MySQL Database Initialization Script (UPDATED)
--
-- Ten plik jest JEDYNYM źródłem prawdy dla świeżej instalacji.
-- Zmiany w istniejącej bazie: api/migrations/ (php api/migrations/run.php)
-- =====================================================

-- =====================================================
-- TABELA: migrations (rejestr wykonanych migracji)
-- =====================================================

CREATE TABLE IF NOT EXISTS migrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABELA: users
-- =====================================================

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    token_version INT NOT NULL DEFAULT 1,
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,

    INDEX idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABELA: collaborations
-- =====================================================

CREATE TABLE IF NOT EXISTS collaborations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    brand VARCHAR(100) NOT NULL,
    -- type: kategoria merytoryczna wspolpracy
    type ENUM('post-instagram', 'story', 'reel', 'sesja', 'konsultacja', 'event', 'umowa-praca', 'inne') NOT NULL DEFAULT 'inne',
    -- collab_type: sposob rozliczenia (dozwolone wartosci: config/Validator.php::COLLAB_BILLING_TYPES)
    collab_type VARCHAR(50) NOT NULL DEFAULT 'other',
    -- fiscal_tracking: czy wspolpraca wliczana do rozliczen podatkowych (gotowka = 0)
    fiscal_tracking BOOLEAN NOT NULL DEFAULT TRUE,
    amount_net DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    amount_gross DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    date DATE NOT NULL,
    payment_status ENUM('pending', 'paid', 'overdue') DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_date (date),
    INDEX idx_payment_status (payment_status),
    INDEX idx_collab_type (collab_type),
    INDEX idx_fiscal_tracking (fiscal_tracking)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABELA: collaboration_team
-- =====================================================

CREATE TABLE IF NOT EXISTS collaboration_team (
    id INT AUTO_INCREMENT PRIMARY KEY,
    collaboration_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    amount DECIMAL(10, 2) DEFAULT 0.00,
    is_paid BOOLEAN DEFAULT FALSE,

    FOREIGN KEY (collaboration_id) REFERENCES collaborations(id) ON DELETE CASCADE,
    INDEX idx_collaboration_id (collaboration_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABELA: social_stats
-- =====================================================

CREATE TABLE IF NOT EXISTS social_stats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    platform ENUM('facebook', 'instagram', 'tiktok', 'youtube') NOT NULL,
    followers_count INT NOT NULL DEFAULT 0,
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY idx_unique_daily (user_id, platform, date),
    INDEX idx_user_platform (user_id, platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABELA: social_connections (OAuth tokens)
-- =====================================================

CREATE TABLE IF NOT EXISTS social_connections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    provider ENUM('facebook', 'instagram', 'tiktok', 'youtube') NOT NULL,
    provider_user_id VARCHAR(255),
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY idx_user_provider (user_id, provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABELA: purchases (dawniej returns)
-- =====================================================

CREATE TABLE IF NOT EXISTS purchases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    store VARCHAR(100) NOT NULL,
    items VARCHAR(255) NOT NULL,
    purchase_date DATE NOT NULL,
    return_days INT NOT NULL DEFAULT 14,
    amount DECIMAL(10, 2) DEFAULT 0.00,
    returned_amount DECIMAL(10, 2) DEFAULT 0.00,
    purchase_url VARCHAR(255),
    notes TEXT,
    status ENUM('kept', 'returned', 'partial') DEFAULT 'kept',
    returned_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_purchase_date (purchase_date),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================
-- TABELA: ideas (Pomysły na rolki)
-- =====================================================

CREATE TABLE IF NOT EXISTS ideas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    status ENUM('draft', 'recorded') DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABELA: push_subscriptions (Web Push)
-- =====================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    endpoint VARCHAR(500) NOT NULL,
    endpoint_hash CHAR(64) NOT NULL,
    p256dh VARCHAR(255) NOT NULL,
    auth VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY idx_endpoint_hash (endpoint_hash),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABELA: attachments (załączniki współprac i zakupów)
-- =====================================================

CREATE TABLE IF NOT EXISTS attachments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    entity_type ENUM('collaboration', 'purchase') NOT NULL,
    entity_id INT NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(80) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- LIMIT PRÓB LOGOWANIA (rate limiting)
-- =====================================================

CREATE TABLE IF NOT EXISTS login_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_login_attempts (username, ip_address, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- PIERWSZY UŻYTKOWNIK
-- Ze względów bezpieczeństwa schemat NIE zawiera domyślnego hasła.
-- Utwórz użytkownika ręcznie, generując hash własnego hasła:
--   php -r "echo password_hash('TWOJE_HASLO', PASSWORD_DEFAULT), PHP_EOL;"
-- a następnie:
--   INSERT INTO users (username, password_hash, email)
--   VALUES ('admin', '<WYGENEROWANY_HASH>', 'twoj-email@example.com');
-- =====================================================
