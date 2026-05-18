<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body { font-family: DejaVu Sans, sans-serif; font-size: 10px; color: #1a1a2e; margin: 0; }
.header { background: #4F46E5; color: white; padding: 12px 16px; border-radius: 6px 6px 0 0; }
.header h1 { margin: 0; font-size: 14px; }
.header p { margin: 2px 0 0; font-size: 9px; opacity: 0.8; }
.body { padding: 14px 16px; }
.section-title { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin: 12px 0 6px; font-weight: bold; }
table { width: 100%; border-collapse: collapse; }
td { padding: 4px 6px; vertical-align: top; }
.row-alt { background: #f9fafb; }
.label { color: #6b7280; width: 50%; }
.val { font-weight: bold; text-align: right; }
.total-row td { background: #4F46E5; color: white; font-weight: bold; padding: 6px; border-radius: 3px; }
.footer { margin-top: 16px; border-top: 1px solid #e5e7eb; padding-top: 8px; font-size: 8px; color: #9ca3af; text-align: center; }
</style>
</head>
<body>
<?php $months = ['','Januari','Februari','Machi','Aprili','Mei','Juni','Julai','Agosti','Septemba','Oktoba','Novemba','Desemba']; ?>
<div class="header">
    <h1><?= htmlspecialchars($parish['name'] ?? 'Parish ERP') ?></h1>
    <p>Hati ya Mshahara — <?= $months[$item['period_month']] ?> <?= $item['period_year'] ?></p>
</div>
<div class="body">
    <div class="section-title">Taarifa za Mfanyakazi</div>
    <table>
        <tr class="row-alt"><td class="label">Jina Kamili</td><td class="val"><?= htmlspecialchars($item['first_name'] . ' ' . $item['last_name']) ?></td></tr>
        <tr><td class="label">Nambari</td><td class="val"><?= htmlspecialchars($item['employee_number']) ?></td></tr>
        <tr class="row-alt"><td class="label">Nafasi</td><td class="val"><?= htmlspecialchars($item['position']) ?></td></tr>
        <tr><td class="label">Benki</td><td class="val"><?= htmlspecialchars($item['bank_name'] ?? '-') ?></td></tr>
        <tr class="row-alt"><td class="label">Akaunti</td><td class="val"><?= htmlspecialchars($item['bank_account'] ?? '-') ?></td></tr>
    </table>

    <div class="section-title">Mapato</div>
    <table>
        <tr class="row-alt"><td class="label">Mshahara Msingi</td><td class="val"><?= number_format($item['basic_salary'], 2) ?> TZS</td></tr>
        <tr><td class="label">Posho ya Nyumba</td><td class="val"><?= number_format($item['housing_allowance'], 2) ?> TZS</td></tr>
        <tr class="row-alt"><td class="label">Posho ya Usafiri</td><td class="val"><?= number_format($item['transport_allowance'], 2) ?> TZS</td></tr>
        <tr><td class="label">Posho Nyingine</td><td class="val"><?= number_format($item['other_allowances'], 2) ?> TZS</td></tr>
        <tr><td style="font-weight:bold">Jumla ya Mapato</td><td class="val" style="font-weight:bold"><?= number_format($item['gross_pay'], 2) ?> TZS</td></tr>
    </table>

    <div class="section-title">Makato</div>
    <table>
        <tr class="row-alt"><td class="label">NSSF (Mfanyakazi)</td><td class="val"><?= number_format($item['nssf_employee'], 2) ?> TZS</td></tr>
        <tr><td class="label">PAYE</td><td class="val"><?= number_format($item['paye'], 2) ?> TZS</td></tr>
        <tr class="row-alt"><td class="label">Makato Mengine</td><td class="val"><?= number_format($item['other_deductions'], 2) ?> TZS</td></tr>
        <tr><td style="font-weight:bold">Jumla ya Makato</td><td class="val" style="font-weight:bold"><?= number_format($item['total_deductions'], 2) ?> TZS</td></tr>
    </table>

    <br>
    <table>
        <tr class="total-row"><td>MSHAHARA HALISI (NET PAY)</td><td style="text-align:right"><?= number_format($item['net_pay'], 2) ?> TZS</td></tr>
    </table>

    <div class="footer">
        Hati hii imetolewa kwa njia ya kiotomatiki na mfumo wa <?= htmlspecialchars($parish['name'] ?? 'Parish ERP') ?>.
        Kipindi: <?= $months[$item['period_month']] ?> <?= $item['period_year'] ?> · Nambari ya Malipo: <?= htmlspecialchars($item['run_number']) ?>
    </div>
</div>
</body>
</html>
