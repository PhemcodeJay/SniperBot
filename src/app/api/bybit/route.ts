// app/api/bybit/route.ts
// Secure Bybit API proxy - Server-side credential handling for MAINNET ONLY

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { requestManager } from '@/lib/requestManager';
import {
  parseWalletBalance,
  parsePositionList,
  parseOrderResponse,
  parseTickers,
  parseTimeResponse,
} from '@/lib/validators';

const BYBIT_BASE_URL = 'https://api.bybit.com';
const API_KEY = process.env.BYBIT_API_KEY || '';
const API_SECRET = process.env.BYBIT_API_SECRET || '';
const API_AUTH_TOKEN = process.env.API_AUTH_TOKEN || '';

// Validate credentials exist
if (!API_KEY || !API_SECRET) {
  logger.warn('Bybit API', 'Missing API credentials in environment variables');
}

// Simple bearer token check to prevent unauthenticated access to the API proxy
function checkAuth(req: NextRequest): { authorized: boolean; reason?: string } {
  // If no auth token is configured, allow all requests (backward compatible)
  if (!API_AUTH_TOKEN) {
    return { authorized: true };
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (token !== API_AUTH_TOKEN) {
    return { authorized: false, reason: 'Unauthorized: missing or invalid API token' };
  }

  return { authorized: true };
}

async function createBybitSignature(
  timestamp: string,
  recvWindow: string,
  payload: string
): Promise<string> {
  const originString = `${timestamp}${API_KEY}${recvWindow}${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(API_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(originString));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function createBybitHeaders(payload: string = ''): Promise<Record<string, string>> {
  // Use a larger default recv window to tolerate small clock skew and
  // intermittent delays. We'll also attempt to sync the server time and
  // apply a cached offset so signatures use Bybit's clock.
  const recvWindow = process.env.BYBIT_RECV_WINDOW || '60000';
  const timestampMs = Math.round(Date.now() + (serverTimeOffsetMs || 0));
  const timestamp = timestampMs.toString();
  const signature = await createBybitSignature(timestamp, recvWindow, payload);

  return {
    'X-BAPI-API-KEY': API_KEY,
    'X-BAPI-TIMESTAMP': timestamp,
    'X-BAPI-SIGN': signature,
    'X-BAPI-RECV-WINDOW': recvWindow,
    'Content-Type': 'application/json',
  };
}

// Cache of server time offset (serverMs - localMs), refreshed periodically
let serverTimeOffsetMs: number | null = null;
let serverTimeCachedAt = 0;
// Lightweight counter for POST requests (in-memory, dev diagnostics only)
let bybitPostCount = 0;

async function ensureServerTimeSynced() {
  const now = Date.now();
  // Refresh cache every 60s
  if (serverTimeOffsetMs !== null && (now - serverTimeCachedAt) < 60000) return;

  try {
    const resp = await fetch(`${BYBIT_BASE_URL}/v5/market/time`);
    const data = await resp.json().catch(() => null);
    if (data && data.retCode === 0 && data.result) {
      // Bybit returns seconds and nanos; convert to ms
      const serverSeconds = parseInt(data.result.timeSecond || '0', 10) || 0;
      const serverMs = serverSeconds * 1000;
      serverTimeOffsetMs = serverMs - Date.now();
      serverTimeCachedAt = Date.now();
      logger.debug('Bybit API', 'Synced server time', { offsetMs: serverTimeOffsetMs });
    } else {
      serverTimeOffsetMs = 0;
      serverTimeCachedAt = Date.now();
    }
  } catch (e) {
    serverTimeOffsetMs = 0;
    serverTimeCachedAt = Date.now();
  }
}

// ============== WALLET BALANCE ==============
export async function POST(req: NextRequest) {
  try {
    // Check authentication if API_AUTH_TOKEN is configured
    const auth = checkAuth(req);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.reason },
        { status: 401 }
      );
    }

    bybitPostCount++;
    try { (globalThis as any).bybitPostCount = bybitPostCount; } catch (_) {}
    logger.info('Bybit API', 'POST request count', { count: bybitPostCount });
    let endpoint: string | null = null;
    let method = 'GET';
    let body: any = null;

    // Safely parse JSON body
    try {
      const payload = await req.json();
      endpoint = payload.endpoint;
      method = payload.method || 'GET';
      body = payload.body;
    } catch (parseError) {
      // If JSON parsing fails, try to get endpoint from query params
      const url = new URL(req.url);
      endpoint = url.searchParams.get('endpoint');
    }

    if (!endpoint) {
      return NextResponse.json(
        { error: 'Missing endpoint parameter' },
        { status: 400 }
      );
    }

    try {
      let url = `${BYBIT_BASE_URL}${endpoint}`;
      let signature_payload = '';
      let requestBody = body;
      let queryParams = '';

      // For position/list endpoint, ensure category and settleCoin are provided and included in signature
      if (endpoint.includes('position/list')) {
        queryParams = 'category=linear&settleCoin=USDT';
        url += (endpoint.includes('?') ? '&' : '?') + queryParams;
        signature_payload = queryParams;

      // For wallet-balance, Bybit requires accountType (e.g. UNIFIED)
      } else if (endpoint.includes('wallet-balance')) {
        queryParams = 'accountType=UNIFIED';
        url += (endpoint.includes('?') ? '&' : '?') + queryParams;
        signature_payload = queryParams;

      // For order realtime/history GET endpoints, ensure category is provided
      } else if (endpoint.includes('/v5/order') && method === 'GET') {
        // For order endpoints queried via GET, include category and settleCoin when appropriate
        queryParams = 'category=linear';
        if (endpoint.includes('realtime')) {
          queryParams += '&settleCoin=USDT';
        }
        url += (endpoint.includes('?') ? '&' : '?') + queryParams;
        signature_payload = queryParams;

      } else if (method === 'POST') {
        requestBody = body || {};
        signature_payload = JSON.stringify(requestBody);
      }
      
      // Ensure server time offset is fresh before signing requests
      await ensureServerTimeSynced();
      const headers = await createBybitHeaders(signature_payload);

      logger.debug('Bybit API', `${method} ${endpoint}`, { payload: signature_payload });

      const response = await requestManager.executeWithRateLimit(
        url,
        {
          method,
          headers,
          ...(method === 'POST' && { body: signature_payload }),
        }
      );

      logger.debug('Bybit API', 'Raw response', { response });

      // Check for API error response first
      if (response?.retCode !== 0 && response?.retCode !== undefined) {
        logger.warn('Bybit API', 'API returned error', { 
          retCode: response.retCode, 
          retMsg: response.retMsg,
          endpoint 
        });
        // Return error response as-is for debugging
        return NextResponse.json(response, { status: 400 });
      }

      // Validate response based on endpoint
      if (endpoint.includes('wallet-balance')) {
        const result = parseWalletBalance(response);
        if (!result.success) {
          logger.error('Bybit API', 'Invalid wallet balance response', { errors: result.error, response });
          return NextResponse.json(
            { error: 'Invalid API response format' },
            { status: 500 }
          );
        }
        return NextResponse.json(result.data);
      }

      if (endpoint.includes('position/list')) {
        const result = parsePositionList(response);
        if (!result.success) {
          logger.error('Bybit API', 'Invalid position list response', { errors: result.error, response });
          return NextResponse.json(
            { error: 'Invalid API response format' },
            { status: 500 }
          );
        }
        return NextResponse.json(result.data);
      }

      if (endpoint.includes('order/create')) {
        const result = parseOrderResponse(response);
        if (!result.success) {
          logger.error('Bybit API', 'Invalid order response', { errors: result.error, response });
          return NextResponse.json(
            { error: 'Invalid API response format' },
            { status: 500 }
          );
        }
        return NextResponse.json(result.data);
      }

      if (endpoint.includes('tickers')) {
        const result = parseTickers(response);
        if (!result.success) {
          logger.error('Bybit API', 'Invalid tickers response', { errors: result.error, response });
          return NextResponse.json(
            { error: 'Invalid API response format' },
            { status: 500 }
          );
        }
        return NextResponse.json(result.data);
      }

      if (endpoint.includes('market/time')) {
        const result = parseTimeResponse(response);
        if (!result.success) {
          return NextResponse.json(
            { error: 'Invalid API response format' },
            { status: 500 }
          );
        }
        return NextResponse.json(result.data);
      }

      return NextResponse.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Bybit API', `Failed to call ${endpoint}`, { error: message }, error as Error);

      return NextResponse.json(
        { error: message, endpoint },
        { status: 500 }
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Bybit API', 'Request processing failed', { error: message }, error as Error);

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

// GET wrapper
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get('endpoint');

  if (!endpoint) {
    return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
  }

  // Diagnostic: return in-memory POST count
  if (endpoint === 'stats') {
    return NextResponse.json({ count: bybitPostCount });
  }

  return POST(
    new NextRequest(req, {
      body: JSON.stringify({ endpoint, method: 'GET' }),
    })
  );
}
