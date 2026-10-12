import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// 纯前端版本：改用 HashRouter，部署在任意子路径（REDcowork / GitHub Pages / 本地）都能正常匹配路由，
// 不再写死 basename。
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </HashRouter>
  </StrictMode>,
)
