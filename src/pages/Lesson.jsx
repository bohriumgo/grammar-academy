import { useState, useEffect, useMemo, useRef } from 'react'
import { Navigate, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../App'
import StudentShell from '../components/StudentShell'
import {
  getLessonBundle,
  getProgress,
  ensureProgressRows,
  getOrPickCourse,
  recordAttempt,
  updateTopicProgress,
  markTopicMastered,
  awardXp,
  getTodayXp,
  XP_PER_CORRECT,
  XP_KP_BONUS,
  STREAK_TO_PASS_KP,
} from '../lib/learn_api'
import { shuffle, checkAnswer, STREAK_TO_REMEDIATE } from '../lib/engine'

// ============================================================
// A single practice question card
// ============================================================
function QuestionCard({ question, onAnswer, disabled }) {
  const [choice, setChoice] = useState('')
  const [typed, setTyped] = useState('')
  const startedAt = useRef(Date.now())

  useEffect(() => {
    setChoice('')
    setTyped('')
    startedAt.current = Date.now()
  }, [question.id])

  const type = question.question_type || 'multiple_choice'
  const options = useMemo(() => {
    if (type === 'multiple_choice' && Array.isArray(question.options)) return question.options
    return []
  }, [question])

  function submit(answer) {
    if (disabled || !answer) return
    const timeMs = Date.now() - startedAt.current
    const isCorrect = checkAnswer(question, answer)
    onAnswer({ answer, isCorrect, timeMs })
  }

  return (
    <div className="question-card">
      <div className="question-prompt">{question.question_text}</div>

      {type === 'multiple_choice' && options.length > 0 && (
        <div className="question-options">
          {options.map((opt, i) => (
            <button
              key={i}
              className={`option-btn ${choice === opt ? 'selected' : ''}`}
              onClick={() => { setChoice(opt); submit(opt) }}
              disabled={disabled}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {(type === 'fill_blank' || type === 'select_word' || options.length === 0) && (
        <form
          onSubmit={(e) => { e.preventDefault(); submit(typed) }}
          className="question-input-form"
        >
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type your answer"
            autoFocus
            disabled={disabled}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={disabled || !typed.trim()}
          >
            Check
          </button>
        </form>
      )}
    </div>
  )
}

// ============================================================
// Worked example shown before practice for each new KP
// ============================================================
function WorkedExample({ kp, index, total, onContinue }) {
  return (
    <div className="worked-example">
      <div className="kp-progress">Knowledge point {index + 1} of {total}</div>
      <h2 className="kp-title">{kp.title}</h2>

      {kp.example_instruction && (
        <div className="worked-section">
          <div className="worked-section-label">Rule</div>
          <div className="worked-section-body">{kp.example_instruction}</div>
        </div>
      )}

      {kp.example_problem && (
        <div className="worked-section">
          <div className="worked-section-label">Example</div>
          <div className="worked-section-body worked-example-text">{kp.example_problem}</div>
        </div>
      )}

      {kp.example_solution && (
        <div className="worked-section">
          <div className="worked-section-label">Solution</div>
          <div className="worked-section-body">{kp.example_solution}</div>
        </div>
      )}

      {kp.example_note && (
        <div className="worked-note">💡 {kp.example_note}</div>
      )}

      <button className="btn btn-primary btn-large" onClick={onContinue}>
        Start practice
      </button>
    </div>
  )
}

// ============================================================
// Main lesson orchestrator
// ============================================================
export default function Lesson() {
  const { user, profile, loading: authLoading, reloadProfile } = useAuth()
  const { id: topicId } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const isReview = params.get('mode') === 'review'

  // Content & state
  const [bundle, setBundle] = useState(null)      // {topic, kps, questionsByKp}
  const [progress, setProgress] = useState(null)  // user_progress row
  const [courseId, setCourseId] = useState(null)
  const [kpIndex, setKpIndex] = useState(0)
  const [phase, setPhase] = useState('loading')   // loading | worked | practice | feedback | done
  const [question, setQuestion] = useState(null)
  const [queue, setQueue] = useState([])
  const [lastResult, setLastResult] = useState(null)
  const [kpCorrectStreak, setKpCorrectStreak] = useState(0)
  const [kpWrongStreak, setKpWrongStreak] = useState(0)
  const [completedFirstTime, setCompletedFirstTime] = useState(false)
  const [todayXp, setTodayXp] = useState(0)

  // ----- Load lesson -----
  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      const { courseId } = await getOrPickCourse(user.id)
      if (courseId) await ensureProgressRows(user.id, courseId)
      const [b, p, tx] = await Promise.all([
        getLessonBundle(topicId),
        getProgress(user.id, topicId),
        getTodayXp(user.id),
      ])
      if (cancelled) return
      setBundle(b)
      setProgress(p)
      setCourseId(courseId)
      setTodayXp(tx)

      const startIdx = isReview ? 0 : (p?.current_kp_index || 0)
      setKpIndex(startIdx)
      setKpCorrectStreak(0)
      setKpWrongStreak(0)

      if (!b.kps?.length) {
        setPhase('empty')
      } else {
        // On review, skip straight to practice; on new lessons show worked example
        setPhase(isReview ? 'practice' : 'worked')
        if (isReview) loadQuestionsForKp(b, startIdx)
      }
    })()
    return () => { cancelled = true }
  }, [user, topicId, isReview])

  function loadQuestionsForKp(b, index) {
    const kp = b.kps[index]
    const qs = b.questionsByKp[kp.id] || []
    const shuffled = shuffle(qs)
    setQueue(shuffled.slice(1))
    setQuestion(shuffled[0] || null)
    setLastResult(null)
  }

  function startPractice() {
    loadQuestionsForKp(bundle, kpIndex)
    setPhase('practice')
  }

  // ----- Handle answer -----
  async function handleAnswer({ answer, isCorrect, timeMs }) {
    if (!question) return
    setPhase('feedback')
    setLastResult({ answer, isCorrect, question })

    // Log attempt
    recordAttempt({
      userId: user.id,
      questionId: question.id,
      answer,
      isCorrect,
      timeMs,
    }).catch(() => {})

    const kp = bundle.kps[kpIndex]
    let newCorrectStreak = kpCorrectStreak
    let newWrongStreak = kpWrongStreak

    if (isCorrect) {
      newCorrectStreak = kpCorrectStreak + 1
      newWrongStreak = 0
      setKpCorrectStreak(newCorrectStreak)
      setKpWrongStreak(0)
      await awardXp(user.id, topicId, XP_PER_CORRECT, isReview ? 'review_complete' : 'lesson_complete')
      setTodayXp(x => x + XP_PER_CORRECT)
    } else {
      newCorrectStreak = 0
      newWrongStreak = kpWrongStreak + 1
      setKpCorrectStreak(0)
      setKpWrongStreak(newWrongStreak)
    }

    // Update per-topic progress row
    const totalKps = bundle.kps.length
    const approxMastery = Math.min(1, (kpIndex + (newCorrectStreak / STREAK_TO_PASS_KP)) / totalKps)
    await updateTopicProgress(user.id, topicId, {
      status: 'in_progress',
      current_kp_index: kpIndex,
      correct_streak: newCorrectStreak,
      mastery_level: approxMastery,
      attempts: (progress?.attempts || 0) + 1,
    })

    // Check if KP is passed
    if (newCorrectStreak >= STREAK_TO_PASS_KP) {
      // Passed this KP — bonus XP
      await awardXp(user.id, topicId, XP_KP_BONUS, 'lesson_complete')
      setTodayXp(x => x + XP_KP_BONUS)
    }
  }

  async function advance() {
    if (!lastResult) return

    // If KP passed, move to next KP (or finish topic)
    if (kpCorrectStreak >= STREAK_TO_PASS_KP) {
      const nextIdx = kpIndex + 1
      if (nextIdx >= bundle.kps.length) {
        // Topic complete
        const firstTime = await markTopicMastered(
          user.id,
          topicId,
          courseId,
          (progress?.mastery_level >= 1 ? 1 : 0)  // simple: 0 first time, 1 for any subsequent review
        )
        setCompletedFirstTime(firstTime)
        setPhase('done')
        reloadProfile?.()
        return
      }
      setKpIndex(nextIdx)
      setKpCorrectStreak(0)
      setKpWrongStreak(0)
      await updateTopicProgress(user.id, topicId, {
        current_kp_index: nextIdx,
        correct_streak: 0,
      })
      setPhase('worked')
      return
    }

    // If missed twice on this KP, remediate: re-show worked example
    if (kpWrongStreak >= STREAK_TO_REMEDIATE) {
      setKpWrongStreak(0)
      setPhase('worked')
      return
    }

    // Otherwise next question in queue (or cycle)
    let next = queue[0]
    let newQueue = queue.slice(1)
    if (!next) {
      const kp = bundle.kps[kpIndex]
      const reshuffled = shuffle(bundle.questionsByKp[kp.id] || [])
      next = reshuffled[0]
      newQueue = reshuffled.slice(1)
    }
    setQuestion(next)
    setQueue(newQueue)
    setLastResult(null)
    setPhase('practice')
  }

  // ----- Render -----
  if (authLoading) return null
  if (!user) return <Navigate to="/login" />

  const totalXp = profile?.total_xp || 0
  const goal = profile?.daily_xp_goal || 30

  if (phase === 'loading' || !bundle) {
    return (
      <StudentShell showBack todayXp={todayXp} totalXp={totalXp} dailyGoal={goal}>
        <div className="muted">Loading lesson…</div>
      </StudentShell>
    )
  }

  if (phase === 'empty' || !bundle.kps.length) {
    return (
      <StudentShell showBack todayXp={todayXp} totalXp={totalXp} dailyGoal={goal}>
        <div className="empty-card">
          <h2>This topic has no lesson content yet</h2>
          <p className="muted">The author needs to add knowledge points and questions before it can be practiced.</p>
          <button className="btn btn-primary" onClick={() => navigate('/learn')}>Back to dashboard</button>
        </div>
      </StudentShell>
    )
  }

  const kp = bundle.kps[kpIndex]
  const kpQuestionCount = (bundle.questionsByKp[kp.id] || []).length

  return (
    <StudentShell showBack todayXp={todayXp} totalXp={totalXp} dailyGoal={goal}>
      <div className="lesson-topbar">
        <h1 className="lesson-topic-title">{bundle.topic?.title}</h1>
        <div className="lesson-topbar-meta">
          {bundle.kps.map((_, i) => (
            <span
              key={i}
              className={`kp-dot ${i < kpIndex ? 'done' : i === kpIndex ? 'current' : 'future'}`}
              title={`KP ${i + 1}`}
            />
          ))}
        </div>
      </div>

      {phase === 'worked' && (
        <WorkedExample kp={kp} index={kpIndex} total={bundle.kps.length} onContinue={startPractice} />
      )}

      {(phase === 'practice' || phase === 'feedback') && (
        <div className="practice-area">
          <div className="kp-progress">
            {kp.title} · streak {kpCorrectStreak}/{STREAK_TO_PASS_KP}
          </div>

          {question ? (
            <QuestionCard
              question={question}
              onAnswer={handleAnswer}
              disabled={phase === 'feedback'}
            />
          ) : (
            <div className="empty-card">
              <p className="muted">No questions authored for this knowledge point yet.</p>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const nextIdx = kpIndex + 1
                  if (nextIdx >= bundle.kps.length) navigate('/learn')
                  else { setKpIndex(nextIdx); setPhase('worked') }
                }}
              >
                Skip to next knowledge point
              </button>
            </div>
          )}

          {phase === 'feedback' && lastResult && (
            <div className={`feedback-box ${lastResult.isCorrect ? 'feedback-correct' : 'feedback-incorrect'}`}>
              <div className="feedback-headline">
                {lastResult.isCorrect ? '✓ Correct' : `✗ Not quite — answer: ${lastResult.question.correct_answer}`}
              </div>
              {lastResult.question.explanation && (
                <div className="feedback-explanation">{lastResult.question.explanation}</div>
              )}
              {!lastResult.isCorrect && lastResult.question.hint && (
                <div className="feedback-hint">Hint: {lastResult.question.hint}</div>
              )}
              <button className="btn btn-primary" onClick={advance} style={{marginTop: 12}}>
                {kpCorrectStreak >= STREAK_TO_PASS_KP
                  ? (kpIndex + 1 >= bundle.kps.length ? 'Finish topic' : 'Next knowledge point')
                  : kpWrongStreak >= STREAK_TO_REMEDIATE
                    ? 'Review the example'
                    : 'Next question'}
              </button>
            </div>
          )}
        </div>
      )}

      {phase === 'done' && (
        <div className="celebration">
          <div className="celebration-emoji">🎉</div>
          <h1>{isReview ? 'Review complete' : completedFirstTime ? 'Topic mastered!' : 'Topic re-mastered'}</h1>
          <p className="muted">
            {isReview
              ? 'Nice — this topic stays in your long-term memory. Next review is scheduled.'
              : completedFirstTime
                ? "You've unlocked any topics that had this as a prerequisite."
                : 'Your spaced repetition interval has been extended.'}
          </p>
          <div style={{display:'flex',gap:12,justifyContent:'center',marginTop:24}}>
            <button className="btn btn-primary btn-large" onClick={() => navigate('/learn')}>
              Back to dashboard
            </button>
            <button className="btn btn-large" onClick={() => navigate('/learn/map')}>
              View course map
            </button>
          </div>
        </div>
      )}
    </StudentShell>
  )
}
