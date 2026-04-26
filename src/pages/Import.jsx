import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'

// ================================================================
// Bulk-import tool for Grammar Academy content
// ----------------------------------------------------------------
// Accepts a JSON blob describing ONE topic and its full lesson
// content, resolves the topic by slug within a chosen course,
// then inserts or replaces all knowledge points and questions.
//
// Input JSON schema (example):
// {
//   "course_slug": "german-a1-b1",
//   "topic_slug": "sein-haben-present",
//   "mode": "replace",          // "replace" (default) or "append"
//   "knowledge_points": [
//     {
//       "title": "The verb sein",
//       "example_instruction": "...",
//       "example_problem": "...",
//       "example_solution": "...",
//       "example_note": "...",   // optional
//       "questions": [
//         {
//           "question_type": "multiple_choice",
//           "question_text": "Ich ___ Student.",
//           "options": ["bin","bist","ist","sind"],
//           "correct_answer": "bin",
//           "explanation": "...",
//           "hint": "...",        // optional
//           "difficulty": 1
//         },
//         { "question_type": "fill_blank", "question_text": "...",
//           "correct_answer": "bin|Bin", "explanation": "..." }
//       ]
//     }
//   ]
// }
// ================================================================

const SAMPLE = `{
  "course_slug": "german-a1-b1",
  "topic_slug": "sein-haben-present",
  "mode": "replace",
  "knowledge_points": [
    {
      "title": "Conjugating sein",
      "example_instruction": "Sein (to be) is irregular. Memorize its forms — they appear in every conversation.",
      "example_problem": "ich bin, du bist, er/sie/es ist, wir sind, ihr seid, sie/Sie sind",
      "example_solution": "Notice the stem changes completely. Unlike regular verbs, you cannot predict sein from its infinitive.",
      "example_note": "sein is the most frequent verb in German.",
      "questions": [
        {
          "question_type": "multiple_choice",
          "question_text": "Ich ___ Student.",
          "options": ["bin", "bist", "ist", "sind"],
          "correct_answer": "bin",
          "explanation": "First person singular of sein is bin.",
          "difficulty": 1
        },
        {
          "question_type": "multiple_choice",
          "question_text": "Du ___ müde.",
          "options": ["bin", "bist", "ist", "sind"],
          "correct_answer": "bist",
          "explanation": "Du takes bist.",
          "difficulty": 1
        }
      ]
    }
  ]
}`

export default function Import() {
  const { user, isAdmin, loading } = useAuth()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState([])
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) navigate('/admin')
  }, [user, isAdmin, loading, navigate])

  function addLog(line, kind = 'info') { setLog(l => [...l, { line, kind, at: Date.now() }]) }

  async function runImport() {
    setErr(''); setLog([]); setBusy(true)
    try {
      let payload
      try { payload = JSON.parse(text) }
      catch (e) { throw new Error('Invalid JSON: ' + e.message) }

      if (!Array.isArray(payload)) payload = [payload]

      for (let i = 0; i < payload.length; i++) {
        const blob = payload[i]
        addLog(`[${i + 1}/${payload.length}] Importing topic "${blob.topic_slug}" in course "${blob.course_slug}"…`)
        await importOne(blob, addLog)
      }
      addLog('All done ✓', 'success')
    } catch (e) {
      setErr(e.message || String(e))
      addLog('Error: ' + (e.message || e), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function importOne(blob, log) {
    if (!blob.course_slug) throw new Error('Missing course_slug')
    if (!blob.topic_slug)  throw new Error('Missing topic_slug')
    if (!Array.isArray(blob.knowledge_points)) throw new Error('knowledge_points must be an array')

    // Look up course
    const { data: course, error: e1 } = await supabase
      .from('courses').select('id').eq('slug', blob.course_slug).single()
    if (e1 || !course) throw new Error(`Course not found: ${blob.course_slug}`)

    // Look up topic within that course
    const { data: topic, error: e2 } = await supabase
      .from('topics').select('id, title')
      .eq('course_id', course.id).eq('slug', blob.topic_slug).single()
    if (e2 || !topic) throw new Error(`Topic not found in course: ${blob.topic_slug}`)

    const mode = blob.mode || 'replace'

    if (mode === 'replace') {
      // Delete existing KPs (cascades to questions via FK)
      const { data: oldKps } = await supabase
        .from('knowledge_points').select('id').eq('topic_id', topic.id)
      const oldIds = (oldKps || []).map(k => k.id)
      if (oldIds.length) {
        await supabase.from('questions').delete().in('knowledge_point_id', oldIds)
        await supabase.from('knowledge_points').delete().in('id', oldIds)
      }
      log(`  · cleared ${oldIds.length} existing knowledge point(s)`)
    }

    // Insert KPs in order, then each KP's questions
    let kpIndex = 0
    let totalQ = 0
    for (const kp of blob.knowledge_points) {
      if (!kp.title) throw new Error(`KP ${kpIndex + 1}: missing title`)

      const { data: newKp, error: e3 } = await supabase
        .from('knowledge_points')
        .insert({
          topic_id: topic.id,
          title: kp.title,
          sort_order: kpIndex * 10,
          example_instruction: kp.example_instruction || null,
          example_problem: kp.example_problem || null,
          example_solution: kp.example_solution || null,
          example_note: kp.example_note || null,
        })
        .select()
        .single()
      if (e3) throw new Error(`KP "${kp.title}": ${e3.message}`)

      const questions = Array.isArray(kp.questions) ? kp.questions : []
      let qIndex = 0
      for (const q of questions) {
        if (!q.question_text) throw new Error(`KP "${kp.title}" question ${qIndex + 1}: missing question_text`)
        if (!q.correct_answer) throw new Error(`KP "${kp.title}" question ${qIndex + 1}: missing correct_answer`)
        const { error: e4 } = await supabase.from('questions').insert({
          knowledge_point_id: newKp.id,
          question_type: q.question_type || 'multiple_choice',
          question_text: q.question_text,
          options: q.options || null,
          correct_answer: String(q.correct_answer),
          explanation: q.explanation || null,
          hint: q.hint || null,
          sort_order: qIndex * 10,
          difficulty: q.difficulty || 1,
        })
        if (e4) throw new Error(`Question "${q.question_text?.slice(0, 40)}…": ${e4.message}`)
        qIndex++
      }
      totalQ += qIndex
      log(`  · KP ${kpIndex + 1}: "${kp.title}" — ${qIndex} question(s)`)
      kpIndex++
    }
    log(`  ✓ Topic "${topic.title}" imported: ${kpIndex} KP(s), ${totalQ} question(s)`, 'success')
  }

  function loadSample() { setText(SAMPLE) }

  if (loading || !user || !isAdmin) return null

  return (
    <div className="import-page">
      <div className="import-header">
        <div>
          <h1>Bulk content import</h1>
          <p className="muted">Paste a JSON blob describing a full topic's lesson content. Everything writes to the database in one go.</p>
        </div>
        <div style={{display:'flex',gap:8}}>
          <Link to="/admin" className="btn">← Admin panel</Link>
          <button className="btn" onClick={loadSample}>Load sample</button>
        </div>
      </div>

      <div className="import-grid">
        <div>
          <label style={{display:'block',marginBottom:6}}>JSON payload</label>
          <textarea
            className="import-textarea"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Paste your topic JSON here, or click 'Load sample' above"
            spellCheck={false}
          />
          <div style={{display:'flex',gap:8,marginTop:12,alignItems:'center'}}>
            <button className="btn btn-primary" onClick={runImport} disabled={busy || !text.trim()}>
              {busy ? 'Importing…' : 'Import'}
            </button>
            <span className="muted" style={{fontSize:12}}>
              {text ? `${text.length.toLocaleString()} characters` : ''}
            </span>
          </div>
          {err && <div className="import-error">{err}</div>}
        </div>

        <div>
          <label style={{display:'block',marginBottom:6}}>Log</label>
          <div className="import-log">
            {log.length === 0
              ? <div className="muted" style={{fontSize:13}}>Nothing yet. Paste JSON and click Import.</div>
              : log.map((l, i) => (
                  <div key={i} className={`import-log-line import-log-${l.kind}`}>{l.line}</div>
                ))
            }
          </div>
          <div className="import-help">
            <h3>Schema</h3>
            <p>Top-level JSON is either one topic object or an array of them. Each topic object must have:</p>
            <ul>
              <li><code>course_slug</code> — matches the course in the database (e.g., <code>german-a1-b1</code>)</li>
              <li><code>topic_slug</code> — matches an existing topic within that course</li>
              <li><code>mode</code> — <code>"replace"</code> (default) wipes existing KPs &amp; questions before inserting; <code>"append"</code> adds to what's there</li>
              <li><code>knowledge_points</code> — ordered array. Each KP needs a <code>title</code> and optionally <code>example_instruction</code>, <code>example_problem</code>, <code>example_solution</code>, <code>example_note</code>, plus a <code>questions</code> array.</li>
              <li>Each question needs <code>question_text</code> and <code>correct_answer</code>. For multiple choice, include <code>options</code>. For fill-in-the-blank, separate alternative correct answers with <code>|</code> in <code>correct_answer</code>.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
