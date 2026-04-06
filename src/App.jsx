import { useState, useEffect, useMemo } from 'react'
import { db, auth } from './firebase'
import {
  collection, addDoc, deleteDoc, doc, onSnapshot,
  query, orderBy, serverTimestamp, setDoc, getDocs
} from 'firebase/firestore'
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from 'firebase/auth'

const DEFAULT_SETTINGS = {
  appTitle: '店鋪收支管理',
  appSubtitle: 'Firebase Cloud Sync ・ 即時同步',
  password: '0204',
  stores: ['台中店', '台北店', '高雄店', '台南店'],
  categories: [
    { id: 'revenue', name: '營業額', type: 'revenue', icon: '💰', section: 'Income' },
    { id: 'ingredient', name: '食材支出', type: 'expense', icon: '🥬', section: 'Expenses' },
    { id: 'electric', name: '電費支出', type: 'expense', icon: '⚡', section: 'Expenses' },
    { id: 'hardware', name: '五金支出', type: 'expense', icon: '🔧', section: 'Expenses' },
    { id: 'foodwaste', name: '廚餘支出', type: 'expense', icon: '🍂', section: 'Expenses' },
    { id: 'trash', name: '垃圾支出', type: 'expense', icon: '🗑️', section: 'Expenses' },
    { id: 'salary', name: '薪水支出', type: 'expense', icon: '👥', section: 'Expenses' },
    { id: 'ads', name: '廣告支出', type: 'expense', icon: '📢', section: 'Expenses' },
  ],
  vendors: {}
}

const PERIODS = [
  { id: 'day', name: '日' },
  { id: 'week', name: '週' },
  { id: 'month', name: '月' },
  { id: 'quarter', name: '季' },
  { id: 'year', name: '年' },
]

const fmt = (n) => 'NT$ ' + Number(n).toLocaleString()

const TrendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" />
    <rect x="6" y="13" width="2.5" height="5" fill="currentColor" />
    <rect x="11" y="10" width="2.5" height="8" fill="currentColor" />
    <rect x="16" y="6" width="2.5" height="12" fill="currentColor" />
    <path d="M6 9 L11 6 L16 3 L20 1" />
    <path d="M16 1 L20 1 L20 5" />
  </svg>
)

function inPeriod(dateStr, period) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  if (isNaN(d)) return false
  if (period === 'day') return d.toDateString() === now.toDateString()
  if (period === 'week') {
    const start = new Date(now); start.setDate(now.getDate() - now.getDay())
    start.setHours(0,0,0,0)
    return d >= start
  }
  if (period === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  if (period === 'quarter') {
    return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth()/3) === Math.floor(now.getMonth()/3)
  }
  if (period === 'year') return d.getFullYear() === now.getFullYear()
  return true
}

export default function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [store, setStore] = useState('')
  const [currentTab, setCurrentTab] = useState('summary')
  const [data, setData] = useState({})
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setAuthChecked(true)
      if (!u) { setStore(''); setData({}) }
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!user) { setSettingsLoaded(true); return }
    const unsub = onSnapshot(doc(db, 'config', 'settings'), (snap) => {
      if (snap.exists()) setSettings({ ...DEFAULT_SETTINGS, ...snap.data() })
      setSettingsLoaded(true)
    }, () => setSettingsLoaded(true))
    return () => unsub()
  }, [user])

  useEffect(() => {
    if (!store || !user) return
    const unsubs = settings.categories.map(cat => {
      const colRef = collection(db, 'stores', store, cat.id)
      const q = query(colRef, orderBy('date', 'desc'))
      return onSnapshot(q, (snap) => {
        setData(prev => ({
          ...prev,
          [cat.id]: snap.docs.map(d => ({ id: d.id, ...d.data() }))
        }))
      }, (err) => console.error(err))
    })
    return () => unsubs.forEach(u => u())
  }, [store, user, settings.categories])

  useEffect(() => {
    if (user && settingsLoaded && !store && settings.stores.length > 0) {
      setStore(settings.stores[0])
      setCurrentTab('summary')
    }
  }, [user, settingsLoaded, store, settings.stores])

  const sumCat = (id) => (data[id] || []).reduce((s, i) => s + Number(i.amount || 0), 0)

  const handleLogout = async () => {
    try { await signOut(auth) } catch (e) {}
    setStore('')
    setData({})
  }

  const saveSettings = async (newSettings) => {
    try {
      await setDoc(doc(db, 'config', 'settings'), newSettings)
      setShowSettings(false)
    } catch (e) { alert('儲存失敗：' + e.message) }
  }

  if (!authChecked) {
    return <div className="login-wrap"><div style={{color:'#666'}}>載入中...</div></div>
  }

  if (!user) {
    return <Login settings={settings} />
  }

  if (!settingsLoaded || !store) {
    return <div className="login-wrap"><div style={{color:'#666'}}>載入中...</div></div>
  }

  return (
    <div className="app">
      <Rail currentTab={currentTab} onTabChange={setCurrentTab} onOpenSettings={() => setShowSettings(true)} />
      <Sidebar
        settings={settings}
        store={store}
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        onStoreChange={setStore}
        onLogout={handleLogout}
      />
      <Content
        settings={settings}
        store={store}
        currentTab={currentTab}
        data={data}
        sumCat={sumCat}
      />
      {showSettings && <SettingsModal settings={settings} onSave={saveSettings} onClose={() => setShowSettings(false)} />}
    </div>
  )
}

/* ---------- LOGIN ---------- */
function Login({ settings }) {
  const [email, setEmail] = useState('')
  const [pwd, setPwd] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!email || !pwd) { setErr('請輸入帳號和密碼'); return }
    setLoading(true)
    setErr('')
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pwd)
    } catch (e) {
      if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found') {
        setErr('帳號或密碼錯誤')
      } else if (e.code === 'auth/invalid-email') {
        setErr('Email 格式錯誤')
      } else if (e.code === 'auth/too-many-requests') {
        setErr('登入嘗試過多，請稍後再試')
      } else {
        setErr('登入失敗：' + e.message)
      }
    }
    setLoading(false)
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="logo">🏪</div>
        <h1>{settings.appTitle}</h1>
        <div className="subtitle">{settings.appSubtitle}</div>
        <label>帳號 Email</label>
        <input type="email" value={email} placeholder="example@shop.com"
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()} />
        <label>密碼</label>
        <input type="password" value={pwd} placeholder="請輸入密碼"
          onChange={e => setPwd(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()} />
        <button onClick={submit} disabled={loading}>
          {loading ? '登入中...' : '登入 →'}
        </button>
        <div className="error">{err}</div>
      </div>
    </div>
  )
}

/* ---------- RAIL ---------- */
function Rail({ currentTab, onTabChange, onOpenSettings }) {
  const defaultOrder = [
    { id: 'summary', icon: '⌂', title: '總覽' },
    { id: 'compare', icon: '⇌', title: '跨店比較' },
    { id: 'trends', icon: <TrendIcon />, title: '趨勢圖' },
  ]

  const [items, setItems] = useState(() => {
    try {
      const saved = localStorage.getItem('railOrder')
      if (saved) {
        const ids = JSON.parse(saved)
        const byId = Object.fromEntries(defaultOrder.map(o => [o.id, o]))
        const ordered = ids.map(id => byId[id]).filter(Boolean)
        defaultOrder.forEach(o => { if (!ordered.find(x => x.id === o.id)) ordered.push(o) })
        return ordered
      }
    } catch (e) {}
    return defaultOrder
  })

  const [dragging, setDragging] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const [longPressId, setLongPressId] = useState(null)
  const pressTimer = useState({ current: null })[0]

  const saveOrder = (newItems) => {
    setItems(newItems)
    try { localStorage.setItem('railOrder', JSON.stringify(newItems.map(i => i.id))) } catch (e) {}
  }

  const startLongPress = (id) => {
    pressTimer.current = setTimeout(() => {
      setLongPressId(id)
      if (navigator.vibrate) navigator.vibrate(50)
    }, 500)
  }
  const cancelLongPress = () => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null }
  }

  const handleDragStart = (e, id) => {
    if (longPressId !== id) { e.preventDefault(); return }
    setDragging(id)
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (e, id) => {
    e.preventDefault()
    setDragOver(id)
  }
  const handleDrop = (e, targetId) => {
    e.preventDefault()
    if (!dragging || dragging === targetId) { reset(); return }
    const from = items.findIndex(i => i.id === dragging)
    const to = items.findIndex(i => i.id === targetId)
    const newItems = [...items]
    const [moved] = newItems.splice(from, 1)
    newItems.splice(to, 0, moved)
    saveOrder(newItems)
    reset()
  }
  const reset = () => { setDragging(null); setDragOver(null); setLongPressId(null) }

  const handleClick = (id) => {
    if (longPressId) return
    onTabChange(id)
  }

  return (
    <div className="rail">
      <div className="rail-top">
        {items.map(item => (
          <div
            key={item.id}
            className={`rail-icon ${currentTab === item.id ? 'active' : ''} ${longPressId === item.id ? 'wiggle' : ''} ${dragOver === item.id && dragging !== item.id ? 'drag-over' : ''}`}
            title={item.title + '（長按可拖曳排序）'}
            draggable={longPressId === item.id}
            onMouseDown={() => startLongPress(item.id)}
            onMouseUp={cancelLongPress}
            onMouseLeave={cancelLongPress}
            onTouchStart={() => startLongPress(item.id)}
            onTouchEnd={cancelLongPress}
            onTouchCancel={cancelLongPress}
            onDragStart={(e) => handleDragStart(e, item.id)}
            onDragOver={(e) => handleDragOver(e, item.id)}
            onDrop={(e) => handleDrop(e, item.id)}
            onDragEnd={reset}
            onClick={() => handleClick(item.id)}
          >
            {item.icon}
          </div>
        ))}
      </div>
      <div className="rail-bottom" onClick={onOpenSettings} title="設定">⚙</div>
    </div>
  )
}

/* ---------- SIDEBAR ---------- */
function Sidebar({ settings, store, currentTab, onTabChange, onStoreChange, onLogout }) {
  const sections = [...new Set(settings.categories.map(c => c.section))]
  return (
    <div className="sidebar">
      <div className="user-info">
        <div className="avatar">{store.charAt(0)}</div>
        <div style={{flex: 1, minWidth: 0}}>
          <select
            className="store-switcher"
            value={store}
            onChange={e => onStoreChange(e.target.value)}
          >
            {settings.stores.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="user-email"><span className="sync-dot"></span>Firebase 已連線</div>
        </div>
      </div>

      <div className="section-label">Overview</div>
      <div
        className={`nav-item ${currentTab === 'summary' ? 'active' : ''}`}
        onClick={() => onTabChange('summary')}
      >
        <span className="icon">📊</span>總覽 Dashboard
      </div>

      {sections.map(section => (
        <div key={section}>
          <div className="section-label">{section}</div>
          {settings.categories.filter(c => c.section === section).map(cat => (
            <div
              key={cat.id}
              className={`nav-item ${currentTab === cat.id ? 'active' : ''}`}
              onClick={() => onTabChange(cat.id)}
            >
              <span className="icon">{cat.icon}</span>{cat.name}
            </div>
          ))}
        </div>
      ))}
      <button className="logout-btn" onClick={onLogout}>登出 Logout</button>
    </div>
  )
}

/* ---------- CONTENT ---------- */
function Content({ settings, store, currentTab, data, sumCat }) {
  if (currentTab === 'compare') return <CompareView settings={settings} />
  if (currentTab === 'trends') return <TrendsView settings={settings} store={store} />

  if (currentTab === 'summary') {
    const rev = sumCat('revenue')
    const expCats = settings.categories.filter(c => c.type === 'expense')
    const totalExp = expCats.reduce((s, c) => s + sumCat(c.id), 0)
    const profit = rev - totalExp
    const margin = rev > 0 ? ((profit / rev) * 100).toFixed(1) : 0
    return (
      <div className="content-area">
        <div className="page-title">Dashboard</div>
        <div className="page-sub">
          All Your Revenue And Expenses ・ {store} ・ <span className="sync-dot"></span>即時同步
        </div>
        <div className="cards">
          <div className="card revenue"><div className="label">總營業額</div><div className="value">{fmt(rev)}</div></div>
          <div className="card expense"><div className="label">總支出</div><div className="value">{fmt(totalExp)}</div></div>
          <div className="card profit"><div className="label">淨利 <span className="badge">{margin}%</span></div><div className="value">{fmt(profit)}</div></div>
        </div>
        <div className="breakdown">
          <h4>支出明細 Breakdown</h4>
          {expCats.map(c => (
            <div key={c.id} className="row">
              <span>{c.icon} {c.name}</span>
              <span className="amt">{fmt(sumCat(c.id))}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const cat = settings.categories.find(c => c.id === currentTab)
  if (!cat) return <div className="content-area"><div className="page-title">找不到此頁</div></div>
  return <CategoryView store={store} cat={cat} items={data[cat.id] || []} settings={settings} />
}

/* ---------- 共用：載入全部門店資料 ---------- */
function useAllStoresData(settings) {
  const [allData, setAllData] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const result = {}
      for (const s of settings.stores) {
        result[s] = {}
        for (const cat of settings.categories) {
          try {
            const snap = await getDocs(collection(db, 'stores', s, cat.id))
            result[s][cat.id] = snap.docs.map(d => d.data())
          } catch (e) { result[s][cat.id] = [] }
        }
      }
      if (!cancelled) { setAllData(result); setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [settings.stores, settings.categories])

  return { allData, loading }
}

/* ---------- COMPARE VIEW ---------- */
function CompareView({ settings }) {
  const { allData, loading } = useAllStoresData(settings)
  const [selectedCat, setSelectedCat] = useState(settings.categories[0]?.id || '')
  const [period, setPeriod] = useState('month')

  const sumFor = (storeName, catId) => {
    return (allData[storeName]?.[catId] || [])
      .filter(i => inPeriod(i.date, period))
      .reduce((s, i) => s + Number(i.amount || 0), 0)
  }

  const getVendorBreakdown = (catId) => {
    const vendors = {}
    settings.stores.forEach(s => {
      const items = (allData[s]?.[catId] || []).filter(i => inPeriod(i.date, period))
      items.forEach(it => {
        const name = it.desc || '(未命名)'
        if (!vendors[name]) vendors[name] = {}
        vendors[name][s] = (vendors[name][s] || 0) + Number(it.amount || 0)
      })
    })
    return vendors
  }

  if (loading) {
    return (
      <div className="content-area">
        <div className="page-title">⇌ 跨店比較</div>
        <div className="page-sub">載入所有門店資料中...</div>
      </div>
    )
  }

  const cat = settings.categories.find(c => c.id === selectedCat)
  const storeTotals = settings.stores.map(s => ({ store: s, amount: sumFor(s, selectedCat) }))
  const maxAmount = Math.max(...storeTotals.map(s => s.amount), 1)
  const vendors = getVendorBreakdown(selectedCat)
  const vendorList = Object.entries(vendors).sort((a, b) => {
    const sumA = Object.values(a[1]).reduce((s, v) => s + v, 0)
    const sumB = Object.values(b[1]).reduce((s, v) => s + v, 0)
    return sumB - sumA
  })

  const colors = ['#667eea', '#11998e', '#eb3349', '#f39c12', '#9b59b6', '#16a085']

  return (
    <div className="content-area">
      <div className="page-title">⇌ 跨店比較</div>
      <div className="page-sub">比較各門店在不同分類與廠商的支出</div>

      <div className="period-tabs">
        {PERIODS.map(p => (
          <button
            key={p.id}
            className={`period-tab ${period === p.id ? 'active' : ''}`}
            onClick={() => setPeriod(p.id)}
          >{p.name}</button>
        ))}
      </div>

      <div className="form-card" style={{marginBottom: 20}}>
        <div className="form-row">
          <select
            style={{flex: 1, padding: '11px 14px', borderRadius: 10, border: '1.5px solid rgba(0,0,0,0.08)', background: '#fafafa', fontSize: 14}}
            value={selectedCat}
            onChange={e => setSelectedCat(e.target.value)}
          >
            {settings.categories.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="chart-card">
        <h4>{cat?.icon} {cat?.name} ・ 各店合計（本{PERIODS.find(p=>p.id===period)?.name}）</h4>
        <div style={{overflowX: 'auto'}}>
          <div className="bar-chart" style={{minWidth: `${settings.stores.length * 90}px`}}>
            {storeTotals.map((s, i) => (
              <div key={s.store} className="bar-col">
                <div className="bar-value">{fmt(s.amount)}</div>
                <div className="bar-wrap">
                  <div
                    className="bar"
                    style={{
                      height: `${(s.amount / maxAmount) * 100}%`,
                      background: colors[i % colors.length]
                    }}
                  ></div>
                </div>
                <div className="bar-label">{s.store}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="vendor-card">
        <h4>廠商明細 Vendor Breakdown</h4>
        {vendorList.length === 0 ? (
          <div className="empty" style={{padding: 30, textAlign: 'center', color: '#aaa'}}>此分類尚無資料</div>
        ) : (
          <div style={{overflowX: 'auto'}}>
            <table>
              <thead>
                <tr>
                  <th>廠商 / 項目</th>
                  {settings.stores.map(s => <th key={s} style={{textAlign: 'right'}}>{s}</th>)}
                  <th style={{textAlign: 'right'}}>合計</th>
                </tr>
              </thead>
              <tbody>
                {vendorList.map(([name, byStore]) => {
                  const total = Object.values(byStore).reduce((s, v) => s + v, 0)
                  return (
                    <tr key={name}>
                      <td><b>{name}</b></td>
                      {settings.stores.map(s => (
                        <td key={s} style={{textAlign: 'right'}}>
                          {byStore[s] ? fmt(byStore[s]) : <span style={{color: '#ccc'}}>—</span>}
                        </td>
                      ))}
                      <td style={{textAlign: 'right', color: '#667eea'}}><b>{fmt(total)}</b></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------- TRENDS VIEW ---------- */
function TrendsView({ settings, store }) {
  const [catData, setCatData] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedCat, setSelectedCat] = useState(settings.categories[0]?.id || 'revenue')
  const [period, setPeriod] = useState('month')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const result = {}
      for (const cat of settings.categories) {
        try {
          const snap = await getDocs(collection(db, 'stores', store, cat.id))
          result[cat.id] = snap.docs.map(d => d.data())
        } catch (e) { result[cat.id] = [] }
      }
      if (!cancelled) { setCatData(result); setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [store, settings.categories])

  const series = useMemo(() => {
    if (loading) return { labels: [], values: [] }
    const buckets = []
    const now = new Date()

    if (period === 'day') {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now); d.setDate(now.getDate() - i); d.setHours(0,0,0,0)
        buckets.push({ start: d, end: new Date(d.getTime() + 86400000), label: `${d.getMonth()+1}/${d.getDate()}` })
      }
    } else if (period === 'week') {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now); d.setDate(now.getDate() - i * 7 - now.getDay()); d.setHours(0,0,0,0)
        buckets.push({ start: d, end: new Date(d.getTime() + 7*86400000), label: `${d.getMonth()+1}/${d.getDate()}` })
      }
    } else if (period === 'month') {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const e = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
        buckets.push({ start: d, end: e, label: `${d.getFullYear().toString().slice(2)}/${d.getMonth()+1}` })
      }
    } else if (period === 'quarter') {
      const curQ = Math.floor(now.getMonth() / 3)
      for (let i = 7; i >= 0; i--) {
        const qIdx = curQ - i
        const y = now.getFullYear() + Math.floor(qIdx / 4)
        const q = ((qIdx % 4) + 4) % 4
        const d = new Date(y, q * 3, 1)
        const e = new Date(y, q * 3 + 3, 1)
        buckets.push({ start: d, end: e, label: `${y.toString().slice(2)}Q${q+1}` })
      }
    } else if (period === 'year') {
      for (let i = 4; i >= 0; i--) {
        const y = now.getFullYear() - i
        buckets.push({ start: new Date(y, 0, 1), end: new Date(y+1, 0, 1), label: `${y}` })
      }
    }

    const items = catData[selectedCat] || []
    const values = buckets.map(b => {
      return items.reduce((sum, it) => {
        const d = new Date(it.date)
        if (d >= b.start && d < b.end) return sum + Number(it.amount || 0)
        return sum
      }, 0)
    })

    return { labels: buckets.map(b => b.label), values }
  }, [catData, loading, period, selectedCat])

  if (loading) {
    return (
      <div className="content-area">
        <div className="page-title">📈 趨勢圖</div>
        <div className="page-sub">載入 {store} 資料中...</div>
      </div>
    )
  }

  const maxV = Math.max(...series.values, 1)
  const cat = settings.categories.find(c => c.id === selectedCat)
  const lineColor = cat?.type === 'revenue' ? '#11998e' : '#eb3349'

  const firstV = series.values.find(v => v > 0) || 0
  const lastV = series.values[series.values.length - 1] || 0
  const change = lastV - firstV
  const changePct = firstV > 0 ? ((change / firstV) * 100).toFixed(1) : 0
  const isUp = change >= 0

  const W = 800, H = 340, PAD_L = 60, PAD_R = 20, PAD_T = 20, PAD_B = 40
  const chartW = W - PAD_L - PAD_R
  const chartH = H - PAD_T - PAD_B
  const n = series.labels.length
  const xStep = n > 1 ? chartW / (n - 1) : chartW

  const yTicks = 5
  const yTickVals = Array.from({length: yTicks+1}, (_, i) => (maxV * i / yTicks))

  const linePoints = series.values.map((v, idx) => {
    const x = PAD_L + idx * xStep
    const y = PAD_T + chartH - (v / maxV) * chartH
    return `${x},${y}`
  }).join(' ')

  const areaPath = series.values.length > 0
    ? `M ${PAD_L},${PAD_T + chartH} L ${linePoints.split(' ').join(' L ')} L ${PAD_L + (n-1) * xStep},${PAD_T + chartH} Z`
    : ''

  const total = series.values.reduce((s, v) => s + v, 0)
  const avg = n > 0 ? total / n : 0

  return (
    <div className="content-area">
      <div className="page-title">📈 {store} 趨勢圖</div>
      <div className="page-sub">{store} 的 {cat?.name} 時間變化趨勢（要看其他門店請從左上切換）</div>

      <div className="period-tabs">
        {PERIODS.map(p => (
          <button
            key={p.id}
            className={`period-tab ${period === p.id ? 'active' : ''}`}
            onClick={() => setPeriod(p.id)}
          >{p.name}線</button>
        ))}
      </div>

      <div className="form-card" style={{marginBottom: 20}}>
        <div className="form-row">
          <select
            style={{flex: 1, padding: '11px 14px', borderRadius: 10, border: '1.5px solid rgba(0,0,0,0.08)', background: '#fafafa', fontSize: 14}}
            value={selectedCat}
            onChange={e => setSelectedCat(e.target.value)}
          >
            {settings.categories.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">期間總計</div>
          <div className="value" style={{fontSize: 26}}>{fmt(total)}</div>
        </div>
        <div className="card">
          <div className="label">平均每期</div>
          <div className="value" style={{fontSize: 26}}>{fmt(Math.round(avg))}</div>
        </div>
        <div className="card">
          <div className="label">期間漲跌 <span className="badge" style={{background: isUp ? '#e8f5e9' : '#ffebee', color: isUp ? '#2e7d32' : '#c62828'}}>{isUp ? '▲' : '▼'} {Math.abs(changePct)}%</span></div>
          <div className="value" style={{fontSize: 26, color: isUp ? '#11998e' : '#eb3349'}}>{isUp ? '+' : ''}{fmt(change)}</div>
        </div>
      </div>

      <div className="chart-card">
        <h4>{cat?.icon} {cat?.name} 趨勢 ・ {PERIODS.find(p=>p.id===period)?.name}線</h4>

        <div style={{overflowX: 'auto'}}>
          <svg width={W} height={H} style={{minWidth: '100%', maxWidth: '100%'}}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
                <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
              </linearGradient>
            </defs>

            {yTickVals.map((v, i) => {
              const y = PAD_T + chartH - (v / maxV) * chartH
              return (
                <g key={i}>
                  <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#eee" strokeWidth="1" strokeDasharray="3,3" />
                  <text x={PAD_L - 8} y={y + 4} fontSize="10" fill="#999" textAnchor="end">
                    {v >= 1000 ? (v/1000).toFixed(0) + 'k' : v.toFixed(0)}
                  </text>
                </g>
              )
            })}

            {series.labels.map((label, i) => {
              const x = PAD_L + i * xStep
              return (
                <text key={i} x={x} y={H - PAD_B + 18} fontSize="10" fill="#888" textAnchor="middle">
                  {label}
                </text>
              )
            })}

            {areaPath && <path d={areaPath} fill="url(#areaGrad)" />}

            <polyline
              fill="none"
              stroke={lineColor}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={linePoints}
            />

            {series.values.map((v, idx) => {
              const x = PAD_L + idx * xStep
              const y = PAD_T + chartH - (v / maxV) * chartH
              return <circle key={idx} cx={x} cy={y} r="4" fill="white" stroke={lineColor} strokeWidth="2.5" />
            })}
          </svg>
        </div>
      </div>

      <div className="vendor-card">
        <h4>數據明細</h4>
        <div style={{overflowX: 'auto'}}>
          <table>
            <thead>
              <tr>
                <th>期間</th>
                <th style={{textAlign: 'right'}}>金額</th>
                <th style={{textAlign: 'right'}}>相較前期</th>
              </tr>
            </thead>
            <tbody>
              {series.labels.map((label, i) => {
                const v = series.values[i]
                const prev = i > 0 ? series.values[i-1] : 0
                const diff = v - prev
                const diffPct = prev > 0 ? ((diff / prev) * 100).toFixed(1) : null
                return (
                  <tr key={i}>
                    <td><b>{label}</b></td>
                    <td style={{textAlign: 'right'}}>{fmt(v)}</td>
                    <td style={{textAlign: 'right', color: i === 0 ? '#ccc' : (diff >= 0 ? '#11998e' : '#eb3349')}}>
                      {i === 0 ? '—' : `${diff >= 0 ? '▲' : '▼'} ${diffPct}%`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ---------- CATEGORY VIEW ---------- */
function CategoryView({ store, cat, items, settings }) {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [desc, setDesc] = useState('')
  const [amt, setAmt] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [pendingDeletes, setPendingDeletes] = useState(new Set())

  const vendorList = (settings.vendors && settings.vendors[cat.id]) || []
  const total = items.reduce((s, i) => s + Number(i.amount || 0), 0)

  const add = async () => {
    if (!date || !desc.trim() || !amt) { alert('請填寫完整資料'); return }
    try {
      await addDoc(collection(db, 'stores', store, cat.id), {
        date, desc: desc.trim(), amount: Number(amt), createdAt: serverTimestamp()
      })
      setDesc(''); setAmt('')
    } catch (e) { alert('新增失敗：' + e.message) }
  }

  const togglePending = (id) => {
    const next = new Set(pendingDeletes)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPendingDeletes(next)
  }

  const enterEditMode = () => {
    setEditMode(true)
    setPendingDeletes(new Set())
  }

  const cancelEdit = () => {
    if (pendingDeletes.size > 0) {
      if (!confirm('放棄所有未儲存的刪除？')) return
    }
    setEditMode(false)
    setPendingDeletes(new Set())
  }

  const saveDeletes = async () => {
    if (pendingDeletes.size === 0) {
      setEditMode(false)
      return
    }
    if (!confirm(`確定要刪除 ${pendingDeletes.size} 筆資料嗎？\n⚠ 此動作無法復原`)) return
    try {
      for (const id of pendingDeletes) {
        await deleteDoc(doc(db, 'stores', store, cat.id, id))
      }
      setEditMode(false)
      setPendingDeletes(new Set())
    } catch (e) {
      alert('刪除失敗：' + e.message)
    }
  }

  return (
    <div className="content-area">
      <div className="page-title">{cat.icon} {cat.name}</div>
      <div className="page-sub">{cat.type === 'revenue' ? '記錄每日營業收入' : '記錄此項支出明細'} ・ {store}</div>

      <div className="form-card">
        <div className="form-row">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          {vendorList.length > 0 ? (
            <select
              value={desc}
              onChange={e => setDesc(e.target.value)}
              style={{flex: 1, minWidth: 130, padding: '11px 14px', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 10, fontSize: 14, background: '#fafafa'}}
            >
              <option value="">-- 選擇項目 --</option>
              {vendorList.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          ) : (
            <input type="text" placeholder="項目/廠商名稱（可在設定新增）" value={desc}
              onChange={e => setDesc(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && add()} />
          )}
          <input type="number" placeholder="金額" min="0" value={amt}
            onChange={e => setAmt(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()} />
          <button onClick={add}>+ 新增</button>
        </div>
        {vendorList.length === 0 && (
          <div style={{fontSize: 11, color: '#999', marginTop: 8}}>
            💡 提示：到左下角齒輪設定，可為此分類新增常用項目，輸入時會變成下拉選單
          </div>
        )}
      </div>

      {/* 編輯/儲存控制列 */}
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
        <div style={{fontSize: 13, color: '#888'}}>
          {editMode ? (
            pendingDeletes.size > 0
              ? <span style={{color: '#eb3349', fontWeight: 600}}>⚠ 已標記 {pendingDeletes.size} 筆待刪除</span>
              : '點擊「刪除」標記要刪除的項目'
          ) : `共 ${items.length} 筆資料`}
        </div>
        <div style={{display: 'flex', gap: 8}}>
          {editMode ? (
            <>
              <button
                onClick={cancelEdit}
                style={{padding: '8px 16px', background: 'rgba(0,0,0,0.05)', color: '#333', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600}}
              >取消</button>
              <button
                onClick={saveDeletes}
                style={{padding: '8px 16px', background: pendingDeletes.size > 0 ? '#eb3349' : '#888', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600}}
              >💾 儲存變更</button>
            </>
          ) : (
            <button
              onClick={enterEditMode}
              style={{padding: '8px 16px', background: '#1a1a1a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600}}
            >✏️ 編輯模式</button>
          )}
        </div>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>項目</th>
              <th>金額</th>
              {editMode && <th style={{ textAlign: 'right' }}>操作</th>}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={editMode ? 4 : 3} className="empty">尚無資料，請新增第一筆</td></tr>
            ) : items.map(it => {
              const isPending = pendingDeletes.has(it.id)
              return (
                <tr key={it.id} style={isPending ? {background: '#ffebee', opacity: 0.6, textDecoration: 'line-through'} : {}}>
                  <td>{it.date}</td>
                  <td>{it.desc}</td>
                  <td><b>{fmt(it.amount)}</b></td>
                  {editMode && (
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="del-btn"
                        onClick={() => togglePending(it.id)}
                        style={isPending ? {background: '#888', color: 'white'} : {}}
                      >
                        {isPending ? '↺ 復原' : '刪除'}
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="total-bar">
        <span>合計 Total</span>
        <span className="big">{fmt(total)}</span>
      </div>
    </div>
  )
}

/* ---------- SETTINGS MODAL ---------- */
function SettingsModal({ settings, onSave, onClose }) {
  const [draft, setDraft] = useState(() => {
    const s = JSON.parse(JSON.stringify(settings))
    if (!s.vendors) s.vendors = {}
    return s
  })

  const updateField = (field, value) => setDraft({ ...draft, [field]: value })

  const updateStore = (i, value) => {
    const stores = [...draft.stores]; stores[i] = value
    setDraft({ ...draft, stores })
  }
  const addStore = () => setDraft({ ...draft, stores: [...draft.stores, '新門店'] })
  const delStore = (i) => {
    if (!confirm(`確定要刪除「${draft.stores[i]}」？\n⚠ 該門店的 Firebase 資料不會被刪除，只是從列表隱藏。\n記得按「儲存設定」才會生效。`)) return
    setDraft({ ...draft, stores: draft.stores.filter((_, idx) => idx !== i) })
  }

  const updateCat = (i, field, value) => {
    const cats = [...draft.categories]
    cats[i] = { ...cats[i], [field]: value }
    setDraft({ ...draft, categories: cats })
  }
  const addCat = () => setDraft({
    ...draft,
    categories: [...draft.categories, {
      id: 'cat_' + Date.now(), name: '新分類', type: 'expense', icon: '📦', section: 'Expenses'
    }]
  })
  const delCat = (i) => {
    if (!confirm(`確定要刪除分類「${draft.categories[i].name}」？\n⚠ 該分類已輸入的資料仍會保留在 Firebase。\n記得按「儲存設定」才會生效。`)) return
    setDraft({ ...draft, categories: draft.categories.filter((_, idx) => idx !== i) })
  }

  // 廠商管理
  const getVendors = (catId) => draft.vendors[catId] || []
  const addVendor = (catId) => {
    const vendors = { ...draft.vendors }
    vendors[catId] = [...(vendors[catId] || []), '新項目']
    setDraft({ ...draft, vendors })
  }
  const updateVendor = (catId, i, value) => {
    const vendors = { ...draft.vendors }
    const list = [...(vendors[catId] || [])]
    list[i] = value
    vendors[catId] = list
    setDraft({ ...draft, vendors })
  }
  const delVendor = (catId, i) => {
    const name = draft.vendors[catId][i]
    if (!confirm(`確定要刪除項目「${name}」？\n記得按「儲存設定」才會生效。`)) return
    const vendors = { ...draft.vendors }
    vendors[catId] = vendors[catId].filter((_, idx) => idx !== i)
    setDraft({ ...draft, vendors })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>⚙ 網頁設定</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="setting-group">
            <h3>基本資訊</h3>
            <label>網頁標題</label>
            <input value={draft.appTitle} onChange={e => updateField('appTitle', e.target.value)} />
            <label>副標題</label>
            <input value={draft.appSubtitle} onChange={e => updateField('appSubtitle', e.target.value)} />
          </div>

          <div className="setting-group">
            <h3>門店列表</h3>
            {draft.stores.map((s, i) => (
              <div key={i} className="list-row">
                <input value={s} onChange={e => updateStore(i, e.target.value)} />
                <button className="del-btn" onClick={() => delStore(i)}>刪除</button>
              </div>
            ))}
            <button className="add-btn" onClick={addStore}>+ 新增門店</button>
          </div>

          <div className="setting-group">
            <h3>分類項目</h3>
            {draft.categories.map((c, i) => (
              <div key={i} className="cat-row">
                <input style={{ width: '50px' }} value={c.icon} onChange={e => updateCat(i, 'icon', e.target.value)} placeholder="icon" />
                <input style={{ flex: 1 }} value={c.name} onChange={e => updateCat(i, 'name', e.target.value)} placeholder="名稱" />
                <select value={c.type} onChange={e => updateCat(i, 'type', e.target.value)}>
                  <option value="revenue">收入</option>
                  <option value="expense">支出</option>
                </select>
                <button className="del-btn" onClick={() => delCat(i)}>刪除</button>
              </div>
            ))}
            <button className="add-btn" onClick={addCat}>+ 新增分類</button>
          </div>

          <div className="setting-group">
            <h3>各分類常用項目（廠商）</h3>
            <div style={{fontSize: 12, color: '#888', marginBottom: 12}}>
              為每個分類設定常用項目，輸入資料時會變成下拉選單
            </div>
            {draft.categories.map(c => (
              <div key={c.id} style={{marginBottom: 18, padding: 14, background: '#fafafa', borderRadius: 10, border: '1px solid #eee'}}>
                <div style={{fontWeight: 700, fontSize: 13, marginBottom: 10}}>{c.icon} {c.name}</div>
                {getVendors(c.id).map((v, i) => (
                  <div key={i} className="list-row">
                    <input value={v} onChange={e => updateVendor(c.id, i, e.target.value)} placeholder="項目名稱" />
                    <button className="del-btn" onClick={() => delVendor(c.id, i)}>刪除</button>
                  </div>
                ))}
                <button className="add-btn" onClick={() => addVendor(c.id)}>+ 新增項目</button>
              </div>
            ))}
          </div>

          <div style={{background: '#e8f5e9', padding: 12, borderRadius: 10, fontSize: 12, color: '#2e7d32', marginBottom: 10}}>
            🔐 登入帳號管理請到 Firebase Console → Authentication → Users
          </div>
          <div style={{background: '#fff8e1', padding: 12, borderRadius: 10, fontSize: 12, color: '#8a6d3b'}}>
            💡 所有變更會在按下「儲存設定」後才生效並同步到所有裝置。
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>取消</button>
          <button className="btn-save" onClick={() => {
            if (confirm('確定要儲存這些變更嗎？')) onSave(draft)
          }}>💾 儲存設定</button>
        </div>
      </div>
    </div>
  )
}
