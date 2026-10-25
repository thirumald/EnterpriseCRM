import { EventEmitter } from 'node:events';
import type { Response } from 'express';

/** In-process event bus. Domain events (alert.opened, ticket.created, sla.breached ...) fan out to SSE clients
 *  and to internal subscribers. In production this is the Kafka/NATS boundary between microservices. */
export const bus = new EventEmitter();
bus.setMaxListeners(200);

export function publish(type: string, data: any) {
  const evt = { type, data, at: new Date().toISOString() };
  bus.emit('event', evt);
  bus.emit(type, data);
}

export function sseHandler(req: any, res: Response) {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write(': connected\n\n');
  const on = (evt: any) => res.write(`event: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`);
  bus.on('event', on);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => { bus.off('event', on); clearInterval(ping); });
}
