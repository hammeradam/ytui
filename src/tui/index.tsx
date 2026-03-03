import React from 'react';
import { render } from 'ink';
import { App } from './App';

export function startTui(): void {
  render(<App />, { exitOnCtrlC: true });
}
