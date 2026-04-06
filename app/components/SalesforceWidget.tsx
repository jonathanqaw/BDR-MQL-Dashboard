'use client'

import { useEffect, useState } from 'react'

export default function SalesforceWidget() {
  const [contacts, setContacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    ;(async () => {
      try {
        const res = await fetch('/api/enrich-contact')
        const json = await res.json()
        if (active && json?.success) setContacts(json.contacts || [])
      } catch {
        if (active) setContacts([])
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => { active = false }
  }, [])

  return (
    <div style={{background:'#1e1b3a',border:'1px solid #2e2a5a',borderRadius:12,padding:16,marginBottom:20}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
        <div>
          <div style={{fontSize:12,color:'#9ca3af'}}>Salesforce</div>
          <div style={{fontSize:16,fontWeight:600}}>Contacts</div>
        </div>
        <a href="/contacts" style={{fontSize:12,color:'#22c55e'}}>View all →</a>
      </div>

      {loading ? (
        <div style={{fontSize:12,color:'#9ca3af'}}>Loading...</div>
      ) : contacts.length === 0 ? (
        <div style={{fontSize:12,color:'#9ca3af'}}>No contacts yet</div>
      ) : (
        contacts.slice(0,3).map((c,i)=>(
          <div key={i} style={{fontSize:13,marginBottom:6}}>
            {c.name} - {c.company}
          </div>
        ))
      )}
    </div>
  )
}
