import React, { useState, useEffect } from 'react';
import { Star, Plus, Trash2, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface WatchlistProps {
  onSelect: (symbol: string) => void;
  selectedSymbol: string;
  onItemsUpdate?: (items: WatchlistItem[]) => void;
  refreshTrigger?: number;
}

export interface WatchlistItem {
  symbol: string;
  type: string;
  price?: number;
  change?: number;
  changePercent?: number;
}

export default function WatchlistComponent({ onSelect, selectedSymbol, onItemsUpdate, refreshTrigger }: WatchlistProps) {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');

  const appScriptUrl = 'https://script.google.com/macros/s/AKfycbyl797a2YdXYS6p_MJccuYyCbCJyepBIOU-N8l5NhvCGhjwYVEYueOjmfr-o7BNwngn5g/exec';

  const fetchWatchlist = async () => {
    if (!appScriptUrl) {
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch(`${appScriptUrl}?action=getWatchlist`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP error! status: ${res.status}, body: ${text.substring(0, 100)}`);
      }
      const data = await res.json();
      
      // Fetch quotes for each symbol sequentially with a small delay to avoid rate limits
      const withQuotes = [];
      for (const item of data) {
        try {
          let qData;
          try {
            const qRes = await fetch(`/api/quote?symbol=${encodeURIComponent(item.symbol)}`);
            const text = await qRes.text();
            if (!qRes.ok) throw new Error(text);
            qData = JSON.parse(text);
          } catch (error) {
            console.error(`Failed to fetch quote for ${item.symbol}`, error);
            withQuotes.push(item);
            continue;
          }

          withQuotes.push({
            ...item,
            price: qData.regularMarketPrice,
            change: qData.regularMarketChange,
            changePercent: qData.regularMarketChangePercent
          });
          
          // Wait 500ms between requests to avoid Yahoo Finance rate limits
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
          withQuotes.push(item);
        }
      }
      setItems(withQuotes);
      if (onItemsUpdate) {
        onItemsUpdate(withQuotes);
      }
    } catch (error: any) {
      if (error.message === 'Failed to fetch') {
        console.error('Failed to fetch watchlist. This is likely a CORS error. Ensure your Google Apps Script is deployed with "Who has access" set to "Anyone".');
      } else {
        console.error('Failed to fetch watchlist', error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWatchlist();
    // Refresh quotes every 5 minutes (300000ms) to avoid rate limits
    const interval = setInterval(fetchWatchlist, 300000);
    return () => clearInterval(interval);
  }, [appScriptUrl, refreshTrigger]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol.trim() || !appScriptUrl) return;
    
    const symbol = newSymbol.toUpperCase();
    const newItem = { symbol, type: 'STOCK' };
    
    // Optimistic update
    setItems(prev => [...prev, newItem]);
    setNewSymbol('');
    setIsAdding(false);

    try {
      await fetch(appScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'addWatchlist', symbol, type: 'STOCK' })
      });
      // Sync with server
      fetchWatchlist();
    } catch (error) {
      console.error('Failed to add to watchlist', error);
      // Rollback on error
      fetchWatchlist();
    }
  };

  const handleRemove = async (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!appScriptUrl) return;

    // Optimistic update
    const previousItems = [...items];
    setItems(prev => prev.filter(item => item.symbol !== symbol));

    try {
      await fetch(appScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'removeWatchlist', symbol })
      });
      // Sync with server
      fetchWatchlist();
    } catch (error) {
      console.error('Failed to remove from watchlist', error);
      // Rollback on error
      setItems(previousItems);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-zinc-500">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-900/50">
      <div className="p-4 border-b border-zinc-800 flex justify-between items-center sticky top-0 bg-zinc-900/80 backdrop-blur z-10">
        <h2 className="font-semibold flex items-center gap-2">
          <Star className="w-4 h-4 text-yellow-500" /> Watchlist
        </h2>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="p-1.5 rounded-full hover:bg-zinc-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.form 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            onSubmit={handleAdd}
            className="p-4 border-b border-zinc-800 bg-zinc-800/50 overflow-hidden"
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value)}
                placeholder="Symbol (e.g. PTT.BK)"
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
                autoFocus
              />
              <button 
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              >
                Add
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {items.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-sm">
            Watchlist is empty. Add some symbols to track them.
          </div>
        ) : (
          <AnimatePresence>
            {items.map((item) => {
              const isUp = (item.change || 0) >= 0;
              const isSelected = selectedSymbol === item.symbol;
              
              return (
                <motion.div
                  key={item.symbol}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={() => onSelect(item.symbol)}
                  className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                    isSelected 
                      ? 'bg-zinc-800 border-l-2 border-emerald-500' 
                      : 'hover:bg-zinc-800/50 border-l-2 border-transparent'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-zinc-100">{item.symbol}</span>
                    <span className="text-xs text-zinc-500">{item.type}</span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end">
                      <span className="font-medium text-zinc-100">
                        {item.price ? `฿${item.price.toFixed(2)}` : '---'}
                      </span>
                      {item.changePercent !== undefined && (
                        <span className={`text-xs font-medium flex items-center gap-0.5 ${isUp ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {Math.abs(item.changePercent).toFixed(2)}%
                        </span>
                      )}
                    </div>
                    
                    <button 
                      onClick={(e) => handleRemove(item.symbol, e)}
                      className="p-1.5 rounded-full text-zinc-500 hover:text-rose-400 hover:bg-zinc-700 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
