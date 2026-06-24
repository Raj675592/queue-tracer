import { useEffect, useState } from 'react';
import { socket } from '../socket.js';

function slugify(input) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export default function Landing() {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null); // { slug, name }

  // Auto-suggest a slug from the clinic name until the receptionist edits
  // the slug field themselves.
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    socket.emit('clinic:create', { name: name.trim(), slug, pin }, (res) => {
      setBusy(false);
      if (res?.ok) {
        setCreated({ slug: res.slug, name: res.name });
      } else {
        setError(res?.error || 'Could not create clinic.');
      }
    });
  }

  if (created) {
    const origin = window.location.origin;
    const receptionUrl = `${origin}/c/${created.slug}/reception`;
    const queueUrl = `${origin}/c/${created.slug}/queue`;
    return (
      <div className="landing">
        <div className="landing__card">
          <div className="eyebrow">Clinic created</div>
          <h2 className="landing__title">{created.name} is ready</h2>
          <p className="landing__hint">Save both of these links — give the first to your staff, the second to your waiting room.</p>

          <div className="landing__link-block">
            <span className="landing__link-label">Reception (staff only{pin ? ', PIN-protected' : ''})</span>
            <div className="landing__link-row">
              <input className="landing__link-input" readOnly value={receptionUrl} onFocus={(e) => e.target.select()} />
              <a className="btn btn--primary" href={`/c/${created.slug}/reception`}>
                Open
              </a>
            </div>
          </div>

          <div className="landing__link-block">
            <span className="landing__link-label">Patient waiting room (public)</span>
            <div className="landing__link-row">
              <input className="landing__link-input" readOnly value={queueUrl} onFocus={(e) => e.target.select()} />
              <a className="btn btn--ghost" href={`/c/${created.slug}/queue`} target="_blank" rel="noopener noreferrer">
                Open
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="landing">
      <form className="landing__card" onSubmit={handleSubmit}>
        <div className="eyebrow">Queue Cure</div>
        <h2 className="landing__title">Set up your clinic</h2>
        <p className="landing__hint">Each clinic gets its own queue and its own link — nothing is shared between clinics.</p>

        <label className="landing__field">
          <span>Clinic name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sunrise Family Clinic" required />
        </label>

        <label className="landing__field">
          <span>URL slug</span>
          <input
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            placeholder="sunrise-clinic"
            required
          />
          <span className="landing__field-note">queuecure.app/c/{slug || 'your-slug'}/...</span>
        </label>

        <label className="landing__field">
          <span>Staff PIN (optional, 4-6 digits)</span>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Leave blank for no PIN"
            inputMode="numeric"
          />
        </label>

        {error && <div className="toast toast--error">{error}</div>}

        <button className="btn btn--primary landing__submit" type="submit" disabled={busy || !name.trim() || !slug}>
          {busy ? 'Creating…' : 'Create clinic'}
        </button>

        <p className="landing__hint landing__hint--small">
          Already have a clinic? Go straight to <code>/c/your-slug/reception</code>.
        </p>
      </form>
    </div>
  );
}
