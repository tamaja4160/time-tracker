import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import { App } from './App';

test('renders the FocusLog heading as primary content', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /focuslog/i })).toBeInTheDocument();
});
