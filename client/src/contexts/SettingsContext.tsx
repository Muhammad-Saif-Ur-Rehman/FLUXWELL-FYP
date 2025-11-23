import { createContext, useContext, useState, ReactNode } from 'react';

export interface SettingsContextType {
  shadowsEnabled: boolean;
  setShadowsEnabled: (enabled: boolean) => void;
  gridEnabled: boolean;
  setGridEnabled: (enabled: boolean) => void;
  cameraView: string;
  setCameraView: (view: string) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
};

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [shadowsEnabled, setShadowsEnabled] = useState(true);
  const [gridEnabled, setGridEnabled] = useState(true);
  const [cameraView, setCameraView] = useState('perspective');

  return (
    <SettingsContext.Provider
      value={{
        shadowsEnabled,
        setShadowsEnabled,
        gridEnabled,
        setGridEnabled,
        cameraView,
        setCameraView,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};
