import { useEffect, useRef, useState } from 'react';

const TrackWorker = () => {
  const [liveCount, setLiveCount] = useState(0); // State to hold the number of users
  const workerRef = useRef(null);
  const servletUrl = "https://www.pluckier.co.uk/utils/trackerservice";
  const sessionId = useRef(Math.random().toString(36).substring(2, 10));

  useEffect(() => {
    workerRef.current = new Worker('trackerWorker.js');

    // Listen for messages coming back from trackerWorker.js
    workerRef.current.onmessage = (event) => {
      if (event.data.type === 'COUNT_UPDATE') {
        setLiveCount(event.data.count);
      }
    };

    workerRef.current.postMessage({
      action: 'start',
      url: servletUrl,
      id: sessionId.current
    });

    return () => {
      if (workerRef.current) {
        workerRef.current.postMessage({ action: 'stop' });
        workerRef.current.terminate();
      }
    };
  }, []);

  // Return the UI to show the count (or null if you want it invisible)
  //if (liveCount === 0) return null;

  return (
    <div className="live-tracker" title="People here now">
      {liveCount} 🧍
    </div>
  );
};

export default TrackWorker;
