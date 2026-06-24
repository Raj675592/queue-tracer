// The signature visual idea for this build: instead of an abstract flip
// board, the "now serving" number is rendered as the actual object every
// Indian clinic/bank patient already recognizes — a dark counter housing
// with a glowing red LED digit display. It's the one thing on screen meant
// to be instantly familiar, so everything else can stay quiet around it.
export default function CounterDisplay({ value, label, subtext, size = 'lg' }) {
  const display = value === null || value === undefined ? '---' : String(value).padStart(3, '0');

  return (
    <div className={`counter counter--${size}`}>
      {label && <div className="counter__label">{label}</div>}
      <div className="counter__screen" aria-label={value ? `Token ${display}` : 'No token'}>
        <span className="counter__digits">{display}</span>
      </div>
      {subtext && <div className="counter__subtext">{subtext}</div>}
    </div>
  );
}
