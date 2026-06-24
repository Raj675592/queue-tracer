export default function ConnectionDot({ connected, onDark = false }) {
  return (
    <span className={`conn ${onDark ? 'conn--on-dark' : ''}`}>
      <span className={`conn__dot ${connected ? 'conn__dot--live' : 'conn__dot--down'}`} />
      {connected ? 'Live' : 'Reconnecting…'}
    </span>
  );
}
