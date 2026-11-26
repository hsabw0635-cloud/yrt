import { EventEmitter } from 'node:events';
import { asyncHandler } from './errors.mjs';
import { authRequired } from './auth.mjs';

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export function publish(event, payload) {
  emitter.emit('event', { event, payload, at: new Date().toISOString() });
}

export function subscribe(listener) {
  emitter.on('event', listener);
  return () => emitter.off('event', listener);
}

const streamHandler = asyncHandler((req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  res.write(`event: connected\ndata: ${JSON.stringify({ userId: req.user.id, role: req.user.role })}\n\n`);

  const unsubscribe = subscribe((message) => {
    res.write(`event: ${message.event}\ndata: ${JSON.stringify(message.payload)}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

export const sseHandler = [authRequired, streamHandler];
