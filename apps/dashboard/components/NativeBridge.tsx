'use client';

import { useEffect } from 'react';
import { initNative } from '@/lib/native';

// Boots the Capacitor native integration (status bar, splash, back button, push).
// Inert in a normal browser — renders nothing.
export default function NativeBridge() {
  useEffect(() => { void initNative(); }, []);
  return null;
}
