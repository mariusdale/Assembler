export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Sample Next.js App</h1>
      <p>Deployed with DevAssemble.</p>
      <p>
        Database URL configured:{' '}
        {process.env.DATABASE_URL ? 'Yes' : 'No'}
      </p>
    </main>
  );
}
