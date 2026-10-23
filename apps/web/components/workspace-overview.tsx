import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowUpLeft } from 'lucide-react';

export function baghdadDay(value: string | Date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(
    new Date(value),
  );
}
export function WorkspaceHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="desk-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="desk-heading-end">
        <time dateTime={baghdadDay()}>
          {new Intl.DateTimeFormat('ar-IQ', {
            timeZone: 'Asia/Baghdad',
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          }).format(new Date())}
        </time>
        {action}
      </div>
    </header>
  );
}
export function WorkspaceLink({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Link className="desk-destination" href={href}>
      <div>
        <strong>{title}</strong>
        <span>{children}</span>
      </div>
      <ArrowUpLeft size={19} aria-hidden="true" />
    </Link>
  );
}
export function WorkspaceEmpty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="desk-empty">
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
