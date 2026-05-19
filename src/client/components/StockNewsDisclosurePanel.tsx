import { useEffect, useState } from 'react';
import type { StockDisclosureItem, StockNewsItem } from '@shared/types';
import {
  getStockDisclosures,
  getStockNews,
  refreshStockDisclosures,
  refreshStockNews,
} from '../lib/api-client';

interface StockNewsDisclosurePanelProps {
  ticker: string;
  name: string;
  mode?: 'combined' | 'news' | 'disclosures';
}

const FEED_PAGE_SIZE = 5;
const FEED_AUTO_REFRESH_MS = 30_000;
const EMPTY_PAGE = {
  limit: FEED_PAGE_SIZE,
  offset: 0,
  total: 0,
  hasNext: false,
  hasPrev: false,
};

export function StockNewsDisclosurePanel({
  ticker,
  name,
  mode = 'combined',
}: StockNewsDisclosurePanelProps) {
  const [items, setItems] = useState<StockNewsItem[]>([]);
  const [disclosures, setDisclosures] = useState<StockDisclosureItem[]>([]);
  const [newsPage, setNewsPage] = useState(EMPTY_PAGE);
  const [disclosurePage, setDisclosurePage] = useState(EMPTY_PAGE);
  const [newsOffset, setNewsOffset] = useState(0);
  const [disclosureOffset, setDisclosureOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [disclosureLoading, setDisclosureLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showNews = mode !== 'disclosures';
  const showDisclosures = mode !== 'news';
  const encodedName = encodeURIComponent(name);
  const fallbackLinks = [
    ...(showNews
      ? [
          {
            label: '네이버 금융 뉴스',
            href: `https://finance.naver.com/item/news.naver?code=${encodeURIComponent(ticker)}`,
          },
          {
            label: '네이버 금융 종목',
            href: `https://finance.naver.com/item/main.naver?code=${encodeURIComponent(ticker)}`,
          },
        ]
      : []),
    ...(showDisclosures
      ? [
          {
            label: 'DART 공시 검색',
            href: `https://dart.fss.or.kr/dsab007/main.do?option=corp&textCrpNm=${encodedName}`,
          },
          {
            label: 'KIND 공시',
            href: `https://kind.krx.co.kr/disclosure/disclosurebystocktype.do?method=searchDisclosureByStockTypeMain&searchCorpName=${encodedName}`,
          },
        ]
      : []),
  ];
  const showFallbackLinks =
    !loading &&
    !disclosureLoading &&
    error === null &&
    (!showNews || items.length === 0) &&
    (!showDisclosures || disclosures.length === 0);
  const title = mode === 'news'
    ? '관련 뉴스'
    : mode === 'disclosures'
      ? '관련 공시'
      : '관련 뉴스 · 공시';
  const refreshLabel = mode === 'news'
    ? '뉴스 갱신'
    : mode === 'disclosures'
      ? '공시 갱신'
      : '뉴스·공시 갱신';

  useEffect(() => {
    let cancelled = false;
    if (!showNews) {
      setItems([]);
      setNewsPage(EMPTY_PAGE);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError(null);
    void getStockNews(ticker, { limit: FEED_PAGE_SIZE, offset: newsOffset })
      .then((next) => {
        if (!cancelled) {
          setItems(next.items);
          setNewsPage(next.pagination);
        }
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
  }, [ticker, newsOffset, showNews]);

  useEffect(() => {
    let cancelled = false;
    if (!showDisclosures) {
      setDisclosures([]);
      setDisclosurePage(EMPTY_PAGE);
      setDisclosureLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setDisclosureLoading(true);
    void getStockDisclosures(ticker, { limit: FEED_PAGE_SIZE, offset: disclosureOffset })
      .then((next) => {
        if (!cancelled) {
          setDisclosures(next.items);
          setDisclosurePage(next.pagination);
        }
      })
      .catch(() => {
        if (!cancelled) setDisclosures([]);
      })
      .finally(() => {
        if (!cancelled) setDisclosureLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker, disclosureOffset, showDisclosures]);

  useEffect(() => {
    setNewsOffset(0);
    setDisclosureOffset(0);
  }, [ticker]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    const refresh = () => {
      if (!cancelled) void refreshFeed();
    };
    refresh();
    timer = window.setInterval(refresh, FEED_AUTO_REFRESH_MS);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [ticker, mode]);

  async function refreshFeed() {
    setRefreshing(true);
    setError(null);
    try {
      const [next, nextDisclosures] = await Promise.all([
        showNews ? refreshStockNews(ticker) : Promise.resolve(null),
        showDisclosures ? refreshStockDisclosures(ticker) : Promise.resolve(null),
      ]);
      if (next !== null) {
        setNewsOffset(0);
        setItems(next.items);
        setNewsPage(next.pagination);
      }
      if (nextDisclosures !== null) {
        setDisclosureOffset(0);
        setDisclosures(nextDisclosures.items);
        setDisclosurePage(nextDisclosures.pagination);
      }
    } catch {
      setError(`${title} 피드를 갱신하지 못했습니다.`);
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
          {title}
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
          {refreshing ? '갱신 중' : refreshLabel}
        </button>
      </div>
      {showNews && (
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
            <FeedState label="저장된 뉴스 피드가 없습니다. 자동 갱신 대기 중입니다." />
          ) : (
            items.map((item, idx) => (
              <NewsFeedItemLink key={item.id} item={item} first={idx === 0} />
            ))
          )}
          {items.length > 0 && (
            <PaginationBar
              page={newsPage}
              label="뉴스"
              onPrev={() => setNewsOffset(Math.max(0, newsPage.offset - newsPage.limit))}
              onNext={() => setNewsOffset(newsPage.offset + newsPage.limit)}
            />
          )}
        </div>
      )}
      {showDisclosures &&
        (disclosures.length > 0 || disclosureLoading || mode === 'disclosures') && (
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 10,
              marginBottom: 10,
              overflow: 'hidden',
              background: 'var(--bg-card)',
            }}
          >
            {disclosureLoading ? (
              <FeedState label="공시 항목을 불러오는 중" />
            ) : disclosures.length === 0 ? (
              <FeedState label="저장된 공시 항목이 없습니다. 자동 갱신 대기 중입니다." />
            ) : (
              disclosures.map((item, idx) => (
                <DisclosureItemLink key={item.id} item={item} first={idx === 0} />
              ))
            )}
            {disclosures.length > 0 && (
              <PaginationBar
                page={disclosurePage}
                label="공시"
                onPrev={() => setDisclosureOffset(Math.max(0, disclosurePage.offset - disclosurePage.limit))}
                onNext={() => setDisclosureOffset(disclosurePage.offset + disclosurePage.limit)}
              />
            )}
          </div>
        )}
      {showFallbackLinks && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          외부에서 확인:{' '}
          {fallbackLinks.map((link, idx) => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            style={{
              color: 'var(--text-secondary)',
              fontWeight: 700,
              textDecoration: 'underline',
              textUnderlineOffset: 2,
            }}
          >
            {idx > 0 ? ` · ${link.label}` : link.label}
          </a>
          ))}
        </div>
      )}
    </section>
  );
}

export function NewsFeedItemLink({
  item,
  first,
}: {
  item: StockNewsItem;
  first: boolean;
}) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      style={{
        display: 'block',
        padding: '10px 12px',
        borderTop: first ? 'none' : '1px solid var(--border-soft)',
        textDecoration: 'none',
        color: 'var(--text-primary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.45 }}>
          {item.title}
        </span>
        {item.isNew === true && (
          <span
            style={{
              border: '1px solid rgba(0, 194, 113, 0.28)',
              borderRadius: 999,
              padding: '2px 6px',
              color: 'var(--kr-up)',
              fontSize: 10,
              fontWeight: 800,
            }}
          >
            새 링크
          </span>
        )}
      </div>
      <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>
        {newsSourceLabel(item.source)} · {formatFeedTime(item.publishedAt ?? item.fetchedAt)}
      </div>
      {item.description !== null && item.description.trim().length > 0 && (
        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45 }}>
          {item.description}
        </div>
      )}
    </a>
  );
}

export function DisclosureItemLink({
  item,
  first,
}: {
  item: StockDisclosureItem;
  first: boolean;
}) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      style={{
        display: 'block',
        padding: '10px 12px',
        borderTop: first ? 'none' : '1px solid var(--border-soft)',
        textDecoration: 'none',
        color: 'var(--text-primary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.45 }}>
          {item.title}
        </span>
        <span
          style={{
            border: disclosureBadgeStyle(item.title).border,
            borderRadius: 999,
            padding: '2px 6px',
            color: disclosureBadgeStyle(item.title).color,
            fontSize: 10,
            fontWeight: 800,
          }}
        >
          {item.kind === 'filing' ? disclosureBadgeStyle(item.title).label : '검색'}
        </span>
      </div>
      <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>
        {disclosureSourceLabel(item.source)} · {formatFeedTime(item.publishedAt ?? item.fetchedAt)}
      </div>
    </a>
  );
}

function PaginationBar({
  page,
  label,
  onPrev,
  onNext,
}: {
  page: typeof EMPTY_PAGE;
  label: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  const from = page.total === 0 ? 0 : page.offset + 1;
  const to = Math.min(page.offset + page.limit, page.total);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '8px 10px',
        borderTop: '1px solid var(--border-soft)',
        fontSize: 11,
        color: 'var(--text-muted)',
      }}
    >
      <span>
        {label} {from}-{to} / {page.total}
      </span>
      <span style={{ display: 'flex', gap: 6 }}>
        <PageButton disabled={!page.hasPrev} onClick={onPrev}>이전</PageButton>
        <PageButton disabled={!page.hasNext} onClick={onNext}>다음</PageButton>
      </span>
    </div>
  );
}

function PageButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        height: 24,
        border: '1px solid var(--border)',
        borderRadius: 7,
        background: disabled ? 'var(--bg-muted)' : 'var(--bg-card)',
        color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
        fontSize: 10,
        fontWeight: 800,
        padding: '0 8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function newsSourceLabel(source: StockNewsItem['source']): string {
  switch (source) {
    case 'naver-finance':
      return '네이버 금융';
    case 'naver-search':
      return '네이버 뉴스 검색';
  }
}

function disclosureSourceLabel(source: StockDisclosureItem['source']): string {
  switch (source) {
    case 'dart':
      return 'DART';
    case 'kind':
      return 'KIND';
  }
}

function disclosureBadgeStyle(title: string): { label: string; color: string; border: string } {
  if (/주요사항|유상증자|무상증자|전환사채|신주인수권|합병|분할|영업양수|영업양도|소송|횡령|배임|상장폐지|관리종목/i.test(title)) {
    return {
      label: '주요 공시',
      color: 'var(--kr-down)',
      border: '1px solid rgba(246, 70, 93, 0.28)',
    };
  }
  if (/사업보고서|반기보고서|분기보고서|감사보고서/i.test(title)) {
    return {
      label: '정기',
      color: 'var(--text-secondary)',
      border: '1px solid var(--border)',
    };
  }
  return {
    label: '공시',
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
  };
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
