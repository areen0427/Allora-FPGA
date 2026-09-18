import { RoundedBox } from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { createSeededRandom } from "../utils/seededRandom";

type Transform = { position: [number, number, number]; scale: [number, number, number]; rotation?: number };

function applyTransforms(mesh: THREE.InstancedMesh | null, transforms: Transform[]) {
  if (!mesh) return;
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  transforms.forEach((transform, index) => {
    position.set(...transform.position);
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), transform.rotation ?? 0);
    scale.set(...transform.scale);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

export function CircuitBoard() {
  const zones = useRef<THREE.InstancedMesh>(null);
  const vias = useRef<THREE.InstancedMesh>(null);
  const pads = useRef<THREE.InstancedMesh>(null);
  const details = useMemo(() => {
    const random = createSeededRandom(0x1ce5);
    const zonesData: Transform[] = Array.from({ length: 26 }, (_, index) => ({
      position: [(random() - 0.5) * 19.5, 0.006, 4.2 - Math.floor(index / 5) * 4.2 + (random() - 0.5) * 0.8],
      scale: [1.2 + random() * 2.3, 0.012, 0.8 + random() * 1.8],
    }));
    const viasData: Transform[] = Array.from({ length: 108 }, () => {
      let x = (random() - 0.5) * 20.5;
      const z = 5.8 - random() * 25;
      if (Math.abs(x) < 2.1 && z > -1.8 && z < 4.1) x += x < 0 ? -2.8 : 2.8;
      const size = 0.045 + random() * 0.028;
      return { position: [x, 0.025, z], scale: [size, 0.018, size] };
    });
    const padsData: Transform[] = Array.from({ length: 72 }, (_, index) => {
      const side = index % 2 === 0 ? -1 : 1;
      return {
        position: [side * (3.3 + random() * 6.7), 0.022, 3 - random() * 20],
        scale: [0.08 + random() * 0.16, 0.012, 0.035 + random() * 0.055],
        rotation: index % 5 === 0 ? Math.PI / 2 : 0,
      };
    });
    return { zonesData, viasData, padsData };
  }, []);

  useLayoutEffect(() => {
    applyTransforms(zones.current, details.zonesData);
    applyTransforms(vias.current, details.viasData);
    applyTransforms(pads.current, details.padsData);
  }, [details]);

  return (
    <group>
      <RoundedBox args={[24, 0.32, 34]} radius={0.16} smoothness={3} position={[0, -0.2, -8]} receiveShadow>
        <meshPhysicalMaterial color="#050a0d" metalness={0.08} roughness={0.34} clearcoat={0.38} clearcoatRoughness={0.2} envMapIntensity={1.15} />
      </RoundedBox>
      <RoundedBox args={[23.82, 0.035, 33.82]} radius={0.12} smoothness={2} position={[0, -0.018, -8]} receiveShadow>
        <meshPhysicalMaterial color="#09151a" metalness={0.06} roughness={0.3} clearcoat={0.42} clearcoatRoughness={0.18} envMapIntensity={1.25} />
      </RoundedBox>
      <mesh position={[0, -0.375, -8]}>
        <boxGeometry args={[23.74, 0.03, 33.72]} />
        <meshStandardMaterial color="#3d2012" metalness={0.58} roughness={0.4} />
      </mesh>
      <instancedMesh ref={zones} args={[undefined, undefined, details.zonesData.length]} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshPhysicalMaterial color="#102228" metalness={0.08} roughness={0.42} clearcoat={0.18} />
      </instancedMesh>
      <instancedMesh ref={vias} args={[undefined, undefined, details.viasData.length]}>
        <cylinderGeometry args={[1, 1, 1, 10]} />
        <meshStandardMaterial color="#b58a50" metalness={0.92} roughness={0.25} envMapIntensity={1.6} />
      </instancedMesh>
      <instancedMesh ref={pads} args={[undefined, undefined, details.padsData.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#967549" metalness={0.88} roughness={0.27} envMapIntensity={1.45} />
      </instancedMesh>
    </group>
  );
}
