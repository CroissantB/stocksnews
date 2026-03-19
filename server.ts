import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { fileURLToPath } from 'url';
import yahooFinance from 'yahoo-finance2';
const yf = new yahooFinance();

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API Routes
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query) return res.json([]);
    const results = await yf.search(query);
    res.json(results.quotes.filter((q: any) => ['EQUITY', 'CURRENCY', 'CRYPTOCURRENCY', 'INDEX', 'ETF'].includes(q.quoteType)));
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
});

app.get('/api/chart', async (req, res) => {
  try {
    const symbol = req.query.symbol as string;
    const interval = (req.query.interval as any) || '1d';
    const range = (req.query.range as any) || '1y';
    
    const period1 = new Date();
    if (range === '1mo') period1.setMonth(period1.getMonth() - 1);
    else if (range === '3mo') period1.setMonth(period1.getMonth() - 3);
    else if (range === '6mo') period1.setMonth(period1.getMonth() - 6);
    else if (range === '1y') period1.setFullYear(period1.getFullYear() - 1);
    else if (range === '5y') period1.setFullYear(period1.getFullYear() - 5);
    else period1.setFullYear(period1.getFullYear() - 1); // default 1y

    const queryOptions = { period1, interval };
    const result = await yf.historical(symbol, queryOptions);
    
    const formatted = result.map((item: any) => ({
      time: item.date.toISOString().split('T')[0],
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume
    }));
    
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
});

app.get('/api/quote', async (req, res) => {
  try {
    const symbol = req.query.symbol as string;
    
    // Fallback to Yahoo Finance
    const quote = await yf.quote(symbol);
    res.json(quote);
  } catch (error) {
    console.error('Failed to fetch quote:', error);
    res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
