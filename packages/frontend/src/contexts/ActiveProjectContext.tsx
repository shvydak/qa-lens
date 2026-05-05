import {createContext, useContext, useState} from 'react'
import type {ReactNode} from 'react'

interface ActiveProjectContextValue {
  activeProjectId: string | null
  setActiveProjectId: (id: string | null) => void
  testSetVersion: number
  invalidateTestSets: () => void
}

const ActiveProjectContext = createContext<ActiveProjectContextValue>({
  activeProjectId: null,
  setActiveProjectId: () => {},
  testSetVersion: 0,
  invalidateTestSets: () => {},
})

export function useActiveProject() {
  return useContext(ActiveProjectContext)
}

export function ActiveProjectProvider({children}: {children: ReactNode}) {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [testSetVersion, setTestSetVersion] = useState(0)
  const invalidateTestSets = () => setTestSetVersion((v) => v + 1)
  return (
    <ActiveProjectContext.Provider
      value={{activeProjectId, setActiveProjectId, testSetVersion, invalidateTestSets}}>
      {children}
    </ActiveProjectContext.Provider>
  )
}
