import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { WelcomeVisualMode } from "../WelcomeBackground3D";
import type { PcbRoute, RouteSide } from "../utils/routingGenerator";
import { sampleRoute } from "../utils/routingGenerator";

function PulseGroup({ routes, side, mode, reducedMotion }: { routes: PcbRoute[]; side: RouteSide; mode: WelcomeVisualMode; reducedMotion: boolean }) {
  const core = useRef<THREE.InstancedMesh>(null);
  const halo = useRef<THREE.InstancedMesh>(null);
  const pulseRoutes = useMemo(() => routes.filter((route) => route.side === side && route.strength === "active").slice(0, 5), [routes, side]);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }) => {
    if (!core.current || !halo.current || document.hidden) return;
    const activeSide = side === "simulation" ? mode === "simulate" : mode === "build";
    const speedFactor = activeSide || mode === "idle" ? 1 : 0.38;
    pulseRoutes.forEach((route, index) => {
      const time = reducedMotion ? route.phase : route.phase + clock.elapsedTime * route.speed * speedFactor;
      const point = sampleRoute(route.points, time);
      const ahead = sampleRoute(route.points, time + 0.004);
      const rotation = -Math.atan2(ahead[2] - point[2], ahead[0] - point[0]);
      const fade = Math.sin((((time % 1) + 1) % 1) * Math.PI);
      position.set(point[0], point[1] + 0.027, point[2]);
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
      scale.set(0.14 + fade * 0.08, 0.012, 0.026);
      matrix.compose(position, quaternion, scale);
      core.current?.setMatrixAt(index, matrix);
      scale.set(0.24 + fade * 0.12, 0.008, 0.075);
      matrix.compose(position, quaternion, scale);
      halo.current?.setMatrixAt(index, matrix);
    });
    core.current.instanceMatrix.needsUpdate = true;
    halo.current.instanceMatrix.needsUpdate = true;
  });

  const color = side === "build" ? new THREE.Color(1.65, 0.66, 0.14) : new THREE.Color(0.05, 1.45, 2.05);
  return (
    <group position={[0, 0.015, 1.15]}>
      <instancedMesh ref={halo} args={[undefined, undefined, pulseRoutes.length]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.18} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={core} args={[undefined, undefined, pulseRoutes.length]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.82} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}

export function SignalPulses({ routes, mode, reducedMotion }: { routes: PcbRoute[]; mode: WelcomeVisualMode; reducedMotion: boolean }) {
  return (
    <>
      <PulseGroup routes={routes} side="simulation" mode={mode} reducedMotion={reducedMotion} />
      <PulseGroup routes={routes} side="build" mode={mode} reducedMotion={reducedMotion} />
    </>
  );
}
