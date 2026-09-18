import React, { useState } from 'react';

interface LoginProps {
  onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const correctPin = import.meta.env.VITE_APP_PIN || '1234';

  const handleKeyPress = (num: string) => {
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      setError(false);
      
      if (newPin.length === 4) {
        if (newPin === correctPin) {
          onLogin();
        } else {
          setError(true);
          setTimeout(() => setPin(''), 500);
        }
      }
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
    setError(false);
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      padding: '20px'
    }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '360px', textAlign: 'center' }}>
        <div style={{ 
          width: '60px', 
          height: '60px', 
          background: 'var(--primary)',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
          boxShadow: 'var(--card-shadow)'
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        
        <h2 style={{ fontSize: '1.5rem', marginBottom: '8px', color: 'var(--text-main)' }}>Enter PIN</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '32px', fontSize: '0.9rem' }}>
          Secure access to your finances
        </p>

        {/* PIN Dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '40px' }}>
          {[0, 1, 2, 3].map((i) => (
            <div 
              key={i} 
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: i < pin.length ? 'var(--primary)' : 'rgba(0,0,0,0.05)',
                transition: 'all 0.2s',
                transform: i < pin.length ? 'scale(1.2)' : 'scale(1)',
                border: error ? '2px solid var(--expense)' : (i < pin.length ? 'none' : '2px solid rgba(0,0,0,0.1)')
              }}
            />
          ))}
        </div>

        {/* Numpad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button 
              key={num}
              onClick={() => handleKeyPress(num.toString())}
              style={{
                background: 'var(--bg-color)',
                border: '1px solid var(--glass-border)',
                borderRadius: '50%',
                width: '72px',
                height: '72px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
                margin: '0 auto',
                color: 'var(--text-main)',
                fontWeight: 500
              }}
            >
              {num}
            </button>
          ))}
          <div></div>
          <button 
            onClick={() => handleKeyPress('0')}
            style={{
              background: 'var(--bg-color)',
              border: '1px solid var(--glass-border)',
              borderRadius: '50%',
              width: '72px',
              height: '72px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              margin: '0 auto',
              color: 'var(--text-main)',
              fontWeight: 500
            }}
          >
            0
          </button>
          <button 
            onClick={handleDelete}
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: '50%',
              width: '72px',
              height: '72px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto',
              padding: 0
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path>
              <line x1="18" y1="9" x2="12" y2="15"></line>
              <line x1="12" y1="9" x2="18" y2="15"></line>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
