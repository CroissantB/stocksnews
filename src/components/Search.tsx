import { useState, useEffect, useRef } from 'react';
import { Search as SearchIcon, X, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface SearchProps {
  onClose: () => void;
  onSelect: (symbol: string) => void;
}

export default function SearchComponent({ onClose, onSelect }: SearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const appScriptUrl = 'https://script.google.com/macros/s/AKfycbyl797a2YdXYS6p_MJccuYyCbCJyepBIOU-N8l5NhvCGhjwYVEYueOjmfr-o7BNwngn5g/exec';

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        let data;
        try {
          const workerUrl = 'https://stockworkers.riwwyminecraft.workers.dev';
          const endpoint = `${workerUrl}/search?q=${encodeURIComponent(query)}`;
          const res = await fetch(endpoint);
          const text = await res.text();
          
          if (!res.ok) throw new Error(text);
          data = JSON.parse(text);
        } catch (primaryError) {
          console.warn('Primary search worker failed, attempting fallback proxy...', primaryError);
          const yahooUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}`;
          const fallbackEndpoint = `${appScriptUrl}?action=yahooProxy&url=${encodeURIComponent(yahooUrl)}`;
          
          const res = await fetch(fallbackEndpoint);
          if (!res.ok) throw new Error(`Fallback HTTP error! status: ${res.status}`);
          
          const text = await res.text();
          
          if (!text) {
             throw new Error('Empty response from fallback proxy');
          }
          
          if (text.includes('Too Many Requests')) {
             throw new Error('Rate limit exceeded on both primary and fallback servers.');
          }
          
          let yahooData;
          try {
            yahooData = JSON.parse(text);
          } catch (e) {
            console.error('Failed to parse fallback response:', text.substring(0, 200));
            throw new Error('Invalid JSON from fallback proxy');
          }
          
          if (yahooData.error) {
            if (yahooData.error === 'Unknown action') {
              throw new Error('Please update and redeploy your Google Apps Script with the latest code.gs (missing yahooProxy action).');
            }
            throw new Error(`Apps Script Error: ${yahooData.error}`);
          }
          
          data = yahooData.quotes || [];
        }
        
        setResults(data);
      } catch (error: any) {
        if (error.message === 'Failed to fetch') {
          setError('Search failed. This is likely a CORS error or an invalid VITE_WORKER_URL.');
        } else {
          setError(error.message || 'Search error');
        }
        console.error('Search error:', error);
      } finally {
        setIsLoading(false);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, y: -20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
      >
        <div className="flex items-center p-4 border-b border-zinc-800">
          <SearchIcon className="w-5 h-5 text-zinc-400 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stocks, forex, gold (e.g., PTT.BK, XAUUSD=X)..."
            className="flex-1 bg-transparent border-none outline-none text-zinc-100 placeholder-zinc-500"
          />
          {query && (
            <button onClick={() => setQuery('')} className="p-1 rounded-full hover:bg-zinc-800 mr-2">
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          )}
          <button onClick={onClose} className="p-1 rounded-full hover:bg-zinc-800">
            <span className="text-xs font-medium text-zinc-400 px-2">ESC</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex items-center justify-center p-8 text-zinc-500">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-400">
              {error}
            </div>
          ) : results.length > 0 ? (
            <ul className="space-y-1">
              {results.map((item, idx) => (
                <li key={idx}>
                  <button
                    onClick={() => onSelect(item.symbol)}
                    className="w-full text-left px-4 py-3 rounded-xl hover:bg-zinc-800 flex items-center justify-between group transition-colors"
                  >
                    <div>
                      <div className="font-semibold text-zinc-100 group-hover:text-emerald-400 transition-colors">
                        {item.symbol}
                      </div>
                      <div className="text-sm text-zinc-500 truncate max-w-[200px] md:max-w-xs">
                        {item.shortname || item.longname}
                      </div>
                    </div>
                    <div className="text-xs font-medium px-2 py-1 rounded bg-zinc-800 text-zinc-400 group-hover:bg-zinc-700">
                      {item.quoteType}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : query ? (
            <div className="p-8 text-center text-zinc-500">
              No results found for "{query}"
            </div>
          ) : (
            <div className="p-8 text-center text-zinc-500">
              <div className="text-sm mb-2">Popular in Thailand</div>
              <div className="flex flex-wrap justify-center gap-2">
                {['PTT.BK', 'AOT.BK', 'CPALL.BK', 'THB=X', 'XAUUSD=X'].map(sym => (
                  <button 
                    key={sym}
                    onClick={() => onSelect(sym)}
                    className="px-3 py-1.5 rounded-full bg-zinc-800 text-sm hover:bg-zinc-700 transition-colors"
                  >
                    {sym}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
