import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Online status.
 * Web: listens to browser online/offline events (reliable).
 * Native: always true — React Query's error banners already surface network
 * failures per-screen with Retry, and a health-ping every 15s breaks both
 * local (LAN) and prod (Render cold-start >4s) with false "offline".
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const onVis = () => setOnline(navigator.onLine);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return online;
}
