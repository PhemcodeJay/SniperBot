// lib/validators.ts
// Zod schemas for Bybit API validation

import { z } from 'zod';

// ============== ACCOUNT & BALANCE ==============
export const BybitWalletResponseSchema = z.object({
  retCode: z.number(),
  retMsg: z.string(),
  result: z.object({
    list: z.array(
      z.object({
        totalEquity: z.union([z.string(), z.number()]).optional(),
        accountIMRate: z.union([z.string(), z.number()]).optional(),
        totalMarginBalance: z.union([z.string(), z.number()]).optional(),
        totalInitialMargin: z.union([z.string(), z.number()]).optional(),
        accountType: z.string().optional(),
        totalAvailableBalance: z.union([z.string(), z.number()]).optional(),
        availableBalance: z.union([z.string(), z.number()]).optional(),
        walletBalance: z.union([z.string(), z.number()]).optional(),
        equity: z.union([z.string(), z.number()]).optional(),
        // coin array can vary by API version; accept either 'coin' or 'coins' and allow flexible shapes
        coin: z
          .array(
            z.object({
              coin: z.string().optional(),
              equity: z.union([z.string(), z.number()]).optional(),
              walletBalance: z.union([z.string(), z.number()]).optional(),
              free: z.union([z.string(), z.number()]).optional(),
              locked: z.union([z.string(), z.number()]).optional(),
            })
          )
          .optional(),
        coins: z.array(z.any()).optional(),
      })
    ),
  }),
});

export const BybitAccountInfoSchema = z.object({
  retCode: z.number(),
  retMsg: z.string(),
  result: z.object({
    uid: z.string(),
    accountType: z.string(),
    unifiedMarginStatus: z.number().optional(),
  }),
});

// ============== POSITIONS ==============
export const BybitPositionSchema = z.object({
  positionIdx: z.union([z.coerce.number(), z.string()]).optional(),
  riskId: z.union([z.string(), z.number()]).optional(),
  symbol: z.string(),
  side: z.enum(['Buy', 'Sell', 'None']),
  size: z.union([z.string(), z.number()]).optional(),
  positionValue: z.union([z.string(), z.number()]).optional(),
  entryPrice: z.union([z.string(), z.number()]).optional(),
  markPrice: z.union([z.string(), z.number()]).optional(),
  leverage: z.union([z.string(), z.number()]).optional(),
  positionBalance: z.union([z.string(), z.number()]).optional(),
  autoAddMargin: z.union([z.string(), z.number()]).optional(),
  positionStatus: z.string().optional(),
  sessionAvgPrice: z.union([z.string(), z.number()]).optional(),
  createdTime: z.union([z.string(), z.number()]).optional(),
  updatedTime: z.union([z.string(), z.number()]).optional(),
  realizedPnl: z.union([z.string(), z.number()]).optional(),
  unrealisedPnl: z.union([z.string(), z.number()]).optional(),
  cumRealisedPnl: z.union([z.string(), z.number()]).optional(),
  stopLoss: z.union([z.string(), z.number()]).optional(),
  takeProfit: z.union([z.string(), z.number()]).optional(),
  trailingStop: z.union([z.string(), z.number()]).optional(),
  tpSlMode: z.string().optional(),
  activePrice: z.union([z.string(), z.number()]).optional(),
  liquidationPrice: z.union([z.string(), z.number()]).optional(),
  adlRankIndicator: z.union([z.string(), z.number()]).optional(),
});

export const BybitPositionListSchema = z.object({
  retCode: z.number(),
  retMsg: z.string(),
  result: z.object({
    list: z.array(BybitPositionSchema),
    category: z.string(),
  }),
});

// ============== ORDERS ==============
export const BybitOrderSchema = z.object({
  orderId: z.string(),
  orderLinkId: z.string().optional(),
  blockTradeId: z.string().optional(),
  symbol: z.string(),
  price: z.string(),
  qty: z.string(),
  side: z.enum(['Buy', 'Sell']),
  positionIdx: z.number().optional(),
  orderStatus: z.string(),
  createType: z.string().optional(),
  cancelType: z.string().optional(),
  rejectReason: z.string().optional(),
  avgPrice: z.string(),
  leavesQty: z.string(),
  leavesValue: z.string(),
  cumExecQty: z.string(),
  cumExecValue: z.string(),
  cumExecFee: z.string(),
  timeInForce: z.string(),
  orderType: z.string(),
  stopPrice: z.string().optional(),
  triggerPrice: z.string().optional(),
  triggerDirection: z.number().optional(),
  triggerBy: z.string().optional(),
  createTime: z.string(),
  updateTime: z.string(),
});

export const BybitOrderResponseSchema = z.object({
  retCode: z.number(),
  retMsg: z.string(),
  result: z.object({
    orderId: z.string(),
    orderLinkId: z.string().optional(),
  }),
});

// ============== TICKERS ==============
export const BybitTickerSchema = z.object({
  symbol: z.string(),
  lastPrice: z.string(),
  indexPrice: z.string(),
  markPrice: z.string(),
  bid1Price: z.string(),
  bid1Size: z.string(),
  ask1Price: z.string(),
  ask1Size: z.string(),
  change24h: z.string(),
  turnover24h: z.string(),
  volume24h: z.string(),
  openInterest: z.string(),
  nextFundingTime: z.string(),
  fundingRate: z.string(),
  predictedDeliveryPrice: z.string().optional(),
  basisMpf: z.string().optional(),
  basis: z.string().optional(),
  deliveryFeeRate: z.string().optional(),
  openInterestValue: z.string().optional(),
  totalVolume: z.string().optional(),
  totalTurnover: z.string().optional(),
});

export const BybitTickersResponseSchema = z.object({
  retCode: z.number(),
  retMsg: z.string(),
  result: z.object({
    list: z.array(BybitTickerSchema),
    category: z.string(),
  }),
});

// ============== TIME ==============
export const BybitTimeResponseSchema = z.object({
  retCode: z.number(),
  retMsg: z.string(),
  result: z.object({
    timeSecond: z.string(),
    timeNano: z.string(),
  }),
});

// ============== HELPER TYPES ==============
export type WalletBalance = z.infer<typeof BybitWalletResponseSchema>['result']['list'][0];
export type BybitPosition = z.infer<typeof BybitPositionSchema>;
export type BybitOrder = z.infer<typeof BybitOrderSchema>;
export type BybitTicker = z.infer<typeof BybitTickerSchema>;

// ============== SAFE PARSE HELPERS ==============
export function parseWalletBalance(data: any) {
  return BybitWalletResponseSchema.safeParse(data);
}

export function parsePositionList(data: any) {
  return BybitPositionListSchema.safeParse(data);
}

export function parseOrderResponse(data: any) {
  return BybitOrderResponseSchema.safeParse(data);
}

export function parseTickers(data: any) {
  return BybitTickersResponseSchema.safeParse(data);
}

export function parseTimeResponse(data: any) {
  return BybitTimeResponseSchema.safeParse(data);
}
