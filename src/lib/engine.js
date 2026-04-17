// ============================================
// Grammar Academy — Learning Engine (pure logic)
// ============================================
// No Supabase calls here. Just rules.
// MathAcademy-style: 2 consecutive correct = KP passed.
// Fail twice in a row on same KP = remediate (re-show worked example).
// ============================================

// Mastery rule: how many consecutive correct answers to pass one KP
export const STREAK_TO_PASS_KP = 2

// If the student misses this many in a row on a KP, re-show the worked example
export const STREAK_TO_REMEDIATE = 2

// XP per correct answer
export const XP_PER_CORRECT = 2

// Bonus XP when a knowledge point is completed
export const XP_KP_BONUS = 5

// Bonus XP when an entire topic reaches mastery for the first time
export const XP_TOPIC_BONUS = 15

// XP awarded for a successful review
export const XP_PER_REVIEW = 8

// Spaced repetition schedule in days, indexed by review_count
// After first mastery: review in 1 day
// After 1st review:   review in 3 days, then 7, 14, 30, 60, 120
const SR_INTERVALS_DAYS = [1, 3, 7, 14, 30, 60, 120]

// Given how many times a topic has been successfully reviewed, returns
// the ISO date when the next review should be due.
export function computeNextReviewAt(reviewCount = 0) {
  const idx = Math.min(reviewCount, SR_INTERVALS_DAYS.length - 1)
  const days = SR_INTERVALS_DAYS[idx]
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

// Given mastery_level (0-1), return a human label
export function masteryLabel(m) {
  if (m >= 1) return 'Mastered'
  if (m >= 0.7) return 'Almost there'
  if (m >= 0.3) return 'Learning'
  if (m > 0) return 'Started'
  return 'Not started'
}

// Shuffle (Fisher-Yates)
export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Normalize answer strings for comparison (case-insensitive, trimmed, collapsed spaces)
export function normalizeAnswer(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,!?;:]+$/g, '')
}

// Given a question and the user's answer, returns boolean correct
export function checkAnswer(question, userAnswer) {
  if (!question) return false
  const correct = normalizeAnswer(question.correct_answer)
  // For fill_blank, accept alternative answers separated by "|"
  const alternatives = correct.split('|').map(normalizeAnswer)
  return alternatives.includes(normalizeAnswer(userAnswer))
}
