<?php
$typeLabel = $typeLabels[$sac['type']] ?? 'Cheti cha Sakramenti';
$fullName  = e($sac['first_name'] . ' ' . $sac['last_name']);
?>
<div style="text-align:center; border: 3px double #701a75; padding: 40px; min-height: 550px; position:relative;">
    <!-- Header -->
    <div style="margin-bottom: 20px;">
        <p style="font-size:11pt; color:#555; margin:0;">KANISA KATOLIKI — <?= e(strtoupper($sac['diocese'] ?? 'TANZANIA')) ?></p>
        <h2 style="font-size:18pt; color:#701a75; margin:5px 0;"><?= e(strtoupper($sac['parish_name'])) ?></h2>
        <div style="border-bottom: 2px solid #701a75; margin: 10px auto; width: 60%;"></div>
    </div>

    <!-- Certificate Title -->
    <h1 style="font-size:28pt; color:#c7a400; margin: 20px 0 5px; text-transform:uppercase; letter-spacing:2px;"><?= e($typeLabel) ?></h1>
    <p style="font-size:10pt; color:#888; margin-bottom:30px;">CERTIFICATE OF <?= e(strtoupper($sac['type'])) ?></p>

    <!-- Body -->
    <p style="font-size:13pt; color:#333; margin-bottom:8px;">Hii inathibitisha kwamba</p>
    <p style="font-size:24pt; color:#701a75; font-weight:bold; margin:10px 0; font-style:italic;"><?= $fullName ?></p>
    <?php if ($sac['date_of_birth']): ?>
    <p style="font-size:11pt; color:#555; margin-bottom:8px;">aliyezaliwa <?= formatDate($sac['date_of_birth']) ?></p>
    <?php endif; ?>
    <p style="font-size:13pt; color:#333; margin:20px 0;">
        alipokea <?php
            $labels = [
                'baptism' => 'Sakramenti ya Ubatizo Mtakatifu',
                'confirmation' => 'Sakramenti ya Kipaimara',
                'first_communion' => 'Komunyo ya Kwanza',
                'marriage' => 'Sakramenti ya Ndoa',
                'holy_orders' => 'Sakramenti ya Upadre',
                'anointing' => 'Sakramenti ya Upako wa Wagonjwa',
            ];
            echo e($labels[$sac['type']] ?? $sac['type']);
        ?>
    </p>
    <?php if ($sac['date_received']): ?>
    <p style="font-size:14pt; color:#333; font-weight:bold;">tarehe <?= formatDate($sac['date_received']) ?></p>
    <?php endif; ?>
    <?php if ($sac['officiant']): ?>
    <p style="font-size:11pt; color:#555; margin-top:10px;">Aliyehudumia: <?= e($sac['officiant']) ?></p>
    <?php endif; ?>
    <?php if ($sac['witnesses']): ?>
    <p style="font-size:11pt; color:#555;">Mashahidi: <?= e($sac['witnesses']) ?></p>
    <?php endif; ?>
    <?php if ($sac['certificate_no']): ?>
    <p style="font-size:11pt; color:#555; margin-top:10px;">Nambari ya Cheti: <strong><?= e($sac['certificate_no']) ?></strong></p>
    <?php endif; ?>

    <!-- Footer -->
    <div style="margin-top:50px; display:flex; justify-content:space-between; border-top:1px solid #ccc; padding-top:20px;">
        <div style="text-align:left;">
            <div style="border-top: 1px solid #333; width:150px; margin-bottom:5px;"></div>
            <p style="font-size:9pt; color:#555;">Msimamizi wa Rekodi</p>
        </div>
        <div style="text-align:center;">
            <p style="font-size:9pt; color:#888;">Imetolewa: <?= date('d/m/Y') ?></p>
            <p style="font-size:9pt; color:#888;"><?= e($sac['parish_name']) ?></p>
        </div>
        <div style="text-align:right;">
            <div style="border-top: 1px solid #333; width:150px; margin-bottom:5px; margin-left:auto;"></div>
            <p style="font-size:9pt; color:#555;">Kasisi wa Parokia</p>
        </div>
    </div>

    <?php if ($sac['certificate_no']): ?>
    <p style="font-size:8pt; color:#bbb; margin-top:20px;">Thibitisha kwa: <?= url('verify/' . $sac['certificate_no']) ?></p>
    <?php endif; ?>
</div>
