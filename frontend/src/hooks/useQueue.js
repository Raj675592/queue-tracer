import { useEffect, useState } from 'react';
import { socket } from '../socket.js';

// Both screens render from the exact same snapshot shape coming off the
// socket - this is deliberate. Neither screen derives its own queue math;
// they just display whatever the server says is true right now, for the
// one clinic room they've joined.
export function useQueue(clinicId) {
  const [snapshot, setSnapshot] = useState(null);
  const [connected, setConnected] = useState(false);
  const [joinError, setJoinError] = useState(null);

  useEffect(() => {
    if (!clinicId) return undefined;
    let active = true;

    function join() {
      socket.emit('clinic:join', { clinicId }, (res) => {
        if (!active) return;
        if (res?.ok) {
          setSnapshot(res.snapshot);
          setJoinError(null);
        } else {
          setJoinError(res?.error || 'Could not load this clinic.');
        }
      });
    }

    // Ignore broadcasts for any other clinic room this socket might also
    // be in (e.g. a receptionist with two clinic tabs sharing one socket).
    function onUpdate(data) {
      if (data?.clinicId === clinicId) setSnapshot(data);
    }
    function onConnect() {
      setConnected(true);
      join(); // rooms aren't remembered across a reconnect - rejoin explicitly
    }
    function onDisconnect() {
      setConnected(false);
    }

    socket.on('queue:update', onUpdate);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
if (socket.connected) {
  setConnected(true);  
  join();
}

    return () => {
      active = false;
      socket.off('queue:update', onUpdate);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [clinicId]);

  return { snapshot, connected, joinError };
}
