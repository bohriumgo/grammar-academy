import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../App'
import { supabase } from '../lib/supabase'

export default function StudentShell({ children, todayXp = 0, dailyGoal = 30, totalXp = 0, showBack = false }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const pct = Math.min(100, Math.round(((todayXp || 0) / (dailyGoal || 30)) * 100))

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div className="student-shell">
      <header className="student-header">
        <div className="student-header-inner">
          <Link to="/learn" className="student-logo">Grammar Academy</Link>
          <div className="student-header-stats">
            <div className="student-stat">
              <div className="student-stat-label">Today</div>
              <div className="student-stat-value">{todayXp} / {dailyGoal} XP</div>
              <div className="xp-bar" style={{width: 100, marginTop: 6}}>
                <div className="xp-bar-fill" style={{width: pct + '%'}} />
              </div>
            </div>
            <div className="student-stat">
              <div className="student-stat-label">Total</div>
              <div className="student-stat-value">{totalXp} XP</div>
            </div>
            <Link to="/learn/map" className="btn btn-ghost">Course map</Link>
            <button onClick={signOut} className="btn btn-ghost">Sign out</button>
          </div>
        </div>
      </header>
      <main className="student-main">
        {showBack && (
          <button className="btn btn-ghost" style={{marginBottom: 16}} onClick={() => navigate('/learn')}>
            ← Back to dashboard
          </button>
        )}
        {children}
      </main>
    </div>
  )
}
