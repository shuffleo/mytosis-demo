export type ReflectiveOperation =
  | 'initial'
  | 'manual'
  | 'merge'
  | 'split'
  | 'auto-growth'
  | 'group-title'
  | 'clustering-demo'

export interface ReflectiveSource {
  id: string
  text: string
}

export interface ContentProvenance {
  provider: string
  operation: ReflectiveOperation
  sourceIds: string[]
  themes: string[]
  tensions: string[]
  horizon: 'today' | 'this-week' | 'longer-term'
}

export interface ReflectiveContent {
  text: string
  provenance: ContentProvenance
}

export interface ReflectiveContentProvider {
  readonly id: string
  initialFixtures(): ReflectiveContent[]
  manualGhostPrompt(order: number): string
  merge(sources: readonly ReflectiveSource[]): ReflectiveContent
  split(source: ReflectiveSource, count: number): ReflectiveContent[]
  synthesize(sources: readonly ReflectiveSource[]): ReflectiveContent
  groupTitle(sources: readonly ReflectiveSource[]): ReflectiveContent
  clusteringDemo(index: number): ReflectiveContent
}

interface Fixture {
  text: string
  themes: string[]
  tensions: string[]
  horizon: ContentProvenance['horizon']
}

const FIXTURES: readonly Fixture[] = [
  {
    text: 'I protected one quiet hour before meetings filled the afternoon.',
    themes: ['attention', 'boundaries'],
    tensions: ['focus-versus-availability'],
    horizon: 'today',
  },
  {
    text: 'Asking for help early kept a small uncertainty from becoming expensive.',
    themes: ['collaboration', 'clarity'],
    tensions: ['independence-versus-support'],
    horizon: 'today',
  },
  {
    text: 'I delayed the decision because both options still carried real value.',
    themes: ['decision-making', 'tradeoffs'],
    tensions: ['speed-versus-care'],
    horizon: 'this-week',
  },
  {
    text: 'The difficult conversation became easier after I named the specific concern.',
    themes: ['collaboration', 'communication'],
    tensions: ['comfort-versus-honesty'],
    horizon: 'today',
  },
  {
    text: 'I left one unfinished task alone and returned with a clearer next step.',
    themes: ['attention', 'rest'],
    tensions: ['progress-versus-patience'],
    horizon: 'today',
  },
  {
    text: 'Tomorrow needs one deliberate priority, not another longer list.',
    themes: ['planning', 'focus'],
    tensions: ['ambition-versus-capacity'],
    horizon: 'this-week',
  },
  {
    text: 'A small kindness from a teammate changed how I carried the afternoon.',
    themes: ['collaboration', 'care'],
    tensions: ['pressure-versus-connection'],
    horizon: 'today',
  },
  {
    text: 'I noticed urgency fading once the real deadline was written down.',
    themes: ['planning', 'clarity'],
    tensions: ['urgency-versus-importance'],
    horizon: 'today',
  },
  {
    text: 'The work felt lighter when I separated the question from the answer.',
    themes: ['clarity', 'learning'],
    tensions: ['certainty-versus-curiosity'],
    horizon: 'this-week',
  },
  {
    text: 'I made space for curiosity instead of defending my first idea.',
    themes: ['learning', 'creativity'],
    tensions: ['conviction-versus-openness'],
    horizon: 'today',
  },
  {
    text: 'One recurring meeting no longer earns the energy it consumes.',
    themes: ['boundaries', 'planning'],
    tensions: ['habit-versus-value'],
    horizon: 'longer-term',
  },
  {
    text: 'The next useful experiment is smaller than the plan I imagined.',
    themes: ['learning', 'experimentation'],
    tensions: ['scope-versus-learning'],
    horizon: 'this-week',
  },
] as const

const GHOST_PROMPTS = [
  'What changed your mind today?',
  'What felt harder than expected?',
  'What deserves more attention tomorrow?',
  'What did you avoid, and why?',
  'Which moment gave you useful energy?',
] as const

const STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'another',
  'because',
  'before',
  'both',
  'from',
  'have',
  'into',
  'more',
  'that',
  'the',
  'their',
  'this',
  'today',
  'with',
])

function cleanWords(text: string) {
  return text
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}'-]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function salientWords(text: string, limit = 5) {
  const words = cleanWords(text)
  const meaningful = words.filter((word) => !STOP_WORDS.has(word.toLowerCase()))
  return (meaningful.length >= 2 ? meaningful : words).slice(0, limit)
}

function sentence(words: readonly string[]) {
  const content = words.join(' ').replace(/[.,;:!?]+$/u, '')
  if (!content) return ''
  return `${content[0].toUpperCase()}${content.slice(1)}.`
}

function provenance(
  operation: ReflectiveOperation,
  sourceIds: readonly string[],
  themes: readonly string[],
  tensions: readonly string[],
  horizon: ContentProvenance['horizon'] = 'today',
): ContentProvenance {
  return {
    provider: 'local-reflective-v1',
    operation,
    sourceIds: [...sourceIds],
    themes: [...new Set(themes)].slice(0, 4),
    tensions: [...new Set(tensions)].slice(0, 3),
    horizon,
  }
}

function boundedSentence(text: string, fallback: string) {
  const words = cleanWords(text || fallback)
  const bounded = words.slice(0, 20)
  while (bounded.length < 5) {
    const next = cleanWords(fallback)[bounded.length % cleanWords(fallback).length]
    bounded.push(next)
  }
  return sentence(bounded)
}

export class LocalReflectiveContentProvider implements ReflectiveContentProvider {
  readonly id = 'local-reflective-v1'

  initialFixtures() {
    return FIXTURES.map((fixture, index) => ({
      text: fixture.text,
      provenance: provenance(
        index < 8 ? 'initial' : 'clustering-demo',
        [],
        fixture.themes,
        fixture.tensions,
        fixture.horizon,
      ),
    }))
  }

  manualGhostPrompt(order: number) {
    return GHOST_PROMPTS[Math.abs(order) % GHOST_PROMPTS.length]
  }

  merge(sources: readonly ReflectiveSource[]) {
    const fragments = sources
      .filter((source) => source.text.trim())
      .flatMap((source) => salientWords(source.text, 6))
    const text = fragments.length
      ? boundedSentence(
          `I am holding ${fragments.slice(0, 5).join(' ')} alongside ${fragments.slice(5, 10).join(' ')}`,
          'I am holding two related thoughts and looking for the shared decision',
        )
      : 'I am holding two related thoughts and looking for their shared decision.'
    return {
      text,
      provenance: provenance('merge', sources.map((source) => source.id), ['synthesis'], [
        'connection-versus-distinction',
      ]),
    }
  }

  split(source: ReflectiveSource, count: number) {
    const words = cleanWords(source.text)
    const boundedCount = Math.max(2, Math.min(4, count))
    const fallbacks = [
      'What I know is concrete enough to keep.',
      'What remains uncertain needs a smaller question.',
      'The next action can stay deliberately small.',
      'The tension deserves attention before another decision.',
    ]
    return Array.from({ length: boundedCount }, (_, index) => {
      const start = Math.floor((index * words.length) / boundedCount)
      const end = Math.floor(((index + 1) * words.length) / boundedCount)
      const fragment = words.slice(start, end).join(' ')
      return {
        text: boundedSentence(fragment, fallbacks[index]),
        provenance: provenance('split', [source.id], ['decomposition'], [
          'whole-versus-parts',
        ]),
      }
    })
  }

  synthesize(sources: readonly ReflectiveSource[]) {
    const phrases = sources
      .filter((source) => source.text.trim())
      .map((source) => salientWords(source.text, 4).join(' '))
      .filter(Boolean)
    const text =
      phrases.length >= 2
        ? boundedSentence(
            `I noticed ${phrases[0]} while ${phrases[1]} kept returning`,
            'I noticed a shared pattern across these nearby reflections today',
          )
        : 'I noticed a shared pattern across these nearby reflections today.'
    return {
      text,
      provenance: provenance('auto-growth', sources.map((source) => source.id), ['emergence'], [
        'pattern-versus-noise',
      ]),
    }
  }

  groupTitle(sources: readonly ReflectiveSource[]) {
    const words = sources.flatMap((source) => salientWords(source.text, 2)).slice(0, 4)
    return {
      text: boundedSentence(
        `A pattern around ${words.join(' ')}`,
        'A pattern connecting these reflections this week',
      ),
      provenance: provenance('group-title', sources.map((source) => source.id), ['grouping'], [
        'individual-versus-pattern',
      ], 'this-week'),
    }
  }

  clusteringDemo(index: number) {
    const fixture = FIXTURES[Math.abs(index) % FIXTURES.length]
    return {
      text: fixture.text,
      provenance: provenance(
        'clustering-demo',
        [],
        fixture.themes,
        fixture.tensions,
        fixture.horizon,
      ),
    }
  }
}

export const reflectiveContentProvider = new LocalReflectiveContentProvider()
