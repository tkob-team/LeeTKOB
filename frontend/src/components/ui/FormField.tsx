import { cloneElement, useId, type ReactElement } from 'react';

interface ControlProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

export interface FormFieldProps {
  /** Always visible; placeholder text is never the label. */
  label: string;
  /** One input, select or textarea. */
  children: ReactElement<ControlProps>;
  help?: string;
  /** Message from the problem's `errors[]` for this field. */
  error?: string;
}

export function FormField({ label, children, help, error }: FormFieldProps) {
  const generatedId = useId();
  const id = children.props.id ?? generatedId;
  const noteId = `${id}-note`;
  const note = error ?? help;
  const control = cloneElement(children, {
    id,
    'aria-describedby': note ? noteId : undefined,
    'aria-invalid': error ? true : undefined,
  });
  return (
    <div className={error ? 'lk-field lk-field--error' : 'lk-field'}>
      <label htmlFor={id}>{label}</label>
      {control}
      {error ? (
        <p id={noteId} className="lk-field__error">
          {error}
        </p>
      ) : help ? (
        <p id={noteId} className="lk-field__help">
          {help}
        </p>
      ) : null}
    </div>
  );
}
