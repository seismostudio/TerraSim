import React, { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export interface Vertex {
  x: number;
  y: number;
}

export interface Polygon {
  vertices: Vertex[];
  id: string;
}

interface PolygonContextType {
  polygons: Polygon[];
  addPolygon: (polygon: Polygon) => void;
  removePolygon: (id: string) => void;
  updatePolygon: (id: string, polygon: Polygon) => void;
  clearPolygons: () => void;
}

const PolygonContext = createContext<PolygonContextType | undefined>(undefined);

interface PolygonProviderProps {
  children: ReactNode;
}

export const PolygonProvider: React.FC<PolygonProviderProps> = ({ children }) => {
  const [polygons, setPolygons] = useState<Polygon[]>([]);

  const addPolygon = (polygon: Polygon) => {
    setPolygons(prev => [...prev, polygon]);
  };

  const removePolygon = (id: string) => {
    setPolygons(prev => prev.filter(p => p.id !== id));
  };

  const updatePolygon = (id: string, polygon: Polygon) => {
    setPolygons(prev => prev.map(p => p.id === id ? polygon : p));
  };

  const clearPolygons = () => {
    setPolygons([]);
  };

  return (
    <PolygonContext.Provider value={{
      polygons,
      addPolygon,
      removePolygon,
      updatePolygon,
      clearPolygons,
    }}>
      {children}
    </PolygonContext.Provider>
  );
};

export const usePolygonContext = (): PolygonContextType => {
  const context = useContext(PolygonContext);
  if (context === undefined) {
    throw new Error('usePolygonContext must be used within a PolygonProvider');
  }
  return context;
}; 