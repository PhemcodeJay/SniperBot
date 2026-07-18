#!/usr/bin/env bash
# SniperBot Ollama audit script
# Runs a battery of audit prompts against the sniperbot source using a local
# Ollama model. Saves each prompt + response to ./audit/reports/<NN>-<slug>.md
# so you can review them offline.
#
# Usage:
#   ./audit/audit.sh                 # use default model (qwen2.5-coder:7b)
#   ./audit/audit.sh llama3.1:8b     # use a different model
#   ./audit/audit.sh --resume 5      # resume from prompt 5 (skip earlier ones)
#
# Requirements: ollama running on http://localhost:11434

set -euo pipefail

# ---------- Config ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPORTS_DIR="$SCRIPT_DIR/reports"
MODEL="${1:-qwen2.5-coder:7b}"
RESUME_FROM=1

if [[ "${1:-}" == "--resume" ]]; then
  RESUME_FROM="${2:-1}"
  MODEL="qwen2.5-coder:7b"
fi

mkdir -p "$REPORTS_DIR"
echo "Model: $MODEL"
echo "Reports: $REPORTS_DIR"
echo "Root: $ROOT_DIR"
echo

# Sanity check ollama
if ! curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
  echo "ERROR: Ollama not reachable at http://localhost:11434" >&2
  echo "Start it with: ollama serve (or open the Ollama app)" >&2
  exit 1
fi

# ---------- Prompt definitions ----------
# Each entry: slug|file|system|user
# Files are read at runtime so the model sees current code.

PROMPTS=(
"01-exec-paths-duplication|src/lib/autoExecutor.ts,src/app/signal-engine/page.tsx|SniperBot auditor. Find security/safety bugs in the supplied code. Reference exact file paths and line numbers. Output a numbered list of findings with severity (CRITICAL/HIGH/MEDIUM/LOW) and a one-sentence fix. Don't summarize the code; only report issues.|\
You are auditing src/lib/autoExecutor.ts (server-side executor) and src/app/signal-engine/page.tsx (client-side executor). Both attempt to place live Bybit orders from the same pending-signal stream.
Tasks:
1. Identify whether these two paths can both fire for the same signal. Reference line numbers.
2. List every shared-state mutation (localStorage / setSignals) that could let one path override the other's dedupe tracking.
3. Show the deduplication mechanism in each path and explain why it does NOT coordinate with the other.
4. Quote the env-var reads on each path and the effect of the parseInt(..., 50) typo at line 490 of signal-engine/page.tsx.
5. Recommend the minimum change to make these paths mutually exclusive."

"02-position-sizing-arithmetic|src/lib/autoExecutor.ts,src/app/signal-engine/page.tsx,src/lib/bybit.ts|SniperBot auditor. Find math/logic bugs in position sizing and risk management. For each issue give the exact expression, the input that breaks it, and a one-line fix. Skip stylistic concerns.|\
Audit the position-sizing code in:
- src/lib/autoExecutor.ts (handleExecuteSignal / executeSignal / checkRiskLimits)
- src/app/signal-engine/page.tsx (handleExecuteSignal around line 479, sizing block 498-526)
- src/lib/bybit.ts (placeBybitOrder, normalizeBybitQty)

Find:
1. Use of stale signal.entryPrice/sl when computing quantity while current price has moved.
2. Whether the order is rejected if priceDiff == 0.
3. The fallback (available * 0.8 * leverage / price) and the maximum notional that can result on a $1000 account.
4. Whether the 5x leverage is hardcoded everywhere and whether isolation/cross margin is selectable.
5. Whether stopLoss / takeProfit values are validated against Bybit priceTick.
6. Race between walletCacheRef (60s) and a deposit/withdrawal during that window.
7. Calculation of liquidationPrice in signal-engine/page.tsx line 569. Is the formula correct?"

"03-indicator-correctness|src/app/signal-engine/page.tsx|SniperBot auditor. Compare claimed technical indicators vs. implemented math. Quote both. Flag any function that uses a name inconsistent with what it computes.|\
In src/app/signal-engine/page.tsx, the function calculateIndicators (around line 172) claims to compute RSI, MACD, and Bollinger Bands.
Tasks:
1. Quote the actual RSI computation. Compare to Wilder's RSI. Is it correct?
2. Quote the MACD computation. Is it the standard EMA-12 minus EMA-26 plus a 9-period signal line, or something else?
3. Quote the Bollinger computation. Is the stddev population vs sample choice reasonable?
4. The VWAP and EMA9/EMA20 entries in the 'indicators' UI state — are they used anywhere in the signal generation? Quote the code that uses them, or confirm they are dead.
5. When fetchKline fails and indicators fall back to defaults (rsi=50, macd=neutral, bb=middle), what does generateSignalFromData decide for direction? Quote that decision path."

"04-secret-exposure-and-auth|src/lib/bybit.ts,src/app/api/bybit/route.ts,src/app/api/bybit/orders/route.ts,.env.local,next.config.mjs|SniperBot auditor. Find every place a Bybit API secret is exposed or could be exfiltrated, and every API route that lacks authentication. Be exhaustive. Cite line numbers.|\
Audit the secret-handling and auth surface:
1. Search the repo for any reference to NEXT_PUBLIC_BYBIT_API_SECRET, BYBIT_API_SECRET, bybit_credentials, or process.env.BYBIT. For each occurrence, classify: (a) server-only safe, (b) bundled into client JS, (c) persisted in localStorage, (d) sent in a network request that the browser can observe.
2. Confirm whether src/lib/bybit.ts (HMAC signing + /v5/order/create) is ever called from a 'use client' component. List the callers.
3. Examine src/app/api/bybit/route.ts and src/app/api/bybit/orders/route.ts. For each, list: required headers, any auth check, whether it accepts unauthenticated POSTs, and whether rate limiting is enforced server-side.
4. The .env.local contains both BYBIT_API_KEY and NEXT_PUBLIC_BYBIT_API_KEY with the same value. What does this mean for any HTTP listener on the machine (e.g. someone visiting http://localhost:4028)?
5. next.config.mjs / package.json scripts: does 'serve' bind to 127.0.0.1 only, or 0.0.0.0?"

"05-shared-state-and-race|src/lib/tradingState.ts,src/lib/autoExecutor.ts,src/app/signal-engine/page.tsx|SniperBot auditor. Find race conditions and data-integrity issues in the shared trading state and its consumers. Quote the exact code.|\
Audit src/lib/tradingState.ts and its two main consumers.
Tasks:
1. List every write function (setShared*, appendShared*, syncSharedTradingState) and confirm whether it reads-then-writes the localStorage entry atomically or via a read-modify-write that could lose updates.
2. Confirm whether setSharedSignals slices the input to 100 (it does) and what happens if the localStorage entry is corrupted.
3. In src/lib/autoExecutor.ts, the executedSignals Set is in-process memory. If the Node server restarts, what happens to dedupe? Quote the read and write of that Set.
4. In src/app/signal-engine/page.tsx, the autoExecutionRef Set is component-instance memory. Quote every place it is read and written. What happens on remount?
5. Two parallel calls to syncSharedTradingState({bot:{...}}) at the same time: is the bot field of the patch or the existing state preserved?
6. localStorage size limit is ~5-10MB. signals/alerts/trades grow without bound except signals/alerts which are sliced to 100. trades has no cap. Quote where."

"06-rate-limit-and-flood|src/lib/requestManager.ts,src/app/signal-engine/page.tsx,src/app/api/bybit/orders/route.ts|SniperBot auditor. Find ways the request manager and the rate limiter can be bypassed, starved, or flooded.|\
Audit request throttling:
1. requestManager has a requestsPerSecond = 10 and tracks lastRequestTime in instance state. Quote every caller of executeWithRateLimit and confirm the singleton is reused. Where could a new RequestManager be instantiated, bypassing the throttle?
2. The signal-engine page fires a market scan every ~20s (throttled) AND every 120s as a fallback. fetchTickers issues 15 parallel GETs to /v5/market/tickers. Bybit's public rate limit is 600 requests / 5s for that endpoint. Are we under it? Compute the worst-case requests per second.
3. fetchKline is called inside Promise.all over tickers (line 310). With 15 symbols, 15 simultaneous kline fetches — is the in-component fetch subject to any throttle? Quote the only throttle.
4. The server route /api/bybit/orders uses requestManager. It has its own instance (server-side) and its own rate counter. Is the per-process limit shared with autoExecutor's loop?
5. The realtimeManager subscribes a single WebSocket. Quote the message handler. Does it rate-limit downstream REST calls triggered per tick?"

"07-api-route-handlers|src/app/api/bybit/route.ts,src/app/api/bybit/orders/route.ts|SniperBot auditor. Audit the API route handlers for input validation, error handling, and idempotency. Quote line numbers.|\
Read src/app/api/bybit/route.ts and src/app/api/bybit/orders/route.ts in full.
For each route produce:
1. HTTP methods accepted
2. Request body schema (paste the Zod schema if present, or note its absence)
3. Server-side auth check (or absence)
4. Rate limiting (where, with what key)
5. For the orders route: which side effects (writes to Bybit) can it cause, and what input combinations would place the largest order?
6. Whether the orders route is idempotent — i.e. can a retried POST after a network blip result in two orders? Quote the retry logic.
7. Whether errors return a status code that autoExecutor will treat as retryable (5xx) vs fatal (4xx)."

"08-config-and-env-typing|src/lib/bybit.ts,src/lib/autoExecutor.ts,src/app/signal-engine/page.tsx,SniperBot/Project (TSConfig),.env.example,SniperBot/.env.local|SniperBot auditor. Find type-safety holes around environment variables and config.|\
Tasks:
1. In src/lib/autoExecutor.ts line 26-28, AUTO_EXECUTE_ENABLED is checked against the string 'true'. What if .env.local has AUTO_EXECUTE_ENABLED=1 or AUTO_EXECUTE_ENABLED=True? Quote the comparison.
2. parseFloat(process.env.NEXT_PUBLIC_AUTO_EXECUTE_MAX_RISK_PCT || process.env.AUTO_EXECUTE_MAX_RISK_PCT || '2.0') — what happens if the env var is the empty string?
3. signal-engine/page.tsx line 490 uses parseInt(value, 50). The second arg is the radix. Valid radices are 2..36. What does JavaScript do with 50?
4. signal-engine/page.tsx line 437 uses parseInt(value || '10', 10). What if value is '0'?
5. Are the Next.js types @types/node and @types/react listed in package.json? Does tsconfig.json include 'Node' or 'DOM' lib only?
6. Is the process.env.NEXT_PUBLIC_* access safe in a 'use client' component? (It is, because Next.js inlines them at build time, but it means the secret is in the bundle.) Quote the env var reads from the client component."

"09-input-validation|src/lib/validators.ts,src/app/api/bybit/orders/route.ts,src/lib/autoExecutor.ts|SniperBot auditor. Find places where untrusted input reaches a numeric operation or API call without validation.|\
Tasks:
1. List the Zod schemas defined in src/lib/validators.ts. For each, what fields are validated and what is the upper/lower bound?
2. The orders route receives a POST body. Is every field validated by Zod? If not, list the unvalidated fields.
3. In autoExecutor.ts, signal.entryPrice, signal.sl, signal.tp1 are read from shared state (which is localStorage in the browser, but server-side it's also from the same source). What if these are NaN, negative, or zero? Quote the code path.
4. qty.toString() is sent to Bybit. What if qty is Infinity or NaN after the margin-adjustment fallback? Does normalizeBybitQty handle that input?
5. Symbol validation: is signal.symbol checked against a known list before being sent to Bybit? If not, what happens with a malformed symbol like '../../../etc/passwd' or 'BTCUSDT; DROP TABLE'?"

"10-shutdown-and-recovery|src/lib/autoExecutor.ts,src/lib/pnlSync.ts,src/lib/tradingState.ts|SniperBot auditor. Find failure modes around the lifecycle of the bot (start, stop, crash, restart).|\
Tasks:
1. Quote the start() and stop() of AutoExecutor. Is there a way for start() to be called twice without a second interval being created? (Look at isRunning guard.)
2. If the Node process crashes, the setInterval is gone. On restart, executedSignals is empty. What happens to all the pending signals that were already submitted but where the order response was lost? Will they be re-submitted?
3. PnL sync runs every 500ms. If a single fetch takes >500ms (slow network), what happens? Does it queue or overlap?
4. The SharedMetrics are computed from localStorage state. After a bot restart with no trades history, what are the initial values of totalPnl, winRate, maxDrawdown? Are they defaults that look like real data?
5. If localStorage is full or unavailable (private mode in some browsers), do any writes throw and crash the app?"
)

# ---------- Run prompts ----------
i=0
for entry in "${PROMPTS[@]}"; do
  i=$((i+1))
  IFS='|' read -r slug file system user <<< "$entry"

  if (( i < RESUME_FROM )); then
    echo "  [skip] $i. $slug (resume from $RESUME_FROM)"
    continue
  fi

  out="$REPORTS_DIR/$(printf '%02d' $i)-${slug}.md"
  echo "  [run ] $i. $slug"
  echo "        -> $out"

  {
    echo "# Audit Report: $slug"
    echo
    echo "- **Model:** \`$MODEL\`"
    echo "- **Files in scope:** \`$file\`"
    echo "- **Generated:** $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo
    echo "## Files Reviewed"
    echo
    echo '```'
    # Echo the file list as a tree
    IFS=',' read -ra files <<< "$file"
    for f in "${files[@]}"; do
      f_trimmed="$(echo "$f" | xargs)"
      if [[ -f "$ROOT_DIR/$f_trimmed" ]]; then
        echo "=== $f_trimmed ==="
        echo
      fi
    done
    echo '```'
    echo
    echo "## System Prompt"
    echo
    echo "> $system"
    echo
    echo "## User Prompt"
    echo
    echo "**Files:** \`$file\`"
    echo
    echo "$user"
    echo
    echo "## Model Response"
    echo
    echo '```'
  } > "$out"

  # Build a single prompt that includes file contents and the question
  full_prompt="$system

Files in scope:
$file

"
  IFS=',' read -ra files <<< "$file"
  for f in "${files[@]}"; do
    f_trimmed="$(echo "$f" | xargs)"
    if [[ -f "$ROOT_DIR/$f_trimmed" ]]; then
      full_prompt+="
===== FILE: $f_trimmed =====
$(cat "$ROOT_DIR/$f_trimmed")
"
    elif [[ "$f_trimmed" == .env* ]]; then
      if [[ -f "$ROOT_DIR/$f_trimmed" ]]; then
        # Redact secrets before sending to the model
        redacted="$(sed -E 's/(SECRET|KEY)=.*/\1=REDACTED/' "$ROOT_DIR/$f_trimmed")"
        full_prompt+="
===== FILE: $f_trimmed (SECRETS REDACTED) =====
$redacted
"
      fi
    else
      full_prompt+="
===== FILE: $f_trimmed (NOT FOUND) =====
"
    fi
  done

  full_prompt+="
Question:
$user"

  # Call ollama
  response="$(ollama run "$MODEL" "$full_prompt" 2>&1)" || response="(ollama returned non-zero)"

  {
    echo "$response"
    echo
    echo '```'
  } >> "$out"

  echo "        done ($(wc -l < "$out") lines)"
done

echo
echo "Reports written to: $REPORTS_DIR"
echo "Total: $(ls "$REPORTS_DIR" | wc -l) file(s)"
