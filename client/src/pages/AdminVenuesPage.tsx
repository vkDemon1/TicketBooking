import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Venue, Seat, SeatCategory, VenueType } from '../types';
import { Shield, Plus, Edit, Check, X, Building, Grid, Sparkles, AlertCircle } from 'lucide-react';

export const AdminVenuesPage: React.FC = () => {
  const { user } = useAuth();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);

  // Venue Form / Builder State
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [type, setType] = useState<VenueType>('CINEMA');
  const [rows, setRows] = useState(6);
  const [cols, setCols] = useState(8);
  const [gridSeats, setGridSeats] = useState<Array<{ row_label: string; seat_number: number; category: SeatCategory; is_active: boolean }>>([]);
  const [selectedCategoryBrush, setSelectedCategoryBrush] = useState<SeatCategory>('VIP');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchVenues = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/venues');
      if (res.ok) {
        const data = await res.json();
        setVenues(data.venues || []);
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVenues();
  }, []);

  // Initialize or update grid when rows/cols change in creator
  useEffect(() => {
    if (!isCreating) return;

    const newGrid: Array<{ row_label: string; seat_number: number; category: SeatCategory; is_active: boolean }> = [];
    for (let r = 0; r < rows; r++) {
      const rowLabel = String.fromCharCode(65 + r);
      let defaultCat: SeatCategory = 'STANDARD';
      if (r < Math.max(1, Math.floor(rows * 0.25))) defaultCat = 'VIP';
      else if (r < Math.floor(rows * 0.6)) defaultCat = 'PREMIUM';

      for (let c = 1; c <= cols; c++) {
        newGrid.push({
          row_label: rowLabel,
          seat_number: c,
          category: defaultCat,
          is_active: true,
        });
      }
    }
    setGridSeats(newGrid);
  }, [rows, cols, isCreating]);

  const handleSeatClick = (rLabel: string, sNum: number) => {
    setGridSeats((prev) =>
      prev.map((s) => {
        if (s.row_label === rLabel && s.seat_number === sNum) {
          return { ...s, category: selectedCategoryBrush };
        }
        return s;
      })
    );
  };

  const handleSeatToggleActive = (rLabel: string, sNum: number, e: React.MouseEvent) => {
    e.preventDefault();
    setGridSeats((prev) =>
      prev.map((s) => {
        if (s.row_label === rLabel && s.seat_number === sNum) {
          return { ...s, is_active: !s.is_active };
        }
        return s;
      })
    );
  };

  const handleSaveVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      const token = localStorage.getItem('cc_token');
      const res = await fetch('/api/venues', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          address,
          city,
          type,
          rows,
          cols,
          customSeats: gridSeats,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save venue.');
      }

      setFeedback({ type: 'success', text: `Venue "${data.venue.name}" created with ${data.seats.length} custom seats!` });
      setIsCreating(false);
      setName('');
      setAddress('');
      setCity('');
      await fetchVenues();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to create venue.' });
    } finally {
      setSaving(false);
    }
  };

  const categoryColors: Record<SeatCategory, string> = {
    VIP: '#fbbf24',
    PREMIUM: '#a855f7',
    STANDARD: '#38bdf8',
    BALCONY: '#34d399',
    ACCESSIBLE: '#f43f5e',
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 28,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ padding: 10, borderRadius: 12, background: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24' }}>
            <Shield size={26} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.8rem', color: '#ffffff' }}>Admin Venue & Seat Layout Designer</h1>
            <p style={{ color: '#94a3b8', fontSize: '0.88rem' }}>
              Define venue dimensions, assign custom seat tiers, and manage real database seating layouts.
            </p>
          </div>
        </div>

        <button
          onClick={() => { setIsCreating(!isCreating); setFeedback(null); }}
          className="btn btn-primary btn-sm"
        >
          {isCreating ? <X size={15} /> : <Plus size={15} />}
          {isCreating ? 'Cancel Designer' : 'Create New Venue'}
        </button>
      </div>

      {feedback && (
        <div style={{
          background: feedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          border: `1px solid ${feedback.type === 'success' ? '#10b981' : '#ef4444'}`,
          borderRadius: 12,
          padding: '12px 18px',
          marginBottom: 24,
          color: feedback.type === 'success' ? '#34d399' : '#f87171',
          fontSize: '0.88rem',
        }}>
          {feedback.text}
        </div>
      )}

      {/* Visual Venue Designer Section */}
      {isCreating && (
        <div className="glass-panel" style={{
          padding: 32,
          borderRadius: 20,
          marginBottom: 36,
          background: '#0d1322',
          border: '1px solid rgba(251, 191, 36, 0.4)',
        }}>
          <h2 style={{ fontSize: '1.4rem', color: '#ffffff', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Grid size={20} color="#fbbf24" />
            Visual Grid & Tier Layout Builder
          </h2>

          <form onSubmit={handleSaveVenue}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: 6 }}>
                  Venue Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Paramount Theater"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#161f33',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 8,
                    color: '#ffffff',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: 6 }}>
                  Address
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 789 Broadway Ave"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#161f33',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 8,
                    color: '#ffffff',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: 6 }}>
                  City
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. San Francisco"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#161f33',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 8,
                    color: '#ffffff',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: 6 }}>
                  Venue Type
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as VenueType)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#161f33',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 8,
                    color: '#ffffff',
                    outline: 'none',
                  }}
                >
                  <option value="CINEMA">Cinema</option>
                  <option value="CONCERT_HALL">Concert Hall</option>
                  <option value="STADIUM">Stadium</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: 6 }}>
                  Rows (1-26)
                </label>
                <input
                  type="number"
                  min={1}
                  max={26}
                  value={rows}
                  onChange={(e) => setRows(Math.min(26, Math.max(1, parseInt(e.target.value || '1', 10))))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#161f33',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 8,
                    color: '#ffffff',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: 6 }}>
                  Seats Per Row (1-40)
                </label>
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={cols}
                  onChange={(e) => setCols(Math.min(40, Math.max(1, parseInt(e.target.value || '1', 10))))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#161f33',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 8,
                    color: '#ffffff',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Brush Tool Selector */}
            <div style={{
              background: '#161f33',
              borderRadius: 12,
              padding: '14px 18px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600 }}>
                  Category Paint Brush:
                </span>
                {(['VIP', 'PREMIUM', 'STANDARD', 'BALCONY', 'ACCESSIBLE'] as SeatCategory[]).map((cat) => (
                  <button
                    type="button"
                    key={cat}
                    onClick={() => setSelectedCategoryBrush(cat)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 20,
                      border: selectedCategoryBrush === cat ? `2px solid ${categoryColors[cat]}` : '1px solid rgba(255, 255, 255, 0.1)',
                      background: `${categoryColors[cat]}22`,
                      color: categoryColors[cat],
                      cursor: 'pointer',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                💡 Click seat to paint category. Right-click to toggle Active/Disabled.
              </span>
            </div>

            {/* Interactive Grid Map */}
            <div style={{
              background: '#090d18',
              borderRadius: 14,
              padding: 24,
              overflowX: 'auto',
              marginBottom: 24,
              border: '1px solid var(--border-subtle)',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', minWidth: 500 }}>
                {Array.from({ length: rows }).map((_, rIdx) => {
                  const rLabel = String.fromCharCode(65 + rIdx);
                  return (
                    <div key={rLabel} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 20, color: '#94a3b8', fontWeight: 700, fontSize: '0.8rem', textAlign: 'center' }}>
                        {rLabel}
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {Array.from({ length: cols }).map((_, cIdx) => {
                          const sNum = cIdx + 1;
                          const seat = gridSeats.find((s) => s.row_label === rLabel && s.seat_number === sNum);
                          const cat = seat?.category || 'STANDARD';
                          const isActive = seat?.is_active ?? true;
                          const color = categoryColors[cat];

                          return (
                            <div
                              key={sNum}
                              onClick={() => handleSeatClick(rLabel, sNum)}
                              onContextMenu={(e) => handleSeatToggleActive(rLabel, sNum, e)}
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 6,
                                background: isActive ? `${color}25` : 'rgba(255, 255, 255, 0.04)',
                                border: `1.5px solid ${isActive ? color : 'rgba(255, 255, 255, 0.1)'}`,
                                color: isActive ? color : '#64748b',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                opacity: isActive ? 1 : 0.4,
                              }}
                              title={`Row ${rLabel} Seat ${sNum} — ${cat} (${isActive ? 'Active' : 'Disabled'})`}
                            >
                              {sNum}
                            </div>
                          );
                        })}
                      </div>
                      <span style={{ width: 20, color: '#94a3b8', fontWeight: 700, fontSize: '0.8rem', textAlign: 'center' }}>
                        {rLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn btn-primary"
              >
                {saving ? 'Saving to Database...' : 'Save Venue & Seating Grid'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Existing Venues List */}
      <div>
        <h2 style={{ fontSize: '1.3rem', color: '#ffffff', marginBottom: 16 }}>
          Configured Venues ({venues.length})
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
          {venues.map((v) => (
            <div
              key={v.id}
              className="glass-panel"
              style={{
                padding: 22,
                borderRadius: 16,
                background: '#0d1322',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span className="badge badge-vip">{v.type}</span>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  {v.rows} Rows × {v.cols} Cols
                </span>
              </div>

              <h3 style={{ fontSize: '1.2rem', color: '#ffffff', marginBottom: 6 }}>
                {v.name}
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '0.84rem', marginBottom: 14 }}>
                📍 {v.address}, {v.city}
              </p>

              <div style={{
                background: '#161f33',
                borderRadius: 8,
                padding: '8px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.85rem',
              }}>
                <span style={{ color: '#94a3b8' }}>Total Capacity:</span>
                <strong style={{ color: '#10b981' }}>{v.total_seats || (v.rows * v.cols)} Seats</strong>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
