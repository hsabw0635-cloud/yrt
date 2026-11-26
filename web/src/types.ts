export type Role = 'admin' | 'doctor' | 'student';

export interface User {
  id: number;
  username: string;
  role: Role;
  fullName: string | null;
  studentId: number | null;
  doctorId: number | null;
  profileCompleted: boolean;
  departmentId?: number | null;
  levelId?: number | null;
  studyMode?: string | null;
}

export interface LookupSet {
  departments: Array<{ id: number; name: string; code: string; is_active: number }>;
  levels: Array<{ id: number; name: string; code: string }>;
  departmentLevels: Array<{ department_id: number; level_id: number }>;
  subjects: Array<{ id: number; name: string; code: string; department_id: number; level_id: number; is_active: number }>;
  doctors: Array<{ id: number; full_name: string; department_id: number | null; username: string; is_active: number }>;
  studyModes: Array<{ code: 'morning' | 'evening'; label_ar: string }>;
}

export interface LectureSession {
  sessionId: number;
  scheduleId: number;
  date: string;
  dayName: string;
  startTime: string;
  endTime: string;
  status: 'locked' | 'open' | 'expired' | 'closed' | 'registered' | 'scheduled';
  rawStatus?: string;
  subject: { id: number; name: string; code?: string };
  doctor: { id?: number; name: string };
  department?: { id: number; name: string };
  level?: { id: number; name: string };
  studyMode: string;
  classroom: string;
  attendance?: { markedAt: string } | null;
  counts?: { total: number; present: number; absent: number; pending: number };
  openedAt?: string | null;
  closedAt?: string | null;
}

export interface AttendanceStudent {
  studentId: number;
  fullName: string;
  universityNumber: string;
  department: string;
  level: string;
  studyMode: string;
  status: 'present' | 'absent';
  attendance: {
    id: number;
    markedAt: string;
    photoAttachmentId: number | null;
    verificationStatus: 'verified' | 'manual' | 'suspicious';
    verificationSource?: 'local' | 'gemini';
    sceneScore: number | null;
    anomalyReason: string | null;
  } | null;
}

export interface ReportRow {
  date: string;
  student: string;
  universityNumber: string;
  department: string;
  level: string;
  studyMode: string;
  subject: string;
  doctor: string;
  status: 'present' | 'absent' | 'not_marked';
  statusLabel: string;
  attendanceId: number | null;
  markedAt: string | null;
}

export interface StudentFile {
  profile: Record<string, unknown>;
  summary: { totalSessions: number; present: number; absent: number; pending: number; rate: number };
  subjects: Array<{ id: number; name: string; code: string; total: number; present: number; absent: number; rate: number }>;
  sessions: Array<{
    date: string;
    dayName: string;
    startTime: string;
    endTime: string;
    subject: string;
    doctor: string;
    classroom: string;
    status: string;
    statusLabel: string;
    markedAt: string | null;
    photoAttachmentId: number | null;
  }>;
}
