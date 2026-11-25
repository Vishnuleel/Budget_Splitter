import { useState } from 'react';
import { motion } from 'motion/react';
import { Trash2 } from 'lucide-react';
import { Field, Sheet } from '../ui/primitives';
import { parseAmount } from '../../lib/format';

export type FormField = {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select';
  placeholder?: string;
  options?: string[];
  required?: boolean;
  half?: boolean;
};

export type FormSpec = {
  title: string;
  fields: FormField[];
  initial?: Record<string, string>;
  submitLabel?: string;
  danger?: boolean;
  onSubmit: (values: Record<string, string>) => Promise<boolean | void> | boolean | void;
  onDelete?: () => Promise<boolean | void> | boolean | void;
  note?: string;
};

function FormBody({ spec, onClose }: { spec: FormSpec; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of spec.fields) v[f.name] = spec.initial?.[f.name] ?? (f.type === 'select' ? f.options?.[0] ?? '' : '');
    return v;
  });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const valid = spec.fields.every(f => !f.required || values[f.name]?.trim());

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    let ok: boolean | void = false;
    // Number fields leave here as plain "1200.5" so every form's Number(v.x) reads "1,200" / "49,90" right.
    const clean = { ...values };
    for (const f of spec.fields) if (f.type === 'number' && clean[f.name]) clean[f.name] = String(parseAmount(clean[f.name]));
    try { ok = await spec.onSubmit(clean); } finally { setBusy(false); }
    if (ok !== false) onClose();
  };

  const rows: FormField[][] = [];
  for (const f of spec.fields) {
    const last = rows[rows.length - 1];
    if (f.half && last && last.length === 1 && last[0].half) last.push(f);
    else rows.push([f]);
  }

  return (
    <form className="form-stack" onSubmit={e => { e.preventDefault(); submit(); }}>
      {spec.note && <p className="muted" style={{ fontSize: '0.88rem', fontWeight: 600 }}>{spec.note}</p>}
      {rows.map((r, i) => (
        <div key={i} className={r.length === 2 ? 'form-grid' : undefined}>
          {r.map(f => (
            <Field key={f.name} label={f.label}>
              {f.type === 'select' ? (
                <select className="input" value={values[f.name]} onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}>
                  {f.options?.map(o => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  className={`input${f.type === 'number' ? ' num' : ''}`}
                  type={f.type === 'date' ? 'date' : 'text'}
                  inputMode={f.type === 'number' ? 'decimal' : undefined}
                  placeholder={f.placeholder}
                  value={values[f.name]}
                  autoFocus={i === 0}
                  onChange={e => {
                    const raw = e.target.value;
                    setValues(v => ({ ...v, [f.name]: f.type === 'number'
                      // "49,90" means 49.90: turn the comma into a point instead of dropping it, keep one point.
                      ? raw.replace(/[^\d.,]/g, '') // parsed with parseAmount on submit
                      : raw }));
                  }}
                />
              )}
            </Field>
          ))}
        </div>
      ))}
      <motion.button type="submit" className={`btn btn-block ${spec.danger ? 'btn-danger' : 'btn-primary'}`} disabled={!valid || busy} whileTap={{ scale: 0.97 }}>
        {busy ? 'Saving…' : spec.submitLabel ?? 'Save'}
      </motion.button>
      {spec.onDelete && (
        <motion.button type="button" className="btn btn-block btn-ghost" style={{ color: 'var(--rose)' }} whileTap={{ scale: 0.97 }}
          onClick={async () => {
            if (!confirmDelete) { setConfirmDelete(true); return; }
            setBusy(true);
            const ok = await spec.onDelete?.();
            setBusy(false);
            if (ok !== false) onClose();
          }}>
          <Trash2 size={16} /> {confirmDelete ? 'Tap again to delete permanently' : 'Delete'}
        </motion.button>
      )}
    </form>
  );
}

export default function FormSheet({ spec, onClose }: { spec: FormSpec | null; onClose: () => void }) {
  return (
    <Sheet open={!!spec} onClose={onClose} title={spec?.title}>
      {spec && <FormBody key={spec.title} spec={spec} onClose={onClose} />}
    </Sheet>
  );
}
