// Deprecated diagnostic archive. It targets the retired Volcano API path.
// Do not run in production; use the application log page and ToAPIs diagnostic instead.

import pg from 'pg'
import crypto from 'node:crypto'

const pool = new pg.Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? '5432'),
  user: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'tpg_ai_comic_drama',
})

const buildEncryptionKey = (secret) => crypto.createHash('sha256').update(secret).digest()

function decryptSecretValue(encryptedValue, secret) {
  const [version, iv, authTag, payload] = encryptedValue.split(':')
  if (version !== 'enc-v1' || !iv || !authTag || !payload) {
    return encryptedValue // not encrypted, return as-is
  }
  const key = buildEncryptionKey(secret)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(authTag, 'base64'))
  const decrypted = Buffer.concat([decipher.update(Buffer.from(payload, 'base64')), decipher.final()])
  return decrypted.toString('utf8')
}

try {
  const { rows } = await pool.query('SELECT key, value, is_secret FROM system_config WHERE key IN ($1, $2) ORDER BY key', ['ark_api_key', 'ark_endpoint'])

  console.log('\n========== DB Config Diagnostic ==========\n')

  const encSecret = process.env.CONFIG_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? 'dev-config-secret'
  console.log('Encryption key source:', process.env.CONFIG_ENCRYPTION_KEY ? 'CONFIG_ENCRYPTION_KEY' : process.env.JWT_SECRET ? 'JWT_SECRET' : 'dev-config-secret (fallback)')
  console.log()

  for (const row of rows) {
    console.log(`[${row.key}]`)
    console.log('  is_secret:', row.is_secret)
    if (row.is_secret) {
      const decrypted = decryptSecretValue(row.value, encSecret)
      console.log('  decrypted length:', decrypted.length)
      console.log('  first 8 chars:', decrypted.substring(0, 8))
      console.log('  last 4 chars:', decrypted.slice(-4))
    } else {
      console.log('  value:', row.value)
    }
    console.log()
  }

  // Test API with the decrypted token
  const apiKeyRow = rows.find(r => r.key === 'ark_api_key')
  const endpointRow = rows.find(r => r.key === 'ark_endpoint')

  if (apiKeyRow && endpointRow) {
    const token = apiKeyRow.is_secret ? decryptSecretValue(apiKeyRow.value, encSecret) : apiKeyRow.value
    const endpoint = endpointRow.value.replace(/\/+$/, '')

    console.log('========== API Test ==========')
    console.log('Endpoint:', endpoint)
    console.log('Token (first 8):', token.substring(0, 8) + '****')
    console.log()

    const url = `${endpoint}/contents/generations/tasks`
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'doubao-seedance-2-0-fast-260128',
        content: [{ type: 'text', text: 'test' }],
      }),
    })

    const body = await resp.text()
    console.log('HTTP Status:', resp.status)
    console.log('Response:', body)

    if (resp.ok) {
      console.log('\n>>> SUCCESS: Worker config is correct!')
    } else {
      console.log('\n>>> FAILED: Token or endpoint mismatch!')
      console.log('>>> If curl works but this fails, the worker is using wrong encryption key')
    }
  }

  console.log('\n========== Done ==========\n')
} catch (err) {
  console.error('Error:', err.message)
} finally {
  await pool.end()
}
