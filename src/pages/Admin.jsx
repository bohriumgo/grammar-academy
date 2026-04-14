import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'
import { Link, useNavigate } from 'react-router-dom'

// ─── Sidebar ───
function AdminSidebar({ view, setView, course, topic, kp, onLogout }) {
  return (
    <div className="sidebar">
      <div className="sidebar-logo">Grammar Academy</div>
      <nav className="sidebar-nav">
        <button className={`sidebar-link ${view === 'courses' ? 'active' : ''}`} onClick={() => setView('courses')}>
          Courses
        </button>
        {course && (
          <button className={`sidebar-link ${view === 'topics' ? 'active' : ''}`} onClick={() => setView('topics')} style={{paddingLeft:36,fontSize:13}}>
            {course.title}
          </button>
        )}
        {topic && (
          <button className={`sidebar-link ${view === 'kps' ? 'active' : ''}`} onClick={() => setView('kps')} style={{paddingLeft:52,fontSize:12}}>
            {topic.title}
          </button>
        )}
        {kp && (
          <button className={`sidebar-link ${view === 'questions' ? 'active' : ''}`} onClick={() => setView('questions')} style={{paddingLeft:68,fontSize:12}}>
            {kp.title}
          </button>
        )}
        <div style={{borderTop:'1px solid var(--border)',margin:'16px 0'}} />
        <Link to="/" className="sidebar-link">Home</Link>
        <button className="sidebar-link" onClick={onLogout}>Sign out</button>
      </nav>
    </div>
  )
}

// ─── Courses View ───
function CoursesView({ onSelect }) {
  const [courses, setCourses] = useState([])
  const [show, setShow] = useState(false)
  const [form, setForm] = useState({ title: '', slug: '', description: '', cefr_level: 'a1', sort_order: 0 })
  const [editing, setEditing] = useState(null)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('courses').select('*').order('sort_order')
    setCourses(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function save(e) {
    e.preventDefault()
    setMsg('')
    const payload = { ...form, sort_order: Number(form.sort_order) }
    if (editing) {
      const { error } = await supabase.from('courses').update(payload).eq('id', editing)
      if (error) { setMsg(error.message); return }
    } else {
      const { error } = await supabase.from('courses').insert(payload)
      if (error) { setMsg(error.message); return }
    }
    setShow(false); setEditing(null); setForm({ title: '', slug: '', description: '', cefr_level: 'a1', sort_order: 0 })
    load()
  }

  function edit(c) {
    setForm({ title: c.title, slug: c.slug, description: c.description || '', cefr_level: c.cefr_level || 'a1', sort_order: c.sort_order || 0 })
    setEditing(c.id); setShow(true)
  }

  async function togglePublish(c) {
    await supabase.from('courses').update({ is_published: !c.is_published }).eq('id', c.id)
    load()
  }

  async function del(id) {
    if (!confirm('Delete this course and ALL its topics, lessons, and questions?')) return
    await supabase.from('courses').delete().eq('id', id)
    load()
  }

  return (
    <div className="main-content">
      <div className="page-header">
        <h1>Courses</h1>
        <button className="btn btn-primary" onClick={() => { setShow(true); setEditing(null); setForm({ title: '', slug: '', description: '', cefr_level: 'a1', sort_order: 0 }) }}>+ New course</button>
      </div>
      {msg && <div className="alert alert-error">{msg}</div>}
      {show && (
        <div className="card" style={{marginBottom:24}}>
          <form onSubmit={save}>
            <div className="form-row">
              <div className="form-group">
                <label>Title</label>
                <input type="text" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required placeholder="German Grammar A1" />
              </div>
              <div className="form-group">
                <label>Slug (URL-friendly)</label>
                <input type="text" value={form.slug} onChange={e => setForm({...form, slug: e.target.value})} required placeholder="german-a1" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>CEFR Level</label>
                <select value={form.cefr_level} onChange={e => setForm({...form, cefr_level: e.target.value})}>
                  <option value="a1">A1</option><option value="a2">A2</option>
                  <option value="b1">B1</option><option value="b2">B2</option><option value="c1">C1</option>
                </select>
              </div>
              <div className="form-group">
                <label>Sort order</label>
                <input type="number" value={form.sort_order} onChange={e => setForm({...form, sort_order: e.target.value})} />
              </div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Course description..." />
            </div>
            <div className="btn-group">
              <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Create'} course</button>
              <button type="button" className="btn" onClick={() => { setShow(false); setEditing(null) }}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      {courses.length === 0 ? (
        <div className="empty-state"><p>No courses yet. Create your first one.</p></div>
      ) : (
        <table>
          <thead><tr><th>Title</th><th>Level</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {courses.map(c => (
              <tr key={c.id}>
                <td><button onClick={() => onSelect(c)} style={{background:'none',border:'none',cursor:'pointer',fontWeight:600,color:'var(--accent)',fontFamily:'inherit',fontSize:14}}>{c.title}</button></td>
                <td><span className={`badge badge-${c.cefr_level}`}>{c.cefr_level?.toUpperCase()}</span></td>
                <td><span className={`badge ${c.is_published ? 'badge-published' : 'badge-draft'}`}>{c.is_published ? 'Published' : 'Draft'}</span></td>
                <td>
                  <div style={{display:'flex',gap:6}}>
                    <button className="btn btn-sm" onClick={() => onSelect(c)}>Topics</button>
                    <button className="btn btn-sm" onClick={() => edit(c)}>Edit</button>
                    <button className="btn btn-sm" onClick={() => togglePublish(c)}>{c.is_published ? 'Unpublish' : 'Publish'}</button>
                    <button className="btn btn-sm btn-danger" onClick={() => del(c.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Topics View ───
function TopicsView({ course, onSelect }) {
  const [topics, setTopics] = useState([])
  const [allTopics, setAllTopics] = useState([])
  const [show, setShow] = useState(false)
  const [form, setForm] = useState({ title:'', slug:'', description:'', book_reference:'', hammer_reference:'', category:'vb', cefr_level:'a1', tier_name:'', sort_order:0, xp_reward:10 })
  const [prereqs, setPrereqs] = useState([])
  const [editing, setEditing] = useState(null)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('topics').select('*').eq('course_id', course.id).order('sort_order')
    setTopics(data || [])
    const { data: all } = await supabase.from('topics').select('id,title,course_id').order('title')
    setAllTopics(all || [])
  }, [course.id])
  useEffect(() => { load() }, [load])

  async function loadPrereqs(topicId) {
    const { data } = await supabase.from('topic_prerequisites').select('prerequisite_id').eq('topic_id', topicId)
    setPrereqs((data || []).map(d => d.prerequisite_id))
  }

  async function save(e) {
    e.preventDefault(); setMsg('')
    const payload = { ...form, course_id: course.id, sort_order: Number(form.sort_order), xp_reward: Number(form.xp_reward) }
    let topicId = editing
    if (editing) {
      const { error } = await supabase.from('topics').update(payload).eq('id', editing)
      if (error) { setMsg(error.message); return }
    } else {
      const { data, error } = await supabase.from('topics').insert(payload).select().single()
      if (error) { setMsg(error.message); return }
      topicId = data.id
    }
    await supabase.from('topic_prerequisites').delete().eq('topic_id', topicId)
    if (prereqs.length > 0) {
      await supabase.from('topic_prerequisites').insert(prereqs.map(pid => ({ topic_id: topicId, prerequisite_id: pid })))
    }
    setShow(false); setEditing(null); resetForm(); load()
  }

  function resetForm() {
    setForm({ title:'', slug:'', description:'', book_reference:'', hammer_reference:'', category:'vb', cefr_level:course.cefr_level||'a1', tier_name:'', sort_order:0, xp_reward:10 })
    setPrereqs([])
  }

  function edit(t) {
    setForm({ title:t.title, slug:t.slug, description:t.description||'', book_reference:t.book_reference||'', hammer_reference:t.hammer_reference||'', category:t.category||'vb', cefr_level:t.cefr_level||'a1', tier_name:t.tier_name||'', sort_order:t.sort_order||0, xp_reward:t.xp_reward||10 })
    setEditing(t.id); loadPrereqs(t.id); setShow(true)
  }

  async function togglePublish(t) {
    await supabase.from('topics').update({ is_published: !t.is_published }).eq('id', t.id); load()
  }

  async function del(id) {
    if (!confirm('Delete this topic and all its knowledge points and questions?')) return
    await supabase.from('topics').delete().eq('id', id); load()
  }

  function togglePrereq(pid) {
    setPrereqs(prev => prev.includes(pid) ? prev.filter(p => p !== pid) : [...prev, pid])
  }

  const categories = [['vb','Verben'],['cs','Kasus/Artikel'],['st','Satzbau'],['pp','Präpositionen'],['aj','Adjektive'],['ww','Wörter']]

  return (
    <div className="main-content">
      <div className="breadcrumb"><Link to="#" onClick={e=>{e.preventDefault()}}>Courses</Link><span>/</span><strong style={{color:'var(--text)'}}>{course.title}</strong></div>
      <div className="page-header">
        <h2>Topics in {course.title}</h2>
        <button className="btn btn-primary" onClick={() => { setShow(true); setEditing(null); resetForm() }}>+ New topic</button>
      </div>
      {msg && <div className="alert alert-error">{msg}</div>}
      {show && (
        <div className="card" style={{marginBottom:24}}>
          <form onSubmit={save}>
            <div className="form-row">
              <div className="form-group"><label>Title</label><input type="text" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required placeholder="Akkusativ" /></div>
              <div className="form-group"><label>Slug</label><input type="text" value={form.slug} onChange={e => setForm({...form, slug: e.target.value})} required placeholder="akkusativ" /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Book reference</label><input type="text" value={form.book_reference} onChange={e => setForm({...form, book_reference: e.target.value})} placeholder="GA1 K17" /></div>
              <div className="form-group"><label>Hammer reference</label><input type="text" value={form.hammer_reference} onChange={e => setForm({...form, hammer_reference: e.target.value})} placeholder="H 2.2" /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Category</label>
                <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                  {categories.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="form-group"><label>CEFR Level</label>
                <select value={form.cefr_level} onChange={e => setForm({...form, cefr_level: e.target.value})}>
                  <option value="a1">A1</option><option value="a2">A2</option><option value="b1">B1</option><option value="b2">B2</option><option value="c1">C1</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Tier / section name</label><input type="text" value={form.tier_name} onChange={e => setForm({...form, tier_name: e.target.value})} placeholder="Verben 1" /></div>
              <div className="form-group"><label>Sort order</label><input type="number" value={form.sort_order} onChange={e => setForm({...form, sort_order: e.target.value})} /></div>
            </div>
            <div className="form-group"><label>XP reward</label><input type="number" value={form.xp_reward} onChange={e => setForm({...form, xp_reward: e.target.value})} style={{maxWidth:100}} /></div>
            <div className="form-group"><label>Description</label><textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="What this topic covers..." /></div>

            {allTopics.filter(t => t.id !== editing).length > 0 && (
              <div className="form-group">
                <label>Prerequisites (select all that must be mastered first)</label>
                <div style={{maxHeight:200,overflow:'auto',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:8}}>
                  {allTopics.filter(t => t.id !== editing).map(t => (
                    <label key={t.id} style={{display:'flex',alignItems:'center',gap:8,padding:'4px 0',cursor:'pointer',fontSize:13,fontWeight:400,color:'var(--text)'}}>
                      <input type="checkbox" checked={prereqs.includes(t.id)} onChange={() => togglePrereq(t.id)} />
                      {t.title}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="btn-group">
              <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Create'} topic</button>
              <button type="button" className="btn" onClick={() => { setShow(false); setEditing(null) }}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      {topics.length === 0 ? (
        <div className="empty-state"><p>No topics yet. Add your first topic.</p></div>
      ) : (
        <table>
          <thead><tr><th>Order</th><th>Title</th><th>Reference</th><th>Category</th><th>Level</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {topics.map(t => (
              <tr key={t.id}>
                <td style={{color:'var(--text-3)',width:50}}>{t.sort_order}</td>
                <td><button onClick={() => onSelect(t)} style={{background:'none',border:'none',cursor:'pointer',fontWeight:600,color:'var(--accent)',fontFamily:'inherit',fontSize:14}}>{t.title}</button></td>
                <td style={{fontSize:12,color:'var(--text-3)'}}>{t.book_reference}</td>
                <td><span className={`badge badge-${t.category}`}>{t.category}</span></td>
                <td><span className={`badge badge-${t.cefr_level}`}>{t.cefr_level?.toUpperCase()}</span></td>
                <td><span className={`badge ${t.is_published ? 'badge-published' : 'badge-draft'}`}>{t.is_published ? 'Live' : 'Draft'}</span></td>
                <td>
                  <div style={{display:'flex',gap:6}}>
                    <button className="btn btn-sm" onClick={() => onSelect(t)}>KPs</button>
                    <button className="btn btn-sm" onClick={() => edit(t)}>Edit</button>
                    <button className="btn btn-sm" onClick={() => togglePublish(t)}>{t.is_published ? 'Unpublish' : 'Publish'}</button>
                    <button className="btn btn-sm btn-danger" onClick={() => del(t.id)}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Knowledge Points View ───
function KPsView({ course, topic, onSelect }) {
  const [kps, setKPs] = useState([])
  const [show, setShow] = useState(false)
  const [form, setForm] = useState({ title:'', sort_order:0, example_instruction:'', example_problem:'', example_solution:'', example_note:'' })
  const [editing, setEditing] = useState(null)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('knowledge_points').select('*').eq('topic_id', topic.id).order('sort_order')
    setKPs(data || [])
  }, [topic.id])
  useEffect(() => { load() }, [load])

  async function save(e) {
    e.preventDefault(); setMsg('')
    const payload = { ...form, topic_id: topic.id, sort_order: Number(form.sort_order) }
    if (editing) {
      const { error } = await supabase.from('knowledge_points').update(payload).eq('id', editing)
      if (error) { setMsg(error.message); return }
    } else {
      const { error } = await supabase.from('knowledge_points').insert(payload)
      if (error) { setMsg(error.message); return }
    }
    setShow(false); setEditing(null); resetForm(); load()
  }

  function resetForm() { setForm({ title:'', sort_order:kps.length, example_instruction:'', example_problem:'', example_solution:'', example_note:'' }) }

  function edit(k) {
    setForm({ title:k.title, sort_order:k.sort_order||0, example_instruction:k.example_instruction||'', example_problem:k.example_problem||'', example_solution:k.example_solution||'', example_note:k.example_note||'' })
    setEditing(k.id); setShow(true)
  }

  async function del(id) {
    if (!confirm('Delete this knowledge point and all its questions?')) return
    await supabase.from('knowledge_points').delete().eq('id', id); load()
  }

  return (
    <div className="main-content">
      <div className="breadcrumb">
        <Link to="#">Courses</Link><span>/</span>
        <span>{course.title}</span><span>/</span>
        <strong style={{color:'var(--text)'}}>{topic.title}</strong>
      </div>
      <div className="page-header">
        <div>
          <h2>Knowledge points</h2>
          <p style={{fontSize:13,color:'var(--text-3)',marginTop:2}}>{topic.book_reference} — Each KP has a worked example followed by practice questions</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShow(true); setEditing(null); resetForm() }}>+ New KP</button>
      </div>
      {msg && <div className="alert alert-error">{msg}</div>}
      {show && (
        <div className="card" style={{marginBottom:24}}>
          <form onSubmit={save}>
            <div className="form-row">
              <div className="form-group"><label>KP Title</label><input type="text" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required placeholder="e.g., Maskulin: der → den" /></div>
              <div className="form-group"><label>Sort order</label><input type="number" value={form.sort_order} onChange={e => setForm({...form, sort_order: e.target.value})} style={{maxWidth:80}} /></div>
            </div>
            <h3 style={{fontSize:14,fontWeight:600,color:'var(--accent-dark)',margin:'16px 0 8px',paddingTop:12,borderTop:'1px solid var(--border)'}}>Worked example (shown to student before practice)</h3>
            <div className="form-group">
              <label>Instruction / Grammar rule</label>
              <textarea value={form.example_instruction} onChange={e => setForm({...form, example_instruction: e.target.value})} placeholder="Explain the grammar rule clearly and simply. This is what the student reads first." rows={4} />
            </div>
            <div className="form-group">
              <label>Example problem</label>
              <textarea value={form.example_problem} onChange={e => setForm({...form, example_problem: e.target.value})} placeholder="The example sentence or problem to demonstrate the rule." rows={2} />
            </div>
            <div className="form-group">
              <label>Step-by-step solution</label>
              <textarea value={form.example_solution} onChange={e => setForm({...form, example_solution: e.target.value})} placeholder="Walk through the solution step by step." rows={4} />
            </div>
            <div className="form-group">
              <label>Note / tip (optional)</label>
              <textarea value={form.example_note} onChange={e => setForm({...form, example_note: e.target.value})} placeholder="A helpful mnemonic or common mistake to avoid." rows={2} />
            </div>
            <div className="btn-group">
              <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Create'} knowledge point</button>
              <button type="button" className="btn" onClick={() => { setShow(false); setEditing(null) }}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      {kps.length === 0 ? (
        <div className="empty-state"><p>No knowledge points yet. Each KP is one step in the lesson.</p></div>
      ) : (
        <div>
          {kps.map((k, i) => (
            <div key={k.id} className="card" style={{marginBottom:12,cursor:'pointer'}} onClick={() => onSelect(k)}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div>
                  <span style={{fontSize:12,fontWeight:700,color:'var(--accent)',marginRight:8}}>KP {i + 1}</span>
                  <span style={{fontWeight:600}}>{k.title}</span>
                </div>
                <div style={{display:'flex',gap:6}} onClick={e => e.stopPropagation()}>
                  <button className="btn btn-sm" onClick={() => onSelect(k)}>Questions</button>
                  <button className="btn btn-sm" onClick={() => edit(k)}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => del(k.id)}>Del</button>
                </div>
              </div>
              {k.example_instruction && <p style={{fontSize:13,color:'var(--text-2)',marginTop:8,lineHeight:1.5}}>{k.example_instruction.slice(0,150)}{k.example_instruction.length > 150 ? '...' : ''}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Questions View ───
function QuestionsView({ course, topic, kp }) {
  const [questions, setQuestions] = useState([])
  const [show, setShow] = useState(false)
  const [form, setForm] = useState({ question_type:'multiple_choice', question_text:'', options:['','','',''], correct_answer:'', explanation:'', hint:'', sort_order:0, difficulty:1 })
  const [editing, setEditing] = useState(null)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('questions').select('*').eq('knowledge_point_id', kp.id).order('sort_order')
    setQuestions(data || [])
  }, [kp.id])
  useEffect(() => { load() }, [load])

  async function save(e) {
    e.preventDefault(); setMsg('')
    const options = form.question_type === 'multiple_choice' ? form.options.filter(o => o.trim()) : null
    const payload = {
      knowledge_point_id: kp.id,
      question_type: form.question_type,
      question_text: form.question_text,
      options: options ? JSON.stringify(options) : null,
      correct_answer: form.correct_answer,
      explanation: form.explanation,
      hint: form.hint,
      sort_order: Number(form.sort_order),
      difficulty: Number(form.difficulty)
    }
    if (editing) {
      const { error } = await supabase.from('questions').update(payload).eq('id', editing)
      if (error) { setMsg(error.message); return }
    } else {
      const { error } = await supabase.from('questions').insert(payload)
      if (error) { setMsg(error.message); return }
    }
    setShow(false); setEditing(null); resetForm(); load()
  }

  function resetForm() { setForm({ question_type:'multiple_choice', question_text:'', options:['','','',''], correct_answer:'', explanation:'', hint:'', sort_order:questions.length, difficulty:1 }) }

  function edit(q) {
    let opts = ['','','','']
    try { opts = typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || ['','','','']) } catch(e) {}
    while (opts.length < 4) opts.push('')
    setForm({ question_type:q.question_type||'multiple_choice', question_text:q.question_text, options:opts, correct_answer:q.correct_answer, explanation:q.explanation||'', hint:q.hint||'', sort_order:q.sort_order||0, difficulty:q.difficulty||1 })
    setEditing(q.id); setShow(true)
  }

  function setOption(i, val) {
    const opts = [...form.options]; opts[i] = val; setForm({...form, options: opts})
  }

  async function del(id) {
    if (!confirm('Delete this question?')) return
    await supabase.from('questions').delete().eq('id', id); load()
  }

  return (
    <div className="main-content">
      <div className="breadcrumb">
        <Link to="#">Courses</Link><span>/</span>
        <span>{course.title}</span><span>/</span>
        <span>{topic.title}</span><span>/</span>
        <strong style={{color:'var(--text)'}}>{kp.title}</strong>
      </div>
      <div className="page-header">
        <div>
          <h2>Questions for: {kp.title}</h2>
          <p style={{fontSize:13,color:'var(--text-3)',marginTop:2}}>Students must get 2 correct in a row to master this knowledge point</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShow(true); setEditing(null); resetForm() }}>+ New question</button>
      </div>
      {msg && <div className="alert alert-error">{msg}</div>}
      {show && (
        <div className="card" style={{marginBottom:24}}>
          <form onSubmit={save}>
            <div className="form-row">
              <div className="form-group"><label>Question type</label>
                <select value={form.question_type} onChange={e => setForm({...form, question_type: e.target.value})}>
                  <option value="multiple_choice">Multiple choice</option>
                  <option value="fill_blank">Fill in the blank</option>
                </select>
              </div>
              <div className="form-group"><label>Difficulty</label>
                <select value={form.difficulty} onChange={e => setForm({...form, difficulty: e.target.value})}>
                  <option value={1}>Easy</option><option value={2}>Medium</option><option value={3}>Hard</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Question text</label>
              <textarea value={form.question_text} onChange={e => setForm({...form, question_text: e.target.value})} required placeholder='e.g., "Ich sehe ___ Mann." Fill in the correct article.' rows={2} />
              <div className="form-help">For fill-in-the-blank, use ___ to show where the answer goes.</div>
            </div>
            {form.question_type === 'multiple_choice' && (
              <div className="form-group">
                <label>Options (the correct one + 3 wrong ones)</label>
                {form.options.map((o, i) => (
                  <input key={i} type="text" value={o} onChange={e => setOption(i, e.target.value)} placeholder={`Option ${i + 1}`} style={{marginBottom:6}} />
                ))}
              </div>
            )}
            <div className="form-group">
              <label>Correct answer</label>
              <input type="text" value={form.correct_answer} onChange={e => setForm({...form, correct_answer: e.target.value})} required placeholder="den" />
              <div className="form-help">Must exactly match one of the options (for MC) or the expected typed answer (for fill-blank).</div>
            </div>
            <div className="form-group">
              <label>Explanation (shown after answering)</label>
              <textarea value={form.explanation} onChange={e => setForm({...form, explanation: e.target.value})} placeholder="Explain why this is the correct answer..." rows={3} />
            </div>
            <div className="form-group">
              <label>Hint (shown after first wrong attempt, optional)</label>
              <input type="text" value={form.hint} onChange={e => setForm({...form, hint: e.target.value})} placeholder="Think about which case the verb 'sehen' requires..." />
            </div>
            <div className="btn-group">
              <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Create'} question</button>
              <button type="button" className="btn" onClick={() => { setShow(false); setEditing(null) }}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      {questions.length === 0 ? (
        <div className="empty-state"><p>No questions yet. Add at least 3-5 practice questions per knowledge point.</p></div>
      ) : (
        <div>
          {questions.map((q, i) => {
            let opts = []
            try { opts = typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []) } catch(e) {}
            return (
              <div key={q.id} className="card" style={{marginBottom:12}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:6}}>
                      <span style={{fontSize:11,fontWeight:700,color:'var(--accent)'}}>Q{i + 1}</span>
                      <span className={`badge ${q.question_type === 'fill_blank' ? 'badge-a2' : 'badge-b1'}`}>{q.question_type === 'fill_blank' ? 'Fill blank' : 'Multiple choice'}</span>
                    </div>
                    <p style={{fontWeight:500,marginBottom:6}}>{q.question_text}</p>
                    {opts.length > 0 && <p style={{fontSize:13,color:'var(--text-2)'}}>Options: {opts.join(' / ')}</p>}
                    <p style={{fontSize:13,color:'var(--success)',fontWeight:600}}>Answer: {q.correct_answer}</p>
                    {q.explanation && <p style={{fontSize:12,color:'var(--text-3)',marginTop:4}}>{q.explanation.slice(0,100)}...</p>}
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    <button className="btn btn-sm" onClick={() => edit(q)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => del(q.id)}>Del</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main Admin Component ───
export default function Admin() {
  const { user } = useAuth()
  const [view, setView] = useState('courses')
  const [course, setCourse] = useState(null)
  const [topic, setTopic] = useState(null)
  const [kp, setKP] = useState(null)

  function selectCourse(c) { setCourse(c); setTopic(null); setKP(null); setView('topics') }
  function selectTopic(t) { setTopic(t); setKP(null); setView('kps') }
  function selectKP(k) { setKP(k); setView('questions') }

  function handleSetView(v) {
    setView(v)
    if (v === 'courses') { setCourse(null); setTopic(null); setKP(null) }
    if (v === 'topics') { setTopic(null); setKP(null) }
    if (v === 'kps') { setKP(null) }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <div className="app-shell">
      <AdminSidebar view={view} setView={handleSetView} course={course} topic={topic} kp={kp} onLogout={handleLogout} />
      {view === 'courses' && <CoursesView onSelect={selectCourse} />}
      {view === 'topics' && course && <TopicsView course={course} onSelect={selectTopic} />}
      {view === 'kps' && course && topic && <KPsView course={course} topic={topic} onSelect={selectKP} />}
      {view === 'questions' && course && topic && kp && <QuestionsView course={course} topic={topic} kp={kp} />}
    </div>
  )
}
