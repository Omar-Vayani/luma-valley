import { describe, expect, it } from 'vitest'
import { createLanguage, learnWord, sayWord, hearWord, shareWithNeighbors, getWord, CONCEPTS } from './language'

describe('language — creatures learn words by association', () => {
  it('a creature coins a word when it experiences something new', () => {
    const lang = createLanguage(7)
    learnWord(lang, 'food', 1) // ate bread — strong association
    const w = getWord(lang, 'food')
    expect(w).not.toBeNull()
    expect(lang.vocab.size).toBeGreaterThan(0)
  })

  it('the same concept uses the same word for that creature', () => {
    const lang = createLanguage(7)
    learnWord(lang, 'food', 0.8)
    const first = getWord(lang, 'food')!
    learnWord(lang, 'food', 0.9)
    expect(getWord(lang, 'food')).toBe(first)
  })

  it('a creature hears a new word and learns what it means in context', () => {
    const lang = createLanguage(7)
    hearWord(lang, 'gloob', 'danger', 0.7)
    const w = getWord(lang, 'danger')
    expect(w).toBe('gloob')
  })

  it('vocabulary grows as the creature experiences more concepts', () => {
    const lang = createLanguage(7)
    learnWord(lang, 'food', 0.8)
    learnWord(lang, 'work', 0.6)
    learnWord(lang, 'love', 1.0)
    expect(lang.vocab.size).toBe(3)
  })

  it('sayWord picks the creature word for a concept', () => {
    const lang = createLanguage(7)
    learnWord(lang, 'food', 0.9)
    expect(sayWord(lang, 'food')).toBe(getWord(lang, 'food'))
    expect(sayWord(lang, 'unknown-concept')).toBeNull()
  })

  it('creatures with shared experiences build a shared local vocabulary', () => {
    const a = createLanguage(7)
    const b = createLanguage(8)
    learnWord(a, 'food', 1)
    const word = getWord(a, 'food')!
    // a says the word, b hears it in a food context
    hearWord(b, word, 'food', 1)
    expect(getWord(b, 'food')).toBe(word)
  })

  it('shareWithNeighbors spreads words to nearby creatures', () => {
    const a = createLanguage(7)
    const b = createLanguage(8)
    learnWord(a, 'danger', 0.9)
    const word = getWord(a, 'danger')!
    shareWithNeighbors(a, b, 'danger', 1)
    expect(getWord(b, 'danger')).toBe(word)
  })

  it('every concept is listed so creatures can talk about the world', () => {
    expect(CONCEPTS.length).toBeGreaterThan(3)
    expect(CONCEPTS).toContain('food')
  })
})
