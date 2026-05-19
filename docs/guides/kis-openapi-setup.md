# KIS OpenAPI Setup Guide

This guide is optional. Araon now starts with Toss-first market data and can be
used without KIS credentials. Follow this only if you want to enable the
low-latency KIS WebSocket realtime rail for Korean stocks.

The optional KIS rail uses a **live KIS OpenAPI app key and app secret** from
Korea Investment & Securities. Araon itself is read-only and does not place
orders, but the key is still personal. Do not paste it into GitHub issues,
screenshots, or shared documents.

Official links:

- [KIS Developers](https://apiportal.koreainvestment.com/)
- [KIS API service list](https://apiportal.koreainvestment.com/apiservice-apiservice)

The portal UI can change. If the labels below do not match exactly, use the KIS
Developers search box and look for `API신청`, `서비스 신청`, or `Open API`.

## Steps

1. Log in to [KIS Developers](https://apiportal.koreainvestment.com/).
2. Find the API/service application page.
3. Apply for the live OpenAPI service.
4. Copy the issued `App Key` and `App Secret`.
5. Paste them into Araon's Settings connection screen when enabling the optional
   KIS realtime rail.

Araon intentionally does not expose a paper-trading option in the public KIS
setup flow. Paper credentials can be more rate-limited and may behave
differently by endpoint, which makes the monitoring experience misleading.

## What Araon Uses

Araon is an observation dashboard. Toss is the primary path for market data and
account-aware read-only surfaces. The optional KIS rail is used for capped
WebSocket realtime ticks and selected fallback metadata/chart paths while the
legacy fallback remains isolated. KIS REST polling fallback is disabled by
default and only opens when `ARAON_KIS_POLLING_FALLBACK_ENABLED=1` is set and
Toss quote polling is disabled or repeatedly failing. It does not call order
APIs.

## After Setup

1. Add your first stock from search.
2. Favorite the names you monitor most.
3. Open a stock modal and check realtime, chart, news, and disclosures.
4. Open Settings once to find data health and emergency pause controls.

If a chart is empty, it usually means Araon has not collected enough local
candle data yet. Intraday candles are stored while Araon runs, and guarded
daily backfill runs outside market hours.

[한국어 가이드](kis-openapi-setup.ko.md)
