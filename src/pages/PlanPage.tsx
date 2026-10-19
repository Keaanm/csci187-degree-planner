import { useState } from 'react';
import { catalog, requirements } from '../catalog';
import { DegreePlan, MAX_UNITS_PER_QUARTER, QUARTER_COUNT, quarterLabel } from '../DegreePlan';
import type { PrerequisiteWarning } from '../DegreePlan';
import { loadPlan, savePlan } from '../planStorage';

function QuarterCard({ plan, quarter, warnings, onChange }: {
  plan: DegreePlan;
  quarter: number;
  warnings: PrerequisiteWarning[];
  onChange: (plan: DegreePlan) => void;
}) {
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const available = catalog.filter((c) => !plan.hasCourse(c.code));

  function add() {
    try {
      onChange(plan.addCourse(quarter, selected));
      setSelected('');
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section className="quarter">
      <h3>
        {quarterLabel(quarter)}{' '}
        <small>({plan.unitsIn(quarter)}/{MAX_UNITS_PER_QUARTER} units)</small>
      </h3>
      <ul>
        {plan.coursesIn(quarter).map((c) => {
          const warning = warnings.find((w) => w.course.code === c.code);
          return (
            <li key={c.code}>
              {c.code}: {c.title} ({c.units}){' '}
              <button onClick={() => onChange(plan.removeCourse(quarter, c.code))} aria-label={`Remove ${c.code}`}>
                ×
              </button>
              {warning && (
                <div className="warning" role="alert">
                  ⚠ Take {warning.missing.map((group) => group.join(' or ')).join(', and ')} in an earlier quarter first
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label={`Course for ${quarterLabel(quarter)}`}>
        <option value="">Choose a course…</option>
        {available.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code}: {c.title} ({c.units} units)
          </option>
        ))}
      </select>
      <button onClick={add} disabled={!selected}>
        Add
      </button>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

export default function PlanPage() {
  const [plan, setPlan] = useState(() => loadPlan());
  const [saved, setSaved] = useState(true);
  const warnings = plan.prerequisiteWarnings();

  function change(next: DegreePlan) {
    setPlan(next);
    setSaved(false);
  }

  function save() {
    savePlan(plan);
    setSaved(true);
  }

  return (
    <>
      <h1>4-Year Plan</h1>
      <p>
        Total planned units: {plan.totalUnits()}{' '}
        <button onClick={save} disabled={saved}>
          Save plan
        </button>{' '}
        <span>{saved ? 'All changes saved' : 'Unsaved changes'}</span>
      </p>

      <h2>Requirements</h2>
      <ul>
        {plan.requirementStatus(requirements).map(({ requirement, satisfied, stillNeeded, missing }) => (
          <li key={requirement.description}>
            {satisfied ? '✓' : '○'} {requirement.description}
            {satisfied
              ? ' (satisfied by your plan)'
              : stillNeeded === missing.length
                ? `: still need ${missing.join(', ')}`
                : `: still need ${stillNeeded} of ${missing.join(', ')}`}
          </li>
        ))}
      </ul>

      <h2>Quarters</h2>
      <div className="quarters">
        {Array.from({ length: QUARTER_COUNT }, (_, q) => (
          <QuarterCard key={q} plan={plan} quarter={q} warnings={warnings} onChange={change} />
        ))}
      </div>
    </>
  );
}
