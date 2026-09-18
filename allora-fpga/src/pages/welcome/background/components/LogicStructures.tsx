import { RoundedBoxGeometry } from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

type Transform = { position: [number, number, number]; scale: [number, number, number]; rotation?: number };
type Placement = { x: number; z: number; rotation: number; width: number; depth: number; height: number };

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

function rotateOffset(x: number, z: number, rotation: number) {
  return [x * Math.cos(rotation) - z * Math.sin(rotation), x * Math.sin(rotation) + z * Math.cos(rotation)] as const;
}

export function LogicStructures() {
  const icBodies = useRef<THREE.InstancedMesh>(null);
  const metalParts = useRef<THREE.InstancedMesh>(null);
  const ceramicParts = useRef<THREE.InstancedMesh>(null);
  const connectorBodies = useRef<THREE.InstancedMesh>(null);
  const glassSlabs = useRef<THREE.InstancedMesh>(null);

  const data = useMemo(() => {
    const ics: Placement[] = [
      { x: -4.25, z: 1.7, rotation: 0.05, width: 1.05, depth: 0.56, height: 0.24 },
      { x: 4.2, z: 1.45, rotation: -0.04, width: 1.0, depth: 0.54, height: 0.23 },
      { x: -6.4, z: -1.0, rotation: Math.PI / 2, width: 1.15, depth: 0.58, height: 0.25 },
      { x: 6.6, z: -1.35, rotation: Math.PI / 2, width: 1.08, depth: 0.56, height: 0.24 },
      { x: -3.7, z: -3.5, rotation: 0, width: 0.78, depth: 0.7, height: 0.2 },
      { x: 3.8, z: -3.7, rotation: 0, width: 0.8, depth: 0.72, height: 0.2 },
      { x: -7.6, z: -6.2, rotation: 0.08, width: 1.3, depth: 0.62, height: 0.25 },
      { x: 7.5, z: -6.5, rotation: -0.08, width: 1.28, depth: 0.62, height: 0.25 },
      { x: -4.8, z: -9.4, rotation: Math.PI / 2, width: 1.0, depth: 0.54, height: 0.23 },
      { x: 4.9, z: -9.7, rotation: Math.PI / 2, width: 1.0, depth: 0.54, height: 0.23 },
    ];
    const bodyTransforms: Transform[] = ics.map((part) => ({
      position: [part.x, part.height / 2 + 0.03, part.z],
      scale: [part.width, part.height, part.depth],
      rotation: part.rotation,
    }));
    const metalTransforms: Transform[] = [];
    ics.forEach((part) => {
      for (let side = -1; side <= 1; side += 2) {
        for (let pin = 0; pin < 5; pin += 1) {
          const localX = -part.width * 0.36 + pin * part.width * 0.18;
          const localZ = side * (part.depth / 2 + 0.075);
          const [dx, dz] = rotateOffset(localX, localZ, part.rotation);
          metalTransforms.push({
            position: [part.x + dx, 0.055, part.z + dz],
            scale: [0.085, 0.038, 0.14],
            rotation: part.rotation,
          });
        }
      }
    });

    const capacitors = [
      [-2.65, 2.4, 0], [-3.0, 1.9, 0], [2.7, 2.35, 0], [3.05, 1.85, 0],
      [-5.15, -2.7, Math.PI / 2], [5.25, -2.85, Math.PI / 2], [-2.7, -6.0, 0], [2.8, -6.2, 0],
    ] as const;
    const ceramicTransforms: Transform[] = capacitors.map(([x, z, rotation]) => ({ position: [x, 0.13, z], scale: [0.38, 0.18, 0.2], rotation }));
    capacitors.forEach(([x, z, rotation]) => {
      for (const side of [-1, 1]) {
        const [dx, dz] = rotateOffset(side * 0.22, 0, rotation);
        metalTransforms.push({ position: [x + dx, 0.125, z + dz], scale: [0.09, 0.19, 0.205], rotation });
      }
    });

    const crystals = [
      { position: [-5.45, 2.35, 0.13] as [number, number, number], rotation: 0.04 },
      { position: [5.5, 2.25, 0.13] as [number, number, number], rotation: -0.04 },
      { position: [0.1, -4.7, 0.13] as [number, number, number], rotation: 0 },
    ];
    crystals.forEach(({ position: [x, z, y], rotation }) => {
      metalTransforms.push({ position: [x, y, z], scale: [0.72, 0.18, 0.42], rotation });
    });

    const connectors = [
      { x: -8.8, z: -3.7, rotation: Math.PI / 2, width: 1.6, depth: 0.72, height: 0.48 },
      { x: 8.8, z: -4.2, rotation: Math.PI / 2, width: 1.65, depth: 0.72, height: 0.48 },
      { x: 6.8, z: -11.4, rotation: 0, width: 1.8, depth: 0.7, height: 0.44 },
    ];
    const connectorTransforms: Transform[] = connectors.map((part) => ({ position: [part.x, part.height / 2 + 0.03, part.z], scale: [part.width, part.height, part.depth], rotation: part.rotation }));
    connectors.forEach((part) => {
      for (let index = 0; index < 7; index += 1) {
        const localX = -part.width * 0.36 + index * part.width * 0.12;
        const [dx, dz] = rotateOffset(localX, 0, part.rotation);
        metalTransforms.push({ position: [part.x + dx, part.height + 0.045, part.z + dz], scale: [0.055, 0.1, 0.055], rotation: part.rotation });
      }
    });

    const glassTransforms: Transform[] = [
      { position: [-8.8, 1.12, -2.2], scale: [0.12, 2.05, 2.1], rotation: -0.08 },
      { position: [8.7, 1.05, -2.6], scale: [0.12, 1.9, 2.25], rotation: 0.08 },
      { position: [-9.7, 1.25, -7.2], scale: [0.13, 2.35, 1.7], rotation: -0.05 },
      { position: [9.6, 1.18, -7.8], scale: [0.13, 2.15, 1.85], rotation: 0.05 },
      { position: [-7.9, 1.0, -12.5], scale: [0.11, 1.8, 1.55], rotation: -0.03 },
      { position: [7.8, 0.95, -13], scale: [0.11, 1.7, 1.65], rotation: 0.03 },
    ];
    return { bodyTransforms, metalTransforms, ceramicTransforms, connectorTransforms, glassTransforms };
  }, []);

  useLayoutEffect(() => {
    applyTransforms(icBodies.current, data.bodyTransforms);
    applyTransforms(metalParts.current, data.metalTransforms);
    applyTransforms(ceramicParts.current, data.ceramicTransforms);
    applyTransforms(connectorBodies.current, data.connectorTransforms);
    applyTransforms(glassSlabs.current, data.glassTransforms);
  }, [data]);

  return (
    <group>
      <instancedMesh ref={icBodies} args={[undefined, undefined, data.bodyTransforms.length]} castShadow receiveShadow>
        <RoundedBoxGeometry args={[1, 1, 1]} radius={0.08} smoothness={2} />
        <meshPhysicalMaterial color="#08090a" metalness={0.04} roughness={0.3} clearcoat={0.12} envMapIntensity={1.35} />
      </instancedMesh>
      <instancedMesh ref={metalParts} args={[undefined, undefined, data.metalTransforms.length]} castShadow>
        <RoundedBoxGeometry args={[1, 1, 1]} radius={0.08} smoothness={2} />
        <meshStandardMaterial color="#b8bab7" metalness={0.95} roughness={0.21} envMapIntensity={2.1} />
      </instancedMesh>
      <instancedMesh ref={ceramicParts} args={[undefined, undefined, data.ceramicTransforms.length]} castShadow>
        <RoundedBoxGeometry args={[1, 1, 1]} radius={0.09} smoothness={2} />
        <meshPhysicalMaterial color="#30373a" metalness={0.08} roughness={0.32} clearcoat={0.14} />
      </instancedMesh>
      <instancedMesh ref={connectorBodies} args={[undefined, undefined, data.connectorTransforms.length]} castShadow>
        <RoundedBoxGeometry args={[1, 1, 1]} radius={0.07} smoothness={2} />
        <meshPhysicalMaterial color="#07090a" metalness={0.02} roughness={0.36} clearcoat={0.1} envMapIntensity={1.2} />
      </instancedMesh>
      <instancedMesh ref={glassSlabs} args={[undefined, undefined, data.glassTransforms.length]} castShadow>
        <RoundedBoxGeometry args={[1, 1, 1]} radius={0.055} smoothness={3} />
        <meshPhysicalMaterial color="#d9f7ff" transmission={0.97} thickness={0.6} ior={1.49} roughness={0.06} metalness={0} specularIntensity={1} envMapIntensity={2.4} attenuationColor="#b7eaff" attenuationDistance={5} clearcoat={0.15} clearcoatRoughness={0.08} />
      </instancedMesh>
    </group>
  );
}
