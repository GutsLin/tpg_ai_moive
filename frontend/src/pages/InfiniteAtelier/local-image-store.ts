const DB_NAME = 'narrix-infinite-atelier'
const STORE_NAME = 'images'

const openDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1)
  request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME) }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

export const putLocalImage = async (blob: Blob, key = crypto.randomUUID()): Promise<string> => {
  const database = await openDb()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(blob, key)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
  return key
}

export const getLocalImage = async (key: string): Promise<Blob | null> => {
  const database = await openDb()
  const result = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
    request.onsuccess = () => resolve(request.result as Blob | undefined)
    request.onerror = () => reject(request.error)
  })
  database.close()
  return result ?? null
}

export const transformLocalImage = async (key: string, operation: 'crop' | 'upscale' | 'mask' | 'split-left' | 'split-right') => {
  const blob = await getLocalImage(key)
  if (!blob) throw new Error('本地图片缓存不存在，请重新导入')
  const bitmap = await createImageBitmap(blob)
  const crop = operation === 'crop'; const split = operation.startsWith('split-'); const scale = operation === 'upscale' ? 2 : 1
  const sourceWidth = crop ? Math.floor(bitmap.width * 0.8) : split ? Math.floor(bitmap.width / 2) : bitmap.width
  const sourceHeight = crop ? Math.floor(bitmap.height * 0.8) : bitmap.height
  const sourceX = crop ? Math.floor(bitmap.width * 0.1) : operation === 'split-right' ? bitmap.width - sourceWidth : 0
  const sourceY = crop ? Math.floor(bitmap.height * 0.1) : 0
  const canvas = document.createElement('canvas'); canvas.width = sourceWidth * scale; canvas.height = sourceHeight * scale
  const context = canvas.getContext('2d'); if (!context) throw new Error('浏览器不支持图片编辑')
  if (operation === 'mask') { context.beginPath(); context.ellipse(canvas.width / 2, canvas.height / 2, canvas.width / 2, canvas.height / 2, 0, 0, Math.PI * 2); context.clip() }
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'; context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height); bitmap.close()
  const output = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('图片处理失败')), 'image/png'))
  return putLocalImage(output)
}
