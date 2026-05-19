<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { color: #1a1a1a; margin: 0; }
  .header { text-align: center; border-bottom: 2px solid #1e3a5f; padding-bottom: 14px; margin-bottom: 20px; }
  .header h1 { font-size: 18px; margin: 0 0 4px; color: #1e3a5f; }
  .header p  { font-size: 11px; color: #555; margin: 2px 0; }
  .badge { display: inline-block; background: #22c55e; color: #fff; font-size: 11px; font-weight: bold; padding: 3px 12px; border-radius: 20px; letter-spacing: .5px; }
  table.info { width: 100%; border-collapse: collapse; margin: 18px 0; }
  table.info tr td { padding: 6px 8px; font-size: 12px; }
  table.info tr td:first-child { color: #666; width: 40%; }
  table.info tr td:last-child { font-weight: 600; color: #1a1a1a; }
  table.info tr:nth-child(even) td { background: #f7f7f7; }
  .amount-box { text-align: center; border: 2px solid #1e3a5f; border-radius: 10px; padding: 16px; margin: 20px 0; }
  .amount-box .label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: .5px; }
  .amount-box .value { font-size: 28px; font-weight: 900; color: #1e3a5f; margin-top: 4px; }
  .footer { text-align: center; margin-top: 28px; padding-top: 12px; border-top: 1px solid #e0e0e0; font-size: 10px; color: #888; }
  .ref { font-size: 10px; color: #aaa; word-break: break-all; }
</style>
</head>
<body>

<div class="header">
  <h1><?= htmlspecialchars($payment['parish_name'] ?? 'Parokia ya Kanegeji') ?></h1>
  <?php if (!empty($payment['diocese'])): ?>
  <p><?= htmlspecialchars($payment['diocese']) ?></p>
  <?php endif; ?>
  <p style="font-size:13px; font-weight:700; margin-top:8px;">RISITI YA MALIPO</p>
  <div style="margin-top:8px;"><span class="badge">&#10003; IMETHIBITISHWA</span></div>
</div>

<div class="amount-box">
  <div class="label">Kiasi Kilicholipwa</div>
  <div class="value"><?= formatCurrency((float) $payment['amount']) ?></div>
</div>

<table class="info">
  <tr>
    <td>Tarehe ya Malipo</td>
    <td><?= date('d M Y, H:i', strtotime($payment['updated_at'] ?: $payment['created_at'])) ?></td>
  </tr>
  <tr>
    <td>Mwanachama</td>
    <td><?= htmlspecialchars(trim(($payment['first_name'] ?? '') . ' ' . ($payment['last_name'] ?? '')) ?: '—') ?>
      <?php if (!empty($payment['member_number'])): ?><br><span style="font-weight:400;color:#888;font-size:11px;"><?= htmlspecialchars($payment['member_number']) ?></span><?php endif; ?>
    </td>
  </tr>
  <tr>
    <td>Mtandao wa Simu</td>
    <td><?= htmlspecialchars($providerLabels[$payment['provider']] ?? strtoupper($payment['provider'])) ?></td>
  </tr>
  <tr>
    <td>Namba ya Simu</td>
    <td><?= htmlspecialchars($payment['phone']) ?></td>
  </tr>
  <tr>
    <td>Aina ya Malipo</td>
    <td><?= htmlspecialchars($purposeLabels[$payment['purpose']] ?? ucfirst($payment['purpose'])) ?></td>
  </tr>
  <?php if (!empty($payment['gateway_ref'])): ?>
  <tr>
    <td>Kumb. ya Mtandao</td>
    <td><?= htmlspecialchars($payment['gateway_ref']) ?></td>
  </tr>
  <?php endif; ?>
  <tr>
    <td>Nambari ya Risiti</td>
    <td><?= htmlspecialchars($payment['external_id']) ?></td>
  </tr>
</table>

<div class="footer">
  <p>Asante kwa mchango wako. Risiti hii ni ushahidi rasmi wa malipo.</p>
  <p class="ref"><?= htmlspecialchars($payment['external_id']) ?></p>
  <p>Imechapishwa tarehe <?= date('d M Y') ?> &mdash; <?= htmlspecialchars($payment['parish_name'] ?? 'Parokia ya Kanegeji') ?></p>
</div>

</body>
</html>
