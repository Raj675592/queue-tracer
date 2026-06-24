import { useEffect } from 'react';
import CounterDisplay from './CounterDisplay.jsx';

const AUTO_DISMISS_MS = 6000;

export default function TokenRevealModal({ patient, onDismiss }) {
  useEffect(() => {
    if (!patient) return undefined;
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [patient, onDismiss]);

  if (!patient) return null;

  return (
    <div className="reveal-overlay" role="dialog" aria-modal="true" onClick={onDismiss}>
      <div className="reveal-card" onClick={(e) => e.stopPropagation()}>
        <div className="reveal-card__hint">Turn the screen to the patient</div>
        <CounterDisplay value={patient.tokenNumber} label="Your token" subtext={patient.name} size="md" />
        <button className="btn btn--primary reveal-card__done" onClick={onDismiss}>
          Done — next patient
        </button>
      </div>
    </div>
  );
}
