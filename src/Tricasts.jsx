import React, { useState, useEffect, useMemo, useRef, forwardRef } from 'react';
import TrackWorker from './TrackWorker';
import AuthGuard from './AuthGuard';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

// 🟢 SET TO 'false' TO DISABLE AUTH GUARD
const AUTH_ACTIVE = false;

const HOT_TRAINERS = [
  "A P O'Brien", "T D Easterby", "L Russell & M Scudamore",
  "W P Mullins", "G Elliott", "R Hannon", "G P Cromwell",
  "G & J Moore", "R A Fahey", "Ian Williams", "A W Carroll",
  "K R Burke", "E Bolger", "James Owen", "J P O'Brien", "P Twomey",
  "D Skelton", "P F Nicholls", "A M Balding", "W J Haggas", "N P Mulholland",
  "J & T Gosden", "C Appleby", "R M Beckett", "C Johnston", "H De Bromhead",
  "Gavin Cromwell", "Charlie Johnston", "Ralph Beckett", "John & Thady Gosden",
  "Neil Mulholland", "Andrew Balding", "Tony Carroll", "Dan Skelton", "Richard Hannon",
  "Joseph Patrick O'Brien", "William Haggas", "Henry De Bromhead", "Gordon Elliott",
  "Lucinda Russell & Michael Scudamore", "Tim Easterby", "Richard & Peter Fahey",
  "Charlie Appleby", "Martin Keighley", "Ben Pauling", "Jonjo & A J O'Neill"
];

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

  const [mode, setMode] = useState('tricast'); // 'tricast' or 'forecast' (Combination)

  // Filter state for minimum payout - thresholds for Tricast strategies
  const payoutSteps = [0, 50, 100, 250, 500, 1000];

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
        // Using 'no-store' tells the browser to bypass its cache and fetch from the network.
        // Alternatively, you could append ?t=${Date.now()} to the URL for a guaranteed unique request.
        const response = await fetch(
          `https://www.pluckier.co.uk/${displayDate}-races.json`,
          { cache: 'no-store' }
        );

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
  const CustomDateInput = forwardRef(({ value, onClick }, ref) => {
    return (
      <h1
        onClick={onClick}
        ref={ref}
        style={{ cursor: 'pointer', fontSize: 'clamp(1.2rem, 6vw, 2rem)', lineHeight: '1.2' }}
        title="Click to change date"
      >
        {mode === 'tricast' ? 'Tricasts' : 'Combination Tricasts'} for {value} 📅
      </h1>
    );
  });

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

    const selected = ratedHorses.sort((a, b) => b.rating - a.rating).slice(0, count);

    return selected.sort((a, b) => {
      const priceA = parseFloat(a.odds?.[a.odds.length - 1]) || 999;
      const priceB = parseFloat(b.odds?.[b.odds.length - 1]) || 999;
      return priceA - priceB;
    });
  };

  /**
   * Favoured Strategy: Shortest odds, Top peak rating, Top peak rating from HOT_TRAINER.
   * Fallback: Best most recent performance.
   */
  const getFavouredSelections = (horses, count) => {
    const activeRunners = (horses || []).filter(h => {
      const lastOdd = h.odds?.[h.odds.length - 1];
      return lastOdd !== "null" && lastOdd !== "NR";
    });

    if (activeRunners.length === 0) return [];

    const selectedMap = new Map();
    const getPeak = (h) => Math.max(...(h.past || []).map(p => parseFloat(p.name) || 0), 0);
    const getRecent = (h) => (h.past && h.past.length > 0) ? (parseFloat(h.past[0].name) || 0) : 0;

    // 1. Shortest odds runner (Favorite)
    const favorite = [...activeRunners].sort((a, b) => {
      const valA = parseFloat(a.odds?.[a.odds.length - 1]) || 999;
      const valB = parseFloat(b.odds?.[b.odds.length - 1]) || 999;
      return valA - valB;
    })[0];
    if (favorite) selectedMap.set(favorite.name, favorite);

    // 2. Highest past race performance (Peak)
    const peakHorse = [...activeRunners].sort((a, b) => getPeak(b) - getPeak(a))[0];
    if (peakHorse) selectedMap.set(peakHorse.name, peakHorse);

    // 3. Highest past performance with a HOT_TRAINER
    const hotRunners = activeRunners.filter(h =>
      HOT_TRAINERS.some(ht => h.trainer?.includes(ht))
    );
    if (hotRunners.length > 0) {
      const hotPeakHorse = hotRunners.sort((a, b) => getPeak(b) - getPeak(a))[0];
      if (hotPeakHorse) selectedMap.set(hotPeakHorse.name, hotPeakHorse);
    }

    // Fallback: Best most recent past race performance
    if (selectedMap.size < count) {
      const remaining = activeRunners
        .filter(h => !selectedMap.has(h.name))
        .sort((a, b) => getRecent(b) - getRecent(a));

      for (const h of remaining) {
        if (selectedMap.size >= count) break;
        selectedMap.set(h.name, h);
      }
    }

    return Array.from(selectedMap.values()).slice(0, count).sort((a, b) => {
      const priceA = parseFloat(a.odds?.[a.odds.length - 1]) || 999;
      const priceB = parseFloat(b.odds?.[b.odds.length - 1]) || 999;
      return priceA - priceB;
    });
  };

  const processedRaces = useMemo(() => {
    // Both modes now use top-3 (Tricast) strategy logic
    const horseCount = 3;
    return races
      .filter(race => {
        const detail = (race.detail || '').toLowerCase();
        const runnerCount = race.horses?.length || 0;
        const isEligibleType = detail.includes('handicap') || detail.includes('class 1') || detail.includes('nursery');
        return runnerCount >= 8 && isEligibleType;
      })
      .map(race => {
        const recentS = getSelections(race.horses, true, horseCount);
        const highestS = getSelections(race.horses, false, horseCount);
        const favouredS = getFavouredSelections(race.horses, horseCount);

        const recentP = recentS.length === horseCount
          ? recentS.reduce((acc, h) => acc * (parseFloat(h.odds?.[h.odds.length - 1]) || 0), 1)
          : 0;
        const highestP = highestS.length === horseCount
          ? highestS.reduce((acc, h) => acc * (parseFloat(h.odds?.[h.odds.length - 1]) || 0), 1)
          : 0;
        const favouredP = favouredS.length === horseCount
          ? favouredS.reduce((acc, h) => acc * (parseFloat(h.odds?.[h.odds.length - 1]) || 0), 1)
          : 0;

        // Check if both strategies picked the same set of horses
        const isSame = recentS.length === horseCount && highestS.length === horseCount &&
          recentS.every(h => highestS.some(hh => hh.name === h.name));


        // Merge strategies for the combination mode (3-6 horses)
        const combinedMap = new Map();
        [...recentS, ...highestS, ...favouredS].forEach(h => {
          if (!combinedMap.has(h.name)) {
            combinedMap.set(h.name, h);
          }
        });
        const combinedS = Array.from(combinedMap.values()).sort((a, b) => {
          const priceA = parseFloat(a.odds?.[a.odds.length - 1]) || 999;
          const priceB = parseFloat(b.odds?.[b.odds.length - 1]) || 999;
          return priceA - priceB;
        });

        return { ...race, recentS, recentP, highestS, highestP, favouredS, favouredP, combinedS, isSame };
      })
      .filter(race => race.recentP >= minPayout || race.highestP >= minPayout || race.favouredP >= minPayout);
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
            map.set(id, { raceKey, label: `${raceKey} (Both)`, selections: race.recentS, payout: Math.round(race.recentP) });
          } else {
            if (race.recentP >= minPayout && race.recentP > 0) {
              const id = `${raceKey}-recent`;
              map.set(id, { raceKey, label: `${raceKey} (Recent)`, selections: race.recentS, payout: Math.round(race.recentP) });
            }
            if (race.highestP >= minPayout && race.highestP > 0) {
              const id = `${raceKey}-highest`;
              map.set(id, { raceKey, label: `${raceKey} (Highest)`, selections: race.highestS, payout: Math.round(race.highestP) });
            }
            if (race.favouredP >= minPayout && race.favouredP > 0) {
              const id = `${raceKey}-favoured`;
              map.set(id, { raceKey, label: `${raceKey} (Favoured)`, selections: race.favouredS, payout: Math.round(race.favouredP) });
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
          const oldNames = old.selections.map(h => h.name).sort().join('|');
          const newNames = val.selections.map(h => h.name).sort().join('|');

          if (oldNames !== newNames) {
            const added = val.selections.filter(nh => !old.selections.some(oh => oh.name === nh.name));
            const removed = old.selections.filter(oh => !val.selections.some(nh => nh.name === oh.name));

            // Keep numbers in selection (rating) order rather than numerical order
            const oldNos = old.selections.map(h => h.number).join(', ');
            const newNos = val.selections.map(h => h.number).join(', ');

            let changeDetail = "";
            if (added.length > 0 && removed.length > 0) {
              const addedDetail = added.map(h => `${h.number} ${h.name}`).join(', ');
              const removedDetail = removed.map(h => `${h.number} ${h.name}`).join(', ');
              changeDetail = ` as ${addedDetail} replaced ${removedDetail}`;
            }

            newToasts.push({
              id: Math.random(),
              type: 'change',
              message: `🔄 ${oldNos} changed to ${newNos}${changeDetail} : ${val.label}`
            });
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
    if (mode === 'forecast') {
      // In combination mode, every eligible race counts as one single bet/strategy
      return processedRaces.length;
    }

    return processedRaces.reduce((acc, race) => {
      let count = 0;
      if (race.isSame) {
        if (race.recentP >= minPayout && race.recentP > 0) count++;
      } else {
        if (race.recentP >= minPayout && race.recentP > 0) count++;
        if (race.highestP >= minPayout && race.highestP > 0) count++;
      }
      if (race.favouredP >= minPayout && race.favouredP > 0) count++;
      return acc + count;
    }, 0);
  }, [processedRaces, minPayout]);

  const betBreakdown = useMemo(() => {
    const breakdown = { total: 0, counts: {} };
    processedRaces.forEach(race => {
      if (mode === 'forecast') {
        const n = race.combinedS.length;
        const bets = n * (n - 1) * (n - 2);
        breakdown.total += bets;
        const label = `${n} horses`;
        breakdown.counts[label] = (breakdown.counts[label] || 0) + 1;
      } else {
        // Individual mode: count strategies matching the payout filter
        let activeStrategies = 0;
        if (race.isSame) {
          if (race.recentP >= minPayout && race.recentP > 0) activeStrategies++;
        } else {
          if (race.recentP >= minPayout && race.recentP > 0) activeStrategies++;
          if (race.highestP >= minPayout && race.highestP > 0) activeStrategies++;
        }
        if (race.favouredP >= minPayout && race.favouredP > 0) activeStrategies++;

        if (activeStrategies > 0) {
          const bets = activeStrategies * 6; // 3 horses = 6 bets
          breakdown.total += bets;
          const label = `3 horses`;
          breakdown.counts[label] = (breakdown.counts[label] || 0) + activeStrategies;
        }
      }
    });
    return breakdown;
  }, [processedRaces, mode, minPayout]);

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
            {mode === 'tricast' ? '🎯 Combination' : '🎯 Individual'}
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
                    {mode === 'forecast' ? (
                      <div className="strategy-section">
                        <div className="strategy-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="checkbox"
                            className="bet-checkbox"
                            checked={placedBets.has(`${raceKey}-comb`)}
                            onChange={() => toggleBet(`${raceKey}-comb`)}
                            title="Bet done?"
                          />
                          <h4 style={{ margin: 0 }}>Combination • {race.combinedS.length} Horses</h4>
                        </div>
                        {race.combinedS.map((horse, hIdx) => {
                          const oddsArr = horse.odds || [];
                          const odds = oddsArr[oddsArr.length - 1];
                          const prevOdds = oddsArr.length > 1 ? oddsArr[oddsArr.length - 2] : null;

                          let movement = null;
                          const cur = parseFloat(odds);
                          const prev = parseFloat(prevOdds);
                          if (!isNaN(cur) && !isNaN(prev)) {
                            if (cur > prev) movement = <span style={{ color: '#3b82f6', marginLeft: '4px', fontSize: '0.8em' }}>▼</span>;
                            else if (cur < prev) movement = <span style={{ color: '#ef4444', marginLeft: '4px', fontSize: '0.8em' }}>▲</span>;
                            else movement = <span style={{ color: 'var(--text-h)', marginLeft: '4px', fontSize: '0.8em', opacity: 0.5 }}>~</span>;
                          }

                          const disp = odds === "null" || odds === "NR" ? "NR" : (odds || "x");
                          return (
                            <div key={hIdx} className="selection-row">
                              <div className="selection-name-container">
                                <span className="selection-no">{horse.number}.</span>
                                {horse.silks && <img src={horse.silks} alt="silks" className="selection-silks" />}
                                <span className="selection-name">{horse.name}</span>
                              </div>
                              <span className="selection-odds">{disp}{movement}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <>
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
                              const oddsArr = horse.odds || [];
                              const odds = oddsArr[oddsArr.length - 1];
                              const prevOdds = oddsArr.length > 1 ? oddsArr[oddsArr.length - 2] : null;

                              let movement = null;
                              const cur = parseFloat(odds);
                              const prev = parseFloat(prevOdds);
                              if (!isNaN(cur) && !isNaN(prev)) {
                                if (cur > prev) movement = <span style={{ color: '#3b82f6', marginLeft: '4px', fontSize: '0.8em' }}>▼</span>;
                                else if (cur < prev) movement = <span style={{ color: '#ef4444', marginLeft: '4px', fontSize: '0.8em' }}>▲</span>;
                                else movement = <span style={{ color: 'var(--text-h)', marginLeft: '4px', fontSize: '0.8em', opacity: 0.5 }}>~</span>;
                              }

                              const disp = odds === "null" || odds === "NR" ? "NR" : (odds || "x");
                              return (
                                <div key={hIdx} className="selection-row">
                                  <div className="selection-name-container">
                                    <span className="selection-no">{horse.number}.</span>
                                    {horse.silks && <img src={horse.silks} alt="silks" className="selection-silks" />}
                                    <span className="selection-name">{horse.name}</span>
                                  </div>
                                  <span className="selection-odds">{disp}{movement}</span>
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
                                  const oddsArr = horse.odds || [];
                                  const odds = oddsArr[oddsArr.length - 1];
                                  const prevOdds = oddsArr.length > 1 ? oddsArr[oddsArr.length - 2] : null;

                                  let movement = null;
                                  const cur = parseFloat(odds);
                                  const prev = parseFloat(prevOdds);
                                  if (!isNaN(cur) && !isNaN(prev)) {
                                    if (cur > prev) movement = <span style={{ color: '#3b82f6', marginLeft: '4px', fontSize: '0.8em' }}>▼</span>;
                                    else if (cur < prev) movement = <span style={{ color: '#ef4444', marginLeft: '4px', fontSize: '0.8em' }}>▲</span>;
                                    else movement = <span style={{ color: 'var(--text-h)', marginLeft: '4px', fontSize: '0.8em', opacity: 0.5 }}>~</span>;
                                  }

                                  const disp = odds === "null" || odds === "NR" ? "NR" : (odds || "x");
                                  return (
                                    <div key={hIdx} className="selection-row">
                                      <div className="selection-name-container">
                                        <span className="selection-no">{horse.number}.</span>
                                        {horse.silks && <img src={horse.silks} alt="silks" className="selection-silks" />}
                                        <span className="selection-name">{horse.name}</span>
                                      </div>
                                      <span className="selection-odds">{disp}{movement}</span>
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
                                  const oddsArr = horse.odds || [];
                                  const odds = oddsArr[oddsArr.length - 1];
                                  const prevOdds = oddsArr.length > 1 ? oddsArr[oddsArr.length - 2] : null;

                                  let movement = null;
                                  const cur = parseFloat(odds);
                                  const prev = parseFloat(prevOdds);
                                  if (!isNaN(cur) && !isNaN(prev)) {
                                    if (cur > prev) movement = <span style={{ color: '#3b82f6', marginLeft: '4px', fontSize: '0.8em' }}>▼</span>;
                                    else if (cur < prev) movement = <span style={{ color: '#ef4444', marginLeft: '4px', fontSize: '0.8em' }}>▲</span>;
                                    else movement = <span style={{ color: 'var(--text-h)', marginLeft: '4px', fontSize: '0.8em', opacity: 0.5 }}>~</span>;
                                  }

                                  const disp = odds === "null" || odds === "NR" ? "NR" : (odds || "x");
                                  return (
                                    <div key={hIdx} className="selection-row">
                                      <div className="selection-name-container">
                                        <span className="selection-no">{horse.number}.</span>
                                        {horse.silks && <img src={horse.silks} alt="silks" className="selection-silks" />}
                                        <span className="selection-name">{horse.name}</span>
                                      </div>
                                      <span className="selection-odds">{disp}{movement}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        )}
                        {race.favouredP >= minPayout && race.favouredP > 0 && (
                          <div className={`strategy-section ${(race.recentP >= minPayout || race.highestP >= minPayout) ? 'strategy-divider' : ''}`}>
                            <div className="strategy-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input
                                type="checkbox"
                                className="bet-checkbox"
                                checked={placedBets.has(`${raceKey}-favoured`)}
                                onChange={() => toggleBet(`${raceKey}-favoured`)}
                                title="Bet done?"
                              />
                              <h4 style={{ margin: 0 }}>Favoured • {Math.round(race.favouredP)}/1</h4>
                            </div>
                            {race.favouredS.map((horse, hIdx) => {
                              const oddsArr = horse.odds || [];
                              const odds = oddsArr[oddsArr.length - 1];
                              const prevOdds = oddsArr.length > 1 ? oddsArr[oddsArr.length - 2] : null;

                              let movement = null;
                              const cur = parseFloat(odds);
                              const prev = parseFloat(prevOdds);
                              if (!isNaN(cur) && !isNaN(prev)) {
                                if (cur > prev) movement = <span style={{ color: '#3b82f6', marginLeft: '4px', fontSize: '0.8em' }}>▼</span>;
                                else if (cur < prev) movement = <span style={{ color: '#ef4444', marginLeft: '4px', fontSize: '0.8em' }}>▲</span>;
                                else movement = <span style={{ color: 'var(--text-h)', marginLeft: '4px', fontSize: '0.8em', opacity: 0.5 }}>~</span>;
                              }

                              const disp = odds === "null" || odds === "NR" ? "NR" : (odds || "x");
                              return (
                                <div key={hIdx} className="selection-row">
                                  <div className="selection-name-container">
                                    <span className="selection-no">{horse.number}.</span>
                                    {horse.silks && <img src={horse.silks} alt="silks" className="selection-silks" />}
                                    <span className="selection-name">{horse.name}</span>
                                  </div>
                                  <span className="selection-odds">{disp}{movement}</span>
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

        {!loading && processedRaces.length > 0 && (
          <div className="bet-summary-report">
            <h3 className="bet-summary-title">Betting Summary Report</h3>
            <div className="bet-summary-grid">
              {Object.entries(betBreakdown.counts).sort().map(([label, count]) => {
                const n = parseInt(label, 10);
                const betsPerRace = isNaN(n) ? 6 : (n * (n - 1) * (n - 2));
                return (
                  <div key={label} className="bet-summary-item">
                    <strong>{count}</strong> {count === 1 ? 'bet' : 'bets'} of <strong>{label}</strong> ({count * betsPerRace} lines)
                  </div>
                );
              })}
            </div>
            <p className="bet-summary-total">Total Lines Required: {betBreakdown.total}</p>
          </div>
        )}
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
