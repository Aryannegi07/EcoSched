import { Children, cloneElement, isValidElement } from 'react';
import Icon from './Icon.jsx';

/** Label + control + hint + error. A single child control gets its id and aria attributes automatically. */
export default function Field({ label, name, error, hint, children }) {
  const control = Children.count(children) === 1 && isValidElement(children)
    ? cloneElement(children, {
      id: name,
      'aria-invalid': error ? 'true' : undefined,
      'aria-describedby': error ? `${name}-err` : hint ? `${name}-hint` : undefined,
    })
    : children;
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      {control}
      {hint && !error && <p className="hint" id={`${name}-hint`}>{hint}</p>}
      {error && <span className="field-error" id={`${name}-err`} role="alert"><Icon name="alert" />{error}</span>}
    </div>
  );
}

/** For groups of radios (chips, pick lists). */
export function Fieldset({ legend, error, hint, children }) {
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: '0 0 16px' }}>
      <legend className="legend" style={{ padding: 0, marginBottom: 6, fontWeight: 600, fontSize: '0.92rem' }}>{legend}</legend>
      {children}
      {hint && !error && <p className="hint">{hint}</p>}
      {error && <span className="field-error" role="alert"><Icon name="alert" />{error}</span>}
    </fieldset>
  );
}
