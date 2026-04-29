import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Header } from '../Header';
import { StatusBar } from '../StatusBar';

describe('settings entrypoint automation hooks', () => {
  it('exposes stable settings button test ids for header and status bar', () => {
    const header = renderToStaticMarkup(
      createElement(Header, {
        marketStatus: 'closed',
        view: 'all',
        onViewChange: vi.fn(),
        sseStatus: 'disconnected',
        lastUpdate: null,
        allStocks: [],
        onPickStock: vi.fn(),
        onOpenSettings: vi.fn(),
        notifEnabled: true,
        realtimeCount: 0,
        pollingCount: 0,
      }),
    );
    const statusBar = renderToStaticMarkup(
      createElement(StatusBar, {
        totalCount: 0,
        favCount: 0,
        pollingCount: 0,
        lastUpdate: '--:--:--',
        onOpenSettings: vi.fn(),
      }),
    );

    expect(header).toContain('data-testid="settings-button"');
    expect(statusBar).toContain('data-testid="statusbar-settings-button"');
  });
});
