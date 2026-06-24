import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { socket } from '../socket.js';
import { useClinic } from '../hooks/useClinic.js';
import { useReceptionAuth } from '../hooks/useReceptionAuth.js';
import { useQueue } from '../hooks/useQueue.js';
import CounterDisplay from '../components/CounterDisplay.jsx';
import ConnectionDot from '../components/ConnectionDot.jsx';
import TokenRevealModal from '../components/TokenRevealModal.jsx';
import ClinicStatus from '../components/ClinicStatus.jsx';
import PinPrompt from '../components/PinPrompt.jsx';

function formatEta(minutes) {
  if (minutes <= 0) return 'Now';
  return `~${minutes} min`;
}

function aheadLabel(tokensAhead) {
  if (tokensAhead === 0) return 'Next';
  return `${tokensAhead} ahead`;
}

export default function Reception() {
  const { slug } = useParams();
  const clinic = useClinic(slug);
  const { authed, error: authError, tryAuth } = useReceptionAuth(clinic.clinicId, clinic.requiresPin);
  const { snapshot, connected } = useQueue(authed ? clinic.clinicId : null);

  const [name, setName] = useState('');
  const [toast, setToast] = useState(null);
  const [avgInput, setAvgInput] = useState('');
  const [avgInitialized, setAvgInitialized] = useState(false);
  const [callBusy, setCallBusy] = useState(false);
  const [revealPatient, setRevealPatient] = useState(null);
  const inputRef = useRef(null);

  const clinicId = clinic.clinicId;
  const nowServing = snapshot?.nowServing;
  const waiting = snapshot?.waiting || [];
  const config = snapshot?.config;

  useEffect(() => {
    if (!avgInitialized && config) {
      setAvgInput(String(config.avgConsultMinutes));
      setAvgInitialized(true);
    }
  }, [config, avgInitialized]);

  if (clinic.status !== 'ready') return <ClinicStatus status={clinic.status} error={clinic.error} />;
  if (!authed) return <PinPrompt clinicName={clinic.name} error={authError} onSubmit={(pin) => tryAuth(pin, { remember: true })} />;

  function handleAdd(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    socket.emit('patient:add', { clinicId, name: trimmed }, (res) => {
      if (res?.ok) {
        setToast({ kind: 'ok', text: `Token #${String(res.tokenNumber).padStart(3, '0')} assigned to ${trimmed}.` });
        setRevealPatient({ tokenNumber: res.tokenNumber, name: trimmed });
        setName('');
        inputRef.current?.focus();
      } else {
        setToast({ kind: 'error', text: res?.error || 'Could not add patient.' });
      }
    });
  }

  function handleCallNext() {
    setCallBusy(true);
    socket.emit('token:callNext', { clinicId }, (res) => {
      setCallBusy(false);
      if (!res?.ok) setToast({ kind: 'error', text: res?.error || 'Could not call next token.' });
    });
  }

  function handleSkip(patientId) {
    socket.emit('token:skip', { clinicId, patientId }, (res) => {
      if (!res?.ok) setToast({ kind: 'error', text: res?.error || 'Could not skip token.' });
    });
  }

  function handleSaveAvg(e) {
    e.preventDefault();
    socket.emit('config:setAvgTime', { clinicId, minutes: Number(avgInput) }, (res) => {
      if (!res?.ok) setToast({ kind: 'error', text: res?.error || 'Could not update average time.' });
    });
  }

  let callLabel = 'Queue is empty';
  if (nowServing && waiting.length > 0) callLabel = 'Finish current & call next';
  else if (nowServing && waiting.length === 0) callLabel = 'Finish current patient';
  else if (!nowServing && waiting.length > 0) callLabel = 'Call first patient';
  const callDisabled = !nowServing && waiting.length === 0;

  return (
    <div className="reception-page">
      <div className="topbar">
        <span className="topbar__brand">
          <span className="topbar__brand-dot">●</span> {clinic.name} · Reception
        </span>
        <div className="topbar__right">
          <ConnectionDot connected={connected} onDark />
          <a className="topbar__link" href={`/c/${slug}/queue`} target="_blank" rel="noopener noreferrer">
            Open patient screen ↗
          </a>
        </div>
      </div>

      <div className="reception-grid">
        <div>
          <div className="card">
            <h3 className="card__title">Add patient</h3>
            <form className="add-form" onSubmit={handleAdd}>
              <input
                ref={inputRef}
                type="text"
                placeholder="Patient name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              <button className="btn btn--primary" type="submit" disabled={!name.trim()}>
                Add
              </button>
            </form>
            {toast && <div className={`toast ${toast.kind === 'error' ? 'toast--error' : ''}`}>{toast.text}</div>}
          </div>

          <div className="card">
            <h3 className="card__title">Now serving</h3>
            <div className="now-serving">
              <CounterDisplay value={nowServing ? nowServing.tokenNumber : null} size="md" />
              <div className="now-serving__meta">
                <div className="now-serving__name">{nowServing ? nowServing.name : 'No one yet'}</div>
                <button className="btn btn--primary" onClick={handleCallNext} disabled={callDisabled || callBusy}>
                  {callLabel}
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="card__title">Average consultation time</h3>
            <form className="config-row" onSubmit={handleSaveAvg}>
              <input type="number" min="1" max="120" value={avgInput} onChange={(e) => setAvgInput(e.target.value)} />
              <span>minutes</span>
              <button className="btn btn--ghost" type="submit">
                Save
              </button>
            </form>
            <p className="config-note">
              {config?.waitTimeSource === 'real-data'
                ? `Wait times are now calculated from today's real average (${config.effectiveMinutesPerPatient} min, from ${config.realSampleSize} patients seen) — this field is just the starting fallback for tomorrow.`
                : 'This is the starting estimate used until enough real consultations happen today, after which wait times switch to the real average automatically.'}
            </p>
          </div>
        </div>

        <div>
          <div className="card">
            <h3 className="card__title">Waiting line</h3>
            {waiting.length === 0 ? (
              <div className="ticket-empty">No patients waiting. Add one on the left to get started.</div>
            ) : (
              <div className="ticket-list">
                {waiting.map((p) => (
                  <div className={`ticket-row ${p.tokensAhead === 0 ? 'ticket-row--next' : ''}`} key={p._id}>
                    <div className="ticket-row__left">
                      <span className="ticket-row__badge">{String(p.tokenNumber).padStart(3, '0')}</span>
                      <span className="ticket-row__name">{p.name}</span>
                    </div>
                    <div className="ticket-row__right">
                      <span className={`pill ${p.tokensAhead === 0 ? 'pill--next' : 'pill--ahead'}`}>
                        {aheadLabel(p.tokensAhead)}
                      </span>
                      <span className="pill pill--eta">{formatEta(p.estimatedWaitMinutes)}</span>
                      <button className="btn btn--rose" onClick={() => handleSkip(p._id)}>
                        Skip
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="stat-row">
              <div className="stat">
                Waiting
                <strong>{waiting.length}</strong>
              </div>
              <div className="stat">
                Seen today
                <strong>{snapshot?.done?.length || 0}</strong>
              </div>
              <div className="stat">
                Skipped
                <strong>{snapshot?.skipped?.length || 0}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      <TokenRevealModal patient={revealPatient} onDismiss={() => setRevealPatient(null)} />
    </div>
  );
}
