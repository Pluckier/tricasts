import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Tricasts from './Tricasts.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Tricasts />
  </StrictMode>
)
