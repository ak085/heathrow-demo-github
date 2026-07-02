import { createContext, useContext } from 'react'
import { makeAutoObservable } from 'mobx'
import { ChillerStore } from './ChillerStore'
import { AHUStore } from './AHUStore'
import { PowerGridStore } from './PowerGridStore'
import { SolarStore } from './SolarStore'
import { SavingsStore } from './SavingsStore'
import { TenantStore } from './TenantStore'
import { LightingStore } from './LightingStore'

export class RootStore {
  ahu      = new AHUStore()
  chiller  = new ChillerStore(this.ahu)
  lighting = new LightingStore()
  power    = new PowerGridStore(this.chiller, this.ahu, this.lighting)
  solar    = new SolarStore(this.power)
  savings  = new SavingsStore(this.chiller)
  tenant   = new TenantStore()
  darkMode = false

  constructor() { makeAutoObservable(this) }
  toggleDark() { this.darkMode = !this.darkMode }
}

export const rootStore = new RootStore()
const StoreContext = createContext(rootStore)
export const useStore = () => useContext(StoreContext)
export { ChillerStore, AHUStore, PowerGridStore, SolarStore, SavingsStore, TenantStore, LightingStore }
