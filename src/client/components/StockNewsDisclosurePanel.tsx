interface StockNewsDisclosurePanelProps {
  ticker: string;
  name: string;
}

export function StockNewsDisclosurePanel({
  ticker,
  name,
}: StockNewsDisclosurePanelProps) {
  const encodedName = encodeURIComponent(name);
  const links = [
    {
      label: '네이버 금융 뉴스',
      detail: '종목 뉴스와 시황 기사',
      href: `https://finance.naver.com/item/news.naver?code=${encodeURIComponent(ticker)}`,
    },
    {
      label: '네이버 금융 종목',
      detail: '종목 기본 정보와 토론 흐름',
      href: `https://finance.naver.com/item/main.naver?code=${encodeURIComponent(ticker)}`,
    },
    {
      label: 'DART 공시 검색',
      detail: '금감원 전자공시 검색',
      href: `https://dart.fss.or.kr/dsab007/main.do?option=corp&textCrpNm=${encodedName}`,
    },
    {
      label: 'KIND 공시',
      detail: 'KRX 상장공시 검색',
      href: `https://kind.krx.co.kr/disclosure/disclosurebystocktype.do?method=searchDisclosureByStockTypeMain&searchCorpName=${encodedName}`,
    },
  ];

  return (
    <section style={{ marginTop: 18 }} aria-label="관련 뉴스 공시">
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: 8,
        }}
      >
        관련 뉴스 · 공시
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        {links.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'block',
              textDecoration: 'none',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '11px 12px',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800 }}>{link.label}</div>
            <div
              style={{
                marginTop: 4,
                fontSize: 11,
                lineHeight: 1.45,
                color: 'var(--text-muted)',
              }}
            >
              {link.detail}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
