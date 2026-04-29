/**
 * Static theme catalog for the Korean Stock Watchlist Dashboard.
 *
 * This module is a pure data file — no database access, no runtime mutation.
 * To swap in a remote theme source, replace this module's exports without
 * touching any route handler.
 *
 * All tickers are 6-digit KRX codes. Names marked `// TODO: verify name`
 * indicate tickers where the display name could not be confirmed with
 * certainty and should be validated against the KIS ticker master before
 * a production release.
 */

import type { Stock } from '@shared/types.js';

export interface ThemeDefinition {
  id: string;
  name: string;
  description?: string;
  stocks: Stock[];
}

// === Theme data ===============================================================

const semiconductor: ThemeDefinition = {
  id: 'semiconductor',
  name: '반도체',
  description: '메모리·파운드리·후공정·소재·장비 관련 종목',
  stocks: [
    { ticker: '005930', name: '삼성전자', market: 'KOSPI' },
    { ticker: '000660', name: 'SK하이닉스', market: 'KOSPI' },
    { ticker: '058470', name: '리노공업', market: 'KOSDAQ' },
    { ticker: '108320', name: 'LX세미콘', market: 'KOSPI' },
    { ticker: '383310', name: 'SFA반도체', market: 'KOSPI' },
    { ticker: '042700', name: '한미반도체', market: 'KOSPI' },
    { ticker: '240810', name: '원익IPS', market: 'KOSDAQ' },
    { ticker: '000990', name: 'DB하이텍', market: 'KOSPI' },
    { ticker: '093320', name: '코미코', market: 'KOSDAQ' },
    { ticker: '036830', name: '솔브레인홀딩스', market: 'KOSDAQ' }, // TODO: verify name
    { ticker: '036490', name: 'SK머티리얼즈', market: 'KOSPI' }, // TODO: verify name
    { ticker: '286940', name: 'SK아이이테크놀로지', market: 'KOSPI' }, // TODO: verify name
  ],
};

const battery: ThemeDefinition = {
  id: 'battery',
  name: '2차전지',
  description: '배터리 셀·소재·장비 및 전기차 밸류체인 관련 종목',
  stocks: [
    { ticker: '373220', name: 'LG에너지솔루션', market: 'KOSPI' },
    { ticker: '006400', name: '삼성SDI', market: 'KOSPI' },
    { ticker: '051910', name: 'LG화학', market: 'KOSPI' },
    { ticker: '247540', name: '에코프로비엠', market: 'KOSDAQ' },
    { ticker: '086520', name: '에코프로', market: 'KOSDAQ' },
    { ticker: '096770', name: 'SK이노베이션', market: 'KOSPI' },
    { ticker: '066970', name: '엘앤에프', market: 'KOSDAQ' },
    { ticker: '003670', name: '포스코퓨처엠', market: 'KOSPI' },
    { ticker: '278280', name: '천보', market: 'KOSDAQ' },
    { ticker: '357780', name: '솔루스첨단소재', market: 'KOSPI' }, // TODO: verify name
    { ticker: '228820', name: '비나텍', market: 'KOSDAQ' }, // TODO: verify name
    { ticker: '196490', name: '에이프로', market: 'KOSDAQ' }, // TODO: verify name
  ],
};

const aiSoftware: ThemeDefinition = {
  id: 'ai-software',
  name: 'AI/소프트웨어',
  description: 'AI·플랫폼·클라우드·게임 소프트웨어 관련 종목',
  stocks: [
    { ticker: '035420', name: 'NAVER', market: 'KOSPI' },
    { ticker: '035720', name: '카카오', market: 'KOSPI' },
    { ticker: '376300', name: '디어유', market: 'KOSDAQ' },
    { ticker: '377300', name: '카카오페이', market: 'KOSPI' },
    { ticker: '293490', name: '카카오게임즈', market: 'KOSDAQ' },
    { ticker: '181710', name: 'NHN', market: 'KOSPI' },
    { ticker: '259960', name: '크래프톤', market: 'KOSPI' },
    { ticker: '036570', name: '엔씨소프트', market: 'KOSPI' },
    { ticker: '251270', name: '넷마블', market: 'KOSPI' },
    { ticker: '263750', name: '펄어비스', market: 'KOSDAQ' },
    { ticker: '131970', name: '테스나', market: 'KOSDAQ' }, // TODO: verify name
    { ticker: '060590', name: '씨아이에스', market: 'KOSDAQ' }, // TODO: verify name
  ],
};

const bio: ThemeDefinition = {
  id: 'bio',
  name: '바이오',
  description: '바이오·제약·의료기기·헬스케어 관련 종목',
  stocks: [
    { ticker: '207940', name: '삼성바이오로직스', market: 'KOSPI' },
    { ticker: '068270', name: '셀트리온', market: 'KOSPI' },
    { ticker: '196170', name: '알테오젠', market: 'KOSDAQ' },
    { ticker: '091990', name: '셀트리온헬스케어', market: 'KOSPI' },
    { ticker: '214150', name: '클래시스', market: 'KOSDAQ' },
    { ticker: '145020', name: '휴젤', market: 'KOSDAQ' },
    { ticker: '326030', name: 'SK바이오팜', market: 'KOSPI' },
    { ticker: '128940', name: '한미약품', market: 'KOSPI' },
    { ticker: '185750', name: '종근당', market: 'KOSPI' },
    { ticker: '000100', name: '유한양행', market: 'KOSPI' },
    { ticker: '293480', name: '에이비엘바이오', market: 'KOSDAQ' }, // TODO: verify name
    { ticker: '214430', name: '아이센스', market: 'KOSDAQ' }, // TODO: verify name
  ],
};

const finance: ThemeDefinition = {
  id: 'finance',
  name: '금융',
  description: '은행·보험·증권·금융지주 관련 종목',
  stocks: [
    { ticker: '105560', name: 'KB금융', market: 'KOSPI' },
    { ticker: '055550', name: '신한지주', market: 'KOSPI' },
    { ticker: '086790', name: '하나금융지주', market: 'KOSPI' },
    { ticker: '316140', name: '우리금융지주', market: 'KOSPI' },
    { ticker: '024110', name: '기업은행', market: 'KOSPI' },
    { ticker: '138930', name: 'BNK금융지주', market: 'KOSPI' },
    { ticker: '029780', name: '삼성카드', market: 'KOSPI' },
    { ticker: '139130', name: 'DGB금융지주', market: 'KOSPI' },
    { ticker: '071050', name: '한국금융지주', market: 'KOSPI' },
    { ticker: '032830', name: '삼성생명', market: 'KOSPI' },
    { ticker: '000810', name: '삼성화재', market: 'KOSPI' },
    { ticker: '005830', name: 'DB손해보험', market: 'KOSPI' },
  ],
};

// === Public exports ===========================================================

export const themes: ThemeDefinition[] = [
  semiconductor,
  battery,
  aiSoftware,
  bio,
  finance,
];

export function getThemeById(id: string): ThemeDefinition | undefined {
  return themes.find((t) => t.id === id);
}
