import { useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { useSettings } from '../../contexts/SettingsContext';

const MODEL_URL = 'https://models.readyplayer.me/67be034c9fab1c21c486eb14.glb';

const BODY_SMOOTHING = 0.7;

// MediaPipe landmark indices
const lSHOULDER = 11, rSHOULDER = 12;
const lELBOW = 13, rELBOW = 14;
const lWRIST = 15, rWRIST = 16;
const lPINKY = 17, rPINKY = 18;
const lINDEX = 19, rINDEX = 20;
const lHIP = 23, rHIP = 24;
const lKNEE = 25, rKNEE = 26;
const lANKLE = 27, rANKLE = 28;
const lHEEL = 29, rHEEL = 30;

interface ModelProps {
  keypointsData: any;
  shadowsEnabled: boolean;
}

const Model = ({ keypointsData, shadowsEnabled }: ModelProps) => {
  const { scene } = useGLTF(MODEL_URL);
  const modelRef = useRef<THREE.Group>(null);
  const bonesRef = useRef<{
    Spine?: THREE.Bone;
    Spine1?: THREE.Bone;
    RightArm?: THREE.Bone;
    RightForeArm?: THREE.Bone;
    RightHand?: THREE.Bone;
    LeftArm?: THREE.Bone;
    LeftForeArm?: THREE.Bone;
    LeftHand?: THREE.Bone;
    RightUpLeg?: THREE.Bone;
    RightLeg?: THREE.Bone;
    RightFoot?: THREE.Bone;
    LeftUpLeg?: THREE.Bone;
    LeftLeg?: THREE.Bone;
    LeftFoot?: THREE.Bone;
  }>({});

  // Cache for calculations
  const poseLms = useRef<THREE.Vector3[]>([]);
  const axes = useRef(new THREE.Matrix3());
  const xAxis = useRef(new THREE.Vector3());
  const yAxis = useRef(new THREE.Vector3());
  const zAxis = useRef(new THREE.Vector3());
  const rotWorld = useRef(new THREE.Quaternion());
  const rotLocal = useRef(new THREE.Quaternion());
  const userLimbWorld = useRef(new THREE.Vector3());
  const userLimbLocal = useRef(new THREE.Vector3());
  const avatarLimbLocal = useRef(new THREE.Vector3(0, 1, 0));
  const shoulderRotMat = useRef(new THREE.Matrix4());
  const invIdentityMat = useRef(new THREE.Matrix4().invert());
  const spineEuler = useRef(new THREE.Euler());
  const spineQuat = useRef(new THREE.Quaternion());
  const zRotQuat = useRef(new THREE.Quaternion(0, 0, 1, 0));

  useEffect(() => {
    if (!modelRef.current) return;

    // Initialize poseLms array
    poseLms.current = new Array(33);
    for (let i = 0; i < 33; i++) {
      poseLms.current[i] = new THREE.Vector3();
    }

    // Set model scale and position
    modelRef.current.scale.set(3, 3, 3);
    const bbox = new THREE.Box3().setFromObject(modelRef.current);
    const center = bbox.getCenter(new THREE.Vector3());
    
    modelRef.current.position.y = -bbox.min.y + 0.1;
    modelRef.current.position.x = -center.x;
    modelRef.current.position.z = -center.z;

    // Cache bone references
    modelRef.current.traverse((node) => {
      if ((node as THREE.Bone).isBone) {
        const bone = node as THREE.Bone;
        const cleanName = bone.name.replace(/.*:/, ''); // Remove prefixes like Mixamorig:
        
        if (cleanName === 'Spine') bonesRef.current.Spine = bone;
        else if (cleanName === 'Spine1') bonesRef.current.Spine1 = bone;
        else if (cleanName === 'RightArm') bonesRef.current.RightArm = bone;
        else if (cleanName === 'RightForeArm') bonesRef.current.RightForeArm = bone;
        else if (cleanName === 'RightHand') bonesRef.current.RightHand = bone;
        else if (cleanName === 'LeftArm') bonesRef.current.LeftArm = bone;
        else if (cleanName === 'LeftForeArm') bonesRef.current.LeftForeArm = bone;
        else if (cleanName === 'LeftHand') bonesRef.current.LeftHand = bone;
        else if (cleanName === 'RightUpLeg') bonesRef.current.RightUpLeg = bone;
        else if (cleanName === 'RightLeg') bonesRef.current.RightLeg = bone;
        else if (cleanName === 'RightFoot') bonesRef.current.RightFoot = bone;
        else if (cleanName === 'LeftUpLeg') bonesRef.current.LeftUpLeg = bone;
        else if (cleanName === 'LeftLeg') bonesRef.current.LeftLeg = bone;
        else if (cleanName === 'LeftFoot') bonesRef.current.LeftFoot = bone;
      }
    });

    console.log('🦴 Bones cached:', Object.keys(bonesRef.current));
  }, []);

  useEffect(() => {
    if (!modelRef.current) return;
    modelRef.current.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        node.castShadow = shadowsEnabled;
        node.receiveShadow = shadowsEnabled;
      }
    });
  }, [shadowsEnabled]);

  // Helper functions based on Mesekai implementation
  const createShoulderAxes = (landmarkFrom: THREE.Vector3, landmarkTo: THREE.Vector3) => {
    yAxis.current.copy(landmarkTo.clone().sub(landmarkFrom).normalize());
    zAxis.current.copy(landmarkTo.clone().lerp(landmarkFrom, 0.5).negate().normalize());
    xAxis.current.copy(yAxis.current.clone().cross(zAxis.current).normalize());
    axes.current.set(
      xAxis.current.x, yAxis.current.x, zAxis.current.x,
      xAxis.current.y, yAxis.current.y, zAxis.current.y,
      xAxis.current.z, yAxis.current.z, zAxis.current.z
    );
  };

  const createHipAxes = (lHipLm: THREE.Vector3, rHipLm: THREE.Vector3) => {
    xAxis.current.copy(lHipLm.clone().sub(rHipLm).normalize());
    yAxis.current.set(0, -1, 0);
    zAxis.current.copy(xAxis.current.clone().cross(yAxis.current).normalize());
    axes.current.set(
      xAxis.current.x, yAxis.current.x, zAxis.current.x,
      xAxis.current.y, yAxis.current.y, zAxis.current.y,
      xAxis.current.z, yAxis.current.z, zAxis.current.z
    );
  };

  const updateAxes = () => {
    rotWorld.current.setFromUnitVectors(yAxis.current, userLimbWorld.current);
    xAxis.current.applyQuaternion(rotWorld.current);
    yAxis.current.applyQuaternion(rotWorld.current);
    zAxis.current.applyQuaternion(rotWorld.current);
    axes.current.set(
      xAxis.current.x, yAxis.current.x, zAxis.current.x,
      xAxis.current.y, yAxis.current.y, zAxis.current.y,
      xAxis.current.z, yAxis.current.z, zAxis.current.z
    );
  };

  const solveRotation = (
    avatarBone: THREE.Bone | undefined,
    parentLm: THREE.Vector3,
    childLm: THREE.Vector3,
    smoothing: number,
    isHip: boolean = false
  ) => {
    if (!avatarBone) return;

    userLimbWorld.current.copy(childLm.clone().sub(parentLm)).normalize();
    userLimbLocal.current.copy(userLimbWorld.current).applyMatrix3(axes.current.clone().invert()).normalize();
    rotLocal.current.setFromUnitVectors(avatarLimbLocal.current, userLimbLocal.current);

    if (isHip) {
      rotLocal.current.multiplyQuaternions(zRotQuat.current, rotLocal.current);
    }

    avatarBone.quaternion.slerp(rotLocal.current, smoothing);
  };

  useFrame(() => {
    if (!keypointsData || !modelRef.current) return;

    const bones = bonesRef.current;
    if (!bones.Spine || !bones.RightArm || !bones.LeftArm) return;

    // Check if we have world_landmarks data from MediaPipe
    if (!keypointsData.world_landmarks || !Array.isArray(keypointsData.world_landmarks)) {
      return;
    }

    const worldLandmarks = keypointsData.world_landmarks;
    if (worldLandmarks.length < 33) return;

    // Cache landmarks like Mesekai does: negate coordinates for Three.js
    const lms = poseLms.current;
    worldLandmarks.forEach((landmark: number[], lmIdx: number) => {
      if (lmIdx < 33) {
        lms[lmIdx].set(-landmark[0], -landmark[1], -landmark[2]);
      }
    });

    // Animate torso direction (Spine rotation)
    const shoulderX = lms[rSHOULDER].clone().sub(lms[lSHOULDER]).normalize();
    const shoulderY = lms[lSHOULDER].clone().lerp(lms[rSHOULDER], 0.5).normalize();
    const shoulderZ = shoulderX.clone().cross(shoulderY).normalize();
    
    shoulderRotMat.current.set(
      shoulderX.x, shoulderY.x, shoulderZ.x, 0,
      shoulderX.y, shoulderY.y, shoulderZ.y, 0,
      shoulderX.z, shoulderY.z, shoulderZ.z, 0,
      0, 0, 0, 1
    ).multiply(invIdentityMat.current);

    spineEuler.current.setFromRotationMatrix(shoulderRotMat.current);
    spineEuler.current.set(
      spineEuler.current.x / 16,
      spineEuler.current.y / 2,
      spineEuler.current.z / 2
    );
    spineQuat.current.setFromEuler(spineEuler.current);
    
    if (bones.Spine) bones.Spine.quaternion.slerp(spineQuat.current, BODY_SMOOTHING);
    if (bones.Spine1) bones.Spine1.quaternion.slerp(spineQuat.current, BODY_SMOOTHING);

    // User left arm → Avatar right arm (mirror effect)
    createShoulderAxes(lms[rSHOULDER], lms[lSHOULDER]);
    solveRotation(bones.RightArm, lms[lSHOULDER], lms[lELBOW], BODY_SMOOTHING);
    updateAxes();
    solveRotation(bones.RightForeArm, lms[lELBOW], lms[lWRIST], BODY_SMOOTHING);
    lms[lINDEX].lerp(lms[lPINKY], 0.5);
    updateAxes();
    solveRotation(bones.RightHand, lms[lWRIST], lms[lINDEX], BODY_SMOOTHING);

    // User right arm → Avatar left arm (mirror effect)
    createShoulderAxes(lms[lSHOULDER], lms[rSHOULDER]);
    solveRotation(bones.LeftArm, lms[rSHOULDER], lms[rELBOW], BODY_SMOOTHING);
    updateAxes();
    solveRotation(bones.LeftForeArm, lms[rELBOW], lms[rWRIST], BODY_SMOOTHING);
    lms[rINDEX].lerp(lms[rPINKY], 0.5);
    updateAxes();
    solveRotation(bones.LeftHand, lms[rWRIST], lms[rINDEX], BODY_SMOOTHING);

    // Legs - User left leg → Avatar right leg
    createHipAxes(lms[lHIP], lms[rHIP]);
    solveRotation(bones.RightUpLeg, lms[lHIP], lms[lKNEE], BODY_SMOOTHING, true);
    updateAxes();
    solveRotation(bones.RightLeg, lms[lKNEE], lms[lANKLE], BODY_SMOOTHING);
    updateAxes();
    solveRotation(bones.RightFoot, lms[lANKLE], lms[lHEEL], BODY_SMOOTHING);

    // User right leg → Avatar left leg
    createHipAxes(lms[lHIP], lms[rHIP]);
    solveRotation(bones.LeftUpLeg, lms[rHIP], lms[rKNEE], BODY_SMOOTHING, true);
    updateAxes();
    solveRotation(bones.LeftLeg, lms[rKNEE], lms[rANKLE], BODY_SMOOTHING);
    updateAxes();
    solveRotation(bones.LeftFoot, lms[rANKLE], lms[rHEEL], BODY_SMOOTHING);

    modelRef.current.updateMatrixWorld(true);
  });

  return <primitive object={scene} ref={modelRef} />;
};

const Scene = () => {
  const { keypoints } = useWebSocket();
  const { shadowsEnabled, gridEnabled, cameraView } = useSettings();

  const getCameraPosition = (): [number, number, number] => {
    switch (cameraView) {
      case 'front':
        return [0, 2, 9];
      case 'side':
        return [9, 2, 0];
      case 'top':
        return [0, 12, 0.1];
      default:
        return [4, 3, 11];
    }
  };

  return (
    <>
      <color attach="background" args={['#110E0E']} />
      <fog attach="fog" args={['#110E0E', 10, 50]} />

      <ambientLight intensity={0.8} color="#8090a0" />
      <hemisphereLight args={['#90b0ff', '#606060', 0.7]} position={[0, 20, 0]} />
      
      <directionalLight
        position={[-5, 12, 10]}
        intensity={1.1}
        castShadow={shadowsEnabled}
        shadow-mapSize={shadowsEnabled ? [2048, 2048] : [512, 512]}
      />
      <directionalLight position={[10, 8, -10]} intensity={0.7} color="#9090ff" />
      <directionalLight position={[0, 6, -15]} intensity={0.6} color="#c0c0ff" />
      <directionalLight position={[0, 3, 15]} intensity={0.9} color="#fff0e0" />

      <spotLight
        position={[0, 15, 5]}
        angle={Math.PI / 7}
        penumbra={0.4}
        intensity={1.2}
        castShadow={shadowsEnabled}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow={shadowsEnabled}>
        <circleGeometry args={[30, 64]} />
        <meshStandardMaterial color="#202030" roughness={0.7} metalness={0.1} />
      </mesh>

      {gridEnabled && (
        <>
          <gridHelper args={[30, 60, '#555555', '#333333']} position={[0, 0.01, 0]} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
            <ringGeometry args={[1.5, 2.5, 32]} />
            <meshBasicMaterial color="#3b82f6" transparent opacity={0.25} side={THREE.DoubleSide} />
          </mesh>
        </>
      )}

      <Model keypointsData={keypoints} shadowsEnabled={shadowsEnabled} />

      <PerspectiveCamera makeDefault position={getCameraPosition()} fov={50} />
      <OrbitControls
        enableDamping
        dampingFactor={0.1}
        target={[0, 1.5, 0]}
        minDistance={5}
        maxDistance={20}
      />
    </>
  );
};

const ThreeScene = () => {
  return (
    <Canvas 
      shadows 
      style={{ width: '100%', height: '100%' }}
      frameloop="always"
      performance={{ min: 0.5 }}
      gl={{ 
        powerPreference: 'high-performance',
        antialias: true 
      }}
    >
      <Scene />
    </Canvas>
  );
};

export default ThreeScene;
