-- =====================================================
-- GOSIA 2.0 STYLIST MANAGER - DATABASE SCHEMA
-- MySQL Database Initialization Script (UPDATED)
-- =====================================================

-- =====================================================
-- TABELA: users
-- =====================================================

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
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
    type ENUM('post-instagram', 'story', 'reel', 'sesja', 'konsultacja', 'event', 'inne') NOT NULL DEFAULT 'inne',
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
    INDEX idx_payment_status (payment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABELA: collaboration_team
-- =====================================================

CREATE TABLE IF NOT EXISTS collaboration_team (
    id INT AUTO_INCREMENT PRIMARY KEY,
    collaboration_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    
    FOREIGN KEY (collaboration_id) REFERENCES collaborations(id) ON DELETE CASCADE,
    INDEX idx_collaboration_id (collaboration_id)
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
-- PIERWSZY UŻYTKOWNIK
-- Login: admin / Hasło: password
-- WAŻNE: Zmień hasło po pierwszym logowaniu!
-- =====================================================

INSERT INTO users (username, password_hash, email) VALUES 
('admin', '$2y$12$QaVmcvONpCjvZOSMR1Oc2O.3ot1wzzleG2Rz4zBTZwqTAAjJMf5JC', 'gosia@example.com')
ON DUPLICATE KEY UPDATE username = username;
