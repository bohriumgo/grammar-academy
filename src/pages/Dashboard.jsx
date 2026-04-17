import { useState, useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../App'
import StudentShell from '../components/StudentShell'
import {
  getOrPickCourse,
  ensureProgressRows,
  getTasks,
  getTodayXp,
} from '../lib/learn_api'
import { supabase } from '../lib/supabase'

const CATEGORY_COLORS = {
  cs: 'var(--purple)',
  vb: 'var(--accent)',
  st: 'var(--warning)',
  pp: '#c1464c',
  aj: '#5c4db1',
  ww: '#6b8ead',
}
const CATEGORY_LABEL = {
  cs: 'Cases',
  vb: 'Verbs',
  st: 'Structure',
  pp: 'Prepositions',
  aj: 'Adjectives',
  ww: 'Word Order',
}

function TaskCard({ topic, kind, onClick }) {
  const color = CATEGORY_COLORS[topic.category] || 'var(--text-2)'
  const label = CATEGORY_LABEL[topic.category] || 'Topic'
  const p = topic.progress || {}
  const isReview = kind === 'review'
  return (
    <button className="task-card" onClick={onClick}>
      <div className="task-card-header">
        <span className="task-card-tag" style={{background: color + '22', color}}>
          {label}
        </span>
        <span className="task-card-kind">
          {isReview ? 'Review' : p.status === 'in_progress' ? 'Continue' : 'New lesson'}
        </span>
      </div>
      <div className="task-card-title">{topic.title}</div>
      {topic.description && <div className="task-card-desc">{topic.description}</div>}
      <div className="task-card-footer">
        <span className="task-card-xp">+{topic.xp_reward || 10} XP</span>
        {p.status === 'in_progress' && (
          <span className="task-card-progress">
            KP {(p.current_kp_index || 0) + 1} · streak {p.correct_streak || 0}
          </span>
        )}
      </div>
    </button>
  )
}

export default function Dashboard() {
  const { user, profile, loading, reloadProfile } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState({ loaded: false, lessons: [], reviews: [], todayXp: 0, noCourse: false })

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      const { courseId } = await getOrPickCourse(user.id)
      if (cancelled) return
      if (!courseId) {
        setState(s => ({ ...s, loaded: true, noCourse: true }))
        return
      }
      await ensureProgressRows(user.id, courseId)
      const [tasks, todayXp] = await Promise.all([
        getTasks(user.id, courseId, 5),
        getTodayXp(user.id),
      ])
      if (cancelled) return
      setState({
        loaded: true,
        lessons: tasks.lessons,
        reviews: tasks.reviews,
        todayXp,
        courseId,
        noCourse: false,
      })
      reloadProfile?.()
    })()
    return () => { cancelled = true }
  }, [user])

  if (loading) return null
  if (!user) return <Navigate to="/login" />

  const { loaded, lessons, reviews, todayXp, noCourse } = state
  const totalXp = profile?.total_xp || 0
  const goal = profile?.daily_xp_goal || 30

  return (
    <StudentShell todayXp={todayXp} totalXp={totalXp} dailyGoal={goal}>
      {!loaded ? (
        <div className="muted">Loading your dashboard…</div>
      ) : noCourse ? (
        <div className="empty-card">
          <h2>No published course yet</h2>
          <p className="muted">Publish a course from the admin panel to get started.</p>
        </div>
      ) : (
        <>
          <div className="dashboard-header">
            <h1>Today's session</h1>
            <p className="muted">
              {todayXp >= goal
                ? `Daily goal smashed — +${todayXp - goal} XP over.`
                : `${goal - todayXp} XP to hit today's goal.`}
            </p>
          </div>

          {reviews.length > 0 && (
            <section className="task-section">
              <div className="task-section-header">
                <h2>Reviews due</h2>
                <span className="muted">Keep mastered topics fresh</span>
              </div>
              <div className="task-grid">
                {reviews.map(t => (
                  <TaskCard
                    key={t.id}
                    topic={t}
                    kind="review"
                    onClick={() => navigate(`/learn/topic/${t.id}?mode=review`)}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="task-section">
            <div className="task-section-header">
              <h2>Next lessons</h2>
              <span className="muted">Unlocked based on what you've mastered</span>
            </div>
            {lessons.length === 0 ? (
              <div className="empty-card">
                <p className="muted">
                  Nothing available right now. Check back later — new lessons unlock as you master prerequisites.
                </p>
              </div>
            ) : (
              <div className="task-grid">
                {lessons.map(t => (
                  <TaskCard
                    key={t.id}
                    topic={t}
                    kind="lesson"
                    onClick={() => navigate(`/learn/topic/${t.id}`)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </StudentShell>
  )
}
