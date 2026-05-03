# Hostinger Deployment Guide

## 🎯 Pre-Deployment Checklist

- [ ] All PHP files created locally
- [ ] Tested locally with `php -S` server
- [ ] MySQL schema and seed data created
- [ ] `.env` file configured with Hostinger credentials
- [ ] Domain points to Hostinger nameservers
- [ ] SSL certificate ready (or use Hostinger's AutoSSL)

---

## 📋 Step-by-Step Deployment

### Step 1: Prepare Hostinger MySQL Database

1. **Log into hPanel** → Databases
2. **Create Database:**
   - Name: `u621951378_pounds`
   - Charset: utf8mb4
3. **Create User:**
   - Username: `u621951378_pounds`
   - Password: Generate strong password (20+ chars with mixed case, numbers, symbols)
   - Privileges: ALL
4. **Note Down:**
   - Host: `31.170.167.2` (or use localhost if same server)
   - Database: `u621951378_pounds`
   - User: `u621951378_pounds`
   - Password: `your_secure_password`

### Step 2: Import MySQL Schema

1. **Via hPanel:**
   - Go to Databases → phpMyAdmin
   - Select database `u621951378_pounds`
   - Go to **Import** tab
   - Upload `database/schema.sql`
   - Click Import (wait for completion)

2. **Seed Data:**
   - Go to **Import** tab again
   - Upload `database/seed.sql`
   - Click Import

3. **Verify:**
   - Click **Structure** tab
   - Should see 15 tables (users, loans, kyc_forms, etc.)
   - Click on `users` table → Browse
   - Should see 4 default users (superadmin, admin, officer, borrower)

### Step 3: Upload Files to Hostinger

**Option A: Via File Manager (hPanel)**
1. Go to hPanel → Files → File Manager
2. Navigate to `public_html`
3. Upload all files from `pounds_php/` EXCEPT:
   - `.git/` folder
   - `.env` file (create separately on server)
   - `DEVELOPMENT.md` (optional, for reference)

**Option B: Via FTP (recommended for large uploads)**
```bash
# Using FTP client (Filezilla, WinSCP, or command line)
# Host: your-domain.com or ftp.your-domain.com
# Username: your-ftp-user
# Password: your-ftp-password

# Upload structure:
# public_html/
# ├── index.php
# ├── .htaccess
# ├── app/
# ├── config/
# ├── database/
# ├── public/
# └── vendor/
```

### Step 4: Create .env File on Server

**Via hPanel File Manager:**
1. Go to Files → File Manager
2. Right-click in root (same level as public_html) or inside public_html
3. Create new file: `.env`
4. Edit and paste:

```env
APP_NAME="Pounds Microfinance Ltd"
APP_URL=https://pounds.insider.co.tz
APP_ENV=production
APP_DEBUG=false

DB_HOST=31.170.167.2
DB_PORT=3306
DB_NAME=u621951378_pounds
DB_USER=u621951378_pounds
DB_PASS=your_password_from_step_1

JWT_SECRET=your_random_32_char_hex_string
CRON_SECRET=your_cron_secret_token

SMTP_HOST=smtp.hostinger.com
SMTP_PORT=587
SMTP_USER=your-email@pounds.insider.co.tz
SMTP_PASS=your_email_password
SMTP_FROM="Pounds MFI <noreply@pounds.insider.co.tz>"

BEEM_API_KEY=your_beem_api_key
EVOLUTION_API_URL=https://your-evolution-url
EVOLUTION_API_TOKEN=your_evolution_token
```

**Generate random secrets:**
```bash
# On your local machine:
php -r "echo bin2hex(random_bytes(32));"  # Repeat twice
```

### Step 5: Set File Permissions

Via hPanel → File Manager:
- Right-click on `public/` → Permissions → Set to `755`
- Right-click on `public/uploads/` → Permissions → Set to `755`
- Right-click on `.env` → Permissions → Set to `644`
- Right-click on `app/` → Permissions → Set to `755`

**Or via FTP/SSH:**
```bash
chmod 755 public/
chmod 755 public/uploads/
chmod 755 app/
chmod 644 .env
```

### Step 6: Configure Cron Jobs

**In hPanel → Cron Jobs:**

**Add Cron Job 1: Daily Penalty Calculation**
- **Schedule:** 0 1 * * * (Daily at 1 AM)
- **Command:**
```
curl -s "https://pounds.insider.co.tz/cron/penalties?token=YOUR_CRON_SECRET"
```

**Add Cron Job 2: Hourly Notification Retry**
- **Schedule:** 0 * * * * (Every hour)
- **Command:**
```
curl -s "https://pounds.insider.co.tz/cron/retry-notifications?token=YOUR_CRON_SECRET"
```

### Step 7: Configure Domain & SSL

**In hPanel → Domains:**
1. Add domain `pounds.insider.co.tz`
2. Point to your Hostinger nameservers
3. Enable AutoSSL (or upload manual certificate)
4. Set document root to: `/public_html` (or `/public_html/public` if using subdirectory)

### Step 8: Test the Installation

1. **Check homepage:**
   - Visit: `https://pounds.insider.co.tz`
   - Should show login page (or redirect to login)
   - Should NOT show any error

2. **Test login:**
   - Email: `superadmin@pounds.mfi`
   - Password: `Admin@123456`
   - Should see Dashboard with KPI cards

3. **Test API:**
   ```bash
   curl -X POST https://pounds.insider.co.tz/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"superadmin@pounds.mfi","password":"Admin@123456"}'
   ```
   Should return JSON with `accessToken`

4. **Check error log:**
   - hPanel → Files → public_html
   - Look for `error.log` or `php-errors.log`
   - Should be minimal or empty

---

## 🔧 Troubleshooting Deployment

### Issue: "404 Not Found" on all pages
**Solution:**
- Check `.htaccess` is present in `public_html`
- Verify Apache `mod_rewrite` is enabled (usually is on Hostinger)
- Contact Hostinger support to enable if needed

### Issue: "Database Connection Error"
**Solution:**
- Verify DB credentials in `.env` match Hostinger
- Check host is `31.170.167.2` (not `localhost`)
- Ensure MySQL user has ALL privileges
- Test connection via phpMyAdmin first

### Issue: "Cron job failed" or "Cron task is disabled"
**Solution:**
- Ensure URL is HTTPS
- Test cron URL manually in browser
- Verify token matches CRON_SECRET in .env
- Check that both GET params are passed correctly

### Issue: "File upload fails" or "Permission denied"
**Solution:**
- Set `public/uploads/` to 755
- Verify files are uploading to correct directory
- Check max file size in PHP settings (usually 8MB on shared hosting)

### Issue: "Email not sending"
**Solution:**
- Verify SMTP credentials in .env
- Test with Hostinger's SMTP: `smtp.hostinger.com` port `587`
- Enable "Less secure apps" if using Gmail
- Check `/var/log/mail.log` for errors (if available)

---

## 📊 Post-Deployment Verification

### Database
```sql
-- Via phpMyAdmin
SELECT COUNT(*) FROM users;           -- Should be 4
SELECT COUNT(*) FROM loan_packages;   -- Should be 4
SELECT COUNT(*) FROM settings;        -- Should be 4
```

### Cron Jobs
- Log into hPanel → Cron Jobs
- Should show 2 cron jobs (penalties, notification retry)
- Status should be "Active"

### Logs
- hPanel → Files → error.log
- Should have NO critical errors
- Minor warnings are OK

### Performance
- First load: ~1-2 seconds (slower on shared hosting)
- Subsequent loads: <1 second (with caching)
- Use Chrome DevTools to check load times

---

## 🛡️ Security Checklist

- [ ] `.env` NOT visible to public (should return 403)
- [ ] `app/` directory NOT directly browsable
- [ ] `database/` directory NOT directly browsable
- [ ] HTTPS forced (check .htaccess rewrite rules)
- [ ] JWT secret is 32+ random characters
- [ ] Cron secret is different from JWT secret
- [ ] Database password is 20+ characters with mixed case
- [ ] SMTP password is NOT the same as MySQL password

---

## 📞 Support Contacts

| Issue | Contact |
|-------|---------|
| Hostinger account/hPanel | support@hostinger.com |
| Domain/DNS issues | support@hostinger.com |
| MySQL/Database | Hostinger support, phpMyAdmin help |
| PHP errors | Check error log, PHP documentation |
| General hosting | Hostinger help center |

---

## 🎯 Final Checklist Before Going Live

- [ ] All 4 default users can login
- [ ] Dashboard loads and displays KPIs
- [ ] Loan creation works end-to-end
- [ ] KYC form can be submitted
- [ ] File uploads work (receipts, documents)
- [ ] Notifications are being queued (check DB)
- [ ] Cron jobs execute (check logs)
- [ ] HTTPS redirect works
- [ ] Performance is acceptable (<2s page load)
- [ ] Error logs are clean
- [ ] Backups are configured (if needed)

---

## 🚀 You're Live!

Once all checks pass, your Pounds MFI system is ready for production use at:
**https://pounds.insider.co.tz**

Monitor for the first 24-48 hours:
- Check error logs regularly
- Test all major workflows
- Verify notifications are sending
- Monitor cron job execution
- Have Hostinger support number ready

Good luck! 🎉
