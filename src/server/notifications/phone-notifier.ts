export interface PhoneNotificationStatus {
  readonly configured: boolean;
  readonly provider: 'telegram';
  readonly mode: 'env';
}

export interface PhoneAlertInput {
  readonly ticker: string;
  readonly name: string;
  readonly title: string;
  readonly detail: string;
  readonly kind: 'fav-pct' | 'rule';
  readonly direction: 'up' | 'down';
  readonly changePct: number;
}

export interface PhoneNotifier {
  status(): PhoneNotificationStatus;
  sendAlert(input: PhoneAlertInput): Promise<{ sent: boolean; reason?: string }>;
  sendTest(): Promise<{ sent: boolean; reason?: string }>;
}

interface TelegramPhoneNotifierOptions {
  readonly token?: string;
  readonly chatId?: string;
  readonly fetchImpl?: typeof fetch;
}

const MAX_MESSAGE_LENGTH = 900;

export function createDisabledPhoneNotifier(): PhoneNotifier {
  return {
    status: () => ({ configured: false, provider: 'telegram', mode: 'env' }),
    sendAlert: async () => ({ sent: false, reason: 'not_configured' }),
    sendTest: async () => ({ sent: false, reason: 'not_configured' }),
  };
}

export function createTelegramPhoneNotifier(
  options: TelegramPhoneNotifierOptions = {},
): PhoneNotifier {
  const token =
    options.token ??
    process.env['ARAON_TELEGRAM_BOT_TOKEN'] ??
    process.env['TELEGRAM_BOT_TOKEN'] ??
    '';
  const chatId =
    options.chatId ??
    process.env['ARAON_TELEGRAM_CHAT_ID'] ??
    process.env['TELEGRAM_CHAT_ID'] ??
    '';
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  function configured(): boolean {
    return token.trim().length > 0 && chatId.trim().length > 0;
  }

  async function sendText(text: string): Promise<{ sent: boolean; reason?: string }> {
    if (!configured()) return { sent: false, reason: 'not_configured' };
    if (typeof fetchImpl !== 'function') {
      return { sent: false, reason: 'fetch_unavailable' };
    }
    const res = await fetchImpl(
      `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: clampText(text),
          disable_web_page_preview: true,
        }),
      },
    );
    if (!res.ok) return { sent: false, reason: `http_${res.status}` };
    return { sent: true };
  }

  return {
    status: () => ({
      configured: configured(),
      provider: 'telegram',
      mode: 'env',
    }),
    sendAlert: async (input) => sendText(formatAlert(input)),
    sendTest: async () =>
      sendText('Araon 폰 알림 테스트\n실시간/룰 알림이 이 Telegram 채팅으로 전달됩니다.'),
  };
}

function formatAlert(input: PhoneAlertInput): string {
  const direction = input.direction === 'up' ? '상향' : '하향';
  return [
    input.title,
    `${input.name} (${input.ticker}) · ${direction}`,
    input.detail,
  ].join('\n');
}

function clampText(text: string): string {
  const normalized = text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (normalized.length <= MAX_MESSAGE_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_MESSAGE_LENGTH - 1)}…`;
}
