const stats = [
  {
    label: 'Billing',
    value: '{{BILLING_MODE}}',
  },
  {
    label: 'Auth',
    value: '{{AUTH_STRATEGY}}',
  },
  {
    label: 'Domain',
    value: '{{APP_DOMAIN}}',
  },
];

const features = [
  'Launch a polished landing page without touching boilerplate.',
  'Route new users into a ready-made dashboard shell.',
  'Keep deployment settings simple with a single environment contract.',
];

export default function HomePage(): JSX.Element {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">Preview ready</p>
        <h1>{{APP_NAME}}</h1>
        <p className="lede">{{APP_DESCRIPTION}}</p>
        <div className="actions">
          <a className="button button-primary" href="/dashboard">
            Open dashboard
          </a>
          <a className="button button-secondary" href="https://{{APP_DOMAIN}}">
            Planned domain
          </a>
        </div>
      </section>

      <section className="grid stats">
        {stats.map((item) => (
          <article className="card" key={item.label}>
            <p className="card-label">{item.label}</p>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      <section className="grid features">
        {features.map((feature) => (
          <article className="card" key={feature}>
            <p>{feature}</p>
          </article>
        ))}
      </section>

      <p className="footer-note">
        Neon configured: <strong>{{DATABASE_REQUIRED}}</strong>
      </p>
    </main>
  );
}
