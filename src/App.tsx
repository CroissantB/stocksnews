/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Search, TrendingUp, Star, Settings, Menu, X, Loader2 } from 'lucide-react';
import ChartComponent from './components/Chart';
import WatchlistComponent, { WatchlistItem } from './components/Watchlist';
import SearchComponent from './components/Search';
import { motion, AnimatePresence } from 'framer-motion';

export default function App() {
  const [selectedSymbol, setSelectedSymbol] = useState('PTT.BK');
  const [isWatchlistOpen, setIsWatchlistOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [isPriceLoading, setIsPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isTogglingWatchlist, setIsTogglingWatchlist] = useState(false);

  const isInWatchlist = watchlistItems.some(item => item.symbol === selectedSymbol);

  useEffect(() => {
    let isMounted = true;
    
    const fetchPrice = async () => {
      setIsPriceLoading(true);
      setPriceError(null);
      setCurrentPrice(null);
      try {
        console.log(`Fetching price for ${selectedSymbol}...`);
        const res = await fetch(`/api/quote?symbol=${encodeURIComponent(selectedSymbol)}`);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        
        const qData = await res.json();
        
        if (isMounted) {
          setCurrentPrice(qData.regularMarketPrice ?? null);
        }
      } catch (e: any) {
        console.error('Failed to fetch current price for', selectedSymbol, e);
        if (isMounted) {
          setCurrentPrice(null);
          setPriceError(e.message || 'Failed to fetch price');
        }
      } finally {
        if (isMounted) setIsPriceLoading(false);
      }
    };
    
    fetchPrice();
    
    return () => {
      isMounted = false;
    };
  }, [selectedSymbol]);

  useEffect(() => {
    const watchlistItem = watchlistItems.find(item => item.symbol === selectedSymbol);
    if (watchlistItem?.price !== undefined) {
      setCurrentPrice(watchlistItem.price);
    }
  }, [watchlistItems, selectedSymbol]);

  const toggleWatchlist = async () => {
    if (isTogglingWatchlist) return;
    setIsTogglingWatchlist(true);
    const appScriptUrl = 'https://script.google.com/macros/s/AKfycbyl797a2YdXYS6p_MJccuYyCbCJyepBIOU-N8l5NhvCGhjwYVEYueOjmfr-o7BNwngn5g/exec';
    try {
      if (isInWatchlist) {
        await fetch(appScriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'removeWatchlist', symbol: selectedSymbol })
        });
      } else {
        await fetch(appScriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'addWatchlist', symbol: selectedSymbol, type: 'STOCK' })
        });
      }
      setRefreshTrigger(prev => prev + 1);
    } catch (e) {
      console.error('Failed to update watchlist', e);
    } finally {
      setIsTogglingWatchlist(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-emerald-500" />
          <h1 className="text-xl font-semibold tracking-tight">ThaiTrade</h1>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsSearchOpen(true)}
            className="p-2 rounded-full hover:bg-zinc-800 transition-colors"
          >
            <Search className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setIsWatchlistOpen(true)}
            className="p-2 rounded-full hover:bg-zinc-800 transition-colors md:hidden"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Chart Area */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
            <h2 className="text-2xl font-bold flex items-center gap-3">
              {selectedSymbol}
              {currentPrice !== null ? (
                <span className="text-xl text-zinc-400 font-normal">
                  ฿{currentPrice.toFixed(2)}
                </span>
              ) : isPriceLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
              ) : priceError ? (
                <span className="text-sm text-red-500 font-normal" title={priceError}>Error</span>
              ) : null}
              <button 
                onClick={toggleWatchlist}
                disabled={isTogglingWatchlist}
                className={`p-1.5 rounded-full transition-colors ${
                  isInWatchlist 
                    ? 'text-yellow-500 hover:bg-yellow-500/10' 
                    : 'text-zinc-500 hover:text-yellow-500 hover:bg-zinc-800'
                } ${isTogglingWatchlist ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={isInWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
              >
                <Star className={`w-5 h-5 ${isInWatchlist ? 'fill-current' : ''}`} />
              </button>
            </h2>
          </div>
          <div className="flex-1 relative">
            <ChartComponent symbol={selectedSymbol} />
          </div>
        </div>

        {/* Desktop Watchlist Sidebar */}
        <div className="hidden md:block w-80 border-l border-zinc-800 bg-zinc-900/30 overflow-y-auto">
          <WatchlistComponent 
            onSelect={setSelectedSymbol} 
            selectedSymbol={selectedSymbol} 
            onItemsUpdate={setWatchlistItems}
            refreshTrigger={refreshTrigger}
          />
        </div>
      </main>

      {/* Mobile Watchlist Drawer */}
      <AnimatePresence>
        {isWatchlistOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsWatchlistOpen(false)}
              className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 w-4/5 max-w-sm bg-zinc-900 border-l border-zinc-800 z-40 md:hidden flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <h2 className="font-semibold flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-500" /> Watchlist
                </h2>
                <button onClick={() => setIsWatchlistOpen(false)} className="p-2 rounded-full hover:bg-zinc-800">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <WatchlistComponent 
                  onSelect={(symbol) => {
                    setSelectedSymbol(symbol);
                    setIsWatchlistOpen(false);
                  }} 
                  selectedSymbol={selectedSymbol} 
                  onItemsUpdate={setWatchlistItems}
                  refreshTrigger={refreshTrigger}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Search Modal */}
      <AnimatePresence>
        {isSearchOpen && (
          <SearchComponent 
            onClose={() => setIsSearchOpen(false)} 
            onSelect={(symbol) => {
              setSelectedSymbol(symbol);
              setIsSearchOpen(false);
            }} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
