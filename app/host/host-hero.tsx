import "./host-console.css";

const BARS = [38, 62, 48, 88, 70, 100, 56, 78, 44, 92, 66, 52, 84, 40];

export default function HostHero() {
  return (
    <section className="hc-hero">
      <div className="eyebrow">Private room management</div>
      <h1>Host console.</h1>
      <p>Create invitation-only rooms, set an entry fee, and share each generated code privately.</p>
      <div className="hc-wave" aria-hidden="true">
        {BARS.map((height, i) => (
          <span key={i} style={{ height: `${height}%`, animationDelay: `${i * 0.11}s` }} />
        ))}
      </div>
    </section>
  );
}
