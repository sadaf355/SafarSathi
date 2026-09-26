import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const crumbRoutes: Record<string, string> = {
  Home: 'overview',
  Journey: 'journey',
  Risks: 'risk',
  Trips: 'trips',
  'Sathi AI': 'sathi',
  More: 'more',
  Impact: 'impact',
  Recovery: 'recovery',
};

interface PageHeaderProps {
  title: string;
  description?: string;
  crumbs?: string[];
  onNavigate?: (page: string) => void;
}

export function PageHeader({ title, description, crumbs = [], onNavigate }: PageHeaderProps) {
  return (
    <div className="mb-6">
      {crumbs.length > 0 && (
        <nav className="mb-2 flex items-center gap-1 text-[11px] font-medium text-slate-500" aria-label="Breadcrumb">
          {crumbs.map((crumb, i) => {
            const isCurrent = i === crumbs.length - 1;
            const route = crumbRoutes[crumb];
            const interactive = !isCurrent && !!onNavigate && !!route;
            return (
              <span key={`${crumb}-${i}`} className="flex items-center gap-1">
                {interactive ? (
                  <button
                    type="button"
                    onClick={() => onNavigate(route)}
                    className={cn(
                      'rounded px-1 py-0.5 transition-colors hover:bg-slate-100 hover:text-safar-blue',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safar-blue/40 focus-visible:ring-offset-1'
                    )}
                  >
                    {crumb}
                  </button>
                ) : (
                  <span aria-current={isCurrent ? 'page' : undefined}>{crumb}</span>
                )}
                {i < crumbs.length - 1 && <ChevronRight className="h-3 w-3 text-slate-400" aria-hidden="true" />}
              </span>
            );
          })}
        </nav>
      )}
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
    </div>
  );
}
