<?php
namespace App\Services;

class OcrService {
    public function process(string $filePath): array {
        // OCRSpace API - free, no API key required for basic usage
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => 'https://api.ocr.space/parse/image',
            CURLOPT_POST => 1,
            CURLOPT_POSTFIELDS => [
                'filename' => basename($filePath),
                'apikey' => 'K87899142C88',  // Free tier key
                'language' => 'eng'
            ],
            CURLOPT_RETURNTRANSFER => 1,
            CURLOPT_TIMEOUT => 30
        ]);

        $response = curl_exec($ch);
        curl_close($ch);

        return json_decode($response, true) ?? [];
    }

    public function computeFileHash(string $filePath): string {
        return hash_file('sha256', $filePath);
    }

    public function computeFingerprint(string $filePath): string {
        $fileContent = file_get_contents($filePath);
        $size = filesize($filePath);
        return hash('sha256', $size . substr($fileContent, 0, 1000) . substr($fileContent, -1000));
    }
}
