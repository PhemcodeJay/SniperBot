# SniperBot — Ollama Audit Checklist

10 prompts tuned to the actual risks in this codebase. Each one targets a
specific file or pair of files. Paste the prompt into:

```bash
ollama run qwen2.5-coder:7b
```

Then paste the file contents (or `cat` them inline). Or just run
`./audit/audit.sh` to automate all 10.

> **Tip:** the model has 32k context. The biggest file (`page.tsx`, ~51KB) fits
> alone but tight. Audit it on its own or paired with one small file.

> **Secrets:** even though Ollama is local, this checklist rephrases prompts to
> never include the live `BYBIT_API_SECRET` value. If you want to include
> `.env.local`, redact the secret first: `sed 's/=.*/=REDACTED/' .env.local`.

---

## 1. Dual execution paths (autoExecutor + signal-engine)

**Risk:** Same signal can fire twice from two uncoordinated executors.
**Files:** `src/lib/autoExecutor.ts`, `src/app/signal-engine/page.tsx`

```
You are auditing src/lib/autoExecutor.ts (server-side executor) and
src/app/signal-engine/page.tsx (client-side executor). Both attempt to place
live Bybit orders from the same pending-signal stream.

Tasks:
1. Identify whether these two paths can both fire for the same signal.
   Reference line numbers.
2. List every shared-state mutation (localStorage / setSignals) that could
   let one path override the other's dedupe tracking.
3. Show the deduplication mechanism in each path and explain why it does NOT
   coordinate with the other.
4. Quote the env-var reads on each path and the effect of the parseInt(..., 50)
   typo at line 490 of signal-engine/page.tsx.
5. Recommend the minimum change to make these paths mutually exclusive.

[then: cat the two files]
```

---

## 2. Position sizing arithmetic

**Risk:** Orders sized from stale prices, with a 5x leverage fall-through that
can blow the account.
**Files:** `src/lib/autoExecutor.ts`, `src/app/signal-engine/page.tsx`, `src/lib/bybit.ts`

```
Audit the position-sizing code in:
- src/lib/autoExecutor.ts (handleExecuteSignal / executeSignal / checkRiskLimits)
- src/app/signal-engine/page.tsx (handleExecuteSignal around line 479,
  sizing block 498-526)
- src/lib/bybit.ts (placeBybitOrder, normalizeBybitQty)

Find:
1. Use of stale signal.entryPrice/sl when computing quantity while current
   price has moved.
2. Whether the order is rejected if priceDiff == 0.
3. The fallback (available * 0.8 * leverage / price) and the maximum notional
   that can result on a $1000 account.
4. Whether the 5x leverage is hardcoded everywhere and whether
   isolation/cross margin is selectable.
5. Whether stopLoss / takeProfit values are validated against Bybit priceTick.
6. Race between walletCacheRef (60s) and a deposit/withdrawal during that window.
7. Calculation of liquidationPrice in signal-engine/page.tsx line 569.
   Is the formula correct?

[then: cat the three files]
```

---

## 3. Indicator correctness

**Risk:** Indicators labelled RSI/MACD/BB are not actually those indicators.
The signal reduces to a 24h-move heuristic when klines fail.
**File:** `src/app/signal-engine/page.tsx`

```
In src/app/signal-engine/page.tsx, the function calculateIndicators (around
line 172) claims to compute RSI, MACD, and Bollinger Bands.

Tasks:
1. Quote the actual RSI computation. Compare to Wilder's RSI. Is it correct?
2. Quote the MACD computation. Is it the standard EMA-12 minus EMA-26 plus a
   9-period signal line, or something else?
3. Quote the Bollinger computation. Is the stddev population vs sample choice
   reasonable?
4. The VWAP and EMA9/EMA20 entries in the 'indicators' UI state — are they used
   anywhere in the signal generation? Quote the code that uses them, or confirm
   they are dead.
5. When fetchKline fails and indicators fall back to defaults
   (rsi=50, macd=neutral, bb=middle), what does generateSignalFromData decide
   for direction? Quote that decision path.

[then: cat page.tsx]
```

---

## 4. Secret exposure and missing auth

**Risk:** API secret in client bundle, no auth on order endpoint, secret
persisted in localStorage.
**Files:** `src/lib/bybit.ts`, `src/app/api/bybit/route.ts`, `src/app/api/bybit/orders/route.ts`, `next.config.mjs`

```
Audit the secret-handling and auth surface:
1. Search the repo for any reference to NEXT_PUBLIC_BYBIT_API_SECRET,
   BYBIT_API_SECRET, bybit_credentials, or process.env.BYBIT. For each
   occurrence, classify: (a) server-only safe, (b) bundled into client JS,
   (c) persisted in localStorage, (d) sent in a network request that the
   browser can observe.
2. Confirm whether src/lib/bybit.ts (HMAC signing + /v5/order/create) is
   ever called from a 'use client' component. List the callers.
3. Examine src/app/api/bybit/route.ts and src/app/api/bybit/orders/route.ts.
   For each, list: required headers, any auth check, whether it accepts
   unauthenticated POSTs, and whether rate limiting is enforced server-side.
4. The .env.local contains both BYBIT_API_KEY and NEXT_PUBLIC_BYBIT_API_KEY
   with the same value. What does this mean for any HTTP listener on the
   machine (e.g. someone visiting http://localhost:4028)?
5. next.config.mjs / package.json scripts: does 'serve' bind to 127.0.0.1
   only, or 0.0.0.0?
```

---

## 5. Shared state and race conditions

**Risk:** Read-modify-write on localStorage, two parallel executors, no
dedupe across them.
**Files:** `src/lib/tradingState.ts`, `src/lib/autoExecutor.ts`, `src/app/signal-engine/page.tsx`

```
Audit src/lib/tradingState.ts and its two main consumers.
Tasks:
1. List every write function (setShared*, appendShared*,
   syncSharedTradingState) and confirm whether it reads-then-writes the
   localStorage entry atomically or via a read-modify-write that could lose
   updates.
2. Confirm whether setSharedSignals slices the input to 100 (it does) and what
   happens if the localStorage entry is corrupted.
3. In src/lib/autoExecutor.ts, the executedSignals Set is in-process memory.
   If the Node server restarts, what happens to dedupe? Quote the read and
   write of that Set.
4. In src/app/signal-engine/page.tsx, the autoExecutionRef Set is
   component-instance memory. Quote every place it is read and written. What
   happens on remount?
5. Two parallel calls to syncSharedTradingState({bot:{...}}) at the same
   time: is the bot field of the patch or the existing state preserved?
6. localStorage size limit is ~5-10MB. signals/alerts/trades grow without
   bound except signals/alerts which are sliced to 100. trades has no cap.
   Quote where.
```

---

## 6. Rate limit and request flooding

**Risk:** Singleton rate limiter in instance state; client opens many parallel
fetches per tick; server route shares the counter.
**Files:** `src/lib/requestManager.ts`, `src/app/signal-engine/page.tsx`, `src/app/api/bybit/orders/route.ts`

```
Audit request throttling:
1. requestManager has a requestsPerSecond = 10 and tracks lastRequestTime in
   instance state. Quote every caller of executeWithRateLimit and confirm
   the singleton is reused. Where could a new RequestManager be instantiated,
   bypassing the throttle?
2. The signal-engine page fires a market scan every ~20s (throttled) AND every
   120s as a fallback. fetchTickers issues 15 parallel GETs to
   /v5/market/tickers. Bybit's public rate limit is 600 requests / 5s for
   that endpoint. Are we under it? Compute the worst-case requests per second.
3. fetchKline is called inside Promise.all over tickers (line 310). With 15
   symbols, 15 simultaneous kline fetches — is the in-component fetch subject
   to any throttle? Quote the only throttle.
4. The server route /api/bybit/orders uses requestManager. It has its own
   instance (server-side) and its own rate counter. Is the per-process limit
   shared with autoExecutor's loop?
5. The realtimeManager subscribes a single WebSocket. Quote the message
   handler. Does it rate-limit downstream REST calls triggered per tick?
```

---

## 7. API route handlers

**Risk:** Idempotency on retry; missing validation; error status semantics.
**Files:** `src/app/api/bybit/route.ts`, `src/app/api/bybit/orders/route.ts`

```
Read src/app/api/bybit/route.ts and src/app/api/bybit/orders/route.ts in full.
For each route produce:
1. HTTP methods accepted
2. Request body schema (paste the Zod schema if present, or note its absence)
3. Server-side auth check (or absence)
4. Rate limiting (where, with what key)
5. For the orders route: which side effects (writes to Bybit) can it cause,
   and what input combinations would place the largest order?
6. Whether the orders route is idempotent — i.e. can a retried POST after a
   network blip result in two orders? Quote the retry logic.
7. Whether errors return a status code that autoExecutor will treat as
   retryable (5xx) vs fatal (4xx).
```

---

## 8. Config and env typing

**Risk:** `parseInt(..., 50)` invalid radix; `AUTO_EXECUTE_ENABLED` truthy
parsing; bundle-leaked secrets.
**Files:** `src/lib/autoExecutor.ts`, `src/app/signal-engine/page.tsx`, `tsconfig.json`, `package.json`

```
Tasks:
1. In src/lib/autoExecutor.ts line 26-28, AUTO_EXECUTE_ENABLED is checked
   against the string 'true'. What if .env.local has AUTO_EXECUTE_ENABLED=1
   or AUTO_EXECUTE_ENABLED=True? Quote the comparison.
2. parseFloat(process.env.NEXT_PUBLIC_AUTO_EXECUTE_MAX_RISK_PCT ||
   process.env.AUTO_EXECUTE_MAX_RISK_PCT || '2.0') — what happens if the env
   var is the empty string?
3. signal-engine/page.tsx line 490 uses parseInt(value, 50). The second arg
   is the radix. Valid radices are 2..36. What does JavaScript do with 50?
4. signal-engine/page.tsx line 437 uses parseInt(value || '10', 10). What if
   value is '0'?
5. Are the Next.js types @types/node and @types/react listed in package.json?
   Does tsconfig.json include 'Node' or 'DOM' lib only?
6. Is the process.env.NEXT_PUBLIC_* access safe in a 'use client' component?
   (It is, because Next.js inlines them at build time, but it means the
   secret is in the bundle.) Quote the env var reads from the client
   component.
```

---

## 9. Input validation

**Risk:** Untrusted values reach API calls; Zod schemas may not cover all
fields.
**Files:** `src/lib/validators.ts`, `src/app/api/bybit/orders/route.ts`, `src/lib/autoExecutor.ts`

```
Tasks:
1. List the Zod schemas defined in src/lib/validators.ts. For each, what
   fields are validated and what is the upper/lower bound?
2. The orders route receives a POST body. Is every field validated by Zod?
   If not, list the unvalidated fields.
3. In autoExecutor.ts, signal.entryPrice, signal.sl, signal.tp1 are read from
   shared state. What if these are NaN, negative, or zero? Quote the code path.
4. qty.toString() is sent to Bybit. What if qty is Infinity or NaN after the
   margin-adjustment fallback? Does normalizeBybitQty handle that input?
5. Symbol validation: is signal.symbol checked against a known list before
   being sent to Bybit? If not, what happens with a malformed symbol like
   '../../../etc/passwd' or 'BTCUSDT; DROP TABLE'?
```

---

## 10. Shutdown, crash, and recovery

**Risk:** No idempotency on restart; interval leaks on duplicate start; PnL
sync can overlap.
**Files:** `src/lib/autoExecutor.ts`, `src/lib/pnlSync.ts`, `src/lib/tradingState.ts`

```
Tasks:
1. Quote the start() and stop() of AutoExecutor. Is there a way for start() to
   be called twice without a second interval being created? (Look at isRunning
   guard.)
2. If the Node process crashes, the setInterval is gone. On restart,
   executedSignals is empty. What happens to all the pending signals that
   were already submitted but where the order response was lost? Will they be
   re-submitted?
3. PnL sync runs every 500ms. If a single fetch takes >500ms (slow network),
   what happens? Does it queue or overlap?
4. The SharedMetrics are computed from localStorage state. After a bot
   restart with no trades history, what are the initial values of totalPnl,
   winRate, maxDrawdown? Are they defaults that look like real data?
5. If localStorage is full or unavailable (private mode in some browsers), do
   any writes throw and crash the app?
```

---

## How to use this checklist

**Option A — automated (recommended):**
```bash
cd "C:/Users/Bossman/Desktop/sniperbot"
./audit/audit.sh                          # runs all 10 with qwen2.5-coder:7b
./audit/audit.sh llama3.1:8b             # different model
./audit/audit.sh --resume 5               # skip 1-4
cat audit/reports/01-exec-paths-duplication.md
```

**Option B — manual (good for first run, lower latency):**
```bash
ollama run qwen2.5-coder:7b
# paste prompt 1, then:
# >>> (paste the file contents)
# cat src/lib/autoExecutor.ts
# >>> (paste file contents)
# cat src/app/signal-engine/page.tsx
# /bye
```

**Option C — quick spot-check, no audit script:**
```bash
# 30-second smell test
ollama run qwen2.5-coder:7b "Read src/lib/autoExecutor.ts. In one paragraph, what's the worst bug?"
```

---

## Reading the reports

Each report file contains:
- The prompt sent
- The files reviewed (paths)
- The model's response

Reports are saved as Markdown so they render nicely in VS Code, GitHub, or
Obsidian. The model isn't always right — cross-check anything it flags
against the source before acting. Treat it as a junior auditor who finds
real issues but also false positives.
