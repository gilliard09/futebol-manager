const SOUND_PATHS = {
  goal_home: '/audio/torcida-gol-nosso.mp3',
  goal_away: '/audio/torcida-gol-adversario.mp3',
  whistle: '/audio/apito-final.mp3',
  penalty: '/audio/apito-penalti.mp3',
  red_card: '/audio/apito-expulsao.mp3',
  injury: '/audio/apito-lesao.mp3',
} as const

const AMBIENT_PATH = '/audio/torcida-ambiente.mp3'

let ambientAudio: HTMLAudioElement | null = null

export type MatchSound = keyof typeof SOUND_PATHS

export function playMatchSound(sound: MatchSound) {
  if (typeof window === 'undefined') return
  const audio = new Audio(SOUND_PATHS[sound])
  audio.volume = sound === 'goal_home' || sound === 'goal_away' ? 0.75 : 0.55
  void audio.play().catch(() => {
    // O navegador pode bloquear áudio até haver interação do usuário.
  })
}

export function startMatchAmbient() {
  if (typeof window === 'undefined') return
  if (!ambientAudio) {
    ambientAudio = new Audio(AMBIENT_PATH)
    ambientAudio.loop = true
    ambientAudio.volume = 0.18
  }
  if (ambientAudio.paused) {
    void ambientAudio.play().catch(() => {
      // A partida é iniciada por interação do usuário; ainda assim o navegador pode bloquear áudio.
    })
  }
}

export function stopMatchAmbient() {
  if (!ambientAudio) return
  ambientAudio.pause()
  ambientAudio.currentTime = 0
}
