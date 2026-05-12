import React, { useState, useEffect } from 'react';
import pandaPrintsLogo from '../pandaprintslogo.png';

export default function App() {
  const API_ORIGIN = 'https://www.mindview.co.uk';
  const apiUrl = (path) => `${API_ORIGIN}${path}`;
  const apiFetch = (path, options) => fetch(apiUrl(path), options);
  const wsUrl = 'wss://www.mindview.co.uk/ws';

  const [amsTrays, setAmsTrays] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');
  const [manualStock, setManualStock] = useState({});
  const [inventory, setInventory] = useState([]);
  const [spoolCostCurrency, setSpoolCostCurrency] = useState('GBP');
  const [inventoryFilters, setInventoryFilters] = useState({
    inAms: false,
    low: false,
    empty: false,
    brand: '',
    material: '',
    colour: ''
  });
  const [slotSpoolSelection, setSlotSpoolSelection] = useState({});
  const [refreshingAms, setRefreshingAms] = useState(false);
  const [hexToColorName, setHexToColorName] = useState({});
  const [colorNameToHex, setColorNameToHex] = useState({});
  const [printerStatus, setPrinterStatus] = useState({
    state: 'Unknown',
    isPrinting: false,
    timeRemainingMinutes: null,
    mqttConnected: false,
  });
  const [activeTab, setActiveTab] = useState('dashboard');

  // Library state
  const [libraryColours, setLibraryColours] = useState([]);
  const [libraryMaterials, setLibraryMaterials] = useState([]);
  const [libraryBrands, setLibraryBrands] = useState([]);
  const [librarySuppliers, setLibrarySuppliers] = useState([]);
  const [colourForm, setColourForm] = useState({ hex: '#', name: '' });
  const [colourFormError, setColourFormError] = useState('');
  const [editingColourId, setEditingColourId] = useState(null);
  const [editingColourForm, setEditingColourForm] = useState({ hex: '', name: '' });
  const [materialForm, setMaterialForm] = useState({ name: '' });
  const [materialFormError, setMaterialFormError] = useState('');
  const [editingMaterialId, setEditingMaterialId] = useState(null);
  const [editingMaterialName, setEditingMaterialName] = useState('');
  const [brandForm, setBrandForm] = useState({ name: '', description: '' });
  const [brandFormError, setBrandFormError] = useState('');
  const [editingBrandId, setEditingBrandId] = useState(null);
  const [editingBrandForm, setEditingBrandForm] = useState({ name: '', description: '' });
  const [supplierForm, setSupplierForm] = useState({ name: '' });
  const [supplierFormError, setSupplierFormError] = useState('');
  const [editingSupplierId, setEditingSupplierId] = useState(null);
  const [editingSupplierForm, setEditingSupplierForm] = useState({ name: '' });

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

  const getHexFromColorName = (name) => {
    if (!name || typeof name !== 'string') return null;
    const target = name.trim().toLowerCase();
    if (!target) return null;

    return colorNameToHex[target] || null;
  };

  const [editingSpoolId, setEditingSpoolId] = useState(null);
  const [editedSpool, setEditedSpool] = useState(null);

  const updateSpool = async (id, payload) => {
    try {
      const res = await apiFetch(`/api/spools/${id}`, {
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

  const loadColours = async () => {
    try {
      const res = await apiFetch('/api/colours');
      if (!res.ok) throw new Error('failed colours fetch');
      const rows = await res.json();
      setLibraryColours(rows);
      const hexMap = {};
      const nameMap = {};
      for (const { hex, name } of rows) {
        const normalizedHex = normalizeHex(hex);
        const trimmedName = typeof name === 'string' ? name.trim() : '';
        if (!normalizedHex || !trimmedName) continue;

        if (!hexMap[normalizedHex]) {
          // Keep first alphabetical entry as the display label for this hex.
          hexMap[normalizedHex] = trimmedName;
        }
        nameMap[trimmedName.toLowerCase()] = normalizedHex;
      }
      setHexToColorName(hexMap);
      setColorNameToHex(nameMap);
    } catch (e) {
      console.error('loadColours error', e);
    }
  };

  const loadMaterials = async () => {
    try {
      const res = await apiFetch('/api/materials');
      if (!res.ok) throw new Error('failed materials fetch');
      setLibraryMaterials(await res.json());
    } catch (e) {
      console.error('loadMaterials error', e);
    }
  };

  const loadBrands = async () => {
    try {
      const res = await apiFetch('/api/brands');
      if (!res.ok) throw new Error('failed brands fetch');
      setLibraryBrands(await res.json());
    } catch (e) {
      console.error('loadBrands error', e);
    }
  };

  const loadSuppliers = async () => {
    try {
      const res = await apiFetch('/api/suppliers');
      if (!res.ok) throw new Error('failed suppliers fetch');
      setLibrarySuppliers(await res.json());
    } catch (e) {
      console.error('loadSuppliers error', e);
    }
  };

  const loadInventory = async () => {
    try {
      const res = await apiFetch('/api/spools');
      if (!res.ok) throw new Error('failed inventory fetch');
      const data = await res.json();
      setInventory(data);
    } catch (e) {
      console.error('loadInventory error', e);
    }
  };

  const loadConfig = async () => {
    try {
      const res = await apiFetch('/api/config');
      if (!res.ok) throw new Error('failed config fetch');
      const data = await res.json();
      if (data.spoolCostCurrency) {
        setSpoolCostCurrency(String(data.spoolCostCurrency).trim().toUpperCase());
      }
    } catch (e) {
      console.error('loadConfig error', e);
    }
  };

  const loadPrinterStatus = async () => {
    try {
      const res = await apiFetch('/api/printer-status');
      if (!res.ok) throw new Error('failed printer status fetch');
      const data = await res.json();
      setPrinterStatus({
        state: data.state || 'Unknown',
        isPrinting: Boolean(data.isPrinting),
        timeRemainingMinutes: Number.isFinite(Number(data.timeRemainingMinutes))
          ? Number(data.timeRemainingMinutes)
          : null,
        mqttConnected: Boolean(data.mqttConnected),
      });
    } catch (e) {
      console.error('loadPrinterStatus error', e);
    }
  };

  const addSpool = async (payload) => {
    try {
      const res = await apiFetch('/api/spools', {
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
      const res = await apiFetch(`/api/spools/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      setInventory((prev) => prev.filter((item) => item.id !== id));
    } catch (e) {
      console.error('deleteSpool error', e);
    }
  };

  const fetchSpoolFromUrl = async () => {
    if (!newSpool.store_url) return;
    try {
      const res = await apiFetch('/api/spools/fetch-url', {
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
      const res = await apiFetch(`/api/ams/${trayId}/stock`, {
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
      const res = await apiFetch(`/api/ams/${trayId}/assign-spool`, {
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
      const res = await apiFetch(`/api/ams/${trayId}/unassign-spool`, {
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
      const res = await apiFetch('/api/ams_state');
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
    loadConfig();
    loadColours();
    loadMaterials();
    loadBrands();
    loadSuppliers();
    loadInventory();
    loadAmsState();
    loadPrinterStatus();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      loadPrinterStatus();
    }, 10000);

    return () => clearInterval(interval);
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
  const getCurrencySymbol = (currencyCode) => {
    const normalizedCurrency = String(currencyCode || '').trim().toUpperCase();
    const aliases = { GDP: 'GBP' };
    const resolvedCurrency = aliases[normalizedCurrency] || normalizedCurrency || 'GBP';

    try {
      const parts = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: resolvedCurrency,
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).formatToParts(1);

      return parts.find((part) => part.type === 'currency')?.value || resolvedCurrency;
    } catch (error) {
      return resolvedCurrency;
    }
  };

  const displayCurrencyCode = String(spoolCostCurrency || '').trim().toUpperCase() || 'GBP';
  const displayCurrencySymbol = getCurrencySymbol(displayCurrencyCode);
  const formatCost = (amount) => {
    const numericAmount = Number(amount);
    if (Number.isNaN(numericAmount)) return '-';

    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: displayCurrencyCode === 'GDP' ? 'GBP' : displayCurrencyCode,
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(numericAmount);
    } catch (error) {
      return `${displayCurrencySymbol}${numericAmount.toFixed(2)}`;
    }
  };

  const formatRemainingTime = (minutes) => {
    const numeric = Number(minutes);
    if (!Number.isFinite(numeric) || numeric < 0) return null;
    const rounded = Math.round(numeric);
    const hrs = Math.floor(rounded / 60);
    const mins = rounded % 60;
    if (hrs <= 0) return `${mins}m`;
    if (mins === 0) return `${hrs}h`;
    return `${hrs}h ${mins}m`;
  };

  const printerStatusLabel = printerStatus.isPrinting
    ? `Printing${formatRemainingTime(printerStatus.timeRemainingMinutes) ? ` • ${formatRemainingTime(printerStatus.timeRemainingMinutes)} left` : ''}`
    : 'Idle';

  const printerStatusClasses = printerStatus.isPrinting
    ? 'bg-amber-500/20 text-amber-300'
    : 'bg-slate-500/20 text-slate-300';
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

  const sortBySpoolId = (left, right) => {
    const leftId = String(left.spool_id ?? '').trim();
    const rightId = String(right.spool_id ?? '').trim();
    const leftNumeric = /^\d+$/.test(leftId) ? Number(leftId) : null;
    const rightNumeric = /^\d+$/.test(rightId) ? Number(rightId) : null;

    if (leftNumeric !== null && rightNumeric !== null && leftNumeric !== rightNumeric) {
      return leftNumeric - rightNumeric;
    }
    if (leftNumeric !== null && rightNumeric === null) return -1;
    if (leftNumeric === null && rightNumeric !== null) return 1;
    return leftId.localeCompare(rightId, undefined, { numeric: true, sensitivity: 'base' });
  };

  const sortedFilteredInventory = [...filteredInventory].sort(sortBySpoolId);
  const amsInventoryRows = sortedFilteredInventory.filter((spool) => getSpoolFlags(spool).inAms).sort((a, b) => (a.tray_id ?? 0) - (b.tray_id ?? 0));
  const nonAmsInventoryRows = sortedFilteredInventory.filter((spool) => !getSpoolFlags(spool).inAms);
  const displayInventoryRows = [...amsInventoryRows, ...nonAmsInventoryRows];

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
            <p className="text-slate-300 mt-1 text-sm sm:text-base">Live Filament Tracking for Bambu Lab 3D Printers
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-3">
              <button
              disabled={refreshingAms}
              onClick={async () => {
                setRefreshingAms(true);
                try {
                  await apiFetch('/api/ams/refresh', { method: 'POST' });
                  await new Promise((r) => setTimeout(r, 1000));
                  await loadAmsState();
                  await loadInventory();
                } catch (e) {
                  console.error('refresh error', e);
                } finally {
                  setRefreshingAms(false);
                }
              }}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold sm:text-sm ${refreshingAms ? 'bg-indigo-500/10 text-indigo-400 cursor-not-allowed' : 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${refreshingAms ? 'animate-spin' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" /></svg>
                {refreshingAms ? 'Refreshing…' : 'Refresh AMS'}
              </button>
              <div className={`inline-flex items-center rounded-full px-4 py-2 text-xs font-semibold sm:text-sm ${connectionStatus.includes('Connected') ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                {connectionStatus}
              </div>
            </div>
            <div className={`inline-flex items-center rounded-full px-4 py-2 text-xs font-semibold sm:text-sm ${printerStatusClasses}`}>
              Printer: {printerStatusLabel}
            </div>
          </div>
        </header>

        {/* Tab Navigation */}
        <nav className="mb-6 flex gap-2 border-b border-slate-700">
          {[['dashboard', 'Dashboard'], ['library', 'Library']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-indigo-400 text-indigo-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {activeTab === 'library' && (
          <div className="space-y-8">

            {/* Colours */}
            <section className="rounded-2xl border border-slate-700/70 bg-slate-800/70 p-6 shadow-[0_8px_20px_-8px_rgba(15,23,42,0.6)]">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-100">Colours</h2>
                  <p className="mt-0.5 text-xs text-slate-400">{libraryColours.length} colour{libraryColours.length !== 1 ? 's' : ''} in library</p>
                </div>
              </div>

              {/* Add form */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setColourFormError('');
                  const hex = colourForm.hex.trim().toUpperCase();
                  const name = colourForm.name.trim();
                  if (!/^#[0-9A-F]{6}$/.test(hex)) { setColourFormError('Invalid hex code (e.g. #FF6A13)'); return; }
                  if (!name) { setColourFormError('Name is required'); return; }
                  const res = await apiFetch('/api/colours', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hex, name }),
                  });
                  if (!res.ok) { const d = await res.json(); setColourFormError(d.error || 'Failed'); return; }
                  setColourForm({ hex: '#', name: '' });
                  loadColours();
                }}
                className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-700/50 bg-slate-900/50 p-4"
              >
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Hex Code</label>
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 flex-shrink-0 rounded-lg border-2 border-slate-600 shadow-inner transition-colors" style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(colourForm.hex) ? colourForm.hex : 'transparent' }} />
                    <input
                      value={colourForm.hex}
                      onChange={(e) => setColourForm((p) => ({ ...p, hex: e.target.value }))}
                      placeholder="#FFFFFF"
                      className="w-32 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Name</label>
                  <input
                    value={colourForm.name}
                    onChange={(e) => setColourForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Jade White"
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                  />
                </div>
                <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 active:scale-95">
                  + Add Colour
                </button>
                {colourFormError && <p className="w-full text-xs text-rose-400">{colourFormError}</p>}
              </form>

              {/* Colour grid */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                {libraryColours.map((c) => (
                  <div key={c.id} className="group relative flex flex-col items-center gap-2 rounded-xl border border-slate-700/50 bg-slate-900/60 p-3 transition hover:border-slate-600 hover:bg-slate-900/80">
                    {editingColourId === c.id ? (
                      <div className="flex w-full flex-col gap-2">
                        <div className="flex items-center gap-1.5">
                          <div className="h-7 w-7 flex-shrink-0 rounded border border-slate-600" style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(editingColourForm.hex) ? editingColourForm.hex : 'transparent' }} />
                          <input className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-xs text-slate-100 outline-none focus:border-indigo-500" value={editingColourForm.hex} onChange={(e) => setEditingColourForm((p) => ({ ...p, hex: e.target.value }))} />
                        </div>
                        <input className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100 outline-none focus:border-indigo-500" value={editingColourForm.name} onChange={(e) => setEditingColourForm((p) => ({ ...p, name: e.target.value }))} />
                        <div className="flex gap-1">
                          <button
                            onClick={async () => {
                              const hex = editingColourForm.hex.trim().toUpperCase();
                              const name = editingColourForm.name.trim();
                              if (!/^#[0-9A-F]{6}$/.test(hex) || !name) return;
                              const res = await apiFetch(`/api/colours/${c.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ hex, name }),
                              });
                              if (res.ok) { setEditingColourId(null); loadColours(); }
                            }}
                            className="flex-1 rounded bg-emerald-600 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                          >Save</button>
                          <button onClick={() => setEditingColourId(null)} className="flex-1 rounded bg-slate-600 py-1 text-xs font-semibold text-white hover:bg-slate-500">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="h-12 w-12 rounded-full border-4 border-slate-700 shadow-inner transition-transform group-hover:scale-105" style={{ backgroundColor: c.hex }} />
                        <div className="w-full text-center">
                          <p className="truncate text-xs font-medium text-slate-200">{c.name}</p>
                          <p className="font-mono text-[10px] text-slate-500">{c.hex}</p>
                        </div>
                        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={() => { setEditingColourId(c.id); setEditingColourForm({ hex: c.hex, name: c.name }); }}
                            className="rounded bg-slate-700 px-2 py-0.5 text-[10px] font-semibold text-slate-200 hover:bg-slate-600"
                          >Edit</button>
                          <button
                            onClick={async () => {
                              if (!confirm(`Delete colour "${c.name}"?`)) return;
                              await apiFetch(`/api/colours/${c.id}`, { method: 'DELETE' });
                              loadColours();
                            }}
                            className="rounded bg-rose-900/60 px-2 py-0.5 text-[10px] font-semibold text-rose-300 hover:bg-rose-800/60"
                          >Delete</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Bottom 3 sections in a grid */}
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">

              {/* Materials */}
              <section className="rounded-2xl border border-slate-700/70 bg-slate-800/70 p-6 shadow-[0_8px_20px_-8px_rgba(15,23,42,0.6)]">
                <div className="mb-5">
                  <h2 className="text-xl font-semibold text-slate-100">Materials</h2>
                  <p className="mt-0.5 text-xs text-slate-400">{libraryMaterials.length} material{libraryMaterials.length !== 1 ? 's' : ''}</p>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setMaterialFormError('');
                    const name = materialForm.name.trim();
                    if (!name) { setMaterialFormError('Name is required'); return; }
                    const res = await apiFetch('/api/materials', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name }),
                    });
                    if (!res.ok) { const d = await res.json(); setMaterialFormError(d.error || 'Failed'); return; }
                    setMaterialForm({ name: '' });
                    loadMaterials();
                  }}
                  className="mb-5 flex gap-2"
                >
                  <input
                    value={materialForm.name}
                    onChange={(e) => setMaterialForm({ name: e.target.value })}
                    placeholder="e.g. PLA Matte"
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                  />
                  <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 active:scale-95">+</button>
                  {materialFormError && <p className="mt-1 w-full text-xs text-rose-400">{materialFormError}</p>}
                </form>

                <ul className="space-y-1.5">
                  {libraryMaterials.map((m) => (
                    <li key={m.id} className="group flex items-center justify-between rounded-lg border border-slate-700/40 bg-slate-900/50 px-3 py-2 transition hover:border-slate-600/60 hover:bg-slate-900/80">
                      {editingMaterialId === m.id ? (
                        <div className="flex w-full gap-2">
                          <input className="flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100 outline-none focus:border-indigo-500" value={editingMaterialName} onChange={(e) => setEditingMaterialName(e.target.value)} autoFocus />
                          <button
                            onClick={async () => {
                              if (!editingMaterialName.trim()) return;
                              const res = await apiFetch(`/api/materials/${m.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name: editingMaterialName.trim() }),
                              });
                              if (res.ok) { setEditingMaterialId(null); loadMaterials(); }
                            }}
                            className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                          >Save</button>
                          <button onClick={() => setEditingMaterialId(null)} className="rounded bg-slate-600 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-500">✕</button>
                        </div>
                      ) : (
                        <>
                          <span className="text-sm font-medium text-slate-200">{m.name}</span>
                          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button onClick={() => { setEditingMaterialId(m.id); setEditingMaterialName(m.name); }} className="rounded bg-slate-700 px-2 py-0.5 text-xs font-medium text-slate-300 hover:bg-slate-600">Edit</button>
                            <button
                              onClick={async () => {
                                if (!confirm(`Delete material "${m.name}"?`)) return;
                                await apiFetch(`/api/materials/${m.id}`, { method: 'DELETE' });
                                loadMaterials();
                              }}
                              className="rounded bg-rose-900/50 px-2 py-0.5 text-xs font-medium text-rose-300 hover:bg-rose-800/60"
                            >Delete</button>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                  {libraryMaterials.length === 0 && <li className="py-4 text-center text-xs text-slate-500">No materials yet</li>}
                </ul>
              </section>

              {/* Brands */}
              <section className="rounded-2xl border border-slate-700/70 bg-slate-800/70 p-6 shadow-[0_8px_20px_-8px_rgba(15,23,42,0.6)]">
                <div className="mb-5">
                  <h2 className="text-xl font-semibold text-slate-100">Brands</h2>
                  <p className="mt-0.5 text-xs text-slate-400">{libraryBrands.length} brand{libraryBrands.length !== 1 ? 's' : ''}</p>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBrandFormError('');
                    const name = brandForm.name.trim();
                    const description = brandForm.description.trim();
                    if (!name) { setBrandFormError('Name is required'); return; }
                    const res = await apiFetch('/api/brands', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name, description: description || null }),
                    });
                    if (!res.ok) { const d = await res.json(); setBrandFormError(d.error || 'Failed'); return; }
                    setBrandForm({ name: '', description: '' });
                    loadBrands();
                  }}
                  className="mb-5 space-y-2"
                >
                  <div className="flex gap-2">
                    <input
                      value={brandForm.name}
                      onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })}
                      placeholder="Brand name"
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                    />
                    <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 active:scale-95">+</button>
                  </div>
                  <input
                    value={brandForm.description}
                    onChange={(e) => setBrandForm({ ...brandForm, description: e.target.value })}
                    placeholder="Description (optional)"
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                  />
                  {brandFormError && <p className="text-xs text-rose-400">{brandFormError}</p>}
                </form>

                <ul className="space-y-1.5">
                  {libraryBrands.map((b) => (
                    <li key={b.id} className="group rounded-lg border border-slate-700/40 bg-slate-900/50 px-3 py-2 transition hover:border-slate-600/60 hover:bg-slate-900/80">
                      {editingBrandId === b.id ? (
                        <div className="space-y-2">
                          <input className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100 outline-none focus:border-indigo-500" value={editingBrandForm.name} onChange={(e) => setEditingBrandForm((p) => ({ ...p, name: e.target.value }))} autoFocus />
                          <input className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100 outline-none focus:border-indigo-500" value={editingBrandForm.description || ''} onChange={(e) => setEditingBrandForm((p) => ({ ...p, description: e.target.value }))} placeholder="Description" />
                          <div className="flex gap-1">
                            <button
                              onClick={async () => {
                                if (!editingBrandForm.name.trim()) return;
                                const res = await apiFetch(`/api/brands/${b.id}`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ name: editingBrandForm.name.trim(), description: editingBrandForm.description.trim() || null }),
                                });
                                if (res.ok) { setEditingBrandId(null); loadBrands(); }
                              }}
                              className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                            >Save</button>
                            <button onClick={() => setEditingBrandId(null)} className="rounded bg-slate-600 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-500">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-200">{b.name}</p>
                            {b.description && <p className="truncate text-xs text-slate-500">{b.description}</p>}
                          </div>
                          <div className="flex flex-shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button onClick={() => { setEditingBrandId(b.id); setEditingBrandForm({ name: b.name, description: b.description || '' }); }} className="rounded bg-slate-700 px-2 py-0.5 text-xs font-medium text-slate-300 hover:bg-slate-600">Edit</button>
                            <button
                              onClick={async () => {
                                if (!confirm(`Delete brand "${b.name}"?`)) return;
                                await apiFetch(`/api/brands/${b.id}`, { method: 'DELETE' });
                                loadBrands();
                              }}
                              className="rounded bg-rose-900/50 px-2 py-0.5 text-xs font-medium text-rose-300 hover:bg-rose-800/60"
                            >Delete</button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                  {libraryBrands.length === 0 && <li className="py-4 text-center text-xs text-slate-500">No brands yet</li>}
                </ul>
              </section>

              {/* Suppliers */}
              <section className="rounded-2xl border border-slate-700/70 bg-slate-800/70 p-6 shadow-[0_8px_20px_-8px_rgba(15,23,42,0.6)]">
                <div className="mb-5">
                  <h2 className="text-xl font-semibold text-slate-100">Suppliers</h2>
                  <p className="mt-0.5 text-xs text-slate-400">{librarySuppliers.length} supplier{librarySuppliers.length !== 1 ? 's' : ''}</p>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setSupplierFormError('');
                    const name = supplierForm.name.trim();
                    if (!name) { setSupplierFormError('Name is required'); return; }
                    const res = await apiFetch('/api/suppliers', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name }),
                    });
                    if (!res.ok) { const d = await res.json(); setSupplierFormError(d.error || 'Failed'); return; }
                    setSupplierForm({ name: '' });
                    loadSuppliers();
                  }}
                  className="mb-5 flex gap-2"
                >
                  <input
                    value={supplierForm.name}
                    onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                    placeholder="e.g. Bambu Lab"
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                  />
                  <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 active:scale-95">+</button>
                  {supplierFormError && <p className="mt-1 w-full text-xs text-rose-400">{supplierFormError}</p>}
                </form>

                <ul className="space-y-1.5">
                  {librarySuppliers.map((s) => (
                    <li key={s.id} className="group flex items-center justify-between rounded-lg border border-slate-700/40 bg-slate-900/50 px-3 py-2 transition hover:border-slate-600/60 hover:bg-slate-900/80">
                      {editingSupplierId === s.id ? (
                        <div className="flex w-full gap-2">
                          <input className="flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100 outline-none focus:border-indigo-500" value={editingSupplierForm.name} onChange={(e) => setEditingSupplierForm((p) => ({ ...p, name: e.target.value }))} autoFocus />
                          <button
                            onClick={async () => {
                              if (!editingSupplierForm.name.trim()) return;
                              const res = await apiFetch(`/api/suppliers/${s.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name: editingSupplierForm.name.trim() }),
                              });
                              if (res.ok) { setEditingSupplierId(null); loadSuppliers(); }
                            }}
                            className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                          >Save</button>
                          <button onClick={() => setEditingSupplierId(null)} className="rounded bg-slate-600 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-500">✕</button>
                        </div>
                      ) : (
                        <>
                          <span className="text-sm font-medium text-slate-200">{s.name}</span>
                          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button onClick={() => { setEditingSupplierId(s.id); setEditingSupplierForm({ name: s.name }); }} className="rounded bg-slate-700 px-2 py-0.5 text-xs font-medium text-slate-300 hover:bg-slate-600">Edit</button>
                            <button
                              onClick={async () => {
                                if (!confirm(`Delete supplier "${s.name}"?`)) return;
                                await apiFetch(`/api/suppliers/${s.id}`, { method: 'DELETE' });
                                loadSuppliers();
                              }}
                              className="rounded bg-rose-900/50 px-2 py-0.5 text-xs font-medium text-rose-300 hover:bg-rose-800/60"
                            >Delete</button>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                  {librarySuppliers.length === 0 && <li className="py-4 text-center text-xs text-slate-500">No suppliers yet</li>}
                </ul>
              </section>

            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
        <>
        <section className="mb-8">
          <h2 className="mb-4 text-xl font-semibold text-slate-100">Overview</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
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
            <p className="text-lg font-semibold text-blue-300">{formatCost(totalInventoryCost)}</p>
          </div>
          </div>
        </section>

        <div className="flex flex-col">
        <section className="order-2 mb-8 rounded-xl border border-slate-700/70 bg-slate-800/70 p-6">
          <h2 className="mb-4 text-xl font-semibold">Spool Inventory</h2>

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
              <select value={newSpool.brand} onChange={(e) => setNewSpool((prev) => ({ ...prev, brand: e.target.value }))} className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-base">
                <option value="">Select Brand</option>
                {libraryBrands.map((b) => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-200">Material</label>
              <select value={newSpool.material} onChange={(e) => setNewSpool((prev) => ({ ...prev, material: e.target.value }))} className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-base">
                <option value="">Select Material</option>
                {libraryMaterials.map((m) => (
                  <option key={m.id} value={m.name}>{m.name}</option>
                ))}
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
              <select value={newSpool.color} onChange={(e) => setNewSpool((prev) => ({ ...prev, color: e.target.value }))} className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-base">
                <option value="">Select Colour</option>
                {libraryColours.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-200">Supplier</label>
              <select value={newSpool.supplier} onChange={(e) => setNewSpool((prev) => ({ ...prev, supplier: e.target.value }))} className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-base">
                <option value="">Select Supplier</option>
                {librarySuppliers.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-200">Cost ({displayCurrencySymbol})</label>
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
                {displayInventoryRows.map((spool, index) => {
                  const { inAms, isLow, isEmpty } = getSpoolFlags(spool);
                  const showAmsDivider = index === amsInventoryRows.length && amsInventoryRows.length > 0 && nonAmsInventoryRows.length > 0;

                  let rowHighlight = '';
                  if (isEmpty) rowHighlight = 'bg-rose-900/30';
                  else if (isLow) rowHighlight = 'bg-amber-900/25';
                  else if (inAms) rowHighlight = 'bg-emerald-900/20';

                  return (
                  <React.Fragment key={spool.id}>
                    {showAmsDivider && (
                      <tr className="border-t-2 border-slate-500/80 bg-slate-900/70">
                        <td colSpan="13" className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-300">
                          Non-AMS Inventory
                        </td>
                      </tr>
                    )}
                  <tr className={`border-t border-slate-700 ${rowHighlight}`}>
                    <td className="px-2 py-1">
                      {editingSpoolId === spool.id ? (
                        <input className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" value={editedSpool.spool_id ?? ''} onChange={(e) => setEditedSpool((prev) => ({ ...prev, spool_id: e.target.value }))} />
                      ) : (spool.spool_id || '-')}
                    </td>
                    <td className="px-2 py-1">
                      {editingSpoolId === spool.id ? (
                        <select className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" value={editedSpool.brand ?? ''} onChange={(e) => setEditedSpool((prev) => ({ ...prev, brand: e.target.value }))}>
                          <option value="">Select Brand</option>
                          {libraryBrands.map((b) => (
                            <option key={b.id} value={b.name}>{b.name}</option>
                          ))}
                        </select>
                      ) : spool.brand || '-'}
                    </td>
                    <td className="px-2 py-1">
                      {editingSpoolId === spool.id ? (
                        <select className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" value={editedSpool.material ?? ''} onChange={(e) => setEditedSpool((prev) => ({ ...prev, material: e.target.value }))}>
                          <option value="">Select Material</option>
                          {libraryMaterials.map((m) => (
                            <option key={m.id} value={m.name}>{m.name}</option>
                          ))}
                        </select>
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
                        <select className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" value={editedSpool.color ?? ''} onChange={(e) => setEditedSpool((prev) => ({ ...prev, color: e.target.value }))}>
                          <option value="">Select Colour</option>
                          {libraryColours.map((c) => (
                            <option key={c.id} value={c.name}>{c.name}</option>
                          ))}
                        </select>
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
                        <select className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" value={editedSpool.supplier ?? ''} onChange={(e) => setEditedSpool((prev) => ({ ...prev, supplier: e.target.value }))}>
                          <option value="">Select Supplier</option>
                          {librarySuppliers.map((s) => (
                            <option key={s.id} value={s.name}>{s.name}</option>
                          ))}
                        </select>
                      ) : spool.supplier || '-'}
                    </td>
                    <td className="px-2 py-1">
                      {editingSpoolId === spool.id ? (
                        <input type="number" step="0.01" className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" value={editedSpool.cost ?? ''} onChange={(e) => setEditedSpool((prev) => ({ ...prev, cost: e.target.value }))} />
                      ) : (spool.cost !== null && spool.cost !== undefined ? formatCost(spool.cost) : '-')}
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
                          <button onClick={() => { setEditingSpoolId(spool.id); setEditedSpool(spool); }} className="rounded bg-blue-500 px-3 py-2 text-sm font-medium">Edit</button>
                          <button onClick={() => deleteSpool(spool.id)} className="rounded bg-rose-500 px-3 py-2 text-sm font-medium">Remove</button>
                        </div>
                      )}
                    </td>
                  </tr>
                  </React.Fragment>
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

        <main className="order-1 mb-8">
          <h2 className="mb-4 text-xl font-semibold text-slate-100">AMS Slots</h2>
          <section className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            <h3 className="font-semibold">Spool Swap Workflow</h3>
            <p className="mt-1 text-amber-100/90">When swapping a physical spool in the AMS:</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-amber-100/90">
              <li>Select the new spool in the slot dropdown and press <span className="font-semibold">Load</span>.</li>
              <li>Physically swap the spool in the AMS.</li>
            </ol>
          </section>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {displaySlots.map((tray) => {
              const currentSpool = inventory.find((spool) => spool.tray_id === tray.id);
              const selectableSpools = inventory
                .filter((spool) => spool.tray_id === null || spool.tray_id === undefined || spool.tray_id === tray.id)
                .sort(sortBySpoolId);
              const spoolHex = normalizeHex(currentSpool?.color || '');
              const spoolNamedHex = getHexFromColorName(currentSpool?.color || '');
              const slotDisplayColor = spoolHex || spoolNamedHex || tray.color;
              const slotColorLabel = currentSpool?.color
                ? (getColorNameFromHex(currentSpool.color) || currentSpool.color)
                : (getColorNameFromHex(tray.color) || tray.color || 'Unknown');

              return (
              <article key={tray.id} className="rounded-2xl border border-slate-700/70 bg-slate-800/80 p-5 shadow-[0_12px_22px_-10px_rgba(15,23,42,0.75)] backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_30px_-10px_rgba(15,23,42,0.8)]">
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
                <h2 className="mb-3 text-lg font-semibold text-slate-100">Slot {tray.id + 1}</h2>
                <div className="mb-5 flex flex-col items-center justify-center gap-2">
                  <div
                    className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-8 border-slate-600 shadow-inner transition-all duration-500"
                    style={{ backgroundColor: slotDisplayColor }}
                    aria-label={`Color preview for slot ${tray.id + 1}`}>
                    <div className="absolute inset-0 bg-black/20" />
                    <div className="relative z-10 h-12 w-12 rounded-full border-4 border-slate-700 bg-slate-900" />
                  </div>
                  <span className="text-xs text-slate-300">
                    {slotColorLabel}
                    {!tray.rfidDetected && tray.type !== 'Empty' ? ' (No RFID)' : ''}
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between rounded-lg bg-slate-900/50 px-3 py-2">
                    <span className="text-slate-400">Material</span>
                    <span className="font-mono font-bold text-slate-100">{currentSpool?.material || tray.type}</span>
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
            );})}
          </div>

        </main>

        </div>
        </>
        )}

        <section className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-4 text-center text-xs text-slate-400">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-300">Usage Notes</h2>
          <p>Best experience on mobile or desktop. Pull-to-refresh on mobile when the websocket isn’t live.</p>
        </section>
      </div>
    </div>   
  );
}