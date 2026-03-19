import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';
import { SMA, BollingerBands, RSI } from 'technicalindicators';
import { Loader2, Settings2, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ChartProps {
  symbol: string;
}

interface IndicatorConfig {
  type: 'SMA' | 'BB' | 'RSI';
  params: any;
  visible: boolean;
}

export default function ChartComponent({ symbol }: ChartProps) {
  const priceChartContainerRef = useRef<HTMLDivElement>(null);
  const volumeChartContainerRef = useRef<HTMLDivElement>(null);
  const [priceChart, setPriceChart] = useState<IChartApi | null>(null);
  const [volumeChart, setVolumeChart] = useState<IChartApi | null>(null);
  const [candlestickSeries, setCandlestickSeries] = useState<ISeriesApi<"Candlestick"> | null>(null);
  const [volumeSeries, setVolumeSeries] = useState<ISeriesApi<"Histogram"> | null>(null);
  
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState('1y');
  
  const [indicators, setIndicators] = useState<IndicatorConfig[]>([
    { type: 'SMA', params: { period: 20 }, visible: false },
    { type: 'BB', params: { period: 20, stdDev: 2 }, visible: false },
    { type: 'RSI', params: { period: 14 }, visible: false },
  ]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Series refs for indicators
  const indicatorSeriesRefs = useRef<{ [key: string]: any }>({});
  
  // Simple memory cache for chart data to avoid rate limits when switching back and forth
  const chartCache = useRef<{ [key: string]: any[] }>({});

  const appScriptUrl = 'https://script.google.com/macros/s/AKfycbyl797a2YdXYS6p_MJccuYyCbCJyepBIOU-N8l5NhvCGhjwYVEYueOjmfr-o7BNwngn5g/exec';

  useEffect(() => {
    const fetchSavedIndicators = async () => {
      if (!appScriptUrl) return;
      try {
        const res = await fetch(`${appScriptUrl}?action=getIndicators&symbol=${encodeURIComponent(symbol)}`);
        const saved = await res.json();
        if (saved && saved.length > 0) {
          setIndicators(prev => prev.map(ind => {
            const savedInd = saved.find((s: any) => s.indicator === ind.type);
            if (savedInd) {
              return { ...ind, params: savedInd.params, visible: true };
            }
            return ind;
          }));
        }
      } catch (error: any) {
        if (error.message === 'Failed to fetch') {
          console.error('Failed to fetch saved indicators. This is likely a CORS error. Ensure your Google Apps Script is deployed with "Who has access" set to "Anyone".');
        } else {
          console.error('Failed to fetch saved indicators', error);
        }
      }
    };
    fetchSavedIndicators();
  }, [symbol, appScriptUrl]);

  useEffect(() => {
    const fetchData = async () => {
      const cacheKey = `${symbol}-${range}`;
      if (chartCache.current[cacheKey]) {
        setData(chartCache.current[cacheKey]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        let rawData;
        try {
          const workerUrl = 'https://stockworkers.riwwyminecraft.workers.dev';
          const endpoint = `${workerUrl}/chart?symbol=${encodeURIComponent(symbol)}&range=${range}&interval=1d`;
          const res = await fetch(endpoint);
          const text = await res.text();
          
          if (!res.ok) throw new Error(text);
          rawData = JSON.parse(text);
        } catch (primaryError) {
          console.warn('Primary worker failed, attempting fallback proxy...', primaryError);
          // Fallback to Google Apps Script proxy
          const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
          const fallbackEndpoint = `${appScriptUrl}?action=yahooProxy&url=${encodeURIComponent(yahooUrl)}`;
          
          const res = await fetch(fallbackEndpoint);
          if (!res.ok) throw new Error(`Fallback HTTP error! status: ${res.status}`);
          
          const text = await res.text();
          
          if (!text) {
            throw new Error('Empty response from fallback proxy');
          }
          
          if (text.includes('Too Many Requests')) {
            throw new Error('Rate limit exceeded on both primary and fallback servers. Please try again later.');
          }
          
          let yahooData;
          try {
            yahooData = JSON.parse(text);
          } catch (e) {
            console.error('Failed to parse fallback response:', text.substring(0, 200));
            throw new Error('Invalid JSON from fallback proxy');
          }
          
          // Check if the Apps Script itself returned an error (e.g., user hasn't deployed the latest code)
          if (yahooData.error) {
            if (yahooData.error === 'Unknown action') {
              throw new Error('Please update and redeploy your Google Apps Script with the latest code.gs (missing yahooProxy action).');
            }
            throw new Error(`Apps Script Error: ${yahooData.error}`);
          }
          
          const result = yahooData.chart?.result?.[0];
          if (!result) {
            console.error('Invalid fallback data format. Full response:', yahooData);
            if (yahooData.chart?.error) {
              throw new Error(`Yahoo Finance Error: ${yahooData.chart.error.description || yahooData.chart.error.code}`);
            }
            throw new Error('Invalid fallback data format');
          }
          
          const timestamps = result.timestamp || [];
          const quote = result.indicators?.quote?.[0] || {};
          
          rawData = timestamps.map((t: number, i: number) => {
            const date = new Date(t * 1000);
            return {
              time: date.toISOString().split('T')[0],
              open: quote.open?.[i] ?? null,
              high: quote.high?.[i] ?? null,
              low: quote.low?.[i] ?? null,
              close: quote.close?.[i] ?? null,
              volume: quote.volume?.[i] ?? null,
            };
          });
        }
        
        // Sort and format data for lightweight-charts
        const formattedData = rawData
          .filter((d: any) => d.open !== null && d.close !== null)
          .sort((a: any, b: any) => {
            const timeA = typeof a.time === 'string' ? new Date(a.time).getTime() : a.time;
            const timeB = typeof b.time === 'string' ? new Date(b.time).getTime() : b.time;
            return timeA - timeB;
          })
          .reduce((acc: any[], current: any) => {
            // Deduplicate by time to prevent Lightweight Charts assertion error
            if (acc.length === 0 || acc[acc.length - 1].time !== current.time) {
              acc.push({
                time: current.time,
                open: current.open,
                high: current.high,
                low: current.low,
                close: current.close,
                value: current.volume,
                color: current.close >= current.open ? '#10b981' : '#ef4444'
              });
            }
            return acc;
          }, []);
          
        chartCache.current[cacheKey] = formattedData;
        setData(formattedData);
      } catch (error: any) {
        if (error.message === 'Failed to fetch') {
          setError('Failed to fetch chart data. This is likely a CORS error or an invalid VITE_WORKER_URL.');
        } else {
          setError(error.message || 'Failed to fetch chart data');
        }
        console.error('Failed to fetch chart data', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [symbol, range]);

  useEffect(() => {
    if (!priceChartContainerRef.current || !volumeChartContainerRef.current || data.length === 0) return;

    const commonOptions = {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#a1a1aa' },
      grid: { vertLines: { color: '#27272a' }, horzLines: { color: '#27272a' } },
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: '#27272a' },
    };

    const newPriceChart = createChart(priceChartContainerRef.current, {
      ...commonOptions,
      width: priceChartContainerRef.current.clientWidth,
      height: priceChartContainerRef.current.clientHeight,
    });

    const newVolumeChart = createChart(volumeChartContainerRef.current, {
      ...commonOptions,
      width: volumeChartContainerRef.current.clientWidth,
      height: volumeChartContainerRef.current.clientHeight,
      timeScale: { visible: false }, // Hide time scale on volume chart
    });

    const newCandlestickSeries = newPriceChart.addCandlestickSeries({
      upColor: '#10b981', downColor: '#ef4444', borderVisible: false, wickUpColor: '#10b981', wickDownColor: '#ef4444',
    });

    const newVolumeSeries = newVolumeChart.addHistogramSeries({
      color: '#26a69a', priceFormat: { type: 'volume' }, priceScaleId: '',
    });

    newCandlestickSeries.setData(data);
    newVolumeSeries.setData(data.map(d => ({ time: d.time, value: d.value, color: d.color })));

    // Synchronize charts
    newPriceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      newVolumeChart.timeScale().setVisibleLogicalRange(range as any);
    });
    newVolumeChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      newPriceChart.timeScale().setVisibleLogicalRange(range as any);
    });

    setPriceChart(newPriceChart);
    setVolumeChart(newVolumeChart);
    setCandlestickSeries(newCandlestickSeries);
    setVolumeSeries(newVolumeSeries);

    const handleResize = () => {
      newPriceChart.applyOptions({ width: priceChartContainerRef.current!.clientWidth });
      newVolumeChart.applyOptions({ width: volumeChartContainerRef.current!.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      newPriceChart.remove();
      newVolumeChart.remove();
    };
  }, [data]);

  // Handle Indicators
  useEffect(() => {
    if (!priceChart || !candlestickSeries || data.length === 0) return;

    // Clear existing indicator series
    Object.values(indicatorSeriesRefs.current).forEach(series => {
      if (series) priceChart.removeSeries(series);
    });
    indicatorSeriesRefs.current = {};

    const closePrices = data.map(d => d.close);

    indicators.forEach(ind => {
      if (!ind.visible) return;

      if (ind.type === 'SMA') {
        const smaData = SMA.calculate({ period: ind.params.period, values: closePrices });
        const smaSeries = priceChart.addLineSeries({ color: '#3b82f6', lineWidth: 2, title: `SMA ${ind.params.period}` });
        
        const formattedSma = data.slice(ind.params.period - 1).map((d, i) => ({
          time: d.time,
          value: smaData[i]
        }));
        smaSeries.setData(formattedSma);
        indicatorSeriesRefs.current['SMA'] = smaSeries;
      }

      if (ind.type === 'BB') {
        const bbData = BollingerBands.calculate({ period: ind.params.period, stdDev: ind.params.stdDev, values: closePrices });
        const upperSeries = priceChart.addLineSeries({ color: '#8b5cf6', lineWidth: 1, title: 'BB Upper' });
        const lowerSeries = priceChart.addLineSeries({ color: '#8b5cf6', lineWidth: 1, title: 'BB Lower' });
        const middleSeries = priceChart.addLineSeries({ color: '#8b5cf6', lineWidth: 1, lineStyle: 2, title: 'BB Middle' });

        const offset = ind.params.period - 1;
        upperSeries.setData(data.slice(offset).map((d, i) => ({ time: d.time, value: bbData[i].upper })));
        lowerSeries.setData(data.slice(offset).map((d, i) => ({ time: d.time, value: bbData[i].lower })));
        middleSeries.setData(data.slice(offset).map((d, i) => ({ time: d.time, value: bbData[i].middle })));

        indicatorSeriesRefs.current['BB_upper'] = upperSeries;
        indicatorSeriesRefs.current['BB_lower'] = lowerSeries;
        indicatorSeriesRefs.current['BB_middle'] = middleSeries;
      }

      if (ind.type === 'RSI') {
        const rsiData = RSI.calculate({ period: ind.params.period, values: closePrices });
        const rsiSeries = priceChart.addLineSeries({ 
          color: '#f59e0b', 
          lineWidth: 2, 
          title: `RSI ${ind.params.period}`,
          priceScaleId: 'rsi',
        });
        
        priceChart.priceScale('rsi').applyOptions({
          scaleMargins: { top: 0.8, bottom: 0 },
        });

        const formattedRsi = data.slice(ind.params.period).map((d, i) => ({
          time: d.time,
          value: rsiData[i]
        }));
        rsiSeries.setData(formattedRsi);
        indicatorSeriesRefs.current['RSI'] = rsiSeries;
      }
    });

  }, [priceChart, data, indicators]);

  const toggleIndicator = (type: string) => {
    setIndicators(prev => prev.map(ind => 
      ind.type === type ? { ...ind, visible: !ind.visible } : ind
    ));
  };

  const saveIndicators = async () => {
    if (!appScriptUrl) return;
    setIsSaving(true);
    try {
      const activeIndicators = indicators.filter(i => i.visible).map(i => ({ type: i.type, params: i.params }));
      await fetch(appScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'saveIndicators',
          symbol,
          indicators: activeIndicators
        })
      });
      setIsSettingsOpen(false);
    } catch (error) {
      console.error('Failed to save indicators', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Chart Controls */}
      <div className="flex items-center justify-between p-2 border-b border-zinc-800/50 bg-zinc-900/30">
        <div className="flex gap-1">
          {['1d', '1w', '1mo', '1y', '5y'].map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                range === r ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
        
        <div className="relative">
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <Settings2 className="w-4 h-4" />
          </button>

          <AnimatePresence>
            {isSettingsOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 top-full mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 p-4"
              >
                <h3 className="text-sm font-semibold mb-3 text-zinc-100">Indicators</h3>
                <div className="space-y-3">
                  {indicators.map(ind => (
                    <div key={ind.type} className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ind.visible}
                          onChange={() => toggleIndicator(ind.type)}
                          className="rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                        />
                        {ind.type}
                      </label>
                      <span className="text-xs text-zinc-500 font-mono">
                        {Object.values(ind.params).join(',')}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={saveIndicators}
                  disabled={isSaving}
                  className="mt-4 w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save to Sheets
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Chart Container */}
      <div className="flex-1 flex flex-col relative">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/50 backdrop-blur-sm">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4 text-center">
            <div className="bg-red-500/10 text-red-400 p-4 rounded-lg border border-red-500/20 max-w-md">
              <p className="font-semibold mb-1">Error Loading Chart</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}
        <div ref={priceChartContainerRef} className="flex-[3]" />
        <div ref={volumeChartContainerRef} className="flex-1 border-t border-zinc-800/50" />
      </div>
    </div>
  );
}
