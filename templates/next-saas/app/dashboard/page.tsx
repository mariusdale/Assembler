const highlights = [
  {
    label: 'Billing mode',
    value: '{{BILLING_MODE}}',
  },
  {
    label: 'Auth strategy',
    value: '{{AUTH_STRATEGY}}',
  },
  {
    label: 'Database connected',
    value: '{{DATABASE_REQUIRED}}',
  },
];

export default function DashboardPage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">Dashboard</p>
        <h1>{{DASHBOARD_TITLE}}</h1>
        <p className="lede">
          This is the first operator surface for {{APP_NAME}}. Wire live metrics, customer data, and
          billing state here as the product matures.
        </p>
      </section>
      <section className="grid">
        {highlights.map((item) => (
          <article className="card" key={item.label}>
            <p className="card-label">{item.label}</p>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>
    </main>
  );
}
