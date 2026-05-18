<?php

namespace App\Core;

use Mpdf\Mpdf;
use Mpdf\Config\ConfigVariables;
use Mpdf\Config\FontVariables;

class PDF
{
    private Mpdf $mpdf;

    public function __construct(array $options = [])
    {
        $defaults = [
            'mode'          => 'utf-8',
            'format'        => 'A4',
            'margin_left'   => 15,
            'margin_right'  => 15,
            'margin_top'    => 20,
            'margin_bottom' => 20,
            'tempDir'       => BASE_PATH . '/storage/cache',
        ];

        $this->mpdf = new Mpdf(array_merge($defaults, $options));
        $this->mpdf->SetAuthor(config('app.name', 'Parish ERP'));
        $this->mpdf->SetCreator(config('app.name', 'Parish ERP'));
    }

    public function html(string $html, string $css = ''): self
    {
        if ($css) {
            $this->mpdf->WriteHTML('<style>' . $css . '</style>');
        }
        $this->mpdf->WriteHTML($html);
        return $this;
    }

    public function header(string $html): self
    {
        $this->mpdf->SetHTMLHeader($html);
        return $this;
    }

    public function footer(string $html): self
    {
        $this->mpdf->SetHTMLFooter($html);
        return $this;
    }

    public function download(string $filename): void
    {
        $this->mpdf->Output($filename . '.pdf', 'D');
    }

    public function inline(string $filename): void
    {
        $this->mpdf->Output($filename . '.pdf', 'I');
    }

    public function save(string $filepath): void
    {
        $this->mpdf->Output($filepath, 'F');
    }

    public static function make(array $options = []): self
    {
        return new self($options);
    }

    public static function renderTemplate(string $template, array $data = []): string
    {
        extract($data);
        ob_start();
        include BASE_PATH . '/modules/' . $template . '.php';
        return ob_get_clean();
    }
}
