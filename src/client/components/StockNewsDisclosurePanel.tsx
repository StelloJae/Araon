import { useEffect, useState } from 'react';
import type { StockNewsItem } from '@shared/types';
import { getStockNews, refreshStockNews } from '../lib/api-client';

interface StockNewsDisclosurePanelProps {
  ticker: string;
  name: string;
}

export function StockNewsDisclosurePanel({
  ticker,
  name,
}: StockNewsDisclosurePanelProps) {
  const [items, setItems] = useState<StockNewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getStockNews(ticker)
      .then((next) => {
        if (!cancelled) setItems(next);
      })
      .catch(() => {
        if (!cancelled) setError('뉴스 피드를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  async function refreshFeed() {
    setRefreshing(true);
    setError(null);
    try {
      setItems(await refreshStockNews(ticker));
    } catch {
      setError('뉴스 피드를 갱신하지 못했습니다.');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section style={{ marginTop: 18 }} aria-label="관련 뉴스 공시">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}
        >
          관련 뉴스 · 공시
        </div>
        <button
          type="button"
          onClick={() => void refreshFeed()}
          disabled={refreshing}
          style={{
            height: 28,
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: refreshing ? 'var(--bg-muted)' : '#F0B90B',
            color: refreshing ? 'var(--text-muted)' : '#1E2026',
            fontSize: 11,
            fontWeight: 800,
            padding: '0 10px',
            cursor: refreshing ? 'not-allowed' : 'pointer',
          }}
        >
          {refreshing ? '갱신 중' : '뉴스 피드 갱신'}
        </button>
      </div>
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 10,
          marginBottom: 10,
          overflow: 'hidden',
          background: 'var(--bg-card)',
        }}
      >
        {error !== null ? (
          <FeedState label={error} danger />
        ) : loading ? (
          <FeedState label="뉴스 피드를 불러오는 중" />
        ) : items.length === 0 ? (
          <FeedState label="저장된 뉴스 피드가 없습니다. 필요할 때 갱신해 주세요." />
        ) : (
          items.map((item, idx) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'block',
                padding: '10px 12px',
                borderTop: idx === 0 ? 'none' : '1px solid var(--border-soft)',
                textDecoration: 'none',
                color: 'var(--text-primary)',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.45 }}>
                {item.title}
              </div>
              <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                네이버 금융 · {formatFeedTime(item.publishedAt ?? item.fetchedAt)}
              </div>
            </a>
          ))
        )}
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

function FeedState({ label, danger = false }: { label: string; danger?: boolean }) {
  return (
    <div
      style={{
        padding: '15px 12px',
        textAlign: 'center',
        color: danger ? 'var(--kr-down)' : 'var(--text-muted)',
        fontSize: 12,
        fontWeight: danger ? 700 : 500,
      }}
    >
      {label}
    </div>
  );
}

function formatFeedTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
