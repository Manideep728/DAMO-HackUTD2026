import { Activity, ArrowRight, CheckCircle2, Droplets } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { Badge, cx } from '../components/ui';

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
    <nav aria-label="Modernization projects" className="project-switcher mb-6 flex gap-2 overflow-x-auto border-b hairline pb-3">
      {projects.map(({ to, family, label, detail, icon: Icon }) => {
        const active = family === '/modernize' ? path.startsWith('/modernize/') && !path.startsWith('/modernize/retrofit') : path.startsWith(family);
        return (
          <NavLink key={to} to={to} aria-current={active ? 'page' : undefined} className={cx('h-11 px-3 rounded-control inline-flex shrink-0 items-center gap-2.5 text-body t', active ? 'bg-surface-3 text-text font-semibold' : 'text-muted hover:text-text hover:bg-surface-2')}>
            <Icon size={16} /><span>{label}</span><span className="mono text-label text-faint hidden md:inline">{detail}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export function ModernizeHome() {
  return (
    <div className="mx-auto w-full max-w-[1120px]">
      <header className="mb-10 max-w-[760px]">
        <p className="kicker mb-2">Modernize</p>
        <h1 className="page-title">Choose the system you are changing</h1>
        <p className="text-body text-muted mt-3 max-w-prose">Each project keeps its own inputs, decisions, tests and accepted package. The workflow is shared; the evidence is not.</p>
      </header>
      <div className="grid md:grid-cols-2 gap-4">
        <ProjectCard icon={Activity} title="Monitoring check" detail="TTU Redfish · M1–M5" status="Ready to import"
          body="Recover the behavior of an inherited Nagios check, generate a replacement, test the complete alert path and release it with rollback evidence."
          to="/modernize/import" action="Open monitoring project" />
        <ProjectCard icon={Droplets} title="Liquid-cooling retrofit" detail="CDU-1 · row R3" status="Equipment model ready"
          body="Review the accepted cooling graph, correct the wrong-rack mapping, revalidate a firmware update and record field readiness."
          to="/modernize/retrofit" action="Open cooling project" />
      </div>
      <section className="mt-8 border-t hairline pt-6 flex flex-wrap items-center gap-3 text-body">
        <CheckCircle2 size={18} className="text-ok" />
        <span className="font-medium">One accepted package connects modernization to operations.</span>
        <span className="text-muted">Preflight uses the same equipment graph; Operate consumes the reviewed context.</span>
      </section>
    </div>
  );
}

function ProjectCard({ icon: Icon, title, detail, status, body, to, action }: { icon: typeof Activity; title: string; detail: string; status: string; body: string; to: string; action: string }) {
  return (
    <article className="card p-6 flex min-h-[280px] flex-col">
      <div className="flex items-start gap-3">
        <span className="h-10 w-10 rounded-control border hairline grid place-items-center text-muted"><Icon size={19} /></span>
        <div className="min-w-0"><h2 className="text-section font-semibold">{title}</h2><p className="mono text-label text-faint mt-1">{detail}</p></div>
        <Badge tone="ok" title="Current project status">{status}</Badge>
      </div>
      <p className="text-body text-muted mt-6 max-w-prose">{body}</p>
      <Link to={to} className="mt-auto pt-8 inline-flex items-center gap-2 font-semibold text-body hover:text-accent t">{action}<ArrowRight size={16} /></Link>
    </article>
  );
}
