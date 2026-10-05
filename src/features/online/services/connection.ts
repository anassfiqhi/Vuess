import { io, type Socket } from 'socket.io-client'
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '../protocol'

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>

/** The online server; set VITE_ONLINE_SERVER_URL when it runs elsewhere. */
export const ONLINE_SERVER_URL: string = import.meta.env.VITE_ONLINE_SERVER_URL ?? 'http://localhost:4310'

const REQUEST_TIMEOUT_MS = 8_000

type Event = keyof ClientToServerEvents
type Payload<E extends Event> = Parameters<ClientToServerEvents[E]>[0]
type Response<E extends Event> = Parameters<Parameters<ClientToServerEvents[E]>[1]>[0]

/** Opens the Socket.IO connection. Socket.IO reconnects automatically after drops. */
export function openSocket(url = ONLINE_SERVER_URL): GameSocket {
  return io(url, { transports: ['websocket', 'polling'], autoConnect: true })
}

/**
 * Sends a request and resolves with the server's acknowledgement. Network
 * problems (timeout, no connection) resolve as an error ack instead of
 * throwing, so callers handle every failure the same way.
 */
export async function request<E extends Event>(socket: GameSocket, event: E, payload: Payload<E>): Promise<Response<E>> {
  try {
    // Call emitWithAck on the timed socket itself; it relies on `this`.
    const timed = socket.timeout(REQUEST_TIMEOUT_MS) as unknown as {
      emitWithAck(e: E, p: Payload<E>): Promise<Response<E>>
    }
    return await timed.emitWithAck(event, payload)
  } catch {
    const failure: Ack<object> = { ok: false, error: 'The online server did not answer. Check your connection.' }
    return failure as Response<E>
  }
}
