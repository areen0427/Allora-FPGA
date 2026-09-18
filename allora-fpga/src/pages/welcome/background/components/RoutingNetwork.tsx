import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { WelcomeVisualMode } from "../WelcomeBackground3D";
import type { PcbRoute } from "../utils/routingGenerator";

type Bucket = "physical" | "cyanSoft" | "cyanActive" | "buildSoft" | "amberActive";
type Segment = { position: [number, number, number]; length: number; rotation: number };

function bucketFor(route: PcbRoute): Bucket {
  if (route.strength === "dark" || route.side === "shared") return "physical";
  if (route.side === "build") return route.strength === "active" ? "amberActive" : "buildSoft";
  return route.strength === "active" ? "cyanActive" : "cyanSoft";
}

function segmentsFor(routes: PcbRoute[], bucket: Bucket) {
  const segments: Segment[] = [];
  routes.filter((route) => bucketFor(route) === bucket).forEach((route) => {
    for (let index = 1; index < route.points.length; index += 1) {
      const start = route.points[index - 1];
      const end = route.points[index];
      const dx = end[0] - start[0];
      const dz = end[2] - start[2];
      segments.push({
        position: [(start[0] + end[0]) / 2, start[1], (start[2] + end[2]) / 2],
        length: Math.hypot(dx, dz),
        rotation: -Math.atan2(dz, dx),
      });
    }
  });
  return segments;
}

function applySegments(mesh: THREE.InstancedMesh | null, segments: Segment[], width: number, height: number) {
  if (!mesh) return;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  segments.forEach((segment, index) => {
    position.set(segment.position[0], segment.position[1], segment.position[2]);
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), segment.rotation);
    scale.set(segment.length, height, width);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

export function RoutingNetwork({ routes, mode }: { routes: PcbRoute[]; mode: WelcomeVisualMode }) {
  const physicalRef = useRef<THREE.InstancedMesh>(null);
  const cyanSoftRef = useRef<THREE.InstancedMesh>(null);
  const cyanActiveRef = useRef<THREE.InstancedMesh>(null);
  const buildSoftRef = useRef<THREE.InstancedMesh>(null);
  const amberActiveRef = useRef<THREE.InstancedMesh>(null);
  const groups = useMemo(() => ({
    physical: segmentsFor(routes, "physical"),
    cyanSoft: segmentsFor(routes, "cyanSoft"),
    cyanActive: segmentsFor(routes, "cyanActive"),
    buildSoft: segmentsFor(routes, "buildSoft"),
    amberActive: segmentsFor(routes, "amberActive"),
  }), [routes]);

  useLayoutEffect(() => {
    applySegments(physicalRef.current, groups.physical, 0.018, 0.008);
    applySegments(cyanSoftRef.current, groups.cyanSoft, 0.021, 0.009);
    applySegments(cyanActiveRef.current, groups.cyanActive, 0.026, 0.012);
    applySegments(buildSoftRef.current, groups.buildSoft, 0.021, 0.009);
    applySegments(amberActiveRef.current, groups.amberActive, 0.026, 0.012);
  }, [groups]);

  const simulateBoost = mode === "simulate" ? 1.45 : mode === "build" ? 0.28 : 0.72;
  const buildBoost = mode === "build" ? 1.35 : mode === "simulate" ? 0.22 : 0.58;

  return (
    <group position={[0, 0.015, 1.15]}>
      <instancedMesh ref={physicalRef} args={[undefined, undefined, groups.physical.length]} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#294046" metalness={0.52} roughness={0.31} envMapIntensity={1.15} />
      </instancedMesh>
      <instancedMesh ref={cyanSoftRef} args={[undefined, undefined, groups.cyanSoft.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#31545d" metalness={0.5} roughness={0.28} emissive="#087890" emissiveIntensity={0.12 * simulateBoost} />
      </instancedMesh>
      <instancedMesh ref={cyanActiveRef} args={[undefined, undefined, groups.cyanActive.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#4aaabd" metalness={0.38} roughness={0.24} emissive="#18dfff" emissiveIntensity={1.15 * simulateBoost} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={buildSoftRef} args={[undefined, undefined, groups.buildSoft.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#4b4132" metalness={0.55} roughness={0.3} emissive="#7d4812" emissiveIntensity={0.08 * buildBoost} />
      </instancedMesh>
      <instancedMesh ref={amberActiveRef} args={[undefined, undefined, groups.amberActive.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#a87a3d" metalness={0.48} roughness={0.24} emissive="#ff9e32" emissiveIntensity={0.85 * buildBoost} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
