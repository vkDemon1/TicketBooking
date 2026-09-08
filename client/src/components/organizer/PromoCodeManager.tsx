import React, { useState, useEffect } from 'react';
import { PromoCode, Event } from '../../types';
import {
  Tag,
  Plus,
  Trash2,
  Power,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  X,
  Percent,
  DollarSign,
  Calendar,
  Layers,
} from 'lucide-react';

interface PromoCodeManagerProps {
  events: Event[];
}

export const PromoCodeManager: React.FC<PromoCodeManagerProps> = ({ events }) => {
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FLAT'>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState<number>(20);
  const [minOrderAmount, setMinOrderAmount] = useState<number>(0);
  const [maxDiscount, setMaxDiscount] = useState<number | ''>('');
  const [maxUses, setMaxUses] = useState<number | ''>('');
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [validUntil, setValidUntil] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const fetchPromos = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('cc_token');
      const res = await fetch('/api/promos', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPromos(data.promos || []);
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPromos();
  }, []);

  const handleToggle = async (promoId: string) => {
    try {
      const token = localStorage.getItem('cc_token');
      const res = await fetch(`/api/promos/${promoId}/toggle`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchPromos();
      }
    } catch {
      // Ignored
    }
  };

  const handleDelete = async (promoId: string, promoCode: string) => {
    if (!window.confirm(`Are you sure you want to delete promo code '${promoCode}'?`)) return;
    try {
      const token = localStorage.getItem('cc_token');
      const res = await fetch(`/api/promos/${promoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setFeedback({ type: 'success', text: `Promo code '${promoCode}' deleted.` });
        fetchPromos();
      }
    } catch {
      // Ignored
    }
  };

  const handleCreatePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setSubmitting(true);
    setFeedback(null);

    try {
      const token = localStorage.getItem('cc_token');
      const res = await fetch('/api/promos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          discountType,
          discountValue: Number(discountValue),
          minOrderAmount: Number(minOrderAmount) || 0,
          maxDiscount: maxDiscount !== '' ? Number(maxDiscount) : null,
          maxUses: maxUses !== '' ? Number(maxUses) : null,
          eventId: selectedEventId || null,
          validUntil: validUntil || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create promo code.');
      }

      setFeedback({ type: 'success', text: `Promo code '${code.toUpperCase()}' created successfully!` });
      setIsCreateModalOpen(false);
      // Reset form
      setCode('');
      setDiscountValue(20);
      setMinOrderAmount(0);
      setMaxDiscount('');
      setMaxUses('');
      setSelectedEventId('');
      setValidUntil('');
      fetchPromos();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Error creating promo code.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: 28, borderRadius: 20, marginTop: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Tag size={22} color="#818cf8" />
            Promo Codes & Discount Campaigns
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.88rem', marginTop: 4 }}>
            Create percentage discounts, flat coupon codes, minimum spend thresholds, and usage caps.
          </p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="btn btn-primary btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Plus size={16} />
          Create Promo Code
        </button>
      </div>

      {feedback && (
        <div
          style={{
            background: feedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${feedback.type === 'success' ? '#10b981' : '#ef4444'}`,
            borderRadius: 12,
            padding: '12px 16px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {feedback.type === 'success' ? (
              <CheckCircle2 size={18} color="#10b981" />
            ) : (
              <AlertCircle size={18} color="#ef4444" />
            )}
            <span style={{ color: feedback.type === 'success' ? '#34d399' : '#f87171', fontSize: '0.88rem' }}>
              {feedback.text}
            </span>
          </div>
          <button onClick={() => setFeedback(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Promos Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
          Loading promo codes...
        </div>
      ) : promos.length === 0 ? (
        <div style={{
          background: '#131b2e',
          borderRadius: 14,
          padding: '36px 20px',
          textAlign: 'center',
          color: '#64748b',
        }}>
          <Tag size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
          <p style={{ fontSize: '0.95rem', color: '#94a3b8' }}>No promo codes created yet.</p>
          <p style={{ fontSize: '0.82rem', marginTop: 4 }}>Create your first promo code to boost ticket conversions.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 16px' }}>Code</th>
                <th style={{ padding: '12px 16px' }}>Discount</th>
                <th style={{ padding: '12px 16px' }}>Scope</th>
                <th style={{ padding: '12px 16px' }}>Min Spend</th>
                <th style={{ padding: '12px 16px' }}>Redemptions</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => {
                const isActive = Boolean(p.is_active);
                const isExhausted = p.max_uses !== null && p.max_uses !== undefined && p.uses_count >= p.max_uses;
                return (
                  <tr
                    key={p.id}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      opacity: isActive ? 1 : 0.6,
                    }}
                  >
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <strong style={{
                          background: 'rgba(99, 102, 241, 0.15)',
                          color: '#818cf8',
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontFamily: 'monospace',
                          fontSize: '0.92rem',
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                        }}>
                          {p.code}
                        </strong>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#ffffff' }}>
                        {p.discount_type === 'PERCENTAGE' ? (
                          <span>{p.discount_value}% OFF {p.max_discount ? `(Max $${p.max_discount})` : ''}</span>
                        ) : (
                          <span>${p.discount_value.toFixed(2)} FLAT</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#cbd5e1' }}>
                      {p.event_title ? (
                        <span style={{ color: '#38bdf8' }}>{p.event_title}</span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>🌐 Platform-Wide</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#cbd5e1' }}>
                      {p.min_order_amount > 0 ? `$${p.min_order_amount.toFixed(2)}` : 'None'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div>
                        <span style={{ fontWeight: 700, color: isExhausted ? '#ef4444' : '#10b981' }}>
                          {p.uses_count}
                        </span>
                        <span style={{ color: '#64748b' }}>
                          {p.max_uses ? ` / ${p.max_uses} used` : ' (Unlimited)'}
                        </span>
                      </div>
                      {p.max_uses && (
                        <div style={{
                          height: 4,
                          width: 80,
                          background: '#1e293b',
                          borderRadius: 2,
                          marginTop: 4,
                          overflow: 'hidden',
                        }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${Math.min(100, (p.uses_count / p.max_uses) * 100)}%`,
                              background: isExhausted ? '#ef4444' : '#10b981',
                            }}
                          />
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 12,
                          background: isExhausted
                            ? 'rgba(239, 68, 68, 0.2)'
                            : isActive
                            ? 'rgba(16, 185, 129, 0.2)'
                            : 'rgba(100, 116, 139, 0.2)',
                          color: isExhausted
                            ? '#f87171'
                            : isActive
                            ? '#34d399'
                            : '#94a3b8',
                          border: `1px solid ${
                            isExhausted
                              ? 'rgba(239, 68, 68, 0.3)'
                              : isActive
                              ? 'rgba(16, 185, 129, 0.3)'
                              : 'rgba(100, 116, 139, 0.3)'
                          }`,
                        }}
                      >
                        {isExhausted ? 'EXHAUSTED' : isActive ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleToggle(p.id)}
                          className="btn btn-secondary btn-sm"
                          title={isActive ? 'Deactivate promo code' : 'Activate promo code'}
                          style={{ padding: '4px 8px' }}
                        >
                          <Power size={13} color={isActive ? '#10b981' : '#94a3b8'} />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id, p.code)}
                          className="btn btn-secondary btn-sm"
                          title="Delete promo code"
                          style={{ padding: '4px 8px', color: '#f87171' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Promo Code Modal */}
      {isCreateModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 20,
        }}>
          <div className="glass-panel" style={{
            maxWidth: 540,
            width: '100%',
            padding: 32,
            borderRadius: 24,
            background: '#0f172a',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: '1.25rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={18} color="#818cf8" />
                Create New Promo Code
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreatePromo}>
              {/* Promo Code Input */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600, marginBottom: 6 }}>
                  Promo Code *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SUMMER25, FLASH50"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  style={{
                    width: '100%',
                    background: '#1e293b',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    color: '#ffffff',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Discount Type Selector */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600, marginBottom: 6 }}>
                  Discount Type *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setDiscountType('PERCENTAGE')}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: discountType === 'PERCENTAGE' ? '1.5px solid #6366f1' : '1px solid rgba(255,255,255,0.1)',
                      background: discountType === 'PERCENTAGE' ? 'rgba(99, 102, 241, 0.2)' : '#1e293b',
                      color: discountType === 'PERCENTAGE' ? '#818cf8' : '#94a3b8',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      cursor: 'pointer',
                    }}
                  >
                    <Percent size={15} />
                    Percentage (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('FLAT')}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: discountType === 'FLAT' ? '1.5px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                      background: discountType === 'FLAT' ? 'rgba(16, 185, 129, 0.2)' : '#1e293b',
                      color: discountType === 'FLAT' ? '#34d399' : '#94a3b8',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      cursor: 'pointer',
                    }}
                  >
                    <DollarSign size={15} />
                    Flat Discount ($)
                  </button>
                </div>
              </div>

              {/* Discount Value & Max Discount */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600, marginBottom: 6 }}>
                    {discountType === 'PERCENTAGE' ? 'Discount % *' : 'Discount Amount ($) *'}
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={discountType === 'PERCENTAGE' ? 100 : 1000}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    style={{
                      width: '100%',
                      background: '#1e293b',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: 10,
                      padding: '10px 14px',
                      color: '#ffffff',
                      outline: 'none',
                    }}
                  />
                </div>
                {discountType === 'PERCENTAGE' ? (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600, marginBottom: 6 }}>
                      Max Discount Cap ($)
                    </label>
                    <input
                      type="number"
                      min={1}
                      placeholder="e.g. 50 (optional)"
                      value={maxDiscount}
                      onChange={(e) => setMaxDiscount(e.target.value === '' ? '' : Number(e.target.value))}
                      style={{
                        width: '100%',
                        background: '#1e293b',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: 10,
                        padding: '10px 14px',
                        color: '#ffffff',
                        outline: 'none',
                      }}
                    />
                  </div>
                ) : (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600, marginBottom: 6 }}>
                      Min Order Amount ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      placeholder="e.g. 30 (optional)"
                      value={minOrderAmount}
                      onChange={(e) => setMinOrderAmount(Number(e.target.value))}
                      style={{
                        width: '100%',
                        background: '#1e293b',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: 10,
                        padding: '10px 14px',
                        color: '#ffffff',
                        outline: 'none',
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Usage Cap & Event Scope */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600, marginBottom: 6 }}>
                    Max Redemptions
                  </label>
                  <input
                    type="number"
                    min={1}
                    placeholder="Unlimited if blank"
                    value={maxUses}
                    onChange={(e) => setMaxUses(e.target.value === '' ? '' : Number(e.target.value))}
                    style={{
                      width: '100%',
                      background: '#1e293b',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: 10,
                      padding: '10px 14px',
                      color: '#ffffff',
                      outline: 'none',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600, marginBottom: 6 }}>
                    Applicable Event
                  </label>
                  <select
                    value={selectedEventId}
                    onChange={(e) => setSelectedEventId(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#1e293b',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: 10,
                      padding: '10px 14px',
                      color: '#ffffff',
                      outline: 'none',
                    }}
                  >
                    <option value="">🌐 All Events (Platform-wide)</option>
                    {events.map((evt) => (
                      <option key={evt.id} value={evt.id}>
                        {evt.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  {submitting ? 'Creating...' : 'Create Promo Code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
