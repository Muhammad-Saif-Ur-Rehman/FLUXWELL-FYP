import { useSettings } from '../../contexts/SettingsContext';

const Settings = () => {
  const {
    shadowsEnabled,
    setShadowsEnabled,
    gridEnabled,
    setGridEnabled,
    cameraView,
    setCameraView,
  } = useSettings();



  return (
    <div className="bg-[#1a1a1a] border border-[#663333] rounded-lg p-6 glass-card">
      <h3 className="text-lg font-semibold mb-6 text-[#EA2A2A] flex items-center gap-2">
        <span>⚙️</span>
        3D Scene Settings
      </h3>

      {/* Settings Grid - Horizontal Layout for Rectangular Space */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
        {/* Shadows Toggle */}
        <div className="flex flex-col">
          <span className="text-gray-300 text-sm font-medium mb-3">Shadows</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={shadowsEnabled}
              onChange={(e) => setShadowsEnabled(e.target.checked)}
            />
            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#EA2A2A]/25 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#EA2A2A]"></div>
          </label>
        </div>

        {/* Grid Toggle */}
        <div className="flex flex-col">
          <span className="text-gray-300 text-sm font-medium mb-3">Grid</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={gridEnabled}
              onChange={(e) => setGridEnabled(e.target.checked)}
            />
            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#EA2A2A]/25 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#EA2A2A]"></div>
          </label>
        </div>

        {/* Camera View Selector - Spans remaining space */}
        <div className="md:col-span-1">
          <label className="block text-gray-300 text-sm font-medium mb-3">
            Camera View
          </label>
          <select
            value={cameraView}
            onChange={(e) => setCameraView(e.target.value)}
            className="w-full bg-[#110E0E] border border-[#663333] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#EA2A2A] focus:ring-2 focus:ring-[#EA2A2A]/20 transition-colors"
          >
            <option value="perspective" className="bg-[#110E0E]">Perspective</option>
            <option value="front" className="bg-[#110E0E]">Front View</option>
            <option value="side" className="bg-[#110E0E]">Side View</option>
            <option value="top" className="bg-[#110E0E]">Top View</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default Settings;
