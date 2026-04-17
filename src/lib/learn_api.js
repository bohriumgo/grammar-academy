// ============================================
// Grammar Academy — Student-facing data layer
// ============================================
// All Supabase queries the student app needs.
// ============================================

import { supabase } from './supabase'
import {
  computeNextReviewAt,
  STREAK_TO_PASS_KP,
  XP_PER_CORRECT,
  XP_KP_BONUS,
  XP_TOPIC_BONUS,
  XP_PER_REVIEW,
} from './engine'

// ----- Course & profile bootstrap --------------------------------

export async function getOrPickCourse(userId) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  let courseId = profile?.current_course_id
  if (!courseId) {
    const { data: courses } = await supabase
      .from('courses')
      .select('id')
      .eq('is_published', true)
      .order('sort_order')
      .limit(1)
    courseId = courses?.[0]?.id
    if (courseId) {
      await supabase.from('profiles').update({ current_course_id: courseId }).eq('id', userId)
    }
  }
  return { profile, courseId }
}

// Ensure every topic in the course has a user_progress row.
// Topics with no prereqs start as 'available'; the rest as 'locked'.
export async function ensureProgressRows(userId, courseId) {
  if (!courseId) return

  const { data: topics } = await supabase
    .from('topics')
    .select('id')
    .eq('course_id', courseId)
    .eq('is_published', true)
  if (!topics?.length) return

  const { data: existing } = await supabase
    .from('user_progress')
    .select('topic_id')
    .eq('user_id', userId)
    .in('topic_id', topics.map(t => t.id))
  const have = new Set((existing || []).map(r => r.topic_id))

  const missing = topics.filter(t => !have.has(t.id))
  if (!missing.length) return

  const { data: prereqs } = await supabase
    .from('topic_prerequisites')
    .select('topic_id')
    .in('topic_id', missing.map(t => t.id))
  const hasPrereq = new Set((prereqs || []).map(r => r.topic_id))

  const rows = missing.map(t => ({
    user_id: userId,
    topic_id: t.id,
    status: hasPrereq.has(t.id) ? 'locked' : 'available',
    mastery_level: 0,
    current_kp_index: 0,
    correct_streak: 0,
    attempts: 0,
  }))
  if (rows.length) await supabase.from('user_progress').insert(rows)
}

// After a topic becomes 'mastered', flip any locked dependents whose
// prereqs are now all mastered into 'available'.
export async function unlockDependents(userId, courseId) {
  const { data: progress } = await supabase
    .from('user_progress')
    .select('topic_id, status')
    .eq('user_id', userId)
  const byTopic = new Map((progress || []).map(r => [r.topic_id, r.status]))

  const lockedIds = (progress || [])
    .filter(r => r.status === 'locked')
    .map(r => r.topic_id)
  if (!lockedIds.length) return

  const { data: edges } = await supabase
    .from('topic_prerequisites')
    .select('topic_id, prerequisite_id')
    .in('topic_id', lockedIds)

  const toUnlock = []
  for (const id of lockedIds) {
    const reqs = (edges || []).filter(e => e.topic_id === id).map(e => e.prerequisite_id)
    if (reqs.length && reqs.every(r => byTopic.get(r) === 'mastered')) {
      toUnlock.push(id)
    }
  }
  if (toUnlock.length) {
    await supabase
      .from('user_progress')
      .update({ status: 'available' })
      .eq('user_id', userId)
      .in('topic_id', toUnlock)
  }
}

// ----- Task selection (dashboard) --------------------------------

// Returns { lessons, reviews } — lessons are new/in-progress topics
// the student can attempt; reviews are mastered topics due for SR.
export async function getTasks(userId, courseId, limit = 5) {
  // Fetch all user_progress for this course's topics in one go
  const { data: topics } = await supabase
    .from('topics')
    .select('id, title, description, category, cefr_level, tier_name, sort_order, xp_reward')
    .eq('course_id', courseId)
    .eq('is_published', true)
    .order('sort_order')
  if (!topics?.length) return { lessons: [], reviews: [] }

  const topicMap = new Map(topics.map(t => [t.id, t]))
  const { data: progress } = await supabase
    .from('user_progress')
    .select('*')
    .eq('user_id', userId)
    .in('topic_id', topics.map(t => t.id))

  const now = new Date().toISOString()
  const lessons = []
  const reviews = []
  for (const p of progress || []) {
    const t = topicMap.get(p.topic_id)
    if (!t) continue
    const row = { ...t, progress: p }
    if (p.status === 'in_progress' || p.status === 'available') {
      lessons.push(row)
    } else if (p.status === 'mastered' && p.next_review_at && p.next_review_at <= now) {
      reviews.push(row)
    }
  }

  // Prefer in-progress over available so students finish what they started
  lessons.sort((a, b) => {
    const ao = a.progress.status === 'in_progress' ? 0 : 1
    const bo = b.progress.status === 'in_progress' ? 0 : 1
    if (ao !== bo) return ao - bo
    return (a.sort_order || 0) - (b.sort_order || 0)
  })

  return { lessons: lessons.slice(0, limit), reviews: reviews.slice(0, limit) }
}

// Full course map — every topic grouped by tier with its status
export async function getCourseMap(userId, courseId) {
  const { data: topics } = await supabase
    .from('topics')
    .select('id, title, description, category, cefr_level, tier_name, sort_order')
    .eq('course_id', courseId)
    .eq('is_published', true)
    .order('sort_order')

  const { data: progress } = await supabase
    .from('user_progress')
    .select('topic_id, status, mastery_level')
    .eq('user_id', userId)
    .in('topic_id', (topics || []).map(t => t.id))
  const byId = new Map((progress || []).map(r => [r.topic_id, r]))

  return (topics || []).map(t => ({
    ...t,
    status: byId.get(t.id)?.status || 'locked',
    mastery_level: byId.get(t.id)?.mastery_level || 0,
  }))
}

// ----- Lesson content --------------------------------------------

// Everything needed to run one topic's lesson: the ordered KPs and
// all questions grouped by KP id.
export async function getLessonBundle(topicId) {
  const { data: topic } = await supabase
    .from('topics')
    .select('*')
    .eq('id', topicId)
    .single()

  const { data: kps } = await supabase
    .from('knowledge_points')
    .select('*')
    .eq('topic_id', topicId)
    .order('sort_order')

  const kpIds = (kps || []).map(k => k.id)
  const { data: questions } = kpIds.length
    ? await supabase
        .from('questions')
        .select('*')
        .in('knowledge_point_id', kpIds)
        .order('sort_order')
    : { data: [] }

  const questionsByKp = {}
  for (const q of questions || []) {
    if (!questionsByKp[q.knowledge_point_id]) questionsByKp[q.knowledge_point_id] = []
    questionsByKp[q.knowledge_point_id].push(q)
  }

  return { topic, kps: kps || [], questionsByKp }
}

export async function getProgress(userId, topicId) {
  const { data } = await supabase
    .from('user_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('topic_id', topicId)
    .single()
  return data
}

// ----- Recording answers + advancing state -----------------------

export async function recordAttempt({ userId, questionId, answer, isCorrect, timeMs }) {
  await supabase.from('question_attempts').insert({
    user_id: userId,
    question_id: questionId,
    answer_given: answer,
    is_correct: isCorrect,
    time_taken_ms: timeMs,
  })
}

// Save updated user_progress row for a topic after one answered question.
// Returns the fresh row so the UI can react.
export async function updateTopicProgress(userId, topicId, patch) {
  const { data } = await supabase
    .from('user_progress')
    .update({ ...patch, last_practiced_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('topic_id', topicId)
    .select()
    .single()
  return data
}

// Mark topic mastered, schedule first review, award bonus XP, unlock dependents.
export async function markTopicMastered(userId, topicId, courseId, reviewCount = 0) {
  const { data: existing } = await supabase
    .from('user_progress')
    .select('mastered_at')
    .eq('user_id', userId)
    .eq('topic_id', topicId)
    .single()

  const firstTime = !existing?.mastered_at

  await supabase
    .from('user_progress')
    .update({
      status: 'mastered',
      mastery_level: 1,
      correct_streak: 0,
      mastered_at: existing?.mastered_at || new Date().toISOString(),
      next_review_at: computeNextReviewAt(reviewCount),
    })
    .eq('user_id', userId)
    .eq('topic_id', topicId)

  if (firstTime) {
    await awardXp(userId, topicId, XP_TOPIC_BONUS, 'lesson_complete')
  } else {
    await awardXp(userId, topicId, XP_PER_REVIEW, 'review_complete')
  }
  await unlockDependents(userId, courseId)
  return firstTime
}

// ----- XP --------------------------------------------------------

export async function awardXp(userId, topicId, amount, eventType) {
  if (!amount) return
  await supabase.from('xp_log').insert({
    user_id: userId,
    topic_id: topicId,
    xp_earned: amount,
    event_type: eventType,
  })
  // Increment total_xp on profile
  const { data: prof } = await supabase
    .from('profiles')
    .select('total_xp')
    .eq('id', userId)
    .single()
  await supabase
    .from('profiles')
    .update({ total_xp: (prof?.total_xp || 0) + amount })
    .eq('id', userId)
}

// XP earned today for the student (sum of xp_log from local midnight)
export async function getTodayXp(userId) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const { data } = await supabase
    .from('xp_log')
    .select('xp_earned')
    .eq('user_id', userId)
    .gte('created_at', start.toISOString())
  return (data || []).reduce((s, r) => s + (r.xp_earned || 0), 0)
}

export { XP_PER_CORRECT, XP_KP_BONUS, STREAK_TO_PASS_KP }
