import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { AgentEventMonitor } from '../agent/agent-event-monitor.js';

export interface AgentEventMonitorRoutesOptions extends FastifyPluginOptions {
  monitor: AgentEventMonitor;
}

export async function agentEventMonitorRoutes(
  app: FastifyInstance,
  opts: AgentEventMonitorRoutesOptions,
): Promise<void> {
  app.get('/agent/event-monitor/status', async (_request, reply) => {
    try {
      return {
        success: true,
        data: opts.monitor.status(),
      };
    } catch {
      return reply.code(500).send({
        success: false,
        error: {
          code: FALLBACK_MONITOR_STATUS_ERROR_CODE,
          message: 'Agent event monitor status failed',
        },
      });
    }
  });

  app.post('/agent/event-monitor/tick', async (_request, reply) => {
    try {
      const result = await opts.monitor.runOnce('manual');
      return {
        success: true,
        data: result,
      };
    } catch {
      const lastErrorCode = safeMonitorLastErrorCode(opts.monitor);
      reply.code(502);
      return {
        success: false,
        error: {
          code: lastErrorCode,
          message: 'Agent event monitor tick failed',
        },
        data: {
          state: 'failed',
          reason: 'manual',
          lastErrorCode,
        },
      };
    }
  });

  app.post('/agent/event-monitor/start', async (_request, reply) => {
    try {
      opts.monitor.start();
      return {
        success: true,
        data: opts.monitor.status(),
      };
    } catch {
      return reply.code(502).send({
        success: false,
        error: {
          code: MONITOR_CONTROL_ERROR_CODE,
          message: 'Agent event monitor control failed',
        },
      });
    }
  });

  app.post('/agent/event-monitor/stop', async (_request, reply) => {
    try {
      opts.monitor.stop();
      return {
        success: true,
        data: opts.monitor.status(),
      };
    } catch {
      return reply.code(502).send({
        success: false,
        error: {
          code: MONITOR_CONTROL_ERROR_CODE,
          message: 'Agent event monitor control failed',
        },
      });
    }
  });
}

const FALLBACK_MONITOR_STATUS_ERROR_CODE = 'AGENT_EVENT_MONITOR_STATUS_FAILED';
const FALLBACK_MONITOR_ERROR_CODE = 'AGENT_EVENT_MONITOR_TICK_FAILED';
const MONITOR_CONTROL_ERROR_CODE = 'AGENT_EVENT_MONITOR_CONTROL_FAILED';
const SENSITIVE_ERROR_CODE_PARTS = [
  'ACCOUNT',
  'COOKIE',
  'FTK',
  'LTK',
  'ORDER',
  'RAW',
  'SECRET',
  'SESSION',
  'TOKEN',
  'UTK',
];

function safeMonitorLastErrorCode(monitor: AgentEventMonitor): string {
  try {
    return safeLastErrorCode(monitor.status().lastErrorCode);
  } catch {
    return FALLBACK_MONITOR_ERROR_CODE;
  }
}

function safeLastErrorCode(value: string | null): string {
  if (value === null) return FALLBACK_MONITOR_ERROR_CODE;
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,79}$/.test(normalized)) return FALLBACK_MONITOR_ERROR_CODE;
  if (SENSITIVE_ERROR_CODE_PARTS.some((part) => normalized.includes(part))) {
    return FALLBACK_MONITOR_ERROR_CODE;
  }
  return normalized;
}
