import { ContactShadows, RoundedBox } from "@react-three/drei";
import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";

const CONTACTS_PER_SIDE = 26;

export function FPGAChip() {
  const contacts = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = contacts.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    let instance = 0;
    for (let side = 0; side < 4; side += 1) {
      for (let index = 0; index < CONTACTS_PER_SIDE; index += 1) {
        const offset = -1.16 + (index / (CONTACTS_PER_SIDE - 1)) * 2.32;
        const alongX = side < 2;
        const sign = side % 2 === 0 ? -1 : 1;
        position.set(alongX ? offset : sign * 1.54, 0.18, alongX ? sign * 1.54 : offset);
        scale.set(alongX ? 0.052 : 0.2, 0.042, alongX ? 0.2 : 0.052);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(instance, matrix);
        instance += 1;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <group position={[0, 0.02, 1.15]}>
      <ContactShadows position={[0, 0.005, 0]} scale={4.8} opacity={0.82} blur={2.2} far={1.5} frames={1} color="#000000" />
      <RoundedBox args={[2.94, 0.12, 2.94]} radius={0.07} smoothness={3} position={[0, 0.06, 0]} receiveShadow>
        <meshPhysicalMaterial color="#061b1d" metalness={0.14} roughness={0.3} clearcoat={0.32} clearcoatRoughness={0.18} envMapIntensity={1.2} />
      </RoundedBox>
      <RoundedBox args={[2.66, 0.3, 2.66]} radius={0.13} smoothness={5} position={[0, 0.25, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color="#090b0d" metalness={0.1} roughness={0.21} clearcoat={0.24} clearcoatRoughness={0.16} envMapIntensity={1.7} specularIntensity={1} />
      </RoundedBox>
      <RoundedBox args={[1.58, 0.18, 1.58]} radius={0.07} smoothness={4} position={[0, 0.49, 0]} castShadow>
        <meshPhysicalMaterial color="#d8f6ff" transmission={0.96} thickness={0.42} ior={1.49} roughness={0.075} metalness={0} clearcoat={0.18} clearcoatRoughness={0.08} specularIntensity={1} envMapIntensity={2.1} attenuationColor="#bcefff" attenuationDistance={2.4} />
      </RoundedBox>
      <RoundedBox args={[1.34, 0.025, 1.34]} radius={0.04} smoothness={2} position={[0, 0.395, 0]}>
        <meshStandardMaterial color="#08252b" emissive={new THREE.Color(0, 0.55, 0.72)} emissiveIntensity={0.42} roughness={0.24} metalness={0.08} />
      </RoundedBox>
      <mesh position={[-1.02, 0.415, 1.02]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.055, 20]} />
        <meshStandardMaterial color="#66747b" metalness={0.45} roughness={0.28} />
      </mesh>
      <instancedMesh ref={contacts} args={[undefined, undefined, CONTACTS_PER_SIDE * 4]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#e6e8e4" metalness={0.8} roughness={0.23} envMapIntensity={2.3} />
      </instancedMesh>
    </group>
  );
}
