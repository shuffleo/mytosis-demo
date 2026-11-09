import { describe, expect, it } from 'vitest'
import {
  LocalReflectiveContentProvider,
  type ReflectiveContent,
} from './reflective-content'

function expectJournalSentence(content: ReflectiveContent) {
  const words = content.text.match(/[\p{L}\p{N}'-]+/gu) ?? []
  expect(words.length).toBeGreaterThanOrEqual(5)
  expect(words.length).toBeLessThanOrEqual(20)
  expect(content.text).toMatch(/[.!?]$/u)
}

describe('reflective content provider', () => {
  const provider = new LocalReflectiveContentProvider()

  it('supplies concrete 5–20 word fixtures and replaceable provenance', () => {
    expect(provider.initialFixtures()).toHaveLength(12)
    for (const fixture of provider.initialFixtures()) {
      expectJournalSentence(fixture)
      expect(fixture.provenance.provider).toBe(provider.id)
      expect(fixture.provenance.themes.length).toBeGreaterThan(0)
    }
    expect(provider.manualGhostPrompt(3)).toMatch(/\?$/u)
  })

  it('keeps source IDs through merge, split, synthesis, and group-title fallbacks', () => {
    const sources = [
      { id: 'a', text: 'I protected a quiet hour before the planning meeting.' },
      { id: 'b', text: 'The teammate conversation clarified one uncertain decision.' },
    ]
    const generated = [
      provider.merge(sources),
      ...provider.split(sources[0], 4),
      provider.synthesize(sources),
      provider.groupTitle(sources),
    ]
    for (const item of generated) {
      expectJournalSentence(item)
      expect(item.provenance.sourceIds.length).toBeGreaterThan(0)
    }
    expect(provider.merge([]).text).toContain('related thoughts')
    expect(provider.synthesize([]).text).toContain('shared pattern')
    expect(provider.groupTitle([]).text).toContain('pattern')
  })

  it('returns deterministic clustering demo content', () => {
    expect(provider.clusteringDemo(7)).toEqual(provider.clusteringDemo(7))
    expect(provider.clusteringDemo(19)).toEqual(provider.clusteringDemo(7))
  })
})
