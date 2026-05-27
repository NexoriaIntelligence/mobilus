import { create } from 'zustand';
import { Vehicle, RealtimeEvent, Alert } from '../types';

interface FleetState {
  vehicles: Map<string, Vehicle>;
  alerts: Alert[];
  selectedVehicleId: string | null;
  setVehicles: (vehicles: Vehicle[]) => void;
  updateVehicle: (vehicle: Partial<Vehicle> & { id: string }) => void;
  addAlert: (alert: Alert) => void;
  clearAlert: (alertId: string) => void;
  selectVehicle: (id: string | null) => void;
}

export const useFleetStore = create<FleetState>((set) => ({
  vehicles: new Map(),
  alerts: [],
  selectedVehicleId: null,
  
  setVehicles: (vehicles) => {
    const map = new Map(vehicles.map(v => [v.id, v]));
    set({ vehicles: map });
  },
  
  updateVehicle: (update) => {
    set((state) => {
      const newVehicles = new Map(state.vehicles);
      const existing = newVehicles.get(update.id);
      if (existing) {
        newVehicles.set(update.id, { ...existing, ...update });
      } else {
        newVehicles.set(update.id, update as Vehicle);
      }
      return { vehicles: newVehicles };
    });
  },
  
  addAlert: (alert) => {
    set((state) => ({ alerts: [...state.alerts, alert] }));
  },
  
  clearAlert: (alertId) => {
    set((state) => ({
      alerts: state.alerts.filter(a => a.id !== alertId)
    }));
  },
  
  selectVehicle: (id) => {
    set({ selectedVehicleId: id });
  }
}));
