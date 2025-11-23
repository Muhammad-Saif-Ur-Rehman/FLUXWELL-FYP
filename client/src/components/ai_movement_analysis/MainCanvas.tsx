import ThreeScene from './ThreeScene';

const MainCanvas = () => {
  return (
    <div className="bg-[#110E0E] border border-[#663333] rounded-lg overflow-hidden w-full h-full">
      <div className="canvas-area w-full h-full">
        <ThreeScene />
      </div>
    </div>
  );
};

export default MainCanvas;
