import React, { useState, useEffect, useMemo, useRef } from 'react';

function Tricasts() {
  const dateInputRef = useRef(null);
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
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`https://www.pluckier.co.uk/${displayDate}-races.json`);
        if (!response.ok) throw new Error('No data found for this date');
        const data = await response.json();
        setRaces(data || []);
      } catch (err) {
        setError(err.message);
        setRaces([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [displayDate]);
  
  const handleOpenDatePicker = () => {
    if (dateInputRef.current) {
      if (typeof dateInputRef.current.showPicker === 'function') {
        dateInputRef.current.showPicker();
      } else {
        dateInputRef.current.click();
      }
    }
  };

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
    const minRunners = mode === 'tricast' ? 8 : 2;
    return races
      .filter(race => {
        const detail = (race.detail || '').toLowerCase();
        const runnerCount = race.horses?.length || 0;
        const isEligibleType = detail.includes('handicap') || detail.includes('class 1') || detail.includes('nursery');
        return runnerCount >= minRunners && isEligibleType;
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

  return (
    <div className="tricasts-container">
      <header className="tricasts-header">
        <h1 onClick={handleOpenDatePicker} style={{ cursor: 'pointer' }} title="Click to change date">
          {mode === 'tricast' ? 'Tricasts' : 'Forecasts'} for {displayDate} 📅
        </h1>
        <input 
          type="date" 
          ref={dateInputRef}
          value={selectedDate} 
          onChange={(e) => setSelectedDate(e.target.value)}
          className="hidden-date-input"
        />
        <div className="payout-filter-wrapper">
          <button 
            onClick={() => setMode(prev => prev === 'tricast' ? 'forecast' : 'tricast')}
            className="filter-btn active"
          >
            {mode === 'tricast' ? '🎯 Forecast' : '🎯 Tricast'}
          </button>

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
                        <h4>Recent & Highest • {Math.round(race.recentP)}/1</h4>
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
                        <h4>Recent • {Math.round(race.recentP)}/1</h4>
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
                        <h4>Highest • {Math.round(race.highestP)}/1</h4>
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
}

export default Tricasts
