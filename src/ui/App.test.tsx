import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import { App } from './App';

test('renders the Time Tracker heading as primary content', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /time tracker/i })).toBeInTheDocument();
});
