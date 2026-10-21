'use client';
import { useState } from 'react';
import type { RescueCase } from '@petra/contracts';
import { api } from '../lib/auth-client';
import { CareAction } from './care-shared';
export function RescueMatches({ caseId }: { caseId: string }) {
  const [matches, setMatches] = useState<RescueCase[] | null>(null);
  return (
    <div>
      <CareAction
        action={async () =>
          setMatches(await api<RescueCase[]>(`rescue/cases/${caseId}/matches`))
        }
      >
        اقتراحات مفقود ومعثور
      </CareAction>
      {matches && (
        <>
          <p>
            اقتراحات أولية حسب النوع والمدينة خلال 90 يوماً، وليست إثبات ملكية
            أو تأكيد تطابق. لا تتضمن موقعاً خاصاً.
          </p>
          {matches.map((c) => (
            <article key={c.id}>
              <h4>{c.title}</h4>
              <p>{c.description}</p>
              <p>
                {c.city} · {c.status}
              </p>
            </article>
          ))}
          {!matches.length && <p>لا اقتراحات متاحة حالياً.</p>}
        </>
      )}
    </div>
  );
}
