import React, { useState } from 'react';
import { EventSeatState, EventCategory } from '../../types';
import { Lock, Check, X, Users, AlertCircle } from 'lucide-react';

interface SeatMapProps {
  seats: EventSeatState[];
  selectedSeatIds: string[];
  onToggleSeat: (seat: EventSeatState) => void;
  category: EventCategory;
  disabled?: boolean;
}

export const SeatMap: React.FC<SeatMapProps> = ({
  seats,
  selectedSeatIds,
  onToggleSeat,
  category,
  disabled = false,
}) => {
  const [hoveredSeat, setHoveredSeat] = useState<EventSeatState | null>(null);

  // Group seats by row label (e.g. A, B, C, D...)
  const rowsMap = new Map<string, EventSeatState[]>();
  for (const seat of seats) {
    if (!rowsMap.has(seat.row)) {
      rowsMap.set(seat.row, []);
    }
    rowsMap.get(seat.row)!.push(seat);
  }

  const rows = Array.from(rowsMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [, rowSeats] of rows) {
    rowSeats.sort((a, b) => a.number - b.number);
  }

  const getSeatColor = (category: string) => {
    switch (category) {
      case 'VIP': return '#fbbf24';
      case 'PREMIUM': return '#a855f7';
      case 'BALCONY': return '#34d399';
      case 'ACCESSIBLE': return '#f43f5e';
      default: return '#38bdf8';
    }
  };

  return (
    <div style={{
      background: '#090d18',
      borderRadius: 18,
      padding: '32px 20px',
      border: '1px solid var(--border-subtle)',
      position: 'relative',
      overflowX: 'auto',
    }}>
      {/* Screen or Stage Platform */}
      {category === 'MOVIE' ? (
        <div className="screen-curve" />
      ) : (
        <div className="stage-platform">
          STAGE / PERFORMANCE PLATFORM
        </div>
      )}

      {/* Seating Grid */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        alignItems: 'center',
        minWidth: 600,
        margin: '0 auto',
      }}>
        {rows.map(([rowLabel, rowSeats]) => (
          <div key={rowLabel} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Left Row Label */}
            <div style={{
              width: 24,
              fontSize: '0.85rem',
              fontWeight: 800,
              color: '#94a3b8',
              textAlign: 'center',
            }}>
              {rowLabel}
            </div>

            {/* Seats in Row */}
            <div style={{ display: 'flex', gap: 8 }}>
              {rowSeats.map((seat) => {
                const isSelected = selectedSeatIds.includes(seat.seatId) || seat.isMyHold;
                const isAvailable = seat.status === 'AVAILABLE' && seat.isActive;
                const isHeld = seat.status === 'HELD' && !seat.isMyHold;
                const isBooked = seat.status === 'BOOKED';
                const isWaitlist = seat.status === 'WAITLIST_HELD';

                const tierColor = getSeatColor(seat.category);

                let bg = 'rgba(255, 255, 255, 0.04)';
                let borderColor = `${tierColor}55`;
                let textColor = '#cbd5e1';
                let cursor = 'pointer';
                let shadow = 'none';

                if (isSelected) {
                  bg = '#6366f1';
                  borderColor = '#818cf8';
                  textColor = '#ffffff';
                  shadow = '0 0 12px rgba(99, 102, 241, 0.6)';
                } else if (isAvailable) {
                  bg = `${tierColor}18`;
                  borderColor = tierColor;
                  textColor = '#ffffff';
                } else if (isHeld) {
                  bg = 'rgba(245, 158, 11, 0.2)';
                  borderColor = '#f59e0b';
                  textColor = '#fbbf24';
                  cursor = 'not-allowed';
                } else if (isBooked) {
                  bg = 'rgba(239, 68, 68, 0.12)';
                  borderColor = 'rgba(239, 68, 68, 0.3)';
                  textColor = '#64748b';
                  cursor = 'not-allowed';
                } else if (isWaitlist) {
                  bg = 'rgba(6, 182, 212, 0.15)';
                  borderColor = '#06b6d4';
                  textColor = '#38bdf8';
                  cursor = 'not-allowed';
                }

                return (
                  <button
                    key={seat.seatId}
                    disabled={disabled || (!isAvailable && !isSelected)}
                    onClick={() => onToggleSeat(seat)}
                    onMouseEnter={() => setHoveredSeat(seat)}
                    onMouseLeave={() => setHoveredSeat(null)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      border: `1.5px solid ${borderColor}`,
                      background: bg,
                      color: textColor,
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      cursor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: shadow,
                      transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
                      transform: hoveredSeat?.seatId === seat.seatId && isAvailable ? 'scale(1.15)' : 'scale(1)',
                      position: 'relative',
                    }}
                    title={`Row ${seat.row} Seat ${seat.number} — ${seat.category} ($${seat.price}) [Status: ${seat.status}]`}
                  >
                    {isSelected ? (
                      <Check size={14} />
                    ) : isHeld ? (
                      <Lock size={12} color="#fbbf24" />
                    ) : isBooked ? (
                      <X size={12} color="#ef4444" />
                    ) : isWaitlist ? (
                      <Users size={12} color="#06b6d4" />
                    ) : (
                      seat.number
                    )}
                  </button>
                );
              })}
            </div>

            {/* Right Row Label */}
            <div style={{
              width: 24,
              fontSize: '0.85rem',
              fontWeight: 800,
              color: '#94a3b8',
              textAlign: 'center',
            }}>
              {rowLabel}
            </div>
          </div>
        ))}
      </div>

      {/* Floating Seat Tooltip Bar */}
      {hoveredSeat && (
        <div style={{
          position: 'absolute',
          bottom: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#161f33',
          border: '1px solid var(--border-subtle)',
          borderRadius: 20,
          padding: '6px 16px',
          fontSize: '0.82rem',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
          color: '#ffffff',
          pointerEvents: 'none',
        }}>
          <span>
            Seat <strong>{hoveredSeat.row}{hoveredSeat.number}</strong>
          </span>
          <span className="badge" style={{
            background: `${getSeatColor(hoveredSeat.category)}22`,
            color: getSeatColor(hoveredSeat.category),
            border: `1px solid ${getSeatColor(hoveredSeat.category)}44`,
            fontSize: '0.7rem',
          }}>
            {hoveredSeat.category}
          </span>
          <span style={{ color: '#10b981', fontWeight: 700 }}>
            ${hoveredSeat.price.toFixed(2)}
          </span>
          <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
            Status: <strong>{hoveredSeat.status}</strong>
          </span>
        </div>
      )}
    </div>
  );
};
