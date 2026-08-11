/**
 * dialogue-provider — where the words come from.
 *
 * The LOCAL provider is the game: rule-based, deterministic, and always
 * available offline. A CLOUD provider may optionally polish a line when the
 * player is talking and the network is up, but it is never required and never
 * blocks the simulation. One shared client — never one model per creature.
 */
import type { DialogueTurn } from './dialogue'

export interface PolishRequest {
  /** the locally generated line (already valid on its own) */
  baseText: string
  speakerName: string
  mood: string
  /** short hints the provider may use; no private state is sent */
  hints: string[]
}

export interface DialogueProvider {
  readonly id: 'local' | 'cloud'
  /** true when the provider can currently serve a request */
  available(): boolean
  /** Returns polished text, or the original when unavailable. */
  polish(req: PolishRequest): Promise<string>
}

export const localProvider: DialogueProvider = {
  id: 'local',
  available: () => true,
  polish: async (req) => req.baseText,
}

export interface CloudConfig {
  endpoint: string
  /** milliseconds before we give up and keep the local line */
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

/**
 * Optional cloud enhancer. Any failure — offline, timeout, bad response —
 * silently falls back to the local line, so play never depends on it.
 */
export function createCloudProvider(config: CloudConfig): DialogueProvider {
  const timeoutMs = config.timeoutMs ?? 1500
  const doFetch = config.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined)
  return {
    id: 'cloud',
    available(): boolean {
      if (!doFetch || !config.endpoint) return false
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
      return true
    },
    async polish(req: PolishRequest): Promise<string> {
      if (!doFetch || !this.available()) return req.baseText
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
        const res = await doFetch(config.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(req),
          signal: controller?.signal,
        })
        if (timer) clearTimeout(timer)
        if (!res.ok) return req.baseText
        const data = (await res.json()) as { text?: string }
        const text = typeof data.text === 'string' ? data.text.trim() : ''
        return text.length > 0 ? text : req.baseText
      } catch {
        return req.baseText
      }
    },
  }
}

/** Choose a provider from settings; cloud is opt-in and degrades gracefully. */
export function providerFor(
  optionalCloudAi: boolean,
  cloud?: DialogueProvider,
): DialogueProvider {
  if (optionalCloudAi && cloud && cloud.available()) return cloud
  return localProvider
}

/** Convenience: polish a finished turn without ever failing the caller. */
export async function polishTurn(
  provider: DialogueProvider,
  turn: DialogueTurn,
  speakerName: string,
  mood: string,
): Promise<DialogueTurn> {
  try {
    const text = await provider.polish({
      baseText: turn.text,
      speakerName,
      mood,
      hints: [turn.semantic.kind],
    })
    return { ...turn, text }
  } catch {
    return turn
  }
}
