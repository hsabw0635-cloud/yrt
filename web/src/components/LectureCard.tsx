import type { ReactNode } from 'react';
import { CalendarDays, Clock3, DoorOpen, UserRound } from 'lucide-react';
import { Badge } from './ui';
import type { LectureSession } from '../types';

export default function LectureCard({ session, variant, actions }: {
  session: LectureSession; variant: 'student' | 'doctor'; actions?: ReactNode;
}) {
  return (
    <article className={`lecture-card ${session.status === 'open' ? 'open' : ''}`}>
      <div className="lecture-top">
        <div>
          <h3>{session.subject.name}</h3>
          <p>{session.doctor.name}</p>
        </div>
        <Badge status={session.status} />
      </div>
      <div className="lecture-meta">
        <div><CalendarDays size={14} /> {session.dayName} — {session.date}</div>
        <div><Clock3 size={14} /> {session.startTime} إلى {session.endTime}</div>
        <div><DoorOpen size={14} /> القاعة: {session.classroom}</div>
        {variant === 'doctor' && (
          <div><UserRound size={14} /> {session.department?.name} — {session.level?.name} — {session.studyMode === 'morning' ? 'صباحي' : 'مسائي'}</div>
        )}
      </div>
      {variant === 'doctor' && session.counts && (
        <div className="mini-stats">
          <span>الكل <strong>{session.counts.total}</strong></span>
          <span>الحاضرون <strong>{session.counts.present}</strong></span>
          <span>الغائبون <strong>{session.counts.absent}</strong></span>
        </div>
      )}
      {actions && <div className="lecture-actions">{actions}</div>}
    </article>
  );
}
