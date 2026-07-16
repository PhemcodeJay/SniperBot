// app/api/bybit/orders/route.ts
// Order execution API - Auto-execute trades on Bybit MAINNET

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { requestManager } from '@/lib/requestManager';
import { parseOrderResponse } from '@/lib/validators';

const BYBIT_BASE_URL = 'https://api.bybit.com';
const API_KEY = process.env.BYBIT_API_KEY || '';
const API_SECRET = process.env.BYBIT_API_SECRET || '';
const MAX_POSITION_SIZE = parseFloat(process.env.MAX_POSITION_SIZE_USDT || '10000');
const MAX_DAILY_LOSS_PCT = parseFloat(process.env.MAX_DAILY_LOSS_PCT || '5');

interface ExecuteOrderRequest {
  symbol: string;
  side: 'Buy' | 'Sell';
  orderType: 'Market' | 'Limit';
  qty: string;
  price?: string;
  stopLoss?: string;
  takeProfit?: string;
  leverage?: number;
  timeInForce?: string;
  positionIdx?: number;
  signalId?: string;
  confidence?: number;
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

async function createBybitHeaders(payload: string): Promise<Record<string, string>> {
  const timestamp = Date.now().toString();
  const recvWindow = '5000';
  const signature = await createBybitSignature(timestamp, recvWindow, payload);

  return {
    'X-BAPI-API-KEY': API_KEY,
    'X-BAPI-TIMESTAMP': timestamp,
    'X-BAPI-SIGN': signature,
    'X-BAPI-RECV-WINDOW': recvWindow,
    'Content-Type': 'application/json',
  };
}

// Risk check function
async function validateRiskLimits(
  symbol: string,
  qty: number,
  side: string,
  orderType: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Check position size
    const url = `${BYBIT_BASE_URL}/v5/position/list?category=linear`;
    const positionHeaders = await createBybitHeaders('');
    const positionResponse = await requestManager.executeWithRateLimit(
      url,
      {
        method: 'GET',
        headers: positionHeaders,
      }
    );

    if (
      positionResponse.retCode === 0 &&
      positionResponse.result?.list
    ) {
      const existingPosition = positionResponse.result.list.find(
        (p: any) => p.symbol === symbol && p.side !== 'None'
      );

      const totalSize = (existingPosition?.size || 0) + qty;
      if (totalSize > MAX_POSITION_SIZE) {
        return { allowed: false, reason: `Position size ${totalSize} exceeds max ${MAX_POSITION_SIZE}` };
      }
    }

    // Check daily loss
    // TODO: Implement daily P&L tracking

    return { allowed: true };
  } catch (error) {
    logger.error('Risk Check', 'Failed to validate risk limits', { error });
    return { allowed: false, reason: 'Risk validation failed' };
  }
}

async function fetchInstrumentInfo(symbol: string) {
  try {
    const url = `${BYBIT_BASE_URL}/v5/market/instruments-info?category=linear&symbol=${encodeURIComponent(symbol)}`;
    const resp = await requestManager.executeWithRateLimit(url, { method: 'GET' });
    if (resp?.retCode !== 0) return null;
    const info = resp.result?.list?.[0];
    if (!info) return null;

    // Try multiple possible filter shapes
    const lot = info.lotSizeFilter || info.lot_size_filter || info.sizeFilter || info.size_filter || {};
    const minOrderQty = parseFloat(lot.minOrderQty || lot.min_qty || lot.min || '0') || 0;
    const qtyStep = parseFloat(lot.qtyStep || lot.stepSize || lot.qty_step || lot.step || '0') || 0;

    return { minOrderQty, qtyStep };
  } catch (error) {
    logger.warn('AutoExecute', 'Failed to fetch instrument info', { symbol, error });
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: ExecuteOrderRequest = await req.json();

    const {
      symbol,
      side,
      orderType,
      qty,
      price,
      stopLoss,
      takeProfit,
      leverage = 5,
      timeInForce = 'GTC',
      positionIdx = 0,
      signalId,
      confidence = 0.8,
    } = body;

    // Validate required fields
    if (!symbol || !side || !orderType || !qty) {
      return NextResponse.json(
        { error: 'Missing required fields: symbol, side, orderType, qty' },
        { status: 400 }
      );
    }

    // Check confidence threshold
    const minConfidence = parseFloat(process.env.AUTO_EXECUTE_MIN_CONFIDENCE || '0.8');
    if (confidence < minConfidence) {
      logger.warn(
        'AutoExecute',
        `Signal confidence ${confidence} below minimum ${minConfidence}`,
        { signalId }
      );
      return NextResponse.json(
        { error: `Confidence ${confidence} below minimum ${minConfidence}` },
        { status: 400 }
      );
    }

    // Ensure quantity meets exchange minimums/step for the symbol
    const instrument = await fetchInstrumentInfo(symbol);
    let numericQty = parseFloat(qty as any);
    if (instrument && !isNaN(numericQty)) {
      const { minOrderQty, qtyStep } = instrument;
      if (minOrderQty && numericQty < minOrderQty) {
        // Round up to minimum or step
        if (qtyStep && qtyStep > 0) {
          numericQty = Math.ceil(minOrderQty / qtyStep) * qtyStep;
        } else {
          numericQty = minOrderQty;
        }
        logger.info('AutoExecute', 'Adjusted order qty to meet exchange minimums', { symbol, adjustedQty: numericQty });
      }
    }

    // Validate risk limits with possibly adjusted qty
    const riskCheck = await validateRiskLimits(symbol, numericQty, side, orderType);
    if (!riskCheck.allowed) {
      logger.warn('AutoExecute', `Risk check failed: ${riskCheck.reason}`, { symbol, qty });
      return NextResponse.json(
        { error: riskCheck.reason },
        { status: 400 }
      );
    }

    // Build order payload
    const orderPayload: any = {
      category: 'linear',
      symbol,
      side,
      orderType,
      qty: numericQty.toString(),
      timeInForce,
      positionIdx,
      leverage: leverage.toString(),
      ...(price && { price }),
    };

    // Add stop loss if provided
    if (stopLoss) {
      orderPayload.stopLoss = stopLoss;
      orderPayload.tpSlMode = 'Full'; // Full TP/SL mode
    }

    // Add take profit if provided
    if (takeProfit) {
      orderPayload.takeProfit = takeProfit;
      orderPayload.tpSlMode = 'Full';
    }

    const payloadString = JSON.stringify(orderPayload);
    const headers = await createBybitHeaders(payloadString);

    logger.info('AutoExecute', `Executing ${side} order for ${symbol}`, {
      qty,
      orderType,
      confidence,
      signalId,
    });

    // Execute order on MAINNET
    const response = await requestManager.executeWithRateLimit(
      `${BYBIT_BASE_URL}/v5/order/create`,
      {
        method: 'POST',
        headers,
        body: payloadString,
      }
    );

    logger.debug('AutoExecute', 'Raw order response from Bybit', { response });

    // If Bybit returned an error code, forward it to the caller for visibility
    if (response?.retCode !== undefined && response.retCode !== 0) {
      logger.warn('AutoExecute', 'Bybit rejected order', { retCode: response.retCode, retMsg: response.retMsg, symbol });
      return NextResponse.json(response, { status: 400 });
    }

    // Validate response schema
    const validation = parseOrderResponse(response);
    if (!validation.success) {
      logger.error('AutoExecute', 'Invalid order response format', { symbol, signalId, errors: validation.error });
      return NextResponse.json({ error: 'Invalid response from Bybit', details: validation.error }, { status: 500 });
    }

    logger.info('AutoExecute', 'Order executed successfully', {
      orderId: validation.data.result.orderId,
      symbol,
      side,
      qty,
      signalId,
      confidence,
    });

    return NextResponse.json({
      success: true,
      orderId: validation.data.result.orderId,
      orderLinkId: validation.data.result.orderLinkId,
      symbol,
      side,
      qty,
      signalId,
      executedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('AutoExecute', 'Failed to execute order', { error: message }, error as Error);

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
