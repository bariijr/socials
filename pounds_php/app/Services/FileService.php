<?php
namespace App\Services;

class FileService {
    private $uploadDir = __DIR__ . '/../../public/uploads';
    private $allowedMimes = [
        'image/jpeg', 'image/png', 'image/gif',
        'application/pdf', 'image/webp'
    ];

    public function upload(array $file, string $folder): ?string {
        if (!in_array($file['type'], $this->allowedMimes)) {
            return null;
        }

        $dir = $this->uploadDir . '/' . $folder;
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $filename = uniqid() . '_' . basename($file['name']);
        $filepath = $dir . '/' . $filename;

        if (!move_uploaded_file($file['tmp_name'], $filepath)) {
            return null;
        }

        // Compress if image
        if (strpos($file['type'], 'image') === 0) {
            $this->compressImage($filepath, $file['type']);
        }

        return $filepath;
    }

    private function compressImage(string $filepath, string $mimeType): void {
        if ($mimeType === 'image/jpeg') {
            $image = imagecreatefromjpeg($filepath);
            imagejpeg($image, $filepath, 75);
            imagedestroy($image);
        } elseif ($mimeType === 'image/png') {
            $image = imagecreatefrompng($filepath);
            imagepng($image, $filepath, 8);
            imagedestroy($image);
        }
    }

    public function delete(string $filepath): bool {
        if (file_exists($filepath)) {
            return unlink($filepath);
        }
        return false;
    }
}
