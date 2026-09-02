import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import type { ContactChannel } from '@/data/types';

const CHANNEL_TYPES: ContactChannel['ChannelType'][] = ['Email', 'Phone', 'SMS', 'WhatsApp'];

// Repeating add/remove list of typed contact entries, shared by every
// AdminAssets detail panel that edits Provider/Operator/Client/Person.
// Whole-array replace on every change — matches the server's
// ContactChannelsService.replace() whole-list-save semantics, so there's
// nothing to reconcile between this component's local edits and what
// gets sent on Save.
export function ContactChannelEditor({ channels, onChange }: {
  channels: ContactChannel[];
  onChange: (next: ContactChannel[]) => void;
}) {
  const update = (index: number, patch: Partial<ContactChannel>) => {
    onChange(channels.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };
  const remove = (index: number) => {
    onChange(channels.filter((_, i) => i !== index));
  };
  const add = () => {
    onChange([...channels, { ID: 0, ChannelType: 'Email', Value: '', Preferred: false, ForBilling: false }]);
  };

  return (
    <div className="space-y-2">
      <Label>Contact Channels</Label>
      {channels.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
          <Select value={c.ChannelType} onValueChange={(v) => update(i, { ChannelType: v as ContactChannel['ChannelType'], ForBilling: v === 'Email' ? c.ForBilling : false })}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CHANNEL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Value" value={c.Value} onChange={(e) => update(i, { Value: e.target.value })} className="w-40 flex-1 min-w-[10rem]" />
          <Input placeholder="Label (optional)" value={c.Label || ''} onChange={(e) => update(i, { Label: e.target.value })} className="w-32" />
          <label className="flex items-center gap-1 text-xs whitespace-nowrap">
            <Checkbox checked={c.Preferred} onCheckedChange={(v) => update(i, { Preferred: v === true })} /> Preferred
          </label>
          {c.ChannelType === 'Email' && (
            <label className="flex items-center gap-1 text-xs whitespace-nowrap">
              <Checkbox checked={c.ForBilling} onCheckedChange={(v) => update(i, { ForBilling: v === true })} /> For Billing
            </label>
          )}
          <Button size="icon" variant="ghost" onClick={() => remove(i)} title="Remove"><Trash2 className="h-3.5 w-3.5 text-rose-600" /></Button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={add}><Plus className="h-4 w-4" /> Add Contact</Button>
    </div>
  );
}
