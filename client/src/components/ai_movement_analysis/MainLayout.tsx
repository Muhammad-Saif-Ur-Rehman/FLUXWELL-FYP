import MainCanvas from './MainCanvas';
import VideoPreview from './VideoPreview';
import Settings from './Settings';

const MainLayout = () => {
  return (
    <div className="space-y-6">
      {/* Settings Panel - Rectangular, full width, top position */}
      <div className="w-full">
        <Settings />
      </div>

      {/* Main Content Grid - Avatar and Camera Feed side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 3D Avatar Canvas - Square aspect ratio */}
        <div className="aspect-square">
          <MainCanvas />
        </div>

        {/* Live Camera Feed - Maintain aspect ratio but allow more flexibility */}
        <div className="aspect-square min-h-[400px]">
          <VideoPreview />
        </div>
      </div>
    </div>
  );
};

export default MainLayout;
