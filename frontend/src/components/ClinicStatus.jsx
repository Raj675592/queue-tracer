export default function ClinicStatus({ status, error }) {
  return (
    <div className="clinic-status">
      <div className="clinic-status__card">
        {status === 'loading' ? (
          <>
            <div className="eyebrow">Queue Cure</div>
            <p>Connecting to this clinic…</p>
          </>
        ) : (
          <>
            <div className="eyebrow">Queue Cure</div>
            <p className="clinic-status__error">{error || "This clinic link doesn't exist."}</p>
            <a className="btn btn--ghost" href="/">
              Create or find a clinic
            </a>
          </>
        )}
      </div>
    </div>
  );
}
