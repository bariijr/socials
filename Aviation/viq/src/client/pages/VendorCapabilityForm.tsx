import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, getVendorCapabilityByToken, submitVendorCapabilityResponse } from '@/lib/dataStore';
import type { VendorCapabilityPublicView } from '@/lib/dataStore';

// Public, unauthenticated page — reached via the link an Admin generates on
// the "Request Capability Confirmation" flow (Task 7) and sends the vendor
// out-of-band. No VIQ login involved; the token in the URL is the vendor's
// only credential. See dataStore.ts's getVendorCapabilityByToken /
// submitVendorCapabilityResponse for why apiJson is safe to use here.
export default function VendorCapabilityForm() {
  const { token } = useParams<{ token: string }>();
  const [request, setRequest] = useState<VendorCapabilityPublicView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [canService, setCanService] = useState<boolean | null>(null);
  const [vendorNotes, setVendorNotes] = useState('');

  useEffect(() => {
    if (!token) {
      setError('This link is invalid or has expired.');
      return;
    }
    getVendorCapabilityByToken(token)
      .then(setRequest)
      .catch((e: unknown) => {
        const message =
          e instanceof ApiError && e.status === 404
            ? 'This link is invalid or has expired.'
            : 'Something went wrong loading this request.';
        setError(message);
      });
  }, [token]);

  const submit = async () => {
    if (!token || canService === null || !contactName.trim()) return;
    setSubmitting(true);
    try {
      await submitVendorCapabilityResponse(token, {
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim() || undefined,
        canService,
        vendorNotes: vendorNotes.trim() || undefined,
      });
      setSubmitted(true);
    } catch (e: unknown) {
      const body = e instanceof ApiError ? (e.body as { message?: string } | undefined) : undefined;
      setError(body?.message || 'Could not submit your response.');
    } finally {
      setSubmitting(false);
    }
  };

  if (error) return <div className="max-w-md mx-auto mt-16 p-6 text-center text-destructive">{error}</div>;
  if (!request) return <div className="max-w-md mx-auto mt-16 p-6 text-center">Loading…</div>;
  if (submitted || request.status !== 'PENDING') {
    return <div className="max-w-md mx-auto mt-16 p-6 text-center">Thank you — your response has been recorded.</div>;
  }

  return (
    <div className="max-w-md mx-auto mt-16 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Confirm your capability</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Can your organization provide <strong>{request.serviceType}</strong> at{' '}
            <strong>{request.icao || request.countryIso2}</strong>?
          </p>
          <Input placeholder="Your name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          <Input placeholder="Your email (optional)" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          <div className="flex gap-2">
            <Button variant={canService === true ? 'default' : 'outline'} onClick={() => setCanService(true)}>Yes, we can</Button>
            <Button variant={canService === false ? 'default' : 'outline'} onClick={() => setCanService(false)}>No, we cannot</Button>
          </div>
          <Textarea placeholder="Notes (optional)" value={vendorNotes} onChange={(e) => setVendorNotes(e.target.value)} />
          <Button className="w-full" disabled={submitting || canService === null || !contactName.trim()} onClick={submit}>
            Submit
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
