import { createContext, useContext } from 'react'
import { makeAutoObservable } from 'mobx'
import { ChillerStore } from './ChillerStore'
import { AHUStore } from './AHUStore'
import { PowerGridStore } from './PowerGridStore'
import { SolarStore } from './SolarStore'
import { SavingsStore } from './SavingsStore'

export class RootStore {
  chiller  = new ChillerStore()
  ahu      = new AHUStore()
  power    = new PowerGridStore()
  solar    = new SolarStore()
  savings  = new SavingsStore()
  darkMode = false

  constructor() { makeAutoObservable(this) }
  toggleDark() { this.darkMode = !this.darkMode }
}

export const rootStore = new RootStore()
const StoreContext = createContext(rootStore)
export const useStore = () => useContext(StoreContext)
export { ChillerStore, AHUStore, PowerGridStore, SolarStore, SavingsStore }
