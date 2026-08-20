import { ConfigProvider, theme } from 'antd'
import React from 'react'
import ReactDOM from 'react-dom/client'

import { AppRouter } from './router'
import './styles/global.css'
import { AuthProvider } from './stores/auth'
import { BrandProvider } from './stores/brand'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#115e59',
          colorInfo: '#115e59',
          colorSuccess: '#0f766e',
          colorWarning: '#b45309',
          colorText: '#1f2937',
          colorTextSecondary: '#6b7280',
          colorBgElevated: '#fffaf3',
          colorBorderSecondary: 'rgba(15, 23, 42, 0.08)',
          borderRadius: 16,
          fontSize: 14,
          fontFamily: "'Avenir Next', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
        },
        components: {
          Button: {
            borderRadius: 999,
            primaryShadow: '0 14px 28px rgba(15, 118, 110, 0.18)',
          },
          Card: {
            borderRadiusLG: 24,
          },
          Dropdown: {
            paddingBlock: 8,
          },
        },
      }}
    >
      <BrandProvider>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </BrandProvider>
    </ConfigProvider>
  </React.StrictMode>
)
