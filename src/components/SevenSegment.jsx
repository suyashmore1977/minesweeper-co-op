import React from 'react';

export default function SevenSegment({ value }) {
  // Format value to fit in 3 characters: -99 to 999
  const formatNumber = (num) => {
    if (num < -99) return '-99';
    if (num > 999) return '999';
    if (num < 0) {
      const abs = Math.abs(num).toString();
      return '-' + abs.padStart(2, '0');
    }
    return num.toString().padStart(3, '0');
  };

  const formattedStr = formatNumber(value);

  return (
    <div className="lcd-display win95-inset-thin" title={value.toString()}>
      {formattedStr.split('').map((char, index) => (
        <span 
          key={index} 
          style={{ 
            display: 'inline-block',
            width: '14px',
            textAlign: 'center',
            textShadow: '0 0 4px rgba(255, 0, 0, 0.6)'
          }}
        >
          {char}
        </span>
      ))}
    </div>
  );
}
