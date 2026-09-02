import { useEffect, useState } from 'react';
import { verifyDoc, getDocPreviewUrl } from '@/lib/dataStore';
import type { DocAttachment } from '@/data/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';

interface FieldRow {
  label: string;
  value: string;
}

const PREVIEWABLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/bmp']);

// Renders the actual uploaded file next to the extracted fields — images
// and PDFs get a real visual preview (browsers render PDF <iframe> natively);
// TIFF/DOCX/text have no reliable in-browser preview, so they fall back to
// a plain "download to view" notice rather than a broken/blank frame.
function DocPreviewPane({ doc }: { doc: DocAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    getDocPreviewUrl(doc.DocID)
      .then((u) => { revoked = u; setUrl(u); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Preview failed to load'));
    return () => { if (revoked) URL.revokeObjectURL(revoked); };
  }, [doc.DocID]);

  if (error) return <div className="flex h-full items-center justify-center text-xs text-destructive p-4">{error}</div>;
  if (!url) return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading preview…</div>;

  if (PREVIEWABLE_IMAGE_TYPES.has(doc.MimeType)) {
    return <img src={url} alt={doc.FileName} className="max-h-full max-w-full object-contain" />;
  }
  if (doc.MimeType === 'application/pdf') {
    return <iframe src={url} title={doc.FileName} className="h-full w-full border-0" />;
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground">
      <span>No in-browser preview for this file type ({doc.MimeType}).</span>
      <span>Use Download on the document row to view it.</span>
    </div>
  );
}

export function DocVerifyDialog({ doc, open, onClose, onSaved }: {
  doc: DocAttachment;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [validUntil, setValidUntil] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (doc.VerifiedFields?.length) {
      setFields(doc.VerifiedFields);
    } else if (doc.OcrStructuredFields) {
      setFields(Object.entries(doc.OcrStructuredFields).map(([label, value]) => ({ label, value: String(value ?? '') })));
    } else {
      setFields([]);
    }
    setValidUntil(doc.ValidUntil ? doc.ValidUntil.slice(0, 10) : '');
  }, [open, doc]);

  const updateField = (index: number, key: keyof FieldRow, value: string) => {
    setFields((current) => current.map((f, i) => (i === index ? { ...f, [key]: value } : f)));
  };

  const removeField = (index: number) => {
    setFields((current) => current.filter((_, i) => i !== index));
  };

  const addField = () => {
    setFields((current) => [...current, { label: '', value: '' }]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await verifyDoc(doc.DocID, {
        verifiedFields: fields.filter((f) => f.label.trim()),
        validUntil: validUntil || undefined,
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      {/* sm:max-w-*, not bare max-w-* — DialogContent's base classes set
          sm:max-w-lg, which wins the cascade over an unprefixed override at
          desktop widths regardless of JSX order (see BillingPage's identical
          fix for the full explanation). */}
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Verify — {doc.FileName}</DialogTitle>
        </DialogHeader>
        <div className="grid flex-1 gap-4 overflow-hidden md:grid-cols-2">
          <div className="min-h-[300px] overflow-auto rounded border bg-muted/10">
            <DocPreviewPane doc={doc} />
          </div>
          <div className="space-y-4 overflow-y-auto pr-1">
            {doc.OcrText && (
              <div>
                <Label className="text-xs text-muted-foreground">Raw extracted text (reference)</Label>
                <pre className="mt-1 max-h-32 overflow-y-auto rounded border bg-muted/20 p-2 text-xs whitespace-pre-wrap">{doc.OcrText}</pre>
              </div>
            )}
            <div>
              <Label>Valid Until</Label>
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Verified fields — check each against the document on the left</Label>
              {fields.map((field, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input placeholder="Field" value={field.label} onChange={(e) => updateField(index, 'label', e.target.value)} className="w-1/3" />
                  <Input placeholder="Value" value={field.value} onChange={(e) => updateField(index, 'value', e.target.value)} className="flex-1" />
                  <Button size="icon-sm" variant="ghost" onClick={() => removeField(index)} title="Remove field"><Trash2 className="h-3.5 w-3.5 text-rose-600" /></Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addField}><Plus className="h-4 w-4" /> ADD FIELD</Button>
            </div>
          </div>
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
