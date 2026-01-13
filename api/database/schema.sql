-- =====================================================
-- GOSIA STYLIST MANAGER - DATABASE SCHEMA
-- MySQL Database Initialization Script
-- =====================================================

-- Użyj swojej bazy danych
-- USE mae7pu_panelmal;

-- =====================================================
-- TABELA: users
-- Przechowuje dane użytkowników (login/hasło)
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
-- Przechowuje współprace/zlecenia
-- =====================================================

CREATE TABLE IF NOT EXISTS collaborations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    brand VARCHAR(100) NOT NULL,
    type ENUM('post-instagram', 'story', 'reel', 'sesja', 'konsultacja', 'event', 'inne') NOT NULL DEFAULT 'inne',
    amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
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
-- TABELA: returns
-- Przechowuje odzież do zwrotu
-- =====================================================

CREATE TABLE IF NOT EXISTS returns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    store VARCHAR(100) NOT NULL,
    items VARCHAR(255) NOT NULL,
    purchase_date DATE NOT NULL,
    return_days INT NOT NULL DEFAULT 14,
    amount DECIMAL(10, 2) DEFAULT 0.00,
    notes TEXT,
    status ENUM('pending', 'returned') DEFAULT 'pending',
    returned_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_purchase_date (purchase_date),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- PIERWSZY UŻYTKOWNIK (do zmiany!)
-- Hasło: password (zahashowane bcrypt)
-- WAŻNE: Zmień hasło po pierwszym logowaniu!
-- =====================================================

-- Wygeneruj nowe hasło: https://bcrypt-generator.com/ lub w PHP: password_hash('twoje_haslo', PASSWORD_BCRYPT)
INSERT INTO users (username, password_hash, email) VALUES 
('admin', '$2y$12$QaVmcvONpCjvZOSMR1Oc2O.3ot1wzzleG2Rz4zBTZwqTAAjJMf5JC', 'gosia@example.com')
ON DUPLICATE KEY UPDATE username = username;

-- =====================================================
-- TESTOWE DANE (opcjonalne - usuń w produkcji)
-- =====================================================

-- INSERT INTO collaborations (user_id, brand, type, amount, date, payment_status, notes) VALUES
-- (1, 'Reserved', 'post-instagram', 2500.00, '2026-01-15', 'pending', 'Zimowa kolekcja'),
-- (1, 'Zara', 'sesja', 3500.00, '2026-01-20', 'pending', 'Lookbook wiosna');

-- INSERT INTO returns (user_id, store, items, purchase_date, return_days, amount, notes) VALUES
-- (1, 'H&M', 'Sukienka czarna', '2026-01-10', 14, 299.00, 'Na sesję Reserved');
