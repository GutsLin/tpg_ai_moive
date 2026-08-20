import request from '../utils/request'

import type { ActiveVideoProvider } from './videos'

export const getActiveVideoProvider = async (): Promise<ActiveVideoProvider> => {
  const response = await request.get<ActiveVideoProvider>('/api/videos/provider')
  return response.data
}
