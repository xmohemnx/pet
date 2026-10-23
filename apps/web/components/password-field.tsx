'use client';
import { useId, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function PasswordField({
  label,
  hint,
  ...input
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id'> & {
  label: string;
  hint?: string;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-control">
        <input
          {...input}
          id={id}
          type={visible ? 'text' : 'password'}
          dir="ltr"
          spellCheck={false}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        <button
          type="button"
          className="password-toggle"
          aria-label={`${visible ? 'إخفاء' : 'إظهار'} ${label}`}
          aria-pressed={visible}
          aria-controls={id}
          disabled={input.disabled}
          onClick={() => setVisible(!visible)}
        >
          {visible ? (
            <EyeOff size={20} aria-hidden="true" />
          ) : (
            <Eye size={20} aria-hidden="true" />
          )}
        </button>
      </div>
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
