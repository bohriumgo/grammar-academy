import { useState, useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../App'
import StudentShell from '../components/StudentShell'
import { getOrPickCourse, ensureProgressRows, getCourseMap, getTodayXp } from '../lib/learn_api'

const STATUS_META = {
  mastered: { label: 'Mastered', order: 0 },
  in_progress: { label: 'In progress', order: 1 },
  available: { label: 'Available', order: 2 },
  locked: { label: 'Locked', order: 3 },
}

export default function CourseMap() {
  const { user, profile, loading } = useAuth()
  const navigate = useNavigate()
  const [topics, setTopics] = useState([])
  const [todayXp, setTodayXp] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [courseId, setCourseId] = useState(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      const { courseId } = await getOrPickCourse(user.id)
      if (!courseId) { setLoaded(true); return }
      await ensureProgressRows(user.id, courseId)
      const [map, tx] = await Promise.all([
        getCourseMap(user.id, courseId),
        getTodayXp(user.id),
      ])
      if (cancelled) return
      setCourseId(courseId)
      setTopics(map)
      setTodayXp(tx)
      setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [user])

  if (loading) return null
  if (!user) return <Navigate to="/login" />

  const totalXp = profile?.total_xp || 0
  const goal = profile?.daily_xp_goal || 30

  // Group topics by tier_name (fallback to cefr_level or "Other")
  const tiers = {}
  for (const t of topics) {
    const key = t.tier_name || t.cefr_level?.toUpperCase() || 'Other'
    if (!tiers[key]) tiers[key] = []
    tiers[key].push(t)
  }

  const mastered = topics.filter(t => t.status === 'mastered').length
  const total = topics.length

  return (
    <StudentShell showBack todayXp={todayXp} totalXp={totalXp} dailyGoal={goal}>
      <div className="map-header">
        <h1>Course map</h1>
        <p className="muted">
          {loaded
            ? total === 0
              ? 'No published topics yet.'
              : `${mastered} of ${total} topics mastered`
            : 'Loading…'}
        </p>
      </div>

      {loaded && total > 0 && (
        <>
          <div className="map-legend">
            <span className="map-legend-item"><span className="map-swatch map-s-mastered"/> Mastered</span>
            <span className="map-legend-item"><span className="map-swatch map-s-in_progress"/> In progress</span>
            <span className="map-legend-item"><span className="map-swatch map-s-available"/> Available</span>
            <span className="map-legend-item"><span className="map-swatch map-s-locked"/> Locked</span>
          </div>

          <div className="map-tiers">
            {Object.entries(tiers).map(([tier, list]) => (
              <div key={tier} className="map-tier">
                <div className="map-tier-label">{tier}</div>
                <div className="map-tier-topics">
                  {list.map(t => (
                    <button
                      key={t.id}
                      className={`map-topic map-s-${t.status}`}
                      onClick={() => t.status !== 'locked' && navigate(`/learn/topic/${t.id}`)}
                      disabled={t.status === 'locked'}
                      title={t.description || t.title}
                    >
                      {t.title}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </StudentShell>
  )
}
