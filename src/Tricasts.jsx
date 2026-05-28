import React, { useState, useEffect, useMemo, useRef, forwardRef } from 'react';
import TrackWorker from './TrackWorker';
import AuthGuard from './AuthGuard';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

// 🟢 SET TO 'false' TO DISABLE AUTH GUARD
const AUTH_ACTIVE = false;

function Tricasts() {
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const [races, setRaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [toasts, setToasts] = useState([]);
  const lastDataRef = useRef([]);
  const prevProcessedRef = useRef([]);

  // Track which races have bets placed (Set of "Time Place" strings)
  const [placedBets, setPlacedBets] = useState(() => {
    const saved = localStorage.getItem('tricast-bets');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  useEffect(() => {
    localStorage.setItem('tricast-bets', JSON.stringify([...placedBets]));
  }, [placedBets]);

  const toggleBet = (strategyId) => {
    setPlacedBets(prev => {
      const next = new Set(prev);
      if (next.has(strategyId)) next.delete(strategyId);
      else next.add(strategyId);
      return next;
    });
  };

  const [mode, setMode] = useState('tricast'); // 'tricast' or 'forecast'

  // Filter state for minimum payout - steps change based on mode
  const payoutSteps = useMemo(() => 
    mode === 'tricast' 
      ? [0, 50, 100, 250, 500, 1000] 
      : [0, 10, 20, 50, 100, 250]
  , [mode]);

  const [payoutIndex, setPayoutIndex] = useState(0);
  const minPayout = payoutSteps[payoutIndex];

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('tricast-theme');
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tricast-theme', theme);
  }, [theme]);

  // Convert YYYY-MM-DD to DD-MM-YYYY for URL and Header
  const displayDate = useMemo(() => {
    const [y, m, d] = selectedDate.split('-');
    return `${d}-${m}-${y}`;
  }, [selectedDate]);

  useEffect(() => {
    const fetchData = async (isInitial = true) => {
      if (isInitial) {
        setLoading(true);
        setRaces([]); // Clear existing grid immediately when switching dates
        lastDataRef.current = []; // Reset baseline to prevent notifications across days
        prevProcessedRef.current = [];
      }
      setError(null);
      try {
        const response = await fetch(`https://www.pluckier.co.uk/${displayDate}-races.json`);
        if (!response.ok) throw new Error('No data found for this date');
        const data = await response.json();
        setRaces(data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        if (isInitial) setLoading(false);
      }
    };

    fetchData(true);
    const intervalId = setInterval(() => fetchData(false), 15 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [displayDate]);
  
  // Custom input component for react-datepicker to maintain the H1 styling
  const CustomDateInput = forwardRef(({ value, onClick }, ref) => (
    <h1 onClick={onClick} ref={ref} style={{ cursor: 'pointer' }} title="Click to change date">
      {mode === 'tricast' ? 'Tricasts' : 'Forecasts'} for {value} 📅
    </h1>
  ));

  // Convert YYYY-MM-DD string to Date object for react-datepicker
  const dateObject = useMemo(() => {
    if (!selectedDate) return new Date();
    const [y, m, d] = selectedDate.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [selectedDate]);

  const getSelections = (horses, useAvg, count) => {
    const ratedHorses = (horses || [])
      .filter(horse => {
        const currentOdds = horse.odds?.[horse.odds.length - 1];
        // Skip non-runners
        return currentOdds !== "null" && currentOdds !== "NR";
      })
      .map(horse => {
        const past = horse.past || [];
        let score = 0;

        if (useAvg) {
          const lastThree = past.slice(0, 3);
          score = lastThree.length > 0
            ? lastThree.reduce((acc, r) => acc + (Number(r.name) || 0), 0) / lastThree.length
            : 0;
        } else {
          score = past.length > 0 ? Math.max(...past.map(r => Number(r.name) || 0)) : 0;
        }
        return { ...horse, rating: score };
      });

    return ratedHorses.sort((a, b) => b.rating - a.rating).slice(0, count);
  };

  const processedRaces = useMemo(() => {
    const horseCount = mode === 'tricast' ? 3 : 2;
    return races
      .filter(race => {
        const detail = (race.detail || '').toLowerCase();
        const runnerCount = race.horses?.length || 0;

        if (mode === 'tricast') {
          const isEligibleType = detail.includes('handicap') || detail.includes('class 1') || detail.includes('nursery');
          return runnerCount >= 8 && isEligibleType;
        }
        
        return runnerCount >= 2;
      })
      .map(race => {
        const recentS = getSelections(race.horses, true, horseCount);
        const highestS = getSelections(race.horses, false, horseCount);
        
        const recentP = recentS.length === horseCount 
          ? recentS.reduce((acc, h) => acc * (parseFloat(h.odds?.[h.odds.length - 1]) || 0), 1)
          : 0;
        const highestP = highestS.length === horseCount 
          ? highestS.reduce((acc, h) => acc * (parseFloat(h.odds?.[h.odds.length - 1]) || 0), 1)
          : 0;

        // Check if both strategies picked the same set of horses
        const isSame = recentS.length === horseCount && highestS.length === horseCount &&
          recentS.every(h => highestS.some(hh => hh.name === h.name));

        return { ...race, recentS, recentP, highestS, highestP, isSame };
      })
      .filter(race => race.recentP >= minPayout || race.highestP >= minPayout);
  }, [races, minPayout, mode]);

  useEffect(() => {
    // Only run comparison if we already had data (not initial load)
    // and if the races data actually changed reference (background refresh)
    if (races.length > 0 && lastDataRef.current.length > 0 && races !== lastDataRef.current) {
      
      const getOppsMap = (processed) => {
        const map = new Map();
        processed.forEach(race => {
          const raceKey = `${race.time} ${race.place}`;
          if (race.isSame && race.recentP >= minPayout && race.recentP > 0) {
            const id = `${raceKey}-both`;
            map.set(id, { raceKey, label: `${raceKey} (Both)`, horses: race.recentS.map(h => h.name).sort().join(', '), payout: Math.round(race.recentP) });
          } else {
            if (race.recentP >= minPayout && race.recentP > 0) {
              const id = `${raceKey}-recent`;
              map.set(id, { raceKey, label: `${raceKey} (Recent)`, horses: race.recentS.map(h => h.name).sort().join(', '), payout: Math.round(race.recentP) });
            }
            if (race.highestP >= minPayout && race.highestP > 0) {
              const id = `${raceKey}-highest`;
              map.set(id, { raceKey, label: `${raceKey} (Highest)`, horses: race.highestS.map(h => h.name).sort().join(', '), payout: Math.round(race.highestP) });
            }
          }
        });
        return map;
      };

      const oldMap = getOppsMap(prevProcessedRef.current);
      const newMap = getOppsMap(processedRaces);
      const newToasts = [];

      newMap.forEach((val, id) => {
        if (!oldMap.has(id)) {
          // Note: New races likely won't be ticked yet, but this handles strategy changes within a ticked race
          newToasts.push({ id: Date.now() + Math.random(), type: 'new', message: `✨ New Strategy: ${val.label} @ ${val.payout}/1` });
        } else {
          const old = oldMap.get(id);
          if (old.horses !== val.horses) {
            newToasts.push({ id: Math.random(), type: 'change', message: `🔄 Runners ${old.horses} changed to ${val.horses}: ${val.label}` });
          }
        }
      });

      oldMap.forEach((val, id) => {
        if (!newMap.has(id)) {
          const raceStillExists = races.some(r => `${r.time} ${r.place}` === val.raceKey);
          if (raceStillExists) {
            newToasts.push({ id: Date.now() + Math.random(), type: 'removed', message: `📉 Payout dropped below ${minPayout}/1: ${val.label}` });
          } else {
            newToasts.push({ id: Date.now() + Math.random(), type: 'removed', message: `🏁 Race Finished: ${val.label}` });
          }
        }
      });

      if (newToasts.length > 0) {
        setToasts(prev => [...prev, ...newToasts]);
      }
    }

    lastDataRef.current = races;
    prevProcessedRef.current = processedRaces;
  }, [races, processedRaces, mode, minPayout]);

  const tricastCount = useMemo(() => {
    return processedRaces.reduce((acc, race) => {
      if (race.isSame) {
        return acc + (race.recentP >= minPayout && race.recentP > 0 ? 1 : 0);
      }
      const hasRecent = race.recentP >= minPayout && race.recentP > 0;
      const hasHighest = race.highestP >= minPayout && race.highestP > 0;
      return acc + (hasRecent ? 1 : 0) + (hasHighest ? 1 : 0);
    }, 0);
  }, [processedRaces, minPayout]);

  const renderContent = (auth = {}) => (
    <div className="tricasts-container">
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <span className="toast-message">{toast.message}</span>
            <button className="toast-close" onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}>×</button>
          </div>
        ))}
      </div>

      <header className="tricasts-header">
        <DatePicker
          selected={dateObject}
          onChange={(date) => {
            if (date) {
              const y = date.getFullYear();
              const m = String(date.getMonth() + 1).padStart(2, '0');
              const d = String(date.getDate()).padStart(2, '0');
              setSelectedDate(`${y}-${m}-${d}`);
            }
          }}
          customInput={<CustomDateInput />}
          dateFormat="dd-MM-yyyy"
          withPortal
          portalId="root"
        />
        <div className="payout-filter-wrapper">
          <button 
            onClick={() => setMode(prev => prev === 'tricast' ? 'forecast' : 'tricast')}
            className="filter-btn active"
          >
            {mode === 'tricast' ? '🎯 Forecast' : '🎯 Tricast'}
          </button>

          <TrackWorker />

          <div className="payout-slider-container">
            <span className="payout-label">
              Min Payout: {minPayout === 0 ? 'All' : `${minPayout}/1+`}
              <span className="tricast-count">({tricastCount})</span>
            </span>
            <input 
              type="range"
              min="0"
              max={payoutSteps.length - 1}
              step="1"
              value={payoutIndex}
              onChange={(e) => setPayoutIndex(parseInt(e.target.value, 10))}
              className="payout-slider"
            />
          </div>

          <button 
            onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
            className="filter-btn active theme-toggle"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <main className="tricasts-content">
        {loading && <div className="status-msg">Fetching race data...</div>}
        {error && <div className="status-msg error">⚠️ {error}</div>}
        {!loading && !error && processedRaces.length > 0 && (
          <div className="races-grid">
            {processedRaces.map((race, idx) => {
              const raceKey = `${race.time} ${race.place}`;
              return (
                <div key={idx} className="race-card">
                  <div className="race-header-row">
                    <span className="race-time">{race.time}</span>
                    <span className="race-place">{race.place}</span>
                  </div>
                  <span className="race-detail">{race.detail}</span>
                  
                  <div className="tricast-selections">
                    {race.isSame && race.recentP >= minPayout && race.recentP > 0 ? (
                      <div className="strategy-section">
                        <div className="strategy-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input 
                            type="checkbox" 
                            className="bet-checkbox"
                            checked={placedBets.has(`${raceKey}-both`)}
                            onChange={() => toggleBet(`${raceKey}-both`)}
                            title="Bet done?"
                          />
                          <h4 style={{ margin: 0 }}>Recent & Highest • {Math.round(race.recentP)}/1</h4>
                        </div>
                        {race.recentS.map((horse, hIdx) => {
                          const odds = horse.odds?.[horse.odds.length - 1];
                          const disp = odds === "null" || odds === "NR" ? "NR" : (odds || "x");
                          return (
                            <div key={hIdx} className="selection-row">
                              <div className="selection-name-container">
                                <span className="selection-no">{horse.number}.</span>
                                {horse.silks && <img src={horse.silks} alt="silks" className="selection-silks" />}
                                <span className="selection-name">{horse.name}</span>
                              </div>
                              <span className="selection-odds">{disp}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <>
                        {race.recentP >= minPayout && race.recentP > 0 && (
                      <div className="strategy-section">
                        <div className="strategy-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input 
                            type="checkbox" 
                            className="bet-checkbox"
                            checked={placedBets.has(`${raceKey}-recent`)}
                            onChange={() => toggleBet(`${raceKey}-recent`)}
                            title="Bet done?"
                          />
                          <h4 style={{ margin: 0 }}>Recent • {Math.round(race.recentP)}/1</h4>
                        </div>
                        {race.recentS.map((horse, hIdx) => {
                          const odds = horse.odds?.[horse.odds.length - 1];
                          const disp = odds === "null" || odds === "NR" ? "NR" : (odds || "x");
                          return (
                            <div key={hIdx} className="selection-row">
                              <div className="selection-name-container">
                                <span className="selection-no">{horse.number}.</span>
                                {horse.silks && <img src={horse.silks} alt="silks" className="selection-silks" />}
                                <span className="selection-name">{horse.name}</span>
                              </div>
                              <span className="selection-odds">{disp}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                        {race.highestP >= minPayout && race.highestP > 0 && (
                      <div className={`strategy-section ${race.recentP >= minPayout && race.recentP > 0 ? 'strategy-divider' : ''}`}>
                        <div className="strategy-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input 
                            type="checkbox" 
                            className="bet-checkbox"
                            checked={placedBets.has(`${raceKey}-highest`)}
                            onChange={() => toggleBet(`${raceKey}-highest`)}
                            title="Bet done?"
                          />
                          <h4 style={{ margin: 0 }}>Highest • {Math.round(race.highestP)}/1</h4>
                        </div>
                        {race.highestS.map((horse, hIdx) => {
                          const odds = horse.odds?.[horse.odds.length - 1];
                          const disp = odds === "null" || odds === "NR" ? "NR" : (odds || "x");
                          return (
                            <div key={hIdx} className="selection-row">
                              <div className="selection-name-container">
                                <span className="selection-no">{horse.number}.</span>
                                {horse.silks && <img src={horse.silks} alt="silks" className="selection-silks" />}
                                <span className="selection-name">{horse.name}</span>
                              </div>
                              <span className="selection-odds">{disp}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!loading && !error && processedRaces.length === 0 && <p>No {mode} races found matching your criteria.</p>}
      </main>
    </div>
  );

  if (!AUTH_ACTIVE) return renderContent();

  return (
    <AuthGuard>
      {(authData) => renderContent(authData)}
    </AuthGuard>
  );
}

export default Tricasts
