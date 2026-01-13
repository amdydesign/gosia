# Database Setup Instructions

## 🚀 Quick Setup (Choose ONE option)

### Option 1: Using setup.php (EASIEST)

1. **Upload `setup.php` to your server root**
   - Via FTP: upload to `public_html/`

2. **Run in browser**
   - Go to: `http://panel.malgorzatamordarska.pl/setup.php`
   - Wait for "Setup Complete!" message

3. **DELETE setup.php immediately!**
   - For security, remove it after use

4. **Test login**
   - Username: `admin`
   - Password: `password`

---

### Option 2: Using phpMyAdmin (MANUAL)

1. Go to: `panel.malgorzatamordarska.pl/phpmyadmin`
2. Login: `thaif7_panelmal` / `wia7Aungohdu`
3. Select database: `mae7pu_panelmal`
4. Click "SQL" tab
5. Copy entire content from `api/database/schema.sql`
6. Paste and click "Execute"

---

## 🔧 Local Development Setup

Your local `.env` is already configured to connect to production database:

```env
DB_HOST=panel.malgorzatamordarska.pl.mysql.dhosting.pl
DB_NAME=mae7pu_panelmal
DB_USER=thaif7_panelmal
DB_PASS=wia7Aungohdu
```

**After database is set up:**
1. Restart PHP server: `php -S localhost:8000` (in `api/` folder)
2. Start React: `npm run dev` (in `frontend/` folder)
3. Login at: `http://localhost:5173`

---

## ⚠️ Important Notes

- **Shared database**: Local development uses PRODUCTION database
- **Be careful**: Changes affect live data
- **Change password**: After first login, change from default `password`
- **Backup**: Export data regularly from phpMyAdmin
