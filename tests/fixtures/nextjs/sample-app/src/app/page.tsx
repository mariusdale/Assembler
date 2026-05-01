export default function Home() {
  return (
    <main>
      <h1>Hello World</h1>
      <p>Database status: {process.env.DATABASE_URL ? 'configured' : 'not configured'}</p>
    </main>
  );
}
