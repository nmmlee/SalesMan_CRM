import { createRoot } from 'react-dom/client'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import { App } from './app/App'
import './ui/styles.css'

createRoot(document.getElementById('root')!).render(<App />)
