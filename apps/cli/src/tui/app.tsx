import React, { useReducer } from 'react';
import { render, useApp, useInput } from 'ink';
import { createCliApp } from '../app.js';
import { CliAppProvider } from './context.js';
import { tuiReducer, initialState } from './reducer.js';
import { Header } from './components/Header.js';
import { KeyboardHints } from './components/KeyboardHints.js';
import { HomeScreen } from './screens/HomeScreen.js';
import { LaunchScreen } from './screens/LaunchScreen.js';
import { PlanScreen } from './screens/PlanScreen.js';
import { StatusScreen } from './screens/StatusScreen.js';
import { SetupScreen } from './screens/SetupScreen.js';
import { TeardownScreen } from './screens/TeardownScreen.js';
import { EnvScreen } from './screens/EnvScreen.js';
import { PreviewScreen } from './screens/PreviewScreen.js';
import { DomainScreen } from './screens/DomainScreen.js';
import { CredsScreen } from './screens/CredsScreen.js';
import { HelpScreen } from './screens/HelpScreen.js';
import type { TuiAction, TuiState } from './types.js';

function App({ app }: { app: ReturnType<typeof createCliApp> }) {
  const [state, dispatch] = useReducer(tuiReducer, initialState);
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === 'q' && state.screen === 'home') {
      exit();
    }
    if (key.escape && state.screen === 'home') {
      exit();
    }
  });

  const screenProps = { state, dispatch };

  return (
    <CliAppProvider app={app}>
      <Header />
      <ScreenRouter {...screenProps} />
      <KeyboardHints screen={state.screen} />
    </CliAppProvider>
  );
}

function ScreenRouter({
  state,
  dispatch,
}: {
  state: TuiState;
  dispatch: React.Dispatch<TuiAction>;
}) {
  switch (state.screen) {
    case 'home':
      return <HomeScreen dispatch={dispatch} />;
    case 'launch':
      return <LaunchScreen state={state} dispatch={dispatch} />;
    case 'plan':
      return <PlanScreen state={state} dispatch={dispatch} />;
    case 'status':
      return <StatusScreen dispatch={dispatch} />;
    case 'setup':
      return <SetupScreen dispatch={dispatch} />;
    case 'teardown':
      return <TeardownScreen dispatch={dispatch} />;
    case 'env':
      return <EnvScreen dispatch={dispatch} />;
    case 'preview':
      return <PreviewScreen dispatch={dispatch} />;
    case 'domain':
      return <DomainScreen dispatch={dispatch} />;
    case 'creds':
      return <CredsScreen dispatch={dispatch} />;
    case 'help':
      return <HelpScreen dispatch={dispatch} />;
  }
}

export async function startTui() {
  const app = createCliApp();
  const instance = render(<App app={app} />);
  await instance.waitUntilExit();
}
