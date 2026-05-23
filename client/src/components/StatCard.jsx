import { TrendingUp } from 'lucide-react';

const StatCard = ({ label, value, icon: Icon, color = 'accent', trend }) => {
  const colorMap = {
    accent: 'text-accent bg-accent-muted border-accent/20',
    green: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    yellow: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    red: 'text-red-400 bg-red-500/10 border-red-500/20',
    purple: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  };

  const valueColorMap = {
    accent: 'text-accent',
    green: 'text-emerald-400',
    yellow: 'text-amber-400',
    red: 'text-red-400',
    purple: 'text-violet-400',
  };

  return (
    <div className="glass-card-hover p-5 slide-in">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-2.5 rounded-lg border ${colorMap[color]}`}>
          <Icon size={18} />
        </div>
        {trend !== undefined && (
          <div className="flex items-center gap-1 text-emerald-400 text-xs font-medium">
            <TrendingUp size={12} />
            <span>{trend}</span>
          </div>
        )}
      </div>
      <div>
        <p className={`text-3xl font-bold ${valueColorMap[color]} leading-none mb-1`}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        <p className="text-text-secondary text-sm">{label}</p>
      </div>
    </div>
  );
};

export default StatCard;
