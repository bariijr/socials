'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('uaa_token');
    router.replace(token ? '/legs' : '/login');
  }, [router]);

  return null;
}
