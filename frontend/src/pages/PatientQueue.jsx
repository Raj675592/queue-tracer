import { useParams } from 'react-router-dom';
import { useClinic } from '../hooks/useClinic.js';
import { useQueue } from '../hooks/useQueue.js';
import CounterDisplay from '../components/CounterDisplay.jsx';
import ConnectionDot from '../components/ConnectionDot.jsx';
import ClinicStatus from '../components/ClinicStatus.jsx';

function firstName(fullName) {
  return (fullName || '').trim().split(/\s+/)[0] || '';
}

function formatEta(minutes) {
  if (minutes <= 0) return 'Now';
  return `~${minutes} min`;
}

function aheadLabel(tokensAhead) {
  if (tokensAhead === 0) return 'Up next';
  return `${tokensAhead} ahead`;
}

export default function PatientQueue() {
  const { slug } = useParams();
  const clinic = useClinic(slug);
  const { snapshot, connected } = useQueue(clinic.clinicId);

  if (clinic.status !== 'ready') return <ClinicStatus status={clinic.status} error={clinic.error} />;

  const nowServing = snapshot?.nowServing;
  const waiting = snapshot?.waiting || [];
  const config = snapshot?.config;

  return (
    <div className="queue-page">
      <div className="topbar">
        <span className="topbar__brand">
          <span className="topbar__brand-dot">●</span> {clinic.name} · Waiting Room
        </span>
        <ConnectionDot connected={connected} onDark />
      </div>

      <div className="queue-hero">
        <CounterDisplay
          value={nowServing ? nowServing.tokenNumber : null}
          label="Now serving"
          subtext={nowServing ? firstName(nowServing.name) : null}
          size="xl"
        />
        {!nowServing && (
          <div className="queue-hero__empty">
            No one is being seen right now — the receptionist will call the next token shortly.
          </div>
        )}
      </div>

      <div className="queue-divider" />
      <div className="queue-next-label">Up next</div>

      {waiting.length === 0 ? (
        <div className="ticket-empty">The waiting line is empty.</div>
      ) : (
        <div className="ticket-list">
          {waiting.map((p) => (
            <div className={`ticket-row ${p.tokensAhead === 0 ? 'ticket-row--next' : ''}`} key={p._id}>
              <div className="ticket-row__left">
                <span className="ticket-row__badge">{String(p.tokenNumber).padStart(3, '0')}</span>
                <span className="ticket-row__name">{firstName(p.name)}</span>
              </div>
              <div className="ticket-row__right">
                <span className={`pill ${p.tokensAhead === 0 ? 'pill--next' : 'pill--ahead'}`}>
                  {aheadLabel(p.tokensAhead)}
                </span>
                <span className="pill pill--eta">{formatEta(p.estimatedWaitMinutes)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {config && (
        <p className="queue-source-note">
          {config.waitTimeSource === 'real-data'
            ? `Estimated wait is based on today's real consultation times, averaged from the last ${config.realSampleSize} patient${config.realSampleSize === 1 ? '' : 's'} seen.`
            : "Estimated wait uses the receptionist's starting estimate — it will switch to real data after the first couple of patients are seen today."}
        </p>
      )}
    </div>
  );
}
