interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: string;
  color?: 'primary' | 'green' | 'yellow' | 'red' | 'orange';
}

const colorClasses = {
  primary: 'from-sky-500 to-sky-600',
  green: 'from-emerald-500 to-emerald-600',
  yellow: 'from-amber-500 to-amber-600',
  red: 'from-red-500 to-red-600',
  orange: 'from-orange-500 to-orange-600',
};

export function StatCard({ title, value, subtitle, icon, color = 'primary' }: StatCardProps) {
  return (
    <div className="stat-card group">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-400">{title}</p>
          <p className="mt-2 text-3xl font-bold text-white">{value}</p>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-xl bg-gradient-to-br ${colorClasses[color]} shadow-lg`}>
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
          </svg>
        </div>
      </div>
    </div>
  );
}

