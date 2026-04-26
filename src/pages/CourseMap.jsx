import { useState, useEffect, useMemo, useRef } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../App'
import StudentShell from '../components/StudentShell'
import { supabase } from '../lib/supabase'
import { getOrPickCourse, ensureProgressRows, getTodayXp } from '../lib/learn_api'

// Layout constants
const NODE_W = 168
const NODE_H = 56
const GAP_X = 28
const GAP_Y = 120
const TIER_PAD_TOP = 46

export default function CourseMap() {
  const { user, profile, loading } = useAuth()
  const navigate = useNavigate()
  const [topics, setTopics] = useState([])
  const [prereqs, setPrereqs] = useState([])
  const [todayXp, setTodayXp] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [hovered, setHovered] = useState(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      const { courseId } = await getOrPickCourse(user.id)
      if (!courseId) { setLoaded(true); return }
      await ensureProgressRows(user.id, courseId)

      const [{ data: ts }, { data: prs }, tx] = await Promise.all([
        supabase.from('topics')
          .select('id, title, slug, description, category, cefr_level, tier_name, sort_order')
          .eq('course_id', courseId)
          .eq('is_published', true)
          .order('sort_order'),
        supabase.from('topic_prerequisites').select('topic_id, prerequisite_id'),
        getTodayXp(user.id),
      ])
      if (cancelled) return

      const topicIds = (ts || []).map(t => t.id)
      const { data: progress } = await supabase
        .from('user_progress')
        .select('topic_id, status, mastery_level')
        .eq('user_id', user.id)
        .in('topic_id', topicIds)
      const byId = new Map((progress || []).map(r => [r.topic_id, r]))

      const idSet = new Set(topicIds)
      const relevantPrereqs = (prs || []).filter(p => idSet.has(p.topic_id) && idSet.has(p.prerequisite_id))

      setTopics((ts || []).map(t => ({
        ...t,
        status: byId.get(t.id)?.status || 'locked',
        mastery_level: byId.get(t.id)?.mastery_level || 0,
      })))
      setPrereqs(relevantPrereqs)
      setTodayXp(tx)
      setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [user])

  // Lay out nodes: group by tier_name in sort_order, pack columns within each tier
  const layout = useMemo(() => {
    if (!topics.length) return { nodes: [], width: 0, height: 0 }

    // Group topics by tier, preserving order
    const tierOrder = []
    const tiers = new Map()
    for (const t of topics) {
      const key = t.tier_name || t.cefr_level?.toUpperCase() || 'Other'
      if (!tiers.has(key)) { tierOrder.push(key); tiers.set(key, []) }
      tiers.get(key).push(t)
    }

    // Pick column count so nodes fit in ~900px content width
    const CONTENT_W = 920
    const colsForWidth = Math.max(3, Math.floor((CONTENT_W + GAP_X) / (NODE_W + GAP_X)))

    // Position nodes
    const positions = new Map()
    let y = TIER_PAD_TOP
    const tierBands = []

    for (const key of tierOrder) {
      const list = tiers.get(key)
      const cols = Math.min(colsForWidth, list.length)
      const rows = Math.ceil(list.length / cols)
      const bandH = rows * GAP_Y
      const tierY = y
      const usedW = cols * NODE_W + (cols - 1) * GAP_X
      const leftPad = Math.max(20, (CONTENT_W - usedW) / 2)

      list.forEach((t, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        positions.set(t.id, {
          ...t,
          x: leftPad + col * (NODE_W + GAP_X),
          y: tierY + row * GAP_Y,
        })
      })
      tierBands.push({ key, top: tierY - 28, bottom: tierY + bandH - 20 })
      y = tierY + bandH + 28
    }

    return {
      nodes: Array.from(positions.values()),
      positionMap: positions,
      tierBands,
      width: CONTENT_W + 40,
      height: y + 20,
    }
  }, [topics])

  const edges = useMemo(() => {
    if (!layout.positionMap) return []
    const out = []
    for (const p of prereqs) {
      const from = layout.positionMap.get(p.prerequisite_id)
      const to = layout.positionMap.get(p.topic_id)
      if (!from || !to) continue
      out.push({
        id: `${p.prerequisite_id}-${p.topic_id}`,
        fromId: p.prerequisite_id,
        toId: p.topic_id,
        x1: from.x + NODE_W / 2,
        y1: from.y + NODE_H,
        x2: to.x + NODE_W / 2,
        y2: to.y,
      })
    }
    return out
  }, [prereqs, layout])

  // Hover highlighting: show prereqs + dependents of the hovered node
  const highlight = useMemo(() => {
    if (!hovered) return { nodes: new Set(), edges: new Set() }
    const nodes = new Set([hovered])
    const edgeIds = new Set()
    for (const e of edges) {
      if (e.fromId === hovered || e.toId === hovered) {
        edgeIds.add(e.id)
        nodes.add(e.fromId); nodes.add(e.toId)
      }
    }
    return { nodes, edges: edgeIds }
  }, [hovered, edges])

  if (loading) return null
  if (!user) return <Navigate to="/login" />

  const totalXp = profile?.total_xp || 0
  const goal = profile?.daily_xp_goal || 30
  const mastered = topics.filter(t => t.status === 'mastered').length

  return (
    <StudentShell showBack todayXp={todayXp} totalXp={totalXp} dailyGoal={goal}>
      <div className="map-header">
        <h1>Course map</h1>
        <p className="muted">
          {loaded
            ? topics.length === 0
              ? 'No published topics yet.'
              : `${mastered} of ${topics.length} topics mastered · hover any topic to see its prerequisites`
            : 'Loading…'}
        </p>
      </div>

      {loaded && topics.length > 0 && (
        <>
          <div className="map-legend">
            <span className="map-legend-item"><span className="map-swatch map-s-mastered"/> Mastered</span>
            <span className="map-legend-item"><span className="map-swatch map-s-in_progress"/> In progress</span>
            <span className="map-legend-item"><span className="map-swatch map-s-available"/> Available</span>
            <span className="map-legend-item"><span className="map-swatch map-s-locked"/> Locked</span>
          </div>

          <div className="map-graph-wrap" ref={wrapRef}>
            <svg
              className="map-graph-svg"
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              width="100%"
              preserveAspectRatio="xMidYMin meet"
            >
              <defs>
                <marker
                  id="arrowhead"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M1 1 L9 5 L1 9 z" fill="#b4b2a9" />
                </marker>
                <marker
                  id="arrowhead-hl"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M1 1 L9 5 L1 9 z" fill="#2d6a4f" />
                </marker>
              </defs>

              {/* Tier band labels */}
              {(layout.tierBands || []).map((b, i) => (
                <g key={i}>
                  <text
                    x="16"
                    y={b.top + 12}
                    className="map-tier-label-svg"
                  >{b.key}</text>
                  <line
                    x1="16"
                    x2={layout.width - 16}
                    y1={b.top + 22}
                    y2={b.top + 22}
                    stroke="#e5e4df"
                    strokeDasharray="3 4"
                  />
                </g>
              ))}

              {/* Prerequisite edges */}
              {edges.map(e => {
                const active = highlight.edges.has(e.id)
                return (
                  <path
                    key={e.id}
                    d={buildEdgePath(e.x1, e.y1, e.x2, e.y2)}
                    fill="none"
                    stroke={active ? '#2d6a4f' : '#d1d0c9'}
                    strokeWidth={active ? 1.6 : 1}
                    opacity={hovered && !active ? 0.25 : 1}
                    markerEnd={`url(#${active ? 'arrowhead-hl' : 'arrowhead'})`}
                  />
                )
              })}

              {/* Nodes */}
              {layout.nodes.map(n => {
                const dimmed = hovered && !highlight.nodes.has(n.id)
                const clickable = n.status !== 'locked'
                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x} ${n.y})`}
                    className={`map-node-g map-s-${n.status} ${clickable ? 'clickable' : ''}`}
                    onMouseEnter={() => setHovered(n.id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => clickable && navigate(`/learn/topic/${n.id}`)}
                    opacity={dimmed ? 0.3 : 1}
                  >
                    <rect
                      width={NODE_W}
                      height={NODE_H}
                      rx="8"
                    />
                    <text
                      x={NODE_W / 2}
                      y={NODE_H / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="map-node-label"
                    >
                      {truncate(n.title, 30)}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        </>
      )}
    </StudentShell>
  )
}

// Build an S-curve between two points for a nicer-looking edge
function buildEdgePath(x1, y1, x2, y2) {
  const dy = y2 - y1
  const c1x = x1
  const c1y = y1 + Math.max(30, dy / 2)
  const c2x = x2
  const c2y = y2 - Math.max(30, dy / 2)
  return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`
}

function truncate(s, max) {
  if (!s) return ''
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}
