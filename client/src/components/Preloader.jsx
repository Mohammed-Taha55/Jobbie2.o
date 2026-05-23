import { useEffect, useState } from 'react';

const Preloader = ({ onDone }) => {
  const [phase, setPhase] = useState('enter'); // enter → shine → exit

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('shine'), 600);
    const t2 = setTimeout(() => setPhase('exit'), 2200);
    const t3 = setTimeout(() => onDone(), 2900);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div
      className={`preloader-root ${phase === 'exit' ? 'preloader-exit' : ''}`}
    >
      {/* Animated background orbs */}
      <div className="preloader-orb preloader-orb-1" />
      <div className="preloader-orb preloader-orb-2" />
      <div className="preloader-orb preloader-orb-3" />

      {/* Grid overlay */}
      <div className="preloader-grid" />

      {/* Center content */}
      <div className={`preloader-card ${phase !== 'enter' ? 'preloader-card-in' : ''}`}>
        {/* Icon ring */}
        <div className="preloader-icon-wrap">
          <div className="preloader-ring preloader-ring-1" />
          <div className="preloader-ring preloader-ring-2" />
          <div className="preloader-icon-core">
            {/* Briefcase SVG */}
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
          </div>
        </div>

        {/* Logo text */}
        <div className="preloader-logo">
          <span className="preloader-logo-jobbie">Jobbie</span>
          <span className={`preloader-logo-version ${phase === 'shine' || phase === 'exit' ? 'preloader-version-shine' : ''}`}>
            2.O
          </span>
        </div>

        <p className="preloader-tagline">Automated Job Application Assistant</p>

        {/* Loading bar */}
        <div className="preloader-bar-wrap">
          <div className={`preloader-bar ${phase !== 'enter' ? 'preloader-bar-fill' : ''}`} />
        </div>

        {/* Dots */}
        <div className="preloader-dots">
          <span className="preloader-dot" style={{ animationDelay: '0s' }} />
          <span className="preloader-dot" style={{ animationDelay: '0.2s' }} />
          <span className="preloader-dot" style={{ animationDelay: '0.4s' }} />
        </div>
      </div>
    </div>
  );
};

export default Preloader;
