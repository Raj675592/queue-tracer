import { io } from 'socket.io-client';

const SERVER_URL = 'https://queuetracerbackend-0s8hj1gt.b4a.run';

// One shared socket instance for the whole app. autoConnect stays true so
// both the Reception and PatientQueue screens reconnect on their own after
// a dropped wifi connection - the server resends a full 'queue:update'
// snapshot the moment any socket (re)connects, so a stale screen never sits
// silently out of sync.
export const socket = io(SERVER_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
});
