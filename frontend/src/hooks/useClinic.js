import { useEffect, useState } from 'react';
import { socket } from '../socket.js';

// Resolves a URL slug (e.g. "sunrise" from /c/sunrise/reception) into the
// stable clinic record both screens actually operate on. Re-resolves
// automatically if the socket reconnects before the first resolve lands.
export function useClinic(slug) {
  const [state, setState] = useState({
    status: 'loading', // 'loading' | 'ready' | 'error'
    clinicId: null,
    name: null,
    requiresPin: false,
    error: null,
  });

  useEffect(() => {
    if (!slug) return undefined;
    let active = true;
    setState((s) => ({ ...s, status: 'loading' }));

    function resolve() {
      socket.emit('clinic:resolve', { slug }, (res) => {
        if (!active) return;
        if (res?.ok) {
          setState({ status: 'ready', clinicId: res.clinicId, name: res.name, requiresPin: res.requiresPin, error: null });
        } else {
          setState({ status: 'error', clinicId: null, name: null, requiresPin: false, error: res?.error || 'Clinic not found.' });
        }
      });
    }

    if (socket.connected) resolve();
    socket.on('connect', resolve);

    return () => {
      active = false;
      socket.off('connect', resolve);
    };
  }, [slug]);

  return state;
}
