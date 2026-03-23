import React, { useState, useEffect } from 'react';
import pandaPrintsLogo from '../pandaprintslogo.png';

export default function App() {
  const [amsTrays, setAmsTrays] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');
  const [manualStock, setManualStock] = useState({});
  const [inventory, setInventory] = useState([]);
  const [inventoryFilters, setInventoryFilters] = useState({
    inAms: false,
    low: false,
    empty: false,
    brand: '',
    material: '',
    colour: ''
  });
  const [slotSpoolSelection, setSlotSpoolSelection] = useState({});

  const hexToColorName = {
    '#FFFFFF': 'Jade White',
    '#EC008C': 'Magenta',
    '#E4BD68': 'Gold',
    '#3F8E43': 'Mistletoe Green',
    '#C12E1F': 'Red',
    '#F7E6DE': 'Beige',
    '#F55A74': 'Pink',
    '#FEC600': 'Sunflower Yellow',
    '#847D48': 'Bronze',
    '#D1D3D5': 'Light Gray',
    '#F5547C': 'Hot Pink',
    '#F4EE2A': 'Yellow',
    '#A6A9AA': 'Silver',
    '#FF6A13': 'Orange',
    '#8E9089': 'Gray',
    '#FF9016': 'Pumpkin Orange',
    '#BECF00': 'Bright Green',
    '#6F5034': 'Cocoa Brown',
    '#00B1B7': 'Turquoise',
    '#5E43B7': 'Purple',
    '#482960': 'Indigo Purple',
    '#0086D6': 'Cyan',
    '#5B6579': 'Blue Grey',
    '#9D432C': 'Brown',
    '#0A2989': 'Blue',
    '#545454': 'Dark Gray',
    '#00AE42': 'Bambu Green',
    '#9D2235': 'Maroon Red',
    '#0056B8': 'Cobalt Blue',
    '#000000': 'Black'
  };

  const normalizeHex = (hex) => {
    if (!hex || typeof hex !== 'string') return null;
    let value = hex.trim();
    if (!value.startsWith('#')) value = `#${value}`;
    if (value.length === 9 && value.endsWith('FF')) {
      // Convert ARGB-like 8-digit to 6-digit
      value = `#${value.slice(1, 7)}`;
    }
    if (value.length === 7) return value.toUpperCase();
    if (value.length === 4) {
      return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toUpperCase();
    }
    return null;
  };

  const getColorNameFromHex = (hex) => {
    const normalized = normalizeHex(hex);
    return normalized ? (hexToColorName[normalized] || null) : null;
  };

  const [editingSpoolId, setEditingSpoolId] = useState(null);
  const [editedSpool, setEditedSpool] = useState(null);

  const updateSpool = async (id, payload) => {
    try {
      const res = await fetch(`/api/spools/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('update spool failed');
      const updated = await res.json();
      setInventory((prev) => prev.map((item) => (item.id === id ? updated : item)));
      setEditingSpoolId(null);
      setEditedSpool(null);
      return updated;
    } catch (e) {
      console.error('updateSpool error', e);
      return null;
    }
  };

  const [newSpool, setNewSpool] = useState({
    spool_id: '',
    brand: '',
    material: '',
    tray_id: '',
    with_spool: 'No',
    color: '',
    type: '',
    rfid: 'No',
    supplier: '',
    cost: '',
    purchase_url: '',
    total_grams: '',
    remaining_grams: '',
    store_url: ''
  });
  const [isSpoolIdAuto, setIsSpoolIdAuto] = useState(true);

  const getNextSpoolId = () => {
    const numericSpoolIds = inventory
      .map((spool) => String(spool.spool_id ?? '').trim())
      .filter((id) => /^\d+$/.test(id))
      .map((id) => Number(id));

    const nextId = (numericSpoolIds.length ? Math.max(...numericSpoolIds) : 0) + 1;
    return String(nextId).padStart(4, '0');
  };

  const loadInventory = async () => {
    try {
      const res = await fetch('/api/spools');
      if (!res.ok) throw new Error('failed inventory fetch');
      const data = await res.json();
      setInventory(data);
    } catch (e) {
      console.error('loadInventory error', e);
    }
  };

  const addSpool = async (payload) => {
    try {
      const res = await fetch('/api/spools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('add spool failed');
      const created = await res.json();
      setInventory((prev) => [created, ...prev]);
      return created;
    } catch (e) {
      console.error('addSpool error', e);
      return null;
    }
  };

  const deleteSpool = async (id) => {
    try {
      const res = await fetch(`/api/spools/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      setInventory((prev) => prev.filter((item) => item.id !== id));
    } catch (e) {
      console.error('deleteSpool error', e);
    }
  };

  const fetchSpoolFromUrl = async () => {
    if (!newSpool.store_url) return;
    try {
      const res = await fetch('/api/spools/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newSpool.store_url })
      });
      if (!res.ok) throw new Error('fetch URL failed');
      const meta = await res.json();
      const mappedWithSpool = Number(meta.with_spool) === 1
        ? 'Yes'
        : Number(meta.with_spool) === 0
          ? 'No'
          : undefined;
      setNewSpool((prev) => ({
        ...prev,
        ...meta,
        with_spool: mappedWithSpool ?? prev.with_spool,
        store_url: ''
      }));
    } catch (e) {
      console.error('fetchSpoolFromUrl error', e);
      setNewSpool((prev) => ({ ...prev, store_url: '' }));
    }
  };

  const updateStock = async (trayId) => {
    const payload = {
      grams_remaining: manualStock[trayId] !== undefined ? parseFloat(manualStock[trayId]) : undefined,
    };

    if (payload.grams_remaining === undefined || Number.isNaN(payload.grams_remaining)) {
      return;
    }

    try {
      const res = await fetch(`/api/ams/${trayId}/stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('API error');
      setManualStock(prev => ({ ...prev, [trayId]: '' }));
    } catch (e) {
      console.error('failed to update stock', e);
    }
  };

  const assignSpoolToTray = async (trayId, spoolId) => {
    if (!spoolId) return;
    try {
      const res = await fetch(`/api/ams/${trayId}/assign-spool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spoolId: Number(spoolId) }),
      });
      if (!res.ok) throw new Error('assign spool failed');
      await loadInventory();
    } catch (e) {
      console.error('assignSpoolToTray error', e);
    }
  };

  const unassignSpoolFromTray = async (trayId) => {
    try {
      const res = await fetch(`/api/ams/${trayId}/unassign-spool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('unassign spool failed');
      await loadInventory();
    } catch (e) {
      console.error('unassignSpoolFromTray error', e);
    }
  };

  const loadAmsState = async () => {
    try {
      const res = await fetch('/api/ams_state');
      if (!res.ok) throw new Error('failed AMS state fetch');
      const rows = await res.json();
      const mappedData = rows.map((tray) => {
        const rawColor = (tray.color || '334155').replace('#', '');
        const gramsRemaining = tray.grams_remaining ?? tray.gramsRemaining ?? null;
        const gramsUsed = tray.grams_used ?? tray.gramsUsed ?? -1;
        const rfidDetected = Number(tray.rfid_detected ?? tray.rfidDetected ?? 0) === 1;
        return {
          id: parseInt(tray.tray_id !== undefined ? tray.tray_id : tray.id, 10),
          color: `#${rawColor.substring(0, 6)}`,
          type: tray.type || 'Empty',
          gramsUsed,
          gramsRemaining,
          rfidDetected,
        };
      });
      setAmsTrays(mappedData);
    } catch (e) {
      console.error('loadAmsState error', e);
    }
  };

  useEffect(() => {
    loadInventory();
    loadAmsState();
  }, []);

  useEffect(() => {
    if (!isSpoolIdAuto) return;
    const suggestedSpoolId = getNextSpoolId();
    setNewSpool((prev) => {
      if (prev.spool_id === suggestedSpoolId) return prev;
      return { ...prev, spool_id: suggestedSpoolId };
    });
  }, [inventory, isSpoolIdAuto]);

  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => setConnectionStatus('Connected to Agent');
    ws.onclose = () => setConnectionStatus('Disconnected');
    
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === 'INIT' || payload.type === 'UPDATE') {
        const mappedData = payload.data.map(tray => {
          // Grab whatever color data we have, and strip out any existing # just in case
          const rawColor = (tray.tray_color || tray.color || '334155').replace('#', '');
          const gramsRemaining = tray.grams_remaining ?? tray.gramsRemaining ?? null;
          const gramsUsed = tray.grams_used ?? tray.gramsUsed ?? -1;
          const rfidDetected = Number(tray.rfid_detected ?? tray.rfidDetected ?? 0) === 1;

          return {
            id: parseInt(tray.tray_id !== undefined ? tray.tray_id : tray.id),
            color: `#${rawColor.substring(0, 6)}`, // Force the # and grab the first 6 characters
            type: tray.tray_type || tray.type || 'Empty',
            gramsUsed,
            gramsRemaining,
            rfidDetected
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
    return existingData || { id: targetId, color: '#1e293b', type: 'Empty', gramsUsed: -1, gramsRemaining: null, rfidDetected: false };
  });

  const totalRemaining = displaySlots.reduce((sum, slot) => sum + (typeof slot.gramsRemaining === 'number' ? slot.gramsRemaining : 0), 0);
  const totalUsed = displaySlots.reduce((sum, slot) => sum + (typeof slot.gramsUsed === 'number' && slot.gramsUsed >= 0 ? slot.gramsUsed : 0), 0);
  const totalInventoryCost = inventory.reduce((sum, spool) => sum + (typeof spool.cost === 'number' ? spool.cost : 0), 0);
  const brandOptions = [...new Set(inventory.map((spool) => spool.brand).filter(Boolean))].sort((left, right) => left.localeCompare(right));
  const materialOptions = [...new Set(inventory.map((spool) => spool.material).filter(Boolean))].sort((left, right) => left.localeCompare(right));
  const colourOptions = [...new Set(inventory.map((spool) => spool.color).filter(Boolean))].sort((left, right) => left.localeCompare(right));

  const getSpoolFlags = (spool) => {
    const totalNum = spool.total_grams !== null && spool.total_grams !== undefined ? Number(spool.total_grams) : null;
    const remainingNum = spool.remaining_grams !== null && spool.remaining_grams !== undefined ? Number(spool.remaining_grams) : null;
    const inAms = spool.tray_id !== null && spool.tray_id !== undefined;
    const isEmpty = remainingNum !== null && !Number.isNaN(remainingNum) && remainingNum <= 0;
    const isLow = !isEmpty && remainingNum !== null && !Number.isNaN(remainingNum)
      && (remainingNum <= 200 || (totalNum !== null && !Number.isNaN(totalNum) && totalNum > 0 && (remainingNum / totalNum) <= 0.2));
    return { inAms, isLow, isEmpty };
  };

  const filteredInventory = inventory.filter((spool) => {
    const flags = getSpoolFlags(spool);
    if (inventoryFilters.inAms && !flags.inAms) return false;
    if (inventoryFilters.low && !flags.isLow) return false;
    if (inventoryFilters.empty && !flags.isEmpty) return false;
    if (inventoryFilters.brand && spool.brand !== inventoryFilters.brand) return false;
    if (inventoryFilters.material && spool.material !== inventoryFilters.material) return false;
    if (inventoryFilters.colour && spool.color !== inventoryFilters.colour) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-5 py-8 text-[15px] text-white sm:px-8 sm:py-10 sm:text-base">
      <div className="mx-auto w-full max-w-[1800px]">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="sr-only">Panda Prints Dashboard</h1>
            <img
              src={pandaPrintsLogo}
              alt="Panda Prints Dashboard"
              className="h-14 w-auto sm:h-16"
            />
            <p className="text-slate-300 mt-1 text-sm sm:text-base">Live Filament Tracking for your Panda Prints setup</p>
          </div>
          <div className={`inline-flex items-center rounded-full px-4 py-2 text-xs font-semibold sm:text-sm ${connectionStatus.includes('Connected') ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
            {connectionStatus}
          </div>
        </header>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-700/70 bg-slate-800/70 p-4 text-sm">
            <p className="text-slate-400">Total Remaining</p>
            <p className="text-lg font-semibold text-emerald-300">{totalRemaining.toFixed(1)}g</p>
          </div>
          <div className="rounded-xl border border-slate-700/70 bg-slate-800/70 p-4 text-sm">
            <p className="text-slate-400">Total Used</p>
            <p className="text-lg font-semibold text-amber-300">{totalUsed.toFixed(1)}g</p>
          </div>
          <div className="rounded-xl border border-slate-700/70 bg-slate-800/70 p-4 text-sm">
            <p className="text-slate-400">Tracked Slots</p>
            <p className="text-lg font-semibold text-slate-100">{displaySlots.filter(s => s.type !== 'Empty').length}/4</p>
          </div>
          <div className="rounded-xl border border-slate-700/70 bg-slate-800/70 p-4 text-sm">
            <p className="text-slate-400">Total Inventory Cost</p>
            <p className="text-lg font-semibold text-blue-300">£{totalInventoryCost.toFixed(2)}</p>
          </div>
        </div>

        <section className="mb-8 rounded-xl border border-slate-700/70 bg-slate-800/70 p-6">
          <div className="mb-5 rounded-xl border border-slate-700/70 bg-slate-900/50 p-4">
            <h3 className="mb-2 text-base font-semibold text-slate-200">Bambu store fetch</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
              <div className="sm:col-span-4">
                <label className="mb-1 block text-sm text-slate-200">Bambu store URL</label>
                <input value={newSpool.store_url} onChange={(e) => setNewSpool((prev) => ({ ...prev, store_url: e.target.value }))} placeholder="https://uk.store.bambulab.com/..." className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-base" />
              </div>
              <button onClick={fetchSpoolFromUrl} className="sm:col-span-1 w-full self-end rounded bg-blue-500 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-400">Fetch Bambu Info</button>
            </div>
          </div>

          <h2 className="mb-4 text-xl font-semibold">Spool Inventory</h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-5">
            <div>
              <label className="mb-1 block text-sm text-slate-200">Spool ID</label>
              <div className="flex gap-2">
                <input
                  value={newSpool.spool_id}
                  onChange={(e) => {
                    setIsSpoolIdAuto(false);
                    setNewSpool((prev) => ({ ...prev, spool_id: e.target.value }));
                  }}
                  placeholder="e.g. 0001"
                  className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-base"
                />
                <button
                  type="button"
                  onClick={() => {
                    setIsSpoolIdAuto(true);
                    setNewSpool((prev) => ({ ...prev, spool_id: getNextSpoolId() }));
                  }}
                  className="rounded border border-slate-600 bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700"
                >
                  Auto
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-200">Brand</label>
              <input value={newSpool.brand} onChange={(e) => setNewSpool((prev) => ({ ...prev, brand: e.target.value }))} placeholder="Brand" className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-base" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-200">Material</label>
              <select value={newSpool.material} onChange={(e) => setNewSpool((prev) => ({ ...prev, material: e.target.value }))} className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-base">
                <option value="">Select Material</option>
                <option value="PLA">PLA</option>
                <option value="PETG">PETG</option>
                <option value="ABS">ABS</option>
                <option value="TPU">TPU</option>
                <option value="Nylon">Nylon</option>
                <option value="PC">PC</option>
                <option value="ASA">ASA</option>
                <option value="PVA">PVA</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-200">Total Grams</label>
              <input type="number" min="0" value={newSpool.total_grams} onChange={(e) => setNewSpool((prev) => ({ ...prev, total_grams: e.target.value }))} placeholder="1000" className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-base" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-200">Remaining Grams</label>
              <input type="number" min="0" value={newSpool.remaining_grams} onChange={(e) => setNewSpool((prev) => ({ ...prev, remaining_grams: e.target.value }))} placeholder="Remaining grams" className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-base" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-200">Colour</label>
              <input value={newSpool.color} onChange={(e) => setNewSpool((prev) => ({ ...prev, color: e.target.value }))} placeholder="Colour" className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-base" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-200">Supplier</label>
              <input value={newSpool.supplier} onChange={(e) => setNewSpool((prev) => ({ ...prev, supplier: e.target.value }))} placeholder="Supplier" className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-base" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-200">Cost</label>
              <input value={newSpool.cost} onChange={(e) => setNewSpool((prev) => ({ ...prev, cost: e.target.value }))} placeholder="0.00" type="number" min="0" step="0.01" className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-base" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-200">Purchase URL</label>
              <input value={newSpool.purchase_url} onChange={(e) => setNewSpool((prev) => ({ ...prev, purchase_url: e.target.value }))} placeholder="https://..." className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-base" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-200">With Spool</label>
              <select value={newSpool.with_spool} onChange={(e) => setNewSpool((prev) => ({ ...prev, with_spool: e.target.value }))} className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-base">
                <option>No</option>
                <option>Yes</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-200">RFID</label>
              <select value={newSpool.rfid} onChange={(e) => setNewSpool((prev) => ({ ...prev, rfid: e.target.value }))} className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-base">
                <option>No</option>
                <option>Yes</option>
              </select>
            </div>
            <button onClick={async () => {
              await addSpool({
                spool_id: newSpool.spool_id || null,
                brand: newSpool.brand || null,
                material: newSpool.material || null,
                tray_id: newSpool.tray_id ? parseInt(newSpool.tray_id, 10) : null,
                with_spool: newSpool.with_spool === 'Yes' ? 1 : 0,
                color: newSpool.color || null,
                type: newSpool.type || null,
                rfid: newSpool.rfid === 'Yes' ? 'Yes' : 'No',
                supplier: newSpool.supplier || null,
                cost: newSpool.cost ? parseFloat(newSpool.cost) : null,
                purchase_url: newSpool.purchase_url || null,
                total_grams: newSpool.total_grams ? parseFloat(newSpool.total_grams) : 1000,
                remaining_grams: newSpool.remaining_grams ? parseFloat(newSpool.remaining_grams) : null
              });

              setNewSpool({
                spool_id: '',
                brand: '',
                material: '',
                tray_id: '',
                with_spool: 'No',
                color: '',
                type: '',
                rfid: 'No',
                supplier: '',
                cost: '',
                purchase_url: '',
                total_grams: '',
                remaining_grams: '',
                store_url: ''
              });
              setIsSpoolIdAuto(true);
            }} className="self-end rounded bg-emerald-500 px-3 py-2 text-sm font-semibold hover:bg-emerald-400">Add spool</button>
          </div>

          <div className="overflow-x-auto">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="mr-1 text-slate-300">Filter:</span>
              <select
                value={inventoryFilters.brand}
                onChange={(e) => setInventoryFilters((prev) => ({ ...prev, brand: e.target.value }))}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
              >
                <option value="">All Brands</option>
                {brandOptions.map((brand) => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
              <select
                value={inventoryFilters.material}
                onChange={(e) => setInventoryFilters((prev) => ({ ...prev, material: e.target.value }))}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
              >
                <option value="">All Materials</option>
                {materialOptions.map((material) => (
                  <option key={material} value={material}>{material}</option>
                ))}
              </select>
              <select
                value={inventoryFilters.colour}
                onChange={(e) => setInventoryFilters((prev) => ({ ...prev, colour: e.target.value }))}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
              >
                <option value="">All Colours</option>
                {colourOptions.map((colour) => (
                  <option key={colour} value={colour}>{colour}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setInventoryFilters((prev) => ({ ...prev, inAms: !prev.inAms }))}
                className={`rounded border px-2 py-1 ${inventoryFilters.inAms ? 'border-emerald-500 bg-emerald-700/40 text-emerald-100' : 'border-emerald-700/60 bg-emerald-900/20 text-emerald-200'}`}
              >
                Spools in AMS
              </button>
              <button
                type="button"
                onClick={() => setInventoryFilters((prev) => ({ ...prev, low: !prev.low }))}
                className={`rounded border px-2 py-1 ${inventoryFilters.low ? 'border-amber-500 bg-amber-700/40 text-amber-100' : 'border-amber-700/60 bg-amber-900/25 text-amber-200'}`}
              >
                Spools Low
              </button>
              <button
                type="button"
                onClick={() => setInventoryFilters((prev) => ({ ...prev, empty: !prev.empty }))}
                className={`rounded border px-2 py-1 ${inventoryFilters.empty ? 'border-rose-500 bg-rose-700/40 text-rose-100' : 'border-rose-700/60 bg-rose-900/30 text-rose-200'}`}
              >
                Spools Empty
              </button>
              <button
                type="button"
                onClick={() => setInventoryFilters({ inAms: false, low: false, empty: false, brand: '', material: '', colour: '' })}
                className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-200 hover:bg-slate-700"
              >
                Clear Filters
              </button>
            </div>
            <table className="min-w-full text-left text-base">
              <thead>
                <tr className="bg-slate-900">
                  <th className="px-2 py-2">Spool ID</th>
                  <th className="px-2 py-2">Brand</th>
                  <th className="px-2 py-2">Material</th>
                  <th className="px-2 py-2">With Spool</th>
                  <th className="px-2 py-2">Colour</th>
                  <th className="px-2 py-2">RFID</th>
                  <th className="px-2 py-2">Supplier</th>
                  <th className="px-2 py-2">Cost</th>
                  <th className="px-2 py-2">Purchase URL</th>
                  <th className="px-2 py-2">AMS Slot</th>
                  <th className="px-2 py-2">Total</th>
                  <th className="px-2 py-2">Remaining</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((spool) => {
                  const { inAms, isLow, isEmpty } = getSpoolFlags(spool);

                  let rowHighlight = '';
                  if (isEmpty) rowHighlight = 'bg-rose-900/30';
                  else if (isLow) rowHighlight = 'bg-amber-900/25';
                  else if (inAms) rowHighlight = 'bg-emerald-900/20';

                  return (
                  <tr key={spool.id} className={`border-t border-slate-700 ${rowHighlight}`}>
                    <td className="px-2 py-1">
                      {editingSpoolId === spool.id ? (
                        <input className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" value={editedSpool.spool_id ?? ''} onChange={(e) => setEditedSpool((prev) => ({ ...prev, spool_id: e.target.value }))} />
                      ) : (spool.spool_id || '-')}
                    </td>
                    <td className="px-2 py-1">
                      {editingSpoolId === spool.id ? (
                        <input className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" value={editedSpool.brand ?? ''} onChange={(e) => setEditedSpool((prev) => ({ ...prev, brand: e.target.value }))} />
                      ) : spool.brand || '-'}
                    </td>
                    <td className="px-2 py-1">
                      {editingSpoolId === spool.id ? (
                        <input className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" value={editedSpool.material ?? ''} onChange={(e) => setEditedSpool((prev) => ({ ...prev, material: e.target.value }))} />
                      ) : spool.material || '-'}
                    </td>
                    <td className="px-2 py-1">
                      {editingSpoolId === spool.id ? (
                        <select className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" value={editedSpool.with_spool ? 'Yes' : 'No'} onChange={(e) => setEditedSpool((prev) => ({ ...prev, with_spool: e.target.value === 'Yes' ? 1 : 0 }))}>
                          <option>No</option>
                          <option>Yes</option>
                        </select>
                      ) : (spool.with_spool ? 'Yes' : 'No')}
                    </td>
                    <td className="px-2 py-1">
                      {editingSpoolId === spool.id ? (
                        <input className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" value={editedSpool.color ?? ''} onChange={(e) => setEditedSpool((prev) => ({ ...prev, color: e.target.value }))} />
                      ) : spool.color || '-'}
                    </td>
                    <td className="px-2 py-1">
                      {editingSpoolId === spool.id ? (
                        <select className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" value={editedSpool.rfid === 'Yes' ? 'Yes' : 'No'} onChange={(e) => setEditedSpool((prev) => ({ ...prev, rfid: e.target.value }))}>
                          <option>No</option>
                          <option>Yes</option>
                        </select>
                      ) : spool.rfid || 'No'}
                    </td>
                    <td className="px-2 py-1">
                      {editingSpoolId === spool.id ? (
                        <input className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" value={editedSpool.supplier ?? ''} onChange={(e) => setEditedSpool((prev) => ({ ...prev, supplier: e.target.value }))} />
                      ) : spool.supplier || '-'}
                    </td>
                    <td className="px-2 py-1">
                      {editingSpoolId === spool.id ? (
                        <input type="number" step="0.01" className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" value={editedSpool.cost ?? ''} onChange={(e) => setEditedSpool((prev) => ({ ...prev, cost: e.target.value }))} />
                      ) : (spool.cost !== null && spool.cost !== undefined ? `£${Number(spool.cost).toFixed(2)}` : '-')}
                    </td>
                    <td className="px-2 py-1">
                      {editingSpoolId === spool.id ? (
                        <input className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" value={editedSpool.purchase_url ?? ''} onChange={(e) => setEditedSpool((prev) => ({ ...prev, purchase_url: e.target.value }))} />
                      ) : (spool.purchase_url ? <a className="text-indigo-300" href={spool.purchase_url} target="_blank" rel="noreferrer">Link</a> : '-')}
                    </td>
                    <td className="px-2 py-1">{spool.tray_id !== null && spool.tray_id !== undefined ? spool.tray_id + 1 : '-'}</td>
                    <td className="px-2 py-1">
                      {editingSpoolId === spool.id ? (
                        <input type="number" className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" value={editedSpool.total_grams ?? ''} onChange={(e) => setEditedSpool((prev) => ({ ...prev, total_grams: e.target.value }))} />
                      ) : (spool.total_grams ?? '-')}
                    </td>
                    <td className="px-2 py-1">
                      {editingSpoolId === spool.id ? (
                        <input type="number" className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" value={editedSpool.remaining_grams ?? ''} onChange={(e) => setEditedSpool((prev) => ({ ...prev, remaining_grams: e.target.value }))} />
                      ) : (spool.remaining_grams ?? '-')}
                    </td>
                    <td className="px-2 py-1">
                      {editingSpoolId === spool.id ? (
                        <div className="flex gap-1">
                          <button onClick={() => updateSpool(spool.id, editedSpool)} className="rounded bg-emerald-500 px-2 py-1 text-xs">Save</button>
                          <button onClick={() => { setEditingSpoolId(null); setEditedSpool(null); }} className="rounded bg-slate-600 px-2 py-1 text-xs">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <button onClick={() => { setEditingSpoolId(spool.id); setEditedSpool(spool); }} className="rounded bg-blue-500 px-2 py-1 text-xs">Edit</button>
                          <button onClick={() => deleteSpool(spool.id)} className="rounded bg-rose-500 px-2 py-1 text-xs">Remove</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );})}
                {filteredInventory.length === 0 && (
                  <tr>
                    <td colSpan="13" className="px-2 py-3 text-center text-slate-400">No spools match the current filter.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <main>
          <section className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            <h3 className="font-semibold">Spool Swap Workflow</h3>
            <p className="mt-1 text-amber-100/90">When swapping a physical spool in the AMS:</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-amber-100/90">
              <li>Select the new spool in the slot dropdown and press <span className="font-semibold">Load</span>.</li>
              <li>Physically swap the spool in the AMS.</li>
            </ol>
          </section>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {displaySlots.map((tray) => (
              <article key={tray.id} className="rounded-2xl border border-slate-700/70 bg-slate-800/80 p-5 shadow-[0_12px_22px_-10px_rgba(15,23,42,0.75)] backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_30px_-10px_rgba(15,23,42,0.8)]">
                {(() => {
                  const currentSpool = inventory.find((spool) => spool.tray_id === tray.id);
                  const selectableSpools = inventory.filter((spool) => spool.tray_id === null || spool.tray_id === undefined || spool.tray_id === tray.id);
                  return (
                    <div className="mb-3 rounded-lg bg-slate-900/50 p-2 text-xs text-slate-300">
                      <p className="mb-1">Assigned Spool ID: <span className="font-semibold text-slate-100">{currentSpool ? (currentSpool.spool_id || currentSpool.name || `Spool ${currentSpool.id}`) : 'None'}</span></p>
                      <div className="flex gap-2">
                        <div className="w-full">
                          <label className="mb-1 block text-sm text-slate-300">Select spool</label>
                        <select
                          className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                          value={slotSpoolSelection[tray.id] ?? ''}
                          onChange={(e) => setSlotSpoolSelection((prev) => ({ ...prev, [tray.id]: e.target.value }))}
                        >
                          <option value="">Select Spool ID</option>
                          {selectableSpools.map((spool) => (
                            <option key={spool.id} value={spool.id}>
                              {(spool.spool_id || `Spool ${spool.id}`)} - {(spool.material || 'Unknown Material')} - {(spool.color || 'Unknown Colour')}
                            </option>
                          ))}
                        </select>
                        </div>
                        <button
                          onClick={() => assignSpoolToTray(tray.id, slotSpoolSelection[tray.id])}
                          className="self-end rounded bg-emerald-600 px-2 py-1 text-sm font-semibold text-white hover:bg-emerald-500"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => unassignSpoolFromTray(tray.id)}
                          className="self-end rounded bg-slate-600 px-2 py-1 text-sm font-semibold text-white hover:bg-slate-500"
                        >
                          Unload
                        </button>
                      </div>
                    </div>
                  );
                })()}
                <h2 className="mb-3 text-lg font-semibold text-slate-100">Slot {tray.id + 1}</h2>
                <div className="mb-5 flex flex-col items-center justify-center gap-2">
                  <div
                    className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-8 border-slate-600 shadow-inner transition-all duration-500"
                    style={{ backgroundColor: tray.color }}
                    aria-label={`Color preview for slot ${tray.id + 1}`}>
                    <div className="absolute inset-0 bg-black/20" />
                    <div className="relative z-10 h-12 w-12 rounded-full border-4 border-slate-700 bg-slate-900" />
                  </div>
                  <span className="text-xs text-slate-300">
                    {getColorNameFromHex(tray.color) || tray.color || 'Unknown'}
                    {!tray.rfidDetected && tray.type !== 'Empty' ? ' (No RFID)' : ''}
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between rounded-lg bg-slate-900/50 px-3 py-2">
                    <span className="text-slate-400">Material</span>
                    <span className="font-mono font-bold text-slate-100">{tray.type}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-slate-900/50 px-3 py-2">
                    <span className="text-slate-400">Used</span>
                    <span className="font-mono text-slate-100">
                      {!tray.rfidDetected
                        ? <span className="text-slate-400 text-xs">No RFID</span>
                        : `${parseFloat(tray.gramsUsed).toFixed(1)}g`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-slate-900/50 px-3 py-2">
                    <span className="text-slate-400">Remaining</span>
                    <span className="font-mono text-slate-100">
                      {tray.gramsRemaining === null || tray.gramsRemaining === undefined
                        ? <span className="text-slate-400 text-xs">Unknown</span>
                        : `${parseFloat(tray.gramsRemaining).toFixed(1)}g`}
                    </span>
                  </div>

                  <div className="mt-3 flex items-end gap-2">
                    <div className="w-2/3">
                      <label className="mb-1 block text-sm text-slate-300">Remaining grams</label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="Remaining g"
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-base text-slate-100 outline-none focus:border-emerald-300"
                        value={manualStock[tray.id] ?? ''}
                        onChange={(e) => setManualStock(prev => ({ ...prev, [tray.id]: e.target.value }))}
                      />
                    </div>
                    <button
                      onClick={() => updateStock(tray.id)}
                      className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                    >
                      Save
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex justify-center">
                  <button
                    onClick={async () => {
                      const colorName = getColorNameFromHex(tray.color) || tray.color;
                      await addSpool({
                        name: `${tray.type} #${tray.id + 1}`,
                        tray_id: tray.id,
                        color: colorName,
                        type: tray.type,
                        total_grams: null,
                        remaining_grams: tray.gramsRemaining !== null ? Number(tray.gramsRemaining) : null
                      });
                    }}
                    className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
                  >
                    Add to inventory
                  </button>
                </div>
              </article>
            ))}
          </div>

          <footer className="mt-6 rounded-xl border border-slate-700/70 bg-slate-900/40 p-4 text-center text-xs text-slate-400">
            Best experience on mobile or desktop. Pull-to-refresh on mobile when the websocket isn’t live.
          </footer>
        </main>
      </div>
    </div>
  );
}