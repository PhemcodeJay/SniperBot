export const BYBIT_BASE_URL = 'https://api.bybit.com';
export const BYBIT_WS_URL = 'wss://stream.bybit.com/v5/public/linear';

const BYBIT_CREDENTIALS_KEY = 'bybit_credentials';

export interface BybitCredentials {
  apiKey: string;
  apiSecret: string;
  isTestnet: boolean;
}

export function getBybitCredentials(): BybitCredentials {
  // NOTE: Never use NEXT_PUBLIC_ prefix for secrets - they get bundled into client JS.
  // Server-side API calls should use process.env.BYBIT_API_KEY directly.
  // Client-side credentials can be entered via the Settings UI (stored in localStorage)
  // but this is NOT recommended for production. Use the server-side API proxy instead.

  if (typeof window === 'undefined') {
    // Server-side: use server-only env vars (not NEXT_PUBLIC_)
    return {
      apiKey: process.env.BYBIT_API_KEY || '',
      apiSecret: process.env.BYBIT_API_SECRET || '',
      isTestnet: false,
    };
  }

  // Client-side: only use credentials saved via Settings UI (localStorage)
  // NEVER fall back to NEXT_PUBLIC_ env vars as they'd be in the JS bundle
  try {
    const saved = window.localStorage.getItem(BYBIT_CREDENTIALS_KEY);
    if (!saved) {
      return { apiKey: '', apiSecret: '', isTestnet: false };
    }

    const parsed = JSON.parse(saved);
    return {
      apiKey: parsed?.apiKey || '',
      apiSecret: parsed?.apiSecret || '',
      isTestnet: Boolean(parsed?.isTestnet),
    };
  } catch {
    return { apiKey: '', apiSecret: '', isTestnet: false };
  }
}

function normalizeSignaturePayload(payload: string | Record<string, unknown> | undefined): string {
  if (typeof payload === 'string') return payload;
  if (!payload) return '';
  return JSON.stringify(payload);
}

export async function createBybitSignature(
  apiKey: string,
  apiSecret: string,
  timestamp: string,
  recvWindow: string,
  payload: string | Record<string, unknown> | undefined
): Promise<string> {
  const encoder = new TextEncoder();
  const payloadString = normalizeSignaturePayload(payload);
  const originString = `${timestamp}${apiKey}${recvWindow}${payloadString}`;
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(originString));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function createBybitAuthHeaders(
  apiKey: string,
  apiSecret: string,
  payload: string | Record<string, unknown> = '',
  recvWindow: string = '5000'
) {
  const timestamp = Date.now().toString();
  const signature = await createBybitSignature(apiKey, apiSecret, timestamp, recvWindow, payload);

  return {
    'X-BAPI-API-KEY': apiKey,
    'X-BAPI-TIMESTAMP': timestamp,
    'X-BAPI-SIGN': signature,
    'X-BAPI-RECV-WINDOW': recvWindow,
  };
}

export interface BybitWalletBalance {
  totalEquity: number;
  availableBalance: number;
  walletBalance: number;
}

export interface BybitInstrumentInfo {
  minOrderQty: number;
  qtyStep: number;
}

export async function fetchBybitInstrumentInfo(
  symbol: string
): Promise<BybitInstrumentInfo | null> {
  try {
    const response = await fetch(
      `${BYBIT_BASE_URL}/v5/market/instruments-info?category=linear&symbol=${encodeURIComponent(symbol)}`
    );
    const data = await safeJsonParse(response);
    const info = data?.result?.list?.[0];
    if (!info) return null;

    const lot =
      info.lotSizeFilter || info.lot_size_filter || info.sizeFilter || info.size_filter || {};
    const minOrderQty = parseFloat(lot.minOrderQty || lot.min_qty || lot.min || '0') || 0;
    const qtyStep = parseFloat(lot.qtyStep || lot.stepSize || lot.qty_step || lot.step || '0') || 0;

    return { minOrderQty, qtyStep };
  } catch (error) {
    console.warn('fetchBybitInstrumentInfo failed', { symbol, error });
    return null;
  }
}

export async function normalizeBybitQty(symbol: string, qty: number): Promise<number> {
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  const instrument = await fetchBybitInstrumentInfo(symbol);
  if (!instrument) return parseFloat(qty.toFixed(8));

  const { minOrderQty, qtyStep } = instrument;
  let normalizedQty = qty;

  if (qtyStep > 0) {
    normalizedQty = Math.floor(qty / qtyStep) * qtyStep;
    if (normalizedQty < qtyStep) normalizedQty = qtyStep;
  }

  if (minOrderQty > 0 && normalizedQty < minOrderQty) {
    normalizedQty = minOrderQty;
  }

  if (!Number.isFinite(normalizedQty) || normalizedQty <= 0) return 0;
  return parseFloat(normalizedQty.toFixed(8));
}

export async function fetchBybitWalletBalance(
  apiKey?: string,
  apiSecret?: string
): Promise<BybitWalletBalance> {
  const credentials =
    apiKey && apiSecret ? { apiKey, apiSecret, isTestnet: false } : getBybitCredentials();

  if (!credentials.apiKey || !credentials.apiSecret) {
    return { totalEquity: 0, availableBalance: 0, walletBalance: 0 };
  }

  const recvWindow = '5000';
  const params = 'accountType=UNIFIED';
  const headers = await createBybitAuthHeaders(
    credentials.apiKey,
    credentials.apiSecret,
    params,
    recvWindow
  );

  const response = await fetch(`${BYBIT_BASE_URL}/v5/account/wallet-balance?${params}`, {
    method: 'GET',
    headers,
  });

  const data = await safeJsonParse(response);
  const wallet = data?.result?.list?.[0] || data?.result || {};
  const totalEquity = parseFloat(
    wallet?.totalEquity ?? wallet?.equity ?? wallet?.walletBalance ?? '0'
  );
  const availableBalance = parseFloat(
    wallet?.availableBalance ?? wallet?.available ?? wallet?.walletBalance ?? '0'
  );

  return {
    totalEquity: Number.isFinite(totalEquity) ? totalEquity : 0,
    availableBalance: Number.isFinite(availableBalance) ? availableBalance : 0,
    walletBalance: Number.isFinite(totalEquity) ? totalEquity : 0,
  };
}

export async function placeBybitOrder(options: {
  symbol: string;
  side: 'LONG' | 'SHORT';
  qty: number;
  leverage?: number;
  positionIdx?: number;
  apiKey?: string;
  apiSecret?: string;
  stopLoss?: number;
  takeProfit?: number;
}) {
  const { symbol, side, qty, leverage = 5, positionIdx, apiKey, apiSecret } = options;
  const credentials =
    apiKey && apiSecret ? { apiKey, apiSecret, isTestnet: false } : getBybitCredentials();

  if (!credentials.apiKey || !credentials.apiSecret) {
    throw new Error('Live trading credentials are not configured. Add them in Settings first.');
  }

  const recvWindow = '5000';
  const orderSide = side === 'LONG' ? 'Buy' : 'Sell';

  const leverageBody = {
    category: 'linear',
    symbol,
    buyLeverage: leverage.toString(),
    sellLeverage: leverage.toString(),
  };
  const leverageHeaders = await createBybitAuthHeaders(
    credentials.apiKey,
    credentials.apiSecret,
    leverageBody,
    recvWindow
  );
  await fetch(`${BYBIT_BASE_URL}/v5/position/set-leverage`, {
    method: 'POST',
    headers: {
      ...leverageHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(leverageBody),
  });

  const normalizedQty = await normalizeBybitQty(symbol, qty);
  if (!Number.isFinite(normalizedQty) || normalizedQty <= 0) {
    return {
      success: false,
      error: 'Invalid order quantity after Bybit round-off. Adjust order size or symbol settings.',
    };
  }

  const orderBody: Record<string, string | number | undefined> = {
    category: 'linear',
    symbol,
    side: orderSide,
    orderType: 'Market',
    qty: normalizedQty.toString(),
    timeInForce: 'GTC',
    accountType: 'UNIFIED',
    ...(typeof positionIdx === 'number' ? { positionIdx } : {}),
  };
  // Include TP/SL when provided
  if (typeof options.stopLoss === 'number' && !isNaN(options.stopLoss)) {
    orderBody.stopLoss = options.stopLoss.toString();
    orderBody.tpSlMode = 'Full';
  }
  if (typeof options.takeProfit === 'number' && !isNaN(options.takeProfit)) {
    orderBody.takeProfit = options.takeProfit.toString();
    orderBody.tpSlMode = 'Full';
  }
  const orderHeaders = await createBybitAuthHeaders(
    credentials.apiKey,
    credentials.apiSecret,
    orderBody,
    recvWindow
  );
  const orderResponse = await fetch(`${BYBIT_BASE_URL}/v5/order/create`, {
    method: 'POST',
    headers: {
      ...orderHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(orderBody),
  });

  const orderData = await safeJsonParse(orderResponse);
  if (orderData?.retCode !== 0) {
    return {
      success: false,
      error: orderData?.retMsg || 'Bybit rejected the order',
    };
  }

  return {
    success: true,
    orderId: orderData?.result?.orderId,
  };
}

export async function closeBybitPosition(
  symbol: string,
  side: 'LONG' | 'SHORT',
  size: number,
  positionIdx?: number,
  apiKey?: string,
  apiSecret?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const credentials =
      apiKey && apiSecret ? { apiKey, apiSecret, isTestnet: false } : getBybitCredentials();

    if (!credentials.apiKey || !credentials.apiSecret) {
      return { success: false, error: 'Live trading credentials are not configured.' };
    }

    const recvWindow = '5000';
    const closeSide = side === 'LONG' ? 'Sell' : 'Buy';
    const params = `category=linear&symbol=${symbol}&side=${closeSide}&orderType=Market&qty=${size}&timeInForce=GTC&positionIdx=${positionIdx || 0}`;
    const headers = await createBybitAuthHeaders(
      credentials.apiKey,
      credentials.apiSecret,
      params,
      recvWindow
    );

    const response = await fetch(`${BYBIT_BASE_URL}/v5/order/create`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        category: 'linear',
        symbol,
        side: closeSide,
        orderType: 'Market',
        qty: size.toString(),
        timeInForce: 'GTC',
        positionIdx: positionIdx || 0,
      }),
    });

    const data = await safeJsonParse(response);
    if (data?.retCode !== 0) {
      return {
        success: false,
        error: data?.retMsg || 'Bybit rejected the close order',
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to close position',
    };
  }
}

export async function safeJsonParse(response: Response) {
  try {
    const text = await response.text();
    if (!text || text.trim() === '') return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function buildBybitUrl(path: string, params?: string) {
  if (!params) return `${BYBIT_BASE_URL}${path}`;
  const separator = path.includes('?') ? '&' : '?';
  return `${BYBIT_BASE_URL}${path}${separator}${params}`;
}
