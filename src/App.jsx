import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Admin from './pages/Admin'
import Dashboard from './pages/Dashboard'
import Lesson from './pages/Lesson'
import CourseMap from './pages/CourseMap'
import './learn.css'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || ''

function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
  }, [])

  const reloadProfile = useCallback(async () => {
    if (user?.id) await loadProfile(user.id)
  }, [user, loadProfile])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      else setProfile(null)
    })
    return () => subscription.unsubscribe()
  }, [loadProfile])

  const isAdmin = !!(user && ADMIN_EMAIL && user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase())

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, reloadProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

// ─── Auth page (login/signup) ───
function AuthPage({ mode }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function onSubmit(e) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setErr('Check your email to confirm your account, then sign in.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('/learn')
      }
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>{mode === 'signup' ? 'Create your account' : 'Sign in'}</h1>
        <p>{mode === 'signup' ? 'Start learning German grammar, the scientific way.' : 'Welcome back.'}</p>
        {err && <div className="auth-error">{err}</div>}
        <form onSubmit={onSubmit}>
          <label>Email</label>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} />
          <label style={{marginTop:12}}>Password</label>
          <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} />
          <button type="submit" className="btn btn-primary" style={{marginTop:16,width:'100%'}} disabled={busy}>
            {busy ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <p style={{textAlign:'center',marginTop:16,fontSize:13}}>
          {mode === 'signup'
            ? <>Already have an account? <Link to="/login">Sign in</Link></>
            : <>No account yet? <Link to="/signup">Create one</Link></>
          }
        </p>
      </div>
    </div>
  )
}

function Landing() {
  const { user, isAdmin } = useAuth()
  return (
    <div className="landing">
      <div className="hero">
        <h1>Master German Grammar.<br/>The Scientific Way.</h1>
        <p>An adaptive learning platform based on cognitive science. Worked examples, spaced repetition, and mastery-based progression — built from Grammatik aktiv and Hammer's German Grammar.</p>
        <div style={{display:'flex',gap:12,justifyContent:'center'}}>
          {user ? (
            <>
              <Link to="/learn" className="btn btn-primary" style={{padding:'12px 28px',fontSize:16}}>Start learning</Link>
              {isAdmin && <Link to="/admin" className="btn" style={{padding:'12px 28px',fontSize:16}}>Admin panel</Link>}
            </>
          ) : (
            <>
              <Link to="/signup" className="btn btn-primary" style={{padding:'12px 28px',fontSize:16}}>Get started free</Link>
              <Link to="/login" className="btn" style={{padding:'12px 28px',fontSize:16}}>Sign in</Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ProtectedAdmin() {
  const { user, isAdmin, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" />
  if (!isAdmin) return (
    <div style={{maxWidth:500,margin:'80px auto',textAlign:'center'}}>
      <h1 style={{fontSize:22,marginBottom:12}}>Access denied</h1>
      <p style={{color:'#6b6a65'}}>Admin panel is restricted. Set your VITE_ADMIN_EMAIL environment variable to your email.</p>
    </div>
  )
  return <Admin />
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/learn" element={<Dashboard />} />
        <Route path="/learn/map" element={<CourseMap />} />
        <Route path="/learn/topic/:id" element={<Lesson />} />
        <Route path="/admin/*" element={<ProtectedAdmin />} />
      </Routes>
    </AuthProvider>
  )
}
