import { useState, useEffect, useRef } from 'react';
import { getSettings, saveSettings, uploadLogo, uploadFavicon, logoUrl, faviconUrl } from '@/lib/dataStore';
import type { AppSettings } from '@/lib/dataStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, MessageSquare, Phone, Bell, Globe, Shield, Palette, Upload } from 'lucide-react';

// ─── Branding (Item 11) — the only tab in this page actually wired to a
// backend; SMTP/Messaging/Notifications/System below remain the static
// mockup they already were (out of scope for this pass — flagged, not
// silently left inconsistent).

function BrandingTab() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [appName, setAppName] = useState('');
  const [tagline, setTagline] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [seoKeywords, setSeoKeywords] = useState('');
  const [domain, setDomain] = useState('');
  const [subdomains, setSubdomains] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [logoNonce, setLogoNonce] = useState(0);
  const [faviconNonce, setFaviconNonce] = useState(0);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const reload = () => {
    getSettings().then((s) => {
      setSettings(s);
      setAppName(s.AppName);
      setTagline(s.Tagline || '');
      setSeoTitle(s.SeoTitle || '');
      setSeoDescription(s.SeoDescription || '');
      setSeoKeywords(s.SeoKeywords || '');
      setDomain(s.Domain || '');
      setSubdomains(s.Subdomains.join(', '));
    });
  };
  useEffect(() => { reload(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings({
        appName: appName.trim() || 'VIQ',
        tagline: tagline.trim() || undefined,
        seoTitle: seoTitle.trim() || undefined,
        seoDescription: seoDescription.trim() || undefined,
        seoKeywords: seoKeywords.trim() || undefined,
        domain: domain.trim() || undefined,
        subdomains: subdomains.split(',').map((s) => s.trim()).filter(Boolean),
      });
      reload();
    } finally {
      setSaving(false);
    }
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const s = await uploadLogo(file);
      setSettings(s);
      setLogoNonce((n) => n + 1);
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleFaviconChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFavicon(true);
    try {
      const s = await uploadFavicon(file);
      setSettings(s);
      setFaviconNonce((n) => n + 1);
    } finally {
      setUploadingFavicon(false);
      if (faviconInputRef.current) faviconInputRef.current.value = '';
    }
  };

  if (!settings) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>App Name</Label>
              <Input value={appName} onChange={(e) => setAppName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Tagline</Label>
              <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="A short line shown under the app name" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                {settings.HasLogo && <img key={logoNonce} src={`${logoUrl()}`} alt="Logo" className="h-10 max-w-[160px] object-contain rounded border bg-white p-1" />}
                <Button type="button" variant="outline" size="sm" disabled={uploadingLogo} onClick={() => logoInputRef.current?.click()}>
                  <Upload className="mr-1 h-3.5 w-3.5" /> {uploadingLogo ? 'Uploading…' : settings.HasLogo ? 'Replace' : 'Upload'}
                </Button>
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={handleLogoChange} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Favicon</Label>
              <div className="flex items-center gap-3">
                {settings.HasFavicon && <img key={faviconNonce} src={`${faviconUrl()}`} alt="Favicon" className="h-8 w-8 object-contain rounded border bg-white p-1" />}
                <Button type="button" variant="outline" size="sm" disabled={uploadingFavicon} onClick={() => faviconInputRef.current?.click()}>
                  <Upload className="mr-1 h-3.5 w-3.5" /> {uploadingFavicon ? 'Uploading…' : settings.HasFavicon ? 'Replace' : 'Upload'}
                </Button>
                <input ref={faviconInputRef} type="file" accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml" className="hidden" onChange={handleFaviconChange} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">SEO</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>SEO Title (defaults to App Name if blank)</Label>
            <Input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>SEO Description</Label>
            <Input value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>SEO Keywords (comma-separated)</Label>
            <Input value={seoKeywords} onChange={(e) => setSeoKeywords(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Applied to the document title and meta tags app-wide — most useful for the public landing page, since everything else here sits behind login.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Domain</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Primary Domain</Label>
              <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="viq.example.com" />
            </div>
            <div className="space-y-2">
              <Label>Subdomains (comma-separated)</Label>
              <Input value={subdomains} onChange={(e) => setSubdomains(e.target.value)} placeholder="ops.example.com, book.example.com" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Informational only — this app can't rebind which domain it's actually served from; use these as a reference for whoever manages DNS/deployment.
          </p>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Branding'}</Button>
    </div>
  );
}

export default function AdminSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Branding, SMTP, messaging, notifications, and system configuration</p>
      </div>

      <Tabs defaultValue="branding">
        <TabsList>
          <TabsTrigger value="branding" className="flex items-center gap-1">
            <Palette className="h-3.5 w-3.5" /> Branding
          </TabsTrigger>
          <TabsTrigger value="smtp" className="flex items-center gap-1">
            <Mail className="h-3.5 w-3.5" /> SMTP / IMAP
          </TabsTrigger>
          <TabsTrigger value="messaging" className="flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" /> Messaging
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-1">
            <Bell className="h-3.5 w-3.5" /> Notifications
          </TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-1">
            <Shield className="h-3.5 w-3.5" /> System
          </TabsTrigger>
        </TabsList>

        <TabsContent value="branding">
          <BrandingTab />
        </TabsContent>

        <TabsContent value="smtp" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">SMTP Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>SMTP Host</Label>
                  <Input placeholder="smtp.example.com" defaultValue="smtp.universalweather.com" />
                </div>
                <div className="space-y-2">
                  <Label>SMTP Port</Label>
                  <Input placeholder="587" defaultValue="587" />
                </div>
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input placeholder="ops@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input type="password" placeholder="••••••••" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="smtp-ssl" defaultChecked />
                <Label htmlFor="smtp-ssl">Use TLS/SSL</Label>
              </div>
              <Button>Save SMTP Settings</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">IMAP Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>IMAP Host</Label>
                  <Input placeholder="imap.example.com" />
                </div>
                <div className="space-y-2">
                  <Label>IMAP Port</Label>
                  <Input placeholder="993" defaultValue="993" />
                </div>
              </div>
              <Button variant="outline">Test Connection</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messaging" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Messaging Providers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-green-600" />
                    <span className="font-medium">WhatsApp</span>
                  </div>
                  <Badge variant="outline">Not Configured</Badge>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Input placeholder="Phone Number (+255...)" defaultValue="+255754776015" />
                  <Input placeholder="API Key" />
                </div>
              </div>

              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-blue-600" />
                    <span className="font-medium">SMS (Twilio)</span>
                  </div>
                  <Badge variant="outline">Not Configured</Badge>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Input placeholder="Account SID" />
                  <Input placeholder="Auth Token" />
                </div>
              </div>

              <Button>Save Messaging Settings</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notification Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="font-medium">Service Status Updates</div>
                  <div className="text-xs text-muted-foreground">Notify when a service is confirmed or rejected</div>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="font-medium">Urgent Service Alerts</div>
                  <div className="text-xs text-muted-foreground">Immediate notification for urgent/breached services</div>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="font-medium">Daily Digest</div>
                  <div className="text-xs text-muted-foreground">Send a summary of all open services once per day</div>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">System Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="font-medium">All-CAPS Input Enforcement</div>
                  <div className="text-xs text-muted-foreground">Force all text inputs to uppercase (ICAO, registration, etc.)</div>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="font-medium">Auto-Submit Services</div>
                  <div className="text-xs text-muted-foreground">Automatically send service requests at optimal lead times</div>
                </div>
                <Switch />
              </div>
              <Separator />
              <div className="text-xs text-muted-foreground">
                <Globe className="inline h-3 w-3 mr-1" />
                System timezone: UTC (Z) — all times displayed and stored in UTC
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
