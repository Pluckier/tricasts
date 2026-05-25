let heartbeatInterval = null;

self.onmessage = (event) => {
  const { url, id } = event.data;

  const sendPing = () => {
    const pingUrl = `${url}?id=${id}&ts=${Date.now()}`;
    
    fetch(pingUrl, { 
      method: 'POST', 
      mode: 'cors' 
    })
    .then(response => {
      if (!response.ok) throw new Error('Network response was not ok');
      return response.json();
    })
    .then(data => {
      // This sends the count back to your TrackWorker.jsx component
      self.postMessage({ 
        type: 'COUNT_UPDATE', 
        count: data.activeUsers 
      });
    })
    .catch(() => {
      // Fail silently to avoid cluttering console
    });
  };

  if (event.data.action === 'start') {
    sendPing();
    // Heartbeat every 60 seconds
    heartbeatInterval = setInterval(sendPing, 60000);
  } else if (event.data.action === 'stop') {
    clearInterval(heartbeatInterval);
  }
};
