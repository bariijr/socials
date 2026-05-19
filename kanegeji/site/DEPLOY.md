# Kanegeji Parish ERP — Deployment Guide

## Requirements

| Component | Minimum |
|---|---|
| PHP | 8.3 (with pdo_mysql, mbstring, gd, curl, fileinfo, zip, intl) |
| MySQL / MariaDB | 8.0 / 10.6 |
| Apache | 2.4 with mod_rewrite |
| Disk | 500 MB |
| Hostinger Plan | Business or VPS |

---

## 1. Create Database (hPanel)

1. Log in to Hostinger hPanel → **Databases → MySQL Databases**
2. Create database: `kanegeji_erp`
3. Create user: `kanegeji_user` with a strong password
4. Grant the user **All Privileges** on `kanegeji_erp`
5. Note the hostname (usually `localhost`)

---

## 2. Upload Files

### Option A — File Manager (cPanel)
1. Zip the project root: `zip -r kanegeji.zip . --exclude=".git/*" --exclude="vendor/*"`
2. Upload zip to `public_html` parent (one level up from webroot)
3. Extract there so files land in `kanegeji/` alongside `public_html/`
4. Move files inside `kanegeji/site/public_html/` into your domain's `public_html/`

### Option B — SSH / SFTP (recommended)
```bash
# On your machine
rsync -avz --exclude='.git' --exclude='vendor' \
  kanegeji/site/ user@hostname:/home/user/kanegeji_site/

# On server
cd /home/user/kanegeji_site
composer install --no-dev --optimize-autoloader

# Symlink or move public_html into your domain root
ln -s /home/user/kanegeji_site/public_html /home/user/domains/yourdomain.com/public_html
```

---

## 3. Install PHP Dependencies

Via SSH:
```bash
cd /path/to/kanegeji_site
composer install --no-dev --optimize-autoloader
```

If Composer is not available:
```bash
curl -sS https://getcomposer.org/installer | php
php composer.phar install --no-dev --optimize-autoloader
```

---

## 4. Configure Environment

```bash
cp .env.example .env
nano .env
```

Minimum required values:
```
APP_KEY=<run: php -r "echo bin2hex(random_bytes(32));"> 
APP_URL=https://yourdomain.com
DB_HOST=localhost
DB_NAME=kanegeji_erp
DB_USER=kanegeji_user
DB_PASS=yourpassword
MAIL_HOST=smtp.gmail.com
MAIL_USERNAME=your@gmail.com
MAIL_PASSWORD=app_specific_password
OPENAI_API_KEY=sk-...    # required for AI chat module
AT_USERNAME=...           # AfricasTalking, required for SMS
AT_API_KEY=...
```

---

## 5. Run the Web Installer

Navigate to: `https://yourdomain.com/install/`

The installer will:
1. Check PHP extensions and permissions
2. Accept database credentials (or read from `.env`)
3. Run all database migrations (001–004)
4. Create the first super_admin parish + user
5. Lock itself (creates `.installed` file)

**After install: delete or move `public_html/install/` from the server.**

---

## 6. Directory Permissions

```bash
chmod 755 storage/
chmod 755 storage/uploads/
chmod 755 storage/cache/
chmod 755 storage/logs/
chmod 755 storage/backups/
chmod 644 .env
```

Ensure your web server (www-data / nobody) can write to `storage/`.

---

## 7. Cron Jobs (hPanel → Cron Jobs)

Set timezone to `Africa/Dar_es_Salaam` in cron settings.

| Schedule | Command | Purpose |
|---|---|---|
| Every Friday 08:00 | `php /path/to/cron/pledge_reminders.php` | Pledge payment reminders |
| 1st of month 07:00 | `php /path/to/cron/budget_alerts.php` | Budget overage alerts |
| Daily 02:00 | `php /path/to/cron/backup.php` | Database backup |

Full cron example in hPanel:
```
0 8 * * 5    php /home/user/kanegeji_site/cron/pledge_reminders.php >> /home/user/logs/pledges.log 2>&1
0 7 1 * *    php /home/user/kanegeji_site/cron/budget_alerts.php >> /home/user/logs/budget.log 2>&1
0 2 * * *    php /home/user/kanegeji_site/cron/backup.php >> /home/user/logs/backup.log 2>&1
```

---

## 8. Post-Install Checklist

- [ ] Visit `https://yourdomain.com/install/` and complete setup
- [ ] Delete `public_html/install/` directory
- [ ] Log in as super_admin, set parish name and logo in Settings
- [ ] Create staff user accounts (Users → Create)
- [ ] Import or add members
- [ ] Run `004-phase4-schema.sql` if install wizard was skipped
- [ ] Test password reset email
- [ ] Test AfricasTalking SMS (use sandbox first)
- [ ] Upload parish logo to `public_html/img/`
- [ ] Set `APP_DEBUG=false` in `.env` for production
- [ ] Verify `storage/logs/` is not publicly accessible (`.htaccess` blocks it)

---

## 9. Updates / Re-deploy

```bash
git pull origin main
composer install --no-dev --optimize-autoloader
# Run any new migration manually:
mysql -u kanegeji_user -p kanegeji_erp < database/migrations/005-*.sql
```

---

## 10. Backup & Restore

Manual backup:
```bash
php cron/backup.php
# Backup saved to storage/backups/kanegeji_YYYY-MM-DD.sql.gz
```

Restore:
```bash
gunzip < storage/backups/kanegeji_2026-05-01.sql.gz | mysql -u kanegeji_user -p kanegeji_erp
```
