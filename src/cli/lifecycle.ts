type Signal = NodeJS.Signals;

export interface CliShutdownManagerOptions {
  close: () => Promise<void>;
  exit?: (code: number) => void;
  onSignal?: (signal: Signal, listener: () => void | Promise<void>) => void;
  offSignal?: (signal: Signal, listener: () => void | Promise<void>) => void;
}

export interface CliShutdownManager {
  dispose(): void;
  shutdown(code?: number): Promise<void>;
}

export function createCliShutdownManager(options: CliShutdownManagerOptions): CliShutdownManager {
  const exit = options.exit ?? ((code) => process.exit(code));
  const onSignal = options.onSignal ?? process.on.bind(process);
  const offSignal = options.offSignal ?? process.off.bind(process);
  let shuttingDown = false;

  async function shutdown(code = 0): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await options.close();
      exit(code);
    } catch {
      exit(1);
    }
  }

  const handleSignal = () => {
    void shutdown(0);
  };
  const handleFatal = () => {
    void shutdown(1);
  };
  const signals: Signal[] = process.platform === 'win32'
    ? ['SIGINT', 'SIGTERM', 'SIGBREAK']
    : ['SIGINT', 'SIGTERM'];

  for (const signal of signals) {
    onSignal(signal, handleSignal);
  }
  process.once('uncaughtException', handleFatal);
  process.once('unhandledRejection', handleFatal);

  return {
    dispose() {
      for (const signal of signals) {
        offSignal(signal, handleSignal);
      }
      process.off('uncaughtException', handleFatal);
      process.off('unhandledRejection', handleFatal);
    },
    shutdown,
  };
}
