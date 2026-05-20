import React from 'react';

const Toggle = ({ value, onChange, color = '#3b82f6' }) => (
  <button
    className="toggle"
    onClick={() => onChange(!value)}
    style={{ background: value ? color : 'rgba(255,255,255,0.15)' }}
  >
    <div className="toggle-thumb" style={{ transform: value ? 'translateX(22px)' : 'translateX(2px)' }} />
  </button>
);

export default Toggle;
