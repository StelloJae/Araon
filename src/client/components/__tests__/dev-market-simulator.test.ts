import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DevMarketSimulator } from '../DevMarketSimulator';

describe('DevMarketSimulator', () => {
  it('renders nothing outside dev builds or while dev mode is off', () => {
    const html = renderToStaticMarkup(
      createElement(DevMarketSimulator, { isAvailable: false, devModeEnabled: true }),
    );

    expect(html).toBe('');
    expect(
      renderToStaticMarkup(
        createElement(DevMarketSimulator, { isAvailable: true, devModeEnabled: false }),
      ),
    ).toBe('');
  });

  it('renders a clear simulated-market label when available', () => {
    const html = renderToStaticMarkup(
      createElement(DevMarketSimulator, { isAvailable: true, devModeEnabled: true }),
    );

    expect(html).toContain('SIMULATED MARKET');
    expect(html).toContain('개발 검증 전용');
    expect(html).toContain('한 틱 주입');
  });
});
