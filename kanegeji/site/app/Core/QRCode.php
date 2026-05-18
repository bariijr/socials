<?php

namespace App\Core;

use chillerlan\QRCode\QRCode as Generator;
use chillerlan\QRCode\QROptions;

class QRCode
{
    public static function generate(string $data, string $filename, string $subdir = 'qr'): string
    {
        $dir = BASE_PATH . '/storage/' . $subdir;
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $options = new QROptions([
            'outputType'   => 'png',
            'eccLevel'     => 'H',
            'scale'        => 8,
            'imageBase64'  => false,
            'quietzoneSize' => 2,
        ]);

        $path = $dir . '/' . $filename . '.png';
        (new Generator($options))->render($data, $path);

        return $path;
    }

    public static function generateBase64(string $data): string
    {
        $options = new QROptions([
            'outputType'  => 'png',
            'eccLevel'    => 'H',
            'scale'       => 6,
            'imageBase64' => true,
            'quietzoneSize' => 2,
        ]);

        return (new Generator($options))->render($data);
    }

    public static function publicUrl(string $filename, string $subdir = 'qr'): string
    {
        return url('/storage/' . $subdir . '/' . $filename . '.png');
    }
}
