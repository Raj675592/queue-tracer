import { useCallback, useEffect, useState } from 'react';
import { socket } from '../socket.js';

const SESSION_KEY_PREFIX = 'queueCurePin:';

// Server-side PIN check per clinic. Authorization lives on the socket
// connection, not in the browser, so a page that just has a remembered
// "I was authorized" flag can't bypass the server. The one convenience
// this adds: if the receptionist already entered the right PIN once this
// tab session, a dropped/reconnected socket silently re-sends it instead
// of forcing a re-prompt mid-shift.
export function useReceptionAuth(clinicId, requiresPin) {
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState('');

  const tryAuth = useCallback(
    (pin, { remember = false } = {}) =>
      new Promise((resolve) => {
        socket.emit('clinic:auth', { clinicId, pin }, (res) => {
          if (res?.ok) {
            setAuthed(true);
            setError('');
            if (remember) sessionStorage.setItem(SESSION_KEY_PREFIX + clinicId, pin);
          } else {
            setError(res?.error || 'Incorrect PIN.');
          }
          resolve(res);
        });
      }),
    [clinicId]
  );

  useEffect(() => {
    if (!clinicId) return undefined;
    setAuthed(false);

    function attemptAutoAuth() {
      if (!requiresPin) {
        tryAuth('');
        return;
      }
      const cached = sessionStorage.getItem(SESSION_KEY_PREFIX + clinicId);
      if (cached) tryAuth(cached, { remember: true });
    }

    if (socket.connected) attemptAutoAuth();
    socket.on('connect', attemptAutoAuth);
    return () => socket.off('connect', attemptAutoAuth);
  }, [clinicId, requiresPin, tryAuth]);

  return { authed, error, tryAuth };
}
