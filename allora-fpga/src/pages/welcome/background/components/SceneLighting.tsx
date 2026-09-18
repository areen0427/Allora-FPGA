import { Environment, Lightformer } from "@react-three/drei";

export function SceneLighting() {
  return (
    <>
      <Environment frames={1} resolution={256} environmentIntensity={1.15}>
        <color attach="background" args={["#020406"]} />
        <Lightformer form="rect" color="#f6fbff" intensity={6} position={[-5, 6, 4]} rotation={[-0.62, -0.55, -0.22]} scale={[7, 3.4, 1]} />
        <Lightformer form="rect" color="#ffffff" intensity={4.5} position={[0, 8, -1]} rotation={[-Math.PI / 2, 0, 0]} scale={[5.5, 7, 1]} />
        <Lightformer form="rect" color="#e9f4fa" intensity={5.5} position={[7, 3.2, -2]} rotation={[0, -Math.PI / 2, 0]} scale={[1.1, 7, 1]} />
        <Lightformer form="rect" color="#78d9ff" intensity={1.1} position={[-2, 2.2, -10]} rotation={[0, Math.PI, 0]} scale={[8, 1.3, 1]} />
        <Lightformer form="rect" color="#f2b55e" intensity={1.25} position={[8, 1.4, -7]} rotation={[0, -Math.PI / 2, 0]} scale={[0.7, 3.2, 1]} />
      </Environment>
      <ambientLight color="#9fc0d2" intensity={0.07} />
      <hemisphereLight color="#9ac8e0" groundColor="#010203" intensity={0.18} />
      <rectAreaLight position={[-5.5, 7.5, 5]} rotation={[-0.75, -0.35, -0.2]} color="#f2f8ff" intensity={4.5} width={7} height={4.5} />
      <rectAreaLight position={[6, 4.5, 1]} rotation={[-0.85, 0.55, 0.22]} color="#d9eaf2" intensity={0.75} width={4} height={5} />
      <rectAreaLight position={[5, 2.8, -8]} rotation={[-0.3, 0.25, 0]} color="#b9e6ff" intensity={4.8} width={1.1} height={6} />
      <spotLight
        position={[-4.5, 7.2, 4.5]}
        color="#f8fbff"
        intensity={12}
        distance={24}
        angle={0.58}
        penumbra={0.82}
        decay={2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0003}
        shadow-normalBias={0.025}
      />
      <pointLight position={[0, 0.5, 1.1]} color="#35dfff" intensity={0.18} distance={3.2} decay={2} />
      <pointLight position={[7, 0.45, -3.5]} color="#e4a34e" intensity={0.22} distance={4.2} decay={2} />
    </>
  );
}
