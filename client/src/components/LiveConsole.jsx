import { useEffect, useRef } from 'react';
import { Terminal, Circle } from 'lucide-react';

const typeColors = {
  info: 'text-blue-400',
  success: 'text-emerald-400',
  warning: 'text-amber-400',
  error: 'text-red-400',
};

const typeDot = {
  info: 'bg-blue-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  error: 'bg-red-400',
};

const LiveConsole = ({ logs = [], isRunning = false }) => {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="glass-card flex flex-col h-80">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-accent" />
          <span className="text-text-primary text-sm font-medium">Live Console</span>
        </div>
        {isRunning && (
          <div className="flex items-center gap-2">
            <span className="dot-pulse" />
            <span className="text-emerald-400 text-xs font-medium">Running</span>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1.5 bg-surface">
        {logs.length === 0 ? (
          <p className="text-text-muted italic">Waiting for automation to start...</p>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="flex items-start gap-2 animate-in flex-wrap">
              <span className="text-text-muted shrink-0 mt-0.5">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${typeDot[log.type] || 'bg-gray-400'}`} />
              <div className="flex-1 min-w-0">
                <span className={typeColors[log.type] || 'text-text-secondary'}>{log.message}</span>
                {log.type === 'screenshot' && log.image && (
                  <div className="mt-2 mb-2">
                    <img src={log.image} alt="Browser screenshot" className="rounded-md border border-border/50 max-w-full h-auto object-contain max-h-[350px]" />
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default LiveConsole;
