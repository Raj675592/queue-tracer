import { useState } from 'react';

export default function PinPrompt({ clinicName, onSubmit, error }) {
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit(pin);
    setSubmitting(false);
    setPin('');
  }

  return (
    <div className="pin-gate">
      <form className="pin-gate__card" onSubmit={handleSubmit}>
        <div className="eyebrow">{clinicName || 'Reception'} access</div>
        <h2 className="pin-gate__title">Enter staff PIN</h2>
        <input
          className="pin-gate__input"
          type="password"
          inputMode="numeric"
          maxLength={6}
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="••••"
        />
        {error && <div className="toast toast--error">{error}</div>}
        <button className="btn btn--primary" type="submit" disabled={pin.length === 0 || submitting}>
          {submitting ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}
