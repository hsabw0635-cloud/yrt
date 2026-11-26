import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, DoorOpen, RefreshCw } from 'lucide-react';
import api, { errorMessage } from '../api';
import { createSceneSignature, type SceneSignature } from '../sceneSignature';
import { Badge, Modal, useToast } from './ui';
import type { LectureSession } from '../types';

type Phase = 'explain' | 'camera' | 'ready' | 'sending' | 'done';

export default function CheckInModal({ session, open, onClose, onSuccess }: {
  session: LectureSession | null; open: boolean; onClose: () => void; onSuccess: () => void;
}) {
  const { show } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>('explain');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [signature, setSignature] = useState<SceneSignature | null>(null);
  const [warning, setWarning] = useState(false);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    if (!open) {
      stopCamera();
      setPhase('explain');
      setPhoto(null);
      setPreview(null);
      setSignature(null);
      setWarning(false);
    }
    return stopCamera;
  }, [open]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      show(errorMessage(error), 'error');
    }
  };

  useEffect(() => {
    if (phase === 'camera') startCamera();
    else if (phase !== 'ready') stopCamera();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return show('الكاميرا غير جاهزة بعد', 'error');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0);
    const sceneSignature = createSceneSignature(canvas);
    canvas.toBlob((blob) => {
      if (!blob) return show('تعذر التقاط الصورة', 'error');
      setPhoto(blob);
      setSignature(sceneSignature);
      setPreview(URL.createObjectURL(blob));
      stopCamera();
      setPhase('ready');
    }, 'image/jpeg', 0.85);
  };

  const submit = async () => {
    if (!session || !photo) return;
    setPhase('sending');
    const body = new FormData();
    body.append('sessionId', String(session.sessionId));
    body.append('photo', photo, 'attendance.jpg');
    if (signature) body.append('sceneSignature', JSON.stringify(signature));
    try {
      const { data } = await api.post('/student/attendance', body);
      const suspicious = data.verification?.status === 'suspicious';
      show(data.message, suspicious ? 'error' : 'success');
      setWarning(suspicious);
      setPhase('done');
      onSuccess();
    } catch (error) {
      show(errorMessage(error), 'error');
      setPhase('ready');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="تسجيل الحضور" wide>
      {!session ? null : (
        <>
          <div className="notice">
            يطلب النظام إذن <strong>الكاميرا</strong> لالتقاط صورة فورية واحدة داخل القاعة. تُحفظ الصورة على السيرفر ويطلع عليها الدكتور المختص، ويتم مقارنة مكان التصوير بصور زملائك في المحاضرة. لا يمكن اختيار صورة قديمة من الجهاز.
          </div>
          <div className="lecture-card" style={{ marginTop: 16, boxShadow: 'none' }}>
            <div className="lecture-top">
              <div><h3>{session.subject.name}</h3><p>{session.doctor.name}</p></div>
              <Badge status={session.status} />
            </div>
            <div className="lecture-meta">
              <div><DoorOpen size={14} /> {session.classroom}</div>
              <div>{session.startTime} - {session.endTime}</div>
            </div>
          </div>

          <div className="step-list">
            <div className={`step ${photo ? 'done' : ''}`}><span className="step-num">1</span> التقاط صورة فورية بالكاميرا {photo ? '✓' : ''}</div>
            <div className={`step ${phase === 'done' ? 'done' : ''}`}><span className="step-num">2</span> إرسال بيانات الحضور</div>
          </div>

          {phase === 'explain' && (
            <div className="modal-actions"><button className="btn btn-primary" onClick={() => setPhase('camera')}><Camera size={16} /> السماح بالكاميرا والمتابعة</button></div>
          )}

          {phase === 'camera' && (
            <>
              <video ref={videoRef} className="camera-view" playsInline muted autoPlay />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              <div className="modal-actions">
                <button className="btn btn-primary" onClick={capture}><Camera size={16} /> التقاط الصورة</button>
              </div>
            </>
          )}

          {phase === 'ready' && (
            <>
              {preview && <img src={preview} alt="صورة الحضور" className="capture-preview" />}
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => { setPhoto(null); setPreview(null); setSignature(null); setPhase('camera'); }}>إعادة الالتقاط</button>
                <button className="btn btn-teal" onClick={submit}>تأكيد تسجيل الحضور</button>
              </div>
            </>
          )}

          {phase === 'sending' && <div className="loading"><RefreshCw className="spin" /> جارٍ تسجيل الحضور...</div>}

          {phase === 'done' && (
            <div className="empty-state" style={{ minHeight: 160 }}>
              {warning ? <AlertTriangle size={44} color="var(--rose)" /> : <CheckCircle2 size={44} color="var(--teal)" />}
              <strong style={{ fontSize: 18 }}>{warning ? 'تم تسجيل حضورك، وجارٍ مراجعة الصورة ⚠️' : 'تم تسجيل حضورك بنجاح ✅'}</strong>
              <button className="btn btn-primary" onClick={onClose}>إغلاق</button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
