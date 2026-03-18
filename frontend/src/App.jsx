import React, { useState, useEffect } from 'react';

export default function App() {
  const [amsTrays, setAmsTrays] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');

  useEffect(() => {
    const wsUrl = `ws://${window.location.hostname}:8080`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => setConnectionStatus('Connected to Agent');
    ws.onclose = () => setConnectionStatus('Disconnected');
    
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === 'INIT' || payload.type === 'UPDATE') {
        const mappedData = payload.data.map(tray => {
          // Grab whatever color data we have, and strip out any existing # just in case
          const rawColor = (tray.tray_color || tray.color || '334155').replace('#', '');
          return {
            id: parseInt(tray.tray_id !== undefined ? tray.tray_id : tray.id),
            color: `#${rawColor.substring(0, 6)}`, // Force the # and grab the first 6 characters
            type: tray.tray_type || tray.type || 'Empty',
            gramsUsed: tray.grams_used || 0
          };
        });
        setAmsTrays(mappedData);
      }
    };

    return () => ws.close();
  }, []);

  // MAGIC FIX: Always generate exactly 4 slots (0, 1, 2, 3). 
  // If the database has data for that slot, use it. Otherwise, show it as Empty.
  const displaySlots = [0, 1, 2, 3].map(targetId => {
    const existingData = amsTrays.find(t => t.id === targetId);
    return existingData || { id: targetId, color: '#1e293b', type: 'Empty', gramsUsed: 0 };
  });

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">PandaPrintsDash</h1>
          <p className="text-slate-400 mt-1">Live Filament Tracking</p>
        </div>
        <div className={`px-4 py-2 rounded-full text-sm font-semibold ${connectionStatus.includes('Connected') ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
          {connectionStatus}
        </div>
      </header>
      <main>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {displaySlots.map((tray) => (
            <div key={tray.id} className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-lg flex flex-col items-center">
              <h2 className="text-xl font-semibold mb-4 text-slate-300">Slot {tray.id + 1}</h2>
              <div 
                className="w-32 h-32 rounded-full border-8 border-slate-600 shadow-inner flex items-center justify-center mb-6 relative overflow-hidden transition-colors duration-500" 
                style={{ backgroundColor: tray.color }}
              >
                <div className="w-12 h-12 bg-slate-900 rounded-full border-4 border-slate-700 z-10"></div>
              </div>
              <div className="w-full space-y-2">
                <div className="flex justify-between bg-slate-900/50 p-3 rounded-lg">
                  <span className="text-slate-400">Material</span>
                  <span className="font-mono font-bold">{tray.type}</span>
                </div>
                <div className="flex justify-between bg-slate-900/50 p-3 rounded-lg">
                  <span className="text-slate-400">Used</span>
                  <span className="font-mono text-sm flex items-center">
                    {tray.gramsUsed === -1 
                      ? <span className="text-slate-500 text-xs">No RFID</span> 
                      : `${parseFloat(tray.gramsUsed).toFixed(1)}g`}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}