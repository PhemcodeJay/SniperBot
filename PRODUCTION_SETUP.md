# PRODUCTION DEPLOYMENT GUIDE

## 🚨 CRITICAL - MAINNET ONLY

This SniperBot instance is configured for **MAINNET TRADING ONLY**. All trades execute on Bybit mainnet with REAL FUNDS.

## Prerequisites

1. **Bybit Account** - Create account at https://www.bybit.com
2. **Mainnet API Keys** - Generate at https://www.bybit.com/account/api
3. **Node.js 18+** - Install from https://nodejs.org

## Setup Instructions

### 1. Clone Repository
```bash
git clone <repo>
cd SniperBot
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables

Create `.env.local` file in root directory:

```bash
# ⚠️ NEVER COMMIT THIS FILE
# MAINNET ONLY - LIVE TRADING

# Bybit Mainnet API Credentials (Server-Side Only)
BYBIT_API_KEY=your_api_key_here
BYBIT_API_SECRET=your_api_secret_here
BYBIT_USE_TESTNET=false

# Mainnet URLs (MAINNET ONLY)
BYBIT_BASE_URL=https://api.bybit.com
BYBIT_WS_URL=wss://stream.bybit.com/v5/public/linear

# Application Configuration
APP_ENV=production
LOG_LEVEL=info

# Auto-Execution Settings
AUTO_EXECUTE_ENABLED=true
AUTO_EXECUTE_MIN_CONFIDENCE=0.80
AUTO_EXECUTE_MAX_RISK_PCT=2.0

# Performance Tuning
PNL_SYNC_INTERVAL_MS=500
RATE_LIMIT_REQUESTS_PER_SECOND=10
SIGNAL_CHECK_INTERVAL_MS=1000

# Risk Management
MAX_POSITION_SIZE_USDT=10000
MAX_DAILY_LOSS_PCT=5
```

### 4. Verify Configuration

```bash
# Type check
npm run type-check

# Lint
npm run lint

# Format code
npm run format
```

### 5. Run Development Server

```bash
npm run dev
```

Open http://sniperbot.space:4028 in browser.

### 6. Deploy to Production

Build for production:
```bash
npm run build
```

Start production server:
```bash
npm run serve
```

## 🔐 Security Checklist

- [ ] API keys stored in `.env.local` (never in code)
- [ ] `.env.local` added to `.gitignore`
- [ ] `.env.local` never committed to git
- [ ] API keys rotated regularly (90 days)
- [ ] Enable IP whitelist on Bybit API settings
- [ ] Enable 2FA on Bybit account
- [ ] Use read-only API key for monitoring (if available)
- [ ] Enable withdrawal whitelist on Bybit
- [ ] Firewall configured to limit access
- [ ] Database backups configured (if applicable)

## 📊 Monitoring

### Real-time Metrics

The bot automatically syncs:
- **Balance Updates** - Every 5 seconds
- **Position Updates** - Every 3 seconds
- **P&L Updates** - Every 500ms
- **Signal Checks** - Every 1 second

### Dashboard Access

- **Main Dashboard**: http://sniperbot.space:4028
- **Performance Analytics**: http://sniperbot.space:4028/performance-analytics
- **Trade Logs**: http://sniperbot.space:4028/trade-logs
- **Bot Configuration**: http://sniperbot.space:4028/bot-config
- **Risk Rules**: http://sniperbot.space:4028/risk-rules
- **Settings**: http://sniperbot.space:4028/settings

### Logging

Logs are stored in-memory (last 1000 entries). Access via browser console:
```javascript
// View all logs
window.debugLogs?.getLogs()

// View error logs
window.debugLogs?.getLogs('', 'error')

// View P&L sync logs
window.debugLogs?.getLogs('PnLSync')
```

## 🛡️ Risk Management

### Built-in Protections

1. **Position Size Limits**
   - Max position: 10,000 USDT
   - Auto-adjust for leverage
   - Risk-based sizing (2% per trade)

2. **Daily Loss Limits**
   - Max daily loss: 5% of account
   - Trading stops after limit reached
   - Alert notification

3. **Confidence Thresholds**
   - Min signal confidence: 80%
   - Only top 5% signals execute
   - Manual override available

4. **Order Limits**
   - Max 5 open positions simultaneously
   - Timeout on pending orders: 1 minute
   - Request rate limiting: 10 req/sec

## ⚠️ Emergency Procedures

### Stop Auto-Trading

If bot behaves unexpectedly:
1. Disable auto-execute in Settings
2. Close all positions manually
3. Review logs for errors
4. Contact support

### Kill Switch

To disable all trading:
```bash
# Stop the app
Ctrl+C

# Manually close positions on Bybit
# https://www.bybit.com/futures
```

### Rollback

To revert to previous version:
```bash
git revert <commit-hash>
npm install
npm run build
```

## 🐛 Troubleshooting

### API Connection Failed
- Check `.env.local` credentials
- Verify IP whitelist on Bybit
- Check network connectivity
- Review logs in browser console

### Orders Not Executing
- Check confidence threshold
- Verify risk limits not exceeded
- Check available balance
- Review daily loss status

### High Latency
- Check internet connection
- Monitor P&L sync interval
- Reduce request rate limit if needed
- Check Bybit status page

## 📞 Support

For issues:
1. Check logs: `npm run dev` and review console
2. Review configuration in `.env.local`
3. Verify API key permissions on Bybit
4. Check .gitignore to ensure no credentials committed

## 🚀 Performance Optimization

For production trading:
- Use dedicated server (AWS, DigitalOcean)
- Enable browser caching
- Use CDN for assets
- Monitor memory usage
- Set up uptime monitoring (Pingdom)
- Configure error tracking (Sentry)

## 📝 Trading Log

All trades are logged with:
- Entry/Exit price
- Size and leverage
- Profit/Loss
- Entry/Exit reason
- Signal confidence
- Execution time

Logs are accessible at `/trade-logs` in the dashboard.

## ⚖️ Disclaimer

**MAINNET TRADING - REAL FUNDS AT RISK**

This bot executes live trades on Bybit mainnet. Use at your own risk. Past performance does not guarantee future results. Always:
- Start with small position sizes
- Test thoroughly in paper mode first
- Monitor trading regularly
- Never leave unattended for extended periods
- Set appropriate risk limits
- Have emergency procedures in place

