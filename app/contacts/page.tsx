import fs from 'fs'
import path from 'path'

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

function getContacts(): Contact[] {
  const filePath = path.join(process.cwd(), 'contact-log.json')

  try {
    const file = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(file)
  } catch {
    return []
  }
}

export default function ContactsPage() {
  const contacts = getContacts()

  return (
    <main style={{ padding: '24px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ fontSize: '28px', marginBottom: '16px' }}>Salesforce Contacts</h1>

      {contacts.length === 0 ? (
        <p>No contacts captured yet.</p>
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
                <th style={cellHeader}>Title</th>
                <th style={cellHeader}>Company</th>
                <th style={cellHeader}>Email</th>
                <th style={cellHeader}>Phone</th>
                <th style={cellHeader}>Owner</th>
                <th style={cellHeader}>Status</th>
                <th style={cellHeader}>Captured</th>
                <th style={cellHeader}>Record</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact, index) => (
                <tr key={index}>
                  <td style={cell}>{contact.name}</td>
                  <td style={cell}>{contact.title}</td>
                  <td style={cell}>{contact.company}</td>
                  <td style={cell}>{contact.email}</td>
                  <td style={cell}>{contact.phone}</td>
                  <td style={cell}>{contact.owner}</td>
                  <td style={cell}>{contact.status}</td>
                  <td style={cell}>
                    {new Date(contact.capturedAt).toLocaleString()}
                  </td>
                  <td style={cell}>
                    <a
                      href={contact.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#2563eb' }}
                    >
                      Open
                    </a>
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
