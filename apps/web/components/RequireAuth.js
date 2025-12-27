'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '../lib/auth';

export default function RequireAuth({ children }) {
  const router = useRouter();
  const [token, setTokenState] = useState('');

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace('/login');
      return;
    }
    setTokenState(t);
  }, [router]);

  if (!token) return null;
  return children;
}
