import React, { useState, useEffect, useMemo } from 'react';

function Tricasts() {
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return now.toISOString().split('T')[0]; // YYYY-MM-DD for native input
  });
  const [races, setRaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
  
  const filteredRaces = useMemo(() => {
    return races.filter(race => {
      const detail = (race.detail || '').toLowerCase();
      const runnerCount = race.horses?.length || 0;
      
      const isEligibleType = detail.includes('handicap') || detail.includes('class 1') || detail.includes('nursery');
      
      return runnerCount >= 8 && isEligibleType;
    });
  }, [races]);

  const getTricastSelections = (horses) => {
    const ratedHorses = (horses || [])
      .filter(horse => {
        const currentOdds = horse.odds?.[horse.odds.length - 1];
        // Skip non-runners
        return currentOdds !== "null" && currentOdds !== "NR";
      })
      .map(horse => {
        const past = horse.past || [];
        const lastThree = past.slice(0, 3);
        const avg = lastThree.length > 0
          ? lastThree.reduce((acc, r) => acc + (Number(r.name) || 0), 0) / lastThree.length
          : 0;
        return { ...horse, avgRating: avg };
      });

    return ratedHorses.sort((a, b) => b.avgRating - a.avgRating).slice(0, 3);
  };

  return (
    <div className="tricasts-container">
      <header className="tricasts-header">
        <h1>Tricasts for {displayDate}</h1>
        <div className="date-picker-wrapper">
          <label htmlFor="date-picker">Select Date: </label>
          <input 
            type="date" 
            id="date-picker" 
            value={selectedDate} 
            onChange={(e) => setSelectedDate(e.target.value)}
            className="date-input"
          />
        </div>
      </header>

      <main className="tricasts-content">
        {loading && <div className="status-msg">Fetching race data...</div>}
        {error && <div className="status-msg error">⚠️ {error}</div>}
        {!loading && !error && filteredRaces.length > 0 && (
          <div className="races-grid">
            {filteredRaces.map((race, idx) => {
              const selections = getTricastSelections(race.horses);
              
              const totalPayout = selections.length === 3 
                ? selections.reduce((acc, h) => {
                    const price = parseFloat(h.odds?.[h.odds.length - 1]);
                    return acc * (isNaN(price) ? 0 : price);
                  }, 1)
                : 0;

              return (
                <div key={idx} className="race-card">
                  <span className="race-time">🕒 {race.time}</span>
                  <span className="race-place">📍 {race.place}</span>
                  <span className="race-detail">{race.detail}</span>
                  
                  <div className="tricast-selections">
                    <h4>Top 3 Selections</h4>
                    {selections.map((horse, hIdx) => {
                      const currentOdds = horse.odds?.[horse.odds.length - 1];
                      const displayOdds = currentOdds === "null" || currentOdds === "NR" ? "NR" : (currentOdds || "x");
                      return (
                        <div key={hIdx} className="selection-row">
                          <span className="selection-name">{hIdx + 1}. {horse.name}</span>
                          <span className="selection-odds">{displayOdds}</span>
                        </div>
                      );
                    })}
                    {totalPayout > 0 && (
                      <div className="selection-row payout-row">
                        <span className="selection-name">Est. Payout</span>
                        <span className="selection-odds">{Math.round(totalPayout)}/1</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!loading && !error && filteredRaces.length === 0 && <p>No tricast races found for this selection.</p>}
      </main>
    </div>
  );
}

export default Tricasts
