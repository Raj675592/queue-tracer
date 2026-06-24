import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://queuetracerbackend-bryoma3t.b4a.run';

// One shared socket instance for the whole app. autoConnect stays true so
// both the Reception and PatientQueue screens reconnect on their own after
// a dropped wifi connection - the server resends a full 'queue:update'
// snapshot the moment any socket (re)connects, so a stale screen never sits
// silently out of sync.
if (!SERVER_URL) {
  throw new Error('VITE_SERVER_URL is not set — check environment variables');
}
export const socket = io(SERVER_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  transports: ['websocket'],   // ← Problem 2 fix: skip polling, go straight to WS
});