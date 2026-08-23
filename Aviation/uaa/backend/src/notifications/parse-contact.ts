export function parseContact(contacts: string | null | undefined): { email: string; phone: string } {
  const trimmed = (contacts ?? '').trim();
  if (!trimmed) return { email: '', phone: '' };

  const slashIndex = trimmed.lastIndexOf(' / ');
  if (slashIndex === -1) return { email: trimmed, phone: '' };

  return {
    email: trimmed.slice(0, slashIndex).trim(),
    phone: trimmed.slice(slashIndex + 3).trim(),
  };
}
