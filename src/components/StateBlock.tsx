import type { ReactNode } from 'react';

export function StateBlock({ title, body }: { title: string; body?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-lineStrong bg-surfaceAlt px-5 py-10 text-center">
      <p className="text-sm font-semibold text-muted">{title}</p>
      {body ? <div className="mt-2 text-sm text-mutedSoft">{body}</div> : null}
    </div>
  );
}
