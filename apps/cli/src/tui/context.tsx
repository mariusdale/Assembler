import React, { createContext, useContext } from 'react';
import type { CliApp } from '../app.js';

const CliAppContext = createContext<CliApp | null>(null);

export function CliAppProvider({
  app,
  children,
}: {
  app: CliApp;
  children: React.ReactNode;
}) {
  return (
    <CliAppContext.Provider value={app}>{children}</CliAppContext.Provider>
  );
}

export function useCliApp(): CliApp {
  const app = useContext(CliAppContext);
  if (!app) {
    throw new Error('useCliApp must be used within a CliAppProvider');
  }
  return app;
}
