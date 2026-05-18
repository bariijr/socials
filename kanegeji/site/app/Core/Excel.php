<?php

namespace App\Core;

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Style\Border;

class Excel
{
    private Spreadsheet $spreadsheet;
    private $sheet;

    public function __construct(string $title = 'Export')
    {
        $this->spreadsheet = new Spreadsheet();
        $this->sheet = $this->spreadsheet->getActiveSheet();
        $this->spreadsheet->getProperties()
            ->setTitle($title)
            ->setCreator(config('app.name', 'Parish ERP'));
    }

    public function title(string $title): self
    {
        $this->sheet->setTitle(mb_substr($title, 0, 31));
        return $this;
    }

    public function headers(array $headers, string $startRow = '1'): self
    {
        $col = 'A';
        foreach ($headers as $header) {
            $this->sheet->setCellValue($col . $startRow, $header);
            $col++;
        }

        $endCol = chr(ord('A') + count($headers) - 1);
        $this->sheet->getStyle('A' . $startRow . ':' . $endCol . $startRow)->applyFromArray([
            'font'      => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
            'fill'      => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '4F46E5']],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER],
        ]);

        return $this;
    }

    public function rows(array $rows, int $startRow = 2): self
    {
        $rowNum = $startRow;
        foreach ($rows as $row) {
            $col = 'A';
            foreach ($row as $value) {
                $this->sheet->setCellValue($col . $rowNum, $value);
                $col++;
            }
            $rowNum++;
        }
        return $this;
    }

    public function autoSize(): self
    {
        foreach ($this->sheet->getColumnIterator() as $column) {
            $this->sheet->getColumnDimension($column->getColumnIndex())->setAutoSize(true);
        }
        return $this;
    }

    public function download(string $filename): void
    {
        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header('Content-Disposition: attachment; filename="' . $filename . '.xlsx"');
        header('Cache-Control: max-age=0');

        (new Xlsx($this->spreadsheet))->save('php://output');
        exit;
    }

    public function save(string $filepath): void
    {
        (new Xlsx($this->spreadsheet))->save($filepath);
    }

    public static function make(string $title = 'Export'): self
    {
        return new self($title);
    }
}
