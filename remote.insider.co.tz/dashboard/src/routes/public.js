'use strict';

const express   = require('express');
const rateLimit = require('express-rate-limit');
const db        = require('../db');
const { getSettings } = require('../settings-cache');

const installRouter   = express.Router();
const deviceApiRouter = express.Router();

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Too many registration attempts. Try again later.' },
});

const RD_VER = '1.4.8';

// ── GET /install ──────────────────────────────────────────────────────────────
installRouter.get('/', async (req, res) => {
  try {
    const s = await getSettings();
    const domain    = process.env.DOMAIN || 'remote.insider.co.tz';
    const apiBase   = `https://${domain}`;
    const publicKey = process.env.RUSTDESK_PUBLIC_KEY || '9A5dd+PihusRR652Jc7Lw+cJYNMHIUn6flsbRUInJrI=';
    res.render('install', {
      title:       'Install — ' + (s.app_name || 'InsiderRemote'),
      appName:     s.app_name     || 'InsiderRemote',
      companyName: s.company_name || 'Insider Tech Sol',
      logoUrl:     s.logo_url     || '/img/logo.svg',
      faviconUrl:  s.favicon_url  || '/img/favicon.ico',
      domain,
      apiBase,
      publicKey,
      rdVer: RD_VER,
      user:  null,
      flash: {},
    });
  } catch (err) {
    console.error('[Public] Install page error:', err.message);
    res.status(500).send('Service temporarily unavailable.');
  }
});

// ── GET /install/download/windows.ps1 ────────────────────────────────────────
installRouter.get('/download/windows.ps1', async (req, res) => {
  const domain    = process.env.DOMAIN    || 'remote.insider.co.tz';
  const publicKey = process.env.RUSTDESK_PUBLIC_KEY || '';
  const apiBase   = `https://${domain}`;
  const s         = await getSettings().catch(() => ({}));
  const appName   = s.app_name   || 'InsiderRemote';
  const company   = s.company_name || 'Insider Tech Sol';

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="InsiderRemote-Setup.ps1"');
  res.send(buildWindowsScript(domain, publicKey, apiBase, appName, company));
});

// ── GET /install/download/linux.sh ────────────────────────────────────────────
installRouter.get('/download/linux.sh', async (req, res) => {
  const domain    = process.env.DOMAIN    || 'remote.insider.co.tz';
  const publicKey = process.env.RUSTDESK_PUBLIC_KEY || '';
  const apiBase   = `https://${domain}`;
  const s         = await getSettings().catch(() => ({}));
  const appName   = s.app_name    || 'InsiderRemote';
  const company   = s.company_name || 'Insider Tech Sol';

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="InsiderRemote-Setup.sh"');
  res.send(buildLinuxScript(domain, publicKey, apiBase, appName, company));
});

// ── GET /install/download/windows.bat ────────────────────────────────────────
installRouter.get('/download/windows.bat', async (req, res) => {
  const domain  = process.env.DOMAIN || 'remote.insider.co.tz';
  const apiBase = `https://${domain}`;
  const s       = await getSettings().catch(() => ({}));
  const appName = s.app_name || 'InsiderRemote';

  const bat = [
    `@echo off`,
    `title ${appName} Setup`,
    `echo.`,
    `echo  Downloading ${appName} installer...`,
    `echo  A security prompt will appear — click Yes to allow installation.`,
    `echo.`,
    `powershell -NoProfile -ExecutionPolicy Bypass -Command ^`,
    `  "$f=[IO.Path]::GetTempFileName()+'_ir.ps1';"^`,
    `  "(New-Object Net.WebClient).DownloadFile('${apiBase}/install/download/windows.ps1',$f);"^`,
    `  "Start-Process powershell -Verb RunAs -ArgumentList ('-NoP -EP Bypass -WindowStyle Hidden -File ""'+$f+'""')"`,
    `exit /b 0`,
  ].join('\r\n');

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${appName}-Setup.bat"`);
  res.send(bat);
});

// ── GET /install/download/mac.sh ──────────────────────────────────────────────
installRouter.get('/download/mac.sh', async (req, res) => {
  const domain    = process.env.DOMAIN    || 'remote.insider.co.tz';
  const publicKey = process.env.RUSTDESK_PUBLIC_KEY || '';
  const apiBase   = `https://${domain}`;
  const s         = await getSettings().catch(() => ({}));
  const appName   = s.app_name    || 'InsiderRemote';
  const company   = s.company_name || 'Insider Tech Sol';

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="InsiderRemote-Setup-Mac.sh"');
  res.send(buildMacScript(domain, publicKey, apiBase, appName, company));
});

// ── POST /api/device/register ─────────────────────────────────────────────────
deviceApiRouter.post('/register', registerLimiter, async (req, res) => {
  const { rustdesk_id, hostname, os_type, client_version, alias } = req.body;

  if (!rustdesk_id || !/^\d{9,20}$/.test(String(rustdesk_id))) {
    return res.status(400).json({ error: 'Invalid RustDesk ID.' });
  }

  const safeOs     = ['windows', 'linux', 'mac'].includes(os_type) ? os_type : 'windows';
  const clientIp   = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
  const safeAlias  = (alias || hostname || '').trim().substring(0, 255) || null;

  try {
    const result = await db.query(
      `INSERT INTO devices (rustdesk_id, alias, os_type, client_version, ip_address, status, last_seen_at)
       VALUES ($1, $2, $3, $4, $5::inet, 'pending', NOW())
       ON CONFLICT (rustdesk_id) DO UPDATE
         SET alias          = COALESCE(EXCLUDED.alias, devices.alias),
             client_version = EXCLUDED.client_version,
             ip_address     = EXCLUDED.ip_address,
             last_seen_at   = NOW()
       RETURNING id, status`,
      [
        String(rustdesk_id).trim(),
        safeAlias,
        safeOs,
        client_version ? String(client_version).trim().substring(0, 50) : null,
        clientIp,
      ]
    );

    const device    = result.rows[0];
    const isPending = device.status === 'pending';

    return res.json({
      status:  device.status,
      message: isPending
        ? 'Device registered and is awaiting admin approval.'
        : 'Device check-in updated.',
    });
  } catch (err) {
    console.error('[Public] Device register error:', err.message);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Windows PowerShell installer — GUI + self-elevation (no pre-admin required)
// ─────────────────────────────────────────────────────────────────────────────
function buildWindowsScript(server, publicKey, apiBase, appName, company) {
  const ts = new Date().toISOString();
  const L  = (s) => s; // passthrough for line items
  const lines = [
    `# ================================================================`,
    `# ${appName} Windows Client Setup`,
    `# Company : ${company}`,
    `# Server  : ${server}`,
    `# Built   : ${ts}`,
    `# ================================================================`,
    `# Paste this one-liner into any PowerShell window (non-admin ok):`,
    `#   irm '${apiBase}/install/download/windows.ps1' -OutFile`,
    `#   "$env:TEMP\\ir-setup.ps1"; Start-Process powershell -Verb RunAs`,
    `#   -ArgumentList "-NoP -EP Bypass -WindowStyle Hidden -File`,
    `#   $env:TEMP\\ir-setup.ps1"`,
    `# ================================================================`,
    ``,
    `param()`,
    `$ErrorActionPreference = 'Stop'`,
    ``,
    `# ── Load GUI assemblies ────────────────────────────────────────────`,
    `Add-Type -AssemblyName System.Windows.Forms`,
    `Add-Type -AssemblyName System.Drawing`,
    `[Windows.Forms.Application]::EnableVisualStyles()`,
    ``,
    `# ── Self-elevation (triggers UAC if not already admin) ─────────────`,
    `if (-not ([Security.Principal.WindowsPrincipal]`,
    `          [Security.Principal.WindowsIdentity]::GetCurrent()`,
    `         ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {`,
    `    $self = $MyInvocation.MyCommand.Definition`,
    `    Start-Process PowerShell -Verb RunAs -ArgumentList \``,
    `        "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \`"$self\`""`,
    `    Exit`,
    `}`,
    ``,
    `# ── Constants ──────────────────────────────────────────────────────`,
    `$APP_NAME   = '${appName}'`,
    `$COMPANY    = '${company}'`,
    `$SERVER     = '${server}'`,
    `$PUBLIC_KEY = '${publicKey}'`,
    `$API_BASE   = '${apiBase}'`,
    `$INST_DIR   = Join-Path $env:ProgramFiles 'RustDesk'`,
    `$RD_EXE     = Join-Path $INST_DIR 'rustdesk.exe'`,
    ``,
    `# ── Helper: color reference ─────────────────────────────────────────`,
    `$clrNavy   = [Drawing.ColorTranslator]::FromHtml('#0A1931')`,
    `$clrNavyL  = [Drawing.ColorTranslator]::FromHtml('#102547')`,
    `$clrRed    = [Drawing.ColorTranslator]::FromHtml('#D01000')`,
    `$clrBlack  = [Drawing.ColorTranslator]::FromHtml('#1A1A1A')`,
    `$clrGray   = [Drawing.ColorTranslator]::FromHtml('#9E9E9E')`,
    `$clrWhite  = [Drawing.Color]::White`,
    `$fntBase   = [Drawing.Font]::new('Segoe UI', 10)`,
    `$fntBold   = [Drawing.Font]::new('Segoe UI', 10, [Drawing.FontStyle]::Bold)`,
    `$fntTitle  = [Drawing.Font]::new('Segoe UI', 12, [Drawing.FontStyle]::Bold)`,
    ``,
    `# ── Show setup form — collect device name ──────────────────────────`,
    `function Show-SetupForm {`,
    `    $f = New-Object Windows.Forms.Form`,
    `    $f.Text            = "$APP_NAME — Device Setup"`,
    `    $f.ClientSize      = [Drawing.Size]::new(440, 282)`,
    `    $f.StartPosition   = 'CenterScreen'`,
    `    $f.BackColor       = $clrNavy`,
    `    $f.ForeColor       = $clrWhite`,
    `    $f.Font            = $fntBase`,
    `    $f.FormBorderStyle = 'FixedDialog'`,
    `    $f.MaximizeBox     = $false`,
    `    $f.MinimizeBox     = $false`,
    ``,
    `    $bar = New-Object Windows.Forms.Panel`,
    `    $bar.Size = [Drawing.Size]::new(440,4); $bar.Location = [Drawing.Point]::new(0,0)`,
    `    $bar.BackColor = $clrRed; $f.Controls.Add($bar)`,
    ``,
    `    $lbTitle = New-Object Windows.Forms.Label`,
    `    $lbTitle.Text = "$APP_NAME"; $lbTitle.Font = $fntTitle`,
    `    $lbTitle.ForeColor = $clrWhite; $lbTitle.Location = [Drawing.Point]::new(20,18)`,
    `    $lbTitle.AutoSize = $true; $f.Controls.Add($lbTitle)`,
    ``,
    `    $lbSub = New-Object Windows.Forms.Label`,
    `    $lbSub.Text = "Secure Remote Support by $COMPANY"`,
    `    $lbSub.ForeColor = $clrGray; $lbSub.Location = [Drawing.Point]::new(20,46)`,
    `    $lbSub.AutoSize = $true; $f.Controls.Add($lbSub)`,
    ``,
    `    $div = New-Object Windows.Forms.Panel`,
    `    $div.Size = [Drawing.Size]::new(400,1); $div.Location = [Drawing.Point]::new(20,72)`,
    `    $div.BackColor = [Drawing.ColorTranslator]::FromHtml('#1B3A6B'); $f.Controls.Add($div)`,
    ``,
    `    $lbN = New-Object Windows.Forms.Label`,
    `    $lbN.Text = "Device Name  (shown in dashboard)"; $lbN.ForeColor = $clrGray`,
    `    $lbN.Location = [Drawing.Point]::new(20,84); $lbN.AutoSize = $true; $f.Controls.Add($lbN)`,
    ``,
    `    $txtName = New-Object Windows.Forms.TextBox`,
    `    $txtName.Text = $env:COMPUTERNAME; $txtName.Font = $fntBold`,
    `    $txtName.Location = [Drawing.Point]::new(20,104); $txtName.Size = [Drawing.Size]::new(400,26)`,
    `    $txtName.BackColor = $clrNavyL; $txtName.ForeColor = $clrWhite`,
    `    $txtName.BorderStyle = 'FixedSingle'; $f.Controls.Add($txtName)`,
    ``,
    `    $lbC = New-Object Windows.Forms.Label`,
    `    $lbC.Text = "Your Name  (optional — for admin reference)"; $lbC.ForeColor = $clrGray`,
    `    $lbC.Location = [Drawing.Point]::new(20,146); $lbC.AutoSize = $true; $f.Controls.Add($lbC)`,
    ``,
    `    $txtContact = New-Object Windows.Forms.TextBox`,
    `    $txtContact.Font = $fntBase`,
    `    $txtContact.Location = [Drawing.Point]::new(20,166); $txtContact.Size = [Drawing.Size]::new(400,26)`,
    `    $txtContact.BackColor = $clrNavyL; $txtContact.ForeColor = $clrWhite`,
    `    $txtContact.BorderStyle = 'FixedSingle'; $f.Controls.Add($txtContact)`,
    ``,
    `    $btnOk = New-Object Windows.Forms.Button`,
    `    $btnOk.Text = "  Install && Register"; $btnOk.Font = $fntBold`,
    `    $btnOk.Location = [Drawing.Point]::new(20,222); $btnOk.Size = [Drawing.Size]::new(210,44)`,
    `    $btnOk.BackColor = $clrRed; $btnOk.ForeColor = $clrWhite`,
    `    $btnOk.FlatStyle = 'Flat'; $btnOk.FlatAppearance.BorderSize = 0`,
    `    $btnOk.DialogResult = 'OK'; $f.AcceptButton = $btnOk; $f.Controls.Add($btnOk)`,
    ``,
    `    $btnX = New-Object Windows.Forms.Button`,
    `    $btnX.Text = "Cancel"; $btnX.Font = $fntBase`,
    `    $btnX.Location = [Drawing.Point]::new(238,222); $btnX.Size = [Drawing.Size]::new(110,44)`,
    `    $btnX.BackColor = $clrBlack; $btnX.ForeColor = $clrGray`,
    `    $btnX.FlatStyle = 'Flat'; $btnX.FlatAppearance.BorderSize = 0`,
    `    $btnX.DialogResult = 'Cancel'; $f.CancelButton = $btnX; $f.Controls.Add($btnX)`,
    ``,
    `    $r = $f.ShowDialog()`,
    `    if ($r -ne [Windows.Forms.DialogResult]::OK) { return $null }`,
    `    return @{`,
    `        Name    = if ($txtName.Text.Trim()) { $txtName.Text.Trim() } else { $env:COMPUTERNAME }`,
    `        Contact = $txtContact.Text.Trim()`,
    `    }`,
    `}`,
    ``,
    `# ── Show progress form ─────────────────────────────────────────────`,
    `$progForm  = $null`,
    `$progLabel = $null`,
    `$progBar   = $null`,
    `function Init-ProgressForm {`,
    `    $pf = New-Object Windows.Forms.Form`,
    `    $pf.Text            = "$APP_NAME — Installing"`,
    `    $pf.ClientSize      = [Drawing.Size]::new(440, 140)`,
    `    $pf.StartPosition   = 'CenterScreen'`,
    `    $pf.BackColor       = $clrNavy`,
    `    $pf.ForeColor       = $clrWhite`,
    `    $pf.Font            = $fntBase`,
    `    $pf.FormBorderStyle = 'FixedDialog'`,
    `    $pf.ControlBox      = $false`,
    ``,
    `    $pb = New-Object Windows.Forms.Panel`,
    `    $pb.Size = [Drawing.Size]::new(440,4); $pb.Location = [Drawing.Point]::new(0,0)`,
    `    $pb.BackColor = $clrRed; $pf.Controls.Add($pb)`,
    ``,
    `    $lbl = New-Object Windows.Forms.Label`,
    `    $lbl.Text = "Preparing..."; $lbl.ForeColor = $clrWhite; $lbl.Font = $fntBase`,
    `    $lbl.Location = [Drawing.Point]::new(20,22); $lbl.Size = [Drawing.Size]::new(400,20)`,
    `    $pf.Controls.Add($lbl)`,
    ``,
    `    $bar = New-Object Windows.Forms.ProgressBar`,
    `    $bar.Style    = 'Marquee'`,
    `    $bar.Location = [Drawing.Point]::new(20,56)`,
    `    $bar.Size     = [Drawing.Size]::new(400,16)`,
    `    $pf.Controls.Add($bar)`,
    ``,
    `    $sub = New-Object Windows.Forms.Label`,
    `    $sub.Text = "Please wait — do not close this window."`,
    `    $sub.ForeColor = $clrGray; $sub.Font = [Drawing.Font]::new('Segoe UI', 9)`,
    `    $sub.Location = [Drawing.Point]::new(20,90); $sub.AutoSize = $true`,
    `    $pf.Controls.Add($sub)`,
    ``,
    `    $script:progForm  = $pf`,
    `    $script:progLabel = $lbl`,
    `    $script:progBar   = $bar`,
    `    $pf.Show()`,
    `    [Windows.Forms.Application]::DoEvents()`,
    `}`,
    ``,
    `function Set-ProgText($msg) {`,
    `    if ($script:progLabel) { $script:progLabel.Text = $msg }`,
    `    [Windows.Forms.Application]::DoEvents()`,
    `}`,
    ``,
    `# ── Show completion dialog ─────────────────────────────────────────`,
    `function Show-Done($deviceId) {`,
    `    if ($script:progForm) { $script:progForm.Hide() }`,
    ``,
    `    $df = New-Object Windows.Forms.Form`,
    `    $df.Text = "$APP_NAME — Setup Complete"`,
    `    $df.ClientSize = [Drawing.Size]::new(420,280)`,
    `    $df.StartPosition = 'CenterScreen'`,
    `    $df.BackColor = $clrNavy; $df.ForeColor = $clrWhite; $df.Font = $fntBase`,
    `    $df.FormBorderStyle = 'FixedDialog'; $df.MaximizeBox = $false; $df.MinimizeBox = $false`,
    ``,
    `    $tp = New-Object Windows.Forms.Panel`,
    `    $tp.Size = [Drawing.Size]::new(420,4); $tp.Location = [Drawing.Point]::new(0,0)`,
    `    $tp.BackColor = [Drawing.ColorTranslator]::FromHtml('#1DB954'); $df.Controls.Add($tp)`,
    ``,
    `    $lt = New-Object Windows.Forms.Label`,
    `    $lt.Text = "Setup Complete!"; $lt.Font = $fntTitle; $lt.ForeColor = $clrWhite`,
    `    $lt.Location = [Drawing.Point]::new(20,20); $lt.AutoSize = $true; $df.Controls.Add($lt)`,
    ``,
    `    $items = @('  RustDesk installed and configured', "  Server: $SERVER", "  Status: Awaiting admin approval")`,
    `    if ($deviceId) { $items = @("  Device ID: $deviceId") + $items }`,
    `    $y = 58`,
    `    foreach ($item in $items) {`,
    `        $li = New-Object Windows.Forms.Label`,
    `        $li.Text = $item; $li.ForeColor = [Drawing.ColorTranslator]::FromHtml('#CCCCCC')`,
    `        $li.Location = [Drawing.Point]::new(20,$y); $li.AutoSize = $true; $df.Controls.Add($li)`,
    `        $y += 26`,
    `    }`,
    ``,
    `    $note = New-Object Windows.Forms.Label`,
    `    $note.Text = "An admin at $COMPANY must approve this device\`nbefore a technician can connect."`,
    `    $note.ForeColor = $clrGray; $note.Font = [Drawing.Font]::new('Segoe UI',9)`,
    `    $note.Location = [Drawing.Point]::new(20,180); $note.AutoSize = $true; $df.Controls.Add($note)`,
    ``,
    `    $btnLaunch = New-Object Windows.Forms.Button`,
    `    $btnLaunch.Text = "  Launch $APP_NAME"; $btnLaunch.Font = $fntBold`,
    `    $btnLaunch.Location = [Drawing.Point]::new(20,226); $btnLaunch.Size = [Drawing.Size]::new(200,42)`,
    `    $btnLaunch.BackColor = $clrRed; $btnLaunch.ForeColor = $clrWhite`,
    `    $btnLaunch.FlatStyle = 'Flat'; $btnLaunch.FlatAppearance.BorderSize = 0`,
    `    $btnLaunch.Add_Click({ if (Test-Path $script:RD_EXE) { Start-Process $script:RD_EXE } ; $df.Close() })`,
    `    $df.Controls.Add($btnLaunch)`,
    ``,
    `    $btnClose = New-Object Windows.Forms.Button`,
    `    $btnClose.Text = "Close"; $btnClose.Font = $fntBase`,
    `    $btnClose.Location = [Drawing.Point]::new(228,226); $btnClose.Size = [Drawing.Size]::new(100,42)`,
    `    $btnClose.BackColor = $clrBlack; $btnClose.ForeColor = $clrGray`,
    `    $btnClose.FlatStyle = 'Flat'; $btnClose.FlatAppearance.BorderSize = 0`,
    `    $btnClose.DialogResult = 'OK'; $df.CancelButton = $btnClose; $df.Controls.Add($btnClose)`,
    ``,
    `    $df.ShowDialog() | Out-Null`,
    `}`,
    ``,
    `# ═══════════════════════════════════════════════════════════════════`,
    `# MAIN`,
    `# ═══════════════════════════════════════════════════════════════════`,
    ``,
    `$LOG_FILE = Join-Path $env:TEMP 'InsiderRemote-setup.log'`,
    `function Write-Log($msg) {`,
    `    $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')`,
    `    Add-Content -Path $LOG_FILE -Value "[$ts] $msg" -ErrorAction SilentlyContinue`,
    `}`,
    ``,
    `try {`,
    `    # Collect device info via GUI`,
    `    Write-Log "Setup started"`,
    `    $info = Show-SetupForm`,
    `    if ($null -eq $info) { Write-Log "Cancelled by user"; Exit 0 }`,
    `    $DEVICE_NAME    = $info.Name`,
    `    $DEVICE_CONTACT = $info.Contact`,
    `    Write-Log "Device: $DEVICE_NAME"`,
    ``,
    `    # Show progress UI`,
    `    Init-ProgressForm`,
    ``,
    `    # ── 1. Download & install RustDesk ────────────────────────`,
    `    Set-ProgText "Step 1/4 — Downloading RustDesk..."`,
    `    Write-Log "Step 1: download/install"`,
    `    if (-not (Test-Path $RD_EXE)) {`,
    `        $installer = Join-Path $env:TEMP 'rustdesk-setup.exe'`,
    `        try {`,
    `            $rel = Invoke-WebRequest -Uri 'https://github.com/rustdesk/rustdesk/releases/latest' \``,
    `                       -UseBasicParsing -MaximumRedirection 10`,
    `            $ver = ([uri]$rel.BaseResponse.ResponseUri).Segments[-1].TrimStart('v')`,
    `            $url = "https://github.com/rustdesk/rustdesk/releases/download/v$ver/rustdesk-$ver-x86_64.exe"`,
    `            Write-Log "Detected version $ver"`,
    `        } catch {`,
    `            $url = 'https://github.com/rustdesk/rustdesk/releases/download/1.4.8/rustdesk-1.4.8-x86_64.exe'`,
    `            Write-Log "Version detect failed, using fallback"`,
    `        }`,
    `        Write-Log "Downloading: $url"`,
    `        Set-ProgText "Step 1/4 — Installing RustDesk..."`,
    `        Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing`,
    `        Write-Log "Download OK, running installer"`,
    `        Start-Process -FilePath $installer -ArgumentList '--silent-install' -Wait`,
    `        Remove-Item $installer -Force -ErrorAction SilentlyContinue`,
    `        Write-Log "Installer finished"`,
    `    } else { Write-Log "RustDesk already present: $RD_EXE" }`,
    ``,
    `    # Verify install — check alternate install paths if standard one missing`,
    `    if (-not (Test-Path $RD_EXE)) {`,
    `        foreach ($p in @(`,
    `            (Join-Path $env:LOCALAPPDATA 'Programs\RustDesk\rustdesk.exe'),`,
    `            'C:\Program Files (x86)\RustDesk\rustdesk.exe'`,
    `        )) {`,
    `            if (Test-Path $p) { $RD_EXE = $p; $script:RD_EXE = $p; $INST_DIR = Split-Path $p; Write-Log "Found at $p"; break }`,
    `        }`,
    `    }`,
    `    if (-not (Test-Path $RD_EXE)) { throw "RustDesk not found after install. Check $LOG_FILE for details." }`,
    ``,
    `    # ── 2. Configure server connection ────────────────────────`,
    `    Write-Log "Step 2: configure"`,
    `    Set-ProgText "Step 2/4 — Configuring server connection..."`,
    `    $regPath = 'HKLM:\\SOFTWARE\\RustDesk\\config'`,
    `    if (-not (Test-Path $regPath)) { New-Item -Path $regPath -Force | Out-Null }`,
    `    Set-ItemProperty -Path $regPath -Name 'custom-rendezvous-server' -Value '${ server }' -Type String`,
    `    Set-ItemProperty -Path $regPath -Name 'relay-server'             -Value '${ server }:21117' -Type String`,
    `    Set-ItemProperty -Path $regPath -Name 'key'                       -Value '${ publicKey }' -Type String`,
    `    Set-ItemProperty -Path $regPath -Name 'api-server'                -Value '${ apiBase }' -Type String`,
    `    $cfgDir = Join-Path $env:APPDATA 'RustDesk\\config'`,
    `    if (-not (Test-Path $cfgDir)) { New-Item -ItemType Directory -Path $cfgDir -Force | Out-Null }`,
    `    @(`,
    `        "rendezvous_server = '${ server }'"`,
    `        'nat_type = 1'`,
    `        'serial = 0'`,
    `        ''`,
    `        '[options]'`,
    `        "custom-rendezvous-server = '${ server }'"`,
    `        "relay-server = '${ server }:21117'"`,
    `        "key = '${ publicKey }'"`,
    `        "api-server = '${ apiBase }'"`,
    `    ) | Out-File (Join-Path $cfgDir 'RustDesk.toml') -Encoding utf8 -Force`,
    `    Write-Log "TOML config written"`,
    ``,
    `    # ── 3. Create desktop shortcut ────────────────────────────`,
    `    Write-Log "Step 3: shortcut"`,
    `    Set-ProgText "Step 3/4 — Creating shortcut..."`,
    `    $desktop = [Environment]::GetFolderPath('CommonDesktopDirectory')`,
    `    $lnkPath = Join-Path $desktop "$APP_NAME.lnk"`,
    `    $wsh = New-Object -ComObject WScript.Shell`,
    `    $lnk = $wsh.CreateShortcut($lnkPath)`,
    `    $lnk.TargetPath = $RD_EXE; $lnk.WorkingDirectory = $INST_DIR`,
    `    $lnk.Description = "$APP_NAME — $COMPANY Remote Support"`,
    `    $lnk.IconLocation = "$RD_EXE,0"; $lnk.Save()`,
    ``,
    `    # ── 4. Launch RustDesk briefly to generate device ID ──────`,
    `    Write-Log "Step 4: get device ID"`,
    `    Set-ProgText "Step 4/4 — Registering device..."`,
    `    $id2 = Join-Path $env:APPDATA 'RustDesk\\config\\RustDesk2.toml'`,
    `    if (-not (Test-Path $id2)) {`,
    `        if (Test-Path $RD_EXE) {`,
    `            Start-Process $RD_EXE -WindowStyle Hidden`,
    `            $waited = 0`,
    `            while (-not (Test-Path $id2) -and $waited -lt 20) {`,
    `                Start-Sleep -Seconds 1; $waited++`,
    `                [Windows.Forms.Application]::DoEvents()`,
    `            }`,
    `            Get-Process -Name 'rustdesk' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue`,
    `        }`,
    `    }`,
    ``,
    `    # Read device ID`,
    `    $deviceId = $null`,
    `    if (Test-Path $id2) {`,
    `        $raw = Get-Content $id2 -Raw -ErrorAction SilentlyContinue`,
    `        if ($raw -match 'id\s*=\s*["\x27]?(\d+)["\x27]?') { $deviceId = $Matches[1] }`,
    `    }`,
    ``,
    `    # Register with dashboard`,
    `    if ($deviceId) {`,
    `        try {`,
    `            $alias = if ($DEVICE_CONTACT) { "$DEVICE_NAME ($DEVICE_CONTACT)" } else { $DEVICE_NAME }`,
    `            $body  = ConvertTo-Json @{`,
    `                rustdesk_id    = $deviceId`,
    `                hostname       = $env:COMPUTERNAME`,
    `                alias          = $alias`,
    `                os_type        = 'windows'`,
    `                client_version = 'auto'`,
    `            }`,
    `            Invoke-RestMethod -Uri "$API_BASE/api/device/register" \``,
    `                              -Method POST -Body $body \``,
    `                              -ContentType 'application/json' \``,
    `                              -ErrorAction Stop | Out-Null`,
    `        } catch { Write-Log "Registration error: $($_.Exception.Message)" }`,
    `    }`,
    ``,
    `    Write-Log "Setup complete — deviceId: $deviceId"`,
    `    Show-Done $deviceId`,
    ``,
    `} catch {`,
    `    Write-Log "FATAL: $($_.Exception.Message)"`,
    `    if ($script:progForm) { try { $script:progForm.Hide() } catch {} }`,
    `    [Windows.Forms.MessageBox]::Show(`,
    `        "Setup failed:\`n\`n$($_.Exception.Message)\`n\`nLog: $LOG_FILE\`n\`nContact $COMPANY for support.",`,
    `        "$APP_NAME — Error", 'OK', 'Error') | Out-Null`,
    `} finally {`,
    `    if ($script:progForm) { try { $script:progForm.Dispose() } catch {} }`,
    `}`,
  ];

  // Replace ${ server } style placeholders (they look like template literals but are in strings)
  return lines.join('\r\n')
    .replace(/\$\{ server \}/g, server)
    .replace(/\$\{ publicKey \}/g, publicKey)
    .replace(/\$\{ apiBase \}/g, apiBase);
}

// ─────────────────────────────────────────────────────────────────────────────
// Linux bash installer
// ─────────────────────────────────────────────────────────────────────────────
function buildLinuxScript(server, publicKey, apiBase, appName, company) {
  const ts = new Date().toISOString();
  return `#!/usr/bin/env bash
# ================================================================
# ${appName} Linux Client Setup
# Company : ${company}
# Server  : ${server}
# Built   : ${ts}
# Run with: curl -fsSL '${apiBase}/install/download/linux.sh' | sudo bash
# ================================================================
set -euo pipefail

RED='\\033[0;31m'; GREEN='\\033[0;32m'; CYAN='\\033[0;36m'; GRAY='\\033[0;37m'; NC='\\033[0m'
APP="${appName}"
SERVER="${server}"
PUBLIC_KEY="${publicKey}"
API_BASE="${apiBase}"

echo ""
echo -e "\${CYAN}========================================\${NC}"
echo -e "\${CYAN}  \$APP Client Setup — Linux\${NC}"
echo -e "\${GRAY}  ${company}\${NC}"
echo -e "\${CYAN}========================================\${NC}"
echo ""

# ── 1. Install RustDesk ───────────────────────────────────────────────────────
if ! command -v rustdesk &>/dev/null; then
    echo -e "\${CYAN}[1/4] Downloading RustDesk...\${NC}"
    ARCH="$(uname -m)"
    TMP_PKG="/tmp/rustdesk-setup"

    LATEST_VER="1.4.8"
    LATEST_URL="https://github.com/rustdesk/rustdesk/releases/download/\${LATEST_VER}"

    if [ -f /etc/debian_version ] || command -v dpkg &>/dev/null; then
        PKG_URL="\${LATEST_URL}/rustdesk-\${LATEST_VER}-\${ARCH}.deb"
        curl -fsSL -o "\${TMP_PKG}.deb" "\${PKG_URL}"
        dpkg -i "\${TMP_PKG}.deb" 2>/dev/null || apt-get -f install -y
        rm -f "\${TMP_PKG}.deb"
    elif [ -f /etc/redhat-release ] || command -v rpm &>/dev/null; then
        PKG_URL="\${LATEST_URL}/rustdesk-\${LATEST_VER}-\${ARCH}.rpm"
        curl -fsSL -o "\${TMP_PKG}.rpm" "\${PKG_URL}"
        rpm -i "\${TMP_PKG}.rpm" 2>/dev/null || true
        rm -f "\${TMP_PKG}.rpm"
    else
        echo -e "\${RED}[WARN] Unsupported distribution. Please install RustDesk manually from https://rustdesk.com\${NC}"
        exit 1
    fi
    echo -e "\${GREEN}[OK] RustDesk installed\${NC}"
else
    echo -e "\${GREEN}[1/4] RustDesk already installed\${NC}"
fi

# ── 2. Configure server ───────────────────────────────────────────────────────
echo -e "\${CYAN}[2/4] Configuring server connection...\${NC}"
CFG_DIR="\$HOME/.config/rustdesk"
mkdir -p "\$CFG_DIR"
cat > "\$CFG_DIR/RustDesk.toml" <<TOML
rendezvous_server = '${server}'
nat_type = 1
serial = 0

[options]
custom-rendezvous-server = '${server}'
relay-server = '${server}:21117'
key = '${publicKey}'
TOML
echo -e "\${GREEN}[OK] Server configured\${NC}"

# ── 3. Prompt for device name ─────────────────────────────────────────────────
echo -e "\${CYAN}[3/4] Device registration\${NC}"
DEFAULT_NAME="\$(hostname)"
read -rp "  Device name [\$DEFAULT_NAME]: " DEVICE_NAME
DEVICE_NAME="\${DEVICE_NAME:-\$DEFAULT_NAME}"
read -rp "  Your name (optional): " CONTACT_NAME

ALIAS="\$DEVICE_NAME"
[ -n "\$CONTACT_NAME" ] && ALIAS="\$DEVICE_NAME (\$CONTACT_NAME)"

# ── 4. Launch RustDesk to generate ID, then register ─────────────────────────
echo -e "\${CYAN}[4/4] Registering with dashboard...\${NC}"
rustdesk &
RD_PID=\$!
sleep 8
kill \$RD_PID 2>/dev/null || true

ID_FILE="\$HOME/.config/rustdesk/RustDesk2.toml"
DEVICE_ID=""
if [ -f "\$ID_FILE" ]; then
    DEVICE_ID="\$(grep -oP '(?<=id\\s=\\s.)[0-9]+' "\$ID_FILE" 2>/dev/null || true)"
fi

if [ -n "\$DEVICE_ID" ]; then
    STATUS="\$(curl -sf -X POST "\$API_BASE/api/device/register" \\
        -H 'Content-Type: application/json' \\
        -d "{\"rustdesk_id\":\"\$DEVICE_ID\",\"hostname\":\"\$(hostname)\",\"alias\":\"\$ALIAS\",\"os_type\":\"linux\",\"client_version\":\"auto\"}" \\
        | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo 'unknown')"
    echo -e "\${GREEN}[OK] Device registered — status: \$STATUS\${NC}"
else
    echo -e "\${RED}[WARN] Could not read Device ID. Launch RustDesk once to generate it.\${NC}"
fi

echo ""
echo -e "\${GREEN}========================================\${NC}"
echo -e "\${GREEN}  Setup Complete!\${NC}"
echo -e "\${GREEN}========================================\${NC}"
[ -n "\$DEVICE_ID" ] && echo -e "  Device ID : \${DEVICE_ID}"
echo -e "  Server    : \${SERVER}"
echo -e "  Dashboard : \${API_BASE}"
echo ""
echo -e "\${GRAY}  An admin must approve your device before it can be managed.\${NC}"
echo -e "\${GRAY}  Contact ${company} to confirm approval.\${NC}"
echo ""
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// macOS bash installer
// ─────────────────────────────────────────────────────────────────────────────
function buildMacScript(server, publicKey, apiBase, appName, company) {
  const ts = new Date().toISOString();
  return `#!/usr/bin/env bash
# ================================================================
# ${appName} macOS Client Setup
# Company : ${company}
# Server  : ${server}
# Built   : ${ts}
# Run with: curl -fsSL '${apiBase}/install/download/mac.sh' | sudo bash
# ================================================================
set -euo pipefail

RED='\\033[0;31m'; GREEN='\\033[0;32m'; CYAN='\\033[0;36m'; GRAY='\\033[0;37m'; NC='\\033[0m'
APP="${appName}"
SERVER="${server}"
PUBLIC_KEY="${publicKey}"
API_BASE="${apiBase}"

echo ""
echo -e "\${CYAN}========================================\${NC}"
echo -e "\${CYAN}  \$APP Client Setup — macOS\${NC}"
echo -e "\${GRAY}  ${company}\${NC}"
echo -e "\${CYAN}========================================\${NC}"
echo ""

# ── 1. Install RustDesk ───────────────────────────────────────────────────────
if [ ! -d "/Applications/RustDesk.app" ]; then
    echo -e "\${CYAN}[1/4] Downloading RustDesk for macOS...\${NC}"
    ARCH="\$(uname -m)"
    VER="1.4.8"
    if [ "\$ARCH" = "arm64" ]; then
        DMG_URL="https://github.com/rustdesk/rustdesk/releases/download/\${VER}/rustdesk-\${VER}-aarch64.dmg"
    else
        DMG_URL="https://github.com/rustdesk/rustdesk/releases/download/\${VER}/rustdesk-\${VER}-x86_64.dmg"
    fi
    TMP_DMG="/tmp/rustdesk-setup.dmg"
    curl -fsSL -o "\$TMP_DMG" "\$DMG_URL"
    echo -e "\${CYAN}[1/4] Installing...\${NC}"
    hdiutil attach "\$TMP_DMG" -mountpoint /tmp/rustdesk_dmg -quiet
    cp -R /tmp/rustdesk_dmg/RustDesk.app /Applications/
    hdiutil detach /tmp/rustdesk_dmg -quiet
    rm -f "\$TMP_DMG"
    echo -e "\${GREEN}[OK] RustDesk installed to /Applications\${NC}"
else
    echo -e "\${GREEN}[1/4] RustDesk already installed\${NC}"
fi

# ── 2. Configure server ───────────────────────────────────────────────────────
echo -e "\${CYAN}[2/4] Configuring server connection...\${NC}"
CFG_DIR="\$HOME/Library/Application Support/com.carriez.RustDesk"
mkdir -p "\$CFG_DIR"
cat > "\$CFG_DIR/RustDesk.toml" <<TOML
rendezvous_server = '${server}'
nat_type = 1
serial = 0

[options]
custom-rendezvous-server = '${server}'
relay-server = '${server}:21117'
key = '${publicKey}'
TOML
echo -e "\${GREEN}[OK] Server configured\${NC}"

# ── 3. Prompt for device name ─────────────────────────────────────────────────
echo -e "\${CYAN}[3/4] Device registration\${NC}"
DEFAULT_NAME="\$(hostname -s)"
read -rp "  Device name [\$DEFAULT_NAME]: " DEVICE_NAME
DEVICE_NAME="\${DEVICE_NAME:-\$DEFAULT_NAME}"
read -rp "  Your name (optional): " CONTACT_NAME

ALIAS="\$DEVICE_NAME"
[ -n "\$CONTACT_NAME" ] && ALIAS="\$DEVICE_NAME (\$CONTACT_NAME)"

# ── 4. Launch briefly to generate ID, then register ──────────────────────────
echo -e "\${CYAN}[4/4] Registering with dashboard...\${NC}"
open -a RustDesk 2>/dev/null || true
sleep 10
pkill -f RustDesk 2>/dev/null || true

ID_FILE="\$HOME/Library/Application Support/com.carriez.RustDesk/RustDesk2.toml"
DEVICE_ID=""
if [ -f "\$ID_FILE" ]; then
    DEVICE_ID="\$(grep -oE '[0-9]{9,20}' "\$ID_FILE" 2>/dev/null | head -1 || true)"
fi

if [ -n "\$DEVICE_ID" ]; then
    curl -sf -X POST "\$API_BASE/api/device/register" \\
        -H 'Content-Type: application/json' \\
        -d "{\"rustdesk_id\":\"\$DEVICE_ID\",\"hostname\":\"\$(hostname -s)\",\"alias\":\"\$ALIAS\",\"os_type\":\"mac\",\"client_version\":\"auto\"}" >/dev/null || true
    echo -e "\${GREEN}[OK] Device registered\${NC}"
else
    echo -e "\${RED}[WARN] Could not read Device ID. Open RustDesk from Applications and try again.\${NC}"
fi

echo ""
echo -e "\${GREEN}========================================\${NC}"
echo -e "\${GREEN}  Setup Complete!\${NC}"
echo -e "\${GREEN}========================================\${NC}"
[ -n "\$DEVICE_ID" ] && echo "  Device ID : \$DEVICE_ID"
echo "  Server    : \$SERVER"
echo "  Dashboard : \$API_BASE"
echo ""
echo -e "\${GRAY}  An admin must approve your device before it can be managed.\${NC}"
echo -e "\${GRAY}  Contact ${company} to confirm approval.\${NC}"
echo ""
`;
}

module.exports = { installRouter, deviceApiRouter };
