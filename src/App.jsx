import { useState, useEffect, createContext, useContext } from 'react'
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Admin from './pages/Admin'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || ''

function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

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
  }, [])

  async function loadProfile(uid) {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).single()
    setProfile(data)
  }

  const isAdmin = user?.email === ADMIN_EMAIL

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',color:'#9c9b95'}}>Loading...</div>

  return (
    <AuthContext.Provider value={{ user, profile, isAdmin, loadProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

function AuthPage({ mode }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { display_name: name } }
        })
        if (error) throw error
        navigate('/admin')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('/admin')
      }
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>{mode === 'signup' ? 'Create account' : 'Welcome back'}</h1>
        <p>{mode === 'signup' ? 'Start your grammar journey' : 'Sign in to continue'}</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="form-group">
              <label>Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required />
            </div>
          )}
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
          </div>
          <button type="submit" className="btn btn-primary" style={{width:'100%',justifyContent:'center'}} disabled={loading}>
            {loading ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Sign in'}
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

function LearnPlaceholder() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" />
  return (
    <div style={{maxWidth:600,margin:'80px auto',textAlign:'center'}}>
      <h1 style={{fontSize:24,marginBottom:12}}>Student app coming soon</h1>
      <p style={{color:'#6b6a65',marginBottom:24}}>The learning experience is being built. For now, use the admin panel to add course content.</p>
      <Link to="/admin" className="btn btn-primary">Go to admin panel</Link>
    </div>
  )
}

function ProtectedAdmin() {
  const { user, isAdmin } = useAuth()
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
        <Route path="/learn" element={<LearnPlaceholder />} />
        <Route path="/admin/*" element={<ProtectedAdmin />} />
      </Routes>
    </AuthProvider>
  )
}
