import { Activity, Droplets } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cx } from '../components/ui';

const projects = [
  {
    to: '/modernize/import',
    family: '/modernize',
    label: 'Monitoring check',
    detail: 'TTU Redfish · M1–M5',
    icon: Activity,
  },
  {
    to: '/modernize/retrofit',
    family: '/modernize/retrofit',
    label: 'Liquid-cooling retrofit',
    detail: 'CDU · row R3',
    icon: Droplets,
  },
] as const;

export function ModernizeProjects({ path }: { path: string }) {
  return (
    <nav aria-label="Modernization projects" className="mb-6 flex flex-wrap gap-2 border-b hairline pb-3">
      {projects.map(({ to, family, label, detail, icon: Icon }) => {
        const active = family === '/modernize' ? path.startsWith('/modernize/') && !path.startsWith('/modernize/retrofit') : path.startsWith(family);
        return (
          <NavLink key={to} to={to} className={cx('h-12 px-3 rounded-lg inline-flex items-center gap-2.5 text-[14px] t', active ? 'bg-surface-3 text-text font-semibold' : 'text-muted hover:text-text hover:bg-surface-2')}>
            <Icon size={16} /><span>{label}</span><span className="mono text-[12px] text-faint hidden sm:inline">{detail}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
