import { list } from '@vercel/blob'

export const dynamic = 'force-dynamic'

type Contact = {
  name: string
  title: string
  company: string
  email: string
  phone: string
  owner: string
  status: string
  url: string
  capturedAt: string
}

async function getContacts(): Promise<Contact[]> {
  try {
    const blobs = await list({ prefix: 'contacts.json' })

    if (blobs.blobs.length === 0) return []

    const res = await fetch(blobs.blobs[0].url, { cache: 'no-store' })
    return await res.json()
  } catch {
    return []
  }
}

export default async function Dashboard() {
  const contacts = await getContacts()

  return (
    <main style={{ padding: '24px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ fontSize: '28px', marginBottom: '16px' }}>BDR Dashboard</h1>

      <p style={{ marginBottom: '20px' }}>
        Total Contacts Captured: <strong>{contacts.length}</strong>
      </p>

      {contacts.length === 0 ? (
        <p>No contacts yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              border: '1px solid #ddd',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5' }}>
                <th style={cellHeader}>Name</th>
                <th style={cellHeader}>Company</th>
                <th style={cellHeader}>Status</th>
                <th style={cellHeader}>Owner</th>
                <th style={cellHeader}>Captured</th>
              </tr>
            </thead>
            <tbody>
              {contacts.slice(0, 10).map((contact, index) => (
                <tr key={index}>
                  <td style={cell}>{contact.name}</td>
                  <td style={cell}>{contact.company}</td>
                  <td style={cell}>{contact.status}</td>
                  <td style={cell}>{contact.owner}</td>
                  <td style={cell}>
                    {new Date(contact.capturedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

const cellHeader = {
  textAlign: 'left' as const,
  padding: '10px',
  borderBottom: '1px solid #ddd',
}

const cell = {
  padding: '10px',
  borderBottom: '1px solid #eee',
}
