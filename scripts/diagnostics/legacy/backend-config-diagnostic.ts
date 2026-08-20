// Deprecated diagnostic archive. It targets the retired Volcano API path.
// Do not run in production; use the application log page and ToAPIs diagnostic instead.

import 'dotenv/config'
import { ConfigService } from './services/config.service'

async function main() {
  const configService = new ConfigService()

  console.log('\n========== Config Diagnostic ==========\n')

  // 1. Read raw DB values
  const apiKeyEntry = await (configService as any).store.getByKey('ark_api_key')
  const endpointEntry = await (configService as any).store.getByKey('ark_endpoint')

  console.log('[DB Raw] ark_endpoint:')
  console.log('  value:', endpointEntry?.value)
  console.log('  isSecret:', endpointEntry?.isSecret)
  console.log()

  console.log('[DB Raw] ark_api_key:')
  console.log('  isSecret:', apiKeyEntry?.isSecret)
  console.log('  encrypted value (first 60 chars):', apiKeyEntry?.value?.substring(0, 60))
  console.log()

  // 2. Decrypt
  let decryptedKey = ''
  try {
    decryptedKey = await configService.getRequired('ark_api_key')
    console.log('[Decrypted] ark_api_key:')
    console.log('  length:', decryptedKey.length)
    console.log('  first 8 chars:', decryptedKey.substring(0, 8))
    console.log('  last 4 chars:', decryptedKey.slice(-4))
    console.log()
  } catch (err: any) {
    console.log('[Decrypted] ark_api_key: FAILED -', err.message)
    console.log()
  }

  // 3. Read endpoint
  let endpoint = ''
  try {
    endpoint = await configService.getRequired('ark_endpoint')
    console.log('[Resolved] ark_endpoint:', endpoint)
    console.log()
  } catch (err: any) {
    console.log('[Resolved] ark_endpoint: FAILED -', err.message)
    console.log()
  }

  // 4. Test API call
  if (decryptedKey && endpoint) {
    const testUrl = `${endpoint.replace(/\/+$/, '')}/contents/generations/tasks`
    console.log('[API Test] POST', testUrl)
    console.log('[API Test] Authorization: Bearer', decryptedKey.substring(0, 8) + '****')

    const payload = JSON.stringify({
      model: 'doubao-seedance-2-0-fast-260128',
      content: [{ type: 'text', text: 'test' }],
    })

    try {
      const resp = await fetch(testUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${decryptedKey}`,
          'Content-Type': 'application/json',
        },
        body: payload,
      })

      const body = await resp.text()
      console.log('[API Test] HTTP Status:', resp.status)
      console.log('[API Test] Response:', body)
      if (resp.ok) {
        console.log('[API Test] SUCCESS - token and endpoint are correct!')
      } else {
        console.log('[API Test] FAILED - check response above')
      }
    } catch (err: any) {
      console.log('[API Test] Network error:', err.message)
    }
  }

  // 5. Check encryption key
  const encKey = process.env.CONFIG_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? 'dev-config-secret'
  console.log()
  console.log('[Encryption] CONFIG_ENCRYPTION_KEY set:', !!process.env.CONFIG_ENCRYPTION_KEY)
  console.log('[Encryption] JWT_SECRET set:', !!process.env.JWT_SECRET)
  console.log('[Encryption] Using fallback dev key:', !process.env.CONFIG_ENCRYPTION_KEY && !process.env.JWT_SECRET)

  console.log('\n========== Diagnostic Complete ==========\n')
  process.exit(0)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
