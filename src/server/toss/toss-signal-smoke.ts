import {
  tossSignalSourceForEndpoint,
  type TossSignalClient,
  type TossSignalEndpointPath,
  type TossSignalSource,
} from './toss-signal-client.js';

export interface TossSignalSmokeProbe {
  readonly ticker: string;
  readonly name: string;
}

export interface TossSignalSmokeOptions {
  readonly requestBodyConfigured: boolean;
  readonly client?: Pick<TossSignalClient, 'refresh'>;
  readonly probe: TossSignalSmokeProbe;
  readonly endpointPath?: TossSignalEndpointPath;
  readonly now?: () => Date;
}

export interface TossSignalSmokeContract {
  readonly bodyContract: 'capture_required' | 'configured';
  readonly externalCallsEnabled: boolean;
  readonly rawTemplateExposed: false;
}

export interface TossSignalSmokeSurface {
  readonly id: TossSignalSource;
  readonly endpointPath: TossSignalEndpointPath;
  readonly status: 'ok' | 'skipped' | 'failed';
  readonly counts?: {
    readonly items: number;
  };
  readonly semanticState?: 'non_empty' | 'supported_empty';
  readonly errorCode?: 'TOSS_SIGNAL_TEMPLATE_REQUIRED' | 'TOSS_SIGNAL_SMOKE_FAILED';
}

const DEFAULT_ENDPOINT_PATH: TossSignalEndpointPath =
  '/api/v2/dashboard/wts/overview/signals';

export interface TossSignalSmokeReport {
  readonly provider: 'toss';
  readonly generatedAt: string;
  readonly outcome: 'ok' | 'template_required' | 'failed';
  readonly contract: TossSignalSmokeContract;
  readonly probe: TossSignalSmokeProbe;
  readonly surface: TossSignalSmokeSurface;
}

export async function runTossSignalSmoke(
  options: TossSignalSmokeOptions,
): Promise<TossSignalSmokeReport> {
  const now = options.now ?? (() => new Date());
  const generatedAt = now().toISOString();
  const contract = signalContract(options.requestBodyConfigured);
  const endpointPath = options.endpointPath ?? DEFAULT_ENDPOINT_PATH;
  const surfaceId = tossSignalSourceForEndpoint(endpointPath);

  if (!options.requestBodyConfigured || options.client === undefined) {
    return {
      provider: 'toss',
      generatedAt,
      outcome: 'template_required',
      contract,
      probe: options.probe,
      surface: {
        id: surfaceId,
        endpointPath,
        status: 'skipped',
        errorCode: 'TOSS_SIGNAL_TEMPLATE_REQUIRED',
      },
    };
  }

  try {
    const items = await options.client.refresh({
      ticker: options.probe.ticker,
      name: options.probe.name,
      now: now(),
    });
    return {
      provider: 'toss',
      generatedAt,
      outcome: 'ok',
      contract,
      probe: options.probe,
      surface: {
        id: surfaceId,
        endpointPath,
        status: 'ok',
        counts: {
          items: items.length,
        },
        semanticState: items.length > 0 ? 'non_empty' : 'supported_empty',
      },
    };
  } catch {
    return {
      provider: 'toss',
      generatedAt,
      outcome: 'failed',
      contract,
      probe: options.probe,
      surface: {
        id: surfaceId,
        endpointPath,
        status: 'failed',
        errorCode: 'TOSS_SIGNAL_SMOKE_FAILED',
      },
    };
  }
}

function signalContract(configured: boolean): TossSignalSmokeContract {
  return {
    bodyContract: configured ? 'configured' : 'capture_required',
    externalCallsEnabled: configured,
    rawTemplateExposed: false,
  };
}
