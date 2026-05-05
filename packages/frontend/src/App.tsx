import {BrowserRouter, Routes, Route} from 'react-router-dom'
import AppShell from './components/layout/AppShell.tsx'
import ProjectsPage from './pages/ProjectsPage.tsx'
import ProjectDetailPage from './pages/ProjectDetailPage.tsx'
import TestSetPage from './pages/TestSetPage.tsx'
import {ActiveProjectProvider} from './contexts/ActiveProjectContext.tsx'

export default function App() {
  return (
    <BrowserRouter>
      <ActiveProjectProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />
            <Route path="/test-sets/:id" element={<TestSetPage />} />
          </Route>
        </Routes>
      </ActiveProjectProvider>
    </BrowserRouter>
  )
}
