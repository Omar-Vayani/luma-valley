/**
 * language — creatures learn words by direct association with objects and
 * actions. Each creature keeps a small vocabulary mapping concept → word with
 * a strength. Words are coined from a shared syllable set, so creatures that
 * experience the same things tend to build a shared local language, and
 * hearing a word in context teaches its meaning. Communication is localized:
 * creatures only share words with creatures they can actually reach.
 */

/** The concepts creatures can talk about — objects and actions. */
export const CONCEPTS = ['food', 'danger', 'work', 'love', 'play', 'sleep', 'friend', 'money', 'help', 'home', 'medicine', 'gift']

const SYLLABLES = ['ba', 'di', 'go', 'ku', 'la', 'mo', 'ni', 'po', 'ra', 'si', 'tu', 'va', 'we', 'za', 'bi', 'du', 'fa', 'gi', 'ha', 'jo']

export interface WordEntry {
  word: string
  strength: number // 0..1 how well this creature knows it
}

export interface LanguageState {
  vocab: Map<string, WordEntry> // concept -> word
  wordToConcept: Map<string, string> // word -> concept
}

export function createLanguage(seed: number): LanguageState {
  void seed
  return { vocab: new Map(), wordToConcept: new Map() }
}

function coinWord(seed: number, used: Set<string>): string {
  let w = ''
  do {
    const n = 1 + (Math.floor(seed * 7919 + Math.random() * 100) % 2)
    let s = ''
    for (let i = 0; i < n; i++) {
      s += SYLLABLES[Math.floor((Math.random() * 997 + i * 13 + seed) % SYLLABLES.length)]
    }
    w = s
  } while (used.has(w))
  used.add(w)
  return w
}

/** The creature experiences `concept` — coins a word or strengthens it. */
export function learnWord(lang: LanguageState, concept: string, strength: number): string | null {
  if (!CONCEPTS.includes(concept)) return null
  const existing = lang.vocab.get(concept)
  if (existing) {
    existing.strength = Math.min(1, existing.strength + strength * 0.3)
    return existing.word
  }
  const word = coinWord(Math.random(), new Set(lang.wordToConcept.keys()))
  lang.vocab.set(concept, { word, strength: Math.min(1, strength) })
  lang.wordToConcept.set(word, concept)
  return word
}

/** The creature hears `word` while experiencing `concept` — learns the mapping. */
export function hearWord(lang: LanguageState, word: string, concept: string, strength: number): void {
  if (!CONCEPTS.includes(concept)) return
  // if the creature already has a word for this concept, keep the stronger
  const existing = lang.vocab.get(concept)
  if (existing && existing.strength >= strength) return
  if (existing) {
    // upgrade: replace old word with the heard one (community wins)
    lang.wordToConcept.delete(existing.word)
    lang.vocab.set(concept, { word, strength: Math.max(existing.strength, strength) })
    lang.wordToConcept.set(word, concept)
    return
  }
  lang.vocab.set(concept, { word, strength: Math.min(1, strength) })
  lang.wordToConcept.set(word, concept)
}

/** The creature's word for a concept (or null if it doesn't know one). */
export function getWord(lang: LanguageState, concept: string): string | null {
  return lang.vocab.get(concept)?.word ?? null
}

/** What the creature says to express a concept. */
export function sayWord(lang: LanguageState, concept: string): string | null {
  return getWord(lang, concept)
}

/** Share a concept's word with a nearby creature (localized communication). */
export function shareWithNeighbors(from: LanguageState, to: LanguageState, concept: string, strength: number): void {
  const word = getWord(from, concept)
  if (!word) return
  hearWord(to, word, concept, strength)
}
